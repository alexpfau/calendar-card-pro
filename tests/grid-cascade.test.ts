import { describe, expect, it } from 'vitest';

import {
  CASCADE_INDENT_PCT,
  CASCADE_MAX_DEPTH,
  type GridBand,
  OVERFLOW_STRIP_MAX_SHARE,
  layoutCascade,
  layoutLanes,
} from '../src/utils/grid';

/**
 * The cascaded overlap layout, `overlap_layout: cascade`.
 *
 * Two kinds of test. The examples pin each rule on a day small enough to read. The
 * properties check what makes the layout safe at all, over generated days rather than
 * chosen ones: a later block never covers an earlier block's text or its leading edge,
 * every event is drawn or counted, nothing is narrower than an even split among one lane
 * more than the cap, and with nesting impossible the lanes are exactly `layoutLanes`'. A
 * generated day is the input least likely to have been picked because it passes.
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

/** An event's own time, unclamped; an instant gets a sliver so it overlaps its own minute. */
function span(e: { startMin: number; endMin: number }): [number, number] {
  return [e.startMin, e.endMin > e.startMin ? e.endMin : e.startMin + 1e-3];
}

/**
 * What is wrong with one overflow block's grouping, if anything.
 *
 * A block stands for one run of hidden events that overlap one another, and spans exactly
 * that run. Written against `span` rather than the layout's release logic, so the two are
 * independent statements of when events overlap.
 */
function runProblem(block: {
  startMin: number;
  endMin: number;
  hidden: Array<{ id: string; startMin: number; endMin: number }>;
}): string | null {
  let reach = -Infinity;

  for (const [index, event] of block.hidden.entries()) {
    if (index > 0 && !(event.startMin < reach)) {
      return `joins ${event.id}, which overlaps nothing before it in the block`;
    }
    reach = Math.max(reach, span(event)[1]);
  }

  const start = Math.min(...block.hidden.map((e) => e.startMin));
  const end = Math.max(...block.hidden.map((e) => e.endMin));
  return block.startMin === start && block.endMin === end
    ? null
    : `spans ${block.startMin}-${block.endMin}, its events ${start}-${end}`;
}

/** Overflow blocks as a comparable string: span and hidden ids, in any order. */
function blocksKey(
  blocks: Array<{ startMin: number; endMin: number; hidden: Array<{ id: string }> }>,
): string {
  return blocks
    .map((b) => `${b.startMin}-${b.endMin}:${b.hidden.map((e) => e.id).join(',')}`)
    .sort()
    .join(' | ');
}

/**
 * Whether any cluster of the day was split into more than one overflow block. Clusters are
 * found here by a sweep over `span`, independently of the layout.
 */
function splitsACluster(day: Ev[], blocks: Array<{ hidden: Array<{ id: string }> }>): boolean {
  const clusterOf = new Map<string, number>();
  let reach = -Infinity;
  let cluster = -1;

  for (const e of [...day].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)) {
    if (!(e.startMin < reach)) cluster++;
    clusterOf.set(e.id, cluster);
    reach = Math.max(reach, span(e)[1]);
  }

  const seen = new Set<number>();
  for (const block of blocks) {
    const owner = clusterOf.get(block.hidden[0].id) as number;
    if (seen.has(owner)) return true;
    seen.add(owner);
  }
  return false;
}

const at = (h: number, m = 0) => h * 60 + m;

/**
 * Where a side-by-side lane starts, derived from its topology alone: written out here
 * rather than taken from the layout, so it is a second statement of the geometry and not
 * a copy of it. A group that fits splits the column evenly; one that does not leaves a
 * strip at the end, a quarter of the column at most and never more than an equal share.
 */
