/**
 * `days_of_week` restricts one calendar to weekdays or to weekends.
 *
 * The request behind it (#225) is a school-holidays calendar whose entries run through the
 * weekend, on a card that must keep showing every *other* calendar's weekend events. That
 * is the whole reason the option is per-calendar and cannot be a narrower date window: the
 * window belongs to the card, and narrowing it would take the weekend away from everyone.
 *
 * The property this file exists to pin is that the filter reads the **display date** — the
 * day the row lands on — and not the event's own `start`. Those are the same date for an
 * ordinary event and differ for a multi-day one in two distinct ways, so there are three
 * cases and no two of them are covered by the same reasoning:
 *
 * 1. **Ordinary event.** Start and display date coincide; nothing distinguishes the two
 *    readings, and this is the case a naive implementation gets right.
 * 2. **Split multi-day event.** `split_multiday_events: true` turns one event into a
 *    segment per day, each with its own start, so *reading the start already works* —
 *    which is exactly why this case cannot substitute for the third.
 * 3. **Unsplit multi-day event, clamped.** With `split_multiday_events: false` an event
 *    that began before the window shows once, on the window's **first day**, because
 *    `resolveDisplayDate` clamps it there. Its own start names a day the card is not
 *    drawing — possibly weeks earlier, possibly a different weekday — so a start-date
 *    reading hides the wrong row or fails to hide the right one.
 *
 * Case 3 is the falsifier. Rewriting the filter to read `startDate` leaves cases 1 and 2
 * green and fails only that one, which is why it carries an explicit control asserting the
 * two dates genuinely disagree rather than assuming the fixture arranged it.
 *
 * The suite is built from `DEFAULT_CONFIG`, where `days_of_week` is unset and every day
 * qualifies, so every case here sets it deliberately — without that this option would be
 * invisible to the whole suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { groupEventsByDay } from '../src/utils/events';

/**
 * Monday 2026-06-15 at 09:00 UTC.
 *
 * A **Monday** deliberately: the window's first day is then a weekday, so a `weekdays`
 * filter cannot pass merely by keeping everything the window opens on. Mid-June, mid-month
 * and clear of any month or year boundary.
 */
const MONDAY = new Date('2026-06-15T09:00:00.000Z');

/** The seven days from that Monday, so a fixture can name a weekday rather than a number. */
const DATES = {
  monday: '2026-06-15',
  tuesday: '2026-06-16',
  wednesday: '2026-06-17',
  thursday: '2026-06-18',
  friday: '2026-06-19',
  saturday: '2026-06-20',
  sunday: '2026-06-21',
  nextMonday: '2026-06-22',
  nextTuesday: '2026-06-23',
} as const;

/** An all-day event. Home Assistant returns these with `date`, and an exclusive end. */
function allDay(summary: string, start: string, endExclusive: string): Types.CalendarEventData {
  return {
    summary,
    start: { date: start },
    end: { date: endExclusive },
    _entityId: 'calendar.holidays',
  };
}

/** A timed event at midday, so no fixture sits near a local midnight by accident. */
function timed(summary: string, date: string): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `${date}T12:00:00.000Z` },
    end: { dateTime: `${date}T13:00:00.000Z` },
    _entityId: 'calendar.holidays',
  };
}

/**
 * Stamp each event with the calendar settings production would have stamped on it.
 *
 * `processEvents` writes `_matchedConfig` on the fetch path, and `groupEventsByDay` reads
 * the stamp rather than re-deriving it — so a fixture that skips this is testing a code
 * path the card never takes. Kept explicit rather than hidden in a helper default so that
 * the stamp is visible in each case.
 */
function stamped(
  events: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig>,
): Types.CalendarEventData[] {
  return events.map((event) => ({
    ...event,
    _matchedConfig: { entity: 'calendar.holidays', ...entity } as Types.EntityConfig,
  }));
}

/** The date key `groupEventsByDay` buckets a day under, read back off its timestamp. */
function dateKeyOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Group a fixture and return what survived, keyed by day.
 *
 * **Real events only.** A card the filter has emptied falls through to the empty-day
 * padding and renders a *No upcoming events* placeholder on every day of the window, so a
 * helper that read summaries indiscriminately would report nine events where the answer is
 * none — and the two cases asserting that a calendar is filtered away entirely would both
 * fail against correct behavior. Placeholders are reached through {@link placeholderDays}
 * instead, which keeps "no events" and "an empty-day notice" distinguishable.
 *
 * @param events Events to group
 * @param entity The calendar's own settings
 * @param overrides Card configuration beyond the defaults
 * @param hassLocale Home Assistant locale, which decides which days are the weekend
 * @returns Each rendered day's date key mapped to the real summaries on it
 */
