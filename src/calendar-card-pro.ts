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
   * `updateEvents()` awaits the API, and `setConfig()` can regenerate `_instanceId` and
   * start a second request during that await. The two requests go to different
   * calendars, so their latencies are unrelated and the older one can settle last.
   * Comparing the ticket a request started with against the current value is what tells
   * a superseded response to discard itself instead of committing.
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
  private _holdTriggered = false;
  private _holdTimer: number | null = null;
  private _holdIndicator: HTMLElement | null = null;

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

    this._startWidthObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this._stopWidthObserver();

    this._weatherSetupVersion++;
    this._weatherSetupPending = false;

    this._cleanupWeatherSubscriptions();

    this._titleSubscription?.destroy();
    this._titleSubscription = undefined;

    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
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

    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

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

  private _stopWidthObserver(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._widthSettleTimerId !== null) {
      clearTimeout(this._widthSettleTimerId);
      this._widthSettleTimerId = null;
    }
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
    const weatherConfigChanged =
      changedProps.has('config') &&
      (this.config?.weather?.entity !== prevConfig?.weather?.entity ||
        this.config?.weather?.position !== prevConfig?.weather?.position);

    if (hassJustAvailable || weatherConfigChanged) {
      this._scheduleWeatherSetup();
    }

    if (this.config?.weather?.entity) {
      WeatherI18n.ensureConditionTranslations(this.hass, this.config.language, () =>
        this.requestUpdate(),
      );
    }

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
   */
  private _updateTitleSubscription(): void {
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
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - this._lastUpdateTime > Constants.TIMING.VISIBILITY_REFRESH_THRESHOLD) {
        Logger.debug('Visibility changed to visible, updating events');
        this.updateEvents();
      }
    }
  };

  /**
   * Start the refresh timer
   */
  private startRefreshTimer() {
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
   * Handle pointer down events for hold detection
   */
  private _handlePointerDown(ev: PointerEvent) {
    this._activePointerId = ev.pointerId;
    this._holdTriggered = false;

    if (this.config.hold_action?.action !== 'none') {
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
      }

      this._holdTimer = window.setTimeout(() => {
        if (this._activePointerId === ev.pointerId) {
          this._holdTriggered = true;

          this._holdIndicator = Feedback.createHoldIndicator(ev, this.config);
        }
      }, Constants.TIMING.HOLD_THRESHOLD);
    }
  }

  /**
   * Handle pointer up events to execute actions
   */
  private _handlePointerUp(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) return;

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    if (this._holdTriggered && this.config.hold_action) {
      Logger.debug('Executing hold action');
      Actions.handleAction(this, this.config, 'hold', () => this.toggleExpanded());
    } else if (!this._holdTriggered && this.config.tap_action) {
      Logger.debug('Executing tap action');
      Actions.handleAction(this, this.config, 'tap', () => this.toggleExpanded());
    }

    this._activePointerId = null;
    this._holdTriggered = false;

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle pointer cancel/leave events to clean up
   */
  private _handlePointerCancel() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    this._activePointerId = null;
    this._holdTriggered = false;

    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle keyboard navigation for accessibility
   */
  private _handleKeyDown(ev: KeyboardEvent) {
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

    const mergedConfig = { ...Config.DEFAULT_CONFIG, ...config };

    this.config = mergedConfig;
    this.config.entities = Config.normalizeEntities(this.config.entities);
    Config.normalizeNumericOptions(this.config);
    Config.normalizeLengthOptions(this.config);
    ViewConfig.validateView(this.config);
    ViewConfig.validateColumnOverrides(this.config);

    const seededFit = ViewConfig.resolveColumnFit(
      this.config.view,
      this.config,
      this._measuredWidthPx,
      null,
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

    // Take a ticket before anything can await. Any call that starts after this one
    // supersedes it, and a superseded response must not touch card state — committing
    // it would both show the previous calendar's events and stamp them with the current
    // `_instanceId`, which makes `eventsMatchCurrentQuery` report true for a payload the
    // current query never asked for.
    const generation = ++this._eventRequestGeneration;
    const isSuperseded = (): boolean => generation !== this._eventRequestGeneration;

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
      pointerUp: (ev: PointerEvent) => this._handlePointerUp(ev),
      pointerCancel: () => this._handlePointerCancel(),
      pointerLeave: () => this._handlePointerCancel(),
    };

    let content: TemplateResult;

    const renderDays = (days: Types.EventsByDay[]): TemplateResult =>
      this.effectiveView === 'column'
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

    if (this.isInitialLoad) {
      content = Render.renderCardContent('loading', this.effectiveLanguage);
    } else if (!this.safeHass || !this.config.entities.length) {
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0 && this._hasFetchError) {
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0) {
      const groupedEmptyDays = EventUtils.groupEventsByDay(
        [], // Empty events array
        this.effectiveConfig,
        this.isExpanded,
        this.effectiveLanguage,
        this.effectiveView,
        this.hass?.locale,
      );
      content = renderDays(groupedEmptyDays);
    } else {
      content = renderDays(this.groupedEvents);
    }

    return Render.renderMainCardStructure(
      customStyles,
      this.effectiveTitle,
      content,
      handlers,
      false,
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
