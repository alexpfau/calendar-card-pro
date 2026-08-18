/**
 * Regression tests for `getDateFormatStyle`.
 *
 * This function decides how every date on the card is ordered — `17. Mar`, `Mar 17`, or
 * `17 Mar` — from the language alone. It has three outcomes, two of which are named-language
 * special cases and one of which is the fallback that serves everyone else.
 *
 * It had no test of its own. `de` and `hu` were pinned only *incidentally*, by suites that
 * happen to render a German or English date and would notice the string changing; nothing
 * referenced the function directly, and no test rendered a date in any of the other
 * languages. Mutation testing found the consequence: rewriting the fallback `return` to a
 * different style left all ten gates green while silently reordering the date for the large
 * majority of shipped languages. Dropping `hr` or `hu` from their branches was invisible for
 * the same reason.
 *
 * So these tests assert the mapping directly and over the whole shipped corpus, rather than
 * through a rendered date. The point is that the fallback is a real, asserted contract and
 * not merely the branch nothing happened to exercise.
 */

import { describe, expect, it } from 'vitest';

import { TRANSLATIONS, getDateFormatStyle } from '../src/translations/localize';

/**
 * Every language the card ships, taken from the registry the card actually resolves
 * against rather than from a directory glob — the same corpus, and for the same reasons,
 * as `translations.test.ts`.
 */
const LANGUAGES = Object.keys(TRANSLATIONS);

/** Languages that render the day, a dot, then the month (`17. Mar`). */
const DAY_DOT_MONTH = ['de', 'hr'];

/** Languages that render the month before the day (`Mar 17`). */
const MONTH_DAY = ['en', 'hu'];

describe('date format style', () => {
  it('resolves against a corpus large enough for the loops below to mean something', () => {
    // Guards the denominator. Deriving the fallback set by subtraction means an empty or
    // gutted registry would make every fallback assertion below vacuously true.
    expect(LANGUAGES.length).toBeGreaterThan(30);
    for (const code of [...DAY_DOT_MONTH, ...MONTH_DAY]) {
      expect(LANGUAGES, `${code} must be a shipped language`).toContain(code);
    }
  });

  it.each(DAY_DOT_MONTH)('gives %s the day, a dot, then the month', (language) => {
    expect(getDateFormatStyle(language)).toBe('day-dot-month');
  });

  it.each(MONTH_DAY)('gives %s the month before the day', (language) => {
    expect(getDateFormatStyle(language)).toBe('month-day');
  });

  it('gives every other shipped language the day before the month', () => {
    const fallback = LANGUAGES.filter(
      (code) => !DAY_DOT_MONTH.includes(code) && !MONTH_DAY.includes(code),
    );

    // The branch that carries the majority of the corpus, and the one a mutation could
    // rewrite without any suite noticing.
    expect(fallback.length).toBeGreaterThan(25);
    for (const language of fallback) {
      expect(getDateFormatStyle(language), language).toBe('day-month');
    }
  });

  /**
   * `en-GB` is the case that makes the fallback load-bearing rather than incidental. It is
   * an English locale, but the comparison is an exact `=== 'en'`, so it falls through to
   * `day-month` — which is the correct British ordering. Folding it into the `en` branch
   * would be a real regression, and only this assertion would see it.
   */
  it('leaves en-GB on the British ordering rather than the American one', () => {
    expect(getDateFormatStyle('en-GB')).toBe('day-month');
    expect(getDateFormatStyle('en')).toBe('month-day');
  });

  it('matches languages case-insensitively', () => {
    expect(getDateFormatStyle('DE')).toBe('day-dot-month');
    expect(getDateFormatStyle('HU')).toBe('month-day');
  });

  it('falls back rather than throwing on a missing or unknown language', () => {
    expect(getDateFormatStyle('')).toBe('day-month');
    expect(getDateFormatStyle(undefined as unknown as string)).toBe('day-month');
    expect(getDateFormatStyle('qq')).toBe('day-month');
  });
});
