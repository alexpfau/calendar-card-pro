/**
 * The visual editor, mounted, read and driven by field id.
 *
 * A test names a field by its id, as `src/rendering/editor/field-index.ts` builds it:
 * `events:show_time`, `layout:time_grid.start_time`, `calendar:name`, `button:icon`. It names
 * an owner where the id repeats, because two calendars, two blocks of one calendar and two
 * toolbar buttons each draw the same ids. An entry or a button is named by its place in the list,
 * or by the key the editor gives it, which stays with it wherever the list moves it. This module is
 * the one place that knows how today's editor draws its forms. The redesign changes that several
 * times: closed panels stopped mounting their forms, entries and buttons gained stable keys,
 * panels became pages. Each of those changes this module and leaves the tests that go through it
 * alone.
 *
 * Today the card's fields sit one to a form on the overview and on one page per section, a calendar
 * entry's one to a form on that entry's own page, and only the open place draws its forms. A helper
 * that needs a field elsewhere goes there as a user would (`openPageOf`): to a section page from
 * its row on the overview, to an entry's page from the entry's row. `openPanels` visits every
 * page and every entry's, keeping what each drew for the synchronous helpers to read. Every form
 * is an `ha-form`, told apart by the class the editor gives it:
 *
 * | Class                             | Owner   | Scope                                          |
 * | --------------------------------- | ------- | ---------------------------------------------- |
 * | `field-form`                      | card    | its wrapper's `data-field` id                  |
 * | `entity-form`                     | entry   | `calendar`                                     |
 * | `button-form`                     | button  | `button`                                       |
 * | `filter-form`                     | chassis | `filter` (the search field)                    |
 * | `quick-setup-form`                | chassis | `quick_setup`                                  |
 * | `add-calendar-form`               | chassis | `add_calendar` (Add Calendar's picker)         |
 * | `entry-calendar-form`             | chassis | `entry_calendar` (an entry page's Calendar)    |
 * | `split-form`                      | chassis | `split` (Split This Calendar's own fields)     |
 *
 * Card Displays and Settings For are the editor's own radio groups rather than forms. The ids
 * `display:view` and `workspace:editing_workspace` still name them, for `changeField` and
 * `valueOf`, which choose and read them as a user does. A toolbar button's fields sit in its row,
 * which a helper opens as a user does.
 *
 * A color field is the editor's own control too (`colors.ts`), drawn for the color, or for the
 * mode it absorbs (`events:accent_color_mode`), with the color's value inside. It stands in as a
 * form for those ids (`colorForm`): its schema and data are theirs, so every helper reads it as it
 * reads any field, and a change sent to it is made in the control as a user makes it, by its rows,
 * its swatches, or Custom and the text typed there (`driveColor`).
 *
 * The chassis scopes are this module's own: `field-index.ts` indexes the nine panels, calendar
 * entries and toolbar buttons, and the chassis draws forms that belong to none of them. They
 * follow the same pattern, `filter:search`. An `ha-form` of any other class fails every helper,
 * so a form the editor gains cannot slip past them unnoticed.
 *
 * An id may also name a block that nests its fields' data (`card:toolbar`, `layout:time_grid`),
 * whose value is the object the form holds for it, or a heading a form draws (`button:heading`).
 */

import { setImmediate as nodeImmediate, setTimeout as nodeTimeout } from 'node:timers';

import * as Config from '../../src/config/config';
import type * as Types from '../../src/config/types';
import * as Buttons from '../../src/rendering/editor/buttons';
import * as Colors from '../../src/rendering/editor/colors';
import { CalendarCardProEditor } from '../../src/rendering/editor/element';
import * as Entities from '../../src/rendering/editor/entities';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchema,
  fieldHelper,
  fieldId,
  fieldLabel,
  parseFieldId,
  universeIndex,
} from '../../src/rendering/editor/field-index';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import * as HassKey from '../../src/rendering/editor/hass-key';
import { withCardActionLabels } from '../../src/rendering/editor/hass-localize';
import { ENTRY_GROUPS, PAGES, placementOf } from '../../src/rendering/editor/pages';
import { type SchemaCtx, walkSchema } from '../../src/rendering/editor/panels';
import { PREFS_KEY } from '../../src/rendering/editor/prefs';
import * as Routing from '../../src/rendering/editor/routing';
import {
  TOOLBAR_BUTTON_PATH,
  buildToolbarButtonSchema,
  cardSubforms,
} from '../../src/rendering/editor/schemas/card';
import {
  QUICK_SETUP_CALENDARS_SCHEMA,
  QUICK_SETUP_TAPS_SCHEMA,
  QUICK_SETUP_WEATHER_SCHEMA,
} from '../../src/rendering/editor/schemas/quick-setup';
import { chassisSchemas } from '../../src/rendering/editor/subforms';
import * as Value from '../../src/rendering/editor/value';
import * as WordLists from '../../src/rendering/editor/word-lists';
import { WORKSPACES } from '../../src/rendering/editor/workspace';
import * as Helpers from '../../src/utils/helpers';

/** An `ha-form` as the editor hands it its properties. */
export interface FormElement extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
  hass?: Types.Hass;
  computeLabel?: (schema: HaFormSchema, data?: unknown, options?: { path?: string[] }) => string;
  computeHelper?: (schema: HaFormSchema, options?: { path?: string[] }) => string | undefined;
}

/** An editor element the helpers can read: mounted, with an update to await. */
export type EditorElement = HTMLElement & { readonly updateComplete: Promise<unknown> };

/** The editor as `mountEditor` hands it back, taking any configuration a test writes. */
export type MountedEditor = CalendarCardProEditor & {
  hass: unknown;
  setConfig(config: unknown): void;
};

/**
 * Who draws a form. An entry is a calendar block, and a button a toolbar button, by its position
 * in `entities` or `toolbar.buttons`, or by the key the editor gives it (`keysOf`), which stays with
 * it wherever the list moves it; with neither, either means any of them. Named by its key, an entry
 * or a button is also an owner as the editor writes for one (`write-frames.ts` › `WriteOwner`).
 */
export type Owner =
  | { readonly kind: 'card' }
  | { readonly kind: 'chassis' }
  | { readonly kind: 'entry'; readonly index?: number; readonly key?: number }
  | { readonly kind: 'button'; readonly index?: number; readonly key?: number };

/** The card's own settings: the panels' forms and the toolbar buttons' caption. */
export const CARD: Owner = { kind: 'card' };

/** The forms above the panels, belonging to none of them. */
export const CHASSIS: Owner = { kind: 'chassis' };

/**
 * A calendar block, by its position in the configuration's `entities`, not among the panels
 * drawn: a search can leave out the panels before it. Or by its key, which a removal above it, a
 * duplicate or the calendar picker does not move.
 *
 * @param at - Position in `entities`, or `{ key }`; every block when omitted
 * @returns The owner
 */
export function entry(at?: number | { readonly key: number }): Owner {
  if (at === undefined) return { kind: 'entry' };
  return typeof at === 'number' ? { kind: 'entry', index: at } : { kind: 'entry', key: at.key };
}

/**
 * A toolbar button, by its position in `toolbar.buttons`, or by its key.
 *
 * @param at - Position in the list, or `{ key }`; every button when omitted
 * @returns The owner
 */
export function button(at?: number | { readonly key: number }): Owner {
  if (at === undefined) return { kind: 'button' };
  return typeof at === 'number' ? { kind: 'button', index: at } : { kind: 'button', key: at.key };
}

/** Chassis forms, by class, with the scope their ids take. */
const CHASSIS_FORMS: Readonly<Record<string, string>> = {
  'filter-form': 'filter',
  'quick-setup-form': 'quick_setup',
  'add-calendar-form': 'add_calendar',
  'entry-calendar-form': 'entry_calendar',
  'split-form': 'split',
};

/** The editor's own radio groups, by the id a test names them with, with each input's name. */
const RADIO_GROUPS: Readonly<Record<string, string>> = {
  'display:view': 'view',
  'workspace:editing_workspace': 'scope',
};

const CHASSIS_SCOPES: ReadonlySet<string> = new Set([
  ...Object.values(CHASSIS_FORMS),
  'display',
  'workspace',
]);

/** One form the editor draws, with who draws it and the scope of its ids. */
interface Drawn {
  readonly form: FormElement;
  readonly kind: Owner['kind'];
  /** Position in `entities` or `toolbar.buttons`, for an entry's or a button's form. */
  readonly index?: number;
  /** The key the editor gives that entry or button. */
  readonly key?: number;
  readonly scope: string;
  /** Place among every form the editor draws, counted from 1, to tell two forms apart. */
  readonly place: number;
  /** The page it was drawn on, for a form `openPanels` kept from a page no longer open. */
  readonly page?: string;
}

/** A node a form draws, as `walkSchema` visits it. */
interface Visit {
  readonly node: HaFormSchema;
  readonly path: ReadonlyArray<string>;
  readonly dataPath: ReadonlyArray<string>;
}

interface Found extends Drawn {
  readonly visit: Visit;
  /** Every form drawing a block, where the fields it nests sit in forms of their own. */
  readonly all?: ReadonlyArray<Found>;
}

/**
 * The editor's private state the harness reads: the configuration it holds, the contexts its
 * builders and its filter read, and the key it gives each entry and each button, which a drawn
 * panel names (`data-entry-key`, `data-button-key`).
 */
interface EditorState {
  readonly _config?: Types.Config;
  /** The context every builder reads (`element.ts` › `_ctx`). */
  readonly _ctx: SchemaCtx;
  /** A key per calendar entry, in list order (`element.ts` › `_entryKeysFor`). */
  readonly _entryKeys?: ReadonlyArray<number>;
  /** A key per toolbar button, in list order (`element.ts` › `_buttonKeysFor`). */
  readonly _buttonKeys?: ReadonlyArray<number>;
}

