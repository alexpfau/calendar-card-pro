/**
 * The toolbar's menus: a native `<dialog>` floating over the events beside the button that opens
 * it, placed, painted and closed by one controller. Two menus use it: the calendar filter's
 * (`legend.ts`), and the one the start of the action row folds its last controls into on a
 * narrow card (`toolbar.ts`).
 *
 * Each is opened with `showModal()`. That reaches the browser's top layer, so `ha-card`'s
 * `overflow: hidden` cannot clip it, in every browser Home Assistant still serves; the popover API
 * would need a newer one. A modal dialog makes the rest of the page inert while it is open, so
 * every way it can end, a press outside, Escape, a scroll that moves its button, a resize, a row
 * picked, the card hiding or its button going, closes it through one path (`closeMenu`). Floating
 * over the events, it has to be opaque even where a theme's card background is not, so its surface
 * is painted when it opens and after every update while it is open (`paintMenu`).
 */

import { setSurfaceColor, surfaceColor } from './surface';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** Which menu a dialog is, so the card can close one without the other. */
export type MenuKind = 'legend' | 'overflow';

/**
 * What the controller needs of a menu besides its dialog: which menu it is, and the classes of
 * the two hidden stand-ins drawn inside it that its surface is painted from (`paintMenu`).
 */
export interface MenuParts {
  kind: MenuKind;
  /** The stand-in carrying the menu's own background. */
  surface: string;
  /** The stand-in carrying the theme's page color. */
  page: string;
}

/**
 * Why a menu closed, which decides whether focus goes back to its button. `picked` is a row that
 * ran something, which may move focus itself, as the dialog an action opens does.
 */
export type CloseReason =
  'escape' | 'backdrop' | 'button' | 'picked' | 'scroll' | 'resize' | 'gone';

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

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Room kept between the menu and the viewport's edges, and between it and its button. */
const MENU_VIEWPORT_INSET = 8;
const MENU_GAP = 4;

/**
 * The custom property the menu's opaque color is handed to the stylesheet in, which paints the
 * menu's background color in it, under any image the theme's card background draws. Named for
 * the legend, whose menu came first; every menu's background reads it.
 */
const MENU_SURFACE = '--calendar-card-legend-menu-surface';

//-----------------------------------------------------------------------------
// PLACEMENT
//-----------------------------------------------------------------------------

/**
 * Where the menu goes beside its button.
 *
 * Its inline start lines up with the button's, because the button sits at the start of the
 * action row: the left edge in a left-to-right card, the right edge in a right-to-left one. It
 * is then kept inside the viewport. It opens below the button where it fits, else above where it
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
// MENU CONTROLLER
//-----------------------------------------------------------------------------

interface OpenMenu {
  /** The button that opened it, which it is placed beside. */
  opener: HTMLElement;
  /** Whether a press opened it, which leaves focus on the menu itself. */
  pressed: boolean;
  /** Which menu it is, and where its stand-ins are. */
  parts: MenuParts;
  /** Why it is closing, once something asked it to. */
  reason: CloseReason | undefined;
  /** Where its button was when it was last placed beside it, in the viewport. */
  placedAt: { top: number; left: number };
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
 * @returns Where the button was, which the menu now sits beside
 */
function positionMenu(
  dialog: HTMLDialogElement,
  opener: HTMLElement,
): { top: number; left: number } {
  const scrollTop = dialog.scrollTop;
  dialog.style.maxHeight = '';
  const menu = dialog.getBoundingClientRect();
  const view = dialog.ownerDocument.defaultView;
  const rtl = getComputedStyle(opener).direction === 'rtl';
  const button = opener.getBoundingClientRect();
  const placement = placeMenu(
    button,
    { width: menu.width, height: menu.height },
    { width: view?.innerWidth ?? menu.width, height: view?.innerHeight ?? menu.height },
    rtl,
  );
  dialog.style.left = `${placement.left}px`;
  dialog.style.top = `${placement.top}px`;
  if (placement.maxHeight !== undefined) dialog.style.maxHeight = `${placement.maxHeight}px`;
  dialog.scrollTop = scrollTop;
  return { top: button.top, left: button.left };
}

