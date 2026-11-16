/**
 * The page registry against the builders, in both directions.
 *
 * `pages.ts` is a list beside the code, which is exactly what drifts (AGENTS.md, _Proximity is
 * not reach_). So nothing here walks the registry to find out what exists: every panel is built
 * under every workspace over the whole gate corpus, every calendar entry state and the toolbar
 * button schema with it, and the leaves walked here are the denominator. Every one of them must
 * be placed exactly once, and every placed id must be built somewhere. A field added to a
 * builder, a registry line deleted, an id placed twice and a gate the corpus no longer opens
 * each fail one of the first three tests. Where each id goes is pinned too, by value, against
 * the approved page map typed out below: the reconciliations above cannot see two fields trade
 * places, since every count still agrees.
 */

import { describe, expect, it } from 'vitest';

import { type FieldId, entrySchema, fieldId, schemaCtx } from '../src/rendering/editor/field-index';
import * as Filter from '../src/rendering/editor/filter';
import { ENTRY_GATES, GATES, type Gate, corpus } from '../src/rendering/editor/gates';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import {
  type Appearance,
  ENTRY_GROUPS,
  FAMILIES,
  type FamilyId,
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  isWholeCard,
  placementOf,
} from '../src/rendering/editor/pages';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

/** Every leaf the builders build, by id: the workspaces it is built in, and its nodes. */
interface Built {
  workspaces: Set<EditorWorkspace>;
  nodes: HaFormSchema[];
}

/**
 * Walks a built schema's leaves into the map.
 *
 * @param into - Map being filled
 * @param scope - Id scope
 * @param schema - Built schema
 * @param workspace - Workspace it was built for
 */
function walkInto(
  into: Map<FieldId, Built>,
  scope: string,
  schema: ReadonlyArray<HaFormSchema>,
  workspace: EditorWorkspace,
): void {
  for (const { node, dataPath } of walkSchema(schema)) {
    if (!('selector' in node)) continue;
    const id = fieldId(scope, dataPath, node.name);
    const known = into.get(id) ?? { workspaces: new Set(), nodes: [] };
    known.workspaces.add(workspace);
    known.nodes.push(node);
    into.set(id, known);
  }
}

const STATES = corpus();

const BUILT = (() => {
  const built = new Map<FieldId, Built>();
  for (const workspace of WORKSPACES) {
    for (const state of STATES.filter((candidate) => candidate.workspace === workspace)) {
      const ctx = schemaCtx(state.config, workspace, 'en');
      for (const panel of PANELS) {
        walkInto(
          built,
          panel.id,
          Filter.withholdInertFields(panel.build(ctx), workspace),
          workspace,
        );
      }
      for (const entry of state.config.entities ?? []) {
        walkInto(built, 'calendar', entrySchema(entry, ctx), workspace);
      }
    }
    walkInto(built, 'button', buildToolbarButtonSchema(), workspace);
  }
  return built;
})();

/** Every placement in the registry, in order, with where it sits. */
const PLACED: ReadonlyArray<{
  id: FieldId;
  appearance: Appearance;
  page: string;
  heading: HeadingDef | undefined;
}> = [
  ...OVERVIEW_FIELDS.map(([id, appearance]) => ({
    id,
    appearance,
    page: 'overview',
    heading: undefined,
  })),
  ...PAGES.flatMap((page) =>
    page.headings.flatMap((heading) =>
      heading.fields.map(([id, appearance]) => ({ id, appearance, page: page.id, heading })),
    ),
  ),
  ...ENTRY_GROUPS.flatMap((heading) =>
    heading.fields.map(([id, appearance]) => ({ id, appearance, page: 'entry', heading })),
  ),
];

/**
 * The controls a mode value waits on.
 *
 * @param appearance - Appearance
 * @returns The controls, or none for anything but a mode value
 */
function modeControls(appearance: Appearance): ReadonlyArray<FieldId> {
  if (typeof appearance !== 'object' || !('with' in appearance)) return [];
  return typeof appearance.with === 'string' ? [appearance.with] : appearance.with;
}

