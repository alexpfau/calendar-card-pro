/**
 * The jump list (backlog item 307, its first stage).
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
  goOverview,
  goPage,
  mountEditor,
  openResultGroup,
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

async function mount(yaml = false): Promise<MountedEditor> {
  return mountEditor(CARD, { hass: fakeHass({ states: STATES }), yaml });
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
    // No line names a scope: a row names its layout where layouts differ.
    expect(text($(editor, '.result-status'))).toBe(status);
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

  it('clear with the field’s ✕, shown only while it holds a query, back to where Escape goes', async () => {
    const editor = await mount();
    const clear = () => $(editor, '.search-row [data-focus="search-clear"]') as HTMLButtonElement;
    expect(clear()).toBeNull();
    await goPage(editor, 'events');
    await (async () => {
      $(editor, '[data-focus="search-open"]')!.click();
      await editor.updateComplete;
    })();
    await searchFor(editor, 'time');
    expect(clear()?.getAttribute('aria-label')).toBe('Clear Search');
    // Its own control beside Home Assistant's box, not inside it.
    expect(clear()?.closest('ha-form')).toBeNull();
    clear()!.click();
    await editor.updateComplete;
    expect(valueOf(editor, 'filter:search')).toBe('');
    expect(resultRows(editor)).toEqual([]);
    expect(clear()).toBeNull();
    // As Escape in the field leaves it: the overview, with Back to the page the search came from.
    expect($(editor, '[data-focus="search-back"]')).not.toBeNull();
  });

  it('name a value’s layout only where layouts differ, the scope its page opens in', async () => {
    const editor = await mountEditor(
      { ...CARD, column: { event_font_size: '13px' } },
      { hass: fakeHass({ states: STATES }) },
    );
    await searchFor(editor, 'event font size');
    expect(row(editor, 'events:event_font_size').meta).toMatch(/^List: /);
    // The same everywhere: no layout.
    await searchFor(editor, 'days to show');
    expect(row(editor, 'content:days_to_show').meta).toBe('3');
    // Chosen on a page, the scope is what the next result names and opens in.
    await changeField(editor, 'filter:search', '');
    await goPage(editor, 'events');
    await changeField(editor, 'workspace:editing_workspace', 'column');
    await goOverview(editor);
    await searchFor(editor, 'event font size');
    expect(row(editor, 'events:event_font_size').meta).toMatch(/^Columns: 13px/);
  });

  it('give every row a breadcrumb, a value and, with Show YAML Option Names on, a YAML path', async () => {
    const editor = await mount(true);
    let checked = 0;
    for (const query of ['time', 'color', 'lights', 'exclude', 'ben']) {
      await searchFor(editor, query);
      // A page's row, a row folding one field of several calendars, Split This Calendar and the
      // calendar list are not one setting.
      for (const each of resultRows(editor)) {
        if (/^(page|overview):|^calendar:split$/.test(each.id) || each.expanded !== undefined) {
          continue;
        }
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
      'List: 10px · YAML: list.day_spacing',
    ],
    [
      'show_location',
      'events:show_location',
      'Event Appearance › Event Details',
      'List: On · YAML: list.show_location',
    ],
    [
      '12h',
      'content:time_format',
      'Event Appearance › Event Details',
      'Follow Home Assistant · Whole Card · YAML: time_24h',
    ],
    ['days', 'content:days_to_show', 'Which Events › Date Range', '3 · YAML: list.days_to_show'],
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
    const editor = await mount(true);
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
      { hass: fakeHass({ states: STATES }), yaml: true },
    );
    await searchFor(editor, 'kids');
    await openResultGroup(editor, 'calendar:label');
    expect(row(editor, 'calendar:label', 0).meta).toBe('Kids · Set · YAML: entities[0].label');
    expect(row(editor, 'calendar:label_type', 0).meta).toBe(
      'Text or Emoji · Set · YAML: entities[0].label_type',
    );
    // Conditions have no words here, so the row says nothing of them, rather than Not Set.
    await searchFor(editor, 'who sees');
    await openResultGroup(editor, 'calendar:visibility');
    expect(row(editor, 'calendar:visibility', 1).meta).toBe('Set · YAML: entities[1].visibility');
    expect(row(editor, 'calendar:visibility', 0).meta).toBe(
      'Not Set · YAML: entities[0].visibility',
    );
  });

  it('give each calendar its own rows, under its name, with its own value', async () => {
    const editor = await mount(true);
    await searchFor(editor, 'exclude');
    // One field of two calendars is one result until it is opened.
    expect(
      resultRows(editor).map(({ crumbs, meta, expanded }) => [crumbs, meta, expanded]),
    ).toEqual([['Calendars › Which Events', 'Set on Calendars: 1', false]]);
    await openResultGroup(editor, 'calendar:blocklist');
    expect(resultRows(editor).map(({ crumbs, meta }) => [crumbs, meta])).toEqual([
      ['Calendars › Which Events', 'Set on Calendars: 1'],
      ['Anna › Which Events', 'Not Set · YAML: entities[0].blocklist'],
      ['Ben › Which Events', 'Dentist · Set · YAML: entities[1].blocklist'],
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
  if (owner !== undefined) await openResultGroup(editor, id);
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
    // It was folded to its head, which the jump opens.
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
    expect(wrapper?.getAttribute('aria-label')).toBe('Hide Events Containing');
    expect(editor.shadowRoot!.activeElement).toBe(wrapper);
    // The field once, where the page draws it, with the page's other fields around it.
    expect(page.querySelectorAll('[data-field="calendar:blocklist"]')).toHaveLength(1);
    expect(page.querySelectorAll('.jump')).toHaveLength(1);
    expect(page.querySelectorAll('ha-form.entity-form').length).toBeGreaterThan(1);
    expect(spoken(editor)).toBe('Showing Hide Events Containing.');
  });

  it('opens a toolbar button’s field in its row, on Card & Header', async () => {
    const editor = await mount();
    await jump(editor, 'lights', 'button:entity');

    const row = $(editor, '.button-row')!;
    const wrapper = row.querySelector('.jump [role="group"]');
    expect($(editor, '.page')?.dataset.page).toBe('card_header');
    expect(row.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    expect(editor.shadowRoot!.activeElement).toBe(wrapper);
    expect(
      JSON.stringify((wrapper!.querySelector('ha-form') as unknown as { schema: unknown }).schema),
    ).toMatch(/^\[\{"name":"entity"/);
  });

  it('opens Days To Show on Which Events, under Date Range', async () => {
    const editor = await mount();
    await jump(editor, 'days', 'content:days_to_show');

    expect($(editor, '.page')?.dataset.page).toBe('which_events');
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
    // Typed again, the calendars' rows fold back into one.
    expect(resultRows(editor).map(({ id, expanded }) => [id, expanded])).toEqual([
      ['calendar:blocklist', false],
    ]);
  });
});

describe('Search Settings in a page header', () => {
  /** Waits out the frames the editor looks for the search box in. */
  async function frames(editor: MountedEditor, count = 3): Promise<void> {
    for (let at = 0; at < count; at++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await editor.updateComplete;
    }
  }

  /** Presses a page header's 🔍, Home Assistant drawing the search box a frame later. */
  async function searchFromHeader(editor: MountedEditor): Promise<HTMLInputElement> {
    $(editor, '.page-head [data-focus="search-open"]')!.click();
    await editor.updateComplete;
    // Home Assistant draws its box inside the form late; the editor waits for it.
    const box = document.createElement('input');
    $(editor, 'ha-form.filter-form')!.appendChild(box);
    await frames(editor);
    return box;
  }

  it('comes first among the header’s actions, on a section page, a calendar’s and the audit', async () => {
    const editor = await mount();
    const actions = (): string[] =>
      [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.page-head button')]
        .map((button) => button.dataset.focus ?? '')
        .filter((key) => key !== 'back-top');
    for (const open of [
      '[data-focus="nav:card_header"]',
      '[data-focus^="row:"]',
      '[data-focus="more:audit"]',
    ]) {
      $(editor, '[data-focus="search-back"]')?.click();
      if ($(editor, '.page-head')) $(editor, '[data-focus="back-top"]')!.click();
      await editor.updateComplete;
      $(editor, open)!.click();
      await editor.updateComplete;
      expect(actions()[0], open).toBe('search-open');
      expect(actions().slice(1, 3), open).toEqual(['undo', 'redo']);
      const button = $(editor, '.page-head [data-focus="search-open"]')!;
      expect(button.getAttribute('aria-label')).toBe('Search Settings');
    }
  });

  it('opens the overview with focus in the search field; Back returns to the page and to it', async () => {
    const editor = await mount();
    $(editor, '[data-focus="nav:card_header"]')!.click();
    await editor.updateComplete;
    const box = await searchFromHeader(editor);

    expect($(editor, '.overview')).not.toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe(box);
    const back = $(editor, '[data-focus="search-back"]')!;
    expect(text(back)).toBe('Back to Card & Header');

    // A query and its results keep the way back; choosing a result and returning keeps it too.
    await searchFor(editor, 'show time');
    await chooseResult(editor, 'result:events:show_time');
    $(editor, '[data-focus="return"]')!.click();
    await editor.updateComplete;
    expect(resultRows(editor).length).toBeGreaterThan(0);
    await searchFor(editor, '');
    $(editor, '[data-focus="search-back"]')!.click();
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '.page')!.dataset.page).toBe('card_header');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe('search-open');
  });

  it('returns by Escape in an empty field; with a query, Escape clears it first', async () => {
    const editor = await mount();
    const [key] = (editor as unknown as { _entryKeys: number[] })._entryKeys;
    $(editor, `[data-focus="row:${key}"]`)!.click();
    await editor.updateComplete;
    const box = await searchFromHeader(editor);
    await searchFor(editor, 'color');
    const escape = async (): Promise<void> => {
      box.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
      await editor.updateComplete;
      await editor.updateComplete;
    };
    await escape();
    expect($(editor, '.overview')).not.toBeNull();
    expect(resultRows(editor)).toEqual([]);
    await escape();
    expect($(editor, '.entry-page')).not.toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe('search-open');
    // Back home by the page's own Back, the overview has no way back to it any more.
    $(editor, '[data-focus="back-top"]')!.click();
    await editor.updateComplete;
    expect($(editor, '[data-focus="search-back"]')).toBeNull();
  });

  it('is forgotten once the overview opens another page by its own rows', async () => {
    const editor = await mount();
    $(editor, '[data-focus="nav:card_header"]')!.click();
    await editor.updateComplete;
    await searchFromHeader(editor);
    $(editor, '[data-focus="nav:taps_refresh"]')!.click();
    await editor.updateComplete;
    $(editor, '[data-focus="back-top"]')!.click();
    await editor.updateComplete;
    expect($(editor, '.overview')).not.toBeNull();
    expect($(editor, '[data-focus="search-back"]')).toBeNull();
  });
});
