/**
 * The warm-up form (backlog item 307).
 *
 * Home Assistant's `ha-form` and `ha-selector` import the element a node needs the first time a form
 * holds one, and Home Assistant measures a panel one render after it starts to open. Once panels
 * mounted their forms only as they opened, a panel whose elements were still loading opened short
 * on its first click, which a dialog that drew every form as it opened had never done. So the
 * editor draws, as it opens, one form holding a node for each element its forms draw that is not
 * defined yet, and draws it away once Home Assistant has defined every one.
 *
 * Pinned here: the elements it holds are exactly those the editor's forms draw once every panel is
 * open, state by state across the gate corpus and for calendars and buttons of every kind, and over
 * the corpus exactly those the builders use; a selector a builder starts to use is warmed with
 * nothing else changed; it writes nothing and nothing it fires goes further; it is out of layout,
 * inert, hidden from assistive technology and on the steady feed; it stays until the last of its
 * elements is defined, and a later render warms what it newly draws.
 */

import { LitElement } from 'lit';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  changeField,
  fakeHass,
  lastConfig,
  mountEditor,
  openPageOf,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { schemaCtx } from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PANELS } from '../src/rendering/editor/panels';
import { chassisSchemas } from '../src/rendering/editor/subforms';
import { WORKSPACE_FIELD } from '../src/rendering/editor/workspace';

const plant = vi.hoisted(() => ({ on: false }));

// A selector type no builder uses, added to a panel's build, at its top level and inside a grid,
// to a calendar's form and to a toolbar button's form while `plant.on` is set: nothing but the
// builders learns of it.
vi.mock('../src/rendering/editor/panels', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/rendering/editor/panels')>();
  const { ENTITY_PATH } = await import('../src/rendering/editor/schemas/calendars');
  const { TOOLBAR_BUTTON_PATH } = await import('../src/rendering/editor/schemas/card');
  const planted = (name: string) => ({ name, selector: { [name]: {} } }) as unknown as HaFormSchema;
  const nameFor = (path: ReadonlyArray<string>) =>
    path.join() === ENTITY_PATH.join()
      ? 'planted_calendar'
      : path.join() === TOOLBAR_BUTTON_PATH.join()
        ? 'planted_button'
        : `planted_${path.join('_')}`;
  return {
    ...original,
    PANELS: original.PANELS.map((panel) => ({
      ...panel,
      build: (ctx: Parameters<typeof panel.build>[0]) =>
        plant.on && panel.id === 'layout'
          ? [
              ...panel.build(ctx),
              planted('planted_panel'),
              { type: 'grid', name: '', schema: [planted('planted_nested')] } as HaFormSchema,
            ]
          : panel.build(ctx),
      ...(panel.subforms && {
        subforms: (ctx: Parameters<NonNullable<typeof panel.subforms>>[0]) =>
          panel.subforms!(ctx).map((subform) =>
            plant.on
              ? { ...subform, schema: [...subform.schema, planted(nameFor(subform.path))] }
              : subform,
          ),
      }),
    })),
  };
});

/** An editor. */
type Editor = Awaited<ReturnType<typeof mountEditor>>;

/** A form as the tests read it. */
type Form = HTMLElement & { schema: HaFormSchema[]; hass?: unknown; data?: unknown };

/**
 * The element Home Assistant draws a node with: `ha-selector-` and the selector's key for a field,
 * `ha-form-` and the node's type for anything else.
 *
 * @param node - Schema node
 * @returns The tag
 */
