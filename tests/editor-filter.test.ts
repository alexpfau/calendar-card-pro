import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { changeField, formOf, mountEditor, resultRows } from './helpers/editor-host';
import { searchIndex } from './helpers/search-index';
import { CURRENT_CONFIG_VERSION } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  FILTER_SCHEMA,
  SEARCH_FIELD,
  hasFields,
  hasQuery,
  toFilterCriteria,
} from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { ENTRY_GROUPS, type HeadingDef, PAGES } from '../src/rendering/editor/pages';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { keepsControl } from '../src/rendering/editor/plan';
import { buildEntitySchema, entitySchemaFor } from '../src/rendering/editor/schemas/entity';
import { search } from '../src/rendering/editor/search';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { CHASSIS_STRINGS, chassisSubforms } from '../src/rendering/editor/subforms';

/**
 * Tests for the editor's search field and what a query finds.
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

/**
 * Every card field the jump list lists for a configuration and a query, by name, in the card's
 * own layout.
 */
function visibleFields(config: Types.Config, criteria: { readonly query: string }): string[] {
  const index = searchIndex(config, {
    workspace: config.view === 'column' ? 'column' : 'list',
  });
  return search(index, criteria.query).flatMap(({ entry: { target } }) =>
    target.kind === 'field' ? [target.id.split(/[:.]/).pop()!] : [],
  );
}

/**
 * The fields of one panel the jump list lists for a query, by name: those this layout offers,
 * since another layout's are tagged as its own (`editor-search-full.test.ts`).
 */
function panelHits(config: Types.Config, panel: string, query: string): string[] {
  const workspace = config.view === 'column' ? 'column' : 'list';
  return search(searchIndex(config, { workspace }), query).flatMap(({ entry }) =>
    entry.target.kind === 'field' &&
    entry.target.id.startsWith(`${panel}:`) &&
    entry.status.kind !== 'other-layout'
      ? [entry.target.id.split(/[:.]/).pop()!]
      : [],
  );
}

/** The fields of a calendar's one block the jump list lists for a query, by name. */
function calendarHits(
  config: Types.Config,
  query: string,
  schema: ReadonlyArray<HaFormSchema>,
): string[] {
  // What a list card draws: another layout's setting is listed as that layout's.
  return search(searchIndex(config, { workspace: 'list', entrySchemas: [schema] }), query).flatMap(
    ({ entry: { target, status } }) =>
      target.kind === 'entry-field' && status.kind !== 'other-layout'
        ? [target.id.split(/[:.]/).pop()!]
        : [],
  );
}

/**
 * Names in the order a search lists a calendar's settings that all match alike: the ones its page
 * draws on every card first (`search.ts` › `matchTier`), each half in page order.
 *
 * @param names - Field names, in page order
 * @returns Them, essential first
 */
function essentialFirst(names: ReadonlyArray<string>): string[] {
  const essential = new Set(
    ENTRY_GROUPS.flatMap((group) => group.fields)
      .filter(([, appearance]) => keepsControl(appearance))
      .map(([id]) => id.split(/[:.]/).pop()!),
  );
  return [
    ...names.filter((name) => essential.has(name)),
    ...names.filter((name) => !essential.has(name)),
  ];
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
    expect(hasQuery({ query: '  ' })).toBe(false);
  });

  it('finds nothing for a term that is in no label, helper, option or key', () => {
    expect(visibleFields(columnConfig(), { query: 'zzzznotathing' })).toEqual([]);
  });

  /**
   * A field the current configuration does not call for has no control here, so the search
   * finds it as what it is: waiting on another setting, which its tag names and choosing it
   * opens (section 5.8). Once that setting allows it, it is found as an ordinary setting.
   */
  it('finds a field gated off by another option as waiting on it', () => {
    const status = (config: Types.Config) =>
      search(searchIndex(config, { workspace: 'list' }), 'compact_events_complete_days').map(
        ({ entry }) => [entry.status.kind, entry.tag],
      );

    expect(status(buildConfig())).toEqual([['gated', 'Needs an Events limit under Compact Mode']]);
    expect(status(buildConfig({ compact_events_to_show: 3 }))).toEqual([['live', undefined]]);
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
});

