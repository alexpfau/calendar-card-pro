#!/usr/bin/env node
/**
 * i18n integrity check for Calendar Card Pro.
 *
 * Two independent things live here.
 *
 * **Language wiring.** Adding a language touches four places, and three of the four
 * fail *silently*:
 *
 *   1. src/translations/languages/<code>.json  — missing keys render as raw key names
 *   2. src/translations/localize.ts            — import + a LOWERCASE TRANSLATIONS key
 *   3. src/translations/dayjs.ts               — a locale import AND a supportedLocales entry
 *   4. README.md                               — prose, not checked here
 *
 * Omitting 3b is the worst of them: everything works except relative times, which quietly
 * fall back to English. Catalan and Romanian shipped that way for months. Nothing in the
 * build, the type checker or the linter can see any of it, because every one of these is a
 * runtime lookup with a fallback.
 *
 * **Editor strings.** The editor is schema-driven, so the schema *is* its field
 * registry: every panel can be built and walked, and what comes back is exactly the set
 * of keys it will look up. That is checked against `src/rendering/editor/strings.ts` in
 * both directions — a field with no string, and a string no field uses.
 *
 * **Editor translations.** `src/rendering/editor/translations/<code>.json` holds a
 * subset of that table per language, and `lookup` falls back to English per key, so a
 * partial file is safe by design and completeness is reported rather than enforced.
 * What *is* enforced is that a translation can be reached — every key must exist in
 * `strings.ts`, and `lookup` is called to prove it returns the translation rather than
 * the English behind it. That check exists because its absence let a regression ship in
 * silence: the resolution order was inverted, `strings.ts` defines every key, and so all
 * eleven translated languages rendered in English with nothing raised anywhere.
 *
 * The `editor` sections that used to sit inside the language files are an **archive**,
 * in `src/translations/editor-languages/`. They belong to the editor that was replaced
 * and are kept to be mined; 106 of the live keys came out of them. Nothing validates
 * their contents — they label nothing — but nothing in `src/` may import them either,
 * which is checked, because their keys overlap the live namespace by name without
 * matching in meaning.
 *
 * This script's only dependency is esbuild, which is already a devDependency and never
 * reaches the bundle. Run it with:
 *
 *   node scripts/check-i18n.mjs            # errors are fatal, warnings are advisory
 *   node scripts/check-i18n.mjs --strict   # warnings are fatal too
 *
 * Design note: the wiring in localize.ts and dayjs.ts is read out of the TypeScript source
 * with regexes rather than by importing it, because those files are read for their *shape*
 * — which identifier is imported, how a map key is spelled — and importing them would
 * evaluate the shape away. That is only safe because every extraction below fails *loudly*
 * when it cannot find what it expects — see assertFound(). A regex that silently matched
 * nothing would report a clean run over an empty set, which is the one outcome worse than a
 * false alarm. The editor half needs no such caution: it is imported, so there is no
 * pattern to go stale, and it asserts on an empty panel list for the same reason.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEditorModule } from './load-editor-schema.mjs';
import { deriveEnGb } from './en-gb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = join(ROOT, 'src/translations/languages');
const EDITOR_LANG_DIR = join(ROOT, 'src/translations/editor-languages');
const EDITOR_LANG_INDEX_TS = join(ROOT, 'src/translations/editor-languages/index.ts');
const EDITOR_T9N_DIR = join(ROOT, 'src/rendering/editor/translations');
const EDITOR_T9N_INDEX_TS = join(ROOT, 'src/rendering/editor/translations/index.ts');
const SRC_DIR = join(ROOT, 'src');
const LOCALIZE_TS = join(ROOT, 'src/translations/localize.ts');
const DAYJS_TS = join(ROOT, 'src/translations/dayjs.ts');
const PANELS_TS = join(ROOT, 'src/rendering/editor/panels.ts');
const STRINGS_TS = join(ROOT, 'src/rendering/editor/strings.ts');
const GLOSSARY_MD = join(ROOT, 'docs/development/editor-glossary.md');
const REFERENCE_LANG = 'en.json';

const STRICT = process.argv.includes('--strict');
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

const errors = [];
const warnings = [];
const notes = [];
const error = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const read = (path) => readFileSync(path, 'utf-8');

/**
 * The editor's modules, bundled once per run.
 *
 * Two checks need them — the string reconciliation and the translation-reachability
 * gate — and bundling is the expensive part of this script. Cached rather than passed
 * around, so adding a third consumer costs nothing.
 */
let editorModule;
const loadEditor = async () => (editorModule ??= await loadEditorModule(ROOT));

/**
 * Guard against a stale regex silently matching nothing.
 *
 * Every extraction in this file goes through here. If the source is refactored such that a
 * pattern no longer matches, the script says so and exits non-zero instead of reporting a
 * clean run over an empty set.
 */