function render(
  events: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig>,
  overrides: Partial<Types.Config> = {},
  hassLocale?: { language?: string },
): Record<string, string[]> {
  const config = buildConfig({
    entities: [{ entity: 'calendar.holidays', ...entity }],
    days_to_show: 9,
    ...overrides,
  } as Partial<Types.Config>);

  const days = groupEventsByDay(stamped(events, entity), config, true, 'en', 'list', hassLocale);

  const result: Record<string, string[]> = {};
  for (const day of days) {
    result[dateKeyOf(day.timestamp)] = day.events
      .filter((event) => !event._isEmptyDay)
      .map((event) => event.summary ?? '');
  }
  return result;
}

/**
 * The same grouping, reduced to the days carrying an empty-day placeholder and its text.
 *
 * @param events Events to group
 * @param entity The calendar's own settings
 * @param overrides Card configuration beyond the defaults
 * @returns Each placeholder day's date key mapped to the notice it shows
 */
function placeholderDays(
  events: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig>,
  overrides: Partial<Types.Config> = {},
): Record<string, string> {
  const config = buildConfig({
    entities: [{ entity: 'calendar.holidays', ...entity }],
    days_to_show: 9,
    ...overrides,
  } as Partial<Types.Config>);

  const days = groupEventsByDay(stamped(events, entity), config, true, 'en');

  const result: Record<string, string> = {};
  for (const day of days) {
    const placeholder = day.events.find((event) => event._isEmptyDay);
    if (placeholder) result[dateKeyOf(day.timestamp)] = placeholder.summary ?? '';
  }
  return result;
}

