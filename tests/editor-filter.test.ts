import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import {
  CARD,
  changeField,
  formOf,
  formsOf,
  mountEditor,
  openPanels,
  resetButtons,
  resultRows,
} from './helpers/editor-host';
import { searchIndex } from './helpers/search-index';
import { CURRENT_CONFIG_VERSION, DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  CUSTOMIZED_ONLY_FIELD,
  ESSENTIALS_ONLY_FIELD,
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
  toFilterCriteria,
} from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PAGES } from '../src/rendering/editor/pages';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { search } from '../src/rendering/editor/search';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { CHASSIS_STRINGS, chassisSubforms } from '../src/rendering/editor/subforms';
import { stripColumnDefaults } from '../src/rendering/editor/value';
import { ENTITY_COLOR_SENTINEL } from '../src/utils/entity-colors';

/**
 * Tests for the editor's search and "customized only" filter.
 *
 * Everything outside `element.ts` is free of Lit and of the DOM, so the filter is tested
 * the way it is written: as functions over schema, without rendering anything, and what a
 * query finds as the jump list's index (`search.ts`) lists it. The handful of cases that are
 * genuinely about the chassis — results in place of the overview, a filter never reaching the
 * configuration — mount the element and say so.
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
 * filter. Heading behavior has its own test below, so excluding them here narrows what
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

/**
 * Every card field the editor shows for a configuration and criteria, by name: with a query, the
 * fields the jump list lists, in the card's own layout; without one, what the switches leave of
 * every panel.
 */
function visibleFields(config: Types.Config, criteria: Partial<FilterCriteria> = {}): string[] {
  if (criteria.query === undefined) {
    // No query: what the switches leave of every panel.
    const ctx = ctxFor(config, criteria);
    return PANELS.flatMap((panel) =>
      fieldNames(filterSchema(panel.build({ view: ctx.view, config, language: 'en' }), ctx)),
    );
  }
  // Under Customized Only, Shared: where a value at the root is the card's own.
  const index = searchIndex(config, {
    workspace: criteria.customizedOnly ? 'shared' : config.view === 'column' ? 'column' : 'list',
    customizedOnly: criteria.customizedOnly,
  });
  return search(index, criteria.query ?? '').flatMap(({ entry: { target } }) =>
    target.kind === 'field' ? [target.id.split(/[:.]/).pop()!] : [],
  );
}

/** The fields of one panel the jump list lists for a query, by name. */
function panelHits(
  config: Types.Config,
  panel: string,
  query: string,
  customizedOnly = false,
): string[] {
  const workspace = config.view === 'column' ? 'column' : 'list';
  return search(searchIndex(config, { workspace, customizedOnly }), query).flatMap(
    ({ entry: { target } }) =>
      target.kind === 'field' && target.id.startsWith(`${panel}:`)
        ? [target.id.split(/[:.]/).pop()!]
        : [],
  );
}

/** The fields of a calendar's one block the jump list lists for a query, by name. */
function calendarHits(
  config: Types.Config,
  query: string,
  schema: ReadonlyArray<HaFormSchema>,
): string[] {
  return search(searchIndex(config, { workspace: 'list', entrySchemas: [schema] }), query).flatMap(
    ({ entry: { target } }) =>
      target.kind === 'entry-field' ? [target.id.split(/[:.]/).pop()!] : [],
  );
}

