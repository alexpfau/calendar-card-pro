/**
 * Card-level schema assembly.
 */

import { mdiCardText } from '@mdi/js';

import * as Config from '../../../config/config';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { blockScope, bool, color, heading, row, text } from './common';

export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Header panel schema.
 *
 * The title and the card's own background first, then the toolbar under a sub-heading of
 * its own that closes the panel. The heading is there to say what the switches under it
 * are: the first turns the whole toolbar on or off, and only while it is on are the
 * controls offered, each with a switch of its own. Later controls join that list in the
 * toolbar's own order. Nothing may follow the toolbar's fields, because a heading claims
 * whatever comes after it; that is why the background sits above it rather than last.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildCardSchema(ctx: SchemaCtx): HaFormSchema[] {
  const toolbar = Config.resolveToolbar(ctx.config);

  return [
    text('title'),
    row(text('title_font_size'), color('title_color')),
    color('background_color'),
    heading('heading_toolbar'),
    blockScope('toolbar', [
      bool('show'),
      ...(toolbar.show ? [bool('view_switcher'), bool('add_event')] : []),
    ]),
  ];
}
