/**
 * Event duration (#299): `show_duration` writes how long an event lasts after its time,
 * "16:00 - 16:30 (30 min)". Off by default, so every case turns it on, and the first one holds
 * the same event drawn without it, so a harness that drew no duration at all fails here.
 *
 * Runs under `TZ=UTC` with the unit project. How the length is measured across a change of
 * clocks is in `event-duration.dst.test.ts`.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { homeAssistantFiles, installPolyfill, removePolyfill } from './intl-polyfill';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { buildEventPresentation } from '../src/rendering/presentation';
import * as Render from '../src/rendering/render';
import { forgetIntlFormats, intlLocales } from '../src/translations/intl-locales';
import { CARD_LANGUAGES } from '../src/translations/language-codes';
import * as EventUtils from '../src/utils/events';
import { formatEventDuration, formatEventTime } from '../src/utils/format';

/** Wednesday, Jun 17, 10:00. */
const NOW = new Date('2026-06-17T10:00:00Z');

const timed = (start: string, end: string, summary = 'Call'): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

const allDay = (start: string, end: string, summary = 'Trip'): Types.CalendarEventData => ({
  summary,
  start: { date: start },
  end: { date: end },
});

/** The text as read: the isolate the duration sits in dropped, its no-break space a space. */
const read = (text: string | null | undefined): string =>
  (text ?? '').replace(/[\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ');

const on = buildConfig({ show_duration: true, time_24h: true });
const time = (event: Types.CalendarEventData, config = on, language = 'en') =>
  read(formatEventTime(event, config, language));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  removePolyfill();
  forgetIntlFormats();
});

