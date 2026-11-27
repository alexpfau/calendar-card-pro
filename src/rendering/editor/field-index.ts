/**
 * Every field the editor builds, looked up by a stable id.
 *
 * The nine panel builders stay the authority on whether a field exists: their branches hold
 * the gates. This module walks what they built and records each leaf once, by id, with what a
 * page needs to draw it alone: the node, the two paths `walkSchema` tells apart, and the node
 * re-wrapped so that a one-field form nests its data exactly as the panel did.
 *
 * The index built here is the **present** one: what exists for one configuration and
 * workspace. The **universe**, the same walk over the gate corpus, is built in `universe.ts`,
 * which reads both this module and `gates.ts` so that neither imports the other.
 */

import * as Entities from './entities';
import * as Filter from './filter';
import type { HaFormSchema, SelectorSchema } from './ha-form';
import { computeHelper, computeLabel, computeSubformHelper } from './localize';
import { PANELS, type PanelDef, type SchemaCtx, walkSchema } from './panels';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import { TOOLBAR_BUTTON_PATH } from './schemas/card';
import {
  accentColorModeOf,
  buildEntitySchema,
  entityConfigKeys,
  entitySchemaFor,
  labelIconSourceOf,
  labelImageSourceOf,
} from './schemas/entity';
import * as Synthetic from './synthetic';
import * as Workspace from './workspace';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import {
  VIEWS,
  appliesToView,
  entityScopeFor,
  reachableViews,
  resolveEffectiveConfig,
  showsEventWeatherIn,
} from '../../config/view';
import * as Helpers from '../../utils/helpers';
import * as Lanes from '../../utils/lanes';

/**
 * A field's id: `<scope>:<data path>.<name>`.
 *
 * The scope is the panel id for a card field (`events:show_time`,
 * `layout:time_grid.start_time`, `weather:weather.date.color`), `calendar` for a calendar
 * entry's field (`calendar:blocklist`) and `button` for a toolbar button's (`button:icon`).
 * One option can be two ids, because two panels build it: `layout:day_spacing` outside Grid,
 * `separators:day_spacing` in Grid.
 */
export type FieldId = string;

/** One field as a page draws it. */
export interface IndexedField {
  readonly id: FieldId;
  /** The node as the builder made it. */
  readonly node: SelectorSchema;
  /** Where `ha-form` nests its data: the named, unflattened groups above it. */
  readonly dataPath: ReadonlyArray<string>;
  /** What `computeLabel` qualifies its string key with today, which the lifted form loses. */
  readonly labelPath: ReadonlyArray<string>;
  /** The node in a one-field form, interned by structure (`liftField`). */
  readonly lifted: ReadonlyArray<HaFormSchema>;
  /** The configuration keys it writes, read at `dataPath`. */
  readonly configKeys: ReadonlyArray<string>;
}

/** Fields by id. */
export interface FieldIndex {
  readonly fields: ReadonlyMap<FieldId, IndexedField>;
}

/**
 * Builds a field's id.
 *
 * @param scope - Panel id, `calendar` or `button`
 * @param dataPath - Enclosing data keys, outermost first
 * @param name - The field's own name
 * @returns The id
 */
export function fieldId(scope: string, dataPath: ReadonlyArray<string>, name: string): FieldId {
  return `${scope}:${[...dataPath, name].join('.')}`;
}

/**
 * Splits an id back into its parts.
 *
 * @param id - Field id
 * @returns The scope, the data path and the field's own name
 */
export function parseFieldId(id: FieldId): {
  scope: string;
  dataPath: ReadonlyArray<string>;
  name: string;
} {
  const colon = id.indexOf(':');
  const parts = id.slice(colon + 1).split('.');
  return { scope: id.slice(0, colon), dataPath: parts.slice(0, -1), name: parts[parts.length - 1] };
}

/**
 * A stable serialization: object keys sorted, arrays in order.
 *
 * @param value - Schema node or path
 * @returns Text equal for structurally equal values
 */
function structuralKey(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    Helpers.isConfigBlock(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((key) => [key, inner[key]]),
        )
      : inner,
  );
}

/** The last lifted schema per field id, with the structural key it was made from. */
const interned = new Map<FieldId, { key: string; lifted: HaFormSchema[] }>();