function elementFor(node: HaFormSchema): string {
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
function elements(schemas: Iterable<ReadonlyArray<HaFormSchema>>): string[] {
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

/**
 * The warm-up form: a child of the editor's own element, never of its shadow root.
 *
 * @param editor - The editor
 * @returns The form, or null once it is gone
 */
const warmForm = (editor: Editor) => editor.querySelector<Form>(':scope > ha-form');

/**
 * The elements the warm-up form holds a node for, each once.
 *
 * @param editor - The editor
 * @returns The tags, sorted; none once the form is gone
 */
function warmed(editor: Editor): string[] {
  const form = warmForm(editor);
  if (!form) return [];
  const tags = form.schema.map(elementFor);
  expect(new Set(tags).size, 'one node for each element').toBe(tags.length);
  expect(form.schema.filter((node) => 'schema' in node && node.schema.length > 0)).toEqual([]);
  return [...tags].sort();
}

/**
 * The elements the editor's forms draw once every panel is open.
 *
 * @param editor - The editor
 * @returns The tags, sorted
 */
async function drawn(editor: Editor): Promise<string[]> {
  await openPanels(editor);
  return elements(
    [...editor.shadowRoot!.querySelectorAll<Form>('ha-form')].map((form) => form.schema),
  );
}

/**
 * Lets `customElements.whenDefined` answer, then the update it asks for run.
 *
 * @param editor - The editor
 */
async function settle(editor: Editor): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await editor.updateComplete;
}

/** Calendars and toolbar buttons of every kind the editor draws a form for. */
const KINDS = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: [
    { entity: 'calendar.anna', label: 'person.leo', name: 'Anna at home' },
    { entity: 'calendar.ben', label: 'mdi:home', accent_color: 'var(--accent-color)' },
    { entity: 'calendar.anna', label: '/local/anna.png' },
    {
      entity: 'calendar.ben',
      visibility: [{ condition: 'screen', media_query: '(min-width: 0)' }],
    },
    { entity: 'calendar.anna', visibility: 'only the YAML box shows this' },
    'calendar.ben',
  ],
  weather: { entity: 'weather.home', position: 'both' },
  toolbar: {
    show: true,
    buttons: [
      { icon: 'mdi:lightbulb', entity: 'light.hall' },
      { icon: 'mdi:home', name: 'Home', tap_action: { action: 'navigate', navigation_path: '/' } },
    ],
  },
};

describe('the warm-up form', () => {
  it('holds each element the forms draw with every panel open, across the corpus and the builders', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    const states = [
      ...new Map(
        corpus().map((state) => [`${state.workspace} ${JSON.stringify(state.config)}`, state]),
      ).values(),
    ];
    const warmedAll = new Set<string>();
    const builtAll = new Set<string>();
    for (const state of states) {
      editor.setConfig({ ...state.config, config_version: Config.CURRENT_CONFIG_VERSION });
      await editor.updateComplete;
      if (valueOf(editor, `workspace:${WORKSPACE_FIELD}`) !== state.workspace) {
        await changeField(editor, `workspace:${WORKSPACE_FIELD}`, state.workspace);
      }
      const warm = warmed(editor);
      expect(warm, `${state.workspace} ${state.display} ${state.gate ?? 'fresh'}`).toEqual(
        await drawn(editor),
      );
      warm.forEach((tag) => warmedAll.add(tag));

      const ctx = schemaCtx(state.config, state.workspace, 'en');
      for (const panel of PANELS) {
        const subforms = panel.subforms?.(ctx) ?? [];
        for (const tag of elements([panel.build(ctx), ...subforms.map((s) => s.schema)])) {
          builtAll.add(tag);
        }
      }
    }
    for (const tag of elements(Object.values(chassisSchemas('en')))) builtAll.add(tag);
    console.info(
      `Warm-up: ${states.length} corpus states, ${warmedAll.size} elements: ${[...warmedAll].sort().join(' ')}`,
    );

    expect(warmedAll.size).toBeGreaterThan(3);
    expect([...warmedAll].sort()).toEqual([...builtAll].sort());
  });

  it('holds each element the forms draw for calendars and buttons of every kind, in every workspace', async () => {
    const editor = await mountEditor(KINDS);
    for (const workspace of ['list', 'column', 'grid', 'shared']) {
      await changeField(editor, `workspace:${WORKSPACE_FIELD}`, workspace);
      expect(warmed(editor), workspace).toEqual(await drawn(editor));
    }
    expect(warmed(editor)).toEqual(
      expect.arrayContaining(['ha-selector-entity', 'ha-selector-icon', 'ha-selector-object']),
    );
  });

  it('warms a selector a builder starts to use, in a panel, a calendar or a button', async () => {
    plant.on = true;
    try {
      const editor = await mountEditor(KINDS);
      const warm = warmed(editor);
      expect(warm).toEqual(
        expect.arrayContaining([
          'ha-selector-planted_button',
          'ha-selector-planted_calendar',
          'ha-selector-planted_nested',
          'ha-selector-planted_panel',
        ]),
      );
      expect(warm).toEqual(await drawn(editor));
    } finally {
      plant.on = false;
    }
  });

  it('writes nothing, and nothing it fires goes further', async () => {
    const editor = await mountEditor(KINDS);
    const before = lastConfig(editor);
    const heard: Event[] = [];
    editor.addEventListener('value-changed', (event) => heard.push(event));
    editor.addEventListener('config-changed', (event) => heard.push(event));

    warmForm(editor)!.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { title: 'Planted' } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(heard).toEqual([]);
    expect(lastConfig(editor)).toEqual(before);

    // The control: the same event from beside it reaches the editor.
    const beside = editor.appendChild(document.createElement('div'));
    beside.dispatchEvent(new CustomEvent('value-changed', { bubbles: true, composed: true }));
    expect(heard).toHaveLength(1);
  });

  it('is out of layout and of the accessibility tree, inert, and on the steady feed', async () => {
    // A Home Assistant with a string table, so that the steady feed is a wrapper of its own.
    const hass = fakeHass({ localize: (key: string) => key });
    const editor = await mountEditor(KINDS, { hass });
    const form = warmForm(editor)!;
    // A child of the editor's own element, which its shadow root never slots: never laid out.
    expect(form.parentElement).toBe(editor);
    expect(editor.shadowRoot!.querySelector('slot')).toBeNull();
    expect(form.hasAttribute('inert')).toBe(true);
    expect(form.getAttribute('aria-hidden')).toBe('true');
    const steady = editor.shadowRoot!.querySelector<Form>('ha-form[data-hass="steady"]')!;
    // The control: the steady feed is not Home Assistant's own object, so the two can be told apart.
    expect(steady.hass).not.toBe(hass);
    expect(form.hass).toBe(steady.hass);
    expect(form.data).toEqual({});
  });
});

