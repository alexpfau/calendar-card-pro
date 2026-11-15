/**
 * Separator schema rows.
 */

import { blockScope, color, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

const RULES = ['day', 'week', 'month'] as const;

/**
 * Builds the Separators panel schema: every rule dividing one day, week or month from the next,
 * and in Grid also the gutter those rules sit in and the rules running across the grid.
 *
 * @param view - View the card is configured to render
 * @param blockKey - Config key holding this view's override block, if it has one
 * @returns The panel's schema
 */
const separatorsSchema = Helpers.memoizeLast(
  (view: Types.EffectiveView, blockKey: string | undefined): HaFormSchema[] => {
    const boundaryRules = RULES.flatMap((rule) => [
      text(`${rule}_separator_width`),
      color(`${rule}_separator_color`),
    ]);

    if (view !== 'grid' || blockKey === undefined) return boundaryRules;

    return [
      // `day_spacing` stays at the top level of the form; `routeForKey` decides which block it
      // is written to. The hour and band keys are grid-only and are read from the block.
      text('day_spacing'),
      ...boundaryRules,
      blockScope(blockKey, [
        text('hour_line_width'),
        color('hour_line_color'),
        text('allday_band_line_width'),
        color('allday_band_line_color'),
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
