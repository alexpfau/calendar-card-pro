/**
 * Card-level schema assembly.
 */

import { mdiCardText } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, color, row, text } from './common';

export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Title panel schema.
 *
 * The header's options first, then the card's own. The add-event button lives in the
 * header, beside the title or in a row of its own when there is none, so it follows the
 * title's options rather than the card-wide background. Later header controls belong in
 * the same run.
 *
 * @param _ctx - Schema context, unused
 * @returns The panel's schema
 */
export function buildCardSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return [
    text('title'),
    row(text('title_font_size'), color('title_color')),
    bool('show_add_event'),
    color('background_color'),
  ];
}
