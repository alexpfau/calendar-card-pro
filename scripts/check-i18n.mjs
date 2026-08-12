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
 * The `editor` sections inside the language files are **dormant**. They belong to the
 * editor that was replaced, and are kept to be mined during the translation pass rather
 * than deleted. Nothing here validates them: they label nothing, so completeness against
 * them would be a report about a surface that no longer exists.
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
const LOCALIZE_TS = join(ROOT, 'src/translations/localize.ts');
const DAYJS_TS = join(ROOT, 'src/translations/dayjs.ts');
const PANELS_TS = join(ROOT, 'src/rendering/editor/panels.ts');
const STRINGS_TS = join(ROOT, 'src/rendering/editor/strings.ts');
const REFERENCE_LANG = 'en.json';

const STRICT = process.argv.includes('--strict');
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

const errors = [];
const warnings = [];
const error = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const read = (path) => readFileSync(path, 'utf-8');

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
  const editor = await loadEditorModule(ROOT);
  const {
    PANELS,
    walkSchema,
    panelSubforms,
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
  const dayjsWiring = readDayjsWiring();

  checkLanguageParity(languages);
  checkLocalizeWiring(languages, localize);
  checkDayjsWiring(localize.entries, dayjsWiring);

  const fieldCount = await checkEditorStrings();

  process.exit(report(languages.size, fieldCount));
}

main();
