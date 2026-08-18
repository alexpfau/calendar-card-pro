/**
 * Card-level schema assembly.
 */

import { mdiCardText } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { color, row, text } from './common';

export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Title panel schema.
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
