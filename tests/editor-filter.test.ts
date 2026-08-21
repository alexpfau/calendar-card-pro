import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  CUSTOMIZED_ONLY_FIELD,
  FILTER_SCHEMA,
  type FilterCriteria,
  type FilterCtx,
  NO_FILTER,
  SEARCH_FIELD,
  filterEntitySchema,
  filterSchema,
  hasFields,
  isCustomized,
  isFiltering,
  matchesPanel,
  matchesQuery,
  toFilterCriteria,
} from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { CHASSIS_STRINGS, chassisSubforms } from '../src/rendering/editor/subforms';

/**
 * Tests for the editor's search and "customized only" filter.
 *
 * Everything outside `element.ts` is free of Lit and of the DOM, so the filter is tested
 * the way it is written: as functions over schema, without rendering anything. The
 * handful of cases that are genuinely about the chassis — a panel disappearing, a filter
 * never reaching the configuration — mount the element and say so.
 *
 * **Every case sets the values it is about.** The suite is built from default config, so
 * an option left alone is indistinguishable from one the filter dropped, and a
 * "customized" test that changed nothing would pass against a predicate that always
 * returned `false`.
 */

/** A column-view config, since the default is a list and several branches need one. */
function columnConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ view: 'column', ...overrides });
}

/** Matching context for a configuration and a set of criteria. */
function ctxFor(config: Types.Config, criteria: Partial<FilterCriteria> = {}): FilterCtx {
  return {
    language: 'en',
    view: config.view === 'column' ? 'column' : 'list',
    config,
    criteria: { ...NO_FILTER, ...criteria },
  };
}

/** Every field a filtered schema would render, groups excluded. */
/**
 * Every setting a schema renders, headings excluded.
 *
 * A `constant` node is a section label, not a setting, so it is not a "field" for the
 * purposes of these assertions — every test here is about which *options* survive the
 * filter. Heading behaviour has its own test below, so excluding them here narrows what
 * each assertion is about rather than hiding anything.
 */
function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node) && !('type' in node && node.type === 'constant'))
    .map(({ node }) => node.name);
}

/** Section headings a schema renders, in order. */
function headingNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => 'type' in node && node.type === 'constant')
    .map(({ node }) => node.name);
}

/** Every field the whole editor would render for a configuration and criteria. */
function visibleFields(config: Types.Config, criteria: Partial<FilterCriteria> = {}): string[] {
  const ctx = ctxFor(config, criteria);
  const names: string[] = [];

  for (const panel of PANELS) {
    const built = panel.build({ view: ctx.view, config, language: 'en' });
    const whole = !ctx.criteria.customizedOnly && matchesPanel(panel, ctx);

    names.push(...fieldNames(whole ? built : filterSchema(built, ctx)));
  }

  return names;
}

/** One field of one panel, found by name, with the label path it sits under. */
function fieldOf(
  config: Types.Config,
  name: string,
): { node: HaFormSchema; path: ReadonlyArray<string> } {
  for (const panel of PANELS) {
    const built = panel.build({
      view: config.view === 'column' ? 'column' : 'list',
      config,
      language: 'en',
    });

    for (const found of walkSchema(built)) {
      if (found.node.name === name) return found;
    }
  }

  throw new Error(`no field named ${name}`);
}

