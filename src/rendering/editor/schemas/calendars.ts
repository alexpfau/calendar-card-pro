/**
 * The Calendars panel — which calendars the card shows, and how each one looks.
 *
 * Two halves that meet here, and the seam between them is the interesting part.
 *
 * The **picker** is schema. `entities` accepts either a bare entity id or an object
 * carrying that calendar's label, colours and filters, and no selector can bind a list
 * of two shapes — so the picker binds a synthetic list of ids and merges back by id,
 * which is what makes deselecting a calendar and selecting it again keep everything
 * configured for it rather than replacing the object with a string.
 *
 * The **per-calendar settings** are not, because they cannot be. `ha-form` has no
 * member for an ordered list of heterogeneous sub-configs; every Home Assistant card
 * with a list is a hybrid for the same reason, including the four-option calendar card,
 * which puts three fields through `<ha-form>` and then drops out to a hand-written
 * picker of its own. What is hand-written here is the **list**: each calendar's fields
 * are an ordinary schema (`schemas/entity.ts`) fed to an ordinary form, declared below
 * so that the string table can still be reconciled against them.
 *
 * `reorder` is set on the picker because order is configuration: `filter_duplicates`
 * keeps the copy from whichever calendar is listed first, along with its label and
 * colour, so a user who cannot reorder the list cannot choose which copy survives.
 * Home Assistant added the flag in 2025.8 and an older instance ignores an option it
 * does not know, so this degrades to the list as it renders today rather than breaking
 * it — which is the whole reason to spend one flag here rather than build a drag
 * implementation of our own.
 */

import { mdiCalendarMultiple } from '@mdi/js';

import { buildEntitySchema } from './entity';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx, SubformDef } from '../panels';

/** Icon for the panel. */
export const CALENDARS_ICON = mdiCalendarMultiple;

/** Label path the per-calendar fields are rendered under. */
export const ENTITY_PATH: ReadonlyArray<string> = ['entity'];

/**
 * Builds the Calendars panel schema.
 *
 * Not memoised, and it does not need to be: the schema is a constant, so the array is
 * the only allocation and a memoiser would cost more than it saved.
 *
 * @param _ctx - Schema context, unused
 * @returns The panel's schema
 */
export function buildCalendarsSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return [
    {
      name: 'calendars',
      required: true,
      selector: { entity: { filter: { domain: 'calendar' }, multiple: true, reorder: true } },
    },
  ];
}

/**
 * Declares the schema the panel renders once per configured calendar.
 *
 * @param ctx - Schema context
 * @returns The per-calendar sub-form
 */
export function calendarsSubforms(ctx: SchemaCtx): SubformDef[] {
  return [{ path: ENTITY_PATH, schema: buildEntitySchema(ctx) }];
}
