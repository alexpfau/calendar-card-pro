/**
 * Projects one editing workspace and routes only changes made by its rendered controls.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import { normalizeFieldValue, normalizeRootValue } from './normalize';
import * as Synthetic from './synthetic';
import * as Value from './value';
import { type EditorWorkspace, WORKSPACE_FIELD } from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

export interface WorkspaceField {
  node: SelectorSchema;
  path: ReadonlyArray<string>;
  labelPath: ReadonlyArray<string>;
}

export interface FormFrame {
  workspace: EditorWorkspace;
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

/**
 * Enumerates inputs by their configuration path rather than their label groups.
 *
 * @param schema - Rendered schema
 * @param path - Enclosing data keys
 */
export function* workspaceFields(
  schema: ReadonlyArray<HaFormSchema>,
  path: ReadonlyArray<string> = [],
  labelPath: ReadonlyArray<string> = [],
): Generator<WorkspaceField> {
  for (const node of schema) {
    if ('schema' in node) {
      yield* workspaceFields(
        node.schema,
        node.name !== '' && node.flatten !== true ? [...path, node.name] : path,
        node.type === 'expandable' && node.name !== '' ? [...labelPath, node.name] : labelPath,
      );
    } else if ('selector' in node) {
      yield { node, path, labelPath };
    }
  }
}

/**
 * The destination for one real option in an editing workspace.
 *
 * @param key - Real option name
 * @param workspace - Workspace the emitting form was rendered for
 * @returns View block key, or undefined for shared/root storage
 */
export function destination(
  key: string,
  workspace: EditorWorkspace,
): keyof Types.Config | undefined {
  return ViewConfig.routeForKey(key, workspace) === 'block'
    ? ViewConfig.viewBlockFor(workspace)?.blockKey
    : undefined;
}

const storedConfig = Helpers.memoizeLast((config: Readonly<Types.Config>) =>
  Value.toStoredConfig(config),
);

/**
 * Describes the source behind a projected control, without claiming implicit values were authored.
 *
 * @param config - Raw merged configuration
 * @param workspace - Editing workspace
 * @param name - Schema field name
 * @returns The source category, omitted for List and editor navigation
 */
export function valueSource(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
  name: string,
): 'card' | 'inherited' | 'default' | 'own' | undefined {
  const block = ViewConfig.viewBlockFor(workspace);
  if (!block || name === 'view' || name === WORKSPACE_FIELD) return undefined;
  const keys = Synthetic.configKeysForField(name);
  if (!keys.some((key) => destination(key, workspace) === block.blockKey)) return 'card';
  const stored = storedConfig(config)[block.blockKey];
  if (
    Helpers.isConfigBlock(stored) &&
    keys.some((key) => Object.prototype.hasOwnProperty.call(stored, key))
  )
    return 'own';
  return keys.some(
    (key) => block.onlyKeys.includes(key) || ViewConfig.hasDivergentDefault(key, workspace),
  )
    ? 'default'
    : 'inherited';
}

/**
 * The pending-text key for a field, shared only when its storage is shared.
 *
 * @param name - Form field
 * @param workspace - Editing workspace
 * @param path - Enclosing data keys, when the field is nested
 * @returns Root or block-qualified pending key
 */
export function pendingKey(
  name: string,
  workspace: EditorWorkspace,
  path: ReadonlyArray<string> = [],
): string {
  if (path.length > 0) return [...path, name].join('.');
  const destinations = Synthetic.configKeysForField(name).map((key) => destination(key, workspace));
  const block = destinations[0];
  return block !== undefined && destinations.every((candidate) => candidate === block)
    ? `${block}.${name}`
    : name;
}

/**
 * Resolves the values schema builders and synthetic controls should describe.
 *
 * @param config - Authored configuration merged with root defaults
 * @param workspace - Editing workspace
 * @returns A separate effective configuration; the authored one is untouched
 */
export function workspaceConfig(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
): Types.Config {
  const root = Config.normalizeLengthOptions(
    Config.normalizeNumericOptions({
      ...Config.DEFAULT_CONFIG,
      ...config,
    }),
  );
  const view = workspace;
  const effective = ViewConfig.resolveEffectiveConfig(root, view);
  const normalized = Object.fromEntries(
    Object.entries(effective).map(([key, value]) => [key, normalizeRootValue(key, value)]),
  );
  return { ...effective, ...normalized, view };
}

/**
 * Builds full form data while leaving write destinations to the router.
 *
 * @param config - Raw merged configuration
 * @param workspace - Editing workspace
 * @param pending - All held text, qualified by storage scope
 * @returns Effective form data with independently scoped raw text
 */
