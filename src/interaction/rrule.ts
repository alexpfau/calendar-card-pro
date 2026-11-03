/**
 * Recurrence rules, as Home Assistant's own event editor offers, writes and words them.
 *
 * Home Assistant's editor (`ha-recurrence-rule-editor.ts` and `recurrence.ts` in its frontend)
 * offers a small part of RFC 5545: daily, weekly on chosen weekdays, monthly on a day of the
 * month or on an nth or last weekday, and yearly on the start date, each ending never, after a
 * count or on a date. This module reads that part into a `RepeatRule`, writes one back in the
 * form the editor writes, and words a rule from the editor's own translation strings, so the
 * card adds no user-visible text of its own.
 *
 * Anything else is a custom rule: kept verbatim, never rewritten and never worded, because
 * reading it into the supported part would silently change the days it repeats on.
 *
 * Home Assistant does all three jobs through the `rrule` package. The card does not, for bundle
 * size; the supported part is small enough to read, write and word by hand, and each function
 * names the Home Assistant or `rrule` function it mirrors.
 */

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A repeat frequency as Home Assistant's editor offers it; `none` is no recurrence. */
export type RepeatFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** A weekday as RFC 5545 spells it. */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/**
 * The day of the month a monthly rule repeats on.
 *
 * `day` is `BYMONTHDAY=n`, 1 to 31. `weekday` is the nth weekday, `BYDAY=+2SU`, with `nth` 1 to
 * 4 or -1 for the last. `last-day` is `BYMONTHDAY=-1`.
 */
export type MonthlyMode =
  | { kind: 'day'; day: number }
  | { kind: 'weekday'; nth: number; weekday: Weekday }
  | { kind: 'last-day' };

/** How a rule ends. `until` is a local calendar date, `YYYY-MM-DD`, and the last one it covers. */
export type RepeatEnd =
  { kind: 'never' } | { kind: 'after'; count: number } | { kind: 'on'; until: string };

/**
 * A recurrence rule Home Assistant's editor can show and write.
 *
 * `weekdays` is read for a weekly rule only, in the order given, because Home Assistant writes
 * them in the order they were picked. Empty is `FREQ=WEEKLY` with no `BYDAY`, which repeats on
 * the start's own weekday.
 *
 * `monthly` is read for a monthly rule only. Left out, the rule repeats on the start's day of
 * the month, as a bare `FREQ=MONTHLY` does.
 */
export interface RepeatRule {
  freq: Exclude<RepeatFreq, 'none'>;
  interval: number;
  weekdays: Weekday[];
  monthly?: MonthlyMode;
  end: RepeatEnd;
}

/** What `parseRRule` found: no rule, a rule the editor can show, or one it cannot. */
export type ParsedRRule =
  { kind: 'none' } | { kind: 'rule'; rule: RepeatRule } | { kind: 'custom'; raw: string };

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The weekdays Monday first: RFC 5545's order, and the order `rrule` sorts them in. */
const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * The count a rule's end starts at when it is first set to a count, and how many periods ahead
 * its date lands when first set to a date. Home Assistant's `DEFAULT_COUNT` in `recurrence.ts`.
 */
export const DEFAULT_COUNT: Readonly<Record<Exclude<RepeatFreq, 'none'>, number>> = {
  daily: 30,
  weekly: 13,
  monthly: 12,
  yearly: 5,
};

const FREQS: ReadonlyMap<string, Exclude<RepeatFreq, 'none'>> = new Map<
  string,
  Exclude<RepeatFreq, 'none'>
>([
  ['DAILY', 'daily'],
  ['WEEKLY', 'weekly'],
  ['MONTHLY', 'monthly'],
  ['YEARLY', 'yearly'],
]);

/**
 * Every rule part the editor can represent. `WKST` is among them only because it is usually
 * inert; `readRule` turns it away where it is not.
 */
const KNOWN_PARTS: readonly string[] = [
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTHDAY',
  'WKST',
];

/** The ordinals Home Assistant's editor offers for a monthly weekday. */
const MONTHLY_NTH: readonly number[] = [1, 2, 3, 4, -1];

