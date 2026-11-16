/**
 * View relevance, Customized Only and Essentials Only for the visual editor. What a query finds is
 * `search.ts`'s: results are rows of their own, and nothing here narrows a form by the query.
 */

import * as Entities from './entities';
import { isEssentialCalendarField, isEssentialCardField } from './essentials';
import { type HaFormSchema, isGroupSchema } from './ha-form';
import { type PanelExtra, type SchemaCtx, walkSchema } from './panels';
import * as Routing from './routing';
import { entityConfigKeys } from './schemas/entity';
import { configKeysForField, deriveSyntheticData, isSyntheticKey } from './synthetic';
import { deepEqual, storedViewBlocks } from './value';
import { type EditorWorkspace, viewForWorkspace } from './workspace';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/**
 * What the user has asked to see.
 */
export interface FilterCriteria {
  query: string;
  customizedOnly: boolean;
  /** Only the settings most cards need; a typed query sets it aside (see `appliesEssentials`). */
  essentialsOnly: boolean;
}

export const NO_FILTER: FilterCriteria = {
  query: '',
  customizedOnly: false,
  essentialsOnly: false,
};

export const SEARCH_FIELD = 'search';

export const CUSTOMIZED_ONLY_FIELD = 'customized_only';

export const ESSENTIALS_ONLY_FIELD = 'essentials_only';

export const FILTER_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: SEARCH_FIELD, selector: { text: { type: 'search' } } },
  { name: CUSTOMIZED_ONLY_FIELD, selector: { boolean: {} } },
  { name: ESSENTIALS_ONLY_FIELD, selector: { boolean: {} } },
];

/**
 * The filter bar's data, as the form binds it.
 *
 * @param criteria - What the user has asked to see
 * @returns Form data for the filter bar
 */
export function filterFormData(criteria: FilterCriteria): Record<string, unknown> {
  return {
    [SEARCH_FIELD]: criteria.query,
    [CUSTOMIZED_ONLY_FIELD]: criteria.customizedOnly,
    [ESSENTIALS_ONLY_FIELD]: criteria.essentialsOnly,
  };
}

/**
 * Reads a filter-bar change back out of the form.
 *
 * @param data - Form data as returned by the filter bar
 * @returns The criteria it describes
 */
export function toFilterCriteria(data: Readonly<Record<string, unknown>>): FilterCriteria {
  const query = data[SEARCH_FIELD];

  return {
    query: typeof query === 'string' ? query : '',
    customizedOnly: data[CUSTOMIZED_ONLY_FIELD] === true,
    essentialsOnly: data[ESSENTIALS_ONLY_FIELD] === true,
  };
}

/**
 * Everything matching needs that is not the node itself.
 */
export interface FilterCtx extends SchemaCtx {
  criteria: FilterCriteria;
  /**
   * The configuration as its YAML holds it, before any default is merged in: what tells a line
   * the card sets from one it only inherits, which Essentials Only keeps. `rawConfig` cannot
   * answer that, because its root already holds every default. Absent outside the editor, where
   * nothing counts as written.
   */
  stored?: Readonly<Record<string, unknown>>;
}

/**
 * Whether the switches narrow the editor now. A query does not: it shows results instead.
 *
 * @param criteria - What the user has asked to see
 * @returns `true` when the editor is showing a subset of itself
 */
export function isFiltering(criteria: FilterCriteria): boolean {
  return criteria.customizedOnly || appliesEssentials(criteria);
}

/**
 * Whether the user has typed a search.
 *
 * @param criteria - What the user has asked to see
 * @returns `true` when the query holds more than whitespace
 */
export function hasQuery(criteria: FilterCriteria): boolean {
  return criteria.query.trim() !== '';
}

/**
 * Whether Essentials Only is cutting the editor down right now.
 *
 * A typed query sets it aside, so search reaches every setting whatever the switch says.
 *
 * @param criteria - What the user has asked to see
 * @returns `true` while only the essential fields show
 */
