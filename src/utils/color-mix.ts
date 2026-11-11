/**
 * The colors the card writes from script on a browser without color-mix().
 *
 * Safari before 16.2 has no color-mix(). Several colors the card ships are mixes, and the card
 * writes them from script into an element's inline style: the grid's rules and separators, its
 * weekend shading, the week number's pill and the week separator, the empty day's text, and an
 * event's tint where its calendar's color is a var(). Each reads a var(), so the browser keeps
 * it as written and it turns invalid once that is substituted, which draws as though the
 * property had never been set: no fill, no rule, a separator in the text color. An inline style
 * cannot sit behind `@supports`, and a stylesheet cannot tell the shipped mix from a color the
 * user chose, so the floor is chosen here, from one measurement of the browser.
 *
 * Each floor follows the stylesheet's own fallbacks for the same browsers: a color cannot be made
 * translucent there, so a fill or a rule is a neutral gray, which darkens a light card and
 * lightens a dark one alike. A mix of the accent keeps its own strength in gray; a mix of the
 * text color takes about twice its strength, gray being about half as far from either default
 * card as the text is.
 *
 * Only the mixes the card ships are floored, matched by value. Any other mix a user writes into
 * an option is written as given; one written exactly as a shipped mix takes its floor, which it
 * needs there just as much.
 */

/** What the stylesheets ask with `@supports`, asked once of the browser from script. */
const PROBE = 'color-mix(in srgb, red, blue)';

/** The browser's answer, once it has been asked. */
let supported: boolean | undefined;

/**
 * Whether the browser knows color-mix(), measured once.
 *
 * Where there is no `CSS.supports` to ask, the card writes its mixes as it always has.
 *
 * @returns False only where the browser answers that it does not
 */
export function supportsColorMix(): boolean {
  if (supported === undefined) {
    supported =
      typeof CSS === 'undefined' ||
      typeof CSS.supports !== 'function' ||
      CSS.supports('color', PROBE);
  }
  return supported;
}

/** Forgets the measurement, for tests. */
export function resetColorMixSupport(): void {
  supported = undefined;
}

/**
 * Each mix the card ships, and what it writes in its place without color-mix().
 *
 * - The grid's rules and separators are Home Assistant's divider at half strength. The divider
 *   is a text color at 12%, so half of it is about a 6% mix of the text, and gray takes twice
 *   that.
 * - The grid's weekend shading is the text color at 4%, and gray takes twice that.
 * - The week number's pill and the week separator are the theme's accent at 31%, and gray keeps
 *   that strength.
 * - The empty day's text is the text color at 60%. That is text, not a fill, so its floor is the
 *   theme's own quieter text color, which is within ten levels of the mix on either default
 *   card.
 *
 * A tinted event's two washes, mixes of currentColor, have no entry: they are not written at all
 * without color-mix(), since the stylesheet replaces every rule reading them with its own gray
 * there (TAPPABLE EVENTS in `styles.ts`).
 */
export const COLOR_MIX_FLOORS: ReadonlyMap<string, string> = new Map([
  ['color-mix(in srgb, var(--divider-color) 50%, transparent)', 'rgba(128, 128, 128, 0.12)'],
  ['color-mix(in srgb, var(--primary-text-color) 4%, transparent)', 'rgba(128, 128, 128, 0.08)'],
  [
    'color-mix(in srgb, var(--primary-color, #03a9f4) 31%, transparent)',
    'rgba(128, 128, 128, 0.31)',
  ],
  ['color-mix(in srgb, var(--primary-text-color) 60%, transparent)', 'var(--secondary-text-color)'],
]);

/**
 * A color as the card writes it: as given, or its floor where it is a mix the card ships and the
 * browser has no color-mix().
 *
 * @param value - A color the card is about to write into an inline style
 * @returns The color to write
 */
export function floorColor(value: string): string {
  const floor = COLOR_MIX_FLOORS.get(value);
  return floor === undefined || supportsColorMix() ? value : floor;
}

/**
 * A translucent color's floor without color-mix(): gray at the same strength, as a mix of the
 * accent keeps its own.
 *
 * @param opacity - The strength the mix would have had, from 0 to 100
 * @returns A gray at that strength
 */
export function translucentGray(opacity: number): string {
  return `rgba(128, 128, 128, ${opacity / 100})`;
}
