/**
 * The per-calendar Name field in the visual editor.
 *
 * Four things are pinned here, and each fails in a way the others cannot see.
 *
 * **Where the field sits and what it says.** It opens the per-calendar panel, under a heading
 * renamed to say so in every language that translates it; a translation left behind would go
 * on calling the section a label's, which no gate other than these pins would notice.
 *
 * **That the name belongs to the calendar.** A calendar listed twice — the pattern
 * `event_type` needs, and what Duplicate creates — has one name. So each block's form shows
 * the calendar's name, a change on any block is written to all of them, and an edit to
 * anything else leaves each block's own name exactly as written. The last of those is the
 * one a simpler design gets wrong silently: writing the shown name back on every edit would
 * put `name` into the YAML of a block nobody named.
 *
 * **That the name is identity.** Copy leaves it behind, Paste keeps the target's, and a
 * calendar carrying only its name offers nothing to copy. Without that, an empty copy would
 * arm every Paste button with a paste that clears the calendar it lands on.
 *
 * **What it does not change.** The panel heading stays Home Assistant's name, matching the
 * calendar picker above it, which the card cannot rename.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';
import { type FilterCtx, NO_FILTER, filterEntitySchema } from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

customElements.define('editor-calendar-name-probe', CalendarCardProEditor);

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** The per-calendar schema as declared. */
function entitySchema(): HaFormSchema[] {
  return buildEntitySchema({ view: 'list', config: buildConfig(), language: 'en' });
}

/** Headings and fields together, in render order, headings marked. */
function sequence(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .map(({ node }) => ('type' in node && node.type === 'constant' ? `# ${node.name}` : node.name));
}

/** The settings a filtered schema renders, headings excluded. */
function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return sequence(schema).filter((name) => !name.startsWith('# '));
}

describe('the Name field', () => {
  it('opens the per-calendar panel, directly under its first heading, as plain text', () => {
    const schema = entitySchema();

    expect(sequence(schema).slice(0, 3)).toEqual([
      '# heading_appearance',
      'name',
      'show_in_legend',
    ]);
    expect(schema[1]).toEqual({ name: 'name', selector: { text: { type: 'text' } } });
  });

  it.each(['none', 'text', 'icon', 'image'])(
    'stays first whatever shape the label holds (%s)',
    (type) => {
      expect(sequence(entitySchemaFor(entitySchema(), type)).slice(0, 2)).toEqual([
        '# heading_appearance',
        'name',
      ]);
    },
  );

  it('is labeled and explained, under a heading that names it', () => {
    expect({
      label: lookup('en', 'entity.name'),
      heading: EDITOR_STRINGS.heading_appearance,
      helper: EDITOR_STRINGS['entity.name.helper'],
    }).toEqual({
      label: 'Name',
      heading: 'Name, Label & Colors',
      helper:
        'Names this calendar in the calendar filter, when you open one of its events, and in ' +
        'notices. Every entry for this calendar shares it. Left empty, the card uses Home ' +
        'Assistant\u2019s name for it, which the calendar picker and this panel\u2019s heading ' +
        'keep either way.',
    });
  });

  it('names the heading as a name, a label and colors in every translated editor', () => {
    // Pinned by value for every language with an editor file, so a translation left on the
    // old heading — which would go on calling the section a label's — fails here.
    const translated = Object.fromEntries(
      Object.entries(EDITOR_LANGUAGE_STRINGS).map(([language, strings]) => [
        language,
        [strings.heading_appearance, strings['entity.name']],
      ]),
    );

    expect(translated).toEqual({
      de: ['Name, Label & Farben', 'Name'],
      'en-gb': ['Name, Label & Colours', undefined],
      et: ['Nimi, silt ja värvid', 'Nimi'],
      it: ['Nome, etichetta e colori', 'Nome'],
      ko: ['이름, 라벨 및 색상', '이름'],
      lt: ['Pavadinimas, etiketė ir spalvos', 'Kalendoriaus pavadinimas'],
      lv: ['Nosaukums, etiķete un krāsas', 'Nosaukums'],
      nb: ['Navn, etikett og farger', 'Navn'],
      pl: ['Nazwa, etykieta i kolory', 'Nazwa'],
      sk: ['Názov, štítok a farby', 'Názov kalendára'],
      sv: ['Namn, etikett och färger', 'Namn'],
    });
  });
});

