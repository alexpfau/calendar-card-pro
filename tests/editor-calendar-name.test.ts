/**
 * The per-calendar Name field in the visual editor.
 *
 * Four things are pinned here, and each fails in a way the others cannot see.
 *
 * **Where the field sits and what it says.** It opens a calendar's fields, first under the entry
 * page's first heading, which names it.
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
 * **What it heads.** The calendar's row on the overview and its entry page are headed by the
 * name, and by Home Assistant's name where the calendar has none of its own.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import {
  changeField,
  entry,
  fakeHass,
  goEntry,
  goOverview,
  keysOf,
  mountEditor,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import { searchIndex } from './helpers/search-index';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Entities from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { ENTRY_GROUPS } from '../src/rendering/editor/pages';
import { walkSchema } from '../src/rendering/editor/panels';
import { keepsControl } from '../src/rendering/editor/plan';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { search as searchRows } from '../src/rendering/editor/search';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';

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

/**
 * Names in the order a search lists a calendar's settings that all match alike: the ones its page
 * draws on every card first (`search.ts` › `matchTier`), each half in page order.
 *
 * @param names - Field names, in page order
 * @returns Them, essential first
 */
function essentialFirst(names: ReadonlyArray<string>): string[] {
  const essential = new Set(
    ENTRY_GROUPS.flatMap((group) => group.fields)
      .filter(([, appearance]) => keepsControl(appearance))
      .map(([id]) => id.split(/[:.]/).pop()!),
  );
  return [
    ...names.filter((name) => essential.has(name)),
    ...names.filter((name) => !essential.has(name)),
  ];
}

