/**
 * One reset path for every destination (backlog item 307).
 *
 * A reset deletes a line where it is stored, so what applies afterwards is what the card would use
 * without it. It never writes a default in its place: a value the YAML holds is kept by
 * `value.ts` › `toStoredConfig` even where it equals the default, so writing one back would leave
 * the line standing. Every reset updates the configuration, the authored root keys, the Grid reset
 * keys and the held text together, as `element.ts` › `_resetViewValues` does for one layout's
 * block, so a root key that left cannot be written back by `retainAuthoredSharedValues` on the next
 * unrelated edit, and a Grid default that came back is not replaced by the root value the next time
 * the card switches to Grid.
 *
 * Generalized from that one case to the top level, nested blocks (`toolbar.legend`,
 * `weather.date.color`), synthetic fields (every key in their `configKeys`, so a mode and its
 * values go together, R6), families (every member, one step), calendar entries (an option the
 * calendar has once, from every block of the calendar, as `entities.ts` › `writeEntity` writes it)
 * and a whole layout's block.
 *
 * Each reset also names the session keys it retires (`clearAdded`), so a field or family it removes
 * leaves the added set in the same step. Those keys are the ones `plan.ts` reads: a field id,
 * `family:<id>`, and on a calendar entry's page `entry:<key>:<id>` and `entry:<key>:family:<id>`.
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import * as Entities from './entities';
import { type FieldId, type IndexedField, parseFieldId } from './field-index';
import { ENTRY_GROUPS, type FamilyId, type HeadingDef, PAGES } from './pages';
import * as Routing from './routing';
import { entityConfigKeys } from './schemas/entity';
import * as Synthetic from './synthetic';
import { BLOCK_KEYS, type EditorWorkspace } from './workspace';
import type { WriteState } from './write-frames';
import type * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/** What a reset deletes. */
export type ResetTarget =
  /** A card field's line in a workspace: every key it writes, at that workspace's destination. */
  | { readonly kind: 'field'; readonly field: IndexedField; readonly workspace: EditorWorkspace }
  /** Every member of a card family, in one step. */
  | { readonly kind: 'family'; readonly family: FamilyId; readonly workspace: EditorWorkspace }
  /** One line by its path in the configuration: an audit line, a misplaced line. */
  | { readonly kind: 'path'; readonly path: ReadonlyArray<string> }
  /** Options of one calendar entry, by its key. */
  | { readonly kind: 'entry'; readonly key: number; readonly keys: ReadonlyArray<string> }
  /** Every member of a family on one calendar entry, by its key. */
  | { readonly kind: 'entry-family'; readonly key: number; readonly family: FamilyId }
  /** A layout's whole block: Reset All in Grid. */
  | { readonly kind: 'block'; readonly blockKey: 'list' | 'column' | 'time_grid' };

/** The state a reset leaves, and the added-set keys it retires. */
export interface ResetResult {
  readonly state: WriteState;
  readonly clearAdded: ReadonlyArray<string>;
}

/** The block Grid's divergent defaults live in, the one `_gridResetKeys` speaks for. */
const GRID_BLOCK = ViewConfig.viewBlockFor('grid')?.blockKey;

/** What a reset changes, built up in one place so the four parts move together. */
interface Draft {
  config: Record<string, unknown>;
  readonly pending: Record<string, string>;
  readonly authoredRootKeys: Set<string>;
  readonly gridResetKeys: Set<string>;
}

/**
 * The view whose block a key names, if it names one.
 *
 * @param blockKey - A root key
 * @returns The view, or `undefined` for a key that is no layout's block
 */
function viewOfBlock(blockKey: string): Types.EffectiveView | undefined {
  return ViewConfig.VIEWS.find((view) => ViewConfig.viewBlockFor(view)?.blockKey === blockKey);
}

/**
 * Deletes a root line. The key leaves the authored root keys with it, and a Grid reset it
 * outlived is forgotten, as a Shared write forgets one (`element.ts` › `_writeCard`).
 *
 * @param draft - What the reset builds
 * @param key - Root key
 */
function removeRoot(draft: Draft, key: string): void {
  delete draft.pending[key];
  forgetSyntheticText(draft, key, 'shared');
  if (!Helpers.hasOwn(draft.config, key)) return;
  const config = { ...draft.config };
  delete config[key];
  draft.config = config;
  draft.authoredRootKeys.delete(key);
  draft.gridResetKeys.delete(key);
}

/**
 * Forgets the text a synthetic field holds for a key at one destination: a cleared Card Height is
 * held under `card_height`, not under `height`, and would otherwise stay on screen once the line
 * it stood for is gone.
 *
 * @param draft - What the reset builds
 * @param key - The key whose line goes
 * @param workspace - The workspace whose destination it is
 */