/** Every real summary the card rendered, in day order, flattened. */
function summaries(rendered: Record<string, string[]>): string[] {
  return Object.keys(rendered)
    .sort()
    .flatMap((key) => rendered[key]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MONDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('days_of_week: the ordinary case', () => {
  const week = [
    timed('Friday', DATES.friday),
    timed('Saturday', DATES.saturday),
    timed('Sunday', DATES.sunday),
    timed('Monday', DATES.nextMonday),
  ];

  it('shows every day when the option is unset', () => {
    expect(summaries(render(week, {}))).toEqual(['Friday', 'Saturday', 'Sunday', 'Monday']);
  });

  it('keeps only Monday to Friday under weekdays', () => {
    expect(summaries(render(week, { days_of_week: 'weekdays' }))).toEqual(['Friday', 'Monday']);
  });

  it('keeps only Saturday and Sunday under weekends', () => {
    expect(summaries(render(week, { days_of_week: 'weekends' }))).toEqual(['Saturday', 'Sunday']);
  });

  /**
   * The two values are exact complements, which is what makes the same
   * list-the-calendar-twice pattern `event_type` supports work for this option too: one
   * block each way styles weekday and weekend entries differently without losing a row or
   * showing one twice.
   */
  it('partitions the week between the two values', () => {
    const weekdays = summaries(render(week, { days_of_week: 'weekdays' }));
    const weekends = summaries(render(week, { days_of_week: 'weekends' }));

    expect([...weekdays, ...weekends].sort()).toEqual(summaries(render(week, {})).sort());
    expect(weekdays.filter((summary) => weekends.includes(summary))).toEqual([]);
  });

  /**
   * The control that stops every assertion above from passing on a filter that simply
   * drops this calendar. Without it, `[]` would satisfy "no weekend events".
   */
  it('control: an unfiltered calendar keeps its weekend events', () => {
    expect(summaries(render(week, {}))).toContain('Saturday');
  });
});

describe('days_of_week: a multi-day event, split', () => {
  /** Friday through Monday, covering both weekend days. All-day, so the end is exclusive. */
  const holiday = [allDay('Long weekend', DATES.friday, DATES.nextTuesday)];

  it('keeps the weekday segments and drops the weekend ones', () => {
    const rendered = render(holiday, { days_of_week: 'weekdays', split_multiday_events: true });

    expect(Object.keys(rendered).sort()).toEqual([DATES.friday, DATES.nextMonday].sort());
  });

  it('keeps the weekend segments and drops the weekday ones', () => {
    const rendered = render(holiday, { days_of_week: 'weekends', split_multiday_events: true });

    expect(Object.keys(rendered).sort()).toEqual([DATES.saturday, DATES.sunday]);
  });

  /**
   * The denominator. An unfiltered split covers all five days, so the two cases above are
   * genuinely dropping segments rather than describing a fixture that never had them.
   */
  it('control: unfiltered, the same event covers every day it spans', () => {
    const rendered = render(holiday, { split_multiday_events: true });

    expect(Object.keys(rendered).sort()).toEqual(
      [DATES.friday, DATES.saturday, DATES.sunday, DATES.nextMonday].sort(),
    );
  });
});

describe('days_of_week: a multi-day event left whole, clamped to the window', () => {
  /**
   * The case that separates a display-date filter from a start-date one — and the two
   * fixtures below are chosen so that the two readings actually *disagree*, which is a
   * property the fixture has to supply rather than one the scenario gives for free.
   *
   * An unsplit event already in progress renders **once**, on the window's first day,
   * because `resolveDisplayDate` clamps it to `referenceStart`. So the readings diverge
   * only when the event's own start and the window's first day fall on opposite sides of
   * the weekday/weekend line. One fixture cannot arrange that for both windows, so there
   * are two, one per direction:
   *
   * - `startedOnAWeekend` begins on a Saturday and is drawn on a Monday. Under `weekdays`
   *   a display-date reading keeps it and a start-date reading drops it.
   * - `startedOnAWeekday` begins on a Wednesday and is drawn on a Saturday, once the
   *   window is moved. The same two readings swap verdicts.
   *
   * The first draft of this block used a Wednesday start with a Monday window — two
   * weekdays — so both readings agreed and every assertion passed against a filter reading
   * the wrong date. Mutating the source to `startDate` is what exposed it, and is the
   * check to repeat before trusting any change here.
   */
  const startedOnAWeekend = [allDay('Summer holidays', '2026-06-13', '2026-07-01')];
  const startedOnAWeekday = [allDay('Field trip', '2026-06-10', '2026-07-01')];

  it('control: each fixture is drawn on a weekday it did not start on', () => {
    // Saturday 13 June, drawn on Monday 15 June.
    expect(new Date('2026-06-13T00:00:00Z').getUTCDay(), 'fixture starts on a Saturday').toBe(6);
    expect(Object.keys(render(startedOnAWeekend, { split_multiday_events: false }))).toEqual([
      DATES.monday,
    ]);

    // Wednesday 10 June, drawn on Saturday 20 June once the window moves.
    expect(new Date('2026-06-10T00:00:00Z').getUTCDay(), 'fixture starts on a Wednesday').toBe(3);
    expect(
      Object.keys(
        render(startedOnAWeekday, { split_multiday_events: false }, { start_date: DATES.saturday }),
      ),
    ).toEqual([DATES.saturday]);
  });

  it('keeps a weekend-starting event, because the day it is drawn on is a Monday', () => {
    expect(
      summaries(
        render(startedOnAWeekend, { days_of_week: 'weekdays', split_multiday_events: false }),
      ),
    ).toEqual(['Summer holidays']);
  });

  it('drops that same event under weekends, though it started on one', () => {
    expect(
      summaries(
        render(startedOnAWeekend, { days_of_week: 'weekends', split_multiday_events: false }),
      ),
    ).toEqual([]);
  });

  /**
   * The mirror image, and the half a start-date reading gets wrong in the other direction:
   * a weekday-starting event drawn on a Saturday must be kept by `weekends` and dropped by
   * `weekdays` — the opposite verdict to the pair above, on an event whose start has not
   * moved.
   */
  it('follows the window when the first day is a weekend', () => {
    const saturdayWindow = { start_date: DATES.saturday };

    expect(
      summaries(
        render(
          startedOnAWeekday,
          { days_of_week: 'weekends', split_multiday_events: false },
          saturdayWindow,
        ),
      ),
    ).toEqual(['Field trip']);

    expect(
      summaries(
        render(
          startedOnAWeekday,
          { days_of_week: 'weekdays', split_multiday_events: false },
          saturdayWindow,
        ),
      ),
    ).toEqual([]);
  });
});

describe('days_of_week: what happens to the day that is left empty', () => {
  /**
   * Filtering happens before the empty-day padding, which is what makes this fall out
   * rather than needing a rule of its own — and the two settings genuinely differ, so the
   * behavior is worth pinning rather than describing.
   */
  const week = [timed('Saturday', DATES.saturday), timed('Monday', DATES.nextMonday)];

  it('leaves the day out entirely when empty days are hidden', () => {
    const rendered = render(week, { days_of_week: 'weekdays' }, { show_empty_days: false });

    expect(Object.keys(rendered)).toEqual([DATES.nextMonday]);
  });

  it('shows the day with its empty text when empty days are shown', () => {
    const rendered = render(week, { days_of_week: 'weekdays' }, { show_empty_days: true });

    expect(Object.keys(rendered)).toContain(DATES.saturday);
    expect(rendered[DATES.saturday], 'the filtered event came back').toEqual([]);
  });

  /**
   * The placeholder is created after grouping and carries no `_matchedConfig`, so it is
   * not itself subject to the filter — a Saturday emptied by `weekdays` still gets one,
   * with the card's own notice on it rather than a blank row.
   */
  it('control: the placeholder is not filtered away in turn', () => {
    const placeholders = placeholderDays(
      week,
      { days_of_week: 'weekdays' },
      { show_empty_days: true },
    );

    expect(Object.keys(placeholders)).toContain(DATES.saturday);
    expect(placeholders[DATES.saturday]).toBe('No upcoming events');
  });

  /**
   * The denominator for both. Unfiltered, that Saturday carries a real event and no
   * placeholder, so the two cases above describe a day the filter emptied rather than one
   * that was empty all along.
   */
  it('control: unfiltered, the same Saturday carries an event and no placeholder', () => {
    expect(render(week, {}, { show_empty_days: true })[DATES.saturday]).toEqual(['Saturday']);
    expect(Object.keys(placeholderDays(week, {}, { show_empty_days: true }))).not.toContain(
      DATES.saturday,
    );
  });
});

describe('days_of_week: it is one calendar\u2019s setting, not the card\u2019s', () => {
  /**
   * The request this option exists for. Two calendars, one filtered and one not, on the
   * same card: the school calendar loses its weekend, the family calendar keeps it.
   */
  it('leaves other calendars alone', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.holidays', days_of_week: 'weekdays' },
        { entity: 'calendar.family' },
      ],
      days_to_show: 9,
    } as Partial<Types.Config>);

    const events: Types.CalendarEventData[] = [
      {
        ...timed('School Saturday', DATES.saturday),
        _matchedConfig: {
          entity: 'calendar.holidays',
          days_of_week: 'weekdays',
        } as Types.EntityConfig,
      },
      {
        summary: 'Family Saturday',
        start: { dateTime: `${DATES.saturday}T14:00:00.000Z` },
        end: { dateTime: `${DATES.saturday}T15:00:00.000Z` },
        _entityId: 'calendar.family',
        _matchedConfig: { entity: 'calendar.family' } as Types.EntityConfig,
      },
    ];

    const days = groupEventsByDay(events, config, true, 'en');
    const rendered = days.flatMap((day) => day.events.map((event) => event.summary));

    expect(rendered).toEqual(['Family Saturday']);
  });
});

