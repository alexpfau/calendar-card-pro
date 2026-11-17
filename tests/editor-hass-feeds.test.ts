/**
 * The two `hass` feeds, and the editor rendering only for the `hass` changes it draws (backlog
 * item 307, `hass-key.ts`).
 *
 * Home Assistant hands the editor a new `hass` on every state change in the house, two to four a
 * second while the dialog sits idle. A form whose selectors read states or name the card's actions
 * gets the **live** feed: every new `hass`, wrapped so the card's own actions are named, even when
 * the editor skips its render. Every other form gets the **steady** feed, one object for as long as
 * the language, Home Assistant's string table, locale and theme are unchanged, so a new `hass`
 * does not update it at all.
 */

import { LitElement } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type FormElement,
  button,
  changeField,
  entry,
  fakeHass,
  formsOf,
  goPage,
  labelOf,
  mountEditor,
  openPageOf,
  openPanels,
  unfoldAll,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { entrySchema, schemaCtx } from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import {
  EDITOR_HASS_MEMBERS,
  LIVE_SELECTORS,
  editorEntityIds,
  editorHassKey,
  needsLiveHass,
  steadyHass,
} from '../src/rendering/editor/hass-key';
import { HA_ACTION_LABEL_PREFIX } from '../src/rendering/editor/hass-localize';
import { lookup } from '../src/rendering/editor/localize';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { chassisSubforms } from '../src/rendering/editor/subforms';

/** Home Assistant's own Visibility editor, as a stand-in the editor recognizes. */
class ConditionsEditorStub extends LitElement {
  static override properties = {
    hass: { attribute: false },
    conditions: { attribute: false },
  };
}
customElements.define('ha-card-conditions-editor', ConditionsEditorStub);

/** Anything drawn with a `hass`: a form, or Home Assistant's Visibility editor. */
type Fed = HTMLElement & { hass?: Types.Hass };

const EXPAND = `${HA_ACTION_LABEL_PREFIX}expand`;
const EXPAND_LABEL = EDITOR_STRINGS['card_action.option.expand.label'];

function state(id: string, name: string, value = 'off') {
  return { entity_id: id, state: value, attributes: { friendly_name: name } };
}

const STATES = {
  'calendar.anna': state('calendar.anna', 'Anna'),
  'calendar.ben': state('calendar.ben', 'Ben'),
  'person.leo': state('person.leo', 'Leo', 'home'),
  'weather.home': state('weather.home', 'Home', 'sunny'),
  'light.hall': state('light.hall', 'Hall'),
  'sensor.porch': state('sensor.porch', 'Porch', '12'),
};

const CONFIG = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: [{ entity: 'calendar.anna', label: 'person.leo' }, 'calendar.ben'],
  weather: { entity: 'weather.home', position: 'both' },
  toolbar: { show: true, buttons: [{ icon: 'mdi:lightbulb', name: 'Hall', entity: 'light.hall' }] },
};

/** A Home Assistant with its own string table, which the live feed wraps. */
function haWith(states: Readonly<Record<string, unknown>> = STATES): Types.Hass {
  return fakeHass({ states, localize: (key: string) => `HA:${key}` });
}

/** The same Home Assistant a moment later: one entity's state object replaced, nothing else. */
function later(hass: Types.Hass, id: string): Types.Hass {
  return { ...hass, states: { ...hass.states, [id]: { ...hass.states[id] } } };
}

/**
 * Mounts the editor with every panel open, so every form it draws is there to be read.
 *
 * @param hass - Its Home Assistant
 * @returns The editor
 */
async function mountOpen(hass: Types.Hass = haWith()) {
  const editor = await mountEditor(CONFIG, { hass });
  await openPanels(editor);
  return editor;
}

/**
 * Mounts the editor on Anna's entry page, after Ben's, so it draws live forms, steady ones and
 * Home Assistant's Visibility editor at once.
 *
 * @param hass - The `hass`
 * @returns The editor
 */
async function mountEntry(hass: Types.Hass = haWith()) {
  // Every setting a page can draw, so each kind of selector is fed.
  const editor = await mountEditor(CONFIG, { hass, every: true });
  await openPageOf(editor, 'calendar:name', entry(1));
  await unfoldAll(editor);
  await openPageOf(editor, 'calendar:name', entry(0));
  await unfoldAll(editor);
  return editor;
}

