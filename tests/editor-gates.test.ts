/**
 * The gate table against the builders, in every workspace and display.
 *
 * `gates.ts` describes the builders' branches; the builders decide. Every gate is opened here
 * by replaying its own opening edits from a fresh card, made through routing as a user makes
 * them, independently of `corpus()`. What a replay builds must be in that workspace's universe,
 * the gate's fields must be among it, and the corpus must hold the very same state. From each
 * opened state every condition's control is set to every value it offers, and every legal value
 * of the option behind it is written as YAML would write it; the fields must be present exactly
 * when the conditions hold. That proves each predicate in both directions over its whole type,
 * and closes nested gates one condition at a time.
 *
 * 🚨 Two traps shape the rest. A check whose denominator comes from the universe it validates
 * cannot notice the universe shrinking: drop Grid's Countries opening from the corpus and Grid's
 * universe loses `events:location_country_pattern` while every check filtered through it stays
 * green. So each universe is pinned by value, and the expectations come from that pin. And none
 * of the table checks can notice a gate leaving the table, because they walk the table: Show
 * Time defaults on, so `events:time_font_size` is present on every fresh card, and deleting the
 * Time gate would leave them all green. So the table is pinned by value, and two
 * reconciliations walk the builders instead.
 */

import { describe, expect, it } from 'vitest';

import { CARD_ACTION_VALUES } from '../src/config/constants';
import type * as Types from '../src/config/types';
import { VIEWS } from '../src/config/view';
import * as Entities from '../src/rendering/editor/entities';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchema,
  panelFieldIndex,
  parseFieldId,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import {
  ENTRY_GATES,
  GATES,
  type Gate,
  type GateData,
  type Prereq,
  applyFieldEdit,
  corpus,
  fieldValue,
  firstUnmet,
  freshConfig,
  needsText,
  openingEdits,
} from '../src/rendering/editor/gates';
import type { SelectorSchema } from '../src/rendering/editor/ha-form';
import { computeLabel } from '../src/rendering/editor/localize';
import { ENTRY_GROUPS, PAGES } from '../src/rendering/editor/pages';
import * as Routing from '../src/rendering/editor/routing';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { deepEqual } from '../src/rendering/editor/value';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';
import * as Helpers from '../src/utils/helpers';

const STATES = corpus();
const ALL_GATES: ReadonlyArray<readonly [string, Gate]> = [
  ...Object.entries(GATES),
  ...Object.entries(ENTRY_GATES),
];

// --- What each workspace's universe must be ---------------------------------------------------

/** Card and calendar fields the registry places; a toolbar button's fields are in no universe. */
const PLACED: ReadonlyArray<FieldId> = [
  ...PAGES.flatMap((page) => page.headings.flatMap((heading) => heading.fields)),
  ...ENTRY_GROUPS.flatMap((heading) => heading.fields),
]
  .map(([id]) => id)
  .filter((id) => !id.startsWith('button:'));

/** Offered only in List: its own options, and nothing the shared base would write for it. */
const LIST_ONLY = [
  'content:event_order',
  'content:skip_first_events',
  'content:compact_days_to_show',
  'content:compact_events_to_show',
  'content:compact_events_complete_days',
  'day_header:date_vertical_alignment',
  'day_header:today_indicator_position',
  'separators:month_separator_label',
  'separators:month_separator_label_color',
  'separators:month_separator_label_font_size',
  'calendar:compact_events_to_show',
];

/** Offered only in Columns. */
const COLUMN_ONLY = [
  'day_header:column.day_header_gap',
  'day_header:column.day_header_separator_width',
  'day_header:column.day_header_separator_color',
  'layout:column.min_day_width',
  'layout:column.min_days_to_show',
  'layout:column.min_days_fallback',
];

/** Offered only in Grid. */
const GRID_ONLY = [
  'day_header:time_grid.day_header_gap',
  'day_header:time_grid.day_header_separator_width',
  'day_header:time_grid.day_header_separator_color',
  'layout:time_grid.min_day_width',
  'layout:time_grid.min_days_to_show',
  'layout:time_grid.min_days_fallback',
  'separators:day_spacing',
  'separators:time_grid.hour_line_width',
  'separators:time_grid.hour_line_color',
  'separators:time_grid.allday_band_line_width',
  'separators:time_grid.allday_band_line_color',
  'layout:time_grid.start_time',
  'layout:time_grid.end_time',
  'layout:time_grid.slot_minutes',
  'layout:time_grid.hour_height',
  'layout:time_grid.axis_width',
  'layout:time_grid.show_axis_labels',
  'layout:time_grid.axis_label_minutes',
  'layout:time_grid.weekend_background_color',
  'layout:time_grid.today_background_color',
  'layout:time_grid.show_now_line',
  'layout:time_grid.allday_band_max_rows',
  'layout:time_grid.overlap_layout',
  'layout:time_grid.max_simultaneous_events',
];

/**
 * Offered in Grid and Month, which draw a long timed event as a bar, and so in All Layouts as
 * well, where an option more than one layout reads is offered.
 */
const GRID_AND_MONTH = ['content:multiday_banners', 'calendar:multiday_banners'];

/** Offered only in Month: its own block's options. */
const MONTH_ONLY = [
  'layout:month.row_height',
  'layout:month.min_day_width',
  'layout:month.day_list_events',
  'layout:month.week_scroll',
  'layout:month.week_scroll_min_width',
];

/**
 * Offered everywhere but Grid and Month. Month's day list puts every time beside its title, so
 * the time's placement is List's and Columns' alone.
 */
const NOT_IN_GRID_OR_MONTH = [
  'content:split_multiday_events',
  'content:empty_day_text',
  'content:empty_day_color',
  'layout:day_spacing',
  'calendar:split_multiday_events',
  'events:time_position',
];

/** Offered everywhere but Grid: what Month's day list draws as List's rows. */
const NOT_IN_GRID = [
  ...NOT_IN_GRID_OR_MONTH,
  'layout:event_gap',
  'events:show_now_indicator',
  'events:allday_badge_position',
  'events:allday_badge_style',
  'events:allday_badge_color_mode',
  'events:allday_badge_color',
  'events:show_single_allday_time',
  'events:show_multiday_allday_time',
  'events:time_max_lines',
  'events:show_location_allday',
  'events:show_description_allday',
  'events:show_countdown_allday',
  'events:countdown_once_per_day',
  'layout:event_spacing',
  'actions:open_links',
];

/**
 * Offered everywhere but Month, which sizes its card with its own heights, draws every day of six
 * weeks, rules them itself and sets its dates in the event font, unscaled. The card's Height
 * fields read the shared `height` and `max_height`; the multi-day all-day time row is one Month's
 * day list never draws, since it splits every multi-day event.
 */
