/**
 * The full search (backlog item 307, section 5.8's second stage).
 *
 * The jump list now reaches every setting the editor knows, each saying where it stands: one a
 * page draws, one waiting in an Add row with Add beside it, one a gate withholds ("Needs Show
 * Description"), one stored but not in use ("Not in Use · …"), another layout's ("Only in
 * Grid"), a page by its title, and the two jobs Home Assistant's own tabs do. Both sides of a
 * match are folded; words match in any order; rows rank by tier and by how they matched, a match
 * in a helper alone last with its phrase; one field of several calendars is one row that opens
 * to a row per calendar; Edit Here turns the card settings found into their live controls at
 * any count; and a word an input method is still composing is not searched.
 *
 * The aliases are pinned in `editor-search-aliases.test.ts`, the key they may sit on in
 * `check-i18n-rules.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  type MountedEditor,
  changeField,
  chooseResult,
  emitChange,
  fakeHass,
  formOf,
  helperOf,
  lastConfig,
  mountEditor,
  openResultGroup,
  resultRows,
  searchFor,
} from './helpers/editor-host';
import { searchIndex } from './helpers/search-index';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  type SearchEntry,
  type SearchHit,
  collapse,
  fold,
  highlight,
  search,
} from '../src/rendering/editor/search';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

afterEach(() => document.body.replaceChildren());

const STATES = Object.fromEntries(
  ['Anna', 'Ben', 'Leo', 'Family', 'Work', 'Bin Day'].map((name) => {
    const id = `calendar.${name.toLowerCase().replace(' ', '_')}`;
    return [id, { entity_id: id, state: 'off', attributes: { friendly_name: name } }];
  }),
);

/** The six-calendar wall card the D05 mockups search, in Grid. */
const WALL = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  view: 'grid',
  entities: [
    { entity: 'calendar.anna', color: '#e91e63' },
    { entity: 'calendar.ben', color: '#2196f3' },
    { entity: 'calendar.leo', color: '#4caf50' },
    { entity: 'calendar.family', color: '#ff9800' },
    { entity: 'calendar.work', color: '#9c27b0' },
    { entity: 'calendar.bin_day', color: '#795548' },
  ],
};

/** A list card with two calendars. */
const LIST = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna', 'calendar.ben'],
};

async function mount(config: unknown, language = 'en'): Promise<MountedEditor> {
  return mountEditor(config, { hass: fakeHass({ states: STATES, language }) });
}

function $(editor: MountedEditor, selector: string): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(selector);
}

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function spoken(editor: MountedEditor): string {
  return text($(editor, '.live-region'));
}

function row(editor: MountedEditor, id: string) {
  const found = resultRows(editor).find((each) => each.id === id);
  if (!found) throw new Error(`No result row for ${id}`);
  return found;
}

function openPage(editor: MountedEditor): string | undefined {
  return $(editor, '.page')?.dataset.page;
}

