/**
 * Regression tests for the weekend, resolved from where the home is.
 *
 * `isWeekendDate` used to answer Saturday and Sunday for everybody. That is wrong in
 * every Friday–Saturday region and in every Sunday-only one, and it was wrong twice over
 * on the same row: the weekend day-header colors and the shading read this function, and
 * so does the per-calendar `days_of_week` filter, so a Friday in Israel was filtered as a
 * weekday and colored as one while the user's own calendar app called it the weekend.
 *
 * Two tables replaced it, and these tests pin both the way
 * `tests/first-day-of-week-locale.test.ts` pins `FIRST_DAY_BY_LOCALE`: against the CLDR
 * data shipped inside the runtime, over the real input domain.
 *
 * - `WEEKEND_BY_COUNTRY` is read first, over every country code Home Assistant accepts.
 *   CLDR defines the weekend per territory, so this is the one that decides.
 * - `WEEKEND_BY_LOCALE` is the fallback for a home with no country set, over every
 *   language Home Assistant's frontend ships. A language stands for one territory only,
 *   which is why it comes second: `en` answers for the United States wherever the home is.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/**
 * Every language Home Assistant's frontend ships, from its own `translationMetadata.json`.
 * This is the real input domain for the fallback, because the value that reaches
 * `WEEKEND_BY_LOCALE` is `hass.locale.language`.
 */
const HA_LANGUAGES = [
  'af',
  'ar',
  'bg',
  'bn',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'en-GB',
  'eo',
  'es',
  'es-419',
  'et',
  'eu',
  'fa',
  'fi',
  'fy',
  'fr',
  'ga',
  'gl',
  'gsw',
  'he',
  'hi',
  'hr',
  'hu',
  'hy',
  'id',
  'it',
  'is',
  'ja',
  'ka',
  'ko',
  'lb',
  'lt',
  'lv',
  'mk',
  'ml',
  'nl',
  'nb',
  'nn',
  'pl',
  'pt',
  'pt-BR',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sr-Latn',
  'sv',
  'sq',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh-Hans',
  'zh-Hant',
];

/**
 * Every country code Home Assistant accepts, from `homeassistant/generated/countries.py`
 * in home-assistant/core. `hass.config.country` is validated against this set, so it is
 * the real input domain for `WEEKEND_BY_COUNTRY`: ISO 3166-1 alpha-2, uppercase, as Home
 * Assistant stores it. One block rather than one entry per line, which would bury the file.
 */
const HA_COUNTRIES = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ
  BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR
  CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
  GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ
  LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ
  MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF
  PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
  SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR
  TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/);

/**
 * Read CLDR's weekend straight from the runtime, as the day numbers this card uses
 * (0 = Sunday). CLDR numbers days 1 = Monday .. 7 = Sunday, so `% 7` maps Sunday to 0.
 *
 * Two spellings exist and the project's own runtimes disagree about which: Node 22 — the
 * version CI and the docs deploy are pinned to — exposes only the `weekInfo` getter,
 * while Node 25 also has the `getWeekInfo()` method. That split is exactly why the card
 * ships a table instead of calling this at runtime.
 */
function cldrWeekend(tag: string): number[] | undefined {
  const locale = new Intl.Locale(tag) as unknown as {
    getWeekInfo?: () => { weekend: number[] };
    weekInfo?: { weekend: number[] };
  };
  const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;

  return Array.isArray(info?.weekend)
    ? [...new Set(info.weekend.map((day) => day % 7))].sort((a, b) => a - b)
    : undefined;
}

