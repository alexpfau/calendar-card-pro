/**
 * Shared schema helpers.
 */

import type { GridSchema, HaFormSchema, SelectOption, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';

/**
 * Builds the options for a select, labelled from the string table.
 *
 * @param language - Effective language code
 * @param name - Field the options belong to
 * @param values - Option values, in the order they should appear
 * @returns Labelled options
 */
function options(language: string, name: string, values: ReadonlyArray<string>): SelectOption[] {
  return values.map((value) => ({
    value,
    label: lookup(language, `${name}.option.${value}.label`) ?? humanize(value),
  }));
}

/**
 * A dropdown over a fixed set of values.
 *
 * @param language - Effective language code
 * @param name - Config or synthetic key
 * @param values - Option values, in the order they should appear
 * @returns The field
 */
export function select(
  language: string,
  name: string,
  values: ReadonlyArray<string>,
): SelectorSchema {
  return {
    name,
    selector: { select: { mode: 'dropdown', options: options(language, name, values) } },
  };
}

/**
 * A sub-heading inside a panel or group.
 *
 * `constant` is Home Assistant's static-text node, and with **no `value`** it renders as a
 * bare bold label — verified against a live editor. Passing a `value` turns it into a
 * `Label: value` data row instead, so this helper deliberately does not accept one.
 *
 * A heading is only worth adding where the fields under it are contiguous; one placed over
 * a scattered category is worse than none, because it silently claims the fields that
 * happen to follow it.
 *
 * @param name - String key for the heading text
 * @returns The node
 */
export function heading(name: string): HaFormSchema {
  return { name, type: 'constant' };
}

/**
 * A checkbox.
 *
 * @param name - Config key
 * @returns The field
 */
export function bool(name: string): SelectorSchema {
  return { name, selector: { boolean: {} } };
}

/**
 * Free text.
 *
 * @param name - Config key
 * @returns The field
 */
export function text(name: string): SelectorSchema {
  return { name, selector: { text: { type: 'text' } } };
}

/**
 * A colour, as text.
 *
 * @param name - Config key
 * @returns The field
 */
export function color(name: string): SelectorSchema {
  return { name, selector: { text: { type: 'text' } } };
}

/**
 * A bounded number.
 *
 * @param name - Config key
 * @param min - Smallest accepted value
 * @param max - Largest accepted value, where one is meaningful
 * @param unit - Unit shown after the field
 * @returns The field
 */
export function number(name: string, min: number, max?: number, unit?: string): SelectorSchema {
  return {
    name,
    selector: { number: { min, ...(max === undefined ? {} : { max }), unit_of_measurement: unit } },
  };
}

/**
 * A responsive row, which Home Assistant collapses to one column as the pane narrows.
 *
 * @param children - Fields to place side by side
 * @returns The row
 */
export function row(...children: HaFormSchema[]): GridSchema {
  return { type: 'grid', name: '', schema: children };
}

/**
 * A nesting level with no chrome.
 *
 * @param name - Config key holding the nested object
 * @param children - Fields stored inside it
 * @returns The scope
 */
export function scope(name: string, children: HaFormSchema[]): GridSchema {
  return { type: 'grid', name, column_min_width: '100%', schema: children };
}

/**
 * A `scope` whose fields keep naming their own strings.
 *
 * Storage nesting and label nesting are separate mechanisms here, and this exists because
 * assuming the first implies the second is the trap. A named `grid` nests **data** — that
 * is the rule `filter.ts` walks, and the only reason `weather.entity` reaches config — but
 * Home Assistant qualifies a **label** only under `ha-form-expandable`. So fields moved out
 * of a collapsible and into a bare `scope` keep their values where they were and lose the
 * key prefix their translations are filed under, silently, in every language at once.
 *
 * Stamping `titleKey` restores it. Nine languages' worth of `time_grid.*` prose stays
 * addressable, and two views keep separate descriptions of the same option instead of
 * collapsing onto one bare key.
 *
 * Unnamed containers are recursed into, since a `row` is chrome rather than a level. A
 * named one is another scope and prefixes its own children, so it is left alone. An
 * explicit `titleKey` always wins.
 *
 * @param name - Config key holding the nested object
 * @param children - Fields stored inside it
 * @returns The scope
 */
export function blockScope(name: string, children: HaFormSchema[]): GridSchema {
  const isGrid = (node: HaFormSchema): node is GridSchema => 'type' in node && node.type === 'grid';

  const stamp = (node: HaFormSchema): HaFormSchema => {
    if (isGrid(node)) {
      return node.name === '' ? { ...node, schema: node.schema.map(stamp) } : node;
    }

    if (node.name === '' || node.titleKey !== undefined) {
      return node;
    }

    return { ...node, titleKey: `${name}.${node.name}` };
  };

  return scope(name, children.map(stamp));
}

/**
 * A collapsible sub-group whose children stay at the top level of the configuration.
 *
 * @param language - Effective language code
 * @param name - Group key, used for its title and helper
 * @param iconPath - Material Design icon path
 * @param children - Fields in the group
 * @returns The group
 */
export function group(
  language: string,
  name: string,
  iconPath: string,
  children: HaFormSchema[],
): HaFormSchema {
  return {
    type: 'expandable',
    name,
    flatten: true,
    title: lookup(language, name) ?? humanize(name),
    titleKey: name,
    iconPath,
    schema: children,
  };
}

/**
 * A collapsible group whose children are stored inside an object of their own.
 *
 * @param language - Effective language code
 * @param name - Config key holding the nested object
 * @param titleKey - String key for the group's title
 * @param iconPath - Material Design icon path
 * @param children - Fields in the group
 * @returns The group
 */
export function nested(
  language: string,
  name: string,
  titleKey: string,
  iconPath: string,
  children: HaFormSchema[],
): HaFormSchema {
  return {
    type: 'expandable',
    name,
    title: lookup(language, titleKey) ?? humanize(titleKey),
    titleKey,
    iconPath,
    schema: children,
  };
}
