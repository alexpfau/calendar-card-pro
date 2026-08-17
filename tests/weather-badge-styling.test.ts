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

/**
 * As above, but restricted to rules whose *subject* is the wrapper rather than something
 * inside it.
 *
 * `.event-weather .event-weather-text > span` also contains `.event-weather-text`, so a
 * substring search cannot tell "the wrapper is styled" from "the wrapper's children are
 * styled". That distinction is the whole of the 1px defect below, and it is why the
 * declaration moving between those two selectors was invisible to every assertion in this
 * file. A selector whose final compound is the wrapper ends with it.
 */
function wrapperRules(declaration: string): Array<[string, string]> {
  return listReachable(declaration).filter(([sel]) =>
    sel.split(',').some((part) => part.trim().endsWith('.event-weather-text')),
  );
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

    it('sizes the wrapper itself, not only the chips inside it', () => {
      // The chips render at the same size either way, since they inherit it. What differs
      // is the wrapper's line box: left at the inherited 14px event font it builds a
      // strut from 14px and measures 4px taller than its contents, dropping the glyphs
      // 1px against v3.6.0. Nothing reflows, which is why review never caught it.
      //
      // Reachability is not enough to pin this. `> span` is reachable, and `> span` is
      // the defect.
      const onWrapper = wrapperRules('--calendar-card-weather-event-font-size');
      expect(onWrapper.length).toBeGreaterThan(0);
    });

    it('the wrapper filter discriminates by selector, not by declaration (control)', () => {
      // font-weight is list-reachable — `.event-weather` carries it, and so does
      // `.event-weather .weather-uv-index` — and on neither is the wrapper the subject.
      // A filter that matched on the declaration alone, or that searched the selector by
      // substring, would return those. Both halves must hold: a non-empty left side
      // proves the corpus is not simply missing font-weight.
      expect(listReachable('font-weight').length).toBeGreaterThan(0);
      expect(wrapperRules('font-weight')).toEqual([]);
    });

    it('falls back to the secondary text colour, as v3 shipped', () => {
      // This previously pinned --primary-text-color, on the reasoning that the badge
      // sits next to the primary-coloured event title. That reasoning was sound in
      // isolation and wrong against the baseline: v3 rendered this badge with
      // `eventConfig.color || 'var(--secondary-text-color)'` (v3.6.0 leaves.ts:324), and
      // weather.event.color has no default, so every card using weather.position: event
      // took the secondary value. Pinning primary here pinned the regression.
      const found = listReachableText('--calendar-card-weather-event-color');
      expect(found.some(([, body]) => body.includes('var(--secondary-text-color)'))).toBe(true);
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

  describe('the list fallback colour matches what v3 shipped', () => {
    /**
     * v3.5.0 and v3.6.0 rendered the event badge with two DIFFERENT fallbacks, chosen
     * by position: `dateConfig.color || 'var(--primary-text-color)'` for the day header
     * and `eventConfig.color || 'var(--secondary-text-color)'` for the per-event badge
     * (v3.6.0 `leaves.ts:88` and `leaves.ts:324`).
     *
     * When the inline styles moved into the stylesheet, the list placement was given
     * `--primary-text-color` on the reasoning that the badge sits beside the primary
     * event title. That reversed shipped behaviour for every card using
     * `weather.position: event` without an explicit `weather.event.color` -- which is
     * every such card, because the key has no default -- and it also made the list
     * disagree with this card's own column view, which kept secondary.
     *
     * Asserted as an equality between the two placements rather than as a literal, so
     * a future change to one has to be a deliberate change to both.
     */
    it('uses the secondary text colour, as v3 did', () => {
      const listColour = listReachableText('--calendar-card-weather-event-color');

      expect(listColour.length).toBeGreaterThan(0);
      expect(listColour.every(([, body]) => body.includes('var(--secondary-text-color)'))).toBe(
        true,
      );
    });

    it('agrees with the column placement, so the badge reads the same in both views', () => {
      const fallbackOf = (pairs: Array<[string, string]>): Set<string> => {
        const out = new Set<string>();
        for (const [, body] of pairs) {
          const m = body.match(/--calendar-card-weather-event-color,\s*(var\(--[a-z-]+\))/);
          if (m) out.add(m[1]);
        }
        return out;
      };

      const list = fallbackOf(listReachableText('--calendar-card-weather-event-color'));
      const column = fallbackOf(
        rules().filter(
          ([sel, body]) =>
            sel.includes('.time-location') &&
            sel.includes('.event-weather-text') &&
            body.includes('--calendar-card-weather-event-color'),
        ),
      );

      expect(list.size).toBe(1);
      expect(column.size).toBe(1);
      expect([...list]).toEqual([...column]);
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
