import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import {
  computeColumnThresholdPxFor,
  describeColumnLayoutBands,
  resolveColumnFit,
} from '../src/config/view';
import { lookup } from '../src/rendering/editor/localize';

const config = buildConfig({ view: 'grid', days_to_show: 3 });
const requiredWidth = computeColumnThresholdPxFor(config, 3, 'grid');
const entryWidth = describeColumnLayoutBands(config, 'grid').bands[0].minWidthPx;

describe('the default three-day Grid width guidance', () => {
  it('names a real entry boundary rather than a width that merely also fits', () => {
    expect(resolveColumnFit('grid', config, entryWidth - 1, null)).toEqual({
      view: 'grid',
      columns: 2,
    });
    expect(resolveColumnFit('grid', config, entryWidth, null)).toEqual({
      view: 'grid',
      columns: 3,
    });
  });

  it.each(['en', 'en-GB', 'de', 'et', 'it', 'lt', 'lv', 'nb', 'pl', 'sk', 'sv'])(
    'keeps the %s helper consistent with the resolver',
    (language) => {
      const helper = lookup(language, 'time_grid.min_day_width.helper');
      const widths = [...(helper?.matchAll(/(\d+)px/g) ?? [])].map((match) => Number(match[1]));
      expect(widths).toEqual([100, requiredWidth, entryWidth]);
    },
  );

  it.each(['docs/features/grid-view.md', 'docs/reference/configuration.md'])(
    'keeps the %s figures consistent with the resolver',
    (path) => {
      const source = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', path),
        'utf8',
      );
      const claim =
        path === 'docs/features/grid-view.md'
          ? source.match(/three grid days need (\d+)px before hysteresis, or (\d+)px/)
          : source.match(/Three days fit at (\d+)px, or (\d+)px/);
      expect(claim, 'the documented default-width comparison must remain present').not.toBeNull();
      expect(claim!.slice(1).map(Number)).toEqual([requiredWidth, entryWidth]);
    },
  );
});
