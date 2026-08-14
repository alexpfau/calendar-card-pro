/**
 * Everything the editor renders as a form but not as *the* panel form.
 *
 * One place that answers "which schemas does this panel put on screen", so that
 * `check:i18n` can reconcile the strings those schemas resolve without walking the DOM.
 *
 * **This is a description of the chassis, not the chassis's own source.** `element.ts`
 * assembles the exception widget and the filter bar itself and takes only
 * `EXCEPTION_PICKER` from here, so the two agree because they call the same helpers —
 * `Exceptions.eligibleFields`, `Overrides.expandFields`, `FILTER_SCHEMA`, and each
 * panel's own `subforms` — and not because one is derived from the other. An earlier
 * version of this comment claimed the chassis read this module and therefore could never
 * disagree with the check; it does not, and a schema added to `element.ts` alone would
 * render with strings nothing reconciles. Add it in both places, or route the chassis
 * through here.
 *
 * There are two kinds, and they exist for opposite reasons. The per-calendar settings
 * are declared by the panel that owns them, because only that panel knows they exist.
 * The exceptions are derived from every panel's own schema, because a panel should not
 * have to know it holds an overridable option — that is a property of the option, and
 * the schema already states it.
 *
 * The filter bar is a third kind and belongs to no panel at all; `chassisSubforms`
 * declares it for the same reason, so that the chassis's own schema is reconciled like
 * everything else.
 */

import * as Exceptions from './exceptions';
import { FILTER_SCHEMA } from './filter';
import type { HaFormSchema } from './ha-form';
import * as Overrides from './overrides';
import { type PanelDef, type SchemaCtx, type SubformDef } from './panels';
import * as ViewConfig from '../../config/view';

/**
 * The field name of the control that adds and removes exceptions.
 *
 * A field rather than a button because it is one: its value is the set of options this
 * panel holds an exception for, so adding and removing are the same edit in two
 * directions. That also keeps it inside the schema, which is what makes its label and
 * helper resolve the way every other label and helper does.
 */
export const EXCEPTION_PICKER = 'exceptions';

/**
 * Schemas the chassis renders itself, belonging to no panel.
 *
 * One so far: the filter bar. It is here rather than inlined in the element for the same
 * reason the exceptions widget is — a schema the chassis draws is still schema, and one
 * that nothing declares is a set of labels `check:i18n` cannot reconcile.
 *
 * @returns Sub-forms the chassis renders above the panels
 */
export function chassisSubforms(): SubformDef[] {
  return [{ path: [], schema: FILTER_SCHEMA }];
}

/**
 * String-key prefixes the chassis resolves itself, beyond its fields.
 *
 * The counterpart to `PanelDef.strings`, for text the element renders directly rather
 * than through a schema: the buttons and summaries around the per-calendar list, the
 * exceptions heading, and what the filter says when it has nothing to show.
 *
 * Declaring them is not bookkeeping. `entity.copy` and its three neighbours are reachable
 * today only because the *weather* panel happens to contain a field named `entity`, which
 * makes `entity` a root by coincidence — rename that field and four chassis strings would
 * be reported as dead. An accidental root proves nothing, so the chassis states its own.
 */
export const CHASSIS_STRINGS: ReadonlyArray<string> = ['filter', 'entity', 'exceptions'];

/**
 * Builds the exception controls for one panel.
 *
 * Empty for a view with no override block — `list` is the top level, so there is
 * nothing for it to be an exception to — and empty for a panel whose options are all
 * shared across views. Both are read from tables rather than compared against a view
 * name, so a third view costs an entry in `OVERRIDE_BLOCK_BY_VIEW` and nothing here.
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

  // Declared as the picker's own options **and** the rows the form would draw with
  // every one of them selected. The two differ for the three union-typed keys, whose
  // row is a mode dropdown and whatever that mode calls for — so declaring only the
  // bare key would leave those controls' labels unreconciled, and declaring only the
  // rows would do the same to the name the picker lists. Every mode is swept, because a
  // mode's value field exists only while that mode is chosen.
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
