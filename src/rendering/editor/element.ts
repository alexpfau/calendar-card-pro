/**
 * The editor element: the overview, one page per section, and the `<ha-form>` changes they
 * mediate. Schemas name Home Assistant selectors rather than concrete input elements, because HA
 * renames its components without notice; the editor draws its own rows, headings and radio
 * groups through `views/`.
 */

import { mdiCheck, mdiDeleteOutline } from '@mdi/js';
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
import * as CalendarList from './calendar-list';
import * as Colors from './colors';
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
  fieldHelper,
  fieldId,
  fieldLabel,
} from './field-index';
import * as Filter from './filter';
import { type HaFormSchema, warmSchema } from './ha-form';
import * as HassKey from './hass-key';
import { HA_ACTION_LABEL_PREFIX, withCardActionLabels } from './hass-localize';
import { History, type MigrationState, type Snapshot } from './history';
import * as EditorLocalize from './localize';
import * as Misplaced from './misplaced';
import * as Navigation from './navigation';
import {
  CALENDARS_BLOCK,
  ENTRY_GROUPS,
  type HeadingDef,
  OVERVIEW_FIELDS,
  PAGES,
  type PageDef,
  type PageId,
  isWholeCard,
  placementOf,
} from './pages';
import {
  PANELS,
  type PanelDef,
  type PanelExtra,
  type SchemaCtx,
  type SubformDef,
  walkSchema,
} from './panels';
import * as Preview from './preview';
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
} from './schemas/entity';
import {
  QUICK_SETUP_CALENDARS_SCHEMA,
  QUICK_SETUP_PATH,
  QUICK_SETUP_TAPS_SCHEMA,
  QUICK_SETUP_WEATHER_SCHEMA,
} from './schemas/quick-setup';
import * as Search from './search';
import * as Split from './split';
import * as SplitReview from './split-review';
import { DOCS_SITE, STORIES, type StoryId } from './stories';
import { interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Summary from './summary';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as CalendarView from './views/calendars';
import * as ColorView from './views/color';
import * as Focus from './views/focus';
import * as HistoryView from './views/history';
import { icon } from './views/icon';
import { escapeAction, historyKey, inTextField } from './views/keys';
import * as Overview from './views/overview';
import * as PageView from './views/page';
import * as SearchView from './views/search';
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

/** The word lists, drawn as one term at a time while their pattern reads as terms. */
const WORD_LIST_FIELDS: ReadonlySet<FieldId> = new Set([
  'calendar:blocklist',
  'calendar:allowlist',
  'events:location_country_pattern',
]);

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
  /** The calendar, for an entry's control. */
  readonly entity?: { readonly id: string; readonly name: string };
  /** Where its choice goes instead of the owner, for a control editing nothing stored yet. */
  readonly write?: (write: ColorWrite) => void;
}

/** The line a removal or an applied story leaves under its list ("Removed Ben · Undo"). */
interface StatusLine {
  readonly kind: 'entry' | 'button' | 'story';
  readonly text: string;
  /** The removed calendar's place among the calendars, where the line stands in the list. */
  readonly at: number;
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
    // Leaving the visual editor, for the code editor or by closing the dialog, cancels a split
    // that has not been made, so the preview is never what is kept.
    this._cancelSplit(false);
    awaitingConditionsEditor.delete(this);
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

  // Essentials Only is remembered in this browser; search and Customized Only start clear.
  @state() private _filter: Filter.FilterCriteria = {
    ...Filter.NO_FILTER,
    essentialsOnly: Essentials.rememberedEssentialsOnly(),
  };

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