const NOT_IN_MONTH = [
  ...NOT_IN_GRID_OR_MONTH,
  'layout:height_mode',
  'layout:card_height',
  'layout:card_max_height',
  'events:show_multiday_allday_time',
  'content:days_to_show',
  'content:show_empty_days',
  'content:show_empty_today',
  'day_header:day_font_size',
  'day_header:month_font_size',
  'day_header:week_number_background_color',
  'day_header:today_date_scale',
  'day_header:today_weekday_color',
  'day_header:today_indicator_size',
  'day_header:past_date_scale',
  'separators:day_separator_width',
  'separators:day_separator_color',
  'separators:week_separator_width',
  'separators:week_separator_color',
  'separators:month_separator_width',
  'separators:month_separator_color',
];

/** What each workspace's universe lacks, pinned by value. */
const LACKS: Readonly<Record<EditorWorkspace, ReadonlyArray<FieldId>>> = {
  shared: [...LIST_ONLY, ...COLUMN_ONLY, ...GRID_ONLY, ...MONTH_ONLY],
  list: [...COLUMN_ONLY, ...GRID_ONLY, ...GRID_AND_MONTH, ...MONTH_ONLY],
  column: [...LIST_ONLY, ...GRID_ONLY, ...GRID_AND_MONTH, ...MONTH_ONLY],
  grid: [...LIST_ONLY, ...COLUMN_ONLY, ...MONTH_ONLY, ...NOT_IN_GRID],
  month: [...LIST_ONLY, ...COLUMN_ONLY, ...GRID_ONLY, ...NOT_IN_MONTH],
};

/** Each workspace's universe as pinned: the expectation every check below starts from. */
const EXPECTED = new Map(
  WORKSPACES.map((workspace) => [
    workspace,
    new Set(PLACED.filter((id) => !LACKS[workspace].includes(id))),
  ]),
);

/** Each workspace's universe as `field-index.ts` computes it over the corpus. */
const UNIVERSE = new Map(
  WORKSPACES.map((workspace) => [workspace, universeIndex('en', workspace).fields] as const),
);

/** A field of any universe, for its node and label. */
const ANY_FIELD = new Map<FieldId, IndexedField>();
for (const fields of UNIVERSE.values()) {
  for (const [id, field] of fields) if (!ANY_FIELD.has(id)) ANY_FIELD.set(id, field);
}

// --- The legal values of every option a gate waits on ------------------------------------------

/** Every event action YAML may hold: a bare key, Home Assistant's actions and the card's own. */
const ACTIONS: ReadonlyArray<unknown> = [
  null,
  { action: 'none' },
  { action: 'details' },
  { action: 'more-info' },
  { action: 'navigate', navigation_path: '/lovelace/1' },
  { action: 'url', url_path: 'https://example.com' },
  { action: 'perform-action', perform_action: 'light.toggle' },
  { action: 'assist' },
  ...CARD_ACTION_VALUES.map((action) => ({ action })),
];

/**
 * Every legal value of every option behind a gate's conditions, by configuration path, read
 * from its type in `config/types.ts` (an `entity.` path is a calendar entry's). Strings that
 * stand for a family of values (an icon, a pattern, a color) are represented by one each.
 */
const LEGAL: Readonly<Record<string, ReadonlyArray<unknown>>> = {
  show_time: [true, false],
  show_location: [true, false],
  show_description: [true, false],
  show_progress_bar: [true, false],
  show_month: [true, false],
  show_empty_days: [true, false],
  show_empty_today: [true, false],
  show_countdown: [true, false, 'once_per_day'],
  remove_location_country: [true, false, 'true', 'false', 'Germany'],
  show_week_numbers: [null, 'iso', 'simple'],
  today_indicator: [
    true,
    false,
    'none',
    'tile',
    'dot',
    'pulse',
    'glow',
    'mdi:star',
    '⭐',
    '/local/today.png',
  ],
  allday_badge: [true, false, 'off', 'title', 'time'],
  allday_badge_color: ['accent', 'text', '#b5651d'],
  filter_duplicates: [true, false, 'ignore_location'],
  'toolbar.show': [true, false],
  'toolbar.view_switcher': [true, false],
  'toolbar.legend': [false, 'menu', 'chips'],
  'weather.entity': [undefined, '', 'weather.home'],
  'weather.position': [undefined, 'none', 'date', 'event', 'both'],
  'weather.date.show_uv_index': [undefined, true, false],
  'weather.event.show_uv_index': [undefined, true, false],
  'weather.event.show_conditions': [undefined, true, false],
  'month.week_scroll': [undefined, true, false],
  event_tap_action: ACTIONS,
  event_hold_action: ACTIONS,
  start_date: [undefined, '2026-01-01', 'today+7', '+3', '-1'],
  height: ['auto', '300px'],
  max_height: ['none', '300px'],
  language: [undefined, 'de'],
  accent_color: ['var(--primary-color, #03a9f4)', '#ff0000', 'home-assistant'],
  compact_events_to_show: [undefined, 0, 3],
  // Zero in three spellings, a length and a keyword; the card draws a rule for the last two.
  month_separator_width: ['0px', '0', '0em', '1px', 'thin'],
  month_separator_label: [true, false],
  'entity.accent_color': [undefined, '#ff0000', 'home-assistant'],
  'entity.label_type': [undefined, 'none', 'text', 'icon', 'image'],
  'entity.label': [undefined, 'A', 'mdi:star', 'home-assistant', '/local/a.png', 'person.anna'],
  'entity.show_location': [undefined, true, false],
};

/**
 * The configuration paths a control writes.
 *
 * @param id - The control
 * @returns Paths, an `entity.` path being the calendar entry's
 */
function configPaths(id: FieldId): ReadonlyArray<string> {
  const { scope, dataPath } = parseFieldId(id);
  return ANY_FIELD.get(id)!.configKeys.map((key) =>
    scope === 'calendar' ? `entity.${key}` : [...dataPath, key].join('.'),
  );
}

/**
 * Every combination of legal values a control's options can hold together.
 *
 * @param id - The control
 * @returns Path and value pairs, one list per combination
 */
function legalCombinations(id: FieldId): ReadonlyArray<ReadonlyArray<readonly [string, unknown]>> {
  return configPaths(id).reduce<Array<Array<readonly [string, unknown]>>>(
    (combos, path) =>
      combos.flatMap((combo) =>
        (LEGAL[path] ?? []).map((value) => [...combo, [path, value] as const]),
      ),
    [[]],
  );
}

/**
 * Writes a value where it takes effect in a workspace, as YAML would hold it: a top-level option
 * in the block the workspace writes to, a nested one at its path, a calendar's on its entry.
 *
 * @param config - Configuration as the editor holds it
 * @param workspace - Workspace
 * @param path - Configuration path
 * @param value - Value, `undefined` to remove the line
 * @returns A new configuration
 */
