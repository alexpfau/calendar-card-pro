#!/usr/bin/env node
/**
 * i18n integrity check for Calendar Card Pro.
 *
 * Validates language wiring, dayjs locale wiring, editor string coverage, editor
 * translation reachability and glossary-based translation checks.
 *
 *   node scripts/check-i18n.mjs            # errors are fatal, warnings are advisory
 *   node scripts/check-i18n.mjs --strict   # warnings are fatal too
 *
 * Source-shape checks use regexes and fail loudly when a pattern stops matching.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GLOSSARY_TERMS, NOUN_CAPS_LANGUAGES } from './editor-glossary.mjs';
import { deriveEnGb } from './en-gb.mjs';
import { loadEditorModule } from './load-editor-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = join(ROOT, 'src/translations/languages');
const EDITOR_T9N_DIR = join(ROOT, 'src/rendering/editor/translations');
const EDITOR_T9N_INDEX_TS = join(ROOT, 'src/rendering/editor/translations/index.ts');
const LOCALIZE_TS = join(ROOT, 'src/translations/localize.ts');
const DAYJS_TS = join(ROOT, 'src/translations/dayjs.ts');
const PANELS_TS = join(ROOT, 'src/rendering/editor/panels.ts');
const STRINGS_TS = join(ROOT, 'src/rendering/editor/strings.ts');
const GLOSSARY_SOURCE = 'scripts/editor-glossary.mjs';
const REFERENCE_LANG = 'en.json';

const STRICT = process.argv.includes('--strict');
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

const errors = [];
const warnings = [];
const notes = [];
const glossaryNotes = [];
const error = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const read = (path) => readFileSync(path, 'utf-8');

/**
 * The editor's modules, bundled once per run.
 */
let editorModule;
const loadEditor = async () => (editorModule ??= await loadEditorModule(ROOT));

/**
 * Guard against a stale regex silently matching nothing.
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
 * The schema is the field registry, so panels are built and walked instead of parsed from
 * source. Each node has both group-qualified and bare label candidates.
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
      // A grid is layout, not a label scope.
      if (node.type === 'grid' || !node.name) continue;

      // A group uses `titleKey` for its heading and helper.
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

      // Hand-rendered sub-forms resolve helpers by qualified key only.
      if (bareHelper) helpers.add(node.name);
    }
  };

  for (const panel of PANELS) {
    roots.add(panel.titleKey);
    titles.add(panel.titleKey);
    helpers.add(panel.titleKey);
    for (const prefix of panel.strings ?? []) roots.add(prefix);
  }

  // The chassis declares schema and text outside the panels.
  for (const subform of chassisSubforms()) collect(subform.schema, subform.path, true);
  for (const prefix of CHASSIS_STRINGS) roots.add(prefix);

  for (const config of probeConfigs(DEFAULT_CONFIG, VIEWS)) {
    for (const panel of PANELS) {
      const ctx = { view: config.view, config, language: 'en' };

      collect(panel.build(ctx), [], true);

      // Hand-rendered panel subforms still expose schema to reconcile.
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
    // Both scope tables make the same promise on different surfaces, but a key may
    // legitimately appear in both with DIFFERENT scopes — `entityScopeFor` is
    // `ENTITY_VIEW_SCOPE[key] ?? VIEW_SCOPE[key]`, not a merge, so the per-calendar
    // control and the card-level one can be inert in different views and need different
    // notes. Spreading one over the other silently dropped the loser's scope and
    // orphaned its string: `split_multiday_events` is card-level `['list','column']` and
    // per-calendar `['list']`, and only the second survived the spread. Pairs, so both
    // are reconciled.
    viewScopeEntries: [...Object.entries(VIEW_SCOPE), ...Object.entries(ENTITY_VIEW_SCOPE)],
    defaultOverridesByView: DEFAULT_OVERRIDES_BY_VIEW,
  };
}

/**
 * The language the option scan resolves under. Never a real language.
 *
 * Registering it mutates a module the rest of this file shares, so it is removed again in
 * a `finally`. That is insurance rather than a live guard, and the difference is worth
 * stating because the obvious justification is false: `checkEditorTranslations` reconciles
 * the `EDITOR_LANGUAGE_STRINGS` entries it parses out of the **index module's source**, not
 * the keys of the runtime object, so a leaked entry is invisible to it — planted and
 * measured at 0 errors. Nothing today reads that object's key set, and nothing today
 * resolves a string after this scan that could see the extra language. Both of those are
 * facts about the current file rather than guarantees, which is exactly why the scan puts
 * the module back the way it found it.
 */
