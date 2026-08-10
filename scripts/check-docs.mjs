#!/usr/bin/env node
/**
 * Documentation integrity check for Calendar Card Pro.
 *
 * The docs are a separate VitePress site (calendar-card-pro.alexpfau.com) carved out
 * of what used to be a ~1800-line README. Nothing connects them to the code, so every
 * way they can rot is silent: the site builds, the card works, and the page lies.
 *
 * Four failure modes, all of which have actually happened in this repo:
 *
 *   1. Documented defaults drift from DEFAULT_CONFIG. Nine were wrong at once —
 *      `day_spacing` said 5px against a real 10px, `remove_location_country` had the
 *      boolean inverted. A reader copies the documented value and gets a different card.
 *
 *   2. An option exists in code and is documented nowhere. The reference table had
 *      collapsed whole nested interfaces to a bare `object`, so `label_icon_color`,
 *      `service_data` and `open_tab` were reachable only by reading the source.
 *
 *   3. A broken code fence swallows the rest of a page. `core-settings.md` had an
 *      `entities:` line outside its ```yaml fence; VitePress renders that happily and
 *      the example silently becomes wrong.
 *
 *   4. An example that announces itself as a complete card isn't one. Most snippets in
 *      these docs are deliberately partial — they show only the option under discussion,
 *      which is what makes them readable. The convention (stated on /guide/usage) is that
 *      a block carrying `type: custom:calendar-card-pro` is the copy-pasteable kind, so
 *      that block must actually work.
 *
 * None of this is visible to tsc, eslint, vitest, or `vitepress build`. The site builds
 * clean with every one of these defects present.
 *
 * No dependencies, not part of the bundle:
 *
 *   node scripts/check-docs.mjs            # errors are fatal, warnings are advisory
 *   node scripts/check-docs.mjs --strict   # warnings are fatal too
 *
 * Design note: like check-i18n.mjs, the code is read out of the TypeScript source with
 * regexes rather than imported, so the check stays dependency-free and needs no build
 * step. That is only safe because every extraction fails *loudly* when it finds nothing
 * — see assertFound(). A regex that silently matched nothing would report a clean run
 * over an empty set, which is the one outcome worse than a false alarm.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_TS = join(ROOT, 'src/config/config.ts');
const CONSTANTS_TS = join(ROOT, 'src/config/constants.ts');
const TYPES_TS = join(ROOT, 'src/config/types.ts');
const DOCS_DIR = join(ROOT, 'docs');
const REFERENCE_DOC = join(DOCS_DIR, 'reference/configuration.md');

const STRICT = process.argv.includes('--strict');

const errors = [];
const warnings = [];

const error = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/**
 * Guard against a regex that matches nothing. Every extraction below runs against a
 * file that is known to contain the thing being extracted, so an empty result means
 * the source was restructured and this script has gone blind — not that all is well.
 */
