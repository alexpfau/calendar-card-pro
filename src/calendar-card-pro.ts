/* eslint-disable import/order */
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
 * Documentation: https://github.com/alexpfau/calendar-card-pro/blob/main/README.md
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

// Import all types via namespace for cleaner imports
import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as Localize from './translations/localize';
import * as FormatUtils from './utils/format';
import * as EventUtils from './utils/events';
import * as Core from './interaction/core';
import * as Actions from './interaction/actions';
import * as Helpers from './utils/helpers';
import * as StateUtils from './utils/state';
import * as Render from './rendering/render';
import * as DomUtils from './utils/dom';
import * as Logger from './utils/logger';
import * as Editor from './rendering/editor';
import './interaction/ripple';

//-----------------------------------------------------------------------------
// GLOBAL TYPE DECLARATIONS
//-----------------------------------------------------------------------------

// Ensure this file is treated as a module
export {};

// Add window interface extension for customCards
declare global {
  interface Window {
    customCards: Array<Types.CustomCard>;
  }

  // Add custom element interface
  interface HTMLElementTagNameMap {
    'calendar-card-pro-dev': CalendarCardPro;
    'calendar-card-pro-dev-editor': Editor.CalendarCardProEditor;
  }

  // Add improved DOM interfaces
  interface HTMLElementEventMap {
    'hass-more-info': Types.HassMoreInfoEvent;
    'location-changed': Event;
  }

  // Add custom property for ripple handler
  interface HTMLElement {
    _rippleHandler?: (ev: PointerEvent) => void;
  }
}

//-----------------------------------------------------------------------------
// MAIN COMPONENT CLASS
//-----------------------------------------------------------------------------

/**
 * The main Calendar Card Pro component that extends HTMLElement
 * This class orchestrates the different modules to create a complete
 * calendar card for Home Assistant
 */
class CalendarCardPro extends HTMLElement implements Types.CalendarComponent {
  //-----------------------------------------------------------------------------
  // PROPERTIES AND STATE
  //-----------------------------------------------------------------------------

  // Change from private to public to match interface
  public config!: Types.Config;
  public events: Types.CalendarEventData[] = [];
  public _hass: Types.Hass | null = null;
  public isLoading = true;
  public isExpanded = false;
  public performanceMetrics: Types.PerformanceData = {
    renderTime: [],
    eventCount: 0,
    lastUpdate: Date.now(),
  };

  private instanceId: string;

  // These properties will be initialized in the constructor
  public debouncedUpdate: () => void;
  public memoizedFormatTime: (date: Date) => string & Types.MemoCache<string>;
  public memoizedFormatLocation: (location: string) => string & Types.MemoCache<string>;
  public cleanupInterval: number;
  public renderTimeout?: number;
  public performanceTracker: {
    beginMeasurement: (eventCount: number) => Types.PerfMetrics;
    endMeasurement: (metrics: Types.PerfMetrics, performanceData: Types.PerformanceData) => number;
    getAverageRenderTime: (performanceData: Types.PerformanceData) => number;
  };
  public visibilityCleanup?: () => void;
  public refreshTimer?: {
    start: () => void;
    stop: () => void;
    restart: () => void;
  };
  public interactionManager: {
    state: Types.InteractionState;
    container: HTMLElement | null;
    cleanup: (() => void) | null;
  };

  //-----------------------------------------------------------------------------
  // STATIC PROPERTIES AND METHODS
  //-----------------------------------------------------------------------------

  static get DEFAULT_CONFIG(): Types.Config {
    return Config.DEFAULT_CONFIG;
  }

  static get TRANSLATIONS(): Readonly<Record<string, Types.Translations>> {
    return Localize.TRANSLATIONS;
  }

  static findCalendarEntity(hass: Types.Hass): string | null {
    return Config.findCalendarEntity(hass.states);
  }

  static getStubConfig(hass: Types.Hass) {
    return Config.getStubConfig(hass.states);
  }

  static get displayName() {
    return 'Calendar Card Pro';
  }

  //-----------------------------------------------------------------------------
  // COMPONENT LIFECYCLE
  //-----------------------------------------------------------------------------

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // Generate a temporary instance ID - this will be replaced with a deterministic one in setConfig
    this.instanceId = Helpers.generateInstanceId();
    // Initialize basic component state
    const initialState = StateUtils.initializeState();
    this.config = initialState.config;
    this.events = initialState.events;
    this._hass = initialState.hass;
    this.isLoading = initialState.isLoading;
    this.isExpanded = initialState.isExpanded;

    // Set up lifecycle and controllers
    const lifecycle = StateUtils.setupComponentLifecycle(this);