function writeLegal(
  config: Types.Config,
  workspace: EditorWorkspace,
  path: string,
  value: unknown,
): Types.Config {
  let parts = path.split('.');
  const entity = parts[0] === 'entity';
  if (entity) parts = parts.slice(1);
  else if (parts.length === 1) {
    const block = Routing.destination(parts[0], workspace);
    if (block !== undefined) parts = [block, ...parts];
  }
  const last = parts[parts.length - 1];

  // Writing what is already there, into objects that already exist, would copy the
  // configuration into its own equal; it is handed back as it is instead.
  const entry = (config.entities ?? [])[0];
  let holder: unknown = entity ? entry : config;
  for (const part of parts.slice(0, -1)) {
    holder = Helpers.isConfigBlock(holder) ? holder[part] : undefined;
  }
  if (Helpers.isConfigBlock(holder)) {
    const has = Object.prototype.hasOwnProperty.call(holder, last);
    if (value === undefined ? !has : has && deepEqual(holder[last], value)) return config;
  }

  // Copied along the path it writes and nowhere else, so the configuration it was given, and
  // every other one sharing its parts, stays as it was.
  const next: Record<string, unknown> = { ...config };
  let target: Record<string, unknown> = next;
  if (entity) {
    const entities = [...(config.entities ?? [])];
    next.entities = entities;
    entities[0] = { ...Entities.asEntityConfig(entities[0]) };
    target = entities[0] as unknown as Record<string, unknown>;
  }
  for (const part of parts.slice(0, -1)) {
    target[part] = { ...((target[part] as Record<string, unknown> | undefined) ?? {}) };
    target = target[part] as Record<string, unknown>;
  }
  if (value === undefined) delete target[last];
  else target[last] = value;
  return next as unknown as Types.Config;
}

// --- Helpers ----------------------------------------------------------------------------------

/**
 * Computes once, on first use.
 *
 * @param compute - The computation
 * @returns Its result, shared by every test that reads it
 */
function once<T>(compute: () => T): () => T {
  let result: { value: T } | undefined;
  return () => (result ??= { value: compute() }).value;
}

/**
 * The card and calendar fields present for a configuration in a workspace.
 *
 * @param config - Configuration as the editor holds it
 * @param workspace - Workspace
 * @returns Present fields, by id
 */
function presentFields(
  config: Types.Config,
  workspace: EditorWorkspace,
): Map<FieldId, IndexedField> {
  const ctx = schemaCtx(config, workspace, 'en');
  const fields = new Map(buildFieldIndex(ctx).fields);
  for (const entry of config.entities ?? []) {
    for (const [id, field] of entityFieldIndex(entrySchema(entry, ctx)).fields)
      fields.set(id, field);
  }
  return fields;
}

/**
 * The fields present among the panels, and the calendar entries, that some ids belong to: what
 * `presentFields` would say about those ids, without building any other panel. A card field's
 * id names its panel, so no other panel can build it.
 *
 * @param config - Configuration as the editor holds it
 * @param workspace - Workspace
 * @param ids - The fields asked about
 * @returns Present fields of their panels and entries, by id
 */
function presentAmong(
  config: Types.Config,
  workspace: EditorWorkspace,
  ids: ReadonlyArray<FieldId>,
): Map<FieldId, IndexedField> {
  const ctx = schemaCtx(config, workspace, 'en');
  const fields = new Map<FieldId, IndexedField>();
  for (const scope of new Set(ids.map((id) => parseFieldId(id).scope))) {
    const found =
      scope === 'calendar'
        ? (config.entities ?? []).flatMap((entry) => [
            ...entityFieldIndex(entrySchema(entry, ctx)).fields,
          ])
        : [...panelFieldIndex(ctx, scope).fields];
    for (const [id, field] of found) fields.set(id, field);
  }
  return fields;
}

/**
 * The form data a gate's conditions are read from. The card's is derived on first read, since a
 * gate whose conditions are all a calendar entry's never reads it.
 *
 * @param config - Configuration as the editor holds it
 * @param workspace - Workspace
 * @returns The card's form data and the first entry's
 */
function formData(config: Types.Config, workspace: EditorWorkspace): GateData {
  const entities = config.entities ?? [];
  let card: Readonly<Record<string, unknown>> | undefined;
  return {
    get card() {
      return (card ??= Routing.workspaceFormData(config, workspace, {}));
    },
    entry: Entities.toEntityFormData(entities[0], entities),
  };
}

/**
 * Every value a control offers, or `undefined` for a kind no gate reads.
 *
 * @param node - The control
 * @returns Its values
 */
function domainOf(node: SelectorSchema): ReadonlyArray<unknown> | undefined {
  const selector = node.selector;
  if ('boolean' in selector) return [true, false];
  if ('select' in selector && selector.select) {
    return selector.select.options.map((option) =>
      typeof option === 'object' ? option.value : option,
    );
  }
  if ('ui_action' in selector) {
    return (selector.ui_action?.actions ?? []).map((action) => ({ action }));
  }
  if ('entity' in selector && !selector.entity?.multiple) {
    const domain = selector.entity?.filter?.domain;
    return ['', `${typeof domain === 'string' ? domain : 'sensor'}.home`];
  }
  if ('number' in selector) return [undefined, 0, 3];
  return undefined;
}

/**
 * Whether a gate's conditions hold, read as the table defines them: every requirement, and
 * every condition of at least one `anyOf` branch.
 *
 * @param gate - Gate
 * @param data - Form data
 * @returns `true` when the gate is open
 */
function opensWith(gate: Gate, data: GateData): boolean {
  const meets = (prereq: Prereq): boolean => prereq.holds(fieldValue(data, prereq.field));
  return (
    gate.requires.every(meets) &&
    (gate.anyOf === undefined || gate.anyOf.some((branch) => branch.every(meets)))
  );
}

/**
 * A gate's conditions, its requirements first.
 *
 * @param gate - Gate
 * @param branch - `anyOf` branch, when it has them
 * @returns The conditions of that conjunction
 */
function conditionsOf(gate: Gate, branch: number | undefined): ReadonlyArray<Prereq> {
  return [...gate.requires, ...(branch === undefined ? [] : (gate.anyOf?.[branch] ?? []))];
}

/**
 * Replays a gate's opening edits from a fresh card, without the corpus.
 *
 * @param gate - Gate
 * @param workspace - Workspace the edits are made in
 * @param display - Layout the card displays
 * @param branch - `anyOf` branch, when it has them
 * @returns The opened configuration, or `undefined` when an edit is not offered there
 */
function replay(
  gate: Gate,
  workspace: EditorWorkspace,
  display: Types.EffectiveView,
  branch: number | undefined,
): Types.Config | undefined {
  let config: Types.Config | undefined = freshConfig(display);
  for (const [id, value] of openingEdits(gate, branch ?? 0)) {
    config = config && applyFieldEdit(config, workspace, id, value);
  }
  return config;
}

