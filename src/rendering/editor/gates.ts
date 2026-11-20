/**
 * Why a field is withheld, and how to open it.
 *
 * Each gate names the fields a builder withholds and the controls that decide it, with the
 * value a user would set to open each one. The builders stay the authority on presence: this
 * table describes their branches, and `tests/editor-gates.test.ts` holds it to them in every
 * workspace and display, opened and closed. The probe corpus, the universe index, and later
 * the gate lines and search all read it.
 *
 * 🚨 This module and `field-index.ts` import each other; see the note at the top of that one.
 */

import { CHIP_LABELS } from './chip-labels';
import * as Entities from './entities';
import {
  type FieldId,
  type FieldIndex,
  entityFieldIndex,
  entrySchema,
  panelFieldIndex,
  parseFieldId,
  schemaCtx,
} from './field-index';
import { humanize, lookup } from './localize';
import { LEGEND_OFF } from './normalize';
import * as Routing from './routing';
import { interpolate } from './strings';
import { WEATHER_ENTITY } from './weather-fields';
import * as Workspace from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import { VIEWS, isZeroLength } from '../../config/view';
import { eventActionKind } from '../../interaction/event-action-kind';
import * as Helpers from '../../utils/helpers';

/** One condition a gate waits on. */
export interface Prereq {
  /** The control a reader changes. */
  readonly field: FieldId;
  /** The value an opening edit writes, through routing, as a user would. */
  readonly opens: unknown;
  /**
   * Whether a value of that control, as its form holds it, meets the condition. It takes every
   * value the option's type allows, not only the ones the control offers: `show_countdown:
   * once_per_day` reaches the Show Countdown switch's form as that word, and is on.
   */
  readonly holds: (value: unknown) => boolean;
  /** What search's Needs tag names while this condition is unmet, where the control's label does not read. */
  readonly needsKey?: string;
  /**
   * The clause a gate line gives while this condition is unmet, written to follow "Appears once":
   * "a Weather Entity is chosen". A switch needs none (`gate.when.on`).
   */
  readonly whenKey?: string;
}

/** A set of fields a builder withholds until its conditions hold. */
export interface Gate {
  /** What it withholds. */
  readonly fields: ReadonlyArray<FieldId>;
  /** All of them must hold, nearest last. */
  readonly requires: ReadonlyArray<Prereq>;
  /** And, when present, every condition of at least one of these. */
  readonly anyOf?: ReadonlyArray<ReadonlyArray<Prereq>>;
  /** A mode value never gets a gate line: its mode control already says what it waits for. */
  readonly kind: 'gate' | 'mode-value';
  /** What search's Needs tag names for any unmet condition without a phrase of its own. */
  readonly needsKey?: string;
  /** The gate line's clause for any unmet condition without one of its own. */
  readonly whenKey?: string;
}

/**
 * A condition on a control.
 *
 * @param field - The control
 * @param opens - The value that opens it
 * @param holds - Whether a value meets it
 * @returns The condition
 */
function needs(field: FieldId, opens: unknown, holds: (value: unknown) => boolean): Prereq {
  return { field, opens, holds };
}

/**
 * The same condition, named by a phrase rather than by its control's label: a noun phrase for
 * search's Needs tag, and a clause for a gate line.
 *
 * @param prereq - The condition
 * @param needsKey - String key of the noun phrase, or none where the label serves
 * @param whenKey - String key of the clause
 * @returns The condition with its phrases
 */
function phrased(prereq: Prereq, needsKey: string | undefined, whenKey: string): Prereq {
  return needsKey === undefined ? { ...prereq, whenKey } : { ...prereq, needsKey, whenKey };
}

/**
 * A switch that must be on.
 *
 * @param field - The switch
 * @returns The condition
 */
function on(field: FieldId): Prereq {
  return needs(field, true, (value) => value === true);
}

/**
 * A switch that must be off.
 *
 * @param field - The switch
 * @returns The condition
 */
function off(field: FieldId): Prereq {
  return needs(field, false, (value) => value === false);
}

/**
 * A choice that must be one of a few values; the first one opens it.
 *
 * @param field - The control
 * @param values - Values that meet it
 * @returns The condition
 */
