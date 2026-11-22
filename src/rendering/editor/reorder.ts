/**
 * Reordering a list of keyed rows, by the keyboard grab and by the pointer drag (D10 A): what each
 * step means for the order, with no DOM. The calendar list moves calendars with it, a calendar
 * named by its first entry's key; the toolbar's own buttons are the other list it is written for.
 *
 * The grab is session state only: picking a row up, moving it and putting it back write nothing.
 * Only the drop writes, once, as one undo step, which the element does.
 */

/** A row held by the keyboard grab. */
export interface GrabState {
  /** The held row's key. */
  readonly key: number;
  /** Where it was picked up, counting from zero. */
  readonly from: number;
  /** Where it is now, counting from zero. */
  readonly at: number;
  /** How many rows the list has. */
  readonly total: number;
}

/**
 * Picks a row up where it stands.
 *
 * @param keys - The rows' keys, in list order
 * @param key - The row picked up
 * @returns The grab, at its own place
 */
export function grab(keys: ReadonlyArray<number>, key: number): GrabState {
  const from = keys.indexOf(key);
  return { key, from, at: from, total: keys.length };
}

/**
 * Moves the held row one place, never past either end of the list.
 *
 * @param state - The grab
 * @param by - Up (-1) or down (1)
 * @returns The grab moved, or the same grab at an end
 */
export function moveBy(state: GrabState, by: -1 | 1): GrabState {
  const at = Math.min(state.total - 1, Math.max(0, state.at + by));
  return at === state.at ? state : { ...state, at };
}

/**
 * The order the list shows while a row is held: every other row in its place, the held one at
 * its new place.
 *
 * @param keys - The rows' keys, in list order
 * @param state - The grab
 * @returns The keys in the preview order
 */
export function order(keys: ReadonlyArray<number>, state: GrabState): ReadonlyArray<number> {
  const rest = keys.filter((key) => key !== state.key);
  rest.splice(state.at, 0, state.key);
  return rest;
}

/**
 * Where a dragged row lands: before the first other row whose midpoint lies below it.
 *
 * @param rowMidpoints - The other rows' vertical midpoints, in list order, as they stood when
 *   the drag began
 * @param pointerY - The dragged row's own midpoint now, on the same scale
 * @returns Its place among the rows, counting from zero
 */
export function dropTarget(rowMidpoints: ReadonlyArray<number>, pointerY: number): number {
  let place = 0;
  while (place < rowMidpoints.length && pointerY > rowMidpoints[place]) place++;
  return place;
}

/**
 * How far one of the other rows steps aside while a row is dragged from one place to another:
 * a row the dragged one passed moves one slot toward where the dragged one came from.
 *
 * @param index - The row's place before the drag
 * @param from - The dragged row's place before the drag
 * @param at - The dragged row's place now
 * @returns -1 for a slot up, 1 for a slot down, 0 to stay
 */
export function shift(index: number, from: number, at: number): -1 | 0 | 1 {
  if (from < index && index <= at) return -1;
  if (at <= index && index < from) return 1;
  return 0;
}

/** How near an edge of what scrolls the pointer has to be for the drag to scroll it, in px. */
export const EDGE = 40;

/** The most the drag scrolls in one frame, in px. */
const MAX_STEP = 16;

/**
 * How far the drag scrolls in a frame: nothing until the pointer comes within `EDGE` of the
 * scroller's top or bottom, then faster the nearer it comes, and fastest past the edge.
 *
 * @param pointerY - The pointer's height on the page
 * @param top - The top of what scrolls the editor
 * @param bottom - Its bottom
 * @returns Pixels to scroll by: negative up, positive down
 */
export function edgeSpeed(pointerY: number, top: number, bottom: number): number {
  const past =
    pointerY < top + EDGE
      ? pointerY - top - EDGE
      : pointerY > bottom - EDGE
        ? pointerY - bottom + EDGE
        : 0;
  return Math.max(-MAX_STEP, Math.min(MAX_STEP, Math.round((past * MAX_STEP) / EDGE)));
}

/**
 * A place among the rows shown, as a place in the whole list: where a list narrowed by a filter
 * hides rows, a row dropped before a shown row lands before that row, and one dropped last lands
 * right after the last row shown.
 *
 * @param all - Every row, in list order
 * @param shown - The rows shown, in list order, the dragged one among them
 * @param moved - The dragged row
 * @param at - Its place among the rows shown, counting from zero
 * @returns Its place in the whole list
 */
export function placeIn<T>(
  all: ReadonlyArray<T>,
  shown: ReadonlyArray<T>,
  moved: T,
  at: number,
): number {
  const rest = all.filter((each) => each !== moved);
  const others = shown.filter((each) => each !== moved);
  if (others.length === 0) return all.indexOf(moved);
  return at < others.length
    ? rest.indexOf(others[at])
    : rest.indexOf(others[others.length - 1]) + 1;
}
