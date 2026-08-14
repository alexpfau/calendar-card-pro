/**
 * Synthetic fields — UI-only keys that never reach the configuration.
 *
 * Two problems share one mechanism here.
 *
 * **Shape-derived modes.** `height_mode` and `start_date_mode` are not config keys.
 * The card stores `height` / `max_height`, and a single `start_date` that may hold
 * either an absolute date or a relative expression; the mode is *derived from the
 * shape of the value*. Home Assistant's own editors solve this by deriving the field
 * into the form data on the way in and deleting it on the way out, which is what
 * happens below. The old editor instead carried a duplicated special case in both of
 * its two change handlers per sentinel key, growing by one copy per key.
 *
 * **Values that are invalid while being typed.** This is the harder one and it is the
 * reason this module exists at all. `start_date_offset` accepts expressions such as
 * `-7`, and a user typing one passes through `-`, which is not a valid expression. The
 * editor this replaced guarded that with `event.type !== 'change'`, deferring the write
 * until blur — a guard that lived in the hand-written `editor.ts`, deleted in this
 * rebuild. `<ha-form>` fires **one** `value-changed` for the whole form
 * and gives no access to the originating DOM event, so that guard has no equivalent
 * and a naive port would write `-` to the config, re-derive the mode as something else
 * and yank the field out from under the cursor mid-edit.
 *
 * The replacement is to hold the text in editor state and commit it to the config only
 * once it parses. The intermediate value is displayed but never stored, so the mode
 * never changes and the field never moves. It is also strictly better than what it
 * replaces: the old guard needed a blur before the value took effect, whereas this
 * commits on the keystroke that completes a valid expression.
 *
 * Nothing here imports Lit or touches the DOM, so the whole mechanism is unit-testable
 * without a browser — which matters, because this is the single most likely place for
 * the rebuild to ship a regression.
 */

import * as Types from '../../config/types';
import * as Helpers from '../../utils/helpers';
import * as StartDate from '../../utils/start-date';

/**
 * Uncommitted text, keyed by synthetic field name.
 *
 * Held by the editor element for the lifetime of one editing session. A key is present
 * only while what the user has typed differs from what the config could accept.
 */
export type PendingValues = Readonly<Record<string, string>>;

/** Outcome of applying a change to a synthetic field. */
export interface SyntheticApplyResult {
  /**
   * Config keys to write. A value of `undefined` removes the key, which is how a
   * setting returns to its default rather than being pinned to the default's value.
   */
  changes: Readonly<Record<string, unknown>>;
  /**
   * Uncommitted text to hold, keyed by the field it belongs to. `null` clears that
   * field's held text; an omitted key is left alone.
   *
   * Keyed rather than implicitly attached to the field that produced the change,
   * because the two are not always the same field: switching `start_date_mode` has to
   * discard text held for `start_date_offset`, and attaching it to the changed key
   * would clear a `start_date_mode` entry that never existed while the stale offset
   * text survived to mask the new value.
   */
  pending?: Readonly<Record<string, string | null>>;
}

/** One UI-only field and the real configuration it stands for. */
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

/**
 * Matches an absolute `start_date` the date picker can represent: a plain
 * `YYYY-MM-DD`, or a full ISO timestamp whose leading date portion is captured.
 * Anything else is a relative expression and is edited as free text.
 */
const FIXED_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

/** Height used when switching to a bounded mode from one that had no measurement. */
const FALLBACK_BOUNDED_HEIGHT = '300px';

/** Offset seeded when the user picks the relative mode with nothing to carry over. */
const INITIAL_OFFSET = '+0';

/** Language seeded when the user asks for a specific one without naming it yet. */
const INITIAL_LANGUAGE = 'en';

/** Icon seeded when the today indicator is switched to an icon with none chosen. */
const INITIAL_INDICATOR_ICON = 'mdi:calendar-today';