describe('the time text', () => {
  it('ends with the duration under show_duration, and only then', () => {
    const call = timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z');
    expect(time(call)).toBe('16:00 - 16:30 (30 min)');
    expect(time(call, buildConfig({ time_24h: true }))).toBe('16:00 - 16:30');
  });

  it('sets it apart with a no-break space, in an isolate of its own', () => {
    const call = timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z');
    expect(formatEventTime(call, on, 'en')).toBe('16:00 - 16:30\u00a0\u2068(30 min)\u2069');
  });

  it.each([
    [
      'an hour and three quarters',
      '2026-06-17T17:15:00Z',
      '2026-06-17T19:00:00Z',
      '(1 hr, 45 min)',
    ],
    ['whole hours', '2026-06-18T08:00:00Z', '2026-06-18T15:00:00Z', '(7 hr)'],
    ['a minute', '2026-06-17T16:00:00Z', '2026-06-17T16:01:00Z', '(1 min)'],
    ['a night', '2026-06-17T22:30:00Z', '2026-06-18T00:30:00Z', '(2 hr)'],
    ['a day and some hours', '2026-06-22T09:00:00Z', '2026-06-23T17:00:00Z', '(1 day, 8 hr)'],
    ['a night and a day', '2026-06-22T22:00:00Z', '2026-06-24T06:00:00Z', '(1 day, 8 hr)'],
    ['whole days', '2026-06-01T00:00:00Z', '2026-07-16T00:00:00Z', '(45 days)'],
  ])('measures %s', (_case, start, end, expected) => {
    expect(time(timed(start, end)).endsWith(` ${expected}`)).toBe(true);
  });

  it('counts the dates of an all-day event, one included', () => {
    expect(time(allDay('2026-06-20', '2026-06-23'))).toBe('All day, until Monday, Jun 22 (3 days)');
    expect(time(allDay('2026-06-20', '2026-06-21'))).toBe('All day (1 day)');
  });

  it('gives an event that starts and ends in the same minute none, as it has no end time', () => {
    expect(time(timed('2026-06-17T09:41:00Z', '2026-06-17T09:41:00Z'))).toBe('9:41');
    expect(time(timed('2026-06-17T09:41:10Z', '2026-06-17T09:41:40Z'))).toBe('9:41');
  });

  it('follows the start alone under show_end_time: false', () => {
    const config = buildConfig({ show_duration: true, time_24h: true, show_end_time: false });
    expect(time(timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z'), config)).toBe(
      '16:00 (30 min)',
    );
  });

  it("writes the card language's own units", () => {
    const review = timed('2026-06-17T17:15:00Z', '2026-06-17T19:00:00Z');
    expect(time(review, on, 'de')).toBe('17:15 - 19:00 (1 Std., 45 Min.)');
    expect(time(review, on, 'uk')).toBe('17:15 - 19:00 (1 год і 45 хв)');
    expect(time(allDay('2026-06-20', '2026-06-23'), on, 'sv')).toMatch(/\(3 dygn\)$/);
  });

  it('is read per view', () => {
    const config = buildConfig({ column: { show_duration: true } });
    expect(resolveEffectiveConfig(config, 'list').show_duration).toBe(false);
    expect(resolveEffectiveConfig(config, 'column').show_duration).toBe(true);
  });
});

describe('the presentation', () => {
  const parts = (event: Types.CalendarEventData, overrides: Partial<Types.Config> = {}) =>
    buildEventPresentation(
      event,
      buildConfig({ show_duration: true, time_24h: true, ...overrides }),
      'en',
    ).contentParts;

  it('makes the duration part of the end grid can drop, with the end time', () => {
    const { eventTime, eventTimeEnd } = parts(
      timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z'),
    );
    expect(read(eventTimeEnd)).toBe(' - 16:30 (30 min)');
    expect(eventTime.endsWith(eventTimeEnd!)).toBe(true);
  });

  it('makes it droppable alone where there is no end time', () => {
    const { eventTime, eventTimeEnd } = parts(
      timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z'),
      { show_end_time: false },
    );
    expect(read(eventTime)).toBe('16:00 (30 min)');
    expect(read(eventTimeEnd)).toBe(' (30 min)');
  });

  it('follows the text beside an all-day badge, which has taken the label', () => {
    expect(
      read(parts(allDay('2026-06-20', '2026-06-23'), { allday_badge: 'time' }).eventTime),
    ).toBe('until Monday, Jun 22 (3 days)');
  });
});

describe('a split event', () => {
  const rows = (
    events: Types.CalendarEventData[],
    overrides: Partial<Types.Config>,
    view: 'list' | 'column' = 'list',
  ) => {
    const config = buildConfig({ show_duration: true, time_24h: true, ...overrides });
    return EventUtils.groupEventsByDay(
      events.map((event) => ({ ...event, _entityId: 'calendar.personal' })),
      config,
      false,
      'en',
      view,
    ).flatMap((day) => day.events.map((event) => time(event, config)));
  };

  it('carries the whole length on every day, marked as a total', () => {
    const split = { split_multiday_events: true, start_date: '2026-06-17', days_to_show: 8 };
    expect(rows([allDay('2026-06-20', '2026-06-23')], split)).toEqual([
      'All day (3 days total)',
      'All day (3 days total)',
      'All day (3 days total)',
    ]);
    expect(rows([timed('2026-06-22T09:00:00Z', '2026-06-24T17:00:00Z')], split)).toEqual([
      '9:00 - 23:59 (2 days, 8 hr total)',
      'All day (2 days, 8 hr total)',
      '0:00 - 17:00 (2 days, 8 hr total)',
    ]);
    // Shorter than a day, and still the whole night on each of its two days.
    expect(rows([timed('2026-06-17T20:30:00Z', '2026-06-18T04:30:00Z')], split)).toEqual([
      '20:30 - 23:59 (8 hr total)',
      '0:00 - 4:30 (8 hr total)',
    ]);
  });

  it('carries it on the one row of an unsplit event', () => {
    expect(
      rows([timed('2026-06-22T09:00:00Z', '2026-06-23T17:00:00Z')], {
        start_date: '2026-06-17',
        days_to_show: 7,
      }),
    ).toEqual(['9:00 until Tuesday, Jun 23 at 17:00 (1 day, 8 hr)']);
  });

  it('reads the same on the days of column view, which always splits', () => {
    expect(
      rows(
        [timed('2026-06-17T20:30:00Z', '2026-06-18T04:30:00Z')],
        { start_date: '2026-06-17', days_to_show: 2 },
        'column',
      ),
    ).toEqual(['20:30 - 23:59 (8 hr total)', '0:00 - 4:30 (8 hr total)']);
  });

  it('carries it on a day whose event began before the card shows it', () => {
    const split = { split_multiday_events: true, start_date: '2026-06-21', days_to_show: 3 };
    expect(rows([allDay('2026-06-20', '2026-06-23')], split)).toEqual([
      'All day (3 days total)',
      'All day (3 days total)',
    ]);
  });

  it("writes the total in the card language's own words", () => {
    const [first] = EventUtils.groupEventsByDay(
      [{ ...allDay('2026-06-20', '2026-06-23'), _entityId: 'calendar.personal' }],
      buildConfig({ show_duration: true, split_multiday_events: true, days_to_show: 14 }),
      false,
      'de',
      'list',
    );
    expect(read(formatEventDuration(first.events[0], 'de'))).toBe('(3 Tage insgesamt)');
    expect(read(formatEventDuration(first.events[0], 'ko'))).toBe('(총 3일)');
  });
});

describe('the rendered row', () => {
  /** Each event's time, as an agenda view draws it. */
  const drawAgenda = (view: 'list' | 'column', overrides: Partial<Types.Config> = {}) => {
    const config = buildConfig({
      entities: ['calendar.anna'],
      view,
      start_date: '2026-06-17',
      days_to_show: 1,
      show_duration: true,
      time_24h: true,
      ...overrides,
    });
    const days = EventUtils.groupEventsByDay(
      [{ ...timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z'), _entityId: 'calendar.anna' }],
      config,
      false,
      'en',
      view,
    );
    const effective = resolveEffectiveConfig(config, view);
    const container = document.createElement('div');
    render(
      view === 'column'
        ? Render.renderColumnGroupedEvents(days, effective, 'en', undefined, null, false)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null, false),
      container,
    );
    // The template's own indentation collapsed, as the browser draws it.
    return [...container.querySelectorAll('.time-actual')].map((el) =>
      read(el.textContent).replace(/\s+/g, ' ').trim(),
    );
  };

  it.each(['list', 'column'] as const)('ends the time in %s view', (view) => {
    expect(drawAgenda(view)).toEqual(['16:00 - 16:30 (30 min)']);
    expect(drawAgenda(view, { show_duration: false })).toEqual(['16:00 - 16:30']);
  });

  it('is hidden with the time', () => {
    expect(drawAgenda('list', { show_time: false })).toEqual([]);
  });

  it('ends the time beside the title', () => {
    expect(drawAgenda('list', { time_position: 'title' })).toEqual(['16:00 - 16:30 (30 min)']);
  });
});

describe('grid view', () => {
  const renderedGrid = (
    events: Types.CalendarEventData[],
    overrides: Partial<Types.Config> = {},
  ): HTMLElement => {
    const config = buildConfig({
      entities: ['calendar.anna'],
      view: 'grid',
      start_date: '2026-06-17',
      days_to_show: 3,
      show_duration: true,
      time_24h: true,
      ...overrides,
    });
    const container = document.createElement('div');
    render(
      renderGridGroupedEvents(
        EventUtils.groupEventsByDay(
          events.map((event) => ({ ...event, _entityId: 'calendar.anna' })),
          config,
          false,
          'en',
          'grid',
        ),
        resolveEffectiveConfig(config, 'grid'),
        'en',
        undefined,
        null,
        NOW,
      ),
      container,
    );
    return container;
  };
  const drawGrid = (events: Types.CalendarEventData[], overrides: Partial<Types.Config> = {}) =>
    [...renderedGrid(events, overrides).querySelectorAll('.grid-event .time-end')].map((el) =>
      read(el.textContent),
    );
  /** Each block's whole time row. */
  const blockTimes = (events: Types.CalendarEventData[], overrides: Partial<Types.Config> = {}) =>
    [...renderedGrid(events, overrides).querySelectorAll('.grid-event .time-actual')].map((el) =>
      read(el.textContent).trim(),
    );
  /** Each banner's title and length, the length null where it has none. */
  const banners = (events: Types.CalendarEventData[], overrides: Partial<Types.Config> = {}) =>
    [...renderedGrid(events, overrides).querySelectorAll('.grid-banner')].map((el) => [
      el.querySelector('.grid-banner-title')!.textContent!.trim(),
      el.querySelector('.grid-banner-duration') &&
        read(el.querySelector('.grid-banner-duration')!.textContent),
    ]);

  it('puts the duration in the end a narrow block gives up', () => {
    expect(drawGrid([timed('2026-06-17T16:00:00Z', '2026-06-17T17:30:00Z')])).toEqual([
      ' - 17:30 (1 hr, 30 min)',
    ]);
  });

  it('gives the block that starts an overnight event its whole length, after the days to its end', () => {
    // From 20:05, inside the default band, which ends at 22:00.
    expect(drawGrid([timed('2026-06-17T20:05:00Z', '2026-06-18T01:35:00Z')])).toEqual([
      ' - 1:35 (+1) (5 hr, 30 min)',
    ]);
  });

  it('splits the end into its time and the duration after it, which the ladder keeps longer', () => {
    const end = renderedGrid([timed('2026-06-17T16:00:00Z', '2026-06-17T17:30:00Z')]).querySelector(
      '.time-end',
    )!;
    expect([...end.children].map((child) => [child.className, read(child.textContent)])).toEqual([
      ['time-end-reading', ' - 17:30'],
      ['time-duration', ' (1 hr, 30 min)'],
    ]);
    // Without one, the end stays a single span, as it always was.
    const plain = renderedGrid([timed('2026-06-17T16:00:00Z', '2026-06-17T17:30:00Z')], {
      show_duration: false,
    }).querySelector('.time-end')!;
    expect(plain.children).toHaveLength(0);
    expect(read(plain.textContent)).toBe(' - 17:30');
  });

  it('gives the blocks after the first the whole length, marked as a total', () => {
    const night = timed('2026-06-17T20:05:00Z', '2026-06-18T01:35:00Z');
    const allHours = { time_grid: { start_time: '00:00', end_time: '23:00' } };
    expect(blockTimes([night], allHours)).toEqual([
      '20:05 - 1:35 (+1) (5 hr, 30 min)',
      '(5 hr, 30 min total)',
    ]);
    expect(blockTimes([night], { ...allHours, show_duration: false })).toEqual([
      '20:05 - 1:35 (+1)',
    ]);
    expect(blockTimes([night], { ...allHours, show_time: false })).toEqual([]);
  });

  it('puts the length after a banner title, as a total where the banner is cut off', () => {
    const shown = [
      allDay('2026-06-17', '2026-06-18', 'Bins out'),
      allDay('2026-06-18', '2026-06-20', 'Weekend away'),
      allDay('2026-06-14', '2026-06-19', 'Holiday'),
      {
        ...timed('2026-06-17T09:00:00Z', '2026-06-18T17:00:00Z'),
        summary: 'Conference',
      },
    ];
    // By title: which band row a banner takes is the band's business.
    expect(Object.fromEntries(banners(shown))).toEqual({
      Holiday: '(5 days total)',
      'Bins out': '(1 day)',
      Conference: '(1 day, 8 hr)',
      'Weekend away': '(2 days)',
    });
    expect(banners(shown, { show_duration: false }).map(([, lasts]) => lasts)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('marks a total on a banner that filtered days take out of the middle', async () => {
    // Fri Jun 19 to Mon Jun 22 on a weekdays-only calendar.
    const mountGrid = async (options: {
      weekdays?: boolean;
      ben?: boolean;
      hideEmpty?: boolean;
    }) => {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: Record<string, unknown>): void;
        hass: Types.Hass;
        updateComplete: Promise<boolean>;
        updateEvents(force?: boolean): Promise<void>;
      };
      card.setConfig({
        entities: [
          options.weekdays
            ? { entity: 'calendar.anna', days_of_week: 'weekdays' }
            : 'calendar.anna',
          ...(options.ben ? ['calendar.ben'] : []),
        ],
        view: 'grid',
        start_date: '2026-06-19',
        days_to_show: 5,
        show_duration: true,
        ...(options.hideEmpty ? { time_grid: { show_empty_days: false } } : {}),
      });
      const held: Record<string, Types.CalendarEventData[]> = {
        'calendar.anna': [allDay('2026-06-19', '2026-06-23', 'Course')],
        'calendar.ben': [allDay('2026-06-20', '2026-06-21', 'Market')],
      };
      const off = (id: string) => ({ entity_id: id, state: 'off', attributes: {} });
      card.hass = {
        states: { 'calendar.anna': off('calendar.anna'), 'calendar.ben': off('calendar.ben') },
        locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
        connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
        callApi: vi.fn(async (_method: string, path: string) => held[path.split('?')[0].slice(10)]),
        callService: vi.fn(),
      } as unknown as Types.Hass;
      document.body.appendChild(card);
      await card.updateEvents(true);
      await card.updateComplete;
      return [...card.shadowRoot!.querySelectorAll('.grid-banner')]
        .filter((banner) => banner.textContent!.includes('Course'))
        .map((banner) => read(banner.querySelector('.grid-banner-duration')?.textContent));
    };

    // With the grid's empty days hidden the weekend goes, and the banner joins Friday to Monday,
    // both of its ends on screen and no arrow at either: two columns of the four days.
    expect(await mountGrid({ weekdays: true, hideEmpty: true })).toEqual(['(4 days total)']);
    // Kept in view by another calendar, the weekend splits it into a run for each side.
    expect(await mountGrid({ weekdays: true, ben: true })).toEqual([
      '(4 days total)',
      '(4 days total)',
    ]);
    // The control: on a calendar that keeps every day it is one whole banner.
    expect(await mountGrid({ hideEmpty: true })).toEqual(['(4 days)']);
  });

  it('draws none with the option off (control)', () => {
    expect(
      drawGrid([timed('2026-06-17T16:00:00Z', '2026-06-17T17:30:00Z')], { show_duration: false }),
    ).toEqual([' - 17:30']);
  });
});

describe('the words', () => {
  it('are what Intl.DurationFormat writes, in every card language', () => {
    // Each shape with its length in the units Intl.DurationFormat takes, the oracle.
    const shapes: Array<[Types.CalendarEventData, Record<string, number>]> = [
      [timed('2026-06-17T16:00:00Z', '2026-06-17T16:30:00Z'), { minutes: 30 }],
      [timed('2026-06-17T17:15:00Z', '2026-06-17T19:00:00Z'), { hours: 1, minutes: 45 }],
      [timed('2026-06-22T09:00:00Z', '2026-06-24T11:30:00Z'), { days: 2, hours: 2, minutes: 30 }],
      [allDay('2026-06-20', '2026-06-23'), { days: 3 }],
    ];
    const DurationFormat = (
      Intl as unknown as {
        DurationFormat: new (
          locales: string[],
          options: object,
        ) => { format(duration: object): string };
      }
    ).DurationFormat;
    const written = (language: string) =>
      shapes.map(([event]) => formatEventDuration(event, language));
    const expected = (language: string) =>
      shapes.map(([, duration]) => {
        const format = new DurationFormat(intlLocales(language), {
          style: 'short',
          days: 'long',
          daysDisplay: 'auto',
        });
        return `\u2068(${format.format(duration)})\u2069`;
      });

    expect(CARD_LANGUAGES.length).toBeGreaterThan(30);
    for (const language of CARD_LANGUAGES) expect(written(language)).toEqual(expected(language));
  });
});

describe("Home Assistant's Intl polyfill", () => {
  interface CardUnderTest extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
    updateEvents(force?: boolean): Promise<void>;
  }

  const NATIVE_DURATION_FORMAT = (Intl as unknown as Record<string, unknown>).DurationFormat;

  afterEach(() => {
    Object.defineProperty(Intl, 'DurationFormat', {
      value: NATIVE_DURATION_FORMAT,
      configurable: true,
      writable: true,
    });
  });

  // The loader asks for a language once per page, so each case has a language of its own.
  async function mount(
    language: string,
    config: Record<string, unknown>,
    events: Types.CalendarEventData[] = [],
  ) {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ entities: ['calendar.anna'], days_to_show: 2, language, ...config });
    card.hass = {
      states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
      locale: { language: 'is', first_weekday: 'monday', time_format: '24' },
      connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
      callApi: vi.fn().mockResolvedValue(events),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    return card;
  }

  /** Each event's time on a mounted card, as drawn. */
  const times = (card: CardUnderTest) =>
    [...card.shadowRoot!.querySelectorAll('.time-actual')].map((el) =>
      read(el.textContent).replace(/\s+/g, ' ').trim(),
    );

  /** Let a released response land, and the card draw again. */
  async function settle(card: CardUnderTest) {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    await card.updateComplete;
  }

  const review = timed('2026-06-17T17:15:00Z', '2026-06-17T19:00:00Z', 'Review');

  it("loads number and list formats in the card's language where a view shows durations", async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    await mount('de', { column: { show_duration: true } });
    expect(files.asked).toEqual([
      '/static/locale-data/intl-datetimeformat/de.json',
      '/static/locale-data/intl-relativetimeformat/de.json',
      '/static/locale-data/intl-numberformat/de.json',
      '/static/locale-data/intl-listformat/de.json',
    ]);
  });

  it('writes the card language once its data lands, whatever the polyfill made before', async () => {
    installPolyfill(['is']);
    // formatjs's DurationFormat, as far as this matters: it keeps the number format it first made
    // for a language, so one made before the language's data came goes on writing another.
    const kept = new Map<string, string>();
    class KeepingDurationFormat {
      private readonly locale: string;
      constructor(locales: string[]) {
        const key = locales.join();
        if (!kept.has(key)) kept.set(key, new Intl.NumberFormat(locales).resolvedOptions().locale);
        this.locale = kept.get(key)!;
      }
      format(duration: object): string {
        const Native = NATIVE_DURATION_FORMAT as new (
          locale: string,
          options: object,
        ) => { format(duration: object): string };
        return new Native(this.locale, {
          style: 'short',
          days: 'long',
          daysDisplay: 'auto',
        }).format(duration);
      }
    }
    Object.defineProperty(Intl, 'DurationFormat', {
      value: KeepingDurationFormat,
      configurable: true,
      writable: true,
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', async (url: string) => {
      await held;
      return files.fetch(url);
    });

    const card = await mount('sv', { show_duration: true, time_24h: true }, [review]);
    // Before the data, the polyfill writes the one language it holds, as it does the dates.
    expect(times(card)).toEqual(['17:15 - 19:00 (1 klst. og 45 mín.)']);

    release();
    await settle(card);
    expect(files.asked).toContain('/static/locale-data/intl-listformat/sv.json');
    expect(times(card)).toEqual(['17:15 - 19:00 (1 tim, 45 min)']);
  });

  it('leaves the duration out, and keeps the time, where the list format has no data', async () => {
    const { ListFormat } = installPolyfill(['is']);
    // formatjs's ListFormat with nothing loaded, which fails only when asked to write.
    class Empty extends (ListFormat as unknown as new (...args: unknown[]) => {
      format(items: string[]): string;
    }) {
      format(): string {
        throw new Error('Missing locale data for');
      }
    }
    Object.assign(Empty, { __addLocaleData: ListFormat.__addLocaleData });
    Object.defineProperty(Intl, 'ListFormat', { value: Empty, configurable: true, writable: true });
    vi.stubGlobal('fetch', homeAssistantFiles().fetch);

    const card = await mount('nb', { show_duration: true, time_24h: true }, [review]);
    await settle(card);
    expect(times(card)).toEqual(['17:15 - 19:00']);
  });

  it('loads only what it did before where none does', async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    await mount('fr', {});
    expect(files.asked).toEqual([
      '/static/locale-data/intl-datetimeformat/fr.json',
      '/static/locale-data/intl-relativetimeformat/fr.json',
    ]);
  });
});