export function appliesEssentials(criteria: FilterCriteria): boolean {
  return criteria.essentialsOnly && !hasQuery(criteria);
}

const normalized = Helpers.memoizeLast((config: Readonly<Types.Config>) =>
  Config.normalizeLengthOptions(Config.normalizeNumericOptions({ ...config })),
);

/**
 * Reads a value out of a configuration by its data path.
 *
 * @param source - Configuration to read
 * @param path - Enclosing object keys, outermost first
 * @param name - Key to read
 * @returns The value, or `undefined` when any step is missing
 */
function valueAt(source: unknown, path: ReadonlyArray<string>, name: string): unknown {
  let cursor: unknown = source;

  for (const step of [...path, name]) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[step];
  }

  return cursor;
}

const OVERRIDE_BLOCK_KEYS: ReadonlySet<string> = new Set(
  Object.values(ViewConfig.OVERRIDE_BLOCK_BY_VIEW).filter(
    (key): key is keyof Types.Config => key !== undefined,
  ),
);

const storedBlocks = Helpers.memoizeLast((config: Types.Config) => storedViewBlocks(config));

/**
 * Whether a field is holding something other than what the card would do anyway.
 *
 * @param node - Schema node
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @param ctx - Matching context
 * @returns `true` when the field differs from what the card would do untouched
 */
export function isCustomized(
  node: HaFormSchema,
  dataPath: ReadonlyArray<string>,
  ctx: FilterCtx,
): boolean {
  const name = node.name;
  const raw = ctx.rawConfig ?? ctx.config;

  if (ctx.workspace !== undefined && dataPath.length === 0) {
    const source = Routing.valueSource(raw, ctx.workspace, name);
    if (source === 'own') return true;
    if (source === 'default' || source === 'inherited') return false;
  }

  if (dataPath.length === 1 && OVERRIDE_BLOCK_KEYS.has(dataPath[0])) {
    const block = storedBlocks(raw)[dataPath[0]];

    return typeof block === 'object' && block !== null
      ? (block as Record<string, unknown>)[name] !== undefined
      : false;
  }

  if (dataPath.length === 0 && isSyntheticKey(name)) {
    return !deepEqual(
      deriveSyntheticData(normalized(ctx.config))[name],
      deriveSyntheticData(Config.DEFAULT_CONFIG)[name],
    );
  }

  const value = valueAt(normalized(ctx.config), dataPath, name);

  // A key the merged config does not carry at all — one absent from `DEFAULT_CONFIG`, or a
  // block the user cleared outright — is not customized; the card falls back to its own
  // default. `setConfig` now fills nested blocks in from the defaults, so the ordinary
  // partially-written block no longer arrives here undefined, and the branch below answers
  // it by comparison instead. This guard remains for the cases that never had a default.
  if (value === undefined) return false;

  return !deepEqual(value, valueAt(Config.DEFAULT_CONFIG, dataPath, name));
}

/**
 * Whether a value counts as written: blanks and nulls are how a cleared field is left.
 *
 * @param value - Value as stored
 * @returns `true` when the value is there
 */
function holdsValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Whether the card's YAML holds a value for a field: at the field's own nested path, or, for a
 * field on the card's root, at the root or in the selected layout's block, both of which it shows.
 *
 * Read from the YAML as stored. The view blocks the editor re-serializes for labeling drop a
 * line that normalizes to its default, such as a unitless `event_font_size: 14`, so asking them
 * would hide exactly the lines the YAML holds and Customized Only does not count.
 *
 * @param node - Schema node
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @param ctx - Matching context
 * @returns `true` when the YAML holds a value for it
 */
function isStored(node: HaFormSchema, dataPath: ReadonlyArray<string>, ctx: FilterCtx): boolean {
  const stored = ctx.stored;
  if (stored === undefined) return false;
  if (dataPath.length > 0) return holdsValue(valueAt(stored, dataPath, node.name));

  const workspace = ctx.workspace;
  return configKeysForField(node.name).some((key) => {
    if (holdsValue(stored[key])) return true;
    const block = workspace === undefined ? undefined : Routing.destination(key, workspace);
    return block !== undefined && holdsValue(valueAt(stored, [block], key));
  });
}

