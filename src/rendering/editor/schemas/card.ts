/**
 * Card-level schema assembly.
 */

import { mdiCardText } from '@mdi/js';

import * as Config from '../../../config/config';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { blockScope, bool, color, row, text } from './common';

export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Header panel schema.
 *
 * The header's options first, then the card's own. The toolbar sits in the header, beside
 * the title or in a row of its own when there is none, so its options follow the title's
 * rather than the card-wide background. One switch decides whether there is a toolbar at
 * all; only while it is on are its controls offered, each with a switch of its own. Later
 * controls join that list in the toolbar's own order.
 *
 * No sub-heading over the toolbar: with the toolbar off its switch is the only field under
 * it, and a heading saying "Toolbar" above "Show Toolbar" only stutters.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildCardSchema(ctx: SchemaCtx): HaFormSchema[] {
  const toolbar = Config.resolveToolbar(ctx.config);

  return [
    text('title'),
    row(text('title_font_size'), color('title_color')),
    blockScope('toolbar', [
      bool('show'),
      ...(toolbar.show ? [bool('view_switcher'), bool('add_event')] : []),
    ]),
    color('background_color'),
  ];
}
