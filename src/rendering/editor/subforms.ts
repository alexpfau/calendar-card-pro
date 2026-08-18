/**
 * Reusable schema fragments for repeated subforms.
 */

import * as Exceptions from './exceptions';
import { FILTER_SCHEMA } from './filter';
import type { HaFormSchema } from './ha-form';
import * as Overrides from './overrides';
import { type PanelDef, type SchemaCtx, type SubformDef } from './panels';
import * as ViewConfig from '../../config/view';

export const EXCEPTION_PICKER = 'exceptions';

/**
 * Schemas the chassis renders itself, belonging to no panel.
 *
 * @returns Sub-forms the chassis renders above the panels
 */
export function chassisSubforms(): SubformDef[] {
  return [{ path: [], schema: FILTER_SCHEMA }];
}

export const CHASSIS_STRINGS: ReadonlyArray<string> = ['filter', 'entity', 'exceptions'];

/**
 * Builds the exception controls for one panel.
 *
 * @param panel - Panel definition
 * @param ctx - Schema context
 * @returns The picker and the eligible fields, or nothing
 */
export function exceptionSubforms(panel: PanelDef, ctx: SchemaCtx): SubformDef[] {
  const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[ctx.view];
  if (blockKey === undefined) return [];

  const fields = Exceptions.eligibleFields(panel.build(ctx), panel.id, ctx.language);
  if (fields.length === 0) return [];

  const rows = new Map<string, HaFormSchema>();
  for (const field of fields) {
    rows.set(field.name, field);

    for (const mode of Overrides.everyMode(field.name)) {
      for (const row of Overrides.expandFields([field], ctx.language, mode)) {
        rows.set(row.name, row);
      }
    }
  }

  return [
    {
      path: [],
      schema: [
        {
          name: EXCEPTION_PICKER,
          selector: { select: { mode: 'dropdown', multiple: true, options: [] } },
        },
      ],
    },
    { path: [blockKey], schema: [...rows.values()] },
  ];
}

/**
 * Every schema a panel renders outside its own form.
 *
 * @param panel - Panel definition
 * @param ctx - Schema context
 * @returns Sub-forms, in render order
 */
export function panelSubforms(panel: PanelDef, ctx: SchemaCtx): SubformDef[] {
  return [...(panel.subforms?.(ctx) ?? []), ...exceptionSubforms(panel, ctx)];
}
