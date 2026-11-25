/**
 * The configuration of the card an overlay opens (`rendering/overlay.ts`): the card's own, in the
 * layout and with the options its `overlay:` block names.
 *
 * Built from the configuration exactly as Home Assistant hands it to `setConfig`, before defaults
 * are merged in, so the overlay's card merges its defaults the way any card does. Free of Lit and
 * the DOM, so it is tested on its own.
 */

import * as Config from './config';
import * as Constants from './constants';
import type * as Types from './types';
import * as ViewConfig from './view';
import { VIEWS } from './views';
import { dayActionKind } from '../interaction/day-actions';
import { eventActionKind } from '../interaction/event-action-kind';
import * as Helpers from '../utils/helpers';

/**
 * What the overlay assumes where the card says nothing: a tap or a drag on a day adds an event
 * there, so its Grid draws one, as `day_tap_action: add-event` does. A card's own `day_tap_action`
 * replaces it only where it runs something on a day (`PRESS_ACTIONS`), and the `overlay:` block's
 * always does, `none` included.
 */
export const OVERLAY_ASSUMES: Readonly<Record<string, unknown>> = {
  day_tap_action: { action: Constants.ADD_EVENT_ACTION },
};

/**
 * What the overlay changes in the card's configuration before its own `overlay:` block: Grid on
 * a week, with the toolbar's date navigation and a switcher offering every layout, so Month is a
 * press away. The rest of the toolbar the card asks for comes along.
 *
 * Seven days whatever the card shows (`DAY_COUNT_OPTIONS`): Grid and Columns draw as many of them
 * as fit, as on any card with the date navigation, and page by the days they draw.
 */
export const OVERLAY_DEFAULTS: Readonly<Record<string, unknown>> = {
  view: 'grid',
  days_to_show: 7,
  toolbar: {
    show: true,
    navigation: true,
    view_switcher: true,
    view_switcher_layouts: [...VIEWS],
  },
};

/**
 * The options that size the card, at the top level and in a layout's block, a compact List's
 * pair included. The overlay's card fills the overlay instead, so none of them reaches it, from
 * the card or from `overlay:`.
 */
const SIZE_OPTIONS: ReadonlyArray<string> = [
  'height',
  'max_height',
  'card_height',
  'card_max_height',
  'narrow_card_height',
  'narrow_card_max_height',
  'compact_card_height',
  'compact_card_max_height',
];

/**
 * The limits of a compact list, which make sense on a small card and not on one opened full size.
 * Left out of the card's own configuration; the `overlay:` block may set them again.
 */
const COMPACT_OPTIONS: ReadonlyArray<string> = [
  'compact_days_to_show',
  'compact_events_to_show',
  'compact_events_complete_days',
];

/**
 * The card's own day count, at the top level and in a layout's block. A small card's three days
 * would open three days full size, so the overlay takes its own week instead
 * (`OVERLAY_DEFAULTS`). Left out of the card's own configuration, a layout's block included,
 * since the editor writes a count set on a layout's page there; the `overlay:` block may set it
 * again.
 */
const DAY_COUNT_OPTIONS: ReadonlyArray<string> = ['days_to_show'];

/**
 * The card's actions for a press on an event or a day, each with whether a value runs something
 * there. The overlay's card takes the card's own only where it does; one that leaves the press to
 * the card's `tap_action` or `hold_action` (`eventActionKind`, `dayActionKind`: `none`, a bare
 * action, or one the card runs itself) is left out, so the overlay's card takes its default, as a
 * card that never set one does: a tap on an event opens it, a tap on a day adds an event there
 * (`OVERLAY_ASSUMES`), and a hold on an event runs nothing. A card whose every tap opens the
 * overlay sets such a value for the small card, and inside the overlay that tap becomes `none`
 * (`withoutOverlayAction`), which would leave its events and days doing nothing there. The
 * `overlay:` block may set any of them again, `none` included.
 */
const PRESS_ACTIONS: Readonly<Record<string, (action: Types.ActionConfig | null) => boolean>> = {
  event_tap_action: (action) => eventActionKind(action) !== 'none',
  event_hold_action: (action) => eventActionKind(action) !== 'none',
  day_tap_action: (action) => dayActionKind(action) !== 'none',
};

/**
 * Whether the overlay's card takes the card's own value of a press action (`PRESS_ACTIONS`): only
 * where it runs something on an event or a day.
 *
 * @param option - A top-level option of the card
 * @param value - The card's value of it, as written
 * @returns Whether that value reaches the overlay's card, or `undefined` for an option that is no
 *   press action, which reaches it or not by its name alone
 */