/** Every gate opening: gate, workspace, display and branch. */
const OPENINGS = ALL_GATES.flatMap(([name, gate]) =>
  WORKSPACES.flatMap((workspace) =>
    VIEWS.flatMap((display) =>
      (gate.anyOf ? gate.anyOf.map((_, index) => index) : [undefined]).map((branch) => ({
        name,
        gate,
        workspace,
        display,
        branch,
        at: `${name}${branch === undefined ? '' : `[${branch}]`} ${workspace}/${display}`,
        here: gate.fields.filter((id) => EXPECTED.get(workspace)!.has(id)),
      })),
    ),
  ),
);

/** Each opening replayed, once. */
const replays = once(() =>
  OPENINGS.map((opening) => ({
    ...opening,
    config: replay(opening.gate, opening.workspace, opening.display, opening.branch),
  })),
);

/**
 * What a gate's conditions say about a configuration, and which of its fields are present.
 *
 * @param opening - The opening
 * @param config - Configuration
 * @returns Whether the conditions hold, whether `firstUnmet` agrees, and the present fields
 */
function outcome(
  opening: ReturnType<typeof replays>[number],
  config: Types.Config,
): { expected: boolean; agrees: boolean; after: ReadonlyMap<FieldId, IndexedField> } {
  const data = formData(config, opening.workspace);
  const expected = opensWith(opening.gate, data);
  return {
    expected,
    agrees: (firstUnmet(opening.gate, data) === undefined) === expected,
    after: presentAmong(config, opening.workspace, opening.here),
  };
}

const openedOutcomes = new WeakMap<object, ReturnType<typeof outcome>>();

/**
 * The outcome for an opened state itself, worked out once: a change that writes what the state
 * already holds hands it back unchanged.
 *
 * @param opening - The opening
 * @returns Its outcome
 */
function openedOutcome(opening: ReturnType<typeof replays>[number]): ReturnType<typeof outcome> {
  let known = openedOutcomes.get(opening);
  if (known === undefined) openedOutcomes.set(opening, (known = outcome(opening, opening.config!)));
  return known;
}

/**
 * Compares the gate's fields with what its conditions say, after one change to an opened state.
 *
 * @param opening - The opening and its replayed state
 * @param edited - Configuration after the change
 * @param change - The change, for the message
 * @param into - Counts and findings being collected
 */
function compare(
  opening: ReturnType<typeof replays>[number],
  edited: Types.Config,
  change: string,
  into: { failures: string[]; absent: Set<FieldId>; holding: number; closing: number },
): void {
  const { expected, agrees, after } =
    edited === opening.config ? openedOutcome(opening) : outcome(opening, edited);
  if (!agrees) {
    into.failures.push(`${opening.at}: firstUnmet disagrees with the conditions after ${change}`);
  }
  for (const id of opening.here) {
    if (expected) into.holding += 1;
    else into.closing += 1;
    if (!after.has(id)) into.absent.add(id);
    if (after.has(id) !== expected) {
      into.failures.push(`${opening.at}: ${id} ${expected ? 'absent' : 'present'} after ${change}`);
    }
  }
}

/** From every opened state, each condition's control set to every value it offers. */
const offeredSweep = once(() => {
  const into = { failures: [] as string[], absent: new Set<FieldId>(), holding: 0, closing: 0 };
  let notOffered = 0;
  for (const opening of replays()) {
    if (opening.config === undefined || opening.here.length === 0) continue;
    const conditions = conditionsOf(opening.gate, opening.branch);
    const controls = presentAmong(
      opening.config,
      opening.workspace,
      conditions.map((prereq) => prereq.field),
    );
    for (const prereq of conditions) {
      const control = controls.get(prereq.field);
      if (control === undefined) {
        into.failures.push(`${opening.at}: ${prereq.field} is not offered once opened`);
        continue;
      }
      for (const value of domainOf(control.node) ?? []) {
        const edited = applyFieldEdit(opening.config, opening.workspace, prereq.field, value);
        if (edited === undefined) {
          notOffered += 1;
          continue;
        }
        compare(opening, edited, `${prereq.field} = ${JSON.stringify(value)}`, into);
      }
    }
  }
  return { ...into, notOffered };
});

/** From every opened state, each legal value of the options behind each condition. */
const legalSweep = once(() => {
  const into = { failures: [] as string[], absent: new Set<FieldId>(), holding: 0, closing: 0 };
  let combinations = 0;
  for (const opening of replays()) {
    if (opening.config === undefined || opening.here.length === 0) continue;
    for (const prereq of conditionsOf(opening.gate, opening.branch)) {
      for (const combo of legalCombinations(prereq.field)) {
        combinations += 1;
        const edited = combo.reduce(
          (config, [path, value]) => writeLegal(config, opening.workspace, path, value),
          opening.config,
        );
        compare(opening, edited, `YAML ${JSON.stringify(Object.fromEntries(combo))}`, into);
      }
    }
  }
  return { ...into, combinations };
});

/** Every expected universe id absent from a fresh card, per workspace and display. */
const beyondFresh = once(() => {
  const beyond: Array<{ at: string; id: FieldId }> = [];
  for (const workspace of WORKSPACES) {
    for (const display of VIEWS) {
      const fresh = presentFields(freshConfig(display), workspace);
      for (const id of EXPECTED.get(workspace)!) {
        if (!fresh.has(id)) beyond.push({ at: `${workspace}/${display}`, id });
      }
    }
  }
  return beyond;
});

/**
 * Sets every control on a fresh card to every other value it offers, one at a time, and records
 * each field the change withholds.
 */
const freshChanges = once(() => {
  const withheld: Array<{ at: string; control: FieldId; value: unknown; id: FieldId }> = [];
  let changes = 0;
  for (const workspace of WORKSPACES) {
    for (const display of VIEWS) {
      const fresh = freshConfig(display);
      const shown = presentFields(fresh, workspace);
      const data = formData(fresh, workspace);
      for (const [control, field] of shown) {
        for (const value of domainOf(field.node) ?? []) {
          if (deepEqual(value, fieldValue(data, control))) continue;
          const edited = applyFieldEdit(fresh, workspace, control, value);
          if (edited === undefined) continue;
          changes += 1;
          const after = presentFields(edited, workspace);
          for (const id of shown.keys()) {
            if (!after.has(id))
              withheld.push({ at: `${workspace}/${display}`, control, value, id });
          }
        }
      }
    }
  }
  return { changes, withheld };
});

// --- The table, pinned ------------------------------------------------------------------------

/**
 * Every value a control's form can hold: what it offers, and what each legal value of its
 * options reaches it as.
 *
 * @param id - The control
 * @returns Its values, in that order, each once
 */
