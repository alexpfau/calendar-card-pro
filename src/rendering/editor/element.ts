/**
 * The editor element that hosts schema panels and mediates `<ha-form>` changes.
 * Schemas name Home Assistant selectors rather than concrete input elements, because HA renames its components without notice.
 */

import { mdiChevronRight, mdiCreation } from '@mdi/js';
import { LitElement, TemplateResult, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';

import * as Buttons from './buttons';
import * as Entities from './entities';
import * as Essentials from './essentials';
import * as Exceptions from './exceptions';
import * as Filter from './filter';
import type { HaFormSchema } from './ha-form';
import { withCardActionLabels } from './hass-localize';
import * as EditorLocalize from './localize';
import * as Misplaced from './misplaced';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx } from './panels';
import * as QuickSetup from './quick-setup';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import { TOOLBAR_BUTTON_ICON, TOOLBAR_BUTTON_PATH } from './schemas/card';
import {
  accentColorModeOf,
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
import { DOCS_SITE, STORIES, type StoryId } from './stories';
import { interpolate } from './strings';
import styles from './styles';
import * as Subforms from './subforms';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Workspace from './workspace';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import { loadIntlLocaleData } from '../../translations/intl-locale-data';
import * as LanguageCodes from '../../translations/language-codes';
import { configuredCalendarName } from '../../utils/calendar-names';
import * as Helpers from '../../utils/helpers';
import * as Logger from '../../utils/logger';

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

/**
 * A calendar's conditions as Home Assistant's Visibility editor takes them: a list of
 * conditions, empty for none.
 *
 * @param value - `visibility` as stored
 * @returns The list, or undefined where something in it is not a condition, which only the YAML
 *   box can show as written
 */
function editableConditions(value: unknown): ReadonlyArray<object> | undefined {
  if (value === undefined || value === null) return [];
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return list.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
    ? (list as object[])
    : undefined;
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

  /** Set once this editor waits for Home Assistant's Visibility editor to be defined. */
  private _awaitingConditionsEditor = false;

  private _authoredRootKeys = new Set<string>();

  /**
   * A key per toolbar button, in the list's order, so each button keeps its own panel, open or
   * closed, through a move and through the removal of another.
   */
  private _buttonKeys: number[] = [];

  private _nextButtonKey = 0;

  /** The keys of the buttons Add Button created, whose panels open as they arrive. */
  private _addedButtons = new Set<number>();

  private _rawConfig: Record<string, unknown> = {};

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
    }

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
    const rawConfig = this._config!;
    const workspace = this._workspace;
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
      language: LanguageCodes.getEffectiveLanguage(config.language, this.hass?.locale),
    };
  }

  /**
   * The `hass` every form in this editor is given.
   *
   * Home Assistant's action dropdown labels each option from its own string table, so the
   * card's `expand` action would otherwise render as a raw lowercase key. The wrapper
   * answers for card actions and delegates everything else; it is memoized on the `hass`
   * identity, so forms downstream see a stable object.
   *
   * @returns A `hass` that can name this card's actions
   */
  private get _formHass(): Types.Hass | undefined {
    return withCardActionLabels(this.hass, this._ctx.language);
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
      hass: this.hass,
    };
  }

  /**
   * Builds the data object bound to a panel's form.
   *
   * @returns Form data
   */
  private _formData(): Record<string, unknown> {
    return Routing.workspaceFormData(this._config!, this._workspace, this._pending);
  }

  /**
   * Folds a form change into the configuration and reports it.
   *
   * @param frame - Scope, schema, and data captured when this form was rendered
   * @param event - The form's `value-changed`
   */
  private _valueChanged(frame: Routing.FormFrame, event: CustomEvent): void {
    event.stopPropagation();

    if (!this._config) return;

    const nextData = event.detail?.value as Record<string, unknown> | undefined;
    if (!nextData) return;

    if (!this._prepareForWrite()) return;
    const previousConfig = this._config;
    const applied = Routing.applyWorkspaceChange(
      previousConfig,
      frame,
      nextData,
      this._pending,
      this._gridResetKeys,
      this._authoredRootKeys,
    );

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

    // Keep what ha-form emitted, not newly derived synthetic values it has not seen yet.
    frame.data = structuredClone(nextData);

    if (changed.size === 0) return;
    this._report(applied.config);
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
   * Resolves a label for any field in any panel.
   *
   * @param schema - Node being labeled
   * @param _data - Form data, unused
   * @param options - Descent options supplied by `ha-form`
   * @returns Label text
   */
  private _computeLabel = (
    schema: HaFormSchema,
    _data?: unknown,
    options?: { path?: string[] },
  ): string => EditorLocalize.computeLabel(this._ctx.language, schema, options?.path ?? []);

  /**
   * Resolves helper text, including the applicability note.
   *
   * @param schema - Node being described
   * @param options - Descent options supplied by `ha-form`
   * @returns Helper text, or `undefined`
   */
  private _computeHelper = (
    schema: HaFormSchema,
    options?: { path?: string[] },
  ): string | undefined => {
    const ctx = this._ctx;
    const helper = EditorLocalize.computeHelper(
      ctx.language,
      ctx.view,
      schema,
      options?.path ?? [],
      true,
    );
    const source =
      'selector' in schema
        ? Routing.valueSource(this._config!, ctx.workspace ?? ctx.view, schema.name)
        : undefined;
    const note = source ? EditorLocalize.lookup(ctx.language, `value_source.${source}`) : undefined;
    return [note, helper].filter((value) => value !== undefined).join(' ') || undefined;
  };

  /**
   * Resolves option labels that a selector asks Home Assistant to translate.
   *
   * @param key - Translation key the selector asked for
   * @returns The resolved string, or `undefined` to defer
   */
  private _localizeValue = (key: string): string | undefined =>
    EditorLocalize.lookup(this._ctx.language, key);

  /**
   * Renders one panel: an expansion panel wrapping a form.
   *
   * @param panel - Panel definition
   * @param ctx - Schema context
   * @returns The panel template, or nothing when the filter leaves it empty
   */
  private _renderPanel(panel: PanelDef, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const filterCtx = this._filterCtx;
    const searching = Filter.isSearching(this._filter);

    // Keep panel.build complete for translation reconciliation; only rendered forms
    // withhold fields. Search and exceptions both receive this same reduced schema.
    const built = Filter.withholdInertFields(panel.build(ctx), ctx.workspace ?? ctx.view);
    // Only a typed query may let a whole panel through by its name: on an empty one every panel
    // matches, and Essentials Only would show all it hides.
    const wholePanel =
      Filter.hasQuery(this._filter) &&
      !this._filter.customizedOnly &&
      Filter.matchesPanel(panel, filterCtx);
    const schema = wholePanel ? built : Filter.filterSchema(built, filterCtx);

    const data = this._formData();
    // Key the form node as well as its callback: reusing a node would redirect its
    // pending events into the next workspace's frame.
    const frame: Routing.FormFrame = {
      workspace: ctx.workspace ?? ctx.view,
      schema,
      data,
    };

    const resets = this._renderResetControls(schema, ctx);
    this._countHidden(built, schema);
    const entities = this._renderEntities(panel, ctx);
    const buttons = this._renderToolbarButtons(panel, ctx);
    const extras = Filter.filterExtras(panel.extras?.(ctx) ?? [], panel, filterCtx);

    const empty =
      !Filter.hasFields(schema) &&
      extras.length === 0 &&
      resets === nothing &&
      entities === nothing &&
      buttons === nothing;

    if (empty) {
      return nothing;
    }

    return html`
      <ha-expansion-panel
        outlined
        .header=${this._panelTitle(panel, ctx)}
        .secondary=${this._panelHelper(panel, ctx) ?? ''}
        .leftChevron=${false}
        .expanded=${searching}
      >
        <ha-svg-icon slot="leading-icon" .path=${panel.iconPath}></ha-svg-icon>
        <div class="panel-body">
          ${keyed(
            frame.workspace,
            html`
              <ha-form
                class="panel-form"
                .hass=${this._formHass}
                .data=${data}
                .schema=${schema}
                .computeLabel=${this._computeLabel}
                .computeHelper=${this._computeHelper}
                .localizeValue=${this._localizeValue}
                @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
              ></ha-form>
            `,
          )}
          ${extras.map((extra) => this._renderExtra(extra))} ${entities} ${buttons} ${resets}
        </div>
      </ha-expansion-panel>
    `;
  }

  /**
   * Resolves a panel's heading.
   *
   * @param panel - Panel definition
   * @param ctx - Schema context
   * @returns Title text
   */
  private _panelTitle(panel: PanelDef, ctx: SchemaCtx): string {
    return (
      EditorLocalize.lookupForView(ctx.language, panel.titleKey, ctx.workspace ?? ctx.view) ??
      EditorLocalize.humanize(panel.titleKey)
    );
  }

  /**
   * Resolves the sentence under a panel's heading.
   *
   * @param panel - Panel definition
   * @param ctx - Schema context
   * @returns Helper text, or `undefined` when the panel has none
   */
  private _panelHelper(panel: PanelDef, ctx: SchemaCtx): string | undefined {
    return EditorLocalize.lookupForView(
      ctx.language,
      panel.titleKey,
      ctx.workspace ?? ctx.view,
      '.helper',
    );
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

    const filterCtx = this._filterCtx;
    const searching = Filter.isSearching(this._filter);
    const toolbar = Config.resolveToolbar(ctx.config);
    const hasLegend = toolbar.show && toolbar.legend !== false;
    const conditionsEditor = conditionsEditorDefined();
    if (!conditionsEditor && !this._awaitingConditionsEditor) {
      // Defined before this editor opens wherever Home Assistant's card editor is; should it
      // arrive later, it takes over the YAML box then. Never resolving costs nothing.
      this._awaitingConditionsEditor = true;
      void customElements.whenDefined(CONDITIONS_EDITOR).then(() => this.requestUpdate());
    }

    const shown = entries
      .map((entry, index) => {
        const declared = entitySchemaFor(
          subform.schema,
          Entities.labelTypeOf(entry),
          accentColorModeOf(Entities.asEntityConfig(entry).accent_color),
          labelIconSourceOf(Entities.asEntityConfig(entry).label),
          Entities.showsLocation(entry, ctx.config, this._destinationView(ctx)),
          labelImageSourceOf(Entities.asEntityConfig(entry).label),
          hasLegend,
        );
        const schema = Filter.filterEntitySchema(declared, entry, subform.path, filterCtx);
        this._countHidden(
          Filter.withholdInertFields(declared, ctx.workspace ?? ctx.view, 'entity'),
          schema,
        );
        return { entry, index, schema };
      })
      .filter((candidate) => Filter.hasFields(candidate.schema));

    if (shown.length === 0) return nothing;

    const computeLabel = (schema: HaFormSchema): string =>
      EditorLocalize.computeLabel(ctx.language, schema, subform.path);

    const computeHelper = (schema: HaFormSchema): string | undefined =>
      EditorLocalize.computeSubformHelper(
        ctx.language,
        ctx.view,
        schema,
        subform.path,
        ViewConfig.entityScopeFor(schema.name),
      );

    return html`
      ${shown.map(({ entry, index, schema }) => {
        const entityId = Synthetic.entityIdOf(entry);
        const data = Entities.toEntityFormData(entry, entries);
        const conditions = conditionsEditor
          ? editableConditions(Entities.asEntityConfig(entry).visibility)
          : undefined;
        const split = conditions ? splitAtVisibility(schema) : undefined;
        const form = (part: ReadonlyArray<HaFormSchema>) => html`
          <ha-form
            class="entity-form"
            .hass=${this._formHass}
            .data=${data}
            .schema=${part}
            .computeLabel=${computeLabel}
            .computeHelper=${computeHelper}
            .localizeValue=${this._localizeValue}
            @value-changed=${(event: CustomEvent) => this._entityChanged(index, event)}
          ></ha-form>
        `;

        return html`
          <ha-expansion-panel
            outlined
            class="entity-panel"
            .header=${Entities.entityDisplayName(entityId, this.hass)}
            .secondary=${this._entitySummary(entries, index, ctx)}
            .leftChevron=${false}
            .expanded=${searching}
          >
            <ha-svg-icon slot="leading-icon" .path=${ENTITY_ICON}></ha-svg-icon>
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
              ${
                split
                  ? html`
                      ${split.before.length > 0 ? form(split.before) : nothing}
                      <div class="entity-visibility">
                        <div class="entity-visibility-helper">
                          ${this._string(ctx, 'entity.visibility.helper')}
                        </div>
                        <ha-card-conditions-editor
                          .hass=${this.hass}
                          .conditions=${conditions}
                          @value-changed=${(event: CustomEvent) =>
                            this._visibilityChanged(index, event)}
                        ></ha-card-conditions-editor>
                      </div>
                      ${split.after.length > 0 ? form(split.after) : nothing}
                    `
                  : form(schema)
              }
            </div>
          </ha-expansion-panel>
        `;
      })}
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
   * Folds one calendar's form change into the configuration.
   *
   * @param index - Position of the calendar in the list
   * @param event - The form's `value-changed`
   */
  private _entityChanged(index: number, event: CustomEvent): void {
    event.stopPropagation();

    const next = event.detail?.value as Record<string, unknown> | undefined;
    if (next) this._writeEntity(index, next);
  }

  /**
   * Folds a change from Home Assistant's Visibility editor into one calendar's conditions. It
   * sends the whole list, empty once the last condition is removed, which stores nothing.
   *
   * @param index - Position of the calendar in the list
   * @param event - The editor's `value-changed`
   */
  private _visibilityChanged(index: number, event: CustomEvent): void {
    event.stopPropagation();

    const conditions: unknown = event.detail?.value;
    const entries = this._config?.entities ?? [];
    const entry = entries[index];
    if (!Array.isArray(conditions) || entry === undefined) return;

    this._writeEntity(index, {
      ...Entities.toEntityFormData(entry, entries),
      visibility: conditions,
    });
  }

  /**
   * Writes one calendar's form data into the configuration, as every per-calendar control does.
   *
   * @param index - Position of the calendar in the list
   * @param next - The calendar's whole form data
   */
  private _writeEntity(index: number, next: Record<string, unknown>): void {
    if (!this._config) return;

    const entities = Entities.writeEntity(
      this._config.entities ?? [],
      index,
      next,
      this._config.accent_color,
      this.hass ?? undefined,
    );
    if (Value.deepEqual(entities, this._config.entities)) return;
    if (!this._prepareForWrite()) return;
    this._config = {
      ...this._config,
      entities,
    };

    this._report(this._config);
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
   * Lists one calendar a second time, with the same settings.
   *
   * @param index - Position of the calendar in the list
   */
  private _duplicateEntity(index: number): void {
    if (!this._config) return;

    if (!this._prepareForWrite()) return;
    this._config = {
      ...this._config,
      entities: Entities.duplicateEntity(this._config.entities ?? [], index),
    };

    this._report(this._config);
  }

  /**
   * Drops one calendar from the list.
   *
   * @param index - Position of the calendar in the list
   */
  private _removeEntity(index: number): void {
    if (!this._config) return;

    if (!this._prepareForWrite()) return;
    this._config = {
      ...this._config,
      entities: Entities.removeEntity(this._config.entities ?? [], index),
    };

    this._report(this._config);
  }

  /**
   * Renders the toolbar's own buttons: the sub-heading, a collapsible form per button headed by
   * its name, and Add Button after the last.
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

    const filterCtx = this._filterCtx;
    const filtering = Filter.isFiltering(this._filter);
    const written = Buttons.writtenButtons(this._config!);
    const keys = this._buttonKeysFor(written.length);
    const headings = subform.schema.filter((node) => Filter.isHeading(node));
    const fields = subform.schema.filter((node) => !Filter.isHeading(node));

    const shown = written
      .map((entry, index) => {
        const schema = Filter.filterButtonSchema(fields, entry, subform.path, filterCtx);
        this._countHidden(fields, schema);
        return { entry, index, key: keys[index], schema };
      })
      .filter((candidate) => Filter.hasFields(candidate.schema));

    if (filtering && shown.length === 0) return nothing;

    const computeLabel = (schema: HaFormSchema): string =>
      EditorLocalize.computeLabel(ctx.language, schema, subform.path);

    const computeHelper = (schema: HaFormSchema): string | undefined =>
      EditorLocalize.computeSubformHelper(ctx.language, ctx.view, schema, subform.path);

    const untitled = this._string(ctx, 'toolbar.buttons.untitled');

    return html`
      <ha-form
        class="buttons-heading"
        .hass=${this._formHass}
        .data=${{}}
        .schema=${headings}
        .computeLabel=${computeLabel}
      ></ha-form>
      ${repeat(
        shown,
        ({ key }) => key,
        ({ entry, index, key, schema }) => html`
          <ha-expansion-panel
            outlined
            class="button-panel"
            data-button-key=${key}
            .header=${Buttons.buttonTitle(entry, index, untitled)}
            .leftChevron=${false}
            .expanded=${Filter.isSearching(this._filter) || this._addedButtons.has(key)}
          >
            <ha-svg-icon slot="leading-icon" .path=${TOOLBAR_BUTTON_ICON}></ha-svg-icon>
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
              <ha-form
                class="button-form"
                .hass=${this._formHass}
                .data=${Buttons.toButtonFormData(entry)}
                .schema=${schema}
                .computeLabel=${computeLabel}
                .computeHelper=${computeHelper}
                .localizeValue=${this._localizeValue}
                @value-changed=${(event: CustomEvent) => this._buttonChanged(index, event)}
              ></ha-form>
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
   * Folds one button's form change into the list.
   *
   * @param index - Position of the button in the list
   * @param event - The form's `value-changed`
   */
  private _buttonChanged(index: number, event: CustomEvent): void {
    event.stopPropagation();

    const next = event.detail?.value as Record<string, unknown> | undefined;
    if (!next || !this._config) return;

    const written = Buttons.writtenButtons(this._config);
    const buttons = Buttons.writeButton(written, index, next);
    if (Value.deepEqual(buttons, written)) return;
    this._writeButtons(buttons);
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
    const panels = PANELS.map((panel) => this._renderPanel(panel, ctx)).filter(
      (panel) => panel !== nothing,
    );

    const empty = panels.length === 0 && Filter.isFiltering(this._filter);
    const chassis = Subforms.chassisSchemas(ctx.language);

    return html`
      <div class="card-config">
        ${this._renderQuickSetupEntry(ctx)} ${this._renderViewControls(ctx, chassis)}
        ${this._renderGridReconciliation(ctx)} ${this._renderMisplaced(ctx)}
        ${this._renderFilterBar(chassis)} ${this._renderEssentialsNote(ctx)} ${panels}
        ${empty ? this._renderNoMatches(ctx) : nothing}
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
   * The banner that opens Quick Setup, above everything else in the editor.
   *
   * One button, so the whole banner is the target: a primary-color badge, the title and one line
   * saying what it does, and a chevron. Drawn from Home Assistant's theme variables, so it follows
   * any theme, light or dark (Alex picked this over a filled button and a card with example
   * chips, Nov 10).
   *
   * @param ctx - Current editor context
   * @returns The entry
   */
  private _renderQuickSetupEntry(ctx: SchemaCtx): TemplateResult {
    return html`
      <div class="quick-setup-entry">
        <button
          type="button"
          class="quick-setup-banner"
          data-quick-setup-open
          @click=${this._openQuickSetup}
        >
          <span class="quick-setup-badge" aria-hidden="true">
            <ha-svg-icon .path=${mdiCreation}></ha-svg-icon>
          </span>
          <span class="quick-setup-text">
            <span class="quick-setup-name">${this._string(ctx, 'quick_setup.open')}</span>
            <span class="quick-setup-line">${this._string(ctx, 'quick_setup.open_note')}</span>
          </span>
          <ha-svg-icon
            class="quick-setup-chevron"
            aria-hidden="true"
            .path=${mdiChevronRight}
          ></ha-svg-icon>
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
      <div class="card-config">
        <div
          class="quick-setup"
          data-quick-setup=${session.step}
          role="group"
          aria-labelledby="quick-setup-title"
        >
          <strong id="quick-setup-title">${this._string(ctx, 'quick_setup.title')}</strong>
          <div class="quick-setup-step">
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

    return html`
      ${keyed(
        session.step,
        html`<ha-form
          class="quick-setup-form"
          .hass=${this._formHass}
          .data=${step.data}
          .schema=${step.schema}
          .computeLabel=${(schema: HaFormSchema) =>
            EditorLocalize.computeLabel(ctx.language, schema, QUICK_SETUP_PATH)}
          .computeHelper=${(schema: HaFormSchema) =>
            EditorLocalize.lookup(
              ctx.language,
              `${EditorLocalize.qualifiedKey(schema.name, QUICK_SETUP_PATH)}.helper`,
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
  };

  /**
   * Moves Quick Setup to another step.
   *
   * @param step - The step to show
   */
  private _quickSetupGo(step: QuickSetupStep): void {
    if (this._quickSetup === undefined) return;
    this._quickSetup = { ...this._quickSetup, step };
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
   * Keeps displayed-view configuration separate from the editor's local cursor.
   *
   * @param ctx - Current editor context
   * @param chassis - The chassis schemas this render draws
   * @returns The two adjacent controls, outside the searchable panels
   */
  private _renderViewControls(ctx: SchemaCtx, chassis: Subforms.ChassisSchemas): TemplateResult {
    const data = { view: this._viewForConfig(this._config!) };
    const schema = chassis.displayView;
    const frame: Routing.FormFrame = { workspace: 'list', schema, data };
    const note = Workspace.workspaceNote(ctx.workspace ?? ctx.view);

    return html`
      <div class="view-controls">
        <ha-form
          class="display-view-form"
          .hass=${this._formHass}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
        ></ha-form>
        <ha-form
          class="workspace-form"
          .hass=${this._formHass}
          .data=${{ [Workspace.WORKSPACE_FIELD]: this._workspace }}
          .schema=${chassis.workspace}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          .localizeValue=${this._localizeValue}
          @value-changed=${this._workspaceChanged}
        ></ha-form>
        ${note ? html` <div class="workspace-note">${this._string(ctx, note)}</div> ` : nothing}
      </div>
    `;
  }

  /**
   * Changes only the editor workspace; this form never enters the config write path.
   *
   * @param event - Workspace form's value change
   */
  private _workspaceChanged = (event: CustomEvent): void => {
    event.stopPropagation();
    if (!this._config) return;

    const value: unknown = event.detail?.value?.[Workspace.WORKSPACE_FIELD];
    if (!Workspace.isWorkspace(value)) {
      Logger.warn('Ignoring an unsupported editor workspace', value);
      this.requestUpdate();
      return;
    }
    if (value === this._workspace) return;

    this._selectedWorkspace = value;
  };

  /**
   * Renders the filter bar above the panels.
   *
   * @param chassis - The chassis schemas this render draws
   * @returns The filter bar
   */
  private _renderFilterBar(chassis: Subforms.ChassisSchemas): TemplateResult {
    return html`
      <div class="filter-bar">
        <ha-form
          class="filter-form"
          .hass=${this._formHass}
          .data=${Filter.filterFormData(this._filter)}
          .schema=${chassis.filter}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
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
    this._filter = next;
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
      // With Essentials Only on too, the rest may well be customized: say only what is true.
      const key = Filter.appliesEssentials(this._filter)
        ? 'filter.nothing_customized_essential'
        : 'filter.nothing_customized';
      return html` <div class="filter-empty">${this._string(ctx, key)}</div> `;
    }

    return html`
      <div class="filter-empty">
        ${interpolate(this._string(ctx, 'filter.no_matches'), { query })}
        <div class="filter-empty-note">${this._string(ctx, 'filter.gated_note')}</div>
      </div>
    `;
  }
}
