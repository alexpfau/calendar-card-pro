/**
 * Home Assistant's Sections dashboards: the rows the card asks for, and whether the dashboard has
 * given it a slot of its own to fill.
 *
 * A slot is known before anything is drawn, from the configuration and the layout Home Assistant
 * hands the card, so a month in one never measures its own height: it fills the slot. Anywhere
 * else it writes the height its configuration asks for (`CardSize.cardSizeStyle`).
 */

import * as Config from '../config/config';
import * as Constants from '../config/constants';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';

/** The size the card asks a Sections dashboard for, as Home Assistant's `getGridOptions` reads it. */
export interface CardGridOptions {
  readonly columns: 'full';
  readonly rows: number | 'auto';
}

/**
 * The size the card asks a Sections dashboard for: the whole width, and for a month that opens
 * as one `UI.MONTH_SECTIONS_ROWS` rows while its configuration sets no height and no maximum
 * (`ViewConfig.monthSetsCardSize`), more of them where it asks for a toolbar
 * (`Config.asksForToolbar`), which every other card sizes itself.
 *
 * Read from the configuration alone, never from a layout this device picked, because Home
 * Assistant asks again only when the configuration changes. A row count the dashboard's Layout
 * tab writes wins over it there.
 *
 * @param config - Merged configuration
 * @returns The options
 */
export function cardGridOptions(config: Types.Config): CardGridOptions {
  return {
    columns: 'full',
    rows:
      config.view === 'month' && !ViewConfig.monthSetsCardSize(config)
        ? Constants.UI.MONTH_SECTIONS_ROWS[Config.asksForToolbar(config) ? 'toolbar' : 'plain']
        : 'auto',
  };
}

/** Whether a value is a plain object, which Home Assistant's options are. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rows a Sections dashboard gives the card, worked out as Home Assistant's own card wrapper
 * works them out (`hui-card`, `getGridOptions`): the card's options, overlaid key by key by the
 * configuration's `grid_options`, or where it has none by its older `layout_options`, whose
 * `grid_rows` are the rows. A number is a slot of that many rows; `auto` or nothing, none.
 *
 * @param config - Merged configuration, which keeps Home Assistant's own keys
 * @returns The rows as Home Assistant reads them
 */
export function sectionRows(config: Types.Config): unknown {
  const raw = config as unknown as Record<string, unknown>;
  const layout = raw.layout_options;
  const overlay = raw.grid_options
    ? raw.grid_options
    : layout && isObject(layout) && layout.grid_rows !== undefined
      ? { rows: layout.grid_rows }
      : {};
  return { ...cardGridOptions(config), ...(isObject(overlay) ? overlay : {}) }.rows;
}

/**
 * Whether the card fills a slot a Sections dashboard gives it: laid out on its grid, which Home
 * Assistant says by setting `layout` to `grid`, with a number of rows.
 *
 * @param layout - The layout Home Assistant set on the card, if any
 * @param config - Merged configuration
 * @returns `true` when the card fills a slot rather than sizing itself
 */
export function holdsSlot(layout: string | undefined, config: Types.Config): boolean {
  return layout === 'grid' && typeof sectionRows(config) === 'number';
}