function laneX0(lane: { laneIndex: number; laneCount: number }, cap: number, stripPct: number) {
  if (lane.laneCount <= cap) return (lane.laneIndex / lane.laneCount) * 100;
  const strip = Math.min(stripPct > 0 ? stripPct : Infinity, 25, 100 / (cap + 1));
  return (lane.laneIndex * (100 - strip)) / cap;
}

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

  // Nothing nests at an infinite threshold, so with one lane the three errands beside the
  // conference are hidden siblings.
  const SUMMIT_DAY: Ev[] = [
    { id: 'summit', startMin: at(7), endMin: at(22) },
    { id: 'car', startMin: at(9), endMin: at(10, 30) },
    { id: 'dentist', startMin: at(11, 30), endMin: at(12, 15) },
    { id: 'coffee', startMin: at(15), endMin: at(16) },
  ];

  it('counts siblings it has no lane for where each happens, one block per overlapping run', () => {
    const { placed, overflows } = layoutCascade(SUMMIT_DAY, BAND, {
      ...OPTIONS,
      thresholdMin: Infinity,
      maxLanes: 1,
    });

    expect(placed.map((p) => p.id)).toEqual(['summit']);
    // They never overlap one another, so each gets a block. Before a column has been
    // measured, the strip they share is as wide as its bounds allow: a quarter.
    expect(
      overflows.map(({ startMin, endMin, x0Pct, x1Pct, hidden }) => [
        startMin,
        endMin,
        x0Pct,
        x1Pct,
        hidden.map((e) => e.id),
      ]),
    ).toEqual([
      [at(9), at(10, 30), 75, 100, ['car']],
      [at(11, 30), at(12, 15), 75, 100, ['dentist']],
      [at(15), at(16), 75, 100, ['coffee']],
    ]);
  });

  it('gives the event it can draw everything but the strip, which only holds a count', () => {
    const { placed, overflows } = layoutCascade(SUMMIT_DAY, BAND, {
      ...OPTIONS,
      thresholdMin: Infinity,
      maxLanes: 1,
      stripPct: 7,
    });

    // Not half the column, as a lane of its own would have taken.
    expect(placed[0]).toMatchObject({ id: 'summit', x0Pct: 0, x1Pct: 93, contentX1Pct: 93 });
    expect(overflows.map(({ x0Pct, x1Pct }) => [x0Pct, x1Pct])).toEqual([
      [93, 100],
      [93, 100],
      [93, 100],
    ]);
  });

  it('bounds the strip by the region it sits in, not by the whole column', () => {
    // Two siblings nested in a review, one lane: the region runs from one indent in.
    const day: Ev[] = [
      { id: 'review', startMin: at(9), endMin: at(17) },
      { id: 'a', startMin: at(10), endMin: at(11) },
      { id: 'b', startMin: at(10, 5), endMin: at(11) },
    ];
    const region = 100 - CASCADE_INDENT_PCT;
    const stripOf = (stripPct: number) => {
      const { placed, overflows } = layoutCascade(day, BAND, {
        ...OPTIONS,
        maxLanes: 1,
        stripPct,
      });
      expect(byId(placed).a).toMatchObject({ x0Pct: CASCADE_INDENT_PCT, depth: 2 });
      expect(byId(placed).a.x1Pct).toBe(overflows[0].x0Pct);
      return overflows[0].x1Pct - overflows[0].x0Pct;
    };

    expect(stripOf(7)).toBeCloseTo(7, 9);
    // Never more than a quarter of its region, however wide the count asks to be.
    expect(stripOf(40)).toBeCloseTo(region * OVERFLOW_STRIP_MAX_SHARE, 9);
    expect(OVERFLOW_STRIP_MAX_SHARE).toBe(0.25);
  });
});

