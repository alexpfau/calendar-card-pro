/**
 * Every field the editor builds is reached through the editor it draws: for every gate corpus
 * state and every scope, each present card field is found by clicking its page's row on the
 * overview (or on the overview itself, for the overview's own fields), in a `[data-field]` frame
 * holding a form whose schema carries the field's node.
 *
 * This replaces "the harness suite still passes" as the proof that moving fields onto pages lost
 * none: the harness navigates for its tests, so it can only fail on a field a test happens to
 * edit, where this walks the whole present index (`field-index.ts` › `buildFieldIndex`).
 */
import { setTimeout as nodeTimeout } from 'node:timers/promises';

import { afterAll, describe, expect, it } from 'vitest';

import { type MountedEditor, changeField, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { type ColorSpec, cardColorFields } from '../src/rendering/editor/colors';
import { type FieldId, buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { placementOf } from '../src/rendering/editor/pages';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const STATES = corpus();

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
 * index built for that id, or where it draws that id's color control, which reaches the value of
 * a mode it absorbs as well.
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
  return [...byName].filter(([, ids]) => ids.length > 1).map(([name, ids]) => `${name}: ${ids}`);
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

describe('reachability through rendered navigation', () => {
  let editor: MountedEditor | undefined;
  afterAll(() => editor?.remove());

  it('reaches every present card field from its page row, each named apart, over the corpus in every scope', async () => {
    editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    const missing = new Map<string, FieldId[]>();
    const clashes = new Set<string>();
    let states = 0;
    let visits = 0;
    let fields = 0;
    const seen = new Set<string>();
    for (const workspace of WORKSPACES) {
      for (const state of STATES.filter((candidate) => candidate.workspace === workspace)) {
        const config = state.config as Types.Config;
        const key = `${workspace} ${JSON.stringify(config)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        states += 1;

        const ctx = schemaCtx(config, workspace, 'en');
        const present = [...buildFieldIndex(ctx).fields.values()];
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
        // Back to the overview, as Back would take a user there, then the state's scope.
        while (editor.shadowRoot!.querySelector('[data-focus="back-top"]') !== null) {
          await click(editor, '[data-focus="back-top"]');
        }
        await changeField(editor, 'workspace:editing_workspace', workspace);

        const found = new Set<FieldId>(reached(editor, nodes, colors));
        for (const clash of sharedNames(editor)) clashes.add(`overview ${clash}`);
        for (const page of byPage.keys()) {
          if (page === 'overview' || page === 'unplaced') continue;
          await click(editor, `[data-focus="nav:${page}"]`);
          visits += 1;
          for (const id of reached(editor, nodes, colors)) found.add(id);
          for (const clash of sharedNames(editor)) clashes.add(`${page} ${clash}`);
          await click(editor, '[data-focus="back-top"]');
        }
        const lost = present.map((field) => field.id).filter((id) => !found.has(id));
        if (lost.length > 0)
          missing.set(`${workspace} ${state.display} ${state.gate ?? 'fresh'}`, lost);
        // Lets the timers the renders queued run, so what they hold is let go.
        await nodeTimeout(0);
      }
    }
    console.info(
      `reachability: ${states} corpus states over ${WORKSPACES.length} scopes, ` +
        `${visits} page visits, ${fields} present fields`,
    );
    expect(fields).toBeGreaterThan(10_000);
    expect(Object.fromEntries(missing)).toEqual({});
    // No two fields drawn on one place share an accessible name.
    expect([...clashes]).toEqual([]);
  }, 600_000);
});
