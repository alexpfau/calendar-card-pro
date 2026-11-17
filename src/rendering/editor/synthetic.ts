/**
 * Synthetic UI fields for config values that cannot bind directly to one form selector.
 * Pending values preserve text that is invalid while being typed, so the field does not disappear mid-edit.
 */

import * as Config from '../../config/config';
import {
  COUNTDOWN_ONCE_PER_DAY,
  DUPLICATES_IGNORE_LOCATION,
  EVENT_DETAILS_ACTION,
} from '../../config/constants';
import * as Types from '../../config/types';
import { eventActionKind } from '../../interaction/event-action-kind';
import { CARD_LANGUAGES } from '../../translations/language-codes';
import * as EntityColors from '../../utils/entity-colors';
import * as Helpers from '../../utils/helpers';
import * as StartDate from '../../utils/start-date';
import * as AccentText from '../accent-text';

/**
 * Raw form text, keyed by field name and qualified by storage scope in the workspace router.
 */
export type PendingValues = Readonly<Record<string, string>>;

interface SyntheticApplyResult {
  changes: Readonly<Record<string, unknown>>;
  pending?: Readonly<Record<string, string | null>>;
}

interface SyntheticField {
  /** Real options this control writes; used for routing, pending text, and reset actions. */
  readonly configKeys: ReadonlyArray<string>;
  /**
   * Reads the field's value out of the configuration.
   *
   * @param config - Current configuration
   * @returns The value to show in the form
   */
  derive(config: Readonly<Types.Config>): unknown;
  /**
   * Turns a user edit into configuration changes.
   *
   * @param value - Value the form produced
   * @param config - Current configuration
   * @returns Config changes, and any text to hold uncommitted
   */
  apply(value: unknown, config: Readonly<Types.Config>): SyntheticApplyResult;
  /**
   * A switch that refines another control's option rather than owning it: Leave Out Repeated
   * Countdowns reads `show_countdown`, which the Countdown chip writes. The line belongs to that
   * control, so the switch holds a value of its own only where the line derives it on
   * (`refinementHolds`), and its reset writes its off value instead of deleting the line, which
   * would turn the refined control off too (`reset.ts` › `resetRefinement`).
   */
  readonly refines?: true;
}

const FIXED_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

const FALLBACK_BOUNDED_HEIGHT = '300px';

const INITIAL_OFFSET = '+0';

const INITIAL_INDICATOR_ICON = 'mdi:calendar-today';

const INITIAL_INDICATOR_CUSTOM = '⭐';

/** What "Custom color" starts from when the card was following Home Assistant. */
const INITIAL_ACCENT_COLOR = Config.DEFAULT_CONFIG.accent_color;

const BUILT_IN_INDICATORS = ['tile', 'dot', 'pulse', 'glow'] as const;

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether a configured value counts as set.
 *
 * @param value - Value to test
 * @returns `true` when the value is neither absent nor empty
 */
export function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Whether a `start_date` expression is one the card can resolve.
 *
 * @param value - Text as typed
 * @returns `true` when the value can be committed to the config
 */
export function isCommittableOffset(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }

  if (FIXED_DATE_PATTERN.test(value.trim())) {
    return true;
  }

  return StartDate.parseStartDateExpression(value, 1, new Date()).kind === 'ok';
}

/**
 * Whether a today-indicator value is one the card would render as typed.
 *
 * @param value - Text as typed
 * @returns `true` when the value can be committed to the config
 */
function isCommittableIndicator(value: string): boolean {
  const type = Helpers.getTodayIndicatorType(value);
  return type === 'image' || type === 'emoji';
}

/** The start-date choices, in the order the overview's chips offer them. */
export const START_DATE_MODES = [
  'default',
  'tomorrow',
  'start_of_week',
  'fixed',
  'offset',
] as const;

export type StartDateMode = (typeof START_DATE_MODES)[number];

/** What Tomorrow writes; `+1` reads back as Tomorrow too. */
const TOMORROW = 'today+1';

/** What Start of Week writes: the anchor the card resolves (`start-date.ts` › `ANCHOR_START_OF_WEEK`). */
const START_OF_WEEK = 'start_of_week';

/**
 * The shortcut a stored expression reads as: `today+1` and `+1` as Tomorrow, `start_of_week` as
 * Start of Week, each exactly as written apart from surrounding space.
 *
 * @param value - Stored `start_date`
 * @returns The shortcut, or undefined for any other value
 */
