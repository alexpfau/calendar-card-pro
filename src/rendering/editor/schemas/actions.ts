/**
 * Action schema rows.
 */

import { mdiGestureTapButton } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, number } from './common';

export const ACTIONS_ICON = mdiGestureTapButton;

/**
 * Builds the Actions & Refresh panel schema.
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
