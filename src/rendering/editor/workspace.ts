/**
 * Editor-local workspaces, independent of the card's displayed view.
 */

import type { HaFormSchema } from './ha-form';
import { select } from './schemas/common';
import { DEFAULT_CONFIG, resolveToolbar } from '../../config/config';
import type * as Types from '../../config/types';
import { OVERRIDE_BLOCK_BY_VIEW, VIEWS, resolveViewOption } from '../../config/view';
import { isConfigBlock } from '../../utils/helpers';

/**
 * A workspace is a place values are written, which is not the same thing as a view.
 *
 * Three of the four name a view and write into that view's block. `'shared'` names the
 * top level — the fallback after a view's overrides and built-in defaults — so it is a real
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
 * Resolves an option for conditional controls without treating Shared as List.
 *
 * @param config - Configuration available to the schema
 * @param key - Shared view option that gates another control
 * @param workspace - Destination being edited, not the schema's base view
 * @returns The shared root value or the selected view's resolved value
 */
export function resolveWorkspaceOption<
  K extends keyof Types.SharedViewOverrides & keyof Types.Config,
>(config: Readonly<Types.Config>, key: K, workspace: EditorWorkspace): Types.Config[K] {
  const view = viewForWorkspace(workspace);
  return view === undefined ? config[key] : resolveViewOption(config, key, view);
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

/**
 * Top-level keys the scope control does not count for All Layouts: what the card is, its
 * calendars and its layout each have a control of their own above the settings.
 */
const UNCOUNTED_ROOT_KEYS: ReadonlySet<string> = new Set([
  'type',
  'entities',
  'view',
  'config_version',
]);

const BLOCK_KEYS: ReadonlySet<string> = new Set(Object.values(OVERRIDE_BLOCK_BY_VIEW));

/**
 * Whether a value counts as written: blanks and nulls are how a cleared field is left.
 *
 * @param value - Value as stored
 * @returns `true` when the value is there
 */
function holdsValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * How many values the YAML stores in a scope: a layout's own block, or for All Layouts the
 * card's own top-level settings. Read from the YAML as stored, never from the merged
 * configuration, which carries every default.
 *
 * @param raw - Configuration as the YAML holds it
 * @param workspace - The scope
 * @returns The count, shown as "Set: N"
 */
export function storedCount(
  raw: Readonly<Record<string, unknown>>,
  workspace: EditorWorkspace,
): number {
  const view = viewForWorkspace(workspace);
  if (view !== undefined) {
    const blockKey = OVERRIDE_BLOCK_BY_VIEW[view];
    const block = blockKey === undefined ? undefined : raw[blockKey];
    return isConfigBlock(block) ? Object.values(block).filter(holdsValue).length : 0;
  }
  return Object.entries(raw).filter(
    ([key, value]) =>
      !UNCOUNTED_ROOT_KEYS.has(key) &&
      !BLOCK_KEYS.has(key) &&
      Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key) &&
      holdsValue(value),
  ).length;
}

/**
 * Whether Settings For shows as its one compact line, "Settings for List · Change", rather
 * than as the four choices.
 *
 * Compact until the scope is changed or Change is pressed, for the rest of the session; while
 * the toolbar is shown with its View Switcher, which lets the card show another layout; and
 * while no layout other than the one the card displays stores values in its block. Values in
 * the displayed layout's own block, where a List card's first edits land, and top-level values
 * keep it compact.
 *
 * @param raw - Configuration as the YAML holds it
 * @param config - Merged configuration
 * @param displayed - The layout the card displays
 * @param touched - Whether the scope was changed, or Change pressed, this session
 * @returns `true` for the compact line
 */
export function isCompactScope(
  raw: Readonly<Record<string, unknown>>,
  config: Readonly<Types.Config>,
  displayed: Types.EffectiveView,
  touched: boolean,
): boolean {
  if (touched) return false;
  const toolbar = resolveToolbar(config);
  if (toolbar.show && toolbar.viewSwitcher) return false;
  return VIEWS.every((view) => view === displayed || storedCount(raw, view) === 0);
}