/** One field of one panel, found by name, with the label and data paths it sits under. */
function fieldOf(
  config: Types.Config,
  name: string,
): { node: HaFormSchema; path: ReadonlyArray<string>; dataPath: ReadonlyArray<string> } {
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
    // "gutter" is in the helper and in no label.
    expect(visibleFields(buildConfig(), { query: 'gutter' })).toContain('day_spacing');
  });

  it('ignores case and surrounding space', () => {
    const config = columnConfig();

    expect(visibleFields(config, { query: '  MINIMUM day  ' })).toContain('min_day_width');
  });

  it('lists nothing, and narrows nothing, when nothing is typed', () => {
    const config = columnConfig();

    expect(visibleFields(config, { query: '   ' })).toEqual([]);
    expect(visibleFields(config, { query: 'width' }).length).toBeGreaterThan(0);
    expect(isFiltering({ query: '  ', customizedOnly: false, essentialsOnly: false })).toBe(false);
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

describe('editor filter: headings and pages a query names', () => {
  it('lists a heading whole when its own title matches', () => {
    const config = columnConfig();
    const layout = PANELS.find((panel) => panel.id === 'layout')!;
    const built = layout.build({ view: 'column', config, language: 'en' });

    const whole = panelHits(config, 'layout', 'Column Density').sort();
    const density = built.find((node) => 'schema' in node && node.name === 'column');
    const inside = fieldNames((density as { schema: ReadonlyArray<HaFormSchema> }).schema).sort();

    expect(whole).toEqual(inside);
  });

  it('lists only the field a key names', () => {
    expect(panelHits(columnConfig(), 'layout', 'min_day_width')).toEqual(['min_day_width']);
  });

  it('does not list a heading or a page whole under "customized only", however it reads', () => {
    // One density option is the card's own, so Customized Only shows it…
    const config = columnConfig({ column: { min_day_width: 200 } as Types.ColumnOverrides });
    expect(panelHits(config, 'layout', 'min_day_width', true)).toEqual(['min_day_width']);

    // …and neither its heading nor its page lists it, though both list it without.
    expect(panelHits(config, 'layout', 'Column Density')).toContain('min_day_width');
    expect(panelHits(config, 'layout', 'Size & Spacing')).toContain('min_day_width');
    expect(panelHits(config, 'layout', 'Column Density', true)).toEqual([]);
    expect(panelHits(config, 'layout', 'Size & Spacing', true)).toEqual([]);
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
   * discarded by the card in favor of the default; neither is a customization, and a
   * predicate that compared the raw values would report both as one.
   */
  it('reads a numeric option the way the card reads it', () => {
    const quoted = buildConfig({ days_to_show: '3' as unknown as number });
    const negative = buildConfig({ days_to_show: -1 });

    expect(visibleFields(quoted, { customizedOnly: true })).not.toContain('days_to_show');
    expect(visibleFields(negative, { customizedOnly: true })).not.toContain('days_to_show');

    // ...and the value the card would honor is still reported, quoted or not.
    const quotedSeven = buildConfig({ days_to_show: '7' as unknown as number });
    expect(visibleFields(quotedSeven, { customizedOnly: true })).toContain('days_to_show');
  });

  /**
   * A view value is customized when the layout stores its own, and a line the block already
   * holds is stored: a save keeps it even at the default, so it would stop following that
   * default if it ever moved. An edit that writes the default fresh is still minimized away,
   * which the write path decides, and the configuration then holds nothing to count.
   */
  it('counts a value the column block holds as its own, even at the default', () => {
    const config = columnConfig();
    const { node, dataPath: path } = fieldOf(config, 'min_day_width');

    expect(path).toEqual(['column']);

    const held = columnConfig({ column: { min_day_width: 140 } });
    const untouched = ctxFor(config, { customizedOnly: true });
    const real = ctxFor(columnConfig({ column: { min_day_width: 200 } }), { customizedOnly: true });

    expect(isCustomized(node, path, untouched)).toBe(false);
    expect(isCustomized(node, path, ctxFor(held, { customizedOnly: true }))).toBe(true);
    expect(isCustomized(node, path, real)).toBe(true);
    // 140 is the column default, so an edit that writes it is not stored.
    expect(stripColumnDefaults(held)).toBeUndefined();
  });

  /**
   * `min_days_to_show` defaults to `days_to_show` rather than to a constant, so the only
   * honest test of an edit is whether removing the line changes what the card resolves. The
   * write path answers that for a line written fresh; a line the block already holds is
   * kept either way, so the filter counts it.
   */
  it('handles an override whose default is another option', () => {
    const config = columnConfig({ days_to_show: 5, column: { min_days_to_show: 5 } });
    const { node, dataPath: path } = fieldOf(config, 'min_days_to_show');

    expect(isCustomized(node, path, ctxFor(config, { customizedOnly: true }))).toBe(true);
    expect(stripColumnDefaults(config)).toBeUndefined();

    const lowered = columnConfig({ days_to_show: 5, column: { min_days_to_show: 2 } });
    expect(isCustomized(node, path, ctxFor(lowered, { customizedOnly: true }))).toBe(true);
    expect(stripColumnDefaults(lowered)).toEqual({ min_days_to_show: 2 });
  });

  /**
   * Column view starts `show_empty_days` from `true` whatever the top level says, so an
   * override repeating it is doing nothing even though the two values differ. An edit that
   * writes it is therefore minimized away; a line the block already holds is kept, and
   * counted, like any other value the layout stores.
   */
  it('compares an override against what it would inherit, not against the top level', () => {
    const config = columnConfig({ show_empty_days: false, column: { show_empty_days: true } });
    const inBlock = { name: 'show_empty_days', selector: { boolean: {} } } as HaFormSchema;
    expect(stripColumnDefaults(config)).toBeUndefined();
    expect(isCustomized(inBlock, ['column'], ctxFor(config, { customizedOnly: true }))).toBe(true);

    const differing = columnConfig({ show_empty_days: true, column: { show_empty_days: false } });
    expect(stripColumnDefaults(differing)).toEqual({ show_empty_days: false });
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
   *
   * `label_icon_source` is derived from that same value and rides along for the same
   * reason: hidden, a calendar following Home Assistant would keep an icon it had no
   * control to stop following.
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
    expect(fieldNames(configured)).toEqual(['label_type', 'label_icon_source', 'label']);

    // A calendar with no label of its own keeps neither, so its panel drops out whole.
    const untouched = filterEntitySchema(
      entitySchemaFor(entitySchema(config), 'none'),
      config.entities[1],
      ENTITY_PATH,
      ctx,
    );
    expect(fieldNames(untouched)).toEqual([]);
  });

  /**
   * The accent mode is the same contract as `label_icon_source` one field over, and it was
   * missed. Both halves matter and they fail differently.
   *
   * Following Home Assistant, `entitySchemaFor` drops `accent_color` — so the mode dropdown
   * is the *only* accent control left, and hiding it left the calendar with nothing at all.
   * `hasFields` then answered false and the chassis dropped the whole panel: a calendar the
   * user had configured disappeared from the filter that promises to show exactly that.
   *
   * With a custom color the panel survives, but the color field arrives with no control
   * saying where it comes from and no way back to following the card.
   */
  it('keeps the accent mode dropdown wherever the calendar has set an accent color', () => {
    const following = buildConfig({
      entities: [{ entity: 'calendar.a', accent_color: ENTITY_COLOR_SENTINEL }],
    });
    const custom = buildConfig({ entities: [{ entity: 'calendar.a', accent_color: '#ff0000' }] });
    const untouched = buildConfig({ entities: ['calendar.a'] });

    const kept = (config: Types.Config, mode: string): string[] =>
      fieldNames(
        filterEntitySchema(
          entitySchemaFor(entitySchema(config), 'none', mode),
          config.entities[0],
          ENTITY_PATH,
          ctxFor(config, { customizedOnly: true }),
        ),
      );

    expect(kept(following, 'home_assistant')).toEqual(['accent_color_mode']);
    expect(kept(custom, 'custom')).toEqual(['accent_color_mode', 'accent_color']);

    // The control still stores nothing of its own, so a calendar that has set no color
    // keeps neither and its panel drops out whole — as it did before.
    expect(kept(untouched, 'inherit')).toEqual([]);
  });

  /**
   * The three rules a heading has to satisfy, checked against the section added last.
   *
   * "Text Replacement" is the one heading whose words appear in no field under it — the
   * fields are *Replace In*, *Find* and *Replace With*, and none of their helpers says
   * "replacement". That makes it the sharpest test of rule one: searching for it must not
   * return the heading captioning an empty section, which is precisely what
   * `pruneLoneHeadings` exists to stop and what a heading is incapable of doing honestly.
   *
   * `hasFields` is the third rule and the one with teeth, because the chassis calls it to
   * decide whether to render a calendar's panel at all.
   */
  it('never returns a heading as a search hit of its own', () => {
    const config = buildConfig({ entities: ['calendar.a'] });
    const schema = entitySchema(config);

    // The premise: the word is in the heading and in nothing beneath it.
    const headingOnly = 'replacement';
    expect(EDITOR_STRINGS.heading_replace.toLowerCase()).toContain(headingOnly);

    expect(calendarHits(config, headingOnly, schema)).toEqual([]);

    // The denominator: a word that *is* under a heading still comes back, so the empty
    // result above is the rule working rather than the search finding nothing ever.
    expect(calendarHits(config, 'replace', schema)).toEqual([
      'replace_field',
      'replace_pattern',
      'replace_with',
    ]);
  });

  it('finds the label shape by searching for the label', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.a', label: 'Work' }] });

    expect(calendarHits(config, 'label', entitySchemaFor(entitySchema(config), 'text'))).toEqual([
      'label_type',
      'label',
    ]);
  });

  it('lists a calendar whole when the search names it', () => {
    const config = buildConfig({ entities: ['calendar.birthdays'] });
    const schema = entitySchema(config);

    // Whole as a list card's editor draws it, which withholds the time grid's own control.
    expect(calendarHits(config, 'birthdays', schema)).toEqual(
      fieldNames(schema).filter((name) => name !== 'multiday_banners'),
    );
  });

  it('lists a calendar’s fields that match, and no other', () => {
    const config = buildConfig({ entities: ['calendar.a'] });

    expect(calendarHits(config, 'blocklist', entitySchema(config))).toEqual(['blocklist']);
  });
});

describe('editor filter: the bar itself', () => {
  it('is a schema of selectors, so it names no new Home Assistant element', () => {
    expect(FILTER_SCHEMA.map((node) => node.name)).toEqual([
      SEARCH_FIELD,
      CUSTOMIZED_ONLY_FIELD,
      ESSENTIALS_ONLY_FIELD,
    ]);

    for (const node of FILTER_SCHEMA) {
      expect(node).toHaveProperty('selector');
    }
  });

  it('is declared to the string check like every other schema in the editor', () => {
    const declared = chassisSubforms().flatMap((subform) =>
      subform.schema.map((node) => node.name),
    );

    expect(
      declared.filter((name) =>
        [SEARCH_FIELD, CUSTOMIZED_ONLY_FIELD, ESSENTIALS_ONLY_FIELD].includes(name),
      ),
    ).toEqual([SEARCH_FIELD, CUSTOMIZED_ONLY_FIELD, ESSENTIALS_ONLY_FIELD]);
    expect(CHASSIS_STRINGS).toContain('filter');
  });

  it('reads a change out of the form and ignores everything else in it', () => {
    expect(toFilterCriteria({ [SEARCH_FIELD]: 'width', days_to_show: 7 })).toEqual({
      query: 'width',
      customizedOnly: false,
      essentialsOnly: false,
    });

    expect(toFilterCriteria({ [CUSTOMIZED_ONLY_FIELD]: true })).toEqual({
      query: '',
      customizedOnly: true,
      essentialsOnly: false,
    });

    expect(toFilterCriteria({ [ESSENTIALS_ONLY_FIELD]: true })).toEqual({
      query: '',
      customizedOnly: false,
      essentialsOnly: true,
    });
  });
});

describe('editor filter: the chassis', () => {
  async function mount(config: Partial<Types.Config>) {
    const element = await mountEditor({
      config_version: CURRENT_CONFIG_VERSION,
      ...config,
    });

    const dispatched: Array<Record<string, unknown>> = [];
    element.addEventListener('config-changed', (event) => {
      dispatched.push((event as CustomEvent).detail.config);
    });

    // What the overview shows of the pages: a row per page, or a row per result.
    const panels = () => resultRows(element);
    const rows = () => element.shadowRoot!.querySelectorAll('[data-focus^="nav:"]');

    return { element, dispatched, panels, rows };
  }

  it('renders the filter bar above the panels', async () => {
    const { element } = await mount({ entities: ['calendar.a'] });

    expect(element.shadowRoot!.querySelectorAll('ha-form.filter-form')).toHaveLength(1);
    expect(formOf(element, `filter:${SEARCH_FIELD}`)).toBeDefined();
  });

  it('shows results in place of the page rows', async () => {
    const { element, panels, rows } = await mount({ entities: ['calendar.a'] });

    // A row per page before; a row per result after, and no page row.
    expect(rows()).toHaveLength(PAGES.length - 1);

    await changeField(element, `filter:${SEARCH_FIELD}`, 'week');

    expect(rows()).toHaveLength(0);
    expect(panels().length).toBeGreaterThan(0);
  });

  /**
   * A row mounts no form until its page opens (D05 A's cost): live controls for every match
   * would draw what the user has not asked to edit yet.
   */
  it('draws its results as rows, mounting no form', async () => {
    const { element, panels } = await mount({ entities: ['calendar.a'] });

    expect(panels()).toHaveLength(0);

    await changeField(element, `filter:${SEARCH_FIELD}`, 'week');

    expect(panels().length).toBeGreaterThan(0);
    expect(element.shadowRoot!.querySelector('[data-field] > ha-form')).toBeNull();
  });

  it('says so when a search matches nothing', async () => {
    const { element, panels } = await mount({ entities: ['calendar.a'] });

    // Column density is a Layout option of Columns, and the card is a list here.
    await changeField(element, `filter:${SEARCH_FIELD}`, 'min_day_width');
    expect(panels()).toHaveLength(0);
    await changeField(element, `filter:${SEARCH_FIELD}`, 'zzzznotathing');

    expect(panels()).toHaveLength(0);

    const empty = element.shadowRoot!.querySelector('.filter-empty');
    expect(empty?.textContent).toContain('zzzznotathing');
    // The reason a search can come up empty, which the user cannot otherwise see.
    expect(element.shadowRoot!.querySelector('.filter-empty-note')?.textContent).toBeTruthy();
  });

  it('says so when nothing has been customized', async () => {
    const { element, panels } = await mount({ entities: [] });

    await changeField(element, `filter:${CUSTOMIZED_ONLY_FIELD}`, true);

    expect(panels()).toHaveLength(0);
    expect(element.shadowRoot!.querySelector('.filter-empty')?.textContent).toContain('customized');
  });

  it('shows the calendars a card has configured, and hides the ones it has not', async () => {
    const { element } = await mount({
      entities: [{ entity: 'calendar.a', color: '#ff0000' }, 'calendar.b'],
    });

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.entity-panel')).toHaveLength(2);

    await changeField(element, `filter:${CUSTOMIZED_ONLY_FIELD}`, true);

    expect(element.shadowRoot!.querySelectorAll('ha-expansion-panel.entity-panel')).toHaveLength(1);
  });

  it('offers no reset until a view has an explicit value', async () => {
    const { element } = await mount({ view: 'column', entities: ['calendar.a'] });

    expect(element.shadowRoot!.querySelectorAll('.view-resets')).toHaveLength(0);

    await changeField(element, `filter:${CUSTOMIZED_ONLY_FIELD}`, true);

    expect(element.shadowRoot!.querySelectorAll('.view-resets')).toHaveLength(0);
  });

  /**
   * An explicit view value remains editable and resettable while customized-only is on.
   */
  it('keeps explicit view values and their reset controls', async () => {
    const { element } = await mount({
      view: 'column',
      entities: ['calendar.a'],
      column: { event_font_size: '22px' },
    } as Partial<Types.Config>);

    await changeField(element, `filter:${CUSTOMIZED_ONLY_FIELD}`, true);

    expect(
      (await resetButtons(element)).filter(
        (button) => button.dataset.resetKeys === 'event_font_size',
      ),
    ).toHaveLength(1);
    await openPanels(element);
    const offered = formsOf(element, CARD).flatMap((form) => fieldNames(form.schema));
    expect(offered).toContain('event_font_size');
  });

  /**
   * The filter is editor state and nothing else. A search term reaching the write path
   * would be a config key nobody asked for, in a file the user has to live with.
   */
  it('never reports a configuration change of its own', async () => {
    const { element, dispatched } = await mount({ entities: ['calendar.a'] });

    await changeField(element, `filter:${SEARCH_FIELD}`, 'width');
    await changeField(element, `filter:${CUSTOMIZED_ONLY_FIELD}`, true);
    await changeField(element, `filter:${SEARCH_FIELD}`, '');

    expect(dispatched).toEqual([]);
  });

  /**
   * A field a result opened writes exactly what it writes reached any other way. Worth
   * pinning: the opposite would be silent, and it would be data loss.
   */
  it('writes the same configuration for an edit made from a result', async () => {
    const { element, dispatched } = await mount({
      entities: ['calendar.a'],
      days_to_show: 7,
    });

    await changeField(element, `filter:${SEARCH_FIELD}`, 'days_to_show');

    await changeField(element, 'content:days_to_show', 10);

    expect(dispatched).toHaveLength(1);
    // The List workspace owns this edit, so the new count is the list block's and the
    // shared count is left as it was — exactly what the unfiltered edit writes.
    expect(dispatched[0]).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.a'],
      days_to_show: 7,
      list: { days_to_show: 10 },
    });
  });
});

/**
 * Section headings under the filter.
 *
 * A heading is a claim about the fields beneath it, which makes it the one node type that
 * can be actively misleading when the filter runs: one whose fields were all filtered out is
 * left stranded above whatever section happens to follow, silently relabeling someone else's
 * options. Headings never keep themselves; they ride along with their section, and one whose
 * section came back empty is pruned. A query no longer narrows a form, so Customized Only is
 * what empties sections now; a query's results are rows, and a heading is never one
 * (the per-calendar "replacement" case above).
 */
describe('editor filter: section headings', () => {
  const entitySchema = () =>
    buildEntitySchema({ view: 'list' as const, config: buildConfig(), language: 'en' });

  const customized = (config: Types.Config) => ctxFor(config, { customizedOnly: true });

  it('renders its headings when nothing is filtered (denominator)', () => {
    // Without this, every assertion below could pass against a schema that has no
    // headings at all.
    expect(headingNames(entitySchema())).toEqual([
      'heading_appearance',
      'heading_visibility',
      'heading_filters',
      'heading_replace',
      'heading_multiday',
      'heading_details',
    ]);
  });

  it('never keeps a heading for itself', () => {
    const schema: HaFormSchema[] = [
      { name: 'heading_nothing', type: 'constant' },
      { name: 'days_to_show', selector: { number: { min: 1 } } },
    ];

    expect(filterSchema(schema, customized(buildConfig()))).toEqual([]);
  });

  it('keeps a heading when a field under it is kept', () => {
    const schema: HaFormSchema[] = [
      { name: 'heading_filters', type: 'constant' },
      { name: 'days_to_show', selector: { number: { min: 1 } } },
    ];
    const kept = filterSchema(schema, customized(buildConfig({ days_to_show: 7 })));

    expect(fieldNames(kept)).toEqual(['days_to_show']);
    expect(headingNames(kept)).toEqual(['heading_filters']);
  });

  it('keeps a heading whose section still has an option, and drops the rest', () => {
    // A calendar color is an appearance field, so exactly one heading survives: the one that
    // still has something under it.
    const entry = { entity: 'calendar.a', color: '#ff0000' };
    const filtered = filterEntitySchema(
      entitySchema(),
      entry,
      ['entity'],
      customized(buildConfig({ entities: [entry] })),
    );

    expect(fieldNames(filtered)).toEqual(['color']);
    expect(headingNames(filtered)).toEqual(['heading_appearance']);
  });

  it("finds the toolbar's switches by the word, and the background apart from them", () => {
    // Which heading captions them is the registry's (`tests/editor-page-registry.test.ts`).
    const config = buildConfig({ toolbar: { show: true } });

    expect(panelHits(config, 'card', 'background')).toEqual(['background_color']);

    // The title says what it becomes while the toolbar is shown, so the search finds it too.
    expect(panelHits(config, 'card', 'toolbar')).toEqual([
      'title',
      'show',
      'legend',
      'add_event',
      'view_switcher',
      'reset',
      'refresh',
      'search',
      'navigation',
    ]);
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
 * The field and heading order of the two panels, pinned: the per-calendar panel as its builder
 * draws it, the card-level one as its builder orders its fields and as the page registry heads
 * them.
 *
 * Order was incidental once and nothing asserted it: reordering both panels passed the entire
 * suite. It is *designed* — the two share a spine, which users see — so it needs a gate, or
 * the next refactor silently undoes the thing the reorder was for.
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
      'name',
      'show_in_legend',
      'label_type',
      'label_icon_source',
      'label_image_source',
      'label',
      'label_icon_color',
      'color',
      'accent_color_mode',
      'accent_color',
      'text_scale',
      '# heading_visibility',
      'visibility',
      '# heading_filters',
      'days_of_week',
      'event_type',
      'allday_expires_at',
      'filter_field',
      'blocklist',
      'allowlist',
      'compact_events_to_show',
      '# heading_replace',
      'replace_field',
      'replace_pattern',
      'replace_with',
      '# heading_multiday',
      'split_multiday_events',
      'multiday_banners',
      '# heading_details',
      'show_time',
      'show_location',
      'location_icon',
      'show_description',
      'show_weather',
    ]);
  });

  it('pins the card-level content panel', () => {
    // Its builder emits fields alone; the headings over them are the registry's.
    expect(sequence(contentSchema())).toEqual([
      'days_to_show',
      'start_date_mode',
      'first_day_of_week',
      'event_order',
      'event_type',
      'show_past_events',
      'filter_duplicates_mode',
      'skip_first_events',
      'split_multiday_events',
      'multiday_banners',
      'show_empty_days',
      // No `show_empty_today`: with every empty day already showing it has nothing to add,
      // so the switch is withheld (see the empty-day tests in editor-schema.test.ts).
      'empty_day_text',
      'empty_day_color',
      'hide_when_empty',
      'compact_days_to_show',
      'compact_events_to_show',
      'language_mode',
      'time_format',
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

    // The card's categories are the headings of the page drawing its content options.
    const whichEvents = PAGES.find((page) => page.id === 'which_events')!;
    const entity = headingsOf(entitySchema());
    const content = whichEvents.headings.flatMap((heading) => heading.key ?? []);
    const shared = entity.filter((name) => content.includes(name));

    // The denominator. With no shared categories the agreement below is vacuous, and it
    // would go vacuous silently if a heading were renamed on one side only.
    expect(shared).toEqual(['heading_multiday']);

    expect(content.filter((name) => shared.includes(name))).toEqual(shared);

    /**
     * The options a calendar's panel lists under one heading, in render order.
     *
     * @param schema - Panel schema
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
    const cardUnder = (key: string | undefined) =>
      (whichEvents.headings.find((heading) => heading.key === key)?.fields ?? []).map(([id]) =>
        id.slice(id.indexOf(':') + 1),
      );

    // Both sides of the shared category, pinned by value.
    expect(optionsUnder(entitySchema(), 'heading_multiday')).toEqual([
      'split_multiday_events',
      'multiday_banners',
    ]);
    expect(cardUnder('heading_multiday')).toEqual(['split_multiday_events', 'multiday_banners']);

    // The calendar's filters, and the card's filters in the page's unheaded opening run.
    const entityFilters = optionsUnder(entitySchema(), 'heading_filters');
    const contentFilters = cardUnder(undefined);

    expect(entityFilters).toEqual([
      'days_of_week',
      'event_type',
      'allday_expires_at',
      'filter_field',
      'blocklist',
      'allowlist',
      'compact_events_to_show',
    ]);
    expect(contentFilters).toEqual([
      'event_type',
      'filter_duplicates_mode',
      'duplicate_accent_color',
      'event_order',
      'skip_first_events',
    ]);

    /**
     * The invariant, stated over the options the two share: relative order over the
     * intersection. At one shared option this is trivially satisfied, which is why the set is
     * pinned: the assertion becomes real the moment a second key is shared, and cannot go
     * quietly vacuous by one side dropping a key in the meantime.
     */
    const sharedFilters = entityFilters.filter((name) => contentFilters.includes(name));

    expect(sharedFilters).toEqual(['event_type']);
    expect(contentFilters.filter((name) => sharedFilters.includes(name))).toEqual(sharedFilters);
  });
});
