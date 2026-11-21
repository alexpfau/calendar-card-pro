/**
 * A render hands each form the same objects unless what the form reads has changed (backlog
 * item 307).
 *
 * `ha-form` updates for every new `schema`, `data`, `hass`, `computeLabel` or `computeHelper` it
 * is handed. Today's editor handed each of its forms new ones on every render, so every form
 * updated on every render: about 20 ms in Home Assistant, two to four times a second while the
 * dialog sat idle. Now each input is kept while what it is made from is equal, and a field's form,
 * on a section page or on a calendar entry's page, is handed only the data its own field reads.
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
  button,
  changeField,
  editLayout,
  entry,
  fakeHass,
  formOf,
  goOverview,
  mountEditor,
  openPageOf,
  openPanels,
  stateWordOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { PANELS } from '../src/rendering/editor/panels';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';

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

/**
 * Every form the place open draws, live: the field forms of the overview or of one page, the
 * buttons' forms in their panels there, and an entry page's forms.
 *
 * @param editor - The editor
 * @returns The forms, in document order
 */
function drawnHere(editor: HTMLElement): FormElement[] {
  return [...editor.shadowRoot!.querySelectorAll<FormElement>('ha-form')];
}

describe.each<{
  name: string;
  workspace?: string;
  id: string;
  value: unknown;
  owner: Owner;
  open: ReadonlyArray<readonly [string, Owner]>;
}>([
  {
    name: 'the card’s title',
    id: 'card:title',
    value: 'Family',
    owner: CARD,
    // Card & Header, with the toolbar button's own panel open.
    open: [['button:icon', button(0)]],
  },
  {
    name: 'one calendar’s name',
    id: 'calendar:name',
    value: 'Ben at school',
    owner: entry(1),
    // The first calendar's page, then the second's, where the write is made.
    open: [
      ['calendar:name', entry(0)],
      ['calendar:name', entry(1)],
    ],
  },
  {
    name: 'a size in the List layout, which then holds it as its own',
    workspace: 'list',
    id: 'events:event_font_size',
    value: '18px',
    owner: CARD,
    open: [['events:event_font_size', CARD]],
  },
])('a write to $name', ({ workspace, id, value, owner, open }) => {
  it('hands every other form the objects it held before, through the write and a bare render', async () => {
    // Every setting a page can draw, so a write has many other forms to leave alone.
    const editor = await mountEditor(CONFIG, {
      hass: fakeHass({ localize: (key: string) => key }),
      every: true,
    });
    if (workspace !== undefined) await editLayout(editor, workspace);
    for (const [field, who] of open) await openPageOf(editor, field, who);
    const render = vi.spyOn(editor, 'render');

    const forms = drawnHere(editor);
    const written = formOf(editor, id, owner)!;
    const before = inputsOf(forms);
    // Every form the place draws, one per field, and the panels' own.
    expect(forms.length).toBeGreaterThan(5);
    expect(forms).toContain(written);

    await changeField(editor, id, value, owner);
    const afterWrite = inputsOf(drawnHere(editor));
    editor.requestUpdate();
    await editor.updateComplete;
    const afterRender = inputsOf(drawnHere(editor));

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

describe('a visit to a page', () => {
  it('leaves the overview’s form as it was, the very element with the very inputs', async () => {
    // The search bar is the overview's one form: Card Displays is radios, and the calendars rows.
    const editor = await mountEditor(CONFIG);
    const forms = drawnHere(editor);
    const before = inputsOf(forms);
    expect(forms).toHaveLength(1);

    // A calendar's page, then a section's.
    await openPageOf(editor, 'calendar:name', entry(0));
    expect(drawnHere(editor).some((form) => forms.includes(form))).toBe(false);
    await openPageOf(editor, 'events:show_time');
    expect(drawnHere(editor).some((form) => forms.includes(form))).toBe(false);
    await goOverview(editor);

    expect(drawnHere(editor)).toEqual(forms);
    expect(moved(before, inputsOf(drawnHere(editor)))).toEqual([]);
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
  it('draws the pill again once the state it shows moves, so a setting never reads stale', async () => {
    const editor = await mountEditor(CONFIG);
    await editLayout(editor, 'list');
    await openPageOf(editor, 'events:event_font_size');
    expect(stateWordOf(editor, 'events:event_font_size')).not.toBe(EDITOR_STRINGS['state.set']);

    await changeField(editor, 'events:event_font_size', '18px');

    expect(stateWordOf(editor, 'events:event_font_size')).toBe(EDITOR_STRINGS['state.set']);
  });

  it('answers for the fields drawn now, where the notes line up with the fields drawn before', async () => {
    // A fixed height draws `fixed_height` where a maximum draws `maximum_height`, and both are
    // set for this layout: the Layout form's notes read the same, place by place, before and after
    // the switch, while the field in the last place is another one.
    const editor = await mountEditor({ ...CONFIG, list: { card_height: '300px' } });
    await editLayout(editor, 'list');
    await openPageOf(editor, 'layout:fixed_height');
    const own = EDITOR_STRINGS['state.set'];
    expect(stateWordOf(editor, 'layout:fixed_height')).toBe(own);

    await changeField(editor, 'layout:height_mode', 'maximum');

    await openPageOf(editor, 'layout:maximum_height');
    expect(stateWordOf(editor, 'layout:maximum_height')).toBe(own);
  });
});
