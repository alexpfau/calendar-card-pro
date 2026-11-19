/**
 * What Month's pages say about the settings Month reads in a day's list and the panel "+N more"
 * opens alone, and what Layout Defaults says about the ones Month does not read at all.
 *
 * Month's weeks draw an event's title and start time at their own sizes, and its bars a title and
 * a length; a day's list and the panel draw List's rows, with a title, a time, a location and a
 * forecast (`ViewConfig.MONTH_PINNED` keeps the rest at their shipped values). So a setting that
 * styles one of those row parts acts on Month, but nowhere a user looking at the weeks would see
 * it, and Month's pages say "Day List & Panel" under it. Which settings those are is
 * `plan.ts` › `MONTH_DAY_LIST_OPTIONS`, measured by rendering each against Month's value in both
 * forms. The fields marked are pinned here by value, over the whole gate corpus, and reconciled
 * against what Month's pages offer, so a table entry Month's pages stop offering fails, and so does
 * a new field marked by accident.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  factsOf,
  lastConfig,
  mountEditor,
  openPageOf,
  valueOf,
} from './helpers/editor-host';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import {
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchema,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import { ENTRY_GROUPS, type HeadingDef, topicsFor } from '../src/rendering/editor/pages';
import {
  MONTH_DAY_LIST_ENTRY_OPTIONS,
  MONTH_DAY_LIST_OPTIONS,
  type PlanCtx,
  fieldsInDrawOrder,
  readsInMonthDayListOnly,
  stateOf,
  storedAt,
} from '../src/rendering/editor/plan';
import { reset } from '../src/rendering/editor/reset';
import { stateFacts } from '../src/rendering/editor/shown';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { deriveSyntheticData } from '../src/rendering/editor/synthetic';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';
import * as EntityColors from '../src/utils/entity-colors';

/**
 * A plan context for a corpus state, as the editor would hold it.
 *
 * @param config - The state's configuration
 * @param workspace - Workspace
 * @param present - The index its page draws from
 * @returns The context
 */
function ctxFor(
  config: Types.Config,
  workspace: EditorWorkspace,
  present: FieldIndex,
  entry?: number,
): PlanCtx {
  return {
    workspace,
    config,
    raw: config as unknown as Record<string, unknown>,
    present,
    universe: universeIndex('en', workspace),
    added: new Set(),
    showEverySetting: true,
    entryKeys: (config.entities ?? []).map((_, at) => at),
    ...(entry === undefined ? {} : { entry }),
  };
}

/** Every field a workspace draws over the corpus, with the context it was drawn in. */
function drawn(workspace: EditorWorkspace): Array<readonly [IndexedField, PlanCtx]> {
  const fields: Array<readonly [IndexedField, PlanCtx]> = [];
  for (const state of corpus()) {
    if (state.workspace !== workspace) continue;
    const ctx = schemaCtx(state.config, workspace, 'en');
    const present = buildFieldIndex(ctx);
    const card = ctxFor(state.config, workspace, present);
    for (const field of present.fields.values()) fields.push([field, card]);
    const first = state.config.entities?.[0];
    if (first === undefined) continue;
    const entries = entityFieldIndex(entrySchema(first, ctx));
    const own = ctxFor(state.config, workspace, entries, 0);
    for (const field of entries.fields.values()) fields.push([field, own]);
  }
  return fields;
}

/** The ids, once each, sorted, of the drawn fields a test keeps. */
const ids = (
  fields: ReadonlyArray<readonly [IndexedField, PlanCtx]>,
  keep: (field: IndexedField, ctx: PlanCtx) => boolean,
): string[] => [...new Set(fields.filter(([f, c]) => keep(f, c)).map(([f]) => f.id))].sort();

