/**
 * An editor write keeps every option the YAML already holds unless that write changed it.
 *
 * Minimizing on write removes a line equal to its default, which keeps a fresh card's YAML
 * short. Applied to a line the person wrote, it is a rewrite they did not ask for: nothing
 * renders differently today, but the card stops being pinned against a later change of that
 * default. It is sharpest on the upgrade prompt, where answering a question about what the
 * top-level values mean used to drop `show_month: true`, a `column:` default or a calendar
 * action alongside it, and on a layered card's first edit, which dropped `time_grid:` lines.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  editLayout,
  mountEditor,
  openPanels,
  reportsOf,
  resetButton,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { valueSource } from '../src/rendering/editor/routing';
import {
  storedViewBlocks,
  stripColumnDefaults,
  stripMonthDefaults,
  stripTimeGridDefaults,
  toStoredConfig,
} from '../src/rendering/editor/value';

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<unknown>;
}

async function mount(config: Record<string, unknown>) {
  const editor = await mountEditor(structuredClone(config));
  // A closed panel mounts no form: open every panel, as these tests read forms across the editor.
  await openPanels(editor);
  // What it reported since it was created: an upgrade on opening is the first.
  return { editor, reports: reportsOf(editor) };
}

/**
 * The upgrade's answer: List, as the editor writes on opening, or every layout, through the
 * receipt's Use Them for Every Layout.
 *
 * @param editor - Editor
 * @param choice - The answer
 */
async function choose(editor: EditorHost, choice: 'keep-list' | 'shared-root'): Promise<void> {
  if (choice === 'shared-root') {
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="upgrade-share"]')!.click();
    await editor.updateComplete;
  }
  await openPanels(editor);
}

function merged(config: Record<string, unknown>): Types.Config {
  return { ...Config.DEFAULT_CONFIG, ...config } as Types.Config;
}

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * A v4 card whose `event_font_size` asks the upgrade question, and which spells out a
 * default in every place the editor minimizes: the top level, a calendar action, `column:`,
 * a nested `weather:` group and `toolbar:`.
 */
const V4_CARD = {
  entities: ['calendar.anna'],
  view: 'list',
  title: 'Family',
  event_font_size: '18px',
  show_location: true,
  show_month: true,
  days_to_show: 3,
  tap_action: { action: 'none' },
  column: { min_days_fallback: 'list', min_day_width: 140 },
  weather: { entity: 'weather.home', date: { show_high_temp: true } },
  toolbar: { show: false },
};

/**
 * {@link V4_CARD}'s weather as each layout that drew it takes it on the upgrade, the default it
 * spells out kept, and the `date` position it defaulted to written out.
 */
const LAYOUT_WEATHER = { position: 'date', date: { show_high_temp: true } };

/** Everything in {@link V4_CARD} that neither answer moves. */
const UNMOVED = {
  entities: ['calendar.anna'],
  view: 'list',
  title: 'Family',
  show_month: true,
  days_to_show: 3,
  tap_action: { action: 'none' },
  column: { min_days_fallback: 'list', min_day_width: 140, weather: LAYOUT_WEATHER },
  weather_entity: 'weather.home',
  time_grid: { weather: LAYOUT_WEATHER },
  toolbar: { show: false },
};

const ANSWERS = {
  'keep-list': {
    ...UNMOVED,
    list: { event_font_size: '18px', show_location: true, weather: LAYOUT_WEATHER },
    config_version: Config.CURRENT_CONFIG_VERSION,
  },
  'shared-root': {
    ...UNMOVED,
    event_font_size: '18px',
    show_location: true,
    list: { weather: LAYOUT_WEATHER },
    config_version: Config.CURRENT_CONFIG_VERSION,
  },
} as const;

describe('the upgrade on opening', () => {
  it('writes the List answer when the editor is only opened', async () => {
    const { editor, reports } = await mount(V4_CARD);

    expect(editor.shadowRoot!.querySelector('[data-config-migration]')).toBeNull();
    expect(editor.shadowRoot!.querySelector('[data-upgrade-receipt]')).not.toBeNull();
    expect(reports).toEqual([ANSWERS['keep-list']]);
  });

  it.each(Object.keys(ANSWERS) as Array<keyof typeof ANSWERS>)(
    'keeps every default the YAML spells out when answering %s',
    async (answer) => {
      const { editor, reports } = await mount(V4_CARD);

      await choose(editor, answer);

      expect(reports.slice(-1)).toEqual([ANSWERS[answer]]);
    },
  );

  it.each(Object.keys(ANSWERS) as Array<keyof typeof ANSWERS>)(
    'still keeps them after a later, unrelated edit (%s)',
    async (answer) => {
      const { editor, reports } = await mount(V4_CARD);

      await choose(editor, answer);
      await changeField(editor, 'card:title', 'Family calendar');

      expect(reports.slice(-1)[0]).toEqual({ ...ANSWERS[answer], title: 'Family calendar' });
    },
  );
});

