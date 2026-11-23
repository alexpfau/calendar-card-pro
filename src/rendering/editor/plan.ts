/**
 * The shown set: which fields a page draws live, which wait in its Add rows, which a gate line
 * names, and what each says about where its value comes from (backlog item 307).
 *
 * A field is live when it applies here and is essential, stored at this destination, inherited
 * with a value that differs from the default, added this session, or every setting is shown
 * (ia-final §5, rule 1). Applies here means the builders built it for this configuration and
 * workspace: they stay the one authority on presence, read through the present index. A field the
 * builders withhold here is named by its gate's first unmet condition (`gates.ts` › `firstUnmet`),
 * listed with its value when it is stored anyway (rule 2), or, outside this workspace's universe,
 * named in the page's line for the layouts that offer it.
 *
 * Stored means the YAML holds it, read from the stored configuration and never from the merged
 * one, which carries every default: present and neither `null` nor empty, #834's rule
 * (`filter.ts` › `holdsValue`), or text held while it is typed.
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import * as Entities from './entities';
import {
  type EntryAcross,
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchemaAcross,
  entryViews,
  parseFieldId,
  schemaCtx,
  universeIndex,
} from './field-index';
import {
  ENTRY_GATES,
  GATES,
  type Gate,
  type GateData,
  type Prereq,
  firstUnmet,
  needsText,
} from './gates';
import { humanize, lookup } from './localize';
import { normalizeRootValue } from './normalize';
import {
  type Appearance,
  ENTRY_GROUPS,
  type FamilyId,
  type HeadingDef,
  PAGES,
  type PageDef,
  type PageId,
  WHOLE_CARD_PAGES,
  isBorrowed,
  placementOf,
} from './pages';
import * as Reset from './reset';
import * as Routing from './routing';
import { interpolate } from './strings';
import {
  SYNTHETIC_FIELDS,
  entityIdOf,
  isSet as holdsValue,
  isSyntheticKey,
  refinementHolds,
} from './synthetic';
import { deepEqual, toStoredConfig } from './value';
import { type EditorWorkspace, isLayoutCopyPath, storedPath, viewForWorkspace } from './workspace';
import type { WriteState } from './write-frames';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { hasOwn } from '../../utils/helpers';

/** Why a field is live, or what stands in its place. */
export type FieldState =
  | { kind: 'live'; why: 'essential' | 'stored' | 'inherited' | 'added' | 'every' }
  | { kind: 'add' }
  | { kind: 'gated'; gate: Gate; unmet: Prereq }
  | { kind: 'inactive'; gate: Gate; unmet: Prereq; source: 'here' | 'all-layouts' }
  | { kind: 'other-layout'; views: ReadonlyArray<Types.EffectiveView> }
  /**
   * Drawn nowhere on this page and named nowhere either: a mode value whose mode is not live, an
   * option this workspace offers under another id (Grid's `separators:day_spacing` for
   * `layout:day_spacing`), or a field nothing offers.
   */
  | { kind: 'none' };

/** What the shown set is computed from. */
export interface PlanCtx {
  readonly workspace: EditorWorkspace;
  /** The configuration as the editor holds it, merged with root defaults. */
  readonly config: Readonly<Types.Config>;
  /** The configuration as stored. */
  readonly raw: Readonly<Record<string, unknown>>;
  /** What the builders build for this configuration and workspace: the card's, or an entry's. */
  readonly present: FieldIndex;
  readonly universe: FieldIndex;
  /** Field ids, `family:<id>`, `entry:<key>:<id>`, `entry:<key>:family:<id>`. */
  readonly added: ReadonlySet<string>;
  readonly showEverySetting: boolean;
  /** Text held while it is typed (`element.ts` › `_pending`); a field holding some is stored. */
  readonly pending?: Readonly<Record<string, string>>;
  /** A key per entry of `config.entities`, as `write-frames.ts` › `WriteState` holds them. */
  readonly entryKeys?: ReadonlyArray<number>;
  /** The calendar entry, by its key, whose fields `calendar:` ids name. */
  readonly entry?: number;
  /**
   * The layout the preview draws, which a calendar's field reads the card's value in. A calendar's
   * page belongs to no layout, so what it says the card gives must match the preview, whatever
   * scope the card's pages are edited in. The workspace where absent.
   */
  readonly previewed?: EditorWorkspace;
  /**
   * The page being drawn, where it is not a field's home: a copy of a whole-card setting on a
   * topic says Whole Card there, as it would not on its home page. Its home where absent.
   */
  readonly page?: PageId;
}

/** One item of a heading's Add row: a field, or a family as one. */
export type AddItem =
  | { readonly kind: 'field'; readonly id: FieldId }
  | { readonly kind: 'family'; readonly family: FamilyId; readonly ids: ReadonlyArray<FieldId> };

/** What one heading draws. */
export interface HeadingPlan {
  readonly heading: HeadingDef;
  /** Live fields, in registry order. */
  readonly live: ReadonlyArray<{
    readonly id: FieldId;
    readonly appearance: Appearance;
    readonly why: Extract<FieldState, { kind: 'live' }>['why'];
    /** A whole-card setting drawn here as a copy, at home on a Whole Card page. */
    readonly copy?: true;
  }>;
  /** The Add row's items, in registry order. */
  readonly add: ReadonlyArray<AddItem>;
  /** Fields a gate line names; a mode value's gate never draws one. */
  readonly gated: ReadonlyArray<{
    readonly id: FieldId;
    readonly gate: Gate;
    readonly unmet: Prereq;
  }>;
  /** Stored but not in use. */
  readonly inactive: ReadonlyArray<{
    readonly id: FieldId;
    readonly gate: Gate;
    readonly unmet: Prereq;
    readonly source: 'here' | 'all-layouts';
  }>;
  /** Whole-card settings named here by a row that opens them at home, in registry order. */
  readonly references: ReadonlyArray<{ readonly id: FieldId }>;
}

/** What a field says about its value, in data; the words are drawn from it. */
export interface StateWords {
  readonly words?:
    | { readonly kind: 'set' }
    | { readonly kind: 'set-all-layouts' }
    | { readonly kind: 'whole-card'; readonly stored: boolean }
    | {
        readonly kind: 'set-layout';
        readonly view: Types.EffectiveView;
        readonly sameAsDefault: boolean;
      }
    /** `ignored`: the All Layouts value, stored and different, that does not apply here. */
    | {
        readonly kind: 'layout-default';
        readonly view: Types.EffectiveView;
        readonly ignored?: unknown;
      }
    | { readonly kind: 'from-all-layouts' }
    | { readonly kind: 'set-entry'; readonly shared: boolean }
    | { readonly kind: 'follows-card'; readonly value: unknown };
  /**
   * In All Layouts: "Grid Has Its Own: 20", per layout storing its own or defaulting the field to a
   * value other than the All Layouts one.
   */
  readonly layoutsOwn?: ReadonlyArray<{
    readonly view: Types.EffectiveView;
    readonly value: unknown;
    /** Whether the layout stores the value, rather than defaulting to it. */
    readonly stored: boolean;
  }>;
  /** "Set on Calendars: Ben, Bin Day": the keys of the entries storing their own. */
  readonly calendars?: ReadonlyArray<number>;
  /**
   * The layouts a setting does nothing in: "Not in Grid". For a whole-card setting on every page,
   * and on Layout Defaults for a per-layout one, whose value there reaches only the layouts that
   * read it.
   */
  readonly notIn?: ReadonlyArray<Types.EffectiveView>;
  /**
   * For a calendar's option, the card's layouts it applies in, where that is not all of them:
   * "Only in List".
   */
  readonly onlyIn?: ReadonlyArray<Types.EffectiveView>;
  /** On Month's pages, a setting Month reads in the Day List and the Day Panel alone. */
  readonly dayList?: true;
  /** On Month's pages, a setting Month reads in the Wide Month's days alone. */
  readonly wideMonth?: true;
}

