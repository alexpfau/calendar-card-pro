/**
 * A field's value in words, as its control shows it, for a line that names values: a search
 * result, Stored Settings, a calendar row. A section row names no values; it describes its
 * page (`pages.ts` › `PageDef.descriptionKey`).
 */

import type { IndexedField } from './field-index';
import type { SelectOption } from './ha-form';
import { lookup } from './localize';
import { isColorNode } from './schemas/common';
import { SYNTHETIC_FIELDS, isSet, refinementHolds } from './synthetic';

/** Joins the parts of a summary. */
export const SUMMARY_SEPARATOR = ' · ';

/**
 * Describes a value the field cannot word itself: an action, a calendar or entity. Returns
 * `undefined` to leave the pair out.
 */
export type Describe = (field: Pick<IndexedField, 'node'>, value: unknown) => string | undefined;

/**
 * Words a field's value as its control shows it: On or Off for a switch, the option's label for
 * a dropdown, a number with the unit its box shows, the text or icon name as written; anything
 * else through `describe`.
 *
 * @param field - Indexed field
 * @param value - Its value, as its form holds it
 * @param language - Editor language
 * @param describe - Words what the field cannot
 * @returns The words, or `undefined` for a value with nothing to show
 */
export function wordValue(
  field: Pick<IndexedField, 'node'>,
  value: unknown,
  language: string,
  describe?: Describe,
): string | undefined {
  const selector = field.node.selector;
  // A color reads as its control names it ("Pink", "Divider, 50%"), not as its CSS.
  if (isColorNode(field.node)) {
    const words = describe?.(field, value);
    if (words !== undefined) return words;
  }
  if ('boolean' in selector) {
    if (value === true) return lookup(language, 'summary.on');
    if (value === false || !isSet(value)) return lookup(language, 'summary.off');
    // A switch whose option takes a further value is on, with the switch that refines it:
    // `show_countdown: once_per_day` is "On, Leave Out Repeated Countdowns".
    const refined = Object.entries(SYNTHETIC_FIELDS).find(
      ([name, each]) =>
        each.refines &&
        each.configKeys.includes(field.node.name) &&
        refinementHolds(name, field.node.name, value),
    )?.[0];
    const on = lookup(language, 'summary.on');
    return refined === undefined ? on : `${on}, ${lookup(language, refined)}`;
  }
  if ('select' in selector && selector.select?.multiple) {
    return Array.isArray(value)
      ? listWords(field, value, (selector.select.options ?? []) as Options, language)
      : undefined;
  }
  if ('select' in selector) {
    const options = (selector.select?.options ?? []) as Options;
    for (const option of options) {
      if (typeof option === 'string') {
        if (option === value) return option;
      } else if (option.value === value) {
        return option.label;
      }
    }
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
  if ('number' in selector) {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value);
    const unit = selector.number?.unit_of_measurement;
    // Only a bare number: the YAML may write the unit itself, `min_day_width: 120px`.
    return unit && text.trim() !== '' && Number.isFinite(Number(text))
      ? withUnit(text.trim(), unit)
      : text;
  }
  if ('text' in selector || 'icon' in selector) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
  return describe?.(field, value);
}

/** Units written against their number, as a length or a share is: "100px", "60%". */
const CLOSE_UNITS: ReadonlySet<string> = new Set(['%', 'px']);

/**
 * A number with its unit: set close where the unit is a length or a share, after a space where it
 * is a word, "30 min".
 *
 * @param text - The number, as written
 * @param unit - The unit its box shows
 * @returns The words
 */
function withUnit(text: string, unit: string): string {
  return CLOSE_UNITS.has(unit) ? `${text}${unit}` : `${text} ${unit}`;
}

/** A dropdown's options, labeled or bare. */
type Options = ReadonlyArray<SelectOption | string>;

/**
 * Words a list of some of a field's options: their labels, in the options' order. Layouts in
 * Switcher offering every layout reads as that, rather than as four names.
 *
 * @param field - Indexed field
 * @param value - The values chosen
 * @param options - The options offered
 * @param language - Editor language
 * @returns The words, or `undefined` for a list choosing none
 */
function listWords(
  field: Pick<IndexedField, 'node'>,
  value: ReadonlyArray<unknown>,
  options: Options,
  language: string,
): string | undefined {
  const chosen = options.filter((option) =>
    value.includes(typeof option === 'string' ? option : option.value),
  );
  if (chosen.length === 0) return undefined;
  if (field.node.name === 'view_switcher_layouts' && chosen.length === options.length) {
    return lookup(language, 'summary.all_layouts');
  }
  return chosen
    .map((option) => (typeof option === 'string' ? option : option.label))
    .join(SUMMARY_SEPARATOR);
}
