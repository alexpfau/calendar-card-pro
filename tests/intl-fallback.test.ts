/**
 * Every string the card takes from `Intl` falls back from Nynorsk to Bokmål where the browser
 * carries no Nynorsk data, and keeps Nynorsk where it does (`src/translations/intl-locales.ts`).
 *
 * Node carries Nynorsk, so the browser that lacks it is emulated: `Intl.DateTimeFormat`,
 * `Intl.RelativeTimeFormat` and `Intl.ListFormat` are replaced by subclasses that drop `nn` from
 * every request and from `supportedLocalesOf`, and resolve a request with nothing left to
 * `en-US`, the default of the browser emulated. That is what Chromium 151 does in English,
 * measured: `new Intl.RelativeTimeFormat('nn').resolvedOptions().locale` is `en-US` there, and
 * `supportedLocalesOf(['nn'])` is empty for all three. A browser in another language resolves to
 * that language instead, which only moves where a lost fallback would land.
 *
 * Each string is held both ways. Under the emulation, Nynorsk must read as Bokmål does and not
 * as English, which fails if the fallback is taken away. Without it, Nynorsk must read as Node's
 * Nynorsk, which differs from Bokmål for the strings that tell the two apart ("No" against "Nå"),
 * so a fallback that always applied fails too. The modules cache their formats, so each case
 * imports them afresh.
 *
 * The last block reconciles every `Intl` call in `src/` against the fallback, since a new one
 * that skips it reads in English on a Nynorsk card in Chromium with every other test green.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';

/** An `Intl` service, as far as the emulation needs one. */
type Service = (new (locales?: Intl.LocalesArgument, options?: object) => object) & {
  supportedLocalesOf(locales: Intl.LocalesArgument, options?: object): string[];
};

/** The services the card formats with: dates, relative times, and lists in the editor. */
const SERVICES = ['DateTimeFormat', 'RelativeTimeFormat', 'ListFormat'] as const;

const IntlServices = Intl as unknown as Record<(typeof SERVICES)[number], Service>;
const REAL = Object.fromEntries(SERVICES.map((name) => [name, IntlServices[name]])) as Record<
  (typeof SERVICES)[number],
  Service
>;

/** A Nynorsk tag, with or without a region. */
const NYNORSK = /^nn(?:-|$)/i;

/** The tags of a locales argument that a browser without Nynorsk data has data for. */
function withoutNynorsk(locales: Intl.LocalesArgument): string[] {
  const list = locales === undefined ? [] : Array.isArray(locales) ? locales : [locales];
  return list.map(String).filter((tag) => !NYNORSK.test(tag));
}

/** A service as a browser without Nynorsk data has it. */
function withoutNynorskData(Real: Service): Service {
  return class extends Real {
    constructor(locales?: Intl.LocalesArgument, options?: object) {
      const kept = withoutNynorsk(locales);
      super(kept.length > 0 ? kept : 'en-US', options);
    }

    static supportedLocalesOf(locales: Intl.LocalesArgument, options?: object): string[] {
      return Real.supportedLocalesOf(withoutNynorsk(locales), options);
    }
  };
}

function setServices(make: (name: (typeof SERVICES)[number]) => Service): void {
  for (const name of SERVICES) {
    Object.defineProperty(Intl, name, { value: make(name), configurable: true, writable: true });
  }
}

