/**
 * The drag handle, the keyboard grab's status line and the pointer drag (D10 A), as a list draws
 * them. What each step means for the order is `reorder.ts`'s; what a drop writes is the element's.
 *
 * The pointer drag moves nothing in the DOM until it drops: the dragged row follows the pointer by
 * `transform`, and the rows it passes step aside by the same means, so the handle keeps its
 * pointer capture and a render in between disturbs nothing. Every row that moves carries
 * `data-reorder` with its id, and the rows of one list are siblings.
 */

import { mdiDragHorizontalVariant, mdiKeyboardOutline } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';
import { dropTarget, edgeSpeed, shift } from '../reorder';

/** A row's drag handle. */
export interface HandleModel {
  /** Its `data-focus` key. */
  readonly focus: string;
  /** The calendar Alt+Arrow moves from it. */
  readonly moves?: string;
  /** "Move Anna". */
  readonly name: string;
  /** "Drag to move Anna, or press Space". */
  readonly tooltip: string;
  /** Whether the keyboard grab holds its row. */
  readonly pressed: boolean;
  readonly onKeydown: (event: KeyboardEvent) => void;
  readonly onClick: () => void;
  readonly onPointerdown: (event: PointerEvent) => void;
  readonly onBlur: () => void;
}

/**
 * A drag handle: a button, pressed while the keyboard grab holds its row. Only the handle sets
 * `touch-action: none`, so the rest of the row still scrolls the dialog under a finger.
 *
 * @param handle - What it shows and does
 * @returns The button
 */
export function dragHandle(handle: HandleModel): TemplateResult {
  return html`<button
    type="button"
    class="drag-handle"
    data-focus=${handle.focus}
    data-move-calendar=${handle.moves ?? nothing}
    aria-label=${handle.name}
    title=${handle.tooltip}
    aria-pressed=${handle.pressed ? 'true' : 'false'}
    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    @keydown=${handle.onKeydown}
    @click=${handle.onClick}
    @pointerdown=${handle.onPointerdown}
    @blur=${handle.onBlur}
  >
    ${icon(mdiDragHorizontalVariant)}
  </button>`;
}

/**
 * The keyboard grab's line under the list: where the held row stands, then the keys, each
 * `{name}` in the template drawn as a key cap. Plain text, not a live region: the same words reach
 * a screen reader through the editor's one announcement queue.
 *
 * @param position - "Anna, position 2 of 5."
 * @param keys - "{up} {down} move it, {space} drops it, {esc} puts it back."
 * @param caps - What each key cap reads
 * @returns The line
 */
export function grabStatus(
  position: string,
  keys: string,
  caps: Readonly<Record<string, string>>,
): TemplateResult {
  return html`<p class="grab-status" data-grab-status>
    ${icon(mdiKeyboardOutline)}<span
      >${position}
      ${keys
        .split(/\{(\w+)\}/)
        .map((part, index) =>
          index % 2 === 1 ? html`<kbd>${caps[part] ?? part}</kbd>` : part,
        )}</span
    >
  </p>`;
}

/** How far a pointer travels before a press on the handle becomes a drag, in px. */
const SLOP = 4;

/** How a pointer drag ended, once it had moved a row. */
export interface DragOutcome {
  /** The `data-reorder` ids of the rows shown, in list order before the drag. */
  readonly ids: ReadonlyArray<string>;
  /** The dragged row's place among them before the drag. */
  readonly from: number;
  /** Its place among them where it was let go. */
  readonly at: number;
  /** False where the drag was canceled, a lost capture or Escape: the row goes back. */
  readonly dropped: boolean;
}

/**
 * Follows a pointer pressed on a drag handle: past `SLOP` px the row lifts and follows it, the
 * rows it passes step aside, and the scroller scrolls while the pointer is within `EDGE` px of
 * its top or bottom. `pointerup` drops; `pointercancel`, a lost capture or `cancel()` puts the
 * row back. Every transform is cleared before `finish` runs.
 *
 * @param down - The `pointerdown` on the handle
 * @param scroller - What scrolls the editor (`scroll.ts` › `scrollContainer`)
 * @param finish - Runs once as the press ends: with the outcome where the row moved, else with
 *   nothing
 * @returns The drag, to cancel; undefined where the press starts none
 */
