/**
 * Action schema rows.
 */

import { mdiGestureTapButton } from '@mdi/js';

import type * as Types from '../../../config/types';
import * as Helpers from '../../../utils/helpers';
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
 * Whether a tap on an event opens Home Assistant's event dialog.
 *
 * Optional chaining on purpose: a bare `event_tap_action:` in YAML is `null`, which the card
 * reads as nothing on tap, so the editor must too.
 *
 * @param config - Merged configuration
 * @returns `true` when the event tap action is `details`
 */
function opensEventDetails(config: Readonly<Types.Config>): boolean {
  const eventTapAction: Types.ActionConfig | null | undefined = config.event_tap_action;
  return eventTapAction?.action === 'details';
}

/**
 * Builds the Actions & Refresh panel schema.
 *
 * The card's two gestures lead, as they always have, and the event's own tap follows the
 * hold rather than the tap it is named after: the hold still runs on an event, so all
 * three describe what a finger on the card does, and the event tap is the one that only
 * fires over part of it.
 *
 * No sub-headings, although "card taps" against "event taps" is the obvious split. The
 * hold belongs to both, so a heading over either half would misfile it — and a heading
 * over the actions forces one over the refresh pair too, where `Refresh` above `Refresh
 * Interval` and `Refresh On Navigation` is a stutter. The panel title already names both
 * halves, and the event tap's own label already sets it apart from the card's two.
 *
 * @param opensDetails - Whether a tap on an event opens Home Assistant's event dialog,
 *   which is what the two `allow_event_*` switches depend on
 * @returns The panel's schema
 */
const actionsSchema = Helpers.memoizeLast((opensDetails: boolean): HaFormSchema[] => [
  { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
  { name: 'hold_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
  { name: 'event_tap_action', selector: { ui_action: { actions: EVENT_ACTION_OPTIONS } } },
  // Dependent on purpose: they narrow what the event dialog offers, and with any other
  // event tap action there is no dialog, so always-visible switches would be inert.
  // Directly under the dropdown that reveals them, which is a single field rather than a
  // row, so nothing can come between the two on a narrow viewport.
  ...(opensDetails ? [bool('allow_event_edit'), bool('allow_event_delete')] : []),
  number('refresh_interval', 1, undefined, 'min'),
  bool('refresh_on_navigate'),
]);

/**
 * Builds the Actions & Refresh panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildActionsSchema(ctx: SchemaCtx): HaFormSchema[] {
  return actionsSchema(opensEventDetails(ctx.config));
}