describe('days_of_week: a value the union does not name', () => {
  /**
   * A typo shows too much, never too little — the principle `resolveEventType` follows.
   * The alternative is a calendar that silently empties because someone wrote `weekday`.
   */
  it.each(['weekday', 'all', '', 'WEEKDAYS'])('%s filters nothing', (value) => {
    const week = [timed('Saturday', DATES.saturday), timed('Monday', DATES.nextMonday)];

    expect(summaries(render(week, { days_of_week: value as Types.DaysOfWeekFilter }))).toEqual([
      'Saturday',
      'Monday',
    ]);
  });
});

/**
 * Which days the filter calls the weekend.
 *
 * The option's two values name a partition of the week, and where the cut falls is not a
 * constant: CLDR puts it after Thursday in the Friday–Saturday regions and before Sunday
 * alone in India. Until v5 the card cut it after Friday for everybody, so an Israeli
 * household asking for weekends got the two days it works, and asking for weekdays got
 * the two it rests.
 *
 * The card reads Home Assistant's language for this, not its own `language` option — the
 * card option picks a translation and doubles as a fallback for the Home Assistant
 * languages the card cannot translate, so it says nothing about where the user lives.
 */
describe('days_of_week: where the weekend falls', () => {
  const week = [
    timed('Thursday', DATES.thursday),
    timed('Friday', DATES.friday),
    timed('Saturday', DATES.saturday),
    timed('Sunday', DATES.sunday),
  ];

  it.each([
    { name: 'no locale, as before hass arrives', locale: undefined, kept: ['Saturday', 'Sunday'] },
    { name: 'de', locale: { language: 'de' }, kept: ['Saturday', 'Sunday'] },
    { name: 'he (Friday and Saturday)', locale: { language: 'he' }, kept: ['Friday', 'Saturday'] },
    { name: 'fa (Friday alone)', locale: { language: 'fa' }, kept: ['Friday'] },
    { name: 'hi (Sunday alone)', locale: { language: 'hi' }, kept: ['Sunday'] },
  ])('keeps $kept for weekends under $name', ({ locale, kept }) => {
    expect(summaries(render(week, { days_of_week: 'weekends' }, {}, locale))).toEqual(kept);
  });

  it.each([
    {
      name: 'no locale',
      locale: undefined,
      kept: ['Thursday', 'Friday'],
    },
    { name: 'he', locale: { language: 'he' }, kept: ['Thursday', 'Sunday'] },
    { name: 'hi', locale: { language: 'hi' }, kept: ['Thursday', 'Friday', 'Saturday'] },
  ])('keeps $kept for weekdays under $name', ({ locale, kept }) => {
    // The complement of the rows above on the same four-day fixture. Both halves are
    // asserted because a filter that answered the same set for either value would satisfy
    // one of them and is the failure this option cannot afford.
    expect(summaries(render(week, { days_of_week: 'weekdays' }, {}, locale))).toEqual(kept);
  });
});