/** Replaces `Intl`'s services with the ones a browser without Nynorsk data has. */
function emulateBrowserWithoutNynorsk(): void {
  setServices((name) => withoutNynorskData(REAL[name]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  setServices((name) => REAL[name]);
});

describe('the emulation', () => {
  it('reads Nynorsk as Chromium 151 does, in English, and leaves every other language alone', () => {
    emulateBrowserWithoutNynorsk();

    expect(new Intl.RelativeTimeFormat('nn').resolvedOptions().locale).toBe('en-US');
    expect(new Intl.DateTimeFormat('nn-NO').resolvedOptions().locale).toBe('en-US');
    expect(Intl.RelativeTimeFormat.supportedLocalesOf(['nn'])).toEqual([]);
    expect(Intl.DateTimeFormat.supportedLocalesOf(['nn', 'nb'])).toEqual(['nb']);
    expect(new Intl.RelativeTimeFormat(['nn', 'nb']).resolvedOptions().locale).toBe('nb');
    expect(new Intl.DateTimeFormat('de').resolvedOptions().locale).toBe('de');
    const lists = (Intl as unknown as Record<string, Service>).ListFormat;
    expect(lists.supportedLocalesOf(['nn'])).toEqual([]);
    expect(lists.supportedLocalesOf(['nn', 'nb'])).toEqual(['nb']);
  });
});

/** An event starting at a given UTC time on the fixture's day or after it. */
function startingAt(iso: string): Types.CalendarEventData {
  return {
    summary: 'Anna',
    start: { dateTime: iso },
    end: { dateTime: new Date(new Date(iso).getTime() + 3600000).toISOString() },
  } as Types.CalendarEventData;
}

const RRULE_PREFIX = 'ui.components.calendar.event.rrule.';
const RRULE_WORDS: Record<string, string> = {
  every: 'every',
  week: 'week',
  on: 'on',
  until: 'until',
};
const localizeRRule = (key: string) =>
  key.startsWith(RRULE_PREFIX) ? (RRULE_WORDS[key.slice(RRULE_PREFIX.length)] ?? '') : '';

/**
 * Every string the card takes from `Intl` in a language, each through the function the card
 * calls for it. Imported afresh, so no format cached in an earlier case answers.
 */
async function intlStrings(language: string): Promise<Record<string, string | boolean | null>> {
  const { getNowString, getRelativeUnitString } = await import('../src/translations/dayjs');
  const Paging = await import('../src/utils/paging');
  const Format = await import('../src/utils/format');
  const Presentation = await import('../src/rendering/presentation');
  const { spanText } = await import('../src/interaction/popover-model');
  const { describeRRule } = await import('../src/interaction/rrule');
  const { getTimeFormat24h } = await import('../src/utils/helpers');
  const { formatList } = await import('../src/rendering/editor/localize');

  const running = startingAt('2026-06-17T09:30:00.000Z');
  const tuesday = new Date(2026, 5, 16);
  const presentation = Presentation.buildEventPresentation(running, buildConfig(), language);

  return {
    now: getNowString(language),
    nowBadge: presentation.contentParts.nowLabel ?? null,
    hours: getRelativeUnitString(3, 'hour', language),
    tomorrow: getRelativeUnitString(1, 'day', language),
    countdownHours: Format.getCountdownString(startingAt('2026-06-17T14:00:00.000Z'), language),
    countdownTomorrow: Format.getCountdownString(startingAt('2026-06-18T12:00:00.000Z'), language),
    today: Paging.todayWord(language),
    dayName: Paging.dayName(tuesday, language),
    monthHeading: Paging.monthHeadingText(Paging.monthHeadingParts(tuesday, language)),
    popoverSpan: spanText(
      { allDay: false, start: new Date(2026, 5, 16, 13, 0), end: new Date(2026, 5, 16, 14, 0) },
      language,
      true,
    ),
    rrule: describeRRule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260714', localizeRRule, language) ?? null,
    // Ends on a Friday, which Nynorsk and Bokmål both call "fredag": the weekday in this
    // phrase is the card's own word, and the rest of the date is the browser's.
    endDate: Format.formatEventTime(
      {
        summary: 'Anna',
        start: { dateTime: '2026-06-17T09:30:00.000Z' },
        end: { dateTime: '2026-06-19T15:00:00.000Z' },
      } as Types.CalendarEventData,
      buildConfig({ split_multiday_events: false, time_24h: true }),
      language,
    ),
    clock24h: getTimeFormat24h({ time_format: 'language', language }),
    editorList: formatList(language, ['Anna', 'Ben'], 'conjunction'),
  };
}

/** The strings in which Node's Nynorsk and Bokmål differ, so a test can tell which one it got. */
const TELLS_NYNORSK_FROM_BOKMAL = [
  'now',
  'nowBadge',
  'hours',
  'tomorrow',
  'countdownHours',
  'countdownTomorrow',
  'dayName',
  'rrule',
];

describe('a Nynorsk card', () => {
  it('reads every Intl string in Bokmål where the browser has no Nynorsk', async () => {
    emulateBrowserWithoutNynorsk();
    const nynorsk = await intlStrings('nn');
    vi.resetModules();
    const bokmal = await intlStrings('nb');
    vi.resetModules();
    const english = await intlStrings('en');

    expect(nynorsk).toEqual(bokmal);
    expect(nynorsk.now).toBe('Nå');
    expect(nynorsk.clock24h).toBe(true);
    for (const [key, value] of Object.entries(nynorsk)) {
      if (key === 'clock24h') continue;
      expect(value, key).not.toBe(english[key]);
    }
    expect(english.clock24h, 'a 12-hour English clock, which a lost fallback would give').toBe(
      false,
    );
  });

  it('keeps Nynorsk where the browser has it', async () => {
    const nynorsk = await intlStrings('nn');
    vi.resetModules();
    const bokmal = await intlStrings('nb');

    expect(nynorsk.now).toBe('No');
    expect(nynorsk.clock24h).toBe(true);
    for (const key of TELLS_NYNORSK_FROM_BOKMAL) {
      expect(nynorsk[key], key).not.toBe(bokmal[key]);
    }
  });

  it('falls back with its region: nn-NO to nb-NO', async () => {
    const { intlLocales } = await import('../src/translations/intl-locales');

    expect(intlLocales('nn-NO')).toEqual(['nn-NO', 'nb-NO']);
    expect(intlLocales('NN')).toEqual(['NN', 'nb']);
    expect(intlLocales('nb')).toEqual(['nb']);
    expect(intlLocales('de')).toEqual(['de']);
  });

  it('leaves every other card language as it was', async () => {
    const { CARD_LANGUAGES } = await import('../src/translations/language-codes');
    const { intlLocales } = await import('../src/translations/intl-locales');

    const widened = CARD_LANGUAGES.filter((language) => intlLocales(language).length > 1);
    expect(widened).toEqual(['nn']);
  });
});

//-----------------------------------------------------------------------------
// EVERY INTL CALL IN src/
//-----------------------------------------------------------------------------

interface IntlSite {
  file: string;
  call: string;
  locales: string;
}

const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);