function startDateShortcut(value: string): 'tomorrow' | 'start_of_week' | undefined {
  const text = value.trim();
  if (text === TOMORROW || text === '+1') return 'tomorrow';
  if (text === START_OF_WEEK) return 'start_of_week';
  return undefined;
}

/**
 * Derives the start-date mode from the shape of the stored value.
 *
 * @param config - Current configuration
 * @returns Which of the start-date choices applies
 */
export function startDateMode(config: Readonly<Types.Config>): StartDateMode {
  const value = config.start_date;

  if (!isSet(value)) return 'default';
  const text = String(value);
  if (FIXED_DATE_PATTERN.test(text.trim())) return 'fixed';
  return startDateShortcut(text) ?? 'offset';
}

/**
 * The synthetic mode fields: those a choice of presentation can be held for (section 3.9), as
 * `start_date_mode` holds Relative to Today over a value that reads as a shortcut.
 */
export const MODE_FIELDS: ReadonlyArray<string> = ['start_date_mode'];

/** What a mode reads from: the configuration, and the mode choices held for its scope. */
export interface ModeCtx {
  readonly config: Readonly<Types.Config>;
  /** Held mode choices by mode field name, for the context's scope (`SchemaCtx.presentation`). */
  readonly presentation?: Readonly<Record<string, string>>;
}

/**
 * A mode as the editor presents it: the choice held for it where there is one, which a value
 * readable as two modes needs, else the mode the stored value reads as. Builders read a mode
 * through this so the field a held mode reveals is built while the form shows that mode.
 *
 * @param ctx - The configuration and the held choices
 * @param name - The mode field's name
 * @param derive - How the stored value reads
 * @returns The mode
 */
export function modeFor<T extends string>(
  ctx: ModeCtx,
  name: string,
  derive: (config: Readonly<Types.Config>) => T,
): T {
  return (ctx.presentation?.[name] as T | undefined) ?? derive(ctx.config);
}

/**
 * Derives the height mode from which of the two height keys is set.
 *
 * @param config - Current configuration
 * @returns Which height control applies
 */
export function heightMode(config: Readonly<Types.Config>): 'auto' | 'fixed' | 'maximum' {
  if (isSet(config.height) && config.height !== 'auto') return 'fixed';
  if (isSet(config.max_height) && config.max_height !== 'none') return 'maximum';
  return 'auto';
}

/** Language's one dropdown: Follow Home Assistant, then every language the card speaks. */
export const LANGUAGE_CHOICES: ReadonlyArray<string> = ['system', ...CARD_LANGUAGES];

/**
 * Derives the language the card names, as Language's dropdown offers it: a language the card
 * speaks, in any case, else Home Assistant's, which is what the card falls back to for a code
 * it does not speak.
 *
 * @param config - Current configuration
 * @returns `system`, or a card language's code
 */
export function languageMode(config: Readonly<Types.Config>): string {
  const code = typeof config.language === 'string' ? config.language.trim().toLowerCase() : '';
  return (CARD_LANGUAGES as ReadonlyArray<string>).includes(code) ? code : 'system';
}

/**
 * Derives the today-indicator style from the shape of the stored value.
 *
 * @param config - Current configuration
 * @returns Which indicator control applies
 */
export function todayIndicatorStyle(
  config: Readonly<Types.Config>,
): 'none' | 'tile' | 'dot' | 'pulse' | 'glow' | 'icon' | 'custom' {
  const type = Helpers.getTodayIndicatorType(config.today_indicator);

  if (type === 'mdi') return 'icon';
  if (type === 'image' || type === 'emoji') return 'custom';

  return type as 'none' | 'tile' | 'dot' | 'pulse' | 'glow';
}

/**
 * Derives how much of a location's country the card removes.
 *
 * @param config - Current configuration
 * @returns Which location-country control applies
 */
export function locationCountryMode(config: Readonly<Types.Config>): 'keep' | 'builtin' | 'custom' {
  const value = config.remove_location_country;

  if (value === true || value === 'true') return 'builtin';
  if (value === false || value === 'false' || value === undefined) return 'keep';
  return 'custom';
}

