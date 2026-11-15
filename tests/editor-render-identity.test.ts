/**
 * A render hands each form the same objects unless what the form reads has changed (backlog
 * item 307).
 *
 * `ha-form` updates for every new `schema`, `data`, `hass`, `computeLabel` or `computeHelper` it
 * is handed. Today's editor handed each of its forms new ones on every render, so every form
 * updated on every render: about 20 ms in Home Assistant, two to four times a second while the
 * dialog sat idle. Now each input is kept while what it is made from is equal, and a panel's form
 * is handed only the data its own fields read.
 *
 * Proved by two genuine renders, never one render compared with itself: a real write through
 * `value-changed`, then a bare `requestUpdate()`. Every other form must hold the very objects it
 * held before the write, both times; the written form's data must differ, the control showing the
 * comparison can see a change at all.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD,
  type FormElement,
  type Owner,
  changeField,
  entry,
  fakeHass,
  formOf,
  formsOf,
  helperOf,
  mountEditor,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { PANELS } from '../src/rendering/editor/panels';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { WORKSPACE_FIELD } from '../src/rendering/editor/workspace';
import * as Logger from '../src/utils/logger';

const INPUTS = ['schema', 'data', 'hass', 'computeLabel', 'computeHelper'] as const;

/** What a form was handed, input by input. */
type Inputs = Record<(typeof INPUTS)[number], unknown>;

const CONFIG = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: [{ entity: 'calendar.anna', label: 'mdi:home' }, 'calendar.ben'],
  weather: { entity: 'weather.home', position: 'both' },
  toolbar: { show: true, buttons: [{ icon: 'mdi:home', name: 'Home', entity: 'light.hall' }] },
};

/**
 * What every drawn form holds now.
 *
 * @param forms - The forms
 * @returns Each form's inputs
 */
function inputsOf(forms: ReadonlyArray<FormElement>): Map<FormElement, Inputs> {
  return new Map(
    forms.map((form) => [
      form,
      Object.fromEntries(INPUTS.map((input) => [input, form[input]])) as Inputs,
    ]),
  );
}

/**
 * The inputs of each form that are not the very objects it held before.
 *
 * @param before - What each form held before
 * @param now - What each form holds now
 * @returns `form <place>: <input>` for every input handed a new object
 */
function moved(before: Map<FormElement, Inputs>, now: Map<FormElement, Inputs>): string[] {
  const places = [...before.keys()];
  return [...now].flatMap(([form, inputs]) =>
    INPUTS.filter((input) => inputs[input] !== before.get(form)?.[input]).map(
      (input) => `form ${places.indexOf(form) + 1} (${form.className}): ${input}`,
    ),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe.each<{ name: string; workspace?: string; id: string; value: unknown; owner: Owner }>([
  { name: 'the card’s title', id: 'card:title', value: 'Family', owner: CARD },
  { name: 'one calendar’s name', id: 'calendar:name', value: 'Ben at school', owner: entry(1) },
  {
    name: 'a size in the List layout, which then holds it as its own',
    workspace: 'list',
    id: 'events:event_font_size',
    value: '18px',
    owner: CARD,
  },
])('a write to $name', ({ workspace, id, value, owner }) => {
  it('hands every other form the objects it held before, through the write and a bare render', async () => {
    const editor = await mountEditor(CONFIG, {
      hass: fakeHass({ localize: (key: string) => key }),
    });
    if (workspace !== undefined)
      await changeField(editor, `workspace:${WORKSPACE_FIELD}`, workspace);
    await openPanels(editor);
    const render = vi.spyOn(editor, 'render');

    const forms = formsOf(editor);
    const written = formOf(editor, id, owner)!;
    const before = inputsOf(forms);
    // Every form the editor draws: the three above the panels, the nine panels' forms, the
    // buttons' caption, both calendars' and the button's.
    expect(forms).toHaveLength(3 + 9 + 1 + 2 + 1);

    await changeField(editor, id, value, owner);
    const afterWrite = inputsOf(formsOf(editor));
    editor.requestUpdate();
    await editor.updateComplete;
    const afterRender = inputsOf(formsOf(editor));

    // Two genuine renders, the same forms both times.
    expect(render).toHaveBeenCalledTimes(2);
    expect([...afterWrite.keys()]).toEqual(forms);
    expect([...afterRender.keys()]).toEqual(forms);
    // The control: the write reached its form, which was handed new data.
    expect(afterWrite.get(written)!.data).not.toBe(before.get(written)!.data);

    const others = new Map([...before].filter(([form]) => form !== written));
    expect(moved(others, new Map([...afterWrite].filter(([form]) => form !== written)))).toEqual(
      [],
    );
    expect(moved(others, new Map([...afterRender].filter(([form]) => form !== written)))).toEqual(
      [],
    );
    // And the bare render hands the written form what the write left it.
    expect(moved(afterWrite, afterRender)).toEqual([]);
  });
});

describe('a panel’s builder', () => {
  it('builds nothing again for a render that moved none of its inputs, and again for one that did', async () => {
    const editor = await mountEditor(CONFIG);
    await openPanels(editor);
    const builds = PANELS.map((panel) => vi.spyOn(panel, 'build'));
    const calls = () => builds.reduce((sum, build) => sum + build.mock.calls.length, 0);

    editor.requestUpdate();
    await editor.updateComplete;
    expect(calls()).toBe(0);

    // The control: a write moves the configuration they are built from.
    await changeField(editor, 'card:title', 'Family');
    expect(calls()).toBe(PANELS.length);
  });
});

describe('a kept helper', () => {
  it('is made again once the note it shows moves, so a field never reads stale', async () => {
    const editor = await mountEditor(CONFIG);
    await changeField(editor, `workspace:${WORKSPACE_FIELD}`, 'list');
    await openPanels(editor);
    const helper = formOf(editor, 'events:event_font_size')!.computeHelper;
    expect(helperOf(editor, 'events:event_font_size')).toContain(
      EDITOR_STRINGS['value_source.inherited'],
    );

    await changeField(editor, 'events:event_font_size', '18px');

    expect(formOf(editor, 'events:event_font_size')!.computeHelper).not.toBe(helper);
    expect(helperOf(editor, 'events:event_font_size')).toContain(
      EDITOR_STRINGS['value_source.own'],
    );
  });

  it('answers for the fields drawn now, where the notes line up with the fields drawn before', async () => {
    // A fixed height draws `card_height` where a maximum draws `card_max_height`, and both are
    // set for this layout: the Layout form's notes read the same, place by place, before and after
    // the switch, while the field in the last place is another one.
    const editor = await mountEditor({ ...CONFIG, list: { height: '300px' } });
    await changeField(editor, `workspace:${WORKSPACE_FIELD}`, 'list');
    await openPanels(editor);
    expect(helperOf(editor, 'layout:card_height')).toContain(EDITOR_STRINGS['value_source.own']);

    await changeField(editor, 'layout:height_mode', 'maximum');

    expect(helperOf(editor, 'layout:card_max_height')).toContain(
      EDITOR_STRINGS['value_source.own'],
    );
  });
});

describe('a form whose change the editor does not take', () => {
  it('is handed the data the editor holds again, as every render used to hand it', async () => {
    const editor = await mountEditor(CONFIG);
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const form = formOf(editor, `workspace:${WORKSPACE_FIELD}`)!;
    const shown = form.data;

    // As `ha-form` does: it takes the value into its own data, then announces it.
    form.data = { ...shown, [WORKSPACE_FIELD]: 'nowhere' };
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: form.data },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(form.data).toBe(shown);
  });
});