/**
 * Whether the card sets a field: its YAML holds a value for it, or the value differs from what
 * the card would use untouched.
 *
 * Asking `isCustomized` as well makes Customized Only and Essentials Only together show exactly
 * what Customized Only shows alone, rather than resting that on the two readings agreeing.
 *
 * @param node - Schema node
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @param ctx - Matching context
 * @returns `true` when the card sets it
 */
function isSetByCard(node: HaFormSchema, dataPath: ReadonlyArray<string>, ctx: FilterCtx): boolean {
  return isStored(node, dataPath, ctx) || isCustomized(node, dataPath, ctx);
}

type LeafPredicate = (
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
) => boolean;

type GroupSchema = Extract<HaFormSchema, { schema: ReadonlyArray<HaFormSchema> }>;

/**
 * The label path a group's children are rendered under: Home Assistant qualifies labels only
 * inside a named collapsible.
 *
 * @param node - Group
 * @param path - Label path the group itself is under
 * @returns Its children's label path
 */
function childLabelPath(node: GroupSchema, path: ReadonlyArray<string>): ReadonlyArray<string> {
  return node.type === 'expandable' && node.name !== '' ? [...path, node.name] : path;
}

/**
 * The configuration path a group's children write under: a named group nests its data unless
 * it is flattened.
 *
 * @param node - Group
 * @param dataPath - Configuration path the group itself is under
 * @returns Its children's configuration path
 */
function childDataPath(node: GroupSchema, dataPath: ReadonlyArray<string>): ReadonlyArray<string> {
  return node.name !== '' && node.flatten !== true ? [...dataPath, node.name] : dataPath;
}

/**
 * Filters a schema to the nodes a predicate keeps, groups and all.
 *
 * While Customized Only narrows the editor, every collapsible group it keeps opens, as the panels
 * around it do.
 *
 * @param schema - Schema to filter
 * @param ctx - Filter context, or undefined outside Customized Only and Essentials Only
 * @param keeps - Decides one field
 * @param path - Enclosing group names, outermost first
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @returns The schema, reduced
 */
function filterNodes(
  schema: ReadonlyArray<HaFormSchema>,
  ctx: FilterCtx | undefined,
  keeps: LeafPredicate,
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
): HaFormSchema[] {
  const kept: HaFormSchema[] = [];
  const opens = ctx?.criteria.customizedOnly === true;

  for (const node of schema) {
    if (!isGroupSchema(node)) {
      if (keeps(node, path, dataPath)) kept.push(node);
      continue;
    }

    const children = filterNodes(
      node.schema,
      ctx,
      keeps,
      childLabelPath(node, path),
      childDataPath(node, dataPath),
    );

    if (!hasFields(children)) continue;

    kept.push(
      opens && node.type === 'expandable'
        ? { ...node, schema: children, expanded: true }
        : { ...node, schema: children },
    );
  }

  return kept;
}

/**
 * Whether a node is a sub-heading rather than a setting.
 *
 * @param node - Schema node to test
 * @returns `true` for a `constant` node
 */
export function isHeading(node: HaFormSchema): boolean {
  return 'type' in node && node.type === 'constant';
}

/**
 * Drops headings left with nothing under them.
 *
 * A heading is a claim about the fields that follow it, so one whose section the filter
 * emptied is worse than no heading at all — it labels whatever happens to come next, or
 * stands alone captioning nothing. Searching "nothing" would otherwise match the text of
 * "When There Is Nothing To Show" and return it by itself.
 *
 * @param schema - Filtered schema
 * @returns The schema with unaccompanied headings removed
 */