/**
 * The family a placement belongs to.
 *
 * @param appearance - Appearance
 * @returns The family, or `undefined`
 */
function familyOf(appearance: Appearance): FamilyId | undefined {
  return typeof appearance === 'object' && 'family' in appearance ? appearance.family : undefined;
}

/**
 * The approved page map, heading by heading: page, heading, family, and each field in order
 * with its marker (E essential, A Add, W a mode value, F a family member, B a toolbar button's
 * row, P an event part's chip, T a toolbar control's chip, R Calendar Filter's radio group) and the workspaces that offer it (S All Layouts, L List, C Columns, G Grid; none means
 * all four). Typed out from the approved map, never read from `pages.ts`, so a field moved to
 * another page, heading or marker fails here even where every count still agrees. The
 * overview's two blocks are one run, as the registry keeps them.
 */
const APPROVED_MAP: ReadonlyArray<
  readonly [page: string, heading: string, family: string, fields: ReadonlyArray<string>]
> = [
  [
    'Overview',
    '',
    '',
    [
      'content:days_to_show E',
      'content:start_date_mode E',
      'content:start_date_fixed W',
      'content:start_date_offset W',
      // Outside candidate A's 223 (Appendix A): the synthetic shortcut over the event's tap.
      'actions:event_opens_details E',
    ],
  ],
  [
    'Which Events',
    '',
    '',
    [
      'content:event_type A',
      'content:filter_duplicates_mode A',
      'content:duplicate_accent_color A',
      'content:event_order A L',
      'content:skip_first_events A L',
    ],
  ],
  [
    'Which Events',
    'Past Events',
    '',
    ['content:show_past_events E', 'events:past_event_opacity A'],
  ],
  [
    'Which Events',
    'Multi-Day Events',
    '',
    ['content:split_multiday_events A SLC', 'content:multiday_banners A G'],
  ],
  [
    'Which Events',
    'Empty Days',
    '',
    [
      'content:show_empty_days E',
      'content:show_empty_today E',
      'content:empty_day_text E SLC',
      'content:empty_day_color A SLC',
      'content:hide_when_empty A',
    ],
  ],
  [
    'Which Events',
    'Compact Mode',
    'compact_mode',
    [
      'content:compact_days_to_show F L',
      'content:compact_events_to_show F L',
      'content:compact_events_complete_days F L',
    ],
  ],
  [
    'Card & Header',
    '',
    '',
    [
      'card:title E',
      'card:title_font_size A',
      'card:title_color A',
      'card:background_color A',
      'content:language_mode A',
    ],
  ],
  [
    'Card & Header',
    'Toolbar',
    '',
    [
      'card:toolbar.show E',
      'card:toolbar.add_event T',
      'card:toolbar.view_switcher T',
      'card:toolbar.reset T',
      'card:toolbar.refresh T',
      'card:toolbar.search T',
      'card:toolbar.navigation T',
      'card:toolbar.legend R',
    ],
  ],
  [
    'Card & Header',
    'Your Own Buttons',
    '',
    ['button:icon B', 'button:name B', 'button:entity B', 'button:tap_action B'],
  ],
  [
    'Day Header',
    '',
    '',
    [
      'day_header:date_vertical_alignment A L',
      'day_header:weekday_font_size A',
      'day_header:weekday_color A',
      'day_header:day_font_size A',
      'day_header:day_color A',
      'day_header:show_month E',
      'day_header:month_font_size A',
      'day_header:month_color A',
    ],
  ],
  [
    'Day Header',
    'Gap & Rule',
    '',
    [
      'day_header:column.day_header_gap A C',
      'day_header:column.day_header_separator_width A C',
      'day_header:column.day_header_separator_color A C',
      'day_header:time_grid.day_header_gap A G',
      'day_header:time_grid.day_header_separator_width A G',
      'day_header:time_grid.day_header_separator_color A G',
    ],
  ],
  [
    'Day Header',
    'Weeks',
    '',
    [
      'content:first_day_of_week E',
      'day_header:week_number_mode E',
      'day_header:show_current_week_number E',
      'day_header:week_number_font_size A',
      'day_header:week_number_color A',
      'day_header:week_number_background_color A',
    ],
  ],
  [
    'Day Header',
    'Today',
    '',
    [
      'day_header:today_date_scale A',
      'day_header:today_date_font_weight A',
      'day_header:today_weekday_color A',
      'day_header:today_day_color A',
      'day_header:today_month_color A',
    ],
  ],
  [
    'Day Header',
    'Today Indicator',
    '',
    [
      'day_header:today_indicator_style E',
      'day_header:today_indicator_icon W',
      'day_header:today_indicator_custom W',
      'day_header:today_indicator_color A',
      'day_header:today_indicator_size A',
      'day_header:today_indicator_position A L',
    ],
  ],
  [
    'Day Header',
    'Past Days',
    'past_days',
    [
      'day_header:past_date_opacity F',
      'day_header:past_date_scale F',
      'day_header:past_date_font_weight F',
    ],
  ],
  [
    'Day Header',
    'Weekend Colors',
    'weekend_colors',
    [
      'day_header:weekend_weekday_color F',
      'day_header:weekend_day_color F',
      'day_header:weekend_month_color F',
    ],
  ],
  [
    'Event Appearance',
    'Event Details',
    '',
    [
      'events:show_time P',
      'events:show_end_time P',
      'events:show_location P',
      'events:show_description P',
      'events:show_countdown P',
      'events:show_progress_bar P',
      'events:show_duration P',
      'events:show_now_indicator P SLC',
      'content:time_format E',
      'events:time_position A SLC',
    ],
  ],
  ['Event Appearance', 'Event State', '', ['events:now_color A']],
  [
    'Event Appearance',
    'Accent',
    '',
    [
      'events:accent_event_text A',
      'events:accent_color_mode A',
      'events:accent_color W',
      'events:vertical_line_width A',
      'events:event_background_opacity A',
    ],
  ],
  [
    'Event Appearance',
    'Title',
    '',
    [
      'events:event_font_size A',
      'events:event_color A',
      'events:title_max_lines A',
      'events:scroll_long_titles A',
    ],
  ],
  [
    'Event Appearance',
    'Icon & Badge',
    '',
    [
      'events:event_icon_vertical_alignment A',
      'events:allday_badge_position A SLC',
      'events:allday_badge_style W SLC',
      'events:allday_badge_color_mode W SLC',
      'events:allday_badge_color W SLC',
    ],
  ],
  [
    'Event Appearance',
    'Time',
    '',
    [
      'events:show_single_allday_time A SLC',
      'events:show_multiday_allday_time A SLC',
      'events:time_two_digit_hours A',
      'events:time_font_size A',
      'events:time_color A',
      'events:time_icon_size A',
      'events:time_max_lines A SLC',
    ],
  ],
  [
    'Event Appearance',
    'Location',
    '',
    [
      'events:show_location_allday A SLC',
      'events:location_country_mode A',
      'events:location_country_pattern W',
      'events:location_font_size A',
      'events:location_color A',
      'events:location_icon_size A',
      'events:location_max_lines A',
    ],
  ],
  [
    'Event Appearance',
    'Description',
    '',
    [
      'events:show_description_allday A SLC',
      'events:description_font_size A',
      'events:description_color A',
      'events:description_icon_size A',
      'events:description_max_lines A',
    ],
  ],
  [
    'Event Appearance',
    'Countdown & Progress',
    '',
    [
      'events:countdown_max_days A',
      'events:show_countdown_allday A SLC',
      'events:countdown_once_per_day A SLC',
      'events:countdown_exact_days A',
      'events:progress_bar_color A',
      'events:progress_bar_height A',
      'events:progress_bar_width A',
    ],
  ],
  [
    'Size & Spacing',
    'Card Size & Spacing',
    '',
    [
      'layout:height_mode E',
      'layout:card_height W',
      'layout:card_max_height W',
      'layout:additional_card_spacing A',
      'layout:event_gap A SLC',
      'layout:event_spacing A SLC',
    ],
  ],
  [
    'Size & Spacing',
    'Column Density',
    'column_density',
    [
      'layout:column.min_day_width F C',
      'layout:column.min_days_to_show F C',
      'layout:column.min_days_fallback F C',
    ],
  ],
  [
    'Size & Spacing',
    'Grid Density',
    'grid_density',
    [
      'layout:time_grid.min_day_width F G',
      'layout:time_grid.min_days_to_show F G',
      'layout:time_grid.min_days_fallback F G',
    ],
  ],
  [
    'Size & Spacing',
    'Between Days',
    '',
    [
      'layout:day_spacing A SLC',
      'separators:day_spacing A G',
      'separators:day_separator_width A',
      'separators:day_separator_color A',
      'separators:week_separator_width A',
      'separators:week_separator_color A',
      'separators:month_separator_width A',
      'separators:month_separator_color A',
    ],
  ],
  [
    'Size & Spacing',
    'Across the Grid',
    '',
    [
      'separators:time_grid.hour_line_width A G',
      'separators:time_grid.hour_line_color A G',
      'separators:time_grid.allday_band_line_width A G',
      'separators:time_grid.allday_band_line_color A G',
    ],
  ],
  [
    'Grid',
    'Time Axis',
    '',
    [
      'layout:time_grid.start_time E G',
      'layout:time_grid.end_time E G',
      'layout:time_grid.slot_minutes A G',
      'layout:time_grid.hour_height A G',
    ],
  ],
  [
    'Grid',
    'Hour Labels',
    '',
    [
      'layout:time_grid.axis_width A G',
      'layout:time_grid.show_axis_labels A G',
      'layout:time_grid.axis_label_minutes A G',
    ],
  ],
  [
    'Grid',
    'On the Grid',
    '',
    [
      'layout:time_grid.weekend_background_color A G',
      'layout:time_grid.today_background_color A G',
      'layout:time_grid.show_now_line A G',
      'layout:time_grid.allday_band_max_rows A G',
      'layout:time_grid.overlap_layout A G',
      'layout:time_grid.max_simultaneous_events A G',
    ],
  ],
  ['Weather', '', '', ['weather:weather.entity E', 'weather:weather.position E']],
  [
    'Weather',
    'In the Day Header',
    '',
    [
      'weather:weather.date.show_conditions E',
      'weather:weather.date.show_high_temp E',
      'weather:weather.date.show_low_temp E',
      'weather:weather.date.show_uv_index E',
      'weather:weather.date.uv_index_threshold W',
      'weather:weather.date.icon_size A',
      'weather:weather.date.font_size A',
      'weather:weather.date.color A',
    ],
  ],
  [
    'Weather',
    'Beside Each Event',
    '',
    [
      'weather:weather.event.show_conditions E',
      'weather:weather.event.show_temp E',
      'weather:weather.event.show_uv_index E',
      'weather:weather.event.uv_index_threshold W',
      'weather:weather.event.daily_forecast_fallback E',
      'weather:weather.event.icon_size A',
      'weather:weather.event.font_size A',
      'weather:weather.event.color A',
      'weather:weather.event.max_lines A',
    ],
  ],
  [
    'Taps & Refresh',
    '',
    '',
    [
      'actions:tap_action E',
      'actions:hold_action A',
      'actions:day_tap_action_mode E',
      'actions:event_tap_action E',
      'actions:event_hold_action A',
      'actions:open_links A SLC',
      'actions:allow_event_edit E',
      'actions:allow_event_delete E',
    ],
  ],
  [
    'Taps & Refresh',
    'Refresh',
    '',
    ['actions:refresh_interval A', 'actions:refresh_on_navigate A'],
  ],
  [
    'Calendar Entry',
    'Name & Look',
    '',
    [
      'calendar:accent_color_mode E',
      'calendar:accent_color W',
      'calendar:name E',
      'calendar:show_in_legend A',
      'calendar:label_type E',
      'calendar:label_icon_source W',
      'calendar:label_image_source W',
      'calendar:label W',
      'calendar:label_icon_color A',
      'calendar:color A',
      'calendar:text_scale A',
    ],
  ],
  ['Calendar Entry', 'Who Sees It', '', ['calendar:visibility A']],
  [
    'Calendar Entry',
    'Which Events',
    '',
    [
      'calendar:days_of_week A',
      'calendar:event_type A',
      'calendar:allday_expires_at A',
      'calendar:filter_field W',
      'calendar:blocklist A',
      'calendar:allowlist A',
      'calendar:compact_events_to_show A L',
    ],
  ],
  [
    'Calendar Entry',
    'Text Replacement',
    'replace',
    ['calendar:replace_field F', 'calendar:replace_pattern F', 'calendar:replace_with F'],
  ],
  [
    'Calendar Entry',
    'Multi-Day Events',
    '',
    ['calendar:split_multiday_events A SLC', 'calendar:multiday_banners A G'],
  ],
  [
    'Calendar Entry',
    'Event Details',
    '',
    [
      'calendar:show_time A',
      'calendar:show_location A',
      'calendar:location_icon A',
      'calendar:show_description A',
      'calendar:show_weather A',
    ],
  ],
];