  /** What this render draws from: the fields built here, and those the filter bar keeps. */
  private _drawing?: {
    readonly present: ReadonlyMap<FieldId, IndexedField>;
    readonly shown: ReadonlySet<FieldId>;
  };

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
    this._splitDone = undefined;
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
    this._cancelSplit(false);
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
    return this._ctxFor(
      this._config!,
      this._workspace,
      this.hass?.locale,
      this._heldModes(this._pending, this._workspace),
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
    const colors = this._cardColors(ctx);
    const spec = colors.specs.get(field.id);
    if (spec !== undefined) {
      // A mode's value is drawn inside its mode's control, wherever both are drawn.
      const absorbed =
        spec.mode !== undefined &&
        field.id === spec.value &&
        this._drawing?.present.has(spec.mode) === true &&
        this._drawing.shown.has(spec.mode);
      return absorbed ? html`` : this._renderColorField(field, spec, colors, ctx);
    }
    const composed =
      field.id === START_DATE_FIELD
        ? this._renderStartDate(field, ctx)
        : field.id === OPENS_DETAILS_FIELD && Synthetic.eventTapReading(ctx.config) === 'other'
          ? this._renderTapLine(field, ctx)
          : undefined;
    if (composed !== undefined) return this._jumpedCardField(field, ctx, composed);
    const slot = `field.${field.id}`;
    const words = this._renderWords(WriteFrames.CARD_OWNER, field, this._formData(), ctx, slot);
    if (words !== undefined) return this._jumpedCardField(field, ctx, words);
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
    // Focus goes to a field's wrapper, never into its form.
    const wrapper = html`<div
      class="field"
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
          .error=${this._patternError(slot, field, data, ctx)}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._labeler(ctx.language, field.labelPath)}
          .computeHelper=${this._helper(slot, schema, ctx, field.labelPath)}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._valueChanged(frame, event, field.labelPath, `field:${field.id}`)}
        ></ha-form>`,
      )}
      ${this._wordToggle(WriteFrames.CARD_OWNER, field, data, ctx)}
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
   * @returns The chips
   */
  private _renderStartDate(field: IndexedField, ctx: SchemaCtx): TemplateResult {
    const name = field.node.name;
    const value = String(Routing.formDataFor(this._formData(), field.lifted)[name] ?? '');
    const selector = field.node.selector;
    const options = 'select' in selector ? (selector.select?.options ?? []) : [];
    const label = fieldLabel(field, ctx.language);
    const workspace = ctx.workspace ?? ctx.view;
    return Overview.radioChips(
      field.id,
      name,
      label,
      options.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      ),
      value,
      (mode) =>
        this._commit(
          interpolate(this._string(ctx, 'history.change'), { setting: label }),
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
   * @returns The line
   */
  private _renderTapLine(field: IndexedField, ctx: SchemaCtx): TemplateResult {
    const stored = ctx.config.event_tap_action;
    const action =
      this._describe({ node: { name: 'event_tap_action', selector: { ui_action: {} } } }, stored) ??
      String(stored?.action ?? '');
    return Overview.tapLine(field.id, this._t(ctx), action, () =>
      this._openField('taps_refresh', 'actions:event_tap_action', 'tap:change'),
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
   * @param ownerName - The calendar's name, for the undo label
   * @returns The field; undefined where it is drawn as a pattern
   */
  private _renderWords(
    owner: WriteFrames.WriteOwner,
    field: IndexedField,
    data: Readonly<Record<string, unknown>>,
    ctx: SchemaCtx,
    slot: string,
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
    const workspace = ctx.workspace ?? ctx.view;
    // The field's own frame, captured as its raw form's is, so an edit the form sends late is
    // written for the owner and scope it was drawn for.
    const lifted = this._intern(slot, field.lifted);
    const frame: WriteFrames.OwnedFrame = {
      owner,
      workspace,
      schema: lifted,
      data: this._intern(`${slot}.data`, Routing.formDataFor(data, lifted)),
    };
    return html`<div
      class="field"
      data-field=${field.id}
      data-composed="words"
      tabindex="-1"
      role="group"
      aria-label=${label}
    >
      ${keyed(
        workspace,
        html`<ha-form
          class=${owner.kind === 'card' ? 'field-form' : 'entity-form'}
          data-hass=${feed}
          .hass=${hass}
          .data=${own}
          .schema=${schema}
          .computeLabel=${this._labeler(ctx.language, field.labelPath)}
          .computeHelper=${
            owner.kind === 'card'
              ? this._helper(slot, schema, ctx, field.labelPath)
              : this._subformHelper(ctx, field.labelPath, true)
          }
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) =>
            this._wordsChanged(frame, field, event, label, ownerName)}
        ></ha-form>`,
      )}
      ${this._wordButton(key, 'pattern', this._string(ctx, 'word_list.use_pattern'))}
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
        ? interpolate(this._string(ctx, 'history.change'), { setting })
        : interpolate(this._string(ctx, 'history.change_for'), { setting, name: ownerName });
    this._commit(
      label,
      `${key}|words|${workspace}`,
      () => this._writeOwned(frame, WriteFrames.withValue(frame.data, field, pattern)),
      `field:${field.id}`,
    );
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
  ): TemplateResult {
    const valueField = colors.fields.get(spec.value)!;
    const workspace = ctx.workspace ?? ctx.view;
    const configKey = valueField.configKeys[0] ?? valueField.node.name;
    const block =
      valueField.dataPath.length === 0 ? Routing.destination(configKey, workspace) : undefined;
    const name = fieldLabel(field, ctx.language);
    return html`<div
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
        data: this._formData(),
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
      })}
    </div>`;
  }

  /**
   * An entry's color control, as its page draws it (`_renderEntryField`), writing to that entry
   * alone.
   *
   * @param key - The entry's key
   * @param id - The color field, or the mode it absorbs (`calendar:accent_color`)
   * @param ctx - Schema context
   * @returns The control; nothing for an entry that has left, or a field that is no color
   */
  private _renderEntryColor(
    key: number,
    id: FieldId,
    ctx: SchemaCtx,
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
      valueField,
      data: WriteFrames.projectionFor(owner, this._writeState(), ctx.workspace ?? ctx.view) ?? {},
      stored: Entities.asEntityConfig(entry)[valueField.node.name as keyof Types.EntityConfig],
      destination: String(key),
      anchor,
      focusKey: `entry:${key}`,
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
    const t = (key: string): string => this._string(ctx, key);
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
        return interpolate(t('color.follow_card.description'), {
          value: Colors.describeColor(cardAccent, spec, language, { haName }),
        });
      }
      if (source !== 'follow-ha') return undefined;
      if (c.entity === undefined) return t('color.follow_ha.card');
      return registry === undefined
        ? interpolate(t('color.follow_ha.none'), { name: c.entity.name })
        : interpolate(t('color.follow_ha.found'), {
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
    const customLabel = interpolate(t('color.custom_field'), { setting: c.name });
    const remove =
      c.entity !== undefined && c.stored !== undefined && c.stored !== null && c.stored !== ''
        ? {
            label: interpolate(t('color.remove'), { name: c.entity.name, setting: c.name }),
            onRemove: () => pick(spec.sources[0].write),
          }
        : undefined;
    return ColorView.colorControl({
      id: `color:${key}`,
      focusKey: `color:${key}`,
      name: c.name,
      value: valueWords,
      accessibleName: interpolate(t('color.named'), { setting: c.name, value: valueWords }),
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
        ? interpolate(this._string(ctx, 'history.change'), { setting: c.name })
        : interpolate(this._string(ctx, 'history.change_for'), {
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
    this._openStrip = undefined;
    this._adding = undefined;
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
    this._closeDisclosures();
    if (target.kind === 'entry-field') {
      // A calendar entry's field opens on the entry's own page.
      this._nav = Navigation.go(this._nav, { kind: 'entry', key: target.key }, from);
    } else if (page) {
      this._nav = Navigation.go(this._nav, { kind: 'page', page }, from);
    } else {
      this._resultsLeft = from;
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
        (this._colorOpenHere() ||
          this._scopeOpen ||
          this._openStrip !== undefined ||
          this._adding !== undefined ||
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
    } else if (action === 'close' && this._colorOpenHere()) {
      const open = this._openColor;
      this._openColor = undefined;
      void this.updateComplete.then(() =>
        Focus.focusFirst(this.renderRoot, [Focus.byFocusKey(`color:${open}`)]),
      );
    } else if (
      action === 'close' &&
      this._split !== undefined &&
      this._openStrip === undefined &&
      this._adding === undefined &&
      !this._scopeOpen
    ) {
      // Escape cancels Split This Calendar from any of its steps, as Cancel does.
      this._cancelSplit(true);
    } else if (action === 'close') {
      // The disclosure opened last closes, focus back on what opened it.
      const strip = this._openStrip;
      const opener =
        strip !== undefined
          ? `more:${strip}`
          : this._adding !== undefined
            ? 'add-calendar'
            : 'scope-change';
      if (strip !== undefined) this._openStrip = undefined;
      else if (this._adding !== undefined) this._adding = undefined;
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
   * A color field's spec, for describing its value: by the field's id where it has one, else by
   * its node, the card's before an entry's, else by its name.
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
    return find((node) => node === field.node) ?? find((node) => node.name === field.node.name);
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
    const { present, shown } = this._drawing!;
    const own = this._fieldsOf(OVERVIEW_FIELDS, present, shown);
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
    const calendars = this._renderCalendars(ctx);
    // Only the switches can empty the editor without a query: say so, as the panels did.
    const empty =
      shown.size === 0 &&
      Filter.isFiltering(this._filter) &&
      this._calendarModels(ctx).length === 0;
    return html`${empty ? this._renderNoMatches(ctx) : nothing} ${this._renderScope(ctx)}
    ${calendars} ${this._renderDisplays(ctx, chassis)} ${this._renderFields(own, ctx)}
    ${this._renderResetControls(own, ctx)} ${Overview.rowGroup(t('overview.settings'), rows)}
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
    const resets = this._renderResetControls(drawn, ctx);
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
      ${PageView.pageHead(this._pageTitle(page, ctx), t, this._back, this._renderHistory(ctx))}
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
    if (onPage) {
      // First in the page's ⋮, as the row under Which Events opens it too (D12).
      actions.unshift({
        id: 'split',
        label: this._string(ctx, 'split.title'),
        name: interpolate(this._string(ctx, 'split.named'), { name: entryName }),
        onPress: () => this._openSplit(entryKey),
      });
    }
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
   * The calendars the list draws, each with its rows: every entry, or while the editor is
   * filtered those whose page keeps a field, narrowed further by Filter Calendars.
   *
   * @param ctx - Schema context
   * @returns The calendars, in list order
   */
  private _calendarModels(ctx: SchemaCtx): CalendarView.CalendarModel[] {
    const state = this._listState();
    const entities = state.entities;
    const filtering = Filter.isFiltering(this._filter);
    const kept = filtering
      ? new Set(
          this._entrySchemas(this._entrySubform(ctx), ctx)
            .filter(({ schema }) => Filter.hasFields(schema))
            .map(({ index }) => index),
        )
      : undefined;
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
        if (kept !== undefined && !kept.has(row.index)) return [];
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
            tag: this._newEntries.has(row.key) ? this._string(ctx, 'split.new') : undefined,
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
   * @param present - The fields the entry's page draws, for a color whose mode's control holds it
   * @returns The wrapper and its form; a color's control (`_renderEntryColor`)
   */
  private _renderEntryField(
    field: IndexedField,
    key: number,
    data: Record<string, unknown>,
    ctx: SchemaCtx,
    present?: ReadonlyMap<FieldId, IndexedField>,
  ): TemplateResult {
    const spec = this._entryColors(ctx).specs.get(field.id);
    if (spec !== undefined) {
      // A mode's value is drawn inside its mode's control, wherever both are drawn.
      if (spec.mode !== undefined && field.id === spec.value && present?.has(spec.mode)) {
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
          ${this._renderEntryColor(key, field.id, ctx)}
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
      this._calendarName(Synthetic.entityIdOf(this._entryOf(key) ?? '')),
    );
    if (words !== undefined) return this._jumpedEntryField(ctx, key, field, words);
    const schema = this._intern(slot, field.lifted);
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
          .computeLabel=${this._labeler(ctx.language, field.labelPath)}
          .computeHelper=${this._subformHelper(ctx, field.labelPath, true)}
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
      ${this._wordToggle({ kind: 'entry', key }, field, own, ctx)}
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
   * @returns The control
   */
  private _renderVisibility(
    field: IndexedField,
    key: number,
    entry: string | Types.EntityConfig,
    data: Record<string, unknown>,
    ctx: SchemaCtx,
  ): TemplateResult {
    const entityId = Synthetic.entityIdOf(entry);
    const conditions = conditionsEditorDefined()
      ? this._conditionsFor(key, entityId, Entities.asEntityConfig(entry).visibility)
      : undefined;
    if (conditions === undefined) {
      // Defined before this editor opens wherever Home Assistant's card editor is; should it
      // arrive later, it takes over the YAML box then.
      awaitConditionsEditor(this);
      return this._renderEntryField(field, key, data, ctx);
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
      const opening = structuredClone(this._rawConfig);
      this._lastDispatched = opening;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: opening } }));
    }
    if (focus) {
      void this.updateComplete.then(() =>
        Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('split-row'), '.page-title']),
      );
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
        interpolate(this._string(ctx, 'split.named'), { name }),
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
    this._say(interpolate(this._string(ctx, 'split.done'), { name }));
    void this.updateComplete.then(() =>
      Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('split-done')]),
    );
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
    const jump = {
      target: { kind: 'entry-field' as const, id, key },
      label: this._string(this._ctx, `entity.${id.slice(id.indexOf(':') + 1)}`),
      lit: true,
    };
    this._jump = jump;
    void this.updateComplete.then(() => {
      const field = this.renderRoot.querySelector<HTMLElement>('.jump');
      if (field) Focus.scrollToTopSettled(this, field);
      Focus.focusFirst(field ?? this.renderRoot, ['[tabindex="-1"]', '.page-title']);
      setTimeout(() => {
        if (this._jump === jump) this._jump = { ...jump, lit: false };
      }, 2000);
    });
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
    return interpolate(this._string(ctx, part === 0 ? 'row.only' : 'row.without'), {
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
        ? interpolate(this._string(ctx, 'split.color_now'), { name })
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
   * @returns The row or the task; nothing while searching
   */
  private _renderSplit(key: number, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const session = this._split;
    if (session?.key === key) return this._renderSplitTask(session, ctx);
    if (Filter.isFiltering(this._filter)) return nothing;
    const entry = this._entryOf(key);
    if (entry === undefined) return nothing;
    return SplitView.splitRow(
      this._string(ctx, 'split.title'),
      this._string(ctx, 'split.row_helper'),
      interpolate(this._string(ctx, 'split.named'), { name: this._entryName(key) }),
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
    const t = (key: string): string => this._string(ctx, key);
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
      title = interpolate(t('split.named'), { name });
      intro = interpolate(t('split.how.intro'), { name, entity: entityId });
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
        intro = interpolate(t('split.colors.intro'), { name });
        body = [0, 1].map((part) =>
          SplitView.partCard(
            head(part, interpolate(t('split.part_of'), { part: String(part + 1), total: '2' })),
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
        intro = interpolate(t('split.review.intro'), { name });
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
              ? [interpolate(t('split.review.loading'), { name })]
              : result === undefined
                ? [interpolate(t('split.review.failed'), { name })]
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
                : interpolate(t('split.review.counts'), { days, count: String(result.count) }),
              lines,
              writes,
            ),
          );
        })}
        ${
          Array.isArray(own.visibility) && own.visibility.length > 0
            ? SplitView.note(interpolate(t('split.review.conditions'), { name }))
            : nothing
        }
        ${SplitView.note(interpolate(t('split.review.note'), { name }))}`;
        next = {
          label: t('split.apply'),
          focus: 'split-apply',
          name: interpolate(t('split.named'), { name }),
          onPress: () => this._applySplit(),
        };
      }
    }
    return SplitView.splitTask({
      name: t('split.title'),
      steps,
      step: session.step,
      stepOf: interpolate(t('split.step_of'), { step: String(session.step + 1), total: '3' }),
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
    const t = (key: string): string => this._string(ctx, key);
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
          : interpolate(t('split.locked'), {
              field: t(`entity.filter_field.option.${locked}.label`),
            }),
      words: interpolate(t('split.words_note'), {
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
    const t = (each: string): string => this._string(ctx, each);
    const name = this._calendarName(Synthetic.entityIdOf(first));
    const close = (): void => {
      this._splitDone = undefined;
      void this.updateComplete.then(() => Focus.focusFirst(this.renderRoot, ['.page-title']));
    };
    const row = (entryKey: number, entry: string | Types.EntityConfig): SplitView.DoneRow => {
      const parts = CalendarList.rowParts(entry, ctx.language);
      const label = Entities.asEntityConfig(entry).label;
      return {
        key: entryKey,
        title: `${name}${Summary.SUMMARY_SEPARATOR}${parts[0]}`,
        summary: [
          ...parts.slice(1),
          interpolate(t('summary.set'), { count: String(CalendarList.setCount(entry)) }),
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
      interpolate(t('split.done'), { name }),
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
    const groups = ENTRY_GROUPS.flatMap((heading) => {
      const fields = this._fieldsOf(heading.fields, present, new Set(present.keys()));
      if (fields.length === 0) return [];
      const body = html`${heading.extras?.includes('split') ? this._renderSplit(key, ctx) : nothing}
      ${repeat(
        fields,
        (field) => field.id,
        (field) =>
          field.id === `calendar:${VISIBILITY}`
            ? this._renderVisibility(field, key, entry, data, ctx)
            : this._renderEntryField(field, key, data, ctx, present),
      )}`;
      return [
        PageView.headingBlock({
          title: this._headingTitle(heading, ctx),
          key: heading.key,
          helper:
            heading.helperKey === undefined ? undefined : this._string(ctx, heading.helperKey),
          body,
        }),
      ];
    });
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
      ${groups.length > 0 ? groups : Filter.isFiltering(this._filter) ? this._renderNoMatches(ctx) : nothing}
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
   * @param fields - Fields currently shown
   * @param ctx - Editing context
   * @returns Per-option reset buttons, or nothing
   */
  private _renderResetControls(
    fields: ReadonlyArray<IndexedField>,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const view = this._destinationView(ctx);
    if (view === undefined) return nothing;
    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];
    if (blockKey === undefined) return nothing;
    const stored = Value.storedViewBlocks(this._config!)[blockKey];
    if (!stored || typeof stored !== 'object') return nothing;
    const seen = new Set<string>();
    // Each with the field it belongs to, whose wrapper Undo focuses once the value is back.
    const shown = fields.flatMap((field) =>
      [...Routing.workspaceFields(field.lifted)].map((each) => ({ ...each, id: field.id })),
    );
    const resets = shown.flatMap(({ node, path, labelPath, id }) => {
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
      return [{ keys, id, label: EditorLocalize.computeLabel(ctx.language, node, labelPath) }];
    });
    if (resets.length === 0) return nothing;
    return html`
      <div class="view-resets">
        ${resets.map(
          ({ keys, id, label }) => html`
            <button
              type="button"
              class="text-button"
              data-reset-keys=${keys.join(' ')}
              @click=${() => this._resetViewValues(blockKey, view, keys, label, id)}
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
   * @param label - The field's label, which names the undo step
   * @param fieldId - The field, whose wrapper Undo and Redo focus
   */
  private _resetViewValues(
    blockKey: keyof Types.Config,
    view: Types.EffectiveView,
    keys: ReadonlyArray<string>,
    label: string,
    fieldId: FieldId,
  ): void {
    if (!this._config) return;
    this._commit(
      interpolate(this._string(this._ctx, 'history.reset'), { setting: label }),
      undefined,
      () => this._resetValues(blockKey, view, keys),
      `field:${fieldId}`,
    );
  }

  /**
   * `_resetViewValues`' change itself.
   *
   * @param blockKey - View's storage block
   * @param view - View whose value is reset
   * @param keys - Options controlled by the field
   */
  private _resetValues(
    blockKey: keyof Types.Config,
    view: Types.EffectiveView,
    keys: ReadonlyArray<string>,
  ): void {
    if (!this._config || !this._prepareForWrite()) return;
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
          !this._exists(route) || (page === undefined && route.kind !== 'entry')
            ? this._renderOverview(ctx, chassis)
            : keyed(
                Navigation.routeKey(route),
                route.kind === 'entry'
                  ? this._renderEntryPage(route.key, ctx)
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
        ${this._renderHistory(ctx)}
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
      // overview's essentials, and beside Customized Only it keeps everything the card sets,
      // which is everything Customized Only keeps.
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
