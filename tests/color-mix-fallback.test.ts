import { describe, expect, it } from 'vitest';

import { type Declaration, declarations } from './helpers/css-declarations';
import { EventPopover } from '../src/rendering/event-popover';
import { cellStyles, shellStyles } from '../src/rendering/popover-shell';
import { SearchPanel } from '../src/rendering/search-panel';
import { cardStyles } from '../src/rendering/styles';

/**
 * Safari before 16.2 has no color-mix(). A declaration holding one is dropped there, or, where
 * it reads a var() as well, turns invalid once that is substituted, which draws as though the
 * property had never been set: no focus ring, no wash, a selected row less marked than its
 * neighbors. A custom property holding one keeps it as written, and every declaration reading
 * it turns invalid the same way. So a color-mix() written outside an
 * `@supports (color: color-mix(…))` block, which comes with a floor of its own, needs a
 * fallback: the same selector and property, custom or not, under the same media, inside
 * `@supports not (color: color-mix(in srgb, red, blue))`, and after it, in a rule a browser
 * without color-mix() can parse. The one condition it may leave out is content-visibility: one
 * written for an event's wash also has to win over the copy of it behind that gate, which an
 * engine without color-mix() can still read.
 *
 * Every one has a fallback, and the list below is pinned by value: a fallback that goes missing
 * moves its declaration out of it and into the second list, which must stay empty, and so does
 * a new color-mix() written without one.
 *
 * Out of reach here: the mixes the card writes from script rather than a stylesheet, into its
 * inline style. The shipped grid and separator line colors, the week number's and the weekend's
 * washes, the empty day's text color, and an event's tint when its color is a var() are mixes of
 * that kind. Each reads a var(), so without color-mix() each turns invalid the same way.
 */

const SHEETS = {
  card: cardStyles.cssText,
  shell: shellStyles.cssText,
  cell: cellStyles.cssText,
  search: SearchPanel.styles.toString(),
  popover: EventPopover.styles.toString(),
};

