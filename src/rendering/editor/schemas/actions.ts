/**
 * Action schema rows.
 */

import { mdiGestureTapButton } from '@mdi/js';

import { CARD_ACTION_VALUES, EVENT_DETAILS_ACTION } from '../../../config/constants';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, number, select } from './common';

export const ACTIONS_ICON = mdiGestureTapButton;

/**
 * Actions this card implements itself, which Home Assistant cannot know about.
 *
 * `expand` has been honored by `handleAction` since long before the editor was
 * schema-driven, but the v4 rebuild swapped a hand-written dropdown for HA's `ui_action`
 * selector and stopped offering it. The runtime kept working throughout, so this only
 * ever failed the people configuring the card through the UI. `refresh` loads the events
 * again now, as the toolbar's refresh button does. `add-event` opens Home Assistant's
 * new-event dialog on the day the press landed on. `reset` brings the card back to its
 * configuration on this device, as the toolbar's reset button does.
 */
export const CARD_ACTIONS = CARD_ACTION_VALUES;

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
 * Actions only an event takes, which Home Assistant cannot know about and the card's own
 * dropdowns do not offer: `details` opens the tapped event's dialog.
 */
export const EVENT_ACTIONS = [EVENT_DETAILS_ACTION] as const;

/**
 * Every action the card names itself in Home Assistant's dropdowns, which have no string for
 * them: the card's own and the event's own. The label wrapper answers for exactly these, and
 * `check:i18n` roots their strings on this list, so an action leaving it takes its string's
 * reachability with it rather than leaving a translated name for an option nothing offers.
 */
export const LABELED_ACTIONS: ReadonlyArray<string> = [...CARD_ACTIONS, ...EVENT_ACTIONS];

/**
 * Every action the event tap and hold dropdowns offer: the event's own first, then Home
 * Assistant's, which run with the tapped event's fields filled in.
 *
 * Home Assistant's selector rather than a plain dropdown, since an event now runs any of Home
 * Assistant's actions, and its selector is what shows each one's own keys (the URL, the
 * path, the action and its data) to fill in. `toggle` is left out: a calendar cannot be
 * toggled. The card's own actions are left out too, since on an event they are nothing.
 */
export const EVENT_ACTION_OPTIONS: ReadonlyArray<string> = [
  ...EVENT_ACTIONS,
  ...HA_ACTIONS.filter((action) => action !== 'toggle'),
];

/**
 * What the day tap dropdown offers, the default first. A plain dropdown rather than Home
 * Assistant's action selector, because a tap on a day does one thing of its own and the card
 * reads every other action as `none`; that selector would offer Home Assistant's whole list,
 * none of it about a day. Nothing stores nothing; see `day_tap_action_mode` in
 * `SYNTHETIC_FIELDS`.
 */
export const DAY_TAP_CHOICES = ['none', 'add-event'] as const;

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
 * Builds the Actions & Refresh panel schema.
 *
 * Coarse to fine, by what a press lands on: the card's two gestures lead, as they always
 * have, then the day's tap, then the event's tap and hold. Each narrower target takes its
 * press from the card's action only where it has one of its own, so read top to bottom the
 * panel says what a press does on the whole card, then where it does something else.
 *
 * No sub-headings, although "card", "day" and "event" are the obvious split. A heading
 * over the actions forces one over the refresh pair too, where `Refresh` above `Refresh
 * Interval` and `Refresh On Navigation` is a stutter. The panel title already names both
 * halves, and the day's and event's own labels already set them apart from the card's two.
 *
 * @param language - Effective language code
 * @param opensDetails - Whether a tap or a hold on an event opens its dialog, which is what
 *   the two `allow_event_*` switches depend on
 * @param eventActs - Whether a tap or a hold on an event runs something of its own, which
 *   keeps `open_links` out
 * @returns The panel's schema
 */
const actionsSchema = Helpers.memoizeLast(
  (language: string, opensDetails: boolean, eventActs: boolean): HaFormSchema[] => [
    { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    { name: 'hold_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
    select(language, 'day_tap_action_mode', DAY_TAP_CHOICES),
    { name: 'event_tap_action', selector: { ui_action: { actions: EVENT_ACTION_OPTIONS } } },
    { name: 'event_hold_action', selector: { ui_action: { actions: EVENT_ACTION_OPTIONS } } },
    // What a press on an event's text can do when the event does nothing of its own: follow a
    // link in it. Here rather than with the location and the description, because it is a
    // question of what a press does, and it competes with the two dropdowns above: shown only
    // while both are Nothing, directly under them, as the two switches below are shown only
    // while one opens details.
    ...(eventActs ? [] : [bool('open_links')]),
    // Dependent on purpose: they narrow what the event dialog offers, and without details
    // there is no dialog, so always-visible switches would be inert. Directly under the two
    // dropdowns that reveal them, each a single field rather than a row, so nothing can come
    // between them on a narrow viewport.
    ...(opensDetails ? [bool('allow_event_edit'), bool('allow_event_delete')] : []),
    number('refresh_interval', 1, undefined, 'min'),
    bool('refresh_on_navigate'),
  ],
);

/**
 * Builds the Actions & Refresh panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildActionsSchema(ctx: SchemaCtx): HaFormSchema[] {
  return actionsSchema(
    ctx.language,
    Synthetic.eventOpensDetails(ctx.config),
    Synthetic.eventHasOwnAction(ctx.config),
  );
}
