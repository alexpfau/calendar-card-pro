/**
 * The toolbar's own buttons in the editor: under the Card & Header panel's toolbar switches, a
 * panel per button with Move Up, Move Down and Remove above a form of four fields, and Add Button
 * after the last.
 *
 * Three things are pinned, and each fails where the others cannot see.
 *
 * The **write path**. Every change goes through `toStoredConfig` and rewrites `toolbar.buttons`
 * and nothing else; an untouched list is stored exactly as written; and removing the last button
 * takes the key with it. A list written raw would store defaults, and one rebuilt from the list
 * the card resolves would drop the entry somebody is still filling in.
 *
 * The **panels**. One per entry as written, headed by its name, its icon or its place, opened as
 * Add Button creates it, and keyed by its button rather than its place, so a moved button takes
 * its open panel and the keyboard's focus with it.
 *
 * The **form**. Four fields, pinned by value, and an action dropdown offering every card action,
 * `back` among them, ahead of Home Assistant's, each named through the editor's wrapped `hass`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Buttons from '../src/rendering/editor/buttons';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import { CUSTOMIZED_ONLY_FIELD, SEARCH_FIELD } from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { HA_ACTION_LABEL_PREFIX } from '../src/rendering/editor/hass-localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { ACTION_OPTIONS } from '../src/rendering/editor/schemas/actions';
import {
  NEW_TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ICON,
  TOOLBAR_BUTTON_PATH,
} from '../src/rendering/editor/schemas/card';

customElements.define('editor-toolbar-buttons-probe', CalendarCardProEditor);

type EditorHost = HTMLElement & {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
};

interface Panel extends HTMLElement {
  header?: string;
  expanded?: boolean;
}

interface Form extends HTMLElement {
  data: Record<string, unknown>;
  schema: HaFormSchema[];
  hass?: Types.Hass;
  computeLabel: (schema: HaFormSchema) => string;
  computeHelper: (schema: HaFormSchema) => string | undefined;
}

/** The exact list a button's action dropdown offers: the card's own actions, then HA's. */
const EXPECTED_ACTIONS = [
  'expand',
  'refresh',
  'add-event',
  'reset',
  'back',
  'more-info',
  'toggle',
  'navigate',
  'url',
  'perform-action',
  'assist',
  'none',
];

const BACK = { icon: 'mdi:arrow-left', name: 'Back', tap_action: { action: 'back' } };
const LIGHTS = {
  icon: 'mdi:lightbulb',
  name: 'Lights',
  entity: 'light.kitchen',
  tap_action: { action: 'toggle' },
};
const HOME = {
  icon: 'mdi:home',
  name: 'Home',
  tap_action: { action: 'navigate', navigation_path: '/lovelace/home' },
};

/**
 * Renders the editor over a card with one calendar and the given toolbar.
 *
 * Every reported configuration is handed back through `setConfig`, as Home Assistant does after
 * each edit, so the buttons' keys are held through the echo as they are on a dashboard.
 *
 * @param toolbar - The `toolbar:` block, or undefined for none
 * @param extra - Further root options
 * @returns Handles for driving and observing the editor
 */
