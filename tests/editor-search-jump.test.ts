/**
 * The jump list (backlog item 307, section 5.8's first stage).
 *
 * Typing a query replaces the overview below the search field with rows: each names the setting,
 * with the query marked, says where it is, what it holds and what its YAML path is. Choosing one
 * opens the field where it is drawn, highlighted, focused on its wrapper and announced, with Return
 * to Results above it; Return, Back and Escape bring the results back with the query, the scroll
 * position and the row that was chosen.
 *
 * What the query matches is pinned by the search tests that predate the jump list, which now read
 * their fields off these rows (`editor-panel-search`, `editor-search-aliases` and the rest); this
 * file pins the rows and the jump.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type MountedEditor,
  changeField,
  chooseResult,
  entry,
  fakeHass,
  mountEditor,
  resultRows,
  searchFor,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

const STATES = {
  'calendar.anna': {
    entity_id: 'calendar.anna',
    state: 'off',
    attributes: { friendly_name: 'Anna' },
  },
  'calendar.ben': { entity_id: 'calendar.ben', state: 'off', attributes: { friendly_name: 'Ben' } },
};

const CARD = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna', { entity: 'calendar.ben', blocklist: 'Dentist' }],
  toolbar: { show: true, buttons: [{ name: 'Lights', icon: 'mdi:lightbulb' }] },
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

async function mount(): Promise<MountedEditor> {
  return mountEditor(CARD, { hass: fakeHass({ states: STATES }) });
}

function $(editor: MountedEditor, selector: string): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(selector);
}

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** The row a field's result is drawn as, by its id and, for an entry or a button, its place. */
function row(editor: MountedEditor, id: string, owner?: number) {
  const found = resultRows(editor).find(
    (each) =>
      each.id === id &&
      (owner === undefined ||
        each.ownerKey === (editor as unknown as { _entryKeys: number[] })._entryKeys[owner]),
  );
  if (!found) throw new Error(`No result row for ${id}`);
  return found;
}

/** The live region's words. */
function spoken(editor: MountedEditor): string {
  return text($(editor, '.live-region'));
}

describe('the results', () => {
  it('replace the overview below the search field, counted and announced', async () => {
    const editor = await mount();
    await searchFor(editor, 'time');
    await editor.updateComplete;

    const rows = resultRows(editor);
    expect(rows.length).toBeGreaterThan(10);
    expect($(editor, '[data-focus^="nav:"]')).toBeNull();
    expect($(editor, 'ha-form.filter-form')).not.toBeNull();
    const status = `Results for “time”: ${rows.length}`;
    expect(text($(editor, '.result-status'))).toBe(`${status} · Values for List`);
    expect(spoken(editor)).toBe(status);
  });

  it('name no layout in Shared, whose values are every layout’s', async () => {
    const editor = await mount();
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await searchFor(editor, 'time');
    expect(text($(editor, '.result-status'))).toBe(
      `Results for “time”: ${resultRows(editor).length}`,
    );
  });

  it('give every row a breadcrumb, a value and a YAML path', async () => {
    const editor = await mount();
    let checked = 0;
    for (const query of ['time', 'color', 'lights', 'exclude', 'ben']) {
      await searchFor(editor, query);
      for (const each of resultRows(editor)) {
        checked++;
        expect(each.crumbs, `${query}: ${each.key}`).not.toBe('');
        expect(each.meta, `${query}: ${each.key}`).toMatch(/(^|. · )YAML: [\w.[\]]+$/);
        expect(each.meta.startsWith('Not Set') && each.id === 'calendars:calendars').toBe(false);
      }
    }
    // The denominator: card, calendar and button rows were all read.
    expect(checked).toBeGreaterThan(60);
  });

  it.each([
    [
      'day_spacing',
      'layout:day_spacing',
      'Size & Spacing › Between Days',
      '10px · YAML: list.day_spacing',
    ],
    [
      'show_location',
      'events:show_location',
      'Events › Event Details',
      'On · YAML: list.show_location',
    ],
    [
      '12h',
      'content:time_format',
      'Events › Event Details',
      'Follow Home Assistant · YAML: time_24h',
    ],
    ['days', 'content:days_to_show', 'Overview', '3 · YAML: list.days_to_show'],
    [
      'lights',
      'button:name',
      'Card & Header › Your Own Buttons › Lights',
      'Lights · YAML: toolbar.buttons[0].name',
    ],
    [
      'lights',
      'button:icon',
      'Card & Header › Your Own Buttons › Lights',
      'mdi:lightbulb · YAML: toolbar.buttons[0].icon',
    ],
  ])('for "%s" show %s where it is, with its value', async (query, id, crumbs, meta) => {
    const editor = await mount();
    await searchFor(editor, query);
    expect(row(editor, id)).toMatchObject({ crumbs, meta });
  });

  it('name what a field holds, and the key a calendar’s label is stored under', async () => {
    const editor = await mountEditor(
      {
        ...CARD,
        entities: [
          { entity: 'calendar.anna', label: 'Kids' },
          { entity: 'calendar.ben', visibility: [{ condition: 'user', users: ['u1'] }] },
        ],
      },
      { hass: fakeHass({ states: STATES }) },
    );
    await searchFor(editor, 'kids');
    expect(row(editor, 'calendar:label', 0).meta).toBe('Kids · YAML: entities[0].label');
    expect(row(editor, 'calendar:label_type', 0).meta).toBe(
      'Text or Emoji · YAML: entities[0].label_type',
    );
    // Conditions have no words here, so the row says nothing of them, rather than Not Set.
    await searchFor(editor, 'who sees');
    expect(row(editor, 'calendar:visibility', 1).meta).toBe('YAML: entities[1].visibility');
    expect(row(editor, 'calendar:visibility', 0).meta).toBe(
      'Not Set · YAML: entities[0].visibility',
    );
  });

  it('give each calendar its own rows, under its name, with its own value', async () => {
    const editor = await mount();
    await searchFor(editor, 'exclude');
    expect(resultRows(editor).map(({ crumbs, meta }) => [crumbs, meta])).toEqual([
      ['Anna › Which Events', 'Not Set · YAML: entities[0].blocklist'],
      ['Ben › Which Events', 'Dentist · YAML: entities[1].blocklist'],
    ]);
  });

  it('mark the query in a label', async () => {
    const editor = await mount();
    await searchFor(editor, 'TIME');
    expect(row(editor, 'events:show_time')).toMatchObject({
      label: 'Show Time',
      marked: ['Time'],
    });
  });
});

