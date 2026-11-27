/**
 * Filling what a press landed on into one of Home Assistant's actions, before the card hands it
 * over: `url_path: https://example.com/?q={title}` for an event, `data: { date: '{date}' }` for a
 * day.
 *
 * The rules are the event's (`event-actions.ts`), shared here so a day's action is filled by the
 * same code. Each caller names its fields and which of them are free text: text someone other
 * than the dashboard's owner may have written, which fills only where it cannot change what the
 * action does. A day has none.
 */

import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The keys whose value is part of a URL, where a field's value is percent-encoded. */
const URL_KEYS: ReadonlySet<string> = new Set(['url_path', 'navigation_path']);

/** Keys whose whole subtree is the action's payload, where free text may go. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set(['data', 'service_data']);

/** Schemes a `url` action may open once a field has been filled into its URL. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https']);

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * Fills one kind of press's fields into an action, or answers undefined where it must not run.
 *
 * @param action - The action as configured, one Home Assistant runs
 * @param fields - Each field's value
 * @returns The action to run, or undefined when it must not run
 */
export type ActionFiller<Field extends string> = (
  action: Types.ActionConfig,
  fields: Record<Field, string>,
) => Types.ActionConfig | undefined;

/** Where a string sits in the action, which decides what may be filled into it. */
interface Place {
  /** The key the string sits under. */
  key: string | undefined;
  /** Whether the string is inside the action's payload, where free text may go. */
  payload: boolean;
}

/** Thrown, and caught by the filler, when free text would land outside the payload. */
class OutsidePayload extends Error {}

//-----------------------------------------------------------------------------
// FILLING
//-----------------------------------------------------------------------------

/**
 * The first index of any of several characters, or `Infinity` when none occurs.
 *
 * @param text - Text to search
 * @param chars - Characters to find
 * @returns The lowest index found
 */
function firstIndexOf(text: string, chars: ReadonlyArray<string>): number {
  const found = chars.map((char) => text.indexOf(char)).filter((index) => index >= 0);
  return found.length ? Math.min(...found) : Infinity;
}

/**
 * The scheme a URL opens with, lowercased, or undefined for a path or a relative URL.
 *
 * @param url - A URL as an action holds it
 * @returns The scheme, without its colon
 */
function urlScheme(url: string): string | undefined {
  return /^\s*([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
}

/**
 * A filler for one kind of press: the fields it names in braces, and which of them are free
 * text.
 *
 * Every string in the action is filled, at any depth, except the name of the action itself, so a
 * field can never choose which action runs. Keys are never filled. A field that is not free text
 * fills anywhere. A free-text one fills only into the payload: anything under `data` or
 * `service_data`, a confirmation's `text`, and the query or fragment of `url_path` or
 * `navigation_path`; an action that puts one anywhere else does not run, rather than running with
 * it left unfilled and failing somewhere less obvious. In a URL, everything before the first `?`
 * or `#` is the scheme, the host and the path, which decide where it leads, and each field is
 * percent-encoded there, so it stays one query value. A name in braces that is not a field is
 * left as written.
 *
 * A `url` action whose URL had a field filled into it must open over http or https or be a path,
 * so a field cannot ride on a `javascript:` URL the configuration itself wrote.
 *
 * @param names - The fields, as the braces name them
 * @param freeText - Those whose text may be anyone's
 * @returns The filler
 */
export function actionFiller<Field extends string>(
  names: ReadonlyArray<Field>,
  freeText: ReadonlySet<Field>,
): ActionFiller<Field> {
  const pattern = new RegExp(`\\{(${names.join('|')})\\}`, 'g');

  const fillString = (
    text: string,
    fields: Record<Field, string>,
    place: Place,
  ): { text: string; filled: boolean } => {
    const isUrl = place.key !== undefined && URL_KEYS.has(place.key);
    const freeFrom = isUrl ? firstIndexOf(text, ['?', '#']) : place.payload ? 0 : Infinity;

    let filled = false;
    const result = text.replace(pattern, (_match, name: Field, offset: number) => {
      if (freeText.has(name) && offset < freeFrom) throw new OutsidePayload();
      filled = true;
      const value = fields[name];
      return isUrl ? encodeURIComponent(value) : value;
    });
    return { text: result, filled };
  };

  const fillValue = (
    value: unknown,
    fields: Record<Field, string>,
    place: Place,
    filledKeys: Set<string>,
  ): unknown => {
    if (typeof value === 'string') {
      const { text, filled } = fillString(value, fields, place);
      if (filled && place.key !== undefined) filledKeys.add(place.key);
      return text;
    }
    if (Array.isArray(value)) {
      return value.map((item) => fillValue(item, fields, place, filledKeys));
    }
    if (value && typeof value === 'object') {
      const isConfirmation = place.key === 'confirmation' && !place.payload;
      return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [
          childKey,
          fillValue(
            child,
            fields,
            {
              key: childKey,
              payload:
                place.payload ||
                PAYLOAD_KEYS.has(childKey) ||
                (isConfirmation && childKey === 'text'),
            },
            filledKeys,
          ),
        ]),
      );
    }
    return value;
  };

  return (action, fields) => {
    const filledKeys = new Set<string>();
    const filled: Record<string, unknown> = { action: action.action };
    try {
      for (const [key, value] of Object.entries(action)) {
        if (key === 'action') continue;
        filled[key] = fillValue(value, fields, { key, payload: PAYLOAD_KEYS.has(key) }, filledKeys);
      }
    } catch (error) {
      if (error instanceof OutsidePayload) return undefined;
      throw error;
    }

    if (filled.action === 'url' && filledKeys.has('url_path')) {
      const scheme = urlScheme(String(filled.url_path ?? ''));
      if (scheme !== undefined && !SAFE_URL_SCHEMES.has(scheme)) return undefined;
    }

    return filled as unknown as Types.ActionConfig;
  };
}
