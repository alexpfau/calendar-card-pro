/**
 * What the warm-up's tests share: reading what the warm-up holds and what the editor's forms draw,
 * and the walk over the gate corpus, which runs in files of its own (`corpusShard`).
 *
 * The walk visits every page in every corpus state, so it is most of the warm-up's cost: about ten
 * minutes on CI's runner in one file, where a file's tests run one after another. Split into
 * `tests/editor-warm-up-corpus-<n>.test.ts`, each a sixth of the corpus on an editor of its own,
 * the shards run side by side, in one run's workers or across CI's test jobs. What needs every
 * state at once stays in `tests/editor-warm-up.test.ts`, which also checks that each shard has its
 * file and that the shards take every state once.
 */

import { setTimeout as nodeTimeout } from 'node:timers';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { editLayout, formsOf, mountEditor, openPanels } from './editor-host';
import { shardIndices, shardOf } from './file-shards';
import * as Config from '../../src/config/config';
import {
  buildFieldIndex,
  entityFieldIndex,
  schemaCtx,
} from '../../src/rendering/editor/field-index';
import { isHeading } from '../../src/rendering/editor/filter';
import { type CorpusState, corpus } from '../../src/rendering/editor/gates';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import { VALUE_SELECTORS } from '../../src/rendering/editor/hass-key';
import { PANELS } from '../../src/rendering/editor/panels';
import { ENTITY_PATH } from '../../src/rendering/editor/schemas/calendars';

/** An editor. */
export type Editor = Awaited<ReturnType<typeof mountEditor>>;

/** A form as the tests read it. */
export type Form = HTMLElement & {
  schema: HaFormSchema[];
  hass?: unknown;
  data?: Record<string, unknown>;
};

/**
 * The element Home Assistant draws a node with: `ha-selector-` and the selector's key for a field,
 * `ha-form-` and the node's type for anything else.
 *
 * @param node - Schema node
 * @returns The tag
 */
export function elementFor(node: HaFormSchema): string {
  return 'selector' in node
    ? `ha-selector-${Object.keys(node.selector)[0]}`
    : `ha-form-${(node as { type: string }).type}`;
}

/**
 * Every element some schemas draw, at any depth.
 *
 * @param schemas - Schemas
 * @returns The tags, sorted
 */
export function elements(schemas: Iterable<ReadonlyArray<HaFormSchema>>): string[] {
  const tags = new Set<string>();
  const walk = (schema: ReadonlyArray<HaFormSchema>): void => {
    for (const node of schema) {
      tags.add(elementFor(node));
      if ('schema' in node) walk(node.schema);
    }
  };
  for (const schema of schemas) walk(schema);
  return [...tags].sort();
}

/** Orders pairs by their JSON, so that two lists of them compare as sets. */
export const byJson = (a: unknown, b: unknown): number =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

/**
 * The warm-up: a child of the editor's own element, never of its shadow root.
 *
 * @param editor - The editor
 * @returns It, or null once it is gone
 */
export const warmUp = (editor: Editor) => editor.querySelector<HTMLElement>(':scope > div');

/** The warm-up's form, or null. */
export const warmForm = (editor: Editor) =>
  warmUp(editor)?.querySelector<Form>(':scope > ha-form') ?? null;

/**
 * Whether a node of the warm-up form holds a value rather than standing for its element: such a
 * node is named by its element's tag and the value as JSON.
 *
 * @param node - A node of the warm-up form
 * @returns True for a value
 */
export const holdsValue = (node: HaFormSchema): boolean =>
  node.name.startsWith(`${elementFor(node)} `);

/**
 * The elements the warm-up form holds a node for. A node that stands for its element is held once
 * for it, a group without its children; one holding a value draws its element too.
 *
 * @param editor - The editor
 * @returns The tags, sorted; none once the form is gone
 */
export function warmed(editor: Editor): string[] {
  const form = warmForm(editor);
  if (!form) return [];
  const types = form.schema.filter((node) => !holdsValue(node)).map(elementFor);
  expect(new Set(types).size, 'one node for each element').toBe(types.length);
  expect(form.schema.filter((node) => 'schema' in node && node.schema.length > 0)).toEqual([]);
  return [...new Set(form.schema.map(elementFor))].sort();
}

/**
 * The values the warm-up form holds, each with the element that draws it. Each is held once, under
 * the name of the node holding it, and its data holds nothing else.
 *
 * @param editor - The editor
 * @returns The pairs, sorted
 */
export function warmValues(editor: Editor): [string, unknown][] {
  const form = warmForm(editor);
  if (!form) return [];
  const nodes = form.schema.filter(holdsValue);
  expect(Object.keys(form.data ?? {}).sort()).toEqual(nodes.map((node) => node.name).sort());
  return nodes
    .map((node): [string, unknown] => {
      const tag = elementFor(node);
      expect(form.data![node.name], node.name).toEqual(JSON.parse(node.name.slice(tag.length + 1)));
      return [tag, form.data![node.name]];
    })
    .sort(byJson);
}

/**
 * The elements the editor's forms draw once every panel is open.
 *
 * @param editor - The editor
 * @returns The tags, sorted
 */
export async function drawn(editor: Editor): Promise<string[]> {
  await openPanels(editor);
  return elements(
    // Every page's forms, as the harness keeps them from its visit, the overview's live.
    formsOf(editor).map((form) => form.schema),
  );
}

