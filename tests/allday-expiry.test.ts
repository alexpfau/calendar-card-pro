/**
 * `allday_expires_at` retires a calendar's all-day events partway through the day.
 *
 * All-day events had no end **instant**, only an end date, so the past-events test —
 * `endDate < now` — could not be applied to them and they were exempt from expiry
 * altogether. `allday_expires_at` supplies that instant. The request behind it (#163) is a
 * waste-collection feed published by a council: its entries are all-day events, so the bin
 * sits on the card all day, hours after it was emptied, and the reporter cannot edit
 * the feed.
 *
 * The option and its **default** are one rule at two settings, which is why the first
 * describe block below tests the default rather than the option. An all-day event is past
 * at midnight after its last day; `allday_expires_at` moves that instant earlier within the
 * final day.
 *
 * Four properties are pinned here, and each one has been wrong in some draft:
 *
 * - It reads the event's **last** day, so a multi-day all-day event retires on the morning
 *   it ends rather than the morning it began.
 * - It does nothing while `show_past_events` is on, because that option decides *whether*
 *   past events are shown and this one decides *when* an event becomes past. Two
 *   independent visibility rules over the same events is a card nobody can predict.
 * - It leaves timed events alone, which already have an end instant and already expire.
 * - An unparseable value falls back to the default rather than to never, so a typo leaves
 *   the card behaving as though the option were absent.
 *
 * The suite is built from `DEFAULT_CONFIG`, where the option is unset, so every case here
 * sets it deliberately — without that this option would be invisible to the whole suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { groupEventsByDay } from '../src/utils/events';

/** Wednesday 2026-06-17. Mid-week and mid-month, clear of every boundary the card draws. */
const TODAY = '2026-06-17';
const TOMORROW = '2026-06-18';
const DAY_AFTER = '2026-06-19';

/** Before a 10:00 expiry. */
const AT_0900 = new Date('2026-06-17T09:00:00.000Z');

/** After it, and still comfortably clear of midnight either side. */
const AT_1100 = new Date('2026-06-17T11:00:00.000Z');

/**
 * An all-day event, with iCal's exclusive end.
 *
 * @param summary Event title
 * @param start First day it covers
 * @param endExclusive The day after the last day it covers
 * @returns The event
 */
function allDay(summary: string, start: string, endExclusive: string): Types.CalendarEventData {
  return {
    summary,
    start: { date: start },
    end: { date: endExclusive },
    _entityId: 'calendar.waste',
  };
}

/**
 * Group a fixture and return the real summaries that survived.
 *
 * Empty-day placeholders are dropped: a card the filter has emptied pads the window with
 * *No upcoming events* notices, which are not events and would otherwise read as several.
 *
 * @param events Events to group
 * @param entity The calendar's own settings
 * @param overrides Card configuration beyond the defaults
 * @returns The surviving summaries, in day order
 */
