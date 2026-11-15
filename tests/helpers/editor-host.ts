/**
 * The visual editor, mounted, read and driven by field id.
 *
 * A test names a field by its id, as `src/rendering/editor/field-index.ts` builds it:
 * `events:show_time`, `layout:time_grid.start_time`, `calendar:name`, `button:icon`. It names
 * an owner where the id repeats, because two calendars, two blocks of one calendar and two
 * toolbar buttons each draw the same ids. This module is the one place that knows how today's
 * editor draws its forms. The redesign changes that several times: closed panels stop mounting
 * their forms, entries and buttons gain stable keys, panels become pages. Each of those changes
 * this module and leaves the tests that go through it alone.
 *
 * Today every form is an `ha-form`, told apart by the class the editor gives it:
 *
 * | Class                             | Owner   | Scope                                          |
 * | --------------------------------- | ------- | ---------------------------------------------- |
 * | `panel-form`                      | card    | its panel's id, read from the panel's icon     |
 * | `buttons-heading`                 | card    | `button`: the caption above the buttons        |
 * | `entity-form`                     | entry   | `calendar`                                     |
 * | `button-form`                     | button  | `button`                                       |
 * | `display-view-form`               | chassis | `display` (Card Displays)                      |
 * | `workspace-form`                  | chassis | `workspace` (Editing Settings For)             |
 * | `filter-form`                     | chassis | `filter` (the search bar and its switches)     |
 * | `quick-setup-form`                | chassis | `quick_setup`                                  |
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
import { CalendarCardProEditor } from '../../src/rendering/editor/element';
import * as Entities from '../../src/rendering/editor/entities';
import {
  type FieldId,
  buttonFieldIndex,
  entrySchema,
  fieldId,
  parseFieldId,
  universeIndex,
} from '../../src/rendering/editor/field-index';
import * as Filter from '../../src/rendering/editor/filter';
import type { HaFormSchema } from '../../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx, walkSchema } from '../../src/rendering/editor/panels';
import { ENTITY_PATH } from '../../src/rendering/editor/schemas/calendars';
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
 * Who draws a form. An entry is a calendar block by its position in `entities`, and a button
 * by its position in `toolbar.buttons`; with no index, either means any of them.
 */
export type Owner =
  | { readonly kind: 'card' }
  | { readonly kind: 'chassis' }
  | { readonly kind: 'entry'; readonly index?: number }
  | { readonly kind: 'button'; readonly index?: number };

/** The card's own settings: the panels' forms and the toolbar buttons' caption. */
export const CARD: Owner = { kind: 'card' };

/** The forms above the panels, belonging to none of them. */
export const CHASSIS: Owner = { kind: 'chassis' };

/**
 * A calendar block, by its position in the configuration's `entities`, not among the panels
 * drawn: a search can leave out the panels before it.
 *
 * @param index - Position in `entities`; every block when omitted
 * @returns The owner
 */
export function entry(index?: number): Owner {
  return index === undefined ? { kind: 'entry' } : { kind: 'entry', index };
}

/**
 * A toolbar button, by its position in `toolbar.buttons`.
 *
 * @param index - Position in the list; every button when omitted
 * @returns The owner
 */
export function button(index?: number): Owner {
  return index === undefined ? { kind: 'button' } : { kind: 'button', index };
}

/** Chassis forms, by class, with the scope their ids take. */
const CHASSIS_FORMS: Readonly<Record<string, string>> = {
  'display-view-form': 'display',
  'workspace-form': 'workspace',
  'filter-form': 'filter',
  'quick-setup-form': 'quick_setup',
};

const CHASSIS_SCOPES: ReadonlySet<string> = new Set(Object.values(CHASSIS_FORMS));

/** One form the editor draws, with who draws it and the scope of its ids. */
interface Drawn {
  readonly form: FormElement;
  readonly kind: Owner['kind'];
  /** Position in `entities` or `toolbar.buttons`, for an entry's or a button's form. */
  readonly index?: number;
  readonly scope: string;
  /** Place among every form the editor draws, counted from 1, to tell two forms apart. */
  readonly place: number;
}

/** A node a form draws, as `walkSchema` visits it. */
interface Visit {
  readonly node: HaFormSchema;
  readonly path: ReadonlyArray<string>;
  readonly dataPath: ReadonlyArray<string>;
}

interface Found extends Drawn {
  readonly visit: Visit;
}

/**
 * The editor's private state the harness reads, until entries carry keys of their own (PR 4):
 * nothing on a drawn calendar panel says which block it is, and a filter can leave any of them
 * out.
 */
