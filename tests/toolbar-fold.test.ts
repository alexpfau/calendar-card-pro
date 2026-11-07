/**
 * Which of the action row's start controls the row draws and which fold into its menu: the
 * planner (`utils/toolbar-fold.ts`), pure, at every threshold.
 *
 * Every width here is a card width, as the card hands it over, and every threshold is checked
 * just below it, at it and just above it, since an arithmetic slip of a pixel moves a whole
 * control. How the card plans at render and corrects a row that still wraps is pinned in
 * `toolbar-buttons.test.ts`; the widths the arithmetic rests on are reconciled with the
 * stylesheet in `stylesheet.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import * as Constants from '../src/config/constants';
import {
  type ActionRow,
  type EndControl,
  type StartControl,
  cardWidthFor,
  groupWidth,
  planStartGroup,
  switcherWidth,
} from '../src/utils/toolbar-fold';

const FILTER: StartControl = { kind: 'filter' };
const ADD: StartControl = { kind: 'add' };
const button = (index: number): StartControl => ({ kind: 'button', index });
const buttons = (count: number): StartControl[] =>
  Array.from({ length: count }, (_unused, index) => button(index));

/**
 * A list card's row as a shown toolbar draws it by default with four buttons: the filter folded
 * into its button, add, the four, the switcher, and refresh. The same row Alex's dashboard holds.
 */
const ROW: ActionRow = {
  start: [FILTER, ADD, ...buttons(4)],
  end: ['refresh'],
  views: 3,
  insetPx: Constants.UI.TOOLBAR_ROW_INSET.list,
};

const withEnd = (end: EndControl[], row: ActionRow = ROW): ActionRow => ({ ...row, end });

/** How many controls a plan draws, and how many it folds, at a card width. */
function shape(row: ActionRow, cardPx: number, atLeast?: number): [number, number] {
  const plan = planStartGroup(row, cardPx, atLeast);
  return [plan.visible.length, plan.overflow.length];
}

/** The shapes at one pixel below, at and one pixel above a width. */
const around = (row: ActionRow, cardPx: number) =>
  [cardPx - 1, cardPx, cardPx + 1].map((width) => shape(row, width));

describe('the widths the plan rests on', () => {
  it('takes each icon and a gap between two, and nothing for none', () => {
    expect(Constants.UI.TOOLBAR_COMMAND_WIDTH).toBe(36);
    expect(Constants.UI.TOOLBAR_COMMAND_GAP).toBe(8);
    expect([0, 1, 2, 5].map(groupWidth)).toEqual([0, 36, 80, 212]);
  });

  it('takes the switcher as its pictograms on their track, and nothing without views', () => {
    expect([0, 2, 3].map(switcherWidth)).toEqual([0, 74, 108]);
  });

  it('stands the row 34px in from the card in every view', () => {
    expect(Constants.UI.TOOLBAR_ROW_INSET).toEqual({ list: 34, column: 34, grid: 34 });
  });

  it('adds the inset, both groups, the switcher and the gaps between the three', () => {
    // 34 + (2 × 36 + 8) + 8 + 108 + 8 + 36: the filter and the menu button beside refresh.
    expect(cardWidthFor(ROW, 2)).toBe(274);
    // Without a switcher one gap stands between the two groups.
    expect(cardWidthFor({ ...ROW, views: 0 }, 2)).toBe(34 + 80 + 8 + 36);
    // Empty groups are still drawn, so their gaps still count.
    expect(cardWidthFor({ ...ROW, start: [], end: [] }, 0)).toBe(34 + 8 + 108 + 8);
  });

  it('needs 274px for the narrowest row beside refresh, 318px beside two and 362px beside three', () => {
    // The filter and the menu button, the switcher, and the end group: Alex's three cases, the
    // search control counted wherever it is drawn.
    expect(cardWidthFor(withEnd(['refresh']), 2)).toBe(274);
    expect(cardWidthFor(withEnd(['refresh', 'search']), 2)).toBe(318);
    expect(cardWidthFor(withEnd(['reset', 'refresh', 'search']), 2)).toBe(362);
  });
});

