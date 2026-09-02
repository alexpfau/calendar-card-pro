/**
 * Pictures Home Assistant holds for a person entity.
 *
 * The third of the "inherit this from Home Assistant" family, after `entity-colors.ts` and
 * `entity-icons.ts`, and mechanically the sibling of the second: Home Assistant merges a
 * person's picture into that person's **state attributes**, so it arrives on the `hass`
 * object every card is already handed and moves with it on the next state update. No
 * WebSocket, no cache and no subscription — the three things a calendar's *color* needs and
 * an icon does not.
 *
 * 🚨 **The entity it reads is not the calendar.** This is the one thing about the feature
 * that is easy to get backwards, and getting it backwards produces a feature that silently
 * finds nothing: {@link EntityIcons.entityIcon} is handed the *calendar's* entity id,
 * because the icon it wants belongs to the calendar being labelled. A person's picture
 * belongs to a **different entity entirely** — the one named by the `label` value — so this
 * is handed `label`, never `entityId`. A calendar carries no `entity_picture` of its own, so
 * the mistake reads as "the option does nothing" rather than as a wrong picture.
 *
 * Verified against a live instance rather than inferred:
 *
 * - All three `person.…` entities reported `entity_picture`, e.g.
 *   `/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512`.
 * - That address answers `curl` with **no** authorization header — HTTP 200, `image/png`, a
 *   real 512×512 file. The control that makes that meaningful rather than merely observed:
 *   `/api/states` on the same instance answered 401, so this is not an instance with
 *   authentication switched off. It is why the card can point an `<img>` straight at it.
 * - `person.ben` has **no** `user_id` and still has `entity_picture`, so a person need not
 *   be linked to a login to have a picture. Nothing here gates on `user_id`.
 *
 * A person Home Assistant holds no picture for carries no `entity_picture` attribute at all,
 * so a miss is a genuine absence — which is why {@link personPicture} returns `undefined` and
 * the label falls away entirely, exactly as an iconless calendar's does.
 */

import type * as Types from '../config/types';

/**
 * A person entity id, as Home Assistant spells one.
 *
 * Home Assistant slugifies an object id, so a person is `person.` followed by lower-case
 * letters, digits and underscores and nothing else. Anchored at both ends on purpose: this
 * is the whole label, not a fragment of one, so a sentence mentioning a person cannot be
 * mistaken for a reference to one.
 */
const PERSON_ENTITY_ID = /^person\.[a-z0-9_]+$/;

/**
 * Whether a configured label names a person whose picture should stand in for it.
 *
 * 🚨 Shape only, and it has to stay that way. {@link Helpers.getLabelType} has no `hass` —
 * the editor and the card both ask it what a value *is* long before either can ask Home
 * Assistant what exists — so a test for "does this person exist" here would make the two
 * halves disagree the moment a person was renamed: the card would read the label as text and
 * draw the entity id, while the editor still showed the person picker. Shape alone means an
 * unknown person renders as nothing, which is the same nothing a picture-less person renders
 * and the same nothing an iconless calendar renders.
 *
 * Returns a plain `boolean` rather than the `value is string` predicate it could, matching
 * {@link EntityIcons.isEntityIconSentinel} — and not only for symmetry. `getLabelType` has
 * already narrowed its argument to `string` by the time it asks, so a predicate would narrow
 * the *failing* branch to `never` and every arm below this one would stop compiling.
 *
 * @param value - Configured `label`, on one calendar
 * @returns `true` when the value is a person entity id
 */
export function isPersonEntityId(value: unknown): boolean {
  return typeof value === 'string' && PERSON_ENTITY_ID.test(value);
}

/**
 * The picture Home Assistant currently holds for one person.
 *
 * @param entityId - The **person's** entity id, taken from the `label` value — not the
 *   calendar's, which carries no picture of its own
 * @param hass - Home Assistant state, absent before the card is handed one
 * @returns The picture's address, or `undefined` when Home Assistant holds none
 */
export function personPicture(
  entityId: string | undefined,
  hass?: Types.Hass | null,
): string | undefined {
  if (!entityId) return undefined;

  const picture = hass?.states?.[entityId]?.attributes?.entity_picture;

  return typeof picture === 'string' && picture !== '' ? picture : undefined;
}

/**
 * A person for the editor to start from when the user asks for a person's picture.
 *
 * The editor's image-source dropdown is *derived* from `label` rather than stored, so the
 * person mode has no value of its own until somebody is picked — and a mode that stores
 * nothing re-derives as `custom` on the next render, which snaps the dropdown straight back
 * and makes the mode unreachable. This is `accentColorFor`'s "custom has to be seeded rather
 * than left empty", one option over, and it writes a person into the configuration the moment
 * the dropdown moves for the same reason: choosing that mode is an affirmative act meaning
 * "I am about to name a person", not a default appearing unasked.
 *
 * 🚨 Prefers a person Home Assistant actually holds a picture for, and that is not fussiness.
 * Seeding a picture-less person renders **nothing** — the label falls away, exactly as
 * designed — so the user picks "a person's picture" and sees no change at all, which is the
 * precise failure this whole feature was opened about. Falling back to any person keeps the
 * picker populated so the choice is visible and changeable.
 *
 * Sorted rather than taken in object order, so two instances holding the same people seed the
 * same one and the editor's behaviour is reproducible.
 *
 * @param hass - Home Assistant state, absent before the editor is handed one
 * @returns A person entity id, or `undefined` on an instance with no people at all
 */
export function firstPersonEntityId(hass?: Types.Hass | null): string | undefined {
  const people = Object.keys(hass?.states ?? {})
    .filter((id) => PERSON_ENTITY_ID.test(id))
    .sort();

  return people.find((id) => personPicture(id, hass) !== undefined) ?? people[0];
}