describe('editor filter: the per-calendar settings', () => {
  function entitySchema(config: Types.Config): HaFormSchema[] {
    return buildEntitySchema({ view: 'list', config, language: 'en' });
  }

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
   * decide whether the calendar list draws a calendar's row at all.
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
    // Ranked: two labels starting with the word, then the one whose key holds it.
    expect(calendarHits(config, 'replace', schema)).toEqual([
      'replace_field',
      'replace_with',
      'replace_pattern',
    ]);
  });

  it('finds the label shape by searching for the label', () => {
    const config = buildConfig({ entities: [{ entity: 'calendar.a', label: 'Work' }] });

    // The label itself first, then the shape, then what a label of another shape would use.
    expect(
      calendarHits(config, 'label', entitySchemaFor(entitySchema(config), 'text')).slice(0, 2),
    ).toEqual(['label', 'label_type']);
  });

  it('lists a calendar whole when the search names it', () => {
    const config = buildConfig({ entities: ['calendar.birthdays'] });
    const schema = entitySchema(config);

    // Whole as a list card's editor draws it, which withholds the time grid's own control. The
    // accent color is one control with the mode choosing its source, so one row, the mode's.
    expect(calendarHits(config, 'birthdays', schema)).toEqual(
      essentialFirst(
        fieldNames(schema).filter((name) => name !== 'multiday_banners' && name !== 'accent_color'),
      ),
    );
  });

  it('lists a calendar’s fields that match, and no other', () => {
    const config = buildConfig({ entities: ['calendar.a'] });

    expect(calendarHits(config, 'blocklist', entitySchema(config))).toEqual(['blocklist']);
  });
});