export function pointerDrag(
  down: PointerEvent,
  scroller: Element | undefined,
  finish: (outcome?: DragOutcome) => void,
): { readonly cancel: () => void } | undefined {
  const handle = down.currentTarget as HTMLElement;
  const row = handle.closest<HTMLElement>('[data-reorder]');
  const list = row?.parentElement;
  if (!row || !list || !down.isPrimary || (down.pointerType === 'mouse' && down.button !== 0)) {
    return undefined;
  }
  try {
    handle.setPointerCapture(down.pointerId);
  } catch {
    // A pointer the browser no longer tracks: the drag follows it anyway while it can.
  }
  const page = scroller === undefined || scroller === document.scrollingElement;
  const scrolled = (): number => scroller?.scrollTop ?? 0;
  let rows: HTMLElement[] = [];
  let mids: number[] = [];
  let from = -1;
  let at = -1;
  let center = 0;
  let slot = 0;
  let low = 0;
  let high = 0;
  let start = 0;
  let pointerY = down.clientY;
  let frame = 0;
  let live = false;
  let done = false;

  const place = (): void => {
    const by = Math.min(high, Math.max(low, pointerY + scrolled() - start - down.clientY));
    at = dropTarget(mids, center + by);
    rows.forEach((each, index) => {
      each.style.transform = `translateY(${index === from ? by : shift(index, from, at) * slot}px)`;
    });
  };
  const tick = (): void => {
    // A handle a render or a closed dialog took away cannot end the drag itself.
    if (!handle.isConnected) return end(false);
    const bounds = page ? { top: 0, bottom: innerHeight } : scroller!.getBoundingClientRect();
    const speed = edgeSpeed(pointerY, bounds.top, bounds.bottom);
    if (speed !== 0 && scroller !== undefined) {
      scroller.scrollTop += speed;
      place();
    }
    frame = requestAnimationFrame(tick);
  };
  const lift = (): void => {
    live = true;
    rows = [...list.children].filter(
      (each): each is HTMLElement =>
        each instanceof HTMLElement && each.dataset.reorder !== undefined,
    );
    const rects = rows.map((each) => each.getBoundingClientRect());
    from = rows.indexOf(row);
    const own = rects[from];
    center = own.top + own.height / 2;
    mids = rects.filter((_, index) => index !== from).map((rect) => rect.top + rect.height / 2);
    slot = own.height + (rects.length > 1 ? rects[1].top - rects[0].bottom : 0);
    // Its middle stays within the list, so it can pass the first row's middle and the last's.
    low = rects[0].top - center;
    high = rects[rects.length - 1].bottom - center;
    start = scrolled();
    list.classList.add('dragging');
    row.classList.add('lifted');
    frame = requestAnimationFrame(tick);
  };
  const end = (dropped: boolean): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancel);
    handle.removeEventListener('lostpointercapture', cancel);
    for (const each of rows) each.style.transform = '';
    list.classList.remove('dragging');
    row.classList.remove('lifted');
    finish(
      live ? { ids: rows.map((each) => each.dataset.reorder!), from, at, dropped } : undefined,
    );
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== down.pointerId) return;
    pointerY = event.clientY;
    if (!live) {
      if (Math.abs(pointerY - down.clientY) < SLOP) return;
      lift();
    }
    event.preventDefault();
    place();
  };
  const up = (event: PointerEvent): void => {
    if (event.pointerId === down.pointerId) end(true);
  };
  const cancel = (event: PointerEvent): void => {
    if (event.pointerId === down.pointerId) end(false);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancel);
  handle.addEventListener('lostpointercapture', cancel);
  return { cancel: () => end(false) };
}