describe('fold', () => {
  it.each([
    ['Straße', 'strasse'],
    ['STRASSE', 'strasse'],
    ['ẞ', 'ss'],
    ['Ørsted', 'orsted'],
    ['Æble', 'aeble'],
    ['Łódź', 'lodz'],
    ['Đakovo', 'dakovo'],
    ['Œuvre', 'oeuvre'],
    ['Crème Brûlée', 'creme brulee'],
    // Already decomposed, as some keyboards type it.
    ['Cre\u0300me', 'creme'],
    ['İstanbul', 'istanbul'],
    ['show_location', 'show location'],
    ['day-spacing', 'day spacing'],
    ['AM/PM', 'am pm'],
    ['  Time  ,  Format  ', 'time format'],
    ['Size & Spacing › Between Days', 'size spacing between days'],
    // Korean is left as it is.
    ['시간 형식', '시간 형식'],
  ])('%s → %s', (input, folded) => {
    expect(fold(input)).toBe(folded);
  });

  /** Every label-like string of a language: what a field, heading or page is named by. */
  const labels = (code: string): string[] =>
    Object.entries(code === 'en' ? EDITOR_STRINGS : EDITOR_LANGUAGE_STRINGS[code])
      .filter(([key]) => !key.endsWith('.helper') && !key.endsWith('.aliases'))
      .map(([, value]) => value);

  it.each(['en', ...Object.keys(EDITOR_LANGUAGE_STRINGS)])(
    'folds every %s label to lowercase words and single spaces, and marks it whole',
    (code) => {
      let changed = 0;
      const all = labels(code);
      for (const label of all) {
        const folded = fold(label);
        expect(fold(folded), label).toBe(folded);
        expect(folded, label).not.toMatch(/\p{Lu}|\p{M}|\p{P}|[ßøæłđœ]|\s\s|^\s|\s$/u);
        if (folded === '') continue;
        if (folded !== label.toLowerCase()) changed++;
        // Searching a label for itself marks its words in the label as written, however folding
        // moved its letters.
        const marks = highlight(label, label);
        expect(marks.length, label).toBeGreaterThan(0);
        for (const [start, end] of marks) {
          expect(folded, label).toContain(fold(label.slice(start, end)));
        }
      }
      // The denominator: every language has labels, and folding changes many of them.
      expect(all.length).toBeGreaterThan(40);
      expect(changed).toBeGreaterThan(5);
    },
  );
});

/** A row of a hand-written index, found by the texts given. */
function entry(
  label: string,
  tier: SearchEntry['tier'],
  texts: ReadonlyArray<readonly [string, SearchEntry['text'][number][1]]> = [],
): SearchEntry {
  return {
    target: { kind: 'page', page: 'weather' },
    label,
    yamlPath: '',
    crumbs: [],
    status: { kind: 'info' },
    tier,
    text: [[fold(label), 'label', label], ...texts.map(([t, s]) => [fold(t), s, t] as const)],
  };
}

describe('ranking', () => {
  // In the index's order, the reverse of how they rank, so the order found is the ranking's;
  // matches that rank alike keep the index's order.
  const INDEX = [
    entry('Time Format', 2),
    entry('Time Format', 1),
    entry('Other', 0, [['Sets the time format for every event.', 'helper']]),
    entry('Mode', 0, [['Time Format', 'heading']]),
    entry('Display', 0, [['time format', 'option']]),
    entry('Hours', 0, [['time format', 'alias']]),
    entry('Clock', 0, [['time_format', 'key']]),
    entry('Format of Time', 0),
    entry('Overtime Format', 0),
    entry('Event Time Format', 0),
    entry('Time Format Locale', 0),
    entry('Time Format', 0),
  ];

  it('puts card settings, then a calendar’s, then Home Assistant’s tabs; within each, a label exactly, from its start, from a word, inside a word, word by word, then key or alias, then option or heading, then help', () => {
    expect(
      search(INDEX, 'time format').map(
        ({ entry: e }) => `${e.tier} ${e.label} ${e.text[1]?.[1] ?? ''}`,
      ),
    ).toEqual([
      '0 Time Format ',
      '0 Time Format Locale ',
      '0 Event Time Format ',
      '0 Overtime Format ',
      '0 Format of Time ',
      '0 Hours alias',
      '0 Clock key',
      '0 Mode heading',
      '0 Display option',
      '0 Other helper',
      '1 Time Format ',
      '2 Time Format ',
    ]);
  });

  it('says what each match was found by, and shows a help-only match’s phrase marked', () => {
    const hits = search(INDEX, 'time format');
    expect(hits.map(({ source }) => source)).toEqual([
      ...Array<string>(5).fill('label'),
      'alias',
      'key',
      'heading',
      'option',
      'helper',
      'label',
      'label',
    ]);
    const { phrase } = hits[9];
    expect(phrase?.text).toBe('Sets the time format for every event.');
    // Each word marked where it is.
    expect(phrase?.marks.map(([start, end]) => phrase.text.slice(start, end))).toEqual([
      'time',
      'format',
    ]);
  });

  it('matches words in any order, and a short one only where a word starts', () => {
    expect(search(INDEX, 'format time').map(({ entry: e }) => e.label)).toContain('Format of Time');
    expect(search([entry('Path', 0)], 'at')).toEqual([]);
    expect(search([entry('At Home', 0)], 'at').length).toBe(1);
  });

  it('falls back to a label’s letters in order when no row holds the words', () => {
    expect(search(INDEX, 'tmfmt').map(({ entry: e }) => e.label)).toContain('Time Format');
    // Not for a word too short to mean anything as letters.
    expect(search([entry('Path', 0)], 'pt')).toEqual([]);
  });

  it('on a card, lists a calendar’s setting before Home Assistant’s tab, and both after the card’s own', () => {
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.anna'],
    } as unknown as Types.Config;
    const tiers = search(searchIndex(config, { workspace: 'list' }), 'card').map(
      ({ entry: e }) => e.tier,
    );
    expect(tiers).toEqual([...tiers].sort());
    expect(new Set(tiers)).toEqual(new Set([0, 1, 2]));
  });
});