function formDomain(id: FieldId): ReadonlyArray<unknown> {
  const values = [...(domainOf(ANY_FIELD.get(id)!.node) ?? [])];
  const workspace = WORKSPACES.find((candidate) => EXPECTED.get(candidate)!.has(id))!;
  for (const combo of legalCombinations(id)) {
    const config = combo.reduce(
      (written, [path, value]) => writeLegal(written, workspace, path, value),
      freshConfig(workspace === 'shared' ? 'list' : workspace),
    );
    const value = fieldValue(formData(config, workspace), id);
    if (!values.some((known) => deepEqual(known, value))) values.push(value);
  }
  return values;
}

/**
 * The table as data, each predicate replaced by the values it accepts.
 *
 * @param table - `GATES` or `ENTRY_GATES`
 * @returns A copy `toEqual` can compare
 */
function normalized(table: Readonly<Record<string, Gate>>): Record<string, unknown> {
  const prereq = (p: Prereq) => ({
    field: p.field,
    opens: p.opens,
    accepts: formDomain(p.field).filter((value) => p.holds(value)),
    ...(p.needsKey ? { needsKey: p.needsKey } : {}),
  });
  return Object.fromEntries(
    Object.entries(table).map(([name, gate]) => [
      name,
      {
        kind: gate.kind,
        fields: gate.fields,
        requires: gate.requires.map(prereq),
        ...(gate.anyOf ? { anyOf: gate.anyOf.map((branch) => branch.map(prereq)) } : {}),
        ...(gate.needsKey ? { needsKey: gate.needsKey } : {}),
      },
    ]),
  );
}

/**
 * A condition as pinned.
 *
 * @param field - Control
 * @param opens - Opening value
 * @param accepts - Every value of its form that meets it
 * @param needsKey - Its own phrase, where it has one
 * @returns The pinned condition
 */
function p(field: FieldId, opens: unknown, accepts: ReadonlyArray<unknown>, needsKey?: string) {
  return { field, opens, accepts, ...(needsKey ? { needsKey } : {}) };
}

const W = 'weather:weather.';
const ON = [true];
const ENTITY = p(`${W}entity`, 'weather.home', ['weather.home']);
const BY_DAY = p(`${W}position`, 'date', ['date', 'both'], 'gate.needs.forecast_by_day');
const BY_EVENT = p(`${W}position`, 'event', ['event', 'both'], 'gate.needs.forecast_by_event');
const DETAILS = { action: 'details' };
/** What the card reads as no action: none, a bare key, and the card's own actions. */
const NOTHING = [{ action: 'none' }, null, ...CARD_ACTION_VALUES.map((action) => ({ action }))];

describe('the universe', () => {
  it('is pinned by value in each workspace', () => {
    const sizes = Object.fromEntries(
      WORKSPACES.map((workspace) => {
        const ids = [...UNIVERSE.get(workspace)!.keys()];
        return [
          workspace,
          {
            card: ids.filter((id) => !id.startsWith('calendar:')).length,
            calendar: ids.filter((id) => id.startsWith('calendar:')).length,
          },
        ];
      }),
    );
    console.info(`Universe by workspace: ${JSON.stringify(sizes)}.`);
    for (const workspace of WORKSPACES) {
      expect([...UNIVERSE.get(workspace)!.keys()].sort(), workspace).toEqual(
        [...EXPECTED.get(workspace)!].sort(),
      );
    }
    // All Layouts gained Multi-Day Banners on the card and on a calendar once Month read them
    // beside Grid; Month offers its own four and leaves out what it does not draw (`LACKS`).
    // Every workspace gained Layouts in Switcher, a whole-card setting. Month lost Time Position,
    // since its day list puts every time beside its title, and gained Event Gap, which sets that
    // list's events apart, and Events in Day List, the room that list keeps. List alone gained
    // the three settings of the month's name on its month separator (`LIST_ONLY`). Month then
    // lost the card's Height, its two lengths and the multi-day all-day time row: it sizes the
    // whole card with its own heights, and its day list splits every multi-day event. All
    // Layouts keeps all four, which more than one other layout reads.
    expect(sizes).toEqual({
      shared: { card: 153, calendar: 28 },
      list: { card: 162, calendar: 28 },
      column: { card: 158, calendar: 27 },
      grid: { card: 157, calendar: 27 },
      month: { card: 133, calendar: 27 },
    });
  });

  it('holds everything a replayed opening builds, and the corpus holds the replay', () => {
    const failures: string[] = [];
    let opened = 0;
    let built = 0;
    for (const opening of replays()) {
      if (opening.config === undefined) {
        if (opening.here.length > 0) failures.push(`${opening.at}: an opening edit is not offered`);
        continue;
      }
      opened += 1;
      const present = presentFields(opening.config, opening.workspace);
      for (const id of present.keys()) {
        built += 1;
        if (!UNIVERSE.get(opening.workspace)!.has(id)) {
          failures.push(`${opening.at}: builds ${id}, which the universe does not hold`);
        }
      }
      for (const id of opening.here) {
        if (!present.has(id)) failures.push(`${opening.at}: ${id} absent after opening`);
      }
      const state = STATES.find(
        (candidate) =>
          candidate.workspace === opening.workspace &&
          candidate.display === opening.display &&
          candidate.gate === opening.name &&
          candidate.branch === opening.branch,
      );
      if (!deepEqual(state?.config, opening.config)) {
        failures.push(`${opening.at}: the corpus does not hold this opening`);
      }
    }
    // Fresh cards too: nothing a fresh card builds may be missing from its universe.
    for (const workspace of WORKSPACES) {
      for (const display of VIEWS) {
        for (const id of presentFields(freshConfig(display), workspace).keys()) {
          built += 1;
          if (!UNIVERSE.get(workspace)!.has(id)) {
            failures.push(`fresh ${workspace}/${display}: builds ${id}, outside the universe`);
          }
        }
      }
    }
    console.info(
      `Replayed openings: ${opened} of ${OPENINGS.length} opened (${ALL_GATES.length} gates, ` +
        `${WORKSPACES.length} workspaces x ${VIEWS.length} displays, branches included); ` +
        `${built} built fields checked against the universe; corpus ${STATES.length} states.`,
    );
    expect(failures).toEqual([]);
    expect(opened).toBeGreaterThan(OPENINGS.length / 2);
    // The replays are computed on first use; the limit is set for a loaded machine rather than
    // for a hang.
  }, 30_000);
});