describe('editor filter: what search matches', () => {
  /**
   * The requirement in one test. `min_day_width` reads *Minimum Day Width* on screen, so
   * a user who types what they can see has to find it; matching only the config key would
   * be asking them to know the YAML they opened the editor to avoid.
   */
  it('finds a field by the label the user is reading, not only by its key', () => {
    const config = columnConfig();

    expect(visibleFields(config, { query: 'width' })).toContain('min_day_width');
    expect(visibleFields(config, { query: 'Minimum Day' })).toContain('min_day_width');
  });

  it('finds a field by its config key, for the user who arrived from the docs', () => {
    expect(visibleFields(columnConfig(), { query: 'min_day_width' })).toContain('min_day_width');
  });

  it('finds a field by the labels of the options it offers', () => {
    // The word "ISO" appears nowhere but in the option list of the week-number control.
    expect(visibleFields(buildConfig(), { query: 'iso' })).toContain('week_number_mode');
  });

  it('finds a field by its helper text', () => {
    const config = buildConfig();
    const { node, path } = fieldOf(config, 'day_spacing');

    // "gutter" is in the helper and in no label.
    expect(matchesQuery(node, path, ctxFor(config, { query: 'gutter' }))).toBe(true);
  });

  it('ignores case and surrounding space', () => {
    const config = columnConfig();

    expect(visibleFields(config, { query: '  MINIMUM day  ' })).toContain('min_day_width');
  });

  it('shows everything when nothing is typed', () => {
    const config = columnConfig();

    expect(visibleFields(config, { query: '   ' })).toEqual(visibleFields(config));
    expect(isFiltering({ query: '  ', customizedOnly: false })).toBe(false);
  });

  it('finds nothing for a term that is in no label, helper, option or key', () => {
    expect(visibleFields(columnConfig(), { query: 'zzzznotathing' })).toEqual([]);
  });

  /**
   * A field the current configuration does not call for is not in the schema, so it
   * cannot be found — and must not be, because the control genuinely is not there. What
   * makes that honest rather than a dead end is the chassis saying so, which is the
   * message tested further down.
   */
  it('does not offer a field that is gated off by another option', () => {
    const off = buildConfig();
    const on = buildConfig({ compact_events_to_show: 3 });

    expect(visibleFields(off, { query: 'compact_events_complete_days' })).toEqual([]);
    expect(visibleFields(on, { query: 'compact_events_complete_days' })).toContain(
      'compact_events_complete_days',
    );
  });
});

describe('editor filter: groups and empty sections', () => {
  it('keeps a group whole when its own heading matches', () => {
    const config = columnConfig();
    const layout = PANELS.find((panel) => panel.id === 'layout')!;
    const built = layout.build({ view: 'column', config, language: 'en' });

    const whole = fieldNames(
      filterSchema(built, ctxFor(config, { query: 'Column Density' })),
    ).sort();
    const density = built.find((node) => 'schema' in node && node.name === 'column');
    const inside = fieldNames((density as { schema: ReadonlyArray<HaFormSchema> }).schema).sort();

    expect(whole).toEqual(inside);
  });

  it('drops a group whose children all filtered out', () => {
    const config = columnConfig();
    const layout = PANELS.find((panel) => panel.id === 'layout')!;
    const built = layout.build({ view: 'column', config, language: 'en' });

    const kept = filterSchema(built, ctxFor(config, { query: 'min_day_width' }));

    // The density group survives because one of its fields did; nothing else does, and
    // no group is left standing with an empty body.
    for (const { node } of walkSchema(kept)) {
      if (!('schema' in node)) continue;
      expect(fieldNames(node.schema).length).toBeGreaterThan(0);
    }

    expect(fieldNames(kept)).toEqual(['min_day_width']);
  });

  it('keeps a panel whole when its own heading matches', () => {
    const config = columnConfig();
    const layout = PANELS.find((panel) => panel.id === 'layout')!;
    // A word from the panel's own subheading and from no field in it.
    const ctx = ctxFor(config, { query: 'arranges' });

    expect(matchesPanel(layout, ctx)).toBe(true);

    // Nothing inside the panel matches, so without the panel-level rule the section
    // would vanish while its heading was the thing that answered the query.
    const built = layout.build({ view: 'column', config, language: 'en' });
    expect(fieldNames(filterSchema(built, ctx))).toEqual([]);
    expect(fieldNames(built).length).toBeGreaterThan(0);
  });

  it('does not keep a group whole under "customized only", however its heading reads', () => {
    const config = columnConfig();
    const layout = PANELS.find((panel) => panel.id === 'layout')!;
    const built = layout.build({ view: 'column', config, language: 'en' });

    const kept = filterSchema(
      built,
      ctxFor(config, { query: 'Column Density', customizedOnly: true }),
    );

    // Every density option is at its default, so the matching heading brings nothing
    // back with it.
    expect(fieldNames(kept)).toEqual([]);
  });
});