async function mount(
  toolbar: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
) {
  const element = document.createElement('editor-toolbar-buttons-probe') as EditorHost;
  element.hass = {
    states: {},
    locale: { language: 'en' },
    localize: (key: string) => `HA:${key}`,
  };
  document.body.appendChild(element);
  element.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...(toolbar === undefined ? {} : { toolbar }),
    ...extra,
  });
  await element.updateComplete;

  const reported: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    const config = structuredClone((event as CustomEvent).detail.config) as Record<string, unknown>;
    reported.push(config);
    element.setConfig(config);
  });

  const root = element.shadowRoot!;
  const panels = () => Array.from(root.querySelectorAll<Panel>('ha-expansion-panel.button-panel'));
  const forms = () => panels().map((panel) => panel.querySelector('ha-form.button-form') as Form);
  const fieldNames = (form: Form) => [...walkSchema(form.schema)].map(({ node }) => node.name);

  /** One panel's button, by the text on it. */
  const control = (panel: number, label: string) => {
    const found = Array.from(
      panels()[panel].querySelectorAll<HTMLButtonElement>('.button-actions button'),
    ).find((button) => button.textContent?.trim() === label);
    if (!found) throw new Error(`no ${label} button on panel ${panel}`);
    return found;
  };

  const press = async (button: HTMLButtonElement | null) => {
    if (!button) throw new Error('no such button');
    button.click();
    await element.updateComplete;
  };

  /** Fires the whole-object change `ha-form` emits, from one button's form. */
  const change = async (index: number, patch: Record<string, unknown>) => {
    const form = forms()[index];
    form.dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: { ...form.data, ...patch } } }),
    );
    await element.updateComplete;
  };

  /** The panel form that owns `option`, among the card's own fields. */
  const mainForm = (option: string) => {
    const form = Array.from(root.querySelectorAll<Form>('ha-form.panel-form')).find((candidate) =>
      [...walkSchema(candidate.schema)].some(({ node }) => node.name === option),
    );
    if (!form) throw new Error(`no panel form offers ${option}`);
    return form;
  };

  /** Fires a change from the panel form that owns `option`, as the card's own fields do. */
  const changeMain = async (option: string, value: unknown) => {
    const form = mainForm(option);
    form.dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: { ...form.data, [option]: value } } }),
    );
    await element.updateComplete;
  };

  const filterBy = async (patch: Record<string, unknown>) => {
    const form = root.querySelector<Form>('ha-form.filter-form')!;
    form.dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: { ...form.data, ...patch } } }),
    );
    await element.updateComplete;
  };

  const last = () => reported[reported.length - 1];
  const storedButtons = () => (last().toolbar as Record<string, unknown>).buttons;

  return {
    element,
    root,
    reported,
    last,
    storedButtons,
    panels,
    headers: () => panels().map((panel) => panel.header),
    forms,
    fieldNames,
    control,
    press,
    change,
    changeMain,
    mainValue: (option: string) => mainForm(option).data[option],
    filterBy,
    heading: () => root.querySelectorAll<Form>('ha-form.buttons-heading'),
    add: () => root.querySelector<HTMLButtonElement>('.add-button'),
  };
}

