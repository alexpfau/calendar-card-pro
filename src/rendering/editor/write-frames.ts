/**
 * What every editor write belongs to, and the part of a change it writes (backlog item 307).
 *
 * A write has an owner: the card, one calendar entry, or one toolbar button. An entry and a button
 * are named by a key the editor gives each of them, never by their place in the list, which a
 * removal above them moves. A form names its owner and the workspace it was drawn for in a frame,
 * built while rendering and closed over by its listener, so a change arriving late reaches what the
 * form was drawn for, never whatever stands in its place now, and one whose owner has left the card
 * writes nothing.
 *
 * A change writes only what moved in the form instance that sent it: the fields whose value differs
 * from that instance's baseline, the data it last showed or sent, laid over its owner as the owner
 * stands when the change arrives. So an instance drawn before another write cannot write back what
 * that write moved, and one that returns a field to the value it was first drawn with writes that
 * value like any other. The card's own forms already wrote this way (`routing.ts` ›
 * `applyWorkspaceChange`); an entry's and a button's are re-read whole at the moment of the change,
 * unknown keys included, because their writers rebuild the entry or the button from the data they
 * are handed (`entities.ts` › `writeEntity`, `buttons.ts` › `writeButton`).
 *
 * The keys are the editor's own, kept in `element.ts` beside the list they parallel. They are never
 * written to the configuration.
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import * as Buttons from './buttons';
import * as Entities from './entities';
import type { IndexedField } from './field-index';
import type { HaFormSchema } from './ha-form';
import * as Routing from './routing';
import { entityIdOf } from './synthetic';
import { deepEqual } from './value';
import type { EditorWorkspace } from './workspace';
import type * as Types from '../../config/types';
import { isConfigBlock, memoizeLast } from '../../utils/helpers';

/** Who a write belongs to: the card, or one entry or one toolbar button, by its key. */
export type WriteOwner =
  | { readonly kind: 'card' }
  | { readonly kind: 'entry'; readonly key: number }
  | { readonly kind: 'button'; readonly key: number };

/** The card, as the owner of every write outside an entry and a toolbar button. */
export const CARD_OWNER: WriteOwner = { kind: 'card' };

/** What one form instance was drawn for, captured at render and handed to every write it makes. */
export interface OwnedFrame {
  readonly owner: WriteOwner;
  /** The workspace the form was drawn for. */
  readonly workspace: EditorWorkspace;
  /** The form's schema. */
  readonly schema: ReadonlyArray<HaFormSchema>;
  /** The baseline: what this instance last showed, as it was drawn, then as it sent it. */
  data: Record<string, unknown>;
}

/**
 * A field as a control the editor draws itself writes it: its node, where its data nests, and the
 * node in a form of its own (`field-index.ts` › `IndexedField`, which is one).
 */
export type WrittenField = Pick<IndexedField, 'node' | 'dataPath' | 'lifted'>;

/** What a write reads of the editor. */
export interface WriteState {
  readonly config: Types.Config;
  readonly pending: Readonly<Record<string, string>>;
  readonly authoredRootKeys: ReadonlySet<string>;
  readonly gridResetKeys: ReadonlySet<string>;
  /** A key per entry, in the order of `config.entities`. */
  readonly entryKeys: ReadonlyArray<number>;
  /** A key per toolbar button, in the order of `toolbar.buttons`. */
  readonly buttonKeys: ReadonlyArray<number>;
}

/** The card's form data for a workspace, made again only when one of its inputs moves. */
const cardData = memoizeLast(Routing.workspaceFormData);

/**
 * Where an entry or a button stands in its list now.
 *
 * @param owner - An entry or a button
 * @param state - The editor's state
 * @returns The list and the owner's place in it; undefined where the owner has left
 */