function pruneLoneHeadings(schema: ReadonlyArray<HaFormSchema>): HaFormSchema[] {
  const kept: HaFormSchema[] = [];

  for (let i = 0; i < schema.length; i++) {
    const node = schema[i];

    if (isGroupSchema(node)) {
      kept.push({ ...node, schema: pruneLoneHeadings(node.schema) });
      continue;
    }

    if (!isHeading(node)) {
      kept.push(node);
      continue;
    }

    // The very next node decides, and there is nothing to scan for: everything that is not
    // a heading is content, groups included. An earlier form looped forward here, but its
    // guard was `!isHeading(schema[j])` and its body asked `isGroupSchema(schema[j]) ||
    // !isHeading(schema[j])` — true on the first pass by construction, so it always broke
    // immediately and the group test could never decide anything. Same answer, without the
    // scan that never scanned.
    const next = schema[i + 1];
    if (next !== undefined && !isHeading(next)) kept.push(node);
  }

  return kept;
}

/**
 * Withholds only controls with a recorded verdict excluding their view.
 *
 * Run before search: a matching panel or group must not restore an inert control.
 * Unknown keys stay visible. Data nesting matters, not label nesting: an unrelated
 * weather field must not inherit the scope of a same-named top-level option, while
 * a view block is checked against the view that owns it.
 *
 * @param schema - Complete schema, before search
 * @param view - View being configured, not the preview's width-dependent fallback
 * @param scope - Whether fields configure the card or one calendar
 * @returns Relevant fields, with empty groups and stranded headings removed
 */
export function withholdInertFields(
  schema: ReadonlyArray<HaFormSchema>,
  view: EditorWorkspace,
  scope: 'card' | 'entity' = 'card',
): HaFormSchema[] {
  const effectiveView = viewForWorkspace(view);

  return pruneLoneHeadings(
    filterNodes(
      schema,
      undefined,
      (node, _path, dataPath) => {
        if (isHeading(node)) return true;

        if (dataPath.length === 0) {
          if (scope === 'card') {
            return configKeysForField(node.name).some((key) =>
              effectiveView === undefined
                ? ViewConfig.appliesToSharedBase(key)
                : ViewConfig.appliesToView(key, effectiveView),
            );
          }

          return entityConfigKeys(node.name).some((key) => {
            const views = ViewConfig.entityScopeFor(key);
            if (effectiveView === undefined) {
              return ViewConfig.appliesToSharedBase(key, ViewConfig.entityScopeFor);
            }
            return views === undefined || views.has(effectiveView);
          });
        }

        const blockView =
          dataPath.length === 1
            ? ViewConfig.VIEWS.find(
                (candidate) => ViewConfig.viewBlockFor(candidate)?.blockKey === dataPath[0],
              )
            : undefined;

        return (
          scope === 'entity' ||
          blockView === undefined ||
          ViewConfig.appliesToView(node.name, blockView)
        );
      },
      [],
      [],
    ),
  );
}

/**
 * Filters a panel's schema to the options the criteria ask for.
 *
 * @param schema - Schema to filter
 * @param ctx - Matching context
 * @param path - Enclosing group names, outermost first
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @returns The schema, reduced
 */
export function filterSchema(
  schema: ReadonlyArray<HaFormSchema>,
  ctx: FilterCtx,
  path: ReadonlyArray<string> = [],
  dataPath: ReadonlyArray<string> = [],
): HaFormSchema[] {
  if (!isFiltering(ctx.criteria)) return [...schema];

  const essentials = appliesEssentials(ctx.criteria);

  return pruneLoneHeadings(
    filterNodes(
      schema,
      ctx,
      (node, _nodePath, nodeDataPath) =>
        // A heading is not a setting: it rides along, and is pruned above when its section came
        // back empty.
        isHeading(node) ||
        ((!ctx.criteria.customizedOnly || isCustomized(node, nodeDataPath, ctx)) &&
          (!essentials ||
            isEssentialCardField(node, nodeDataPath) ||
            isSetByCard(node, nodeDataPath, ctx))),
      path,
      dataPath,
    ),
  );
}

/**
 * Whether a schema still holds anything a form would render.
 *
 * Headings do not count: a panel reduced to nothing but its section labels has no
 * settings left and should not be offered.
 *
 * @param schema - Filtered schema
 * @returns `true` when at least one field is left
 */
