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
import { eventActionKind } from '../interaction/event-action-kind';
import * as Helpers from '../utils/helpers';

/**
 * What the overlay assumes where the card says nothing: a tap or a drag on a day adds an event
 * there, so its Grid draws one, as `day_tap_action: add-event` does. A card that sets a
 * `day_tap_action` of its own keeps it, and so does the `overlay:` block.
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
 * The card's event actions, which the overlay's card takes only where they run something on an
 * event. One that leaves a press on an event to the card's own `tap_action` or `hold_action`
 * (`eventActionKind`: `none`, or one of the card's own actions) is left out, so the overlay's
 * card takes its default: a tap on an event opens it, as on a card that never set one, and a
 * hold runs nothing either way. A card whose every tap opens the overlay sets
 * `event_tap_action: none` for the small card, and that tap becomes `none` inside the overlay
 * (`withoutOverlayAction`), which would leave its events doing nothing there. The `overlay:` block
 * may set either again, `none` included.
 */
const EVENT_ACTION_OPTIONS: ReadonlyArray<string> = ['event_tap_action', 'event_hold_action'];

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
 * (`HA_CARD_KEYS`), its size, its compact limits, its day count and the event actions that leave
 * an event's press to the card (`EVENT_ACTION_OPTIONS`); then the overlay's defaults
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
  for (const key of EVENT_ACTION_OPTIONS) {
    if (eventActionKind(base[key] as Types.ActionConfig | null | undefined) === 'none') {
      delete base[key];
    }
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
