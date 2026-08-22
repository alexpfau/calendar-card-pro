/**
 * Synthetic UI fields for config values that cannot bind directly to one form selector.
 * Pending values preserve text that is invalid while being typed, so the field does not disappear mid-edit.
 */

import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as EntityColors from '../../utils/entity-colors';
import * as Helpers from '../../utils/helpers';
import * as StartDate from '../../utils/start-date';

/**
 * Uncommitted text, keyed by synthetic field name.
 */
export type PendingValues = Readonly<Record<string, string>>;

interface SyntheticApplyResult {
  changes: Readonly<Record<string, unknown>>;
  pending?: Readonly<Record<string, string | null>>;
}

interface SyntheticField {
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
}

const FIXED_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

const FALLBACK_BOUNDED_HEIGHT = '300px';

const INITIAL_OFFSET = '+0';

const INITIAL_LANGUAGE = 'en';

const INITIAL_INDICATOR_ICON = 'mdi:calendar-today';

const INITIAL_INDICATOR_CUSTOM = '⭐';

/** What "Custom color" starts from when the card was following Home Assistant. */
const INITIAL_ACCENT_COLOR = Config.DEFAULT_CONFIG.accent_color;

const BUILT_IN_INDICATORS = ['dot', 'pulse', 'glow'] as const;

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

/**
 * Derives the start-date mode from the shape of the stored value.
 *
 * @param config - Current configuration
 * @returns Which of the three start-date controls applies
 */