/** Every heading in the registry, entry groups included. */
const HEADINGS: ReadonlyArray<HeadingDef> = [
  ...PAGES.flatMap((page) => page.headings),
  ...ENTRY_GROUPS,
];

describe('the page registry places every built field exactly once', () => {
  it('walks the whole corpus', () => {
    // The denominators, beside the verdicts below. A short walk shows here first: the approved
    // map places 222 ids, and every one of them is built under some workspace and state.
    console.info(
      `Page registry: ${BUILT.size} ids built over ${STATES.length} corpus states in ` +
        `${WORKSPACES.length} workspaces; ${PLACED.length} placements.`,
    );
    expect(WORKSPACES).toHaveLength(4);
    expect(BUILT.size).toBe(222);
    expect(PLACED).toHaveLength(222);
  });

  it('has no field built but unplaced', () => {
    expect([...BUILT.keys()].filter((id) => placementOf(id) === undefined)).toEqual([]);
  });

  it('places no id twice', () => {
    const counts = new Map<FieldId, number>();
    for (const { id } of PLACED) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect([...counts].filter(([, count]) => count > 1).map(([id]) => id)).toEqual([]);
  });

  it('has no registry id never built', () => {
    expect(PLACED.map(({ id }) => id).filter((id) => !BUILT.has(id))).toEqual([]);
  });

  it('reports each placement where it is', () => {
    for (const { id, page, heading } of PLACED) {
      const at = placementOf(id);
      expect(at?.page, id).toBe(page);
      if (page === 'overview') expect(at?.heading, id).toBe(0);
      else {
        const headings =
          page === 'entry' ? ENTRY_GROUPS : PAGES.find((p) => p.id === page)!.headings;
        expect(headings[at!.heading], id).toBe(heading);
      }
    }
  });

  it('places every id where the approved map does, with its marker and scope', () => {
    const tags: ReadonlyArray<readonly [EditorWorkspace, string]> = [
      ['shared', 'S'],
      ['list', 'L'],
      ['column', 'C'],
      ['grid', 'G'],
    ];
    const offered = (id: FieldId): string => {
      const scopes = tags
        .filter(([workspace]) => BUILT.get(id)?.workspaces.has(workspace))
        .map(([, tag]) => tag)
        .join('');
      return scopes === 'SLCG' ? '' : ` ${scopes}`;
    };
    const marker = (appearance: Appearance): string => {
      if (appearance === 'essential') return 'E';
      if (appearance === 'add') return 'A';
      if (appearance === 'button-rows') return 'B';
      // Calendar Filter's Off, Menu and Chips.
      if (appearance === 'segmented') return 'R';
      if ('with' in appearance) return 'W';
      if ('family' in appearance) return 'F';
      // A chip: an event part (P) or a toolbar control (T).
      return appearance.chips === 'parts' ? 'P' : 'T';
    };
    const words = (key: string | undefined): string =>
      key === undefined ? '' : (EDITOR_STRINGS[key] ?? key);
    const row = (page: string, heading: string, fields: HeadingDef['fields']) => [
      page,
      heading,
      [...new Set(fields.flatMap(([, appearance]) => familyOf(appearance) ?? []))].join(','),
      fields.map(([id, appearance]) => `${id} ${marker(appearance)}${offered(id)}`),
    ];

    const registry = [
      row('Overview', '', OVERVIEW_FIELDS),
      ...PAGES.flatMap((page) =>
        page.headings.map((heading) =>
          row(words(page.titleKey), words(heading.key), heading.fields),
        ),
      ),
      ...ENTRY_GROUPS.map((heading) => row('Calendar Entry', words(heading.key), heading.fields)),
    ];
    const markers = new Map<string, number>();
    for (const { appearance } of PLACED) {
      markers.set(marker(appearance), (markers.get(marker(appearance)) ?? 0) + 1);
    }
    console.info(
      `Page registry against the approved map: ${APPROVED_MAP.length} headings, ` +
        `${APPROVED_MAP.flatMap(([, , , fields]) => fields).length} fields; markers ` +
        `${JSON.stringify(Object.fromEntries(markers))}.`,
    );
    expect(registry).toEqual(APPROVED_MAP);
  });
});