interface EditorState {
  readonly _config?: Types.Config;
  /** The context every builder reads (`element.ts` › `_ctx`). */
  readonly _ctx: SchemaCtx;
  /** The context the filter matches against (`element.ts` › `_filterCtx`). */
  readonly _filterCtx: Filter.FilterCtx;
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
 * Which calendar block each drawn calendar panel belongs to.
 *
 * Two blocks of one calendar can hold the same form data, a block's form showing the calendar's
 * shared settings and the defaults it never wrote, while a filter keeps only one of them:
 * Customized Only and Essentials Only read what each block wrote. So this first asks what
 * `element.ts` › `_renderEntities` asks, which blocks keep a field under the filter, with the
 * schema it builds (`field-index.ts` › `entrySchema`) and the editor's own filter context, and
 * pairs the n-th panel with the n-th block kept. Each panel's forms must then hold that block's
 * data; where they do not, the helper fails rather than guess.
 *
 * @param editor - Editor element
 * @param root - Its shadow root
 * @returns Position in `entities` by panel
 */
function entryIndexes(editor: EditorElement, root: ShadowRoot): Map<Element, number> {
  const indexes = new Map<Element, number>();
  const panels = [...root.querySelectorAll('ha-expansion-panel.entity-panel')];
  if (panels.length === 0) return indexes;

  const { _config: config, _ctx: ctx, _filterCtx: filterCtx } = stateOf(editor);
  const entries = config?.entities ?? [];
  const kept = entries.flatMap((item, index) =>
    Filter.hasFields(
      Filter.filterEntitySchema(entrySchema(item, ctx), item, ENTITY_PATH, filterCtx),
    )
      ? [index]
      : [],
  );
  if (kept.length !== panels.length) {
    outOfStep(
      `The editor draws ${panels.length} calendar panels where its filter keeps ${kept.length}`,
    );
  }

  panels.forEach((panel, at) => {
    const index = kept[at];
    const data = Entities.toEntityFormData(entries[index], entries);
    for (const form of panel.querySelectorAll<FormElement>('ha-form.entity-form')) {
      if (!Value.deepEqual(form.data, data)) {
        outOfStep(
          `Calendar panel ${at + 1} should be entry ${index}, yet its form holds other data`,
        );
      }
    }
    indexes.set(panel, index);
  });
  return indexes;
}

/**
 * Which toolbar button each drawn button panel belongs to, by the key the editor gives each
 * button's panel (`data-button-key`) and keeps in list order. Each panel's form must hold that
 * button's data; where it does not, the helper fails rather than guess.
 *
 * @param editor - Editor element
 * @param root - Its shadow root
 * @returns Position in `toolbar.buttons` by panel
 */
function buttonIndexes(editor: EditorElement, root: ShadowRoot): Map<Element, number> {
  const indexes = new Map<Element, number>();
  const panels = [...root.querySelectorAll('ha-expansion-panel.button-panel')];
  if (panels.length === 0) return indexes;

  const { _config: config, _buttonKeys: keys = [] } = stateOf(editor);
  const written = config === undefined ? [] : Buttons.writtenButtons(config);
  for (const panel of panels) {
    const key = panel.getAttribute('data-button-key');
    const index = key === null ? -1 : keys.indexOf(Number(key));
    if (index < 0 || index >= written.length) {
      outOfStep(`A toolbar button panel keyed ${key ?? 'nothing'} matches no button`);
    }
    const form = panel.querySelector<FormElement>('ha-form.button-form');
    if (form !== null && !Value.deepEqual(form.data, Buttons.toButtonFormData(written[index]))) {
      outOfStep(`The panel of toolbar button ${index} holds another button's data`);
    }
    indexes.set(panel, index);
  }
  return indexes;
}

/**
 * The panel id a panel form belongs to, read from its panel's leading icon: each of the nine
 * panels draws its own.
 *
 * @param form - A panel form
 * @returns The panel id
 */
function panelScope(form: FormElement): string {
  const panel = form.closest('ha-expansion-panel');
  const icon = [...(panel?.children ?? [])].find(
    (child) => child.localName === 'ha-svg-icon' && child.getAttribute('slot') === 'leading-icon',
  ) as (Element & { path?: string }) | undefined;
  const named = PANELS.filter((candidate) => candidate.iconPath === icon?.path);
  if (named.length !== 1) {
    throw new Error(
      `A panel form whose panel's icon names ${named.length} panels; ` +
        'tests/helpers/editor-host.ts reads a panel by its icon, so each must be its own.',
    );
  }
  return named[0].id;
}

/** The scope of every form a helper has placed, kept for one a render has since replaced. */
const formScopes = new WeakMap<Element, string>();

/**
 * Places one form the editor draws: who draws it and the scope of its ids.
 *
 * @param form - The form
 * @param place - Its place among every form drawn, counted from 1
 * @param entries - Position in `entities` by calendar panel
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
  if (classes.contains('panel-form')) {
    return { form, kind: 'card', scope: panelScope(form), place };
  }
  if (classes.contains('buttons-heading')) return { form, kind: 'card', scope: 'button', place };
  if (classes.contains('entity-form')) {
    const panel = form.closest('ha-expansion-panel.entity-panel');
    const index = panel === null ? undefined : entries.get(panel);
    return { form, kind: 'entry', index, scope: 'calendar', place };
  }
  if (classes.contains('button-form')) {
    const panel = form.closest('ha-expansion-panel.button-panel');
    const index = panel === null ? undefined : buttons.get(panel);
    return { form, kind: 'button', index, scope: 'button', place };
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
  const entries = entryIndexes(editor, root);
  const buttons = buttonIndexes(editor, root);

  return [...root.querySelectorAll<FormElement>('ha-form')].map((form, at) => {
    const drawn = placeForm(form, at + 1, entries, buttons);
    formScopes.set(form, drawn.scope);
    return drawn;
  });
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
 * @returns The name
 */
function ownerName(kind: Owner['kind'], index?: number): string {
  if (kind === 'card' || kind === 'chassis') return `the ${kind}`;
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
  return owner.index === undefined || drawn.index === owner.index;
}

/**
 * Fails on an entry or a button the configuration does not hold, so a mistyped position is
 * not read as one drawing nothing.
 *
 * @param editor - Editor element
 * @param owner - The owner asked for
 */
function checkOwner(editor: EditorElement, owner: Owner): void {
  if ((owner.kind !== 'entry' && owner.kind !== 'button') || owner.index === undefined) return;
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
    const who = ownerName(wanted.kind, 'index' in wanted ? wanted.index : undefined);
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
  const { form, visit } = located(editor, id, owner);
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
 * have reported them together, then awaits the editor's update.
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
  const forms = ids.map((id) => located(editor, id, owner).form);
  if (forms.some((form) => form !== forms[0])) {
    throw new Error(`${listed(ids)} are drawn by different forms: change each on its own.`);
  }
  emitChange(forms[0], values);
  await editor.updateComplete;
}

/**
 * Opens what holds a field, as a user would before editing it: today every collapsed panel
 * around its form, outermost first. A panel opens as Home Assistant's does: it announces
 * `expanded-will-change`, lets a render pass (`nextRender`), expands and announces
 * `expanded-changed`. A card field whose panel draws no form while closed is found by its
 * panel, opened, and looked for again.
 *
 * @param editor - Editor element
 * @param id - Field id
 * @param owner - Owner, else the one the id's scope implies
 */
export async function openPageOf(editor: EditorElement, id: FieldId, owner?: Owner): Promise<void> {
  let found = find(editor, id, owner);
  const { scope } = parseFieldId(id);
  if (found === undefined && (owner ?? impliedOwner(scope)).kind === 'card') {
    const panel = panelOf(editor, scope);
    if (panel !== undefined) {
      await expand(panel);
      await editor.updateComplete;
      found = find(editor, id, owner);
    }
  }
  if (found === undefined) found = located(editor, id, owner);

  const panels: Element[] = [];
  for (let at = found.form.parentElement; at !== null; at = at.parentElement) {
    if (at.localName === 'ha-expansion-panel') panels.unshift(at);
  }
  for (const panel of panels) await expand(panel);
  await editor.updateComplete;
}

/**
 * One of the nine panels, found by its leading icon rather than by a form inside it.
 *
 * @param editor - Editor element
 * @param scope - The panel's id
 * @returns The panel, or undefined where it is not drawn
 */
function panelOf(editor: EditorElement, scope: string): Element | undefined {
  const iconPath = PANELS.find((panel) => panel.id === scope)?.iconPath;
  if (iconPath === undefined) return undefined;
  return [...(editor.shadowRoot?.querySelectorAll('ha-expansion-panel') ?? [])].find(
    (panel) =>
      !panel.matches('.entity-panel, .button-panel') &&
      [...panel.children].some(
        (child) =>
          child.localName === 'ha-svg-icon' &&
          (child as Element & { path?: string }).path === iconPath,
      ),
  );
}

/**
 * Waits as Home Assistant's `nextRender` does (`common/util/render-status.ts` in its frontend):
 * an animation frame, then a timeout. The frame is a Node immediate, which is how happy-dom
 * schedules one, and both come from `node:timers`, which fake timers leave in place whenever
 * they were installed, so a panel opens across a real render in a test that holds time still,
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

/**
 * Expands a panel the way Home Assistant's `ha-expansion-panel` does on a click
 * (`_toggleContainer`), if it is collapsed: it announces `expanded-will-change`, waits for a
 * render, expands and announces `expanded-changed`.
 *
 * @param panel - The panel
 */
async function expand(panel: Element): Promise<void> {
  const expansion = panel as Element & { expanded?: boolean };
  if (expansion.expanded === true) return;
  const announce = (type: string) =>
    panel.dispatchEvent(
      new CustomEvent(type, { detail: { expanded: true }, bubbles: true, composed: true }),
    );
  announce('expanded-will-change');
  await nextRender();
  expansion.expanded = true;
  announce('expanded-changed');
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
  return editor;
}
