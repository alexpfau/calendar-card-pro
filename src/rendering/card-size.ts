/**
 * The whole card's height in every layout.
 *
 * `card_height` and `card_max_height` size the card's border box, the title, the toolbar and any
 * notice included, at the top level or in a layout's block (`ViewConfig.resolveCardSize`). The
 * card writes them on `ha-card`, which is a flex column, and the events area takes what the header
 * leaves, as a month's always has: List scrolls in it, Columns leaves room under its days, Grid
 * compresses its hours into it down to a readable height and scrolls below that, and Month shares
 * it among its weeks. A Sections slot sizes the card the same way, from outside.
 */

import { monthCardStyle } from './month';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';

/**
 * What the events area takes while the card has a height of its own: the room the header leaves,
 * from a basis of nothing, and none of the events area's own `height`, which the whole card's
 * replaces. `max_height` still caps it.
 */
export const FILL_CARD: Readonly<Record<string, string>> = {
  '--calendar-card-content-flex': '1 1 0',
  '--calendar-card-height': 'auto',
};

/**
 * Whether the card has a height its events area fills: a Sections slot, or a `card_height` other
 * than `auto` in the layout drawn. Month fills its card at every height, so this asks about the
 * other layouts; Grid reads it to compress its hours.
 *
 * @param config - Merged configuration
 * @param view - The layout drawn
 * @param holdsSlot - Whether a Sections dashboard gives the card a slot of its own
 * @returns `true` where the events area fills a height the card already has
 */
export function fillsCard(
  config: Types.Config,
  view: Types.EffectiveView,
  holdsSlot: boolean,
): boolean {
  return holdsSlot || ViewConfig.resolveCardSize(config, view).height !== 'auto';
}

/**
 * The declarations the card writes on `ha-card` for its whole height.
 *
 * In a Sections slot, which `ha-card` fills, only the events area's fill; a month adds nothing
 * there, since its stylesheet fills its card at every height. Elsewhere Month writes its own
 * (`monthCardStyle`), with its default height for `auto`. Any other layout writes a `card_height`
 * and fills it, and a `card_max_height` as the card's cap, under which the events area shrinks
 * and scrolls; at `auto` and `none` it writes nothing and keeps its content's height.
 *
 * @param config - Merged configuration
 * @param view - The layout drawn
 * @param monthForm - The form a month draws
 * @param holdsSlot - Whether a Sections dashboard gives the card a slot of its own
 * @returns The declarations to write on `ha-card`
 */
export function cardSizeStyle(
  config: Types.Config,
  view: Types.EffectiveView,
  monthForm: ViewConfig.MonthCardForm,
  holdsSlot: boolean,
): Record<string, string> {
  if (holdsSlot) return view === 'month' ? {} : { ...FILL_CARD };
  if (view === 'month') return monthCardStyle(config, monthForm);

  const { height, max } = ViewConfig.resolveCardSize(config, view);
  return {
    ...(height === 'auto' ? {} : { height, ...FILL_CARD }),
    ...(max === 'none' ? {} : { 'max-height': max }),
  };
}
