/**
 * The warm-up (backlog item 307).
 *
 * Home Assistant's `ha-form` and `ha-selector` import the element a node needs the first time a form
 * holds one, and Home Assistant measures a panel one render after it starts to open. Once panels
 * mounted their forms only as they opened, a panel whose elements were still loading opened short
 * on its first click, which a dialog that drew every form as it opened had never done. So the
 * editor draws, as it opens, one form holding a node for each element its forms draw that is not
 * defined yet, and a node for each value its forms hold in a field whose element draws what its
 * value picks, holding that value; and Home Assistant's Visibility editor holding every calendar's
 * conditions, whose forms it loads on first use as well. It draws them away once nothing below them
 * waits on a definition.
 *
 * Pinned here: the elements it holds are exactly those the editor's forms draw once every panel is
 * open, for calendars and buttons of every kind, and state by state across the gate corpus in
 * `editor-warm-up-corpus-<n>.test.ts`, which run side by side (`helpers/warm-up.ts`); and over the
 * corpus exactly those the builders use; the values it holds are exactly those the open forms
 * hold in such fields, read as `ha-form` reads them; a selector a builder starts to use is warmed
 * with nothing else changed; it writes nothing and nothing it fires goes further; it is out of
 * layout, inert, hidden from assistive technology and on the steady feed, and its Visibility editor
 * is drawn behind the visible one's guard and told the calendar it edits against. With stand-ins
 * that draw as Home Assistant's do, it stays until the last element below it is defined, including
 * what an event's action, a button's action and a calendar's condition pick, holds nothing further
 * for plain ones, is drawn away by its time bound regardless, and a later render warms what it
 * newly draws. `VALUE_SELECTORS` is pinned.
 *
 * Elements stay defined for the rest of a file, so the order of the blocks below matters: the first
 * two run before any of Home Assistant's elements is defined, under timers held still, so that the
 * warm-up stays while they read it; the last one defines the stand-ins as it goes.
 */

import { LitElement, html, nothing } from 'lit';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changeField,
  editLayout,
  fakeHass,
  lastConfig,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import { expectedShardFiles, shardFiles } from './helpers/file-shards';
import {
  ANNA,
  CORPUS_PREFIX,
  CORPUS_SHARDS,
  CORPUS_STATES,
  type Editor,
  type Form,
  applyState,
  builtElements,
  byJson,
  drawn,
  drawnValues,
  elementFor,
  elements,
  holdsValue,
  shardStates,
  warmForm,
  warmUp,
  warmValues,
  warmed,
} from './helpers/warm-up';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { schemaCtx } from '../src/rendering/editor/field-index';
import { NO_FILTER } from '../src/rendering/editor/filter';
import { type HaFormSchema, warmSchema } from '../src/rendering/editor/ha-form';
import { VALUE_SELECTORS } from '../src/rendering/editor/hass-key';
import {
  HA_ACTION_LABEL_PREFIX,
  withCardActionLabels,
} from '../src/rendering/editor/hass-localize';
import { PANELS } from '../src/rendering/editor/panels';
import { chassisSchemas } from '../src/rendering/editor/subforms';

const plant = vi.hoisted(() => ({ on: false, action: false, many: 0, extra: '' }));

// A selector type no builder uses, added to a panel's build, at its top level and inside a grid,
// to a calendar's form and to a toolbar button's form while `plant.on` is set: nothing but the
// builders learns of it. While `plant.action` is set, a calendar's form gains a field of a type
// whose element draws what its value picks, which no calendar's form has today. `plant.many`
// adds that many further selector types to a panel, used nowhere else, and `plant.extra` the one
// it names.
// Pages draw only the fields the registry places, so the planted panel fields are placed on Size &
// Spacing, and the planted calendar fields in a group of an entry's page of their own, as a
// builder's new field must be before any page draws it.
vi.mock('../src/rendering/editor/pages', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/rendering/editor/pages')>();
  const entryIds = ['calendar:planted_calendar', 'calendar:planted_action'];
  const ids = [
    'layout:planted_panel',
    'layout:planted_nested',
    ...Array.from({ length: 12 }, (_, at) => `layout:planted_many${at}`),
    'layout:planted_a',
    'layout:planted_b',
  ];
  const page = original.PAGES.find((candidate) => candidate.id === 'size_spacing')!;
  return {
    ...original,
    PAGES: original.PAGES.map((candidate) =>
      candidate === page
        ? {
            ...page,
            headings: [...page.headings, { fields: ids.map((id) => [id, 'add'] as const) }],
          }
        : candidate,
    ),
    ENTRY_GROUPS: [
      ...original.ENTRY_GROUPS,
      { fields: entryIds.map((id) => [id, 'add'] as const) },
    ],
    placementOf: (id: string) =>
      ids.includes(id)
        ? { page: 'size_spacing', heading: page.headings.length }
        : entryIds.includes(id)
          ? { page: 'entry', heading: original.ENTRY_GROUPS.length }
          : original.placementOf(id),
  };
});

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
      build: (ctx: Parameters<typeof panel.build>[0]) => {
        const built = panel.build(ctx);
        if (panel.id !== 'layout') return built;
        return [
          ...built,
          ...(plant.on
            ? [
                planted('planted_panel'),
                { type: 'grid', name: '', schema: [planted('planted_nested')] } as HaFormSchema,
              ]
            : []),
          ...Array.from({ length: plant.many }, (_, at) => planted(`planted_many${at}`)),
          ...(plant.extra ? [planted(plant.extra)] : []),
        ];
      },
      ...(panel.subforms && {
        subforms: (ctx: Parameters<NonNullable<typeof panel.subforms>>[0]) =>
          panel.subforms!(ctx).map((subform) =>
            plant.on
              ? { ...subform, schema: [...subform.schema, planted(nameFor(subform.path))] }
              : plant.action && subform.path.join() === ENTITY_PATH.join()
                ? {
                    ...subform,
                    schema: [
                      ...subform.schema,
                      { name: 'planted_action', selector: { ui_action: {} } } as HaFormSchema,
                    ],
                  }
                : subform,
          ),
      }),
    })),
  };
});