function render(
  events: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig>,
  overrides: Partial<Types.Config> = {},
): string[] {
  const config = buildConfig({
    entities: [{ entity: 'calendar.waste', ...entity }],
    days_to_show: 5,
    ...overrides,
  } as Partial<Types.Config>);

  const stamped = events.map((event) => ({
    ...event,
    _matchedConfig: { entity: 'calendar.waste', ...entity } as Types.EntityConfig,
  }));

  return groupEventsByDay(stamped, config, true, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => event.summary ?? '');
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The defect the option's **default** fixes, which is separate from the option itself.
 *
 * Reported during review of this branch. `show_past_events: false` hid every timed event
 * that had ended and left finished **all-day** events on the card indefinitely, because
 * all-day events were exempt from the past test by construction. From a user's point of
 * view that is simply wrong: an event that finished last Saturday is past, whatever shape
 * its dates take.
 *
 * It is invisible at the default `start_date`, which is why it shipped: the window filter
 * requires `endDate >= referenceStart`, so with the window opening today a finished all-day
 * event is dropped for being outside the window rather than for being past, and the two
 * reasons cannot be told apart. Only a window reaching **backwards** separates them —
 * `start_date: 'today-7'`, or `start_of_week` read mid-week, which the start-date docs
 * actively recommend. Every case below therefore uses one, and the timed control proves the
 * window itself is not what hides the event.
 *
 * The fix is the same instant `allday_expires_at` names, defaulted: an all-day event is
 * past at midnight after its last day.
 */
describe('a finished all-day event is past, with no option set', () => {
  /** Saturday 13 June, four days before the frozen Wednesday. */
  const lastSaturday = (): Types.CalendarEventData[] => [
    allDay('Disneyland', '2026-06-13', '2026-06-14'),
  ];

  /** A window reaching back a week, which is the only thing that exposes this. */
  const BACKWARDS = { start_date: '2026-06-10', days_to_show: 12 } as Partial<Types.Config>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_1100);
  });

  it('hides it', () => {
    expect(render(lastSaturday(), {}, BACKWARDS)).toEqual([]);
  });

  /**
   * The denominator, and the assertion that makes the one above mean something. The event
   * is inside the window — it renders the moment past events are shown — so its absence is
   * the past test doing its job rather than the window excluding it.
   */
  it('control: the same event is inside the window', () => {
    expect(render(lastSaturday(), {}, { ...BACKWARDS, show_past_events: true })).toEqual([
      'Disneyland',
    ]);
  });

  /**
   * The second control, and the one that states the inconsistency the report was about: a
   * timed event on the same past day was already hidden. Before the fix these two answered
   * differently, side by side, on the same card.
   */
  it('control: a timed event on that same day was already hidden', () => {
    const timed: Types.CalendarEventData[] = [
      {
        summary: 'Timed',
        start: { dateTime: '2026-06-13T09:00:00.000Z' },
        end: { dateTime: '2026-06-13T10:00:00.000Z' },
        _entityId: 'calendar.waste',
      },
    ];

    expect(render(timed, {}, BACKWARDS)).toEqual([]);
  });

  /**
   * The over-correction guard, and the reason the exemption existed in the first place.
   * `endDate` for an all-day event is local midnight at the *start* of its last day, so a
   * naive `endDate < now` retires today's event at 00:00:01. Midnight-after-the-last-day is
   * what keeps it up all day.
   */
  it('keeps today\u2019s all-day event, late in the day', () => {
    vi.setSystemTime(new Date('2026-06-17T23:30:00.000Z'));

    expect(render([allDay('Today', TODAY, TOMORROW)], {}, BACKWARDS)).toEqual(['Today']);
  });

  /** And retires it the moment that midnight passes, rather than at some later point. */
  it('retires it once midnight has passed', () => {
    vi.setSystemTime(new Date('2026-06-18T00:00:00.000Z'));

    expect(render([allDay('Today', TODAY, TOMORROW)], {}, BACKWARDS)).toEqual([]);
  });

  /** A multi-day event is judged on its last day, not its first. */
  it('keeps a multi-day event that is still running', () => {
    expect(render([allDay('Away', '2026-06-15', '2026-06-19')], {}, BACKWARDS)).toEqual(['Away']);
  });

  it('hides a multi-day event that finished yesterday', () => {
    expect(render([allDay('Away', '2026-06-14', '2026-06-17')], {}, BACKWARDS)).toEqual([]);
  });
});

describe('allday_expires_at: a single-day all-day event', () => {
  const bin = () => [allDay('Green bin', TODAY, TOMORROW)];

  describe('before the configured time', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(AT_0900);
    });

    it('is still showing', () => {
      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual(['Green bin']);
    });
  });

  describe('after the configured time', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(AT_1100);
    });

    it('is gone', () => {
      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual([]);
    });

    /**
     * The denominator for every expiry case. Today's all-day event is *never* dropped
     * without this option, so an empty result above is the option working rather than the
     * fixture falling outside the window.
     */
    it('control: unset, the same event survives the same instant', () => {
      expect(render(bin(), {})).toEqual(['Green bin']);
    });

    /**
     * The second denominator, and the one a "does it still show?" assertion cannot supply:
     * an event that was never eligible for expiry proves the filter is reading the clock
     * rather than dropping the calendar wholesale.
     */
    it("control: tomorrow's event is untouched", () => {
      const both = [...bin(), allDay('Paper bin', TOMORROW, DAY_AFTER)];

      expect(render(both, { allday_expires_at: '10:00' })).toEqual(['Paper bin']);
    });

    it('expires exactly at the configured minute, not a minute before', () => {
      vi.setSystemTime(new Date('2026-06-17T09:59:59.999Z'));
      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual(['Green bin']);

      vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));
      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual([]);
    });
  });
});