describe('editor filter: the search field itself', () => {
  it('is a schema of selectors, so it names no new Home Assistant element', () => {
    expect(FILTER_SCHEMA.map((node) => node.name)).toEqual([SEARCH_FIELD]);

    for (const node of FILTER_SCHEMA) {
      expect(node).toHaveProperty('selector');
    }
  });

  it('is declared to the string check like every other schema in the editor', () => {
    const declared = chassisSubforms().flatMap((subform) =>
      subform.schema.map((node) => node.name),
    );

    expect(declared.filter((name) => name === SEARCH_FIELD)).toEqual([SEARCH_FIELD]);
    expect(CHASSIS_STRINGS).toContain('filter');
  });

  it('reads a change out of the form and ignores everything else in it', () => {
    expect(toFilterCriteria({ [SEARCH_FIELD]: 'width', days_to_show: 7 })).toEqual({
      query: 'width',
    });
    expect(toFilterCriteria({ customized_only: true })).toEqual({ query: '' });
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

    // Column density is a Layout option of Columns and Grid, and the card is a list here: it is
    // found as theirs, not as nothing.
    await changeField(element, `filter:${SEARCH_FIELD}`, 'min_day_width');
    expect(panels().map(({ id }) => id)).toEqual([
      'layout:column.min_day_width',
      'layout:time_grid.min_day_width',
    ]);
    await changeField(element, `filter:${SEARCH_FIELD}`, 'zzzznotathing');

    expect(panels()).toHaveLength(0);

    const empty = element.shadowRoot!.querySelector('.filter-empty');
    expect(empty?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Nothing matches “zzzznotathing”. Try fewer words, or an option name from YAML such as ' +
        'show_location. Clear Search',
    );
  });

  /**
   * The filter is editor state and nothing else. A search term reaching the write path
   * would be a config key nobody asked for, in a file the user has to live with.
   */
  it('never reports a configuration change of its own', async () => {
    const { element, dispatched } = await mount({ entities: ['calendar.a'] });

    await changeField(element, `filter:${SEARCH_FIELD}`, 'width');
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

/** What a query finds among the toolbar's switches, and what counts as a field. */
describe('editor filter: section headings', () => {
  it("finds the toolbar's switches by the word, and the background apart from them", () => {
    // Which heading captions them is the registry's (`tests/editor-page-registry.test.ts`).
    const config = buildConfig({ toolbar: { show: true } });

    expect(panelHits(config, 'card', 'background')).toEqual(['background_color']);

    // The title says what it becomes while the toolbar is shown, so the search finds it too,
    // last, as a match in its help alone.
    expect(panelHits(config, 'card', 'toolbar')).toEqual([
      'show',
      'add_event',
      'view_switcher',
      'reset',
      'refresh',
      'search',
      'navigation',
      'legend',
      'size',
      'title',
    ]);
  });

  it('does not count a heading as a field when deciding a panel is empty', () => {
    // `hasFields` gates whether a panel renders at all. Counting a heading as content
    // would show a panel containing nothing but section labels.
    expect(hasFields([{ name: 'heading_details', type: 'constant' }])).toBe(false);
    expect(
      hasFields([
        { name: 'heading_details', type: 'constant' },
        { name: 'days_to_show', selector: { number: { min: 1 } } },
      ]),
    ).toBe(true);
  });
});

/**
 * The field and heading order of a calendar entry and the card, pinned: each as its builder
 * orders its fields and as the page registry heads them.
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

  /** A registry's headings and fields, in render order, the way `sequence` reads a schema. */
  const headed = (headings: ReadonlyArray<HeadingDef>): string[] =>
    headings.flatMap((heading) => [
      ...(heading.key === undefined ? [] : [`# ${heading.key}`]),
      ...heading.fields.map(([id]) => id.slice(id.indexOf(':') + 1)),
    ]);

  it('pins a calendar entry', () => {
    // Its builder emits fields alone, in the order the entry page's groups head them.
    expect(sequence(entitySchema())).toEqual(
      headed(ENTRY_GROUPS).filter((name) => !name.startsWith('# ')),
    );
    expect(headed(ENTRY_GROUPS)).toEqual([
      '# heading.name_and_look',
      'accent_color_mode',
      'accent_color',
      'name',
      'show_in_legend',
      'label_type',
      'label_icon_source',
      'label_image_source',
      'label',
      'label_icon_color',
      'color',
      'text_scale',
      '# heading.who_sees_it',
      'visibility',
      '# page.which_events',
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
    // The card's categories are the headings of the page drawing its content options.
    const whichEvents = PAGES.find((page) => page.id === 'which_events')!;
    const entity = ENTRY_GROUPS.flatMap((heading) => heading.key ?? []);
    const content = whichEvents.headings.flatMap((heading) => heading.key ?? []);
    const shared = entity.filter((name) => content.includes(name));

    // The denominator. With no shared categories the agreement below is vacuous, and it
    // would go vacuous silently if a heading were renamed on one side only.
    expect(shared).toEqual(['heading_multiday']);

    expect(content.filter((name) => shared.includes(name))).toEqual(shared);

    /**
     * The options a calendar entry's page lists under one heading, in render order.
     *
     * @param name - Heading key to read under
     * @returns The option names the entry page draws under it
     */
    const optionsUnder = (name: string) =>
      (ENTRY_GROUPS.find((heading) => heading.key === name)?.fields ?? []).map(([id]) =>
        id.slice(id.indexOf(':') + 1),
      );
    const cardUnder = (key: string | undefined) =>
      (whichEvents.headings.find((heading) => heading.key === key)?.fields ?? []).map(([id]) =>
        id.slice(id.indexOf(':') + 1),
      );

    // Both sides of the shared category, pinned by value.
    expect(optionsUnder('heading_multiday')).toEqual(['split_multiday_events', 'multiday_banners']);
    expect(cardUnder('heading_multiday')).toEqual(['split_multiday_events', 'multiday_banners']);

    // The calendar's filters, and the card's filters under the page's opening heading.
    const entityFilters = optionsUnder('page.which_events');
    const contentFilters = cardUnder('heading.selection_and_order');

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