/** Everything drawn with a `hass`, by the feed it says it takes. */
function fed(editor: HTMLElement, feed: 'live' | 'steady'): Fed[] {
  return [...editor.shadowRoot!.querySelectorAll<Fed>(`[data-hass="${feed}"]`)];
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('hass-key.ts', () => {
  it('pins the members it compares and the selectors that take the live feed', () => {
    expect(EDITOR_HASS_MEMBERS).toEqual(['language', 'locale', 'localize', 'themes']);
    expect(LIVE_SELECTORS).toEqual(['entity', 'icon', 'object', 'ui_action']);
  });

  it('classifies every selector a form draws, live or steady, and names none no form draws', () => {
    const STEADY = ['boolean', 'number', 'select', 'text'];
    const seen = new Set<string>();
    let schemas = 0;
    const walk = (schema: ReadonlyArray<HaFormSchema>) => {
      schemas += 1;
      for (const { node } of walkSchema(schema)) {
        if ('selector' in node) for (const type of Object.keys(node.selector)) seen.add(type);
      }
    };
    for (const opened of corpus()) {
      const ctx = schemaCtx(opened.config, opened.workspace, 'en');
      for (const panel of PANELS) walk(panel.build(ctx));
      for (const each of opened.config.entities ?? []) walk(entrySchema(each, ctx));
    }
    walk(buildToolbarButtonSchema());
    for (const { schema } of chassisSubforms()) walk(schema);

    console.info(`Selector types: ${seen.size} across ${schemas} schemas`);
    expect(schemas).toBeGreaterThan(1000);
    expect([...seen].sort()).toEqual([...LIVE_SELECTORS, ...STEADY].sort());
  });

  it('takes the live feed for a form with a live selector at any depth, and only then', () => {
    const text = { name: 'title', selector: { text: {} } };
    const icon = { name: 'icon', selector: { icon: {} } };

    expect(needsLiveHass([text, { name: 'switch', selector: { boolean: {} } }])).toBe(false);
    expect(needsLiveHass([text, icon])).toBe(true);
    expect(
      needsLiveHass([
        { type: 'grid', name: '', schema: [{ type: 'grid', name: 'a', schema: [icon] }] },
      ]),
    ).toBe(true);
  });

  it('names the entities the editor draws: calendars, the weather, the buttons’ and persons', () => {
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: [
        'calendar.anna',
        { entity: 'calendar.ben', label: 'person.leo' },
        {
          entity: 'calendar.ben',
          label: 'Ben',
          visibility: [{ condition: 'state', entity: 'sensor.porch' }],
        },
      ],
      weather: { entity: 'weather.home' },
      toolbar: {
        show: true,
        buttons: [{ icon: 'mdi:x', entity: 'light.hall' }, { icon: 'mdi:y' }],
      },
    } as unknown as Types.Config;

    expect([...editorEntityIds(config)].sort()).toEqual([
      'calendar.anna',
      'calendar.ben',
      'light.hall',
      'person.leo',
      'weather.home',
    ]);
    expect(editorEntityIds(config, ['calendar.leo']).has('calendar.leo')).toBe(true);
  });

  it('moves its key for a member the editor draws or a drawn state, and for nothing else', () => {
    const ids = ['calendar.anna'];
    const base = haWith();

    expect(editorHassKey(base, later(base, 'sensor.porch'), ids)).toBe(false);
    expect(editorHassKey(base, { ...base, connection: {} } as Types.Hass, ids)).toBe(false);
    expect(editorHassKey(base, later(base, 'calendar.anna'), ids)).toBe(true);
    for (const member of EDITOR_HASS_MEMBERS) {
      expect(editorHassKey(base, { ...base, [member]: {} } as Types.Hass, ids), member).toBe(true);
    }
    expect(editorHassKey(undefined, base, ids)).toBe(true);
    expect(editorHassKey(base, undefined, ids)).toBe(true);
  });

  it('keeps the steady feed one object until the language, string table, locale or theme moves', () => {
    const base = haWith();
    const steady = steadyHass(base, 'en')!;

    expect(steadyHass(later(base, 'calendar.anna'), 'en')).toBe(steady);
    // Stale by design: the states it was made with.
    expect(steady.states).toBe(base.states);
    expect(steady.localize?.(EXPAND)).toBe(EXPAND_LABEL);
    expect(steadyHass(base, 'de')).not.toBe(steady);
    for (const member of ['localize', 'locale', 'themes']) {
      const moved = { ...base, [member]: member === 'localize' ? (key: string) => key : {} };
      expect(steadyHass(moved as Types.Hass, 'en'), member).not.toBe(steadyHass(base, 'en'));
    }
  });
});