describe('layoutCascade over generated days', () => {
  const SEEDS = 20000;
  // The strip each day is laid out with, by seed rather than as another loop, so the corpus
  // costs no more than it did. Unmeasured; two widths a measured week and a measured
  // three-day column ask for; and one wider than either bound, so both bounds are reached.
  const STRIPS = [Infinity, 20, 7, 40];
  const stripFor = (seed: number) => STRIPS[seed % STRIPS.length];
  const options = (threshold: number, maxLanes = 3, stripPct = Infinity) => ({
    thresholdMin: threshold,
    indentPct: CASCADE_INDENT_PCT,
    maxDepth: CASCADE_MAX_DEPTH,
    maxLanes,
    stripPct,
  });

  for (const threshold of [15, 30, 60]) {
    it(`never covers an earlier block's text or leading edge (threshold ${threshold}, ${SEEDS} days)`, () => {
      // Checked in plain code and asserted once, like the lanes property below: an expect()
      // per block and per overlapping pair left too little room under CI's timeout.
      const failures: string[] = [];
      let nestedDays = 0;
      let minContentWidth = Infinity;
      let minHeader = Infinity;
      let overflowBlocks = 0;

      for (let seed = 1; seed <= SEEDS && failures.length < 10; seed++) {
        const day = randomDay(seed);
        const { placed, overflows } = layoutCascade(
          day,
          BAND,
          options(threshold, 3, stripFor(seed)),
        );

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

        // Each block is one run of hidden events that overlap one another, and two blocks
        // in the same place never overlap in time.
        for (const [index, block] of overflows.entries()) {
          overflowBlocks++;
          const problem = runProblem(block);
          if (problem) failures.push(`seed ${seed}: block at ${block.startMin} ${problem}`);
          for (const other of overflows.slice(index + 1)) {
            const samePlace =
              Math.abs(other.x0Pct - block.x0Pct) < EPS &&
              Math.abs(other.x1Pct - block.x1Pct) < EPS;
            if (samePlace && overlaps(span(block), span(other))) {
              failures.push(
                `seed ${seed}: blocks at ${block.startMin} and ${other.startMin} collide`,
              );
            }
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
      // Never narrower than an even split among one lane more than the cap (3), the floor
      // the strip's bounds keep side-by-side lanes at or above.
      expect(minContentWidth).toBeGreaterThanOrEqual(25 - 1e-9);
      // ...and every block keeps its full header, up to the threshold.
      expect(minHeader).toBeGreaterThanOrEqual(1 - 1e-9);
      // ...and the overflow checks above saw blocks to check.
      expect(overflowBlocks).toBeGreaterThan(1000);
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
    let splitClusters = 0;

    for (let seed = 1; seed <= SEEDS && mismatches.length < 10; seed++) {
      const day = randomDay(seed);
      for (const cap of [1, 2, 3, 5]) {
        const where = `seed ${seed} cap ${cap}`;
        const lanes = layoutLanes(day, cap, stripFor(seed));
        const cascade = layoutCascade(day, BAND, options(threshold, cap, stripFor(seed)));
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
          const x0 = lane ? laneX0(lane, cap, stripFor(seed)) : NaN;
          if (lane && lane.laneIndex > 0) besideAnother++;
          // The tolerance toBeCloseTo(x0, 9) applies; the negated form also fails on NaN.
          if (p.depth !== 1 || !(Math.abs(p.x0Pct - x0) < 5e-10)) {
            mismatches.push(`${where} ${p.id}: depth ${p.depth}, x0 ${p.x0Pct}, lanes x0 ${x0}`);
          }
          if (lane && !(Math.abs(lane.x0Pct - x0) < 5e-10)) {
            mismatches.push(`${where} ${p.id}: lanes draw x0 ${lane.x0Pct}, derived ${x0}`);
          }
        }
        // Every strip sits where the last lane ends, out to the column's edge, in both.
        for (const block of [...lanes.overflows, ...cascade.overflows]) {
          const x0 = laneX0({ laneIndex: cap, laneCount: cap + 1 }, cap, stripFor(seed));
          if (!(Math.abs(block.x0Pct - x0) < 5e-10) || block.x1Pct !== 100) {
            mismatches.push(`${where}: strip ${block.x0Pct}-${block.x1Pct}, derived ${x0}-100`);
          }
        }
        const hiddenLanes = lanes.overflows.flatMap((o) => o.hidden.map((e) => e.id)).sort();
        const hiddenCascade = cascade.overflows.flatMap((o) => o.hidden.map((e) => e.id)).sort();
        if (hiddenLanes.length > 0) withHidden++;
        if (hiddenCascade.join() !== hiddenLanes.join()) {
          mismatches.push(`${where}: hides [${hiddenCascade}], lanes hide [${hiddenLanes}]`);
        }
        // The blocks themselves match too, run for run, and each is one overlapping run.
        if (blocksKey(cascade.overflows) !== blocksKey(lanes.overflows)) {
          mismatches.push(
            `${where}: blocks ${blocksKey(cascade.overflows)}, lanes ${blocksKey(lanes.overflows)}`,
          );
        }
        for (const block of lanes.overflows) {
          const problem = runProblem(block);
          if (problem) mismatches.push(`${where}: lanes block at ${block.startMin} ${problem}`);
        }
        if (splitsACluster(day, lanes.overflows)) splitClusters++;
      }
    }

    expect(mismatches).toEqual([]);
    // Prove the corpus reached what is compared: placements, a lane other than the first,
    // and the overflow. Equality over days that never overlapped would prove nothing.
    expect(compared).toBeGreaterThan(SEEDS * 4);
    expect(besideAnother).toBeGreaterThan(SEEDS);
    expect(withHidden).toBeGreaterThan(SEEDS / 4);
    // ...and days where one cluster's hidden events form more than one run, which is the
    // case where one block per cluster and one per run disagree.
    expect(splitClusters).toBeGreaterThan(SEEDS / 4);
  });
});
