/**
 * Editor-local workspaces. Shared uses root-value schemas without becoming a card view.
 */

import type { HaFormSchema } from './ha-form';
import { select } from './schemas/common';
import type * as Types from '../../config/types';
import { VIEWS } from '../../config/view';

export type EditorWorkspace = 'shared' | Types.EffectiveView;

export const WORKSPACE_FIELD = 'editing_workspace';

export const WORKSPACES: ReadonlyArray<EditorWorkspace> = ['shared', ...VIEWS];

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
 * Builds the editor-only workspace selector.
 *
 * @param language - Editor language
 * @returns A required selector, separate from every configuration-writing form
 */
export function buildWorkspaceSchema(language: string): HaFormSchema[] {
  return [{ ...select(language, WORKSPACE_FIELD, WORKSPACES), required: true }];
}