describe('the gate table against the builders', () => {
  it('closes each gate by every value its controls offer, and only by those it refuses', () => {
    const { failures, holding, closing, notOffered } = offeredSweep();
    console.info(
      `Offered values: ${closing} closed and ${holding} kept open, field by field; ` +
        `${notOffered} values not offered.`,
    );
    expect(failures).toEqual([]);
    expect(closing).toBeGreaterThan(1000);
    expect(holding).toBeGreaterThan(0);
    // Under a second alone; the limit is set for a loaded machine rather than for a hang.
  }, 30_000);

  it('reads every legal value of the options behind each condition as the builders do', () => {
    // A control offers fewer values than its option holds: Show Countdown is a switch, and
    // `show_countdown: once_per_day` reaches its form as that word.
    const unread = ALL_GATES.flatMap(([, gate]) =>
      [...gate.requires, ...(gate.anyOf ?? []).flat()].flatMap((prereq) =>
        configPaths(prereq.field).filter((path) => !(path in LEGAL)),
      ),
    );
    expect(unread).toEqual([]);

    const { failures, holding, closing, combinations } = legalSweep();
    console.info(
      `Legal values: ${combinations} written as YAML would hold them; ${closing} closed and ` +
        `${holding} kept open, field by field.`,
    );
    expect(failures).toEqual([]);
    expect(closing).toBeGreaterThan(0);
    expect(holding).toBeGreaterThan(0);
    // Under a second alone; the limit is set for a loaded machine rather than for a hang.
  }, 30_000);

  it('needs routed edits: a raw top-level value cannot open Grid’s location fields', () => {
    // Grid defaults Show Location off in its own block, and a layout's default outranks the top
    // level, so only an edit made in Grid, which lands in `time_grid:`, opens them there.
    const location = GATES.location.fields.filter((id) => EXPECTED.get('grid')!.has(id));
    expect(location.length).toBeGreaterThan(0);
    for (const display of VIEWS) {
      const raw = { ...freshConfig(display), show_location: true };
      const routed = replay(GATES.location, 'grid', display, undefined)!;
      expect(
        location.filter((id) => presentFields(raw, 'grid').has(id)),
        display,
      ).toEqual([]);
      expect(
        location.filter((id) => presentFields(routed, 'grid').has(id)),
        display,
      ).toEqual(location);
      expect(routed.time_grid?.show_location, display).toBe(true);
    }
  });
});

