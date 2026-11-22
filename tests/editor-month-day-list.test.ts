/**
 * What Month's pages say about the settings Month reads in a day's list and the panel "+N more"
 * opens alone, and what Layout Defaults says about the ones Month does not read at all.
 *
 * Month's weeks draw an event's title and start time at their own sizes, and its bars a title and
 * a length; a day's list and the panel draw List's rows, with a title, a time, a location and a
 * forecast (`ViewConfig.MONTH_PINNED` keeps the rest at their shipped values). So a setting that
 * styles one of those row parts acts on Month, but nowhere a user looking at the weeks would see
 * it, and Month's pages say "Day List & Day Panel" under it. Which settings those are is
 * `plan.ts` › `MONTH_DAY_LIST_OPTIONS`, measured by rendering each against Month's value in both
 * forms. The fields marked are pinned here by value, over the whole gate corpus, and reconciled
 * against what Month's pages offer, so a table entry Month's pages stop offering fails, and so does
 * a new field marked by accident.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  editLayout,
  factsOf,
  lastConfig,
  mountEditor,
  openPageOf,
  resultRows,
  searchFor,
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
  MONTH_WIDE_ONLY_ENTRY_OPTIONS,
  MONTH_WIDE_ONLY_OPTIONS,
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

describe('Day List & Day Panel on Month’s pages', () => {
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
      text: 'Day List & Day Panel',
    });
    // The control: the same field on List's pages, and on Layout Defaults.
    for (const workspace of ['list', 'shared'] as const) {
      expect(
        ids(drawn(workspace), (each, c) => stateOf(each, c)?.dayList === true),
        workspace,
      ).toEqual([]);
    }
  });

  /**
   * On Month's Size & Spacing page, Event Gap and Event Spacing sit under Day List & Day Panel,
   * which says what the marker would; elsewhere the marker is the only place that says it.
   */
  it('leaves it out under a heading that already says it, and nowhere else', async () => {
    const editor = await mountEditor({ entities: ['calendar.anna'], view: 'month' });
    await editLayout(editor, 'month');
    await openPageOf(editor, 'layout:event_gap');
    const heading = editor.shadowRoot!.querySelector(
      '.page-group[data-heading="heading_event_rows"]',
    );
    expect(heading?.textContent).toContain('Day List & Day Panel');
    expect(factsOf(editor, 'layout:event_gap')).not.toContain('Day List & Day Panel');
    expect(factsOf(editor, 'layout:event_spacing')).not.toContain('Day List & Day Panel');

    await openPageOf(editor, 'events:event_font_size');
    expect(factsOf(editor, 'events:event_font_size')).toContain('Day List & Day Panel');

    // Search names no heading, so its Edit Here keeps the marker.
    await searchFor(editor, 'event gap');
    expect(resultRows(editor).map((each) => each.id)).toContain('layout:event_gap');
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="edit-here"]')!.click();
    await editor.updateComplete;
    const found = editor.shadowRoot!.querySelectorAll(
      '.result--edit [data-field="layout:event_gap"] .setting-facts > .fact',
    );
    expect([...found].map((fact) => fact.textContent?.trim())).toContain('Day List & Day Panel');
    document.body.replaceChildren();
  });
});

describe('Wide Month on Month’s pages', () => {
  const month = drawn('month');

  it('marks exactly the settings Month reads in the Wide Month’s days alone', () => {
    expect(ids(month, (field, ctx) => stateOf(field, ctx)?.wideMonth === true)).toEqual([
      'calendar:multiday_banners',
      'content:multiday_banners',
      'day_header:month_color',
      'day_header:month_font_size',
      'day_header:show_month',
      'day_header:today_month_color',
      'day_header:weekend_month_color',
    ]);
    // A setting is marked one way at most.
    expect(
      ids(month, (field, ctx) => {
        const state = stateOf(field, ctx);
        return state?.wideMonth === true && state.dayList === true;
      }),
    ).toEqual([]);
  });

  it('names only options Month’s pages offer', () => {
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
    expect([...MONTH_WIDE_ONLY_OPTIONS].filter((path) => !card.has(path))).toEqual([]);
    expect([...MONTH_WIDE_ONLY_ENTRY_OPTIONS].filter((key) => !entry.has(key))).toEqual([]);
  });

  it('says it under the setting, and nowhere but on Month’s pages', async () => {
    const editor = await mountEditor({ entities: ['calendar.anna'], view: 'month' });
    await editLayout(editor, 'month');
    await openPageOf(editor, 'day_header:show_month');
    expect(factsOf(editor, 'day_header:show_month')).toContain('Wide Month');
    // The control: a date setting both forms draw.
    expect(factsOf(editor, 'day_header:day_font_size')).not.toContain('Wide Month');
    document.body.replaceChildren();
    for (const workspace of ['list', 'shared'] as const) {
      expect(
        ids(drawn(workspace), (each, c) => stateOf(each, c)?.wideMonth === true),
        workspace,
      ).toEqual([]);
    }
  });
});

