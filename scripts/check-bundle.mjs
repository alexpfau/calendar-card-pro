#!/usr/bin/env node
/**
 * Bundle integrity checks, run after every build.
 *
 * The card ships as several files now — a facade plus content-hashed chunks — and every
 * way that can go wrong is silent at build time and fatal in a browser. Rollup is happy
 * to emit all of them.
 *
 * The one that matters most is the `?hacstag=` trap. HACS registers the Lovelace
 * resource with a cache-busting query, and a relative import specifier resolves against
 * the importing module's URL **with the query dropped**. So a chunk that imports back
 * from the entry makes the browser fetch the entry a second time, under a URL it has
 * not seen, and evaluate the whole card again:
 *
 *     NotSupportedError: the name "calendar-card-pro" has already been used with this registry
 *
 * — a dead editor, and a card that may not render either. `preserveEntrySignatures:
 * 'strict'` in `rollup.config.mjs` prevents it by emitting a facade entry. This script
 * exists because the reference card that hit this first documented it as a *comment* in
 * its own Rollup config, and a comment is not a check.
 *
 * The rest follow the same rule: never ship a reference to a file we do not publish.
 * That is the lesson of the sourcemap 404s (#315, #358), which shipped for several
 * releases because nothing looked.
 *
 * Checks, all against the real emitted output:
 *
 *   1. The entry is a facade — small, and nothing but relative imports.
 *   2. No emitted file imports the entry filename. (The `?hacstag=` trap.)
 *   3. Every relative specifier resolves to a file that exists in `dist/`.
 *   4. Nothing references a sourcemap, and no `.map` is emitted.
 *   5. `dist/` is flat. HACS fetches no subdirectories, so a nested chunk is
 *      downloaded by nobody and 404s for everybody.
 *   6. Every emitted file is reachable from the entry. Chunk names are content-hashed,
 *      so a build over a dirty `dist/` leaves the previous build's chunks in place —
 *      and `release.yml` attaches `dist/*.js`, which would publish them.
 *
 * Specifiers are read from a real parse rather than by grepping. `rollup/parseAst` is
 * the parser Rollup itself uses and is already installed, so this costs nothing and
 * cannot be fooled by a string literal in minified output that happens to look like an
 * import.
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
 * The largest a facade entry may be.
 *
 * A real facade is one import statement — 41 bytes at the time of writing. The ceiling
 * is generous because the point is to catch a *bundle* landing here, which is two
 * hundred thousand bytes rather than a few hundred, not to police a byte count.
 */
const FACADE_MAX_BYTES = 1024;

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
 * Every relative specifier a module imports, static and dynamic.
 *
 * Dynamic `import()` with a non-literal argument is ignored rather than reported: we
 * emit none, and a bundler that produced one would be doing something this script has
 * no opinion about.
 *
 * @param code - Module source
 * @param file - File name, for the parse error message
 * @returns Specifiers, in source order
 */
function importedSpecifiers(code, file) {
  let ast;
  try {
    ast = parseAst(code);
  } catch (err) {
    error(file, `could not be parsed as an ES module: ${err.message}`);
    return [];
  }

  const found = [];

  /**
   * Walk every node, collecting import and export specifiers.
   *
   * A plain recursive walk rather than a visitor library: the shapes we care about are
   * four node types, and every one of them holds its specifier in `source` or in
   * `ImportExpression.source`.
   *
   * @param node - AST node or array of nodes
   */
  function walk(node) {
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }

    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (node.source && typeof node.source.value === 'string') {
          found.push(node.source.value);
        }
        break;
      case 'ImportExpression':
        if (node.source && node.source.type === 'Literal' && typeof node.source.value === 'string') {
          found.push(node.source.value);
        }
        break;
      default:
        break;
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      walk(node[key]);
    }
  }

  walk(ast.body);
  return found;
}

/**
 * Resolve a relative specifier the way a browser would.
 *
 * Only the file name matters here, because `dist/` is asserted flat and HACS writes
 * every asset into one directory.
 *
 * @param specifier - Import specifier
 * @returns The file it names
 */
function resolveRelative(specifier) {
  return basename(specifier.split('?')[0].split('#')[0]);
}

/**
 * The entry file for the current build.
 *
 * Read from `dist/` rather than assumed, because the dev and production builds emit
 * different names — `calendar-card-pro-dev.js` and `calendar-card-pro.js` — and both
 * must satisfy these checks. Hashed chunks are excluded by shape: a chunk name always
 * carries a `-<hash>` suffix.
 *
 * @param files - Every `.js` file in `dist/`
 * @returns The entry file name
 */