/**
 * The options Month reads only in a day's list and the panel "+N more" opens, never in its weeks,
 * whose lines draw a title and a start time at their own sizes (`cell_event_font_size`,
 * `cell_time_font_size`) and whose bars draw a title and a length. Card options by their path, a
 * calendar's by name. Measured by rendering each against Month's own value in both forms, and
 * pinned in `tests/editor-month-day-list.test.ts`, which reconciles it with what Month's pages
 * offer.
 */
export const MONTH_DAY_LIST_OPTIONS: ReadonlySet<string> = new Set([
  'event_font_size',
  'time_font_size',
  'scroll_long_titles',
  'show_single_allday_time',
  'event_gap',
  'event_spacing',
  'show_location',
  'show_location_allday',
  'remove_location_country',
  'location_font_size',
  'location_color',
  'location_icon_size',
  // The forecast: Month draws it beside events alone.
  'weather_entity',
  'weather.position',
  'weather.event.show_conditions',
  'weather.event.show_temp',
  'weather.event.show_uv_index',
  'weather.event.uv_index_threshold',
  'weather.event.daily_forecast_fallback',
  'weather.event.icon_size',
  'weather.event.font_size',
  'weather.event.color',
]);

/** A calendar's options Month reads only in a day's list and the panel ({@link MONTH_DAY_LIST_OPTIONS}). */
export const MONTH_DAY_LIST_ENTRY_OPTIONS: ReadonlySet<string> = new Set([
  // A Wide Month's line is one line of text high, so its picture keeps the text's height.
  'label_image_size',
  'show_location',
  'location_icon',
  'show_weather',
]);

/**
 * The options Month reads in the Wide Month's days alone: the bars long timed events are drawn as,
 * and the month's name beside a 1st, which only a wide day draws. The Narrow Month's dots, the Day
 * List and the Day Panel read none of them. Measured by rendering each in both forms, with the
 * panel open from each, and pinned in `tests/editor-month-day-list.test.ts`. The two font sizes
 * of the wide days (`month.cell_event_font_size`, `month.cell_time_font_size`) act there alone
 * too, and say so in their labels, so they carry no mark.
 */
export const MONTH_WIDE_ONLY_OPTIONS: ReadonlySet<string> = new Set([
  'multiday_banners',
  'show_month',
  'month_font_size',
  'month_color',
  'today_month_color',
  'weekend_month_color',
]);

/** A calendar's options Month reads in the Wide Month's days alone ({@link MONTH_WIDE_ONLY_OPTIONS}). */
export const MONTH_WIDE_ONLY_ENTRY_OPTIONS: ReadonlySet<string> = new Set(['multiday_banners']);

/**
 * Whether a field acts on the Wide Month's days alone: every option it writes is one Month reads
 * nowhere else.
 *
 * @param field - The field
 * @returns `true` for a Wide Month setting
 */
export function readsInWideMonthOnly(
  field: Pick<IndexedField, 'id' | 'dataPath' | 'configKeys'>,
): boolean {
  if (field.configKeys.length === 0) return false;
  if (isEntryField(field.id)) {
    return field.configKeys.every((key) => MONTH_WIDE_ONLY_ENTRY_OPTIONS.has(key));
  }
  return field.configKeys.every((key) =>
    MONTH_WIDE_ONLY_OPTIONS.has([...field.dataPath, key].join('.')),
  );
}

/**
 * Whether a field acts on Month's day list and panel alone: every option it writes is one Month
 * reads nowhere else.
 *
 * @param field - The field
 * @returns `true` for a day-list setting
 */
export function readsInMonthDayListOnly(
  field: Pick<IndexedField, 'id' | 'dataPath' | 'configKeys'>,
): boolean {
  if (field.configKeys.length === 0) return false;
  if (isEntryField(field.id)) {
    return field.configKeys.every((key) => MONTH_DAY_LIST_ENTRY_OPTIONS.has(key));
  }
  return field.configKeys.every((key) =>
    MONTH_DAY_LIST_OPTIONS.has([...field.dataPath, key].join('.')),
  );
}

/** What applies once Reset deletes the line. */
export type ResetOutcome =
  | {
      readonly kind: 'layout-default';
      readonly view: Types.EffectiveView;
      readonly value: unknown;
      /** The All Layouts value, stored and different, that the layout's default beats. */
      readonly ignored?: unknown;
    }
  | { readonly kind: 'all-layouts'; readonly value: unknown }
  | { readonly kind: 'default'; readonly value: unknown }
  /** `differs`: the card's layouts hold different values, so the calendar follows each one's. */
  | { readonly kind: 'card'; readonly value: unknown; readonly differs?: boolean };

const LIVE_ESSENTIAL: FieldState = { kind: 'live', why: 'essential' };
const NONE: FieldState = { kind: 'none' };

/**
 * The card setting each calendar option overrides, read where the card reads it. `days_of_week`
 * has none: the card shows every day, and only a calendar can narrow it.
 */
const CARD_COUNTERPART: Readonly<Record<string, string | undefined>> = {
  show_time: 'show_time',
  show_location: 'show_location',
  show_description: 'show_description',
  show_weather: 'weather.position',
  split_multiday_events: 'split_multiday_events',
  multiday_banners: 'multiday_banners',
  event_type: 'event_type',
  days_of_week: undefined,
};

/** Per root option, whether an empty string stored for it reads otherwise than none. */
const blankMeans = new Map<string, boolean>();

/**
 * Whether a root option's stored value counts as stored: #834's rule, except that a blank is
 * stored where the editor reads it otherwise than nothing. An emptied Countries To Remove writes
 * `remove_location_country: ''`, which Country Names reads as Custom with nothing in it, not Keep.
 *
 * @param key - Root option
 * @param value - Its stored value
 * @returns `true` when it holds something
 */
function holdsRoot(key: string, value: unknown): boolean {
  if (holdsValue(value)) return true;
  // An action written as `null` runs nothing, where its default runs one: `event_tap_action:
  // null` leaves an event's details shut. A null anywhere else is the editor's own clearing.
  if (value === null) {
    const action = (Reflect.get(Config.DEFAULT_CONFIG, key) as { action?: unknown } | undefined)
      ?.action;
    return typeof action === 'string' && action !== 'none';
  }
  if (value !== '') return false;
  let means = blankMeans.get(key);
  if (means === undefined) {
    const blank = { ...Config.DEFAULT_CONFIG, [key]: '' } as Types.Config;
    const none = { ...Config.DEFAULT_CONFIG, [key]: undefined } as Types.Config;
    means = Object.values(SYNTHETIC_FIELDS).some(
      (field) =>
        field.configKeys.includes(key) && !deepEqual(field.derive(blank), field.derive(none)),
    );
    blankMeans.set(key, means);
  }
  return means;
}

/**
 * Whether a root option's stored value counts as stored for one field: `holdsRoot`, and for a
 * switch that refines another control's option, only where the value turns it on
 * (`synthetic.ts` › `refinementHolds`). `show_countdown: true` is the Countdown chip's line, not
 * Leave Out Repeated Countdowns'.
 *
 * @param field - The field
 * @param key - Root option
 * @param value - Its stored value
 * @returns `true` when it holds something for the field
 */
