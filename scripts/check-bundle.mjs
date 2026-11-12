#!/usr/bin/env node
/**
 * Bundle integrity checks, run after every build.
 *
 * The card ships as two self-contained files, the card and the editor. This script checks
 * the real emitted output for code-splitting, stale editor URLs, lost `import.meta.url`,
 * missing query propagation, sourcemap leaks, unpublished files, and syntax and regular
 * expressions Safari 15 cannot parse.
 *
 * Usage: `npm run check:bundle` — after `npm run build` or `npx rollup -c`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

import { parse as parseAcorn } from 'acorn';
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
 * Whether a regular expression pattern holds a lookbehind group, `(?<=` or `(?<!`.
 *
 * Read token by token rather than searched for as text, so an escaped `\(\?<=` or a `(?<=`
 * inside a character class is not taken for a group. A named group, `(?<name>`, is not a
 * lookbehind and Safari has parsed it since 11.1.
 *
 * @param pattern - Pattern source, without the slashes or flags
 * @returns True when the pattern opens a lookbehind
 */
function hasLookbehind(pattern) {
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === '\\') {
      i++;
      continue;
    }

    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }

    if (char === '[') {
      inClass = true;
      continue;
    }

    if (char === '(' && pattern.startsWith('?<', i + 1)) {
      const next = pattern[i + 3];
      if (next === '=' || next === '!') return true;
    }
  }

  return false;
}

/**
 * The globals a bundle can reach a constructor through other than by its bare name.
 *
 * Only these, because any other receiver may be an object of a dependency's own with a method
 * that merely shares the name. An alias of one of these (`const g = globalThis`) is missed.
 */
const GLOBAL_RECEIVERS = new Set(['globalThis', 'window', 'self']);

/**
 * The name a member expression reads, dotted or as a fixed computed string.
 *
 * @param node - A MemberExpression
 * @returns The property name, or undefined when it is computed at runtime
 */
function propertyName(node) {
  if (!node.computed) return node.property?.name;
  const { property } = node;
  return property?.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}

/**
 * Whether a node names a global: bare, or read off `globalThis`, `window` or `self`.
 *
 * @param node - AST node
 * @param name - The global's name
 * @returns True for `name`, `globalThis.name` and `globalThis['name']`, and the same on
 *   `window` and `self`
 */
function isGlobal(node, name) {
  if (node?.type === 'Identifier') return node.name === name;
  return (
    node?.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    GLOBAL_RECEIVERS.has(node.object.name) &&
    propertyName(node) === name
  );
}

/**
 * Whether a template is tagged with the global `String.raw`.
 *
 * @param node - AST node
 * @returns True for String.raw`…`, globalThis.String.raw`…` and their computed forms
 */
function isStringRaw(node) {
  return (
    node?.type === 'TaggedTemplateExpression' &&
    node.tag?.type === 'MemberExpression' &&
    propertyName(node.tag) === 'raw' &&
    isGlobal(node.tag.object, 'String')
  );
}

/**
 * The fixed text of a pattern argument, split wherever a part is known only at runtime.
 *
 * Follows what a minifier leaves behind: a string, a template literal (`String.raw` among
 * them) with its substitutions read the same way, and `+` joins of those. Anything else is a
 * gap, so a fragment is read only as far as the source fixes it.
 *
 * @param node - The argument passed as the pattern
 * @returns The fixed fragments, and whether together they are the whole pattern
 */
function patternFragments(node) {
  const segments = [];

  const template = ({ quasis, expressions }, text) => {
    quasis.forEach((element, index) => {
      if (index > 0) collect(expressions[index - 1]);
      segments.push(text(element.value));
    });
  };

  const collect = (part) => {
    if (part?.type === 'Literal' && typeof part.value === 'string') {
      segments.push(part.value);
    } else if (part?.type === 'TemplateLiteral') {
      template(part, (value) => value.cooked ?? null);
    } else if (isStringRaw(part)) {
      template(part.quasi, (value) => value.raw);
    } else if (part?.type === 'BinaryExpression' && part.operator === '+') {
      collect(part.left);
      collect(part.right);
    } else {
      segments.push(null);
    }
  };

  collect(node);

  const fragments = [''];
  for (const segment of segments) {
    if (segment === null) fragments.push('');
    else fragments[fragments.length - 1] += segment;
  }

  return { fragments: fragments.filter(Boolean), complete: !segments.includes(null) };
}