/** Home Assistant's Visibility editor as the stand-in below draws it. */
type ConditionsEditor = HTMLElement & {
  hass?: unknown;
  conditions?: ReadonlyArray<unknown>;
  entity?: unknown;
};

/** The warm-up's Visibility editor, or null. */
const warmConditions = (editor: Editor) =>
  warmUp(editor)?.querySelector<ConditionsEditor>('ha-card-conditions-editor') ?? null;

/**
 * The custom elements at or below a node, through every shadow root, that are not defined, by tag:
 * what the warm-up still waits on.
 *
 * @param root - Where to look
 * @returns The tags, sorted
 */
function undefinedIn(root: ParentNode): string[] {
  const found = new Set<string>();
  const walk = (node: ParentNode): void => {
    for (const element of node.querySelectorAll('*')) {
      if (element.localName.includes('-') && !customElements.get(element.localName)) {
        found.add(element.localName);
      }
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(root);
  return [...found].sort();
}

/**
 * Lets the warm-up search what it drew several times over, and the editor finish any update.
 *
 * @param editor - The editor
 */
async function settle(editor: Editor): Promise<void> {
  for (let round = 0; round < 5; round++) await new Promise((resolve) => setTimeout(resolve, 0));
  await editor.updateComplete;
}

/** Waits until the warm-up is gone. */
const gone = (editor: Editor) => vi.waitFor(() => expect(warmUp(editor)).toBeNull());

/** Actions `KINDS` holds: an event's, the card's and a button's. */
const NAVIGATE = { action: 'navigate', navigation_path: '/anna' };
const PERFORM = { action: 'perform-action', perform_action: 'light.toggle' };
const HOME = { action: 'navigate', navigation_path: '/' };

/** What the forms show for an action the configuration leaves unset: its default. */
const NONE = { action: 'none' };

/** What the event tap's form shows where the configuration leaves it unset: its default. */
const DETAILS = { action: 'details' };

/** Calendars and toolbar buttons of every kind the editor draws a form for, and actions. */
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
  event_tap_action: NAVIGATE,
  hold_action: PERFORM,
  toolbar: {
    show: true,
    buttons: [
      { icon: 'mdi:lightbulb', entity: 'light.hall' },
      { icon: 'mdi:home', name: 'Home', tap_action: HOME },
    ],
  },
};

/**
 * Home Assistant's Visibility editor as the tests draw it, after its own: it asks which entity it
 * edits against as it is connected, and draws a `state` condition with a selector Home Assistant
 * loads the first time one is drawn.
 */
class ConditionsEditorStandIn extends LitElement {
  static override properties = {
    hass: { attribute: false },
    conditions: { attribute: false },
  };

  declare conditions?: ReadonlyArray<{ condition?: string }>;

  entity?: unknown;

  override connectedCallback(): void {
    super.connectedCallback();
    this.dispatchEvent(
      Object.assign(new Event('context-request', { bubbles: true, composed: true }), {
        context: 'conditions-entity-context',
        subscribe: true,
        callback: (value: unknown) => {
          this.entity = value;
        },
      }),
    );
  }

  override render() {
    return (this.conditions ?? []).map((condition) =>
      condition.condition === 'state' ? document.createElement('ha-selector-state') : nothing,
    );
  }
}

/**
 * Home Assistant's `ha-form` as the tests draw it: each node at its top level as the element Home
 * Assistant draws it with, a field's handed its selector and its value.
 */
class FormStandIn extends LitElement {
  static override properties = {
    hass: { attribute: false },
    schema: { attribute: false },
    data: { attribute: false },
  };

  declare hass?: unknown;

  declare schema?: ReadonlyArray<HaFormSchema>;

  declare data?: Record<string, unknown>;

  override render() {
    return (this.schema ?? []).map((node) => {
      const element = document.createElement(elementFor(node)) as HTMLElement & {
        hass?: unknown;
        selector?: unknown;
        value?: unknown;
      };
      element.hass = this.hass;
      if ('selector' in node) {
        element.selector = node.selector;
        element.value = this.data?.[node.name];
      }
      return element;
    });
  }
}

/**
 * Home Assistant's action editor as the tests draw it, after `hui-action-editor`: a label, and for
 * a `navigate` or an `assist` action a form of its own, whose selector Home Assistant loads the
 * first time one is drawn. For a `perform-action`, a color field for each color mode its target
 * reports, as Home Assistant's service controls draw a field only for a target that supports it.
 * Nothing for any other action.
 */
class ActionEditorStandIn extends LitElement {
  static override properties = {
    hass: { attribute: false },
    selector: { attribute: false },
    value: { attribute: false },
  };

  declare hass?: Types.Hass;

  declare value?: { action?: string; target?: { entity_id?: string } };

  override render() {
    const picked = (
      { navigate: 'navigation', assist: 'assist_pipeline' } as Record<string, string>
    )[this.value?.action ?? ''];
    const target = this.hass?.states[this.value?.target?.entity_id ?? ''];
    const modes =
      this.value?.action === 'perform-action'
        ? ((target?.attributes as { supported_color_modes?: string[] } | undefined)
            ?.supported_color_modes ?? [])
        : [];
    return html`<b>${this.value?.action}</b>${
        picked ? document.createElement(`ha-selector-${picked}`) : nothing
      }${modes
        .filter((mode) => mode in COLOR_FIELDS)
        .map((mode) => document.createElement(`ha-selector-${COLOR_FIELDS[mode]}`))}`;
  }
}

/** The selector Home Assistant's light fields draw for each color mode the stand-in knows. */
const COLOR_FIELDS: Record<string, string> = { rgb: 'color_rgb', color_temp: 'color_temp' };

/** The stand-ins for elements that draw something; any other element defined draws nothing. */
const STAND_INS: Record<string, CustomElementConstructor> = {
  'ha-selector-ui_action': ActionEditorStandIn,
};

/**
 * Defines an element as Home Assistant would once its module has loaded.
 *
 * @param tag - The element
 */
function define(tag: string): void {
  customElements.define(tag, STAND_INS[tag] ?? class extends HTMLElement {});
}

describe('the warm-up form', () => {
  // These read what it holds, and nothing below it is ever defined here: held still, its timers
  // cannot draw it away under them, as its time bound otherwise would on a slow machine.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Every page is visited in every corpus state with every setting shown, each live field's Reset
  // outcome and its Reset or Remove worked out. That took over four minutes on CI's runner in one
  // test, close to any limit worth setting, so the corpus runs in shards, each on a fresh editor;
  // and over ten minutes once the shards ran one after another in this file, the longest file in
  // the suite by far. So each shard is a file of its own (`editor-warm-up-corpus-<n>.test.ts`,
  // `helpers/warm-up.ts` › `corpusShard`), and they run side by side.
  it('holds, across every shard, each element the builders build, once every corpus state has run', async () => {
    // Each shard has its file, and the shards take each state exactly once, so sharding drops
    // none; each shard's own test fails where it takes none.
    expect(shardFiles(CORPUS_PREFIX)).toEqual(expectedShardFiles(CORPUS_PREFIX, CORPUS_SHARDS));
    expect(CORPUS_STATES.length).toBeGreaterThanOrEqual(CORPUS_SHARDS);
    const taken = Array.from({ length: CORPUS_SHARDS }, (_, at) => shardStates(at + 1)).flat();
    expect(taken.sort((a, b) => a - b)).toEqual(CORPUS_STATES.map((_, index) => index));

    // What the warm-up holds in each state, read as each shard reads it before it opens a page;
    // each shard checks it against what the forms draw there.
    const warmedAll = new Set<string>();
    const builtAll = new Set<string>();
    let values = 0;
    const editor = await mountEditor(ANNA);
    for (const state of CORPUS_STATES) {
      await applyState(editor, state);
      warmed(editor).forEach((tag) => warmedAll.add(tag));
      values += warmValues(editor).length;
      for (const tag of builtElements(state)) builtAll.add(tag);
    }
    for (const tag of elements(Object.values(chassisSchemas('en')))) builtAll.add(tag);
    console.info(
      `Warm-up: ${CORPUS_STATES.length} corpus states, ${values} values held, ${warmedAll.size} elements: ${[...warmedAll].sort().join(' ')}`,
    );

    expect(warmedAll.size).toBeGreaterThan(3);
    expect(values).toBeGreaterThan(0);
    expect([...warmedAll].sort()).toEqual([...builtAll].sort());
  });

  it('holds each element and each value the forms draw for calendars and buttons of every kind, in every workspace', async () => {
    const editor = await mountEditor(KINDS);
    for (const workspace of ['list', 'column', 'grid', 'shared']) {
      await editLayout(editor, workspace);
      expect(warmed(editor), workspace).toEqual(await drawn(editor));
      expect(warmValues(editor), workspace).toEqual(await drawnValues(editor));
    }
    expect(warmed(editor)).toEqual(
      expect.arrayContaining(['ha-selector-entity', 'ha-selector-icon', 'ha-selector-object']),
    );
    // An event's action, the card's and a button's, and the default the rest show, each once.
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', NAVIGATE],
        ['ha-selector-ui_action', PERFORM],
        ['ha-selector-ui_action', HOME],
        ['ha-selector-ui_action', NONE],
      ].sort(byJson),
    );
    // Home Assistant's Visibility editor is not defined, so the calendars' conditions are held by
    // none: behind its guard, as the visible one is.
    expect(warmConditions(editor)).toBeNull();
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

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

  it('holds what a calendar’s form holds in a field of such a type, once a builder adds one', async () => {
    plant.action = true;
    try {
      const editor = await mountEditor({
        ...ANNA,
        entities: [{ entity: 'calendar.anna', planted_action: HOME }],
      });
      expect(warmValues(editor)).toEqual(
        [
          ['ha-selector-ui_action', HOME],
          ['ha-selector-ui_action', NONE],
          ['ha-selector-ui_action', DETAILS],
        ].sort(byJson),
      );
      expect(warmValues(editor)).toEqual(await drawnValues(editor));
    } finally {
      plant.action = false;
    }
  });

  it('writes nothing, and nothing it fires goes further', async () => {
    const editor = await mountEditor(KINDS);
    const before = lastConfig(editor);
    const heard: Event[] = [];
    editor.addEventListener('value-changed', (event) => heard.push(event));
    editor.addEventListener('config-changed', (event) => heard.push(event));

    for (const type of ['value-changed', 'config-changed']) {
      warmForm(editor)!.dispatchEvent(
        new CustomEvent(type, {
          detail: { value: { title: 'Planted' }, config: { title: 'Planted' } },
          bubbles: true,
          composed: true,
        }),
      );
    }
    await editor.updateComplete;
    expect(heard).toEqual([]);
    expect(lastConfig(editor)).toEqual(before);

    // The control: the same event from beside it reaches the editor.
    const beside = editor.appendChild(document.createElement('div'));
    beside.dispatchEvent(new CustomEvent('value-changed', { bubbles: true, composed: true }));
    expect(heard).toHaveLength(1);
  });

  it('is out of layout and of the accessibility tree, inert, and on the live feed while it is drawn', async () => {
    // A Home Assistant with a string table, so that the feeds are wrappers of their own, and a
    // light the editor draws nothing of.
    const states = {
      'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} },
      'light.porch': { entity_id: 'light.porch', state: 'off', attributes: {} },
    };
    const hass = fakeHass({ localize: (key: string) => key, states });
    const editor = await mountEditor(KINDS, { hass });
    const warm = warmUp(editor)!;
    const form = warmForm(editor)!;
    // A child of the editor's own element, which its shadow root never slots: never laid out.
    expect(warm.parentElement).toBe(editor);
    expect(editor.shadowRoot!.querySelector('slot')).toBeNull();
    expect(warm.hasAttribute('inert')).toBe(true);
    expect(warm.getAttribute('aria-hidden')).toBe('true');
    expect(form.parentElement).toBe(warm);
    // It holds the values its nodes name and nothing else (`warmValues`).
    expect(warmValues(editor)).toHaveLength(4);

    // The live feed, with the card's own action names, as the forms with an action have it.
    expect(form.getAttribute('data-hass')).toBe('live');
    expect(form.hass).toBe(withCardActionLabels(hass, 'en'));
    const expand = `${HA_ACTION_LABEL_PREFIX}expand`;
    expect((form.hass as Types.Hass).localize!(expand)).not.toBe(expand);
    const steady = editor.shadowRoot!.querySelector<Form>('ha-form[data-hass="steady"]')!;
    const before = steady.hass;

    // A Home Assistant with the light on, which the editor does not render for: it reaches the
    // warm-up all the same, and the steady forms keep what they had (the control).
    const lit = { ...states['light.porch'], state: 'on', attributes: { brightness: 255 } };
    const next = { ...hass, states: { ...states, 'light.porch': lit } } as Types.Hass;
    editor.hass = next;
    await editor.updateComplete;
    expect(form.hass).toBe(withCardActionLabels(next, 'en'));
    expect((form.hass as Types.Hass).states['light.porch']).toBe(lit);
    expect(steady.hass).toBe(before);

    // One the editor renders for, a calendar's state moved: the warm-up is fed from the render.
    const later = {
      ...next,
      states: { ...next.states, 'calendar.anna': { ...states['calendar.anna'], state: 'on' } },
    } as Types.Hass;
    editor.hass = later;
    await editor.updateComplete;
    expect(warmForm(editor)).toBe(form);
    expect(form.hass).toBe(withCardActionLabels(later, 'en'));
  });
});

describe('with Home Assistant’s Visibility editor', () => {
  beforeAll(() => {
    customElements.define('ha-card-conditions-editor', ConditionsEditorStandIn);
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('warms no YAML box where the Visibility editor draws a calendar’s conditions', async () => {
    const editor = await mountEditor(ANNA);
    expect(warmed(editor)).not.toContain('ha-selector-object');
    expect(warmed(editor)).toEqual(await drawn(editor));

    // The control: conditions only the YAML box can show keep it, and warm it.
    const yaml = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [{ entity: 'calendar.anna', visibility: 'only the YAML box shows this' }],
    });
    expect(warmed(yaml)).toContain('ha-selector-object');
    expect(warmed(yaml)).toEqual(await drawn(yaml));
    expect(warmConditions(yaml)).toBeNull();
  });

  it('holds every calendar’s conditions in one Visibility editor, told the calendar it edits against', async () => {
    const screen = { condition: 'screen', media_query: '(min-width: 0)' };
    const state = { condition: 'state', state: 'on' };
    // A Home Assistant with a string table, so that the steady feed is a wrapper of its own.
    const hass = fakeHass({ localize: (key: string) => key });
    const editor = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: [
          'calendar.anna',
          { entity: 'calendar.ben', visibility: [screen, state] },
          { entity: 'calendar.anna', visibility: [state, { condition: 'user', users: ['anna'] }] },
          { entity: 'calendar.ben', visibility: 'only the YAML box shows this' },
        ],
      },
      { hass },
    );
    const conditions = warmConditions(editor)!;
    // Each once, in the order the calendars hold them; the YAML box's are not conditions.
    expect(conditions.conditions).toEqual([screen, state, { condition: 'user', users: ['anna'] }]);
    // Asked as the visible one is, it is told the first calendar holding them.
    expect(conditions.entity).toEqual({ mode: 'current', entityId: 'calendar.ben' });
    // Handed `hass` as it is, as the visible one is; the control: the warm-up's form is not.
    expect(conditions.hass).toBe(hass);
    expect(warmForm(editor)!.hass).not.toBe(hass);
    // And the newest one, though the editor does not render for it, while it is drawn.
    const next = { ...hass } as Types.Hass;
    editor.hass = next;
    await editor.updateComplete;
    expect(conditions.hass).toBe(next);
    expect(conditions.parentElement).toBe(warmUp(editor));
  });

  it('writes nothing from its Visibility editor, and nothing it fires goes further', async () => {
    const editor = await mountEditor(KINDS);
    const before = lastConfig(editor);
    const heard: Event[] = [];
    editor.addEventListener('value-changed', (event) => heard.push(event));
    editor.addEventListener('config-changed', (event) => heard.push(event));

    for (const type of ['value-changed', 'config-changed']) {
      warmConditions(editor)!.dispatchEvent(
        new CustomEvent(type, {
          detail: { value: [], config: { title: 'Planted' } },
          bubbles: true,
          composed: true,
        }),
      );
    }
    await editor.updateComplete;
    expect(heard).toEqual([]);
    expect(lastConfig(editor)).toEqual(before);
  });
});

