/**
 * How many of a day's events a compact month's list draws in its room
 * (`utils/month-list-fit.ts`), from measured numbers alone: where each row ends, "+N more"'s
 * height, the gap before it and the room. The card's side, measuring them off the staged rows, is
 * in `month-compact.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { MONTH_LIST_FIT_TOLERANCE, fitMonthList } from '../src/utils/month-list-fit';

/**
 * Where each of a day's rows ends, from rows this tall with this gap between two.
 *
 * @param heights - Each row's height, first first
 * @param gap - The gap between two rows
 * @returns rows[k], the first k rows with the gaps between them
 */
function ends(heights: ReadonlyArray<number>, gap = 6): number[] {
  const end = [0];
  heights.forEach((height, index) => end.push(end[index] + (index > 0 ? gap : 0) + height));
  return end;
}

/** Nine rows of 40px, 6px apart: they end at 40, 86, 132, 178, 224, 270, 316, 362 and 408. */
const NINE = ends(Array(9).fill(40));

describe('the rows a day’s list draws', () => {
  it.each<readonly [string, ReadonlyArray<number>, number, number, number, number]>([
    // name, rows, more, gap, room, shown
    ['an empty day', [0], 28, 6, 200, 0],
    ['an empty day in no room', [0], 28, 6, 0, 0],
    // Every row fits: no "+N more" is needed, so its room is not kept.
    ['every row', ends([40, 40]), 28, 6, 200, 2],
    ['every row, to the pixel', ends([40, 40, 40, 40]), 28, 6, 178, 4],
    // One pixel short of all four: three and "+1 more" need 132 + 6 + 28 = 166.
    ['one pixel short of every row', ends([40, 40, 40, 40]), 28, 6, 177, 3],
    // The most rows that fit with "+N more" after them, to the pixel and one short.
    ['rows and "+N more", to the pixel', NINE, 28, 6, 166, 3],
    ['one pixel short', NINE, 28, 6, 165, 2],
    // The gap before "+N more" counts: 132 + 28 alone would fit in 160, not with the gap.
    ['the gap before "+N more"', NINE, 28, 6, 160, 2],
    ['no gap', NINE, 28, 0, 160, 3],
    // Rows of mixed heights, in order: the second is too tall to fit before "+N more", and the
    // shorter third never takes its place.
    ['a tall second row', ends([40, 140, 40, 40]), 28, 6, 200, 1],
    ['a tall row that fits', ends([40, 100, 40, 40]), 28, 6, 200, 2],
    // Fractions are kept: rows of 20.25px end at 20.25, 46.5 and 72.75, and two with the gap and
    // "+N more" need 69.75.
    ['every row, in fractions', ends([20.25, 20.25, 20.25]), 17.25, 6, 72.75, 3],
    ['fractions, to the quarter pixel', ends([20.25, 20.25, 20.25]), 17.25, 6, 69.75, 2],
    ['fractions, a quarter pixel short', ends([20.25, 20.25, 20.25]), 17.25, 6, 69.5, 1],
    // Twelve events, "+N more" measured at its most digits: the count may go to one.
    ['a day of twelve', ends(Array(12).fill(40)), 28, 6, 500, 10],
    ['a day of twelve, one short of every row', ends(Array(12).fill(40)), 28, 6, 545, 11],
    // "+N more" alone: where the first row is taller than the room leaves it, where the room
    // holds the button and no row, and where the room is shorter than the button.
    ['the first row too tall', ends([300, 40]), 28, 6, 200, 0],
    ['room for the button alone', NINE, 28, 6, 73, 0],
    ['room shorter than the button', NINE, 28, 6, 12, 0],
    ['no room', NINE, 28, 6, 0, 0],
    ['a negative room, a card at its cap', NINE, 28, 6, -40, 0],
  ])('%s', (_name, rows, more, gap, room, shown) => {
    expect(fitMonthList({ rows, more, gap, room })).toBe(shown);
  });

  it('forgives under a hundredth of a pixel, as fractional layout leaves, and not two', () => {
    expect(MONTH_LIST_FIT_TOLERANCE).toBe(0.01);
    const fit = (room: number) => fitMonthList({ rows: [0, 40, 86], more: 28, gap: 6, room });
    // Every row in 86, and one with "+N more" in 74.
    expect(fit(86 - 0.005)).toBe(2);
    expect(fit(86 - 0.02)).toBe(1);
    expect(fit(74 - 0.005)).toBe(1);
    expect(fit(74 - 0.02)).toBe(0);
  });

  it('keeps every count it can draw, from none to all, as the room grows', () => {
    // A row more only once its room is there, never one fewer as the room grows.
    let last = 0;
    const seen = new Set<number>();
    for (let room = 0; room <= 420; room += 0.5) {
      const shown = fitMonthList({ rows: NINE, more: 28, gap: 6, room });
      expect(shown).toBeGreaterThanOrEqual(last);
      last = shown;
      seen.add(shown);
    }
    expect([...seen]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
