/**
 * The one line under each section row on the overview: label-and-value pairs of the page's main
 * settings, then "Set: N" where the page stores values in this scope ("Show Past Events: On ·
 * Show Empty Days: Off · Set: 1"). Composed from the fields' own labels and values, never a
 * sentence per page, and never an assembled plural.
 */

import type { FieldId, FieldIndex, IndexedField } from './field-index';
import { fieldLabel } from './field-index';
import type { SelectOption } from './ha-form';
import { lookup } from './localize';
import type { PageDef } from './pages';
import { destination } from './routing';
import { interpolate } from './strings';
import type { EditorWorkspace } from './workspace';
import { isConfigBlock } from '../../utils/helpers';

/** Joins the parts of a summary. */
export const SUMMARY_SEPARATOR = ' · ';

/**
 * Describes a value the field cannot word itself: an action, a calendar or entity. Returns
 * `undefined` to leave the pair out.
 */
export type Describe = (field: IndexedField, value: unknown) => string | undefined;

/**
 * The value at a data path.
 *
 * @param data - Form data
 * @param path - Keys, outermost first
 * @returns The value, or `undefined` where a step is missing
 */
function at(data: unknown, path: ReadonlyArray<string>): unknown {
  let value = data;
  for (const key of path) value = isConfigBlock(value) ? value[key] : undefined;
  return value;
}

/**
 * Words a field's value as its control shows it: On or Off for a switch, the option's label for
 * a dropdown, the text or number as written; anything else through `describe`.
 *
 * @param field - Indexed field
 * @param value - Its value, as its form holds it
 * @param language - Editor language
 * @param describe - Words what the field cannot
 * @returns The words, or `undefined` for a value with nothing to show
 */
export function wordValue(
  field: IndexedField,
  value: unknown,
  language: string,
  describe?: Describe,
): string | undefined {
  const selector = field.node.selector;
  if ('boolean' in selector) {
    return value === true ? lookup(language, 'summary.on') : lookup(language, 'summary.off');
  }
  if ('select' in selector) {
    const options = (selector.select?.options ?? []) as ReadonlyArray<SelectOption | string>;
    for (const option of options) {
      if (typeof option === 'string') {
        if (option === value) return option;
      } else if (option.value === value) {
        return option.label;
      }
    }
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
  if ('text' in selector || 'number' in selector) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
  return describe?.(field, value);
}

/**
 * A page's summary: each of its summary fields present here, as "Label: Value", then "Set: N"
 * where the page stores values in this scope.
 *
 * @param page - The section page
 * @param present - The fields built for this configuration and scope
 * @param data - The scope's form data (`routing.ts` › `workspaceFormData`)
 * @param stored - How many of the page's values the YAML stores in this scope
 * @param language - Editor language
 * @param describe - Words values the field cannot
 * @returns The parts, in order, to join with `SUMMARY_SEPARATOR`
 */
export function summaryParts(
  page: PageDef,
  present: FieldIndex,
  data: Readonly<Record<string, unknown>>,
  stored: number,
  language: string,
  describe?: Describe,
): string[] {
  const parts: string[] = [];
  for (const id of page.summary) {
    const field = present.fields.get(id);
    if (field === undefined) continue;
    const value = wordValue(
      field,
      at(data, [...field.dataPath, field.node.name]),
      language,
      describe,
    );
    if (value === undefined) continue;
    parts.push(
      interpolate(lookup(language, 'summary.pair') ?? '{label}: {value}', {
        label: fieldLabel(field, language),
        value,
      }),
    );
  }
  if (stored > 0) parts.push(setCount(stored, language));
  return parts;
}

/**
 * "Set: N", a label and a number, so no language inflects for the count.
 *
 * @param count - How many values are stored
 * @param language - Editor language
 * @returns The words
 */
export function setCount(count: number, language: string): string {
  return interpolate(lookup(language, 'summary.set') ?? 'Set: {count}', { count: String(count) });
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
 * Whether the YAML stores a value for a card field in a scope: at its own nested path, or, for
 * a field on the card's root, where the scope writes each of its keys, a layout's block or the
 * top level. A top-level value a layout inherits is not stored in that layout.
 *
 * @param raw - Configuration as the YAML holds it
 * @param field - Indexed field
 * @param workspace - The scope
 * @returns `true` when the YAML stores it there
 */
export function storedIn(
  raw: Readonly<Record<string, unknown>>,
  field: IndexedField,
  workspace: EditorWorkspace,
): boolean {
  if (field.dataPath.length > 0) return holdsValue(at(raw, [...field.dataPath, field.node.name]));
  return field.configKeys.some((key) => {
    const block = destination(key, workspace);
    return holdsValue(block === undefined ? raw[key] : at(raw, [block, key]));
  });
}

/**
 * How many of a page's fields the YAML stores a value for, in a scope.
 *
 * @param page - The section page
 * @param isStored - Whether the YAML stores a value for a field in the scope
 * @returns The count
 */
export function pageStoredCount(page: PageDef, isStored: (id: FieldId) => boolean): number {
  let count = 0;
  for (const heading of page.headings) {
    for (const [id] of heading.fields) if (isStored(id)) count++;
  }
  return count;
}