describe('Day List & Panel on Month’s pages', () => {
  const month = drawn('month');

  it('marks exactly the settings Month reads in a day’s list and the panel alone', () => {
    expect(ids(month, (field, ctx) => stateOf(field, ctx)?.dayList === true)).toEqual([
      'calendar:location_icon',
      'calendar:show_location',
      'calendar:show_weather',
      'events:event_font_size',
      'events:location_color',
      'events:location_country_mode',
      'events:location_country_pattern',
      'events:location_font_size',
      'events:location_icon_size',
      'events:scroll_long_titles',
      'events:show_location',
      'events:show_location_allday',
      'events:show_single_allday_time',
      'events:time_font_size',
      'layout:event_gap',
      'layout:event_spacing',
      'weather:weather.event.color',
      'weather:weather.event.daily_forecast_fallback',
      'weather:weather.event.font_size',
      'weather:weather.event.icon_size',
      'weather:weather.event.show_conditions',
      'weather:weather.event.show_temp',
      'weather:weather.event.show_uv_index',
      'weather:weather.event.uv_index_threshold',
      'weather:weather.position',
      'weather:weather_entity',
    ]);
  });

  it('names only options Month’s pages offer, and that Month reads', () => {
    // A stale entry would mark nothing and say nothing; reconcile each against a drawn field.
    const card = new Set(
      month
        .filter(([field]) => !field.id.startsWith('calendar:'))
        .flatMap(([field]) => field.configKeys.map((key) => [...field.dataPath, key].join('.'))),
    );
    const entry = new Set(
      month
        .filter(([field]) => field.id.startsWith('calendar:'))
        .flatMap(([field]) => field.configKeys),
    );
    expect([...MONTH_DAY_LIST_OPTIONS].filter((path) => !card.has(path))).toEqual([]);
    expect([...MONTH_DAY_LIST_ENTRY_OPTIONS].filter((key) => !entry.has(key))).toEqual([]);
    for (const path of MONTH_DAY_LIST_OPTIONS) {
      if (!path.includes('.'))
        expect([path, ViewConfig.appliesToView(path, 'month')]).toEqual([path, true]);
    }
  });

  it('says it under the setting, and nowhere but on Month’s pages', () => {
    const [field, ctx] = month.find(([each]) => each.id === 'events:show_location')!;
    const t = (key: string) => EDITOR_STRINGS[key] ?? key;
    expect(stateFacts(stateOf(field, ctx), t, String, String)).toContainEqual({
      kind: 'layout',
      view: 'month',
      text: 'Day List & Panel',
    });
    // The control: the same field on List's pages, and on Layout Defaults.
    for (const workspace of ['list', 'shared'] as const) {
      expect(
        ids(drawn(workspace), (each, c) => stateOf(each, c)?.dayList === true),
        workspace,
      ).toEqual([]);
    }
  });
});

describe('Layout Defaults, for a setting Month does not read', () => {
  it('says "Not in Month" under exactly these', () => {
    const shared = drawn('shared');
    expect(
      ids(shared, (field, ctx) => stateOf(field, ctx)?.notIn?.includes('month') === true),
    ).toEqual([
      'content:days_to_show',
      'content:empty_day_color',
      'content:empty_day_text',
      'content:show_empty_days',
      'content:show_empty_today',
      'content:split_multiday_events',
      'day_header:past_date_scale',
      'day_header:today_date_scale',
      'day_header:today_indicator_size',
      'day_header:today_weekday_color',
      'day_header:week_number_background_color',
      'events:allday_badge_color',
      'events:allday_badge_color_mode',
      'events:allday_badge_position',
      'events:allday_badge_style',
      'events:countdown_exact_days',
      'events:countdown_max_days',
      'events:countdown_once_per_day',
      'events:description_color',
      'events:description_font_size',
      'events:description_icon_size',
      'events:description_max_lines',
      'events:event_icon_vertical_alignment',
      'events:location_max_lines',
      'events:progress_bar_color',
      'events:progress_bar_height',
      'events:progress_bar_width',
      'events:show_countdown',
      'events:show_countdown_allday',
      'events:show_description',
      'events:show_description_allday',
      'events:show_multiday_allday_time',
      'events:show_progress_bar',
      'events:time_icon_size',
      'events:time_max_lines',
      'events:time_position',
      'events:title_max_lines',
      'layout:card_height',
      'layout:card_max_height',
      'layout:day_spacing',
      'layout:height_mode',
      'separators:day_separator_color',
      'separators:day_separator_width',
      'separators:month_separator_color',
      'separators:month_separator_width',
      'separators:week_separator_color',
      'separators:week_separator_width',
    ]);
  });

  it('names every layout the value does not reach, Grid as well', () => {
    const shared = drawn('shared');
    const notIn = (id: string) => {
      const [field, ctx] = shared.find(([each]) => each.id === id)!;
      return stateOf(field, ctx)?.notIn;
    };
    expect(notIn('content:split_multiday_events')).toEqual(['grid', 'month']);
    expect(notIn('events:show_location')).toBeUndefined();
  });
});

