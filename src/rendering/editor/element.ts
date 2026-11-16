/**
 * The editor element: the overview, one page per section, and the `<ha-form>` changes they
 * mediate. Schemas name Home Assistant selectors rather than concrete input elements, because HA
 * renames its components without notice; the editor draws its own rows, headings and radio
 * groups through `views/`.
 */

import { mdiCheck, mdiDeleteOutline, mdiFormatListChecks, mdiInformationOutline } from '@mdi/js';
import {
  LitElement,
  type PropertyValues,
  TemplateResult,
  html,
  nothing,
  render as renderInto,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { cache } from 'lit/directives/cache.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';

import { Announcer } from './announce';
import * as Audit from './audit';
import * as Buttons from './buttons';
import * as CalendarList from './calendar-list';
import * as Chips from './chips';
import * as Colors from './colors';
import * as Deprecated from './deprecated';
import * as Entities from './entities';
import {
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  builtSchema,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchema,
  fieldHelper,
  fieldLabel,
  parseFieldId,
  universeIndex,
} from './field-index';
import * as Filter from './filter';
import { whenText } from './gates';
import { type HaFormSchema, warmSchema } from './ha-form';
import * as HassKey from './hass-key';
import { HA_ACTION_LABEL_PREFIX, withCardActionLabels } from './hass-localize';
import { History, type MigrationState, type Snapshot } from './history';
import * as EditorLocalize from './localize';
import * as Misplaced from './misplaced';
import * as Navigation from './navigation';
import { LEGEND_EDITOR_VALUES, LEGEND_OFF } from './normalize';
import {
  type Appearance,
  CALENDARS_BLOCK,
  FAMILIES,
  type FamilyId,
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  type PageDef,
  type PageId,
  isWholeCard,
  placementOf,
} from './pages';
import { PANELS, type PanelExtra, type SchemaCtx, type SubformDef } from './panels';
import * as Plan from './plan';
import * as Prefs from './prefs';
import * as Preview from './preview';
import * as QuickSetup from './quick-setup';
import * as Reorder from './reorder';
import * as Reset from './reset';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import { TOOLBAR_BUTTON_PATH, buildToolbarButtonSchema } from './schemas/card';
import {
  VISIBILITY,
  accentColorModeOf,
  buildEntitySchema,
  entitySchemaFor,
  labelIconSourceOf,
  labelImageSourceOf,
} from './schemas/entity';
import {
  QUICK_SETUP_CALENDARS_SCHEMA,
  QUICK_SETUP_PATH,
  QUICK_SETUP_TAPS_SCHEMA,
  QUICK_SETUP_WEATHER_SCHEMA,
} from './schemas/quick-setup';
import * as Search from './search';
import * as Shown from './shown';
import * as Split from './split';
import * as SplitReview from './split-review';
import { DOCS_SITE, STORIES, type StoryId } from './stories';
import { interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Summary from './summary';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as AuditView from './views/audit';
import * as CalendarView from './views/calendars';
import * as ChipsView from './views/chips';
import * as ColorView from './views/color';
import * as Focus from './views/focus';
import * as HistoryView from './views/history';
import { escapeAction, historyKey, inTextField } from './views/keys';
import * as Overview from './views/overview';
import * as PageView from './views/page';
import * as ReorderView from './views/reorder';
import { scrollContainer } from './views/scroll';
import * as SearchView from './views/search';
import * as ShownView from './views/shown';
import * as SplitView from './views/split';
import * as WordLists from './word-lists';
import * as Workspace from './workspace';
import * as WriteFrames from './write-frames';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { loadIntlLocaleData } from '../../translations/intl-locale-data';
import * as LanguageCodes from '../../translations/language-codes';
import { configuredCalendarName } from '../../utils/calendar-names';
import * as EntityColors from '../../utils/entity-colors';
import * as Helpers from '../../utils/helpers';
import * as Logger from '../../utils/logger';
import { showsEventWeather } from '../../utils/weather-position';

/** How many entries the list holds before Filter Calendars appears above it. */
const CALENDAR_FILTER_ROWS = 8;

/** Home Assistant's own Visibility editor: the element under a card's Visibility tab. */
const CONDITIONS_EDITOR = 'ha-card-conditions-editor';

/**
 * Whether Home Assistant's own Visibility editor can edit a calendar's conditions here.
 *
 * The one Home Assistant element this editor names besides its three components, because no
 * selector reaches it: the `condition` selector edits an automation's conditions, which have no
 * user, screen, time or location. It is defined wherever Home Assistant's card editor is open,
 * which imports it to draw every card's Visibility tab, and has kept its name and these two
 * properties since 2023.11. Checked rather than assumed, through Lit's own record of an element's
 * properties: a Home Assistant that renames it, or drops either property, gets the YAML box
 * instead (AGENTS.md, _Editor_).
 *
 * @returns True to show it
 */
function conditionsEditorDefined(): boolean {
  const element = customElements.get(CONDITIONS_EDITOR) as
    { elementProperties?: ReadonlyMap<PropertyKey, unknown> } | undefined;
  const properties = element?.elementProperties;
  return !!properties?.has('hass') && properties.has('conditions');
}

/** Whether every item, and every item under an `and`, `or` or `not`, is a condition. */
function allConditions(list: ReadonlyArray<unknown>): boolean {
  return list.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const children = (item as { conditions?: unknown }).conditions;
    if (children === undefined || children === null) return true;
    return allConditions(Array.isArray(children) ? children : [children]);
  });
}

/**
 * A calendar's conditions as Home Assistant's Visibility editor takes them: a list of
 * conditions, empty for none.
 *
 * @param value - `visibility` as stored
 * @returns The list, or undefined where something in it, at any depth, is not a condition, which
 *   Home Assistant's editor fails on and only the YAML box can show as written
 */
function editableConditions(value: unknown): ReadonlyArray<object> | undefined {
  if (value === undefined || value === null) return [];
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return allConditions(list) ? (list as object[]) : undefined;
}

/**
 * Whether two lists of conditions say the same, as stored: compared as JSON, which drops a key
 * holding `undefined` the way the stored YAML does.
 */
