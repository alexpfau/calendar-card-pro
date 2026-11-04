/**
 * Which of the action row's start controls the row draws, and which fold into its menu.
 *
 * The action row holds, from its start, the calendar filter's button, add and the configuration's
 * own buttons; the view switcher in its middle; reset, refresh and a search control at its end.
 * As a card narrows, the row gives way in a fixed order: the switcher's words become pictograms
 * first, then the start group's controls move into one menu button, from its end: the last of the
 * configuration's buttons first, then the earlier ones, then add. The group's first control never
 * moves, which is the filter wherever it is drawn, so the narrowest the group gets is that control
 * and the menu button. The end group never folds: a row too narrow even for that wraps it onto a
 * line of its own, as the row always has.
 *
 * Never exactly one control moves into the menu, since the menu button takes the room that
 * control did: two move when the menu first appears, and the last two come back together when it
 * goes. The start group may take all the room the switcher and the end group leave, not half of
 * it, so the switcher moves off center before a control is hidden, as the row's flex layout lets
 * it.
 *
 * Every width the plan rests on is the stylesheet's, and the stylesheet tests reconcile each: a
 * command is `UI.TOOLBAR_COMMAND_WIDTH` wide, two controls stand `UI.TOOLBAR_COMMAND_GAP` apart in
 * a group and between the row's three parts, the switcher's pictograms are
 * `UI.TOOLBAR_SWITCHER_SEGMENT_WIDTH` each on a track padded `UI.TOOLBAR_SWITCHER_TRACK_PADDING`,
 * and the row stands `UI.TOOLBAR_ROW_INSET` in from the card's edges. So the plan is arithmetic on
 * the card's width, and pure. Every plan it makes is one line tall, which is what lets the card
 * make it at render, inside its resize observer's callback, with no frame's delay and no
 * hysteresis: no plan changes the card's height, so none can feed back into the width it was
 * made for.
 */

import * as Constants from '../config/constants';

/** One control of the action row's start group. */
export type StartControl =
  | { readonly kind: 'filter' }
  | { readonly kind: 'add' }
  /** A button of the configuration's own, by its place in the list as resolved. */
  | { readonly kind: 'button'; readonly index: number };

/**
 * One control of the action row's end group. `search` is the slot for a search control at its
 * end, counted wherever the card draws one.
 */
export type EndControl = 'reset' | 'refresh' | 'search';

/** What the action row holds, as the plan reckons with it. */
export interface ActionRow {
  /** The start group's controls in the order drawn: the folded filter, add, then the buttons. */
  start: ReadonlyArray<StartControl>;
  /** The end group's controls in the order drawn. */
  end: ReadonlyArray<EndControl>;
  /** How many views the switcher draws, or none without a switcher. */
  views: number;
  /** How far the row's content stands in from the card's edges, both together. */
  insetPx: number;
}

/** The start group's controls the row draws, and those its menu holds, each in order. */
export interface StartPlan {
  visible: ReadonlyArray<StartControl>;
  overflow: ReadonlyArray<StartControl>;
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
 * The view switcher's width drawn as pictograms.
 *
 * @param views - How many views it draws
 * @returns Its width in CSS pixels, nothing for no view
 */
export function switcherWidth(views: number): number {
  const { TOOLBAR_SWITCHER_SEGMENT_WIDTH: segment, TOOLBAR_SWITCHER_TRACK_PADDING: padding } =
    Constants.UI;
  return views <= 0 ? 0 : views * segment + 2 * padding;
}

/**
 * The card width the action row needs to stand on one line, the switcher as pictograms and the
 * start group drawn as this many icons. The start and end groups are drawn even when empty, so
 * the gaps between the row's parts are there whatever they hold.
 *
 * @param row - What the row holds
 * @param startIcons - How many icons the start group draws, the menu button counted
 * @returns The width in CSS pixels
 */
export function cardWidthFor(row: ActionRow, startIcons: number): number {
  const gap = Constants.UI.TOOLBAR_COMMAND_GAP;
  const switcher = row.views > 0 ? switcherWidth(row.views) + gap : 0;
  return row.insetPx + groupWidth(startIcons) + gap + switcher + groupWidth(row.end.length);
}

/**
 * Plans the start group for a card this wide: the most controls that fit on the row's one line,
 * the rest in the menu, never exactly one of them.
 *
 * Where even the group's first control and the menu button do not fit, the plan is still those
 * two, and the row wraps its end group, as it does without a menu.
 *
 * @param row - What the row holds
 * @param cardPx - The card's width
 * @param atLeast - The fewest controls to fold, which the card asks for where the row it drew at
 *   this width still did not fit on one line; the width alone decides with none
 * @returns The controls drawn, and the controls in the menu
 */
export function planStartGroup(row: ActionRow, cardPx: number, atLeast = 0): StartPlan {
  const { start } = row;
  // The first control never folds, and a menu never holds one control alone.
  const foldable = start.length - 1;
  if (foldable < 2) return { visible: start, overflow: [] };

  const fits = (icons: number) => cardWidthFor(row, icons) <= cardPx;
  let hidden = 0;
  if (!fits(start.length)) {
    hidden = 2;
    // Each fold beyond the second frees one icon's room and its gap; the menu button stays.
    while (hidden < foldable && !fits(start.length - hidden + 1)) hidden += 1;
  }
  hidden = Math.max(hidden, atLeast);
  if (hidden === 1) hidden = 2;
  hidden = Math.min(hidden, foldable);

  return {
    visible: start.slice(0, start.length - hidden),
    overflow: start.slice(start.length - hidden),
  };
}