/**
 * The editor's private state.
 *
 * @param editor - Editor element
 * @returns The members the harness reads
 */
function stateOf(editor: EditorElement): EditorState {
  return editor as unknown as EditorState;
}

/**
 * The configuration the editor holds, for telling which entry or button a form belongs to.
 *
 * @param editor - Editor element
 * @returns Its merged configuration, if it has one
 */
function heldConfig(editor: EditorElement): Types.Config | undefined {
  return stateOf(editor)._config;
}

/**
 * Fails where the harness and the editor disagree about what a panel draws.
 *
 * @param what - The panel, for the message
 * @returns Never
 */
function outOfStep(what: string): never {
  throw new Error(
    `${what}: await editor.updateComplete first, or bring tests/helpers/editor-host.ts back ` +
      'in step with how element.ts draws it.',
  );
}

/**
 * Which calendar entry the entry page open belongs to, by the key the editor gives each entry
 * (`data-entry-key`) and keeps in list order. Two entries of one calendar can hold the same form
 * data, so the key is what tells them apart.
 *
 * The key is the editor's own word for it, so the page is also held to what the harness works
 * out on its own: an entry the configuration holds, whose forms each hold that entry's data, as
 * `entities.ts` › `toEntityFormData` projects it, narrowed to the form's own field
 * (`routing.ts` › `formDataFor`). Where any of that fails, the helper fails rather
 * than guess: a page the editor drew for the wrong entry would otherwise read as that entry's.
 *
 * @param editor - Editor element
 * @param root - Its shadow root
 * @returns Position in `entities` by the entry page open, empty when none is
 */
function entryIndexes(editor: EditorElement, root: ShadowRoot): Map<Element, number> {
  const indexes = new Map<Element, number>();
  const pages = [...root.querySelectorAll('.entry-page')];
  if (pages.length === 0) return indexes;
  if (pages.length > 1) outOfStep(`The editor draws ${pages.length} entry pages at once`);

  const { _config: config, _entryKeys: keys = [] } = stateOf(editor);
  const entries = config?.entities ?? [];
  const page = pages[0];
  const key = page.getAttribute('data-entry-key');
  const index = key === null ? -1 : keys.indexOf(Number(key));
  if (index < 0 || index >= entries.length) {
    outOfStep(`An entry page keyed ${key ?? 'nothing'} matches no entry`);
  }
  const data = Entities.toEntityFormData(entries[index], entries);
  for (const form of page.querySelectorAll<FormElement>('ha-form.entity-form')) {
    if (
      !Value.deepEqual(asWritten(form), asWritten(form, Routing.formDataFor(data, form.schema)))
    ) {
      outOfStep(`The page of entry ${index} holds another entry's data`);
    }
  }
  indexes.set(page, index);
  return indexes;
}

/**
 * A form's data as it writes it: a word list drawn one term at a time (`text` with `multiple`)
 * holds its terms, and writes them as one pattern (`word-lists.ts` › `toPattern`), where an empty
 * list writes no line at all, as an absent value is none.
 *
 * @param form - The form
 * @param data - Data in its shape, its own when omitted
 * @returns The data, each list of terms as the pattern it writes and no line where it writes none
 */
function asWritten(
  form: FormElement,
  data: Readonly<Record<string, unknown>> = form.data,
): Record<string, unknown> {
  const written = { ...data };
  for (const node of form.schema) {
    const selector = 'selector' in node ? node.selector : undefined;
    if (selector === undefined || !('text' in selector) || selector.text?.multiple !== true)
      continue;
    const value = written[node.name];
    const pattern = Array.isArray(value) ? WordLists.toPattern(value.map(String)) : value;
    if (pattern === '' || pattern === undefined) delete written[node.name];
    else written[node.name] = pattern;
  }
  return written;
}

/**
 * Which toolbar button each drawn button row belongs to, by the key the editor gives each
 * button's row (`data-button-key`) and keeps in list order. Each of the row's forms must hold
 * that button's data, narrowed to its own field; where one does not, the helper fails rather
 * than guess.
 *
 * @param editor - Editor element
 * @param root - Its shadow root
 * @returns Position in `toolbar.buttons` by row
 */
function buttonIndexes(editor: EditorElement, root: ShadowRoot): Map<Element, number> {
  const indexes = new Map<Element, number>();
  const panels = [...root.querySelectorAll('.button-row')];
  if (panels.length === 0) return indexes;

  const { _config: config, _buttonKeys: keys = [] } = stateOf(editor);
  const written = config === undefined ? [] : Buttons.writtenButtons(config);
  for (const panel of panels) {
    const key = panel.getAttribute('data-button-key');
    const index = key === null ? -1 : keys.indexOf(Number(key));
    if (index < 0 || index >= written.length) {
      outOfStep(`A toolbar button row keyed ${key ?? 'nothing'} matches no button`);
    }
    const data = Buttons.toButtonFormData(written[index]);
    for (const form of panel.querySelectorAll<FormElement>('ha-form.button-form')) {
      if (!Value.deepEqual(form.data, Routing.formDataFor(data, form.schema))) {
        outOfStep(`The row of toolbar button ${index} holds another button's data`);
      }
    }
    indexes.set(panel, index);
  }
  return indexes;
}

/**
 * The key an entry's page or a button's panel names.
 *
 * @param panel - The page or panel, if any
 * @returns Its key, or undefined where it names none
 */
function keyOf(panel: Element | null): number | undefined {
  const key = panel?.getAttribute('data-entry-key') ?? panel?.getAttribute('data-button-key');
  return key === null || key === undefined ? undefined : Number(key);
}

/** The scope of every form a helper has placed, kept for one a render has since replaced. */
const formScopes = new WeakMap<Element, string>();

/**
 * Places one form the editor draws: who draws it and the scope of its ids.
 *
 * @param form - The form
 * @param place - Its place among every form drawn, counted from 1
 * @param entries - Position in `entities` by entry page
 * @param buttons - Position in `toolbar.buttons` by button panel
 * @returns The form, placed
 */
function placeForm(
  form: FormElement,
  place: number,
  entries: ReadonlyMap<Element, number>,
  buttons: ReadonlyMap<Element, number>,
): Drawn {
  const classes = form.classList;
  const control = colorControls.get(form) ?? composedControls.get(form);
  if (control !== undefined) {
    const id = control.getAttribute('data-field')!;
    const page = control.closest('.entry-page');
    if (page !== null) {
      return {
        form,
        kind: 'entry',
        index: entries.get(page),
        key: keyOf(page),
        scope: 'calendar',
        place,
      };
    }
    return { form, kind: 'card', scope: parseFieldId(id).scope, place };
  }
  if (classes.contains('field-form')) {
    const id = form.closest('[data-field]')?.getAttribute('data-field');
    if (!id) outOfStep('A field form outside a field wrapper');
    return { form, kind: 'card', scope: parseFieldId(id).scope, place };
  }
  if (classes.contains('entity-form')) {
    const page = form.closest('.entry-page');
    const index = page === null ? undefined : entries.get(page);
    return { form, kind: 'entry', index, key: keyOf(page), scope: 'calendar', place };
  }
  if (classes.contains('button-form')) {
    const panel = form.closest('.button-row');
    const index = panel === null ? undefined : buttons.get(panel);
    return { form, kind: 'button', index, key: keyOf(panel), scope: 'button', place };
  }
  const chassis = Object.keys(CHASSIS_FORMS).find((name) => classes.contains(name));
  if (chassis !== undefined) {
    return { form, kind: 'chassis', scope: CHASSIS_FORMS[chassis], place };
  }
  throw new Error(
    `The editor draws an ha-form the harness does not know, class "${form.className}": ` +
      'teach tests/helpers/editor-host.ts its owner and scope.',
  );
}

/**
 * Every form the editor draws, in document order, with its owner and scope.
 *
 * @param editor - Editor element
 * @returns The forms
 */
function drawnForms(editor: EditorElement): Drawn[] {
  const root = editor.shadowRoot;
  if (root === null) {
    throw new Error('The editor has not rendered: mount it, and await its first update.');
  }
  const live = liveForms(editor, root);
  const open = openPage(editor);
  // Quick Setup and the migration choice draw in place of every page, and a search draws what it
  // finds of every page on the overview itself.
  const results =
    root.querySelector('.overview') !== null && root.querySelector('[data-focus^="nav:"]') === null;
  const paged = root.querySelector('.overview, .page') !== null && !results;
  // Search results draw the card's fields themselves, and calendar entries as rows: an entry's
  // fields are still on its page.
  const kept = paged
    ? keptForms(editor).filter((drawn) => drawn.page !== open)
    : results
      ? keptForms(editor).filter((drawn) => drawn.page?.startsWith('entry:'))
      : [];
  return [...live, ...kept.map((drawn, at) => ({ ...drawn, place: live.length + at + 1 }))];
}

/**
 * The forms the open place draws, in document order, with their owners and scopes.
 *
 * @param editor - Editor element
 * @param root - Its shadow root
 * @param page - The page they are drawn on, for keeping them
 * @returns The forms
 */