function forgetSyntheticText(draft: Draft, key: string, workspace: EditorWorkspace): void {
  const block = Routing.destination(key, workspace);
  for (const name of Object.keys(Synthetic.SYNTHETIC_FIELDS)) {
    if (!Synthetic.configKeysForField(name).includes(key)) continue;
    const held = Routing.pendingKey(name, workspace);
    if (block === undefined ? !held.includes('.') : held.startsWith(`${block}.`)) {
      delete draft.pending[held];
    }
  }
}

/**
 * Deletes one line from a layout's block, and the block once it is empty, with the text held for
 * it. A key Grid defaults differently is remembered as reset whether or not the block stored it
 * yet, as `element.ts` › `_resetViewValues` remembers it, so switching the card to Grid later does
 * not copy the root value over the default that Reset asked for
 * (`value.ts` › `reconcileTimeGridValues`).
 *
 * @param draft - What the reset builds
 * @param blockKey - The block
 * @param key - Option inside it
 */
function removeInBlock(draft: Draft, blockKey: string, key: string): void {
  delete draft.pending[`${blockKey}.${key}`];
  const view = viewOfBlock(blockKey);
  if (view !== undefined) forgetSyntheticText(draft, key, view);
  if (blockKey === GRID_BLOCK && view !== undefined && ViewConfig.hasDivergentDefault(key, view)) {
    draft.gridResetKeys.add(key);
  }

  const block = draft.config[blockKey];
  if (!Helpers.isConfigBlock(block) || !Helpers.hasOwn(block, key)) return;
  const next = { ...block };
  delete next[key];
  const config = { ...draft.config };
  if (Object.keys(next).length > 0) config[blockKey] = next;
  else {
    delete config[blockKey];
    draft.authoredRootKeys.delete(blockKey);
  }
  draft.config = config;
}

/**
 * Deletes a layout's whole block: every line it holds and every key it holds text for, each as
 * one line's reset, which forgets the text held for it (a synthetic field's included), then the
 * block.
 *
 * @param draft - What the reset builds
 * @param blockKey - The block
 */
function removeBlock(draft: Draft, blockKey: string): void {
  const block = draft.config[blockKey];
  const held = Object.keys(draft.pending).flatMap((key) =>
    key.startsWith(`${blockKey}.`)
      ? Synthetic.configKeysForField(key.slice(blockKey.length + 1))
      : [],
  );
  const keys = new Set([...(Helpers.isConfigBlock(block) ? Object.keys(block) : []), ...held]);
  for (const key of keys) removeInBlock(draft, blockKey, key);
  if (Helpers.hasOwn(draft.config, blockKey)) {
    const config = { ...draft.config };
    delete config[blockKey];
    draft.config = config;
    draft.authoredRootKeys.delete(blockKey);
  }
}

/**
 * Deletes one line by its path: at the root, in a layout's block, or nested in another block.
 *
 * @param draft - What the reset builds
 * @param path - Path of the line, outermost first
 */
function removePath(draft: Draft, path: ReadonlyArray<string>): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    if (BLOCK_KEYS.has(path[0])) removeBlock(draft, path[0]);
    else removeRoot(draft, path[0]);
    return;
  }
  if (path.length === 2 && BLOCK_KEYS.has(path[0])) {
    removeInBlock(draft, path[0], path[1]);
    return;
  }

  delete draft.pending[path.join('.')];
  const enclosing = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = Routing.atPath(
    draft.config,
    enclosing.slice(0, -1),
    enclosing[enclosing.length - 1],
  );
  if (!Helpers.isConfigBlock(parent) || !Helpers.hasOwn(parent, key)) return;
  draft.config = Routing.writePath(draft.config, enclosing, key, undefined);
}

/**
 * Deletes a card field's lines in a workspace: every key it writes, each at the destination the
 * workspace routes it to, and the text held for it and for every synthetic field sharing a key.
 *
 * @param draft - What the reset builds
 * @param dataPath - The field's enclosing data keys
 * @param keys - The keys it writes
 * @param workspace - The workspace whose lines go
 */
function removeField(
  draft: Draft,
  dataPath: ReadonlyArray<string>,
  keys: ReadonlyArray<string>,
  workspace: EditorWorkspace,
): void {
  if (dataPath.length > 0) {
    for (const key of keys) removePath(draft, [...dataPath, key]);
    return;
  }

  // Each line's reset forgets the text held for it, this field's and every synthetic sibling's.
  for (const key of keys) {
    const block = Routing.destination(key, workspace);
    if (block === undefined) removeRoot(draft, key);
    else removeInBlock(draft, block, key);
  }
}

/**
 * The fields of a family, in registry order, on the card's pages or on a calendar entry's.
 *
 * @param headings - Where to look
 * @param family - The family
 * @returns Its members' ids
 */