function placeOf(
  owner: WriteOwner,
  state: WriteState,
): { readonly list: ReadonlyArray<unknown>; readonly index: number } | undefined {
  if (owner.kind === 'card') return undefined;
  const list =
    owner.kind === 'entry' ? (state.config.entities ?? []) : Buttons.writtenButtons(state.config);
  const index = (owner.kind === 'entry' ? state.entryKeys : state.buttonKeys).indexOf(owner.key);
  return index >= 0 && index < list.length ? { list, index } : undefined;
}

/**
 * An owner's form data as it stands now: the card's for a workspace, or an entry's or a button's
 * whole projection, unknown keys included.
 *
 * @param owner - The owner
 * @param state - The editor's state
 * @param workspace - The workspace the card's data is projected for
 * @returns The data; undefined for an entry or a button that has left
 */
export function projectionFor(
  owner: WriteOwner,
  state: WriteState,
  workspace: EditorWorkspace,
): Record<string, unknown> | undefined {
  if (owner.kind === 'card') return cardData(state.config, workspace, state.pending);
  const place = placeOf(owner, state);
  if (place === undefined) return undefined;
  const entry = place.list[place.index];
  return owner.kind === 'entry'
    ? Entities.toEntityFormData(
        entry as string | Types.EntityConfig,
        place.list as ReadonlyArray<string | Types.EntityConfig>,
      )
    : Buttons.toButtonFormData(entry);
}

/**
 * What a change writes: the path of every field the frame's form draws whose value in the change
 * differs from the frame's baseline. A compound value, such as an action, is compared whole.
 *
 * @param frame - The frame of the form that sent the change
 * @param incoming - The form's whole data, as it sent it
 * @returns The changed paths, each its enclosing data keys and then the field's name
 */
export function writeSet(
  frame: OwnedFrame,
  incoming: Record<string, unknown>,
): ReadonlyArray<ReadonlyArray<string>> {
  const changed: string[][] = [];
  for (const { node, path } of Routing.workspaceFields(frame.schema)) {
    if (
      !deepEqual(
        Routing.atPath(frame.data, path, node.name),
        Routing.atPath(incoming, path, node.name),
      )
    ) {
      changed.push([...path, node.name]);
    }
  }
  return changed;
}

/**
 * Folds a change into the configuration, for the owner its frame names.
 *
 * The card's goes through `routing.ts` › `applyWorkspaceChange`, which writes the fields that
 * moved against the frame's baseline into the frame's workspace. An entry's or a button's is
 * re-read whole as it stands now, the change's write set laid over it, and written whole, so
 * nothing the change did not move is written back. Either way the frame's baseline becomes the
 * change.
 *
 * @param state - The editor's state
 * @param frame - The frame of the form that sent the change
 * @param incoming - The form's whole data, as it sent it
 * @param hass - Home Assistant, from which an entry's writer seeds an icon
 * @returns The configuration and held text after the change; undefined where an entry or a button
 *   has left, or its change writes nothing
 */
export function applyOwnedChange(
  state: WriteState,
  frame: OwnedFrame,
  incoming: Record<string, unknown>,
  hass?: Types.Hass,
): { config: Types.Config; pending: Record<string, string> } | undefined {
  const { owner } = frame;
  if (owner.kind === 'card') {
    const applied = Routing.applyWorkspaceChange(
      state.config,
      frame,
      incoming,
      state.pending,
      state.gridResetKeys,
      state.authoredRootKeys,
    );
    // Keep what the form sent, not newly derived synthetic values it has not seen yet.
    frame.data = structuredClone(incoming);
    return applied;
  }

  const place = placeOf(owner, state);
  if (place === undefined) return undefined;
  const changed = writeSet(frame, incoming);
  frame.data = structuredClone(incoming);
  if (changed.length === 0) return undefined;

  let data = projectionFor(owner, state, frame.workspace)!;
  for (const path of changed) {
    const enclosing = path.slice(0, -1);
    const name = path[path.length - 1];
    data = Routing.writePath(data, enclosing, name, Routing.atPath(incoming, enclosing, name));
  }

  if (owner.kind === 'entry') {
    const entities = place.list as ReadonlyArray<string | Types.EntityConfig>;
    const next = Entities.writeEntity(entities, place.index, data, state.config.accent_color, hass);
    return deepEqual(next, entities)
      ? undefined
      : { config: { ...state.config, entities: next }, pending: { ...state.pending } };
  }

  const buttons = Buttons.writeButton(place.list, place.index, data);
  if (deepEqual(buttons, place.list)) return undefined;
  const toolbar = isConfigBlock(state.config.toolbar) ? state.config.toolbar : {};
  return {
    config: {
      ...state.config,
      toolbar: { ...toolbar, buttons: buttons as Types.ToolbarButtonConfig[] },
    },
    pending: { ...state.pending },
  };
}

