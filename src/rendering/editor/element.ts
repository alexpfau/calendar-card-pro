/**
 * The editor element: the overview, one page per section, and the `<ha-form>` changes they
 * mediate. Schemas name Home Assistant selectors rather than concrete input elements, because HA
 * renames its components without notice; the editor draws its own rows, headings and radio
 * groups through `views/`.
 */

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
import * as Buttons from './buttons';
import * as Entities from './entities';
import * as Essentials from './essentials';
import * as Exceptions from './exceptions';
import {
  type FieldId,
  type IndexedField,
  buildFieldIndex,
  builtSchema,
  buttonFieldIndex,
  entityFieldIndex,
  fieldId,
  fieldLabel,
} from './field-index';
import * as Filter from './filter';
import { type HaFormSchema, warmSchema } from './ha-form';
import * as HassKey from './hass-key';
import { HA_ACTION_LABEL_PREFIX, withCardActionLabels } from './hass-localize';
import * as EditorLocalize from './localize';
import * as Misplaced from './misplaced';
import * as Navigation from './navigation';
import {
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  type PageDef,
  isWholeCard,
  placementOf,
} from './pages';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx, walkSchema } from './panels';
import * as QuickSetup from './quick-setup';
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
  splitAtVisibility,
} from './schemas/entity';
import {
  QUICK_SETUP_CALENDARS_SCHEMA,
  QUICK_SETUP_PATH,
  QUICK_SETUP_TAPS_SCHEMA,
  QUICK_SETUP_WEATHER_SCHEMA,
} from './schemas/quick-setup';
import * as Search from './search';
import { DOCS_SITE, STORIES, type StoryId } from './stories';
import { interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Summary from './summary';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Focus from './views/focus';
import { icon } from './views/icon';
import { escapeAction } from './views/keys';
import * as Overview from './views/overview';
import * as PageView from './views/page';
import * as SearchView from './views/search';
import * as Workspace from './workspace';
import * as WriteFrames from './write-frames';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { loadIntlLocaleData } from '../../translations/intl-locale-data';
import * as LanguageCodes from '../../translations/language-codes';
import { configuredCalendarName } from '../../utils/calendar-names';
import * as Helpers from '../../utils/helpers';
import * as Logger from '../../utils/logger';
import { showsEventWeather } from '../../utils/weather-position';

const ENTITY_ICON =
  'M19 19H5V8h14m-3-7v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1h-2Z';

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

type MigrationState =
  | { readonly kind: 'current' }
  | { readonly kind: 'automatic' }
  | { readonly kind: 'choice'; readonly keys: ReadonlyArray<string> }
  | { readonly kind: 'future'; readonly version: number }
  | { readonly kind: 'invalid'; readonly value: unknown };

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
  readonly step: QuickSetupStep;
  /** Unset until a story is picked; nothing is previewed before that. */
  readonly answers?: QuickSetup.QuickSetupAnswers;
  readonly previews: ReadonlyArray<Record<string, unknown>>;
}

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

  // Essentials Only is remembered in this browser; search and Customized Only start clear.
  @state() private _filter: Filter.FilterCriteria = {
    ...Filter.NO_FILTER,
    essentialsOnly: Essentials.rememberedEssentialsOnly(),
  };

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

  /** What the live region last said. */
  private _spoken = '';

  /** What this render draws from: the fields built here, and those the filter bar keeps. */
  private _drawing?: {
    readonly present: ReadonlyMap<FieldId, IndexedField>;
    readonly shown: ReadonlySet<FieldId>;
  };

  /** What Home Assistant's Visibility editor last sent for each calendar (`_conditionsFor`). */
  private _emittedConditions = new Map<
    number,
    { readonly entityId: string; readonly conditions: ReadonlyArray<unknown> }
  >();

  private _authoredRootKeys = new Set<string>();

  /**
   * A key per calendar entry, in the order of `entities`, so each entry keeps its own panel and
   * its forms' writes reach it, wherever a removal, a duplicate or the calendar picker moves it
   * (`write-frames.ts`). The editor's own: never written to the configuration.
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
   * How many settings Essentials Only is hiding, counted as this render draws the panels and read
   * by the line under the filter bar in the same render. Reset at the start of every render.
   */
  private _essentialsHidden = 0;

  /**
   * Adds what a filtered form leaves out to the count Essentials Only reports.
   *
   * Counted only while Essentials Only alone is narrowing the editor: with Customized Only on as
   * well, what is missing is no longer what Essentials hides.
   *
   * @param offered - The form's fields before filtering, inert ones already withheld
   * @param shown - The fields left after filtering
   */
  private _countHidden(
    offered: ReadonlyArray<HaFormSchema>,
    shown: ReadonlyArray<HaFormSchema>,
  ): void {
    if (!Filter.appliesEssentials(this._filter) || this._filter.customizedOnly) return;
    this._essentialsHidden += Filter.countFields(offered) - Filter.countFields(shown);
  }

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
    }

    if (!isEcho) this._authoredRootKeys = new Set(Object.keys(rawConfig));
    this._rawConfig = structuredClone(rawConfig);
    this._config = { ...Config.DEFAULT_CONFIG, ...config };

    if (!Array.isArray(this._config.entities)) {
      this._config.entities = [];
    }
    this._migration = this._migrationState(rawConfig);

    if (!isEcho) {
      this._selectedWorkspace = undefined;
      this._pending = {};
      this._gridReconciliation = [];
      this._gridResetKeys.clear();
      // The page open may be gone from the card, the Grid page outside Grid.
      this._nav = Navigation.validate(this._nav, (route) => this._exists(route)).nav;
    }
    this._banner ??= QuickSetup.isFreshCard(rawConfig);

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
    const result = this._migrationResult(mode);
    this._adoptMigration(result);
    this._lastDispatched = result.config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: result.config } }));
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
   * Builds the context the filter matches against.
   *
   * @returns Matching context for the current configuration and criteria
   */
  private get _filterCtx(): Filter.FilterCtx {
    const ctx = this._ctx;

    return {
      ...ctx,
      criteria: this._filter,
      stored: this._rawConfig,
    };
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
   * A helper callback for a panel's form or a form above the panels: each field's helper, after
   * the note on where its value comes from. Kept while nothing it reads moves: the language, the
   * layout, and that note for each field the form draws, by the field's name. The callback reads
   * the notes from that same record rather than from the configuration, so a kept one cannot
   * answer from an older configuration, even where another form's notes happen to line up.
   *
   * @param slot - Which form
   * @param schema - The form's schema
   * @param ctx - Schema context
   * @param labelPath - The label path every field takes, for a lifted field; else the one
   * `ha-form` hands down
   * @returns The callback
   */
  private _helper(
    slot: string,
    schema: ReadonlyArray<HaFormSchema>,
    ctx: SchemaCtx,
    labelPath?: ReadonlyArray<string>,
  ) {
    const workspace = ctx.workspace ?? ctx.view;
    const sources: Record<string, string | undefined> = {};
    for (const { node } of Routing.workspaceFields(schema)) {
      sources[node.name] = Routing.valueSource(this._config!, workspace, node.name);
    }
    return this._keep(
      `${slot}.helper`,
      [ctx.language, ctx.view, sources],
      () =>
        (node: HaFormSchema, options?: { path?: string[] }): string | undefined => {
          const helper = EditorLocalize.computeHelper(
            ctx.language,
            ctx.view,
            node,
            labelPath ?? options?.path ?? [],
            true,
          );
          const from = 'selector' in node ? sources[node.name] : undefined;
          const note = from
            ? EditorLocalize.lookup(ctx.language, `value_source.${from}`)
            : undefined;
          return [note, helper].filter((value) => value !== undefined).join(' ') || undefined;
        },
    );
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
   * Folds a form change into the configuration, for the owner the form was drawn for.
   *
   * @param frame - Owner, workspace, schema and baseline captured when this form was rendered
   * @param event - The form's `value-changed`
   */
  private _valueChanged(frame: WriteFrames.OwnedFrame, event: CustomEvent): void {
    event.stopPropagation();

    const incoming = event.detail?.value as Record<string, unknown> | undefined;
    if (incoming) this._writeOwned(frame, incoming);
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
    // The calendar picker rebuilds the list a calendar at a time, and the keys go with them.
    if (applied.config.entities !== previousConfig.entities) {
      this._carryEntryKeys(applied.config.entities ?? []);
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
   * the calendar picker and Quick Setup rebuild it (`write-frames.ts` › `carryEntryKeys`).
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
   * What the switches leave of every panel, and the field ids that survive: Essentials Only and
   * Customized Only narrow every page and the jump list by them. A query narrows nothing: it
   * sets Essentials Only aside and shows results. Counts what Essentials Only hides as it goes.
   *
   * @param ctx - Schema context
   * @returns Each panel's filtered schema, and the ids it holds
   */
  private _filtered(ctx: SchemaCtx): {
    readonly schemas: ReadonlyMap<string, HaFormSchema[]>;
    readonly shown: ReadonlySet<FieldId>;
  } {
    const filterCtx = this._filterCtx;
    const schemas = new Map<string, HaFormSchema[]>();
    const shown = new Set<FieldId>();
    for (const panel of PANELS) {
      const built = builtSchema(panel, ctx);
      const schema = Filter.filterSchema(built, filterCtx);
      this._countHidden(built, schema);
      schemas.set(panel.id, schema);
      for (const { node, dataPath } of walkSchema(schema)) {
        if ('selector' in node) shown.add(fieldId(panel.id, dataPath, node.name));
      }
      // Calendars and toolbar buttons are counted here, whichever place draws them.
      for (const subform of panel.subforms?.(ctx) ?? []) {
        const path = subform.path.join('.');
        const forms =
          path === ENTITY_PATH.join('.')
            ? this._entrySchemas(subform, ctx)
            : path === TOOLBAR_BUTTON_PATH.join('.') && Config.resolveToolbar(ctx.config).show
              ? this._buttonSchemas(subform)
              : [];
        for (const { offered, schema: kept } of forms) this._countHidden(offered, kept);
      }
    }
    return { schemas, shown };
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
   * @returns The wrapper and its form
   */
  private _renderField(field: IndexedField, ctx: SchemaCtx): TemplateResult {
    const slot = `field.${field.id}`;
    const schema = this._intern(slot, field.lifted);
    const data = this._intern(`${slot}.data`, Routing.formDataFor(this._formData(), schema));
    const [hass, feed] = this._feed(schema, ctx.language);
    const workspace = ctx.workspace ?? ctx.view;
    const frame: WriteFrames.OwnedFrame = {
      owner: WriteFrames.CARD_OWNER,
      workspace,
      schema,
      data,
    };
    // Focus goes to the calendar picker once Remove has taken the last calendar
    // (`_focusAfterRemove`), and to any field's wrapper, never into its form.
    const wrapper = html`<div
      class="field${field.id === 'calendars:calendars' ? ' calendar-picker' : ''}"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${fieldLabel(field, ctx.language)}
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
          .computeLabel=${this._labeler(ctx.language, field.labelPath)}
          .computeHelper=${this._helper(slot, schema, ctx, field.labelPath)}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
        ></ha-form>`,
      )}
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
    if (target.kind === 'entry-field') return this._entryKeys.includes(target.key);
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
   * A run of fields, each kept with its own frame by its id: drawn by position, a field a gate
   * takes away would hand its form to the field after it, and an edit that form sends late would
   * be written for the wrong field.
   *
   * @param fields - The fields
   * @param ctx - Schema context
   * @returns The fields' frames
   */
  private _renderFields(fields: ReadonlyArray<IndexedField>, ctx: SchemaCtx): unknown {
    return repeat(
      fields,
      (field) => field.id,
      (field) => this._renderField(field, ctx),
    );
  }

  /**
   * The fields a run of the registry draws here: each placed one present for this
   * configuration and scope and kept by the filter bar, in the registry's order.
   *
   * @param fields - The run's placements
   * @param present - The fields built here
   * @param shown - The ids the filter bar keeps
   * @returns The fields
   */
  private _fieldsOf(
    fields: HeadingDef['fields'],
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
  ): IndexedField[] {
    return fields.flatMap(([id]) => {
      const field = present.get(id);
      return field !== undefined && shown.has(id) ? [field] : [];
    });
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
    if (route.kind === 'overview') return true;
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
    how: 'push' | 'cross-link' = 'push',
    heading?: string,
  ): void {
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
    };
    this._nav = Navigation.go(this._nav, to, from, how);
    this._jump = this._resultsLeft = undefined;
    void this._afterMove(undefined, heading);
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
  private _openResult(hit: Search.SearchEntry, focusKey: string): void {
    const target = hit.target;
    const from: Navigation.TrailEntry = {
      route: this._nav.route,
      scrollTop: Focus.scrollPosition(this),
      focusKey,
      search: { query: this._filter.query, editHere: false },
    };
    const page =
      target.kind === 'button-field' ? 'card_header' : target.kind === 'field' && target.page;
    if (page) {
      this._nav = Navigation.go(this._nav, { kind: 'page', page }, from);
    } else {
      this._resultsLeft = from;
    }
    const jump = { target, label: hit.label, lit: true };
    this._jump = jump;
    void this.updateComplete.then(() => {
      const field = this.renderRoot.querySelector<HTMLElement>('.jump');
      if (field) Focus.scrollToTop(this, field);
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
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const wizard = this._quickSetup;
    // Quick Setup is a place of its own: Escape is its Back, or Cancel on its first step.
    const action = escapeAction(event.composedPath(), this, {
      disclosure: wizard === undefined && this._scopeOpen,
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
      this._scopeOpen = false;
      void this.updateComplete.then(() =>
        Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('scope-change')]),
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
        this._writeOwned(
          { owner: WriteFrames.CARD_OWNER, workspace: 'list', schema: chassis.displayView, data },
          { view },
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
    // The calendar picker's list, as its rows name the calendars.
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
   * The Calendars block: today's picker and the panel of each calendar entry, under the block's
   * own heading, until calendars get rows and pages of their own.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @param shown - The ids the filter bar keeps
   * @returns The block, or nothing where the filter leaves nothing of it
   */
  private _renderCalendars(
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
  ): TemplateResult | typeof nothing {
    const panel = PANELS.find((candidate) => candidate.id === 'calendars')!;
    const picker = this._fieldsOf([['calendars:calendars', 'essential']], present, shown);
    const entries = this._renderEntities(panel, ctx);
    if (picker.length === 0 && entries === nothing) return nothing;
    return html`<section class="page-group" data-heading="calendars">
      <h3 class="heading" tabindex="-1">${this._string(ctx, panel.titleKey)}</h3>
      ${this._renderFields(picker, ctx)} ${entries}
    </section>`;
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
    const own = this._fieldsOf(
      OVERVIEW_FIELDS.filter(([id]) => id !== 'calendars:calendars'),
      present,
      shown,
    );
    const head = html`${this._renderMisplaced(ctx)}
    ${
      this._banner
        ? Overview.quickSetupBanner(t, this._openQuickSetup, () => {
            this._banner = false;
          })
        : nothing
    }
    ${this._renderFilterBar(ctx, chassis)} ${this._renderEssentialsNote(ctx)}`;

    // One template whatever the query, so the filter bar above it is never drawn anew and the
    // search field keeps focus as the first character turns the overview into results. The
    // scope stays in view with the results: their values are the scope's.
    return html`<div class="overview">
      ${head} ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)}
      ${this._renderOverviewBody(ctx, chassis, present, shown, own)}
    </div>`;
  }

  /**
   * What the overview draws below its filter bar: what a query finds, or Settings For,
   * Calendars, Card Displays, the overview's own fields, a row per section page and More.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @param present - The fields built here
   * @param shown - The ids the filter keeps
   * @param own - The overview's own fields it keeps
   * @returns The body
   */
  private _renderOverviewBody(
    ctx: SchemaCtx,
    chassis: Subforms.ChassisSchemas,
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
    own: ReadonlyArray<IndexedField>,
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
    const calendars = this._renderCalendars(ctx, present, shown);
    // Only the switches can empty the editor without a query: say so, as the panels did.
    const empty = shown.size === 0 && calendars === nothing && Filter.isFiltering(this._filter);
    return html`${empty ? this._renderNoMatches(ctx) : nothing} ${this._renderScope(ctx)}
    ${calendars} ${this._renderDisplays(ctx, chassis)} ${this._renderFields(own, ctx)}
    ${this._renderResetControls(
      own.flatMap((field) => field.lifted),
      ctx,
    )}
    ${Overview.rowGroup(t('overview.settings'), rows)}
    ${Overview.rowGroup(t('overview.more'), [Overview.exampleRow(t, this._openQuickSetup)])}`;
  }

  /**
   * What a query finds, as the jump list: the count, the scope its values are for, and a row per
   * field, which opens the field where it is drawn.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @param shown - The ids the switches keep
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
      customizedOnly: this._filter.customizedOnly,
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
   * What a page draws under its header: each heading with its fields, and what the page holds
   * besides them (the toolbar's own buttons, the column width table, the reset buttons of the
   * scope's own values).
   *
   * @param page - The page
   * @param ctx - Schema context
   * @param present - The fields built here
   * @param shown - The ids the switches keep
   * @returns The body, or `undefined` where the switches leave nothing of it
   */
  private _renderPageBody(
    page: PageDef,
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
    shown: ReadonlySet<FieldId>,
  ): unknown[] | undefined {
    const parts: unknown[] = [];
    const drawn: IndexedField[] = [];
    for (const heading of page.headings) {
      const fields = this._fieldsOf(heading.fields, present, shown);
      const buttons = heading.extras?.includes('own-buttons')
        ? this._renderToolbarButtons(
            PANELS.find((panel) => panel.id === 'card')!,
            ctx,
          )
        : nothing;
      if (fields.length === 0 && buttons === nothing) continue;
      drawn.push(...fields);
      const body = html`${this._renderFields(fields, ctx)} ${buttons}`;
      const link = heading.crossLink;
      const target = link && PAGES.find((candidate) => candidate.id === link.page);
      const targetHeading = target?.headings.find((each) => each.key === link!.heading);
      parts.push(
        PageView.headingBlock({
          title: this._headingTitle(heading, ctx),
          key: heading.key,
          helper:
            heading.helperKey === undefined ? undefined : this._string(ctx, heading.helperKey),
          crossLink:
            link && target && targetHeading
              ? {
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
                }
              : undefined,
          body,
        }),
      );
    }
    if (page.id === 'size_spacing') {
      const layout = PANELS.find((panel) => panel.id === 'layout')!;
      const extras = Filter.filterExtras(layout.extras?.(ctx) ?? [], this._filterCtx);
      parts.push(...extras.map((extra) => this._renderExtra(extra)));
    }
    const resets = this._renderResetControls(
      drawn.flatMap((field) => field.lifted),
      ctx,
    );
    if (drawn.length === 0 && resets === nothing && parts.length === 0) return undefined;
    parts.push(resets);
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
    const { present, shown } = this._drawing!;
    const scope =
      page.onlyIn !== undefined
        ? PageView.pageLine(t('settings_for.grid_only'))
        : isWholeCard(page)
          ? PageView.pageLine(this._string(ctx, 'value_source.card'))
          : this._renderScope(ctx);
    const body = this._renderPageBody(page, ctx, present, shown);
    return html`<div class="page" data-page=${page.id}>
      ${PageView.pageHead(this._pageTitle(page, ctx), t, this._back)}
      ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)} ${scope}
      ${page.noteKey ? PageView.pageLine(this._string(ctx, page.noteKey)) : nothing}
      ${body ?? (Filter.isFiltering(this._filter) ? this._renderNoMatches(ctx) : nothing)}
      ${PageView.footBack(t, this._back)}
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
   * Each calendar entry's form as the filter bar leaves it, with what was declared for it.
   *
   * @param subform - The entries' sub-form
   * @param ctx - Schema context
   * @returns Every entry, with its key, its declared fields (inert ones withheld) and its schema
   */
  private _entrySchemas(
    subform: { path: ReadonlyArray<string>; schema: ReadonlyArray<HaFormSchema> },
    ctx: SchemaCtx,
  ) {
    const filterCtx = this._filterCtx;
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
      const schema = Filter.filterEntitySchema(declared, entry, subform.path, filterCtx);
      const offered = Filter.withholdInertFields(declared, ctx.workspace ?? ctx.view, 'entity');
      return { entry, index, key: keys[index], offered, schema };
    });
  }

  /**
   * Each toolbar button's form as the filter bar leaves it.
   *
   * @param subform - The buttons' sub-form
   * @returns Every button, with its key, its fields, its schema and its data
   */
  private _buttonSchemas(subform: {
    path: ReadonlyArray<string>;
    schema: ReadonlyArray<HaFormSchema>;
  }) {
    const filterCtx = this._filterCtx;
    const written = Buttons.writtenButtons(this._config!);
    const keys = this._buttonKeysFor(written.length);
    const fields = subform.schema.filter((node) => !Filter.isHeading(node));
    return written.map((entry, index) => ({
      entry,
      index,
      key: keys[index],
      offered: fields,
      schema: Filter.filterButtonSchema(fields, entry, subform.path, filterCtx),
      data: Buttons.toButtonFormData(entry),
    }));
  }

  /**
   * Renders the per-calendar settings, one collapsible form per configured calendar.
   *
   * @param panel - Panel being rendered
   * @param ctx - Schema context
   * @returns The list, or nothing for every other panel
   */
  private _renderEntities(panel: PanelDef, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const subform = panel
      .subforms?.(ctx)
      ?.find((candidate) => candidate.path.join('.') === ENTITY_PATH.join('.'));
    if (subform === undefined) return nothing;

    const entries = this._config?.entities ?? [];
    if (entries.length === 0) return nothing;

    const conditionsEditor = conditionsEditorDefined();
    // Defined before this editor opens wherever Home Assistant's card editor is; should it arrive
    // later, it takes over the YAML box then.
    if (!conditionsEditor) awaitConditionsEditor(this);

    const shown = this._entrySchemas(subform, ctx).filter((candidate) =>
      Filter.hasFields(candidate.schema),
    );

    if (shown.length === 0) return nothing;

    const computeLabel = this._labeler(ctx.language, subform.path);
    const computeHelper = this._subformHelper(ctx, subform.path, true);
    const workspace = ctx.workspace ?? ctx.view;

    // Keyed by each entry's own key, so an entry's panel and forms are only ever its own: drawn by
    // place, a removal above an entry would hand it the panel, and the listeners, of the one before.
    return html`
      ${repeat(
        shown,
        ({ key }) => key,
        ({ entry, index, key, schema }) => {
          const entityId = Synthetic.entityIdOf(entry);
          const conditions = conditionsEditor
            ? this._conditionsFor(index, entityId, Entities.asEntityConfig(entry).visibility)
            : undefined;
          const split = conditions ? splitAtVisibility(schema) : undefined;

          return html`
            <ha-expansion-panel
              outlined
              class="entity-panel"
              data-entry-key=${key}
              .header=${Entities.entityDisplayName(entityId, this.hass)}
              .secondary=${this._entitySummary(entries, index, ctx)}
              .leftChevron=${false}
              .expanded=${this._filter.customizedOnly || this._jumpsTo('entry-field', key)}
            >
              <span slot="leading-icon" class="leading-icon">${icon(ENTITY_ICON)}</span>
              <div class="panel-body">
                <div class="entity-actions">
                  <div class="entity-actions-safe">
                    <button
                      type="button"
                      class="text-button"
                      ?disabled=${!Entities.hasTransferableSettings(entry)}
                      @click=${() => this._copyEntitySettings(entry)}
                    >
                      ${this._string(ctx, 'entity.copy')}
                    </button>
                    <button
                      type="button"
                      class="text-button"
                      ?disabled=${Entities.copiedSettings() === undefined}
                      @click=${() => this._pasteEntitySettings(index)}
                    >
                      ${this._string(ctx, 'entity.paste')}
                    </button>
                    <button
                      type="button"
                      class="text-button"
                      @click=${() => this._duplicateEntity(index)}
                    >
                      ${this._string(ctx, 'entity.duplicate')}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="text-button destructive"
                    @click=${() => this._removeEntity(index)}
                  >
                    ${this._string(ctx, 'entity.remove')}
                  </button>
                </div>
                ${whenOpened(() => {
                  const slot = `entry.${key}`;
                  const data = this._intern(slot, Entities.toEntityFormData(entry, entries));
                  // The field a result opened, drawn alone above the rest, unless it is the
                  // conditions Home Assistant's own editor holds.
                  const jumped = this._jumpField('entry-field', key, schema);
                  const visibility = split !== undefined && jumped?.node.name === VISIBILITY;
                  const lifted = visibility ? undefined : jumped;
                  const rest = lifted ? withoutNode(schema, lifted.node) : schema;
                  const parts = lifted && split ? splitAtVisibility(rest) : split;
                  const owner: WriteFrames.WriteOwner = { kind: 'entry', key };
                  const form = (part: ReadonlyArray<HaFormSchema>, name: string) => {
                    const kept = this._intern(`${slot}.${name}`, part);
                    const [hass, feed] = this._feed(kept, ctx.language);
                    const frame: WriteFrames.OwnedFrame = { owner, workspace, schema: kept, data };
                    return html`
                      <ha-form
                        class="entity-form"
                        data-hass=${feed}
                        .hass=${hass}
                        .data=${data}
                        .schema=${kept}
                        .computeLabel=${computeLabel}
                        .computeHelper=${computeHelper}
                        .localizeValue=${this._localizeValue}
                        @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
                      ></ha-form>
                    `;
                  };

                  const conditionsBlock = (body: TemplateResult) =>
                    visibility ? this._jumpToOwned(ctx, body) : body;
                  const forms = parts
                    ? html`
                        ${parts.before.length > 0 ? form(parts.before, 'before') : nothing}
                        ${conditionsBlock(
                          html`<div
                            class="entity-visibility"
                            @context-request=${(event: Event) => provideCalendar(event, entityId)}
                          >
                            <div class="entity-visibility-helper">
                              ${this._string(ctx, 'entity.visibility.helper')}
                            </div>
                            ${keyed(
                              entityId,
                              html`<ha-card-conditions-editor
                                data-hass="live"
                                .hass=${this.hass}
                                .conditions=${conditions}
                                @value-changed=${(event: CustomEvent) =>
                                  this._visibilityChanged(key, event)}
                              ></ha-card-conditions-editor>`,
                            )}
                          </div>`,
                        )}
                        ${parts.after.length > 0 ? form(parts.after, 'after') : nothing}
                      `
                    : form(rest, 'all');
                  return lifted
                    ? html`${this._jumpToOwned(ctx, form(lifted.lifted, 'jump'))} ${forms}`
                    : forms;
                })}
              </div>
            </ha-expansion-panel>
          `;
        },
      )}
    `;
  }

  /**
   * The line under a calendar's heading.
   *
   * The heading is Home Assistant's name for the calendar, matching the picker row above it,
   * so a name this card gives the calendar shows on no closed panel, and two blocks over one
   * calendar carry the same heading. This line answers both, in the order that is useful:
   *
   * - the calendar's own name on this card, wherever it differs from the heading by more than
   *   the spaces around either. It is read from the whole list, because a name belongs to the
   *   calendar rather than to one block (`configuredCalendarName`), so a block that does not
   *   hold it still shows it, and a blank one is no name;
   * - its position among the calendar's blocks, when there is more than one, so that "the same
   *   calendar, twice" is never mistaken for the card having listed something twice by
   *   accident;
   * - what the block holds: a label the user wrote wins, because it is their own answer to
   *   this exact question, else whether it configures anything. A block whose only setting is
   *   the name the line already leads with says nothing more, where "Configured" would only
   *   point at that name a second time.
   *
   * It deliberately does not report *which setting* differs between two blocks. Any of the
   * thirty-odd per-calendar options can be the one, several can differ at once, and a diff
   * of two configs renders as jargon — `event_type: all_day` means nothing to someone who
   * set it through a dropdown reading "Only all-day events". The position answers the
   * question the duplicate actually raises, which is "which of these two am I editing",
   * and answers it in every case rather than in the neat ones.
   *
   * @param entities - The list as stored, for finding this calendar's name and duplicates
   * @param index - Position of the calendar being described
   * @param ctx - Schema context
   * @returns Secondary text
   */
  private _entitySummary(
    entities: ReadonlyArray<string | Types.EntityConfig>,
    index: number,
    ctx: SchemaCtx,
  ): string {
    const entry = entities[index];
    const config = Entities.asEntityConfig(entry);
    const entityId = Synthetic.entityIdOf(entry);

    // Both trimmed, as the heading reads: a name differing from Home Assistant's only in the
    // spaces around either is the same name, and is not repeated under it.
    const configured = configuredCalendarName(entities, entityId);
    const name =
      configured !== undefined &&
      configured !== Entities.entityDisplayName(entityId, this.hass).trim()
        ? configured
        : undefined;
    const holdsOnlyName =
      name !== undefined &&
      Entities.hasSettings(entry) &&
      Object.keys(config).every((key) => key === 'entity' || key === 'name');

    const described =
      typeof config.label === 'string' && config.label !== ''
        ? config.label
        : holdsOnlyName
          ? undefined
          : Entities.hasSettings(entry)
            ? this._string(ctx, 'entity.customised')
            : this._string(ctx, 'entity.unconfigured');

    const { position, total } = Entities.occurrenceOf(entities, index);
    const occurrence =
      total < 2
        ? undefined
        : interpolate(this._string(ctx, 'entity.occurrence'), { position, total });

    return [name, occurrence, described].filter((part) => part !== undefined).join(' · ');
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

    this._emittedConditions.set(this._entryKeys.indexOf(key), {
      entityId: Synthetic.entityIdOf(entry),
      conditions,
    });
    this._writeFieldValue({ kind: 'entry', key }, `calendar:${VISIBILITY}`, conditions);
  }

  /**
   * A calendar's conditions as Home Assistant's Visibility editor is handed them: the very list it
   * last sent for this calendar, wherever the stored conditions still say the same.
   *
   * Its editor keeps a condition open by the identity of the condition's object, and hands that
   * identity on to the object it sends for a changed one, as Home Assistant's own card dialog
   * hands the list straight back. Every write here stores a copy (`_report`), so the stored
   * objects are new ones each time: handed those, the editor would take every condition for a new
   * one and draw it closed, after every change. A list that says something else, because the YAML
   * changed under it, is handed over as stored.
   *
   * @param index - Position of the calendar in the list
   * @param entityId - The calendar
   * @param stored - Its `visibility` as stored
   * @returns The list, or undefined where only the YAML box can show it (`editableConditions`)
   */
  private _conditionsFor(
    index: number,
    entityId: string,
    stored: unknown,
  ): ReadonlyArray<unknown> | undefined {
    const conditions = editableConditions(stored);
    const emitted = this._emittedConditions.get(index);
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
   * Copies one calendar's settings, for pasting into another.
   *
   * @param entry - Entry as stored
   */
  private _copyEntitySettings(entry: string | Types.EntityConfig): void {
    Entities.copySettings(entry);

    this.requestUpdate();
  }

  /**
   * Applies the copied settings to one calendar.
   *
   * @param index - Position of the calendar in the list
   */
  private _pasteEntitySettings(index: number): void {
    if (!this._config) return;

    if (!this._prepareForWrite()) return;
    this._config = {
      ...this._config,
      entities: Entities.pasteSettings(this._config.entities ?? [], index),
    };

    this._report(this._config);
  }

  /**
   * Lists one calendar a second time, with the same settings, right after it: a new entry, with
   * a key of its own.
   *
   * @param index - Position of the calendar in the list
   */
  private _duplicateEntity(index: number): void {
    if (!this._config) return;

    if (!this._prepareForWrite()) return;
    const keys = this._entryKeysFor(this._config.entities?.length ?? 0);
    this._config = {
      ...this._config,
      entities: Entities.duplicateEntity(this._config.entities ?? [], index),
    };
    // Moved before the report, whose echo can arrive before it returns.
    this._entryKeys = [...keys.slice(0, index + 1), this._mintEntryKey(), ...keys.slice(index + 1)];

    this._report(this._config);
  }

  /**
   * Drops one calendar from the list, its key with it. Where focus was inside the calendar's
   * panel, as on a keyboard's Remove, it moves on (`_focusAfterRemove`), since the panel takes the
   * focused button with it.
   *
   * @param index - Position of the calendar in the list
   */
  private _removeEntity(index: number): void {
    if (!this._config) return;

    if (!this._prepareForWrite()) return;
    const keys = this._entryKeysFor(this._config.entities?.length ?? 0);
    const panels = [...this.renderRoot.querySelectorAll('.entity-panel')];
    const panel = panels.find((each) => each.getAttribute('data-entry-key') === `${keys[index]}`);
    const focused = panel?.contains((this.renderRoot as ShadowRoot).activeElement);
    this._config = {
      ...this._config,
      entities: Entities.removeEntity(this._config.entities ?? [], index),
    };
    // Moved before the report, whose echo can arrive before it returns.
    this._entryKeys = keys.filter((_key, at) => at !== index);

    this._report(this._config);
    if (focused) void this._focusAfterRemove(panels.indexOf(panel!));
  }

  /**
   * Puts focus where a removed calendar's panel took it from, as a keyboard user expects: on the
   * Remove of the calendar drawn in its place now, else of the one drawn before it, else on the
   * calendar picker. Drawn by place, the panels used to keep focus there by handing the next
   * calendar the removed one's panel; drawn by key, each panel is its owner's own. A closed panel
   * draws nothing to focus, so the calendar's panel opens first.
   *
   * @param at - The removed calendar's place among the panels drawn
   */
  private async _focusAfterRemove(at: number): Promise<void> {
    await this.updateComplete;
    const panels = this.renderRoot.querySelectorAll<
      HTMLElement & { expanded?: boolean; updateComplete?: Promise<unknown> }
    >('.entity-panel');
    const panel = panels[Math.min(at, panels.length - 1)];
    if (panel && !panel.expanded) {
      openedPanels.add(panel);
      panel.expanded = true;
      this.requestUpdate();
      await this.updateComplete;
      await panel.updateComplete;
    }
    (panel ?? this.renderRoot)
      .querySelector<HTMLElement>(panel ? '.destructive' : '.calendar-picker')
      ?.focus();
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

    const filtering = Filter.isFiltering(this._filter);
    const written = Buttons.writtenButtons(this._config!);
    const shown = this._buttonSchemas(subform).filter((candidate) =>
      Filter.hasFields(candidate.schema),
    );

    if (filtering && shown.length === 0) return nothing;
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
            .expanded=${
              this._filter.customizedOnly ||
              this._addedButtons.has(key) ||
              this._jumpsTo('button-field', key)
            }
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
                      @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
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
      ${
        filtering
          ? nothing
          : html`
              <button type="button" class="text-button add-button" @click=${this._addButton}>
                ${this._string(ctx, 'toolbar.buttons.add')}
              </button>
            `
      }
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
    if (!this._writeButtons(Buttons.moveButton(written, index, by))) return;
    [keys[index], keys[to]] = [keys[to], keys[index]];

    const moved = keys[to];
    void this.updateComplete.then(() => this._focusMoveControl(moved, by));
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
   * Drops one button from the list. Focus passes to Add Button, as the removed panel held it.
   *
   * @param index - Position of the button in the list
   */
  private _removeButton(index: number): void {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const keys = this._buttonKeysFor(written.length);
    if (!this._writeButtons(Buttons.removeButton(written, index))) return;

    const [removed] = keys.splice(index, 1);
    this._addedButtons.delete(removed);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLButtonElement>('.add-button')?.focus(),
    );
  }

  /**
   * Adds a button after the last, and opens its panel to be filled in.
   */
  private _addButton = (): void => {
    if (!this._config) return;
    const written = Buttons.writtenButtons(this._config);
    const keys = this._buttonKeysFor(written.length);
    if (!this._writeButtons(Buttons.addButton(written))) return;

    const key = this._nextButtonKey++;
    keys.push(key);
    this._addedButtons.add(key);
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
   * Offers reset actions for explicit values, without duplicating the editing controls.
   *
   * 🚨 Guards on where the *workspace writes*, never on `ctx.view`. Those agreed while list
   * was blockless, so `ctx.view` read as a destination for free. It stopped being one the
   * moment `list:` was registered: the shared workspace builds its panels as list — see
   * {@link Workspace.baseViewForWorkspace} — so `ctx.view` is `'list'` there, and guarding on
   * it offered Shared the reset buttons for `list:`. Clicking one deleted a List override
   * from a workspace that cannot write to `list:` at all, leaving root untouched.
   *
   * Shared therefore offers none, which is the answer the reset *means* rather than a
   * special case: {@link _resetViewValues} returns a value to what it inherits, and the
   * shared base inherits from nothing. It is also what the root-writing workspace did
   * before `list:` existed, so this restores that behavior rather than inventing one.
   *
   * @param schema - Fields currently shown
   * @param ctx - Editing context
   * @returns Per-option reset buttons, or nothing
   */
  private _renderResetControls(
    schema: ReadonlyArray<HaFormSchema>,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const view = this._destinationView(ctx);
    if (view === undefined) return nothing;
    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];
    if (blockKey === undefined) return nothing;
    const stored = Value.storedViewBlocks(this._config!)[blockKey];
    if (!stored || typeof stored !== 'object') return nothing;
    const seen = new Set<string>();
    const resets = [...Routing.workspaceFields(schema)].flatMap(({ node, path, labelPath }) => {
      const keys = (
        path.length === 1 && path[0] === blockKey
          ? [node.name]
          : path.length === 0
            ? Synthetic.configKeysForField(node.name).filter(
                (key) => Routing.destination(key, view) === blockKey,
              )
            : []
      ).filter((key) => Object.prototype.hasOwnProperty.call(stored, key) && !seen.has(key));
      if (keys.length === 0) return [];
      keys.forEach((key) => seen.add(key));
      return [{ keys, label: EditorLocalize.computeLabel(ctx.language, node, labelPath) }];
    });
    if (resets.length === 0) return nothing;
    return html`
      <div class="view-resets">
        ${resets.map(
          ({ keys, label }) => html`
            <button
              type="button"
              class="text-button"
              data-reset-keys=${keys.join(' ')}
              @click=${() => this._resetViewValues(blockKey, view, keys)}
            >
              ${interpolate(this._string(ctx, 'value_source.reset'), {
                option: label,
              })}
            </button>
          `,
        )}
      </div>
    `;
  }

  /**
   * Returns one view value to its inherited or view-default value.
   *
   * @param blockKey - View's storage block
   * @param view - View whose value is reset
   * @param keys - Options controlled by the field
   */
  private _resetViewValues(
    blockKey: keyof Types.Config,
    view: Types.EffectiveView,
    keys: ReadonlyArray<string>,
  ): void {
    if (!this._config) return;
    if (!this._prepareForWrite()) return;
    if (blockKey === 'time_grid') {
      for (const key of keys) {
        if (ViewConfig.hasDivergentDefault(key, view)) this._gridResetKeys.add(key);
      }
    }
    for (const key of keys) this._config = Exceptions.removeException(this._config, blockKey, key);
    const pending = { ...this._pending };
    for (const key of keys) delete pending[`${blockKey}.${key}`];
    for (const name of Object.keys(Synthetic.SYNTHETIC_FIELDS)) {
      if (Synthetic.configKeysForField(name).some((key) => keys.includes(key)))
        delete pending[Routing.pendingKey(name, view)];
    }
    this._pending = pending;
    this._report(this._config);
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
    this._essentialsHidden = 0;
    this._drawn = [];
    this._drawnConditions = new Map();
    const { shown } = this._filtered(ctx);
    const present = buildFieldIndex(ctx).fields;
    this._drawing = { present, shown };
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
      // As `_renderEntities` draws them, wherever the editor is: a calendar's form split around
      // Home Assistant's Visibility editor, which holds its conditions.
      const all = this._config!.entities ?? [];
      const conditionsEditor = conditionsEditorDefined();
      for (const { entry, index, schema } of this._entrySchemas(entries, ctx)) {
        if (!Filter.hasFields(schema)) continue;
        const entityId = Synthetic.entityIdOf(entry);
        const conditions = conditionsEditor
          ? this._conditionsFor(index, entityId, Entities.asEntityConfig(entry).visibility)
          : undefined;
        const split = conditions ? splitAtVisibility(schema) : undefined;
        const values = Entities.toEntityFormData(entry, all);
        for (const part of split ? [split.before, split.after] : [schema]) {
          this._drawn.push([part, values]);
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
    this._drawn.push([chassis.filter, NO_DATA]);

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
          page === undefined || !this._exists(route)
            ? this._renderOverview(ctx, chassis)
            : keyed(Navigation.routeKey(route), this._renderPage(page, ctx)),
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

    return html`
      <div class="card-config">
        <div
          class="config-migration"
          data-config-migration
          role="group"
          aria-labelledby="config-migration-title"
        >
          <strong id="config-migration-title"
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
   * Writes what Quick Setup built and returns to the panels, with that as the authored truth.
   *
   * Like a migration's adoption: everything the editor keeps about the YAML it last saw is reset
   * to the new configuration, before Home Assistant echoes it.
   */
  private _applyQuickSetup = (): void => {
    const session = this._quickSetup;
    if (session?.answers === undefined || session.answers.calendars.length === 0) return;

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
  };

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
    if (!this._prepareForWrite()) return;

    // A first write can migrate a pre-v5 card; move within what that produced.
    const next =
      Misplaced.moveOption(this._rawConfig, finding, to) ?? structuredClone(this._rawConfig);
    if (finding.from === null) this._authoredRootKeys.delete(finding.key);
    if (to === null) this._authoredRootKeys.add(finding.key);

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
        <ha-form
          class="filter-form"
          data-hass=${feed}
          .hass=${hass}
          .data=${this._intern('filter', Filter.filterFormData(this._filter))}
          .schema=${chassis.filter}
          .computeLabel=${this._labeler(ctx.language)}
          .computeHelper=${this._helper('filter', chassis.filter, ctx)}
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
    if (next.essentialsOnly !== this._filter.essentialsOnly) {
      Essentials.rememberEssentialsOnly(next.essentialsOnly);
    }
    const typed = next.query !== this._filter.query;
    this._filter = next;
    // A switch can take away the field a result showed, so Return to Results goes to the top.
    this._jump = undefined;
    if (!typed) return;
    // Typing again leaves the field a result showed for the results.
    this._resultsLeft = undefined;
    // The count, through the queue, once the render that counts it is done.
    if (Filter.hasQuery(next)) void this.updateComplete.then(() => this._say(this._resultStatus));
  };

  /**
   * Says how many settings Essentials Only is hiding, so a shorter editor never reads as the
   * whole of it.
   *
   * @param ctx - Schema context
   * @returns The line, or nothing while Essentials Only is not what narrows the editor
   */
  private _renderEssentialsNote(ctx: SchemaCtx): TemplateResult | typeof nothing {
    if (!Filter.appliesEssentials(this._filter) || this._filter.customizedOnly) return nothing;
    return html`<div class="filter-note" data-essentials-note>
      ${interpolate(this._string(ctx, 'essentials_only.hidden'), {
        count: String(this._essentialsHidden),
      })}
    </div>`;
  }

  /**
   * Says why the editor is empty.
   *
   * @param ctx - Schema context
   * @returns The message
   */
  private _renderNoMatches(ctx: SchemaCtx): TemplateResult {
    const query = this._filter.query.trim();

    if (query === '') {
      // Only Customized Only can empty the editor without a query: Essentials Only keeps the
      // calendar picker, and beside Customized Only it keeps everything the card sets, which is
      // everything Customized Only keeps.
      return html`
        <div class="filter-empty">${this._string(ctx, 'filter.nothing_customized')}</div>
      `;
    }

    return html`
      <div class="filter-empty">
        ${interpolate(this._string(ctx, 'filter.no_matches'), { query })}
        <div class="filter-empty-note">${this._string(ctx, 'filter.gated_note')}</div>
      </div>
    `;
  }
}