describe('editor filter: what counts as customized', () => {
  it('hides an option left at its default and keeps one that was changed', () => {
    expect(visibleFields(buildConfig(), { customizedOnly: true })).not.toContain('days_to_show');
    expect(visibleFields(buildConfig({ days_to_show: 7 }), { customizedOnly: true })).toContain(
      'days_to_show',
    );
  });

  /**
   * The editor is handed raw YAML — its `setConfig` is a plain merge, while the card
   * normalizes on every one of its own — so this is asked through `config.ts` rather than
   * with a bare comparison. A quoted `'3'` renders an identical card, and a `-1` is
   * discarded by the card in favour of the default; neither is a customization, and a
   * predicate that compared the raw values would report both as one.
   */
  it('reads a numeric option the way the card reads it', () => {
    const quoted = buildConfig({ days_to_show: '3' as unknown as number });
    const negative = buildConfig({ days_to_show: -1 });

    expect(visibleFields(quoted, { customizedOnly: true })).not.toContain('days_to_show');
    expect(visibleFields(negative, { customizedOnly: true })).not.toContain('days_to_show');

    // ...and the value the card would honour is still reported, quoted or not.
    const quotedSeven = buildConfig({ days_to_show: '7' as unknown as number });
    expect(visibleFields(quotedSeven, { customizedOnly: true })).toContain('days_to_show');
  });

  it('asks the write path about a value inside the column block', () => {
    const config = columnConfig();
    const { node, path } = fieldOf(config, 'min_day_width');

    expect(path).toEqual(['column']);

    const untouched = ctxFor(config, { customizedOnly: true });
    const redundant = ctxFor(columnConfig({ column: { min_day_width: 140 } }), {
      customizedOnly: true,
    });
    const real = ctxFor(columnConfig({ column: { min_day_width: 200 } }), { customizedOnly: true });

    expect(isCustomized(node, path, untouched)).toBe(false);
    // 140 is the column default, so writing it changes nothing and is not an override.
    expect(isCustomized(node, path, redundant)).toBe(false);
    expect(isCustomized(node, path, real)).toBe(true);
  });

  /**
   * `min_days_to_show` defaults to `days_to_show` rather than to a constant, so the only
   * honest test is whether removing the line changes what the card resolves. The write
   * path already answers that, which is why this asks it rather than re-deriving it.
   */
  it('handles an override whose default is another option', () => {
    const config = columnConfig({ days_to_show: 5, column: { min_days_to_show: 5 } });
    const { node, path } = fieldOf(config, 'min_days_to_show');

    expect(isCustomized(node, path, ctxFor(config, { customizedOnly: true }))).toBe(false);

    const lowered = columnConfig({ days_to_show: 5, column: { min_days_to_show: 2 } });
    expect(isCustomized(node, path, ctxFor(lowered, { customizedOnly: true }))).toBe(true);
  });

  /**
   * Column view starts `show_empty_days` from `true` whatever the top level says, so an
   * override repeating it is doing nothing even though the two values differ.
   */
  it('compares an override against what it would inherit, not against the top level', () => {
    const config = columnConfig({ show_empty_days: false, column: { show_empty_days: true } });
    const inBlock = { name: 'show_empty_days', selector: { boolean: {} } } as HaFormSchema;
    expect(isCustomized(inBlock, ['column'], ctxFor(config, { customizedOnly: true }))).toBe(false);

    const differing = columnConfig({ show_empty_days: true, column: { show_empty_days: false } });
    expect(isCustomized(inBlock, ['column'], ctxFor(differing, { customizedOnly: true }))).toBe(
      true,
    );
  });

  /**
   * A field inside a **flattened** group is stored at the top level even though Home
   * Assistant qualifies its label key with the group's name. The filter tracks the two
   * paths separately for exactly that reason; reading the label path would look for
   * `compact_mode.compact_events_to_show`, find nothing, and report every field in every
   * flattened group as untouched.
   */
  it('reads a flattened group\u2019s field at the top level, where it is stored', () => {
    expect(visibleFields(buildConfig(), { customizedOnly: true })).not.toContain(
      'compact_events_to_show',
    );
    expect(
      visibleFields(buildConfig({ compact_events_to_show: 3 }), { customizedOnly: true }),
    ).toContain('compact_events_to_show');
  });

  /**
   * A synthetic field has no config key of its own — `height_mode` is derived from
   * whether a height is set — so it is compared by what it derives from this
   * configuration against what it derives from the default one.
   */
  it('reports a synthetic field by what it derives', () => {
    expect(visibleFields(buildConfig(), { customizedOnly: true })).not.toContain('height_mode');
    expect(visibleFields(buildConfig({ height: '300px' }), { customizedOnly: true })).toContain(
      'height_mode',
    );
  });

  it('reads a value nested under the weather block', () => {
    const config = buildConfig({
      weather: { ...DEFAULT_CONFIG.weather, entity: 'weather.home', position: 'date' },
    });

    const node = { name: 'show_high_temp', selector: { boolean: {} } } as HaFormSchema;
    const path = ['weather', 'date'];

    expect(isCustomized(node, path, ctxFor(config, { customizedOnly: true }))).toBe(false);

    const changed = buildConfig({
      weather: {
        ...DEFAULT_CONFIG.weather,
        entity: 'weather.home',
        position: 'date',
        date: { ...DEFAULT_CONFIG.weather!.date, show_high_temp: false },
      },
    });

    expect(isCustomized(node, path, ctxFor(changed, { customizedOnly: true }))).toBe(true);
  });

  it('combines with the search text rather than replacing it', () => {
    const config = buildConfig({ days_to_show: 7, event_font_size: '20px' });

    const both = visibleFields(config, { query: 'days', customizedOnly: true });

    expect(both).toContain('days_to_show');
    expect(both).not.toContain('event_font_size');
  });
});

