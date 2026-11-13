/**
 * A calendar's visibility conditions in the visual editor.
 *
 * Under a Visibility heading of their own directly before Event Filtering: whether an entry shows
 * at all is the coarsest question its panel asks. Edited in Home Assistant's own Visibility editor
 * (`ha-card-conditions-editor`, the element under a card's Visibility tab) wherever Home Assistant
 * defines it with the two properties the editor sets, and as YAML in Home Assistant's own code
 * editor (the `object` selector) wherever it does not.
 *
 * Pinned here: the field and its words; that conditions reach the stored entry as written and come
 * back unchanged, from either editor; that a cleared editor stores nothing, since an empty object
 * would read as one condition the card cannot judge and hide the calendar; and which editor shows
 * when. Home Assistant's element cannot be unregistered once defined, so the tests without it come
 * first. Its place among the panel's other fields is pinned with them, in `editor-filter.test.ts`.
 */

import { LitElement } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { buildEntitySchema, splitAtVisibility } from '../src/rendering/editor/schemas/entity';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

customElements.define('editor-visibility-probe', CalendarCardProEditor);

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
    expect(schema[at - 1]).toEqual({ name: 'heading_visibility', type: 'constant' });
  });

  it("is named in Home Assistant's words, and explained", () => {
    expect({
      heading: lookup('en', 'heading_visibility'),
      label: lookup('en', 'entity.visibility'),
      helper: EDITOR_STRINGS['entity.visibility.helper'],
    }).toEqual({
      heading: 'Visibility',
      label: 'Conditions',
      helper:
        'Shows this calendar\u2019s events only while all of these conditions hold, the same ' +
        'conditions a card\u2019s Visibility tab sets. With none, they always show. Not applied ' +
        'while you edit the card.',
    });
  });

  it('is translated in every language that translates the name', () => {
    const missing = Object.entries(EDITOR_LANGUAGE_STRINGS)
      .filter(([, strings]) => strings['entity.name'] !== undefined)
      .filter(
        ([, strings]) =>
          !strings.heading_visibility ||
          !strings['entity.visibility'] ||
          !strings['entity.visibility.helper'],
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

describe('splitting the panel around the conditions', () => {
  it('puts the heading before them and Event Filtering after', () => {
    const schema = buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });
    const split = splitAtVisibility(schema)!;

    expect(split.before[split.before.length - 1]).toEqual({
      name: 'heading_visibility',
      type: 'constant',
    });
    expect(split.after[0]).toEqual({ name: 'heading_filters', type: 'constant' });
    expect(split.before.length + split.after.length).toBe(schema.length - 1);
  });

  it('has nothing to split where filtering left the conditions out', () => {
    const schema = buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });

    expect(splitAtVisibility(schema.filter((node) => node.name !== 'visibility'))).toBeUndefined();
  });
});

