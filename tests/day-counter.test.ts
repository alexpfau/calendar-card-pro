/**
 * The day counter: under `show_progress_bar`, a row of an event a day or more long says which of
 * its days it stands for, "Day 2 of 3", in the place the countdown and the bar take, and draws no
 * bar (#281). The counter is the bar's form on such an event, so it has no option of its own.
 *
 * The bar is off by default, so every case turns it on. A "draws no bar" assertion is satisfied
 * by a harness that never draws one, so each is paired with a control the same harness draws a
 * bar for: an event shorter than a day. A counter assertion is paired with the bar turned off.
 * Pinned to UTC like the rest of the unit project; how the days fall where clocks change is
 * `day-counter.dst.test.ts`.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderEventContent } from '../src/rendering/leaves';
import { buildEventPresentation } from '../src/rendering/presentation';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/** Thursday, Nov 12, mid-morning. */
const NOW = new Date('2026-11-12T10:00:00Z');

/** A timed event, both ends in UTC, which is local time in this project. */
const timed = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: `${start}:00.000Z` },
  end: { dateTime: `${end}:00.000Z` },
  _entityId: 'calendar.anna',
});

/** An all-day event, its end date exclusive as Home Assistant sends it. */
const allDay = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { date: start },
  end: { date: end },
  _entityId: 'calendar.anna',
});

/** #281's shape: 45 days, midnight to midnight, today its 12th. */
const COURSE = timed('Spanish course', '2026-11-01T00:00', '2026-12-16T00:00');
/** Wednesday evening to Friday noon: three dates, today its second. */
const TRIP = timed('Ski trip', '2026-11-11T18:00', '2026-11-13T12:00');
/** Friday to Sunday, starting tomorrow. */
const CONFERENCE = allDay('Design conference', '2026-11-13', '2026-11-16');
/** Fifteen days, today its third. */
const VACATION = allDay('Vacation', '2026-11-10', '2026-11-25');
/** An hour under way now. */
const DENTIST = timed('Dentist', '2026-11-12T09:30', '2026-11-12T10:30');
/** Under way now, ending at tomorrow's first moment: it takes up Wednesday and today only. */
const TRIP_TO_MIDNIGHT = timed('Hackathon', '2026-11-11T18:00', '2026-11-13T00:00');
/** Through midnight, but less than a day. */
const NIGHT = timed('Night shift', '2026-11-11T22:00', '2026-11-12T11:00');
/** Under way now and ending at tomorrow's first moment like the hackathon, but under a day. */
const SHIFT_TO_MIDNIGHT = timed('Long shift', '2026-11-12T06:00', '2026-11-13T00:00');

interface Row {
  date: string;
  summary: string;
  dayOfEvent: Types.DayOfEvent | undefined;
  parts: ReturnType<typeof buildEventPresentation>['contentParts'];
}

/** Every row a card draws, with what each presents, through the real grouping and gates. */
function rows(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
  view: Types.EffectiveView = 'list',
  language = 'en',
): Row[] {
  const config = buildConfig({
    entities: ['calendar.anna'],
    start_date: '2026-11-12',
    days_to_show: 3,
    show_progress_bar: true,
    ...overrides,
  });
  const effective = resolveEffectiveConfig(config, view);
  return EventUtils.groupEventsByDay(events, config, false, language, view).flatMap((day) =>
    day.events.map((row) => ({
      date: FormatUtils.getLocalDateKey(new Date(day.timestamp)),
      summary: row.summary ?? '',
      dayOfEvent: row._dayOfEvent,
      parts: buildEventPresentation(row, effective, language).contentParts,
    })),
  );
}

