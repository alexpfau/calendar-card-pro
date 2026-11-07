import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { type OutputChunk, type Plugin, rollup } from 'rollup';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createBuildPlugins } from '../../rollup.config.mjs';
import { EDITOR_STRINGS as SOURCE_EDITOR_STRINGS } from '../../src/rendering/editor/strings';

type StringMap = Readonly<Record<string, string>>;

interface PayloadLibrary {
  EDITOR_STRINGS: StringMap;
  EDITOR_LANGUAGE_STRINGS: Readonly<Record<string, StringMap>>;
  lookup: (language: string, key: string) => string | undefined;
  lookupForView: (
    language: string,
    key: string,
    view: string,
    suffix?: string,
  ) => string | undefined;
  getRelativeTimeString: (date: Date, language: string, reference?: Date) => string;
  getRelativeUnitString: (value: number, unit: 'day' | 'hour', language: string) => string;
  getNowString: (language: string) => string;
}

interface EmittedLibrary {
  library: PayloadLibrary;
  chunk: OutputChunk;
}

interface Comparison {
  count: number;
  mismatches: string[];
}

const ENTRY_ID = '\0compact-payload-equivalence';
const ENTRY = [
  `export * from ${JSON.stringify(resolve('src/translations/dayjs.ts'))};`,
  `export { EDITOR_STRINGS } from ${JSON.stringify(resolve('src/rendering/editor/strings.ts'))};`,
  `export { EDITOR_LANGUAGE_STRINGS } from ${JSON.stringify(resolve('src/rendering/editor/translations/index.ts'))};`,
  `export { lookup, lookupForView } from ${JSON.stringify(resolve('src/rendering/editor/localize.ts'))};`,
].join('\n');

function filenames(directory: string): string[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -5))
    .sort();
}

const publishedLanguages = filenames('src/translations/languages');
const editorLanguages = filenames('src/rendering/editor/translations').map((code) =>
  code.toLowerCase(),
);
const languages = [
  ...new Set([
    ...publishedLanguages,
    ...publishedLanguages.map((code) => code.toUpperCase()),
    'de-DE',
    'en-US',
    'en-GB',
    'ko-KR',
    'pt-BR',
    'zh-CN',
    'zh-TW',
    'unsupported',
    'zz-ZZ',
    '',
  ]),
];
const keys = [...Object.keys(SOURCE_EDITOR_STRINGS), 'missing.key', 'missing.key.helper', ''];

async function emitLibrary(compactPayloads: boolean): Promise<EmittedLibrary> {
  const entry: Plugin = {
    name: 'equivalence-entry',
    resolveId: (id) => (id === ENTRY_ID ? ENTRY_ID : null),
    load: (id) => (id === ENTRY_ID ? ENTRY : null),
  };
  const bundle = await rollup({
    input: ENTRY_ID,
    plugins: [entry, ...(createBuildPlugins({ compactPayloads }) as Plugin[])],
  });
  try {
    const { output } = await bundle.generate({ format: 'es', sourcemap: false });
    expect(output).toHaveLength(1);
    const chunk = output[0];
    if (chunk.type !== 'chunk') throw new Error('Expected a self-contained ES module');
    expect(chunk.imports).toEqual([]);
    expect(chunk.dynamicImports).toEqual([]);
    const url = `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`;
    const library = (await import(/* @vite-ignore */ url)) as PayloadLibrary;
    return { library, chunk };
  } finally {
    await bundle.close();
  }
}

function comparison(): Comparison {
  return { count: 0, mismatches: [] };
}

