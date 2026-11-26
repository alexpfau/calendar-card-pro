/**
 * The universe: every card and calendar field the editor can build in a workspace, gated or not.
 *
 * It is the walk `field-index.ts` makes for one configuration, made over the gate corpus
 * (`gates.ts` › `corpus`), every gate opened as a user would open it. So a field in the universe
 * but not present is gated, and a field outside the universe belongs to another layout.
 *
 * A module of its own because it reads both: the corpus opens its gates through the builders
 * `field-index.ts` indexes, so the universe cannot live in either without the two importing each
 * other. The build fails on an import cycle (`rollup.config.mjs` › `failOnCycle`).
 */

import {
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchema,
  schemaCtx,
} from './field-index';
import { corpus } from './gates';
import type * as Workspace from './workspace';

/** Universes already built, by language and workspace. */
const universes = new Map<string, FieldIndex>();

/**
 * The universe for a workspace: every card and calendar field built over the gate corpus,
 * each display's fresh card and every gate opened by edits made in this workspace.
 *
 * Opened through routing rather than by raw patches, so a value Grid or Columns defaults
 * differently lands in that layout's own block, and Grid's location fields open there.
 * Toolbar buttons are not in it: each button is a row of four ungated fields.
 *
 * @param language - Language the nodes are labeled in
 * @param workspace - Editing workspace
 * @returns Fields by id; the first state to build a field supplies its node
 */
export function universeIndex(language: string, workspace: Workspace.EditorWorkspace): FieldIndex {
  const cacheKey = `${language}\u0000${workspace}`;
  const known = universes.get(cacheKey);
  if (known) return known;

  const fields = new Map<FieldId, IndexedField>();
  for (const state of corpus()) {
    if (state.workspace !== workspace) continue;

    const ctx = schemaCtx(state.config, workspace, language);
    for (const [id, field] of buildFieldIndex(ctx).fields) {
      if (!fields.has(id)) fields.set(id, field);
    }
    for (const entry of state.config.entities ?? []) {
      for (const [id, field] of entityFieldIndex(entrySchema(entry, ctx)).fields) {
        if (!fields.has(id)) fields.set(id, field);
      }
    }
  }

  const universe = { fields };
  universes.set(cacheKey, universe);
  return universe;
}
