import { describe, expect, it } from 'vitest';

import {
  CASCADE_INDENT_PCT,
  CASCADE_MAX_DEPTH,
  type GridBand,
  layoutCascade,
  layoutLanes,
} from '../src/utils/grid';

/**
 * The cascaded overlap layout, `overlap_layout: cascade`.
 *
 * Two kinds of test. The examples pin each rule on a day small enough to read. The
 * properties check what makes the layout safe at all, over generated days rather than
 * chosen ones: a later block never covers an earlier block's text or its leading edge,
 * every event is drawn or counted, nothing is narrower than plain columns would draw it,
 * and with nesting impossible the lanes are exactly `layoutLanes`'. A generated day is the
 * input least likely to have been picked because it passes.
 *
 * The seeds are fixed, so a failure names a day that reproduces. Each property also asserts
 * that its corpus exercised the thing it checks — a run in which nothing nested would pass
 * every overlap assertion and prove nothing.
 */

interface Ev {
  id: string;
  startMin: number;
  endMin: number;
}

const BAND: GridBand = { startMin: 7 * 60, endMin: 22 * 60, usedFallback: false };
const EPS = 1e-6;

/** Deterministic PRNG so a failure names a reproducible seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDay(seed: number): Ev[] {
  const rand = mulberry32(seed);
  const count = 2 + Math.floor(rand() * 11);
  const events: Ev[] = [];
  for (let i = 0; i < count; i++) {
    const start = 5 * Math.floor((rand() * (23 * 60 - 6 * 60)) / 5) + 6 * 60;
    const roll = rand();
    const duration =
      roll < 0.08
        ? 0
        : roll < 0.6
          ? 15 * (1 + Math.floor(rand() * 8))
          : 30 * (1 + Math.floor(rand() * 20));
    events.push({ id: `e${i}`, startMin: start, endMin: Math.min(1440, start + duration) });
  }
  // Keep only what the renderer would hand over.
  return events.filter(
    (e) =>
      (e.endMin === e.startMin && e.startMin >= BAND.startMin && e.startMin < BAND.endMin) ||
      (e.endMin > BAND.startMin && e.startMin < BAND.endMin),
  );
}

/** Displayed interval; an instant is drawn as a marker, so give it a sliver of height. */
function displayed(e: { startMin: number; endMin: number }): [number, number] {
  const top = Math.max(e.startMin, BAND.startMin);
  const bottom = Math.min(e.endMin, BAND.endMin);
  return [top, bottom > top ? bottom : top + 1e-3];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

const at = (h: number, m = 0) => h * 60 + m;

const OPTIONS = {
  thresholdMin: 30,
  indentPct: CASCADE_INDENT_PCT,
  maxDepth: CASCADE_MAX_DEPTH,
  maxLanes: 3,
};

function byId<T extends { id: string }>(placed: T[]): Record<string, T> {
  return Object.fromEntries(placed.map((p) => [p.id, p]));
}

describe('layoutCascade, rule by rule', () => {
  it('draws the macOS day: a flight over the trip it falls inside', () => {
    const { placed } = layoutCascade(
      [
        { id: 'trip', startMin: at(14), endMin: at(22) },
        { id: 'flight', startMin: at(18), endMin: at(19, 5) },
      ],
      BAND,
      OPTIONS,
    );
    const { trip, flight } = byId(placed);

    expect(trip).toMatchObject({ x0Pct: 0, x1Pct: 100, depth: 1, raised: false });
    expect(flight).toMatchObject({ x0Pct: CASCADE_INDENT_PCT, x1Pct: 100, depth: 2, raised: true });
    // The trip's text keeps to the four hours above the flight, at full width.
    expect(trip.contentEndMin).toBe(at(18));
    expect(trip.contentX1Pct).toBe(100);
    // Paint order is start order, so the flight is drawn after, and over, the trip.
    expect(placed.map((p) => p.id)).toEqual(['trip', 'flight']);
  });

  it('nests at exactly the threshold and not a minute before it', () => {
    const at30 = layoutCascade(
      [
        { id: 'host', startMin: at(9), endMin: at(12) },
        { id: 'late', startMin: at(9, 30), endMin: at(10) },
      ],
      BAND,
      OPTIONS,
    );
    const at29 = layoutCascade(
      [
        { id: 'host', startMin: at(9), endMin: at(12) },
        { id: 'late', startMin: at(9, 29), endMin: at(10) },
      ],
      BAND,
      OPTIONS,
    );

    expect(byId(at30.placed).late).toMatchObject({ depth: 2, x0Pct: CASCADE_INDENT_PCT });
    // A minute earlier and the two would share header rows, so they go side by side.
    expect(byId(at29.placed).late).toMatchObject({ depth: 1, x0Pct: 50 });
    expect(byId(at29.placed).host.contentX1Pct).toBe(50);
  });

  it('measures the threshold from where a clipped block is drawn, not where it starts', () => {
    // Starts at 05:00, but the band opens at 07:00 and so does its header.
    const near = layoutCascade(
      [
        { id: 'night', startMin: at(5), endMin: at(12) },
        { id: 'early', startMin: at(7, 20), endMin: at(8) },
      ],
      BAND,
      OPTIONS,
    );
    const far = layoutCascade(
      [
        { id: 'night', startMin: at(5), endMin: at(12) },
        { id: 'early', startMin: at(7, 30), endMin: at(8) },
      ],
      BAND,
      OPTIONS,
    );

    expect(byId(near.placed).early.depth).toBe(1);
    expect(byId(far.placed).early.depth).toBe(2);
    expect(byId(far.placed).night.contentEndMin).toBe(at(7, 30));
  });

  it('keeps events that start together side by side, the longer under the shorter', () => {
    const { placed } = layoutCascade(
      [
        { id: 'standup', startMin: at(9), endMin: at(9, 15) },
        { id: 'office', startMin: at(9), endMin: at(17) },
        { id: 'review', startMin: at(10), endMin: at(11) },
      ],
      BAND,
      OPTIONS,
    );
    const { office, standup, review } = byId(placed);

    expect(office).toMatchObject({ x0Pct: 0, x1Pct: 100, contentX1Pct: 50, depth: 1 });
    expect(standup).toMatchObject({ x0Pct: 50, x1Pct: 100, depth: 1, raised: true });
    // Once the standup is over, the review nests over the whole office, not half of it.
    expect(review).toMatchObject({ x0Pct: CASCADE_INDENT_PCT, x1Pct: 100, depth: 2 });
    expect(office.contentEndMin).toBe(at(10));
  });

  it('stops nesting at the depth cap and puts the next event beside the deepest', () => {
    // Four workshops, each starting an hour into the last.
    const { placed } = layoutCascade(
      [
        { id: 'a', startMin: at(9), endMin: at(11) },
        { id: 'b', startMin: at(10), endMin: at(12) },
        { id: 'c', startMin: at(11), endMin: at(13) },
        { id: 'd', startMin: at(12), endMin: at(14) },
      ],
      BAND,
      OPTIONS,
    );
    const { a, b, c, d } = byId(placed);

    expect([a.depth, b.depth, c.depth]).toEqual([1, 2, 3]);
    expect(CASCADE_MAX_DEPTH).toBe(3);
    // c may not host, so d joins it as a sibling under b, in the lane after c's.
    expect(d.depth).toBe(3);
    expect(d.x0Pct).toBeGreaterThan(c.x0Pct);
    expect(c.contentX1Pct).toBe(d.x0Pct);
  });

  it('puts two reminders at one minute side by side, and nests one inside a meeting', () => {
    const { placed } = layoutCascade(
      [
        { id: 'meeting', startMin: at(9), endMin: at(11) },
        { id: 'water', startMin: at(10), endMin: at(10) },
        { id: 'tablet', startMin: at(10), endMin: at(10) },
      ],
      BAND,
      OPTIONS,
    );
    const { meeting, water, tablet } = byId(placed);

    expect(water.depth).toBe(2);
    expect(tablet.depth).toBe(2);
    expect(tablet.x0Pct).toBeGreaterThan(water.x0Pct);
    expect(water.contentX1Pct).toBe(tablet.x0Pct);
    expect(meeting.contentEndMin).toBe(at(10));
  });

  it('lays out the Google Calendar example from #624 the way Google does', () => {
    const day: Ev[] = [
      { id: 'test5', startMin: at(8, 30), endMin: at(13, 15) },
      { id: 'test3', startMin: at(9, 30), endMin: at(11, 30) },
      { id: 'test1', startMin: at(9, 30), endMin: at(11, 15) },
      { id: 'test2', startMin: at(10, 15), endMin: at(11, 45) },
    ];
    const { placed } = layoutCascade(day, BAND, OPTIONS);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));

    expect(byId.test5).toMatchObject({ x0Pct: 0, x1Pct: 100, depth: 1 });
    // Same start: side by side inside test5, indented one level.
    expect(byId.test3).toMatchObject({ x0Pct: 6, depth: 2 });
    expect(byId.test1).toMatchObject({ x0Pct: 53, depth: 2 });
    // test3 extends under test1 but keeps its text left of it.
    expect(byId.test3.x1Pct).toBe(100);
    expect(byId.test3.contentX1Pct).toBe(53);
    // 45 minutes later: nested over test1, one more indent in, to the right edge.
    expect(byId.test2).toMatchObject({ x0Pct: 59, x1Pct: 100, depth: 3 });
    // test5's text stops where the first nested block starts.
    expect(byId.test5.contentEndMin).toBe(at(9, 30));
  });
});

