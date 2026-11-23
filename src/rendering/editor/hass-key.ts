/**
 * Which `hass` updates the editor draws, and the two `hass` objects its forms are handed.
 *
 * Home Assistant hands the editor a new `hass` on every state change in the house, two to four a
 * second while its dialog sits idle, and the editor used to render and update every form for each
 * one (backlog item 307). The editor itself draws from a small part of `hass`: the language, Home
 * Assistant's string table, locale and theme, and the states of the entities its configuration
 * names. `element.ts` › `shouldUpdate` skips a render whose only change is a `hass` that moved none
 * of them (`editorHassKey`), as the card does for its own (`utils/hass-relevance.ts`).
 *
 * Its forms read `hass` in two ways, so they get it from two feeds:
 *
 * - **Live**, `withCardActionLabels(hass, language)` made for every new `hass`: a form with an
 *   `entity`, `icon`, `ui_action` or `object` selector lists, names or acts on entities, so it
 *   needs every state as it arrives, and the action dropdown needs the card's own action names. A
 *   render the editor skips hands it the new `hass` directly. Home Assistant's Visibility editor is
 *   live too, given `hass` as it is, and so is the warm-up while it is drawn (`element.ts` ›
 *   `updated`).
 * - **Steady**, `steadyHass`: every other form (text, number, boolean, select) reads labels, locale
 *   and theme, never a state, so it is handed one object for as long as those stay as they are,
 *   and a new `hass` does not update it at all. Its states are stale by design.
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import { writtenButtons } from './buttons';
import type { HaFormSchema } from './ha-form';
import { withCardActionLabels } from './hass-localize';
import type * as Types from '../../config/types';
import { isConfigBlock, labelParts } from '../../utils/helpers';
import { isPersonEntityId } from '../../utils/person-pictures';

/**
 * The members of `hass`, other than its states, that anything the editor draws reads, compared
 * by identity: Home Assistant replaces each one whole when it changes.
 */
export const EDITOR_HASS_MEMBERS = ['language', 'locale', 'localize', 'themes'] as const;

/** The selectors whose forms take the live feed: they read states or name the card's actions. */
export const LIVE_SELECTORS = ['entity', 'icon', 'object', 'ui_action'] as const;

/**
 * The selectors whose element draws something its value picks, which Home Assistant loads the
 * first time it is drawn: `ui_action` draws a form of its own for a `navigate` or an `assist`
 * action, and a service's controls for `perform-action`. The warm-up holds a field of such a type
 * once for each value the editor's forms hold, so each configured branch has loaded before a panel
 * first opens (`ha-form.ts` › `warmSchema`). A type belongs here when what its element draws
 * depends on its value; one that draws the same whatever its value, as a text field or a switch
 * does, does not. Only Home Assistant shows a type missing from here, as a panel that opens short.
 */
export const VALUE_SELECTORS = ['ui_action'] as const;

/**
 * Every entity whose state the editor draws: the card's calendars, whose names head their panels,
 * the weather entity, the toolbar buttons' entities and the persons the calendars' labels name.
 *
 * @param config - The configuration the editor holds
 * @param also - Further entities a render names, such as the calendars Quick Setup was given
 * @returns The entity ids
 */
export function editorEntityIds(
  config: Readonly<Types.Config>,
  also: Iterable<string> = [],
): ReadonlySet<string> {
  const ids = new Set(also);
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value !== '') ids.add(value);
  };

  for (const entry of config.entities ?? []) {
    if (!isConfigBlock(entry)) add(entry);
    else {
      add(entry.entity);
      for (const part of labelParts(entry.label)) if (isPersonEntityId(part)) add(part);
    }
  }
  if (isConfigBlock(config.weather)) add(config.weather.entity);
  add(config.weather_entity);
  for (const button of writtenButtons(config)) {
    if (isConfigBlock(button)) add(button.entity);
  }
  return ids;
}

/**
 * Compares two `hass` objects by the editor's key: the members in `EDITOR_HASS_MEMBERS` and the
 * state of every entity the editor draws.
 *
 * @param previous - The `hass` the editor last saw, undefined before the first
 * @param next - The new `hass`
 * @param entityIds - The entities whose states the editor draws (`editorEntityIds`)
 * @returns True when the key moved and the editor must render
 */
export function editorHassKey(
  previous: Types.Hass | undefined,
  next: Types.Hass | undefined,
  entityIds: Iterable<string>,
): boolean {
  if (!previous || !next) return previous !== next;
  if (EDITOR_HASS_MEMBERS.some((member) => previous[member] !== next[member])) return true;
  if (previous.states === next.states) return false;
  for (const id of entityIds) {
    if (previous.states?.[id] !== next.states?.[id]) return true;
  }
  return false;
}

/** The steady feed last made, with what it was made from: the language, then the members. */
let steady: { readonly from: ReadonlyArray<unknown>; readonly hass: Types.Hass } | undefined;

/**
 * The steady feed: `hass` as `withCardActionLabels` wraps it, kept the same object while the
 * language and Home Assistant's `localize`, `locale` and `themes` are, whatever else a new `hass`
 * carries.
 *
 * @param hass - The `hass` Home Assistant handed the editor
 * @param language - The editor's language
 * @returns The steady `hass`, its states as they were when it was made
 */
export function steadyHass(hass: Types.Hass | undefined, language: string): Types.Hass | undefined {
  if (!hass) return hass;
  const from = [language, hass.localize, hass.locale, hass.themes];
  if (steady === undefined || from.some((part, at) => part !== steady!.from[at])) {
    steady = { from, hass: withCardActionLabels(hass, language)! };
  }
  return steady.hass;
}

/**
 * Whether a form takes the live feed: whether any field it draws, at any depth, uses one of
 * `LIVE_SELECTORS`.
 *
 * @param schema - The form's schema
 * @returns True for the live feed, false for the steady one
 */
export function needsLiveHass(schema: ReadonlyArray<HaFormSchema>): boolean {
  return schema.some((node) =>
    'schema' in node
      ? needsLiveHass(node.schema)
      : 'selector' in node && LIVE_SELECTORS.some((type) => type in node.selector),
  );
}
