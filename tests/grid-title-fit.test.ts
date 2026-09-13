import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';
import {
  adjacentGridTitleFont,
  gridTitleHasUsefulWidth,
  gridTitlePrefix,
  minimumGridTitleFont,
  selectGridTitleFont,
} from '../src/utils/grid-title-fit';

describe('Grid compact font ladder', () => {
  it.each([
    [12, [12, 12], 10],
    [20, [20, 32], 10],
    [20, [20, 12], 17],
    [20, [20, 10], 20],
    [20, [20, 8], 20],
    [9, [9, 12], 9],
    [27.34375, [27.34375, 21.875], 13.34375],
    [12, [12, 0], null],
    [12, [12, NaN], null],
  ])('protects all text floors for %s with %s', (font, fonts, expected) => {
    expect(minimumGridTitleFont(font, fonts)).toBe(expected);
  });

  it('checks neighboring steps without skipping a fractional last step or enlarging small fonts', () => {
    expect(adjacentGridTitleFont(12, 10, true)).toBe(11);
    expect(adjacentGridTitleFont(15.4, 10, true)).toBeCloseTo(10.4);
    expect(adjacentGridTitleFont(15.4, 10.4, false)).toBe(10);
    expect(adjacentGridTitleFont(20, 15, false)).toBe(14);
    expect(adjacentGridTitleFont(9, 9, true)).toBe(9);
    expect(adjacentGridTitleFont(9, 9, false)).toBe(9);
  });
  it.each([
    [12, 14.4, 19, 12],
    [20, 24, 19, 15],
    [40, 48, 19, 15],
    [12, 14.4, 12, 10],
    [12, 14.4, 11.9, null],
    [9, 10.8, 12, 9],
    [9, 10.8, 10, null],
    [10, 12, 12, 10],
    [10, 12, 11, null],
    [13.333333, 16, 15, 12.333333],
    [13.333333, 16, 12.2, 10],
    [12, 30, 19, null],
    [12, 40, 19, null],
  ])('fits %spx from a %spx group into %spx as %s', (font, height, available, expected) => {
    const result = selectGridTitleFont(font, height, available);
    if (expected === null) expect(result).toBeNull();
    else expect(result).toBeCloseTo(expected, 6);
  });

  it('agrees with an exhaustive discrete oracle, including nonintegral authored fonts', () => {
    for (const font of [8, 9, 10, 10.3, 12, 13.333333, 20, 40, 83]) {
      const candidates = [font];
      for (let value = font - 1; value > Math.min(font, 10); value -= 1) {
        candidates.push(value);
      }
      candidates.push(Math.min(font, 10));
      for (const line of [10, 12, 14.4, 19.25, 30, 48, 100]) {
        for (const available of [1, 11, 12, 12.2, 14, 18.984375, 19, 24, 40, 100]) {
          const expected =
            candidates.find((candidate) => (candidate / font) * line <= available) ?? null;
          expect(selectGridTitleFont(font, line, available), `${font}/${line}/${available}`).toBe(
            expected,
          );
        }
      }
    }
  });

  it.each([
    [0, 14, 20],
    [-1, 14, 20],
    [12, 0, 20],
    [12, -1, 20],
    [12, 14, 0],
    [NaN, 14, 20],
    [12, Infinity, 20],
    [12, 14, NaN],
  ])('refuses unusable measurements %s/%s/%s', (font, line, available) => {
    expect(selectGridTitleFont(font, line, available)).toBeNull();
  });
});

describe('useful combined title width', () => {
  it.each([
    ['A long title', 'A'],
    ['  “Meeting”', '“M'],
    ['... Library', '... L'],
    ['\u2067שלום\u2069', '\u2067ש'],
    ['e\u0301clair', 'e\u0301'],
    ['👩🏽‍🌾 Garden', '👩🏽‍🌾'],
    ['🇺🇸 Planning', '🇺🇸'],
    ['家族', '家'],
    ['…', ''],
    ['  ', ''],
    ['', ''],
  ])('keeps a complete useful grapheme in %s', (text, expected) => {
    expect(gridTitlePrefix(text)).toBe(expected);
  });

  it('reserves ellipsis width only when the full title does not fit', () => {
    expect(gridTitleHasUsefulWidth(20, 20, 8, 12)).toBe(true);
    expect(gridTitleHasUsefulWidth(20, 100, 8, 12)).toBe(true);
    expect(gridTitleHasUsefulWidth(19.99, 100, 8, 12)).toBe(false);
    expect(gridTitleHasUsefulWidth(8, 100, 8, 12)).toBe(false);
    expect(gridTitleHasUsefulWidth(2, 100, 8, 12)).toBe(false);
    expect(gridTitleHasUsefulWidth(100, 100, 0, 12)).toBe(false);
  });
});

describe('Grid-only fitting CSS', () => {
  const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  it('takes normal eligibility from the real container query, not another height threshold', () => {
    expect(css).toMatch(
      /\.grid-event-disclosure \.summary-row\s*\{[^}]*--calendar-card-grid-title-eligible:\s*0/,
    );
    expect(css).toMatch(
      /@container calendar-card-grid-event \(min-height: 19px\)\s*\{\s*\.grid-event-disclosure \.summary-row\s*\{[^}]*--calendar-card-grid-title-eligible:\s*1/,
    );
  });

  it('scales the complete group and retains the compact breathing room and continuation space', () => {
    expect(css).toContain('zoom: var(--calendar-card-grid-title-scale, 1)');
    expect(css).toContain('inset-block: 1px');
    expect(css).toContain('inset-block-start: 2px');
    expect(css).toContain('inset-block-end: 2px');
    expect(css).toMatch(/> :not\(\.event-title\)\s*\{[^}]*flex:\s*0 0 auto/);
    expect(css).toMatch(/\.event-title-scroll\s*\{[^}]*animation:\s*none !important/);
    expect(css).toMatch(/\[data-grid-title-fit='blank'\][^}]*visibility:\s*hidden/);
  });
});