describe('adopting a layered card on its first edit', () => {
  it('keeps `time_grid:` lines equal to their default or to what they inherit', async () => {
    const card = {
      entities: ['calendar.anna'],
      view: 'grid',
      show_month: true,
      time_grid: {
        slot_minutes: 60,
        start_time: '07:00',
        days_to_show: 3,
        event_font_size: '12px',
      },
    };
    const { editor, reports } = await mount(card);
    expect(reports).toEqual([]);

    await changeField(editor, 'card:title', 'Grid');

    expect(reports).toEqual([
      { ...card, title: 'Grid', config_version: Config.CURRENT_CONFIG_VERSION },
    ]);
  });
});

describe('what an edit still removes', () => {
  it('minimizes an option the edit itself returns to its default', async () => {
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      show_month: true,
    });

    // All Layouts writes the top level; List would write `list:`, which keeps every value.
    await editLayout(editor, 'shared');
    expect(reports).toEqual([]);

    await changeField(editor, 'day_header:show_month', false);
    expect(reports.slice(-1)[0]).toHaveProperty('show_month', false);

    await changeField(editor, 'day_header:show_month', true);
    expect(reports.slice(-1)[0]).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
  });

  it('still prunes options the card no longer reads, unchanged or not', async () => {
    const { editor, reports } = await mount({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      row_spacing: '5px',
      show_month: true,
    });

    await changeField(editor, 'card:title', 'Pruned');

    expect(reports).toEqual([
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        show_month: true,
        title: 'Pruned',
      },
    ]);
  });
});

describe('a kept view value is the view’s own', () => {
  const card = {
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    view: 'grid',
    time_grid: { days_to_show: 3 },
  };

  it('is labeled as set for the layout and offers its reset', async () => {
    expect(valueSource(merged(card), 'grid', 'days_to_show')).toBe('own');

    const { editor, reports } = await mount(card);
    const reset = await resetButton(editor, 'days_to_show');
    expect(reset).not.toBeNull();

    reset!.click();
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: Config.CURRENT_CONFIG_VERSION, entities: ['calendar.anna'], view: 'grid' },
    ]);
    expect(await resetButton(editor, 'days_to_show')).toBeNull();
    expect(valueSource(merged(reports[0]), 'grid', 'days_to_show')).toBe('inherited');
  });

  it('reads every view block as its own baseline, and nothing else', () => {
    const config = merged({
      show_month: true,
      list: { show_month: true },
      column: { min_day_width: 140 },
      time_grid: { slot_minutes: 60 },
    });

    expect(storedViewBlocks(config)).toEqual({
      list: { show_month: true },
      column: { min_day_width: 140 },
      time_grid: { slot_minutes: 60 },
    });
  });
});

describe('the serializer’s authored baseline', () => {
  it('keeps a held value as written and drops the same value written fresh', () => {
    const config = merged({ time_grid: { slot_minutes: '60' }, column: { min_day_width: '140' } });

    expect(stripTimeGridDefaults(config)).toBeUndefined();
    expect(stripTimeGridDefaults(config, { slot_minutes: '60' })).toEqual({ slot_minutes: '60' });
    expect(stripTimeGridDefaults(config, { slot_minutes: 30 })).toBeUndefined();

    expect(stripColumnDefaults(config)).toBeUndefined();
    expect(stripColumnDefaults(config, { min_day_width: '140' })).toEqual({
      min_day_width: '140',
    });

    // Month's block by the same rule, and a bare length written fresh is stored as the card
    // reads it.
    const month = merged({ month: { min_day_width: '80', cell_event_font_size: 15 } });
    expect(stripMonthDefaults(month)).toEqual({ cell_event_font_size: '15px' });
    expect(stripMonthDefaults(month, { min_day_width: '80' })).toEqual({
      min_day_width: '80',
      cell_event_font_size: '15px',
    });
  });

  /**
   * A rejected value resolves to the default too, so holding it is not enough: the card draws
   * the default, and the line goes on the next save, as it always did, and is never shown as
   * the layout's own.
   */
  it('still drops a held view value the card rejects for its default', () => {
    const grid = { slot_minutes: 45, overlap_layout: 'column' };
    const column = { min_day_width: 0, min_days_to_show: 'some' };
    const month = { min_day_width: 0, cell_event_font_size: 'big' };
    const config = merged({ days_to_show: 7, time_grid: grid, column, month });

    expect(stripTimeGridDefaults(config, grid)).toBeUndefined();
    expect(stripColumnDefaults(config, column)).toBeUndefined();
    expect(stripMonthDefaults(config, month)).toBeUndefined();
    expect(storedViewBlocks(config)).toEqual({});
  });

  it('keeps nothing that was not a setting or that the card no longer reads', () => {
    const authored = {
      show_week_numbers: null,
      past_event_opacity: 'half',
      max_events_to_show: 5,
    };

    expect(toStoredConfig(merged(authored), new Set(), authored)).toEqual({ entities: [] });
  });

  it('keeps a root line where the minimized one would have been', () => {
    const authored = { entities: ['calendar.anna'], title: 'Ordered', view: 'list' };
    const stored = toStoredConfig(merged(authored), new Set(), authored);

    // `view` comes before `title` in the defaults; appended, a kept `view` would follow it.
    expect(Object.keys(stored)).toEqual(['entities', 'view', 'title']);
  });
});