/** An expression with its parentheses and type casts peeled off. */
function unwrap(node: ts.Expression): ts.Expression {
  let inner = node;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isNonNullExpression(inner) ||
    ts.isTypeAssertionExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

/** The outermost parenthesis or cast wrapped around a node, or the node itself. */
function outermost(node: ts.Node): ts.Node {
  let outer = node;
  while (
    ts.isParenthesizedExpression(outer.parent) ||
    ts.isAsExpression(outer.parent) ||
    ts.isNonNullExpression(outer.parent) ||
    ts.isTypeAssertionExpression(outer.parent)
  ) {
    outer = outer.parent;
  }
  return outer;
}

/** The `Intl` member an expression names: `Intl.DateTimeFormat`, `(Intl as T).ListFormat`. */
function intlMember(node: ts.Expression): string | undefined {
  const inner = unwrap(node);
  if (!ts.isPropertyAccessExpression(inner)) return undefined;
  const object = unwrap(inner.expression);
  return ts.isIdentifier(object) && object.text === 'Intl' ? inner.name.text : undefined;
}

/**
 * Every place a source asks `Intl` for locale data, read from its syntax tree so comments,
 * strings and types never count: an `Intl` service called with or without `new`, directly, through
 * a cast or through a constant in the same file that holds it, and the `toLocale…String` methods
 * that format through `Intl`, each with the source of its locales. `Intl` reached any other way,
 * such as `const { DateTimeFormat } = Intl`, is a site of its own whose locales read `(escapes)`,
 * so a formatter cannot leave the check by taking another name. Asking `supportedLocalesOf` is
 * not a site: it formats nothing.
 */
function intlSites(file: string, source: string): IntlSite[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const aliases = new Map<string, string>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const member = intlMember(node.initializer);
      if (member) aliases.set(node.name.text, member);
    }
    ts.forEachChild(node, collect);
  };
  collect(tree);

  const sites: IntlSite[] = [];
  const firstArgument = (call: ts.CallExpression | ts.NewExpression) =>
    call.arguments?.[0]?.getText(tree) ?? '';
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
      const member =
        intlMember(node.expression) ??
        (ts.isIdentifier(node.expression) ? aliases.get(node.expression.text) : undefined);
      if (member) {
        sites.push({ file, call: `Intl.${member}`, locales: firstArgument(node) });
      } else if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        LOCALE_METHODS.has(node.expression.name.text)
      ) {
        sites.push({ file, call: node.expression.name.text, locales: firstArgument(node) });
      }
    }
    if (
      ts.isIdentifier(node) &&
      node.text === 'Intl' &&
      !ts.isQualifiedName(node.parent) &&
      !ts.isTypeQueryNode(node.parent)
    ) {
      const held = outermost(node);
      const access = held.parent;
      let accounted = false;
      if (ts.isPropertyAccessExpression(access) && access.expression === held) {
        const reference = outermost(access);
        const user = reference.parent;
        accounted =
          ((ts.isNewExpression(user) || ts.isCallExpression(user)) &&
            user.expression === reference) ||
          (ts.isPropertyAccessExpression(user) && user.name.text === 'supportedLocalesOf') ||
          (ts.isVariableDeclaration(user) &&
            user.initializer === reference &&
            ts.isIdentifier(user.name));
      }
      if (!accounted) sites.push({ file, call: 'Intl', locales: '(escapes)' });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return sites;
}