function holdsFor(field: Pick<IndexedField, 'id'>, key: string, value: unknown): boolean {
  if (!holdsRoot(key, value)) return false;
  return refinementHolds(parseFieldId(field.id).name, key, value) ?? true;
}

let appearances: ReadonlyMap<FieldId, Appearance> | undefined;

/**
 * A field's appearance in the registry.
 *
 * @param id - Field id
 * @returns Its appearance, or `undefined` for one the registry does not place
 */
export function appearanceOf(id: FieldId): Appearance | undefined {
  if (!appearances) {
    const map = new Map<FieldId, Appearance>();
    // A copy or a reference is drawn as its home places it.
    const each = (fields: HeadingDef['fields']): void => {
      for (const [field, appearance] of fields) {
        if (!isBorrowed(appearance) && !map.has(field)) map.set(field, appearance);
      }
    };
    for (const page of PAGES) for (const heading of page.headings) each(heading.fields);
    for (const heading of ENTRY_GROUPS) each(heading.fields);
    appearances = map;
  }
  return appearances.get(id);
}

let gateByField: ReadonlyMap<FieldId, Gate> | undefined;

/**
 * The gate a field waits behind; each field is behind one at most.
 *
 * @param id - Field id
 * @returns The gate, or `undefined`
 */
function gateOf(id: FieldId): Gate | undefined {
  if (!gateByField) {
    const map = new Map<FieldId, Gate>();
    for (const gate of [...Object.values(GATES), ...Object.values(ENTRY_GATES)]) {
      for (const field of gate.fields) map.set(field, gate);
    }
    gateByField = map;
  }
  return gateByField.get(id);
}

/** The card's form data per configuration and workspace, with no held text. */
const formDataCache = new WeakMap<object, Map<string, Record<string, unknown>>>();

/**
 * The card's form data for a configuration in a workspace, as its forms are handed it.
 *
 * @param config - Merged configuration
 * @param workspace - Workspace
 * @param pending - Held text; when present the data is not cached
 * @returns The form data
 */
function formData(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
  pending?: Readonly<Record<string, string>>,
): Record<string, unknown> {
  if (pending !== undefined && Object.keys(pending).length > 0) {
    return Routing.workspaceFormData(config, workspace, pending);
  }
  let byWorkspace = formDataCache.get(config);
  if (!byWorkspace) formDataCache.set(config, (byWorkspace = new Map()));
  let data = byWorkspace.get(workspace);
  if (!data) byWorkspace.set(workspace, (data = Routing.workspaceFormData(config, workspace)));
  return data;
}

let defaults: Types.Config | undefined;

/**
 * A card with nothing stored, as the editor holds it.
 *
 * @returns The merged defaults
 */
function defaultConfig(): Types.Config {
  return (defaults ??= { ...structuredClone(Config.DEFAULT_CONFIG), entities: [] });
}

/**
 * A card field's value as its form shows it in a workspace.
 *
 * @param config - Merged configuration
 * @param workspace - Workspace
 * @param field - The field
 * @param pending - Held text
 * @returns The value
 */
function shownValue(
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
  field: Pick<IndexedField, 'node' | 'dataPath'>,
  pending?: Readonly<Record<string, string>>,
): unknown {
  return Routing.atPath(formData(config, workspace, pending), field.dataPath, field.node.name);
}

/**
 * Whether a field's id names a calendar entry's field.
 *
 * @param id - Field id
 * @returns `true` for `calendar:` ids
 */
function isEntryField(id: FieldId): boolean {
  return parseFieldId(id).scope === 'calendar';
}

/**
 * Whether a page leaves a built field out: a kept setting (`pages.ts` › `kept`) the YAML does not
 * hold where this scope writes it, and that the scope does not inherit at another value. The one exception to a page drawing everything its builders
 * build, so a check that walks what is built and what is drawn asks this rather than restate it.
 *
 * @param id - Field id
 * @param raw - The configuration as stored
 * @param workspace - Editing scope
 * @returns `true` where the page draws nothing for it
 */
export function leavesKeptOut(
  id: FieldId,
  raw: Readonly<Record<string, unknown>>,
  workspace: EditorWorkspace,
): boolean {
  if (appearanceOf(id) !== 'kept') return false;
  const field = universeIndex('en', workspace).fields.get(id);
  if (field === undefined) return true;
  if (storedAt(raw, field, workspace)) return false;
  // Inherited: what the scope resolves differs from the card's default, as `inheritedDifferent`.
  const resolved = Routing.workspaceConfig(
    raw as unknown as Types.Config,
    workspace,
  ) as unknown as Record<string, unknown>;
  const defaults = Config.DEFAULT_CONFIG as unknown as Record<string, unknown>;
  return field.configKeys.every(
    (key) => normalizeRootValue(key, resolved[key]) === normalizeRootValue(key, defaults[key]),
  );
}

/**
 * Whether the YAML holds a value for a field at a workspace's destination: one of the keys it
 * writes, at `routing.ts` › `destination` for a root field, or at its own path for a nested one.
 * For a calendar entry's field or a toolbar button's, `raw` is that entry or button as stored.
 *
 * Read from the YAML as stored, never from the merged configuration (it carries every default),
 * from the view blocks the editor re-serializes for labeling (they drop a line equal to its
 * default, such as `column: { event_font_size: 14 }`), or from the authored root keys (a superset
 * of what is stored).
 *
 * @param raw - The stored configuration, or the stored entry or button
 * @param field - The field
 * @param workspace - The workspace whose destination is read
 * @returns `true` when the YAML holds a value there
 */
export function storedAt(
  raw: Readonly<Record<string, unknown>>,
  field: Pick<IndexedField, 'id' | 'dataPath' | 'configKeys'>,
  workspace: EditorWorkspace,
): boolean {
  const { scope } = parseFieldId(field.id);
  if (scope === 'calendar' || scope === 'button') {
    return field.configKeys.some((key) => holdsValue(Routing.atPath(raw, field.dataPath, key)));
  }
  if (field.dataPath.length > 0) {
    // A layout group is stored in the block of the layout being edited, and in none for All Layouts.
    const path = storedPath(field.dataPath, workspace);
    return (
      path !== undefined &&
      field.configKeys.some((key) => holdsValue(Routing.atPath(raw, path, key)))
    );
  }
  return field.configKeys.some((key) => {
    const block = Routing.destination(key, workspace);
    return holdsFor(field, key, block === undefined ? raw[key] : Routing.atPath(raw, [block], key));
  });
}

/**
 * Where the entry a context names stands, and the list it stands in.
 *
 * @param ctx - Plan context
 * @returns The stored list and the entry's place in it; undefined without an entry
 */
function entryPlace(
  ctx: PlanCtx,
):
  | { readonly entities: ReadonlyArray<string | Types.EntityConfig>; readonly index: number }
  | undefined {
  if (ctx.entry === undefined) return undefined;
  const entities = (Array.isArray(ctx.raw.entities) ? ctx.raw.entities : []) as ReadonlyArray<
    string | Types.EntityConfig
  >;
  const keys = ctx.entryKeys ?? entities.map((_, at) => at);
  const index = keys.indexOf(ctx.entry);
  return index >= 0 && index < entities.length ? { entities, index } : undefined;
}

/**
 * Whether a calendar entry stores a value for a field: in the entry itself, or, for an option
 * the calendar has once, in any entry of the calendar, as `entities.ts` › `toEntityFormData`
 * reads it.
 *
 * @param field - A calendar entry's field
 * @param ctx - Plan context naming the entry
 * @returns `true` when stored
 */
