import { describe, expect, it } from 'vitest';

import {
  TitleMotionCohort,
  type TitleMotionInput,
  titleMotionCurve,
  titleMotionTiming,
} from '../src/utils/title-motion';

describe('individual title trips and a common forward start', () => {
  it.each([2, 70, 126, 178, 216, 268, 299, 371, 713, 1521, 100_000])(
    'keeps the approved durations and at-least-eight-times return for %spx',
    (distance) => {
      const trip = titleMotionTiming(distance);
      expect(trip.start).toBe(0.6);
      expect(trip.forward).toBe(Math.max(2.8, distance / 45));
      expect(trip.end).toBe(0.6);
      expect(trip.back).toBe(Math.min(0.6, Math.max(0.2, distance / 360)));
      expect(trip.total).toBe(trip.start + trip.forward + trip.end + trip.back);
      expect(trip.forward / trip.back).toBeGreaterThanOrEqual(8 - 1e-12);
      if (distance >= 126) expect(distance / trip.forward).toBeCloseTo(45, 10);
    },
  );

  it.each([-1, NaN, Infinity, -Infinity])('refuses invalid distance %s', (distance) => {
    expect(() => titleMotionTiming(distance)).toThrow(RangeError);
  });

  it('does not cap unread distance or the longest period', () => {
    const trip = titleMotionTiming(100_000);
    expect(trip.total).toBeGreaterThan(2000);
    expect(trip.back).toBe(0.6);
  });

  it('represents all five phases with two distinct linear travel legs', () => {
    const distances = [178, 268, 299, 371, 713];
    const period = Math.max(...distances.map((d) => titleMotionTiming(d).total));
    expect(period).toBeCloseTo(17.6444444444, 9);
    const returns: number[] = [];
    for (const distance of distances) {
      const trip = titleMotionTiming(distance);
      const curve = titleMotionCurve(distance, period);
      const points = [...curve.matchAll(/([01]) ([\d.]+)%/g)].map(([, value, percent]) => ({
        position: Number(value),
        seconds: (Number(percent) / 100) * period,
      }));
      expect(points).toHaveLength(6);
      expect(points.map(({ position }) => position)).toEqual([0, 0, 1, 1, 0, 0]);
      const expected = [0, 0.6, 0.6 + trip.forward, 1.2 + trip.forward, trip.total, period];
      points.forEach((point, index) => expect(point.seconds).toBeCloseTo(expected[index], 8));
      returns.push(points[4].seconds);
    }
    expect(returns[0]).toBeCloseTo(5.65, 2);
    expect(new Set(returns).size).toBe(5);
  });

  it('gives one member no surplus wait and rejects a period shorter than its trip', () => {
    const trip = titleMotionTiming(2);
    expect(trip.total).toBe(4.2);
    expect(titleMotionCurve(2, trip.total).endsWith('0 100.0000000000%, 0 100%)')).toBe(true);
    expect(() => titleMotionCurve(2, trip.total - 0.01)).toThrow(RangeError);
    expect(() => titleMotionCurve(2, Infinity)).toThrow(RangeError);
  });
});

function member(
  distance: number,
  signature = 'Unchanged title',
  direction: -1 | 1 = -1,
): TitleMotionInput {
  return { distance, signature, direction };
}

describe('DOM-free cohort boundary admission', () => {
  it.each([0, 1, 5, 1000])('commits %s members without an arbitrary cohort cap', (count) => {
    const cohort = new TitleMotionCohort<number>();
    const desired = new Map(Array.from({ length: count }, (_, key) => [key, member(2 + key * 9)]));
    expect(cohort.update(desired)).toEqual([]);
    expect(cohort.members.size).toBe(0);
    expect(cohort.pending).toBe(count > 0);
    cohort.commit();
    expect(cohort.members.size).toBe(count);
    expect(cohort.period).toBe(count ? titleMotionTiming(2 + (count - 1) * 9).total : 0);
    expect(cohort.pending).toBe(false);
    expect(cohort.update(new Map(desired))).toEqual([]);
    expect(cohort.pending).toBe(false);
  });

  it('admits late titles only at commit, leaving survivors on the old period', () => {
    const cohort = new TitleMotionCohort<string>();
    cohort.update(
      new Map([
        ['short', member(178)],
        ['medium', member(371)],
      ]),
    );
    cohort.commit();
    const oldPeriod = cohort.period;
    const short = cohort.members.get('short');
    cohort.update(new Map([...cohort.members, ['long', member(713)]]));
    expect(cohort.members.get('short')).toBe(short);
    expect(cohort.members.has('long')).toBe(false);
    expect(cohort.period).toBe(oldPeriod);
    expect(cohort.pending).toBe(true);
    cohort.commit();
    expect(cohort.members.size).toBe(3);
    expect(cohort.period).toBe(titleMotionTiming(713).total);
  });

  it.each([member(180), member(178, 'Replaced title'), member(178, 'Unchanged title', 1)])(
    'withdraws a changed trajectory while an unchanged reader finishes',
    (changed) => {
      const cohort = new TitleMotionCohort<string>();
      cohort.update(
        new Map([
          ['a', member(178)],
          ['b', member(371)],
        ]),
      );
      cohort.commit();
      expect(
        cohort.update(
          new Map([
            ['a', changed],
            ['b', member(371)],
          ]),
        ),
      ).toEqual(['a']);
      expect([...cohort.members.keys()]).toEqual(['b']);
      expect(cohort.pending).toBe(true);
      cohort.commit();
      expect(cohort.members.get('a')).toEqual(changed);
    },
  );

  it('keeps one obsolete long period when the longest member leaves', () => {
    const cohort = new TitleMotionCohort<string>();
    cohort.update(
      new Map([
        ['long', member(713)],
        ['short', member(178)],
      ]),
    );
    cohort.commit();
    const period = cohort.period;
    expect(cohort.update(new Map([['short', member(178)]]))).toEqual(['long']);
    expect(cohort.period).toBe(period);
    expect(cohort.pending).toBe(true);
    cohort.commit();
    expect(cohort.period).toBe(titleMotionTiming(178).total);
  });

  it('does not restart survivors just because a shorter participant disappears', () => {
    const cohort = new TitleMotionCohort<string>();
    cohort.update(
      new Map([
        ['long', member(713)],
        ['short', member(178)],
      ]),
    );
    cohort.commit();
    cohort.update(new Map([['long', member(713)]]));
    expect(cohort.pending).toBe(false);
    expect(cohort.period).toBe(titleMotionTiming(713).total);
  });

  it('readmits a canceled effect even when its measurement did not change', () => {
    const cohort = new TitleMotionCohort<string>();
    const desired = new Map([
      ['a', member(178)],
      ['b', member(371)],
    ]);
    cohort.update(desired);
    cohort.commit();
    cohort.retire('a');
    cohort.update(desired);
    expect(cohort.members.size).toBe(1);
    expect(cohort.pending).toBe(true);
    cohort.commit();
    expect(cohort.members.size).toBe(2);
  });

  it('starts a new scene without a surviving clock and clears all old pending state', () => {
    const cohort = new TitleMotionCohort<string>();
    cohort.update(new Map([['old', member(1521)]]));
    cohort.commit();
    cohort.update(new Map([['new', member(2)]]));
    expect(cohort.members.size).toBe(0);
    expect(cohort.pending).toBe(true);
    cohort.commit();
    expect(cohort.period).toBe(4.2);
    cohort.clear();
    expect(cohort.members.size).toBe(0);
    expect(cohort.period).toBe(0);
    expect(cohort.empty).toBe(true);
    expect(cohort.pending).toBe(false);
  });
});