function oneOf(field: FieldId, ...values: ReadonlyArray<string>): Prereq {
  return needs(field, values[0], (value) => values.includes(value as string));
}

/**
 * A choice that must be anything but a few values.
 *
 * @param field - The control
 * @param opens - The value that opens it
 * @param values - Values that do not meet it
 * @returns The condition
 */
function noneOf(field: FieldId, opens: string, ...values: ReadonlyArray<string>): Prereq {
  return needs(field, opens, (value) => !values.includes(value as string));
}

/**
 * A field that must hold something.
 *
 * @param field - The field
 * @param opens - A value that opens it
 * @returns The condition
 */
function filled(field: FieldId, opens: string): Prereq {
  return needs(field, opens, (value) => typeof value === 'string' && value !== '');
}

/**
 * An event action that must be the event dialog.
 *
 * @param field - Event tap or hold action
 * @returns The condition
 */
function opensDetails(field: FieldId): Prereq {
  return needs(
    field,
    { action: 'details' },
    (value) => eventActionKind(asAction(value)) === 'details',
  );
}

/**
 * An event action that must run nothing of its own, read as the card reads it.
 *
 * @param field - Event tap or hold action
 * @returns The condition
 */
function runsNothing(field: FieldId): Prereq {
  return needs(field, { action: 'none' }, (value) => eventActionKind(asAction(value)) === 'none');
}

/**
 * Narrows a form value to an action.
 *
 * @param value - Form value
 * @returns The action, or `undefined`
 */
function asAction(value: unknown): Types.ActionConfig | undefined {
  return Helpers.isConfigBlock(value) ? (value as unknown as Types.ActionConfig) : undefined;
}

const W = 'weather:weather.';

const HAS_WEATHER = phrased(
  filled(WEATHER_ENTITY, 'weather.home'),
  undefined,
  'gate.when.weather_entity',
);
const BY_DAY = phrased(
  oneOf(`${W}position`, 'date', 'both'),
  'gate.needs.forecast_by_day',
  'gate.when.forecast_by_day',
);
const BY_EVENT = phrased(
  oneOf(`${W}position`, 'event', 'both'),
  'gate.needs.forecast_by_event',
  'gate.when.forecast_by_event',
);

// A month rule is drawn, read as the card reads the width: unless the width is a zero length.
const MONTH_RULE = phrased(
  needs(
    'separators:month_separator_width',
    '1px',
    (value) => typeof value === 'string' && !isZeroLength(value),
  ),
  undefined,
  'gate.when.month_rule',
);

