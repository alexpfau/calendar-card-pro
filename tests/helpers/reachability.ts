/**
 * The walk `editor-reachability.test.ts` pins, split across `editor-reachability-<n>.test.ts` so
 * that its shards run side by side (`file-shards.ts`): for every gate corpus state and every scope,
 * each present card field is found by clicking its page's row on the overview (or on the overview
 * itself, for the overview's own fields), in a `[data-field]` frame holding a form whose schema
 * carries the field's node.
 *
 * In one test it took three and a half minutes on CI's runner, the longest single test in the
 * suite, and it reached its file last of all, as Vitest runs larger files first where it has no
 * timings. Its main file keeps what needs the whole corpus at once: that every shard has its file,
 * that the shards take each state once, and the count of present fields over all of them.
 */
import { setTimeout as nodeTimeout } from 'node:timers/promises';

import { afterAll, describe, expect, it } from 'vitest';

import { type MountedEditor, mountEditor, unfoldAll } from './editor-host';
import { shardIndices, shardOf } from './file-shards';
import * as Config from '../../src/config/config';
import type * as Types from '../../src/config/types';
import { type ColorSpec, cardColorFields } from '../../src/rendering/editor/colors';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  schemaCtx,
} from '../../src/rendering/editor/field-index';
import { type CorpusState, corpus } from '../../src/rendering/editor/gates';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import { TOPIC_PAGES, placementOf } from '../../src/rendering/editor/pages';
import { leavesKeptOut } from '../../src/rendering/editor/plan';
import { type EditorWorkspace, WORKSPACES } from '../../src/rendering/editor/workspace';

/** The files the walk is split into, `<REACH_PREFIX>-<n>.test.ts`. */
export const REACH_SHARDS = 3;

/** The walk's files' prefix (`file-shards.ts`). */
export const REACH_PREFIX = 'editor-reachability';

/** A corpus state, in the scope it is walked in. */
export interface ScopedState {
  workspace: EditorWorkspace;
  state: CorpusState;
}