/**
 * Re-wraps a field in named grids for its data path (`routing.ts` › `nestedSchema`), so a
 * one-field form nests its data exactly as `schemas/common.ts` › `blockScope` and the panel's own
 * groups did.
 *
 * A named `grid` nests data and not labels, so the lifted form loses the label path the field
 * had under an expandable. That is what `IndexedField.labelPath` is kept for.
 *
 * Interned by structure: while the node is structurally the one last lifted under this id, the
 * same array comes back, so a rebuild that allocated equal nodes hands a form the same object.
 *
 * @param id - Field id, the interning key
 * @param node - The node as built
 * @param dataPath - Enclosing data keys, outermost first
 * @returns The one-field schema
 */
export function liftField(
  id: FieldId,
  node: SelectorSchema,
  dataPath: ReadonlyArray<string>,
): HaFormSchema[] {
  const key = structuralKey([dataPath, node]);
  const known = interned.get(id);
  if (known?.key === key) return known.lifted;

  const lifted = Routing.nestedSchema(node, dataPath);
  interned.set(id, { key, lifted });
  return lifted;
}

/**
 * One indexed field. What only some readers need, its lifted schema, its label path and the keys
 * it writes, is worked out on first read and kept: most indexes are built only to learn which
 * fields are present, and interning a lifted schema serializes its node. Kept, so it relies on
 * the node never being changed in place, as no builder's node is.
 */
class Leaf implements IndexedField {
  private liftedSchema: HaFormSchema[] | undefined;
  private boundPath: ReadonlyArray<string> | undefined;
  private writes: ReadonlyArray<string> | undefined;

  constructor(
    readonly id: FieldId,
    readonly node: SelectorSchema,
    readonly dataPath: ReadonlyArray<string>,
    private readonly labelPrefix: ReadonlyArray<string>,
    private readonly path: ReadonlyArray<string>,
    private readonly keysOf: KeysOf,
  ) {}

  get labelPath(): ReadonlyArray<string> {
    return (this.boundPath ??= [...this.labelPrefix, ...this.path]);
  }

  get lifted(): ReadonlyArray<HaFormSchema> {
    return (this.liftedSchema ??= liftField(this.id, this.node, this.dataPath));
  }

  get configKeys(): ReadonlyArray<string> {
    return (this.writes ??= this.keysOf(this.node.name, this.dataPath));
  }
}

/** The configuration keys a leaf writes, from its name and data path. */
type KeysOf = (name: string, dataPath: ReadonlyArray<string>) => ReadonlyArray<string>;

/**
 * Indexes the leaves of one schema.
 *
 * @param target - Index being filled; the first leaf to claim an id keeps it
 * @param scope - Id scope for these leaves
 * @param schema - Schema to walk
 * @param labelPrefix - Label path the schema is rendered under
 * @param keysOf - The configuration keys a leaf writes
 */
function indexLeaves(
  target: Map<FieldId, IndexedField>,
  scope: string,
  schema: ReadonlyArray<HaFormSchema>,
  labelPrefix: ReadonlyArray<string>,
  keysOf: KeysOf,
): void {
  for (const { node, path, dataPath } of walkSchema(schema)) {
    if (!('selector' in node)) continue;

    const id = fieldId(scope, dataPath, node.name);
    if (!target.has(id)) target.set(id, new Leaf(id, node, dataPath, labelPrefix, path, keysOf));
  }
}

/**
 * The keys a card field writes. A synthetic field speaks for its real options only at the top
 * level, as `routing.ts` › `applyWorkspaceChange` treats it; a nested field is its own key.
 *
 * @param name - Field name
 * @param dataPath - Enclosing data keys
 * @returns Configuration keys
 */
function cardConfigKeys(name: string, dataPath: ReadonlyArray<string>): ReadonlyArray<string> {
  return dataPath.length === 0 ? Synthetic.configKeysForField(name) : [name];
}

const presentIndex = Helpers.memoizeLast(
  (
    language: string,
    workspace: Workspace.EditorWorkspace | undefined,
    view: Types.EffectiveView,
    config: Types.Config,
    rawConfig: Types.Config | undefined,
    held: string,
  ): FieldIndex => {
    const presentation = JSON.parse(held) as Record<string, string>;
    const ctx: SchemaCtx = { view, workspace, config, rawConfig, language, presentation };
    const fields = new Map<FieldId, IndexedField>();
    for (const panel of PANELS) indexPanel(fields, panel, ctx);
    return { fields };
  },
);