const OPTION_KEY_ECHO_LANGUAGE = 'zz-option-key-echo';

/** Escapes a literal for use inside a regular expression. */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every option-label key the editor's dropdowns actually look up.
 *
 * 🚨 An option list is a table, and the assertions covering these dropdowns read them by
 * walking them — the failure this repository has already paid for four times. Remove an
 * entry and the walk runs one fewer time, so nothing counts and nothing notices. Measured
 * rather than argued: of the 15 card-wide option tables, **9 lose an entry with the whole
 * suite green**, among them `time_format` losing `12` and `start_date_mode` losing
 * `offset` — a documented setting gone from the editor while its control, its helper text
 * and its translations all stay put.
 *
 * The key is **taken from the editor rather than modelled**, because modelling it does not
 * work. Four different shapes are in use: `view.option.list.label` from the node's own
 * name, `column.min_days_fallback.option.list.label` from its group-qualified name,
 * `entity.show_time.option.inherit.label` from the per-calendar prefix, and — the one that
 * defeats any rule written from the schema — `week_number_mode.option.iso.label` for a node
 * *named* `show_week_numbers`, because `unionPickerField` labels the picker for a union
 * option through the synthetic mode field standing in for it. The built schema has thrown
 * that key away by the time anything can read it.
 *
 * So the schema is built under a language that echoes every key back instead of resolving
 * it. Each option's `label` is then literally the key the editor asked for, derived by the
 * editor's own code. That also settles the subset problem a per-control comparison runs
 * into — card-wide `event_type` deliberately offers no `inherit`, where the per-calendar
 * one does — because the two resolve through *different* keys, `event_type.option.*` and
 * `entity.event_type.option.*`, so there is nothing to except.
 *
 * @returns The keys asked for, each with the nodes that asked, and any option whose label
 *   did not come from the string table at all
 */
async function readEditorOptionKeys() {
  const editor = await loadEditor();
  const { PANELS, walkSchema, panelSubforms, chassisSubforms, EDITOR_LANGUAGE_STRINGS } = editor;
  const { DEFAULT_CONFIG, VIEWS } = editor;

  assertFound(PANELS, 'any registered editor panels', PANELS_TS);

  /** Option-label key -> the qualified node names that looked it up. */
  const asked = new Map();
  /**
   * Options whose label is not an option-label key, so nothing can reconcile them.
   *
   * Keyed rather than listed, because every panel is built once per probe configuration
   * and the same option would otherwise be reported dozens of times over.
   */
  const unresolved = new Map();

  const collect = (schema, path) => {
    for (const { node, path: nodePath } of walkSchema(schema, path)) {
      if (!node.name || !('selector' in node) || !node.selector) continue;

      const select = node.selector.select;
      if (!select || !Array.isArray(select.options)) continue;

      const where = [...nodePath, node.name].join('.');

      for (const option of select.options) {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? '' : String(option.label ?? '');
        const shape = new RegExp(`^.+\\.option\\.${escapeForRegExp(String(value))}\\.label$`);

        if (!shape.test(label)) {
          unresolved.set(`${where}\u0000${value}\u0000${label}`, {
            where,
            value: String(value),
            label,
          });
          continue;
        }

        const nodes = asked.get(label) ?? new Set();
        nodes.add(where);
        asked.set(label, nodes);
      }
    }
  };

  EDITOR_LANGUAGE_STRINGS[OPTION_KEY_ECHO_LANGUAGE] = new Proxy(
    {},
    { get: (_target, key) => (typeof key === 'string' ? key : undefined) },
  );

  try {
    for (const subform of chassisSubforms()) collect(subform.schema, subform.path);

    for (const config of probeConfigs(DEFAULT_CONFIG, VIEWS)) {
      for (const panel of PANELS) {
        const ctx = { view: config.view, config, language: OPTION_KEY_ECHO_LANGUAGE };

        collect(panel.build(ctx), []);
        for (const subform of panelSubforms(panel, ctx)) collect(subform.schema, subform.path);
      }
    }
  } finally {
    delete EDITOR_LANGUAGE_STRINGS[OPTION_KEY_ECHO_LANGUAGE];
  }

  return { asked, unresolved };
}

