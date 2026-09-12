import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Filter from '../src/rendering/editor/filter';
import type { HaFormSchema, SelectorSchema } from '../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import { ENTITY_PATH } from '../src/rendering/editor/schemas/calendars';
import { group, heading, row, scope, text } from '../src/rendering/editor/schemas/common';
import {
  buildEntitySchema,
  entityConfigKeys,
  entitySchemaFor,
} from '../src/rendering/editor/schemas/entity';
import * as Grid from '../src/rendering/grid';
import * as List from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

customElements.define('editor-view-withholding-test', CalendarCardProEditor);

interface FormElement extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

interface Field {
  key: string;
  path: ReadonlyArray<string>;
  node: SelectorSchema;
}

/** Enumerates configuration paths, not the label paths walkSchema yields. */
function fields(schema: ReadonlyArray<HaFormSchema>, path: ReadonlyArray<string> = []): Field[] {
  return schema.flatMap((node): Field[] => {
    if ('schema' in node) {
      return fields(
        node.schema,
        node.name !== '' && node.flatten !== true ? [...path, node.name] : path,
      );
    }
    return 'selector' in node ? [{ key: [...path, node.name].join('.'), path, node }] : [];
  });
}

/**
 * 🚨 Projects the view block the way the editor does, rather than handing the panels the
 * raw configuration. The two were the same thing while root was list's storage; with
 * `list:` registered they are not, and a parent control whose value has moved into the
 * block would be absent here and present in the rendered editor — reported as the panel
 * withholding a field it does not withhold.
 *
 * @param config - Raw configuration
 * @param view - View to project for
 * @returns A schema context matching the editor's own
 */
function context(config: Types.Config, view = config.view): SchemaCtx {
  return { config: ViewConfig.resolveEffectiveConfig(config, view), view, language: 'en' };
}

function configFor(view: Types.EffectiveView, enabled = true): Types.Config {
  return buildConfig({
    view,
    entities: [
      {
        entity: 'calendar.anna',
        label: 'Anna',
        label_type: 'text',
        accent_color: '#123456',
        show_location: true,
        compact_events_to_show: 2,
        split_multiday_events: false,
      },
    ],
    ...(enabled
      ? {
          compact_days_to_show: 2,
          compact_events_to_show: 3,
          compact_events_complete_days: true,
          show_empty_days: true,
          today_indicator: true,
          show_location: true,
          show_description: true,
          show_countdown: true,
          show_progress_bar: true,
          show_time: true,
          allday_badge: 'time',
          filter_duplicates: true,
          height: '360px',
          language: 'en',
          start_date: 'today+2',
        }
      : {}),
  });
}

/**
 * The oracle reads the recorded scopes directly, not the production predicate.
 * The complete built schema is its denominator, so a wrongly absent field is an
 * error even when it has no scope entry. editor-schema.test.ts pins the scope tables
 * independently; the empty-day reconciliation below checks a renderer-backed family.
 */
function expectedFields(
  schema: ReadonlyArray<HaFormSchema>,
  view: Types.EffectiveView,
  entity = false,
): Field[] {
  return fields(schema).filter(({ node, path }) => {
    const owner =
      path.length === 0
        ? view
        : path.length === 1 && !entity
          ? ViewConfig.VIEWS.find(
              (candidate) => ViewConfig.VIEW_BLOCKS[candidate]?.blockKey === path[0],
            )
          : undefined;
    if (owner === undefined) return true;

    const keys = entity ? entityConfigKeys(node.name) : [node.name];
    return keys.some((key) => {
      const scopes = entity
        ? { ...ViewConfig.VIEW_SCOPE, ...ViewConfig.ENTITY_VIEW_SCOPE }
        : ViewConfig.VIEW_SCOPE;
      return !Object.prototype.hasOwnProperty.call(scopes, key) || scopes[key].has(owner);
    });
  });
}

function reconcile(actual: Field[], expected: Field[]): void {
  const actualKeys = actual.map((field) => field.key);
  const expectedKeys = expected.map((field) => field.key);
  expect({
    wronglyAbsent: expectedKeys.filter((key) => !actualKeys.includes(key)),
    wronglyPresent: actualKeys.filter((key) => !expectedKeys.includes(key)),
  }).toEqual({ wronglyAbsent: [], wronglyPresent: [] });
  expect(actual).toEqual(expected);
}