function entryStored(
  field: Pick<IndexedField, 'id' | 'dataPath' | 'configKeys'>,
  ctx: PlanCtx,
): boolean {
  const place = entryPlace(ctx);
  if (place === undefined) return false;
  const { entities, index } = place;
  const id = entityIdOf(entities[index]);
  return field.configKeys.some((key) =>
    entities.some(
      (entry, at) =>
        (at === index ||
          (Entities.isCalendarOption(key) && id !== '' && entityIdOf(entry) === id)) &&
        holdsValue((Entities.asEntityConfig(entry) as unknown as Record<string, unknown>)[key]),
    ),
  );
}

/**
 * Whether a field is stored where this context writes it, or holds text being typed.
 *
 * @param field - The field
 * @param ctx - Plan context
 * @returns `true` when stored here
 */
function storedHere(field: IndexedField, ctx: PlanCtx): boolean {
  if (isEntryField(field.id)) return entryStored(field, ctx);
  if (storedAt(ctx.raw, field, ctx.workspace)) return true;
  const key = Routing.pendingKey(field.node.name, ctx.workspace, field.dataPath);
  return ctx.pending?.[key] !== undefined;
}

/**
 * Whether a field a gate withholds holds a value of its own here. A calendar's control derived
 * from an option another control writes holds one only where that option reads otherwise for
 * it: Icon Source answers for `label`, so a text label is not an icon source held back, while
 * Home Assistant's icon stored under a text label type is.
 *
 * @param field - The field
 * @param ctx - Plan context
 * @returns `true` when it does
 */
function holdsOwnValue(field: IndexedField, ctx: PlanCtx): boolean {
  if (!storedHere(field, ctx)) return false;
  const name = field.node.name;
  if (!isEntryField(field.id) || field.configKeys.includes(name)) return true;
  const place = entryPlace(ctx);
  if (place === undefined) return true;
  const { entities, index } = place;
  const entry = Entities.asEntityConfig(entities[index]) as unknown as Record<string, unknown>;
  const bare = Object.fromEntries(
    Object.entries(entry).filter(([key]) => !field.configKeys.includes(key)),
  ) as unknown as Types.EntityConfig;
  const list = entities.map((each, at) => (at === index ? bare : each)) as Types.EntityConfig[];
  const read = (one: Types.EntityConfig, all: Types.EntityConfig[]): unknown =>
    (Entities.toEntityFormData(one, all) as Record<string, unknown>)[name];
  return !deepEqual(
    read(entry as unknown as Types.EntityConfig, entities as Types.EntityConfig[]),
    read(bare, list),
  );
}

/**
 * Whether the top level stores a value for one of a root field's keys.
 *
 * @param field - The field
 * @param ctx - Plan context
 * @returns `true` when it does
 */
function topStored(field: IndexedField, ctx: PlanCtx): boolean {
  return (
    field.dataPath.length === 0 &&
    field.configKeys.some((key) => holdsFor(field, key, ctx.raw[key]))
  );
}

/**
 * Whether a card field has a copy per layout: a root option some layout routes to its block, or
 * a field nested in a layout's block.
 *
 * @param field - The field
 * @returns `true` when its value can differ between layouts
 */
export function hasLayoutCopy(field: Pick<IndexedField, 'dataPath' | 'configKeys'>): boolean {
  if (field.dataPath.length > 0) return isLayoutCopyPath(field.dataPath);
  return field.configKeys.some((key) =>
    ViewConfig.VIEWS.some((view) => Routing.destination(key, view) !== undefined),
  );
}

/**
 * Whether a layout defaults one of a field's keys differently from the card.
 *
 * @param field - The field
 * @param view - The layout
 * @returns `true` when it does
 */
function divergent(field: IndexedField, view: Types.EffectiveView): boolean {
  return (
    field.dataPath.length === 0 &&
    field.configKeys.some((key) => ViewConfig.hasDivergentDefault(key, view))
  );
}

/**
 * Where a calendar's field reads the card's value: the layout the preview draws.
 *
 * @param ctx - Plan context
 * @returns The workspace
 */
function cardScope(ctx: PlanCtx): EditorWorkspace {
  return ctx.previewed ?? ctx.workspace;
}

/**
 * A calendar option's card counterpart as it applies in a workspace, in comparable form.
 *
 * @param option - The calendar option
 * @param config - Merged configuration
 * @param workspace - Workspace
 * @returns The card's value, or `undefined` for an option without one
 */
function cardCounterpart(
  option: string,
  config: Readonly<Types.Config>,
  workspace: EditorWorkspace,
): unknown {
  const key = CARD_COUNTERPART[option];
  if (key === undefined) return undefined;
  if (option === 'show_weather') {
    return ViewConfig.showsEventWeatherIn(config as Types.Config, viewForWorkspace(workspace));
  }
  const effective = Routing.workspaceConfig(config, workspace);
  return normalizeRootValue(key, effective[key as keyof Types.Config]);
}

/**
 * Whether a field inherits a value that differs from the default (rule 1).
 *
 * On the card, only in a layout's scope: the field takes the top level's value, and the top level
 * stores one different from the card's default, compared as a derived control shows it. A top-level value the layout ignores because it
 * defaults differently does not apply, so it does not count. On a calendar entry, for the options
 * that override a card setting: the entry follows the card, and the card's value here differs
 * from what it is with nothing stored.
 *
 * @param field - The field
 * @param ctx - Plan context
 * @returns `true` when it inherits a different value
 */
function inheritedDifferent(field: IndexedField, ctx: PlanCtx): boolean {
  if (isEntryField(field.id)) {
    const { name } = parseFieldId(field.id);
    if (!(name in CARD_COUNTERPART) || entryStored(field, ctx)) return false;
    if (CARD_COUNTERPART[name] === undefined) return false;
    // In any of the card's layouts the option applies in, the card's value is not its default.
    const values = cardValuesBehind(field, name, ctx.config, ctx);
    const defaults = cardValuesBehind(field, name, defaultConfig(), ctx);
    return values.some((value, at) => !deepEqual(value, defaults[at]));
  }

  if (viewForWorkspace(ctx.workspace) === undefined || field.dataPath.length > 0) return false;
  if (Routing.valueSource(ctx.config, ctx.workspace, field.node.name) !== 'inherited') return false;
  const fallback = Config.DEFAULT_CONFIG as unknown as Record<string, unknown>;
  const name = field.node.name;
  if (isSyntheticKey(name)) {
    // A derived control differs by what it shows, not by its option's raw value: Leave Out
    // Repeated Countdowns reads `show_countdown: true` as off, which is its default.
    const stored = field.configKeys.filter((key) => holdsFor(field, key, ctx.raw[key]));
    if (stored.length === 0) return false;
    const top = { ...Config.DEFAULT_CONFIG } as Record<string, unknown>;
    for (const key of stored) top[key] = ctx.raw[key];
    const { derive } = SYNTHETIC_FIELDS[name];
    const view = viewForWorkspace(ctx.workspace);
    return !deepEqual(
      derive(top as unknown as Types.Config, view),
      derive(Config.DEFAULT_CONFIG, view),
    );
  }
  return field.configKeys.some(
    (key) =>
      holdsValue(ctx.raw[key]) &&
      !deepEqual(normalizeRootValue(key, ctx.raw[key]), normalizeRootValue(key, fallback[key])),
  );
}

/**
 * The added-set key for a field or a family in this context.
 *
 * @param id - Field id, or `family:<id>`
 * @param ctx - Plan context
 * @returns The key, entry-scoped on a calendar entry's page
 */
