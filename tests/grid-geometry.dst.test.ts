import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import {
  MINUTES_PER_DAY,
  addDays,
  computeBannerPlacement,
  computeEventPlacement,
  computeNowLinePct,
  minutesFromMidnight,
  resolveBand,
  segmentMinutes,
  splitTimedEventByDay,
  startOfDay,
} from '../src/utils/grid';

/**
 * Time-grid geometry across DST transitions.
 *
 * Named `*.dst.test.ts`, so it runs three times — `Europe/Berlin`,
 * `Australia/Sydney`, `America/New_York` — and is excluded from the `unit` project,
 * which pins `TZ=UTC`. UTC has no transitions, which is exactly why the bug this file
 * pins is invisible there: under UTC the two ways of asking "how far into the day is
 * this?" give the same number every day of the year, so a wrong implementation passes.
 *
 * The bug is a one-line "simplification". These two look interchangeable:
 *
 * ```
 * d.getHours() * 60 + d.getMinutes()        // wall clock  — correct
 * (d - startOfDay(d)) / 60_000              // elapsed ms  — wrong
 * ```
 *
 * They agree on 363 days a year. On a spring-forward day the second is an hour short
 * for every instant after the transition, because that day only contains 23 hours of
 * elapsed time, so a 14:00 meeting is drawn at 13:00. On a fall-back day it is an hour
 * long. That is not a rounding artefact — it is a whole slot, in a view whose entire
 * purpose is putting events at the right height.
 *
 * This is not hypothetical. A widely-used HA calendar card surveyed while this module
 * was designed (`Uko/multiday-calendar-card`) places events with the elapsed-ms form
 * and draws its now-line with the wall-clock form, so on a transition day its line and
 * its events sit an hour apart. Cited as evidence that the bug is reachable in real
 * code rather than as criticism — the reason it survives there is the reason this file
 * exists here: a suite pinned to a single non-transitioning zone cannot see it.
 *
 * Transition days are **discovered at run time** rather than hardcoded, because the
 * northern and southern zones transition in opposite months and no single date is a
 * transition in all three. Every assertion below therefore runs against whatever the
 * running zone actually does.
 *
 * 🚨 No zone here is uniquely required: all three catch every mutation in this file,
 * and any zone observing DST would. The three exist because the harness already
 * provides them and because a southern-hemisphere zone is cheap insurance against a
 * hemisphere-dependent sign error of the kind `format.ts` once shipped.
 */

/**
 * Local days in `year` that do not contain 24 hours.
 *
 * @param year - Calendar year to scan
 * @returns One entry per transition day, with the direction it moved
 */
function transitionDays(year: number): Array<{ day: Date; hours: number; forward: boolean }> {
  const found: Array<{ day: Date; hours: number; forward: boolean }> = [];

  for (let month = 0; month < 12; month++) {
    for (let date = 1; date <= 31; date++) {
      const day = new Date(year, month, date);

      if (day.getMonth() !== month) {
        break;
      }

      const next = new Date(year, month, date + 1);
      const hours = (next.getTime() - day.getTime()) / 3_600_000;

      if (hours !== 24) {
        found.push({ day, hours, forward: hours < 24 });
      }
    }
  }

  return found;
}

const YEAR = 2026;
const TRANSITIONS = transitionDays(YEAR);
const SPRING = TRANSITIONS.filter((entry) => entry.forward);
const FALL = TRANSITIONS.filter((entry) => !entry.forward);

/** The elapsed-milliseconds form this module deliberately does not use. */
function elapsedMinutesFromMidnight(d: Date): number {
  return (d.getTime() - startOfDay(d).getTime()) / 60_000;
}

describe('the harness itself', () => {
  // Without this, a run under UTC would pass every assertion below while proving
  // nothing at all — the failure mode this whole file exists to prevent.
  it('runs under a zone that observes DST', () => {
    expect(new Date(YEAR, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(YEAR, 6, 1).getTimezoneOffset(),
    );
  });

  it('finds exactly two transitions in the year, one each way', () => {
    expect(TRANSITIONS).toHaveLength(2);
    expect(SPRING).toHaveLength(1);
    expect(FALL).toHaveLength(1);
  });

  it('sees a short day and a long day', () => {
    expect(SPRING[0].hours).toBe(23);
    expect(FALL[0].hours).toBe(25);
  });
});

describe('minutesFromMidnight reads the wall clock', () => {
  // The headline. If this ever fails, someone replaced the getters with a subtraction.
  it.each([6, 9, 14, 20, 23])(
    'reports local %d:00 as that hour on every transition day',
    (hour) => {
      for (const { day } of TRANSITIONS) {
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0);

        expect(minutesFromMidnight(at), `${hour}:00 on ${day.toDateString()}`).toBe(hour * 60);
      }
    },
  );

  // The falsifier, inline: this proves the assertions above can tell the two forms
  // apart. Without it, "wall clock is correct" would be a claim no case could refute.
  it('disagrees with the elapsed-milliseconds form after a transition', () => {
    for (const { day, forward } of TRANSITIONS) {
      const afternoon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 0);

      expect(minutesFromMidnight(afternoon)).toBe(840);
      expect(elapsedMinutesFromMidnight(afternoon)).toBe(forward ? 780 : 900);
      expect(elapsedMinutesFromMidnight(afternoon)).not.toBe(minutesFromMidnight(afternoon));
    }
  });

  // The control. On an ordinary day the two forms agree, so the divergence above is a
  // property of the transition and not of the probe.
  it('agrees with the elapsed-milliseconds form on an ordinary day', () => {
    const ordinary = new Date(YEAR, 5, 15, 14, 0);

    expect(elapsedMinutesFromMidnight(ordinary)).toBe(minutesFromMidnight(ordinary));
  });

  it('reports a time before the transition correctly too', () => {
    for (const { day } of TRANSITIONS) {
      const early = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 1, 0);

      expect(minutesFromMidnight(early)).toBe(60);
    }
  });
});

