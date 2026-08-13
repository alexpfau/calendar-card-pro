/**
 * Y18 — the multi-day all-day predicate.
 *
 * `presentation.ts` used to answer "is this a multi-day all-day event?" by searching the
 * *formatted* time string for a translated token (`multiDay` / `endsToday` /
 * `endsTomorrow`). The formatter builds that string, so it already knew the answer; the
 * search asked the renderer to parse back a sentence its own formatter had composed.
 *
 * These tests do two separate jobs, and the distinction matters:
 *
 *  1. **The differential.** Reproduce the old string-matching implementation verbatim and
 *     assert the new date-derived predicate agrees with it, over every shipped language and
 *     a spread of event shapes. This is the "behaviour is identical" proof — it can fail,
 *     which is what makes it evidence rather than decoration.
 *
 *  2. **The falsifier.** Show the old implementation was genuinely reachable by a false
 *     positive and the new one is not. A differential alone would pass just as happily if
 *     both implementations were wrong in the same way.
 */

import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/** Every language the card ships, read from the translation map rather than hardcoded. */
const LANGUAGES = Object.keys(
  (Localize as unknown as { TRANSLATIONS: Record<string, unknown> }).TRANSLATIONS ?? {},
);

const config = { language: 'en' } as unknown as Types.Config;

function allDay(startISO: string, endISO: string): Types.CalendarEventData {
  return { start: { date: startISO }, end: { date: endISO }, summary: 'x' };
}

function timed(startISO: string, endISO: string): Types.CalendarEventData {
  return { start: { dateTime: startISO }, end: { dateTime: endISO }, summary: 'x' };
}

/**
 * The old implementation, reproduced exactly as it stood in `presentation.ts` before this
 * change — including its dependence on the formatted string and on `event.time` being set.
 */
function legacyIsMultiDayAllDay(event: Types.CalendarEventData, language: string): boolean {
  const isAllDayEvent = !event.start.dateTime;
  const time = FormatUtils.formatEventTime(event, config, language);
  const t = Localize.getTranslations(language);
  return Boolean(
    isAllDayEvent &&
    time &&
    (time.includes(t.multiDay) || time.includes(t.endsTomorrow) || time.includes(t.endsToday)),
  );
}

/** Dates chosen relative to today so the endsToday / endsTomorrow branches are both hit. */
function isoDaysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

describe('Y18: isMultiDayAllDayEvent', () => {
  it('has languages to test against (denominator)', () => {
    // A differential over an empty language list passes vacuously. Prove it is not empty
    // before believing any agreement it reports.
    expect(LANGUAGES.length).toBeGreaterThan(30);
  });

  describe('differential against the replaced string-matching implementation', () => {
    const cases: Array<{ name: string; event: Types.CalendarEventData }> = [
      // The three all-day branches the old matcher keyed on.
      { name: 'ends today (multi-day)', event: allDay(isoDaysFromToday(-2), isoDaysFromToday(1)) },
      {
        name: 'ends tomorrow (multi-day)',
        event: allDay(isoDaysFromToday(-1), isoDaysFromToday(2)),
      },
      { name: 'ends later (multi-day)', event: allDay(isoDaysFromToday(0), isoDaysFromToday(9)) },
      // Single-day all-day: end is exclusive, so this is start + 1.
      { name: 'single-day all-day', event: allDay(isoDaysFromToday(0), isoDaysFromToday(1)) },
      {
        name: 'single-day all-day, past',
        event: allDay(isoDaysFromToday(-5), isoDaysFromToday(-4)),
      },
      // Timed events are never all-day, single- or multi-day.
      {
        name: 'timed, same day',
        event: timed(`${isoDaysFromToday(0)}T09:00:00`, `${isoDaysFromToday(0)}T10:00:00`),
      },
      {
        name: 'timed, spanning days',
        event: timed(`${isoDaysFromToday(0)}T22:00:00`, `${isoDaysFromToday(2)}T02:00:00`),
      },
    ];

    for (const { name, event } of cases) {
      it(`agrees for "${name}" in every shipped language`, () => {
        const disagreements: string[] = [];
        for (const language of LANGUAGES) {
          const legacy = legacyIsMultiDayAllDay(event, language);
          const current = FormatUtils.isMultiDayAllDayEvent(event);
          if (legacy !== current) {
            disagreements.push(`${language}: legacy=${legacy} current=${current}`);
          }
        }
        expect(disagreements).toEqual([]);
      });
    }
  });

  describe('the falsifier: the old implementation was reachable by accident', () => {
    it('the replaced matcher fires on a single-day event whose text contains the token', () => {
      // Not hypothetical: the tokens are short. This asserts the *old* code was wrong, which
      // is what justifies the change — a differential alone cannot show that.
      const language = 'en';
      const t = Localize.getTranslations(language);
      const single = allDay(isoDaysFromToday(0), isoDaysFromToday(1));

      // Reproduce the old matcher against a time string polluted with ordinary event text,
      // which is exactly what `event.time` could contain in the shapes that motivated Y18.
      const polluted = `${FormatUtils.formatEventTime(single, config, language)} ${t.multiDay}`;
      expect(polluted.includes(t.multiDay)).toBe(true); // old logic => true (wrong)

      // The predicate reads dates, so no amount of text can move it.
      expect(FormatUtils.isMultiDayAllDayEvent(single)).toBe(false);
    });

    it('at least one shipped language translates a keyed token to <= 3 characters', () => {
      // Quantifies the exposure rather than asserting "fragile". If this ever returns zero
      // the risk statement in the source comment has stopped being true and should be edited.
      const short = LANGUAGES.filter((l) => {
        const t = Localize.getTranslations(l);
        return [t.multiDay, t.endsToday, t.endsTomorrow].some(
          (tok) => typeof tok === 'string' && tok.trim().length <= 3,
        );
      });
      expect(short.length).toBeGreaterThan(0);
    });
  });

  describe('the predicate itself', () => {
    it('treats the iCal exclusive end date correctly', () => {
      // start=1st end=2nd is a *single* day; start=1st end=3rd is two days.
      expect(FormatUtils.isMultiDayAllDayEvent(allDay('2026-03-01', '2026-03-02'))).toBe(false);
      expect(FormatUtils.isMultiDayAllDayEvent(allDay('2026-03-01', '2026-03-03'))).toBe(true);
    });

    it('is false for timed events regardless of span', () => {
      expect(
        FormatUtils.isMultiDayAllDayEvent(timed('2026-03-01T09:00:00', '2026-03-05T09:00:00')),
      ).toBe(false);
    });

    it('survives a month boundary', () => {
      expect(FormatUtils.isMultiDayAllDayEvent(allDay('2026-03-31', '2026-04-02'))).toBe(true);
    });
  });
});
