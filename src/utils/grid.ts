/**
 * Time-grid geometry for Calendar Card Pro.
 *
 * Pure functions only: no Lit, no DOM, no clock reads. Every function that needs the
 * current instant takes it as an argument, so a whole render can be evaluated against
 * one `now` and the module can be tested without faking timers.
 *
 * Two decisions in here are load-bearing and were each taken because the obvious
 * alternative is wrong in a way that no default-config test can see.
 *
 * **Vertical geometry is expressed in percent, not pixels.** Nothing in this module
 * knows how tall the band is on screen. A fixed card height therefore compresses the
 * grid with no arithmetic anywhere, and there is no pixel scale for a renderer, a host
 * and a now-line to disagree about — a class of bug that only appears once someone
 * overrides the scale with card-mod. It also keeps configured lengths as CSS strings,
 * which `src/rendering/` is forbidden from turning into numbers.
 *
 * **Clock positions come from the local wall clock, never from elapsed milliseconds.**
 * `date.getHours() * 60 + date.getMinutes()` and `(date - midnight) / 60000` agree on
 * 363 days a year and disagree by an hour on the two DST transitions, because a
 * spring-forward day is 23 hours long. The elapsed-milliseconds form places a 14:00
 * event at 13:00 on that day. See `tests/grid-geometry.dst.test.ts`.
 */

import * as FormatUtils from './format';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Minutes in a day. A band may end here, meaning `24:00`. */
export const MINUTES_PER_DAY = 1440;

/** Fallback band, used when a configured bound cannot be parsed. */
export const DEFAULT_BAND_START = '07:00';

/** @see DEFAULT_BAND_START */
export const DEFAULT_BAND_END = '22:00';

//-----------------------------------------------------------------------------
// TIME OF DAY
//-----------------------------------------------------------------------------

/**
 * Two colon-separated pairs of digits, and nothing else.
 *
 * Shape only — the ranges are checked numerically below. Splitting the two concerns
 * keeps the `24:00` case an explicit branch that says what it is, rather than a third
 * alternative buried in the pattern where nothing explains why it exists. Anchored at
 * both ends so `"7:00am"` and `"09:00 "` are rejected outright instead of being
 * half-parsed into a plausible-looking wrong answer.
 */
const TIME_OF_DAY_SHAPE = /^(\d{2}):(\d{2})$/;

/**
 * Parse a `HH:mm` time of day into minutes from midnight.
 *
 * Minute precision rather than whole hours is close to free here and is strictly more
 * expressive: a band starting at `06:30` is a real thing to want, and an integer-hour
 * option cannot say it.
 *
 * `24:00` is accepted as the one time past the last clock reading of the day, because a
 * band has to be able to end at midnight. `24:30` is not — the exception exists to name
 * the end of the day, not to admit a 25th hour.
 *
 * @param value - Time of day as `HH:mm`, or `24:00` for the end of the day
 * @returns Minutes from midnight in `[0, 1440]`, or `null` when unparseable
 */
export function parseTimeOfDay(value: string): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const shape = TIME_OF_DAY_SHAPE.exec(value);

  if (!shape) {
    return null;
  }

  const hours = Number(shape[1]);
  const minutes = Number(shape[2]);

  if (minutes > 59) {
    return null;
  }

  if (hours === 24) {
    return minutes === 0 ? MINUTES_PER_DAY : null;
  }

  return hours < 24 ? hours * 60 + minutes : null;
}

/**
 * Render minutes from midnight back as `HH:mm`.
 *
 * @param minutes - Minutes from midnight in `[0, 1440]`
 * @returns Zero-padded `HH:mm`
 */