export function startDateMode(config: Readonly<Types.Config>): 'default' | 'fixed' | 'offset' {
  const value = config.start_date;

  if (!isSet(value)) return 'default';
  return FIXED_DATE_PATTERN.test(String(value).trim()) ? 'fixed' : 'offset';
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

/**
 * Derives whether the card follows Home Assistant's language or names its own.
 *
 * @param config - Current configuration
 * @returns Which language control applies
 */
export function languageMode(config: Readonly<Types.Config>): 'system' | 'custom' {
  return config.language !== undefined && config.language !== null ? 'custom' : 'system';
}

/**
 * Derives the today-indicator style from the shape of the stored value.
 *
 * @param config - Current configuration
 * @returns Which indicator control applies
 */
export function todayIndicatorStyle(
  config: Readonly<Types.Config>,
): 'none' | 'dot' | 'pulse' | 'glow' | 'icon' | 'custom' {
  const type = Helpers.getTodayIndicatorType(config.today_indicator);

  if (type === 'mdi') return 'icon';
  if (type === 'image' || type === 'emoji') return 'custom';

  return type as 'none' | 'dot' | 'pulse' | 'glow';
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
 * Reads the entity id out of an entry that may be a bare string or a config object.
 *
 * @param entry - One member of the `entities` array
 * @returns The entity id, or an empty string for an entry that has none
 */
export function entityIdOf(entry: string | Types.EntityConfig): string {
  return typeof entry === 'string' ? entry : (entry?.entity ?? '');
}

export const SYNTHETIC_FIELDS: Readonly<Record<string, SyntheticField>> = {
  height_mode: {
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
    derive: (config) => (heightMode(config) === 'fixed' ? String(config.height) : ''),
    apply: (value) => {
      const text = String(value ?? '');
      return text === ''
        ? { changes: {}, pending: { card_height: text } }
        : { changes: { height: text }, pending: { card_height: null } };
    },
  },

  card_max_height: {
    derive: (config) => (heightMode(config) === 'maximum' ? String(config.max_height) : ''),
    apply: (value) => {
      const text = String(value ?? '');
      return text === ''
        ? { changes: {}, pending: { card_max_height: text } }
        : { changes: { max_height: text }, pending: { card_max_height: null } };
    },
  },

  start_date_mode: {
    derive: (config) => startDateMode(config),
    apply: (value, config) => {
      const discardDates = { start_date_offset: null, start_date_fixed: null };

      if (value === 'fixed') {
        const current = String(config.start_date ?? '');
        const match = FIXED_DATE_PATTERN.exec(current.trim());
        return { changes: { start_date: match ? match[1] : todayIso() }, pending: discardDates };
      }

      if (value === 'offset') {
        const current = String(config.start_date ?? '').trim();
        const carried = current !== '' && !FIXED_DATE_PATTERN.test(current) ? current : null;
        return { changes: { start_date: carried ?? INITIAL_OFFSET }, pending: discardDates };
      }

      return { changes: { start_date: undefined }, pending: discardDates };
    },
  },

  start_date_fixed: {
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
    derive: (config) => (startDateMode(config) === 'offset' ? String(config.start_date) : ''),
    apply: (value) => {
      const text = String(value ?? '');

      return isCommittableOffset(text)
        ? { changes: { start_date: text }, pending: { start_date_offset: null } }
        : { changes: {}, pending: { start_date_offset: text } };
    },
  },

  language_mode: {
    derive: (config) => languageMode(config),
    apply: (value, config) =>
      value === 'custom'
        ? {
            changes: { language: isSet(config.language) ? config.language : INITIAL_LANGUAGE },
          }
        : { changes: { language: undefined } },
  },

  time_format: {
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
   * `allday_badge` stores `false` or one of the four treatments, so the editor needs a
   * dropdown rather than a toggle. `off` is derived from anything that is not a known
   * treatment — including a legacy `true`, which resolves to `tinted` the same way the
   * renderer resolves it, so the control agrees with the card.
   */
  allday_badge_mode: {
    derive: (config) => Helpers.resolveAlldayBadgeMode(config.allday_badge) ?? 'off',
    apply: (value) =>
      value === 'off' || typeof value !== 'string'
        ? { changes: { allday_badge: undefined } }
        : { changes: { allday_badge: value } },
  },

  week_number_mode: {
    derive: (config) => config.show_week_numbers ?? 'none',
    apply: (value) =>
      value === 'iso' || value === 'simple'
        ? { changes: { show_week_numbers: value } }
        : { changes: { show_week_numbers: undefined } },
  },

  location_country_mode: {
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

  location_country_pattern: {
    derive: (config) => {
      const value = config.remove_location_country;
      return locationCountryMode(config) === 'custom' ? String(value) : '';
    },
    apply: (value) => ({ changes: { remove_location_country: String(value ?? '') } }),
  },

  today_indicator_style: {
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

      return { changes: { today_indicator: undefined }, pending: discardText };
    },
  },

  today_indicator_icon: {
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
    derive: (config) =>
      todayIndicatorStyle(config) === 'custom' ? String(config.today_indicator) : '',
    apply: (value) => {
      const text = String(value ?? '');

      return isCommittableIndicator(text)
        ? { changes: { today_indicator: text }, pending: { today_indicator_custom: null } }
        : { changes: {}, pending: { today_indicator_custom: text } };
    },
  },

  calendars: {
    // One row per calendar, not one per block. The picker answers "which calendars does
    // this card show"; the per-calendar panels below answer "how many blocks, and what is
    // on each". Deriving 1:1 made the picker answer both and agree with itself on
    // neither — a duplicate could be seen there and cleared there, but never added there,
    // because Home Assistant's picker refuses to hold one entity twice.
    //
    // A Set keeps first-occurrence order, which is the only ordering anything downstream
    // reads: `deduplicateEvents` walks `config.entities` and matches on `event._entityId`,
    // so a second block of the same id finds every signature already seen and contributes
    // nothing — priority under `filter_duplicates` is fixed by an id's *first* position.
    // `fetchEvents` skips an id it has already fetched, and `getPrimaryEntityId` reads
    // `entities[0]`. Collapsing `[a, b, c, b]` to `[a, b, b, c]` therefore changes nothing
    // observable: b still precedes c, and entities[0] is untouched.
    derive: (config) => [...new Set((config.entities ?? []).map(entityIdOf))],
    apply: (value, config) => {
      const ids = Array.isArray(value) ? value.map((id) => String(id)) : [];

      // Listing the same calendar twice is supported and meaningful — each block
      // carries its own label, colour and limits. A Map keyed by entity ID kept
      // only the last block for a repeated ID, so re-opening the picker rewrote
      // every earlier duplicate with the last one's settings. Queue the blocks
      // per ID so each keeps its own config.
      const existing = new Map<string, Array<string | Types.EntityConfig>>();
      for (const entry of config.entities ?? []) {
        const id = entityIdOf(entry);
        const queue = existing.get(id);
        if (queue) {
          queue.push(entry);
        } else {
          existing.set(id, [entry]);
        }
      }

      // Each row emits that calendar's *whole* queue, because one row now stands for
      // however many blocks the calendar has. Shifting one off instead would silently
      // drop the rest, which is what makes this the half that cannot be changed alone.
      // Clearing a row therefore drops every block for that calendar, which is the
      // model the picker now presents; removing a single block is the panel's own
      // Remove action.
      const used = new Set<string>();

      return {
        changes: {
          entities: ids.flatMap((id) => {
            // The picker cannot emit an id twice, but this keeps the function total
            // rather than duplicating a queue if anything else ever calls it.
            if (used.has(id)) return [];
            used.add(id);

            return existing.get(id) ?? [id];
          }),
        },
      };
    },
  },
};

/**
 * Whether a form key is UI-only.
 *
 * @param key - Key from the form data
 * @returns `true` when the key must never reach the configuration
 */
export function isSyntheticKey(key: string): boolean {
  return key in SYNTHETIC_FIELDS;
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