function assertFound(value, what, file) {
  const empty = value === null || value === undefined || value.length === 0;
  if (empty) {
    console.error(
      `\n  FATAL: could not find ${what} in ${basename(file)}.\n` +
        `  The file was probably refactored and scripts/check-i18n.mjs needs updating.\n` +
        `  Refusing to report a passing run over an empty set.\n`,
    );
    process.exit(2);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Language JSON files on disk, keyed by the lowercased code (en-GB.json -> 'en-gb'). */
function readLanguageFiles() {
  const files = readdirSync(LANG_DIR).filter((f) => f.endsWith('.json'));
  assertFound(files, 'any language JSON files', LANG_DIR);

  const out = new Map();
  for (const file of files.sort()) {
    let data;
    try {
      data = JSON.parse(read(join(LANG_DIR, file)));
    } catch (err) {
      error(file, `is not valid JSON: ${err.message}`);
      continue;
    }
    out.set(basename(file, '.json').toLowerCase(), { file, data });
  }
  return out;
}

/** `import xTranslations from './languages/<file>.json'` plus the TRANSLATIONS map body. */
function readLocalizeWiring() {
  const src = read(LOCALIZE_TS);

  const imports = new Map(); // identifier -> filename
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/languages\/([^']+\.json)'/g)) {
    imports.set(m[1], m[2]);
  }
  assertFound([...imports.keys()], 'language JSON imports', LOCALIZE_TS);

  const block = src.match(/export const TRANSLATIONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  assertFound(block, 'the TRANSLATIONS map', LOCALIZE_TS);

  const entries = new Map(); // map key (as written) -> identifier
  for (const m of block[1].matchAll(/^\s*'?([A-Za-z][A-Za-z-]*)'?\s*:\s*(\w+)\s*,/gm)) {
    entries.set(m[1], m[2]);
  }
  assertFound([...entries.keys()], 'entries in the TRANSLATIONS map', LOCALIZE_TS);

  return { imports, entries };
}

/**
 * Editor-language files on disk, plus how `editor-languages/index.ts` wires them up.
 *
 * The editor's sections were moved out of the language files so they load with the
 * editor's chunk rather than on every dashboard load. That gained a fifth place to get
 * a language wrong, and it fails as quietly as the other four: a file that is never
 * imported is simply never registered, and the editor renders English with nothing
 * raised anywhere.
 *
 * @returns Files on disk, and the imports and map entries in the index module
 */
function readEditorLanguageWiring() {
  const files = readdirSync(EDITOR_LANG_DIR).filter((f) => f.endsWith('.json'));
  assertFound(files, 'any editor-language JSON files', EDITOR_LANG_DIR);

  const src = read(EDITOR_LANG_INDEX_TS);

  const imports = new Map(); // identifier -> filename
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/([^']+\.json)'/g)) {
    imports.set(m[1], m[2]);
  }
  assertFound([...imports.keys()], 'editor-language JSON imports', EDITOR_LANG_INDEX_TS);

  const block = src.match(/export const EDITOR_TRANSLATIONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  assertFound(block, 'the EDITOR_TRANSLATIONS map', EDITOR_LANG_INDEX_TS);

  const entries = new Map(); // map key (as written) -> identifier
  for (const m of block[1].matchAll(/^\s*'?([A-Za-z][A-Za-z-]*)'?\s*:\s*(\w+)\s*,/gm)) {
    entries.set(m[1], m[2]);
  }
  assertFound([...entries.keys()], 'entries in the EDITOR_TRANSLATIONS map', EDITOR_LANG_INDEX_TS);

  return { files, imports, entries };
}

/** dayjs locale imports, the supportedLocales array, and mapLocale's special cases. */
function readDayjsWiring() {
  const src = read(DAYJS_TS);

  const imports = new Set([...src.matchAll(/import\s+'dayjs\/locale\/([^']+)'/g)].map((m) => m[1]));
  assertFound([...imports], 'dayjs locale imports', DAYJS_TS);

  const block = src.match(/const supportedLocales\s*=\s*\[([\s\S]*?)\];/);
  assertFound(block, 'the supportedLocales array', DAYJS_TS);

  const supported = new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assertFound([...supported], 'entries in supportedLocales', DAYJS_TS);

  // mapLocale() special-cases locales that keep their region (zh-cn, zh-tw). Read them from
  // the source rather than hardcoding, so this script tracks mapLocale instead of drifting
  // into a second, stale source of truth.
  const fn = src.match(/function mapLocale\([\s\S]*?\n\}/);
  assertFound(fn, 'the mapLocale function', DAYJS_TS);
  const specialCased = new Set(
    [...fn[0].matchAll(/lowerLocale\s*===\s*'([^']+)'/g)].map((m) => m[1]),
  );
  assertFound([...specialCased], "mapLocale's special-cased locales", DAYJS_TS);

  return { imports, supported, specialCased };
}

/** Replicates mapLocale() from dayjs.ts: keep special cases whole, else take the base code. */
function mapLocale(locale, specialCased) {
  const lower = locale.toLowerCase();
  return specialCased.has(lower) ? lower : lower.split('-')[0];
}

/**
 * Editor string keys the schemas reference, and the panels' own.
 *
 * The schema is the field registry, so this is a real reconciliation rather than a
 * regex over source: every panel is built, for every view and for a spread of
 * configurations chosen to open each of its conditional branches, and every node that
 * comes back is a key that will be looked up.
 *
 * Two keys per node, because `computeLabel` resolves the group-qualified key first and
 * the bare one second — a field inside a flattened group is labelled by its config key
 * without the group name being repeated in the table.
 */
async function readEditorSchemaKeys() {
  const editor = await loadEditor();
  const {
    PANELS,
    walkSchema,
    panelSubforms,
    chassisSubforms,
    CHASSIS_STRINGS,
    EDITOR_STRINGS,
    DEFAULT_CONFIG,
    VIEWS,
    VIEW_SCOPE,
    ENTITY_VIEW_SCOPE,
    DEFAULT_OVERRIDES_BY_VIEW,
  } = editor;

  assertFound(PANELS, 'any registered editor panels', PANELS_TS);
  assertFound(Object.keys(EDITOR_STRINGS), 'any editor strings', STRINGS_TS);

  /** Label keys, each as the pair of candidates `computeLabel` would try. */
  const labels = new Map();
  /** Title keys for collapsible groups, which resolve their own headings. */
  const titles = new Set();
  /** Every key a `.helper` string could actually be looked up under. */
  const helpers = new Set();
  /** Every key that is legitimately the root of a table entry. */
  const roots = new Set();

  /**
   * Records the keys one schema will look up.
   *
   * @param schema - Schema to walk
   * @param path - Label path it is rendered under
   * @param bareHelper - Whether an unqualified `.helper` can be reached from it
   */
  const collect = (schema, path, bareHelper) => {
    for (const { node, path: nodePath } of walkSchema(schema, path)) {
      // A grid is a layout, not a level of labelling: Home Assistant renders no
      // heading for one and passes the label hooks straight through. That is true of
      // a *named* grid too, which is how the weather block nests without drawing a
      // second "Weather" heading inside the Weather panel.
      if (node.type === 'grid' || !node.name) continue;

      // A group resolves its own heading when it is built, so Home Assistant never
      // asks for its label. Its string is `titleKey`, which may differ from its name
      // — two panels nest the same block under different headings — and its helper is
      // asked for under that same key, with no path.
      if (node.titleKey !== undefined) {
        titles.add(node.titleKey);
        helpers.add(node.titleKey);
        roots.add(node.titleKey);
        roots.add(node.name);
        continue;
      }

      const qualified = [...nodePath, node.name].join('.');
      labels.set(qualified, node.name);
      helpers.add(qualified);
      roots.add(qualified);
      roots.add(node.name);

      // The hand-rendered sub-forms resolve helpers by their qualified key alone —
      // see `computeSubformHelper`, and the reason it exists: a per-calendar
      // `show_time` falling back to the bare key would render the card-level helper,
      // which says something broader and, for four of these options, something false.
      if (bareHelper) helpers.add(node.name);
    }
  };

  for (const panel of PANELS) {
    roots.add(panel.titleKey);
    titles.add(panel.titleKey);
    helpers.add(panel.titleKey);
    for (const prefix of panel.strings ?? []) roots.add(prefix);
  }

  // The chassis renders schema of its own — the filter bar — and text of its own around
  // the two hand-written widgets. Both are declared rather than inferred: `entity.copy`
  // and its neighbours were reachable only because the weather panel happens to hold a
  // field named `entity`, which is a root by coincidence and would vanish with a rename.
  for (const subform of chassisSubforms()) collect(subform.schema, subform.path, true);
  for (const prefix of CHASSIS_STRINGS) roots.add(prefix);

  for (const config of probeConfigs(DEFAULT_CONFIG, VIEWS)) {
    for (const panel of PANELS) {
      const ctx = { view: config.view, config, language: 'en' };

      collect(panel.build(ctx), [], true);

      // The two places the editor stops being schema-driven still render schema, and
      // are declared for exactly this reason. Left out, the per-calendar fields and
      // every exception row would be a set of labels nothing reconciles.
      for (const subform of panelSubforms(panel, ctx)) {
        collect(subform.schema, subform.path, false);
      }
    }
  }

  return {
    labels,
    titles,
    helpers,
    roots,
    strings: EDITOR_STRINGS,
    // Merged, because the two tables make the same promise about different surfaces:
    // an option scoped to some views must say which, wherever it is offered.
    viewScope: { ...VIEW_SCOPE, ...ENTITY_VIEW_SCOPE },
    defaultOverridesByView: DEFAULT_OVERRIDES_BY_VIEW,
  };
}

/**
 * Configurations chosen to open every conditional branch in every panel.
 *
 * A panel only offers the fields its configuration calls for — a location's styling
 * appears once locations are shown, a fixed height once the height is fixed — so a
 * single default configuration would walk past most of the editor and report a clean
 * run over a third of it. Booleans are swept both ways together, since no panel gates
 * one field on two switches, and the handful of shape-derived modes are swept
 * individually.
 *
 * @param defaults - The card's default configuration
 * @param views - Every view the card can render
 * @returns Configurations to build each panel against
 */
function probeConfigs(defaults, views) {
  const booleans = Object.entries(defaults)
    .filter(([, value]) => typeof value === 'boolean')
    .map(([key]) => key);

  const allOn = Object.fromEntries(booleans.map((key) => [key, true]));
  const allOff = Object.fromEntries(booleans.map((key) => [key, false]));

  const variants = [
    {},
    allOn,
    allOff,
    { height: '300px' },
    { max_height: '300px' },
    { start_date: '2026-01-01' },
    { start_date: 'today+7' },
    { language: 'de' },
    { time_24h: true },
    { show_week_numbers: 'iso' },
    { remove_location_country: true },
    { remove_location_country: 'Germany' },
    { today_indicator: 'pulse' },
    { today_indicator: 'mdi:star' },
    { today_indicator: '⭐' },
    // The compact event limit is a number with no default, so no boolean sweep reaches
    // it, and the modifier it reveals would be invisible to this check without it.
    { compact_events_to_show: 3 },
    { weather: { ...defaults.weather, entity: 'weather.home', position: 'both' } },
    {
      weather: {
        ...defaults.weather,
        entity: 'weather.home',
        position: 'both',
        date: { ...defaults.weather.date, show_uv_index: true },
        event: { ...defaults.weather.event, show_uv_index: true },
      },
    },
  ];

  const configs = [];
  for (const view of views) {
    for (const variant of variants) {
      configs.push({ ...defaults, view, ...variant });
    }
  }
  return configs;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Every language file must carry every top-level key in en.json, with matching value shapes.
 *
 * `editor` is skipped throughout. Those sections are dormant — they belong to the editor
 * that was replaced, and are kept to be mined during the translation pass — so neither
 * their presence, their absence nor their completeness says anything about the card.
 */
function checkLanguageParity(languages) {
  const reference = languages.get('en');
  if (!reference) {
    error(
      REFERENCE_LANG,
      'is missing — it is the reference every other language is checked against',
    );
    return;
  }

  const refKeys = Object.keys(reference.data).filter((k) => k !== 'editor');
  assertFound(refKeys, 'any translatable keys', join(LANG_DIR, REFERENCE_LANG));

  for (const [code, { file, data }] of languages) {
    if (code === 'en') continue;

    for (const key of refKeys) {
      if (!(key in data)) {
        error(file, `missing top-level key \`${key}\``);
        continue;
      }
      const expected = reference.data[key];
      const actual = data[key];

      if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
          error(file, `\`${key}\` must be an array, got ${typeof actual}`);
        } else if (actual.length !== expected.length) {
          // A short array is an out-of-range read at runtime, e.g. months[11] === undefined.
          error(
            file,
            `\`${key}\` has ${actual.length} entries, expected ${expected.length} — ` +
              `indexes past the end render as "undefined"`,
          );
        } else if (actual.some((v) => typeof v !== 'string' || v.trim() === '')) {
          error(file, `\`${key}\` contains an empty or non-string entry`);
        }
      } else if (typeof actual !== 'string') {
        error(
          file,
          `\`${key}\` must be a string, got ${Array.isArray(actual) ? 'array' : typeof actual}`,
        );
      } else if (actual.trim() === '') {
        error(
          file,
          `\`${key}\` is empty — it will render as a blank string, not fall back to English`,
        );
      }
    }

    for (const key of Object.keys(data)) {
      if (key !== 'editor' && !(key in reference.data)) {
        warn(
          file,
          `has top-level key \`${key}\` which does not exist in ${REFERENCE_LANG} (typo, or dead key?)`,
        );
      }
    }
  }
}

/**
 * The editor's translations must stay off the eager path, and stay wired up.
 *
 * Three separate failures, none of which anything else can see:
 *
 *   1. An `editor` section back in a language file. `localize.ts` imports all 35
 *      statically and `translate()` looks keys up dynamically, so Rollup cannot
 *      tree-shake it — one section reintroduced is ~12 KB added to what every user
 *      downloads and parses on every dashboard load, to label a surface most of them
 *      never open. Nothing breaks, so nothing reports it.
 *   2. A file in `editor-languages/` that `index.ts` never imports or registers. It is
 *      simply never loaded and the editor renders English — the same silent shape as a
 *      language file missing from `TRANSLATIONS`.
 *   3. An editor section for a language the card has no strings for.
 *      `addEditorTranslations` refuses it at runtime, which is a log line nobody reads;
 *      here it is a build failure.
 *
 * @param languages - Language files on disk, keyed by lowercased code
 * @param wiring - Editor-language files and the index module's imports and map entries
 */
function checkEditorLanguageWiring(languages, { files, imports, entries }) {
  for (const [code, { file, data }] of languages) {
    if ('editor' in data) {
      error(
        file,
        'carries an `editor` section again — it is on the eager path, where every user ' +
          'downloads and parses it on every dashboard load. Move it to ' +
          `editor-languages/${file} and register it there (${code})`,
      );
    }
  }

  const importedEditorFiles = new Set([...imports.values()].map((f) => f.toLowerCase()));
  const registered = new Set([...entries.values()]);

  for (const file of files) {
    if (!importedEditorFiles.has(file.toLowerCase())) {
      error(
        'editor-languages/index.ts',
        `${file} exists but is never imported — the editor renders English for that language`,
      );
    }
  }

  for (const [identifier, file] of imports) {
    if (!files.some((f) => f.toLowerCase() === file.toLowerCase())) {
      error('editor-languages/index.ts', `imports ${file}, which does not exist`);
      continue;
    }

    if (!registered.has(identifier)) {
      error(
        'editor-languages/index.ts',
        `${file} is imported as \`${identifier}\` but never added to EDITOR_TRANSLATIONS — ` +
          'nothing registers it, so the editor renders English for that language',
      );
    }
  }

  for (const [key, identifier] of entries) {
    if (key !== key.toLowerCase()) {
      error(
        'editor-languages/index.ts',
        `EDITOR_TRANSLATIONS key '${key}' is not lowercase — lookups lowercase before ` +
          'matching, so it can never be found',
      );
    }

    if (!languages.has(key.toLowerCase())) {
      error(
        'editor-languages/index.ts',
        `EDITOR_TRANSLATIONS has '${key}' but no language file defines it — the card ` +
          'strings for it are missing, so addEditorTranslations refuses the registration',
      );
    }

    if (!imports.has(identifier)) {
      error(
        'editor-languages/index.ts',
        `EDITOR_TRANSLATIONS entry '${key}' names \`${identifier}\`, which is not imported`,
      );
    }
  }
}

/** Every language file must be imported and registered under a lowercase key, and vice versa. */
function checkLocalizeWiring(languages, { imports, entries }) {
  const importedFiles = new Set([...imports.values()].map((f) => f.toLowerCase()));

  for (const [code, { file }] of languages) {
    if (!importedFiles.has(file.toLowerCase())) {
      error('localize.ts', `${file} exists but is never imported — the language is unreachable`);
      continue;
    }
    if (!entries.has(code)) {
      const wrongCase = [...entries.keys()].find((k) => k.toLowerCase() === code);
      if (wrongCase) {
        // getEffectiveLanguage/getTranslations lowercase the requested code before lookup,
        // so a non-lowercase map key can never match.
        error(
          'localize.ts',
          `TRANSLATIONS key '${wrongCase}' must be lowercase ('${code}') — lookups lowercase ` +
            `the requested language, so this entry can never be found`,
        );
      } else {
        error(
          'localize.ts',
          `${file} is imported but has no TRANSLATIONS entry — the language is unreachable`,
        );
      }
    }
  }

  for (const [key, identifier] of entries) {
    if (key !== key.toLowerCase()) {
      error(
        'localize.ts',
        `TRANSLATIONS key '${key}' must be lowercase — lookups lowercase the requested language`,
      );
    }
    const file = imports.get(identifier);
    if (!file) {
      error(
        'localize.ts',
        `TRANSLATIONS entry '${key}' refers to '${identifier}', which is not imported`,
      );
      continue;
    }
    const expected = basename(file, '.json').toLowerCase();
    if (key.toLowerCase() !== expected) {
      error(
        'localize.ts',
        `TRANSLATIONS key '${key}' is wired to ${file} — expected key '${expected}'`,
      );
    }
  }
}

/**
 * Every registered language must resolve to a dayjs locale that is both imported and listed
 * in supportedLocales. Missing either one is silent: relative times fall back to English while
 * everything else keeps working.
 */
function checkDayjsWiring(entries, { imports, supported, specialCased }) {
  for (const code of entries.keys()) {
    const mapped = mapLocale(code, specialCased);

    if (!imports.has(mapped)) {
      error(
        'dayjs.ts',
        `'${code}' maps to dayjs locale '${mapped}', which is not imported — ` +
          `dayjs will fall back to English relative times`,
      );
    }
    if (!supported.has(mapped)) {
      error(
        'dayjs.ts',
        `'${code}' maps to dayjs locale '${mapped}', which is missing from supportedLocales — ` +
          `mapLocale() returns 'en' and relative times silently fall back to English`,
      );
    }
  }

  // The two lists must agree with each other, independently of the translations.
  for (const locale of imports) {
    if (!supported.has(locale)) {
      error(
        'dayjs.ts',
        `'${locale}' is imported but missing from supportedLocales — the import is dead weight`,
      );
    }
  }
  for (const locale of supported) {
    if (!imports.has(locale)) {
      error(
        'dayjs.ts',
        `'${locale}' is in supportedLocales but never imported — dayjs cannot load it`,
      );
    }
  }

  // Bundle hygiene: every dayjs locale is bytes in a single-file bundle.
  const needed = new Set([...entries.keys()].map((c) => mapLocale(c, specialCased)));
  for (const locale of imports) {
    if (!needed.has(locale)) {
      warn('dayjs.ts', `dayjs locale '${locale}' is imported but no translation maps to it`);
    }
  }
}

/**
 * The editor's string table must cover every field, and hold nothing else.
 *
 * Both directions matter and they fail differently. A field with no string renders a
 * humanised key — `Show location` rather than `Show Location` — which is a cosmetic
 * shortfall by design, but a deliberate one for a *missing* string rather than an
 * acceptable resting state, so it is an error here. A string with no field is dead
 * weight that will be translated into every language before anyone notices it labels
 * nothing.
 *
 * Helper text is not required. Most fields have none, and `computeHelper` returning
 * nothing is the normal case rather than a gap.
 *
 * The table is checked directly rather than through `lookup`, which would consult the
 * language files second. Their `editor` sections are dormant — kept to be mined during
 * the translation pass — and several of their keys are spelled the same as the new
 * ones but worded for the editor that used to ship. Resolving through them would let
 * old copy stand in for a string nobody has written yet, and the check would pass.
 */
async function checkEditorStrings() {
  const { labels, titles, helpers, roots, strings, viewScope, defaultOverridesByView } =
    await readEditorSchemaKeys();

  assertFound([...labels.keys()], 'any labelled fields in the editor panels', PANELS_TS);
  assertFound([...titles], 'any panel or group headings', PANELS_TS);

  for (const [qualified, bare] of labels) {
    if (!(qualified in strings) && !(bare in strings)) {
      error(
        'strings.ts',
        `\`${qualified}\` has no label — the field will render as "${humanKey(bare)}"`,
      );
    }
  }

  for (const key of titles) {
    if (!(key in strings)) {
      error(
        'strings.ts',
        `\`${key}\` has no heading — the section will be titled "${humanKey(key)}"`,
      );
    }
  }

  // Applicability notes are keyed by the scope they describe, so they reconcile
  // against VIEW_SCOPE rather than against the schema: a scoped option with no note
  // says nothing about which layout it applies to, which is the whole point of scoping
  // it. `scope.<id>_only` is the shared wording, `scope.<id>_only.<key>` the specific.
  for (const [key, views] of Object.entries(viewScope)) {
    const scopeId = [...views].sort().join('_');
    const general = `scope.${scopeId}_only`;

    roots.add(general);
    roots.add(`${general}.${key}`);

    if (!(general in strings) && !(`${general}.${key}` in strings)) {
      error(
        'strings.ts',
        `\`${key}\` is scoped to ${[...views].join(', ')} but has no applicability note — ` +
          `the editor would say nothing about which layout it applies to`,
      );
    }
  }

  // An option a view has already decided for the user needs saying so beside the
  // shared control, or the control appears to be lying about what the card renders.
  for (const [view, defaults] of Object.entries(defaultOverridesByView)) {
    for (const key of Object.keys(defaults)) {
      const note = `view_default.${view}.${key}`;
      roots.add(note);

      if (!(note in strings)) {
        error(
          'strings.ts',
          `\`${key}\` defaults differently in ${view} view but has no note — the shared ` +
            `control would describe something the card is not doing`,
        );
      }
    }
  }

  for (const key of Object.keys(strings)) {
    // Helper text is checked exactly rather than by prefix. A prefix test would accept
    // `weather.date.helper` on the strength of the `weather.date` heading existing,
    // which is precisely the string nothing can look up: a group's helper is asked for
    // under its own key, so one written against a config key it does not share is dead.
    if (key.endsWith('.helper')) {
      if (!helpers.has(key.slice(0, -'.helper'.length))) {
        error(
          'strings.ts',
          `\`${key}\` can never be looked up — no field or heading resolves its helper ` +
            `under that key`,
        );
      }
      continue;
    }

    if (!isReachable(key, roots)) {
      error(
        'strings.ts',
        `\`${key}\` is not referenced by any panel — no field, panel title or declared ` +
          `panel prefix owns it`,
      );
    }
  }

  return new Set(labels.keys()).size;
}

/**
 * Editor translation files on disk, plus how `translations/index.ts` wires them up.
 *
 * @returns Files on disk, and the imports and map entries in the index module
 */
function readEditorTranslationWiring() {
  const files = readdirSync(EDITOR_T9N_DIR).filter((f) => f.endsWith('.json'));
  assertFound(files, 'any editor translation JSON files', EDITOR_T9N_DIR);

  const src = read(EDITOR_T9N_INDEX_TS);

  const imports = new Map(); // identifier -> filename
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/([^']+\.json)'/g)) {
    imports.set(m[1], m[2]);
  }
  assertFound([...imports.keys()], 'editor translation JSON imports', EDITOR_T9N_INDEX_TS);

  const block = src.match(/export const EDITOR_LANGUAGE_STRINGS[^=]*=\s*\{([\s\S]*?)\n\};/);
  assertFound(block, 'the EDITOR_LANGUAGE_STRINGS map', EDITOR_T9N_INDEX_TS);

  const entries = new Map(); // map key (as written) -> identifier
  for (const m of block[1].matchAll(/^\s*'?([A-Za-z][A-Za-z-]*)'?\s*:\s*(\w+)\s*,/gm)) {
    entries.set(m[1], m[2]);
  }
  assertFound([...entries.keys()], 'entries in EDITOR_LANGUAGE_STRINGS', EDITOR_T9N_INDEX_TS);

  return { files, imports, entries };
}

/** Every `.ts` file under a directory, for the archive-import scan. */
function walkTs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkTs(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/**
 * The live editor's translations: wired up, and — the point of this check — reachable.
 *
 * **This is the check whose absence let a silent regression ship.** The editor resolved
 * `strings.ts` first and the translation files second, and because `strings.ts` defines
 * every key the editor asks for, the second source was never reached: eleven translated
 * languages all rendered in English, in every panel. Nothing failed, because every
 * individual piece was correct — the files existed, were valid JSON, were imported,
 * were registered under lowercase keys. What was wrong was that no key in them could
 * ever be *returned*, and reachability is a property nothing here looked at.
 *
 * Four things are checked, each of which would have caught it alone:
 *
 *   1. **Every key must exist in `EDITOR_STRINGS`.** One that does not is unreachable by
 *      construction: `lookup` is only ever asked for keys the schemas produce, and those
 *      are already reconciled against `EDITOR_STRINGS` in both directions. A translation
 *      outside that table is weight that labels nothing.
 *   2. **`lookup` must actually return the translation.** Asserted by calling it, for
 *      every key of every language, rather than by reasoning about resolution order —
 *      which is exactly what was reasoned about, in a docstring, while the code did the
 *      opposite of what the docstring said. A check that calls the function cannot go
 *      stale the way that prose did.
 *   3. **No `en.json`.** English lives in `strings.ts` alone. Two English tables can
 *      disagree and the loser does so silently; the previous namespace kept both, and
 *      they drifted apart on 41 of the 94 keys they shared — two of them, `language` and
 *      `language_mode`, ending up with each other's meanings.
 *   4. **Nothing in `src/` may import the archive.** `editor-languages/` is the previous
 *      editor's namespace, kept for mining. Its keys overlap these by name without
 *      matching in meaning, so importing it is not a fallback but a source of wrong
 *      labels — and it cost 145 KB of `editor.js` while resolving nothing.
 *
 * Coverage is reported, never enforced. Per-key fallback is what makes a partial
 * language safe, and the ruling is explicit: show the language, and fall back to English
 * only for the individual strings it is missing.
 *
 * @param languages - Language files on disk, keyed by lowercased code
 */
async function checkEditorTranslations(languages) {
  const { files, imports, entries } = readEditorTranslationWiring();
  const { EDITOR_STRINGS, EDITOR_LANGUAGE_STRINGS, lookup } = await loadEditor();

  assertFound(Object.keys(EDITOR_STRINGS), 'any editor strings', STRINGS_TS);

  const imported = new Set(imports.values());
  const total = Object.keys(EDITOR_STRINGS).length;

  for (const file of files.sort()) {
    const code = basename(file, '.json').toLowerCase();
    const where = `editor/translations/${file}`;

    if (code === 'en') {
      error(
        where,
        'English belongs in strings.ts and nowhere else — two English tables can ' +
          'disagree, and the one that loses does so silently',
      );
      continue;
    }

    if (!imported.has(file)) {
      error(
        where,
        'exists but is never imported by translations/index.ts — the language renders ' +
          'in English with nothing raised anywhere',
      );
      continue;
    }

    if (!languages.has(code)) {
      error(
        where,
        `no card translations exist for '${code}' — add src/translations/languages/` +
          `${file} and wire it into localize.ts`,
      );
    }

    let data;
    try {
      data = JSON.parse(read(join(EDITOR_T9N_DIR, file)));
    } catch (err) {
      error(where, `is not valid JSON: ${err.message}`);
      continue;
    }

    if (EDITOR_LANGUAGE_STRINGS[code] === undefined) {
      error(
        'editor/translations/index.ts',
        `${file} is imported but '${code}' is not a key of EDITOR_LANGUAGE_STRINGS, or ` +
          'is spelled with a capital — lookups lowercase before matching, so the ' +
          'language renders English',
      );
      continue;
    }

    const keys = Object.keys(data);
    let sound = true;

    for (const key of keys) {
      if (typeof data[key] !== 'string' || data[key].trim() === '') {
        error(where, `\`${key}\` is not a non-empty string`);
        sound = false;
        continue;
      }

      if (!(key in EDITOR_STRINGS)) {
        error(
          where,
          `\`${key}\` is not a key in strings.ts — nothing in the editor looks it up, ` +
            'so this translation can never be shown',
        );
        sound = false;
      }
    }

    // The end-to-end assertion. Everything above can pass while the resolution order
    // still hands back English, which is precisely what shipped.
    if (sound) {
      for (const key of keys) {
        const resolved = lookup(code, key);
        if (resolved !== data[key]) {
          error(
            where,
            `lookup('${code}', '${key}') returns ${JSON.stringify(resolved)} rather than ` +
              `${JSON.stringify(data[key])} — the translation is unreachable at runtime`,
          );
          break;
        }
      }
    }

    notes.push(
      `  ${code.padEnd(6)} ${String(keys.length).padStart(3)} / ${total} strings ` +
        `(${String(Math.round((keys.length / total) * 100)).padStart(2)}%)`,
    );
  }

  for (const [key, identifier] of entries) {
    if (key !== key.toLowerCase()) {
      error(
        'editor/translations/index.ts',
        `EDITOR_LANGUAGE_STRINGS key '${key}' is not lowercase — lookups lowercase ` +
          'before matching, so it can never be found',
      );
    }
    if (!imports.has(identifier)) {
      error(
        'editor/translations/index.ts',
        `EDITOR_LANGUAGE_STRINGS entry '${key}' names \`${identifier}\`, which is not imported`,
      );
    }
  }

  for (const [identifier, file] of imports) {
    if (![...entries.values()].includes(identifier)) {
      error(
        'editor/translations/index.ts',
        `imports ${file} as \`${identifier}\` but never adds it to EDITOR_LANGUAGE_STRINGS`,
      );
    }
  }

  // The archive must stay inert. Scanned across all of `src/` rather than at the
  // editor's entry alone, because the build graph reaches further than one file and an
  // import anywhere in it puts 145 KB of unreachable JSON back into the bundle.
  for (const path of walkTs(SRC_DIR)) {
    if (path.startsWith(EDITOR_LANG_DIR)) continue;
    if (/from\s+'[^']*editor-languages[^']*'/.test(read(path))) {
      error(
        path.slice(SRC_DIR.length + 1),
        'imports src/translations/editor-languages/, which is an archive of the previous ' +
          'editor\u2019s namespace — its keys overlap the live ones by name without ' +
          'matching in meaning, and importing it costs 145 KB of editor.js',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Translation quality — structure, orthography and terminology
// ---------------------------------------------------------------------------

/**
 * Values that are legitimately byte-identical to their English.
 *
 * Keyed `lang:key`, and deliberately tiny. Every entry is a loanword the language
 * genuinely uses, not a gap — the whole point of the check above it is that an untranslated
 * string and a correctly-identical one are indistinguishable by machine, so each one is
 * reviewed once, here, in a diff.
 *
 * `Layout` is the word in German, Italian, Norwegian and Swedish. Home Assistant's own
 * tables leave it untranslated in German and Swedish for the same reason, which
 * corroborates it independently.
 *
 * **Three of these are not about language at all**, and the German session hit all three
 * the moment it reached full coverage: `width_table.at_least` is `≥ {width} px`,
 * `width_table.below` is `< {width} px`, and `week_number_mode.option.iso.label` is
 * `ISO 8601`. A symbol with a placeholder and the name of an ISO standard are the same in
 * every one of the nine, so **every remaining language session will need the same three
 * entries** — the list grows by 27 where 3 would do. If that becomes tiresome, the fix is
 * a key-level set checked before the `lang:key` one rather than nine more lines each; it
 * is left as a judgement for whoever reaches it, because three entries is not yet worth a
 * second mechanism.
 *
 * `view` is `Layout` for the same reason `panel.layout` is, and will recur for `it`, `nb`
 * and `sv`: it is a key those languages had not translated when this list was written.
 */
const IDENTICAL_TO_ENGLISH_OK = new Set([
  'de:panel.layout',
  'it:panel.layout',
  'nb:panel.layout',
  'sv:panel.layout',

  // German, Stage 1. `Label` is a loanword HA German uses throughout with German
  // inflection — `Label hinzufügen`, `Keine Labels verfügbar` — which is what
  // distinguishes it from an untranslated string; see editor-glossary.md §5, `label`.
  'de:entity.label',
  'de:view',

  // Swedish and Norwegian, Stage 1. `Layout` is the ordinary word in both — the glossary's
  // `layout` row records it as the Rule 1 false-positive case, where HA leaves the English
  // because the loanword *is* the target word rather than because it has no translation.
  'sv:view',
  'nb:view',

  // Language-independent: a comparison symbol with a placeholder, and a standard's name.
  'de:width_table.at_least',
  'de:width_table.below',
  'de:week_number_mode.option.iso.label',

  'pl:width_table.at_least',
  'pl:width_table.below',
  'pl:week_number_mode.option.iso.label',
  'sv:width_table.at_least',
  'sv:width_table.below',
  'sv:week_number_mode.option.iso.label',
  'nb:width_table.at_least',
  'nb:width_table.below',
  'nb:week_number_mode.option.iso.label',
]);

/**
 * Keys where the decided term is deliberately *qualified* rather than used bare.
 *
 * Distinct from `IDENTICAL_TO_ENGLISH_OK`: the term is still used, with a word added so
 * two settings stay distinguishable. This exists because two checks here can genuinely
 * pull in opposite directions, and the tie has to be broken per key rather than by
 * weakening either one.
 *
 * The English table distinguishes a *field* from a *picker option* with an article —
 * `Icon` names which icon, `An Icon` is an answer to "what kind?". **A language without
 * articles cannot carry that distinction**, so both collapse onto the decided term and
 * `checkCollapsedLabels` correctly reports settings the user cannot tell apart. German
 * never hits it: `Symbol` against `Ein Symbol` keeps them separate for free.
 *
 * Qualifying the field is what gives way, because the option labels are answers in a
 * list where an added word would read as invented, and because the field's own siblings
 * are already qualified — `Kolor wskaźnika`, `Rozmiar wskaźnika`, `Pozycja wskaźnika`,
 * so `Ikona wskaźnika` is the *more* consistent of the two, not a concession.
 *
 * Falsifier, thirty seconds: set `pl:today_indicator_icon` to the bare `Ikona` and run
 * this script. The collapsed-label warning it raises is the defect this entry avoids.
 */
const GLOSSARY_QUALIFIED_OK = new Set([
  // Polish, Stage 1. `Ikona` alone collides with `entity.label_type.option.icon.label`
  // and `today_indicator_style.option.icon.label`, both `An Icon`.
  'pl:today_indicator_icon',
]);

/**
 * Characters whose loss changes what a string means, rather than how it looks.
 *
 * Derived from the English rather than hardcoded, because a hardcoded list goes stale in
 * the direction that cannot be seen: an earlier reading of this table named `→` and a
 * non-breaking space among the glyphs at risk, and **neither occurs anywhere in it**. A
 * check guarding those would have guarded nothing while reporting success.
 *
 * A character counts as structural when it is non-ASCII and is neither a letter nor a
 * combining mark — so `—` and `≥` qualify, and every accented letter a translation
 * legitimately introduces does not. Quotation marks are excluded and handled separately,
 * because German `„…“`, Polish `„…”` and Swedish `”…”` are all correct and a check that
 * demanded the English `“…”` would be enforcing a calque.
 */
const structuralGlyphs = (text) =>
  [...text].filter(
    (ch) => ch.codePointAt(0) > 127 && !/[\p{L}\p{M}]/u.test(ch) && !/["'“”‘’„«»]/u.test(ch),
  );

const placeholders = (text) => (text.match(/\{[a-z_]+\}/g) ?? []).sort();

/**
 * Structural integrity, orthography and terminology, per language.
 *
 * These are separate axes and are checked separately, which is not a stylistic preference
 * but a correction: Polish agrees with Home Assistant on essentially every term while
 * title-casing 80% of its multi-word labels, so a vocabulary check that reported Polish
 * clean would be right and useless. Worse, the analysis that first measured the
 * terminology case-folded both sides, which hid the one disagreement that *was* purely
 * capitalisation — in Polish. **A comparison that normalises away the property you are
 * also trying to measure cannot report on it**, so nothing below shares a normaliser and
 * every comparison here is case-sensitive.
 *
 * @param languages - Language files on disk, keyed by lowercased code
 * @param glossary - The parsed termbase
 */
async function checkTranslationQuality(languages, glossary) {
  const { EDITOR_STRINGS } = await loadEditor();

  for (const file of readdirSync(EDITOR_T9N_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const code = basename(file, '.json').toLowerCase();
    if (code === 'en' || code === 'en-gb') continue; // en-GB is generated and asserted whole
    if (!languages.has(code)) continue;

    const where = `editor/translations/${file}`;
    let data;
    try {
      data = JSON.parse(read(join(EDITOR_T9N_DIR, file)));
    } catch {
      continue; // already reported by checkEditorTranslations
    }

    const multiWordLabels = [];
    let calques = 0;

    for (const [key, value] of Object.entries(data)) {
      const english = EDITOR_STRINGS[key];
      if (typeof english !== 'string' || typeof value !== 'string') continue;

      // --- placeholders ---------------------------------------------------
      const want = placeholders(english);
      const got = placeholders(value);
      if (want.join('|') !== got.join('|')) {
        error(
          where,
          `\`${key}\` has placeholders ${JSON.stringify(got)} but the English has ` +
            `${JSON.stringify(want)} — a renamed or dropped placeholder renders as ` +
            'literal text to the user',
        );
      }

      // --- structural glyphs ----------------------------------------------
      for (const glyph of new Set(structuralGlyphs(english))) {
        if (!value.includes(glyph)) {
          error(
            where,
            `\`${key}\` drops ${JSON.stringify(glyph)}, which the English uses ` +
              'structurally — an ASCII substitute changes what the string says',
          );
        }
      }

      // --- typographic quotes ASCII-ified ---------------------------------
      if (/[“”‘’]/u.test(english) && /["']/.test(value)) {
        warn(
          where,
          `\`${key}\` uses an ASCII quote where the English is typographic — use the ` +
            "target language's own quotation marks rather than \" or '",
        );
      }

      // --- untranslated English -------------------------------------------
      if (value === english && !IDENTICAL_TO_ENGLISH_OK.has(`${code}:${key}`)) {
        error(
          where,
          `\`${key}\` is byte-identical to the English — either translate it, or add ` +
            `'${code}:${key}' to IDENTICAL_TO_ENGLISH_OK with a reason if the word is ` +
            'genuinely the same in this language',
        );
      }

      // --- length ceiling (advisory) --------------------------------------
      if (!key.endsWith('.helper') && value.length > 24 && value.length > english.length * 2.2) {
        warn(
          where,
          `\`${key}\` is ${value.length} characters against the English's ` +
            `${english.length} — long labels break the editor's layout before they ` +
            'break anything else',
        );
      }

      // --- orthography: the Title Case calque ------------------------------
      if (!key.endsWith('.helper') && value.trim().split(/\s+/).length > 1) {
        multiWordLabels.push(key);
        const rest = value.trim().split(/\s+/).slice(1);
        const capitalised = rest.filter((word) => {
          const bare = word.replace(/^[(["'«„-]+/, '').replace(/[)\].,:;!?"'»“”-]+$/, '');
          if (!bare) return false;
          if (/^[A-Z0-9]{2,}$/.test(bare)) return false; // UV, CSS — correct as-is
          return bare[0] === bare[0].toUpperCase() && bare[0] !== bare[0].toLowerCase();
        });
        if (capitalised.length > 0) calques += 1;
      }
    }

    // Reported per language rather than per string: one string with a capital is noise,
    // four in five is a systematic calque of English orthography.
    if (!glossary.nounCapsLanguages.has(code) && multiWordLabels.length >= 20) {
      const rate = Math.round((calques / multiWordLabels.length) * 100);
      if (rate > 15) {
        warn(
          where,
          `${rate}% of multi-word labels capitalise a non-initial word ` +
            `(${calques} of ${multiWordLabels.length}). ${code} uses sentence case — ` +
            'this is English orthography calqued onto it, not a translation choice',
        );
      }
    }

    checkGlossaryAdherence(where, code, data, EDITOR_STRINGS, glossary);
    checkCollapsedLabels(where, data, EDITOR_STRINGS);
  }
}

/**
 * Two different settings rendered with the same label.
 *
 * Distinct English collapsing to one translation makes two controls indistinguishable in
 * the editor, which is a worse failure than an awkward wording: the user cannot tell which
 * one they are changing. Slovak shipped `weekday_color` and `weekend_weekday_color` both
 * as `Farba pracovného dňa`.
 *
 * **Pairs whose English differs only in capitalisation are excluded**, because those are a
 * defect in `strings.ts` rather than in any translation — `height_mode.option.maximum.label`
 * says `Maximum height` where `card_max_height` says `Maximum Height`, so every one of the
 * nine languages collapses them correctly and flagging it would blame nine files for one
 * English inconsistency.
 *
 * A warning rather than an error: a shorter label can be right when the panel it sits in
 * already supplies the context the English spells out.
 */
function checkCollapsedLabels(where, data, strings) {
  const byValue = new Map();
  for (const key of Object.keys(data)) {
    if (key.endsWith('.helper') || !(key in strings)) continue;
    const list = byValue.get(data[key]) ?? [];
    list.push(key);
    byValue.set(data[key], list);
  }

  for (const [value, keys] of byValue) {
    if (keys.length < 2) continue;
    const englishes = [...new Set(keys.map((k) => strings[k]))];
    if (englishes.length < 2) continue;
    // Same English bar its capitalisation is an English-table defect, not a translation one.
    if (new Set(englishes.map((e) => e.toLowerCase())).size < 2) continue;
    warn(
      where,
      `${keys.join(', ')} all render as ${JSON.stringify(value)}, but their English ` +
        `differs (${englishes.map((e) => JSON.stringify(e)).join(' vs ')}) — settings ` +
        'the user cannot tell apart',
    );
  }
}

/**
 * The decided termbase, enforced.
 *
 * **Rejected forms are matched at a word start, case-insensitively, and only inside the
 * keys the term governs.** Each of those three is load-bearing, and the first was narrowed
 * after a mutation test caught it being too strict:
 *
 *   - *At a word start* — the start of the value, or after any non-letter. This is what
 *     lets the match be case-insensitive without becoming wrong: rejecting German `Zeit`
 *     must not fire on the legitimate `Uhrzeit`, and it cannot, because `zeit` there is
 *     mid-word. Pure case-sensitivity was the first attempt and it silently missed Swedish
 *     `Vardag` at the head of a label while catching the lower-case `vardag` — the most
 *     likely form escaping the check that exists to find it.
 *   - *Including compounds*, because German, Swedish and Latvian compound: the rejected
 *     `Ereignis` appears as `Ereignisfarbe`, which begins the value and so matches, where
 *     any whole-word test would miss it.
 *   - *Scoped to governed keys*, because the same word can be right and wrong in one
 *     file. Italian `Posizione` is wrong for *location* and correct for *position*; a
 *     whole-file scan cannot tell them apart and would fire on correct strings.
 *
 * The positive direction — a decided form that is simply absent — is a warning, not an
 * error, because inflection makes exact equality the wrong test everywhere except the
 * handful of keys whose entire English is the term.
 */
function checkGlossaryAdherence(where, code, data, strings, glossary) {
  for (const term of glossary.terms) {
    const governed = Object.keys(strings).filter((k) =>
      new RegExp(`\\b${term.name.replace(/\s+/g, '\\s+')}`, 'i').test(strings[k]),
    );

    for (const form of term.rejected[code] ?? []) {
      // Word-start, case-insensitive. See the docblock: this is deliberately not a
      // whole-word match (compounds) and deliberately not a bare substring (`Uhrzeit`).
      const pattern = new RegExp(
        `(^|[^\\p{L}])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'iu',
      );
      for (const key of governed) {
        const value = data[key];
        if (typeof value !== 'string') continue;
        if (!pattern.test(value)) continue;
        error(
          where,
          `\`${key}\` uses ${JSON.stringify(form)}, which the glossary rejects for ` +
            `'${term.name}' in ${code} — the decided term is ` +
            `${JSON.stringify(term.decided[code] ?? '(undecided)')}. See ` +
            'docs/development/editor-glossary.md',
        );
      }
    }

    const decided = term.decided[code];
    if (!decided) continue;
    for (const key of Object.keys(strings)) {
      if (strings[key].trim().toLowerCase() !== term.name) continue;
      if (GLOSSARY_QUALIFIED_OK.has(`${code}:${key}`)) continue;
      const value = data[key];
      if (typeof value === 'string' && value !== decided) {
        warn(
          where,
          `\`${key}\` renders '${term.name}' as ${JSON.stringify(value)} where the ` +
            `glossary decided ${JSON.stringify(decided)}`,
        );
      }
    }
  }
}

/**
 * A markdown table cell, with emphasis removed so it can be matched as data.
 *
 * The glossary is prose *and* the machine-readable termbase, so every cell this script
 * parses is one a human may reasonably decide to emphasise. Three separate parsers read
 * those cells and all three matched raw text, which meant a purely cosmetic edit changed
 * behaviour:
 *
 *   - **bolding a language code** in the casing table dropped that row, so bolding `de`
 *     silently removed German's noun-capitalisation exemption and produced a confident,
 *     linguistically wrong warning that German was calquing English orthography;
 *   - **bolding a language in a term table's header** keyed that column under `**et**`,
 *     so every lookup by `et` missed and the term stopped being enforced for it;
 *   - **bolding a decided value** matched the italic test that excludes `*rejected*` and
 *     `*!EN*`, so an emphasised decision read as *no decision here*.
 *
 * All three fail silently and in the same direction: less enforcement, no error. Bold is
 * therefore stripped everywhere, single-asterisk italic never is — it is load-bearing
 * syntax meaning the cell holds no decision.
 *
 * @param cell - Raw cell text
 * @returns The cell trimmed, with bold and underscore emphasis removed
 */
const unemphasise = (cell) => cell.trim().replace(/\*\*|__/g, '').trim();

/**
 * Reads the termbase out of the glossary.
 *
 * The markdown *is* the source of truth — a second machine-readable copy would be one
 * more pair of artefacts free to drift, and the whole point of the glossary is that one
 * decision exists in one place. So this parses it, and fails loudly rather than quietly
 * enforcing nothing if the shape it depends on changes.
 *
 * @returns Decided and rejected forms per term, plus the languages exempt from the
 *   sentence-case rule
 */
function readGlossary() {
  const src = read(GLOSSARY_MD);

  // The casing ruling: a language is exempt when its own orthography capitalises nouns.
  const casingTable = src.match(/\|\s*language\s*\|\s*rule\s*\|[\s\S]*?\n\n/i);
  assertFound(casingTable, 'the per-language casing table', GLOSSARY_MD);
  const nounCapsLanguages = new Set();
  let sawAnyCasingRow = false;
  for (const line of casingTable[0].split('\n')) {
    // Emphasis is stripped before the code is matched. The `pl` row is written `| **pl** |`
    // to mark it as the problem language, and a bare `^[a-z]{2}$` test silently skipped it
    // — `sawAnyCasingRow` still passed on the other eight, so the guard that exists to
    // catch a shape change could not see one row losing its shape. Harmless today, because
    // Polish is not exempt and the cell says `Sentence case` either way; it would not have
    // been the day someone edited that row expecting it to count.
    // Emphasis is stripped before the code is matched — see `unemphasise()`. The `pl` row
    // is written `| **pl** |` to mark it as the problem language, and a bare `^[a-z]{2}$`
    // test silently skipped it, while `sawAnyCasingRow` still passed on the other eight.
    const cells = line.split('|').map((c) => unemphasise(c));
    if (cells.length < 4 || !/^[a-z]{2}(-[a-z]{2})?$/.test(cells[1])) continue;
    sawAnyCasingRow = true;
    if (/nouns are capitalised/i.test(cells[2])) nounCapsLanguages.add(cells[1]);
  }
  assertFound(sawAnyCasingRow ? ['ok'] : [], 'any language row in the casing table', GLOSSARY_MD);

  const terms = [];
  // Sections are `### <term> — <sense>`; everything up to the next `###` belongs to it.
  for (const section of src.split(/^### /m).slice(1)) {
    const heading = section.slice(0, section.indexOf('\n'));
    const name = heading.split('—')[0].trim().toLowerCase();
    if (!name) continue;

    // Column order comes from the table's own header rather than a constant, so a
    // reordered table cannot silently shift every decision one language to the left.
    const header = section.match(/^\|\s*\|([^\n]*)\|\s*$/m);
    if (!header) continue;
    const langs = header[1]
      .split('|')
      .map((c) => unemphasise(c))
      .filter(Boolean);

    const decided = {};
    for (const row of section.matchAll(
      /^\|\s*\*\*Decided\*\*(?:\s*\((\w+)\))?\s*\|([^\n]*)\|\s*$/gm,
    )) {
      const which = row[1] ? row[1].toLowerCase() : name;
      const cells = row[2].split('|').map((c) => c.trim());
      const forThisTerm = (decided[which] ??= {});
      langs.forEach((lang, i) => {
        // Bold is stripped, single-asterisk italic is not, and the order matters: a cell
        // written `**Termin**` is a decided value someone emphasised, while `*rejected*`
        // and `*!EN*` are markers meaning *there is no decision here*. Testing for italic
        // before removing bold treats the first as the second and silently drops the term
        // from enforcement — the failure being emphasis on a decision you care about.
        const cell = (cells[i] ?? '').replace(/^`|`$/g, '').replace(/\*\*/g, '').trim();
        if (cell && cell !== '—' && !/^\*.*\*$/.test(cell)) forThisTerm[lang] = cell;
      });
    }

    const rejected = {};
    for (const line of section.matchAll(/^\*\*Rejected:\*\*([^\n]*)$/gm)) {
      for (const pair of line[1].split(';')) {
        const m = pair.match(/([a-z]{2}(?:-[a-z]{2})?)\s*`([^`]+)`/i);
        if (m) (rejected[m[1].toLowerCase()] ??= []).push(m[2]);
      }
    }

    for (const [which, byLang] of Object.entries(decided)) {
      terms.push({ name: which, decided: byLang, rejected: which === name ? rejected : {} });
    }
  }

  assertFound(terms, 'any decided glossary terms', GLOSSARY_MD);
  return { terms, nounCapsLanguages };
}

/**
 * en-GB, recomputed and compared whole.
 *
 * The file is derived, so the only correct way to change it is to run the generator; a
 * hand-edit is a defect by construction. That matters because the hand-written file this
 * replaced had accumulated all three failure modes at once — 1 entry correct, 17 wrong
 * (they silently dropped Title Case, so `Event Color` became `Event colour` and switching
 * to British English re-cased seventeen labels as a side effect), 18 missing, and 28
 * no-ops byte-identical to the English.
 */
async function checkEnGbDerivation() {
  const { EDITOR_STRINGS } = await loadEditor();
  const expected = deriveEnGb(EDITOR_STRINGS);
  const where = 'editor/translations/en-GB.json';

  let actual;
  try {
    actual = JSON.parse(read(join(EDITOR_T9N_DIR, 'en-GB.json')));
  } catch (err) {
    error(
      where,
      `is missing or not valid JSON (${err.message}) — run \`node scripts/generate-en-gb.mjs\``,
    );
    return;
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const wrong = [];
  for (const key of keys) {
    if (expected[key] === actual[key]) continue;
    if (actual[key] === undefined) wrong.push(`${key} is missing`);
    else if (expected[key] === undefined)
      wrong.push(`${key} is not a British spelling variant and must not be overridden`);
    else
      wrong.push(
        `${key} is ${JSON.stringify(actual[key])}, derived ${JSON.stringify(expected[key])}`,
      );
  }

  if (wrong.length > 0) {
    error(
      where,
      `${wrong.length} entr${wrong.length === 1 ? 'y differs' : 'ies differ'} from the ` +
        'derivation — run `node scripts/generate-en-gb.mjs`. ' +
        wrong.slice(0, 4).join('; ') +
        (wrong.length > 4 ? `; and ${wrong.length - 4} more` : ''),
    );
  }
}

/**
 * Whether a string key belongs to something the editor actually renders.
 *
 * A key is owned by the longest prefix of its dotted path that names a field, a panel
 * title or a prefix a panel declared. That is the convention `strings.ts` states —
 * helper text is its key plus `.helper`, an option label is its field plus
 * `.option.<value>.label` — so checking prefixes checks the convention rather than
 * enumerating every suffix the editor might grow.
 *
 * @param key - String key from the table
 * @param roots - Every key something in the editor references
 * @returns `true` when some prefix of the key is referenced
 */
function isReachable(key, roots) {
  const parts = key.split('.');
  for (let end = parts.length; end > 0; end -= 1) {
    if (roots.has(parts.slice(0, end).join('.'))) return true;
  }
  return false;
}

/**
 * Mirrors `humanize()` from the editor, for the message that names what a user would see.
 *
 * @param key - Config key
 * @returns The key as the editor would render it with no string defined
 */
function humanKey(key) {
  const words = key.split('.').pop().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(languageCount, fieldCount) {
  const line = (kind, { where, msg }) => {
    if (IN_CI) console.log(`::${kind === 'error' ? 'error' : 'warning'}::${where}: ${msg}`);
    else console.log(`  ${kind === 'error' ? '✖' : '⚠'} ${where}: ${msg}`);
  };

  if (errors.length > 0) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach((e) => line('error', e));
  }
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => line('warn', w));
  }

  if (notes.length > 0) {
    console.log('\nEditor translation coverage (English fills the rest, per key):');
    notes.forEach((n) => console.log(n));
  }

  const summary =
    `\n${languageCount} languages, ${fieldCount} editor fields — ` +
    `${errors.length} error(s), ${warnings.length} warning(s).`;
  console.log(summary);

  if (errors.length > 0) return 1;
  if (STRICT && warnings.length > 0) {
    console.log('Failing because --strict was passed.');
    return 1;
  }
  console.log('i18n wiring and editor strings are consistent.');
  return 0;
}

// ---------------------------------------------------------------------------

async function main() {
  const languages = readLanguageFiles();
  const localize = readLocalizeWiring();
  const editorLanguages = readEditorLanguageWiring();
  const dayjsWiring = readDayjsWiring();

  checkLanguageParity(languages);
  checkLocalizeWiring(languages, localize);
  checkEditorLanguageWiring(languages, editorLanguages);
  checkDayjsWiring(localize.entries, dayjsWiring);

  const fieldCount = await checkEditorStrings();
  await checkEditorTranslations(languages);
  await checkEnGbDerivation();
  await checkTranslationQuality(languages, readGlossary());

  process.exit(report(languages.size, fieldCount));
}

main();
