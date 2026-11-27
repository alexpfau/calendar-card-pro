/**
 * Projects one editing workspace and routes only changes made by its rendered controls.
 */

import type { HaFormSchema, SelectorSchema } from './ha-form';
import { foldsWhileTyped, normalizeFieldValue, normalizeRootValue, optionPath } from './normalize';
import { walkSchema } from './panels';
import * as Synthetic from './synthetic';
import * as Value from './value';
import {
  BLOCK_KEYS,
  type EditorWorkspace,
  LAYOUT_GROUPS,
  storedPath,
  viewForWorkspace,
} from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';
import { weatherEntityOf } from '../../utils/weather-position';

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
 */
export function* workspaceFields(schema: ReadonlyArray<HaFormSchema>): Generator<WorkspaceField> {
  for (const { node, path, dataPath } of walkSchema(schema)) {
    if ('selector' in node) yield { node, path: dataPath, labelPath: path };
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
  const view = viewForWorkspace(workspace);
  // Shared *is* the root. Every key edited there is written at the top level, which is
  // what makes it the one workspace that can still author a value for all three views.
  if (view === undefined) return undefined;

  return ViewConfig.routeForKey(key, view) === 'block'
    ? ViewConfig.viewBlockFor(view)?.blockKey
    : undefined;
}

const storedBlocks = Helpers.memoizeLast((config: Readonly<Types.Config>) =>
  Value.storedViewBlocks(config),
);

/**
 * Describes the source behind a projected control, without claiming implicit values were authored.
 *
 * @param config - Raw merged configuration
 * @param workspace - Editing workspace
 * @param name - Schema field name
 * @returns The source category, omitted for Shared and editor navigation
 */
export function valueSource(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
  name: string,
): 'card' | 'inherited' | 'default' | 'own' | undefined {
  const view = viewForWorkspace(workspace);
  // Shared has nothing to be sourced *from*: it is the base every other answer refers to,
  // so labeling its controls would say "this value comes from here" on every row.
  if (view === undefined) return undefined;

  const block = ViewConfig.viewBlockFor(view);
  if (!block || name === 'view') return undefined;
  const keys = Synthetic.configKeysForField(name);
  if (!keys.some((key) => destination(key, workspace) === block.blockKey)) return 'card';
  const stored = storedBlocks(config)[block.blockKey];
  if (Helpers.isConfigBlock(stored) && keys.some((key) => Helpers.hasOwn(stored, key)))
    return 'own';
  return keys.some(
    (key) => block.onlyKeys.includes(key) || ViewConfig.hasDivergentDefault(key, view),
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
  // A layout group's text is held where it is stored: `list.weather.date.icon_size`.
  if (path.length > 0) return [...(storedPath(path, workspace) ?? path), name].join('.');
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
  // Shared shows the base itself, so no block is resolved over it and `view` keeps the
  // card's own value — the schema builders read that to decide what a preview looks like,
  // and the shared base does not have a layout of its own to claim.
  const view = viewForWorkspace(workspace);
  const effective = view === undefined ? root : ViewConfig.resolveEffectiveConfig(root, view);
  const normalized = Object.fromEntries(
    Object.entries(effective).map(([key, value]) => [key, normalizeRootValue(key, value)]),
  );
  return { ...effective, ...normalized, view: view ?? root.view };
}

/**
 * The layout a card opens in, as the card reads it: its `view`, or List where that is missing or
 * names no layout (`ViewConfig.validateView`). The editor's chips and its form data both read it
 * here, so the two cannot disagree about which layout the switcher always offers.
 *
 * @param config - The card's configuration
 * @returns The starting layout
 */
export function startingView(config: Readonly<Types.Config>): Types.EffectiveView {
  return ViewConfig.VIEWS.includes(config.view) ? config.view : 'list';
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
      const values = Value.VIEW_FORM_BLOCKS[view]?.(config);
      if (!values) return [];
      return [
        [
          block.blockKey,
          {
            ...Object.fromEntries(
              Object.entries(values).map(([key, value]) => [
                key,
                normalizeFieldValue(config, [block.blockKey], key, value),
              ]),
            ),
          },
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
    weather: workspaceWeather(config, workspace),
    // The entity every layout draws from, wherever it is written.
    weather_entity: weatherEntityOf(config),
    // The card's own `view`, not the layout the page projects: the switcher always offers the
    // layout the card opens in, whatever layout is being edited.
    toolbar: Value.toolbarFormBlock({ ...projected, view: startingView(config) }),
    overlay: Value.overlayFormBlock(projected),
    ...Synthetic.deriveSyntheticData(projected, held, viewForWorkspace(workspace)),
  };
  for (const [key, text] of Object.entries(pending)) {
    const parts = key.split('.');
    const name = parts[parts.length - 1];
    let path = parts.slice(0, -1);
    // A layout group's text, held under its layout's block, shows in that layout alone.
    if (path.length > 1 && BLOCK_KEYS.has(path[0]) && LAYOUT_GROUPS.has(path[1])) {
      if (storedPath(path.slice(1), workspace)?.[0] !== path[0]) continue;
      path = path.slice(1);
    }
    // A synthetic field's text, which the derived data above took. Asked of the key, not the
    // name alone, since a block's own option may share a synthetic field's name.
    if (Synthetic.isSyntheticKey(name) && key === pendingKey(name, workspace)) continue;
    const block = destination(name, workspace);
    if (path.length === 0 && block !== undefined) continue;
    const paths = [path];
    if (path.length === 1 && path[0] === block) paths.push([]);
    // Named by path, because a nested field's own name — `icon_size` — is not an option.
    const folds = foldsWhileTyped(optionPath(path, name), text);
    for (const target of paths) {
      // Keep "2" while the user types "24px", but never mask a changed effective value. A
      // size that would fold is the exception: it was held rather than written, and showing
      // the stored value in its place would erase what the user is halfway through typing.
      if (
        folds ||
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

/**
 * The part of a workspace's form data one form reads, as `ha-form` reads it (`getValue` in its
 * frontend): the value under each name its schema draws, within a named group only the names
 * its schema draws there, and through an unnamed or flattened group the names inside it. Handed this, a panel's form
 * receives new data only when something it draws moves, rather than whenever any field
 * anywhere does. `applyWorkspaceChange` reads a form's data and what it emits at its own fields'
 * paths alone, so nothing it routes is lost.
 *
 * @param data - The workspace's form data (`workspaceFormData`)
 * @param schema - The form's schema
 * @returns The form's data
 */
export function formDataFor(
  data: Readonly<Record<string, unknown>>,
  schema: ReadonlyArray<HaFormSchema>,
): Record<string, unknown> {
  const part: Record<string, unknown> = {};
  for (const node of schema) {
    if ('schema' in node && (node.name === '' || node.flatten)) {
      Object.assign(part, formDataFor(data, node.schema));
    } else if (!(node.name in data)) {
      continue;
    } else if ('schema' in node && Helpers.isConfigBlock(data[node.name])) {
      // Into a named group only as far as its schema draws: a field lifted out of Weather or the
      // toolbar is handed its own value, not the block's every sibling.
      part[node.name] = formDataFor(data[node.name] as Record<string, unknown>, node.schema);
    } else {
      part[node.name] = data[node.name];
    }
  }
  return part;
}

/**
 * A field in a form of its own, nested in named grids for its data path, so the form nests its data
 * exactly as the field's panel did (`schemas/common.ts` › `blockScope`). A named `grid` nests data
 * and not labels.
 *
 * @param node - The field
 * @param dataPath - Enclosing data keys, outermost first
 * @returns The one-field schema
 */
export function nestedSchema(node: HaFormSchema, dataPath: ReadonlyArray<string>): HaFormSchema[] {
  return dataPath.reduceRight<HaFormSchema[]>(
    (child, name) => [{ type: 'grid', name, column_min_width: '100%', schema: child }],
    [node],
  );
}

/**
 * Whether an option lives only in the block of the layout a workspace edits, with no top-level
 * counterpart: `min_days_to_show` on Columns' page, say.
 *
 * @param key - The option
 * @param workspace - Editing workspace
 * @returns `true` for a block's own option
 */
function isOnlyKey(key: string, workspace: EditorWorkspace): boolean {
  const view = viewForWorkspace(workspace);
  return view !== undefined && !!ViewConfig.viewBlockFor(view)?.onlyKeys.includes(key);
}

/**
 * The value under a key inside nested data.
 *
 * @param data - Form data or configuration
 * @param path - Enclosing data keys, outermost first
 * @param key - The key
 * @returns The value, or undefined where a step is missing
 */
export function atPath(data: unknown, path: ReadonlyArray<string>, key: string): unknown {
  let value = data;
  for (const part of [...path, key]) {
    value = Helpers.isConfigBlock(value) ? value[part] : undefined;
  }
  return value;
}

/**
 * A copy of nested data with one value replaced, the blocks above it copied and every other value
 * kept. An undefined value removes the key.
 *
 * @param data - Form data or configuration
 * @param path - Enclosing data keys, outermost first
 * @param key - The key
 * @param value - The new value
 * @returns The new data
 */
export function writePath<T extends object>(
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
 * @param gridResetKeys - Grid options whose Shared values must not undo an explicit reset
 * @param authoredRootKeys - Root choices captured by the editor before merging defaults
 * @returns Updated raw configuration and held text
 */
export function applyWorkspaceChange(
  config: Readonly<Types.Config>,
  frame: Readonly<FormFrame>,
  incoming: Readonly<Record<string, unknown>>,
  pending: Synthetic.PendingValues,
  gridResetKeys: ReadonlySet<string> = new Set(),
  authoredRootKeys: ReadonlySet<string> = new Set(),
): { config: Types.Config; pending: Record<string, string> } {
  let draft: Types.Config = { ...config };
  const held = { ...pending };
  for (const { node, path } of workspaceFields(frame.schema)) {
    const synthetic = path.length === 0 && Synthetic.isSyntheticKey(node.name);
    // A synthetic value field compares as the option it writes, so `300` and `300px` agree; a
    // mode over several options compares as itself, since its choices are no value of theirs and
    // an option that folds what it cannot use would read every choice as its default.
    const writes = synthetic ? Synthetic.configKeysForField(node.name) : [node.name];
    const comparisonKey = writes.length === 1 ? writes[0] : node.name;
    const previousRaw = atPath(frame.data, path, node.name);
    const nextRaw = atPath(incoming, path, node.name);
    if (node.name === 'past_event_opacity' && !Value.deepEqual(previousRaw, nextRaw)) {
      Config.validatePastEventOpacity(nextRaw, pendingKey(node.name, frame.workspace, path));
    }
    const previous = normalizeFieldValue(config, path, comparisonKey, previousRaw);
    const next = normalizeFieldValue(config, path, comparisonKey, nextRaw);
    const option = optionPath(path, comparisonKey);
    const textChanged = 'text' in node.selector && !Value.deepEqual(previousRaw, nextRaw);
    const heldKey = pendingKey(node.name, frame.workspace, path);
    if (textChanged) delete held[heldKey];
    const rawText =
      textChanged && typeof nextRaw === 'string' && !Value.deepEqual(nextRaw, next)
        ? nextRaw
        : undefined;
    if (rawText !== undefined) held[heldKey] = rawText;
    // A size the card would fold is one still being typed — `2r` on the way to `2rem`. It is
    // held and not written, like any value that is invalid only while being typed, so the
    // stored size stays the last one that parsed instead of becoming the default (#620).
    if (rawText !== undefined && foldsWhileTyped(option, rawText)) continue;
    // A held size was never stored, so its folded value says nothing about what is: without
    // this, typing `6px` after `big` would compare equal to the default `big` folds to, and
    // leave a stored `10px` in place while the field read `6px`. Only when this field's text
    // moved — ha-form re-emits a held value untouched whenever another field changes.
    if (Value.deepEqual(previous, next) && !(textChanged && foldsWhileTyped(option, previousRaw))) {
      continue;
    }

    if (path.length > 0) {
      // A layout group is stored in the block of the layout being edited.
      const stored = storedPath(path, frame.workspace);
      if (stored !== undefined) draft = writePath(draft, stored, node.name, next);
      continue;
    }

    const projection = workspaceConfig(draft, frame.workspace);
    const applied = synthetic
      ? Synthetic.applySyntheticChange(
          node.name,
          next,
          projection,
          viewForWorkspace(frame.workspace),
        )
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
      // A block's own option is not hoisted onto the projection, so it is compared where it is
      // stored, or a synthetic clearing one would read as no change.
      const current =
        block !== undefined && isOnlyKey(key, frame.workspace)
          ? atPath(projection as unknown as Record<string, unknown>, [block], key)
          : projection[key as keyof Types.Config];
      if (synthetic && Value.deepEqual(value, normalizeRootValue(key, current))) continue;
      draft = writePath(draft, block ? [block] : [], key, value);
      if (key === 'weather_entity') draft = turnOnLayoutWeather(draft, frame.workspace);
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
    draft = Value.reconcileTimeGridValues(draft, gridResetKeys, authoredRootKeys);
  }
  return { config: draft, pending: held };
}

/**
 * The weather a scope's Weather page edits, every option at its effective value: the layout's own,
 * as it draws, or for All Layouts, which draws none, the layout base, off.
 *
 * @param config - Merged configuration
 * @param workspace - The scope
 * @returns The weather, without an entity
 */
export function workspaceWeather(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
): Types.WeatherPresentationConfig {
  const view = viewForWorkspace(workspace);
  return view === undefined
    ? structuredClone(ViewConfig.LAYOUT_WEATHER_BASE)
    : ViewConfig.layoutWeather(config as Types.Config, view);
}

/**
 * Turns the forecast on in the layout being edited when an entity is chosen there while that
 * layout shows none: beside its days, or in Month, which has none, beside its events. Every other
 * layout keeps its own setting.
 *
 * @param config - The configuration with the entity just written
 * @param workspace - The scope the entity was chosen in
 * @returns The configuration, with that layout's weather on where it was off
 */
export function turnOnLayoutWeather(
  config: Types.Config,
  workspace: EditorWorkspace,
): Types.Config {
  const view = viewForWorkspace(workspace);
  if (view === undefined || weatherEntityOf(config) === undefined) return config;
  if (ViewConfig.layoutWeather(config, view).position !== 'none') return config;
  const block = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view] as string;
  return writePath(config, [block, 'weather'], 'position', view === 'month' ? 'event' : 'date');
}