/**
 * Every regular expression in a file: its literals, and every call or construction of the
 * global `RegExp` with as much of its pattern as the source fixes.
 *
 * The two fail differently on a browser that cannot parse the pattern. A literal is compiled
 * when the file is parsed, so the whole file fails to load; a call throws only when it runs.
 * What a call assembles at runtime cannot be read here, which is why each call reports
 * whether its fragments are the whole pattern.
 *
 * @param ast - Parsed module
 * @returns Each expression's kind, fixed fragments and completeness, in source order
 */
function regularExpressions(ast) {
  const found = [];

  walk(ast.body, (node) => {
    if (node.type === 'Literal' && node.regex) {
      found.push({ kind: 'literal', fragments: [node.regex.pattern], complete: true });
      return;
    }

    if (
      (node.type === 'NewExpression' || node.type === 'CallExpression') &&
      isGlobal(node.callee, 'RegExp')
    ) {
      const [pattern] = node.arguments;
      // A literal passed in is read as a literal in its own right.
      if (pattern?.type === 'Literal' && pattern.regex) return;
      // No argument at all is the empty pattern, read in full.
      found.push(
        node.arguments.length === 0
          ? { kind: 'call', fragments: [], complete: true }
          : { kind: 'call', ...patternFragments(pattern) },
      );
    }
  });

  return found;
}

/**
 * The fragments of an expression that open a lookbehind.
 *
 * @param expression - One entry from `regularExpressions`
 * @returns The fragments holding one, usually none
 */
function lookbehindFragments(expression) {
  return expression.fragments.filter(hasLookbehind);
}

/**
 * One of every case the lookbehind scan has to tell apart: the source, what the scan must
 * read there (kind, whether in full, and the fixed fragments), and whether that holds a
 * lookbehind.
 *
 * Run before the scan, because a scan that stopped seeing regular expressions — a parser
 * that changed how it reports a literal, say — would otherwise report every bundle clean. The
 * reading is compared as well as the verdict, so a case that is caught for the wrong reason,
 * or counted in the wrong column, fails too.
 */
const LOOKBEHIND_SELF_TEST = [
  ['/(?<=x)y/', ['literal full: (?<=x)y'], true],
  ['new RegExp("(?<!p)q", "u")', ['call full: (?<!p)q'], true],
  ['RegExp(`(?<=z)`)', ['call full: (?<=z)'], true],
  ['RegExp(`\\x28?<=e)`)', ['call full: (?<=e)'], true],
  ['globalThis.RegExp("(?<=m)")', ['call full: (?<=m)'], true],
  ['window["RegExp"]("(?<=w)")', ['call full: (?<=w)'], true],
  ['new RegExp(String.raw`(?<=r)\\d`)', ['call full: (?<=r)\\d'], true],
  ['RegExp(globalThis.String.raw`(?<=s)\\d`)', ['call full: (?<=s)\\d'], true],
  ['RegExp("(?<" + "=c)")', ['call full: (?<=c)'], true],
  ['new RegExp(`(?<=t)${v}`)', ['call part: (?<=t)'], true],
  ['RegExp(`a${"(?<=n)" + v}b`)', ['call part: a(?<=n) | b'], true],
  ['new RegExp(/(?<=l)/)', ['literal full: (?<=l)'], true],
  ['/\\[(?<=k)/', ['literal full: \\[(?<=k)'], true],
  ['/(?<name>n)/', ['literal full: (?<name>n)'], false],
  ['/[(?<=]\\(\\?<!/', ['literal full: [(?<=]\\(\\?<!'], false],
  ['"(?<=a string, never compiled)"', [], false],
  ['obj.RegExp("(?<=o)")', [], false],
  ['new RegExp(v + "a")', ['call part: a'], false],
  ['RegExp(...v)', ['call part: '], false],
  ['RegExp()', ['call full: '], false],
];

/**
 * How the self-test writes down what the scan read.
 *
 * @param expression - One entry from `regularExpressions`
 * @returns For example `call part: a(?<=n) | b`
 */
function describeExpression({ kind, fragments, complete }) {
  return `${kind} ${complete ? 'full' : 'part'}: ${fragments.join(' | ')}`;
}