/**
 * The runtime's own CLDR and ICU versions, named in every failure message below.
 *
 * The oracle above is not a fixture — it is data that ships inside whatever Node is
 * running, and `.nvmrc` pins only the major (`22`), so `actions/setup-node` resolves the
 * newest 22.x at run time. Those patch releases do not always agree: CLDR 48 moved
 * Iceland's week start, which is what made `first-day-of-week-locale.test.ts` pass on
 * 22.23.2 and fail on 22.18.0 for the same source. Naming the version turns a
 * ten-minute misread of a correct table into a one-line one.
 *
 * Measured 2026-09-06 on Node 22.23.2 and Node 25.8.0, both CLDR 48: identical answers
 * for all 65 languages, so nothing below is specific to the local runtime. Measured again
 * 2026-10-06 for all 249 countries on Node 22.0.0 (CLDR 44.1), 22.18.0 (CLDR 47), 22.23.3
 * (CLDR 48) and 25.8.0 (CLDR 48): identical on all four, so unlike Iceland's week start,
 * no country's weekend moves between the Node 22 patches CI might resolve.
 */
const RUNTIME_CLDR = `CLDR ${process.versions.cldr} / ICU ${process.versions.icu} (Node ${process.versions.node})`;

/** Points at the runtime before the tables, because that is where the fault usually is. */
const CLDR_HINT =
  `runtime is ${RUNTIME_CLDR}. A mismatch here more often means this Node's CLDR differs ` +
  `from the one CI resolves than that a table is wrong — reproduce on the newest 22.x ` +
  `before changing WEEKEND_BY_COUNTRY or WEEKEND_BY_LOCALE.`;

/** A plain sorted copy of a weekend, so it compares by value against the oracle. */
function sorted(days: readonly number[]): number[] {
  return [...days].sort((a, b) => a - b);
}

/** The card's answer for a home, given whatever part of `hass` the case supplies. */
function resolvedHome(hass?: FormatUtils.WeekendSource | null): number[] {
  return sorted(FormatUtils.getWeekendDays(hass));
}

/** The card's answer for a language with no country set, as the fallback sees it. */
function resolved(language?: string): number[] {
  return resolvedHome(language === undefined ? undefined : { locale: { language } });
}

/** The card's answer for a home with its country set, running Home Assistant in `language`. */
function resolvedIn(country: string, language = 'en'): number[] {
  return resolvedHome({ config: { country }, locale: { language } });
}

/**
 * CLDR's weekend for every country Home Assistant accepts whose weekend is not Saturday
 * and Sunday — what `WEEKEND_BY_COUNTRY` should hold, derived rather than written down.
 * An unavailable oracle records `[]`, which no table entry can match, so it fails loudly.
 */
function cldrCountryExceptions(): Record<string, number[]> {
  const exceptions: Record<string, number[]> = {};
  for (const code of HA_COUNTRIES) {
    const weekend = cldrWeekend(`und-${code}`) ?? [];
    if (weekend.join(',') !== '0,6') {
      exceptions[code] = weekend;
    }
  }
  return exceptions;
}

describe('CLDR oracle', () => {
  it('is available and disagrees with itself across regions, so the comparison means something', () => {
    // Without this the whole suite below could pass by comparing undefined to undefined,
    // and a uniform oracle would let a table that answered Saturday–Sunday everywhere —
    // the exact bug being fixed — satisfy the reconciliation.
    expect(cldrWeekend('en-US'), CLDR_HINT).toEqual([0, 6]);
    expect(cldrWeekend('ar'), CLDR_HINT).toEqual([5, 6]);
    expect(cldrWeekend('fa'), CLDR_HINT).toEqual([5]);
    expect(cldrWeekend('hi'), CLDR_HINT).toEqual([0]);
  });

  it('answers for a country on its own, and parts from the language where the card needs it to', () => {
    // `und-` asks CLDR about the territory with no language standing in for it. Each pair
    // is a home whose country and usual language disagree, which is why the country is
    // read first: Israel against English, Morocco against Arabic, and Afghanistan, whose
    // Thursday–Friday weekend no language reaches.
    expect(cldrWeekend('und-IL'), CLDR_HINT).toEqual([5, 6]);
    expect(cldrWeekend('en'), CLDR_HINT).toEqual([0, 6]);
    expect(cldrWeekend('und-MA'), CLDR_HINT).toEqual([0, 6]);
    expect(cldrWeekend('ar'), CLDR_HINT).toEqual([5, 6]);
    expect(cldrWeekend('und-AF'), CLDR_HINT).toEqual([4, 5]);
    expect(cldrWeekend('und-IN'), CLDR_HINT).toEqual([0]);
  });
});

