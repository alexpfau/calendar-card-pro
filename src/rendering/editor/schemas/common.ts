/**
 * Shared schema helpers.
 */

import type { GridSchema, HaFormSchema, SelectOption, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';

/**
 * Builds the options for a select, labeled from the string table.
 *
 * @param language - Effective language code
 * @param name - Field the options belong to
 * @param values - Option values, in the order they should appear
 * @returns Labeled options
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
 * @param labelKey - Key the option labels are named under, when not the field's own name: a
 * field inside a block (`toolbar.legend`) names its options by its full path
 * @returns The field
 */
export function select(
  language: string,
  name: string,
  values: ReadonlyArray<string>,
  labelKey: string = name,
): SelectorSchema {
  return {
    name,
    selector: { select: { mode: 'dropdown', options: options(language, labelKey, values) } },
  };
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
 * A color, as text.
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
 * Home Assistant qualifies a **label** only under `ha-form-expandable`. So fields in a bare
 * `scope` keep their values where they belong and lose the key prefix their translations are
 * filed under, silently, in every language at once.
 *
 * Stamping `titleKey` restores it. Nine languages' worth of `time_grid.*` prose stays
 * addressable, and two views keep separate descriptions of the same option instead of
 * collapsing onto one bare key. A named child is another scope and prefixes its own children,
 * so it is left alone, and an explicit `titleKey` always wins.
 *
 * @param name - Config key holding the nested object
 * @param children - Fields stored inside it
 * @returns The scope
 */
export function blockScope(name: string, children: HaFormSchema[]): GridSchema {
  return scope(
    name,
    children.map((node) =>
      'schema' in node || node.titleKey !== undefined
        ? node
        : { ...node, titleKey: `${name}.${node.name}` },
    ),
  );
}
