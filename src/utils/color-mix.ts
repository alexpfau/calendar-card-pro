/**
 * The colors the card writes from script on a browser without color-mix().
 *
 * Safari before 16.2 has no color-mix(). Several colors the card ships are mixes, and the card
 * writes them from script into an element's inline style: the grid's rules and separators, its
 * weekend shading, the empty day's text, and an event's tint where its calendar's color is a
 * var(). Each reads a var(), so the browser keeps
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
 * Only the mixes the card ships, or once shipped, are floored, matched by value, at the places it
 * writes them: the separators, the grid's rules and shading, the week number's pill, the empty
 * day's text and an event's tint. A mix written into one of those options exactly as the card ships it takes the
 * same floor. Any other mix a user writes, there or into any other color option, is written as
 * given.
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
 * - The week number's pill and the week separator shipped the theme's accent at 31% until they
 *   took today's tile's colors, which the stylesheet floors itself. The floor stays for a YAML
 *   that still holds that string, and gray keeps its strength.
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
 * Whether a resolved color value would paint anything at all.
 *
 * `transparent` and `none` are what a user writes to switch an optional fill off, and an
 * empty string is what an editor text field hands back when it is cleared. None of them
 * needs a custom property emitted for it, and leaving the property unset lets the
 * stylesheet's own fallback stand rather than overriding it with a no-op. Grid's and Month's
 * tints both ask it, so the two layouts agree on what turns a tint off.
 *
 * @param value - A resolved CSS color
 * @returns `true` when the value is worth writing to the DOM
 */
export function paintsSomething(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized !== '' && normalized !== 'transparent' && normalized !== 'none';
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

/**
 * The most opaque a pill background can be and still color its own number: about a third. Behind
 * a stronger one the shade the date tile's rule gives fails as text (a solid #03a9f4 read 1.69:1
 * on a dark card, where the text color reads 2.63), so the number keeps the text color there.
 */
export const LIGHT_WASH_MAX_OPACITY = 0.34;

/** A list split at its top-level commas, or at its top-level slash, so `var(a, b)` stays whole. */
function splitTopLevel(text: string, separator: ',' | '/'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** An alpha written as a number or a percentage, or `undefined` where it is not one. */
function alphaOf(token: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(%?)$/.exec(token.trim());
  if (!match) return undefined;
  const value = Number(match[1]) / (match[2] ? 100 : 1);
  return Math.min(1, Math.max(0, value));
}

/**
 * The color functions whose opacity their text settles: 1, or the alpha written after a slash or
 * as a fourth argument. Any other function, light-dark() among them, decides its color where it
 * is drawn.
 */
const COLOR_FUNCTIONS: ReadonlySet<string> = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
]);

/**
 * Keywords a color option can hold that are not colors of their own. currentColor is the number's
 * own color, so a background mixed from it cannot shade it.
 */
const NOT_A_COLOR: ReadonlySet<string> = new Set([
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'none',
]);

/** A percentage as CSS writes one: `20%`, `+20%`, `.5%` or `2e1%`. */
const PERCENTAGE = String.raw`[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%`;
const SHARE_AFTER = new RegExp(String.raw`^([\s\S]*?)\s+(${PERCENTAGE})$`);
const SHARE_BEFORE = new RegExp(String.raw`^(${PERCENTAGE})\s+([\s\S]+)$`);

/**
 * One color of a color-mix() and the percentage written before or after it, if any. Anything
 * else written beside the color, such as `calc(20%)`, stays with the color, which then reads as
 * no color at all: the browser has to work that percentage out.
 */
function mixPart(part: string): { color: string; share: number | undefined } {
  const after = SHARE_AFTER.exec(part);
  const before = after ? null : SHARE_BEFORE.exec(part);
  const color = after ? after[1].trim() : before ? before[2].trim() : part;
  const share = after ? after[2] : before ? before[1] : undefined;
  return { color, share: share === undefined ? undefined : Number(share.slice(0, -1)) };
}

/**
 * A function written as one whole token, its name and the text inside its parentheses, or
 * `undefined` where the parenthesis after the name closes before the end: `rgb(255 0 0)calc(80%)`
 * and `rgb(255 0 0) calc(80%)` are a color followed by a percentage, not one `rgb()`.
 */
function functionCall(text: string): { name: string; body: string } | undefined {
  const open = /^([a-z-]+)\(/.exec(text);
  if (!open) return undefined;
  let depth = 0;
  for (let i = open[0].length - 1; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) {
      return i === text.length - 1
        ? { name: open[1], body: text.slice(open[0].length, i) }
        : undefined;
    }
  }
  return undefined;
}

