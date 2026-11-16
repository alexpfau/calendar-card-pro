/**
 * A calendar's visibility conditions in the visual editor.
 *
 * Under a heading of their own, Who Sees It, directly before Which Events on the entry's page:
 * whether an entry shows at all is the coarsest question its page asks. Edited in Home Assistant's own Visibility editor
 * (`ha-card-conditions-editor`, the element under a card's Visibility tab) wherever Home Assistant
 * defines it with the two properties the editor sets, and as YAML in Home Assistant's own code
 * editor (the `object` selector) wherever it does not.
 *
 * Pinned here: the field and its words; that conditions reach the stored entry as written and come
 * back unchanged, from either editor; that a cleared editor stores nothing, since an empty object
 * would read as one condition the card cannot judge and hide the calendar; and which editor shows
 * when. Home Assistant's element cannot be unregistered once defined, so the tests without it come
 * first. Its place among the page's other fields is pinned with them, in `editor-filter.test.ts`.
 */

import { LitElement } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import {
  type FormElement,
  entry,
  fakeHass,
  formsOf,
  goEntry,
  keysOf,
  mountEditor,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Entities from '../src/rendering/editor/entities';
import { lookup } from '../src/rendering/editor/localize';
import { ENTRY_GROUPS } from '../src/rendering/editor/pages';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

const CONDITIONS = [
  { condition: 'user', users: ['8a1c'] },
  {
    condition: 'or',
    conditions: [{ condition: 'state', entity: 'input_boolean.guest', state: 'on' }],
  },
];

describe('the visibility field', () => {
  it('is a code editor under a heading of its own', () => {
    const schema = buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });
    const at = schema.findIndex((node) => node.name === 'visibility');

    expect(schema[at]).toEqual({ name: 'visibility', selector: { object: {} } });
    expect(
      ENTRY_GROUPS.filter((group) => group.fields.some(([id]) => id === 'calendar:visibility')).map(
        (group) => [group.key, group.fields.map(([id]) => id)],
      ),
    ).toEqual([['heading.who_sees_it', ['calendar:visibility']]]);
  });

  it("is named in Home Assistant's words, and explained", () => {
    expect({
      heading: lookup('en', 'heading.who_sees_it'),
      label: lookup('en', 'entity.visibility'),
      helper: EDITOR_STRINGS['entity.visibility.helper'],
    }).toEqual({
      heading: 'Who Sees It',
      label: 'Conditions',
      helper:
        'Shows this calendar\u2019s events only while all of these conditions hold. Not ' +
        'applied while you edit the card.',
    });
  });

  it('is translated in every language that translates the name', () => {
    const missing = Object.entries(EDITOR_LANGUAGE_STRINGS)
      .filter(([, strings]) => strings['entity.name'] !== undefined)
      .filter(
        ([, strings]) => !strings['entity.visibility'] || !strings['entity.visibility.helper'],
      )
      .map(([language]) => language);

    expect(Object.keys(EDITOR_LANGUAGE_STRINGS).length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});

describe('writing visibility conditions', () => {
  it('stores them as written, and shows them again as written', () => {
    const entry = Entities.fromEntityFormData(ANNA, { visibility: CONDITIONS });

    expect(entry).toEqual({ entity: ANNA, visibility: CONDITIONS });
    expect(Entities.toEntityFormData(entry).visibility).toEqual(CONDITIONS);
  });

  it('stores nothing for a cleared editor, whatever it hands back', () => {
    for (const cleared of [undefined, null, '', [], {}]) {
      expect(Entities.fromEntityFormData(ANNA, { visibility: cleared })).toBe(ANNA);
    }
  });

  it('keeps them through an edit to anything else', () => {
    const before = { entity: ANNA, label: 'A', visibility: CONDITIONS };
    const after = Entities.fromEntityFormData(
      ANNA,
      { ...Entities.toEntityFormData(before), label: 'B' },
      before,
    );

    expect(after).toEqual({ entity: ANNA, label: 'B', visibility: CONDITIONS });
  });
});

describe("which editor a calendar entry's page shows", () => {
  interface ConditionsEditor extends HTMLElement {
    hass: unknown;
    conditions: unknown;
  }

  // With its own localize, which the forms get wrapped and Home Assistant's editor must not.
  const HASS = fakeHass({ localize: (key: string) => key });

  async function render(entities: ReadonlyArray<unknown>) {
    const element = await mountEditor(
      { config_version: Config.CURRENT_CONFIG_VERSION, entities },
      // Who Sees It waits in its Add row until something is stored: draw it either way.
      { hass: HASS, every: true },
    );
    // Only the open page draws its forms: visit every entry's page, keeping what each draws.
    await openPanels(element);

    const emitted: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
    });
    const root = element.shadowRoot!;
    /** Opens one entry's page, unless it is open, as a user does from its row. */
    const open = (index: number) => goEntry(element, keysOf(element, 'entry')[index]);
    return {
      element,
      emitted,
      /** Per entry, whether any form its page draws offers the YAML box. */
      yaml: () =>
        keysOf(element, 'entry').map((_, index) => formsOf(element, entry(index)).some(offersYaml)),
      /** Home Assistant's editor on one entry's page, opening it first; null where it has none. */
      editorOn: async (index: number) => {
        await open(index);
        return root.querySelector<ConditionsEditor>('.entry-page ha-card-conditions-editor');
      },
      /** Home Assistant's editor on every entry's page, page by page. */
      editors: async () => {
        const found: Array<ConditionsEditor | null> = [];
        for (const index of keysOf(element, 'entry').keys()) {
          await open(index);
          found.push(root.querySelector<ConditionsEditor>('.entry-page ha-card-conditions-editor'));
        }
        return found;
      },
      /** The helpers the page open draws for the conditions. */
      helpers: () =>
        Array.from(root.querySelectorAll('.entity-visibility-helper')).map((node) =>
          node.textContent?.trim(),
        ),
    };
  }

  /** Whether a form offers the YAML box for the conditions. */
  const offersYaml = (form: FormElement): boolean =>
    form.schema.some((node) => node.name === 'visibility');

  /** Home Assistant's editor, where a page draws one, failing where it draws none. */
  const drawn = (editor: ConditionsEditor | null): ConditionsEditor => {
    if (editor === null) throw new Error("the page draws no Home Assistant's Visibility editor");
    return editor;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the YAML box where Home Assistant's Visibility editor is not defined", async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }]);

    expect(await editor.editors()).toEqual([null]);
    expect(editor.yaml()).toEqual([true]);
    expect(valueOf(editor.element, 'calendar:visibility', entry(0))).toEqual(CONDITIONS);
  });

  it('shows the YAML box where an element of that name lacks the conditions property', async () => {
    const get = customElements.get.bind(customElements);
    vi.spyOn(customElements, 'get').mockImplementation((name) =>
      name === 'ha-card-conditions-editor'
        ? ({ elementProperties: new Map([['hass', {}]]) } as unknown as CustomElementConstructor)
        : get(name),
    );
    const editor = await render([ANNA]);

    expect(await editor.editors()).toEqual([null]);
    expect(editor.yaml()).toEqual([true]);
  });

  it('takes over from the YAML box once Home Assistant defines it, with the stored conditions', async () => {
    // An editor closed before then is let go of, never redrawn.
    const closed = await render([ANNA]);
    closed.element.remove();
    const redrawn = vi.spyOn(closed.element as unknown as LitElement, 'requestUpdate');

    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }, BEN]);
    expect(await editor.editors()).toEqual([null, null]);
    // Anna's page open, so it is the page already drawn that takes Home Assistant's editor up.
    expect(await editor.editorOn(0)).toBeNull();

    class ConditionsEditorStub extends LitElement {
      static override properties = {
        hass: { attribute: false },
        conditions: { attribute: false },
      };
    }
    customElements.define('ha-card-conditions-editor', ConditionsEditorStub);
    await customElements.whenDefined('ha-card-conditions-editor');
    await editor.element.updateComplete;

    // Read off the page left open, before anything navigates and draws it again.
    const anna = drawn(editor.element.shadowRoot!.querySelector('ha-card-conditions-editor'));
    expect(anna.conditions).toBe(CONDITIONS);
    const ben = drawn(await editor.editorOn(1));
    expect(ben.conditions).toEqual([]);
    // The editor's own Home Assistant, not the wrapped one its forms get.
    expect(anna.hass).toBe(HASS);
    // Every entry's page visited again, so the forms read are the ones each draws now.
    await openPanels(editor.element);
    expect(editor.yaml()).toEqual([false, false]);
    expect(redrawn).not.toHaveBeenCalled();
  });

  it('sits alone under Who Sees It, between Name & Look and Which Events, under the helper', async () => {
    const editor = await render([ANNA]);
    const conditions = drawn(await editor.editorOn(0));
    const container = conditions.parentElement!;
    const section = container.parentElement!;
    const sections = (at: Element | null) =>
      at?.getAttribute('data-heading') ?? at?.localName ?? null;

    // The conditions are the field itself, in place of its YAML form.
    expect(container.getAttribute('data-field')).toBe('calendar:visibility');
    expect(container.querySelector('ha-form')).toBeNull();
    expect(container.firstElementChild?.className).toBe('entity-visibility-helper');
    expect(conditions.previousElementSibling).toBe(container.firstElementChild);
    expect([...section.querySelectorAll('[data-field]')]).toEqual([container]);
    expect(section.querySelector('h3')?.textContent?.trim()).toBe('Who Sees It');
    expect([
      sections(section.previousElementSibling),
      sections(section),
      sections(section.nextElementSibling),
    ]).toEqual(['heading.name_and_look', 'heading.who_sees_it', 'page.which_events']);
    expect(editor.helpers()).toEqual([EDITOR_STRINGS['entity.visibility.helper']]);
  });

  it('reads one condition written without a list as a list of one', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS[0] }]);

    expect(drawn(await editor.editorOn(0)).conditions).toEqual([CONDITIONS[0]]);
  });

  it('keeps the YAML box for a list holding something that is not a condition, at any depth', async () => {
    const editor = await render([
      { entity: ANNA, visibility: [CONDITIONS[0], null] },
      { entity: ANNA, visibility: [{ condition: 'and', conditions: [CONDITIONS[0], null] }] },
      { entity: ANNA, visibility: [{ condition: 'not', conditions: 'user' }] },
      { entity: BEN, visibility: [{ condition: 'or', conditions: CONDITIONS[0] }] },
    ]);

    // Ben's page has Home Assistant's editor; Anna's keep the box that shows what is written.
    expect((await editor.editors()).map((each) => each !== null)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(editor.yaml()).toEqual([true, true, true, false]);
  });

  it('tells it the calendar it edits against, as the current entity', async () => {
    const editor = await render([ANNA, BEN]);
    const ben = drawn(await editor.editorOn(1));
    const ask = (context: string) => {
      const callback = vi.fn();
      const request = Object.assign(
        new Event('context-request', { bubbles: true, composed: true }),
        { context, callback, subscribe: true },
      );
      ben.dispatchEvent(request);
      return callback;
    };

    expect(ask('conditions-entity-context').mock.calls[0][0]).toEqual({
      mode: 'current',
      entityId: BEN,
    });
    // Any other context goes on up, unanswered.
    const outside = vi.fn();
    editor.element.shadowRoot!.addEventListener('context-request', outside);
    expect(ask('something-else')).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it('draws a fresh editor where another calendar takes the entry, so it asks again', async () => {
    const editor = await render([ANNA]);
    const before = drawn(await editor.editorOn(0));

    editor.element.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities: [BEN] });
    await editor.element.updateComplete;

    // The same entry's page, still open: only the calendar it holds moved.
    const page = editor.element.shadowRoot!.querySelector('.entry-page');
    expect(page?.getAttribute('data-entry-key')).toBe(String(keysOf(editor.element, 'entry')[0]));
    const after = drawn(page!.querySelector('ha-card-conditions-editor'));
    expect(after).not.toBe(before);
  });

  it('writes what it sends to that calendar alone, and nothing more', async () => {
    const editor = await render([{ entity: ANNA, label: 'A' }, BEN]);
    const outside = vi.fn();
    editor.element.addEventListener('value-changed', outside);

    drawn(await editor.editorOn(1)).dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: CONDITIONS },
        bubbles: true,
        composed: true,
      }),
    );

    expect(editor.emitted[editor.emitted.length - 1]?.entities).toEqual([
      { entity: ANNA, label: 'A' },
      { entity: BEN, visibility: CONDITIONS },
    ]);
    expect(outside).not.toHaveBeenCalled();
  });

  it('hands back the very list it sent, so it keeps each condition open, through the echo', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }, BEN]);
    // As Home Assistant's editor sends a change: a new list, the changed condition a new object.
    const sent = [{ ...CONDITIONS[0], users: ['8a1c', 'b2d4'] }, CONDITIONS[1]];

    drawn(await editor.editorOn(0)).dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: sent } }),
    );
    await editor.element.updateComplete;
    expect(drawn(await editor.editorOn(0)).conditions).toBe(sent);

    // Home Assistant answers the write with the configuration it was sent, which the card has
    // stored as a copy.
    editor.element.setConfig(editor.emitted[editor.emitted.length - 1]);
    await editor.element.updateComplete;
    expect(drawn(await editor.editorOn(0)).conditions).toBe(sent);
    expect(drawn(await editor.editorOn(1)).conditions).toEqual([]);
  });

  it('hands over the stored list once it says something else, or the entry holds another calendar', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }]);
    const sent = [CONDITIONS[0]];
    drawn(await editor.editorOn(0)).dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: sent } }),
    );
    await editor.element.updateComplete;

    // The YAML changed under it.
    const written = [{ condition: 'user', users: ['c3e5'] }];
    editor.element.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [{ entity: ANNA, visibility: written }],
    });
    await editor.element.updateComplete;
    expect(drawn(await editor.editorOn(0)).conditions).toBe(written);

    // The same conditions, now on another calendar in that place.
    drawn(await editor.editorOn(0)).dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: sent } }),
    );
    await editor.element.updateComplete;
    const moved = [{ condition: 'user', users: ['8a1c'] }];
    editor.element.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [{ entity: BEN, visibility: moved }],
    });
    await editor.element.updateComplete;
    expect(drawn(await editor.editorOn(0)).conditions).toBe(moved);
  });

  it('stores nothing once the last condition is removed', async () => {
    const editor = await render([{ entity: ANNA, label: 'A', visibility: CONDITIONS }]);

    drawn(await editor.editorOn(0)).dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: [] } }),
    );

    expect(editor.emitted[editor.emitted.length - 1]?.entities).toEqual([
      { entity: ANNA, label: 'A' },
    ]);
  });

  it('ignores a value-changed that carries no list', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }]);

    drawn(await editor.editorOn(0)).dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: CONDITIONS[0] } }),
    );

    expect(editor.emitted).toEqual([]);
  });
});

describe('the line under Who Sees It', () => {
  it('points to Days of the Week, which it adds and focuses as a search result does, writing nothing', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA],
    });
    let reported = 0;
    editor.addEventListener('config-changed', () => (reported += 1));
    const [key] = keysOf(editor, 'entry');
    await goEntry(editor, key);
    const root = editor.shadowRoot!;
    const group = root.querySelector('.page-group[data-heading="heading.who_sees_it"]')!;
    const line = group.querySelector('.page-line')!;
    expect(line.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Which days its events show: Which Events › Days of the Week',
    );
    // Days of the Week waits in an Add row until something is stored.
    expect(root.querySelector('[data-field="calendar:days_of_week"]')).toBeNull();

    line.querySelector<HTMLElement>('button.link')!.click();
    await editor.updateComplete;
    await editor.updateComplete;
    const field = root.querySelector('[data-field="calendar:days_of_week"]');
    expect(field).not.toBeNull();
    expect(root.activeElement).toBe(field);
    expect(reported).toBe(0);
  });
});