function addedKey(id: string, ctx: PlanCtx): string {
  return ctx.entry === undefined ? id : `entry:${ctx.entry}:${id}`;
}

/**
 * The members of a family, on the card's pages or on a calendar entry's.
 *
 * @param family - The family
 * @param ctx - Plan context
 * @returns Their ids
 */
function familyMembers(family: FamilyId, ctx: PlanCtx): FieldId[] {
  return ctx.entry === undefined
    ? Reset.cardFamilyMembers(family)
    : Reset.entryFamilyMembers(family);
}

/**
 * Why a family is live: any member that applies here is stored or inherits a different value,
 * the family was added, or every setting is shown. Its members are shown and hidden together.
 *
 * @param family - The family
 * @param ctx - Plan context
 * @returns The reason, or `undefined` while it waits in its Add row
 */
function familyWhy(
  family: FamilyId,
  ctx: PlanCtx,
): Extract<FieldState, { kind: 'live' }>['why'] | undefined {
  const members = familyMembers(family, ctx).flatMap((id) => ctx.present.fields.get(id) ?? []);
  if (members.some((field) => storedHere(field, ctx))) return 'stored';
  if (members.some((field) => inheritedDifferent(field, ctx))) return 'inherited';
  // A member added alone, as search adds one, brings its family: they are shown together.
  const ids = [`family:${family}`, ...familyMembers(family, ctx)];
  if (ids.some((id) => ctx.added.has(addedKey(id, ctx)))) return 'added';
  return ctx.showEverySetting ? 'every' : undefined;
}

/**
 * Why a present field is live, by its appearance.
 *
 * @param field - The field, present here
 * @param appearance - How its page shows it
 * @param ctx - Plan context
 * @returns The reason, or `undefined` while it is not live
 */
function liveWhy(
  field: IndexedField,
  appearance: Appearance,
  ctx: PlanCtx,
): Extract<FieldState, { kind: 'live' }>['why'] | undefined {
  if (keepsControl(appearance)) return 'essential';
  if (typeof appearance === 'object' && 'family' in appearance) {
    return familyWhy(appearance.family, ctx);
  }

  if (storedHere(field, ctx)) return 'stored';
  if (typeof appearance === 'object' && 'with' in appearance) {
    if (ctx.added.has(addedKey(field.id, ctx))) return 'added';
    const modes = typeof appearance.with === 'string' ? [appearance.with] : appearance.with;
    for (const mode of modes) {
      const state = fieldState(mode, appearanceOf(mode) ?? 'add', ctx);
      if (state.kind === 'live') return state.why;
    }
    return ctx.showEverySetting ? 'every' : undefined;
  }
  if (inheritedDifferent(field, ctx)) return 'inherited';
  if (ctx.added.has(addedKey(field.id, ctx))) return 'added';
  // A kept setting is drawn only while the card holds it, whatever else is shown.
  if (appearance === 'kept') return undefined;
  return ctx.showEverySetting ? 'every' : undefined;
}

/**
 * The form data a gate's conditions read: the card's in the workspace, and the entry's own.
 *
 * @param ctx - Plan context
 * @returns The data
 */
function gateData(ctx: PlanCtx): GateData {
  const card = formData(ctx.config, ctx.workspace, ctx.pending);
  const place = entryPlace(ctx);
  const entities = ctx.config.entities ?? [];
  const entry = place === undefined ? undefined : entities[place.index];
  return entry === undefined
    ? { card }
    : { card, entry: Entities.toEntityFormData(entry, entities) };
}

/** Per universe, the options its fields write, so another id writing one of them is not new here. */
const writtenCache = new WeakMap<FieldIndex, ReadonlySet<string>>();

/**
 * What a field writes, independent of its id: `card:<key>` for each root key, `card:<path>` for a
 * nested field, `calendar:<key>` for a calendar entry's field.
 *
 * @param field - The field
 * @returns Its written options
 */
function writes(field: IndexedField): string[] {
  if (isEntryField(field.id)) return field.configKeys.map((key) => `calendar:${key}`);
  if (field.dataPath.length > 0) return [`card:${[...field.dataPath, field.node.name].join('.')}`];
  return field.configKeys.map((key) => `card:${key}`);
}

/**
 * Every option a universe's fields write.
 *
 * @param universe - Universe
 * @returns The written options
 */
function writtenIn(universe: FieldIndex): ReadonlySet<string> {
  let written = writtenCache.get(universe);
  if (!written) {
    written = new Set([...universe.fields.values()].flatMap(writes));
    writtenCache.set(universe, written);
  }
  return written;
}

/**
 * The layouts that offer a field this workspace does not, unless this workspace offers the same
 * option under another id: one option can be two ids, `layout:day_spacing` (All Layouts, List,
 * Columns) and `separators:day_spacing` (Grid), and Grid must not read "List adds here: Day
 * Spacing".
 *
 * @param id - Field id, outside this workspace's universe
 * @param ctx - Plan context
 * @returns The layouts, in order; empty when none, or when this workspace writes the option
 */
function otherLayouts(id: FieldId, ctx: PlanCtx): Types.EffectiveView[] {
  // A calendar's page is built for the card's layouts already, so only another one can offer more.
  const built =
    ctx.entry !== undefined && isEntryField(id)
      ? entryViews(ctx.config as Types.Config, ctx.workspace)
      : [];
  const views = ViewConfig.VIEWS.filter(
    (view) =>
      view !== ctx.workspace && !built.includes(view) && universeIndex('en', view).fields.has(id),
  );
  if (views.length === 0) return [];
  // A calendar's option has one id in every layout, so a card field writing the same option here
  // says nothing about it.
  if (built.length > 0) return views;
  const field = universeIndex('en', views[0]).fields.get(id)!;
  const here = writtenIn(ctx.universe);
  return writes(field).some((option) => here.has(option)) ? [] : views;
}

/**
 * A field's place in the shown set.
 *
 * @param id - Field id
 * @param appearance - How its page shows it
 * @param ctx - Plan context; on a calendar entry's page its `present` is the entry's own index
 * @returns The field's state
 */
export function fieldState(id: FieldId, appearance: Appearance, ctx: PlanCtx): FieldState {
  if (appearance === 'button-rows') return LIVE_ESSENTIAL;

  const present = ctx.present.fields.get(id);
  if (present) {
    const why = liveWhy(present, appearance, ctx);
    if (why !== undefined) return { kind: 'live', why };
    return appearance === 'kept' || (typeof appearance === 'object' && 'with' in appearance)
      ? NONE
      : { kind: 'add' };
  }

  const field = ctx.universe.fields.get(id);
  if (field) {
    const gate = gateOf(id);
    const unmet = gate && firstUnmet(gate, gateData(ctx));
    if (gate === undefined || unmet === undefined) return NONE;
    // A mode's value stores nothing of its own where its mode reads the same option: Start Date
    // reads the `start_date` A Fixed Date and Relative to Today write, so `start_of_week` is in use.
    const mode = ctx.universe.fields.get(unmet.field);
    if (
      mode !== undefined &&
      !isEntryField(id) &&
      field.dataPath.length === 0 &&
      field.configKeys.length > 0 &&
      field.configKeys.every((key) => mode.configKeys.includes(key))
    ) {
      return { kind: 'gated', gate, unmet };
    }
    if (holdsOwnValue(field, ctx)) return { kind: 'inactive', gate, unmet, source: 'here' };
    const view = viewForWorkspace(ctx.workspace);
    if (
      view !== undefined &&
      !isEntryField(id) &&
      field.dataPath.length === 0 &&
      field.configKeys.some(
        (key) =>
          Routing.destination(key, ctx.workspace) !== undefined &&
          !ViewConfig.hasDivergentDefault(key, view) &&
          holdsFor(field, key, ctx.raw[key]),
      )
    ) {
      return { kind: 'inactive', gate, unmet, source: 'all-layouts' };
    }
    return { kind: 'gated', gate, unmet };
  }

  const views = otherLayouts(id, ctx);
  return views.length > 0 ? { kind: 'other-layout', views } : NONE;
}