describe('editor filter: the per-calendar settings', () => {
  const ENTITY_PATH = ['entity'];

  function entitySchema(config: Types.Config): HaFormSchema[] {
    return buildEntitySchema({ view: 'list', config, language: 'en' });
  }

  it('shows only the options a calendar has actually set', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.a', color: '#ff0000' }, 'calendar.b'],
    });
    const schema = entitySchema(config);
    const ctx = ctxFor(config, { customizedOnly: true });

    const configured = filterEntitySchema(schema, config.entities[0], ENTITY_PATH, ctx);
    const untouched = filterEntitySchema(schema, config.entities[1], ENTITY_PATH, ctx);

    // `color` sits inside a grid row, so this also pins that the per-calendar filter
    // recurses rather than looking only at the top level of the schema.
    expect(fieldNames(configured)).toEqual(['color']);
    // Nothing left, so the chassis renders no panel for this calendar at all.
    expect(fieldNames(untouched)).toEqual([]);
  });

  /**
   * Presence, not value. Four of these options are tri-state — the card reads them
   * presence-first, so *absent* means "follow the card" — which makes `show_time: false`
   * a real setting rather than a default, and it has to survive the filter.
   */
  it('treats a tri-state option set to false as configured', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.a', show_time: false }] });
    const kept = filterEntitySchema(
      entitySchema(config),
      config.entities[0],
      ENTITY_PATH,
      ctxFor(config, { customizedOnly: true }),
    );

    expect(fieldNames(kept)).toEqual(['show_time']);
  });

  /**
   * The label's shape dropdown is derived from the label's value and stores nothing of
   * its own. Asked in its own name, "customized only" would therefore hide it while
   * leaving the label it names on screen — a control with no way back to *None*.
   */
  it('keeps the label shape dropdown wherever it keeps the label', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.a', label: 'mdi:home' }, 'calendar.b'],
    });
    const ctx = ctxFor(config, { customizedOnly: true });

    const configured = filterEntitySchema(
      entitySchemaFor(entitySchema(config), 'icon'),
      config.entities[0],
      ENTITY_PATH,
      ctx,
    );
    expect(fieldNames(configured)).toEqual(['label_type', 'label']);

    // A calendar with no label of its own keeps neither, so its panel drops out whole.
    const untouched = filterEntitySchema(
      entitySchemaFor(entitySchema(config), 'none'),
      config.entities[1],
      ENTITY_PATH,
      ctx,
    );
    expect(fieldNames(untouched)).toEqual([]);
  });

  it('finds the label shape by searching for the label', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.a', label: 'Work' }] });

    const kept = filterEntitySchema(
      entitySchemaFor(entitySchema(config), 'text'),
      config.entities[0],
      ENTITY_PATH,
      ctxFor(config, { query: 'label' }),
    );

    expect(fieldNames(kept)).toEqual(['label_type', 'label']);
  });

  it('keeps a calendar whole when the search names it', () => {
    const config = buildConfig({ entities: ['calendar.birthdays'] });
    const schema = entitySchema(config);

    const byId = filterEntitySchema(
      schema,
      config.entities[0],
      ENTITY_PATH,
      ctxFor(config, { query: 'birthdays' }),
    );

    expect(fieldNames(byId)).toEqual(fieldNames(schema));
  });

  it('filters a calendar down to the fields that match', () => {
    const config = buildConfig({ entities: ['calendar.a'] });

    const kept = filterEntitySchema(
      entitySchema(config),
      config.entities[0],
      ENTITY_PATH,
      ctxFor(config, { query: 'blocklist' }),
    );

    expect(fieldNames(kept)).toEqual(['blocklist']);
  });
});