export const GATES: Readonly<Record<string, Gate>> = {
  time: {
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
    requires: [on('events:show_time')],
    kind: 'gate',
  },
  location: {
    fields: [
      'events:show_location_allday',
      'events:location_country_mode',
      'events:location_font_size',
      'events:location_color',
      'events:location_icon_size',
      'events:location_max_lines',
    ],
    requires: [on('events:show_location')],
    kind: 'gate',
  },
  countries: {
    fields: ['events:location_country_pattern'],
    requires: [on('events:show_location'), oneOf('events:location_country_mode', 'custom')],
    kind: 'mode-value',
  },
  description: {
    fields: [
      'events:show_description_allday',
      'events:description_font_size',
      'events:description_color',
      'events:description_icon_size',
      'events:description_max_lines',
    ],
    requires: [on('events:show_description')],
    kind: 'gate',
  },
  countdown: {
    fields: [
      'events:countdown_max_days',
      'events:show_countdown_allday',
      'events:countdown_once_per_day',
      'events:countdown_exact_days',
    ],
    // `once_per_day` is on as well: the countdown, shown once a day (`countdown_once_per_day`).
    requires: [
      needs('events:show_countdown', true, (value) => value === true || value === 'once_per_day'),
    ],
    kind: 'gate',
  },
  progress_bar: {
    fields: [
      'events:progress_bar_color',
      'events:progress_bar_height',
      'events:progress_bar_width',
    ],
    requires: [on('events:show_progress_bar')],
    kind: 'gate',
  },
  month: {
    fields: [
      'day_header:month_font_size',
      'day_header:month_color',
      'day_header:today_month_color',
      'day_header:weekend_month_color',
    ],
    requires: [on('day_header:show_month')],
    kind: 'gate',
  },
  month_label: {
    fields: ['separators:month_separator_label'],
    requires: [MONTH_RULE],
    kind: 'gate',
  },
  month_label_style: {
    fields: [
      'separators:month_separator_label_color',
      'separators:month_separator_label_font_size',
    ],
    requires: [MONTH_RULE, on('separators:month_separator_label')],
    kind: 'gate',
  },
  week_numbers: {
    fields: [
      'day_header:show_current_week_number',
      'day_header:week_number_font_size',
      'day_header:week_number_color',
      'day_header:week_number_background_color',
    ],
    requires: [
      phrased(
        noneOf('day_header:week_number_mode', 'iso', 'none'),
        undefined,
        'gate.when.week_numbers',
      ),
    ],
    kind: 'gate',
  },
  indicator_color: {
    fields: ['day_header:today_indicator_color'],
    // Opened by the tile, the one style every layout draws: Month reads any other as none.
    requires: [noneOf('day_header:today_indicator_style', 'tile', 'none')],
    kind: 'gate',
    needsKey: 'gate.needs.indicator_shown',
    whenKey: 'gate.when.indicator_shown',
  },
  indicator_size: {
    fields: ['day_header:today_indicator_size', 'day_header:today_indicator_position'],
    requires: [noneOf('day_header:today_indicator_style', 'dot', 'none', 'tile')],
    kind: 'gate',
    needsKey: 'gate.needs.indicator_marker',
    whenKey: 'gate.when.indicator_marker',
  },
  allday_badge: {
    fields: ['events:allday_badge_style', 'events:allday_badge_color_mode'],
    requires: [noneOf('events:allday_badge_position', 'time', 'off')],
    kind: 'mode-value',
  },
  badge_color: {
    fields: ['events:allday_badge_color'],
    requires: [
      noneOf('events:allday_badge_position', 'time', 'off'),
      oneOf('events:allday_badge_color_mode', 'custom'),
    ],
    kind: 'mode-value',
  },
  today_when_empty: {
    fields: ['content:show_empty_today'],
    requires: [off('content:show_empty_days')],
    kind: 'gate',
    needsKey: 'gate.needs.empty_days_off',
    whenKey: 'gate.when.empty_days_off',
  },
  duplicates: {
    fields: ['content:duplicate_accent_color'],
    requires: [
      phrased(
        noneOf('content:filter_duplicates_mode', 'exact', 'off'),
        undefined,
        'gate.when.duplicates',
      ),
    ],
    kind: 'gate',
  },
  toolbar: {
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
    requires: [on('card:toolbar.show')],
    kind: 'gate',
  },
  // Which layouts the switcher offers, only while the toolbar draws one.
  switcher_layouts: {
    fields: ['card:toolbar.view_switcher_layouts'],
    requires: [on('card:toolbar.show'), on('card:toolbar.view_switcher')],
    kind: 'gate',
  },
  forecast: {
    fields: [`${W}position`],
    requires: [HAS_WEATHER],
    kind: 'gate',
  },
  forecast_by_day: {
    fields: [
      `${W}date.show_conditions`,
      `${W}date.show_high_temp`,
      `${W}date.show_low_temp`,
      `${W}date.show_uv_index`,
      `${W}date.icon_size`,
      `${W}date.font_size`,
      `${W}date.color`,
    ],
    requires: [HAS_WEATHER, BY_DAY],
    kind: 'gate',
  },
  uv_by_day: {
    fields: [`${W}date.uv_index_threshold`],
    requires: [HAS_WEATHER, BY_DAY, on(`${W}date.show_uv_index`)],
    kind: 'mode-value',
  },
  forecast_by_event: {
    fields: [
      `${W}event.show_conditions`,
      `${W}event.show_temp`,
      `${W}event.show_uv_index`,
      `${W}event.daily_forecast_fallback`,
      `${W}event.icon_size`,
      `${W}event.font_size`,
      `${W}event.color`,
    ],
    requires: [HAS_WEATHER, BY_EVENT],
    kind: 'gate',
  },
  weather_lines: {
    fields: [`${W}event.max_lines`],
    requires: [HAS_WEATHER, BY_EVENT, on(`${W}event.show_conditions`)],
    kind: 'gate',
  },
  uv_by_event: {
    fields: [`${W}event.uv_index_threshold`],
    requires: [HAS_WEATHER, BY_EVENT, on(`${W}event.show_uv_index`)],
    kind: 'mode-value',
  },
  // Either action opens the event dialog, as `synthetic.ts` › `eventOpensDetails` reads them.
  event_details: {
    fields: ['actions:allow_event_edit', 'actions:allow_event_delete'],
    requires: [],
    anyOf: [
      [opensDetails('actions:event_tap_action')],
      [opensDetails('actions:event_hold_action')],
    ],
    kind: 'gate',
    needsKey: 'gate.needs.event_details',
    whenKey: 'gate.when.event_details',
  },
  fixed_date: {
    fields: ['content:start_date_fixed'],
    requires: [oneOf('content:start_date_mode', 'fixed')],
    kind: 'mode-value',
  },
  relative_date: {
    fields: ['content:start_date_offset'],
    requires: [oneOf('content:start_date_mode', 'offset')],
    kind: 'mode-value',
  },
  fixed_height: {
    fields: ['layout:fixed_height'],
    requires: [oneOf('layout:height_mode', 'fixed')],
    kind: 'mode-value',
  },
  maximum_height: {
    fields: ['layout:maximum_height'],
    requires: [oneOf('layout:height_mode', 'maximum')],
    kind: 'mode-value',
  },
  fewer_days: {
    fields: ['layout:column.min_days_to_show', 'layout:time_grid.min_days_to_show'],
    requires: [oneOf('layout:narrow_fit', 'fewer', 'custom')],
    kind: 'mode-value',
  },
  custom_fit: {
    fields: ['layout:column.min_days_fallback', 'layout:time_grid.min_days_fallback'],
    requires: [oneOf('layout:narrow_fit', 'custom')],
    kind: 'mode-value',
  },
  accent: {
    fields: ['events:accent_color'],
    requires: [oneOf('events:accent_color_mode', 'custom')],
    kind: 'mode-value',
  },
  indicator_icon: {
    fields: ['day_header:today_indicator_icon'],
    requires: [oneOf('day_header:today_indicator_style', 'icon')],
    kind: 'mode-value',
  },
  indicator_text: {
    fields: ['day_header:today_indicator_custom'],
    requires: [oneOf('day_header:today_indicator_style', 'custom')],
    kind: 'mode-value',
  },
  compact_days: {
    fields: ['content:compact_events_complete_days'],
    requires: [
      needs(
        'content:compact_events_to_show',
        3,
        (value) => Config.toValidNumber(value, 0) !== undefined,
      ),
    ],
    kind: 'gate',
    needsKey: 'gate.needs.events_limit',
    whenKey: 'gate.when.events_limit',
  },
  // Neither action may run anything, as `synthetic.ts` › `eventHasOwnAction` reads them.
  open_links: {
    fields: ['actions:open_links'],
    requires: [runsNothing('actions:event_tap_action'), runsNothing('actions:event_hold_action')],
    kind: 'gate',
    needsKey: 'gate.needs.no_event_actions',
    whenKey: 'gate.when.no_event_actions',
  },
  // The either-or gate: empty days shown, or today kept while they are hidden.
  empty_days: {
    fields: ['content:empty_day_text', 'content:empty_day_color'],
    requires: [],
    anyOf: [
      [on('content:show_empty_days')],
      [off('content:show_empty_days'), on('content:show_empty_today')],
    ],
    kind: 'gate',
    needsKey: 'gate.needs.empty_or_today',
    whenKey: 'gate.when.empty_or_today',
  },
};

