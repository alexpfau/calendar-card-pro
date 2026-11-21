/**
 * The editor's focus rings clear 3:1 against what they are drawn on (WCAG 1.4.11), in Home
 * Assistant's default light and dark themes.
 *
 * Every ring once read `--primary-color`, which on the light theme measures 3.26:1 on the card but
 * 2.59:1 on the gray of a calendar's strip and 2.98:1 on the chosen layout row's tint. Rings now
 * read one custom property, the primary mixed with the text color, and this file holds it to every
 * surface the stylesheet paints and to every common primary a theme might set.
 *
 * Read from the stylesheet's text, not computed in the DOM: happy-dom matches no `:focus-visible`,
 * computes no `outline`, parses no `color-mix()` and styles no `::before`, so a computed-style test
 * would pass on any color. The browser measurement is the evidence for what is drawn; this pins
 * what is written. Both directions are reconciled: every outline and shadow in the sheet is pinned
 * by value with the rules around it, so a ring that leaves, changes or is overridden later fails;
 * a ring in any other color fails; and a background the surface list has not been taught fails as
 * unknown.
 */

import { describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import styles from '../src/rendering/editor/styles';

const RING = '--calendar-card-editor-focus-ring';
const SUPPORTS = '@supports (color: color-mix(in oklab, red, blue))';
const SHEET = declarations(styles.cssText);

type Rgb = readonly [number, number, number];

/** Home Assistant's default theme, frontend `color.globals.ts` and `semantic.globals.ts` at dev 4d8eca22. */
const THEMES: Readonly<Record<'light' | 'dark', Readonly<Record<string, Rgb>>>> = {
  light: {
    '--primary-color': [0, 154, 199],
    '--primary-text-color': [20, 20, 20],
    '--card-background-color': [255, 255, 255],
    '--primary-background-color': [250, 250, 250],
    '--secondary-background-color': [229, 229, 229],
    // rgba(0, 0, 0, 0.12) over the card.
    '--divider-color': [224, 224, 224],
  },
  dark: {
    '--primary-color': [0, 154, 199],
    '--primary-text-color': [225, 225, 225],
    '--card-background-color': [28, 28, 28],
    '--primary-background-color': [17, 17, 17],
    '--secondary-background-color': [40, 40, 40],
    // rgba(225, 225, 225, 0.12) over the card.
    '--divider-color': [52, 52, 52],
  },
};

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number): number =>
  Math.min(255, Math.max(0, 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

/** WCAG 2's contrast ratio. */
function contrast(a: Rgb, b: Rgb): number {
  const luminance = ([r, g, bl]: Rgb): number =>
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(bl);
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** sRGB to Oklab (Björn Ottosson's published matrices). */
function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Oklab to sRGB. */
function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** `top` at `alpha` over an opaque `bottom`. */
const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as unknown as Rgb;

/**
 * A color as the editor writes one: a theme variable, or `color-mix()` of two of them in oklab or
 * srgb. Anything else is an error, so a new form has to be taught here rather than passing.
 *
 * @param value - The declared value
 * @param theme - The theme's variables
 * @returns The color
 */
function resolve(value: string, theme: Readonly<Record<string, Rgb>>): Rgb {
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable) {
    const color = theme[variable[1]];
    if (color === undefined) throw new Error(`No ${variable[1]} in the theme`);
    return color;
  }
  const mix =
    /^color-mix\( ?in (oklab|srgb), (var\(--[\w-]+\)) (\d+)%, (var\(--[\w-]+\)) ?\)$/.exec(value);
  if (mix) {
    const [, space, first, percent, second] = mix;
    const p = Number(percent) / 100;
    const [a, b] = [resolve(first, theme), resolve(second, theme)];
    if (space === 'srgb') return a.map((c, i) => c * p + b[i] * (1 - p)) as unknown as Rgb;
    const [A, B] = [toOklab(a), toOklab(b)];
    return fromOklab(A.map((c, i) => c * p + B[i] * (1 - p)) as unknown as Rgb);
  }
  throw new Error(`Cannot resolve ${value}`);
}

/** What draws or places a ring: an outline and its parts, or a shadow. */
const OUTLINE_PROPERTIES = new Set([
  'outline',
  'outline-color',
  'outline-offset',
  'outline-width',
  'outline-style',
  'box-shadow',
]);

/** The surfaces a ring can be drawn on: every background the sheet paints that is not a fill. */
function surfaces(): Map<string, { readonly selectors: string[]; readonly tint?: number }> {
  // Fills of small marks a ring never touches: a badge, a dot, a check, a tooltip, a stripe.
  const FILLS = new Set([
    'none',
    'var(--primary-color)',
    'var(--primary-text-color)',
    'var(--cal-dot, var(--primary-color))',
    'var(--dot)',
    'var(--disabled-color, #bdbdbd)',
    'var(--divider-color)',
    'rgba(var(--rgb-warning-color, 255, 166, 0), 0.24)',
    'linear-gradient( 135deg, transparent 46%, var(--secondary-text-color) 46% 54%, transparent 54% )',
  ]);
  const found = new Map<string, { selectors: string[]; tint?: number }>();
  for (const declaration of SHEET) {
    if (declaration.property !== 'background' && declaration.property !== 'background-color') {
      continue;
    }
    if (FILLS.has(declaration.value)) continue;
    const tint = /^rgba\(var\(--rgb-primary-color, 3, 169, 244\), (0?\.\d+)\)$/.exec(
      declaration.value,
    );
    const theme =
      /^var\((--(?:card|primary|secondary)-background-color)(?:, var\(--[\w-]+\))?\)$/.exec(
        declaration.value,
      );
    if (tint === null && theme === null) {
      throw new Error(
        `Unknown surface ${declaration.value} on ${declaration.selectors.join(', ')}`,
      );
    }
    const key = tint ? `tint ${Number(tint[1])}` : theme![1];
    const entry = found.get(key) ?? { selectors: [], tint: tint ? Number(tint[1]) : undefined };
    entry.selectors.push(...declaration.selectors);
    found.set(key, entry);
  }
  return found;
}

/**
 * The frames a ring meets where it reaches its element's edge. A ring drawn inside its element
 * with less than 2px to spare (`outline-offset` between -4px and 0 for a 2px ring) covers the
 * element's edge and touches what lies outside it: the border of the element it sits in. Each
 * such ring names its frames here, as the selector and property that draw them; one with none sits
 * on its parent's own fill, which the surface checks cover.
 */
const FRAMES: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  '.quick-setup-banner:focus-visible': [['.quick-setup-entry', 'border']],
  '.story-tile:focus-visible': [
    ['.wizard-options', 'border'],
    ['.wizard-option + .wizard-option', 'border-top'],
  ],
  '.menu-item:focus-visible': [['.menu', 'border']],
  '.setting-target:focus-visible': [],
  '.cal-block .cal-group.grabbed': [['.cal-block .cal-group', 'border-bottom']],
  '.cal-block .cal-body:focus-visible': [['.cal-block .cal-group', 'border-bottom']],
};

/** The value that applies: the last declaration of a property under a selector. */
function declared(selector: string, property: string): string | undefined {
  return SHEET.filter((d) => d.selectors.includes(selector) && d.property === property).slice(-1)[0]
    ?.value;
}

/**
 * The selectors of one element: the selector itself, then each of its states (`.a:hover`,
 * `.a.checked`, `.a[aria-pressed]`, `.a:has(…)`), whose declarations it can also wear.
 *
 * @param selector - The element's selector
 * @returns The selectors, the element's own first
 */
function statesOf(selector: string): string[] {
  const states = SHEET.flatMap((d) => d.selectors).filter(
    (candidate) =>
      candidate !== selector &&
      /^[:.[]/.test(candidate.slice(selector.length)) &&
      candidate.startsWith(selector),
  );
  return [selector, ...new Set(states)];
}

/** A color as a frame or a fill declares it: opaque, or a color at an alpha over what is below. */
type Paint = { readonly color: Rgb; readonly alpha: number };

/**
 * A declared color as paint, in a theme. Anything else is an error, so a new form is checked.
 *
 * @param value - The color, as declared
 * @param theme - The theme's variables
 * @param name - The theme's name, which picks the divider's color
 * @returns The paint
 */
function paint(value: string, theme: Readonly<Record<string, Rgb>>, name: 'light' | 'dark'): Paint {
  const tint = /^rgba\(var\(--rgb-primary-color, 3, 169, 244\), (0?\.\d+)\)$/.exec(value);
  if (tint) return { color: theme['--primary-color'], alpha: Number(tint[1]) };
  // Home Assistant's divider: rgba(0, 0, 0, 0.12) in light, rgba(225, 225, 225, 0.12) in dark.
  if (value === 'var(--divider-color)') {
    return { color: name === 'light' ? [0, 0, 0] : [225, 225, 225], alpha: 0.12 };
  }
  const variable = /^var\((--[\w-]+)(?:, var\(--[\w-]+\))?\)$/.exec(value);
  if (variable && theme[variable[1]] !== undefined) return { color: theme[variable[1]], alpha: 1 };
  throw new Error(`Unknown color ${value}`);
}

/** A side's border properties, in the order a later one overrides an earlier. */
const BORDER_SIDES: Readonly<Record<string, readonly string[]>> = {
  border: ['top', 'right', 'bottom', 'left'],
  'border-top': ['top'],
  'border-bottom': ['bottom'],
};

/**
 * The colors of the frames the rings reach, in a theme. For each frame, the border color that
 * applies on each side it draws, shorthand or longhand, whichever comes last, and each color a
 * state of the element gives it; each laid over every background the element paints, its states'
 * included, over the card. A frame in an unknown color is an error.
 *
 * @param theme - The theme's variables
 * @param name - The theme's name
 * @returns Each frame and backdrop by name, with the color drawn there
 */
function frameColors(
  theme: Readonly<Record<string, Rgb>>,
  name: 'light' | 'dark',
): Array<[string, Rgb]> {
  const card = theme['--card-background-color'];
  const colorOf = (selector: string, side: string): string | undefined => {
    const properties = new Set([
      'border',
      `border-${side}`,
      'border-color',
      `border-${side}-color`,
    ]);
    const last = SHEET.filter(
      (d) => d.selectors.includes(selector) && properties.has(d.property),
    ).slice(-1)[0];
    if (last === undefined) return undefined;
    if (last.property.endsWith('-color')) return last.value;
    if (last.value === 'none') return undefined;
    const color = /^1px solid (.+)$/.exec(last.value)?.[1];
    if (color === undefined) throw new Error(`Unknown border ${last.value} on ${selector}`);
    return color;
  };
  const out: Array<[string, Rgb]> = [];
  for (const frames of Object.values(FRAMES)) {
    for (const [selector, property] of frames) {
      const selectors = statesOf(selector);
      const borders = BORDER_SIDES[property].flatMap((side) =>
        selectors.flatMap((each) => colorOf(each, side) ?? []),
      );
      if (borders.length === 0) throw new Error(`No ${property} on ${selector}`);
      const backdrops = [
        card,
        ...selectors.flatMap((each) => {
          const fill = declared(each, 'background') ?? declared(each, 'background-color');
          if (fill === undefined || fill === 'none') return [];
          const p = paint(fill, theme, name);
          return [over(p.color, p.alpha, card)];
        }),
      ];
      for (const border of new Set(borders)) {
        const p = paint(border, theme, name);
        for (const [at, backdrop] of backdrops.entries()) {
          out.push([
            `${selector} ${property} ${border} over backdrop ${at}`,
            over(p.color, p.alpha, backdrop),
          ]);
        }
      }
    }
  }
  return out;
}

describe('the editor’s focus rings', () => {
  it('pins every outline and shadow the editor draws, with the rules around it', () => {
    const drawn = SHEET.filter((d) => OUTLINE_PROPERTIES.has(d.property)).map(
      (d) =>
        `${d.at.length > 0 ? `${d.at.join(' / ')} ` : ''}${d.selectors.join(', ')} | ${d.property}: ${d.value}`,
    );
    const ring = `var(${RING})`;
    expect(drawn).toEqual([
      `.quick-setup-banner:focus-visible | outline: 2px solid ${ring}`,
      '.quick-setup-banner:focus-visible | outline-offset: -2px',
      `.story-tile:focus-visible | outline: 2px solid ${ring}`,
      '.story-tile:focus-visible | outline-offset: -2px',
      ".story-tile[aria-pressed='true'] .story-radio | box-shadow: inset 0 0 0 3px var(--card-background-color, #fff)",
      '.text-button:not(.filled, .add-action):focus-visible, .strip-button:focus-visible | outline: none',
      `.text-button:not(.filled, .add-action):focus-visible::before, .strip-button:focus-visible::before | box-shadow: 0 0 0 2px ${ring}`,
      // High-contrast modes drop shadows: the same buttons keep a ring as an outline there.
      `@media (forced-colors: active) .text-button:not(.filled, .add-action):focus-visible, .strip-button:focus-visible | outline: 2px solid ${ring}`,
      '@media (forced-colors: active) .text-button:not(.filled, .add-action):focus-visible, .strip-button:focus-visible | outline-offset: -4px',
      `.icon-button:focus-visible, .audit-edit:focus-visible, .nav-row:focus-visible, .text-button:focus-visible, .link:focus-visible, .field:focus-visible, .heading:focus-visible, .page-title:focus-visible, .wizard-title:focus-visible, .display-choice:has(input:focus-visible), .chip-choice:has(input:focus-visible) | outline: 2px solid ${ring}`,
      '.icon-button:focus-visible, .audit-edit:focus-visible, .nav-row:focus-visible, .text-button:focus-visible, .link:focus-visible, .field:focus-visible, .heading:focus-visible, .page-title:focus-visible, .wizard-title:focus-visible, .display-choice:has(input:focus-visible), .chip-choice:has(input:focus-visible) | outline-offset: 2px',
      '.heading:focus:not(:focus-visible), .page-title:focus:not(:focus-visible), .wizard-title:focus:not(:focus-visible), .field:focus:not(:focus-visible) | outline: none',
      `.layout-open:focus-visible | outline: 2px solid ${ring}`,
      '.layout-open:focus-visible | outline-offset: -4px',
      '.menu | box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.2))',
      `.menu-item:focus-visible | outline: 2px solid ${ring}`,
      '.menu-item:focus-visible | outline-offset: -2px',
      '.setting-toggle:focus-visible | outline: none',
      `.setting-toggle:focus-visible::after | outline: 2px solid ${ring}`,
      '.setting-toggle:focus-visible::after | outline-offset: 2px',
      `.setting-target:focus-visible | outline: 2px solid ${ring}`,
      '.setting-target:focus-visible | outline-offset: -2px',
      `.cal-block .cal-group.grabbed | outline: 2px solid ${ring}`,
      '.cal-block .cal-group.grabbed | outline-offset: -2px',
      `.cal-body:hover, .drag-handle:hover, .cal-body:focus-visible, .cal-filter:focus-visible | outline: 2px solid ${ring}`,
      '.cal-body:hover, .drag-handle:hover, .cal-body:focus-visible, .cal-filter:focus-visible | outline-offset: 2px',
      `.drag-handle:focus-visible | outline: 2px solid ${ring}`,
      '.drag-handle:focus-visible | outline-offset: -4px',
      `.chip:focus-visible, .chip-group:focus-visible, .qualifier:focus-visible | outline: 2px solid ${ring}`,
      '.chip:focus-visible, .chip-group:focus-visible, .qualifier:focus-visible | outline-offset: 2px',
      '.chip-group:focus:not(:focus-visible), .qualifier:focus:not(:focus-visible) | outline: none',
      `.button-row.grabbed | box-shadow: 0 0 0 1px ${ring}`,
      '.cal-block .cal-body:focus-visible | outline-offset: -2px',
      '.cal-list.dragging > .lifted | box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
      `.jumped | outline: 2px solid ${ring}`,
      '.jumped | outline-offset: 4px',
      `.color-toggle:focus-visible, .color-row:has(input:focus-visible), .color-swatch:has(input:focus-visible) | outline: 2px solid ${ring}`,
      '.color-toggle:focus-visible, .color-row:has(input:focus-visible), .color-swatch:has(input:focus-visible) | outline-offset: 2px',
      '.color-swatch:has(input:checked) .color-dot | outline: 2px solid var(--primary-text-color)',
      '.color-swatch:has(input:checked) .color-dot | outline-offset: 2px',
    ]);
  });

  it('draws every ring in the ring color, never the primary color alone', () => {
    // A ring: an outline that draws, or a spread shadow with no blur (`0 0 0 2px`). A checked
    // swatch's mark is not a ring around a control; it is drawn in the text color it clears.
    const MARKS = new Set(['.color-swatch:has(input:checked) .color-dot']);
    const rings = SHEET.filter(
      (d) =>
        ((d.property === 'outline' || d.property === 'outline-color') && d.value !== 'none') ||
        (d.property === 'box-shadow' && /^0 0 0 \d+px /.test(d.value)),
    ).filter((d) => !d.selectors.every((selector) => MARKS.has(selector)));
    expect(rings.length).toBeGreaterThan(10);
    expect(
      rings
        .filter((d) => !d.value.endsWith(`var(${RING})`))
        .map((d) => `${d.selectors.join(', ')} | ${d.value}`),
    ).toEqual([]);
    expect(
      SHEET.filter(
        (d) => OUTLINE_PROPERTIES.has(d.property) && d.value.includes('--primary-color'),
      ),
    ).toEqual([]);
  });

  it('keeps every ring off the colors it does not clear: a frame it adjoins, a tooltip beside it', () => {
    // A rule that draws a ring and a border draws the border in the ring's color, so the two read
    // as one ring: the grabbed button row's 1px border and 1px shadow.
    const ringSelectors = new Set(
      SHEET.filter(
        (d) => OUTLINE_PROPERTIES.has(d.property) && d.value.includes(`var(${RING})`),
      ).flatMap((d) => d.selectors),
    );
    const borders = SHEET.filter(
      (d) => /^border(-color)?$/.test(d.property) && d.selectors.some((s) => ringSelectors.has(s)),
    );
    expect(borders.map((d) => `${d.selectors.join(', ')} | ${d.value}`)).toEqual([
      `.button-row.grabbed | var(${RING})`,
    ]);
    // A focused swatch shows its tooltip, in the text color; the tooltip clears the ring's outer
    // edge (outline width plus offset) by 2px.
    const swatch = '.color-swatch:has(input:focus-visible)';
    const px = (property: string) =>
      Number(
        /^(-?\d+)px/.exec(
          SHEET.filter((d) => d.selectors.includes(swatch) && d.property === property).slice(-1)[0]!
            .value,
        )![1],
      );
    const reach = px('outline') + px('outline-offset');
    const tip = SHEET.filter(
      (d) => d.selectors.includes('.color-tip') && d.property === 'bottom',
    ).slice(-1)[0]!;
    const gap = Number(/^calc\(100% \+ (\d+)px\)$/.exec(tip.value)![1]);
    expect(reach).toBe(4);
    expect(gap - reach).toBeGreaterThanOrEqual(2);
  });

  it('defines the ring as the primary mixed toward the text color, the text color without color-mix()', () => {
    const defined = SHEET.filter((declaration) => declaration.property === RING).map(
      (declaration) => ({ at: declaration.at, selectors: declaration.selectors }),
    );
    expect(defined).toEqual([
      { at: [], selectors: [':host'] },
      { at: [SUPPORTS], selectors: [':host'] },
    ]);
    const fallback = SHEET.find((d) => d.property === RING && d.at.length === 0)!;
    expect(fallback.value).toBe('var(--primary-text-color)');
    // The fallback comes first, so a browser with color-mix() takes the mix.
    const mixed = SHEET.find((d) => d.property === RING && d.at.length === 1)!;
    expect(mixed.index).toBeGreaterThan(fallback.index);
  });

  it.each(['light', 'dark'] as const)(
    'clears 3:1 against every surface the editor paints, in Home Assistant’s %s theme',
    (name) => {
      const theme = THEMES[name];
      const card = theme['--card-background-color'];
      const found = surfaces();
      // The sheet paints the theme's three backgrounds and at least five primary tints.
      expect([...found.keys()].filter((key) => key.startsWith('--')).sort()).toEqual([
        '--card-background-color',
        '--secondary-background-color',
      ]);
      expect([...found.keys()].filter((key) => key.startsWith('tint')).length).toBeGreaterThan(4);
      // The dialog behind the editor, which no rule here paints.
      const painted: Array<[string, Rgb]> = [
        ['--primary-background-color', theme['--primary-background-color']],
        // The rows' and cards' frames, which a ring drawn at its element's edge can touch.
        ['--divider-color', theme['--divider-color']],
        ...frameColors(theme, name),
      ];
      for (const [key, entry] of found) {
        if (entry.tint === undefined) {
          painted.push([key, theme[key]]);
        } else {
          // A tint over the card, and over the gray it can also sit on.
          painted.push([`${key} over the card`, over(theme['--primary-color'], entry.tint, card)]);
          painted.push([
            `${key} over the gray`,
            over(theme['--primary-color'], entry.tint, theme['--secondary-background-color']),
          ]);
        }
      }
      const rings = SHEET.filter((d) => d.property === RING);
      // Both definitions, so the loop below cannot pass by running zero times.
      expect(rings).toHaveLength(2);
      for (const declaration of rings) {
        const ring = resolve(declaration.value, theme);
        const weakest = painted
          .map(([surface, color]) => ({ surface, ratio: contrast(ring, color) }))
          .sort((a, b) => a.ratio - b.ratio)[0];
        expect(weakest.ratio, `${declaration.value} on ${weakest.surface}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    },
  );

  it.each(['light', 'dark'] as const)(
    'clears 3:1 with each of Material’s nineteen hues as the primary, in a %s theme',
    (name) => {
      const MATERIAL: Readonly<Record<string, Rgb>> = {
        red: [244, 67, 54],
        pink: [233, 30, 99],
        purple: [156, 39, 176],
        'deep-purple': [103, 58, 183],
        indigo: [63, 81, 181],
        blue: [33, 150, 243],
        'light-blue': [3, 169, 244],
        cyan: [0, 188, 212],
        teal: [0, 150, 136],
        green: [76, 175, 80],
        'light-green': [139, 195, 74],
        lime: [205, 220, 57],
        yellow: [255, 235, 59],
        amber: [255, 193, 7],
        orange: [255, 152, 0],
        'deep-orange': [255, 87, 34],
        brown: [121, 85, 72],
        gray: [158, 158, 158],
        'blue-gray': [96, 125, 139],
      };
      const mixed = SHEET.find((d) => d.property === RING && d.at.length === 1)!;
      const tints = [...surfaces().values()].flatMap((entry) =>
        entry.tint === undefined ? [] : [entry.tint],
      );
      expect(tints.length).toBeGreaterThan(4);
      const failing: string[] = [];
      for (const [hue, primary] of Object.entries(MATERIAL)) {
        const theme = { ...THEMES[name], '--primary-color': primary };
        const ring = resolve(mixed.value, theme);
        const card = theme['--card-background-color'];
        const gray = theme['--secondary-background-color'];
        const painted = [
          card,
          gray,
          theme['--primary-background-color'],
          theme['--divider-color'],
          ...frameColors(theme, name).map(([, color]) => color),
          ...tints.flatMap((tint) => [over(primary, tint, card), over(primary, tint, gray)]),
        ];
        const weakest = Math.min(...painted.map((color) => contrast(ring, color)));
        if (weakest < 3) failing.push(`${hue} ${weakest.toFixed(2)}`);
      }
      expect(failing).toEqual([]);
    },
  );

  it('names the frames of every ring that reaches its element’s edge', () => {
    // Every ring is 2px wide, so a ring reaches its edge at an offset above -4px.
    const widths = SHEET.filter(
      (d) => d.property === 'outline' && d.value.includes(`var(${RING})`),
    ).map((d) => d.value.split(' ')[0]);
    expect(new Set(widths)).toEqual(new Set(['2px']));
    const reaching = SHEET.filter((d) => d.property === 'outline-offset')
      .filter((d) => {
        const offset = Number(/^(-?\d+)px$/.exec(d.value)![1]);
        return offset < 0 && offset > -4;
      })
      .flatMap((d) => d.selectors)
      .filter((selector) => declared(selector, 'outline-offset') !== '-4px');
    expect([...new Set(reaching)].sort()).toEqual(Object.keys(FRAMES).sort());
    // And each names frames this sheet draws, so a frame that moves fails here.
    // And each names a frame this sheet draws, in a color it knows: an unknown one throws.
    for (const name of ['light', 'dark'] as const) {
      expect(frameColors(THEMES[name], name).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('shows a swatch’s tooltip only where no focused ring lies under it', () => {
    // Every rule that places or shows a tooltip, pinned, so an override for a focused swatch or a
    // hover rule that no longer steps aside for the keyboard fails here.
    const tip = SHEET.filter((d) => d.selectors.some((selector) => selector.includes('.color-tip')))
      .filter((d) =>
        /^(display|position|top|bottom|inset|transform|translate|margin)/.test(d.property),
      )
      .map(
        (d) =>
          `${d.at.length > 0 ? `${d.at.join(' / ')} ` : ''}${d.selectors.join(', ')} | ${d.property}: ${d.value}`,
      );
    expect(tip).toEqual([
      '.color-tip | position: absolute',
      '.color-tip | bottom: calc(100% + 6px)',
      '.color-tip | display: none',
      '.color-control:not(:has(:focus-visible), :focus-visible *) .color-swatch:hover .color-tip, .color-control:not(:has(:focus-visible), :focus-visible *) .color-swatch:active .color-tip, .color-swatch:has(input:focus-visible) .color-tip | display: block',
    ]);
  });

  it('measures what the old primary ring measured, so the bar above is not one any color clears', () => {
    // The control: the primary color alone, on the same surfaces, falls under 3:1 in light.
    const theme = THEMES.light;
    const strip = theme['--secondary-background-color'];
    const chosen = over(theme['--primary-color'], 0.08, theme['--card-background-color']);
    expect(Math.round(contrast(theme['--primary-color'], strip) * 100) / 100).toBe(2.59);
    expect(Math.round(contrast(theme['--primary-color'], chosen) * 100) / 100).toBe(2.98);
  });
});

describe('the starting layout’s rows', () => {
  it('draw a Settings button’s ring inside the row’s frame, with the row’s own fill on both sides', () => {
    // The frame of the chosen row is the primary color, which no ring color clears in both
    // themes; at 4px in, 2px of the row's fill lies between the ring and the frame. The last
    // declaration is the one that applies.
    const offset = SHEET.filter(
      (d) => d.selectors.includes('.layout-open:focus-visible') && d.property === 'outline-offset',
    ).slice(-1)[0];
    expect(offset?.value).toBe('-4px');
  });
});