describe('what a result says it is', () => {
  it('a setting the page draws: its value and where it comes from, and no tag', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'show time');
    expect(row(editor, 'events:show_time')).toMatchObject({
      meta: 'On · YAML: list.show_time',
      tag: undefined,
    });
    expect($(editor, '[data-focus="add-result:events:show_time"]')).toBeNull();
  });

  it('a setting waiting in an Add row: Add beside it, named for the setting and its place', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'time font size');
    expect(row(editor, 'events:time_font_size').tag).toBeUndefined();
    expect(
      $(editor, '[data-focus="add-result:events:time_font_size"]')?.getAttribute('aria-label'),
    ).toBe('Add Time Font Size, Events, Time');
  });

  it('a setting a gate withholds: what it needs', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'description color');
    expect(row(editor, 'events:description_color').tag).toBe('Needs Show Description');
    expect($(editor, '[data-focus="add-result:events:description_color"]')).toBeNull();
  });

  it('a value stored but not in use: that, and what it needs', async () => {
    const editor = await mount({ ...LIST, description_color: 'red' });
    await searchFor(editor, 'description color');
    expect(row(editor, 'events:description_color').tag).toBe('Not in Use · Needs Show Description');
  });

  it('another layout’s setting: the layouts that offer it', async () => {
    const list = await mount(LIST);
    await searchFor(list, 'hour line');
    expect(row(list, 'separators:time_grid.hour_line_color').tag).toBe('Only in Grid');

    const grid = await mount({ ...LIST, view: 'grid' });
    await searchFor(grid, 'all-day badge');
    expect(row(grid, 'events:allday_badge_position').tag).toBe('Only in List and Columns');
  });

  it('a page, by its title', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'weather');
    expect(resultRows(editor)[0]).toMatchObject({
      id: 'page:weather',
      label: 'Weather',
      crumbs: 'Settings',
    });
  });

  it('a job of Home Assistant’s tabs: where it is, and nothing to open', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'full width');
    expect(row(editor, 'ha:layout')).toMatchObject({
      label: 'Card Width',
      tag: 'In Home Assistant’s Layout Tab, Above This Editor',
    });
    const tab = $(editor, '[data-focus="result:ha:layout"]')!;
    expect(tab.tagName).toBe('DIV');
    expect(tab.closest('button')).toBeNull();

    await searchFor(editor, 'visibility');
    expect(row(editor, 'ha:visibility').tag).toBe(
      'In Home Assistant’s Visibility Tab, Above This Editor',
    );
  });

  it('a color setting, by its British spelling', () => {
    const config = { ...Config.DEFAULT_CONFIG, entities: [] } as unknown as Types.Config;
    const index = searchIndex(config, { workspace: 'list' });
    const byLabel = (query: string) =>
      search(index, query)
        .filter(({ source }) => source === 'label' || source === 'alias')
        .map(({ entry: e }) => e.label);
    const colors = byLabel('color').filter((label) => /color/i.test(label));
    expect(colors.length).toBeGreaterThan(20);
    expect(byLabel('colour')).toEqual(expect.arrayContaining(colors));
  });
});

