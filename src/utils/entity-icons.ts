/**
 * Icons Home Assistant holds for a calendar entity.
 *
 * The sibling half of `entity-colors.ts`, and deliberately a fraction of its size. A
 * calendar's color lives at `options.calendar.color` in the entity registry, which the
 * compressed display registry behind `hass.entities` does not carry, so reading it needs a
 * WebSocket fetch, a cache and a subscription. An icon needs none of that: Home Assistant
 * merges it into the entity's **state attributes**, so it arrives on the `hass` object every
 * card is already handed and moves with it on the next state update.
 *
 * Verified against a live instance rather than inferred, in both directions:
 *
 * - `calendar.…` with an icon set under Settings → Devices & Services → Entities reports
 *   `attributes.icon`, so the registry override reaches the state machine.
 * - `input_boolean.…` whose registry `icon` is `null` still reports `attributes.icon`, so an
 *   icon the **integration** supplies reaches it too.
 *
 * That second case is the one #188 asked for — an integration that knows the calendar's icon
 * writing it once, rather than the user copying it into the card by hand — and it is the
 * reason this reads the state attribute instead of the registry entry the colors read. The
 * registry holds only the user's override; the attribute holds whichever of the two applies.
 *
 * An entity Home Assistant holds no icon for carries **no `icon` attribute at all**; it is not
 * present-but-empty, and Home Assistant's own default (`mdi:calendar` and friends) is derived
 * in the frontend at draw time rather than stored. So a miss here is a genuine absence, which
 * is why {@link entityIcon} returns `undefined` and the label falls away entirely.
 */

import type * as Types from '../config/types';

/**
 * The `label` value meaning "use the icon Home Assistant holds for this calendar".
 *
 * 🚨 Spelled exactly like `ENTITY_COLOR_SENTINEL`, and that is the point rather than a
 * coincidence: two options one release apart that both mean "inherit this from Home
 * Assistant" should be one word a user learns once, not two they have to keep apart. A test
 * pins the two together so changing either is a deliberate, visible act.
 *
 * The collision to weigh is different here, because `label` is free text where `accent_color`
 * is a vocabulary. A calendar could in principle want the literal *text* label
 * `home-assistant` — but that is a hyphenated lowercase token, not a display string; someone
 * labelling a calendar for humans writes `Home Assistant`, which is unaffected because the
 * comparison is exact. And the case is not merely unlikely but *reachable*: `label_type: text`
 * already overrides shape inference, so `label: home-assistant` with `label_type: text` still
 * renders the words. See {@link Helpers.getLabelType}.
 */
export const ENTITY_ICON_SENTINEL = 'home-assistant';

/**
 * Whether a configured label defers to Home Assistant's icon.
 *
 * @param value - Configured `label`, on one calendar
 * @returns `true` when the value is the sentinel
 */
export function isEntityIconSentinel(value: unknown): boolean {
  return value === ENTITY_ICON_SENTINEL;
}

/**
 * The icon Home Assistant currently holds for one entity.
 *
 * @param entityId - The calendar's entity id
 * @param hass - Home Assistant state, absent before the card is handed one
 * @returns The icon, or `undefined` when Home Assistant holds none
 */
export function entityIcon(
  entityId: string | undefined,
  hass?: Types.Hass | null,
): string | undefined {
  if (!entityId) return undefined;

  const icon = hass?.states?.[entityId]?.attributes?.icon;

  return typeof icon === 'string' && icon !== '' ? icon : undefined;
}
