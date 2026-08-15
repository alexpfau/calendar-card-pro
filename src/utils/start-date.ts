/**
 * Start date expression parser for Calendar Card Pro
 * Parses the relative-date grammar accepted by the `start_date` config option.
 */
const MAX_OPERATORS = 8;

/** Result of parsing a `start_date` expression. */
export type ParseResult =
  | { kind: 'ok'; date: Date }
  | { kind: 'error'; message: string }
  | { kind: 'nomatch' };

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

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
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
