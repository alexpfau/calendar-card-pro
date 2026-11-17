/**
 * Start date expression parser for Calendar Card Pro
 * Parses the relative-date grammar accepted by the `start_date` config option, and resolves
 * the window a `start_date` opens (`getTimeWindow`).
 *
 * Kept free of the card's heavier modules, so `config/view.ts`, which the editor bundles too,
 * can resolve a window without carrying the translation tables `utils/format.ts` imports.
 */

import * as Logger from './logger';

const MAX_OPERATORS = 8;

/** Result of parsing a `start_date` expression. */
export type ParseResult =
  { kind: 'ok'; date: Date } | { kind: 'error'; message: string } | { kind: 'nomatch' };

const WEEKDAYS: Readonly<Record<string, number>> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const ANCHOR_TODAY = 'today';
const ANCHOR_START_OF_WEEK = 'start_of_week';

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The day a number of calendar days away, at local midnight, from local fields, so a day either
 * side of a daylight-saving change still lands on the right date.
 *
 * @param date - Starting day
 * @param days - Days to move, negative for earlier
 * @returns Midnight of the day reached, or its first moment where that day has no midnight
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * How many calendar days lie from one day to another, by their local dates, whatever the hours
 * between them: a day with a daylight-saving change still counts as one.
 *
 * @param from - The earlier day
 * @param to - The later day
 * @returns Whole days, negative when `to` is earlier
 */
export function calendarDayDiff(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / 86400000);
}

/**
 * A day's local date, as `YYYY-MM-DD`.
 *
 * @param date - Any moment on the day
 * @returns The date key
 */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function forwardToWeekday(date: Date, weekday: number): Date {
  const delta = (weekday - date.getDay() + 7) % 7;
  return addDays(date, delta);
}

function backwardToWeekday(date: Date, weekday: number): Date {
  const delta = (date.getDay() - weekday + 7) % 7;
  return addDays(date, -delta);
}