/**
 * Gates on a calendar entry's fields, read from `schemas/entity.ts` › `entitySchemaFor` and
 * the arguments `element.ts` › `_renderEntities` hands it. Some wait on the card's controls.
 */
export const ENTRY_GATES: Readonly<Record<string, Gate>> = {
  accent_color: {
    fields: ['calendar:accent_color'],
    requires: [oneOf('calendar:accent_color_mode', 'custom')],
    kind: 'mode-value',
  },
  label_icon_source: {
    fields: ['calendar:label_icon_source'],
    requires: [oneOf('calendar:label_type', 'icon')],
    kind: 'mode-value',
  },
  label_icon_color: {
    fields: ['calendar:label_icon_color'],
    requires: [phrased(oneOf('calendar:label_type', 'icon'), undefined, 'gate.when.label_icon')],
    kind: 'gate',
  },
  label_image_source: {
    fields: ['calendar:label_image_source'],
    requires: [oneOf('calendar:label_type', 'image')],
    kind: 'mode-value',
  },
  label: {
    fields: ['calendar:label'],
    requires: [],
    anyOf: [
      [oneOf('calendar:label_type', 'text')],
      [oneOf('calendar:label_type', 'icon'), oneOf('calendar:label_icon_source', 'custom')],
      [oneOf('calendar:label_type', 'image')],
    ],
    kind: 'mode-value',
  },
  // The card's answer while the entry follows it, or the entry's own (`entities.ts` ›
  // `showsLocation`). The card's comes first, so a line names its Show Location.
  location_icon: {
    fields: ['calendar:location_icon'],
    requires: [],
    anyOf: [
      [on('events:show_location'), oneOf('calendar:show_location', 'inherit')],
      [oneOf('calendar:show_location', 'show')],
    ],
    kind: 'gate',
    whenKey: 'gate.when.location_shown',
  },
  show_in_legend: {
    fields: ['calendar:show_in_legend'],
    requires: [on('card:toolbar.show'), noneOf('card:toolbar.legend', 'menu', LEGEND_OFF)],
    kind: 'gate',
    needsKey: 'gate.needs.calendar_filter',
    whenKey: 'gate.when.calendar_filter',
  },
  // Read in the scope the calendar's page is open in: the layout's own forecast beside events.
  show_weather: {
    fields: ['calendar:show_weather'],
    requires: [HAS_WEATHER, BY_EVENT],
    kind: 'gate',
    needsKey: 'gate.needs.forecast_by_event',
    whenKey: 'gate.when.forecast_by_event',
  },
};

