/**
 * Gives Home Assistant's action editor a name for the card's own actions.
 *
 * `hui-action-editor` builds every option's label as
 * `hass.localize('ui.panel.lovelace.editor.action-editor.actions.' + action)`. That table
 * is Home Assistant's, and there is no label override on the component or on the selector,
 * so an action HA has never heard of renders as its own raw key — a lowercase `expand`
 * sitting among Toggle, Navigate and Assist, identical in all eleven editor languages.
 *
 * The one seam is the `hass` object the editor hands to `<ha-form>`. Wrapping its
 * `localize` lets the card answer for its own actions and delegate everything else
 * untouched, so the dropdown reads in the same language as the rest of the panel.
 *
 * No DOM and no Lit here, deliberately: this is plain data-in, data-out so the tests and
 * `check:i18n` can call it directly rather than scraping a rendered editor.
 */

import { lookup } from './localize';
import { CARD_ACTIONS, cardActionLabelKey } from './schemas/actions';
import type * as Types from '../../config/types';

/** Prefix Home Assistant builds an action dropdown's option labels from. */
export const HA_ACTION_LABEL_PREFIX = 'ui.panel.lovelace.editor.action-editor.actions.';

/**
 * Cached wrappers, keyed by the `hass` they wrap and then by language.
 *
 * Identity matters to the components downstream: `ha-form` and everything under it gate
 * work on `changedProperties.has('hass')`, so handing them a freshly built object on every
 * render would make every form update on every unrelated state change. Home Assistant
 * replaces `hass` wholesale rather than mutating it, so caching on its identity is both
 * safe and enough. A `WeakMap` keeps a retired `hass` collectable.
 */
const wrapped = new WeakMap<object, Map<string, Types.Hass>>();

/**
 * Resolves one card action's label, falling back to nothing when no string defines it.
 *
 * @param language - Effective editor language
 * @param action - Card-specific action value
 * @returns The translated label, or `undefined` to let Home Assistant answer
 */
function cardActionLabel(language: string, action: string): string | undefined {
  return lookup(language, cardActionLabelKey(action));
}

/**
 * Wraps `hass` so the card's own actions get a translated label in HA's action dropdown.
 *
 * Returns the original object unchanged when there is nothing to add — no `hass`, no
 * `localize` to delegate to — so callers need no special case and Home Assistant keeps
 * its own raw-key fallback.
 *
 * @param hass - The `hass` object Home Assistant handed the editor
 * @param language - Effective editor language
 * @returns A `hass` that answers for card actions, or the original
 */
export function withCardActionLabels(
  hass: Types.Hass | undefined,
  language: string,
): Types.Hass | undefined {
  if (!hass || typeof hass.localize !== 'function') return hass;

  const byLanguage = wrapped.get(hass) ?? new Map<string, Types.Hass>();
  const cached = byLanguage.get(language);
  if (cached) return cached;

  const base = hass.localize.bind(hass);
  const labels = new Map<string, string>();
  for (const action of CARD_ACTIONS) {
    const label = cardActionLabel(language, action);
    if (label !== undefined) labels.set(`${HA_ACTION_LABEL_PREFIX}${action}`, label);
  }

  // Nothing to answer for: hand back the original rather than an identical copy, so the
  // components downstream see no change at all.
  if (labels.size === 0) return hass;

  const next: Types.Hass = {
    ...hass,
    localize: (key: string, ...args: ReadonlyArray<unknown>) =>
      labels.get(key) ?? base(key, ...args),
  };

  byLanguage.set(language, next);
  wrapped.set(hass, byLanguage);
  return next;
}
