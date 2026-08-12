/**
 * Finding an option: search, and "customized only".
 *
 * This is the payoff of being schema-driven, and it is deliberately small. An earlier
 * assessment rejected search on the grounds that it needed a hand-maintained registry of
 * every field; once the editor became schema-driven that verdict was overturned, because
 * **the schema is the registry**. Search is therefore a `.filter()` over the arrays a
 * panel already builds, applied on the way to `<ha-form>` — no list of field names, and
 * no second description of the editor to keep in step with the first.
 *
 * The rule that keeps it honest: this module filters **what a panel built**, never what
 * it might have built under a different configuration. A field gated off — the compact
 * modifier with no event limit set, the height with the card set to fit its content — is
 * not in the array, so it cannot be found, and that is correct: offering it would be
 * offering a control that is not there, and reaching it means changing the option that
 * gates it, which a search box cannot do on the user's behalf. What that costs is a
 * search that finds nothing, so the chassis says so rather than leaving an empty editor
 * to be interpreted.
 *
 * Nothing here imports Lit or touches the DOM, so every decision below is unit-testable
 * without rendering anything — which is the property that makes a filter safe to trust.
 */

import * as Entities from './entities';
import { type HaFormSchema, isGroupSchema } from './ha-form';
import * as EditorLocalize from './localize';
import { type PanelDef, type PanelExtra, walkSchema } from './panels';
import { deriveSyntheticData, isSyntheticKey } from './synthetic';
import { deepEqual, toStoredConfig } from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Helpers from '../../utils/helpers';

/** What the user has asked to see. */
export interface FilterCriteria {
  /** Search text, exactly as typed. */
  query: string;
  /** Show only options holding something other than what the card would do anyway. */
  customizedOnly: boolean;
}

/** No filter at all — every panel renders whole. */
export const NO_FILTER: FilterCriteria = { query: '', customizedOnly: false };

/** Field name of the search box. */
export const SEARCH_FIELD = 'search';

/** Field name of the switch that hides everything left at a default. */
export const CUSTOMIZED_ONLY_FIELD = 'customized_only';

/**
 * The filter bar itself.
 *
 * A **schema**, not two hand-written inputs, and that is the point rather than a
 * flourish. The editor names three Home Assistant components — `ha-form`,
 * `ha-expansion-panel` and `ha-svg-icon` — and every one of them is a container:
 * input elements are the ones Home Assistant renames, `ha-textfield` having become
 * `ha-input` in 2026.5 at the cost of a runtime-detection shim. A search box written as
 * `<ha-textfield>` would be a fourth component and the first input element in the
 * rebuild; written as a `text` selector it is a row of schema that Home Assistant
 * renders with whatever element it currently uses, and it costs no new dependency at all.
 *
 * It also means the bar's own label and helper resolve through the same three hooks as
 * every field in the editor, so `check:i18n` reconciles them like anything else — see
 * `chassisSubforms`.
 *
 * `type: 'search'` asks for the browser's search input, which brings a clear affordance
 * on the platforms that draw one and is ignored by the ones that do not. The date picker
 * already sets `type` the same way.
 */
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
 * `ha-form` reports its whole data object, so this reads what it needs and ignores the
 * rest — the same contract as every other form in the editor, minus the write path,
 * because none of this is configuration and none of it is ever stored.
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

/** Everything matching needs that is not the node itself. */
export interface FilterCtx {
  /** Effective language code, for resolving the strings the user actually reads. */
  language: string;
  /** View the card is configured to render, for the applicability notes. */
  view: Types.EffectiveView;
  /** Merged configuration, defaults already applied. */
  config: Types.Config;
  /** What the user has asked to see. */
  criteria: FilterCriteria;
}

/**
 * Folds a query to the form matching compares against.
 *
 * Case and surrounding space are noise; the rest is taken literally, so a user who types
 * `min_day_width` is searching for that key and not for three separate words.
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
 * Search matches **what the user sees**, because that is what they are looking at: the
 * label reads *Minimum Day Width*, so typing "width" has to find it, and requiring
 * `min_day_width` would be asking them to know the YAML they opened the editor to avoid.
 * The config key is matched *as well*, for the user who arrived from the documentation
 * with a key in hand — never instead.
 *
 * Option labels count for the same reason. A select's options are the answer to "where do
 * I turn week numbers off", and their text is the only place the word *ISO* appears.
 *
 * @param node - Schema node
 * @param path - Enclosing group names, outermost first
 * @param ctx - Matching context
 * @returns Text to search, in no particular order
 */