describe('which editor a calendar panel shows', () => {
  interface EditorHost extends HTMLElement {
    hass: unknown;
    setConfig(config: unknown): void;
    updateComplete: Promise<unknown>;
  }

  interface Form extends HTMLElement {
    data: Record<string, unknown>;
    schema: HaFormSchema[];
  }

  interface ConditionsEditor extends HTMLElement {
    hass: unknown;
    conditions: unknown;
  }

  const HASS = { states: {}, locale: { language: 'en' } };

  async function render(entities: ReadonlyArray<unknown>) {
    const element = document.createElement('editor-visibility-probe') as EditorHost;
    element.hass = HASS;
    document.body.appendChild(element);
    element.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities });
    await element.updateComplete;

    const emitted: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
    });
    const root = element.shadowRoot!;
    return {
      element,
      emitted,
      forms: () => Array.from(root.querySelectorAll<Form>('ha-form.entity-form')),
      editors: () =>
        Array.from(root.querySelectorAll<ConditionsEditor>('ha-card-conditions-editor')),
      helpers: () =>
        Array.from(root.querySelectorAll('.entity-visibility-helper')).map((node) =>
          node.textContent?.trim(),
        ),
    };
  }

  /** Whether a form offers the YAML box for the conditions. */
  const offersYaml = (form: Form): boolean =>
    form.schema.some((node) => node.name === 'visibility');

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the YAML box where Home Assistant's Visibility editor is not defined", async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }]);

    expect(editor.editors()).toEqual([]);
    expect(editor.forms().map(offersYaml)).toEqual([true]);
    expect(editor.forms()[0].data.visibility).toEqual(CONDITIONS);
  });

  it('shows the YAML box where an element of that name lacks the conditions property', async () => {
    const get = customElements.get.bind(customElements);
    vi.spyOn(customElements, 'get').mockImplementation((name) =>
      name === 'ha-card-conditions-editor'
        ? ({ elementProperties: new Map([['hass', {}]]) } as unknown as CustomElementConstructor)
        : get(name),
    );
    const editor = await render([ANNA]);

    expect(editor.editors()).toEqual([]);
    expect(editor.forms().map(offersYaml)).toEqual([true]);
  });

  it('takes over from the YAML box once Home Assistant defines it, with the stored conditions', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }, BEN]);
    expect(editor.editors()).toEqual([]);

    class ConditionsEditorStub extends LitElement {
      static override properties = {
        hass: { attribute: false },
        conditions: { attribute: false },
      };
    }
    customElements.define('ha-card-conditions-editor', ConditionsEditorStub);
    await customElements.whenDefined('ha-card-conditions-editor');
    await editor.element.updateComplete;

    const [anna, ben] = editor.editors();
    expect(anna.conditions).toBe(CONDITIONS);
    expect(ben.conditions).toEqual([]);
    // The editor's own Home Assistant, not the wrapped one its forms get.
    expect(anna.hass).toBe(HASS);
    expect(editor.forms().some(offersYaml)).toBe(false);
  });

  it('sits between the Visibility heading and Event Filtering, under the helper', async () => {
    const editor = await render([ANNA]);
    const [before, after] = editor.forms();
    const container = editor.editors()[0].parentElement!;

    expect(editor.forms()).toHaveLength(2);
    expect(before.schema[before.schema.length - 1]?.name).toBe('heading_visibility');
    expect(after.schema[0]?.name).toBe('heading_filters');
    expect(container.previousElementSibling).toBe(before);
    expect(container.nextElementSibling).toBe(after);
    expect(editor.helpers()).toEqual([EDITOR_STRINGS['entity.visibility.helper']]);
  });

  it('reads one condition written without a list as a list of one', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS[0] }]);

    expect(editor.editors()[0].conditions).toEqual([CONDITIONS[0]]);
  });

  it('keeps the YAML box for a list holding something that is not a condition', async () => {
    const editor = await render([{ entity: ANNA, visibility: [CONDITIONS[0], null] }, BEN]);

    // Ben's panel has Home Assistant's editor; Anna's keeps the box that shows what is written.
    expect(editor.editors()).toHaveLength(1);
    expect(editor.forms().map(offersYaml)).toEqual([true, false, false]);
  });

  it('writes what it sends to that calendar alone, and nothing more', async () => {
    const editor = await render([{ entity: ANNA, label: 'A' }, BEN]);
    const outside = vi.fn();
    editor.element.addEventListener('value-changed', outside);

    editor.editors()[1].dispatchEvent(
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

  it('stores nothing once the last condition is removed', async () => {
    const editor = await render([{ entity: ANNA, label: 'A', visibility: CONDITIONS }]);

    editor.editors()[0].dispatchEvent(new CustomEvent('value-changed', { detail: { value: [] } }));

    expect(editor.emitted[editor.emitted.length - 1]?.entities).toEqual([
      { entity: ANNA, label: 'A' },
    ]);
  });

  it('ignores a value-changed that carries no list', async () => {
    const editor = await render([{ entity: ANNA, visibility: CONDITIONS }]);

    editor
      .editors()[0]
      .dispatchEvent(new CustomEvent('value-changed', { detail: { value: CONDITIONS[0] } }));

    expect(editor.emitted).toEqual([]);
  });
});
