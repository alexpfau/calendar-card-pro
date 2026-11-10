/**
 * The shell the card's floating panels share: the event popover (`event-popover.ts`) and the
 * search panel (`search-panel.ts`).
 *
 * Each is opened through Home Assistant's dialog manager (`show-dialog` with an element tag of
 * its own), which hands it `hass`, gives it Back to close, and puts focus back where it was, and
 * is drawn as a native modal `<dialog>` in the top layer: beside the press that opened it, below
 * a toolbar button with its beak pointing up at it, or as a sheet from the bottom of a narrow
 * screen. They share how they are placed, the beak, the material (a blurred glass in a light or
 * dark palette, as Home Assistant's dark mode chooses, in the system's own font), how they open
 * and close, and the cells their content is drawn in. What each holds is its own.
 */

import { LitElement, PropertyValues, TemplateResult, css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import * as Types from '../config/types';
import type * as Model from '../interaction/popover-model';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Below this viewport width a panel is a sheet from the bottom of the screen. */
export const SHEET_BELOW_PX = 600;

/**
 * How far a panel keeps from the box it opens beside, which leaves its beak's tip a few pixels
 * off it, and from the viewport's edges.
 */
export const GAP = 10;
export const MARGIN = 12;

/**
 * How far the beak keeps from a panel's corners, so it meets a straight edge: the 16-pixel
 * corner and half the beak's 15.
 */
const BEAK_CLEARANCE = 24;

/**
 * The beak a panel points with, drawn as Calendar on macOS draws its own: a short, rounded
 * point whose sides curve into the panel's edge, outlined by the same hairline as the panel.
 * Drawn pointing up from the edge, which runs along y = 6.5, and turned for the other sides.
 * The outline runs along the middle of the panel's half-pixel edge line, so the two join. The
 * glass under it (`.glass` in the stylesheet) is cut to the same curve closed along that
 * line's inner side, so no line shows across the beak's base.
 */
export const BEAK_EDGE = 'M0 6.75C3.15 6.75 3.75 0.25 7.5 0.25C11.25 0.25 11.85 6.75 15 6.75';

/**
 * Below a toolbar button: how far a panel's top keeps from the button, and how far in from the
 * panel's near edge its arrow points up at the button.
 */
export const BELOW_GAP = 10;
const EAR_INSET = 32;

/**
 * How a panel leaves, the reverse of how it opens, as measured from a screen recording of
 * Calendar on macOS: it shrinks toward its arrow to about a sixth of its size, slow at both
 * ends, and fades out a little ahead of it, over 180 ms. The opening half is in the stylesheet.
 */
const LEAVE_MS = 180;
const LEAVE_SCALE = 0.15;
const LEAVE_SHRINK = 'cubic-bezier(0.37, 0, 0.63, 1)';

/** The height a panel is placed for before it has been drawn and can be measured. */
const UNMEASURED_HEIGHT = 420;

//-----------------------------------------------------------------------------
// PLACING
//-----------------------------------------------------------------------------

/** Which side of a panel its arrow is on, and how far along that side it points. */
export interface Arrow {
  side: 'left' | 'right' | 'top' | 'bottom';
  at: number;
}

/** Where a panel goes, in viewport pixels, and where its arrow points from. */
export interface Placement {
  left: number;
  top: number;
  /** Undefined where the panel stands on its own, with nothing to point at. */
  arrow?: Arrow;
}

/** The viewport's size. */
export interface Viewport {
  width: number;
  height: number;
}

/** The part of the viewport in sight, from its top to its bottom, in viewport pixels. */
export interface Room {
  top: number;
  bottom: number;
}

/**
 * The part of the viewport a person can see: all of it, less what the browser's visual viewport
 * leaves out, which on a phone or a tablet is the on-screen keyboard. Most mobile browsers shrink
 * only the visual viewport for the keyboard, so the viewport a panel is placed in runs on behind
 * the keys. Kept within the viewport, which an offset the browser has not reset can overshoot,
 * and a part of a pixel either way is none, so a zoomed page measures as the whole viewport.
 *
 * @param viewportHeight - The viewport's height
 * @param visual - The browser's visual viewport, where it has one
 * @returns The part in sight
 */
export function roomOf(
  viewportHeight: number,
  visual?: { offsetTop: number; height: number } | null,
): Room {
  if (!visual) return { top: 0, bottom: viewportHeight };
  const top = visual.offsetTop < 1 ? 0 : Math.min(visual.offsetTop, viewportHeight);
  const end = visual.offsetTop + visual.height;
  const bottom = viewportHeight - end < 1 ? viewportHeight : Math.max(top, end);
  return { top, bottom };
}

/**
 * Where a panel goes once its height, or the part of the screen in sight, has changed since it
 * was placed (`opened`): where it opened, moved only as far as it must to stay in sight. It
 * grows down from where it opened, or up from its button where it opened above one, its arrow
 * at the bottom. Where that would take it out of sight it moves back in by as much, and back
 * toward where it opened as it shrinks again, so where it is depends on its height alone. An
 * arrow beside it keeps pointing at the press, off the panel's corners.
 *
 * @param opened - Where it was placed when it opened
 * @param openedHeight - Its height then
 * @param height - Its height now
 * @param room - The part of the viewport in sight now
 * @param target - Where an arrow beside it points: the middle of the press, top to bottom
 * @returns Where it goes now
 */
export function keepInView(
  opened: Placement,
  openedHeight: number,
  height: number,
  room: Room,
  target?: number,
): Placement {
  const arrow = opened.arrow;
  const from = arrow?.side === 'bottom' ? opened.top + openedHeight - height : opened.top;
  const top = Math.max(room.top + MARGIN, Math.min(from, room.bottom - MARGIN - height));
  if (!arrow || arrow.side === 'top' || arrow.side === 'bottom' || target === undefined) {
    return { left: opened.left, top, arrow };
  }
  const at = Math.min(Math.max(BEAK_CLEARANCE, target - top), height - BEAK_CLEARANCE);
  return { left: opened.left, top, arrow: { side: arrow.side, at } };
}

/**
 * Whether two placements put a panel and its arrow in the same place.
 *
 * @param a - One placement
 * @param b - The other
 * @returns True where they agree
 */
function samePlace(a: Placement | undefined, b: Placement | undefined): boolean {
  return (
    a?.left === b?.left &&
    a?.top === b?.top &&
    a?.arrow?.side === b?.arrow?.side &&
    a?.arrow?.at === b?.arrow?.at
  );
}

/**
 * The part of the window in sight now (`roomOf`). The browser's visual viewport is read only
 * while a field in the panel is being typed into, the only time an on-screen keyboard can be up
 * over it: some browsers go on reporting the keyboard's room for a while after it has gone,
 * which would hold the panel up over nothing.
 *
 * @param typing - Whether a field in the panel has the focus
 * @returns The part in sight
 */
function visibleRoom(typing: boolean): Room {
  return roomOf(window.innerHeight, typing ? window.visualViewport : undefined);
}

/**
 * The fields that are typed into, and raise an on-screen keyboard to type with. A list, a switch,
 * a date or a time opens a picker of its own instead, which does not count.
 */
const TYPED_FIELDS =
  'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="date"]):not([type="time"]):not([type="datetime-local"])';

/**
 * The middle of a press from top to bottom, which an arrow beside a panel points at
 * (`placeBeside`): of the box it came with, or of its point.
 *
 * @param anchor - The press
 * @returns Its middle, in viewport pixels
 */
function middleOf(anchor: Model.PopoverAnchor): number {
  return anchor.rect ? (anchor.rect.top + anchor.rect.bottom) / 2 : anchor.y;
}

/**
 * Where the arrow points, as a CSS position on the panel: the point the panel grows out of as it
 * opens.
 *
 * @param arrow - The arrow's side and its offset along it
 * @returns A `transform-origin` value
 */
export function arrowPoint(arrow: Arrow): string {
  return arrow.side === 'left' || arrow.side === 'right'
    ? `${arrow.side} ${arrow.at}px`
    : `${arrow.at}px ${arrow.side}`;
}

/**
 * Beside a box: to its right where the panel fits, else to its left, centered on it and kept on
 * screen, the arrow at its middle. Where neither side has room it is centered on the screen,
 * without an arrow.
 *
 * @param rect - The box, in viewport coordinates
 * @param panelHeight - The panel's height
 * @param viewport - The viewport's size
 * @param panelWidth - The panel's width
 * @returns Where the panel goes
 */
export function placeBeside(
  rect: Model.PopoverBox,
  panelHeight: number,
  viewport: Viewport,
  panelWidth: number,
): Placement {
  const { width, height } = viewport;
  const centerY = (rect.top + rect.bottom) / 2;
  let side: 'left' | 'right' | undefined = 'left';
  let left = rect.right + GAP;
  if (left + panelWidth > width - MARGIN) {
    side = 'right';
    left = rect.left - GAP - panelWidth;
  }
  if (left < MARGIN) {
    side = undefined;
    left = Math.max(MARGIN, (width - panelWidth) / 2);
  }
  const top = Math.min(Math.max(MARGIN, centerY - panelHeight / 2), height - panelHeight - MARGIN);
  const at = Math.min(Math.max(BEAK_CLEARANCE, centerY - top), panelHeight - BEAK_CLEARANCE);
  return { left, top, arrow: side ? { side, at } : undefined };
}

/**
 * Where a panel hanging below a toolbar button goes across the screen, and where along its edge
 * the arrow points up at the button's middle: a little in from the panel's near edge, so the
 * panel hangs over the card rather than beside its corner. It hangs right of the button, as from
 * the add button at the start of the row, or left of it, as from a button at the row's end.
 * Kept on screen, and the arrow off the panel's rounded corners.
 *
 * @param rect - The button, in viewport coordinates
 * @param panelWidth - The panel's width
 * @param viewportWidth - The viewport's width
 * @param hang - Which way the panel hangs from the button
 * @returns The panel's left edge, and the arrow's offset from it
 */
export function hangBelow(
  rect: Model.PopoverBox,
  panelWidth: number,
  viewportWidth: number,
  hang: 'right' | 'left' = 'right',
): { left: number; at: number } {
  const centerX = (rect.left + rect.right) / 2;
  const near = hang === 'right' ? centerX - EAR_INSET : centerX + EAR_INSET - panelWidth;
  const left = Math.min(
    Math.max(MARGIN, near),
    Math.max(MARGIN, viewportWidth - panelWidth - MARGIN),
  );
  const at = Math.min(Math.max(BEAK_CLEARANCE, centerX - left), panelWidth - BEAK_CLEARANCE);
  return { left, at };
}

/**
 * Below a box, as macOS opens the popover of its toolbar's add button: the arrow on the top edge
 * points up at the button's middle (`hangBelow`). Above it instead where there is no room below
 * and more above.
 *
 * @param rect - The box, in viewport coordinates
 * @param panelHeight - The panel's height
 * @param viewport - The viewport's size
 * @param panelWidth - The panel's width
 * @returns Where the panel goes
 */
export function placeBelow(
  rect: Model.PopoverBox,
  panelHeight: number,
  viewport: Viewport,
  panelWidth: number,
): Placement {
  const { width, height } = viewport;
  const { left, at } = hangBelow(rect, panelWidth, width);
  const below = rect.bottom + BELOW_GAP;
  const above = rect.top - BELOW_GAP - panelHeight;
  if (below + panelHeight > height - MARGIN && above >= MARGIN) {
    return { left, top: above, arrow: { side: 'bottom', at } };
  }
  return {
    left,
    top: Math.max(MARGIN, Math.min(below, height - panelHeight - MARGIN)),
    arrow: { side: 'top', at },
  };
}

/**
 * Where a panel goes for the press that opened it. A press on an event comes with what can be
 * seen of the event, and the panel opens beside it, as macOS opens one beside an event: the edge
 * of its box, or the end of its text where it draws no box (`eventBox`). A press with no event
 * under it, on a day or an empty slot, comes with its point alone, and the panel opens right
 * there. A toolbar button asks for the panel below it instead. Without a press, the panel is
 * centered on the screen.
 *
 * @param anchor - Where the press was, if anywhere
 * @param panelHeight - The panel's height
 * @param viewport - The viewport's size
 * @param panelWidth - The panel's width
 * @returns Where the panel goes
 */
export function placeAt(
  anchor: Model.PopoverAnchor | undefined,
  panelHeight: number,
  viewport: Viewport,
  panelWidth: number,
): Placement {
  if (!anchor) {
    return {
      left: Math.max(MARGIN, (viewport.width - panelWidth) / 2),
      top: Math.max(MARGIN, (viewport.height - panelHeight) / 2),
    };
  }
  const rect = anchor.rect ?? {
    left: anchor.x,
    right: anchor.x,
    top: anchor.y,
    bottom: anchor.y,
  };
  return anchor.below
    ? placeBelow(rect, panelHeight, viewport, panelWidth)
    : placeBeside(rect, panelHeight, viewport, panelWidth);
}

//-----------------------------------------------------------------------------
// RENDERING
//-----------------------------------------------------------------------------

/**
 * The dialog's own position: for a sheet, none, which the stylesheet places at the foot of the
 * screen, or as high as an on-screen keyboard lifts it; hidden until it is placed beside its
 * anchor, so it is never seen where the browser first puts it.
 *
 * @param sheet - Whether it is a sheet
 * @param place - Where it was placed, once it has been
 * @param lift - How far a sheet stands above the foot of the screen, over the keyboard
 * @returns An inline style
 */
export function placedStyle(sheet: boolean, place: Placement | undefined, lift = 0): string {
  if (sheet) return lift > 0 ? `bottom:${lift}px;` : '';
  return place ? `left:${place.left}px;top:${place.top}px;` : 'visibility:hidden;';
}

/**
 * The grabber a sheet shows at its top.
 *
 * @param sheet - Whether the panel is a sheet
 * @returns The grabber, or nothing
 */
export function renderGrabber(sheet: boolean): TemplateResult | typeof nothing {
  return sheet ? html`<span class="grabber" aria-hidden="true"></span>` : nothing;
}

/**
 * The beak, hung off the dialog rather than the panel, whose scrolling would clip it.
 *
 * @param arrow - Where it points from, if anywhere
 * @returns The beak, or nothing
 */
export function renderBeak(arrow: Arrow | undefined): TemplateResult | typeof nothing {
  return arrow
    ? html`<span
        class="arrow ${arrow.side}"
        style="${arrow.side === 'left' || arrow.side === 'right' ? 'top' : 'left'}:${arrow.at}px"
        ><span class="beak"
          ><span class="glass"></span
          ><svg viewBox="0 0 15 7" aria-hidden="true">
            <path d=${BEAK_EDGE}></path></svg></span
      ></span>`
    : nothing;
}

/**
 * The shell's stylesheet: the system font, the dialog and its sheet, how a panel opens, the light
 * and dark palettes, the panel's glass and its hairline, the sheet's grabber, the beak, what only
 * a screen reader or a keyboard reaches, and the spinner.
 */
export const shellStyles = css`
  :host {
    font-family:
      -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* Placed by its inline left and top (or bottom) alone. A modal dialog's own insets pin it
     to every edge of the viewport, and in a right-to-left document the start one is the right
     edge, which outranks the left the panel is placed at: it opened against the right edge,
     away from its button. */
  dialog {
    inset: auto;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    max-width: none;
    max-height: none;
    position: fixed;
    color: var(--text);
  }
  dialog::backdrop {
    background: transparent;
  }
  dialog.sheet {
    inset: auto 0 0 0;
    width: 100%;
  }
  /* It opens as a popover in Calendar on macOS does, as measured from a screen recording of
     it: growing out of its arrow from a tenth of its size, fast and then settling, over
     230 ms, and fading in over 180 ms, with no overshoot. The beak grows with it about the
     same point, where it meets the panel's edge, which the panel's inline transform-origin
     names. A sheet rises from the bottom instead. Each starts once the popover is placed, so
     none of it plays unseen. The way out is played from script (_leave). Without motion
     where the system asks for less. */
  dialog.popover[open][data-placed] > .panel {
    animation:
      pop-grow 230ms cubic-bezier(0.33, 1, 0.68, 1),
      pop-fade 180ms cubic-bezier(0, 0, 0.58, 1);
  }
  dialog.popover[open][data-placed] > .arrow {
    animation:
      pop-grow 230ms cubic-bezier(0.33, 1, 0.68, 1),
      pop-fade 180ms cubic-bezier(0, 0, 0.58, 1);
  }
  dialog.sheet[open][data-placed] > .panel {
    animation: sheet-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes pop-grow {
    from {
      transform: scale(0.1);
    }
  }
  @keyframes pop-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog.popover[open][data-placed] > .panel,
    dialog.popover[open][data-placed] > .arrow,
    dialog.sheet[open][data-placed] > .panel {
      animation: none;
    }
  }
  dialog.sheet::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }
  .light {
    --pop-bg: rgba(246, 246, 246, 0.82);
    --pop-edge: rgba(0, 0, 0, 0.12);
    --pop-outline: rgba(0, 0, 0, 0.22);
    --cell: rgba(0, 0, 0, 0.045);
    --cell-hover: rgba(0, 0, 0, 0.07);
    --text: rgba(0, 0, 0, 0.86);
    --dim: rgba(0, 0, 0, 0.36);
    --button: rgba(0, 0, 0, 0.07);
    --accent: #007aff;
    --danger: #ff3b30;
    color-scheme: light;
  }
  .dark {
    --pop-bg: rgba(44, 44, 46, 0.78);
    --pop-edge: rgba(255, 255, 255, 0.14);
    --pop-outline: rgba(255, 255, 255, 0.2);
    --cell: rgba(255, 255, 255, 0.075);
    --cell-hover: rgba(255, 255, 255, 0.11);
    --text: rgba(255, 255, 255, 0.92);
    --dim: rgba(255, 255, 255, 0.42);
    --button: rgba(255, 255, 255, 0.13);
    --accent: #0a84ff;
    --danger: #ff453a;
    color-scheme: dark;
  }
  .panel {
    position: relative;
    box-sizing: border-box;
    width: 340px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    /* The space under the last row, named so a foot that stays in sight can reach across it
       (the event popover's .foot). */
    --panel-end: 12px;
    padding: 14px 14px var(--panel-end);
    display: flex;
    flex-direction: column;
    gap: 9px;
    background: var(--pop-bg);
    -webkit-backdrop-filter: blur(28px) saturate(170%);
    backdrop-filter: blur(28px) saturate(170%);
    /* One hairline, as on macOS, which the beak's outline continues. An inset shadow rather
       than a border: browsers draw a half-pixel shadow as one, and some round a half-pixel
       border up to a whole one, which would no longer match the beak's line. */
    border-radius: 16px;
    box-shadow:
      inset 0 0 0 0.5px var(--pop-outline),
      0 18px 50px rgba(0, 0, 0, 0.35);
    font-size: 15px;
    line-height: 1.35;
  }
  .sheet .panel {
    width: 100%;
    max-height: 85vh;
    border-radius: 18px 18px 0 0;
    --panel-end: calc(16px + env(safe-area-inset-bottom));
  }
  /* Over an on-screen keyboard, which covers the strip a phone keeps clear at its foot. */
  .sheet.lifted .panel {
    --panel-end: 16px;
  }
  .grabber {
    align-self: center;
    width: 36px;
    height: 5px;
    border-radius: 3px;
    background: var(--dim);
  }
  /* The beak hangs off the dialog, not the panel, whose scrolling would clip it. Its box is a
     point on the panel's outer edge, where it grows from and shrinks to; the beak is drawn
     from there pointing up and turned to its side. Its glass blurs what is behind it as the
     panel does, cut to the beak's shape, and the outline is drawn over it. */
  .arrow {
    position: absolute;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }
  .arrow.top {
    top: 0;
  }
  .arrow.bottom {
    top: 100%;
  }
  .arrow.left {
    left: 0;
  }
  .arrow.right {
    left: 100%;
  }
  .beak {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .arrow.right .beak {
    transform: rotate(90deg);
  }
  .arrow.bottom .beak {
    transform: rotate(180deg);
  }
  .arrow.left .beak {
    transform: rotate(-90deg);
  }
  .beak > * {
    position: absolute;
    left: -7.5px;
    top: -6.5px;
    width: 15px;
    height: 7px;
  }
  .glass {
    background: var(--pop-bg);
    -webkit-backdrop-filter: blur(28px) saturate(170%);
    backdrop-filter: blur(28px) saturate(170%);
    clip-path: path('M0 6.75C3.15 6.75 3.75 0.25 7.5 0.25C11.25 0.25 11.85 6.75 15 6.75L15 7L0 7Z');
  }
  .beak svg {
    overflow: visible;
  }
  .beak path {
    fill: none;
    stroke: var(--pop-outline);
    stroke-width: 0.5;
  }
  /* Hidden until the keyboard reaches it, then a button like the others. */
  .reveal:not(:focus-visible),
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  /* Work under way: the event popover's while it saves, the search panel's while its year loads.
     A ring, so turning reads as waiting; still where the system asks for less motion. */
  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--button);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
`;

/**
 * The cells a panel's content is drawn in: a rounded tile on the glass, a little darker or
 * lighter than it, the calendar's color as a bar beside a group of them, and the focus ring the
 * keyboard sees on any of them.
 */
export const cellStyles = css`
  .group {
    display: grid;
    grid-template-columns: 5px minmax(0, 1fr);
    gap: 0 10px;
  }
  .bar {
    border-radius: 3px;
    background: var(--event-color);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }
  .cell {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 10px 14px;
    border: 0;
    border-radius: 11px;
    background: var(--cell);
    color: var(--text);
    font: inherit;
    text-align: start;
    overflow-wrap: anywhere;
  }
  input.cell,
  textarea.cell,
  button.cell,
  .cell[tabindex] {
    cursor: text;
  }
  button.cell {
    cursor: pointer;
  }
  .cell:hover {
    background: var(--cell-hover);
  }
  .cell:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 0;
  }
  /* Where color-mix() is unknown (Safari before 16.2) the ring above is invalid once its var()
     is substituted, and an invalid outline is no outline at all, so the keyboard would lose its
     place. A thinner ring in the solid accent stands in, about as heavy as the softer one. */
  @supports not (color: color-mix(in srgb, red, blue)) {
    .cell:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    button:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--accent);
    }
  }
  input.cell,
  textarea.cell {
    outline-offset: -1px;
  }
`;

//-----------------------------------------------------------------------------
// SCROLLING
//-----------------------------------------------------------------------------

/**
 * Whether an element can still scroll some way: down or up for a vertical move, toward the end
 * or the start for a horizontal one, in either writing direction.
 *
 * @param element - The element
 * @param dx - How far the move scrolls across, positive toward the right
 * @param dy - How far it scrolls down, positive downward
 * @returns True where the element takes the move
 */
function canScroll(element: Element, dx: number, dy: number): boolean {
  const style = getComputedStyle(element);
  const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';
  if (dy !== 0 && scrolls(style.overflowY)) {
    const room = element.scrollHeight - element.clientHeight;
    if (room > 0 && (dy < 0 ? element.scrollTop > 0 : element.scrollTop < room - 1)) return true;
  }
  if (dx !== 0 && scrolls(style.overflowX)) {
    const room = element.scrollWidth - element.clientWidth;
    // Right to left, scrolling runs from 0 at the start to -room at the end.
    const [min, max] = style.direction === 'rtl' ? [-room, 0] : [0, room];
    if (room > 0 && (dx < 0 ? element.scrollLeft > min + 1 : element.scrollLeft < max - 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a move scrolls something inside a dialog: an element between where it happened and the
 * dialog that can still scroll its way. A move on the backdrop happens on the dialog itself, and
 * scrolls nothing inside it.
 *
 * @param path - The move's composed path
 * @param dialog - The dialog
 * @param dx - How far it scrolls across
 * @param dy - How far it scrolls down
 * @returns True where something inside takes it
 */
function scrollsInside(
  path: ReadonlyArray<EventTarget>,
  dialog: Element | null,
  dx: number,
  dy: number,
): boolean {
  for (const target of path) {
    if (target === dialog) return false;
    if (target instanceof Element && canScroll(target, dx, dy)) return true;
  }
  return false;
}

/** The keys that scroll a page, and which way: down, or up. Space goes up with Shift. */
const SCROLL_KEYS: Readonly<Record<string, 1 | -1>> = {
  ' ': 1,
  PageDown: 1,
  End: 1,
  ArrowDown: 1,
  PageUp: -1,
  Home: -1,
  ArrowUp: -1,
};

/** Text fields of one line, which take every key that moves in a page but those that page. */
const LINE_FIELDS = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

/** Fields that take Space and nothing that moves in a page: it presses or ticks them. */
const PRESSED_FIELDS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']);

/** Roles that take Space as a press, as a button does. */
const PRESSED_ROLES = /^(?:button|checkbox|switch|radio|tab|option|menuitem(?:checkbox|radio)?)$/;

/**
 * Whether the control a key was pressed on takes it for itself, rather than the page scrolling
 * under it. A one-line field takes everything but Page Up and Page Down, which Chromium and
 * WebKit scroll the page under, and Home and End only while they can move its caret: macOS moves
 * no caret with them, and the page scrolls instead, so with the caret already at that end of the
 * field, as typing leaves it, they are stopped everywhere. A button, a switch and the like take
 * Space; a link takes nothing, and Space scrolls the page from one. A date, a time, a number, a
 * choice or text of several lines takes them all.
 *
 * @param target - Where the key was pressed
 * @param key - The key
 * @returns True to leave the key to the control
 */
function controlTakes(target: EventTarget | undefined, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    if (LINE_FIELDS.has(type)) {
      if (key === 'PageDown' || key === 'PageUp') return false;
      if (key !== 'Home' && key !== 'End') return true;
      const end = key === 'Home' ? 0 : target.value.length;
      return !(target.selectionStart === end && target.selectionEnd === end);
    }
    if (PRESSED_FIELDS.has(type)) return key === ' ';
    return true;
  }
  if (key !== ' ') return false;
  return (
    target instanceof HTMLButtonElement ||
    target.localName === 'summary' ||
    PRESSED_ROLES.test(target.getAttribute('role') ?? '')
  );
}

//-----------------------------------------------------------------------------
// ELEMENT
//-----------------------------------------------------------------------------

/**
 * A panel opened through Home Assistant's dialog manager, which creates it, hands it `hass`,
 * calls `showDialog` before attaching it, and calls `closeDialog` for Back. This holds what
 * every panel does around its content: opening the modal once it is attached, placing it,
 * putting focus where it starts, playing its way out and closing, and telling Home Assistant
 * it has gone. Each panel says where it opens from, how wide it is, and what it drops once
 * closed.
 */
export abstract class PopoverShell extends LitElement {
  /** Home Assistant, handed over by its dialog manager. */
  @property({ attribute: false }) hass?: Types.Hass;

  /** Whether it is a sheet from the bottom of the screen, which a narrow screen gets. */
  @state() protected _sheet = false;
  /** Where it is placed beside its anchor; undefined until it is, and for a sheet. */
  @state() protected _place?: Placement;
  /** How far a sheet stands above the foot of the screen, over an on-screen keyboard. */
  @state() protected _lift = 0;
  /** The tallest the panel may be in the part of the screen in sight, once it is placed there. */
  @state() protected _maxHeight?: number;
  /** Whether the panel's content runs past its height, so it scrolls (`_keepInView`). */
  @state() protected _scrolls = false;
  /** Closing: Home Assistant has been told, and the panel is playing its way out. */
  @state() protected _closing = false;

  /** The animations it is leaving by, canceled once it has gone or is opened again. */
  protected _leaving?: Animation[];

  /** Opened, and waiting to be attached and drawn before the modal shows. */
  protected _wantOpen = false;
  /** Whether the page's scrolling is held while the panel is open (`_guardScroll`). */
  private _scrollGuarded = false;
  /** Where the finger moving now last was, to tell which way it moves (`_onTouchMove`). */
  private _touchAt?: { x: number; y: number };
  /** When the modal last showed, which keeps the press that opened it from closing it. */
  protected _openedAt = 0;
  /** Whether the press under way began on the backdrop. */
  protected _backdropDown = false;
  /** Who to tell once the panel has closed (`closed`), taken when it opens. */
  protected _onClosed?: () => undefined;

  /**
   * Where the panel was placed when it opened, its height then, what an arrow beside it points
   * at, and the screen's width it was placed for, which `_keepInView` holds it to.
   */
  private _opened?: { place: Placement; height: number; target?: number; width: number };
  /** Watches the panel's size while it is open (`_watchRoom`). */
  private _sizeWatch?: ResizeObserver;
  /** The visual viewport listened to while the panel is open, if the browser has one. */
  private _watchedViewport?: VisualViewport | null;
  /** Whether the part of the screen in sight is being watched (`_watchRoom`). */
  private _watchingRoom = false;
  /** The look at the part of the screen in sight once the focus has settled (`_onFocusMove`). */
  private _focusSettling?: ReturnType<typeof setTimeout>;

  /** What the panel is called in the log. */
  protected abstract readonly _logName: string;

  /** The panel's width beside a press. */
  protected abstract readonly _panelWidth: number;

  /** Where the press was that opened the panel, if anywhere. */
  protected abstract get _anchor(): Model.PopoverAnchor | undefined;

  /** Drops what the panel showed, once it has closed. */
  protected abstract _clear(): void;

  //---------------------------------------------------------------------------
  // LIFECYCLE
  //---------------------------------------------------------------------------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const dialog = this._dialog;
    if (this._wantOpen && dialog?.open) {
      // Handed something else while still open, as Home Assistant does while a save is under
      // way: opened afresh for it, as far as an open modal can be. Placed for its press, which
      // nothing would do otherwise, with focus where it starts, and the press that handed it
      // over counted from now.
      this._wantOpen = false;
      this._openedAt = Date.now();
      this._backdropDown = false;
      this._position();
      void this.updateComplete.then(() => this._focusStart());
      return;
    }
    if (this._wantOpen && dialog && this.isConnected && !dialog.open) {
      this._wantOpen = false;
      this._openedAt = Date.now();
      try {
        dialog.showModal();
      } catch (error) {
        Logger.warn(`${this._logName}: could not open`, error);
      }
      this._guardScroll(dialog.open);
      this._position();
      // The modal opens hidden until it is placed, and a hidden control cannot take focus, so
      // the focusing steps of `showModal` land on nothing. Focus once it is drawn in place.
      void this.updateComplete.then(() => this._focusStart());
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._guardScroll(false);
    this._watchRoom(false);
  }

  /** Puts focus where the panel starts: whatever it marks `autofocus`. */
  protected _focusStart(): void {
    const dialog = this._dialog;
    if (!dialog?.open) return;
    dialog.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true });
  }

  /**
   * Keeps the page behind from scrolling while the panel is open, as Home Assistant's own dialogs
   * do. A modal leaves the page inert to the pointer but not to the wheel, a finger or the keys
   * that page: one over the backdrop, or over a part of the panel with nothing to scroll,
   * scrolled the dashboard under a panel that stayed where it was, its beak pointing at nothing.
   * Such a move is stopped; one that something inside the panel can take, its results or a
   * sheet, is left to it, as is a key the control it was pressed on takes (`controlTakes`). A
   * pinch, or Ctrl with the wheel, still zooms.
   *
   * Listened for on the window, not the dialog: Chromium scrolls the page under the backdrop
   * without asking a listener on the dialog, whose box the backdrop is no part of. Not passive,
   * which stopping needs, and only while the panel is open, so the page scrolls freely otherwise.
   *
   * @param on - Whether the panel is open
   */
  private _guardScroll(on: boolean): void {
    if (on === this._scrollGuarded) return;
    this._scrollGuarded = on;
    if (on) {
      window.addEventListener('wheel', this._onWheel, { capture: true, passive: false });
      window.addEventListener('touchstart', this._onTouchStart, { capture: true, passive: true });
      window.addEventListener('touchmove', this._onTouchMove, { capture: true, passive: false });
      window.addEventListener('keydown', this._onPagingKey, { capture: true });
    } else {
      window.removeEventListener('wheel', this._onWheel, { capture: true });
      window.removeEventListener('touchstart', this._onTouchStart, { capture: true });
      window.removeEventListener('touchmove', this._onTouchMove, { capture: true });
      window.removeEventListener('keydown', this._onPagingKey, { capture: true });
      this._touchAt = undefined;
    }
  }

  /**
   * Whether a move should be left to the browser: it scrolls something inside the open panel.
   *
   * @param ev - The wheel or the finger's move
   * @param dx - How far it scrolls across
   * @param dy - How far it scrolls down
   * @returns True to let it scroll
   */
  private _scrollsPanel(ev: Event, dx: number, dy: number): boolean {
    const dialog = this._dialog;
    const path = ev.composedPath();
    return !!dialog && path.includes(dialog) && scrollsInside(path, dialog, dx, dy);
  }

  private readonly _onWheel = (ev: WheelEvent): void => {
    if (ev.ctrlKey || this._scrollsPanel(ev, ev.deltaX, ev.deltaY)) return;
    ev.preventDefault();
  };

  private readonly _onTouchStart = (ev: TouchEvent): void => {
    const touch = ev.touches[0];
    this._touchAt =
      ev.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  };

  private readonly _onTouchMove = (ev: TouchEvent): void => {
    const touch = ev.touches[0];
    const from = this._touchAt;
    if (ev.touches.length !== 1 || !touch || !from) return;
    this._touchAt = { x: touch.clientX, y: touch.clientY };
    const dx = from.x - touch.clientX;
    const dy = from.y - touch.clientY;
    if (ev.cancelable && !this._scrollsPanel(ev, dx, dy)) ev.preventDefault();
  };

  private readonly _onPagingKey = (ev: KeyboardEvent): void => {
    if (ev.defaultPrevented || ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const way = SCROLL_KEYS[ev.key];
    if (!way) return;
    const dy = ev.key === ' ' && ev.shiftKey ? -way : way;
    if (controlTakes(ev.composedPath()[0], ev.key) || this._scrollsPanel(ev, 0, dy)) return;
    ev.preventDefault();
  };

  protected get _dialog(): HTMLDialogElement | null {
    return this.renderRoot?.querySelector('dialog') ?? null;
  }

  protected get _panel(): HTMLElement | null {
    return this.renderRoot?.querySelector('.panel') ?? null;
  }

  //---------------------------------------------------------------------------
  // PLACING
  //---------------------------------------------------------------------------

  /**
   * Places the panel for the press that opened it (`placeAt`), in the part of the screen in
   * sight (`roomOf`), or on a narrow screen makes it a sheet from the bottom instead. From then
   * on, while it is open, keeps it in sight (`_keepInView`).
   */
  protected _position(): void {
    const width = window.innerWidth;
    const room = visibleRoom(this._typing);
    this._sheet = width < SHEET_BELOW_PX;
    this._watchRoom(true);
    if (this._sheet) {
      this._place = undefined;
      this._opened = undefined;
      this._keepInView();
      return;
    }
    const maxHeight = room.bottom - room.top - 2 * MARGIN;
    const panelHeight = Math.min(this._panel?.offsetHeight ?? UNMEASURED_HEIGHT, maxHeight);
    const anchor = this._anchor;
    const placed = placeAt(anchor, panelHeight, { width, height: room.bottom }, this._panelWidth);
    const target = anchor && !anchor.below ? middleOf(anchor) : undefined;
    this._opened = { place: placed, height: panelHeight, target, width };
    this._lift = 0;
    this._maxHeight = maxHeight;
    this._place = keepInView(placed, panelHeight, panelHeight, room, target);
    this._measureScroll();
  }

  /**
   * Keeps the panel in sight while it is open: as it grows or shrinks, as when Cancel and Add
   * appear under a new event, and as an on-screen keyboard comes and goes (`keepInView`). A sheet
   * stands on the keyboard instead, no taller than the part of the screen it leaves. A change of
   * the screen's width, as turning a phone, places the panel afresh (`_placeAfresh`). Where the
   * panel is still too tall for what is in sight it scrolls, and says so (`_scrolls`).
   */
  protected _keepInView(): void {
    if (!this.isConnected || !this._dialog?.open || this._closing) return;
    const width = window.innerWidth;
    const opened = this._opened;
    if (width < SHEET_BELOW_PX !== this._sheet || (opened && opened.width !== width)) {
      this._placeAfresh();
      return;
    }
    const height = window.innerHeight;
    const room = visibleRoom(this._typing);
    if (this._sheet) {
      const reduced = room.top > 0 || room.bottom < height;
      this._lift = height - room.bottom;
      this._maxHeight = reduced
        ? Math.min(height * 0.85, room.bottom - room.top - MARGIN)
        : undefined;
      this._measureScroll();
      return;
    }
    const panel = this._panel;
    if (!opened || !panel) return;
    const maxHeight = room.bottom - room.top - 2 * MARGIN;
    this._maxHeight = maxHeight;
    const place = keepInView(
      opened.place,
      opened.height,
      Math.min(panel.offsetHeight, maxHeight),
      room,
      opened.target,
    );
    if (!samePlace(place, this._place)) this._place = place;
    this._measureScroll();
  }

  /** Notes whether the panel's content runs past its height now. */
  private _measureScroll(): void {
    const panel = this._panel;
    this._scrolls = !!panel && panel.scrollHeight > panel.clientHeight + 1;
  }

  /**
   * Places the panel afresh for a screen whose width has changed, as when a phone turns: a sheet
   * or beside its press, as the new width asks, measured once it has been drawn that way rather
   * than at the size it had the other way.
   */
  private _placeAfresh(): void {
    this._sheet = window.innerWidth < SHEET_BELOW_PX;
    this._opened = undefined;
    this._lift = 0;
    this._maxHeight = undefined;
    void this.updateComplete.then(() => {
      if (this.isConnected && this._dialog?.open && !this._closing) this._position();
    });
  }

  /** Whether a field in the panel has the focus, so an on-screen keyboard may be up over it. */
  private get _typing(): boolean {
    const active = (this.renderRoot as ShadowRoot | undefined)?.activeElement;
    return !!active?.matches?.(TYPED_FIELDS);
  }

  /**
   * Watches, while the panel is open, what can take it out of sight: its own size, which changes
   * as Cancel and Add appear, the date opens or a map loads, and the part of the screen in sight,
   * which an on-screen keyboard takes from while a field in the panel has the focus. Only the
   * placing here starts it; a panel that places itself keeps to its own.
   *
   * @param on - Whether the panel is open
   */
  private _watchRoom(on: boolean): void {
    if (!on) {
      this._sizeWatch?.disconnect();
      if (!this._watchingRoom) return;
      this._watchingRoom = false;
      this._watchedViewport?.removeEventListener('resize', this._onRoomChange);
      this._watchedViewport?.removeEventListener('scroll', this._onRoomChange);
      this._watchedViewport = undefined;
      window.removeEventListener('resize', this._onRoomChange);
      this.renderRoot?.removeEventListener('focusin', this._onFocusMove);
      this.renderRoot?.removeEventListener('focusout', this._onFocusMove);
      clearTimeout(this._focusSettling);
      return;
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._sizeWatch ??= new ResizeObserver(this._onRoomChange);
      this._sizeWatch.disconnect();
      const panel = this._panel;
      if (panel) this._sizeWatch.observe(panel);
    }
    if (this._watchingRoom) return;
    this._watchingRoom = true;
    this._watchedViewport = window.visualViewport;
    this._watchedViewport?.addEventListener('resize', this._onRoomChange);
    this._watchedViewport?.addEventListener('scroll', this._onRoomChange);
    window.addEventListener('resize', this._onRoomChange);
    this.renderRoot?.addEventListener('focusin', this._onFocusMove);
    this.renderRoot?.addEventListener('focusout', this._onFocusMove);
  }

  private readonly _onRoomChange = (): void => this._keepInView();

  /**
   * A field taking or losing the focus changes whether the visual viewport is read
   * (`visibleRoom`). Read once the focus has settled, so moving from one field to the next
   * does not count as leaving both.
   */
  private readonly _onFocusMove = (): void => {
    clearTimeout(this._focusSettling);
    this._focusSettling = setTimeout(this._onRoomChange, 0);
  };

  /** The panel's height cap, where the part of the screen in sight sets one, as inline style. */
  protected get _roomStyle(): string {
    return this._maxHeight === undefined ? '' : `max-height:${this._maxHeight}px;`;
  }

  //---------------------------------------------------------------------------
  // CLOSING
  //---------------------------------------------------------------------------

  /**
   * Tells Home Assistant's dialog manager the panel is gone, and closes the modal once it has
   * played its way out (`_leave`), or at once where there is nothing to play.
   *
   * @returns Always true
   */
  protected _finish(): boolean {
    this._wantOpen = false;
    const animations = this._leave();
    if (animations.length) {
      this._closing = true;
      this._leaving = animations;
      // A tab in the background may hold animations back, so the panel goes regardless soon.
      void Promise.race([
        Promise.all(animations.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, LEAVE_MS + 200)),
      ])
        .catch(() => undefined)
        .then(() => {
          if (this._leaving === animations) this._closeNow();
        });
    } else {
      this._closeNow();
    }
    this._fireClosed();
    return true;
  }

  /** Closes the modal, drops what it showed, and stops any way out it was playing. */
  protected _closeNow(): void {
    const dialog = this._dialog;
    if (dialog?.open) dialog.close();
    this._guardScroll(false);
    this._watchRoom(false);
    this._opened = undefined;
    this._lift = 0;
    this._maxHeight = undefined;
    this._scrolls = false;
    // Canceled after the close, so the panel never flashes back at full size.
    this._leaving?.forEach((animation) => animation.cancel());
    this._leaving = undefined;
    this._closing = false;
    this._clear();
  }

  /**
   * Plays the panel's way out: shrinking toward its arrow and fading, or a sheet sinking away.
   * Nothing where the system asks for less motion, or where the browser cannot animate.
   *
   * @returns The animations, or none
   */
  protected _leave(): Animation[] {
    const dialog = this._dialog;
    const panel = dialog?.querySelector<HTMLElement>('.panel');
    if (!dialog?.open || !panel || typeof panel.animate !== 'function') return [];
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];

    const timing = (easing: string): KeyframeAnimationOptions => ({
      duration: LEAVE_MS,
      easing,
      fill: 'forwards',
    });
    if (this._sheet) {
      return [
        panel.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(24px)', opacity: 0 },
          ],
          timing('ease-in'),
        ),
      ];
    }
    // The panel and its beak shrink about the same point, where the beak meets the panel's
    // edge, which the panel's transform-origin names and the beak's box sits on.
    const animations = [
      panel.animate(
        [{ transform: 'scale(1)' }, { transform: `scale(${LEAVE_SCALE})` }],
        timing(LEAVE_SHRINK),
      ),
      panel.animate([{ opacity: 1 }, { opacity: 0 }], timing('ease')),
    ];
    const arrow = dialog.querySelector<HTMLElement>('.arrow');
    if (arrow) {
      animations.push(
        arrow.animate(
          [{ transform: 'scale(1)' }, { transform: `scale(${LEAVE_SCALE})` }],
          timing(LEAVE_SHRINK),
        ),
        arrow.animate([{ opacity: 1 }, { opacity: 0 }], timing('ease')),
      );
    }
    return animations;
  }

  /** Tells whoever opened the panel, and Home Assistant's dialog manager, that it has closed. */
  protected _fireClosed(): void {
    const closed = this._onClosed;
    this._onClosed = undefined;
    closed?.();
    this.dispatchEvent(
      new CustomEvent('dialog-closed', {
        bubbles: true,
        composed: true,
        detail: { dialog: this.localName },
      }),
    );
  }

  //---------------------------------------------------------------------------
  // INPUT
  //---------------------------------------------------------------------------

  /**
   * Whether a click is a press that started and ended on the backdrop, which closes a panel. Both
   * ends count, so the click a press on the card derives from the gesture that opened it cannot
   * close it, and neither can a click in the first moments after it opened.
   *
   * @param ev - A click on the dialog
   * @returns True to close
   */
  protected _isBackdropPress(ev: MouseEvent): boolean {
    if (ev.target !== this._dialog || !this._backdropDown) return false;
    this._backdropDown = false;
    return Date.now() - this._openedAt >= 300;
  }

  /**
   * Keeps the keys typed in the panel in it. Home Assistant answers a bare letter typed anywhere
   * outside a text field with a shortcut of its own, opening Assist or its search over the
   * panel, and a letter typed with the focus on a heading or a button would do that. A key with
   * Ctrl, Alt or the command key, and every key that is not a character, still goes on.
   */
  protected readonly _keepKeys = (ev: KeyboardEvent): void => {
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) ev.stopPropagation();
  };
}
