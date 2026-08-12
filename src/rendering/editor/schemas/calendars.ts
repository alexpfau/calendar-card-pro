/**
 * The Calendars panel — which calendars the card shows.
 *
 * One field, and it is the one field the card cannot work without.
 *
 * `entities` accepts either a bare entity id or an object carrying that calendar's
 * label, colours and filters, and no selector can bind a list of two shapes. The
 * picker therefore binds a synthetic list of ids and merges back by id, which is what
 * makes deselecting a calendar and selecting it again keep everything configured for
 * it rather than replacing the object with a string.
 *
 * The per-calendar settings themselves are not here yet. They are an ordered list of
 * heterogeneous sub-forms, which `ha-form` has no member for — every Home Assistant
 * card with a list is a hybrid for the same reason, including the four-option calendar
 * card. That half is hand-written and lands separately; a configuration that already
 * has per-calendar objects keeps them untouched in the meantime.
 */

import { mdiCalendarMultiple } from '@mdi/js';

import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

/** Icon for the panel. */
export const CALENDARS_ICON = mdiCalendarMultiple;

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
      selector: { entity: { filter: { domain: 'calendar' }, multiple: true } },
    },
  ];
}
