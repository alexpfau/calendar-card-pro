#!/usr/bin/env node
/**
 * Terminology evidence for the editor glossary.
 *
 * This is a **one-shot authoring tool, not a gate**. Nothing in CI runs it, and it is
 * committed so the numbers in `docs/development/editor-glossary.md` can be re-derived
 * rather than taken on trust.
 *
 * It answers one question per term: *what does everyone else already call this?* Three
 * artefacts have an opinion, and they are consulted in this order —
 *
 *   1. **Home Assistant's own frontend**, per language. The register an HA card editor
 *      should be written in. Two rules govern its use, both learned the hard way:
 *
 *      - **Rule 1 — reject any value byte-identical to its English.** That is HA's own
 *        translation gap, not evidence. Latvian's table is ~20% English, so without this
 *        the oracle actively injects English into the language it is least able to help.
 *      - **Rule 2 — the domain sense wins.** A term is looked up at a key from the
 *        *calendar* namespace wherever one exists. Reading `event` at HA's `event`
 *        *entity* domain — a button press, a doorbell — rather than at its calendar
 *        domain is what made an earlier pass conclude German should say `Ereignis` when
 *        HA's own calendar UI says `Termin`. The preference order below is Rule 2 made
 *        mechanical, and `HA_KEY` overrides it by hand wherever automatic ranking would
 *        still pick the wrong sense.
 *
 *   2. **The card's own 35 languages** — native-contributed, and the only in-repo second
 *      opinion on the shared vocabulary.
 *   3. **The editor's existing translations** — mined from a 97–100% complete
 *      predecessor, so they are evidence too, not merely the thing being checked.
 *
 * Where those three disagree the glossary records which won and why. Where they agree,
 * the entry is cheap and the session does not have to think about it again.
 *
 * **The corpus is the PyPI wheel, not a live instance.** It is versioned, reproducible,
 * needs no credentials, and — decisively — it carries every translation *fragment*.
 * HA splits its table up, and the card-editor vocabulary a calendar card needs
 * (`Layout`, `Columns`, `Width`, `Background`, `Theme`, `Appearance`) lives almost
 * entirely in the lazily-loaded `lovelace` fragment. A scrape of the core table alone
 * reports those terms as absent, which is a false negative rather than a finding: it
 * moved this probe from 1,889 English keys to 7,341.
 *
 *   pip download home-assistant-frontend==20260128.6 --no-deps
 *   unzip -q home_assistant_frontend-*.whl -d /tmp/hafe
 *   HA_FRONTEND_TRANSLATIONS=/tmp/hafe/hass_frontend/static/translations \
 *     node scripts/l10n-oracle.mjs
 *
 * **Pin the version.** An unpinned `pip download` is not reproducible across
 * environments: behind a corporate proxy the index for this package can stop at an older
 * release, and two people following the same instruction faithfully then get corpora a
 * year apart — 5,884 English keys against 7,341. That is not hypothetical. It is why the
 * key deciding `location` appeared not to exist, and why the glossary records the version
 * beside the evidence. If a key named there does not resolve, compare corpus sizes before
 * concluding the glossary is wrong.
 *
 * Every fragment directory found is loaded, deliberately rather than a hand-picked list:
 * a hand-picked list is how a term gets reported as having no evidence when the evidence
 * was simply in a file nobody opened.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEditorModule } from './load-editor-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.env.HA_FRONTEND_TRANSLATIONS ?? '/tmp/hafe/x/hass_frontend/static/translations';

export const LANGS = ['de', 'et', 'it', 'lt', 'lv', 'nb', 'pl', 'sk', 'sv'];

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    // Arrays are joined rather than skipped. Skipping them is what made an earlier probe
    // report zero matches against the card's strings, where the weekday and month names
    // — 26 real strings per language — are arrays.
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? v.join('|') : v;
  }
  return out;
};

let fragmentDirs;
function fragments() {
  if (fragmentDirs) return fragmentDirs;
  let names;
  try {
    names = readdirSync(BASE);
  } catch {
    console.error(
      `\n  FATAL: no HA frontend translations at ${BASE}.\n` +
        '  See the header of this file for the two commands that fetch them.\n',
    );
    process.exit(2);
  }
  fragmentDirs = ['', ...names.filter((n) => statSync(join(BASE, n)).isDirectory())];
  return fragmentDirs;
}

/** Every fragment of one language's table, merged and flattened to dotted keys. */
export function loadHaLanguage(lang) {
  const merged = {};
  const re = new RegExp(`^${lang}-[0-9a-f]{32}\\.json$`);
  let found = 0;
  for (const frag of fragments()) {
    const dir = frag ? join(BASE, frag) : BASE;
    const file = readdirSync(dir).find((n) => re.test(n));
    if (!file) continue;
    found += 1;
    Object.assign(merged, flatten(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
  }
  // An empty table would make every term look like it had no evidence.
  if (found === 0) {
    console.error(`\n  FATAL: no translation fragment for '${lang}' under ${BASE}.\n`);
    process.exit(2);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

/**
 * The glossary's terms, and where each one's evidence is read from.
 *
 * `HA_KEY` is hand-picked per term because automatic ranking cannot tell a calendar
 * event from an `event` entity. A `null` records that the corpus genuinely has no
 * evidence — checked, not assumed, and worth stating in the glossary because those are
 * the terms nothing external will arbitrate.
 *
 * Order is by measured risk, not by frequency: `time` and `start date` lead because they
 * are where the nine languages were *measured* to diverge, and a term nobody ever decided
 * is more dangerous than a frequent one everybody renders the same way.
 */
export const TERMS = [
  // --- measured trouble spots -----------------------------------------------
  ['time', 'ui.components.selectors.selector.types.time', ['time']],
  ['start date', 'ui.components.date-range-picker.start_date', []],
  // --- core domain nouns ----------------------------------------------------
  ['event', 'ui.components.calendar.event.add', []],
  ['calendar', 'ui.components.calendar.label', []],
  ['entity', 'ui.panel.lovelace.editor.card.generic.entity', []],
  ['weather', 'ui.panel.lovelace.strategy.home.summary_list.weather', ['panel.weather']],
  ['location', 'ui.components.calendar.event.location', ['location']],
  ['description', 'ui.components.calendar.event.description', ['description']],
  ['label', 'ui.components.label-picker.label', ['entity.label']],
  ['all day', 'ui.components.calendar.event.all_day', []],
  ['today', 'ui.components.calendar.today', []],
  // --- view and layout ------------------------------------------------------
  ['layout', 'ui.panel.lovelace.editor.edit_view.type', ['panel.layout']],
  ['columns', 'ui.panel.lovelace.editor.card.grid.columns', []],
  ['list', 'ui.components.media-browser.list', []],
  ['compact', 'ui.panel.lovelace.editor.card.area.display_type_options.compact', []],
  ['position', 'ui.card.cover.position', []],
  ['separator', null, []],
  ['day header', null, []],
  ['progress bar', null, []],
  ['countdown', null, []],
  ['week number', null, []],
  ['today indicator', null, []],
  // --- appearance -----------------------------------------------------------
  ['color', 'ui.panel.lovelace.editor.card.tile.color', ['date.color']],
  ['icon', 'ui.panel.lovelace.editor.card.generic.icon', ['today_indicator_icon']],
  ['background', 'ui.panel.lovelace.editor.edit_view.tab_background', []],
  ['title', 'ui.panel.lovelace.editor.edit_lovelace.title', []],
  ['width', 'ui.panel.lovelace.editor.edit_section.settings.column_span', []],
  ['size', 'ui.panel.config.backup.size', []],
  ['accent', 'ui.components.color-picker.colors.accent', []],
  ['font', null, []],
  ['height', null, []],
  ['opacity', null, []],
  ['spacing', null, []],
  // --- values and verbs -----------------------------------------------------
  ['show', 'ui.components.data-table.settings.show', []],
  ['hide', 'ui.components.data-table.settings.hide', []],
  ['none', 'ui.components.calendar.event.repeat.freq.none', ['week_number_mode.option.none.label']],
  ['default', 'ui.common.default', []],
  ['never', 'ui.components.calendar.event.repeat.end.never', []],
  ['top', 'ui.panel.lovelace.editor.edit_view_header.settings.badges_position_options.top', []],
  [
    'bottom',
    'ui.panel.lovelace.editor.edit_view_header.settings.badges_position_options.bottom',
    [],
  ],
  // --- time -----------------------------------------------------------------
  ['date', 'ui.components.selectors.selector.types.date', []],
  ['month', 'ui.components.calendar.event.repeat.freq.monthly', []],
  ['weekday', 'ui.components.calendar.event.rrule.weekday', []],
  ['week', 'ui.components.date-range-picker.ranges.this_week', []],
];

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Collects every artefact's rendering of every term, per language.
 *
 * @returns One record per term: the HA evidence with Rule 1 applied, and our own
 *   editor's current rendering of the keys whose English *is* the term.
 */
export async function collectEvidence() {
  const ha = Object.fromEntries(['en', ...LANGS].map((l) => [l, loadHaLanguage(l)]));

  // Self-test before any absence is believed. A probe that cannot find a string it is
  // known to contain has not established that anything is missing.
  if (!Object.values(ha.en).includes('Calendar')) {
    console.error('\n  FATAL: self-test failed — "Calendar" is not in the English corpus.\n');
    process.exit(2);
  }

  const { EDITOR_STRINGS } = await loadEditorModule(ROOT);
  const ours = Object.fromEntries(
    LANGS.map((l) => [
      l,
      JSON.parse(readFileSync(join(ROOT, `src/rendering/editor/translations/${l}.json`), 'utf8')),
    ]),
  );
  const card = Object.fromEntries(
    LANGS.map((l) => [
      l,
      JSON.parse(readFileSync(join(ROOT, `src/translations/languages/${l}.json`), 'utf8')),
    ]),
  );

  return TERMS.map(([term, haKey, ourKeys]) => {
    const haEn = haKey ? ha.en[haKey] : undefined;
    if (haKey && haEn === undefined) {
      console.error(`\n  FATAL: HA key '${haKey}' (term '${term}') is not in the corpus.\n`);
      process.exit(2);
    }

    const haValues = {};
    for (const l of LANGS) {
      const v = haKey ? ha[l][haKey] : undefined;
      haValues[l] =
        v === undefined
          ? { kind: 'missing' }
          : v === haEn
            ? { kind: 'english', value: v } // Rule 1: HA's own gap, not evidence
            : { kind: 'ok', value: v };
    }

    // Our own renderings, from the keys whose English is exactly this term plus any
    // explicitly named ones — the nine side by side, which is the only view in which a
    // split on *sense* rather than on vocabulary is visible at all.
    const keys = [
      ...new Set([
        ...Object.keys(EDITOR_STRINGS).filter(
          (k) => EDITOR_STRINGS[k].trim().toLowerCase() === term,
        ),
        ...ourKeys,
      ]),
    ];
    const ourValues = {};
    for (const l of LANGS) {
      ourValues[l] = keys.map((k) => ({ key: k, value: ours[l][k] })).filter((e) => e.value);
    }

    return { term, haKey, haEn, haValues, ourKeys: keys, ourValues, card };
  });
}

// ---------------------------------------------------------------------------

const cell = (v) =>
  v.kind === 'missing' ? '—' : v.kind === 'english' ? `!EN(${v.value})` : v.value;

async function main() {
  const evidence = await collectEvidence();
  const silent = evidence.filter((e) => !e.haKey).map((e) => e.term);
  const ruleOne = [];

  for (const e of evidence) {
    console.log(`\n### ${e.term}`);
    console.log(e.haKey ? `HA  ${e.haKey} = ${JSON.stringify(e.haEn)}` : 'HA  (no evidence)');
    if (e.haKey) {
      console.log(`    ${LANGS.map((l) => `${l}:${cell(e.haValues[l])}`).join('  ')}`);
      for (const l of LANGS) if (e.haValues[l].kind === 'english') ruleOne.push(`${e.term}/${l}`);
    }
    for (const k of e.ourKeys) {
      const row = LANGS.map((l) => {
        const hit = e.ourValues[l].find((x) => x.key === k);
        return `${l}:${hit ? hit.value : '∅'}`;
      });
      console.log(`ours ${k}\n    ${row.join('  ')}`);
    }
  }

  console.log(`\n\n${evidence.length} terms.`);
  console.log(
    `HA has evidence for ${evidence.length - silent.length}; silent on ${silent.length}:`,
  );
  console.log(`  ${silent.join(', ')}`);
  console.log(`\nRule 1 rejections (HA value byte-identical to its English): ${ruleOne.length}`);
  console.log(`  ${ruleOne.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
