/**
 * The per-calendar "Show in Calendar Filter" switch in the visual editor.
 *
 * Three things are pinned here, each failing in a way the others cannot see.
 *
 * **Where the switch sits, what it says, and when it is offered.** Directly under Name, the
 * other option that belongs to the calendar rather than to one block; only while the card's
 * toolbar shows a calendar filter, since on any other card it would control nothing.
 *
 * **That the setting belongs to the calendar.** A calendar listed twice is one chip, so each
 * panel shows the calendar's value, a change on any panel is written to every block, Remove
 * leaves it on the block that remains, and an edit to anything else leaves each block's value
 * exactly as written. Only `false` is stored; turning the switch back on removes the key.
 *
 * **That it travels.** Unlike the name, Copy and Paste carry it: several calendars drawn alike
 * and kept out of the filter alike is the case the option was asked for.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

customElements.define('editor-show-in-legend-probe', CalendarCardProEditor);

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** The per-calendar schema as declared. */
function entitySchema(): HaFormSchema[] {
  return buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });
}

/** The fields a schema renders, in order, headings excluded. */
function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .filter(({ node }) => !('type' in node && node.type === 'constant'))
    .map(({ node }) => node.name);
}

describe('the filter switch', () => {
  it('follows Name, as a switch', () => {
    const schema = entitySchema();
    const names = fieldNames(schema);

    expect(names.slice(0, 3)).toEqual(['name', 'show_in_legend', 'label_type']);
    expect(schema.find((node) => node.name === 'show_in_legend')).toEqual({
      name: 'show_in_legend',
      selector: { boolean: {} },
    });
  });

  it('is offered only on a card whose toolbar shows a calendar filter', () => {
    const offered = (hasLegend: boolean) =>
      fieldNames(
        entitySchemaFor(entitySchema(), 'text', 'custom', 'custom', true, 'custom', hasLegend),
      );

    expect(offered(true)).toContain('show_in_legend');
    expect(offered(false)).not.toContain('show_in_legend');
    // The control: nothing else on the panel comes or goes with it.
    expect(offered(true).filter((name) => name !== 'show_in_legend')).toEqual(offered(false));
  });

  it('is labeled and explained', () => {
    expect({
      label: lookup('en', 'entity.show_in_legend'),
      helper: EDITOR_STRINGS['entity.show_in_legend.helper'],
    }).toEqual({
      label: 'Show in Calendar Filter',
      helper:
        'Off leaves this calendar out of the calendar filter, as a chip and in the menu, so ' +
        'its events always show. Every entry for this calendar shares it.',
    });
  });

  it('is translated wherever the panel is, in every language that translates the name', () => {
    const missing = Object.entries(EDITOR_LANGUAGE_STRINGS)
      .filter(([, strings]) => strings['entity.name'] !== undefined)
      .filter(
        ([, strings]) =>
          !strings['entity.show_in_legend'] || !strings['entity.show_in_legend.helper'],
      )
      .map(([language]) => language);

    expect(Object.keys(EDITOR_LANGUAGE_STRINGS).length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});

describe('writing whether the filter lists a calendar', () => {
  it('stores only false, beside the id and after the name', () => {
    const off = Entities.fromEntityFormData(ANNA, {
      ...Entities.toEntityFormData({ entity: ANNA, label: 'A', name: 'Anna' }),
      show_in_legend: false,
    });

    expect(off).toEqual({ entity: ANNA, name: 'Anna', show_in_legend: false, label: 'A' });
    expect(Object.keys(off)).toEqual(['entity', 'name', 'show_in_legend', 'label']);
    expect(Entities.fromEntityFormData(ANNA, { show_in_legend: true })).toBe(ANNA);
    expect(Entities.fromEntityFormData(ANNA, {})).toBe(ANNA);
  });

  it("shows each block the calendar's value, and on where nothing says otherwise", () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      BEN,
      { entity: ANNA, event_type: 'all_day', show_in_legend: false },
    ];

    expect(
      entities.map((entry) => Entities.toEntityFormData(entry, entities).show_in_legend),
    ).toEqual([false, true, false]);
    // Without the list, a block can only show its own.
    expect(Entities.toEntityFormData(entities[0]).show_in_legend).toBe(true);
  });

  it('writes the switch turned off to every block of the calendar, and to no other', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna', event_type: 'timed' },
      { entity: BEN, label: 'B' },
      { entity: ANNA, event_type: 'all_day' },
    ];

    const next = Entities.writeEntity(entities, 2, {
      ...Entities.toEntityFormData(entities[2], entities),
      show_in_legend: false,
    });

    expect(next).toEqual([
      { entity: ANNA, name: 'Anna', show_in_legend: false, event_type: 'timed' },
      { entity: BEN, label: 'B' },
      { entity: ANNA, show_in_legend: false, event_type: 'all_day' },
    ]);
    expect(Object.keys(next[0] as object)).toEqual([
      'entity',
      'name',
      'show_in_legend',
      'event_type',
    ]);
    expect(next[1]).toBe(entities[1]);
  });

  it('clears it from every block of the calendar when it is turned back on', () => {
    // Hand-written YAML that says it on the second block only, which both panels show.
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      { entity: ANNA, show_in_legend: false },
    ];

    const next = Entities.writeEntity(entities, 0, {
      ...Entities.toEntityFormData(entities[0], entities),
      show_in_legend: true,
    });

    // A block left holding only its id goes back to a bare id, as the form writes one.
    expect(next).toEqual([{ entity: ANNA, event_type: 'timed' }, ANNA]);
  });

  it('leaves each block as written on an edit to anything else', () => {
    // The second block shows Anna left out without saying so, and the third says `true` in so
    // many words. An edit to the time writes neither, and drops neither.
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, show_in_legend: false },
      { entity: ANNA, event_type: 'all_day' },
      { entity: BEN, show_in_legend: true },
    ];

    const second = Entities.writeEntity(entities, 1, {
      ...Entities.toEntityFormData(entities[1], entities),
      show_time: 'hide',
    });
    expect(second).toEqual([
      { entity: ANNA, show_in_legend: false },
      { entity: ANNA, event_type: 'all_day', show_time: false },
      { entity: BEN, show_in_legend: true },
    ]);
    expect(second[0]).toBe(entities[0]);

    const third = Entities.writeEntity(entities, 2, {
      ...Entities.toEntityFormData(entities[2], entities),
      show_time: 'hide',
    });
    expect(third[2]).toEqual({ entity: BEN, show_in_legend: true, show_time: false });
  });

  it('moves it to the block left when Remove takes the only block holding it', () => {
    expect(
      Entities.removeEntity(
        [
          { entity: ANNA, event_type: 'timed' },
          { entity: ANNA, event_type: 'all_day', show_in_legend: false },
          BEN,
        ],
        1,
      ),
    ).toEqual([{ entity: ANNA, show_in_legend: false, event_type: 'timed' }, BEN]);

    // The control: removing a block whose value another block also holds changes nothing else.
    expect(
      Entities.removeEntity(
        [
          { entity: ANNA, show_in_legend: false },
          { entity: ANNA, show_in_legend: false, event_type: 'all_day' },
        ],
        0,
      ),
    ).toEqual([{ entity: ANNA, show_in_legend: false, event_type: 'all_day' }]);
  });
});