/**
 * Check the lookbehind scan against `LOOKBEHIND_SELF_TEST`.
 *
 * @returns True when every case read and judged as it should; a failure is collected in
 *   `errors`
 */
function lookbehindScanWorks() {
  const failures = [];

  for (const [source, read, holds] of LOOKBEHIND_SELF_TEST) {
    let ast;
    try {
      ast = parseAst(`v(${source});`);
    } catch {
      failures.push(`${source} does not parse`);
      continue;
    }

    const expressions = regularExpressions(ast);
    const got = expressions.map(describeExpression);
    const found = expressions.some((expression) => lookbehindFragments(expression).length > 0);

    if (got.join('\n') !== read.join('\n') || found !== holds) {
      failures.push(
        `${source} read as [${got.join(', ')}] ${found ? 'with' : 'without'} a lookbehind, ` +
          `where it must read [${read.join(', ')}] ${holds ? 'with' : 'without'} one`,
      );
    }
  }

  if (failures.length === 0) return true;

  error(
    'scripts/check-bundle.mjs',
    'the lookbehind scan failed its self-test, so its silence about the bundle would prove ' +
      `nothing: ${failures.join('; ')}`,
  );
  return false;
}

/**
 * Report every lookbehind in a built file.
 *
 * Safari before 16.4 cannot parse one, and iPhones and iPads that stop at iOS 15 still run
 * such a Safari (#735). `tests/regex-lookbehind.test.ts` keeps `src/` free of them; this
 * catches one a dependency or the build brings in, which that test cannot see.
 *
 * Strict on purpose: a support test that tries a lookbehind inside try/catch is harmless and
 * still fails here. The check cannot tell such a test from a pattern the code relies on, so
 * one has to be read and excepted here deliberately.
 *
 * @param file - Path for the message, `dist/…`
 * @param expressions - The file's regular expressions, from `regularExpressions`
 * @returns Nothing; failures are collected in `errors`
 */
function checkLookbehinds(file, expressions) {
  for (const expression of expressions) {
    for (const fragment of lookbehindFragments(expression)) {
      const shown = fragment.length > 80 ? `${fragment.slice(0, 77)}...` : fragment;

      error(
        file,
        expression.kind === 'literal'
          ? `contains the regular expression /${shown}/, which has a lookbehind. Safari before ` +
              '16.4 cannot parse one, so on an iPhone or iPad that stops at iOS 15 this whole ' +
              'file fails to load. tests/regex-lookbehind.test.ts keeps src/ free of them, so ' +
              'look first at a dependency the build bundles'
          : `builds a RegExp from '${shown}', which has a lookbehind. Safari before 16.4 ` +
              'throws a SyntaxError wherever that runs, on an iPhone or iPad that stops at ' +
              'iOS 15. tests/regex-lookbehind.test.ts keeps src/ free of them, so look first ' +
              'at a dependency the build bundles. Even a support test inside try/catch fails ' +
              'this check, which cannot tell one apart: read it, and except it here on purpose',
      );
    }
  }
}

/**
 * The newest ECMAScript edition whose grammar Safari 15 parses, bar two exceptions: a class
 * static block, which Safari first parsed in 16.4 and `syntaxBeyondSafari15` looks for
 * separately, and a regular expression lookbehind, which has its scan above.
 *
 * A bound by edition rather than a list of constructs, so syntax nobody has written yet is
 * covered too: whatever a later edition adds fails to parse here.
 */
const SYNTAX_FLOOR = 2022;

/**
 * Whatever in a file Safari 15 cannot parse, as acorn reads it: syntax newer than
 * `SYNTAX_FLOOR`, regular expression literals included (a `v` flag, inline modifiers,
 * duplicate group names), and any class static block.
 *
 * The build lowers `src/` to ES2021, static blocks among the rest, but bundles its
 * dependencies as they are written, and esbuild passes a regular expression literal through
 * as written too. Either can bring such syntax in without anything else noticing.
 *
 * @param code - Module source
 * @returns What was found, each phrased for a message; empty when Safari 15 parses the file
 */
