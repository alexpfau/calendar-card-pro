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
 * neighbors. So a color-mix() written outside an `@supports (color: color-mix(…))` block, which
 * comes with a floor of its own, needs a fallback: the same selector and property, under the
 * same media, inside `@supports not (color: color-mix(in srgb, red, blue))`, and after it.
 *
 * v5.1 added seven with none. They have one now, and both lists below are pinned by value: a
 * fallback that goes missing moves its declaration from the first list to the second, and a new
 * color-mix() without one lands in the second, so neither can change unnoticed. The second also
 * holds the ones older than v5.1, which draw without the mix on those browsers as they always
 * have; a new entry there needs a fallback or a reason to join them.
 *
 * Out of reach here: a custom property holding a mix, whose readers turn invalid the same way.
 * Its floor is a separate question for each property.
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
 * color-mix() itself, or relative color, which every engine shipped after it.
 */
const gatedOn = (d: Declaration): boolean =>
  d.at.some(
    (p) => /^@supports\b/i.test(p) && !/\bnot\b/i.test(p) && /color-mix\(|oklch\(from /i.test(p),
  );

/** Its at-rules other than the fallback block, which is what a fallback must match. */
const media = (d: Declaration): string => d.at.filter((p) => p !== FALLBACK).join(' | ');

/**
 * Every selector holding a color-mix() outside such a block, split by whether it has a fallback.
 * Keyed without the sheet, since the popover and the search panel both embed the cell styles.
 */
function partition(): { covered: string[]; uncovered: string[] } {
  const covered = new Set<string>();
  const uncovered = new Set<string>();
  for (const css of Object.values(SHEETS)) {
    const all = declarations(css);
    const fallbacks = all.filter((d) => d.at.includes(FALLBACK) && !MIX.test(d.value));
    for (const d of all) {
      if (
        d.property.startsWith('--') ||
        !MIX.test(d.value) ||
        gatedOn(d) ||
        d.at.includes(FALLBACK)
      )
        continue;
      for (const selector of d.selectors) {
        // After it, since the risky one, once invalid, unsets the property rather than
        // revealing an earlier value.
        const has = fallbacks.some(
          (f) =>
            f.property === d.property &&
            media(f) === media(d) &&
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

  // The seven: the focus ring the popover and the search panel share (six selectors), the
  // search field's ring, the result the arrow keys are on, the popover's error message, and a
  // day's three add washes (six selectors).
  it('gives each of the seven v5.1 added a fallback', () => {
    expect(covered).toEqual([
      '.cell:focus-visible { outline }',
      '.column-day-header.day-add-button:hover { background-color }',
      '.date-column:has(> .day-add-button):hover { background-color }',
      '.day-column[data-add-pressed] > .column-day-header { background-color }',
      '.day-table[data-add-pressed] td.date-column { background-color }',
      '.error { background }',
      '.field:focus-within { box-shadow }',
      '.grid-day-body[data-add-pressed]::before { background-color }',
      '.grid-day-header[data-add-pressed] > .column-day-header { background-color }',
      ".result[aria-selected='true'] { background }",
      'a:focus-visible { outline }',
      'button:focus-visible { outline }',
      'input:focus-visible { outline }',
      'select:focus-visible { outline }',
      'textarea:focus-visible { outline }',
    ]);
  });

  it('leaves without one only the uses older than v5.1', () => {
    expect(uncovered).toEqual([
      '.allday-pill-filled { background-color }',
      '.date-navigation .date-navigation-segment.home-done { background }',
      '.event-button:active::before { background-color }',
      '.event-button:hover::before { background-color }',
      '.event-interactive:active { box-shadow }',
      '.event-interactive:hover { box-shadow }',
      '.grid-event-raised > .grid-event-accessible::before { border }',
      '.legend-chip { background }',
      '.legend-chip:active { background }',
      '.legend-chip:hover { background }',
      '.legend-menu-row { background }',
      '.legend-menu-row:active { background }',
      '.legend-menu-row:hover { background }',
      '.loading-indicator .spinner { border }',
      '.progress-bar { background-color }',
      '.toolbar-button.refresh-button.refresh-done { background }',
      '.toolbar-button.refresh-button.refresh-failed { background }',
      '.toolbar-button.reset-button.reset-done { background }',
    ]);
  });

  it('keeps every fallback free of color-mix(), so it draws where that is unknown', () => {
    const mixed = Object.values(SHEETS)
      .flatMap(declarations)
      .filter((d) => d.at.includes(FALLBACK) && MIX.test(d.value));
    expect(mixed).toEqual([]);
  });
});