describe('editor filter: the bar itself', () => {
  it('is a schema of selectors, so it names no new Home Assistant element', () => {
    expect(FILTER_SCHEMA.map((node) => node.name)).toEqual([SEARCH_FIELD, CUSTOMIZED_ONLY_FIELD]);

    for (const node of FILTER_SCHEMA) {
      expect(node).toHaveProperty('selector');
    }
  });

  it('is declared to the string check like every other schema in the editor', () => {
    const declared = chassisSubforms().flatMap((subform) =>
      subform.schema.map((node) => node.name),
    );

    expect(declared).toEqual([SEARCH_FIELD, CUSTOMIZED_ONLY_FIELD]);
    expect(CHASSIS_STRINGS).toContain('filter');
  });

  it('reads a change out of the form and ignores everything else in it', () => {
    expect(toFilterCriteria({ [SEARCH_FIELD]: 'width', days_to_show: 7 })).toEqual({
      query: 'width',
      customizedOnly: false,
    });

    expect(toFilterCriteria({ [CUSTOMIZED_ONLY_FIELD]: true })).toEqual({
      query: '',
      customizedOnly: true,
    });
  });
});

describe('editor filter: the chassis', () => {
  const TAG = 'test-calendar-card-pro-editor-filter';
  if (!customElements.get(TAG)) {
    customElements.define(TAG, class extends CalendarCardProEditor {});
  }

  async function mount(config: Partial<Types.Config>) {
    const element = document.createElement(TAG) as CalendarCardProEditor;
    element.hass = {} as Types.Hass;
    element.setConfig(config as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      dispatched.push((event as CustomEvent).detail.config);
    });

    const filterBy = async (patch: Record<string, unknown>) => {
      const form = element.shadowRoot!.querySelector('ha-form.filter-form')!;
      const data = (form as unknown as { data: Record<string, unknown> }).data;
      form.dispatchEvent(
        new CustomEvent('value-changed', { detail: { value: { ...data, ...patch } } }),
      );
      await element.updateComplete;
    };

    const panels = () =>
      [...element.shadowRoot!.querySelectorAll('ha-expansion-panel')].filter(
        (node) =>
          !node.classList.contains('entity-panel') && !node.classList.contains('exceptions'),
      );

    return { element, dispatched, filterBy, panels };
  }

  it('renders the filter bar above the panels', async () => {
    const { element } = await mount({ entities: ['calendar.a'] });

    expect(element.shadowRoot!.querySelectorAll('ha-form.filter-form')).toHaveLength(1);
  });

  it('collapses away the panels a search empties', async () => {
    const { filterBy, panels } = await mount({ entities: ['calendar.a'] });

    const before = panels().length;
    expect(before).toBe(PANELS.length);

    await filterBy({ [SEARCH_FIELD]: 'min_day_width' });

    // Column density is a Layout option, and the card is a list here — so nothing at all
    // matches and no panel is left holding an empty body.
    expect(panels().length).toBeLessThan(before);
  });

  /**
   * Nine collapsed headings would be a worse answer than none: the user asked where an
   * option is, and a closed panel replies only with which section it is in.
   */
  it('expands the panels that still have something to show', async () => {
    const { filterBy, panels } = await mount({ entities: ['calendar.a'] });

    expect(panels().every((panel) => (panel as unknown as { expanded: boolean }).expanded)).toBe(
      false,
    );

    await filterBy({ [SEARCH_FIELD]: 'week' });

    const shown = panels();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((panel) => (panel as unknown as { expanded: boolean }).expanded)).toBe(true);
  });

  it('says so when a search matches nothing', async () => {
    const { element, filterBy, panels } = await mount({ entities: ['calendar.a'] });

    await filterBy({ [SEARCH_FIELD]: 'zzzznotathing' });

    expect(panels()).toHaveLength(0);

    const empty = element.shadowRoot!.querySelector('.filter-empty');
    expect(empty?.textContent).toContain('zzzznotathing');
    // The reason a search can come up empty, which the user cannot otherwise see.
    expect(element.shadowRoot!.querySelector('.filter-empty-note')?.textContent).toBeTruthy();
  });

  it('says so when nothing has been customized', async () => {
    const { element, filterBy, panels } = await mount({ entities: [] });

    await filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });

    expect(panels()).toHaveLength(0);
    expect(element.shadowRoot!.querySelector('.filter-empty')?.textContent).toContain('customized');
  });

  it('shows the calendars a card has configured, and hides the ones it has not', async () => {
    const { element, filterBy } = await mount({
      entities: [{ entity: 'calendar.a', color: '#ff0000' }, 'calendar.b'],
    });

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.entity-panel')).toHaveLength(2);

    await filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.entity-panel')).toHaveLength(1);
  });

  it('hides the exceptions widget until there is an exception to show', async () => {
    const { element, filterBy } = await mount({ view: 'column', entities: ['calendar.a'] });

    expect(
      element.shadowRoot!.querySelectorAll('ha-expansion-panel.exceptions').length,
    ).toBeGreaterThan(0);

    await filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.exceptions')).toHaveLength(0);
  });

  /**
   * The other half of the rule, and the one that matters: an exception is a customization
   * by construction, so it survives the filter that hides everything at a default —
   * including before its value has been changed from the one it inherits.
   */
  it('keeps the exceptions a card has declared', async () => {
    const { element, filterBy } = await mount({
      view: 'column',
      entities: ['calendar.a'],
      column: { event_font_size: '22px' },
    } as Partial<Types.Config>);

    await filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.exceptions')).toHaveLength(1);
    expect(element.shadowRoot!.querySelectorAll('ha-form.exception-form')).toHaveLength(1);
  });

  /**
   * The filter is editor state and nothing else. A search term reaching the write path
   * would be a config key nobody asked for, in a file the user has to live with.
   */
  it('never reports a configuration change of its own', async () => {
    const { dispatched, filterBy } = await mount({ entities: ['calendar.a'] });

    await filterBy({ [SEARCH_FIELD]: 'width' });
    await filterBy({ [CUSTOMIZED_ONLY_FIELD]: true });
    await filterBy({ [SEARCH_FIELD]: '' });

    expect(dispatched).toEqual([]);
  });

  /**
   * `ha-form` hands back the whole data object it was given, filtered schema or not, so
   * an edit made while a search is active still writes exactly what an unfiltered one
   * would. Worth pinning: the opposite would be silent, and it would be data loss.
   */
  it('writes the same configuration for an edit made while filtered', async () => {
    const { element, dispatched, filterBy } = await mount({
      entities: ['calendar.a'],
      days_to_show: 7,
    });

    await filterBy({ [SEARCH_FIELD]: 'days_to_show' });

    const form = element.shadowRoot!.querySelector('ha-form.panel-form')!;
    const data = (form as unknown as { data: Record<string, unknown> }).data;
    form.dispatchEvent(
      new CustomEvent('value-changed', { detail: { value: { ...data, days_to_show: 10 } } }),
    );
    await element.updateComplete;

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({ entities: ['calendar.a'], days_to_show: 10 });
  });
});