describe('Month’s pages offer what Month draws', () => {
  it('governs only the colors Month draws with Accent Text, and derives it from them', () => {
    const month = { ...DEFAULT_CONFIG, view: 'month' } as Types.Config;
    const sentinel = EntityColors.ACCENT_TEXT_SENTINEL;
    const on = { ...month, event_color: sentinel, time_color: sentinel, location_color: sentinel };
    // Month resolves the description and progress bar colors to their shipped values, so the
    // switch would never read on if it asked them.
    const resolved = ViewConfig.resolveEffectiveConfig(on, 'month');
    expect(deriveSyntheticData(resolved, {}, 'month').accent_event_text).toBe(true);
    expect(deriveSyntheticData(resolved, {}).accent_event_text).toBe(false);
  });

  it('offers the tile and none for today, and reads any other style as none', () => {
    const index = (config: Partial<Types.Config>, workspace: EditorWorkspace) =>
      buildFieldIndex(schemaCtx({ ...DEFAULT_CONFIG, ...config } as Types.Config, workspace, 'en'))
        .fields;
    const options = (fields: ReturnType<typeof index>) => {
      const node = fields.get('day_header:today_indicator_style')!.node;
      return 'select' in node.selector
        ? (node.selector.select?.options ?? []).map((option) =>
            typeof option === 'string' ? option : option.value,
          )
        : [];
    };
    expect(options(index({}, 'month'))).toEqual(['none', 'tile']);
    expect(options(index({}, 'list'))).toEqual([
      'none',
      'tile',
      'dot',
      'pulse',
      'glow',
      'icon',
      'custom',
    ]);
    for (const indicator of ['dot', 'mdi:star', '/local/star.png']) {
      const fields = index({ today_indicator: indicator }, 'month');
      expect(
        [...fields.keys()].filter((id) => id.startsWith('day_header:today_indicator')),
      ).toEqual(['day_header:today_indicator_style']);
    }
  });

  it('offers no line limit for the forecast beside an event', () => {
    const weather = (workspace: EditorWorkspace) =>
      [
        ...buildFieldIndex(
          schemaCtx(
            {
              ...DEFAULT_CONFIG,
              weather_entity: 'weather.home',
              [workspace === 'month' ? 'month' : 'list']: {
                weather: { position: 'event', event: { show_conditions: true } },
              },
            } as Types.Config,
            workspace,
            'en',
          ),
        ).fields.keys(),
      ].filter((id) => id.startsWith('weather:weather.event.'));
    expect(weather('month')).not.toContain('weather:weather.event.max_lines');
    expect(weather('list')).toContain('weather:weather.event.max_lines');
  });
});

