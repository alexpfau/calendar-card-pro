/**
 * The editor element: the overview, one page per section, and the `<ha-form>` changes they
 * mediate. Schemas name Home Assistant selectors rather than concrete input elements, because HA
 * renames its components without notice; the editor draws its own rows, headings and radio
 * groups through `views/`.
 */

import {
  mdiArrowDown,
  mdiArrowUp,
  mdiCallSplit,
  mdiCheck,
  mdiClose,
  mdiContentCopy,
  mdiContentDuplicate,
  mdiContentPaste,
  mdiCreation,
  mdiDeleteOutline,
  mdiFormatListChecks,
  mdiFormatVerticalAlignTop,
  mdiInformationOutline,
  mdiPlus,
  mdiRestore,
  mdiTuneVariant,
} from '@mdi/js';
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
import { docsUrl } from './docs-pages';
import * as Entities from './entities';
import {
  type FieldId,
  type FieldIndex,
  type IndexedField,
  buildFieldIndex,
  builtSchema,
  buttonFieldIndex,
  entityFieldIndex,
  entrySchemaAcross,
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
import * as HiddenDetails from './hidden-details';
import { History, type MigrationState, type Snapshot } from './history';
import * as EditorLocalize from './localize';
import * as Misplaced from './misplaced';
import * as Navigation from './navigation';
import {
  type Appearance,
  CALENDARS_BLOCK,
  ENTRY_GROUPS,
  FAMILIES,
  type FamilyId,
  type HeadingDef,
  PAGES,
  type PageDef,
  type PageId,
  STARTING_LAYOUT_BLOCK,
  WHOLE_CARD_PAGES,
  keepsNoLayoutCopy,
  placementOf,
  topicsFor,
} from './pages';
import { PANELS, type PanelExtra, type SchemaCtx, type SubformDef } from './panels';
import * as Plan from './plan';
import * as Prefs from './prefs';
import * as Preview from './preview';
import * as QuickSetup from './quick-setup';
import * as Reorder from './reorder';
import * as Reset from './reset';
import * as Routing from './routing';
import { TOOLBAR_BUTTON_PATH, buildToolbarButtonSchema } from './schemas/card';
import { ENTITY_TRISTATE_STORED, VISIBILITY, buildEntitySchema } from './schemas/entity';
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
import { EDITOR_STRINGS, interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Summary from './summary';
import * as Synthetic from './synthetic';
import * as EditorLanguages from './translations/loader';
import * as Unset from './unset';
import * as Value from './value';
import * as AuditView from './views/audit';
import * as CalendarView from './views/calendars';
import * as ChipsView from './views/chips';
import * as ColorView from './views/color';
import * as Focus from './views/focus';
import * as HistoryView from './views/history';
import { icon } from './views/icon';
import { escapeAction, historyKey, inTextField } from './views/keys';
import * as MenuView from './views/menu';
import * as Overview from './views/overview';
import * as PageView from './views/page';
import * as PickView from './views/pick';
import * as QuickSetupView from './views/quick-setup';
import * as ReorderView from './views/reorder';
import { ScopePreview } from './views/scope-preview';
import { scrollContainer } from './views/scroll';
import * as SearchView from './views/search';
import * as ShownView from './views/shown';
import * as SplitView from './views/split';
import * as Wizard from './views/wizard';
import { WEATHER_ENTITY } from './weather-fields';
import * as WordLists from './word-lists';
import * as Workspace from './workspace';
import * as WriteFrames from './write-frames';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as WeatherMigration from '../../config/weather-migration';
import { loadIntlLocaleData } from '../../translations/intl-locale-data';
import * as LanguageCodes from '../../translations/language-codes';
import { configuredCalendarName } from '../../utils/calendar-names';
import * as EntityColors from '../../utils/entity-colors';
import * as Helpers from '../../utils/helpers';
import * as Logger from '../../utils/logger';

/** How many entries the list holds before Filter Calendars appears above it. */
const CALENDAR_FILTER_ROWS = 8;

/** The settings Quick Setup's review lists Apply replacing before Show All. */
const REVIEW_SHOWN = 5;

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

/**
 * The schema context for a scope: what every schema builder reads.
 *
 * @param rawConfig - The configuration as stored
 * @param workspace - The scope
 * @param language - The language the editor draws in (`CalendarCardProEditor._language`)
 * @param held - The mode choices held for the scope (`_heldModes`)
 * @returns Schema context
 */
function scopeCtx(
  rawConfig: Types.Config,
  workspace: Workspace.EditorWorkspace,
  language: string,
  held: string,
): SchemaCtx {
  const config = Routing.workspaceConfig(rawConfig, workspace);
  // Shared has no layout of its own, so its panels are built as list — the base every
  // other view widens. `config.view` stays the card's real displayed view, because that
  // is the value the Starting Layout control edits; see `baseViewForWorkspace`.
  const view = Workspace.baseViewForWorkspace(workspace);

  return {
    view,
    workspace,
    config,
    rawConfig,
    language,
    presentation: JSON.parse(held) as Record<string, string>,
  };
}

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
 * One run of Split This Calendar on an entry's page, from opening it to Split or
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

/** Start Date's mode, drawn as the overview's chips. */
const START_DATE_FIELD: FieldId = 'content:start_date_mode';

/** Start Date's Expression, which Relative to Today reveals. */
const START_DATE_EXPRESSION: FieldId = 'content:start_date_offset';

/** Tapping an Event Opens It, which gives way to a line while another action is stored. */

/** Calendar Filter: a toolbar chip, whose form is its qualifier line under the chips. */
const LEGEND_FIELD = Chips.LEGEND_FIELD;

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

/** A list whose rows reorder: the calendars, or the toolbar's own buttons. */
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

/**
 * The helper under an action field. Home Assistant's `ui_action` selector draws none, whatever
 * `computeHelper` returns, so Tapping an Event and a toolbar button's Tap Action draw their own.
 *
 * @param field - The field
 * @param helper - Its helper
 * @returns The line, or nothing for any other selector
 */
function actionHelper(field: IndexedField, helper: string | undefined): unknown {
  return helper && 'ui_action' in field.node.selector
    ? html`<p class="hint action-helper">${helper}</p>`
    : nothing;
}

/**
 * The line a removal or an applied story leaves under its list ("Removed Ben · Undo"), or the
 * receipt the upgrade on opening leaves at the top of the overview.
 */
interface StatusLine {
  readonly kind: 'entry' | 'button' | 'story' | 'upgrade' | 'audit';
  readonly text: string;
  /** The removed calendar's place among the calendars, where the line stands in the list. */
  readonly at: number;
  /** For a line reset on Stored Settings, its group's key, atop which the line stands. */
  readonly group?: string;
  /** The upgrade's options, the editor before it, and whether they were shared since. */
  readonly upgrade?: {
    readonly keys: ReadonlyArray<string>;
    readonly before: Snapshot;
    readonly shared: boolean;
    /** Whether the card looks as it did: so after the upgrade, and no longer once shared since. */
    readonly same: boolean;
    /** Whether the upgrade wrote anything, which Undo then takes back. */
    readonly wrote: boolean;
    /** The calendars that hide a field an event's details now show, by entry key. */
    readonly hidden: ReadonlyArray<{
      readonly key: number;
      readonly fields: ReadonlyArray<HiddenDetails.DetailField>;
    }>;
    /** What converting the weather written before v6 did, where the upgrade converted it. */
    readonly weather?: WeatherMigration.WeatherMigrationResult;
  };
}

/**
 * Whether a setting is a plain switch, whose head row starts with Home Assistant's own switch row
 * rather than its name: a boolean no control of the editor's own is composed for.
 *
 * @param field - The field
 * @returns Whether it is
 */
function isSwitchRow(field: IndexedField): boolean {
  return (
    'boolean' in field.node.selector &&
    field.id !== LEGEND_FIELD &&
    !(field.id in Chips.CHIP_LABELS)
  );
}

/** What a live field shows besides its control: its state words, and the line under it. */
interface FieldShow {
  readonly words?: string;
  readonly line: TemplateResult | typeof nothing;
  /** The setting's head row, which its heading draws above its control (`_settingShow`). */
  readonly head?: ShownView.SettingHead;
  /** Whether the control is drawn below the head. */
  readonly open?: boolean;
  /** Whether Home Assistant's own switch row starts the head, a switch's only control. */
  readonly switchRow?: boolean;
  /** The helper's element id: the helper sits behind ⓘ, so the form draws none of its own. */
  readonly describedBy?: string;
  /**
   * Whether it is drawn without its page, as search's Edit Here draws it, so a control that
   * reveals another (Start Date's A Fixed Date and Relative to Today) brings it along.
   */
  readonly alone?: boolean;
  /**
   * The words read with the setting's name (`views/shown.ts` › `spokenFacts`): the facts under it,
   * then its "Default".
   */
  readonly facts?: ReadonlyArray<string>;
}

/**
 * What a field's wrapper is named: the setting's name, then the facts under it and its "Default",
 * each a phrase of its own, as its folded row is named. They are in the name, never in the
 * description: accessible-name computation joins what a description names with a bare space, so
 * described together they ran into the helper as one sentence ("Default Large makes them
 * bigger…").
 *
 * @param name - The setting's name
 * @param show - What the field shows besides its control
 * @returns The name
 */
function groupName(name: string, show: FieldShow | undefined): string {
  return ShownView.spokenName([name, ...(show?.facts ?? [])]);
}

/**
 * What a field's wrapper is described by: its helper behind ⓘ, and nothing else.
 *
 * @param show - What the field shows besides its control
 * @returns The helper's id, or nothing
 */
function describedBy(show: FieldShow | undefined): string | typeof nothing {
  return show?.describedBy ?? nothing;
}

/** Whose page a heading is planned for: the card's, or one calendar entry's, by its key. */
type PlanOwner = { readonly kind: 'card' } | { readonly kind: 'entry'; readonly key: number };

const CARD: PlanOwner = { kind: 'card' };

/** Below this width of its own, the editor draws its narrow layout. */
const NARROW_WIDTH = 440;

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

  /** Whether the editor is narrower than `NARROW_WIDTH`, a phone's dialog: its `narrow` attribute. */
  private _narrow = false;

  private _widthObserver?: ResizeObserver;

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === 'undefined') return;
    this._widthObserver ??= new ResizeObserver(() => {
      const root = this.renderRoot.querySelector('.card-config');
      const width = root?.getBoundingClientRect().width ?? 0;
      const narrow = width > 0 && width < NARROW_WIDTH;
      if (narrow !== this._narrow) {
        this._narrow = narrow;
        this.toggleAttribute('narrow', narrow);
      }
      this._fitSwitchRows();
    });
  }

  /** Watches the editor's own width and each switch row's control, which Home Assistant draws. */
  private _watchSizes(): void {
    const observer = this._widthObserver;
    if (!observer) return;
    const root = this.renderRoot.querySelector('.card-config');
    if (root) observer.observe(root);
    for (const control of this.renderRoot.querySelectorAll(
      '.setting-head.switch .setting-control',
    )) {
      observer.observe(control);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._widthObserver?.disconnect();
    // Leaving the visual editor, for the code editor or by closing the dialog, cancels a split
    // that has not been made, so the preview is never what is kept.
    this._cancelSplit(false);
    awaitingConditionsEditor.delete(this);
    this._drag?.cancel();
    this._endPick(false);
    clearTimeout(this._pickRetry);
    this._pickRetry = undefined;
    // The code editor keeps the preview, which goes back to the layout the card opens in.
    this._scopePreview.sync(undefined);
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
    // Quick Setup's answers name calendars and a weather entity its steps draw by name.
    const answers = this._quickSetup?.answers;
    const ids = HassKey.editorEntityIds(
      this._config,
      answers === undefined ? [] : [...answers.calendars, answers.weather],
    );
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
   * A fresh card opens from Home Assistant's card picker, which hands focus to the edit dialog's
   * frame a moment after the editor first draws, and then drops it on the page's body. The editor
   * puts it on Start From an Example, its first control, so the keyboard starts inside the dialog.
   * It watches for a second, frame by frame, and stops at the first focus on a control anywhere:
   * what Home Assistant or the user focused stays focused.
   */
  private _greet(): void {
    // Not before the editor has drawn: its first render waits for its language (`_language`).
    if (this._greeted || !this._config || this._drawnLanguage === undefined) return;
    this._greeted = true;
    if (!this._banner) return;
    const until = Date.now() + 1000;
    const greet = (): void => {
      Focus.focusFirst(this.renderRoot, [Focus.byFocusKey('quick-setup')]);
    };
    const step = (): void => {
      if (!this.isConnected) return;
      const active = Focus.deepActive();
      if (active === undefined) return greet();
      // Still the picker, or the dialog's frame rather than a control in it.
      const passing =
        active.localName === 'dialog' || Focus.within(active, 'hui-dialog-create-card');
      if (!passing) return;
      if (Date.now() < until) requestAnimationFrame(step);
      else if (active.localName === 'dialog') greet();
    };
    step();
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
  /**
   * Fits each switch's head to the lines Home Assistant's label takes: Home Assistant draws its
   * switch row at least 56 px tall with its label at the top, so the box is moved down to center
   * a one-line label in the 44 px head, and the empty part below the label is taken back. A label
   * that wraps keeps every line it takes, so nothing spills into the row below.
   */
  private _fitSwitchRows(): void {
    for (const control of this.renderRoot.querySelectorAll<HTMLElement>(
      '.setting-head.switch .setting-control',
    )) {
      const box = control.getBoundingClientRect();
      if (box.height === 0) continue;
      let bottom = 0;
      const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.nodeValue?.trim()) return;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) bottom = Math.max(bottom, rect.bottom);
          return;
        }
        const element = node as Element;
        if (element.shadowRoot) walk(element.shadowRoot);
        for (const child of node.childNodes) walk(child);
      };
      walk(control);
      // Unknown until Home Assistant has drawn its label: the whole box stays.
      const take = bottom === 0 ? 0 : Math.max(0, Math.floor(box.bottom - bottom - 12));
      control.style.marginBottom = `${-take}px`;
    }
  }

  protected override updated(): void {
    // A switch row is fitted once Home Assistant has drawn it, as the observer reports its size.
    this._watchSizes();
    // Written once attached, where Home Assistant hears it: `setConfig` comes while detached.
    if (this._pendingUpgrade && this.hass && this.isConnected) {
      this._pendingUpgrade = false;
      this._upgradeOnOpen();
    }
    this._syncPick();
    this._greet();
    this._scopePreview.sync(this._previewedScope());
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

  /** Whether the overview header's ⋯ menu, which holds the preferences, is open. */
  @state() private _prefsOpen = false;

  /**
   * The place Search Settings in a page header left for the overview's search field, which the
   * overview's Back and Escape in an empty field return to: where the editor was, its scroll
   * position and its name.
   */
  @state() private _searchFrom?: {
    readonly nav: Navigation.NavState;
    readonly scrollTop: number;
    readonly name: string;
  };

  /**
   * The settings added this session, which their pages draw although nothing is stored: field
   * ids, `family:<id>`, `entry:<key>:<id>`, `entry:<key>:family:<id>` (`plan.ts`). A choice of
   * what to look at, so outside the undo snapshot and outside any storage; replaced, never
   * changed in place, so a render sees it move.
   */
  @state() private _added: ReadonlySet<string> = new Set();

  /** The Add row open, by its `data-focus` key, and what its box narrows it to. */
  /** The settings whose helper is shown behind its ⓘ, by added-set key. */
  @state() private _helpOpen: ReadonlySet<string> = new Set();

  @state() private _gridReconciliation: ReadonlyArray<string> = [];

  @state() private _migration: MigrationState = { kind: 'current' };
  /** Whether Quick Setup's review lists every setting Apply replaces, not only the first few. */
  @state() private _reviewAll = false;
  /** A card whose root options v5 split arrived, so the editor upgrades it once attached. */
  private _pendingUpgrade = false;
  /**
   * The calendar Home Assistant's card picker starts a new card with, the first it lists, as it
   * was when the configuration arrived (`quick-setup.ts` › `startedWith`).
   */
  private _pickerCalendar?: string;

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

  /**
   * Calendar Filter's form last named this session, by the YAML the editor holds or by its
   * qualifier line, which pressing its chip on writes; Menu, the default, until one is named.
   */
  private _legendForm?: Types.ToolbarLegendMode;

  /** Draws the preview in the layout being edited (`views/scope-preview.ts`). */
  private _scopePreview = new ScopePreview(() => PickView.findPreviewCard(this), this);

  /**
   * Whether Quick Setup's banner shows: decided by the session's first configuration, a fresh
   * card's, and kept until Quick Setup is applied or the banner dismissed.
   */
  @state() private _banner?: boolean;

  /** Whether a fresh card's first focus has been placed, which happens once per editor. */
  private _greeted = false;

  /**
   * The line Stored Settings is editing in place, and its group: kept drawn while it is
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

  /** Whether Home Assistant's dialog shows the card beside the editor, so a pick can be made. */
  @state() private _canPick = false;

  /** The place a pick was turned on at, while it is on; a move anywhere else ends it. */
  @state() private _pickingAt?: string;

  /** How many more times a missing preview is looked for (`_syncPick`). */
  private _pickLooks = 4;

  /** The next look for a missing preview, while one is waiting; cleared as the editor closes. */
  private _pickRetry?: ReturnType<typeof setTimeout>;

  /** Pick From Preview in the preview (`views/pick.ts`). */
  private _picker = new PickView.PreviewPicker({
    label: (part, touch) =>
      this._string(this._ctx, touch ? 'pick.tap' : 'pick.click', {
        label: this._pickName(part),
      }),
    pick: (part) => this._pickPart(part),
    cancel: () => this._endPick(true),
    find: () => PickView.findPreviewCard(this),
  });

  /** The jump list's count line, as the last render drew it, announced as the query changes. */
  private _resultStatus = '';

  /** Edit Here: the card settings found are drawn as their live controls. */
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
    return Routing.startingView(config);
  }

  /**
   * The layout being edited, which the place says: a layout's page and its topics are that
   * layout's (Layout Defaults is `shared`), and Whole Card's pages edit the whole card, in the
   * shared scope, where every value they hold is written. The overview's search, opened from a
   * layout's page, searches that layout, so a result opens where the search began. Anywhere else,
   * a calendar's page, the overview and Stored Settings, it is the layout the card opens in.
   */
  private get _workspace(): Workspace.EditorWorkspace {
    const route = this._nav.route;
    const scope = Navigation.routeScope(route);
    if (scope !== undefined) return scope;
    const searched = this._searchFrom && Navigation.routeScope(this._searchFrom.nav.route);
    if (route.kind === 'overview' && searched !== undefined) return searched;
    if (route.kind === 'page' && WHOLE_CARD_PAGES.has(route.page)) return 'shared';
    return this._viewForConfig(this._config!);
  }

  /**
   * A calendar entry's page, opened for one of its fields. The page is built for the card's
   * layouts whatever page the editor was on, so a route names a layout only where a result adds
   * one none of them is: for an option only that layout applies.
   *
   * @param key - The entry's key
   * @param scope - The layout the result adds, where it does
   * @returns The entry's route
   */
  private _entryRoute(key: number, scope?: Workspace.EditorWorkspace): Navigation.Route {
    return scope === undefined || scope === this._entryBase()
      ? { kind: 'entry', key }
      : { kind: 'entry', key, scope };
  }

  /**
   * The workspace a calendar's page is built in: the layout a result added on its route, else
   * `_entryBase`, whatever page a search began on.
   *
   * @returns The workspace
   */
  private _entryWorkspace(): Workspace.EditorWorkspace {
    const route = this._nav.route;
    return route.kind === 'entry' && route.scope !== undefined ? route.scope : this._entryBase();
  }

  /**
   * The workspace a calendar's page is built in with no layout added: the layout the card opens
   * in.
   *
   * @returns The workspace
   */
  private _entryBase(): Workspace.EditorWorkspace {
    return this._viewForConfig(this._config!);
  }

  /**
   * The layout the preview draws where the editor is: the one being edited, or, on Whole Card's
   * pages, which edit in the shared scope, the layout the card opens in, as the preview shows it.
   * On Stored Settings, the scope of the line being changed in place, as `_previewedScope` draws
   * it. A topic opened from there opens under it.
   */
  private get _layoutInView(): Workspace.EditorWorkspace {
    const route = this._nav.route;
    const edited = this._auditEdit?.group.workspace;
    if ((route.kind === 'audit' || route.kind === 'notices') && edited !== undefined) {
      return edited;
    }
    const whole = route.kind === 'page' && WHOLE_CARD_PAGES.has(route.page);
    return whole ? this._viewForConfig(this._config!) : this._workspace;
  }

  /**
   * A place as it is opened: a topic page with no layout named opens under the layout being
   * edited, so every topic page is some layout's.
   *
   * @param route - The place
   * @param scope - The layout, where it is not the one being edited
   * @returns The place, under a layout where it is a topic
   */
  private _scoped(
    route: Navigation.Route,
    scope: Workspace.EditorWorkspace = this._layoutInView,
  ): Navigation.Route {
    if (route.kind !== 'page' || WHOLE_CARD_PAGES.has(route.page)) return route;
    const under = route.scope ?? scope;
    // A topic the scope has no page for, as Layout Defaults has no Weather, opens under the
    // layout the card opens in.
    return topicsFor(under).some((each) => each.id === route.page)
      ? { ...route, scope: under }
      : { ...route, scope: this._viewForConfig(this._config!) };
  }

  /**
   * The layout the preview draws other than the one the card opens in: the layout being edited.
   * That is the scope, on the overview and on every page; on Stored Settings, the layout of
   * the line being edited in place, and the card as it opens while none is. Quick Setup and Split
   * preview their own answers, and All Layouts is no layout of its own, so it previews the card as
   * it opens, with every layout's own values.
   *
   * @returns The layout and the configuration it is laid over, or `undefined`
   */
  private _previewedScope():
    { view: Types.EffectiveView; config: Record<string, unknown> } | undefined {
    if (!this._config) return undefined;
    if (this._quickSetup !== undefined || this._split !== undefined) return undefined;
    const kind = this._nav.route.kind;
    const edited =
      kind === 'audit' || kind === 'notices'
        ? (this._auditEdit?.group.workspace ?? 'shared')
        : this._workspace;
    const view = Workspace.viewForWorkspace(edited);
    if (view === undefined || view === this._viewForConfig(this._config)) return undefined;
    return { view, config: this._previewConfig(this._rawConfig, view) };
  }

  /**
   * The configuration a layout is previewed with: as written, except that a layout the card's
   * switcher does not offer is drawn without the switcher, which the card would never show beside
   * it. Kept while the configuration is, so the preview is configured once per change.
   */
  private _previewConfig = Helpers.memoizeLast(
    (raw: Record<string, unknown>, view: Types.EffectiveView): Record<string, unknown> => {
      const offered = Config.switcherOffers({
        toolbar: raw.toolbar as Types.Config['toolbar'],
        view: this._viewForConfig(this._config!),
      });
      if (offered.length === 0 || offered.includes(view)) return raw;
      const toolbar = Helpers.isConfigBlock(raw.toolbar) ? raw.toolbar : {};
      return { ...raw, toolbar: { ...toolbar, view_switcher: false } };
    },
  );

  /**
   * The preview line, where the preview draws another layout than the card opens in: "Preview
   * shows Grid · The card opens in Month".
   *
   * @param ctx - Schema context
   * @returns The sentence, or `undefined` where the preview shows the card as it opens
   */
  private _previewSentence(ctx: SchemaCtx): string | undefined {
    const previewed = this._previewedScope()?.view;
    if (previewed === undefined) return undefined;
    return this._string(ctx, 'settings_for.preview', {
      layout: this._layoutTitle(previewed, ctx),
      displayed: this._layoutTitle(this._viewForConfig(this._config!), ctx),
    });
  }

  /**
   * The preview line: on a layout's page and its topics, a page for the whole card, a calendar's
   * page, and above the overview's search results. Stored Settings draws none: a line edited there
   * previews its own layout, which its group's title names, and a line drawn above it would move
   * it.
   *
   * @param ctx - Schema context
   * @returns The line, or nothing where the preview shows the card as it opens
   */
  private _renderPreviewLine(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const sentence = this._previewSentence(ctx);
    return sentence === undefined ? nothing : Overview.previewLine(sentence);
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
      this._pendingUpgrade =
        this._migration.kind === 'ambiguous' ||
        WeatherMigration.convertsDrawnWeather(rawConfig) ||
        (this._migration.kind === 'automatic' && HiddenDetails.hiddenDetails(rawConfig).length > 0);
    }
    // Found once, where the walk over every state is not part of a render the key could skip.
    if (!isEcho) this._pickerCalendar = QuickSetup.firstCalendar(this.hass?.states);

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
      this._pending = {};
      this._gridReconciliation = [];
      this._gridResetKeys.clear();
      // The page open may be gone from the card: a calendar entry's that was removed.
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

    // Blocks only the layered format has: a card carrying one was written for it already.
    const alreadyLayered =
      version.version === undefined &&
      (Helpers.isConfigBlock(rawConfig.list) ||
        Helpers.isConfigBlock(rawConfig.time_grid) ||
        Helpers.isConfigBlock(rawConfig.month));
    if (alreadyLayered) return { kind: 'automatic' };

    const keys = Value.ambiguousRootKeys(rawConfig);
    const block = ViewConfig.viewBlockFor(this._viewForConfig(this._config!));
    const ambiguous =
      block === ViewConfig.VIEW_BLOCKS.list || block === ViewConfig.VIEW_BLOCKS.grid;
    return ambiguous && keys.length > 0 ? { kind: 'ambiguous', keys } : { kind: 'automatic' };
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
   * Accepts a write and prepares any pending migration: a card without layout blocks shares its
   * root options, and one whose root options v5 split keeps them for List, as the upgrade on
   * opening does (`_upgradeOnOpen`), here after an Undo of it.
   *
   * @returns Whether configuration editing is allowed
   */
  private _prepareForWrite(): boolean {
    const kind = this._migration.kind;
    if (kind === 'future' || kind === 'invalid') {
      Logger.debug('Ignoring an editor write while migration is blocked', kind);
      return false;
    }
    if (kind === 'automatic') this._adoptMigration(this._migrationResult('shared-root'));
    if (kind === 'ambiguous') this._adoptMigration(this._migrationResult(this._upgradeMode()));
    this._convertWeather();
    return true;
  }

  /**
   * What the upgrade does with the root options v5 split: keeps them List's, where every layout
   * the card can show looks the same for it, or shares them with every layout, which changes none
   * (`Value.upgradeMode`).
   *
   * @returns The migration mode
   */
  private _upgradeMode(): Value.ListMigrationMode {
    return Value.upgradeMode(
      Value.toStoredConfig(this._config!, this._authoredRootKeys, this._rawConfig),
      this._rawConfig ?? {},
    );
  }

  /**
   * Converts the weather written before v6 into weather per layout (`migrateWeatherFormat`) and
   * makes the result the editor's local truth, where the YAML still holds a top-level `weather:`
   * block. The editor writes weather per layout only, so every write starts from a converted card.
   *
   * @returns What converting did, or `undefined` where there was nothing to convert
   */
  private _convertWeather(): WeatherMigration.WeatherMigrationResult | undefined {
    if (!Helpers.isConfigBlock(this._rawConfig?.weather)) return undefined;
    const result = WeatherMigration.migrateWeatherFormat(
      Value.toStoredConfig(this._config!, this._authoredRootKeys, this._rawConfig),
    );
    if (!result.converted) return undefined;
    this._authoredRootKeys.delete('weather');
    for (const key of Object.keys(result.config)) {
      if (!Helpers.hasOwn(this._rawConfig!, key)) this._authoredRootKeys.add(key);
    }
    this._adopt(result.config, result.config);
    return result;
  }

  /**
   * Upgrades a card whose root options v5 split between List and every layout, once the editor
   * is attached and Home Assistant listens: they stay List's, as they were written, so the card
   * looks the same, in one undo step. The receipt says what was kept, offers to share them with
   * every layout, and Undo; nothing moves focus, and the receipt is read out once.
   */
  private _upgradeOnOpen(): void {
    const keys = this._migration.kind === 'ambiguous' ? this._migration.keys : [];
    const weatherDrawn = WeatherMigration.convertsDrawnWeather(this._rawConfig ?? {});
    const legacy = this._migration.kind === 'ambiguous' || this._migration.kind === 'automatic';
    const writes = keys.length > 0 || weatherDrawn;
    // Taken before writing: the upgrade keeps every entry where it was, and so its key.
    const entryKeys = this._entryKeysFor((this._config?.entities ?? []).length);
    const hidden =
      writes || legacy
        ? HiddenDetails.hiddenDetails(this._rawConfig ?? {}).map(({ entry, fields }) => ({
            key: entryKeys[entry],
            fields,
          }))
        : [];
    if (!writes && hidden.length === 0) return;
    const before = this._snapshot();
    const ctx = this._ctx;
    let weather: WeatherMigration.WeatherMigrationResult | undefined;
    const mode = keys.length > 0 ? this._upgradeMode() : 'keep-list';
    const wrote =
      writes &&
      this._commit(this._string(ctx, 'history.upgrade'), undefined, () => {
        if (keys.length > 0) this._adoptMigration(this._migrationResult(mode));
        else if (!this._prepareForWriteWithoutWeather()) return;
        // A block that names no entity is left to the first write, with the list migration's.
        if (weatherDrawn) weather = this._convertWeather();
        // Options v3.0.0 removed stay for the notices page to move, until a change of the user's.
        const kept = Deprecated.keepOld(this._rawConfig!, before.raw ?? {});
        if (kept !== this._rawConfig) this._adopt(kept, kept);
        this._send(this._rawConfig!);
      });
    if (keys.length === 0 && weather === undefined && hidden.length === 0) return;
    const upgrade = {
      keys,
      before,
      shared: mode === 'shared-root',
      same: true,
      wrote,
      hidden,
      weather,
    };
    this._status = { kind: 'upgrade', text: '', at: 0, upgrade };
    this._say(this._upgradeSaid(ctx, upgrade));
  }

  /**
   * What the upgrade receipt reads out: its title and every sentence in it.
   *
   * @param ctx - Schema context
   * @param upgrade - The upgrade
   * @returns The words
   */
  private _upgradeSaid(ctx: SchemaCtx, upgrade: NonNullable<StatusLine['upgrade']>): string {
    return [
      this._upgradeTitle(ctx, upgrade),
      this._upgradeSentences(ctx, upgrade),
      ...upgrade.hidden.map(({ key, fields }) => this._hiddenSentence(ctx, key, fields)),
    ]
      .filter((part) => part !== '')
      .join(' ');
  }

  /**
   * The receipt's title: "Upgraded." where the upgrade wrote, else "Event details changed." for
   * a card it only has calendars to name for.
   *
   * @param ctx - Schema context
   * @param upgrade - The upgrade
   * @returns The title
   */
  private _upgradeTitle(ctx: SchemaCtx, upgrade: NonNullable<StatusLine['upgrade']>): string {
    return this._string(ctx, upgrade.wrote ? 'upgrade.title' : 'upgrade.details_title');
  }

  /**
   * The sentence naming a calendar that hides a field an event's details now show: "Anna hides
   * event locations, but an event's details now show them."
   *
   * @param ctx - Schema context
   * @param key - The entry's key
   * @param fields - What it hides
   * @returns The sentence
   */
  private _hiddenSentence(
    ctx: SchemaCtx,
    key: number,
    fields: ReadonlyArray<HiddenDetails.DetailField>,
  ): string {
    const which = fields.length === 1 ? fields[0] : 'both';
    return this._string(ctx, `upgrade.details_${which}`, { name: this._entryName(key) });
  }

  /**
   * Makes a calendar the upgrade named private, as one undo step, and keeps the receipt with the
   * calendars still to answer: focus goes to the next one's button, else to Undo.
   *
   * @param key - The entry's key
   */
  private _makePrivate(key: number): void {
    const upgrade = this._status?.kind === 'upgrade' ? this._status.upgrade : undefined;
    const entry = this._entryOf(key);
    if (upgrade === undefined || entry === undefined) return;
    const ctx = this._ctx;
    const name = this._entryName(key);
    const done = this._commit(
      this._string(ctx, 'history.change_for', {
        setting: this._string(ctx, 'entity.private'),
        name,
      }),
      undefined,
      () => this._writeFieldValue({ kind: 'entry', key }, 'calendar:private', true),
      `entry:${key}`,
    );
    if (!done) return;
    const hidden = upgrade.hidden.filter((line) => line.key !== key);
    this._status = {
      kind: 'upgrade',
      text: '',
      at: 0,
      upgrade: { ...upgrade, wrote: true, hidden },
    };
    this._say(this._string(ctx, 'upgrade.made_private', { name }));
    this._focusSoon(
      hidden.length > 0
        ? [Focus.byFocusKey(`upgrade-private-${hidden[0].key}`)]
        : [Focus.byFocusKey('status-undo')],
    );
  }

  /**
   * The list migration a write starts with (`_prepareForWrite`), without converting the weather,
   * which the upgrade on opening does itself so it can say what it did.
   *
   * @returns Whether configuration editing is allowed
   */
  private _prepareForWriteWithoutWeather(): boolean {
    const kind = this._migration.kind;
    if (kind === 'future' || kind === 'invalid') return false;
    if (kind === 'automatic') this._adoptMigration(this._migrationResult('shared-root'));
    return true;
  }

  /**
   * Shares the options the upgrade kept for List with every layout, as one undo step from the
   * List upgrade: written from the card as it was before the upgrade, exactly as choosing every
   * layout always wrote it.
   */
  private _shareUpgraded = (): void => {
    const upgrade = this._status?.upgrade;
    if (upgrade === undefined || upgrade.shared) return;
    const { before } = upgrade;
    const ctx = this._ctx;
    this._commit(this._string(ctx, 'history.upgrade_share'), undefined, () => {
      this._adopt(before.raw, structuredClone(before.raw));
      this._authoredRootKeys = new Set(before.authoredRootKeys);
      this._migration = before.migration;
      this._adoptMigration(this._migrationResult('shared-root'));
      this._convertWeather();
      this._send(this._rawConfig!);
    });
    const shared = { ...upgrade, shared: true, same: false, wrote: true };
    this._showStatus(
      { kind: 'upgrade', text: '', at: 0, upgrade: shared },
      this._upgradeSaid(ctx, shared),
    );
  };

  /**
   * The upgrade receipt's sentences after its title: what it kept for List, and what it did with
   * the weather written before v6.
   *
   * @param ctx - Schema context
   * @param upgrade - The upgrade
   * @returns The sentences
   */
  private _upgradeSentences(ctx: SchemaCtx, upgrade: NonNullable<StatusLine['upgrade']>): string {
    const sentences: string[] = [];
    if (upgrade.keys.length > 0) {
      sentences.push(this._upgradeText(ctx, upgrade.keys, upgrade.shared));
      // The List sentences say it themselves; shared on opening, the roots stayed where they were.
      if (upgrade.shared && upgrade.same) sentences.push(this._string(ctx, 'upgrade.same'));
    }
    const weather = upgrade.weather;
    if (weather !== undefined) {
      const layouts = EditorLocalize.formatList(
        ctx.language,
        weather.filled.map((view) => this._string(ctx, `view.option.${view}.label`)),
        'conjunction',
      );
      sentences.push(
        // Only a block the card drew keeps what it showed; options beside `weather_entity` are
        // new to the layouts they fill, and say nothing of Month, which keeps its own.
        this._string(
          ctx,
          weather.drawn
            ? 'upgrade.weather'
            : weather.filled.length > 0
              ? 'upgrade.weather_some'
              : 'upgrade.weather_none',
          { layouts },
        ),
      );
      if (weather.dropped.length > 0) {
        sentences.push(
          this._string(ctx, 'upgrade.weather_dropped', {
            lines: EditorLocalize.formatList(ctx.language, weather.dropped, 'conjunction'),
          }),
        );
      }
    }
    return sentences.join(' ');
  }

  /**
   * The upgrade receipt's sentences after its title: "Day Spacing and Event Font Size now apply
   * to List, as before. The card looks the same."
   *
   * @param ctx - Schema context
   * @param keys - The options the upgrade decided
   * @param shared - Whether they were shared with every layout
   * @returns The sentence
   */
  private _upgradeText(ctx: SchemaCtx, keys: ReadonlyArray<string>, shared: boolean): string {
    const options = EditorLocalize.formatList(
      ctx.language,
      keys.map((key) => this._string(ctx, key)),
      'conjunction',
    );
    const key = `upgrade.${shared ? 'shared' : 'list'}${keys.length === 1 ? '_one' : ''}`;
    return this._string(ctx, key, { options });
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
    const where = { route: this._nav.route, focusKey };
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
    const { route, focusKey } = entry.where;
    const before = this._nav.route;
    if (!Navigation.sameRoute(route, this._nav.route)) {
      const from = { route: this._nav.route, scrollTop: Focus.scrollPosition(this) };
      this._nav = Navigation.go(this._nav, route, from);
    }
    // An entry's page the step took away gives way.
    this._nav = Navigation.validate(this._nav, (each) => this._exists(each)).nav;
    // A step taken on another page opens it, and says so.
    const place = Navigation.sameRoute(before, this._nav.route)
      ? undefined
      : this._placeName(this._nav.route);
    const ctx = this._ctx;
    const template =
      place === undefined
        ? way === 'undo'
          ? this._string(ctx, 'history.undone')
          : this._string(ctx, 'history.redone')
        : way === 'undo'
          ? this._string(ctx, 'history.undone_on')
          : this._string(ctx, 'history.redone_on');
    this._say(interpolate(template, { action: entry.label, place: place ?? '' }));
    void this.updateComplete.then(() => this._focusRestored(focusKey));
  }

  /**
   * What a page or a calendar entry's page is called, as its heading names it.
   *
   * @param route - The place
   * @returns Its name, or `undefined` for a place that is not a page
   */
  private _placeName(route: Navigation.Route): string | undefined {
    if (route.kind === 'entry') return this._entryName(route.key);
    if (route.kind === 'layout') return this._layoutTitle(route.layout, this._ctx);
    if (route.kind !== 'page') return undefined;
    const page = PAGES.find((each) => each.id === route.page);
    if (page === undefined) return undefined;
    const title = this._pageTitle(page, this._ctx);
    // A topic is a layout's: "Days in Grid", as its header names it.
    return route.scope === undefined
      ? title
      : this._string(this._ctx, 'audit.in_layout', {
          label: title,
          layout: this._layoutTitle(route.scope, this._ctx),
        });
  }

  /**
   * Puts focus on what Undo or Redo restored: a field's wrapper, a calendar entry's row, a
   * button's row, else the heading of the place shown.
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
    Focus.focusFirst(root, ['.page-title', '.page-group .heading', '.row-group .heading']);
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
    this._focusSoon(
      status.kind === 'audit'
        ? [`[data-heading="${CSS.escape(status.group ?? '')}"] .heading`, '.page-title']
        : [status.kind === 'button' ? '.add-button' : '[data-heading="calendars"] .heading'],
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
    const own =
      key === 'history.undo'
        ? this._string(ctx, 'history.undo')
        : this._string(ctx, 'history.redo');
    // Home Assistant's table can carry the English word untranslated, as its Latvian Redo does;
    // a translation of the editor's own reads better than that.
    const untranslated = word === EDITOR_STRINGS[key] && own !== word;
    if (typeof word === 'string' && word !== '' && word !== haKey && !untranslated) return word;
    return own;
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
    const controls = HistoryView.historyControls(
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
    // Not over a version the editor cannot edit, where nothing a pick opens is drawn.
    const blocked = this._migration.kind === 'future' || this._migration.kind === 'invalid';
    return this._canPick && !blocked
      ? html`${controls}${PickView.pickButton(
          this._string(ctx, 'pick.button'),
          this._pickingAt !== undefined,
          this._togglePick,
        )}`
      : controls;
  }

  /**
   * A page header's actions: Search Settings, then Undo, Redo and Pick From Preview.
   *
   * @param ctx - Schema context
   * @param name - The place's name, which the overview's Back names
   * @returns The actions
   */
  private _renderHeadActions(ctx: SchemaCtx, name: string): TemplateResult {
    return html`${PageView.searchButton(this._string(ctx, 'search'), () =>
      this._searchFromPage(name),
    )}${this._renderHistory(ctx)}`;
  }

  /**
   * Search Settings in a page header: the overview, with focus in its search field and a Back
   * that returns to the page and to the button.
   *
   * @param name - The page's name
   */
  private _searchFromPage(name: string): void {
    const from = { nav: this._nav, scrollTop: Focus.scrollPosition(this), name };
    this._closeDisclosures();
    this._nav = Navigation.OVERVIEW;
    this._jump = this._resultsLeft = undefined;
    this._searchFrom = from;
    void this._focusSearchField();
  }

  /**
   * Focuses the overview's search field once it is drawn: Home Assistant draws its box a few
   * frames after the form, so it is looked for until it is there, for at most half a second.
   */
  private async _focusSearchField(): Promise<void> {
    await this.updateComplete;
    for (let frame = 0; frame < 30; frame++) {
      const form = this.renderRoot.querySelector('ha-form.filter-form');
      if (form === null) return;
      if (Focus.focusTextBox(form)) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    // Where the box never came, the overview's Back takes focus rather than the page's body.
    Focus.focusFirst(this.renderRoot, ['[data-focus="search-back"]', '.row-group .heading']);
  }

  /**
   * The overview's Back after Search Settings left a page for it: that page again, as it was,
   * with focus on Search Settings. A place gone since falls back to the overview.
   *
   * @returns Whether there was a place to return to
   */
  private _backToSearchOrigin(): boolean {
    const from = this._searchFrom;
    if (from === undefined || this._nav.route.kind !== 'overview') return false;
    this._searchFrom = undefined;
    this._closeDisclosures();
    const checked = Navigation.validate(from.nav, (route) => this._exists(route));
    this._nav = checked.nav;
    this._jump = this._resultsLeft = undefined;
    if (this._filter.query !== '') this._applyFilter({ ...this._filter, query: '' });
    void this._afterMove({
      route: checked.nav.route,
      scrollTop: from.scrollTop,
      focusKey: 'search-open',
    });
    return true;
  }

  /**
   * The line that says a pick is on, where one is.
   *
   * @param ctx - Schema context
   * @returns The line, or nothing
   */
  private _renderPickBanner(ctx: SchemaCtx): TemplateResult | typeof nothing {
    if (this._pickingAt === undefined) return nothing;
    return PickView.pickBanner(
      this._string(ctx, PickView.touchOnly() ? 'pick.banner_touch' : 'pick.banner'),
      this._string(ctx, 'calendars.cancel'),
      () => this._endPick(true),
    );
  }

  /**
   * Keeps Pick From Preview in step with the dialog after each render: the button only while the
   * preview is found, looked for again a few times while it is not yet drawn, and a pick ended by a
   * move elsewhere in the editor or by the preview going away.
   */
  private _syncPick(): void {
    const card = PickView.findPreviewCard(this);
    if ((card !== undefined) !== this._canPick) this._canPick = card !== undefined;
    // One look waits at a time, and none while the editor is closed, so none outlives it.
    if (
      card === undefined &&
      this._pickLooks > 0 &&
      this._pickRetry === undefined &&
      this.isConnected
    ) {
      this._pickLooks--;
      this._pickRetry = setTimeout(() => {
        this._pickRetry = undefined;
        if (this.isConnected) this._syncPick();
      }, 500);
    }
    if (this._pickingAt === undefined) return;
    if (
      card === undefined ||
      this._quickSetup !== undefined ||
      this._pickingAt !== Navigation.routeKey(this._nav.route)
    ) {
      this._endPick(false);
    } else {
      this._picker.attach(card);
    }
  }

  /** The Pick From Preview button: turns a pick on, or off again. */
  private _togglePick = (): void => {
    if (this._pickingAt !== undefined) {
      this._endPick(false);
      return;
    }
    const card = PickView.findPreviewCard(this);
    if (card === undefined) {
      this._canPick = false;
      return;
    }
    this._pickingAt = Navigation.routeKey(this._nav.route);
    this._picker.attach(card);
  };

  /**
   * Ends a pick, leaving the preview as it was.
   *
   * @param focus - Whether focus goes back to the button, as Cancel and Escape put it
   */
  private _endPick(focus: boolean): void {
    this._picker.detach();
    if (this._pickingAt === undefined) return;
    this._pickingAt = undefined;
    if (focus) this._focusSoon([Focus.byFocusKey('pick')]);
  }

  /**
   * What a part opens, in words: "Events › Location", or the calendar a legend chip names.
   *
   * @param part - The part
   * @returns The name
   */
  private _pickName(part: PickView.PickedPart): string {
    const ctx = this._ctx;
    const target = part.target;
    if ('calendar' in target) {
      return this._calendarName(part.element.getAttribute('data-calendar') ?? '');
    }
    const page = PAGES.find((each) => each.id === target.page)!;
    const heading = page.headings.find((each) => each.key === target.heading);
    const title = heading && this._headingTitle(heading, ctx);
    const name = this._pageTitle(page, ctx);
    return title ? `${name} › ${title}` : name;
  }

  /**
   * Opens what a part of the preview names, as a search result opens a field: its page, with the
   * heading at the top and the first setting drawn under it marked and focused, or the setting the
   * part is where the map names one and it is drawn. A heading that lives in one layout's scope
   * switches to it first, which is announced. The pick ends.
   *
   * @param part - The part
   */
  private _pickPart(part: PickView.PickedPart): void {
    const ctx = this._ctx;
    const label = this._pickName(part);
    const target = part.target;
    this._endPick(false);
    let route: Navigation.Route;
    let heading: string | undefined;
    let field: FieldId | undefined;
    if ('calendar' in target) {
      const entries = this._config?.entities ?? [];
      const calendar = part.element.getAttribute('data-calendar');
      const at = entries.findIndex((each) => Synthetic.entityIdOf(each) === calendar);
      if (at < 0) return;
      route = { kind: 'entry', key: this._entryKeysFor(entries.length)[at]! };
      heading = ENTRY_GROUPS[0]!.key;
    } else {
      // A part of one layout's opens under that layout; any other under the layout previewed.
      route = this._scoped({ kind: 'page', page: target.page }, target.scope ?? this._layoutInView);
      heading = target.heading;
      field = target.field;
    }
    this._open(route, 'pick', 'push', heading ?? '');
    const opened = this._nav.route;
    void this.updateComplete.then(() => {
      const group = this.renderRoot.querySelector(
        `.page-group[data-heading="${CSS.escape(heading ?? '')}"]`,
      );
      const named =
        field !== undefined && group?.querySelector(`[data-field="${CSS.escape(field)}"]`)
          ? field
          : undefined;
      const id =
        named ??
        (group?.querySelector('[data-field]')?.getAttribute('data-field') as
          FieldId | null | undefined);
      const say = () => this._string(ctx, 'search.showing', { label });
      if (!id) {
        // Nothing under it is drawn as a field: its heading takes focus instead.
        if (group) Focus.focusFirst(group, ['.heading']);
        this._say(say());
        return;
      }
      this._land(
        opened.kind === 'entry'
          ? { kind: 'entry-field', id, key: opened.key }
          : { kind: 'field', id, page: (opened as { page: PageId }).page },
        label,
        [`button.chip[data-field="${CSS.escape(id)}"]`],
        say,
      );
    });
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
      status.kind === 'story' ? mdiCheck : status.kind === 'audit' ? mdiRestore : mdiDeleteOutline,
      status.text,
      this._haWord(ctx, 'ui.common.undo', 'history.undo'),
      this._undo,
    );
  }

  /**
   * The upgrade's receipt: what it kept, and where, with "Use Them for Every Layout" until they
   * are shared, and Undo.
   *
   * @param ctx - Schema context
   * @returns The receipt, or nothing
   */
  private _renderUpgrade(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const upgrade = this._status?.kind === 'upgrade' ? this._status.upgrade : undefined;
    if (upgrade === undefined) return nothing;
    const { keys, shared } = upgrade;
    return HistoryView.upgradeReceipt({
      title: this._upgradeTitle(ctx, upgrade),
      text: this._upgradeSentences(ctx, upgrade),
      details: upgrade.hidden.map(({ key, fields }) => ({
        key,
        text: this._hiddenSentence(ctx, key, fields),
        label: this._string(ctx, 'upgrade.make_private'),
        onPress: () => this._makePrivate(key),
      })),
      share:
        shared || keys.length === 0
          ? undefined
          : {
              label: this._string(ctx, keys.length === 1 ? 'upgrade.share_one' : 'upgrade.share'),
              onPress: this._shareUpgraded,
            },
      undoLabel: this._haWord(ctx, 'ui.common.undo', 'history.undo'),
      onUndo: upgrade.wrote ? this._undo : undefined,
    });
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
      this._language(),
      this._heldModes(this._pending, workspace),
    );
  }

  /**
   * The language the editor draws in: the one the card asks for, once its strings are in.
   *
   * A language shipped as a file of its own (`translations/loader.ts`) is asked for here, and
   * until it settles the editor keeps the language it last drew in, or before its first drawing
   * draws nothing at all (`render`). It never draws a language whose strings are still on their
   * way: every label, helper and search index is kept by language, so strings arriving under a
   * language already drawn would leave all of those stale. A file that cannot be used settles
   * the language too, which then reads in English key by key.
   *
   * @returns Effective language code
   */
  private _language(): string {
    const asked = LanguageCodes.getEffectiveLanguage(this._config!.language, this.hass?.locale);
    if (EditorLanguages.editorLanguageReady(asked)) return (this._drawnLanguage = asked);
    if (this._awaitedLanguage !== asked) {
      this._awaitedLanguage = asked;
      void EditorLanguages.loadEditorLanguage(asked).then(() => this.requestUpdate());
    }
    return this._drawnLanguage ?? 'en';
  }

  /** The language the editor last drew in (`_language`); unset until its first is ready. */
  private _drawnLanguage?: string;

  /** The language whose file the editor last asked for (`_language`). */
  private _awaitedLanguage = '';

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
  private _ctxFor = (...args: Parameters<typeof scopeCtx>): ReturnType<typeof scopeCtx> => {
    // One kept context per scope: moving between a layout's topics and Whole Card's pages, which
    // read in the shared scope, rebuilds nothing either side.
    const workspace = args[1];
    let made = this._ctxMemos.get(workspace);
    if (made === undefined) this._ctxMemos.set(workspace, (made = Helpers.memoizeLast(scopeCtx)));
    return made(...args);
  };

  /** `_ctxFor`'s kept context, by scope. */
  private _ctxMemos = new Map<Workspace.EditorWorkspace, typeof scopeCtx>();

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
   * @param withHelper - Whether its own helper applies to the value it holds
   * @returns The two callbacks
   */
  private _fieldText(
    slot: string,
    field: IndexedField,
    ctx: SchemaCtx,
    words?: string,
    withHelper = true,
  ) {
    const place = Shown.wordsPlace(field.node);
    const yaml = this._prefs.yaml
      ? this._string(ctx, 'search.yaml', { path: this._yamlPath(field, ctx) })
      : undefined;
    const helper =
      [
        yaml,
        words && place === 'helper' ? `${words}.` : undefined,
        withHelper ? fieldHelper(field, ctx) : undefined,
      ]
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
    const workspace = ctx.workspace ?? ctx.view;
    if (scope !== 'calendar' && scope !== 'button' && field.dataPath.length > 0) {
      return [...(Workspace.storedPath(field.dataPath, workspace) ?? field.dataPath), key].join(
        '.',
      );
    }
    const block =
      scope === 'calendar' || scope === 'button' ? undefined : Routing.destination(key, workspace);
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
    const cleared =
      moved && path ? this._clearedSelect(frame, moved, path, incoming, focusKey) : undefined;
    this._commit(
      label,
      // By owner as well: two entries' pages give the same field the same focus key.
      typed
        ? `${WriteFrames.ownerKey(frame.owner)}|${focusKey}|${path!.join('.')}|${frame.workspace}`
        : undefined,
      cleared ? () => this._applyReset(cleared, []) : () => this._writeOwned(frame, incoming),
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
   * The reset a dropdown's ✕ stands for. Home Assistant's select clears to no value, which a
   * derived dropdown would otherwise apply as a choice of its own (Duplicates would store
   * `filter_duplicates: false`), and which in a layout's scope would write the layout an override
   * of its own. Cleared, the dropdown deletes its line where this scope writes it, exactly as its
   * Reset does.
   *
   * @param frame - The frame of the form that sent the change
   * @param moved - The control whose value changed
   * @param path - Its data path, its name last
   * @param incoming - The form's whole data, as it sent it
   * @param focusKey - The field's focus key, `field:<id>`
   * @returns The reset, or `undefined` for any other change
   */
  private _clearedSelect(
    frame: WriteFrames.OwnedFrame,
    moved: { readonly node: HaFormSchema },
    path: ReadonlyArray<string>,
    incoming: Record<string, unknown>,
    focusKey: string | undefined,
  ): Reset.ResetTarget | undefined {
    const selector = 'selector' in moved.node ? moved.node.selector : undefined;
    if (selector === undefined || !('select' in selector) || selector.select?.multiple) {
      return undefined;
    }
    const value = Routing.atPath(incoming, path.slice(0, -1), path[path.length - 1]);
    if (value !== undefined && value !== null && value !== '') return undefined;
    if (!focusKey?.startsWith('field:')) return undefined;
    const id = focusKey.slice('field:'.length);
    const field = universeIndex(this._ctx.language, frame.workspace).fields.get(id);
    if (field === undefined) return undefined;
    if (frame.owner.kind === 'entry') {
      return { kind: 'entry', key: frame.owner.key, keys: field.configKeys };
    }
    return frame.owner.kind === 'card'
      ? { kind: 'field', field, workspace: frame.workspace }
      : undefined;
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
    // A form of Calendar Filter's the YAML names is one named this session, for its chip.
    const legend = (this._rawConfig.toolbar as { legend?: unknown } | undefined)?.legend;
    if (legend === 'menu' || legend === 'chips') this._legendForm = legend;
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
   * Every input the form is handed is kept while it is equal (the identity rules, carried to
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
      // (Stored Settings' Edit), the value is the control.
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
        : field.id === Chips.SWITCHER_LAYOUTS_FIELD
          ? this._renderSwitcherLayouts(field, ctx, show)
          : field.id === LEGEND_FIELD
            ? this._renderLegendAlone(field, ctx, show)
            : field.id in Chips.CHIP_LABELS
              ? this._renderLoneChip(field, ctx)
              : undefined;
    if (composed !== undefined) return this._jumpedCardField(field, ctx, composed);
    const workspace = ctx.workspace ?? ctx.view;
    const slot = `field.${workspace}.${field.id}`;
    // The scope's data, which Stored Settings draws a line's field in whatever the scope.
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
    const text = this._fieldText(slot, field, ctx, show?.words, show?.describedBy === undefined);
    // Focus goes to a field's wrapper, never into its form.
    const wrapper = html`<div
      class="field"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${groupName(text.group, show)}
      aria-describedby=${describedBy(show)}
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
      ${actionHelper(field, text.helper(field.node))}
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
   * Start Date as radio chips on Which Events: Today, Tomorrow, Start of Week, A Fixed Date and
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
    // Drawn alone (Stored Settings' Edit, search's Edit Here), the chips bring the field their
    // choice reveals, which a page draws beside them.
    const revealed =
      value === 'fixed'
        ? 'content:start_date_fixed'
        : value === 'offset'
          ? START_DATE_EXPRESSION
          : undefined;
    const reveal =
      (show === undefined || show.alone === true) && revealed !== undefined
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
      reveal === undefined
        ? (show?.line ?? nothing)
        : html`${show?.line ?? nothing}${this._renderField(reveal, ctx)}`,
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
   * A word list as one term at a time: Home Assistant's text selector with
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
    // A list just added holds one empty box, ready to type in, where Home Assistant's own empty
    // list would offer only a button that adds one.
    const added =
      owner.kind !== 'button' &&
      this._added.has(this._addedKey(field.id, owner.kind === 'card' ? CARD : owner));
    const shown =
      draft !== undefined && WordLists.toPattern(draft) === pattern
        ? draft
        : terms.length === 0 && draft === undefined && added
          ? ['']
          : terms;
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
      aria-label=${groupName(owner.kind === 'card' ? text.group : label, show)}
      aria-describedby=${describedBy(show)}
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
      const drawn = this._entrySchemas(ctx).find(({ key }) => key === target.key);
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
    if (returnable) {
      return SearchView.returnButton(this._string(ctx, 'search.return'), this._returnBack);
    }
    // A page a link, a pick or Undo jumped to: Back goes up, and this line goes where it was.
    const jumped = Navigation.jumpedFrom(this._nav);
    const place =
      jumped === undefined
        ? undefined
        : jumped.route.kind === 'audit'
          ? this._string(ctx, 'more.audit')
          : jumped.route.kind === 'notices'
            ? this._string(ctx, 'misplaced.title')
            : this._placeName(jumped.route);
    return place === undefined
      ? nothing
      : SearchView.returnButton(this._string(ctx, 'search.back_to', { place }), this._returnBack);
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
      // Every page draws every setting that applies; one at its default folds to its head.
      showEverySetting: true,
      pending: this._pending,
      entryKeys: this._entryKeysFor((this._config!.entities ?? []).length),
      previewed: this._previewedScope()?.view ?? this._viewForConfig(this._config!),
    };
  }

  /**
   * A layout's name, as its row under Layouts words it: "Grid", "Layout Defaults".
   *
   * @param ctx - Schema context
   * @returns The namer
   */
  private _layoutName(ctx: SchemaCtx): Shown.LayoutName {
    return (view) => this._layoutTitle(view, ctx);
  }

  /**
   * Words a field's value as its control shows it, for a state line, a Reset button or a stored
   * line.
   *
   * @param field - The field
   * @param ctx - Schema context
   * @returns The words
   */
  private _wordOf(field: IndexedField, ctx: SchemaCtx): Shown.WordValue {
    // A calendar's three-way option stores a value its dropdown offers under another name: words
    // the option the stored value stands for, "Never show", never the stored `false`.
    const stored =
      parseFieldId(field.id).scope === 'calendar'
        ? ENTITY_TRISTATE_STORED[parseFieldId(field.id).name]
        : undefined;
    const asOption = (value: unknown): unknown => {
      if (stored === undefined) return value;
      const option = Object.entries(stored).find(([, each]) => each === value);
      return option === undefined ? value : option[0];
    };
    return (value) =>
      Summary.wordValue(field, asOption(value), ctx.language, this._describe) ??
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
      this._entryKeys.join(),
      // A calendar's field reads the card's value in the layout the preview draws.
      pctx.previewed,
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
   * What a live field shows besides its control: its state words, and under it
   * what they leave out, and Reset or Remove named for what it leaves.
   *
   * @param field - The field
   * @param appearance - How its page shows it
   * @param pctx - Plan context, the entry's on an entry page
   * @param ctx - Schema context
   * @param owner - The card, or a calendar entry
   * @param heading - The heading's key, whose title takes focus after a Remove
   * @param why - Why the plan draws it, where a heading draws it with a head row
   * @param underDayList - Whether its heading's title names Month's day list already
   *   (`HeadingDef.namesDayList`), so its facts leave out the marker saying so
   * @returns What it shows
   */
  private _fieldShow(
    field: IndexedField,
    appearance: Appearance,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
    owner: PlanOwner,
    heading?: string,
    why?: Extract<Plan.FieldState, { kind: 'live' }>['why'],
    underDayList = false,
  ): FieldShow {
    const t = this._t(ctx);
    const layout = this._layoutName(ctx);
    const word = this._wordOf(field, ctx);
    const planned = Plan.stateOf(field, pctx);
    const state = underDayList && planned?.dayList ? { ...planned, dayList: undefined } : planned;
    const label = fieldLabel(field, ctx.language);
    const facts = Shown.stateFacts(state, t, layout, word, this._siblingEntries(owner), (names) =>
      EditorLocalize.formatList(ctx.language, names, 'conjunction'),
    );
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
    const actions: ShownView.LineButton[] = [];
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
    // Month's page reads a stored Tomorrow or Start of Week as Today, so the Expression shown for
    // one offers no Reset or Remove, which would change the other layouts alone.
    const keepsShortcut =
      field.id === START_DATE_EXPRESSION && this._monthStartDateShortcut(ctx) !== undefined;
    if (action !== undefined && !keepsShortcut) {
      const text = Shown.resetText(action, Plan.resetOutcome(field, pctx), label, t, word);
      actions.push({
        label: text.label,
        name: text.name,
        focus: `${action}:${field.id}`,
        kind: action,
        resetKeys: this._storedKeys(field, pctx, owner),
        onPress: () => this._resetField(field, owner, action, label, heading),
      });
    }
    if (why !== undefined) {
      return this._settingShow(
        field,
        appearance,
        state,
        owner,
        facts,
        calendars,
        actions,
        ctx,
        why,
      );
    }
    // A control with no head row of its own (the overview's) says its facts on the line under it.
    return { line: ShownView.fieldLine({ notes: [], calendars, actions, facts }) };
  }

  /**
   * Whether today's date is drawn as a tile, whose digits take the tile's own ink unless a color
   * is named for them.
   *
   * @returns Whether the card's today indicator is the tile
   */
  private _todayTile(): boolean {
    const indicator = this._config?.today_indicator;
    return (
      indicator !== undefined &&
      Boolean(indicator) &&
      Helpers.getTodayIndicatorType(indicator) === 'tile'
    );
  }

  /**
   * The positions of the other entries of a calendar entry's calendar, which an option the
   * calendar's entries share also applies to: [2] for entry 1 of 2.
   *
   * @param owner - The card, or a calendar entry
   * @returns The positions, 1-based in list order; empty for the card or a calendar listed once
   */
  private _siblingEntries(owner: PlanOwner): number[] {
    if (owner.kind !== 'entry') return [];
    const { entities, keys } = this._listState();
    const index = keys.indexOf(owner.key);
    if (index < 0) return [];
    const id = Synthetic.entityIdOf(entities[index]);
    const same = entities.flatMap((entry, at) =>
      Synthetic.entityIdOf(entry) === id ? [keys[at]] : [],
    );
    return same.flatMap((key, at) => (key === owner.key ? [] : [at + 1]));
  }

  /**
   * A setting's head row (backlog item 307): its name, while folded its value, its facts under the
   * name (Set, Whole Card, From All Layouts, From the Card, each layout's own) with Reset or Remove
   * after Set, a button in plain view, a chevron where it folds and ⓘ with its helper. "Set on
   * Calendars" and its links are on the line under its control. A setting at its default folds to
   * its head until opened; opening adds it to the session's added set, so a value cleared while it
   * is open does not fold it under the cursor. A stored setting never folds, so its Reset is always
   * in view.
   *
   * @param field - The field
   * @param appearance - How its page shows it
   * @param state - What `plan.ts` › `stateOf` found
   * @param owner - The card, or a calendar entry
   * @param facts - What it says under its name
   * @param calendars - "Set on Calendars:" with a link per entry
   * @param actions - Reset or Remove
   * @param ctx - Schema context
   * @param why - Why the plan draws it
   * @returns What it shows
   */
  private _settingShow(
    field: IndexedField,
    appearance: Appearance,
    state: Plan.StateWords | undefined,
    owner: PlanOwner,
    facts: ReadonlyArray<Shown.Fact>,
    calendars: { label: string; links: ShownView.LineButton[] } | undefined,
    actions: ReadonlyArray<ShownView.LineButton>,
    ctx: SchemaCtx,
    why: Extract<Plan.FieldState, { kind: 'live' }>['why'],
  ): FieldShow {
    const t = this._t(ctx);
    const label = fieldLabel(field, ctx.language);
    const key = this._addedKey(field.id, owner);
    const words = state?.words;
    const atDefault =
      words === undefined ||
      words.kind === 'layout-default' ||
      (words.kind === 'whole-card' && !words.stored);
    // A screen reader hears "Default" where no fact says Set or where the value comes from.
    const quiet = facts.some((fact) => fact.kind === 'set' || fact.kind === 'source')
      ? undefined
      : t('state.default');
    const buttons = actions.map((action) => ({
      ...action,
      onPress: () => {
        action.onPress();
        // The control stays open where it was, now at its default: added after the reset, which
        // retires the setting's own key.
        this._added = new Set([...this._added, key]);
      },
    }));
    // A calendar's setting whose helper explains one of its values shows it only for that value.
    const helpedValue =
      owner.kind === 'entry' ? Entities.HELPER_FOR_VALUE[parseFieldId(field.id).name] : undefined;
    const entryValue =
      owner.kind === 'entry'
        ? Entities.toEntityFormData(this._entryOf(owner.key) ?? '', this._config!.entities ?? [])[
            parseFieldId(field.id).name
          ]
        : undefined;
    const helper =
      helpedValue === undefined || entryValue === helpedValue ? fieldHelper(field, ctx) : undefined;
    const helpId = `help-${key.replace(/[^\w-]/g, '_')}`;
    const helpOpen = this._helpOpen.has(key);
    const isSwitch = isSwitchRow(field);
    const jumped =
      this._jump?.target !== undefined &&
      'id' in this._jump.target &&
      this._jump.target.id === field.id;
    // Who Sees It is the only control under its heading, and Home Assistant's own editor: drawn open.
    const folds =
      !isSwitch &&
      field.id !== `calendar:${VISIBILITY}` &&
      atDefault &&
      (why === 'every' || why === 'added');
    // Opened on its own key: a family's members are live together, but each opens and folds alone,
    // so opening one never moves the head of another.
    const open = isSwitch || !folds || this._added.has(key) || jumped;
    const data =
      owner.kind === 'entry'
        ? Entities.toEntityFormData(this._entryOf(owner.key) ?? '', this._config!.entities ?? [])
        : this._formData();
    const raw =
      owner.kind === 'entry'
        ? data[parseFieldId(field.id).name]
        : Routing.atPath(data, field.dataPath, field.node.name);
    // Only what reads as words: an action or a list no summary words shows no value. Where nothing
    // names a value, the row says what applies (`unset.ts`).
    const worded =
      !folds || raw === undefined || raw === null || raw === ''
        ? undefined
        : (Summary.wordValue(field, raw, ctx.language, this._describe) ??
          (typeof raw === 'object' ? undefined : String(raw)));
    const value = !folds
      ? undefined
      : (worded ??
        Unset.unsetWord(
          field.id,
          (k, values) => this._string(ctx, k, values),
          (name) => this._string(ctx, name),
          this._todayTile(),
        ));
    const family =
      typeof appearance === 'object' && 'family' in appearance ? appearance.family : undefined;
    const head: ShownView.SettingHead = {
      id: field.id,
      label,
      lang: ctx.language,
      value,
      facts,
      actions: buttons,
      quiet,
      help: helper
        ? {
            id: helpId,
            name: t('setting.about', { label }),
            open: helpOpen,
            onToggle: () => {
              const next = new Set(this._helpOpen);
              if (helpOpen) next.delete(key);
              else next.add(key);
              this._helpOpen = next;
            },
          }
        : undefined,
      fold: folds
        ? {
            key: `fold:${key}`,
            open,
            onToggle: () =>
              open ? this._foldSetting(field, owner, family) : this._unfold(field, key),
          }
        : undefined,
    };
    return {
      head,
      // A switch's own row is its head; any other setting draws its control below the head.
      open: open && !isSwitch,
      switchRow: isSwitch,
      describedBy: helper ? helpId : undefined,
      facts: ShownView.spokenFacts(facts, quiet),
      line: ShownView.fieldLine({ notes: [], calendars, actions: [] }),
    };
  }

  /**
   * Whether a color's value is drawn inside its mode's control on this page, as `_renderField` and
   * `_renderEntryField` draw it, so it has no head row of its own.
   *
   * @param field - The field
   * @param owner - The card, or a calendar entry
   * @param ctx - Schema context
   * @returns Whether its mode's control holds it
   */
  private _absorbedColor(field: IndexedField, owner: PlanOwner, ctx: SchemaCtx): boolean {
    if (owner.kind === 'entry') {
      const spec = this._entryColors(ctx).specs.get(field.id);
      return spec?.mode !== undefined && field.id === spec.value;
    }
    const spec = this._cardColors(ctx).specs.get(field.id);
    return (
      spec?.mode !== undefined &&
      field.id === spec.value &&
      this._drawing?.present.has(spec.mode) === true &&
      this._drawing.shown.has(spec.mode)
    );
  }

  /**
   * Opens a setting folded to its head: added to the session's added set, so its control is drawn
   * below the head, which keeps focus. A word list's text box takes it instead, ready to type.
   *
   * @param field - The field
   * @param key - Its added-set key
   */
  private _unfold(field: IndexedField, key: string): void {
    this._added = new Set([...this._added, key]);
    if (WORD_LIST_FIELDS.has(field.id)) {
      void this.updateComplete.then(() => {
        const wrapper = this.renderRoot.querySelector<HTMLElement>(
          `.field[data-field="${CSS.escape(field.id)}"]`,
        );
        if (!wrapper) return;
        // From the head, which the press focused, into the box once Home Assistant draws it.
        wrapper.focus({ preventScroll: true });
        Focus.focusTextBoxSoon(wrapper);
      });
    }
  }

  /**
   * Folds an opened setting back to its head: its own key out of the added set, and its family's,
   * which a search may have added. Its family's other members stay as they are.
   *
   * @param field - The field
   * @param owner - The card, or a calendar entry
   * @param family - Its family, where it has one
   */
  private _foldSetting(field: IndexedField, owner: PlanOwner, family?: FamilyId): void {
    const ids = family === undefined ? [field.id] : [field.id, `family:${family}`];
    const gone = new Set(ids.map((id) => this._addedKey(id, owner)));
    this._added = new Set([...this._added].filter((each) => !gone.has(each)));
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
   * title and line, and in drawing order (`Plan.fieldsInDrawOrder`) every setting under its head
   * row and every setting a gate withholds in its place, then the values stored for settings that
   * are not in use (section 5.2). A heading with none of these, and nothing else to draw, is left out.
   *
   * @param plans - The headings' plans
   * @param pctx - Plan context, the entry's on an entry page
   * @param ctx - Schema context
   * @param owner - The card, or a calendar entry
   * @param present - The fields built here
   * @param data - Form data the gates read
   * @param draw - Draws one live field
   * @param extra - What a heading draws besides its fields
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
      const more = extra(heading);
      const when = (gate: Plan.HeadingPlan['gated'][number]['gate']): string =>
        whenText(gate, data, ctx.language, labelOf) ?? '';
      // A chip a gate withholds says why on itself ("Needs Time"), so no gate line names it; nor
      // does one name a chip's qualifier line, which goes and comes with its chip.
      const isChip = (id: FieldId): boolean => {
        const appearance = Plan.appearanceOf(id);
        return (
          typeof appearance === 'object' && ('chips' in appearance || 'qualifies' in appearance)
        );
      };
      // Every setting in drawing order, the registry's but on Month's pages (Plan.fieldsInDrawOrder):
      // the chips of one kind together where the first of them is placed, with their qualifier
      // lines, Start Date as its radio group, every other setting under its head row, and a setting
      // a gate withholds in its place, saying when it appears.
      const order = new Map(
        Plan.fieldsInDrawOrder(heading, pctx.workspace, present).map(([id], at) => [id, at]),
      );
      const prefix = owner.kind === 'entry' ? owner.key : '';
      const grouped = new Set<string>();
      type Item =
        | { readonly at: number; readonly drawn: unknown }
        | { readonly at: number; readonly gated: FieldId; readonly clause: string };
      const items: Item[] = [];
      for (const { id, appearance, why, copy } of plan.live) {
        const at = order.get(id) ?? 0;
        // A qualifier line is drawn by its chips, under them.
        if (typeof appearance === 'object' && 'qualifies' in appearance) continue;
        if (typeof appearance === 'object' && 'chips' in appearance) {
          if (grouped.has(appearance.chips)) continue;
          grouped.add(appearance.chips);
          items.push({
            at,
            drawn: keyed(
              `chips:${appearance.chips}`,
              this._renderChips(appearance.chips, heading, pctx, ctx),
            ),
          });
          continue;
        }
        const field = present.get(id);
        if (field === undefined) continue;
        if (appearance === 'segmented') {
          const segmented = this._renderSegmented(field, appearance, pctx, ctx, heading.key);
          items.push({
            at,
            // A copy says so in the tree, for what walks every page and meets it twice.
            drawn: keyed(`:${id}`, copy ? html`<div data-copy>${segmented}</div>` : segmented),
          });
          continue;
        }
        // A color's value is drawn inside its mode's control where the page draws both: no head.
        if (this._absorbedColor(field, owner, ctx)) continue;
        const show = this._fieldShow(
          field,
          appearance,
          pctx,
          ctx,
          owner,
          heading.key,
          why,
          heading.namesDayList === true,
        );
        const head = show.head!;
        items.push({
          at,
          drawn: keyed(
            `${prefix}:${id}`,
            html`<div
              class="setting${show.open ? ' open' : ''}"
              data-setting=${id}
              ?data-copy=${copy === true}
            >
              ${ShownView.settingHead(
                show.switchRow
                  ? { ...head, control: draw(field, { ...show, line: nothing }) }
                  : head,
              )}
              ${show.open ? draw(field, show) : show.switchRow ? show.line : nothing}
              ${
                head.help
                  ? ShownView.settingHelp(head.help.id, fieldHelper(field, ctx)!, head.help.open)
                  : nothing
              }
            </div>`,
          ),
        });
      }
      // A whole-card setting this topic names, by a row that opens it at home.
      for (const { id } of plan.references) {
        const field = present.get(id);
        if (field === undefined) continue;
        items.push({
          at: order.get(id) ?? 0,
          drawn: keyed(`${prefix}:${id}:reference`, this._renderReference(field, ctx)),
        });
      }
      // The layouts holding the setting a whole-card one goes with, after it.
      const links = heading.layoutLinks;
      const linked = links === undefined ? nothing : this._renderLayoutLinks(links, ctx);
      if (links !== undefined && linked !== nothing) {
        items.push({ at: (order.get(links.after) ?? 0) + 0.5, drawn: linked });
      }
      // The conditions a setting drawn in place already says it waits on.
      const said = new Set<string>();
      for (const each of plan.gated) {
        if (isChip(each.id)) continue;
        const clause = when(each.gate);
        said.add(clause);
        items.push({ at: order.get(each.id) ?? 0, gated: each.id, clause });
      }
      items.sort((a, b) => a.at - b.at);
      const off = this._offCard(
        plan,
        items.every((item) => 'gated' in item) && more === nothing,
        owner,
        pctx,
        ctx,
        labelOf,
        isChip,
      );
      const live: unknown[] = [];
      for (let at = 0; at < items.length; at++) {
        const item = items[at];
        if (!('gated' in item)) {
          live.push(item.drawn);
          continue;
        }
        // Settings in a row waiting on the same condition share one line.
        const run = [item.gated];
        while (at + 1 < items.length) {
          const next = items[at + 1];
          if (!('gated' in next) || next.clause !== item.clause) break;
          run.push(next.gated);
          at++;
        }
        live.push(
          keyed(
            `${prefix}:${run[0]}:gated`,
            run.length === 1
              ? ShownView.gatedRow(
                  run[0],
                  t('gate.line_bare', { when: item.clause }),
                  labelOf(run[0]),
                )
              : ShownView.gatedRow(
                  run[0],
                  t('gate.line', { when: item.clause, names: run.map(labelOf).join(', ') }),
                ),
          ),
        );
      }
      const helper =
        heading.helperKey === undefined ? undefined : this._string(ctx, heading.helperKey);
      const crossLink =
        this._crossLink(heading, ctx) ?? this._pointer(heading, owner, ctx, labelOf);
      // One line per condition the stored values of settings not in use wait on.
      const byWhen = new Map<string, { names: string[]; held: number }>();
      for (const each of plan.inactive) {
        if (each.gate.kind !== 'gate' || isChip(each.id)) continue;
        const clause = when(each.gate);
        const line = byWhen.get(clause) ?? { names: [], held: 0 };
        line.held += 1;
        byWhen.set(clause, line);
      }
      const gateLines = [...byWhen]
        // A condition a setting in place already names needs no line of its own.
        .filter(([clause, line]) => line.names.length > 0 || !said.has(clause))
        .map(([clause, line]) =>
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
        // A value stored blank has no words to put in brackets.
        const blank = value.trim() === '';
        const template = top
          ? blank
            ? t('inactive.line_top_bare')
            : t('inactive.line_top')
          : blank
            ? t('inactive.line_bare')
            : t('inactive.line');
        return [
          {
            text: interpolate(template, { label, value }),
            // A value from Layout Defaults is reset on its page; a reset here cannot reach it, so
            // the line carries no button and is itself where a search lands.
            focus: top ? `inactive:${field.id}` : undefined,
            button: top
              ? undefined
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
      if (off !== undefined) {
        return [
          PageView.headingBlock({
            title,
            key: heading.key,
            crossLink,
            off: { state: off.state, actions: off.actions.map(ShownView.lineButton) },
            body: html`${off.summary ? html`<p class="hint gate-summary">${off.summary}</p>` : nothing}
            ${ShownView.gateLines([], inactive)}`,
          }),
        ];
      }
      if (live.length === 0 && gateLines.length === 0 && inactive.length === 0) {
        if (more === nothing) return [];
      }
      const family = this._liveFamily(plan);
      return [
        PageView.headingBlock({
          title,
          key: heading.key,
          helper,
          crossLink,
          action:
            family === undefined
              ? undefined
              : ShownView.lineButton({
                  label: t('reset.reset'),
                  name: t('reset.named', {
                    label: this._string(ctx, FAMILIES[family].titleKey),
                  }),
                  focus: `remove-family:${family}`,
                  kind: 'reset',
                  onPress: () => this._removeFamily(family, owner, ctx, heading.key),
                }),
          // Split This Calendar opens Which Events; every other extra follows
          // its heading's fields.
          body: heading.extras?.includes('split')
            ? html`${more} ${live} ${ShownView.gateLines(gateLines, inactive)}`
            : html`${live} ${more} ${ShownView.gateLines(gateLines, inactive)}`,
        }),
      ];
    });
  }

  /**
   * A heading that holds nothing to edit while the part it belongs to is off, or before a weather
   * entity is chosen (backlog item 307): what its heading says in place of its gate lines, Off
   * with Turn On, or No Entity with Choose Weather Entity, and the one line naming what it holds.
   * Turn On writes what the part's chip writes, in the scope shown, as one undo step.
   *
   * @param plan - The heading's plan
   * @param empty - Whether it draws no setting and nothing else of its own
   * @param owner - Whose page
   * @param pctx - Plan context
   * @param ctx - Schema context
   * @param labelOf - A setting's label
   * @param isChip - Whether a setting is drawn as a chip
   * @returns What it shows, or `undefined` where it holds something to edit or waits on anything
   * else
   */
  private _offCard(
    plan: Plan.HeadingPlan,
    empty: boolean,
    owner: PlanOwner,
    pctx: Plan.PlanCtx,
    ctx: SchemaCtx,
    labelOf: (id: FieldId) => string,
    isChip: (id: FieldId) => boolean,
  ): { state: string; actions: ShownView.LineButton[]; summary: string } | undefined {
    if (!empty || owner.kind === 'entry') return undefined;
    const present = this._drawing!.present;
    const waits = [
      ...plan.gated,
      ...plan.inactive.filter((each) => each.gate.kind === 'gate'),
    ].filter((each) => !isChip(each.id));
    if (waits.length === 0) return undefined;
    const opens = new Map<FieldId, unknown>();
    for (const { unmet } of waits) {
      const part = unmet.field in Chips.CHIP_LABELS && Chips.inScope(unmet.field, pctx.workspace);
      if (!(part || unmet.field === WEATHER_ENTITY) || !present.has(unmet.field)) return undefined;
      opens.set(unmet.field, unmet.opens);
    }
    const weather = opens.has(WEATHER_ENTITY);
    if (weather && opens.size > 1) return undefined;
    const t = this._t(ctx);
    const title = this._headingTitle(plan.heading, ctx) ?? '';
    const key = plan.heading.key;
    const partOf = (id: FieldId): string => this._string(ctx, Chips.CHIP_LABELS[id]);
    const actions = [...opens].map(([id, value]): ShownView.LineButton => {
      if (weather) {
        const label = labelOf(id);
        return {
          label: t('gate.choose', { label }),
          name: t('gate.choose_named', { label, heading: title }),
          focus: `choose:${key}`,
          kind: 'go-up',
          onPress: () => this._land({ kind: 'field', id }, label, []),
        };
      }
      const part = partOf(id);
      return {
        label: opens.size === 1 ? t('gate.turn_on') : t('gate.turn_on_part', { part }),
        name: t('gate.turn_on_part', { part }),
        focus: `turn-on:${id}`,
        kind: 'turn-on',
        onPress: () => {
          this._commit(
            t('history.change', { setting: labelOf(id) }),
            undefined,
            () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, value),
            `field:${id}`,
          );
          // The button leaves with the card's Off: focus goes to its heading.
          this._focusSoon([`.page-group[data-heading="${CSS.escape(key ?? '')}"] .heading`]);
        },
      };
    });
    // A card waiting on one part drops that part's word where a name starts or ends with it:
    // "Location Font Size" reads "Font Size" under Location. A name with the word inside it, or in
    // a language that puts it elsewhere, stays whole.
    const only = !weather && opens.size === 1 ? partOf([...opens.keys()][0]) : undefined;
    const shorten = (name: string): string => {
      if (only === undefined || name.length <= only.length + 1) return name;
      const lower = name.toLocaleLowerCase(ctx.language);
      const word = only.toLocaleLowerCase(ctx.language);
      if (lower.startsWith(`${word} `)) return name.slice(word.length + 1);
      if (lower.endsWith(` ${word}`)) return name.slice(0, name.length - word.length - 1);
      return name;
    };
    const names = plan.gated.filter((each) => !isChip(each.id)).map((each) => labelOf(each.id));
    return {
      state: weather ? t('gate.no_entity') : t('summary.off'),
      actions,
      summary: names.map(shorten).join(Summary.SUMMARY_SEPARATOR),
    };
  }

  /**
   * The family a heading shows a stored value of, which its Reset resets in one step.
   *
   * @param plan - The heading's plan
   * @returns The family, or `undefined`
   */
  private _liveFamily(plan: Plan.HeadingPlan): FamilyId | undefined {
    for (const { appearance, why } of plan.live) {
      if (typeof appearance === 'object' && 'family' in appearance) {
        if (why === 'stored') return appearance.family;
      }
    }
    return undefined;
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
    // A layout group's color is the layout's own, stored under its block: `list.weather.date`.
    const nested = Workspace.LAYOUT_GROUPS.has(valueField.dataPath[0] ?? '')
      ? Workspace.storedPath(valueField.dataPath, workspace)
      : undefined;
    // Named for the mode it absorbs, as the page draws it, wherever it is drawn.
    const name = fieldLabel(colors.fields.get(spec.mode ?? field.id) ?? field, ctx.language);
    const wrapper = html`<div
      class="field color-field"
      data-field=${field.id}
      tabindex="-1"
      role="group"
      aria-label=${groupName(name, show)}
      aria-describedby=${describedBy(show)}
    >
      ${this._renderColor({
        owner: WriteFrames.CARD_OWNER,
        spec,
        ctx,
        name,
        valueField,
        // The scope's data, which Stored Settings draws a line's field in whatever the scope.
        data: this._formDataFor(this._config!, workspace, this._pending),
        fallback: Routing.atPath(
          this._defaultData(workspace),
          valueField.dataPath,
          valueField.node.name,
        ),
        stored: Routing.atPath(
          this._rawConfig,
          nested ?? [...(block === undefined ? [] : [block]), ...valueField.dataPath],
          valueField.node.name,
        ),
        destination: block ?? nested?.[0] ?? '',
        anchor: field.id,
        focusKey: `field:${field.id}`,
        // Behind its head's ⓘ where it has one, so it is never shown twice.
        helper:
          show?.describedBy === undefined
            ? (fieldHelper(valueField, ctx) ?? fieldHelper(field, ctx))
            : undefined,
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
   * @param withHelper - Whether it draws its helper, which a head row's ⓘ otherwise holds
   * @returns The control; nothing for an entry that has left, or a field that is no color
   */
  private _renderEntryColor(
    key: number,
    id: FieldId,
    ctx: SchemaCtx,
    words?: string,
    withHelper = true,
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
      helper: withHelper
        ? (fieldHelper(valueField, ctx) ?? fieldHelper(colors.fields.get(anchor)!, ctx))
        : undefined,
      entity: { id: entityId, name: Entities.entityDisplayName(entityId, this.hass) },
    });
  }

  /**
   * The composed color control for any owner. Every row and swatch writes
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
   * Resets a group of chips: every one stored in the scope, in one step.
   *
   * @param fields - The chips' fields
   * @param action - The button's words, which name the step: "Reset Parts"
   * @param first - The group's first chip, which takes focus
   * @param heading - The heading's key
   */
  private _resetChips(
    fields: ReadonlyArray<IndexedField>,
    action: string,
    first: FieldId | undefined,
    heading?: string,
  ): void {
    const ctx = this._ctx;
    const workspace = ctx.workspace ?? ctx.view;
    this._commit(action, undefined, () =>
      this._applyReset(
        fields.map((field) => ({ kind: 'field', field, workspace })),
        fields.map((field) => this._addedKey(field.id, CARD)),
      ),
    );
    this._focusAfterReset(first, heading);
  }

  /**
   * Resets a family a page shows a stored value of: every member's line here, in one step. Its
   * members stay drawn, at their defaults.
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
    // The family stays on its page, now at its defaults.
    this._say(this._string(ctx, 'reset.named', { label: name }));
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
   * Focus after a Reset or a Remove: the field's wrapper while it is drawn, else
   * its heading's Add row, which now names it, else the heading.
   *
   * @param id - The field, or none for a family
   * @param heading - The heading's key
   */
  private _focusAfterReset(id: FieldId | undefined, heading?: string): void {
    const group = `.page-group[data-heading="${CSS.escape(heading ?? '')}"]`;
    this._focusSoon([
      ...(id === undefined ? [] : [`[data-field="${CSS.escape(id)}"]`]),
      `[data-setting="${CSS.escape(id ?? '')}"] .setting-toggle`,
      `${group} .heading`,
      '.page-title',
      // On the overview, which has no page headings: its own fields, then its first heading.
      '.overview [data-field]',
      '.overview .heading',
    ]);
  }

  /**
   * A whole-card setting a topic names, whose home is a Whole Card page: its value as its folded
   * row would show it, Whole Card and the page under its name, and the whole row opening it there.
   * Back returns to the row.
   *
   * @param field - The setting
   * @param ctx - Schema context
   * @returns The row
   */
  private _renderReference(field: IndexedField, ctx: SchemaCtx): TemplateResult {
    const home = placementOf(field.id)?.page;
    const page = PAGES.find((each) => each.id === home);
    const where = page === undefined ? '' : this._pageTitle(page, ctx);
    const label = fieldLabel(field, ctx.language);
    const raw = Routing.atPath(
      Routing.workspaceFormData(this._config!, 'shared', this._pending),
      field.dataPath,
      field.node.name,
    );
    const worded =
      raw === undefined || raw === null || raw === ''
        ? undefined
        : (Summary.wordValue(field, raw, ctx.language, this._describe) ??
          (typeof raw === 'object' ? undefined : String(raw)));
    const value =
      worded ??
      Unset.unsetWord(
        field.id,
        (k, values) => this._string(ctx, k, values),
        (name) => this._string(ctx, name),
        this._todayTile(),
      );
    const whole = this._string(ctx, 'state.whole_card');
    const focusKey = `reference:${field.id}`;
    return ShownView.referenceRow({
      id: field.id,
      label,
      lang: ctx.language,
      value,
      facts: [{ kind: 'scope', text: `${whole}${Summary.SUMMARY_SEPARATOR}${where}` }],
      name: [
        value === undefined ? label : `${label}: ${value}`,
        whole,
        this._string(ctx, 'nav.opens', { page: where }),
      ].join('. '),
      onOpen: () =>
        home === undefined || home === 'overview' || home === 'entry'
          ? undefined
          : this._openResult(
              { target: { kind: 'field', id: field.id, page: home }, label },
              focusKey,
              false,
            ),
    });
  }

  /**
   * A whole-card setting's line linking to the layouts that hold the setting it goes with
   * (`HeadingDef.layoutLinks`): each layout the card can show that offers it, in the card's order.
   * Each opens the setting in that layout, as a search result does. With no weather entity, the
   * forecast's links open each layout's Weather at its Weather Entity instead, as a search result
   * for a setting that needs one opens what it needs: choosing it there turns that layout's
   * forecast on.
   *
   * @param links - The heading's links
   * @param ctx - Schema context
   * @returns The line, or nothing where no layout holds the setting
   */
  private _renderLayoutLinks(
    links: NonNullable<HeadingDef['layoutLinks']>,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const entity = Routing.atPath(
      Routing.workspaceFormData(this._config!, 'shared', this._pending),
      [],
      parseFieldId(WEATHER_ENTITY).name,
    );
    const to =
      links.after === WEATHER_ENTITY && (typeof entity !== 'string' || entity === '')
        ? WEATHER_ENTITY
        : links.to;
    const reachable = ViewConfig.reachableViews(this._config!);
    const views = ViewConfig.VIEWS.filter(
      (view) => reachable.includes(view) && universeIndex('en', view).fields.has(links.to),
    );
    if (views.length === 0) return nothing;
    const field = universeIndex(ctx.language, views[0]).fields.get(links.to);
    const label = field === undefined ? links.to : fieldLabel(field, ctx.language);
    return PageView.layoutLinks(
      this._string(ctx, links.textKey),
      views.map((view) => {
        const layout = this._layoutTitle(view, ctx);
        const key = `links:${links.to}:${view}`;
        const needed =
          to === links.to ? undefined : universeIndex(ctx.language, view).fields.get(to);
        const opens = needed === undefined ? label : fieldLabel(needed, ctx.language);
        return {
          label: layout,
          name: this._string(ctx, 'audit.in_layout', { label, layout }),
          key,
          onOpen: () =>
            this._openResult(
              { target: { kind: 'field', id: to, page: links.page }, label: opens },
              key,
              false,
              () => this._string(ctx, 'search.showing_in', { label: opens, layout }),
              view,
            ),
        };
      }),
    );
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
   * A heading's line pointing to a setting on the same page (`HeadingDef.pointer`), named by the
   * setting's heading and label, which opens it as a search result does: added where it waits.
   *
   * @param heading - The heading
   * @param owner - The card, or a calendar entry
   * @param ctx - Schema context
   * @param labelOf - A field's label
   * @returns The line, or `undefined`
   */
  private _pointer(
    heading: HeadingDef,
    owner: PlanOwner,
    ctx: SchemaCtx,
    labelOf: (id: FieldId) => string,
  ): PageView.CrossLink | undefined {
    const pointer = heading.pointer;
    const place = pointer && placementOf(pointer.field);
    if (!pointer || !place) return undefined;
    const headings =
      place.page === 'entry'
        ? ENTRY_GROUPS
        : PAGES.find((page) => page.id === place.page)?.headings;
    const at = headings?.[place.heading];
    const label = labelOf(pointer.field);
    const key = `xlink:${pointer.field}`;
    const page = place.page === 'entry' || place.page === 'overview' ? undefined : place.page;
    return {
      text: this._string(ctx, pointer.textKey),
      label:
        at === undefined
          ? label
          : this._string(ctx, 'nav.crumb', {
              page: this._headingTitle(at, ctx) ?? '',
              heading: label,
            }),
      key,
      onOpen: () =>
        this._openResult(
          {
            target:
              owner.kind === 'entry'
                ? { kind: 'entry-field', id: pointer.field, key: owner.key }
                : { kind: 'field', id: pointer.field, page },
            label,
          },
          key,
          false,
        ),
    };
  }

  /**
   * A heading's title: its key, or the key it takes in a layout (Icons in Grid).
   *
   * @param heading - The heading
   * @param ctx - Schema context
   * @returns The title, or `undefined` for a heading with no key
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
   * A page's title by its id.
   *
   * @param id - The page
   * @param ctx - Schema context
   * @returns The title
   */
  private _pageTitleOf(id: PageId, ctx: SchemaCtx): string {
    const page = PAGES.find((each) => each.id === id);
    return page === undefined ? id : this._pageTitle(page, ctx);
  }

  /**
   * Whether a place exists on the card as it is now: a calendar entry's page while the entry does.
   *
   * @param route - The place
   * @returns `true` where it can be drawn
   */
  private _exists(route: Navigation.Route): boolean {
    if (
      route.kind === 'overview' ||
      route.kind === 'audit' ||
      route.kind === 'notices' ||
      route.kind === 'layout'
    ) {
      return true;
    }
    if (route.kind === 'entry') {
      return this._entryKeysFor((this._config?.entities ?? []).length).includes(route.key);
    }
    if (route.kind !== 'page') return false;
    if (route.scope !== undefined) {
      return topicsFor(route.scope).some((candidate) => candidate.id === route.page);
    }
    return PAGES.some((candidate) => candidate.id === route.page);
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
    this._nav = Navigation.go(this._nav, this._scoped(to), from, how);
    this._jump = this._resultsLeft = undefined;
    // Leaving the overview by its own rows: Search Settings' page is no longer where Back goes.
    if (from.route.kind === 'overview') this._searchFrom = undefined;
    void this._afterMove(undefined, heading);
  }

  /** Closes the strip, Add Calendar and the keyboard grab, which belong to the place being left. */
  private _closeDisclosures(): void {
    // A setting opened on the page being left folds again, unless it now holds a value.
    this._added = new Set();
    this._helpOpen = new Set();
    this._prefsOpen = false;
    this._auditEdit = undefined;
    this._openStrip = undefined;
    this._adding = undefined;
    this._grab = undefined;
  }

  /**
   * Opens what a result names: its page at the field, or, for a field the overview
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
    scope?: Workspace.EditorWorkspace,
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
      this._nav = Navigation.go(this._nav, this._entryRoute(target.key, scope), from);
    } else if (page) {
      this._nav = Navigation.go(this._nav, this._scoped({ kind: 'page', page }, scope), from);
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
   * Goes Back: up one level, to the place the open one belongs to (`navigation.ts` › `back`),
   * restoring its scroll position and focus where it was left by the same row, else landing on
   * the row that opens the place Back came from. On the overview, where a result shows a field in
   * place of the results, Back is Return to Results.
   */
  private _back = (): void => {
    if (this._resultsLeft === undefined && this._backToSearchOrigin()) return;
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
   * Return to Results, and a jump's "Back to …" line: one step back along the trail, to the place
   * left last (`navigation.ts` › `returnTo`), as it was left.
   */
  private _returnBack = (): void => {
    if (this._nav.route.kind === 'overview') {
      this._back();
      return;
    }
    this._closeDisclosures();
    const moved = Navigation.returnTo(this._nav);
    this._nav = moved.nav;
    if (moved.restore?.search) this._editHere = moved.restore.search.editHere;
    this._jump = this._resultsLeft = undefined;
    void this._afterMove(moved.restore);
  };

  /**
   * Moves focus once a move has rendered, in the same continuation, before the swapped-out
   * control's loss of focus can land anywhere else: a page's `h2`, with its header at the top
   * of what scrolls the editor; back on a place, its saved scroll position and the control
   * that left it, else that place's list heading. Back always lands with that control in view: a
   * position saved on a page that has since changed height, or on a scroller other than the one
   * scrolling now, never leaves the editor showing none of the page.
   *
   * @param restore - The place returned to, for Back
   * @param heading - A heading to bring to the top instead of the page's header
   */
  private async _afterMove(restore?: Navigation.TrailEntry, heading?: string): Promise<void> {
    await this.updateComplete;
    const root = this.renderRoot;
    if (restore !== undefined) {
      if (restore.scrollTop !== undefined) Focus.restoreScroll(this, restore.scrollTop);
      const keys = restore.focusKey === undefined ? [] : [Focus.byFocusKey(restore.focusKey)];
      const focused = Focus.focusFirst(root, [...keys, '.row-group .heading', '.page-title']);
      if (focused) Focus.keepInView(this, focused);
      return;
    }
    const section =
      heading === undefined
        ? null
        : root.querySelector<HTMLElement>(`[data-heading="${CSS.escape(heading)}"]`);
    // A cross-link lands on the section it names, which is scrolled to the top: its heading, else
    // its first control (a heading drawn as its Add row); the page's title sits scrolled away.
    const landed =
      section === null
        ? undefined
        : Focus.focusFirst(section, [':scope > .heading', ':scope [data-focus]']);
    const title = landed ?? Focus.focusFirst(root, ['.page-title']);
    const target = section ?? title?.closest('.page-head');
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
    if (this._pickingAt !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      this._endPick(true);
      return;
    }
    const wizard = this._quickSetup;
    // Quick Setup is a place of its own: Escape is its Back, or Cancel on its first step.
    const grab = this._grabbed();
    const action = escapeAction(event.composedPath(), this, {
      disclosure:
        wizard === undefined &&
        (this._drag !== undefined ||
          grab !== undefined ||
          this._colorOpenHere() ||
          this._auditEdit !== undefined ||
          this._openStrip !== undefined ||
          this._adding !== undefined ||
          this._split !== undefined),
      onPage:
        wizard !== undefined ||
        this._nav.route.kind !== 'overview' ||
        this._resultsLeft !== undefined ||
        (this._searchFrom !== undefined && !Filter.hasQuery(this._filter)),
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
      this._auditEdit === undefined
    ) {
      // Escape cancels Split This Calendar from any of its steps, as Cancel does.
      this._cancelSplit(true);
    } else if (action === 'close') {
      // The disclosure opened last closes, focus back on what opened it.
      const strip = this._openStrip;
      const edited = this._auditEdit?.line.text;
      const opener =
        edited !== undefined
          ? `more:audit:${edited}`
          : strip !== undefined
            ? `more:${strip}`
            : 'add-calendar';
      if (edited !== undefined) this._auditEdit = undefined;
      else if (strip !== undefined) this._openStrip = undefined;
      else this._adding = undefined;
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
   * Queues words for the live region and asks for the render that speaks them.
   *
   * @param message - A whole sentence
   */
  private _say(message: string): void {
    if (this._announcer.say(message)) this.requestUpdate();
  }

  /**
   * Layouts, a frame as Calendars is: the help above the rows, a row per layout whose radio picks
   * the layout the card opens in and whose rest opens the layout's page, the fallback note, then
   * Layout Defaults. The radios write through the frame the card's own display form always had,
   * and the Grid notice follows them.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @returns The block
   */
  private _renderLayouts(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const node = chassis.displayView[0] as { selector: { select: { options: unknown } } };
    const options = node.selector.select.options as ReadonlyArray<Overview.DisplayChoice>;
    const value = this._viewForConfig(this._config!);
    const t = this._t(ctx);
    const [before, after = ''] = t('layouts.help_switch').split('{link}');
    const help = html`<p class="hint">
        ${t('layouts.help_pick')} ${before}<button
          type="button"
          class="text-button"
          data-focus="layouts:switcher"
          @click=${this._openSwitcher}
        >
          ${t('layouts.help_switch_link')}</button
        >${after}
      </p>
      <p class="hint">${t('layouts.help_open')}</p>`;
    const defaults = Overview.navRow(
      {
        key: 'layout:shared',
        iconPath: mdiTuneVariant,
        title: t('layouts.defaults'),
        summary: t('overview.layout_defaults.summary'),
      },
      () => this._open({ kind: 'layout', layout: 'shared' }, 'layout:shared'),
    );
    return html`<section class="page-group layout-block" data-heading="starting_layout">
      <h3 class="heading" tabindex="-1">${t('overview.layouts')}</h3>
      ${Overview.layoutsControl(
        this._string(ctx, STARTING_LAYOUT_BLOCK.titleKey),
        help,
        options.map((choice) => ({
          ...choice,
          settingsName: t('layouts.settings_named').replace('{layout}', choice.label),
        })),
        value,
        EditorLocalize.lookup(ctx.language, 'view.helper'),
        html`<div class="rows layout-defaults">${defaults}</div>`,
        (view) => this._pickStartingLayout(ctx, chassis, value, view),
        (view) =>
          this._open(
            { kind: 'layout', layout: view as Workspace.EditorWorkspace },
            `layout:${view}`,
          ),
      )}
      ${this._renderGridReconciliation(ctx)}
    </section>`;
  }

  /**
   * Writes the layout the card opens in, with the switcher's list it keeps, as one step.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @param value - The layout it opens in now
   * @param view - The one picked
   */
  private _pickStartingLayout(
    ctx: SchemaCtx,
    chassis: Subforms.ChassisSchemas,
    value: Types.EffectiveView,
    view: string,
  ): void {
    const data = { view: value };
    const kept = Chips.layoutsKeptOnStart(this._config!, value, view as Types.EffectiveView);
    // The view, the Grid notice it brings and the switcher's list it keeps are one step.
    this._commit(
      this._string(ctx, 'history.change', { setting: this._string(ctx, 'view') }),
      undefined,
      () => {
        this._writeOwned(
          {
            owner: WriteFrames.CARD_OWNER,
            workspace: 'list',
            schema: chassis.displayView,
            data,
          },
          { view },
        );
        // After the view: the field's form counts the starting layout as offered, so under
        // the old one the list would read as unchanged and write nothing.
        if (kept !== undefined) {
          this._writeFieldValue(WriteFrames.CARD_OWNER, Chips.SWITCHER_LAYOUTS_FIELD, kept);
        }
      },
    );
  }

  /** The help's link: Card & Header, at the View Switcher chip, as a search result opens it. */
  private _openSwitcher = (): void => {
    const ctx = this._ctx;
    this._openResult(
      {
        target: { kind: 'field', id: 'card:toolbar.view_switcher' as FieldId, page: 'card_header' },
        label: this._string(ctx, 'layouts.help_switch_link'),
      },
      'layouts:switcher',
      false,
    );
  };

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
   * The overview: notices, Quick Setup's banner, the filter bar, then either what a query finds,
   * grouped by page, or Calendars, Whole Card's rows, Layouts and More.
   *
   * @param ctx - Schema context
   * @param chassis - The chassis schemas
   * @returns The overview
   */
  private _renderOverview(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const t = this._t(ctx);
    const { present } = this._drawing!;
    const head = html`${this._renderUpgrade(ctx)} ${this._renderNoticesRow(ctx)}
    ${
      this._banner
        ? Overview.quickSetupBanner(t, this._openQuickSetup, () => {
            this._banner = false;
          })
        : nothing
    }
    ${this._renderPickBanner(ctx)}
    ${
      this._searchFrom === undefined || this._resultsLeft !== undefined
        ? nothing
        : PageView.backToPage(
            this._string(ctx, 'search.back_to', { place: this._searchFrom.name }),
            this._back,
          )
    }
    ${this._renderFilterBar(ctx, chassis)}`;

    // One template whatever the query, so the filter bar above it is never drawn anew and the
    // search field keeps focus as the first character turns the overview into results.
    return html`<div class="overview">
      ${head} ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)}
      ${this._renderOverviewBody(ctx, chassis, present)}
    </div>`;
  }

  /**
   * What the overview draws below its filter bar: what a query finds, or Calendars, Whole Card's
   * rows, Layouts and More. Its results follow the layout the card opens in, or the page Search
   * Settings was pressed on (`_workspace`).
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
      // The preview line stays above the results.
      return html`${this._renderPreviewLine(ctx)} ${this._renderResults(ctx, present)}`;
    }
    // Calendars, then what the whole card shares, then the layouts, each a page of its own. Each
    // row says what its page holds, not the values it holds.
    const wholeRows = PAGES.filter((page) => WHOLE_CARD_PAGES.has(page.id)).map((page) =>
      Overview.navRow(
        {
          key: `nav:${page.id}`,
          iconPath: page.iconPath,
          title: this._pageTitle(page, ctx),
          summary: this._string(ctx, page.descriptionKey),
        },
        () => this._open({ kind: 'page', page: page.id }, `nav:${page.id}`),
      ),
    );
    const calendars = this._renderCalendars(ctx);
    return html`${calendars}
    ${Overview.rowGroup(
      t('overview.whole_card'),
      wholeRows,
      html`<p class="hint frame-hint">${t('overview.whole_card.hint')}</p>`,
    )}
    ${this._renderLayouts(ctx, chassis)}
    ${Overview.rowGroup(t('overview.more'), [
      Overview.navRow(
        {
          key: 'more:audit',
          iconPath: mdiFormatListChecks,
          title: t('more.audit'),
          summary: t('more.audit_note'),
        },
        () => this._open({ kind: 'audit' }, 'more:audit'),
      ),
      Overview.exampleRow(t, this._openQuickSetup),
    ])}`;
  }

  /**
   * A layout's name: List, Columns, Grid, Month, or Layout Defaults.
   *
   * @param workspace - The layout, `shared` for Layout Defaults
   * @param ctx - Schema context
   * @returns The name
   */
  private _layoutTitle(workspace: Workspace.EditorWorkspace, ctx: SchemaCtx): string {
    return workspace === 'shared'
      ? this._string(ctx, 'layouts.defaults')
      : this._string(ctx, `view.option.${workspace}.label`);
  }

  /**
   * The overview header's ⋯ menu: Show Every Setting and Show YAML Option Names, each a checkbox
   * item with its line under it. Turning one over writes this browser's preferences and nothing to
   * the card, and leaves the menu open.
   *
   * @param ctx - Schema context
   * @returns The menu button
   */
  private _renderPrefsMenu(ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const item = (key: keyof Prefs.Prefs, label: string, note: string): MenuView.MenuCheck => ({
      key,
      label,
      note,
      checked: this._prefs[key],
      onToggle: () => {
        this._prefs = { ...this._prefs, [key]: !this._prefs[key] };
        Prefs.writePrefs(this._prefs);
      },
    });
    return MenuView.prefsMenu({
      name: t('prefs.menu'),
      open: this._prefsOpen,
      // Every page draws every setting, so Show YAML Option Names is the one preference left.
      items: [item('yaml', t('prefs.yaml'), t('prefs.yaml_note'))],
      onOpen: (open, at) => {
        this._prefsOpen = open;
        if (open && at !== undefined) {
          void this.updateComplete.then(() => MenuView.focusMenuItem(this.shadowRoot!, at));
        }
      },
    });
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
      this._entryWorkspace(),
      ctx.language,
      this._entryKeys.join(),
      this._buttonKeys.join(),
      this.hass?.states,
      // Action values are worded through it, and Home Assistant loads its strings late.
      this.hass?.localize,
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
      entries: owners(this._entrySchemas(ctx)),
      entryWorkspace: this._entryWorkspace(),
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
    const pctx = this._planCtx(ctx);
    const layoutOf = this._resultLayouts(ctx, present);
    const rows = items.map((item): SearchView.ResultItem => {
      if (item.kind === 'calendars') return this._calendarsResult(item, query, ctx);
      const { hit } = item;
      const { entry } = hit;
      const { target, status } = entry;
      if (this._editHere && target.kind === 'field') {
        const field = present.get(target.id);
        const appearance = Plan.appearanceOf(target.id);
        if (field && appearance && (status.kind === 'live' || status.kind === 'add')) {
          const layout = layoutOf(entry);
          return {
            kind: 'field',
            key: `edit:${target.id}`,
            crumbs: layout === undefined ? entry.crumbs : [...entry.crumbs, layout],
            field: this._renderField(field, ctx, {
              ...(this._monthStartDateShow(field, ctx) ??
                this._fieldShow(field, appearance, pctx, ctx, CARD)),
              alone: true,
            }),
          };
        }
      }
      return { kind: 'row', row: this._resultRow(hit, query, ctx, layoutOf(entry)) };
    });
    return SearchView.resultList(
      {
        status: this._resultStatus,
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
   * Names the layout a card setting's result holds its value for, where layouts hold different
   * values for it: the scope its page opens in, "Grid" or "All Layouts". Where every layout reads
   * the same, the value needs no layout, and nor does a setting of the whole card or a calendar's.
   *
   * @param ctx - Schema context
   * @param present - The fields built here
   * @returns The namer: the layout's name, or `undefined`
   */
  private _resultLayouts(
    ctx: SchemaCtx,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): (entry: Search.SearchEntry) => string | undefined {
    const workspace = this._workspace;
    const data = new Map<Workspace.EditorWorkspace, Record<string, unknown>>();
    const read = (each: Workspace.EditorWorkspace, field: IndexedField): unknown => {
      let values = data.get(each);
      if (values === undefined) {
        values = Routing.workspaceFormData(this._config!, each, this._pending);
        data.set(each, values);
      }
      return Routing.atPath(values, field.dataPath, field.node.name);
    };
    return (entry) => {
      const { target, status } = entry;
      if (target.kind !== 'field' || (status.kind !== 'live' && status.kind !== 'add')) {
        return undefined;
      }
      const field = present.get(target.id);
      // A whole-card setting holds one value, however a layout reads it: Month reads Tomorrow and
      // Start of Week as Today.
      if (field === undefined || keepsNoLayoutCopy(field.id)) return undefined;
      const here = read(workspace, field);
      const differs = ViewConfig.VIEWS.some((view) => !Value.deepEqual(read(view, field), here));
      return differs ? this._layoutName(ctx)(workspace) : undefined;
    };
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
   * comes from and, with Show YAML Option Names on, its YAML path, its tag and the phrase a
   * helper-only match was found by. It is one action: choosing a setting not shown yet adds it.
   *
   * @param hit - The result
   * @param query - The query
   * @param ctx - Schema context
   * @returns The row
   */
  private _resultRow(
    hit: Search.SearchHit,
    query: string,
    ctx: SchemaCtx,
    layout?: string,
  ): SearchView.ResultRow {
    const t = this._t(ctx);
    const { entry } = hit;
    const key = this._resultKey(entry.target);
    const open = entry.target.kind === 'ha-tab' ? undefined : () => this._chooseResult(entry, key);
    return {
      key,
      label: entry.label,
      marks: Search.highlight(entry.label, query),
      crumbs: entry.crumbs,
      meta: this._resultMeta(entry, ctx, layout),
      tag: entry.tag,
      phrase: hit.phrase ? { template: t('search.help_phrase'), ...hit.phrase } : undefined,
      onOpen: open,
    };
  }

  /**
   * A result's line under its breadcrumb: its value, where the value comes from, and its YAML
   * path while Show YAML Option Names is on.
   *
   * @param entry - The result
   * @param ctx - Schema context
   * @param layout - The layout its value is for, where layouts differ (`_resultLayouts`)
   * @returns The line
   */
  private _resultMeta(entry: Search.SearchEntry, ctx: SchemaCtx, layout?: string): string {
    return [
      layout === undefined || entry.value === undefined || entry.value === ''
        ? entry.value
        : this._string(ctx, 'search.value_in', { layout, value: entry.value }),
      entry.words,
      entry.yamlPath === '' || !this._prefs.yaml
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
   * Chooses a result: a setting shown or waiting in an Add row opens at the field,
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
      this._leaveResults(this._scoped({ kind: 'page', page: target.page }), focusKey);
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
            : root.querySelector<HTMLElement>(`[data-heading="${target.block}"] > .heading`);
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
        // Another layout's setting opens on that layout's page for its topic.
        const views = status.views as ReadonlyArray<Workspace.EditorWorkspace>;
        this._openResult(
          { target, label: entry.label },
          focusKey,
          true,
          () =>
            this._string(ctx, 'search.showing_in', {
              label: entry.label,
              layout: this._layoutTitle(views[0], ctx),
            }),
          views[0],
        );
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
        // A calendar's option waiting on a card setting reads it in the calendar page's own
        // workspace, so the setting opens there, whatever layout the search began in.
        const prereqScope =
          target.kind === 'entry-field' && gateTarget.kind === 'field'
            ? this._entryWorkspace()
            : undefined;
        this._openResult(
          { target: gateTarget, label: labelOf(by) },
          focusKey,
          true,
          () =>
            this._string(ctx, 'search.needs_said', {
              label: entry.label,
              needs: entry.needs ?? '',
            }),
          prereqScope,
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
   * Reset, or on the line itself where the value is All Layouts'.
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
        ? this._entryRoute(target.key)
        : { kind: 'page', page: (target.kind === 'field' && target.page) || 'card_header' };
    this._leaveResults(route, focusKey);
    void this.updateComplete.then(() => {
      const line = Focus.focusFirst(this.renderRoot, [
        Focus.byFocusKey(`reset:${target.id}`),
        Focus.byFocusKey(`inactive:${target.id}`),
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
    this._nav = Navigation.go(this._nav, this._scoped(to), from);
    this._jump = this._resultsLeft = undefined;
  }

  /**
   * What a page draws under its header: each heading planned by `plan.ts`, what the
   * page holds besides its fields (the toolbar's own buttons, the column width table).
   *
   * @param page - The page
   * @param ctx - Schema context
   * @returns The body
   */
  private _renderPageBody(page: PageDef, ctx: SchemaCtx): unknown[] {
    // The page being drawn, so a copy of a whole-card setting on a topic says Whole Card.
    const pctx: Plan.PlanCtx = { ...this._planCtx(ctx), page: page.id };
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
    );
    if (page.id === 'size_spacing') {
      const layout = PANELS.find((panel) => panel.id === 'layout')!;
      parts.push(...(layout.extras?.(ctx) ?? []).map((extra) => this._renderExtra(extra)));
    }
    return parts;
  }

  /**
   * A heading's chips of one kind: the event parts, or the toolbar's controls.
   *
   * A chip is drawn where its field is offered in the scope at all (`chips.ts` › `inScope`), so
   * Now is absent in Grid and a line says so. A part offered but withheld by its gate is drawn
   * unpressable with its reason, so End Time and Duration stay in sight while Time is off; a
   * toolbar control is drawn only while the toolbar is. Pressed is the field's effective value in
   * the scope, and a press writes the other value through `_writeFieldValue`, one undo step. Each
   * chip's name carries its state words, as any field's does; under the chips, the
   * chips named by those words ("Set: Countdown, End Time · Default: Location") with one Reset for
   * every chip stored here, the not-in-scope line, and the hint.
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
    const placed = Plan.fieldsInDrawOrder(heading, workspace, present).filter(
      ([, appearance]) =>
        typeof appearance === 'object' && 'chips' in appearance && appearance.chips === kind,
    );
    // The chips by where their state comes from: stored here, from All Layouts, this layout's own
    // default. A chip a layout defaults otherwise reads as wrongly off without its fact.
    const sources = new Map<'set' | 'source' | 'layout', string[]>();
    // The chips stored here, which the group's one Reset resets.
    const stored: IndexedField[] = [];
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
      const stateKind = state?.words?.kind;
      const words = stateKind === 'layout-default' ? t('state.default') : Shown.stateText(state, t);
      const where =
        stateKind === 'from-all-layouts'
          ? 'source'
          : stateKind === 'layout-default'
            ? 'layout'
            : words === undefined
              ? undefined
              : 'set';
      // Each part says whether it is on, so where its state comes from never reads as "on".
      const named = t('chip.part_state', {
        part: label(id),
        state: t(pressed ? 'summary.on' : 'summary.off'),
      });
      if (where !== undefined) sources.set(where, [...(sources.get(where) ?? []), named]);
      if (this._resetActionOf(id, appearance, pctx, CARD) !== undefined) stored.push(field);
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
              () =>
                this._writeFieldValue(
                  WriteFrames.CARD_OWNER,
                  id,
                  Chips.pressValue(id, pressed, this._legendForm),
                ),
              `field:${id}`,
            ),
        },
      ];
    });
    if (chips.length === 0) return nothing;
    // The qualifier lines' fields stored here are part of the group's facts and its one Reset.
    const qualifiers = kind === 'toolbar' ? this._qualifierFields(heading, present) : [];
    for (const field of qualifiers) {
      const state = Plan.stateOf(field, pctx);
      const stateKind = state?.words?.kind;
      const where =
        stateKind === 'from-all-layouts'
          ? 'source'
          : stateKind === 'layout-default'
            ? 'layout'
            : Shown.stateText(state, t) === undefined
              ? undefined
              : 'set';
      const named = fieldLabel(field, ctx.language);
      if (where !== undefined) sources.set(where, [...(sources.get(where) ?? []), named]);
      if (this._resetActionOf(field.id, Plan.appearanceOf(field.id)!, pctx, CARD) !== undefined) {
        stored.push(field);
      }
    }
    const absent = placed.map(([id]) => id).filter((id) => !Chips.inScope(id, workspace));
    const view = Workspace.viewForWorkspace(workspace);
    // Month's parts that act on its day list and panel alone, which its weeks never draw.
    const dayList =
      view === 'month'
        ? chips
            .map(({ id }) => id)
            .filter((id) => {
              const field = present.get(id);
              return field !== undefined && Plan.readsInMonthDayListOnly(field);
            })
        : [];
    // In the order a setting's facts take: stored here, then where the rest come from.
    const order = ['set', 'source', 'layout'] as const;
    const facts: Shown.Fact[] = order
      .filter((where) => sources.has(where))
      .map((where) => [where, sources.get(where)!] as const)
      .map(([where, names]) =>
        where === 'set'
          ? { kind: 'set', text: t('chip.chosen_here', { names: names.join(', ') }) }
          : where === 'source'
            ? {
                kind: 'source',
                text: t('summary.pair', {
                  label: t('state.from_all_layouts'),
                  value: names.join(', '),
                }),
              }
            : {
                kind: 'layout',
                view,
                text:
                  view === undefined
                    ? t('summary.pair', { label: t('state.default'), value: names.join(', ') })
                    : t('state.layout_default', { layout: layout(view), value: names.join(', ') }),
              },
      );
    const action = kind === 'parts' ? t('reset.parts') : t('reset.controls');
    const names = stored.map((field) =>
      field.id in Chips.CHIP_LABELS ? label(field.id) : fieldLabel(field, ctx.language),
    );
    const actions: ShownView.LineButton[] =
      stored.length === 0
        ? []
        : [
            {
              label: action,
              name: t('reset.group_named', { action, names: names.join(', ') }),
              focus: `reset-chips:${kind}`,
              kind: 'reset',
              resetKeys: stored.map((field) => this._storedKeys(field, pctx, CARD)).join(' '),
              onPress: () => this._resetChips(stored, action, chips[0]?.id, heading.key),
            },
          ];
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
        facts.length > 0
          ? html`<div class="chip-source">${ShownView.factLine(facts, actions)}</div>`
          : ShownView.fieldLine({ notes: [], actions })
      }
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
      ${
        dayList.length > 0
          ? html`<p class="hint">
              ${t('chip.day_list', { names: dayList.map(label).join(', ') })}
            </p>`
          : nothing
      }
      <p class="hint">${t(kind === 'parts' ? 'chip.hint' : 'toolbar.controls.hint')}</p>
      ${kind === 'toolbar' ? this._renderQualifiers(heading, ctx) : nothing}`;
  }

  /**
   * The fields a heading draws as qualifier lines, present here: Layouts in Switcher.
   *
   * @param heading - The heading
   * @param present - The fields built here
   * @returns The fields, in registry order
   */
  private _qualifierFields(
    heading: HeadingDef,
    present: ReadonlyMap<FieldId, IndexedField>,
  ): IndexedField[] {
    return heading.fields.flatMap(([id, appearance]) =>
      typeof appearance === 'object' && 'qualifies' in appearance ? (present.get(id) ?? []) : [],
    );
  }

  /**
   * The qualifier lines under the toolbar's chips, one for each pressed control that has a choice,
   * in the chips' order: View Switcher's layouts as checkboxes, Calendar Filter's form as radios.
   * A control that is not pressed has none.
   *
   * @param heading - The toolbar's heading
   * @param ctx - Schema context
   * @returns The lines
   */
  private _renderQualifiers(heading: HeadingDef, ctx: SchemaCtx): TemplateResult[] {
    const present = this._drawing!.present;
    const data = this._formData();
    const lines: TemplateResult[] = [];
    for (const [id] of heading.fields) {
      const chip = present.get(id);
      if (chip === undefined || !(id in Chips.CHIP_LABELS)) continue;
      if (!Chips.isPressed(Routing.atPath(data, chip.dataPath, chip.node.name))) continue;
      if (id === LEGEND_FIELD) {
        lines.push(this._legendQualifier(chip, ctx));
        continue;
      }
      for (const [each, appearance] of heading.fields) {
        if (typeof appearance !== 'object' || !('qualifies' in appearance)) continue;
        if (appearance.qualifies !== id) continue;
        const field = present.get(each);
        if (field === undefined) continue;
        const line = this._renderSwitcherLayouts(field, ctx);
        lines.push(
          this._jump?.target.kind === 'field' && this._jump.target.id === each
            ? this._jumpTo(ctx, line)
            : line,
        );
      }
    }
    return lines.length === 0 ? [] : [html`<div class="qualifiers">${lines}</div>`];
  }

  /**
   * A radio group of a field's options with no head row: Start Date's chips. Its state words are
   * in its name, and the line under it holds its facts with Reset after Set, named for what it
   * leaves. Picking writes through `_writeFieldValue`, one undo step.
   *
   * @param field - Start Date's mode
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
    const show =
      this._monthStartDateShow(field, ctx) ??
      this._fieldShow(field, appearance, pctx, ctx, CARD, heading);
    const drawn = this._renderStartDate(field, ctx, show);
    return this._jump?.target.kind === 'field' && this._jump.target.id === field.id
      ? this._jumpTo(ctx, drawn)
      : drawn;
  }

  /**
   * The shortcut the card stores for Start Date, Tomorrow or Start of Week, where Month's page
   * draws it, which reads it as Today.
   *
   * @param ctx - Schema context
   * @returns The shortcut, or `undefined` on another page or for any other start date
   */
  private _monthStartDateShortcut(ctx: SchemaCtx): 'tomorrow' | 'start_of_week' | undefined {
    if (Workspace.viewForWorkspace(ctx.workspace ?? ctx.view) !== 'month') return undefined;
    const mode = Synthetic.startDateMode({
      start_date: this._rawConfig.start_date,
    } as Types.Config);
    return mode === 'tomorrow' || mode === 'start_of_week' ? mode : undefined;
  }

  /**
   * The line under Start Date on Month's page while the card stores Tomorrow or Start of Week:
   * Whole Card, and what the other layouts start on ("Start of Week in List, Columns, and Grid").
   * Month reads those as Today (`Synthetic.startDateModeIn`), so the line has no Set and no Reset,
   * which would change those layouts alone. It stays while Relative to Today is held over one,
   * whose Expression then shows that shortcut. Any other start date takes the usual line.
   *
   * @param field - Start Date's mode field
   * @param ctx - Schema context
   * @returns The line, or `undefined` for the usual one
   */
  private _monthStartDateShow(field: IndexedField, ctx: SchemaCtx): FieldShow | undefined {
    if (field.id !== START_DATE_FIELD) return undefined;
    const mode = this._monthStartDateShortcut(ctx);
    if (mode === undefined) return undefined;
    const value = this._string(ctx, `${field.node.name}.option.${mode}.label`);
    const layout = this._layoutName(ctx);
    const layouts = EditorLocalize.formatList(
      ctx.language,
      ViewConfig.VIEWS.filter((view) => view !== 'month').map(layout),
      'conjunction',
    );
    return {
      line: ShownView.fieldLine({
        notes: [],
        actions: [],
        facts: [
          { kind: 'scope', text: this._string(ctx, 'state.whole_card') },
          {
            kind: 'source',
            text: this._string(ctx, 'state.start_date_layouts', { value, layouts }),
          },
        ],
      }),
    };
  }

  /**
   * Calendar Filter's qualifier line, under the chips while it is pressed: its form, Menu or Chips,
   * as native radios. Choosing one writes it, and pressing the chip on again later in this editing
   * session writes the form last named, here or in the YAML.
   *
   * @param field - `card:toolbar.legend`
   * @param ctx - Schema context
   * @param show - Its state words and the line under it, where drawn alone
   * @returns The line
   */
  private _legendQualifier(field: IndexedField, ctx: SchemaCtx, show?: FieldShow): TemplateResult {
    const id = field.id;
    const name = fieldLabel(field, ctx.language);
    const workspace = ctx.workspace ?? ctx.view;
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const value = Routing.atPath(all, field.dataPath, field.node.name);
    return ChipsView.qualifier({
      qualifies: id,
      legend: this._string(ctx, 'chip.qualifier.legend'),
      kind: 'radio',
      words: show?.words,
      choices: Chips.LEGEND_FORMS.map((form) => ({
        value: form,
        label: this._string(ctx, `toolbar.legend.option.${form}.label`),
        checked: value === form,
      })),
      notes: [{ text: this._string(ctx, 'toolbar.legend.helper') }],
      line: show?.line,
      onPick: (next) => {
        this._legendForm = next as Types.ToolbarLegendMode;
        this._commit(
          this._string(ctx, 'history.change', { setting: name }),
          undefined,
          () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, next, workspace),
          `field:${id}`,
        );
      },
    });
  }

  /**
   * Calendar Filter alone, as Stored Settings' Edit and a search result's Edit Here mount
   * it: its chip, and while it is pressed its qualifier line, so its one option reads and writes
   * as its page draws it.
   *
   * @param field - `card:toolbar.legend`
   * @param ctx - Schema context, for the line's scope
   * @param show - Its state words and the line under it
   * @returns The chip and its line
   */
  private _renderLegendAlone(
    field: IndexedField,
    ctx: SchemaCtx,
    show?: FieldShow,
  ): TemplateResult {
    const workspace = ctx.workspace ?? ctx.view;
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const pressed = Chips.isPressed(Routing.atPath(all, field.dataPath, field.node.name));
    return html`${this._renderLoneChip(field, ctx)}
    ${pressed ? this._legendQualifier(field, ctx, show) : (show?.line ?? nothing)}`;
  }

  /**
   * One part or toolbar control as the chip its page draws it as, alone: Stored Settings'
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
              () =>
                this._writeFieldValue(
                  WriteFrames.CARD_OWNER,
                  id,
                  Chips.pressValue(id, pressed, this._legendForm),
                  workspace,
                ),
              `field:${id}`,
            ),
        },
      ],
      false,
    );
  }

  /**
   * View Switcher's qualifier line, under the chips while it is pressed: a checkbox per layout
   * (`chips.ts` › `layoutChips`), checked for each layout the switcher offers. The starting
   * layout's and, beside it alone, the one other layout's stay checked, focusable and
   * `aria-disabled`, their reason after their name and read in it. A check writes the whole list
   * through `_writeFieldValue`, one undo step, so checking every layout again leaves the default.
   *
   * @param field - `card:toolbar.view_switcher_layouts`
   * @param ctx - Schema context
   * @param show - Its state words and the line under it, where drawn alone
   * @returns The line
   */
  private _renderSwitcherLayouts(
    field: IndexedField,
    ctx: SchemaCtx,
    show?: FieldShow,
  ): TemplateResult {
    const id = field.id;
    const workspace = ctx.workspace ?? ctx.view;
    const all = this._formDataFor(this._config!, workspace, this._pending);
    const value = Routing.atPath(all, field.dataPath, field.node.name);
    const offered: ReadonlyArray<unknown> = Array.isArray(value) ? value : [];
    const starting = this._viewForConfig(this._config!);
    const name = fieldLabel(field, ctx.language);
    const choices = Chips.layoutChips(offered, starting).map((chip): ChipsView.QualifierChoice => ({
      value: chip.view,
      label: this._string(ctx, `view.option.${chip.view}.label`),
      checked: chip.pressed,
      kept:
        chip.kept === undefined
          ? undefined
          : this._string(ctx, chip.kept === 'starting' ? 'chip.kept_starting' : 'chip.kept_second'),
    }));
    // A list written by hand can offer the starting layout alone: then the switcher is on and the
    // card draws none, which the line under the checkboxes says, and the group is described by.
    const alone = Chips.switcherAlone(this._config!, starting)
      ? `alone-${id.replace(/\W/g, '-')}`
      : undefined;
    return ChipsView.qualifier({
      qualifies: 'card:toolbar.view_switcher',
      field: id,
      legend: this._string(ctx, 'chip.qualifier.layouts'),
      kind: 'checkbox',
      words: show?.words,
      choices,
      notes:
        alone === undefined ? [] : [{ id: alone, text: this._string(ctx, 'chip.switcher_alone') }],
      line: show?.line,
      onPick: (view) => {
        const next = Chips.pressLayout(offered, starting, view as Types.EffectiveView);
        if (next === undefined) return;
        this._commit(
          this._string(ctx, 'history.change', { setting: name }),
          undefined,
          () => this._writeFieldValue(WriteFrames.CARD_OWNER, id, next, workspace),
          `field:${id}`,
        );
      },
    });
  }

  /**
   * The line a page draws for the layout it edits, where it has one (`PageDef.noteKeyByView`):
   * Month's Event Appearance and Weather say what its weeks draw.
   *
   * @param page - The page
   * @param scope - The layout it edits, if any
   * @param ctx - Schema context
   * @returns The line, or nothing
   */
  private _renderLayoutNote(
    page: PageDef,
    scope: Workspace.EditorWorkspace | undefined,
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const view = scope === undefined ? undefined : Workspace.viewForWorkspace(scope);
    const key = view === undefined ? undefined : page.noteKeyByView?.[view];
    return key === undefined ? nothing : PageView.pageLine(this._string(ctx, key));
  }

  /**
   * A section page: its header, named for the layout it edits or for the whole card, the line
   * that jumps to the same topic in another layout, its note, its headings, the row walking on to
   * the next topic, and Back at its foot.
   *
   * @param page - The page
   * @param ctx - Schema context
   * @returns The page
   */
  private _renderPage(page: PageDef, ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const route = this._nav.route;
    const scope = route.kind === 'page' ? route.scope : undefined;
    const whole = WHOLE_CARD_PAGES.has(page.id) || scope === undefined;
    const sub = whole ? t('overview.whole_card') : this._layoutTitle(scope, ctx);
    const lead = whole
      ? PageView.pageLine(this._string(ctx, 'value_source.card'))
      : this._renderAlsoFor(page, scope, ctx);
    const next = whole ? undefined : this._nextTopic(page.id, scope);
    return html`<div class="page" data-page=${page.id}>
      ${PageView.pageHead(
        this._pageTitle(page, ctx),
        t,
        this._back,
        this._renderHeadActions(ctx, this._pageTitle(page, ctx)),
        sub,
      )}
      ${this._renderPickBanner(ctx)} ${this._jumpDrawn() ? nothing : this._renderReturn(ctx)}
      ${lead} ${this._renderPreviewLine(ctx)}
      ${page.noteKey ? PageView.pageLine(this._string(ctx, page.noteKey)) : nothing}
      ${this._renderLayoutNote(page, scope, ctx)} ${this._renderPageBody(page, ctx)}
      ${
        next === undefined
          ? nothing
          : PageView.continueRow(
              t('layouts.continue_with'),
              `${this._layoutTitle(next.scope, ctx)} · ${this._pageTitle(next.page, ctx)}`,
              () =>
                this._open(
                  { kind: 'page', page: next.page.id, scope: next.scope },
                  'continue',
                  'replace',
                ),
            )
      }
      ${PageView.footBack(t, this._back, docsUrl(page.id))}
    </div>`;
  }

  /**
   * A topic page's "Also for" line: the same topic in each other layout, and Layout Defaults.
   *
   * @param page - The topic
   * @param scope - The layout it is open in
   * @param ctx - Schema context
   * @returns The line
   */
  private _renderAlsoFor(
    page: PageDef,
    scope: Workspace.EditorWorkspace,
    ctx: SchemaCtx,
  ): TemplateResult {
    // The same topic wherever a scope has it: Layout Defaults has no Weather.
    const others = [...ViewConfig.VIEWS, 'shared' as const].filter(
      (each) => each !== scope && topicsFor(each).some((topic) => topic.id === page.id),
    );
    return PageView.alsoFor(
      this._string(ctx, 'layouts.also_for'),
      others.map((each) => ({
        label: this._layoutTitle(each, ctx),
        key: `also:${each}`,
        onOpen: () => {
          // The same topic in another layout: a setting opened here stays open there.
          const added = this._added;
          this._open({ kind: 'page', page: page.id, scope: each }, `also:${each}`, 'replace');
          this._added = added;
        },
      })),
    );
  }

  /**
   * Where a topic page's Continue row goes: the layout's next topic, else the next layout's first;
   * the walk takes List, Columns, Grid and Month in turn and ends after Month, and Layout Defaults
   * walks its own four topics only.
   *
   * @param id - The topic open
   * @param scope - The layout it is open in
   * @returns The next topic and its layout, or `undefined` at the end
   */
  private _nextTopic(
    id: PageId,
    scope: Workspace.EditorWorkspace,
  ): { readonly page: PageDef; readonly scope: Workspace.EditorWorkspace } | undefined {
    const topics = topicsFor(scope);
    const at = topics.findIndex((each) => each.id === id);
    if (at < 0) return undefined;
    if (at + 1 < topics.length) return { page: topics[at + 1], scope };
    if (scope === 'shared') return undefined;
    const view = ViewConfig.VIEWS[ViewConfig.VIEWS.indexOf(scope) + 1];
    return view === undefined ? undefined : { page: topicsFor(view)[0], scope: view };
  }

  /**
   * A layout's page: its name, a line saying it changes nothing on the card, and a row per topic,
   * each saying what it holds. Layout Defaults is the same page for the shared base, without
   * Weather.
   *
   * @param layout - The layout, `shared` for Layout Defaults
   * @param ctx - Schema context, in the layout
   * @returns The page
   */
  private _renderLayoutPage(layout: Workspace.EditorWorkspace, ctx: SchemaCtx): TemplateResult {
    const t = this._t(ctx);
    const title = this._layoutTitle(layout, ctx);
    const rows = topicsFor(layout).map((page) =>
      Overview.navRow(
        {
          key: `nav:${page.id}`,
          iconPath: page.iconPath,
          title: this._pageTitle(page, ctx),
          summary: this._string(ctx, page.descriptionKey),
        },
        () => this._open({ kind: 'page', page: page.id, scope: layout }, `nav:${page.id}`),
      ),
    );
    return html`<div class="page layout-page" data-layout=${layout}>
      ${PageView.pageHead(
        title,
        t,
        this._back,
        this._renderHeadActions(ctx, title),
        layout === 'shared' ? t('overview.layouts') : t('layouts.layout'),
      )}
      ${this._renderPickBanner(ctx)} ${this._renderReturn(ctx)}
      ${PageView.pageLine(
        layout === 'shared' ? t('settings_for.help_shared') : t('layouts.page_note'),
      )}
      ${this._renderPreviewLine(ctx)}
      <section class="row-group"><div class="rows">${rows}</div></section>
      ${PageView.footBack(t, this._back)}
    </div>`;
  }

  /**
   * Renders panel content that is not a form field: a width table, or the fit summary, whose
   * columns are the layouts and whose rows the card widths.
   *
   * @param extra - Content to render
   * @returns The template
   */
  private _renderExtra(extra: PanelExtra): TemplateResult {
    if (extra.kind === 'fit-summary') {
      return html`
        <div class="width-table fit-summary">
          <div class="width-table-title">${extra.title}</div>
          <table>
            <tr>
              <td></td>
              ${extra.layouts.map((layout) => html`<th scope="col">${layout}</th>`)}
            </tr>
            ${extra.rows.map(
              (row) => html`
                <tr>
                  <th scope="row" class="width-table-width">${row.width}</th>
                  ${row.cells.map((cell) => html`<td class="width-table-layout">${cell}</td>`)}
                </tr>
              `,
            )}
          </table>
        </div>
      `;
    }
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
   * Each calendar entry's form, across the layouts its page is built for (`field-index.ts` ›
   * `entrySchemaAcross`): a field some layout of the card applies is drawn, wherever the editor is.
   * Kept while the configuration, the page's workspace and the language are the same, as every
   * render asks for it several times.
   *
   * @param ctx - Schema context, for its language
   * @returns Every entry, with its key and its schema
   */
  private _entrySchemas(ctx: SchemaCtx) {
    const entries = this._config?.entities ?? [];
    const keys = this._entryKeysFor(entries.length);
    // The calendar page's own context, not the place's: a search begun on Layout Defaults or on
    // another layout's page judges a calendar's fields as its page draws them.
    const workspace = this._entryWorkspace();
    const held = this._entriesAcross;
    if (
      held !== undefined &&
      held.config === this._config &&
      held.workspace === workspace &&
      held.language === ctx.language &&
      held.keys.length === keys.length &&
      held.keys.every((key, at) => key === keys[at])
    ) {
      return held.entries;
    }
    const built = entries.map((entry, index) => ({
      entry,
      index,
      key: keys[index],
      schema: entrySchemaAcross(entry, this._ctxIn(workspace)).schema,
    }));
    this._entriesAcross = {
      config: this._config,
      workspace,
      language: ctx.language,
      keys: [...keys],
      entries: built,
    };
    return built;
  }

  /** The entries' forms `_entrySchemas` built last, and what they were built for. */
  private _entriesAcross?: {
    readonly config: Types.Config | undefined;
    readonly workspace: Workspace.EditorWorkspace | undefined;
    readonly language: string;
    readonly keys: ReadonlyArray<number>;
    readonly entries: ReadonlyArray<{
      readonly entry: string | Types.EntityConfig;
      readonly index: number;
      readonly key: number;
      readonly schema: HaFormSchema[];
    }>;
  };

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
   * The text or emoji a row is labeled with, where its label is one rather than an icon.
   *
   * @param entry - The entry
   * @returns The label, or `undefined`
   */
  private _rowBadge(entry: string | Types.EntityConfig): string | undefined {
    const label = Entities.asEntityConfig(entry).label;
    return Entities.labelTypeOf(entry) === 'text' && typeof label === 'string' && label !== ''
      ? label
      : undefined;
  }

  /**
   * What a row is labeled with, resolved as the card resolves it beside an event: Home
   * Assistant's icon for the `home-assistant` sentinel, a person's picture for `person.…`, and
   * the shape `label_type` names over the one the value looks like.
   *
   * @param entry - The entry
   * @returns The label, or `undefined` where the card would draw none
   */
  private _rowLabel(entry: string | Types.EntityConfig): CalendarView.RowLabel | undefined {
    const label = Entities.resolvedLabel(entry, this.hass);
    if (label === undefined) return undefined;
    const color = Entities.asEntityConfig(entry).label_icon_color;
    return label.type === 'icon' && color ? { ...label, color } : label;
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
          icon: mdiArrowUp,
          name: this._string(ctx, 'strip.move_up', { name }),
          keys: onPage ? this._string(ctx, 'strip.key_up') : undefined,
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, place - 1, `${focus}up`),
        },
        {
          id: 'down',
          label: this._string(ctx, 'toolbar.buttons.move_down'),
          icon: mdiArrowDown,
          name: this._string(ctx, 'strip.move_down', { name }),
          keys: onPage ? this._string(ctx, 'strip.key_down') : undefined,
          disabled: last,
          onPress: () => this._moveCalendar(entityId, place + 1, `${focus}down`),
        },
        {
          id: 'top',
          label: this._string(ctx, 'strip.move_top_label'),
          icon: mdiFormatVerticalAlignTop,
          name: this._string(ctx, 'strip.move_top', { name }),
          disabled: place === 0,
          onPress: () => this._moveCalendar(entityId, 0, `${focus}top`),
        },
      );
    }
    if (entryKey === undefined) {
      const remove = this._string(ctx, 'strip.remove_calendar', { name, count: total });
      actions.push({
        id: 'remove',
        // A calendar's row stands over several entries, and Remove takes all of them.
        label: total > 1 ? remove : this._string(ctx, 'entity.remove'),
        icon: mdiDeleteOutline,
        name: total > 1 ? remove : interpolate(this._string(ctx, 'strip.remove'), { name }),
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
        icon: mdiCallSplit,
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
        icon: mdiContentDuplicate,
        name: this._string(ctx, 'strip.duplicate', { name: entryName }),
        onPress: () => this._duplicateEntry(entryKey),
      },
      {
        id: 'copy',
        label: this._string(ctx, 'entity.copy'),
        icon: mdiContentCopy,
        name: this._string(ctx, 'strip.copy', { name: entryName }),
        disabled: !Entities.hasTransferableSettings(entry),
        onPress: () => this._copyEntry(entryKey),
      },
      {
        id: 'paste',
        label: this._string(ctx, 'entity.paste'),
        icon: mdiContentPaste,
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
        icon: mdiDeleteOutline,
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
    const grab = this._grabbed('calendar');
    const calendars = CalendarList.groups(state);
    // Every row keeps a label slot once any has a label, so the names align.
    const labelSlot = entities.some((entry) => this._rowLabel(entry) !== undefined);
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
        // Inside a calendar listed more than once, each entry is numbered and says when it keeps
        // the very events an earlier one keeps, which shows each of them twice. A row names the
        // events it keeps, never how many settings it stores.
        const same = grouped ? CalendarList.sameEventsAs(state, row.index) : undefined;
        const tail =
          same === undefined ? [] : [this._string(ctx, 'row.same_events', { position: same })];
        const described = grouped ? [name, position, ...parts, ...tail] : [name, ...parts];
        return [
          {
            key: row.key,
            title: grouped
              ? [String(row.position), ...parts].join(Summary.SUMMARY_SEPARATOR)
              : name,
            summary: (grouped ? tail : parts).join(Summary.SUMMARY_SEPARATOR),
            editName: this._string(ctx, 'calendars.edit', {
              row: described.join(', '),
            }),
            color: this._rowColor(entry),
            label: this._rowLabel(entry),
            labelSlot,
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
   * A row's drag handle, a calendar's or a toolbar button's: Space picks it up and
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
      ${this._renderStatus(ctx, ['story'])} ${this._renderStartedWith(ctx)}
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
   * On a fresh card, the line naming the calendar Home Assistant started it with, which nobody
   * chose (`quick-setup.ts` › `startedWith`), with Change Calendar, which opens its entry's page
   * at its Calendar field.
   *
   * @param ctx - Schema context
   * @returns The line, or nothing
   */
  private _renderStartedWith(ctx: SchemaCtx): TemplateResult | typeof nothing {
    const calendar = QuickSetup.startedWith(this._rawConfig, this._pickerCalendar);
    if (calendar === undefined) return nothing;
    const [key] = this._entryKeysFor(1);
    return html`<div class="started-with" data-started-with>
      <span
        >${this._string(ctx, 'calendars.started_with', { name: this._calendarName(calendar) })}</span
      >
      <button
        type="button"
        class="text-button"
        data-focus="started-with"
        @click=${() => {
          this._open({ kind: 'entry', key }, 'started-with');
          this._focusSoon([Focus.byFocusKey('entry-calendar')]);
        }}
      >
        ${this._string(ctx, 'calendars.change')}
      </button>
    </div>`;
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
          iconPath: mdiPlus,
          onPress: () => {
            this._adding = {};
            void this.updateComplete.then(() => {
              const picker = this.renderRoot.querySelector<HTMLElement>(
                Focus.byFocusKey('add-picker'),
              );
              if (picker) Focus.focusInto(picker);
            });
          },
        },
        ' add-action',
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
      // entry's page always draws its accent's mode; drawn alone (Stored Settings' Edit),
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
          aria-label=${groupName(fieldLabel(field, ctx.language), show)}
          aria-describedby=${describedBy(show)}
        >
          ${this._renderEntryColor(key, field.id, ctx, show?.words, show?.describedBy === undefined)}
          ${show?.line ?? nothing}
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
    const name = parseFieldId(field.id).name;
    const helpedValue = Entities.HELPER_FOR_VALUE[name];
    const text = this._fieldText(
      slot,
      field,
      ctx,
      show?.words,
      // Behind the setting's ⓘ where its head draws one; else only for the value it explains.
      show?.describedBy === undefined && (helpedValue === undefined || data[name] === helpedValue),
    );
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
      aria-label=${groupName(fieldLabel(field, ctx.language), show)}
      aria-describedby=${describedBy(show)}
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
      aria-label=${groupName(fieldLabel(field, ctx.language), show)}
      aria-describedby=${describedBy(show)}
      @context-request=${(event: Event) => provideCalendar(event, entityId)}
    >
      ${
        // Behind its head's ⓘ where it has one, so it is never shown twice.
        show?.describedBy === undefined
          ? html`<div class="entity-visibility-helper">
              ${this._string(ctx, 'entity.visibility.helper')}
            </div>`
          : nothing
      }
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
   * The line under a word list the card cannot read: Blocklist and Allowlist, built
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
    let intro: string;
    let body: unknown;
    let next: CalendarView.TextButton;
    if (session.step === 0) {
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
    const stepOf = t('split.step_of', { step: session.step + 1, total: '3' });
    return SplitView.splitTask({
      name: t('split.title'),
      steps,
      step: session.step,
      stepOf,
      stepLine: `${stepOf}${Summary.SUMMARY_SEPARATOR}${steps[session.step]}`,
      closeName: t('quick_setup.cancel'),
      onClose: () => this._cancelSplit(true),
      title: t('split.named', { name }),
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
        summary: parts.slice(1).join(Summary.SUMMARY_SEPARATOR),
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
   * entry's ⋮; Previous and Next Calendar; the warnings and notices that concern it; the preview
   * line; its Calendar; its groups; and Remove and Back at its foot.
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
    // Inside a calendar listed more than once, the line under the heading says which entry this
    // is, before the calendar's id, so the heading keeps to one line on a phone.
    const occurrence = single
      ? undefined
      : this._string(ctx, 'entity.occurrence', { position: row.position, total: row.total });
    const title = name;
    const sub =
      occurrence === undefined ? entityId : `${occurrence}${Summary.SUMMARY_SEPARATOR}${entityId}`;
    const notice = this._entryNotice?.key === key ? this._entryNotice : undefined;
    const declared = this._entrySchemas(ctx).find((each) => each.key === key)!;
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
    );
    return html`<div
      class="page entry-page"
      data-page=${`entry:${key}`}
      data-entry-key=${key}
      data-move-calendar=${single ? entityId : nothing}
    >
      ${PageView.pageHead(
        title,
        t,
        this._back,
        html`${this._renderHeadActions(
          ctx,
          occurrence === undefined ? title : `${title}${Summary.SUMMARY_SEPARATOR}${occurrence}`,
        )}
        ${more}`,
        sub,
        this._string(ctx, 'entry.back'),
      )}
      ${this._renderPickBanner(ctx)} ${this._renderPreviewLine(ctx)}
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
      ${this._renderSplitDone(key, ctx)}
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
            iconPath: mdiDeleteOutline,
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
      ${PageView.footBack(t, this._back, docsUrl('entry'))}
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
      <button
        type="button"
        class="text-button with-icon add-action add-button"
        @click=${this._addButton}
      >
        ${icon(mdiPlus)}${this._string(ctx, 'toolbar.buttons.add')}
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
          ${actionHelper(field, fieldHelper(field, ctx))}
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
    // The card's language is still on its way, and nothing has been drawn yet (`_language`).
    if (this._drawnLanguage === undefined) return nothing;
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
    for (const { entry, key, schema } of this._entrySchemas(ctx)) {
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
                  : route.kind === 'layout'
                    ? this._renderLayoutPage(route.layout, ctx)
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
    const names = QUICK_SETUP_STEPS.map((step) => this._string(ctx, `quick_setup.step.${step}`));
    const stepLine = this._string(ctx, 'quick_setup.step', {
      step: index + 1,
      steps: QUICK_SETUP_STEPS.length,
      name: names[index],
    });

    return html`
      <div class="card-config" @keydown=${this._onKeydown}>
        <div
          class="quick-setup wizard"
          data-quick-setup=${session.step}
          role="group"
          aria-labelledby="quick-setup-title"
        >
          ${Wizard.wizardHead({
            iconPath: mdiCreation,
            title: this._string(ctx, 'quick_setup.title'),
            titleClass: 'quick-setup-title',
            level: 2,
            stepLine,
            stepClass: 'quick-setup-step',
            id: 'quick-setup',
          })}
          ${Wizard.wizardProgress(names, index, stepLine, 'quick-setup-progress')}
          ${this._renderQuickSetupStep(ctx, session)}
          <div class="wizard-actions quick-setup-actions">
            <button
              type="button"
              class="text-button"
              data-quick-setup-cancel
              @click=${this._cancelQuickSetup}
            >
              ${this._string(ctx, 'quick_setup.cancel')}
            </button>
            <span class="wizard-actions-end">
              ${
                index > 0
                  ? html`<button
                      type="button"
                      class="text-button"
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
                      class="text-button filled"
                      data-quick-setup-apply
                      ?disabled=${!ready}
                      @click=${this._applyQuickSetup}
                    >
                      ${this._string(ctx, 'quick_setup.apply')}
                    </button>`
                  : html`<button
                      type="button"
                      class="text-button filled"
                      data-quick-setup-next
                      ?disabled=${!ready}
                      @click=${() => this._quickSetupGo(QUICK_SETUP_STEPS[index + 1])}
                    >
                      ${this._string(ctx, 'quick_setup.next')}
                    </button>`
              }
            </span>
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
        <p class="quick-setup-intro">${this._string(ctx, 'quick_setup.story_intro')}</p>
        ${QuickSetupView.storyOptions(
          STORIES.map((story) => {
            const name = this._string(ctx, `quick_setup.story.${story.id}`);
            return {
              id: story.id,
              name,
              bestFor: this._string(ctx, `quick_setup.story.${story.id}.best_for`),
              space: this._string(ctx, `quick_setup.story.${story.id}.space`),
              href: `${DOCS_SITE}${story.page}`,
              readName: this._string(ctx, 'quick_setup.read_story', { story: name }),
              picked: answers?.story === story.id,
              onPick: () => this._pickStory(story.id),
            };
          }),
        )}
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
          class=${session.step === 'taps' ? 'quick-setup-form boxed' : 'quick-setup-form'}
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
          ? Wizard.wizardNote(this._string(ctx, 'quick_setup.calendars_needed'), 'quick-setup-note')
          : nothing
      }
    `;
  }

  /**
   * What Apply will do, said plainly: the example, calendars, colors, layout, title and weather it
   * leaves, and on a card with settings each one it replaces, five at first, then Show All.
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
    const t = (key: string, values?: Words): string => this._string(ctx, key, values);
    const name = (calendar: string): string => Entities.entityDisplayName(calendar, this.hass);
    const list = (items: ReadonlyArray<string>): string =>
      EditorLocalize.formatList(ctx.language, items, 'conjunction');
    const none = t('quick_setup.review.none');
    const built = QuickSetup.buildQuickSetupConfig(session.opening, answers);
    const merged = { ...Config.DEFAULT_CONFIG, ...built } as unknown as Types.Config;
    const view = this._viewForConfig(merged);
    const days = ViewConfig.resolveEffectiveConfig(merged, view).days_to_show;
    const colored = QuickSetup.storyColors(session.opening, answers).map(({ calendar }) =>
      name(calendar),
    );
    const weather = answers.weather.trim();
    const rows: Array<[string, string]> = [
      [t('quick_setup.review.example'), t(`quick_setup.story.${answers.story}`)],
      [t('quick_setup.review.calendars'), list(answers.calendars.map(name))],
      ...(colored.length > 0
        ? [[t('quick_setup.review.colors'), list(colored)] as [string, string]]
        : []),
      [
        t('quick_setup.review.layout'),
        [
          this._layoutName(ctx)(view),
          days === 1
            ? t('quick_setup.review.days_one')
            : t('quick_setup.review.days', { count: days }),
        ].join(Summary.SUMMARY_SEPARATOR),
      ],
      [t('quick_setup.review.title'), answers.title.trim() || none],
      [t('quick_setup.review.weather'), weather === '' ? none : name(weather)],
    ];
    const replaced = QuickSetup.replacements(session.opening, built);
    const shown = this._reviewAll ? replaced : replaced.slice(0, REVIEW_SHOWN);

    return html`
      <dl class="quick-setup-review wizard-card">
        ${rows.map(
          ([term, value]) =>
            html`<div>
              <dt>${term}</dt>
              <dd>${value}</dd>
            </div>`,
        )}
      </dl>
      ${
        replaced.length > 0
          ? html`<div class="quick-setup-replaced wizard-card" data-quick-setup-replaced>
              <p class="quick-setup-replaces" id="quick-setup-replaces">
                ${
                  replaced.length === 1
                    ? t('quick_setup.review.replaces_one')
                    : t('quick_setup.review.replaces', { count: replaced.length })
                }
              </p>
              <ul aria-labelledby="quick-setup-replaces" tabindex="-1">
                ${shown.map((each) => {
                  const [setting, change] = this._replacementParts(each, ctx);
                  // The hidden ": " keeps the row one phrase to assistive technology.
                  return html`<li>
                    <span>${setting}</span><span class="visually-hidden">: </span
                    ><span class="quick-setup-change">${change}</span>
                  </li>`;
                })}
              </ul>
              ${
                shown.length < replaced.length
                  ? html`<button
                      type="button"
                      class="text-button quick-setup-show-all"
                      data-focus="quick-setup-show-all"
                      @click=${() => {
                        this._reviewAll = true;
                        this._focusSoon(['.quick-setup-replaced ul']);
                      }}
                    >
                      ${t('quick_setup.review.show_all', { count: replaced.length })}
                    </button>`
                  : nothing
              }
            </div>`
          : nothing
      }
      <p class="hint">${t('quick_setup.review_keeps')}</p>
    `;
  }

  /**
   * One setting Apply replaces, as its name and its change: "Days To Show" and "7 → 3", "Title: Everything → None" or "Day
   * Spacing in List: 10px → Default", its values worded as its control words them.
   *
   * @param replacement - The setting
   * @param ctx - Schema context
   * @returns The setting's name, and its change
   */
  private _replacementParts(
    replacement: QuickSetup.Replacement,
    ctx: SchemaCtx,
  ): readonly [string, string] {
    const { line, group, next } = replacement;
    const t = (key: string, values?: Words): string => this._string(ctx, key, values);
    const key = line.path[line.path.length - 1];
    const field = line.field === undefined ? undefined : Audit.anyField(line.field, ctx.language);
    const word = (value: unknown): string => {
      if (key === 'view' && line.page !== undefined) {
        return this._layoutName(ctx)(value as Types.EffectiveView);
      }
      if (line.page !== undefined) {
        return Audit.buttonNames(value, t('toolbar.buttons.untitled'));
      }
      return field === undefined ? Audit.plainValue(value) : this._auditWord(field, value, ctx);
    };
    const label =
      line.page !== undefined
        ? t(key === 'view' ? 'view' : 'toolbar.buttons.heading')
        : field === undefined
          ? key
          : fieldLabel(field, ctx.language);
    const setting =
      group.kind === 'layout'
        ? t('audit.in_layout', { label, layout: this._layoutName(ctx)(group.workspace) })
        : label;
    const to =
      next === undefined || next === null || next === ''
        ? key === 'title'
          ? t('quick_setup.review.none')
          : t('quick_setup.review.default')
        : word(next);
    return [setting, `${word(line.value)} → ${to}`];
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
   * Puts focus on Quick Setup's heading once a step renders, where focus is not in the editor:
   * Safari does not focus a button on click, so Escape would otherwise reach no listener of the
   * editor's. Where focus is on Next or Back, it stays there.
   */
  private _keepFocusInQuickSetup(): void {
    void this.updateComplete.then(() => {
      if ((this.renderRoot as ShadowRoot).activeElement !== null) return;
      Focus.focusFirst(this.renderRoot, ['.quick-setup-title']);
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
    this._reviewAll = false;
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

    const placeName = (place: Misplaced.Place): string => {
      if (place === null) return this._string(ctx, 'misplaced.top_level');
      const view = Misplaced.viewForBlock(place);
      return view === undefined ? place : this._layoutTitle(view, ctx);
    };
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
      ${PageView.pageHead(
        t('misplaced.title'),
        t,
        this._back,
        this._renderHeadActions(ctx, t('misplaced.title')),
        '',
      )}
      ${this._renderPickBanner(ctx)} ${this._renderReturn(ctx)} ${this._renderMisplaced(ctx)}
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
      ${PageView.footBack(t, this._back, docsUrl('notices'))}
    </div>`;
  }

  /** Stored Settings' groups, made again only when what they read moves. */
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
   * Stored Settings' groups, for the YAML as it stands.
   *
   * @returns The groups
   */
  private _auditGroups(): Audit.AuditGroup[] {
    const keys = this._entryKeysFor((this._config!.entities ?? []).length);
    return this._audit(this._rawConfig, this._config!, this._pending, keys.join());
  }

  /**
   * Stored Settings: every stored line, grouped as Whole Card, All Layouts,
   * each layout, each calendar and the lines kept as written. Each line is one button opening a
   * strip with Change Here, which mounts its field's control in place and writes where the line
   * lives, Open in its page, and Reset or Remove; Reset All per layout. The lines kept as written
   * are read-only.
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
    const status = (key: string): TemplateResult | typeof nothing =>
      this._status?.kind === 'audit' && this._status.group === key
        ? this._renderStatus(ctx, ['audit'])
        : nothing;
    const view = (group: Audit.AuditGroup): TemplateResult => {
      const key = this._auditGroupKey(group);
      const rows = [
        status(key),
        ...group.lines.map((line) => this._auditRow(line, group, key, ctx)),
      ];
      const entry = group.kind === 'entry' ? group.key! : undefined;
      if (entry !== undefined) {
        const name = this._entryName(entry);
        const stored = this._entryOf(entry);
        return AuditView.auditGroup({
          key,
          title: name,
          sub: true,
          color: stored === undefined ? undefined : this._rowColor(stored),
          badge: stored === undefined ? undefined : this._rowBadge(stored),
          action: {
            label: t('audit.go_to', { name }),
            focus: `audit-entry:${entry}`,
            onPress: () => this._open({ kind: 'entry', key: entry }, `audit-entry:${entry}`),
          },
          rows,
        });
      }
      const where = layout(group.workspace);
      return AuditView.auditGroup({
        key,
        title:
          group.kind === 'whole'
            ? t('state.whole_card')
            : group.kind === 'kept'
              ? t('audit.kept')
              : where,
        note:
          group.kind === 'whole'
            ? t('audit.whole_note')
            : group.kind === 'card'
              ? t('audit.all_layouts_note')
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
      ${PageView.pageHead(
        t('more.audit'),
        t,
        this._back,
        this._renderHeadActions(ctx, t('more.audit')),
        t('overview.more'),
      )}
      ${this._renderPickBanner(ctx)} ${this._renderReturn(ctx)}
      <p class="hint">${t('audit.intro')}</p>
      ${
        // A reset that took its group's last line leaves no group to say so in: the line that
        // says what was reset, with Undo, stands above the rest.
        this._status?.kind === 'audit' &&
        this._status.group !== undefined &&
        !groups.some((group) => this._auditGroupKey(group) === this._status!.group)
          ? status(this._status.group)
          : nothing
      }
      ${groups.length === 0 ? PageView.pageLine(t('audit.none')) : nothing}
      ${groups.filter((group) => group.kind !== 'entry' && group.kind !== 'kept').map(view)}
      ${
        entries.length > 0
          ? html`<section class="page-group" data-heading="audit:calendars">
              <h3 class="heading" tabindex="-1">${t('panel.calendars')}</h3>
              ${entries.map(view)}
            </section>`
          : nothing
      }
      ${groups.filter((group) => group.kind === 'kept').map(view)}
      ${PageView.footBack(t, this._back, docsUrl('audit'))}
    </div>`;
  }

  /**
   * A group's `data-heading` key, which a reset's line and See What Grid Keeps find it by.
   *
   * @param group - The group
   * @returns Its key
   */
  private _auditGroupKey(group: Audit.AuditGroup): string {
    if (group.kind === 'entry') return `audit:entry:${group.key ?? 0}`;
    return `audit:${group.kind === 'layout' ? group.workspace : group.kind}`;
  }

  /**
   * A stored value as the dropdown standing in for its option offers it: Filter Duplicates reads
   * `filter_duplicates: true` as its Same title, start, end and location. Only where choosing that
   * offer writes the stored value back exactly; any other value, such as a tap action the dropdown
   * has no choice for, stays as stored.
   *
   * @param field - The line's field
   * @param value - The value as stored
   * @returns What the field's own control holds for it
   */
  private _throughMode(field: IndexedField, value: unknown): unknown {
    const name = field.node.name;
    if (!Synthetic.isSyntheticKey(name) || !Helpers.hasOwn(Synthetic.SYNTHETIC_FIELDS, name)) {
      return value;
    }
    const keys = Synthetic.configKeysForField(name);
    if (keys.length !== 1) return value;
    const mode = Synthetic.SYNTHETIC_FIELDS[name];
    const config = { ...Config.DEFAULT_CONFIG, [keys[0]]: value } as Types.Config;
    const offered = mode.derive(config);
    const back = mode.apply(offered, config).changes as Record<string, unknown>;
    return Value.equalConfigs({ value: back[keys[0]] }, { value }) ? offered : value;
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
    const word = Summary.wordValue(
      field,
      this._throughMode(field, value),
      ctx.language,
      this._describe,
    );
    return word === undefined || (typeof value === 'object' && word === String(value))
      ? Audit.plainValue(value)
      : word;
  }

  /**
   * Resets one line of Stored Settings, as one undo step, and leaves the line that says so
   * at the top of its group, with Undo, which takes focus. The line words it as the strip did:
   * "Reset Last Hour in Grid", or "Removed Language" where the strip said Remove.
   *
   * @param named - The setting, as the row names it
   * @param groupKey - Its group's key
   * @param target - What to reset
   * @param verb - Whether the strip offered Reset or Remove
   */
  private _auditReset(
    named: string,
    groupKey: string,
    target: Reset.ResetTarget,
    verb: 'reset' | 'remove' = 'reset',
  ): void {
    const ctx = this._ctx;
    const step =
      verb === 'remove'
        ? this._string(ctx, 'history.remove', { name: named })
        : this._string(ctx, 'history.reset', { setting: named });
    const text = verb === 'remove' ? this._string(ctx, 'status.removed', { name: named }) : step;
    this._openStrip = undefined;
    const done = this._commit(step, undefined, () => this._applyReset(target, []));
    if (done) this._showStatus({ kind: 'audit', text, at: 0, group: groupKey }, `${text}.`);
  }

  /**
   * One line of Stored Settings, as its row: label and value, its YAML path with Show YAML
   * Option Names on, and what is worth knowing about it ("Same as the Default", "Not in Use until
   * …", "Grid Has Its Own: 5"). Where the editor owns the line, the row is one button opening its
   * strip: Change Here, Open in its page, and Reset or Remove. A line kept as written has none.
   *
   * @param line - The line
   * @param group - Its group
   * @param groupKey - Its group's key
   * @param ctx - Schema context
   * @returns The row
   */
  private _auditRow(
    line: Audit.AuditLine,
    group: Audit.AuditGroup,
    groupKey: string,
    ctx: SchemaCtx,
  ): TemplateResult {
    const t = this._t(ctx);
    const layout = this._layoutName(ctx);
    const key = line.path[line.path.length - 1];
    const yaml = this._prefs.yaml ? line.text : undefined;
    const stripKey = `audit:${line.text}`;
    const open = this._openStrip === stripKey;
    const toggle = (): void => {
      this._openStrip = open ? undefined : stripKey;
    };
    const kept = (): TemplateResult =>
      AuditView.auditRow({
        path: line.text,
        label: key,
        value: Audit.plainValue(line.value),
        yaml,
        tags: Audit.HA_LAYOUT_KEYS.has(key) ? [t('audit.ha_own')] : [],
      });
    const action = (
      id: string,
      label: string,
      name: string,
      onPress: () => void,
    ): CalendarView.StripAction => ({ id, label, name, onPress });

    if (line.page !== undefined) {
      const label = this._string(ctx, key === 'view' ? 'view' : 'toolbar.buttons.heading');
      const value =
        key === 'view'
          ? layout(line.value as Types.EffectiveView)
          : Audit.buttonNames(line.value, this._string(ctx, 'toolbar.buttons.untitled'));
      const page =
        line.page === 'overview' ? t('search.overview') : this._pageTitleOf(line.page, ctx);
      const go = (): void =>
        line.page === 'overview'
          ? this._open({ kind: 'overview' }, `more:${stripKey}`)
          : this._open({ kind: 'page', page: line.page! }, `more:${stripKey}`, 'push', key);
      return AuditView.auditRow({
        path: line.text,
        label,
        value,
        yaml,
        tags: [],
        menu: {
          name: t('summary.pair', { label, value }),
          stripName: this._string(ctx, 'calendars.actions', { name: label }),
          open,
          onToggle: toggle,
          actions: [
            action(
              'open',
              t('audit.open_in', { page }),
              t('audit.open_named', { label, page }),
              go,
            ),
            action('reset', t('reset.reset'), t('value_source.reset', { option: label }), () =>
              this._auditReset(label, groupKey, { kind: 'path', path: line.path }),
            ),
          ],
        },
      });
    }
    if (line.field === undefined) return kept();

    const entry = group.kind === 'entry' ? group.key! : undefined;
    const wctx = entry === undefined ? this._ctxIn(group.workspace) : ctx;
    const stored = entry === undefined ? undefined : this._entryOf(entry);
    const present =
      stored === undefined
        ? buildFieldIndex(wctx)
        : entityFieldIndex(entrySchemaAcross(stored, wctx).schema);
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
    const word = this._wordOf(field, ctx);
    // Under Layout Defaults, each layout its value does not reach, a line each: one storing its
    // own, and one whose own default differs, as the setting's page words them.
    const own = (state?.layoutsOwn ?? []).map((each) =>
      t(each.stored ? 'state.layout_own' : 'state.layout_default', {
        layout: layout(each.view),
        value: word(each.value),
      }),
    );
    const editing = this._auditEdit?.line.text === line.text;
    const owner: PlanOwner = entry === undefined ? CARD : { kind: 'entry', key: entry };
    const appearance = Plan.appearanceOf(field.id) ?? 'add';
    const verb = open
      ? (this._resetActionOf(field.id, appearance, pctx, owner) ?? 'reset')
      : 'reset';
    const placed = placementOf(field.id)?.page;
    const page =
      entry !== undefined
        ? this._entryName(entry)
        : placed === undefined || placed === 'overview' || placed === 'entry'
          ? t('search.overview')
          : this._pageTitleOf(placed, ctx);
    const change = (): void => {
      this._openStrip = undefined;
      this._auditEdit = { line, group };
      // A color's line opens its control, as changing a dropdown's line opens no menu but shows
      // its choices: here the choices are the control's rows and swatches.
      const colorKey = this._colorKeyOf(
        entry === undefined ? WriteFrames.CARD_OWNER : { kind: 'entry', key: entry },
        field.id,
        entry === undefined ? wctx : ctx,
      );
      if (colorKey !== undefined) this._openColor = colorKey;
      this._focusSoon([`[data-audit="${CSS.escape(line.text)}"] [data-field]`]);
    };
    const go = (): void => {
      // A calendar's field opens where its page draws it: as the page is, across the card's
      // layouts, else with the first layout that applies it added.
      const scope =
        entry === undefined
          ? group.workspace
          : [this._workspace, ...ViewConfig.VIEWS].find((each) =>
              entityFieldIndex(entrySchemaAcross(stored!, this._ctxIn(each)).schema).fields.has(
                field.id,
              ),
            );
      this._openStrip = undefined;
      this._openResult(
        {
          target:
            entry === undefined
              ? {
                  kind: 'field',
                  id: field.id,
                  page: placed === 'overview' || placed === 'entry' ? undefined : placed,
                }
              : { kind: 'entry-field', id: field.id, key: entry },
          label,
        },
        `more:${stripKey}`,
        false,
        undefined,
        // A card field's page carries its layout; a calendar's page one only where it differs.
        entry === undefined || scope !== this._workspace ? scope : undefined,
      );
    };
    return AuditView.auditRow({
      path: line.text,
      label,
      value,
      yaml,
      tags:
        state?.words?.kind === 'set-layout'
          ? state.words.sameAsDefault
            ? [t('audit.same')]
            : []
          : (outcome?.kind === 'default' || outcome?.kind === 'layout-default') &&
              Value.deepEqual(outcome.value, line.value)
            ? [t('audit.same')]
            : [],
      lines: own,
      warning: line.inactive
        ? t('audit.inactive', {
            when: whenText(line.inactive.gate, data, ctx.language, labelOf) ?? '',
          })
        : undefined,
      menu: {
        name: t('summary.pair', { label: named, value }),
        stripName: this._string(ctx, 'calendars.actions', { name: named }),
        open,
        onToggle: toggle,
        actions: [
          action(
            'change',
            t('audit.change_here'),
            t('audit.change_named', { label: named }),
            change,
          ),
          action(
            'open',
            t('audit.open_in', { page }),
            t('audit.open_named', { label: named, page }),
            go,
          ),
          action(
            'reset',
            verb === 'remove' ? t('reset.remove') : t('reset.reset'),
            verb === 'remove'
              ? t('audit.remove_named', { label: named })
              : t('value_source.reset', { option: named }),
            () =>
              this._auditReset(
                named,
                groupKey,
                entry === undefined
                  ? { kind: 'path', path: line.path }
                  : { kind: 'entry', key: entry, keys: [key] },
                verb,
              ),
          ),
        ],
      },
      editing: editing
        ? entry === undefined
          ? this._renderField(field, wctx)
          : this._renderEntryField(field, entry, entryData!, ctx)
        : undefined,
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
   * Renders the overview's search row: the search field, then Undo, Redo, Pick From Preview and
   * the ⋯ menu of preferences at its end, so the keyboard reaches them in that order.
   *
   * @param ctx - Current editor context
   * @param chassis - The chassis schemas this render draws
   * @returns The search row
   */
  private _renderFilterBar(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const [hass, feed] = this._feed(chassis.filter, ctx.language);
    return html`
      <div class="filter-bar search-row">
        <div class="search-field">
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
          ${
            this._filter.query === ''
              ? nothing
              : html`<button
                  type="button"
                  class="icon-button search-clear"
                  data-focus="search-clear"
                  aria-label=${this._string(ctx, 'search.clear')}
                  title=${this._string(ctx, 'search.clear')}
                  @click=${this._clearSearch}
                >
                  ${icon(mdiClose)}
                </button>`
          }
        </div>
        ${this._renderHistory(ctx)} ${this._renderPrefsMenu(ctx)}
      </div>
    `;
  }

  /**
   * The search row's ✕: clears the query as Escape in the field does, which leaves the overview
   * (and its Back to the page a search came from) in place of the results, and puts focus back in
   * the field.
   */
  private _clearSearch = (): void => {
    this._applyFilter({ ...this._filter, query: '' });
    void this._focusSearchField();
  };

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