/**
 * Section headings under the filter.
 *
 * A heading is a claim about the fields beneath it, which makes it the one node type that
 * can be actively misleading when the filter runs. Two failure modes, and neither is
 * visible to a test that only counts fields:
 *
 *  - A heading matching the *query* on its own text. "When There Is Nothing To Show"
 *    contains "nothing", so searching that word would return the heading alone, captioning
 *    an empty section.
 *  - A heading whose fields were all filtered out, left stranded above whatever section
 *    happens to follow — so it silently relabels someone else's options.
 *
 * Both are prevented the same way: headings never match, they ride along with their
 * section, and one whose section came back empty is pruned.
 */
describe('editor filter: section headings', () => {
  const entitySchema = () =>
    buildEntitySchema({ view: 'list' as const, config: buildConfig(), language: 'en' });

  it('renders its headings when nothing is filtered (denominator)', () => {
    // Without this, every assertion below could pass against a schema that has no
    // headings at all.
    expect(headingNames(entitySchema())).toEqual([
      'heading_appearance',
      'heading_filters',
      'heading_multiday',
      'heading_details',
    ]);
  });

  it('never returns a heading as a search hit of its own', () => {
    // Isolated deliberately. The real content group cannot express this case: searching
    // "nothing" *does* legitimately return `heading_nothing`, because `hide_when_empty`'s
    // helper reads "...while it has nothing to show" and so matches too — the heading is
    // then correctly kept for the field beneath it. A hand-built schema is the only way to
    // present a heading whose text matches while nothing under it does.
    const schema: HaFormSchema[] = [
      { name: 'heading_nothing', type: 'constant' },
      { name: 'days_to_show', selector: { number: { min: 1 } } },
    ];

    const ctx = ctxFor(buildConfig(), { query: 'nothing' });

    // The denominator: the heading's own text really does contain the query, so a filter
    // that matched on it would keep it.
    expect(matchesQuery(schema[0], [], ctx)).toBe(true);
    expect(matchesQuery(schema[1], [], ctx)).toBe(false);

    expect(filterSchema(schema, ctx)).toEqual([]);
  });

  it('keeps a heading when a field under it matches, even if the heading does not', () => {
    // The other direction, and the common one: the heading is not itself a hit but must
    // survive to caption the field that is.
    const schema: HaFormSchema[] = [
      { name: 'heading_filters', type: 'constant' },
      { name: 'days_to_show', selector: { number: { min: 1 } } },
    ];

    const ctx = ctxFor(buildConfig(), { query: 'days to show' });

    expect(matchesQuery(schema[0], [], ctx)).toBe(false);
    expect(fieldNames(filterSchema(schema, ctx))).toEqual(['days_to_show']);
    expect(headingNames(filterSchema(schema, ctx))).toEqual(['heading_filters']);
  });

  it('keeps a heading whose section still has an option, and drops the rest', () => {
    // "colour" reaches the appearance fields and nothing else, so exactly one heading
    // should survive — the one that still has something under it.
    const entry = { entity: 'calendar.a' };
    const ctx = ctxFor(buildConfig({ entities: [entry] }), { query: 'accent' });
    const filtered = filterEntitySchema(entitySchema(), entry, ['entity'], ctx);

    expect(fieldNames(filtered).length).toBeGreaterThan(0);
    expect(headingNames(filtered)).toEqual(['heading_appearance']);
  });

  it('does not count a heading as a field when deciding a panel is empty', () => {
    // `hasFields` gates whether a panel renders at all. Counting a heading as content
    // would show a panel containing nothing but section labels.
    expect(hasFields([{ name: 'heading_filters', type: 'constant' }])).toBe(false);
    expect(
      hasFields([
        { name: 'heading_filters', type: 'constant' },
        { name: 'days_to_show', selector: { number: { min: 1 } } },
      ]),
    ).toBe(true);
  });
});