/**
 * Derives whether the card names its own accent color or defers to Home Assistant.
 *
 * Two modes rather than three, unlike the per-calendar control: nothing sits above the card
 * to inherit from, so an "inherit" option would be a synonym for "custom, at the default".
 *
 * @param config - Current configuration
 * @returns Which accent-color control applies
 */
export function accentColorMode(config: Readonly<Types.Config>): 'custom' | 'home_assistant' {
  return EntityColors.isEntityColorSentinel(config.accent_color) ? 'home_assistant' : 'custom';
}

/**
 * Whether a tap or a hold on an event opens its dialog, which is what the two `allow_event_*`
 * switches narrow. A bare `event_tap_action:` in YAML is `null`, which opens nothing.
 *
 * @param config - Current configuration
 * @returns Whether either event action is `details`
 */
export function eventOpensDetails(config: Readonly<Types.Config>): boolean {
  const tap: Types.ActionConfig | null | undefined = config.event_tap_action;
  const hold: Types.ActionConfig | null | undefined = config.event_hold_action;
  return tap?.action === EVENT_DETAILS_ACTION || hold?.action === EVENT_DETAILS_ACTION;
}

/**
 * Whether a tap or a hold on an event runs something of its own, which is what keeps links out
 * of event rows: `open_links` reaches only events with neither. Read as the card reads the two
 * (`eventActionKind`), so `none`, a bare action and the card's own actions all count as none.
 *
 * @param config - Current configuration
 * @returns Whether either event action runs something
 */
export function eventHasOwnAction(config: Readonly<Types.Config>): boolean {
  return (
    eventActionKind(config.event_tap_action) !== 'none' ||
    eventActionKind(config.event_hold_action) !== 'none'
  );
}

/**
 * Derives what a tap on a day does, as the editor's two-choice dropdown shows it. `add-event`
 * is the one value the card acts on, and it reads every other value as `none`: Home
 * Assistant's actions, and a bare `day_tap_action:` in YAML, which is `null`. So does this, or
 * the dropdown would claim a choice it does not offer.
 *
 * @param config - Current configuration
 * @returns Which of the two choices applies
 */
export function dayTapActionMode(config: Readonly<Types.Config>): 'none' | 'add-event' {
  const dayTapAction: Types.ActionConfig | null | undefined = config.day_tap_action;
  return dayTapAction?.action === 'add-event' ? 'add-event' : 'none';
}

/** The duplicate filter's choices, in the order its dropdown lists them: off, then strictest. */
export const FILTER_DUPLICATES_MODES = ['off', 'exact', DUPLICATES_IGNORE_LOCATION] as const;

/**
 * Derives which events count as copies, as the editor's three-choice dropdown shows it.
 * `ignore_location` is the one string the card reads as a mode of its own, and it treats any
 * other truthy value as `true`. So does this, or the dropdown would say off while the card
 * filtered.
 *
 * @param value - Configured `filter_duplicates`, already resolved for the view
 * @returns Which of the three choices applies
 */
export function filterDuplicatesMode(value: unknown): (typeof FILTER_DUPLICATES_MODES)[number] {
  if (value === DUPLICATES_IGNORE_LOCATION) return DUPLICATES_IGNORE_LOCATION;
  return value ? 'exact' : 'off';
}

/**
 * Reads the entity id out of an entry that may be a bare string or a config object.
 *
 * @param entry - One member of the `entities` array
 * @returns The entity id, or an empty string for an entry that has none
 */
export function entityIdOf(entry: string | Types.EntityConfig): string {
  return typeof entry === 'string' ? entry : (entry?.entity ?? '');
}

/**
 * The color mode the all-day badge is in, read off the value's shape.
 *
 * Takes the value rather than the config, unlike `accentColorMode` beside it, because this
 * key is view-overridable: the caller resolves it through the view first, and handing the
 * whole config here would quietly read the card level while the panel described a column.
 *
 * @param value - Configured `allday_badge_color`, already resolved for the view
 * @returns Which color control the badge renders
 */
export function alldayBadgeColorMode(value: unknown): string {
  const resolved = Helpers.resolveAlldayBadgeColor(value);
  return resolved.source;
}

/**
 * Whether every governed color in the supplied form projection is the accent sentinel.
 * The workspace projection resolves inheritance before deriving any synthetic field.
 *
 * @param config - Current configuration
 * @returns `true` when every governed option is the sentinel
 */
