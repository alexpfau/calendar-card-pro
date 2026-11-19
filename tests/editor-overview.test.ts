/**
 * The overview: Whole Card, the layouts and the preview each draws, what each scope stores
 * (`storedCount`),
 * when Quick Setup's banner shows (`quick-setup.ts` › `isFreshCard`), and the line under each
 * section row (`summary.ts`).
 */

import { describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import {
  chooseResult,
  goEntry,
  goOverview,
  goPage,
  keysOf,
  lastConfig,
  mountEditor,
  resultRows,
  searchFor,
} from './helpers/editor-host';
import { CURRENT_CONFIG_VERSION, DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { PAGES, type PageDef, placementOf } from '../src/rendering/editor/pages';
import { isFreshCard } from '../src/rendering/editor/quick-setup';
import { workspaceFormData } from '../src/rendering/editor/routing';
import styles from '../src/rendering/editor/styles';
import { SUMMARY_SEPARATOR, pageStoredCount, summaryParts } from '../src/rendering/editor/summary';
import { type EditorWorkspace, WORKSPACES, storedCount } from '../src/rendering/editor/workspace';

/**
 * A configuration as the editor holds it: the YAML merged over the card's defaults.
 *
 * @param raw - The YAML
 * @returns The merged configuration
 */
function merged(raw: Record<string, unknown>): Types.Config {
  return { ...DEFAULT_CONFIG, ...raw } as Types.Config;
}

const LIST_CARD = { type: 'custom:calendar-card-pro', entities: ['calendar.anna'], view: 'list' };

describe('Layouts and the preview', () => {
  type Previewing = { _previewedScope(): { view: string; config: object } | undefined };
  const previewed = (editor: Element): string | undefined =>
    (editor as unknown as Previewing)._previewedScope()?.view;
  const line = (editor: Element): string | undefined =>
    editor
      .shadowRoot!.querySelector('.scope-preview-text')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
  const $ = (editor: Element, selector: string) =>
    editor.shadowRoot!.querySelector<HTMLElement>(selector);
  const press = async (editor: Element & { updateComplete: Promise<unknown> }, key: string) => {
    $(editor, `[data-focus="${key}"]`)!.click();
    await editor.updateComplete;
  };
  const text = (element: Element | null): string =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const THREE = {
    config_version: CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    view: 'month',
    toolbar: { show: true, view_switcher: true, view_switcher_layouts: ['list', 'grid', 'month'] },
  };

  it('draws Calendars, Whole Card, Layouts and More, and no Settings For', async () => {
    const editor = await mountEditor(THREE);
    const blocks = [
      ...editor.shadowRoot!.querySelectorAll('.overview > [data-heading], .overview > .row-group'),
    ].map((block) => block.getAttribute('data-heading') ?? text(block.querySelector('.heading')));
    expect(blocks).toEqual(['calendars', 'Whole Card', 'starting_layout', 'More']);
    expect(text($(editor, '[data-heading="starting_layout"] > .heading'))).toBe('Layouts');
    // Whole Card's rows: its pages, then the shared settings. Weather is each layout's topic.
    const whole = editor.shadowRoot!.querySelectorAll('.overview > .row-group')[0];
    expect(
      [...whole.querySelectorAll('.nav-row')].map((row) => row.getAttribute('data-focus')),
    ).toEqual(['nav:card_header', 'nav:taps_refresh', 'nav:shared']);
    // Card & Header names the layout switcher, the thing a layout's status no longer says.
    expect(text($(editor, '[data-focus="nav:card_header"] .nav-summary'))).toMatch(
      /Layout Switcher: List, Grid, Month$/,
    );
    expect($(editor, '.scope-compact')).toBeNull();
    expect($(editor, 'input[name="scope"]')).toBeNull();
  });

  it('splits each layout row in two: its radio picks where the card opens, the rest opens its page', async () => {
    const editor = await mountEditor(THREE);
    const rows = [...editor.shadowRoot!.querySelectorAll('.layout-choice')];
    expect(
      rows.map((row) => {
        const radio = row.querySelector<HTMLInputElement>('.layout-pick > input')!;
        const open = row.querySelector('.layout-open')!;
        return [
          `${radio.value}${radio.checked ? ' checked' : ''}`,
          radio.getAttribute('aria-label'),
          open.getAttribute('aria-label'),
          text(open.querySelector('.display-text')),
        ];
      }),
    ).toEqual([
      ['list', 'List', 'List Settings', 'List Days stacked, one per row'],
      ['column', 'Columns', 'Columns Settings', 'Columns Days side by side'],
      ['grid', 'Grid', 'Grid Settings', 'Grid Days side by side on an hour axis'],
      ['month checked', 'Month', 'Month Settings', 'Month A whole month, a row per week'],
    ]);
    // The radio is the only thing in its zone, and the name sits in the button, not the label.
    expect(rows.every((row) => row.querySelector('.layout-pick')!.children.length === 1)).toBe(
      true,
    );
    // One group of native radios, named Starting Layout, so the arrow keys move the choice.
    expect(new Set(rows.map((row) => row.querySelector<HTMLInputElement>('input')!.name))).toEqual(
      new Set(['view']),
    );
    expect(text($(editor, 'fieldset.layouts > legend'))).toBe('Starting Layout');
    // The help above the rows, its link opening the layout switcher where it is set.
    expect(text($(editor, '.layouts-help'))).toBe(
      'The circle picks the layout the card opens in. With the layout switcher on, people can ' +
        'switch layouts on the card. Select a layout to change its own settings.',
    );
    // Opening a layout changes nothing on the card.
    await press(editor, 'layout:grid');
    expect($(editor, '.page[data-layout="grid"]')).not.toBeNull();
    expect(lastConfig(editor)).toBeUndefined();
    await press(editor, 'back-top');
    await press(editor, 'layouts:switcher');
    expect($(editor, '.page[data-page="card_header"]')).not.toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe(
      'card:toolbar.view_switcher',
    );
    // The radio writes `view`.
    await goOverview(editor);
    const grid = $(editor, 'input[name="view"][value="grid"]') as HTMLInputElement;
    grid.checked = true;
    grid.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
    expect(lastConfig(editor)?.view).toBe('grid');
  });

  it('lists a layout’s topics on its page, each opening under that layout', async () => {
    const editor = await mountEditor(THREE);
    await press(editor, 'layout:grid');
    expect(text($(editor, '.page-title'))).toBe('Grid');
    expect(text($(editor, '.page-sub'))).toBe('Layout');
    expect(
      [...editor.shadowRoot!.querySelectorAll('.layout-page .nav-row')].map((row) =>
        row.getAttribute('data-focus'),
      ),
    ).toEqual([
      'nav:which_events',
      'nav:day_header',
      'nav:events',
      'nav:size_spacing',
      'nav:weather',
    ]);
    // Which Events counts Grid's own hours here, and nothing of Grid's under another layout.
    const hours = await mountEditor({ ...THREE, time_grid: { start_time: '07:00' } });
    await press(hours, 'layout:grid');
    expect(text($(hours, '[data-focus="nav:which_events"] .nav-summary'))).toMatch(/Set: 1$/);
    await press(hours, 'back-top');
    await press(hours, 'layout:column');
    expect(text($(hours, '[data-focus="nav:which_events"] .nav-summary'))).not.toMatch(/Set:/);
  });

  it('names a topic’s layout, jumps to the same topic in another, and walks on', async () => {
    const editor = await mountEditor(THREE);
    await press(editor, 'layout:grid');
    await press(editor, 'nav:events');
    expect(text($(editor, '.page-sub'))).toBe('Grid');
    expect(text($(editor, '.also-for'))).toBe('Also for: List · Columns · Month · Layout Defaults');
    expect(text($(editor, '[data-focus="continue"]'))).toBe('Continue with Grid · Size & Spacing');
    expect(previewed(editor)).toBe('grid');
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    await press(editor, 'also:column');
    expect(text($(editor, '.page-sub'))).toBe('Columns');
    expect(text($(editor, '.page-title'))).toBe('Event Appearance');
    // Columns is not offered by the switcher, so its preview draws none.
    expect((editor as unknown as Previewing)._previewedScope()?.config).toMatchObject({
      toolbar: { view_switcher: false },
    });
    // The last topic of a layout walks on to the next layout's first.
    await press(editor, 'continue');
    expect(text($(editor, '.page-title'))).toBe('Size & Spacing');
    await press(editor, 'continue');
    expect(text($(editor, '.page-sub'))).toBe('Columns');
    expect(text($(editor, '.page-title'))).toBe('Weather');
    await press(editor, 'continue');
    expect(text($(editor, '.page-sub'))).toBe('Grid');
    expect(text($(editor, '.page-title'))).toBe('Which Events');
    // Also For and Continue replace the place, so Back returns to the layout's page opened first,
    // then to the overview, at the row that opened it.
    await press(editor, 'back-top');
    expect($(editor, '.page[data-layout="grid"]')).not.toBeNull();
    await press(editor, 'back-top');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe('layout:grid');
  });

  it('edits the whole card on its own pages and Layout Defaults on its, previewing the card as it opens', async () => {
    const editor = await mountEditor(THREE);
    await goPage(editor, 'card_header');
    expect(text($(editor, '.page-sub'))).toBe('Whole Card');
    expect(previewed(editor)).toBeUndefined();
    expect($(editor, '.also-for')).toBeNull();
    await goOverview(editor);
    await press(editor, 'layout:shared');
    expect(text($(editor, '.page-title'))).toBe('Layout Defaults');
    expect(previewed(editor)).toBeUndefined();
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(previewed(editor)).toBeUndefined();
  });

  it('opens a result under the layout it belongs to, a calendar’s and a stored one not in use too', async () => {
    // Stored but not in use: Event Appearance under List, the card's layout, not the whole card.
    const list = await mountEditor({ ...LIST_CARD, description_color: 'red' });
    await searchFor(list, 'description color');
    const inactive = resultRows(list).find((row) => row.id === 'events:description_color')!;
    await chooseResult(list, inactive.key);
    expect(text($(list, '.page-sub'))).toBe('List');
    expect($(list, '.also-for')).not.toBeNull();
    // A calendar option only List offers, on a Grid card: the calendar's page, in List.
    const grid = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
    });
    await searchFor(grid, 'compact');
    const other = resultRows(grid).find((row) => row.id === 'calendar:compact_events_to_show')!;
    await chooseResult(grid, other.key);
    expect($(grid, '.entry-page')).not.toBeNull();
    expect(
      $(
        grid,
        '.jump [data-field="calendar:compact_events_to_show"], [data-field="calendar:compact_events_to_show"].jump',
      ),
    ).not.toBeNull();
  });

  it('goes back to the layout the card opens in once a calendar opened in another is left', async () => {
    // A result opens Anna's page in List, for an option only List offers. Left, the overview and
    // Anna's own row edit in Grid again, and the preview no longer draws List.
    const grid = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
    });
    const compact = '[data-field="calendar:compact_events_to_show"]';
    await searchFor(grid, 'compact');
    const other = resultRows(grid).find((row) => row.id === 'calendar:compact_events_to_show')!;
    await chooseResult(grid, other.key);
    expect($(grid, compact)).not.toBeNull();
    await goOverview(grid);
    await searchFor(grid, '');
    expect($(grid, '[data-focus^="row:"]')).not.toBeNull();
    expect(previewed(grid)).toBeUndefined();
    await goEntry(grid, keysOf(grid, 'entry')[0]);
    expect($(grid, '.entry-page')).not.toBeNull();
    expect($(grid, '.scope-preview')).toBeNull();
    expect($(grid, compact)).toBeNull();
  });

  it('gathers the whole-card settings of the topics on Shared Across Layouts, composed ones too', async () => {
    const editor = await mountEditor(THREE);
    await press(editor, 'nav:shared');
    expect(text($(editor, '.page-title'))).toBe('Shared Across Layouts');
    expect(
      $(editor, '[data-field="content:start_date_mode"][data-composed="chips"]'),
    ).not.toBeNull();
    expect($(editor, '[data-setting="content:first_day_of_week"]')).not.toBeNull();
    expect($(editor, '[data-setting="events:event_font_size"]')).toBeNull();
    // The page says once that they are the whole card's; its settings do not repeat it.
    expect(
      [...editor.shadowRoot!.querySelectorAll('.fact')].some((fact) => text(fact) === 'Whole Card'),
    ).toBe(false);
    // On a layout's topic, the same setting says it is the whole card's.
    await goOverview(editor);
    await press(editor, 'layout:grid');
    await press(editor, 'nav:day_header');
    const facts = [
      ...editor.shadowRoot!.querySelectorAll('[data-setting="content:first_day_of_week"] .fact'),
    ].map(text);
    expect(facts).toContain('Whole Card');
  });

  it('positions the box around every input it hides, so focusing one scrolls nothing', () => {
    const css = styles.cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
      selectors: selector.split(',').map((each) => each.trim()),
      body,
    }));
    const hidden = rules
      .filter(({ body }) => /position: absolute/.test(body) && /opacity: 0/.test(body))
      .flatMap(({ selectors }) => selectors)
      .filter((selector) => / input$/.test(selector))
      .map((selector) => selector.replace(/ input$/, ''));
    expect(hidden.sort()).toEqual(['.chip-choice', '.color-row', '.color-swatch', '.segment']);
    for (const box of hidden) {
      const positioned = rules.some(
        ({ selectors, body }) =>
          selectors.includes(box) && /position: (relative|absolute|fixed|sticky)/.test(body),
      );
      expect(positioned, box).toBe(true);
    }
  });

  it('lays All Layouts across the top of the frame and the four layouts under it', () => {
    const css = styles.cssText.replace(/\s+/g, ' ');
    expect(css).toMatch(/\.scope \.segments \{ flex-wrap: wrap; \}/);
    expect(css).toMatch(/\.scope \.segment-all \{ flex-basis: 100%; border-bottom: [^}]*\}/);
    expect(css).toMatch(/\.scope \.segment-all \+ \.segment \{ border-inline-start: none; \}/);
  });

  it('counts what each scope stores, as the YAML holds it', () => {
    const raw = {
      ...LIST_CARD,
      config_version: 5,
      title: 'Family',
      days_to_show: 7,
      grid_options: { columns: 12 },
      card_mod: { style: '' },
      empty_day_text: '',
      list: { day_spacing: '12px' },
      time_grid: { start_time: '07:00', end_time: '21:00', hour_height: null },
      month: { min_day_width: 90, week_scroll: null },
    };
    const counts = Object.fromEntries(
      WORKSPACES.map((workspace) => [workspace, storedCount(raw, workspace)]),
    );
    expect(counts).toEqual({ shared: 2, list: 1, column: 0, grid: 2, month: 1 });
  });
});