describe('writing a calendar name', () => {
  it('trims it, writes it beside the id it names, and drops a blank one', () => {
    const named = Entities.fromEntityFormData(ANNA, {
      ...Entities.toEntityFormData({ entity: ANNA, label: 'A' }),
      name: '  Anna at work  ',
    });

    expect(named).toEqual({ entity: ANNA, name: 'Anna at work', label: 'A' });
    expect(Object.keys(named)).toEqual(['entity', 'name', 'label']);
    expect(Entities.fromEntityFormData(ANNA, { name: '   ' })).toBe(ANNA);
    expect(Entities.fromEntityFormData(ANNA, { name: '' })).toBe(ANNA);
    expect(Entities.fromEntityFormData(ANNA, { name: undefined })).toBe(ANNA);
  });

  it("shows each block the calendar's name, even where another block holds it", () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      BEN,
      { entity: ANNA, event_type: 'all_day', name: 'Anna at work' },
    ];

    expect(entities.map((entry) => Entities.toEntityFormData(entry, entities).name)).toEqual([
      'Anna at work',
      undefined,
      'Anna at work',
    ]);
    // Without the list, a block can only show its own.
    expect(Entities.toEntityFormData(entities[0]).name).toBeUndefined();
  });

  it('writes a changed name to every block of the calendar, and to no other', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      { entity: BEN, label: 'B' },
      { entity: ANNA, event_type: 'all_day' },
    ];

    const next = Entities.writeEntity(entities, 2, {
      ...Entities.toEntityFormData(entities[2], entities),
      name: ' Anna at work ',
    });

    expect(next).toEqual([
      { entity: ANNA, name: 'Anna at work', event_type: 'timed' },
      { entity: BEN, label: 'B' },
      { entity: ANNA, name: 'Anna at work', event_type: 'all_day' },
    ]);
    expect(Object.keys(next[0] as object)).toEqual(['entity', 'name', 'event_type']);
    expect(next[1]).toBe(entities[1]);
  });

  it('clears the name from every block of the calendar when it is emptied', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, name: 'Anna at work', event_type: 'all_day' },
    ];

    const next = Entities.writeEntity(entities, 1, {
      ...Entities.toEntityFormData(entities[1], entities),
      name: undefined,
    });

    // A block left holding only its id goes back to a bare id, as the form writes one.
    expect(next).toEqual([ANNA, { entity: ANNA, event_type: 'all_day' }]);
  });

  it('leaves the name each block holds as written on an edit to anything else', () => {
    // The second block shows Anna's name without holding it. Writing that back would put a
    // key into YAML the user never wrote; the edit was to the time, not to the name.
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, event_type: 'all_day' },
    ];

    const next = Entities.writeEntity(entities, 1, {
      ...Entities.toEntityFormData(entities[1], entities),
      show_time: 'hide',
    });

    expect(next).toEqual([
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, event_type: 'all_day', show_time: false },
    ]);
    expect(next[0]).toBe(entities[0]);
  });

  it('settles a calendar named two ways only when the name itself is changed', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, name: '  Anna at home', event_type: 'all_day' },
    ];

    // An unrelated edit keeps the hand-written second name, spaces and all.
    const untouched = Entities.writeEntity(entities, 1, {
      ...Entities.toEntityFormData(entities[1], entities),
      show_time: 'hide',
    });
    expect(untouched[1]).toEqual({
      entity: ANNA,
      name: '  Anna at home',
      event_type: 'all_day',
      show_time: false,
    });

    // A change to the name is the user's answer, and settles both.
    const renamed = Entities.writeEntity(entities, 1, {
      ...Entities.toEntityFormData(entities[1], entities),
      name: 'Anna',
    });
    expect(renamed).toEqual([
      { entity: ANNA, name: 'Anna' },
      { entity: ANNA, name: 'Anna', event_type: 'all_day' },
    ]);
  });

  it('keeps the name on both blocks when a calendar is duplicated', () => {
    expect(Entities.duplicateEntity([{ entity: ANNA, name: 'Anna at work' }], 0)).toEqual([
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, name: 'Anna at work' },
    ]);
  });

  it('moves the name to the block left when Remove takes the only block holding it', () => {
    // Hand-written YAML naming the calendar on its second block only: both panels show the
    // name, so removing that block must not quietly give the calendar Home Assistant's back.
    expect(
      Entities.removeEntity(
        [
          { entity: ANNA, event_type: 'timed' },
          { entity: ANNA, event_type: 'all_day', name: 'Anna at work' },
          'calendar.ben',
        ],
        1,
      ),
    ).toEqual([{ entity: ANNA, name: 'Anna at work', event_type: 'timed' }, 'calendar.ben']);

    // The control: removing the calendar's last block leaves no block to carry a name, and
    // removing a block whose name another block also holds changes nothing else.
    expect(
      Entities.removeEntity([{ entity: ANNA, name: 'Anna at work' }, 'calendar.ben'], 0),
    ).toEqual(['calendar.ben']);
    expect(
      Entities.removeEntity(
        [
          { entity: ANNA, name: 'Anna at work', event_type: 'timed' },
          { entity: ANNA, name: 'Anna at work', event_type: 'all_day' },
        ],
        0,
      ),
    ).toEqual([{ entity: ANNA, name: 'Anna at work', event_type: 'all_day' }]);
  });
});

