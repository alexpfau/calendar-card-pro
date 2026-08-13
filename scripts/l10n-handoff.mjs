#!/usr/bin/env node
/**
 * Per-language starting files for the nine Stage 1 translation sessions.
 *
 * Like `l10n-oracle.mjs` this is an **authoring tool, not a gate**, and it needs the
 * Home Assistant frontend wheel — see that file's header for the two commands.
 *
 *   HA_FRONTEND_TRANSLATIONS=/tmp/hafe/x/hass_frontend/static/translations \
 *     node scripts/l10n-handoff.mjs
 *
 * It exists because the mining yield is small and the oracle evidence is not. Home
 * Assistant's table fills about three of the ~200 strings each language is missing — 1.5%,
 * which is a rounding error — but the *terminology* it carries is what stops nine sessions
 * each re-deriving the same nine answers, and re-deriving them differently.
 *
 * The output is a snapshot, deliberately. It is generated once, committed, and read by the
 * session that owns the language; it is not regenerated and not checked, because the live
 * artefact is `docs/development/editor-glossary.md` and a second checked copy of the same
 * decisions would be one more thing free to drift.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEditorModule } from './load-editor-schema.mjs';
import { loadHaLanguage, LANGS } from './l10n-oracle.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/development');
const GLOSSARY = join(ROOT, 'docs/development/editor-glossary.md');

/** Loose match: case, surrounding whitespace, quote style and trailing stops ignored. */
const normalise = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[.:!?\u2026]+$/, '');

const { EDITOR_STRINGS } = await loadEditorModule(ROOT);

const haEn = loadHaLanguage('en');
// Self-test before believing any absence.
if (!Object.values(haEn).includes('Calendar')) {
  console.error('\n  FATAL: self-test failed — "Calendar" is not in the English corpus.\n');
  process.exit(2);
}

// English text -> HA key. First key wins; the value is what matters, not which key it came
// from, and duplicates carry the same English by construction.
const byEnglish = new Map();
for (const [key, value] of Object.entries(haEn)) {
  if (typeof value !== 'string') continue;
  const n = normalise(value);
  if (!byEnglish.has(n)) byEnglish.set(n, key);
}