/**
 * A heading's fields in the order a scope draws them. On Month's pages a setting that acts in the
 * weeks comes before one Month reads only in a day's list and the panel, the settings marked Day
 * List & Panel ({@link readsInMonthDayListOnly}), each group in registry order: the wide month,
 * which a Month card draws on all but a narrow screen, reads first. Every other scope draws the
 * registry's order, which `pages.ts` places by scope, coarse to fine, for every layout at once,
 * so a field moved there for Month would move in List and Columns too.
 *
 * @param heading - The heading
 * @param workspace - Editing scope
 * @param present - The fields built here, which say what each one writes
 * @returns The fields, in drawing order
 */
export function fieldsInDrawOrder(
  heading: HeadingDef,
  workspace: EditorWorkspace,
  present: ReadonlyMap<FieldId, IndexedField>,
): HeadingDef['fields'] {
  if (viewForWorkspace(workspace) !== 'month') return heading.fields;
  const late = ([id]: HeadingDef['fields'][number]): boolean => {
    const field = present.get(id);
    return field !== undefined && readsInMonthDayListOnly(field);
  };
  const first = heading.fields.filter((entry) => !late(entry));
  return first.length === heading.fields.length
    ? heading.fields
    : [...first, ...heading.fields.filter(late)];
}

/**
 * Plans the headings of a list of them.
 *
 * @param headings - The headings, in registry order
 * @param ctx - Plan context
 * @returns A plan per heading, its fields in drawing order ({@link fieldsInDrawOrder})
 */
function planHeadings(headings: ReadonlyArray<HeadingDef>, ctx: PlanCtx): HeadingPlan[] {
  return headings.map((heading) => {
    const live: Array<HeadingPlan['live'][number]> = [];
    const add: AddItem[] = [];
    const gated: Array<HeadingPlan['gated'][number]> = [];
    const inactive: Array<HeadingPlan['inactive'][number]> = [];
    const references: Array<HeadingPlan['references'][number]> = [];
    const families = new Map<FamilyId, FieldId[]>();

    for (const [id, placed] of fieldsInDrawOrder(heading, ctx.workspace, ctx.present.fields)) {
      if (placed === 'reference') {
        if (ctx.present.fields.has(id)) references.push({ id });
        continue;
      }
      // A copy is drawn, gated and folded as at home.
      const appearance = placed === 'copy' ? (appearanceOf(id) ?? 'add') : placed;
      const state = fieldState(id, appearance, ctx);
      switch (state.kind) {
        case 'live':
          live.push({
            id,
            appearance,
            why: state.why,
            ...(placed === 'copy' ? { copy: true } : {}),
          });
          break;
        case 'add':
          if (typeof appearance === 'object' && 'family' in appearance) {
            let ids = families.get(appearance.family);
            if (!ids) {
              families.set(appearance.family, (ids = []));
              add.push({ kind: 'family', family: appearance.family, ids });
            }
            ids.push(id);
          } else {
            add.push({ kind: 'field', id });
          }
          break;
        case 'gated':
          if (state.gate.kind === 'gate') gated.push({ id, gate: state.gate, unmet: state.unmet });
          break;
        case 'inactive':
          inactive.push({ id, gate: state.gate, unmet: state.unmet, source: state.source });
          break;
        // Another layout's setting is search's to name (`search.ts`); a page leaves it out.
        case 'other-layout':
        case 'none':
          break;
      }
    }
    return { heading, live, add, gated, inactive, references };
  });
}

/**
 * What a page draws: per heading its live fields, Add row, gate line and stored-but-not-in-use
 * lines.
 *
 * @param page - The page
 * @param ctx - Plan context
 * @returns The plan
 */
export function planPage(page: PageDef, ctx: PlanCtx): { headings: HeadingPlan[] } {
  return { headings: planHeadings(page.headings, { ...ctx, page: ctx.page ?? page.id }) };
}

/**
 * The context for one calendar entry's page: the entry's own present index, and its key.
 *
 * @param entry - The entry as stored
 * @param key - Its key
 * @param ctx - Plan context for the card
 * @returns The entry's context
 */
function entryCtx(entry: string | Types.EntityConfig, key: number, ctx: PlanCtx): PlanCtx {
  const { schema } = acrossFor(entry, ctx);
  return { ...ctx, present: entityFieldIndex(schema), entry: key };
}

/** Each configuration's entries across their layouts, by workspace and entry. */
const acrossCache = new WeakMap<object, Map<string, EntryAcross>>();

/**
 * A calendar entry's fields across the layouts its page is built for, kept per configuration.
 *
 * @param entry - The entry as stored
 * @param ctx - Plan context
 * @returns Its fields and the layouts that build each
 */
function acrossFor(entry: string | Types.EntityConfig, ctx: PlanCtx): EntryAcross {
  let byEntry = acrossCache.get(ctx.config);
  if (byEntry === undefined) acrossCache.set(ctx.config, (byEntry = new Map()));
  const cacheKey = `${ctx.workspace}\u0000${JSON.stringify(entry)}`;
  let across = byEntry.get(cacheKey);
  if (across === undefined) {
    across = entrySchemaAcross(entry, schemaCtx(ctx.config as Types.Config, ctx.workspace, 'en'));
    byEntry.set(cacheKey, across);
  }
  return across;
}

/**
 * The layouts a calendar entry's field applies in, among those its page is built for, and those.
 *
 * @param field - A calendar entry's field
 * @param ctx - Plan context naming the entry
 * @returns The field's layouts and the page's, or `undefined` with no entry named
 */
function entryLayouts(
  field: IndexedField,
  ctx: PlanCtx,
):
  | {
      readonly of: ReadonlyArray<Types.EffectiveView>;
      readonly all: ReadonlyArray<Types.EffectiveView>;
    }
  | undefined {
  const place = entryPlace(ctx);
  if (place === undefined) return undefined;
  const across = acrossFor(place.entities[place.index], ctx);
  return { of: across.layoutsOf.get(field.node.name) ?? across.views, all: across.views };
}

/**
 * The card's value behind a calendar option in each layout the option applies in, and whether
 * they differ: what Follow the Card takes, layout by layout.
 *
 * @param field - A calendar entry's field
 * @param name - Its option
 * @param config - The configuration to read
 * @param ctx - Plan context naming the entry
 * @returns The values, one per layout; the starting layout's alone with no entry named
 */
function cardValuesBehind(
  field: IndexedField,
  name: string,
  config: Readonly<Types.Config>,
  ctx: PlanCtx,
): unknown[] {
  const views = entryLayouts(field, ctx)?.of ?? [cardScope(ctx)];
  return views.map((view) =>
    name in CARD_COUNTERPART
      ? cardCounterpart(name, config, view)
      : normalizeRootValue(name, Routing.workspaceConfig(config, view)[name as keyof Types.Config]),
  );
}

/**
 * What a calendar entry's page draws, per group.
 *
 * @param entry - The entry as stored
 * @param key - Its key
 * @param ctx - Plan context for the card; its `entryKeys` place the entry among its calendar's
 * @param present - The entry's fields as its page builds them, where the caller has them
 * @returns A plan per group
 */
