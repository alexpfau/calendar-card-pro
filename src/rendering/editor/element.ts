/**
 * The editor element that hosts schema panels and mediates `<ha-form>` changes.
 * Schemas name Home Assistant selectors rather than concrete input elements, because HA renames its components without notice.
 */

import { LitElement, TemplateResult, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import * as Entities from './entities';
import * as Exceptions from './exceptions';
import * as Filter from './filter';
import type { HaFormSchema, SelectorSchema } from './ha-form';
import * as EditorLocalize from './localize';
import * as Overrides from './overrides';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx } from './panels';
import { ENTITY_PATH } from './schemas/calendars';
import {
  accentColorModeOf,
  entitySchemaFor,
  labelIconSourceOf,
  labelImageSourceOf,
} from './schemas/entity';
import { interpolate } from './strings';
import styles from './styles';
import { EXCEPTION_PICKER } from './subforms';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Localize from '../../translations/localize';

const ENTITY_ICON =
  'M19 19H5V8h14m-3-7v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1h-2Z';
const EXCEPTION_ICON =
  'M11 15h2v2h-2v-2m0-8h2v6h-2V7m1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2Z';

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

  @state() private _declaredExceptions: ReadonlySet<string> = new Set();

  @state() private _filter: Filter.FilterCriteria = Filter.NO_FILTER;

  private _renderedData = new Map<string, Record<string, unknown>>();

  /**
   * Resolves the configured view to one the editor understands.
   *
   * @param config - Merged configuration
   * @returns The effective editor view
   */
  private _viewForConfig(config: Readonly<Types.Config>): Types.EffectiveView {
    return ViewConfig.VIEWS.includes(config.view) ? config.view : 'list';
  }

  private _lastDispatched?: Record<string, unknown>;

  /**
   * Accepts a configuration from Home Assistant.
   *
   * @param config - Card configuration as stored
   */
  setConfig(config: Types.Config): void {
    const isEcho =
      this._lastDispatched !== undefined &&
      Value.equalConfigs(config as unknown as Record<string, unknown>, this._lastDispatched);

    this._config = { ...Config.DEFAULT_CONFIG, ...config };

    if (!Array.isArray(this._config.entities)) {
      this._config.entities = [];
    }

    if (!isEcho) {
      this._pending = {};
      this._declaredExceptions = Exceptions.declaredKeys(
        this._config,
        this._viewForConfig(this._config),
      );
    }

    this._lastDispatched = Value.toStoredConfig(this._config);

    this._renderedData.clear();
  }

  /**
   * Builds the context every schema builder reads.
   *
   * @returns Schema context for the current configuration
   */
  private get _ctx(): SchemaCtx {
    const config = this._config!;
    const view = this._viewForConfig(config);

    return {
      view,
      config,
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
      language: ctx.language,
      view: ctx.view,
      config: ctx.config,
      criteria: this._filter,
    };
  }

  /**
   * Builds the data object bound to a panel's form.
   *
   * @returns Form data
   */
  private _formData(): Record<string, unknown> {
    return {
      ...(this._config as unknown as Record<string, unknown>),
      column: Value.columnFormBlock(this._config!),
      grid: Value.gridFormBlock(this._config!),
      weather: Value.weatherFormBlock(this._config!),
      ...Synthetic.deriveSyntheticData(this._config!, this._pending),
    };
  }

  /**
   * Folds a form change into the configuration and reports it.
   *
   * @param panelId - Panel that produced the event
   * @param event - The form's `value-changed`
   */
  private _valueChanged(panelId: string, event: CustomEvent): void {
    event.stopPropagation();

    if (!this._config) return;

    const nextData = event.detail?.value as Record<string, unknown> | undefined;
    if (!nextData) return;

    const previousView = this._viewForConfig(this._config);
    const previousData = this._renderedData.get(panelId) ?? this._formData();
    const applied = Value.applyFormChange(this._config, previousData, nextData, this._pending);

    this._config = applied.config;
    this._pending = applied.pending;

    const nextView = this._viewForConfig(this._config);
    if (nextView !== previousView) {
      this._declaredExceptions = Exceptions.declaredKeys(this._config, nextView);
    }

    this._renderedData.set(panelId, this._formData());

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
    return EditorLocalize.computeHelper(ctx.language, ctx.view, schema, options?.path ?? []);
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

    const built = panel.build(ctx);
    const wholePanel =
      filtering && !this._filter.customizedOnly && Filter.matchesPanel(panel, filterCtx);
    const schema = wholePanel ? built : Filter.filterSchema(built, filterCtx);

    const data = this._formData();
    this._renderedData.set(panel.id, data);

    const exceptions = this._renderExceptions(panel, built, ctx);
    const entities = this._renderEntities(panel, ctx);
    const extras = Filter.filterExtras(panel.extras?.(ctx) ?? [], panel, filterCtx);

    const empty =
      !Filter.hasFields(schema) &&
      extras.length === 0 &&
      exceptions === nothing &&
      entities === nothing;

    if (filtering && empty) {
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
            @value-changed=${(event: CustomEvent) => this._valueChanged(panel.id, event)}
          ></ha-form>
          ${extras.map((extra) => this._renderExtra(extra))} ${entities} ${exceptions}
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
      EditorLocalize.lookup(ctx.language, panel.titleKey) ?? EditorLocalize.humanize(panel.titleKey)
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
    return EditorLocalize.lookup(ctx.language, `${panel.titleKey}.helper`);
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
            Entities.showsLocation(entry, ctx.config, ctx.view),
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

    this._config = {
      ...this._config,
      entities: Entities.writeEntity(
        this._config.entities ?? [],
        index,
        next,
        this._config.accent_color,
        this.hass ?? undefined,
      ),
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

    this._config = {
      ...this._config,
      entities: Entities.removeEntity(this._config.entities ?? [], index),
    };

    this._report(this._config);
  }

  /**
   * Renders the exceptions widget for a panel.
   *
   * @param panel - Panel being rendered
   * @param schema - The panel's schema, as built and before any filtering
   * @param ctx - Schema context
   * @returns The widget, or nothing
   */
  private _renderExceptions(
    panel: PanelDef,
    schema: HaFormSchema[],
    ctx: SchemaCtx,
  ): TemplateResult | typeof nothing {
    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[ctx.view];
    if (blockKey === undefined) return nothing;

    const eligible = Exceptions.eligibleFields(schema, ctx.view, panel.id, ctx.language);
    if (eligible.length === 0) return nothing;

    const declared = Exceptions.activeFields(eligible, this._declaredExceptions);
    const path = [blockKey as string];
    const filtering = Filter.isFiltering(this._filter);
    const title = this._string(ctx, 'exceptions.title');
    const active = Filter.filterExceptions(declared, title, path, this._filterCtx);

    if (filtering && active.length === 0) return nothing;

    const label = (field: SelectorSchema): string =>
      EditorLocalize.computeLabel(ctx.language, field, path);

    const picker: HaFormSchema = {
      name: EXCEPTION_PICKER,
      selector: {
        select: {
          mode: 'dropdown',
          multiple: true,
          options: eligible.map((field) => ({ value: field.name, label: label(field) })),
        },
      },
    };

    const names = active.map((field) => field.name);
    const data = Overrides.overrideFormData(
      Value.exceptionFormBlock(this._config!, ctx.view, names),
      names,
      Overrides.pendingForBlock(this._pending, blockKey as string),
    );
    const rows = Overrides.expandFields(active, ctx.language, data);

    return html`
      <ha-expansion-panel
        outlined
        class="exceptions"
        .header=${title}
        .secondary=${this._exceptionSummary(declared.length, ctx)}
        .leftChevron=${false}
        .expanded=${filtering}
      >
        <ha-svg-icon slot="leading-icon" .path=${EXCEPTION_ICON}></ha-svg-icon>
        <div class="panel-body">
          <ha-form
            class="exception-picker"
            .hass=${this.hass}
            .data=${{ [EXCEPTION_PICKER]: declared.map((field) => field.name) }}
            .schema=${[picker]}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            .localizeValue=${this._localizeValue}
            @value-changed=${(event: CustomEvent) =>
              this._exceptionsSelected(blockKey, eligible, event)}
          ></ha-form>
          ${active.length === 0
            ? nothing
            : html`
                <ha-form
                  class="exception-form"
                  .hass=${this.hass}
                  .data=${data}
                  .schema=${rows}
                  .computeLabel=${(schemaNode: HaFormSchema) =>
                    EditorLocalize.computeLabel(ctx.language, schemaNode, path)}
                  .computeHelper=${(schemaNode: HaFormSchema) =>
                    EditorLocalize.computeSubformHelper(ctx.language, ctx.view, schemaNode, path)}
                  .localizeValue=${this._localizeValue}
                  @value-changed=${(event: CustomEvent) =>
                    this._exceptionChanged(blockKey, names, event)}
                ></ha-form>
              `}
        </div>
      </ha-expansion-panel>
    `;
  }

  /**
   * The line under the exceptions heading.
   *
   * @param count - How many options this panel currently overrides
   * @param ctx - Schema context
   * @returns Secondary text
   */
  private _exceptionSummary(count: number, ctx: SchemaCtx): string {
    if (count === 0) return this._string(ctx, 'exceptions.summary.none');
    if (count === 1) return this._string(ctx, 'exceptions.summary.one');

    return interpolate(this._string(ctx, 'exceptions.summary.many'), { count });
  }

  /**
   * Adds and removes exceptions as the picker reports them.
   *
   * @param blockKey - Config key holding the view's override block
   * @param eligible - The panel's eligible fields
   * @param event - The picker's `value-changed`
   */
  private _exceptionsSelected(
    blockKey: keyof Types.Config,
    eligible: ReadonlyArray<SelectorSchema>,
    event: CustomEvent,
  ): void {
    event.stopPropagation();

    if (!this._config) return;

    const selection = event.detail?.value?.[EXCEPTION_PICKER];
    if (!Array.isArray(selection)) return;

    const applied = Exceptions.applySelection(
      this._config,
      blockKey,
      eligible.map((field) => field.name),
      this._declaredExceptions,
      selection.map((key) => String(key)),
    );

    this._config = applied.config;
    this._declaredExceptions = applied.declared;

    this._report(this._config);
  }

  /**
   * Folds a change to an exception's value into the override block.
   *
   * @param blockKey - Config key holding the view's override block
   * @param names - Options whose rows this form is currently showing
   * @param event - The form's `value-changed`
   */
  private _exceptionChanged(
    blockKey: keyof Types.Config,
    names: ReadonlyArray<string>,
    event: CustomEvent,
  ): void {
    event.stopPropagation();

    const next = event.detail?.value as Record<string, unknown> | undefined;
    if (!next || !this._config) return;

    const key = blockKey as string;
    const pending = Overrides.pendingForBlock(this._pending, key);
    const previous = Overrides.overrideFormData(
      Value.exceptionFormBlock(this._config, this._viewForConfig(this._config), names),
      names,
      pending,
    );

    const stored = this._config[blockKey];
    const applied = Overrides.applyOverrideChange(
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {},
      previous,
      next,
      pending,
    );

    this._pending = Overrides.mergeBlockPending(this._pending, key, applied.pending);
    this._config = { ...this._config, [blockKey]: applied.block } as Types.Config;

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
    const panels = PANELS.map((panel) => this._renderPanel(panel, ctx)).filter(
      (panel) => panel !== nothing,
    );

    const empty = panels.length === 0 && Filter.isFiltering(this._filter);

    return html`
      <div class="card-config">
        ${this._renderFilterBar()} ${panels} ${empty ? this._renderNoMatches(ctx) : nothing}
      </div>
    `;
  }

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
