import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Presentation from '../src/rendering/presentation';

/**
 * The empty-day boundary is a local calendar date, under real time zones.
 *
 * Excluded from the `unit` project and run three times instead — Berlin, Sydney and
 * New York (see `vitest.config.mjs`). The rest of the suite pins `TZ: 'UTC'`, and UTC
 * is the one zone where this cannot be tested at all: it has no transitions, so every
 * day is exactly 24 hours, and an implementation that measured "a day" as a fixed
 * 86,400,000 ms would be unconditionally correct there.
 *
 * ## What each zone is the only one able to see
 *
 * Honest accounting, because claiming a zone is uniquely required without planting the
 * failure in the other two is the trap `AGENTS.md` warns about:
 *
 * - **Berlin** and **Sydney** are both *ahead* of UTC and are the hemisphere pair. Each
 *   contributes its own real 23-hour and 25-hour days, in opposite months. Neither is
 *   uniquely required for the date comparison itself.
 * - **New York** is the only one *behind* UTC, and it is genuinely required. An
 *   implementation that parsed the placeholder's `YYYY-MM-DD` as UTC midnight rather
 *   than local midnight still lands on the right local calendar day in Berlin and
 *   Sydney, and lands a day early across the whole of the Americas. `parseAllDayDate`
 *   exists for exactly that reason and this file is what would notice it being
 *   replaced with `new Date(dateString)`.
 *
 * ## The oracle is independent of the implementation
 *
 * `buildEventPresentation` decides today from `getFullYear`/`getMonth`/`getDate` and
 * builds the placeholder's date with `new Date(y, m - 1, d)`. Deriving the expectation
 * from those same getters would restate the implementation instead of checking it, so
 * the expected answer here comes from `Intl.DateTimeFormat` with an explicit
 * `timeZone`, compared as `YYYY-MM-DD` strings. Two different mechanisms — a formatter
 * and a constructor — rather than one mechanism read twice.
 */

/** The zone this project is running under, read from the environment rather than assumed. */
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Formatters are built once. Constructing an `Intl.DateTimeFormat` per call is the
 * expensive part of this file by a wide margin — an earlier draft of these helpers
 * scanned minute by minute and took 8-29 seconds per test.
 */
const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PARTS_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * The local calendar date an instant falls in, via the formatter rather than the getters.
 *
 * `en-CA` renders ISO-ordered `YYYY-MM-DD`, which makes plain string comparison a correct
 * calendar-date comparison and keeps the oracle free of any date arithmetic of its own.
 */
function localDateKey(instant: Date): string {
  return DATE_FMT.format(instant);
}

/**
 * The zone's UTC offset at a given instant, in milliseconds.
 *
 * Read by formatting the instant into the zone's own wall-clock fields and re-reading
 * those fields as though they were UTC. The difference is the offset, and it comes from
 * the formatter rather than from `getTimezoneOffset`, keeping the oracle independent.
 */
function offsetMs(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const { type, value } of PARTS_FMT.formatToParts(instant)) parts[type] = value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // A zone at +00:00 on a 24-hour clock renders midnight as `24`, not `00`.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Midnight local to the running zone at the start of `dateKey`, found without local
 * constructors.
 *
 * Two corrections rather than a scan: guess the instant from the naive UTC reading,
 * re-read the offset there, and correct. The second pass is what makes a spring-forward
 * date land correctly, since the offset at the guess differs from the offset at the
 * answer. The final walk-back is the skipped-hour case — on a spring-forward date the
 * nominal midnight may not exist, so the true first instant of the day is taken.
 */
const MIDNIGHT_CACHE = new Map<string, number>();

function localMidnight(dateKey: string): Date {
  const cached = MIDNIGHT_CACHE.get(dateKey);
  if (cached !== undefined) return new Date(cached);

  const naive = Date.parse(`${dateKey}T00:00:00.000Z`);
  let guess = naive - offsetMs(new Date(naive));
  guess = naive - offsetMs(new Date(guess));

  // Correct onto the first instant that actually reports this local date.
  if (localDateKey(new Date(guess)) !== dateKey) {
    for (let step = -2; step <= 2; step++) {
      const candidate = guess + step * 3_600_000;
      if (localDateKey(new Date(candidate)) === dateKey) {
        guess = candidate;
        break;
      }
    }
  }
  while (localDateKey(new Date(guess - 1)) === dateKey) guess -= 60_000;
  while (localDateKey(new Date(guess)) !== dateKey) guess += 60_000;

  MIDNIGHT_CACHE.set(dateKey, guess);
  return new Date(guess);
}

