/**
 * Editor-local workspaces, independent of the card's displayed view.
 */

import type { HaFormSchema } from './ha-form';
import { select } from './schemas/common';
import type * as Types from '../../config/types';
import { VIEWS } from '../../config/view';

/**
 * A workspace is a place values are written, which is not the same thing as a view.
 *
 * Three of the four name a view and write into that view's block. `'shared'` names the
 * top level — the base every view reads when its own block is silent — so it is a real
 * destination with no view behind it. It was deleted once, in the editor rework's Stage 5,
 * on the correct finding that it was byte-identical to List; that was true only because
 * list's keys lived at the top level. `list:` is what gives it a job.
 */
export type EditorWorkspace = Types.EffectiveView | 'shared';

export const WORKSPACE_FIELD = 'editing_workspace';

export const WORKSPACES: ReadonlyArray<EditorWorkspace> = ['shared', ...VIEWS];

/**
 * The view a workspace edits, or `undefined` for the shared top level.
 *
 * 🚨 The one function every workspace-to-view decision goes through. Widening
 * `EditorWorkspace` makes the compiler name each place `'shared'` cannot flow, but it is
 * silent about the places that merely *read* a workspace and happen to typecheck — so the
 * answer to a compiler error here is a decision about what Shared means, never a cast.
 *
 * @param workspace - Editing workspace
 * @returns The view being edited, or `undefined` when the shared base is
 */
export function viewForWorkspace(workspace: EditorWorkspace): Types.EffectiveView | undefined {
  return workspace === 'shared' ? undefined : workspace;
}

/**
 * The view a workspace's *panels* are built as. Never `undefined`.
 *
 * Distinct from {@link viewForWorkspace} because a schema builder needs a view even where
 * a destination does not exist. Shared answers `'list'`, and the choice is load-bearing
 * rather than arbitrary: list is the base every other view widens — it registers no
 * divergent defaults and no keys of its own — so building as list yields the panel shape
 * that makes no view-specific claim. `appliesToSharedBase` then narrows the fields to the
 * ones more than one view reads.
 *
 * 🚨 Do not answer this with the card's displayed view. Panel builders branch on it —
 * `layoutSchema` drops the whole day/event spacing row for grid — so Shared would offer a
 * different set of shared options depending on what the card happened to be displaying,
 * and a value the user set on a list card would vanish from the surface that set it the
 * moment they switched the card to grid.
 *
 * @param workspace - Editing workspace
 * @returns The view its schema is built as
 */
export function baseViewForWorkspace(workspace: EditorWorkspace): Types.EffectiveView {
  return workspace === 'shared' ? 'list' : workspace;
}

/**
 * Whether a form value names an editor workspace.
 *
 * @param value - Value returned by the workspace form
 * @returns Whether the value is a supported workspace
 */
export function isWorkspace(value: unknown): value is EditorWorkspace {
  return WORKSPACES.some((workspace) => workspace === value);
}

/**
 * Names the storage-destination note shown for a workspace.
 *
 * @param workspace - Editing workspace
 * @returns A note key when its values can also be used by other layouts
 */
export function workspaceNote(workspace: EditorWorkspace): string | undefined {
  return workspace === 'shared' ? 'editing_workspace.shared_note' : undefined;
}

/**
 * Builds the editor-only workspace selector.
 *
 * @param language - Editor language
 * @returns A required selector, separate from every configuration-writing form
 */
export function buildWorkspaceSchema(language: string): HaFormSchema[] {
  return [{ ...select(language, WORKSPACE_FIELD, WORKSPACES), required: true }];
}