describe('the input domain', () => {
  it('is 249 distinct ISO 3166-1 alpha-2 codes, as Home Assistant lists them', () => {
    // A guard on the fixture rather than on the card: a pasting error that dropped or
    // doubled a code would quietly shrink the sweeps below.
    expect(HA_COUNTRIES).toHaveLength(249);
    expect(new Set(HA_COUNTRIES).size).toBe(HA_COUNTRIES.length);
    expect(HA_COUNTRIES.filter((code) => !/^[A-Z]{2}$/.test(code))).toEqual([]);
  });
});

describe('the weekend, resolved from the country set in Home Assistant', () => {
  it('pins WEEKEND_BY_COUNTRY by value: every exception CLDR knows, and nothing else', () => {
    // By value rather than by walking the table's own keys, which could not notice a key
    // leaving it. `toEqual` fails both ways: a missing exception, and an entry CLDR does
    // not back — a wrong weekend, a Saturday–Sunday country listed anyway, or a code Home
    // Assistant would never send.
    const table = Object.fromEntries(
      Object.entries(FormatUtils.WEEKEND_BY_COUNTRY).map(([code, days]) => [code, sorted(days)]),
    );
    const expected = cldrCountryExceptions();

    expect(table, CLDR_HINT).toEqual(expected);
    // A uniform oracle would let an empty table pass, which is the bug being fixed. Every
    // shape CLDR uses has to be present, by value.
    expect([...new Set(Object.values(expected).map(String))].sort()).toEqual([
      '0',
      '4,5',
      '5',
      '5,6',
    ]);
  });

  it.each(['en', 'he'])(
    'resolves every country Home Assistant accepts to CLDR under a %s Home Assistant',
    (language) => {
      // Swept twice, under a Saturday–Sunday language and a Friday–Saturday one, because
      // the resolver has to let the country decide. One that fell through to the language
      // for an unlisted country would pass under `en` and fail here under `he`.
      const mismatches: string[] = [];

      for (const code of HA_COUNTRIES) {
        const expected = cldrWeekend(`und-${code}`);
        const actual = resolvedIn(code, language);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(`${code}: expected ${expected}, got ${actual}`);
        }
      }

      expect(mismatches, CLDR_HINT).toEqual([]);
    },
  );

  it('gives an Israeli home running Home Assistant in English Friday and Saturday', () => {
    // Issue #621's household: Jerusalem, Home Assistant in English, and Sunday carrying the
    // weekend class. The language alone answers for the United States.
    expect(resolved('en')).toEqual([0, 6]);
    expect(resolvedIn('IL', 'en')).toEqual([5, 6]);
  });

  it.each(['MA', 'TN', 'LB', 'AE'])(
    'gives %s Saturday and Sunday in Arabic, which alone would say Friday and Saturday',
    (code) => {
      // The direction in which a weekend keyed by language was a regression from v4.2, whose
      // Saturday and Sunday for everybody was right in these homes, if only by accident.
      expect(resolved('ar')).toEqual([5, 6]);
      expect(resolvedIn(code, 'ar')).toEqual([0, 6]);
    },
  );

  it('reaches a weekend no language can: Thursday and Friday in Afghanistan', () => {
    expect(resolvedIn('AF', 'fa')).toEqual([4, 5]);
    // A claim about the domain, not the table: no language Home Assistant ships resolves to
    // Thursday and Friday, so until the country was read this weekend was unreachable.
    expect(HA_LANGUAGES.filter((language) => resolved(language).join(',') === '4,5')).toEqual([]);
  });

  it('matches the country code whatever its casing', () => {
    expect(resolvedIn('il', 'en')).toEqual([5, 6]);
    expect(resolvedIn('Ma', 'ar')).toEqual([0, 6]);
  });

  it('treats a country that is set as final, even one the table does not list', () => {
    // `ZZ` is CLDR's unknown region, so Home Assistant would never store it; the rule it
    // exercises is the one Morocco depends on above. An unlisted country is a Saturday–
    // Sunday country, and asking the language instead would undo the point of the table.
    expect(cldrWeekend('und-ZZ'), CLDR_HINT).toEqual([0, 6]);
    expect(resolvedIn('ZZ', 'he')).toEqual([0, 6]);
  });
});