/** The local date `days` after `dateKey`, resolved through the formatter. */
function shiftDate(dateKey: string, days: number): string {
  return localDateKey(
    new Date(localMidnight(dateKey).getTime() + days * 24 * 3_600_000 + 43_200_000),
  );
}

/** How many hours long the local day `dateKey` actually is. 23 and 25 are the interesting ones. */
function dayLengthHours(dateKey: string): number {
  const start = localMidnight(dateKey).getTime();
  return (localMidnight(shiftDate(dateKey, 1)).getTime() - start) / 3_600_000;
}

/**
 * Every local date in `year` that is not 24 hours long — the zone's own real transitions.
 *
 * Found by sampling the offset at each day's UTC noon and noting where it changes, which
 * is one formatter call per day rather than a walk over every minute.
 */
const TRANSITION_CACHE = new Map<number, string[]>();

function transitionDates(year: number): string[] {
  const cached = TRANSITION_CACHE.get(year);
  if (cached) return cached;

  const found: string[] = [];
  const start = Date.UTC(year - 1, 11, 25, 12);
  const end = Date.UTC(year + 1, 0, 7, 12);
  let previous = offsetMs(new Date(start));

  for (let t = start + 24 * 3_600_000; t <= end; t += 24 * 3_600_000) {
    const current = offsetMs(new Date(t));
    if (current !== previous) {
      // The change happened during one of these two UTC-noon-separated local days; the
      // shorter/longer day is the one whose own length is not 24 hours.
      for (const key of [localDateKey(new Date(t - 24 * 3_600_000)), localDateKey(new Date(t))]) {
        if (!found.includes(key) && dayLengthHours(key) !== 24) found.push(key);
      }
      previous = current;
    }
  }

  const inYear = found.filter((key) => key.startsWith(String(year)));
  TRANSITION_CACHE.set(year, inYear);
  return inYear;
}

function placeholderOn(dateKey: string): Types.CalendarEventData {
  return {
    summary: 'No events',
    start: { date: dateKey },
    end: { date: dateKey },
    _entityId: '_empty_day_',
    _isEmptyDay: true,
    location: '',
  };
}

function classify(dateKey: string, now: Date): boolean {
  vi.setSystemTime(now);
  return Presentation.buildEventPresentation(placeholderOn(dateKey), buildConfig(), 'en')
    .isPastEvent;
}

/** What the oracle says: a displayed date is past once today's local date is later than it. */
function expected(dateKey: string, now: Date): boolean {
  return dateKey < localDateKey(now);
}

