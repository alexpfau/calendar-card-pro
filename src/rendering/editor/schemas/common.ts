/**
 * The vocabulary every panel is written in.
 *
 * Nine panels describing a hundred-odd options only stays readable if a field is one
 * line, so these are the one-line forms. They are deliberately thin — each returns a
 * plain schema node and nothing else — because the value of a schema is that it is
 * data, and a helper that started making decisions would put those decisions back
 * where they were before the rebuild.
 *
 * **Colours are text, not `ui_color`.** Home Assistant's colour selector emits a
 * *theme token* — `primary`, `red`, `deep-purple` — which cards are expected to run
 * through `computeCssColor()` before use. This card has no such step: every colour is
 * written straight into a CSS custom property. A token would arrive at the browser as
 * `color: primary` and be dropped, and the picker cannot express the card's own
 * defaults anyway, three of which are `var(--…)` references and one of which,
 * `#03a9f450`, carries an alpha channel. Text keeps every value the card already
 * accepts, which is what the editor that ships today offers.
 */

import type { GridSchema, HaFormSchema, SelectOption, SelectorSchema } from '../ha-form';
import { humanize, lookup } from '../localize';

/**
 * Builds the options for a select, labelled from the string table.
 *
 * Option labels are keyed `<field>.option.<value>.label`, so they belong to the field
 * that offers them and cannot be mistaken for a value shared with another field that
 * happens to spell an option the same way.
 *
 * @param language - Effective language code
 * @param name - Field the options belong to
 * @param values - Option values, in the order they should appear
 * @returns Labelled options
 */
export function options(
  language: string,
  name: string,
  values: ReadonlyArray<string>,
): SelectOption[] {
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
 * Every CSS length in this card is text — `14px`, `1.2em`, `calc(…)` — so there is no
 * numeric control that would not narrow what the card already accepts.
 *
 * @param name - Config key
 * @returns The field
 */
export function text(name: string): SelectorSchema {
  return { name, selector: { text: {} } };
}

/**
 * A colour, as text. See the note at the top of this file for why it is not a picker.
 *
 * @param name - Config key
 * @returns The field
 */
export function color(name: string): SelectorSchema {
  return { name, selector: { text: {} } };
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
 * Unnamed by construction: a named grid would bind its children to a sub-object, and
 * a grid is a layout rather than a level of configuration.
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
 * Home Assistant decides where a group's data lives from its `name` and `flatten`
 * alone, uniformly across node types: a named group without `flatten` reads and writes
 * `data[name]`. A grid is therefore a perfectly good place to nest a sub-object, and
 * unlike an expandable it draws no heading — which is what the weather panel needs,
 * since a *Weather* group inside the *Weather* panel would be the same word twice.
 *
 * `column_min_width` is `100%` so the auto-fit track can only ever hold one column:
 * this is a level of configuration, not a row of fields, and its children lay
 * themselves out with their own grids.
 *
 * The trade is that a grid does not extend the label path, so children are labelled by
 * their bare names — see the note in `strings.ts` about which keys that affects.
 *
 * @param name - Config key holding the nested object
 * @param children - Fields stored inside it
 * @returns The scope
 */
export function scope(name: string, children: HaFormSchema[]): GridSchema {
  return { type: 'grid', name, column_min_width: '100%', schema: children };
}

/**
 * A collapsible sub-group whose children stay at the top level of the configuration.
 *
 * `flatten` is what keeps the configuration flat, so grouping costs no migration: the
 * fields inside read and write exactly the keys they are named after. Home Assistant
 * still qualifies their *label* keys with the group name, which `computeLabel`
 * resolves before falling back to the bare key — so the string table names fields
 * after their config key and never repeats the group.
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
 * The counterpart to `group`, for the two places the configuration genuinely nests —
 * the per-view override block and the two weather positions. Without `flatten`, Home
 * Assistant reads and writes `data[name]`, so the nesting needs no plumbing here.
 *
 * `titleKey` is separate from `name` because a nested group's own title is resolved by
 * Home Assistant *without* a path — `ha-form-expandable` calls the label hook on
 * itself before it starts qualifying its children — so a group named `date` inside
 * `weather` has to be told that its string is `weather.date`.
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