function assertFound(collection, what, where) {
  const size = collection instanceof Map || collection instanceof Set ? collection.size : collection.length;
  if (size === 0) {
    console.error(`\n✗ FATAL: found no ${what} in ${relative(ROOT, where)}.`);
    console.error('  The file was probably restructured. This check cannot run blind — fix the parser.\n');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Reading the code
// ---------------------------------------------------------------------------

/** Top-level keys of DEFAULT_CONFIG, with their raw literal and trailing comment. */
function readDefaults() {
  const src = readFileSync(CONFIG_TS, 'utf8');
  const block = src.match(/DEFAULT_CONFIG[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.error(`\n✗ FATAL: could not locate DEFAULT_CONFIG in ${relative(ROOT, CONFIG_TS)}.\n`);
    process.exit(2);
  }

  const out = new Map();
  for (const line of block[1].split('\n')) {
    // Exactly two spaces of indent keeps this to top-level keys.
    const m = line.match(/^ {2}([a-z0-9_]+):\s*(.+?),?\s*(\/\/\s*(.*))?$/);
    if (!m) continue;
    out.set(m[1], { raw: m[2].replace(/,\s*$/, '').trim(), comment: (m[4] || '').trim() });
  }
  assertFound(out, 'DEFAULT_CONFIG keys', CONFIG_TS);
  return out;
}

/**
 * Field names of the user-facing config interfaces.
 *
 * Only these five are user-facing. types.ts also describes Home Assistant payloads and
 * internal render state, which are not configuration and must not be required to appear
 * in the docs.
 */
const USER_FACING_INTERFACES = ['Config', 'EntityConfig', 'WeatherPositionConfig', 'WeatherConfig', 'ActionConfig'];

function readConfigFields() {
  const src = readFileSync(TYPES_TS, 'utf8');
  const out = new Map(); // field -> Set of owning interfaces

  for (const name of USER_FACING_INTERFACES) {
    const m = src.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!m) {
      console.error(`\n✗ FATAL: interface ${name} not found in ${relative(ROOT, TYPES_TS)}.\n`);
      process.exit(2);
    }
    let found = 0;
    for (const line of m[1].split('\n')) {
      const f = line.match(/^\s{2}([a-z0-9_]+)\??:/);
      if (!f) continue;
      found++;
      if (!out.has(f[1])) out.set(f[1], new Set());
      out.get(f[1]).add(name);
    }
    if (found === 0) {
      console.error(`\n✗ FATAL: interface ${name} parsed to zero fields.\n`);
      process.exit(2);
    }
  }
  assertFound(out, 'config fields', TYPES_TS);
  return out;
}

/** Numeric constants, so `refresh_interval: Constants.CACHE.X` can be compared to `30`. */
function buildConstantResolver() {
  let src = '';
  try {
    src = readFileSync(CONSTANTS_TS, 'utf8');
  } catch {
    return () => null;
  }
  const nums = new Map();
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+):\s*(-?\d+(?:\.\d+)?)\s*,?/);
    if (m) nums.set(m[1], m[2]);
  }
  return (expr) => {
    const m = expr.match(/([A-Z0-9_]+)\s*$/);
    return m && nums.has(m[1]) ? nums.get(m[1]) : null;
  };
}

// ---------------------------------------------------------------------------
// Reading the docs
// ---------------------------------------------------------------------------

/**
 * Pages that count as user documentation.
 *
 * development/ and architecture.md are contributor notes, and RELEASE_NOTES.md is a
 * historical record — an option mentioned only there is not documented. Counting them
 * would let the coverage check pass on options a user cannot actually look up.
 */
const COVERAGE_EXCLUDES = ['development/', 'architecture.md', 'RELEASE_NOTES.md'];

/**
 * RELEASE_NOTES.md is exempt from the example convention as well, for the opposite
 * reason: it is a record of what shipped. Editing a two-year-old release note to satisfy
 * a convention introduced later would falsify it.
 */
const EXAMPLE_EXCLUDES = ['RELEASE_NOTES.md'];

function listDocs(dir = DOCS_DIR, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.vitepress' || name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listDocs(full, acc);
    else if (name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Check 1 — documented defaults match DEFAULT_CONFIG
// ---------------------------------------------------------------------------

/**
 * Three notation conventions account for every false positive this check would
 * otherwise raise, and all three are the docs being *more* useful than the code:
 *
 *   var(--primary-text-color) vs --primary-text-color   (CSS custom property notation)
 *   undefined                 vs "inherits `day_color`"  (documented inheritance)
 *   system                    vs System                  (sentence case in prose)
 */
function normalise(value) {
  return String(value)
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/^var\((--[a-z0-9-]+)\)$/i, '$1')
    .trim()
    .toLowerCase();
}

const isStructural = (raw) => raw.startsWith('[') || raw.startsWith('{');

function readReferenceRows() {
  const doc = readFileSync(REFERENCE_DOC, 'utf8');
  const out = new Map();
  for (const line of doc.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|/);
    if (m) out.set(m[1], { type: m[2].trim(), def: m[3].trim() });
  }
  assertFound(out, 'option table rows', REFERENCE_DOC);
  return out;
}