/**
 * Whether a button has moved in the viewport since its menu was placed beside it, by half a
 * pixel or more.
 *
 * @param opener - The button
 * @param placedAt - Where it was then
 * @returns True where the menu no longer sits beside it
 */
function moved(opener: HTMLElement, placedAt: { top: number; left: number }): boolean {
  const now = opener.getBoundingClientRect();
  return Math.abs(now.top - placedAt.top) >= 0.5 || Math.abs(now.left - placedAt.left) >= 0.5;
}

/**
 * Paints an open menu opaque where its theme's card background is see-through, by handing the
 * stylesheet an opaque color for the menu's background color in a custom property
 * (`surfaceColor` in `surface.ts`). The menu's own background is never written, so a card-mod
 * rule that sets it wins as it would against the stylesheet, a see-through one included, and a
 * transition on it cannot be read halfway. Its colors are read off the two hidden stand-ins
 * drawn inside it, which this runs after every update while the menu is open.
 *
 * Where nothing has to be laid under it, the menu is handed its own color back, read off the
 * stand-in, rather than nothing. The stylesheet's fallback is the theme's card background, which
 * a theme may write as a background shorthand, `#1c1c1c no-repeat` say, and a shorthand is no
 * background color: the fallback would leave the menu transparent.
 *
 * @param dialog - The open menu
 * @param parts - Where its stand-ins are
 */
function paintMenu(dialog: HTMLDialogElement, parts: MenuParts): void {
  const own = dialog.querySelector(`:scope > .${parts.surface}`);
  const page = dialog.querySelector(`:scope > .${parts.page}`);
  const color = own && page ? surfaceColor(own, page, dialog) : undefined;
  setSurfaceColor(
    dialog,
    MENU_SURFACE,
    own && page ? (color ?? getComputedStyle(own).backgroundColor) : undefined,
  );
}

/**
 * Closes a menu, saying why. Nothing happens for one that is not open.
 *
 * @param dialog - The menu
 * @param reason - Why it closes
 */
export function closeMenu(dialog: HTMLDialogElement, reason: CloseReason): void {
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
 * a scroll, a resize, a row picked or the button going away, nothing is asked of focus beyond
 * what the browser does. A row picked runs something that may move focus itself, as the dialog
 * an action opens does, and must not have it taken back once the close event arrives.
 *
 * A menu a press opened and a press closed is the exception, and is left to the browser too. It
 * held focus itself, and in WebKit that focus counts as the keyboard's, which carries over to
 * whatever a script focuses next, so focusing the button would ring it after nothing but
 * presses. There, where a press does not focus a button, focus goes back to where it was before
 * the menu opened. Escape still focuses the button.
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
  const deliberate =
    reason === 'escape' || (!open.pressed && (reason === 'backdrop' || reason === 'button'));
  if (deliberate && open.opener.isConnected) open.opener.focus({ preventScroll: true });
}

/**
 * Opens a menu beside its button. Nothing happens for one already open or not on the page.
 *
 * The dialog gives focus to its first control, which is where a keyboard wants it. A press
 * moves it on to the menu itself, which draws no ring, before anything is painted: WebKit counts
 * the dialog's own choice as keyboard focus, and rang the first control after a press. Tab then
 * reaches the first control.
 *
 * @param dialog - The menu
 * @param opener - The button that opens it
 * @param pressed - Whether a press opened it, rather than a key
 * @param parts - Which menu it is, and where its stand-ins are
 */
