/**
 * Calendar Card Pro
 *
 * A sleek and highly customizable calendar card for Home Assistant,
 * designed for performance and a clean, modern look.
 *
 * @author Alex Pfau
 * @license MIT
 * @version vPLACEHOLDER
 *
 * Project Home: https://github.com/alexpfau/calendar-card-pro
 * Documentation: https://calendar-card-pro.alexpfau.com
 *
 * Design inspired by Home Assistant community member @GHA_Steph's button-card calendar design
 * https://community.home-assistant.io/t/calendar-add-on-some-calendar-designs/385790
 *
 * Interaction patterns inspired by Home Assistant's Tile Card
 * and Material Design, both licensed under the Apache License 2.0.
 * https://github.com/home-assistant/frontend/blob/dev/LICENSE.md
 *
 * This package includes lit/LitElement (BSD-3-Clause License)
 */

import { LitElement, PropertyValues, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as ViewConfig from './config/view';
import * as Actions from './interaction/actions';
import * as Feedback from './interaction/feedback';
import type * as Editor from './rendering/editor/index';
import * as Render from './rendering/render';
import * as Styles from './rendering/styles';
import * as Localize from './translations/localize';
import { editorModuleUrl } from './utils/editor-url';
import * as EntityColors from './utils/entity-colors';
import * as EventUtils from './utils/events';
import * as FormatUtils from './utils/format';
import * as Helpers from './utils/helpers';
import * as Logger from './utils/logger';
import * as Templates from './utils/templates';
import * as Weather from './utils/weather';
import * as WeatherI18n from './utils/weather-i18n';

//-----------------------------------------------------------------------------
// GLOBAL TYPE DECLARATIONS
//-----------------------------------------------------------------------------

export {};

declare global {
  interface Window {
    customCards: Array<Types.CustomCard>;
  }

  interface HTMLElementTagNameMap {
    'calendar-card-pro-dev': CalendarCardPro;
    'calendar-card-pro-dev-editor': Editor.CalendarCardProEditor;
    'ha-ripple': HTMLElement;
  }
}

//-----------------------------------------------------------------------------
// EDITOR ADOPTION
//-----------------------------------------------------------------------------

/**
 * Registers the editor component out of a freshly imported editor module.
 *
 * @param module - Whatever the dynamic import resolved to
 * @param tagName - Element name to register the editor under
 * @throws When the module does not carry a usable editor component
 */
export function adoptEditorComponent(module: unknown, tagName: string): void {
  const editorModule = module as Partial<typeof Editor> | undefined | null;
  const component = editorModule?.CalendarCardProEditor;

  if (typeof component !== 'function') {
    throw new Error(
      'Calendar Card Pro: the editor file was found but is not the card’s editor. ' +
        'This usually means another file of the same name is installed alongside it — ' +
        'put the card’s files in a folder of their own, or reinstall through HACS, ' +
        'which does that for you. The card itself is unaffected.',
    );
  }

  const editorVersion = editorModule?.EDITOR_VERSION;
  if (editorVersion !== Constants.VERSION.CURRENT) {
    Logger.warn(
      `Editor file is v${editorVersion ?? 'unknown'} but the card is v${Constants.VERSION.CURRENT}. ` +
        // Deliberately names the two roles rather than the two filenames: this string is
        // emitted into both bundles, and the dev build's files carry a `-dev` suffix, so
        // any literal filename here is wrong in one of the two builds. `tests/
        // editor-adoption.test.ts` holds that line.
        'Both files come from the same release, so one of them is stale — hard-refresh the ' +
        'browser, and if that does not help, reinstall so the card and editor files are ' +
        'replaced together.',
    );
  }

  if (!customElements.get(tagName)) {
    customElements.define(tagName, component as CustomElementConstructor);
  }
}

/**
 * Whether rendered event content exceeds its available height by more than rounding noise.
 *
 * @param content - The event content whose rendered dimensions to compare
 * @returns Whether a disclosed detail row is clipped
 */
export function gridContentOverflows(
  content: Pick<HTMLElement, 'clientHeight' | 'scrollHeight'>,
): boolean {
  return content.scrollHeight > content.clientHeight + 1;
}

//-----------------------------------------------------------------------------
// MAIN COMPONENT CLASS
//-----------------------------------------------------------------------------

/**
 * Main Calendar Card Pro custom element.
 */
@customElement('calendar-card-pro-dev')
class CalendarCardPro extends LitElement {
  //-----------------------------------------------------------------------------
  // PROPERTIES
  //-----------------------------------------------------------------------------

  @property({ attribute: false }) hass?: Types.Hass;
  @property({ attribute: false }) config: Types.Config = { ...Config.DEFAULT_CONFIG };
  @property({ attribute: false }) events: Types.CalendarEventData[] = [];
  @property({ attribute: false }) isInitialLoad = true;
  @property({ attribute: false }) isLoading = false;
  @property({ attribute: false }) isExpanded = false;
  @property({ attribute: false }) weatherForecasts: Types.WeatherForecasts = {
    daily: {},
    hourly: {},
  };

  /**
   * Latest value rendered by Home Assistant for a templated `title`.
   */
  @property({ attribute: false }) renderedTitle?: string;

  /**
   * Set while the dashboard is editable or the card picker preview is rendering.
   */
  @property({ type: Boolean }) preview = false;
  @property({ type: Boolean }) editMode = false;

  /**
   * Tells `hui-card` to keep this element in the DOM while it is hidden.
   */
  public connectedWhileHidden = true;

  /**
   * Load the editor on demand.
   *
   * The computed URL preserves the card's own cache-busting query string for the
   * separately built editor file.
   *
   * @returns The editor element, once its file has loaded
   */
  static async getConfigElement(): Promise<HTMLElement> {
    if (!customElements.get('calendar-card-pro-dev-editor')) {
      try {
        const editor = (await import(editorModuleUrl(import.meta.url))) as typeof Editor;

        adoptEditorComponent(editor, 'calendar-card-pro-dev-editor');
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        Logger.error(error, 'loading the editor file');

        throw new Error(
          'Calendar Card Pro: the editor could not be loaded because one of the card’s ' +
            'files is missing. Reinstalling the card in HACS restores it. The card ' +
            `itself is unaffected. (${detail})`,
        );
      }
    }

    return document.createElement('calendar-card-pro-dev-editor');
  }

  static getStubConfig = Config.getStubConfig;

  /**
   * Declares the card's default size to a Home Assistant sections dashboard.
   *
   * @returns Default grid sizing for a sections-view dashboard
   */
  public getGridOptions(): { columns: 'full'; rows: 'auto' } {
    return { columns: 'full', rows: 'auto' };
  }

  private _instanceId = Helpers.generateInstanceId();
  /**
   * The `_instanceId` the events currently held in `events` were fetched for.
   */
  private _eventsInstanceId = '';
  /**
   * Monotonic ticket for in-flight event requests.
   *
   * `updateEvents()` awaits the API, and two entry points can bump this during that
   * await: `setConfig()` regenerating `_instanceId` and starting a second request, and
   * `disconnectedCallback` superseding any fetch that is still open so a detached
   * `setConfig` cannot stamp a late response with a new identity. Comparing the ticket
   * a request started with against the current value is what tells a superseded
   * response to discard itself instead of committing.
   */
  private _eventRequestGeneration = 0;
  private _language = '';
  private _refreshTimerId?: number;
  private _lastUpdateTime = 0;
  private _initialLoadRetryId?: number;
  private _weatherUnsubscribers: Array<() => void> = [];
  private _weatherSetupVersion = 0;
  private _weatherSetupPending = false;
  /**
   * Subscription that keeps `renderedTitle` in step with a templated `title`.
   */
  private _titleSubscription?: Templates.TemplateSubscription;
  /**
   * True when the most recent fetch could not read at least one calendar.
   */
  private _hasFetchError = false;
  private _visibleCountCache?: {
    events: Types.CalendarEventData[];
    config: Types.Config;
    view: Types.EffectiveView;
    language: string;
    /**
     * Resolved first weekday. `config` alone does not cover it: under
     * `first_day_of_week: 'system'` the weekday comes from the user's Home Assistant
     * profile, so it can move while the config object stays identical.
     */
    firstWeekday: number;
    count: number;
  };
  private _effectiveConfigCache?: {
    config: Types.Config;
    view: Types.EffectiveView;
    resolved: Types.Config;
  };

  private _activePointerId: number | null = null;
  private _pointerStart: { x: number; y: number } | null = null;
  private _pointerMoved = false;
  private _holdTriggered = false;
  private _holdTimer: number | null = null;
  private _holdIndicator: HTMLElement | null = null;
  /** Element that currently holds pointer capture for the active card gesture, if any. */
  private _pointerCaptureTarget: Element | null = null;
  private _capturedPointerId: number | null = null;
  private _releasingPointerCapture = false;

  /**
   * Card width in CSS pixels, as most recently measured.
   */
  private _measuredWidthPx: number | null = null;

  private _effectiveView: Types.EffectiveView = 'list';

  /**
   * Day columns actually rendered, after any width-driven reduction.
   */
  private _columnCount = 0;

  private _resizeObserver: ResizeObserver | null = null;
  private _gridDisclosureObserver: ResizeObserver | null = null;
  private _gridDisclosureRaf: number | null = null;

  /**
   * Repaint timer for the grid's now line, and the local day it last painted.
   *
   * Only ever running in grid view. The line is the only thing on the card that goes
   * stale purely with the passage of time — everything else changes when `hass` does.
   */
  private _nowLineTimerId: number | null = null;

  private _nowLineDayKey: string | null = null;

  /**
   * Pending trailing timer for the last width measurement.
   */
  private _widthSettleTimerId: number | null = null;

  //-----------------------------------------------------------------------------
  // COMPUTED GETTERS
  //-----------------------------------------------------------------------------

  /**
   * Safe accessor for hass - always returns hass object or null
   */
  get safeHass(): Types.Hass | null {
    return this.hass || null;
  }

  /**
   * Get the effective language to use based on configuration and HA locale
   */
  get effectiveLanguage(): string {
    if (!this._language && this.hass) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass.locale);
    }
    return this._language || 'en';
  }

  /**
   * Get events grouped by day
   */
  get groupedEvents(): Types.EventsByDay[] {
    return EventUtils.groupEventsByDay(
      this.events,
      this.effectiveConfig,
      this.isExpanded,
      this.effectiveLanguage,
      this.effectiveView,
      this.hass?.locale,
    );
  }

  /**
   * The view the user asked for, before any width-based fallback.
   */
  get requestedView(): Types.EffectiveView {
    return this.config.view;
  }

  /**
   * The view that will actually render.
   */
  get effectiveView(): Types.EffectiveView {
    if (this.preview || this.editMode) {
      return this.requestedView;
    }

    return this._effectiveView;
  }

  /**
   * The configuration as it applies to the view currently on screen.
   */
  get effectiveConfig(): Types.Config {
    const view = this.effectiveView;
    const cache = this._effectiveConfigCache;

    if (cache && cache.config === this.config && cache.view === view) {
      return cache.resolved;
    }

    const resolved = ViewConfig.resolveEffectiveConfig(this.config, view);

    this._effectiveConfigCache = { config: this.config, view, resolved };

    return resolved;
  }

  /**
   * Title to display, with templates resolved.
   */
  get effectiveTitle(): string | undefined {
    if (!Templates.isTemplate(this.config.title)) {
      return this.config.title;
    }

    return this.renderedTitle ?? '';
  }

  /**
   * True while a templated title is waiting for its first rendered value.
   */
  get isTitlePending(): boolean {
    return Templates.isTemplate(this.config.title) && this.renderedTitle === undefined;
  }

  /**
   * Number of real events the card would show across its full configured range.
   */
  get visibleEventCount(): number {
    const language = this.effectiveLanguage;
    const view = this.effectiveView;
    const firstWeekday = FormatUtils.getFirstDayOfWeek(
      this.config.first_day_of_week,
      this.hass?.locale,
    );
    const cache = this._visibleCountCache;

    if (
      cache &&
      cache.events === this.events &&
      cache.config === this.config &&
      cache.view === view &&
      cache.language === language &&
      cache.firstWeekday === firstWeekday
    ) {
      return cache.count;
    }

    const count = this.events.length
      ? EventUtils.groupEventsByDay(
          this.events,
          this.effectiveConfig,
          true,
          language,
          view,
          this.hass?.locale,
        ).reduce((total, day) => total + day.events.filter((event) => !event._isEmptyDay).length, 0)
      : 0;

    this._visibleCountCache = {
      events: this.events,
      config: this.config,
      view,
      language,
      firstWeekday,
      count,
    };

    return count;
  }

  //-----------------------------------------------------------------------------
  // STATIC PROPERTIES
  //-----------------------------------------------------------------------------

  static get styles() {
    return Styles.cardStyles;
  }

  //-----------------------------------------------------------------------------
  // LIFECYCLE METHODS
  //-----------------------------------------------------------------------------

  constructor() {
    super();
    this._instanceId = Helpers.generateInstanceId();
    Logger.initializeLogger(Constants.VERSION.CURRENT);
  }

  connectedCallback() {
    super.connectedCallback();
    Logger.debug('Component connected');

    this.startRefreshTimer();

    this.updateEvents();

    this._scheduleWeatherSetup();

    this._updateTitleSubscription();

    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    this._syncEntityColors();

    this._startWidthObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this._stopWidthObserver();
    this._stopGridDisclosureObserver();

    this._weatherSetupVersion++;
    this._weatherSetupPending = false;

    this._cleanupWeatherSubscriptions();

    this._titleSubscription?.destroy();
    this._titleSubscription = undefined;

    // Supersede any in-flight updateEvents. Detached setConfig can rewrite
    // `_instanceId` while a pre-disconnect fetch is still open; without this
    // bump the late response is not superseded, commits the old calendar's
    // events, and stamps them with the *new* identity so
    // `eventsMatchCurrentQuery` treats the mismatch as current.
    this._eventRequestGeneration++;
    this.isLoading = false;

    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
      this._refreshTimerId = undefined;
    }

    if (this._initialLoadRetryId) {
      clearTimeout(this._initialLoadRetryId);
      this._initialLoadRetryId = undefined;
    }

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }

    this._releaseActivePointerCapture();
    this._activePointerId = null;
    this._pointerStart = null;
    this._pointerMoved = false;
    this._holdTriggered = false;

    this._stopNowLineTimer();

    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    EntityColors.releaseEntityColors(this._onEntityColorsChanged);

    Logger.debug('Component disconnected');
  }

  //-----------------------------------------------------------------------------
  // WIDTH MEASUREMENT
  //-----------------------------------------------------------------------------

  /**
   * Begins observing the card's own width.
   */
  private _startWidthObserver(): void {
    if (this._resizeObserver || typeof ResizeObserver === 'undefined') {
      return;
    }

    this._resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;

      if (typeof width === 'number' && width > 0) {
        this._scheduleWidthMeasurement(width);
      }
    });

    this._resizeObserver.observe(this);
  }

  /**
   * Defers acting on a measured width until the measurements stop arriving.
   *
   * @param widthPx - Measured content width in CSS pixels
   */
  private _scheduleWidthMeasurement(widthPx: number): void {
    if (this._widthSettleTimerId !== null) {
      clearTimeout(this._widthSettleTimerId);
    }

    this._widthSettleTimerId = window.setTimeout(() => {
      this._widthSettleTimerId = null;
      this._handleWidthMeasured(widthPx);
    }, Constants.TIMING.WIDTH_SETTLE_DELAY);
  }

  //-----------------------------------------------------------------------------
  // NOW LINE
  //-----------------------------------------------------------------------------

  /**
   * Whether the card is currently drawing a now line that needs repainting.
   *
   * Both halves matter. Outside grid view there is no line, and with `show_now_line`
   * off there is none either — starting a timer for either case would make every list
   * card pay a repaint a minute for something it cannot display.
   */
  private get _wantsNowLine(): boolean {
    return (
      this.effectiveView === 'grid' &&
      ViewConfig.resolveTimeGridOption(this.config, 'show_now_line')
    );
  }

  /**
   * Starts or stops the now-line repaint to match what the card is currently rendering.
   *
   * Called from `updated()` rather than `connectedCallback`, because the view can change
   * after connection — a width fallback or an edit to `view` both flip it — and a timer
   * acquired once at connection would either never start or never stop.
   *
   * 🚨 The `isConnected` guard matches `_syncEntityColors`: Lit can still run `updated()`
   * after `disconnectedCallback` stopped the interval, and re-arming here would leave a
   * detached card ticking `requestUpdate` / `updateEvents` with nothing to tear it down
   * again until the element is reattached.
   */
  private _syncNowLineTimer(): void {
    if (!this.isConnected || !this._wantsNowLine || document.visibilityState === 'hidden') {
      this._stopNowLineTimer();
      return;
    }

    if (this._nowLineTimerId !== null) {
      return;
    }

    // A minute is the resolution the line is drawn at, so anything finer repaints for a
    // position that has not changed. The interval is deliberately not aligned to the
    // wall-clock minute: the line moves continuously and being up to a minute stale is
    // invisible, where the arithmetic to align it is not.
    this._nowLineTimerId = window.setInterval(() => {
      this._tickNowLine();
    }, Constants.TIMING.NOW_LINE_INTERVAL);

    this._nowLineDayKey = FormatUtils.getLocalDateKey(new Date());
  }

  private _stopNowLineTimer(): void {
    if (this._nowLineTimerId !== null) {
      clearInterval(this._nowLineTimerId);
      this._nowLineTimerId = null;
    }
  }

  /**
   * Repaints the now line, and the whole card when the local day has rolled over.
   *
   * The rollover check is why this is not simply `requestUpdate()`. At midnight every
   * day header is wrong, "today" has moved to a different column and the events on
   * screen are a day out of date — a repaint would move the line to the top of a column
   * that is no longer today. Refetching is the only thing that fixes that.
   */
  private _tickNowLine(): void {
    const dayKey = FormatUtils.getLocalDateKey(new Date());

    if (this._nowLineDayKey !== null && dayKey !== this._nowLineDayKey) {
      this._nowLineDayKey = dayKey;
      Logger.debug('Local day rolled over, refreshing events');
      this.updateEvents(true);
      return;
    }

    this._nowLineDayKey = dayKey;
    this.requestUpdate();
  }

  private _stopWidthObserver(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._widthSettleTimerId !== null) {
      clearTimeout(this._widthSettleTimerId);
      this._widthSettleTimerId = null;
    }
  }

  /**
   * Stops observing the dimensions of rendered grid event blocks.
   */
  private _stopGridDisclosureObserver(): void {
    this._gridDisclosureObserver?.disconnect();
    this._gridDisclosureObserver = null;

    if (this._gridDisclosureRaf !== null) {
      cancelAnimationFrame(this._gridDisclosureRaf);
      this._gridDisclosureRaf = null;
    }
  }

  /**
   * Hides optional grid details when their disclosed rows cannot fit.
   *
   * Container queries make the usual case cheap, but their fixed pixel rungs cannot account
   * for a theme or configuration that enlarges text. Keep the title visible and withdraw the
   * optional rows rather than clipping part of one.
   */
  private _applyGridDisclosureSafety(): void {
    for (const block of this.renderRoot.querySelectorAll<HTMLElement>(
      '.grid-event:not(.grid-event-overflow)',
    )) {
      block.classList.remove('grid-event-content-clipped');
      const content = block.querySelector<HTMLElement>('.grid-event-disclosure .event-content');

      if (
        content &&
        gridContentOverflows(content) &&
        content.querySelector('.time, .location, .description, .event-weather, .progress-bar-row')
      ) {
        block.classList.add('grid-event-content-clipped');
      }
    }
  }

  /**
   * Reconciles the disclosure safety fallback after layout has settled.
   */
  private _scheduleGridDisclosureSafety(): void {
    if (this._gridDisclosureRaf !== null) {
      cancelAnimationFrame(this._gridDisclosureRaf);
    }

    this._gridDisclosureRaf = requestAnimationFrame(() => {
      this._gridDisclosureRaf = null;
      this._applyGridDisclosureSafety();
    });
  }

  /**
   * Observes timed grid blocks because their height changes independently of the card width.
   */
  private _syncGridDisclosureSafety(): void {
    this._stopGridDisclosureObserver();

    if (
      !this.isConnected ||
      this.effectiveView !== 'grid' ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    const blocks = this.renderRoot.querySelectorAll<HTMLElement>(
      '.grid-event:not(.grid-event-overflow)',
    );
    if (!blocks.length) {
      return;
    }

    this._gridDisclosureObserver = new ResizeObserver(() => this._scheduleGridDisclosureSafety());
    blocks.forEach((block) => this._gridDisclosureObserver?.observe(block));
    this._scheduleGridDisclosureSafety();
  }

  /**
   * Records a new width and re-renders if it changes the layout.
   *
   * @param widthPx - Measured content width in CSS pixels
   */
  private _handleWidthMeasured(widthPx: number): void {
    const next = ViewConfig.resolveColumnFitOnMeasurement(
      this.requestedView,
      this.config,
      this._measuredWidthPx,
      widthPx,
      { view: this._effectiveView, columns: this._columnCount },
    );

    this._measuredWidthPx = widthPx;

    if (next.view === this._effectiveView && next.columns === this._columnCount) {
      return;
    }

    Logger.debug(
      `Layout changed from ${this._effectiveView}/${this._columnCount} to ` +
        `${next.view}/${next.columns} at ${Math.round(widthPx)}px`,
    );

    this._effectiveView = next.view;
    this._columnCount = next.columns;
    this.requestUpdate();
  }

  updated(changedProps: PropertyValues) {
    // Reconciled after every update rather than acquired once: the view can change after
    // connection — a width fallback or an edit to `view` both flip it — so a timer taken
    // in `connectedCallback` would either never start or never stop.
    this._syncNowLineTimer();
    this._syncGridDisclosureSafety();

    if (changedProps.has('hass') && this.hass && !changedProps.get('hass')) {
      this.updateEvents(true);
    }

    if (
      (changedProps.has('hass') && this.hass?.locale) ||
      (changedProps.has('config') && changedProps.get('config')?.language !== this.config.language)
    ) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass?.locale);
    }

    const hassJustAvailable = changedProps.has('hass') && this.hass && !changedProps.get('hass');
    const prevConfig = changedProps.get('config') as Types.Config | undefined;
    const weatherEntityChanged =
      changedProps.has('config') && this.config?.weather?.entity !== prevConfig?.weather?.entity;
    const weatherConfigChanged =
      weatherEntityChanged ||
      (changedProps.has('config') &&
        this.config?.weather?.position !== prevConfig?.weather?.position);

    // The forecast we are holding belongs to the entity we are leaving. Tearing down its
    // subscription does not remove the data, so without this the old entity's forecast is
    // drawn under the new configuration until the replacement subscription emits — and if
    // the new entity never supplies that forecast type, indefinitely. Deliberately not
    // done for other weather edits: the entity is unchanged there, so blanking the
    // forecast would only produce a flicker.
    if (weatherEntityChanged) {
      this.weatherForecasts = { daily: {}, hourly: {} };
    }

    if (hassJustAvailable || weatherConfigChanged) {
      this._scheduleWeatherSetup();
    }

    if (this.config?.weather?.entity) {
      WeatherI18n.ensureConditionTranslations(this.hass, this.config.language, () =>
        this.requestUpdate(),
      );
    }

    this._syncEntityColors();

    if (changedProps.has('hass') || changedProps.has('config')) {
      this._updateTitleSubscription();
    }

    this._applyVisibility();
  }

  //-----------------------------------------------------------------------------
  // PRIVATE METHODS
  //-----------------------------------------------------------------------------

  /**
   * Keep the title template subscription aligned with the current config.
   *
   * 🚨 The `isConnected` guard matches `_syncEntityColors` / `_syncNowLineTimer`:
   * `disconnectedCallback` destroys the subscription, then a queued `updated()` can
   * still run with a hass/config change and recreate it on a detached card — leaving
   * a live template subscription (and its `requestUpdate` path) with nothing on screen.
   */
  private _updateTitleSubscription(): void {
    if (!this.isConnected) {
      return;
    }

    const isTemplated = Templates.isTemplate(this.config.title);

    if (!isTemplated) {
      if (this._titleSubscription) {
        this._titleSubscription.destroy();
        this._titleSubscription = undefined;
      }

      this.renderedTitle = undefined;
      return;
    }

    if (!this._titleSubscription) {
      this._titleSubscription = new Templates.TemplateSubscription({
        onResult: (result) => {
          this.renderedTitle = result;
        },
        onError: () => {
          if (this.renderedTitle === undefined) {
            this.renderedTitle = '';
          }
        },
      });
    }

    this._titleSubscription.update(this.hass, this.config.title);
  }

  /**
   * Hide the card entirely when it has no events and `hide_when_empty` is on.
   */
  private _applyVisibility(): void {
    const isErrorState =
      !this.isInitialLoad && (!this.safeHass || this.config.entities.length === 0);

    const shouldHide =
      this.config.hide_when_empty === true &&
      !this.preview &&
      !this.editMode &&
      !isErrorState &&
      !this._hasFetchError &&
      this.visibleEventCount === 0;

    if (this.hidden === shouldHide) {
      return;
    }

    Logger.debug(`hide_when_empty: ${shouldHide ? 'hiding' : 'revealing'} card`);

    this.hidden = shouldHide;
    this.style.display = shouldHide ? 'none' : '';

    this.dispatchEvent(
      new CustomEvent('card-visibility-changed', {
        detail: { value: !shouldHide },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Generate style properties from configuration. Returns a style object for use with styleMap.
   */
  private getCustomStyles(): Record<string, string> {
    return Styles.generateCustomPropertiesObject(this.effectiveConfig);
  }

  /**
   * Handle visibility changes to refresh data when returning to the page
   */
  private _handleVisibilityChange = () => {
    // A hidden tab must not keep repainting, and a tab coming back must not wait a
    // minute for its line to catch up. `_syncNowLineTimer` does both, and the
    // `requestUpdate` below it is what redraws immediately on return.
    this._syncNowLineTimer();

    if (document.visibilityState === 'visible') {
      if (this._wantsNowLine) {
        this.requestUpdate();
      }

      const now = Date.now();
      if (now - this._lastUpdateTime > Constants.TIMING.VISIBILITY_REFRESH_THRESHOLD) {
        Logger.debug('Visibility changed to visible, updating events');
        this.updateEvents();
      }
    }
  };

  /**
   * Repaint when a calendar's color changes in Home Assistant.
   *
   * A stable field rather than an inline arrow, so registering is idempotent and
   * `disconnectedCallback` can deregister the same function it added.
   */
  private _onEntityColorsChanged = () => {
    this.requestUpdate();
  };

  /**
   * Hold a registry-color subscription for exactly as long as the config asks for one.
   *
   * Called from `connectedCallback` as well as `updated()`, because `disconnectedCallback`
   * releases and Lit requests no update on reconnect — so a card that came back without a
   * reactive property changing would stay deregistered. It re-registered in practice only
   * because `updateEvents()` happens to flip `isLoading` on its way through, which is
   * incidental rather than designed and does not happen when that method returns early.
   * Every other subscription in this file is acquired in `connectedCallback`; this one now
   * matches its neighbours.
   *
   * 🚨 The `isConnected` guard is what stops the `updated()` call site undoing
   * `disconnectedCallback`. Lit does not cancel an update scheduled before the element
   * left the document, so `updated()` runs for a card that is already detached — and
   * re-acquiring there puts a detached card back into the listener set and re-opens the
   * websocket subscription that `disconnectedCallback` had just closed. Nothing releases
   * it a second time, because that card's `disconnectedCallback` has already run. This is
   * the same leak the teardown exists to prevent, reached from the other side, and the
   * shape is invisible to a test that removes a card with no update in flight.
   */
  private _syncEntityColors(): void {
    if (!this.isConnected) {
      return;
    }

    if (EntityColors.usesEntityColor(this.config)) {
      EntityColors.ensureEntityColors(this.hass, this._onEntityColorsChanged);
    } else {
      EntityColors.releaseEntityColors(this._onEntityColorsChanged);
    }
  }

  /**
   * Start the refresh timer.
   *
   * 🚨 Guarded on `isConnected` for the same reason as `_syncNowLineTimer`:
   * `setConfig` always ends here, and a config edit (or a late `setConfig` after
   * the card left the DOM) must not re-arm a periodic `updateEvents` loop on a
   * detached element. `connectedCallback` starts the timer once the card is live.
   */
  private startRefreshTimer() {
    if (!this.isConnected) {
      if (this._refreshTimerId) {
        clearTimeout(this._refreshTimerId);
        this._refreshTimerId = undefined;
      }
      return;
    }

    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
    }

    const refreshMinutes =
      this.config.refresh_interval || Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES;
    const refreshMs = refreshMinutes * 60 * 1000;

    this._refreshTimerId = window.setTimeout(() => {
      this.updateEvents();
      this.startRefreshTimer();
    }, refreshMs);

    Logger.debug(`Scheduled next refresh in ${refreshMinutes} minutes`);
  }

  /**
   * Schedule weather subscription setup, debounced to collapse multiple calls within the same microtask into a single setup.
   */
  private _scheduleWeatherSetup(): void {
    if (this._weatherSetupPending) return;
    this._weatherSetupPending = true;
    queueMicrotask(() => {
      this._weatherSetupPending = false;
      if (!this.isConnected) return;
      this._setupWeatherSubscriptions();
    });
  }

  /**
   * Set up weather forecast subscriptions
   */
  private async _setupWeatherSubscriptions(): Promise<void> {
    const version = ++this._weatherSetupVersion;

    this._cleanupWeatherSubscriptions();

    if (!this.config?.weather?.entity || !this.hass) {
      return;
    }

    const forecastTypes = Weather.getRequiredForecastTypes(this.config.weather);

    for (const type of forecastTypes) {
      if (this._weatherSetupVersion !== version) {
        return;
      }

      const unsubscribe = await Weather.subscribeToWeatherForecast(
        this.hass!,
        this.config,
        type,
        (forecasts) => {
          // The stream can still deliver after unsubscribe (or after a newer
          // setup has already blanked forecasts for an entity switch). Without
          // this ticket check the previous entity's forecast is written back.
          if (this._weatherSetupVersion !== version) {
            return;
          }
          this.weatherForecasts = {
            ...this.weatherForecasts,
            [type]: forecasts,
          };
          this.requestUpdate();
        },
      );

      if (this._weatherSetupVersion !== version) {
        if (unsubscribe) unsubscribe();
        return;
      }

      if (unsubscribe) {
        this._weatherUnsubscribers.push(unsubscribe);
      }
    }
  }

  /**
   * Clean up weather subscriptions
   */
  private _cleanupWeatherSubscriptions(): void {
    const count = this._weatherUnsubscribers.length;
    if (count > 0) {
      Logger.debug(`Unsubscribing ${count} weather forecast subscription(s)`);
    }
    this._weatherUnsubscribers.forEach((unsubscribe) => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch (error) {
        Logger.warn('Failed to unsubscribe weather forecast', error);
      }
    });
    this._weatherUnsubscribers = [];
  }

  /**
   * Release any pointer capture taken for the active card gesture.
   *
   * `releasePointerCapture` fires `lostpointercapture` synchronously. The
   * matching handler must not treat that as an external abort, or it would
   * re-enter cancel in the middle of pointerup after the action has already
   * run (or while the rest of up is still clearing state). The flag below is
   * only set for the duration of our own release call.
   */
  private _releaseActivePointerCapture(): void {
    this._releasingPointerCapture = true;
    try {
      if (
        this._pointerCaptureTarget &&
        this._capturedPointerId !== null &&
        this._pointerCaptureTarget.hasPointerCapture?.(this._capturedPointerId)
      ) {
        try {
          this._pointerCaptureTarget.releasePointerCapture(this._capturedPointerId);
        } catch {
          // Already released or the pointer ended — nothing left to clean up.
        }
      }

      this._pointerCaptureTarget = null;
      this._capturedPointerId = null;
    } finally {
      this._releasingPointerCapture = false;
    }
  }

  /**
   * Capture the active pointer on the card so move/up survive leaving its box.
   *
   * Without capture, a hold that has already painted its indicator dies if the
   * finger slips a pixel past the card edge: `pointerleave` clears the gesture
   * and the matching `pointerup` never arrives on the card. Capture keeps the
   * sequence intact until up or cancel.
   */
  private _captureActivePointer(ev: PointerEvent): void {
    this._releaseActivePointerCapture();

    const target = ev.currentTarget;
    if (!(target instanceof Element) || typeof target.setPointerCapture !== 'function') {
      return;
    }

    try {
      target.setPointerCapture(ev.pointerId);
      this._pointerCaptureTarget = target;
      this._capturedPointerId = ev.pointerId;
    } catch {
      // Synthetic or inactive pointers throw — fall back to the uncaptured path.
    }
  }

  /**
   * Handle pointer down events for hold detection
   *
   * Only the primary button starts a card gesture. A right-click still
   * delivers `pointerdown` with `button === 2`; without this guard the card
   * armed hold, captured the pointer, and could fire `hold_action` when the
   * context menu was what the user asked for. Touch and pen primary contacts
   * report `button === 0`; unit stubs may omit the field entirely.
   */
  private _handlePointerDown(ev: PointerEvent) {
    if (typeof ev.button === 'number' && ev.button !== 0) {
      return;
    }

    this._activePointerId = ev.pointerId;
    this._pointerStart = { x: ev.clientX, y: ev.clientY };
    this._pointerMoved = false;
    this._holdTriggered = false;
    this._captureActivePointer(ev);

    // A second finger can land after the first hold already painted its indicator. The
    // previous gesture's timer is replaced below, but the body-level disc is not unless
    // we clear it here — createHoldIndicator always appends a fresh node, so leaving the
    // old reference in place orphans the first disc on document.body forever.
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }

    // Both operands are load-bearing, and the second alone was the defect: optional
    // chaining makes `null?.action !== 'none'` true, so a bare `hold_action:` in YAML —
    // which the user wrote to mean "nothing on hold" — armed the timer and drew a hold
    // indicator for an action `_handlePointerUp` would then refuse to run, swallowing
    // the tap with it. Requiring the block to exist makes this agree with the release
    // branch there, and with the documented `hold_action: none`.
    if (this.config.hold_action && this.config.hold_action.action !== 'none') {
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
      }

      this._holdTimer = window.setTimeout(() => {
        if (this._activePointerId === ev.pointerId) {
          this._holdTriggered = true;

          if (this._holdIndicator) {
            Feedback.removeHoldIndicator(this._holdIndicator);
            this._holdIndicator = null;
          }

          this._holdIndicator = Feedback.createHoldIndicator(ev, this.config);
        }
      }, Constants.TIMING.HOLD_THRESHOLD);
    }
  }

  /**
   * Cancel a pending card gesture once it becomes a scroll or drag.
   *
   * Movement after the hold threshold has already fired does not cancel the
   * hold: the indicator is the user's confirmation that the long-press landed,
   * and a few pixels of slip while lifting is normal on touch. Only motion
   * before that threshold turns the gesture into a drag.
   */
  private _handlePointerMove(ev: PointerEvent) {
    if (
      ev.pointerId !== this._activePointerId ||
      this._pointerMoved ||
      this._holdTriggered ||
      !this._pointerStart
    ) {
      return;
    }

    const deltaX = ev.clientX - this._pointerStart.x;
    const deltaY = ev.clientY - this._pointerStart.y;
    if (Math.hypot(deltaX, deltaY) <= Constants.UI.POINTER_MOVE_TOLERANCE) {
      return;
    }

    this._pointerMoved = true;

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle pointer up events to execute actions
   *
   * Only the primary button ends a card gesture. Mice share one `pointerId`
   * across buttons, so a right-button release arrives with the same id as the
   * left-button press that armed the hold. Without this guard that release
   * fired `hold_action`/`tap_action` and cleared state while the primary
   * button was still down. Touch and pen primary contacts report `button === 0`;
   * unit stubs may omit the field entirely.
   */
  private _handlePointerUp(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) return;
    if (typeof ev.button === 'number' && ev.button !== 0) return;

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    if (!this._pointerMoved && this._holdTriggered && this.config.hold_action) {
      Logger.debug('Executing hold action');
      Actions.handleAction(this, this.config, 'hold', () => this.toggleExpanded());
    } else if (!this._pointerMoved && !this._holdTriggered && this.config.tap_action) {
      Logger.debug('Executing tap action');
      Actions.handleAction(this, this.config, 'tap', () => this.toggleExpanded());
    }

    this._releaseActivePointerCapture();
    this._activePointerId = null;
    this._pointerStart = null;
    this._pointerMoved = false;
    this._holdTriggered = false;

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle pointer cancel events to clean up an aborted gesture
   */
  private _handlePointerCancel(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) {
      return;
    }

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    this._releaseActivePointerCapture();
    this._activePointerId = null;
    this._pointerStart = null;
    this._pointerMoved = false;
    this._holdTriggered = false;

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Geometric leave is not a gesture end while the card still holds capture.
   *
   * `pointerleave` fires when the hit-test leaves the card even though the finger
   * is still down. With capture, move and up keep arriving on the card, so
   * canceling here is what made a post-threshold hold die if the finger slipped
   * a pixel past the edge — the indicator had already confirmed the long-press,
   * then leave wiped it and the outside up never reached the listener. Without
   * capture, leave remains the only cleanup path for a contact that left.
   */
  private _handlePointerLeave(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) {
      return;
    }

    const target = ev.currentTarget;
    if (
      target instanceof Element &&
      this._capturedPointerId === ev.pointerId &&
      target.hasPointerCapture?.(ev.pointerId)
    ) {
      return;
    }

    this._handlePointerCancel(ev);
  }

  /**
   * Capture is what keeps leave from aborting a gesture still in progress. When the
   * browser or another element forcibly releases that capture — OS gesture, scroll
   * takeover, a second setPointerCapture — leave has often already been ignored under
   * the capture assumption, and the matching up may never reach the card. Treat the
   * loss like cancel so the hold indicator and active-pointer bookkeeping cannot stick
   * until the next unrelated down.
   *
   * Our own `releasePointerCapture` on up/cancel also fires this synchronously. That
   * path sets `_releasingPointerCapture` so this handler stays out of the way: the
   * action decision has already run (or cancel already cleaned up), and re-entering
   * cancel mid-up would only thrash state the rest of up is about to clear.
   */
  private _handleLostPointerCapture(ev: PointerEvent) {
    if (this._releasingPointerCapture) {
      return;
    }

    if (ev.pointerId !== this._activePointerId && ev.pointerId !== this._capturedPointerId) {
      return;
    }

    this._handlePointerCancel(ev);
  }

  /**
   * Handle keyboard navigation for accessibility
   *
   * The listener is bound on `<ha-card>` and keydown bubbles, so it sees keystrokes aimed
   * at every focusable descendant too. That was harmless while the card had none; the
   * grid's scroll regions carry `tabindex="0"` precisely so a keyboard user can scroll
   * them, and Space is a scroll container's own page-down key. Without the guard, focusing
   * one and pressing Space runs the card's tap action instead of scrolling — so the
   * affordance the tab stop exists to provide is the one thing it cannot do.
   *
   * Every focusable element here lives in this shadow root, so the event is not
   * retargeted and comparing target with currentTarget is exact. A synthetic event with
   * neither set — how the direct-call tests drive this — compares equal and still runs,
   * which is why the pin below dispatches a real bubbling event instead.
   */
  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.currentTarget != null && ev.target !== ev.currentTarget) return;

    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      Actions.handleAction(this, this.config, 'tap', () => this.toggleExpanded());
    }
  }

  //-----------------------------------------------------------------------------
  // PUBLIC METHODS
  //-----------------------------------------------------------------------------

  /**
   * Handle configuration updates from Home Assistant
   */
  setConfig(config: Partial<Types.Config>): void {
    const previousConfig = this.config;

    for (const message of Config.findDeprecatedKeys(config)) {
      Logger.deprecation(message);
    }

    // Deep rather than a plain spread: a nested block the user writes partly — a
    // `weather:` naming only `entity:` — must keep the defaults for everything it does
    // not mention, instead of blanking them. `mergeConfig` replaces arrays wholesale, so
    // `entities:` still overwrites rather than merging into the default list.
    const mergedConfig = Config.mergeConfig(
      Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as Record<string, unknown>,
    ) as unknown as Types.Config;

    this.config = mergedConfig;
    this.config.entities = Config.normalizeEntities(this.config.entities);
    Config.normalizeNumericOptions(this.config);
    Config.normalizeLengthOptions(this.config);
    ViewConfig.validateView(this.config);
    ViewConfig.validateColumnOverrides(this.config);

    // Column fitting is hysteretic: it holds the current answer inside a band so
    // the layout does not oscillate. Discarding that state on every setConfig()
    // re-fit the card from scratch, so an edit unrelated to layout could drop a
    // measured column card back to the list view at an unchanged width and leave
    // it there until the next resize. Only seed from a fit that a real
    // measurement produced — the optimistic pre-measurement answer must not.
    const seededFit = ViewConfig.resolveColumnFit(
      this.config.view,
      this.config,
      this._measuredWidthPx,
      this._measuredWidthPx === null
        ? null
        : { view: this._effectiveView, columns: this._columnCount },
    );

    this._effectiveView = seededFit.view;
    this._columnCount = seededFit.columns;

    this._instanceId = Helpers.generateDeterministicId(
      this.config.entities,
      this.config.days_to_show,
      this.config.start_date,
      this.config.first_day_of_week,
    );

    const configChanged = Config.hasConfigChanged(previousConfig, this.config);
    if (configChanged) {
      Logger.debug('Configuration changed, refreshing data');
      this.updateEvents(true);
    } else if (Config.hasEntityProcessingChanged(previousConfig, this.config)) {
      // A per-calendar edit that left every entity ID alone. The API request is
      // unchanged, but the decoration derived from it — label, color, filters — is
      // stamped onto each event at fetch time and shadows the live config, so the
      // cached payload has to be run through processing again. `false` keeps this on
      // the cache-hit path; without it a color tweak in the editor would appear to do
      // nothing until the next scheduled refresh.
      Logger.debug('Per-calendar configuration changed, reprocessing cached data');
      this.updateEvents(false);
    }

    this.startRefreshTimer();
  }

  /**
   * Update calendar events from API or cache. Simplified for card-mod compatibility.
   */
  async updateEvents(force = false): Promise<void> {
    Logger.debug(`Updating events (force=${force})`);

    // Detached setConfig still reaches here (and the no-hass branch arms a 1.5s
    // retry). connectedCallback re-runs updateEvents on attach; cache hits still
    // reprocess with the current config, so skipping while detached is safe.
    if (!this.isConnected) {
      return;
    }

    // Take a ticket before anything can await. Any call that starts after this one
    // supersedes it, and a superseded response must not touch card state — committing
    // it would both show the previous calendar's events and stamp them with the current
    // `_instanceId`, which makes `eventsMatchCurrentQuery` report true for a payload the
    // current query never asked for.
    const generation = ++this._eventRequestGeneration;
    const isSuperseded = (): boolean => generation !== this._eventRequestGeneration;

    // A retry is only ever armed because `hass` was missing. Now that it is present the
    // retry has nothing left to do, and it would fire with `force = true` — bypassing the
    // cache — 1.5 seconds after the card has already rendered.
    if (this.safeHass && this._initialLoadRetryId) {
      clearTimeout(this._initialLoadRetryId);
      this._initialLoadRetryId = undefined;
    }

    if (!this.safeHass || !this.config.entities.length) {
      this.isLoading = false;
      if (!this.safeHass) {
        if (this._initialLoadRetryId) {
          clearTimeout(this._initialLoadRetryId);
        }
        this._initialLoadRetryId = window.setTimeout(() => {
          this.updateEvents(true);
        }, 1500);
      } else {
        this.isInitialLoad = false;
      }
      return;
    }

    try {
      this.isLoading = true;
      await this.updateComplete;

      const { events: eventData, failedEntities } = await EventUtils.fetchEventData(
        this.safeHass,
        this.config,
        this._instanceId,
        force,
      );

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event response');
        return;
      }

      this._hasFetchError = failedEntities.length > 0;
      if (this._hasFetchError) {
        Logger.warn(`Could not load calendar(s): ${failedEntities.join(', ')}`);
      }

      this.isLoading = false;
      this.isInitialLoad = false;
      await this.updateComplete;

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event response');
        return;
      }

      const eventsMatchCurrentQuery = this._eventsInstanceId === this._instanceId;
      const keepPreviousEvents =
        this._hasFetchError &&
        eventData.length === 0 &&
        this.events.length > 0 &&
        eventsMatchCurrentQuery;

      if (keepPreviousEvents) {
        Logger.warn('Refresh failed and returned nothing — keeping previously loaded events');
      } else {
        this.events = [...eventData];
        this._eventsInstanceId = this._instanceId;
      }

      if (!this._hasFetchError) {
        this._lastUpdateTime = Date.now();
        Logger.info('Event update completed successfully');
      }
    } catch (error) {
      if (isSuperseded()) {
        Logger.debug('Ignoring a failure from a superseded event request');
        return;
      }
      Logger.error('Failed to update events:', error);
      this._hasFetchError = true;
      this.isLoading = false;
      this.isInitialLoad = false;
    }
  }

  /**
   * Determine whether compact mode is actually limiting what the card renders.
   */
  private hasCompactModeLimits(): boolean {
    if (!ViewConfig.viewAppliesCompactLimits(this.effectiveView)) {
      return false;
    }

    const isLimit = (value: unknown): boolean =>
      typeof value === 'number' && Number.isFinite(value);

    if (isLimit(this.config.compact_events_to_show) || isLimit(this.config.compact_days_to_show)) {
      return true;
    }

    return (this.config.entities ?? []).some(
      (entity) =>
        typeof entity === 'object' && entity !== null && isLimit(entity.compact_events_to_show),
    );
  }

  /**
   * Toggle expanded state for view modes with limited events
   */
  toggleExpanded(): void {
    if (this.hasCompactModeLimits()) {
      this.isExpanded = !this.isExpanded;
    }
  }

  /**
   * Handle user action
   */
  handleAction(actionConfig: Types.ActionConfig): void {
    const action = actionConfig === this.config.hold_action ? 'hold' : 'tap';
    Actions.handleAction(this, this.config, action, () => this.toggleExpanded());
  }

  //-----------------------------------------------------------------------------
  // RENDERING
  //-----------------------------------------------------------------------------

  /**
   * Render method with consistent, stable DOM structure for card-mod
   */
  render() {
    const customStyles = this.getCustomStyles();

    const handlers = {
      keyDown: (ev: KeyboardEvent) => this._handleKeyDown(ev),
      pointerDown: (ev: PointerEvent) => this._handlePointerDown(ev),
      pointerMove: (ev: PointerEvent) => this._handlePointerMove(ev),
      pointerUp: (ev: PointerEvent) => this._handlePointerUp(ev),
      pointerCancel: (ev: PointerEvent) => this._handlePointerCancel(ev),
      pointerLeave: (ev: PointerEvent) => this._handlePointerLeave(ev),
      lostPointerCapture: (ev: PointerEvent) => this._handleLostPointerCapture(ev),
    };

    let content: TemplateResult;

    const renderDays = (days: Types.EventsByDay[]): TemplateResult => {
      if (this.effectiveView === 'grid') {
        return Render.renderGridGroupedEvents(
          this._columnCount > 0 && this._columnCount < days.length
            ? days.slice(0, this._columnCount)
            : days,
          this.effectiveConfig,
          this.effectiveLanguage,
          this.weatherForecasts,
          this.safeHass,
        );
      }

      return this.effectiveView === 'column'
        ? Render.renderColumnGroupedEvents(
            this._columnCount > 0 && this._columnCount < days.length
              ? days.slice(0, this._columnCount)
              : days,
            this.effectiveConfig,
            this.effectiveLanguage,
            this.weatherForecasts,
            this.safeHass,
          )
        : Render.renderGroupedEvents(
            days,
            this.effectiveConfig,
            this.effectiveLanguage,
            this.weatherForecasts,
            this.safeHass,
          );
    };

    if (this.isInitialLoad) {
      content = Render.renderCardContent('loading', this.effectiveLanguage);
    } else if (!this.safeHass || !this.config.entities.length) {
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0 && this._hasFetchError) {
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else {
      // No separate empty-events branch: `groupedEvents` groups `this.events`, which is
      // already the empty array in that case, with exactly the arguments a dedicated
      // branch would pass. Column and grid views both default `show_empty_days` on, so
      // an eventless card still fills from here — with empty day columns in column view
      // and a full empty time axis in grid.
      content = renderDays(this.groupedEvents);
    }

    return Render.renderMainCardStructure(
      customStyles,
      this.effectiveTitle,
      content,
      handlers,
      this.isLoading,
      this.isTitlePending,
      this.effectiveView,
    );
  }
}

//-----------------------------------------------------------------------------
// ELEMENT REGISTRATION
//-----------------------------------------------------------------------------

interface CalendarCardConstructor extends CustomElementConstructor {
  getStubConfig?: typeof Config.getStubConfig;
}

const element = customElements.get('calendar-card-pro-dev');
if (element) {
  (element as CalendarCardConstructor).getStubConfig = Config.getStubConfig;
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'calendar-card-pro-dev',
  name: 'Calendar Card Pro',
  preview: true,
  description: 'A calendar card that supports multiple calendars with individual styling.',
  documentationURL: 'https://github.com/alexpfau/calendar-card-pro',
  getEntitySuggestion: Config.getEntitySuggestion,
});
