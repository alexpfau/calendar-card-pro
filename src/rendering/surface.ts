/**
 * Opaque surfaces under a see-through theme.
 *
 * A theme made for a wallpaper makes the card background see-through, and relies on the
 * wallpaper, and often a blur, behind its cards. Two of the card's surfaces are painted in a card
 * background and are meant to cover what is under them: the calendar filter's menu, which floats
 * over the events, and the view switcher's selected segment, which is raised out of its track.
 * Where either comes out see-through, it is handed an opaque color here, in a custom property
 * its stylesheet paints the background color in. Where it is opaque already, it keeps the color
 * the stylesheet gives it, so an opaque theme renders exactly as the stylesheet paints it.
 */

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A color as a canvas reads it back: red, green, blue and alpha, each 0–255. */
export type Rgba = readonly [number, number, number, number];

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * A fill style a canvas is given before a color it is asked to read, so a color it cannot
 * parse, and so leaves the fill style alone, is told apart from one it can.
 */
const UNREAD_FILL = '#010203';

/** A color as a browser serializes one in a computed gradient: a color function, hex, or keyword. */
const COLOR_TOKEN =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;

/** A background image whose opacity its colors cannot tell: an image, or an unresolved stop. */
const UNREADABLE_IMAGE =
  /\b(?:url|image|image-set|cross-fade|element|paint|color-mix)\(|\bcurrentcolor\b/i;

//-----------------------------------------------------------------------------
// SURFACE
//-----------------------------------------------------------------------------

/**
 * The color a surface is painted, where the stylesheet's would let what is under it show
 * through.
 *
 * Such a surface is laid over the theme's page color, which is what the theme's text is made to
 * be read on, and that over black under light text or white under dark text, so the result is
 * opaque whatever the page color is. An opaque surface is left to the stylesheet.
 *
 * Neither the color scheme nor the card background can say which way a theme leans: a light
 * mode can set white text on a dark page, under a gray card. The text can.
 *
 * @param surface - The surface's background color as the stylesheet resolves it
 * @param page - The theme's page color, when there is one to read
 * @param ink - The surface's text color, when there is one to read
 * @returns An opaque `rgb()` color, or undefined where the surface is opaque already
 */
export function opaqueSurface(
  surface: Rgba,
  page: Rgba | undefined,
  ink: Rgba | undefined,
): string | undefined {
  if (surface[3] === 255) return undefined;

  const lightInk = ink !== undefined && 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2] > 127.5;
  let under: number[] = lightInk ? [0, 0, 0] : [255, 255, 255];
  for (const layer of [page, surface]) {
    if (!layer) continue;
    const alpha = layer[3] / 255;
    under = under.map((channel, i) => layer[i] * alpha + channel * (1 - alpha));
  }
  const [red, green, blue] = under.map(Math.round);
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Reads a color the browser has resolved, by painting it on a 1×1 canvas and reading the pixel
 * back, so any syntax the browser paints is read alike. Undefined for a color the canvas cannot
 * parse. A canvas resolves nothing against an element, so `currentColor` would read as black
 * there; every color given to it is a computed value for that reason.
 *
 * @param context - A 2D context on a 1×1 canvas
 * @param color - The color, as CSS
 * @returns Its channels and alpha
 */
function readColor(context: CanvasRenderingContext2D, color: string): Rgba | undefined {
  context.fillStyle = UNREAD_FILL;
  context.fillStyle = color;
  if (context.fillStyle === UNREAD_FILL) return undefined;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue, alpha];
}

/**
 * The colors of the gradients a surface's background image is made of.
 *
 * A theme's card background may be a gradient rather than a color, and then the computed
 * background color is transparent whether the gradient is or not. Its stops say which: a
 * gradient whose every stop is opaque covers what is under it, and is left as it is. An image,
 * or a stop the browser left unresolved, says nothing of the sort.
 *
 * @param image - The computed `background-image`
 * @returns The stops' colors, an empty list for no image, or undefined where they cannot be read
 */