describe('choosing a result', () => {
  it('waiting in an Add row: Add adds it and opens it, writing nothing', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'time font size');
    $(editor, '[data-focus="add-result:events:time_font_size"]')!.click();
    await editor.updateComplete;
    await editor.updateComplete;

    const field = $(editor, '[data-field="events:time_font_size"]');
    expect(openPage(editor)).toBe('events');
    expect(editor.shadowRoot!.activeElement).toBe(field);
    expect(spoken(editor)).toBe('Added Time Font Size.');
    expect(lastConfig(editor)).toBeUndefined();
    // Added for the session: back on the page after the results, it is still drawn.
    $(editor, '[data-focus="return"]')!.click();
    await editor.updateComplete;
    await searchFor(editor, '');
    await changeField(editor, 'filter:search', 'time font size');
    expect(row(editor, 'events:time_font_size').tag).toBeUndefined();
    expect($(editor, '[data-focus="add-result:events:time_font_size"]')).toBeNull();
  });

  it('withheld by a gate: opens the setting that allows it, and says what it needs', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'description color');
    await chooseResult(editor, 'result:events:description_color');

    const gate = $(editor, '[data-field="events:show_description"]');
    expect(openPage(editor)).toBe('events');
    expect(editor.shadowRoot!.activeElement).toBe(gate);
    expect(gate?.closest('.jump')?.classList.contains('jumped')).toBe(true);
    expect(spoken(editor)).toBe('Description Color needs Show Description.');
    expect(lastConfig(editor)).toBeUndefined();
  });

  it.each([
    ['shared', 'reset:events:description_color'],
    // In List the value is All Layouts', which that line edits rather than resets.
    ['list', 'edit:events:description_color:shared'],
  ])('stored but not in use, in %s: opens its gate line, at %s', async (scope, focus) => {
    const editor = await mount({ ...LIST, description_color: 'red' });
    await changeField(editor, 'workspace:editing_workspace', scope);
    await searchFor(editor, 'description color');
    await chooseResult(editor, 'result:events:description_color');

    expect(openPage(editor)).toBe('events');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(focus);
    expect(spoken(editor)).toBe('Showing Description Color.');
  });

  it('another layout’s: switches the scope, then opens it there', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'hour line');
    await chooseResult(editor, 'result:separators:time_grid.hour_line_color');
    await editor.updateComplete;
    await editor.updateComplete;

    expect((editor as unknown as { _workspace: string })._workspace).toBe('grid');
    expect(openPage(editor)).toBe('size_spacing');
    expect(editor.shadowRoot!.activeElement).toBe(
      $(editor, '[data-field="separators:time_grid.hour_line_color"]'),
    );
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('a page: opens it, with Return to Results', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'weather');
    await chooseResult(editor, 'result:page:weather');
    expect(openPage(editor)).toBe('weather');
    expect($(editor, '[data-focus="return"]')).not.toBeNull();
  });
});

describe('helper-only matches', () => {
  /** The card's own results for "color" on the wall card, in Grid. */
  function cardHits(): SearchHit[] {
    const config = { ...Config.DEFAULT_CONFIG, ...WALL } as unknown as Types.Config;
    return search(searchIndex(config, { workspace: 'grid' }), 'color').filter(
      ({ entry: e }) => e.tier === 0,
    );
  }

  it('are kept, and listed after every label, key and alias match', () => {
    const hits = cardHits();
    const helper = hits.filter(({ source }) => source === 'helper');
    const first = hits.findIndex(({ source }) => source === 'helper');
    // The D05 mockup's five, less All-Day Badge, whose shorter helper no longer says color,
    // each with the phrase that matched.
    expect(helper.map(({ entry: e }) => e.label)).toEqual(
      expect.arrayContaining([
        'Filter Duplicates',
        'Title',
        'Event Background Opacity',
        'All-Day Badge Style',
      ]),
    );
    expect(hits.slice(first).every(({ source }) => source === 'helper')).toBe(true);
    expect(hits.slice(0, first).every(({ source }) => source !== 'helper')).toBe(true);
    for (const { phrase } of helper) {
      expect(phrase?.marks.map(([start, end]) => phrase.text.slice(start, end))).toEqual(['color']);
    }
  });

  it('show their phrase on the row', async () => {
    const editor = await mount(WALL);
    await searchFor(editor, 'color');
    // The phrase's template is the results' own, never the search field's helper.
    expect(helperOf(editor, 'filter:search')).toBeUndefined();
    const filter = $(editor, '[data-focus="result:content:filter_duplicates_mode"] .result-phrase');
    expect(text(filter)).toBe('Help: “…is kept, with its color.”');
    expect(filter?.querySelector('mark')?.textContent).toBe('color');
  });
});

