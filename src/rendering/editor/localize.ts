/**
 * Localization hooks for Home Assistant form labels and helpers.
 */

import type { HaFormSchema } from './ha-form';
import { EDITOR_STRINGS, interpolate } from './strings';
import { EDITOR_LANGUAGE_STRINGS } from './translations/index';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { intlLocales } from '../../translations/intl-locales';
import { hasOwn } from '../../utils/helpers';

/**
 * Turns a config key into readable text, as a last resort.
 *
 * @param key - Config key or string key
 * @returns The key with separators replaced and the first letter capitalized
 */
export function humanize(key: string): string {
  const words = key.split('.').pop()!.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Resolves one string key for a language.
 *
 * @param language - Effective language code
 * @param key - String key, qualified with its group path where it has one
 * @returns The resolved string, or `undefined` when no source defines the key
 */
export function lookup(language: string, key: string): string | undefined {
  const translated = EDITOR_LANGUAGE_STRINGS[language.toLowerCase()]?.[key];
  if (translated !== undefined) {
    return translated;
  }

  return EDITOR_STRINGS[key];
}

/**
 * Builds the qualified key for a schema node inside a group.
 *
 * @param name - Node name
 * @param path - Enclosing group names, outermost first
 * @returns Dotted key
 */
export function qualifiedKey(name: string, path: ReadonlyArray<string> = []): string {
  return [...path, name].join('.');
}

/**
 * Resolves the label for a schema node.
 *
 * Honors `titleKey`, so that a node states its own key rather than having one derived
 * from where it sits. Labels and helpers were asymmetric here until the day-header rule
 * needed it — helpers respected the override and labels did not — and nothing noticed,
 * because the only nodes carrying one were expandables, and `ha-form-expandable` renders
 * the `title` the schema hands it instead of asking for a label. Both now resolve through
 * `stringKey`.
 *
 * @param language - Effective language code
 * @param schema - The node being labeled
 * @param path - Enclosing group names, outermost first
 * @returns Label text, never empty
 */
export function computeLabel(
  language: string,
  schema: HaFormSchema,
  path: ReadonlyArray<string> = [],
): string {
  const qualified = stringKey(schema, path);

  return lookup(language, qualified) ?? lookup(language, schema.name) ?? humanize(schema.name);
}

/**
 * The other words a setting is found by: what people call it where its label says something
 * else, such as "12h" for Time Format. Never shown, only searched.
 *
 * Resolved the way its label is, the qualified key first, so a calendar's field shares the card's
 * words for the same option unless it has words of its own. `check:i18n` requires every
 * `.aliases` string to sit on one of those two keys of a field.
 *
 * @param language - Effective language code
 * @param schema - The node being searched
 * @param path - Enclosing group names, outermost first
 * @returns The words, comma-separated, or `undefined` when the setting has none
 */
export function computeAliases(
  language: string,
  schema: HaFormSchema,
  path: ReadonlyArray<string> = [],
): string | undefined {
  return (
    lookup(language, `${stringKey(schema, path)}.aliases`) ??
    lookup(language, `${schema.name}.aliases`)
  );
}

/**
 * Resolves the helper text for a schema node, including applicability.
 *
 * @param language - Effective language code
 * @param view - View the card is configured to render
 * @param schema - The node being described
 * @param path - Enclosing group names, outermost first
 * @returns Helper text, or `undefined` when the node needs none
 */
export function computeHelper(
  language: string,
  view: Types.EffectiveView,
  schema: HaFormSchema,
  path: ReadonlyArray<string> = [],
  direct = false,
): string | undefined {
  const own =
    lookup(language, `${stringKey(schema, path)}.helper`) ?? fallbackHelper(language, schema);

  const note =
    applicabilityNote(language, schema.name, view) ??
    (direct ? undefined : divergentDefaultNote(language, schema.name, view));

  if (note === undefined) {
    return own;
  }

  return own === undefined ? note : `${note} ${own}`;
}

/**
 * States that the current view has already decided an option, whatever is set above.
 *
 * @param language - Effective language code
 * @param key - Config key
 * @param view - View the card is configured to render
 * @returns The note, or `undefined` when the view takes the option as configured
 */
function divergentDefaultNote(
  language: string,
  key: string,
  view: Types.EffectiveView,
): string | undefined {
  const defaults = ViewConfig.DEFAULT_OVERRIDES_BY_VIEW[view];
  if (defaults === undefined || !hasOwn(defaults, key)) {
    return undefined;
  }

  const specific = lookup(language, `view_default.${view}.${key}`);
  if (specific !== undefined) return specific;

  const fallback = lookup(language, `view_default.${view}`);
  if (fallback === undefined) return undefined;

  return interpolate(fallback, { value: String(defaults[key]) });
}

/**
 * The string key a node resolves its label and helper from.
 *
 * @param schema - The node being described
 * @param path - Enclosing group names, outermost first
 * @returns The node's own key, or the one its position implies
 */
function stringKey(schema: HaFormSchema, path: ReadonlyArray<string>): string {
  if ('titleKey' in schema && schema.titleKey !== undefined) {
    return schema.titleKey;
  }

  return qualifiedKey(schema.name, path);
}

/**
 * The bare-name helper, for a field inside a group that qualifies its keys.
 *
 * @param language - Effective language code
 * @param schema - The node being described
 * @returns The helper, or `undefined`
 */
function fallbackHelper(language: string, schema: HaFormSchema): string | undefined {
  if ('titleKey' in schema && schema.titleKey !== undefined) {
    return undefined;
  }

  return lookup(language, `${schema.name}.helper`);
}

/**
 * States which layouts an option applies to, when that is not all of them.
 *
 * @param language - Effective language code
 * @param key - Config key
 * @param view - View the card is configured to render
 * @returns The note, or `undefined` when the option applies to the current view
 */
export function applicabilityNote(
  language: string,
  key: string,
  view: Types.EffectiveView,
): string | undefined {
  return scopeNote(language, ViewConfig.VIEW_SCOPE[key], key, view);
}

/**
 * The applicability note for a given scope, whichever table it came from.
 *
 * @param language - Effective language code
 * @param scope - Views the option affects, or `undefined` when it affects all of them
 * @param key - Config key, for a note written specifically for it
 * @param view - View the card is configured to render
 * @returns The note, or `undefined` when the option applies to the current view
 */
function scopeNote(
  language: string,
  scope: ReadonlySet<Types.EffectiveView> | undefined,
  key: string,
  view: Types.EffectiveView,
): string | undefined {
  if (scope === undefined || scope.has(view)) {
    return undefined;
  }

  const scopeId = [...scope].sort().join('_');

  return (
    lookup(language, `scope.${scopeId}_only.${key}`) ??
    lookup(language, `scope.${scopeId}_only`) ??
    undefined
  );
}

/**
 * Resolves the helper for a field in a hand-rendered sub-form.
 *
 * @param language - Effective language code
 * @param view - View the card is configured to render
 * @param schema - The node being described
 * @param path - Label path the sub-form is rendered under
 * @param scope - Views the option affects, or `undefined` when it affects all of them
 * @returns Helper text, or `undefined` when the node needs none
 */
export function computeSubformHelper(
  language: string,
  view: Types.EffectiveView,
  schema: HaFormSchema,
  path: ReadonlyArray<string>,
  scope?: ReadonlySet<Types.EffectiveView>,
): string | undefined {
  const own = lookup(language, `${qualifiedKey(schema.name, path)}.helper`);
  const applicability = scopeNote(language, scope, schema.name, view);

  if (applicability === undefined) return own;

  return own === undefined ? applicability : `${applicability} ${own}`;
}

/**
 * Joins names into one phrase the way the language writes a list: "Columns or Grid".
 *
 * `Intl.ListFormat` supplies the conjunction, so no "or" or "and" has to be translated; where
 * the browser lacks the language it may use a neighbor ({@link intlLocales}). A language tag the
 * runtime refuses falls back to commas rather than throwing.
 *
 * @param language - Editor language code
 * @param items - Names to join, already localized
 * @param type - `disjunction` for "or", `conjunction` for "and"
 * @returns The joined phrase
 */
export function formatList(
  language: string,
  items: ReadonlyArray<string>,
  type: 'disjunction' | 'conjunction' = 'disjunction',
): string {
  // Typed here because the project's `lib` stops at ES2017, where `Intl.ListFormat` is absent.
  const ListFormat = (
    Intl as unknown as {
      ListFormat?: new (
        locales: string[],
        options: { type: string; style: string },
      ) => { format(items: ReadonlyArray<string>): string };
    }
  ).ListFormat;

  try {
    if (ListFormat) {
      return new ListFormat(intlLocales(language), { type, style: 'long' }).format(items);
    }
  } catch {
    // A tag the runtime refuses falls through to commas.
  }
  return items.join(', ');
}