/**
 * The edits that open a gate, in order: its requirements, then one of its `anyOf` branches.
 *
 * @param gate - Gate to open
 * @param branch - Which `anyOf` conjunction to open it by
 * @returns Field and value pairs, applied one after another
 */
export function openingEdits(gate: Gate, branch = 0): ReadonlyArray<readonly [FieldId, unknown]> {
  return [...gate.requires, ...(gate.anyOf?.[branch] ?? [])].map(
    (prereq) => [prereq.field, prereq.opens] as const,
  );
}

/** The form data a gate's conditions are read from. */
export interface GateData {
  /** The card's form data in the workspace, as `routing.ts` › `workspaceFormData` builds it. */
  readonly card: Readonly<Record<string, unknown>>;
  /** One calendar entry's form data, as `entities.ts` › `toEntityFormData` builds it. */
  readonly entry?: Readonly<Record<string, unknown>>;
}

/**
 * A field's value as its form holds it: a card field at its data path, a calendar field in
 * the entry's own data.
 *
 * @param data - Form data
 * @param id - Field
 * @returns Its value, or `undefined` where the data holds none
 */
export function fieldValue(data: GateData, id: FieldId): unknown {
  const { scope, dataPath, name } = parseFieldId(id);
  return scope === 'calendar'
    ? Routing.atPath(data.entry, [], name)
    : Routing.atPath(data.card, dataPath, name);
}

/**
 * The condition a gate line names: the first unmet requirement, else, when no `anyOf` branch
 * holds, the first unmet condition of the branch closest to holding, the earliest on a tie.
 *
 * @param gate - Gate
 * @param data - Form data
 * @returns The condition, or `undefined` while the gate is open
 */
export function firstUnmet(gate: Gate, data: GateData): Prereq | undefined {
  const unmet = (conditions: ReadonlyArray<Prereq>): Prereq[] =>
    conditions.filter((prereq) => !prereq.holds(fieldValue(data, prereq.field)));

  const required = unmet(gate.requires);
  if (required.length > 0) return required[0];
  if (gate.anyOf === undefined) return undefined;

  let closest: Prereq[] | undefined;
  for (const branch of gate.anyOf) {
    const missing = unmet(branch);
    if (missing.length === 0) return undefined;
    if (closest === undefined || missing.length < closest.length) closest = missing;
  }
  return closest?.[0];
}