export function planEntry(
  entry: string | Types.EntityConfig,
  key: number,
  ctx: PlanCtx,
  present?: FieldIndex,
): HeadingPlan[] {
  const own = entryCtx(entry, key, ctx);
  return planHeadings(ENTRY_GROUPS, present === undefined ? own : { ...own, present });
}

/**
 * Whether a card field is drawn on one of Whole Card's pages (`pages.ts` › `WHOLE_CARD_PAGES`),
 * where every setting is the whole card's and none says so: the page being drawn, else the
 * field's home, as a search result opens it.
 *
 * @param id - Field id
 * @param ctx - Plan context
 * @returns `true` on Card & Header, Events, Weather & Language and Taps & Refresh
 */
function onWholeCardPage(id: FieldId, ctx: PlanCtx): boolean {
  const page = ctx.page ?? placementOf(id)?.page;
  return page !== undefined && WHOLE_CARD_PAGES.has(page as never);
}

/**
 * The layouts a whole-card field does nothing in: Grid for Open Links, Month for Today's Weekday
 * Color. Empty where it reaches every layout.
 *
 * @param field - A card field with no layout copy
 * @returns The layouts, in the card's order
 */
function layoutsIgnoring(field: Pick<IndexedField, 'configKeys'>): Types.EffectiveView[] {
  if (field.configKeys.length === 0) return [];
  return ViewConfig.VIEWS.filter((view) =>
    field.configKeys.every((key) => !ViewConfig.appliesToView(key, view)),
  );
}

/**
 * The entries storing their own value for the calendar option a card field is overridden by.
 *
 * @param field - A card field
 * @param ctx - Plan context
 * @returns Their keys, in list order
 */
function overridingEntries(field: IndexedField, ctx: PlanCtx): number[] {
  const path = [...field.dataPath, field.node.name].join('.');
  const option = Object.keys(CARD_COUNTERPART).find((each) => CARD_COUNTERPART[each] === path);
  if (option === undefined) return [];
  const entities = (Array.isArray(ctx.raw.entities) ? ctx.raw.entities : []) as ReadonlyArray<
    string | Types.EntityConfig
  >;
  const keys = ctx.entryKeys ?? entities.map((_, at) => at);
  return entities.flatMap((entry, at) =>
    holdsValue((Entities.asEntityConfig(entry) as unknown as Record<string, unknown>)[option])
      ? [keys[at]]
      : [],
  );
}

/**
 * What a field says about its value: the prototype's `stateOf`, plus the lines for
 * the layouts and the calendars that store their own.
 *
 * @param field - The field
 * @param ctx - Plan context; for a calendar entry's field it names the entry
 * @returns The words, or `undefined` while nothing is stored and nothing else applies
 */
export function stateOf(field: IndexedField, ctx: PlanCtx): StateWords | undefined {
  const month = viewForWorkspace(ctx.workspace) === 'month';
  const monthMark =
    month && readsInMonthDayListOnly(field)
      ? ({ dayList: true } as const)
      : month && readsInWideMonthOnly(field)
        ? ({ wideMonth: true } as const)
        : {};
  if (isEntryField(field.id)) {
    // A calendar's option some of the card's layouts do not apply says where it does.
    const layouts = entryLayouts(field, ctx);
    const onlyIn =
      layouts !== undefined && layouts.all.length > 1 && layouts.of.length < layouts.all.length
        ? { onlyIn: layouts.of }
        : {};
    if (entryStored(field, ctx)) {
      const place = entryPlace(ctx)!;
      const id = entityIdOf(place.entities[place.index]);
      const shared =
        field.configKeys.some(Entities.isCalendarOption) &&
        place.entities.filter((entry) => entityIdOf(entry) === id).length > 1;
      return { words: { kind: 'set-entry', shared }, ...onlyIn, ...monthMark };
    }
    if (inheritedDifferent(field, ctx)) {
      const { name } = parseFieldId(field.id);
      return {
        words: { kind: 'follows-card', value: cardValuesBehind(field, name, ctx.config, ctx)[0] },
        ...onlyIn,
        ...monthMark,
      };
    }
    return 'onlyIn' in onlyIn || Object.keys(monthMark).length > 0
      ? { ...onlyIn, ...monthMark }
      : undefined;
  }

  const view = viewForWorkspace(ctx.workspace);
  const here = storedHere(field, ctx);
  const calendars = overridingEntries(field, ctx);
  let words: StateWords['words'];
  let layoutsOwn: StateWords['layoutsOwn'];

  let notIn: StateWords['notIn'];
  if (!hasLayoutCopy(field)) {
    // A whole-card setting on a page of per-layout ones says so in every scope, All Layouts too.
    if (onWholeCardPage(field.id, ctx)) words = here ? { kind: 'set' } : undefined;
    else words = { kind: 'whole-card', stored: here };
    const ignoring = layoutsIgnoring(field);
    if (ignoring.length > 0) notIn = ignoring;
  } else if (view === undefined) {
    if (here) words = { kind: 'set-all-layouts' };
    // Layout Defaults' value reaches only the layouts that read the option.
    const ignoring = layoutsIgnoring(field);
    if (ignoring.length > 0) notIn = ignoring;
    // Each layout that stores its own, and each that offers the field and defaults it otherwise:
    // the All Layouts value does not reach either.
    const top = shownValue(ctx.config, 'shared', field);
    const own = ViewConfig.VIEWS.flatMap((each) => {
      const value = shownValue(ctx.config, each, field);
      // Only a layout that keeps its own copy of the option can store one. For any other the
      // destination is the top level, so `storedAt` would find the All Layouts line itself and
      // name it the layout's own: "Month Has Its Own: 7" for a Days To Show Month ignores.
      const copies = field.configKeys.some((key) => Routing.destination(key, each) !== undefined);
      if (copies && storedAt(ctx.raw, field, each)) return [{ view: each, value, stored: true }];
      const ownDefault =
        divergent(field, each) &&
        universeIndex('en', each).fields.has(field.id) &&
        !deepEqual(value, top);
      return ownDefault ? [{ view: each, value, stored: false }] : [];
    });
    if (own.length > 0) layoutsOwn = own;
  } else if (here) {
    words = {
      kind: 'set-layout',
      view,
      sameAsDefault: deepEqual(
        shownValue(ctx.config, ctx.workspace, field, ctx.pending),
        defaultHere(field, ctx),
      ),
    };
  } else if (divergent(field, view)) {
    const top = shownValue(ctx.config, 'shared', field);
    words =
      topStored(field, ctx) && !deepEqual(top, defaultHere(field, ctx))
        ? { kind: 'layout-default', view, ignored: top }
        : { kind: 'layout-default', view };
  } else if (topStored(field, ctx)) {
    words = { kind: 'from-all-layouts' };
  }

  if (
    words === undefined &&
    layoutsOwn === undefined &&
    calendars.length === 0 &&
    notIn === undefined &&
    Object.keys(monthMark).length === 0
  ) {
    return undefined;
  }
  return {
    ...(words ? { words } : {}),
    ...(layoutsOwn ? { layoutsOwn } : {}),
    ...(calendars.length > 0 ? { calendars } : {}),
    ...(notIn ? { notIn } : {}),
    ...monthMark,
  };
}

/**
 * The editor's write state as a context implies it, for a reset computed from the context alone:
 * the authored root keys are the stored ones, and no Grid reset has happened yet.
 *
 * @param ctx - Plan context
 * @returns The state
 */
