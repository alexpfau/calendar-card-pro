/**
 * The card's own words on a dashboard running the other way.
 *
 * Home Assistant lays a dashboard out right to left when its interface language reads that way,
 * and the card mirrors its layout with it. The card's words are in the card's language, which can
 * run the other way, and text with digits and punctuation at its edges is ordered by the line it
 * sits in: an English "16:00 - 17:00" on a Hebrew dashboard drew as "17:00 - 16:00", and a Hebrew
 * card's ranges read end first on an English one. `TextDirection` draws each such piece between two
 * marks of its language's direction.
 *
 * happy-dom lays nothing out, so this file pins the decision and the characters written for it,
 * and that nothing else changes. The order those characters produce was measured in Chromium and
 * WebKit against the same card on a dashboard of its own direction; Firefox was not run.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as Localize from '../src/translations/localize';
import * as EventUtils from '../src/utils/events';
import * as Paging from '../src/utils/paging';
import { dashboardDirection, inLanguageDirection, languageMark } from '../src/utils/text-direction';
import '../src/calendar-card-pro';

const LRM = '\u200e';
const RLM = '\u200f';

/** A `hass` as Home Assistant hands it, on a dashboard in `dashboard`. */
function hassOn(dashboard: string, metadata = true): Types.Hass {
  return {
    states: {},
    callApi: vi.fn(),
    callService: vi.fn(),
    language: dashboard,
    // The weekend, the week's first day and the clock are read from here; held at English so
    // the only thing that differs between two dashboards is which way they run.
    locale: { language: 'en' },
    ...(metadata
      ? {
          translationMetadata: {
            translations: { en: { isRTL: false }, de: { isRTL: false }, he: { isRTL: true } },
          },
        }
      : {}),
  } as unknown as Types.Hass;
}

describe('dashboardDirection', () => {
  it('reads the dashboard as Home Assistant does, from its language', () => {
    expect(dashboardDirection(hassOn('he'))).toBe('rtl');
    expect(dashboardDirection(hassOn('en'))).toBe('ltr');
    // Home Assistant's own rule: a language it has no metadata for runs left to right.
    expect(dashboardDirection(hassOn('xx'))).toBe('ltr');
  });

  it('falls back to the locale for the language, for a hass that carries only that', () => {
    const hass = { ...hassOn('he'), language: undefined, locale: { language: 'he' } };
    expect(dashboardDirection(hass as unknown as Types.Hass)).toBe('rtl');
  });

  it('does not guess where hass does not say', () => {
    expect(dashboardDirection(hassOn('he', false))).toBeUndefined();
    expect(dashboardDirection(null)).toBeUndefined();
    expect(dashboardDirection(undefined)).toBeUndefined();
  });
});

describe('languageMark', () => {
  it.each([
    ['en', 'he', LRM],
    ['de', 'he', LRM],
    ['he', 'en', RLM],
    ['he', 'de', RLM],
    ['en', 'en', ''],
    ['he', 'he', ''],
  ])('a %s card on a %s dashboard', (language, dashboard, mark) => {
    expect(languageMark(language, hassOn(dashboard))).toBe(mark);
  });

  it('adds nothing where the dashboard direction is unknown', () => {
    expect(languageMark('en', hassOn('he', false))).toBe('');
    expect(languageMark('he', null)).toBe('');
  });
});

describe('inLanguageDirection', () => {
  it('puts one mark at each end, and nothing where there is no mark or no text', () => {
    expect(inLanguageDirection('7:30 - 8:00', LRM)).toBe(`${LRM}7:30 - 8:00${LRM}`);
    expect(inLanguageDirection('7:30 - 8:00', '')).toBe('7:30 - 8:00');
    expect(inLanguageDirection('', LRM)).toBe('');
  });
});

describe('the status lines', () => {
  /** The text of the one element `selector` finds in a rendered template. */
  function textOf(template: Parameters<typeof litRender>[0], selector: string): string {
    const container = document.createElement('div');
    litRender(template, container);
    return container.querySelector(selector)!.textContent!.trim();
  }

  it('marks the loading and error messages where the language runs against the dashboard', () => {
    const t = Localize.getTranslations('en');
    expect(textOf(Render.renderCardContent('loading', 'en', hassOn('he')), '.loading')).toBe(
      `${LRM}${t.loading}${LRM}`,
    );
    expect(textOf(Render.renderCardContent('error', 'en', hassOn('he')), '.error')).toBe(
      `${LRM}${t.error}${LRM}`,
    );
    expect(textOf(Render.renderCardContent('loading', 'he', hassOn('en')), '.loading')).toBe(
      `${RLM}${Localize.getTranslations('he').loading}${RLM}`,
    );
    expect(textOf(Render.renderCardContent('loading', 'en', hassOn('en')), '.loading')).toBe(
      t.loading,
    );
  });

  it('marks the label of the failed-calendars line, and not the names after it', () => {
    const t = Localize.getTranslations('en');
    const names = ['Anna', 'בן'];
    expect(
      textOf(Render.renderFetchErrorNotice(names, 'en', hassOn('he')), '.fetch-error-text'),
    ).toBe(`${LRM}${t.loadFailed}${LRM} Anna, בן`);
    expect(
      textOf(Render.renderFetchErrorNotice(names, 'en', hassOn('en')), '.fetch-error-text'),
    ).toBe(`${t.loadFailed} Anna, בן`);
  });
});