function familyMembers(headings: ReadonlyArray<HeadingDef>, family: FamilyId): FieldId[] {
  return headings.flatMap((heading) =>
    heading.fields.flatMap(([id, appearance]) =>
      typeof appearance === 'object' && 'family' in appearance && appearance.family === family
        ? [id]
        : [],
    ),
  );
}

/**
 * The card fields of a family.
 *
 * @param family - The family
 * @returns Its members' ids
 */
export function cardFamilyMembers(family: FamilyId): FieldId[] {
  return familyMembers(
    PAGES.flatMap((page) => page.headings),
    family,
  );
}

/**
 * The calendar fields of a family.
 *
 * @param family - The family
 * @returns Its members' ids
 */
export function entryFamilyMembers(family: FamilyId): FieldId[] {
  return familyMembers(ENTRY_GROUPS, family);
}

/**
 * The keys a card field writes, from its id: what `field-index.ts` › `IndexedField.configKeys`
 * holds for one.
 *
 * @param id - Card field id
 * @returns Its enclosing data keys and the keys it writes
 */
function cardField(id: FieldId): { dataPath: ReadonlyArray<string>; keys: ReadonlyArray<string> } {
  const { dataPath, name } = parseFieldId(id);
  return { dataPath, keys: dataPath.length === 0 ? Synthetic.configKeysForField(name) : [name] };
}

/**
 * Deletes options from one calendar entry, by its key.
 *
 * @param draft - What the reset builds
 * @param state - The editor's state, for the entry keys
 * @param key - The entry's key
 * @param keys - Options to delete
 */
function removeFromEntry(
  draft: Draft,
  state: WriteState,
  key: number,
  keys: ReadonlyArray<string>,
): void {
  const entities = (draft.config.entities ?? []) as ReadonlyArray<string | Types.EntityConfig>;
  const index = state.entryKeys.indexOf(key);
  if (index < 0 || index >= entities.length) return;
  const next = Entities.resetEntry(entities, index, keys);
  if (next.every((entry, at) => entry === entities[at])) return;
  draft.config = { ...draft.config, entities: next };
}

/**
 * The added-set keys of a calendar entry's fields that write any of some options.
 *
 * @param key - The entry's key
 * @param keys - Options
 * @returns `entry:<key>:<id>` for each such field
 */
function entryFieldsWriting(key: number, keys: ReadonlyArray<string>): string[] {
  return ENTRY_GROUPS.flatMap((heading) => heading.fields)
    .filter(([id]) => entityConfigKeys(parseFieldId(id).name).some((each) => keys.includes(each)))
    .map(([id]) => `entry:${key}:${id}`);
}

/**
 * Resets a target: deletes its lines where they are stored, with the authored root keys, the Grid
 * reset keys and the held text updated in the same step. The state handed in is not changed.
 *
 * @param state - The editor's state
 * @param target - What to reset
 * @returns The state after the reset, and the added-set keys it retires
 */
export function reset(state: WriteState, target: ResetTarget): ResetResult {
  const draft: Draft = {
    config: { ...(state.config as unknown as Record<string, unknown>) },
    pending: { ...state.pending },
    authoredRootKeys: new Set(state.authoredRootKeys),
    gridResetKeys: new Set(state.gridResetKeys),
  };
  let clearAdded: string[] = [];

  switch (target.kind) {
    case 'field': {
      const { field, workspace } = target;
      removeField(draft, field.dataPath, field.configKeys, workspace);
      clearAdded = [field.id];
      break;
    }
    case 'family': {
      const members = cardFamilyMembers(target.family);
      for (const id of members) {
        const { dataPath, keys } = cardField(id);
        removeField(draft, dataPath, keys, target.workspace);
      }
      clearAdded = [`family:${target.family}`, ...members];
      break;
    }
    case 'path':
      removePath(draft, target.path);
      break;
    case 'entry':
      removeFromEntry(draft, state, target.key, target.keys);
      clearAdded = entryFieldsWriting(target.key, target.keys);
      break;
    case 'entry-family': {
      const members = entryFamilyMembers(target.family);
      const keys = [...new Set(members.flatMap((id) => entityConfigKeys(parseFieldId(id).name)))];
      removeFromEntry(draft, state, target.key, keys);
      clearAdded = [
        `entry:${target.key}:family:${target.family}`,
        ...members.map((id) => `entry:${target.key}:${id}`),
      ];
      break;
    }
    case 'block':
      removeBlock(draft, target.blockKey);
      break;
  }

  return {
    state: {
      ...state,
      config: draft.config as unknown as Types.Config,
      pending: draft.pending,
      authoredRootKeys: draft.authoredRootKeys,
      gridResetKeys: draft.gridResetKeys,
    },
    clearAdded,
  };
}