describe('searching the editor for a calendar by its name', () => {
  /**
   * Search one block's settings.
   *
   * @param entities - The list as stored
   * @param index - The block searched
   * @param query - The search text
   * @returns The fields left
   */
  function search(
    entities: Array<string | Types.EntityConfig>,
    index: number,
    query: string,
  ): string[] {
    const config = { ...buildConfig(), entities } as Types.Config;
    const ctx: FilterCtx = {
      language: 'en',
      view: 'list',
      config,
      criteria: { ...NO_FILTER, query },
    };
    return fieldNames(filterEntitySchema(entitySchema(), entities[index], ['entity'], ctx));
  }

  it('finds every block of a calendar by its name, whichever block holds it', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      { entity: ANNA, event_type: 'all_day', name: 'Anna at work' },
      BEN,
    ];
    const everything = fieldNames(entitySchema());

    expect(search(entities, 0, 'at work')).toEqual(everything);
    expect(search(entities, 1, 'at work')).toEqual(everything);
    // The control: another calendar does not match it, so the query is not matching a field.
    expect(search(entities, 2, 'at work')).toEqual([]);
  });
});

describe('copying and pasting a calendar’s settings', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
  });

  it('copies everything but the name', () => {
    Entities.copySettings({ entity: ANNA, name: 'Anna at work', label: 'A', color: '#f00' });

    expect(Entities.copiedSettings()).toEqual({ label: 'A', color: '#f00' });
  });

  it("keeps the target's own name, or its lack of one", () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, name: 'Anna at work', label: 'A' },
      { entity: BEN, name: 'Ben at school', color: '#00f' },
      'calendar.family',
    ];
    Entities.copySettings(entities[0]);

    const pasted = Entities.pasteSettings(Entities.pasteSettings(entities, 1), 2);
    expect(pasted).toEqual([
      entities[0],
      { entity: BEN, name: 'Ben at school', label: 'A' },
      { entity: 'calendar.family', label: 'A' },
    ]);
  });

  it('offers nothing to copy from a calendar holding only its name, and arms no paste', () => {
    expect([
      Entities.hasTransferableSettings({ entity: ANNA, name: 'Anna at work' }),
      Entities.hasTransferableSettings({ entity: ANNA, name: 'Anna at work', label: 'A' }),
      Entities.hasTransferableSettings(ANNA),
    ]).toEqual([false, true, false]);

    Entities.copySettings({ entity: ANNA, name: 'Anna at work' });
    expect(Entities.copiedSettings()).toBeUndefined();

    // Nor does it replace what an earlier copy holds.
    Entities.copySettings({ entity: BEN, label: 'B' });
    Entities.copySettings({ entity: ANNA, name: 'Anna at work' });
    expect(Entities.copiedSettings()).toEqual({ label: 'B' });
  });
});

describe('the Name field in the rendered editor', () => {
  interface EditorHost extends HTMLElement {
    hass: unknown;
    setConfig(config: unknown): void;
    updateComplete: Promise<unknown>;
  }

  interface Form extends HTMLElement {
    data: Record<string, unknown>;
  }

  interface Panel extends HTMLElement {
    header?: string;
  }

  /**
   * Builds a rendered editor over the given calendars, with Home Assistant naming Anna's.
   *
   * @param entities - Calendars as they would be stored in the card config
   * @returns The editor and every configuration it reports
   */
  async function render(entities: ReadonlyArray<unknown>) {
    const element = document.createElement('editor-calendar-name-probe') as EditorHost;
    element.hass = {
      states: {
        [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna calendar' } },
      },
      locale: { language: 'en' },
    };
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
      headers: () =>
        Array.from(root.querySelectorAll<Panel>('ha-expansion-panel.entity-panel')).map(
          (panel) => panel.header,
        ),
      copy: (calendar: number) =>
        Array.from(root.querySelectorAll('.entity-actions')[calendar].querySelectorAll('button'))
          .filter((button) => button.textContent?.trim() === 'Copy Settings')
          .map((button) => (button.hasAttribute('disabled') ? 'off' : 'on'))[0],
    };
  }

  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it("keeps Home Assistant's name in the panel heading, matching the picker above it", async () => {
    const editor = await render([{ entity: ANNA, name: 'Anna at work' }]);

    expect(editor.headers()).toEqual(['Anna calendar']);
    expect(editor.forms()[0].data.name).toBe('Anna at work');
  });

  it('offers Copy only for a calendar carrying more than its name', async () => {
    const editor = await render([
      { entity: ANNA, name: 'Anna at work' },
      { entity: BEN, name: 'Ben at school', label: 'B' },
    ]);

    expect([editor.copy(0), editor.copy(1)]).toEqual(['off', 'on']);
  });

  it('shows the second block the name and writes a rename to both', async () => {
    const editor = await render([
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, event_type: 'all_day' },
    ]);
    const second = editor.forms()[1];
    expect(second.data.name).toBe('Anna at work');

    second.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...second.data, name: 'Anna at home' } },
      }),
    );
    await editor.element.updateComplete;

    expect(editor.emitted).toHaveLength(1);
    expect(editor.emitted[0].entities).toEqual([
      { entity: ANNA, name: 'Anna at home' },
      { entity: ANNA, name: 'Anna at home', event_type: 'all_day' },
    ]);
  });
});
