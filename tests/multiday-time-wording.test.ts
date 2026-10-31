import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/**
 * The time an unsplit multi-day timed event reads, around "tomorrow".
 *
 * `formatMultiDayTime` builds an end phrase and joins it after the start time with
 * `multiDay` ("until"). For an end on a date that reads naturally — "22:30 until Friday,
 * 23 October at 17:00" — but `endsTomorrow` is a phrase with its own verb, so the join read
 * "22:30 until ends tomorrow at 0:30", and "22:30 bis endet morgen um 0:30" in German. It
 * takes a comma now, as the all-day label already does ("All day, ends tomorrow"), with no
 * new string in any language.
 */

/** Wednesday 21 October 2026, 10:30 local. */
const NOW = new Date(2026, 9, 21, 10, 30);

/** Every language the card ships, read from the map rather than hardcoded. */
const LANGUAGES = Object.keys(
  (Localize as unknown as { TRANSLATIONS: Record<string, unknown> }).TRANSLATIONS,
);

/** A timed event between two local wall-clock times. */
function timed(start: Date, end: Date): Types.CalendarEventData {
  return {
    summary: 'Ben night shift',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

const config = buildConfig({ split_multiday_events: false, time_24h: true });

/** The event time as the card writes it. */
function timeOf(event: Types.CalendarEventData, language = 'en'): string {
  return FormatUtils.formatEventTime(event, config, language);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an unsplit multi-day timed event', () => {
  const tonight = timed(new Date(2026, 9, 21, 22, 30), new Date(2026, 9, 22, 0, 30));

  it('starting today and ending tomorrow reads with a comma', () => {
    expect(timeOf(tonight)).toBe('22:30, ends tomorrow at 0:30');
    expect(timeOf(tonight, 'de')).toBe('22:30, endet morgen um 0:30');
  });

  it('never puts "until" in front of "ends tomorrow", in any language', () => {
    expect(LANGUAGES.length, 'no languages found').toBeGreaterThan(30);

    for (const language of LANGUAGES) {
      const t = Localize.getTranslations(language);
      const out = timeOf(tonight, language);

      expect(out, language).not.toContain(`${t.multiDay} ${t.endsTomorrow}`);
      expect(out, language).toContain(`, ${t.endsTomorrow} ${t.at} `);
    }
  });

  it('keeps "until" before a date', () => {
    const toFriday = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));

    expect(timeOf(toFriday)).toBe('9:00 until Friday, Oct 23 at 17:00');
  });

  it('that started before today keeps its own sentence', () => {
    const overnight = timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 22, 8, 0));

    expect(timeOf(overnight)).toBe('Ends tomorrow at 8:00');
  });

  it('agrees with the all-day label it now follows', () => {
    const allDay: Types.CalendarEventData = {
      summary: 'Anna away',
      start: { date: '2026-10-21' },
      end: { date: '2026-10-23' },
    };

    expect(timeOf(allDay)).toBe('All day, ends tomorrow');
  });
});
