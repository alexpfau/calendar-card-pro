/**
 * Action schema rows.
 */

import * as Config from '../../../config/config';
import {
  ADD_EVENT_ACTION,
  CARD_ACTION_VALUES,
  EVENT_DETAILS_ACTION,
} from '../../../config/constants';
import { VIEWS } from '../../../config/views';
import * as Helpers from '../../../utils/helpers';
import { fullSizeConfig } from '../full-size';
import type { HaFormSchema } from '../ha-form';
import { LEGEND_EDITOR_VALUES } from '../normalize';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { blockScope, bool, multiSelect, number, select } from './common';

/**
 * Actions this card implements itself, which Home Assistant cannot know about.
 *
 * `expand` has been honored by `handleAction` since long before the editor was
 * schema-driven, but the v4 rebuild swapped a hand-written dropdown for HA's `ui_action`
 * selector and stopped offering it. The runtime kept working throughout, so this only
 * ever failed the people configuring the card through the UI. `refresh` loads the events
 * again now, as the toolbar's refresh button does. `add-event` opens Home Assistant's
 * new-event dialog on the day the press landed on. `reset` brings the card back to its
 * configuration on this device, as the toolbar's reset button does. `overlay` opens the card full
 * size over the dashboard, and `back` goes back to the page before this one.
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
 * Every action the day tap dropdown offers: adding an event on the day first, then Home
 * Assistant's, which run with the tapped day's date and times filled in.
 *
 * Home Assistant's selector, as for an event, since it is what shows each action's own keys
 * (the URL, the path, the action and its data) to fill in. `toggle` is left out, as there: a
 * calendar cannot be toggled. The card's other own actions are left out too, since on a day they
 * are nothing (`dayActionKind`).
 */
export const DAY_ACTION_OPTIONS: ReadonlyArray<string> = [
  ADD_EVENT_ACTION,
  ...HA_ACTIONS.filter((action) => action !== 'toggle'),
];

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
 * The full-size card's toolbar controls, under `overlay.toolbar`, while its toolbar is shown: the
 * card's own controls in the card's order, each named as the card's is, but Open Full Size, which
 * the full-size card never draws (`config/overlay.ts` › `withoutOverlayAction`), and its own
 * buttons, which stay YAML's.
 *
 * @param language - Effective language code
 * @param switcher - Whether the full-size toolbar draws its view switcher
 * @returns The controls
 */
function fullSizeToolbarControls(language: string, switcher: boolean): HaFormSchema[] {
  return [
    select(language, 'legend', LEGEND_EDITOR_VALUES, 'toolbar.legend'),
    bool('add_event'),
    bool('view_switcher'),
    bool('reset'),
    bool('refresh'),
    bool('search'),
    bool('navigation'),
    // Which layouts the switcher offers matters only while it is on.
    ...(switcher ? [multiSelect(language, 'view_switcher_layouts', VIEWS, 'view')] : []),
    select(language, 'size', Config.TOOLBAR_SIZE_VALUES, 'toolbar.size'),
  ];
}

/**
 * Builds the Actions & Refresh panel schema.
 *
 * Coarse to fine, by what a press lands on: the card's two gestures lead, as they always
 * have, then the day's tap, then the event's tap and hold. Each narrower target takes its
 * press from the card's action only where it has one of its own, so read top to bottom the
 * panel says what a press does on the whole card, then where it does something else.
 *
 * @param language - Effective language code
 * @param opensDetails - Whether a tap or a hold on an event opens its dialog, which is what
 *   the two `allow_event_*` switches depend on
 * @param eventActs - Whether a tap or a hold on an event runs something of its own, which
 *   keeps `open_links` out
 * @param fullSizeToolbar - Whether the card opened full size shows its toolbar, which its
 *   controls depend on
 * @param fullSizeSwitcher - Whether that toolbar draws its view switcher, which the layouts it
 *   offers depend on
 * @returns The panel's schema
 */
const actionsSchema = Helpers.memoizeLast(
  (
    language: string,
    opensDetails: boolean,
    eventActs: boolean,
    fullSizeToolbar: boolean,
    fullSizeSwitcher: boolean,
  ): HaFormSchema[] => [
    // Named as the card's, on keys of their own: `tap_action` and `hold_action` stay the terms
    // other labels are built on (Day Tap Action, a toolbar button's Tap Action).
    {
      name: 'tap_action',
      titleKey: 'card_tap_action',
      selector: { ui_action: { actions: ACTION_OPTIONS } },
    },
    {
      name: 'hold_action',
      titleKey: 'card_hold_action',
      selector: { ui_action: { actions: ACTION_OPTIONS } },
    },
    { name: 'day_tap_action', selector: { ui_action: { actions: DAY_ACTION_OPTIONS } } },
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
    // dropdowns that reveal them.
    ...(opensDetails ? [bool('allow_event_edit'), bool('allow_event_delete')] : []),
    // What the card opens full size with, drawn on the Full Size page rather than here: its layout,
    // its days and its toolbar, offered whatever opens it, a tap, a hold or a toolbar button. Every
    // other option of the overlay is YAML's, listed on that page.
    blockScope('overlay', [
      select(language, 'view', VIEWS, 'view'),
      number('days_to_show', 1),
      // Its own key: the card's Show Toolbar names the card's toolbar. The controls are named as
      // the card's are (`toolbar.*`), since they are the same controls.
      blockScope('toolbar', [
        { ...bool('show'), titleKey: 'overlay.toolbar.show' },
        ...(fullSizeToolbar ? fullSizeToolbarControls(language, fullSizeSwitcher) : []),
      ]),
    ]),
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
  const fullSize = Config.resolveToolbar(
    fullSizeConfig(ctx.config as unknown as Record<string, unknown>),
  );
  return actionsSchema(
    ctx.language,
    Synthetic.eventOpensDetails(ctx.config),
    Synthetic.eventHasOwnAction(ctx.config),
    fullSize.show,
    fullSize.show && fullSize.viewSwitcher,
  );
}