/** Where Home Assistant keeps the words `rrule` asks for. */
const TOKEN_PREFIX = 'ui.components.calendar.event.rrule.';

/** The suffix word `rrule`'s `nth` asks for after a number; any other number takes `th`. */
const ORDINAL_SUFFIX: ReadonlyMap<number, string> = new Map([
  [1, 'st'],
  [21, 'st'],
  [31, 'st'],
  [2, 'nd'],
  [22, 'nd'],
  [3, 'rd'],
  [23, 'rd'],
]);

const UNTIL_VALUE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/;
const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NTH_WEEKDAY = /^([+-]?)(\d{1,2})(MO|TU|WE|TH|FR|SA|SU)$/;
const MONTH_DAY = /^([+-]?)(\d{1,2})$/;
const POSITIVE = /^\d+$/;

//-----------------------------------------------------------------------------
// DATES
//-----------------------------------------------------------------------------

/** Midnight UTC on a calendar date. `setUTCFullYear` keeps years below 100 as written. */
function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function daysInMonth(year: number, monthIndex: number): number {
  return utcDate(year, monthIndex + 1, 0).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1);
}

/** A `YYYY-MM-DD` date as numbers, month 1-based, or undefined when it is not a real date. */
function readIsoDate(value: string): [number, number, number] | undefined {
  const match = DATE_VALUE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isRealDate(year, month, day) ? [year, month, day] : undefined;
}

/** A date's local weekday. Home Assistant's `getWeekday` in `recurrence.ts`. */
function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

//-----------------------------------------------------------------------------
// READING
//-----------------------------------------------------------------------------

/**
 * Read a recurrence rule.
 *
 * A rule is read into a `RepeatRule` when every part of it is one Home Assistant's editor can
 * show: `FREQ` of `DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`; `INTERVAL`; one of `COUNT` and
 * `UNTIL`; plain weekdays in a weekly `BYDAY`; and for a monthly rule one `BYMONTHDAY` of 1 to
 * 31 or -1, or one `BYDAY` with an ordinal of 1 to 4 or -1. A yearly rule repeats on its start
 * date and carries no `BY` part. Parts may come in any order and any case, with or without a
 * leading `RRULE:`.
 *
 * Anything else is custom, with the text kept exactly as given, so a caller can leave it
 * untouched. That is deliberately stricter than Home Assistant, whose editor reads any rule and
 * drops what it cannot show the next time it writes.
 *
 * `UNTIL` is kept as the local calendar date it falls on. A `DATE`, or a floating `DATE-TIME`
 * with no `Z`, is its written date; a UTC `DATE-TIME` is the date that instant falls on here.
 *
 * `WKST` is read and dropped, as Home Assistant's editor drops it, except where it changes
 * which days repeat: a weekly rule with an interval above 1 and a `BYDAY`, whose weeks begin
 * on `WKST`. There a start other than the default Monday makes the rule custom.
 *
 * @param rrule - The rule as Home Assistant stores it, without `RRULE:`
 * @returns None for no rule, the rule when the editor can show it, and the raw text otherwise
 */
export function parseRRule(rrule: string | null | undefined): ParsedRRule {
  if (rrule === null || rrule === undefined || rrule.trim() === '') return { kind: 'none' };
  const rule = readRule(rrule);
  return rule ? { kind: 'rule', rule } : { kind: 'custom', raw: rrule };
}

/** A rule's parts by upper-case name, or undefined when one is malformed, unknown or repeated. */
function readParts(text: string): Map<string, string> | undefined {
  const parts = new Map<string, string>();
  for (const part of text
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')) {
    if (part.trim() === '') continue;
    const at = part.indexOf('=');
    if (at < 0) return undefined;
    const name = part.slice(0, at).trim().toUpperCase();
    const value = part
      .slice(at + 1)
      .trim()
      .toUpperCase();
    if (!value || parts.has(name) || !KNOWN_PARTS.includes(name)) return undefined;
    parts.set(name, value);
  }
  return parts;
}

