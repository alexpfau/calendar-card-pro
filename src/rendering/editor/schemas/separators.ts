/**
 * Separator schema rows.
 */

import { mdiFormatLineWeight } from '@mdi/js';

import { color, nested, row, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

export const SEPARATORS_ICON = mdiFormatLineWeight;

const DAY_HEADER_RULE_ICON = 'M3 5h18v2H3V5m0 12h18v2H3v-2Z';

const RULES = ['day', 'week', 'month'] as const;
const VIEWS_WITH_DAY_HEADER_SEPARATORS = new Set<Types.EffectiveView>(['column', 'grid']);

/**
 * Builds the Separators panel schema.
 *
 * @param language - Effective language code
 * @param blockKey - Config key holding this view's override block, if it has one
 * @returns The panel's schema
 */
const separatorsSchema = Helpers.memoizeLast(
  (language: string, blockKey: string | undefined, view: Types.EffectiveView): HaFormSchema[] => {
    const schema: HaFormSchema[] = RULES.map((rule) =>
      row(text(`${rule}_separator_width`), color(`${rule}_separator_color`)),
    );

    // Gated on the view owning the keys, not merely on it having a block.
    // `day_header_separator_*` are day-header-only, so offering them to a view whose block
    // would store a value the renderer never reads.
    if (blockKey !== undefined && VIEWS_WITH_DAY_HEADER_SEPARATORS.has(view)) {
      schema.push(
        nested(language, blockKey, `${blockKey}.day_header_separator`, DAY_HEADER_RULE_ICON, [
          row(text('day_header_separator_width'), color('day_header_separator_color')),
        ]),
      );
    }

    return schema;
  },
);

/**
 * Builds the Separators panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildSeparatorsSchema(ctx: SchemaCtx): HaFormSchema[] {
  return separatorsSchema(ctx.language, overrideBlockKey(ctx.view), ctx.view);
}

/**
 * The config key holding a view's override block, where it has one.
 *
 * @param view - View the card is configured to render
 * @returns The block key, or `undefined` for a view configured at the top level
 */
function overrideBlockKey(view: Types.EffectiveView): string | undefined {
  return ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];
}
