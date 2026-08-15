#!/usr/bin/env node
/**
 * Bundle integrity checks, run after every build.
 *
 * The card ships as two self-contained files, the card and the editor. This script checks
 * the real emitted output for code-splitting, stale editor URLs, lost `import.meta.url`,
 * missing query propagation, sourcemap leaks and unpublished files.
 *
 * Usage: `npm run check:bundle` — after `npm run build` or `npx rollup -c`.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

import { parseAst } from 'rollup/parseAst';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

/**
 * The two files each build variant emits.
 */
const VARIANTS = {
  'calendar-card-pro.js': { editor: 'editor.js', label: 'production' },
  'calendar-card-pro-dev.js': { editor: 'editor-dev.js', label: 'dev' },
};

/**
 * The smallest a real build can plausibly be.
 */
const STUB_MAX_BYTES = 10_240;

const errors = [];

/**
 * Record a failure against a file.
 *
 * @param file - File the problem is in
 * @param message - What is wrong, phrased as the consequence
 */
function error(file, message) {
  errors.push(`${file}: ${message}`);
}

/**
 * Walk every node of an AST, depth first.
 *
 * @param node - AST node, or an array of them
 * @param visit - Called with every object node encountered
 */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }

  visit(node);

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    walk(node[key], visit);
  }
}

/**
 * Parse a built file, reporting a parse failure as a check failure.
 *
 * @param code - Module source
 * @param file - File name, for the message
 * @returns The AST, or null if it could not be parsed
 */
function parse(code, file) {
  try {
    return parseAst(code);
  } catch (err) {
    error(file, `could not be parsed as an ES module: ${err.message}`);
    return null;
  }
}

/**
 * Every module specifier a file imports or re-exports, static and dynamic.
 *
 * Dynamic imports with non-literal arguments are covered by the editor URL shape check.
 *
 * @param ast - Parsed module
 * @returns Specifiers, in source order
 */
function importedSpecifiers(ast) {
  const found = [];

  walk(ast.body, (node) => {
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source && typeof node.source.value === 'string') found.push(node.source.value);
        break;
      case 'ImportExpression':
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
          found.push(node.source.value);
        }
        break;
      default:
        break;
    }
  });

  return found;
}

/**
 * Whether a node is `import.meta`.
 *
 * @param node - AST node
 * @returns True for the `import.meta` meta-property
 */
function isImportMeta(node) {
  return (
    node?.type === 'MetaProperty' && node.meta?.name === 'import' && node.property?.name === 'meta'
  );
}

/**
 * Whether a node reads `<object>.<name>`.
 *
 * @param node - AST node
 * @param name - Property name to match
 * @returns True for a non-computed member access of that name
 */
function isMemberNamed(node, name) {
  return node?.type === 'MemberExpression' && !node.computed && node.property?.name === name;
}

/**
 * Whether a node is `new URL(...)`.
 *
 * @param node - AST node
 * @returns True for a construction of the global URL
 */
function isNewUrl(node) {
  return (
    node?.type === 'NewExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'URL'
  );
}

/**
 * Facts about how the card locates its editor, read out of the built card.
 *
 * Shape-based checks survive minification and identifier mangling.
 *
 * @param ast - Parsed card module
 * @returns What the card does: the editor filenames it constructs URLs from, whether
 *   `import.meta.url` survived, and whether a query is read from one URL and written to
 *   another
 */
function editorImportShape(ast) {
  const urlLiterals = [];
  let hasImportMetaUrl = false;
  let readsSearchFromUrl = false;
  let writesSearch = false;

  walk(ast.body, (node) => {
    if (isMemberNamed(node, 'url') && isImportMeta(node.object)) {
      hasImportMetaUrl = true;
    }

    if (isNewUrl(node) && node.arguments[0]?.type === 'Literal') {
      urlLiterals.push(node.arguments[0].value);
    }

    // `new URL(cardUrl).search` — the value being propagated.
    if (isMemberNamed(node, 'search') && isNewUrl(node.object)) {
      readsSearchFromUrl = true;
    }

    // `editorUrl.search = …` — where it is propagated to.
    if (node.type === 'AssignmentExpression' && isMemberNamed(node.left, 'search')) {
      writesSearch = true;
    }
  });

  return { urlLiterals, hasImportMetaUrl, propagatesQuery: readsSearchFromUrl && writesSearch };
}

/**
 * Resolve a relative specifier the way a browser would.
 *
 * Only the file name matters because `dist/` must be flat.
 *
 * @param specifier - Import specifier
 * @returns The file it names
 */
function resolveRelative(specifier) {
  return basename(specifier.split('?')[0].split('#')[0]);
}

/**
 * Identify which build wrote this `dist/`, and assert it wrote exactly its own two files.
 *
 * @param jsFiles - Every `.js` file in `dist/`
 * @returns The variant's card and editor filenames, or null if it could not be identified
 */
function findVariant(jsFiles) {
  const cards = jsFiles.filter((f) => f in VARIANTS);

  if (cards.length === 0) {
    error(
      'dist/',
      'holds no card file — expected calendar-card-pro.js or calendar-card-pro-dev.js. ' +
        'hacs.json pins that name, so nothing would load',
    );
    return null;
  }

  if (cards.length > 1) {
    error(
      'dist/',
      `holds both a dev and a production card (${cards.join(', ')}). release.yml attaches ` +
        'dist/*.js, so the dev build would be published as a release asset — clean dist/ ' +
        'before building',
    );
    return null;
  }

  const card = cards[0];
  const { editor, label } = VARIANTS[card];
  const expected = [card, editor];
  const unexpected = jsFiles.filter((f) => !expected.includes(f));

  // Exactly two files: the card and the matching editor.
  for (const file of unexpected) {
    error(
      `dist/${file}`,
      `is not part of a ${label} build, which emits exactly ${expected.join(' and ')}. ` +
        'Either a build code-split (which is what reintroduces the ?hacstag= double-evaluation ' +
        'trap) or this ran over a dirty dist/. release.yml attaches dist/*.js, so it would be ' +
        'published',
    );
  }

  if (!jsFiles.includes(editor)) {
    error(
      'dist/',
      `holds ${card} but not ${editor}. The card imports the editor by URL at runtime, so ` +
        'nothing fails until someone opens the editor — and then it 404s',
    );
    return null;
  }

  return { card, editor, label };
}