describe('the page registry is consistent with itself', () => {
  it('orders the pages as the approved map does', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'which_events',
      'card_header',
      'day_header',
      'events',
      'size_spacing',
      'grid',
      'weather',
      'taps_refresh',
    ]);
  });

  it('names a mode control on the same page for every mode value', () => {
    const modes = PLACED.filter(({ appearance }) => modeControls(appearance).length > 0);
    expect(modes).toHaveLength(18);
    for (const { id, appearance, page } of modes) {
      for (const control of modeControls(appearance)) {
        expect(PLACED.find((placed) => placed.id === control)?.page, `${id} with ${control}`).toBe(
          page,
        );
      }
    }
  });

  it('keeps a gated mode value waiting on its own mode control', () => {
    const gates: ReadonlyArray<Gate> = [...Object.values(GATES), ...Object.values(ENTRY_GATES)];
    const prerequisites = (gate: Gate): ReadonlyArray<FieldId> =>
      [...gate.requires, ...(gate.anyOf ?? []).flat()].map((prereq) => prereq.field);

    for (const { id, appearance } of PLACED) {
      const gate = gates.find((candidate) => candidate.fields.includes(id));
      const controls = modeControls(appearance);
      if (gate?.kind === 'mode-value') {
        expect(controls.length, `${id} is gated as a mode value`).toBeGreaterThan(0);
      }
      if (gate !== undefined && controls.length > 0) {
        expect(gate.kind, id).toBe('mode-value');
        for (const control of controls) expect(prerequisites(gate), id).toContain(control);
      }
    }
  });

  it('puts every family member under its family heading, and only there', () => {
    const members = new Map<FamilyId, number>();
    for (const { id, appearance, heading } of PLACED) {
      const family = familyOf(appearance);
      if (family === undefined) continue;
      members.set(family, (members.get(family) ?? 0) + 1);
      expect(heading?.key, id).toBe(FAMILIES[family].titleKey);
    }
    // Every family has members, and a family heading holds nothing but them.
    expect([...members.keys()].sort()).toEqual(Object.keys(FAMILIES).sort());
    for (const heading of HEADINGS) {
      const family = (Object.keys(FAMILIES) as FamilyId[]).find(
        (candidate) => FAMILIES[candidate].titleKey === heading.key,
      );
      if (family === undefined) continue;
      expect(heading.fields.map(([, appearance]) => familyOf(appearance))).toEqual(
        heading.fields.map(() => family),
      );
    }
    expect([...members.values()].reduce((sum, count) => sum + count, 0)).toBe(18);
  });

  it('resolves every string it names', () => {
    const keys: string[] = [];
    for (const page of PAGES) {
      keys.push(page.titleKey, ...(page.noteKey ? [page.noteKey] : []));
    }
    for (const heading of HEADINGS) {
      if (heading.key) keys.push(heading.key);
      if (heading.helperKey) keys.push(heading.helperKey);
      keys.push(...Object.values(heading.keyByView ?? {}));
    }
    for (const family of Object.values(FAMILIES)) {
      keys.push(family.titleKey, ...(family.helperKey ? [family.helperKey] : []));
    }
    console.info(`Page registry strings: ${new Set(keys).size} keys.`);
    expect(keys.filter((key) => !(key in EDITOR_STRINGS))).toEqual([]);
  });

  it('cross-links to headings that exist', () => {
    const links = HEADINGS.flatMap((heading) => (heading.crossLink ? [heading.crossLink] : []));
    expect(links).toHaveLength(2);
    for (const link of links) {
      const target = PAGES.find((page) => page.id === link.page);
      expect(
        target?.headings.map((heading) => heading.key),
        link.heading,
      ).toContain(link.heading);
    }
  });

  it('draws each extra once, the own buttons over their own rows', () => {
    const extras = HEADINGS.flatMap((heading) => heading.extras ?? []);
    expect(extras.sort()).toEqual(['own-buttons', 'split', 'weather-calendar-links']);

    const own = HEADINGS.find((heading) => heading.extras?.includes('own-buttons'));
    expect(own?.fields.map(([id]) => id)).toEqual(
      PLACED.filter(({ appearance }) => appearance === 'button-rows').map(({ id }) => id),
    );
  });

  it('shows the Grid page only where its fields are built', () => {
    const grid = PAGES.filter((page) => page.onlyIn !== undefined);
    expect(grid.map((page) => [page.id, page.onlyIn])).toEqual([['grid', 'grid']]);
    for (const [id] of grid[0].headings.flatMap((heading) => heading.fields)) {
      expect([...BUILT.get(id)!.workspaces], id).toEqual(['grid']);
    }
  });

  it('derives which pages apply to the whole card', () => {
    expect(PAGES.filter((page) => isWholeCard(page)).map((page) => page.id)).toEqual([
      'card_header',
      'weather',
    ]);
    expect(isWholeCard({ headings: ENTRY_GROUPS })).toBe(false);
  });
});

