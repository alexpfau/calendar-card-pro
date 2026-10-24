/**
 * Action schema rows.
 */

import { mdiGestureTapButton } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, number } from './common';

export const ACTIONS_ICON = mdiGestureTapButton;

/**
 * Actions this card implements itself, which Home Assistant cannot know about.
 *
 * `expand` has been honored by `handleAction` since long before the editor was
 * schema-driven, but the v4 rebuild swapped a hand-written dropdown for HA's `ui_action`
 * selector and stopped offering it. The runtime kept working throughout, so this only
 * ever failed the people configuring the card through the UI.
 *
 * `details` opens Home Assistant's dialog for one event, so only `event_tap_action` offers
 * it; see the two option lists below.
 */
export const CARD_ACTIONS = ['expand', 'details'] as const;

/**
 * Home Assistant's own action list, mirrored because there is no way to append to it.
 *
 * `hui-action-editor` resolves its list as `this.actions ?? DEFAULT_ACTIONS` — a
 * replacement, not a merge — so naming one card action means naming all of them. The cost
 * is that an action Home Assistant adds later will not appear until this list is updated;
 * the consolation is that it stays configurable in YAML meanwhile, which is exactly where
 * every card-specific action already sits.
 */
const HA_ACTIONS = [
  'more-info',
  'toggle',
  'navigate',
  'url',
  'perform-action',
  'assist',
  'none',
] as const;

/**
 * Every action the tap and hold dropdowns offer, the card-specific one first.
 *
 * Not `details`: a tap on the card has no event to open.
 */
export const ACTION_OPTIONS: ReadonlyArray<string> = ['expand', ...HA_ACTIONS];

/**
 * Every action the event tap dropdown offers, the card-specific one first.
 *
 * Not `expand`: it acts on the whole card, which the card's own tap already offers, and a tap
 * meant for one event that folds the card instead would be a surprise. Written in YAML it
 * still works, as the card's expand.
 */
export const EVENT_ACTION_OPTIONS: ReadonlyArray<string> = ['details', ...HA_ACTIONS];

/**
 * String key naming one card-specific action in the editor's own table.
 *
 * Home Assistant labels its own actions, so only the card's need a string here — which is
 * why this is keyed on the action rather than on the field. Every dropdown offering an
 * action resolves the same key, because the action means the same thing in each.
 *
 * @param action - A card-specific action value
 * @returns The option-label key for that action
 */
export function cardActionLabelKey(action: string): string {
  return `card_action.option.${action}.label`;
}

/**
 * Builds the Actions & Refresh panel schema.
 *
 * The add-event button sits between the card's own gestures and the refresh settings:
 * it is another way of acting on the card, and it is what triggers the one refresh the
 * card does on the user's behalf rather than on a timer.
 *
 * @param _ctx - Schema context, unused
 * @returns The panel's schema
 */
export function buildActionsSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return [
    { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    { name: 'hold_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    { name: 'event_tap_action', selector: { ui_action: { actions: EVENT_ACTION_OPTIONS } } },
    // Placed here provisionally so `check:i18n` sees the strings referenced; the step that
    // reworks this panel decides where they belong.
    bool('allow_event_edit'),
    bool('allow_event_delete'),
    bool('show_add_event'),
    number('refresh_interval', 1, undefined, 'min'),
    bool('refresh_on_navigate'),
  ];
}
