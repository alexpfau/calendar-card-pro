/**
 * The editor element — the chassis around `<ha-form>`.
 *
 * What is left once the field-rendering layer is Home Assistant's: lifecycle,
 * `setConfig`, one panel mount per registered panel, one change handler, and the three
 * hooks that resolve every string in the form. There is no per-field code here at all,
 * and that is the measure of whether the rebuild is working.
 *
 * The element names exactly two Home Assistant components — `ha-form` and
 * `ha-expansion-panel` — where the old editor names a dozen, most of them input
 * elements. Input elements are the ones Home Assistant renames: `ha-textfield` became
 * `ha-input` in 2026.5 and cost us a runtime-detection shim that is still in the old
 * file. A schema names a selector instead, and Home Assistant picks the element.
 */

import { LitElement, TemplateResult, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import type { HaFormSchema } from './ha-form';
import * as EditorLocalize from './localize';
import { PANELS, type PanelDef, type PanelExtra, type SchemaCtx } from './panels';
import styles from './styles';
import * as Synthetic from './synthetic';
import * as Value from './value';
import * as Config from '../../config/config';
import * as Types from '../../config/types';
import * as ViewConfig from '../../config/view';
import * as Localize from '../../translations/localize';

/**
 * Schema-driven configuration editor for Calendar Card Pro.
 */
export class CalendarCardProEditorNext extends LitElement {
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

    const stored = Value.toStoredConfig(applied.config);

    // An edit that only moved uncommitted text has changed nothing Home Assistant
    // needs to hear about, and telling it anyway is actively harmful: it answers with
    // a `setConfig` carrying the unchanged configuration, and the held keystrokes go
    // with it. Silence is also correct on its own terms — nothing was configured.
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
   * @param panel - Panel definition
   * @param ctx - Schema context
   * @returns The panel template
   */
  private _renderPanel(panel: PanelDef, ctx: SchemaCtx): TemplateResult {
    const schema = panel.build(ctx);
    const data = this._formData();
    this._renderedData.set(panel.id, data);

    const extras = panel.extras?.(ctx) ?? [];

    return html`
      <ha-expansion-panel outlined .header=${this._panelTitle(panel, ctx)} .leftChevron=${false}>
        <ha-svg-icon slot="leading-icon" .path=${panel.iconPath}></ha-svg-icon>
        <div class="panel-body">
          <ha-form
            .hass=${this.hass}
            .data=${data}
            .schema=${schema}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            .localizeValue=${this._localizeValue}
            @value-changed=${(event: CustomEvent) => this._valueChanged(panel.id, event)}
          ></ha-form>
          ${extras.map((extra) => this._renderExtra(extra))}
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
   * Renders the editor.
   *
   * @returns The editor template
   */
  render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const ctx = this._ctx;

    return html`
      <div class="card-config">${PANELS.map((panel) => this._renderPanel(panel, ctx))}</div>
    `;
  }
}
