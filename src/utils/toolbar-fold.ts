/**
 * Whether the configuration's own toolbar buttons fold into one menu button.
 *
 * The action row holds, from its start, the folded calendar filter, add and the configuration's
 * own buttons; the view switcher in its middle; reset and refresh at its end. As a card narrows,
 * the row gives way in a fixed order: the switcher's words become pictograms first, then the
 * buttons fold into one menu button, and only a row that still does not fit wraps its end group
 * onto a line of its own.
 *
 * The fold is all or none, as the legend's chips fold: never some buttons in the row and the rest
 * in the menu. And it takes two or more, since one button folded into one menu button saves
 * nothing, so a single button that does not fit wraps like any other control.
 *
 * Every width it rests on is known exactly. Each command is `UI.TOOLBAR_COMMAND_WIDTH` wide and
 * two in a group stand `UI.TOOLBAR_COMMAND_GAP` apart, as do the row's groups, which the
 * stylesheet tests reconcile; the switcher's width and the row's own content width are measured.
 * So the decision is arithmetic on those, pure, and judged with the switcher as pictograms, which
 * is what keeps the words giving way first.
 */

import * as Constants from '../config/constants';

/** What the action row holds besides the buttons. */
export interface ActionRow {
  /** How many buttons the configuration adds. */
  buttons: number;
  /** The other icons in the row's start group: the folded filter and add. */
  start: number;
  /** The icons in its end group: reset and refresh. */
  end: number;
  /** The view switcher's width drawn as pictograms, or null without a switcher. */
  switcherPx: number | null;
}

/** The buttons folded, recorded with what the row held and from when they unfold. */
export interface ButtonsFold {
  /** What the fold depends on besides the width; a fold for another row does not hold. */
  signature: string;
  /** The card width from which the buttons are drawn in the row again. */
  unfoldAtPx: number;
}

/**
 * The width a group of icons takes in the action row.
 *
 * @param icons - How many icons the group holds
 * @returns Each icon's width and the gap between two, in CSS pixels
 */
export function groupWidth(icons: number): number {
  const { TOOLBAR_COMMAND_WIDTH: icon, TOOLBAR_COMMAND_GAP: gap } = Constants.UI;
  return icons <= 0 ? 0 : icons * icon + (icons - 1) * gap;
}

/**
 * The width the action row needs to hold every button on one line, the switcher as pictograms.
 * The start and end groups are drawn even when empty, so the gaps between the row's groups are
 * there whatever they hold.
 *
 * @param row - What the row holds
 * @returns The width, in CSS pixels
 */
export function rowWidthWithButtons(row: ActionRow): number {
  const gap = Constants.UI.TOOLBAR_COMMAND_GAP;
  const groups = groupWidth(row.start + row.buttons) + groupWidth(row.end);
  return row.switcherPx === null ? groups + gap : groups + 2 * gap + row.switcherPx;
}

/**
 * Judges the buttons' fold from one measurement of the row, drawn with its buttons in it.
 *
 * Where they do not all fit beside everything else, they fold until the card is wide enough for
 * them by `UI.LEGEND_UNFOLD_MARGIN`: the row's content grows with the card one for one, so that
 * width follows from the two measured. An unfold the measurement then contradicts, which drawing
 * the buttons can do by making the page tall enough for a scrollbar, folds again from wider than
 * the width it was tried at, so the two cannot alternate.
 *
 * @param row - What the row holds
 * @param rowPx - The action row's content width
 * @param cardPx - The card's width
 * @param unfoldedAtPx - The card width the buttons last unfolded at, until a measurement there
 *   confirms they fit; null otherwise
 * @returns Null while the buttons stay in the row; otherwise the width from which they unfold
 */
export function judgeButtonsFold(
  row: ActionRow,
  rowPx: number,
  cardPx: number,
  unfoldedAtPx: number | null,
): { unfoldAtPx: number } | null {
  if (row.buttons < 2) return null;
  const needed = rowWidthWithButtons(row);
  if (needed <= rowPx + 0.5) return null;
  const fitsFrom = Math.ceil(cardPx + needed - rowPx) + Constants.UI.LEGEND_UNFOLD_MARGIN;
  return { unfoldAtPx: Math.max(fitsFrom, (unfoldedAtPx ?? 0) + 1) };
}

/**
 * Whether the buttons are folded now: a fold recorded for this row, at a width short of the one
 * it unfolds from. Before the card has been judged at any width, a fold recorded holds.
 *
 * @param fold - The fold recorded, if any
 * @param signature - What the row holds now
 * @param widthPx - The card width the fold is judged at, or null before any
 * @returns True while the buttons are folded
 */
export function buttonsFolded(
  fold: ButtonsFold | null,
  signature: string,
  widthPx: number | null,
): boolean {
  if (!fold || fold.signature !== signature) return false;
  return widthPx === null || widthPx < fold.unfoldAtPx;
}