export function gradientColors(image: string): string[] | undefined {
  if (image === '' || image === 'none') return [];
  if (UNREADABLE_IMAGE.test(image)) return undefined;
  return image.match(COLOR_TOKEN) ?? undefined;
}

/**
 * The colors a surface is drawn in, as the browser computes them.
 */
export interface SurfaceColors {
  /** The computed background color. */
  background: string;
  /** The computed background image. */
  image: string;
  /** The computed text color. */
  ink: string;
  /**
   * The theme's page color, as the browser resolves it inside the surface, so a theme written
   * with `light-dark()` or `currentColor` reads as a color a canvas can paint. Transparent where
   * the theme sets none, and empty where there is nothing to read it off.
   */
  page: () => string;
}

/**
 * The opaque color a surface is painted, where the colors the stylesheet gives it are
 * see-through, read through a 1×1 canvas so any syntax the browser paints is read alike (see
 * {@link opaqueSurface}). Undefined where the surface is opaque already, a gradient whose every
 * stop is opaque included, where its color cannot be read, and in a browser without a 2D
 * canvas: each of those leaves the surface as the stylesheet paints it.
 *
 * @param doc - The document the surface is in, which makes the canvas
 * @param colors - The surface's colors
 * @returns An opaque `rgb()` color, or undefined
 */
export function opaqueSurfaceColor(doc: Document, colors: SurfaceColors): string | undefined {
  const canvas = doc.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;

  const color = readColor(context, colors.background);
  if (!color) return undefined;
  const stops = gradientColors(colors.image);
  if (stops?.length && stops.every((stop) => readColor(context, stop)?.[3] === 255)) {
    return undefined;
  }
  return opaqueSurface(color, readColor(context, colors.page()), readColor(context, colors.ink));
}

/**
 * The background color to hand a surface, or undefined to leave it the stylesheet's.
 *
 * Both surfaces are painted the same way. The stylesheet gives the surface's background color a
 * custom property, falling back to the color it would have had, and this is what goes in it:
 * the opaque color where the surface would be see-through ({@link opaqueSurfaceColor}), and
 * nothing where it is opaque and draws no image. The surface's own background is never written,
 * so a card-mod rule that sets it wins as it would against the stylesheet, a see-through one
 * included, and a transition on it cannot be read halfway.
 *
 * The colors are read off two hidden stand-ins drawn inside the surface, which the stylesheet
 * gives the surface's own background and the theme's page color, so each is read as the browser
 * resolves it, a theme changed since the last read included. They are drawn with the surface
 * rather than added for the read: the card's mutation observers take an element added or removed
 * anywhere in the card for a change of the grid's structure, and refit every block for it.
 *
 * Where the surface does draw an image, its color is handed back unchanged when opaque: the
 * stylesheet's fallback takes the background color from the same value a second time, and a
 * value that also draws an image is no background color, so the color it carried would be lost.
 *
 * @param own - The stand-in in the surface's own background
 * @param page - The stand-in in the theme's page color
 * @param ink - The surface, whose text color is read
 * @returns The color, or undefined
 */
export function surfaceColor(own: Element, page: Element, ink: Element): string | undefined {
  const style = getComputedStyle(own);
  const background = style.backgroundColor;
  const image = style.backgroundImage;
  const opaque = opaqueSurfaceColor(own.ownerDocument, {
    background,
    image,
    ink: getComputedStyle(ink).color,
    page: () => getComputedStyle(page).backgroundColor,
  });
  return opaque ?? (image && image !== 'none' ? background : undefined);
}

/**
 * Hands a surface its color in a custom property, or takes the property away for none. Nothing
 * is written when the value is the one it already holds.
 *
 * @param surface - The element painted
 * @param property - The custom property its stylesheet reads
 * @param color - The color, from {@link surfaceColor}
 */
export function setSurfaceColor(
  surface: HTMLElement,
  property: string,
  color: string | undefined,
): void {
  if (color === undefined) surface.style.removeProperty(property);
  else if (surface.style.getPropertyValue(property) !== color) {
    surface.style.setProperty(property, color);
  }
}
