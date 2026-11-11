/**
 * The card's one rule for a language the browser's `Intl` cannot write
 * (`src/translations/intl-locales.ts`): the language, then the one its readers read as well
 * (Nynorsk then Bokmål), then English, the card's default language, never the browser's own.
 *
 * Node carries every card language, so a browser that lacks some is emulated:
 * `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` and `Intl.ListFormat` are replaced by
 * subclasses that drop those languages from every request and from `supportedLocalesOf`, and
 * resolve a request with nothing left to the browser's own language. That is what Chromium 151
 * does, measured: it carries no Icelandic or Nynorsk for any of the three, and
 * `new Intl.RelativeTimeFormat('nn').resolvedOptions().locale` is `en-US` in an English Chromium,
 * while an Icelandic card in a German one read "Jetzt".
 *
 * Each string is held both ways. Under the emulation, Nynorsk must read as Bokmål does and not
 * as English, which fails if the fallback is taken away; Icelandic, with no neighbor, must read as
 * English does and not as the German browser does, which fails if the English tier is taken away.
 * Without the emulation, Nynorsk must read as Node's Nynorsk, which differs from Bokmål for the
 * strings that tell the two apart ("No" against "Nå"), so a fallback that always applied fails
 * too. The modules cache their formats, so each case imports them afresh.
 *
 * The last block reconciles every `Intl` call in `src/` against the rule: each takes its locales
 * from `intlLocales`, and only `intl-locales.ts` asks whether the browser has a language, so a new
 * call that falls back its own way fails here with every other test green.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import { intlStrings } from './intl-strings';

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

/** Icelandic or Nynorsk, with or without a region: the card languages Chromium 151 lacks. */
const CHROMIUM_LACKS = /^(?:is|nn)(?:-|$)/i;

/** The tags of a locales argument that the browser has data for. */
function kept(locales: Intl.LocalesArgument, lacking: RegExp): string[] {
  const list = locales === undefined ? [] : Array.isArray(locales) ? locales : [locales];
  return list.map(String).filter((tag) => !lacking.test(tag));
}

/** A service as a browser without some languages' data has it, in its own language otherwise. */
function withoutData(Real: Service, lacking: RegExp, own: string): Service {
  return class extends Real {
    constructor(locales?: Intl.LocalesArgument, options?: object) {
      const left = kept(locales, lacking);
      super(left.length > 0 ? left : own, options);
    }

    static supportedLocalesOf(locales: Intl.LocalesArgument, options?: object): string[] {
      return Real.supportedLocalesOf(kept(locales, lacking), options);
    }
  };
}

function setServices(make: (name: (typeof SERVICES)[number]) => Service): void {
  for (const name of SERVICES) {
    Object.defineProperty(Intl, name, { value: make(name), configurable: true, writable: true });
  }
}

/**
 * Replaces `Intl`'s services with the ones a browser has that lacks some languages.
 *
 * @param lacking - The languages it has no data for
 * @param own - The browser's own language, which a request it has nothing for resolves to
 */
function emulateBrowser(lacking: RegExp, own: string): void {
  setServices((name) => withoutData(REAL[name], lacking, own));
}

/** Replaces `Intl`'s services with the ones an English browser without Nynorsk data has. */
function emulateBrowserWithoutNynorsk(): void {
  emulateBrowser(NYNORSK, 'en-US');
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

  it('reads Icelandic in a German browser in German, as the backlog measured', () => {
    emulateBrowser(CHROMIUM_LACKS, 'de');

    expect(new Intl.RelativeTimeFormat('is', { numeric: 'auto' }).format(0, 'second')).toBe(
      'jetzt',
    );
    expect(new Intl.RelativeTimeFormat(['is', 'en']).resolvedOptions().locale).toBe('en');
    expect(Intl.DateTimeFormat.supportedLocalesOf(['is'])).toEqual([]);
  });
});

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

  it('falls back with its region: nn-NO to nb-NO, then English', async () => {
    const { intlLocales } = await import('../src/translations/intl-locales');

    expect(intlLocales('nn-NO')).toEqual(['nn-NO', 'nb-NO', 'en']);
    expect(intlLocales('NN')).toEqual(['NN', 'nb', 'en']);
    expect(intlLocales('nb')).toEqual(['nb', 'en']);
    expect(intlLocales('de')).toEqual(['de', 'en']);
  });
});