export function formatTimeOfDay(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);

  return `${String(hours).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

//-----------------------------------------------------------------------------
// BAND
//-----------------------------------------------------------------------------

/**
 * The slice of the day the grid draws, in minutes from midnight.
 */
export interface GridBand {
  /** Inclusive lower bound. */
  startMin: number;

  /** Exclusive upper bound; may be `1440`. */
  endMin: number;

  /** True when either configured bound was rejected and both fell back. */
  usedFallback: boolean;
}

/**
 * Resolve the visible band from two configured bounds.
 *
 * A bad bound resets **both**, rather than leaving one configured value paired with a
 * default. Half-honouring the config produces a band the user never asked for and
 * cannot recognise as a fallback — an unparseable start with a configured `23:00` end
 * would silently become a sixteen-hour band instead of the one they wrote.
 *
 * @param startTime - Configured start, as `HH:mm`
 * @param endTime - Configured end, as `HH:mm` or `24:00`
 * @returns The resolved band, flagged when it fell back
 */
export function resolveBand(startTime: string, endTime: string): GridBand {
  const startMin = parseTimeOfDay(startTime);
  const endMin = parseTimeOfDay(endTime);

  if (startMin === null || endMin === null || startMin >= endMin) {
    return {
      startMin: parseTimeOfDay(DEFAULT_BAND_START) as number,
      endMin: parseTimeOfDay(DEFAULT_BAND_END) as number,
      usedFallback: true,
    };
  }

  return { startMin, endMin, usedFallback: false };
}

/**
 * Hours that get an axis label, one per whole hour inside the band.
 *
 * The label at the band's own end is deliberately omitted: it would sit on the bottom
 * edge with no slot beneath it, and for a band ending at `24:00` it would have to name
 * hour 24, which is not a clock reading.
 *
 * @param band - Resolved band
 * @returns Ascending whole hours, each of which falls inside the band
 */
export function axisHours(band: GridBand): number[] {
  const first = Math.ceil(band.startMin / 60);
  const last = Math.ceil(band.endMin / 60) - 1;
  const hours: number[] = [];

  for (let hour = first; hour <= last; hour++) {
    hours.push(hour);
  }

  return hours;
}

//-----------------------------------------------------------------------------
// WALL CLOCK
//-----------------------------------------------------------------------------

/**
 * Minutes from local midnight, read from the wall clock.
 *
 * 🚨 Do not "simplify" this to `(d - startOfDay(d)) / 60000`. That form measures
 * elapsed time, and a spring-forward day has 23 hours of it, so every event after the
 * transition is placed an hour early. The whole suite stays green under `TZ=UTC`,
 * which has no transitions.
 *
 * @param d - Any local-time Date
 * @returns Integer minutes in `[0, 1440)`
 */
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Local midnight on the same calendar day.
 *
 * @param d - Any local-time Date
 * @returns A new Date at local `00:00:00.000`
 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Local midnight `days` days after `d`.
 *
 * Built by incrementing the date component rather than by adding milliseconds, so it
 * lands on local midnight on both DST transition days instead of 23:00 or 01:00.
 *
 * @param d - Any local-time Date
 * @param days - Whole days to add; may be negative
 * @returns A new Date at local midnight
 */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

//-----------------------------------------------------------------------------
// EVENT PLACEMENT
//-----------------------------------------------------------------------------

/**
 * Where one event sits in the band, as percentages of the band's height.
 */
export interface EventPlacement {
  /** Distance from the top of the band, as a percentage in `[0, 100)`. */
  topPct: number;

  /** Height as a percentage of the band, always positive. */
  heightPct: number;

  /** The event starts before the band; the block should show a continuation mark. */
  clippedTop: boolean;

  /** The event ends after the band. */
  clippedBottom: boolean;
}

/**
 * Place an event within the band.
 *
 * There is deliberately no minimum-height argument. A floor belongs in CSS, where
 * `min-height` already wins over a percentage `height` at layout time and composes
 * with whatever the band's real pixel height turns out to be. Applying one here would
 * mean clamping in percent against a band whose height this module does not know, and
 * would then have to be re-clamped so a floored block did not overflow the bottom.
 *
 * @param startMin - Event start, in minutes from midnight
 * @param endMin - Event end, in minutes from midnight; `1440` means midnight tonight
 * @param band - The visible band
 * @returns Placement, or `null` when the event falls wholly outside the band
 */
export function computeEventPlacement(
  startMin: number,
  endMin: number,
  band: GridBand,
): EventPlacement | null {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return null;
  }

  if (endMin <= band.startMin || startMin >= band.endMin) {
    return null;
  }

  const bandLength = band.endMin - band.startMin;
  const visibleStart = Math.max(startMin, band.startMin);
  const visibleEnd = Math.min(endMin, band.endMin);

  return {
    topPct: ((visibleStart - band.startMin) / bandLength) * 100,
    heightPct: ((visibleEnd - visibleStart) / bandLength) * 100,
    clippedTop: startMin < band.startMin,
    clippedBottom: endMin > band.endMin,
  };
}

/**
 * Place the now-line within the band.
 *
 * Returns `null` rather than a clamped value when the current time is outside the
 * band, so the caller draws no line at all. A line pinned to the top edge would be a
 * false statement about where the day has got to.
 *
 * @param now - The instant to place
 * @param band - The visible band
 * @returns Distance from the top of the band as a percentage, or `null` when outside
 */
export function computeNowLinePct(now: Date, band: GridBand): number | null {
  const nowMin = minutesFromMidnight(now);

  if (nowMin < band.startMin || nowMin >= band.endMin) {
    return null;
  }

  return ((nowMin - band.startMin) / (band.endMin - band.startMin)) * 100;
}

//-----------------------------------------------------------------------------
// OVERLAP LANES
//-----------------------------------------------------------------------------

/**
 * The minimum an event must expose to be laid out into lanes.
 */
export interface LaneInput {
  startMin: number;

  endMin: number;
}

/**
 * An event with its lane assigned.
 */
export type LanePlacement<T> = T & {
  /** Zero-based lane within the cluster. */
  laneIndex: number;

  /** Lanes the cluster needs; every member shares it, so widths line up. */
  laneCount: number;
};

/**
 * A stand-in for the events a cluster had no room to draw.
 */
export interface LaneOverflow<T> {
  startMin: number;

  endMin: number;

  laneIndex: number;

  laneCount: number;

  /** The events this block stands for, in start order. */
  hidden: T[];
}

export interface LaneLayout<T> {
  placed: LanePlacement<T>[];

  overflows: LaneOverflow<T>[];
}

/**
 * Assign overlapping events to side-by-side lanes, capped.
 *
 * Events are grouped into clusters of transitively-overlapping events, and each
 * cluster is packed greedily into the lowest free lane. Intervals are half-open, so an
 * event ending at 10:00 does not overlap one starting at 10:00.
 *
 * `laneCount` is shared across a cluster so its members are the same width. It is the
 * lanes the cluster actually needed, not its size: three events where only two are
 * ever simultaneous take two lanes, not three.
 *
 * Above `maxLanes`, events assigned to lanes beyond the cap collapse into one overflow
 * block spanning their combined range. An uncapped grid answers a busy day with seven
 * unreadable slivers; the block at least says how many were hidden. The cap is never
 * allowed to drop an event silently — at `maxLanes: 1` the first lane remains visible and
 * every hidden lane is represented by the overflow block.
 *
 * @param events - Events to lay out; not mutated, and need not be sorted
 * @param maxLanes - Most lanes a cluster may use; values below 1 are treated as 1
 * @returns Placed events and any overflow blocks
 */
export function layoutLanes<T extends LaneInput>(events: T[], maxLanes: number): LaneLayout<T> {
  const cap = Number.isFinite(maxLanes) ? Math.max(1, Math.floor(maxLanes)) : 1;

  // Longest-first on ties keeps the enclosing event in the leftmost lane, which reads
  // as containment rather than as an arbitrary interleave.
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const clusters: T[][] = [];
  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  for (const event of sorted) {
    if (cluster.length > 0 && event.startMin >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }

    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.endMin);
  }

  if (cluster.length > 0) {
    clusters.push(cluster);
  }

  const placed: LanePlacement<T>[] = [];
  const overflows: LaneOverflow<T>[] = [];

  for (const members of clusters) {
    const assigned = assignLanes(members);
    const needed = assigned.reduce((max, entry) => Math.max(max, entry.laneIndex + 1), 0);

    if (needed <= cap) {
      for (const entry of assigned) {
        placed.push({ ...entry.event, laneIndex: entry.laneIndex, laneCount: needed });
      }

      continue;
    }

    // Keep whole lanes rather than the first events in the cluster. Otherwise a
    // transitively joined cluster can hide lane 0's later event while showing lane 2's
    // first one, leaving an empty gutter beside the overflow block.
    const visible = assigned.filter((entry) => entry.laneIndex < cap);
    const hidden = assigned.filter((entry) => entry.laneIndex >= cap).map((entry) => entry.event);
    const laneCount = cap + 1;

    for (const entry of visible) {
      placed.push({ ...entry.event, laneIndex: entry.laneIndex, laneCount });
    }

    overflows.push({
      startMin: Math.min(...hidden.map((event) => event.startMin)),
      endMin: Math.max(...hidden.map((event) => event.endMin)),
      laneIndex: cap,
      laneCount,
      hidden,
    });
  }

  return { placed, overflows };
}

/**
 * Greedy lowest-free-lane assignment within one cluster.
 *
 * @param members - Cluster members, already in start order
 * @returns Each member with the lane it was given
 */
function assignLanes<T extends LaneInput>(members: T[]): Array<{ event: T; laneIndex: number }> {
  const laneEnds: number[] = [];

  return members.map((event) => {
    let laneIndex = laneEnds.findIndex((end) => end <= event.startMin);

    if (laneIndex < 0) {
      laneIndex = laneEnds.length;
    }

    laneEnds[laneIndex] = event.endMin;

    return { event, laneIndex };
  });
}

//-----------------------------------------------------------------------------
// SPLITTING TIMED EVENTS
//-----------------------------------------------------------------------------

/**
 * Split a timed event at local day boundaries, keeping every segment timed.
 *
 * 🚨 This exists because `events.ts:splitMultiDayEvent` cannot be used here. That
 * splitter rewrites a timed event's middle days as `start: { date }`, which is right
 * for a list — a middle day genuinely occupies the whole day and draws no time — and
 * wrong for a grid, where it makes the middle day of a three-day conference read as
 * all-day to everything downstream and land in the all-day band instead of drawing as
 * a full-height block in its own column. The event silently changes class.
 *
 * Segments carry `dateTime` on both ends, always. A segment covering a whole middle
 * day runs `00:00`–`24:00` in local time rather than being reshaped into a date.
 *
 * A segment of zero length is dropped, which is what keeps an event ending exactly at
 * midnight from producing an empty second day.
 *
 * @param event - A timed event; one with no `start.dateTime` is returned untouched
 * @param windowStart - Local midnight of the first visible day
 * @param windowEnd - Local midnight after the last visible day, exclusive
 * @returns One segment per local day the event touches inside the window
 */
export function splitTimedEventByDay(
  event: Types.CalendarEventData,
  windowStart: Date,
  windowEnd: Date,
): Types.CalendarEventData[] {
  if (!event.start.dateTime || !event.end.dateTime) {
    return [event];
  }

  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const firstDay = startOfDay(start < windowStart ? windowStart : start);
  const lastMoment = end > windowEnd ? windowEnd : end;
  const segments: Types.CalendarEventData[] = [];

  for (let day = firstDay; day < lastMoment && day < windowEnd; day = addDays(day, 1)) {
    const dayEnd = addDays(day, 1);
    const segmentStart = start > day ? start : day;
    const segmentEnd = end < dayEnd ? end : dayEnd;

    if (segmentEnd <= segmentStart) {
      continue;
    }

    segments.push({
      ...event,
      start: { dateTime: segmentStart.toISOString() },
      end: { dateTime: segmentEnd.toISOString() },
      _isMultiDaySegment: segments.length > 0 || segmentStart > start || segmentEnd < end,
    });
  }

  return segments;
}

/**
 * The minutes an already-split segment occupies on its own day.
 *
 * A segment running to the following local midnight reports `1440` rather than `0`, so
 * a block ending at midnight is drawn to the bottom of the band instead of collapsing.
 *
 * @param segment - A timed segment confined to one local day
 * @returns Start and end in minutes from that day's midnight
 */
export function segmentMinutes(segment: Types.CalendarEventData): LaneInput | null {
  if (!segment.start.dateTime || !segment.end.dateTime) {
    return null;
  }

  const start = new Date(segment.start.dateTime);
  const end = new Date(segment.end.dateTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const startMin = minutesFromMidnight(start);
  const rawEndMin = minutesFromMidnight(end);

  // Midnight reads as 0 on the *following* day, which would invert the interval.
  const endMin =
    FormatUtils.getCalendarDayDiff(start, end) > 0 || (rawEndMin === 0 && end > start)
      ? MINUTES_PER_DAY
      : rawEndMin;

  return { startMin, endMin };
}

//-----------------------------------------------------------------------------
// ALL-DAY BANNERS
//-----------------------------------------------------------------------------

/**
 * Where an all-day event sits in the band above the grid.
 */
export interface BannerPlacement {
  /** Zero-based day column the banner starts in. */
  columnIndex: number;

  /** Columns it spans, at least 1. */
  span: number;

  /** The event began before the window; the banner should show a leading mark. */
  continuesBefore: boolean;

  /** The event runs past the window. */
  continuesAfter: boolean;
}

/**
 * Place an all-day event as a single banner spanning the columns it covers.
 *
 * One banner spanning its days, rather than one chip per day, is what makes a
 * multi-day event read as one thing. The alternative draws a five-day holiday as five
 * separate chips that never visually join.
 *
 * iCal end dates are exclusive, so the last covered day is the day before `end.date`.
 * An event whose start and end are equal covers no days at all; that is malformed
 * rather than empty, and returning `null` keeps a `span: 0` out of the CSS.
 *
 * @param event - An all-day event, i.e. one carrying `start.date`
 * @param windowStart - Local midnight of the first visible day
 * @param visibleDays - Number of day columns on screen
 * @returns The banner's placement, or `null` when it does not intersect the window
 */
export function computeBannerPlacement(
  event: Types.CalendarEventData,
  windowStart: Date,
  visibleDays: number,
): BannerPlacement | null {
  if (!event.start.date || visibleDays < 1) {
    return null;
  }

  const start = FormatUtils.parseAllDayDate(event.start.date);

  // A missing end is a one-day event. Otherwise the iCal end is exclusive, so step back
  // one day to reach the last day the event actually covers.
  const lastDay = event.end.date ? addDays(FormatUtils.parseAllDayDate(event.end.date), -1) : start;

  if (Number.isNaN(start.getTime()) || Number.isNaN(lastDay.getTime()) || lastDay < start) {
    return null;
  }

  const startOffset = FormatUtils.getCalendarDayDiff(windowStart, start);
  const endOffset = FormatUtils.getCalendarDayDiff(windowStart, lastDay);

  if (endOffset < 0 || startOffset > visibleDays - 1) {
    return null;
  }

  const columnIndex = Math.max(0, startOffset);
  const lastVisible = Math.min(endOffset, visibleDays - 1);

  return {
    columnIndex,
    span: lastVisible - columnIndex + 1,
    continuesBefore: startOffset < 0,
    continuesAfter: endOffset > visibleDays - 1,
  };
}