function liveForms(editor: EditorElement, root: ShadowRoot, page?: string): Drawn[] {
  const entries = entryIndexes(editor, root);
  const buttons = buttonIndexes(editor, root);
  // A color control stands for the fields it edits, Custom's text field among them, and any other
  // control the editor composes for its field (`composedForm`).
  return [...root.querySelectorAll<HTMLElement>('ha-form, .color-field, [data-composed]')]
    .filter((form) => form.closest('[inert]') === null)
    .flatMap((node) =>
      node.classList.contains('color-field')
        ? [colorForm(editor, node)]
        : node.hasAttribute('data-composed')
          ? [composedForm(editor, node)]
          : node.closest('.color-field, [data-composed]') === null
            ? [node as FormElement]
            : [],
    )
    .map((form, at) => {
      const drawn = { ...placeForm(form, at + 1, entries, buttons), page };
      formScopes.set(form, drawn.scope);
      return drawn;
    });
}

/** The control each color control's stand-in form stands for, by stand-in. */
const colorControls = new WeakMap<Element, Element>();

/** The stand-in form for each color control, by the control's wrapper. */
const colorForms = new WeakMap<Element, FormElement>();

/**
 * A color control's spec and the fields it edits as drawn now: the field it is drawn for, and the
 * value of a mode it absorbs while its gate draws it (`colors.ts` › `cardColorFields`).
 *
 * @param editor - Editor element
 * @param anchor - The id the control's wrapper names
 * @returns The spec and the fields, in order
 */
function colorFieldsOf(
  editor: EditorElement,
  control: Element,
  anchor: FieldId,
): {
  readonly spec: Colors.ColorSpec;
  readonly fields: ReadonlyArray<IndexedField>;
  readonly data: Record<string, unknown>;
} {
  const ctx = stateOf(editor)._ctx;
  const config = heldConfig(editor);
  const key = keyOf(control.closest('.entry-page'));
  const entities = config?.entities ?? [];
  const entry = key === undefined ? undefined : entities[keysOf(editor, 'entry').indexOf(key)];
  const colors = key === undefined ? Colors.cardColorFields(ctx) : Colors.entryColorFields(ctx);
  const spec = colors.specs.get(anchor);
  if (spec === undefined) outOfStep(`'${anchor}' is drawn as a color control but is no color`);
  if (key !== undefined && entry === undefined) outOfStep(`No entry is keyed ${key}`);
  const present =
    entry === undefined
      ? buildFieldIndex(ctx).fields
      : entityFieldIndex(entrySchema(entry, ctx)).fields;
  const data =
    entry === undefined
      ? (editor as unknown as { _formData(): Record<string, unknown> })._formData()
      : Entities.toEntityFormData(entry, entities);
  const ids = spec.mode === anchor ? [anchor, spec.value] : [anchor];
  return { spec, data, fields: ids.flatMap((id) => (present.has(id) ? [present.get(id)!] : [])) };
}

/**
 * A color control as a form standing for the fields it edits, so a test names them by id as it
 * names any field: its schema is theirs, its data the editor's own for them, its labels and
 * helpers theirs. A change it is sent is made in the control as a user makes it: a row, a swatch,
 * or Custom and the text typed there (`driveColor`).
 *
 * @param editor - Editor element
 * @param control - The control's wrapper, `.color-field`
 * @returns The stand-in
 */
function colorForm(editor: EditorElement, control: Element): FormElement {
  const known = colorForms.get(control);
  if (known !== undefined) return known;
  const anchor = control.getAttribute('data-field')!;
  const form = document.createElement('div') as unknown as FormElement;
  form.className = 'color-form';
  const fieldOf = (node: HaFormSchema): IndexedField | undefined =>
    colorFieldsOf(editor, control, anchor).fields.find((field) => field.node.name === node.name);
  Object.defineProperties(form, {
    schema: {
      get: () => colorFieldsOf(editor, control, anchor).fields.flatMap((field) => field.lifted),
    },
    data: {
      get: () => Routing.formDataFor(colorFieldsOf(editor, control, anchor).data, form.schema),
    },
    // As Custom's text field is handed it (`element.ts` › `_feed`).
    hass: {
      get: () => {
        const hass = (editor as unknown as { hass?: Types.Hass }).hass;
        const language = stateOf(editor)._ctx.language;
        return HassKey.needsLiveHass(form.schema)
          ? withCardActionLabels(hass, language)
          : HassKey.steadyHass(hass, language);
      },
    },
    computeLabel: {
      value: (node: HaFormSchema) => {
        const field = fieldOf(node);
        return field === undefined ? '' : fieldLabel(field, stateOf(editor)._ctx.language);
      },
    },
    // The state words the control shows under it lead its helper, as a text field's do.
    computeHelper: {
      value: (node: HaFormSchema) => {
        const field = fieldOf(node);
        if (field === undefined) return undefined;
        const words = control.querySelector('.color-words')?.textContent?.trim();
        return (
          [words ? `${words}.` : undefined, fieldHelper(field, stateOf(editor)._ctx)]
            .filter((part) => part !== undefined)
            .join(' ') || undefined
        );
      },
    },
  });
  // Where it sits is where its control sits.
  form.closest = ((selector: string) => control.closest(selector)) as typeof form.closest;
  form.dispatchEvent = (event: Event): boolean => {
    driveColor(editor, control, anchor, (event as CustomEvent).detail?.value ?? {});
    return true;
  };
  colorControls.set(form, control);
  colorForms.set(control, form);
  return form;
}

/**
 * Makes a change sent to a color control's stand-in in the control itself, as a user would:
 * opens it, then for each field that moved, a mode before its value, chooses the row that writes
 * the value, the swatch that is it, Default for none, or Custom and types it. Rendered
 * synchronously between steps (Lit's `performUpdate`), as `emitChange` is synchronous.
 *
 * @param editor - Editor element
 * @param control - The control's wrapper
 * @param anchor - The id it is drawn for
 * @param incoming - The stand-in's whole data, as a form sends it
 */
function driveColor(
  editor: EditorElement,
  control: Element,
  anchor: FieldId,
  incoming: Record<string, unknown>,
): void {
  const element = editor as unknown as { requestUpdate(): void; performUpdate(): void };
  const draw = (): void => {
    element.requestUpdate();
    element.performUpdate();
  };
  const choose = (selector: string, what: string): void => {
    const input = control.querySelector<HTMLInputElement>(`${selector} input`);
    if (!input) outOfStep(`The color control for '${anchor}' offers no ${what}`);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    draw();
  };
  const toggle = control.querySelector<HTMLButtonElement>('.color-toggle');
  if (!toggle) outOfStep(`The color control for '${anchor}' draws no button`);
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
    draw();
  }
  const { spec, fields } = colorFieldsOf(editor, control, anchor);
  const before = colorForm(editor, control).data;
  for (const field of fields) {
    const was = atPath(before, [...field.dataPath, field.node.name]);
    const value = atPath(incoming, [...field.dataPath, field.node.name]);
    if (Value.deepEqual(was, value)) continue;
    if (field.id === spec.mode) {
      const source = spec.sources.find(
        ({ write }) => write !== 'reset' && write[spec.mode!] === value,
      );
      if (source !== undefined) choose(`[data-color-row="${source.source}"]`, String(value));
      else if (spec.custom[spec.mode] === value) choose('[data-color-row="custom"]', 'Custom');
      else outOfStep(`The color control for '${anchor}' offers no ${String(value)}`);
      continue;
    }
    const token = Colors.SWATCH_TOKENS.find((each) => Colors.swatchValue(each) === value);
    if (value === undefined || value === '') {
      choose('[data-color-row="default"]', 'Default');
    } else if (token !== undefined) {
      choose(`[data-swatch="${token}"]`, `the ${token} swatch`);
    } else {
      choose('[data-color-row="custom"]', 'Custom');
      const text = control.querySelector<FormElement>('.color-text-field ha-form');
      if (!text) outOfStep(`The color control for '${anchor}' draws no Custom text field`);
      text.dispatchEvent(
        new CustomEvent('value-changed', {
          detail: { value: withValue(text.data, field.dataPath, field.node.name, value) },
          bubbles: true,
          composed: true,
        }),
      );
      draw();
    }
  }
}

/** The control each composed control's stand-in form stands for, by stand-in. */
const composedControls = new WeakMap<Element, Element>();

/** The stand-in form for each composed control, by the control's wrapper. */
const composedForms = new WeakMap<Element, FormElement>();

/**
 * The field a composed control is drawn for, and the data its owner's forms hold, as now.
 *
 * @param editor - Editor element
 * @param control - The control's wrapper, `[data-composed]`
 * @returns The field and the owner's data
 */
function composedFieldOf(
  editor: EditorElement,
  control: Element,
): { readonly field: IndexedField; readonly data: Record<string, unknown> } {
  const id = control.getAttribute('data-field')!;
  const ctx = stateOf(editor)._ctx;
  const entities = heldConfig(editor)?.entities ?? [];
  const key = keyOf(control.closest('.entry-page'));
  const entry = key === undefined ? undefined : entities[keysOf(editor, 'entry').indexOf(key)];
  if (key !== undefined && entry === undefined) outOfStep(`No entry is keyed ${key}`);
  const field = (
    entry === undefined
      ? buildFieldIndex(ctx).fields
      : entityFieldIndex(entrySchema(entry, ctx)).fields
  ).get(id);
  if (field === undefined) outOfStep(`'${id}' is drawn as a composed control but is not built`);
  const data =
    entry === undefined
      ? (editor as unknown as { _formData(): Record<string, unknown> })._formData()
      : Entities.toEntityFormData(entry, entities);
  return { field, data };
}

