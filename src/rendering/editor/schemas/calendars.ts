/**
 * Calendar schema rows.
 */

import { mdiCalendarMultiple } from '@mdi/js';

import { buildEntitySchema } from './entity';
import { withholdInertFields } from '../filter';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx, SubformDef } from '../panels';

export const CALENDARS_ICON = mdiCalendarMultiple;

export const ENTITY_PATH: ReadonlyArray<string> = ['entity'];

/**
 * Builds the Calendars panel schema.
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
 * 🚨 The withholding is not duplicated work. `element.ts` applies `withholdInertFields`
 * to `panel.build(ctx)` and to that alone, so a sub-form never passed through it — and
 * the two surfaces sit one above the other inside the same panel. That produced an
 * editor which hid card-level `compact_events_to_show` in column and grid, correctly,
 * while still offering the per-calendar one immediately below it, where it is equally
 * inert: every read of that key is inside `compactLimitsApply`, and
 * `viewAppliesCompactLimits` is `view === 'list'`. Grid did the same with
 * `split_multiday_events`, which it ignores entirely.
 *
 * It is done here rather than at the render site so the declaration is view-correct on
 * its own terms, which is what lets a test reconcile against it: applying the filter to
 * the returned schema must be a no-op. Filtering in `element.ts` instead would leave
 * nothing to assert without restating the call, which pins a test to itself.
 *
 * 🚨 The `'entity'` scope is required for the reasoning, not for today's output — the two
 * scopes were measured and drop exactly the same two keys, so passing the `'card'`
 * default is right by coincidence. They ask different questions. `'card'` asks
 * `appliesToView(node.name)`, which is a statement about a card-level key; `'entity'`
 * resolves `entityConfigKeys(node.name)` first, which is the only branch that can answer
 * for a *derived* control — `label_icon_source` and friends are not config keys at all,
 * so the card branch fails closed and keeps them by accident rather than on purpose. The
 * two diverge the moment a derived control's source key gains an entity scope, and the
 * failure would be silent in the direction that shows an inert option.
 *
 * This is also the branch's first production caller: it was written and tested in
 * `editor-view-withholding.test.ts` and never reached from the editor, because nothing
 * filtered a sub-form.
 *
 * @param ctx - Schema context
 * @returns The per-calendar sub-form
 */
export function calendarsSubforms(ctx: SchemaCtx): SubformDef[] {
  return [
    {
      path: ENTITY_PATH,
      schema: withholdInertFields(buildEntitySchema(ctx), ctx.workspace ?? ctx.view, 'entity'),
    },
  ];
}
