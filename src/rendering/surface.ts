/**
 * Opaque surfaces under a see-through theme.
 *
 * A theme made for a wallpaper makes the card background see-through, and relies on the
 * wallpaper, and often a blur, behind its cards. Two of the card's surfaces are painted in a card
 * background and are meant to cover what is under them: the calendar filter's menu, which floats
 * over the events, and the view switcher's selected segment, which is raised out of its track.
 * Where either comes out see-through, it is painted inline here in an opaque color. Where it is
 * opaque already, nothing is written at all, so an opaque theme renders exactly as the
 * stylesheet paints it.
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
 * The theme's page color, as the browser resolves it inside a surface. Read off a hidden probe,
 * because the custom property's own value is only its text: written with `light-dark()` or
 * `currentColor`, it is not yet a color a canvas can paint. Transparent where the theme sets
 * none.
 *
 * @param surface - The surface
 * @returns The resolved color
 */
function pageColor(surface: HTMLElement): string {
  const probe = surface.ownerDocument.createElement('span');
  probe.style.display = 'none';
  probe.style.backgroundColor = 'var(--primary-background-color)';
  surface.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
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
  /** The theme's page color, resolved inside the surface; asked for only where it is needed. */
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
 * Gives a surface an opaque color where its theme's is see-through, and takes it away again
 * where the theme's is opaque. The calendar filter's menu is painted this way.
 *
 * The color is read from the surface itself, so a theme changed since it was last painted, and a
 * card-mod rule on it, are both what is read. A card-mod rule marked `!important` still wins
 * over the color set here, so a surface someone made see-through on purpose stays so.
 *
 * @param surface - The element whose background is the surface
 */
export function paintOpaqueSurface(surface: HTMLElement): void {
  surface.style.removeProperty('background-color');
  const style = getComputedStyle(surface);
  const opaque = opaqueSurfaceColor(surface.ownerDocument, {
    background: style.backgroundColor,
    image: style.backgroundImage,
    ink: style.color,
    page: () => pageColor(surface),
  });
  if (opaque) surface.style.backgroundColor = opaque;
}