/**
 * Chooses a result as a user does, from the results for a query.
 *
 * @param editor - Editor
 * @param query - The query
 * @param id - The field
 * @param owner - The entry's place, for a calendar's field
 * @returns The row's key
 */
async function jump(
  editor: MountedEditor,
  query: string,
  id: string,
  owner?: number,
): Promise<string> {
  await searchFor(editor, query);
  const { key } = row(editor, id, owner);
  $(editor, `[data-focus="${key}"]`)!.focus();
  await chooseResult(editor, key);
  await editor.updateComplete;
  return key;
}

describe('choosing a result', () => {
  it('opens its page at the field: focused on its wrapper, highlighted, announced', async () => {
    const editor = await mount();
    await jump(editor, 'time', 'events:time_font_size');

    const field = $(editor, '[data-field="events:time_font_size"]');
    expect($(editor, '.page')?.dataset.page).toBe('events');
    expect(editor.shadowRoot!.activeElement).toBe(field);
    expect(field?.closest('.jump')?.classList.contains('jumped')).toBe(true);
    // Return to Results sits directly above the field, and only there.
    expect(field?.previousElementSibling?.getAttribute('data-focus')).toBe('return');
    expect(editor.shadowRoot!.querySelectorAll('[data-focus="return"]')).toHaveLength(1);
    expect(spoken(editor)).toBe('Showing Time Font Size.');
  });

  it('lets the highlight go after 2 s and keeps Return to Results', async () => {
    const editor = await mount();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    await jump(editor, 'time', 'events:time_font_size');
    vi.advanceTimersByTime(1900);
    await editor.updateComplete;
    expect($(editor, '.jump.jumped')).not.toBeNull();

    vi.advanceTimersByTime(200);
    await editor.updateComplete;
    expect($(editor, '.jumped')).toBeNull();
    expect($(editor, '.jump [data-focus="return"]')).not.toBeNull();
  });

  it('opens a calendar’s field on the entry’s own page', async () => {
    const editor = await mount();
    await jump(editor, 'exclude', 'calendar:blocklist', 1);

    const keys = (editor as unknown as { _entryKeys: number[] })._entryKeys;
    const page = $(editor, '.entry-page')!;
    const wrapper = page.querySelector<HTMLElement>('.jump [data-field="calendar:blocklist"]');
    expect(page.dataset.page).toBe(`entry:${keys[1]}`);
    expect(wrapper?.getAttribute('aria-label')).toBe('Blocklist');
    expect(editor.shadowRoot!.activeElement).toBe(wrapper);
    // The field once, where the page draws it, with the page's other fields around it.
    expect(page.querySelectorAll('[data-field="calendar:blocklist"]')).toHaveLength(1);
    expect(page.querySelectorAll('.jump')).toHaveLength(1);
    expect(page.querySelectorAll('ha-form.entity-form').length).toBeGreaterThan(1);
    expect(spoken(editor)).toBe('Showing Blocklist.');
  });

  it('opens a toolbar button’s field on its panel, on Card & Header', async () => {
    const editor = await mount();
    await jump(editor, 'lights', 'button:entity');

    const panel = $(editor, '.button-panel') as HTMLElement & { expanded: boolean };
    const wrapper = panel.querySelector('.jump [role="group"]');
    expect($(editor, '.page')?.dataset.page).toBe('card_header');
    expect(panel.expanded).toBe(true);
    expect(editor.shadowRoot!.activeElement).toBe(wrapper);
    expect(
      JSON.stringify((wrapper!.querySelector('ha-form') as unknown as { schema: unknown }).schema),
    ).toMatch(/^\[\{"name":"entity"/);
  });

  it('opens a field of the overview’s own on the overview', async () => {
    const editor = await mount();
    await jump(editor, 'days', 'content:days_to_show');

    expect($(editor, '[data-focus^="nav:"]')).not.toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '[data-field="content:days_to_show"]'));
    expect($(editor, '.jump [data-focus="return"]')).not.toBeNull();
  });
});