/**
 * The mode choices a context holds (`SchemaCtx.presentation`), as a key: a builder reads a mode
 * through them, so a schema built for one is not the schema for another.
 *
 * @param ctx - Schema context
 * @returns The key
 */
function heldKey(ctx: SchemaCtx): string {
  return JSON.stringify(ctx.presentation ?? {});
}

/** Each panel's built schema, by the configuration it was built from, then by its other inputs. */
const builtSchemas = new WeakMap<
  object,
  Map<string, { readonly raw: unknown; readonly schema: HaFormSchema[] }>
>();

/**
 * A panel's schema as its builder makes it for a context, inert fields withheld, built once for
 * the inputs a builder reads: the index and the editor's filter both read it, and neither builds
 * it again.
 *
 * @param panel - The panel
 * @param ctx - Schema context
 * @returns The schema
 */
export function builtSchema(panel: PanelDef, ctx: SchemaCtx): HaFormSchema[] {
  let byInputs = builtSchemas.get(ctx.config);
  if (byInputs === undefined) builtSchemas.set(ctx.config, (byInputs = new Map()));
  const key = `${panel.id}\u0000${ctx.language}\u0000${ctx.workspace}\u0000${ctx.view}\u0000${heldKey(ctx)}`;
  const kept = byInputs.get(key);
  if (kept !== undefined && kept.raw === ctx.rawConfig) return kept.schema;
  const schema = Filter.withholdInertFields(panel.build(ctx), ctx.workspace ?? ctx.view);
  byInputs.set(key, { raw: ctx.rawConfig, schema });
  return schema;
}

/**
 * Indexes one panel's fields as built for a context, after `filter.ts` › `withholdInertFields`.
 *
 * @param target - Index being filled
 * @param panel - The panel
 * @param ctx - Schema context
 */
function indexPanel(target: Map<FieldId, IndexedField>, panel: PanelDef, ctx: SchemaCtx): void {
  const built = builtSchema(panel, ctx);
  const view = ctx.workspace === undefined ? undefined : Workspace.viewForWorkspace(ctx.workspace);
  indexLeaves(
    target,
    panel.id,
    built,
    [],
    view === undefined ? cardConfigKeys : (name, dataPath) => keysIn(name, dataPath, view),
  );
}

/**
 * The keys a card field writes on a layout's page: those of {@link cardConfigKeys} the layout
 * reads. A field writing several options can reach a layout through some of them alone, as
 * Accent Text reaches Month through its event, time and location colors; the others have no copy
 * in the layout's block, so reading, writing or resetting them there would act on the top level,
 * which every other layout reads. A field the layout reads through none keeps them all: it is
 * withheld there (`filter.ts` › `withholdInertFields`), and a whole-card one is named for the
 * layouts it does nothing in.
 *
 * @param name - Field name
 * @param dataPath - Enclosing data keys
 * @param view - The layout whose page draws the field
 * @returns Configuration keys
 */
function keysIn(
  name: string,
  dataPath: ReadonlyArray<string>,
  view: Types.EffectiveView,
): ReadonlyArray<string> {
  const keys = cardConfigKeys(name, dataPath);
  if (dataPath.length > 0 || keys.length < 2) return keys;
  const read = keys.filter((key) => appliesToView(key, view));
  return read.length === 0 || read.length === keys.length ? keys : read;
}

/**
 * The present index: every card field the nine panel builders build for this context, after
 * `filter.ts` › `withholdInertFields`. Calendar entries and toolbar buttons have their own.
 *
 * Memoized on the builder inputs, so a render that changed none of them reuses every node.
 *
 * @param ctx - Schema context
 * @returns Fields by id
 */
export function buildFieldIndex(ctx: SchemaCtx): FieldIndex {
  return presentIndex(
    ctx.language,
    ctx.workspace,
    ctx.view,
    ctx.config,
    ctx.rawConfig,
    heldKey(ctx),
  );
}

/**
 * One panel's part of the present index, built alone: a card field's id names its panel, so a
 * lookup by id needs no other panel built. Not memoized.
 *
 * @param ctx - Schema context
 * @param panelId - Panel id, the scope of the fields wanted
 * @returns That panel's fields by id; none for an id no panel has
 */