/**
 * How opaque a color inside a color-mix() is. A color named by a custom property is taken as
 * opaque, as a theme's colors are, but a fallback written beside it has to be opaque too: where
 * the property is missing, the fallback is drawn, and it may be translucent or carry a percentage
 * of its own.
 */
function mixColorOpacity(color: string): number | undefined {
  if (color === 'transparent') return 0;
  const call = functionCall(color);
  const named = call?.name === 'var' ? /^\s*--[^,\s)]+\s*(?:,([\s\S]*))?$/.exec(call.body) : null;
  if (!named) return opacityOf(color);
  if (named[1] === undefined) return 1;
  const fallback = named[1].trim();
  return mixColorOpacity(fallback) === 1 ? 1 : undefined;
}

/**
 * How opaque a color-mix() is, as CSS Color 5 resolves its percentages: an omitted one is the
 * rest of 100, both omitted are 50 each, and two that sum to less than 100 leave the rest
 * transparent, where a sum over 100 is scaled down to it.
 *
 * @param body - The text inside the parentheses
 * @returns Its opacity from 0 to 1, or `undefined` where the text does not settle it
 */
function mixOpacity(body: string): number | undefined {
  const args = splitTopLevel(body, ',');
  // The interpolation method may be left out, as in color-mix(red 20%, transparent).
  const parts = (/^in\s/.test(args[0]) ? args.slice(1) : args).map(mixPart);
  if (parts.length !== 2) return undefined;
  const [a, b] = parts;
  if ([a.share, b.share].some((share) => share !== undefined && (share < 0 || share > 100))) {
    return undefined;
  }
  const shareA = a.share ?? (b.share === undefined ? 50 : 100 - b.share);
  const shareB = b.share ?? 100 - shareA;
  const total = shareA + shareB;
  if (total <= 0) return undefined;
  const alphaA = mixColorOpacity(a.color);
  const alphaB = mixColorOpacity(b.color);
  if (alphaA === undefined || alphaB === undefined) return undefined;
  return ((shareA * alphaA + shareB * alphaB) / total) * (Math.min(total, 100) / 100);
}

/**
 * How opaque a color is as written, where the text alone says: a hex color with an alpha digit, a
 * color function with an alpha, `transparent`, or a `color-mix()` of colors like these, which is
 * how the card's own washes and Home Assistant's are written, with `transparent`. Each reads as Chromium and WebKit
 * resolve it. A custom property alone, a mix whose percentage or fallback the browser has to work
 * out, a relative color without an alpha of its own, which keeps its origin's, and light-dark()
 * say nothing about their opacity here, nor does a value that is not text: the number keeps the
 * text color behind them.
 *
 * @param value - A color as the user wrote it
 * @returns Its opacity from 0 to 1, or `undefined` where the text does not settle it
 */
export function opacityOf(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim().toLowerCase();
  if (color === 'transparent') return 0;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(color);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 6) return 1;
    const alpha = digits.length === 4 ? digits[3] + digits[3] : digits.slice(6);
    return parseInt(alpha, 16) / 255;
  }
  const call = functionCall(color);
  if (!call) return /^[a-z]+$/.test(color) && !NOT_A_COLOR.has(color) ? 1 : undefined;
  const { name, body } = call;
  if (name === 'color-mix') return mixOpacity(body);
  if (!COLOR_FUNCTIONS.has(name)) return undefined;
  const slashed = splitTopLevel(body, '/');
  if (slashed.length === 2) return alphaOf(slashed[1]);
  if (/^from\s/.test(body.trim())) return undefined;
  const args = splitTopLevel(body, ',');
  // rgba(r, g, b, a), or rgba(var(--rgb-primary-color), a), whose var() stands for three.
  if ((name === 'rgba' || name === 'rgb' || name === 'hsla' || name === 'hsl') && args.length > 1) {
    if (args.length === 4 || (args.length === 2 && args[0].startsWith('var('))) {
      return alphaOf(args[args.length - 1]);
    }
    return args.length === 3 ? 1 : undefined;
  }
  return body.includes('var(') ? undefined : 1;
}

/**
 * Whether a pill background is a light wash, which colors its own number by the date tile's rule:
 * written with an opacity above 0 and at most {@link LIGHT_WASH_MAX_OPACITY}.
 *
 * @param value - The background as the user wrote it
 * @returns `true` where the number is a shade of the background, `false` where it is the text color
 */
export function isLightWash(value: unknown): boolean {
  const opacity = opacityOf(value);
  return opacity !== undefined && opacity > 0 && opacity <= LIGHT_WASH_MAX_OPACITY;
}