export function pressActionReaches(option: string, value: unknown): boolean | undefined {
  if (!Helpers.hasOwn(PRESS_ACTIONS, option)) return undefined;
  return PRESS_ACTIONS[option]((value ?? null) as Types.ActionConfig | null);
}

/** Every layout's block key: `list`, `column`, `time_grid`, `month`. */
const LAYOUT_BLOCK_KEYS: ReadonlyArray<string> = Object.values(ViewConfig.VIEW_BLOCKS).map(
  (block) => block.blockKey as string,
);

/**
 * A configuration without some options, at the top level and in each layout's block. A block the
 * removal empties stays, as an empty block, which reads as no block at all.
 *
 * @param config - A configuration, as written
 * @param options - The options to leave out
 * @returns A copy without them; the input is not changed
 */
function withoutOptions(
  config: Readonly<Record<string, unknown>>,
  options: ReadonlyArray<string>,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...config };
  for (const option of options) delete copy[option];
  for (const blockKey of LAYOUT_BLOCK_KEYS) {
    const block = copy[blockKey];
    if (!Helpers.isConfigBlock(block)) continue;
    const kept = { ...block };
    for (const option of options) delete kept[option];
    copy[blockKey] = kept;
  }
  return copy;
}

/**
 * Whether an action is the one that opens the overlay.
 *
 * @param action - An action as written
 * @returns True for `overlay`
 */
function opensOverlay(action: unknown): boolean {
  return Helpers.isConfigBlock(action) && action.action === Constants.OVERLAY_ACTION;
}

/**
 * Takes the overlay action out of a configuration, so the overlay's card never opens another:
 * a tap or a hold that would becomes `none`, and a toolbar button that would is left out, the
 * built-in one (`toolbar.overlay`) with the configuration's own. Close takes its place.
 *
 * @param config - A merged overlay configuration; changed in place
 */
function withoutOverlayAction(config: Record<string, unknown>): void {
  for (const key of ['tap_action', 'hold_action']) {
    if (opensOverlay(config[key])) config[key] = { action: 'none' };
  }
  const toolbar = config.toolbar;
  if (!Helpers.isConfigBlock(toolbar)) return;
  config.toolbar = {
    ...toolbar,
    overlay: false,
    ...(Array.isArray(toolbar.buttons) && {
      buttons: toolbar.buttons.filter(
        (button) => !(Helpers.isConfigBlock(button) && opensOverlay(button.tap_action)),
      ),
    }),
  };
}

/**
 * The configuration the overlay's card is given: what it assumes where the card says nothing
 * (`OVERLAY_ASSUMES`); the card's own, without its `overlay:` block, Home Assistant's own keys
 * (`HA_CARD_KEYS`), its size, its compact limits, its day count and the press actions that leave
 * the press to the card (`PRESS_ACTIONS`); then the overlay's defaults
 * (`OVERLAY_DEFAULTS`); then its `overlay:` block, which may set any option, size aside.
 * Blocks merge option by option, as `setConfig` merges a card's over the defaults, so
 * `overlay: { toolbar: { search: false } }` keeps the rest of the toolbar. The overlay action is
 * taken out last, wherever it was written.
 *
 * @param raw - The card's configuration, as written
 * @returns The overlay card's configuration, as written
 */
export function overlayConfig(raw: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const base: Record<string, unknown> = withoutOptions(raw, [
    ...SIZE_OPTIONS,
    ...COMPACT_OPTIONS,
    ...DAY_COUNT_OPTIONS,
  ]);
  delete base.overlay;
  for (const key of Constants.HA_CARD_KEYS) delete base[key];
  for (const key of Object.keys(PRESS_ACTIONS)) {
    if (pressActionReaches(key, base[key]) === false) delete base[key];
  }

  const own = Helpers.isConfigBlock(raw.overlay) ? withoutOptions(raw.overlay, SIZE_OPTIONS) : {};
  const merged = Config.mergeConfig(
    Config.mergeConfig(Config.mergeConfig(OVERLAY_ASSUMES, base), OVERLAY_DEFAULTS),
    own,
  );
  delete merged.overlay;
  withoutOverlayAction(merged);
  return merged;
}

/**
 * The layout the overlay opens in: its block's `view`, else Grid. One of the four, read as the
 * card reads `view`; anything else is Grid.
 *
 * @param config - The card's configuration
 * @returns The layout
 */
export function overlayView(config: Readonly<Pick<Types.Config, 'overlay'>>): Types.EffectiveView {
  const view = Helpers.isConfigBlock(config.overlay) ? config.overlay.view : undefined;
  return VIEWS.find((candidate) => candidate === view) ?? 'grid';
}
