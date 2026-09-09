/**
 * Separator schema rows.
 */

import { mdiFormatLineWeight } from '@mdi/js';

import { blockScope, color, heading, row, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

export const SEPARATORS_ICON = mdiFormatLineWeight;

const RULES = ['day', 'week', 'month'] as const;

/**
 * Builds the Separators panel schema.
 *
 * Every rule here divides one day, week or month from the next. The day-header rule used
 * to sit below them in a collapsible and did not belong: in column and grid these three
 * are drawn *between* the columns and the day-header rule is drawn *across* them, so the
 * panel was asking two questions under one name. It now lives with the gap it is drawn
 * inside, under Day Header, which leaves this panel homogeneous in every view.
 *
 * Grid then earns the opposite move. Its paper is ruled in both directions, and until now
 * only one direction was here: the hour rules and the all-day band's boundary were in
 * Layout, inside the time-axis collapsible, because each had been placed next to the
 * option that positions it. That is a defensible reading of "where does this belong" and
 * it loses to the question users actually arrive with, which is not "how is the axis
 * built" but "how is this thing ruled". Bringing them here makes this the one panel that
 * answers it — every rule the grid draws, in one place, split by the only distinction
 * that matters once they are together: the ones in the gutter between days, and the ones
 * running across all of them.
 *
 * `day_spacing` comes with them for the same reason the day-header gap went to Day
 * Header. It is the gutter those vertical rules are centered in, and at the grid default
 * a 1px rule in a 1px gutter fills it exactly — so gutter and rule are one visual
 * decision, and reading either alone is reading half of it.
 *
 * @param view - View the card is configured to render
 * @param blockKey - Config key holding this view's override block, if it has one
 * @returns The panel's schema
 */
const separatorsSchema = Helpers.memoizeLast(
  (view: Types.EffectiveView, blockKey: string | undefined): HaFormSchema[] => {
    const boundaryRules = RULES.map((rule) =>
      row(text(`${rule}_separator_width`), color(`${rule}_separator_color`)),
    );

    // List and column rule in one direction only, so the panel is a single family and a
    // heading over the whole of it would caption nothing. Headings appear exactly where
    // there is a second run for them to tell apart.
    if (view !== 'grid' || blockKey === undefined) return boundaryRules;

    return [
      // `day_spacing` stays at the top level of the form; `routeForKey` decides which
      // block it is written to, as it already did while the field lived in Layout. The
      // hour and band keys are grid-only and are read from the block, so they keep the
      // `blockScope` their collapsible used to give them.
      heading('heading_between_days'),
      text('day_spacing'),
      ...boundaryRules,

      heading('heading_across_the_grid'),
      blockScope(blockKey, [
        row(text('hour_line_width'), color('hour_line_color')),
        row(text('allday_band_line_width'), color('allday_band_line_color')),
      ]),
    ];
  },
);

/**
 * Builds the Separators panel schema.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildSeparatorsSchema(ctx: SchemaCtx): HaFormSchema[] {
  const block = ViewConfig.viewBlockFor(ctx.view);

  // Gated on the block owning the keys rather than on the view merely having one, the
  // same test these fields were gated on while they were in Layout.
  return separatorsSchema(
    ctx.view,
    block?.onlyKeys.includes('hour_line_width') === true ? block.blockKey : undefined,
  );
}