describe('the weekend, resolved from the Home Assistant language when no country is set', () => {
  it("matches CLDR for every language Home Assistant ships, and isn't Sat–Sun for all of them", () => {
    const mismatches: string[] = [];
    const answers = new Set<string>();

    for (const language of HA_LANGUAGES) {
      const expected = cldrWeekend(language);
      const actual = resolved(language);
      answers.add(actual.join(','));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${language}: expected ${expected}, got ${actual}`);
      }
    }

    expect(mismatches, CLDR_HINT).toEqual([]);
    // The original bug was a uniform answer, so a table returning [0, 6] everywhere would
    // still satisfy the loop above for the 58 Saturday–Sunday languages. Require the
    // three real shapes, by value, so a lost exception fails here as well as above.
    expect([...answers].sort()).toEqual(['0', '0,6', '5', '5,6']);
  });

  it.each([
    { name: 'ar (Friday and Saturday, which the old code could not express)', language: 'ar' },
    { name: 'he (Friday and Saturday)', language: 'he' },
  ])('gives $name a Friday–Saturday weekend', ({ language }) => {
    expect(resolved(language)).toEqual([5, 6]);
  });

  it('gives fa a one-day Friday weekend', () => {
    expect(resolved('fa')).toEqual([5]);
  });

  it.each(['hi', 'ml', 'ta', 'te'])('gives %s a Sunday-only weekend', (language) => {
    // India. Saturday is a working day, so shading it or filtering it as weekend is the
    // same error as calling Friday a weekday in Israel — just less visible from Europe.
    expect(resolved(language)).toEqual([0]);
  });

  it.each(['de', 'en', 'ja', 'sv', 'pt-BR'])(
    'leaves %s on the Saturday–Sunday default',
    (language) => {
      expect(resolved(language)).toEqual([0, 6]);
    },
  );

  it.each([
    { name: 'en-GB inherits Saturday–Sunday from en', language: 'en-GB' },
    { name: 'es-419 falls back to its base language', language: 'es-419' },
    { name: 'sr-Latn falls back to its base language', language: 'sr-Latn' },
    { name: 'zh-Hans and zh-Hant agree', language: 'zh-Hans' },
  ])('resolves regional variants correctly: $name', ({ language }) => {
    expect(resolved(language)).toEqual([0, 6]);
  });

  it('resolves a regional variant of an exception through its base language', () => {
    // Not a Home Assistant language, so not in the sweep above, but it is what the
    // base-language fallback exists for and CLDR agrees with the base here.
    expect(resolved('ar-EG')).toEqual([5, 6]);
    expect(resolved('he-IL')).toEqual([5, 6]);
    expect(cldrWeekend('ar-EG'), CLDR_HINT).toEqual([5, 6]);
  });

  it('is case-insensitive, because locale tags reach the card in mixed casing', () => {
    expect(resolved('AR')).toEqual([5, 6]);
    expect(resolved('He-IL')).toEqual([5, 6]);
  });

  it('falls back to Saturday and Sunday when the language is unknown or absent', () => {
    expect(resolved('xx-YY')).toEqual([0, 6]);
    expect(resolved('')).toEqual([0, 6]);
    expect(resolved(undefined)).toEqual([0, 6]);
    expect(resolvedHome({})).toEqual([0, 6]);
    expect(resolvedHome(null)).toEqual([0, 6]);
  });

  it.each([
    { name: 'a null country, which is how Home Assistant reports none', country: null },
    { name: 'an empty country', country: '' },
    { name: 'no config at all', country: undefined },
  ])('reads the language for $name', ({ country }) => {
    // Hebrew because its answer is not the default, so a resolver that stopped at an unset
    // country and answered Saturday and Sunday fails here rather than agreeing by accident.
    const hass = {
      locale: { language: 'he' },
      ...(country === undefined ? {} : { config: { country } }),
    };

    expect(resolvedHome(hass)).toEqual([5, 6]);
  });
});

describe('isWeekendDate reads the resolved weekend', () => {
  // June 2026 opens on a Monday, so the 18th to the 21st are Thursday to Sunday.
  const week = [18, 19, 20, 21].map((day) => new Date(2026, 5, day));
  const monday = new Date(2026, 5, 22);

  it.each([
    { name: 'de', hass: { locale: { language: 'de' } }, weekend: [false, false, true, true] },
    { name: 'he', hass: { locale: { language: 'he' } }, weekend: [false, true, true, false] },
    { name: 'fa', hass: { locale: { language: 'fa' } }, weekend: [false, true, false, false] },
    { name: 'hi', hass: { locale: { language: 'hi' } }, weekend: [false, false, false, true] },
    {
      name: 'Israel, in English',
      hass: { config: { country: 'IL' }, locale: { language: 'en' } },
      weekend: [false, true, true, false],
    },
    {
      name: 'Morocco, in Arabic',
      hass: { config: { country: 'MA' }, locale: { language: 'ar' } },
      weekend: [false, false, true, true],
    },
    {
      name: 'Afghanistan',
      hass: { config: { country: 'AF' }, locale: { language: 'fa' } },
      weekend: [true, true, false, false],
    },
  ])('classifies Thursday to Sunday for $name', ({ hass, weekend }) => {
    expect(week.map((date) => FormatUtils.isWeekendDate(date, hass))).toEqual(weekend);
    // Monday is a weekday everywhere CLDR has an opinion about, which is what makes the
    // rows above readable as a weekend rather than as an arbitrary day set.
    expect(FormatUtils.isWeekendDate(monday, hass)).toBe(false);
  });

  it('answers Saturday and Sunday with no hass, as a card does before it arrives', () => {
    const [, friday, saturday, sunday] = week;

    expect(FormatUtils.isWeekendDate(saturday)).toBe(true);
    expect(FormatUtils.isWeekendDate(sunday)).toBe(true);
    expect(FormatUtils.isWeekendDate(friday)).toBe(false);
  });
});

/**
 * The plumbing, view by view.
 *
 * `isWeekendDate` has seven call sites across four modules, and each one needs Home
 * Assistant handed to it whole. A resolver test cannot see a caller that passed only the
 * language: the call still runs, and answers for the language instead of the country. So
 * this renders each view for a set of homes and asks which column the `weekend` class
 * landed on.
 *
 * Each home is paired with the same home minus one setting, and the pair is the point.
 * Where the two answers differ, only the setting taken away can have decided the first,
 * so a caller that drops the country fails the country homes and one that drops `hass`
 * altogether fails the language one.
 */
describe('every view reads the weekend from Home Assistant, not from its own idea of one', () => {
  interface Home {
    name: string;
    home: FormatUtils.WeekendSource;
    weekend: boolean[];
    without: FormatUtils.WeekendSource | null;
    withoutWeekend: boolean[];
  }

  /** Thursday to Sunday, as flags. Every home below differs from its control somewhere. */
  const HOMES: Home[] = [
    {
      name: 'a Hebrew Home Assistant with no country set',
      home: { locale: { language: 'he' } },
      weekend: [false, true, true, false],
      without: null,
      withoutWeekend: [false, false, true, true],
    },
    {
      name: 'an Israeli home running Home Assistant in English',
      home: { config: { country: 'IL' }, locale: { language: 'en' } },
      weekend: [false, true, true, false],
      without: { locale: { language: 'en' } },
      withoutWeekend: [false, false, true, true],
    },
    {
      name: 'a Moroccan home running Home Assistant in Arabic',
      home: { config: { country: 'MA' }, locale: { language: 'ar' } },
      weekend: [false, false, true, true],
      without: { locale: { language: 'ar' } },
      withoutWeekend: [false, true, true, false],
    },
    {
      name: 'an Afghan home running Home Assistant in Persian',
      home: { config: { country: 'AF' }, locale: { language: 'fa' } },
      weekend: [true, true, false, false],
      without: { locale: { language: 'fa' } },
      withoutWeekend: [false, true, false, false],
    },
  ];

  /** Thursday 2026-06-18, so a 4-day window covers Thursday to Sunday. */
  const WINDOW_START = new Date('2026-06-18T09:00:00.000Z');

  function hassFor(home: FormatUtils.WeekendSource | null): Types.Hass | null {
    return home && { states: {}, callApi: vi.fn(), callService: vi.fn(), ...home };
  }

  function events(): Types.CalendarEventData[] {
    return ['2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'].map((date) => ({
      summary: date,
      start: { dateTime: `${date}T12:00:00.000Z` },
      end: { dateTime: `${date}T13:00:00.000Z` },
      _entityId: 'calendar.personal',
    }));
  }

  function weekendFlags(container: ParentNode, selector: string): boolean[] {
    return Array.from(container.querySelectorAll(selector)).map((element) =>
      element.classList.contains('weekend'),
    );
  }

  function renderWith(
    view: Types.EffectiveView,
    hass: Types.Hass | null,
    overrides: Partial<Types.Config> = {},
  ): HTMLElement {
    const config = buildConfig({ view, days_to_show: 4, ...overrides });
    const effective = ViewConfig.resolveEffectiveConfig(config, view);
    const days = EventUtils.groupEventsByDay(events(), config, false, 'en', view);
    const container = document.createElement('div');
    const template =
      view === 'grid'
        ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, hass, WINDOW_START)
        : view === 'column'
          ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, hass)
          : Render.renderGroupedEvents(days, effective, 'en', undefined, hass);
    litRender(template, container);
    return container;
  }

  /** Which of the four date blocks took `weekend_day_color`. */
  function coloredDates(view: Types.EffectiveView, hass: Types.Hass | null): boolean[] {
    const container = renderWith(view, hass, { weekend_day_color: 'rgb(1, 2, 3)' });

    return Array.from(container.querySelectorAll<HTMLElement>('.day')).map(
      (element) => element.style.color === 'rgb(1, 2, 3)',
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(WINDOW_START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(HOMES)('for $name', ({ home, weekend, without, withoutWeekend }) => {
    it.each([
      { view: 'list' as const, selector: '.day-table' },
      { view: 'list' as const, selector: '.date-column' },
      { view: 'column' as const, selector: '.day-column' },
      { view: 'grid' as const, selector: '.grid-day-header' },
      { view: 'grid' as const, selector: '.grid-day-body' },
    ])('marks the weekend on $selector in $view view', ({ view, selector }) => {
      const flags = weekendFlags(renderWith(view, hassFor(home)), selector);

      expect(flags, `no ${selector} rendered, so the assertion below is vacuous`).toHaveLength(4);
      expect(flags).toEqual(weekend);

      // The control: the same home minus one setting must answer differently, so a row
      // above cannot pass on a fixture that would have looked the same without it.
      expect(weekendFlags(renderWith(view, hassFor(without)), selector)).toEqual(withoutWeekend);
    });

    it.each(['list' as const, 'column' as const, 'grid' as const])(
      'colors the weekend date block by the same definition in %s view',
      (view) => {
        // 🚨 The container classes above cannot see this call site. `renderDateContent` in
        // `leaves.ts` reads the weekend only to pick `weekend_*_color`, and all three of
        // those default to undefined — so dropping `hass` there renders identically and
        // the whole suite stayed green when that mutation was planted. The option has to be
        // switched on for the seventh call site to be visible at all.
        const colored = coloredDates(view, hassFor(home));

        expect(colored, 'no date blocks rendered, so this assertion is vacuous').toHaveLength(4);
        expect(colored).toEqual(weekend);
        expect(coloredDates(view, hassFor(without))).toEqual(withoutWeekend);
      },
    );
  });
});
