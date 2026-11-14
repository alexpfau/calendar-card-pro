/**
 * Count-up (#165): a finished event shows how long ago it ended, "13 days ago", as the countdown
 * read backward. It comes with `show_countdown` and has no option of its own, so every case turns
 * the countdown on and draws past events; each "none" assertion sits beside a case the same
 * harness draws a count-up for, so a harness that drew nothing would fail rather than pass.
 *
 * Runs under `TZ=UTC` with the unit project, so an ISO instant is also the wall clock. What
 * depends on a real zone, the local date and its changes of clock, is in `count-up.dst.test.ts`.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import { COUNTDOWN_ONCE_PER_DAY } from '../src/config/constants';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import * as Presentation from '../src/rendering/presentation';
import * as EventUtils from '../src/utils/events';
import { countsUpTheClock, getCountUpString, getCountdownString } from '../src/utils/format';

/** Wednesday, Jun 17, 10:00. */
const NOW = new Date('2026-06-17T10:00:00Z');

const allDay = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { date: start },
  end: { date: end },
});

const timed = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

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
});

describe('the wording', () => {
  const up = (event: Types.CalendarEventData, options = {}, language = 'en') =>
    getCountUpString(event, language, options);

  it('counts in clock units from an end earlier today', () => {
    expect(up(timed('Dog fed', '2026-06-17T09:00:00Z', '2026-06-17T09:59:50Z'))).toBe(
      'a few seconds ago',
    );
    expect(up(timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z'))).toBe(
      '40 minutes ago',
    );
    expect(up(timed('Breakfast', '2026-06-17T08:00:00Z', '2026-06-17T09:00:00Z'))).toBe(
      'an hour ago',
    );
    expect(up(timed('School run', '2026-06-17T04:00:00Z', '2026-06-17T05:00:00Z'))).toBe(
      '5 hours ago',
    );
  });

  it('never rounds a long wait today into a day', () => {
    vi.setSystemTime(new Date('2026-06-17T23:40:00Z'));
    expect(up(timed('Night feed', '2026-06-17T00:10:00Z', '2026-06-17T00:30:00Z'))).toBe(
      '23 hours ago',
    );
  });

  it('names the date before today, timed or all-day, whatever the hour', () => {
    expect(up(timed('Water filter changed', '2026-06-16T23:00:00Z', '2026-06-16T23:59:00Z'))).toBe(
      'yesterday',
    );
    expect(up(allDay('Lawn mowed', '2026-06-16', '2026-06-17'))).toBe('yesterday');
  });

  it('counts earlier dates in natural units between calendar dates', () => {
    expect(up(allDay('Lawn mowed', '2026-06-04', '2026-06-05'))).toBe('13 days ago');
    expect(up(timed('Propane tank filled', '2026-06-05T07:00:00Z', '2026-06-05T07:30:00Z'))).toBe(
      '12 days ago',
    );
    expect(up(allDay('Smoke alarms tested', '2026-05-08', '2026-05-09'))).toBe('a month ago');
    expect(up(allDay('Chimney swept', '2025-06-17', '2025-06-18'))).toBe('a year ago');
  });

  it('counts from the end, not the start', () => {
    // A trip from Jun 1 to Jun 14: its last day was three days ago, its first sixteen.
    expect(up(allDay('Trip', '2026-06-01', '2026-06-15'))).toBe('3 days ago');
    expect(up(timed('Conference', '2026-06-10T09:00:00Z', '2026-06-14T17:00:00Z'))).toBe(
      '3 days ago',
    );
  });

  it('counts an end at midnight as the day before, and one after it as today', () => {
    const untilMidnight = timed('Late shift', '2026-06-16T22:00:00Z', '2026-06-17T00:00:00Z');
    const pastMidnight = timed('Night shift', '2026-06-16T22:00:00Z', '2026-06-17T00:30:00Z');

    vi.setSystemTime(new Date('2026-06-17T00:05:00Z'));
    expect(up(untilMidnight)).toBe('yesterday');
    vi.setSystemTime(NOW);
    expect(up(untilMidnight)).toBe('yesterday');
    expect(up(pastMidnight)).toBe('10 hours ago');
  });

  it('counts nothing until the event has ended', () => {
    expect(up(timed('Swim practice', '2026-06-17T09:30:00Z', '2026-06-17T10:30:00Z'))).toBeNull();
    expect(up(timed('Piano lesson', '2026-06-17T15:00:00Z', '2026-06-17T16:00:00Z'))).toBeNull();
    // Today's all-day event is not over until midnight, as it is not dimmed until then.
    expect(up(allDay('Holiday', '2026-06-17', '2026-06-18'))).toBeNull();
    // At its very end it has ended no more than `isEventPast` says.
    expect(up(timed('Call', '2026-06-17T09:00:00Z', '2026-06-17T10:00:00Z'))).toBeNull();
    expect(
      up({
        ...allDay('', '2026-06-16', '2026-06-17'),
        _isEmptyDay: true,
      } as Types.CalendarEventData),
    ).toBeNull();
  });

  it('counts in days with countdown_exact_days, leaving today in clock units', () => {
    const exact = { exactDays: true };
    expect(up(allDay('Lawn mowed', '2026-06-16', '2026-06-17'), exact)).toBe('1 day ago');
    expect(up(allDay('Smoke alarms tested', '2026-05-08', '2026-05-09'), exact)).toBe(
      '40 days ago',
    );
    expect(up(allDay('Chimney swept', '2025-05-13', '2025-05-14'), exact)).toBe('400 days ago');
    expect(up(timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z'), exact)).toBe(
      '40 minutes ago',
    );
  });

  it('counts up only from ends within countdown_max_days, counted in dates', () => {
    const lastWeek = allDay('Lawn mowed', '2026-06-10', '2026-06-11');
    const eightDays = allDay('Gutters cleared', '2026-06-09', '2026-06-10');
    const today = timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z');

    expect(up(lastWeek, { maxDays: 7 })).toBe('7 days ago');
    expect(up(eightDays, { maxDays: 7 })).toBeNull();
    expect(up(today, { maxDays: 0 })).toBe('40 minutes ago');
    expect(up(allDay('Lawn mowed', '2026-06-16', '2026-06-17'), { maxDays: 0 })).toBeNull();
  });

  it("writes the card language's own words", () => {
    const lawn = allDay('Lawn mowed', '2026-06-04', '2026-06-05');
    const yesterday = allDay('Lawn mowed', '2026-06-16', '2026-06-17');
    expect(up(lawn, {}, 'de')).toBe('vor 13 Tagen');
    expect(up(yesterday, {}, 'de')).toBe('gestern');
    expect(up(lawn, {}, 'uk')).toBe('13 днів тому');
    expect(up(yesterday, { exactDays: true }, 'fr')).toBe('il y a 1 jour');
  });
});

describe('the gate', () => {
  const countdown = (event: Types.CalendarEventData, overrides: Partial<Types.Config> = {}) =>
    Presentation.buildEventPresentation(
      event,
      buildConfig({ show_countdown: true, ...overrides }),
      'en',
    ).contentParts;
  const lawn = allDay('Lawn mowed', '2026-06-04', '2026-06-05');
  const walk = timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z');

  it('rides on show_countdown, with no switch of its own', () => {
    expect(countdown(lawn)).toMatchObject({ countdownStr: '13 days ago', countUp: true });
    expect(countdown(lawn, { show_countdown: false })).toMatchObject({
      countdownStr: null,
      countUp: false,
    });
  });

  it('leaves out finished all-day events with show_countdown_allday off, and only those', () => {
    expect(countdown(lawn, { show_countdown_allday: false }).countdownStr).toBeNull();
    expect(countdown(walk, { show_countdown_allday: false }).countdownStr).toBe('40 minutes ago');
  });

  it('marks a countdown to come as no count-up', () => {
    const lesson = timed('Piano lesson', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z');
    expect(countdown(lesson)).toMatchObject({ countdownStr: 'in 3 days', countUp: false });
  });

  it('passes countdown_exact_days and countdown_max_days to the count-up', () => {
    expect(countdown(lawn, { countdown_exact_days: true }).countdownStr).toBe('13 days ago');
    expect(
      countdown(allDay('Smoke alarms tested', '2026-05-08', '2026-05-09'), {
        countdown_exact_days: true,
      }).countdownStr,
    ).toBe('40 days ago');
    expect(countdown(lawn, { countdown_max_days: 12 }).countdownStr).toBeNull();
    expect(countdown(lawn, { countdown_max_days: 13 }).countdownStr).toBe('13 days ago');
  });

  it('leaves the countdown formatter answering for events to come only', () => {
    expect(getCountdownString(lawn, 'en')).toBeNull();
  });
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  _clockTimerAt: number | null;
}

let callApi: ReturnType<typeof vi.fn>;

async function mount(
  config: Record<string, unknown>,
  events: Types.CalendarEventData[],
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({
    entities: ['calendar.anna'],
    start_date: '2026-06-01',
    days_to_show: 20,
    show_past_events: true,
    show_countdown: true,
    ...config,
  });
  callApi = vi.fn().mockResolvedValue(events);
  card.hass = {
    states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
    callApi,
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  callApi.mockClear();
  return card;
}

/** Each drawn event's title, countdown text and countdown classes, in drawn order. */
function rows(card: CardUnderTest): Array<[string, string | null, string | null]> {
  return [...card.shadowRoot!.querySelectorAll('.event')]
    .filter(
      (event) => event.querySelector('.event-title') && !event.querySelector('.empty-day-title'),
    )
    .map((event) => {
      const countdown = event.querySelector('.time-countdown');
      return [
        event.querySelector('.event-title')!.textContent!.trim(),
        countdown?.textContent?.trim() || null,
        countdown?.getAttribute('class') ?? null,
      ];
    });
}

const LOG = [
  allDay('Lawn mowed', '2026-06-04', '2026-06-05'),
  allDay('Propane tank filled', '2026-06-05', '2026-06-06'),
  timed('Water filter changed', '2026-06-16T18:00:00Z', '2026-06-16T18:30:00Z'),
  timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z'),
  timed('Piano lesson', '2026-06-18T15:00:00Z', '2026-06-18T16:00:00Z'),
];

describe.each(['list', 'column'] as const)('in %s view', (view) => {
  it('draws a count-up on each finished event and a countdown on the one to come', async () => {
    const card = await mount({ view }, LOG);
    expect(card.shadowRoot!.querySelector('.column-events') !== null).toBe(view === 'column');
    const drawn = Object.fromEntries(rows(card).map(([title, ...rest]) => [title, rest]));

    expect(drawn['Lawn mowed']).toEqual(['13 days ago', 'time-countdown count-up']);
    expect(drawn['Propane tank filled']).toEqual(['12 days ago', 'time-countdown count-up']);
    expect(drawn['Water filter changed']).toEqual(['yesterday', 'time-countdown count-up']);
    expect(drawn['Dog walked']).toEqual(['40 minutes ago', 'time-countdown count-up']);
    expect(drawn['Piano lesson']).toEqual(['tomorrow', 'time-countdown']);
  });

  it('draws it inside the dimmed row, so it fades with the event', async () => {
    const card = await mount({ view }, [LOG[3]]);
    expect(card.shadowRoot!.querySelector('.past-event .time-countdown.count-up')).not.toBeNull();
  });
});

describe('placements', () => {
  const walk = timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:20:00Z');
  const countUp = (card: CardUnderTest, selector: string) =>
    card.shadowRoot!.querySelector(selector)?.textContent?.trim();

  it('trails the time in list view', async () => {
    const card = await mount({}, [walk]);
    expect(countUp(card, '.time > .time-countdown.count-up')).toBe('40 minutes ago');
  });

  it('folds into the time text beside the title', async () => {
    const card = await mount({ time_position: 'title' }, [walk]);
    expect(countUp(card, '.title-aside .time-text > .time-countdown.count-up')).toBe(
      '40 minutes ago',
    );
  });

  it('stands alone where the time is hidden', async () => {
    const card = await mount({ show_time: false }, [walk]);
    expect(countUp(card, '.time > .time-countdown.count-up')).toBe('40 minutes ago');
    const beside = await mount({ show_time: false, time_position: 'title' }, [walk]);
    expect(countUp(beside, '.title-aside .time-countdown.count-up')).toBe('40 minutes ago');
  });
});

describe('event_order: latest_first', () => {
  it('reads as a log, newest entry first', async () => {
    const card = await mount({ list: { event_order: 'latest_first' } }, LOG.slice(0, 4));
    expect(rows(card).map(([title, countdown]) => [title, countdown])).toEqual([
      ['Dog walked', '40 minutes ago'],
      ['Water filter changed', 'yesterday'],
      ['Propane tank filled', '12 days ago'],
      ['Lawn mowed', '13 days ago'],
    ]);
  });
});

describe('show_countdown: once_per_day', () => {
  const countdowns = (card: CardUnderTest) => rows(card).map(([, countdown]) => countdown);

  it('counts up once for a finished day whose count-ups all read the same', async () => {
    const bins = [
      allDay('Paper', '2026-06-04', '2026-06-05'),
      allDay('Plastic', '2026-06-04', '2026-06-05'),
      allDay('Paper', '2026-06-11', '2026-06-12'),
    ];
    expect(countdowns(await mount({}, bins))).toEqual(['13 days ago', '13 days ago', '6 days ago']);
    document.body.replaceChildren();
    expect(countdowns(await mount({ show_countdown: COUNTDOWN_ONCE_PER_DAY }, bins))).toEqual([
      '13 days ago',
      null,
      '6 days ago',
    ]);
  });

  it('keeps the first drawn, which is the latest under latest_first', async () => {
    const day = [
      timed('Dog fed', '2026-06-16T07:00:00Z', '2026-06-16T07:30:00Z'),
      timed('Dog walked', '2026-06-16T18:00:00Z', '2026-06-16T18:30:00Z'),
    ];
    const latest = {
      show_countdown: COUNTDOWN_ONCE_PER_DAY,
      list: { event_order: 'latest_first' },
    };
    expect(rows(await mount(latest, day)).map(([title, countdown]) => [title, countdown])).toEqual([
      ['Dog walked', 'yesterday'],
      ['Dog fed', null],
    ]);
  });

  it('keeps count-ups from earlier today, which name clock times', async () => {
    const today = [
      timed('Dog fed', '2026-06-17T04:00:00Z', '2026-06-17T05:10:00Z'),
      timed('Dog walked', '2026-06-17T04:30:00Z', '2026-06-17T05:20:00Z'),
    ];
    expect(countdowns(await mount({ show_countdown: COUNTDOWN_ONCE_PER_DAY }, today))).toEqual([
      '5 hours ago',
      '5 hours ago',
    ]);
  });

  it('keeps one from earlier today on an event that began yesterday', () => {
    // Unsplit, the overnight shift is drawn on its first day, where it reads in hours.
    const day = [
      timed('Late shift', '2026-06-16T20:00:00Z', '2026-06-17T05:10:00Z'),
      timed('Night shift', '2026-06-16T21:00:00Z', '2026-06-17T05:20:00Z'),
    ];
    const config = buildConfig({ show_countdown: COUNTDOWN_ONCE_PER_DAY });
    expect(day.map((event) => Presentation.eventCountdown(event, config, 'en'))).toEqual([
      '5 hours ago',
      '5 hours ago',
    ]);
    expect(day.map((event) => countsUpTheClock(event, NOW))).toEqual([true, true]);
    expect([...Presentation.repeatedCountdowns(day, config, 'en')]).toEqual([]);
    // Control: the same pair ending yesterday reads in days, and the second is left out.
    const yesterday = day.map((event) => ({
      ...event,
      end: { dateTime: event.end.dateTime!.replace('2026-06-17T05', '2026-06-16T23') },
    }));
    expect([...Presentation.repeatedCountdowns(yesterday, config, 'en')]).toEqual([1]);
  });
});

describe('grid view', () => {
  const drawGrid = (events: Types.CalendarEventData[], overrides: Partial<Types.Config> = {}) => {
    const config = buildConfig({
      entities: ['calendar.anna'],
      view: 'grid',
      start_date: '2026-06-15',
      days_to_show: 4,
      show_countdown: true,
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
    return [...container.querySelectorAll('.grid-event .time-countdown')].map((el) => [
      el.textContent?.trim(),
      el.getAttribute('class'),
    ]);
  };

  it('draws a count-up on a finished block, which grid shows by default', () => {
    expect(drawGrid([timed('Dog walked', '2026-06-16T09:00:00Z', '2026-06-16T11:00:00Z')])).toEqual(
      [['yesterday', 'time-countdown count-up']],
    );
  });

  it('counts the block that starts an overnight event from the whole event', () => {
    // From 22:00 to 1:35 the next night: the first block ends at midnight, the event later.
    const ended = timed('Night shift', '2026-06-15T20:00:00Z', '2026-06-16T01:35:00Z');
    expect(drawGrid([ended])).toEqual([['yesterday', 'time-countdown count-up']]);

    // Still under way past midnight: its first block is over, the event is not.
    vi.setSystemTime(new Date('2026-06-17T01:00:00Z'));
    const running = timed('Night shift', '2026-06-16T20:00:00Z', '2026-06-17T01:35:00Z');
    expect(drawGrid([running])).toEqual([]);
    vi.setSystemTime(new Date('2026-06-17T01:45:00Z'));
    expect(drawGrid([running])).toEqual([['10 minutes ago', 'time-countdown count-up']]);
  });
});

describe('the clock repaint', () => {
  const text = (card: CardUnderTest) =>
    card.shadowRoot!.querySelector('.time-countdown')?.textContent?.trim();

  it('moves a count-up in clock units each minute, with no hass update', async () => {
    const card = await mount({}, [
      timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:50:00Z'),
    ]);
    expect(text(card)).toBe('10 minutes ago');
    expect(card._clockTimerAt).toBe(NOW.getTime() + 60_000);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await card.updateComplete;
    expect(text(card)).toBe('15 minutes ago');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('waits for midnight while show_past_events hides the finished event', async () => {
    const card = await mount({ show_past_events: false }, [
      timed('Dog walked', '2026-06-17T09:00:00Z', '2026-06-17T09:50:00Z'),
      timed('Piano lesson', '2026-06-18T15:00:00Z', '2026-06-18T16:00:00Z'),
    ]);
    // The control row is drawn, so the card rendered; the finished one is not.
    expect(text(card)).toBe('tomorrow');
    expect(card.shadowRoot!.querySelector('.count-up')).toBeNull();
    expect(card._clockTimerAt).toBe(new Date('2026-06-18T00:00:01Z').getTime());
  });

  it('waits for midnight when the count-up reads in days', async () => {
    const card = await mount({}, [
      timed('Water filter changed', '2026-06-16T18:00:00Z', '2026-06-16T18:30:00Z'),
    ]);
    expect(text(card)).toBe('yesterday');
    expect(card._clockTimerAt).toBe(new Date('2026-06-18T00:00:01Z').getTime());
  });

  it('starts counting up when the event ends, with no hass update', async () => {
    // Ending within the card's half-hourly refresh, so nothing but the clock moves the card.
    const card = await mount({}, [
      timed('Swim practice', '2026-06-17T09:30:00Z', '2026-06-17T10:20:00Z'),
    ]);
    expect(text(card)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(21 * 60_000);
    await card.updateComplete;
    expect(text(card)).toBe('a few seconds ago');

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await card.updateComplete;
    expect(text(card)).toBe('5 minutes ago');
    expect(callApi).not.toHaveBeenCalled();
  });
});
