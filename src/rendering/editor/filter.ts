/**
 * Filtering helpers for the visual editor's field search.
 */

import * as Entities from './entities';
import { type HaFormSchema, isGroupSchema } from './ha-form';
import * as EditorLocalize from './localize';
import { type PanelDef, type PanelExtra, walkSchema } from './panels';
import { entityConfigKeys } from './schemas/entity';
import { deriveSyntheticData, isSyntheticKey } from './synthetic';
import { deepEqual, toStoredConfig } from './value';
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
}

export const NO_FILTER: FilterCriteria = { query: '', customizedOnly: false };

export const SEARCH_FIELD = 'search';

export const CUSTOMIZED_ONLY_FIELD = 'customized_only';

export const FILTER_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: SEARCH_FIELD, selector: { text: { type: 'search' } } },
  { name: CUSTOMIZED_ONLY_FIELD, selector: { boolean: {} } },
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
  };
}

/**
 * Everything matching needs that is not the node itself.
 */
export interface FilterCtx {
  language: string;
  view: Types.EffectiveView;
  config: Types.Config;
  criteria: FilterCriteria;
}

/**
 * Folds a query to the form matching compares against.
 *
 * @param query - Search text as typed
 * @returns The comparable form
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * The query, in the form matching uses.
 *
 * @param ctx - Matching context
 * @returns The comparable query, empty when nothing was typed
 */
function queryOf(ctx: FilterCtx): string {
  return normalizeQuery(ctx.criteria.query);
}

/**
 * Whether a set of criteria asks for anything at all.
 *
 * @param criteria - What the user has asked to see
 * @returns `true` when the editor is showing a subset of itself
 */
export function isFiltering(criteria: FilterCriteria): boolean {
  return criteria.customizedOnly || normalizeQuery(criteria.query) !== '';
}

/**
 * Whether one piece of text answers the query.
 *
 * @param text - Candidate text, or `undefined` when there is none
 * @param query - Normalized query
 * @returns `true` when the query appears in the text
 */
function textMatches(text: string | undefined, query: string): boolean {
  return typeof text === 'string' && text.toLowerCase().includes(query);
}

/**
 * Whether any of a set of strings answers the query.
 *
 * @param candidates - Text to search, holes allowed
 * @param query - Normalized query
 * @returns `true` when at least one matches
 */
function anyMatches(candidates: ReadonlyArray<string | undefined>, query: string): boolean {
  return candidates.some((text) => textMatches(text, query));
}

/**
 * Every string a node puts in front of the user, plus the keys behind them.
 *
 * @param node - Schema node
 * @param path - Enclosing group names, outermost first
 * @param ctx - Matching context
 * @param dataPath - Enclosing configuration keys, outermost first
 * @returns Text to search, in no particular order
 */
function searchableText(
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
  dataPath: ReadonlyArray<string>,
): Array<string | undefined> {
  if ('type' in node && node.type === 'grid') {
    return [];
  }

  const text: Array<string | undefined> = [node.name, EditorLocalize.qualifiedKey(node.name, path)];

  // The label path and the configuration path diverge wherever a group nests data without
  // nesting labels, so searching for the key as written in YAML has to match too.
  const dataKey = EditorLocalize.qualifiedKey(node.name, dataPath);
  if (dataKey !== text[1]) text.push(dataKey);

  if ('titleKey' in node && node.titleKey !== undefined) {
    text.push(node.title, EditorLocalize.lookup(ctx.language, `${node.titleKey}.helper`));
    return text;
  }

  text.push(
    EditorLocalize.computeLabel(ctx.language, node, path),
    EditorLocalize.computeHelper(ctx.language, ctx.view, node, path),
  );

  if ('value' in node && typeof node.value === 'string') {
    text.push(node.value);
  }

  if ('selector' in node && 'select' in node.selector && node.selector.select !== null) {
    for (const option of node.selector.select.options) {
      if (typeof option === 'string') {
        text.push(option);
        continue;
      }
      text.push(option.value, option.label, option.description);
    }
  }

  return text;
}

/**
 * Whether a node answers the search text.
 *
 * @param node - Schema node
 * @param path - Enclosing group names, outermost first
 * @param ctx - Matching context
 * @param dataPath - Enclosing configuration keys, outermost first. Defaults to `path`, which is
 *   correct everywhere the two agree.
 * @returns `true` when the node matches, or when nothing was typed
 */
export function matchesQuery(
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
  dataPath: ReadonlyArray<string> = path,
): boolean {
  const query = queryOf(ctx);
  if (query === '') return true;

  return anyMatches(searchableText(node, path, ctx, dataPath), query);
}

/**
 * Whether a panel's own heading answers the search text.
 *
 * @param panel - Panel definition
 * @param ctx - Matching context
 * @returns `true` when the panel matches, or when nothing was typed
 */