/** Marker seeded when the today indicator is switched to a custom value. */
const INITIAL_INDICATOR_CUSTOM = '⭐';

/** The three built-in today-indicator styles, which are stored as their own names. */
const BUILT_IN_INDICATORS = ['dot', 'pulse', 'glow'] as const;

/** Today, as `YYYY-MM-DD` in local time. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether a configured value counts as set.
 *
 * Shared with `entities.ts`, which asks the same question of a per-calendar value, so
 * that "configured" means one thing across the editor's write paths rather than two
 * copies that can drift.
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
 * Delegates to the real parser rather than to a pattern of its own, so the editor
 * accepts exactly what the card accepts. A second grammar here would eventually
 * disagree with the first, and the direction it would fail in is the bad one: the
 * editor refusing to commit something the card would have understood.
 *
 * The reference date is only needed to evaluate the expression, and the result of that
 * evaluation is discarded — all that matters is whether it resolved.
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
 * The same shape of question `isCommittableOffset` asks, for the same reason.
 * `getTodayIndicatorType` answers `'dot'` for any string it does not recognise, so
 * committing a half-typed `star.png` would re-derive the style as a dot, take the text
 * field away mid-word and write the fragment to the user's configuration. Asking the
 * renderer's own classifier means the editor commits exactly when the card would agree
 * about what the value is.
 *
 * @param value - Text as typed
 * @returns `true` when the value can be committed to the config
 */
export function isCommittableIndicator(value: string): boolean {
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
 * `height` wins when both are set, matching the renderer: a fixed height is not a
 * ceiling, so a maximum alongside it can never bind.
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
 * Presence, not `isSet`, and for the reason `location_country_pattern` below reads the
 * same way: an emptied text box is a step on the way to typing another value, not a
 * request to go back to following Home Assistant. Reading `''` as *system* removed the
 * field on the keystroke that cleared it and reset the dropdown — the same defect the
 * per-calendar label had, one panel along.
 *
 * Nothing downstream has to change for `''` to be safe: `getEffectiveLanguage` already
 * tests `configLanguage.trim() !== ''`, so an empty custom language falls through to
 * Home Assistant's exactly as *system* would. The card therefore behaves the same while
 * the box is empty, and the control stays where the user left it.
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
 * Delegates the classification to `getTodayIndicatorType`, which is what the renderer
 * uses, so the editor and the card can never disagree about what a value means. The
 * renderer's seven answers collapse to six controls here: an icon and an emoji are
 * both typed, but only one of them has a picker.
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

  // 'dot' is also what the renderer answers for an unrecognised string, which is
  // exactly how it renders one — so the editor showing the dot control is honest.
  return type as 'none' | 'dot' | 'pulse' | 'glow';
}

/**
 * Derives how much of a location's country the card removes.
 *
 * The stored value is a three-way union spelled across two types: `false` keeps the
 * country, `true` removes anything on the built-in list, and any other string is a
 * pattern of the user's own.
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
 * Reads the entity id out of an entry that may be a bare string or a config object.
 *
 * @param entry - One member of the `entities` array
 * @returns The entity id, or an empty string for an entry that has none
 */
export function entityIdOf(entry: string | Types.EntityConfig): string {
  return typeof entry === 'string' ? entry : (entry?.entity ?? '');
}

/**
 * The synthetic fields this editor knows about.
 *
 * Registered centrally rather than per panel because the value handler has to
 * recognise every one of them regardless of which panel is on screen — a synthetic key
 * that reached the config would be written to the user's YAML as a phantom option.
 */
