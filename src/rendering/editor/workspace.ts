/**
 * Editor-local workspaces, independent of the card's displayed view.
 */

import type { HaFormSchema } from './ha-form';
import { select } from './schemas/common';
import type * as Types from '../../config/types';
import { VIEWS, viewBlockFor } from '../../config/view';

export type EditorWorkspace = Types.EffectiveView;

export const WORKSPACE_FIELD = 'editing_workspace';

export const WORKSPACES: ReadonlyArray<EditorWorkspace> = VIEWS;

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
  return viewBlockFor(workspace) === undefined ? 'editing_workspace.list_note' : undefined;
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
