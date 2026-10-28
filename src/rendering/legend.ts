/**
 * The calendar filter, which the configuration calls the legend: each calendar hides or shows
 * its events on this device.
 *
 * It takes one of two forms. As a menu, a button at the start of the action row opens a
 * checkbox per calendar, floating over the events. As chips, one per calendar sits in the middle
 * of the heading row, tinted in its color, so the chips are also the key to the colors below;
 * where they do not all fit beside the month and the arrows, the chips give way to exactly the
 * menu's layout. The card decides which; this module draws either, and runs the menu.
 *
 * The menu is a native `<dialog>` opened with `showModal()`. That reaches the browser's top
 * layer, so `ha-card`'s `overflow: hidden` cannot clip it, in every browser Home Assistant
 * still serves; the popover API would need a newer one. A modal dialog makes the rest of the
 * page inert while it is open, so every way it can end, a press outside, Escape, a scroll, a
 * resize, the card hiding or folding open again, closes it through one path. Floating over the
 * events, it has to be opaque even where a theme's card background is not, so its surface is
 * painted here when it opens (`opaqueMenuSurface`).
 */

import { mdiCalendarFilter } from '@mdi/js';
import { TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** One calendar the legend lists. */
export interface LegendCalendar {
  /** The calendar's entity id. */
  id: string;
  /** Its name, as Home Assistant holds it. */
  name: string;
  /** Its accent color, which tints its chip. */
  color: string;
  /** False while the legend hides it. */
  shown: boolean;
}

/** What the card hands the wrapper when it should draw the legend. */
export interface CalendarLegend {
  /** Every calendar on the card, once each, in the order the configuration first names it. */
  calendars: ReadonlyArray<LegendCalendar>;
  /** Home Assistant's name for a list of calendars, or undefined when it offers none. */
  name: string | undefined;
  /**
   * True when the legend is a button opening a menu: always under `menu`, and under `chips`
   * while they do not all fit.
   */
  folded: boolean;
  /** True while the card is being edited: everything is drawn, and nothing toggles or opens. */
  inert: boolean;
  onToggle: (id: string) => void;
}

/**
 * What a card announces when its legend hides or shows a calendar, so another card with the
 * same configuration, which shares the remembered choice, can take it up.
 */
export interface LegendChange {
  /** The configuration's fingerprint, which keys the remembered choice. */
  fingerprint: string;
  /** Every calendar now hidden. */
  hidden: ReadonlyArray<string>;
  /** The card that changed it, which ignores its own announcement. */
  source: unknown;
}

/** Why the menu closed, which decides whether focus goes back to its button. */
type CloseReason = 'escape' | 'backdrop' | 'button' | 'scroll' | 'resize' | 'gone';

/** A rectangle, as `getBoundingClientRect` returns one. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the menu goes, in viewport pixels. */
export interface MenuPlacement {
  left: number;
  top: number;
  /** Set when the menu is taller than the room on either side of its button. */
  maxHeight: number | undefined;
}

/** A color as a canvas reads it back: red, green, blue and alpha, each 0–255. */
export type Rgba = readonly [number, number, number, number];

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The legend's accessible name when Home Assistant has no string for it. Only ever an
 * `aria-label`, under the toolbar's rule for English fallbacks.
 */
const UNLOCALIZED_LEGEND_NAME = 'Calendars';

/** The window event a {@link LegendChange} travels on. */
export const LEGEND_CHANGED_EVENT = 'calendar-card-pro-legend-changed';

/** Room kept between the menu and the viewport's edges, and between it and its button. */
const MENU_VIEWPORT_INSET = 8;
const MENU_GAP = 4;

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
// PLACEMENT
//-----------------------------------------------------------------------------

/**
 * Where the menu goes beside its button.
 *
 * Its inline start lines up with the button's, because the button leads the action row: the
 * left edge in a left-to-right card, the right edge in a right-to-left one. It is then kept
 * inside the viewport. It opens below the button where it fits, else above where it
 * fits, else on the roomier side with a height that fits there, scrolling inside.
 *
 * @param anchor - The button's rectangle
 * @param menu - The menu's natural size
 * @param viewport - The viewport's size
 * @param rtl - Whether the card reads right to left
 * @returns The menu's position, and a maximum height when it needs one
 */
export function placeMenu(
  anchor: Rect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
): MenuPlacement {
  const inlineStart = rtl ? anchor.right - menu.width : anchor.left;
  const maxLeft = Math.max(MENU_VIEWPORT_INSET, viewport.width - MENU_VIEWPORT_INSET - menu.width);
  const left = Math.min(Math.max(inlineStart, MENU_VIEWPORT_INSET), maxLeft);

  const below = viewport.height - anchor.bottom - MENU_GAP - MENU_VIEWPORT_INSET;
  const above = anchor.top - MENU_GAP - MENU_VIEWPORT_INSET;
  if (menu.height <= below) return { left, top: anchor.bottom + MENU_GAP, maxHeight: undefined };
  if (menu.height <= above) {
    return { left, top: anchor.top - MENU_GAP - menu.height, maxHeight: undefined };
  }
  if (below >= above) {
    return { left, top: anchor.bottom + MENU_GAP, maxHeight: Math.max(0, below) };
  }
  const height = Math.max(0, above);
  return { left, top: anchor.top - MENU_GAP - height, maxHeight: height };
}

//-----------------------------------------------------------------------------
// SURFACE
//-----------------------------------------------------------------------------

/**
 * The color an open menu is painted, where the theme's card background would let the events
 * show through it.
 *
 * The stylesheet paints the menu in the theme's card background. A theme made for a
 * wallpaper makes that see-through, and relies on the wallpaper, and often a blur, behind its
 * cards. The menu floats over the events with neither, so there a see-through surface shows
 * the events through every row. Such a surface is laid over the theme's page color, which is
 * what the theme's text is made to be read on, and that over black under light text or white
 * under dark text, so the result is opaque whatever the page color is. An opaque surface is
 * left to the stylesheet, so an opaque theme's menu is exactly what it was.
 *
 * Neither the color scheme nor the card background can say which way a theme leans: a light
 * mode can set white text on a dark page, under a gray card. The text can.
 *
 * @param surface - The menu's background color as the stylesheet resolves it
 * @param page - The theme's page color, when there is one to read
 * @param ink - The menu's text color, when there is one to read
 * @returns An opaque `rgb()` color, or undefined where the surface is opaque already
 */
export function opaqueMenuSurface(
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
 * The colors of the gradients a menu's background image is made of.
 *
 * A theme's card background may be a gradient rather than a color, and then the computed
 * background color is transparent whether the gradient is or not. Its stops say which: a
 * gradient whose every stop is opaque covers the menu, and is left as it is. An image, or a
 * stop the browser left unresolved, says nothing of the sort.
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
 * The theme's page color, as the browser resolves it inside the menu. Read off a hidden probe,
 * because the custom property's own value is only its text: written with `light-dark()` or
 * `currentColor`, it is not yet a color a canvas can paint. Transparent where the theme sets
 * none.
 *
 * @param dialog - The open menu
 * @returns The resolved color
 */
function pageColor(dialog: HTMLDialogElement): string {
  const probe = dialog.ownerDocument.createElement('span');
  probe.style.display = 'none';
  probe.style.backgroundColor = 'var(--primary-background-color)';
  dialog.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

/**
 * Gives an open menu an opaque surface where its theme's is see-through, and takes it away
 * again where the theme's is opaque (see {@link opaqueMenuSurface}).
 *
 * The surface is read from the menu itself, so a theme changed since the menu last opened, and
 * a card-mod rule on `.legend-menu`, are both what is read. A card-mod rule marked `!important`
 * still wins over the color set here, so a menu someone made see-through on purpose stays so.
 * It runs whenever the menu is placed, so a theme changed while the menu is open is followed at
 * the card's next update. A surface that cannot be read leaves the menu as the stylesheet
 * paints it, and so does a browser without a 2D canvas.
 *
 * @param dialog - The open menu
 */
function paintMenuSurface(dialog: HTMLDialogElement): void {
  dialog.style.removeProperty('background-color');
  const canvas = dialog.ownerDocument.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  const style = getComputedStyle(dialog);
  const surface = readColor(context, style.backgroundColor);
  if (!surface) return;
  const stops = gradientColors(style.backgroundImage);
  if (stops?.length && stops.every((stop) => readColor(context, stop)?.[3] === 255)) return;
  const color = opaqueMenuSurface(
    surface,
    readColor(context, pageColor(dialog)),
    readColor(context, style.color),
  );
  if (color) dialog.style.backgroundColor = color;
}

//-----------------------------------------------------------------------------
// MENU CONTROLLER
//-----------------------------------------------------------------------------

interface OpenMenu {
  /** The button that opened it, which it is placed beside. */
  opener: HTMLElement;
  /** Why it is closing, once something asked it to. */
  reason: CloseReason | undefined;
  /** Removes every listener the open menu holds. */
  stop: () => void;
}

/** Menus open now, each with what it holds. */
const openMenus = new Map<HTMLDialogElement, OpenMenu>();

/**
 * Places an open menu beside its button.
 *
 * The maximum height is cleared before the menu is measured, so a menu once squeezed grows
 * back where there is room again. Clearing it leaves nothing to scroll, which resets the
 * menu's scroll position, so that is put back afterwards: this runs after every update of the
 * card, a tick in the menu included, and must not throw a long list back to its top.
 *
 * @param dialog - The open menu
 * @param opener - Its button
 */
function positionMenu(dialog: HTMLDialogElement, opener: HTMLElement): void {
  const scrollTop = dialog.scrollTop;
  dialog.style.maxHeight = '';
  const menu = dialog.getBoundingClientRect();
  const view = dialog.ownerDocument.defaultView;
  const rtl = getComputedStyle(opener).direction === 'rtl';
  const placement = placeMenu(
    opener.getBoundingClientRect(),
    { width: menu.width, height: menu.height },
    { width: view?.innerWidth ?? menu.width, height: view?.innerHeight ?? menu.height },
    rtl,
  );
  dialog.style.left = `${placement.left}px`;
  dialog.style.top = `${placement.top}px`;
  if (placement.maxHeight !== undefined) dialog.style.maxHeight = `${placement.maxHeight}px`;
  dialog.scrollTop = scrollTop;
}

/**
 * Closes a menu, saying why. Nothing happens for one that is not open.
 *
 * @param dialog - The menu
 * @param reason - Why it closes
 */
function closeMenu(dialog: HTMLDialogElement, reason: CloseReason): void {
  const open = openMenus.get(dialog);
  if (!open) return;
  open.reason ??= reason;
  if (dialog.open) {
    dialog.close();
  } else {
    // Already closed, or removed from the page without closing: the close event will not
    // come, so finish here.
    finishClose(dialog);
  }
}

/**
 * Everything closing a menu does, whichever way it closed: listeners go, and the button says
 * the menu is closed.
 *
 * Focus is the browser's to return. Closing a modal dialog puts focus back where it was before
 * the dialog opened, the button, without scrolling, however the dialog closed. Focusing the
 * button here as well, after a close someone asked for, covers a browser that does not; after
 * a scroll, a resize or the button going away, nothing is asked of focus beyond what the
 * browser does.
 *
 * @param dialog - The menu that closed
 */
function finishClose(dialog: HTMLDialogElement): void {
  const open = openMenus.get(dialog);
  if (!open) return;
  openMenus.delete(dialog);
  open.stop();
  open.opener.setAttribute('aria-expanded', 'false');

  // Escape is the dialog's own cancel and close, so it arrives with no reason recorded.
  const reason = open.reason ?? 'escape';
  const deliberate = reason === 'escape' || reason === 'backdrop' || reason === 'button';
  if (deliberate && open.opener.isConnected) open.opener.focus({ preventScroll: true });
}

/**
 * Opens a menu beside its button. Nothing happens for one already open or not on the page.
 *
 * @param dialog - The menu
 * @param opener - The button that opens it
 */
function openMenu(dialog: HTMLDialogElement, opener: HTMLElement): void {
  if (dialog.open || openMenus.has(dialog) || !dialog.isConnected) return;

  try {
    dialog.showModal();
  } catch {
    return;
  }
  // In the same task as showModal, so the menu is never painted where the browser first puts
  // it, in the middle of the viewport, nor see-through for a frame.
  positionMenu(dialog, opener);
  paintMenuSurface(dialog);
  opener.setAttribute('aria-expanded', 'true');

  const view = dialog.ownerDocument.defaultView ?? window;
  // A scroll inside the menu is the menu's own; any other moves the button away from it.
  const onScroll = (ev: Event) => {
    if (ev.composedPath().includes(dialog)) return;
    closeMenu(dialog, 'scroll');
  };
  const onResize = () => closeMenu(dialog, 'resize');
  const onClose = () => finishClose(dialog);
  view.addEventListener('scroll', onScroll, { capture: true, passive: true });
  view.addEventListener('resize', onResize);
  dialog.addEventListener('close', onClose);

  openMenus.set(dialog, {
    opener,
    reason: undefined,
    stop: () => {
      view.removeEventListener('scroll', onScroll, { capture: true });
      view.removeEventListener('resize', onResize);
      dialog.removeEventListener('close', onClose);
    },
  });
}

/**
 * Closes every legend menu open inside a card, without moving focus.
 *
 * For whatever is about to take the menu's place away: the card hiding, folding open, being
 * edited, losing its legend or leaving the page.
 *
 * @param root - The card's shadow root
 */
export function closeLegendMenus(root: ParentNode): void {
  for (const dialog of [...openMenus.keys()]) {
    if (!dialog.isConnected || root.contains(dialog)) closeMenu(dialog, 'gone');
  }
}

/**
 * Places every legend menu open inside a card beside its button again, and paints its surface
 * again, after the card has re-rendered. A menu whose button is gone closes.
 *
 * @param root - The card's shadow root
 */
export function repositionLegendMenus(root: ParentNode): void {
  for (const [dialog, open] of [...openMenus]) {
    if (!dialog.isConnected || !open.opener.isConnected) {
      closeMenu(dialog, 'gone');
    } else if (root.contains(dialog)) {
      positionMenu(dialog, open.opener);
      paintMenuSurface(dialog);
    }
  }
}

/**
 * Whether a legend menu is open inside a card.
 *
 * @param root - The card's shadow root
 * @returns True while one is open
 */
export function hasOpenLegendMenu(root: ParentNode): boolean {
  return [...openMenus.keys()].some((dialog) => root.contains(dialog));
}

//-----------------------------------------------------------------------------
// RENDERING
//-----------------------------------------------------------------------------

/**
 * Keep a press inside the legend from also becoming a press on the card, as the toolbar's
 * controls do (`stopCardGesture` in `toolbar.ts`).
 *
 * @param ev - The event to keep inside
 */
function stopCardGesture(ev: Event): void {
  ev.stopPropagation();
}

/**
 * A chip's or a row's color, as the custom property its stylesheet rules read.
 *
 * @param calendar - The calendar
 * @returns The inline style
 */
function legendColor(calendar: LegendCalendar) {
  return styleMap({ '--calendar-card-legend-color': calendar.color });
}

/**
 * Render the legend's chips: one per calendar, in the middle of the heading row.
 *
 * Each chip is a native toggle button, pressed while its calendar is shown, so it is a tab
 * stop of its own and Enter and Space work without key handling of ours. A hidden calendar's
 * chip stays in place, gray, so a filtered card always shows that it is filtered.
 *
 * @param legend - Legend description from the card
 * @returns The chips
 */
export function renderLegendChips(legend: CalendarLegend): TemplateResult {
  const name = legend.name ?? UNLOCALIZED_LEGEND_NAME;

  return html`<div
    class="toolbar-legend"
    role="group"
    aria-label=${name}
    @pointerdown=${stopCardGesture}
    @click=${stopCardGesture}
  >
    <div class="legend-chips">
      ${legend.calendars.map(
        (calendar) =>
          html`<button
            type="button"
            class=${calendar.shown ? 'legend-chip' : 'legend-chip hidden-calendar'}
            style=${legendColor(calendar)}
            data-calendar=${calendar.id}
            aria-pressed=${calendar.shown ? 'true' : 'false'}
            @click=${() => {
              if (!legend.inert) legend.onToggle(calendar.id);
            }}
          >
            <span class="legend-chip-label">${calendar.name}</span>
          </button>`,
      )}
    </div>
  </div>`;
}

/**
 * Render the folded legend: a button leading the action row, and the menu it opens.
 *
 * The menu lists every calendar as a checkbox, tinted as its chip would be. It closes on a
 * press outside it, on Escape, on a scroll or a resize, and on a second press on the button.
 * The button carries a dot while any calendar is hidden, so a folded legend still says the
 * card is filtered. An icon, a calendar with a funnel: Home Assistant's name for it names it and
 * shows as its tooltip, and the English fallback names it and nothing else.
 *
 * `aria-expanded` is written once by the template and then kept by the menu itself, so a
 * re-render while the menu is open does not reset it.
 *
 * @param legend - Legend description from the card
 * @returns The button and its menu
 */
export function renderLegendButton(legend: CalendarLegend): TemplateResult {
  const name = legend.name ?? UNLOCALIZED_LEGEND_NAME;
  const filtered = legend.calendars.some((calendar) => !calendar.shown);
  const className = filtered
    ? 'toolbar-button legend-button filtered'
    : 'toolbar-button legend-button';

  const dialogOf = (button: HTMLElement): HTMLDialogElement | null =>
    button.parentElement?.querySelector<HTMLDialogElement>('dialog.legend-menu') ?? null;
  const onClick = (ev: Event) => {
    ev.stopPropagation();
    const button = ev.currentTarget as HTMLElement;
    const dialog = dialogOf(button);
    if (!dialog) return;
    if (openMenus.has(dialog)) {
      closeMenu(dialog, 'button');
      return;
    }
    if (legend.inert) return;
    openMenu(dialog, button);
  };
  // A press on the backdrop arrives at the dialog itself, outside its box. A press on the
  // dialog's own padding arrives there too, inside it, and is ignored.
  const onDialogClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    const dialog = ev.currentTarget as HTMLDialogElement;
    if (ev.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside =
      ev.clientX >= box.left &&
      ev.clientX <= box.right &&
      ev.clientY >= box.top &&
      ev.clientY <= box.bottom;
    if (!inside) closeMenu(dialog, 'backdrop');
  };

  return html`<button
      type="button"
      class=${className}
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-label=${name}
      title=${legend.name ?? nothing}
      @pointerdown=${stopCardGesture}
      @click=${onClick}
    >
      <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d=${mdiCalendarFilter}></path>
      </svg>
    </button>
    <dialog
      class="legend-menu"
      aria-label=${name}
      @pointerdown=${stopCardGesture}
      @click=${onDialogClick}
    >
      <div class="legend-menu-list" role="group" aria-label=${name}>
        ${legend.calendars.map(
          (calendar) =>
            html`<label
              class=${calendar.shown ? 'legend-menu-row' : 'legend-menu-row hidden-calendar'}
              style=${legendColor(calendar)}
              data-calendar=${calendar.id}
            >
              <input
                type="checkbox"
                class="legend-menu-check"
                .checked=${calendar.shown}
                @change=${(ev: Event) => {
                  const input = ev.currentTarget as HTMLInputElement;
                  if (legend.inert) {
                    input.checked = calendar.shown;
                    return;
                  }
                  legend.onToggle(calendar.id);
                }}
              />
              <span class="legend-menu-label">${calendar.name}</span>
            </label>`,
        )}
      </div>
    </dialog>`;
}

/**
 * The calendars a legend lists: every entity on the card, once, in the order the
 * configuration first names it. A calendar listed twice, split by `event_type`, is one chip.
 *
 * @param entities - The card's normalized entities
 * @returns Entity ids
 */
export function legendCalendarIds(entities: ReadonlyArray<string | { entity: string }>): string[] {
  const ids: string[] = [];
  for (const entry of entities) {
    const id = typeof entry === 'string' ? entry : entry?.entity;
    if (typeof id === 'string' && id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Names, in a tooltip, each chip whose name was cut short.
 *
 * A chip is only as wide as a long name allows (`.legend-chip-label`), so a long name ends in
 * an ellipsis. Its full name then shows on hover. Read after a render, from layout: a name
 * that fits needs no tooltip repeating it, and only layout can say which those are. Without
 * layout every box is empty and nothing changes.
 *
 * @param root - The card's shadow root
 */
export function markShortenedChips(root: ParentNode): void {
  for (const label of root.querySelectorAll<HTMLElement>('.legend-chip-label')) {
    const chip = label.closest('.legend-chip');
    if (!chip) continue;
    if (label.scrollWidth > label.clientWidth + 0.5) {
      chip.setAttribute('title', label.textContent ?? '');
    } else {
      chip.removeAttribute('title');
    }
  }
}
