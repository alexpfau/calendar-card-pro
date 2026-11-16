/**
 * The editor element: the overview, one page per section, and the `<ha-form>` changes they
 * mediate. Schemas name Home Assistant selectors rather than concrete input elements, because HA
 * renames its components without notice; the editor draws its own rows, headings and radio
 * groups through `views/`.
 */

import { mdiCheck, mdiDeleteOutline, mdiFormatListChecks, mdiInformationOutline } from '@mdi/js';
import {
  type ChildPart,
  LitElement,
  type PropertyValues,
  TemplateResult,
  html,
  nothing,
  render as renderInto,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { Directive, directive } from 'lit/directive.js';
import { cache } from 'lit/directives/cache.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';

import { Announcer } from './announce';
import * as Audit from './audit';
import * as Buttons from './buttons';
import * as CalendarList from './calendar-list';
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
import {
  type Appearance,
  CALENDARS_BLOCK,
  FAMILIES,
  type FamilyId,
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  type PageDef,
  isWholeCard,
  placementOf,
} from './pages';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx, type SubformDef } from './panels';
import * as Plan from './plan';
import * as Prefs from './prefs';
import * as QuickSetup from './quick-setup';
import * as Reset from './reset';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import { TOOLBAR_BUTTON_ICON, TOOLBAR_BUTTON_PATH, buildToolbarButtonSchema } from './schemas/card';
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
import { DOCS_SITE, STORIES, type StoryId } from './stories';
import { interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Summary from './summary';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as AuditView from './views/audit';
import * as CalendarView from './views/calendars';
import * as Focus from './views/focus';
import * as HistoryView from './views/history';
import { icon } from './views/icon';
import { escapeAction, historyKey, inTextField } from './views/keys';
import * as Overview from './views/overview';
import * as PageView from './views/page';
import * as SearchView from './views/search';
import * as ShownView from './views/shown';
import * as Workspace from './workspace';
import * as WriteFrames from './write-frames';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { loadIntlLocaleData } from '../../translations/intl-locale-data';
import * as LanguageCodes from '../../translations/language-codes';
import { configuredCalendarName } from '../../utils/calendar-names';
import { isEntityColorSentinel } from '../../utils/entity-colors';
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

/**
 * Panels that have begun to open. A panel mounts its forms the first time it opens and keeps them
 * while it is drawn, so a panel nobody has opened holds no form at all: today's dialog used to
 * build every panel's forms, 124 of them, behind closed panels (backlog item 307).
 */
const openedPanels = new WeakSet<object>();

/**
 * Draws what a panel holds only once the panel has begun to open (`openedPanels`).
 *
 * Read off the panel element rather than off a key, because Lit hands a drawn panel to whichever
 * panel lands in its place, as it always has: an element that was open stays open for what it
 * holds now, and must draw it. A panel opens on a click, announcing `expanded-will-change` before
 * it measures what it holds (`_panelWillChange` marks it then, so the forms are there to be
 * measured), or because the editor binds its `expanded`, as a search does, which Lit sets before
 * it reaches this part.
 */
class WhenOpened extends Directive {
  render(content: () => unknown): unknown {
    return content();
  }

  override update(part: ChildPart, [content]: [() => unknown]): unknown {
    let panel = part.parentNode as (Node & { localName?: string; expanded?: boolean }) | null;
    while (panel && panel.localName !== 'ha-expansion-panel') panel = panel.parentNode;
    if (panel?.expanded) openedPanels.add(panel);
    return !panel || openedPanels.has(panel) ? content() : nothing;
  }
}

const whenOpened = directive(WhenOpened);

/**
 * A schema without one of its nodes, at any depth.
 *
 * @param schema - The schema
 * @param node - The node to leave out
 * @returns The rest
 */
function withoutNode(schema: ReadonlyArray<HaFormSchema>, node: HaFormSchema): HaFormSchema[] {
  return schema.flatMap((each) =>
    each === node
      ? []
      : 'schema' in each
        ? [{ ...each, schema: withoutNode(each.schema, node) } as HaFormSchema]
        : [each],
  );
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
 * One run of Quick Setup, from opening it to Apply or Cancel (backlog item 188).
 *
 * 🚨 A transaction, not a cursor. Every preview is rebuilt from `opening`, never from a config
 * Home Assistant echoed back, and `previews` holds every one dispatched, so that an echo of an
 * earlier preview arriving after a later one is still known for what it is. Cancel dispatches
 * `opening` and restores the authorship it was opened with.
 */
interface QuickSetupSession {
  /** The configuration as the YAML held it when Quick Setup opened. */
  readonly opening: Readonly<Record<string, unknown>>;
  readonly openingAuthoredRootKeys: ReadonlySet<string>;
  /** Everything the editor held as Quick Setup opened: the `before` of Apply's undo step. */
  readonly openingSnapshot: Snapshot;
  readonly step: QuickSetupStep;
  /** Unset until a story is picked; nothing is previewed before that. */
  readonly answers?: QuickSetup.QuickSetupAnswers;
  readonly previews: ReadonlyArray<Record<string, unknown>>;
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

/**
 * Schema-driven configuration editor for Calendar Card Pro.
 */
export class CalendarCardProEditor extends LitElement {
  static get styles() {
    return styles;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    awaitingConditionsEditor.delete(this);
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

  /** The YAML path of the line What This Card Changes is editing in place. */
  @state() private _auditEdit?: string;

  /** The field a search result opened, highlighted while `lit` (`_openResult`). */
  @state() private _jump?: {
    readonly target: Search.SearchTarget;
    readonly label: string;
    readonly lit: boolean;
  };

  /** The results a result on the overview left, which Return to Results and Escape restore. */
  @state() private _resultsLeft?: Navigation.TrailEntry;

  /** The jump list's count line, as the last render drew it, announced as the query changes. */
  private _resultStatus = '';

  /** The one polite live region's queue (`announce.ts`). */
  private _announcer = new Announcer();

  /** Undo and Redo's steps, for this session (`history.ts`). */
  private _history = new History();

  /** The line a removal or an applied story leaves, until the next change. */
  @state() private _status?: StatusLine;

  /**
   * The action strip open: a row's, `entry:<key>` or `calendar:<entity id>`, which travels with
   * the row through a move, or `page` for an entry page's ⋮.
   */
  @state() private _openStrip?: string;

  /** Add Calendar, while open, with the calendar chosen in its picker. */
  @state() private _adding?: { readonly chosen?: string };

  /** What Filter Calendars holds. */
  @state() private _calendarQuery = '';

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
   * A key per toolbar button, in the list's order, so each button keeps its own panel, open or
   * closed, through a move and through the removal of another.
   */
  private _buttonKeys: number[] = [];

  private _nextButtonKey = 0;

  /** The keys of the buttons Add Button created, whose panels open as they arrive. */
  private _addedButtons = new Set<number>();

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

    const session = this._quickSetup;
    // Home Assistant answers each write with its editor's current value, read after an await
    // (`_updateConfigElement` in its `hui-element-editor`), so echoes carry the newest preview.
    // Recognizing every preview costs nothing and holds for a host that echoes in send order.
    const isPreviewEcho =
      session !== undefined &&
      session.previews.some((preview) => Value.equalConfigs(rawConfig, preview));
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
    this._rawConfig = structuredClone(rawConfig);
    this._config = { ...Config.DEFAULT_CONFIG, ...config };

    if (!Array.isArray(this._config.entities)) {
      this._config.entities = [];
    }
    this._migration = this._migrationState(rawConfig);

    if (!isEcho) {
      // A configuration the editor did not send ends what Undo could reach.
      this._history.clear();
      this._status = undefined;
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
      this._config,
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
    this._rawConfig = structuredClone(result.config);
    this._config = {
      ...Config.DEFAULT_CONFIG,
      ...(result.config as unknown as Types.Config),
    };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
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
      this._lastDispatched = result.config;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: result.config } }));
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
    this._rawConfig = structuredClone(snapshot.raw) as Record<string, unknown>;
    this._config = {
      ...Config.DEFAULT_CONFIG,
      ...(structuredClone(snapshot.raw) as unknown as Types.Config),
    };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
    this._authoredRootKeys = new Set(snapshot.authoredRootKeys);
    this._gridResetKeys = new Set(snapshot.gridResetKeys);
    this._gridReconciliation = [...snapshot.gridReconciliation];
    this._pending = { ...snapshot.pending };
    this._migration = snapshot.migration;
    this._entryKeys = [...snapshot.entryKeys];
    this._buttonKeys = [...snapshot.buttonKeys];
    this._status = undefined;
    this._entryNotice = undefined;
    const config = structuredClone(snapshot.raw) as Record<string, unknown>;
    this._lastDispatched = config;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: structuredClone(config) } }),
    );
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
    const entry = way === 'undo' ? this._history.undo() : this._history.redo();
    if (entry === undefined) return;
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
   * button's panel, else the heading of the place shown, or the migration choice's title.
   *
   * @param focusKey - What the step's change was made with
   */
  private _focusRestored(focusKey: string | undefined): void {
    const root = this.renderRoot as ShadowRoot;
    const [kind, key] =
      focusKey === undefined
        ? []
        : [focusKey.slice(0, focusKey.indexOf(':')), focusKey.slice(focusKey.indexOf(':') + 1)];
    const target =
      kind === 'field'
        ? root.querySelector<HTMLElement>(`.field[data-field="${CSS.escape(key!)}"]`)
        : kind === 'entry'
          ? root.querySelector<HTMLElement>(Focus.byFocusKey(`row:${key}`))
          : kind === 'button'
            ? root.querySelector<HTMLElement>(
                `.button-panel[data-button-key="${CSS.escape(key!)}"]`,
              )
            : null;
    if (target) {
      // A panel's own header is the row's control; Home Assistant draws it as a button.
      const summary = target.shadowRoot?.querySelector<HTMLElement>('#summary');
      (summary ?? target).focus({ preventScroll: true });
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
    void this.updateComplete.then(() =>
      Focus.focusFirst(root, [
        status.kind === 'button' ? '.add-button' : '[data-heading="calendars"] .heading',
      ]),
    );
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
    void this.updateComplete.then(() =>
      Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('status-undo')]),
    );
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
    return this._ctxFor(this._config!, this._workspace, this.hass?.locale);
  }

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
      ? interpolate(this._string(ctx, 'search.yaml'), { path: this._yamlPath(field, ctx) })
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
        ? interpolate(this._string(ctx, 'history.change'), { setting })
        : interpolate(this._string(ctx, 'history.change_for'), { setting, name: owner });
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
   */
  private _writeFieldValue(owner: WriteFrames.WriteOwner, fieldId: FieldId, value: unknown): void {
    this._writeFieldValues(owner, { [fieldId]: value });
  }

  /**
   * Writes several fields of one owner as one change, in the order given (`_writeFieldValue`).
   * Writes nothing for an entry or a button that has left, or for a field it has none of.
   *
   * @param owner - Whose fields
   * @param values - New values, by field id
   */
  private _writeFieldValues(
    owner: WriteFrames.WriteOwner,
    values: Readonly<Record<FieldId, unknown>>,
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
      ctx.workspace ?? ctx.view,
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
    this._rawConfig = structuredClone(stored);
    this._config = { ...Config.DEFAULT_CONFIG, ...this._rawConfig };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];

    if (Value.equalConfigs(stored, this._lastDispatched ?? {})) {
      return;
    }

    this._lastDispatched = stored;

    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: stored } }));
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
    const label = interpolate(this._string(ctx, 'value.from_yaml'), { value: String(value) });
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
    const workspace = ctx.workspace ?? ctx.view;
    const slot = `field.${workspace}.${field.id}`;
    // The scope's data, which What This Card Changes draws a line's field in whatever the scope.
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const schema = this._intern(slot, this._yamlSchema(field, all, ctx));
    const data = this._intern(`${slot}.data`, Routing.formDataFor(all, schema));
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
          .data=${data}
          .schema=${schema}
          .computeLabel=${text.label}
          .computeHelper=${text.helper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._valueChanged(frame, event, field.labelPath, `field:${field.id}`)}
        ></ha-form>`,
      )}
      ${show?.line ?? nothing}
    </div>`;
    const jump = this._jump;
    return jump?.target.kind === 'field' && jump.target.id === field.id
      ? this._jumpTo(ctx, wrapper)
      : wrapper;
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
   * The field of one calendar entry or toolbar button a result opened, as its form builds it.
   *
   * @param kind - Whose field
   * @param key - The entry's or button's key
   * @param schema - Its form's fields
   * @returns The field, or `undefined` where no result opened one of this owner's
   */
  private _jumpField(
    kind: 'entry-field' | 'button-field',
    key: number,
    schema: ReadonlyArray<HaFormSchema>,
  ): IndexedField | undefined {
    if (!this._jumpsTo(kind, key)) return undefined;
    const index = kind === 'entry-field' ? entityFieldIndex(schema) : buttonFieldIndex(schema);
    return index.fields.get(this._jump!.target.id);
  }

  /**
   * A field of an entry or a button a result opened, drawn alone, in a wrapper named after it
   * that takes focus for it, as a card field's does.
   *
   * @param ctx - Schema context
   * @param forms - The forms
   * @returns The group
   */
  private _jumpToOwned(ctx: SchemaCtx, forms: unknown): TemplateResult {
    return this._jumpTo(
      ctx,
      html`<div class="field" tabindex="-1" role="group" aria-label=${this._jump!.label}>
        ${forms}
      </div>`,
    );
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
        text: interpolate(t('state.layout_own'), {
          layout: layout(own.view),
          value: word(own.value),
        }),
        button: {
          label: interpolate(t('state.edit_layout'), { layout: layout(own.view) }),
          name: interpolate(t('state.edit_named'), { label, layout: layout(own.view) }),
          focus: `edit:${field.id}:${own.view}`,
          onPress: () => this._pickScope(own.view),
        },
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
      actions.push({
        label: interpolate(t('state.edit_layout'), { layout: layout('shared') }),
        name: interpolate(t('state.edit_named'), { label, layout: layout('shared') }),
        focus: `edit:${field.id}:shared`,
        onPress: () => this._pickScope('shared'),
      });
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
              ? interpolate(t('reset.reset_for'), { label, layout: forLayout })
              : interpolate(t('value_source.reset'), { option: label })
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
      const live = plan.live.flatMap(({ id, appearance }) => {
        const field = present.get(id);
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
      for (const each of plan.gated) {
        const clause = when(each.gate);
        const line = byWhen.get(clause) ?? { names: [], held: 0 };
        line.names.push(labelOf(each.id));
        byWhen.set(clause, line);
      }
      for (const each of plan.inactive) {
        if (each.gate.kind !== 'gate') continue;
        const clause = when(each.gate);
        const line = byWhen.get(clause) ?? { names: [], held: 0 };
        line.held += 1;
        byWhen.set(clause, line);
      }
      const gateLines = [...byWhen].map(([clause, line]) =>
        line.names.length > 0
          ? interpolate(t('gate.line'), { when: clause, names: line.names.join(', ') })
          : interpolate(t('gate.line_bare'), { when: clause }),
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
              ? {
                  label: interpolate(t('state.edit_layout'), {
                    layout: this._layoutName(ctx)('shared'),
                  }),
                  name: interpolate(t('state.edit_named'), {
                    label,
                    layout: this._layoutName(ctx)('shared'),
                  }),
                  focus: `edit:${field.id}:shared`,
                  onPress: () => this._pickScope('shared'),
                }
              : {
                  label: t('reset.reset'),
                  name: interpolate(t('value_source.reset'), { option: label }),
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
                  name: interpolate(t('reset.remove_named'), {
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
        ? interpolate(this._string(ctx, 'announce.showing_all'), { heading: heading ?? '' })
        : interpolate(this._string(ctx, 'announce.added'), { label }),
    );
    void this.updateComplete.then(() =>
      Focus.focusFirst(this.renderRoot, [`[data-field="${CSS.escape(focusId)}"]`]),
    );
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
      interpolate(this._string(ctx, 'history.reset'), { setting: label }),
      undefined,
      () => this._applyReset(target, [this._addedKey(field.id, owner)]),
      `field:${field.id}`,
    );
    if (action === 'remove') {
      this._say(interpolate(this._string(ctx, 'announce.removed_setting'), { label }));
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
    this._commit(
      interpolate(this._string(ctx, 'history.reset'), { setting: name }),
      undefined,
      () => this._applyReset(target, []),
    );
    this._say(interpolate(this._string(ctx, 'announce.removed_setting'), { label: name }));
    this._focusAfterReset(undefined, heading);
  }

  /**
   * Applies a reset to everything the editor holds about the configuration, together, and
   * reports it: the YAML, the authored root keys, the Grid reset keys and the held text, as
   * `reset.ts` hands them back, and the added set without what the reset retires.
   *
   * @param target - What to reset
   * @param retire - Added-set keys to retire besides the reset's own
   */
  private _applyReset(target: Reset.ResetTarget, retire: ReadonlyArray<string>): void {
    if (!this._config || !this._prepareForWrite()) return;
    const { state, clearAdded } = Reset.reset(this._writeState(), target);
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
    void this.updateComplete.then(() => {
      const group = `.page-group[data-heading="${CSS.escape(heading ?? '')}"]`;
      Focus.focusFirst(this.renderRoot, [
        ...(id === undefined ? [] : [`[data-field="${CSS.escape(id)}"]`]),
        `${group} .add-toggle`,
        `${group} .heading`,
        '.page-title',
        // On the overview, which has no page headings: its own fields, then its first heading.
        '.overview [data-field]',
        '.overview .heading',
      ]);
    });
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
      label: interpolate(this._string(ctx, 'nav.crumb'), {
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
  private _t(ctx: SchemaCtx): Overview.Translate {
    return this._keep('translate', ctx.language, () => (key: string) => this._string(ctx, key));
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

  /** Closes the strip and Add Calendar, which belong to the place being left. */
  private _closeDisclosures(): void {
    this._auditEdit = undefined;
    this._openStrip = undefined;
    this._adding = undefined;
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
   */
  private _openResult(
    hit: Pick<Search.SearchEntry, 'target' | 'label'>,
    focusKey: string,
    search = true,
  ): void {
    const target = hit.target;
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
      search: search ? { query: this._filter.query, editHere: false } : undefined,
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
    const jump = { target, label: hit.label, lit: true };
    this._jump = jump;
    void this.updateComplete.then(() => {
      const field = this.renderRoot.querySelector<HTMLElement>('.jump');
      if (field) Focus.scrollToTopSettled(this, field);
      Focus.focusFirst(field ?? this.renderRoot, ['[tabindex="-1"]', '.page-title']);
      this._say(interpolate(this._string(this._ctx, 'search.showing'), { label: hit.label }));
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
    const action = escapeAction(event.composedPath(), this, {
      disclosure:
        wizard === undefined &&
        (this._scopeOpen ||
          this._auditEdit !== undefined ||
          this._openStrip !== undefined ||
          this._adding !== undefined ||
          this._addOpen !== undefined),
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
        void this.updateComplete.then(() =>
          Focus.focusFirst(this.renderRoot, ['[data-quick-setup-back]', '[data-quick-setup-next]']),
        );
      } else {
        this._cancelQuickSetup();
        void this.updateComplete.then(() =>
          Focus.focusFirst(this.renderRoot, [
            '[data-focus="quick-setup"]',
            '[data-quick-setup-open]',
          ]),
        );
      }
    } else if (action === 'close') {
      // The disclosure opened last closes, focus back on what opened it.
      const strip = this._openStrip;
      const addRow = this._addOpen?.key;
      const edited = this._auditEdit;
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
      void this.updateComplete.then(() =>
        Focus.focusFirst(this.renderRoot, [Focus.byFocusKey(opener)]),
      );
    } else if (action === 'back') {
      this._back();
    } else if (action === 'clear') {
      this._filter = { ...this._filter, query: '' };
      this._jump = undefined;
      void this.updateComplete.then(() =>
        Focus.focusFirst(this.renderRoot, ['ha-form.filter-form']),
      );
    }
  };

  /**
   * Alt+ArrowUp and Alt+ArrowDown move the calendar of a focused row, or of the entry page open
   * where it is its calendar's only entry: wherever the editor's own controls carry
   * `data-move-calendar`, never inside a field's form or a text field.
   *
   * @param event - A `keydown`
   * @returns Whether it moved a calendar, the key then taken
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
        each instanceof HTMLElement && each.dataset.moveCalendar !== undefined,
    );
    if (mover === undefined) return false;
    event.preventDefault();
    event.stopPropagation();
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
    void this.updateComplete.then(() =>
      Focus.focusFirst(this.renderRoot, [`input[name="scope"]:checked`, `input[name="scope"]`]),
    );
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
      interpolate(this._string(ctx, 'announce.scope'), {
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
          interpolate(this._string(ctx, 'history.change'), { setting: this._string(ctx, 'view') }),
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
   * Words a value a field cannot word itself, for a section row's summary: an action by Home
   * Assistant's name for it, an entity by its name.
   *
   * @param field - The field
   * @param value - Its value
   * @returns The words, or `undefined` to leave the pair out
   */
  private _describe = (field: Pick<IndexedField, 'node'>, value: unknown): string | undefined => {
    const selector = field.node.selector;
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
    const { present, shown } = this._drawing!;
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
      ${this._renderOverviewBody(ctx, chassis, present, shown)}
    </div>`;
  }

  /**
   * What the overview draws below its filter bar: what a query finds, or Settings For,
   * Calendars, Card Displays, the overview's own fields, a row per section page and More.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @param present - The fields built here
   * @param shown - The ids search reaches
   * @returns The body
   */
  private _renderOverviewBody(
    ctx: SchemaCtx,
    chassis: Subforms.ChassisSchemas,
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
  ): TemplateResult {
    const t = this._t(ctx);
    if (Filter.hasQuery(this._filter) && this._resultsLeft === undefined) {
      return html`${this._renderScope(ctx)} ${this._renderResults(ctx, present, shown)}`;
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
   * What a query finds, as the jump list: the count, the scope its values are for, and a row per
   * field, which opens the field where it is drawn.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @param shown - The ids search reaches
   * @returns The results, or the line saying nothing matches
   */
  private _renderResults(
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
  ): TemplateResult {
    const query = this._filter.query.trim();
    const owners = (forms: ReadonlyArray<Search.SearchOwner>) =>
      forms.filter(({ schema }) => Filter.hasFields(schema));
    const calendars = PANELS.find((panel) => panel.id === 'calendars')!;
    const entries = calendars
      .subforms?.(ctx)
      ?.find((subform) => subform.path.join('.') === ENTITY_PATH.join('.'));
    const card = PANELS.find((panel) => panel.id === 'card')!;
    const buttons = card
      .subforms?.(ctx)
      ?.find((subform) => subform.path.join('.') === TOOLBAR_BUTTON_PATH.join('.'));
    const index = Search.buildSearchIndex({
      ...ctx,
      hass: this.hass,
      present,
      shown,
      data: this._formData(),
      entries: entries ? owners(this._entrySchemas(entries, ctx)) : [],
      buttons:
        buttons && Config.resolveToolbar(ctx.config).show
          ? owners(this._buttonSchemas(buttons))
          : [],
      t: this._t(ctx),
      describe: this._describe,
    });
    const hits = Search.search(index, query);
    this._resultStatus = interpolate(this._string(ctx, 'search.results'), {
      query,
      count: String(hits.length),
    });
    if (hits.length === 0) return this._renderNoMatches(ctx);
    const workspace = ctx.workspace ?? ctx.view;
    const rows = hits.map(({ entry }): SearchView.ResultRow => {
      const { target } = entry;
      const key = `result:${target.id}${target.kind === 'field' ? '' : `:${target.key}`}`;
      return {
        key,
        label: entry.label,
        marks: Search.highlight(entry.label, query),
        crumbs: entry.crumbs,
        value: entry.value,
        yaml: interpolate(this._string(ctx, 'search.yaml'), { path: entry.yamlPath }),
        onOpen: () => this._openResult(entry, key),
      };
    });
    return SearchView.resultList(
      this._resultStatus,
      workspace === 'shared'
        ? undefined
        : interpolate(this._string(ctx, 'search.values_for'), {
            layout: this._string(ctx, `editing_workspace.option.${workspace}.label`),
          }),
      rows,
    );
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
        heading.extras?.includes('own-buttons')
          ? this._renderToolbarButtons(
              PANELS.find((panel) => panel.id === 'card')!,
              ctx,
            )
          : nothing,
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
          ? interpolate(t('other_layouts.one'), {
              layout: layout(line.views[0]),
              names: Shown.namesText(names, t),
            })
          : interpolate(t('other_layouts.many'), {
              layouts: EditorLocalize.formatList(
                ctx.language,
                line.views.map(layout),
                'conjunction',
              ),
              names: Shown.namesText(names, t),
            });
      parts.push(
        ShownView.otherLayoutsLine(
          text,
          interpolate(t('add.count'), { count: String(names.length) }),
          {
            label: interpolate(t('state.edit_layout'), { layout: layout(target) }),
            focus: `edit-layout:${line.views.join('-')}`,
            onPress: () => this._pickScope(target),
          },
        ),
      );
    }
    return parts;
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
    return PANELS.find((panel) => panel.id === 'calendars')!.subforms!(ctx).find(
      (candidate) => candidate.path.join('.') === ENTITY_PATH.join('.'),
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
      if (typeof value === 'string' && value.trim() !== '' && !isEntityColorSentinel(value)) {
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
          name: interpolate(this._string(ctx, 'strip.move_up'), { name }),
          keys: onPage ? this._string(ctx, 'strip.key_up') : undefined,
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, place - 1, `${focus}up`),
        },
        {
          id: 'down',
          label: this._string(ctx, 'toolbar.buttons.move_down'),
          name: interpolate(this._string(ctx, 'strip.move_down'), { name }),
          keys: onPage ? this._string(ctx, 'strip.key_down') : undefined,
          disabled: last,
          onPress: () => this._moveCalendar(entityId, place + 1, `${focus}down`),
        },
        {
          id: 'top',
          label: this._string(ctx, 'strip.move_top_label'),
          name: interpolate(this._string(ctx, 'strip.move_top'), { name }),
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, 0, `${focus}top`),
        },
      );
    }
    if (entryKey === undefined) {
      actions.push({
        id: 'remove',
        label: this._string(ctx, 'entity.remove'),
        name: interpolate(this._string(ctx, 'strip.remove_calendar'), {
          name,
          count: String(total),
        }),
        danger: true,
        onPress: () => this._removeCalendar(entityId),
      });
      return actions;
    }
    const entry = this._entryOf(entryKey)!;
    const entryName = this._entryName(entryKey);
    const from = Entities.copiedFrom();
    const copied = Entities.copiedSettings() !== undefined;
    actions.push(
      {
        id: 'duplicate',
        label: this._string(ctx, 'entity.duplicate'),
        name: interpolate(this._string(ctx, 'strip.duplicate'), { name: entryName }),
        onPress: () => this._duplicateEntry(entryKey),
      },
      {
        id: 'copy',
        label: this._string(ctx, 'entity.copy'),
        name: interpolate(this._string(ctx, 'strip.copy'), { name: entryName }),
        disabled: !Entities.hasTransferableSettings(entry),
        onPress: () => this._copyEntry(entryKey),
      },
      {
        id: 'paste',
        label: this._string(ctx, 'entity.paste'),
        name: interpolate(this._string(ctx, 'strip.paste'), { name: entryName }),
        note: !copied
          ? this._string(ctx, 'strip.paste_empty')
          : from === undefined
            ? undefined
            : interpolate(this._string(ctx, 'strip.paste_from'), { name: from }),
        disabled: !copied,
        onPress: () => this._pasteEntry(entryKey),
      },
      {
        id: 'remove',
        label:
          total > 1 ? this._string(ctx, 'strip.remove_entry') : this._string(ctx, 'entity.remove'),
        name: interpolate(this._string(ctx, 'strip.remove'), { name: entryName }),
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
    const label = interpolate(this._string(ctx, 'calendars.actions'), { name });
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
    // Folded as search folds a query: case and surrounding space ignored (`search.ts`).
    const query = this._calendarQuery.trim().toLowerCase();
    const matches = (texts: ReadonlyArray<unknown>): boolean =>
      texts.some((text) => typeof text === 'string' && text.toLowerCase().includes(query));
    const set = (entry: string | Types.EntityConfig) =>
      interpolate(this._string(ctx, 'summary.set'), {
        count: String(CalendarList.setCount(entry)),
      });
    return CalendarList.groups(state).flatMap((calendar) => {
      const name = this._calendarName(calendar.entityId);
      const grouped = calendar.rows.length > 1;
      const missing = this._missing(calendar.entityId);
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
        const position = interpolate(this._string(ctx, 'calendars.position'), {
          position: String(row.position),
          total: String(row.total),
        });
        const described = grouped
          ? [name, ...parts, set(entry), position]
          : [name, ...parts, set(entry)];
        return [
          {
            key: row.key,
            title: grouped ? parts.join(Summary.SUMMARY_SEPARATOR) : name,
            summary: grouped ? set(entry) : [...parts, set(entry)].join(Summary.SUMMARY_SEPARATOR),
            editName: interpolate(this._string(ctx, 'calendars.edit'), {
              row: described.join(', '),
            }),
            color: this._rowColor(entry),
            badge:
              Entities.labelTypeOf(entry) === 'text' && typeof label === 'string' && label !== ''
                ? label
                : undefined,
            missing,
            moves: grouped ? undefined : calendar.entityId,
            more,
            strip,
            onOpen: () => this._open({ kind: 'entry', key: row.key }, `row:${row.key}`),
          },
        ];
      });
      if (rows.length === 0) return [];
      const head = grouped
        ? {
            name,
            count: interpolate(this._string(ctx, 'calendars.entries'), {
              count: String(calendar.rows.length),
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
      return [{ entityId: calendar.entityId, head, rows }];
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
      ${list} ${this._renderAddCalendar(ctx)}
    </section>`;
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
            void this.updateComplete.then(() =>
              Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('add-picker')]),
            );
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
            line: interpolate(this._string(ctx, 'calendars.already'), {
              name: this._calendarName(chosen),
            }),
            open: {
              label: interpolate(this._string(ctx, 'calendars.open'), {
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
    void this.updateComplete.then(() =>
      Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('add-calendar')]),
    );
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
    this._say(
      interpolate(this._string(this._ctx, 'calendars.chose'), { name: this._calendarName(chosen) }),
    );
    void this.updateComplete.then(() =>
      // Open where the calendar is already on the card, and Add is off.
      Focus.focusFirst(this.renderRoot, [
        Focus.byFocusKey('add-open'),
        Focus.byFocusKey('add-confirm'),
      ]),
    );
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
      interpolate(this._string(this._ctx, 'history.add'), { name }),
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
   * says where it went. Focus stays on the control that moved it, else on the row.
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
      interpolate(this._string(this._ctx, 'history.move'), { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        this._writeList(CalendarList.moveCalendar(this._listState(), entityId, to));
      },
      `entry:${first}`,
    );
    if (!moved) return;
    this._say(
      interpolate(this._string(this._ctx, 'announce.moved'), {
        name,
        position: String(to + 1),
        total: String(calendars.length),
      }),
    );
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const target =
        focusKey === undefined
          ? undefined
          : root.querySelector<HTMLButtonElement>(Focus.byFocusKey(focusKey));
      if (target && !target.disabled) target.focus({ preventScroll: true });
      else {
        // The row on the overview; on an entry page, the menu the move was made from.
        Focus.focusFirst(root, [
          Focus.byFocusKey(`row:${first}`),
          Focus.byFocusKey(`more:calendar:${entityId}`),
          Focus.byFocusKey('more:page'),
        ]);
      }
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
      interpolate(this._string(this._ctx, 'history.paste'), { name }),
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
    if (pasted) this._say(interpolate(this._string(this._ctx, 'announce.pasted'), { name }));
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
      interpolate(this._string(this._ctx, 'history.duplicate'), { name }),
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
    this._say(interpolate(this._string(ctx, 'entry.duplicated'), { name }));
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
      interpolate(this._string(ctx, 'history.remove'), { name }),
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
      interpolate(this._string(ctx, 'status.removed'), { name }),
      at,
      interpolate(this._string(ctx, 'announce.removed'), { name }),
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
      interpolate(this._string(ctx, 'history.remove'), { name }),
      undefined,
      () => {
        if (!this._prepareForWrite()) return;
        this._writeList(CalendarList.removeCalendar(this._listState(), entityId));
      },
      `entry:${calendar.rows[0].key}`,
    );
    if (!removed) return;
    this._afterRemove(
      interpolate(this._string(ctx, 'status.removed_calendar'), {
        name,
        count: String(calendar.rows.length),
      }),
      at,
      interpolate(this._string(ctx, 'announce.removed'), { name }),
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
      interpolate(this._string(ctx, 'history.change_for'), {
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
    this._say(
      interpolate(this._string(this._ctx, 'entry.showing'), { name: this._entryName(key) }),
    );
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
    const slot = `entry.${key}.${field.id}`;
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
      ${show?.line ?? nothing}
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
    const actionsName = interpolate(this._string(ctx, 'calendars.actions'), {
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
      : `${entityId}${Summary.SUMMARY_SEPARATOR}${interpolate(
          this._string(ctx, 'entity.occurrence'),
          { position: String(row.position), total: String(row.total) },
        )}`;
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
      () => nothing,
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
      ${this._renderScope(ctx)}
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
              ? interpolate(this._string(ctx, 'entry.remove'), { name })
              : this._string(ctx, 'strip.remove_entry'),
            focus: 'entry-remove',
            name: interpolate(this._string(ctx, 'strip.remove'), { name: this._entryName(key) }),
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
      interpolate(this._string(ctx, 'history.change_for'), {
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
   * Renders the toolbar's own buttons, under the heading Card & Header draws for them: a
   * collapsible form per button headed by its name, and Add Button after the last.
   *
   * Only while the toolbar is shown, as the card draws the buttons only then. The list is read
   * as written, so an entry the card cannot draw yet, such as one whose icon was just cleared,
   * stays here to be finished. Add Button is withheld while the editor is filtered, where the
   * button it adds could arrive hidden.
   *
   * @param panel - Panel being rendered
   * @param ctx - Schema context
   * @returns The buttons, or nothing for every other panel and while the toolbar is hidden
   */
  private _renderToolbarButtons(panel: PanelDef, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const subform = panel
      .subforms?.(ctx)
      ?.find((candidate) => candidate.path.join('.') === TOOLBAR_BUTTON_PATH.join('.'));
    if (subform === undefined || !Config.resolveToolbar(ctx.config).show) return nothing;

    const written = Buttons.writtenButtons(this._config!);
    const shown = this._buttonSchemas(subform);
    this._drawn?.push(...shown.map(({ schema, data }) => [schema, data] as const));

    const computeLabel = this._labeler(ctx.language, subform.path);
    const computeHelper = this._subformHelper(ctx, subform.path, false);
    const workspace = ctx.workspace ?? ctx.view;

    const untitled = this._string(ctx, 'toolbar.buttons.untitled');

    return html`
      ${repeat(
        shown,
        ({ key }) => key,
        ({ entry, index, key, schema, data: values }) => html`
          <ha-expansion-panel
            outlined
            class="button-panel"
            data-button-key=${key}
            .header=${Buttons.buttonTitle(entry, index, untitled)}
            .leftChevron=${false}
            .expanded=${this._addedButtons.has(key) || this._jumpsTo('button-field', key)}
          >
            <span slot="leading-icon" class="leading-icon">${icon(TOOLBAR_BUTTON_ICON)}</span>
            <div class="panel-body">
              <div class="button-actions">
                <div class="button-actions-safe">
                  <button
                    type="button"
                    class="text-button"
                    data-move="up"
                    ?disabled=${index === 0}
                    @click=${() => this._moveButton(index, -1)}
                  >
                    ${this._string(ctx, 'toolbar.buttons.move_up')}
                  </button>
                  <button
                    type="button"
                    class="text-button"
                    data-move="down"
                    ?disabled=${index === written.length - 1}
                    @click=${() => this._moveButton(index, 1)}
                  >
                    ${this._string(ctx, 'toolbar.buttons.move_down')}
                  </button>
                </div>
                <button
                  type="button"
                  class="text-button destructive"
                  @click=${() => this._removeButton(index)}
                >
                  ${this._string(ctx, 'toolbar.buttons.remove')}
                </button>
              </div>
              ${whenOpened(() => {
                const slot = `button.${key}`;
                const data = this._intern(`${slot}.data`, values);
                // The field a result opened, drawn alone above the rest.
                const lifted = this._jumpField('button-field', key, schema);
                const form = (part: ReadonlyArray<HaFormSchema>, name: string) => {
                  const kept = this._intern(`${slot}${name}`, part);
                  const [hass, feed] = this._feed(kept, ctx.language);
                  const frame: WriteFrames.OwnedFrame = {
                    owner: { kind: 'button', key },
                    workspace,
                    schema: kept,
                    data,
                  };
                  return html`
                    <ha-form
                      class="button-form"
                      data-hass=${feed}
                      .hass=${hass}
                      .data=${data}
                      .schema=${kept}
                      .computeLabel=${computeLabel}
                      .computeHelper=${computeHelper}
                      .localizeValue=${this._localizeValue}
                      @value-changed=${(event: CustomEvent) =>
                        this._valueChanged(
                          frame,
                          event,
                          subform.path,
                          `button:${key}`,
                          Buttons.buttonTitle(entry, index, untitled),
                        )}
                    ></ha-form>
                  `;
                };
                return lifted
                  ? html`${this._jumpToOwned(ctx, form(lifted.lifted, '.jump'))}
                    ${form(withoutNode(schema, lifted.node), '')}`
                  : form(schema, '');
              })}
            </div>
          </ha-expansion-panel>
        `,
      )}
      ${this._renderStatus(ctx, ['button'])}
      <button type="button" class="text-button add-button" @click=${this._addButton}>
        ${this._string(ctx, 'toolbar.buttons.add')}
      </button>
    `;
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
      this._addedButtons.clear();
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
   * Moves one button a place toward the start or the end, its panel with it.
   *
   * Focus stays on the control that moved it, or passes to its other move control once the
   * button reaches an end, so a keyboard can keep moving it.
   *
   * @param index - Position of the button in the list
   * @param by - `-1` toward the start, `1` toward the end
   */
  private _moveButton(index: number, by: -1 | 1): void {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const to = index + by;
    if (to < 0 || to >= written.length) return;

    const keys = this._buttonKeysFor(written.length);
    const name = Buttons.buttonTitle(
      written[index],
      index,
      this._string(this._ctx, 'toolbar.buttons.untitled'),
    );
    this._commit(
      interpolate(this._string(this._ctx, 'history.move'), { name }),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.moveButton(written, index, by))) return;
        [keys[index], keys[to]] = [keys[to], keys[index]];

        const moved = keys[to];
        void this.updateComplete.then(() => this._focusMoveControl(moved, by));
      },
      `button:${keys[index]}`,
    );
  }

  /**
   * Returns focus to a moved button's move controls, where the move took it away.
   *
   * @param key - The moved button's key
   * @param by - The way it moved
   */
  private _focusMoveControl(key: number, by: -1 | 1): void {
    const active = (this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement | null;
    if (active !== null && !active.disabled) return;

    const panel = this.renderRoot.querySelector(`.button-panel[data-button-key="${key}"]`);
    const same = panel?.querySelector<HTMLButtonElement>(`[data-move="${by < 0 ? 'up' : 'down'}"]`);
    const other = panel?.querySelector<HTMLButtonElement>(
      `[data-move="${by < 0 ? 'down' : 'up'}"]`,
    );
    (same && !same.disabled ? same : other)?.focus();
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
      interpolate(this._string(ctx, 'history.remove'), { name }),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.removeButton(written, index))) return;

        const [removed] = keys.splice(index, 1);
        this._addedButtons.delete(removed);
        this._showStatus(
          {
            kind: 'button',
            text: interpolate(this._string(ctx, 'status.removed'), { name }),
            at: index,
          },
          interpolate(this._string(ctx, 'announce.removed'), { name }),
        );
      },
      `button:${keys[index]}`,
    );
  }

  /**
   * Adds a button after the last, and opens its panel to be filled in.
   */
  private _addButton = (): void => {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const keys = this._buttonKeysFor(written.length);
    const key = this._nextButtonKey++;
    this._commit(
      this._string(this._ctx, 'toolbar.buttons.add'),
      undefined,
      () => {
        if (!this._writeButtons(Buttons.addButton(written))) return;

        keys.push(key);
        this._addedButtons.add(key);
      },
      `button:${key}`,
    );
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
   * @returns The string, humanized as a last resort
   */
  private _string(ctx: SchemaCtx, key: string): string {
    return EditorLocalize.lookup(ctx.language, key) ?? EditorLocalize.humanize(key);
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
        interpolate(this._string(ctx, 'config_migration.future_message'), {
          version: this._migration.version,
        }),
      );
    }
    if (this._migration.kind === 'invalid') {
      return this._renderMigrationBlock(
        ctx,
        'config_migration.invalid_title',
        interpolate(this._string(ctx, 'config_migration.invalid_message'), {
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
    const calendars = PANELS.find((panel) => panel.id === 'calendars')!;
    const entries = calendars
      .subforms?.(ctx)
      ?.find((subform) => subform.path.join('.') === ENTITY_PATH.join('.'));
    if (entries !== undefined) {
      // Every entry's page's forms, wherever the editor is: a form per placed field, as
      // `_renderEntryPage` draws them, but `visibility` where Home Assistant's Visibility editor
      // holds the conditions instead.
      const all = this._config!.entities ?? [];
      const conditionsEditor = conditionsEditorDefined();
      for (const { entry, key, schema } of this._entrySchemas(entries, ctx)) {
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
    }
    const card = PANELS.find((panel) => panel.id === 'card')!;
    const buttons = card
      .subforms?.(ctx)
      ?.find((subform) => subform.path.join('.') === TOOLBAR_BUTTON_PATH.join('.'));
    if (buttons !== undefined && Config.resolveToolbar(ctx.config).show) {
      for (const { schema, data: values } of this._buttonSchemas(buttons)) {
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
      <div
        class="card-config"
        @expanded-will-change=${this._panelWillChange}
        @keydown=${this._onKeydown}
      >
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
   * Marks a panel as opening, so that the render this asks for mounts its forms
   * (`whenOpened`). Home Assistant's panel announces `expanded-will-change` on a click, then
   * waits a render before it measures what it holds and announces `expanded-changed`
   * (`_toggleContainer` in its frontend): forms mounted on `expanded-changed` would arrive
   * after the measuring, and the panel would open to the height of an empty one.
   *
   * @param event - An `expanded-will-change` from any panel under the editor
   */
  private _panelWillChange = (event: Event): void => {
    const panel = event.target as Element;
    if (
      panel.localName !== 'ha-expansion-panel' ||
      (event as CustomEvent<{ expanded?: boolean }>).detail?.expanded !== true ||
      openedPanels.has(panel)
    ) {
      return;
    }
    openedPanels.add(panel);
    this.requestUpdate();
  };

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
          <div>${interpolate(this._string(ctx, 'config_migration.affected'), { options })}</div>
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
        <div>${interpolate(this._string(ctx, 'grid_reconciliation.message'), { options })}</div>
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
            ${interpolate(this._string(ctx, 'quick_setup.step'), {
              step: String(index + 1),
              steps: String(QUICK_SETUP_STEPS.length),
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
          ${interpolate(this._string(ctx, 'quick_setup.review_story'), {
            story: this._string(ctx, `quick_setup.story.${answers.story}`),
          })}
        </li>
        <li>
          ${interpolate(this._string(ctx, 'quick_setup.review_calendars'), {
            calendars: list(answers.calendars.map(name)),
          })}
        </li>
        ${
          colored.length > 0
            ? html`<li>
                ${interpolate(this._string(ctx, 'quick_setup.review_colors'), {
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
    const shown = session.previews[session.previews.length - 1] ?? session.opening;
    const changed = !Value.equalConfigs(preview, shown);
    this._quickSetup = {
      ...session,
      answers,
      previews: changed ? [...session.previews, preview] : session.previews,
    };
    if (!changed) return;

    this._lastDispatched = preview;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: preview } }));
  }

  /** Closes Quick Setup and puts the card back exactly as it was when Quick Setup opened. */
  private _cancelQuickSetup = (): void => {
    const session = this._quickSetup;
    if (session === undefined) return;
    this._quickSetup = undefined;
    if (session.previews.length === 0) return;

    const opening = structuredClone(session.opening) as Record<string, unknown>;
    this._carryEntryKeys(Array.isArray(opening.entities) ? opening.entities : []);
    this._rawConfig = structuredClone(opening);
    this._config = { ...Config.DEFAULT_CONFIG, ...(opening as unknown as Types.Config) };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
    this._authoredRootKeys = new Set(session.openingAuthoredRootKeys);
    this._migration = this._migrationState(opening);
    this._lastDispatched = opening;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: opening } }));
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
      interpolate(this._string(ctx, 'history.apply'), { story }),
      undefined,
      () => this._applyStory(session),
      undefined,
      session.openingSnapshot,
    );
    // An Apply that changed nothing is no step, and its line would offer to undo another.
    if (!applied) return;
    this._showStatus(
      { kind: 'story', text: interpolate(this._string(ctx, 'status.applied'), { story }), at: 0 },
      interpolate(this._string(ctx, 'announce.applied'), { story }),
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
    this._rawConfig = structuredClone(stored);
    this._config = { ...Config.DEFAULT_CONFIG, ...(stored as unknown as Types.Config) };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
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
                        ${interpolate(this._string(ctx, 'misplaced.move'), {
                          place: placeName(to),
                        })}
                      </button>`
                    : html`<span class="misplaced-taken"
                        >${interpolate(this._string(ctx, 'misplaced.taken'), {
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
      .map(([words, count]) => interpolate(words, { count: String(count) }))
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
                    <span>${interpolate(t('notices.replaced'), { label })}</span>
                    ${
                      Deprecated.canMove(raw, option)
                        ? html`<button
                            type="button"
                            class="text-button"
                            @click=${() => this._moveOld(option)}
                          >
                            ${interpolate(t('misplaced.move'), { place: label })}
                          </button>`
                        : html`<span class="misplaced-taken"
                            >${interpolate(t('misplaced.taken'), { place: label })}</span
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
  private _auditSummary(t: Overview.Translate): string {
    const { set, inactive } = Audit.auditCounts(this._auditGroups());
    return [
      interpolate(t('summary.set'), { count: String(set) }),
      ...(inactive > 0 ? [interpolate(t('audit.not_in_use'), { count: String(inactive) })] : []),
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
    const groups = this._auditGroups();
    const view = (group: Audit.AuditGroup): TemplateResult => {
      const count = interpolate(t('summary.set'), { count: String(group.lines.length) });
      const rows = group.lines.map((line) => this._auditRow(line, group, ctx));
      const key = group.key ?? 0;
      const name = this._entryName(key);
      const where = layout(group.workspace);
      const blockKey = ViewConfig.viewBlockFor(group.workspace as Types.EffectiveView)?.blockKey;
      return group.kind === 'entry'
        ? AuditView.auditGroup({
            key: `audit:entry:${key}`,
            title: name,
            count,
            sub: true,
            action: {
              label: interpolate(t('audit.go_to'), { name }),
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
              group.kind === 'layout' && blockKey
                ? {
                    label: interpolate(t('audit.reset_all'), { layout: where }),
                    focus: `reset-all:${group.workspace}`,
                    onPress: () => {
                      this._commit(
                        interpolate(t('audit.reset_all'), { layout: where }),
                        undefined,
                        () =>
                          this._applyReset(
                            {
                              kind: 'block',
                              blockKey: blockKey as 'list' | 'column' | 'time_grid',
                            },
                            [],
                          ),
                      );
                      this._say(interpolate(t('audit.reset_all_done'), { layout: where }));
                      void this.updateComplete.then(() =>
                        Focus.focusFirst(this.renderRoot, ['.page-title']),
                      );
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
      const reset = interpolate(t('value_source.reset'), { option: label });
      return AuditView.auditRow({
        path: line.text,
        label,
        value:
          key === 'view' ? layout(line.value as Types.EffectiveView) : Audit.plainValue(line.value),
        words: t('state.set_all_layouts'),
        tags: [],
        reset: {
          name: reset,
          title: t('reset.reset'),
          focus: `audit-reset:${line.text}`,
          onPress: () =>
            this._commit(interpolate(t('history.reset'), { setting: label }), undefined, () =>
              this._applyReset({ kind: 'path', path: line.path }, []),
            ),
        },
        go: {
          name: interpolate(t('audit.go_to'), { name: label }),
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
    const wctx =
      entry === undefined ? this._ctxFor(this._config!, group.workspace, this.hass?.locale) : ctx;
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
        ? interpolate(t('audit.on_calendar'), { label, name: this._entryName(entry) })
        : group.kind === 'layout'
          ? interpolate(t('audit.in_layout'), { label, layout: layout(group.workspace) })
          : label;
    const value = Audit.outsideOptions(field.node, line.value)
      ? interpolate(t('value.from_yaml'), { value: String(line.value) })
      : this._wordOf(field, ctx)(line.value);
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
    const editing = this._auditEdit === line.text;
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
        ? interpolate(t('audit.inactive'), {
            when: whenText(line.inactive.gate, data, ctx.language, labelOf) ?? '',
          })
        : undefined,
      edit: {
        name: interpolate(t('audit.edit'), { label: named, value }),
        onPress: () => {
          this._auditEdit = line.text;
          void this.updateComplete.then(() =>
            Focus.focusFirst(this.renderRoot, [
              `[data-audit="${CSS.escape(line.text)}"] [data-field]`,
            ]),
          );
        },
      },
      editing: editing
        ? entry === undefined
          ? this._renderField(field, wctx)
          : this._renderEntryField(field, entry, entryData!, ctx)
        : undefined,
      reset: {
        name: interpolate(t('value_source.reset'), { option: named }),
        title: t('reset.reset'),
        focus: `audit-reset:${line.text}`,
        onPress: () => {
          this._commit(interpolate(t('history.reset'), { setting: named }), undefined, () =>
            this._applyReset(
              entry === undefined
                ? { kind: 'path', path: line.path }
                : { kind: 'entry', key: entry, keys: [key] },
              [],
            ),
          );
          void this.updateComplete.then(() =>
            Focus.focusFirst(this.renderRoot, [
              `[data-heading="${CSS.escape(`audit:${entry === undefined ? (group.kind === 'layout' ? group.workspace : 'card') : `entry:${entry}`}`)}"] .heading`,
              '.page-title',
            ]),
          );
        },
      },
      go: {
        name: interpolate(t('audit.go_to'), { name: named }),
        title: t('audit.go_setting'),
        focus: `audit-go:${line.text}`,
        onPress: () => {
          if (entry === undefined && group.workspace !== this._workspace) {
            this._selectedWorkspace = group.workspace;
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
      interpolate(this._string(this._ctx, 'history.move'), { name: Misplaced.pathOf(finding) }),
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
    this._commit(
      interpolate(this._string(this._ctx, 'history.move'), { name: old.path }),
      undefined,
      () =>
        this._writeRaw(
          (raw) => Deprecated.moveOld(raw, old),
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

    this._rawConfig = structuredClone(next);
    this._config = { ...Config.DEFAULT_CONFIG, ...(next as unknown as Types.Config) };
    if (!Array.isArray(this._config.entities)) this._config.entities = [];
    this._lastDispatched = next;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: next } }));
  }

  /**
   * Renders the filter bar above the panels.
   *
   * @param ctx - Current editor context
   * @param chassis - The chassis schemas this render draws
   * @returns The filter bar
   */
  private _renderFilterBar(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const [hass, feed] = this._feed(chassis.filter, ctx.language);
    return html`
      <div class="filter-bar">
        ${this._renderHistory(ctx)}
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
        ></ha-form>
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
    if (next.query === this._filter.query) return;
    this._filter = next;
    this._jump = undefined;
    // Typing again leaves the field a result showed for the results.
    this._resultsLeft = undefined;
    // The count, through the queue, once the render that counts it is done.
    if (Filter.hasQuery(next)) void this.updateComplete.then(() => this._say(this._resultStatus));
  };

  /**
   * Says that a query finds nothing.
   *
   * @param ctx - Schema context
   * @returns The message
   */
  private _renderNoMatches(ctx: SchemaCtx): TemplateResult {
    const query = this._filter.query.trim();
    return html`<div class="filter-empty">
      ${interpolate(this._string(ctx, 'filter.no_matches'), { query })}
    </div>`;
  }
}
