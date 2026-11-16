/**
 * Type declarations for the subset of Home Assistant `<ha-form>` schemas this editor emits.
 * Schemas use selectors so Home Assistant chooses the concrete input element.
 */

/**
 * Options offered by a `select` selector.
 */
export interface SelectOption {
  value: string | number;
  label: string;
  description?: string;
  image?: string | { src: string; src_dark?: string };
  disabled?: boolean;
}

/**
 * The selector types this editor uses.
 */
export type Selector =
  | { boolean: Record<string, never> | null }
  | {
      text: {
        multiline?: boolean;
        prefix?: string;
        suffix?: string;
        type?: string;
        /** One input per value, the value a list: the word lists' terms. */
        multiple?: boolean;
      } | null;
    }
  | {
      number: {
        min?: number;
        max?: number;
        step?: number | 'any';
        mode?: 'box' | 'slider';
        unit_of_measurement?: string;
      } | null;
    }
  | {
      select: {
        options: ReadonlyArray<SelectOption> | ReadonlyArray<string>;
        mode?: 'list' | 'dropdown' | 'box';
        multiple?: boolean;
        custom_value?: boolean;
        box_max_columns?: number;
        sort?: boolean;
      } | null;
    }
  | {
      ui_action: {
        /**
         * The exact list the dropdown offers, replacing Home Assistant's defaults rather
         * than extending them. Omit it to take HA's own list, which knows nothing about
         * this card's actions.
         */
        actions?: ReadonlyArray<string>;
        default_action?: string;
      } | null;
    }
  | { icon: Record<string, never> | null }
  /**
   * A code editor for a value written as YAML, as Home Assistant's own editors take one they
   * have no form for. Used for a calendar's `visibility`, whose conditions nest.
   */
  | { object: Record<string, never> | null }
  | {
      entity: {
        filter?: { domain?: string | ReadonlyArray<string> };
        multiple?: boolean;
        reorder?: boolean;
        /** Entities the picker does not offer: Add Calendar's, the calendars already shown. */
        exclude_entities?: ReadonlyArray<string>;
      } | null;
    };
interface BaseSchema {
  name: string;
  required?: boolean;
  disabled?: boolean;
  /**
   * String key this node resolves its label and helper from, overriding the one derived
   * from its position.
   *
   * Home Assistant extends the label path for `ha-form-expandable` and for nothing else,
   * so a field nested for *storage* by a named `grid` is labeled as though it were at
   * the top level. That is usually right — a `grid` is layout. It is wrong when the same
   * field name means different things in different blocks, which is exactly the case the
   * day-header rule presents: `column:` and `time_grid:` both hold a `day_header_gap`,
   * and the rule inside it is described differently in each. Naming the key here keeps
   * both descriptions without putting a collapsible around the fields to earn the prefix.
   */
  titleKey?: string;
}

/**
 * A single input, bound to `name` and rendered by `selector`.
 */
export interface SelectorSchema extends BaseSchema {
  selector: Selector;
}

interface ConstantSchema extends BaseSchema {
  type: 'constant';
  value?: string;
}

/**
 * A responsive row of fields.
 */
export interface GridSchema {
  type: 'grid';
  name: string;
  schema: ReadonlyArray<HaFormSchema>;
  column_min_width?: string;
  flatten?: boolean;
}

interface ExpandableSchema extends BaseSchema {
  type: 'expandable';
  title?: string;
  icon?: string;
  iconPath?: string;
  expanded?: boolean;
  schema: ReadonlyArray<HaFormSchema>;
  flatten?: boolean;
}

/**
 * Any node an `<ha-form>` schema may contain.
 */
export type HaFormSchema = SelectorSchema | ConstantSchema | GridSchema | ExpandableSchema;

/**
 * Narrows to a node that groups other nodes.
 *
 * @param node - Schema node to test
 * @returns `true` when the node has children
 */
export function isGroupSchema(node: HaFormSchema): node is GridSchema | ExpandableSchema {
  return 'schema' in node;
}

/**
 * The element Home Assistant draws a node with, which it imports the first time a form holds such
 * a node (`LOAD_ELEMENTS` in `ha-form` and `ha-selector`, frontend 20261028.5): `ha-selector-`
 * and the selector's key for a field, `ha-form-` and the node's type for anything else.
 *
 * @param node - Schema node
 * @returns The element's tag
 */
export function elementOf(node: HaFormSchema): string {
  return 'selector' in node
    ? `ha-selector-${Object.keys(node.selector)[0]}`
    : `ha-form-${node.type}`;
}

/**
 * One node for each element some forms draw, a group without its children, in the order first
 * met, and one for each value they hold in a field whose element draws what its value picks,
 * holding that value: a form holding them has Home Assistant import every element those forms
 * need, and draw each branch those values pick, so that it imports what those draw as well.
 *
 * A node is keyed by its element's tag, and a value's by the tag and the value as JSON, so each
 * is held once. Values are read as `ha-form` reads them: a field's under its name, a group's
 * children from its own under its name unless it has none or is flattened.
 *
 * @param forms - The schema and data of each form
 * @param keep - Which nodes to hold, by key
 * @param valued - The selector types whose element draws what its value picks
 * @returns The keys held, the nodes, each value's renamed to its key, and the data holding each
 *   value under its key
 */
export function warmSchema(
  forms: Iterable<readonly [ReadonlyArray<HaFormSchema>, unknown]>,
  keep: (key: string) => boolean,
  valued: ReadonlyArray<string>,
): [string[], HaFormSchema[], Record<string, unknown>] {
  const nodes = new Map<string, HaFormSchema>();
  const data: Record<string, unknown> = {};
  const walk = (schema: ReadonlyArray<HaFormSchema>, values: unknown): void => {
    for (const node of schema) {
      const tag = elementOf(node);
      const value =
        !node.name || (isGroupSchema(node) && node.flatten)
          ? values
          : (values as Record<string, unknown> | undefined)?.[node.name];
      const key =
        'selector' in node && value !== undefined && valued.some((type) => type in node.selector)
          ? `${tag} ${JSON.stringify(value)}`
          : tag;
      if (!nodes.has(key) && keep(key)) {
        if (key !== tag) data[key] = value;
        nodes.set(
          key,
          isGroupSchema(node)
            ? { ...node, schema: [] }
            : key === tag
              ? node
              : { ...node, name: key },
        );
      }
      if (isGroupSchema(node)) walk(node.schema, value);
    }
  };
  for (const [schema, values] of forms) walk(schema, values);
  return [[...nodes.keys()], [...nodes.values()], data];
}