function sameConditions(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Editors waiting for Home Assistant's Visibility editor to be defined. */
const awaitingConditionsEditor = new Set<{ requestUpdate(): void }>();

let conditionsEditorDefinition: Promise<void> | undefined;

/**
 * Redraws an editor once Home Assistant's Visibility editor is defined, should it arrive after the
 * editor opened. One waiter serves every editor and lets go of one as it is removed
 * (`disconnectedCallback`): a waiter of its own would hold each closed editor for good where Home
 * Assistant never defines the element.
 *
 * @param editor - The editor drawn with the YAML box
 */
function awaitConditionsEditor(editor: { requestUpdate(): void }): void {
  awaitingConditionsEditor.add(editor);
  conditionsEditorDefinition ??= customElements.whenDefined(CONDITIONS_EDITOR).then(() => {
    const waiting = [...awaitingConditionsEditor];
    awaitingConditionsEditor.clear();
    for (const each of waiting) each.requestUpdate();
  });
}

/** The key Home Assistant's Visibility editor asks its entity under (`conditionsEntityContext`). */
const CONDITIONS_ENTITY_CONTEXT = 'conditions-entity-context';

/**
 * Tells Home Assistant's Visibility editor which entity it edits against, as Home Assistant's own
 * card editor does for a card with one entity: the calendar, which a `state` or `numeric_state`
 * condition naming no entity reads. The editor then offers it as the current entity, and writes it
 * out as `entity_id` once such a condition is edited, so a `for` added there reaches core.
 *
 * Answered through Lit's context protocol, the event Home Assistant's own `consume` sends. Should
 * Home Assistant rename the key, nothing answers it and the editor works without an entity, as on
 * a card that has none.
 *
 * @param event - A `context-request`
 * @param entityId - The calendar whose panel holds the editor
 */
function provideCalendar(event: Event, entityId: string): void {
  const request = event as Event & {
    context?: unknown;
    subscribe?: boolean;
    callback?: (value: unknown, unsubscribe?: () => void) => void;
  };
  if (request.context !== CONDITIONS_ENTITY_CONTEXT || typeof request.callback !== 'function') {
    return;
  }
  event.stopPropagation();
  request.callback({ mode: 'current', entityId }, request.subscribe ? () => undefined : undefined);
}

/** The data of a form that draws no field, the one object every render hands it. */
const NO_DATA: Readonly<Record<string, unknown>> = {};

/** Keeps an event from going any further than where it started. */
const stopEvent = (event: Event): void => event.stopPropagation();

/** How many times the warm-up searches what it drew before it is drawn away regardless. */
const WARM_UP_ROUNDS = 10;

/** How long the warm-up waits on definitions before it is drawn away regardless, in ms. */
const WARM_UP_MS = 10_000;

/**
 * The custom elements below a node, through every shadow root but its own, that are not defined
 * yet, by tag: each still has the prototype it was created with, `HTMLElement`'s. Read off the
 * prototype rather than off `customElements.get`, which cannot see an element a scoped registry
 * defines.
 *
 * @param root - Where to search
 * @param found - The tags found so far
 * @returns The tags
 */
function undefinedBelow(root: ParentNode, found = new Set<string>()): Set<string> {
  for (const element of root.querySelectorAll('*')) {
    if (
      element.localName.includes('-') &&
      Object.getPrototypeOf(element) === HTMLElement.prototype
    ) {
      found.add(element.localName);
    }
    if (element.shadowRoot) undefinedBelow(element.shadowRoot, found);
  }
  return found;
}

/** Quick Setup's steps, in order. */
type QuickSetupStep = 'story' | 'calendars' | 'weather' | 'taps' | 'review';

const QUICK_SETUP_STEPS: ReadonlyArray<QuickSetupStep> = [
  'story',
  'calendars',
  'weather',
  'taps',
  'review',
];

/**
 * One run of Quick Setup, from opening it to Apply or Cancel (backlog item 188): a preview
 * transaction (`preview.ts`) and the wizard's own state.
 */
interface QuickSetupSession extends Preview.PreviewSession {
  /** Everything the editor held as Quick Setup opened: the `before` of Apply's undo step. */
  readonly openingSnapshot: Snapshot;
  readonly step: QuickSetupStep;
  /** Unset until a story is picked; nothing is previewed before that. */
  readonly answers?: QuickSetup.QuickSetupAnswers;
}

/**
 * One run of Split This Calendar on an entry's page (section 5.7), from opening it to Split or
 * Cancel. From Colors on it previews both parts on the card (`preview.ts`); the editor itself
 * keeps the configuration it opened on until Split writes, so any other change, Undo, or leaving
 * the page cancels the run first.
 */
interface SplitSession extends Preview.PreviewSession {
  /** The entry's key, which part 1 keeps. */
  readonly key: number;
  /** Part 2's key. */
  readonly newKey: number;
  /** 0 How, 1 Colors and Labels, 2 Review. */
  readonly step: number;
  readonly how?: 'type' | 'words';
  readonly field: Types.FilterField;
  /** The Word fields, as typed. */
  readonly terms: ReadonlyArray<string>;
  readonly parts: readonly [Split.SplitPart, Split.SplitPart];
  /** The entry as it was opened on. */
  readonly original: string | Types.EntityConfig;
  /** Part 2's first color, the swatch no calendar uses. */
  readonly free?: string;
  /** The review's read: absent until Review opens, `null` once it failed. */
  readonly events?: Types.CalendarEventData[] | null;
  /** Which read the review waits for. */
  readonly reading?: number;
}

/** What a color control writes for one of its rows or swatches (`colors.ts` › `ColorSpec`). */
type ColorWrite = Colors.ColorSpec['sources'][number]['write'];

/** Start Date's mode, drawn as the overview's chips (section 5.9). */
const START_DATE_FIELD: FieldId = 'content:start_date_mode';

/** Tapping an Event Opens It, which gives way to a line while another action is stored. */
const OPENS_DETAILS_FIELD: FieldId = 'actions:event_opens_details';

/** Calendar Filter, drawn as a radio group of its options (section 5.9). */
const LEGEND_FIELD: FieldId = 'card:toolbar.legend';

const { WORD_LIST_FIELDS } = WordLists;

/** What a color control is drawn for (`element.ts` › `_renderColor`). */
interface ColorArgs {
  readonly owner: WriteFrames.WriteOwner;
  readonly spec: Colors.ColorSpec;
  readonly ctx: SchemaCtx;
  /** The control's name: the absorbed mode's label, else the field's. */
  readonly name: string;
  /** The field that stores the color, drawn or not. */
  readonly valueField: IndexedField;
  /** The owner's form data, where the value is read. */
  readonly data: Readonly<Record<string, unknown>>;
  /** What the field shows with nothing stored, for the card's fields. */
  readonly fallback?: unknown;
  /** The value as the YAML holds it at the place it would be written, if any. */
  readonly stored: unknown;
  /** Where the value would be stored, for its draft's key (`colors.ts` › `draftKey`). */
  readonly destination: string;
  /** The field the control is drawn for: the absorbed mode, else the color. */
  readonly anchor: FieldId;
  /** What Undo and Redo focus. */
  readonly focusKey: string;
  /** The field's helper: the color's own, else the mode's. */
  readonly helper?: string;
  /** Its state words (`shown.ts`), in its name and under it. */
  readonly words?: string;
  /** The calendar, for an entry's control. */
  readonly entity?: { readonly id: string; readonly name: string };
  /** Where its choice goes instead of the owner, for a control editing nothing stored yet. */
  readonly write?: (write: ColorWrite) => void;
}

/** A list whose rows reorder (section 5.11): the calendars, or the toolbar's own buttons. */
type ReorderList = 'calendar' | 'button';

/** The keyboard grab, and the list it holds a row of. */
type Grab = Reorder.GrabState & { readonly list: ReorderList };

/**
 * A handle's `data-focus` key: `handle:calendar.anna` for a calendar, `handle:button:3` for a
 * toolbar button.
 *
 * @param list - Which list
 * @param id - The calendar's entity id, or the button's key
 * @returns The key
 */
function handleFocus(list: ReorderList, id: string | number): string {
  return list === 'calendar' ? `handle:${id}` : `handle:button:${id}`;
}

/** The line a removal or an applied story leaves under its list ("Removed Ben · Undo"). */
interface StatusLine {
  readonly kind: 'entry' | 'button' | 'story';
  readonly text: string;
  /** The removed calendar's place among the calendars, where the line stands in the list. */
  readonly at: number;
}

/** What a live field shows besides its control: its state words, and the line under it. */
interface FieldShow {
  readonly words?: string;
  readonly line: TemplateResult | typeof nothing;
}

/** Whose page a heading is planned for: the card's, or one calendar entry's, by its key. */
type PlanOwner = { readonly kind: 'card' } | { readonly kind: 'entry'; readonly key: number };

const CARD: PlanOwner = { kind: 'card' };

/** What a string's placeholders are filled with (`strings.ts` › `interpolate`). */
type Words = Record<string, string | number>;

/** The editor's own strings, by literal key, filled in where values are given. */
type Translate = (key: string, values?: Words) => string;

/**
 * Schema-driven configuration editor for Calendar Card Pro.
 */
export class CalendarCardProEditor extends LitElement {
  static get styles() {
    return styles;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Leaving the visual editor, for the code editor or by closing the dialog, cancels a split
    // that has not been made, so the preview is never what is kept.
    this._cancelSplit(false);
    awaitingConditionsEditor.delete(this);
    this._drag?.cancel();
    // The last editor or card out closes the registry subscription (`entity-colors.ts`).
    if (this._registryHeld) EntityColors.releaseEntityColors(this._registryChanged);
    this._registryHeld = false;
    this._registryWanted = false;
  }

  /**
   * Marks a bare `requestUpdate()` as pending for `shouldUpdate`, as the card does: a draft
   * committing or a panel opening can land in the same update as a `hass` that changed nothing
   * drawn, and that update then names only `hass` as changed.
   *
   * Lit calls this from its own constructor, before the flag's initializer has run.
   */
  override requestUpdate(...args: Parameters<LitElement['requestUpdate']>): void {
    if (args[0] === undefined) this._bareUpdatePending = true;
    super.requestUpdate(...args);
  }

  /**
   * Skips an update whose only cause is a `hass` that moved nothing the editor draws
   * (`hass-key.ts` › `editorHassKey`), which Home Assistant hands it several times a second. The
   * forms on the live feed, and the warm-up, get that `hass` all the same, straight from here; the
   * steady ones read nothing it changed. An update a bare `requestUpdate()` also asked for always
   * renders, and so does one in which what a value's warm-up read has moved.
   *
   * @param changed - Properties changed since the last update
   * @returns False to skip the update
   */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    const bare = this._bareUpdatePending;
    this._bareUpdatePending = false;
    // A value the warm-up held to its end is held again once what it read has moved
    // (`_finishWarmUp`), in the render this asks for.
    let moved = false;
    for (const [key, stale] of this._warmed) {
      if (stale()) moved = this._warmed.delete(key);
    }
    if (bare || moved || changed.size !== 1 || !changed.has('hass') || !this._config) return true;
    const ids = HassKey.editorEntityIds(this._config, this._quickSetup?.answers?.calendars);
    if (HassKey.editorHassKey(changed.get('hass') as Types.Hass | undefined, this.hass, ids)) {
      return true;
    }

    // The warm-up, the editor's own child, is fed as its forms are while it is drawn.
    this._feedLive(this.renderRoot, this);
    return false;
  }

  /**
   * Hands each element on the live feed below some roots the newest `hass`: wrapped with the card's
   * action names, or as it is for Home Assistant's Visibility editor.
   *
   * @param roots - Where to look
   */
  private _feedLive(...roots: ParentNode[]): void {
    const live = withCardActionLabels(this.hass, this._ctx.language);
    for (const root of roots) {
      for (const element of root.querySelectorAll<HTMLElement & { hass?: unknown }>(
        '[data-hass="live"]',
      )) {
        element.hass = element.localName === CONDITIONS_EDITOR ? this.hass : live;
      }
    }
  }

  /**
   * Has Home Assistant load every element the editor's forms draw before a panel first opens.
   *
   * `ha-form` and `ha-selector` import an element the first time a form holds a node that needs
   * it (`LOAD_ELEMENTS` in its frontend), and a panel now mounts its forms only as it opens, one
   * render before Home Assistant measures it: an element still loading then has drawn nothing,
   * and the panel opens short. Every form used to be drawn as the editor opened, which loaded them
   * all before any click. So once a render has named the forms it draws (`_drawn`), the warm-up is
   * drawn: one form holding a node for each element not defined yet, and one for each value a
   * field of a type in `HassKey.VALUE_SELECTORS` holds, with that value, so that Home Assistant
   * draws, and loads, what the value picks (`warmSchema`); and Home Assistant's Visibility editor
   * holding every calendar's conditions, which it draws with forms of its own. What an earlier
   * warm-up held through to its end is not held again, unless what it read has moved since
   * (`_finishWarmUp`). It is drawn away once nothing below it waits on a definition, or after ten
   * searches or ten seconds. A later render warms whatever a switched layout, an opened gate, a
   * cleared filter or a new value newly needs.
   *
   * It is a child of the editor's own element, which its shadow root never slots, so it is never
   * laid out, painted or exposed; it is inert and `aria-hidden` besides, and no `value-changed` or
   * `config-changed` of its goes further. It takes the live feed, fresh on every update while it
   * is drawn (`shouldUpdate`), since what a value draws can depend on states: Home Assistant's
   * service controls draw a field only for a target that supports it. Its Visibility editor is told
   * the calendar it would edit against.
   */
  protected override updated(): void {
    // Home Assistant's calendar colors, read through the card's own module once an entry's color
    // control describes one, and watched while this editor is open.
    if (this._registryWanted && !this._registryHeld && this.hass) {
      this._registryHeld = true;
      EntityColors.ensureEntityColors(this.hass, this._registryChanged);
    }
    if (!this._drawn) return;
    // Every key the drawn forms hold, held or not: `warmSchema` asks about each one it meets.
    const drawn = new Set<string>();
    const keep = (key: string): boolean => {
      drawn.add(key);
      return !this._warmed.has(key) && !customElements.get(key);
    };
    const [keys, schema, data] = warmSchema(this._drawn, keep, HassKey.VALUE_SELECTORS);
    const held = [...this._drawnConditions.keys()].filter(keep);
    // A value the configuration no longer holds is forgotten; element types and conditions stay.
    for (const each of this._warmed.keys()) {
      if (/^ha-\S+ /.test(each) && !drawn.has(each)) this._warmed.delete(each);
    }
    const key = [...keys, ...held].join('\n');
    if (key === this._warmKey) {
      // A render while it is drawn feeds it as a skipped one would.
      this._feedLive(this);
      return;
    }
    this._warmKey = key;
    this._warmData = data;
    // Each warm-up a run of its own, so that an earlier one's search cannot end it.
    const run = ++this._warmRun;
    // Asked for only by a condition's editor, so only while a condition is held.
    const calendar = this._drawnConditions.get(held[0]!)!;
    renderInto(
      key
        ? html`<div
            inert
            aria-hidden="true"
            @value-changed=${stopEvent}
            @config-changed=${stopEvent}
            @context-request=${(event: Event) => provideCalendar(event, calendar)}
          >
            <ha-form
              data-hass="live"
              .hass=${withCardActionLabels(this.hass, this._ctx.language)}
              .schema=${schema}
              .data=${data}
            ></ha-form>
            ${
              held.length > 0
                ? html`<ha-card-conditions-editor
                    data-hass="live"
                    .hass=${this.hass}
                    .conditions=${held.map((each) => JSON.parse(each))}
                  ></ha-card-conditions-editor>`
                : nothing
            }
          </div>`
        : nothing,
      this,
    );
    if (key) void this._finishWarmUp(run);
  }

  /**
   * Draws the warm-up away once nothing below it waits on a definition.
   *
   * What a value picks, or a condition's form, is drawn only once the element drawing it is
   * defined, so the warm-up is done when its subtree says so, not when the elements it names are:
   * after each render it is searched, through every shadow root, for elements not defined yet
   * (`undefinedBelow`), and their definitions awaited, until a search finds none. After
   * `WARM_UP_ROUNDS` searches or `WARM_UP_MS` it is drawn away regardless. A run a later warm-up
   * has replaced stops there, whatever it held.
   *
   * What it held is then not held again while what it read stays as it was: for a value, Home
   * Assistant's services and the attributes of each entity the value names, which its service
   * controls filter their fields by, though not of an entity a target reaches only through an area,
   * a device or a label; for anything else, nothing (`shouldUpdate`).
   *
   * @param run - Which warm-up this is (`updated`)
   */
  private async _finishWarmUp(run: number): Promise<void> {
    const deadline = Date.now() + WARM_UP_MS;
    for (let round = 0; round < WARM_UP_ROUNDS; round++) {
      await new Promise((resolve) => setTimeout(resolve));
      const missing = undefinedBelow(this);
      if (run !== this._warmRun || missing.size === 0 || Date.now() >= deadline) break;
      await Promise.race([
        Promise.all([...missing].map((tag) => customElements.whenDefined(tag))),
        new Promise((resolve) => setTimeout(resolve, deadline - Date.now())),
      ]);
    }
    if (run !== this._warmRun) return;
    const values = this._warmData;
    for (const held of this._warmKey.split('\n')) {
      // Every string the value holds, as JSON visits it, read as an entity id.
      const named: string[] = [];
      JSON.stringify(values[held], (_, each: unknown) => {
        if (typeof each === 'string') named.push(each);
        return each;
      });
      const read = (): unknown[] =>
        held in values
          ? [this.hass?.services, ...named.map((id) => this.hass?.states[id]?.attributes)]
          : [];
      const was = read();
      this._warmed.set(held, () => read().some((each, at) => each !== was[at]));
    }
    this._warmKey = '';
    renderInto(nothing, this);
  }

  @property({ attribute: false }) hass?: Types.Hass;

  @state() private _config?: Types.Config;

  @state() private _pending: Record<string, string> = {};

  /** The word lists shown as a pattern by choice, by owner and field (`_wordKey`). */
  @state() private _wordModes: ReadonlyMap<string, 'pattern'> = new Map();

  /**
   * The terms a word list's form last sent, by owner and field, shown while they still write the
   * stored pattern: a term just added is empty, and writes nothing until it is typed.
   */
  @state() private _wordDrafts: ReadonlyMap<string, ReadonlyArray<string>> = new Map();

  @state() private _filter: Filter.FilterCriteria = { ...Filter.NO_FILTER };

  /** Show Every Setting and Show YAML Option Names, remembered in this browser (`prefs.ts`). */
  @state() private _prefs: Prefs.Prefs = Prefs.readPrefs();

  /**
   * The settings added this session, which their pages draw although nothing is stored: field
   * ids, `family:<id>`, `entry:<key>:<id>`, `entry:<key>:family:<id>` (`plan.ts`). A choice of
   * what to look at, so outside the undo snapshot and outside any storage; replaced, never
   * changed in place, so a render sees it move.
   */
  @state() private _added: ReadonlySet<string> = new Set();

  /** The Add row open, by its `data-focus` key, and what its box narrows it to. */
  @state() private _addOpen?: { readonly key: string; readonly query: string };

  @state() private _selectedWorkspace?: Workspace.EditorWorkspace;

  @state() private _gridReconciliation: ReadonlyArray<string> = [];

  @state() private _migration: MigrationState = { kind: 'current' };

  @state() private _quickSetup?: QuickSetupSession;

  /** Split This Calendar, while it is open on an entry's page. */
  @state() private _split?: SplitSession;

  /** The panel a split leaves, until the next change or until the page is left. */
  @state() private _splitDone?: { readonly key: number; readonly newKey: number };

  /** Entries a split wrote this session, which the overview tags "New". */
  @state() private _newEntries: ReadonlySet<number> = new Set();

  /** Set while Split writes, so its own change does not cancel it. */
  private _splitting = false;

  /** Counts the review's reads, so a late answer to an older one is dropped. */
  private _reads = 0;

  /** Where the editor is, and where Back goes (`navigation.ts`). */
  @state() private _nav: Navigation.NavState = Navigation.OVERVIEW;

  /** Whether the scope was changed this session, which keeps Settings For full. */
  @state() private _scopeChanged = false;

  /** Whether Change opened Settings For, a disclosure Escape closes again. */
  @state() private _scopeOpen = false;

  /**
   * Whether Quick Setup's banner shows: decided by the session's first configuration, a fresh
   * card's, and kept until Quick Setup is applied or the banner dismissed.
   */
  @state() private _banner?: boolean;

  /**
   * The line What This Card Changes is editing in place, and its group: kept drawn while it is
   * edited, even once the edit takes it out of the YAML, so its control stays under the cursor.
   */
  @state() private _auditEdit?: {
    readonly line: Audit.AuditLine;
    readonly group: Audit.AuditGroup;
  };

  /** The field a search result opened, highlighted while `lit` (`_openResult`). */
  @state() private _jump?: {
    readonly target: Search.FieldTarget;
    readonly label: string;
    readonly lit: boolean;
  };

  /** The results a result on the overview left, which Return to Results and Escape restore. */
  @state() private _resultsLeft?: Navigation.TrailEntry;

  /** The jump list's count line, as the last render drew it, announced as the query changes. */
  private _resultStatus = '';

  /** Edit Here: the card settings found are drawn as their live controls (section 5.8). */
  @state() private _editHere = false;

  /** The folded results opened to a row per calendar entry, by field id. */
  @state() private _openResults: ReadonlySet<FieldId> = new Set();

  /** The jump list's index, and what it was built from (`_searchIndex`). */
  private _indexKept?: { deps: unknown[]; index: ReadonlyArray<Search.SearchEntry> };

  /** A query typed while an input method composes it, applied once the composition ends. */
  private _composing?: { held?: Filter.FilterCriteria };

  /** The one polite live region's queue (`announce.ts`). */
  private _announcer = new Announcer();

  /** Undo and Redo's steps, for this session (`history.ts`). */
  private _history = new History();

  /** The line a removal or an applied story leaves, until the next change. */
  @state() private _status?: StatusLine;

  /**
   * The color controls' state outside the configuration, by `colors.ts` › `draftKey`: Custom
   * chosen, and the text typed there that the card cannot draw, which is kept here and never
   * written. Kept across closing a control and changing pages; cleared by another choice in the
   * control and by a configuration the editor did not send.
   */
  @state() private _colorDrafts: ReadonlyMap<string, { readonly text?: string }> = new Map();

  /** The color control open, by owner and field (`_colorKey`). */
  @state() private _openColor?: string;

  /** Whether an entry's color control has described Home Assistant's color for its calendar. */
  private _registryWanted = false;

  /** Whether this editor is subscribed to Home Assistant's calendar colors. */
  private _registryHeld = false;

  /** Draws again once Home Assistant's calendar colors move. */
  private _registryChanged = (): void => this.requestUpdate();

  /**
   * The action strip open: a row's, `entry:<key>` or `calendar:<entity id>`, which travels with
   * the row through a move, or `page` for an entry page's ⋮.
   */
  @state() private _openStrip?: string;

  /** Add Calendar, while open, with the calendar chosen in its picker. */
  @state() private _adding?: { readonly chosen?: string };

  /** What Filter Calendars holds. */
  @state() private _calendarQuery = '';

  /**
   * The calendar the keyboard grab holds, and where (`reorder.ts`): session state, outside undo,
   * written only when it drops.
   */
  @state() private _grab?: Grab;

  /** The pointer drag under way on a handle, which Escape cancels. */
  private _drag?: { readonly cancel: () => void };

  /** Whether the next click on a handle repeats what a Space or a drag just did, and is ignored. */
  private _swallowClick = false;

  /** The line under an entry page's header after a Duplicate or a re-point, until the next change. */
  @state() private _entryNotice?: {
    readonly key: number;
    readonly text: string;
    readonly warning: boolean;
  };

  /** Whether `_commit` is running a change, so a write inside it joins that change's step. */
  private _committing = false;

  /** What the live region last said. */
  private _spoken = '';

  /** What this render draws from: the fields built here, and those search reaches. */
  private _drawing?: {
    readonly present: ReadonlyMap<FieldId, IndexedField>;
    readonly shown: ReadonlySet<FieldId>;
    readonly index: FieldIndex;
  };

  /** Each field's Reset or Remove, worked out once per state of the editor (`_resetActionOf`). */
  private _actions?: { readonly from: ReadonlyArray<unknown>; readonly map: Map<string, unknown> };

  /** What Home Assistant's Visibility editor last sent for each entry, by key (`_conditionsFor`). */
  private _emittedConditions = new Map<
    number,
    { readonly entityId: string; readonly conditions: ReadonlyArray<unknown> }
  >();

  private _authoredRootKeys = new Set<string>();

  /**
   * A key per calendar entry, in the order of `entities`, so each entry keeps its own page and
   * its forms' writes reach it, wherever a removal, a duplicate or a move takes it
   * (`write-frames.ts`, `calendar-list.ts`). The editor's own: never written to the configuration.
   */
  private _entryKeys: number[] = [];

  private _nextEntryKey = 0;

  /**
   * A key per toolbar button, in the list's order, so each button keeps its own row, open or
   * closed, through a move and through the removal of another.
   */
  private _buttonKeys: number[] = [];

  private _nextButtonKey = 0;

  /** The buttons whose rows are open: session state, outside undo. Add Button opens its own. */
  @state() private _openButtons = new Set<number>();

  private _rawConfig: Record<string, unknown> = {};

  /** Whether a bare `requestUpdate()` is waiting in the current batch (`shouldUpdate`). */
  private _bareUpdatePending = false;

  /** What each form input was last handed, by slot, with what it was made from (`_keep`). */
  private _kept = new Map<string, { readonly from: unknown; readonly value: unknown }>();

  /**
   * The forms the last render of the panels drew, opened or not, each as its schema and its data
   * (`updated`).
   */
  private _drawn?: (readonly [ReadonlyArray<HaFormSchema>, unknown])[];

  /**
   * The conditions the same render handed the Visibility editor, each as JSON, with the calendar it
   * was handed for (the last, where several calendars hold it).
   */
  private _drawnConditions = new Map<string, string>();

  /** What the warm-up holds, its keys joined by line, empty when it is not drawn (`updated`). */
  private _warmKey = '';

  /** The values the warm-up holds, by key (`warmSchema`). */
  private _warmData: Record<string, unknown> = {};

  /** Which warm-up was drawn last, counted (`_finishWarmUp`). */
  private _warmRun = 0;

  /**
   * What a warm-up held through to its end, which is not held again, each with whether what it
   * read has moved since (`_finishWarmUp`). A value's goes once no drawn form holds it (`updated`).
   */
  private _warmed = new Map<string, () => boolean>();

  /**
   * Resolves the configured view to one the editor understands.
   *
   * @param config - Merged configuration
   * @returns The effective editor view
   */
  private _viewForConfig(config: Readonly<Types.Config>): Types.EffectiveView {
    return ViewConfig.VIEWS.includes(config.view) ? config.view : 'list';
  }

  /**
   * Follows the displayed view until the user explicitly chooses a workspace.
   */
  private get _workspace(): Workspace.EditorWorkspace {
    return this._selectedWorkspace ?? this._viewForConfig(this._config!);
  }

  private _lastDispatched?: Record<string, unknown>;

  private _gridResetKeys = new Set<string>();

  /** The language Home Assistant's `Intl` polyfill was last asked for (`willUpdate`). */
  private _intlLanguage = '';

  /**
   * Teaches Home Assistant's `Intl` polyfill the editor's language where it has installed one
   * that lacks it, so the lists the editor joins read in that language, and draws again once it
   * has (`intl-locale-data.ts`). Without the polyfill it does nothing at all.
   */
  protected override willUpdate(): void {
    if (!this._config) return;
    // Leaving the entry's page, by Back, Previous or Next Calendar or a result, cancels a split.
    const route = this._nav.route;
    const here = (key: number): boolean => route.kind === 'entry' && route.key === key;
    if (this._split !== undefined && !here(this._split.key)) this._cancelSplit(false);
    if (this._splitDone !== undefined && !here(this._splitDone.key)) this._splitDone = undefined;
    const language = this._ctx.language;
    if (language === this._intlLanguage) return;
    this._intlLanguage = language;
    void loadIntlLocaleData(language, ['ListFormat'], () => this.requestUpdate());
  }

  /**
   * Accepts a configuration from Home Assistant.
   *
   * @param config - Card configuration as stored
   */
  setConfig(config: Types.Config): void {
    const rawConfig = config as unknown as Record<string, unknown>;

    // Split previews on the card alone; the editor keeps what it opened on until Split writes.
    if (Preview.isPreviewEcho(this._split, rawConfig)) return;
    const session = this._quickSetup;
    const isPreviewEcho = Preview.isPreviewEcho(session, rawConfig);
    const isEcho =
      isPreviewEcho ||
      (this._lastDispatched !== undefined && Value.equalConfigs(rawConfig, this._lastDispatched));

    // Anything else means the YAML changed under Quick Setup, which then has nothing to restore.
    if (session !== undefined && !isEcho) this._quickSetup = undefined;

    // An echo of the editor's own write holds the entries its keys were moved with, or a Quick
    // Setup preview, which rebuilds the list a calendar at a time. What a change from outside did
    // to the entries cannot be known, so their places are all there is to go by.
    const entities = Array.isArray(config.entities) ? config.entities : [];
    if (isEcho) this._carryEntryKeys(entities);
    else {
      this._entryKeys = WriteFrames.keysByPosition(
        this._entryKeys,
        entities.length,
        this._mintEntryKey,
      );
      // What the entries became cannot be known, so what was added to one is not carried over.
      if ([...this._added].some((key) => key.startsWith('entry:'))) {
        this._added = new Set([...this._added].filter((key) => !key.startsWith('entry:')));
      }
    }

    if (!isEcho) this._authoredRootKeys = new Set(Object.keys(rawConfig));
    this._adopt(rawConfig, config);
    this._migration = this._migrationState(rawConfig);

    if (!isEcho) {
      // A configuration the editor did not send ends what Undo could reach, and a grab or a drag
      // whose list it may have reordered.
      this._grab = undefined;
      this._drag?.cancel();
      this._history.clear();
      this._status = undefined;
      // The YAML changed under the split, which then has nothing to put back.
      this._split = this._splitDone = undefined;
      this._newEntries = new Set();
      this._colorDrafts = new Map();
      // Keyed by entry key, which a list from outside hands out by place again.
      this._wordModes = new Map();
      this._wordDrafts = new Map();
      this._entryNotice = undefined;
      this._selectedWorkspace = undefined;
      this._pending = {};
      this._gridReconciliation = [];
      this._gridResetKeys.clear();
      // The page open may be gone from the card, the Grid page outside Grid.
      this._nav = Navigation.validate(this._nav, (route) => this._exists(route)).nav;
    }
    this._banner ??= QuickSetup.isFreshCard(rawConfig);

    // An echo leaves what was sent as it was sent: recomputed through the minimizing write, a
    // restored deprecated option would drop out of it, and the next echo of the same YAML would
    // read as a change from outside.
    if (isEcho) return;
    this._lastDispatched = Value.toStoredConfig(
      this._config!,
      this._authoredRootKeys,
      this._rawConfig,
    );
  }

  /**
   * Classifies the editor's migration path from the raw authored configuration.
   *
   * @param rawConfig - Configuration before defaults are merged
   * @returns The state that gates or prepares editor writes
   */
  private _migrationState(rawConfig: Readonly<Record<string, unknown>>): MigrationState {
    const version = Config.configVersionState(rawConfig);
    if (version.kind === 'current') return { kind: 'current' };
    if (version.kind === 'future') return version;
    if (version.kind === 'invalid') return version;

    const alreadyLayered =
      version.version === undefined &&
      (Helpers.isConfigBlock(rawConfig.list) || Helpers.isConfigBlock(rawConfig.time_grid));
    if (alreadyLayered) return { kind: 'automatic' };

    const keys = Value.ambiguousRootKeys(rawConfig);
    const block = ViewConfig.viewBlockFor(this._viewForConfig(this._config!));
    const needsChoice =
      block === ViewConfig.VIEW_BLOCKS.list || block === ViewConfig.VIEW_BLOCKS.grid;
    return needsChoice && keys.length > 0 ? { kind: 'choice', keys } : { kind: 'automatic' };
  }

  /**
   * Builds the migrated stored shape from the current local configuration.
   *
   * @param mode - Meaning selected for authored divergent root values
   * @returns Stamped stored configuration and the roots removed from it
   */
  private _migrationResult(mode: Value.ListMigrationMode): Value.ListMigrationResult {
    return Value.migrateListConfig(
      Value.toStoredConfig(this._config!, this._authoredRootKeys, this._rawConfig),
      this._rawConfig,
      mode,
    );
  }

  /**
   * Makes a migration result the editor's local truth before Home Assistant echoes it.
   *
   * @param result - Stored migration result
   */
  private _adoptMigration(result: Value.ListMigrationResult): void {
    for (const key of result.movedRootKeys) this._authoredRootKeys.delete(key);
    this._adopt(result.config, result.config);
    this._migration = { kind: 'current' };
  }

  /**
   * Accepts a write and prepares any non-ambiguous migration.
   *
   * @returns Whether configuration editing is allowed
   */
  private _prepareForWrite(): boolean {
    if (this._migration.kind !== 'current' && this._migration.kind !== 'automatic') {
      Logger.debug('Ignoring an editor write while migration is blocked', this._migration.kind);
      return false;
    }
    if (this._migration.kind === 'automatic') {
      this._adoptMigration(this._migrationResult('shared-root'));
    }
    return true;
  }

  /**
   * Commits the user's one-time interpretation of legacy root values.
   *
   * @param mode - Whether ambiguous values belong to List or every layout
   */
  private _chooseMigration(mode: Value.ListMigrationMode): void {
    if (this._migration.kind !== 'choice') return;
    const label = this._string(
      this._ctx,
      mode === 'keep-list' ? 'config_migration.keep_list' : 'config_migration.use_shared',
    );
    // One undo step: Undo puts the YAML back as it was, and the choice with it.
    this._commit(label, undefined, () => {
      const result = this._migrationResult(mode);
      this._adoptMigration(result);
      this._send(result.config);
    });
  }

  /**
   * Everything the editor holds about the configuration, as Undo restores it (`history.ts`).
   *
   * @returns A copy, which later writes cannot reach
   */
  private _snapshot(): Snapshot {
    const config = this._config;
    return {
      raw: structuredClone(this._rawConfig),
      authoredRootKeys: [...this._authoredRootKeys],
      gridResetKeys: [...this._gridResetKeys],
      gridReconciliation: [...this._gridReconciliation],
      pending: { ...this._pending },
      migration: this._migration,
      entryKeys: config ? [...this._entryKeysFor((config.entities ?? []).length)] : [],
      buttonKeys: config ? [...this._buttonKeysFor(Buttons.writtenButtons(config).length)] : [],
    };
  }

  /**
   * Makes a change one undo step: what the editor held before it and after it, recorded only
   * where the stored configuration moved. A write a change makes inside another joins the outer
   * one's step. A change that leaves no line of its own closes the line shown.
   *
   * @param label - The step's name, localized: "Change Event Font Size"
   * @param coalesceKey - The text or number field typed in, which later keystrokes join
   * @param run - Makes the change
   * @param focusKey - What Undo and Redo focus: `field:<id>`, `entry:<key>` or `button:<key>`
   * @param before - What the step goes back to, where that is not the editor as it is now
   * @returns Whether a step was recorded
   */
  private _commit(
    label: string,
    coalesceKey: string | undefined,
    run: () => void,
    focusKey?: string,
    before?: Snapshot,
  ): boolean {
    if (this._committing || !this._config) {
      run();
      return false;
    }
    if (!this._splitting) {
      this._cancelSplit(false);
      this._splitDone = undefined;
    }
    before ??= this._snapshot();
    const where = { route: this._nav.route, workspace: this._selectedWorkspace, focusKey };
    const status = this._status;
    const notice = this._entryNotice;
    this._committing = true;
    try {
      run();
    } finally {
      this._committing = false;
    }
    if (Value.equalConfigs(before.raw, this._rawConfig)) return false;
    if (this._entryNotice === notice) this._entryNotice = undefined;
    this._history.record(
      { label, before, after: this._snapshot(), where },
      coalesceKey,
      Date.now(),
    );
    if (this._status === status) this._closeStatus();
    return true;
  }

  /**
   * Puts back what a snapshot holds and tells Home Assistant, bypassing the minimizing write, so a
   * pruned deprecated option or an authored default comes back byte for byte. Home Assistant's
   * echo then reads as the editor's own.
   *
   * @param snapshot - What to put back
   */
  private _restore(snapshot: Snapshot): void {
    this._adopt(snapshot.raw, structuredClone(snapshot.raw));
    this._authoredRootKeys = new Set(snapshot.authoredRootKeys);
    this._gridResetKeys = new Set(snapshot.gridResetKeys);
    this._gridReconciliation = [...snapshot.gridReconciliation];
    this._pending = { ...snapshot.pending };
    this._migration = snapshot.migration;
    this._entryKeys = [...snapshot.entryKeys];
    this._buttonKeys = [...snapshot.buttonKeys];
    this._status = undefined;
    this._entryNotice = undefined;
    this._splitDone = undefined;
    const config = structuredClone(snapshot.raw) as Record<string, unknown>;
    this._lastDispatched = config;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: structuredClone(config) } }),
    );
  }

  /**
   * Focuses the first element a selector finds once the update in progress has rendered
   * (`views/focus.ts` › `focusFirst`).
   *
   * @param selectors - Candidates, best first
   */
  private _focusSoon(selectors: ReadonlyArray<string>): void {
    void this.updateComplete.then(() => Focus.focusFirst(this.renderRoot, selectors));
  }

  /** Takes the last step back. */
  private _undo = (): void => this._step('undo');

  /** Does the last step taken back again. */
  private _redo = (): void => this._step('redo');

  /**
   * Undo or Redo: restores the step's snapshot, returns to where it was made, says what it did,
   * and puts focus on what it restored: a field's wrapper, never anything inside its form, so the
   * next Ctrl/Cmd+Z still reaches the editor; else the page's heading.
   *
   * @param way - Which way
   */
  private _step(way: 'undo' | 'redo'): void {
    if (this._quickSetup !== undefined) return;
    this._cancelSplit(false);
    const entry = way === 'undo' ? this._history.undo() : this._history.redo();
    if (entry === undefined) return;
    this._grab = undefined;
    this._restore(way === 'undo' ? entry.before : entry.after);
    const { route, workspace, focusKey } = entry.where;
    if (workspace !== this._selectedWorkspace) this._selectedWorkspace = workspace;
    if (!Navigation.sameRoute(route, this._nav.route)) {
      const from = { route: this._nav.route, scrollTop: Focus.scrollPosition(this) };
      this._nav = Navigation.go(this._nav, route, from);
    }
    // An entry's page the step took away, or the Grid page outside Grid, gives way.
    this._nav = Navigation.validate(this._nav, (each) => this._exists(each)).nav;
    this._say(
      interpolate(
        way === 'undo'
          ? this._string(this._ctx, 'history.undone')
          : this._string(this._ctx, 'history.redone'),
        { action: entry.label },
      ),
    );
    void this.updateComplete.then(() => this._focusRestored(focusKey));
  }

  /**
   * Puts focus on what Undo or Redo restored: a field's wrapper, a calendar entry's row, a
   * button's row, else the heading of the place shown, or the migration choice's title.
   *
   * @param focusKey - What the step's change was made with
   */
  private _focusRestored(focusKey: string | undefined): void {
    const root = this.renderRoot as ShadowRoot;
    const [kind, key] =
      focusKey === undefined
        ? []
        : [focusKey.slice(0, focusKey.indexOf(':')), focusKey.slice(focusKey.indexOf(':') + 1)];
    // A field's wrapper, or the chip or radio group the editor draws in its place.
    const target =
      kind === 'field'
        ? root.querySelector<HTMLElement>(`[data-field="${CSS.escape(key!)}"]`)
        : kind === 'entry' || kind === 'button'
          ? root.querySelector<HTMLElement>(
              Focus.byFocusKey(`${kind === 'entry' ? 'row' : 'button'}:${key}`),
            )
          : null;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'nearest' });
      if (root.activeElement === target) return;
    }
    Focus.focusFirst(root, [
      '#config-migration-title',
      '.page-title',
      '.page-group .heading',
      '.row-group .heading',
    ]);
  }

  /**
   * Closes the line a removal or an applied story left. Where focus was on it, focus moves on:
   * for a calendar, to the calendar drawn in its place (`_focusAfterRemove`); for a button, to Add
   * Button; for a story, to the Calendars heading.
   */
  private _closeStatus(): void {
    const status = this._status;
    if (status === undefined) return;
    const root = this.renderRoot as ShadowRoot;
    const focused = root.querySelector('[data-status-bar]')?.contains(root.activeElement) ?? false;
    this._status = undefined;
    if (!focused) return;
    if (status.kind === 'entry') {
      void this._focusAfterRemove(status.at);
      return;
    }
    this._focusSoon([
      status.kind === 'button' ? '.add-button' : '[data-heading="calendars"] .heading',
    ]);
  }

  /**
   * Shows the line a removal or an applied story leaves, says it, and puts focus on its Undo.
   *
   * @param status - The line
   * @param said - The sentence a screen reader hears
   */
  private _showStatus(status: StatusLine, said: string): void {
    this._status = status;
    this._say(said);
    this._focusSoon([Focus.byFocusKey('status-undo')]);
  }

  /**
   * A word Home Assistant has for a control, else the editor's own.
   *
   * @param ctx - Schema context
   * @param haKey - Home Assistant's key
   * @param key - The editor's key
   * @returns The word
   */
  private _haWord(ctx: SchemaCtx, haKey: string, key: 'history.undo' | 'history.redo'): string {
    const word = this.hass?.localize?.(haKey);
    if (typeof word === 'string' && word !== '' && word !== haKey) return word;
    return key === 'history.undo'
      ? this._string(ctx, 'history.undo')
      : this._string(ctx, 'history.redo');
  }

  /**
   * Undo and Redo, named after the step each would take while it can.
   *
   * @param ctx - Schema context
   * @returns The pair
   */
  private _renderHistory(ctx: SchemaCtx): TemplateResult {
    const button = (
      entry: { readonly label: string } | undefined,
      plain: string,
      named: string,
      onPress: () => void,
    ) => ({
      label: entry === undefined ? plain : interpolate(named, { action: entry.label }),
      enabled: entry !== undefined,
      onPress,
    });
    return HistoryView.historyControls(
      button(
        this._history.peekUndo(),
        this._haWord(ctx, 'ui.common.undo', 'history.undo'),
        this._string(ctx, 'history.undo_named'),
        this._undo,
      ),
      button(
        this._history.peekRedo(),
        this._haWord(ctx, 'ui.common.redo', 'history.redo'),
        this._string(ctx, 'history.redo_named'),
        this._redo,
      ),
    );
  }

  /**
   * The line a removal or an applied story leaves, where it belongs.
   *
   * @param ctx - Schema context
   * @param kinds - The kinds of line drawn here
   * @returns The line, or nothing
   */
  private _renderStatus(
    ctx: SchemaCtx,
    kinds: ReadonlyArray<StatusLine['kind']>,
  ): TemplateResult | typeof nothing {
    const status = this._status;
    if (status === undefined || !kinds.includes(status.kind)) return nothing;
    return HistoryView.statusBar(
      status.kind === 'story' ? mdiCheck : mdiDeleteOutline,
      status.text,
      this._haWord(ctx, 'ui.common.undo', 'history.undo'),
      this._undo,
    );
  }

  /**
   * Builds the context every schema builder reads.
   *
   * @returns Schema context for the current configuration
   */
  private get _ctx(): SchemaCtx {
    return this._ctxIn(this._workspace);
  }

  /**
   * The schema context for a scope, as `_ctx` builds it for the scope chosen.
   *
   * @param workspace - The scope
   * @returns Schema context
   */
  private _ctxIn(workspace: Workspace.EditorWorkspace): SchemaCtx {
    return this._ctxFor(
      this._config!,
      workspace,
      this.hass?.locale,
      this._heldModes(this._pending, workspace),
    );
  }

  /**
   * The mode choices held for a scope, by mode field name (`SchemaCtx.presentation`), kept while
   * equal so held text elsewhere leaves the context as it was.
   */
  private _heldModes = Helpers.memoizeLast(
    (pending: Readonly<Record<string, string>>, workspace: Workspace.EditorWorkspace): string => {
      const held: Record<string, string> = {};
      for (const name of Synthetic.MODE_FIELDS) {
        const value = pending[Routing.pendingKey(name, workspace)];
        if (value !== undefined) held[name] = value;
      }
      return JSON.stringify(held);
    },
  );

  /**
   * The schema context, made again only when the configuration, the workspace or Home
   * Assistant's locale moves, so a render that changed none of them hands every builder the same
   * context and reuses what it built (`field-index.ts` › `builtSchema`).
   */
  private _ctxFor = Helpers.memoizeLast(
    (
      rawConfig: Types.Config,
      workspace: Workspace.EditorWorkspace,
      locale: Types.Hass['locale'],
      held: string,
    ): SchemaCtx => {
      const config = Routing.workspaceConfig(rawConfig, workspace);
      // Shared has no layout of its own, so its panels are built as list — the base every
      // other view widens. `config.view` stays the card's real displayed view, because that
      // is the value the Card Displays control edits; see `baseViewForWorkspace`.
      const view = Workspace.baseViewForWorkspace(workspace);

      return {
        view,
        workspace,
        config,
        rawConfig,
        language: LanguageCodes.getEffectiveLanguage(config.language, locale),
        presentation: JSON.parse(held) as Record<string, string>,
      };
    },
  );

  /**
   * The `hass` a form is handed, and the feed it comes from (`hass-key.ts`).
   *
   * A form whose selectors read states or name the card's actions gets the live feed: Home
   * Assistant's action dropdown labels each option from its own string table, so the card's
   * `expand` action would otherwise render as a raw lowercase key, and `withCardActionLabels`
   * answers for it. Every other form gets the steady feed, which a new `hass` leaves as it was.
   *
   * @param schema - The form's schema
   * @param language - The editor's language
   * @returns The `hass`, and `live` or `steady` for the form's `data-hass`
   */
  private _feed(
    schema: ReadonlyArray<HaFormSchema>,
    language: string,
  ): readonly [Types.Hass | undefined, 'live' | 'steady'] {
    return HassKey.needsLiveHass(schema)
      ? [withCardActionLabels(this.hass, language), 'live']
      : [HassKey.steadyHass(this.hass, language), 'steady'];
  }

  /**
   * Builds the data object bound to a panel's form.
   *
   * @returns Form data
   */
  private _formData(): Record<string, unknown> {
    return this._formDataFor(this._config!, this._workspace, this._pending);
  }

  /** `Routing.workspaceFormData`, made again only when one of its three inputs moves. */
  private _formDataFor = Helpers.memoizeLast(Routing.workspaceFormData);

  /**
   * What a form input was last handed under a slot, for as long as what it is made from stays
   * equal; otherwise a new one, made and kept. Every render builds a form's schema, data and
   * callbacks afresh, and `ha-form` updates for every new object it is handed, so kept this way a
   * render updates only the forms whose inputs changed (backlog item 307).
   *
   * @param slot - Which form, and which of its inputs
   * @param from - What the input is made from, compared by value
   * @param make - Makes the input anew
   * @returns The input
   */
  private _keep<T>(slot: string, from: unknown, make: () => T): T {
    const kept = this._kept.get(slot);
    if (kept && Value.deepEqual(kept.from, from)) return kept.value as T;
    const value = make();
    this._kept.set(slot, { from, value });
    return value;
  }

  /**
   * `_keep` for a value made from nothing but itself: a value equal to the one kept under its
   * slot hands back the kept object.
   *
   * @param slot - Which form, and which of its inputs
   * @param value - The value as this render made it
   * @returns The kept value, or this one
   */
  private _intern<T>(slot: string, value: T): T {
    return this._keep(slot, value, () => value);
  }

  /**
   * A label callback, kept per language and path.
   *
   * @param language - The editor's language
   * @param path - The label path every field takes; else the one `ha-form` hands down
   * @returns The callback
   */
  private _labeler(language: string, path?: ReadonlyArray<string>) {
    return this._keep(
      `label.${path}`,
      language,
      () =>
        (schema: HaFormSchema, _data?: unknown, options?: { path?: string[] }): string =>
          EditorLocalize.computeLabel(language, schema, path ?? options?.path ?? []),
    );
  }

  /**
   * A helper callback for a form above the pages: each field's helper, kept per language and
   * layout.
   *
   * @param slot - Which form
   * @param ctx - Schema context
   * @returns The callback
   */
  private _helper(slot: string, ctx: SchemaCtx) {
    return this._keep(
      `${slot}.helper`,
      [ctx.language, ctx.view],
      () =>
        (node: HaFormSchema, options?: { path?: string[] }): string | undefined =>
          EditorLocalize.computeHelper(ctx.language, ctx.view, node, options?.path ?? [], true),
    );
  }

  /**
   * A lifted field's label and helper callbacks, with its state words where its control shows
   * them (`shown.ts` › `wordsPlace`), and its YAML option name before its helper while Show YAML
   * Option Names is on. Kept while what they read stays equal.
   *
   * @param slot - Which form
   * @param field - The field
   * @param ctx - Schema context
   * @param words - Its state words
   * @returns The two callbacks
   */
  private _fieldText(slot: string, field: IndexedField, ctx: SchemaCtx, words?: string) {
    const place = Shown.wordsPlace(field.node);
    const yaml = this._prefs.yaml
      ? this._string(ctx, 'search.yaml', { path: this._yamlPath(field, ctx) })
      : undefined;
    const helper =
      [yaml, words && place === 'helper' ? `${words}.` : undefined, fieldHelper(field, ctx)]
        .filter((part) => part !== undefined)
        .join(' ') || undefined;
    const label =
      words && place === 'label'
        ? `${fieldLabel(field, ctx.language)}${Summary.SUMMARY_SEPARATOR}${words}`
        : undefined;
    return this._keep(`${slot}.text`, [ctx.language, label, helper, field.labelPath], () => ({
      group:
        label !== undefined && Shown.wordsInGroup(field.node)
          ? label
          : fieldLabel(field, ctx.language),
      label: (node: HaFormSchema, _data?: unknown, options?: { path?: string[] }): string =>
        label !== undefined && node.name === field.node.name && 'selector' in node
          ? label
          : EditorLocalize.computeLabel(ctx.language, node, field.labelPath ?? options?.path ?? []),
      helper: (node: HaFormSchema): string | undefined =>
        node.name === field.node.name && 'selector' in node ? helper : undefined,
    }));
  }

  /**
   * The YAML option a field writes, where this scope writes it: `time_grid.event_font_size`.
   *
   * @param field - The field
   * @param ctx - Schema context
   * @returns The path
   */
  private _yamlPath(field: IndexedField, ctx: SchemaCtx): string {
    const keys = field.configKeys;
    const key = keys.includes(field.node.name) ? field.node.name : (keys[0] ?? field.node.name);
    const { scope } = parseFieldId(field.id);
    const block =
      scope === 'calendar' || scope === 'button' || field.dataPath.length > 0
        ? undefined
        : Routing.destination(key, ctx.workspace ?? ctx.view);
    return [...(block ? [block] : field.dataPath), key].join('.');
  }

  /**
   * A helper callback for a calendar's or a toolbar button's form, kept per label path,
   * language, layout and kind of form.
   *
   * @param ctx - Schema context
   * @param path - The form's label path
   * @param entity - Whether it is a calendar's, whose helpers name the layouts a field applies to
   * @returns The callback
   */
  private _subformHelper(ctx: SchemaCtx, path: ReadonlyArray<string>, entity: boolean) {
    const { language, view } = ctx;
    return this._keep(
      `helper.${path}`,
      [language, view, entity],
      () =>
        (schema: HaFormSchema): string | undefined =>
          EditorLocalize.computeSubformHelper(
            language,
            view,
            schema,
            path,
            entity ? ViewConfig.entityScopeFor(schema.name) : undefined,
          ),
    );
  }

  /**
   * Folds a form change into the configuration, for the owner the form was drawn for, as one
   * undo step named after the field that moved. Typing in a text or number field joins the step
   * before it (`history.ts`).
   *
   * @param frame - Owner, workspace, schema and baseline captured when this form was rendered
   * @param event - The form's `value-changed`
   * @param labelPath - The label path the form's fields take
   * @param focusKey - What Undo and Redo focus: the field's wrapper, or the owner's panel
   * @param owner - The calendar or button the form belongs to, by name
   */
  private _valueChanged(
    frame: WriteFrames.OwnedFrame,
    event: CustomEvent,
    labelPath?: ReadonlyArray<string>,
    focusKey?: string,
    owner?: string,
  ): void {
    event.stopPropagation();

    const incoming = event.detail?.value as Record<string, unknown> | undefined;
    if (!incoming) return;
    const [path] = WriteFrames.writeSet(frame, incoming);
    const moved =
      path === undefined
        ? undefined
        : [...Routing.workspaceFields(frame.schema)].find(
            (field) => [...field.path, field.node.name].join('.') === path.join('.'),
          );
    const ctx = this._ctx;
    const setting = moved
      ? EditorLocalize.computeLabel(ctx.language, moved.node, labelPath ?? moved.labelPath)
      : '';
    const label =
      owner === undefined
        ? this._string(ctx, 'history.change', { setting })
        : this._string(ctx, 'history.change_for', { setting, name: owner });
    const typed = moved && ('text' in moved.node.selector || 'number' in moved.node.selector);
    this._commit(
      label,
      // By owner as well: two entries' pages give the same field the same focus key.
      typed
        ? `${WriteFrames.ownerKey(frame.owner)}|${focusKey}|${path!.join('.')}|${frame.workspace}`
        : undefined,
      () => this._writeOwned(frame, incoming),
      focusKey,
    );
    // A setting edited this session stays where it is, even once its value is cleared: a box
    // emptied to type anew must not leave the page under the cursor.
    if (focusKey?.startsWith('field:') && frame.owner.kind !== 'button') {
      const id = focusKey.slice('field:'.length);
      const added = frame.owner.kind === 'entry' ? `entry:${frame.owner.key}:${id}` : id;
      if (!this._added.has(added)) this._added = new Set([...this._added, added]);
    }
  }

  /**
   * Writes a change for the owner its frame names, as every form and every control the editor
   * draws itself does: the card's through the frame's workspace, an entry's or a button's over
   * that owner as it stands now (`write-frames.ts`). An entry or a button that has left the card
   * since the frame was drawn writes nothing.
   *
   * @param frame - The frame of what sent the change
   * @param incoming - Its whole data, as it sent it
   */
  private _writeOwned(frame: WriteFrames.OwnedFrame, incoming: Record<string, unknown>): void {
    if (!this._config) return;
    if (frame.owner.kind === 'card') {
      this._writeCard(frame, incoming);
      return;
    }

    const result = WriteFrames.applyOwnedChange(
      this._writeState(),
      frame,
      incoming,
      this.hass ?? undefined,
    );
    if (result === undefined) return;
    if (frame.owner.kind === 'button') {
      this._writeButtons(Buttons.writtenButtons(result.config));
      return;
    }
    if (!this._prepareForWrite()) return;
    this._config = { ...this._config, entities: result.config.entities };
    this._report(this._config);
  }

  /**
   * Folds a change to the card's own settings into the configuration and reports it.
   *
   * @param frame - Workspace, schema and baseline captured when the form was rendered
   * @param incoming - The form's whole data, as it sent it
   */
  private _writeCard(frame: WriteFrames.OwnedFrame, incoming: Record<string, unknown>): void {
    if (!this._prepareForWrite()) return;
    const previousConfig = this._config!;
    const applied = WriteFrames.applyOwnedChange(this._writeState(), frame, incoming)!;

    const changed = new Set(
      Value.changedKeys(
        previousConfig as unknown as Record<string, unknown>,
        applied.config as unknown as Record<string, unknown>,
      ),
    );
    for (const { node, path } of Routing.workspaceFields(frame.schema)) {
      if (path.length > 0) continue;
      for (const key of Synthetic.configKeysForField(node.name)) {
        if (!changed.has(key) || Routing.destination(key, frame.workspace) !== undefined) continue;
        if (Object.prototype.hasOwnProperty.call(applied.config, key))
          this._authoredRootKeys.add(key);
        else this._authoredRootKeys.delete(key);
        // A later meaningful Shared edit supersedes this key's earlier Grid reset.
        this._gridResetKeys.delete(key);
      }
    }
    if (this._viewForConfig(previousConfig) !== this._viewForConfig(applied.config)) {
      this._gridReconciliation =
        applied.config.view === 'grid'
          ? Value.gridReconciliationKeys(
              previousConfig,
              this._authoredRootKeys,
              this._gridResetKeys,
            )
          : [];
    }
    this._config = applied.config;
    this._pending = applied.pending;

    if (changed.size === 0) return;
    this._report(applied.config);
  }

  /**
   * Writes one field of an owner as a control the editor draws itself writes it: from the owner's
   * data as it stands now, through the writer the owner's own forms use, so routing, synthetic
   * fields, held text and authorship stay one mechanism per owner, and a calendar's or a button's
   * control writes to that calendar or button, never to the card.
   *
   * @param owner - Whose field
   * @param fieldId - The field's id (`field-index.ts`), as the owner draws it now
   * @param value - Its new value
   * @param workspace - The scope the control was drawn for, where a change can arrive after
   * another scope was chosen; the scope now otherwise
   */
  private _writeFieldValue(
    owner: WriteFrames.WriteOwner,
    fieldId: FieldId,
    value: unknown,
    workspace?: Workspace.EditorWorkspace,
  ): void {
    this._writeFieldValues(owner, { [fieldId]: value }, workspace);
  }

  /**
   * Writes several fields of one owner as one change, in the order given (`_writeFieldValue`).
   * Writes nothing for an entry or a button that has left, or for a field it has none of.
   *
   * @param owner - Whose fields
   * @param values - New values, by field id
   * @param workspace - The scope the control was drawn for (`_writeFieldValue`)
   */
  private _writeFieldValues(
    owner: WriteFrames.WriteOwner,
    values: Readonly<Record<FieldId, unknown>>,
    workspace?: Workspace.EditorWorkspace,
  ): void {
    if (!this._config) return;
    const ctx = this._ctx;
    const ids = Object.keys(values);
    const fields = ids.map((id) => this._fieldOf(owner, id, ctx));
    if (!fields.every((field): field is WriteFrames.WrittenField => field !== undefined)) return;
    const frame = WriteFrames.frameFor(
      owner,
      fields,
      this._writeState(),
      workspace ?? ctx.workspace ?? ctx.view,
    );
    if (frame === undefined) return;
    this._writeOwned(
      frame,
      fields.reduce(
        (data, field, at) => WriteFrames.withValue(data, field, values[ids[at]]),
        frame.data,
      ),
    );
  }

  /**
   * One of an owner's fields, by id: for the card, as its panel draws it now, so a field the
   * configuration gates off cannot be written; for an entry or a button, as every one of them
   * declares it, whatever the entry's own choices leave drawn.
   *
   * @param owner - Whose field
   * @param id - The field's id
   * @param ctx - Schema context
   * @returns The field; undefined where the owner has none by that id
   */
  private _fieldOf(
    owner: WriteFrames.WriteOwner,
    id: FieldId,
    ctx: SchemaCtx,
  ): WriteFrames.WrittenField | undefined {
    // An id's scope names the kind of owner that draws it: a panel's id for the card.
    const scope = id.slice(0, id.indexOf(':'));
    const panel = owner.kind === 'card' ? PANELS.find((each) => each.id === scope) : undefined;
    const schema =
      panel !== undefined
        ? builtSchema(panel, ctx)
        : owner.kind === 'entry' && scope === 'calendar'
          ? buildEntitySchema(ctx)
          : owner.kind === 'button' && scope === 'button'
            ? buildToolbarButtonSchema()
            : [];
    for (const { node, path } of Routing.workspaceFields(schema)) {
      if (`${scope}:${[...path, node.name].join('.')}` === id) {
        return { node, dataPath: path, lifted: Routing.nestedSchema(node, path) };
      }
    }
    return undefined;
  }

  /**
   * An entry, by its key.
   *
   * @param key - The entry's key
   * @returns The entry as stored; undefined once it has left the card
   */
  private _entryOf(key: number): string | Types.EntityConfig | undefined {
    const entities = this._config?.entities ?? [];
    return entities[this._entryKeysFor(entities.length).indexOf(key)];
  }

  /** Makes a key for an entry the list did not hold. */
  private _mintEntryKey = (): number => this._nextEntryKey++;

  /**
   * The entries' keys, kept by place for a list whose length moved without the editor moving
   * them: every way the editor itself writes the list moves the keys with it.
   *
   * @param length - How many entries the list holds
   * @returns A key per entry, in order
   */
  private _entryKeysFor(length: number): number[] {
    if (this._entryKeys.length !== length) {
      this._entryKeys = WriteFrames.keysByPosition(this._entryKeys, length, this._mintEntryKey);
    }
    return this._entryKeys;
  }

  /**
   * Moves the entries' keys onto a list rebuilt from the one held now a calendar at a time, as
   * Quick Setup rebuilds it (`write-frames.ts` › `carryEntryKeys`).
   *
   * @param next - The list as it will be
   */
  private _carryEntryKeys(next: ReadonlyArray<string | Types.EntityConfig>): void {
    this._entryKeys = WriteFrames.carryEntryKeys(
      this._config?.entities ?? [],
      this._entryKeys,
      next,
      this._mintEntryKey,
    );
  }

  /**
   * What a write reads of the editor (`write-frames.ts`).
   *
   * @returns The state
   */
  private _writeState(): WriteFrames.WriteState {
    const config = this._config!;
    return {
      config,
      pending: this._pending,
      authoredRootKeys: this._authoredRootKeys,
      gridResetKeys: this._gridResetKeys,
      entryKeys: this._entryKeysFor((config.entities ?? []).length),
      buttonKeys: this._buttonKeysFor(Buttons.writtenButtons(config).length),
    };
  }

  /**
   * Tells Home Assistant what the configuration now is, when it has moved.
   *
   * @param config - Merged configuration after the edit
   */
  private _report(config: Types.Config): void {
    const stored = Value.toStoredConfig(config, this._authoredRootKeys, this._rawConfig);

    // A pruned override must stop owning its value locally too, before any HA echo.
    this._adopt(stored);

    if (Value.equalConfigs(stored, this._lastDispatched ?? {})) {
      return;
    }

    this._send(stored);
  }

  /**
   * Makes a configuration the editor's own: the YAML as a copy, and the configuration with every
   * default under it, its calendars always a list.
   *
   * @param raw - The YAML
   * @param merged - What the defaults are spread under; the copy of the YAML where omitted
   */
  private _adopt(raw: object, merged?: object): void {
    this._rawConfig = structuredClone(raw) as Record<string, unknown>;
    this._config = {
      ...Config.DEFAULT_CONFIG,
      ...((merged ?? this._rawConfig) as Types.Config),
    };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
  }

  /**
   * Sends Home Assistant a configuration, remembered so its echo reads as the editor's own.
   *
   * @param config - The configuration
   */
  private _send(config: Record<string, unknown>): void {
    this._lastDispatched = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config } }));
  }

  /**
   * Resolves option labels that a selector asks Home Assistant to translate.
   *
   * @param key - Translation key the selector asked for
   * @returns The resolved string, or `undefined` to defer
   */
  private _localizeValue = (key: string): string | undefined =>
    EditorLocalize.lookup(this._ctx.language, key);

  /**
   * A field's one-field schema, offering a value from YAML as an option of its own where the
   * field is a dropdown none of whose options holds it (`audit.ts` › `withYamlOption`), so the
   * value shows, "monthly (From YAML)", and stays until another is chosen.
   *
   * @param field - The field
   * @param data - The form data it reads from
   * @param ctx - Schema context
   * @returns The schema
   */
  private _yamlSchema(
    field: IndexedField,
    data: Record<string, unknown>,
    ctx: SchemaCtx,
  ): ReadonlyArray<HaFormSchema> {
    const value = Routing.atPath(data, field.dataPath, field.node.name);
    if (!Audit.outsideOptions(field.node, value)) return field.lifted;
    const label = this._string(ctx, 'value.from_yaml', { value: String(value) });
    return Routing.nestedSchema(Audit.withYamlOption(field.node, value, label), field.dataPath);
  }

  /**
   * One field in a form of its own, inside the editor's own wrapper named after it: the one
   * place focus lands on a field, since nothing inside a form takes it.
   *
   * Every input the form is handed is kept while it is equal (PR 3's identity rules, carried to
   * lifted fields): the lifted schema is interned by the index, the data is the field's own
   * projection of the scope's data, and the label and helper callbacks resolve through the
   * label path the field had inside its panel, so every string key stays what it was.
   *
   * @param field - The field, as the index lifted it
   * @param ctx - Schema context
   * @param show - Its state words and the line under it
   * @returns The wrapper and its form
   */
  private _renderField(field: IndexedField, ctx: SchemaCtx, show?: FieldShow): TemplateResult {
    const colors = this._cardColors(ctx);
    const spec = colors.specs.get(field.id);
    if (spec !== undefined) {
      // A mode's value is drawn inside its mode's control where a page draws both; drawn alone
      // (What This Card Changes' Edit), the value is the control.
      const absorbed =
        show !== undefined &&
        spec.mode !== undefined &&
        field.id === spec.value &&
        this._drawing?.present.has(spec.mode) === true &&
        this._drawing.shown.has(spec.mode);
      return absorbed ? html`` : this._renderColorField(field, spec, colors, ctx, show);
    }
    const composed =
      field.id === START_DATE_FIELD
        ? this._renderStartDate(field, ctx, show)
        : field.id === OPENS_DETAILS_FIELD && Synthetic.eventTapReading(ctx.config) === 'other'
          ? this._renderTapLine(field, ctx, show)
          : field.id in Chips.CHIP_LABELS
            ? this._renderLoneChip(field, ctx)
            : field.id === LEGEND_FIELD
              ? html`${this._segmentedControl(field, ctx, show?.words)} ${show?.line ?? nothing}`
              : undefined;
    if (composed !== undefined) return this._jumpedCardField(field, ctx, composed);
    const workspace = ctx.workspace ?? ctx.view;
    const slot = `field.${workspace}.${field.id}`;
    // The scope's data, which What This Card Changes draws a line's field in whatever the scope.
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const schema = this._intern(slot, this._yamlSchema(field, all, ctx));
    const data = this._intern(`${slot}.data`, Routing.formDataFor(all, schema));
    const words = this._renderWords(WriteFrames.CARD_OWNER, field, all, ctx, slot, show);
    if (words !== undefined) return this._jumpedCardField(field, ctx, words);
    const [hass, feed] = this._feed(schema, ctx.language);
    const frame: WriteFrames.OwnedFrame = {
      owner: WriteFrames.CARD_OWNER,
      workspace,
      schema,
      data,
    };
    const text = this._fieldText(slot, field, ctx, show?.words);
    // Focus goes to a field's wrapper, never into its form.
    const wrapper = html`<div
      class="field"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${text.group}
    >
      ${keyed(
        // Keyed by scope as well: reusing a form would redirect its pending events into the
        // next scope's frame.
        workspace,
        html`<ha-form
          class="field-form"
          data-hass=${feed}
          .hass=${hass}
          .error=${this._patternError(slot, field, data, ctx)}
          .data=${data}
          .schema=${schema}
          .computeLabel=${text.label}
          .computeHelper=${text.helper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._valueChanged(frame, event, field.labelPath, `field:${field.id}`)}
        ></ha-form>`,
      )}
      ${this._wordToggle(WriteFrames.CARD_OWNER, field, data, ctx)} ${show?.line ?? nothing}
    </div>`;
    return this._jumpedCardField(field, ctx, wrapper);
  }

  /**
   * A card field as drawn, inside the group a search result opened it with where it is that one.
   *
   * @param field - The field
   * @param ctx - Schema context
   * @param wrapper - The field as drawn
   * @returns The field, inside the group where a result opened it
   */
  private _jumpedCardField(
    field: IndexedField,
    ctx: SchemaCtx,
    wrapper: TemplateResult,
  ): TemplateResult {
    const jump = this._jump;
    return jump?.target.kind === 'field' && jump.target.id === field.id
      ? this._jumpTo(ctx, wrapper)
      : wrapper;
  }

  /**
   * Start Date as the overview's radio chips: Today, Tomorrow, Start of Week, A Fixed Date and
   * Relative to Today, the last two revealing their field below. The chosen chip is the mode as
   * presented, so Relative to Today held over a shortcut stays chosen (`synthetic.ts` ›
   * `start_date_mode`). Each choice writes through the field, one undo step.
   *
   * @param field - The mode field
   * @param ctx - Schema context
   * @param show - Its state words and the line under it
   * @returns The chips
   */
  private _renderStartDate(field: IndexedField, ctx: SchemaCtx, show?: FieldShow): TemplateResult {
    const name = field.node.name;
    const workspace = ctx.workspace ?? ctx.view;
    // The scope's data, as the field's own form would read it wherever it is drawn.
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const value = String(Routing.formDataFor(all, field.lifted)[name] ?? '');
    const selector = field.node.selector;
    const options = 'select' in selector ? (selector.select?.options ?? []) : [];
    const label = fieldLabel(field, ctx.language);
    const text = this._fieldText(`field.${workspace}.${field.id}`, field, ctx, show?.words);
    // Drawn alone (What This Card Changes' Edit), the chips bring the field their choice reveals,
    // which a page draws beside them.
    const revealed =
      value === 'fixed'
        ? 'content:start_date_fixed'
        : value === 'offset'
          ? 'content:start_date_offset'
          : undefined;
    const reveal =
      show === undefined && revealed !== undefined
        ? buildFieldIndex(ctx).fields.get(revealed)
        : undefined;
    return Overview.radioChips(
      field.id,
      name,
      { name: text.group, legend: text.label(field.node), helper: text.helper(field.node) },
      options.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      ),
      value,
      reveal === undefined ? (show?.line ?? nothing) : this._renderField(reveal, ctx),
      (mode) =>
        this._commit(
          this._string(ctx, 'history.change', { setting: label }),
          undefined,
          () => this._writeFieldValue(WriteFrames.CARD_OWNER, field.id, mode, workspace),
          `field:${field.id}`,
        ),
    );
  }

  /**
   * The line Tapping an Event Opens It gives way to while another action is stored, "Tapping an
   * Event: Navigate", and Change, which opens Taps & Refresh at Event Tap Action. The switch would
   * read that action as off, and turning it on or off would replace an action it never wrote.
   *
   * @param field - The switch's field
   * @param ctx - Schema context
   * @param show - Its state words and the line under it
   * @returns The line
   */
  private _renderTapLine(field: IndexedField, ctx: SchemaCtx, show?: FieldShow): TemplateResult {
    const stored = ctx.config.event_tap_action;
    const action =
      this._describe({ node: { name: 'event_tap_action', selector: { ui_action: {} } } }, stored) ??
      String(stored?.action ?? '');
    return Overview.tapLine(
      field.id,
      this._t(ctx),
      action,
      show?.words,
      show?.line ?? nothing,
      () => this._openField('taps_refresh', 'actions:event_tap_action', 'tap:change'),
    );
  }

  /**
   * Opens a page at one of its fields: the page as a row opens it, then the field brought to the
   * top and focused on its wrapper.
   *
   * @param page - The page
   * @param id - The field
   * @param focusKey - The `data-focus` key of the control that opened it, which Back restores
   */
  private _openField(page: PageId, id: FieldId, focusKey: string): void {
    this._open({ kind: 'page', page }, focusKey);
    void this.updateComplete.then(() => {
      const target = this.renderRoot.querySelector<HTMLElement>(`[data-field="${CSS.escape(id)}"]`);
      if (target === null) return;
      Focus.scrollToTop(this, target);
      target.focus();
    });
  }

  /**
   * Which word list a choice or a draft is kept for: its owner and its field.
   *
   * @param owner - Whose list
   * @param field - The field
   * @returns The key
   */
  private _wordKey(owner: WriteFrames.WriteOwner, field: IndexedField): string {
    return `${WriteFrames.ownerKey(owner)}|${field.id}`;
  }

  /**
   * The terms a word list's stored value reads as, as its form shows them.
   *
   * @param value - The stored value
   * @returns The terms; undefined for a pattern, which stays one
   */
  private _wordsOf(value: unknown): ReadonlyArray<string> | undefined {
    if (value === undefined || value === null) return [];
    return typeof value === 'string' ? WordLists.fromPattern(value) : undefined;
  }

  /**
   * A word list as one term at a time (section 5.9): Home Assistant's text selector with
   * `multiple`, while the stored value is empty or reads as plain terms and Use a Pattern has not
   * been chosen. Terms are written as one pattern (`word-lists.ts` › `toPattern`), so an empty list
   * writes an empty one, which deletes a calendar's line.
   *
   * @param owner - Whose list
   * @param field - The field
   * @param data - The owner's form data
   * @param ctx - Schema context
   * @param slot - The field's form slot
   * @param show - Its state words and the line under it
   * @param ownerName - The calendar's name, for the undo label
   * @returns The field; undefined where it is drawn as a pattern
   */
  private _renderWords(
    owner: WriteFrames.WriteOwner,
    field: IndexedField,
    data: Readonly<Record<string, unknown>>,
    ctx: SchemaCtx,
    slot: string,
    show?: FieldShow,
    ownerName?: string,
  ): TemplateResult | undefined {
    if (!WORD_LIST_FIELDS.has(field.id) || field.dataPath.length > 0) return undefined;
    const key = this._wordKey(owner, field);
    const name = field.node.name;
    const stored = data[name];
    const terms = this._wordsOf(stored);
    if (terms === undefined || this._wordModes.has(key)) return undefined;
    const draft = this._wordDrafts.get(key);
    const pattern = typeof stored === 'string' ? stored : '';
    const shown = draft !== undefined && WordLists.toPattern(draft) === pattern ? draft : terms;
    const schema = this._intern(`${slot}.words`, [
      { name, selector: { text: { multiple: true } } },
    ] satisfies HaFormSchema[]);
    const own = this._intern(`${slot}.words.data`, { [name]: [...shown] });
    const [hass, feed] = this._feed(schema, ctx.language);
    const label = fieldLabel(field, ctx.language);
    // Its label, helper and state words as the field's own form would carry them.
    const text = this._fieldText(`${slot}.words`, field, ctx, show?.words);
    const workspace = ctx.workspace ?? ctx.view;
    // The field's own frame, captured as its raw form's is, so an edit the form sends late is
    // written for the owner and scope it was drawn for.
    const lifted = this._intern(`${slot}.words.frame`, field.lifted);
    const frame: WriteFrames.OwnedFrame = {
      owner,
      workspace,
      schema: lifted,
      data: this._intern(`${slot}.words.frame.data`, Routing.formDataFor(data, lifted)),
    };
    return html`<div
      class="field"
      data-field=${field.id}
      data-composed="words"
      tabindex="-1"
      role="group"
      aria-label=${owner.kind === 'card' ? text.group : label}
    >
      ${keyed(
        workspace,
        html`<ha-form
          class=${owner.kind === 'card' ? 'field-form' : 'entity-form'}
          data-hass=${feed}
          .hass=${hass}
          .data=${own}
          .schema=${schema}
          .computeLabel=${text.label}
          .computeHelper=${text.helper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._wordsChanged(frame, field, event, label, ownerName)}
        ></ha-form>`,
      )}
      ${this._wordButton(key, 'pattern', this._string(ctx, 'word_list.use_pattern'))}
      ${show?.line ?? nothing}
    </div>`;
  }

  /**
   * Use Words under a word list drawn as a pattern, offered only while that pattern reads as
   * plain terms.
   *
   * @param owner - Whose list
   * @param field - The field
   * @param data - Its form's data
   * @param ctx - Schema context
   * @returns The button, or nothing
   */
  private _wordToggle(
    owner: WriteFrames.WriteOwner,
    field: IndexedField,
    data: Readonly<Record<string, unknown>>,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    if (!WORD_LIST_FIELDS.has(field.id)) return nothing;
    if (this._wordsOf(data[field.node.name]) === undefined) return nothing;
    return this._wordButton(
      this._wordKey(owner, field),
      'words',
      this._string(ctx, 'word_list.use_words'),
    );
  }

  /**
   * Use a Pattern or Use Words: switches a word list's presentation for the session, writing
   * nothing, and keeps focus on the button that takes its place.
   *
   * @param key - The list (`_wordKey`)
   * @param to - The presentation it switches to
   * @param text - Its label
   * @returns The button
   */
  private _wordButton(key: string, to: 'pattern' | 'words', text: string): TemplateResult {
    const focus = `words:${key}`;
    return html`<button
      type="button"
      class="text-button word-mode"
      data-focus=${focus}
      @click=${() => {
        const modes = new Map(this._wordModes);
        if (to === 'pattern') modes.set(key, 'pattern');
        else modes.delete(key);
        this._wordModes = modes;
        void this.updateComplete.then(() =>
          this.renderRoot.querySelector<HTMLElement>(Focus.byFocusKey(focus))?.focus(),
        );
      }}
    >
      ${text}
    </button>`;
  }

  /**
   * A word list's terms, written as one pattern: coalesced like typing, so a word typed is one
   * undo step. The terms are kept as sent, so a term just added stays shown while it is empty.
   * A plain value, as a text field without `multiple` would send, is written as the pattern it is.
   *
   * @param frame - The field's frame, as drawn
   * @param field - The field
   * @param event - The form's `value-changed`
   * @param setting - The field's label, for the undo label
   * @param ownerName - The calendar's name, for the undo label
   */
  private _wordsChanged(
    frame: WriteFrames.OwnedFrame,
    field: IndexedField,
    event: CustomEvent,
    setting: string,
    ownerName?: string,
  ): void {
    const { owner, workspace } = frame;
    event.stopPropagation();
    const incoming = event.detail?.value as Record<string, unknown> | undefined;
    if (!incoming) return;
    const value = incoming[field.node.name];
    const key = this._wordKey(owner, field);
    const drafts = new Map(this._wordDrafts);
    let pattern: string;
    if (Array.isArray(value)) {
      const terms = value.map((term) => (typeof term === 'string' ? term : String(term ?? '')));
      drafts.set(key, terms);
      pattern = WordLists.toPattern(terms);
    } else {
      drafts.delete(key);
      pattern = typeof value === 'string' ? value : '';
    }
    this._wordDrafts = drafts;
    const ctx = this._ctx;
    const label =
      ownerName === undefined
        ? this._string(ctx, 'history.change', { setting })
        : this._string(ctx, 'history.change_for', { setting, name: ownerName });
    this._commit(
      label,
      `${key}|words|${workspace}`,
      () => this._writeOwned(frame, WriteFrames.withValue(frame.data, field, pattern)),
      `field:${field.id}`,
    );
    // Edited this session, so it stays where it is once its last term is removed, as any
    // field's form keeps it (`_valueChanged`).
    const added = owner.kind === 'entry' ? `entry:${owner.key}:${field.id}` : field.id;
    if (!this._added.has(added)) this._added = new Set([...this._added, added]);
  }

  /**
   * The field a result opened, with Return to Results above it while the results can be
   * returned to, highlighted while it is lit.
   *
   * @param ctx - Schema context
   * @param body - The field, or the forms holding it
   * @returns The group
   */
  private _jumpTo(ctx: SchemaCtx, body: unknown): TemplateResult {
    return html`<div class="jump${this._jump?.lit ? ' jumped' : ''}">
      ${this._renderReturn(ctx)} ${body}
    </div>`;
  }

  /**
   * Whether the field a result opened is still drawn where it opened, so Return to Results goes
   * above it rather than at the top. A jump ends as the editor moves, so where it opened is here.
   *
   * @returns `true` while it is
   */
  private _jumpDrawn(): boolean {
    const target = this._jump?.target;
    if (target === undefined) return false;
    if (target.kind === 'entry-field') {
      // Still the entry's, and still drawn on its page: another of its fields can gate it off,
      // and Essentials Only or Customized Only can take it away.
      const ctx = this._ctx;
      const drawn = this._entrySchemas(this._entrySubform(ctx), ctx).find(
        ({ key }) => key === target.key,
      );
      return drawn !== undefined && entityFieldIndex(drawn.schema).fields.has(target.id);
    }
    if (target.kind === 'button-field') return this._buttonKeys.includes(target.key);
    return this._drawing!.shown.has(target.id) && this._drawing!.present.has(target.id);
  }

  /**
   * Whether a result opened a field of one calendar entry or one toolbar button.
   *
   * @param kind - Whose field
   * @param key - The entry's or button's key
   * @returns `true` for the one a result opened
   */
  private _jumpsTo(kind: 'entry-field' | 'button-field', key: number): boolean {
    const target = this._jump?.target;
    return target?.kind === kind && target.key === key;
  }

  /**
   * Return to Results, wherever a result left them: Back from a page reached from the results,
   * or the overview's own Back while a result shows a field there.
   *
   * @param ctx - Schema context
   * @returns The button, or nothing where there are no results to return to
   */
  private _renderReturn(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const returnable =
      this._nav.route.kind === 'overview' ? this._resultsLeft !== undefined : this._nav.fromResults;
    return returnable
      ? SearchView.returnButton(this._string(ctx, 'search.return'), this._back)
      : nothing;
  }

  /**
   * What the shown set is computed from, for the card in this scope (`plan.ts`).
   *
   * @param ctx - Schema context
   * @returns The context
   */
  private _planCtx(ctx: SchemaCtx): Plan.PlanCtx {
    const workspace = ctx.workspace ?? ctx.view;
    return {
      workspace,
      config: this._config!,
      raw: this._rawConfig,
      present: this._drawing!.index,
      // Ids and structure only; labels and values are worded from `ctx.language`'s own fields.
      universe: universeIndex('en', workspace),
      added: this._added,
      showEverySetting: this._prefs.every,
      pending: this._pending,
      entryKeys: this._entryKeysFor((this._config!.entities ?? []).length),
    };
  }

  /**
   * A layout's name, as Settings For words it: "Grid", "All Layouts".
   *
   * @param ctx - Schema context
   * @returns The namer
   */
  private _layoutName(ctx: SchemaCtx): Shown.LayoutName {
    return (view) => this._string(ctx, `editing_workspace.option.${view}.label`);
  }

  /**
   * Words a field's value as its control shows it, for a state line, a Reset outcome or a stored
   * line.
   *
   * @param field - The field
   * @param ctx - Schema context
   * @returns The words
   */
  private _wordOf(field: IndexedField, ctx: SchemaCtx): Shown.WordValue {
    return (value) =>
      Summary.wordValue(field, value, ctx.language, this._describe) ??
      (value === undefined || value === null ? this._string(ctx, 'search.not_set') : String(value));
  }

  /**
   * The added-set key for a field or a family on a page of an owner.
   *
   * @param id - Field id, or `family:<id>`
   * @param owner - The card, or a calendar entry
   * @returns The key
   */
  private _addedKey(id: string, owner: PlanOwner): string {
    return owner.kind === 'entry' ? `entry:${owner.key}:${id}` : id;
  }

  /**
   * Reset or Remove for a live field, worked out by `plan.ts` › `resetAction` once for each state
   * of the editor, since it builds the fields the reset would leave.
   *
   * @param id - Field id
   * @param appearance - How its page shows it
   * @param pctx - Plan context, the entry's on an entry page
   * @param owner - The card, or a calendar entry
   * @returns `reset`, `remove`, or `undefined`
   */
  private _resetActionOf(
    id: FieldId,
    appearance: Appearance,
    pctx: Plan.PlanCtx,
    owner: PlanOwner,
  ): 'reset' | 'remove' | undefined {
    const from = [
      this._rawConfig,
      this._pending,
      pctx.workspace,
      this._added,
      this._prefs.every,
      this._entryKeys.join(),
    ];
    if (!this._actions || this._actions.from.some((each, at) => each !== from[at])) {
      this._actions = { from, map: new Map() };
    }
    const key = `${this._addedKey(id, owner)}`;
    const map = this._actions.map;
    if (!map.has(key)) map.set(key, Plan.resetAction(id, appearance, pctx, this._writeState()));
    return map.get(key) as 'reset' | 'remove' | undefined;
  }

  /**
   * What a live field shows besides its control (section 5.3): its state words, and under it
   * what they leave out, what Reset gives, and Reset or Remove.
   *
   * @param field - The field
   * @param appearance - How its page shows it
   * @param pctx - Plan context, the entry's on an entry page
   * @param ctx - Schema context
   * @param owner - The card, or a calendar entry
   * @param heading - The heading's key, whose Add row or title takes focus after a Remove
   * @returns What it shows
   */
  private _fieldShow(
    field: IndexedField,
    appearance: Appearance,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
    owner: PlanOwner,
    heading?: string,
  ): FieldShow {
    const t = this._t(ctx);
    const layout = this._layoutName(ctx);
    const word = this._wordOf(field, ctx);
    const state = Plan.stateOf(field, pctx);
    const words = Shown.stateText(state, t, layout, word);
    const label = fieldLabel(field, ctx.language);
    const notes: Array<{ text: string; button?: ShownView.LineButton }> = [];
    const ignored = Shown.ignoredText(state, t, layout, word);
    if (ignored) notes.push({ text: ignored });
    for (const own of state?.layoutsOwn ?? []) {
      notes.push({
        text: t('state.layout_own', {
          layout: layout(own.view),
          value: word(own.value),
        }),
        button: this._editLayout(t, layout, label, field.id, own.view),
      });
    }
    const calendars =
      state?.calendars === undefined
        ? undefined
        : {
            label: t('state.set_on_calendars'),
            links: state.calendars.map((key) => ({
              label: this._entryName(key),
              focus: `calendar-link:${field.id}:${key}`,
              onPress: () => this._open({ kind: 'entry', key }, `calendar-link:${field.id}:${key}`),
            })),
          };
    const outcomeText = Shown.outcomeText(Plan.resetOutcome(field, pctx), t, layout, word);
    const outcomeId = `outcome-${field.id.replace(/[^\w-]/g, '-')}`;
    const actions: ShownView.LineButton[] = [];
    if (state?.words?.kind === 'from-all-layouts') {
      actions.push(this._editLayout(t, layout, label, field.id, 'shared'));
    }
    // A family member keeps its control while the family shows; its heading's ✕ removes them all.
    const storedHere =
      owner.kind === 'entry'
        ? state?.words?.kind === 'set-entry'
        : Plan.storedAt(this._rawConfig, field, pctx.workspace);
    const action =
      typeof appearance === 'object' && 'family' in appearance
        ? storedHere
          ? 'reset'
          : undefined
        : this._resetActionOf(field.id, appearance, pctx, owner);
    if (action !== undefined) {
      const forLayout = state?.words?.kind === 'set-layout' ? layout(state.words.view) : undefined;
      actions.push({
        label: action === 'reset' ? t('reset.reset') : t('reset.remove'),
        name:
          action === 'reset'
            ? forLayout
              ? t('reset.reset_for', { label, layout: forLayout })
              : t('value_source.reset', { option: label })
            : interpolate(forLayout ? t('reset.remove_for') : t('reset.remove_named'), {
                label,
                layout: forLayout ?? '',
              }),
        focus: `${action}:${field.id}`,
        describedBy: outcomeText ? outcomeId : undefined,
        kind: action,
        resetKeys: this._storedKeys(field, pctx, owner),
        onPress: () => this._resetField(field, owner, action, label, heading),
      });
    }
    return {
      words,
      line: ShownView.fieldLine({
        stored: state?.words !== undefined && state.words.kind.startsWith('set'),
        notes,
        calendars,
        outcome: outcomeText && action ? { id: outcomeId, text: outcomeText } : undefined,
        actions,
      }),
    };
  }

  /**
   * A field's line button that edits it in another scope: "Edit for Grid".
   *
   * @param t - The editor's strings
   * @param layout - Names a layout
   * @param label - The field's label
   * @param id - The field
   * @param view - The scope to edit it in
   * @returns The button
   */
  private _editLayout(
    t: Translate,
    layout: Shown.LayoutName,
    label: string,
    id: FieldId,
    view: Workspace.EditorWorkspace,
  ): ShownView.LineButton {
    return {
      label: t('state.edit_layout', { layout: layout(view) }),
      name: t('state.edit_named', { label, layout: layout(view) }),
      focus: `edit:${id}:${view}`,
      onPress: () => this._pickScope(view),
    };
  }

  /**
   * The options a field stores where this page writes it, which its Reset deletes.
   *
   * @param field - The field
   * @param pctx - Plan context
   * @param owner - The card, or a calendar entry
   * @returns The options, space-separated
   */
  private _storedKeys(field: IndexedField, pctx: Plan.PlanCtx, owner: PlanOwner): string {
    if (owner.kind === 'entry') return field.configKeys.join(' ');
    return field.configKeys
      .filter((key) =>
        Plan.storedAt(this._rawConfig, { ...field, configKeys: [key] }, pctx.workspace),
      )
      .join(' ');
  }

  /**
   * Draws the headings of a page or of a calendar entry's page from their plans: each heading's
   * title and line, its live fields in registry order, its Add row, its gate lines and the values
   * stored for settings that are not in use (section 5.2). A heading with none of these, and
   * nothing else to draw, is left out.
   *
   * @param plans - The headings' plans
   * @param pctx - Plan context, the entry's on an entry page
   * @param ctx - Schema context
   * @param owner - The card, or a calendar entry
   * @param present - The fields built here
   * @param data - Form data the gates read
   * @param draw - Draws one live field
   * @param extra - What a heading draws besides its fields
   * @param topTitle - The name a page's unheaded top run goes by in its Add row
   * @returns The headings
   */
  private _renderHeadings(
    plans: ReadonlyArray<Plan.HeadingPlan>,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
    owner: PlanOwner,
    present: ReadonlyMap<FieldId, IndexedField>,
    data: { card: Record<string, unknown>; entry?: Record<string, unknown> },
    draw: (field: IndexedField, show: FieldShow) => unknown,
    extra: (heading: HeadingDef) => unknown,
    topTitle: string,
  ): unknown[] {
    const t = this._t(ctx);
    // Labels resolve through `ctx.language` whichever index a field comes from.
    const known = (id: FieldId): IndexedField | undefined =>
      present.get(id) ?? pctx.universe.fields.get(id);
    const labelOf = (id: FieldId): string => {
      const field = known(id);
      return field ? fieldLabel(field, ctx.language) : id;
    };
    return plans.flatMap((plan) => {
      const { heading } = plan;
      const title = this._headingTitle(heading, ctx);
      const name = title ?? topTitle;
      const more = extra(heading);
      // The chips of one kind are drawn together where the first of them is placed, and Calendar
      // Filter as its radio group (section 5.9); every other field in a form of its own.
      const grouped = new Set<string>();
      const live = plan.live.flatMap(({ id, appearance }) => {
        if (typeof appearance === 'object' && 'chips' in appearance) {
          if (grouped.has(appearance.chips)) return [];
          grouped.add(appearance.chips);
          return [
            keyed(
              `chips:${appearance.chips}`,
              this._renderChips(appearance.chips, heading, pctx, ctx),
            ),
          ];
        }
        const field = present.get(id);
        if (field !== undefined && appearance === 'segmented') {
          return [
            keyed(`:${id}`, this._renderSegmented(field, appearance, pctx, ctx, heading.key)),
          ];
        }
        return field
          ? [
              keyed(
                `${owner.kind === 'entry' ? owner.key : ''}:${id}`,
                draw(field, this._fieldShow(field, appearance, pctx, ctx, owner, heading.key)),
              ),
            ]
          : [];
      });
      const addKey = `add:${heading.key ?? 'top'}`;
      const helper =
        heading.helperKey === undefined ? undefined : this._string(ctx, heading.helperKey);
      const crossLink = this._crossLink(heading, ctx);
      // Where the title and the Add row would stack with nothing between, the row carries the
      // title in place of the heading.
      const named =
        live.length === 0 && more === nothing && helper === undefined && crossLink === undefined;
      const add =
        plan.add.length === 0 || this._prefs.every
          ? nothing
          : this._renderAddRow(plan, addKey, name, named, owner, ctx, known);
      // One line per condition waited on: the names still to come, else the line alone with the
      // stored values after it.
      const byWhen = new Map<string, { names: string[]; held: number }>();
      const when = (gate: Plan.HeadingPlan['gated'][number]['gate']): string =>
        whenText(gate, data, ctx.language, labelOf) ?? '';
      // A chip a gate withholds says why on itself ("Needs Time"), so no gate line names it.
      const isChip = (id: FieldId): boolean => {
        const appearance = Plan.appearanceOf(id);
        return typeof appearance === 'object' && 'chips' in appearance;
      };
      for (const each of plan.gated) {
        if (isChip(each.id)) continue;
        const clause = when(each.gate);
        const line = byWhen.get(clause) ?? { names: [], held: 0 };
        line.names.push(labelOf(each.id));
        byWhen.set(clause, line);
      }
      for (const each of plan.inactive) {
        if (each.gate.kind !== 'gate' || isChip(each.id)) continue;
        const clause = when(each.gate);
        const line = byWhen.get(clause) ?? { names: [], held: 0 };
        line.held += 1;
        byWhen.set(clause, line);
      }
      const gateLines = [...byWhen].map(([clause, line]) =>
        line.names.length > 0
          ? t('gate.line', { when: clause, names: line.names.join(', ') })
          : t('gate.line_bare', { when: clause }),
      );
      const inactive = plan.inactive.flatMap((each) => {
        const field = known(each.id);
        if (field === undefined) return [];
        const label = fieldLabel(field, ctx.language);
        // A dropdown's value in this language's words: the universe in it holds its options.
        const worded = universeIndex(ctx.language, pctx.workspace).fields.get(each.id) ?? field;
        const value = this._wordOf(
          worded,
          ctx,
        )(
          owner.kind === 'entry'
            ? data.entry?.[parseFieldId(field.id).name]
            : Routing.atPath(
                each.source === 'here'
                  ? data.card
                  : Routing.workspaceFormData(this._config!, 'shared', this._pending),
                field.dataPath,
                field.node.name,
              ),
        );
        const top = each.source === 'all-layouts';
        return [
          {
            text: interpolate(top ? t('inactive.line_top') : t('inactive.line'), { label, value }),
            button: top
              ? this._editLayout(t, this._layoutName(ctx), label, field.id, 'shared')
              : {
                  label: t('reset.reset'),
                  name: t('value_source.reset', { option: label }),
                  focus: `reset:${field.id}`,
                  kind: 'reset' as const,
                  resetKeys: this._storedKeys(field, pctx, owner),
                  onPress: () => this._resetField(field, owner, 'reset', label, heading.key),
                },
          },
        ];
      });
      if (live.length === 0 && add === nothing && gateLines.length === 0 && inactive.length === 0) {
        if (more === nothing) return [];
      }
      const family = this._liveFamily(plan);
      return [
        PageView.headingBlock({
          title: named && add !== nothing ? undefined : title,
          key: heading.key,
          helper,
          crossLink,
          action:
            family === undefined
              ? undefined
              : ShownView.lineButton({
                  label: t('reset.remove'),
                  name: t('reset.remove_named', {
                    label: this._string(ctx, FAMILIES[family].titleKey),
                  }),
                  focus: `remove-family:${family}`,
                  kind: 'remove',
                  onPress: () => this._removeFamily(family, owner, ctx, heading.key),
                }),
          body: html`${live} ${more} ${add} ${ShownView.gateLines(gateLines, inactive)}`,
        }),
      ];
    });
  }

  /**
   * The family a heading shows because it is stored or was added, which its ✕ removes.
   *
   * @param plan - The heading's plan
   * @returns The family, or `undefined`
   */
  private _liveFamily(plan: Plan.HeadingPlan): FamilyId | undefined {
    for (const { appearance, why } of plan.live) {
      if (typeof appearance === 'object' && 'family' in appearance) {
        if (why === 'stored' || why === 'added') return appearance.family;
      }
    }
    return undefined;
  }

  /**
   * A heading's Add row: closed, its settings named; open, one button per setting.
   *
   * @param plan - The heading's plan
   * @param key - The row's `data-focus` key
   * @param heading - The heading's name
   * @param named - Whether the row stands in for the heading: nothing live, no line between
   * @param owner - The card, or a calendar entry
   * @param ctx - Schema context
   * @param known - A field by id
   * @returns The row
   */
  private _renderAddRow(
    plan: Plan.HeadingPlan,
    key: string,
    heading: string,
    named: boolean,
    owner: PlanOwner,
    ctx: SchemaCtx,
    known: (id: FieldId) => IndexedField | undefined,
  ): TemplateResult {
    const t = this._t(ctx);
    const data = owner.kind === 'entry' ? undefined : this._formData();
    const items = plan.add.flatMap((item): ShownView.AddItem[] => {
      if (item.kind === 'family') {
        const family = FAMILIES[item.family];
        const added = this._addedKey(`family:${item.family}`, owner);
        return [
          {
            key: `family:${item.family}`,
            label: this._string(ctx, family.titleKey),
            helper: Shown.firstSentence(
              family.helperKey === undefined ? undefined : this._string(ctx, family.helperKey),
            ),
            onAdd: () =>
              this._addSettings([added], this._string(ctx, family.titleKey), item.ids[0], ctx),
          },
        ];
      }
      const field = known(item.id);
      if (field === undefined) return [];
      const label = fieldLabel(field, ctx.language);
      const value =
        data === undefined
          ? undefined
          : Summary.wordValue(
              field,
              Routing.atPath(data, field.dataPath, field.node.name),
              ctx.language,
              this._describe,
            );
      return [
        {
          key: item.id,
          label,
          helper: Shown.firstSentence(fieldHelper(field, ctx)),
          value,
          onAdd: () => this._addSettings([this._addedKey(item.id, owner)], label, item.id, ctx),
        },
      ];
    });
    const open = this._addOpen?.key === key;
    return ShownView.addRow(
      {
        key,
        heading,
        named,
        names: Shown.namesText(
          items.map((item) => item.label),
          t,
        ),
        items,
        open,
        query: open ? this._addOpen!.query : '',
        onToggle: () => {
          this._addOpen = open ? undefined : { key, query: '' };
        },
        onShowAll: () => {
          this._addSettings(
            items.map((item) => this._addedKey(item.key, owner)),
            undefined,
            plan.add[0].kind === 'field' ? plan.add[0].id : plan.add[0].ids[0],
            ctx,
            heading,
          );
          this._addOpen = undefined;
        },
        onQuery: (query) => {
          this._addOpen = { key, query };
        },
      },
      t,
    );
  }

  /** The card's color specs for a context (`colors.ts` › `cardColorFields`). */
  private _cardColors = Helpers.memoizeLast(Colors.cardColorFields);

  /** An entry's color specs for a context (`colors.ts` › `entryColorFields`). */
  private _entryColors = Helpers.memoizeLast(Colors.entryColorFields);

  /** The card's form data with nothing stored, for what a color field falls back to. */
  private _defaultData = Helpers.memoizeLast((workspace: Workspace.EditorWorkspace) =>
    Routing.workspaceFormData({ ...Config.DEFAULT_CONFIG } as Types.Config, workspace),
  );

  /**
   * Home Assistant's own name for a theme color, from its color picker's strings.
   *
   * @param token - A theme color token, `deep-purple`
   * @returns The name, or undefined where it has none
   */
  private _haColorName = (token: string): string | undefined => {
    const key = `${Colors.HA_COLOR_NAME_PREFIX}${token}`;
    const name = this.hass?.localize?.(key);
    return typeof name === 'string' && name !== '' && name !== key ? name : undefined;
  };

  /**
   * A card color field: its wrapper, the one place focus lands on it, and the composed control.
   *
   * @param field - The field drawn: the mode a control absorbs, else the color itself
   * @param spec - Its spec
   * @param colors - The card's color fields
   * @param ctx - Schema context
   * @returns The field
   */
  private _renderColorField(
    field: IndexedField,
    spec: Colors.ColorSpec,
    colors: Colors.ColorFields,
    ctx: SchemaCtx,
    show?: FieldShow,
  ): TemplateResult {
    const valueField = colors.fields.get(spec.value)!;
    const workspace = ctx.workspace ?? ctx.view;
    const configKey = valueField.configKeys[0] ?? valueField.node.name;
    const block =
      valueField.dataPath.length === 0 ? Routing.destination(configKey, workspace) : undefined;
    // Named for the mode it absorbs, as the page draws it, wherever it is drawn.
    const name = fieldLabel(colors.fields.get(spec.mode ?? field.id) ?? field, ctx.language);
    const wrapper = html`<div
      class="field color-field"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${name}
    >
      ${this._renderColor({
        owner: WriteFrames.CARD_OWNER,
        spec,
        ctx,
        name,
        valueField,
        // The scope's data, which What This Card Changes draws a line's field in whatever the scope.
        data: this._formDataFor(this._config!, workspace, this._pending),
        fallback: Routing.atPath(
          this._defaultData(workspace),
          valueField.dataPath,
          valueField.node.name,
        ),
        stored: Routing.atPath(
          this._rawConfig,
          [...(block === undefined ? [] : [block]), ...valueField.dataPath],
          valueField.node.name,
        ),
        destination: block ?? '',
        anchor: field.id,
        focusKey: `field:${field.id}`,
        helper: fieldHelper(valueField, ctx) ?? fieldHelper(field, ctx),
        words: show?.words,
      })}
      ${show?.line ?? nothing}
    </div>`;
    const jump = this._jump;
    return jump?.target.kind === 'field' && jump.target.id === field.id
      ? this._jumpTo(ctx, wrapper)
      : wrapper;
  }

  /**
   * An entry's color control, as its page draws it (`_renderEntryField`), writing to that entry
   * alone.
   *
   * @param key - The entry's key
   * @param id - The color field, or the mode it absorbs (`calendar:accent_color`)
   * @param ctx - Schema context
   * @param words - Its state words
   * @returns The control; nothing for an entry that has left, or a field that is no color
   */
  private _renderEntryColor(
    key: number,
    id: FieldId,
    ctx: SchemaCtx,
    words?: string,
  ): TemplateResult | typeof nothing {
    const entry = this._entryOf(key);
    const colors = this._entryColors(ctx);
    const spec = colors.specs.get(id);
    if (entry === undefined || spec === undefined) return nothing;
    const owner: WriteFrames.WriteOwner = { kind: 'entry', key };
    const anchor = spec.mode ?? spec.value;
    const valueField = colors.fields.get(spec.value)!;
    const entityId = Synthetic.entityIdOf(entry);
    return this._renderColor({
      owner,
      spec,
      ctx,
      name: fieldLabel(colors.fields.get(anchor)!, ctx.language),
      words,
      valueField,
      data: WriteFrames.projectionFor(owner, this._writeState(), ctx.workspace ?? ctx.view) ?? {},
      stored: Entities.asEntityConfig(entry)[valueField.node.name as keyof Types.EntityConfig],
      destination: String(key),
      anchor,
      // Undo focuses the field's wrapper on the entry's page, as its other fields'.
      focusKey: `field:${id}`,
      helper: fieldHelper(valueField, ctx) ?? fieldHelper(colors.fields.get(anchor)!, ctx),
      entity: { id: entityId, name: Entities.entityDisplayName(entityId, this.hass) },
    });
  }

  /**
   * The composed color control for any owner (section 5.9, D13). Every row and swatch writes
   * through `_writeFieldValue` for the owner, one undo step each; Custom's text is written only
   * once it is a color the card can draw, and held as a draft until then.
   *
   * @param c - What the control is drawn for
   * @returns The control
   */
  private _renderColor(c: ColorArgs): TemplateResult {
    const { spec, ctx } = c;
    const language = ctx.language;
    const haName = this._haColorName;
    const t: Translate = (key, values) => this._string(ctx, key, values);
    const value = Routing.atPath(c.data, c.valueField.dataPath, c.valueField.node.name);
    const text = typeof value === 'string' ? value : '';
    const draftKey = Colors.draftKey(c.owner, spec.value, c.destination);
    const draft = this._colorDrafts.get(draftKey);
    const typing = draft?.text !== undefined;
    const choice = Colors.choiceOf(value, spec, c.fallback);
    const customChosen = draft !== undefined || choice.kind === 'custom';
    const storedInvalid = choice.kind === 'custom' && !Colors.validColor(text, spec);
    const cardAccent = EntityColors.isEntityColorSentinel(this._config!.accent_color)
      ? 'var(--primary-color)'
      : (this._config!.accent_color ?? Config.DEFAULT_CONFIG.accent_color);
    let registry: string | undefined;
    if (c.entity !== undefined) {
      this._registryWanted = true;
      registry = EntityColors.entityColors().get(c.entity.id);
    }
    const paint = (source: Colors.ColorSource): string =>
      source === 'default'
        ? typeof c.fallback === 'string' && c.fallback !== ''
          ? c.fallback
          : 'transparent'
        : source === 'row-text'
          ? 'var(--primary-text-color)'
          : source === 'follow-ha'
            ? (registry ?? cardAccent)
            : cardAccent;
    const valueWords =
      choice.kind === 'source'
        ? Colors.sourceLabel(choice.source, spec, language)
        : Colors.describeColor(value, spec, language, { haName });
    const describe = (source: Colors.ColorSource): string | undefined => {
      if (source === 'default') {
        return typeof c.fallback === 'string' && c.fallback !== ''
          ? Colors.describeColor(c.fallback, spec, language, { haName })
          : undefined;
      }
      if (source === 'follow-card') {
        return t('color.follow_card.description', {
          value: Colors.describeColor(cardAccent, spec, language, { haName }),
        });
      }
      if (source !== 'follow-ha') return undefined;
      if (c.entity === undefined) return t('color.follow_ha.card');
      return registry === undefined
        ? t('color.follow_ha.none', { name: c.entity.name })
        : t('color.follow_ha.found', {
            name: c.entity.name,
            value: Colors.describeColor(registry, spec, language, { haName }),
          });
    };
    const pick = (write: ColorWrite): void => {
      const drafts = new Map(this._colorDrafts);
      drafts.delete(draftKey);
      this._colorDrafts = drafts;
      this._writeColor(c, write);
    };
    const key = this._colorKey(c);
    const open = this._openColor === key;
    const customLabel = t('color.custom_field', { setting: c.name });
    const remove =
      c.entity !== undefined && c.stored !== undefined && c.stored !== null && c.stored !== ''
        ? {
            label: t('color.remove', { name: c.entity.name, setting: c.name }),
            onRemove: () => pick(spec.sources[0].write),
          }
        : undefined;
    return ColorView.colorControl({
      id: `color:${key}`,
      focusKey: `color:${key}`,
      name: c.name,
      value: valueWords,
      accessibleName:
        c.words === undefined
          ? t('color.named', { setting: c.name, value: valueWords })
          : t('color.named_state', {
              setting: c.name,
              value: valueWords,
              state: c.words,
            }),
      words: c.words,
      color: storedInvalid ? undefined : choice.kind === 'source' ? paint(choice.source) : text,
      open,
      onToggle: () => {
        this._openColor = open ? undefined : key;
      },
      remove,
      helper: c.helper,
      rows: spec.sources.map(({ source, write }) => ({
        key: source,
        label: Colors.sourceLabel(source, spec, language),
        description: describe(source),
        checked: !customChosen && choice.kind === 'source' && choice.source === source,
        color: source === 'follow-ha' ? undefined : paint(source),
        onPick: () => pick(write),
      })),
      swatchesLabel: t('color.swatches'),
      swatches: Colors.SWATCH_TOKENS.map((token) => ({
        token,
        name: Colors.swatchName(token, language, haName),
        color: Colors.swatchValue(token),
        checked: !customChosen && choice.kind === 'swatch' && choice.token === token,
        onPick: () => pick({ ...spec.custom, [spec.value]: Colors.swatchValue(token) }),
      })),
      custom: {
        label: t('color.custom'),
        description: t('color.custom.description'),
        checked: customChosen,
        onPick: () => {
          if (!this._colorDrafts.has(draftKey)) {
            this._colorDrafts = new Map(this._colorDrafts).set(draftKey, {});
          }
        },
      },
      field:
        open && customChosen
          ? {
              form: this._renderColorText(c, draftKey, draft?.text ?? text, customLabel),
              color: typing || storedInvalid || text === '' ? undefined : text,
              invalid: typing || storedInvalid ? t('color.invalid') : undefined,
            }
          : undefined,
      yaml: {
        line:
          c.stored === undefined || c.stored === null
            ? undefined
            : `${c.valueField.node.name}: ${String(c.stored)}`,
        none: t('color.yaml_none'),
        kept: typing ? t('color.kept') : undefined,
      },
    });
  }

  /**
   * Custom's text field: the value field in a form of its own, showing a draft over the stored
   * value, its changes taken by the control (`_colorTyped`) rather than written as typed.
   *
   * @param c - What the control is drawn for
   * @param draftKey - Where its draft is kept
   * @param shown - The text it shows
   * @param label - Its label, "Custom Accent Color"
   * @returns The field
   */
  private _renderColorText(
    c: ColorArgs,
    draftKey: string,
    shown: string,
    label: string,
  ): TemplateResult {
    const slot = `color.${draftKey}`;
    const schema = this._intern(`${slot}.schema`, c.valueField.lifted);
    const data = this._intern(`${slot}.data`, WriteFrames.withValue({}, c.valueField, shown));
    const [hass, feed] = this._feed(schema, c.ctx.language);
    const card = c.owner.kind === 'card';
    // Keyed by where its value is stored: a form reused for another scope would hand its pending
    // events, and the draft they make, to that scope.
    return html`<div class="color-text-field">
      ${keyed(
        draftKey,
        html`<ha-form
          class=${card ? 'field-form' : c.write !== undefined ? 'split-form' : 'entity-form'}
          data-hass=${feed}
          .hass=${hass}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._keep(`${slot}.label`, label, () => () => label)}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) => this._colorTyped(c, draftKey, event)}
        ></ha-form>`,
      )}
    </div>`;
  }

  /**
   * Which control a color control is, by owner and the field it is drawn for.
   *
   * @param c - What the control is drawn for
   * @returns The key, `card|events:accent_color_mode`
   */
  private _colorKey(c: ColorArgs): string {
    return `${c.owner.kind === 'card' ? 'card' : `${c.owner.kind}:${c.owner.key}`}|${c.anchor}`;
  }

  /**
   * The key of the color control a field is drawn as, for an owner, as `_colorKey` names it.
   *
   * @param owner - The card, or an entry
   * @param id - The field drawn
   * @param ctx - Schema context
   * @returns The key; undefined for a field that is no color
   */
  private _colorKeyOf(
    owner: WriteFrames.WriteOwner,
    id: FieldId,
    ctx: SchemaCtx,
  ): string | undefined {
    if (owner.kind === 'card') {
      return this._cardColors(ctx).specs.has(id) ? `card|${id}` : undefined;
    }
    const spec = this._entryColors(ctx).specs.get(id);
    return spec === undefined ? undefined : `${owner.kind}:${owner.key}|${spec.mode ?? spec.value}`;
  }

  /**
   * Writes a color control's choice for its owner, one undo step: a source's values, or for
   * `reset` the color taken off (an absorbed mode set to its custom value first, so its value
   * field is drawn to clear). Fields are written in the order given, a mode before its value.
   *
   * @param c - What the control is drawn for
   * @param write - What to write
   * @param coalesceKey - The typing a write joins, for Custom's text
   */
  private _writeColor(c: ColorArgs, write: ColorWrite, coalesceKey?: string): void {
    if (c.write !== undefined) {
      c.write(write);
      return;
    }
    const { spec, ctx } = c;
    const steps: ReadonlyArray<readonly [FieldId, unknown]> =
      write === 'reset'
        ? [
            ...(spec.mode === undefined ? [] : [[spec.mode, spec.custom[spec.mode]] as const]),
            [spec.value, undefined] as const,
          ]
        : Object.entries(write);
    const label =
      c.entity === undefined
        ? this._string(ctx, 'history.change', { setting: c.name })
        : this._string(ctx, 'history.change_for', {
            setting: c.name,
            name: c.entity.name,
          });
    this._commit(
      label,
      coalesceKey,
      () => {
        for (const [id, value] of steps) {
          this._writeFieldValue(c.owner, id, value, ctx.workspace ?? ctx.view);
        }
      },
      c.focusKey,
    );
  }

  /**
   * Custom's text: written the moment it is a color the card can draw, coalesced like any typing;
   * until then held as a draft, and the last color written stays in the configuration.
   *
   * @param c - What the control is drawn for
   * @param draftKey - Where its draft is kept
   * @param event - The text field's `value-changed`
   */
  private _colorTyped(c: ColorArgs, draftKey: string, event: CustomEvent): void {
    event.stopPropagation();
    const incoming = event.detail?.value as Record<string, unknown> | undefined;
    if (!incoming) return;
    const typed = Routing.atPath(incoming, c.valueField.dataPath, c.valueField.node.name);
    const text = typeof typed === 'string' ? typed : '';
    const drafts = new Map(this._colorDrafts);
    if (!Colors.validColor(text, c.spec)) {
      this._colorDrafts = drafts.set(draftKey, { text });
      return;
    }
    this._colorDrafts = drafts.set(draftKey, {});
    // A word the card honors here is written as its row writes it, exactly as the card reads it.
    const choice = Colors.choiceOf(text.trim(), c.spec);
    const row =
      choice.kind === 'source' && choice.source !== 'default'
        ? c.spec.sources.find(({ source }) => source === choice.source)?.write
        : undefined;
    this._writeColor(
      c,
      row ?? { ...c.spec.custom, [c.spec.value]: text },
      `${c.focusKey}|${draftKey}`,
    );
  }

  /**
   * Adds settings to the session's added set: their page draws them, and nothing is written
   * (rule 3). Focus moves to the field's wrapper, never into its form, and the change is said.
   *
   * @param keys - Added-set keys
   * @param label - The setting added, for "Added Time Font Size."; none for Show All
   * @param focusId - The field whose wrapper takes focus
   * @param ctx - Schema context
   * @param heading - The heading, for "Showing every setting under Time."
   */
  private _addSettings(
    keys: ReadonlyArray<string>,
    label: string | undefined,
    focusId: FieldId,
    ctx: SchemaCtx,
    heading?: string,
  ): void {
    this._added = new Set([...this._added, ...keys]);
    this._say(
      label === undefined
        ? this._string(ctx, 'announce.showing_all', { heading: heading ?? '' })
        : this._string(ctx, 'announce.added', { label }),
    );
    this._focusSoon([`[data-field="${CSS.escape(focusId)}"]`]);
  }

  /**
   * Resets a field's line where this page writes it, through `reset.ts`, as one undo step. Reset
   * keeps the control and focuses its wrapper; Remove also takes the field from the added set,
   * so it goes back to its Add row, which takes focus, else its heading does.
   *
   * @param field - The field
   * @param owner - The card, or a calendar entry
   * @param action - Reset or Remove
   * @param label - The field's label, which names the step
   * @param heading - The heading's key
   */
  private _resetField(
    field: IndexedField,
    owner: PlanOwner,
    action: 'reset' | 'remove',
    label: string,
    heading?: string,
  ): void {
    const ctx = this._ctx;
    const target: Reset.ResetTarget =
      owner.kind === 'entry'
        ? { kind: 'entry', key: owner.key, keys: field.configKeys }
        : { kind: 'field', field, workspace: ctx.workspace ?? ctx.view };
    this._commit(
      this._string(ctx, 'history.reset', { setting: label }),
      undefined,
      () => this._applyReset(target, [this._addedKey(field.id, owner)]),
      `field:${field.id}`,
    );
    if (action === 'remove') {
      this._say(this._string(ctx, 'announce.removed_setting', { label }));
    }
    this._focusAfterReset(field.id, heading);
  }

  /**
   * Removes a family shown on a page: every member's line here, and the family from the added
   * set, in one step.
   *
   * @param family - The family
   * @param owner - The card, or a calendar entry
   * @param ctx - Schema context
   * @param heading - The heading's key
   */
  private _removeFamily(
    family: FamilyId,
    owner: PlanOwner,
    ctx: SchemaCtx,
    heading?: string,
  ): void {
    const name = this._string(ctx, FAMILIES[family].titleKey);
    const target: Reset.ResetTarget =
      owner.kind === 'entry'
        ? { kind: 'entry-family', key: owner.key, family }
        : { kind: 'family', family, workspace: ctx.workspace ?? ctx.view };
    this._commit(this._string(ctx, 'history.reset', { setting: name }), undefined, () =>
      this._applyReset(target, []),
    );
    this._say(this._string(ctx, 'announce.removed_setting', { label: name }));
    this._focusAfterReset(undefined, heading);
  }

  /**
   * Applies a reset to everything the editor holds about the configuration, together, and
   * reports it: the YAML, the authored root keys, the Grid reset keys and the held text, as
   * `reset.ts` hands them back, and the added set without what the reset retires.
   *
   * @param target - What to reset, or several targets reset together
   * @param retire - Added-set keys to retire besides the reset's own
   */
  private _applyReset(
    target: Reset.ResetTarget | ReadonlyArray<Reset.ResetTarget>,
    retire: ReadonlyArray<string>,
  ): void {
    if (!this._config || !this._prepareForWrite()) return;
    let state = this._writeState();
    const clearAdded: string[] = [];
    for (const each of Array.isArray(target) ? target : [target]) {
      const result = Reset.reset(state, each);
      state = result.state;
      clearAdded.push(...result.clearAdded);
    }
    this._config = state.config;
    this._pending = { ...state.pending };
    this._authoredRootKeys = new Set(state.authoredRootKeys);
    this._gridResetKeys = new Set(state.gridResetKeys);
    const gone = new Set([...clearAdded, ...retire]);
    const kept = [...this._added].filter((key) => !gone.has(key));
    if (kept.length !== this._added.size) this._added = new Set(kept);
    this._report(this._config);
  }

  /**
   * Focus after a Reset or a Remove (section 5.3): the field's wrapper while it is drawn, else
   * its heading's Add row, which now names it, else the heading.
   *
   * @param id - The field, or none for a family
   * @param heading - The heading's key
   */
  private _focusAfterReset(id: FieldId | undefined, heading?: string): void {
    const group = `.page-group[data-heading="${CSS.escape(heading ?? '')}"]`;
    this._focusSoon([
      ...(id === undefined ? [] : [`[data-field="${CSS.escape(id)}"]`]),
      `${group} .add-toggle`,
      `${group} .heading`,
      '.page-title',
      // On the overview, which has no page headings: its own fields, then its first heading.
      '.overview [data-field]',
      '.overview .heading',
    ]);
  }

  /**
   * A heading's link to the heading on another page that answers the neighboring question.
   *
   * @param heading - The heading
   * @param ctx - Schema context
   * @returns The link, or `undefined`
   */
  private _crossLink(heading: HeadingDef, ctx: SchemaCtx): PageView.CrossLink | undefined {
    const link = heading.crossLink;
    const target = link && PAGES.find((candidate) => candidate.id === link.page);
    const targetHeading = target?.headings.find((each) => each.key === link!.heading);
    if (!link || !target || !targetHeading) return undefined;
    return {
      text: this._string(ctx, link.textKey),
      label: this._string(ctx, 'nav.crumb', {
        page: this._pageTitle(target, ctx),
        heading: this._headingTitle(targetHeading, ctx) ?? '',
      }),
      key: `xlink:${link.heading}`,
      onOpen: () =>
        this._open(
          { kind: 'page', page: link.page },
          `xlink:${link.heading}`,
          'cross-link',
          link.heading,
        ),
    };
  }

  /**
   * A heading's title: its key, or the key it takes in a layout (Icons in Grid).
   *
   * @param heading - The heading
   * @param ctx - Schema context
   * @returns The title, or `undefined` for a page's unheaded top run
   */
  private _headingTitle(heading: HeadingDef, ctx: SchemaCtx): string | undefined {
    const key = heading.keyByView?.[ctx.view] ?? heading.key;
    return key === undefined ? undefined : this._string(ctx, key);
  }

  /**
   * A page's title, as its row and its header show it.
   *
   * @param page - The page
   * @param ctx - Schema context
   * @returns The title
   */
  private _pageTitle(page: PageDef, ctx: SchemaCtx): string {
    return this._string(ctx, page.titleKey);
  }

  /**
   * Whether a place exists on the card as it is now: the Grid page only while Grid is the scope.
   *
   * @param route - The place
   * @returns `true` where it can be drawn
   */
  private _exists(route: Navigation.Route): boolean {
    if (route.kind === 'overview' || route.kind === 'audit' || route.kind === 'notices')
      return true;
    if (route.kind === 'entry') {
      return this._entryKeysFor((this._config?.entities ?? []).length).includes(route.key);
    }
    if (route.kind !== 'page') return false;
    const page = PAGES.find((candidate) => candidate.id === route.page);
    return page !== undefined && (page.onlyIn === undefined || page.onlyIn === this._workspace);
  }

  /**
   * A translator for the views: the editor's own strings, by literal key.
   *
   * @param ctx - Schema context
   * @returns The translator
   */
  private _t(ctx: SchemaCtx): Translate {
    return this._keep(
      'translate',
      ctx.language,
      () => (key: string, values?: Words) => this._string(ctx, key, values),
    );
  }

  /**
   * Opens a place, saving the scroll position and the control that left, so Back restores both.
   *
   * @param to - Where to go
   * @param focusKey - The `data-focus` key of the row or link that opened it
   * @param how - How the trail changes (`navigation.ts` › `go`)
   * @param heading - A heading on the page to bring to the top, for a cross-link
   */
  private _open(
    to: Navigation.Route,
    focusKey: string,
    how: 'push' | 'replace' | 'cross-link' = 'push',
    heading?: string,
  ): void {
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
    };
    this._closeDisclosures();
    this._nav = Navigation.go(this._nav, to, from, how);
    this._jump = this._resultsLeft = undefined;
    void this._afterMove(undefined, heading);
  }

  /** Closes the strip, Add Calendar and the keyboard grab, which belong to the place being left. */
  private _closeDisclosures(): void {
    this._auditEdit = undefined;
    this._openStrip = undefined;
    this._adding = undefined;
    this._grab = undefined;
    this._addOpen = undefined;
  }

  /**
   * Opens what a result names (section 5.8): its page at the field, or, for a field the overview
   * draws, the overview with the field shown in place of the results. Either way Return to
   * Results sits above the field, which is scrolled to the top, highlighted for 2 s and focused
   * on its wrapper, and the move is announced.
   *
   * @param hit - The result
   * @param focusKey - The result's `data-focus` key, which Back restores focus to
   * @param search - Whether it was chosen from the results, which Back returns to
   * @param say - What to announce instead of "Showing Time Format."
   */
  private _openResult(
    hit: { readonly target: Search.FieldTarget; readonly label: string },
    focusKey: string,
    search = true,
    say?: () => string,
  ): void {
    const target = hit.target;
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
      search: search ? { query: this._filter.query, editHere: this._editHere } : undefined,
    };
    const page =
      target.kind === 'button-field' ? 'card_header' : target.kind === 'field' && target.page;
    this._closeDisclosures();
    if (target.kind === 'entry-field') {
      // A calendar entry's field opens on the entry's own page.
      this._nav = Navigation.go(this._nav, { kind: 'entry', key: target.key }, from);
    } else if (page) {
      this._nav = Navigation.go(this._nav, { kind: 'page', page }, from);
    } else if (search) {
      this._resultsLeft = from;
    } else {
      this._nav = Navigation.OVERVIEW;
    }
    // A result that waits in an Add row is added, as choosing it there would: it writes nothing.
    if (target.kind !== 'button-field') {
      const added = target.kind === 'entry-field' ? `entry:${target.key}:${target.id}` : target.id;
      if (!this._added.has(added)) this._added = new Set([...this._added, added]);
    }
    this._land(
      target,
      hit.label,
      // A chip's group holds several fields: focus goes to the chip the result names.
      target.kind === 'field' ? [`button.chip[data-field="${CSS.escape(target.id)}"]`] : [],
      () => say?.() ?? this._string(this._ctx, 'search.showing', { label: hit.label }),
    );
  }

  /**
   * Shows a field as a result opens it, once the move renders: scrolled to the top, highlighted
   * for 2 s, and focused on its wrapper, or on what `first` names before it.
   *
   * @param target - The field
   * @param label - Its label
   * @param first - What takes focus before the wrapper, where found
   * @param say - What to announce, if anything
   */
  private _land(
    target: Search.FieldTarget,
    label: string,
    first: ReadonlyArray<string>,
    say?: () => string,
  ): void {
    const jump = { target, label, lit: true };
    this._jump = jump;
    void this.updateComplete.then(() => {
      const field = this.renderRoot.querySelector<HTMLElement>('.jump');
      if (field) Focus.scrollToTopSettled(this, field);
      Focus.focusFirst(field ?? this.renderRoot, [...first, '[tabindex="-1"]', '.page-title']);
      if (say) this._say(say());
      setTimeout(() => {
        if (this._jump === jump) this._jump = { ...jump, lit: false };
      }, 2000);
    });
  }

  /**
   * Goes Back one place, restoring its scroll position and the control that left it. On the
   * overview, where a result shows a field in place of the results, Back is Return to Results.
   */
  private _back = (): void => {
    this._closeDisclosures();
    let restore = this._resultsLeft;
    if (restore === undefined || this._nav.route.kind !== 'overview') {
      const moved = Navigation.back(this._nav);
      this._nav = moved.nav;
      restore = moved.restore;
    }
    // The query stays typed while a result's field shows, so the results come back with it.
    if (restore?.search) this._editHere = restore.search.editHere;
    this._jump = this._resultsLeft = undefined;
    void this._afterMove(restore);
  };

  /**
   * Moves focus once a move has rendered, in the same continuation, before the swapped-out
   * control's loss of focus can land anywhere else: a page's `h2`, with its header at the top
   * of what scrolls the editor; back on a place, its saved scroll position and the control
   * that left it, else that place's list heading.
   *
   * @param restore - The place returned to, for Back
   * @param heading - A heading to bring to the top instead of the page's header
   */
  private async _afterMove(restore?: Navigation.TrailEntry, heading?: string): Promise<void> {
    await this.updateComplete;
    const root = this.renderRoot;
    if (restore !== undefined) {
      Focus.restoreScroll(this, restore.scrollTop);
      const keys = restore.focusKey === undefined ? [] : [Focus.byFocusKey(restore.focusKey)];
      Focus.focusFirst(root, [...keys, '.row-group .heading', '.page-title']);
      return;
    }
    const title = Focus.focusFirst(root, ['.page-title']);
    const target =
      (heading === undefined
        ? undefined
        : root.querySelector(`[data-heading="${CSS.escape(heading)}"]`)) ??
      title?.closest('.page-head');
    if (target) Focus.scrollToTop(this, target);
  }

  /**
   * Escape, by the rule the editor follows (`views/keys.ts` › `escapeAction`): a Home
   * Assistant overlay keeps it; else the open disclosure closes, else a page goes Back, else the
   * query clears; else it goes through and Home Assistant closes the dialog. Whenever the editor
   * acts, both `preventDefault()` and `stopPropagation()`: either alone lets the dialog close.
   *
   * @param event - A `keydown` anywhere under the editor
   */
  private _onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    // Undo and Redo, outside text fields; Quick Setup previews and is not undone a step at a time.
    const step = this._quickSetup === undefined ? historyKey(event) : undefined;
    if (step !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      this._step(step);
      return;
    }
    if (this._moveByKey(event)) return;
    if (event.key !== 'Escape') return;
    const wizard = this._quickSetup;
    // Quick Setup is a place of its own: Escape is its Back, or Cancel on its first step.
    const grab = this._grabbed();
    const action = escapeAction(event.composedPath(), this, {
      disclosure:
        wizard === undefined &&
        (this._drag !== undefined ||
          grab !== undefined ||
          this._colorOpenHere() ||
          this._scopeOpen ||
          this._auditEdit !== undefined ||
          this._openStrip !== undefined ||
          this._adding !== undefined ||
          this._addOpen !== undefined ||
          this._split !== undefined),
      onPage:
        wizard !== undefined ||
        this._nav.route.kind !== 'overview' ||
        this._resultsLeft !== undefined,
      query: Filter.hasQuery(this._filter),
    });
    if (action === 'pass') return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'back' && wizard !== undefined) {
      const index = QUICK_SETUP_STEPS.indexOf(wizard.step);
      if (index > 0) {
        this._quickSetupGo(QUICK_SETUP_STEPS[index - 1]);
        this._focusSoon(['[data-quick-setup-back]', '[data-quick-setup-next]']);
      } else {
        this._cancelQuickSetup();
        this._focusSoon(['[data-focus="quick-setup"]', '[data-quick-setup-open]']);
      }
    } else if (action === 'close' && this._drag !== undefined) {
      this._drag.cancel();
    } else if (action === 'close' && grab !== undefined) {
      // The grab is innermost: the row goes back, focus stays on its handle.
      this._putBack(grab, true);
    } else if (action === 'close' && this._colorOpenHere()) {
      const open = this._openColor;
      this._openColor = undefined;
      this._focusSoon([Focus.byFocusKey(`color:${open}`)]);
    } else if (
      action === 'close' &&
      this._split !== undefined &&
      this._openStrip === undefined &&
      this._adding === undefined &&
      this._addOpen === undefined &&
      this._auditEdit === undefined &&
      !this._scopeOpen
    ) {
      // Escape cancels Split This Calendar from any of its steps, as Cancel does.
      this._cancelSplit(true);
    } else if (action === 'close') {
      // The disclosure opened last closes, focus back on what opened it.
      const strip = this._openStrip;
      const addRow = this._addOpen?.key;
      const edited = this._auditEdit?.line.text;
      const opener =
        edited !== undefined
          ? `edit:${edited}`
          : strip !== undefined
            ? `more:${strip}`
            : this._adding !== undefined
              ? 'add-calendar'
              : addRow !== undefined
                ? addRow
                : 'scope-change';
      if (edited !== undefined) this._auditEdit = undefined;
      else if (strip !== undefined) this._openStrip = undefined;
      else if (this._adding !== undefined) this._adding = undefined;
      else if (addRow !== undefined) this._addOpen = undefined;
      else this._scopeOpen = false;
      this._focusSoon([Focus.byFocusKey(opener)]);
    } else if (action === 'back') {
      this._back();
    } else if (action === 'clear') {
      // Escape in the search field leaves focus there. Anywhere else, on a result row that goes
      // with the results, focus moves to the overview's first list, never into a form
      // (`views/focus.ts`), rather than falling to the page body.
      const inField = event
        .composedPath()
        .some((each) => each instanceof Element && each.classList.contains('filter-form'));
      this._filter = { ...this._filter, query: '' };
      this._jump = undefined;
      this._focusSoon(
        inField
          ? ['ha-form.filter-form']
          : ['[data-heading="calendars"] .heading', '.row-group .heading'],
      );
    }
  };

  /**
   * Whether the open color control is drawn where the editor is: one left open on another page
   * stays open there, and Escape here is not its to take.
   *
   * @returns True while it is drawn
   */
  private _colorOpenHere(): boolean {
    const open = this._openColor;
    return (
      open !== undefined &&
      this.renderRoot.querySelector(Focus.byFocusKey(`color:${open}`)) !== null
    );
  }

  /**
   * Alt+ArrowUp and Alt+ArrowDown move the calendar of a focused row, or of the entry page open
   * where it is its calendar's only entry, or a toolbar button from its row's head: wherever the
   * editor's own controls carry `data-move-calendar` or `data-move-button`, never inside a field's
   * form or a text field.
   *
   * @param event - A `keydown`
   * @returns Whether it moved a row, the key then taken
   */
  private _moveByKey(event: KeyboardEvent): boolean {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
      this._quickSetup !== undefined
    ) {
      return false;
    }
    const path = event.composedPath();
    if (
      inTextField(path) ||
      path.some((each) => each instanceof Element && each.localName === 'ha-form')
    ) {
      return false;
    }
    const mover = path.find(
      (each): each is HTMLElement =>
        each instanceof HTMLElement &&
        (each.dataset.moveCalendar !== undefined || each.dataset.moveButton !== undefined),
    );
    if (mover === undefined) return false;
    event.preventDefault();
    event.stopPropagation();
    const button = mover.dataset.moveButton;
    if (button !== undefined) {
      const at = this._buttonKeys.indexOf(Number(button));
      this._moveButton(at, at + (event.key === 'ArrowUp' ? -1 : 1), handleFocus('button', button));
      return true;
    }
    const entityId = mover.dataset.moveCalendar!;
    const place = this._calendarPlace(entityId);
    const focused = path.find(
      (each): each is HTMLElement =>
        each instanceof HTMLElement && each.dataset.focus !== undefined,
    );
    this._moveCalendar(
      entityId,
      place + (event.key === 'ArrowUp' ? -1 : 1),
      focused?.dataset.focus,
    );
    return true;
  }

  /**
   * Settings For, compact or full, as the overview and every page that depends on the scope
   * draw it.
   *
   * @param ctx - Schema context
   * @returns The control
   */
  private _renderScope(ctx: SchemaCtx): TemplateResult {
    const displayed = this._viewForConfig(this._config!);
    const workspace = this._workspace;
    const label = (each: Workspace.EditorWorkspace): string =>
      this._string(ctx, `editing_workspace.option.${each}.label`);
    return Overview.scopeControl(
      {
        compact:
          !this._scopeOpen &&
          Workspace.isCompactScope(this._rawConfig, this._config!, displayed, this._scopeChanged),
        workspace,
        choices: Workspace.WORKSPACES.map((value) => ({
          value,
          label: label(value),
          set: Workspace.storedCount(this._rawConfig, value),
        })),
        displayedLabel: label(displayed),
        previewDiffers: workspace !== 'shared' && workspace !== displayed,
      },
      this._t(ctx),
      this._openScope,
      this._pickScope,
    );
  }

  /** Change: Settings For opens as the four choices. */
  private _openScope = (): void => {
    this._scopeOpen = true;
    // One disclosure at a time, so Escape closes the one just opened.
    this._addOpen = undefined;
    this._focusSoon([`input[name="scope"]:checked`, `input[name="scope"]`]);
  };

  /**
   * Changes the scope: writes nothing, keeps focus on the chosen option, says so, and keeps
   * Settings For full for the rest of the session.
   *
   * @param workspace - The scope chosen
   */
  private _pickScope = (workspace: Workspace.EditorWorkspace): void => {
    if (!this._config || workspace === this._workspace) return;
    this._selectedWorkspace = workspace;
    this._scopeChanged = true;
    this._scopeOpen = false;
    const ctx = this._ctx;
    this._say(
      this._string(ctx, 'announce.scope', {
        layout: this._string(ctx, `editing_workspace.option.${workspace}.label`),
      }),
    );
    // The Grid page exists only while Grid is the scope.
    if (!this._exists(this._nav.route)) {
      this._nav = Navigation.validate(this._nav, (route) => this._exists(route)).nav;
    }
  };

  /**
   * Queues words for the live region and asks for the render that speaks them.
   *
   * @param message - A whole sentence
   */
  private _say(message: string): void {
    if (this._announcer.say(message)) this.requestUpdate();
  }

  /**
   * Card Displays: the three illustrated layouts, written through the frame the card's own
   * display form always had, and the Grid notice under it.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @returns The group
   */
  private _renderDisplays(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const node = chassis.displayView[0] as { selector: { select: { options: unknown } } };
    const options = node.selector.select.options as ReadonlyArray<Overview.DisplayChoice>;
    const value = this._viewForConfig(this._config!);
    return html`${Overview.displayControl(
      this._string(ctx, 'view'),
      EditorLocalize.lookup(ctx.language, 'view.helper'),
      options,
      value,
      (view) => {
        const data = { view: value };
        // The view and the Grid notice it brings are one step.
        this._commit(
          this._string(ctx, 'history.change', { setting: this._string(ctx, 'view') }),
          undefined,
          () =>
            this._writeOwned(
              {
                owner: WriteFrames.CARD_OWNER,
                workspace: 'list',
                schema: chassis.displayView,
                data,
              },
              { view },
            ),
        );
      },
    )}
    ${this._renderGridReconciliation(ctx)}`;
  }

  /**
   * A color field's spec, for describing its value: by the field's id where it has one, else by
   * its node, the card's before an entry's, else by its name, else, for an indexed field no owner
   * draws here (a search result a gate or another layout holds back), its own.
   *
   * @param field - The field
   * @param ctx - Schema context
   * @returns The spec; undefined for a node no spec names
   */
  private _colorSpecOf(
    field: Pick<IndexedField, 'node'> & { readonly id?: FieldId },
    ctx: SchemaCtx,
  ): Colors.ColorSpec | undefined {
    const owners = [this._cardColors(ctx), this._entryColors(ctx)];
    if (field.id !== undefined) {
      for (const { specs } of owners) {
        const spec = specs.get(field.id);
        if (spec !== undefined) return spec;
      }
    }
    const find = (match: (node: IndexedField['node']) => boolean) => {
      for (const { specs, fields } of owners) {
        for (const spec of specs.values()) {
          const node = fields.get(spec.value)?.node;
          if (node !== undefined && match(node)) return spec;
        }
      }
      return undefined;
    };
    const found =
      find((node) => node === field.node) ?? find((node) => node.name === field.node.name);
    if (found !== undefined || field.id === undefined || !('dataPath' in field)) return found;
    // A color a gate or another layout withholds here, which search still words: its own spec.
    const own = field as IndexedField;
    return Colors.colorSpecs({ fields: new Map([[own.id, own]]) }).get(own.id);
  }

  /**
   * Words a value a field cannot word itself, for a section row's summary: an action by Home
   * Assistant's name for it, an entity by its name.
   *
   * @param field - The field
   * @param value - Its value
   * @returns The words, or `undefined` to leave the pair out
   */
  private _describe = (field: Pick<IndexedField, 'node'>, value: unknown): string | undefined => {
    const selector = field.node.selector;
    const ctx = this._ctx;
    const spec = Colors.isColorNode(field.node) ? this._colorSpecOf(field, ctx) : undefined;
    if (spec !== undefined) {
      return Colors.describeColor(value, spec, ctx.language, { haName: this._haColorName });
    }
    if ('ui_action' in selector) {
      const action = Helpers.isConfigBlock(value) ? value.action : undefined;
      if (typeof action !== 'string') return undefined;
      const key = `${HA_ACTION_LABEL_PREFIX}${action}`;
      const words = withCardActionLabels(this.hass, this._ctx.language)?.localize?.(key);
      return typeof words === 'string' && words !== '' && words !== key ? words : undefined;
    }
    if ('entity' in selector && typeof value === 'string' && value !== '') {
      return Entities.entityDisplayName(value, this.hass);
    }
    // A list of entities, each by its name.
    if ('entity' in selector && Array.isArray(value) && value.length > 0) {
      return value.map((each) => Entities.entityDisplayName(String(each), this.hass)).join(', ');
    }
    return undefined;
  };

  /**
   * A section row's summary: its main settings with their values, and what it stores here.
   *
   * @param page - The page
   * @param ctx - Schema context
   * @param present - The fields built here
   * @returns The line
   */
  private _summary(
    page: PageDef,
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): string {
    const workspace = ctx.workspace ?? ctx.view;
    const stored = Summary.pageStoredCount(page, this._rawConfig, workspace);
    return Summary.summaryParts(
      page,
      { fields: present },
      this._formData(),
      stored,
      ctx.language,
      this._describe,
    ).join(Summary.SUMMARY_SEPARATOR);
  }

  /**
   * The overview: notices, Quick Setup's banner, the filter bar, then either what a query finds,
   * grouped by page, or Settings For, Calendars, Card Displays, the overview's own fields, a row
   * per section page and More.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @returns The overview
   */
  private _renderOverview(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const t = this._t(ctx);
    const { present } = this._drawing!;
    const head = html`${this._renderNoticesRow(ctx)}
    ${
      this._banner
        ? Overview.quickSetupBanner(t, this._openQuickSetup, () => {
            this._banner = false;
          })
        : nothing
    }
    ${this._renderFilterBar(ctx, chassis)}`;

    // One template whatever the query, so the filter bar above it is never drawn anew and the
    // search field keeps focus as the first character turns the overview into results. The
    // scope stays in view with the results: their values are the scope's.
    return html`<div class="overview">
      ${head} ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)}
      ${this._renderOverviewBody(ctx, chassis, present)}
    </div>`;
  }

  /**
   * What the overview draws below its filter bar: what a query finds, or Settings For,
   * Calendars, Card Displays, the overview's own fields, a row per section page and More.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @param present - The fields built here
   * @returns The body
   */
  private _renderOverviewBody(
    ctx: SchemaCtx,
    chassis: Subforms.ChassisSchemas,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): TemplateResult {
    const t = this._t(ctx);
    if (Filter.hasQuery(this._filter) && this._resultsLeft === undefined) {
      return html`${this._renderScope(ctx)} ${this._renderResults(ctx, present)}`;
    }
    const rows = PAGES.filter(
      (page) => page.onlyIn === undefined || page.onlyIn === this._workspace,
    ).map((page) =>
      Overview.navRow(
        {
          key: `nav:${page.id}`,
          iconPath: page.iconPath,
          title: this._pageTitle(page, ctx),
          summary: this._summary(page, ctx, present),
        },
        () => this._open({ kind: 'page', page: page.id }, `nav:${page.id}`),
      ),
    );
    const calendars = this._renderCalendars(ctx);
    // The overview's own fields follow the shown set too: a mode value only with its mode.
    const pctx = this._planCtx(ctx);
    const own = repeat(
      OVERVIEW_FIELDS.flatMap(([id, appearance]) => {
        const field = present.get(id);
        const state = Plan.fieldState(id, appearance, pctx);
        return field && state.kind === 'live' ? [[field, appearance] as const] : [];
      }),
      ([field]) => field.id,
      ([field, appearance]) =>
        this._renderField(field, ctx, this._fieldShow(field, appearance, pctx, ctx, CARD)),
    );
    const prefs = (['every', 'yaml'] as const).map((key) =>
      ShownView.prefRow({
        key,
        label: key === 'every' ? t('prefs.every') : t('prefs.yaml'),
        helper: key === 'every' ? t('prefs.every_note') : t('prefs.yaml_note'),
        on: this._prefs[key],
        onToggle: () => {
          this._prefs = { ...this._prefs, [key]: !this._prefs[key] };
          Prefs.writePrefs(this._prefs);
        },
      }),
    );
    return html`${this._renderScope(ctx)} ${calendars} ${this._renderDisplays(ctx, chassis)} ${own}
    ${Overview.rowGroup(t('overview.settings'), rows)}
    ${Overview.rowGroup(t('overview.more'), [
      Overview.navRow(
        {
          key: 'more:audit',
          iconPath: mdiFormatListChecks,
          title: t('more.audit'),
          summary: this._auditSummary(t),
        },
        () => this._open({ kind: 'audit' }, 'more:audit'),
      ),
      Overview.exampleRow(t, this._openQuickSetup),
      ...prefs,
    ])}`;
  }

  /**
   * The jump list's index for this render, built again only when what it reads has changed.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @returns The index
   */
  private _searchIndex(
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): ReadonlyArray<Search.SearchEntry> {
    const deps = [
      present,
      this._config,
      this._rawConfig,
      this._pending,
      this._added,
      ctx.workspace ?? ctx.view,
      ctx.language,
      this._entryKeys.join(),
      this._buttonKeys.join(),
      this.hass?.states,
      // Action values are worded through it, and Home Assistant loads its strings late.
      this.hass?.localize,
      this._prefs.every,
    ];
    const kept = this._indexKept;
    if (kept && kept.deps.every((each, at) => each === deps[at])) return kept.index;
    const owners = (forms: ReadonlyArray<Search.SearchOwner>) =>
      forms.filter(({ schema }) => Filter.hasFields(schema));
    const index = Search.buildSearchIndex({
      ...ctx,
      hass: this.hass,
      present,
      plan: this._planCtx(ctx),
      data: this._formData(),
      entries: owners(this._entrySchemas(this._entrySubform(ctx), ctx)),
      buttons: Config.resolveToolbar(ctx.config).show
        ? owners(this._buttonSchemas(this._buttonSubform(ctx)))
        : [],
      t: this._t(ctx),
      describe: this._describe,
    });
    this._indexKept = { deps, index };
    return index;
  }

  /**
   * What a query finds, as the jump list: the count, the scope its values are for, Edit Here,
   * and a row per result, which opens it where it is drawn; with Edit Here on, each card setting
   * found is its live control instead.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @returns The results, or the lines saying nothing matches
   */
  private _renderResults(
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): TemplateResult {
    const query = this._filter.query.trim();
    const t = this._t(ctx);
    const hits = Search.search(this._searchIndex(ctx, present), query);
    if (hits.length === 0) {
      this._resultStatus = `${t('filter.no_matches', { query })} ${t('search.hint')}`;
      return this._renderNoMatches(ctx);
    }
    // Counted as listed: one field of several calendars is one result (the D05 manifest).
    const items = Search.collapse(hits);
    this._resultStatus = t('search.results', {
      query,
      count: items.length,
    });
    const workspace = ctx.workspace ?? ctx.view;
    const pctx = this._planCtx(ctx);
    const rows = items.map((item): SearchView.ResultItem => {
      if (item.kind === 'calendars') return this._calendarsResult(item, query, ctx);
      const { hit } = item;
      const { entry } = hit;
      const { target, status } = entry;
      if (this._editHere && target.kind === 'field') {
        const field = present.get(target.id);
        const appearance = Plan.appearanceOf(target.id);
        if (field && appearance && (status.kind === 'live' || status.kind === 'add')) {
          return {
            kind: 'field',
            key: `edit:${target.id}`,
            crumbs: entry.crumbs,
            field: this._renderField(
              field,
              ctx,
              this._fieldShow(field, appearance, pctx, ctx, CARD),
            ),
          };
        }
      }
      return { kind: 'row', row: this._resultRow(hit, query, ctx) };
    });
    return SearchView.resultList(
      {
        status: this._resultStatus,
        values:
          workspace === 'shared'
            ? undefined
            : t('search.values_for', {
                layout: t(`editing_workspace.option.${workspace}.label`),
              }),
        editHere: {
          label: this._editHere ? t('search.show_list') : t('search.edit_here'),
          pressed: this._editHere,
          onToggle: () => {
            this._editHere = !this._editHere;
          },
        },
      },
      rows,
    );
  }

  /**
   * The `data-focus` key of a result's row.
   *
   * @param target - What it opens
   * @returns The key
   */
  private _resultKey(target: Search.SearchTarget): string {
    switch (target.kind) {
      case 'field':
        return `result:${target.id}`;
      case 'page':
        return `result:page:${target.page}`;
      case 'ha-tab':
        return `result:ha:${target.tab}`;
      case 'split':
        return `result:${Search.SPLIT_GROUP}:${target.key}`;
      case 'overview':
        return `result:overview:${target.block}`;
      default:
        return `result:${target.id}:${target.key}`;
    }
  }

  /**
   * One result's row: its label with the query marked, where it is, its value, where the value
   * comes from and its YAML path, its tag, the phrase a helper-only match was found by, and Add
   * for a setting not shown yet.
   *
   * @param hit - The result
   * @param query - The query
   * @param ctx - Schema context
   * @returns The row
   */
  private _resultRow(hit: Search.SearchHit, query: string, ctx: SchemaCtx): SearchView.ResultRow {
    const t = this._t(ctx);
    const { entry } = hit;
    const key = this._resultKey(entry.target);
    const open = entry.target.kind === 'ha-tab' ? undefined : () => this._chooseResult(entry, key);
    return {
      key,
      label: entry.label,
      marks: Search.highlight(entry.label, query),
      crumbs: entry.crumbs,
      meta: this._resultMeta(entry, ctx),
      tag: entry.tag,
      phrase: hit.phrase ? { template: t('search.help_phrase'), ...hit.phrase } : undefined,
      add:
        entry.status.kind === 'add' && open
          ? {
              label: t('search.add'),
              name: t('search.add_named', {
                label: entry.label,
                place: entry.crumbs.join(', '),
              }),
              key: `add-${key}`,
              onAdd: open,
            }
          : undefined,
      onOpen: open,
    };
  }

  /**
   * A result's line under its breadcrumb: its value, where the value comes from, and its YAML
   * path, which a field's row always shows.
   *
   * @param entry - The result
   * @param ctx - Schema context
   * @returns The line
   */
  private _resultMeta(entry: Search.SearchEntry, ctx: SchemaCtx): string {
    return [
      entry.value,
      entry.words,
      entry.yamlPath === ''
        ? undefined
        : this._string(ctx, 'search.yaml', { path: entry.yamlPath }),
    ]
      .filter((part) => part !== undefined && part !== '')
      .join(' · ');
  }

  /**
   * One field of several calendar entries, folded into one result: how many set it, and, opened,
   * a row per entry with its value, its source words and Go to Setting.
   *
   * @param item - The folded result
   * @param query - The query
   * @param ctx - Schema context
   * @returns The result
   */
  private _calendarsResult(
    item: Extract<Search.ResultItem, { kind: 'calendars' }>,
    query: string,
    ctx: SchemaCtx,
  ): SearchView.ResultItem {
    const t = this._t(ctx);
    const [first] = item.hits;
    const set = item.hits.filter(({ entry }) => entry.stored).length;
    const open = this._openResults.has(item.id);
    const key = `result:${item.id}`;
    return {
      kind: 'calendars',
      row: {
        key,
        label: first.entry.label,
        marks: Search.highlight(first.entry.label, query),
        crumbs: [this._string(ctx, 'panel.calendars'), ...first.entry.crumbs.slice(1)],
        meta:
          first.entry.target.kind === 'split'
            ? t('calendars.entries', { count: item.hits.length })
            : set === 0
              ? t('search.calendars_none')
              : t('search.calendars_set', { count: set }),
        phrase: first.phrase ? { template: t('search.help_phrase'), ...first.phrase } : undefined,
        onOpen: () => {
          const next = new Set(this._openResults);
          if (open) next.delete(item.id);
          else next.add(item.id);
          this._openResults = next;
        },
      },
      expanded: open,
      entries: open
        ? item.hits.map(({ entry }) => {
            const subKey = this._resultKey(entry.target);
            return {
              key: subKey,
              label: entry.crumbs[0],
              crumbs: entry.crumbs,
              meta: this._resultMeta(entry, ctx),
              tag: entry.tag,
              go: t('audit.go_setting'),
              onOpen: () => this._chooseResult(entry, subKey),
            };
          })
        : [],
    };
  }

  /**
   * Chooses a result (section 5.8): a setting shown or waiting in an Add row opens at the field,
   * added where it waited; one a gate withholds opens at the setting that allows it; one stored
   * but not in use opens at its gate line's Reset; another layout's switches the scope first; a
   * page opens; Split This Calendar opens its entry's page at its row, and the calendar list the
   * overview at the list. Home Assistant's tabs open nothing.
   *
   * @param entry - The result
   * @param focusKey - Its row's `data-focus` key, which Back restores focus to
   */
  private _chooseResult(entry: Search.SearchEntry, focusKey: string): void {
    const { target, status } = entry;
    const ctx = this._ctx;
    if (target.kind === 'ha-tab') return;
    if (target.kind === 'page') {
      this._leaveResults({ kind: 'page', page: target.page }, focusKey);
      void this._afterMove();
      return;
    }
    if (target.kind === 'split' || target.kind === 'overview') {
      if (target.kind === 'split') this._leaveResults({ kind: 'entry', key: target.key }, focusKey);
      else {
        // The overview draws its list in place of the results, which Return to Results restores.
        this._resultsLeft = {
          route: this._nav.route,
          scrollTop: Focus.scrollPosition(this),
          focusKey,
          search: { query: this._filter.query, editHere: this._editHere },
        };
        this._jump = undefined;
      }
      void this.updateComplete.then(() => {
        const root = this.renderRoot;
        const place =
          target.kind === 'split'
            ? root.querySelector<HTMLElement>(Focus.byFocusKey('split-row'))
            : root.querySelector<HTMLElement>('[data-heading="calendars"] > .heading');
        if (place) {
          Focus.scrollToTopSettled(this, place);
          place.focus({ preventScroll: true });
        }
        this._say(this._string(ctx, 'search.showing', { label: entry.label }));
      });
      return;
    }
    switch (status.kind) {
      case 'other-layout': {
        this._pickScope(status.views[0] as Workspace.EditorWorkspace);
        // Once the scope has changed, the setting is chosen as that scope finds it.
        void this.updateComplete.then(() => {
          const found = this._searchIndex(this._ctx, this._drawing!.present).find(
            (each) => this._resultKey(each.target) === focusKey,
          );
          if (found && found.status.kind !== 'other-layout') this._chooseResult(found, focusKey);
        });
        return;
      }
      case 'gated':
      case 'inactive': {
        // A value the overview's own setting holds back is opened at that setting: the overview
        // draws no gate lines.
        if (status.kind === 'inactive' && (target.kind !== 'field' || target.page)) {
          this._openInactive(entry, target, focusKey);
          return;
        }
        const by = status.by;
        const labelOf = (id: FieldId): string => {
          const field =
            this._drawing!.present.get(id) ??
            universeIndex(ctx.language, this._workspace).fields.get(id);
          return field ? fieldLabel(field, ctx.language) : id;
        };
        const page = placementOf(by)?.page;
        const gateTarget: Search.FieldTarget =
          target.kind === 'entry-field' && by.startsWith('calendar:')
            ? { kind: 'entry-field', id: by, key: target.key }
            : {
                kind: 'field',
                id: by,
                page: page === 'overview' || page === 'entry' ? undefined : page,
              };
        this._openResult({ target: gateTarget, label: labelOf(by) }, focusKey, true, () =>
          this._string(ctx, 'search.needs_said', {
            label: entry.label,
            needs: entry.needs ?? '',
          }),
        );
        return;
      }
      default:
        this._openResult(
          { target, label: entry.label },
          focusKey,
          true,
          status.kind === 'add'
            ? () => this._string(ctx, 'announce.added', { label: entry.label })
            : undefined,
        );
    }
  }

  /**
   * Opens a value stored but not in use at its gate line, on its page, focused on the line's
   * Reset, or its Edit where the value is All Layouts'.
   *
   * @param entry - The result
   * @param target - What it opens: a field on a page, or an entry's field
   * @param focusKey - Its row's `data-focus` key
   */
  private _openInactive(
    entry: Search.SearchEntry,
    target: Search.FieldTarget,
    focusKey: string,
  ): void {
    const ctx = this._ctx;
    const route: Navigation.Route =
      target.kind === 'entry-field'
        ? { kind: 'entry', key: target.key }
        : { kind: 'page', page: (target.kind === 'field' && target.page) || 'card_header' };
    this._leaveResults(route, focusKey);
    void this.updateComplete.then(() => {
      const line = Focus.focusFirst(this.renderRoot, [
        Focus.byFocusKey(`reset:${target.id}`),
        Focus.byFocusKey(`edit:${target.id}:shared`),
        '.page-title',
      ]);
      if (line) Focus.scrollToTopSettled(this, line);
      this._say(this._string(ctx, 'search.showing', { label: entry.label }));
    });
  }

  /**
   * Opens a place from the results, which Return to Results and Back come back to.
   *
   * @param to - Where to go
   * @param focusKey - The result's `data-focus` key
   */
  private _leaveResults(to: Navigation.Route, focusKey: string): void {
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
      search: { query: this._filter.query, editHere: this._editHere },
    };
    this._closeDisclosures();
    this._nav = Navigation.go(this._nav, to, from);
    this._jump = this._resultsLeft = undefined;
  }

  /**
   * What a page draws under its header: each heading planned by `plan.ts` (section 5.2), what the
   * page holds besides its fields (the toolbar's own buttons, the column width table), and at its
   * foot one line per set of layouts that add settings here.
   *
   * @param page - The page
   * @param ctx - Schema context
   * @returns The body
   */
  private _renderPageBody(page: PageDef, ctx: SchemaCtx): unknown[] {
    const t = this._t(ctx);
    const pctx = this._planCtx(ctx);
    const plan = Plan.planPage(page, pctx);
    const present = this._drawing!.present;
    const parts = this._renderHeadings(
      plan.headings,
      pctx,
      ctx,
      CARD,
      present,
      { card: this._formData() },
      (field, show) => this._renderField(field, ctx, show),
      (heading) =>
        heading.extras?.includes('own-buttons') ? this._renderToolbarButtons(ctx) : nothing,
      this._pageTitle(page, ctx),
    );
    if (page.id === 'size_spacing') {
      const layout = PANELS.find((panel) => panel.id === 'layout')!;
      parts.push(...(layout.extras?.(ctx) ?? []).map((extra) => this._renderExtra(extra)));
    }
    const layout = this._layoutName(ctx);
    // Each line's Edit goes to a layout no line before it goes to, so no two read the same.
    const taken = new Set<Types.EffectiveView>();
    for (const line of plan.otherLayouts) {
      const target = line.views.find((view) => !taken.has(view)) ?? line.views[0];
      taken.add(target);
      const names = line.ids.map((id) => {
        const field = universeIndex('en', line.views[0]).fields.get(id);
        return field ? fieldLabel(field, ctx.language) : id;
      });
      const text =
        line.views.length === 1
          ? t('other_layouts.one', {
              layout: layout(line.views[0]),
              names: Shown.namesText(names, t),
            })
          : t('other_layouts.many', {
              layouts: EditorLocalize.formatList(
                ctx.language,
                line.views.map(layout),
                'conjunction',
              ),
              names: Shown.namesText(names, t),
            });
      parts.push(
        ShownView.otherLayoutsLine(text, t('add.count', { count: names.length }), {
          label: t('state.edit_layout', { layout: layout(target) }),
          focus: `edit-layout:${line.views.join('-')}`,
          onPress: () => this._pickScope(target),
        }),
      );
    }
    return parts;
  }

  /**
   * A heading's chips of one kind (section 5.9): the event parts, or the toolbar's controls.
   *
   * A chip is drawn where its field is offered in the scope at all (`chips.ts` › `inScope`), so
   * Now is absent in Grid and a line says so. A part offered but withheld by its gate is drawn
   * unpressable with its reason, so End Time and Duration stay in sight while Time is off; a
   * toolbar control is drawn only while the toolbar is. Pressed is the field's effective value in
   * the scope, and a press writes the other value through `_writeFieldValue`, one undo step. Each
   * chip's name carries its state words, as any field's does (section 5.3); under the chips, the
   * stored ones grouped by those words, a line with Reset or Remove for each one stored here, the
   * not-in-scope line, and the hint.
   *
   * @param kind - Which chips
   * @param heading - The heading they are placed under
   * @param pctx - Plan context
   * @param ctx - Schema context
   * @returns The group and its lines, or nothing where no chip is drawn
   */
  private _renderChips(
    kind: Chips.ChipKind,
    heading: HeadingDef,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const t = this._t(ctx);
    const present = this._drawing!.present;
    const workspace = pctx.workspace;
    const data = this._formData();
    const layout = this._layoutName(ctx);
    const label = (id: FieldId): string => this._string(ctx, Chips.CHIP_LABELS[id]);
    const placed = heading.fields.filter(
      ([, appearance]) =>
        typeof appearance === 'object' && 'chips' in appearance && appearance.chips === kind,
    );
    const sources = new Map<string, string[]>();
    const actions: ShownView.LineButton[] = [];
    const chips = placed.flatMap(([id, appearance]): ChipsView.ChipModel[] => {
      if (!Chips.inScope(id, workspace)) return [];
      const field = present.get(id);
      if (field === undefined && kind === 'toolbar') return [];
      if (field === undefined) {
        const needs = Chips.needsPart(
          id,
          { card: data },
          ctx.language,
          (each) => this._string(ctx, parseFieldId(each).name),
          label,
        );
        return [
          {
            id,
            label: label(id),
            name: label(id),
            pressed: false,
            needs: this._string(ctx, 'chip.needs', { part: needs ?? '' }),
            onPress: () => undefined,
          },
        ];
      }
      const pressed = Chips.isPressed(Routing.atPath(data, field.dataPath, field.node.name));
      const state = Plan.stateOf(field, pctx);
      const words = Shown.stateText(state, t, layout, this._wordOf(field, ctx));
      if (words !== undefined && state?.words?.kind !== 'layout-default') {
        const pairs = sources.get(words) ?? [];
        pairs.push(
          t('summary.pair', {
            label: label(id),
            value: t(pressed ? 'summary.on' : 'summary.off'),
          }),
        );
        sources.set(words, pairs);
      }
      const action = this._resetActionOf(id, appearance, pctx, CARD);
      if (action !== undefined) {
        const name = fieldLabel(field, ctx.language);
        const forLayout =
          state?.words?.kind === 'set-layout' ? layout(state.words.view) : undefined;
        actions.push({
          label: t('value_source.reset', { option: label(id) }),
          name:
            action === 'reset'
              ? forLayout
                ? t('reset.reset_for', { label: name, layout: forLayout })
                : t('value_source.reset', { option: name })
              : interpolate(forLayout ? t('reset.remove_for') : t('reset.remove_named'), {
                  label: name,
                  layout: forLayout ?? '',
                }),
          focus: `${action}:${id}`,
          kind: action,
          resetKeys: this._storedKeys(field, pctx, CARD),
          onPress: () => this._resetField(field, CARD, action, name, heading.key),
        });
      }
      return [
        {
          id,
          label: label(id),
          name: words === undefined ? label(id) : `${label(id)}, ${words}`,
          pressed,
          yaml: this._prefs.yaml
            ? t('search.yaml', { path: this._yamlPath(field, ctx) })
            : undefined,
          onPress: () =>
            this._commit(
              t('history.change', { setting: fieldLabel(field, ctx.language) }),
              undefined,
              () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, !pressed),
              `field:${id}`,
            ),
        },
      ];
    });
    if (chips.length === 0) return nothing;
    const absent = placed.map(([id]) => id).filter((id) => !Chips.inScope(id, workspace));
    const view = Workspace.viewForWorkspace(workspace);
    const source = [...sources].flatMap(([where, pairs]) => [where, ...pairs]);
    const group = ChipsView.chipGroup(
      kind === 'parts' ? (this._headingTitle(heading, ctx) ?? '') : t('toolbar.controls'),
      chips,
      kind === 'toolbar',
    );
    const jumped = chips.some(
      ({ id }) => this._jump?.target.kind === 'field' && this._jump.target.id === id,
    );
    return html`${jumped ? this._jumpTo(ctx, group) : group}
      ${
        source.length > 0
          ? html`<p class="hint chip-source">${source.join(Summary.SUMMARY_SEPARATOR)}</p>`
          : nothing
      }
      ${ShownView.fieldLine({ stored: true, notes: [], actions })}
      ${
        absent.length > 0 && view !== undefined
          ? html`<p class="hint">
              ${t('chip.not_in', {
                layout: layout(view),
                names: absent.map(label).join(', '),
              })}
            </p>`
          : nothing
      }
      <p class="hint">${t(kind === 'parts' ? 'chip.hint' : 'toolbar.controls.hint')}</p>`;
  }

  /**
   * Calendar Filter as a segmented radio group of its options, Off, Menu and Chips (section
   * 5.9), its state words in its name, and under it the line every field has (section 5.3): what
   * Reset gives and Reset. Picking writes through `_writeFieldValue`, one undo step.
   *
   * @param field - `card:toolbar.legend`
   * @param appearance - Its appearance
   * @param pctx - Plan context
   * @param ctx - Schema context
   * @param heading - Its heading's key, for focus after Reset
   * @returns The group
   */
  private _renderSegmented(
    field: IndexedField,
    appearance: Appearance,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
    heading?: string,
  ): TemplateResult {
    const show = this._fieldShow(field, appearance, pctx, ctx, CARD, heading);
    const drawn = html`${this._segmentedControl(field, ctx, show.words)} ${show.line}`;
    return this._jump?.target.kind === 'field' && this._jump.target.id === field.id
      ? this._jumpTo(ctx, drawn)
      : drawn;
  }

  /**
   * Calendar Filter's radio group, as its page draws it and as What This Card Changes' Edit
   * mounts it alone.
   *
   * @param field - `card:toolbar.legend`
   * @param ctx - Schema context
   * @param words - Its state words, where drawn with them
   * @returns The group
   */
  private _segmentedControl(field: IndexedField, ctx: SchemaCtx, words?: string): TemplateResult {
    const id = field.id;
    const name = fieldLabel(field, ctx.language);
    const workspace = ctx.workspace ?? ctx.view;
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const value = Routing.atPath(all, field.dataPath, field.node.name);
    return ChipsView.segmented({
      id,
      label: name,
      words,
      helper: this._string(ctx, 'toolbar.legend.helper'),
      value: String(value ?? LEGEND_OFF),
      options: LEGEND_EDITOR_VALUES.map((option) => ({
        value: option,
        label: this._string(ctx, `toolbar.legend.option.${option}.label`),
      })),
      onPick: (next) =>
        this._commit(
          this._string(ctx, 'history.change', { setting: name }),
          undefined,
          () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, next, workspace),
          `field:${id}`,
        ),
    });
  }

  /**
   * One part or toolbar control as the chip its page draws it as, alone: What This Card Changes'
   * Edit mounts it, pressed as the line's scope reads it, and a press writes in that scope.
   *
   * @param field - The chip's field
   * @param ctx - Schema context, for the line's scope
   * @returns The chip, in a group named for its setting
   */
  private _renderLoneChip(field: IndexedField, ctx: SchemaCtx): TemplateResult {
    const id = field.id;
    const workspace = ctx.workspace ?? ctx.view;
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const pressed = Chips.isPressed(Routing.atPath(all, field.dataPath, field.node.name));
    const name = fieldLabel(field, ctx.language);
    const label = this._string(ctx, Chips.CHIP_LABELS[id]);
    return ChipsView.chipGroup(
      name,
      [
        {
          id,
          label,
          name: label,
          pressed,
          onPress: () =>
            this._commit(
              this._string(ctx, 'history.change', { setting: name }),
              undefined,
              () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, !pressed, workspace),
              `field:${id}`,
            ),
        },
      ],
      false,
    );
  }

  /**
   * A section page: its header, the scope it is edited for (or that it applies to the whole
   * card, or only to Grid), its note, its headings and Back at its foot.
   *
   * @param page - The page
   * @param ctx - Schema context
   * @returns The page
   */
  private _renderPage(page: PageDef, ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const scope =
      page.onlyIn !== undefined
        ? PageView.pageLine(t('settings_for.grid_only'))
        : isWholeCard(page)
          ? PageView.pageLine(this._string(ctx, 'value_source.card'))
          : this._renderScope(ctx);
    return html`<div class="page" data-page=${page.id}>
      ${PageView.pageHead(this._pageTitle(page, ctx), t, this._back, this._renderHistory(ctx))}
      ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)} ${scope}
      ${page.noteKey ? PageView.pageLine(this._string(ctx, page.noteKey)) : nothing}
      ${this._renderPageBody(page, ctx)} ${PageView.footBack(t, this._back)}
    </div>`;
  }

  /**
   * Renders panel content that is not a form field.
   *
   * @param extra - Content to render
   * @returns The template
   */
  private _renderExtra(extra: PanelExtra): TemplateResult {
    return html`
      <div class="width-table">
        <div class="width-table-title">${extra.title}</div>
        <table>
          ${extra.rows.map(
            (row) => html`
              <tr>
                <td class="width-table-width">${row.width}</td>
                <td class="width-table-layout">${row.layout}</td>
              </tr>
            `,
          )}
        </table>
        <div class="width-table-note">${extra.note}</div>
      </div>
    `;
  }

  /**
   * Each calendar entry's form: what is declared for it, with what its layout ignores withheld.
   *
   * @param subform - The entries' sub-form
   * @param ctx - Schema context
   * @returns Every entry, with its key and its schema
   */
  private _entrySchemas(
    subform: { path: ReadonlyArray<string>; schema: ReadonlyArray<HaFormSchema> },
    ctx: SchemaCtx,
  ) {
    const toolbar = Config.resolveToolbar(ctx.config);
    const hasLegend = toolbar.show && toolbar.legend !== false;
    const entries = this._config?.entities ?? [];
    const keys = this._entryKeysFor(entries.length);
    return entries.map((entry, index) => {
      const declared = entitySchemaFor(
        subform.schema as HaFormSchema[],
        Entities.labelTypeOf(entry),
        accentColorModeOf(Entities.asEntityConfig(entry).accent_color),
        labelIconSourceOf(Entities.asEntityConfig(entry).label),
        Entities.showsLocation(entry, ctx.config, this._destinationView(ctx)),
        labelImageSourceOf(Entities.asEntityConfig(entry).label),
        hasLegend,
        showsEventWeather(ctx.config.weather),
      );
      const schema = Filter.withholdInertFields(declared, ctx.workspace ?? ctx.view, 'entity');
      return { entry, index, key: keys[index], schema };
    });
  }

  /**
   * Each toolbar button's form.
   *
   * @param subform - The buttons' sub-form
   * @returns Every button, with its key, its fields, its schema and its data
   */
  private _buttonSchemas(subform: {
    path: ReadonlyArray<string>;
    schema: ReadonlyArray<HaFormSchema>;
  }) {
    const written = Buttons.writtenButtons(this._config!);
    const keys = this._buttonKeysFor(written.length);
    const fields = subform.schema.filter((node) => !Filter.isHeading(node));
    return written.map((entry, index) => ({
      entry,
      index,
      key: keys[index],
      schema: fields,
      data: Buttons.toButtonFormData(entry),
    }));
  }

  /**
   * The entries' sub-form: the schema every calendar entry's page draws.
   *
   * @param ctx - Schema context
   * @returns The sub-form
   */
  private _entrySubform(ctx: SchemaCtx): SubformDef {
    return this._subform('calendars', ENTITY_PATH, ctx);
  }

  /**
   * The toolbar buttons' sub-form: the schema every button's row draws.
   *
   * @param ctx - Schema context
   * @returns The sub-form
   */
  private _buttonSubform(ctx: SchemaCtx): SubformDef {
    return this._subform('card', TOOLBAR_BUTTON_PATH, ctx);
  }

  /**
   * A panel's sub-form, by its path.
   *
   * @param id - The panel
   * @param path - The sub-form's path
   * @param ctx - Schema context
   * @returns The sub-form
   */
  private _subform(id: string, path: ReadonlyArray<string>, ctx: SchemaCtx): SubformDef {
    return PANELS.find((panel) => panel.id === id)!.subforms!(ctx).find(
      (candidate) => candidate.path.join('.') === path.join('.'),
    )!;
  }

  /**
   * The list as `calendar-list.ts` reads it: the entries and their keys.
   *
   * @returns The list
   */
  private _listState(): CalendarList.ListState {
    const entities = this._config?.entities ?? [];
    return { entities, keys: this._entryKeysFor(entities.length) };
  }

  /**
   * Stores a list a calendar-list operation made, its keys first: Home Assistant's echo can
   * arrive before the report returns.
   *
   * @param next - The list
   */
  private _writeList(next: CalendarList.ListState): void {
    this._entryKeys = [...next.keys];
    this._config = { ...this._config!, entities: [...next.entities] };
    this._report(this._config);
  }

  /**
   * A calendar's name on this card: the one the card gives it, else Home Assistant's, else its
   * id.
   *
   * @param entityId - The calendar
   * @returns The name
   */
  private _calendarName(entityId: string): string {
    return (
      configuredCalendarName(this._config?.entities ?? [], entityId) ??
      Entities.entityDisplayName(entityId, this.hass)
    );
  }

  /**
   * What an entry is called in its controls' names: its calendar's name, and inside a calendar
   * with several entries its first part ("Family, All-day events").
   *
   * @param key - The entry's key
   * @returns The name
   */
  private _entryName(key: number): string {
    const state = this._listState();
    return CalendarList.rowName(
      state,
      state.keys.indexOf(key),
      this._ctx.language,
      this.hass ?? undefined,
    );
  }

  /**
   * Whether Home Assistant no longer has a calendar.
   *
   * @param entityId - The calendar
   * @returns True where it has no state for it
   */
  private _missing(entityId: string): boolean {
    return this.hass?.states?.[entityId] === undefined;
  }

  /**
   * An entry's summary parts, led by "Not found in Home Assistant" where its calendar is gone.
   *
   * @param entry - The entry
   * @param ctx - Schema context
   * @returns At most two parts
   */
  private _rowParts(entry: string | Types.EntityConfig, ctx: SchemaCtx): string[] {
    const parts = CalendarList.rowParts(entry, ctx.language);
    return this._missing(Synthetic.entityIdOf(entry))
      ? [this._string(ctx, 'calendars.missing'), ...parts].slice(0, 2)
      : [...parts];
  }

  /**
   * The dot's color: the entry's own accent, else the card's, where either is a color rather
   * than a source to follow.
   *
   * @param entry - The entry
   * @returns A CSS color, or `undefined` to draw the theme's
   */
  private _rowColor(entry: string | Types.EntityConfig): string | undefined {
    for (const value of [Entities.asEntityConfig(entry).accent_color, this._config?.accent_color]) {
      if (
        typeof value === 'string' &&
        value.trim() !== '' &&
        !EntityColors.isEntityColorSentinel(value)
      ) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * The actions a row's strip offers, on the overview or in an entry page's menu.
   *
   * @param rowKey - The strip's key
   * @param entityId - The row's calendar
   * @param entryKey - The entry, for a row that is one; absent for a calendar's own row
   * @param onPage - Whether the strip is an entry page's menu, which names the moves' keys
   * @param ctx - Schema context
   * @returns The actions
   */
  private _stripActions(
    rowKey: string,
    entityId: string,
    entryKey: number | undefined,
    onPage: boolean,
    ctx: SchemaCtx,
  ): CalendarView.StripAction[] {
    const state = this._listState();
    const calendars = CalendarList.groups(state);
    const place = calendars.findIndex((calendar) => calendar.entityId === entityId);
    const total = calendars[place]?.rows.length ?? 0;
    const name = this._calendarName(entityId);
    const focus = `strip:${rowKey}:`;
    const actions: CalendarView.StripAction[] = [];
    if (entryKey === undefined || total === 1) {
      const last = place === calendars.length - 1;
      actions.push(
        {
          id: 'up',
          label: this._string(ctx, 'toolbar.buttons.move_up'),
          name: this._string(ctx, 'strip.move_up', { name }),
          keys: onPage ? this._string(ctx, 'strip.key_up') : undefined,
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, place - 1, `${focus}up`),
        },
        {
          id: 'down',
          label: this._string(ctx, 'toolbar.buttons.move_down'),
          name: this._string(ctx, 'strip.move_down', { name }),
          keys: onPage ? this._string(ctx, 'strip.key_down') : undefined,
          disabled: last,
          onPress: () => this._moveCalendar(entityId, place + 1, `${focus}down`),
        },
        {
          id: 'top',
          label: this._string(ctx, 'strip.move_top_label'),
          name: this._string(ctx, 'strip.move_top', { name }),
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, 0, `${focus}top`),
        },
      );
    }
    if (entryKey === undefined) {
      actions.push({
        id: 'remove',
        label: this._string(ctx, 'entity.remove'),
        name: this._string(ctx, 'strip.remove_calendar', {
          name,
          count: total,
        }),
        danger: true,
        onPress: () => this._removeCalendar(entityId),
      });
      return actions;
    }
    const entry = this._entryOf(entryKey)!;
    const entryName = this._entryName(entryKey);
    if (onPage) {
      // First in the page's ⋮, as the row under Which Events opens it too (D12).
      actions.unshift({
        id: 'split',
        label: this._string(ctx, 'split.title'),
        name: this._string(ctx, 'split.named', { name: entryName }),
        onPress: () => this._openSplit(entryKey),
      });
    }
    const from = Entities.copiedFrom();
    const copied = Entities.copiedSettings() !== undefined;
    actions.push(
      {
        id: 'duplicate',
        label: this._string(ctx, 'entity.duplicate'),
        name: this._string(ctx, 'strip.duplicate', { name: entryName }),
        onPress: () => this._duplicateEntry(entryKey),
      },
      {
        id: 'copy',
        label: this._string(ctx, 'entity.copy'),
        name: this._string(ctx, 'strip.copy', { name: entryName }),
        disabled: !Entities.hasTransferableSettings(entry),
        onPress: () => this._copyEntry(entryKey),
      },
      {
        id: 'paste',
        label: this._string(ctx, 'entity.paste'),
        name: this._string(ctx, 'strip.paste', { name: entryName }),
        note: !copied
          ? this._string(ctx, 'strip.paste_empty')
          : from === undefined
            ? undefined
            : this._string(ctx, 'strip.paste_from', { name: from }),
        disabled: !copied,
        onPress: () => this._pasteEntry(entryKey),
      },
      {
        id: 'remove',
        label:
          total > 1 ? this._string(ctx, 'strip.remove_entry') : this._string(ctx, 'entity.remove'),
        name: interpolate(
          total > 1
            ? this._string(ctx, 'strip.remove_entry_named')
            : this._string(ctx, 'strip.remove'),
          { name: entryName },
        ),
        danger: true,
        onPress: () => this._removeEntry(entryKey),
      },
    );
    return actions;
  }

  /**
   * Opens or closes a row's strip, closing any other.
   *
   * @param rowKey - The strip's key
   */
  private _toggleStrip(rowKey: string): void {
    this._openStrip = this._openStrip === rowKey ? undefined : rowKey;
  }

  /**
   * One row's ⋮, and its strip while open.
   *
   * @param rowKey - The strip's key
   * @param name - Whose actions: "Actions for Anna"
   * @param entityId - The row's calendar
   * @param entryKey - The entry, for a row that is one
   * @param moves - Whether Alt+Arrow moves the calendar from the row
   * @param ctx - Schema context
   * @returns The button and the strip
   */
  private _rowMore(
    rowKey: string,
    name: string,
    entityId: string,
    entryKey: number | undefined,
    moves: boolean,
    ctx: SchemaCtx,
  ): { more: CalendarView.MoreButton; strip?: TemplateResult } {
    const open = this._openStrip === rowKey;
    const label = this._string(ctx, 'calendars.actions', { name });
    return {
      more: {
        key: rowKey,
        name: label,
        open,
        moves: moves ? entityId : undefined,
        onToggle: () => this._toggleStrip(rowKey),
      },
      strip: open
        ? CalendarView.strip(
            rowKey,
            label,
            this._stripActions(rowKey, entityId, entryKey, false, ctx),
          )
        : undefined,
    };
  }

  /**
   * The calendars the list draws, each with its rows: every entry, narrowed by Filter Calendars.
   *
   * @param ctx - Schema context
   * @returns The calendars, in list order
   */
  private _calendarModels(ctx: SchemaCtx): CalendarView.CalendarModel[] {
    const state = this._listState();
    const entities = state.entities;
    // Case and surrounding space ignored.
    const query = this._calendarQuery.trim().toLowerCase();
    const matches = (texts: ReadonlyArray<unknown>): boolean =>
      texts.some((text) => typeof text === 'string' && text.toLowerCase().includes(query));
    const set = (entry: string | Types.EntityConfig) =>
      this._string(ctx, 'summary.set', {
        count: CalendarList.setCount(entry),
      });
    const grab = this._grabbed('calendar');
    const calendars = CalendarList.groups(state);
    const preview =
      grab === undefined ? undefined : Reorder.order(this._calendarKeys(calendars), grab);
    return calendars.flatMap((calendar) => {
      const name = this._calendarName(calendar.entityId);
      const grouped = calendar.rows.length > 1;
      const missing = this._missing(calendar.entityId);
      const key = calendar.rows[0].key;
      const handle = this._handle('calendar', calendar.entityId, key, name, ctx);
      const rows = calendar.rows.flatMap((row): CalendarView.EntryRowModel[] => {
        const entry = entities[row.index];
        const parts = this._rowParts(entry, ctx);
        const label = Entities.asEntityConfig(entry).label;
        if (query !== '' && !matches([name, ...parts, label])) {
          return [];
        }
        const rowName = CalendarList.rowName(
          state,
          row.index,
          ctx.language,
          this.hass ?? undefined,
        );
        const { more, strip } = this._rowMore(
          `entry:${row.key}`,
          rowName,
          calendar.entityId,
          row.key,
          !grouped,
          ctx,
        );
        const position = this._string(ctx, 'calendars.position', {
          position: row.position,
          total: row.total,
        });
        const described = grouped
          ? [name, ...parts, set(entry), position]
          : [name, ...parts, set(entry)];
        return [
          {
            key: row.key,
            title: grouped ? parts.join(Summary.SUMMARY_SEPARATOR) : name,
            summary: grouped ? set(entry) : [...parts, set(entry)].join(Summary.SUMMARY_SEPARATOR),
            editName: this._string(ctx, 'calendars.edit', {
              row: described.join(', '),
            }),
            color: this._rowColor(entry),
            badge:
              Entities.labelTypeOf(entry) === 'text' && typeof label === 'string' && label !== ''
                ? label
                : undefined,
            missing,
            tag: this._newEntries.has(row.key) ? this._string(ctx, 'split.new') : undefined,
            moves: grouped ? undefined : calendar.entityId,
            handle: grouped ? undefined : handle,
            more,
            strip,
            onOpen: () => this._open({ kind: 'entry', key: row.key }, `row:${row.key}`),
          },
        ];
      });
      if (rows.length === 0) return [];
      const head = grouped
        ? {
            handle,
            name,
            count: this._string(ctx, 'calendars.entries', {
              count: calendar.rows.length,
            }),
            missing,
            ...this._rowMore(
              `calendar:${calendar.entityId}`,
              name,
              calendar.entityId,
              undefined,
              true,
              ctx,
            ),
          }
        : undefined;
      return [
        {
          entityId: calendar.entityId,
          grabbed: grab?.key === key,
          place: preview?.indexOf(key),
          head,
          rows,
        },
      ];
    });
  }

  /**
   * Each calendar's key for reordering: its first entry's, which a move keeps.
   *
   * @param calendars - The calendars, else the list's
   * @returns The keys, in list order
   */
  private _calendarKeys(
    calendars: ReadonlyArray<CalendarList.CalendarGroup> = CalendarList.groups(this._listState()),
  ): number[] {
    return calendars.map((calendar) => calendar.rows[0].key);
  }

  /**
   * The keys of a list that reorders: each calendar's (its first entry's), or each button's.
   *
   * @param list - Which list
   * @returns The keys, in list order
   */
  private _reorderKeys(list: ReorderList): number[] {
    return list === 'calendar'
      ? this._calendarKeys()
      : [...this._buttonKeysFor(Buttons.writtenButtons(this._config!).length)];
  }

  /**
   * The keyboard grab on a list, while the list still holds its row where it was picked up; a
   * grab the list has moved under (another editor's write, an undo) holds nothing.
   *
   * @param list - Which list, else either
   * @returns The grab, or undefined
   */
  private _grabbed(list?: ReorderList): Grab | undefined {
    const grab = this._grab;
    if (grab === undefined || (list !== undefined && grab.list !== list) || !this._config) {
      return undefined;
    }
    const keys = this._reorderKeys(grab.list);
    return keys.length === grab.total && keys[grab.from] === grab.key ? grab : undefined;
  }

  /**
   * A row's drag handle (section 5.11), a calendar's or a toolbar button's: Space picks it up and
   * drops it, the arrow keys move it while held, Alt+Arrow moves it at once, and a pointer drags
   * it.
   *
   * @param list - Which list
   * @param id - The calendar's entity id, or the button's key
   * @param key - Its key for reordering
   * @param name - Its name
   * @param ctx - Schema context
   * @returns The handle
   */
  private _handle(
    list: ReorderList,
    id: string,
    key: number,
    name: string,
    ctx: SchemaCtx,
  ): TemplateResult {
    return ReorderView.dragHandle({
      focus: handleFocus(list, id),
      moves: list === 'calendar' ? id : undefined,
      name: this._string(ctx, 'reorder.handle', { name }),
      tooltip: this._string(ctx, 'reorder.tooltip', { name }),
      pressed: this._grabbed(list)?.key === key,
      onKeydown: (event) => this._handleKeydown(event, list, key),
      onClick: () => {
        // A Space the keydown already took, or the end of a drag, also clicks.
        if (this._swallowClick) this._swallowClick = false;
        else this._toggleGrab(list, key);
      },
      onPointerdown: (event) => {
        this._swallowClick = false;
        this._dragStart(event, list);
      },
      onBlur: () => {
        this._swallowClick = false;
        const grab = this._grabbed(list);
        if (grab?.key === key) this._putBack(grab, false);
      },
    });
  }

  /**
   * A key on a handle: Space picks its row up or drops it; while it is held, the arrow keys move
   * it one place, focus staying on the handle. Escape reaches the editor's own rule
   * (`_onKeydown`), and Alt+Arrow without a grab moves the row at once (`_moveByKey`).
   *
   * @param event - The `keydown`
   * @param list - Which list
   * @param key - The handle's row key
   */
  private _handleKeydown(event: KeyboardEvent, list: ReorderList, key: number): void {
    const grab = this._grabbed(list);
    const arrow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    const space =
      event.key === ' ' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    // The button may click on Space's keyup as well: that click is swallowed. Any other key, Enter
    // among them, clicks for itself.
    this._swallowClick = space;
    if (space) {
      if (!event.repeat) this._toggleGrab(list, key);
    } else if (grab?.key === key && arrow !== 0) {
      this._grab = { ...Reorder.moveBy(grab, arrow), list };
      this._sayGrab(this._grab, false);
      // The held row stays in sight as it moves past the edge of what scrolls the editor.
      const row = (event.currentTarget as Element).closest('[data-reorder]');
      void this.updateComplete.then(() => row?.scrollIntoView?.({ block: 'nearest' }));
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Picks a row up, or drops the one held: the drop writes once, where it moved.
   *
   * @param list - Which list
   * @param key - The row's key
   */
  private _toggleGrab(list: ReorderList, key: number): void {
    const grab = this._grabbed(list);
    if (grab !== undefined) {
      if (grab.key !== key) return;
      this._grab = undefined;
      if (grab.at === grab.from) this._putBack(grab, true);
      else if (list === 'button') this._moveButton(grab.from, grab.at, handleFocus(list, key));
      else {
        const entityId = this._grabbedCalendar(grab);
        this._moveCalendar(entityId, grab.at, handleFocus(list, entityId));
      }
      return;
    }
    if (this._drag !== undefined) return;
    this._grab = { ...Reorder.grab(this._reorderKeys(list), key), list };
    this._sayGrab(this._grab, true);
  }

  /**
   * The calendar a grab holds.
   *
   * @param grab - The grab, still valid
   * @returns Its entity id
   */
  private _grabbedCalendar(grab: Reorder.GrabState): string {
    return CalendarList.groups(this._listState())[grab.from].entityId;
  }

  /**
   * The name of the row a grab holds: its calendar's, or its button's.
   *
   * @param grab - The grab, still valid
   * @returns The name
   */
  private _grabbedName(grab: Grab): string {
    if (grab.list === 'calendar') return this._calendarName(this._grabbedCalendar(grab));
    return Buttons.buttonTitle(
      Buttons.writtenButtons(this._config!)[grab.from],
      grab.from,
      this._string(this._ctx, 'toolbar.buttons.untitled'),
    );
  }

  /**
   * The grab's words: where the held row stands, and as it is picked up the keys, the same words
   * the line under the list shows.
   *
   * @param grab - The grab
   * @param keys - Whether to say the keys too
   */
  private _sayGrab(grab: Grab, keys: boolean): void {
    const ctx = this._ctx;
    const position = this._grabPosition(grab, ctx);
    this._say(
      keys ? `${position} ${this._string(ctx, 'reorder.keys', this._keyCaps(ctx))}` : position,
    );
  }

  /**
   * "Anna, position 2 of 5.", for a grab.
   *
   * @param grab - The grab
   * @param ctx - Schema context
   * @returns The sentence
   */
  private _grabPosition(grab: Grab, ctx: SchemaCtx): string {
    return this._string(ctx, 'reorder.status', {
      name: this._grabbedName(grab),
      position: grab.at + 1,
      total: grab.total,
    });
  }

  /**
   * What the key caps in the grab's line read.
   *
   * @param ctx - Schema context
   * @returns The caps, by placeholder
   */
  private _keyCaps(ctx: SchemaCtx): Record<string, string> {
    return {
      up: '↑',
      down: '↓',
      space: this._string(ctx, 'reorder.space'),
      esc: this._string(ctx, 'reorder.esc'),
    };
  }

  /**
   * Puts the held row back where it was picked up, writing nothing, and says so.
   *
   * @param grab - The grab
   * @param refocus - Whether focus returns to its handle: after Escape, not after focus left it
   */
  private _putBack(grab: Grab, refocus: boolean): void {
    const name = this._grabbedName(grab);
    const id = grab.list === 'calendar' ? this._grabbedCalendar(grab) : String(grab.key);
    this._grab = undefined;
    this._sayPutBack(name, grab.from, grab.total);
    if (refocus) {
      this._focusSoon([Focus.byFocusKey(handleFocus(grab.list, id))]);
    }
  }

  /**
   * Says a row is back where it was: "Put Anna back at position 2 of 5."
   *
   * @param name - The row's name
   * @param at - Its place, which nothing has moved, counting from zero
   * @param total - How many rows the list has
   */
  private _sayPutBack(name: string, at: number, total: number): void {
    this._say(
      this._string(this._ctx, 'reorder.put_back', {
        name,
        position: at + 1,
        total: total,
      }),
    );
  }

  /**
   * A pointer pressed on a handle: once it travels, the row follows it, and letting go drops it
   * where it is shown, as one write; a cancel puts it back.
   *
   * @param event - The `pointerdown`
   * @param list - Which list
   */
  private _dragStart(event: PointerEvent, list: ReorderList): void {
    if (this._drag !== undefined || this._grabbed() !== undefined) return;
    this._drag = ReorderView.pointerDrag(event, scrollContainer(this), (outcome) => {
      this._drag = undefined;
      if (outcome === undefined || !this._config) return;
      // The click a mouse makes on letting go; a touch makes none, and the next press clears it.
      this._swallowClick = true;
      const id = outcome.ids[outcome.from];
      if (list === 'button') {
        const keys = this._reorderKeys(list).map(String);
        const from = keys.indexOf(id);
        // A button a change from outside took away goes nowhere to be put back.
        if (from < 0) return;
        if (!outcome.dropped) {
          const name = Buttons.buttonTitle(
            Buttons.writtenButtons(this._config)[from],
            from,
            this._string(this._ctx, 'toolbar.buttons.untitled'),
          );
          this._sayPutBack(name, from, keys.length);
        } else if (outcome.at !== outcome.from) {
          this._moveButton(
            from,
            Reorder.placeIn(keys, outcome.ids, id, outcome.at),
            handleFocus(list, id),
          );
        }
        return;
      }
      const all = CalendarList.groups(this._listState()).map((calendar) => calendar.entityId);
      if (!outcome.dropped) {
        // A calendar a change from outside took off the card goes nowhere to be put back.
        if (all.includes(id)) {
          this._sayPutBack(this._calendarName(id), all.indexOf(id), all.length);
        }
      } else if (outcome.at !== outcome.from) {
        this._moveCalendar(
          id,
          Reorder.placeIn(all, outcome.ids, id, outcome.at),
          handleFocus(list, id),
        );
      }
    });
  }

  /**
   * The Calendars block: its heading, the line an applied story left, Filter Calendars above a
   * long list, the list with the line a removal left where the row was, or the empty state, and
   * Add Calendar.
   *
   * Under Essentials Only or Customized Only the rows are those whose page keeps a field. Add
   * Calendar stays under both, which a browser remembers, so a calendar can always be added. A
   * query never narrows the list: it shows results in its place (`_renderResults`).
   *
   * @param ctx - Schema context
   * @returns The block
   */
  private _renderCalendars(ctx: SchemaCtx): TemplateResult {
    const entities = this._config?.entities ?? [];
    const calendars = this._calendarModels(ctx);
    const status = this._status;
    const bar =
      status?.kind === 'entry'
        ? { at: status.at, bar: this._renderStatus(ctx, ['entry']) as TemplateResult }
        : undefined;
    const list =
      entities.length === 0 && bar === undefined
        ? CalendarView.emptyCalendars(
            this._string(ctx, 'calendars.empty'),
            this._string(ctx, 'calendars.empty_note'),
          )
        : calendars.length === 0 && bar === undefined
          ? html`<p class="hint">${this._string(ctx, 'calendars.no_match')}</p>`
          : CalendarView.calendarList(calendars, bar);
    return html`<section class="page-group cal-block" data-heading="calendars">
      <h3 class="heading" tabindex="-1">${this._string(ctx, CALENDARS_BLOCK.titleKey)}</h3>
      ${this._renderStatus(ctx, ['story'])}
      ${
        // Kept while it holds a query, so a removal below eight rows cannot strand one.
        entities.length >= CALENDAR_FILTER_ROWS || this._calendarQuery !== ''
          ? CalendarView.calendarFilter(
              this._string(ctx, 'calendars.filter'),
              this._calendarQuery,
              (value) => {
                this._calendarQuery = value;
              },
            )
          : nothing
      }
      ${list} ${this._renderGrabStatus(ctx, 'calendar')} ${this._renderAddCalendar(ctx)}
    </section>`;
  }

  /**
   * The keyboard grab's line under a list, while a row of it is held: where it stands and the
   * keys (the D10 mockup), plain text whose words the queue speaks.
   *
   * @param ctx - Schema context
   * @param list - Which list
   * @returns The line, or nothing
   */
  private _renderGrabStatus(ctx: SchemaCtx, list: ReorderList): TemplateResult | typeof nothing {
    const grab = this._grabbed(list);
    return grab === undefined
      ? nothing
      : ReorderView.grabStatus(
          this._grabPosition(grab, ctx),
          this._string(ctx, 'reorder.keys'),
          this._keyCaps(ctx),
        );
  }

  /**
   * Add Calendar: its button, or once pressed Home Assistant's picker over the calendars not on
   * the card, then Cancel and Add. Choosing writes nothing; Add does, and opens the new entry's
   * page (WCAG 3.2.2).
   *
   * @param ctx - Schema context
   * @returns The control
   */
  private _renderAddCalendar(ctx: SchemaCtx): TemplateResult {
    const adding = this._adding;
    if (adding === undefined) {
      return CalendarView.textButton(
        {
          label: this._string(ctx, 'calendars.add'),
          focus: 'add-calendar',
          onPress: () => {
            this._adding = {};
            this._focusSoon([Focus.byFocusKey('add-picker')]);
          },
        },
        ' add-calendar-button',
      );
    }
    const chassis = Subforms.chassisSchemas(ctx.language);
    const shown = [...new Set((this._config?.entities ?? []).map(Synthetic.entityIdOf))];
    const schema = this._keep('add.schema', shown, () =>
      chassis.addCalendar.map((node) =>
        'selector' in node && 'entity' in node.selector
          ? {
              ...node,
              selector: { entity: { ...node.selector.entity, exclude_entities: shown } },
            }
          : node,
      ),
    );
    const data = this._intern(
      'add.data',
      adding.chosen === undefined ? {} : { pick: adding.chosen },
    );
    const [hass, feed] = this._feed(schema, ctx.language);
    const chosen = adding.chosen;
    const already =
      chosen !== undefined && shown.includes(chosen)
        ? {
            line: this._string(ctx, 'calendars.already', {
              name: this._calendarName(chosen),
            }),
            open: {
              label: this._string(ctx, 'calendars.open', {
                name: this._calendarName(chosen),
              }),
              focus: 'add-open',
              onPress: () => {
                const key = CalendarList.groups(this._listState()).find(
                  (calendar) => calendar.entityId === chosen,
                )?.rows[0]?.key;
                this._adding = undefined;
                if (key !== undefined) this._open({ kind: 'entry', key }, 'add-calendar');
              },
            },
          }
        : undefined;
    const picker = html`<div
      class="field"
      data-focus="add-picker"
      tabindex="-1"
      role="group"
      aria-label=${this._string(ctx, 'calendars.pick')}
    >
      <ha-form
        class="add-calendar-form"
        data-hass=${feed}
        .hass=${hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._keep(
          'add.label',
          ctx.language,
          () => () => this._string(ctx, 'calendars.pick'),
        )}
        .computeHelper=${this._keep(
          'add.helper',
          ctx.language,
          () => () => this._string(ctx, 'calendars.pick.helper'),
        )}
        @value-changed=${this._addCalendarChosen}
      ></ha-form>
    </div>`;
    return CalendarView.addCalendar(
      picker,
      already,
      {
        label: this._string(ctx, 'calendars.cancel'),
        focus: 'add-cancel',
        onPress: this._cancelAdd,
      },
      {
        label: this._string(ctx, 'calendars.add_confirm'),
        focus: 'add-confirm',
        disabled: chosen === undefined || already !== undefined,
        onPress: () => this._addCalendar(chosen!),
      },
    );
  }

  /** Closes Add Calendar, focus back on its button. */
  private _cancelAdd = (): void => {
    this._adding = undefined;
    this._focusSoon([Focus.byFocusKey('add-calendar')]);
  };

  /**
   * A calendar was chosen in Add Calendar's picker: nothing is written yet. Says what Add will do
   * and moves focus to it.
   *
   * @param event - The picker's `value-changed`
   */
  private _addCalendarChosen = (event: CustomEvent): void => {
    event.stopPropagation();
    const value = (event.detail?.value as { pick?: unknown } | undefined)?.pick;
    const chosen = typeof value === 'string' && value !== '' ? value : undefined;
    this._adding = { chosen };
    if (chosen === undefined) return;
    this._say(this._string(this._ctx, 'calendars.chose', { name: this._calendarName(chosen) }));
    // Open where the calendar is already on the card, and Add is off.
    this._focusSoon([Focus.byFocusKey('add-open'), Focus.byFocusKey('add-confirm')]);
  };

  /**
   * Add: the calendar joins the card as an entry of its own, as one undo step, and its page opens.
   *
   * @param entityId - The calendar chosen
   */
  private _addCalendar(entityId: string): void {
    if (!this._config) return;
    const name = Entities.entityDisplayName(entityId, this.hass);
    const key = this._mintEntryKey();
    const added = this._commit(
      this._string(this._ctx, 'history.add', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        this._writeList(CalendarList.addCalendar(this._listState(), entityId, key));
      },
      `entry:${key}`,
    );
    if (!added) return;
    this._adding = undefined;
    this._open({ kind: 'entry', key }, 'add-calendar');
  }

  /**
   * Moves a calendar, with all its entries, to a place among the calendars, as one undo step, and
   * says where it went. Focus goes to its handle on the overview; on an entry page it stays on the
   * control that moved it, else on the page's menu.
   *
   * @param entityId - The calendar
   * @param to - Its new place, counting from zero
   * @param focusKey - The `data-focus` key of the control that moved it
   */
  private _moveCalendar(entityId: string, to: number, focusKey?: string): void {
    if (!this._config) return;
    const calendars = CalendarList.groups(this._listState());
    const from = calendars.findIndex((calendar) => calendar.entityId === entityId);
    if (from < 0 || to < 0 || to >= calendars.length || to === from) return;
    const name = this._calendarName(entityId);
    const first = calendars[from].rows[0].key;
    const moved = this._commit(
      this._string(this._ctx, 'history.move', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        this._writeList(CalendarList.moveCalendar(this._listState(), entityId, to));
      },
      `entry:${first}`,
    );
    if (!moved) return;
    this._say(
      this._string(this._ctx, 'announce.moved', {
        name,
        position: to + 1,
        total: calendars.length,
      }),
    );
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const target =
        focusKey === undefined
          ? undefined
          : root.querySelector<HTMLButtonElement>(Focus.byFocusKey(focusKey));
      // On the overview, the moved calendar's handle (ia-final §9), except that the strip's move
      // to the top, which turns its Move Up off, focuses the row itself where the calendar is one;
      // on an entry page, which has no handle, the control that moved it, else its menu.
      const topped =
        to === 0 && focusKey?.startsWith('strip:') && calendars[from].rows.length === 1;
      Focus.focusFirst(root, [
        ...(topped ? [Focus.byFocusKey(`row:${first}`)] : []),
        Focus.byFocusKey(`handle:${entityId}`),
        ...(target && !target.disabled ? [Focus.byFocusKey(focusKey!)] : []),
        Focus.byFocusKey(`row:${first}`),
        Focus.byFocusKey('more:page'),
      ]);
    });
  }

  /**
   * Copies one entry's settings, for pasting into another, in this dialog or another.
   *
   * @param key - The entry's key
   */
  private _copyEntry(key: number): void {
    const entry = this._entryOf(key);
    if (entry === undefined) return;
    Entities.copySettings(entry, this._entryName(key));
    this.requestUpdate();
  }

  /**
   * Pastes the copied settings into one entry, as one undo step.
   *
   * @param key - The entry's key
   */
  private _pasteEntry(key: number): void {
    if (!this._config) return;
    const name = this._entryName(key);
    const pasted = this._commit(
      this._string(this._ctx, 'history.paste', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        const index = this._entryKeysFor(this._config!.entities?.length ?? 0).indexOf(key);
        if (index < 0) return;
        this._config = {
          ...this._config!,
          entities: Entities.pasteSettings(this._config!.entities ?? [], index),
        };
        this._report(this._config);
      },
      `entry:${key}`,
    );
    if (pasted) this._say(this._string(this._ctx, 'announce.pasted', { name }));
  }

  /**
   * Lists an entry a second time, with the same settings, right after it, as one undo step, and
   * opens the copy's page with the warning that both show the same events for now. On an entry's
   * page the copy's page takes its place, so Back still returns to the overview.
   *
   * @param key - The entry's key
   */
  private _duplicateEntry(key: number): void {
    if (!this._config) return;
    const name = this._entryName(key);
    const copy = this._mintEntryKey();
    const done = this._commit(
      this._string(this._ctx, 'history.duplicate', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        const state = this._listState();
        const index = state.keys.indexOf(key);
        if (index < 0) return;
        this._writeList(CalendarList.duplicateEntry(state, index, copy));
      },
      `entry:${copy}`,
    );
    if (!done) return;
    const ctx = this._ctx;
    this._openStrip = undefined;
    this._entryNotice = {
      key: copy,
      text: this._string(ctx, 'entry.duplicate_warning'),
      warning: true,
    };
    this._say(this._string(ctx, 'entry.duplicated', { name }));
    this._open(
      { kind: 'entry', key: copy },
      `row:${key}`,
      this._nav.route.kind === 'entry' ? 'replace' : 'push',
    );
  }

  /**
   * Where a calendar stands among the calendars drawn, for the line its removal leaves.
   *
   * @param entityId - The calendar
   * @returns Its place, counting from zero
   */
  private _calendarPlace(entityId: string): number {
    return Math.max(
      0,
      CalendarList.groups(this._listState()).findIndex(
        (calendar) => calendar.entityId === entityId,
      ),
    );
  }

  /**
   * Leaves the overview showing the line a removal left, with focus on its Undo.
   *
   * @param text - The line
   * @param at - The removed calendar's place
   * @param said - What a screen reader hears
   */
  private _afterRemove(text: string, at: number, said: string): void {
    this._openStrip = undefined;
    if (this._nav.route.kind !== 'overview') this._nav = Navigation.OVERVIEW;
    // The line stands in the list, which a search would replace with its results: an entry
    // removed from a page a result opened leaves the search, as Back to the overview does.
    if (Filter.hasQuery(this._filter)) this._filter = { ...this._filter, query: '' };
    this._jump = this._resultsLeft = undefined;
    this._showStatus({ kind: 'entry', text, at }, said);
  }

  /**
   * Removes one entry, its key with it, as one undo step: the overview opens with the line
   * "Removed Ben · Undo" where its row was, focus on its Undo. No confirmation; Undo covers it.
   *
   * @param key - The entry's key
   */
  private _removeEntry(key: number): void {
    if (!this._config) return;
    const entry = this._entryOf(key);
    if (entry === undefined) return;
    const ctx = this._ctx;
    const name = this._entryName(key);
    const at = this._calendarPlace(Synthetic.entityIdOf(entry));
    const removed = this._commit(
      this._string(ctx, 'history.remove', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        const state = this._listState();
        const index = state.keys.indexOf(key);
        if (index >= 0) this._writeList(CalendarList.removeEntry(state, index));
      },
      `entry:${key}`,
    );
    if (!removed) return;
    this._afterRemove(
      this._string(ctx, 'status.removed', { name }),
      at,
      this._string(ctx, 'announce.removed', { name }),
    );
  }

  /**
   * Removes a calendar with every entry it has, as one undo step, leaving the line "Removed
   * Family · Entries: 2 · Undo" where it was.
   *
   * @param entityId - The calendar
   */
  private _removeCalendar(entityId: string): void {
    if (!this._config) return;
    const ctx = this._ctx;
    const name = this._calendarName(entityId);
    const calendar = CalendarList.groups(this._listState()).find(
      (each) => each.entityId === entityId,
    );
    if (calendar === undefined) return;
    const at = this._calendarPlace(entityId);
    const removed = this._commit(
      this._string(ctx, 'history.remove', { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        this._writeList(CalendarList.removeCalendar(this._listState(), entityId));
      },
      `entry:${calendar.rows[0].key}`,
    );
    if (!removed) return;
    this._afterRemove(
      this._string(ctx, 'status.removed_calendar', {
        name,
        count: calendar.rows.length,
      }),
      at,
      this._string(ctx, 'announce.removed', { name }),
    );
  }

  /**
   * Points an entry at another calendar, as one undo step: it keeps its own settings, joins the
   * end of that calendar's entries, and takes the calendar's shared name and calendar filter
   * setting where the calendar already has entries. A line on its page says which.
   *
   * @param key - The entry's key
   * @param entityId - The calendar it reads from now on
   */
  private _repoint(key: number, entityId: string): void {
    const entry = this._entryOf(key);
    if (!this._config || entry === undefined || Synthetic.entityIdOf(entry) === entityId) return;
    const ctx = this._ctx;
    const name = this._calendarName(Synthetic.entityIdOf(entry));
    const calendar = this._calendarName(entityId);
    let adopted = false;
    const done = this._commit(
      this._string(ctx, 'history.change_for', {
        setting: this._string(ctx, 'entry.calendar'),
        name,
      }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        const state = this._listState();
        const result = CalendarList.repointEntry(state, state.keys.indexOf(key), entityId);
        adopted = result.adopted;
        this._writeList(result.state);
      },
      `entry:${key}`,
    );
    if (!done) return;
    const text = interpolate(
      adopted ? this._string(ctx, 'entry.repointed_adopted') : this._string(ctx, 'entry.repointed'),
      { name, calendar },
    );
    this._entryNotice = { key, text, warning: false };
    this._say(text);
  }

  /**
   * An entry page's Calendar sent a change: a calendar other than the entry's re-points it.
   *
   * @param key - The entry's key
   * @param event - The picker's `value-changed`
   */
  private _entryCalendarChanged(key: number, event: CustomEvent): void {
    event.stopPropagation();
    const value = (event.detail?.value as { calendar?: unknown } | undefined)?.calendar;
    if (typeof value === 'string' && value !== '') this._repoint(key, value);
    else this.requestUpdate();
  }

  /**
   * Goes to another entry's page from Previous or Next Calendar, in place of this one, and says
   * so.
   *
   * @param key - The entry to show
   */
  private _showEntry(key: number): void {
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
    };
    this._closeDisclosures();
    this._nav = Navigation.go(this._nav, { kind: 'entry', key }, from, 'replace');
    this._say(this._string(this._ctx, 'entry.showing', { name: this._entryName(key) }));
    void this._afterMove();
  }

  /**
   * One field of an entry's page in a form of its own, inside the editor's own wrapper named
   * after it, as a card field is drawn (`_renderField`). Its frame names the entry by key, so a
   * change it sends late still reaches this entry, wherever the list has moved it.
   *
   * @param field - The field, as the entry's index lifted it
   * @param key - The entry's key
   * @param data - The entry's form data
   * @param ctx - Schema context
   * @param show - Its state words and the line under it
   * @returns The wrapper and its form
   */
  private _renderEntryField(
    field: IndexedField,
    key: number,
    data: Record<string, unknown>,
    ctx: SchemaCtx,
    show?: FieldShow,
  ): TemplateResult {
    const spec = this._entryColors(ctx).specs.get(field.id);
    if (spec !== undefined) {
      // A mode's value is drawn inside its mode's control where the page draws both, as an
      // entry's page always draws its accent's mode; drawn alone (What This Card Changes' Edit),
      // the value is the control.
      if (show !== undefined && spec.mode !== undefined && field.id === spec.value) {
        return html``;
      }
      return this._jumpedEntryField(
        ctx,
        key,
        field,
        html`<div
          class="field color-field"
          data-field=${field.id}
          tabindex="-1"
          role="group"
          aria-label=${fieldLabel(field, ctx.language)}
        >
          ${this._renderEntryColor(key, field.id, ctx, show?.words)} ${show?.line ?? nothing}
        </div>`,
      );
    }
    const slot = `entry.${key}.${field.id}`;
    const words = this._renderWords(
      { kind: 'entry', key },
      field,
      data,
      ctx,
      slot,
      show,
      this._calendarName(Synthetic.entityIdOf(this._entryOf(key) ?? '')),
    );
    if (words !== undefined) return this._jumpedEntryField(ctx, key, field, words);
    const text = this._fieldText(slot, field, ctx, show?.words);
    const schema = this._intern(slot, this._yamlSchema(field, data, ctx));
    // The field's own projection of the entry's data, as a card field gets, so a write to one
    // field hands no other form a new object.
    const own = this._intern(`${slot}.data`, Routing.formDataFor(data, schema));
    const [hass, feed] = this._feed(schema, ctx.language);
    const workspace = ctx.workspace ?? ctx.view;
    const frame: WriteFrames.OwnedFrame = {
      owner: { kind: 'entry', key },
      workspace,
      schema,
      data: own,
    };
    const wrapper = html`<div
      class="field"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${fieldLabel(field, ctx.language)}
    >
      ${keyed(
        workspace,
        html`<ha-form
          class="entity-form"
          data-hass=${feed}
          .hass=${hass}
          .error=${this._patternError(slot, field, own, ctx)}
          .data=${own}
          .schema=${schema}
          .computeLabel=${text.label}
          .computeHelper=${text.helper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._valueChanged(
              frame,
              event,
              field.labelPath,
              `field:${field.id}`,
              this._calendarName(Synthetic.entityIdOf(this._entryOf(key) ?? '')),
            )}
        ></ha-form>`,
      )}
      ${this._wordToggle({ kind: 'entry', key }, field, own, ctx)} ${show?.line ?? nothing}
    </div>`;
    return this._jumpedEntryField(ctx, key, field, wrapper);
  }

  /**
   * An entry page's field, inside the group a search result opened it with where it is that one:
   * Return to Results above it, highlighted while lit.
   *
   * @param ctx - Schema context
   * @param key - The entry's key
   * @param field - The field
   * @param wrapper - The field as drawn
   * @returns The field, inside the group where a result opened it
   */
  private _jumpedEntryField(
    ctx: SchemaCtx,
    key: number,
    field: IndexedField,
    wrapper: TemplateResult,
  ): TemplateResult {
    return this._jumpsTo('entry-field', key) && this._jump!.target.id === field.id
      ? this._jumpTo(ctx, wrapper)
      : wrapper;
  }

  /**
   * Who Sees It: Home Assistant's own Visibility editor, where it is defined and the conditions
   * are ones it can edit; else the field's YAML box.
   *
   * @param field - The `visibility` field
   * @param key - The entry's key
   * @param entry - The entry
   * @param data - The entry's form data
   * @param ctx - Schema context
   * @param show - Its state words and the line under it
   * @returns The control
   */
  private _renderVisibility(
    field: IndexedField,
    key: number,
    entry: string | Types.EntityConfig,
    data: Record<string, unknown>,
    ctx: SchemaCtx,
    show?: FieldShow,
  ): TemplateResult {
    const entityId = Synthetic.entityIdOf(entry);
    const conditions = conditionsEditorDefined()
      ? this._conditionsFor(key, entityId, Entities.asEntityConfig(entry).visibility)
      : undefined;
    if (conditions === undefined) {
      // Defined before this editor opens wherever Home Assistant's card editor is; should it
      // arrive later, it takes over the YAML box then.
      awaitConditionsEditor(this);
      return this._renderEntryField(field, key, data, ctx, show);
    }
    const wrapper = html`<div
      class="field entity-visibility"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${fieldLabel(field, ctx.language)}
      @context-request=${(event: Event) => provideCalendar(event, entityId)}
    >
      <div class="entity-visibility-helper">${this._string(ctx, 'entity.visibility.helper')}</div>
      ${keyed(
        entityId,
        html`<ha-card-conditions-editor
          data-hass="live"
          .hass=${this.hass}
          .conditions=${conditions}
          @value-changed=${(event: CustomEvent) => this._visibilityChanged(key, event)}
        ></ha-card-conditions-editor>`,
      )}
      ${show?.line ?? nothing}
    </div>`;
    return this._jumpedEntryField(ctx, key, field, wrapper);
  }

  /**
   * The line under a word list the card cannot read (section 5.9): Blocklist and Allowlist, built
   * as the card builds them, and Countries To Remove, which the card wraps (`formatLocation`).
   * Drawn through `ha-form`'s own error map, above the field.
   *
   * @param slot - The form's slot, where the map is kept
   * @param field - The field
   * @param data - Its form's data
   * @param ctx - Schema context
   * @returns The map; undefined where the pattern reads, or the field is no word list
   */
  private _patternError(
    slot: string,
    field: IndexedField,
    data: Readonly<Record<string, unknown>>,
    ctx: SchemaCtx,
  ): Record<string, string> | undefined {
    const name = field.node.name;
    const wrapped = field.id === 'events:location_country_pattern';
    if (!wrapped && field.id !== 'calendar:blocklist' && field.id !== 'calendar:allowlist') {
      return undefined;
    }
    const value = data[name];
    if (typeof value !== 'string' || value === '') return undefined;
    if (WordLists.compiles(wrapped ? `(${value})\\s*$` : value)) return undefined;
    return this._intern(`${slot}.error`, { [name]: this._string(ctx, 'word_list.invalid') });
  }

  /**
   * Opens Split This Calendar on an entry's page, from the row under Which Events or from the
   * page's ⋮: All-Day vs. With a Time chosen unless it is refused, part 1 in the entry's color and
   * part 2 in the first swatch no calendar uses (`colors.ts` › `freeSwatch`).
   *
   * @param key - The entry's key
   */
  private _openSplit(key: number): void {
    const entry = this._entryOf(key);
    if (!this._config || entry === undefined) return;
    this._openStrip = undefined;
    this._splitDone = undefined;
    if (this._split?.key !== key) {
      const own = Entities.asEntityConfig(entry);
      const refused = Split.refusals(entry, this._config);
      const free = Colors.freeSwatch(this._config.entities ?? [], this._config);
      this._split = {
        opening: structuredClone(this._rawConfig),
        openingAuthoredRootKeys: new Set(this._authoredRootKeys),
        previews: [],
        key,
        newKey: this._mintEntryKey(),
        step: 0,
        how:
          refused.type === undefined
            ? 'type'
            : refused.words === undefined && refused.pattern === undefined
              ? 'words'
              : undefined,
        field: refused.field ?? 'title',
        terms: [''],
        parts: [
          { label: own.label, color: own.accent_color },
          { label: own.label, color: free },
        ],
        original: structuredClone(entry),
        free,
      };
    }
    this._focusSplit();
  }

  /** Puts focus on the task's step title once it renders, the task scrolled into view. */
  private _focusSplit(): void {
    void this.updateComplete.then(() => {
      const title = Focus.focusFirst(this.renderRoot, ['.split-title']);
      title?.closest('.split-task')?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /**
   * Closes Split This Calendar and, where it previewed, sends the card the configuration it opened
   * on, so the card shows the entry as it was.
   *
   * @param focus - Whether focus returns to the row that opens it
   */
  private _cancelSplit(focus: boolean): void {
    const session = this._split;
    if (session === undefined) return;
    this._split = undefined;
    if (session.previews.length > 0) {
      this._send(structuredClone(this._rawConfig));
    }
    if (focus) {
      this._focusSoon([Focus.byFocusKey('split-row'), '.page-title']);
    }
  }

  /**
   * The split as it would be written now.
   *
   * @param session - The run
   * @returns How, and the two parts
   */
  private _splitPair(
    session: SplitSession,
  ): readonly [Types.EntityConfig, Types.EntityConfig] | undefined {
    if (session.how === undefined) return undefined;
    const how: Split.SplitHow =
      session.how === 'type'
        ? { kind: 'type' }
        : { kind: 'words', terms: session.terms, field: session.field };
    return Split.splitEntry(session.original, how, session.parts);
  }

  /**
   * Changes the run and, from Colors on, shows both parts on the card: a preview rebuilt from the
   * configuration it opened on, never from an echo. Back to How shows the entry as it was.
   *
   * @param patch - What changed
   */
  private _splitChange(patch: Partial<SplitSession>): void {
    const current = this._split;
    if (current === undefined) return;
    let session: SplitSession = { ...current, ...patch };
    const pair = this._splitPair(session);
    const entities = (session.opening.entities ?? []) as Array<string | Types.EntityConfig>;
    const keys = this._entryKeysFor(entities.length);
    const index = keys.indexOf(session.key);
    const preview =
      session.step === 0 || pair === undefined || index < 0
        ? session.previews.length > 0
          ? structuredClone(session.opening)
          : undefined
        : {
            ...structuredClone(session.opening),
            entities: Split.splitInList({ entities, keys }, index, pair, session.newKey).entities,
          };
    if (preview !== undefined) {
      const next = Preview.withPreview(session, preview as Record<string, unknown>);
      if (next !== session) {
        session = { ...session, ...next };
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: preview } }));
      }
    }
    this._split = session;
  }

  /**
   * Moves the task to another step, reading the calendar's upcoming events as Review opens.
   *
   * @param step - The step to show
   */
  private _splitGo(step: number): void {
    const session = this._split;
    if (session === undefined) return;
    const read = step === 2 && session.events === undefined && session.reading === undefined;
    const reading = read ? ++this._reads : session.reading;
    this._splitChange({ step, reading });
    this._focusSplit();
    if (!read) return;
    const hass = this.hass;
    const window = SplitReview.reviewWindow(
      this._config!,
      this._viewForConfig(this._config!),
      hass ?? undefined,
    );
    const entityId = Synthetic.entityIdOf(session.original);
    const done = (events: Types.CalendarEventData[] | null): void => {
      const current = this._split;
      if (current === undefined || current.reading !== reading) return;
      this._split = { ...current, events };
    };
    if (!hass?.callApi) done(null);
    else void SplitReview.readUpcoming(hass, entityId, window).then(done);
  }

  /**
   * Splits the entry, as one undo step: part 1 in its place under its key, part 2 after it, both
   * tagged New on the overview; then the panel saying so, focused, on the page that now edits
   * part 1.
   */
  private _applySplit(): void {
    const session = this._split;
    const pair = session === undefined ? undefined : this._splitPair(session);
    if (session === undefined || pair === undefined || !this._config) return;
    const ctx = this._ctx;
    const name = this._calendarName(Synthetic.entityIdOf(session.original));
    this._splitting = true;
    let done = false;
    try {
      done = this._commit(
        this._string(ctx, 'split.named', { name }),
        undefined,
        () => {
          if (!this._prepareForWrite()) return;
          const state = this._listState();
          const index = state.keys.indexOf(session.key);
          if (index >= 0) this._writeList(Split.splitInList(state, index, pair, session.newKey));
        },
        `entry:${session.key}`,
      );
    } finally {
      this._splitting = false;
    }
    if (!done) {
      this._cancelSplit(true);
      return;
    }
    this._split = undefined;
    this._newEntries = new Set([...this._newEntries, session.key, session.newKey]);
    this._splitDone = { key: session.key, newKey: session.newKey };
    this._say(this._string(ctx, 'split.done', { name }));
    this._focusSoon([Focus.byFocusKey('split-done')]);
  }

  /**
   * A refusal's way out: Cancel, then the field the refusal names, highlighted, as a search
   * result opens it.
   *
   * @param key - The entry's key
   * @param id - The field
   */
  private _splitWayOut(key: number, id: FieldId): void {
    this._cancelSplit(false);
    this._land(
      { kind: 'entry-field', id, key },
      this._string(this._ctx, `entity.${id.slice(id.indexOf(':') + 1)}`),
      [],
    );
  }

  /**
   * What a part shows in its title: "All-day events", or "Only: Training" and "Without:
   * Training".
   *
   * @param session - The run
   * @param part - Which part, 0 or 1
   * @param ctx - Schema context
   * @returns The words
   */
  private _splitPartTitle(session: SplitSession, part: number, ctx: SchemaCtx): string {
    if (session.how === 'type') {
      return this._string(ctx, part === 0 ? 'row.all_day' : 'row.timed');
    }
    return this._string(ctx, part === 0 ? 'row.only' : 'row.without', {
      words: this._splitWords(session),
    });
  }

  /**
   * The words a split by words uses, as a list.
   *
   * @param session - The run
   * @returns "Training, Piano"
   */
  private _splitWords(session: SplitSession): string {
    return session.terms
      .map((term) => term.trim())
      .filter(Boolean)
      .join(', ');
  }

  /**
   * One part's color control: the composed Accent Color control, writing to the part rather than
   * to any entry, which the preview then shows.
   *
   * @param session - The run
   * @param part - Which part, 0 or 1
   * @param ctx - Schema context
   * @returns The control
   */
  private _renderSplitColor(session: SplitSession, part: number, ctx: SchemaCtx): TemplateResult {
    const colors = this._entryColors(ctx);
    const spec = colors.specs.get('calendar:accent_color')!;
    const color = session.parts[part].color;
    const entityId = Synthetic.entityIdOf(session.original);
    const name = this._calendarName(entityId);
    const helper =
      part === 0 && color === Entities.asEntityConfig(session.original).accent_color
        ? this._string(ctx, 'split.color_now', { name })
        : part === 1 && color === session.free
          ? this._string(ctx, 'split.color_free')
          : undefined;
    return this._renderColor({
      owner: { kind: 'entry', key: -1 - part },
      spec,
      ctx,
      name: fieldLabel(colors.fields.get(spec.mode ?? spec.value)!, ctx.language),
      valueField: colors.fields.get(spec.value)!,
      data: { accent_color: color },
      stored: color,
      destination: 'split',
      anchor: spec.mode ?? spec.value,
      focusKey: `split-color:${part}`,
      helper,
      entity: { id: entityId, name: Entities.entityDisplayName(entityId, this.hass) },
      write: (write) => {
        const next =
          write === 'reset'
            ? undefined
            : spec.mode !== undefined && write[spec.mode] === 'home_assistant'
              ? EntityColors.ENTITY_COLOR_SENTINEL
              : spec.mode !== undefined && write[spec.mode] === 'inherit'
                ? undefined
                : (write[spec.value] as string | undefined);
        const current = this._split;
        if (current?.newKey !== session.newKey) return;
        const parts = [...current.parts] as [Split.SplitPart, Split.SplitPart];
        parts[part] = { ...parts[part], color: next };
        this._splitChange({ parts });
      },
    });
  }

  /**
   * One part's Label field, prefilled with the entry's label.
   *
   * @param session - The run
   * @param part - Which part, 0 or 1
   * @param ctx - Schema context
   * @returns The field
   */
  private _renderSplitLabel(session: SplitSession, part: number, ctx: SchemaCtx): TemplateResult {
    const schema = this._intern('split.label.schema', [
      { name: 'label', selector: { text: {} } },
    ] as unknown as HaFormSchema[]);
    const label = this._string(ctx, 'entity.label');
    return html`<ha-form
      class="split-form"
      data-split-label=${part}
      .hass=${this.hass}
      .data=${this._intern(`split.label.${part}`, { label: session.parts[part].label ?? '' })}
      .schema=${schema}
      .computeLabel=${this._keep('split.label.label', label, () => () => label)}
      @value-changed=${(event: CustomEvent) => {
        event.stopPropagation();
        const value = (event.detail?.value as { label?: unknown } | undefined)?.label;
        // A form a canceled run left behind may still send a change; it is not this run's.
        const current = this._split;
        if (current?.newKey !== session.newKey) return;
        const parts = [...current.parts] as [Split.SplitPart, Split.SplitPart];
        parts[part] = { ...parts[part], label: typeof value === 'string' ? value : '' };
        this._splitChange({ parts });
      }}
    ></ha-form>`;
  }

  /**
   * Split This Calendar at the top of Which Events: the row that opens it, or the task while it
   * is open on this entry.
   *
   * @param key - The entry's key
   * @param ctx - Schema context
   * @returns The row or the task
   */
  private _renderSplit(key: number, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const session = this._split;
    if (session?.key === key) return this._renderSplitTask(session, ctx);
    const entry = this._entryOf(key);
    if (entry === undefined) return nothing;
    return SplitView.splitRow(
      this._string(ctx, 'split.title'),
      this._string(ctx, 'split.row_helper'),
      this._string(ctx, 'split.named', { name: this._entryName(key) }),
      () => this._openSplit(key),
    );
  }

  /**
   * The task, at its step.
   *
   * @param session - The run
   * @param ctx - Schema context
   * @returns The task
   */
  private _renderSplitTask(session: SplitSession, ctx: SchemaCtx): TemplateResult {
    const t: Translate = (key, values) => this._string(ctx, key, values);
    const entityId = Synthetic.entityIdOf(session.original);
    const name = this._calendarName(entityId);
    const own = Entities.asEntityConfig(session.original);
    const refused = Split.refusals(session.original, this._config!);
    const terms = session.terms.map((term) => term.trim()).filter(Boolean);
    const steps = [t('split.step.how'), t('split.step.colors'), t('split.step.review')];
    // Whole sentences, one per refusal, looked up by the key `split.ts` › `refusals` names.
    const refusalText: Readonly<Record<string, string>> = {
      'split.refused.all_day': t('split.refused.all_day'),
      'split.refused.all_day_card': t('split.refused.all_day_card'),
      'split.refused.timed': t('split.refused.timed'),
      'split.refused.timed_card': t('split.refused.timed_card'),
      'split.refused.words': t('split.refused.words'),
      'split.refused.blocklist': t('split.refused.blocklist'),
      'split.refused.allowlist': t('split.refused.allowlist'),
      'split.refused.budget': t('split.refused.budget'),
    };
    const cancel = {
      label: t('quick_setup.cancel'),
      focus: 'split-cancel',
      onPress: () => this._cancelSplit(true),
    };
    const back = {
      label: t('quick_setup.back'),
      focus: 'split-back',
      onPress: () => this._splitGo(session.step - 1),
    };
    let title: string;
    let intro: string;
    let body: unknown;
    let next: CalendarView.TextButton;
    if (session.step === 0) {
      title = t('split.named', { name });
      intro = t('split.how.intro', { name, entity: entityId });
      const way = (id: FieldId, label: string): CalendarView.TextButton => ({
        label,
        focus: `split-way:${id}`,
        onPress: () => this._splitWayOut(session.key, id),
      });
      const words = refused.pattern ?? refused.words;
      const typeRefusal: SplitView.Refusal | undefined =
        refused.type === undefined
          ? undefined
          : {
              text: interpolate(refusalText[refused.type], { name }),
              action: {
                label: t('entity.duplicate'),
                focus: 'split-way:duplicate',
                onPress: () => {
                  this._cancelSplit(false);
                  this._duplicateEntry(session.key);
                },
              },
            };
      const wordsRefusal: SplitView.Refusal | undefined =
        words === undefined
          ? undefined
          : {
              text: interpolate(refusalText[words], {
                name,
                words:
                  WordLists.fromPattern(String(own.allowlist ?? ''))?.join(', ') ??
                  String(own.allowlist ?? ''),
              }),
              action:
                refused.pattern === 'split.refused.blocklist'
                  ? way('calendar:blocklist', t('split.edit_blocklist'))
                  : way('calendar:allowlist', t('split.edit_allowlist')),
            };
      const chosen =
        session.how === 'words'
          ? wordsRefusal === undefined
          : session.how === 'type' && typeRefusal === undefined;
      body = html`${
        refused.budget === undefined
          ? nothing
          : SplitView.refusal(
              {
                text: interpolate(refusalText[refused.budget], { name }),
                action: way('calendar:compact_events_to_show', t('split.go_budget')),
              },
              true,
            )
      }
      ${SplitView.methods(t('split.step.how'), [
        {
          id: 'type',
          label: t('split.how.type'),
          description: t('split.how.type.description'),
          checked: session.how === 'type' && typeRefusal === undefined,
          refusal: typeRefusal,
          onPick: () => this._splitChange({ how: 'type' }),
        },
        {
          id: 'words',
          label: t('split.how.words'),
          description: t('split.how.words.description'),
          checked: session.how === 'words' && wordsRefusal === undefined,
          refusal: wordsRefusal,
          onPick: () => this._splitChange({ how: 'words' }),
        },
      ])}
      ${session.how === 'words' && wordsRefusal === undefined ? this._renderSplitWords(session, refused.field, ctx) : nothing}`;
      next = {
        label: t('quick_setup.next'),
        focus: 'split-next',
        disabled:
          !chosen ||
          refused.budget !== undefined ||
          (session.how === 'words' && terms.length === 0),
        onPress: () => this._splitGo(1),
      };
    } else {
      const spec = this._entryColors(ctx).specs.get('calendar:accent_color')!;
      const colorWords = (color: string | undefined): string => {
        const choice = Colors.choiceOf(color, spec);
        return choice.kind === 'source'
          ? Colors.sourceLabel(choice.source, spec, ctx.language)
          : Colors.describeColor(color, spec, ctx.language, { haName: this._haColorName });
      };
      const head = (part: number, sub: string): SplitView.PartHead => {
        const given = session.parts[part];
        return {
          title: `${name}${Summary.SUMMARY_SEPARATOR}${this._splitPartTitle(session, part, ctx)}`,
          sub,
          color: this._rowColor({ entity: entityId, accent_color: given.color }),
          badge:
            Entities.labelTypeOf(session.original) === 'text' && given.label
              ? given.label
              : undefined,
        };
      };
      if (session.step === 1) {
        title = t('split.colors.title');
        intro = t('split.colors.intro', { name });
        body = [0, 1].map((part) =>
          SplitView.partCard(
            head(part, t('split.part_of', { part: part + 1, total: '2' })),
            html`${this._renderSplitColor(session, part, ctx)}
            ${this._renderSplitLabel(session, part, ctx)}`,
          ),
        );
        next = {
          label: t('quick_setup.next'),
          focus: 'split-next',
          onPress: () => this._splitGo(2),
        };
      } else {
        title = t('split.step.review');
        intro = t('split.review.intro', { name });
        const pair = this._splitPair(session)!;
        const window = SplitReview.reviewWindow(
          this._config!,
          this._viewForConfig(this._config!),
          this.hass ?? undefined,
        );
        const reviewed =
          session.events === undefined || session.events === null
            ? undefined
            : SplitReview.reviewParts(
                session.events,
                session.original,
                pair,
                window,
                this._viewForConfig(this._config!),
                this.hass,
                ctx.language,
              );
        const days = String(window.config.days_to_show);
        const wordRules: Readonly<Record<Types.FilterField, string>> = {
          title: t('split.rule.words.title'),
          location: t('split.rule.words.location'),
          description: t('split.rule.words.description'),
        };
        body = html`${[0, 1].map((part) => {
          const rule =
            session.how === 'type'
              ? part === 0
                ? t('split.rule.all_day')
                : t('split.rule.timed')
              : part === 0
                ? interpolate(wordRules[session.field], {
                    words: this._splitWords(session),
                  })
                : t('split.rule.other');
          const result = reviewed?.[part];
          const lines =
            session.events === undefined
              ? [t('split.review.loading', { name })]
              : result === undefined
                ? [t('split.review.failed', { name })]
                : result.count === 0
                  ? [t('split.review.none')]
                  : result.lines;
          const writes =
            session.how === 'words'
              ? interpolate(
                  part === 0 ? t('split.writes.allowlist') : t('split.writes.blocklist'),
                  {
                    words: this._splitWords(session),
                    field: this._splitFieldWords(ctx)[session.field],
                  },
                )
              : undefined;
          return SplitView.partCard(
            head(
              part,
              `${rule}${Summary.SUMMARY_SEPARATOR}${colorWords(session.parts[part].color)}`,
            ),
            SplitView.partReview(
              result === undefined
                ? undefined
                : t('split.review.counts', { days, count: result.count }),
              lines,
              writes,
            ),
          );
        })}
        ${
          Array.isArray(own.visibility) && own.visibility.length > 0
            ? SplitView.note(t('split.review.conditions', { name }))
            : nothing
        }
        ${SplitView.note(t('split.review.note', { name }))}`;
        next = {
          label: t('split.apply'),
          focus: 'split-apply',
          name: t('split.named', { name }),
          onPress: () => this._applySplit(),
        };
      }
    }
    return SplitView.splitTask({
      name: t('split.title'),
      steps,
      step: session.step,
      stepOf: t('split.step_of', { step: session.step + 1, total: '3' }),
      closeName: t('quick_setup.cancel'),
      onClose: () => this._cancelSplit(true),
      title,
      intro,
      body,
      back: session.step === 0 ? cancel : back,
      next,
    });
  }

  /**
   * What each field is called inside a sentence: "event title", "location", "description".
   *
   * @param ctx - Schema context
   * @returns The words, by field
   */
  private _splitFieldWords(ctx: SchemaCtx): Readonly<Record<Types.FilterField, string>> {
    return {
      title: this._string(ctx, 'split.field.title'),
      location: this._string(ctx, 'split.field.location'),
      description: this._string(ctx, 'split.field.description'),
    };
  }

  /**
   * By Words' fields: Match Against, held to the field the entry's Blocklist looks in where it has
   * one, and the words, one per field, in Home Assistant's own list of text fields.
   *
   * @param session - The run
   * @param locked - The field Match Against is held to
   * @param ctx - Schema context
   * @returns The fields
   */
  private _renderSplitWords(
    session: SplitSession,
    locked: Types.FilterField | undefined,
    ctx: SchemaCtx,
  ): TemplateResult {
    const t: Translate = (key, values) => this._string(ctx, key, values);
    const options = (['title', 'location', 'description'] as const).map((value) => ({
      value,
      label: t(`entity.filter_field.option.${value}.label`),
    }));
    const schema = this._keep('split.words.schema', ctx.language, () => [
      { name: 'filter_field', selector: { select: { mode: 'dropdown', options } } },
      { name: 'words', selector: { text: { multiple: true } } },
    ]) as unknown as HaFormSchema[];
    const labels: Readonly<Record<string, string>> = {
      filter_field: t('entity.filter_field'),
      words: t('split.word'),
    };
    const helpers: Readonly<Record<string, string>> = {
      filter_field:
        locked === undefined
          ? t('split.match_against_note')
          : t('split.locked', {
              field: t(`entity.filter_field.option.${locked}.label`),
            }),
      words: t('split.words_note', {
        field: this._splitFieldWords(ctx)[session.field],
      }),
    };
    return html`<ha-form
      class="split-form split-words"
      .hass=${this.hass}
      .data=${this._intern('split.words.data', { filter_field: session.field, words: [...session.terms] })}
      .schema=${schema}
      .computeLabel=${this._keep('split.words.label', labels, () => (item: { name: string }) => labels[item.name])}
      .computeHelper=${this._keep('split.words.helper', helpers, () => (item: { name: string }) => helpers[item.name])}
      @value-changed=${(event: CustomEvent) => {
        event.stopPropagation();
        if (this._split?.newKey !== session.newKey) return;
        const value = event.detail?.value as
          { filter_field?: unknown; words?: unknown } | undefined;
        const field = locked ?? Split.filterFieldOf(value?.filter_field);
        const words = Array.isArray(value?.words)
          ? value.words.map((word) => (typeof word === 'string' ? word : ''))
          : [];
        this._splitChange({ field, terms: words });
      }}
    ></ha-form>`;
  }

  /**
   * The panel a split leaves: both entries as rows, tagged New, then Undo and Done. The first row
   * only closes it, as this page already edits that entry.
   *
   * @param key - The page's entry
   * @param ctx - Schema context
   * @returns The panel; nothing once either entry has left
   */
  private _renderSplitDone(key: number, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const done = this._splitDone;
    if (done?.key !== key) return nothing;
    const first = this._entryOf(done.key);
    const second = this._entryOf(done.newKey);
    if (first === undefined || second === undefined) return nothing;
    const t: Translate = (key, values) => this._string(ctx, key, values);
    const name = this._calendarName(Synthetic.entityIdOf(first));
    const close = (): void => {
      this._splitDone = undefined;
      this._focusSoon(['.page-title']);
    };
    const row = (entryKey: number, entry: string | Types.EntityConfig): SplitView.DoneRow => {
      const parts = CalendarList.rowParts(entry, ctx.language);
      const label = Entities.asEntityConfig(entry).label;
      return {
        key: entryKey,
        title: `${name}${Summary.SUMMARY_SEPARATOR}${parts[0]}`,
        summary: [
          ...parts.slice(1),
          t('summary.set', { count: CalendarList.setCount(entry) }),
        ].join(Summary.SUMMARY_SEPARATOR),
        tag: t('split.new'),
        color: this._rowColor(entry),
        badge:
          Entities.labelTypeOf(entry) === 'text' && typeof label === 'string' && label !== ''
            ? label
            : undefined,
        onOpen: entryKey === done.key ? close : () => this._showEntry(entryKey),
      };
    };
    return SplitView.done(
      t('split.done', { name }),
      [row(done.key, first), row(done.newKey, second)],
      { label: t('history.undo'), focus: 'split-undo', onPress: this._undo },
      { label: t('split.done_button'), focus: 'split-done-button', onPress: close },
    );
  }

  /**
   * A calendar entry's page: its header with Back, the calendar's name and id, Undo, Redo and the
   * entry's ⋮; Previous and Next Calendar; the warnings and notices that concern it; Settings For;
   * its Calendar; its groups; and Remove and Back at its foot.
   *
   * @param key - The entry's key
   * @param ctx - Schema context
   * @returns The page
   */
  private _renderEntryPage(key: number, ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const state = this._listState();
    const index = state.keys.indexOf(key);
    const entry = state.entities[index];
    const entityId = Synthetic.entityIdOf(entry);
    const name = this._calendarName(entityId);
    const calendars = CalendarList.groups(state);
    const calendar = calendars.find((each) => each.entityId === entityId)!;
    const row = calendar.rows.find((each) => each.key === key)!;
    const single = calendar.rows.length === 1;
    const order = calendars.flatMap((each) => each.rows.map((one) => one.key));
    const at = order.indexOf(key);
    const step = (other: number | undefined, which: string, label: string, named: string) => ({
      label,
      focus: `entry-${which}`,
      name: other === undefined ? label : interpolate(named, { name: this._entryName(other) }),
      disabled: other === undefined,
      onPress: () => {
        if (other !== undefined) this._showEntry(other);
      },
    });
    const pageOpen = this._openStrip === 'page';
    const actionsName = this._string(ctx, 'calendars.actions', {
      name: this._entryName(key),
    });
    const more = CalendarView.moreButton({
      key: 'page',
      name: actionsName,
      open: pageOpen,
      onToggle: () => this._toggleStrip('page'),
    });
    const sub = single
      ? entityId
      : `${entityId}${Summary.SUMMARY_SEPARATOR}${this._string(ctx, 'entity.occurrence', {
          position: row.position,
          total: row.total,
        })}`;
    const notice = this._entryNotice?.key === key ? this._entryNotice : undefined;
    const declared = this._entrySchemas(this._entrySubform(ctx), ctx).find(
      (each) => each.key === key,
    )!;
    const present = entityFieldIndex(declared.schema).fields;
    const data = this._intern(`entry.${key}`, Entities.toEntityFormData(entry, state.entities));
    const chassis = Subforms.chassisSchemas(ctx.language);
    const [pickHass, pickFeed] = this._feed(chassis.entryCalendar, ctx.language);
    const pctx: Plan.PlanCtx = {
      ...this._planCtx(ctx),
      present: { fields: present },
      entry: key,
    };
    const groups = this._renderHeadings(
      Plan.planEntry(entry, key, this._planCtx(ctx), pctx.present),
      pctx,
      ctx,
      { kind: 'entry', key },
      present,
      { card: this._formData(), entry: data },
      (field, show) =>
        field.id === `calendar:${VISIBILITY}`
          ? this._renderVisibility(field, key, entry, data, ctx, show)
          : this._renderEntryField(field, key, data, ctx, show),
      // Split This Calendar, at Which Events (D12): its row, or the task while it is open.
      (heading) => (heading.extras?.includes('split') ? this._renderSplit(key, ctx) : nothing),
      name,
    );
    return html`<div
      class="page entry-page"
      data-page=${`entry:${key}`}
      data-entry-key=${key}
      data-move-calendar=${single ? entityId : nothing}
    >
      ${PageView.pageHead(
        name,
        t,
        this._back,
        html`${this._renderHistory(ctx)} ${more}`,
        sub,
        this._string(ctx, 'entry.back'),
      )}
      ${
        pageOpen
          ? CalendarView.strip(
              'page',
              actionsName,
              this._stripActions('page', entityId, key, true, ctx),
            )
          : nothing
      }
      ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)}
      ${CalendarView.previousNext(
        step(
          order[at - 1],
          'previous',
          this._string(ctx, 'entry.previous'),
          this._string(ctx, 'entry.previous_named'),
        ),
        step(
          order[at + 1],
          'next',
          this._string(ctx, 'entry.next'),
          this._string(ctx, 'entry.next_named'),
        ),
      )}
      ${
        this._missing(entityId)
          ? CalendarView.entryNotice(this._string(ctx, 'calendars.missing'), true)
          : nothing
      }
      ${notice ? CalendarView.entryNotice(notice.text, notice.warning) : nothing}
      ${this._renderSplitDone(key, ctx)} ${this._renderScope(ctx)}
      <div
        class="field"
        data-focus="entry-calendar"
        tabindex="-1"
        role="group"
        aria-label=${this._string(ctx, 'entry.calendar')}
      >
        <ha-form
          class="entry-calendar-form"
          data-hass=${pickFeed}
          .hass=${pickHass}
          .data=${this._intern(`entry.${key}.calendar`, { calendar: entityId })}
          .schema=${chassis.entryCalendar}
          .computeLabel=${this._keep(
            'entry-calendar.label',
            ctx.language,
            () => () => this._string(ctx, 'entry.calendar'),
          )}
          .computeHelper=${this._keep(
            'entry-calendar.helper',
            ctx.language,
            () => () => this._string(ctx, 'entry.calendar.helper'),
          )}
          @value-changed=${(event: CustomEvent) => this._entryCalendarChanged(key, event)}
        ></ha-form>
      </div>
      ${groups}
      <div class="page-foot entry-remove">
        ${CalendarView.textButton(
          {
            label: single
              ? this._string(ctx, 'entry.remove', { name })
              : this._string(ctx, 'strip.remove_entry'),
            focus: 'entry-remove',
            name: interpolate(
              single
                ? this._string(ctx, 'strip.remove')
                : this._string(ctx, 'strip.remove_entry_named'),
              {
                name: this._entryName(key),
              },
            ),
            onPress: () => this._removeEntry(key),
          },
          ' destructive',
        )}
      </div>
      ${PageView.footBack(t, this._back)}
    </div>`;
  }

  /**
   * Folds a change from Home Assistant's Visibility editor into one calendar's conditions. It
   * sends the whole list, empty once the last condition is removed, which stores nothing.
   *
   * @param key - The entry's key
   * @param event - The editor's `value-changed`
   */
  private _visibilityChanged(key: number, event: CustomEvent): void {
    event.stopPropagation();

    const conditions: unknown = event.detail?.value;
    const entry = this._entryOf(key);
    if (!Array.isArray(conditions) || entry === undefined) return;

    this._emittedConditions.set(key, {
      entityId: Synthetic.entityIdOf(entry),
      conditions,
    });
    const ctx = this._ctx;
    this._commit(
      this._string(ctx, 'history.change_for', {
        setting: this._string(ctx, `entity.${VISIBILITY}`),
        name: this._calendarName(Synthetic.entityIdOf(entry)),
      }),
      undefined,
      () => this._writeFieldValue({ kind: 'entry', key }, `calendar:${VISIBILITY}`, conditions),
      `field:calendar:${VISIBILITY}`,
    );
  }

  /**
   * A calendar's conditions as Home Assistant's Visibility editor is handed them: the very list it
   * last sent for this entry, wherever the stored conditions still say the same.
   *
   * Its editor keeps a condition open by the identity of the condition's object, and hands that
   * identity on to the object it sends for a changed one, as Home Assistant's own card dialog
   * hands the list straight back. Every write here stores a copy (`_report`), so the stored
   * objects are new ones each time: handed those, the editor would take every condition for a new
   * one and draw it closed, after every change. A list that says something else, because the YAML
   * changed under it, is handed over as stored. Kept by the entry's key, so a move, a removal
   * above it or a re-point keeps the list with its entry.
   *
   * @param key - The entry's key
   * @param entityId - The calendar
   * @param stored - Its `visibility` as stored
   * @returns The list, or undefined where only the YAML box can show it (`editableConditions`)
   */
  private _conditionsFor(
    key: number,
    entityId: string,
    stored: unknown,
  ): ReadonlyArray<unknown> | undefined {
    const conditions = editableConditions(stored);
    const emitted = this._emittedConditions.get(key);
    if (
      conditions !== undefined &&
      emitted?.entityId === entityId &&
      sameConditions(conditions, emitted.conditions)
    ) {
      return emitted.conditions;
    }
    return conditions;
  }

  /**
   * Puts focus where a removed calendar's row was, once the line its removal left closes with
   * focus on it: on the row drawn in its place now, else the one before it, else Add Calendar,
   * else the Calendars heading.
   *
   * @param at - The removed calendar's place among the calendars drawn
   */
  private async _focusAfterRemove(at: number): Promise<void> {
    await this.updateComplete;
    const root = this.renderRoot;
    const calendars = root.querySelectorAll('.cal-group');
    const calendar = calendars[Math.min(at, calendars.length - 1)];
    const target = calendar?.querySelector<HTMLElement>('.cal-body, .row-more');
    if (target) target.focus({ preventScroll: true });
    else {
      Focus.focusFirst(root, [
        Focus.byFocusKey('add-calendar'),
        '[data-heading="calendars"] .heading',
      ]);
    }
  }

  /**
   * Renders the toolbar's own buttons, under the heading Card & Header draws for them (D09 A): a
   * list of rows, each with its drag handle, its name and what a press does, which opens in place
   * to Move Up, Move Down, Remove and a form per field; the keyboard grab's line, the line a
   * removal left, and Add Button after the last.
   *
   * Only while the toolbar is shown, as the card draws the buttons only then. The list is read
   * as written, so an entry the card cannot draw yet, such as one whose icon was just cleared,
   * stays here to be finished. Add Button is withheld while the editor is filtered, where the
   * button it adds could arrive hidden.
   *
   * @param ctx - Schema context
   * @returns The buttons, or nothing while the toolbar is hidden
   */
  private _renderToolbarButtons(ctx: SchemaCtx): TemplateResult | typeof nothing {
    if (!Config.resolveToolbar(ctx.config).show) return nothing;

    const written = Buttons.writtenButtons(this._config!);
    const shown = this._buttonSchemas(this._buttonSubform(ctx));

    const untitled = this._string(ctx, 'toolbar.buttons.untitled');
    const grab = this._grabbed('button');
    const preview = grab === undefined ? undefined : Reorder.order(this._buttonKeys, grab);
    const localize = withCardActionLabels(this.hass, ctx.language)?.localize;
    const rows = shown.map(({ entry, index, key, schema, data }): ChipsView.ButtonRowModel => {
      const title = Buttons.buttonTitle(entry, index, untitled);
      return {
        key,
        title,
        summary: Buttons.buttonSummary(entry, localize, this._string(ctx, 'button.summary')),
        open: this._openButtons.has(key) || this._jumpsTo('button-field', key),
        place: preview?.indexOf(key),
        grabbed: grab?.key === key,
        handle: this._handle('button', String(key), key, title, ctx),
        onToggle: () => {
          const open = new Set(this._openButtons);
          if (!open.delete(key)) open.add(key);
          this._openButtons = open;
        },
        actions: [
          {
            label: this._string(ctx, 'toolbar.buttons.move_up'),
            move: 'up',
            enabled: index > 0,
            onPress: () => this._moveButton(index, index - 1),
          },
          {
            label: this._string(ctx, 'toolbar.buttons.move_down'),
            move: 'down',
            enabled: index < written.length - 1,
            onPress: () => this._moveButton(index, index + 1),
          },
          {
            label: this._string(ctx, 'toolbar.buttons.remove'),
            enabled: true,
            onPress: () => this._removeButton(index),
          },
        ],
        body: () => this._renderButtonFields(key, title, schema, data, ctx),
      };
    });

    return html`
      ${ChipsView.buttonList(rows)} ${this._renderGrabStatus(ctx, 'button')}
      ${this._renderStatus(ctx, ['button'])}
      <button type="button" class="text-button add-button" @click=${this._addButton}>
        ${this._string(ctx, 'toolbar.buttons.add')}
      </button>
    `;
  }

  /**
   * An open button row's fields, each in a form of its own inside the editor's wrapper named
   * after it, as an entry's fields are drawn (`_renderEntryField`). Each form's frame names the
   * button by key, so a change it sends late still reaches this button wherever it has moved.
   *
   * @param key - The button's key
   * @param title - Its name, which names an undo step
   * @param schema - Its fields as the filter bar leaves them
   * @param values - Its form data
   * @param ctx - Schema context
   * @returns The fields
   */
  private _renderButtonFields(
    key: number,
    title: string,
    schema: ReadonlyArray<HaFormSchema>,
    values: Record<string, unknown>,
    ctx: SchemaCtx,
  ): unknown {
    const workspace = ctx.workspace ?? ctx.view;
    return repeat(
      buttonFieldIndex(schema).fields.values(),
      (field) => field.id,
      (field) => {
        const slot = `button.${key}.${field.id}`;
        const lifted = this._intern(slot, field.lifted);
        const data = this._intern(`${slot}.data`, Routing.formDataFor(values, lifted));
        const [hass, feed] = this._feed(lifted, ctx.language);
        const frame: WriteFrames.OwnedFrame = {
          owner: { kind: 'button', key },
          workspace,
          schema: lifted,
          data,
        };
        const wrapper = html`<div
          class="field"
          data-field=${field.id}
          tabindex="-1"
          role="group"
          aria-label=${fieldLabel(field, ctx.language)}
        >
          <ha-form
            class="button-form"
            data-hass=${feed}
            .hass=${hass}
            .data=${data}
            .schema=${lifted}
            .computeLabel=${this._labeler(ctx.language, field.labelPath)}
            .computeHelper=${this._subformHelper(ctx, field.labelPath, false)}
            .localizeValue=${this._localizeValue}
            @value-changed=${(event: CustomEvent) =>
              this._valueChanged(frame, event, field.labelPath, `button:${key}`, title)}
          ></ha-form>
        </div>`;
        return this._jumpsTo('button-field', key) && this._jump!.target.id === field.id
          ? this._jumpTo(ctx, wrapper)
          : wrapper;
      },
    );
  }

  /**
   * The buttons' keys, made afresh for a list whose length the editor did not change itself,
   * such as one edited in YAML.
   *
   * @param length - How many buttons the list holds
   * @returns A key per button, in order
   */
  private _buttonKeysFor(length: number): number[] {
    if (this._buttonKeys.length !== length) {
      this._buttonKeys = Array.from({ length }, () => this._nextButtonKey++);
      this._openButtons = new Set();
    }
    return this._buttonKeys;
  }

  /**
   * Stores a new list of toolbar buttons, and nothing else.
   *
   * @param buttons - The list as it should be written
   * @returns Whether it was written, which a blocked migration prevents
   */
  private _writeButtons(buttons: ReadonlyArray<unknown>): boolean {
    if (!this._config || !this._prepareForWrite()) return false;
    const toolbar = Helpers.isConfigBlock(this._config.toolbar) ? this._config.toolbar : {};
    this._config = {
      ...this._config,
      toolbar: { ...toolbar, buttons: [...buttons] as Types.ToolbarButtonConfig[] },
    };

    this._report(this._config);
    return true;
  }

  /**
   * Moves one button to another place, its row with it, as one undo step, and says where it went.
   * From its strip, focus stays on the control that moved it, or passes to its other move control
   * once the button reaches an end, so a keyboard can keep moving it; from its handle or Alt+Arrow
   * (`focusKey`), it stays on the moved button's handle.
   *
   * @param index - Position of the button in the list
   * @param to - Its new position
   * @param focusKey - The `data-focus` key of the handle that moved it
   */
  private _moveButton(index: number, to: number, focusKey?: string): void {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    if (to < 0 || to >= written.length || to === index) return;

    const keys = this._buttonKeysFor(written.length);
    const moved = keys[index];
    const name = Buttons.buttonTitle(
      written[index],
      index,
      this._string(this._ctx, 'toolbar.buttons.untitled'),
    );
    let done = false;
    // Two identical buttons swap places without the configuration moving, so no undo step is
    // recorded; their rows and keys still move, and focus and the words follow them.
    this._commit(
      this._string(this._ctx, 'history.move', { name }),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.moveButtonTo(written, index, to))) return;
        keys.splice(to, 0, ...keys.splice(index, 1));
        done = true;
      },
      `button:${moved}`,
    );
    if (!done) return;
    this._say(
      this._string(this._ctx, 'announce.moved', {
        name,
        position: to + 1,
        total: written.length,
      }),
    );
    void this.updateComplete.then(() => {
      if (focusKey !== undefined) {
        Focus.focusFirst(this.renderRoot, [Focus.byFocusKey(focusKey)]);
        return;
      }
      const active = (this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement | null;
      if (active !== null && !active.disabled) return;
      const row = this.renderRoot.querySelector(`.button-row[data-button-key="${moved}"]`);
      const by = to < index ? 'up' : 'down';
      const same = row?.querySelector<HTMLButtonElement>(`[data-move="${by}"]`);
      const other = row?.querySelector<HTMLButtonElement>(
        `[data-move="${by === 'up' ? 'down' : 'up'}"]`,
      );
      (same && !same.disabled ? same : other)?.focus();
    });
  }

  /**
   * Drops one button from the list, as one undo step, and leaves the line "Removed Lights · Undo"
   * with focus on its Undo. Once the line closes with focus on it, focus passes to Add Button.
   *
   * @param index - Position of the button in the list
   */
  private _removeButton(index: number): void {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const keys = this._buttonKeysFor(written.length);
    const ctx = this._ctx;
    const name = Buttons.buttonTitle(
      written[index],
      index,
      this._string(ctx, 'toolbar.buttons.untitled'),
    );
    this._commit(
      this._string(ctx, 'history.remove', { name }),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.removeButton(written, index))) return;

        keys.splice(index, 1);
        this._showStatus(
          {
            kind: 'button',
            text: this._string(ctx, 'status.removed', { name }),
            at: index,
          },
          this._string(ctx, 'announce.removed', { name }),
        );
      },
      `button:${keys[index]}`,
    );
  }

  /**
   * Adds a button after the last, its row open to be filled in, and puts focus on its Icon
   * field's wrapper, never inside its form (R15).
   */
  private _addButton = (): void => {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const keys = this._buttonKeysFor(written.length);
    const key = this._nextButtonKey++;
    const added = this._commit(
      this._string(this._ctx, 'toolbar.buttons.add'),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.addButton(written))) return;

        keys.push(key);
        this._openButtons = new Set([...this._openButtons, key]);
      },
      `button:${key}`,
    );
    if (!added) return;
    this._focusSoon([`.button-row[data-button-key="${key}"] [data-field="button:icon"]`]);
  };

  /**
   * The view whose layer this context writes into, or `undefined` for the shared base.
   *
   * 🚨 Not `ctx.view`, and the difference only appears under the shared workspace. Panels
   * there are built as a view — see {@link Workspace.baseViewForWorkspace} — so `ctx.view`
   * answers *what this looks like*, which is the wrong question for anything that resolves
   * a value or writes one. Both callers below reach a block by view name, and a name sends
   * them into that block; the shared base has none. `ctx.workspace` is absent for callers
   * that build a context by hand, where the two questions still coincide.
   *
   * @param ctx - Editing context
   * @returns The view being written, or `undefined` when the shared base is
   */
  private _destinationView(ctx: SchemaCtx): Types.EffectiveView | undefined {
    return ctx.workspace === undefined ? ctx.view : Workspace.viewForWorkspace(ctx.workspace);
  }

  /**
   * Resolves a string the chassis renders itself, rather than through a schema.
   *
   * @param ctx - Schema context
   * @param key - String key
   * @param values - What its placeholders are filled with, if anything
   * @returns The string, humanized as a last resort
   */
  private _string(ctx: SchemaCtx, key: string, values?: Words): string {
    const string = EditorLocalize.lookup(ctx.language, key) ?? EditorLocalize.humanize(key);
    return values ? interpolate(string, values) : string;
  }

  /**
   * Renders the editor.
   *
   * @returns The editor template
   */
  render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const ctx = this._ctx;
    if (this._migration.kind === 'choice') {
      return this._renderMigrationChoice(ctx, this._migration.keys);
    }
    if (this._migration.kind === 'future') {
      return this._renderMigrationBlock(
        ctx,
        'config_migration.future_title',
        this._string(ctx, 'config_migration.future_message', {
          version: this._migration.version,
        }),
      );
    }
    if (this._migration.kind === 'invalid') {
      return this._renderMigrationBlock(
        ctx,
        'config_migration.invalid_title',
        this._string(ctx, 'config_migration.invalid_message', {
          value: String(this._migration.value),
        }),
      );
    }
    if (this._quickSetup !== undefined) {
      return this._renderQuickSetup(ctx, this._quickSetup);
    }
    this._drawn = [];
    this._drawnConditions = new Map();
    const index = buildFieldIndex(ctx);
    const present = index.fields;
    // Search reaches every placed field built here; a page draws those the shown set keeps.
    const shown = new Set([...present.keys()].filter((id) => placementOf(id) !== undefined));
    this._drawing = { present, shown, index };
    // Every field's form, drawn on the open page or not, and every toolbar button's, so what a
    // page or a panel draws has loaded before it opens.
    const data = this._formData();
    for (const id of shown) {
      const field = present.get(id);
      // A field the registry places nowhere is drawn nowhere (the registry test fails on it).
      if (field !== undefined && placementOf(id) !== undefined) {
        this._drawn.push([field.lifted, data]);
      }
    }
    // Every entry's page's forms, wherever the editor is: a form per placed field, as
    // `_renderEntryPage` draws them, but `visibility` where Home Assistant's Visibility editor
    // holds the conditions instead.
    const all = this._config!.entities ?? [];
    const conditionsEditor = conditionsEditorDefined();
    for (const { entry, key, schema } of this._entrySchemas(this._entrySubform(ctx), ctx)) {
      if (!Filter.hasFields(schema)) continue;
      const entityId = Synthetic.entityIdOf(entry);
      const conditions = conditionsEditor
        ? this._conditionsFor(key, entityId, Entities.asEntityConfig(entry).visibility)
        : undefined;
      const values = Entities.toEntityFormData(entry, all);
      for (const field of entityFieldIndex(schema).fields.values()) {
        if (placementOf(field.id) === undefined) continue;
        if (conditions !== undefined && field.id === `calendar:${VISIBILITY}`) continue;
        this._drawn.push([field.lifted, values]);
      }
      for (const each of conditions ?? []) {
        this._drawnConditions.set(JSON.stringify(each), entityId);
      }
    }
    if (Config.resolveToolbar(ctx.config).show) {
      for (const { schema, data: values } of this._buttonSchemas(this._buttonSubform(ctx))) {
        if (Filter.hasFields(schema)) this._drawn.push([schema, values]);
      }
    }
    const chassis = this._keep('chassis', ctx.language, () =>
      Subforms.chassisSchemas(ctx.language),
    );
    // Drawn as the editor opens, so it loads its own values' elements: its types suffice.
    this._drawn.push(
      [chassis.filter, NO_DATA],
      [chassis.addCalendar, NO_DATA],
      [chassis.entryCalendar, NO_DATA],
    );

    const route = this._nav.route;
    const page = route.kind === 'page' ? PAGES.find((each) => each.id === route.page) : undefined;
    const spoken = this._announcer.take();
    if (spoken !== undefined) this._spoken = spoken;

    return html`
      <div class="card-config" @keydown=${this._onKeydown}>
        ${cache(
          !this._exists(route) || route.kind === 'overview' || (route.kind === 'page' && !page)
            ? this._renderOverview(ctx, chassis)
            : keyed(
                Navigation.routeKey(route),
                route.kind === 'entry'
                  ? this._renderEntryPage(route.key, ctx)
                  : route.kind === 'audit'
                    ? this._renderAudit(ctx)
                    : route.kind === 'notices'
                      ? this._renderNotices(ctx)
                      : this._renderPage(page!, ctx),
              ),
        )}
        <div class="live-region" role="status" aria-live="polite">${this._spoken}</div>
      </div>
    `;
  }

  /**
   * Renders the one-time interpretation choice for ambiguous legacy values.
   *
   * @param ctx - Current editor context
   * @param keys - Authored roots whose meaning differs between List and another view
   * @returns The blocking choice surface
   */
  private _renderMigrationChoice(ctx: SchemaCtx, keys: ReadonlyArray<string>): TemplateResult {
    const block = ViewConfig.viewBlockFor(this._viewForConfig(this._config!));
    const messageKey =
      block === ViewConfig.VIEW_BLOCKS.grid
        ? 'config_migration.grid_message'
        : 'config_migration.list_message';
    const options = keys.map((key) => this._string(ctx, key)).join(', ');

    // Undo and Redo stay at hand: an undone choice returns here, and Redo makes it again.
    return html`
      <div class="card-config" @keydown=${this._onKeydown}>
        ${
          this._history.canUndo || this._history.canRedo
            ? html`<div class="filter-bar">${this._renderHistory(ctx)}</div>`
            : nothing
        }
        <div
          class="config-migration"
          data-config-migration
          role="group"
          aria-labelledby="config-migration-title"
        >
          <strong id="config-migration-title" tabindex="-1"
            >${this._string(ctx, 'config_migration.title')}</strong
          >
          <div>${this._string(ctx, messageKey)}</div>
          <div>${this._string(ctx, 'config_migration.affected', { options })}</div>
          <button
            type="button"
            class="migration-choice primary"
            @click=${() => this._chooseMigration('keep-list')}
          >
            ${this._string(ctx, 'config_migration.keep_list')}
          </button>
          <div class="migration-choice-note">
            ${this._string(ctx, 'config_migration.keep_list_note')}
          </div>
          <button
            type="button"
            class="migration-choice"
            @click=${() => this._chooseMigration('shared-root')}
          >
            ${this._string(ctx, 'config_migration.use_shared')}
          </button>
          <div class="migration-choice-note">
            ${this._string(ctx, 'config_migration.use_shared_note')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders a non-destructive version error with no configuration controls.
   *
   * @param ctx - Current editor context
   * @param titleKey - Localized heading key
   * @param message - Resolved explanatory text
   * @returns The blocking message
   */
  private _renderMigrationBlock(ctx: SchemaCtx, titleKey: string, message: string): TemplateResult {
    return html`
      <div class="card-config">
        <div class="config-migration" data-config-migration role="alert">
          <strong>${this._string(ctx, titleKey)}</strong>
          <div>${message}</div>
        </div>
      </div>
    `;
  }

  /**
   * Reports the options kept across the explicit switch to Grid, once per transition.
   *
   * @param ctx - Current editor context
   * @returns One dismissible notice, or nothing when no authored value conflicted
   */
  private _renderGridReconciliation(ctx: SchemaCtx): TemplateResult | typeof nothing {
    if (this._gridReconciliation.length === 0) return nothing;
    const options = this._gridReconciliation.map((key) => this._string(ctx, key)).join(', ');
    return html`
      <div class="grid-reconciliation" data-grid-reconciliation role="status">
        <strong>${this._string(ctx, 'grid_reconciliation.title')}</strong>
        <div>${this._string(ctx, 'grid_reconciliation.message', { options })}</div>
        <button
          type="button"
          class="text-button"
          data-focus="grid-keeps"
          @click=${() => this._open({ kind: 'audit', group: 'grid' }, 'grid-keeps', 'push', 'audit:grid')}
        >
          ${this._string(ctx, 'grid_reconciliation.see')}
        </button>
        <button
          type="button"
          class="text-button"
          @click=${() => {
            this._gridReconciliation = [];
          }}
        >
          ${this._string(ctx, 'grid_reconciliation.dismiss')}
        </button>
      </div>
    `;
  }

  /**
   * Renders Quick Setup in place of the panels: one step at a time, with its own buttons.
   *
   * @param ctx - Current editor context
   * @param session - The run in progress
   * @returns The Quick Setup surface
   */
  private _renderQuickSetup(ctx: SchemaCtx, session: QuickSetupSession): TemplateResult {
    const index = QUICK_SETUP_STEPS.indexOf(session.step);
    const answers = session.answers;
    const ready =
      session.step === 'story'
        ? answers !== undefined
        : answers !== undefined && answers.calendars.length > 0;
    const last = index === QUICK_SETUP_STEPS.length - 1;

    return html`
      <div class="card-config" @keydown=${this._onKeydown}>
        <div
          class="quick-setup"
          data-quick-setup=${session.step}
          role="group"
          aria-labelledby="quick-setup-title"
        >
          <strong id="quick-setup-title">${this._string(ctx, 'quick_setup.title')}</strong>
          <div class="quick-setup-step" tabindex="-1">
            ${this._string(ctx, 'quick_setup.step', {
              step: index + 1,
              steps: QUICK_SETUP_STEPS.length,
              name: this._string(ctx, `quick_setup.step.${session.step}`),
            })}
          </div>
          ${this._renderQuickSetupStep(ctx, session)}
          <div class="quick-setup-actions">
            <button
              type="button"
              class="text-button"
              data-quick-setup-cancel
              @click=${this._cancelQuickSetup}
            >
              ${this._string(ctx, 'quick_setup.cancel')}
            </button>
            ${
              index > 0
                ? html`<button
                    type="button"
                    class="migration-choice"
                    data-quick-setup-back
                    @click=${() => this._quickSetupGo(QUICK_SETUP_STEPS[index - 1])}
                  >
                    ${this._string(ctx, 'quick_setup.back')}
                  </button>`
                : nothing
            }
            ${
              last
                ? html`<button
                    type="button"
                    class="migration-choice primary"
                    data-quick-setup-apply
                    ?disabled=${!ready}
                    @click=${this._applyQuickSetup}
                  >
                    ${this._string(ctx, 'quick_setup.apply')}
                  </button>`
                : html`<button
                    type="button"
                    class="migration-choice primary"
                    data-quick-setup-next
                    ?disabled=${!ready}
                    @click=${() => this._quickSetupGo(QUICK_SETUP_STEPS[index + 1])}
                  >
                    ${this._string(ctx, 'quick_setup.next')}
                  </button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  /**
   * The body of one Quick Setup step.
   *
   * @param ctx - Current editor context
   * @param session - The run in progress
   * @returns The step's content
   */
  private _renderQuickSetupStep(ctx: SchemaCtx, session: QuickSetupSession): TemplateResult {
    const answers = session.answers;

    if (session.step === 'story' || answers === undefined) {
      return html`
        <div>${this._string(ctx, 'quick_setup.story_intro')}</div>
        <div class="quick-setup-stories">
          ${STORIES.map(
            (story) => html`
              <div class="story-option">
                <button
                  type="button"
                  class="story-tile"
                  data-story=${story.id}
                  aria-pressed=${answers?.story === story.id ? 'true' : 'false'}
                  @click=${() => this._pickStory(story.id)}
                >
                  <span class="story-name"
                    >${this._string(ctx, `quick_setup.story.${story.id}`)}</span
                  >
                  <span class="story-detail"
                    >${this._string(ctx, `quick_setup.story.${story.id}.best_for`)}</span
                  >
                  <span class="story-detail"
                    >${this._string(ctx, `quick_setup.story.${story.id}.space`)}</span
                  >
                </button>
                <a
                  class="story-link"
                  href=${`${DOCS_SITE}${story.page}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${this._string(ctx, 'quick_setup.read_story')}</a
                >
              </div>
            `,
          )}
        </div>
      `;
    }

    if (session.step === 'review') return this._renderQuickSetupReview(ctx, session, answers);

    const step = {
      calendars: {
        schema: QUICK_SETUP_CALENDARS_SCHEMA,
        data: { card_title: answers.title, card_calendars: [...answers.calendars] },
      },
      weather: {
        schema: QUICK_SETUP_WEATHER_SCHEMA,
        data: answers.weather === '' ? {} : { weather_entity: answers.weather },
      },
      taps: {
        schema: QUICK_SETUP_TAPS_SCHEMA,
        data: {
          show_toolbar: answers.toolbar,
          event_details: answers.eventDetails,
          day_adds: answers.dayAdds,
        },
      },
    }[session.step];

    const [hass, feed] = this._feed(step.schema, ctx.language);

    return html`
      ${keyed(
        session.step,
        html`<ha-form
          class="quick-setup-form"
          data-hass=${feed}
          .hass=${hass}
          .data=${this._intern(`quick_setup.${session.step}`, step.data)}
          .schema=${step.schema}
          .computeLabel=${this._labeler(ctx.language, QUICK_SETUP_PATH)}
          .computeHelper=${this._keep(
            'helper.quick_setup',
            ctx.language,
            () => (schema: HaFormSchema) =>
              EditorLocalize.lookup(
                ctx.language,
                `${EditorLocalize.qualifiedKey(schema.name, QUICK_SETUP_PATH)}.helper`,
              ),
          )}
          @value-changed=${this._quickSetupFormChanged}
        ></ha-form>`,
      )}
      ${
        session.step === 'calendars' && answers.calendars.length === 0
          ? html`<div class="quick-setup-note">
              ${this._string(ctx, 'quick_setup.calendars_needed')}
            </div>`
          : nothing
      }
    `;
  }

  /**
   * What Apply will do, said plainly.
   *
   * @param ctx - Current editor context
   * @param session - The run in progress
   * @param answers - What Quick Setup has been told
   * @returns The review
   */
  private _renderQuickSetupReview(
    ctx: SchemaCtx,
    session: QuickSetupSession,
    answers: QuickSetup.QuickSetupAnswers,
  ): TemplateResult {
    const name = (calendar: string): string => Entities.entityDisplayName(calendar, this.hass);
    const colored = QuickSetup.storyColors(session.opening, answers).map(({ calendar }) =>
      name(calendar),
    );
    const list = (items: ReadonlyArray<string>): string =>
      EditorLocalize.formatList(ctx.language, items, 'conjunction');

    return html`
      <ul class="quick-setup-review">
        <li>
          ${this._string(ctx, 'quick_setup.review_story', {
            story: this._string(ctx, `quick_setup.story.${answers.story}`),
          })}
        </li>
        <li>
          ${this._string(ctx, 'quick_setup.review_calendars', {
            calendars: list(answers.calendars.map(name)),
          })}
        </li>
        ${
          colored.length > 0
            ? html`<li>
                ${this._string(ctx, 'quick_setup.review_colors', {
                  calendars: list(colored),
                })}
              </li>`
            : nothing
        }
        <li>${this._string(ctx, 'quick_setup.review_keeps')}</li>
      </ul>
    `;
  }

  /** Opens Quick Setup on the card as it is now. */
  private _openQuickSetup = (): void => {
    this._cancelSplit(false);
    this._quickSetup = {
      opening: structuredClone(this._rawConfig),
      openingAuthoredRootKeys: new Set(this._authoredRootKeys),
      openingSnapshot: this._snapshot(),
      step: 'story',
      previews: [],
    };
    this._keepFocusInQuickSetup();
  };

  /**
   * Puts focus on Quick Setup's step line once a step renders, where focus is not in the editor:
   * Safari does not focus a button on click, so Escape would otherwise reach no listener of the
   * editor's. Where focus is on Next or Back, it stays there.
   */
  private _keepFocusInQuickSetup(): void {
    void this.updateComplete.then(() => {
      if ((this.renderRoot as ShadowRoot).activeElement !== null) return;
      Focus.focusFirst(this.renderRoot, ['.quick-setup-step']);
    });
  }

  /**
   * Moves Quick Setup to another step.
   *
   * @param step - The step to show
   */
  private _quickSetupGo(step: QuickSetupStep): void {
    if (this._quickSetup === undefined) return;
    this._quickSetup = { ...this._quickSetup, step };
    this._keepFocusInQuickSetup();
  }

  /**
   * Starts from a story, keeping what the user already told Quick Setup about this card.
   *
   * @param id - The story picked
   */
  private _pickStory(id: StoryId): void {
    const session = this._quickSetup;
    if (session === undefined) return;
    this._quickSetupAnswer(
      QuickSetup.answersForStory(session.answers, id, session.opening, this.hass?.states),
    );
  }

  /**
   * Reads a Quick Setup form's change into the answers.
   *
   * @param event - The form's `value-changed`
   */
  private _quickSetupFormChanged = (event: CustomEvent): void => {
    event.stopPropagation();
    const answers = this._quickSetup?.answers;
    const value = event.detail?.value as Record<string, unknown> | undefined;
    if (answers === undefined || value === undefined) return;

    const text = (candidate: unknown): string => (typeof candidate === 'string' ? candidate : '');
    const patch: Partial<QuickSetup.QuickSetupAnswers> =
      this._quickSetup?.step === 'calendars'
        ? {
            title: text(value.card_title),
            calendars: Array.isArray(value.card_calendars)
              ? value.card_calendars.filter(
                  (id): id is string => typeof id === 'string' && id !== '',
                )
              : [],
          }
        : this._quickSetup?.step === 'weather'
          ? { weather: text(value.weather_entity) }
          : {
              toolbar: value.show_toolbar === true,
              eventDetails: value.event_details === true,
              dayAdds: value.day_adds === true,
            };

    this._quickSetupAnswer({ ...answers, ...patch });
  };

  /**
   * Records new answers and shows them in the preview.
   *
   * The preview is a real write, rebuilt from the configuration Quick Setup opened on and kept
   * in the session, so its echo is recognized and Cancel can undo it.
   *
   * @param answers - What Quick Setup has now been told
   */
  private _quickSetupAnswer(answers: QuickSetup.QuickSetupAnswers): void {
    const session = this._quickSetup;
    if (session === undefined) return;

    const preview = QuickSetup.buildQuickSetupConfig(session.opening, answers);
    // Compared with Quick Setup's own last write, not `_lastDispatched`: an echo recomputes that
    // under the authorship Quick Setup opened with, so it no longer reads as the preview.
    const next = Preview.withPreview(session, preview);
    this._quickSetup = { ...session, ...next, answers };
    if (next === session) return;

    this._send(preview);
  }

  /** Closes Quick Setup and puts the card back exactly as it was when Quick Setup opened. */
  private _cancelQuickSetup = (): void => {
    const session = this._quickSetup;
    if (session === undefined) return;
    this._quickSetup = undefined;
    if (session.previews.length === 0) return;

    const opening = structuredClone(session.opening) as Record<string, unknown>;
    this._carryEntryKeys(Array.isArray(opening.entities) ? opening.entities : []);
    this._adopt(opening, opening);
    this._authoredRootKeys = new Set(session.openingAuthoredRootKeys);
    this._migration = this._migrationState(opening);
    this._send(opening);
  };

  /**
   * Writes what Quick Setup built and returns to the panels, with that as the authored truth, as
   * one undo step from the card as Quick Setup opened on it, and leaves the line "Applied Family
   * Hub · Undo".
   *
   * Like a migration's adoption: everything the editor keeps about the YAML it last saw is reset
   * to the new configuration, before Home Assistant echoes it.
   */
  private _applyQuickSetup = (): void => {
    const session = this._quickSetup;
    if (session?.answers === undefined || session.answers.calendars.length === 0) return;
    const ctx = this._ctx;
    const story = this._string(ctx, `quick_setup.story.${session.answers.story}`);
    const applied = this._commit(
      this._string(ctx, 'history.apply', { story }),
      undefined,
      () => this._applyStory(session),
      undefined,
      session.openingSnapshot,
    );
    // An Apply that changed nothing is no step, and its line would offer to undo another.
    if (!applied) return;
    this._showStatus(
      { kind: 'story', text: this._string(ctx, 'status.applied', { story }), at: 0 },
      this._string(ctx, 'announce.applied', { story }),
    );
  };

  /**
   * `_applyQuickSetup`'s change itself.
   *
   * @param session - The run being applied
   */
  private _applyStory(session: QuickSetupSession): void {
    if (session.answers === undefined) return;

    const stored = QuickSetup.buildQuickSetupConfig(session.opening, session.answers);
    const shown = session.previews[session.previews.length - 1] ?? session.opening;
    this._quickSetup = undefined;
    this._banner = false;
    // Quick Setup keeps every block of each calendar it keeps, in order, as the picker does.
    this._carryEntryKeys(Array.isArray(stored.entities) ? stored.entities : []);
    this._adopt(stored, stored);
    this._authoredRootKeys = new Set(Object.keys(stored));
    this._migration = { kind: 'current' };
    this._selectedWorkspace = undefined;
    this._pending = {};
    this._gridReconciliation = [];
    this._gridResetKeys.clear();

    // The last preview already is the result, unless an answer changed without one.
    this._lastDispatched = stored;
    if (Value.equalConfigs(stored, shown)) return;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: stored } }));
  }

  /**
   * Lists the options written where the card ignores them, with a way to move each one.
   *
   * Read from the configuration as the YAML holds it, through the rule the card's own warnings
   * use, and never filtered by search, Customized Only or Essentials Only: it is about what the
   * card is doing with the YAML, not about which controls are on show. A Move button appears for
   * each place that holds no value for the option yet; where one does, moving would replace
   * something the user wrote, so it is named and left for them (backlog item 192).
   *
   * @param ctx - Current editor context
   * @returns The notice, or nothing when every option is where it works
   */
  private _renderMisplaced(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const raw = this._rawConfig;
    const findings = ViewConfig.findMisplacedOptions(raw);
    if (findings.length === 0) return nothing;

    const placeName = (place: Misplaced.Place): string =>
      place === null
        ? this._string(ctx, 'misplaced.top_level')
        : this._string(ctx, `editing_workspace.option.${Misplaced.viewForBlock(place)}.label`);
    const places = (to: ReadonlyArray<Misplaced.Place>): string =>
      EditorLocalize.formatList(ctx.language, to.map(placeName));

    return html`
      <div class="misplaced-options" data-misplaced-options role="status">
        <strong>${this._string(ctx, 'misplaced.title')}</strong>
        <div>${this._string(ctx, 'misplaced.message')}</div>
        <ul>
          ${findings.map(
            (finding) => html`
              <li data-misplaced=${Misplaced.pathOf(finding)}>
                <code>${Misplaced.pathOf(finding)}</code>
                <span
                  >${interpolate(this._string(ctx, `misplaced.${finding.kind.replace('-', '_')}`), {
                    places: places(finding.to),
                  })}</span
                >
                ${finding.to.map((to) =>
                  Misplaced.isFree(raw, finding.key, to)
                    ? html`<button
                        type="button"
                        class="text-button"
                        @click=${() => this._moveMisplaced(finding, to)}
                      >
                        ${this._string(ctx, 'misplaced.move', {
                          place: placeName(to),
                        })}
                      </button>`
                    : html`<span class="misplaced-taken"
                        >${this._string(ctx, 'misplaced.taken', {
                          place: placeName(to),
                        })}</span
                      >`,
                )}
              </li>
            `,
          )}
        </ul>
      </div>
    `;
  }

  /**
   * The overview's notices row, where the YAML holds options the card ignores or options v3.0.0
   * removed: "Options the Card Ignores: 2 · Old Options: 1", opening the notices page.
   *
   * @param ctx - Schema context
   * @returns The row, or nothing
   */
  private _renderNoticesRow(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const t = this._t(ctx);
    const parts = [
      [t('notices.ignored'), ViewConfig.findMisplacedOptions(this._rawConfig).length],
      [t('notices.old'), Deprecated.oldOptions(this._rawConfig).length],
    ] as const;
    const title = parts
      .filter(([, count]) => count > 0)
      .map(([words, count]) => interpolate(words, { count: count }))
      .join(Summary.SUMMARY_SEPARATOR);
    return title
      ? Overview.navRow({ key: 'notices', iconPath: mdiInformationOutline, title }, () =>
          this._open({ kind: 'notices' }, 'notices'),
        )
      : nothing;
  }

  /**
   * The notices page: the options the card ignores, each with its Move, then each option v3.0.0
   * removed with its replacement and Move to it, which the next change would otherwise remove.
   *
   * @param ctx - Schema context
   * @returns The page
   */
  private _renderNotices(ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const raw = this._rawConfig;
    const old = Deprecated.oldOptions(raw);
    const labelOf = (option: Deprecated.OldOption): string => {
      const id = Audit.fieldFor(option.to, option.entry === undefined ? 'shared' : 'calendar');
      const field = id && Audit.anyField(id, ctx.language);
      return field ? fieldLabel(field, ctx.language) : option.to;
    };
    return html`<div class="page" data-page="notices">
      ${PageView.pageHead(t('misplaced.title'), t, this._back, this._renderHistory(ctx), '')}
      ${this._renderMisplaced(ctx)}
      ${
        old.length > 0
          ? PageView.headingBlock({
              title: t('notices.old_title'),
              key: 'old',
              helper: t('notices.old_note'),
              body: html`<ul class="old-options">
                ${old.map((option) => {
                  const label = labelOf(option);
                  return html`<li data-old=${option.path}>
                    <code>${option.path}</code>
                    <span>${t('notices.replaced', { label })}</span>
                    ${
                      Deprecated.canMove(raw, option)
                        ? html`<button
                            type="button"
                            class="text-button"
                            @click=${() => this._moveOld(option)}
                          >
                            ${t('misplaced.move', { place: label })}
                          </button>`
                        : html`<span class="misplaced-taken"
                            >${t('misplaced.taken', { place: label })}</span
                          >`
                    }
                  </li>`;
                })}
              </ul>`,
            })
          : nothing
      }
      ${PageView.footBack(t, this._back)}
    </div>`;
  }

  /** What This Card Changes' groups, made again only when what they read moves. */
  private _audit = Helpers.memoizeLast(
    (
      raw: Readonly<Record<string, unknown>>,
      config: Types.Config,
      pending: Readonly<Record<string, string>>,
      keys: string,
    ): Audit.AuditGroup[] =>
      Audit.auditGroups({
        raw,
        config,
        pending,
        entryKeys: keys === '' ? [] : keys.split(',').map(Number),
      }),
  );

  /**
   * What This Card Changes' groups, for the YAML as it stands.
   *
   * @returns The groups
   */
  private _auditGroups(): Audit.AuditGroup[] {
    const keys = this._entryKeysFor((this._config!.entities ?? []).length);
    return this._audit(this._rawConfig, this._config!, this._pending, keys.join());
  }

  /**
   * The audit's counts, "Set: 24 · Not in Use: 1", as its page and its More row show them.
   *
   * @param t - The editor's strings
   * @returns The words
   */
  private _auditSummary(t: Translate): string {
    const { set, inactive } = Audit.auditCounts(this._auditGroups());
    return [
      t('summary.set', { count: set }),
      ...(inactive > 0 ? [t('audit.not_in_use', { count: inactive })] : []),
    ].join(Summary.SUMMARY_SEPARATOR);
  }

  /**
   * What This Card Changes (section 5.10): every stored line, grouped by where it lives, each a
   * compact row whose Edit mounts its field's control in place and writes where the line lives,
   * with Reset and Go to Setting; Reset All per layout, and the lines kept as written, read-only.
   *
   * @param ctx - Schema context
   * @returns The page
   */
  private _renderAudit(ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const layout = this._layoutName(ctx);
    const groups = [...this._auditGroups()];
    const edit = this._auditEdit;
    if (edit && !groups.some((group) => group.lines.some((line) => line.text === edit.line.text))) {
      const at = groups.findIndex(
        (group) =>
          group.kind === edit.group.kind &&
          group.workspace === edit.group.workspace &&
          group.key === edit.group.key,
      );
      if (at < 0) groups.push({ ...edit.group, lines: [edit.line] });
      else groups[at] = { ...groups[at], lines: [...groups[at].lines, edit.line] };
    }
    const view = (group: Audit.AuditGroup): TemplateResult => {
      const count = t('summary.set', { count: group.lines.length });
      const rows = group.lines.map((line) => this._auditRow(line, group, ctx));
      const key = group.key ?? 0;
      const name = this._entryName(key);
      const where = layout(group.workspace);
      return group.kind === 'entry'
        ? AuditView.auditGroup({
            key: `audit:entry:${key}`,
            title: name,
            count,
            sub: true,
            action: {
              label: t('audit.go_to', { name }),
              focus: `audit-entry:${key}`,
              onPress: () => this._open({ kind: 'entry', key }, `audit-entry:${key}`),
            },
            rows,
          })
        : AuditView.auditGroup({
            key: `audit:${group.kind === 'layout' ? group.workspace : group.kind}`,
            title:
              group.kind === 'card'
                ? t('audit.card')
                : group.kind === 'kept'
                  ? t('audit.kept')
                  : where,
            count,
            note:
              group.kind === 'card'
                ? t('audit.card_note')
                : group.kind === 'kept'
                  ? t('audit.kept_note')
                  : undefined,
            action:
              group.kind === 'layout'
                ? {
                    label: t('audit.reset_all', { layout: where }),
                    focus: `reset-all:${group.workspace}`,
                    onPress: () => {
                      this._commit(t('audit.reset_all', { layout: where }), undefined, () =>
                        this._applyReset(
                          // Line by line, so a line kept as written in the block stays.
                          group.lines.map((line) => ({ kind: 'path' as const, path: line.path })),
                          [],
                        ),
                      );
                      this._say(t('audit.reset_all_done', { layout: where }));
                      this._focusSoon(['.page-title']);
                    },
                  }
                : undefined,
            rows,
          });
    };
    const entries = groups.filter((group) => group.kind === 'entry');
    return html`<div class="page audit" data-page="audit">
      ${PageView.pageHead(t('more.audit'), t, this._back, this._renderHistory(ctx), t('overview.more'))}
      <p class="hint">${t('audit.intro')}</p>
      <p class="audit-count">${this._auditSummary(t)}</p>
      ${groups.filter((group) => group.kind === 'card' || group.kind === 'layout').map(view)}
      ${
        entries.length > 0
          ? html`<section class="page-group" data-heading="audit:calendars">
              <h3 class="heading" tabindex="-1">${t('panel.calendars')}</h3>
              ${entries.map(view)}
            </section>`
          : nothing
      }
      ${groups.filter((group) => group.kind === 'kept').map(view)}
      ${PageView.footBack(t, this._back)}
    </div>`;
  }

  /**
   * A stored value as its row words it: as its control does, else as YAML would, where the
   * control cannot (an action a mode collapses to Nothing).
   *
   * @param field - The line's field
   * @param value - The value as stored
   * @param ctx - Schema context
   * @returns The words
   */
  private _auditWord(field: IndexedField, value: unknown, ctx: SchemaCtx): string {
    const word = Summary.wordValue(field, value, ctx.language, this._describe);
    return word === undefined || (typeof value === 'object' && word === String(value))
      ? Audit.plainValue(value)
      : word;
  }

  /**
   * One line of What This Card Changes, as its row: label, value, YAML path, state words and
   * tags; Edit, Reset and Go to Setting where the editor owns the line, none where it keeps it as
   * written.
   *
   * @param line - The line
   * @param group - Its group
   * @param ctx - Schema context
   * @returns The row
   */
  private _auditRow(
    line: Audit.AuditLine,
    group: Audit.AuditGroup,
    ctx: SchemaCtx,
  ): TemplateResult {
    const t = this._t(ctx);
    const layout = this._layoutName(ctx);
    const key = line.path[line.path.length - 1];
    const kept = (): TemplateResult =>
      AuditView.auditRow({
        path: line.text,
        label: key,
        value: Audit.plainValue(line.value),
        words: t('audit.kept'),
        tags: Audit.HA_LAYOUT_KEYS.has(key) ? [t('audit.ha_own')] : [],
      });
    if (line.page !== undefined) {
      const label = this._string(ctx, key === 'view' ? 'view' : 'toolbar.buttons.heading');
      const reset = t('value_source.reset', { option: label });
      return AuditView.auditRow({
        path: line.text,
        label,
        value:
          key === 'view'
            ? layout(line.value as Types.EffectiveView)
            : Audit.buttonNames(line.value, this._string(ctx, 'toolbar.buttons.untitled')),
        words: t('state.set_all_layouts'),
        tags: [],
        reset: {
          name: reset,
          title: t('reset.reset'),
          focus: `audit-reset:${line.text}`,
          onPress: () =>
            this._commit(t('history.reset', { setting: label }), undefined, () =>
              this._applyReset({ kind: 'path', path: line.path }, []),
            ),
        },
        go: {
          name: t('audit.go_to', { name: label }),
          title: t('audit.go_setting'),
          focus: `audit-go:${line.text}`,
          onPress: () =>
            line.page === 'overview'
              ? this._open({ kind: 'overview' }, `audit-go:${line.text}`)
              : this._open(
                  { kind: 'page', page: line.page! },
                  `audit-go:${line.text}`,
                  'push',
                  key,
                ),
        },
      });
    }
    if (line.field === undefined) return kept();

    const entry = group.kind === 'entry' ? group.key! : undefined;
    const wctx = entry === undefined ? this._ctxIn(group.workspace) : ctx;
    const stored = entry === undefined ? undefined : this._entryOf(entry);
    const present =
      stored === undefined ? buildFieldIndex(wctx) : entityFieldIndex(entrySchema(stored, wctx));
    const field = present.fields.get(line.field) ?? Audit.anyField(line.field, ctx.language);
    if (field === undefined) return kept();
    const pctx: Plan.PlanCtx = {
      ...this._planCtx(ctx),
      workspace: group.workspace,
      present,
      universe: universeIndex('en', group.workspace),
      entry,
    };
    const label = fieldLabel(field, ctx.language);
    const named =
      entry !== undefined
        ? t('audit.on_calendar', { label, name: this._entryName(entry) })
        : group.kind === 'layout'
          ? t('audit.in_layout', { label, layout: layout(group.workspace) })
          : label;
    const value = Audit.outsideOptions(field.node, line.value)
      ? t('value.from_yaml', { value: String(line.value) })
      : this._auditWord(field, line.value, ctx);
    const state = Plan.stateOf(field, pctx);
    const outcome = Plan.resetOutcome(field, pctx);
    const entryData =
      stored === undefined
        ? undefined
        : this._intern(
            `entry.${entry}`,
            Entities.toEntityFormData(stored, this._config!.entities ?? []),
          );
    const data = {
      card: this._formDataFor(this._config!, group.workspace, this._pending),
      entry: entryData,
    };
    const labelOf = (id: FieldId): string => {
      const each = universeIndex(ctx.language, group.workspace).fields.get(id);
      return each ? fieldLabel(each, ctx.language) : id;
    };
    const editing = this._auditEdit?.line.text === line.text;
    return AuditView.auditRow({
      path: line.text,
      label,
      value,
      words: Shown.stateText(state, t, layout, this._wordOf(field, ctx)) ?? t('state.set'),
      tags:
        state?.words?.kind !== 'set-layout' &&
        (outcome?.kind === 'default' || outcome?.kind === 'layout-default') &&
        Value.deepEqual(outcome.value, line.value)
          ? [t('audit.same')]
          : [],
      warning: line.inactive
        ? t('audit.inactive', {
            when: whenText(line.inactive.gate, data, ctx.language, labelOf) ?? '',
          })
        : undefined,
      edit: {
        name: t('audit.edit', { label: named, value }),
        onPress: () => {
          this._auditEdit = { line, group };
          // A color's line opens its control, as editing a dropdown's line opens no menu but
          // shows its choices: here the choices are the control's rows and swatches.
          const colorKey = this._colorKeyOf(
            entry === undefined ? WriteFrames.CARD_OWNER : { kind: 'entry', key: entry },
            field.id,
            entry === undefined ? wctx : ctx,
          );
          if (colorKey !== undefined) this._openColor = colorKey;
          this._focusSoon([`[data-audit="${CSS.escape(line.text)}"] [data-field]`]);
        },
      },
      editing: editing
        ? entry === undefined
          ? this._renderField(field, wctx)
          : this._renderEntryField(field, entry, entryData!, ctx)
        : undefined,
      reset: {
        name: t('value_source.reset', { option: named }),
        title: t('reset.reset'),
        focus: `audit-reset:${line.text}`,
        onPress: () => {
          this._commit(t('history.reset', { setting: named }), undefined, () =>
            this._applyReset(
              entry === undefined
                ? { kind: 'path', path: line.path }
                : { kind: 'entry', key: entry, keys: [key] },
              [],
            ),
          );
          this._focusSoon([
            `[data-heading="${CSS.escape(`audit:${entry === undefined ? (group.kind === 'layout' ? group.workspace : 'card') : `entry:${entry}`}`)}"] .heading`,
            '.page-title',
          ]);
        },
      },
      go: {
        name: t('audit.go_to', { name: named }),
        title: t('audit.go_setting'),
        focus: `audit-go:${line.text}`,
        onPress: () => {
          // A calendar's field opens where its page draws it: the scope, else the first that does.
          const scope =
            entry === undefined
              ? group.workspace
              : [this._workspace, ...Workspace.WORKSPACES].find((each) =>
                  entityFieldIndex(entrySchema(stored!, this._ctxIn(each))).fields.has(field.id),
                );
          if (scope !== undefined && scope !== this._workspace) {
            this._selectedWorkspace = scope;
            this._scopeChanged = true;
          }
          const page = placementOf(field.id)?.page;
          this._openResult(
            {
              target:
                entry === undefined
                  ? {
                      kind: 'field',
                      id: field.id,
                      page: page === 'overview' || page === 'entry' ? undefined : page,
                    }
                  : { kind: 'entry-field', id: field.id, key: entry },
              label,
            },
            `audit-go:${line.text}`,
            false,
          );
        },
      },
    });
  }

  /**
   * Moves one misplaced option to where it works, and reports the result.
   *
   * Edits the YAML's own configuration and adopts it as the authored baseline before any echo,
   * never through `_report`: the minimizing write compares against the old baseline, where the
   * option was not at its destination, and would drop a moved value equal to a default.
   *
   * @param finding - The option and where it is written
   * @param to - The place to move it to
   */
  private _moveMisplaced(finding: ViewConfig.MisplacedOption, to: Misplaced.Place): void {
    if (Misplaced.moveOption(this._rawConfig, finding, to) === undefined) return;
    this._commit(
      this._string(this._ctx, 'history.move', { name: Misplaced.pathOf(finding) }),
      undefined,
      () => this._moveOption(finding, to),
    );
  }

  /**
   * `_moveMisplaced`' change itself.
   *
   * @param finding - The option and where it is written
   * @param to - The place to move it to
   */
  private _moveOption(finding: ViewConfig.MisplacedOption, to: Misplaced.Place): void {
    this._writeRaw(
      (raw) => Misplaced.moveOption(raw, finding, to),
      finding.from === null ? finding.key : undefined,
      to === null ? finding.key : undefined,
    );
  }

  /**
   * Moves an option v3.0.0 removed to its replacement, as one undo step (`deprecated.ts`).
   *
   * @param old - The option
   */
  private _moveOld(old: Deprecated.OldOption): void {
    // A pre-v5 card's first write migrates it and removes the option before the move reads it.
    const at = old.entry === undefined ? this._rawConfig : this._config?.entities?.[old.entry];
    const held = Helpers.isConfigBlock(at) ? at[old.key] : undefined;
    this._commit(this._string(this._ctx, 'history.move', { name: old.path }), undefined, () =>
      this._writeRaw(
        (raw) => Deprecated.moveOld(raw, old, held),
        old.entry === undefined ? old.key : undefined,
        old.entry === undefined ? old.to : undefined,
      ),
    );
  }

  /**
   * Writes a change made to the YAML itself, adopted as the authored baseline before any echo:
   * a move, which `_report` would minimize against a baseline that never held the moved line.
   *
   * @param make - The YAML after the change, from the YAML as it stands
   * @param left - A root key the change takes away
   * @param added - A root key the change writes
   */
  private _writeRaw(
    make: (raw: Readonly<Record<string, unknown>>) => Record<string, unknown> | undefined,
    left?: string,
    added?: string,
  ): void {
    if (!this._prepareForWrite()) return;

    // A first write can migrate a pre-v5 card; move within what that produced.
    const next = make(this._rawConfig) ?? structuredClone(this._rawConfig);
    if (left !== undefined) this._authoredRootKeys.delete(left);
    if (added !== undefined) this._authoredRootKeys.add(added);

    this._adopt(next, next);
    this._send(next);
  }

  /**
   * Renders the overview's search row: the search field, then Undo and Redo at its end, so the
   * keyboard reaches them in that order.
   *
   * @param ctx - Current editor context
   * @param chassis - The chassis schemas this render draws
   * @returns The search row
   */
  private _renderFilterBar(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const [hass, feed] = this._feed(chassis.filter, ctx.language);
    return html`
      <div class="filter-bar search-row">
        <ha-form
          class="filter-form"
          data-hass=${feed}
          .hass=${hass}
          .data=${this._intern('filter', Filter.filterFormData(this._filter))}
          .schema=${chassis.filter}
          .computeLabel=${this._labeler(ctx.language)}
          .computeHelper=${this._helper('filter', ctx)}
          .localizeValue=${this._localizeValue}
          @value-changed=${this._filterChanged}
          @compositionstart=${this._compositionStart}
          @compositionend=${this._compositionEnd}
        ></ha-form>
        ${this._renderHistory(ctx)}
      </div>
    `;
  }

  /**
   * Takes a change from the filter bar.
   *
   * @param event - The filter form's `value-changed`
   */
  private _filterChanged = (event: CustomEvent): void => {
    event.stopPropagation();

    const data = event.detail?.value as Record<string, unknown> | undefined;
    if (!data) return;

    const next = Filter.toFilterCriteria(data);
    // Korean and the other input methods: a word is not searched until it is composed.
    if (this._composing) {
      this._composing = { held: next };
      return;
    }
    this._applyFilter(next);
  };

  /** An input method starts composing a word in the search field. */
  private _compositionStart = (): void => {
    this._composing = {};
  };

  /** The word is composed: the query it held is searched. */
  private _compositionEnd = (): void => {
    const held = this._composing?.held;
    this._composing = undefined;
    if (held) this._applyFilter(held);
  };

  /**
   * Applies a query: the results follow, a field a result showed gives way to them, and the count
   * is announced.
   *
   * @param next - The filter
   */
  private _applyFilter(next: Filter.FilterCriteria): void {
    if (next.query === this._filter.query) return;
    this._filter = next;
    this._openResults = new Set();
    if (!Filter.hasQuery(next)) this._editHere = false;
    this._jump = undefined;
    // Typing again leaves the field a result showed for the results.
    this._resultsLeft = undefined;
    // The count, through the queue, once the render that counts it is done.
    if (Filter.hasQuery(next)) void this.updateComplete.then(() => this._say(this._resultStatus));
  }

  /**
   * Says that a query finds nothing.
   *
   * @param ctx - Schema context
   * @returns The message
   */
  private _renderNoMatches(ctx: SchemaCtx): TemplateResult {
    const query = this._filter.query.trim();
    const t = this._t(ctx);
    return SearchView.noMatches(
      t('filter.no_matches', { query }),
      t('search.hint'),
      t('search.clear'),
      () => {
        this._applyFilter({ ...this._filter, query: '' });
        // Focus stays out of forms (`views/focus.ts`): the overview's first list takes it.
        this._focusSoon(['.row-group .heading', '.page-title']);
      },
    );
  }
}