export function matchesPanel(panel: PanelDef, ctx: FilterCtx): boolean {
  const query = queryOf(ctx);
  if (query === '') return true;

  return anyMatches(
    [
      panel.id,
      EditorLocalize.lookup(ctx.language, panel.titleKey),
      EditorLocalize.lookup(ctx.language, `${panel.titleKey}.helper`),
    ],
    query,
  );
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

const storedConfig = Helpers.memoizeLast((config: Types.Config) => toStoredConfig(config));

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

  if (dataPath.length === 1 && OVERRIDE_BLOCK_KEYS.has(dataPath[0])) {
    const block = storedConfig(ctx.config)[dataPath[0]];

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

  // `setConfig` merges only the top level, so a nested block the user wrote partly — say a
  // `weather:` holding just `entity:` — leaves its remaining keys absent rather than filled in
  // from the defaults. Absent is not customized; the card still falls back to its own default.
  if (value === undefined) return false;

  return !deepEqual(value, valueAt(Config.DEFAULT_CONFIG, dataPath, name));
}

type LeafPredicate = (
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
) => boolean;

/**
 * Filters a schema to the nodes a predicate keeps, groups and all.
 *
 * @param schema - Schema to filter
 * @param ctx - Matching context
 * @param keeps - Decides one field
 * @param path - Enclosing group names, outermost first
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @returns The schema, reduced
 */
function filterNodes(
  schema: ReadonlyArray<HaFormSchema>,
  ctx: FilterCtx,
  keeps: LeafPredicate,
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
): HaFormSchema[] {
  const kept: HaFormSchema[] = [];

  for (const node of schema) {
    if (!isGroupSchema(node)) {
      if (keeps(node, path, dataPath)) kept.push(node);
      continue;
    }

    const nestsLabels = node.type === 'expandable' && node.name !== '';
    const nestsData = node.name !== '' && node.flatten !== true;

    const wholeGroup =
      !ctx.criteria.customizedOnly &&
      queryOf(ctx) !== '' &&
      matchesQuery(node, path, ctx, dataPath);

    const children = wholeGroup
      ? [...node.schema]
      : filterNodes(
          node.schema,
          ctx,
          keeps,
          nestsLabels ? [...path, node.name] : path,
          nestsData ? [...dataPath, node.name] : dataPath,
        );

    if (children.length === 0) continue;

    kept.push({ ...node, schema: children });
  }

  return kept;
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

  return filterNodes(
    schema,
    ctx,
    (node, nodePath, nodeDataPath) =>
      matchesQuery(node, nodePath, ctx, nodeDataPath) &&
      (!ctx.criteria.customizedOnly || isCustomized(node, nodeDataPath, ctx)),
    path,
    dataPath,
  );
}

/**
 * Whether a schema still holds anything a form would render.
 *
 * @param schema - Filtered schema
 * @returns `true` when at least one field is left
 */
export function hasFields(schema: ReadonlyArray<HaFormSchema>): boolean {
  for (const { node } of walkSchema(schema)) {
    if (!isGroupSchema(node)) return true;
  }

  return false;
}

/**
 * Filters the content a panel renders below its fields.
 *
 * @param extras - Content the panel built
 * @param panel - Panel definition
 * @param ctx - Matching context
 * @returns The content to render
 */
export function filterExtras(
  extras: ReadonlyArray<PanelExtra>,
  panel: PanelDef,
  ctx: FilterCtx,
): PanelExtra[] {
  if (!isFiltering(ctx.criteria)) return [...extras];
  if (ctx.criteria.customizedOnly) return [];
  if (matchesPanel(panel, ctx)) return [...extras];

  const query = queryOf(ctx);

  return extras.filter((extra) =>
    anyMatches(
      [extra.title, extra.note, ...extra.rows.flatMap((row) => [row.width, row.layout])],
      query,
    ),
  );
}

/**
 * Whether a calendar's own identity answers the query.
 *
 * @param entry - Entry as stored
 * @param ctx - Matching context
 * @returns `true` when the calendar matches, or when nothing was typed
 */
function matchesEntity(entry: string | Types.EntityConfig, ctx: FilterCtx): boolean {
  const query = queryOf(ctx);
  if (query === '') return true;

  const config = Entities.asEntityConfig(entry);
  const label = typeof config.label === 'string' ? config.label : undefined;

  return anyMatches([config.entity, label], query);
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
  if (!isFiltering(ctx.criteria)) return [...schema];

  const named = queryOf(ctx) !== '' && matchesEntity(entry, ctx);

  return filterNodes(
    schema,
    ctx,
    (node, nodePath) =>
      (named || matchesQuery(node, nodePath, ctx)) &&
      (!ctx.criteria.customizedOnly || isEntityFieldCustomized(entry, node)),
    path,
    [],
  );
}

/**
 * Filters the rows of a panel's exceptions widget.
 *
 * @param active - Exception rows currently declared
 * @param title - The widget's heading, as rendered
 * @param path - Label path the rows are rendered under
 * @param ctx - Matching context
 * @returns The rows to show
 */
export function filterExceptions<T extends HaFormSchema>(
  active: ReadonlyArray<T>,
  title: string,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
): T[] {
  if (!isFiltering(ctx.criteria)) return [...active];

  const query = queryOf(ctx);
  if (query !== '' && textMatches(title, query)) return [...active];

  return active.filter((field) => matchesQuery(field, path, ctx));
}
