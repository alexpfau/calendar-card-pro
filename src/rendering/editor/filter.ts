/**
 * View relevance for the visual editor: the fields a layout ignores are withheld before anything
 * else reads a schema. What a query finds is `search.ts`'s, and what a page shows of what is left
 * is `plan.ts`'s (the shown set); nothing here narrows a form by either.
 */

import { type HaFormSchema, isGroupSchema } from './ha-form';
import { walkSchema } from './panels';
import { entityConfigKeys } from './schemas/entity';
import { configKeysForField } from './synthetic';
import { type EditorWorkspace, viewForWorkspace } from './workspace';
import * as ViewConfig from '../../config/view';

/**
 * What the user has typed into the search field.
 */
export interface FilterCriteria {
  query: string;
}

export const NO_FILTER: FilterCriteria = { query: '' };

export const SEARCH_FIELD = 'search';

export const FILTER_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: SEARCH_FIELD, selector: { text: { type: 'search' } } },
];

/**
 * The search field's data, as the form binds it.
 *
 * @param criteria - What the user has typed
 * @returns Form data for the search field
 */
export function filterFormData(criteria: FilterCriteria): Record<string, unknown> {
  return { [SEARCH_FIELD]: criteria.query };
}

/**
 * Reads a change back out of the search field's form.
 *
 * @param data - Form data as returned by the form
 * @returns The criteria it describes
 */
export function toFilterCriteria(data: Readonly<Record<string, unknown>>): FilterCriteria {
  const query = data[SEARCH_FIELD];
  return { query: typeof query === 'string' ? query : '' };
}

/**
 * Whether the user has typed a search.
 *
 * @param criteria - What the user has typed
 * @returns `true` when the query holds more than whitespace
 */
export function hasQuery(criteria: FilterCriteria): boolean {
  return criteria.query.trim() !== '';
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
 * @param schema - Schema to filter
 * @param keeps - Decides one field
 * @param path - Enclosing group names, outermost first
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @returns The schema, reduced
 */
function filterNodes(
  schema: ReadonlyArray<HaFormSchema>,
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

    const children = filterNodes(
      node.schema,
      keeps,
      childLabelPath(node, path),
      childDataPath(node, dataPath),
    );

    if (!hasFields(children)) continue;

    kept.push({ ...node, schema: children });
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