describe('the toolbar buttons in the editor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws no button panels, heading or Add Button while the toolbar is hidden', async () => {
    for (const toolbar of [undefined, { show: false, buttons: [BACK] }]) {
      const editor = await mount(toolbar);

      expect(editor.panels()).toHaveLength(0);
      expect(editor.heading()).toHaveLength(0);
      expect(editor.add()).toBeNull();
    }
  });

  it('keeps a hidden toolbar’s buttons through an edit elsewhere', async () => {
    const editor = await mount({ show: false, buttons: [BACK] });

    await editor.changeMain('title', 'Family');

    expect(editor.last().title).toBe('Family');
    expect(editor.last().toolbar).toEqual({ show: false, buttons: [BACK] });
  });

  it('heads each panel by its name, else its icon as words, else its place', async () => {
    const editor = await mount({
      show: true,
      buttons: [
        BACK,
        { icon: 'mdi:view-dashboard-outline' },
        { tap_action: { action: 'none' } },
        { icon: 'mdi:', name: '   ' },
      ],
    });

    expect(editor.headers()).toEqual(['Back', 'View dashboard outline', 'Button 3', 'Button 4']);
  });

  it('leads every panel with the same fixed icon, not the button’s own', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    const icons = editor
      .panels()
      .map(
        (panel) =>
          (panel.querySelector('ha-svg-icon[slot="leading-icon"]') as { path?: string } | null)
            ?.path,
      );
    expect(icons).toEqual([TOOLBAR_BUTTON_ICON, TOOLBAR_BUTTON_ICON]);
  });

  it('captions the buttons with one sub-heading, and offers Add Button with none yet', async () => {
    const editor = await mount({ show: true });

    expect(editor.panels()).toHaveLength(0);
    const heading = editor.heading();
    expect(heading).toHaveLength(1);
    expect(heading[0].schema).toEqual([{ name: 'heading', type: 'constant' }]);
    expect(heading[0].computeLabel(heading[0].schema[0])).toBe('Your Own Buttons');
    expect(editor.add()?.textContent?.trim()).toBe('Add Button');
  });

  it('adds a button the card can draw after the last, and opens its panel', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await editor.press(editor.add());

    expect(editor.last().toolbar).toEqual({ show: true, buttons: [BACK, NEW_TOOLBAR_BUTTON] });
    const added = { buttons: [NEW_TOOLBAR_BUTTON as Types.ToolbarButtonConfig] };
    expect(Config.undrawableToolbarButtons({ toolbar: added })).toEqual([]);
    expect(editor.headers()).toEqual(['Back', 'Gesture tap button']);
    expect(editor.panels().map((panel) => panel.expanded === true)).toEqual([false, true]);

    // A second one opens too, and the first stays as it was.
    await editor.press(editor.add());
    expect(editor.panels().map((panel) => panel.expanded === true)).toEqual([false, true, true]);
  });

  it('moves a button past its neighbor, and its panel, still open, with it', async () => {
    const editor = await mount({ show: true, refresh: false, buttons: [BACK, LIGHTS, HOME] });

    const lights = editor.panels()[1];
    // Opened by hand, as its chevron does.
    lights.expanded = true;

    await editor.press(editor.control(1, 'Move Up'));

    expect(editor.last().toolbar).toEqual({
      show: true,
      refresh: false,
      buttons: [LIGHTS, BACK, HOME],
    });
    expect(editor.headers()).toEqual(['Lights', 'Back', 'Home']);
    expect(editor.panels()[0]).toBe(lights);
    expect(editor.panels().map((panel) => panel.expanded === true)).toEqual([true, false, false]);

    await editor.press(editor.control(0, 'Move Down'));
    await editor.press(editor.control(1, 'Move Down'));
    expect(editor.storedButtons()).toEqual([BACK, HOME, LIGHTS]);
    expect(editor.panels()[2]).toBe(lights);
  });

  it('offers no move past either end', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    const disabled = (panel: number) =>
      ['Move Up', 'Move Down'].map((label) => editor.control(panel, label).disabled);
    expect([0, 1, 2].map(disabled)).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('keeps the keyboard on a moved button’s controls', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    await editor.press(editor.control(0, 'Move Down'));
    await editor.element.updateComplete;

    // Back is now last, so its Move Down is spent and focus takes its Move Up.
    expect(editor.headers()).toEqual(['Lights', 'Back']);
    expect(editor.root.activeElement).toBe(editor.control(1, 'Move Up'));
  });

  it('removes one button, and the key with the last of them', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await editor.press(editor.control(1, 'Remove'));
    expect(editor.storedButtons()).toEqual([BACK, HOME]);
    expect(editor.headers()).toEqual(['Back', 'Home']);
    await editor.element.updateComplete;
    expect(editor.root.activeElement).toBe(editor.add());

    await editor.press(editor.control(1, 'Remove'));
    await editor.press(editor.control(0, 'Remove'));
    expect(editor.last().toolbar).toEqual({ show: true });
    expect(editor.panels()).toHaveLength(0);
  });

  it('writes a field into its own button, and drops a field emptied', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await editor.change(1, { name: 'Kitchen lights' });
    expect(editor.storedButtons()).toEqual([BACK, { ...LIGHTS, name: 'Kitchen lights' }, HOME]);
    expect(editor.headers()).toEqual(['Back', 'Kitchen lights', 'Home']);

    await editor.change(1, { name: '', entity: undefined });
    expect(editor.storedButtons()).toEqual([
      BACK,
      { icon: 'mdi:lightbulb', tap_action: { action: 'toggle' } },
      HOME,
    ]);
    expect(editor.headers()).toEqual(['Back', 'Lightbulb', 'Home']);
  });

  it('stores no tap action where Nothing replaces another, as the button then runs the same', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    // Home Assistant's action editor writes Nothing as { action: 'none' }.
    await editor.change(1, { tap_action: { action: 'none' } });

    expect(editor.storedButtons()).toEqual([
      BACK,
      { icon: 'mdi:lightbulb', name: 'Lights', entity: 'light.kitchen' },
    ]);
  });

  it('keeps a Nothing the YAML already holds through an edit to another field', async () => {
    const quiet = { icon: 'mdi:bell-off', name: 'Quiet', tap_action: { action: 'none' } };
    const editor = await mount({ show: true, buttons: [quiet] });

    await editor.change(0, { name: 'Silent' });

    expect(editor.storedButtons()).toEqual([{ ...quiet, name: 'Silent' }]);
  });

  it('keeps what the form does not edit, such as a key written in YAML', async () => {
    const editor = await mount({
      show: true,
      buttons: [{ ...HOME, hold_action: { action: 'none' } }],
    });

    await editor.change(0, { name: 'House' });

    expect(editor.storedButtons()).toEqual([
      { ...HOME, name: 'House', hold_action: { action: 'none' } },
    ]);
  });

  it('keeps an entry the card cannot draw, so it can be finished', async () => {
    const editor = await mount({ show: true, buttons: [{ name: 'Draft' }, HOME] });

    expect(editor.headers()).toEqual(['Draft', 'Home']);

    await editor.change(1, { icon: '' });
    expect(editor.storedButtons()).toEqual([
      { name: 'Draft' },
      { name: 'Home', tap_action: HOME.tap_action },
    ]);
    expect(editor.headers()).toEqual(['Draft', 'Home']);
  });

  it('stores an untouched list as written, and rewrites only the list when it changes', async () => {
    const toolbar = { show: true, refresh: false, buttons: [BACK, LIGHTS] };
    const editor = await mount(structuredClone(toolbar));

    await editor.changeMain('title', 'Family');
    expect(editor.last().toolbar).toEqual(toolbar);

    // A toolbar switch is written beside the list, which stays as it was.
    await editor.changeMain('toolbar', {
      ...(editor.mainValue('toolbar') as Record<string, unknown>),
      reset: true,
    });
    expect(editor.last().toolbar).toEqual({ ...toolbar, reset: true });

    const before = editor.last();
    await editor.change(0, { name: 'Go back' });
    const after = editor.last();
    expect({ ...after, toolbar: undefined }).toEqual({ ...before, toolbar: undefined });
    expect(after.toolbar).toEqual({
      ...toolbar,
      reset: true,
      buttons: [{ ...BACK, name: 'Go back' }, LIGHTS],
    });
  });

  it('reports nothing for a form change that leaves the button as it was', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await editor.change(0, { name: 'Back ' });
    await editor.change(0, {});

    expect(editor.reported).toHaveLength(0);
  });
});