const FALLBACK = '@supports not (color: color-mix(in srgb, red, blue))';
const MIX = /color-mix\(/i;

/**
 * Whether a declaration sits in a block only an engine with color-mix() reads: one probing
 * color-mix() itself, or relative color or light-dark(), which every engine shipped after it.
 */
const gatedOn = (d: Declaration): boolean =>
  d.at.some(
    (p) =>
      /^@supports\b/i.test(p) &&
      !/\bnot\b/i.test(p) &&
      /color-mix\(|oklch\(from |light-dark\(/i.test(p),
  );

/**
 * The one condition a fallback may leave out: it only narrows a declaration to newer engines,
 * and an engine without color-mix() can still pass it (Chrome 85 to 110), so a fallback for a
 * declaration behind it has to win over that one too. Every other condition, a media query
 * above all, must match exactly, or the fallback would apply where its declaration does not.
 */
const OMITTABLE = '@supports (content-visibility: auto)';

/** Whether a fallback applies exactly where the declaration does, the gate above aside. */
const reaches = (f: Declaration, d: Declaration): boolean =>
  f.at.filter((p) => p !== FALLBACK).join(' | ') ===
  d.at.filter((p) => p !== OMITTABLE).join(' | ');

/**
 * Whether a fallback's rule parses where color-mix() is missing. Safari before 16.4 and Chrome
 * before 120 have no :dir(), and Chrome before 105 no :has(); a browser that cannot read one
 * selector in a list drops the whole rule, so :has() has to stand alone in its rule there.
 */
const parses = (f: Declaration): boolean =>
  !f.selectors.some((s) => /:dir\(/i.test(s)) &&
  (f.selectors.length === 1 || !f.selectors.some((s) => /:has\(/i.test(s)));

/**
 * Every selector holding a color-mix() outside such a block, custom properties included, split
 * by whether it has a fallback. Keyed without the sheet, since the popover and the search panel
 * both embed the cell styles.
 */
function partition(): { covered: string[]; uncovered: string[] } {
  const covered = new Set<string>();
  const uncovered = new Set<string>();
  for (const css of Object.values(SHEETS)) {
    const all = declarations(css);
    const fallbacks = all.filter((d) => d.at.includes(FALLBACK) && !MIX.test(d.value) && parses(d));
    for (const d of all) {
      if (!MIX.test(d.value) || gatedOn(d) || d.at.includes(FALLBACK)) continue;
      for (const selector of d.selectors) {
        // After it, since the risky one, once invalid, unsets the property rather than
        // revealing an earlier value.
        const has = fallbacks.some(
          (f) =>
            f.property === d.property &&
            reaches(f, d) &&
            f.selectors.includes(selector) &&
            f.index > d.index,
        );
        (has ? covered : uncovered).add(`${selector} { ${d.property} }`);
      }
    }
  }
  return { covered: [...covered].sort(), uncovered: [...uncovered].sort() };
}

describe('color-mix() where Safari before 16.2 has none', () => {
  const { covered, uncovered } = partition();

  it('reads the stylesheets, so the lists below are not vacuous', () => {
    expect(Object.values(SHEETS).every((css) => css.length > 1000)).toBe(true);
    expect(covered.length + uncovered.length).toBeGreaterThan(7);
  });

  // The seven v5.1 added: the focus ring the popover and the search panel share (six
  // selectors), the search field's ring, the result the arrow keys are on, the popover's error
  // message, and a day's three add washes (six selectors). The fourteen older ones: an event's
  // two washes, each drawn as a shadow and as a background (four), a legend chip's and row's
  // tint at rest, under the pointer and pressed (four, six selectors), the toolbar's done
  // states (three selectors) and its failed one, the filled all-day pill, the progress bar's
  // track, the spinner, and a raised grid block's edge. And the custom properties the stylesheet
  // mixes for others to read: the toolbar's three fills, the accent and Now inks, and the
  // all-day pill's ink and its two washes.
  it('gives each a fallback', () => {
    expect(covered).toEqual([
      '.allday-badge { --badge-ink }',
      '.allday-badge { --badge-wash }',
      '.allday-badge.allday-source-text { --badge-wash }',
      '.allday-pill-filled { background-color }',
      '.allday-title-pill { --badge-ink }',
      '.allday-title-pill { --badge-wash }',
      '.allday-title-pill.allday-source-text { --badge-wash }',
      '.card-toolbar { --calendar-card-toolbar-fill }',
      '.card-toolbar { --calendar-card-toolbar-fill-hover }',
      '.card-toolbar { --calendar-card-toolbar-fill-pressed }',
      '.cell:focus-visible { outline }',
      '.column-day-header.day-add-button:hover { background-color }',
      '.date-column:has(> .day-add-button):hover { background-color }',
      '.date-navigation .date-navigation-segment.home-done { background }',
      '.day-column[data-add-pressed] > .column-day-header { background-color }',
      '.day-table[data-add-pressed] td.date-column { background-color }',
      '.error { background }',
      '.event { --calendar-card-accent-ink }',
      '.event-button:active::before { background-color }',
      '.event-button:hover::before { background-color }',
      '.event-interactive:active { box-shadow }',
      '.event-interactive:hover { box-shadow }',
      '.event-now { --calendar-card-now-ink }',
      '.field:focus-within { box-shadow }',
      '.grid-day-body[data-add-pressed]::before { background-color }',
      '.grid-day-header[data-add-pressed] > .column-day-header { background-color }',
      '.grid-event-raised > .grid-event-accessible::before { border }',
      '.legend-chip { background }',
      '.legend-chip:active { background }',
      '.legend-chip:hover { background }',
      '.legend-menu-row { background }',
      '.legend-menu-row:active { background }',
      '.legend-menu-row:hover { background }',
      '.loading-indicator .spinner { border }',
      '.progress-bar { background-color }',
      ".result[aria-selected='true'] { background }",
      '.toolbar-button.refresh-button.refresh-done { background }',
      '.toolbar-button.refresh-button.refresh-failed { background }',
      '.toolbar-button.reset-button.reset-done { background }',
      'a:focus-visible { outline }',
      'button:focus-visible { outline }',
      'input:focus-visible { outline }',
      'select:focus-visible { outline }',
      'textarea:focus-visible { outline }',
    ]);
  });

  it('leaves none without one', () => {
    expect(uncovered).toEqual([]);
  });

  it('keeps every fallback free of color-mix(), so it draws where that is unknown', () => {
    const mixed = Object.values(SHEETS)
      .flatMap(declarations)
      .filter((d) => d.at.includes(FALLBACK) && MIX.test(d.value));
    expect(mixed).toEqual([]);
  });
});
