/**
 * The calendars' schema: what one calendar entry's page draws.
 *
 * The Calendars panel draws no field of its own. Its calendar picker retired when the overview's
 * calendar list took over both of its jobs, which calendars the card shows and how many entries
 * each has (`calendar-list.ts`, `views/calendars.ts`). What stays is the entry schema, declared
 * as the panel's sub-form, so `check:i18n` keeps reading it as searched: each entry page is.
 */

import { mdiCalendarMultiple } from '@mdi/js';

import { buildEntitySchema } from './entity';
import type { SchemaCtx, SubformDef } from '../panels';

export const CALENDARS_ICON = mdiCalendarMultiple;

export const ENTITY_PATH: ReadonlyArray<string> = ['entity'];

/**
 * Declares the schema the panel renders once per configured calendar.
 *
 * 🚨 Deliberately **not** view-scoped here, and that took a live measurement to settle.
 * It looks like it should be: `element.ts` applies `withholdInertFields` to
 * `panel.build(ctx)` and to that alone, so the obvious reading is that a sub-form never
 * passes through it. It does — one layer lower, in `filterEntitySchema`, which withholds
 * before it consults the search criteria and is on the unconditional render path. Adding
 * a second call here changes nothing: with it reverted, the live editor rendered
 * identical field *and* heading counts in all three workspaces.
 *
 * That is worth stating because a unit test can be made to disagree. One reading
 * `subform.schema` — the declaration, above the filter — fails the moment this call goes,
 * and reads as protection while the editor is provably unchanged. `renderedSubform` in
 * `editor-layout-structure.test.ts` exists to assert on the layer the element calls
 * instead. If you find yourself wanting the filter here so that a test has something to
 * reconcile against, the test is pointed at the wrong layer.
 *
 * @param ctx - Schema context
 * @returns The per-calendar sub-form
 */
export function calendarsSubforms(ctx: SchemaCtx): SubformDef[] {
  return [{ path: ENTITY_PATH, schema: buildEntitySchema(ctx) }];
}
