/**
 * The editor element that hosts schema panels and mediates `<ha-form>` changes.
 * Schemas name Home Assistant selectors rather than concrete input elements, because HA renames its components without notice.
 */

import { LitElement, TemplateResult, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import * as Entities from './entities';
import * as Exceptions from './exceptions';
import * as Filter from './filter';
import type { HaFormSchema } from './ha-form';
import * as EditorLocalize from './localize';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx } from './panels';
import * as Routing from './routing';
import { ENTITY_PATH } from './schemas/calendars';
import {
  accentColorModeOf,
  entitySchemaFor,
  labelIconSourceOf,
  labelImageSourceOf,
} from './schemas/entity';
import { buildDisplayViewSchema } from './schemas/layout';
import { interpolate } from './strings';
import styles from './styles';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Workspace from './workspace';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Localize from '../../translations/localize';
import * as Helpers from '../../utils/helpers';
import * as Logger from '../../utils/logger';

const ENTITY_ICON =
  'M19 19H5V8h14m-3-7v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1h-2Z';

type MigrationState =
  | { readonly kind: 'current' }
  | { readonly kind: 'automatic' }
  | { readonly kind: 'choice'; readonly keys: ReadonlyArray<string> }
  | { readonly kind: 'future'; readonly version: number }
  | { readonly kind: 'invalid'; readonly value: unknown };

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

  @state() private _filter: Filter.FilterCriteria = Filter.NO_FILTER;

  @state() private _selectedWorkspace?: Workspace.EditorWorkspace;

  @state() private _gridReconciliation: ReadonlyArray<string> = [];

  @state() private _migration: MigrationState = { kind: 'current' };

  private _authoredRootKeys = new Set<string>();

  private _rawConfig: Record<string, unknown> = {};

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

  private _skipGridReconciliation = false;

  /**
   * Accepts a configuration from Home Assistant.
   *
   * @param config - Card configuration as stored
   */
  setConfig(config: Types.Config): void {
    const rawConfig = config as unknown as Record<string, unknown>;
    const isEcho =
      this._lastDispatched !== undefined && Value.equalConfigs(rawConfig, this._lastDispatched);

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
      this._skipGridReconciliation = false;
    }

    this._lastDispatched = Value.toStoredConfig(this._config);
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
    return Value.migrateListConfig(Value.toStoredConfig(this._config!), this._rawConfig, mode);
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
      language: Localize.getEffectiveLanguage(config.language, this.hass?.locale),
    };
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
      !this._skipGridReconciliation,
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
      }
    }
    if (this._viewForConfig(previousConfig) !== this._viewForConfig(applied.config)) {
      this._gridReconciliation =
        applied.config.view === 'grid' && !this._skipGridReconciliation
          ? Value.gridReconciliationKeys(previousConfig, this._authoredRootKeys)
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
    const stored = Value.toStoredConfig(config);

    if (Value.equalConfigs(stored, this._lastDispatched ?? {})) {
      return;
    }

    this._lastDispatched = stored;
    this._rawConfig = structuredClone(stored);

    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: stored } }));
  }

  /**
   * Resolves a label for any field in any panel.
   *
   * @param schema - Node being labelled
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
    const filtering = Filter.isFiltering(this._filter);

    // Keep panel.build complete for translation reconciliation; only rendered forms
    // withhold fields. Search and exceptions both receive this same reduced schema.
    const built = Filter.withholdInertFields(panel.build(ctx), ctx.workspace ?? ctx.view);
    const wholePanel =
      filtering && !this._filter.customizedOnly && Filter.matchesPanel(panel, filterCtx);
    const schema = wholePanel ? built : Filter.filterSchema(built, filterCtx);

    const data = this._formData();
    const frame: Routing.FormFrame = {
      workspace: ctx.workspace ?? ctx.view,
      schema,
      data,
    };

    const resets = this._renderResetControls(schema, ctx);
    const entities = this._renderEntities(panel, ctx);
    const extras = Filter.filterExtras(panel.extras?.(ctx) ?? [], panel, filterCtx);

    const empty =
      !Filter.hasFields(schema) &&
      extras.length === 0 &&
      resets === nothing &&
      entities === nothing;

    if (empty) {
      return nothing;
    }

    return html`
      <ha-expansion-panel
        outlined
        .header=${this._panelTitle(panel, ctx)}
        .secondary=${this._panelHelper(panel, ctx) ?? ''}
        .leftChevron=${false}
        .expanded=${filtering}
      >
        <ha-svg-icon slot="leading-icon" .path=${panel.iconPath}></ha-svg-icon>
        <div class="panel-body">
          <ha-form
            class="panel-form"
            .hass=${this.hass}
            .data=${data}
            .schema=${schema}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            .localizeValue=${this._localizeValue}
            @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
          ></ha-form>
          ${extras.map((extra) => this._renderExtra(extra))} ${entities} ${resets}
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
    const filtering = Filter.isFiltering(this._filter);

    const shown = entries
      .map((entry, index) => ({
        entry,
        index,
        schema: Filter.filterEntitySchema(
          entitySchemaFor(
            subform.schema,
            Entities.labelTypeOf(entry),
            accentColorModeOf(Entities.asEntityConfig(entry).accent_color),
            labelIconSourceOf(Entities.asEntityConfig(entry).label),
            Entities.showsLocation(entry, ctx.config, this._destinationView(ctx)),
            labelImageSourceOf(Entities.asEntityConfig(entry).label),
          ),
          entry,
          subform.path,
          filterCtx,
        ),
      }))
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

        return html`
          <ha-expansion-panel
            outlined
            class="entity-panel"
            .header=${Entities.entityDisplayName(entityId, this.hass)}
            .secondary=${this._entitySummary(entries, index, ctx)}
            .leftChevron=${false}
            .expanded=${filtering}
          >
            <ha-svg-icon slot="leading-icon" .path=${ENTITY_ICON}></ha-svg-icon>
            <div class="panel-body">
              <div class="entity-actions">
                <div class="entity-actions-safe">
                  <button
                    type="button"
                    class="text-button"
                    ?disabled=${!Entities.hasSettings(entry)}
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
              <ha-form
                class="entity-form"
                .hass=${this.hass}
                .data=${Entities.toEntityFormData(entry)}
                .schema=${schema}
                .computeLabel=${computeLabel}
                .computeHelper=${computeHelper}
                .localizeValue=${this._localizeValue}
                @value-changed=${(event: CustomEvent) => this._entityChanged(index, event)}
              ></ha-form>
            </div>
          </ha-expansion-panel>
        `;
      })}
    `;
  }

  /**
   * The line under a calendar's heading.
   *
   * The heading is the calendar's name, so two blocks over one calendar carry the same
   * one. This is where they are told apart, and the order is the useful one: a label the
   * user wrote wins, because it is their own answer to this exact question, and the
   * position is prefixed to it either way so that "the same calendar, twice" is never
   * mistaken for the card having listed something twice by accident.
   *
   * It deliberately does not report *which setting* differs between two blocks. Any of the
   * thirty-odd per-calendar options can be the one, several can differ at once, and a diff
   * of two configs renders as jargon — `event_type: all_day` means nothing to someone who
   * set it through a dropdown reading "Only all-day events". The position answers the
   * question the duplicate actually raises, which is "which of these two am I editing",
   * and answers it in every case rather than in the neat ones.
   *
   * @param entities - The list as stored, for finding this calendar's duplicates
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

    const described =
      typeof config.label === 'string' && config.label !== ''
        ? config.label
        : Entities.hasSettings(entry)
          ? this._string(ctx, 'entity.customised')
          : this._string(ctx, 'entity.unconfigured');

    const { position, total } = Entities.occurrenceOf(entities, index);
    if (total < 2) return described;

    const occurrence = interpolate(this._string(ctx, 'entity.occurrence'), { position, total });

    return `${occurrence} · ${described}`;
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
    if (!next || !this._config) return;

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
    const stored = Value.toStoredConfig(this._config!)[blockKey];
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
    if (blockKey === 'time_grid' && keys.some((key) => ViewConfig.hasDivergentDefault(key, view))) {
      this._skipGridReconciliation = true;
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
   * @returns The string, humanised as a last resort
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
    const panels = PANELS.map((panel) => this._renderPanel(panel, ctx)).filter(
      (panel) => panel !== nothing,
    );

    const empty = panels.length === 0 && Filter.isFiltering(this._filter);

    return html`
      <div class="card-config">
        ${this._renderViewControls(ctx)} ${this._renderGridReconciliation(ctx)}
        ${this._renderFilterBar()} ${panels} ${empty ? this._renderNoMatches(ctx) : nothing}
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
   * Keeps displayed-view configuration separate from the editor's local cursor.
   *
   * @param ctx - Current editor context
   * @returns The two adjacent controls, outside the searchable panels
   */
  private _renderViewControls(ctx: SchemaCtx): TemplateResult {
    const data = { view: this._viewForConfig(this._config!) };
    const schema = buildDisplayViewSchema(ctx.language);
    const frame: Routing.FormFrame = { workspace: 'list', schema, data };
    const note = Workspace.workspaceNote(ctx.workspace ?? ctx.view);

    return html`
      <div class="view-controls">
        <ha-form
          class="display-view-form"
          .hass=${this.hass}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          .localizeValue=${this._localizeValue}
          @value-changed=${(event: CustomEvent) => this._valueChanged(frame, event)}
        ></ha-form>
        <ha-form
          class="workspace-form"
          .hass=${this.hass}
          .data=${{ [Workspace.WORKSPACE_FIELD]: this._workspace }}
          .schema=${Workspace.buildWorkspaceSchema(ctx.language)}
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
   * @returns The filter bar
   */
  private _renderFilterBar(): TemplateResult {
    return html`
      <div class="filter-bar">
        <ha-form
          class="filter-form"
          .hass=${this.hass}
          .data=${Filter.filterFormData(this._filter)}
          .schema=${Filter.FILTER_SCHEMA}
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

    this._filter = Filter.toFilterCriteria(data);
  };

  /**
   * Says why the editor is empty.
   *
   * @param ctx - Schema context
   * @returns The message
   */
  private _renderNoMatches(ctx: SchemaCtx): TemplateResult {
    const query = this._filter.query.trim();

    if (query === '') {
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