describe('the Name field', () => {
  it("follows the accent color under the entry page's first heading, as plain text", () => {
    const schema = entitySchema();

    // Accent Color leads the page: a calendar's color is what most people open it for.
    expect(sequence(schema).slice(0, 4)).toEqual([
      'accent_color_mode',
      'accent_color',
      'name',
      'show_in_legend',
    ]);
    expect(schema.find((node) => node.name === 'name')).toEqual({
      name: 'name',
      selector: { text: { type: 'text' } },
    });
    expect([ENTRY_GROUPS[0].key, ...ENTRY_GROUPS[0].fields.slice(0, 3).map(([id]) => id)]).toEqual([
      'heading.name_and_look',
      'calendar:accent_color_mode',
      'calendar:accent_color',
      'calendar:name',
    ]);
  });

  it.each(['none', 'text', 'icon', 'image'])(
    'comes right after the accent color whatever shape the label holds (%s)',
    (type) => {
      const names = sequence(entitySchemaFor(entitySchema(), type)).filter(
        (name) => name !== 'accent_color',
      );
      expect(names.slice(0, 2)).toEqual(['accent_color_mode', 'name']);
    },
  );

  it('is labeled and explained, under a heading that names it', () => {
    expect({
      label: lookup('en', 'entity.name'),
      heading: EDITOR_STRINGS['heading.name_and_look'],
      helper: EDITOR_STRINGS['entity.name.helper'],
    }).toEqual({
      label: 'Name',
      heading: 'Name & Look',
      helper:
        'Every entry for this calendar shares it. Left empty, the card uses Home ' +
        'Assistant\u2019s name.',
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
    // Hand-written YAML naming the calendar on its second block only: both entry pages show
    // the name, so removing that block must not quietly give the calendar Home Assistant's back.
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
   * Search one block's settings, as the jump list lists them.
   *
   * @param entities - The list as stored
   * @param index - The block searched
   * @param query - The search text
   * @returns The fields listed
   */
  function search(
    entities: Array<string | Types.EntityConfig>,
    index: number,
    query: string,
  ): string[] {
    const config = { ...buildConfig(), entities } as Types.Config;
    const rows = searchIndex(config, {
      workspace: 'list',
      entrySchemas: entities.map(() => entitySchema()),
    });
    // What this layout draws: another layout's setting is listed as that layout's.
    return searchRows(rows, query).flatMap(({ entry: { target, status } }) =>
      target.kind === 'entry-field' && target.key === index && status.kind !== 'other-layout'
        ? [target.id.slice('calendar:'.length)]
        : [],
    );
  }

  it('finds every block of a calendar by its name, whichever block holds it', () => {
    const entities: Array<string | Types.EntityConfig> = [
      { entity: ANNA, event_type: 'timed' },
      { entity: ANNA, event_type: 'all_day', name: 'Anna at work' },
      BEN,
    ];
    // Everything a list card's editor draws, which withholds the time grid's own controls, the
    // lane among them now that List draws lanes too. The
    // accent color is one control with the mode choosing its source, so one row, the mode's.
    const everything = essentialFirst(
      fieldNames(entitySchema()).filter(
        (name) => name !== 'multiday_banners' && name !== 'accent_color',
      ),
    );

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
  /**
   * Builds a rendered editor over the given calendars, with Home Assistant naming Anna's.
   *
   * @param entities - Calendars as they would be stored in the card config
   * @returns The editor and every configuration it reports
   */
  async function render(entities: ReadonlyArray<unknown>) {
    const element = await mountEditor(
      { config_version: Config.CURRENT_CONFIG_VERSION, entities },
      {
        hass: fakeHass({
          states: {
            [ANNA]: {
              entity_id: ANNA,
              state: 'off',
              attributes: { friendly_name: 'Anna calendar' },
            },
          },
        }),
      },
    );
    // Only the open page draws its forms: visit every entry's page, as these tests read them.
    await openPanels(element);

    const emitted: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
    });

    const root = element.shadowRoot!;
    return {
      element,
      emitted,
      /** The row's title on the overview, then the entry page's heading, for one entry. */
      headings: async (calendar: number) => {
        const key = keysOf(element, 'entry')[calendar];
        await goOverview(element);
        const row = root.querySelector(`[data-focus="row:${key}"] .cal-title`)?.textContent;
        await goEntry(element, key);
        const page = root.querySelector('.entry-page h2.page-title')?.textContent;
        await goOverview(element);
        return [row?.trim(), page?.trim()];
      },
      /** Whether the Copy Settings button in one entry's row strip is enabled. */
      copy: async (calendar: number) => {
        const key = keysOf(element, 'entry')[calendar];
        await goOverview(element);
        root.querySelector<HTMLButtonElement>(`[data-focus="more:entry:${key}"]`)!.click();
        await element.updateComplete;
        const copy = root.querySelector(`[data-focus="strip:entry:${key}:copy"]`);
        if (copy === null) throw new Error(`no Copy Settings on calendar ${calendar}`);
        return copy.hasAttribute('disabled') ? 'off' : 'on';
      },
    };
  }

  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it("heads the calendar's row and page with its name, and with Home Assistant's without one", async () => {
    const editor = await render([{ entity: ANNA, name: 'Anna at work' }]);

    expect(await editor.headings(0)).toEqual(['Anna at work', 'Anna at work']);
    expect(valueOf(editor.element, 'calendar:name', entry(0))).toBe('Anna at work');

    // The control: the same calendar with no name of its own is headed by Home Assistant's.
    const unnamed = await render([ANNA]);
    expect(await unnamed.headings(0)).toEqual(['Anna calendar', 'Anna calendar']);
    expect(valueOf(unnamed.element, 'calendar:name', entry(0))).toBeUndefined();
  });

  it('offers Copy only for a calendar carrying more than its name', async () => {
    const editor = await render([
      { entity: ANNA, name: 'Anna at work' },
      { entity: BEN, name: 'Ben at school', label: 'B' },
    ]);

    expect([await editor.copy(0), await editor.copy(1)]).toEqual(['off', 'on']);
  });

  it('shows the second block the name and writes a rename to both', async () => {
    const editor = await render([
      { entity: ANNA, name: 'Anna at work' },
      { entity: ANNA, event_type: 'all_day' },
    ]);
    expect(valueOf(editor.element, 'calendar:name', entry(1))).toBe('Anna at work');

    await changeField(editor.element, 'calendar:name', 'Anna at home', entry(1));

    expect(editor.emitted).toHaveLength(1);
    expect(editor.emitted[0].entities).toEqual([
      { entity: ANNA, name: 'Anna at home' },
      { entity: ANNA, name: 'Anna at home', event_type: 'all_day' },
    ]);
  });
});