describe('one field of several calendars', () => {
  it('is one result, counted once, that opens to a row per calendar and closes again', async () => {
    const editor = await mount(WALL);
    await searchFor(editor, 'color');
    const folded = row(editor, 'calendar:color');
    expect(folded).toMatchObject({
      crumbs: 'Calendars › Name & Look',
      meta: 'Set on Calendars: 6',
      expanded: false,
    });
    expect(resultRows(editor).filter(({ id }) => id === 'calendar:color')).toHaveLength(1);
    expect(text($(editor, '.result-status'))).toMatch(
      new RegExp(`^Results for “color”: ${resultRows(editor).length} · Values for Grid$`),
    );

    await openResultGroup(editor, 'calendar:color');
    const rows = resultRows(editor).filter(({ id }) => id === 'calendar:color');
    expect(rows.map(({ label, meta }) => [label, meta])).toEqual([
      ['Event Color', 'Set on Calendars: 6'],
      ['Anna', '#e91e63 · Set on This Calendar · YAML: entities[0].color'],
      ['Ben', '#2196f3 · Set on This Calendar · YAML: entities[1].color'],
      ['Leo', '#4caf50 · Set on This Calendar · YAML: entities[2].color'],
      ['Family', '#ff9800 · Set on This Calendar · YAML: entities[3].color'],
      ['Work', '#9c27b0 · Set on This Calendar · YAML: entities[4].color'],
      ['Bin Day', '#795548 · Set on This Calendar · YAML: entities[5].color'],
    ]);
    expect(text($(editor, `[data-focus="${rows[2].key}"] .result-go`))).toBe('Go to Setting');

    $(editor, `[data-focus="${folded.key}"]`)!.click();
    await editor.updateComplete;
    expect(resultRows(editor).filter(({ id }) => id === 'calendar:color')).toHaveLength(1);
  });

  it('opens one calendar’s page at the field from its row', async () => {
    const editor = await mount(WALL);
    await searchFor(editor, 'color');
    await openResultGroup(editor, 'calendar:color');
    const ben = resultRows(editor).find(({ label }) => label === 'Ben')!;
    await chooseResult(editor, ben.key);
    const keys = (editor as unknown as { _entryKeys: number[] })._entryKeys;
    expect($(editor, '.entry-page')?.dataset.page).toBe(`entry:${keys[1]}`);
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '.jump [data-field="calendar:color"]'));
  });

  it('says so where no calendar sets it', async () => {
    const editor = await mount(WALL);
    await searchFor(editor, 'blocklist');
    expect(row(editor, 'calendar:blocklist').meta).toBe('Not Set on Any Calendar');
  });

  it('stays one row per calendar where there is one calendar', () => {
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.anna'],
    } as unknown as Types.Config;
    const items = collapse(search(searchIndex(config, { workspace: 'list' }), 'blocklist'));
    expect(items.map((item) => item.kind)).toEqual(['hit']);
  });
});

