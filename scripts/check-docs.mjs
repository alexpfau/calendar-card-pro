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
        warn(
          `${key}: code default is \`undefined\` but docs say "${def}" — verify the runtime fallback is what is described`,
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
 * `docs/guide/whats-new.md` is the card's full history, unlike the README's What's New
 * which is a capped highlights reel. Because it is written by hand at release time and
 * nothing renders it from the release notes, the failure mode is silent: a release ships,
 * `RELEASE_NOTES.md` gains an entry, and the archive quietly stops being an archive.
 *
 * So pin the two together. Every minor line that has release notes must have a heading
 * here — patches fold into their `vX.Y` entry rather than adding one, which is why this
 * compares minor lines rather than exact versions.
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
function checkInternalLinks(docs) {
  const published = docs.filter((f) => !isExcluded(f, ['development/']));

  // route -> set of anchors, e.g. "/features/weather" -> { "weather-integration", ... }
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
    anchors.set(route, slugs);
  }
  assertFound(anchors, 'published routes', DOCS_DIR);

  const LINK = /\[[^\]]*\]\((\/[^)\s]*)\)|<a\s[^>]*href="(\/[^"]*)"/g;
  let checked = 0;

  for (const file of published) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(LINK)) {
      const target = m[1] ?? m[2];
      const [rawPath, anchor] = target.split('#');
      const path = rawPath.replace(/\/$/, '') || '/';
      checked++;

      if (!anchors.has(path)) {
        error(`${relative(ROOT, file)} links to ${target}, but no page publishes at ${path}.`);
        continue;
      }
      if (anchor && !anchors.get(path).has(anchor)) {
        error(
          `${relative(ROOT, file)} links to ${target}, but #${anchor} is not a heading on that page. ` +
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
 * `docs/development/` is excluded from the VitePress site and from check 7, which
 * together left it checked by nothing at all. That was not a theoretical hole: a
 * probe of the tree found **17 broken anchors**, every one of them created when the
 * column-view plan was split into a spec plus an archive and the archive's internal
 * links kept pointing at headings the split had moved or reworded.
 *
 * The exclusion in check 7 is right and stays. These files are not published, so a
 * root-absolute `/features/x` in them is not a site link and resolving it against
 * published routes would be meaningless. What they actually use is **relative** —
 * `./v4-backlog.md#some-heading` and bare `#some-heading` — so that is what this
 * resolves, against the real files and their real headings.
 *
 * Slugs here are **GitHub's**, not VitePress's, and that distinction is the whole
 * reason this check needed writing carefully. These files are never published to the
 * site — they are read on GitHub — and GitHub does *not* collapse runs of hyphens,
 * where VitePress does. Every heading in this corpus uses an em-dash, which both
 * slugifiers drop while leaving the spaces either side, so a real anchor reads
 * `…show_empty_days--my-force-it-on-was-wrong` with a double hyphen. Running the
 * site's `slugifyHeading` over them reports **all 17 cross-references as broken** when
 * every one of them resolves correctly in the tool that renders the file. That was the
 * first result this check produced, and believing it would have meant "fixing" 17
 * working links.
 *
 * Paths are resolved **relative to the linking file**, and the heading map is keyed by
 * each document's path relative to `docs/development/` rather than by its basename
 * (Y11). Keying by basename made the check dishonest in two directions once the
 * directory nested: `./editor-glossary.md` written from inside a subdirectory resolved
 * against the basename map and **passed while being broken on GitHub**, and a link
 * written `../x.md` was not matched by the `./`-only pattern at all, so it was never
 * checked in either direction. The corpus is flat today, so this changes no current
 * result — it stops the check from silently going blind the first time someone nests a
 * file, which is precisely when a link checker has to still work.
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

  // Matches ./x, ../x and bare #anchor. The `../` arm is the Y11 fix: the previous
  // pattern accepted only `./`, so an up-directory link was invisible to the check
  // rather than failing it.
  const LINK = /\[[^\]]*\]\((\.\.?\/[^)\s]+|#[^)\s]+)\)/g;
  let checked = 0;

  // A `../` link can leave the corpus entirely — `verification-practices.md` cites
  // `../../AGENTS.md#reference`, which is a real file with real headings and was
  // unchecked until the pattern above started matching it. Rather than skip those,
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
        error(`${relative(ROOT, file)} links to ${m[1]}, but ${relative(ROOT, abs)} does not exist.`);
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
  if (!checked) {
    console.error(`Found no relative links under ${join(DOCS_DIR, 'development')}.`);
    process.exit(2);
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
        if (/\sstyle="/.test(line))
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
// Checks 12-14 — spelling, option tables, bidirectional cross-links
// ---------------------------------------------------------------------------

/**
 * Check 12: US spelling.
 *
 * The config options are US-spelled (`color`, `vertical_line_color`), so British
 * spelling in the prose around them reads as inconsistent. A hand sweep already
 * missed `Optimised` once, because a case-sensitive grep for `optimised` does not
 * match a capitalised word at the start of a sentence. Hence: case-insensitive.
 */
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
 * The docs settled on "option" as the single term for a card configuration key
 * (106 uses), but prose had drifted into "parameter" (17) and "setting" (39) for
 * the same concept, so the same key was a "parameter" on one page and an
 * "option" on the next.
 *
 * The rule is deliberately narrow: it only fires on a backticked identifier
 * immediately followed by the wrong noun. That is the one construction where the
 * noun unambiguously refers to a card option, which keeps the legitimate uses of
 * these words intact:
 *
 *   - "Home Assistant theme variables (`var(--primary-color)`)" — CSS variables
 *     really are variables, and the backtick follows rather than precedes.
 *   - "the parameters are Home Assistant's own" — action parameters, no backtick.
 *   - "Core Settings" / "Display Settings" — these mirror the editor's own
 *     section labels in `src/translations/languages/en.json`, so renaming them
 *     would make the docs disagree with the UI the reader is looking at.
 *   - "preserves their original properties" — properties of a calendar event,
 *     not of the config.
 *
 * `whats-new.md` and the release notes are exempt: they record what was
 * announced at the time and are not rewritten.
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
 * `check:docs` reconciles documented defaults against the code for the reference
 * page only, so a feature page can omit the Default column entirely and nothing
 * notices — which is exactly what `core-settings.md` did for all ten of its
 * per-entity options.
 *
 * Only tables whose first header cell names an option are inspected, so
 * comparison and release tables are left alone.
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
 * `show_countdown_allday` shipped documented in one place and unreachable from
 * the other. One-directional linking is how that happens, so require the return
 * leg: every feature page points at the reference, and every reference section
 * points back at a feature page.
 */
function checkCrossLinks(docs) {
  for (const file of docs) {
    const rel = relative(ROOT, file);
    if (!rel.startsWith('docs/features/')) continue;
    if (!readFileSync(file, 'utf8').includes('/reference/configuration'))
      error(`${rel}: no link back to /reference/configuration.`);
  }

  const lines = readFileSync(REFERENCE_DOC, 'utf8').split('\n');
  const rel = relative(ROOT, REFERENCE_DOC);
  let fenced = false;
  let seen = 0;
  lines.forEach((line, i) => {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced || !/^## /.test(line)) return;

    // The footer belongs to the *previous* section, so the first h2 has none.
    seen += 1;
    if (seen === 1) return;

    // Walk back to the previous section's last non-blank line.
    let j = i - 1;
    while (j >= 0 && !lines[j].trim()) j -= 1;
    if (j < 0 || /^#/.test(lines[j])) return; // an empty section
    if (!/\(\/features\//.test(lines[j]))
      error(`${rel}:${i} section above "${line.slice(3)}" has no → feature-page footer.`);
  });
}

// ---------------------------------------------------------------------------
// Check 16 — documented column-only defaults match COLUMN_DEFAULTS
// ---------------------------------------------------------------------------

/**
 * Check 1 reconciles `DEFAULT_CONFIG` only, so the four column-only options were
 * unchecked on both sides at once: their defaults live in `COLUMN_DEFAULTS` in
 * `view.ts`, and their rows are written `column → day_gap` rather than as a bare
 * backticked key, which `readReferenceRows` deliberately skips. A wrong default in
 * that table therefore shipped silently — and `day_gap` has already moved once,
 * from 8px to 12px.
 *
 * Errors rather than warns, matching check 1: a documented default that contradicts
 * the code is wrong, not merely suspicious.
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
 * `min_days_to_show` defaults to `days_to_show`, a sibling option — not a value a
 * static table can hold. `resolveMinDaysToShow` owns it instead. Listing it here
 * rather than silently tolerating unmatched rows keeps the reconciliation total:
 * every documented row is either checked against the code or named as an exception,
 * and a new row that matches neither still warns.
 *
 * The documented default must name the option it derives from, so the reader is sent
 * somewhere real rather than to a dash.
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

/**
 * Nothing else in this repo validates `AGENTS.md`, and it is the file every session reads
 * first. A mid-sentence splice in `1e91714` orphaned six lines that began mid-line at
 * `absence. more than in most repos:`; they were live for a full day, on a file two
 * sessions were quoting from closely, and no gate could see them — `check:docs` read the
 * published `docs/` tree, `check:i18n` read `src/`, and nothing opened this file.
 *
 * 🚨 **The intuitive check does not work, and this is the load-bearing detail.** Measured
 * against the real artefact at `f43697b^`, not a synthetic case:
 *
 *     exact duplicate *paragraph*   pre-fix 0   <- misses it entirely
 *     duplicate *sentence*          pre-fix 2   post-fix 0
 *
 * Paragraph comparison finds nothing **because the splice landed mid-sentence**, so
 * paragraph boundaries never align. Anyone reaching for it would conclude the file was
 * clean and file the gap as unfixable.
 *
 * Advisory rather than fatal, matching how `check:i18n` reports translation coverage. A
 * sentence quoted deliberately twice is legitimate and must not fail a build; the file
 * currently has none at this threshold, so this starts green and only speaks up on drift.
 */
/**
 * `AGENTS.md` links out to six documents and **nothing resolved those links** until this
 * check existed — `check:docs` validated the published `docs/` tree and the design docs,
 * and neither walk opens `AGENTS.md`. Verified by breaking one deliberately: the suite
 * stayed green.
 *
 * That matters more since the verification material was split (Y15): the rules live here
 * and the worked instances live in `verification-practices.md`, so a rename that broke the
 * link would leave every rule without the evidence that makes it falsifiable — which is
 * exactly the property the split was meant to preserve.
 *
 * Fatal rather than advisory, unlike the duplication check beside it. A duplicated sentence
 * is a wart; a link into nothing is a reader sent to a file that is not there.
 *
 * Two controls, because they fail differently and the second is the one that bit us. A
 * zero-match guard catches the pattern going stale *entirely*; it cannot catch it going
 * stale *partially*, because the surviving matches keep the count non-zero. The first
 * version of this check required a leading `./`, so `[x](docs/development/gone.md)` was
 * unguarded while seven `./` links kept the zero-guard quiet — verified by appending
 * exactly that link and watching `check:docs` report "Documentation is consistent".
 *
 * The partial case is caught by an invariant instead of a threshold: every relative
 * markdown link the file contains must be one this check resolved, so `matched` and
 * `relative` are two measures of one quantity and drift between them is a coverage hole
 * by construction.
 *
 * That invariant is **vacuous on today's corpus**, and saying so is the point. Every
 * relative link in `AGENTS.md` currently carries a `./`, so narrowing the matcher back
 * loses nothing and the counts still agree — I asserted otherwise in the first draft of
 * this comment, ran it, and got a green from both halves of a mutation that was applied.
 * The falsifier needs a planted violation to discriminate, exactly like the glossary
 * mutations:
 *
 *   append `[probe](docs/architecture.md)` to AGENTS.md   (relative, no `./`, resolves)
 *   narrow `all`'s matcher back to /\]\((\.\/[^)#\s]+)…/
 *   -> "resolved 7 of 8 relative links — the matcher covers only part of the file"
 *
 * Without that appended line both states are green, which is evidence about the corpus
 * and not about the code.
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

  // Partial staleness: a narrower matcher would resolve some links and skip others silently.
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

  // 60 chars is the measured floor: below it, short legitimate phrases collide.
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

function report(counts) {
  console.log(
    `${counts.defaults} defaults in code, ${counts.rows} rows in the reference, ` +
      `${counts.fields} config fields, ${counts.docs} pages, ${counts.complete} complete examples, ` +
      `${counts.releases} release lines documented, ${counts.links} internal links resolved.\n`,
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

// ---------------------------------------------------------------------------
// Check 17 — options whose column-view default differs are documented as such
// ---------------------------------------------------------------------------

/**
 * `COLUMN_DEFAULT_OVERRIDES` is the only place where the default printed in the
 * reference table is *wrong* for one of the two layouts the same card renders —
 * and it is wrong silently. A key listed there does not inherit its top-level
 * value in column view at all: the column default stands until the `column:`
 * block overrides it.
 *
 * Check 16 reconciles `COLUMN_DEFAULTS`, the column-*only* keys, and knows
 * nothing about this constant. That gap is not hypothetical: both entries shipped
 * undocumented, with `show_empty_days` and `split_multiday_events` each
 * advertising `false` in the reference while column view used `true`, and every
 * gate stayed green throughout.
 *
 * The required phrasing is deliberately fixed rather than fuzzy-matched. A rule
 * of "mentions the word column somewhere" passes on a description that merely
 * links to the column page, which is exactly the near-miss that would let this
 * regress. Rewording is still allowed — it just has to carry this clause.
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

function main() {
  const defaults = readDefaults();
  const rows = readReferenceRows();
  const fields = readConfigFields();
  const docs = listDocs();
  assertFound(docs, 'markdown pages', DOCS_DIR);

  checkDefaults(defaults, rows, buildConstantResolver());
  checkColumnDefaults(readColumnDefaults(), readColumnRows());
  checkColumnDefaultOverrides(readColumnDefaultOverrides());
  checkCoverage(fields, docs);
  checkFences(docs);
  const complete = checkCopyableExamples(docs);
  checkReadmeExample();
  const releases = checkWhatsNewCoverage();
  const links = checkInternalLinks(docs);
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

  process.exit(
    report({
      defaults: defaults.size,
      rows: rows.size,
      fields: fields.size,
      docs: docs.length,
      complete,
      releases,
      links,
    }),
  );
}

main();
