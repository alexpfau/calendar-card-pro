/**
 * A calendar entry's `starts_after` and `starts_before` (#346): the hours of the day a timed
 * event of that entry has to start in to be shown.
 *
 * Imports nothing, so the card's filter (`events.ts` › `filterEventsForEntity`) and the editor's
 * Split This Calendar review (`split-review.ts` › `entryKeeps`) read the same rule rather than a
 * copy of it each.
 *
 * The grammar is Home Assistant's `time` condition's: at or after `starts_after`, before
 * `starts_before`, and past midnight where `starts_before` is the earlier of the two. Each side
 * alone runs to or from midnight. An event is judged by the clock time its start reads in the
 * browser's zone, the clock the card prints beside it (`format.ts` › `formatTime`), and it is
 * judged once, by its real start: a multi-day event is kept or dropped as a whole.
 */

/** Seconds in a day. A window's `until` of this much is the end of the day. */
const DAY_SECONDS = 86400;

/**
 * `H:MM`, `HH:MM`, `H:MM:SS` or `HH:MM:SS`, read after trimming. The hours are checked
 * numerically, since 24 is a time only `starts_before` takes. `allday_expires_at` reads its time
 * with this pattern too (`events.ts` › `parseTimeOfDay`), so every time a calendar takes is
 * written the same way.
 */
export const TIME_OF_DAY_PATTERN = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

/** The hours a timed event has to start in, in seconds into the day. */
export interface StartWindow {
  /** The first second of the day an event may start at, included. */
  readonly from: number;
  /**
   * The second from which an event may no longer start, excluded; `86400` is the end of the day.
   * Where it is not after `from`, the hours run past midnight.
   */
  readonly until: number;
}

/** What makes the card ignore a window, so it can say so once. */
export type StartWindowProblem =
  | {
      readonly kind: 'invalid';
      readonly key: 'starts_after' | 'starts_before';
      /** The value as configured: a string that is not a time, a number, or anything else. */
      readonly value: unknown;
    }
  | {
      /** Both bounds name the same time, which leaves no hours out. */
      readonly kind: 'equal';
      readonly value: string;
    };

/** An entry's window as configured: the hours it keeps, if any, and why none apply, if any. */
export interface StartWindowReading {
  /** The hours to keep; absent where the entry keeps every timed event. */
  readonly window?: StartWindow;
  /** Every reason the configured values leave the entry unnarrowed. */
  readonly problems: ReadonlyArray<StartWindowProblem>;
}

type Bound = { readonly seconds: number } | 'unset' | 'invalid';

/**
 * One configured bound.
 *
 * Unset is absent, `null`, or a blank string, which is what the editor leaves where a field is
 * cleared. A number is invalid, not reinterpreted: an unquoted `16:00` in a YAML-mode dashboard
 * reaches the card as the number `960`, and reading it back as a time would make `23:59:59` and
 * `16:00` mean different units.
 *
 * @param value - The configured value
 * @param endOfDay - Whether `24:00` is accepted, as the end of the day
 * @returns The bound
 */
function readBound(value: unknown, endOfDay: boolean): Bound {
  if (value === undefined || value === null) return 'unset';
  if (typeof value !== 'string') return 'invalid';

  const trimmed = value.trim();
  if (trimmed === '') return 'unset';

  const match = TIME_OF_DAY_PATTERN.exec(trimmed);
  if (!match) return 'invalid';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (hours <= 23) return { seconds: hours * 3600 + minutes * 60 + seconds };
  if (endOfDay && hours === 24 && minutes === 0 && seconds === 0) {
    return { seconds: DAY_SECONDS };
  }

  return 'invalid';
}

/**
 * Reads an entry's `starts_after` and `starts_before`.
 *
 * An invalid value on either side drops the **whole** window, so the entry keeps every event,
 * which is the card's rule for a typo: show too much, never too little. Honoring the valid half
 * alone would turn `starts_after: '22:00'` with a mistyped `starts_before` into "after 22:00
 * only", and hide the night's early hours the user asked for.
 *
 * `starts_before` of `00:00` or `24:00` is the end of the day. Two bounds naming the same time
 * leave no hours out, as Home Assistant's own condition reads an empty span, and are reported so
 * the user learns the window does nothing.
 *
 * @param after - The entry's `starts_after`, unvalidated
 * @param before - The entry's `starts_before`, unvalidated
 * @returns The window, and what kept one from applying
 */
export function readStartWindow(after: unknown, before: unknown): StartWindowReading {
  const from = readBound(after, false);
  const until = readBound(before, true);

  const problems: StartWindowProblem[] = [];
  if (from === 'invalid') problems.push({ kind: 'invalid', key: 'starts_after', value: after });
  if (until === 'invalid') problems.push({ kind: 'invalid', key: 'starts_before', value: before });
  if (problems.length > 0) return { problems };

  const fromSeconds = typeof from === 'object' ? from.seconds : 0;
  const untilSeconds =
    typeof until === 'object' && until.seconds !== 0 ? until.seconds : DAY_SECONDS;

  if (fromSeconds === 0 && untilSeconds === DAY_SECONDS) return { problems };
  if (fromSeconds === untilSeconds) {
    return { problems: [{ kind: 'equal', value: String(after).trim() }] };
  }

  return { window: { from: fromSeconds, until: untilSeconds }, problems };
}

/**
 * Whether an instant starts within a window, read on the browser's clock: a time the clock reads
 * twice where it falls back is judged by the time it reads, both times, and a day whose midnight
 * the clock skips starts at the first time it reads.
 *
 * @param start - The event's start
 * @param window - The window
 * @returns True where the event starts in the window's hours
 */
export function startsInWindow(start: Date, window: StartWindow): boolean {
  const seconds = start.getHours() * 3600 + start.getMinutes() * 60 + start.getSeconds();

  return window.from < window.until
    ? seconds >= window.from && seconds < window.until
    : seconds >= window.from || seconds < window.until;
}