/** The one row a card draws for `summary` on `date`. */
function row(found: Row[], summary: string, date = '2026-11-12'): Row {
  const matches = found.filter((r) => r.summary === summary && r.date === date);
  expect(matches, `${summary} on ${date}`).toHaveLength(1);
  return matches[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('which events count their days', () => {
  const span = (event: Types.CalendarEventData) =>
    FormatUtils.fullDaySpan(event.start, event.end)?.days ?? null;

  it.each([
    ['an all-day event over three dates', allDay('x', '2026-11-13', '2026-11-16'), 3],
    ['a one-date all-day event', allDay('x', '2026-11-13', '2026-11-14'), null],
    ['Monday 09:00 to Wednesday 17:00', timed('x', '2026-11-09T09:00', '2026-11-11T17:00'), 3],
    ['exactly a day, noon to noon', timed('x', '2026-11-09T12:00', '2026-11-10T12:00'), 2],
    ['25 hours across one midnight', timed('x', '2026-11-09T12:00', '2026-11-10T13:00'), 2],
    ['23 hours across one midnight', timed('x', '2026-11-09T12:00', '2026-11-10T11:00'), null],
    ['a night, 22:00 to 06:00', timed('x', '2026-11-09T22:00', '2026-11-10T06:00'), null],
    ['23:30 to 00:30', timed('x', '2026-11-09T23:30', '2026-11-10T00:30'), null],
    [
      'one whole day, midnight to midnight',
      timed('x', '2026-11-09T00:00', '2026-11-10T00:00'),
      null,
    ],
    ['two whole days, midnight to midnight', timed('x', '2026-11-09T00:00', '2026-11-11T00:00'), 2],
    ['#281: Nov 1 0:00 to Dec 16 0:00', COURSE, 45],
    ['an end before its start', timed('x', '2026-11-10T12:00', '2026-11-08T12:00'), null],
  ])('%s: %s days', (_name, event, days) => {
    expect(span(event)).toBe(days);
  });

  it('counts nothing for an end it cannot read', () => {
    expect(
      FormatUtils.fullDaySpan({ dateTime: '2026-11-09T12:00:00Z' }, { dateTime: 'soon' }),
    ).toBeNull();
    expect(FormatUtils.fullDaySpan({ date: '2026-11-09' }, { date: 'later' })).toBeNull();
  });
});

describe('the day a row stands for', () => {
  it('names the day an unsplit running event is drawn on, and the first of one ahead', () => {
    const found = rows([COURSE, TRIP, CONFERENCE]);
    expect(row(found, 'Spanish course').dayOfEvent).toEqual({ day: 12, days: 45 });
    expect(row(found, 'Ski trip').dayOfEvent).toEqual({ day: 2, days: 3 });
    expect(row(found, 'Design conference', '2026-11-13').dayOfEvent).toEqual({ day: 1, days: 3 });
  });

  it('names each day of a split event, past and future alike', () => {
    const found = rows(
      [TRIP, CONFERENCE],
      { show_past_events: true, start_date: '2026-11-11', days_to_show: 5 },
      'column',
    );
    expect(
      found.filter((r) => r.summary === 'Ski trip').map((r) => [r.date, r.dayOfEvent]),
    ).toEqual([
      ['2026-11-11', { day: 1, days: 3 }],
      ['2026-11-12', { day: 2, days: 3 }],
      ['2026-11-13', { day: 3, days: 3 }],
    ]);
    expect(
      found.filter((r) => r.summary === 'Design conference').map((r) => r.dayOfEvent?.day),
    ).toEqual([1, 2, 3]);
  });

  it('follows a window that starts later, as the row does', () => {
    const found = rows([COURSE], { start_date: '2026-11-19' });
    expect(row(found, 'Spanish course', '2026-11-19').dayOfEvent).toEqual({ day: 19, days: 45 });
  });

  it('names nothing on a row drawn under a day the event takes up no time on', () => {
    // Grouping draws an event ending at the window's first midnight under that day while past
    // events are shown. Counted from its start that row would read "Day 4 of 3".
    const ended = timed('Hackathon', '2026-11-09T18:00', '2026-11-12T00:00');
    const found = rows([ended], { show_past_events: true, show_progress_bar: true });
    expect(row(found, 'Hackathon').dayOfEvent).toEqual({ day: null, days: 3 });
    expect(row(found, 'Hackathon').parts.dayCounter).toBeNull();
    expect(FormatUtils.fullDaySpan(ended.start, ended.end)?.days).toBe(3);
  });

  it('draws no bar on such a row while its event still runs, as the clock repaint expects', () => {
    // Under way now and ending at the first midnight of a window that starts tomorrow, so it is
    // drawn under a date it takes up no time on. The bar's rule is the event's: no row of a
    // counted event draws one, or this row would draw a bar the clock repaint never moves.
    const found = rows([TRIP_TO_MIDNIGHT], { start_date: '2026-11-13' });
    expect(row(found, 'Hackathon', '2026-11-13').dayOfEvent).toEqual({ day: null, days: 2 });
    expect(row(found, 'Hackathon', '2026-11-13').parts.progressPercentage).toBeNull();

    // The control: the same row of an event under a day keeps its bar.
    const control = rows([SHIFT_TO_MIDNIGHT], { start_date: '2026-11-13' });
    expect(row(control, 'Long shift', '2026-11-13').dayOfEvent).toBeUndefined();
    expect(row(control, 'Long shift', '2026-11-13').parts.progressPercentage).toBeGreaterThan(0);
  });

  it('stamps nothing while the progress bar is off, nor in grid view', () => {
    expect(
      row(rows([COURSE], { show_progress_bar: false }), 'Spanish course').dayOfEvent,
    ).toBeUndefined();
    const grid = rows([COURSE, VACATION], {}, 'grid');
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.every((r) => r.dayOfEvent === undefined)).toBe(true);
  });

  it('follows the progress bar per view', () => {
    const viewOnly = { show_progress_bar: false, column: { show_progress_bar: true } };
    expect(row(rows([COURSE], viewOnly, 'list'), 'Spanish course').dayOfEvent).toBeUndefined();
    expect(row(rows([COURSE], viewOnly, 'column'), 'Spanish course').dayOfEvent).toEqual({
      day: 12,
      days: 45,
    });
  });
});

describe('the place the countdown and the bar take', () => {
  const on = { show_progress_bar: true, show_countdown: true };

  it('takes the bar off a running event a day or more long, and says which day it is', () => {
    const counted = row(rows([COURSE], on), 'Spanish course');
    expect(counted.parts.progressPercentage).toBeNull();
    expect(counted.parts.dayCounter).toBe('Day 12 of 45');
    expect(counted.parts.countdownStr).toBeNull();

    // The control: with the bar off there is no counter either.
    const control = row(rows([COURSE], { ...on, show_progress_bar: false }), 'Spanish course');
    expect(control.parts.progressPercentage).toBeNull();
    expect(control.parts.dayCounter).toBeNull();
  });

  it('leaves the bar on a single-day event and on one shorter than a day', () => {
    const found = rows([DENTIST, NIGHT], on);
    for (const summary of ['Dentist', 'Night shift']) {
      expect(row(found, summary).parts.progressPercentage, summary).toBeGreaterThan(0);
      expect(row(found, summary).parts.dayCounter, summary).toBeNull();
    }
  });

  it('gives an all-day event over several days a counter, where it had nothing', () => {
    const counted = row(rows([VACATION], on), 'Vacation');
    expect(counted.parts.dayCounter).toBe('Day 3 of 15');
    expect(
      row(rows([VACATION], { ...on, show_progress_bar: false }), 'Vacation').parts,
    ).toMatchObject({
      dayCounter: null,
      progressPercentage: null,
    });
  });

  it('keeps the countdown until the event starts', () => {
    // The row carries both, and the countdown has the place: see the drawn row below.
    const ahead = row(rows([CONFERENCE], on), 'Design conference', '2026-11-13');
    expect(ahead.parts.countdownStr).toBe('tomorrow');
    expect(ahead.parts.dayCounter).toBe('Day 1 of 3');
  });

  it('names the day before the start where no countdown is shown', () => {
    for (const overrides of [
      { show_countdown: false },
      { countdown_max_days: 0 },
      { show_countdown_allday: false },
    ]) {
      const ahead = row(
        rows([CONFERENCE], { ...on, ...overrides }),
        'Design conference',
        '2026-11-13',
      );
      expect(ahead.parts.dayCounter, JSON.stringify(overrides)).toBe('Day 1 of 3');
      expect(ahead.parts.countdownStr, JSON.stringify(overrides)).toBeNull();
    }
  });

  it('names a later day of a running event rather than counting down to it', () => {
    const later = row(rows([COURSE], on, 'column'), 'Spanish course', '2026-11-13');
    expect(later.parts.dayCounter).toBe('Day 13 of 45');
    expect(later.parts.countdownStr).toBeNull();

    const control = row(
      rows([COURSE], { ...on, show_progress_bar: false }, 'column'),
      'Spanish course',
      '2026-11-13',
    );
    expect(control.parts.countdownStr).toBe('tomorrow');
  });

  it("writes the counter in the card's language", () => {
    expect(row(rows([COURSE], on, 'list', 'de'), 'Spanish course').parts.dayCounter).toBe(
      'Tag 12 von 45',
    );
    expect(row(rows([COURSE], on, 'list', 'ko'), 'Spanish course').parts.dayCounter).toBe(
      '45일 중 12일째',
    );
    expect(row(rows([COURSE], on, 'list', 'fi'), 'Spanish course').parts.dayCounter).toBe(
      'Päivä 12/45',
    );
  });
});

describe('the drawn row', () => {
  /** One row drawn the way a view draws it, and its countdown place. */
  function drawn(
    event: Types.CalendarEventData,
    overrides: Partial<Types.Config>,
    options: Parameters<typeof renderEventContent>[3] = {},
    view: Types.EffectiveView = 'list',
  ) {
    const found = rows(
      [event],
      { show_progress_bar: true, show_countdown: true, ...overrides },
      view,
    );
    const target = found.find((r) => r.summary === event.summary)!;
    const config = resolveEffectiveConfig(
      buildConfig({
        show_progress_bar: true,
        show_countdown: true,
        ...overrides,
      }),
      view,
    );
    const container = document.createElement('div');
    render(renderEventContent(event, config, target.parts, options), container);
    const place = [...container.querySelectorAll('.time-countdown')];
    return {
      place: place.map((el) => [el.className, el.textContent?.trim() ?? '']),
      bars: container.querySelectorAll('.progress-bar').length,
      container,
    };
  }

  it('draws the counter at the end of the time line in list view, with no bar', () => {
    const { place, bars, container } = drawn(COURSE, {});
    expect(place).toEqual([['time-countdown day-counter', 'Day 12 of 45']]);
    expect(container.querySelector('.time > .day-counter')).not.toBeNull();
    expect(bars).toBe(0);
    expect(drawn(DENTIST, {}).bars).toBe(1);
  });

  it('folds it into the time text where the countdown folds, as in column view', () => {
    const { place, bars, container } = drawn(
      COURSE,
      {},
      { countdownPlacement: 'text', progressPlacement: 'row' },
      'column',
    );
    expect(place).toEqual([['time-countdown day-counter', 'Day 12 of 45']]);
    expect(container.querySelector('.time-text > .day-counter')).not.toBeNull();
    expect(bars).toBe(0);
    expect(
      drawn(DENTIST, {}, { countdownPlacement: 'text', progressPlacement: 'row' }, 'column').bars,
    ).toBe(1);
  });

  it('goes beside the title with the time, under time_position: title', () => {
    const { place, container } = drawn(COURSE, {}, { timePosition: 'title' });
    expect(place).toEqual([['time-countdown day-counter', 'Day 12 of 45']]);
    expect(container.querySelector('.title-aside .day-counter')).not.toBeNull();
    expect(container.querySelector('.progress-bar')).toBeNull();
  });

  it('stands alone in the time row when times are hidden', () => {
    const { place, container } = drawn(COURSE, { show_time: false });
    expect(place).toEqual([['time-countdown day-counter', 'Day 12 of 45']]);
    expect(container.querySelector('.time > .time-actual')?.textContent?.trim()).toBe('');
  });

  it('keeps the countdown its own class alone', () => {
    const { place } = drawn(CONFERENCE, {});
    expect(place).toEqual([['time-countdown', 'tomorrow']]);
  });
});

describe('the drawn card', () => {
  interface CardUnderTest extends HTMLElement {
    setConfig(config: Record<string, unknown>): void;
    hass: Types.Hass;
    readonly updateComplete: Promise<boolean>;
    updateEvents(force?: boolean): Promise<void>;
    _clockTimerAt: number | null;
  }

  async function mount(config: Record<string, unknown>, events: Types.CalendarEventData[]) {
    vi.stubGlobal('localStorage', memoryStorage());
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({
      entities: ['calendar.anna'],
      days_to_show: 3,
      show_progress_bar: true,
      ...config,
    });
    card.hass = {
      states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
      locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
      connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
      callApi: vi.fn().mockResolvedValue(events),
      callService: vi.fn(),
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await card.updateEvents(true);
    await card.updateComplete;
    return card;
  }

  const counters = (card: CardUnderTest): string[] =>
    [...card.shadowRoot!.querySelectorAll('.day-counter')].map(
      (el) => el.textContent?.trim() ?? '',
    );

  it.each(['list', 'column'] as const)('draws the counter in %s view', async (view) => {
    const card = await mount({ view, start_date: '2026-11-12' }, [COURSE]);
    expect(counters(card)[0]).toBe('Day 12 of 45');
  });

  it('keeps a countdown that only a counted row above would have repeated, under once_per_day', async () => {
    // Each later day of the running course would count down to its own start, and read as the
    // conference below it does. Shown, those would be repeats; replaced by the counter, they
    // are not there to repeat, so the conference keeps "tomorrow" and "in 2 days".
    const ART = { ...COURSE, summary: 'Art course' };
    const countdowns = (card: CardUnderTest) =>
      [...card.shadowRoot!.querySelectorAll('.time-countdown:not(.day-counter)')].map(
        (el) => el.textContent?.trim() ?? '',
      );
    const base = { view: 'column', start_date: '2026-11-12', show_countdown: 'once_per_day' };

    const counted = await mount(base, [ART, CONFERENCE]);
    expect(counters(counted)).toEqual(['Day 12 of 45', 'Day 13 of 45', 'Day 14 of 45']);
    expect(countdowns(counted)).toEqual(['tomorrow', 'in 2 days']);
    document.body.replaceChildren();

    // The control: with the bar off the course's own countdowns are drawn, and the
    // conference's, reading the same, are the repeats left out.
    const control = await mount({ ...base, show_progress_bar: false }, [ART, CONFERENCE]);
    expect(countdowns(control)).toEqual(['tomorrow', 'in 2 days']);
    expect(control.shadowRoot!.querySelectorAll('.time-countdown').length).toBe(2);
  });

  it('draws none in grid view, which keeps its bars', async () => {
    const card = await mount({ view: 'grid', start_date: '2026-11-12' }, [TRIP]);
    expect(card.shadowRoot!.querySelectorAll('.grid-event').length).toBeGreaterThan(0);
    expect(card.shadowRoot!.querySelectorAll('.progress-bar').length).toBeGreaterThan(0);
    expect(counters(card)).toEqual([]);
  });

  it('advances at midnight, with no update from Home Assistant', async () => {
    vi.setSystemTime(new Date('2026-11-12T23:58:00Z'));
    const card = await mount({ view: 'list' }, [COURSE]);
    expect(counters(card)).toEqual(['Day 12 of 45']);

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    await card.updateComplete;

    expect(counters(card)).toEqual(['Day 13 of 45']);
  });

  it('asks for no minute repaint for a bar it replaced', async () => {
    const midnight = new Date('2026-11-13T00:00:01Z').getTime();
    const counted = await mount({ view: 'list' }, [COURSE]);
    expect(counted._clockTimerAt).toBe(midnight);
    document.body.replaceChildren();

    // The control: the bar of an event under a day, not replaced, moves by the minute.
    const control = await mount({ view: 'list' }, [DENTIST]);
    expect(control._clockTimerAt).toBe(NOW.getTime() + 60_000);
  });

  it('leaves no bar unrepainted on a row that names no day', async () => {
    // The row and the repaint must agree: the repaint asks the event, so the row has to as well.
    const midnight = new Date('2026-11-13T00:00:01Z').getTime();
    const bars = (card: CardUnderTest) => card.shadowRoot!.querySelectorAll('.progress-bar').length;
    const counted = await mount({ view: 'list', start_date: '2026-11-13' }, [TRIP_TO_MIDNIGHT]);
    expect(counted.shadowRoot!.textContent).toContain('Hackathon');
    expect(bars(counted)).toBe(0);
    expect(counted._clockTimerAt).toBe(midnight);
    document.body.replaceChildren();

    // The control: the same row of an event under a day draws its bar, and repaints it.
    const control = await mount({ view: 'list', start_date: '2026-11-13' }, [SHIFT_TO_MIDNIGHT]);
    expect(control.shadowRoot!.textContent).toContain('Long shift');
    expect(bars(control)).toBe(1);
    expect(control._clockTimerAt).toBe(NOW.getTime() + 60_000);
  });
});
