/**
 * The overview: Settings For and the preview it chooses, what each scope stores (`storedCount`),
 * when Quick Setup's banner shows (`quick-setup.ts` › `isFreshCard`), and the line under each
 * section row (`summary.ts`).
 */

import { describe, expect, it } from 'vitest';

import {
  changeField,
  goEntry,
  goOverview,
  goPage,
  keysOf,
  lastConfig,
  mountEditor,
  openPageOf,
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

describe('Settings For', () => {
  type Previewing = { _previewedScope(): { view: string } | undefined };
  const previewed = (editor: Element): string | undefined =>
    (editor as unknown as Previewing)._previewedScope()?.view;
  const line = (editor: Element): string | undefined =>
    editor
      .shadowRoot!.querySelector('.scope-preview-text')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
  const change = (editor: Element) =>
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="scope-change"]')!;
  const pick = async (editor: Element & { updateComplete: Promise<unknown> }, scope: string) => {
    const root = editor.shadowRoot!;
    if (root.querySelector('input[name="scope"]') === null) {
      change(editor).click();
      await editor.updateComplete;
    }
    const radio = root.querySelector<HTMLInputElement>(`[data-focus="scope:${scope}"]`)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    await editor.updateComplete;
  };

  it('is one line at the top of the overview’s Settings, after Calendars and Starting Layout', async () => {
    const editor = await mountEditor({ ...LIST_CARD, config_version: CURRENT_CONFIG_VERSION });
    const root = editor.shadowRoot!;
    const before = (a: string, b: string) =>
      Boolean(
        root.querySelector(a)!.compareDocumentPosition(root.querySelector(b)!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    expect(before('.cal-list, [data-heading="calendars"]', '.layout-block')).toBe(true);
    expect(before('.layout-block', '.scope-block')).toBe(true);
    expect(before('.scope-block', '.row-group .rows')).toBe(true);
    const settings = root.querySelector('.scope-block')!.closest('.row-group')!;
    expect(settings.querySelector('.heading')?.textContent?.trim()).toBe('Settings');
    expect(root.querySelector('.scope-compact')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Settings for List Change',
    );
    // Closed, whatever the card stores in other layouts or offers in its switcher.
    expect(root.querySelector('input[name="scope"]')).toBeNull();
    expect(change(editor).getAttribute('aria-expanded')).toBe('false');
    document.body.replaceChildren();
  });

  it('opens its choices on Change, keeps focus on Change, and Change or Escape closes them', async () => {
    const editor = await mountEditor({
      ...LIST_CARD,
      config_version: CURRENT_CONFIG_VERSION,
      column: { event_font_size: '13px' },
      toolbar: { show: true },
    });
    const root = editor.shadowRoot!;
    const settle = async () => {
      await editor.updateComplete;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.updateComplete;
    };
    change(editor).focus();
    change(editor).click();
    await settle();
    expect(change(editor).getAttribute('aria-expanded')).toBe('true');
    expect(change(editor).getAttribute('aria-controls')).toBe('scope-choices');
    // A disclosure's button keeps focus: moving it into the choices scrolled Home Assistant's
    // dialog in WebKit (see the stylesheet test below).
    expect(root.activeElement?.getAttribute('data-focus')).toBe('scope-change');

    // Choosing keeps them open, focus on the chosen one, so arrow keys go on moving.
    await pick(editor, 'grid');
    expect(root.querySelector('input[name="scope"]:checked')?.getAttribute('value')).toBe('grid');
    expect(root.querySelector('.scope-line')?.textContent?.trim()).toBe('Settings for Grid');

    change(editor).click();
    await settle();
    expect(root.querySelector('input[name="scope"]')).toBeNull();
    expect(root.activeElement?.getAttribute('data-focus')).toBe('scope-change');

    change(editor).click();
    await settle();
    root
      .querySelector('input[name="scope"]:checked')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    await settle();
    expect(root.querySelector('input[name="scope"]')).toBeNull();
    expect(root.activeElement?.getAttribute('data-focus')).toBe('scope-change');
    // On a page the same line is drawn, closed.
    await goPage(editor, 'events');
    expect(root.querySelector('.scope-line')?.textContent?.trim()).toBe('Settings for Grid');
    expect(root.querySelector('input[name="scope"]')).toBeNull();
    document.body.replaceChildren();
  });

  it('never says on the overview that it governs every page', async () => {
    const editor = await mountEditor({ ...LIST_CARD, config_version: CURRENT_CONFIG_VERSION });
    await pick(editor, 'grid');
    const help = editor.shadowRoot!.querySelector('fieldset.scope .hint')?.textContent?.trim();
    expect(help).toBe(
      'Chooses the layout the pages edit, where a setting can differ by layout. Nothing on the card changes.',
    );
    await goPage(editor, 'events');
    change(editor).click();
    await editor.updateComplete;
    expect(editor.shadowRoot!.querySelector('fieldset.scope .hint')?.textContent?.trim()).toBe(
      'Edits here are written for Grid and apply when the card shows it.',
    );
    document.body.replaceChildren();
  });

  it('draws the preview in the layout being edited, on the overview and on every page', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'month',
    });
    expect(previewed(editor)).toBeUndefined();
    expect(line(editor)).toBeUndefined();

    await pick(editor, 'grid');
    expect(previewed(editor)).toBe('grid');
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    // The eye leads the line and is no part of its words.
    expect(
      editor.shadowRoot!.querySelector('.scope-preview > svg.icon')?.getAttribute('aria-hidden'),
    ).toBe('true');
    await goPage(editor, 'events');
    expect(previewed(editor)).toBe('grid');
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    // A page for the whole card and a calendar's page draw no Settings For, but say it all the same.
    await goPage(editor, 'card_header');
    expect(editor.shadowRoot!.querySelector('.scope-compact')).toBeNull();
    expect(previewed(editor)).toBe('grid');
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    // Search results take Settings For's place on the overview, and the line stays above them.
    await goOverview(editor);
    await changeField(editor, 'filter:search', 'color');
    expect(editor.shadowRoot!.querySelector('.scope-compact')).toBeNull();
    expect(line(editor)).toBe('Preview shows Grid · The card opens in Month');
    await changeField(editor, 'filter:search', '');

    // All Layouts previews the card as it opens, with every layout's own values.
    await goOverview(editor);
    await pick(editor, 'shared');
    expect(previewed(editor)).toBeUndefined();
    expect(line(editor)).toBeUndefined();
    await pick(editor, 'month');
    expect(previewed(editor)).toBeUndefined();
    expect(line(editor)).toBeUndefined();
    // Choosing a scope writes nothing and makes no undo step.
    expect(lastConfig(editor)).toBeUndefined();
    expect((editor as unknown as { _history: { canUndo: boolean } })._history.canUndo).toBe(false);
    document.body.replaceChildren();
  });

  it('lets What This Card Changes preview the layout of the line edited there', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'list',
      time_grid: { end_time: '21:00' },
    });
    await pick(editor, 'column');
    await goOverview(editor);
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="more:audit"]')!.click();
    await editor.updateComplete;
    // Nothing edited there: the card as it opens.
    expect(previewed(editor)).toBeUndefined();
    const row = `[data-focus="${CSS.escape('more:audit:time_grid.end_time')}"]`;
    editor.shadowRoot!.querySelector<HTMLElement>(row)!.click();
    await editor.updateComplete;
    editor
      .shadowRoot!.querySelector<HTMLElement>(
        `[data-focus="${CSS.escape('strip:audit:time_grid.end_time:change')}"]`,
      )!
      .click();
    await editor.updateComplete;
    expect(previewed(editor)).toBe('grid');
    document.body.replaceChildren();
  });

  it('leaves the preview to Quick Setup while it is open', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'list',
    });
    await pick(editor, 'grid');
    expect(previewed(editor)).toBe('grid');
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="more:example"]')!.click();
    await editor.updateComplete;
    expect((editor as unknown as { _quickSetup?: unknown })._quickSetup).toBeDefined();
    expect(previewed(editor)).toBeUndefined();
    document.body.replaceChildren();
  });

  it('draws no Settings For on a calendar’s page, whose settings apply to every layout', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      view: 'grid',
      entities: ['calendar.anna'],
      column: { event_font_size: '13px' },
    });
    await goPage(editor, 'events');
    expect(editor.shadowRoot!.querySelector('.scope')).not.toBeNull();
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(editor.shadowRoot!.querySelector('.entry-page')).not.toBeNull();
    expect(editor.shadowRoot!.querySelector('.scope, .scope-preview')).toBeNull();
    document.body.replaceChildren();
  });

  // Both are one choice among a few words, drawn as segments of one frame (`styles.ts` ›
  // `.segment`). Settings For once sized each to its word; since Month it puts All Layouts on a
  // row of its own over the four layouts (`.segment-all`), one radio group in that order.
  it('draws Settings For as Calendar Filter’s segments, All Layouts over the layouts', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      column: { event_font_size: '13px' },
    });
    await goPage(editor, 'events');
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="scope-change"]')!.click();
    await editor.updateComplete;
    const path = (radio: Element) => {
      const classes: string[] = [];
      for (let el = radio.parentElement; el && el.localName !== 'fieldset'; el = el.parentElement) {
        classes.unshift(el.className);
      }
      return classes;
    };
    const scope = [...editor.shadowRoot!.querySelectorAll('fieldset.scope input[type="radio"]')];
    // Five since Month, derived from `WORKSPACES`, in the order the arrow keys take them: one
    // group of native radios, so one tab stop.
    expect(scope.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      'shared',
      'list',
      'column',
      'grid',
      'month',
    ]);
    expect(new Set(scope.map((radio) => (radio as HTMLInputElement).name))).toEqual(
      new Set(['scope']),
    );
    expect(scope.map(path)).toEqual([
      ['segmented-row', 'segments', 'segment segment-all'],
      ...scope.slice(1).map(() => ['segmented-row', 'segments', 'segment']),
    ]);
    expect(editor.shadowRoot!.querySelector('.scope-segments')).toBeNull();
    document.body.replaceChildren();

    const filter = await mountEditor({ toolbar: { show: true, legend: 'menu' } });
    await openPageOf(filter, 'card:toolbar.legend');
    const legend = filter.shadowRoot!.querySelector('fieldset.segmented input[type="radio"]')!;
    expect(path(legend)).toEqual(['segmented-row', 'segments', 'segment']);
    document.body.replaceChildren();
  });

  // One frame, two rows: All Layouts across the top and the four layouts under it, each a
  // quarter of the width. Native radios of one name, in that order, so the arrow keys run across
  // both rows and the group is one stop for Tab; the order and the name are pinned above, and how
  // the rows lay out is the stylesheet's, which a DOM without layout cannot show.
  // A hidden input's containing block must be its own control. An unpositioned segment left the
  // Settings For radio's to Home Assistant's dialog body, across the shadow boundary, and WebKit
  // scrolled that body to the radio whenever it took focus, preventScroll or not.
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
    // Calendar Filter keeps its one row.
    expect(css).not.toMatch(/\.segmented \.segments \{[^}]*flex-wrap/);
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
      month: { row_height: '120px', week_scroll: null },
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
  it('draws a row per layout: its radio, its picture, then its name over its description', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
    });
    const rows = [...editor.shadowRoot!.querySelectorAll('fieldset.displays label.display-choice')];
    expect(
      rows.map((row) =>
        [...row.children].map((child) =>
          child.localName === 'input'
            ? `radio ${(child as HTMLInputElement).value}${(child as HTMLInputElement).checked ? ' checked' : ''}`
            : child.localName === 'img'
              ? 'picture'
              : [...child.children].map((line) => line.textContent?.trim()).join(' / '),
        ),
      ),
    ).toEqual([
      ['radio list', 'picture', 'List / Days stacked, one per row'],
      ['radio column', 'picture', 'Columns / Days side by side'],
      ['radio grid checked', 'picture', 'Grid / Days side by side on an hour axis'],
      ['radio month', 'picture', 'Month / A whole month, a row per week'],
    ]);
    // One group of native radios, so the arrow keys move from row to row and Tab stops once.
    const names = rows.map((row) => row.querySelector('input')!.name);
    expect(new Set(names)).toEqual(new Set(['view']));
    // The pictures are the switcher's own pictograms, and say nothing a name does not.
    expect(rows.every((row) => row.querySelector('img')!.getAttribute('alt') === '')).toBe(true);
  });

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
    expect(summaryOf(page('weather'), LIST_CARD, 'shared')).toBe('');
    expect(
      summaryOf(page('weather'), { ...LIST_CARD, weather: { entity: 'weather.home' } }, 'shared'),
    ).toBe('Weather Entity: weather.home · Show The Forecast: In the Day Header · Set: 1');
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
    // actions ("Reset").
    const toolbar = { ...LIST_CARD, toolbar: { show: true, reset: false, search: false } };
    expect(summaryOf(page('card_header'), toolbar, 'shared')).toMatch(
      /^Show Toolbar: On · Controls: 4 on · Set: 3$/,
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
    expect(summaryOf(page('grid'), raw, 'grid')).toMatch(/^First Hour: 07:00 · .* · Set: 1$/);
  });
});