describe("the toolbar's dates", () => {
  // Today is June 17, 2026, so a page in March 2027 names its year: "1.–7. März 2027" in German,
  // "1–7 במרץ 2027" in Hebrew. Each has digits at an edge, which a line of the other direction
  // moves to its far end.
  const NOW = new Date(2026, 5, 17, 10, 0);
  const plain = (language: string) =>
    Paging.rangeLabel({ start: new Date(2027, 2, 1), days: 7 }, language, NOW);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  /**
   * The header of a card showing March 1 to 7, 2027, with the month as a button over its date
   * picker, or, without navigation, as plain text with refresh beside it.
   */
  async function header(language: string, hass: Types.Hass, navigation: boolean) {
    const card = document.createElement('calendar-card-pro-dev') as HTMLElement & {
      setConfig(config: unknown): void;
      hass: Types.Hass;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig(
      buildConfig({
        entities: ['calendar.anna'],
        language,
        start_date: '2027-03-01',
        days_to_show: 7,
        toolbar: {
          show: true,
          navigation,
          view_switcher: false,
          add_event: false,
          reset: false,
          refresh: !navigation,
          search: false,
          legend: false,
        },
      } as Partial<Types.Config>),
    );
    card.hass = { ...hass, callApi: vi.fn(async () => []) };
    document.body.appendChild(card);
    for (let round = 0; round < 3; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      await card.updateComplete;
    }
    const root = card.shadowRoot!;
    const tooltip = root.querySelector(
      navigation ? 'button.toolbar-month-button' : '.toolbar-month-slot > span.toolbar-month-label',
    )!;
    return {
      html: root.querySelector('.header-container')!.innerHTML,
      live: root.querySelector('#toolbar-range-text')!.textContent!.trim(),
      title: tooltip.getAttribute('title')!,
    };
  }

  describe.each([true, false])('with navigation %s', (navigation) => {
    it.each([
      ['de', 'en'],
      ['he', 'he'],
    ])('in %s on a %s dashboard draws exactly what it drew before', async (language, dashboard) => {
      const before = await header(language, hassOn(dashboard, false), navigation);
      const drawn = await header(language, hassOn(dashboard), navigation);
      expect(before.live).toBe(plain(language));
      expect(drawn.html).toBe(before.html);
    });

    it.each([
      ['de', 'he', LRM],
      ['he', 'en', RLM],
    ])(
      'in %s on a %s dashboard marks the dates in the tooltip and the live region, and nothing else',
      async (language, dashboard, mark) => {
        const dates = plain(language);
        expect(dates).toMatch(language === 'he' ? /\d$/ : /^\d/);
        const before = await header(language, hassOn(dashboard, false), navigation);
        const drawn = await header(language, hassOn(dashboard), navigation);

        expect(before.live).toBe(dates);
        expect(before.title).toBe(dates);
        expect(drawn.live).toBe(`${mark}${dates}${mark}`);
        expect(drawn.title).toBe(`${mark}${dates}${mark}`);
        // Four marks more, one at each end of those two, and the header otherwise as it was: the
        // month's own words are isolated by their `bdi`, and home's name is not touched here.
        // Unwrapped by the exact text rather than stripped, so a mark `Intl` wrote stays put.
        expect(drawn.html.split(mark).length - before.html.split(mark).length).toBe(4);
        expect(drawn.html.split(`${mark}${dates}${mark}`).join(dates)).toBe(before.html);
      },
    );
  });
});

describe.each(['list', 'column', 'grid'] as const)('a %s card', (view) => {
  // Wednesday 17 June 2026, 08:00 UTC; the unit project runs under TZ=UTC.
  const NOW = new Date('2026-06-17T08:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const timed = (summary: string, from: string, to: string): Types.CalendarEventData => ({
    summary,
    start: { dateTime: `${from}:00.000Z` },
    end: { dateTime: `${to}:00.000Z` },
    _entityId: 'calendar.anna',
  });

  // A range with a countdown, a timed event into the next day, and more talks at once than a
  // grid column draws, so the grid has its `+N` block.
  const EVENTS = [
    timed('Piano lesson', '2026-06-17T16:00', '2026-06-17T17:00'),
    timed('Night shift', '2026-06-18T22:00', '2026-06-19T02:00'),
    ...['A', 'B', 'C', 'D', 'E'].map((name) =>
      timed(`Talk ${name}`, '2026-06-19T14:00', '2026-06-19T15:00'),
    ),
  ];

  function render(language: string, hass: Types.Hass): HTMLElement {
    const config = buildConfig({
      view,
      language,
      days_to_show: 3,
      time_24h: true,
      show_countdown: true,
      entities: [{ entity: 'calendar.anna' }],
      time_grid: { start_time: '08:00', end_time: '24:00' },
    } as Partial<Types.Config>);
    const effective = ViewConfig.resolveEffectiveConfig(config, view);
    const days = EventUtils.groupEventsByDay(EVENTS, config, false, language, view);
    const container = document.createElement('div');
    litRender(
      view === 'grid'
        ? Grid.renderGridGroupedEvents(days, effective, language, undefined, hass, NOW)
        : view === 'column'
          ? Column.renderColumnGroupedEvents(days, effective, language, undefined, hass)
          : Render.renderGroupedEvents(days, effective, language, undefined, hass),
      container,
    );
    return container;
  }

  /** Every text node holding `mark`, by the class of the element it is in. */
  function marked(container: HTMLElement, mark: string): Array<{ where: string; text: string }> {
    const out: Array<{ where: string; text: string }> = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (!text.includes(mark)) continue;
      const element = node.parentElement!;
      out.push({ where: element.className || element.tagName.toLowerCase(), text: text.trim() });
    }
    return out;
  }

  it.each([
    ['en', 'en'],
    ['he', 'he'],
  ])('in %s on a %s dashboard draws exactly what it drew before', (language, dashboard) => {
    expect(render(language, hassOn(dashboard)).innerHTML).toBe(
      render(language, hassOn(dashboard, false)).innerHTML,
    );
  });

  it.each([
    ['en', 'he', LRM],
    ['he', 'en', RLM],
  ])(
    'in %s on a %s dashboard marks its own words and changes nothing else',
    (language, dashboard, mark) => {
      const drawn = render(language, hassOn(dashboard));
      const before = render(language, hassOn(dashboard, false));

      expect(drawn.innerHTML).not.toBe(before.innerHTML);
      expect(drawn.innerHTML.split(mark).join('')).toBe(before.innerHTML);

      const pieces = marked(drawn, mark);
      // One mark at each end of a piece, and no other: the marks bracket whole pieces of text.
      for (const piece of pieces) {
        expect(piece.text.startsWith(mark) && piece.text.endsWith(mark), piece.text).toBe(true);
        expect(piece.text.split(mark), piece.text).toHaveLength(3);
      }

      // The card's own words, and only those: the time, its droppable end where grid draws one,
      // the countdown, the date's weekday and month, and the grid's `+N`. Titles are the user's
      // own words in any language and keep their own handling (title-words.ts).
      const where = [...new Set(pieces.map((piece) => piece.where))].sort();
      const expected = {
        list: ['span', 'time-countdown', 'weekday', 'month'],
        column: ['span', 'time-countdown', 'weekday', 'month'],
        grid: [
          'span',
          'time-end',
          'time-countdown',
          'weekday',
          'month',
          'grid-event-overflow-label',
        ],
      }[view];
      expect(where).toEqual([...expected].sort());
      expect(pieces.some((piece) => /^event-title|title-word/.test(piece.where))).toBe(false);
    },
  );

  it('reads an English range and a multi-day phrase start first on a Hebrew dashboard', () => {
    const texts = marked(render('en', hassOn('he')), LRM).map((piece) => piece.text);

    if (view === 'grid') {
      // Start and end are two pieces there, so the end can be dropped; both are marked, and the
      // two join into one left-to-right run.
      expect(texts).toContain(`${LRM}16:00${LRM}`);
      expect(texts).toContain(`${LRM} - 17:00${LRM}`);
      expect(texts).toContain(`${LRM}22:00${LRM}`);
      expect(texts).toContain(`${LRM} - 2:00\u00a0\u2066(+1)\u2069${LRM}`);
      expect(texts).toContain(`${LRM}+2${LRM}`);
    } else if (view === 'column') {
      // Column draws a timed event into the next day once on each day.
      expect(texts).toContain(`${LRM}16:00 - 17:00${LRM}`);
      expect(texts).toContain(`${LRM}22:00 - 23:59${LRM}`);
      expect(texts).toContain(`${LRM}0:00 - 2:00${LRM}`);
    } else {
      expect(texts).toContain(`${LRM}16:00 - 17:00${LRM}`);
      expect(texts).toContain(`${LRM}22:00 until Friday, Jun 19 at 2:00${LRM}`);
    }
    expect(texts).toContain(`${LRM}in 8 hours${LRM}`);
  });
});
