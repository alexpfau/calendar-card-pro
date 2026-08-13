/**
 * Label, helper and option-value resolution for the schema-driven editor.
 *
 * `<ha-form>` resolves every string through three caller-supplied hooks — one closure
 * labels the whole form — so this module is the entirety of the editor's i18n surface.
 * The editor it replaced fetched 239 keys at 122 hand-written call sites.
 *
 * Resolution order for any key is: the user's language, then English, then a humanised
 * form of the key. Per key, not per language — see `lookup`.
 */

import type { HaFormSchema } from './ha-form';
import { EDITOR_STRINGS } from './strings';
import { EDITOR_LANGUAGE_STRINGS } from './translations/index';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';

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
 * The language's own file is consulted **first** and `strings.ts` second, which is the
 * order that makes a translation visible at all. It was the other way round for the
 * duration of the rebuild, and because `strings.ts` defines every key the editor asks
 * for, the second source was never reached: the editor rendered in English in all 35
 * languages, including the eleven that had been translated. That is the regression this
 * order exists to prevent, and `check:i18n` now fails on an unreachable translation so
 * it cannot return quietly.
 *
 * Falling back **per key** rather than per language is deliberate and is the
 * maintainer's stated preference: show the language, and fall back to English only for
 * the individual strings it is missing. A language may therefore be translated to any
 * degree, and shipping a partial file is safe rather than being worse than shipping
 * none.
 *
 * The two sources are keyed identically — `translations/<code>.json` holds a subset of
 * `EDITOR_STRINGS`'s keys — so this is a genuine per-key fallback and not a match
 * across two namespaces. The previous editor's `editor.*` namespace is **not**
 * consulted here at all: it shares key names with this one without sharing meanings, so
 * reaching it as a third source is how old copy written for a deleted surface would end
 * up labelling a live control.
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
 * Groups that state their children's applicability once, on the group itself.
 *
 * Maps a group's `name` — which is what Home Assistant threads through the label path
 * — to one config key inside it whose scope the group speaks for. The *scope* still
 * comes from `VIEW_SCOPE`, so there is exactly one table saying which views an option
 * affects and this one only says where the sentence is placed.
 *
 * The compact family is the case that motivated it. All three of its fields are
 * list-only, so each carried the same note and the group read as three separate
 * problems rather than one scoped family. Said once on the group, it is a property of
 * the family — which is what it is.
 *
 * A child is only silenced when its own scope is *identical* to the one the group
 * states, so adding a field with a different scope to a scoped group leaves that field
 * carrying its own note rather than being quietly covered by a sentence that does not
 * describe it.
 */
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

  // Keyed on the group's own name, so the sentence can be written for the family
  // rather than reusing one written for a single field in it.
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
 * Two sources, in order. An option that does nothing in the view the card is set to
 * gets the applicability note, because that is the more urgent thing to say about it;
 * everything else gets its own helper if it has one.
 *
 * Applicability is phrased as what the option *does* affect. That is not politeness —
 * it is the accurate statement. A column card renders as a list below its width
 * threshold, so a list-only option on a column card is the live control for what that
 * card shows on a narrow screen, and calling it inert would be wrong.
 *
 * Where a whole group shares one scope the note is stated on the group and left off
 * its children — see `GROUP_SCOPE`. **A group's note goes after its helper**, unlike a
 * field's, and the difference is not cosmetic: a field's note qualifies a control the
 * reader can already see and name, whereas a group's arrives before the reader knows
 * what the group is. Prefixed, the compact-mode group opened with "These apply to the
 * list layout…" above the sentence that said what "these" were.
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
 * The counterpart to the applicability note, for the opposite situation. An
 * applicability note says an option affects a layout other than this one; this says it
 * affects *this* one and the view has substituted its own default, so the control above
 * is not describing what the card is doing until an exception says otherwise. Two
 * options are in that position today — a column of days reads wrongly with the blank
 * ones missing, and an unsplit multi-day event would leave every later column it spans
 * silently blank — and both are cases where saying nothing would leave a switch that
 * appears to be lying.
 *
 * Driven from `DEFAULT_OVERRIDES_BY_VIEW`, so this is where the note is *placed* rather
 * than where it is decided, and a view with no divergent defaults produces none.
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
  if (!ViewConfig.hasDivergentDefault(key, view)) {
    return undefined;
  }

  return lookup(language, `view_default.${view}.${key}`);
}

/**
 * The key a node's helper text is stored under.
 *
 * A group carries its own, and it has to: `ha-form-expandable` resolves a group's
 * description by calling the helper hook **on itself, with no path**, so a group whose
 * string key differs from its config key — `weather.date` stored under `date` — would
 * otherwise be asked for under the bare name. Left that way the group's own helper is
 * unreachable, and worse than unreachable: `date` and `event` are also keys in the
 * dormant `editor.*` namespace, so the lookup would succeed and render copy written
 * for the editor that was replaced.
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
 * Mirrors `computeLabel`'s second attempt, so a field's helper is found under its
 * config key whether or not it sits in a group. Groups are excluded: their key is
 * exact, and falling back to the bare name is precisely how the wrong string gets
 * rendered.
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
  return scopeNote(language, ViewConfig.VIEW_SCOPE[key], key, view);
}

/**
 * The applicability note for a given scope, whichever table it came from.
 *
 * Shared between the card-level options and the per-calendar ones, which need the same
 * sentence from a different table: `split_multiday_events` is a real override at card
 * level and inert per calendar, so one key carries two scopes and neither statement may
 * be made in the other's name.
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
 * Qualified keys **only**, with no fall back to the bare name — which is the one
 * difference from `computeHelper` and the reason this exists. A per-calendar
 * `show_time` that fell back would inherit the card-level helper, which describes what
 * the option does for every calendar at once; an exception row would repeat, under
 * every row, the sentence already sitting beside the shared control it is an exception
 * to. Both are worse than saying nothing, and saying nothing is what an undefined
 * helper does.
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
