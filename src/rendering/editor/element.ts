/**
 * The editor element — the chassis around `<ha-form>`.
 *
 * What is left once the field-rendering layer is Home Assistant's: lifecycle,
 * `setConfig`, one panel mount per registered panel, one change handler, and the three
 * hooks that resolve every string in the form. There is no per-field code here at all,
 * and that is the measure of whether the rebuild is working.
 *
 * The element names three Home Assistant components — `ha-form`, `ha-expansion-panel`
 * and `ha-svg-icon` — where the editor it replaced named a dozen, most of them input
 * elements. Input elements are the ones Home Assistant renames: `ha-textfield` became
 * `ha-input` in 2026.5 and cost a runtime-detection shim that was deleted with that
 * editor. A schema names a selector instead, and Home Assistant picks the element.
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
import { entitySchemaFor } from './schemas/entity';
import { interpolate } from './strings';
import styles from './styles';
import { EXCEPTION_PICKER } from './subforms';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Localize from '../../translations/localize';

/** Icon for a calendar's own settings, and for the exceptions group. */
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

  /**
   * The configuration being edited, with defaults merged in.
   *
   * Merged rather than raw because a form binds values, and an unset option has to
   * show the value the card would actually use. The write path narrows it again — see
   * `value.ts` — so what is stored stays minimal regardless of what is displayed.
   */
  @state() private _config?: Types.Config;

  /**
   * Text the user has typed that the configuration cannot accept yet.
   *
   * The replacement for the old editor's `event.type` guards, which have no equivalent
   * under a form that fires one event for every field. See `synthetic.ts`.
   */
  @state() private _pending: Record<string, string> = {};

  /**
   * Options the user has asked to hold an exception for.
   *
   * Not derivable from the configuration, and that is the whole reason it exists. An
   * exception starts out equal to the value it inherits, and an override equal to what
   * it inherits is stripped on write — so a list derived from the stored block would
   * delete each row at the moment it was created. This is the same shape of problem as
   * a half-typed value, held the same way: in the editor, until the configuration can
   * carry it.
   */
  @state() private _declaredExceptions: ReadonlySet<string> = new Set();

  /**
   * What the user has asked the editor to show them.
   *
   * Editor state and nothing else: it filters what is rendered and never reaches the
   * configuration, so there is no write path to guard and no chance of a search term
   * being persisted to someone's YAML.
   */
  @state() private _filter: Filter.FilterCriteria = Filter.NO_FILTER;

  /**
   * The form data as last rendered, per panel.
   *
   * Kept so a change can be diffed back to the key that moved: `ha-form` reports the
   * whole data object and never says which field produced the event.
   */
  private _renderedData = new Map<string, Record<string, unknown>>();

  /**
   * The configuration this editor last sent to Home Assistant.
   *
   * Home Assistant echoes a `config-changed` back through `setConfig`, so without a
   * record of what we sent there is no way to tell our own edit from a new card being
   * opened — and the two need opposite treatment of the pending text.
   */
  private _lastDispatched?: Record<string, unknown>;

  /**
   * Accepts a configuration from Home Assistant.
   *
   * Pending text is normally dropped here, because the configuration has moved
   * underneath the form — a different card has been opened, or the YAML was edited
   * directly — and holding a half-typed value across that would show text belonging to
   * a card that is no longer on screen.
   *
   * The exception is our own edit coming back round. Home Assistant answers a
   * `config-changed` by feeding the configuration back in, so an unconditional reset
   * here would erase a held keystroke with the echo of the keystroke that produced it.
   *
   * @param config - Card configuration as stored
   */
  setConfig(config: Types.Config): void {
    const isEcho =
      this._lastDispatched !== undefined &&
      Value.equalConfigs(config as unknown as Record<string, unknown>, this._lastDispatched);

    this._config = { ...Config.DEFAULT_CONFIG, ...config };

    if (!isEcho) {
      this._pending = {};
      this._declaredExceptions = Exceptions.declaredKeys(this._config);
    }

    // Recorded even for an echo, and even before anything is edited: without a
    // baseline the first edit has nothing to compare against and would be reported
    // whether or not it configured anything. `toStoredConfig` is idempotent, so
    // normalising the incoming config here makes the comparison like-for-like — a
    // config carrying a redundant default compares equal to the one we would write.
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
    const view: Types.EffectiveView = ViewConfig.VIEWS.includes(config.view) ? config.view : 'list';

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
   * The merged configuration plus the synthetic fields, which exist only here and are
   * removed again on the way out.
   *
   * @returns Form data
   */
  private _formData(): Record<string, unknown> {
    return {
      ...(this._config as unknown as Record<string, unknown>),
      // Projected so that a density control shows the value the card is using rather
      // than a blank box; see `columnFormBlock`. The write path strips it again.
      column: Value.columnFormBlock(this._config!),
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

    const previousData = this._renderedData.get(panelId) ?? this._formData();
    const applied = Value.applyFormChange(this._config, previousData, nextData, this._pending);

    this._config = applied.config;
    this._pending = applied.pending;

    // Re-derived rather than taken from the event, so that a value the config refused
    // — a half-typed offset — is reflected back as what the form should now show.
    this._renderedData.set(panelId, this._formData());

    this._report(applied.config);
  }

  /**
   * Tells Home Assistant what the configuration now is, when it has moved.
   *
   * The single exit from the editor, shared by the form handler and by the two
   * hand-written widgets, so that what is stored is narrowed the same way regardless of
   * which of the three produced the edit.
   *
   * An edit that changed nothing storable is not reported, and telling Home Assistant
   * anyway would be actively harmful rather than merely noisy: it answers with a
   * `setConfig` carrying the unchanged configuration, and any held keystrokes go with
   * it. Silence is also correct on its own terms — nothing was configured.
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
   * One closure for the whole form, against 122 hand-written lookup sites in the old
   * editor.
   *
   * Home Assistant passes the enclosing group path as `{ path }` rather than as a bare
   * array — `ha-form-expandable` builds `{ ...options, path: [...] }` as it descends —
   * so the object is unwrapped here rather than in the resolver, which stays a plain
   * function the tests can call directly.
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
   * Selectors built here carry their own labels, so this only fires for keys a
   * selector generates itself. Returning `undefined` leaves Home Assistant's own
   * resolution in place rather than overriding it with a humanised key.
   *
   * @param key - Translation key the selector asked for
   * @returns The resolved string, or `undefined` to defer
   */
  private _localizeValue = (key: string): string | undefined =>
    EditorLocalize.lookup(this._ctx.language, key);

  /**
   * Renders one panel: an expansion panel wrapping a form.
   *
   * Nothing is rendered for a panel the filter has emptied. A collapsed heading with no
   * fields under it is worse than absent — it reads as a section that holds no match,
   * which is exactly the thing the user would then open to check.
   *
   * A filtered editor renders its panels **expanded**, because the alternative is nine
   * collapsed headings and no answer: the user asked where an option is, and a closed
   * panel replies only with which section it is in.
   *
   * @param panel - Panel definition
   * @param ctx - Schema context
   * @returns The panel template, or nothing when the filter leaves it empty
   */
  private _renderPanel(panel: PanelDef, ctx: SchemaCtx): TemplateResult | typeof nothing {
    const filterCtx = this._filterCtx;
    const filtering = Filter.isFiltering(this._filter);

    // A panel whose own heading answers the query is shown whole, exactly as a matching
    // group inside one is: the user asked for the section, not for whichever of its
    // fields repeats the word. "Customized only" is no such exemption — a section kept
    // whole on the strength of its title would bring back every default in it.
    const built = panel.build(ctx);
    const wholePanel =
      filtering && !this._filter.customizedOnly && Filter.matchesPanel(panel, filterCtx);
    const schema = wholePanel ? built : Filter.filterSchema(built, filterCtx);

    const data = this._formData();
    this._renderedData.set(panel.id, data);

    // Built against the *unfiltered* schema: which options a panel may hold an exception
    // for is a property of the panel, not of what is on screen, and deriving it from a
    // filtered schema would quietly shorten the picker's list of options while a search
    // was active.
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
   * One line saying what the panel is for, which is what makes nine collapsed headings
   * navigable rather than a list of nouns to guess between.
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
   * The union is over data, so this is the only place in the editor that knows how any
   * of it is drawn.
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
   * The hand-written half of the editor, and it is hand-written because `ha-form` has
   * no member for an ordered list of heterogeneous sub-configs — the same reason every
   * Home Assistant card with a list is a hybrid. What is hand-written is the **list**:
   * each calendar's fields are an ordinary schema fed to an ordinary form, which is why
   * labels, helpers, grids and default-stripping all still work here without a second
   * implementation of any of them.
   *
   * The picker above stays. It is the only way to add a calendar at all, it is where
   * order is set — and order is configuration, since duplicate filtering keeps the copy
   * from whichever calendar is listed first — and it already merges settings back by
   * entity id, so a calendar deselected and reselected keeps everything configured for
   * it. The two are one control split by responsibility: membership and order above,
   * settings below.
   *
   * @param panel - Panel being rendered
   * @param ctx - Schema context
   * @returns The list, or nothing for every other panel
   */
  private _renderEntities(panel: PanelDef, ctx: SchemaCtx): TemplateResult | typeof nothing {
    // Selected by the path it is rendered under rather than by position, and by the
    // panel that owns the list rather than by name. `entities` is the only list-shaped
    // key the configuration has — `weather.date`, `weather.event` and `column` are all
    // fixed-key objects — so a panel declaring a sub-form under this path is declaring
    // the schema for one member of it.
    const subform = panel
      .subforms?.(ctx)
      ?.find((candidate) => candidate.path.join('.') === ENTITY_PATH.join('.'));
    if (subform === undefined) return nothing;

    const entries = this._config?.entities ?? [];
    if (entries.length === 0) return nothing;

    const filterCtx = this._filterCtx;
    const filtering = Filter.isFiltering(this._filter);

    // Filtered per calendar rather than once for the list: what counts as customized is
    // a property of the individual calendar, so one calendar's settings can survive a
    // filter that empties its neighbour's.
    const shown = entries
      .map((entry, index) => ({
        entry,
        index,
        schema: Filter.filterEntitySchema(
          // Narrowed to this calendar's own label shape before the filter runs, so the
          // filter sees the fields this calendar actually renders rather than the
          // superset the panel declares.
          entitySchemaFor(subform.schema, Entities.labelTypeOf(entry)),
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
            .header=${entityId}
            .secondary=${this._entitySummary(entry, ctx)}
            .leftChevron=${false}
            .expanded=${filtering}
          >
            <ha-svg-icon slot="leading-icon" .path=${ENTITY_ICON}></ha-svg-icon>
            <div class="panel-body">
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
              <div class="entity-actions">
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
              </div>
            </div>
          </ha-expansion-panel>
        `;
      })}
    `;
  }

  /**
   * The line under a calendar's heading.
   *
   * Its label where it has one, since that is what the user named it; otherwise a count
   * of what is configured, so a collapsed calendar still says whether there is anything
   * inside it.
   *
   * @param entry - Entry as stored
   * @param ctx - Schema context
   * @returns Secondary text
   */
  private _entitySummary(entry: string | Types.EntityConfig, ctx: SchemaCtx): string {
    const config = Entities.asEntityConfig(entry);

    if (typeof config.label === 'string' && config.label !== '') {
      return config.label;
    }

    return Entities.hasSettings(entry)
      ? this._string(ctx, 'entity.customised')
      : this._string(ctx, 'entity.unconfigured');
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
      entities: Entities.writeEntity(this._config.entities ?? [], index, next),
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

    // The clipboard lives outside this element, so that it survives the dialog being
    // closed and reopened — which is the case the feature exists for. Nothing about it
    // is reactive, so the paste buttons have to be told it moved.
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
   * Renders the exceptions widget for a panel.
   *
   * An exception is a value that differs in one view, so it belongs beside the value it
   * differs from — in the panel that owns that value, not in a panel or a tab of its
   * own. What is offered comes from the panel's own schema, so the control for an
   * exception is the same control as for the option itself.
   *
   * Nothing is rendered for a view with no override block, or for a panel holding no
   * overridable option, and nothing is rendered *inside* the group until an exception is
   * added — a card with none costs one collapsed heading and no fields.
   *
   * Under a filter the widget appears only when it has rows the filter keeps. An
   * exception is a customization by construction, so "customized only" keeps every
   * declared row; a search keeps the rows it matches, and the whole widget when the
   * heading itself matches. A panel showing an exceptions heading with nothing behind it
   * would be the same empty promise as an empty panel.
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

    const eligible = Exceptions.eligibleFields(schema, panel.id, ctx.language);
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
          // Labelled from the fields themselves, so the list of options a user can
          // hold an exception for reads exactly like the panel above it.
          options: eligible.map((field) => ({ value: field.name, label: label(field) })),
        },
      },
    };

    // Bound to the block **plus** the stand-ins for whichever of its keys are unions —
    // the same mode dropdowns the panel above uses, pointed at the block. Recomputed
    // rather than remembered: it is a pure function of state the change has not touched
    // yet, so the handler below can rebuild the identical object to diff against.
    const names = active.map((field) => field.name);
    const data = Overrides.overrideFormData(
      Value.exceptionFormBlock(this._config!, names),
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
   * Removal deletes the key from the block rather than writing the inherited value into
   * it. Those are different acts, and only the first is what "remove this exception"
   * means: writing the inherited value leaves a line doing nothing, which is how a
   * configuration accumulates overrides nobody meant, and it would silently become a
   * real override the moment the shared value changed.
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

    // Declaring an exception configures nothing on its own — it starts out equal to the
    // value it inherits — so this reports only when a removal actually took a key away.
    this._report(this._config);
  }

  /**
   * Folds a change to an exception's value into the override block.
   *
   * A diff rather than a whole-object write, for the reason `applyFormChange` is a diff
   * everywhere else: three of the options here are edited through stand-in fields, so
   * what the form hands back is not the block — it is the block with some of its keys
   * replaced by the mode dropdowns that write them. `applyOverrideChange` reverses that,
   * and the previous data it diffs against is rebuilt rather than remembered, since it
   * is a pure function of configuration this event has not changed yet.
   *
   * Anything the result leaves redundant — an exception equal to what it would inherit,
   * a density value left at its default — is stripped on the way to storage, so
   * displaying an effective value never persists one.
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
      Value.exceptionFormBlock(this._config, names),
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

    // Only a filter can empty the editor, and only a filter has anything to explain: an
    // unfiltered editor with no panels would be a bug, and telling the user their search
    // matched nothing would be the wrong thing to say about it.
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
   * One `<ha-form>` of two fields, which is what keeps a search box from being the
   * editor's first input element and its fourth Home Assistant component — see
   * `FILTER_SCHEMA`. Its own form, bound to its own data, with a handler that touches
   * editor state and nothing else: no configuration passes through here at all.
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
   * Worth its own message rather than a blank pane, and worth two of them. A search that
   * finds nothing has a specific reason a user cannot see: the panels only build the
   * fields the current configuration calls for, so an option gated behind a switch that
   * is off is genuinely not in the editor to be found, and saying so is the difference
   * between a hint and a dead end. "Customized only" with nothing to show is not a
   * failure at all — it is the answer, and it deserves to be stated as one.
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