function impliedState(ctx: PlanCtx): WriteState {
  const entities = ctx.config.entities ?? [];
  return {
    config: ctx.config as Types.Config,
    pending: ctx.pending ?? {},
    authoredRootKeys: new Set(Object.keys(ctx.raw)),
    gridResetKeys: new Set(),
    entryKeys: ctx.entryKeys ?? entities.map((_, at) => at),
    buttonKeys: [],
  };
}

/**
 * The default a field has here: what it shows once its line is gone both here and at the top
 * level, the prototype's base for "Same as the Default". That is the layout's own default where it
 * has one, else the card's, worked out from this card, since some defaults follow other options
 * (Columns' minimum days follow the card's day count).
 *
 * @param field - A card field
 * @param ctx - Plan context
 * @returns The value its form would show
 */
function defaultHere(field: IndexedField, ctx: PlanCtx): unknown {
  const here = Reset.reset(impliedState(ctx), { kind: 'field', field, workspace: ctx.workspace });
  const bare = Reset.reset(here.state, { kind: 'field', field, workspace: 'shared' });
  return shownValue(bare.state.config, ctx.workspace, field, bare.state.pending);
}

/**
 * What applies once Reset deletes a field's line here: the layout's default, else
 * the All Layouts value, else the card's default; on a calendar entry, the card's value.
 *
 * @param field - The field
 * @param ctx - Plan context; for a calendar entry's field it names the entry
 * @returns The outcome, or `undefined` where nothing is stored here or nothing on the card stands
 *   behind a calendar's option
 */
export function resetOutcome(field: IndexedField, ctx: PlanCtx): ResetOutcome | undefined {
  if (!storedHere(field, ctx)) return undefined;

  if (isEntryField(field.id)) {
    const { name } = parseFieldId(field.id);
    if (name in CARD_COUNTERPART && CARD_COUNTERPART[name] === undefined) return undefined;
    if (!(name in CARD_COUNTERPART) && !hasOwn(Config.DEFAULT_CONFIG, name)) return undefined;
    // The card's value in each layout the option applies in: one where they agree, else the
    // calendar goes back to following each layout's.
    const values = cardValuesBehind(field, name, ctx.config, ctx);
    return values.every((value) => deepEqual(value, values[0]))
      ? { kind: 'card', value: values[0] }
      : { kind: 'card', value: values[0], differs: true };
  }

  const after = Reset.reset(impliedState(ctx), { kind: 'field', field, workspace: ctx.workspace });
  const value = shownValue(after.state.config, ctx.workspace, field, after.state.pending);
  const view = viewForWorkspace(ctx.workspace);
  if (view === undefined || !hasLayoutCopy(field)) return { kind: 'default', value };
  if (divergent(field, view)) {
    const top = shownValue(ctx.config, 'shared', field);
    return topStored(field, ctx) && !deepEqual(top, value)
      ? { kind: 'layout-default', view, value, ignored: top }
      : { kind: 'layout-default', view, value };
  }
  return topStored(field, ctx) ? { kind: 'all-layouts', value } : { kind: 'default', value };
}

/**
 * The reset that deletes a field's line here.
 *
 * @param field - The field
 * @param ctx - Plan context
 * @returns The target
 */
function resetTargetFor(field: IndexedField, ctx: PlanCtx): Reset.ResetTarget {
  return isEntryField(field.id) && ctx.entry !== undefined
    ? { kind: 'entry', key: ctx.entry, keys: field.configKeys }
    : { kind: 'field', field, workspace: ctx.workspace };
}

/**
 * The context a reset would leave: the configuration as it would be stored and held, the
 * builders' answer for it, and the added set without what the reset retires.
 *
 * @param ctx - Plan context
 * @param result - The reset
 * @returns The context after it
 */
function afterReset(ctx: PlanCtx, result: Reset.ResetResult): PlanCtx {
  const { state, clearAdded } = result;
  const raw = toStoredConfig(state.config, state.authoredRootKeys, ctx.raw);
  const config = { ...Config.DEFAULT_CONFIG, ...raw } as unknown as Types.Config;
  if (!Array.isArray(config.entities)) config.entities = [];
  const added = new Set([...ctx.added].filter((key) => !clearAdded.includes(key)));
  const next: PlanCtx = {
    ...ctx,
    raw,
    config,
    added,
    pending: state.pending,
    entryKeys: state.entryKeys,
  };
  if (ctx.entry === undefined) {
    return { ...next, present: buildFieldIndex(schemaCtx(config, ctx.workspace, 'en')) };
  }
  const place = entryPlace(next);
  const entry = place === undefined ? undefined : config.entities[place.index];
  return entry === undefined ? next : entryCtx(entry, ctx.entry, next);
}

/**
 * Whether a field carries Reset or Remove, decided by the state Reset would leave:
 * a field still live once its line is gone (essential, or still inheriting a value that differs)
 * gets Reset, which keeps the control; one that would leave the page gets Remove, which deletes
 * the line and returns it to its Add row. A field stored nowhere here gets neither, unless it was
 * added this session and Remove can take it back.
 *
 * @param id - Field id
 * @param appearance - How its page shows it
 * @param ctx - Plan context
 * @param state - The editor's write state, which the reset is applied to
 * @returns `reset`, `remove`, or `undefined` for neither
 */
export function resetAction(
  id: FieldId,
  appearance: Appearance,
  ctx: PlanCtx,
  state: WriteState,
): 'reset' | 'remove' | undefined {
  const field = ctx.present.fields.get(id);
  if (field === undefined) return undefined;
  const stored = storedHere(field, ctx);
  if (!stored && !ctx.added.has(addedKey(id, ctx))) return undefined;
  // An essential setting keeps its control whatever is stored, and resetting its own line never
  // withholds it (`tests/editor-shown-set.test.ts` checks that over the gate corpus), so it gets
  // Reset without building what the reset would leave. A mode value's own reset can withhold it
  // (Card Height leaves with its height), so every other setting takes the full path below.
  if (stored && keepsControl(appearance)) return 'reset';

  const result = Reset.reset(state, resetTargetFor(field, ctx));
  // Nothing stored here, so the reset deletes no line and the builders' answer is unchanged.
  const after = stored
    ? afterReset(ctx, result)
    : { ...ctx, added: new Set([...ctx.added].filter((key) => !result.clearAdded.includes(key))) };
  if (fieldState(id, appearance, after).kind === 'live') return stored ? 'reset' : undefined;
  return 'remove';
}

/**
 * Whether a setting stays live whatever is stored, while it applies: an essential one, a chip, a
 * chip's qualifier line, Start Date's radio group or a toolbar button's row.
 *
 * @param appearance - How its page shows it
 * @returns `true` when it does
 */
export function keepsControl(appearance: Appearance): boolean {
  return (
    appearance === 'essential' ||
    appearance === 'button-rows' ||
    appearance === 'segmented' ||
    (typeof appearance === 'object' && ('chips' in appearance || 'qualifies' in appearance))
  );
}

/**
 * The tag search gives a field a gate withholds: "Needs Show Description".
 *
 * @param gate - The gate
 * @param data - Form data its conditions read
 * @param language - Editor language
 * @param labelOf - A control's label in that language
 * @returns The tag, or `undefined` while the gate is open
 */
export function needsTag(
  gate: Gate,
  data: GateData,
  language: string,
  labelOf: (id: FieldId) => string,
): string | undefined {
  const needs = needsText(gate, data, language, labelOf);
  if (needs === undefined) return undefined;
  const template = lookup(language, 'search.needs') ?? humanize('search.needs');
  return interpolate(template, { needs });
}