describe('once Home Assistant draws what it holds', () => {
  beforeAll(() => {
    customElements.define('ha-form', FormStandIn);
  });

  it('is drawn away by its time bound where an element below it is never defined', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    plant.on = true;
    try {
      const editor = await mountEditor(KINDS);
      expect(warmed(editor)).toContain('ha-selector-planted_panel');
      await vi.advanceTimersByTimeAsync(9_900);
      expect(undefinedIn(warmUp(editor)!)).toContain('ha-selector-planted_panel');
      await vi.advanceTimersByTimeAsync(200);
      expect(warmUp(editor)).toBeNull();
    } finally {
      plant.on = false;
      vi.useRealTimers();
    }
  });

  it('stays until the last element below it is defined, then is gone', async () => {
    // Selector types of its own, so that more elements arrive than it searches before it gives
    // up, ten times.
    plant.many = 6;
    let editor: Editor;
    try {
      editor = await mountEditor({
        ...KINDS,
        event_tap_action: undefined,
        hold_action: undefined,
        toolbar: { show: true, buttons: [KINDS.toolbar.buttons[0]] },
      });
    } finally {
      plant.many = 0;
    }
    const tags = warmed(editor);
    expect(tags.length).toBeGreaterThan(11);
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', NONE],
        ['ha-selector-ui_action', DETAILS],
      ].sort(byJson),
    );
    expect(undefinedIn(warmUp(editor)!)).toEqual(tags);

    // One at a time, as Home Assistant's modules arrive: however many arrive apart, it stays
    // until the last.
    for (const [index, tag] of tags.slice(0, -1).entries()) {
      define(tag);
      await settle(editor);
      expect(warmed(editor), tag).toEqual(tags);
      expect(undefinedIn(warmUp(editor)!), tag).toEqual(tags.slice(index + 1));
    }

    define(tags[tags.length - 1]!);
    await gone(editor);
  });

  it('holds an event’s action, and stays until what it picks is defined', async () => {
    const editor = await mountEditor({ ...ANNA, event_tap_action: NAVIGATE });
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', NAVIGATE],
        ['ha-selector-ui_action', NONE],
      ].sort(byJson),
    );
    // Its action editor draws a navigation form below it, as Home Assistant's does.
    await vi.waitFor(() =>
      expect(undefinedIn(warmUp(editor)!)).toEqual(['ha-selector-navigation']),
    );
    await settle(editor);
    expect(warmUp(editor)).not.toBeNull();

    define('ha-selector-navigation');
    await gone(editor);
  });

  it('holds a button’s action, and stays until what it picks is defined', async () => {
    const assist = { action: 'assist', pipeline_id: 'last_used' };
    const editor = await mountEditor({
      ...ANNA,
      toolbar: { show: true, buttons: [{ icon: 'mdi:microphone', tap_action: assist }] },
    });
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', assist],
        ['ha-selector-ui_action', NONE],
        ['ha-selector-ui_action', DETAILS],
      ].sort(byJson),
    );
    await vi.waitFor(() =>
      expect(undefinedIn(warmUp(editor)!)).toEqual(['ha-selector-assist_pipeline']),
    );
    await settle(editor);
    expect(warmUp(editor)).not.toBeNull();

    define('ha-selector-assist_pipeline');
    await gone(editor);
  });

  it('holds a calendar’s condition, and stays until its form’s selector is defined', async () => {
    const state = { condition: 'state', state: 'on' };
    const editor = await mountEditor({
      ...ANNA,
      entities: [{ entity: 'calendar.anna', visibility: [state] }],
    });
    expect(warmConditions(editor)!.conditions).toEqual([state]);
    expect(warmConditions(editor)!.entity).toEqual({ mode: 'current', entityId: 'calendar.anna' });
    await vi.waitFor(() => expect(undefinedIn(warmUp(editor)!)).toEqual(['ha-selector-state']));
    await settle(editor);
    expect(warmUp(editor)).not.toBeNull();

    define('ha-selector-state');
    await gone(editor);
  });

  it('holds nothing further for an action or a condition that picks nothing', async () => {
    const moreInfo = { action: 'more-info' };
    const screen = { condition: 'screen', media_query: '(min-width: 0)' };
    const editor = await mountEditor({
      ...ANNA,
      entities: [{ entity: 'calendar.anna', visibility: [screen] }],
      event_hold_action: moreInfo,
    });
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', moreInfo],
        ['ha-selector-ui_action', NONE],
        ['ha-selector-ui_action', DETAILS],
      ].sort(byJson),
    );
    expect(warmConditions(editor)!.conditions).toEqual([screen]);
    expect(undefinedIn(warmUp(editor)!)).toEqual([]);
    await gone(editor);
  });

  it('warms what a later render newly draws, and only that', async () => {
    const editor = await mountEditor(KINDS);
    // Every element it draws is defined by now: it holds only the values and the conditions this
    // editor has not drawn before, and is drawn away at once.
    expect(warmForm(editor)!.schema.filter((node) => !holdsValue(node))).toEqual([]);
    expect(warmValues(editor)).toHaveLength(4);
    expect(warmConditions(editor)!.conditions).toHaveLength(1);
    await gone(editor);

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
      expect(warmValues(editor)).toEqual([]);
      expect(warmConditions(editor)).toBeNull();
    } finally {
      plant.on = false;
    }
  });

  it('is drawn away after its last search where what it draws never stops drawing more', async () => {
    // Each element of the cascade, once defined, draws the next, and defines it a moment later.
    const cascade = (at: number): CustomElementConstructor =>
      class extends HTMLElement {
        connectedCallback(): void {
          const next = `planted-cascade-${at + 1}`;
          this.appendChild(document.createElement(next));
          setTimeout(() => {
            if (!customElements.get(next)) customElements.define(next, cascade(at + 1));
          }, 0);
        }
      };
    plant.on = true;
    try {
      const editor = await mountEditor(KINDS);
      expect(warmed(editor)).toContain('ha-selector-planted_panel');
      for (const tag of [
        'ha-selector-planted_button',
        'ha-selector-planted_calendar',
        'ha-selector-planted_nested',
      ]) {
        define(tag);
      }
      customElements.define('ha-selector-planted_panel', cascade(0));
      await vi.waitFor(() =>
        expect(undefinedIn(warmUp(editor)!).join()).toMatch(/^planted-cascade-\d+$/),
      );
      await gone(editor);
    } finally {
      plant.on = false;
    }
  });

  it('warms an action with the states as they are when it is configured', async () => {
    const off = {
      entity_id: 'light.hall',
      state: 'off',
      attributes: { supported_color_modes: ['onoff'] },
    };
    const hass = fakeHass({ localize: (key: string) => key, states: { 'light.hall': off } });
    const editor = await mountEditor(ANNA, { hass });
    await gone(editor);

    // The light now reports a color mode, in a Home Assistant the editor does not render for.
    const rgb = { ...off, attributes: { supported_color_modes: ['rgb'] } };
    editor.hass = { ...hass, states: { 'light.hall': rgb } } as Types.Hass;
    await editor.updateComplete;
    // Then an action for it is configured: the warm-up draws what the light supports now.
    const action = {
      action: 'perform-action',
      perform_action: 'light.turn_on',
      target: { entity_id: 'light.hall' },
    };
    editor.setConfig({ ...ANNA, hold_action: action });
    await editor.updateComplete;
    expect(warmValues(editor)).toEqual([['ha-selector-ui_action', action]]);
    await vi.waitFor(() => expect(undefinedIn(warmUp(editor)!)).toEqual(['ha-selector-color_rgb']));
    await settle(editor);
    expect(warmUp(editor)).not.toBeNull();

    define('ha-selector-color_rgb');
    await gone(editor);
  });

  it('warms an action again once what it names, or the services, move, and not for a state alone', async () => {
    const off = {
      entity_id: 'light.porch',
      state: 'off',
      attributes: { supported_color_modes: ['onoff'] },
    };
    const action = {
      action: 'perform-action',
      perform_action: 'light.turn_on',
      target: { entity_id: 'light.porch' },
    };
    const hass = fakeHass({ states: { 'light.porch': off }, services: { light: {} } });
    const editor = await mountEditor({ ...ANNA, hold_action: action }, { hass });
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', action],
        ['ha-selector-ui_action', NONE],
        ['ha-selector-ui_action', DETAILS],
      ].sort(byJson),
    );
    await gone(editor);
    const render = vi.spyOn(editor, 'render');

    // The light turns on, its attributes as they were: nothing to warm, and nothing rendered.
    let now = { ...hass, states: { 'light.porch': { ...off, state: 'on' } } } as Types.Hass;
    editor.hass = now;
    await editor.updateComplete;
    expect(render).not.toHaveBeenCalled();
    expect(warmUp(editor)).toBeNull();

    // It reports a color temperature: the action is warmed again, against the light as it is.
    now = {
      ...now,
      states: {
        'light.porch': {
          ...off,
          state: 'on',
          attributes: { supported_color_modes: ['color_temp'] },
        },
      },
    } as Types.Hass;
    editor.hass = now;
    await editor.updateComplete;
    expect(warmValues(editor)).toEqual([['ha-selector-ui_action', action]]);
    await vi.waitFor(() =>
      expect(undefinedIn(warmUp(editor)!)).toEqual(['ha-selector-color_temp']),
    );
    define('ha-selector-color_temp');
    await gone(editor);

    // Home Assistant's services move: every action is warmed again.
    editor.hass = { ...now, services: { light: {}, scene: {} } } as Types.Hass;
    await editor.updateComplete;
    expect(warmValues(editor)).toEqual(
      [
        ['ha-selector-ui_action', action],
        ['ha-selector-ui_action', NONE],
        ['ha-selector-ui_action', DETAILS],
      ].sort(byJson),
    );
    await gone(editor);
  });

  it('forgets an action no drawn form holds any more, so the light it named renders nothing', async () => {
    const off = (id: string) => ({
      entity_id: id,
      state: 'off',
      attributes: { supported_color_modes: ['onoff'] },
    });
    const turnOn = (id: string) => ({
      action: 'perform-action',
      perform_action: 'light.turn_on',
      target: { entity_id: id },
    });
    const states = { 'light.porch': off('light.porch'), 'light.hall': off('light.hall') };
    const hass = fakeHass({ states });
    const editor = await mountEditor({ ...ANNA, hold_action: turnOn('light.porch') }, { hass });
    await gone(editor);
    // The action now turns on another light.
    editor.setConfig({ ...ANNA, hold_action: turnOn('light.hall') });
    await editor.updateComplete;
    await gone(editor);
    const records = () =>
      [...(editor as unknown as { _warmed: Map<string, unknown> })._warmed.keys()].filter((key) =>
        key.includes('light.'),
      );
    expect(records()).toEqual([`ha-selector-ui_action ${JSON.stringify(turnOn('light.hall'))}`]);
    const render = vi.spyOn(editor, 'render');
    const dimmed = (id: keyof typeof states) => ({
      ...states[id],
      attributes: { supported_color_modes: ['onoff'], brightness: 3 },
    });

    // The light the action named before reports new attributes: nothing renders, nothing is kept.
    let now = {
      ...hass,
      states: { ...states, 'light.porch': dimmed('light.porch') },
    } as Types.Hass;
    editor.hass = now;
    await editor.updateComplete;
    expect(render).not.toHaveBeenCalled();
    expect(records()).toHaveLength(1);

    // The control: the light it names now does, and the editor renders to warm it again.
    now = { ...now, states: { ...now.states, 'light.hall': dimmed('light.hall') } } as Types.Hass;
    editor.hass = now;
    await editor.updateComplete;
    expect(render).toHaveBeenCalled();
    await gone(editor);
  });

  it('keeps what it knows of a calendar’s conditions while a search hides the calendar', async () => {
    const screen = { condition: 'screen', media_query: '(min-width: 0)' };
    const editor = await mountEditor({
      ...ANNA,
      entities: [{ entity: 'calendar.anna', visibility: [screen] }],
    });
    expect(warmConditions(editor)!.conditions).toEqual([screen]);
    await gone(editor);

    // A search that matches nothing draws no calendar's row, and is then cleared: the conditions it
    // held to the end are not held again.
    const search = editor as unknown as { _filter: unknown };
    const row = () => editor.shadowRoot!.querySelector('.cal-row [data-focus^="row:"]');
    expect(row()).not.toBeNull();
    search._filter = { ...NO_FILTER, query: 'nothing matches this' };
    await editor.updateComplete;
    expect(row()).toBeNull();
    search._filter = NO_FILTER;
    await editor.updateComplete;
    expect(row()).not.toBeNull();
    expect(warmConditions(editor)).toBeNull();
    await gone(editor);
  });

  it('is not drawn away by an earlier warm-up’s search, where a later one holds the same', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      // A for five seconds, B for one, then A again: the same as the first, drawn anew.
      plant.extra = 'planted_a';
      const editor = await mountEditor(ANNA);
      expect(warmed(editor)).toContain('ha-selector-planted_a');
      await vi.advanceTimersByTimeAsync(5_000);
      plant.extra = 'planted_b';
      editor.setConfig({ ...ANNA, title: 'B' });
      await editor.updateComplete;
      expect(warmed(editor)).toContain('ha-selector-planted_b');
      expect(warmed(editor)).not.toContain('ha-selector-planted_a');
      await vi.advanceTimersByTimeAsync(1_000);
      plant.extra = 'planted_a';
      editor.setConfig({ ...ANNA, title: 'A' });
      await editor.updateComplete;
      expect(warmed(editor)).toContain('ha-selector-planted_a');

      // Past the first A's ten seconds: the second stays, still waiting.
      await vi.advanceTimersByTimeAsync(4_500);
      expect(warmUp(editor)).not.toBeNull();
      expect(undefinedIn(warmUp(editor)!)).toContain('ha-selector-planted_a');
      // Its own ten seconds end it.
      await vi.advanceTimersByTimeAsync(5_600);
      expect(warmUp(editor)).toBeNull();
    } finally {
      plant.extra = '';
      vi.useRealTimers();
    }
  });
});