async function mount(config: Types.Config, current = true): Promise<CalendarCardProEditor> {
  const editor = new CalendarCardProEditor();
  editor.hass = {
    states: {},
    locale: { language: 'en' },
    callApi: async () => [],
    callService: () => {},
  };
  const raw = { ...config };
  if (current) raw.config_version = Config.CURRENT_CONFIG_VERSION;
  else delete raw.config_version;
  editor.setConfig(raw);
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

function forms(editor: CalendarCardProEditor, selector = 'ha-form.panel-form'): FormElement[] {
  return Array.from(editor.shadowRoot!.querySelectorAll<FormElement>(selector));
}

function formOwning(editor: CalendarCardProEditor, key: string): FormElement {
  const found = forms(editor, 'ha-form.panel-form, ha-form.display-view-form').find((form) =>
    fields(form.schema).some((field) => field.key === key),
  );
  if (!found) throw new Error(`No rendered form owns ${key}`);
  return found;
}

async function change(
  editor: CalendarCardProEditor,
  form: FormElement,
  patch: Record<string, unknown>,
): Promise<void> {
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, ...patch } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('view withholding reconciles both directions', () => {
  it.each([false, true])('matches every built and rendered field, enabled=%s', async (enabled) => {
    for (const view of ViewConfig.VIEWS) {
      const config = configFor(view, enabled);
      const schemas = PANELS.map((panel) => panel.build(context(config)));
      const before = structuredClone(schemas);
      const raw = schemas.flat();
      const expected = expectedFields(raw, view);
      expect(fields(raw).length).toBeGreaterThan(50);
      expect(expected.length).toBeGreaterThan(50);

      reconcile(fields(Filter.withholdInertFields(raw, view)), expected);
      const editor = await mount(config);
      reconcile(
        forms(editor).flatMap((form) => fields(form.schema)),
        expected,
      );
      expect(schemas).toEqual(before);
    }
  });

  it('opens every condition needed to exercise all recorded scopes', () => {
    const encountered = new Set(
      ViewConfig.VIEWS.flatMap((view) =>
        PANELS.flatMap((panel) =>
          fields(panel.build(context(configFor(view)))).map((field) => field.key),
        ),
      ),
    );
    const scoped = Object.keys(ViewConfig.VIEW_SCOPE);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.filter((key) => !encountered.has(key))).toEqual([]);

    const raw = PANELS.flatMap((panel) => panel.build(context(configFor('grid'))));
    reconcile(fields(Filter.withholdInertFields(raw, 'grid')), expectedFields(raw, 'grid'));
  });

  it.each(['card', 'entity'] as const)('keeps unknown keys visible in %s forms', (target) => {
    const schema = [
      group('en', 'unknown_group', '', [
        row(text('future_option'), text('toString'), text('event_background_opacity')),
        text('compact_events_to_show'),
      ]),
    ];

    for (const view of ViewConfig.VIEWS) {
      const names = fields(Filter.withholdInertFields(schema, view, target)).map(
        (field) => field.key,
      );
      expect(names).toEqual([
        'future_option',
        'toString',
        'event_background_opacity',
        ...(view === 'list' ? ['compact_events_to_show'] : []),
      ]);
    }
  });

  it('distinguishes real data blocks from flattened label groups and unknown nesting', () => {
    const schema = [
      group('en', 'labels_only', '', [text('split_multiday_events')]),
      scope('column', [text('split_multiday_events')]),
      scope('time_grid', [text('split_multiday_events'), text('hour_height')]),
      scope('weather', [scope('date', [text('split_multiday_events')])]),
      scope('future_block', [text('split_multiday_events')]),
      group('en', 'compact_events_to_show', '', [text('event_background_opacity')]),
    ];

    expect(fields(Filter.withholdInertFields(schema, 'grid')).map((field) => field.key)).toEqual([
      'column.split_multiday_events',
      'time_grid.hour_height',
      'weather.date.split_multiday_events',
      'future_block.split_multiday_events',
      'event_background_opacity',
    ]);
  });

  it('removes empty nested groups and their headings without relabeling the next section', () => {
    const survivor = row(text('show_empty_days'), text('future_option'));
    const schema = [
      heading('removed_heading'),
      group('en', 'removed_group', '', [
        heading('nested_heading'),
        row(text('compact_days_to_show'), text('compact_events_to_show')),
      ]),
      heading('also_removed'),
      text('split_multiday_events'),
      heading('surviving_heading'),
      survivor,
    ];
    expect(Filter.withholdInertFields(schema, 'grid')).toEqual([
      heading('surviving_heading'),
      survivor,
    ]);
  });

  it('drops a panel emptied by withholding even without a search', async () => {
    const config = configFor('grid');
    const before = forms(await mount(config)).length;
    expect(before).toBeGreaterThan(1);
    const panel = PANELS.find((candidate) => candidate.id === 'card');
    if (!panel) throw new Error('Card panel not found');
    vi.spyOn(panel, 'build').mockReturnValue([
      heading('empty_heading'),
      text('compact_events_to_show'),
    ]);
    expect(forms(await mount(config))).toHaveLength(before - 1);
  });

  it('reconciles per-calendar forms, including the newly supported column split control', async () => {
    for (const view of ViewConfig.VIEWS) {
      const config = configFor(view);
      const raw = entitySchemaFor(
        buildEntitySchema(context(config)),
        'text',
        'custom',
        'custom',
        true,
        'custom',
      );
      const expected = expectedFields(raw, view, true);
      expect(fields(raw).length).toBeGreaterThan(10);
      reconcile(
        fields(
          Filter.filterEntitySchema(raw, config.entities[0], ENTITY_PATH, {
            ...context(config),
            criteria: Filter.NO_FILTER,
          }),
        ),
        expected,
      );
      const entityForms = forms(await mount(config), 'ha-form.entity-form');
      expect(entityForms).toHaveLength(1);
      reconcile(fields(entityForms[0].schema), expected);
    }
  });

  it('uses a calendar-specific verdict and keeps a derived control if any key is relevant', () => {
    vi.spyOn(ViewConfig, 'entityScopeFor').mockImplementation((key) =>
      key === 'split_multiday_events'
        ? new Set(['grid'])
        : key === 'label_type'
          ? new Set(['list'])
          : undefined,
    );
    const raw = [text('split_multiday_events'), text('label_type')];
    expect(fields(Filter.withholdInertFields(raw, 'grid', 'entity')).map((f) => f.key)).toEqual([
      'split_multiday_events',
      'label_type',
    ]);
    expect(fields(Filter.withholdInertFields(raw, 'column', 'entity')).map((f) => f.key)).toEqual([
      'label_type',
    ]);
    expect(fields(Filter.withholdInertFields(raw, 'grid')).map((f) => f.key)).toEqual([
      'label_type',
    ]);
  });
});

