/**
 * The Separators panel — the rules the card draws between things.
 *
 * Split out of *Date Display*, where three of them lived for no reason beyond having
 * been written next to the date fields. They are not date formatting: they are the
 * card's ruling, and the documentation had already grouped them apart.
 *
 * The panel is also where the day-header rule belongs, and that one is stored inside a
 * view's override block rather than at the top level. Siting it by *what it is* rather
 * than by *where it is stored* is the whole argument for the split — a user looking for
 * "how do I turn that line off" should not have to know which block holds it. The
 * nested group puts it one collapse away without moving it in the configuration.
 *
 * There is no view name written here. Which override block exists, and whether one
 * exists at all, comes from `OVERRIDE_BLOCK_BY_VIEW`.
 */

import { mdiFormatLineWeight } from '@mdi/js';

import { color, nested, row, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

/** Icon for the panel. */
export const SEPARATORS_ICON = mdiFormatLineWeight;

/** Icon path for the nested day-header group. */
const DAY_HEADER_RULE_ICON = 'M3 5h18v2H3V5m0 12h18v2H3v-2Z';

/**
 * The three top-level rules, each a width beside its colour.
 *
 * Written as a loop over the prefix rather than as three copies, because that is
 * exactly what they are: the old editor spent a hundred and thirty lines on three
 * blocks differing in one word.
 */
const RULES = ['day', 'week', 'month'] as const;

/**
 * Builds the Separators panel schema.
 *
 * Memoised on the language and the override block, which is the only thing that varies.
 *
 * @param language - Effective language code
 * @param blockKey - Config key holding this view's override block, if it has one
 * @returns The panel's schema
 */
export const separatorsSchema = Helpers.memoizeLast(
  (language: string, blockKey: string | undefined): HaFormSchema[] => {
    const schema: HaFormSchema[] = RULES.map((rule) =>
      row(text(`${rule}_separator_width`), color(`${rule}_separator_color`)),
    );

    if (blockKey !== undefined) {
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
  return separatorsSchema(ctx.language, overrideBlockKey(ctx.view));
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