describe('VALUE_SELECTORS', () => {
  it('names each selector whose element draws what its value picks, each one a builder uses', () => {
    expect([...VALUE_SELECTORS]).toEqual(['ui_action']);
    const built = new Set<string>();
    for (const workspace of ['list', 'column', 'grid', 'shared'] as const) {
      const ctx = schemaCtx(KINDS as never, workspace, 'en');
      for (const panel of PANELS) {
        const subforms = panel.subforms?.(ctx) ?? [];
        elements([panel.build(ctx), ...subforms.map((s) => s.schema)]).forEach((tag) =>
          built.add(tag),
        );
      }
    }
    for (const type of VALUE_SELECTORS) expect(built).toContain(`ha-selector-${type}`);
  });

  it('is read for each value as `ha-form` reads it, at any depth', () => {
    const action = (name: string) => ({ name, selector: { ui_action: {} } }) as HaFormSchema;
    const [keys, schema, data] = warmSchema(
      [
        [
          [
            action('top'),
            { type: 'grid', name: 'named', schema: [action('inner')] },
            { type: 'grid', name: '', schema: [action('unnamed')] },
            { type: 'grid', name: 'flat', flatten: true, schema: [action('flattened')] },
            action('unset'),
          ],
          {
            top: { action: 'navigate', navigation_path: '/top' },
            named: { inner: { action: 'assist' } },
            unnamed: { action: 'more-info' },
            flattened: { action: 'url', url_path: '/' },
            inner: { action: 'none' },
          },
        ],
      ],
      () => true,
      ['ui_action'],
    );
    expect(keys).toEqual([
      'ha-selector-ui_action {"action":"navigate","navigation_path":"/top"}',
      'ha-form-grid',
      'ha-selector-ui_action {"action":"assist"}',
      'ha-selector-ui_action {"action":"more-info"}',
      'ha-selector-ui_action {"action":"url","url_path":"/"}',
      'ha-selector-ui_action',
    ]);
    expect(schema.map((node) => node.name)).toEqual([
      'ha-selector-ui_action {"action":"navigate","navigation_path":"/top"}',
      'named',
      'ha-selector-ui_action {"action":"assist"}',
      'ha-selector-ui_action {"action":"more-info"}',
      'ha-selector-ui_action {"action":"url","url_path":"/"}',
      'unset',
    ]);
    expect(Object.values(data)).toEqual([
      { action: 'navigate', navigation_path: '/top' },
      { action: 'assist' },
      { action: 'more-info' },
      { action: 'url', url_path: '/' },
    ]);
  });
});
