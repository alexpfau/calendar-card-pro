#!/usr/bin/env node
/**
 * i18n integrity check for Calendar Card Pro.
 *
 * Adding a language touches four places, and three of the four fail *silently*:
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
 * This script has no dependencies and is not part of the bundle. Run it with:
 *
 *   node scripts/check-i18n.mjs            # errors are fatal, warnings are advisory
 *   node scripts/check-i18n.mjs --strict   # warnings are fatal too
 *
 * Design note: the wiring in localize.ts and dayjs.ts is read out of the TypeScript source
 * with regexes rather than by importing it, so the check stays dependency-free and needs no
 * build step. That is only safe because every extraction below fails *loudly* when it cannot
 * find what it expects — see assertFound(). A regex that silently matched nothing would
 * report a clean run over an empty set, which is the one outcome worse than a false alarm.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = join(ROOT, 'src/translations/languages');
const LOCALIZE_TS = join(ROOT, 'src/translations/localize.ts');
const DAYJS_TS = join(ROOT, 'src/translations/dayjs.ts');
const EDITOR_TS = join(ROOT, 'src/rendering/editor.ts');
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
 * Editor translation keys referenced as string literals: `this._getTranslation('foo')` and
 * `this._getTranslation('editor.foo')`, normalised to the bare key.
 *
 * Seven call sites pass a variable instead (`_getTranslation(name)` in the addXField helpers,
 * where `name` is the config key). Those are unresolvable statically, so the config keys
 * passed to those helpers are collected separately below and treated as reachable.
 */
function readEditorKeyUsage() {
  const src = read(EDITOR_TS);

  const literal = new Set(
    [...src.matchAll(/_getTranslation\('([^']+)'/g)].map((m) => m[1].replace(/^editor\./, '')),
  );
  assertFound([...literal], '_getTranslation() calls', EDITOR_TS);

  // First argument of the addXField helpers — the config key, which those helpers fall back
  // to as a translation key when no explicit label is given.
  const viaFieldName = new Set(
    [...src.matchAll(/\bthis\.add[A-Za-z]*Field\(\s*'([^']+)'/g)].map((m) => m[1]),
  );

  return { literal, viaFieldName };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Every language file must carry every top-level key in en.json, with matching value shapes.
 *
 * `editor` is the documented exception and is checked separately: it is all-or-nothing.
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
  const refEditorKeys = Object.keys(reference.data.editor ?? {});

  if (refEditorKeys.length === 0) {
    error(REFERENCE_LANG, 'has no `editor` section; it is the reference for all editor keys');
  }

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

    checkEditorSection(file, data, refEditorKeys);
  }
}

/**
 * The `editor` section is all-or-nothing.
 *
 * hasEditorTranslations() returns true when the section has one *or more* keys, and
 * _getTranslation() uses it to decide whether to swap the whole language to English. So a
 * partially translated section defeats that fallback: the keys present render fine, and every
 * key missing renders as its own raw name (`show_end_time`) in the UI. Omitting the section
 * entirely is fully supported and correct — 24 of the language files do exactly that.
 */
function checkEditorSection(file, data, refEditorKeys) {
  const editor = data.editor;
  if (editor === undefined) return; // Supported: the whole language falls back to English.

  if (typeof editor !== 'object' || editor === null || Array.isArray(editor)) {
    error(file, '`editor` must be an object');
    return;
  }

  const present = Object.keys(editor);
  const missing = refEditorKeys.filter((k) => !(k in editor));

  if (missing.length > 0) {
    error(
      file,
      `\`editor\` is partially translated: ${missing.length} of ${refEditorKeys.length} keys ` +
        `missing (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}). ` +
        `A partial section defeats the English fallback — each missing key renders as its own ` +
        `raw key name. Either translate all ${refEditorKeys.length} or remove \`editor\` entirely.`,
    );
  }

  const extra = present.filter((k) => !refEditorKeys.includes(k));
  if (extra.length > 0) {
    warn(
      file,
      `\`editor\` has ${extra.length} key(s) not in ${REFERENCE_LANG}: ` +
        `${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ', …' : ''}`,
    );
  }

  const blank = present.filter((k) => typeof editor[k] !== 'string' || editor[k].trim() === '');
  if (blank.length > 0) {
    error(file, `\`editor\` has empty or non-string value(s): ${blank.slice(0, 5).join(', ')}`);
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

/** Editor keys referenced in code must exist in en.json, or they render as their own name. */
function checkEditorKeyUsage(languages) {
  const reference = languages.get('en');
  if (!reference?.data?.editor) return;

  const defined = new Set(Object.keys(reference.data.editor));
  const { literal, viaFieldName } = readEditorKeyUsage();

  for (const key of literal) {
    if (!defined.has(key)) {
      error(
        'editor.ts',
        `_getTranslation('${key}') has no matching key in ${REFERENCE_LANG} — it will render ` +
          `as the literal string "${key}"`,
      );
    }
  }

  const reachable = new Set([...literal, ...viaFieldName]);
  const unused = [...defined].filter((k) => !reachable.has(k));
  if (unused.length > 0) {
    warn(
      REFERENCE_LANG,
      `${unused.length} editor key(s) are never referenced: ` +
        `${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', …' : ''} ` +
        `(each one is dead weight in every language file that translates \`editor\`)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(languageCount, editorCount) {
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
    `\n${languageCount} languages, ${editorCount} with editor translations — ` +
    `${errors.length} error(s), ${warnings.length} warning(s).`;
  console.log(summary);

  if (errors.length > 0) return 1;
  if (STRICT && warnings.length > 0) {
    console.log('Failing because --strict was passed.');
    return 1;
  }
  console.log('i18n wiring is consistent.');
  return 0;
}

// ---------------------------------------------------------------------------

function main() {
  const languages = readLanguageFiles();
  const localize = readLocalizeWiring();
  const dayjsWiring = readDayjsWiring();

  checkLanguageParity(languages);
  checkLocalizeWiring(languages, localize);
  checkDayjsWiring(localize.entries, dayjsWiring);
  checkEditorKeyUsage(languages);

  const editorCount = [...languages.values()].filter((l) => l.data.editor !== undefined).length;
  process.exit(report(languages.size, editorCount));
}

main();