export const SYNTHETIC_FIELDS: Readonly<Record<string, SyntheticField>> = {
  height_mode: {
    derive: (config) => heightMode(config),
    apply: (value, config) => {
      // Every branch discards text held for the two measurement fields, for the same
      // reason the start-date mode discards its own: abandoned keystrokes must not
      // reappear the moment the user comes back to this mode.
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

  /**
   * The two measurements, held rather than written straight through.
   *
   * `height` and `max_height` cannot be bound to their config keys directly, because
   * the mode above is derived from *whether they are set*. Home Assistant's text
   * selector reports every keystroke and turns an emptied field into `undefined`, so
   * clearing the box to retype a value would delete the value, re-derive the mode as
   * automatic and remove the field the user was typing into — losing the measurement
   * and offering `300px` rather than what was there before on the way back.
   */
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
      // Every branch discards text held for both value fields. Leaving it would show
      // the abandoned keystrokes again the moment the user came back to this mode.
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
    // Held while empty, like the two measurements above and for the same reason: the
    // mode is derived from whether `start_date` is set, so clearing the picker to choose
    // another date would remove the key, re-derive the mode as *default* and take the
    // picker away mid-edit.
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

      // The keystroke that completes a valid expression commits it and releases the
      // held text. Anything else is displayed and nothing more, so the config keeps
      // the last value that worked and the field cannot be re-derived out of the form
      // while the user is still typing.
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
            // Seeded rather than left empty, because an empty language re-derives the
            // mode as `system` and takes the field away on the keystroke that opened it.
            changes: { language: isSet(config.language) ? config.language : INITIAL_LANGUAGE },
          }
        : { changes: { language: undefined } },
  },

  /**
   * `time_24h` holds `'system'` or a boolean, and a `select` emits neither reliably —
   * every option value it offers is a string. Mapping here keeps `'true'` out of the
   * config, which matters: the formatter tests `config.time_24h === true`, so a string
   * would silently leave the card on twelve-hour time.
   */
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
   * `show_week_numbers` uses `null` for "off", which no select option can carry — an
   * option value is a string, and the string `'null'` is a value the card would not
   * recognise. Written as `undefined` so the key leaves the configuration entirely.
   */
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

  location_country_pattern: {
    derive: (config) => {
      const value = config.remove_location_country;
      return locationCountryMode(config) === 'custom' ? String(value) : '';
    },
    // An empty pattern stays a string rather than becoming `undefined`, so the mode
    // still derives as `custom` and the field survives being cleared. The card reads
    // an empty pattern as matching nothing, which is what an empty field should mean.
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
      // Clearing the picker would re-derive the style as `none` and remove the picker
      // along with it, so an empty choice is displayed and not committed — the same
      // treatment `start_date_offset` gets, for the same reason.
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

      // Held until the value is one the renderer would recognise, because an
      // unrecognised string classifies as a plain dot — so committing `star.pn` on the
      // way to `star.png` would switch the style, remove this very field, and store the
      // fragment. Only an emoji or an image path is committed.
      return isCommittableIndicator(text)
        ? { changes: { today_indicator: text }, pending: { today_indicator_custom: null } }
        : { changes: {}, pending: { today_indicator_custom: text } };
    },
  },

  /**
   * The calendars, as a list of plain entity ids.
   *
   * `entities` accepts either a bare id or an object carrying that calendar's label,
   * colours and filters, and Home Assistant's entity selector can only bind a list of
   * ids. Deriving the ids here and matching them back by id on the way out is what
   * makes deselecting a calendar and selecting it again keep its settings, rather than
   * replacing the object with a bare string.
   */
  calendars: {
    derive: (config) => (config.entities ?? []).map(entityIdOf),
    apply: (value, config) => {
      const ids = Array.isArray(value) ? value.map((id) => String(id)) : [];
      const existing = new Map(
        (config.entities ?? []).map((entry) => [entityIdOf(entry), entry] as const),
      );

      // Order follows the picker, because order is meaningful: `filter_duplicates`
      // keeps the copy from whichever calendar is listed first.
      return { changes: { entities: ids.map((id) => existing.get(id) ?? id) } };
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
 * Held text wins over the derived value, which is what puts the user's own keystrokes
 * back in the field on re-render rather than the last value that happened to parse.
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
