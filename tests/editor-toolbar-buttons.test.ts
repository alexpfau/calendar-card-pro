/**
 * The toolbar's own buttons in the editor: under Card & Header's toolbar controls, a row per
 * button that opens in place to Move Up, Move Down and Remove above a form per field, and Add
 * Button after the last (D09 A).
 *
 * Three things are pinned, and each fails where the others cannot see.
 *
 * The **write path**. Every change goes through `toStoredConfig` and rewrites `toolbar.buttons`
 * and nothing else; an untouched list is stored exactly as written; and removing the last button
 * takes the key with it. A list written raw would store defaults, and one rebuilt from the list
 * the card resolves would drop the entry somebody is still filling in.
 *
 * The **rows**. One per entry as written, named by its name, its icon or its place, with what a
 * press does under it, opened as Add Button creates it with focus on its Icon field's wrapper,
 * and keyed by its button rather than its place, so a moved button takes its open row and the
 * keyboard's focus with it.
 *
 * The **form**. Four fields, pinned by value, and an action dropdown offering every card action,
 * `back` among them, ahead of Home Assistant's, each named through the editor's wrapped `hass`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FormElement,
  button,
  changeField,
  chooseResult,
  fakeHass,
  formOf,
  formsOf,
  helperOf,
  keysOf,
  labelOf,
  mountEditor,
  openPageOf,
  resultRows,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Buttons from '../src/rendering/editor/buttons';
import { SEARCH_FIELD } from '../src/rendering/editor/filter';
import { HA_ACTION_LABEL_PREFIX } from '../src/rendering/editor/hass-localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { ACTION_OPTIONS } from '../src/rendering/editor/schemas/actions';
import {
  NEW_TOOLBAR_BUTTON,
  TOOLBAR_BUTTON_ICON,
  TOOLBAR_BUTTON_PATH,
} from '../src/rendering/editor/schemas/card';

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
  const element = await mountEditor(
    {
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      ...(toolbar === undefined ? {} : { toolbar }),
      ...extra,
    },
    { hass: fakeHass({ localize: (key: string) => `HA:${key}` }) },
  );
  // The Card & Header panel holds the buttons, opened as a user would to reach them: a closed
  // panel mounts no form. Each button's own panel stays as it was, closed until a test opens it.
  await openPageOf(element, 'card:title');

  const reported: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    const config = structuredClone((event as CustomEvent).detail.config) as Record<string, unknown>;
    reported.push(config);
    element.setConfig(config);
  });

  const root = element.shadowRoot!;
  const rows = () => Array.from(root.querySelectorAll<HTMLElement>('.button-row'));
  const toggle = (row: number) =>
    rows()[row].querySelector<HTMLButtonElement>(':scope > .cal-row [aria-expanded]')!;
  const forms = () => formsOf(element, button());
  const fieldNames = (form: FormElement) =>
    [...walkSchema(form.schema)].map(({ node }) => node.name);

  const press = async (button: HTMLButtonElement | null) => {
    if (!button) throw new Error('no such button');
    button.click();
    await element.updateComplete;
  };

  /** One row's action, by the text on it, the row opened first as a user opens it. */
  const control = async (row: number, label: string) => {
    if (toggle(row).getAttribute('aria-expanded') !== 'true') await press(toggle(row));
    const found = Array.from(
      rows()[row].querySelectorAll<HTMLButtonElement>('.button-actions button'),
    ).find((button) => button.textContent?.trim() === label);
    if (!found) throw new Error(`no ${label} button on row ${row}`);
    return found;
  };

  const last = () => reported[reported.length - 1];
  const storedButtons = () => (last().toolbar as Record<string, unknown>).buttons;

  return {
    element,
    root,
    reported,
    last,
    storedButtons,
    rows,
    toggle,
    headers: () => rows().map((row) => row.querySelector('.cal-title')?.textContent?.trim()),
    summaries: () => rows().map((row) => row.querySelector('.cal-summary')?.textContent?.trim()),
    opened: () => rows().map((_, at) => toggle(at).getAttribute('aria-expanded') === 'true'),
    forms,
    fieldNames,
    control,
    press,
    // The card-owned heading Card & Header draws above the buttons; search results draw the
    // buttons under the page's title instead.
    heading: () =>
      root.querySelector<HTMLElement>('[data-heading="toolbar.buttons.heading"] > .heading') ??
      undefined,
    add: () => root.querySelector<HTMLButtonElement>('.add-button'),
  };
}