/**
 * A control the editor composes for one field, as a form standing for that field, as a color
 * control's stand-in does: its schema is the field's, its data the editor's own value for it, its
 * label and helper the field's. Four kinds are composed:
 *
 * - `chips`, a radio group of the editor's own (Start Date's radio chips, Calendar Filter's Off,
 *   Menu and Chips): a change is made by choosing the option;
 * - `toggle`, an event part's or a toolbar control's toggle chip: its value is the editor's own,
 *   and a change to on or off is made by pressing the chip where it shows the other; a chip a gate
 *   withholds is not composed, as its field is not built;
 * - `line`, the line Tapping an Event Opens It gives way to while another action is stored, which
 *   takes no change;
 * - `words`, a word list one term at a time: its value is the pattern the terms write, and a change
 *   to it is sent to its form as the terms that pattern reads as.
 *
 * @param editor - Editor element
 * @param control - The control's wrapper, `[data-composed]`
 * @returns The stand-in
 */
function composedForm(editor: EditorElement, control: Element): FormElement {
  const known = composedForms.get(control);
  if (known !== undefined) return known;
  const kind = control.getAttribute('data-composed');
  const id = control.getAttribute('data-field')!;
  const form = document.createElement('div') as unknown as FormElement;
  form.className = 'composed-form';
  // The word list's form as drawn now: a scope change draws it again.
  const wordsForm = (): FormElement | null =>
    kind === 'words' ? control.querySelector<FormElement>('ha-form') : null;
  if (kind === 'words' && wordsForm() === null) outOfStep(`The word list '${id}' draws no form`);
  Object.defineProperties(form, {
    schema: { get: () => composedFieldOf(editor, control).field.lifted },
    // What the control shows, read off it: the chip that is checked, the pattern the terms its
    // form holds write. Only the line shows no value of its own, so it reads the editor's.
    data: {
      get: () => {
        const { data, field } = composedFieldOf(editor, control);
        const name = field.node.name;
        if (kind === 'chips') {
          const checked = control.querySelector<HTMLInputElement>('input[type="radio"]:checked');
          return withValue({}, field.dataPath, name, checked?.value);
        }
        const drawn = wordsForm();
        if (drawn !== null) {
          const terms = drawn.data[name];
          return withValue(
            {},
            field.dataPath,
            name,
            Array.isArray(terms) ? WordLists.toPattern(terms.map(String)) : terms,
          );
        }
        return Routing.formDataFor(data, form.schema);
      },
    },
    // As the form it draws is handed it, or as a form of the field's would be (`element.ts` › `_feed`).
    hass: {
      get: () => {
        const words = wordsForm();
        if (words !== null) return words.hass;
        const hass = (editor as unknown as { hass?: Types.Hass }).hass;
        const language = stateOf(editor)._ctx.language;
        return HassKey.needsLiveHass(form.schema)
          ? withCardActionLabels(hass, language)
          : HassKey.steadyHass(hass, language);
      },
    },
    computeLabel: {
      value: () =>
        fieldLabel(composedFieldOf(editor, control).field, stateOf(editor)._ctx.language),
    },
    computeHelper: {
      value: () => {
        // A toggle chip shows its YAML option name, while that preference is on, as its title.
        const yaml = kind === 'toggle' ? control.getAttribute('title') : null;
        if (yaml) return yaml;
        const words = wordsForm();
        return words !== null
          ? words.computeHelper?.(words.schema[0])
          : fieldHelper(composedFieldOf(editor, control).field, stateOf(editor)._ctx);
      },
    },
  });
  form.closest = ((selector: string) => control.closest(selector)) as typeof form.closest;
  form.dispatchEvent = (event: Event): boolean => {
    const { field } = composedFieldOf(editor, control);
    const value = atPath((event as CustomEvent).detail?.value ?? {}, [
      ...field.dataPath,
      field.node.name,
    ]);
    if (kind === 'chips') {
      const input = control.querySelector<HTMLInputElement>(
        `input[type="radio"][value="${String(value)}"]`,
      );
      if (!input) outOfStep(`'${id}' offers no ${String(value)}`);
      input.checked = true;
      return input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (kind === 'toggle') {
      if (typeof value !== 'boolean') {
        outOfStep(`'${id}' is a toggle chip: it is pressed or not, so ask it for true or false`);
      }
      const chip = control as HTMLButtonElement;
      if ((chip.getAttribute('aria-pressed') === 'true') !== value) chip.click();
      return true;
    }
    const words = wordsForm();
    if (kind === 'words' && words !== null) {
      const terms = WordLists.fromPattern(typeof value === 'string' ? value : '');
      if (terms === undefined) {
        outOfStep(`'${id}' is drawn as words, which cannot hold ${String(value)}: Use a Pattern`);
      }
      return words.dispatchEvent(
        new CustomEvent('value-changed', {
          detail: { value: { [field.node.name]: [...terms] } },
          bubbles: true,
          composed: true,
        }),
      );
    }
    return outOfStep(`'${id}' is drawn as a line, which takes no change`);
  };
  composedControls.set(form, control);
  composedForms.set(control, form);
  return form;
}

/** What `openPanels` kept from every page it visited, and what the editor held then. */
interface Kept {
  forms: Drawn[];
  stamp: ReadonlyArray<unknown>;
}

/** What `openPanels` kept, by editor. */
const visited = new WeakMap<EditorElement, Kept>();

/**
 * What a page's forms are drawn from: once any of it moves, kept forms are out of date.
 *
 * @param editor - Editor element
 * @returns The editor's state, by identity
 */
function stampOf(editor: EditorElement): unknown[] {
  const state = editor as unknown as Record<string, unknown>;
  return [
    '_config',
    '_pending',
    '_filter',
    '_workspace',
    '_rawConfig',
    'hass',
    '_added',
    '_prefs',
  ].map((member) => state[member]);
}

/**
 * The forms kept from the pages `openPanels` visited, drawn again first where the editor has
 * moved since: each page, then each entry's page, is drawn in turn, at once, with every panel on
 * it open, and the place open drawn back. Rendered synchronously (Lit's `performUpdate`), so a synchronous helper reads
 * forms as the editor would draw them now, and a kept form still writes through its own listener.
 *
 * @param editor - Editor element
 * @returns The kept forms
 */
function keptForms(editor: EditorElement): Drawn[] {
  const kept = visited.get(editor);
  if (kept === undefined) return [];
  const stamp = stampOf(editor);
  if (stamp.every((value, at) => value === kept.stamp[at])) return kept.forms;

  const element = editor as unknown as {
    _nav: unknown;
    _prefs: { readonly every: boolean };
    requestUpdate(): void;
    performUpdate(): void;
  };
  const root = editor.shadowRoot!;
  const draw = (): void => {
    element.requestUpdate();
    element.performUpdate();
  };
  const saved = element._nav;
  const prefs = element._prefs;
  // Every setting that applies, as Show Every Setting draws it: a change since the visit can
  // bring settings a page names in its Add rows, and `openPanels` added what it found.
  element._prefs = { ...prefs, every: true };
  const forms: Drawn[] = [];
  // The pages the overview offers now: the Grid page only while Grid is the scope.
  const scope = (editor as unknown as { _workspace: string })._workspace;
  const pages = PAGES.filter((page) => page.onlyIn === undefined || page.onlyIn === scope);
  for (const { id: page } of pages) {
    element._nav = { route: { kind: 'page', page }, trail: [], fromResults: false };
    draw();
    if (root.querySelector(`.page[data-page="${page}"]`) === null) continue;
    // Every toolbar button's row open, as a user opens each one.
    const rows = element as unknown as { _openButtons: Set<number> };
    const open = rows._openButtons;
    rows._openButtons = new Set(keysOf(editor, 'button'));
    draw();
    forms.push(...liveForms(editor, root, page));
    rows._openButtons = open;
  }
  for (const key of keysOf(editor, 'entry')) {
    element._nav = { route: { kind: 'entry', key }, trail: [], fromResults: false };
    draw();
    if (root.querySelector(`.entry-page[data-entry-key="${key}"]`) === null) continue;
    forms.push(...liveForms(editor, root, `entry:${key}`));
  }
  element._nav = saved;
  element._prefs = prefs;
  draw();
  kept.forms = forms;
  kept.stamp = stampOf(editor);
  return forms;
}

/**
 * The page open, read from what the editor draws.
 *
 * @param editor - Editor element
 * @returns Its id, or undefined on the overview
 */
function openPage(editor: EditorElement): string | undefined {
  return editor.shadowRoot?.querySelector('.page')?.getAttribute('data-page') ?? undefined;
}

/**
 * Clicks a control of the editor's own and waits for the render it asks for.
 *
 * @param editor - Editor element
 * @param selector - The control
 * @param what - What it is, for a failure
 */
async function press(editor: EditorElement, selector: string, what: string): Promise<void> {
  const control = editor.shadowRoot?.querySelector<HTMLElement>(selector);
  if (!control) outOfStep(`The editor draws no ${what}`);
  control.click();
  await editor.updateComplete;
}

/**
 * Goes back to the overview, as a user would: Back until no page is open.
 *
 * @param editor - Editor element
 */
export async function goOverview(editor: EditorElement): Promise<void> {
  for (let guard = 0; openPage(editor) !== undefined && guard < 4; guard++) {
    await press(editor, '[data-focus="back-top"]', 'Back');
  }
}

/**
 * Opens a section page from the overview's row for it, unless it is open.
 *
 * @param editor - Editor element
 * @param page - The page's id
 */
export async function goPage(editor: EditorElement, page: string): Promise<void> {
  if (openPage(editor) === page) return;
  await goOverview(editor);
  await press(editor, `[data-focus="nav:${page}"]`, `row for the ${page} page`);
}

/**
 * Opens a calendar entry's page from the entry's row on the overview, unless it is open.
 *
 * @param editor - Editor element
 * @param key - The entry's key
 */
export async function goEntry(editor: EditorElement, key: number): Promise<void> {
  if (openPage(editor) === `entry:${key}`) return;
  await goOverview(editor);
  await press(editor, `[data-focus="row:${key}"]`, `row for the entry keyed ${key}`);
}

/**
 * The keys of the entries an owner names: one for an entry named by place or key, every entry's
 * for an entry named by neither.
 *
 * @param editor - Editor element
 * @param owner - An entry
 * @returns The keys
 */
function entryKeysFor(editor: EditorElement, owner: Owner): number[] {
  if (owner.kind !== 'entry') return [];
  checkOwner(editor, owner);
  const keys = keysOf(editor, 'entry');
  if (owner.key !== undefined) return [owner.key];
  return owner.index === undefined ? keys : [keys[owner.index]];
}

/**
 * The page a card field is placed on, or the overview; for a block id, the page of the first
 * field inside it.
 *
 * @param id - Field id
 * @returns The page's id, `overview`, or undefined for an id the registry does not place
 */
function pageOf(id: FieldId): string | undefined {
  const placed = placementOf(id)?.page;
  if (placed !== undefined) return placed;
  for (const page of PAGES) {
    for (const heading of page.headings) {
      if (heading.fields.some(([field]) => field.startsWith(`${id}.`))) return page.id;
    }
  }
  return undefined;
}

/**
 * Whether a node can be addressed by id: a field, a block nesting its fields' data, or a
 * heading.
 *
 * @param node - Schema node
 * @returns True when it has an id of its own
 */
function addressable(node: HaFormSchema): boolean {
  if (node.name === '') return false;
  if ('selector' in node) return true;
  if ('schema' in node) return (node as { flatten?: boolean }).flatten !== true;
  return 'type' in node && node.type === 'constant';
}

/**
 * The node a form draws under an id.
 *
 * @param form - The form
 * @param scope - The scope of the form's ids
 * @param id - Field id
 * @returns The node, or undefined where the form draws none
 */
function visitOf(form: FormElement, scope: string, id: FieldId): Visit | undefined {
  for (const visit of walkSchema(form.schema ?? [])) {
    if (addressable(visit.node) && fieldId(scope, visit.dataPath, visit.node.name) === id) {
      return visit;
    }
  }
  return undefined;
}

let known: ReadonlySet<FieldId> | undefined;

/**
 * Every id a form can draw: the fields the gate corpus opens in any workspace
 * (`field-index.ts` › `universeIndex`), the toolbar buttons' fields (`buttonFieldIndex`), the
 * nodes the chassis and the buttons' sub-form declare, and every block those sit in.
 *
 * @returns The ids
 */
function knownIds(): ReadonlySet<FieldId> {
  if (known !== undefined) return known;

  const ids = new Set<FieldId>();
  for (const workspace of WORKSPACES) {
    for (const id of universeIndex('en', workspace).fields.keys()) ids.add(id);
  }
  for (const id of buttonFieldIndex(buildToolbarButtonSchema()).fields.keys()) ids.add(id);

  const chassis = chassisSchemas('en');
  const ctx: SchemaCtx = { view: 'list', config: Config.DEFAULT_CONFIG, language: 'en' };
  const declared: ReadonlyArray<readonly [string, ReadonlyArray<HaFormSchema>]> = [
    ['display', chassis.displayView],
    ['workspace', chassis.workspace],
    ['filter', chassis.filter],
    ['quick_setup', QUICK_SETUP_CALENDARS_SCHEMA],
    ['quick_setup', QUICK_SETUP_WEATHER_SCHEMA],
    ['quick_setup', QUICK_SETUP_TAPS_SCHEMA],
    ['add_calendar', chassis.addCalendar],
    ['entry_calendar', chassis.entryCalendar],
    ...cardSubforms(ctx)
      .filter((subform) => subform.path.join('.') === TOOLBAR_BUTTON_PATH.join('.'))
      .map((subform) => ['button', subform.schema] as const),
  ];
  for (const [scope, schema] of declared) {
    for (const { node, dataPath } of walkSchema(schema)) {
      if (addressable(node)) ids.add(fieldId(scope, dataPath, node.name));
    }
  }

  for (const id of [...ids]) {
    const { scope, dataPath } = parseFieldId(id);
    dataPath.forEach((name, depth) => ids.add(fieldId(scope, dataPath.slice(0, depth), name)));
  }

  known = ids;
  return ids;
}

/**
 * The owner an id's scope implies when a test names none: the card for a panel's field, the
 * chassis for a chassis form's, and any entry or button for a calendar's or a button's field,
 * which must then be drawn by exactly one.
 *
 * @param scope - The id's scope
 * @returns The owner
 */
function impliedOwner(scope: string): Owner {
  if (scope === 'calendar') return { kind: 'entry' };
  if (scope === 'button') return { kind: 'button' };
  return CHASSIS_SCOPES.has(scope) ? CHASSIS : CARD;
}

/**
 * Names an owner for a message.
 *
 * @param kind - Owner kind
 * @param index - Its position, where it has one
 * @param key - Its key, where it is named by one
 * @returns The name
 */
function ownerName(kind: Owner['kind'], index?: number, key?: number): string {
  if (kind === 'card' || kind === 'chassis') return `the ${kind}`;
  if (key !== undefined) return `the ${kind} keyed ${key}`;
  return index === undefined ? `any ${kind}` : `${kind} ${index}`;
}

/**
 * How a test names an owner of a kind, for a message.
 *
 * @param kind - Owner kind
 * @returns The expression to pass
 */
function ownerHint(kind: Owner['kind']): string {
  if (kind === 'card') return 'CARD';
  if (kind === 'chassis') return 'CHASSIS';
  return `${kind}(index)`;
}

/**
 * Joins names for a message.
 *
 * @param names - Names
 * @returns `a`, `a and b`, or `a, b and c`
 */
function listed(names: ReadonlyArray<string>): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Whether a form belongs to an owner.
 *
 * @param drawn - A drawn form
 * @param owner - The owner asked for
 * @returns True when it does
 */
function belongsTo(drawn: Drawn, owner: Owner): boolean {
  if (drawn.kind !== owner.kind) return false;
  if (owner.kind !== 'entry' && owner.kind !== 'button') return true;
  if (owner.key !== undefined) return drawn.key === owner.key;
  return owner.index === undefined || drawn.index === owner.index;
}

/**
 * Fails on an entry or a button the configuration does not hold, so a mistyped position or key
 * is not read as one drawing nothing.
 *
 * @param editor - Editor element
 * @param owner - The owner asked for
 */
function checkOwner(editor: EditorElement, owner: Owner): void {
  if (owner.kind !== 'entry' && owner.kind !== 'button') return;
  if (owner.key !== undefined) {
    const keys = keysOf(editor, owner.kind);
    if (!keys.includes(owner.key)) {
      throw new Error(`No ${owner.kind} is keyed ${owner.key}: the keys are ${keys.join(', ')}.`);
    }
    return;
  }
  if (owner.index === undefined) return;
  const config = heldConfig(editor);
  const count =
    owner.kind === 'entry'
      ? (config?.entities ?? []).length
      : config === undefined
        ? 0
        : Buttons.writtenButtons(config).length;
  if (!Number.isInteger(owner.index) || owner.index < 0 || owner.index >= count) {
    throw new Error(`There is no ${owner.kind} ${owner.index}: the card holds ${count}.`);
  }
}

/** How many characters apart a known id may be from an unknown one to be offered instead. */
const MISTYPED = 2;

/**
 * Levenshtein distance, for offering the id a mistyped one was probably meant to be.
 *
 * @param a - One text
 * @param b - The other
 * @returns Insertions, deletions and substitutions between them
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
      current.push(Math.min(previous[column] + 1, current[column - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Finds the form an owner draws an id in.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The form and the node, or undefined where the owner draws no such field
 */
function find(editor: EditorElement, id: FieldId, owner: Owner | undefined): Found | undefined {
  const { scope, name } = parseFieldId(id);
  const holders = drawnForms(editor).flatMap((drawn): Found[] => {
    if (drawn.scope !== scope) return [];
    const visit = visitOf(drawn.form, drawn.scope, id);
    return visit === undefined ? [] : [{ ...drawn, visit }];
  });

  if (holders.length === 0 && !knownIds().has(id)) {
    const alike = [...knownIds()].filter(
      (candidate) =>
        parseFieldId(candidate).name === name || editDistance(candidate, id) <= MISTYPED,
    );
    throw new Error(
      `Unknown field id '${id}': no form draws it and no builder offers it.` +
        (alike.length > 0 ? ` Did you mean ${listed(alike.map((near) => `'${near}'`))}?` : ''),
    );
  }

  const wanted = owner ?? impliedOwner(scope);
  checkOwner(editor, wanted);
  const mine = holders.filter((drawn) => belongsTo(drawn, wanted));

  if (mine.length === 0) {
    const elsewhere = holders.filter((drawn) => drawn.kind !== wanted.kind);
    if (elsewhere.length > 0) {
      const names = [...new Set(elsewhere.map((drawn) => ownerName(drawn.kind, drawn.index)))];
      throw new Error(
        `'${id}' is drawn by ${listed(names)}, not by ${ownerName(wanted.kind)}: ` +
          `pass ${ownerHint(elsewhere[0].kind)}.`,
      );
    }
    return undefined;
  }

  // A block that nests several fields' data is drawn by each of their forms, one field apiece.
  if (mine.length > 1 && mine.every((drawn) => !('selector' in drawn.visit.node))) {
    return { ...mine[0], all: mine };
  }

  if (mine.length > 1) {
    const names = [...new Set(mine.map((drawn) => ownerName(drawn.kind, drawn.index)))];
    if (names.length > 1) {
      throw new Error(
        `'${id}' is drawn by ${listed(names)}: name the one meant, as ${ownerHint(wanted.kind)}.`,
      );
    }
    const forms = mine.map((drawn) => `form ${drawn.place} (ha-form.${drawn.form.className})`);
    throw new Error(
      `'${id}' is drawn twice by ${names[0]}, in ${listed(forms)}: one owner's field ` +
        'belongs in one form.',
    );
  }

  return mine[0];
}

/**
 * Finds the form an owner draws an id in, failing where it draws none.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The form and the node
 */
function located(editor: EditorElement, id: FieldId, owner: Owner | undefined): Found {
  const found = find(editor, id, owner);
  if (found === undefined) {
    const wanted = owner ?? impliedOwner(parseFieldId(id).scope);
    const who =
      wanted.kind === 'entry' || wanted.kind === 'button'
        ? ownerName(wanted.kind, wanted.index, wanted.key)
        : ownerName(wanted.kind);
    throw new Error(`'${id}' is not drawn: ${who} draws no form holding it.`);
  }
  return found;
}

/**
 * The value at a data path.
 *
 * @param data - Form data
 * @param path - Keys, outermost first
 * @returns The value, or undefined where a step is missing
 */
function atPath(data: unknown, path: ReadonlyArray<string>): unknown {
  let value = data;
  for (const key of path) value = Helpers.isConfigBlock(value) ? value[key] : undefined;
  return value;
}

/**
 * A copy of form data with one value replaced at a data path, the blocks above it copied and
 * every other value kept, as `ha-form` builds what it emits.
 *
 * @param data - Form data
 * @param path - Enclosing data keys
 * @param name - Field name
 * @param value - New value
 * @returns The new data
 */
function withValue(
  data: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return { ...data, [name]: value };
  const [head, ...rest] = path;
  const inner = Helpers.isConfigBlock(data[head]) ? data[head] : {};
  return { ...data, [head]: withValue(inner, rest, name, value) };
}

/**
 * The form an owner draws a field in.
 *
 * Fails on an id no form draws and no builder offers, naming it; on an id two owners draw when
 * the test named neither, naming both; on one owner drawing it in two forms, naming both
 * forms; and on an id drawn only by another kind of owner.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The form, or undefined where the owner does not draw the field
 */
export function formOf(editor: EditorElement, id: FieldId, owner?: Owner): FormElement | undefined {
  return find(editor, id, owner)?.form;
}

/**
 * Every form an owner draws, in document order; every form the editor draws when no owner is
 * named.
 *
 * @param editor - Editor element
 * @param owner - Owner, or undefined for all
 * @returns The forms
 */
export function formsOf(editor: EditorElement, owner?: Owner): FormElement[] {
  if (owner !== undefined) checkOwner(editor, owner);
  return drawnForms(editor)
    .filter((drawn) => owner === undefined || belongsTo(drawn, owner))
    .map((drawn) => drawn.form);
}

/**
 * A field's label, as its form resolves it for Home Assistant: through the form's own
 * `computeLabel`, given the data at the field's level and, inside a collapsible, the path
 * `ha-form-expandable` adds.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The label
 */
export function labelOf(editor: EditorElement, id: FieldId, owner?: Owner): string {
  const { form, visit } = located(editor, id, owner);
  if (form.computeLabel === undefined) throw new Error(`The form drawing '${id}' labels nothing.`);
  const data = atPath(form.data, visit.dataPath);
  return visit.path.length > 0
    ? form.computeLabel(visit.node, data, { path: [...visit.path] })
    : form.computeLabel(visit.node, data);
}

/**
 * A field's helper text, as its form resolves it for Home Assistant: through the form's own
 * `computeHelper`, with the path `ha-form-expandable` adds inside a collapsible.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The text, or undefined where the field has none
 */
export function helperOf(editor: EditorElement, id: FieldId, owner?: Owner): string | undefined {
  const { form, visit } = located(editor, id, owner);
  if (form.computeHelper === undefined) return undefined;
  return visit.path.length > 0
    ? form.computeHelper(visit.node, { path: [...visit.path] })
    : form.computeHelper(visit.node);
}

/**
 * The value a field's form shows for it; for a block, the object the form holds for it.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 * @returns The value
 */
export function valueOf(editor: EditorElement, id: FieldId, owner?: Owner): unknown {
  if (id in RADIO_GROUPS) return chosen(editor, id);
  const found = located(editor, id, owner);
  if (found.all !== undefined) {
    // Each field's form holds only its own part of the block, so the parts are merged deeply.
    return found.all.reduce<unknown>(
      (merged, { form, visit }) =>
        mergeDeep(merged, atPath(form.data, [...visit.dataPath, visit.node.name])),
      {},
    );
  }
  const { form, visit } = found;
  return atPath(form.data, [...visit.dataPath, visit.node.name]);
}

/**
 * Emits `value-changed` from a form, as `ha-form` does: its whole data with the given fields
 * replaced at their data paths, bubbling and composed. Synchronous, and the form need not be
 * drawn any longer, so it can stand for a form captured before a render replaced it, whose
 * event arrives late. Each id must be one the form draws, scope and all: the form keeps the
 * scope a helper placed it with, drawn or not. With no fields, the form emits its data
 * unchanged.
 *
 * @param form - The form, as `formOf` found it
 * @param values - New values, by field id
 */
export function emitChange(form: FormElement, values: Readonly<Record<FieldId, unknown>>): void {
  const scope = formScopes.get(form);
  let value = form.data;
  for (const [id, next] of Object.entries(values)) {
    if (scope === undefined) {
      throw new Error(`No helper has found this form, so it cannot change '${id}': use formOf.`);
    }
    const visit = visitOf(form, scope, id);
    if (visit === undefined) {
      throw new Error(
        `The form does not draw '${id}', so it cannot change it: its ids are ${scope}:….`,
      );
    }
    value = withValue(value, visit.dataPath, visit.node.name, next);
  }
  form.dispatchEvent(
    new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }),
  );
}

