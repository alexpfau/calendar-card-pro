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
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  entityFieldIndex,
  entrySchema,
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
  WHOLE_CARD_PAGES,
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
   * page has no Settings For, so what it says the card gives must match the preview, whatever
   * scope the card's pages are edited in. The workspace where absent.
   */
  readonly previewed?: EditorWorkspace;
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
  /** For a whole-card setting, the layouts it does nothing in: "Not in Grid". */
  readonly notIn?: ReadonlyArray<Types.EffectiveView>;
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
  | { readonly kind: 'card'; readonly value: unknown };

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
    const each = (fields: HeadingDef['fields']): void => {
      for (const [field, appearance] of fields) if (!map.has(field)) map.set(field, appearance);
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
    const value = cardCounterpart(name, ctx.config, cardScope(ctx));
    return (
      CARD_COUNTERPART[name] !== undefined &&
      !deepEqual(value, cardCounterpart(name, defaultConfig(), cardScope(ctx)))
    );
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
    return !deepEqual(derive(top as unknown as Types.Config), derive(Config.DEFAULT_CONFIG));
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
  const views = ViewConfig.VIEWS.filter(
    (view) => view !== ctx.workspace && universeIndex('en', view).fields.has(id),
  );
  if (views.length === 0) return [];
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
    return typeof appearance === 'object' && 'with' in appearance ? NONE : { kind: 'add' };
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
 * Plans the headings of a list of them.
 *
 * @param headings - The headings, in registry order
 * @param ctx - Plan context
 * @returns A plan per heading
 */
function planHeadings(headings: ReadonlyArray<HeadingDef>, ctx: PlanCtx): HeadingPlan[] {
  return headings.map((heading) => {
    const live: Array<HeadingPlan['live'][number]> = [];
    const add: AddItem[] = [];
    const gated: Array<HeadingPlan['gated'][number]> = [];
    const inactive: Array<HeadingPlan['inactive'][number]> = [];
    const families = new Map<FamilyId, FieldId[]>();

    for (const [id, appearance] of heading.fields) {
      const state = fieldState(id, appearance, ctx);
      switch (state.kind) {
        case 'live':
          live.push({ id, appearance, why: state.why });
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
    return { heading, live, add, gated, inactive };
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
  return { headings: planHeadings(page.headings, ctx) };
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
  const schema = entrySchema(entry, schemaCtx(ctx.config as Types.Config, ctx.workspace, 'en'));
  return { ...ctx, present: entityFieldIndex(schema), entry: key };
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
 * Whether a card field sits on one of Whole Card's pages (`pages.ts` › `WHOLE_CARD_PAGES`), where
 * every setting is the whole card's and none says so.
 *
 * @param id - Field id
 * @returns `true` on Card & Header, Taps & Refresh and Weather
 */
function onWholeCardPage(id: FieldId): boolean {
  const page = placementOf(id)?.page;
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
  if (isEntryField(field.id)) {
    if (entryStored(field, ctx)) {
      const place = entryPlace(ctx)!;
      const id = entityIdOf(place.entities[place.index]);
      const shared =
        field.configKeys.some(Entities.isCalendarOption) &&
        place.entities.filter((entry) => entityIdOf(entry) === id).length > 1;
      return { words: { kind: 'set-entry', shared } };
    }
    if (inheritedDifferent(field, ctx)) {
      const { name } = parseFieldId(field.id);
      return {
        words: { kind: 'follows-card', value: cardCounterpart(name, ctx.config, cardScope(ctx)) },
      };
    }
    return undefined;
  }

  const view = viewForWorkspace(ctx.workspace);
  const here = storedHere(field, ctx);
  const calendars = overridingEntries(field, ctx);
  let words: StateWords['words'];
  let layoutsOwn: StateWords['layoutsOwn'];

  let notIn: StateWords['notIn'];
  if (!hasLayoutCopy(field)) {
    // A whole-card setting on a page of per-layout ones says so in every scope, All Layouts too.
    if (onWholeCardPage(field.id)) words = here ? { kind: 'set' } : undefined;
    else words = { kind: 'whole-card', stored: here };
    const ignoring = layoutsIgnoring(field);
    if (ignoring.length > 0) notIn = ignoring;
  } else if (view === undefined) {
    if (here) words = { kind: 'set-all-layouts' };
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
    notIn === undefined
  ) {
    return undefined;
  }
  return {
    ...(words ? { words } : {}),
    ...(layoutsOwn ? { layoutsOwn } : {}),
    ...(calendars.length > 0 ? { calendars } : {}),
    ...(notIn ? { notIn } : {}),
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
    if (name in CARD_COUNTERPART) {
      return CARD_COUNTERPART[name] === undefined
        ? undefined
        : { kind: 'card', value: cardCounterpart(name, ctx.config, cardScope(ctx)) };
    }
    if (!hasOwn(Config.DEFAULT_CONFIG, name)) return undefined;
    const effective = Routing.workspaceConfig(ctx.config, cardScope(ctx));
    return { kind: 'card', value: normalizeRootValue(name, effective[name as keyof Types.Config]) };
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