/**
 * The field and heading order of the two panels, pinned.
 *
 * Order was incidental until this change and nothing asserted it: reordering both panels
 * passed the entire suite. It is now *designed* — the two panels share a spine, which
 * users see and which the source comments explain — so it needs a gate, or the next
 * refactor silently undoes the thing the reorder was for.
 *
 * Pinned by value, in full, rather than by walking. A test that iterates the schema and
 * checks something about each node cannot notice a node leaving, and cannot see order at
 * all; `toEqual` on the whole sequence fails on a move, a drop and an unexplained
 * addition alike.
 */
describe('editor: the order of the two panels', () => {
  const entitySchema = () =>
    buildEntitySchema({ view: 'list' as const, config: buildConfig(), language: 'en' });

  const contentSchema = () =>
    PANELS.find((p) => p.id === 'content')!.build({
      view: 'list',
      config: buildConfig({ show_empty_days: true }),
      language: 'en',
    });

  /** Headings and fields together, in render order, so a field crossing a heading fails. */
  const sequence = (schema: ReadonlyArray<HaFormSchema>): string[] =>
    [...walkSchema(schema)]
      .filter(({ node }) => !('schema' in node))
      .map(({ node }) =>
        'type' in node && node.type === 'constant' ? `# ${node.name}` : node.name,
      );

  it('pins the per-calendar panel', () => {
    expect(sequence(entitySchema())).toEqual([
      '# heading_appearance',
      'label_type',
      'label',
      'label_icon_color',
      'color',
      'accent_color_mode',
      'accent_color',
      '# heading_filters',
      'days_of_week',
      'event_type',
      'allday_expires_at',
      'filter_field',
      'blocklist',
      'allowlist',
      'compact_events_to_show',
      '# heading_multiday',
      'split_multiday_events',
      '# heading_details',
      'show_time',
      'show_location',
      'location_icon',
      'show_description',
    ]);
  });

  it('pins the card-level content group', () => {
    // Sequenced from the group's own schema, not sliced out of the panel: a slice to the
    // end swept in the locale group that follows.
    const group = [...walkSchema(contentSchema())].find(
      ({ node }) => 'schema' in node && node.name === 'content',
    );

    expect(group, 'the content group is gone').toBeDefined();

    expect(sequence((group!.node as { schema: ReadonlyArray<HaFormSchema> }).schema)).toEqual([
      '# heading_filters',
      'event_type',
      'show_past_events',
      'filter_duplicates',
      '# heading_multiday',
      'split_multiday_events',
      '# heading_nothing',
      'show_empty_days',
      'empty_day_text',
      'empty_day_color',
      'hide_when_empty',
    ]);
  });

  /**
   * The requirement itself, stated once rather than inferred from the two lists above.
   *
   * Those pin each panel independently, so a change that reordered *both* consistently
   * wrongly would fail them — but a change that reordered only one would fail only one,
   * and the diff would not say which of the two is now the odd one out. This says what
   * the invariant is.
   */
  it('orders every shared category the same way in both panels', () => {
    const headingsOf = (schema: ReadonlyArray<HaFormSchema>) =>
      [...walkSchema(schema)]
        .filter(({ node }) => 'type' in node && node.type === 'constant')
        .map(({ node }) => node.name);

    const entity = headingsOf(entitySchema());
    const content = headingsOf(contentSchema());
    const shared = entity.filter((name) => content.includes(name));

    // The denominator. With no shared categories the agreement below is vacuous, and it
    // would go vacuous silently if a heading were renamed on one side only.
    expect(shared).toEqual(['heading_filters', 'heading_multiday']);

    expect(content.filter((name) => shared.includes(name))).toEqual(shared);

    /**
     * The options a panel lists under one heading, in render order.
     *
     * @param schema - Panel or group schema
     * @param name - Heading key to read under
     * @returns The option names between that heading and the next one
     */
    const optionsUnder = (schema: ReadonlyArray<HaFormSchema>, name: string) => {
      const seq = sequence(schema);
      const from = seq.indexOf(`# ${name}`) + 1;
      const rest = seq.slice(from);
      const until = rest.findIndex((entry) => entry.startsWith('# '));

      return (until === -1 ? rest : rest.slice(0, until)).filter(Boolean);
    };

    // What the two panels put under `heading_filters`, pinned by value so a key joining or
    // leaving either side is a deliberate edit rather than a silently smaller comparison.
    const entityFilters = optionsUnder(entitySchema(), 'heading_filters');
    const contentFilters = optionsUnder(contentSchema(), 'heading_filters');

    expect(entityFilters).toEqual([
      'days_of_week',
      'event_type',
      'allday_expires_at',
      'filter_field',
      'blocklist',
      'allowlist',
      'compact_events_to_show',
    ]);
    expect(contentFilters).toEqual(['event_type', 'show_past_events', 'filter_duplicates']);

    /**
     * The invariant, stated over the options the two panels actually share.
     *
     * This replaces a "both panels start `heading_filters` with the same key" assertion,
     * which was a **proxy** that held only while `event_type` was the sole shared option
     * and every other key sat after it. The per-calendar panel now opens with
     * `days_of_week`, which is per-calendar only — there is no card-level counterpart to
     * disagree with — so the proxy went false without anything being wrong. Relative order
     * over the intersection is the property that was actually meant.
     *
     * At one shared option this is trivially satisfied, which is why the set is pinned
     * above: the assertion becomes real the moment a second key is shared, and cannot go
     * quietly vacuous by one panel dropping a key in the meantime.
     */
    const sharedFilters = entityFilters.filter((name) => contentFilters.includes(name));

    expect(sharedFilters).toEqual(['event_type']);
    expect(contentFilters.filter((name) => sharedFilters.includes(name))).toEqual(sharedFilters);
  });
});
