/**
 * Reusable schema fragments for repeated subforms.
 */

import { FILTER_SCHEMA } from './filter';
import { type PanelDef, type SchemaCtx, type SubformDef } from './panels';
import { buildDisplayViewSchema } from './schemas/layout';
import { buildWorkspaceSchema } from './workspace';

/**
 * Schemas the chassis renders itself, belonging to no panel.
 *
 * @param language - Language used by the selectors' option labels
 * @returns Sub-forms the chassis renders above the panels
 */
export function chassisSubforms(language = 'en'): SubformDef[] {
  return [
    { path: [], schema: buildDisplayViewSchema(language) },
    { path: [], schema: buildWorkspaceSchema(language) },
    { path: [], schema: FILTER_SCHEMA },
  ];
}

export const CHASSIS_STRINGS: ReadonlyArray<string> = [
  'filter',
  'entity',
  'editing_workspace',
  'value_source',
];

/**
 * Every schema a panel renders outside its own form.
 *
 * @param panel - Panel definition
 * @param ctx - Schema context
 * @returns Sub-forms, in render order
 */
export function panelSubforms(panel: PanelDef, ctx: SchemaCtx): SubformDef[] {
  return [...(panel.subforms?.(ctx) ?? [])];
}