describe('a language the browser cannot write, with no neighbor', () => {
  // The backlog's case: an Icelandic card in a German Chromium read "Jetzt" in its countdowns
  // and English in its toolbar.
  it("reads every Intl string in English, not in the browser's own language", async () => {
    emulateBrowser(CHROMIUM_LACKS, 'de');
    const { endDate: icelandicEnd, ...icelandic } = await intlStrings('is');
    vi.resetModules();
    const { endDate: englishEnd, ...english } = await intlStrings('en');
    vi.resetModules();
    const german = await intlStrings('de');

    expect(icelandic).toEqual(english);
    for (const [key, value] of Object.entries(icelandic)) {
      expect(value, key).not.toBe(german[key]);
    }
    expect(icelandicEnd).not.toBe(englishEnd);
  });

  it("dates an end phrase from the card's own month names, and so stays in its language", async () => {
    emulateBrowser(CHROMIUM_LACKS, 'de');
    const { TRANSLATIONS } = await import('../src/translations/localize');
    const icelandic = TRANSLATIONS.is;
    const { endDate } = await intlStrings('is');

    // The fixture ends on Friday, June 19.
    expect(endDate).toContain(`${icelandic.fullDaysOfWeek[5]}, 19 ${icelandic.months[5]}`);
  });

  it('answers in English for a language the card does not speak at all', async () => {
    emulateBrowser(/^xx(?:-|$)/i, 'de');
    const unknown = await intlStrings('xx');
    vi.resetModules();
    const english = await intlStrings('en');

    expect(unknown).toEqual(english);
  });
});

describe('every language the browser can write', () => {
  it('resolves exactly as it did without the rule, for every card language', async () => {
    const { CARD_LANGUAGES } = await import('../src/translations/language-codes');
    const { intlLocales } = await import('../src/translations/intl-locales');

    for (const name of SERVICES) {
      const Real = REAL[name];
      const resolved = (locales: string | string[]) =>
        (new Real(locales) as { resolvedOptions(): { locale: string } }).resolvedOptions().locale;
      for (const language of CARD_LANGUAGES) {
        expect(resolved(intlLocales(language)), `${name} ${language}`).toBe(resolved(language));
      }
    }
  });

  it("only Nynorsk has a neighbor, and every list ends in the card's default language", async () => {
    const { CARD_LANGUAGES, DEFAULT_LANGUAGE } = await import('../src/translations/language-codes');
    const { intlLocales } = await import('../src/translations/intl-locales');

    expect(DEFAULT_LANGUAGE).toBe('en');
    const unlike = CARD_LANGUAGES.filter(
      (language) => intlLocales(language).join() !== [language, DEFAULT_LANGUAGE].join(),
    );
    expect(unlike).toEqual(['en', 'nn']);
    expect(intlLocales('en')).toEqual(['en']);
    expect(intlLocales('nn')).toEqual(['nn', 'nb', 'en']);
  });
});

