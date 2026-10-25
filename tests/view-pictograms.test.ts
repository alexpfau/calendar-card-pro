/**
 * The card's view pictograms, now drawn from one table in two places.
 *
 * The editor's view picker built its tiles from three inline SVG strings until the toolbar's
 * view switcher needed the same pictures. Both now draw from `rendering/view-pictograms.ts`,
 * and the picker's tiles must not have moved by a character: the strings below are the
 * originals, copied verbatim from before the move, so this pins the refactor rather than
 * restating its output.
 */

import { describe, expect, it } from 'vitest';

import type { SelectorSchema } from '../src/rendering/editor/ha-form';
import { buildDisplayViewSchema } from '../src/rendering/editor/schemas/layout';
import { VIEW_PICTOGRAMS } from '../src/rendering/view-pictograms';

const ORIGINAL_ARTWORK = {
  list:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="2" y="3" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="3" width="31" height="7" rx="2" opacity=".4"/>' +
    '<rect x="2" y="12.5" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="12.5" width="31" height="7" rx="2" opacity=".4"/>' +
    '<rect x="2" y="22" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="22" width="31" height="7" rx="2" opacity=".4"/></g></svg>',
  column:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="2" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="17.5" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="33" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="2" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/>' +
    '<rect x="17.5" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/>' +
    '<rect x="33" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/></g></svg>',
  grid:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="9" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="22" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="35" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="9" y="9" width="24" height="3" rx="1.5" opacity=".55"/>' +
    '<rect x="2" y="15.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="2" y="21" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="2" y="26.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="9" y="14.5" width="11" height="6" rx="1.5" opacity=".4"/>' +
    '<rect x="9" y="23" width="11" height="5" rx="1.5" opacity=".4"/>' +
    '<rect x="22" y="14.5" width="11" height="13.5" rx="1.5" opacity=".4"/>' +
    '<rect x="35" y="19" width="11" height="7" rx="1.5" opacity=".4"/></g></svg>',
} as const;

describe('the view pictograms', () => {
  it("leave the editor's view picker exactly as it was", () => {
    const [node] = buildDisplayViewSchema('en') as SelectorSchema[];
    const options = (
      node.selector as unknown as { select: { options: Array<{ value: string; image?: string }> } }
    ).select.options;

    expect(options.map((option) => option.value)).toEqual(['list', 'column', 'grid']);
    for (const option of options) {
      const original = ORIGINAL_ARTWORK[option.value as keyof typeof ORIGINAL_ARTWORK];
      expect(option.image, option.value).toBe(`data:image/svg+xml,${encodeURIComponent(original)}`);
    }
  });

  it('draw one picture per view, and nothing else', () => {
    expect(Object.keys(VIEW_PICTOGRAMS)).toEqual(['list', 'column', 'grid']);
    expect(
      Object.fromEntries(
        Object.entries(VIEW_PICTOGRAMS).map(([view, rects]) => [view, rects.length]),
      ),
    ).toEqual({ list: 6, column: 6, grid: 11 });
  });
});