describe('Accent Text on Month’s page', () => {
  afterEach(() => document.body.replaceChildren());

  it('marks them on Month’s Event Appearance page, chips and all, and on no other layout’s', async () => {
    const lines = (editor: Awaited<ReturnType<typeof mountEditor>>) =>
      [...editor.shadowRoot!.querySelectorAll('.page-line, p.hint')].map((each) =>
        (each.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
    for (const workspace of ['month', 'list'] as const) {
      const editor = await mountEditor({ entities: ['calendar.anna'], view: workspace });
      await changeField(editor, 'workspace:editing_workspace', workspace);
      await openPageOf(editor, 'events:event_font_size');
      const month = workspace === 'month';
      expect(
        factsOf(editor, 'events:event_font_size').includes('Day List & Panel'),
        workspace,
      ).toBe(month);
      expect(lines(editor).includes('Day List & Panel: Location.'), workspace).toBe(month);
      expect(
        lines(editor).some((line) => line.startsWith('Month’s weeks draw each event’s title')),
        workspace,
      ).toBe(month);
      // The parts Month draws nowhere say so, as any layout's absent parts do.
      expect(
        lines(editor).includes('Not in Month: Description, Countdown, Progress Bar.'),
        workspace,
      ).toBe(month);
      // A setting acting on the weeks as well carries no such fact.
      expect(factsOf(editor, 'events:event_color')).not.toContain('Day List & Panel');
      document.body.replaceChildren();
    }
  });

  it('reads and resets only the colors Month draws, never Layout Defaults’ others', () => {
    // Layout Defaults turned Accent Text on: all five at the top level, Month's block empty.
    const sentinel = EntityColors.ACCENT_TEXT_SENTINEL;
    const raw = {
      view: 'month',
      entities: ['calendar.anna'],
      event_color: sentinel,
      time_color: sentinel,
      location_color: sentinel,
      description_color: sentinel,
      progress_bar_color: sentinel,
      month: { event_color: sentinel },
    };
    const config = { ...DEFAULT_CONFIG, ...raw } as unknown as Types.Config;
    const ctx = ctxFor(config, 'month', buildFieldIndex(schemaCtx(config, 'month', 'en')));
    const field = ctx.present.fields.get('events:accent_event_text')!;
    expect(field.configKeys).toEqual(['event_color', 'time_color', 'location_color']);
    expect(storedAt(raw, field, 'month')).toBe(true);
    // Reset on Month's page clears Month's block and leaves the top level, which List reads, alone.
    const after = reset(
      {
        config,
        pending: {},
        authoredRootKeys: new Set(Object.keys(raw)),
        gridResetKeys: new Set(),
        entryKeys: [0],
        buttonKeys: [],
      },
      { kind: 'field', field, workspace: 'month' },
    ).state.config;
    expect(after.month).toBeUndefined();
    for (const key of ['description_color', 'progress_bar_color', 'event_color'] as const) {
      expect([key, after[key]]).toEqual([key, sentinel]);
    }
  });

  it('writes the colors Month draws into its block, and none at the top level', async () => {
    const editor = await mountEditor({ entities: ['calendar.anna'], view: 'month' });
    await changeField(editor, 'workspace:editing_workspace', 'month');
    await changeField(editor, 'events:accent_event_text', true);
    const sentinel = EntityColors.ACCENT_TEXT_SENTINEL;
    const stored = lastConfig(editor)!;
    expect(stored.month).toEqual({
      event_color: sentinel,
      time_color: sentinel,
      location_color: sentinel,
    });
    for (const key of ['event_color', 'time_color', 'location_color', 'description_color']) {
      expect([key, key in stored]).toEqual([key, false]);
    }
    expect('progress_bar_color' in stored).toBe(false);
    expect(valueOf(editor, 'events:accent_event_text')).toBe(true);

    await changeField(editor, 'events:accent_event_text', false);
    expect(lastConfig(editor)!.month).toBeUndefined();
  });

  it('writes all five at the top level from Layout Defaults', async () => {
    const editor = await mountEditor({ entities: ['calendar.anna'], view: 'month' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await changeField(editor, 'events:accent_event_text', true);
    const stored = lastConfig(editor)!;
    for (const key of [
      'event_color',
      'time_color',
      'location_color',
      'description_color',
      'progress_bar_color',
    ]) {
      expect([key, stored[key]]).toEqual([key, EntityColors.ACCENT_TEXT_SENTINEL]);
    }
  });
});

describe('the order of Month’s pages', () => {
  afterEach(() => document.body.replaceChildren());

  /** Each heading of every page a workspace offers, with the fields a corpus state builds there. */
  function headingsOver(
    workspace: EditorWorkspace,
  ): Array<{ heading: HeadingDef; present: ReadonlyMap<string, IndexedField> }> {
    const out: Array<{ heading: HeadingDef; present: ReadonlyMap<string, IndexedField> }> = [];
    for (const state of corpus()) {
      if (state.workspace !== workspace) continue;
      const ctx = schemaCtx(state.config, workspace, 'en');
      const card = buildFieldIndex(ctx).fields;
      for (const page of topicsFor(workspace)) {
        for (const heading of page.headings) out.push({ heading, present: card });
      }
      const first = state.config.entities?.[0];
      if (first === undefined) continue;
      const own = entityFieldIndex(entrySchema(first, ctx)).fields;
      for (const heading of ENTRY_GROUPS) out.push({ heading, present: own });
    }
    return out;
  }

  it('draws no Day List & Panel setting ahead of one the weeks read, on any Month page', () => {
    let headings = 0;
    let reordered = 0;
    for (const { heading, present } of headingsOver('month')) {
      const drawn = fieldsInDrawOrder(heading, 'month', present).map(([id]) => id);
      const late = (id: string): boolean => {
        const field = present.get(id);
        return field !== undefined && readsInMonthDayListOnly(field);
      };
      const first = drawn.findIndex(late);
      expect(first < 0 || drawn.slice(first).every(late), drawn.join(', ')).toBe(true);
      expect([...drawn].sort()).toEqual(heading.fields.map(([id]) => id).sort());
      headings += 1;
      if (drawn.join() !== heading.fields.map(([id]) => id).join()) reordered += 1;
    }
    expect(headings).toBeGreaterThan(100);
    expect(reordered).toBeGreaterThan(0);
  });

  it('leaves every other scope in the registry’s order', () => {
    for (const workspace of WORKSPACES.filter((each) => each !== 'month')) {
      const over = headingsOver(workspace);
      expect(over.length, workspace).toBeGreaterThan(0);
      for (const { heading, present } of over) {
        expect(fieldsInDrawOrder(heading, workspace, present), workspace).toBe(heading.fields);
      }
    }
  });

  it('puts the weeks’ settings first on Month’s Event Appearance, and leaves List’s as it was', async () => {
    const drawn = async (workspace: 'month' | 'list'): Promise<string[]> => {
      const editor = await mountEditor({ entities: ['calendar.anna'], view: workspace });
      await changeField(editor, 'workspace:editing_workspace', workspace);
      await openPageOf(editor, 'events:event_font_size');
      return [...editor.shadowRoot!.querySelectorAll('[data-field]')].map(
        (each) => each.getAttribute('data-field') ?? '',
      );
    };
    const among = (ids: string[], keep: ReadonlyArray<string>): string[] =>
      ids.filter((id) => keep.includes(id));
    const CHIPS = [
      'events:show_time',
      'events:show_end_time',
      'events:show_location',
      'events:show_duration',
      'events:show_now_indicator',
    ];
    const TITLE = [
      'layout:month.cell_event_font_size',
      'events:event_font_size',
      'events:event_color',
      'events:scroll_long_titles',
    ];
    const TIME = [
      'events:show_single_allday_time',
      'events:time_two_digit_hours',
      'events:time_font_size',
      'layout:month.cell_time_font_size',
      'events:time_color',
    ];
    const month = await drawn('month');
    expect(among(month, CHIPS)).toEqual([
      'events:show_time',
      'events:show_end_time',
      'events:show_duration',
      'events:show_now_indicator',
      'events:show_location',
    ]);
    expect(among(month, TITLE)).toEqual([
      'layout:month.cell_event_font_size',
      'events:event_color',
      'events:event_font_size',
      'events:scroll_long_titles',
    ]);
    expect(among(month, TIME)).toEqual([
      'events:time_two_digit_hours',
      'layout:month.cell_time_font_size',
      'events:time_color',
      'events:show_single_allday_time',
      'events:time_font_size',
    ]);
    // The control: List draws the registry's order, which places these for every layout.
    const list = await drawn('list');
    expect(among(list, CHIPS)).toEqual(CHIPS);
    expect(among(list, TITLE)).toEqual([
      'events:event_font_size',
      'events:event_color',
      'events:scroll_long_titles',
    ]);
    expect(among(list, TIME)).toEqual([
      'events:show_single_allday_time',
      'events:time_two_digit_hours',
      'events:time_font_size',
      'events:time_color',
    ]);
  });
});
