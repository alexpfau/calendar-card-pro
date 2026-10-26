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
 * are: the first turns the whole toolbar on or off, and only while it is on is the rest
 * offered. Labels come next, because they apply to every control in the bar; then each
 * control with a switch of its own, in the order the toolbar is read: navigation leads,
 * then the view switcher, reset, refresh and add, which is always last in the bar, then the legend,
 * whose chips sit in a lane under it. Nothing may follow the toolbar's fields, because a
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
            bool('navigation'),
            bool('view_switcher'),
            bool('reset'),
            bool('refresh'),
            bool('add_event'),
            bool('legend'),
          ]
        : []),
    ]),
  ];
}