// A row per layout, each the shape of Quick Setup's example rows (the approved Starting Layout
// option C): a native radio, the layout's picture, then its name over its description.
describe('Starting Layout', () => {
  it('stacks the rows at every width, sharing Quick Setup’s row, text and line rules', () => {
    const css = styles.cssText.replace(/\s+/g, ' ');
    expect(css).toMatch(/\.display-choices \{ display: flex; flex-direction: column; gap: 8px; \}/);
    expect(css).not.toMatch(/grid-template-columns: repeat\(3/);
    expect(css).toMatch(/\.story-tile, \.display-choice \{ display: flex; align-items: center;/);
    expect(css).toMatch(/\.story-text, \.display-choice > \.display-text \{ flex: 1;/);
    expect(css).toMatch(/\.story-detail, \.display-choice \.display-description \{/);
    expect(css).toMatch(/\.display-image \{ flex: none; width: 48px; height: 32px;/);
  });
});

// A frame that does not clip, so a focus ring is never cut, leaves each fill drawn against its edge
// to round the corners it shares with it. A square corner there crosses the frame's curve and
// covers its border.
describe('a row’s fill inside a rounded frame', () => {
  const all = declarations(styles.cssText);
  const on = (selector: string, property: string) =>
    all
      .filter((each) => each.selectors.includes(selector) && each.property === property)
      .map(({ value }) => value);
  // Each framed list: the element its rows are, and the rules that round the row at its top and
  // the row at its bottom.
  const FRAMES = [
    {
      frame: '.row-group',
      row: '.nav-row',
      top: [
        '.row-group > .rows:first-child > .nav-row:first-child',
        '.row-group > .result:first-child > .nav-row',
      ],
      bottom: [
        '.row-group > .rows:last-child > .nav-row:last-child',
        '.row-group > .result:last-child > .nav-row',
        '.row-group > .nav-row:last-child',
      ],
    },
    {
      frame: '.layout-block',
      row: '.nav-row',
      top: [],
      bottom: ['.layout-block > .layout-defaults:last-child > .nav-row:last-child'],
    },
    {
      frame: '.menu',
      row: '.menu-item',
      top: ['.menu-item:first-child'],
      bottom: ['.menu-item:last-child'],
    },
  ];

  it('rounds each half of a layout row to the row’s inner corner, on its own side only', () => {
    // The row's radius less its border is where a half's fill has to stop.
    const inner = `${
      parseFloat(on('.display-choice', 'border-radius')[0]) -
      parseFloat(on('.display-choice', 'border')[0])
    }px`;
    const radii = all
      .filter(
        ({ selectors, property }) =>
          /radius/.test(property) && selectors.some((each) => /^\.layout-(pick|open)\b/.test(each)),
      )
      .map(({ selectors, property, value }) => `${selectors.join(', ')} { ${property}: ${value} }`);
    // Logical corners, so a right-to-left editor needs no :dir() rule, which Chrome reads only
    // from 120 and Safari from 16.4; and the shorthand first, so it cannot undo them.
    expect(inner).toBe('11px');
    expect(radii).toEqual([
      `.layout-pick { border-start-start-radius: ${inner} }`,
      `.layout-pick { border-end-start-radius: ${inner} }`,
      '.layout-open { border-radius: 0 }',
      `.layout-open { border-start-end-radius: ${inner} }`,
      `.layout-open { border-end-end-radius: ${inner} }`,
    ]);
  });

  it('keeps the chosen layout’s tint under the pointer', () => {
    const cleared = all
      .filter(
        ({ selectors, property }) =>
          /^background/.test(property) &&
          selectors.some((each) => /layout-choice.*:hover/.test(each)),
      )
      .map(({ selectors, value }) => `${selectors.join(', ')} { background: ${value} }`);
    expect(cleared).toEqual([
      '.display-choice.layout-choice:not(:has(input:checked)):hover { background: none }',
    ]);
    const [tint] = on('.display-choice:has(input:checked)', 'background');
    expect(tint).toMatch(/^rgba\(var\(--rgb-primary-color\b/);
  });

  it('rounds a list row at a frame’s top or bottom inside the frame’s curve', () => {
    const corners = (selector: string) =>
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) =>
        on(selector, `border-${corner}-radius`),
      );
    // The frame's radius less its border and the padding between it and the rows: a circle that
    // size, set in the row's corner, meets the frame's inner curve only at its side.
    const fits = FRAMES.map(({ frame, top, bottom }) => {
      const [radius] = on(frame, 'border-radius');
      const border = parseFloat(on(frame, 'border')[0]);
      const padding = on(frame, 'padding')[0].split(' ').map(parseFloat);
      const [above, below] = [padding[0], padding[padding.length > 2 ? 2 : 0]];
      const fit = (inset: number) =>
        /^\d+px$/.test(radius) ? `${parseFloat(radius) - inset}px` : `calc(${radius} - ${inset}px)`;
      for (const selector of top) {
        const value = fit(border + above);
        expect(corners(selector), selector).toEqual([[value], [value], [], []]);
      }
      for (const selector of bottom) {
        const value = fit(border + below);
        expect(corners(selector), selector).toEqual([[], [], [value], [value]]);
      }
      return `${frame}: ${fit(border + below)}`;
    });
    expect(fits).toEqual([
      '.row-group: calc(var(--ha-card-border-radius, 12px) - 5px)',
      '.layout-block: calc(var(--ha-card-border-radius, 12px) - 13px)',
      '.menu: 3px',
    ]);
  });

  it('rounds exactly the rows that touch a frame’s edge, on the overview, a page, search and the menu', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'month',
    });
    const press = async (key: string) => {
      editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="${key}"]`)!.click();
      await editor.updateComplete;
    };
    // The row a frame's edge runs along: its first or last element, through any wrapper, if that
    // is a row; none where a heading, a note or a field comes first.
    const edgeRow = (
      frame: Element,
      row: string,
      end: 'firstElementChild' | 'lastElementChild',
    ) => {
      for (let node = frame[end]; node; node = node[end]) {
        if (node.matches(row)) return node;
      }
      return null;
    };
    const seen = new Map<string, { rows: number; top: number; bottom: number }>();
    const reconcile = (where: string) => {
      for (const { frame: kind, row: rowSelector, top, bottom } of FRAMES) {
        const tally = seen.get(kind) ?? { rows: 0, top: 0, bottom: 0 };
        for (const frame of editor.shadowRoot!.querySelectorAll(kind)) {
          const first = edgeRow(frame, rowSelector, 'firstElementChild');
          const last = edgeRow(frame, rowSelector, 'lastElementChild');
          const rounded = (row: Element, rules: string[]) =>
            rules.length > 0 && row.matches(rules.join(', '));
          for (const row of frame.querySelectorAll(rowSelector)) {
            const name = `${where}: ${kind} ${row.getAttribute('data-focus') ?? row.getAttribute('data-pref')}`;
            expect(rounded(row, top), `${name} (top)`).toBe(row === first);
            expect(rounded(row, bottom), `${name} (bottom)`).toBe(row === last);
            tally.rows++;
            if (row === first) tally.top++;
            if (row === last) tally.bottom++;
          }
        }
        seen.set(kind, tally);
      }
    };
    await press('prefs-menu');
    reconcile('overview');
    await press('prefs-menu');
    await press('layout:grid');
    reconcile('Grid');
    await goOverview(editor);
    await searchFor(editor, 'week');
    expect(resultRows(editor).length).toBeGreaterThan(1);
    reconcile('search');
    // The overview's two lists end on a row, the layout page's list starts and ends on one, and
    // so does a list of results; Layout Defaults ends the Layouts block; the menu's one item is its
    // first and its last.
    const list = seen.get('.row-group')!;
    expect(list.top).toBeGreaterThanOrEqual(2);
    expect(list.bottom).toBeGreaterThanOrEqual(4);
    expect(list.rows).toBeGreaterThan(list.top + list.bottom);
    expect(seen.get('.layout-block')).toMatchObject({ top: 0 });
    expect(seen.get('.layout-block')!.bottom).toBeGreaterThanOrEqual(1);
    expect(seen.get('.menu')).toMatchObject({ top: 1, bottom: 1 });
  });
});

describe('Quick Setup banner', () => {
  it('shows on a card fresh from the card picker', () => {
    expect(
      isFreshCard({
        type: 'custom:calendar-card-pro',
        config_version: 5,
        entities: ['calendar.anna'],
        days_to_show: 3,
        _description: undefined,
      }),
    ).toBe(true);
  });

  it('shows beside keys the card does not own, and with no calendar yet', () => {
    expect(isFreshCard({ type: 'custom:calendar-card-pro', grid_options: { columns: 12 } })).toBe(
      true,
    );
  });

  it('does not show once the card stores a setting, a layout block or a second calendar', () => {
    expect(isFreshCard({ ...LIST_CARD })).toBe(false);
    expect(isFreshCard({ type: 'custom:calendar-card-pro', list: {} })).toBe(false);
    expect(
      isFreshCard({ type: 'custom:calendar-card-pro', entities: ['calendar.a', 'calendar.b'] }),
    ).toBe(false);
    expect(isFreshCard({ type: 'custom:calendar-card-pro', show_past_events: false })).toBe(false);
  });
});

describe('section row summaries', () => {
  it('names only fields placed on their own page', () => {
    for (const page of PAGES) {
      expect(page.summary.length).toBeGreaterThan(0);
      for (const id of page.summary) expect(placementOf(id)?.page, id).toBe(page.id);
    }
  });

  /**
   * A page's summary as the overview words it.
   *
   * @param page - The page
   * @param raw - The YAML
   * @param workspace - The scope
   * @returns The line
   */
  function summaryOf(
    page: PageDef,
    raw: Record<string, unknown>,
    workspace: EditorWorkspace,
  ): string {
    const config = merged(raw);
    const present = buildFieldIndex(schemaCtx(config, workspace, 'en'));
    const stored = pageStoredCount(page, raw, workspace);
    return summaryParts(
      page,
      present,
      workspaceFormData(config, workspace, {}),
      stored,
      'en',
      (_field, value) => (typeof value === 'string' ? value : undefined),
    ).join(SUMMARY_SEPARATOR);
  }

  const page = (id: string): PageDef => PAGES.find((candidate) => candidate.id === id)!;

  it('pairs labels with values and counts what the page stores in this scope', () => {
    const raw = { ...LIST_CARD, list: { show_past_events: true } };
    expect(summaryOf(page('which_events'), raw, 'list')).toBe(
      'Days To Show: 3 · Start Date: Today · Show Past Events: On · Show Empty Days: Off · Set: 1',
    );
    // At the top level nothing on the page is stored, and List's own value is not shown there.
    expect(summaryOf(page('which_events'), raw, 'shared')).toBe(
      'Days To Show: 3 · Start Date: Today · Show Past Events: Off · Show Empty Days: Off',
    );
  });

  it('words a dropdown by its option label and leaves out a field not built here', () => {
    const raw = { ...LIST_CARD, title: 'Family' };
    expect(summaryOf(page('card_header'), raw, 'shared')).toBe(
      'Title: “Family” · Show Toolbar: Off · Set: 1',
    );
    expect(summaryOf(page('events'), { ...LIST_CARD, show_time: false }, 'shared')).toBe(
      'Location · Now · Time Format: Follow Home Assistant · Set: 1',
    );
    // Without a weather entity, Show The Forecast is not built, and an empty entity says nothing.
    expect(summaryOf(page('weather'), LIST_CARD, 'list')).toBe('');
    // The entity is the whole card's; Layout Defaults offers no forecast of its own.
    const weather = { ...LIST_CARD, weather_entity: 'weather.home' };
    expect(summaryOf(page('weather'), weather, 'shared')).toBe(
      'Weather Entity: weather.home · Set: 1',
    );
    expect(summaryOf(page('weather'), weather, 'list')).toBe(
      'Weather Entity: weather.home · Show The Forecast: Nowhere · Set: 1',
    );
    expect(
      summaryOf(page('weather'), { ...weather, list: { weather: { position: 'date' } } }, 'list'),
    ).toBe('Weather Entity: weather.home · Show The Forecast: In the Day Header · Set: 2');
  });

  // A chip stands for its group, named by the chips pressed: label-value pairs under-reported
  // what an event shows, naming two of its eight parts.
  it('names a chip group by its pressed chips, the Events parts and the toolbar’s controls', () => {
    const parts = {
      ...LIST_CARD,
      show_end_time: true,
      show_countdown: 'once_per_day',
      show_now_indicator: false,
    };
    expect(summaryOf(page('events'), parts, 'shared')).toBe(
      'Time · End Time · Location · Countdown · Time Format: Follow Home Assistant · Set: 3',
    );
    // None pressed: the group says nothing.
    const none = {
      ...LIST_CARD,
      show_time: false,
      show_location: false,
      show_now_indicator: false,
    };
    expect(summaryOf(page('events'), none, 'shared')).toBe(
      'Time Format: Follow Home Assistant · Set: 3',
    );
    // The toolbar's controls only while the toolbar shows them, counted: their names read as
    // actions ("Reset"). Calendar Filter is one of them, on in either form and off as false.
    const toolbar = { ...LIST_CARD, toolbar: { show: true, reset: false, search: false } };
    expect(summaryOf(page('card_header'), toolbar, 'shared')).toMatch(
      /^Show Toolbar: On · Controls: 5 on · Set: 3$/,
    );
    const filterOff = { ...LIST_CARD, toolbar: { show: true, reset: false, legend: false } };
    expect(summaryOf(page('card_header'), filterOff, 'shared')).toMatch(
      /^Show Toolbar: On · Controls: 5 on · Set: 3$/,
    );
  });

  it('quotes a title, so one holding the separator stays one value', () => {
    const raw = { ...LIST_CARD, title: 'Everything · Grid' };
    expect(summaryOf(page('card_header'), raw, 'shared')).toBe(
      'Title: “Everything · Grid” · Show Toolbar: Off · Set: 1',
    );
  });

  it('counts each stored value once, and one a gate holds back as well', () => {
    // Height Mode and Card Height both write `height`: one value.
    const height = { ...LIST_CARD, list: { height: '300px' } };
    expect(summaryOf(page('size_spacing'), height, 'list')).toMatch(/ · Set: 1$/);
    // The description's size is held back while the description is off, and still stored.
    const description = { ...LIST_CARD, show_description: false, description_font_size: '12px' };
    expect(pageStoredCount(page('events'), description, 'shared')).toBe(2);
  });

  it('counts a nested value where it is stored', () => {
    const raw = { ...LIST_CARD, view: 'grid', time_grid: { start_time: '07:00' } };
    expect(summaryOf(page('which_events'), raw, 'grid')).toMatch(/ · Set: 1$/);
  });
});
