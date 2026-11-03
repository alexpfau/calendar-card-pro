/**
 * What the event popover edits, kept apart from how it draws it.
 *
 * The popover opens on one event, or on a new one, and keeps the changes as a draft until it
 * closes: saving happens once, on close, never per keystroke (see `event-popover.ts`). This
 * module builds the draft from what the card hands over, tells whether anything changed and
 * whether Home Assistant would accept it, and turns it into the write command's event. No DOM,
 * no Lit.
 */

import * as Writes from './calendar-writes';
import * as Times from './event-times';
import * as RRule from './rrule';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A calendar the popover can name, and a new event can go to. */
export interface PopoverCalendar {
  id: string;
  name: string;
  /** Its accent color, resolved to a value that means something outside the card. */
  color: string;
}

/** An event as Home Assistant stores it, which the popover opens on. */
export interface StoredEvent {
  summary: string;
  dtstart: string;
  dtend: string;
  description?: string;
  location?: string;
  uid?: string;
  recurrence_id?: string;
  rrule?: string;
  status?: string;
}

/** Where the press was that opened the popover, which it opens beside. */
export interface PopoverAnchor {
  x: number;
  y: number;
  /**
   * The pressed element's box, for a press without a position of its own: a key, or the add
   * button. A pointer's press has none, and the popover opens at its point.
   */
  rect?: { left: number; top: number; right: number; bottom: number };
}

/** What the card hands the popover, through Home Assistant's `show-dialog`. */
export interface PopoverParams {
  /** An existing event, or a new one. */
  mode: 'event' | 'new';
  /** The event's calendar, or for a new event the one preselected. */
  calendarId: string;
  /** The event as stored, for an existing one. */
  entry?: StoredEvent;
  /**
   * The title, location and description as the card shows them, its text replacements applied.
   * Shown while a field is not being edited; editing shows and saves what is stored.
   */
  display?: { title: string; location: string; description: string };
  /** Whether the event may be changed here, and deleted. */
  canEdit: boolean;
  canDelete: boolean;
  /** The event's color. */
  color?: string;
  /**
   * The calendars to name. For an event, its own first, then any it may be moved to; for a new
   * event, every one it may go to.
   */
  calendars: PopoverCalendar[];
  /** Where a new event starts and ends. */
  times?: Times.EventTimes;
  /** Home Assistant's language, for dates and day names. */
  language: string;
  /** Whether times read on a 24-hour clock, as the card's rows read them. */
  hour24: boolean;
  /** Whether the popover is drawn dark. */
  dark: boolean;
  anchor?: PopoverAnchor;
  /**
   * Called once Home Assistant has saved a change, naming the calendars written to: one, or
   * for a move both. Returns nothing: the card refetches without the popover waiting on it.
   */
  updated: (...calendarIds: string[]) => undefined;
}

/** The repeat rule as the popover edits it. */
export type RepeatState = ReturnType<typeof RRule.parseRRule>;

/** Everything the popover lets you change. */
export interface Draft {
  calendarId: string;
  summary: string;
  location: string;
  description: string;
  times: Times.EventTimes;
  repeat: RepeatState;
  /** The rule as stored, written back unchanged while the repeat is not touched. */
  storedRule?: string;
}

//-----------------------------------------------------------------------------
// BUILDING
//-----------------------------------------------------------------------------

/**
 * The draft a popover opens with.
 *
 * @param params - What the card handed over
 * @param now - The current time, for a new event without times of its own
 * @returns The draft, or undefined for an event whose times cannot be read
 */
export function draftFromParams(params: PopoverParams, now: Date = new Date()): Draft | undefined {
  if (params.mode === 'new') {
    const start =
      params.times?.start ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const times = params.times ?? {
      allDay: false,
      start,
      end: new Date(start.getTime() + 3600000),
    };
    return {
      calendarId: params.calendarId,
      summary: '',
      location: '',
      description: '',
      times,
      repeat: { kind: 'none' },
    };
  }

  const entry = params.entry;
  if (!entry) return undefined;
  const times = Times.timesFromEntry(entry.dtstart, entry.dtend);
  if (!times) return undefined;
  return {
    calendarId: params.calendarId,
    summary: entry.summary ?? '',
    location: entry.location ?? '',
    description: entry.description ?? '',
    times,
    repeat: RRule.parseRRule(entry.rrule),
    storedRule: entry.rrule || undefined,
  };
}

/** RFC 5545's weekday for each `Date.getDay()`, Sunday first. */
const WEEKDAY_OF: readonly RRule.Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Whether two monthly choices are the same kind of choice: both a day of the month, both an
 * nth weekday, both the last weekday, or both the last day.
 */
function sameMonthlyKind(a: RRule.MonthlyMode, b: RRule.MonthlyMode): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'weekday' || b.kind !== 'weekday' || Math.sign(a.nth) === Math.sign(b.nth);
}