/** Every corpus state in every scope, each once, scope by scope. */
export const REACH_STATES: ReadonlyArray<ScopedState> = (() => {
  const states = corpus();
  const seen = new Set<string>();
  const scoped: ScopedState[] = [];
  for (const workspace of WORKSPACES) {
    for (const state of states.filter((candidate) => candidate.workspace === workspace)) {
      const key = `${workspace} ${JSON.stringify(state.config)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      scoped.push({ workspace, state });
    }
  }
  return scoped;
})();

/**
 * The states a shard takes: every `REACH_SHARDS`th, from its own place.
 *
 * @param shard - The shard, from 1
 * @returns Their indexes into `REACH_STATES`
 */
export const reachShardStates = (shard: number): number[] =>
  shardIndices(REACH_STATES.length, shard, REACH_SHARDS);

/**
 * Every field built for a state, but a kept setting the card does not hold (`leavesKeptOut`).
 *
 * @param scoped - The state, in its scope
 * @returns The fields
 */
export function presentFields({ workspace, state }: ScopedState): IndexedField[] {
  const config = state.config as Types.Config;
  const ctx = schemaCtx(config, workspace, 'en');
  return [...buildFieldIndex(ctx).fields.values()].filter(
    (field) => !leavesKeptOut(field.id, config as unknown as Record<string, unknown>, workspace),
  );
}

/**
 * Whether a schema holds a node, compared by structure.
 *
 * @param schema - The schema a form was handed
 * @param node - The node looked for
 * @returns Whether some node of the schema, at any depth, is that node
 */
function holds(schema: ReadonlyArray<HaFormSchema>, node: unknown): boolean {
  const wanted = JSON.stringify(node);
  const walk = (nodes: ReadonlyArray<HaFormSchema>): boolean =>
    nodes.some(
      (candidate) =>
        JSON.stringify(candidate) === wanted ||
        ('schema' in candidate && Array.isArray(candidate.schema) && walk(candidate.schema)),
    );
  return walk(schema);
}

/**
 * The fields reached on the open place: each frame's id, where its form holds the node the
 * index built for that id, where it draws that id's color control, which reaches the value of
 * a mode it absorbs as well, or where it is a control composed for that id.
 *
 * @param editor - Editor element
 * @param nodes - The present fields' nodes by id
 * @param colors - The color specs, by the ids they are drawn for (`colors.ts` › `cardColorFields`)
 * @returns The ids reached
 */
function reached(
  editor: MountedEditor,
  nodes: ReadonlyMap<FieldId, unknown>,
  colors: ReadonlyMap<FieldId, ColorSpec>,
): FieldId[] {
  const frames = editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-field]');
  return [...frames].flatMap((frame) => {
    const id = frame.dataset.field as FieldId;
    // A color control is drawn for its field and edits the value of a mode it absorbs.
    if (frame.classList.contains('color-field')) {
      const spec = colors.get(id);
      const edits = spec === undefined ? [] : spec.mode === id ? [id, spec.value] : [id];
      return edits.filter((each) => nodes.has(each));
    }
    // A control the editor composes for its field reaches that field: Start Date's chips, the
    // line Tapping an Event Opens It gives way to, a word list one term at a time.
    if (frame.hasAttribute('data-composed')) return nodes.has(id) ? [id] : [];
    const form = frame.querySelector('ha-form') as { schema?: ReadonlyArray<HaFormSchema> } | null;
    return form?.schema && nodes.has(id) && holds(form.schema, nodes.get(id)) ? [id] : [];
  });
}

/**
 * The accessible names two or more fields on the open place share.
 *
 * @param editor - Editor element
 * @returns Each shared name, lowercased, with the ids sharing it
 */
function sharedNames(editor: MountedEditor): string[] {
  const byName = new Map<string, string[]>();
  for (const frame of editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-field]')) {
    const name = (frame.getAttribute('aria-label') ?? '').trim().toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), frame.dataset.field!]);
  }
  const buttons = new Map<string, number>();
  for (const control of editor.shadowRoot!.querySelectorAll<HTMLElement>(
    '.line-button, .setting-toggle, .setting-info',
  )) {
    const name = (control.getAttribute('aria-label') ?? control.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    buttons.set(name, (buttons.get(name) ?? 0) + 1);
  }
  return [
    ...[...byName].filter(([, ids]) => ids.length > 1).map(([name, ids]) => `${name}: ${ids}`),
    ...[...buttons].filter(([, count]) => count > 1).map(([name, count]) => `${name}: ${count}`),
  ];
}

/**
 * Clicks a rendered control, then waits for the editor to draw what it opens.
 *
 * @param editor - Editor element
 * @param selector - The control
 */
async function click(editor: MountedEditor, selector: string): Promise<void> {
  const control = editor.shadowRoot!.querySelector<HTMLElement>(selector);
  if (control === null) throw new Error(`The editor draws no ${selector}`);
  control.click();
  await editor.updateComplete;
}

/**
 * The walk for the shard a file's name gives. Called once by each
 * `tests/editor-reachability-<n>.test.ts`, which hold nothing else.
 *
 * @param url - The calling file's `import.meta.url`
 */
export function reachShard(url: string): void {
  const shard = shardOf(url, REACH_PREFIX, REACH_SHARDS);

  describe('reachability through rendered navigation', () => {
    let editor: MountedEditor | undefined;
    afterAll(() => editor?.remove());

    it(`reaches every present card field from its page row, each opened from its head and named apart, over the corpus in every scope, across shard ${shard} of ${REACH_SHARDS}`, async () => {
      editor?.remove();
      editor = await mountEditor({
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
      });
      const missing = new Map<string, FieldId[]>();
      const clashes = new Set<string>();
      let states = 0;
      let visits = 0;
      let fields = 0;
      for (const index of reachShardStates(shard)) {
        const { workspace, state } = REACH_STATES[index]!;
        const config = state.config as Types.Config;
        states += 1;

        const ctx = schemaCtx(config, workspace, 'en');
        const present = presentFields(REACH_STATES[index]!);
        const colors = cardColorFields(ctx).specs;
        const nodes = new Map(present.map((field) => [field.id, field.node]));
        const byPage = new Map<string, FieldId[]>();
        for (const field of present) {
          const page = placementOf(field.id)?.page ?? 'unplaced';
          byPage.set(page, [...(byPage.get(page) ?? []), field.id]);
        }
        fields += present.length;

        // As stored by a card the visual editor wrote: at the current configuration version.
        editor.setConfig({ ...config, config_version: Config.CURRENT_CONFIG_VERSION });
        await editor.updateComplete;
        // Back to the overview, as Back would take a user there; the loop below opens each page
        // itself, a topic from the state's layout row.
        while (editor.shadowRoot!.querySelector('[data-focus="back-top"]') !== null) {
          await click(editor, '[data-focus="back-top"]');
        }

        await unfoldAll(editor);
        const found = new Set<FieldId>(reached(editor, nodes, colors));
        for (const clash of sharedNames(editor)) clashes.add(`overview ${clash}`);
        for (const page of byPage.keys()) {
          if (page === 'overview' || page === 'unplaced') continue;
          // A topic is the layout's, opened from its page; Whole Card's pages from the overview.
          const topic = TOPIC_PAGES.some((each) => each.id === page);
          if (topic) await click(editor, `[data-focus="layout:${workspace}"]`);
          await click(editor, `[data-focus="nav:${page}"]`);
          visits += 1;
          for (const clash of sharedNames(editor)) clashes.add(`${page} ${clash}`);
          await unfoldAll(editor);
          for (const id of reached(editor, nodes, colors)) found.add(id);
          for (const clash of sharedNames(editor)) clashes.add(`${page} ${clash}`);
          await click(editor, '[data-focus="back-top"]');
          if (topic) await click(editor, '[data-focus="back-top"]');
        }
        const lost = present.map((field) => field.id).filter((id) => !found.has(id));
        if (lost.length > 0)
          missing.set(`${workspace} ${state.display} ${state.gate ?? 'fresh'}`, lost);
        // Lets the timers the renders queued run, so what they hold is let go.
        await nodeTimeout(0);
      }
      console.info(
        `reachability, shard ${shard} of ${REACH_SHARDS}: ${states} corpus states, ` +
          `${visits} page visits, ${fields} present fields`,
      );
      expect(states, 'a shard that takes no state proves nothing').toBeGreaterThan(0);
      expect(Object.fromEntries(missing)).toEqual({});
      // No two fields drawn on one place share an accessible name.
      expect([...clashes]).toEqual([]);
    }, 600_000);
  });
}