function syntaxBeyondSafari15(code) {
  let ast;
  try {
    ast = parseAcorn(code, { ecmaVersion: SYNTAX_FLOOR, sourceType: 'module' });
  } catch (err) {
    const at = typeof err.pos === 'number' ? err.pos : 0;
    const near = code.slice(Math.max(0, at - 30), at + 50).replace(/\s+/g, ' ');
    return [`syntax newer than ES${SYNTAX_FLOOR} (${err.message}, near '${near}')`];
  }

  const found = [];
  walk(ast.body, (node) => {
    if (node.type === 'StaticBlock') {
      const near = code.slice(node.start, node.start + 50).replace(/\s+/g, ' ');
      found.push(`a class static block ('${near}'), which Safari first parsed in 16.4`);
    }
  });
  return found;
}

/**
 * Every call or construction of the global `RegExp`, with as much of its pattern and of its
 * flags as the source fixes. A literal passed as the pattern counts too, since flags passed
 * beside it replace its own; its pattern is part of the file, which acorn has read already.
 *
 * @param ast - Parsed module
 * @returns Each call's pattern (null for a literal) and flags, as `patternFragments` reads them
 */
function regExpCalls(ast) {
  const found = [];

  walk(ast.body, (node) => {
    if (
      (node.type !== 'NewExpression' && node.type !== 'CallExpression') ||
      !isGlobal(node.callee, 'RegExp')
    ) {
      return;
    }
    const [pattern, flags] = node.arguments;
    found.push({
      pattern:
        pattern?.type === 'Literal' && pattern.regex
          ? null
          : pattern === undefined
            ? { fragments: [], complete: true }
            : patternFragments(pattern),
      flags: flags === undefined ? { fragments: [], complete: true } : patternFragments(flags),
    });
  });

  return found;
}

/**
 * A pattern and flags written as the literal that compiles to the same expression: a `/` not
 * already escaped is escaped, and so is a line break, neither of which a literal can hold.
 *
 * @param pattern - The pattern, as the call passes it
 * @param flags - Its flags
 * @returns The literal's source
 */
function asLiteral(pattern, flags) {
  let body = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      body += ch + (pattern[i + 1] ?? '');
      i++;
    } else if (ch === '/') {
      body += '\\/';
    } else if (ch === '\n') {
      body += '\\n';
    } else if (ch === '\r') {
      body += '\\r';
    } else if (ch === '\u2028' || ch === '\u2029') {
      body += ch === '\u2028' ? '\\u2028' : '\\u2029';
    } else {
      body += ch;
    }
  }
  return `/${body || '(?:)'}/${flags}`;
}

/**
 * The `RegExp` calls Safari 15 cannot run: any whose flags hold a fixed `v`, which Safari first
 * accepted in 17.0, and any whose pattern and flags the source fixes entirely and acorn will
 * not compile at `SYNTAX_FLOOR`, which is how inline modifiers or a repeated group name built
 * this way are caught. A lookbehind compiles at that edition, and has its own scan.
 *
 * Calls are the form that slips past `syntaxBeyondSafari15`, and the toolchain writes one
 * itself: esbuild turns a `/…/v` literal in `src/` into `new RegExp("…", "v")`, since the
 * build targets ES2021, which has no such flag. A pattern assembled at runtime is read only
 * where the source fixes all of it, and flags only in their fixed parts.
 *
 * @param calls - The file's calls, from `regExpCalls`
 * @returns What was found, each phrased for a message
 */
function regExpCallsBeyondSafari15(calls) {
  const found = [];

  for (const { pattern, flags } of calls) {
    const text = pattern ? pattern.fragments.join(' … ') : '';
    const shown = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    const from = pattern ? `from '${shown}'` : 'from a regular expression literal';

    if (flags.fragments.some((fragment) => fragment.includes('v'))) {
      found.push(
        `builds a RegExp ${from} with the v flag. Safari before 17.0 throws a ` +
          'SyntaxError wherever that runs, on an iPhone or iPad that stops at iOS 15 or 16. ' +
          'esbuild writes a /…/v literal in src/ this way, since the build targets ES2021: ' +
          'write the pattern without the flag',
      );
      continue;
    }

    if (!pattern?.complete || !flags.complete) continue;
    try {
      parseAcorn(`(${asLiteral(pattern.fragments.join(''), flags.fragments.join(''))});`, {
        ecmaVersion: SYNTAX_FLOOR,
      });
    } catch (err) {
      found.push(
        `builds a RegExp ${from} that is newer than ES${SYNTAX_FLOOR} ` +
          `(${err.message}). Safari 15 throws a SyntaxError wherever that runs, on an iPhone ` +
          'or iPad that stops at iOS 15',
      );
    }
  }

  return found;
}

