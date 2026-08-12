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
 * old editor guarded that with `event.type !== 'change'`, deferring the write until
 * blur (`editor.ts:575`). `<ha-form>` fires **one** `value-changed` for the whole form
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

/** Today, as `YYYY-MM-DD` in local time. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Whether a configured value counts as set. */
function isSet(value: unknown): boolean {
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
      if (value === 'fixed') {
        return {
          changes: {
            height:
              isSet(config.height) && config.height !== 'auto'
                ? config.height
                : FALLBACK_BOUNDED_HEIGHT,
            max_height: undefined,
          },
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
        };
      }

      return { changes: { height: undefined, max_height: undefined } };
    },
  },

  start_date_mode: {
    derive: (config) => startDateMode(config),
    apply: (value, config) => {
      // Every branch discards text held for the offset field. Leaving it would show
      // the abandoned keystrokes again the moment the user came back to this mode.
      const discardOffset = { start_date_offset: null };

      if (value === 'fixed') {
        const current = String(config.start_date ?? '');
        const match = FIXED_DATE_PATTERN.exec(current.trim());
        return { changes: { start_date: match ? match[1] : todayIso() }, pending: discardOffset };
      }

      if (value === 'offset') {
        const current = String(config.start_date ?? '').trim();
        const carried = current !== '' && !FIXED_DATE_PATTERN.test(current) ? current : null;
        return { changes: { start_date: carried ?? INITIAL_OFFSET }, pending: discardOffset };
      }

      return { changes: { start_date: undefined }, pending: discardOffset };
    },
  },

  start_date_fixed: {
    derive: (config) => {
      const match = FIXED_DATE_PATTERN.exec(String(config.start_date ?? '').trim());
      return match ? match[1] : '';
    },
    apply: (value) => ({
      changes: { start_date: value === '' ? undefined : value },
      pending: { start_date_offset: null },
    }),
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