/**
 * What a gate waits for, in words: the `{needs}` of "Appears with {needs}: {names}." It names
 * the unmet condition by its own phrase, else by the gate's, else by its control's label, so
 * one gate can explain itself differently as different conditions are unmet. Weather Lines
 * says Weather Entity with no forecast, the forecast beside each event while it is drawn
 * elsewhere, and Show Conditions while that switch is off.
 *
 * @param gate - Gate
 * @param data - Form data
 * @param language - Editor language
 * @param labelOf - A control's label in that language
 * @returns The words, or `undefined` while the gate is open
 */
export function needsText(
  gate: Gate,
  data: GateData,
  language: string,
  labelOf: (id: FieldId) => string,
): string | undefined {
  const unmet = firstUnmet(gate, data);
  if (unmet === undefined) return undefined;

  const key = unmet.needsKey ?? gate.needsKey;
  return key === undefined ? labelOf(unmet.field) : (lookup(language, key) ?? humanize(key));
}

/**
 * The clause key a gate line gives for one of its conditions: the condition's own, else its
 * gate's, else, for a switch, `gate.when.pressed`, "{part} is pressed", where the editor draws it
 * as a toggle chip (`chip-labels.ts`), and `gate.when.on`, "{label} is on", where it draws a
 * switch (`tests/editor-gate-lines.test.ts` holds every other condition to a clause).
 *
 * @param gate - Gate
 * @param prereq - One of its conditions
 * @returns The string key
 */
export function whenKeyOf(gate: Gate, prereq: Prereq): string {
  return (
    prereq.whenKey ??
    gate.whenKey ??
    (prereq.field in CHIP_LABELS ? 'gate.when.pressed' : 'gate.when.on')
  );
}

/**
 * What a gate waits for, as the clause that follows "Appears once" in its gate line: "Show
 * Description is on", "the forecast shows beside events". Named by the first unmet condition, so
 * one gate explains itself differently as different conditions are unmet, as `needsText` does
 * for search.
 *
 * @param gate - Gate
 * @param data - Form data
 * @param language - Editor language
 * @param labelOf - A control's label in that language
 * @returns The clause, or `undefined` while the gate is open
 */
export function whenText(
  gate: Gate,
  data: GateData,
  language: string,
  labelOf: (id: FieldId) => string,
): string | undefined {
  const unmet = firstUnmet(gate, data);
  if (unmet === undefined) return undefined;
  const key = whenKeyOf(gate, unmet);
  const chip = CHIP_LABELS[unmet.field];
  return interpolate(lookup(language, key) ?? humanize(key), {
    label: labelOf(unmet.field),
    part: chip === undefined ? '' : (lookup(language, chip) ?? humanize(chip)),
  });
}

/** One configuration of the corpus. */
export interface CorpusState {
  /** The scope the opening edits were made in. */
  readonly workspace: Workspace.EditorWorkspace;
  /** The layout the card displays. */
  readonly display: Types.EffectiveView;
  /** The gate opened, a key of `GATES` or `ENTRY_GATES`; absent for the fresh card. */
  readonly gate?: string;
  /** Which `anyOf` conjunction opened it. */
  readonly branch?: number;
  /** The configuration as the editor holds it, merged with root defaults. */
  readonly config: Types.Config;
}

/** The corpus's calendar, an invented one. */
const SAMPLE_CALENDAR = 'calendar.anna';

/**
 * A fresh card displaying one layout, with one calendar, as the editor holds it.
 *
 * @param display - The layout the card displays
 * @returns The configuration
 */
export function freshConfig(display: Types.EffectiveView): Types.Config {
  return { ...structuredClone(Config.DEFAULT_CONFIG), entities: [SAMPLE_CALENDAR], view: display };
}

/**
 * A copy of form data with one value replaced at a data path.
 *
 * @param data - Form data
 * @param path - Enclosing data keys
 * @param name - Field name
 * @param value - New value
 * @returns The new data
 */
function withValue(
  data: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return { ...data, [name]: value };
  const [head, ...rest] = path;
  const inner = Helpers.isConfigBlock(data[head]) ? data[head] : {};
  return { ...data, [head]: withValue(inner, rest, name, value) };
}