describe('planning the start group', () => {
  it('draws every control while they all fit, from 450px for six beside refresh', () => {
    expect(cardWidthFor(ROW, 6)).toBe(450);
    expect(around(ROW, 450)).toEqual([
      [4, 2],
      [6, 0],
      [6, 0],
    ]);
    expect(planStartGroup(ROW, 784)).toEqual({ visible: ROW.start, overflow: [] });
  });

  it('folds from the end, a control more at each threshold, never fewer than two', () => {
    // Four controls and the menu button from 406px, three from 362, two from 318, one from 274.
    expect(around(ROW, 406)).toEqual([
      [3, 3],
      [4, 2],
      [4, 2],
    ]);
    expect(around(ROW, 362)).toEqual([
      [2, 4],
      [3, 3],
      [3, 3],
    ]);
    expect(around(ROW, 318)).toEqual([
      [1, 5],
      [2, 4],
      [2, 4],
    ]);
    expect(around(ROW, 274)).toEqual([
      [1, 5],
      [1, 5],
      [1, 5],
    ]);
  });

  it('draws the widths of the harness sweep as the arithmetic says', () => {
    const widths = [274, 302, 318, 344, 359, 362, 377, 414, 784];
    expect(widths.map((width) => shape(ROW, width))).toEqual([
      [1, 5],
      [1, 5],
      [2, 4],
      [2, 4],
      [2, 4],
      [3, 3],
      [3, 3],
      [4, 2],
      [6, 0],
    ]);
  });

  it('never folds exactly one control, at any width', () => {
    for (const row of [ROW, { ...ROW, start: [FILTER, ADD, button(0)] }, withEnd([])]) {
      for (let width = 120; width <= 600; width += 0.5) {
        expect(planStartGroup(row, width).overflow).not.toHaveLength(1);
      }
    }
  });

  it('folds the last buttons first, then the earlier ones, then add, and keeps their order', () => {
    expect(planStartGroup(ROW, 406).overflow).toEqual([button(2), button(3)]);
    expect(planStartGroup(ROW, 362).overflow).toEqual([button(1), button(2), button(3)]);
    expect(planStartGroup(ROW, 318).overflow).toEqual(buttons(4));
    expect(planStartGroup(ROW, 274)).toEqual({ visible: [FILTER], overflow: [ADD, ...buttons(4)] });
  });

  it('keeps the filter and the menu button however narrow the card, the end group wrapping', () => {
    expect(planStartGroup(ROW, 120)).toEqual({ visible: [FILTER], overflow: [ADD, ...buttons(4)] });
  });

  it('keeps the first control there is with the filter off: add, or else the first button', () => {
    const noFilter: ActionRow = { ...ROW, start: [ADD, ...buttons(4)] };
    expect(planStartGroup(noFilter, 120)).toEqual({ visible: [ADD], overflow: buttons(4) });

    const buttonsOnly: ActionRow = { ...ROW, start: buttons(4) };
    expect(planStartGroup(buttonsOnly, 120)).toEqual({
      visible: [button(0)],
      overflow: [button(1), button(2), button(3)],
    });
  });

  it('folds add after every button, and only buttons with add off', () => {
    const noAdd: ActionRow = { ...ROW, start: [FILTER, ...buttons(4)] };
    // Five controls: all from 406px, three and the menu from 362, two from 318, the filter from 274.
    expect(around(noAdd, 406)).toEqual([
      [3, 2],
      [5, 0],
      [5, 0],
    ]);
    expect(planStartGroup(noAdd, 300)).toEqual({ visible: [FILTER], overflow: buttons(4) });
    expect(planStartGroup(ROW, 318).visible).toEqual([FILTER, ADD]);
  });

  it('gives the start group the switcher’s room where there is none', () => {
    // 116px more: the switcher's 108 and the gap beside it.
    const noSwitcher: ActionRow = { ...ROW, views: 0 };
    expect(cardWidthFor(noSwitcher, 6)).toBe(450 - 116);
    expect(around(noSwitcher, 334)).toEqual([
      [4, 2],
      [6, 0],
      [6, 0],
    ]);
    // At 302px the switcher's row draws the filter alone; without it, four and the menu fit.
    expect(shape(noSwitcher, 302)).toEqual([4, 2]);
    expect(shape(ROW, 302)).toEqual([1, 5]);
  });

  it('counts every control of the end group, a search control included', () => {
    // 44px each: an icon and its gap. At 344px refresh leaves room for two and the menu, two
    // controls for one and the menu, and three for the narrowest row, which then wraps.
    expect(shape(withEnd(['refresh']), 344)).toEqual([2, 4]);
    expect(shape(withEnd(['refresh', 'search']), 344)).toEqual([1, 5]);
    expect(shape(withEnd(['reset', 'refresh', 'search']), 344)).toEqual([1, 5]);
    expect(around(withEnd(['reset', 'refresh']), 362)).toEqual([
      [1, 5],
      [2, 4],
      [2, 4],
    ]);
    expect(around(withEnd(['reset', 'refresh', 'search']), 406)).toEqual([
      [1, 5],
      [2, 4],
      [2, 4],
    ]);
  });

  it('never folds a row of one or two controls, since a menu would hold one', () => {
    for (const start of [[], [FILTER], [FILTER, ADD], [ADD, button(0)], [button(0), button(1)]]) {
      const row = { ...ROW, start };
      expect(planStartGroup(row, 100)).toEqual({ visible: start, overflow: [] });
    }
  });

  it('folds two of three together, and brings them back together', () => {
    const three: ActionRow = { ...ROW, start: [FILTER, ADD, button(0)] };
    expect(cardWidthFor(three, 3)).toBe(318);
    expect(around(three, 318)).toEqual([
      [1, 2],
      [3, 0],
      [3, 0],
    ]);
  });

  it('leaves the row it is given as it was, and splits it in two without loss', () => {
    const before = structuredClone(ROW);
    for (const width of [120, 300, 362, 784]) {
      const plan = planStartGroup(ROW, width);
      expect([...plan.visible, ...plan.overflow]).toEqual(ROW.start);
    }
    expect(ROW).toEqual(before);
  });
});

describe('folding more than the width calls for', () => {
  it('folds at least as many as asked, never fewer than the width does', () => {
    expect(shape(ROW, 406, 3)).toEqual([3, 3]);
    expect(shape(ROW, 362, 2)).toEqual([3, 3]);
    expect(shape(ROW, 362, 0)).toEqual([3, 3]);
  });

  it('turns a request for one into two where nothing folded', () => {
    expect(shape(ROW, 784, 1)).toEqual([4, 2]);
    expect(shape(ROW, 784, 2)).toEqual([4, 2]);
  });

  it('never folds the first control, however many are asked for', () => {
    expect(planStartGroup(ROW, 784, 99)).toEqual({
      visible: [FILTER],
      overflow: [ADD, ...buttons(4)],
    });
    expect(planStartGroup({ ...ROW, start: [FILTER, ADD] }, 784, 5).overflow).toEqual([]);
  });
});
