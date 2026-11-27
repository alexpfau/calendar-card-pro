/**
 * Card-level schema assembly.
 */

import { mdiButtonCursor } from '@mdi/js';

import { ACTION_OPTIONS } from './actions';
import * as Config from '../../../config/config';
import { VIEWS } from '../../../config/view';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx, SubformDef } from '../panels';
import { blockScope, bool, color, multiSelect, select, text } from './common';
import { LEGEND_EDITOR_VALUES } from '../normalize';

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
 * The schemas the Card & Header panel renders outside its own form: a button's fields, drawn in
 * each button's panel (`_renderToolbarButtons`) under the heading the page registry names.
 * Declared whether or not the toolbar is shown, as the calendars' fields are, so the gate sees
 * them for every card; the editor draws them only while it is.
 *
 * @param _ctx - Schema context, unused
 * @returns The buttons' sub-form
 */
export function cardSubforms(_ctx: SchemaCtx): SubformDef[] {
  return [{ path: TOOLBAR_BUTTON_PATH, schema: buildToolbarButtonSchema() }];
}

/**
 * Builds the Card & Header panel schema: the title and the card's own background, then the
 * toolbar's switches, the first of which turns the whole toolbar on or off; only while it is on
 * are the rest offered, in the order the toolbar is read, and the layouts the View Switcher
 * offers only while it is on too.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildCardSchema(ctx: SchemaCtx): HaFormSchema[] {
  const toolbar = Config.resolveToolbar(ctx.config);

  return [
    text('title'),
    text('title_font_size'),
    color('title_color'),
    color('background_color'),
    blockScope('toolbar', [
      bool('show'),
      ...(toolbar.show
        ? [
            select(ctx.language, 'legend', LEGEND_EDITOR_VALUES, 'toolbar.legend'),
            bool('add_event'),
            bool('view_switcher'),
            bool('reset'),
            bool('refresh'),
            bool('search'),
            bool('overlay'),
            bool('navigation'),
            // Which layouts the switcher offers matters only while it is on.
            ...(toolbar.viewSwitcher
              ? [multiSelect(ctx.language, 'view_switcher_layouts', VIEWS, 'view')]
              : []),
            select(ctx.language, 'size', Config.TOOLBAR_SIZE_VALUES, 'toolbar.size'),
          ]
        : []),
    ]),
  ];
}