describe('with Home Assistant’s Visibility editor', () => {
  beforeAll(() => {
    class ConditionsEditorStub extends LitElement {
      static override properties = {
        hass: { attribute: false },
        conditions: { attribute: false },
      };
    }
    customElements.define('ha-card-conditions-editor', ConditionsEditorStub);
  });

  it('warms no YAML box where the Visibility editor draws a calendar’s conditions', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    expect(warmed(editor)).not.toContain('ha-selector-object');
    expect(warmed(editor)).toEqual(await drawn(editor));

    // The control: conditions only the YAML box can show keep it, and warm it.
    const yaml = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [{ entity: 'calendar.anna', visibility: 'only the YAML box shows this' }],
    });
    expect(warmed(yaml)).toContain('ha-selector-object');
    expect(warmed(yaml)).toEqual(await drawn(yaml));
  });
});

describe('once Home Assistant has defined its elements', () => {
  it('stays until the last of them is defined, then is gone', async () => {
    const editor = await mountEditor(KINDS);
    const tags = warmed(editor);
    expect(tags.length).toBeGreaterThan(1);

    for (const tag of tags.slice(0, -1)) customElements.define(tag, class extends HTMLElement {});
    await settle(editor);
    expect(warmed(editor)).toEqual(tags);

    customElements.define(tags[tags.length - 1]!, class extends HTMLElement {});
    await settle(editor);
    expect(warmForm(editor)).toBeNull();
  });

  it('warms what a later render newly draws, and only that', async () => {
    const editor = await mountEditor(KINDS);
    expect(warmForm(editor)).toBeNull();

    await openPageOf(editor, 'card:title');
    plant.on = true;
    try {
      // A new configuration, so every panel is built again, the planted selector with it.
      await changeField(editor, 'card:title', 'Family');
      expect(warmed(editor)).toEqual([
        'ha-selector-planted_button',
        'ha-selector-planted_calendar',
        'ha-selector-planted_nested',
        'ha-selector-planted_panel',
      ]);
    } finally {
      plant.on = false;
    }
  });
});