describe('allday_expires_at: which day it reads', () => {
  /**
   * A three-day all-day event, on the morning of its **first** day, past the expiry time.
   *
   * The property under test is that expiry follows the event's last day, so this must
   * still be showing. Reading the start date instead — the obvious simplification, since
   * `startDate` is right there in the same scope — retires a three-day event on its first
   * morning, and only a fixture spanning more than one day can tell the two apart.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_1100);
  });

  it('keeps a multi-day event until the morning of its last day', () => {
    const trip = [allDay('Away', TODAY, '2026-06-20')];

    expect(render(trip, { allday_expires_at: '10:00' })).toEqual(['Away']);
  });

  it('retires it once that last morning is past', () => {
    vi.setSystemTime(new Date('2026-06-19T11:00:00.000Z'));

    const trip = [allDay('Away', TODAY, '2026-06-20')];

    expect(render(trip, { allday_expires_at: '10:00', split_multiday_events: false })).toEqual([]);
  });

  /**
   * Split into per-day segments, each segment carries its own last day, so the days
   * already past retire and the rest stay. This is the shape the waste feed actually
   * takes once a collection spans a weekend.
   */
  it('retires split segments one day at a time', () => {
    vi.setSystemTime(new Date('2026-06-18T11:00:00.000Z'));

    const trip = [allDay('Away', TODAY, '2026-06-20')];
    const kept = render(trip, { allday_expires_at: '10:00', split_multiday_events: true });

    // 17th and 18th are past their 10:00; the 19th is not.
    expect(kept).toEqual(['Away']);
  });

  it('control: unsplit and unfiltered, the same event shows across the window', () => {
    vi.setSystemTime(new Date('2026-06-19T11:00:00.000Z'));

    const trip = [allDay('Away', TODAY, '2026-06-20')];

    expect(render(trip, { split_multiday_events: false })).toEqual(['Away']);
  });
});

