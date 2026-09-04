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
  | { text: { multiline?: boolean; prefix?: string; suffix?: string; type?: string } | null }
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
  | { ui_action: Record<string, never> | null }
  | { icon: Record<string, never> | null }
  | {
      entity: {
        filter?: { domain?: string | ReadonlyArray<string> };
        multiple?: boolean;
        reorder?: boolean;
      } | null;
    };
interface BaseSchema {
  name: string;
  required?: boolean;
  disabled?: boolean;
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

interface ExpandableSchema {
  type: 'expandable';
  name: string;
  title?: string;
  titleKey?: string;
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