describe('the gate table', () => {
  it('is pinned by value', () => {
    expect(normalized(GATES)).toEqual({
      time: {
        kind: 'gate',
        fields: [
          'events:show_end_time',
          'events:show_duration',
          'events:show_single_allday_time',
          'events:show_multiday_allday_time',
          'events:time_two_digit_hours',
          'events:time_font_size',
          'events:time_color',
          'events:time_icon_size',
          'events:time_max_lines',
        ],
        requires: [p('events:show_time', true, ON)],
      },
      location: {
        kind: 'gate',
        fields: [
          'events:show_location_allday',
          'events:location_country_mode',
          'events:location_font_size',
          'events:location_color',
          'events:location_icon_size',
          'events:location_max_lines',
        ],
        requires: [p('events:show_location', true, ON)],
      },
      countries: {
        kind: 'mode-value',
        fields: ['events:location_country_pattern'],
        requires: [
          p('events:show_location', true, ON),
          p('events:location_country_mode', 'custom', ['custom']),
        ],
      },
      description: {
        kind: 'gate',
        fields: [
          'events:show_description_allday',
          'events:description_font_size',
          'events:description_color',
          'events:description_icon_size',
          'events:description_max_lines',
        ],
        requires: [p('events:show_description', true, ON)],
      },
      countdown: {
        kind: 'gate',
        fields: [
          'events:countdown_max_days',
          'events:show_countdown_allday',
          'events:countdown_once_per_day',
          'events:countdown_exact_days',
        ],
        requires: [p('events:show_countdown', true, [true, 'once_per_day'])],
      },
      progress_bar: {
        kind: 'gate',
        fields: [
          'events:progress_bar_color',
          'events:progress_bar_height',
          'events:progress_bar_width',
        ],
        requires: [p('events:show_progress_bar', true, ON)],
      },
      month: {
        kind: 'gate',
        fields: [
          'day_header:month_font_size',
          'day_header:month_color',
          'day_header:today_month_color',
          'day_header:weekend_month_color',
        ],
        requires: [p('day_header:show_month', true, ON)],
      },
      month_label: {
        kind: 'gate',
        fields: ['separators:month_separator_label'],
        requires: [p('separators:month_separator_width', '1px', ['1px', 'thin'])],
      },
      month_label_style: {
        kind: 'gate',
        fields: [
          'separators:month_separator_label_color',
          'separators:month_separator_label_font_size',
        ],
        requires: [
          p('separators:month_separator_width', '1px', ['1px', 'thin']),
          p('separators:month_separator_label', true, ON),
        ],
      },
      week_numbers: {
        kind: 'gate',
        fields: [
          'day_header:show_current_week_number',
          'day_header:week_number_font_size',
          'day_header:week_number_color',
          'day_header:week_number_background_color',
        ],
        requires: [p('day_header:week_number_mode', 'iso', ['iso', 'simple'])],
      },
      indicator_color: {
        kind: 'gate',
        fields: ['day_header:today_indicator_color'],
        requires: [
          p('day_header:today_indicator_style', 'dot', [
            'tile',
            'dot',
            'pulse',
            'glow',
            'icon',
            'custom',
          ]),
        ],
        needsKey: 'gate.needs.indicator_shown',
      },
      indicator_size: {
        kind: 'gate',
        fields: ['day_header:today_indicator_size', 'day_header:today_indicator_position'],
        requires: [
          p('day_header:today_indicator_style', 'dot', ['dot', 'pulse', 'glow', 'icon', 'custom']),
        ],
        needsKey: 'gate.needs.indicator_marker',
      },
      allday_badge: {
        kind: 'mode-value',
        fields: ['events:allday_badge_style', 'events:allday_badge_color_mode'],
        requires: [p('events:allday_badge_position', 'time', ['title', 'time'])],
      },
      badge_color: {
        kind: 'mode-value',
        fields: ['events:allday_badge_color'],
        requires: [
          p('events:allday_badge_position', 'time', ['title', 'time']),
          p('events:allday_badge_color_mode', 'custom', ['custom']),
        ],
      },
      today_when_empty: {
        kind: 'gate',
        fields: ['content:show_empty_today'],
        requires: [p('content:show_empty_days', false, [false])],
        needsKey: 'gate.needs.empty_days_off',
      },
      duplicates: {
        kind: 'gate',
        fields: ['content:duplicate_accent_color'],
        requires: [p('content:filter_duplicates_mode', 'exact', ['exact', 'ignore_location'])],
      },
      toolbar: {
        kind: 'gate',
        fields: [
          'card:toolbar.legend',
          'card:toolbar.add_event',
          'card:toolbar.view_switcher',
          'card:toolbar.reset',
          'card:toolbar.refresh',
          'card:toolbar.search',
          'card:toolbar.navigation',
          'card:toolbar.size',
        ],
        requires: [p('card:toolbar.show', true, ON)],
      },
      switcher_layouts: {
        kind: 'gate',
        fields: ['card:toolbar.view_switcher_layouts'],
        requires: [p('card:toolbar.show', true, ON), p('card:toolbar.view_switcher', true, ON)],
      },
      forecast: { kind: 'gate', fields: [`${W}position`], requires: [ENTITY] },
      forecast_by_day: {
        kind: 'gate',
        fields: [
          `${W}date.show_conditions`,
          `${W}date.show_high_temp`,
          `${W}date.show_low_temp`,
          `${W}date.show_uv_index`,
          `${W}date.icon_size`,
          `${W}date.font_size`,
          `${W}date.color`,
        ],
        requires: [ENTITY, BY_DAY],
      },
      uv_by_day: {
        kind: 'mode-value',
        fields: [`${W}date.uv_index_threshold`],
        requires: [ENTITY, BY_DAY, p(`${W}date.show_uv_index`, true, ON)],
      },
      forecast_by_event: {
        kind: 'gate',
        fields: [
          `${W}event.show_conditions`,
          `${W}event.show_temp`,
          `${W}event.show_uv_index`,
          `${W}event.daily_forecast_fallback`,
          `${W}event.icon_size`,
          `${W}event.font_size`,
          `${W}event.color`,
        ],
        requires: [ENTITY, BY_EVENT],
      },
      weather_lines: {
        kind: 'gate',
        fields: [`${W}event.max_lines`],
        requires: [ENTITY, BY_EVENT, p(`${W}event.show_conditions`, true, ON)],
      },
      uv_by_event: {
        kind: 'mode-value',
        fields: [`${W}event.uv_index_threshold`],
        requires: [ENTITY, BY_EVENT, p(`${W}event.show_uv_index`, true, ON)],
      },
      event_details: {
        kind: 'gate',
        fields: ['actions:allow_event_edit', 'actions:allow_event_delete'],
        requires: [],
        anyOf: [
          [p('actions:event_tap_action', DETAILS, [DETAILS])],
          [p('actions:event_hold_action', DETAILS, [DETAILS])],
        ],
        needsKey: 'gate.needs.event_details',
      },
      fixed_date: {
        kind: 'mode-value',
        fields: ['content:start_date_fixed'],
        requires: [p('content:start_date_mode', 'fixed', ['fixed'])],
      },
      relative_date: {
        kind: 'mode-value',
        fields: ['content:start_date_offset'],
        requires: [p('content:start_date_mode', 'offset', ['offset'])],
      },
      fixed_height: {
        kind: 'mode-value',
        fields: ['layout:card_height'],
        requires: [p('layout:height_mode', 'fixed', ['fixed'])],
      },
      maximum_height: {
        kind: 'mode-value',
        fields: ['layout:card_max_height'],
        requires: [p('layout:height_mode', 'maximum', ['maximum'])],
      },
      week_scroll: {
        kind: 'gate',
        fields: ['layout:month.week_scroll_min_width'],
        requires: [p('layout:month.week_scroll', true, ON)],
      },
      accent: {
        kind: 'mode-value',
        fields: ['events:accent_color'],
        requires: [p('events:accent_color_mode', 'custom', ['custom'])],
      },
      indicator_icon: {
        kind: 'mode-value',
        fields: ['day_header:today_indicator_icon'],
        requires: [p('day_header:today_indicator_style', 'icon', ['icon'])],
      },
      indicator_text: {
        kind: 'mode-value',
        fields: ['day_header:today_indicator_custom'],
        requires: [p('day_header:today_indicator_style', 'custom', ['custom'])],
      },
      compact_days: {
        kind: 'gate',
        fields: ['content:compact_events_complete_days'],
        requires: [p('content:compact_events_to_show', 3, [0, 3])],
        needsKey: 'gate.needs.events_limit',
      },
      open_links: {
        kind: 'gate',
        fields: ['actions:open_links'],
        requires: [
          p('actions:event_tap_action', NOTHING[0], NOTHING),
          p('actions:event_hold_action', NOTHING[0], NOTHING),
        ],
        needsKey: 'gate.needs.no_event_actions',
      },
      empty_days: {
        kind: 'gate',
        fields: ['content:empty_day_text', 'content:empty_day_color'],
        requires: [],
        anyOf: [
          [p('content:show_empty_days', true, ON)],
          [p('content:show_empty_days', false, [false]), p('content:show_empty_today', true, ON)],
        ],
        needsKey: 'gate.needs.empty_or_today',
      },
    });
  });

  it('pins the entry gates by value', () => {
    expect(normalized(ENTRY_GATES)).toEqual({
      accent_color: {
        kind: 'mode-value',
        fields: ['calendar:accent_color'],
        requires: [p('calendar:accent_color_mode', 'custom', ['custom'])],
      },
      label_icon_source: {
        kind: 'mode-value',
        fields: ['calendar:label_icon_source'],
        requires: [p('calendar:label_type', 'icon', ['icon'])],
      },
      label_icon_color: {
        kind: 'gate',
        fields: ['calendar:label_icon_color'],
        requires: [p('calendar:label_type', 'icon', ['icon'])],
      },
      label_image_source: {
        kind: 'mode-value',
        fields: ['calendar:label_image_source'],
        requires: [p('calendar:label_type', 'image', ['image'])],
      },
      label: {
        kind: 'mode-value',
        fields: ['calendar:label'],
        requires: [],
        anyOf: [
          [p('calendar:label_type', 'text', ['text'])],
          [
            p('calendar:label_type', 'icon', ['icon']),
            p('calendar:label_icon_source', 'custom', ['custom']),
          ],
          [p('calendar:label_type', 'image', ['image'])],
        ],
      },
      location_icon: {
        kind: 'gate',
        fields: ['calendar:location_icon'],
        requires: [],
        anyOf: [
          [
            p('events:show_location', true, ON),
            p('calendar:show_location', 'inherit', ['inherit']),
          ],
          [p('calendar:show_location', 'show', ['show'])],
        ],
      },
      show_in_legend: {
        kind: 'gate',
        fields: ['calendar:show_in_legend'],
        requires: [
          p('card:toolbar.show', true, ON),
          p('card:toolbar.legend', 'menu', ['menu', 'chips']),
        ],
        needsKey: 'gate.needs.calendar_filter',
      },
      show_weather: {
        kind: 'gate',
        fields: ['calendar:show_weather'],
        requires: [ENTITY, BY_EVENT],
        needsKey: 'gate.needs.forecast_by_event',
      },
    });
  });

  it('keeps its two tables apart, and each field behind one gate', () => {
    // A corpus state names its gate by key alone.
    expect(Object.keys(GATES).filter((key) => key in ENTRY_GATES)).toEqual([]);

    const owners = new Map<FieldId, string[]>();
    for (const [name, gate] of ALL_GATES) {
      for (const id of gate.fields) owners.set(id, [...(owners.get(id) ?? []), name]);
    }
    expect([...owners].filter(([, names]) => names.length > 1)).toEqual([]);
  });

  it('opens each condition with a value it accepts', () => {
    for (const [name, gate] of ALL_GATES) {
      const conditions = [...gate.requires, ...(gate.anyOf ?? []).flat()];
      expect(conditions.length, name).toBeGreaterThan(0);
      for (const prereq of conditions) {
        expect(formDomain(prereq.field), `${name}: ${prereq.field}`).toContainEqual(prereq.opens);
        expect(prereq.holds(prereq.opens), `${name}: ${prereq.field}`).toBe(true);
      }
    }
  });

  it('lists opening edits as the conditions, in order', () => {
    expect(openingEdits(GATES.uv_by_day)).toEqual([
      [`${W}entity`, 'weather.home'],
      [`${W}position`, 'date'],
      [`${W}date.show_uv_index`, true],
    ]);
    expect(openingEdits(GATES.empty_days, 1)).toEqual([
      ['content:show_empty_days', false],
      ['content:show_empty_today', true],
    ]);
  });

  it('resolves every phrase it names', () => {
    const keys = ALL_GATES.flatMap(([, gate]) => [
      gate.needsKey,
      ...[...gate.requires, ...(gate.anyOf ?? []).flat()].map((prereq) => prereq.needsKey),
    ]).filter((key): key is string => key !== undefined);
    expect(new Set(keys).size).toBe(10);
    expect(keys.filter((key) => !(key in EDITOR_STRINGS))).toEqual([]);
  });
});