describe('empty-day classification under real time zones', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Without this the file would pass vacuously if it were ever run under UTC, proving
   * nothing while looking like three zones of coverage.
   */
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  it('finds two real transitions in this zone, one short day and one long', () => {
    const dates = transitionDates(2026);
    expect(dates).toHaveLength(2);
    expect(dates.map(dayLengthHours).sort()).toEqual([23, 25]);
  });

  /**
   * The core property, swept rather than sampled: for every placeholder date and every
   * instant, the class must agree with the formatter's calendar-date comparison.
   *
   * The window is centered on each of the zone's own transitions, so the 23-hour and
   * 25-hour days are both a placeholder date and a "today" in their own right.
   */
  it('agrees with an Intl calendar-date oracle across both transitions', () => {
    const mismatches: string[] = [];

    for (const transition of transitionDates(2026)) {
      const anchor = localMidnight(transition).getTime();

      // Three days either side of the transition, as placeholder dates.
      const dates: string[] = [];
      for (let d = -3; d <= 3; d++) {
        dates.push(localDateKey(new Date(anchor + d * 24 * 3_600_000 + 12 * 3_600_000)));
      }

      // "Now" every three hours across the same span, which lands inside the repeated
      // and skipped hours rather than stepping over them.
      for (let hours = -72; hours <= 96; hours += 3) {
        const now = new Date(anchor + hours * 3_600_000);
        for (const dateKey of dates) {
          const actual = classify(dateKey, now);
          if (actual !== expected(dateKey, now)) {
            mismatches.push(
              `${ZONE} date=${dateKey} now=${now.toISOString()} local=${localDateKey(now)} got=${actual}`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  /**
   * The exact edges of a real short and a real long day, named rather than swept, so a
   * failure says which boundary moved. A 23-hour day's last millisecond is still today,
   * and a 25-hour day's extra hour is still today — neither is a fixed-duration offset
   * from its own midnight.
   */
  it.each([23, 25])('holds today bright for the whole of a %s-hour day', (hours) => {
    const date = transitionDates(2026).find((d) => dayLengthHours(d) === hours)!;
    const start = localMidnight(date).getTime();
    const length = hours * 3_600_000;

    expect(classify(date, new Date(start))).toBe(false);
    expect(classify(date, new Date(start + length / 2))).toBe(false);
    expect(classify(date, new Date(start + length - 1))).toBe(false);

    // The next local midnight is the boundary, whatever the day's length was.
    expect(classify(date, new Date(start + length))).toBe(true);
    expect(classify(date, new Date(start + length + 1))).toBe(true);
  });

  it.each([23, 25])('dims the day before a %s-hour day and never the day after', (hours) => {
    const date = transitionDates(2026).find((d) => dayLengthHours(d) === hours)!;
    const start = localMidnight(date).getTime();
    const previous = localDateKey(new Date(start - 3_600_000));
    const next = localDateKey(new Date(start + (hours + 1) * 3_600_000));

    for (const now of [new Date(start), new Date(start + 3_600_000), new Date(start + 1)]) {
      expect(classify(previous, now)).toBe(true);
      expect(classify(date, now)).toBe(false);
      expect(classify(next, now)).toBe(false);
    }
  });

  /**
   * Ordinary dates well away from any transition, including — under New York — dates at
   * a negative UTC offset, where a UTC-midnight parse lands on the wrong calendar day.
   * Held at instants that straddle UTC midnight in both directions, which is where that
   * failure mode actually bites.
   */
  it.each(['2026-01-15', '2026-06-15', '2026-11-20'])(
    'classifies ordinary date %s by its own local day',
    (date) => {
      const start = localMidnight(date).getTime();

      for (const offsetHours of [0, 1, 6, 12, 18, 23]) {
        const now = new Date(start + offsetHours * 3_600_000);
        expect(classify(date, now), `${date} at +${offsetHours}h`).toBe(false);
        expect(localDateKey(now)).toBe(date);
      }

      // Every instant on the following local day dims it, including that day's first
      // millisecond, which under a negative offset is still "yesterday" in UTC.
      const nextKey = localDateKey(new Date(start + 36 * 3_600_000));
      const nextStart = localMidnight(nextKey).getTime();
      for (const offsetHours of [0, 6, 23]) {
        expect(classify(date, new Date(nextStart + offsetHours * 3_600_000))).toBe(true);
      }
      expect(classify(date, new Date(nextStart))).toBe(true);
    },
  );

  /**
   * A real all-day event and a placeholder on the same displayed date must not be
   * classified by the same arithmetic — that is the whole reason the empty branch is
   * separate. The real event's `end.date` is exclusive, so it ends the day *before* its
   * end date; the placeholder's equal start/end names the day it is drawn on.
   */
  it('does not apply the real all-day exclusive-end rule to a placeholder', () => {
    const today = localDateKey(new Date(localMidnight('2026-06-15').getTime()));
    vi.setSystemTime(new Date(localMidnight(today).getTime() + 12 * 3_600_000));

    const config = buildConfig();
    const realToday: Types.CalendarEventData = {
      summary: 'All-day today',
      start: { date: today },
      end: { date: localDateKey(new Date(localMidnight(today).getTime() + 36 * 3_600_000)) },
      _entityId: 'calendar.anna',
    };

    // Both are "today" and neither dims — but they reach that answer by different routes.
    expect(Presentation.buildEventPresentation(realToday, config, 'en').isPastEvent).toBe(false);
    expect(
      Presentation.buildEventPresentation(placeholderOn(today), config, 'en').isPastEvent,
    ).toBe(false);

    // The counterexample: run the placeholder through the real branch's subtraction and
    // today's own notice reads as yesterday. Asserted on the arithmetic directly so the
    // file records *why* the branch is separate rather than only that it is.
    const wrong = new Date(localMidnight(today).getTime());
    wrong.setDate(wrong.getDate() - 1);
    expect(new Date(localMidnight(today).getTime()) > wrong).toBe(true);
  });
});