describe('copying and pasting the filter switch', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
  });

  it('copies it with the rest of the settings, and pastes it onto another calendar', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna', show_in_legend: false, accent_color: '#e53935' },
      BEN,
    ];
    expect(Entities.hasTransferableSettings({ entity: ANNA, show_in_legend: false })).toBe(true);

    Entities.copySettings(entities[0]);

    expect(Entities.pasteSettings(entities, 1)).toEqual([
      entities[0],
      { show_in_legend: false, accent_color: '#e53935', entity: BEN },
    ]);
  });
});

describe('the filter switch in the rendered editor', () => {
  interface EditorHost extends HTMLElement {
    hass: unknown;
    setConfig(config: unknown): void;
    updateComplete: Promise<unknown>;
  }

  interface Form extends HTMLElement {
    data: Record<string, unknown>;
    schema: HaFormSchema[];
  }

  /**
   * Builds a rendered editor over the given calendars and toolbar.
   *
   * @param entities - Calendars as they would be stored in the card config
   * @param toolbar - The card's toolbar block
   * @returns The editor and every configuration it reports
   */
  async function render(entities: ReadonlyArray<unknown>, toolbar?: Types.ToolbarConfig) {
    const element = document.createElement('editor-show-in-legend-probe') as EditorHost;
    element.hass = { states: {}, locale: { language: 'en' } };
    document.body.appendChild(element);
    element.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities,
      ...(toolbar ? { toolbar } : {}),
    });
    await element.updateComplete;

    const emitted: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
    });

    const forms = () =>
      Array.from(element.shadowRoot!.querySelectorAll<Form>('ha-form.entity-form'));
    return {
      element,
      emitted,
      forms,
      offers: () => forms().map((form) => fieldNames(form.schema).includes('show_in_legend')),
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is offered while the toolbar shows a filter, in either form, and not otherwise', async () => {
    const offered: Record<string, boolean[]> = {};
    const cases: Array<[string, Types.ToolbarConfig | undefined]> = [
      ['no toolbar', undefined],
      ['toolbar hidden', { show: false, legend: 'chips' }],
      ['legend off', { show: true, legend: false }],
      ['menu', { show: true }],
      ['chips', { show: true, legend: 'chips' }],
    ];
    for (const [name, toolbar] of cases) {
      document.body.innerHTML = '';
      offered[name] = (await render([ANNA], toolbar)).offers();
    }

    expect(offered).toEqual({
      'no toolbar': [false],
      'toolbar hidden': [false],
      'legend off': [false],
      menu: [true],
      chips: [true],
    });
  });

  it('shows the second block the calendar left out, and writes the switch to both', async () => {
    const editor = await render(
      [{ entity: ANNA, show_in_legend: false }, { entity: ANNA, event_type: 'all_day' }, BEN],
      { show: true, legend: 'chips' },
    );
    const second = editor.forms()[1];
    expect(editor.forms().map((form) => form.data.show_in_legend)).toEqual([false, false, true]);

    second.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...second.data, show_in_legend: true } },
      }),
    );
    await editor.element.updateComplete;

    expect(editor.emitted).toHaveLength(1);
    expect(editor.emitted[0].entities).toEqual([
      ANNA,
      { entity: ANNA, event_type: 'all_day' },
      BEN,
    ]);
  });
});