export function accentEventText(config: Readonly<Types.Config>): boolean {
  return AccentText.ACCENT_TEXT_KEYS.every((key) =>
    EntityColors.isAccentTextSentinel(config[key as keyof Types.Config]),
  );
}

export const SYNTHETIC_FIELDS: Readonly<Record<string, SyntheticField>> = {
  height_mode: {
    configKeys: ['height', 'max_height'],
    derive: (config) => heightMode(config),
    apply: (value, config) => {
      const discardHeights = { card_height: null, card_max_height: null };

      if (value === 'fixed') {
        return {
          changes: {
            height:
              isSet(config.height) && config.height !== 'auto'
                ? config.height
                : FALLBACK_BOUNDED_HEIGHT,
            max_height: undefined,
          },
          pending: discardHeights,
        };
      }

      if (value === 'maximum') {
        return {
          changes: {
            height: undefined,
            max_height:
              isSet(config.max_height) && config.max_height !== 'none'
                ? config.max_height
                : FALLBACK_BOUNDED_HEIGHT,
          },
          pending: discardHeights,
        };
      }

      return {
        changes: { height: undefined, max_height: undefined },
        pending: discardHeights,
      };
    },
  },

  card_height: {
    configKeys: ['height'],
    derive: (config) => (heightMode(config) === 'fixed' ? String(config.height) : ''),
    apply: (value) => {
      const text = String(value ?? '');
      return text === ''
        ? { changes: {}, pending: { card_height: text } }
        : { changes: { height: text }, pending: { card_height: null } };
    },
  },

  card_max_height: {
    configKeys: ['max_height'],
    derive: (config) => (heightMode(config) === 'maximum' ? String(config.max_height) : ''),
    apply: (value) => {
      const text = String(value ?? '');
      return text === ''
        ? { changes: {}, pending: { card_max_height: text } }
        : { changes: { max_height: text }, pending: { card_max_height: null } };
    },
  },

  /**
   * Start Date's five choices. Tomorrow and Start of Week write their expressions, and a value
   * already reading as the chosen shortcut is kept as written (`+1` stays `+1`). Relative to Today
   * over a shortcut writes nothing, since the expression is already there to edit; it holds
   * `offset` as the presentation mode instead, or the shortcut it reads as would press its own
   * chip again and the Expression field would never appear (section 3.9).
   */
  start_date_mode: {
    configKeys: ['start_date'],
    derive: (config) => startDateMode(config),
    apply: (value, config) => {
      const discardDates = {
        start_date_offset: null,
        start_date_fixed: null,
        start_date_mode: null,
      };
      const current = String(config.start_date ?? '').trim();

      if (value === 'tomorrow' || value === 'start_of_week') {
        const kept = startDateShortcut(current) === value;
        const written = value === 'tomorrow' ? TOMORROW : START_OF_WEEK;
        return {
          changes: { start_date: kept ? config.start_date : written },
          pending: discardDates,
        };
      }

      if (value === 'fixed') {
        const match = FIXED_DATE_PATTERN.exec(current);
        return { changes: { start_date: match ? match[1] : todayIso() }, pending: discardDates };
      }

      if (value === 'offset') {
        const carried = current !== '' && !FIXED_DATE_PATTERN.test(current) ? current : null;
        const held = carried !== null && startDateShortcut(carried) !== undefined;
        return {
          changes: { start_date: carried ?? INITIAL_OFFSET },
          pending: { ...discardDates, start_date_mode: held ? 'offset' : null },
        };
      }

      return { changes: { start_date: undefined }, pending: discardDates };
    },
  },

  start_date_fixed: {
    configKeys: ['start_date'],
    derive: (config) => {
      const match = FIXED_DATE_PATTERN.exec(String(config.start_date ?? '').trim());
      return match ? match[1] : '';
    },
    apply: (value) => {
      const text = String(value ?? '');
      return text === ''
        ? { changes: {}, pending: { start_date_fixed: text, start_date_offset: null } }
        : {
            changes: { start_date: text },
            pending: { start_date_fixed: null, start_date_offset: null },
          };
    },
  },

  start_date_offset: {
    configKeys: ['start_date'],
    // A shortcut is an expression too: shown here while Relative to Today is held over it.
    derive: (config) => {
      const mode = startDateMode(config);
      return mode === 'default' || mode === 'fixed' ? '' : String(config.start_date);
    },
    // Typed into while Relative to Today is chosen, a value that reads as a shortcut holds that
    // choice, or typing `+10` would pass through `+1`, press Tomorrow and take the field away.
    apply: (value): SyntheticApplyResult => {
      const text = String(value ?? '');

      return isCommittableOffset(text)
        ? {
            changes: { start_date: text },
            pending: {
              start_date_offset: null,
              start_date_mode: startDateShortcut(text) === undefined ? null : 'offset',
            },
          }
        : { changes: {}, pending: { start_date_offset: text } };
    },
  },

  language_mode: {
    configKeys: ['language'],
    derive: (config) => languageMode(config),
    apply: (value) =>
      typeof value === 'string' && value !== 'system'
        ? { changes: { language: value } }
        : { changes: { language: undefined } },
  },

  time_format: {
    configKeys: ['time_24h'],
    derive: (config) => {
      if (config.time_24h === 'system') return 'system';
      return config.time_24h === true ? '24' : '12';
    },
    apply: (value) => {
      if (value === '24') return { changes: { time_24h: true } };
      if (value === '12') return { changes: { time_24h: false } };
      return { changes: { time_24h: 'system' } };
    },
  },

  /**
   * `allday_badge` names a position, and `off` is one of its three values rather than an
   * absence — so the control is a dropdown and `off` derives from anything the resolver does
   * not recognize, including a legacy boolean.
   *
   * Applying `off` writes `undefined` rather than the string, which clears the key back to
   * the default instead of pinning it to a value that happens to equal the default. That is
   * what keeps `toStoredConfig` from writing a line of YAML for a user who opened the
   * dropdown and closed it again.
   *
   * The treatment lives in `allday_badge_style`, a real config key with no synthetic: it is a
   * plain closed-set string with no off value to encode, so the schema selects it by name.
   */
  allday_badge_position: {
    configKeys: ['allday_badge'],
    derive: (config) => Helpers.resolveAlldayBadgePosition(config.allday_badge) ?? 'off',
    apply: (value) =>
      value === 'off' || typeof value !== 'string'
        ? { changes: { allday_badge: undefined } }
        : { changes: { allday_badge: value } },
  },

  week_number_mode: {
    configKeys: ['show_week_numbers'],
    derive: (config) => config.show_week_numbers ?? 'none',
    apply: (value) =>
      value === 'iso' || value === 'simple'
        ? { changes: { show_week_numbers: value } }
        : { changes: { show_week_numbers: undefined } },
  },

  /**
   * `filter_duplicates` as a dropdown, because its third value leaves the location out of the
   * comparison and a switch has only two positions. Every choice stores itself, `false`
   * included, the way `time_format` stores `time_24h`.
   */
  filter_duplicates_mode: {
    configKeys: ['filter_duplicates'],
    derive: (config) => filterDuplicatesMode(config.filter_duplicates),
    apply: (value) =>
      value === DUPLICATES_IGNORE_LOCATION
        ? { changes: { filter_duplicates: DUPLICATES_IGNORE_LOCATION } }
        : { changes: { filter_duplicates: value === 'exact' } },
  },

  /**
   * Leaving out repeated countdowns refines `show_countdown` rather than adding a key of its own,
   * as `ignore_location` refines `filter_duplicates`: on, it stores `once_per_day`, off, `true`.
   * Offered only while countdowns are on, so off never turns them off. The Show Countdown switch
   * reads either value as on.
   */
  countdown_once_per_day: {
    configKeys: ['show_countdown'],
    refines: true,
    derive: (config) => config.show_countdown === COUNTDOWN_ONCE_PER_DAY,
    apply: (value) => ({ changes: { show_countdown: value ? COUNTDOWN_ONCE_PER_DAY : true } }),
  },

  location_country_mode: {
    configKeys: ['remove_location_country'],
    derive: (config) => locationCountryMode(config),
    apply: (value, config) => {
      if (value === 'builtin') return { changes: { remove_location_country: true } };

      if (value === 'custom') {
        const current = config.remove_location_country;
        const carried =
          typeof current === 'string' && current !== 'true' && current !== 'false' ? current : '';
        return { changes: { remove_location_country: carried } };
      }

      return { changes: { remove_location_country: undefined } };
    },
  },

  accent_color_mode: {
    configKeys: ['accent_color'],
    derive: (config) => accentColorMode(config),
    apply: (value, config) => {
      if (value === 'home_assistant') {
        return { changes: { accent_color: EntityColors.ENTITY_COLOR_SENTINEL } };
      }

      // Carry the current value when it is already a color, the way `start_date_mode`
      // carries an offset: only a value that cannot survive the move is replaced.
      const current = String(config.accent_color ?? '');
      const carried = EntityColors.isEntityColorSentinel(current) ? INITIAL_ACCENT_COLOR : current;

      return { changes: { accent_color: carried || INITIAL_ACCENT_COLOR } };
    },
  },

  /**
   * Which color the all-day badge is drawn in.
   *
   * The two keywords store themselves; `custom` means the stored value is a color, so it
   * has no spelling of its own and the mode is read back off the value's shape. That is the
   * same contract `accent_color_mode` has, and it is why neither writes its own name.
   *
   * 🚨 `derive` reads the RAW card-level key, and so does the schema's gate. `apply` writes
   * the card level — a column override is edited in the `column:` block — so anything
   * resolved through the view would show a column's value in a control whose next keystroke
   * overwrote the card's. `locationCountryMode` is raw for the same reason, and for the same
   * cause: both are a mode dropdown paired with a value field, and the pair has to agree
   * about which level it is describing.
   */
  allday_badge_color_mode: {
    configKeys: ['allday_badge_color'],
    derive: (config) => alldayBadgeColorMode(config.allday_badge_color),
    apply: (value, config) => {
      if (value === 'accent' || value === 'text') {
        return { changes: { allday_badge_color: value } };
      }

      // Carry a color already stored, exactly as the accent mode above does, so switching
      // away and back does not discard what the user picked. The accent default is the seed
      // because it is the color the badge was already being drawn in.
      const current = Helpers.resolveAlldayBadgeColor(config.allday_badge_color);
      const carried = current.source === 'custom' ? current.color : '';

      return { changes: { allday_badge_color: carried || INITIAL_ACCENT_COLOR } };
    },
  },

  /**
   * One switch for "draw event text in each calendar's own color".
   *
   * Sugar over the five governed options, and deliberately **not** a stored boolean: its
   * state is recomputed from those options every time, so a user who edits one of them by
   * hand cannot leave a switch claiming otherwise. There is no second source of truth to
   * drift.
   *
   * This emits one layer of changes. The workspace router chooses their destination;
   * mirroring them into a view block here would also overwrite unrelated shared values.
   *
   * Switching it off restores the shipped defaults rather than whatever was there before.
   * Carrying the old values would mean storing them, which is the second source of truth
   * this field exists to avoid; the helper text says so.
   */
  accent_event_text: {
    configKeys: AccentText.ACCENT_TEXT_KEYS,
    derive: (config) => accentEventText(config),
    apply: (value) => {
      const on = value === true;
      const changes: Record<string, unknown> = {};

      for (const key of AccentText.ACCENT_TEXT_KEYS) {
        changes[key] = on
          ? EntityColors.ACCENT_TEXT_SENTINEL
          : Config.DEFAULT_CONFIG[key as keyof Types.Config];
      }

      return { changes };
    },
  },

  location_country_pattern: {
    configKeys: ['remove_location_country'],
    derive: (config) => {
      const value = config.remove_location_country;
      return locationCountryMode(config) === 'custom' ? String(value) : '';
    },
    apply: (value) => ({ changes: { remove_location_country: String(value ?? '') } }),
  },

  today_indicator_style: {
    configKeys: ['today_indicator'],
    derive: (config) => todayIndicatorStyle(config),
    apply: (value, config) => {
      const discardText = { today_indicator_custom: null };
      const current = String(config.today_indicator ?? '');

      if (value === 'icon') {
        return {
          changes: {
            today_indicator: Helpers.isIconValue(current) ? current : INITIAL_INDICATOR_ICON,
          },
          pending: discardText,
        };
      }

      if (value === 'custom') {
        const carried =
          todayIndicatorStyle(config) === 'custom' ? current : INITIAL_INDICATOR_CUSTOM;
        return { changes: { today_indicator: carried }, pending: discardText };
      }

      if ((BUILT_IN_INDICATORS as ReadonlyArray<string>).includes(String(value))) {
        return { changes: { today_indicator: value }, pending: discardText };
      }

      // `false`, not removing the key: the shipped default is the tile, so an absent key
      // would draw one, and "None" would snap back to "Date Tile" on the next derivation.
      return { changes: { today_indicator: false }, pending: discardText };
    },
  },

  today_indicator_icon: {
    configKeys: ['today_indicator'],
    derive: (config) =>
      todayIndicatorStyle(config) === 'icon' ? String(config.today_indicator) : '',
    apply: (value) => {
      const icon = String(value ?? '');
      return icon === ''
        ? { changes: {}, pending: { today_indicator_icon: icon } }
        : { changes: { today_indicator: icon }, pending: { today_indicator_icon: null } };
    },
  },

  today_indicator_custom: {
    configKeys: ['today_indicator'],
    derive: (config) =>
      todayIndicatorStyle(config) === 'custom' ? String(config.today_indicator) : '',
    apply: (value) => {
      const text = String(value ?? '');

      return isCommittableIndicator(text)
        ? { changes: { today_indicator: text }, pending: { today_indicator_custom: null } }
        : { changes: {}, pending: { today_indicator_custom: text } };
    },
  },

  /**
   * The day tap dropdown, two choices over an action object.
   *
   * Add Event stores `{ action: add-event }` whole, dropping anything an action the card no
   * longer runs left beside it. Nothing removes the key rather than storing `{ action: none }`,
   * the default, which would be a line of YAML that says nothing. Any other stored action
   * derives as Nothing, so the dropdown never claims a choice it does not offer, and a write
   * from it never stores one either.
   */
  day_tap_action_mode: {
    configKeys: ['day_tap_action'],
    derive: (config) => dayTapActionMode(config),
    apply: (value) =>
      value === 'add-event'
        ? { changes: { day_tap_action: { action: 'add-event' } } }
        : { changes: { day_tap_action: undefined } },
  },
};