/**
 * The frame a control the editor draws itself writes through, for some of an owner's fields: their
 * one-field forms side by side, and as baseline the owner's data as it stands now (for the card,
 * the part of it those fields read). Laying values over that baseline (`withValue`) gives the
 * change to hand `applyOwnedChange`, which then writes those fields and nothing else.
 *
 * @param owner - The owner
 * @param fields - The fields written, each as the owner draws it
 * @param state - The editor's state
 * @param workspace - The workspace written in
 * @returns The frame; undefined for an entry or a button that has left
 */
export function frameFor(
  owner: WriteOwner,
  fields: ReadonlyArray<WrittenField>,
  state: WriteState,
  workspace: EditorWorkspace,
): OwnedFrame | undefined {
  const projection = projectionFor(owner, state, workspace);
  if (projection === undefined) return undefined;
  const schema = fields.flatMap((field) => field.lifted);
  return {
    owner,
    workspace,
    schema,
    data: owner.kind === 'card' ? Routing.formDataFor(projection, schema) : projection,
  };
}

/**
 * Form data with one field's value replaced at its data path, every other value kept, as a form
 * sends a change.
 *
 * @param data - Form data
 * @param field - The field
 * @param value - Its new value
 * @returns The new data
 */
export function withValue(
  data: Record<string, unknown>,
  field: WrittenField,
  value: unknown,
): Record<string, unknown> {
  return Routing.writePath(data, field.dataPath, field.node.name, value);
}

/**
 * Keys for a list the editor did not change itself, such as one edited in YAML: each place keeps
 * the key it had, and a place the list did not have before takes a new one. What a change from
 * outside did to the entries cannot be known, so their places are all there is to go by.
 *
 * @param keys - The keys as they were
 * @param length - How many the list holds now
 * @param mint - Makes a new key
 * @returns A key per place, in order
 */
export function keysByPosition(
  keys: ReadonlyArray<number>,
  length: number,
  mint: () => number,
): number[] {
  return Array.from({ length }, (_, at) => (at < keys.length ? keys[at] : mint()));
}

/**
 * Keys for an entry list rebuilt a calendar at a time, as the calendar picker's `apply` and
 * Quick Setup rebuild it: each calendar's entries in the order they had, so the n-th entry of a
 * calendar now is the n-th it had before, and keeps that one's key. An entry of a calendar the
 * list did not hold takes a new key, and an entry that is gone takes its key with it.
 *
 * 🚨 This mirrors `synthetic.ts` › `SYNTHETIC_FIELDS.calendars`' `apply`, which hands every
 * calendar back its whole queue of entries. Change one and the other together.
 *
 * @param before - The list as it was
 * @param keys - A key per entry of `before`
 * @param after - The list as it is now
 * @param mint - Makes a new key
 * @returns A key per entry of `after`, in order
 */
export function carryEntryKeys(
  before: ReadonlyArray<string | Types.EntityConfig>,
  keys: ReadonlyArray<number>,
  after: ReadonlyArray<string | Types.EntityConfig>,
  mint: () => number,
): number[] {
  const queues = new Map<string, number[]>();
  before.forEach((entry, at) => {
    const id = entityIdOf(entry);
    if (at < keys.length) queues.set(id, [...(queues.get(id) ?? []), keys[at]]);
  });
  return after.map((entry) => queues.get(entityIdOf(entry))?.shift() ?? mint());
}
