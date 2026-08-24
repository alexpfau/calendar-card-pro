#!/usr/bin/env node
/**
 * Documentation integrity check for Calendar Card Pro.
 *
 * Validates docs against the code and catches drift that VitePress cannot see: defaults,
 * missing options, malformed examples, broken internal links and style conventions.
 *
 * Run with `node scripts/check-docs.mjs`; add `--strict` to make warnings fatal.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_TS = join(ROOT, 'src/config/config.ts');
const VIEW_TS = join(ROOT, 'src/config/view.ts');
const CONSTANTS_TS = join(ROOT, 'src/config/constants.ts');
const TYPES_TS = join(ROOT, 'src/config/types.ts');
const DOCS_DIR = join(ROOT, 'docs');
const REFERENCE_DOC = join(DOCS_DIR, 'reference/configuration.md');

/**
 * The second table an option's values can be documented in.
 *
 * Per-calendar options that have no card-wide counterpart never reach the reference
 * tables — those describe the card, and the per-entity section there is a bullet list
 * pointing here. So this page carries the only row `days_of_week` has, and check 21 has
 * to read both or an enumerated option documented only here goes unchecked while the
 * gate reports a clean run.
 */
const ENTITY_OPTIONS_DOC = join(DOCS_DIR, 'features/core-settings.md');
const VITEPRESS_CONFIG = join(DOCS_DIR, '.vitepress/config.mts');
const STYLES_TS = join(ROOT, 'src/rendering/styles.ts');
const THEMING_DOC = join(DOCS_DIR, 'features/theming.md');

const STRICT = process.argv.includes('--strict');

