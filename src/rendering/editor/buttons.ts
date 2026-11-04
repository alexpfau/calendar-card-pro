/**
 * Write path for the toolbar's own buttons, as the editor edits them: a panel per button, with
 * Move Up, Move Down and Remove, a form of four fields, and Add Button after the last.
 *
 * Every function here takes the list as the configuration writes it and returns a new one, so the
 * editor writes `toolbar.buttons` and nothing else. The list is read as written rather than as
 * the card resolves it: an entry the card cannot draw yet, such as one whose icon was just
 * cleared, is one somebody is still setting up, and must stay in the editor to be finished.
 */

import { NEW_TOOLBAR_BUTTON } from './schemas/card';
import { interpolate } from './strings';
import { deepEqual } from './value';
import * as Types from '../../config/types';
import * as Helpers from '../../utils/helpers';

/** The fields a button's form edits, which an edit may empty. */
const FIELDS = ['icon', 'name', 'entity', 'tap_action'] as const;

/** Nothing, as Home Assistant's action editor writes it: what a button with no action runs. */
const NO_ACTION = { action: 'none' } as const;

/**
 * The toolbar's buttons as the configuration writes them, every entry included.
 *
 * @param config - Merged configuration
 * @returns The list, or an empty one where there is no list
 */
export function writtenButtons(config: Readonly<Types.Config>): unknown[] {
  const list = Helpers.isConfigBlock(config.toolbar) ? config.toolbar.buttons : undefined;
  return Array.isArray(list) ? [...list] : [];
}

/**
 * One button's form data: the entry as written, so a key the form does not edit is handed back
 * untouched. An entry that is no object edits as an empty button.
 *
 * @param entry - The entry as written
 * @returns Form data for its form
 */
export function toButtonFormData(entry: unknown): Record<string, unknown> {
  return Helpers.isConfigBlock(entry) ? { ...entry } : {};
}

/**
 * Whether a field holds nothing worth storing: no value, or text of nothing but spaces.
 *
 * @param value - A field's value
 * @returns True when the field is empty
 */
function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * A button as stored after its form changed: every key the form handed back, in its order, with
 * an emptied field left out rather than stored blank, and text trimmed.
 *
 * Nothing picked as the tap action arrives as `{ action: 'none' }`, which runs exactly what no
 * tap action does, so it is left out too where the form changed the action to it. One the stored
 * button already held stays, as the editor keeps every default the YAML already holds.
 *
 * @param data - Form data as the form returned it
 * @param previous - The entry as stored before the change
 * @returns The entry to store
 */
export function fromButtonFormData(
  data: Readonly<Record<string, unknown>>,
  previous?: unknown,
): Record<string, unknown> {
  const before = toButtonFormData(previous);
  const entry: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const edited = (FIELDS as ReadonlyArray<string>).includes(key);
    if (edited && isEmpty(value)) continue;
    const nothingPicked =
      key === 'tap_action' &&
      deepEqual(value, NO_ACTION) &&
      !deepEqual(before.tap_action, NO_ACTION);
    if (nothingPicked) continue;
    entry[key] = edited && typeof value === 'string' ? value.trim() : value;
  }
  return entry;
}

/**
 * The list with one button's form change written into it.
 *
 * @param buttons - The list as written
 * @param index - Which button changed
 * @param data - Its form's data
 * @returns The new list, or a copy of the old one for an index it does not hold
 */
export function writeButton(
  buttons: ReadonlyArray<unknown>,
  index: number,
  data: Readonly<Record<string, unknown>>,
): unknown[] {
  const next = [...buttons];
  if (index < 0 || index >= buttons.length) return next;
  next[index] = fromButtonFormData(data, buttons[index]);
  return next;
}

/**
 * The list with one button moved a place up or down, past its neighbor.
 *
 * @param buttons - The list as written
 * @param index - Which button moves
 * @param by - `-1` to move it toward the start, `1` toward the end
 * @returns The new list, unchanged where the button is already at that end
 */
export function moveButton(buttons: ReadonlyArray<unknown>, index: number, by: -1 | 1): unknown[] {
  const next = [...buttons];
  const to = index + by;
  if (index < 0 || index >= buttons.length || to < 0 || to >= buttons.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * The list without one button.
 *
 * @param buttons - The list as written
 * @param index - Which button goes
 * @returns The new list
 */
export function removeButton(buttons: ReadonlyArray<unknown>, index: number): unknown[] {
  return buttons.filter((_entry, at) => at !== index);
}

/**
 * The list with a new button after the last: one holding an icon, so the card draws it at once
 * and its panel can be filled in from there.
 *
 * @param buttons - The list as written
 * @returns The new list
 */
export function addButton(buttons: ReadonlyArray<unknown>): unknown[] {
  return [...buttons, { ...NEW_TOOLBAR_BUTTON }];
}

/**
 * What a button's panel is headed by: its name, else its icon's words as a heading
 * (`mdi:arrow-left` reads "Arrow left"), else its place in the list, written from the editor's
 * `untitled` string.
 *
 * @param entry - The entry as written
 * @param index - Its place in the list, counting from zero
 * @param untitled - The words for a button with neither, with `{number}` for its place
 * @returns The heading
 */
export function buttonTitle(entry: unknown, index: number, untitled: string): string {
  const button = toButtonFormData(entry);
  if (typeof button.name === 'string' && button.name.trim() !== '') return button.name.trim();
  const words = typeof button.icon === 'string' ? Helpers.iconWords(button.icon.trim()) : '';
  if (words !== '') return words.charAt(0).toUpperCase() + words.slice(1);
  return interpolate(untitled, { number: index + 1 });
}