describe("every resolver of the card's language", () => {
  it("answers a language the card does not speak in English, the card's default", async () => {
    const LanguageCodes = await import('../src/translations/language-codes');
    const { getTranslations, TRANSLATIONS } = await import('../src/translations/localize');
    const { getRelativeTimeString } = await import('../src/translations/dayjs');
    const { lookup } = await import('../src/rendering/editor/localize');
    const english = LanguageCodes.DEFAULT_LANGUAGE;
    const date = new Date(FROZEN_NOW.getTime() + 3 * 86_400_000);

    expect(LanguageCodes.getEffectiveLanguage('xx', { language: 'yy' })).toBe(english);
    expect(getTranslations('xx')).toBe(TRANSLATIONS[english]);
    expect(getRelativeTimeString(date, 'xx')).toBe(getRelativeTimeString(date, english));
    expect(lookup('xx', 'view')).toBe(lookup(english, 'view'));
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
          // Handed to the rule's own question, which asks it what it has and formats nothing.
          (ts.isCallExpression(user) &&
            ts.isIdentifier(user.expression) &&
            user.expression.text === 'intlSpeaks' &&
            user.arguments[0] === reference) ||
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
 * Whether a site's locales come through the rule: `intlLocales`, imported from the module that
 * holds it, called right there. A file's own wrapper around it does not count, since a wrapper is
 * where a second rule would go: `paging.ts` had one, which sent a language the browser lacked to
 * English while every other call left it to the browser.
 */
function routed(site: IntlSite, source: string): boolean {
  const imported =
    /import \{[^}]*\bintlLocales\b[^}]*\} from '[./]+(?:translations\/)?intl-locales'/;
  return site.locales.startsWith('intlLocales(') && imported.test(source);
}

/**
 * Every place a source asks an `Intl` service which languages it has, read from its syntax tree:
 * a call of a `supportedLocalesOf` member, on whatever it is called.
 */
function supportQuestions(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'supportedLocalesOf'
    ) {
      found.push(`${file}: ${node.getText(tree).replace(/\s+/g, ' ')}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/**
 * The calls that take no fallback, each for a reason: none of them writes a word the card
 * shows.
 */
const OUTSIDE_THE_FALLBACK: IntlSite[] = [
  // Maps a country to the language spoken there, to choose how a place name is looked up.
  { file: 'src/interaction/event-map.ts', call: 'Intl.Locale', locales: '`und-${country}`' },
  // Reaches Home Assistant's polyfill of a service to add a language's data to it; formats
  // nothing, and asks what the polyfill has through `intlSpeaks`.
  { file: 'src/translations/intl-locale-data.ts', call: 'Intl', locales: '(escapes)' },
  // Canonicalizes a tag to compare it with what that polyfill resolves it to; writes nothing.
  {
    file: 'src/translations/intl-locale-data.ts',
    call: 'Intl.getCanonicalLocales',
    locales: 'locale',
  },
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
  it("finds a question about a browser's languages, as its own check", () => {
    const planted = [
      '// Intl.DateTimeFormat.supportedLocalesOf([language]) in a comment is not one',
      'const a = Intl.DateTimeFormat.supportedLocalesOf([language]).length > 0;',
      'const b = service.supportedLocalesOf(locales);',
      "const c = 'supportedLocalesOf';",
    ].join('\n');

    expect(supportQuestions('planted.ts', planted)).toEqual([
      'planted.ts: Intl.DateTimeFormat.supportedLocalesOf([language])',
      'planted.ts: service.supportedLocalesOf(locales)',
    ]);
  });

  it("asks whether the browser has a language in one place, the rule's own", () => {
    const root = process.cwd();
    const asked = sourceFiles(join(root, 'src')).flatMap((path) =>
      supportQuestions(relative(root, path).split('\\').join('/'), readFileSync(path, 'utf8')),
    );

    expect(asked).toEqual([
      'src/translations/intl-locales.ts: service.supportedLocalesOf(readerLocales(language))',
    ]);
  });

  it('finds a call that skips the fallback, as its own check', () => {
    const planted = [
      "import { intlLocales } from '../translations/intl-locales';",
      '// new Intl.DateTimeFormat(language) in a comment is not a call',
      "const a = new Intl.DateTimeFormat(language, { weekday: 'long' });",
      'const b = Intl.NumberFormat(locale).format(1);',
      "const c = date.toLocaleDateString('nn');",
      'const d = new Intl.RelativeTimeFormat(intlLocales(language), { numeric });',
      'const e = Intl.DateTimeFormat.supportedLocalesOf([language]);',
      'const s = intlSpeaks(Intl.DateTimeFormat, language);',
      'const t = intlSpeaks(language, Intl.DateTimeFormat);',
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
      ['Intl', '(escapes)', false],
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