describe('the feeds in the rendered editor', () => {
  it('feeds each form by the selectors it draws, and Home Assistant’s Visibility editor live', async () => {
    // Every setting a page can draw, so each kind of selector is fed.
    const editor = await mountEditor(CONFIG, { hass: haWith(), every: true });
    const feed = (selector: string) =>
      editor.shadowRoot!.querySelector<HTMLElement>(selector)?.dataset.hass;
    const field = (id: string) => feed(`[data-field="${id}"] > ha-form`);
    const name = (element: Fed): string =>
      (element.closest('[data-field]')?.getAttribute('data-field') ??
        (element.className || element.localName)) +
      (element.localName === 'ha-form' ? '' : ` ${element.localName}`);
    const feeds = (): string[] =>
      [...editor.shadowRoot!.querySelectorAll<Fed>('[data-hass]')].map(
        (element) => `${name(element)} ${element.dataset.hass}`,
      );
    const live = (): string[] => feeds().filter((each) => each.endsWith(' live'));

    // The overview: the filter bar, Days to Show and Tapping an Event Opens It; Start Date is the
    // editor's own chips, its calendars are rows, and the preferences are the ⋯ menu's items.
    expect(feeds()).toEqual([
      'filter-form steady',
      'content:days_to_show steady',
      'actions:event_opens_details steady',
    ]);

    // An entry's page: its Calendar picker, each field in a form of its own, and the Visibility
    // editor. Anna's label is a person, picked by entity, and every page draws the location icon;
    // every other field is steady.
    await openPageOf(editor, 'calendar:name', entry(0));
    await unfoldAll(editor);
    expect(live()).toEqual([
      'entry-calendar-form live',
      'calendar:label live',
      'calendar:visibility ha-card-conditions-editor live',
      'calendar:location_icon live',
    ]);
    expect(feeds().length).toBeGreaterThan(live().length + 10);
    expect(field('calendar:name')).toBe('steady');
    // Ben's label is none, so his page draws no live selector for it.
    await openPageOf(editor, 'calendar:name', entry(1));
    await unfoldAll(editor);
    expect(live()).toEqual([
      'entry-calendar-form live',
      'calendar:visibility ha-card-conditions-editor live',
      'calendar:location_icon live',
    ]);

    // Pages: a field takes the live feed by its own selector, one form apiece.
    await openPageOf(editor, 'weather:weather.entity');
    await unfoldAll(editor);
    expect(field('weather:weather.entity')).toBe('live');
    expect(field('weather:weather.position')).toBe('steady');
    await openPageOf(editor, 'actions:tap_action');
    await unfoldAll(editor);
    expect(field('actions:tap_action')).toBe('live');
    expect(field('actions:refresh_interval')).toBe('steady');
    await openPageOf(editor, 'button:icon', button(0));
    expect(feed('.button-form')).toBe('live');
    expect(field('card:title')).toBe('steady');
  });

  it('renders nothing for a hass that moves nothing it draws, and hands it to the live forms alone', async () => {
    const hass = haWith();
    const editor = await mountEntry(hass);
    const render = vi.spyOn(editor, 'render');
    const live = fed(editor, 'live');
    const steady = fed(editor, 'steady');
    const before = new Map([...live, ...steady].map((element) => [element, element.hass]));
    // Event Color and Accent Color are color controls, which draw no form while closed.
    expect([live.length, steady.length]).toEqual([4, 20]);

    const next = later(hass, 'sensor.porch');
    editor.hass = next;
    await editor.updateComplete;

    expect(render).not.toHaveBeenCalled();
    for (const element of live) {
      expect(element.hass).not.toBe(before.get(element));
      expect(element.hass?.states).toBe(next.states);
    }
    for (const element of steady) expect(element.hass).toBe(before.get(element));
  });

  it('keeps the live forms’ states current and their actions named, through every later render', async () => {
    const hass = haWith();
    const editor = await mountEntry(hass);
    const forms = fed(editor, 'live').filter((element) => element.localName === 'ha-form');
    const visibility = fed(editor, 'live').filter((element) => !forms.includes(element));
    expect([forms.length, visibility.length]).toEqual([3, 1]);
    const current = (newest: Types.Hass) => {
      for (const form of forms) {
        expect(form.hass?.states).toBe(newest.states);
        expect(form.hass?.localize?.(EXPAND)).toBe(EXPAND_LABEL);
        expect(form.hass?.localize?.('ui.common.save')).toBe('HA:ui.common.save');
      }
      // Home Assistant's Visibility editor gets Home Assistant's own, as it is.
      for (const element of visibility) expect(element.hass).toBe(newest);
    };

    // A state the editor does not draw: no render, and the live forms have it all the same.
    const next = later(hass, 'sensor.porch');
    editor.hass = next;
    await editor.updateComplete;
    current(next);

    // A later render nothing in hass asked for: a bare request.
    editor.requestUpdate();
    await editor.updateComplete;
    current(next);

    // A state the editor draws, which renders.
    const renamed = later(next, 'calendar.anna');
    editor.hass = renamed;
    await editor.updateComplete;
    current(renamed);

    // The steady forms read no state: theirs stay as they were when the feed was made.
    for (const form of fed(editor, 'steady')) expect(form.hass?.states).toBe(hass.states);
  });

  it('keeps the steady forms’ hass through a render a drawn state asks for', async () => {
    const hass = haWith();
    const editor = await mountOpen(hass);
    const render = vi.spyOn(editor, 'render');
    const steady = new Map(fed(editor, 'steady').map((form) => [form, form.hass]));

    const renamed = {
      ...hass,
      states: { ...hass.states, 'calendar.anna': state('calendar.anna', 'Anna at work') },
    };
    editor.hass = renamed;
    await editor.updateComplete;

    // A calendar's name titles its row in the overview's list, so this one renders.
    expect(render).toHaveBeenCalledTimes(1);
    const titles = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.cal-title')].map(
      (title) => title.textContent!.trim(),
    );
    expect(titles).toEqual(['Anna at work', 'Ben']);
    for (const [form, before] of steady) expect(form.hass).toBe(before);
  });

  it('hands the steady forms a new hass, in the new language, when the language changes', async () => {
    const hass = haWith();
    const editor = await mountOpen(hass);
    const steady = new Map(fed(editor, 'steady').map((form) => [form, form.hass]));
    expect(labelOf(editor, 'events:show_time')).toBe(EDITOR_STRINGS.show_time);

    editor.hass = { ...hass, locale: { language: 'de' } };
    await editor.updateComplete;

    for (const [form, before] of steady) expect(form.hass).not.toBe(before);
    expect(labelOf(editor, 'events:show_time')).toBe(lookup('de', 'show_time'));
    expect(lookup('de', 'show_time')).not.toBe(EDITOR_STRINGS.show_time);
  });
});

