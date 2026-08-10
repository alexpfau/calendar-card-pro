/**
 * Start date expression parser for Calendar Card Pro
 *
 * Parses the relative-date grammar accepted by the `start_date` config option.
 *
 * ```
 * start_date := <anchor> <operator>*
 * anchor     := "today" | "start_of_week" | <weekday>
 * operator   := ("+"|"-") ( <n> | <n>"w" | <weekday> )
 * weekday    := monday|mon|tuesday|tue|wednesday|wed|thursday|thu
 *             | friday|fri|saturday|sat|sunday|sun
 * ```
 *
 * Parsing is case-insensitive and ignores all whitespace, so `start_of_week +7`
 * is equivalent to `start_of_week+7`.
 *
 * The tokens are intentionally English-only: a configuration value must not
 * change meaning when the card's `language` option changes.
 *
 * This module has **no imports on purpose**. It contains pure date arithmetic
 * with no dependency on the rest of the card, which keeps it trivially testable
 * in isolation.
 */

/** Maximum number of operators accepted in one expression — bounds pathological input. */
const MAX_OPERATORS = 8;

/**
 * Result of parsing a start date expression.
 *
 * The three-way result distinguishes "this is not our grammar, try the other
 * formats" (`nomatch`) from "this is our grammar but it is malformed" (`error`),
 * which lets the caller emit an accurate warning instead of misreporting a typo
 * like `start_of_week+xyz` as an invalid `YYYY-MM-DD` date.
 */
export type ParseResult =
  | { kind: 'ok'; date: Date }
  | { kind: 'error'; message: string }
  | { kind: 'nomatch' };

/** Weekday tokens mapped to their JavaScript day index (0 = Sunday). */
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

/** Anchor keywords that start an expression. */
const ANCHOR_TODAY = 'today';
const ANCHOR_START_OF_WEEK = 'start_of_week';

/**
 * Normalize a date to local midnight without mutating the input.
 *
 * Building a fresh Date from the y/m/d components (rather than calling
 * `setHours(0,0,0,0)`) keeps the result at true local midnight even across a
 * DST transition.
 *
 * @param date - Date to normalize
 * @returns New Date at local midnight on the same calendar day
 */
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Add a number of days to a date, returning a new date at local midnight.
 *
 * @param date - Starting date
 * @param days - Days to add (may be negative)
 * @returns New Date, normalized to local midnight
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Move a date to the nearest occurrence of a weekday at or after it.
 *
 * "At or after" means that if the cursor already falls on the target weekday it
 * stays put — `today+sat` evaluated on a Saturday is that Saturday.
 *
 * @param date - Cursor position
 * @param weekday - Target weekday (0 = Sunday)
 * @returns New Date on the requested weekday
 */
function forwardToWeekday(date: Date, weekday: number): Date {
  const delta = (weekday - date.getDay() + 7) % 7;
  return addDays(date, delta);
}

/**
 * Move a date to the nearest occurrence of a weekday at or before it.
 *
 * @param date - Cursor position
 * @param weekday - Target weekday (0 = Sunday)
 * @returns New Date on the requested weekday
 */
function backwardToWeekday(date: Date, weekday: number): Date {
  const delta = (date.getDay() - weekday + 7) % 7;
  return addDays(date, -delta);
}

/**
 * Resolve the first day of the week containing the given date.
 *
 * @param date - Any date within the target week
 * @param firstDayOfWeek - Index of the week's first day (0 = Sunday, 1 = Monday)
 * @returns New Date on the first day of that week
 */
function startOfWeek(date: Date, firstDayOfWeek: number): Date {
  return backwardToWeekday(date, ((firstDayOfWeek % 7) + 7) % 7);
}

/**
 * Split an expression into its anchor and operator tokens.
 *
 * Operators keep their sign so they can be applied in order, e.g.
 * `today+sat+7` yields `['today', '+sat', '+7']`.
 *
 * @param input - Whitespace-stripped, lowercased expression
 * @returns Anchor token followed by signed operator tokens
 */
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
 * Parse a start date expression such as `start_of_week+7`, `today+sat` or
 * `monday+1w`.
 *
 * `now` is injected rather than read from the clock so that callers — and
 * tests — can evaluate an expression against an arbitrary reference day.
 *
 * @param input - Raw `start_date` config value
 * @param firstDayOfWeek - Resolved first day of week (0 = Sunday, 1 = Monday)
 * @param now - Reference date the expression is evaluated against
 * @returns Parsed date, a description of what is malformed, or `nomatch` when
 *          the value is not an expression in this grammar at all
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

  // Resolve the anchor. Anything we do not recognise is not our grammar, which
  // is what keeps `2025-07-01` and ISO strings from being partially consumed.
  let cursor: Date;
  if (anchor === ANCHOR_TODAY) {
    cursor = atMidnight(now);
  } else if (anchor === ANCHOR_START_OF_WEEK) {
    cursor = startOfWeek(now, firstDayOfWeek);
  } else if (anchor in WEEKDAYS) {
    // A bare weekday is sugar for `today+<weekday>`.
    cursor = forwardToWeekday(atMidnight(now), WEEKDAYS[anchor]);
  } else if (anchor === '') {
    // Legacy anchorless shorthand: `+7` / `-3`. Tokenizing these yields an
    // empty anchor followed by operators, which resolve against today.
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