function readRule(text: string): RepeatRule | undefined {
  const parts = readParts(text);
  const freq = parts && FREQS.get(parts.get('FREQ') ?? '');
  if (!parts || !freq) return undefined;

  const intervalValue = parts.get('INTERVAL');
  const interval = intervalValue === undefined ? 1 : readPositive(intervalValue);
  const end = readEnd(parts);
  if (interval === undefined || !end) return undefined;

  const byDay = parts.get('BYDAY');
  const byMonthDay = parts.get('BYMONTHDAY');
  let weekdays: Weekday[] = [];
  let monthly: MonthlyMode | undefined;
  if (freq === 'weekly') {
    if (byMonthDay !== undefined) return undefined;
    if (byDay !== undefined) {
      const days = readWeekdays(byDay);
      if (!days) return undefined;
      weekdays = days;
    }
  } else if (freq === 'monthly') {
    if (byDay !== undefined && byMonthDay !== undefined) return undefined;
    const value = byDay ?? byMonthDay;
    if (value !== undefined) {
      monthly = byDay !== undefined ? readNthWeekday(value) : readMonthDay(value);
      if (!monthly) return undefined;
    }
  } else if (byDay !== undefined || byMonthDay !== undefined) {
    return undefined;
  }

  const weekStart = parts.get('WKST');
  if (weekStart !== undefined) {
    if (!isWeekday(weekStart)) return undefined;
    if (freq === 'weekly' && interval > 1 && weekdays.length > 0 && weekStart !== 'MO') {
      return undefined;
    }
  }

  const rule: RepeatRule = { freq, interval, weekdays, end };
  if (monthly) rule.monthly = monthly;
  return rule;
}

function readPositive(value: string): number | undefined {
  const number = Number(value);
  return POSITIVE.test(value) && Number.isSafeInteger(number) && number >= 1 ? number : undefined;
}

function readEnd(parts: Map<string, string>): RepeatEnd | undefined {
  const count = parts.get('COUNT');
  const until = parts.get('UNTIL');
  if (count !== undefined && until !== undefined) return undefined;
  if (count !== undefined) {
    const value = readPositive(count);
    return value === undefined ? undefined : { kind: 'after', count: value };
  }
  if (until !== undefined) {
    const date = readUntil(until);
    return date === undefined ? undefined : { kind: 'on', until: date };
  }
  return { kind: 'never' };
}

/** The local calendar date an `UNTIL` falls on, as `YYYY-MM-DD`. */
function readUntil(value: string): string | undefined {
  const match = UNTIL_VALUE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isRealDate(year, month, day)) return undefined;
  if (match[4] === undefined) return isoDate(year, month, day);

  const [hours, minutes, seconds] = [Number(match[4]), Number(match[5]), Number(match[6])];
  if (hours > 23 || minutes > 59 || seconds > 60) return undefined;
  if (!match[7]) return isoDate(year, month, day);

  const instant = utcDate(year, month - 1, day);
  instant.setUTCHours(hours, minutes, seconds);
  return isoDate(instant.getFullYear(), instant.getMonth() + 1, instant.getDate());
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

function readWeekdays(value: string): Weekday[] | undefined {
  const days = value.split(',').map((day) => day.trim());
  if (!days.every(isWeekday) || new Set(days).size !== days.length) return undefined;
  return days;
}

function readNthWeekday(value: string): MonthlyMode | undefined {
  const match = NTH_WEEKDAY.exec(value);
  if (!match) return undefined;
  const nth = (match[1] === '-' ? -1 : 1) * Number(match[2]);
  return MONTHLY_NTH.includes(nth)
    ? { kind: 'weekday', nth, weekday: match[3] as Weekday }
    : undefined;
}

function readMonthDay(value: string): MonthlyMode | undefined {
  const match = MONTH_DAY.exec(value);
  if (!match) return undefined;
  const day = (match[1] === '-' ? -1 : 1) * Number(match[2]);
  if (day === -1) return { kind: 'last-day' };
  return day >= 1 && day <= 31 ? { kind: 'day', day } : undefined;
}

//-----------------------------------------------------------------------------
// DEFAULTS
//-----------------------------------------------------------------------------

