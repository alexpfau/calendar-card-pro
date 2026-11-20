/**
 * A private calendar entry's events as the card shows them (`EntityConfig.private`): when they
 * are and whose they are, and none of their words. The title reads Private behind a lock, and so
 * does a location or a description in the event popover, where the event has one. A whole-field
 * `replace_with` takes the place of Private for its field, without the lock, since the
 * configuration wrote it; a replacement with a pattern is not applied, since it would show the
 * rest of the text.
 *
 * One answer for every place an event's words leave the card: the rows (`groupEventsByDay`), the
 * popover (`EventDetails.displayText`) and an action's fields (`EventActions.eventFields`). No DOM
 * and no Lit.
 */

import { stripHtmlTags } from './format';
import * as TextReplace from './text-replace';
import * as Types from '../config/types';
import * as Localize from '../translations/localize';

/** The three fields an event writes for itself. */
export type PrivateField = 'title' | 'location' | 'description';

/** A private event's three fields as shown, and which of them read Private behind a lock. */
export interface PrivateText {
  readonly title: string;
  readonly location: string;
  readonly description: string;
  /** Which fields are the Private placeholder, drawn after a lock. */
  readonly locked: Readonly<Record<PrivateField, boolean>>;
}

/**
 * Whether an event belongs to a private entry.
 *
 * @param event - A matched event
 * @returns True where its entry sets `private: true`
 */
export function isPrivate(event: Pick<Types.CalendarEventData, '_matchedConfig'>): boolean {
  return event._matchedConfig?.private === true;
}

/**
 * The Private placeholder, in a language.
 *
 * @param language - Language code
 * @returns The word
 */
export function placeholder(language: string): string {
  return Localize.getTranslations(language).private;
}

/**
 * A private event's fields as the card shows them.
 *
 * The title is always shown, so an event without one reads Private too and does not say that it
 * has none. A location or description shows only where the event has one, as any event's does in
 * the popover.
 *
 * @param source - The event's own text, as its calendar returned it
 * @param entry - The private entry it was matched to
 * @param language - Language code for the placeholder
 * @returns The three fields, and which of them are the placeholder
 */
export function privateText(
  source: Pick<Types.CalendarEventData, 'summary' | 'location' | 'description'>,
  entry: Types.EntityConfig | undefined,
  language: string,
): PrivateText {
  const rule = TextReplace.resolveTextReplacement(
    entry?.replace_field,
    entry?.replace_pattern,
    entry?.replace_with,
  );
  const whole = rule && rule.pattern === undefined ? rule : null;
  const word = placeholder(language);
  const shown = (field: PrivateField, raw: string, always: boolean) => {
    if (whole?.field === field) {
      return { text: TextReplace.applyTextReplacement(raw, whole, field).text, locked: false };
    }
    if (!always && raw.trim() === '') return { text: '', locked: false };
    return { text: word, locked: true };
  };

  const title = shown('title', source.summary ?? '', true);
  const location = shown('location', source.location ?? '', false);
  const description = shown('description', stripHtmlTags(source.description ?? ''), false);
  return {
    title: title.text,
    location: location.text,
    description: description.text,
    locked: { title: title.locked, location: location.locked, description: description.locked },
  };
}
