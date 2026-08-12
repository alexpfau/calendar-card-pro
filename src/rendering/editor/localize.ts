/**
 * Label, helper and option-value resolution for the schema-driven editor.
 *
 * `<ha-form>` resolves every string through three caller-supplied hooks — one closure
 * labels the whole form — so this module is the entirety of the editor's i18n surface.
 * Compare the old editor, where 239 keys are fetched at 122 hand-written call sites.
 *
 * Resolution order for any key is: the user's language, then English, then our own
 * string table, then a humanised form of the key. The translation files come first so
 * that migrating a string out of `strings.ts` and into `en.json` is additive — the
 * moment a key exists there it wins, with no change here.
 */

import type { HaFormSchema } from './ha-form';
import { EDITOR_STRINGS } from './strings';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Localize from '../../translations/localize';

/**
 * Turns a config key into readable text, as a last resort.
 *
 * Mirrors what Home Assistant does for an option it has no translation for, so an
 * unlabelled field reads as `Show location` rather than as `show_location`. That
 * matters more than it sounds: it means a missing string is a cosmetic shortfall
 * rather than a visible defect, which is what makes shipping panels incrementally safe.
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
 * Our own table is consulted **first**, and that order is deliberate. The old editor
 * still owns the `editor.*` namespace and still ships; several of its keys are spelled
 * the same as ours but worded for a different surface, so consulting the translation
 * files first would silently pull old copy into the new editor and make the two
 * namespaces indistinguishable. Reaching the translation files second means a key we
 * have not defined still resolves — which is what will carry the strings once the
 * namespace migrates, at which point the entries here are deleted and this order stops
 * mattering.
 *
 * @param language - Effective language code
 * @param key - String key, qualified with its group path where it has one
 * @returns The resolved string, or `undefined` when no source defines the key
 */
export function lookup(language: string, key: string): string | undefined {
  const own = EDITOR_STRINGS[key];
  if (own !== undefined) {
    return own;
  }

  // Prefixed here rather than left to `translateEditorKey`, which only adds `editor.`
  // to keys that contain no dot and treats a dotted key as already fully qualified.
  // A group-qualified key such as `column.min_day_width` would otherwise be looked up
  // at the root of the translation file, miss, and skip the English fallback chain
  // entirely — so it could never resolve once its entry here is removed.
  const qualified = `editor.${key}`;
  const translated = Localize.translateEditorKey(language, qualified);

  // `translateEditorKey` returns the key it was given when nothing defines it, which
  // is its documented "raw key name" fallback and the signal that there is no string.
  return translated === qualified ? undefined : translated;
}

/**
 * Builds the qualified key for a schema node inside a group.
 *
 * `ha-form` threads the path of enclosing non-flattened groups through its label
 * hooks, which is what keeps `column.min_day_width` distinct from a future top-level
 * `min_day_width`. Flattened groups contribute nothing to the path, exactly as they
 * contribute nothing to the data shape.
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

/**
 * Resolves the helper text for a schema node, including applicability.
 *
 * Two sources, in order. An option that does nothing in the view the card is set to
 * gets the applicability note, because that is the more urgent thing to say about it;
 * everything else gets its own helper if it has one.
 *
 * Applicability is phrased as what the option *does* affect. That is not politeness —
 * it is the accurate statement. A column card renders as a list below its width
 * threshold, so a list-only option on a column card is the live control for what that
 * card shows on a narrow screen, and calling it inert would be wrong.
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
  const qualified = qualifiedKey(schema.name, path);
  const own = lookup(language, `${qualified}.helper`) ?? lookup(language, `${schema.name}.helper`);

  const applicability = applicabilityNote(language, schema.name, view);
  if (applicability === undefined) {
    return own;
  }

  return own === undefined ? applicability : `${applicability} ${own}`;
}

/**
 * States which layouts an option applies to, when that is not all of them.
 *
 * Driven entirely by `VIEW_SCOPE`, so a new annotation is a table entry rather than a
 * conditional sibling placed by hand next to a field. There is no view name written
 * here: the scope set is the input, and a third view would need no change to this
 * function at all.
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
  if (ViewConfig.appliesToView(key, view)) {
    return undefined;
  }

  const scope = ViewConfig.VIEW_SCOPE[key];
  const scopeId = [...scope].sort().join('_');

  return (
    lookup(language, `scope.${scopeId}_only.${key}`) ??
    lookup(language, `scope.${scopeId}_only`) ??
    undefined
  );
}