function sameMonthly(a: RRule.MonthlyMode, b: RRule.MonthlyMode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A repeat rule moved with its event's start, so the series stays on the day the event moved
 * to: a weekly rule on the start's own weekday follows it to the new weekday, as Home
 * Assistant's editor does (`_computeWeekday`), and a monthly rule keeps the same choice among
 * the new start's, the day of the month, the nth weekday or the last. A rule tied to some other
 * day, such as weekly on Monday and Friday, stays as it is, and so does a custom one.
 *
 * @param repeat - The repeat as it stands
 * @param from - The start it was chosen for
 * @param to - The new start
 * @returns The repeat for the new start
 */
export function rebaseRepeat(repeat: RepeatState, from: Date, to: Date): RepeatState {
  if (repeat.kind !== 'rule') return repeat;
  const rule = repeat.rule;
  if (rule.freq === 'weekly') {
    const before = WEEKDAY_OF[from.getDay()];
    const after = WEEKDAY_OF[to.getDay()];
    return rule.weekdays.length === 1 && rule.weekdays[0] === before && before !== after
      ? { kind: 'rule', rule: { ...rule, weekdays: [after] } }
      : repeat;
  }
  if (rule.freq === 'monthly' && rule.monthly) {
    const chosen = RRule.monthlyOptions(from).find((mode) => sameMonthly(mode, rule.monthly!));
    if (!chosen) return repeat;
    const options = RRule.monthlyOptions(to);
    const monthly = options.find((mode) => sameMonthlyKind(mode, chosen)) ?? options[0];
    return sameMonthly(monthly, rule.monthly)
      ? repeat
      : { kind: 'rule', rule: { ...rule, monthly } };
  }
  return repeat;
}

/**
 * Whether two drafts differ in anything the popover would write.
 *
 * @param draft - The draft now
 * @param original - The draft the popover opened with
 * @returns Whether saving would change anything
 */
export function isDirty(draft: Draft, original: Draft): boolean {
  return (
    draft.calendarId !== original.calendarId ||
    draft.summary !== original.summary ||
    draft.location !== original.location ||
    draft.description !== original.description ||
    draft.times.allDay !== original.times.allDay ||
    draft.times.start.getTime() !== original.times.start.getTime() ||
    draft.times.end.getTime() !== original.times.end.getTime() ||
    repeatKey(draft) !== repeatKey(original)
  );
}

/**
 * Whether a series can be moved to another calendar from one of its occurrences on, written
 * with this rule. It must have a rule: an occurrence changed on its own comes without its
 * series' rule, and would arrive as a single event while the series' future left. And the rule
 * must end never or on a date: one ending after a count would start counting again from the
 * occurrence moved, and the card cannot tell how many are left without the series' start.
 *
 * @param rule - The rule the move would write
 * @returns Whether the series' future may move
 */
export function seriesMovable(rule: string | undefined): boolean {
  return Boolean(rule) && !/(?:^|;)COUNT=/i.test(rule ?? '');
}

/**
 * A repeat rule as the string it would be written as, for comparing two drafts.
 *
 * @param draft - A draft
 * @returns The rule, or an empty string for none
 */
function repeatKey(draft: Draft): string {
  return writtenRule(draft) ?? '';
}

/**
 * The rule a draft writes: a custom rule as it came, a rule the popover can show rebuilt from
 * its parts, nothing for none.
 *
 * @param draft - A draft
 * @returns The RRULE string, or undefined
 */
export function writtenRule(draft: Draft): string | undefined {
  if (draft.repeat.kind === 'custom') return draft.repeat.raw;
  if (draft.repeat.kind === 'rule') {
    return RRule.buildRRule(draft.repeat.rule, {
      allDay: draft.times.allDay,
      start: draft.times.start,
    });
  }
  return undefined;
}

/** Why Home Assistant would refuse a draft: no title, or an end that is not after the start. */
export type DraftProblem = 'missing' | 'duration';

/**
 * Whether Home Assistant would accept a draft, and if not why.
 *
 * @param draft - The draft
 * @returns The problem, or undefined when there is none
 */
export function draftProblem(draft: Draft): DraftProblem | undefined {
  if (!draft.summary.trim() || !draft.calendarId) return 'missing';
  if (!Times.validTimes(draft.times)) return 'duration';
  return undefined;
}

/**
 * The event the write command sends for a draft.
 *
 * A change to one occurrence of a repeating event cannot change how it repeats, so its rule is
 * left out, as Home Assistant's own editor leaves it out. An unchanged rule is sent as it was
 * stored, so a rule the popover could not have written itself survives an edit of the title.
 *
 * @param draft - The draft
 * @param original - The draft the popover opened with
 * @param range - For an occurrence of a repeating event, which occurrences the change covers
 * @returns The event to write
 */
export function eventWrite(
  draft: Draft,
  original: Draft | undefined,
  range?: Writes.RecurrenceRange,
): Writes.EventWrite {
  const times = Times.writeTimes(draft.times);
  const rule =
    original && repeatKey(draft) === repeatKey(original) ? original.storedRule : writtenRule(draft);
  return {
    summary: draft.summary.trim(),
    dtstart: times.dtstart,
    dtend: times.dtend,
    description: draft.description,
    location: draft.location,
    ...(rule && range !== '' ? { rrule: rule } : {}),
  };
}

//-----------------------------------------------------------------------------
// WORDS
//-----------------------------------------------------------------------------

/**
 * The span in words, as the popover's time cell shows it: the date and the times on one line,
 * or two dates for an event that ends on a later day.
 *
 * @param times - The span
 * @param language - Home Assistant's language
 * @param hour24 - Whether times read on a 24-hour clock
 * @returns The line
 */
export function spanText(times: Times.EventTimes, language: string, hour24: boolean): string {
  const day = new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !hour24,
  });
  const sameDay = Times.dateValue(times.start) === Times.dateValue(times.end);

  if (times.allDay) {
    return sameDay
      ? day.format(times.start)
      : `${day.format(times.start)} – ${day.format(times.end)}`;
  }
  // An end at midnight is the end of the day before, as a reader counts days.
  const endsAtMidnight = times.end.getHours() === 0 && times.end.getMinutes() === 0;
  const lastDay = endsAtMidnight ? Times.addDays(times.end, -1) : times.end;
  if (Times.dateValue(times.start) === Times.dateValue(lastDay)) {
    return `${day.format(times.start)}  ${time.format(times.start)} – ${time.format(times.end)}`;
  }
  return `${day.format(times.start)} ${time.format(times.start)} – ${day.format(times.end)} ${time.format(times.end)}`;
}