/**
 * One of every case the syntax checks have to tell apart: the source, and whether Safari 15
 * parses and runs it. Run first, for the reason `LOOKBEHIND_SELF_TEST` is: a check that
 * stopped seeing anything would otherwise report every bundle clean. The passing half
 * matters as much, since it pins ES2022 syntax Safari 15 has, which a lower floor would
 * reject for nothing, and patterns a careless rewrite into a literal would break.
 */
const SYNTAX_SELF_TEST = [
  ['class A { static { A.x = 1; } }', false],
  ['const r = /a/v;', false],
  ['const r = /(?i:a)b/;', false],
  ['const r = /(?<y>a)|(?<y>b)/;', false],
  ['import j from "./j.json" with { type: "json" };', false],
  ['new RegExp("[\\\\p{L}--a]", "v");', false],
  ['RegExp(`b`, `gv`);', false],
  ['new RegExp(/a/, "v");', false],
  ['new RegExp("a", "v" + flags);', false],
  ['RegExp("a", `g${flags}v`);', false],
  ['new RegExp("(?i:a)b");', false],
  ['globalThis.RegExp("(?<y>a)|(?<y>b)", "g");', false],
  ['class A { x = 1; #p = 2; static s = 3; static #q() {} has(o) { return #p in o; } }', true],
  ['a ??= b?.c ?? 1n;', true],
  ['await import("./x.js");', true],
  ['const r = /(?<n>a)\\k<n>/dgsuy;', true],
  ['new RegExp("c", "u"); RegExp("d", flags); new RegExp(/e/, "g");', true],
  ['new RegExp("a/b[/]\\n", "u"); RegExp(""); RegExp(`x${v}y`);', true],
  ['new RegExp("(?<=a)b");', true],
];

/**
 * Check `syntaxBeyondSafari15` and `regExpCallsBeyondSafari15` against `SYNTAX_SELF_TEST`.
 *
 * @returns True when every case was judged as it should be; a failure is collected in
 *   `errors`
 */