/**
 * Whether a form key is UI-only.
 *
 * @param key - Key from the form data
 * @returns `true` when the key must never reach the configuration
 */
export function isSyntheticKey(key: string): boolean {
  return Helpers.hasOwn(SYNTHETIC_FIELDS, key);
}

/**
 * The real options controlled by a form field.
 *
 * @param name - Schema field name
 * @returns Declared synthetic targets, or the ordinary option itself
 */
export function configKeysForField(name: string): ReadonlyArray<string> {
  return isSyntheticKey(name) ? SYNTHETIC_FIELDS[name].configKeys : [name];
}

/**
 * Whether a stored value gives a refinement (`SyntheticField.refines`) a value of its own: it
 * derives otherwise than the card's default does. `show_countdown: true` is the Countdown chip's
 * line, and leaves Leave Out Repeated Countdowns off; only `once_per_day` turns it on.
 *
 * @param name - Schema field name
 * @param key - The option the value is stored for
 * @param value - The stored value
 * @returns Whether it holds a value of its own; `undefined` for a field that refines nothing
 */
export function refinementHolds(name: string, key: string, value: unknown): boolean | undefined {
  if (!isSyntheticKey(name)) return undefined;
  const field = SYNTHETIC_FIELDS[name];
  if (!field.refines) return undefined;
  const stored = { ...Config.DEFAULT_CONFIG, [key]: value } as Types.Config;
  return field.derive(stored) !== field.derive(Config.DEFAULT_CONFIG);
}

/**
 * Builds the synthetic half of the form data.
 *
 * @param config - Current configuration
 * @param pending - Uncommitted text, keyed by field name
 * @returns Synthetic keys and their values, ready to merge into the form data
 */
export function deriveSyntheticData(
  config: Readonly<Types.Config>,
  pending: PendingValues = {},
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(SYNTHETIC_FIELDS)) {
    data[name] = name in pending ? pending[name] : field.derive(config);
  }

  return data;
}

/**
 * Applies a change to a synthetic field.
 *
 * @param name - Synthetic field name
 * @param value - Value the form produced
 * @param config - Current configuration
 * @returns Config changes, and any text to hold uncommitted
 */
export function applySyntheticChange(
  name: string,
  value: unknown,
  config: Readonly<Types.Config>,
): SyntheticApplyResult {
  return SYNTHETIC_FIELDS[name].apply(value, config);
}