describe('what a gate says it waits for', () => {
  const labelOf = (id: FieldId): string => {
    const field = ANY_FIELD.get(id)!;
    return computeLabel('en', field.node, field.labelPath);
  };
  /**
   * Edits a fresh card in one workspace, then explains a gate from the result.
   *
   * @param gate - Gate
   * @param workspace - Workspace
   * @param edits - Field and value pairs, applied in order
   * @returns The explanation, and the condition it names
   */
  const explain = (
    gate: Gate,
    workspace: EditorWorkspace,
    edits: ReadonlyArray<readonly [FieldId, unknown]>,
  ) => {
    let config = freshConfig('list');
    for (const [id, value] of edits) config = applyFieldEdit(config, workspace, id, value)!;
    const data = formData(config, workspace);
    return { text: needsText(gate, data, 'en', labelOf), unmet: firstUnmet(gate, data)?.field };
  };

  it('names whichever condition is unmet, so one gate explains itself differently', () => {
    const entity: readonly [FieldId, unknown] = [`${W}entity`, 'weather.home'];
    const beside: readonly [FieldId, unknown] = [`${W}position`, 'event'];
    const lines = [
      explain(GATES.weather_lines, 'shared', []),
      explain(GATES.weather_lines, 'shared', [entity]),
      explain(GATES.weather_lines, 'shared', [
        entity,
        beside,
        [`${W}event.show_conditions`, false],
      ]),
      explain(GATES.weather_lines, 'shared', [entity, beside]),
    ];
    expect(lines).toEqual([
      { text: 'Weather Entity', unmet: `${W}entity` },
      { text: 'the forecast beside each event', unmet: `${W}position` },
      { text: 'Show Conditions Beside Events', unmet: `${W}event.show_conditions` },
      { text: undefined, unmet: undefined },
    ]);
  });

  it('falls back to the gate’s own words for a condition without its own', () => {
    // Either event action keeps links off; the line says so the same way for both.
    expect(explain(GATES.open_links, 'list', [['actions:event_tap_action', DETAILS]])).toEqual({
      text: 'both event actions set to Nothing',
      unmet: 'actions:event_tap_action',
    });
    expect(explain(GATES.open_links, 'list', [['actions:event_hold_action', DETAILS]])).toEqual({
      text: 'both event actions set to Nothing',
      unmet: 'actions:event_hold_action',
    });
    expect(explain(GATES.empty_days, 'list', []).text).toBe(
      'Show Empty Days or Show Today When Empty',
    );
    expect(explain(GATES.fixed_date, 'list', []).text).toBe('Start Date');
  });

  it('names the condition closest to holding when no branch holds', () => {
    // The card's switch while the calendar follows it; the calendar's own answer once it hides.
    expect(explain(ENTRY_GATES.location_icon, 'shared', [['events:show_location', false]])).toEqual(
      { text: 'Show Location', unmet: 'events:show_location' },
    );
    expect(
      explain(ENTRY_GATES.location_icon, 'shared', [['calendar:show_location', 'hide']]),
    ).toEqual({ text: 'Event Locations', unmet: 'calendar:show_location' });
  });
});

describe('the universe against the gate table', () => {
  it('gates everything a workspace offers beyond a fresh card', () => {
    const gated = new Set(ALL_GATES.flatMap(([, gate]) => gate.fields));
    const beyond = beyondFresh();
    console.info(`Beyond a fresh card: ${beyond.length} ids absent from one.`);
    expect(beyond.filter(({ id }) => !gated.has(id)).map(({ at, id }) => `${at}: ${id}`)).toEqual(
      [],
    );
    expect(beyond.length).toBeGreaterThan(0);
  });

  it('explains every field a single change on a fresh card withholds', () => {
    // Walks the builders' own controls, not the table, so a gate deleted from the table is
    // noticed even where its fields are present on every fresh card.
    const { changes, withheld } = freshChanges();
    console.info(
      `Fresh-card changes: ${changes} single edits, ${withheld.length} fields withheld.`,
    );
    const unexplained = withheld.filter(
      ({ control, id }) =>
        !ALL_GATES.some(
          ([, gate]) =>
            gate.fields.includes(id) &&
            [...gate.requires, ...(gate.anyOf ?? []).flat()].some(
              (prereq) => prereq.field === control,
            ),
        ),
    );
    expect(
      unexplained.map(
        ({ at, control, value, id }) =>
          `${at}: ${control} = ${JSON.stringify(value)} withholds ${id}`,
      ),
    ).toEqual([]);
    expect(withheld.length).toBeGreaterThan(0);
    // Under a second alone; the limit is set for a loaded machine rather than for a hang.
  }, 30_000);

  it('withholds every gated field somewhere, and offers it somewhere', () => {
    const absent = new Set([
      ...offeredSweep().absent,
      ...legalSweep().absent,
      ...beyondFresh().map(({ id }) => id),
      ...freshChanges().withheld.map(({ id }) => id),
    ]);
    const fields = ALL_GATES.flatMap(([, gate]) => gate.fields);
    expect(fields.filter((id) => !PLACED.includes(id))).toEqual([]);
    expect(
      fields.filter((id) => !WORKSPACES.some((workspace) => EXPECTED.get(workspace)!.has(id))),
    ).toEqual([]);
    expect(fields.filter((id) => !absent.has(id))).toEqual([]);
  });
});