describe('the toolbar buttons in the editor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws no button rows, heading or Add Button while the toolbar is hidden', async () => {
    for (const toolbar of [undefined, { show: false, buttons: [BACK] }]) {
      const editor = await mount(toolbar);

      expect(editor.rows()).toHaveLength(0);
      expect(editor.heading()).toBeUndefined();
      expect(editor.add()).toBeNull();
    }
  });

  it('keeps a hidden toolbar’s buttons through an edit elsewhere', async () => {
    const editor = await mount({ show: false, buttons: [BACK] });

    await changeField(editor.element, 'card:title', 'Family');

    expect(editor.last().title).toBe('Family');
    expect(editor.last().toolbar).toEqual({ show: false, buttons: [BACK] });
  });

  it('names each row by its name, else its icon as words, else its place', async () => {
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

  it('leads every row with the same fixed icon, not the button’s own', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    const icons = editor
      .rows()
      .map((row) => row.querySelector('.cal-body > svg path')?.getAttribute('d'));
    expect(icons).toEqual([TOOLBAR_BUTTON_ICON, TOOLBAR_BUTTON_ICON]);
  });

  it('says under each name what a press does, by Home Assistant’s action names', async () => {
    const editor = await mount({
      show: true,
      buttons: [LIGHTS, HOME, BACK, { icon: 'mdi:home' }],
    });

    // The fake localize answers `HA:<key>` for Home Assistant's actions; the card's own are named
    // through the editor's wrapped hass. A button with no action runs nothing.
    const name = (action: string) => `HA:${HA_ACTION_LABEL_PREFIX}${action}`;
    expect(editor.summaries()).toEqual([
      `${name('toggle')} · light.kitchen`,
      `${name('navigate')} · /lovelace/home`,
      'Go Back',
      name('none'),
    ]);
  });

  it('captions the buttons with one sub-heading, and offers Add Button with none yet', async () => {
    const editor = await mount({ show: true });

    expect(editor.rows()).toHaveLength(0);
    const heading = editor.heading();
    expect(heading).toBeDefined();
    expect(heading!.localName).toBe('h3');
    expect(heading!.textContent!.trim()).toBe('Your Own Buttons');
    expect(editor.add()?.textContent?.trim()).toBe('Add Button');
  });

  it('adds a button the card can draw after the last, opens its row and focuses its Icon', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await editor.press(editor.add());
    await editor.element.updateComplete;

    expect(editor.last().toolbar).toEqual({ show: true, buttons: [BACK, NEW_TOOLBAR_BUTTON] });
    const added = { buttons: [NEW_TOOLBAR_BUTTON as Types.ToolbarButtonConfig] };
    expect(Config.undrawableToolbarButtons({ toolbar: added })).toEqual([]);
    expect(editor.headers()).toEqual(['Back', 'Gesture tap button']);
    expect(editor.opened()).toEqual([false, true]);
    // The Icon field's wrapper, never anything inside its form (R15).
    const icon = editor.rows()[1].querySelector('[data-field="button:icon"]');
    expect(icon?.classList.contains('field')).toBe(true);
    expect(editor.root.activeElement).toBe(icon);

    // A second one opens too, and the first stays as it was.
    await editor.press(editor.add());
    expect(editor.opened()).toEqual([false, true, true]);
  });

  it('moves a button past its neighbor, and its row, still open, with it', async () => {
    const editor = await mount({ show: true, refresh: false, buttons: [BACK, LIGHTS, HOME] });

    const lights = editor.rows()[1];
    // Opened by hand, as its toggle does.
    await openPageOf(editor.element, 'button:icon', button(1));

    await editor.press(await editor.control(1, 'Move Up'));

    expect(editor.last().toolbar).toEqual({
      show: true,
      refresh: false,
      buttons: [LIGHTS, BACK, HOME],
    });
    expect(editor.headers()).toEqual(['Lights', 'Back', 'Home']);
    expect(editor.rows()[0]).toBe(lights);
    expect(editor.opened()).toEqual([true, false, false]);

    await editor.press(await editor.control(0, 'Move Down'));
    await editor.press(await editor.control(1, 'Move Down'));
    expect(editor.storedButtons()).toEqual([BACK, HOME, LIGHTS]);
    expect(editor.rows()[2]).toBe(lights);
  });

  it('offers no move past either end', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    const disabled: boolean[][] = [];
    for (const row of [0, 1, 2]) {
      disabled.push([
        (await editor.control(row, 'Move Up')).disabled,
        (await editor.control(row, 'Move Down')).disabled,
      ]);
    }
    expect(disabled).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('keeps the keyboard on a moved button’s controls', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    // On the button, as a keyboard is.
    const down = await editor.control(0, 'Move Down');
    down.focus();
    await editor.press(down);
    await editor.element.updateComplete;

    // Back is now last, so its Move Down is spent and focus takes its Move Up.
    expect(editor.headers()).toEqual(['Lights', 'Back']);
    expect(editor.root.activeElement).toBe(await editor.control(1, 'Move Up'));
  });

  it('removes one button, and the key with the last of them', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await editor.press(await editor.control(1, 'Remove'));
    expect(editor.storedButtons()).toEqual([BACK, HOME]);
    expect(editor.headers()).toEqual(['Back', 'Home']);
    await editor.element.updateComplete;
    // The line the removal leaves holds focus on its Undo (editor-history.test.ts).
    const line = editor.root.querySelector('[data-status-bar]');
    expect(line?.querySelector('.status-text')?.textContent?.trim()).toBe('Removed Lights');
    expect(editor.root.activeElement).toBe(line?.querySelector('[data-focus="status-undo"]'));

    await editor.press(await editor.control(1, 'Remove'));
    await editor.press(await editor.control(0, 'Remove'));
    expect(editor.last().toolbar).toEqual({ show: true });
    expect(editor.rows()).toHaveLength(0);
  });

  it('writes a field into its own button, and drops a field emptied', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await openPageOf(editor.element, 'button:name', button(1));
    await changeField(editor.element, 'button:name', 'Kitchen lights', button(1));
    expect(editor.storedButtons()).toEqual([BACK, { ...LIGHTS, name: 'Kitchen lights' }, HOME]);
    expect(editor.headers()).toEqual(['Back', 'Kitchen lights', 'Home']);

    await changeField(editor.element, 'button:name', '', button(1));
    await changeField(editor.element, 'button:entity', undefined, button(1));
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
    await openPageOf(editor.element, 'button:tap_action', button(1));
    await changeField(editor.element, 'button:tap_action', { action: 'none' }, button(1));

    expect(editor.storedButtons()).toEqual([
      BACK,
      { icon: 'mdi:lightbulb', name: 'Lights', entity: 'light.kitchen' },
    ]);
  });

  it('keeps a Nothing the YAML already holds through an edit to another field', async () => {
    const quiet = { icon: 'mdi:bell-off', name: 'Quiet', tap_action: { action: 'none' } };
    const editor = await mount({ show: true, buttons: [quiet] });

    await openPageOf(editor.element, 'button:name', button(0));
    await changeField(editor.element, 'button:name', 'Silent', button(0));

    expect(editor.storedButtons()).toEqual([{ ...quiet, name: 'Silent' }]);
  });

  it('keeps what the form does not edit, such as a key written in YAML', async () => {
    const editor = await mount({
      show: true,
      buttons: [{ ...HOME, hold_action: { action: 'none' } }],
    });

    await openPageOf(editor.element, 'button:name', button(0));
    await changeField(editor.element, 'button:name', 'House', button(0));

    expect(editor.storedButtons()).toEqual([
      { ...HOME, name: 'House', hold_action: { action: 'none' } },
    ]);
  });

  it('keeps an entry the card cannot draw, so it can be finished', async () => {
    const editor = await mount({ show: true, buttons: [{ name: 'Draft' }, HOME] });

    expect(editor.headers()).toEqual(['Draft', 'Home']);

    await openPageOf(editor.element, 'button:icon', button(1));
    await changeField(editor.element, 'button:icon', '', button(1));
    expect(editor.storedButtons()).toEqual([
      { name: 'Draft' },
      { name: 'Home', tap_action: HOME.tap_action },
    ]);
    expect(editor.headers()).toEqual(['Draft', 'Home']);
  });

  it('stores an untouched list as written, and rewrites only the list when it changes', async () => {
    const toolbar = { show: true, refresh: false, buttons: [BACK, LIGHTS] };
    const editor = await mount(structuredClone(toolbar));

    await changeField(editor.element, 'card:title', 'Family');
    expect(editor.last().toolbar).toEqual(toolbar);

    // A toolbar switch is written beside the list, which stays as it was.
    await changeField(editor.element, 'card:toolbar.reset', true);
    expect(editor.last().toolbar).toEqual({ ...toolbar, reset: true });

    const before = editor.last();
    await openPageOf(editor.element, 'button:name', button(0));
    await changeField(editor.element, 'button:name', 'Go back', button(0));
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

    await openPageOf(editor.element, 'button:name', button(0));
    await changeField(editor.element, 'button:name', 'Back ', button(0));
    await changeField(
      editor.element,
      'button:name',
      valueOf(editor.element, 'button:name', button(0)),
      button(0),
    );

    expect(editor.reported).toHaveLength(0);
  });
});