/**
 * Run every check.
 *
 * @returns Nothing; failures are collected in `errors`
 */
function main() {
  let entries;
  try {
    entries = readdirSync(DIST, { withFileTypes: true });
  } catch {
    console.error('dist/ does not exist. Run `npm run build` (or `npx rollup -c`) first.');
    process.exit(1);
  }

  // HACS fetches no subdirectories.
  for (const entry of entries) {
    if (entry.isDirectory()) {
      error(
        `dist/${entry.name}/`,
        'is a directory — HACS fetches no subdirectories, so nothing in it would ever be downloaded',
      );
    }
  }

  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const jsFiles = files.filter((f) => f.endsWith('.js'));

  if (jsFiles.length === 0) {
    console.error('dist/ holds no JavaScript. Run `npm run build` (or `npx rollup -c`) first.');
    process.exit(1);
  }

  // 6. Sourcemaps. Nothing publishes a .map — the release workflow attaches `dist/*.js`,
  // which does not match `*.js.map` — so a reference to one resolves to a 404 in every
  // user's browser.
  for (const file of files) {
    if (file.endsWith('.map')) {
      error(
        `dist/${file}`,
        'is a sourcemap. Sourcemaps are not distributed; check output.sourcemap in rollup.config.mjs',
      );
    }
  }

  const variant = findVariant(jsFiles);

  for (const file of jsFiles) {
    const code = readFileSync(join(DIST, file), 'utf-8');

    if (code.includes('sourceMappingURL')) {
      error(
        `dist/${file}`,
        "contains a sourceMappingURL comment. The .map is not distributed, so this 404s in every user's browser",
      );
    }

    const bytes = Buffer.byteLength(code);
    if (bytes < STUB_MAX_BYTES) {
      error(
        `dist/${file}`,
        `is only ${bytes} B — too small to be a real build, so it is a stub or a facade. Both ` +
          'files are meant to be self-contained bundles; a facade entry is the shape this build ' +
          'deliberately left behind',
      );
    }

    const ast = parse(code, `dist/${file}`);
    if (!ast) continue;

    // Each emitted file is a self-contained bundle.
    for (const specifier of importedSpecifiers(ast)) {
      const target = resolveRelative(specifier);

      if (variant && target === variant.card && file !== variant.card) {
        error(
          `dist/${file}`,
          `imports './${variant.card}', the registered resource. HACS appends ?hacstag= to that ` +
            'URL and relative specifiers drop the query, so the browser would fetch the card a ' +
            'second time as a separate module and evaluate it twice — "NotSupportedError: the ' +
            'name has already been used with this registry". The two separate Rollup builds are ' +
            'what prevent this; one build with code-splitting brings it straight back',
        );
        continue;
      }

      error(
        `dist/${file}`,
        `imports '${specifier}'. Each emitted file is a self-contained bundle and should import ` +
          'nothing — a static import means the build code-split, which is the shape that ' +
          'reintroduces the ?hacstag= double-evaluation trap',
      );
    }

    if (!variant || file !== variant.card) continue;

    const { urlLiterals, hasImportMetaUrl, propagatesQuery } = editorImportShape(ast);

    // The editor URL depends on `import.meta.url` surviving the build.
    if (!hasImportMetaUrl) {
      error(
        `dist/${file}`,
        'does not contain import.meta.url. The card locates the editor relative to its own ' +
          'module URL, and esbuild lowers import.meta to the literal {} unless ' +
          "supported: { 'import-meta': true } is set (target es2017 predates it) — so " +
          'import.meta.url is undefined and the editor can never be fetched. Nothing else in the ' +
          'project can see this: it typechecks, builds, lints and tests clean',
      );
    }

    // Dev and production builds must name their matching editor file.
    if (!urlLiterals.includes(`./${variant.editor}`)) {
      const named = urlLiterals.filter((v) => typeof v === 'string' && v.includes('editor'));
      error(
        `dist/${file}`,
        `never constructs a URL for './${variant.editor}'${named.length ? ` (found ${named.map((v) => `'${v}'`).join(', ')})` : ''}. ` +
          `This is a ${variant.label} build, so it must name the ${variant.label} editor — the ` +
          "replace() entry for './editor-dev.js' in rollup.config.mjs is what rewrites it. A " +
          'mismatch is a dead editor and nothing else: everything builds, and it 404s only when ' +
          'someone opens it',
      );
    }

    // The editor URL must inherit the card's cache-busting query string.
    if (!propagatesQuery) {
      error(
        `dist/${file}`,
        'does not copy its own query string onto the editor URL. HACS serves /hacsfiles/** with ' +
          'max-age=2678400 and appends ?hacstag= to the registered resource only, so without ' +
          'propagation the editor is fetched at a URL that never changes — see editorModuleUrl() ' +
          'in src/utils/editor-url.ts',
      );
    }
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`::error::${message}`);
    }
    console.error(`\n${errors.length} bundle problem${errors.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }

  const sizes = jsFiles
    .sort()
    .map((f) => `${f} (${statSync(join(DIST, f)).size} B)`)
    .join(', ');

  console.log(`Bundle is intact: ${sizes}`);
}

main();