describe('withholding is not a search filter or a config edit', () => {
  const transitions = ViewConfig.VIEWS.flatMap((from) =>
    ViewConfig.VIEWS.filter((to) => from !== to).map((to) => ({ from, to })),
  );

  it.each(transitions)('reconciles the actual $from -> $to view change', async ({ from, to }) => {
    expect(transitions).toHaveLength(ViewConfig.VIEWS.length * (ViewConfig.VIEWS.length - 1));
    const config = configFor(from);
    const editor = await mount(config);
    const seen: Types.Config[] = [];
    editor.addEventListener('config-changed', (event) => {
      seen.push(
        buildConfig((event as CustomEvent<{ config: Partial<Types.Config> }>).detail.config),
      );
    });
    const before = PANELS.flatMap((panel) => panel.build(context(config)));
    reconcile(
      forms(editor).flatMap((form) => fields(form.schema)),
      expectedFields(before, from),
    );

    await change(editor, formOwning(editor, 'view'), { view: to });
    expect(seen).toHaveLength(1);
    expect(seen[0].view).toBe(to);
    const after = PANELS.flatMap((panel) => panel.build(context(seen[0])));
    reconcile(
      forms(editor).flatMap((form) => fields(form.schema)),
      expectedFields(after, to),
    );
  });

  it('cannot be bypassed by panel, group, field, or customized-only searches', async () => {
    const config = configFor('grid');
    const editor = await mount(config);
    const search = forms(editor, 'ha-form.filter-form')[0];
    expect(forms(editor).length).toBeGreaterThan(1);

    for (const criteria of [
      { search: '', customized_only: false },
      { search: 'Time Range & Content', customized_only: false },
      { search: 'content', customized_only: false },
      { search: 'compact', customized_only: false },
      { search: 'Multi-Day Events', customized_only: false },
      { search: 'empty_day_text', customized_only: false },
      { search: 'Anna', customized_only: false },
      { search: '', customized_only: true },
    ]) {
      await change(editor, search, criteria);
      for (const form of forms(
        editor,
        'ha-form.panel-form, ha-form.entity-form, ha-form.exception-form',
      )) {
        const actual = fields(form.schema);
        reconcile(
          actual,
          expectedFields(form.schema, 'grid', form.classList.contains('entity-form')),
        );
      }
      if (criteria.search === 'content') {
        expect(
          forms(editor)
            .flatMap((form) => fields(form.schema))
            .map((f) => f.key),
        ).toContain('show_empty_days');
      }
    }
  });

  it('preserves hidden root, calendar, and block values through edits and a view round trip', async () => {
    // Split because the v5 migration relocates list-only keys into `list:` on save, on a
    // grid card as much as a list one — they are inert outside list either way. The
    // empty-day pair is scoped `column,list`, so it is not list-only and stays at root.
    const hiddenRoot = {
      empty_day_text: 'No plans',
      empty_day_color: '#607d8b',
    };
    const hiddenList = {
      compact_days_to_show: 2,
      compact_events_to_show: 3,
      compact_events_complete_days: true,
    };
    const config = buildConfig({
      ...configFor('grid'),
      ...hiddenRoot,
      ...hiddenList,
      time_grid: { split_multiday_events: true, empty_day_text: 'Grid placeholder' },
    });
    const editor = await mount(config, false);
    const seen: Record<string, unknown>[] = [];
    editor.addEventListener('config-changed', (event) => {
      seen.push((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config);
    });

    expect(
      forms(editor)
        .flatMap((form) => fields(form.schema))
        .map((f) => f.key),
    ).not.toContain('empty_day_color');
    expect(
      forms(editor, 'ha-form.entity-form')
        .flatMap((form) => fields(form.schema))
        .map((f) => f.key),
    ).not.toContain('split_multiday_events');

    await change(editor, formOwning(editor, 'days_to_show'), { days_to_show: 7 });
    await change(editor, forms(editor, 'ha-form.entity-form')[0], { label: 'Ben' });
    await change(editor, formOwning(editor, 'view'), { view: 'list' });
    expect(formOwning(editor, 'empty_day_color').data.empty_day_color).toBe('#607d8b');
    await change(editor, formOwning(editor, 'view'), { view: 'grid' });

    expect(seen).toHaveLength(4);
    for (const saved of seen) {
      expect(saved).toMatchObject(hiddenRoot);
      expect(saved.list).toMatchObject(hiddenList);
      expect(saved.time_grid).toMatchObject({
        split_multiday_events: true,
        empty_day_text: 'Grid placeholder',
      });
      expect(saved.entities).toEqual([
        expect.objectContaining({ compact_events_to_show: 2, split_multiday_events: false }),
      ]);
    }
    expect(seen[3].days_to_show).toBe(7);
    expect(seen[3].entities).toEqual([expect.objectContaining({ label: 'Ben' })]);
    expect(
      forms(editor)
        .flatMap((form) => fields(form.schema))
        .map((f) => f.key),
    ).not.toContain('empty_day_color');
  });
});

describe('empty-day reachability is reconciled across the config partition', () => {
  const families = ViewConfig.VIEWS.map((view) => {
    const keys = (show: boolean) => {
      const config = buildConfig({
        ...configFor(view),
        show_empty_days: show,
        column: { show_empty_days: show },
        time_grid: { show_empty_days: show },
      });
      return PANELS.flatMap((panel) => fields(panel.build(context(config)))).map((f) => f.key);
    };
    const off = keys(false);
    return keys(true)
      .filter((key) => !off.includes(key))
      .sort();
  });
  const family = families[0];
  const unscoped = family.filter(
    (key) => !Object.prototype.hasOwnProperty.call(ViewConfig.VIEW_SCOPE, key),
  );
  const wrongScope = family.filter(
    (key) =>
      ViewConfig.VIEW_SCOPE[key] !== undefined &&
      [...ViewConfig.VIEW_SCOPE[key]].sort().join(',') !== 'column,list',
  );
  const overrideKeys = new Set<string>(ViewConfig.COLUMN_OVERRIDE_KEYS);
  const routable = family.filter((key) => overrideKeys.has(key));

  it(`reconciles ${family.length} derived controls: ${routable.length} routable, ${
    family.length - routable.length
  } card-level, ${unscoped.length} unscoped, ${wrongScope.length} incorrect scopes`, () => {
    expect(family.length).toBeGreaterThan(0);
    expect(family).toEqual(expect.arrayContaining(['empty_day_text', 'empty_day_color']));
    for (const keys of families) expect(keys).toEqual(family);
    // Was `toBeLessThan(family.length)`, which pinned the split rather than the rule: the
    // family is exactly `empty_day_text` and `empty_day_color`, and only the first was in
    // `COLUMN_OVERRIDE_KEYS`, so "fewer routable than derived" was a restatement of the
    // asymmetry. Both are routable as of v5.0.0 — the whole family the placeholder row
    // derives is reachable from the Column workspace, which is the property worth pinning.
    expect(routable).toEqual(family);
    expect({ unscoped, wrongScope }).toEqual({ unscoped: [], wrongScope: [] });
  });

  it('backs those verdicts with real placeholder rows in list and column, but not grid', () => {
    for (const view of ViewConfig.VIEWS) {
      const config = buildConfig({
        view,
        entities: ['calendar.anna'],
        days_to_show: 3,
        show_empty_days: true,
        empty_day_text: 'No plans',
        empty_day_color: '#607d8b',
      });
      const days = EventUtils.groupEventsByDay([], config, false, 'en', view);
      expect(days).toHaveLength(3);
      expect(days.every((day) => day.events.some((event) => event._isEmptyDay))).toBe(true);
      const effective = ViewConfig.resolveEffectiveConfig(config, view);
      const renderer = {
        list: List.renderGroupedEvents,
        column: Column.renderColumnGroupedEvents,
        grid: Grid.renderGridGroupedEvents,
      }[view];
      const container = document.createElement('div');
      litRender(renderer(days, effective, 'en'), container);
      expect(container.querySelectorAll('.event').length).toBe(view === 'grid' ? 0 : 3);
      expect(container.textContent?.includes('No plans')).toBe(view !== 'grid');

      const raw = PANELS.flatMap((panel) => panel.build(context(config)));
      const offered = fields(Filter.withholdInertFields(raw, view)).map((field) => field.key);
      expect(offered).toContain('show_empty_days');
      expect(offered.includes('empty_day_text')).toBe(view !== 'grid');
      expect(offered.includes('empty_day_color')).toBe(view !== 'grid');

      if (view === 'grid') {
        expect(container.querySelectorAll('.grid-day-body')).toHaveLength(3);
        const realEvent: Types.CalendarEventData = {
          summary: 'Planning',
          start: { date: '2026-06-17' },
          end: { date: '2026-06-18' },
          _entityId: 'calendar.anna',
        };
        const realDays = EventUtils.groupEventsByDay([realEvent], config, false, 'en', view);
        const control = document.createElement('div');
        litRender(renderer(realDays, effective, 'en'), control);
        expect(control.querySelectorAll('.grid-banner')).toHaveLength(1);
        expect(control.textContent).toContain('Planning');

        // Generated placeholders have equal endpoints, so banner geometry rejects
        // them even if both _isEmptyDay guards are removed. A valid positive span
        // isolates the stamp from that independent rejection.
        const markedDays = realDays.map((day) => ({
          ...day,
          events: day.events.map((event) => ({ ...event, _isEmptyDay: true })),
        }));
        const marked = document.createElement('div');
        litRender(renderer(markedDays, effective, 'en'), marked);
        expect(marked.querySelectorAll('.grid-day-body')).toHaveLength(3);
        expect(marked.querySelectorAll('.grid-banner')).toHaveLength(0);
        expect(marked.textContent).not.toContain('Planning');
      }
    }
  });
});