describe('a toolbar button’s form', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('edits icon, name, entity and tap action, each labeled and explained', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    const form = editor.forms()[0];
    expect(editor.fieldNames(form)).toEqual(['icon', 'name', 'entity', 'tap_action']);
    expect(form.schema.map((node) => form.computeLabel(node))).toEqual([
      'Icon',
      'Name',
      'Entity',
      'Tap Action',
    ]);
    for (const node of form.schema) expect(form.computeHelper(node)).toBeTruthy();
    expect(form.data).toEqual(BACK);
  });

  it('offers every card action, back included, ahead of Home Assistant’s', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    const node = editor.forms()[0].schema.find((candidate) => candidate.name === 'tap_action');
    expect(node).toEqual({
      name: 'tap_action',
      selector: { ui_action: { actions: EXPECTED_ACTIONS } },
    });
  });

  it('names the card’s own actions through the editor’s hass, back among them', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    const hass = editor.forms()[0].hass;
    expect(hass?.localize?.(`${HA_ACTION_LABEL_PREFIX}back`)).toBe('Go Back');
    expect(hass?.localize?.(`${HA_ACTION_LABEL_PREFIX}refresh`)).toBe('Refresh Events');
    // Still Home Assistant's own table for everything else.
    expect(hass?.localize?.(`${HA_ACTION_LABEL_PREFIX}navigate`)).toBe(
      `HA:${HA_ACTION_LABEL_PREFIX}navigate`,
    );
  });

  it('is declared as the Card & Header panel’s sub-form, for the string gate to reconcile', () => {
    const card = PANELS.find((panel) => panel.id === 'card')!;
    const config = Config.DEFAULT_CONFIG;

    expect(card.strings).toEqual(['toolbar.buttons']);
    expect(card.subforms?.({ view: 'list', config, language: 'en' })).toEqual([
      {
        path: TOOLBAR_BUTTON_PATH,
        schema: [
          { name: 'heading', type: 'constant' },
          { name: 'icon', required: true, selector: { icon: {} } },
          { name: 'name', selector: { text: { type: 'text' } } },
          { name: 'entity', selector: { entity: {} } },
          { name: 'tap_action', selector: { ui_action: { actions: ACTION_OPTIONS } } },
        ],
      },
    ]);
  });
});

describe('searching the toolbar buttons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a button whose name answers, whole, and withholds Add Button', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await editor.filterBy({ [SEARCH_FIELD]: 'kitchen' });

    expect(editor.headers()).toEqual(['Lights']);
    expect(editor.fieldNames(editor.forms()[0])).toEqual(['icon', 'name', 'entity', 'tap_action']);
    expect(editor.panels()[0].expanded).toBe(true);
    expect(editor.heading()).toHaveLength(1);
    expect(editor.add()).toBeNull();
  });

  it('shows only the field a search names, on every button', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    await editor.filterBy({ [SEARCH_FIELD]: 'tap action' });

    expect(editor.headers()).toEqual(['Back', 'Lights']);
    expect(editor.forms().map(editor.fieldNames)).toEqual([['tap_action'], ['tap_action']]);
  });

  it('drops the heading with the last panel a search hides', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    // The heading's own words are no match: a heading is never a hit of its own.
    await editor.filterBy({ [SEARCH_FIELD]: 'your own buttons' });

    expect(editor.panels()).toHaveLength(0);
    expect(editor.heading()).toHaveLength(0);
    expect(editor.add()).toBeNull();
  });

  it('shows each button’s own fields under customized only', async () => {
    const editor = await mount({ show: true, buttons: [{ icon: 'mdi:home' }, LIGHTS] });

    await editor.filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });

    expect(editor.forms().map(editor.fieldNames)).toEqual([
      ['icon'],
      ['icon', 'name', 'entity', 'tap_action'],
    ]);
  });
});