function openMenu(
  dialog: HTMLDialogElement,
  opener: HTMLElement,
  pressed: boolean,
  parts: MenuParts,
): void {
  if (dialog.open || openMenus.has(dialog) || !dialog.isConnected) return;

  try {
    dialog.showModal();
  } catch {
    return;
  }
  // In the same task as showModal, so the menu is never painted where the browser first puts
  // it, in the middle of the viewport, nor see-through for a frame.
  const placedAt = positionMenu(dialog, opener);
  paintMenu(dialog, parts);
  if (pressed) dialog.focus({ preventScroll: true });
  opener.setAttribute('aria-expanded', 'true');

  const view = dialog.ownerDocument.defaultView ?? window;
  // A scroll inside the menu is the menu's own. Any other closes it where it moved the button
  // away from it, and only there: a scroll elsewhere on the dashboard leaves the button where
  // it was, and the event for a scroll the menu was already placed after can arrive once it is
  // open, as Firefox's does a few milliseconds late.
  const onScroll = (ev: Event) => {
    if (ev.composedPath().includes(dialog)) return;
    const open = openMenus.get(dialog);
    if (open && !moved(opener, open.placedAt)) return;
    closeMenu(dialog, 'scroll');
  };
  const onResize = () => closeMenu(dialog, 'resize');
  const onClose = () => finishClose(dialog);
  view.addEventListener('scroll', onScroll, { capture: true, passive: true });
  view.addEventListener('resize', onResize);
  dialog.addEventListener('close', onClose);

  openMenus.set(dialog, {
    opener,
    pressed,
    parts,
    reason: undefined,
    placedAt,
    stop: () => {
      view.removeEventListener('scroll', onScroll, { capture: true });
      view.removeEventListener('resize', onResize);
      dialog.removeEventListener('close', onClose);
    },
  });
}

/**
 * What a press on a menu's button does: closes the menu where it is open, and opens it where it
 * is not, unless the card is being edited. A click from Enter or Space counts no presses; one
 * from a mouse, a finger or a pen does, which decides where focus goes (`openMenu`).
 *
 * @param ev - The button's click
 * @param dialog - The menu it opens
 * @param inert - Whether the card is being edited, when the menu opens on nothing
 * @param parts - Which menu it is, and where its stand-ins are
 */
export function pressMenuButton(
  ev: MouseEvent,
  dialog: HTMLDialogElement,
  inert: boolean,
  parts: MenuParts,
): void {
  if (openMenus.has(dialog)) {
    closeMenu(dialog, 'button');
    return;
  }
  if (inert) return;
  openMenu(dialog, ev.currentTarget as HTMLElement, ev.detail > 0, parts);
}

/**
 * Closes a menu on a press outside it. A press on the backdrop arrives at the dialog itself,
 * outside its box. A press on the dialog's own padding arrives there too, inside it, and is
 * ignored.
 *
 * @param ev - A click on the dialog
 */
export function closeOnPressOutside(ev: MouseEvent): void {
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
}

/**
 * Closes every menu open inside a card, or every one of a kind, without moving focus.
 *
 * For whatever is about to take a menu's place away: the card hiding, being edited or leaving
 * the page, a menu's button going, or the card changing width under it.
 *
 * @param root - The card's shadow root
 * @param kind - Only menus of this kind; every menu without one
 */
export function closeMenus(root: ParentNode, kind?: MenuKind): void {
  for (const [dialog, open] of [...openMenus]) {
    if (kind !== undefined && open.parts.kind !== kind) continue;
    if (!dialog.isConnected || root.contains(dialog)) closeMenu(dialog, 'gone');
  }
}

/**
 * Places every menu open inside a card beside its button again, and paints its surface again,
 * after the card has re-rendered. A menu whose button is gone closes.
 *
 * @param root - The card's shadow root
 */
export function repositionMenus(root: ParentNode): void {
  for (const [dialog, open] of [...openMenus]) {
    if (!dialog.isConnected || !open.opener.isConnected) {
      closeMenu(dialog, 'gone');
    } else if (root.contains(dialog)) {
      open.placedAt = positionMenu(dialog, open.opener);
      paintMenu(dialog, open.parts);
    }
  }
}

/**
 * Whether a menu is open inside a card.
 *
 * @param root - The card's shadow root
 * @param kind - Only a menu of this kind; any menu without one
 * @returns True while one is open
 */
export function hasOpenMenu(root: ParentNode, kind?: MenuKind): boolean {
  return [...openMenus].some(
    ([dialog, open]) => (kind === undefined || open.parts.kind === kind) && root.contains(dialog),
  );
}