/**
 * What the builders' headings, rows and groups used to say, now said by the registry. Each case
 * restates one assertion `tests/editor-schema.test.ts`, `tests/editor-layout-structure.test.ts`
 * or `tests/editor-filter.test.ts` made about a builder, against the page that draws its fields.
 * The approved map above pins every placement already; these name the claims, so a change to
 * one fails with the reason it was made.
 */
describe('the registry heads what the builders used to', () => {
  /** A heading's field ids, by page and heading key. */
  const under = (page: string, key: string): FieldId[] => {
    const heading = PAGES.find((candidate) => candidate.id === page)?.headings.find(
      (candidate) => candidate.key === key,
    );
    if (heading === undefined) throw new Error(`no heading ${key} on ${page}`);
    return heading.fields.map(([id]) => id);
  };

  it('names the two weather positions after where the forecast appears', () => {
    const date = under('weather', 'weather.date');
    const event = under('weather', 'weather.event');
    expect(date.length).toBeGreaterThan(1);
    expect(event.length).toBeGreaterThan(1);
    expect(date.every((id) => id.startsWith('weather:weather.date.'))).toBe(true);
    expect(event.every((id) => id.startsWith('weather:weather.event.'))).toBe(true);
    expect(EDITOR_STRINGS['weather.date']).toBeTypeOf('string');
    expect(EDITOR_STRINGS['weather.event']).toBeTypeOf('string');
  });

  it('captions the day-header gap and its rule together, under one heading', () => {
    const rule = ['day_header_gap', 'day_header_separator_width', 'day_header_separator_color'];
    expect(under('day_header', 'heading_gap_and_rule')).toEqual(
      ['column', 'time_grid'].flatMap((block) => rule.map((key) => `day_header:${block}.${key}`)),
    );
  });

  it('splits the rules the grid draws by direction', () => {
    expect(under('size_spacing', 'heading_between_days')).toEqual([
      'layout:day_spacing',
      'separators:day_spacing',
      'separators:day_separator_width',
      'separators:day_separator_color',
      'separators:week_separator_width',
      'separators:week_separator_color',
      'separators:month_separator_width',
      'separators:month_separator_color',
    ]);
    expect(under('size_spacing', 'heading_across_the_grid')).toEqual([
      'separators:time_grid.hour_line_width',
      'separators:time_grid.hour_line_color',
      'separators:time_grid.allday_band_line_width',
      'separators:time_grid.allday_band_line_color',
    ]);
  });

  it("heads the Events page's opening runs, state before accent and the title kept together", () => {
    const keys = PAGES.find((page) => page.id === 'events')!.headings.map((heading) => heading.key);
    const at = (key: string) => keys.indexOf(key);
    expect(at('heading_details')).toBe(0);
    expect(at('heading_event_state')).toBeGreaterThan(at('heading_details'));
    expect(at('heading_accent')).toBeGreaterThan(at('heading_event_state'));
    expect(at('heading_title')).toBeGreaterThan(at('heading_accent'));
    expect(at('heading_icon_and_badge')).toBeGreaterThan(at('heading_title'));
    expect(under('events', 'heading_title')).toEqual([
      'events:event_font_size',
      'events:event_color',
      'events:title_max_lines',
      'events:scroll_long_titles',
    ]);
  });

  it('keeps the background tint with the accent it is mixed from', () => {
    expect(under('events', 'heading_accent')).toContain('events:event_background_opacity');
    expect(under('events', 'heading_title')).not.toContain('events:event_background_opacity');
  });

  it("captions only the toolbar's own settings with the toolbar heading, as D09 orders them", () => {
    expect(under('card_header', 'heading_toolbar')).toEqual([
      'card:toolbar.show',
      'card:toolbar.add_event',
      'card:toolbar.view_switcher',
      'card:toolbar.reset',
      'card:toolbar.refresh',
      'card:toolbar.search',
      'card:toolbar.navigation',
      'card:toolbar.legend',
    ]);
  });

  it('opens the Grid page on the time axis, titled through the block-qualified key', () => {
    const grid = PAGES.find((page) => page.id === 'grid')!;
    expect(grid.headings[0].key).toBe('time_grid.axis');
    expect(EDITOR_STRINGS['time_grid.axis']).toBe('Time Axis');
    expect(lookup('de', 'time_grid.axis')).toBe('Zeitachse');
  });

  it('draws past-event opacity beside the switch it fades for', () => {
    expect(under('which_events', 'heading.past_events')).toEqual([
      'content:show_past_events',
      'events:past_event_opacity',
    ]);
  });
});

describe('no built field is a box-mode select', () => {
  it('leaves Home Assistant a dropdown it names', () => {
    // A box-mode select is the one selector without an accessible name; Card Displays is
    // one today, and it is drawn by the chassis rather than by any of these builders.
    const nodes = [...BUILT.values()].flatMap((built) => built.nodes);
    console.info(`Page registry: ${nodes.length} built nodes checked for box-mode selects.`);
    expect(nodes.length).toBeGreaterThan(BUILT.size);
    expect(
      nodes
        .filter((node) => 'selector' in node && 'select' in node.selector)
        .filter(
          (node) =>
            'selector' in node &&
            (node.selector as { select: { mode?: string } | null }).select?.mode === 'box',
        )
        .map((node) => node.name),
    ).toEqual([]);
  });
});
