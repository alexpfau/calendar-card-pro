/**
 * The Actions & Refresh panel — what a tap does, and how often the data is re-read.
 *
 * The panel with the largest deletion behind it and the least code in front of it.
 * Tap and hold actions were seventy-seven lines of hand-written renderer in the old
 * editor — a select over the action types, then a different field set per type, then a
 * JSON text box for service data that silently discarded anything that did not parse.
 * `ui_action` is Home Assistant's own control for exactly that shape, and it emits the
 * whole action object at once, which is also why `value.ts` keeps or drops an action
 * whole rather than stripping its members.
 */

import { mdiGestureTapButton } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, number } from './common';

/** Icon for the panel. */
export const ACTIONS_ICON = mdiGestureTapButton;

/**
 * Builds the Actions & Refresh panel schema.
 *
 * Constant: nothing here is gated on another value or differs by view.
 *
 * @param _ctx - Schema context, unused
 * @returns The panel's schema
 */
export function buildActionsSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return [
    { name: 'tap_action', selector: { ui_action: {} } },
    { name: 'hold_action', selector: { ui_action: {} } },
    number('refresh_interval', 1, undefined, 'min'),
    bool('refresh_on_navigate'),
  ];
}