/**
 * The values the editor's forms hold, once every panel is open, in fields of the types in
 * `VALUE_SELECTORS`, each with the element that draws it: read off each form's own schema and data
 * as `ha-form` reads them, a field's value under its name, a group's children from its own value
 * unless it is unnamed or flattened.
 *
 * @param editor - The editor
 * @returns The pairs, each once, sorted
 */
export async function drawnValues(editor: Editor): Promise<[string, unknown][]> {
  await openPanels(editor);
  const found = new Map<string, [string, unknown]>();
  const walk = (schema: ReadonlyArray<HaFormSchema>, data: unknown): void => {
    for (const node of schema) {
      const value =
        !node.name || ('flatten' in node && node.flatten)
          ? data
          : (data as Record<string, unknown> | undefined)?.[node.name];
      if (
        'selector' in node &&
        value !== undefined &&
        VALUE_SELECTORS.some((type) => type in node.selector)
      ) {
        const pair: [string, unknown] = [elementFor(node), value];
        found.set(JSON.stringify(pair), pair);
      }
      if ('schema' in node) walk(node.schema, value);
    }
  };
  for (const form of formsOf(editor)) {
    walk(form.schema, form.data);
  }
  return [...found.values()].sort(byJson);
}

/** One calendar and nothing else. */
export const ANNA = { config_version: Config.CURRENT_CONFIG_VERSION, entities: ['calendar.anna'] };

/** The files the corpus walk is split into, `<CORPUS_PREFIX>-<n>.test.ts`. */
export const CORPUS_SHARDS = 6;

/** The corpus walk's files' prefix (`file-shards.ts`). */
export const CORPUS_PREFIX = 'editor-warm-up-corpus';

/** The gate corpus, each state once. */
export const CORPUS_STATES: ReadonlyArray<CorpusState> = [
  ...new Map(
    corpus().map((state) => [`${state.workspace} ${JSON.stringify(state.config)}`, state]),
  ).values(),
];

/**
 * The corpus states a shard takes: every `CORPUS_SHARDS`th, from its own place.
 *
 * @param shard - The shard, from 1
 * @returns Their indexes into `CORPUS_STATES`
 */
export const shardStates = (shard: number): number[] =>
  shardIndices(CORPUS_STATES.length, shard, CORPUS_SHARDS);

/**
 * Every element the builders build for a corpus state: each field lifted out of its panel, in a
 * form of its own, and each of a calendar entry's on its page; buttons keep their sub-forms, less
 * the sub-heading their panels caption.
 *
 * @param state - The corpus state
 * @returns The tags, sorted
 */
export function builtElements(state: CorpusState): string[] {
  const ctx = schemaCtx(state.config, state.workspace, 'en');
  const lifted = [...buildFieldIndex(ctx).fields.values()].map((field) => field.lifted);
  const subforms = PANELS.flatMap((panel) =>
    (panel.subforms?.(ctx) ?? []).flatMap((subform) =>
      subform.path.join() === ENTITY_PATH.join()
        ? [...entityFieldIndex(subform.schema).fields.values()].map((field) => field.lifted)
        : [subform.schema.filter((node) => !isHeading(node))],
    ),
  );
  return elements([...lifted, ...subforms]);
}

/**
 * Sets a corpus state on an editor and opens its layout, as the corpus walk reads it.
 *
 * @param editor - The editor
 * @param state - The corpus state
 */
export async function applyState(editor: Editor, state: CorpusState): Promise<void> {
  // A task between states, so what each state's visit to every page left behind is let go.
  await new Promise((resolve) => nodeTimeout(resolve, 0));
  editor.setConfig({ ...state.config, config_version: Config.CURRENT_CONFIG_VERSION });
  await editor.updateComplete;
  await editLayout(editor, state.workspace);
}

/**
 * The corpus walk for the shard a file's name gives: every page visited in each of its states with
 * every setting shown, and what the warm-up holds compared with what the forms draw. Called once by
 * each `tests/editor-warm-up-corpus-<n>.test.ts`, which hold nothing else.
 *
 * @param url - The calling file's `import.meta.url`
 */
export function corpusShard(url: string): void {
  const shard = shardOf(url, CORPUS_PREFIX, CORPUS_SHARDS);

  describe('the warm-up form', () => {
    // These read what it holds, and nothing below it is ever defined here: held still, its timers
    // cannot draw it away under them, as its time bound otherwise would on a slow machine.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    // Each shard takes about a sixth of the corpus, over five workspaces since Month; the limit is
    // set for CI's slower runner under load rather than for a hang. Shards measured 41 to 44 s on
    // CI with four workspaces, and with five up to 104 s on a slower run, too near the 150 s they
    // had.
    it(`holds each element and each value the forms draw with every panel open, across corpus shard ${shard} of ${CORPUS_SHARDS}`, async () => {
      const taken = shardStates(shard);
      expect(taken.length, 'a shard that takes no state proves nothing').toBeGreaterThan(0);
      const editor = await mountEditor(ANNA);
      for (const index of taken) {
        const state = CORPUS_STATES[index]!;
        await applyState(editor, state);
        const warm = warmed(editor);
        const held = warmValues(editor);
        const label = `${state.workspace} ${state.display} ${state.gate ?? 'fresh'}`;
        expect(warm, label).toEqual(await drawn(editor));
        expect(held, label).toEqual(await drawnValues(editor));
      }
    }, 180_000);
  });
}