    // Store lifecycle components
    this.performanceTracker = lifecycle.performanceTracker;
    this.visibilityCleanup = lifecycle.visibilityCleanup;
    this.refreshTimer = lifecycle.refreshTimer;
    this.cleanupInterval = lifecycle.cleanupInterval;
    this.debouncedUpdate = lifecycle.debouncedUpdate;
    this.memoizedFormatTime = lifecycle.memoizedFormatTime;
    this.memoizedFormatLocation = lifecycle.memoizedFormatLocation;
    this.interactionManager = lifecycle.interactionManager;
  }

  connectedCallback() {
    StateUtils.handleConnectedCallback(this);
  }

  disconnectedCallback() {
    StateUtils.cleanupComponent(this);
  }

  //-----------------------------------------------------------------------------
  // HOME ASSISTANT INTEGRATION
  //-----------------------------------------------------------------------------

  set hass(hass: Types.Hass) {
    const previousHass = this._hass;
    this._hass = hass;

    const entitiesChanged = this.config.entities.some(
      (entity) =>
        !previousHass ||
        previousHass.states[typeof entity === 'string' ? entity : entity.entity]?.state !==
          hass.states[typeof entity === 'string' ? entity : entity.entity]?.state,
    );

    if (entitiesChanged) {
      this.updateEvents();
    }
  }

  setConfig(config: Partial<Types.Config>) {
    const previousConfig = this.config;
    this.config = { ...CalendarCardPro.DEFAULT_CONFIG, ...config };
    this.config.entities = Config.normalizeEntities(this.config.entities);

    // Generate deterministic instance ID based on data-affecting config
    this.instanceId = Helpers.generateDeterministicId(
      this.config.entities,
      this.config.days_to_show,
      this.config.show_past_events,
    );

    // Check if data-affect configuration has changed
    const configChanged = Config.hasConfigChanged(previousConfig, this.config);

    // Check if only entity colors changed (requires re-render but not data refresh)
    const colorChanged = Config.haveEntityColorsChanged(previousConfig, this.config);

    if (configChanged) {
      Logger.debug('Configuration changed, refreshing data');
      this.updateEvents(true); // Force refresh
    } else if (colorChanged) {
      // If only entity colors changed, just re-render without data refresh
      Logger.debug('Entity colors changed, re-rendering without data refresh');
      this.renderCard();
    } else {
      // Re-render with new styling for other changes
      this.renderCard();
    }

    // Restart the refresh timer with the new configuration
    if (this.refreshTimer) {
      this.refreshTimer.restart();
    }
  }

  //-----------------------------------------------------------------------------
  // DATA HANDLING
  //-----------------------------------------------------------------------------

  invalidateCache() {
    const baseKey = EventUtils.getBaseCacheKey(
      this.instanceId,
      this.config.entities,
      this.config.days_to_show,
      this.config.show_past_events,
    );
    EventUtils.invalidateCache([baseKey]);
  }

  async updateEvents(force = false): Promise<void> {
    await EventUtils.orchestrateEventUpdate({
      hass: this._hass,
      config: this.config,
      instanceId: this.instanceId,
      force,
      currentEvents: this.events,
      callbacks: {
        setLoading: (loading) => {
          this.isLoading = loading;
        },
        setEvents: (events) => {
          this.events = events;
        },
        updateLastUpdate: () => {
          this.performanceMetrics.lastUpdate = Date.now();
        },
        renderCallback: () => {
          this.renderCard();
        },
        restartTimer: () => {
          if (this.refreshTimer && this.refreshTimer.restart) {
            Logger.debug('Restarting refresh timer after data fetch');
            this.refreshTimer.restart();
          }
        },
      },
    });
  }

  //-----------------------------------------------------------------------------
  // RENDERING
  //-----------------------------------------------------------------------------

  async renderCard() {
    // Use the performance tracker
    const metrics = this.performanceTracker.beginMeasurement(this.events.length);

    if (!EventUtils.isValidState(this._hass, this.config.entities)) {
      Render.renderErrorToDOM(this.shadowRoot!, 'error', this.config);
      this.performanceTracker.endMeasurement(metrics, this.performanceMetrics);
      return;
    }

    if (this.isLoading) {
      Render.renderErrorToDOM(this.shadowRoot!, 'loading', this.config);
      this.performanceTracker.endMeasurement(metrics, this.performanceMetrics);
      return;
    }

    // Get the effective language based on priority order
    const effectiveLanguage = Localize.getEffectiveLanguage(
      this.config.language,
      this._hass?.locale,
    );

    const eventsByDay = EventUtils.groupEventsByDay(
      this.events,
      this.config,
      this.isExpanded,
      effectiveLanguage,
    );

    if (eventsByDay.length === 0) {
      Render.renderErrorToDOM(this.shadowRoot!, 'empty', this.config);
      this.performanceTracker.endMeasurement(metrics, this.performanceMetrics);
      return;
    }

    try {
      Logger.debug('Creating card structure');

      // Get the calendar content using the render module
      const { container: contentContainer, style } = await Render.renderCalendarCard(
        this.config,
        eventsByDay,
        (event) => FormatUtils.formatEventTime(event, this.config, effectiveLanguage),
        (location) => FormatUtils.formatLocation(location, this.config.remove_location_country),
        Constants.PERFORMANCE.CHUNK_SIZE,
        Constants.PERFORMANCE.RENDER_DELAY,
      );

      // Clean up any previous interaction handlers
      if (this.interactionManager.cleanup) {
        this.interactionManager.cleanup();
        this.interactionManager.cleanup = null;
      }

      // Use DOM utilities to create card structure
      const { container, ripple } = DomUtils.createCardStructure(contentContainer);

      // Update shadow DOM with the new structure
      DomUtils.updateCardInShadowDOM(this.shadowRoot!, container, style);

      // Store container reference for later
      this.interactionManager.container = container;

      // Get primary entity ID for interactions
      const entityId = Core.getPrimaryEntityId(this.config.entities);

      // Set up interactions
      this.interactionManager.cleanup = Core.setupInteractions(
        this.config,
        container,
        this._hass,
        entityId,
        () => this.toggleExpanded(),
        ripple,
      );
    } catch (error) {
      Logger.error('Render error:', error);
      Render.renderErrorToDOM(this.shadowRoot!, 'error', this.config);
    }

    this.performanceTracker.endMeasurement(metrics, this.performanceMetrics);
  }

  //-----------------------------------------------------------------------------
  // USER INTERACTIONS
  //-----------------------------------------------------------------------------

  handleAction(actionConfig: Types.ActionConfig) {
    // Get the primary entity ID
    const entityId = Core.getPrimaryEntityId(this.config.entities);

    // Call the action handler from the interaction module
    Actions.handleAction(
      actionConfig,
      this._hass,
      this,
      entityId,
      // Pass a callback to handle expand action
      () => this.toggleExpanded(),
    );
  }

  toggleExpanded() {
    if (this.config.max_events_to_show) {
      this.isExpanded = !this.isExpanded;

      // Add delay to allow ripple animation to complete before re-rendering
      setTimeout(() => this.renderCard(), Constants.TIMING.RIPPLE_ANIMATION);
    }
  }

  //-----------------------------------------------------------------------------
  // STATE MANAGEMENT
  //-----------------------------------------------------------------------------

  initializeState() {
    const initialState = StateUtils.initializeState();
    this.config = initialState.config;
    this.events = initialState.events;
    this._hass = initialState.hass;
    this.isLoading = initialState.isLoading;
    this.isExpanded = initialState.isExpanded;
  }

  cleanup() {
    StateUtils.cleanup(
      this.renderTimeout,
      this.memoizedFormatTime as unknown as Types.MemoCache<string>,
      this.memoizedFormatLocation as unknown as Types.MemoCache<string>,
      this.interactionManager.state,
    );
  }

  get translations() {
    // Use the effective language based on priority order
    const effectiveLanguage = Localize.getEffectiveLanguage(
      this.config.language,
      this._hass?.locale,
    );
    return Localize.getTranslations(effectiveLanguage);
  }

  //-----------------------------------------------------------------------------
  // UTILITY METHODS
  //-----------------------------------------------------------------------------

  debounce<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number,
  ): (...args: Parameters<T>) => void {
    return Helpers.debounce(func, wait);
  }

  memoize<T extends readonly unknown[], R>(
    func: (...args: T) => R,
  ): ((...args: T) => R) & Types.MemoCache<R> {
    return Helpers.memoize(func, this);
  }

  //-----------------------------------------------------------------------------
  // PERFORMANCE MONITORING
  //-----------------------------------------------------------------------------

  getAverageRenderTime() {
    return this.performanceTracker.getAverageRenderTime(this.performanceMetrics);
  }
}

//-----------------------------------------------------------------------------
// ELEMENT REGISTRATION
//-----------------------------------------------------------------------------

// Register the custom element
customElements.define('calendar-card-pro-dev', CalendarCardPro);
customElements.define('calendar-card-pro-dev-editor', Editor.CalendarCardProEditor);

// Card registration for HACS and Home Assistant
(window as unknown as { customCards: Array<Types.CustomCard> }).customCards =
  (window as unknown as { customCards: Array<Types.CustomCard> }).customCards || [];

(window as unknown as { customCards: Array<Types.CustomCard> }).customCards.push({
  type: 'calendar-card-pro-dev',
  name: 'Calendar Card Pro',
  preview: true,
  description: 'A calendar card that supports multiple calendars with individual styling.',
  documentationURL: 'https://github.com/alexpfau/calendar-card-pro',
});
