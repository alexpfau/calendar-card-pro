/**
 * Regression tests for the locale-aware weekend.
 *
 * `isWeekendDate` used to answer Saturday and Sunday for everybody. That is wrong in
 * every Friday–Saturday region and in every Sunday-only one, and it was wrong twice over
 * on the same row: the weekend day-header colors and the shading read this function, and
 * so does the per-calendar `days_of_week` filter, so a Friday in Israel was filtered as a
 * weekday and colored as one while the user's own calendar app called it the weekend.
 *
 * These tests pin the table that replaced it, the same way
 * `tests/first-day-of-week-locale.test.ts` pins `FIRST_DAY_BY_LOCALE`: against the CLDR
 * data shipped inside the runtime, over the real input domain, which is the set of
 * languages Home Assistant's frontend ships.
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
 * This is the real input domain, because the value that reaches the resolver is
 * `hass.locale.language`.
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
 * for all 65 languages, so nothing below is specific to the local runtime.
 */
const RUNTIME_CLDR = `CLDR ${process.versions.cldr} / ICU ${process.versions.icu} (Node ${process.versions.node})`;

/** Points at the runtime before the table, because that is where the fault usually is. */
const CLDR_HINT =
  `runtime is ${RUNTIME_CLDR}. A mismatch here more often means this Node's CLDR differs ` +
  `from the one CI resolves than that the table is wrong — reproduce on the newest 22.x ` +
  `before changing WEEKEND_BY_LOCALE.`;

/** The card's answer for a language, as a sorted plain array the oracle can be compared to. */
function resolved(language?: string): number[] {
  return [...FormatUtils.getWeekendDays(language === undefined ? undefined : { language })].sort(
    (a, b) => a - b,
  );
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
});

describe('the weekend, resolved from the Home Assistant language', () => {
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
    expect([...FormatUtils.getWeekendDays({})].sort()).toEqual([0, 6]);
  });
});

describe('isWeekendDate reads the resolved weekend', () => {
  // June 2026 opens on a Monday, so the 19th, 20th and 21st are Friday, Saturday, Sunday.
  const friday = new Date(2026, 5, 19);
  const saturday = new Date(2026, 5, 20);
  const sunday = new Date(2026, 5, 21);
  const monday = new Date(2026, 5, 22);

  it.each([
    { language: 'de', friday: false, saturday: true, sunday: true },
    { language: 'he', friday: true, saturday: true, sunday: false },
    { language: 'fa', friday: true, saturday: false, sunday: false },
    { language: 'hi', friday: false, saturday: false, sunday: true },
  ])('classifies the week for $language', (expected) => {
    const locale = { language: expected.language };

    expect(FormatUtils.isWeekendDate(friday, locale)).toBe(expected.friday);
    expect(FormatUtils.isWeekendDate(saturday, locale)).toBe(expected.saturday);
    expect(FormatUtils.isWeekendDate(sunday, locale)).toBe(expected.sunday);
    // Monday is a weekday everywhere CLDR has an opinion about, which is what makes the
    // three rows above readable as a weekend rather than as an arbitrary day set.
    expect(FormatUtils.isWeekendDate(monday, locale)).toBe(false);
  });

  it('answers Saturday and Sunday with no locale, as a card does before hass arrives', () => {
    expect(FormatUtils.isWeekendDate(saturday)).toBe(true);
    expect(FormatUtils.isWeekendDate(sunday)).toBe(true);
    expect(FormatUtils.isWeekendDate(friday)).toBe(false);
  });
});

/**
 * The plumbing, view by view.
 *
 * `isWeekendDate` has seven call sites across four modules, and each one needs Home
 * Assistant's locale handed to it. A resolver test cannot see a caller that forgot to
 * pass it: the call still compiles, still runs, and still answers Saturday and Sunday.
 * So this renders each view against an Israeli Home Assistant and asks which column the
 * `weekend` class landed on.
 */
describe('every view reads the weekend from Home Assistant, not from its own idea of one', () => {
  /** Israel: Friday and Saturday. Sunday is a working day, which is the visible half. */
  const HEBREW_HASS = {
    states: {},
    callApi: vi.fn(),
    callService: vi.fn(),
    locale: { language: 'he' },
  } satisfies Types.Hass;

  /** Thursday 2026-06-18, so a 4-day window covers Thursday to Sunday. */
  const WINDOW_START = new Date('2026-06-18T09:00:00.000Z');

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

  function renderWith(view: Types.EffectiveView, hass: Types.Hass | null): HTMLElement {
    const config = buildConfig({ view, days_to_show: 4 });
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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(WINDOW_START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { view: 'list' as const, selector: '.day-table' },
    { view: 'list' as const, selector: '.date-column' },
    { view: 'column' as const, selector: '.day-column' },
    { view: 'grid' as const, selector: '.grid-day-header' },
    { view: 'grid' as const, selector: '.grid-day-body' },
  ])('marks Friday and Saturday on $selector in $view view', ({ view, selector }) => {
    // Thursday, Friday, Saturday, Sunday. The Sunday `false` is what fails when a caller
    // forgets the locale, and the Friday `true` is what fails when it forgets it the
    // other way — a Sat/Sun answer gets both wrong, in opposite directions.
    const flags = weekendFlags(renderWith(view, HEBREW_HASS), selector);

    expect(flags, `no ${selector} rendered, so the assertion below is vacuous`).toHaveLength(4);
    expect(flags).toEqual([false, true, true, false]);

    // The control: the same fixture with no locale must answer Saturday and Sunday, so a
    // row above cannot pass by accident on a fixture that happens to look the same.
    expect(weekendFlags(renderWith(view, null), selector)).toEqual([false, false, true, true]);
  });

  it.each(['list' as const, 'column' as const, 'grid' as const])(
    'colors the weekend date block by the same definition in %s view',
    (view) => {
      // 🚨 The container classes above cannot see this call site. `renderDateContent` in
      // `leaves.ts` reads the weekend only to pick `weekend_*_color`, and all three of
      // those default to undefined — so dropping the locale there renders identically and
      // the whole suite stayed green when that mutation was planted. The option has to be
      // switched on for the seventh call site to be visible at all.
      const config = buildConfig({
        view,
        days_to_show: 4,
        weekend_day_color: 'rgb(1, 2, 3)',
      });
      const effective = ViewConfig.resolveEffectiveConfig(config, view);
      const days = EventUtils.groupEventsByDay(events(), config, false, 'en', view);
      const container = document.createElement('div');
      const template =
        view === 'grid'
          ? Grid.renderGridGroupedEvents(
              days,
              effective,
              'en',
              undefined,
              HEBREW_HASS,
              WINDOW_START,
            )
          : view === 'column'
            ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, HEBREW_HASS)
            : Render.renderGroupedEvents(days, effective, 'en', undefined, HEBREW_HASS);
      litRender(template, container);

      const colored = Array.from(container.querySelectorAll<HTMLElement>('.day')).map(
        (element) => element.style.color === 'rgb(1, 2, 3)',
      );

      expect(colored, 'no date blocks rendered, so this assertion is vacuous').toHaveLength(4);
      expect(colored).toEqual([false, true, true, false]);
    },
  );
});