describe('allday_expires_at: what it deliberately does not touch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_1100);
  });

  /**
   * With past events shown, this option has nothing to do. It decides *when* an all-day
   * event becomes past; `show_past_events` decides whether past events are drawn at all,
   * and an option that hid events the card was explicitly asked to show would be a second
   * visibility rule contradicting the first.
   */
  it('shows an expired event anyway when past events are shown', () => {
    const bin = [allDay('Green bin', TODAY, TOMORROW)];

    expect(render(bin, { allday_expires_at: '10:00' }, { show_past_events: true })).toEqual([
      'Green bin',
    ]);
  });

  /** Timed events have an end instant and already expire; this option is not for them. */
  it('leaves a timed event to its own end time', () => {
    const meeting: Types.CalendarEventData[] = [
      {
        summary: 'Standup',
        start: { dateTime: `${TODAY}T13:00:00.000Z` },
        end: { dateTime: `${TODAY}T14:00:00.000Z` },
        _entityId: 'calendar.waste',
      },
    ];

    // 13:00 is still ahead of the 11:00 clock, and a 10:00 all-day expiry must not reach it.
    expect(render(meeting, { allday_expires_at: '10:00' })).toEqual(['Standup']);
  });

  /**
   * The same rule, one layer down, and the case that made it a real defect rather than a
   * tidiness point.
   *
   * `splitMultiDayEvent` rewrites the **middle** days of a *timed* multi-day event as
   * `start: { date }` segments, so they read as all-day to every later test — including
   * this option's. A three-day conference therefore lost its middle day at 10:00 on a
   * calendar configured for bin collections, while the event was still in progress. The
   * event did not vanish, it lost a day out of its middle, which reads as a data problem
   * rather than a configuration one.
   *
   * The **default** is correct for these segments and must stay: midnight after the
   * segment's own day is exactly when a middle day stops being today. Only an explicit
   * time misfires, which is why nothing caught it — the option is unset in `DEFAULT_CONFIG`.
   *
   * The genuinely all-day counterpart is pinned above by *retires split segments one day at
   * a time*, and that is the behaviour a broader fix would break: exempting every
   * `_isMultiDaySegment` would stop the waste feed retiring at all once a collection spans
   * a weekend. The distinction is the segment's **origin**, not its shape.
   */
  it('leaves the middle day of a split timed event alone', () => {
    // Yesterday 09:00 through tomorrow 17:00, so today is a middle segment.
    const conference: Types.CalendarEventData[] = [
      {
        summary: 'Conference',
        start: { dateTime: '2026-06-16T09:00:00.000Z' },
        end: { dateTime: `${TOMORROW}T17:00:00.000Z` },
        _entityId: 'calendar.waste',
      },
    ];

    const entity = { allday_expires_at: '10:00', split_multiday_events: true };

    // Today's middle segment and tomorrow's closing segment. Yesterday's is outside the
    // window, which opens today.
    expect(render(conference, entity)).toEqual(['Conference', 'Conference']);
  });

  it('control: the same split event with no expiry set keeps the same two days', () => {
    // Without this, the assertion above cannot tell "the expiry left it alone" from "the
    // window or the splitter never produced it".
    const conference: Types.CalendarEventData[] = [
      {
        summary: 'Conference',
        start: { dateTime: '2026-06-16T09:00:00.000Z' },
        end: { dateTime: `${TOMORROW}T17:00:00.000Z` },
        _entityId: 'calendar.waste',
      },
    ];

    expect(render(conference, { split_multiday_events: true })).toEqual([
      'Conference',
      'Conference',
    ]);
  });

  /**
   * Per-calendar, and only this calendar. The card's other calendars keep their all-day
   * events, which is the whole reason the option is not card-level: a household calendar's
   * birthdays should not vanish at 10:00 because the bin feed does.
   */
  it('leaves another calendar\u2019s all-day events alone', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.waste', allday_expires_at: '10:00' }, 'calendar.family'],
      days_to_show: 5,
    } as Partial<Types.Config>);

    const events: Types.CalendarEventData[] = [
      {
        ...allDay('Green bin', TODAY, TOMORROW),
        _matchedConfig: {
          entity: 'calendar.waste',
          allday_expires_at: '10:00',
        } as Types.EntityConfig,
      },
      {
        summary: 'Birthday',
        start: { date: TODAY },
        end: { date: TOMORROW },
        _entityId: 'calendar.family',
        _matchedConfig: { entity: 'calendar.family' } as Types.EntityConfig,
      },
    ];

    const rendered = groupEventsByDay(events, config, true, 'en')
      .flatMap((day) => day.events)
      .map((event) => event.summary);

    expect(rendered).toEqual(['Birthday']);
  });
});

describe('allday_expires_at: values it accepts and values it refuses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_1100);
  });

  const bin = () => [allDay('Green bin', TODAY, TOMORROW)];

  it.each(['10:00', '10:00:00', ' 10:00 ', '9:30'])('%s expires the event', (value) => {
    expect(render(bin(), { allday_expires_at: value })).toEqual([]);
  });

  it.each(['23:59', '11:01'])('%s has not come round yet at 11:00', (value) => {
    expect(render(bin(), { allday_expires_at: value })).toEqual(['Green bin']);
  });

  /**
   * A typo falls back to the default — the principle `resolveEventType` follows, adapted to
   * an option whose absent state is no longer "never". The card behaves as though the key
   * were not there, rather than silently emptying a calendar because someone wrote `10am`.
   *
   * The fixture is today's event, so falling back to midnight leaves it showing; the
   * default's own behaviour is pinned separately in the first describe block.
   */
  it.each(['10am', '24:00', '10:60', '10', 'morning', '', '1000'])(
    '%s falls back to the default',
    (value) => {
      expect(render(bin(), { allday_expires_at: value })).toEqual(['Green bin']);
    },
  );

  it('midnight is a real value, not an absent one', () => {
    // `00:00` is falsy as a time-of-day in every representation that stores it as a number,
    // which is the shape of bug that would make it silently mean "unset". At 11:00 on the
    // event's own day, midnight has passed, so it must expire.
    expect(render(bin(), { allday_expires_at: '00:00' })).toEqual([]);
  });
});
