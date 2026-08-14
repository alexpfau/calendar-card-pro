/**
 * Weekday parity between the two multi-day formatters.
 *
 * `formatMultiDayTime` (timed) and `formatMultiDayAllDayTime` (all-day) are structurally
 * parallel: both render "<prefix> until <end date>" for an event ending beyond tomorrow.
 * Only the timed one interpolated the weekday, so a timed event read "until Friday, 15
 * August" while an all-day event covering exactly the same span read "all day, until 15
 * August". That asymmetry shipped for the entire life of the card and was found by reading
 * a test card, not by any gate — nothing was wrong, the two were merely different.
 *
 * These tests assert the two branches agree, rather than pinning either output string.
 * A snapshot would have to be rewritten by every translation edit; a differential only
 * fails when the two formatters genuinely diverge, which is the property being protected.
 *
 * The negative control is what gives the assertion teeth: a `toContain` on a weekday could
 * pass by accident if the token happened to appear elsewhere in the string, so each case
 * also asserts a *different* weekday is absent.
 */

import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/** Every language the card ships, read from the map rather than hardcoded. */
const LANGUAGES = Object.keys(
  (Localize as unknown as { TRANSLATIONS: Record<string, unknown> }).TRANSLATIONS ?? {},
);

const config = { language: 'en' } as unknown as Types.Config;

/** `YYYY-MM-DD` for `now + days`, in local time — the form an all-day event carries. */
function isoDay(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function dayAt(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

// Far enough out that both formatters take their "ends beyond tomorrow" branch, which is
// the only one that renders a date at all. `endsToday` / `endsTomorrow` render neither a
// date nor a weekday in either formatter, so they are already symmetric.
const START_OFFSET = 10;
const END_OFFSET = 14;

/** All-day: iCal DTEND is exclusive, so the inclusive last day is END_OFFSET. */
const allDayEvent: Types.CalendarEventData = {
  start: { date: isoDay(START_OFFSET) },
  end: { date: isoDay(END_OFFSET + 1) },
  summary: 'x',
};

/** Timed: same span, so the same weekday must appear. */
const timedEvent: Types.CalendarEventData = {
  start: { dateTime: dayAt(START_OFFSET).toISOString() },
  end: { dateTime: new Date(dayAt(END_OFFSET).getTime() + 10 * 3600 * 1000).toISOString() },
  summary: 'x',
};

describe('multi-day weekday parity', () => {
  const endDow = dayAt(END_OFFSET).getDay();

  it.each(LANGUAGES)('%s names the end weekday in both formatters', (language) => {
    const translations = Localize.getTranslations(language);
    const weekday = translations.fullDaysOfWeek[endDow];

    const timedOut = FormatUtils.formatEventTime(timedEvent, config, language);
    const allDayOut = FormatUtils.formatEventTime(allDayEvent, config, language);

    // The property under test: both branches name the day the event ends.
    expect(timedOut.toLowerCase()).toContain(weekday.toLowerCase());
    expect(allDayOut.toLowerCase()).toContain(weekday.toLowerCase());
  });

  it.each(LANGUAGES)('%s does not name some other weekday', (language) => {
    const translations = Localize.getTranslations(language);
    const wrong = translations.fullDaysOfWeek[(endDow + 3) % 7];
    const right = translations.fullDaysOfWeek[endDow];

    const allDayOut = FormatUtils.formatEventTime(allDayEvent, config, language);

    // Negative control. Skipped only where the two names are not distinguishable by
    // substring — some languages share a stem, and asserting absence of a substring of
    // the correct answer would fail for the wrong reason.
    if (!right.toLowerCase().includes(wrong.toLowerCase())) {
      expect(allDayOut.toLowerCase()).not.toContain(wrong.toLowerCase());
    }
  });

  it('renders the inclusive end day, not the exclusive DTEND', () => {
    // A weekday makes an off-by-one visible that a bare date hides, so pin the direction:
    // the event's DTEND is END_OFFSET + 1 and the string must name END_OFFSET.
    const translations = Localize.getTranslations('en');
    const out = FormatUtils.formatEventTime(allDayEvent, config, 'en');

    expect(out).toContain(translations.fullDaysOfWeek[dayAt(END_OFFSET).getDay()]);
    expect(out).not.toContain(translations.fullDaysOfWeek[dayAt(END_OFFSET + 1).getDay()]);
  });
});