/**
 * Configurations chosen to open every conditional branch in every panel.
 *
 * Defaults alone hide conditional fields, so booleans and view-derived modes are swept.
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
    // Same shape, and it bit for the same reason: the all-day badge defaults to 'off', so
    // nothing in the sweep above turns it on, and the treatment select it reveals is only
    // built when it is on. Without these two the checker reports every allday_badge_style
    // string as unreferenced -- correctly, from what it can see. Both positions are listed
    // because they are separate branches, and a variant that exercised only one would leave
    // the other's option labels unchecked.
    { allday_badge: 'time' },
    { allday_badge: 'title' },
    // Two gates deep, which is why it needs a variant of its own rather than riding on the
    // two above. The badge's colour picker is only built when the badge is ON *and* its
    // colour is a custom one, so no variant that sets a single key can reach it, and without
    // this the checker reports `allday_badge_color` as referenced by no panel -- correctly,
    // from what it can see. Any colour will do; the mode is read off the value's shape.
    { allday_badge: 'time', allday_badge_color: '#b5651d' },
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
 * No language file may carry an `editor` section.
 *
 * `localize.ts` is eager; editor strings belong in the editor chunk.
 *
 * @param languages - Language files on disk, keyed by lowercased code
 */
function checkNoEditorSectionsOnEagerPath(languages) {
  for (const [code, { file, data }] of languages) {
    if ('editor' in data) {
      error(
        file,
        'carries an `editor` section again — it is on the eager path, where every user ' +
          'downloads and parses it on every dashboard load. Move it to ' +
          `src/rendering/editor/translations/${file} (${code})`,
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
 * Missing labels render humanised keys; unused strings become translation work for keys
 * that label nothing. Helper text remains optional.
 */
async function checkEditorStrings() {
  const { labels, titles, helpers, roots, strings, viewScopeEntries, defaultOverridesByView } =
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
  for (const [key, views] of viewScopeEntries) {
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
 * A dropdown offers exactly the options its strings name, and vice versa.
 *
 * Both directions matter and they fail differently. A key the editor asks for and no
 * string defines renders `humanize`d — an untranslated, capitalized copy of the config
 * value, in all eleven editor languages, which reads as a translation gap rather than as
 * the missing string it is. A string nothing asks for is the far worse one: that is what a
 * dropped table entry looks like from here, and the option has simply stopped existing in
 * the editor while its control, its helper text and its translations all stay in place.
 *
 * Reconciled on the keys themselves rather than on per-control sets of values, which is
 * what makes it need no exception list: two controls that share a *name* but not a key —
 * card-wide `event_type` against per-calendar `entity.event_type` — never meet.
 *
 * @returns How many option-label keys the editor asked for
 */
async function checkEditorOptions() {
  const { asked, unresolved } = await readEditorOptionKeys();
  const { EDITOR_STRINGS } = await loadEditor();

  // Neither surface may be empty, or an unwalked schema would agree with an unread table.
  assertFound([...asked.keys()], 'any dropdown options in the editor panels', PANELS_TS);

  const defined = Object.keys(EDITOR_STRINGS).filter((key) => /^.+\.option\..+\.label$/.test(key));
  assertFound(defined, 'any option strings', STRINGS_TS);

  for (const { where, value, label } of unresolved.values()) {
    error(
      'strings.ts',
      `\`${where}\` labels its \`${value}\` option ${label === '' ? 'with no string at all' : `as \`${label}\``}, ` +
        `which is not an option-label key — nothing can reconcile or translate it`,
    );
  }

  for (const [key, nodes] of asked) {
    if (!(key in EDITOR_STRINGS)) {
      const value = key.slice(0, -'.label'.length).split('.option.').pop();
      error(
        'strings.ts',
        `\`${key}\` has no string — ${[...nodes].sort().join(', ')} would offer it as ` +
          `"${humanKey(value)}" in every language, including English`,
      );
    }
  }

  for (const key of defined) {
    if (!asked.has(key)) {
      error(
        'strings.ts',
        `\`${key}\` names an option no dropdown offers — the option is gone from the ` +
          `editor while its string and every translation of it stay behind`,
      );
    }
  }

  return asked.size;
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

/**
 * The live editor's translations: wired up, and — the point of this check — reachable.
 *
 * Every translation key must exist in `EDITOR_STRINGS`, and `lookup()` must return the
 * translated value. Coverage is reported rather than enforced because fallback is per key.
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
      continue;
    }

    // A key may only name the file for its *own* language. Nothing else in this gate
    // relates the two: the checks above accept any imported identifier, and the loop
    // below only asks that each import is used *somewhere*. So `nl: deEditor` — a key
    // with no file of its own, aliased onto another language's — passes both, and every
    // Dutch user silently gets the German editor. Aliasing is never what was meant: a
    // language with no editor file is supposed to be absent from this map entirely, so
    // that `lookup()` finds no entry for it and falls each key through to EDITOR_STRINGS,
    // which is English.
    const expected = basename(imports.get(identifier), '.json').toLowerCase();
    if (expected !== key) {
      error(
        'editor/translations/index.ts',
        `EDITOR_LANGUAGE_STRINGS key '${key}' names \`${identifier}\`, which is ` +
          `'${expected}' — '${key}' would render the editor in ${expected}. Either add ` +
          `${key}.json, or remove the entry so '${key}' falls back to English`,
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
}

// ---------------------------------------------------------------------------
// Translation quality — structure, orthography and terminology
// ---------------------------------------------------------------------------

/**
 * Keys whose value is the same in every language, because it is not language at all.
 *
 * Keep this to symbols, numerals and proper names of standards. Words that happen to match
 * English belong in the per-language allow-list below.
 */
const IDENTICAL_TO_ENGLISH_ANY_LANGUAGE = new Set([
  'width_table.at_least',
  'width_table.below',
  'week_number_mode.option.iso.label',
]);

/**
 * Values that are legitimately byte-identical to their English.
 *
 * Keyed `lang:key`. Each entry is a loanword the language genuinely uses, not a gap.
 */
const IDENTICAL_TO_ENGLISH_OK = new Set([
  'de:panel.layout',
  'it:panel.layout',
  'nb:panel.layout',
  'sv:panel.layout',

  // `Label` is a German loanword in Home Assistant's own UI.
  'de:entity.label',
  'de:view',

  // `Layout` is the Italian term chosen by the glossary.
  'it:view',

  // `Layout` is the ordinary Swedish and Norwegian word.
  'sv:view',
  'nb:view',
]);

/**
 * Keys where the decided term is deliberately *qualified* rather than used bare.
 *
 * The term is still used, with a word added so two settings stay distinguishable.
 */
const GLOSSARY_QUALIFIED_OK = new Set([
  // `Ikona` alone collides with two picker options that mean `An Icon`.
  'pl:today_indicator_icon',

  // Same collision and resolution as Polish.
  'sk:today_indicator_icon',
  // Same collision; the sibling fields are already qualified.
  'et:today_indicator_icon',
  'lt:today_indicator_icon',
  'lv:today_indicator_icon',
]);

/**
 * Characters whose loss changes what a string means, rather than how it looks.
 *
 * Non-ASCII symbols like `—` and `≥` qualify; letters and localized quotes do not.
 */
const structuralGlyphs = (text) =>
  [...text].filter(
    (ch) => ch.codePointAt(0) > 127 && !/[\p{L}\p{M}]/u.test(ch) && !/["'“”‘’„«»]/u.test(ch),
  );

/**
 * Placeholders the runtime will substitute.
 *
 * Must mirror `interpolate()` in `src/rendering/editor/strings.ts`, which matches
 * `/\{(\w+)\}/g`. A narrower pattern here exempts any placeholder carrying an uppercase
 * letter or a digit from validation entirely — `{maxCount}` dropped from a translation
 * passed this check silently until the two were reconciled.
 */
const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();

/**
 * Structural integrity, orthography and terminology, per language.
 *
 * Each axis keeps its own case-sensitive comparison.
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
      if (
        value === english &&
        !IDENTICAL_TO_ENGLISH_ANY_LANGUAGE.has(key) &&
        !IDENTICAL_TO_ENGLISH_OK.has(`${code}:${key}`)
      ) {
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
 * Distinct English collapsing to one translation makes two controls indistinguishable.
 * Warning only: a panel can supply context that makes the shorter label right.
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
    // Same English aside from capitalisation is an English-table issue.
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
 * Rejected forms are matched case-insensitively at a word start, including compounds, and
 * only inside keys governed by the term. Missing decided forms are warnings because
 * inflection makes exact equality too strict.
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
            GLOSSARY_SOURCE,
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
 * Which glossary decisions the checker can actually enforce, reported every run.
 *
 * A `decided` form is only ever compared against keys whose English *is* the term —
 * `strings[key] === term.name` — so a term with no such key is documentation only unless a
 * `rejected` entry enforces it through substring checks.
 *
 * @param glossary - The termbase
 * @param strings - `EDITOR_STRINGS`
 */
function reportGlossaryReach(glossary, strings) {
  const englishes = new Map();
  for (const [key, value] of Object.entries(strings)) {
    const normalised = value.trim().toLowerCase();
    if (!englishes.has(normalised)) englishes.set(normalised, key);
  }

  const enforced = [];
  const inert = [];
  for (const term of glossary.terms) {
    if (Object.keys(term.decided).length === 0) continue;
    (englishes.has(term.name) ? enforced : inert).push(term.name);
  }

  const total = enforced.length + inert.length;
  assertFound(total ? ['ok'] : [], 'any decided glossary terms to report on', GLOSSARY_SOURCE);

  glossaryNotes.push(
    `  ${enforced.length} of ${total} decided terms are enforced by their \`decided\` forms ` +
      '(a key exists whose English is exactly the term).',
  );
  if (inert.length > 0) {
    glossaryNotes.push(
      `  ${inert.length} are documentation only — no such key, so editing the decided form ` +
        `changes nothing. A \`rejected\` entry in ${GLOSSARY_SOURCE} would enforce them, ` +
        'because it matches compounds:',
    );
    glossaryNotes.push(`    ${inert.join(', ')}`);
    glossaryNotes.push(
      '  This is a standing invitation for a native speaker, NOT a mechanical task. A rejected ' +
        'form is an ERROR, so a guessed one fails CI on a perfectly good translation. Only add ' +
        'a form somebody actually considered and turned down for that language — the way ' +
        '`event` carries de:Ereignis and pl:Zdarzenia. Leaving a term documentation-only is the ' +
        'correct outcome when nobody has made that call yet.',
    );
  }
}

/**
 * The termbase, as data.
 *
 * Imported rather than parsed out of a document: the whole point of a glossary is that one
 * decision exists in one place, and a checker that reads prose can be left enforcing
 * nothing by an edit that looks purely editorial. A shape change here is a load error.
 *
 * @returns Decided and rejected forms per term, plus the languages exempt from the
 *   sentence-case rule
 */
function readGlossary() {
  assertFound(GLOSSARY_TERMS, 'any decided glossary terms', GLOSSARY_SOURCE);
  return { terms: GLOSSARY_TERMS, nounCapsLanguages: new Set(NOUN_CAPS_LANGUAGES) };
}

/**
 * en-GB, recomputed and compared whole.
 *
 * The file is derived, so the only correct way to change it is to run the generator.
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
 * A key is owned by the longest prefix of its dotted path that names a field, panel title
 * or declared prefix.
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

function report(languageCount, fieldCount, optionCount) {
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

  if (glossaryNotes.length > 0) {
    console.log('\nGlossary enforcement:');
    glossaryNotes.forEach((n) => console.log(n));
  }

  const summary =
    `\n${languageCount} languages, ${fieldCount} editor fields, ` +
    `${optionCount} dropdown options — ` +
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

/**
 * `fullDaysOfWeek` is always running text after `multiDay`, so dayjs locale casing is a
 * useful oracle. `months` spans both running-text and standalone contexts and is not checked.
 *
 * A warning rather than an error: these are native-contributed files in the eager path,
 * so the fix wants the contributor, not CI.
 */
async function checkRunningTextWeekdayCase(languages) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const upper = (v) =>
    typeof v === 'string' &&
    v.length > 0 &&
    v[0] === v[0].toUpperCase() &&
    v[0] !== v[0].toLowerCase();

  let compared = 0;
  const mismatched = [];

  for (const [code, { file, data }] of languages) {
    let locale;
    for (const candidate of [code, code.split('-')[0]]) {
      try {
        locale = require(`dayjs/locale/${candidate}`);
        break;
      } catch {
        /* not shipped under that spelling -- try the base code */
      }
    }
    if (!locale) continue;

    const oracle = Array.isArray(locale.weekdays) ? locale.weekdays : locale.weekdays?.standalone;
    if (!Array.isArray(oracle) || oracle.length !== 7) continue;
    if (!Array.isArray(data.fullDaysOfWeek) || data.fullDaysOfWeek.length !== 7) continue;

    compared += 1;
    const differing = data.fullDaysOfWeek
      .map((value, i) => [value, oracle[i]])
      .filter(([value, want]) => upper(value) !== upper(want));
    if (differing.length) mismatched.push([file, differing[0]]);
  }

  // A zero must mean "all agree", never "nothing was examined".
  if (compared === 0) {
    error(
      'languages/',
      'weekday-case check compared no languages -- the dayjs oracle never resolved',
    );
    return;
  }

  for (const [file, [got, want]] of mismatched) {
    warn(
      `languages/${file}`,
      `fullDaysOfWeek is capitalised (${got}); dayjs has ${want} -- that array is only ever ` +
        `rendered mid-sentence after multiDay, so it wants the running-text form. ` +
        `DO NOT simply copy the dayjs value: it is the NOMINATIVE, and multiDay governs ` +
        `case in cs/hr/pl/sk (do), lt (iki) and lv (lidz) -- Polish wants "do poniedzialku", ` +
        `not "do poniedzialek". Lowercasing is half the fix at most; the inflected form is a ` +
        `native-speaker question. The months array spans multiple casing contexts, so it is deliberately not checked ` +
        `and must not be "fixed" alongside it`,
    );
  }
}

/**
 * Editor string keys written as literals in code, rather than derived from the schema.
 *
 * `checkEditorStrings` reconciles the keys the *schema* implies — every field label,
 * every panel heading. But a panel can also resolve a string directly, and the width
 * table does: `lookup(ctx.language, 'width_table.at_least')` is a literal that no schema
 * walk can see, so those eight keys were reachable by no check at all.
 *
 * Missing, they now render humanized rather than as the raw key — but "At least" where a
 * sentence belongs is still wrong, and it is the kind of wrong nobody notices in a
 * language they do not read. Cheap to reconcile, so reconcile it.
 *
 * Only fully-literal keys are collected. A composed key — `` `${blockKey}.density` `` —
 * has no single spelling to look up, and those are already covered by the schema walk.
 */
async function checkEditorKeysUsedInCode() {
  const { EDITOR_STRINGS } = await loadEditor();

  const dir = join(ROOT, 'src/rendering/editor');
  const sources = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) sources.push(full);
    }
  };
  walk(dir);
  assertFound(sources, 'any editor sources', dir);

  // The idiom these appear in: a panel-local `t('literal')` helper wrapping `lookup`, or
  // a direct `lookup(<lang>, 'literal')`. Only fully-literal keys — a composed key such
  // as `` `${blockKey}.density` `` has no single spelling to reconcile, and the schema
  // walk already covers the fields those build.
  const PATTERNS = [/\bt\(\s*'([^'`${}]+)'/g, /\blookup\(\s*[^,()]+,\s*'([^'`${}]+)'\s*[),]/g];
  const found = new Map();

  for (const file of sources) {
    if (file.endsWith('/strings.ts')) continue;

    const text = read(file);

    for (const pattern of PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (!found.has(match[1])) found.set(match[1], `editor/${relative(dir, file)}`);
      }
    }
  }

  assertFound([...found.keys()], 'any literal translation keys', dir);

  for (const [key, where] of [...found].sort()) {
    if (!(key in EDITOR_STRINGS)) {
      error(
        where,
        `looks up \`${key}\`, which no English string defines — it renders as ` +
          `"${humanKey(key)}" in every language, including English`,
      );
    }
  }

  return found.size;
}

async function main() {
  const languages = readLanguageFiles();
  const localize = readLocalizeWiring();
  const dayjsWiring = readDayjsWiring();

  checkLanguageParity(languages);
  checkLocalizeWiring(languages, localize);
  checkNoEditorSectionsOnEagerPath(languages);
  checkDayjsWiring(localize.entries, dayjsWiring);

  const fieldCount = await checkEditorStrings();
  const optionCount = await checkEditorOptions();
  await checkEditorKeysUsedInCode();
  await checkEditorTranslations(languages);
  await checkEnGbDerivation();
  const glossary = readGlossary();
  await checkTranslationQuality(languages, glossary);
  reportGlossaryReach(glossary, (await loadEditor()).EDITOR_STRINGS);
  await checkRunningTextWeekdayCase(languages);

  process.exit(report(languages.size, fieldCount, optionCount));
}

main();