describe('layoutCascade over generated days', () => {
  const SEEDS = 20000;
  const options = (threshold: number, maxLanes = 3) => ({
    thresholdMin: threshold,
    indentPct: CASCADE_INDENT_PCT,
    maxDepth: CASCADE_MAX_DEPTH,
    maxLanes,
  });

  for (const threshold of [15, 30, 60]) {
    it(`never covers an earlier block's text or leading edge (threshold ${threshold}, ${SEEDS} days)`, () => {
      // Checked in plain code and asserted once, like the lanes property below: an expect()
      // per block and per overlapping pair left too little room under CI's timeout.
      const failures: string[] = [];
      let nestedDays = 0;
      let minContentWidth = Infinity;
      let minHeader = Infinity;

      for (let seed = 1; seed <= SEEDS && failures.length < 10; seed++) {
        const day = randomDay(seed);
        const { placed, overflows } = layoutCascade(day, BAND, options(threshold));

        // Every event is drawn or counted.
        const counted = placed.length + overflows.reduce((n, o) => n + o.hidden.length, 0);
        if (counted !== day.length) {
          failures.push(`seed ${seed}: ${counted} drawn or counted of ${day.length}`);
        }

        if (placed.some((p) => p.depth > 1)) nestedDays++;

        // Paint order: overflow blocks are drawn after every event.
        const painted = [
          ...placed.map((p) => ({ ...p, overflow: false })),
          ...overflows.map((o) => ({
            ...o,
            id: 'overflow',
            contentX1Pct: o.x1Pct,
            contentEndMin: o.endMin,
            overflow: true,
          })),
        ];

        for (const p of placed) {
          const width = p.x1Pct - p.x0Pct;
          if (!(width > EPS)) failures.push(`seed ${seed} ${p.id}: width ${width}`);
          minContentWidth = Math.min(minContentWidth, p.contentX1Pct - p.x0Pct);
          const [top, bottom] = displayed(p);
          const header = p.contentEndMin - top;
          if (bottom - top > 1e-2) {
            minHeader = Math.min(
              minHeader,
              Math.min(header, threshold) / Math.min(threshold, bottom - top),
            );
          }
        }

        for (let i = 0; i < painted.length; i++) {
          const below = painted[i];
          if (below.overflow) continue;
          const belowSpan = displayed(below);
          const text: [number, number] = [
            belowSpan[0],
            Math.max(belowSpan[0] + 1e-3, below.contentEndMin),
          ];

          for (let j = i + 1; j < painted.length; j++) {
            const above = painted[j];
            const aboveSpan = displayed(above);
            const horizontal = above.x0Pct < below.x1Pct - EPS && below.x0Pct < above.x1Pct - EPS;
            if (!horizontal || !overlaps(belowSpan, aboveSpan)) continue;

            // Leading edge: anything painted over a block starts at least one indent in, or
            // past the block's own text region when that is narrower than an indent.
            const edge =
              below.x0Pct + Math.min(CASCADE_INDENT_PCT, below.contentX1Pct - below.x0Pct) - EPS;
            if (!(above.x0Pct >= edge)) {
              failures.push(`seed ${seed}: ${above.id} covers ${below.id}'s edge`);
            }

            // Text: nothing painted later intersects the uncovered region.
            if (overlaps(text, aboveSpan) && !(above.x0Pct >= below.contentX1Pct - EPS)) {
              failures.push(`seed ${seed}: ${above.id} covers ${below.id}'s text`);
            }
          }
        }
      }

      expect(failures).toEqual([]);
      // The generator must actually exercise nesting, or the checks above prove nothing.
      expect(nestedDays).toBeGreaterThan(SEEDS / 4);
      // Never narrower than the narrowest lane columns could give at the same cap (3).
      expect(minContentWidth).toBeGreaterThanOrEqual(25 - 1e-9);
      // ...and every block keeps its full header, up to the threshold.
      expect(minHeader).toBeGreaterThanOrEqual(1 - 1e-9);
    });
  }

  // Two ways nesting becomes impossible: a threshold of infinity, and the one a card gets
  // when its scale is so compressed that a title row needs more than the whole band.
  it.each([
    ['an infinite threshold', Infinity],
    ['a threshold past the band', BAND.endMin - BAND.startMin + 1],
  ])('reproduces the side-by-side lanes exactly at %s', (_case, threshold) => {
    // Compared in plain code and asserted once. An expect() per placement came to about a
    // million calls, which cost several times the layouts they checked and timed out on CI.
    const mismatches: string[] = [];
    let compared = 0;
    let besideAnother = 0;
    let withHidden = 0;

    for (let seed = 1; seed <= SEEDS && mismatches.length < 10; seed++) {
      const day = randomDay(seed);
      for (const cap of [1, 2, 3, 5]) {
        const where = `seed ${seed} cap ${cap}`;
        const lanes = layoutLanes(day, cap);
        const cascade = layoutCascade(day, BAND, options(threshold, cap));
        if (cascade.placed.length !== lanes.placed.length) {
          mismatches.push(
            `${where}: ${cascade.placed.length} placed, lanes placed ${lanes.placed.length}`,
          );
          continue;
        }
        const lanesById = new Map(lanes.placed.map((p) => [p.id, p]));
        for (const p of cascade.placed) {
          compared++;
          const lane = lanesById.get(p.id);
          const x0 = lane ? (lane.laneIndex / lane.laneCount) * 100 : NaN;
          if (lane && lane.laneIndex > 0) besideAnother++;
          // The tolerance toBeCloseTo(x0, 9) applies; the negated form also fails on NaN.
          if (p.depth !== 1 || !(Math.abs(p.x0Pct - x0) < 5e-10)) {
            mismatches.push(`${where} ${p.id}: depth ${p.depth}, x0 ${p.x0Pct}, lanes x0 ${x0}`);
          }
        }
        const hiddenLanes = lanes.overflows.flatMap((o) => o.hidden.map((e) => e.id)).sort();
        const hiddenCascade = cascade.overflows.flatMap((o) => o.hidden.map((e) => e.id)).sort();
        if (hiddenLanes.length > 0) withHidden++;
        if (hiddenCascade.join() !== hiddenLanes.join()) {
          mismatches.push(`${where}: hides [${hiddenCascade}], lanes hide [${hiddenLanes}]`);
        }
      }
    }

    expect(mismatches).toEqual([]);
    // Prove the corpus reached what is compared: placements, a lane other than the first,
    // and the overflow. Equality over days that never overlapped would prove nothing.
    expect(compared).toBeGreaterThan(SEEDS * 4);
    expect(besideAnother).toBeGreaterThan(SEEDS);
    expect(withHidden).toBeGreaterThan(SEEDS / 4);
  });
});