describe('the toolbar buttons’ write helpers', () => {
  it('reads the list as written, and an empty one where there is none', () => {
    const config = { toolbar: { buttons: [BACK, { name: 'Draft' }] } } as unknown as Types.Config;

    expect(Buttons.writtenButtons(config)).toEqual([BACK, { name: 'Draft' }]);
    expect(Buttons.writtenButtons(config)).not.toBe(config.toolbar!.buttons);
    expect(Buttons.writtenButtons({} as Types.Config)).toEqual([]);
    expect(
      Buttons.writtenButtons({ toolbar: { buttons: 'mdi:home' } } as unknown as Types.Config),
    ).toEqual([]);
  });

  it('edits an entry that is no object as an empty button', () => {
    expect(Buttons.toButtonFormData('mdi:home')).toEqual({});
    expect(Buttons.toButtonFormData(null)).toEqual({});
    expect(Buttons.toButtonFormData(BACK)).toEqual(BACK);
    expect(Buttons.toButtonFormData(BACK)).not.toBe(BACK);
  });

  it('stores an emptied field as no key, trims text, and keeps keys it does not edit', () => {
    expect(
      Buttons.fromButtonFormData({
        icon: ' mdi:home ',
        name: '   ',
        entity: null,
        tap_action: undefined,
        hold_action: { action: 'none' },
        style: '',
      }),
    ).toEqual({ icon: 'mdi:home', hold_action: { action: 'none' }, style: '' });
  });

  it('drops a Nothing the form picked, and keeps one the button already held', () => {
    const nothing = { icon: 'mdi:home', tap_action: { action: 'none' } };
    expect(
      Buttons.fromButtonFormData(nothing, { icon: 'mdi:home', tap_action: { action: 'toggle' } }),
    ).toEqual({
      icon: 'mdi:home',
    });
    expect(Buttons.fromButtonFormData(nothing, { icon: 'mdi:home' })).toEqual({ icon: 'mdi:home' });
    expect(Buttons.fromButtonFormData(nothing, nothing)).toEqual(nothing);
    // Anything more than Nothing is an action of its own, kept as written.
    const more = { icon: 'mdi:home', tap_action: { action: 'none', confirmation: true } };
    expect(Buttons.fromButtonFormData(more, { icon: 'mdi:home' })).toEqual(more);
  });

  it('moves, removes and adds without touching the list it was given', () => {
    const list = [BACK, LIGHTS, HOME];
    const frozen = structuredClone(list);

    expect(Buttons.moveButton(list, 1, -1)).toEqual([LIGHTS, BACK, HOME]);
    expect(Buttons.moveButton(list, 1, 1)).toEqual([BACK, HOME, LIGHTS]);
    expect(Buttons.moveButton(list, 0, -1)).toEqual(list);
    expect(Buttons.moveButton(list, 2, 1)).toEqual(list);
    expect(Buttons.moveButton(list, 5, -1)).toEqual(list);
    expect(Buttons.removeButton(list, 0)).toEqual([LIGHTS, HOME]);
    expect(Buttons.writeButton(list, 2, { icon: 'mdi:home' })).toEqual([
      BACK,
      LIGHTS,
      { icon: 'mdi:home' },
    ]);
    expect(Buttons.writeButton(list, 3, { icon: 'mdi:home' })).toEqual(list);

    const added = Buttons.addButton(list);
    expect(added).toEqual([BACK, LIGHTS, HOME, NEW_TOOLBAR_BUTTON]);
    expect(added[3]).not.toBe(NEW_TOOLBAR_BUTTON);
    expect(list).toEqual(frozen);
  });

  it('titles a button by its name, its icon or its place', () => {
    expect(Buttons.buttonTitle({ ...BACK, name: ' Back ' }, 0, 'Button {number}')).toBe('Back');
    expect(Buttons.buttonTitle({ icon: 'mdi:arrow-left' }, 0, 'Button {number}')).toBe(
      'Arrow left',
    );
    expect(Buttons.buttonTitle({ icon: 'mdi:' }, 2, 'Button {number}')).toBe('Button 3');
    expect(Buttons.buttonTitle('mdi:home', 0, 'Knopf {number}')).toBe('Knopf 1');
  });
});
