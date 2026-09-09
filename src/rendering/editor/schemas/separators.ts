/**
 * Separator schema rows.
 */

import { mdiFormatLineWeight } from '@mdi/js';

import { color, row, text } from './common';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';

export const SEPARATORS_ICON = mdiFormatLineWeight;

const RULES = ['day', 'week', 'month'] as const;

/**
 * Builds the Separators panel schema.
 *
 * Every rule here divides one day, week or month from the next. The day-header rule used
 * to sit below them in a collapsible and did not belong: in column and grid these three
 * are drawn *between* the columns and the day-header rule is drawn *across* them, so the
 * panel was asking two questions under one name. It now lives with the gap it is drawn
 * inside, under Day Header, which leaves this panel homogeneous in every view.
 *
 * No parameters left, because with that group gone nothing here varies by view or by
 * language — the labels resolve from the field names.
 *
 * @returns The panel's schema
 */
const separatorsSchema = Helpers.memoizeLast((): HaFormSchema[] =>
  RULES.map((rule) => row(text(`${rule}_separator_width`), color(`${rule}_separator_color`))),
);

/**
 * Builds the Separators panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildSeparatorsSchema(_ctx: SchemaCtx): HaFormSchema[] {
  return separatorsSchema();
}