/**
 * The rule Home Assistant's editor holds once a frequency is picked for an event starting at
 * `start`: every period, never ending, weekly on the start's weekday (`_computeWeekday`), and
 * monthly on the start's day of the month (the first of `getMonthlyRepeatItems`).
 *
 * Written with the same `start`, these come out exactly as Home Assistant writes them:
 * `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=TU` for a Tuesday, `FREQ=MONTHLY` and `FREQ=YEARLY`.
 *
 * @param freq - The frequency picked
 * @param start - The event's start, local
 * @returns The rule the editor starts from
 */
export function defaultRule(freq: Exclude<RepeatFreq, 'none'>, start: Date): RepeatRule {
  const rule: RepeatRule = {
    freq,
    interval: 1,
    weekdays: freq === 'weekly' ? [weekdayOf(start)] : [],
    end: { kind: 'never' },
  };
  if (freq === 'monthly') rule.monthly = { kind: 'day', day: start.getDate() };
  return rule;
}

/**
 * The end Home Assistant's editor fills in when the end is switched to `kind`
 * (`_onEndSelected`): `DEFAULT_COUNT` occurrences, or the date that many periods from today
 * (`untilValue`). The date counts from today, not from the event's start, as Home Assistant's
 * does, and lands on the last day of a shorter month the way `date-fns` `addMonths` does.
 *
 * @param kind - The end picked
 * @param freq - The rule's frequency
 * @param today - Today, local
 * @returns The end the editor starts from
 */
export function defaultEnd(
  kind: RepeatEnd['kind'],
  freq: Exclude<RepeatFreq, 'none'>,
  today: Date = new Date(),
): RepeatEnd {
  const count = DEFAULT_COUNT[freq];
  if (kind === 'never') return { kind };
  if (kind === 'after') return { kind, count };

  const [year, monthIndex, day] = [today.getFullYear(), today.getMonth(), today.getDate()];
  if (freq === 'daily' || freq === 'weekly') {
    const date = utcDate(year, monthIndex, day + count * (freq === 'weekly' ? 7 : 1));
    return {
      kind,
      until: isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
    };
  }
  const months = year * 12 + monthIndex + count * (freq === 'yearly' ? 12 : 1);
  const targetYear = Math.floor(months / 12);
  const targetMonth = months - targetYear * 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return { kind, until: isoDate(targetYear, targetMonth + 1, targetDay) };
}

/**
 * The monthly choices Home Assistant's editor offers for an event starting at `start`, in its
 * order (`getMonthlyRepeatItems` and `getWeekydaysForMonth` in `recurrence.ts`): the day of the
 * month; the nth weekday, unless the start falls in the month's last seven days after the
 * 28th; the last weekday, when the start falls in the month's last seven days; and the last day
 * of the month, when the start is that day.
 *
 * The first is what a fresh monthly rule already holds, and it writes no `BY` part at all: Home
 * Assistant gives that item no `bymonthday`, so picking it writes a bare `FREQ=MONTHLY`.
 * `buildRRule` does the same.
 *
 * @param start - The event's start, local
 * @returns The choices, first the default
 */
export function monthlyOptions(start: Date): MonthlyMode[] {
  const day = start.getDate();
  const weekday = weekdayOf(start);
  const length = daysInMonth(start.getFullYear(), start.getMonth());
  const inLastWeek = day + 7 > length;

  const options: MonthlyMode[] = [{ kind: 'day', day }];
  if (!inLastWeek || day <= 28) {
    options.push({ kind: 'weekday', nth: Math.floor((day - 1) / 7) + 1, weekday });
  }
  if (inLastWeek) options.push({ kind: 'weekday', nth: -1, weekday });
  if (day === length) options.push({ kind: 'last-day' });
  return options;
}

//-----------------------------------------------------------------------------
// WRITING
//-----------------------------------------------------------------------------