describe('Month’s four names on its pages', () => {
  afterEach(() => document.body.replaceChildren());

  const titles = (editor: Awaited<ReturnType<typeof mountEditor>>) =>
    [...editor.shadowRoot!.querySelectorAll('.page-group > h3')].map((each) =>
      (each.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  it('titles Size & Spacing’s headings by the form they act on, in Month alone', async () => {
    const month = await mountEditor({ entities: ['calendar.anna'], view: 'month' });
    await editLayout(month, 'month');
    await openPageOf(month, 'layout:month.min_day_width');
    expect(titles(month)).toEqual([
      'Card Size & Spacing',
      'Narrow Month',
      'Day List & Day Panel',
      'Wide or Narrow Month',
    ]);
    const note = month.shadowRoot!.querySelector(
      '.page-group[data-heading="heading_card_size"]',
    )?.textContent;
    expect(note).toContain('Both forms.');
    document.body.replaceChildren();
    // The control: Columns keeps the titles every other layout reads.
    const columns = await mountEditor({ entities: ['calendar.anna'], view: 'column' });
    await editLayout(columns, 'column');
    await openPageOf(columns, 'layout:column.min_day_width');
    expect(titles(columns)).toContain('Narrow Cards');
    expect(titles(columns)).toContain('Event Rows');
    expect(
      columns.shadowRoot!.querySelector('.page-group[data-heading="heading_card_size"]')
        ?.textContent,
    ).not.toContain('Both forms.');
  });

  it('names the forecast’s place in its heading, and leaves the mark out under it', async () => {
    const config = {
      entities: ['calendar.anna'],
      view: 'month',
      weather_entity: 'weather.home',
      month: { weather: { position: 'event' } },
    };
    const editor = await mountEditor(config);
    await editLayout(editor, 'month');
    await openPageOf(editor, 'weather:weather.event.font_size');
    expect(titles(editor)).toEqual(['Forecast', 'Day List & Day Panel']);
    expect(factsOf(editor, 'weather:weather.event.font_size')).not.toContain(
      'Day List & Day Panel',
    );
    // Above it, where no heading says so, the mark stays.
    expect(factsOf(editor, 'weather:weather_entity')).toContain('Day List & Day Panel');
  });

  it('names the forms, the Day List and the Day Panel once, on Month’s page', async () => {
    const lines = async (view: string) => {
      const editor = await mountEditor({ entities: ['calendar.anna'], view });
      editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="layout:${view}"]`)!.click();
      await editor.updateComplete;
      const found = [...editor.shadowRoot!.querySelectorAll('.page-line')].map((each) =>
        (each.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      document.body.replaceChildren();
      return found;
    };
    const month = (await lines('month')).find((line) => line.startsWith('Month draws one of'));
    for (const name of ['Wide Month', 'Narrow Month', 'Day List', 'Day Panel']) {
      expect(month).toContain(name);
    }
    expect((await lines('list')).some((line) => line.startsWith('Month draws one of'))).toBe(false);
  });

  it('finds a marked setting by its mark’s words, in Month alone', async () => {
    const found = async (view: string, query: string) => {
      const editor = await mountEditor({ entities: ['calendar.anna'], view });
      await editLayout(editor, view);
      await searchFor(editor, query);
      const rows = resultRows(editor).map((each) => each.id);
      document.body.replaceChildren();
      return rows;
    };
    expect(await found('month', 'day panel')).toContain('events:event_font_size');
    expect(await found('month', 'wide month')).toContain('content:multiday_banners');
    // The control: List draws no Day Panel and no Wide Month.
    expect(await found('list', 'day panel')).not.toContain('events:event_font_size');
    expect(await found('list', 'wide month')).not.toContain('content:multiday_banners');
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
      'layout:day_spacing',
      'layout:height',
      'layout:max_height',
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
      await editLayout(editor, workspace);
      await openPageOf(editor, 'events:event_font_size');
      const month = workspace === 'month';
      expect(
        factsOf(editor, 'events:event_font_size').includes('Day List & Day Panel'),
        workspace,
      ).toBe(month);
      expect(lines(editor).includes('Day List & Day Panel: Location.'), workspace).toBe(month);
      expect(
        lines(editor).some((line) =>
          line.startsWith('A mark under a setting says where Month draws it'),
        ),
        workspace,
      ).toBe(month);
      // The parts Month draws nowhere say so, as any layout's absent parts do.
      expect(
        lines(editor).includes('Not in Month: Description, Countdown, Progress Bar.'),
        workspace,
      ).toBe(month);
      // A setting acting on the weeks as well carries no such fact.
      expect(factsOf(editor, 'events:event_color')).not.toContain('Day List & Day Panel');
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
    await editLayout(editor, 'month');
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
    await editLayout(editor, 'shared');
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

  it('draws no Day List & Day Panel setting ahead of one the weeks read, on any Month page', () => {
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
      await editLayout(editor, workspace);
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