export function panelFieldIndex(ctx: SchemaCtx, panelId: string): FieldIndex {
  const fields = new Map<FieldId, IndexedField>();
  const panel = PANELS.find((candidate) => candidate.id === panelId);
  if (panel) indexPanel(fields, panel, ctx);
  return { fields };
}

/**
 * Indexes one calendar entry's built schema.
 *
 * Its label path starts at `schemas/calendars.ts` › `ENTITY_PATH`, which is what today's
 * per-calendar form qualifies every string key with (`entity.event_type`).
 *
 * @param entrySchema - The entry's schema, as `entrySchema` builds it
 * @returns Fields by id, scoped `calendar`
 */
export function entityFieldIndex(entrySchema: ReadonlyArray<HaFormSchema>): FieldIndex {
  const fields = new Map<FieldId, IndexedField>();
  indexLeaves(fields, 'calendar', entrySchema, ENTITY_PATH, (name) => entityConfigKeys(name));
  return { fields };
}

/**
 * Indexes one toolbar button's schema, labeled under `schemas/card.ts` › `TOOLBAR_BUTTON_PATH`.
 *
 * @param buttonSchema - The button's fields, without their heading
 * @returns Fields by id, scoped `button`
 */
export function buttonFieldIndex(buttonSchema: ReadonlyArray<HaFormSchema>): FieldIndex {
  const fields = new Map<FieldId, IndexedField>();
  indexLeaves(fields, 'button', buttonSchema, TOOLBAR_BUTTON_PATH, (name) => [name]);
  return { fields };
}

/**
 * A field's label, worded as the form it was built for words it today: through the label path
 * the index keeps for it, which its lifted form no longer hands `computeLabel` by itself.
 *
 * @param field - Indexed field
 * @param language - Editor language
 * @returns The label
 */
export function fieldLabel(field: IndexedField, language: string): string {
  return computeLabel(language, field.node, field.labelPath);
}

/**
 * A field's helper line, worded as the form it was built for words it today, through its label
 * path, before the state words a page puts in front of it (`shown.ts`). A card field's is a panel
 * form's; a calendar field's is an entry form's, with the layouts its option
 * affects; a toolbar button field's is a button form's.
 *
 * @param field - Indexed field
 * @param ctx - Schema context the field was built in
 * @returns The helper, or `undefined` where the form shows none
 */
export function fieldHelper(field: IndexedField, ctx: SchemaCtx): string | undefined {
  const { scope } = parseFieldId(field.id);
  const { node, labelPath } = field;
  if (scope === 'calendar') {
    return computeSubformHelper(ctx.language, ctx.view, node, labelPath, entityScopeFor(node.name));
  }
  if (scope === 'button') return computeSubformHelper(ctx.language, ctx.view, node, labelPath);

  return computeHelper(ctx.language, ctx.view, node, labelPath, true);
}

/**
 * The schema context the editor builds for a configuration and workspace, as
 * `element.ts` › `CalendarCardProEditor._ctx` does.
 *
 * @param config - The configuration as the editor holds it, merged with root defaults
 * @param workspace - Editing workspace
 * @param language - Editor language
 * @returns The context its builders read
 */
export function schemaCtx(
  config: Types.Config,
  workspace: Workspace.EditorWorkspace,
  language: string,
): SchemaCtx {
  return {
    view: Workspace.baseViewForWorkspace(workspace),
    workspace,
    config: Routing.workspaceConfig(config, workspace),
    rawConfig: config,
    language,
  };
}

/**
 * The calendar entries' schema as the Calendars panel declares its sub-form (`schemas/calendars.ts`
 * › `calendarsSubforms`): read from the panel, the one place every builder of an entry's fields
 * takes it from.
 *
 * @param ctx - Schema context
 * @returns The declared fields
 */
function declaredEntitySchema(ctx: SchemaCtx): ReadonlyArray<HaFormSchema> {
  const subform = PANELS.find((panel) => panel.id === 'calendars')
    ?.subforms?.(ctx)
    .find((candidate) => candidate.path.join('.') === ENTITY_PATH.join('.'));
  return subform?.schema ?? buildEntitySchema(ctx);
}

