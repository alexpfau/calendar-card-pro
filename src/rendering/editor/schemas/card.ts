/**
 * Card-level schema assembly.
 */

import { mdiCardText } from '@mdi/js';

import * as Config from '../../../config/config';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { blockScope, bool, color, heading, row, select, text } from './common';
import { LEGEND_EDITOR_VALUES } from '../normalize';

export const CARD_ICON = mdiCardText;

/**
 * Builds the Card & Header panel schema.
 *
 * The title and the card's own background first, then the toolbar under a sub-heading of
 * its own that closes the panel. The heading is there to say what the switches under it
 * are: the first turns the whole toolbar on or off, and only while it is on is the rest
 * offered. Labels come next, because they apply to every control in the top row; then each
 * control in the order the toolbar is read: the top row from its start to its end (the
 * calendar filter, add, the view switcher, reset and refresh), then the date navigation,
 * which sits in the row under it beside the month. The filter leads because its default form
 * is the button that leads the top row. Nothing may follow the toolbar's fields, because a
 * heading claims whatever comes after it; that is why the background sits above it rather
 * than last.
 *
 * The heading stays while the toolbar is off, with Show Toolbar as the only field under it.
 * That reads close to the stutter a heading repeating its only field makes, and it is kept
 * on purpose: the maintainer chose it, so the section says where the toolbar lives before
 * anyone turns it on. Do not make the heading conditional on the switch.
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
      ...(toolbar.show
        ? [
            bool('labels'),
            select(ctx.language, 'legend', LEGEND_EDITOR_VALUES, 'toolbar.legend'),
            bool('add_event'),
            bool('view_switcher'),
            bool('reset'),
            bool('refresh'),
            bool('navigation'),
          ]
        : []),
    ]),
  ];
}