describe('addDays lands on local midnight', () => {
  // Adding 86_400_000 ms would land at 23:00 or 01:00 on these two days, which would
  // then shift every subsequent day of the window by an hour.
  it('steps across a transition without drifting off midnight', () => {
    for (const { day } of TRANSITIONS) {
      const previous = addDays(day, -1);
      const next = addDays(day, 1);

      for (const stepped of [previous, next]) {
        expect(stepped.getHours(), stepped.toString()).toBe(0);
        expect(stepped.getMinutes()).toBe(0);
      }

      expect(next.getDate()).toBe(
        new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getDate(),
      );
    }
  });

  it('walks a whole week of local midnights across a transition', () => {
    for (const { day } of TRANSITIONS) {
      const start = addDays(day, -3);

      for (let offset = 0; offset < 7; offset++) {
        expect(addDays(start, offset).getHours(), `offset ${offset}`).toBe(0);
      }
    }
  });
});

describe('event placement on a transition day', () => {
  const band = resolveBand('06:00', '18:00');

  it('places an afternoon event at its wall-clock height', () => {
    for (const { day } of TRANSITIONS) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0);

      const placement = computeEventPlacement(
        minutesFromMidnight(start),
        minutesFromMidnight(end),
        band,
      );

      // 14:00 in a 06:00-18:00 band is two thirds of the way down.
      expect(placement?.topPct, day.toDateString()).toBeCloseTo((480 / 720) * 100, 10);
    }
  });

  // Duration is the point of the view (#206). An hour-long meeting must be an hour
  // tall on every day of the year, including the two that are not 24 hours long.
  it('keeps an hour-long event one hour tall', () => {
    const reference = computeEventPlacement(540, 600, band)?.heightPct;

    for (const { day } of TRANSITIONS) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0);

      expect(
        computeEventPlacement(minutesFromMidnight(start), minutesFromMidnight(end), band)
          ?.heightPct,
        day.toDateString(),
      ).toBeCloseTo(reference as number, 10);
    }
  });
});

describe('the now line on a transition day', () => {
  const band = resolveBand('06:00', '18:00');

  it('sits at the same height as an event starting at that instant', () => {
    for (const { day } of TRANSITIONS) {
      const now = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0);

      const linePct = computeNowLinePct(now, band);
      const eventTopPct = computeEventPlacement(
        minutesFromMidnight(now),
        minutesFromMidnight(end),
        band,
      )?.topPct;

      // The line and the events must be computed the same way, or they disagree by an
      // hour on exactly these two days — which is the live defect in the card this
      // module was designed against.
      expect(linePct, day.toDateString()).toBeCloseTo(eventTopPct as number, 10);
    }
  });
});

describe('splitting a timed event across a transition', () => {
  it('gives one segment per local day', () => {
    for (const { day } of TRANSITIONS) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 20, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 10, 0);

      const event: Types.CalendarEventData = {
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };

      const segments = splitTimedEventByDay(event, addDays(day, -3), addDays(day, 4));

      expect(segments, day.toDateString()).toHaveLength(3);
    }
  });

  it('reports the transition day itself as a full day', () => {
    for (const { day } of TRANSITIONS) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 20, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 10, 0);

      const event: Types.CalendarEventData = {
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };

      const middle = splitTimedEventByDay(event, addDays(day, -3), addDays(day, 4))[1];

      // A 23-hour day and a 25-hour day are both still one whole day of the axis.
      expect(segmentMinutes(middle), day.toDateString()).toEqual({
        startMin: 0,
        endMin: MINUTES_PER_DAY,
      });
    }
  });

  it('keeps an event ending at midnight on the transition day to one segment', () => {
    for (const { day } of TRANSITIONS) {
      const event: Types.CalendarEventData = {
        start: {
          dateTime: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 22, 0).toISOString(),
        },
        end: { dateTime: addDays(day, 1).toISOString() },
      };

      const segments = splitTimedEventByDay(event, addDays(day, -1), addDays(day, 3));

      expect(segments, day.toDateString()).toHaveLength(1);
      expect(segmentMinutes(segments[0])).toEqual({ startMin: 1320, endMin: MINUTES_PER_DAY });
    }
  });
});

describe('all-day banners across a transition', () => {
  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // A day-count built on elapsed milliseconds floors a 23-hour day to zero, which
  // shortens a banner by a column or drops it entirely.
  it('spans the correct number of columns over a transition day', () => {
    for (const { day } of TRANSITIONS) {
      const windowStart = addDays(day, -2);

      const event: Types.CalendarEventData = {
        start: { date: dateKey(addDays(day, -1)) },
        end: { date: dateKey(addDays(day, 2)) },
      };

      expect(
        computeBannerPlacement(
          event,
          Array.from({ length: 7 }, (_, index) => addDays(windowStart, index)),
        ),
        day.toDateString(),
      ).toEqual({
        columnIndex: 1,
        span: 3,
        continuesBefore: false,
        continuesAfter: false,
      });
    }
  });

  it('places a single-day banner on the transition day itself', () => {
    for (const { day } of TRANSITIONS) {
      expect(
        computeBannerPlacement(
          { start: { date: dateKey(day) }, end: { date: dateKey(addDays(day, 1)) } },
          Array.from({ length: 7 }, (_, index) => addDays(addDays(day, -2), index)),
        ),
        day.toDateString(),
      ).toMatchObject({ columnIndex: 2, span: 1 });
    }
  });
});