describe('a toolbar button’s form', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('edits icon, name, entity and tap action, each labeled and explained', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await openPageOf(editor.element, 'button:icon', button(0));
    // A form per field, each named after its field; the selectors that read states or name the
    // card's actions on the live hass, the name on the steady one (`hass-key.ts`).
    expect(editor.forms().map(editor.fieldNames)).toEqual([
      ['icon'],
      ['name'],
      ['entity'],
      ['tap_action'],
    ]);
    expect(editor.forms().map((form) => form.dataset.hass)).toEqual([
      'live',
      'steady',
      'live',
      'live',
    ]);
    const fields = ['button:icon', 'button:name', 'button:entity', 'button:tap_action'];
    expect(fields.map((id) => labelOf(editor.element, id, button(0)))).toEqual([
      'Icon',
      'Name',
      'Entity',
      'Tap Action',
    ]);
    for (const id of fields) expect(helperOf(editor.element, id, button(0))).toBeTruthy();
    expect(Object.assign({}, ...editor.forms().map((form) => form.data))).toEqual(BACK);
  });

  it('offers every card action, back included, ahead of Home Assistant’s', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await openPageOf(editor.element, 'button:tap_action', button(0));
    const node = formOf(editor.element, 'button:tap_action', button(0))!.schema.find(
      (candidate) => candidate.name === 'tap_action',
    );
    expect(node).toEqual({
      name: 'tap_action',
      selector: { ui_action: { actions: EXPECTED_ACTIONS } },
    });
  });

  it('names the card’s own actions through the editor’s hass, back among them', async () => {
    const editor = await mount({ show: true, buttons: [BACK] });

    await openPageOf(editor.element, 'button:tap_action', button(0));
    const hass = formOf(editor.element, 'button:tap_action', button(0))!.hass;
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

    expect(card.strings).toEqual(['toolbar.buttons', 'toolbar.controls']);
    expect(card.subforms?.({ view: 'list', config, language: 'en' })).toEqual([
      {
        path: TOOLBAR_BUTTON_PATH,
        schema: [
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

  it('lists a button whose entity answers, whole, and opens it alone', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });

    await changeField(editor.element, `filter:${SEARCH_FIELD}`, 'kitchen');

    const keys = keysOf(editor.element, 'button');
    expect(
      resultRows(editor.element).map(({ id, ownerKey, crumbs }) => [id, ownerKey, crumbs]),
    ).toEqual(
      ['button:icon', 'button:name', 'button:entity', 'button:tap_action'].map((id) => [
        id,
        keys[1],
        'Card & Header › Your Own Buttons › Lights',
      ]),
    );

    await chooseResult(editor.element, `result:button:entity:${keys[1]}`);
    expect(editor.opened()).toEqual([false, true, false]);
    // Each field in a form of its own, in the button's order, the entity lit where it is.
    const forms = formsOf(editor.element, button(1));
    expect(forms.map(editor.fieldNames)).toEqual([['icon'], ['name'], ['entity'], ['tap_action']]);
    expect(forms.map((form) => form.closest('.jump') !== null)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('lists only the field a search names, on every button', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    await changeField(editor.element, `filter:${SEARCH_FIELD}`, 'tap action');

    expect(
      resultRows(editor.element)
        .filter((row) => row.ownerKey !== undefined)
        .map(({ id, crumbs }) => [id, crumbs.split(' › ').pop()]),
    ).toEqual([
      ['button:tap_action', 'Back'],
      ['button:tap_action', 'Lights'],
    ]);
  });

  it('lists no button for the words of its heading alone', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });

    // The heading's own words are no match: a heading is never a hit of its own.
    await changeField(editor.element, `filter:${SEARCH_FIELD}`, 'your own buttons');

    expect(resultRows(editor.element).filter((row) => row.ownerKey !== undefined)).toEqual([]);
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

    expect(Buttons.moveButtonTo(list, 1, 0)).toEqual([LIGHTS, BACK, HOME]);
    expect(Buttons.moveButtonTo(list, 1, 2)).toEqual([BACK, HOME, LIGHTS]);
    expect(Buttons.moveButtonTo(list, 2, 0)).toEqual([HOME, BACK, LIGHTS]);
    expect(Buttons.moveButtonTo(list, 0, -1)).toEqual(list);
    expect(Buttons.moveButtonTo(list, 2, 3)).toEqual(list);
    expect(Buttons.moveButtonTo(list, 5, 0)).toEqual(list);
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

describe('reordering the toolbar’s own buttons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  /**
   * A button's drag handle, by its place.
   *
   * @param editor - The mounted editor
   * @param at - The button's place
   * @returns The handle
   */
  const handle = (editor: Awaited<ReturnType<typeof mount>>, at: number) =>
    editor.root.querySelector<HTMLButtonElement>(
      `[data-focus="handle:button:${keysOf(editor.element, 'button')[at]}"]`,
    )!;

  /**
   * Presses a key on an element, as the browser dispatches it, and waits for the render.
   *
   * @param editor - The mounted editor
   * @param target - Where the key lands
   * @param key - `KeyboardEvent.key`
   * @param init - Modifiers
   */
  const key = async (
    editor: Awaited<ReturnType<typeof mount>>,
    target: Element,
    key: string,
    init: KeyboardEventInit = {},
  ) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
        ...init,
      }),
    );
    await editor.element.updateComplete;
    await editor.element.updateComplete;
  };

  const said = (editor: Awaited<ReturnType<typeof mount>>) =>
    editor.root.querySelector('.live-region')?.textContent?.trim();

  it('picks up with Space, moves with the arrows, and drops with Space as one write and one undo step', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });
    const back = handle(editor, 0);
    expect(back.getAttribute('aria-label')).toBe('Move Back');
    back.focus();

    await key(editor, back, ' ');
    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect(editor.root.querySelector('.grab-status')?.textContent).toContain(
      'Back, position 1 of 3.',
    );
    await key(editor, back, 'ArrowDown');
    await key(editor, back, 'ArrowDown');
    // The preview moves nothing in the DOM and writes nothing.
    expect(editor.reported).toHaveLength(0);
    expect(said(editor)).toBe('Back, position 3 of 3.');

    await key(editor, back, ' ');
    expect(editor.reported).toHaveLength(1);
    expect(editor.storedButtons()).toEqual([LIGHTS, HOME, BACK]);
    expect(said(editor)).toBe('Moved Back to position 3 of 3.');
    expect(editor.root.activeElement).toBe(handle(editor, 2));
    expect(editor.root.querySelector('[data-focus="undo"]')?.getAttribute('aria-label')).toBe(
      'Undo: Move Back',
    );
  });

  it('puts the button back on Escape, writing nothing, focus kept on its handle', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS] });
    const back = handle(editor, 0);
    back.focus();
    await key(editor, back, ' ');
    await key(editor, back, 'ArrowDown');
    await key(editor, back, 'Escape');

    expect(editor.reported).toHaveLength(0);
    expect(back.getAttribute('aria-pressed')).toBe('false');
    expect(editor.root.querySelector('.grab-status')).toBeNull();
    expect(said(editor)).toBe('Put Back back at position 1 of 2.');
    expect(editor.root.activeElement).toBe(handle(editor, 0));
  });

  it('moves a button at once with Alt+Arrow on its row, one write each', async () => {
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });
    const home = handle(editor, 2);
    home.focus();

    await key(editor, home, 'ArrowUp', { altKey: true });
    expect(editor.storedButtons()).toEqual([BACK, HOME, LIGHTS]);
    await key(editor, editor.toggle(1), 'ArrowUp', { altKey: true });
    expect(editor.storedButtons()).toEqual([HOME, BACK, LIGHTS]);
    expect(editor.reported).toHaveLength(2);
    expect(said(editor)).toBe('Moved Home to position 1 of 3.');
    expect(editor.root.activeElement).toBe(handle(editor, 0));
  });

  it('keeps focus on the handle of a button moved past an identical one', async () => {
    // The configuration does not move, so nothing is written, but the rows do.
    const editor = await mount({ show: true, buttons: [BACK, { ...BACK }, LIGHTS] });
    const [first] = keysOf(editor.element, 'button');
    const held = handle(editor, 0);
    held.focus();

    await key(editor, held, ' ');
    await key(editor, held, 'ArrowDown');
    await key(editor, held, ' ');

    expect(keysOf(editor.element, 'button')[1]).toBe(first);
    expect(editor.root.activeElement).toBe(handle(editor, 1));
    expect(said(editor)).toBe('Moved Back to position 2 of 3.');
    // Still under the keyboard: it picks up again.
    await key(editor, handle(editor, 1), ' ');
    expect(handle(editor, 1).getAttribute('aria-pressed')).toBe('true');
  });

  it('drops a dragged button where its middle passed another’s, as one write', async () => {
    const ROW = 56;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rows = [...(this.parentElement?.children ?? [])].filter(
        (each) => each instanceof HTMLElement && each.dataset.reorder !== undefined,
      );
      const at = this.dataset.reorder === undefined ? -1 : rows.indexOf(this);
      const top = at < 0 ? 0 : 200 + at * (ROW + 8);
      const height = at < 0 ? 0 : ROW;
      return { top, bottom: top + height, height, left: 0, right: 300, width: 300 } as DOMRect;
    });
    const editor = await mount({ show: true, buttons: [BACK, LIGHTS, HOME] });
    const back = handle(editor, 0);
    const pointer = (type: string, clientY: number) =>
      back.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 3,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          clientY,
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );
    const start = 200 + ROW / 2;

    pointer('pointerdown', start);
    // Past Lights' middle, short of Home's.
    pointer('pointermove', start + ROW + 8 + 10);
    expect(editor.rows()[0].classList.contains('lifted')).toBe(true);
    expect(editor.reported).toHaveLength(0);
    pointer('pointerup', start + ROW + 8 + 10);
    await editor.element.updateComplete;
    await editor.element.updateComplete;

    expect(editor.reported).toHaveLength(1);
    expect(editor.storedButtons()).toEqual([LIGHTS, BACK, HOME]);
    expect(said(editor)).toBe('Moved Back to position 2 of 3.');
  });
});
