/**
 * The one line under each section row on the overview: label-and-value pairs of the page's main
 * settings, then "Set: N" where the page stores values in this scope ("Show Past Events: On ·
 * Show Empty Days: Off · Set: 1"). Composed from the fields' own labels and values, never a
 * sentence per page, and never an assembled plural. A toggle chip stands for its group, which
 * reads as the names of the chips pressed ("Time · End Time · Location · Countdown"), or for the
 * toolbar's controls, whose names read as actions, as their count ("Controls: 5 on").
 */

import { CHIP_LABELS, isPressed } from './chips';
import type { FieldId, FieldIndex, IndexedField } from './field-index';
import { fieldLabel, parseFieldId } from './field-index';
import type { SelectOption } from './ha-form';
import { lookup } from './localize';
import type { PageDef } from './pages';
import { atPath, destination } from './routing';
import { isColorNode } from './schemas/common';
import { interpolate } from './strings';
import { configKeysForField, isSet } from './synthetic';
import type { EditorWorkspace } from './workspace';

/** Joins the parts of a summary. */
export const SUMMARY_SEPARATOR = ' · ';

/**
 * Describes a value the field cannot word itself: an action, a calendar or entity. Returns
 * `undefined` to leave the pair out.
 */
export type Describe = (field: Pick<IndexedField, 'node'>, value: unknown) => string | undefined;

/**
 * Words a field's value as its control shows it: On or Off for a switch, the option's label for
 * a dropdown, the text, number or icon name as written; anything else through `describe`.
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
    return value === true ? lookup(language, 'summary.on') : lookup(language, 'summary.off');
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
  if ('text' in selector || 'number' in selector || 'icon' in selector) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
  return describe?.(field, value);
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
  const chipsDone = new Set<string>();
  for (const id of page.summary) {
    const kind = chipKind(page, id);
    if (kind !== undefined) {
      if (!chipsDone.has(kind)) {
        const pressed = pressedChips(page, kind, present, data, language);
        // A toolbar control's name reads as an action ("Reset"), so the toolbar's are counted.
        if (kind !== 'toolbar') parts.push(...pressed);
        else if (pressed.length > 0) {
          parts.push(
            interpolate(lookup(language, 'summary.controls_on') ?? '', {
              count: String(pressed.length),
            }),
          );
        }
      }
      chipsDone.add(kind);
      continue;
    }
    const field = present.fields.get(id);
    if (field === undefined) continue;
    const value = wordValue(
      field,
      atPath(data, field.dataPath, field.node.name),
      language,
      describe,
    );
    if (value === undefined) continue;
    parts.push(
      interpolate(lookup(language, 'summary.pair') ?? '{label}: {value}', {
        label: fieldLabel(field, language),
        // Words typed into a text field are quoted, so a title holding " · " stays one value; a
        // time or a number is not words.
        value:
          'text' in field.node.selector && /\p{L}/u.test(value)
            ? interpolate(lookup(language, 'summary.quoted') ?? '{value}', { value })
            : value,
      }),
    );
  }
  if (stored > 0) parts.push(setCount(stored, language));
  return parts;
}

/**
 * The chip group a page draws a field in, if it draws it as a chip.
 *
 * @param page - The page
 * @param id - The field
 * @returns The group's kind, or `undefined`
 */
function chipKind(page: PageDef, id: FieldId): string | undefined {
  for (const heading of page.headings) {
    for (const [each, appearance] of heading.fields) {
      if (each === id && typeof appearance === 'object' && 'chips' in appearance) {
        return appearance.chips;
      }
    }
  }
  return undefined;
}

/**
 * The names of a chip group's pressed chips present here, in the page's order.
 *
 * @param page - The page
 * @param kind - The group
 * @param present - The fields built for this configuration and scope
 * @param data - The scope's form data
 * @param language - Editor language
 * @returns The names
 */
function pressedChips(
  page: PageDef,
  kind: string,
  present: FieldIndex,
  data: Readonly<Record<string, unknown>>,
  language: string,
): string[] {
  return page.headings.flatMap((heading) =>
    heading.fields.flatMap(([id, appearance]) => {
      if (typeof appearance !== 'object' || !('chips' in appearance)) return [];
      if (appearance.chips !== kind) return [];
      const field = present.fields.get(id);
      if (field === undefined || !isPressed(atPath(data, field.dataPath, field.node.name))) {
        return [];
      }
      return [lookup(language, CHIP_LABELS[id]) ?? CHIP_LABELS[id]];
    }),
  );
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
 * Where the YAML stores a value for a card field in a scope, as configuration paths: its own
 * nested path, or, for a field on the card's root, where the scope writes each of its keys, a
 * layout's block or the top level. A top-level value a layout inherits is not stored in that
 * layout. Read from the field's id, so a field a gate holds back is counted all the same.
 *
 * @param raw - Configuration as the YAML holds it
 * @param id - The field
 * @param workspace - The scope
 * @returns Each path that holds a value, dot-joined
 */
export function storedPaths(
  raw: Readonly<Record<string, unknown>>,
  id: FieldId,
  workspace: EditorWorkspace,
): string[] {
  const { dataPath, name } = parseFieldId(id);
  const paths: Array<readonly [ReadonlyArray<string>, string]> =
    dataPath.length > 0
      ? [[dataPath, name]]
      : configKeysForField(name).map((key) => {
          const block = destination(key, workspace);
          return [block === undefined ? [] : [block], key];
        });
  return paths
    .filter(([path, key]) => isSet(atPath(raw, path, key)))
    .map(([path, key]) => [...path, key].join('.'));
}

/**
 * How many values the YAML stores among a page's settings, in a scope: each stored path once,
 * however many of the page's controls write it.
 *
 * @param page - The section page
 * @param raw - Configuration as the YAML holds it
 * @param workspace - The scope
 * @returns The count
 */
export function pageStoredCount(
  page: PageDef,
  raw: Readonly<Record<string, unknown>>,
  workspace: EditorWorkspace,
): number {
  const stored = new Set<string>();
  for (const heading of page.headings) {
    for (const [id] of heading.fields) {
      for (const path of storedPaths(raw, id, workspace)) stored.add(path);
    }
  }
  return stored.size;
}