describe('Return to Results', () => {
  /** The editor's scroll position: the document's, in the test environment. */
  const scroller = (): Element => document.scrollingElement!;

  it.each([
    ['Return to Results', 'events:time_font_size', undefined],
    ['Back', 'events:time_font_size', undefined],
    ['Escape', 'events:time_font_size', undefined],
    ['Return to Results', 'calendar:blocklist', 1],
    ['Escape', 'calendar:blocklist', 1],
    ['Return to Results', 'content:days_to_show', undefined],
  ] as const)(
    '(%s, from %s) restores the query, the scroll position and the row chosen',
    async (how, id, owner) => {
      const editor = await mount();
      const query =
        id === 'calendar:blocklist' ? 'exclude' : id === 'content:days_to_show' ? 'days' : 'time';
      await searchFor(editor, query);
      scroller().scrollTop = 240;
      const key = await jump(editor, query, id, owner);
      scroller().scrollTop = 0;

      if (how === 'Escape') {
        editor.shadowRoot!.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
        );
      } else {
        $(editor, how === 'Back' ? '[data-focus="back-top"]' : '[data-focus="return"]')!.click();
      }
      await editor.updateComplete;
      await editor.updateComplete;

      expect(valueOf(editor, 'filter:search')).toBe(query);
      expect(resultRows(editor).some((each) => each.key === key)).toBe(true);
      expect(editor.shadowRoot!.activeElement).toBe($(editor, `[data-focus="${key}"]`));
      expect(scroller().scrollTop).toBe(240);
      expect($(editor, '[data-focus="return"]')).toBeNull();
    },
  );

  it('moves to the top when another field takes away the one it was above', async () => {
    const editor = await mountEditor(
      { ...CARD, entities: [{ entity: 'calendar.anna', label: 'Kids' }] },
      { hass: fakeHass({ states: STATES }) },
    );
    await jump(editor, 'kids', 'calendar:label', 0);
    expect($(editor, '.jump')).not.toBeNull();
    // A label type of None leaves the calendar no Label.
    await changeField(editor, 'calendar:label_type', 'none', entry(0));
    expect($(editor, '.jump')).toBeNull();
    expect($(editor, '.entry-page > [data-focus="return"]')).not.toBeNull();
  });

  it('goes, with the field it showed, once the query is typed again', async () => {
    const editor = await mount();
    await jump(editor, 'exclude', 'calendar:blocklist', 0);
    await searchFor(editor, 'excl');
    expect($(editor, '[data-focus="return"]')).toBeNull();
    expect(resultRows(editor).length).toBe(2);
  });
});
