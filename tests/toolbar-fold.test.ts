/**
 * Whether the configuration's own toolbar buttons fold, as arithmetic.
 *
 * The fold is pure (`utils/toolbar-fold.ts`): the row's controls are icons of one width, so the
 * width the row needs follows from how many there are and the switcher's width as pictograms.
 * Each case names the rule it is the only one to reach: all or none, two or more, the switcher
 * reckoned as pictograms, the margin before an unfold, and the wider width an unfold that did
 * not fit folds from. How the card measures and acts on it is in `toolbar-buttons.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import * as Constants from '../src/config/constants';
import {
  type ActionRow,
  buttonsFolded,
  groupWidth,
  judgeButtonsFold,
  rowWidthWithButtons,
} from '../src/utils/toolbar-fold';

/** The row a shown toolbar draws on a card with a calendar to add to: filter, add, refresh. */
const ROW: ActionRow = { buttons: 3, start: 2, end: 1, switcherPx: 108 };

describe('the width a group of icons takes', () => {
  it('is each icon and a gap between two, and nothing for none', () => {
    expect(Constants.UI.TOOLBAR_COMMAND_WIDTH).toBe(36);
    expect(Constants.UI.TOOLBAR_COMMAND_GAP).toBe(8);
    expect([0, 1, 2, 5].map(groupWidth)).toEqual([0, 36, 80, 212]);
  });
});

describe('the width the action row needs with every button in it', () => {
  it('is its groups, the switcher as pictograms, and a gap either side of the switcher', () => {
    // 5 × 36 + 4 × 8 at the start, 36 at the end, 108 for the switcher, two gaps.
    expect(rowWidthWithButtons(ROW)).toBe(212 + 36 + 108 + 16);
  });

  it('counts one gap between the groups where there is no switcher', () => {
    expect(rowWidthWithButtons({ ...ROW, switcherPx: null })).toBe(212 + 36 + 8);
  });

  it('counts the gaps between the groups even where one is empty', () => {
    // The start and end groups are drawn even when they hold nothing.
    expect(rowWidthWithButtons({ buttons: 2, start: 0, end: 0, switcherPx: 108 })).toBe(
      80 + 108 + 16,
    );
  });
});

describe('judging the fold', () => {
  it('folds where the row is too narrow, until a card wide enough for the buttons by the margin', () => {
    // The plan's measured row: 342px of content in a 376px card, against 372px needed.
    expect(judgeButtonsFold(ROW, 342, 376, null)).toEqual({
      unfoldAtPx: 376 + 372 - 342 + Constants.UI.LEGEND_UNFOLD_MARGIN,
    });
  });

  it('keeps the buttons in a row that holds them, to the half pixel', () => {
    expect(judgeButtonsFold(ROW, 372, 406, null)).toBeNull();
    expect(judgeButtonsFold(ROW, 371.5, 405.5, null)).toBeNull();
    expect(judgeButtonsFold(ROW, 371.4, 405.4, null)).not.toBeNull();
  });

  it('never folds fewer than two buttons, however narrow the row', () => {
    expect(judgeButtonsFold({ ...ROW, buttons: 1 }, 10, 44, null)).toBeNull();
    expect(judgeButtonsFold({ ...ROW, buttons: 0 }, 10, 44, null)).toBeNull();
    expect(judgeButtonsFold({ ...ROW, buttons: 2 }, 10, 44, null)).not.toBeNull();
  });

  it('reckons the switcher as it is measured, so its pictograms decide, not its words', () => {
    // The same row fits with the switcher's 108px pictograms and not with its 194px words.
    expect(judgeButtonsFold(ROW, 380, 414, null)).toBeNull();
    expect(judgeButtonsFold({ ...ROW, switcherPx: 194 }, 380, 414, null)).not.toBeNull();
  });

  it('folds again from wider than the width an unconfirmed unfold was tried at', () => {
    // Unfolded at 408, where the row should have held them, and then measured short of it: a
    // scrollbar the drawn buttons brought narrowed the card back to 376.
    expect(judgeButtonsFold(ROW, 342, 376, 408)).toEqual({ unfoldAtPx: 409 });
    // Never narrower than the width the row needs.
    expect(judgeButtonsFold(ROW, 300, 334, 340)).toEqual({ unfoldAtPx: 334 + 72 + 2 });
  });
});

describe('whether the buttons are folded now', () => {
  const FOLD = { signature: 'row', unfoldAtPx: 408 };

  it('holds a fold below the width it unfolds from, and not from it on', () => {
    expect(buttonsFolded(FOLD, 'row', 376)).toBe(true);
    expect(buttonsFolded(FOLD, 'row', 407.9)).toBe(true);
    expect(buttonsFolded(FOLD, 'row', 408)).toBe(false);
  });

  it('holds a fold before the card has been judged at any width', () => {
    expect(buttonsFolded(FOLD, 'row', null)).toBe(true);
  });

  it('holds no fold recorded for another row, or none at all', () => {
    expect(buttonsFolded(FOLD, 'another row', 376)).toBe(false);
    expect(buttonsFolded(null, 'row', 376)).toBe(false);
  });
});