export function hasFields(schema: ReadonlyArray<HaFormSchema>): boolean {
  for (const { node } of walkSchema(schema)) {
    if (!isGroupSchema(node) && !isHeading(node)) return true;
  }

  return false;
}

/**
 * How many settings a schema offers: its fields, without the groups and headings around them.
 *
 * @param schema - Schema to count
 * @returns The number of fields
 */
export function countFields(schema: ReadonlyArray<HaFormSchema>): number {
  let count = 0;
  for (const { node } of walkSchema(schema)) {
    if (!isGroupSchema(node) && !isHeading(node)) count++;
  }
  return count;
}

/**
 * Filters the content a panel renders below its fields.
 *
 * @param extras - Content the panel built
 * @param ctx - Filter context
 * @returns The content to render
 */
export function filterExtras(extras: ReadonlyArray<PanelExtra>, ctx: FilterCtx): PanelExtra[] {
  // A layout's width table explains the layout rather than setting it, so neither switch keeps it.
  return isFiltering(ctx.criteria) ? [] : [...extras];
}

/**
 * Whether one calendar has set one of its own options.
 *
 * @param entry - Entry as stored
 * @param node - Schema node
 * @returns `true` when this calendar sets this option
 */
function isEntityFieldCustomized(entry: string | Types.EntityConfig, node: HaFormSchema): boolean {
  const config = Entities.asEntityConfig(entry) as unknown as Record<string, unknown>;

  return entityConfigKeys(node.name).some((key) => {
    const value = config[key];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Filters one calendar's settings.
 *
 * @param schema - The per-calendar schema
 * @param entry - Entry as stored
 * @param path - Label path the sub-form is rendered under
 * @param ctx - Matching context
 * @returns The schema, reduced
 */
export function filterEntitySchema(
  schema: ReadonlyArray<HaFormSchema>,
  entry: string | Types.EntityConfig,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
): HaFormSchema[] {
  const relevant = withholdInertFields(schema, ctx.workspace ?? ctx.view, 'entity');
  if (!isFiltering(ctx.criteria)) return relevant;

  const essentials = appliesEssentials(ctx.criteria);

  return pruneLoneHeadings(
    filterNodes(
      relevant,
      ctx,
      (node) =>
        isHeading(node) ||
        ((!ctx.criteria.customizedOnly || isEntityFieldCustomized(entry, node)) &&
          (!essentials || isEssentialCalendarField(node) || isEntityFieldCustomized(entry, node))),
      path,
      [],
    ),
  );
}

/**
 * Whether one toolbar button holds a value in one of its fields.
 *
 * @param entry - The button as written
 * @param node - Schema node
 * @returns `true` when this button sets this field
 */
function isButtonFieldCustomized(entry: unknown, node: HaFormSchema): boolean {
  const value = Helpers.isConfigBlock(entry) ? entry[node.name] : undefined;
  return value !== undefined && value !== null && value !== '';
}

/**
 * Filters one toolbar button's fields, as `filterEntitySchema` does a calendar's: under
 * "customized only", only where the button sets it. Essentials Only names no button field, so
 * it keeps the fields the button sets: a button the card has is part of what the card does.
 *
 * @param schema - A button's fields
 * @param entry - The button as written
 * @param path - Label path the fields are rendered under
 * @param ctx - Matching context
 * @returns The fields, reduced
 */
export function filterButtonSchema(
  schema: ReadonlyArray<HaFormSchema>,
  entry: unknown,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
): HaFormSchema[] {
  if (!isFiltering(ctx.criteria)) return [...schema];

  const essentials = appliesEssentials(ctx.criteria);

  return pruneLoneHeadings(
    filterNodes(
      schema,
      ctx,
      (node) =>
        isHeading(node) ||
        ((!ctx.criteria.customizedOnly || isButtonFieldCustomized(entry, node)) &&
          (!essentials || isButtonFieldCustomized(entry, node))),
      path,
      [],
    ),
  );
}