/**
 * Changes one field as a user would: a card field through a one-field frame and
 * `routing.ts` › `applyWorkspaceChange`, a calendar field through `entities.ts` › `writeEntity`
 * on the first entry, each only where the editor offers that field.
 *
 * The configuration handed in is read, never changed, and what is derived from it is kept for
 * the next edit of the same object (`editedFrom`). So a caller replaces a configuration rather
 * than changing one in place: a changed one is served what was derived before the change.
 *
 * @param config - The configuration as the editor holds it, not to be changed in place later
 * @param workspace - Workspace the edit is made in
 * @param id - Field to change
 * @param value - Its new form value
 * @returns The configuration after the edit, or `undefined` when the field is not offered
 */
export function applyFieldEdit(
  config: Types.Config,
  workspace: Workspace.EditorWorkspace,
  id: FieldId,
  value: unknown,
): Types.Config | undefined {
  const from = editedFrom(config, workspace);
  const { scope, name } = parseFieldId(id);

  if (scope === 'calendar') {
    const entities = config.entities ?? [];
    const entry = entities[0];
    if (entry === undefined || !entityFieldIndex(entrySchema(entry, from.ctx)).fields.has(id)) {
      return undefined;
    }
    const data = { ...Entities.toEntityFormData(entry, entities), [name]: value };
    return { ...config, entities: Entities.writeEntity(entities, 0, data, config.accent_color) };
  }

  const field = from.panel(scope).fields.get(id);
  if (field === undefined) return undefined;

  const data = from.data();
  const incoming = withValue(data, field.dataPath, name, value);
  return Routing.applyWorkspaceChange(
    config,
    { workspace, schema: field.lifted, data },
    incoming,
    {},
  ).config;
}

/**
 * What every edit of one configuration in one workspace starts from: its schema context, its
 * form data and the panels built so far, each derived once. Edits made one after another from
 * the same state, as a sweep of a control's values makes them, share it.
 *
 * 🚨 Kept for the configuration last edited, by object identity, which relies on configurations
 * never being changed in place. Replacing one, as every edit here does, starts afresh; one changed
 * in place keeps the context, form data and panels derived before the change, and goes stale.
 */
const editedFrom = Helpers.memoizeLast(
  (config: Types.Config, workspace: Workspace.EditorWorkspace) => {
    const ctx = schemaCtx(config, workspace, 'en');
    const panels = new Map<string, FieldIndex>();
    let data: Record<string, unknown> | undefined;
    return {
      ctx,
      data: () => (data ??= Routing.workspaceFormData(config, workspace, {})),
      panel: (scope: string): FieldIndex => {
        let index = panels.get(scope);
        if (index === undefined) panels.set(scope, (index = panelFieldIndex(ctx, scope)));
        return index;
      },
    };
  },
);

let built: ReadonlyArray<CorpusState> | undefined;

/**
 * The gate corpus: for every workspace and display, the fresh card, then every gate of
 * `GATES` and `ENTRY_GATES` opened from it by its opening edits, one state per `anyOf` branch.
 *
 * A gate whose opening edit the workspace does not offer has no state there: its control is
 * another layout's.
 *
 * @returns Every state, fresh cards first within each workspace and display
 */
export function corpus(): ReadonlyArray<CorpusState> {
  if (built) return built;

  const states: CorpusState[] = [];
  const gates = [...Object.entries(GATES), ...Object.entries(ENTRY_GATES)];
  for (const workspace of Workspace.WORKSPACES) {
    for (const display of VIEWS) {
      const fresh = freshConfig(display);
      states.push({ workspace, display, config: fresh });

      for (const [gate, def] of gates) {
        for (let branch = 0; branch < Math.max(1, def.anyOf?.length ?? 0); branch += 1) {
          let config: Types.Config | undefined = fresh;
          for (const [id, value] of openingEdits(def, branch)) {
            config = config && applyFieldEdit(config, workspace, id, value);
          }
          if (config === undefined) continue;

          states.push({
            workspace,
            display,
            gate,
            ...(def.anyOf ? { branch } : {}),
            config,
          });
        }
      }
    }
  }

  built = states;
  return built;
}