/**
 * Write a rule as Home Assistant's editor writes it (`_computeRRule`): no `RRULE:` prefix, and
 * the parts in the order `rrule`'s `optionsToString` puts them, `FREQ`, `INTERVAL`, `COUNT`,
 * `BYDAY`, `BYMONTHDAY`, then `UNTIL`. `INTERVAL` is written only above 1, and a monthly
 * ordinal is signed, `+2SU`, as `rrule`'s `Weekday.toString` writes it.
 *
 * A monthly rule on the start's own day of the month is written bare, `FREQ=MONTHLY`, which is
 * what Home Assistant writes for its first monthly choice; on another day, `BYMONTHDAY=n`. The
 * two repeat on the same days, so a rule read with an explicit `BYMONTHDAY` for its start's
 * day comes back bare.
 *
 * `UNTIL` is the last date at the start's wall-clock time, as Home Assistant computes it, but
 * in the browser's zone, where the card shows and edits times. An all-day event writes the
 * `DATE`, `20260115`. A timed one writes that instant in UTC, `20260115T083000Z`, because the
 * card writes the event's start in UTC and RFC 5545 then requires a UTC `UNTIL`. Home
 * Assistant's editor writes a floating wall-clock time in Home Assistant's zone instead,
 * `20260115T093000`, to match the floating start it writes.
 *
 * @param rule - The rule
 * @param options - Whether the event is all-day, and its start, local
 * @returns The rule as Home Assistant stores it
 * @throws RangeError when the rule holds a value Home Assistant's editor cannot write
 */
export function buildRRule(rule: RepeatRule, options: { allDay: boolean; start: Date }): string {
  const { allDay, start } = options;
  if (Number.isNaN(start.getTime())) throw new RangeError('Invalid start date');
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError(`Invalid interval: ${rule.interval}`);
  }

  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.end.kind === 'after') {
    if (!Number.isInteger(rule.end.count) || rule.end.count < 1) {
      throw new RangeError(`Invalid count: ${rule.end.count}`);
    }
    parts.push(`COUNT=${rule.end.count}`);
  }
  if (rule.freq === 'weekly') {
    const days = rule.weekdays.filter((day, index) => rule.weekdays.indexOf(day) === index);
    if (!days.every(isWeekday)) throw new RangeError(`Invalid weekdays: ${String(days)}`);
    if (days.length > 0) parts.push(`BYDAY=${days.join(',')}`);
  }
  if (rule.freq === 'monthly' && rule.monthly) {
    const part = monthlyPart(rule.monthly, start);
    if (part) parts.push(part);
  }
  if (rule.end.kind === 'on') parts.push(`UNTIL=${untilValue(rule.end.until, allDay, start)}`);
  return parts.join(';');
}

function monthlyPart(monthly: MonthlyMode, start: Date): string | undefined {
  switch (monthly.kind) {
    case 'day':
      if (!Number.isInteger(monthly.day) || monthly.day < 1 || monthly.day > 31) {
        throw new RangeError(`Invalid day of the month: ${monthly.day}`);
      }
      return monthly.day === start.getDate() ? undefined : `BYMONTHDAY=${monthly.day}`;
    case 'weekday':
      if (!MONTHLY_NTH.includes(monthly.nth) || !isWeekday(monthly.weekday)) {
        throw new RangeError(`Invalid monthly weekday: ${monthly.nth}${monthly.weekday}`);
      }
      return `BYDAY=${monthly.nth > 0 ? '+' : ''}${monthly.nth}${monthly.weekday}`;
    case 'last-day':
      return 'BYMONTHDAY=-1';
  }
}