// The glossary's decided rows, sliced per language, so a session sees its own column
// without having to read nine.
const glossarySrc = readFileSync(GLOSSARY, 'utf8');
const termsByLang = Object.fromEntries(LANGS.map((l) => [l, []]));
const decidedByTerm = new Map(); // term -> { lang -> form }
const rejectedByLang = Object.fromEntries(LANGS.map((l) => [l, []]));
for (const section of glossarySrc.split(/^### /m).slice(1)) {
  const heading = section.slice(0, section.indexOf('\n'));
  const name = heading.split('—')[0].trim();
  const sense = heading.split('—').slice(1).join('—').trim();
  const header = section.match(/^\|\s*\|([^\n]*)\|\s*$/m);
  if (!header) continue;
  const cols = header[1]
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
  for (const row of section.matchAll(
    /^\|\s*\*\*Decided\*\*(?:\s*\((\w+)\))?\s*\|([^\n]*)\|\s*$/gm,
  )) {
    const which = row[1] ?? name;
    const cells = row[2].split('|').map((c) => c.trim());
    const decided = decidedByTerm.get(which.toLowerCase()) ?? {};
    cols.forEach((lang, i) => {
      if (!termsByLang[lang]) return;
      const cell = cells[i] ?? '—';
      termsByLang[lang].push({ term: which, sense, value: cell });
      if (cell && cell !== '—' && !/^\*.*\*$/.test(cell)) decided[lang] = cell;
    });
    decidedByTerm.set(which.toLowerCase(), decided);
  }
  for (const line of section.matchAll(/^\*\*Rejected:\*\*([^\n]*)$/gm)) {
    for (const pair of line[1].split(';')) {
      const m = pair.match(/([a-z]{2}(?:-[a-z]{2})?)\s*`([^`]+)`/i);
      if (m && rejectedByLang[m[1].toLowerCase()]) rejectedByLang[m[1].toLowerCase()].push(m[2]);
    }
  }
}


const totals = [];
for (const lang of LANGS) {
  const ha = loadHaLanguage(lang);
  const mine = JSON.parse(
    readFileSync(join(ROOT, `src/rendering/editor/translations/${lang}.json`), 'utf8'),
  );

  const missing = Object.keys(EDITOR_STRINGS).filter((k) => mine[k] === undefined);
  const fills = [];
  const dropped = [];
  for (const key of missing) {
    const english = EDITOR_STRINGS[key];
    const haKey = byEnglish.get(normalise(english));
    if (!haKey) continue;
    let value = ha[haKey];
    let source = haKey;
    if (value === undefined) continue;
    // Rule 1. Without this the mine hands Latvian its own English back, dressed as a
    // translation — which is the exact silent-success failure this repo keeps hitting.
    if (value === haEn[haKey]) continue;

    // **The glossary outranks the mine.** Home Assistant's value is evidence; the decided
    // term is a decision, and the two can disagree. Left unfiltered this mine proposed
    // German `Ereignisse` for `compact_events_to_show` — the very word §4 rejects — and
    // Latvian `Izklājums` for `layout` where the glossary decided `Izkārtojums`. Both
    // would have been handed to a session as a starting point and then failed the build.
    const decided = decidedByTerm.get(normalise(english))?.[lang];
    if (decided && decided !== value) {
      value = decided;
      source = 'glossary';
    }

    // A rejected form reaching a session as a *proposal* is worse than no proposal.
    if (rejectedByLang[lang].some((form) => value.includes(form))) {
      dropped.push({ key, english, value, why: 'contradicts a rejected term' });
      continue;
    }

    // HA's table contains unit suffixes and inflected fragments that read as labels only
    // by accident: `ui.components.calendar.event.repeat.interval.daily` is the `days` in
    // "repeat every 3 days", and Latvian abbreviates it to `d.` — useless as a label for
    // *Days*, and not visibly wrong in a diff.
    if (value.length <= 2 || (/\.$/.test(value) && !/\.$/.test(english))) {
      dropped.push({ key, english, value, why: 'looks like an abbreviation or a fragment' });
      continue;
    }

    fills.push({ key, english, value, haKey: source });
  }

  const helpers = missing.filter((k) => k.endsWith('.helper'));
  const undecided = termsByLang[lang].filter((t) => t.value === '—' || /^\*.*\*$/.test(t.value));

  const lines = [];
  lines.push(`# Stage 1 Handoff — \`${lang}\``);
  lines.push('');
  lines.push(
    `Generated by \`scripts/l10n-handoff.mjs\`. A snapshot, not a live artefact: the ` +
      `termbase that governs this work is [\`editor-glossary.md\`](./editor-glossary.md), ` +
      `and that is the file to edit if a decision here turns out wrong.`,
  );
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(
    `- **${Object.keys(mine).length} of ${Object.keys(EDITOR_STRINGS).length}** strings present.`,
  );
  lines.push(
    `- **${missing.length} missing**, of which **${helpers.length} are prose** (\`.helper\`).`,
  );
  lines.push(
    `- The prose is the harder half and is deliberately **last**: by the time you reach it ` +
      `you will have decided every term it refers to.`,
  );
  lines.push(
    `- Work the panel chrome and first-screen labels **first**. A language at 40% coverage ` +
      `looks entirely untranslated if the panel titles are English, and entirely translated ` +
      `if they are not.`,
  );
  lines.push('');
  lines.push('## Mined Strings — Paste These First');
  lines.push('');
  if (fills.length === 0) {
    lines.push(
      "Home Assistant's table fills nothing here that is not already present. That is the " +
        'normal result — the mine yields ~1.5% across all nine languages.',
    );
  } else {
    lines.push(
      `${fills.length} string${fills.length === 1 ? '' : 's'} taken from Home Assistant's own ` +
        `frontend, matched on **English text** and rejected where HA's value was itself ` +
        `untranslated. Check each one reads correctly in context before keeping it.`,
    );
    lines.push('');
    lines.push('```json');
    for (const f of fills) lines.push(`  ${JSON.stringify(f.key)}: ${JSON.stringify(f.value)},`);
    lines.push('```');
    lines.push('');
    lines.push('| key | English | proposed | HA source key |');
    lines.push('|---|---|---|---|');
    for (const f of fills) {
      lines.push(`| \`${f.key}\` | ${f.english} | **${f.value}** | \`${f.haKey}\` |`);
    }
  }
  if (dropped.length > 0) {
    lines.push('');
    lines.push('### Rejected By The Miner');
    lines.push('');
    lines.push(
      'Home Assistant had a value for these and it was thrown away. Listed so the ' +
        'omission is visible rather than silent — if one looks salvageable, it still ' +
        'needs writing by hand.',
    );
    lines.push('');
    lines.push('| key | English | HA offered | why rejected |');
    lines.push('|---|---|---|---|');
    for (const d of dropped) {
      lines.push(`| \`${d.key}\` | ${d.english} | ${d.value} | ${d.why} |`);
    }
  }
  lines.push('');
  lines.push('## Your Terms');
  lines.push('');
  lines.push('Decided once, for all nine languages. Use these; do not re-decide them.');
  lines.push('');
  lines.push('| term | sense | use |');
  lines.push('|---|---|---|');
  for (const t of termsByLang[lang]) {
    lines.push(
      `| ${t.term} | ${t.sense} | ${t.value === '—' ? '**you decide**' : `**${t.value}**`} |`,
    );
  }
  lines.push('');
  if (undecided.length > 0) {
    lines.push('### Undecided — You Own These');
    lines.push('');
    lines.push(
      'Nothing external arbitrates them: Home Assistant has no term, the card has no ' +
        'string, and no other language can supply one. Decide each, then **write it back ' +
        'into the glossary** so the next session finds it decided.',
    );
    lines.push('');
    for (const t of undecided) lines.push(`- **${t.term}** — ${t.sense}`);
    lines.push('');
  }
  lines.push('## Before You Start');
  lines.push('');
  lines.push(
    "1. Read [`editor-glossary.md`](./editor-glossary.md) §3 for this language's " +
      '**casing rule**. It is one decision, not 201.',
  );
  lines.push(
    '2. Fix the pre-existing strings first. `node scripts/check-i18n.mjs` lists every ' +
      'defect it can see in this file by name.',
  );
  lines.push(
    '3. Placeholders (`{count}`, `{width}`), the em dash `—` and `≥` must survive ' +
      'verbatim; the checks fail the build if they do not. Quotation marks should become ' +
      "this language's own, not stay English.",
  );
  lines.push(
    '4. Do not add an entry that is byte-identical to the English. If a word genuinely ' +
      'is the same, say so in `IDENTICAL_TO_ENGLISH_OK` in `scripts/check-i18n.mjs` ' +
      'rather than leaving it ambiguous.',
  );
  lines.push('');

  writeFileSync(join(OUT_DIR, `editor-l10n-${lang}.md`), `${lines.join('\n')}\n`, 'utf-8');
  totals.push({
    lang,
    missing: missing.length,
    helpers: helpers.length,
    fills: fills.length,
    dropped: dropped.length,
    undecided: undecided.length,
  });
}

console.log('lang  missing  prose  mined  dropped  undecided-terms');
for (const t of totals) {
  console.log(
    `${t.lang.padEnd(5)} ${String(t.missing).padStart(7)} ${String(t.helpers).padStart(6)} ` +
      `${String(t.fills).padStart(6)} ${String(t.dropped).padStart(8)} ${String(t.undecided).padStart(16)}`,
  );
}
console.log(`\ntotal mined across nine languages: ${totals.reduce((n, t) => n + t.fills, 0)}`);
