/**
 * Calendar schema rows.
 */

import { mdiCalendarMultiple } from '@mdi/js';

import { buildEntitySchema } from './entity';
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
 * @param ctx - Schema context
 * @returns The per-calendar sub-form
 */
export function calendarsSubforms(ctx: SchemaCtx): SubformDef[] {
  return [{ path: ENTITY_PATH, schema: buildEntitySchema(ctx) }];
}
