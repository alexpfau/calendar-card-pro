/**
 * The event weather badge must be styled in BOTH views.
 *
 * This exists because it was not, and nothing noticed. The badge's size and colour moved
 * from inline styles on the renderer to CSS custom properties, but the only rules reading
 * those properties were scoped `.time-location .event-weather …` — and only column view
 * puts the badge inside `.time-location`. List view puts it in `summary-row`, so
 * `weather.event.font_size` and `weather.event.color` did nothing there, and at defaults
 * the badge silently inherited the event row instead of rendering at 12px.
 *
 * Every existing gate was blind to it:
 *
 *   - the DOM snapshots pin *markup*, and the markup did not change
 *   - the column DOM tests exercise the placement that still worked
 *   - `check:docs` reconciles option tables against `DEFAULT_CONFIG`, and the options
 *     were still there — they had simply stopped doing anything
 *
 * So this asserts on the stylesheet itself: that a selector reaching the badge *without*
 * a `.time-location` ancestor supplies both properties. That is the level the defect
 * lived at, and happy-dom has no layout engine, so a rendered assertion could not see it
 * either.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';

/** The stylesheet as text, with comments stripped so prose cannot satisfy a match. */
const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Selector blocks as [selector, body] pairs. */
function rules(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push([m[1].trim().replace(/\s+/g, ' '), m[2]]);
  }
  return out;
}

/** Rules that reach `.event-weather` WITHOUT depending on a `.time-location` ancestor. */
function listReachable(declaration: string): Array<[string, string]> {
  return rules().filter(
    ([sel, body]) =>
      sel.includes('.event-weather') &&
      !sel.includes('.time-location') &&
      body.includes(declaration),
  );
}

/**
 * As above, but restricted to selectors reaching the badge's **text**.
 *
 * The distinction is load-bearing and was found by breaking this test rather than by
 * writing it: re-scoping the text rules to `.time-location` — i.e. reproducing the
 * original defect exactly — failed only one assertion, because the sibling
 * `.event-weather ha-icon` rule also carries a colour and kept satisfying a plain
 * `.event-weather` search. The icon being coloured is no comfort to a user reading grey
 * text at the wrong size, so the assertions that matter must name the text.
 */
function listReachableText(declaration: string): Array<[string, string]> {
  return listReachable(declaration).filter(([sel]) => sel.includes('.event-weather-text'));
}

describe('event weather badge styling', () => {
  it('the stylesheet parses into rules at all (denominator)', () => {
    // A parser that silently returns [] would make every assertion below vacuous.
    expect(rules().length).toBeGreaterThan(100);
    expect(css).toContain('.event-weather');
  });

  describe('list view (summary-row placement)', () => {
    it('supplies a font size that does not require .time-location', () => {
      const found = listReachableText('--calendar-card-weather-event-font-size');
      expect(found.length).toBeGreaterThan(0);
    });

    it('supplies a text colour that does not require .time-location', () => {
      const found = listReachableText('--calendar-card-weather-event-color');
      expect(found.length).toBeGreaterThan(0);
    });

    it('falls back to the primary text colour, matching what the badge sits beside', () => {
      // In the list the badge sits next to the primary-coloured event title; in column
      // view next to secondary-coloured time/location rows. The fallback differs on
      // purpose, so pin it — otherwise "fixing" the inconsistency would regress one view.
      const found = listReachableText('--calendar-card-weather-event-color');
      expect(found.some(([, body]) => body.includes('var(--primary-text-color)'))).toBe(true);
    });

    it('does not emit the colour property unconditionally from the host', () => {
      // The other half of the defect. Baking a default into the host property makes the
      // per-placement `var()` fallbacks unreachable, so both views get whichever default
      // was baked in — which is how the column's answer became the only answer.
      const styles = generateCustomPropertiesObject({
        ...DEFAULT_CONFIG,
        weather: { ...DEFAULT_CONFIG.weather, entity: 'weather.home' },
      } as never);
      expect(styles['--calendar-card-weather-event-color']).toBeUndefined();
    });

    it('emits the colour property when the user actually sets one', () => {
      // The control for the assertion above: absent-by-default is only correct if a
      // configured value still arrives.
      const styles = generateCustomPropertiesObject({
        ...DEFAULT_CONFIG,
        weather: {
          ...DEFAULT_CONFIG.weather,
          entity: 'weather.home',
          event: { ...DEFAULT_CONFIG.weather?.event, color: 'rgb(1, 2, 3)' },
        },
      } as never);
      expect(styles['--calendar-card-weather-event-color']).toBe('rgb(1, 2, 3)');
    });
  });

  describe('column view (row placement)', () => {
    it('keeps its own scoped rules', () => {
      const scoped = rules().filter(
        ([sel]) => sel.includes('.time-location') && sel.includes('.event-weather'),
      );
      expect(scoped.length).toBeGreaterThan(0);
    });

    it('falls back to the secondary text colour', () => {
      const scoped = rules().filter(
        ([sel, body]) =>
          sel.includes('.time-location') &&
          sel.includes('.event-weather') &&
          body.includes('--calendar-card-weather-event-color'),
      );
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.some(([, body]) => body.includes('var(--secondary-text-color)'))).toBe(true);
    });
  });

  describe('the discriminator that identified the defect', () => {
    it('icon size was always reachable from both views, unlike size and colour', () => {
      // This is what proved the bug was specific rather than "weather is broken":
      // `weather.event.icon_size` kept working in list view throughout, because its rule
      // was never scoped. Same probe, opposite answer. If this ever starts failing, the
      // reasoning in the comment above no longer describes the code.
      expect(listReachable('--calendar-card-weather-event-icon-size').length).toBeGreaterThan(0);
    });
  });
});