/**
 * Changes one field as a user would: its form emits `value-changed` with its whole data and
 * the new value, then the editor's update is awaited.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param value - New value
 * @param owner - Owner, else the one the id's scope implies
 */
export async function changeField(
  editor: EditorElement,
  id: FieldId,
  value: unknown,
  owner?: Owner,
): Promise<void> {
  await changeFields(editor, { [id]: value }, owner);
}

/**
 * Changes several fields of one form in a single `value-changed`, as a test means a form to
 * have reported them together, then awaits the editor's update. A field not drawn where the editor
 * is, or kept from a page `openPanels` visited, is first gone to, as a user would (`openPageOf`).
 * Card Displays and Settings For are chosen as a user chooses them.
 *
 * @param editor - Editor element
 * @param values - New values, by field id, every one drawn by the same form
 * @param owner - Owner, else the one each id's scope implies
 */
export async function changeFields(
  editor: EditorElement,
  values: Readonly<Record<FieldId, unknown>>,
  owner?: Owner,
): Promise<void> {
  const ids = Object.keys(values);
  if (ids.length === 0) throw new Error('changeFields needs a field to change.');
  const radio = ids.find((id) => id in RADIO_GROUPS);
  if (radio !== undefined) {
    if (ids.length > 1) throw new Error(`${radio} is a radio group: change it on its own.`);
    await choose(editor, radio, values[radio]);
  } else {
    for (const id of ids) {
      const found = find(editor, id, owner);
      if (found === undefined || found.page !== undefined) await openPageOf(editor, id, owner);
    }
    const forms = ids.map((id) => located(editor, id, owner).form);
    if (forms.some((form) => form !== forms[0])) {
      throw new Error(`${listed(ids)} are drawn by different forms: change each on its own.`);
    }
    emitChange(forms[0], values);
    await editor.updateComplete;
  }
}

