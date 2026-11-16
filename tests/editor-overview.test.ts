/**
 * The overview: what Settings For shows (`workspace.ts` › `isCompactScope`, `storedCount`),
 * when Quick Setup's banner shows (`quick-setup.ts` › `isFreshCard`), and the line under each
 * section row (`summary.ts`).
 */

import { describe, expect, it } from 'vitest';

import { mountEditor } from './helpers/editor-host';
import { CURRENT_CONFIG_VERSION, DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { PAGES, type PageDef, placementOf } from '../src/rendering/editor/pages';
import { isFreshCard } from '../src/rendering/editor/quick-setup';
import { workspaceFormData } from '../src/rendering/editor/routing';
import { SUMMARY_SEPARATOR, pageStoredCount, summaryParts } from '../src/rendering/editor/summary';
import {
  type EditorWorkspace,
  WORKSPACES,
  isCompactScope,
  storedCount,
} from '../src/rendering/editor/workspace';

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
  it('stays compact on a List card whose edits land in list: and at the top level', () => {
    const raw = { ...LIST_CARD, title: 'Family', list: { day_spacing: '12px' } };
    expect(isCompactScope(raw, merged(raw), 'list', false)).toBe(true);
  });

  it('turns full once another layout stores a value in its block', () => {
    const raw = { ...LIST_CARD, column: { event_font_size: '13px' } };
    expect(isCompactScope(raw, merged(raw), 'list', false)).toBe(false);
  });

  it('stays compact when another layout’s block holds only blanks', () => {
    const raw = { ...LIST_CARD, column: { event_font_size: '' } };
    expect(isCompactScope(raw, merged(raw), 'list', false)).toBe(true);
  });

  it('turns full while the toolbar shows its View Switcher, and not while it is hidden', () => {
    const shown = { ...LIST_CARD, toolbar: { show: true } };
    expect(isCompactScope(shown, merged(shown), 'list', false)).toBe(false);
    const noSwitcher = { ...LIST_CARD, toolbar: { show: true, view_switcher: false } };
    expect(isCompactScope(noSwitcher, merged(noSwitcher), 'list', false)).toBe(true);
    const hidden = { ...LIST_CARD, toolbar: { show: false, view_switcher: true } };
    expect(isCompactScope(hidden, merged(hidden), 'list', false)).toBe(true);
  });

  // Plan section 5.10: the line shows whenever the scope is not the displayed layout, and a
  // value List keeps of its own is exactly what All Layouts cannot show in the preview.
  it('says the preview shows another layout in every scope but the displayed one', async () => {
    const editor = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      column: { event_font_size: '13px' },
    });
    const root = editor.shadowRoot!;
    const line = () =>
      root.querySelector('.scope-preview')?.textContent?.replace(/\s+/g, ' ').trim();
    const pick = async (workspace: EditorWorkspace) => {
      const radio = root.querySelector<HTMLInputElement>(`[data-focus="scope:${workspace}"]`)!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
      await editor.updateComplete;
    };
    expect(line()).toBeUndefined();
    await pick('shared');
    expect(line()).toBe('Editing All Layouts · Preview Shows List');
    await pick('grid');
    expect(line()).toBe('Editing Grid · Preview Shows List');
    // The eye leads the line, as the mockup draws it, and is no part of its words.
    expect(root.querySelector('.scope-preview > svg.icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    await pick('list');
    expect(line()).toBeUndefined();
    document.body.replaceChildren();
  });

  it('turns full for the session once the scope was changed or Change pressed', () => {
    expect(isCompactScope(LIST_CARD, merged(LIST_CARD), 'list', true)).toBe(false);
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
    };
    const counts = Object.fromEntries(
      WORKSPACES.map((workspace) => [workspace, storedCount(raw, workspace)]),
    );
    expect(counts).toEqual({ shared: 2, list: 1, column: 0, grid: 2 });
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
      'Show Past Events: On · Show Empty Days: Off · Set: 1',
    );
    // At the top level nothing on the page is stored, and List's own value is not shown there.
    expect(summaryOf(page('which_events'), raw, 'shared')).toBe(
      'Show Past Events: Off · Show Empty Days: Off',
    );
  });

  it('words a dropdown by its option label and leaves out a field not built here', () => {
    const raw = { ...LIST_CARD, title: 'Family' };
    expect(summaryOf(page('card_header'), raw, 'shared')).toBe(
      'Title: Family · Show Toolbar: Off · Set: 1',
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
    // The toolbar's controls only while the toolbar shows them.
    const toolbar = { ...LIST_CARD, toolbar: { show: true, reset: false, search: false } };
    expect(summaryOf(page('card_header'), toolbar, 'shared')).toMatch(
      /^Show Toolbar: On · Add Event · View Switcher · Refresh · Date Navigation · Set: 3$/,
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