/**
 * Whether a site's locales come through the fallback: `intlLocales` imported from the module
 * that holds it, or a file's own `intlLocale` that builds on it.
 */
function routed(site: IntlSite, source: string): boolean {
  const imported =
    /import \{[^}]*\bintlLocales\b[^}]*\} from '[./]+(?:translations\/)?intl-locales'/;
  if (site.locales.startsWith('intlLocales(')) return imported.test(source);
  return (
    site.locales.startsWith('intlLocale(') &&
    imported.test(source) &&
    /function intlLocale\([^)]*\)[^{]*\{[^}]*\bintlLocales\(/.test(source)
  );
}

/**
 * The calls that take no fallback, each for a reason: none of them writes a word the card
 * shows.
 */
const OUTSIDE_THE_FALLBACK: IntlSite[] = [
  // Maps a country to the language spoken there, to choose how a place name is looked up.
  { file: 'src/interaction/event-map.ts', call: 'Intl.Locale', locales: '`und-${country}`' },
  // Splits a grid title into graphemes to measure it; it writes nothing.
  { file: 'src/utils/grid-title-fit.ts', call: 'Intl.Segmenter', locales: 'undefined' },
  // Reads a time zone's offset from a format's parts; the text is never shown.
  { file: 'src/utils/live-calendars.ts', call: 'Intl.DateTimeFormat', locales: "'en-US'" },
  // Canonicalizes the card language for lower-casing search text, which no Intl data changes.
  { file: 'src/utils/search.ts', call: 'Intl.getCanonicalLocales', locales: 'language' },
  // Splits a title into words where it wraps; it writes nothing.
  { file: 'src/utils/title-words.ts', call: 'Intl.Segmenter', locales: 'undefined' },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('every Intl call in src/', () => {
  it('finds a call that skips the fallback, as its own check', () => {
    const planted = [
      "import { intlLocales } from '../translations/intl-locales';",
      '// new Intl.DateTimeFormat(language) in a comment is not a call',
      "const a = new Intl.DateTimeFormat(language, { weekday: 'long' });",
      'const b = Intl.NumberFormat(locale).format(1);',
      "const c = date.toLocaleDateString('nn');",
      'const d = new Intl.RelativeTimeFormat(intlLocales(language), { numeric });',
      'const e = Intl.DateTimeFormat.supportedLocalesOf([language]);',
      'const F = Intl.DateTimeFormat;',
      'const f = new F(language);',
      'const L = (Intl as unknown as { ListFormat: never }).ListFormat;',
      'const l = new L(intlLocales(language), { type });',
      'const { RelativeTimeFormat } = Intl;',
      'let g: Intl.DateTimeFormat | undefined;',
      'type H = typeof Intl;',
    ].join('\n');
    const sites = intlSites('planted.ts', planted);

    expect(sites.map((site) => [site.call, site.locales, routed(site, planted)])).toEqual([
      ['Intl.DateTimeFormat', 'language', false],
      ['Intl.NumberFormat', 'locale', false],
      ['toLocaleDateString', "'nn'", false],
      ['Intl.RelativeTimeFormat', 'intlLocales(language)', true],
      ['Intl.DateTimeFormat', 'language', false],
      ['Intl.ListFormat', 'intlLocales(language)', true],
      ['Intl', '(escapes)', false],
    ]);
    // A function of the same name from anywhere else does not count.
    const lookalike = 'const h = new Intl.DateTimeFormat(intlLocales(language));';
    expect(intlSites('lookalike.ts', lookalike).map((site) => routed(site, lookalike))).toEqual([
      false,
    ]);
  });

  it('routes every one through intlLocales, but for the few that write nothing', () => {
    const root = process.cwd();
    const all = sourceFiles(join(root, 'src')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const file = relative(root, path).split('\\').join('/');
      return intlSites(file, source).map((site) => ({ site, isRouted: routed(site, source) }));
    });
    const throughFallback = all.filter(({ isRouted }) => isRouted);
    const outside = all
      .filter(({ isRouted }) => !isRouted)
      .map(({ site }) => site)
      .sort((a, b) => a.file.localeCompare(b.file) || a.call.localeCompare(b.call));

    expect(throughFallback.length, `${all.length} calls found`).toBeGreaterThan(0);
    expect(outside).toEqual(OUTSIDE_THE_FALLBACK);
  });
});