describe('Edit Here', () => {
  /** The live controls drawn in place of rows. */
  const controls = (editor: MountedEditor) =>
    [...editor.shadowRoot!.querySelectorAll('.result--edit [data-field]')].map((each) =>
      each.getAttribute('data-field'),
    );

  async function toggle(editor: MountedEditor): Promise<void> {
    $(editor, '[data-focus="edit-here"]')!.click();
    await editor.updateComplete;
  }

  it('is offered at one result, and turns it into its control and back', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'refresh interval');
    expect(resultRows(editor)).toHaveLength(1);
    const button = $(editor, '[data-focus="edit-here"]')!;
    expect([text(button), button.getAttribute('aria-pressed')]).toEqual(['Edit Here', 'false']);

    await toggle(editor);
    expect(controls(editor)).toEqual(['actions:refresh_interval']);
    expect(resultRows(editor)).toHaveLength(0);
    expect(text($(editor, '.result--edit > .nav-summary'))).toBe('Taps & Refresh › Refresh');
    expect([text(button), button.getAttribute('aria-pressed')]).toEqual(['Show as a List', 'true']);

    await toggle(editor);
    expect(controls(editor)).toEqual([]);
    expect(resultRows(editor)).toHaveLength(1);
  });

  it('writes from a control what its page writes', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'refresh interval');
    await toggle(editor);
    emitChange(formOf(editor, 'actions:refresh_interval')!, { 'actions:refresh_interval': 45 });
    await editor.updateComplete;
    expect(lastConfig(editor)).toMatchObject({ refresh_interval: 45 });
  });

  it('is offered at sixty results, and draws every card setting found, leaving the rest rows', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'day');
    const rows = resultRows(editor);
    expect(rows.length).toBeGreaterThanOrEqual(60);
    // Settings a page draws or keeps in an Add row carry no tag; pages, calendars, buttons and
    // Home Assistant's tabs are not card settings.
    const settings = rows.filter(
      ({ id, tag }) => tag === undefined && !/^(page|calendar|button|ha):/.test(id),
    );
    expect(settings.length).toBeGreaterThan(20);

    await toggle(editor);
    expect(controls(editor)).toEqual(settings.map(({ id }) => id));
    expect(resultRows(editor)).toHaveLength(rows.length - settings.length);

    await toggle(editor);
    expect(controls(editor)).toEqual([]);
    expect(resultRows(editor)).toHaveLength(rows.length);
  });

  it('comes back on with Return to Results', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'exclude');
    await toggle(editor);
    await openResultGroup(editor, 'calendar:blocklist');
    const anna = resultRows(editor).find(({ label }) => label === 'Anna')!;
    await chooseResult(editor, anna.key);
    $(editor, '[data-focus="return"]')!.click();
    await editor.updateComplete;
    expect($(editor, '[data-focus="edit-here"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('a query that finds nothing', () => {
  it('says so, suggests what to try, and offers Clear Search, all announced', async () => {
    const editor = await mount(LIST);
    await searchFor(editor, 'xyzzyq');
    await editor.updateComplete;
    const message =
      'Nothing matches “xyzzyq”. Try fewer words, or an option name from YAML such as show_location.';
    expect(text($(editor, '.filter-empty'))).toBe(`${message} Clear Search`);
    expect(spoken(editor)).toBe(message);

    $(editor, '[data-focus="clear-search"]')!.click();
    await editor.updateComplete;
    expect($(editor, '.filter-empty')).toBeNull();
    expect($(editor, '[data-focus^="nav:"]')).not.toBeNull();
  });
});

describe('an input method composing a word', () => {
  it('is not searched until the word is composed', async () => {
    const editor = await mount(LIST, 'ko');
    const form = $(editor, 'ha-form.filter-form')!;
    form.dispatchEvent(new Event('compositionstart', { bubbles: true, composed: true }));
    await changeField(editor, 'filter:search', 'ㅅ');
    await changeField(editor, 'filter:search', '시');
    expect($(editor, '[data-focus^="nav:"]')).not.toBeNull();
    expect(resultRows(editor)).toHaveLength(0);

    form.dispatchEvent(new Event('compositionend', { bubbles: true, composed: true }));
    await editor.updateComplete;
    expect($(editor, '[data-focus^="nav:"]')).toBeNull();
    expect($(editor, '.result-status, .filter-empty')).not.toBeNull();
  });
});