function compare(result: Comparison, label: string, actual: unknown, expected: unknown): void {
  result.count++;
  if (!Object.is(actual, expected) && result.mismatches.length < 12) {
    result.mismatches.push(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function assertEquivalent(name: string, result: Comparison, denominator: number): void {
  expect(result.count, `${name} comparison denominator`).toBe(denominator);
  expect(denominator).toBeGreaterThan(0);
  expect(result.mismatches, `${name}: ${result.count} comparisons`).toEqual([]);
  console.info(`${name}: ${result.count} comparisons, 0 mismatches`);
}

function localReferences(): Date[] {
  const references = [
    new Date(2024, 1, 29, 12, 30),
    new Date(2024, 0, 31, 23, 30),
    new Date(2025, 1, 28, 12, 30),
    new Date(2026, 11, 31, 23, 30),
  ];
  // Discover both transitions from local calendar dates, not hardcoded UTC instants.
  // UTC contributes no transitions; each DST project supplies its own two.
  for (let month = 0; month < 12; month++) {
    for (let day = 1; day <= 31; day++) {
      const start = new Date(2026, month, day);
      if (start.getMonth() !== month) continue;
      const next = new Date(2026, month, day + 1);
      if (start.getTimezoneOffset() === next.getTimezoneOffset()) continue;
      references.push(new Date(2026, month, day, 1, 30), new Date(2026, month, day, 3, 30));
    }
  }
  return references;
}

function elapsedOffsets(): number[] {
  const offsets = new Set([0, 1, 1000]);
  // Every rounding boundary in the seconds/minutes/hours/days threshold ranges,
  // including both sides of the relativeTime plugin's singular/plural transitions.
  for (const [unit, last] of [
    [1000, 90],
    [60_000, 90],
    [3_600_000, 36],
    [86_400_000, 46],
  ]) {
    for (let value = 0; value <= last; value++) {
      for (const delta of [-1, 0, 1]) {
        offsets.add((value + 0.5) * unit + delta);
      }
    }
  }
  return [...offsets].sort((a, b) => a - b);
}

function calendarTargets(reference: Date): Date[] {
  const targets: Date[] = [];
  for (const sign of [-1, 1]) {
    for (const months of [1, 2, 5, 10, 11, 12, 17, 18, 24, 60, 120]) {
      const target = new Date(reference);
      target.setMonth(target.getMonth() + sign * months);
      targets.push(target);
      // Month/year rounding depends on calendar lengths, not an assumed 30-day month.
      // Traverse the half-month boundary with local calendar arithmetic.
      for (const days of [13, 14, 15, 16, 17]) {
        const half = new Date(target);
        half.setDate(half.getDate() + sign * days);
        for (const hours of [0, 12]) {
          const fractional = new Date(half);
          fractional.setHours(fractional.getHours() + sign * hours);
          for (const delta of [-1, 0, 1]) {
            targets.push(new Date(fractional.valueOf() + delta));
          }
        }
      }
    }
    for (const years of [1, 2, 5, 20]) {
      const target = new Date(reference);
      target.setFullYear(target.getFullYear() + sign * years);
      targets.push(target);
    }
  }
  return targets;
}

/**
 * Register emitted original-versus-compacted payload tests in the current timezone.
 * Neither library imports source at runtime: Rollup generates independent data-URL modules.
 */
export function registerCompactPayloadEquivalenceTests(dst: boolean): void {
  describe('compact payloads preserve emitted behavior', () => {
    let control: EmittedLibrary;
    let candidate: EmittedLibrary;

    beforeAll(async () => {
      control = await emitLibrary(false);
      candidate = await emitLibrary(true);
    }, 120_000);

    if (dst) {
      it('runs with real DST transitions in both seasons', () => {
        expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
          new Date(2026, 6, 1).getTimezoneOffset(),
        );
        expect(localReferences()).toHaveLength(8);
      });
    }

    it('changes emitted bytes without adding imports or emitted files', () => {
      expect(candidate.chunk.code).not.toBe(control.chunk.code);
      const size = (code: string): { raw: number; gzip9: number } => ({
        raw: Buffer.byteLength(code),
        gzip9: gzipSync(code, { level: 9 }).byteLength,
      });
      const original = size(control.chunk.code);
      const compacted = size(candidate.chunk.code);
      expect(compacted.raw).toBeLessThan(original.raw);
      console.info(
        `payload library ${process.version} ${process.env.TZ}: ${JSON.stringify({ original, compacted })} (gzip level 9)`,
      );
    });

    it('preserves whole English and translated maps, including absent entries', () => {
      const original = control.library;
      const compacted = candidate.library;
      expect(Object.keys(original.EDITOR_STRINGS).sort()).toEqual(
        Object.keys(SOURCE_EDITOR_STRINGS).sort(),
      );
      expect(Object.keys(original.EDITOR_LANGUAGE_STRINGS).sort()).toEqual(editorLanguages.sort());
      expect(compacted.EDITOR_STRINGS).toStrictEqual(original.EDITOR_STRINGS);
      expect(compacted.EDITOR_LANGUAGE_STRINGS).toStrictEqual(original.EDITOR_LANGUAGE_STRINGS);
      const entries =
        Object.keys(original.EDITOR_STRINGS).length +
        Object.values(original.EDITOR_LANGUAGE_STRINGS).reduce(
          (sum, strings) => sum + Object.keys(strings).length,
          0,
        );
      expect(entries).toBeGreaterThan(0);
      const englishCount = Object.keys(original.EDITOR_STRINGS).length;
      for (const partial of ['ko', 'en-gb']) {
        const count = Object.keys(original.EDITOR_LANGUAGE_STRINGS[partial]).length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(englishCount);
      }
      console.info(
        `whole maps: ${entries} entries across English + ${editorLanguages.length} languages`,
      );
    });

    it('preserves every key lookup and view-qualified fallback precedence', () => {
      const result = comparison();
      for (const language of languages) {
        for (const key of keys) {
          compare(
            result,
            `${language}/${key}`,
            candidate.library.lookup(language, key),
            control.library.lookup(language, key),
          );
          for (const view of ['list', 'column', 'grid', 'shared']) {
            for (const suffix of ['', '.helper']) {
              compare(
                result,
                `${language}/${key}/${view}${suffix}`,
                candidate.library.lookupForView(language, key, view, suffix),
                control.library.lookupForView(language, key, view, suffix),
              );
            }
          }
        }
      }
      assertEquivalent('editor lookups', result, languages.length * keys.length * 9);
    });

    it('detects altered translations and removed fallback in a tiny mutation control', async () => {
      const emit = async (body: string): Promise<Pick<PayloadLibrary, 'lookup'>> =>
        (await import(
          /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(body).toString('base64')}`
        )) as Pick<PayloadLibrary, 'lookup'>;
      const prefix =
        'const en={label:"Label",fallback:"English fallback",empty:"English"};' +
        'const translated={label:"Translated",empty:""};';
      const original = await emit(
        `${prefix}export const lookup=(_language,key)=>translated[key]??en[key];`,
      );
      const mutants = [
        await emit(
          `${prefix}translated.label="Altered";export const lookup=(_language,key)=>translated[key]??en[key];`,
        ),
        await emit(`${prefix}export const lookup=(_language,key)=>translated[key];`),
      ];
      for (const mutant of mutants) {
        const result = comparison();
        for (const key of ['label', 'fallback', 'empty', 'absent']) {
          compare(result, key, mutant.lookup('test', key), original.lookup('test', key));
        }
        expect(result.count).toBe(4);
        expect(result.mismatches).toHaveLength(1);
      }
      expect(original.lookup('test', 'empty')).toBe('');
    });

    it('detects a wrong locale in relative-time, fromNow and Intl comparison controls', () => {
      const reference = new Date(2024, 1, 29, 12, 30);
      const target = new Date(reference.valueOf() + 3_600_000);
      const library = candidate.library;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(reference);
      try {
        const cases = [
          [
            'relative time',
            library.getRelativeTimeString(target, 'en', reference),
            control.library.getRelativeTimeString(target, 'de', reference),
          ],
          [
            'fromNow',
            library.getRelativeTimeString(target, 'en'),
            control.library.getRelativeTimeString(target, 'de'),
          ],
          ['now', library.getNowString('en'), control.library.getNowString('de')],
          [
            'relative unit',
            library.getRelativeUnitString(2, 'hour', 'en'),
            control.library.getRelativeUnitString(2, 'hour', 'de'),
          ],
        ];
        for (const [label, mutated, original] of cases) {
          const result = comparison();
          compare(result, label, mutated, original);
          expect(result.count).toBe(1);
          expect(result.mismatches, label).toHaveLength(1);
          expect(() => assertEquivalent(label, result, 1)).toThrow();
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves relative time across rounding, calendar lengths, leap days and transitions', () => {
      const references = localReferences();
      const offsets = elapsedOffsets();
      const result = comparison();
      let targetsPerLanguage = 0;
      for (const reference of references) {
        const targets = [
          ...offsets.flatMap((offset) =>
            [-1, 1].map((sign) => new Date(reference.valueOf() + sign * offset)),
          ),
          ...calendarTargets(reference),
          new Date(NaN),
        ];
        targetsPerLanguage += targets.length;
        for (const language of languages) {
          for (const target of targets) {
            compare(
              result,
              `${language}/${reference.valueOf()}/${target.valueOf()}`,
              candidate.library.getRelativeTimeString(target, language, reference),
              control.library.getRelativeTimeString(target, language, reference),
            );
          }
        }
      }
      assertEquivalent('relative time', result, languages.length * targetsPerLanguage);
      // Under a DST zone on a loaded CI runner this takes most of a minute, so the timeout
      // leaves room for a slower runner rather than tracking the usual duration.
    }, 180_000);

    it('preserves frozen fromNow, now labels and relative-unit formatting', () => {
      const reference = new Date(2024, 1, 29, 12, 30);
      const targets = [
        ...[-46 * 86_400_000, -90_000, 0, 44_499, 44_500, 44_501, 90_000, 46 * 86_400_000].map(
          (offset) => new Date(reference.valueOf() + offset),
        ),
        ...calendarTargets(reference),
        new Date(NaN),
      ];
      const values = [-50, -12, -2, -1, 0, 1, 2, 12, 50];
      const result = comparison();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(reference);
      try {
        for (const language of languages) {
          for (const target of targets) {
            compare(
              result,
              `fromNow/${language}/${target.valueOf()}`,
              candidate.library.getRelativeTimeString(target, language),
              control.library.getRelativeTimeString(target, language),
            );
          }
          compare(
            result,
            `now/${language}`,
            candidate.library.getNowString(language),
            control.library.getNowString(language),
          );
          for (const unit of ['day', 'hour'] as const) {
            for (const value of values) {
              compare(
                result,
                `${language}/${value}/${unit}`,
                candidate.library.getRelativeUnitString(value, unit, language),
                control.library.getRelativeUnitString(value, unit, language),
              );
            }
          }
        }
      } finally {
        vi.useRealTimers();
      }
      assertEquivalent('fromNow and Intl labels', result, languages.length * (targets.length + 19));
    }, 60_000);
  });
}