function syntaxCheckWorks() {
  const failures = [];

  for (const [source, parses] of SYNTAX_SELF_TEST) {
    const problems = syntaxBeyondSafari15(source);
    try {
      problems.push(...regExpCallsBeyondSafari15(regExpCalls(parseAst(source))));
    } catch {
      // Newer than rollup's parser reads; acorn's verdict above stands on its own.
    }
    const judged = problems.length === 0;
    if (judged !== parses) {
      failures.push(
        `${source} was judged ${judged ? 'parseable' : 'unparseable'} by Safari 15, where it ` +
          `is ${parses ? 'parseable' : 'not'}${problems.length ? ` (${problems.join('; ')})` : ''}`,
      );
    }
  }

  if (failures.length === 0) return true;

  error(
    'scripts/check-bundle.mjs',
    'the syntax check failed its self-test, so its silence about the bundle would prove ' +
      `nothing: ${failures.join('; ')}`,
  );
  return false;
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
 * The four transfer sizes `docs/guide/installation.md` quotes.
 *
 * The page tells someone deciding whether to gzip by hand exactly what they save, so the
 * numbers have to be the numbers this build actually emits. They are prose, and prose does
 * not fail: both raw figures sat a kilobyte low because the bundle had grown since they
 * were written, and nothing anywhere noticed. Deriving them here means the build that
 * changes a size is the build that reports the stale sentence.
 *
 * Each entry names the sentence to read the pair out of and how to weigh the files. A
 * pattern that stops matching is itself a failure: reword the page and this check would
 * otherwise go quiet while still reporting success.
 *
 * The two claims are held to different standards, because only one of them is reproducible.
 * A build's byte count is the same everywhere, so the uncompressed pair is exact. Deflate
 * output is not: the same bytes at the same level measured 57,860 under Node 25 (zlib-ng)
 * and 58,448 under Node 22 (zlib 1.3.1), and the page's own `gzip -9` gave 57,881
 * under Apple gzip — a ~1% spread that happens to straddle a kilobyte, so the honest figure
 * is 57 or 58 depending on who is asking. The published pair is the one a Linux host gives,
 * since that is what Home Assistant runs on; the tolerance absorbs the rest. This is not
 * slack for drift — a bundle that grows past a kilobyte of headroom still fails.
 */
const DOC_SIZES = {
  path: join(ROOT, 'docs', 'guide', 'installation.md'),
  files: ['calendar-card-pro.js', 'editor.js'],
  claims: [
    {
      what: 'uncompressed',
      pattern: /the card transfers at its full\s+(\d+)\s*KB and the editor at\s+(\d+)\s*KB/,
      tolerance: 0,
      measure: (file) => statSync(join(DIST, file)).size,
    },
    {
      what: 'gzipped',
      pattern: /brings the card to\s+(\d+)\s*KB and the editor to\s+(\d+)\s*KB/,
      tolerance: 1,
      measure: (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length,
    },
  ],
};

/**
 * Check the installation page's transfer sizes against the emitted files.
 *
 * Quoted in whole kilobytes, truncated — 191,767 bytes reads as 191 KB — so a change has to
 * cross a kilobyte before it is worth reporting.
 *
 * @returns Nothing; failures are collected in `errors`
 */
function checkDocumentedSizes() {
  const label = 'docs/guide/installation.md';

  // The page quotes the released pair; a dev-only build has nothing to compare against.
  if (!DOC_SIZES.files.every((file) => existsSync(join(DIST, file)))) return;

  let page;
  try {
    page = readFileSync(DOC_SIZES.path, 'utf8');
  } catch {
    error(label, 'is missing, so the transfer sizes it publishes cannot be checked');
    return;
  }

  for (const { what, pattern, tolerance, measure } of DOC_SIZES.claims) {
    const found = page.match(pattern);
    if (!found) {
      error(
        label,
        `no longer states the ${what} size of both files in a form this check can read. The ` +
          'sentence moved or was reworded — update the matching pattern in ' +
          'scripts/check-bundle.mjs, because a check that cannot find its subject reports ' +
          'success forever',
      );
      continue;
    }

    for (const [index, file] of DOC_SIZES.files.entries()) {
      const claimed = Number(found[index + 1]);
      const actual = Math.floor(measure(file) / 1000);
      if (Math.abs(claimed - actual) > tolerance) {
        error(
          label,
          `says ${file} is ${claimed} KB ${what}; this build emits ${actual} KB` +
            (tolerance > 0 ? `, beyond the ${tolerance} KB allowed for compressor spread` : '') +
            `. Change the figure to ${actual}`,
        );
      }
    }
  }
}

/**
 * The headline size reductions the release surfaces quote against v3.6.0.
 *
 * Splitting the editor out is the release's marketing claim, so four surfaces put a
 * percentage in front of the reader — the README bullet HACS renders, the same bullet in the
 * archive, and the release notes twice. Unlike the installation page's kilobytes, nothing
 * derived them: they were measured by hand once and typed in. That is exactly how they went
 * stale. The gzip figure was 41.78% when it was written and read `42`; the card has grown
 * several hundred compressed bytes since, dropping it just below 41 while all four surfaces
 * still said 42 — overstating the benefit, which is the direction that misleads.
 *
 * Since v5.1.0 there are three: the README's bullet went when the landing page's retention rule
 * dropped v4.0 from its What's New, so its site is gone. The archive and the release notes keep
 * v4.0 for good, and their sites stay.
 *
 * The baseline is v3.6.0's published asset. It is tagged and released, so its bytes can never
 * change and are frozen here rather than downloaded: 351,905 raw, 98,613 compressed.
 *
 * That compressed baseline is deliberately Node's own zlib at level 9 — the identical call
 * this check makes on the new build — because a percentage only means anything when both of
 * its numbers come from one compressor. Deflate output is not reproducible across zlib
 * builds: that same v3.6.0 file is 98,613 bytes under Node 22's zlib and 98,184 under Apple's
 * gzip. Divide one implementation's baseline into another's build and the answer moves a full
 * point, which is enough to change the published figure. Measured consistently, every
 * implementation agrees on 41%, so the point of tolerance below is headroom for a zlib this
 * check has not met yet — not slack for pairing two of them.
 *
 * Percentages round rather than truncate, matching how the published figures were written.
 * Raw byte counts are identical everywhere, so that arm is exact — note it sits at 45.51%,
 * a hair above the 45.5 that rounds to 46, so a few dozen bytes of growth will flip it to 45
 * and this check will say so. That is the check working.
 *
 * 🚨 **`published` is what stops a moving oracle rewriting history.** These five sentences
 * describe the bundle that shipped as one particular version, and that bundle can never
 * change: `release.yml` fed this very file through `extract-release-notes.mjs` into a
 * GitHub release body which is now frozen and public. Measuring them against the working
 * tree made every later bundle growth demand an edit to a shipped release's notes — the
 * docs site would say 39% while the published release permanently said 41%, and v4.0.0's
 * notes would stop being true about v4.0.0. AGENTS.md says both halves outright:
 * RELEASE_NOTES.md is "a record of what was announced at the time; not rewritten", and the
 * two What's New surfaces are release-PR work that a feature PR must not touch.
 *
 * So while `published` is set the figures are asserted against it and the build is never
 * measured. The check keeps its teeth — an accidental edit to any of the five still fails —
 * but against a constant rather than against whatever the tree happens to weigh today.
 *
 * The measuring path is not gone, because it is genuinely valuable exactly once: while a
 * release is being prepared and the figure is being written. Set `published: null` then,
 * and every site is verified against the build being released. Freeze it again, with the
 * measured numbers, as part of cutting that release.
 *
 * Living figures are a different thing and deliberately still measured: the kilobyte sizes
 * on the installation page describe what a user downloads *today*, so they track the
 * bundle. Historical claims freeze; current figures track. That is the whole distinction.
 */
const SIZE_CLAIMS = {
  baseline: { version: 'v3.6.0', raw: 351905, gzip: 98613 },
  file: 'calendar-card-pro.js',

  /**
   * The version these five sentences describe, and the figures it shipped with.
   *
   * `null` means that release is still being prepared — measure the build instead.
   */
  published: { version: 'v4.0.0', compressed: 41, 'on disk': 45 },

  claims: [
    {
      what: 'compressed',
      tolerance: 1,
      measure: (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length,
      against: (b) => b.gzip,
      sites: [
        ['docs/guide/whats-new.md', /\*\*(\d+)% Smaller to Download\*\*/],
        ['docs/RELEASE_NOTES.md', /a card file (\d+)% smaller to download/],
        ['docs/RELEASE_NOTES.md', /The Card File Is (\d+)% Smaller to Download/],
        ['docs/RELEASE_NOTES.md', /every dashboard downloads is \*\*(\d+)% smaller\*\* compressed/],
      ],
    },
    {
      what: 'on disk',
      tolerance: 0,
      measure: (file) => statSync(join(DIST, file)).size,
      against: (b) => b.raw,
      sites: [['docs/RELEASE_NOTES.md', /the reduction is larger still, at \*\*(\d+)%\*\*/]],
    },
  ],
};

/**
 * Check the published reduction percentages.
 *
 * Against the frozen figures once the release they describe has shipped, and against the
 * build itself while that release is still being prepared. See the note on
 * {@link SIZE_CLAIMS} for why the two cases cannot be the same case.
 *
 * @returns Nothing; failures are collected in `errors`
 */
function checkSizeClaims() {
  // The claims compare the released card; a dev-only build has nothing to compare against.
  if (!existsSync(join(DIST, SIZE_CLAIMS.file))) return;

  const frozen = SIZE_CLAIMS.published;
  let sitesRead = 0;

  for (const { what, tolerance, measure, against, sites } of SIZE_CLAIMS.claims) {
    const before = against(SIZE_CLAIMS.baseline);
    const measured = Math.round(((before - measure(SIZE_CLAIMS.file)) / before) * 100);

    // A shipped figure is checked against what shipped, never against today's bundle.
    const expected = frozen ? frozen[what] : measured;
    const allowed = frozen ? 0 : tolerance;

    if (frozen && expected === undefined) {
      error(
        'scripts/check-bundle.mjs',
        `SIZE_CLAIMS.published has no "${what}" figure, so that arm silently checks nothing`,
      );
      continue;
    }

    for (const [relative, pattern] of sites) {
      let page;
      try {
        page = readFileSync(join(ROOT, relative), 'utf8');
      } catch {
        error(relative, `is missing, so the ${what} reduction it publishes cannot be checked`);
        continue;
      }

      const found = page.match(pattern);
      if (!found) {
        error(
          relative,
          `no longer states the ${what} reduction in a form this check can read. The sentence ` +
            'moved or was reworded — update the matching pattern in scripts/check-bundle.mjs, ' +
            'because a check that cannot find its subject reports success forever',
        );
        continue;
      }

      sitesRead++;
      const claimed = Number(found[1]);
      if (Math.abs(claimed - expected) > allowed) {
        error(
          relative,
          frozen
            ? `says the card is ${claimed}% smaller ${what} than ${SIZE_CLAIMS.baseline.version}, ` +
                `but ${frozen.version} shipped with ${expected}% and its release notes are ` +
                `published — that sentence is a record of what was announced, not a live ` +
                `measurement. Restore ${expected}. If the bundle has grown, that is expected ` +
                `and belongs in the next release's notes, not in this one`
            : `claims the card is ${claimed}% smaller ${what} than ${SIZE_CLAIMS.baseline.version}; ` +
                `this build measures ${measured}%` +
                (allowed > 0 ? `, beyond the ${allowed} point allowed for compressor spread` : '') +
                `. Change the figure to ${measured}`,
        );
      }
    }
  }

  // A narrowed corpus that quietly went empty passes CI exactly like a healthy one.
  if (sitesRead === 0) {
    error(
      'scripts/check-bundle.mjs',
      'matched no size-claim sentence at all, so this check proved nothing. Either every ' +
        'pattern went stale at once, or the site list was emptied',
    );
  }
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
  const scanWorks = lookbehindScanWorks();
  const syntaxWorks = syntaxCheckWorks();
  let literalsScanned = 0;
  let readInFull = 0;
  let readInPart = 0;

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

    // Syntax Safari 15 cannot parse.
    if (syntaxWorks) {
      for (const problem of syntaxBeyondSafari15(code)) {
        error(
          `dist/${file}`,
          `uses ${problem}. Safari 15 cannot parse it, so on an iPhone or iPad that stops at ` +
            'iOS 15 this whole file fails to load. The build lowers src/ to ES2021, so look ' +
            'first at a dependency the build bundles, then at a regular expression literal in ' +
            'src/, which esbuild passes through as written',
        );
      }
    }

    // Regular expressions Safari 15 cannot parse.
    if (scanWorks) {
      const expressions = regularExpressions(ast);
      literalsScanned += expressions.filter(({ kind }) => kind === 'literal').length;
      readInFull += expressions.filter(({ complete }) => complete).length;
      readInPart += expressions.filter(({ complete }) => !complete).length;
      checkLookbehinds(`dist/${file}`, expressions);
    }
    if (syntaxWorks) {
      for (const problem of regExpCallsBeyondSafari15(regExpCalls(ast))) {
        error(`dist/${file}`, problem);
      }
    }

    if (!variant || file !== variant.card) continue;

    const { urlLiterals, hasImportMetaUrl, propagatesQuery } = editorImportShape(ast);

    // The editor URL depends on `import.meta.url` surviving the build.
    if (!hasImportMetaUrl) {
      error(
        `dist/${file}`,
        'does not contain import.meta.url. The card locates the editor relative to its own ' +
          'module URL, and esbuild lowers import.meta to the literal {} unless ' +
          "supported: { 'import-meta': true } is set or the target is es2020 or later — so " +
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

  // A scan that found nothing to scan passes exactly like one that found nothing wrong.
  if (scanWorks && literalsScanned === 0) {
    error(
      'dist/',
      'yielded no regular expression literal at all, so the lookbehind scan proved nothing. ' +
        'A real build holds dozens; check regularExpressions() in scripts/check-bundle.mjs',
    );
  }

  checkDocumentedSizes();
  checkSizeClaims();

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

  // Said with the count it rests on: a pattern built at runtime is read only in its fixed parts.
  console.log(
    `Bundle is intact: ${sizes}. Every file parses as ES${SYNTAX_FLOOR} with no class static ` +
      `block, as Safari 15 does. No lookbehind in ${readInFull} regular expressions read in ` +
      `full, or in the fixed parts of ${readInPart} built at runtime`,
  );
}

main();