function searchableText(
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
): Array<string | undefined> {
  if ('type' in node && node.type === 'grid') {
    // A grid draws nothing of its own — no heading, no label — so it has no text to
    // match on. It survives on its children, which is what `filterSchema` does with it.
    return [];
  }

  const text: Array<string | undefined> = [node.name, EditorLocalize.qualifiedKey(node.name, path)];

  if ('titleKey' in node && node.titleKey !== undefined) {
    // A group resolves its own heading when it is built, so that is the string on
    // screen, and its helper is looked up under the same key with no path.
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
 * @returns `true` when the node matches, or when nothing was typed
 */
export function matchesQuery(
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  ctx: FilterCtx,
): boolean {
  const query = queryOf(ctx);
  if (query === '') return true;

  return anyMatches(searchableText(node, path, ctx), query);
}

/**
 * Whether a panel's own heading answers the search text.
 *
 * A panel is a group like any other as far as the user is concerned, so it earns the same
 * treatment: matching the heading shows the section whole rather than showing whichever
 * of its fields happens to repeat the word.
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

/**
 * The configuration with its numeric options coerced the way the card coerces them.
 *
 * The editor does **not** normalize its configuration — `setConfig` is a plain merge over
 * the defaults, while the card runs `normalizeNumericOptions` on every one of its own. So
 * a question asked here is asked of raw YAML, and asking *does this differ from the
 * default* of raw YAML answers wrongly in both directions: a quoted `'3'` renders an
 * identical card and would be reported as customized, and a `-1` the card throws away
 * would be reported as customized while the card is quietly using the default. Coercing
 * through `config.ts` first is the precedent `hasCompactEventLimit` set, applied to the
 * whole numeric surface rather than to one key.
 *
 * Copied first, because `normalizeNumericOptions` mutates what it is handed and this is
 * state the element is rendering from. Memoised for the same reason `storedConfig` is:
 * every field asks this of the same configuration during one render.
 */
const normalized = Helpers.memoizeLast((config: Readonly<Types.Config>) =>
  Config.normalizeNumericOptions({ ...config }),
);

/**
 * Reads a value out of a configuration by its data path.
 *
 * The **data** path, which is not the label path: `ha-form-expandable` qualifies its
 * children's label keys whether or not it is flattened, while their data only nests when
 * it is not. A filter that read the label path would look for `column.min_day_width`
 * inside a flattened group that stores its fields at the top level.
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

/**
 * Config keys holding a view's override block.
 *
 * Read from the table rather than named, so the one module in `src/` written with two
 * views known still names neither of them. A third view costs an entry in
 * `OVERRIDE_BLOCK_BY_VIEW` and nothing here.
 */
const OVERRIDE_BLOCK_KEYS: ReadonlySet<string> = new Set(
  Object.values(ViewConfig.OVERRIDE_BLOCK_BY_VIEW).filter(
    (key): key is keyof Types.Config => key !== undefined,
  ),
);

/**
 * The configuration as the editor would store it.
 *
 * Memoised on the configuration object, because every field asks the same question of
 * the same configuration during one render and the answer cannot change between them.
 */
const storedConfig = Helpers.memoizeLast((config: Types.Config) => toStoredConfig(config));

/**
 * Whether a field is holding something other than what the card would do anyway.
 *
 * Three kinds of key, three references, and not one of them is re-derived here:
 *
 * - **A value inside a view's override block** is customized exactly when the write path
 *   would keep it, so the write path is asked. It already owns every rule about that —
 *   the block-only defaults, the inherited overrides including
 *   `COLUMN_DEFAULT_OVERRIDES`, and `min_days_to_show`, whose default is `days_to_show`
 *   and so has to be resolved rather than looked up. A second implementation would be a
 *   second authority, and the two would disagree the first time either of them moved.
 * - **A synthetic field** has no config key to compare, so it is compared the only way it
 *   can be: what it derives from this configuration against what it derives from the
 *   default one. `height_mode` reads *Fixed height* because a height is set, which is
 *   exactly the question being asked of it.
 * - **Everything else** is its value against its default at the same data path, after the
 *   numeric coercion above.
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

  return !deepEqual(
    valueAt(normalized(ctx.config), dataPath, name),
    valueAt(Config.DEFAULT_CONFIG, dataPath, name),
  );
}

/**
 * Decides whether one field survives, given where it sits.
 *
 * The one thing that differs between the panels and the per-calendar forms: a panel's
 * field is customized when it differs from the card's default, a calendar's when the
 * calendar sets it at all. Everything else about filtering — the recursion, the group
 * rules, the empty-group rule — is the same for both, so it is written once.
 */
type LeafPredicate = (
  node: HaFormSchema,
  path: ReadonlyArray<string>,
  dataPath: ReadonlyArray<string>,
) => boolean;

/**
 * Filters a schema to the nodes a predicate keeps, groups and all.
 *
 * A group whose own heading answers the query is kept whole, because a user who typed
 * "density" asked for the density group rather than for whichever of its fields repeats
 * the word. A group that does not match keeps only its surviving children, and a group
 * with none left is dropped: an empty collapsible heading promises content that is not
 * there. "Customized only" grants a heading no such exemption — a group kept whole on the
 * strength of its title would bring back every default inside it.
 *
 * The two paths are tracked separately because Home Assistant treats them separately:
 * `ha-form-expandable` qualifies its children's **label** keys whether or not it is
 * flattened, while their **data** only nests when it is not. A grid contributes to
 * neither unless it is named, in which case it nests data and still draws no heading.
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
      !ctx.criteria.customizedOnly && queryOf(ctx) !== '' && matchesQuery(node, path, ctx);

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
 * The two criteria are an **and**: "customized only" with something typed means options
 * the user has changed *and* was looking for.
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
      matchesQuery(node, nodePath, ctx) &&
      (!ctx.criteria.customizedOnly || isCustomized(node, nodeDataPath, ctx)),
    path,
    dataPath,
  );
}

/**
 * Whether a schema still holds anything a form would render.
 *
 * Groups do not count: a heading with nothing under it is not content, which is the whole
 * reason `filterSchema` drops them.
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
 * The width table is explanation rather than configuration, so it follows the panel it
 * explains: shown whole when the panel is, matched on its own text when it is not, and
 * gone under "customized only" — a table of what the card does at each width is not a
 * setting anybody customized.
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
 * The heading of a per-calendar panel is its entity id and its subheading is the label
 * the user gave it, so both are text on screen and both are searchable — which is what
 * makes "birthdays" find the calendar rather than only the options that mention it.
 *
 * @param entry - Entry as stored
 * @param ctx - Matching context
 * @returns `true` when the calendar matches, or when nothing was typed
 */
export function matchesEntity(entry: string | Types.EntityConfig, ctx: FilterCtx): boolean {
  const query = queryOf(ctx);
  if (query === '') return true;

  const config = Entities.asEntityConfig(entry);
  const label = typeof config.label === 'string' ? config.label : undefined;

  return anyMatches([config.entity, label], query);
}

/**
 * Whether one calendar has set one of its own options.
 *
 * A different question from `isCustomized`, and a sharper one. Four of these options are
 * tri-state: the card reads them presence-first, so *absent* means "follow the card", and
 * mere presence is the honest test — the same test the collapsed summary already makes
 * when it says a calendar is configured.
 *
 * @param entry - Entry as stored
 * @param node - Schema node
 * @returns `true` when this calendar sets this option
 */
export function isEntityFieldCustomized(
  entry: string | Types.EntityConfig,
  node: HaFormSchema,
): boolean {
  const config = Entities.asEntityConfig(entry) as unknown as Record<string, unknown>;
  const value = config[node.name];

  return value !== undefined && value !== null && value !== '';
}

/**
 * Filters one calendar's settings.
 *
 * The same recursion as a panel's — these fields sit in grids too, and a `color` inside a
 * row is no less filterable for it — with the one predicate that differs. A calendar
 * matched by name keeps every field, for the same reason a matching group does: the user
 * asked for that calendar, not for the one option of it that repeats the word.
 * "Customized only" is again no exemption — a calendar following the card in every respect
 * has nothing customized to show, and its panel drops out.
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
 * An exception is a customization by construction — the user asked for this option to
 * differ in this view — so "customized only" keeps every declared row rather than asking
 * again whether it differs. It has to: an exception starts out equal to the value it
 * inherits, so a widget that hid a row until it was edited would hide the control the
 * user had just asked for.
 *
 * The widget's own heading is searchable like any other, and matching it keeps every row.
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

  // Matched under the path they are rendered under, so what the search compares against
  // is the label the row actually carries rather than the shared control's.
  return active.filter((field) => matchesQuery(field, path, ctx));
}
