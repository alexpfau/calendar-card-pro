/**
 * Action schema rows.
 */

import { mdiGestureTapButton } from '@mdi/js';

import * as Config from '../../../config/config';
import * as Types from '../../../config/types';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import { bool, number, select } from './common';

export const ACTIONS_ICON = mdiGestureTapButton;

/**
 * Actions this card implements itself, which Home Assistant cannot know about.
 *
 * `expand` has been honored by `handleAction` since long before the editor was
 * schema-driven, but the v4 rebuild swapped a hand-written dropdown for HA's `ui_action`
 * selector and stopped offering it. The runtime kept working throughout, so this only
 * ever failed the people configuring the card through the UI.
 */
export const CARD_ACTIONS = ['expand'] as const;

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

/** Every action the tap and hold dropdowns offer, card-specific ones first. */
export const ACTION_OPTIONS: ReadonlyArray<string> = [...CARD_ACTIONS, ...HA_ACTIONS];

/**
 * String key naming one card-specific action in the editor's own table.
 *
 * Home Assistant labels its own actions, so only the card's need a string here — which is
 * why this is keyed on the action rather than on the field. Both dropdowns resolve the
 * same key, because both offer the same action and it means the same thing in each.
 *
 * @param action - A card-specific action value
 * @returns The option-label key for that action
 */
export function cardActionLabelKey(action: string): string {
  return `card_action.option.${action}.label`;
}

/**
 * The add-event controls, each shown only once it would do something.
 *
 * The style and size are inert while the button is off, and the size is inert in the
 * header, where the button is always a small icon — so neither is offered then.
 *
 * @param config - Merged configuration
 * @returns The toggle, and whichever of its modifiers currently apply
 */
function addEventFields(config: Readonly<Types.Config>, language: string): HaFormSchema[] {
  if (config.show_add_event !== true) return [bool('show_add_event')];

  const style = Config.resolveAddEventStyle(config.add_event_style);

  return [
    bool('show_add_event'),
    select(language, 'add_event_style', Config.ADD_EVENT_STYLES),
    ...(style === 'header' ? [] : [select(language, 'add_event_size', Config.ADD_EVENT_SIZES)]),
  ];
}

/**
 * Builds the Actions & Refresh panel schema.
 *
 * The add-event button sits between the card's own gestures and the refresh settings:
 * it is another way of acting on the card, and it is what triggers the one refresh the
 * card does on the user's behalf rather than on a timer.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildActionsSchema(ctx: SchemaCtx): HaFormSchema[] {
  return [
    { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    { name: 'hold_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    ...addEventFields(ctx.config, ctx.language),
    number('refresh_interval', 1, undefined, 'min'),
    bool('refresh_on_navigate'),
  ];
}