/** The defects a review of the full search found, each pinned where it was. */
describe('the review’s findings', () => {
  it('never hands one result’s control to another, so a late change writes its own field', async () => {
    const editor = await mount({ ...LIST, list: { weekday_font_size: '18px' } });
    await searchFor(editor, 'refresh interval');
    $(editor, '[data-focus="edit-here"]')!.click();
    await editor.updateComplete;
    const form = $(editor, '.result--edit [data-field="actions:refresh_interval"] ha-form')!;
    const data = (form as unknown as { data: Record<string, unknown> }).data;
    await searchFor(editor, 'weekday font size');
    expect($(editor, '.result--edit [data-field="day_header:weekday_font_size"] ha-form')).not.toBe(
      form,
    );
    // The change the refresh control sends as the results move on.
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...data, refresh_interval: 45 } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(lastConfig(editor)).toMatchObject({
      refresh_interval: 45,
      list: { weekday_font_size: '18px' },
    });
  });

  it('opens a value the overview holds back at the overview’s own setting', async () => {
    // A relative start date is stored where the fixed date's control writes, which Start Date's
    // mode holds back; the overview draws no gate line to open.
    const editor = await mount({ ...LIST, start_date: '+1' });
    await searchFor(editor, 'start date');
    const fixed = row(editor, 'content:start_date_fixed');
    expect(fixed.tag).toMatch(/^Not in Use · Needs /);
    await chooseResult(editor, fixed.key);
    expect(openPage(editor)).toBeUndefined();
    expect(editor.shadowRoot!.activeElement).toBe(
      $(editor, '[data-field="content:start_date_mode"]'),
    );
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('finds a calendar’s setting only other layouts offer, tagged with them', () => {
    const one = (view: string, workspace: 'grid' | 'list', query: string) => {
      const config = {
        ...Config.DEFAULT_CONFIG,
        view,
        entities: ['calendar.anna'],
      } as unknown as Types.Config;
      return search(searchIndex(config, { workspace }), query)
        .filter(({ entry: e }) => e.target.kind === 'entry-field')
        .map(({ entry: e }) => [('id' in e.target && e.target.id) || '', e.tag]);
    };
    expect(one('grid', 'grid', 'split multi')).toContainEqual([
      'calendar:split_multiday_events',
      'Only in List and Columns',
    ]);
    expect(one('list', 'list', 'banners')).toContainEqual([
      'calendar:multiday_banners',
      'Only in Grid',
    ]);
  });

  it('marks and matches past a character outside the basic plane', () => {
    expect(highlight('😀Time', 'time')).toEqual([[2, 6]]);
    expect(search([entry('a😀bc', 0)], '😀c')).toHaveLength(1);
  });

  it('ranks a short word found only in help as help, with its phrase', () => {
    const [hit] = search([entry('Button', 0, [['Shown on the toolbar.', 'helper']])], 'on');
    expect(hit.source).toBe('helper');
    expect(hit.phrase?.text).toBe('Shown on the toolbar.');
  });

  it('words an action anew when Home Assistant’s strings change', async () => {
    const words = (said: string) => (key: string) => (key.endsWith('.navigate') ? said : '');
    const hass = { ...fakeHass({ states: STATES }), localize: words('Navigate') };
    const editor = await mountEditor(
      { ...LIST, event_tap_action: { action: 'navigate', navigation_path: '/lovelace/0' } },
      { hass },
    );
    await searchFor(editor, 'event tap action');
    expect(row(editor, 'actions:event_tap_action').meta).toMatch(/^Navigate · /);
    editor.hass = { ...hass, localize: words('Gehe zu') } as typeof editor.hass;
    editor.requestUpdate();
    await editor.updateComplete;
    expect(row(editor, 'actions:event_tap_action').meta).toMatch(/^Gehe zu · /);
  });
});

/** What the layers under this one draw, each reached with its value and where it stands. */
describe('the controls the stack below added', () => {
  const STACK = {
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: [
      { entity: 'calendar.anna', color: '#e91e63' },
      { entity: 'calendar.ben', blocklist: 'Dentist|Gym' },
    ],
    toolbar: { show: true },
    start_date: 'today+1',
    event_tap_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    background_color: 'var(--primary-color)',
  };

  async function stack(): Promise<MountedEditor> {
    const localize = (key: string) => (key.endsWith('.navigate') ? 'Navigate' : '');
    return mountEditor(STACK, { hass: { ...fakeHass({ states: STATES }), localize } });
  }

  it('words a color as the color control names it, shown or held back', async () => {
    const editor = await stack();
    await searchFor(editor, 'background color');
    expect(row(editor, 'card:background_color').meta).toMatch(/^Home Assistant's primary color · /);
    // A color a gate holds back, and another layout's, are worded the same way, never as CSS.
    expect(row(editor, 'day_header:week_number_background_color').meta).toMatch(
      /^Home Assistant's primary color, 31% · /,
    );
    expect(row(editor, 'layout:time_grid.weekend_background_color').meta).toMatch(
      /^Primary Text, 4% · /,
    );
  });

  it('reaches Split This Calendar on every entry, and opens one at its row', async () => {
    const editor = await stack();
    await searchFor(editor, 'split this');
    expect(row(editor, 'calendar:split')).toMatchObject({
      label: 'Split This Calendar',
      crumbs: 'Calendars › Which Events',
      meta: 'Entries: 2',
      expanded: false,
    });
    await openResultGroup(editor, 'calendar:split');
    const ben = resultRows(editor).find(({ label }) => label === 'Ben')!;
    await chooseResult(editor, ben.key);
    const keys = (editor as unknown as { _entryKeys: number[] })._entryKeys;
    expect($(editor, '.entry-page')?.dataset.page).toBe(`entry:${keys[1]}`);
    await editor.updateComplete;
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '[data-focus="split-row"]'));
  });

  it('reaches the calendar list, where calendars are reordered, by its name and by dragging', async () => {
    const editor = await stack();
    for (const query of ['calendars', 'drag', 'move']) {
      await searchFor(editor, query);
      expect(row(editor, 'overview:calendars'), query).toMatchObject({
        label: 'Calendars',
        meta: 'Entries: 2 · YAML: entities',
      });
    }
    await chooseResult(editor, 'result:overview:calendars');
    await editor.updateComplete;
    expect(editor.shadowRoot!.activeElement?.textContent?.trim()).toBe('Calendars');
    expect($(editor, '[data-focus="return"]')).not.toBeNull();
  });

  it('words a word list as its terms', async () => {
    const editor = await stack();
    await searchFor(editor, 'blocklist');
    await openResultGroup(editor, 'calendar:blocklist');
    expect(resultRows(editor).find(({ label }) => label === 'Ben')?.meta).toBe(
      'Dentist, Gym · Set on This Calendar · YAML: entities[1].blocklist',
    );
  });

  it('words Start Date’s shortcut and Tapping an Event as the overview shows them', async () => {
    const editor = await stack();
    await searchFor(editor, 'tomorrow');
    expect(row(editor, 'content:start_date_mode').meta).toMatch(/^Tomorrow · /);
    await searchFor(editor, 'tapping');
    // Another action stored in its place: the switch gives way to it, and so does its value.
    expect(row(editor, 'actions:event_opens_details').meta).toMatch(/^Navigate · /);
  });

  it('reaches the event-part chips and the toolbar’s controls, and opens at the chip', async () => {
    const editor = await stack();
    await searchFor(editor, 'end time');
    expect(row(editor, 'events:show_end_time').meta).toMatch(/^On · /);
    await searchFor(editor, 'refresh button');
    expect(row(editor, 'card:toolbar.refresh').meta).toMatch(/^On · /);
    await searchFor(editor, 'calendar filter');
    expect(row(editor, 'card:toolbar.legend').meta).toMatch(/^Menu · /);
    await searchFor(editor, 'end time');
    await chooseResult(editor, 'result:events:show_end_time');
    expect(editor.shadowRoot!.activeElement).toBe(
      $(editor, 'button.chip[data-field="events:show_end_time"]'),
    );
  });
});