function startOfWeek(date: Date, firstDayOfWeek: number): Date {
  return backwardToWeekday(date, ((firstDayOfWeek % 7) + 7) % 7);
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (const char of input) {
    if (char === '+' || char === '-') {
      tokens.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  tokens.push(current);

  return tokens;
}

/**
 * Whether an expression resolves differently for different first weekdays.
 *
 * Exactly one thing in this grammar consults `firstDayOfWeek`: the `start_of_week`
 * anchor. Every weekday anchor lands on the next `monday`, `sat`, … from today, and every
 * operator adds days, weeks or a weekday offset — none of which move when the week starts
 * somewhere else.
 *
 * This lives here, beside the grammar it describes, because the event cache key needs the
 * same answer and re-implementing it drifted in both directions at once. The copy was a
 * regex over the raw config value, and it matched `end_of_week` — never an anchor here —
 * while failing on any value carrying whitespace, because `getTimeWindow` trims before
 * parsing and the regex did not. That second half was the live defect: a padded
 * `" start_of_week"` resolved to a week-relative window but was keyed as though it were
 * absolute, so a Sunday-start and a Monday-start profile shared one cache entry while
 * asking Home Assistant for different days.
 *
 * Reusing `tokenize` and the normalization step rather than restating them is the point —
 * a future anchor or operator that reads `firstDayOfWeek` has to be added a few lines
 * below, where this predicate is visible, and `tests/start-date-week-relative.test.ts`
 * reconciles the two by measuring whether the resolved date actually moves.
 *
 * @param input - Raw `start_date` config value, trimmed or not
 * @returns `true` when the resolved date depends on the first day of the week
 */
export function isWeekRelative(input: string): boolean {
  const normalized = String(input).replace(/\s+/g, '').toLowerCase();
  if (normalized === '') return false;

  return tokenize(normalized)[0] === ANCHOR_START_OF_WEEK;
}

/**
 * Parse a start date expression such as `start_of_week+7`, `today+sat` or `monday-1w`.
 *
 * @param input - Raw `start_date` config value
 * @param firstDayOfWeek - Resolved first day of week (0 = Sunday, 1 = Monday)
 * @param now - Reference date the expression is evaluated against
 * @returns Parsed date, a description of what is malformed, or `nomatch` when
 *   the value is not an expression in this grammar at all
 */
export function parseStartDateExpression(
  input: string,
  firstDayOfWeek: number,
  now: Date,
): ParseResult {
  const normalized = String(input).replace(/\s+/g, '').toLowerCase();
  if (normalized === '') return { kind: 'nomatch' };

  const tokens = tokenize(normalized);
  const anchor = tokens[0];
  const operators = tokens.slice(1);

  let cursor: Date;
  if (anchor === ANCHOR_TODAY) {
    cursor = atMidnight(now);
  } else if (anchor === ANCHOR_START_OF_WEEK) {
    cursor = startOfWeek(now, firstDayOfWeek);
  } else if (anchor in WEEKDAYS) {
    cursor = forwardToWeekday(atMidnight(now), WEEKDAYS[anchor]);
  } else if (anchor === '') {
    cursor = atMidnight(now);
  } else {
    return { kind: 'nomatch' };
  }

  if (operators.length > MAX_OPERATORS) {
    return {
      kind: 'error',
      message: `too many operators (maximum ${MAX_OPERATORS})`,
    };
  }

  for (const operator of operators) {
    const sign = operator[0] === '-' ? -1 : 1;
    const operand = operator.slice(1);

    if (operand === '') {
      return { kind: 'error', message: `dangling "${operator[0]}" with no value` };
    }

    if (operand in WEEKDAYS) {
      const weekday = WEEKDAYS[operand];
      cursor = sign > 0 ? forwardToWeekday(cursor, weekday) : backwardToWeekday(cursor, weekday);
      continue;
    }

    const weeksMatch = operand.match(/^(\d+)w$/);
    if (weeksMatch) {
      cursor = addDays(cursor, sign * parseInt(weeksMatch[1], 10) * 7);
      continue;
    }

    const daysMatch = operand.match(/^(\d+)$/);
    if (daysMatch) {
      cursor = addDays(cursor, sign * parseInt(daysMatch[1], 10));
      continue;
    }

    return { kind: 'error', message: `unrecognized operand "${operand}"` };
  }

  return { kind: 'ok', date: cursor };
}

/**
 * Calculate time window for event fetching
 *
 * Half-open, like the window `processRawEvents` keeps: from local midnight on the first day
 * to local midnight after the last, which Home Assistant's calendar API treats as an
 * exclusive end. The end used to be the close of the day after the last one, so every card
 * asked for one day more than it could draw.
 *
 * @param daysToShow - Number of days to show in the calendar
 * @param startDate - Optional start date: a relative expression (`today+7`,
 *   `start_of_week`, `monday+1w`, …), an ISO string, or `YYYY-MM-DD`
 * @param firstDayOfWeek - Resolved first day of week (0 = Sunday, 1 = Monday),
 *   required by week-relative expressions such as `start_of_week`
 * @param now - The moment a relative start date is resolved against
 * @returns Object containing start and end dates for the calendar window
 */
export function getTimeWindow(
  daysToShow: number,
  startDate: string | undefined,
  firstDayOfWeek: number,
  now: Date = new Date(),
): { start: Date; end: Date } {
  let start: Date;

  const today = (): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rawStartDate = startDate === undefined || startDate === null ? '' : String(startDate);

  if (rawStartDate.trim() !== '') {
    try {
      const trimmed = rawStartDate.trim();

      const parsed = parseStartDateExpression(trimmed, firstDayOfWeek, now);

      if (parsed.kind === 'ok') {
        start = parsed.date;

        if (isNaN(start.getTime())) {
          Logger.warn(
            `start_date "${trimmed}" resolved outside the supported date range. Falling back to today.`,
          );
          start = today();
        } else {
          Logger.info(`Resolved start_date "${trimmed}" to ${localDateKey(start)}`);
        }
      } else if (parsed.kind === 'error') {
        Logger.warn(`Invalid start_date "${trimmed}": ${parsed.message}. Falling back to today.`);
        start = today();
      } else if (trimmed.includes('T')) {
        start = new Date(trimmed);

        if (isNaN(start.getTime())) {
          Logger.warn(`Invalid ISO date: ${trimmed}, falling back to today`);
          start = today();
        }
      } else {
        const [year, month, day] = trimmed.split('-').map(Number);

        if (year && month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          start = new Date(year, month - 1, day);

          // `new Date(y, m - 1, d)` cannot fail on numbers this guard already bounded —
          // it rolls a day past the end of its month forward instead, so `2025-02-30`
          // becomes March 2 and an `isNaN` check here never fires. Reading the parts back
          // is the only way to tell a real date from one JavaScript quietly moved.
          if (
            start.getFullYear() !== year ||
            start.getMonth() !== month - 1 ||
            start.getDate() !== day
          ) {
            Logger.warn(`Impossible date: ${trimmed}, falling back to today`);
            start = today();
          }
        } else {
          Logger.warn(`Malformed date: ${trimmed}, falling back to today`);
          start = today();
        }
      }
    } catch (error) {
      Logger.warn(`Error parsing date: ${rawStartDate}, falling back to today`, error);
      start = today();
    }
  } else {
    start = today();
  }

  start.setHours(0, 0, 0, 0);

  // Built from local fields, so a window spanning a DST change still ends at midnight.
  const end = new Date(start);
  const days = parseInt(daysToShow.toString()) || 3;
  end.setDate(start.getDate() + days);

  return { start, end };
}
