/**
 * A calendar's page across the card's layouts (backlog item 345). A calendar's options are stored
 * once and apply in every layout that reads them, so its page is built for the layouts the card
 * can show (`field-index.ts` › `entryViews`): an option some of them apply is drawn, and says which
 * do, "Only in List". Left to follow the card, an option takes each layout's own value, so Reset
 * names one value only where those layouts agree.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  type MountedEditor,
  chooseResult,
  factsOf,
  fakeHass,
  goEntry,
  keysOf,
  lineOf,
  mountEditor,
  resultRows,
  searchFor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

const STATES = {
  'calendar.anna': {
    entity_id: 'calendar.anna',
    state: 'off',
    attributes: { friendly_name: 'Anna' },
  },
};

/** A card that opens in Grid, switches to List and Month, and draws the forecast in List only. */
const SWITCHES = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  view: 'grid',
  toolbar: { show: true, view_switcher: true, view_switcher_layouts: ['list', 'grid', 'month'] },
  weather_entity: 'weather.forecast_home',
  list: { weather: { position: 'event' } },
  time_grid: { weather: { position: 'date' } },
};

/** The five calendar options limited by layout or by a layout's own setting. */
const LIMITED = [
  'calendar:compact_events_to_show',
  'calendar:split_multiday_events',
  'calendar:multiday_banners',
  'calendar:location_icon',
  'calendar:show_weather',
] as const;

afterEach(() => {
  document.body.replaceChildren();
});

async function annaOn(config: Record<string, unknown>, anna: Record<string, unknown> = {}) {
  const editor = await mountEditor(
    { ...config, entities: [{ entity: 'calendar.anna', ...anna }] },
    { hass: fakeHass({ states: STATES }) },
  );
  await goEntry(editor, keysOf(editor, 'entry')[0]);
  return editor;
}

/** The "Only in …" fact a setting carries, if any. */
function onlyIn(editor: MountedEditor, id: string): string | undefined {
  return factsOf(editor, id as never).find((fact) => fact.startsWith('Only in '));
}

/** A setting's Reset, as its line of facts draws it. */
function resetLabel(editor: MountedEditor, id: string): string | undefined {
  return lineOf(editor, id as never)
    ?.querySelector(`[data-focus="reset:${id}"] .line-text`)
    ?.textContent?.trim();
}

describe('a calendar’s page across the card’s layouts', () => {
  it('draws what any of the card’s layouts applies, each saying where', async () => {
    const editor = await annaOn(SWITCHES);
    expect(editor.shadowRoot!.querySelector('.entry-page')).not.toBeNull();
    // Grid alone applies none of List's and hides locations; List and Month show them, and only
    // List draws the forecast beside events.
    expect(Object.fromEntries(LIMITED.map((id) => [id, onlyIn(editor, id)]))).toEqual({
      'calendar:compact_events_to_show': 'Only in List',
      'calendar:split_multiday_events': 'Only in List',
      'calendar:multiday_banners': 'Only in Grid and Month',
      'calendar:location_icon': 'Only in List and Month',
      'calendar:show_weather': 'Only in List',
    });
    // An option every layout applies says nothing of layouts.
    expect(onlyIn(editor, 'calendar:show_time')).toBeUndefined();
    expect(editor.shadowRoot!.querySelector('[data-setting="calendar:show_time"]')).not.toBeNull();
  });

  it('marks nothing on a card that can show one layout alone', async () => {
    const marks = (editor: MountedEditor) =>
      [...editor.shadowRoot!.querySelectorAll('.entry-page .fact')]
        .map((fact) => fact.textContent?.trim() ?? '')
        .filter((text) => text.startsWith('Only in '));
    const has = (editor: MountedEditor, id: string) =>
      editor.shadowRoot!.querySelector(`[data-setting="${id}"]`) !== null;
    // List alone: List's own options, not Grid's In the Time Grid.
    const list = await annaOn({ config_version: Config.CURRENT_CONFIG_VERSION, view: 'list' });
    expect(marks(list)).toEqual([]);
    expect(has(list, 'calendar:compact_events_to_show')).toBe(true);
    expect(has(list, 'calendar:multiday_banners')).toBe(false);
    // Grid alone, with no narrow fallback: Grid's own options, not List's.
    const grid = await annaOn({
      config_version: Config.CURRENT_CONFIG_VERSION,
      view: 'grid',
      time_grid: { min_days_fallback: 'cramp' },
    });
    expect(marks(grid)).toEqual([]);
    expect(has(grid, 'calendar:multiday_banners')).toBe(true);
    expect(has(grid, 'calendar:compact_events_to_show')).toBe(false);
    // A Grid card falls back to List on a narrow screen, so List is one of its layouts too.
    const fallsBack = await annaOn({ config_version: Config.CURRENT_CONFIG_VERSION, view: 'grid' });
    expect(onlyIn(fallsBack, 'calendar:compact_events_to_show')).toBe('Only in List');
    expect(onlyIn(fallsBack, 'calendar:multiday_banners')).toBe('Only in Grid');
  });

  it('waits on a condition no layout of the card meets, read in the layout it opens in', async () => {
    // Anna never shows locations, so no layout draws her location row.
    const editor = await annaOn(SWITCHES, { show_location: false });
    expect(editor.shadowRoot!.querySelector('[data-setting="calendar:location_icon"]')).toBeNull();
    const gated = editor.shadowRoot!.querySelector(
      '.setting-gated[data-field="calendar:location_icon"]',
    );
    expect(gated?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Location Icon Appears once this calendar shows locations.',
    );
  });

  it('goes back to following the card where its layouts differ, and names one value where not', async () => {
    // The card shows locations in List and Month and hides them in Grid, Grid's own default.
    const differs = await annaOn(SWITCHES, { show_location: false });
    expect(resetLabel(differs, 'calendar:show_location')).toBe('Reset (Follow the card)');
    // On a card that shows List alone, the card's one value.
    const alone = await annaOn(
      { config_version: Config.CURRENT_CONFIG_VERSION, view: 'list' },
      { show_location: false },
    );
    expect(resetLabel(alone, 'calendar:show_location')).toBe('Reset (Always show)');
  });

  it('adds the layout a result names for an option none of the card’s layouts applies', async () => {
    // Grid alone, with no narrow fallback to List.
    const editor = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        view: 'grid',
        time_grid: { min_days_fallback: 'cramp' },
        entities: ['calendar.anna'],
      },
      { hass: fakeHass({ states: STATES }) },
    );
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    const compact = '[data-setting="calendar:compact_events_to_show"]';
    expect(editor.shadowRoot!.querySelector(compact)).toBeNull();
    await searchFor(editor, 'compact');
    const hit = resultRows(editor).find((row) => row.id === 'calendar:compact_events_to_show')!;
    expect(hit.tag).toBe('Only in List');
    await chooseResult(editor, hit.key);
    expect(editor.shadowRoot!.querySelector(compact)).not.toBeNull();
    expect(onlyIn(editor, 'calendar:compact_events_to_show')).toBe('Only in List');
  });
});