function findEntry(files) {
  const candidates = files.filter((f) => f === 'calendar-card-pro.js' || f === 'calendar-card-pro-dev.js');

  if (candidates.length !== 1) {
    error(
      'dist/',
      candidates.length === 0
        ? 'holds no entry file — expected calendar-card-pro.js or calendar-card-pro-dev.js. ' +
            'hacs.json pins that name, so nothing would load'
        : `holds both a dev and a production entry (${candidates.join(', ')}). ` +
            'Stale output from an earlier build would be published as a release asset — ' +
            'clean dist/ before building',
    );
    return candidates[0];
  }

  return candidates[0];
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

  // 5. Flat namespace. HACS writes release assets into one directory and fetches no
  // subdirectories, so anything nested is unreachable in production even though it
  // resolves perfectly on disk here.
  for (const entry of entries) {
    if (entry.isDirectory()) {
      error(`dist/${entry.name}/`, 'is a directory — HACS fetches no subdirectories, so nothing in it would ever be downloaded');
    }
  }

  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const jsFiles = files.filter((f) => f.endsWith('.js'));

  if (jsFiles.length === 0) {
    console.error('dist/ holds no JavaScript. Run `npm run build` (or `npx rollup -c`) first.');
    process.exit(1);
  }

  // 4. Sourcemaps. Nothing publishes a .map — the release workflow attaches `dist/*.js`,
  // which does not match `*.js.map` — so a reference to one resolves to a 404 in every
  // user's browser.
  for (const file of files) {
    if (file.endsWith('.map')) {
      error(`dist/${file}`, 'is a sourcemap. Sourcemaps are not distributed; check output.sourcemap in rollup.config.mjs');
    }
  }

  const entryFile = findEntry(jsFiles);
  const present = new Set(files);

  // Which files each file imports, so reachability can be walked once every file has
  // been read and parsed.
  const graph = new Map();

  for (const file of jsFiles) {
    const code = readFileSync(join(DIST, file), 'utf-8');

    if (code.includes('sourceMappingURL')) {
      error(`dist/${file}`, 'contains a sourceMappingURL comment. The .map is not distributed, so this 404s in every user\'s browser');
    }

    const specifiers = importedSpecifiers(code, `dist/${file}`);
    graph.set(file, specifiers.filter((s) => s.startsWith('.')).map(resolveRelative));

    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) {
        error(
          `dist/${file}`,
          `imports '${specifier}', which is a bare specifier — nothing resolves it in a browser`,
        );
        continue;
      }

      const target = resolveRelative(specifier);

      // 2. The `?hacstag=` trap. Only the entry is registered as a Lovelace resource and
      // only the entry carries the query, so it is the only file whose double-fetch
      // re-evaluates the card. Chunks importing each other is normal and correct.
      if (target === entryFile && file !== entryFile) {
        error(
          `dist/${file}`,
          `imports './${entryFile}', the registered resource. HACS appends ?hacstag= to that ` +
            'URL and relative specifiers drop the query, so the browser would fetch the entry ' +
            'a second time as a separate module and evaluate the card twice — ' +
            '"NotSupportedError: the name has already been used with this registry". ' +
            'preserveEntrySignatures: \'strict\' in rollup.config.mjs is what prevents this',
        );
      }

      // 3. Never ship a reference to a file we do not publish.
      if (!present.has(target)) {
        error(`dist/${file}`, `imports './${target}', which the build did not emit — it would 404`);
      }
    }

    if (file !== entryFile) continue;

    // 1. The entry must stay a facade. If the bundle lands here, the split has silently
    // stopped happening and check 2 has nothing left to catch.
    const bytes = Buffer.byteLength(code);
    if (bytes > FACADE_MAX_BYTES) {
      error(
        `dist/${file}`,
        `is ${bytes} B, over the ${FACADE_MAX_BYTES} B facade ceiling — the entry should be a ` +
          'stub that imports a hashed chunk. Check preserveEntrySignatures in rollup.config.mjs',
      );
    }

    if (specifiers.length === 0) {
      error(`dist/${file}`, 'imports nothing — the entry is a facade and must import the main chunk');
    }
  }

  // 6. Nothing orphaned. A chunk no one imports is dead weight in the release and, more
  // to the point, is evidence that this build ran over a dirty dist/ — in which case the
  // *live* chunks may be stale too.
  const reachable = new Set();
  const queue = entryFile ? [entryFile] : [];

  while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);

    for (const target of graph.get(file) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }

  for (const file of jsFiles) {
    if (!reachable.has(file)) {
      error(
        `dist/${file}`,
        `is not reachable from ${entryFile} — it is either left over from an earlier build ` +
          '(chunk names are content-hashed, so builds do not overwrite each other) or emitted ' +
          'and never imported. release.yml attaches dist/*.js, so it would be published',
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
