/**
 * The rows that stay at the top of a scrolling events area while what is under them scrolls: a
 * grid's day headers and its all-day band, a column view's day headers, and a wide month's
 * weekday names. The card measures them and marks them pinned (`_syncHeadPin`), and the
 * stylesheet makes them sticky.
 */

/** Most of the scrolling events area what stays at its top may take. */
export const HEAD_MAX_SHARE = 2 / 3;

/**
 * The height of what is pinned, which the card writes on the events area while anything is, and
 * which the stylesheet gives what scrolls under it as a scroll margin, so an event that takes focus
 * or that a search rings is scrolled into view below the pinned rows rather than under them.
 */
export const PINNED_HEAD_HEIGHT_PROPERTY = '--calendar-card-pinned-head-height';

/**
 * What stays at the top: the head and the band under it, the head alone with the band scrolling
 * under it, or nothing.
 */
export type HeadPin = 'all' | 'head' | 'none';

/**
 * Which of the rows above what scrolls stay at the top of the events area.
 *
 * Only while the area scrolls at all, and only while what stays leaves the rest room: at most
 * {@link HEAD_MAX_SHARE} of the area. The head and the band stay together while both fit in that
 * share; past it the head stays alone while it fits, and the band scrolls under it with the
 * hours. A layout with no band passes `0` for it. Past that nothing stays: a card under a
 * `card_height` can be shorter than its own head, and a pinned head would then cover the whole
 * area and leave nothing to scroll through. An area or a head not yet laid out, at zero, pins
 * nothing.
 *
 * An area that does not scroll is left unpinned although pinning would move nothing: Chrome
 * rasterizes a scroller holding a sticky box apart from the rest, which shifts the anti-aliasing
 * of rounded edges below it by a shade, so a card that never scrolls is drawn to the byte as it
 * was.
 *
 * @param headPx - The head's height: a grid's week numbers and day headers, a column view's day
 *   headers or a month's weekday names
 * @param bandPx - The height of the band under the head that may stay with it, or `0`
 * @param areaPx - The events area's visible height
 * @param contentPx - The height of what the area scrolls through
 * @returns What stays
 */
export function headPin(
  headPx: number,
  bandPx: number,
  areaPx: number,
  contentPx: number,
): HeadPin {
  if (headPx <= 0 || areaPx <= 0 || contentPx <= areaPx) return 'none';
  const room = areaPx * HEAD_MAX_SHARE;
  if (headPx + bandPx <= room) return 'all';
  return bandPx > 0 && headPx <= room ? 'head' : 'none';
}