function untilValue(until: string, allDay: boolean, start: Date): string {
  const date = readIsoDate(until);
  if (!date) throw new RangeError(`Invalid end date: ${until}`);
  if (allDay) return until.replace(/-/g, '');

  const last = new Date(start.getTime());
  last.setFullYear(date[0], date[1] - 1, date[2]);
  return `${last.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

//-----------------------------------------------------------------------------
// WORDING
//-----------------------------------------------------------------------------

/**
 * A rule in words, as Home Assistant's event dialog shows it (`renderRRuleAsText`, which is
 * `rrule`'s `toText` with its words looked up in Home Assistant's translations), capitalized
 * the way Home Assistant's `capitalizeFirstLetter` does: "Every week on Tuesday", "Every 2
 * months on the last Friday", "Every day until January 15, 2026", "Every year for 5 times".
 *
 * Every word comes from `localize`, keyed `ui.components.calendar.event.rrule.<word>`; day and
 * month names come from `Intl` in `locale`; numbers and the comma between weekdays are written
 * as `rrule` writes them. The text keeps `rrule`'s quirks, because they are what Home Assistant
 * shows: "Every 2 weeks days" for a fortnightly rule on all seven days, "Every 101 day" (its
 * plural test is `n % 100 !== 1`), and ordinals with no suffix, "Every month on the 2 Sunday".
 * `rrule` asks for `st`, `nd`, `rd` and `th`, Home Assistant has no such words and its
 * `localize` answers an empty string, so the number stands alone; this asks too, so a suffix
 * Home Assistant adds later appears here as well.
 *
 * The end date is the local date the rule is read as ending on (see `parseRRule`). For a timed
 * rule whose UTC `UNTIL` falls on another day here, Home Assistant shows the UTC date instead.
 *
 * @param rrule - The rule as Home Assistant stores it
 * @param localize - Resolves a Home Assistant translation key, empty or the key itself when
 *   there is none
 * @param locale - BCP 47 language tag for day and month names
 * @returns The rule in words, or undefined for no rule, a custom one, a word `localize` does not
 *   know, or a locale `Intl` does not accept
 */
export function describeRRule(
  rrule: string | null | undefined,
  localize: (key: string) => string,
  locale: string,
): string | undefined {
  const parsed = parseRRule(rrule);
  if (parsed.kind !== 'rule') return undefined;
  try {
    return wordRule(parsed.rule, localize, locale);
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/** `rrule`'s `toText` for the rules the editor can show. Throws RangeError on a bad locale. */
function wordRule(
  rule: RepeatRule,
  localize: (key: string) => string,
  locale: string,
): string | undefined {
  const missing: string[] = [];
  const lookup = (token: string): string => {
    const key = TOKEN_PREFIX + token;
    const text = localize(key);
    return text && text !== key ? text : '';
  };
  const word = (token: string): string => {
    const text = lookup(token);
    if (!text) missing.push(token);
    return text;
  };
  const plural = (n: number) => n % 100 !== 1;
  const nth = (n: number): string =>
    n === -1 ? word('last') : `${n}${lookup(ORDINAL_SUFFIX.get(n) ?? 'th')}`;
  const dayNames = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const dayName = (day: Weekday) =>
    dayNames.format(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day), 12));

  const words = [word('every')];
  const { interval } = rule;
  const counted = interval !== 1 ? [String(interval)] : [];
  switch (rule.freq) {
    case 'daily':
      words.push(...counted, word(plural(interval) ? 'days' : 'day'));
      break;
    case 'weekly': {
      const days = WEEKDAYS.filter((day) => rule.weekdays.includes(day));
      const workdays = days.length === 5 && !days.includes('SA') && !days.includes('SU');
      if (interval !== 1) words.push(...counted, word(plural(interval) ? 'weeks' : 'week'));
      if (workdays) {
        words.push(...(interval === 1 ? [word('weekday')] : [word('on'), word('weekdays')]));
      } else if (days.length === 7) {
        words.push(word(plural(interval) ? 'days' : 'day'));
      } else {
        if (interval === 1) words.push(word('week'));
        if (days.length > 0) words.push(word('on'), days.map(dayName).join(', '));
      }
      break;
    }
    case 'monthly': {
      words.push(...counted, word(plural(interval) ? 'months' : 'month'));
      const { monthly } = rule;
      if (monthly) {
        words.push(
          word('on the'),
          monthly.kind === 'day'
            ? nth(monthly.day)
            : monthly.kind === 'last-day'
              ? nth(-1)
              : `${nth(monthly.nth)} ${dayName(monthly.weekday)}`,
        );
      }
      break;
    }
    case 'yearly':
      words.push(...counted, word(plural(interval) ? 'years' : 'year'));
      break;
  }

  if (rule.end.kind === 'on') {
    const [year, month, day] = rule.end.until.split('-').map(Number);
    const date = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(utcDate(year, month - 1, day).setUTCHours(12));
    words.push(word('until'), date);
  } else if (rule.end.kind === 'after') {
    const { count } = rule.end;
    words.push(word('for'), String(count), word(plural(count) ? 'times' : 'time'));
  }

  if (missing.length > 0) return undefined;
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