/**
 * One calendar entry's schema, as `element.ts` › `_renderEntities` builds it with no filter
 * typed: the declaration narrowed to the entry's label, accent and the card's state, then the
 * fields the workspace's layout ignores withheld.
 *
 * @param entry - Entry as stored
 * @param ctx - Schema context
 * @returns The entry's fields
 */
export function entrySchema(entry: string | Types.EntityConfig, ctx: SchemaCtx): HaFormSchema[] {
  const own = Entities.asEntityConfig(entry);
  const toolbar = Config.resolveToolbar(ctx.config);
  const destination =
    ctx.workspace === undefined ? ctx.view : Workspace.viewForWorkspace(ctx.workspace);
  const declared = entitySchemaFor(
    declaredEntitySchema(ctx),
    Entities.labelTypeOf(entry),
    accentColorModeOf(own.accent_color),
    labelIconSourceOf(own.label),
    Entities.showsLocation(entry, ctx.config, destination),
    labelImageSourceOf(own.label),
    toolbar.show && toolbar.legend !== false,
    showsEventWeatherIn(ctx.config, destination),
    destination === undefined
      ? ctx.config.lanes === true
      : Lanes.lanesOn(resolveEffectiveConfig(ctx.config, destination), destination),
    // The calendar's, read across the list: the first entry for it that sets one decides.
    Config.configuredShowInLegend([...(ctx.config.entities ?? []), own], own.entity) !== false,
    Entities.countsDown(entry, ctx.config, destination),
  );
  return Filter.withholdInertFields(declared, ctx.workspace ?? ctx.view, 'entity');
}

/**
 * The layouts a calendar entry's page is built for: every layout the card can show
 * (`view.ts` › `reachableViews`), plus the one being edited where it is not among them, as a
 * search result for an option only that layout applies opens the page. In the card's order.
 *
 * @param config - Merged configuration
 * @param workspace - The workspace the page is open in
 * @returns The layouts
 */
export function entryViews(
  config: Types.Config,
  workspace: Workspace.EditorWorkspace,
): Types.EffectiveView[] {
  // Read as the editor reads the layout the card opens in, so a missing or unknown `view` is List.
  const starting = Routing.startingView(config);
  const reachable = reachableViews(
    config.view === starting ? config : { ...config, view: starting },
  );
  const editing = Workspace.viewForWorkspace(workspace);
  return VIEWS.filter((view) => reachable.includes(view) || view === editing);
}

/** A calendar entry's fields across the layouts its page is built for. */
export interface EntryAcross {
  /** Every field some layout builds, in the declared order. */
  readonly schema: HaFormSchema[];
  /** The layouts the page is built for (`entryViews`). */
  readonly views: ReadonlyArray<Types.EffectiveView>;
  /** By field name, the layouts that build it. */
  readonly layoutsOf: ReadonlyMap<string, ReadonlyArray<Types.EffectiveView>>;
}

/**
 * One calendar entry's schema across the layouts its page is built for: a field is drawn where
 * some layout applies it, and `layoutsOf` says which do. A calendar's options are stored once and
 * apply wherever a layout reads them, so the page is not one layout's.
 *
 * @param entry - Entry as stored
 * @param ctx - Schema context of the workspace the page is open in
 * @returns The merged schema, its layouts and each field's
 */
export function entrySchemaAcross(entry: string | Types.EntityConfig, ctx: SchemaCtx): EntryAcross {
  const config = ctx.rawConfig ?? ctx.config;
  const views = entryViews(config, ctx.workspace ?? ctx.view);
  const layoutsOf = new Map<string, Types.EffectiveView[]>();
  const schema: HaFormSchema[] = [];
  for (const view of views) {
    const built = entrySchema(entry, schemaCtx(config, view, ctx.language));
    built.forEach((node, at) => {
      const known = layoutsOf.get(node.name);
      if (known) {
        known.push(view);
        return;
      }
      layoutsOf.set(node.name, [view]);
      // Every layout's schema keeps the declared order, so a field another layout adds goes in
      // after the nearest field before it that is already here.
      const before = built
        .slice(0, at)
        .reverse()
        .find((each) => schema.some((placed) => placed.name === each.name));
      const after = before === undefined ? -1 : schema.findIndex((n) => n.name === before.name);
      schema.splice(after + 1, 0, node);
    });
  }
  return { schema, views, layoutsOf };
}