describe('an update that carries an irrelevant hass and a bare request together', () => {
  it('renders once, where the hass alone renders nothing', async () => {
    const hass = haWith();
    const editor = await mountOpen(hass);
    const render = vi.spyOn(editor, 'render');

    // The control: the irrelevant hass alone.
    editor.hass = later(hass, 'sensor.porch');
    await editor.updateComplete;
    expect(render).toHaveBeenCalledTimes(0);

    // Both, in one microtask, in either order.
    editor.hass = later(hass, 'sensor.porch');
    editor.requestUpdate();
    await editor.updateComplete;
    expect(render).toHaveBeenCalledTimes(1);
    editor.requestUpdate();
    editor.hass = later(hass, 'sensor.porch');
    await editor.updateComplete;
    expect(render).toHaveBeenCalledTimes(2);

    // What happens without the request being recorded: Lit batches the two, the update names
    // only hass, and the request is lost.
    editor.hass = later(hass, 'sensor.porch');
    LitElement.prototype.requestUpdate.call(editor);
    await editor.updateComplete;
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('opens a button row whose opening lands beside an irrelevant hass', async () => {
    const hass = haWith();
    const editor = await mountEditor(CONFIG, { hass });
    await goPage(editor, 'card_header');
    const hall = editor.shadowRoot!.querySelector<HTMLElement>('.button-row')!;
    expect(hall.querySelector('ha-form')).toBeNull();

    hall.querySelector<HTMLElement>('[aria-expanded]')!.click();
    editor.hass = later(hass, 'sensor.porch');
    await editor.updateComplete;

    expect(hall.querySelector('ha-form')).not.toBeNull();
  });

  it('renders a configuration that arrives beside an irrelevant hass', async () => {
    const hass = haWith();
    const editor = await mountOpen(hass);
    const render = vi.spyOn(editor, 'render');

    editor.setConfig({ ...CONFIG, title: 'Family' });
    editor.hass = later(hass, 'sensor.porch');
    await editor.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
    expect((formsOf(editor).find((form) => 'title' in form.data) as FormElement).data.title).toBe(
      'Family',
    );
  });

  it('writes through such an update as well', async () => {
    const hass = haWith();
    const editor = await mountOpen(hass);

    editor.hass = later(hass, 'sensor.porch');
    await changeField(editor, 'card:title', 'Family');

    expect((formsOf(editor).find((form) => 'title' in form.data) as FormElement).data.title).toBe(
      'Family',
    );
  });
});