function checkDefaults(defaults, rows, resolveConstant) {
  for (const [key, { raw, comment }] of defaults) {
    if (!rows.has(key)) {
      error(`${key}: in DEFAULT_CONFIG but has no row in docs/reference/configuration.md`);
      continue;
    }
    const { def } = rows.get(key);
    if (isStructural(raw)) continue;

    // Documented inheritance: the code says undefined, the docs explain what actually
    // happens at runtime. That is correct and must not be "fixed" to say `undefined`.
    if (raw === 'undefined') {
      if (!/inherit/i.test(def)) {
        warn(`${key}: code default is \`undefined\` but docs say "${def}" — verify the runtime fallback is what is described`);
      }
      continue;
    }

    let codeValue = raw;
    if (/^[A-Z]/.test(raw) && raw.includes('.')) {
      const resolved = resolveConstant(raw);
      if (resolved === null) {
        warn(`${key}: default is the constant \`${raw}\`, which could not be resolved — verify by hand`);
        continue;
      }
      codeValue = resolved;
    }

    if (normalise(codeValue) !== normalise(def)) {
      error(
        `${key}: docs say ${def} but DEFAULT_CONFIG has \`${raw}\`` + (comment ? `  (code comment: ${comment})` : ''),
      );
    }
  }

  for (const key of rows.keys()) {
    if (!defaults.has(key)) {
      warn(`${key}: documented in the reference but not in DEFAULT_CONFIG — stale row, or an optional field with no default`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — every config option is documented somewhere
// ---------------------------------------------------------------------------

/**
 * Does this page document this option?
 *
 * Deliberately not a bare word match. `service`, `title` and `entity` are ordinary
 * English words, and "handles navigation and service calls" is prose about the card,
 * not documentation of the `service` option. Counting it would make the check pass on
 * an option nobody can look up — a false pass, which defeats the point of the check.
 *
 * So an option only counts when it appears in a context that marks it as an identifier:
 * inside a backtick span, as its own cell in a table, or as a YAML key inside a fence.
 */
function isDocumented(field, text, fencedContent) {
  const asWord = new RegExp(`(^|[^A-Za-z0-9_])${field}([^A-Za-z0-9_]|$)`);

  // `label_icon_color`, or `service: domain.service` in a table's example column.
  for (const span of text.match(/`[^`\n]+`/g) || []) {
    if (asWord.test(span)) return true;
  }

  // | label_icon_color | string | … |  — feature-page tables do not always use backticks.
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    if (line.split('|').some((cell) => cell.trim() === field)) return true;
  }

  // A YAML key in an example. Restricted to fenced blocks so page frontmatter cannot
  // masquerade as documentation.
  return new RegExp(`^\\s*-?\\s*${field}\\s*:`, 'm').test(fencedContent);
}

/**
 * This is the safety net for restructuring. The docs are being reorganised in phases,
 * and the one unacceptable outcome is losing content while moving it. An option may
 * live on whichever page suits it — the reference table, a feature page, or both — but
 * it must be findable on at least one of them.
 */
function checkCoverage(fields, docs) {
  const corpus = docs
    .filter((f) => !COVERAGE_EXCLUDES.some((ex) => relative(DOCS_DIR, f).startsWith(ex) || relative(DOCS_DIR, f) === ex))
    .map((f) => {
      const text = readFileSync(f, 'utf8');
      return {
        file: relative(ROOT, f),
        text,
        fenced: (text.match(/^```[\s\S]*?^```/gm) || []).join('\n'),
      };
    });

  assertFound(corpus, 'user-facing documentation pages', DOCS_DIR);

  for (const [field, owners] of fields) {
    if (!corpus.some((c) => isDocumented(field, c.text, c.fenced))) {
      error(`${field}: declared in ${[...owners].join(', ')} but documented on no user-facing page`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — code fences are balanced
// ---------------------------------------------------------------------------

function checkFences(docs) {
  for (const file of docs) {
    const rel = relative(ROOT, file);
    const opens = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^```/.test(l)).length;
    if (opens % 2 !== 0) {
      error(`${rel}: odd number of \`\`\` fences (${opens}) — a block is unterminated and will swallow the rest of the page`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4 — blocks that claim to be complete cards actually are
// ---------------------------------------------------------------------------

/**
 * Deliberately asymmetric. A fragment showing two options is good documentation and is
 * not flagged. But a block carrying `type: custom:calendar-card-pro` is announcing
 * itself as copy-pasteable, so it has to work — which means it needs `entities:`.
 */
function checkCopyableExamples(docs) {
  let complete = 0;
  for (const file of docs) {
    const rel = relative(ROOT, file);
    if (EXAMPLE_EXCLUDES.some((ex) => relative(DOCS_DIR, file) === ex)) continue;
    const text = readFileSync(file, 'utf8');
    const blocks = text.match(/^```ya?ml\n[\s\S]*?^```/gm) || [];
    blocks.forEach((block, i) => {
      if (!/^\s*type:\s*custom:calendar-card-pro\s*$/m.test(block)) return;
      complete++;
      if (!/^\s*entities:/m.test(block)) {
        error(
          `${rel}: yaml block #${i + 1} declares \`type: custom:calendar-card-pro\` but has no \`entities:\` — it reads as copy-pasteable but will not render`,
        );
      }
    });
  }
  if (complete === 0) {
    error(
      'No complete card example found anywhere in the docs. At least one page must show a full, copy-pasteable configuration (see /guide/usage).',
    );
  }
  return complete;
}

// ---------------------------------------------------------------------------
// Check 5 — the README's quick-start example still matches the docs
// ---------------------------------------------------------------------------

/**
 * The README is the HACS landing page, so it has to show what a config looks like
 * without sending the reader elsewhere first. That one block is therefore the single
 * place in the project where duplication is deliberate rather than accidental.
 *
 * Duplication that nothing checks is just drift with a delay on it, so rather than
 * removing the block or tolerating the copy, this pins it: the README's first card
 * example must stay byte-identical to the first one in the usage guide. Edit either
 * and this fails, naming both files.
 */
function checkReadmeExample() {
  const readme = join(ROOT, 'README.md');
  const usage = join(DOCS_DIR, 'guide/usage.md');

  const firstCard = (file) => {
    const blocks = readFileSync(file, 'utf8').match(/^```ya?ml\n[\s\S]*?^```/gm) || [];
    return blocks.find((b) => /^\s*type:\s*custom:calendar-card-pro\s*$/m.test(b));
  };

  const a = firstCard(readme);
  const b = firstCard(usage);

  // Neither side may quietly lose its example: that would make the check vacuous.
  if (!a) {
    error('README.md: no complete card example found — the landing page must show one working config');
    return;
  }
  if (!b) {
    error('docs/guide/usage.md: no complete card example found — the README example is pinned to it');
    return;
  }
  if (a.trim() !== b.trim()) {
    error(
      "README.md and docs/guide/usage.md show different first examples. They are meant to be the same config — update both, or they will teach two different things.",
    );
  }
}

// ---------------------------------------------------------------------------

function report(counts) {
  console.log(
    `${counts.defaults} defaults in code, ${counts.rows} rows in the reference, ` +
      `${counts.fields} config fields, ${counts.docs} pages, ${counts.complete} complete examples.\n`,
  );

  if (errors.length) {
    console.log(`${errors.length} error(s):`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log('');
  }
  if (warnings.length) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log('');
  }

  if (errors.length) {
    console.log('Documentation does not match the code.');
    return 1;
  }
  if (STRICT && warnings.length) {
    console.log('Failing because --strict was passed.');
    return 1;
  }
  console.log('Documentation is consistent with the code.');
  return 0;
}

function main() {
  const defaults = readDefaults();
  const rows = readReferenceRows();
  const fields = readConfigFields();
  const docs = listDocs();
  assertFound(docs, 'markdown pages', DOCS_DIR);

  checkDefaults(defaults, rows, buildConstantResolver());
  checkCoverage(fields, docs);
  checkFences(docs);
  const complete = checkCopyableExamples(docs);
  checkReadmeExample();

  process.exit(
    report({ defaults: defaults.size, rows: rows.size, fields: fields.size, docs: docs.length, complete }),
  );
}

main();