/**
 * GitHub renders `::error::` and `::warning::` lines as inline annotations on the pull
 * request. Locally they would be noise, so the plain symbols stay outside CI. Mirrors
 * `check-i18n.mjs`, so a docs failure surfaces the same way an i18n failure does.
 */
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

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
  const size =
    collection instanceof Map || collection instanceof Set ? collection.size : collection.length;
  if (size === 0) {
    console.error(`\n✗ FATAL: found no ${what} in ${relative(ROOT, where)}.`);
    console.error(
      '  The file was probably restructured. This check cannot run blind — fix the parser.\n',
    );
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
const USER_FACING_INTERFACES = [
  'Config',
  'EntityConfig',
  'WeatherPositionConfig',
  'WeatherConfig',
  'ActionConfig',
];

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
 * Accept CSS custom property notation, documented inheritance and prose sentence case.
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

/**
 * Options whose static default is `undefined` because the real value is decided at
 * runtime, each one traced to the code that decides it.
 *
 * The value is the documented default. The comment names the code path to re-read before
 * touching an entry.
 */
const VERIFIED_RUNTIME_FALLBACKS = new Map([
  // utils/events.ts — absent or unparseable resolves to today ("Falling back to today").
  ['start_date', 'Today'],
  // config/config.ts `toValidNumber(…, 1)` — the 1 is a floor, not a default. Absent
  // means no limit, which is why an invalid value clears rather than collapses to zero.
  ['compact_days_to_show', '-'],
  ['compact_events_to_show', '-'],
  // utils/events.ts — `customEmptyText || translations.noEvents`, so absence renders the
  // translated string and no new language key is needed.
  ['empty_day_text', '_translated default_'],
  // translations/localize.ts `getEffectiveLanguage()` — config, then the HA locale, then
  // its base tag, then `en`.
  ['language', '`System`, fallback `en`'],
  // Absent renders no title at all; there is nothing to fall back to.
  ['title', '-'],
  // rendering/styles.ts — the custom property is only written when the option is set, so
  // absence leaves the stylesheet's own value in place. The documented default is that
  // variable because that is literally what applies.
  ['title_font_size', '`--calendar-card-font-size-title`'],
  ['title_color', '`--calendar-card-color-title`'],
  // Each placement supplies its own fallback; a shipped default cannot express "different
  // per position" and would be indistinguishable from a deliberate choice. See the
  // `weather.color` comment in config/config.ts, which documents the same mechanism.
  ['progress_bar_width', '_per placement_'],
]);

/** Entries actually reached, so the table can be checked for rot. */
const runtimeFallbacksSeen = new Set();

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
      if (/inherit/i.test(def)) continue;
      if (!VERIFIED_RUNTIME_FALLBACKS.has(key)) {
        warn(
          `${key}: code default is \`undefined\` but docs say "${def}" — trace the runtime fallback, ` +
            'then record it in VERIFIED_RUNTIME_FALLBACKS so this stops warning',
        );
        continue;
      }
      runtimeFallbacksSeen.add(key);
      const verifiedAgainst = VERIFIED_RUNTIME_FALLBACKS.get(key);
      if (verifiedAgainst !== def) {
        error(
          `${key}: documented default is now "${def}", but the runtime fallback was verified ` +
            `against "${verifiedAgainst}" — re-read the code path named in ` +
            'VERIFIED_RUNTIME_FALLBACKS and update the entry',
        );
      }
      continue;
    }

    let codeValue = raw;
    if (/^[A-Z]/.test(raw) && raw.includes('.')) {
      const resolved = resolveConstant(raw);
      if (resolved === null) {
        warn(
          `${key}: default is the constant \`${raw}\`, which could not be resolved — verify by hand`,
        );
        continue;
      }
      codeValue = resolved;
    }

    if (normalise(codeValue) !== normalise(def)) {
      error(
        `${key}: docs say ${def} but DEFAULT_CONFIG has \`${raw}\`` +
          (comment ? `  (code comment: ${comment})` : ''),
      );
    }
  }

  for (const key of rows.keys()) {
    if (!defaults.has(key)) {
      warn(
        `${key}: documented in the reference but not in DEFAULT_CONFIG — stale row, or an optional field with no default`,
      );
    }
  }

  // A suppression list that outlives the thing it suppresses is how a check goes quiet
  // about something real. An entry stops being reached the moment the option gains a
  // static default, is renamed, or is removed — in each case the recorded trace now
  // describes code that no longer runs.
  for (const key of VERIFIED_RUNTIME_FALLBACKS.keys()) {
    if (!runtimeFallbacksSeen.has(key)) {
      error(
        `${key}: listed in VERIFIED_RUNTIME_FALLBACKS but no longer reaches that branch — ` +
          'the option was renamed, removed, or given a static default. Drop the entry',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — every config option is documented somewhere
// ---------------------------------------------------------------------------

/**
 * Does this page document this option?
 *
 * An option counts only in identifier contexts: backticks, a table cell or a YAML key.
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
    .filter(
      (f) =>
        !COVERAGE_EXCLUDES.some(
          (ex) => relative(DOCS_DIR, f).startsWith(ex) || relative(DOCS_DIR, f) === ex,
        ),
    )
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
      error(
        `${field}: declared in ${[...owners].join(', ')} but documented on no user-facing page`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 27 — markdown that silently degrades to plain text
// ---------------------------------------------------------------------------

/**
 * Three constructs that render as literal paragraph text: `##Heading`, mismatched table
 * separators and `[text] (url)` with a space before the URL.
 */
function checkSilentMarkdown(docs) {
  for (const file of docs) {
    const rel = relative(ROOT, file);
    let fenced = false;

    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, i) => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;

      // Require a letter so GitHub issue references like `#339` are not headings.
      if (/^#{1,6}[A-Za-z]/.test(line)) {
        error(`${rel}:${i + 1} heading needs a space after the hashes; renders as body text.`);
      }

      // `[text] (url)` — a space where markdown allows none.
      const spaced = line.match(/\[[^\]]+\]\s+\((\/|https?:|#)[^)]*\)/);
      if (spaced) {
        error(
          `${rel}:${i + 1} link has a space between ] and (; renders as literal brackets and escapes link checking.`,
        );
      }

      // Table separator whose column count disagrees with the header above it.
      if (/^\s*\|[\s:-]*-[\s:|-]*\|\s*$/.test(line) && i > 0) {
        const cells = (row) =>
          row
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|').length;
        const header = lines[i - 1];
        if (/\|/.test(header) && cells(header) !== cells(line)) {
          error(
            `${rel}:${i + 1} table separator has ${cells(line)} columns but its header has ${cells(header)}; the whole table renders as text.`,
          );
        }
      }
    });
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
      error(
        `${rel}: odd number of \`\`\` fences (${opens}) — a block is unterminated and will swallow the rest of the page`,
      );
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
 *
 * Checking that the *key* exists is not enough. `entities` must be a sequence: a scalar
 * such as `entities: calendar.home` normalizes to no usable calendars and renders an
 * empty card (see `tests/editor-malformed-entities.test.ts`), so an example that reads
 * as copy-pasteable would still be broken while satisfying the gate.
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
      const decl = block.match(/^([ \t]*)entities:[ \t]*(.*)$/m);
      if (!decl) {
        error(
          `${rel}: yaml block #${i + 1} declares \`type: custom:calendar-card-pro\` but has no \`entities:\` — it reads as copy-pasteable but will not render`,
        );
        return;
      }
      const [matched, indent, inline] = decl;
      const value = inline.replace(/(?:^|\s)#.*$/, '').trim();
      let isSequence;
      if (value) {
        // A flow sequence on the same line, and a non-empty one: `[]` is as useless
        // as a scalar.
        isSequence = /^\[\s*\S[\s\S]*]$/.test(value);
      } else {
        // A block sequence: the next meaningful line must be a `- ` item indented at
        // least as far as the key (YAML permits both `entities:\n- x` and `\n  - x`).
        isSequence = false;
        for (const line of block.slice(decl.index + matched.length).split('\n')) {
          if (!line.trim() || /^\s*#/.test(line)) continue;
          const item = line.match(/^([ \t]*)-\s+\S/);
          isSequence = Boolean(item && item[1].length >= indent.length);
          break;
        }
      }
      if (!isSequence) {
        error(
          `${rel}: yaml block #${i + 1} declares \`type: custom:calendar-card-pro\` but \`entities:\` is not a non-empty list — a scalar or empty value normalizes to no calendars and renders an empty card`,
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
 * The README's first complete example is pinned to the usage guide's first complete
 * example because the README is the HACS landing page.
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
    error(
      'README.md: no complete card example found — the landing page must show one working config',
    );
    return;
  }
  if (!b) {
    error(
      'docs/guide/usage.md: no complete card example found — the README example is pinned to it',
    );
    return;
  }
  if (a.trim() !== b.trim()) {
    error(
      'README.md and docs/guide/usage.md show different first examples. They are meant to be the same config — update both, or they will teach two different things.',
    );
  }
}

// ---------------------------------------------------------------------------
// Check 6 — the What's New archive covers every release line
// ---------------------------------------------------------------------------

/**
 * The What's New page is the full archive. Every minor line in release notes must have a
 * heading here; patches fold into their `vX.Y` entry.
 */
function checkWhatsNewCoverage() {
  const notes = join(DOCS_DIR, 'RELEASE_NOTES.md');
  const page = join(DOCS_DIR, 'guide/whats-new.md');

  const released = new Set(
    [...readFileSync(notes, 'utf8').matchAll(/^# Calendar Card Pro v(\d+)\.(\d+)\.\d+/gm)].map(
      (m) => `${m[1]}.${m[2]}`,
    ),
  );
  const documented = new Set(
    [...readFileSync(page, 'utf8').matchAll(/^## (?:Latest Release: )?v(\d+)\.(\d+)\s*$/gm)].map(
      (m) => `${m[1]}.${m[2]}`,
    ),
  );

  // Either side coming back empty would make every comparison below trivially pass.
  assertFound(released, 'release headings', notes);
  assertFound(documented, "What's New entries", page);

  const byVersion = (a, b) => {
    const [aMaj, aMin] = a.split('.').map(Number);
    const [bMaj, bMin] = b.split('.').map(Number);
    return bMaj - aMaj || bMin - aMin;
  };

  const missing = [...released].filter((v) => !documented.has(v)).sort(byVersion);
  if (missing.length) {
    error(
      `docs/guide/whats-new.md is missing ${missing.length} release line(s): ` +
        `${missing.map((v) => `v${v}`).join(', ')}. It is the full archive — add an entry rather than trimming it.`,
    );
  }

  const unreleased = [...documented].filter((v) => !released.has(v)).sort(byVersion);
  if (unreleased.length) {
    error(
      `docs/guide/whats-new.md documents ${unreleased.map((v) => `v${v}`).join(', ')}, ` +
        'which has no release notes. Check for a typo in the heading.',
    );
  }

  checkWhatsNewAnchors(documented);

  return documented.size;
}

/**
 * Links into this page are written as absolute URLs to the live site, so VitePress's
 * dead-link check — which only resolves relative links — never sees them. That blind
 * spot is not theoretical: the release notes shipped `#v2-1` when the anchor is `#v21`.
 *
 * The site's slugify strips dots, so a `## vX.Y` heading anchors as `vXY`. Deriving the
 * expected anchors from the headings just parsed keeps this in step with the page rather
 * than hardcoding a list.
 */
function checkWhatsNewAnchors(documented) {
  const valid = new Set();
  for (const v of documented) {
    const slug = `v${v.replace('.', '')}`;
    valid.add(slug);
    valid.add(`latest-release-${slug}`); // the newest entry carries a prefix
  }

  const links = [];
  for (const file of listDocs()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/guide\/whats-new#([\w-]+)/g)) {
      links.push({ anchor: m[1], file });
    }
  }

  // No links at all would mean the pattern stopped matching, not that all is well.
  assertFound(links, "links into the What's New page", DOCS_DIR);

  for (const { anchor, file } of links) {
    if (!valid.has(anchor)) {
      error(
        `${relative(ROOT, file)} links to guide/whats-new#${anchor}, which is not a heading on that page. ` +
          `Note the site's slugify strips dots, so v2.1 anchors as #v21.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers for the style checks
// ---------------------------------------------------------------------------

/**
 * Pages exempt from the prose style rules.
 *
 * Same boundary as COVERAGE_EXCLUDES, plus whats-new.md. That page's headings are
 * version identifiers (`## v3.4`), not topics, so the emoji rule below has nothing
 * meaningful to ask of them — an emoji per release would be arbitrary decoration.
 */
const STYLE_EXCLUDES = [...COVERAGE_EXCLUDES, 'guide/whats-new.md'];

const isExcluded = (file, excludes) => {
  const rel = relative(DOCS_DIR, file);
  return excludes.some((x) => rel.startsWith(x) || rel === x);
};

/** Mirror of docs/.vitepress/config.mts stripDecorations + slugify. */
function slugifyHeading(str) {
  return str
    .replace(/[0-9]\uFE0F?\u20E3/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0E\uFE0F]/gu, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

const STARTS_WITH_EMOJI = /^\s*(?:\p{Extended_Pictographic}|[0-9]\uFE0F?\u20E3)/u;

/**
 * Headings outside fenced blocks. Every style check needs this, and every one of them
 * would otherwise trip over the YAML comments in the examples — `# Cache and refresh
 * settings` is a comment, not an h1.
 */
function readHeadings(file) {
  const out = [];
  let fenced = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      const m = /^(#{1,6}) (.*)$/.exec(line);
      if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    });
  return out;
}

// ---------------------------------------------------------------------------
// Check 7 — every internal link resolves to a real page and anchor
// ---------------------------------------------------------------------------

/**
 * VitePress's `ignoreDeadLinks: false` only validates *markdown* links. A raw HTML
 * `<a href>` is invisible to it, which is exactly how a link to the pre-carve-out
 * anchor `#5️⃣-features--configuration` shipped and survived every build.
 *
 * So resolve both forms here, against the real page set and the real heading slugs.
 */
/**
 * Every published route, mapped to the anchors its headings generate.
 *
 * Shared by the relative-link check and the absolute-link check below, so the two cannot
 * disagree about what exists — the second was added precisely because a link the first
 * could not see went unvalidated for a whole release.
 *
 * @param docs - Every markdown page under `docs/`
 * @returns route -> set of anchors, e.g. "/features/weather" -> { "weather-integration", … }
 */
function buildAnchorMap(docs) {
  const published = docs.filter((f) => !isExcluded(f, ['development/']));
  const anchors = new Map();

  for (const file of published) {
    const route =
      '/' +
      relative(DOCS_DIR, file)
        .replace(/\.md$/, '')
        .replace(/\/index$/, '');
    const seen = new Map();
    const slugs = new Set();
    for (const h of readHeadings(file)) {
      const base = slugifyHeading(h.text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      slugs.add(n === 0 ? base : `${base}-${n}`);
    }
    anchors.set(route === '/index' ? '/' : route, slugs);
  }

  assertFound(anchors, 'published routes', DOCS_DIR);
  return { published, anchors };
}

function checkInternalLinks(docs) {
  const { published, anchors } = buildAnchorMap(docs);

  // The `#…` alternatives are not decoration. A same-page fragment is the one link form
  // nothing else validates: VitePress's dead-link check resolves it no more than this
  // gate did, so a bare `[see below](#renamed-heading)` rotted silently through every
  // build. Confirmed by planting one — `check:docs` and `docs:build` both exited 0.
  const LINK = /\[[^\]]*\]\(((?:\/|#)[^)\s]*)\)|<a\s[^>]*href="((?:\/|#)[^"]*)"/g;
  let checked = 0;

  for (const file of published) {
    const text = readFileSync(file, 'utf8');

    // The route this file publishes at, so a `#fragment` resolves against its own
    // headings. Derived the same way buildAnchorMap does, so the two cannot disagree.
    const ownRoute = (() => {
      const r =
        '/' +
        relative(DOCS_DIR, file)
          .replace(/\.md$/, '')
          .replace(/\/index$/, '');
      return r === '/index' ? '/' : r;
    })();

    for (const m of text.matchAll(LINK)) {
      const target = m[1] ?? m[2];
      const samePage = target.startsWith('#');
      const [rawPath, anchor] = samePage ? [ownRoute, target.slice(1)] : target.split('#');
      const path = samePage ? rawPath : rawPath.replace(/\/$/, '') || '/';
      checked++;

      if (!anchors.has(path)) {
        error(`${relative(ROOT, file)} links to ${target}, but no page publishes at ${path}.`);
        continue;
      }
      if (anchor && !anchors.get(path).has(anchor)) {
        error(
          `${relative(ROOT, file)} links to ${target}, but #${anchor} is not a heading ` +
            `on ${samePage ? 'its own page' : 'that page'}. ` +
            "Note the site's slugify strips emoji and dots.",
        );
      }
    }
  }

  // A regex that silently stops matching would turn this check into a no-op.
  if (!checked) {
    console.error(`Found no internal links under ${DOCS_DIR}. The link pattern is stale.`);
    process.exit(2);
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Check 7b — relative links between the design docs resolve
// ---------------------------------------------------------------------------

/**
 * Resolve relative links in `docs/development/`, which is not part of the VitePress site.
 * These files render on GitHub, so anchors use GitHub slug rules and paths resolve
 * relative to the linking file.
 */
function githubSlug(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
    .toLowerCase();
}

function checkDesignDocLinks(docs) {
  const design = docs.filter((f) => relative(DOCS_DIR, f).startsWith('development/'));
  if (!design.length) return 0;

  const DEV_DIR = join(DOCS_DIR, 'development');
  // Key by path relative to docs/development/, so two same-named files in different
  // subdirectories stay distinct. Flat today; `key()` is what keeps it correct if not.
  const key = (file) => relative(DEV_DIR, file).split(sep).join('/');

  const headings = new Map();
  for (const file of design) {
    const seen = new Map();
    const slugs = new Set();
    for (const h of readHeadings(file)) {
      const base = githubSlug(h.text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      slugs.add(n === 0 ? base : `${base}-${n}`);
    }
    headings.set(key(file), slugs);
  }
  assertFound(headings, 'design documents', DEV_DIR);

  // Matches ./x, ../x and bare #anchor.
  const LINK = /\[[^\]]*\]\((\.\.?\/[^)\s]+|#[^)\s]+)\)/g;
  let checked = 0;

  // A `../` link can leave the corpus entirely — a design doc citing
  // `../../AGENTS.md#reference` names a real file with real headings, and those went
  // unchecked until the pattern above started matching them. Rather than skip those,
  // resolve them on disk and validate the anchor too. Cached because several documents
  // cite the same handful of outside files.
  const outside = new Map();
  const outsideHeadings = (abs) => {
    if (!outside.has(abs)) {
      let slugs = null;
      if (existsSync(abs) && abs.endsWith('.md')) {
        const seen = new Map();
        slugs = new Set();
        for (const h of readHeadings(abs)) {
          const base = githubSlug(h.text);
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          slugs.add(n === 0 ? base : `${base}-${n}`);
        }
      } else if (existsSync(abs)) {
        slugs = new Set(); // exists but not markdown: path is valid, no anchors to check
      }
      outside.set(abs, slugs);
    }
    return outside.get(abs);
  };

  for (const file of design) {
    for (const m of readFileSync(file, 'utf8').matchAll(LINK)) {
      const [rawPath, anchor] = m[1].split('#');
      const abs = rawPath ? resolve(dirname(file), rawPath) : file;
      const target = key(abs);
      checked++;

      // Inside the corpus: the pre-built map answers both questions.
      if (headings.has(target)) {
        if (anchor && !headings.get(target).has(anchor)) {
          error(
            `${relative(ROOT, file)} links to ${m[1]}, but #${anchor} is not a heading in ${target}.`,
          );
        }
        continue;
      }

      // Outside it: fall back to the filesystem.
      const slugs = outsideHeadings(abs);
      if (slugs === null) {
        error(
          `${relative(ROOT, file)} links to ${m[1]}, but ${relative(ROOT, abs)} does not exist.`,
        );
        continue;
      }
      if (anchor && slugs.size && !slugs.has(anchor)) {
        error(
          `${relative(ROOT, file)} links to ${m[1]}, but #${anchor} is not a heading in ${relative(ROOT, abs)}.`,
        );
      }
    }
  }

  // Same guard as check 7: a pattern that stops matching must not read as a clean run.
  //
  // "No links matched" has two causes and they need different answers. The pattern may
  // have gone stale against markup it should match — the failure this guard exists for —
  // or the corpus may genuinely hold no relative links, which is the honest state of a
  // folder trimmed to a single file. A looser scan tells them apart: if nothing here even
  // looks like a relative link, there is nothing to check and nothing to report.
  if (!checked) {
    const looksLinked = design.some((file) => /\]\((\.\.?\/|#)/.test(readFileSync(file, 'utf8')));
    if (looksLinked) {
      console.error(
        `Found no relative links under ${join(DOCS_DIR, 'development')}, but the files ` +
          'contain link-like markup. The pattern above is stale.',
      );
      process.exit(2);
    }
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Check 8 — no raw HTML links or inline styles in the docs
// ---------------------------------------------------------------------------

/**
 * Prevents the class rather than policing instances: raw `<a href>` is the one link
 * form check 7 has to work harder to see, and inline `style=` is unthemed, so it
 * ignores the user's light/dark preference.
 */
function checkNoRawHtml(docs) {
  for (const file of docs) {
    if (isExcluded(file, EXAMPLE_EXCLUDES)) continue;
    let fenced = false;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
          return;
        }
        if (fenced) return;
        if (/<a\s[^>]*href=/.test(line))
          error(`${relative(ROOT, file)}:${i + 1} uses a raw <a href>. Use a markdown link.`);
        if (/\sstyle\s*=/i.test(line))
          error(`${relative(ROOT, file)}:${i + 1} uses an inline style, which ignores the theme.`);
      });
  }
}

// ---------------------------------------------------------------------------
// Check 9 — callouts use titled VitePress containers
// ---------------------------------------------------------------------------

/**
 * Three syntaxes were in use. GitHub alerts (`> [!NOTE]`) render on github.com but
 * cannot carry a descriptive title, and a bare bold blockquote gets no callout
 * styling at all — so the most-repeated callout on the site was invisible as one.
 */
function checkAdmonitions(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    let fenced = false;
    // Set when a titled container opens, so the first line of its body can be
    // compared against the title.
    let openTitle = null;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
          return;
        }
        if (fenced) return;
        if (openTitle && line.trim()) {
          const bold = line.match(/^\*\*(.+?)\*\*:?\s*/);
          if (bold && bold[1].replace(/:$/, '').trim().toLowerCase() === openTitle.toLowerCase())
            error(
              `${relative(ROOT, file)}:${i + 1} repeats the container title "${openTitle}" as a bold lead-in, so it renders twice. The title already labels the box.`,
            );
          openTitle = null;
        }
        if (/^>\s*\[!/.test(line))
          error(
            `${relative(ROOT, file)}:${i + 1} uses a GitHub alert. Use ::: tip Title — containers can be titled.`,
          );
        if (/^:::\s*(tip|warning|info|danger|details)\s*$/.test(line))
          error(
            `${relative(ROOT, file)}:${i + 1} opens an untitled container. Give it a descriptive title.`,
          );
        const opened = line.match(/^:::\s*(?:tip|warning|info|danger|details)\s+(.+?)\s*$/);
        if (opened) openTitle = opened[1];
        if (/^>\s*\*\*[^*]+:\*\*/.test(line))
          warn(
            `${relative(ROOT, file)}:${i + 1} looks like a callout in a bare blockquote, which gets no callout styling.`,
          );
      });
  }
}

// ---------------------------------------------------------------------------
// Check 10 — heading style
// ---------------------------------------------------------------------------

/**
 * Emoji sit on h2 and nowhere else.
 *
 * Not arbitrary: an h1 becomes the `<title>`, so an emoji there ends up in the browser
 * tab, the bookmark and the Google result — `⚙️ Visual Configuration Editor | Calendar
 * Card Pro` was a real title on this site. h2 emoji do not leak anywhere.
 *
 * Emoji conventions are pure discipline and rot fastest, which is why this is a check
 * and not a sentence in a style guide.
 */
function checkHeadingStyle(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    const rel = relative(ROOT, file);
    for (const h of readHeadings(file)) {
      const emoji = STARTS_WITH_EMOJI.test(h.text);
      if (h.level === 1 && emoji)
        error(`${rel}:${h.line} h1 starts with an emoji; it would leak into the page <title>.`);
      if (h.level === 2 && !emoji) error(`${rel}:${h.line} h2 should start with an emoji.`);
      if (h.level >= 3 && emoji)
        error(`${rel}:${h.line} h${h.level} should not start with an emoji.`);
      if (/\band\b/i.test(h.text)) error(`${rel}:${h.line} heading uses "and"; use "&".`);
      if (h.text.endsWith(':')) error(`${rel}:${h.line} heading ends with a colon.`);
    }
  }
}

/**
 * Check 11: every page opens with prose, not a bare heading.
 *
 * A page that jumps from its h1 straight into an h2 gives the reader no idea
 * what the page covers before it starts issuing options at them. Six pages did
 * this. One or two sentences is enough.
 */
function checkPageIntros(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    const h1 = lines.findIndex((l) => l.startsWith('# '));
    if (h1 === -1) continue;
    const next = lines.slice(h1 + 1).find((l) => l.trim());
    if (next && next.startsWith('#'))
      error(`${rel}: h1 is followed straight by a heading; add an intro sentence.`);
  }
}

// ---------------------------------------------------------------------------
// Checks 12-15 — spelling, option tables, bidirectional cross-links
// ---------------------------------------------------------------------------

/** Check 12: US spelling around US-spelled config options. */
const BRITISH = [
  ['colour', 'color'],
  ['customis', 'customiz'],
  ['behaviour', 'behavior'],
  ['optimis', 'optimiz'],
  ['standardis', 'standardiz'],
  ['organis', 'organiz'],
  ['centre', 'center'],
  ['analyse', 'analyze'],
  ['cancelled', 'canceled'],
  ['travelling', 'traveling'],
];

function checkSpelling(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    const rel = relative(ROOT, file);
    let fenced = false;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
          return;
        }
        if (fenced) return;
        for (const [bad, good] of BRITISH) {
          if (new RegExp(bad, 'i').test(line))
            error(`${rel}:${i + 1} British spelling "${bad}…"; use "${good}…".`);
        }
      });
  }
}

/**
 * Check 15: a backticked option name is followed by the word "option".
 *
 * The rule is narrow: it only fires on a backticked identifier immediately followed by
 * the wrong noun, so CSS variables and Home Assistant action parameters stay out of scope.
 */
const OPTION_NOUN =
  /(`[a-z0-9_*]+`\*{0,2}\s+)(parameters|parameter|settings|setting|variables|variable|properties|property)\b/;

function checkOptionNoun(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    const rel = relative(ROOT, file);
    let fenced = false;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
          return;
        }
        if (fenced) return;
        // Table rows are checked cell by cell: a row like `| \`show_time\` | setting |`
        // puts the name and the noun in different columns, which is not a sentence
        // and must not be flagged. Descriptions inside a single cell still are.
        const cells = line.trimStart().startsWith('|') ? line.split('|') : [line];
        for (const cell of cells) {
          const m = cell.match(OPTION_NOUN);
          if (m) {
            error(
              `${rel}:${i + 1} calls a config key a "${m[2]}"; use "option" (or "options") so one term is used throughout.`,
            );
            return;
          }
        }
      });
  }
}

/**
 * Check 13: option tables are `Option | Type | Default | Description`.
 *
 * Only tables whose first header cell names an option are inspected.
 */
const OPTION_SYNONYMS = ['variable', 'property', 'parameter', 'setting', 'field', 'key'];

function checkOptionTables(docs) {
  for (const file of docs) {
    if (isExcluded(file, STYLE_EXCLUDES)) continue;
    const rel = relative(ROOT, file);
    let fenced = false;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
          return;
        }
        if (fenced || !line.trim().startsWith('|')) return;

        const cells = line
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim().replace(/\*/g, '').toLowerCase());
        if (!cells.length) return;

        if (OPTION_SYNONYMS.includes(cells[0]))
          error(`${rel}:${i + 1} table header "${cells[0]}"; use "Option".`);

        if (cells[0] === 'option' && !cells.includes('default'))
          error(`${rel}:${i + 1} option table has no Default column.`);
      });
  }
}

/**
 * Check 14: features and the reference link to each other, both ways.
 *
 * Every feature page points at the reference from its final section, and every reference
 * section closes with a feature-page footer.
 */
function checkCrossLinks(docs) {
  for (const file of docs) {
    const rel = relative(ROOT, file);
    if (!rel.startsWith('docs/features/')) continue;

    const lines = readFileSync(file, 'utf8').split('\n');
    let fenced = false;
    let lastHeading = -1;
    let lastLink = -1;
    lines.forEach((line, i) => {
      if (line.startsWith('```')) fenced = !fenced;
      if (fenced) return;
      if (/^## /.test(line)) lastHeading = i;
      if (line.includes('/reference/configuration')) lastLink = i;
    });

    if (lastLink === -1) {
      error(`${rel}: no link back to /reference/configuration.`);
    } else if (lastLink < lastHeading) {
      error(
        `${rel}:${lastLink + 1} links to /reference/configuration, but not from the ` +
          `final section ("${lines[lastHeading].slice(3)}") — the page does not close by ` +
          `naming its reference section.`,
      );
    }
  }

  const lines = readFileSync(REFERENCE_DOC, 'utf8').split('\n');
  const rel = relative(ROOT, REFERENCE_DOC);
  let fenced = false;
  let seen = 0;
  let lastHeading = -1;

  /**
   * Check that the section ending just above `end` closes with a → feature-page
   * footer. `end` is the index of the next h2, or `lines.length` for the final
   * section — which is why this is a named helper rather than inline: the last
   * section has no following heading to trigger it, and for a long time was
   * therefore never checked at all.
   */
  const checkFooterAbove = (end, label) => {
    let j = end - 1;
    while (j >= 0 && !lines[j].trim()) j -= 1;
    if (j < 0 || /^#/.test(lines[j])) return; // an empty section
    if (!/\(\/features\//.test(lines[j]))
      error(`${rel}:${end} section ${label} has no → feature-page footer.`);
  };

  lines.forEach((line, i) => {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced || !/^## /.test(line)) return;

    // The footer belongs to the previous section, so the first h2 has none.
    seen += 1;
    lastHeading = i;
    if (seen === 1) return;

    checkFooterAbove(i, `above "${line.slice(3)}"`);
  });

  // The final section is followed by end-of-file rather than by an h2, so the
  // loop above can never reach it.
  if (seen >= 1) {
    checkFooterAbove(lines.length, `"${lines[lastHeading].slice(3)}" (final section)`);
  }
}

// ---------------------------------------------------------------------------
// Check 16 — documented column-only defaults match COLUMN_DEFAULTS
// ---------------------------------------------------------------------------

/**
 * Check 1 reconciles `DEFAULT_CONFIG` only; column-only defaults live in
 * `COLUMN_DEFAULTS` and use `column → key` rows in the reference.
 */
function readColumnDefaults() {
  const src = readFileSync(VIEW_TS, 'utf8');
  const block = src.match(/COLUMN_DEFAULTS[^=]*=\s*\{([\s\S]*?)\n\}/);
  if (!block) {
    console.error(`\n✗ FATAL: could not locate COLUMN_DEFAULTS in ${relative(ROOT, VIEW_TS)}.\n`);
    process.exit(2);
  }

  const out = new Map();
  for (const line of block[1].split('\n')) {
    const m = line.match(/^ {2}([a-z0-9_]+):\s*(.+?),?\s*$/);
    if (m) out.set(m[1], m[2].replace(/,\s*$/, '').trim());
  }
  assertFound(out, 'COLUMN_DEFAULTS keys', VIEW_TS);
  return out;
}

function readColumnRows() {
  const doc = readFileSync(REFERENCE_DOC, 'utf8');
  const out = new Map();
  for (const line of doc.split('\n')) {
    // The arrow is what distinguishes a nested column-only row from a top-level one.
    const m = line.match(/^\|\s*`column\s*→\s*([a-z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|/);
    if (m) out.set(m[1], { type: m[2].trim(), def: m[3].trim() });
  }
  assertFound(out, 'column-only option rows', REFERENCE_DOC);
  return out;
}

/**
 * Column-only options whose default is computed rather than constant, and which
 * therefore have no `COLUMN_DEFAULTS` entry to reconcile against.
 *
 * Listing dynamic rows here keeps every documented row either checked against code or
 * named as an exception.
 */
const DYNAMIC_COLUMN_DEFAULTS = new Map([['min_days_to_show', '`days_to_show`']]);

function checkColumnDefaults(columnDefaults, columnRows) {
  for (const [key, expected] of DYNAMIC_COLUMN_DEFAULTS) {
    if (columnDefaults.has(key)) {
      error(
        `column → ${key}: listed as a dynamic default in check-docs but now has a ` +
          `COLUMN_DEFAULTS entry — drop the exemption so the value is reconciled`,
      );
    } else if (!columnRows.has(key)) {
      error(`column → ${key}: has no row in docs/reference/configuration.md`);
    } else if (normalise(columnRows.get(key).def) !== normalise(expected)) {
      error(
        `column → ${key}: docs say ${columnRows.get(key).def} but its default is ` +
          `${expected}, computed by resolveMinDaysToShow`,
      );
    }
  }

  for (const [key, raw] of columnDefaults) {
    if (!columnRows.has(key)) {
      error(
        `column → ${key}: in COLUMN_DEFAULTS but has no row in docs/reference/configuration.md`,
      );
      continue;
    }
    const { def } = columnRows.get(key);
    if (normalise(def) !== normalise(raw)) {
      error(`column → ${key}: docs say ${def} but COLUMN_DEFAULTS has \`${raw}\``);
    }
  }

  for (const key of columnRows.keys()) {
    if (!columnDefaults.has(key) && !DYNAMIC_COLUMN_DEFAULTS.has(key)) {
      warn(`column → ${key}: documented in the reference but not in COLUMN_DEFAULTS — stale row`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 19 — the weather scope table lists exactly the options each scope has
// ---------------------------------------------------------------------------

/**
 * `weather → date` and `weather → event` are documented as one membership row each,
 * naming their options inline rather than as a row per option. Check 1 reads
 * `DEFAULT_CONFIG` at two-space indent, so it never sees these nested keys, and check 16
 * only understands `column → key` rows — which left the whole weather scope table
 * unreconciled in both directions. It was possible to add a nested weather default and
 * document nothing, or to drop an option from the table and keep shipping it.
 */
function readWeatherScopeDefaults() {
  const src = readFileSync(CONFIG_TS, 'utf8');
  const block = src.match(/\n {2}weather: \{([\s\S]*?)\n {2}\},/);
  if (!block) {
    console.error(
      `\n✗ FATAL: could not locate DEFAULT_CONFIG.weather in ${relative(ROOT, CONFIG_TS)}.\n`,
    );
    process.exit(2);
  }

  const out = new Map();
  for (const scope of ['date', 'event']) {
    const group = block[1].match(new RegExp(`\\n {4}${scope}: \\{([\\s\\S]*?)\\n {4}\\},`));
    if (!group) {
      console.error(
        `\n✗ FATAL: DEFAULT_CONFIG.weather.${scope} not found in ${relative(ROOT, CONFIG_TS)}.\n`,
      );
      process.exit(2);
    }
    const keys = new Set();
    for (const line of group[1].split('\n')) {
      const m = line.match(/^ {6}([a-z0-9_]+):/);
      if (m) keys.add(m[1]);
    }
    if (keys.size === 0) {
      console.error(`\n✗ FATAL: DEFAULT_CONFIG.weather.${scope} parsed to zero keys.\n`);
      process.exit(2);
    }
    out.set(scope, keys);
  }
  return out;
}

function readWeatherScopeRows() {
  const doc = readFileSync(REFERENCE_DOC, 'utf8');
  const out = new Map();
  for (const line of doc.split('\n')) {
    const m = line.match(/^\|\s*`weather\s*→\s*(date|event)`\s*\|([^|]*)\|/);
    if (!m) continue;
    out.set(m[1], new Set([...m[2].matchAll(/`([a-z0-9_]+)`/g)].map((x) => x[1])));
  }
  assertFound(out, 'weather scope rows', REFERENCE_DOC);
  return out;
}

function checkWeatherScopes(scopeDefaults, scopeRows, fields) {
  for (const [scope, keys] of scopeDefaults) {
    const listed = scopeRows.get(scope);
    if (!listed) {
      error(`weather → ${scope}: has no scope row in docs/reference/configuration.md`);
      continue;
    }

    for (const key of keys) {
      if (!listed.has(key)) {
        error(
          `weather → ${scope} → ${key}: in DEFAULT_CONFIG but the scope table does not list it`,
        );
      }
    }

    // A listed option needs no default — `color` has none — but it must be genuinely
    // defaultless, not merely the *other* scope's option. The two lists are similar and
    // hand-maintained, so a copied line is the likely error; WeatherPositionConfig is a
    // union of both scopes and cannot tell them apart on its own.
    const defaultedSomewhere = new Set([...scopeDefaults.values()].flatMap((s) => [...s]));
    for (const key of listed) {
      if (keys.has(key)) continue;
      if (defaultedSomewhere.has(key)) {
        error(
          `weather → ${scope} → ${key}: listed here but it is the other scope's option — ` +
            `it has no DEFAULT_CONFIG.weather.${scope} entry`,
        );
      } else if (!fields.get(key)?.has('WeatherPositionConfig')) {
        error(
          `weather → ${scope} → ${key}: listed in the scope table but is neither a ` +
            `DEFAULT_CONFIG.weather.${scope} key nor a WeatherPositionConfig field`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Validate `AGENTS.md` relative links and warn on duplicated prose sentences. The link
 * check is fatal because a reader would be sent to a missing file; the duplication check is
 * advisory because deliberate repetition is legitimate.
 */
function checkAgentsLinks() {
  const file = join(ROOT, 'AGENTS.md');
  if (!existsSync(file)) return; // the duplication check already errors on this

  const raw = readFileSync(file, 'utf8');

  // Root-absolute (`/features/…`) is the docs-site convention and does not resolve against
  // the repo root; external and pure-fragment targets are out of scope by the same logic.
  const RELATIVE = (t) => !/^(?:https?:|mailto:|#|\/)/.test(t);

  const all = [...raw.matchAll(/\]\(([^)\s]+?)(#[^)\s]*)?\)/g)].map((m) => m[1]);
  const links = all.filter(RELATIVE);

  // A zero here must mean "no links", never "the pattern stopped matching".
  if (all.length === 0) {
    error('AGENTS.md link check found no markdown links at all — the pattern went stale');
    return;
  }

  // Ensure the matcher covers every relative markdown link in the file.
  const relativeInFile = [...raw.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].replace(/#.*$/, ''))
    .filter((t) => t !== '' && RELATIVE(t));
  if (relativeInFile.length !== links.length) {
    error(
      `AGENTS.md link check resolved ${links.length} of ${relativeInFile.length} relative ` +
        `links — the matcher covers only part of the file`,
    );
  }

  for (const target of links) {
    if (!existsSync(join(ROOT, target))) {
      error(`AGENTS.md links to ${target}, which does not exist`);
    }
  }
}

function checkAgentsDuplication() {
  const file = join(ROOT, 'AGENTS.md');
  if (!existsSync(file)) {
    error('AGENTS.md is missing — the duplication check has nothing to read');
    return;
  }
  const raw = readFileSync(file, 'utf8');

  // Fenced code legitimately repeats lines; prose is what this is about.
  const prose = raw.replace(/```[\s\S]*?```/g, ' ');
  const flat = prose.replace(/\s+/g, ' ');

  // Keep short legitimate phrases from colliding.
  const sentences = flat
    .split(/(?<=[.!?]) /)
    .map((x) => x.trim())
    .filter((x) => x.length > 60);

  if (sentences.length === 0) {
    error('AGENTS.md duplication check found no sentences to compare — the splitter broke');
    return;
  }

  const seen = new Map();
  for (const sentence of sentences) seen.set(sentence, (seen.get(sentence) ?? 0) + 1);

  for (const [sentence, count] of seen) {
    if (count > 1) {
      warn(
        `AGENTS.md repeats a sentence ${count}x — usually a splice that duplicated a passage. ` +
          `If the repetition is deliberate, it is legitimate and this is advisory: "${sentence.slice(0, 90)}…"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 28 — the published language counts match the translations that ship
// ---------------------------------------------------------------------------

/**
 * Reconcile every prose language count against the files on disk.
 *
 * These counts are prose, so nothing failed when they drifted — and they drifted through
 * four consecutive releases. The editor count is the one that keeps going wrong, because
 * the obvious derivation is wrong twice over: US English has no translation file (it lives
 * in `src/rendering/editor/strings.ts`), and `en-GB.json` is a ~36-string delta rather than
 * a full translation. Counting the directory undercounts by one; counting only the complete
 * files undercounts by two. The v4 notes shipped "nine editor languages" on exactly that.
 *
 * Two things this deliberately does not do.
 *
 * `RELEASE_NOTES.md` and `guide/whats-new.md` are excluded: they are historical records, and
 * v2.x announcing "8 languages" is a true statement about v2.x. Rewriting them to today's
 * totals would falsify the archive.
 *
 * And it pins named sentences rather than hunting every count, because the docs legitimately
 * count somebody else's languages too — "33 of the 64 languages Home Assistant ships" is
 * about HA's locale data, not this card's translations. Each site must match at least once,
 * so rewording past the pattern fails the gate rather than silently retiring it, which is
 * the contract `check-bundle.mjs` uses for its size claims.
 */
const LANGUAGE_COUNT_SITES = [
  ['README.md', /\[Available in (\d+) languages\]/g, 'card'],
  ['README.md', /The card speaks \[(\d+) languages\]/g, 'card'],
  ['README.md', /and the visual editor (\d+)\b/g, 'editor'],
  ['docs/index.md', /\[Available in (\d+) languages\]/g, 'card'],
  ['docs/architecture.md', /\((\d+) supported languages\)/g, 'card'],
  ['docs/features/editor.md', /available in \*\*(\d+) languages\*\*/g, 'editor'],
  ['docs/features/editor.md', /the calendar itself in \*\*(\d+)\*\*/g, 'card'],
  ['docs/features/editor.md', /not among the (\d+) the editor/g, 'editor'],
  ['docs/features/editor.md', /all (\d+) supported languages/g, 'card'],
  ['docs/contributing.md', /editor is available in (\d+) of the/g, 'editor'],
  ['docs/contributing.md', /^(\d+) languages: English, which lives in code/gm, 'card'],
];

function checkLanguageCounts() {
  const cardDir = join(ROOT, 'src/translations/languages');
  const editorDir = join(ROOT, 'src/rendering/editor/translations');
  const cardFiles = readdirSync(cardDir).filter((f) => f.endsWith('.json'));
  const editorFiles = readdirSync(editorDir).filter((f) => f.endsWith('.json'));
  assertFound(cardFiles, 'card translation files', cardDir);
  assertFound(editorFiles, 'editor translation files', editorDir);

  // +1 for US English, which lives in strings.ts and has no file of its own.
  const truth = { card: cardFiles.length, editor: editorFiles.length + 1 };
  let checked = 0;

  for (const [name, pattern, which] of LANGUAGE_COUNT_SITES) {
    const file = join(ROOT, name);
    if (!existsSync(file)) {
      error(`${name} is missing, so the ${which} language count it publishes cannot be checked.`);
      continue;
    }
    const matches = [...readFileSync(file, 'utf8').matchAll(pattern)];
    if (!matches.length) {
      error(
        `${name} no longer states its ${which} language count in a form this check can read. ` +
          `Update the pattern in LANGUAGE_COUNT_SITES rather than dropping the check — these ` +
          `counts are prose and drifted through four releases unnoticed.`,
      );
      continue;
    }
    for (const match of matches) {
      checked += 1;
      const found = Number(match[1]);
      if (found !== truth[which]) {
        error(
          `${name} says ${found} ${which} languages, but ${truth[which]} ship. ` +
            (which === 'editor'
              ? `That is ${editorFiles.length} translation files plus US English, which lives in ` +
                `src/rendering/editor/strings.ts. en-GB.json is a delta, not a full translation, ` +
                `so the complete-file count is lower again and is not the number to publish.`
              : `Counted from src/translations/languages/*.json.`),
        );
      }
    }
  }
  return checked;
}

/**
 * Print what was inspected, then the errors and warnings.
 *
 * 🚨 **Every clause on the summary line is a count of what was *inspected*, never a
 * verdict on how it came out.** The line is printed before the error list is evaluated,
 * so a clause phrased as an outcome states that outcome on a failing run too, directly
 * above the errors contradicting it — and the summary is what a reader reads first.
 *
 * #547 found this in the release-surface clause and fixed it there, reasoning that the
 * others were safe because "a link that did not resolve is not among the resolved ones".
 * That was not true of this file: the counters increment *before* their error branches,
 * so a broken link is counted like any other. Planting one moved "internal links
 * resolved" from 203 to 204 while the planted link was the thing failing. The same held
 * for the absolute-link, citation, language, enum and example clauses.
 *
 * Reword rather than recount. `checked` also feeds the staleness guards — `if (!checked)`
 * and `if (checked < 20)` both exit 2 meaning "the pattern has gone stale" — so counting
 * only successes would make a run with many genuinely broken links report a stale pattern
 * and send the reader to edit the regex.
 *
 * Clauses that increment only on success (`reachable`, `themed`) and ones that report the
 * size of something parsed (`defaults`, `rows`, `fields`, `docs`, `releases`) are already
 * true as written and are left alone.
 *
 * @param counts - What each check inspected
 * @returns Process exit code
 */
function report(counts) {
  console.log(
    `${counts.defaults} defaults in code, ${counts.rows} rows in the reference, ` +
      `${counts.fields} config fields, ${counts.docs} pages, ${counts.complete} card examples checked, ` +
      `${counts.releases} release lines documented, ${counts.links} internal links checked, ` +
      `${counts.siteLinks} absolute site links checked, ` +
      `${counts.gates} CI gates checked, ` +
      `${counts.enums} enumerated options checked, ` +
      `${counts.sentinels} sentinel rows checked, ` +
      `${counts.runtimeEnums} runtime enum surfaces checked, ` +
      `${counts.removed} removed options checked, ` +
      `${counts.reachable} pages reachable from the navigation, ` +
      `${counts.themed} theme defaults documented, ` +
      `${counts.citations} line citations checked, ` +
      `${counts.languages} language counts checked, ` +
      `${counts.readmeAnchors} README anchor links checked, ` +
      `release surfaces checked against v${counts.version}.\n`,
  );

  if (errors.length) {
    console.log(`${errors.length} error(s):`);
    for (const e of errors) console.log(IN_CI ? `::error::${e}` : `  ✗ ${e}`);
    console.log('');
  }
  if (warnings.length) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log(IN_CI ? `::warning::${w}` : `  ⚠ ${w}`);
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

// ---------------------------------------------------------------------------
// Check 17 — options whose column-view default differs are documented as such
// ---------------------------------------------------------------------------

/**
 * Shared options with column-view default overrides must say so in the reference table.
 */
function readColumnDefaultOverrides() {
  const src = readFileSync(VIEW_TS, 'utf8');
  const block = src.match(/COLUMN_DEFAULT_OVERRIDES[^=]*=\s*\{([\s\S]*?)\n\}/);
  if (!block) {
    console.error(
      `\n✗ FATAL: could not locate COLUMN_DEFAULT_OVERRIDES in ${relative(ROOT, VIEW_TS)}.\n`,
    );
    process.exit(2);
  }

  const out = new Map();
  for (const line of block[1].split('\n')) {
    const m = line.match(/^ {2}([a-z0-9_]+):\s*(.+?),?\s*$/);
    if (m) out.set(m[1], m[2].replace(/,\s*$/, '').trim());
  }
  assertFound(out, 'COLUMN_DEFAULT_OVERRIDES keys', VIEW_TS);
  return out;
}

function checkColumnDefaultOverrides(overrides) {
  const doc = readFileSync(REFERENCE_DOC, 'utf8');
  const descriptions = new Map();
  for (const line of doc.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9_]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (m) descriptions.set(m[1], m[4].trim());
  }

  for (const [key, value] of overrides) {
    const description = descriptions.get(key);
    if (description === undefined) {
      error(
        `${key}: in COLUMN_DEFAULT_OVERRIDES but has no row in docs/reference/configuration.md`,
      );
      continue;
    }
    const required = `Column view defaults this to \`${value}\``;
    if (!description.includes(required)) {
      error(
        `${key}: column view defaults it to \`${value}\`, but its reference row does not say so — ` +
          `the description must contain "${required}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 18 — the release docs describe the version the package actually ships
// ---------------------------------------------------------------------------

/**
 * `package.json` is the single source of truth for the release version, but nothing in
 * this script read it: release notes were reconciled only against What's New, and the
 * README's highlights were not checked at all. A version bump could therefore leave
 * every release surface describing the previous release, and the gap would surface only
 * at tag time, when `extract-release-notes.mjs` fails the release workflow.
 *
 * This moves that failure to the pull request that bumps the version.
 */
function checkReleaseVersion() {
  const pkgPath = join(ROOT, 'package.json');
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  if (!/^\d+\.\d+\.\d+/.test(version || '')) {
    error(`package.json: version "${version}" is not a semver release version.`);
    return null;
  }
  const [major, minor] = version.split('.');
  const line = `${major}.${minor}`;

  const notes = readFileSync(join(DOCS_DIR, 'RELEASE_NOTES.md'), 'utf8');
  // Anchored to the exact version: a patch release needs its own notes section, which
  // is also what the tag-time extractor looks for.
  if (!new RegExp(`^# Calendar Card Pro v${version.replace(/\./g, '\\.')}\\b`, 'm').test(notes)) {
    error(
      `docs/RELEASE_NOTES.md has no "# Calendar Card Pro v${version}" section, but package.json ships ${version}. The release workflow extracts this section by exact version and fails without it.`,
    );
  }

  const whatsNew = readFileSync(join(DOCS_DIR, 'guide/whats-new.md'), 'utf8');
  if (
    !new RegExp(`^## (?:Latest Release: )?v${line.replace('.', '\\.')}\\s*$`, 'm').test(whatsNew)
  ) {
    error(
      `docs/guide/whats-new.md has no "## v${line}" entry, but package.json ships ${version}. The archive must cover every minor line.`,
    );
  }

  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  // Sliced rather than matched with an end anchor: JavaScript has no `\Z`, and `$` under
  // /m would stop at the first line break.
  const start = readme.search(/^## [^\n]*What's New/m);
  if (start === -1) {
    error("README.md: no What's New section found — the landing page must show the highlights.");
  } else {
    const rest = readme.slice(start + 1);
    const next = rest.search(/^## /m);
    const section = next === -1 ? rest : rest.slice(0, next);
    if (!new RegExp(`v${line.replace('.', '\\.')}\\b`).test(section)) {
      error(
        `README.md's What's New section does not mention v${line}, but package.json ships ${version}. The landing page would advertise the previous release.`,
      );
    }
  }
  return version;
}

// ---------------------------------------------------------------------------
// Check 20 — the documented gate list matches the gates CI actually runs
// ---------------------------------------------------------------------------

/**
 * Three files tell a contributor which commands to run before pushing, and all three
 * claim the list is complete: "every npm gate CI runs, so a green local run should mean
 * a green PR". Nothing checked that claim, so adding a step to `ci.yml` silently made all
 * three wrong — which is exactly what happened when `docs:build` was added to CI and the
 * lists were not updated. The promise then inverts: the docs send you to a green local run
 * that still fails the pull request.
 *
 * `ci.yml` is the source of truth. Extra entries fail too, so a list cannot drift by
 * naming a gate CI dropped.
 */
function checkGateLists() {
  const normalize = (line) =>
    line
      .trim()
      .replace(/\s+#.*$/, '')
      .replace(/\s+/g, ' ');

  const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const lines = workflow.split('\n');
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const inline = lines[index].match(/^\s*run:\s*((?:npm|npx)\s.+)$/);
    if (inline) {
      found.push(normalize(inline[1]));
      continue;
    }
    // A step written as a YAML block scalar keeps its commands on the following
    // lines, so matching only `run: <command>` cannot see them: a gate added as
    // `run: |` stayed invisible here while the three lists stayed silently short.
    // Read the block's own lines, but only where the command opens one — the
    // pinning step is a shell script whose `npx npm@10.9.2 install` sits inside an
    // echoed error string, and lifting that would demand contributors run it.
    const opener = lines[index].match(/^(\s*)run:\s*[|>][-+]?\d*\s*$/);
    if (!opener) continue;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() === '') continue;
      if (line.match(/^\s*/)[0].length <= opener[1].length) break;
      const command = line.match(/^\s*((?:npm|npx)\s.+)$/);
      if (command) found.push(normalize(command[1]));
    }
  }
  const gates = found
    // Installing dependencies is not a gate a contributor reruns as a check.
    .filter((command) => command !== 'npm ci')
    // One command named twice is still one gate, so the count stays the number of
    // distinct commands a contributor has to run.
    .filter((command, position, all) => all.indexOf(command) === position);
  assertFound(gates, 'npm gate commands', join(ROOT, '.github/workflows/ci.yml'));

  // Each file states the list once, in the only fenced block that reaches check:bundle.
  for (const file of ['AGENTS.md', 'CONTRIBUTING.md', 'docs/contributing.md']) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const block = [...text.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .find((body) => body.includes('check:bundle'));
    if (!block) {
      error(`${file}: no gate list found — the check cannot run blind, so fix the parser.`);
      continue;
    }
    const listed = block.split('\n').map(normalize).filter(Boolean);
    for (const gate of gates) {
      if (!listed.includes(gate)) {
        error(
          `${file} omits \`${gate}\`, which ci.yml runs. The file promises the list is every gate CI runs, so a contributor following it would push a red pull request.`,
        );
      }
    }
    for (const command of listed) {
      if (!gates.includes(command)) {
        error(`${file} lists \`${command}\`, which ci.yml does not run.`);
      }
    }
  }
  return gates.length;
}

// ---------------------------------------------------------------------------
// Check 21 — every value an option accepts is named in its reference row
// ---------------------------------------------------------------------------

/**
 * String-literal unions in types.ts, keyed by option name.
 *
 * The union is the complete set of values a user may write, so it is the only
 * authority on what the reference row has to list. One level of alias
 * indirection is resolved so `position?: WeatherPosition` is covered too.
 */
function readEnumOptions() {
  const src = readFileSync(TYPES_TS, 'utf8');
  const literals = (text) => (text.match(/'[a-z0-9_-]+'/g) || []).map((s) => s.slice(1, -1));

  const aliases = new Map();
  for (const m of src.matchAll(/^export type ([A-Za-z]+)\s*=\s*([^;]+);/gm)) {
    const values = literals(m[2]);
    if (values.length > 1 && m[2].includes('|')) aliases.set(m[1], values);
  }

  const out = new Map();
  for (const name of [...USER_FACING_INTERFACES, 'ColumnOverrides']) {
    const block = src.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!block) continue;
    for (const line of block[1].split('\n')) {
      const field = line.match(/^\s{2}([a-z0-9_]+)\??:\s*(.+?);\s*(?:\/\/.*)?$/);
      if (!field) continue;
      const type = field[2].trim();
      const values = type.includes('|') ? literals(type) : aliases.get(type) || [];
      if (values.length > 1) out.set(field[1], values);
    }
  }
  assertFound(out, 'enumerated options', TYPES_TS);
  return out;
}

/**
 * An option's own reference row must name every value its type allows.
 *
 * Nothing else can see this. The field is present, so check 2 passes; its default is
 * correct, so check 1 passes; and the feature page may document the value in full.
 * `weather → position` gained `none` and its row still offered the three older values,
 * which is how a reader learns an option cannot do something it can.
 */
function checkEnumValues(enums) {
  const sources = [REFERENCE_DOC, ENTITY_OPTIONS_DOC].map((file) => ({
    file,
    lines: readFileSync(file, 'utf8').split('\n'),
  }));
  let described = 0;

  for (const [field, values] of enums) {
    const found = sources.flatMap(({ file, lines }) =>
      lines
        .filter((line) => new RegExp(`^\\|\\s*\`(?:[a-z0-9_]+ → )?${field}\``).test(line))
        .map((row) => ({ file, row })),
    );
    // Check 2 already requires every option to be documented somewhere.
    if (!found.length) continue;
    described++;
    for (const { file, row } of found) {
      const missing = values.filter((value) => !new RegExp(`\\b${value}\\b`).test(row));
      if (missing.length) {
        error(
          `${relative(ROOT, file)}: the \`${field}\` row never mentions ` +
            `${missing.map((v) => `\`${v}\``).join(', ')}, so a reader cannot discover ` +
            `${missing.length > 1 ? 'those values' : 'that value'}. The type accepts ` +
            `${values.map((v) => `\`${v}\``).join(' | ')}.`,
        );
      }
    }
  }

  if (described === 0) {
    console.error(`\n✗ FATAL: no enumerated option matched a reference row — fix the parser.\n`);
    process.exit(2);
  }
  return described;
}

// ---------------------------------------------------------------------------
// Check 21b — sentinel values on `string` options are named in the reference
// ---------------------------------------------------------------------------

/**
 * Options whose grammar carries a reserved word, and the module that defines it.
 *
 * Check 21 cannot see these. It reads string-literal unions out of `types.ts`, and a
 * sentinel lives inside an option that stays typed `string` precisely so that widening
 * its grammar needs no new key — so `values` comes back empty and the option is never
 * registered. Every other gate passes too: the option is already documented, so check 2
 * is satisfied, and its default is unchanged, so check 1 is. An undocumented sentinel is
 * a completely green build, which is how `show_countdown_allday` once shipped as a table
 * row nobody could find.
 *
 * The literal is read from the source rather than repeated here, so renaming the sentinel
 * in code fails this check instead of silently outdating the docs. Only the pairing of
 * option to module is written down.
 *
 * Which page carries the row is deliberately *not* written down, because writing it down
 * is what left half the corpus unchecked. `label` is per-calendar only and has no row in
 * the reference, so an earlier version named one page per option to avoid demanding a row
 * that is not supposed to exist — and thereby stopped looking at `core-settings.md` for
 * `accent_color`, which has a row in *both* pages. Blanking the sentinel from the
 * per-entity row passed the gate while the identical omission in the reference failed it.
 *
 * So both pages are searched and every row found in either must name the sentinel, with
 * one row somewhere required rather than one row per page. That is how check 21 already
 * reads its two sources, and it satisfies the original concern without the blind spot:
 * `label`'s absence from the reference is simply no row there, not a failure.
 */
const SENTINEL_OPTIONS = [
  {
    fields: ['accent_color'],
    file: 'src/utils/entity-colors.ts',
    constant: 'ENTITY_COLOR_SENTINEL',
  },
  {
    fields: ['label'],
    file: 'src/utils/entity-icons.ts',
    constant: 'ENTITY_ICON_SENTINEL',
  },
];

/**
 * Read each declared sentinel's value out of the module that owns it.
 *
 * @returns {Map<string, string[]>} option name -> its reserved words
 */
function readSentinelOptions() {
  const out = new Map();

  for (const { fields, file, constant } of SENTINEL_OPTIONS) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const match = src.match(new RegExp(`export const ${constant}\\s*=\\s*'([^']+)'`));

    if (!match) {
      console.error(`\n✗ FATAL: ${constant} not found in ${file} — fix the parser.\n`);
      process.exit(2);
    }

    for (const field of fields) {
      out.set(field, [...(out.get(field) ?? []), match[1]]);
    }
  }

  assertFound(out, 'sentinel options', TYPES_TS);
  return out;
}

/**
 * Every row for an option with a sentinel has to name that sentinel, on either page.
 *
 * Rows are matched the same way check 21 matches them, so a per-entity row written
 * `` `entity → accent_color` `` is covered as well as the card-wide one.
 *
 * @param {Map<string, string[]>} sentinels option name -> reserved words
 * @returns {number} rows checked
 */
function checkSentinelValues(sentinels) {
  const sources = [REFERENCE_DOC, ENTITY_OPTIONS_DOC].map((file) => ({
    file,
    lines: readFileSync(file, 'utf8').split('\n'),
  }));
  let checked = 0;

  for (const [field, values] of sentinels) {
    const rows = sources.flatMap(({ file, lines }) =>
      lines
        .filter((line) => new RegExp(`^\\|\\s*\`(?:[a-z0-9_]+ → )?${field}\``).test(line))
        .map((row) => ({ file, row })),
    );

    if (!rows.length) {
      error(
        `No row on either page documents \`${field}\`, which accepts ` +
          `${values.map((v) => `\`${v}\``).join(', ')}.`,
      );
      continue;
    }

    for (const { file, row } of rows) {
      checked++;
      const missing = values.filter((value) => !row.includes(`\`${value}\``));
      if (missing.length) {
        error(
          `${relative(ROOT, file)}: the \`${field}\` row never mentions ` +
            `${missing.map((v) => `\`${v}\``).join(', ')}, so a reader cannot discover that ` +
            `the option accepts it. It is a reserved word, not a value the type system can ` +
            `advertise — nothing else will catch this.`,
        );
      }
    }
  }

  if (checked === 0) {
    console.error(`\n✗ FATAL: no sentinel option matched a reference row — fix the parser.\n`);
    process.exit(2);
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Check 21c — a page that tabulates a runtime enum tabulates all of it
// ---------------------------------------------------------------------------

/**
 * Options whose value set lives in a runtime array rather than a `types.ts` union.
 *
 * Check 21 cannot see these. It reads string-literal unions out of `types.ts`, and
 * `allday_badge` is typed `boolean | string` so that `false` and a treatment name can
 * share one key — so `values` comes back empty and the option is never registered.
 * Check 21b cannot see them either: that reads a single reserved word, not a set.
 *
 * The values are read from the module that owns them, so adding a sixth treatment
 * fails this check instead of silently outdating the docs. Only the pairing of option
 * to module is written down.
 */
const RUNTIME_ENUMS = [
  {
    option: 'allday_badge',
    file: 'src/utils/helpers.ts',
    constant: 'ALLDAY_BADGE_POSITIONS',
    noun: 'positions',
  },
  {
    option: 'allday_badge_style',
    file: 'src/utils/helpers.ts',
    constant: 'ALLDAY_BADGE_STYLES',
    noun: 'treatments',
  },
];

/**
 * Read each declared runtime enum's values out of the module that owns it.
 *
 * @returns {Map<string, {values: string[], noun: string}>} option name -> its values
 */
function readRuntimeEnums() {
  const out = new Map();

  for (const { option, file, constant, noun } of RUNTIME_ENUMS) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const match = src.match(new RegExp(`export const ${constant}\\s*=\\s*\\[([^\\]]+)\\]`));

    if (!match) {
      console.error(`\n✗ FATAL: ${constant} not found in ${file} — fix the parser.\n`);
      process.exit(2);
    }

    const values = (match[1].match(/'[a-z0-9_-]+'/g) || []).map((s) => s.slice(1, -1));
    if (values.length < 2) {
      console.error(
        `\n✗ FATAL: ${constant} parsed to ${values.length} value(s) — fix the parser.\n`,
      );
      process.exit(2);
    }
    out.set(option, { values, noun });
  }

  assertFound(out, 'runtime enums', TYPES_TS);
  return out;
}

/**
 * A page that lists some of an option's values in a table has to list all of them, and
 * any page claiming a count has to claim the right one.
 *
 * Both halves shipped wrong together. `neutral` was added to the reference row and the
 * release notes but not to the feature page's table, which went on offering four
 * treatments and calling them "four" — so the one escape hatch for a calendar whose
 * accent does not suit its title was invisible on the page that exists to explain the
 * option. Every other gate passed: the option is documented, its default is unchanged,
 * and the reference row names all five.
 *
 * Which page carries the table is deliberately not written down — the check locates
 * itself. A page tabulating two or more values is treated as documenting the set and
 * must carry all of them; a page that merely uses one in an example is left alone. That
 * is the same reasoning check 21b records for not naming pages, arrived at from the
 * other side: there the risk was checking too few pages, here it is demanding a table
 * from a page that has no business carrying one.
 *
 * @param {Map<string, {values: string[], noun: string}>} enums
 * @param {string[]} docs markdown pages
 * @returns {number} pages checked
 */
function checkRuntimeEnumTables(enums, docs) {
  const pages = [...docs, join(ROOT, 'README.md')];
  let checked = 0;

  for (const [option, { values, noun }] of enums) {
    const word = NUMBER_WORDS[values.length];

    for (const file of pages) {
      const text = readFileSync(file, 'utf8');
      const rows = values.filter((v) => new RegExp(`^\\| *\`${v}\` *\\|`, 'm').test(text));

      if (rows.length >= 2) {
        checked++;
        const missing = values.filter((v) => !rows.includes(v));
        if (missing.length) {
          error(
            `${relative(ROOT, file)}: the \`${option}\` table lists ${rows.length} of ` +
              `${values.length} values and omits ${missing.map((v) => `\`${v}\``).join(', ')}, ` +
              `so a reader of this page cannot discover ` +
              `${missing.length > 1 ? 'them' : 'it'} at all.`,
          );
        }
      }

      // A count in prose is a claim about the same set, and is wrong the moment the set
      // grows. Matched case-insensitively because it may open a sentence. Counted whether
      // or not it holds, so the reported denominator says how much was actually looked at.
      const claim = text.match(new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\s+${noun}\\b`, 'i'));
      if (claim) {
        checked++;
        if (claim[1].toLowerCase() !== word.toLowerCase()) {
          error(
            `${relative(ROOT, file)}: says "${claim[0]}", but \`${option}\` has ` +
              `${values.length}. Write "${word.toLowerCase()} ${noun}".`,
          );
        }
      }
    }
  }

  if (checked === 0) {
    console.error(`\n✗ FATAL: no runtime enum matched a table or a count — fix the parser.\n`);
    process.exit(2);
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Check 22 — the migration table lists exactly the options the card still reports
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

/**
 * The removed-key maps in config.ts, keyed by the option a user may still have.
 *
 * `findDeprecatedKeys` walks these to tell a reader which option replaced theirs,
 * so they are the authority on what the migration table has to say.
 */
function readDeprecatedMaps() {
  const src = readFileSync(CONFIG_TS, 'utf8');
  const read = (name) => {
    const block = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
    const pairs = new Map();
    if (!block) return pairs;
    for (const m of block[1].matchAll(/^\s{2}([a-z0-9_]+):\s*'([a-z0-9_]+)'/gm))
      pairs.set(m[1], m[2]);
    return pairs;
  };
  const maps = {
    card: read('DEPRECATED_CONFIG_MAP'),
    entity: read('DEPRECATED_ENTITY_CONFIG_MAP'),
  };
  assertFound(maps.card, 'removed card options', CONFIG_TS);
  assertFound(maps.entity, 'removed per-entity options', CONFIG_TS);
  return maps;
}

/**
 * Every removed option must appear in the migration table, naming its replacement.
 *
 * The runtime notice and this table are written from the same map but checked by
 * nothing in common: the test that walks `DEPRECATED_CONFIG_MAP` asserts one message
 * per key it finds, so dropping a key drops an assertion with it and stays green. A
 * reader upgrading from v2 then gets neither a console notice nor a table row, and the
 * option they still have simply stops working with no explanation anywhere.
 */
function checkDeprecatedTable(maps) {
  const page = join(DOCS_DIR, 'features/editor.md');
  const text = readFileSync(page, 'utf8');
  const where = relative(ROOT, page);

  const documented = new Map();
  for (const m of text.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|\s*`([a-z0-9_]+)`\s*\|$/gm)) {
    documented.set(m[1], m[2]);
  }

  for (const [oldKey, newKey] of maps.card) {
    const listed = documented.get(oldKey);
    if (!listed) {
      error(
        `${where}: \`${oldKey}\` is reported at runtime as removed but has no migration ` +
          `table row, so a reader who still has it is told to change something the docs ` +
          `never mention. Add a row pointing at \`${newKey}\`.`,
      );
    } else if (listed !== newKey) {
      error(
        `${where}: the migration table sends \`${oldKey}\` to \`${listed}\`, but the card ` +
          `reports \`${newKey}\`. One of the two is wrong.`,
      );
    }
  }

  for (const [oldKey, newKey] of documented) {
    if (!maps.card.has(oldKey)) {
      error(
        `${where}: the migration table lists \`${oldKey}\` → \`${newKey}\`, but the card no ` +
          `longer reports it, so nobody configuring it is warned. Either restore it to ` +
          `DEPRECATED_CONFIG_MAP or drop the row.`,
      );
    }
  }

  // The count is prose, so nothing else can catch it drifting from the table beneath it.
  const stated = text.match(/^([A-Z][a-z]+) options were removed in v[\d.]+\./m);
  const expected = NUMBER_WORDS[maps.card.size];
  if (stated && expected && stated[1] !== expected) {
    error(
      `${where}: the page opens "${stated[1]} options were removed" while the card reports ` +
        `${maps.card.size}. Write "${expected}".`,
    );
  }

  for (const oldKey of maps.entity.keys()) {
    if (!new RegExp(`\`${oldKey}\`[^\n]*entities`).test(text)) {
      error(
        `${where}: \`${oldKey}\` is also reported on a per-entity entry, but the page never ` +
          `says so, so anyone who set it under \`entities:\` reads the table and concludes ` +
          `it does not apply to them.`,
      );
    }
  }

  return maps.card.size;
}

// ---------------------------------------------------------------------------
// Check 23 — every published page is reachable from the site navigation
// ---------------------------------------------------------------------------

/** Routes deliberately absent from the nav and sidebar. */
const UNLISTED_ROUTES = new Set([
  '/', // home page, reached through the logo and the hero buttons
]);

/**
 * Collect every route the VitePress nav or sidebar points at.
 *
 * @returns {Set<string>} routes with any fragment and trailing slash stripped
 */
function readNavRoutes() {
  const config = readFileSync(VITEPRESS_CONFIG, 'utf8');
  const routes = new Set();
  for (const match of config.matchAll(/link:\s*'(\/[^']*)'/g)) {
    const route = match[1].split('#')[0].replace(/\/$/, '');
    routes.add(route === '' ? '/' : route);
  }
  assertFound(routes, 'navigation links', VITEPRESS_CONFIG);
  return routes;
}

/**
 * Reconcile the published pages against the navigation in both directions.
 *
 * VitePress builds and deploys every markdown file it finds, so a page that nothing
 * links to still ships - reachable only by guessing the URL. Neither `docs:build` nor
 * any other check notices, which is how a documented option can still be undiscoverable.
 *
 * `development/` is the exception, and it has to be excluded rather than listed in
 * UNLISTED_ROUTES: `srcExclude: ['development/**']` keeps those files out of the build
 * entirely, so they have no route to be unreachable from. Demanding a sidebar entry for
 * one would ask the nav to link a page the site never publishes. This was latent until
 * the first design doc since the check was written - the folder was empty, so the check
 * had no instance to be wrong about. Verified by building: `docs:build` emits no
 * `dist/development/` directory at all.
 *
 * @param {string[]} docs absolute paths to every markdown page under docs/
 * @param {Set<string>} routes routes referenced by the navigation
 * @returns {number} pages reachable from the navigation
 */
function checkPageReachability(docs, routes) {
  const published = new Map();
  for (const file of docs.filter((f) => !isExcluded(f, ['development/']))) {
    const route = `/${relative(DOCS_DIR, file)
      .split(sep)
      .join('/')
      .replace(/\.md$/, '')
      .replace(/(^|\/)index$/, '')}`;
    published.set(route.length > 1 ? route.replace(/\/$/, '') : '/', file);
  }
  assertFound(published, 'published routes', DOCS_DIR);

  let reachable = 0;
  for (const [route, file] of published) {
    if (routes.has(route)) {
      reachable += 1;
    } else if (!UNLISTED_ROUTES.has(route)) {
      error(
        `${relative(ROOT, file)} is published but nothing in ` +
          `${relative(ROOT, VITEPRESS_CONFIG)} links to it, so it deploys reachable only by URL - ` +
          `add a sidebar entry for ${route}, or list it in UNLISTED_ROUTES if that is deliberate.`,
      );
    }
  }
  for (const route of routes) {
    if (!published.has(route)) {
      error(
        `${relative(ROOT, VITEPRESS_CONFIG)} links to ${route}, but no page under docs/ builds that route.`,
      );
    }
  }
  return reachable;
}

// ---------------------------------------------------------------------------
// Check 24 — the documented theme defaults match the fallbacks the card ships
// ---------------------------------------------------------------------------

/**
 * Read the custom property table published for theme authors.
 *
 * @returns {Map<string, string>} documented property name to its stated default
 */
function readThemeTable() {
  const doc = readFileSync(THEMING_DOC, 'utf8');
  const rows = new Map();
  for (const match of doc.matchAll(
    /^\|\s*`(--calendar-card-[a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|/gm,
  )) {
    rows.set(match[1], match[2].trim());
  }
  assertFound(rows, 'documented custom properties', THEMING_DOC);
  return rows;
}

/**
 * Collect every fallback the stylesheet supplies for one custom property.
 *
 * Scans for balanced parentheses rather than matching to the next `)`, so a nested
 * `var(--x, var(--y))` and a wrapping `calc(var(--x, 14px) + 4px)` both yield the
 * fallback itself instead of a truncated or over-long fragment.
 *
 * @param {string} css the stylesheet source
 * @param {string} name the custom property to look for
 * @returns {string[]} one entry per site, in source order
 */
function readFallbacks(css, name) {
  const found = [];
  const needle = `var(${name},`;
  let start = css.indexOf(needle);
  while (start !== -1) {
    let depth = 1;
    let index = start + needle.length;
    while (index < css.length && depth > 0) {
      if (css[index] === '(') depth += 1;
      else if (css[index] === ')') depth -= 1;
      if (depth === 0) break;
      index += 1;
    }
    found.push(css.slice(start + needle.length, index).trim());
    start = css.indexOf(needle, index);
  }
  return found;
}

/**
 * Reconcile the published theming table against the stylesheet.
 *
 * These properties are a public contract: themes and card-mod set them by name, and
 * the table tells authors what each one falls back to when they do not. Both halves
 * drift silently. The name is only pinned because tests happen to mention it, and the
 * default is pinned by a test that a developer changing it would update in the same
 * edit - leaving the table stating a value the card no longer ships, with every gate
 * still green. Requiring a single agreed fallback also catches sites drifting apart
 * from each other, which would make the documented default true in only some places.
 *
 * @param {Map<string, string>} rows documented property name to its stated default
 * @returns {number} documented properties reconciled against the stylesheet
 */
function checkThemeDefaults(rows) {
  const css = readFileSync(STYLES_TS, 'utf8');
  let reconciled = 0;
  for (const [name, claimed] of rows) {
    const fallbacks = readFallbacks(css, name);
    if (fallbacks.length === 0) {
      error(
        `${relative(ROOT, THEMING_DOC)} documents ${name}, but ${relative(ROOT, STYLES_TS)} ` +
          `never reads it with a fallback - themes setting it would have no documented default, ` +
          `so rename the table entry or restore the declaration.`,
      );
      continue;
    }
    const distinct = [...new Set(fallbacks)];
    if (distinct.length > 1) {
      error(
        `${name} falls back to ${distinct.map((value) => `\`${value}\``).join(' and ')} at ` +
          `different sites in ${relative(ROOT, STYLES_TS)}, so no single default is true - ` +
          `make the fallbacks agree.`,
      );
      continue;
    }
    if (distinct[0] !== claimed) {
      error(
        `${relative(ROOT, THEMING_DOC)} says ${name} defaults to \`${claimed}\`, but ` +
          `${relative(ROOT, STYLES_TS)} falls back to \`${distinct[0]}\` - update the table.`,
      );
      continue;
    }
    reconciled += 1;
  }
  return reconciled;
}

// Check 25 — no source comment cites a line number that no longer exists

/**
 * Flags `file.ext:NNN` citations in comments that point past the end of the file they
 * name.
 *
 * Line numbers in prose rot silently. The v4 refactor split `render.ts` from ~1050 lines
 * down to 523, and six citations across the test suite were left pointing into empty
 * space — one of them named a README line four times past the end of that file. Nothing
 * failed, because no tool reads comments.
 *
 * This only flags citations that are provably wrong (beyond EOF), not every numeric
 * reference: historical citations to a released tag (`v3.6.0 leaves.ts:324`) and recorded
 * measurement tables are legitimate and stable. The fix for a flagged citation is to name
 * the symbol instead of the line, which is greppable and survives edits.
 *
 * Historical citations opt out by naming their release in the same line, which is why the
 * example above is spelled out in prose rather than shown literally.
 *
 * A citation resolves by path, not by basename, and an ambiguous one is skipped rather than
 * guessed. Six basenames are duplicated across the tree — `events.ts`, `styles.ts`,
 * `weather.ts`, `actions.ts`, `index.ts`, `localize.ts` — each once under
 * `src/rendering/editor/` and once outside it. Matching on the basename alone resolved every
 * one of them to whichever copy the walk reached first, which is the shorter editor schema in
 * five of the six cases, so a correct citation to the 1504-line `src/utils/events.ts` was
 * measured against a 172-line file and reported as past EOF. That is the worst failure mode a
 * gate can have: it rejects correct work, and symmetrically passes a genuinely dead citation
 * into the file that lost the collision.
 */
function checkCitations() {
  const CITE = /([A-Za-z0-9_./-]+\.(?:ts|md|mjs))[: ]+(\d+)/g;
  const SCAN = ['src', 'tests', 'scripts'];
  const lineCounts = new Map();
  const byPath = new Map();
  const basenameCounts = new Map();
  const byBasename = new Map();

  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__snapshots__' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };

  const all = [
    ...SCAN.flatMap((d) => walk(join(ROOT, d))),
    ...walk(DOCS_DIR),
    join(ROOT, 'README.md'),
    join(ROOT, 'AGENTS.md'),
    join(ROOT, 'CONTRIBUTING.md'),
  ];
  for (const file of all) {
    const base = file.slice(file.lastIndexOf(sep) + 1);
    if (!byBasename.has(base)) byBasename.set(base, file);
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    byPath.set(relative(ROOT, file).split(sep).join('/'), file);
  }

  /**
   * Resolves a cited path to a file, or to null when it cannot be resolved unambiguously.
   *
   * Skipping an ambiguous citation is deliberate. Checking it against an arbitrary candidate
   * is what produced the false positives this replaced, and a citation nobody can resolve is
   * not evidence of a stale line number.
   */
  const resolveCitation = (cited) => {
    const norm = cited.replace(/^\.\//, '');
    if (byPath.has(norm)) return byPath.get(norm);
    if (norm.includes('/')) {
      const hits = [...byPath].filter(([path]) => path.endsWith(`/${norm}`));
      return hits.length === 1 ? hits[0][1] : null;
    }
    return basenameCounts.get(norm) === 1 ? byBasename.get(norm) : null;
  };

  let checked = 0;
  for (const file of all) {
    if (!/\.(ts|mjs|md)$/.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const isComment =
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.includes('<!--');
      if (!isComment) return;
      // Historical citations name the release they describe and stay valid forever.
      if (/v\d+\.\d+\.\d+/.test(line)) return;
      for (const match of line.matchAll(CITE)) {
        const target = resolveCitation(match[1]);
        if (!target || target === file) continue;
        if (!lineCounts.has(target)) {
          lineCounts.set(target, readFileSync(target, 'utf8').split('\n').length);
        }
        const total = lineCounts.get(target);
        checked += 1;
        if (Number(match[2]) > total) {
          error(
            `${relative(ROOT, file)}:${i + 1} cites ${match[1]}:${match[2]}, but that file has ` +
              `${total} lines. Name the symbol instead of the line number.`,
          );
        }
      }
    });
  }
  return checked;
}

// Check 26 — no link points into our own GitHub README with a content fragment
//
// The README stopped being the manual in v4: it is a landing page whose sections are
// Overview, Installation, Quick Start, What's New and Contributing, and everything it used
// to document now lives on the docs site. Links written against the old README therefore
// still resolve to a page — GitHub simply ignores an anchor it cannot find and drops the
// reader at the top — so nothing is visibly broken and no check has ever looked.
//
// Check 7 only resolves relative links inside `docs/`, so an absolute link to our own
// repository is outside its reach, and `.github/` metadata is not scanned at all. Three
// links survived that way: two in the release notes and one in the pull request template.
//
// Rather than reimplement GitHub's heading slugger — which would have to agree with it
// about emoji to avoid failing a release for a link that works — this bans the shape. A
// fragment into our own README is always wrong now, because the content it named is on the
// docs site. The bare `#readme` anchor GitHub generates for the repository landing page is
// not a heading link and stays allowed.
function checkReadmeFragmentLinks() {
  const surfaces = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|ya?ml)$/.test(entry.name)) surfaces.push(full);
    }
  };
  walk(join(ROOT, '.github'));
  walk(DOCS_DIR);
  for (const name of ['README.md', 'CONTRIBUTING.md', 'AGENTS.md']) {
    const full = join(ROOT, name);
    if (existsSync(full)) surfaces.push(full);
  }
  assertFound(surfaces, 'documentation and metadata surfaces', ROOT);

  const pattern = /https:\/\/github\.com\/alexpfau\/calendar-card-pro#([\w%-]+)/g;
  let checked = 0;
  for (const file of surfaces) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(pattern)) {
          checked += 1;
          if (match[1] === 'readme') continue;
          error(
            `${relative(ROOT, file)}:${i + 1} links to the GitHub README anchor ` +
              `#${match[1]}, but the README is only a landing page. Link to the ` +
              `matching https://calendar-card-pro.alexpfau.com page instead.`,
          );
        }
      });
  }
  return checked;
}

// ---------------------------------------------------------------------------
// Check 29 — absolute links into the docs site resolve to a real page and heading
// ---------------------------------------------------------------------------

/**
 * Absolute links into the docs site resolve to a real page and heading.
 *
 * Check 7 only sees root-relative markdown links inside `docs/`, and VitePress's own
 * dead-link check sees the same set — so an absolute
 * `https://calendar-card-pro.alexpfau.com/features/weather#some-anchor` was validated by
 * nothing at all. That is not a rare shape: the README and RELEASE_NOTES *must* use
 * absolute URLs, because both also render on GitHub and in HACS where a relative docs
 * path does not resolve. v4 added dozens of them, and a renamed heading anywhere would
 * have shipped as a link into the void from the two most-read pages the project has.
 *
 * Trailing sentence punctuation is trimmed before resolving: these appear in prose, and
 * `…/features/weather.` is a link to the weather page, not to a page called `weather.`.
 *
 * @param docs - Every markdown page under `docs/`
 * @returns How many absolute site links were resolved
 */
function checkAbsoluteSiteLinks(docs) {
  const { anchors } = buildAnchorMap(docs);

  const surfaces = [...docs];
  for (const name of ['README.md', 'CONTRIBUTING.md']) {
    const full = join(ROOT, name);
    if (existsSync(full)) surfaces.push(full);
  }
  assertFound(surfaces, 'surfaces that can carry absolute site links', ROOT);

  const SITE = 'https://calendar-card-pro.alexpfau.com';

  // The excluded set is every delimiter a link can be wrapped in, not just the markdown
  // ones. `>` and a backtick were missing, so the two commonest non-markdown forms — an
  // autolink `<https://…/features/weather>` and a code span — captured their own closing
  // delimiter, and a *correct* link was reported as `/features/weather>`, "no page
  // publishes at". That is the expensive direction: valid prose failing CI. It was latent
  // only because nobody had written either form into a scanned file, while AGENTS.md uses
  // the autolink form twice.
  //
  // Excluding them cannot hide a real broken link: RFC 3986 forbids `<`, `>` and a
  // backtick unencoded in a URI, so no genuine target can contain one. Widening the class
  // to what a URL can actually hold is what makes this safe by construction, rather than
  // patching the two forms that happened to be reported.
  const pattern = new RegExp(`${SITE.replace(/\./g, '\\.')}([^)\\s"'\\]<>\`]*)`, 'g');
  let checked = 0;

  for (const file of surfaces) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(pattern)) {
          const target = match[1].replace(/[.,;:!?]+$/, '');
          const [rawPath, anchor] = target.split('#');
          const path = rawPath.replace(/\/$/, '') || '/';
          checked += 1;

          const where = `${relative(ROOT, file)}:${i + 1}`;

          if (!anchors.has(path)) {
            error(`${where} links to ${SITE}${target}, but no page publishes at ${path}.`);
            continue;
          }
          if (anchor && !anchors.get(path).has(anchor)) {
            error(
              `${where} links to ${SITE}${target}, but #${anchor} is not a heading on ` +
                `that page. Note the site's slugify strips emoji and dots.`,
            );
          }
        }
      });
  }

  // A regex that silently stopped matching would turn this into a no-op, and the README
  // alone carries more than a dozen of these.
  if (checked < 20) {
    console.error(`Found only ${checked} absolute links to ${SITE}. The link pattern is stale.`);
    process.exit(2);
  }

  return checked;
}

function main() {
  const defaults = readDefaults();
  const rows = readReferenceRows();
  const fields = readConfigFields();
  const docs = listDocs();
  assertFound(docs, 'markdown pages', DOCS_DIR);

  checkDefaults(defaults, rows, buildConstantResolver());
  checkColumnDefaults(readColumnDefaults(), readColumnRows());
  checkColumnDefaultOverrides(readColumnDefaultOverrides());
  checkWeatherScopes(readWeatherScopeDefaults(), readWeatherScopeRows(), fields);
  checkCoverage(fields, docs);
  checkFences(docs);
  checkSilentMarkdown(docs);
  const complete = checkCopyableExamples(docs);
  checkReadmeExample();
  const releases = checkWhatsNewCoverage();
  const links = checkInternalLinks(docs);
  const siteLinks = checkAbsoluteSiteLinks(docs);
  checkDesignDocLinks(docs);
  checkNoRawHtml(docs);
  checkAdmonitions(docs);
  checkHeadingStyle(docs);
  checkPageIntros(docs);
  checkSpelling(docs);
  checkOptionTables(docs);
  checkOptionNoun(docs);
  checkCrossLinks(docs);
  checkAgentsDuplication();
  checkAgentsLinks();
  const gates = checkGateLists();
  const readmeAnchors = checkReadmeFragmentLinks();
  const version = checkReleaseVersion();
  const enums = checkEnumValues(readEnumOptions());
  const sentinels = checkSentinelValues(readSentinelOptions());
  const runtimeEnums = checkRuntimeEnumTables(readRuntimeEnums(), docs);
  const removed = checkDeprecatedTable(readDeprecatedMaps());
  const reachable = checkPageReachability(docs, readNavRoutes());
  const themed = checkThemeDefaults(readThemeTable());
  const citations = checkCitations();
  const languages = checkLanguageCounts();

  process.exit(
    report({
      defaults: defaults.size,
      rows: rows.size,
      fields: fields.size,
      docs: docs.length,
      complete,
      releases,
      links,
      siteLinks,
      gates,
      enums,
      sentinels,
      runtimeEnums,
      removed,
      reachable,
      themed,
      citations,
      languages,
      readmeAnchors,
      version,
    }),
  );
}

main();
