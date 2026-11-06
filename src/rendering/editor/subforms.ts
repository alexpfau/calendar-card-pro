/**
 * Reusable schema fragments for repeated subforms.
 */

import { FILTER_SCHEMA } from './filter';
import type { HaFormSchema } from './ha-form';
import { type PanelDef, type SchemaCtx, type SubformDef } from './panels';
import { buildDisplayViewSchema } from './schemas/layout';
import { buildWorkspaceSchema } from './workspace';

/** The forms the chassis renders itself, above the panels and belonging to none. */
export interface ChassisSchemas {
  /** The configured view, written to the config */
  displayView: ReadonlyArray<HaFormSchema>;
  /** Which view's options the panels show; never written */
  workspace: ReadonlyArray<HaFormSchema>;
  /** The filter bar's search and customized-only switch; never written */
  filter: ReadonlyArray<HaFormSchema>;
}

/**
 * Schemas the chassis renders itself, belonging to no panel.
 *
 * The editor renders exactly these, and the i18n gate and the schema tests read them through
 * {@link chassisSubforms}, so a chassis form is declared to the gate by being rendered.
 *
 * @param language - Language used by the selectors' option labels
 * @returns Each chassis form's schema, by the place it renders
 */
export function chassisSchemas(language = 'en'): ChassisSchemas {
  return {
    displayView: buildDisplayViewSchema(language),
    workspace: buildWorkspaceSchema(language),
    filter: FILTER_SCHEMA,
  };
}

/**
 * Schemas the chassis renders itself, as sub-forms.
 *
 * @param language - Language used by the selectors' option labels
 * @returns Sub-forms the chassis renders above the panels, in render order
 */
export function chassisSubforms(language = 'en'): SubformDef[] {
  const { displayView, workspace, filter } = chassisSchemas(language);
  return [displayView, workspace, filter].map((schema) => ({ path: [], schema }));
}

export const CHASSIS_STRINGS: ReadonlyArray<string> = [
  'filter',
  'entity',
  'editing_workspace',
  'value_source',
  'grid_reconciliation',
  'config_migration',
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
