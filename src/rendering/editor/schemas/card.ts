/**
 * Card-level schema assembly.
 */

import { mdiButtonCursor, mdiCardText } from '@mdi/js';

import { ACTION_OPTIONS } from './actions';
import * as Config from '../../../config/config';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx, SubformDef } from '../panels';
import { blockScope, bool, color, heading, row, select, text } from './common';
import { LEGEND_EDITOR_VALUES } from '../normalize';

export const CARD_ICON = mdiCardText;

/** The leading icon of each toolbar button's panel: one icon for every button, not its own. */
export const TOOLBAR_BUTTON_ICON = mdiButtonCursor;

/**
 * Where the toolbar's own buttons are written, and the path their fields' strings are filed
 * under: `toolbar.buttons.icon` and the rest.
 */
export const TOOLBAR_BUTTON_PATH: ReadonlyArray<string> = ['toolbar', 'buttons'];

/** What a button the editor adds holds: an icon, so the card draws it at once. */
export const NEW_TOOLBAR_BUTTON: Readonly<Record<string, unknown>> = {
  icon: 'mdi:gesture-tap-button',
};

/**
 * One toolbar button's fields, in the order a button is read: what it shows, what it is called,
 * what it acts on, and what a press does. The action offers what the card's own `tap_action`
 * offers, its own actions first, `back` among them, then Home Assistant's.
 *
 * @returns The fields, each in a form of its own per button
 */
export function buildToolbarButtonSchema(): HaFormSchema[] {
  return [
    { name: 'icon', required: true, selector: { icon: {} } },
    text('name'),
    { name: 'entity', selector: { entity: {} } },
    { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
  ];
}

/**
 * The schemas the Card & Header panel renders outside its own form: a button's fields, under the
 * sub-heading that captions every button's panel.
 *
 * The panels sit under the toolbar's switches, after them, so they claim nothing that follows a
 * heading of their own. The sub-heading leads the declared schema, so `check:i18n` reconciles its
 * string with the fields it captions and it always precedes one; the editor draws it once above
 * every button's panel, and the fields in each (`_renderToolbarButtons`). Declared whether or not
 * the toolbar is shown, as the calendars' fields are, so the gate sees them for every card; the
 * editor draws them only while it is.
 *
 * @param _ctx - Schema context, unused
 * @returns The buttons' sub-form
 */
export function cardSubforms(_ctx: SchemaCtx): SubformDef[] {
  return [
    { path: TOOLBAR_BUTTON_PATH, schema: [heading('heading'), ...buildToolbarButtonSchema()] },
  ];
}

/**
 * Builds the Card & Header panel schema.
 *
 * The title and the card's own background first, then the toolbar under a sub-heading of
 * its own that closes the panel. The heading is there to say what the switches under it
 * are: the first turns the whole toolbar on or off, and only while it is on is the rest
 * offered. Then each control in the order the toolbar is read: the top row from its start to
 * its end (the calendar filter, add, the view switcher, reset and refresh), then the date
 * navigation, which sits in the row under it beside the month. The filter leads because its default form
 * is the button that leads the top row. Nothing may follow the toolbar's fields, because a
 * heading claims whatever comes after it; that is why the background sits above it rather
 * than last. The toolbar's own buttons, a list rather than a switch, are edited below the form
 * in a panel each, under a sub-heading of their own (`cardSubforms`): after the switches, as
 * each button is narrower than any of them, and only while the toolbar is shown.
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
