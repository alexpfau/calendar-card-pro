/**
 * Localization hooks for Home Assistant form labels and helpers.
 */

import type { HaFormSchema } from './ha-form';
import { EDITOR_STRINGS, interpolate } from './strings';
import { EDITOR_LANGUAGE_STRINGS } from './translations/index';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';

/**
 * Turns a config key into readable text, as a last resort.
 *
 * @param key - Config key or string key
 * @returns The key with separators replaced and the first letter capitalised
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
 * @param language - Effective language code
 * @param schema - The node being labelled
 * @param path - Enclosing group names, outermost first
 * @returns Label text, never empty
 */
export function computeLabel(
  language: string,
  schema: HaFormSchema,
  path: ReadonlyArray<string> = [],
): string {
  const qualified = qualifiedKey(schema.name, path);

  return lookup(language, qualified) ?? lookup(language, schema.name) ?? humanize(schema.name);
}

const GROUP_SCOPE: Readonly<Record<string, string>> = {
  compact_mode: 'compact_events_to_show',
};

/**
 * Whether two scopes are the same statement.
 *
 * @param a - One scope, or `undefined` for "every view"
 * @param b - The other
 * @returns `true` when both are defined and hold the same views
 */
function sameScope(
  a: ReadonlySet<Types.EffectiveView> | undefined,
  b: ReadonlySet<Types.EffectiveView> | undefined,
): boolean {
  if (a === undefined || b === undefined) return false;
  return a.size === b.size && [...a].every((view) => b.has(view));
}

/**
 * The applicability note a group states on behalf of everything inside it.
 *
 * @param language - Effective language code
 * @param name - The group's name
 * @param view - View the card is configured to render
 * @returns The note, or `undefined` when this group states none
 */
function groupScopeNote(
  language: string,
  name: string,
  view: Types.EffectiveView,
): string | undefined {
  const spokenFor = GROUP_SCOPE[name];
  if (spokenFor === undefined) return undefined;

  return scopeNote(language, ViewConfig.VIEW_SCOPE[spokenFor], name, view);
}

/**
 * Whether a group above this field has already stated its applicability.
 *
 * @param key - Config key
 * @param path - Enclosing group names, outermost first
 * @returns `true` when repeating the note here would say it twice
 */
function statedByEnclosingGroup(key: string, path: ReadonlyArray<string>): boolean {
  return path.some((name) => {
    const spokenFor = GROUP_SCOPE[name];
    return (
      spokenFor !== undefined &&
      sameScope(ViewConfig.VIEW_SCOPE[spokenFor], ViewConfig.VIEW_SCOPE[key])
    );
  });
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
): string | undefined {
  const own =
    lookup(language, `${helperKey(schema, path)}.helper`) ?? fallbackHelper(language, schema);

  const groupNote = groupScopeNote(language, schema.name, view);
  if (groupNote !== undefined) {
    return own === undefined ? groupNote : `${own} ${groupNote}`;
  }

  const note =
    (statedByEnclosingGroup(schema.name, path)
      ? undefined
      : applicabilityNote(language, schema.name, view)) ??
    divergentDefaultNote(language, schema.name, view);

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
  if (defaults === undefined || !Object.prototype.hasOwnProperty.call(defaults, key)) {
    return undefined;
  }

  const specific = lookup(language, `view_default.${view}.${key}`);
  if (specific !== undefined) return specific;

  const fallback = lookup(language, `view_default.${view}`);
  if (fallback === undefined) return undefined;

  return interpolate(fallback, { value: String(defaults[key]) });
}

/**
 * The key a node's helper text is stored under.
 *
 * @param schema - The node being described
 * @param path - Enclosing group names, outermost first
 * @returns The key to look the helper up under
 */
function helperKey(schema: HaFormSchema, path: ReadonlyArray<string>): string {
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