/**
 * The option a radio group of the editor's own has chosen. Settings For drawn as its compact line
 * names the scope the editor follows.
 *
 * @param editor - Editor element
 * @param id - `display:view` or `workspace:editing_workspace`
 * @returns The chosen option's value
 */
function chosen(editor: EditorElement, id: FieldId): unknown {
  const input = editor.shadowRoot?.querySelector<HTMLInputElement>(
    `input[name="${RADIO_GROUPS[id]}"]:checked`,
  );
  if (input) return input.value;
  if (id === 'workspace:editing_workspace') {
    return (editor as unknown as { _workspace: string })._workspace;
  }
  return outOfStep(`The editor draws no ${id} to read`);
}

/**
 * Two values merged as `ha-form` data nests them: plain objects key by key, at every depth;
 * anything else, the second.
 *
 * @param a - The first value
 * @param b - The second value
 * @returns The merged value
 */
function mergeDeep(a: unknown, b: unknown): unknown {
  const plain = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!plain(a) || !plain(b)) return b === undefined ? a : b;
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) merged[key] = mergeDeep(a[key], value);
  return merged;
}

/**
 * Chooses an option of a radio group of the editor's own, as a user does: where the open place
 * draws it, else on the overview; after Change where Settings For is its compact line.
 *
 * @param editor - Editor element
 * @param id - `display:view` or `workspace:editing_workspace`
 * @param value - The option
 */
