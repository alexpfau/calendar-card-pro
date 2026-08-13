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

  process.exit(report(languages.size, fieldCount));
}

main();
