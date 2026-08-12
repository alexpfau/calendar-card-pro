/**
 * The Card & Title panel — the card itself, and the heading above it.
 *
 * The smallest panel, and the only one whose fields are all optional: a card with no
 * title is the common case, and the two styling fields exist to make one that has a
 * title look right rather than to make one appear.
 */

import { mdiCardText } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { color, row, text } from './common';

/** Icon for the panel. */
export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Title panel schema.
 *
 * Constant, so there is nothing to memoise: no field here is gated on another value,
 * and none of them differs by view.
 *
 * @param _ctx - Schema context, unused
 * @returns The panel's schema
 */
export function buildCardSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return [
    text('title'),
    row(text('title_font_size'), color('title_color')),
    color('background_color'),
  ];
}