async function choose(editor: EditorElement, id: FieldId, value: unknown): Promise<void> {
  const name = RADIO_GROUPS[id];
  const root = editor.shadowRoot;
  const drawn = (): boolean =>
    root?.querySelector(`input[name="${name}"]`) !== null ||
    (name === 'scope' && root?.querySelector('[data-focus="scope-change"]') !== null);
  // Settings For sits on every page the scope matters to as well; Card Displays only here.
  if (!drawn()) await goOverview(editor);
  if (name === 'scope' && root?.querySelector('input[name="scope"]') === null) {
    await press(editor, '[data-focus="scope-change"]', 'Change for Settings For');
  }
  const input = root?.querySelector<HTMLInputElement>(
    `input[name="${name}"][value="${String(value)}"]`,
  );
  if (!input) outOfStep(`The editor offers no ${String(value)} for ${id}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await editor.updateComplete;
}

/**
 * Goes to a field as a user would before editing it: to the page it is placed on, or the
 * overview, from the overview's row for that page; a calendar entry's page from its row, a
 * toolbar button's row on Card & Header, opened by its toggle. A closed row draws no form, so a
 * button's field not drawn yet is found by its own row, by its place or key. An entry named by neither place nor key is looked for on every entry's page, as
 * `openPanels` visits them, so a field two entries draw fails as drawn twice.
 *
 * Where a query holds the overview's results, the field is reached as a user reaches it there:
 * through its result row, which opens it where it is drawn.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 */
export async function openPageOf(editor: EditorElement, id: FieldId, owner?: Owner): Promise<void> {
  let found = find(editor, id, owner);
  if (found === undefined || found.page !== undefined) {
    const { scope } = parseFieldId(id);
    const wanted = owner ?? impliedOwner(scope);
    const page = wanted.kind === 'card' ? pageOf(id) : undefined;
    const row = resultRows(editor).find(
      (each) =>
        each.id === id &&
        (wanted.kind === 'card' ||
          wanted.kind === 'chassis' ||
          each.ownerKey === ownerKey(editor, wanted)),
    );
    if (row !== undefined) await chooseResult(editor, row.key);
    else if (wanted.kind === 'button') await goPage(editor, 'card_header');
    else if (wanted.kind === 'entry') {
      const keys = entryKeysFor(editor, wanted);
      if (keys.length !== 1) await keepEntries(editor);
      else if (openPage(editor) !== `entry:${keys[0]}`) {
        await goOverview(editor);
        // A filter can leave the entry's row out, and with it every form of the entry.
        const listed = editor.shadowRoot?.querySelector(`[data-focus="row:${keys[0]}"]`);
        if (listed) await goEntry(editor, keys[0]);
      }
    } else if (page === undefined || page === 'overview' || page === 'entry')
      await goOverview(editor);
    else {
      await goOverview(editor);
      await goPage(editor, page);
    }
    const holders = holdersOf(editor, wanted);
    for (const panel of holders) await openAround(panel);
    await editor.updateComplete;
    found = find(editor, id, owner);
    // A setting that applies but is not shown waits in its heading's Add row: add it there.
    if (found === undefined && (await addFromRow(editor, id))) found = find(editor, id, owner);
  }
  if (found === undefined) found = located(editor, id, owner);

  await openAround(found.form);
  await editor.updateComplete;
}

/**
 * The key of the entry or button an owner names, or of the first, where it names none.
 *
 * @param editor - Editor element
 * @param owner - An entry or a button
 * @returns Its key
 */
function ownerKey(editor: EditorElement, owner: Owner): number | undefined {
  if (owner.kind !== 'entry' && owner.kind !== 'button') return undefined;
  if (owner.key !== undefined) return owner.key;
  const keys = keysOf(editor, owner.kind);
  return owner.index === undefined ? undefined : keys[owner.index];
}

/** One row of the jump list, as the editor draws it. */
export interface ResultRowRead {
  /** Its `data-focus` key. */
  readonly key: string;
  readonly id: FieldId;
  /** The key of the calendar entry or toolbar button it belongs to. */
  readonly ownerKey?: number;
  readonly label: string;
  /** The parts of the label marked as matching. */
  readonly marked: ReadonlyArray<string>;
  /** "Events › Time". */
  readonly crumbs: string;
  /** "On · YAML: show_time". */
  readonly meta: string;
}

/**
 * The jump list's rows, in order; none where the overview is not showing results.
 *
 * @param editor - Editor element
 * @returns The rows
 */
export function resultRows(editor: EditorElement): ResultRowRead[] {
  const rows = editor.shadowRoot?.querySelectorAll('[data-focus^="result:"]') ?? [];
  return [...rows].map((row) => {
    const key = row.getAttribute('data-focus')!;
    const [, id, owner] = /^result:([^:]+:[^:]+)(?::(\d+))?$/.exec(key)!;
    const [label, crumbs, meta] = [...row.querySelectorAll('.nav-text > span')].map(
      (span) => span.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
    return {
      key,
      id,
      ownerKey: owner === undefined ? undefined : Number(owner),
      label,
      marked: [...row.querySelectorAll('mark')].map((mark) => mark.textContent ?? ''),
      crumbs,
      meta,
    };
  });
}

/**
 * Types a query into the overview's search field, as a user does, from wherever the editor is.
 *
 * @param editor - Editor element
 * @param query - The query
 */
export async function searchFor(editor: EditorElement, query: string): Promise<void> {
  await changeField(editor, 'filter:search', query);
}

/**
 * Chooses a result row, as a user taps it, and waits for the move to settle.
 *
 * @param editor - Editor element
 * @param key - The row's `data-focus` key
 */
export async function chooseResult(editor: EditorElement, key: string): Promise<void> {
  await press(editor, `[data-focus="${CSS.escape(key)}"]`, `result row ${key}`);
  await editor.updateComplete;
}

/**
 * Opens every toolbar button's row the place open draws, as a user does, by its toggle.
 *
 * @param editor - Editor element
 */
async function expandAll(editor: EditorElement): Promise<void> {
  for (const toggle of editor.shadowRoot?.querySelectorAll<HTMLElement>(
    '.button-row [aria-expanded="false"]',
  ) ?? []) {
    toggle.click();
  }
  await editor.updateComplete;
}

/**
 * Visits every page the overview offers a row for, opening every panel on each, keeps the forms
 * each draws for the helpers to read, and comes back to the overview with its own panels open. A
 * test about every form the editor draws visits them first. Kept forms hold what their page drew
 * when it was last visited; `changeFields` visits again after every change.
 *
 * @param editor - Editor element
 */
export async function openPanels(editor: EditorElement): Promise<void> {
  const root = editor.shadowRoot;
  if (root === null) throw new Error('The editor has not rendered: mount it, and await it.');
  // A macrotask first: the nodes earlier renders let go of are held until the job they were
  // reached in ends (`WeakRef` targets are kept for the job), and a long run of awaits that are
  // all microtasks is one job, which visiting every page would otherwise grow without bound.
  await nextRender();
  await goOverview(editor);
  const restore = await showEverySetting(editor);
  const kept: Drawn[] = [];
  const pages = [...root.querySelectorAll('[data-focus^="nav:"]')].map((row) =>
    row.getAttribute('data-focus')!.slice('nav:'.length),
  );
  for (const page of pages) {
    await goPage(editor, page);
    await expandAll(editor);
    kept.push(...liveForms(editor, root, page));
  }
  for (const key of keysOf(editor, 'entry')) {
    await goOverview(editor);
    // A search or Filter Calendars can leave an entry's row out, and its page with it.
    if (root.querySelector(`[data-focus="row:${key}"]`) === null) continue;
    await goEntry(editor, key);
    kept.push(...liveForms(editor, root, `entry:${key}`));
  }
  await goOverview(editor);
  await restore();
  await expandAll(editor);
  visited.set(editor, { forms: kept, stamp: stampOf(editor) });
}

/**
 * Visits every entry's page the overview offers a row for, keeping the forms each draws, and
 * comes back to the overview, as `openPanels` does for the entries alone.
 *
 * @param editor - Editor element
 */
async function keepEntries(editor: EditorElement): Promise<void> {
  const root = editor.shadowRoot!;
  await goOverview(editor);
  // The pages' forms `openPanels` kept stay, while what they were drawn from has not moved.
  const before = visited.get(editor);
  const stamp = stampOf(editor);
  const current = before !== undefined && stamp.every((value, at) => value === before.stamp[at]);
  const kept: Drawn[] = current
    ? before.forms.filter((drawn) => !drawn.page?.startsWith('entry:'))
    : [];
  const restore = await showEverySetting(editor);
  for (const key of keysOf(editor, 'entry')) {
    await goOverview(editor);
    if (root.querySelector(`[data-focus="row:${key}"]`) === null) continue;
    await goEntry(editor, key);
    kept.push(...liveForms(editor, root, `entry:${key}`));
  }
  await goOverview(editor);
  await restore();
  visited.set(editor, { forms: kept, stamp: stampOf(editor) });
}

/**
 * Turns on Show Every Setting from the overview, as a user would, so every page draws every
 * setting that applies; a test reading every form visits them so. Its switch is pressed again
 * afterwards, so what the browser remembers is left as it was.
 *
 * @param editor - Editor element, on the overview
 * @returns Puts the preference back, from the overview
 */
async function showEverySetting(editor: EditorElement): Promise<() => Promise<void>> {
  const control = editor.shadowRoot?.querySelector<HTMLElement>('[data-focus="pref:every"]');
  if (
    control === null ||
    control === undefined ||
    control.getAttribute('aria-checked') === 'true'
  ) {
    return async () => undefined;
  }
  control.click();
  await editor.updateComplete;
  return async () => {
    await goOverview(editor);
    await press(editor, '[data-focus="pref:every"]', 'Show Every Setting');
  };
}

/**
 * Adds every setting the open page names in its Add rows, as a user would through each row's
 * Show All, or its one item. Adding writes nothing.
 *
 * @param editor - Editor element
 */
export async function addEverything(editor: EditorElement): Promise<void> {
  const root = editor.shadowRoot!;
  for (let guard = 0; guard < 80; guard++) {
    const toggle = root.querySelector<HTMLElement>('.add-toggle');
    if (toggle === null) return;
    if (toggle.getAttribute('aria-expanded') !== 'true') {
      toggle.click();
      await editor.updateComplete;
    }
    const item =
      root.querySelector<HTMLElement>('.add-row.open .add-all') ??
      root.querySelector<HTMLElement>('.add-row.open .add-item');
    if (item === null) return;
    item.click();
    await editor.updateComplete;
  }
}

/**
 * The family a setting is shown with, where it has one.
 *
 * @param id - Field id
 * @returns The family
 */
function familyOf(id: FieldId): string | undefined {
  for (const heading of [...PAGES.flatMap((page) => page.headings), ...ENTRY_GROUPS]) {
    for (const [field, appearance] of heading.fields) {
      if (field === id && typeof appearance === 'object' && 'family' in appearance) {
        return appearance.family;
      }
    }
  }
  return undefined;
}

/**
 * Adds one setting through the Add row that names it on the open page, as a user would: the
 * row opened, then its item, or its family's.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @returns Whether a row named it
 */
export async function addFromRow(editor: EditorElement, id: FieldId): Promise<boolean> {
  const root = editor.shadowRoot!;
  const family = familyOf(id);
  const keys = [...root.querySelectorAll<HTMLElement>('.add-toggle')].map(
    (toggle) => toggle.dataset.focus!,
  );
  for (const key of keys) {
    const toggle = root.querySelector<HTMLElement>(`.add-toggle[data-focus="${CSS.escape(key)}"]`);
    if (toggle === null) continue;
    if (toggle.getAttribute('aria-expanded') !== 'true') {
      toggle.click();
      await editor.updateComplete;
    }
    const item = root.querySelector<HTMLElement>(
      `[data-focus="${CSS.escape(`${key}:${family === undefined ? id : `family:${family}`}`)}"]`,
    );
    if (item !== null) {
      item.click();
      await editor.updateComplete;
      return true;
    }
  }
  return false;
}

/**
 * Every reset button the editor offers for the scope's own values, on whichever page holds the
 * field it resets: each page is visited, as `openPanels` does, and the editor comes back to the
 * overview. A button kept from a page no longer open still resets, as its listener stays its own.
 *
 * @param editor - Editor element
 * @returns The buttons, page by page
 */
export async function resetButtons(editor: EditorElement): Promise<HTMLButtonElement[]> {
  const root = editor.shadowRoot;
  if (root === null) throw new Error('The editor has not rendered: mount it, and await it.');
  const found = [...root.querySelectorAll<HTMLButtonElement>('[data-reset-keys]')];
  await goOverview(editor);
  const pages = [...root.querySelectorAll('[data-focus^="nav:"]')].map((row) =>
    row.getAttribute('data-focus')!.slice('nav:'.length),
  );
  for (const page of pages) {
    await goPage(editor, page);
    found.push(...root.querySelectorAll<HTMLButtonElement>('[data-reset-keys]'));
  }
  await goOverview(editor);
  return [...new Set(found)];
}

/**
 * The reset button for some options, on whichever page offers it (`resetButtons`).
 *
 * @param editor - Editor element
 * @param keys - The options it resets, space-separated as `data-reset-keys` names them
 * @returns The button, or null where no page offers it
 */
export async function resetButton(
  editor: EditorElement,
  keys: string,
): Promise<HTMLButtonElement | null> {
  return (await resetButtons(editor)).find((button) => button.dataset.resetKeys === keys) ?? null;
}

/**
 * The rows an owner's forms belong in, drawn or not: each matching toolbar button's own row,
 * found by its place or key. The card's fields and an entry's sit in no row.
 *
 * @param editor - Editor element
 * @param owner - The owner
 * @returns The rows
 */
function holdersOf(editor: EditorElement, owner: Owner): Element[] {
  const root = editor.shadowRoot;
  if (root === null || owner.kind !== 'button') return [];
  checkOwner(editor, owner);
  const places = buttonIndexes(editor, root);
  return [...places]
    .filter(([panel, index]) =>
      owner.key !== undefined
        ? keyOf(panel) === owner.key
        : owner.index === undefined || index === owner.index,
    )
    .map(([panel]) => panel);
}

/**
 * Opens the toolbar button's row around a node, the row itself included, by its toggle.
 *
 * @param node - A row, or anything inside one
 */
async function openAround(node: Element): Promise<void> {
  const row = node.closest('.button-row');
  const toggle = row?.querySelector<HTMLElement>(':scope > .cal-row [aria-expanded="false"]');
  if (!toggle) return;
  toggle.click();
  await (row!.getRootNode() as ShadowRoot & { host: EditorElement }).host.updateComplete;
}

/**
 * Waits as Home Assistant's `nextRender` does (`common/util/render-status.ts` in its frontend):
 * an animation frame, then a timeout. The frame is a Node immediate, which is how happy-dom
 * schedules one, and both come from `node:timers`, which fake timers leave in place whenever
 * they were installed, so a real render passes in a test that holds time still,
 * and no fake clock moves.
 *
 * @returns A promise settled once the render has passed
 */
function nextRender(): Promise<void> {
  return new Promise((resolve) => {
    nodeImmediate(() => {
      nodeTimeout(() => resolve(), 0);
    });
  });
}

/** What each editor `mountEditor` mounted has reported, oldest first. */
const reports = new WeakMap<EditorElement, Array<Record<string, unknown>>>();

/**
 * The configuration an editor last reported to Home Assistant, as `config-changed` carried it.
 *
 * @param editor - An editor `mountEditor` mounted
 * @returns The configuration, or undefined while it has reported none
 */
export function lastConfig(editor: EditorElement): Record<string, unknown> | undefined {
  const reported = reports.get(editor);
  if (reported === undefined) {
    throw new Error('lastConfig reads what an editor reported since mountEditor mounted it.');
  }
  return reported[reported.length - 1];
}

/**
 * The key the editor gives each calendar entry or each toolbar button, in list order: what
 * `entry({ key })` and `button({ key })` name an owner by.
 *
 * @param editor - Editor element
 * @param kind - Entries or buttons
 * @returns The keys, a copy
 */
export function keysOf(editor: EditorElement, kind: 'entry' | 'button'): number[] {
  const { _entryKeys: entries = [], _buttonKeys: buttons = [] } = stateOf(editor);
  return [...(kind === 'entry' ? entries : buttons)];
}

/** What `fakeHass` puts on the `hass` it builds. */
export interface FakeHassOptions {
  /** `hass.locale.language`, `en` unless given. */
  readonly language?: string;
  /** `hass.states`, empty unless given. */
  readonly states?: Readonly<Record<string, unknown>>;
  /** Any other member, as given: `localize`, `callApi`, the registries. */
  readonly [member: string]: unknown;
}

/**
 * A Home Assistant for the editor: states, a language, REST and service stubs, and a
 * connection that refuses the card's calendar subscription with `unknown_command`, as Home
 * Assistant before 2026.5 does, so a card drawn beside the editor falls back to REST at once
 * rather than waiting for a push that never comes (AGENTS.md). Any other subscription is
 * accepted and never pushes. A test about live updates passes a `connection` of its own.
 *
 * @param options - Members to set
 * @returns The `hass`
 */
export function fakeHass(options: FakeHassOptions = {}): Types.Hass {
  const { language = 'en', states = {}, ...members } = options;
  return {
    states,
    locale: { language },
    callApi: async () => [],
    callService: () => undefined,
    connection: {
      subscribeMessage: (_callback: unknown, message: { type?: string }) =>
        message?.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => undefined),
    },
    ...members,
  } as unknown as Types.Hass;
}

/** The element `mountEditor` mounts, an editor of its own so no test's tag is reused. */
const HOST_TAG = 'calendar-card-pro-editor-host';

/** How `mountEditor` mounts the editor. */
export interface MountOptions {
  /** The `hass` it is handed, `fakeHass()` unless given. */
  readonly hass?: unknown;
  /**
   * Show Every Setting, switched on from the overview as a user would, for a test about what
   * every page can draw rather than about what it shows by default. Not remembered after it.
   */
  readonly every?: boolean;
}

/**
 * Mounts the editor in Home Assistant's order: handed `hass`, given the configuration while
 * still detached, then attached and rendered (`loadConfigElement` and `_updateConfigElement` in
 * its `hui-element-editor`). Records what it reports from creation, for `lastConfig`.
 *
 * @param config - The configuration as stored, handed to `setConfig` as it is
 * @param options - Mounting options
 * @returns The rendered editor
 */
export async function mountEditor(
  config: unknown,
  options: MountOptions = {},
): Promise<MountedEditor> {
  if (!customElements.get(HOST_TAG)) {
    customElements.define(HOST_TAG, class extends CalendarCardProEditor {});
  }
  const editor = document.createElement(HOST_TAG) as MountedEditor;
  const reported: Array<Record<string, unknown>> = [];
  reports.set(editor, reported);
  editor.addEventListener('config-changed', (event) => {
    reported.push(
      structuredClone((event as CustomEvent<{ config: Record<string, unknown> }>).detail.config),
    );
  });
  editor.hass = (options.hass ?? fakeHass()) as Types.Hass;
  editor.setConfig(config);
  document.body.appendChild(editor);
  await editor.updateComplete;
  if (options.every === true) {
    await press(editor, '[data-focus="pref:every"]', 'Show Every Setting');
    // What the browser remembers stays as the test found it.
    localStorage.removeItem(PREFS_KEY);
  }
  return editor;
}