export function workspaceFormData(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
  pending: Synthetic.PendingValues = {},
): Record<string, unknown> {
  const projected = workspaceConfig(config, workspace);
  const blocks = Object.fromEntries(
    ViewConfig.VIEWS.flatMap((view) => {
      const block = ViewConfig.viewBlockFor(view);
      if (!block) return [];
      const values =
        view === 'grid' ? Value.timeGridFormBlock(config) : Value.columnFormBlock(config);
      return [
        [
          block.blockKey,
          Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              normalizeFieldValue(config, [block.blockKey], key, value),
            ]),
          ),
        ],
      ];
    }),
  );
  const held: Record<string, string> = {};
  for (const name of Object.keys(Synthetic.SYNTHETIC_FIELDS)) {
    const key = pendingKey(name, workspace);
    if (pending[key] !== undefined) held[name] = pending[key];
  }
  let data: Record<string, unknown> = {
    ...projected,
    ...blocks,
    weather: Value.weatherFormBlock(projected),
    ...Synthetic.deriveSyntheticData(projected, held),
  };
  for (const [key, text] of Object.entries(pending)) {
    const parts = key.split('.');
    const name = parts[parts.length - 1];
    const path = parts.slice(0, -1);
    if (Synthetic.isSyntheticKey(name)) continue;
    const block = destination(name, workspace);
    if (path.length === 0 && block !== undefined) continue;
    const paths = [path];
    if (path.length === 1 && path[0] === block) paths.push([]);
    for (const target of paths) {
      // Keep "2" while the user types "24px", but never mask a changed effective value.
      if (
        Value.deepEqual(
          normalizeFieldValue(config, target, name, text),
          normalizeFieldValue(config, target, name, atPath(data, target, name)),
        )
      ) {
        data = writePath(data, target, name, text);
      }
    }
  }
  return data;
}

function atPath(data: unknown, path: ReadonlyArray<string>, key: string): unknown {
  let value = data;
  for (const part of [...path, key]) {
    value = Helpers.isConfigBlock(value) ? value[part] : undefined;
  }
  return value;
}

function writePath<T extends object>(
  data: Readonly<T>,
  path: ReadonlyArray<string>,
  key: string,
  value: unknown,
): T {
  if (path.length > 0) {
    const [parent, ...rest] = path;
    const current = Helpers.isConfigBlock(data) ? data[parent] : undefined;
    const child = writePath(Helpers.isConfigBlock(current) ? current : {}, rest, key, value);
    return { ...data, [parent]: child };
  }
  const next = { ...data, [key]: value };
  if (value === undefined) delete next[key];
  return next;
}

/**
 * Applies only edits to fields the emitting form actually offered.
 *
 * Both sides are coerced before comparison. The frame's workspace is captured at
 * render time, so a delayed event cannot be redirected by a later workspace choice.
 *
 * @param config - Current authored configuration
 * @param frame - Emitting form's schema, workspace, and last emitted data
 * @param incoming - Whole merged data returned by ha-form
 * @param pending - Held synthetic text
 * @param seedGridDefaults - Existing first-switch seeding policy
 * @param authoredRootKeys - Root choices captured by the editor before merging defaults
 * @returns Updated raw configuration and held text
 */
export function applyWorkspaceChange(
  config: Readonly<Types.Config>,
  frame: Readonly<FormFrame>,
  incoming: Readonly<Record<string, unknown>>,
  pending: Synthetic.PendingValues,
  seedGridDefaults = true,
  authoredRootKeys: ReadonlySet<string> = new Set(),
): { config: Types.Config; pending: Record<string, string> } {
  let draft: Types.Config = { ...config };
  const held = { ...pending };
  for (const { node, path } of workspaceFields(frame.schema)) {
    if (node.name === WORKSPACE_FIELD) continue;
    const synthetic = path.length === 0 && Synthetic.isSyntheticKey(node.name);
    const comparisonKey = synthetic ? Synthetic.configKeysForField(node.name)[0] : node.name;
    const previousRaw = atPath(frame.data, path, node.name);
    const nextRaw = atPath(incoming, path, node.name);
    const previous = normalizeFieldValue(config, path, comparisonKey, previousRaw);
    const next = normalizeFieldValue(config, path, comparisonKey, nextRaw);
    const textChanged = 'text' in node.selector && !Value.deepEqual(previousRaw, nextRaw);
    const heldKey = pendingKey(node.name, frame.workspace, path);
    if (textChanged) delete held[heldKey];
    const rawText =
      textChanged && typeof nextRaw === 'string' && !Value.deepEqual(nextRaw, next)
        ? nextRaw
        : undefined;
    if (rawText !== undefined) held[heldKey] = rawText;
    if (Value.deepEqual(previous, next)) continue;

    if (path.length > 0) {
      draft = writePath(draft, path, node.name, next);
      continue;
    }

    const projection = workspaceConfig(draft, frame.workspace);
    const applied = synthetic
      ? Synthetic.applySyntheticChange(node.name, next, projection)
      : { changes: { [node.name]: next } };
    for (const [key, raw] of Object.entries(applied.changes)) {
      const block = destination(key, frame.workspace);
      // Synthetic "off" states mean the root default, not "inherit an enabled value".
      const value = normalizeRootValue(
        key,
        synthetic && block !== undefined && raw === undefined
          ? Config.DEFAULT_CONFIG[key as keyof Types.Config]
          : raw,
      );
      if (
        synthetic &&
        Value.deepEqual(value, normalizeRootValue(key, projection[key as keyof Types.Config]))
      )
        continue;
      draft = writePath(draft, block ? [block] : [], key, value);
    }
    if ('pending' in applied) {
      for (const [name, value] of Object.entries(applied.pending ?? {})) {
        const key = pendingKey(name, frame.workspace);
        if (value === null) delete held[key];
        else held[key] = value;
      }
    }
    // A synthetic commit can clear its pending key after accepting a coerced length.
    if (rawText !== undefined) held[heldKey] = rawText;
  }
  if (config.view !== 'grid' && draft.view === 'grid') {
    draft = Value.seedTimeGridDivergentDefaults(draft, seedGridDefaults, authoredRootKeys);
  }
  return { config: draft, pending: held };
}
