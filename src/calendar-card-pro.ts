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

// Import Lit libraries
import { LitElement, PropertyValues, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Import all types via namespace for cleaner imports
import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as ViewConfig from './config/view';
import * as Localize from './translations/localize';
import * as EventUtils from './utils/events';
import * as Actions from './interaction/actions';
import * as Helpers from './utils/helpers';
import * as Logger from './utils/logger';
import * as Styles from './rendering/styles';
import * as Feedback from './interaction/feedback';
import * as Render from './rendering/render';
import * as Weather from './utils/weather';
import * as WeatherI18n from './utils/weather-i18n';
import * as Templates from './utils/templates';
import { editorModuleUrl } from './utils/editor-url';
// Type-only, so the editor is not on the card's import graph — and cannot be, because it
// is built separately. It is reached at runtime through a dynamic import() in
// getConfigElement(), which is what keeps it — and its translations — in a second file
// that a browser fetches only when the editor is opened.
import type * as Editor from './rendering/editor/index';

//-----------------------------------------------------------------------------
// GLOBAL TYPE DECLARATIONS
//-----------------------------------------------------------------------------

// Ensure this file is treated as a module
export {};

// Add global type declarations
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
// MAIN COMPONENT CLASS
//-----------------------------------------------------------------------------

/**
 * The main Calendar Card Pro component that extends LitElement
 * This class orchestrates the different modules to create a complete
 * calendar card for Home Assistant
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
   *
   * Only meaningful when `config.title` contains a template. Undefined until
   * the first render arrives, and deliberately left at its last good value when
   * a later render fails, so a transient template error does not blank the
   * heading.
   */
  @property({ attribute: false }) renderedTitle?: string;

  /**
   * Set by Home Assistant's `hui-card` wrapper while the dashboard is in edit
   * mode or the card is shown in the card picker. The card must never hide
   * itself in these states, otherwise it becomes impossible to select and
   * configure. `editMode` is the legacy alias used by older HA versions.
   */
  @property({ type: Boolean }) preview = false;
  @property({ type: Boolean }) editMode = false;

  /**
   * Tells `hui-card` to keep this element in the DOM while it is hidden.
   * Without this Home Assistant detaches the element, which runs
   * `disconnectedCallback()` and tears down the refresh timer — the card would
   * then never re-fetch events and stay hidden forever once it went empty.
   */
  public connectedWhileHidden = true;

  /**
   * Static method that returns a new instance of the editor
   * This is how Home Assistant discovers and loads the editor
   *
   * The editor is loaded on demand. It and its translations are the larger half of the
   * bundle and are of no use to a dashboard that is only rendering the card, so they are
   * built as a second file and reached through a dynamic `import()`. Home Assistant
   * awaits this method (`frontend hui-element-editor.ts`), so returning a promise is
   * supported rather than merely tolerated.
   *
   * The URL is built rather than written as a relative specifier, so the card's own
   * `?hacstag=` cache-buster carries across to the editor — see `editorModuleUrl()`.
   *
   * Registration is guarded **twice**, before and after the await. Two concurrent calls
   * both see no element on the first check, and `customElements.define()` throws
   * `NotSupportedError` on a duplicate name — which would surface as a dead editor
   * dialog rather than as anything legible.
   *
   * @returns The editor element, once its file has loaded
   */
  static async getConfigElement(): Promise<HTMLElement> {
    if (!customElements.get('calendar-card-pro-dev-editor')) {
      let editor: typeof Editor;

      try {
        editor = (await import(editorModuleUrl(import.meta.url))) as typeof Editor;
      } catch (error) {
        // The failure mode the split introduces, and the only new one. A file that did
        // not arrive — an incomplete release, a hand-copied install of the card alone —
        // makes this reject. The card is untouched: nothing at module scope imports the
        // editor, so a dashboard carrying on rendering is the expected outcome rather
        // than a lucky one. Home Assistant awaits this method and shows the rejection in
        // the editor dialog, so the message is written for the person reading it there;
        // the platform's own message names only the file it could not fetch.
        const detail = error instanceof Error ? error.message : String(error);
        Logger.error(error, 'loading the editor file');

        throw new Error(
          'Calendar Card Pro: the editor could not be loaded because one of the card’s ' +
            'files is missing. Reinstalling the card in HACS restores it. The card ' +
            `itself is unaffected. (${detail})`,
        );
      }

      if (!customElements.get('calendar-card-pro-dev-editor')) {
        customElements.define('calendar-card-pro-dev-editor', editor.CalendarCardProEditor);
      }
    }

    return document.createElement('calendar-card-pro-dev-editor');
  }

  static getStubConfig = Config.getStubConfig;

  /**
   * Declares the card's default size to a Home Assistant sections dashboard.
   *
   * Implementing this at all is what removes the "This card does not fully support
   * resizing yet" notice from the layout editor: Home Assistant shows that whenever a
   * card's grid options come back empty, which is what an unimplemented method returns.
   *
   * `columns: 'full'` rather than a number, because a section's internal grid is
   * `12 * column_span` tracks wide, not 12. A card asking for 12 therefore occupies one
   * twelfth of the tracks per unit of span — a `column_span: 3` section leaves it at a
   * third of the width with two thirds empty beside it. `'full'` compiles to
   * `grid-column: 1 / -1` and fills whatever the section turns out to be. In an
   * unspanned section the two are the same width, so this changes nothing for the
   * common case and only takes effect where the old behaviour was visibly wrong.
   *
   * This is deliberately not view-dependent, even though column view is the case that
   * needs the width. Grid options are an *input* to the card's width, and the effective
   * view is computed from the width that results — asking the view here would be
   * circular, and would report `list` on first render because no measurement exists yet.
   * Full width is the right answer for a calendar in either view regardless.
   *
   * `rows: 'auto'` keeps the height driven by content. A numeric value pins a fixed
   * height, which would leave dead space on a quiet calendar and truncate a busy one.
   *
   * No `min_columns` / `max_columns` are declared, so the user keeps the full drag
   * range in the layout editor. These are defaults, not constraints: an explicit
   * `grid_options` block in the card config still wins.
   *
   * @returns Default grid sizing for a sections-view dashboard
   */
  public getGridOptions(): { columns: 'full'; rows: 'auto' } {
    return { columns: 'full', rows: 'auto' };
  }

  // Private, non-reactive properties
  private _instanceId = Helpers.generateInstanceId();
  /**
   * The `_instanceId` the events currently held in `events` were fetched for.
   *
   * Lets a failed refresh tell "these events are a few minutes old" apart from
   * "these events answer a question the card is no longer asking", so previous
   * events are only ever preserved for an unchanged configuration.
   */
  private _eventsInstanceId = '';
  private _language = '';
  private _refreshTimerId?: number;
  private _lastUpdateTime = 0;
  private _initialLoadRetryId?: number;
  private _weatherUnsubscribers: Array<() => void> = [];
  private _weatherSetupVersion = 0;
  private _weatherSetupPending = false;
  /**
   * Subscription that keeps `renderedTitle` in step with a templated `title`.
   *
   * Created lazily so cards with a plain string title never open a websocket
   * subscription at all.
   */
  private _titleSubscription?: Templates.TemplateSubscription;
  /**
   * True when the most recent fetch could not read at least one calendar.
   *
   * Kept separate from `events` because a failed request and an empty calendar
   * both leave the event list empty, yet they mean opposite things. This flag is
   * what lets the card tell them apart, and it drives three behaviours:
   * keeping the card visible under `hide_when_empty` (`_applyVisibility`),
   * keeping already-rendered events instead of blanking them (`updateEvents`),
   * and showing the error state rather than "no upcoming events" (`render`).
   */
  private _hasFetchError = false;
  private _visibleCountCache?: {
    events: Types.CalendarEventData[];
    config: Types.Config;
    language: string;
    count: number;
  };
  private _effectiveConfigCache?: {
    config: Types.Config;
    view: Types.EffectiveView;
    resolved: Types.Config;
  };

  // Interaction state
  private _activePointerId: number | null = null;
  private _holdTriggered = false;
  private _holdTimer: number | null = null;
  private _holdIndicator: HTMLElement | null = null;

  /**
   * Card width in CSS pixels, as most recently measured.
   *
   * `null` until the first `ResizeObserver` callback. That distinction matters:
   * a width of `null` means "not measured yet", which `resolveColumnFit` treats as
   * "render what was asked for, at full width", so a column card does not flash a
   * list layout for one frame on load.
   */
  private _measuredWidthPx: number | null = null;

  /** The view actually rendered, after any width fallback. */
  private _effectiveView: Types.EffectiveView = 'list';

  /**
   * Day columns actually rendered, after any width-driven reduction.
   *
   * Meaningful only in column view; `0` in list view, mirroring `ColumnFit`. Held
   * alongside `_effectiveView` rather than derived at render time because the
   * hysteresis needs the previously *rendered* layout as its input, and a value
   * recomputed during render would feed itself.
   */
  private _columnCount = 0;

  private _resizeObserver: ResizeObserver | null = null;

  /**
   * Pending trailing timer for the last width measurement.
   *
   * Non-null means measurements are still arriving and none has been acted on yet.
   * Cleared on teardown so a settled width can never trigger an update after the card
   * has left the DOM.
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
   *
   * Recomputed on every access, which is what makes a view switch free: crossing the
   * width threshold regroups from already-fetched events with no cache invalidation
   * and, critically, no refetch (spec E-3).
   */
  get groupedEvents(): Types.EventsByDay[] {
    return EventUtils.groupEventsByDay(
      this.events,
      this.effectiveConfig,
      this.isExpanded,
      this.effectiveLanguage,
      this.effectiveView,
    );
  }

  /**
   * The view the user asked for, before any width-based fallback.
   *
   * Distinct from `effectiveView` throughout, per spec G10: this one is what the
   * config says, that one is what renders. Nothing downstream may read
   * `config.view` directly — every resolver takes the effective view explicitly,
   * so a resolver that takes no view argument is a bug catchable by inspection.
   */
  get requestedView(): Types.EffectiveView {
    return this.config.view;
  }

  /**
   * The view that will actually render.
   *
   * In the card editor's preview this deliberately returns the *requested* view.
   * The card preview pane is 390–500px wide, narrower than any realistic column
   * threshold, so a measured fallback there would show every user configuring a
   * column card a list preview — the one place the answer is actively unhelpful.
   */
  get effectiveView(): Types.EffectiveView {
    if (this.preview || this.editMode) {
      return this.requestedView;
    }

    return this._effectiveView;
  }

  /**
   * The configuration as it applies to the view currently on screen.
   *
   * Everything downstream of the render entry points reads this rather than
   * `config`, so a `column:` override reaches the renderers, the leaf helpers and
   * the custom-property map without any of them having to know a view exists. See
   * `resolveEffectiveConfig` for why the merge happens here rather than at each
   * read.
   *
   * Memoized on configuration and view identity because the result is passed to
   * caches that compare configurations by reference — handing them a freshly
   * allocated equal object on every access would turn each of those into a miss.
   * In list view the resolver returns the original object, so the common path
   * allocates nothing at all.
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
   *
   * A templated title renders as empty until Home Assistant returns its first
   * value, so raw Jinja is never shown to the user.
   */
  get effectiveTitle(): string | undefined {
    if (!Templates.isTemplate(this.config.title)) {
      return this.config.title;
    }

    return this.renderedTitle ?? '';
  }

  /**
   * True while a templated title is waiting for its first rendered value.
   *
   * Lets the header keep a stable element identity across the round-trip
   * instead of swapping the placeholder for an `h1` once the value lands.
   */
  get isTitlePending(): boolean {
    return Templates.isTemplate(this.config.title) && this.renderedTitle === undefined;
  }

  /**
   * Number of real events the card would show across its full configured range.
   *
   * Deliberately evaluated as if the card were expanded so that compact mode
   * limits can never make the card look empty — `compact_events_to_show: 0` is
   * a valid configuration meaning "show nothing until tapped", and a card
   * hidden in that state could never be expanded again.
   *
   * Placeholder entries generated for empty days are excluded, so this counts
   * only events that survive filtering (past events, blocklist/allowlist,
   * duplicates) and therefore matches what the user actually sees.
   *
   * That exclusion is the mechanism behind a deliberate precedence rule:
   * hiding wins over anything that merely *decorates* an empty day. Neither
   * `show_empty_days` nor any future custom empty-day text (#279) makes a card
   * count as non-empty — a placeholder is not content. Anything added to the
   * empty-day placeholder must stay filtered out here.
   *
   * Memoized against the inputs it depends on, because `updated()` runs on
   * every `hass` change and grouping the whole event list each time would be
   * needless work.
   */
  get visibleEventCount(): number {
    const language = this.effectiveLanguage;
    const cache = this._visibleCountCache;

    if (
      cache &&
      cache.events === this.events &&
      cache.config === this.config &&
      cache.language === language
    ) {
      return cache.count;
    }

    // Deliberately not passed an `effectiveView`, so this always groups the list way.
    //
    // `groupEventsByDay` resolves two per-view options. `show_empty_days` can only add
    // or remove days whose events are all `_isEmptyDay`, which the reduce below filters
    // out regardless. `split_multiday_events` changes the count — one spanning event
    // becomes several — but never changes whether the count is zero, because splitting
    // an event yields at least one segment and produces none out of nothing.
    //
    // Zero-ness is all that is asked of this: the sole consumer is the `hide_when_empty`
    // test further down. So the answer is view-invariant, and keying the cache on the
    // view would be dead weight.
    //
    // A previous revision of this comment predicted that a second per-view option would
    // force `this.effectiveView` into both the call and the cache key. That option has
    // now arrived and it did not, for the reason above. Re-check the reasoning — not the
    // count — if this value ever gains a consumer that reads more than zero-ness.
    const count = this.events.length
      ? EventUtils.groupEventsByDay(this.events, this.config, true, language).reduce(
          (total, day) => total + day.events.filter((event) => !event._isEmptyDay).length,
          0,
        )
      : 0;

    this._visibleCountCache = { events: this.events, config: this.config, language, count };

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

    // Set up refresh timer
    this.startRefreshTimer();

    // Load events on initial connection
    this.updateEvents();

    // Set up weather subscriptions if configured
    this._scheduleWeatherSetup();

    // Resolve the title if it contains a template
    this._updateTitleSubscription();

    // Set up visibility listener
    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    // Start measuring the card's own width, so a column view can fall back to a
    // list when it is too narrow to be legible
    this._startWidthObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Stop measuring width
    this._stopWidthObserver();

    // Invalidate any in-flight or pending weather subscription setup
    this._weatherSetupVersion++;
    this._weatherSetupPending = false;

    // Clean up weather subscriptions
    this._cleanupWeatherSubscriptions();

    // Clean up the title template subscription
    this._titleSubscription?.destroy();
    this._titleSubscription = undefined;

    // Clean up timers
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

    // Clean up hold indicator if it exists
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }

    // Remove listeners
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    Logger.debug('Component disconnected');
  }

  //-----------------------------------------------------------------------------
  // WIDTH MEASUREMENT
  //-----------------------------------------------------------------------------

  /**
   * Begins observing the card's own width.
   *
   * The card measures itself rather than the viewport, because Home Assistant's
   * masonry and sections layouts both place cards in columns whose width bears no
   * fixed relationship to the window. A media query would give the wrong answer
   * for a card in a two-column section on a wide screen.
   *
   * `ResizeObserver` is available in every browser Home Assistant supports, but
   * the guard keeps the card renderable under a test DOM that lacks it.
   *
   * Measurements are debounced on the trailing edge — see `TIMING.WIDTH_SETTLE_DELAY`
   * for why acting on the first one is wrong.
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
   * Each new measurement replaces the pending one, so only the width the layout
   * settles on is ever passed to `_handleWidthMeasured`.
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
   * Deliberately does **not** refetch. Crossing a threshold changes only how
   * already-fetched events are laid out; the fetch window is derived from
   * `days_to_show`, which is a fetch-time option and cannot be overridden per
   * view. Spec E makes "no fetch on a view transition" an acceptance criterion,
   * and column reduction inherits it — dropping a column renders a subset of a
   * fetch already sized to `days_to_show`, so it costs no API calls either.
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

    // Both halves must be compared. A width change that drops a column without
    // changing the view is still a layout change, and a check on the view alone
    // would silently skip the re-render.
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
    // If hass becomes available after initial connection, load events immediately
    if (changedProps.has('hass') && this.hass && !changedProps.get('hass')) {
      this.updateEvents(true);
    }

    // Update language if locale or config language changed
    if (
      (changedProps.has('hass') && this.hass?.locale) ||
      (changedProps.has('config') && changedProps.get('config')?.language !== this.config.language)
    ) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass?.locale);
    }

    // Set up weather subscriptions when hass becomes available or weather config changes
    const hassJustAvailable = changedProps.has('hass') && this.hass && !changedProps.get('hass');
    const prevConfig = changedProps.get('config') as Types.Config | undefined;
    const weatherConfigChanged =
      changedProps.has('config') &&
      (this.config?.weather?.entity !== prevConfig?.weather?.entity ||
        this.config?.weather?.position !== prevConfig?.weather?.position);

    if (hassJustAvailable || weatherConfigChanged) {
      this._scheduleWeatherSetup();
    }

    // Condition text follows the card's `language`, which the instance's own
    // translations cannot supply when the two differ. Guarded internally — it returns
    // without doing anything when the languages agree, when the vocabulary is already
    // cached, or when a request is already outstanding — so calling it on every update
    // is how it notices a language or entity that arrived late, at the cost of a Map
    // lookup.
    if (this.config?.weather?.entity) {
      WeatherI18n.ensureConditionTranslations(this.hass, this.config.language, () =>
        this.requestUpdate(),
      );
    }

    // Keep the title template subscription in step with hass and config
    if (changedProps.has('hass') || changedProps.has('config')) {
      this._updateTitleSubscription();
    }

    // Hide or reveal the whole card when `hide_when_empty` is enabled
    this._applyVisibility();
  }

  //-----------------------------------------------------------------------------
  // PRIVATE METHODS
  //-----------------------------------------------------------------------------

  /**
   * Keep the title template subscription aligned with the current config.
   *
   * `title` is deliberately absent from `hasConfigChanged`'s data-affecting
   * keys, so changing it never triggers a re-fetch — this is the only thing
   * that has to react to it. The subscription itself no-ops unless the template
   * text or the connection actually changed, so this is safe to call on every
   * `hass` update.
   */
  private _updateTitleSubscription(): void {
    const isTemplated = Templates.isTemplate(this.config.title);

    if (!isTemplated) {
      // Drop a stale rendered value so switching back to a plain title, or
      // clearing the field entirely, does not leave the old heading on screen
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
          // Keep the last good value rather than blanking the heading; the
          // error itself is logged by the template utility and surfaced in the
          // visual editor, which is where a user can act on it.
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
   *
   * Home Assistant's `hui-card` wrapper watches its child for a
   * `card-visibility-changed` event and mirrors `element.hidden` onto itself,
   * which is what lets the surrounding grid or masonry column collapse rather
   * than leaving an empty slot. The inline `display` is set as well so the card
   * still disappears on older HA versions that predate that wrapper, and
   * because the card's own `:host { display: block }` rule would otherwise
   * override the browser default styling for the `hidden` attribute.
   */
  private _applyVisibility(): void {
    // Missing hass or entities renders the error card — never hide that, or the
    // user is left with no indication of why the card vanished. During the
    // initial load neither is treated as an error yet (see `render()`).
    const isErrorState =
      !this.isInitialLoad && (!this.safeHass || this.config.entities.length === 0);

    // A calendar that could not be read looks identical to an empty one: both
    // leave `events` empty. Hiding on that would make a transient API error
    // silently delete the card from the dashboard, so a failed fetch keeps the
    // card on screen and only a genuine empty result hides it.
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
   * Generate style properties from configuration
   * Returns a style object for use with styleMap
   */
  private getCustomStyles(): Record<string, string> {
    // Convert CSS custom properties to a style object
    return Styles.generateCustomPropertiesObject(this.effectiveConfig);
  }

  /**
   * Handle visibility changes to refresh data when returning to the page
   */
  private _handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      // Only refresh if it's been a while
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
   * Schedule weather subscription setup, debounced to collapse multiple calls
   * within the same microtask into a single setup.
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
    // Increment version to invalidate any in-flight setup from a previous call
    const version = ++this._weatherSetupVersion;

    // Clean up existing subscriptions
    this._cleanupWeatherSubscriptions();

    // Skip if no weather configuration or no entity
    if (!this.config?.weather?.entity || !this.hass) {
      return;
    }

    // Determine which forecast types to subscribe to
    const forecastTypes = Weather.getRequiredForecastTypes(this.config.weather);

    // Subscribe to each required forecast type
    for (const type of forecastTypes) {
      // If a newer setup call was initiated, abandon this one
      if (this._weatherSetupVersion !== version) {
        return;
      }

      const unsubscribe = await Weather.subscribeToWeatherForecast(
        this.hass!,
        this.config,
        type,
        (forecasts) => {
          // Update the appropriate forecast type
          this.weatherForecasts = {
            ...this.weatherForecasts,
            [type]: forecasts,
          };
          this.requestUpdate();
        },
      );

      // Check again after await — a newer call may have superseded this one
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
    // Store this pointer ID to track if it's the same pointer throughout
    this._activePointerId = ev.pointerId;
    this._holdTriggered = false;

    // Only set up hold timer if hold action is configured
    if (this.config.hold_action?.action !== 'none') {
      // Clear any existing timer
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
      }

      // Start a new hold timer
      this._holdTimer = window.setTimeout(() => {
        if (this._activePointerId === ev.pointerId) {
          this._holdTriggered = true;

          // Create hold indicator for visual feedback
          this._holdIndicator = Feedback.createHoldIndicator(ev, this.config);
        }
      }, Constants.TIMING.HOLD_THRESHOLD);
    }
  }

  /**
   * Handle pointer up events to execute actions
   */
  private _handlePointerUp(ev: PointerEvent) {
    // Only process if this is the pointer we've been tracking
    if (ev.pointerId !== this._activePointerId) return;

    // Clear hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Execute the appropriate action based on whether hold was triggered
    if (this._holdTriggered && this.config.hold_action) {
      Logger.debug('Executing hold action');
      Actions.handleAction(this, this.config, 'hold', () => this.toggleExpanded());
    } else if (!this._holdTriggered && this.config.tap_action) {
      Logger.debug('Executing tap action');
      Actions.handleAction(this, this.config, 'tap', () => this.toggleExpanded());
    }

    // Reset state
    this._activePointerId = null;
    this._holdTriggered = false;

    // Remove hold indicator if it exists
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
  }

  /**
   * Handle pointer cancel/leave events to clean up
   */
  private _handlePointerCancel() {
    // Clear hold timer
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Reset state
    this._activePointerId = null;
    this._holdTriggered = false;

    // Remove hold indicator if it exists
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

    // Inspect the raw config before the merge — afterwards every key is present and a
    // removed one can no longer be told apart from one the user never wrote.
    for (const message of Config.findDeprecatedKeys(config)) {
      Logger.deprecation(message);
    }

    const mergedConfig = { ...Config.DEFAULT_CONFIG, ...config };

    this.config = mergedConfig;
    this.config.entities = Config.normalizeEntities(this.config.entities);
    Config.normalizeNumericOptions(this.config);
    ViewConfig.validateView(this.config);
    ViewConfig.validateColumnOverrides(this.config);

    // Seed the effective view from the request. Until the first measurement lands
    // there is nothing to fall back on, so the requested view is the best guess.
    //
    // The correction is NOT immediate: measurements are debounced by
    // TIMING.WIDTH_SETTLE_DELAY, so a column card that is really too narrow stays
    // seeded as 'column' for that window before switching to list. In practice the
    // window is covered by the initial fetch — the card has no events to lay out
    // yet — and a live probe at 464px observed no intermediate column render. On a
    // warm cache that masking is not guaranteed, which is the accepted cost of
    // debouncing; see _scheduleWidthMeasurement for why the debounce is required.
    const seededFit = ViewConfig.resolveColumnFit(
      this.config.view,
      this.config,
      this._measuredWidthPx,
      null,
    );

    this._effectiveView = seededFit.view;
    this._columnCount = seededFit.columns;

    // Generate deterministic ID for caching
    this._instanceId = Helpers.generateDeterministicId(
      this.config.entities,
      this.config.days_to_show,
      this.config.show_past_events,
      this.config.start_date,
    );

    // Check if we need to reload data
    const configChanged = Config.hasConfigChanged(previousConfig, this.config);
    if (configChanged) {
      Logger.debug('Configuration changed, refreshing data');
      this.updateEvents(true);
    }

    // Restart the timer with new config
    this.startRefreshTimer();
  }

  /**
   * Update calendar events from API or cache
   * Simplified for card-mod compatibility
   */
  async updateEvents(force = false): Promise<void> {
    Logger.debug(`Updating events (force=${force})`);

    // Skip update if no Home Assistant connection or no entities
    if (!this.safeHass || !this.config.entities.length) {
      this.isLoading = false;
      if (!this.safeHass) {
        // Retry shortly to handle hass initialization timing
        if (this._initialLoadRetryId) {
          clearTimeout(this._initialLoadRetryId);
        }
        this._initialLoadRetryId = window.setTimeout(() => {
          this.updateEvents(true);
        }, 1500);
      } else {
        // Home Assistant is available but no entities are configured, so no data
        // will ever arrive. Leave the initial load state so `render()` falls
        // through to the error card instead of showing "loading" indefinitely.
        this.isInitialLoad = false;
      }
      return;
    }

    try {
      // Signal loading — initial load shows loading screen; background refresh shows spinner
      this.isLoading = true;
      await this.updateComplete;

      // Get event data (from cache or API) using modularized function
      const { events: eventData, failedEntities } = await EventUtils.fetchEventData(
        this.safeHass,
        this.config,
        this._instanceId,
        force,
      );

      this._hasFetchError = failedEntities.length > 0;
      if (this._hasFetchError) {
        Logger.warn(`Could not load calendar(s): ${failedEntities.join(', ')}`);
      }

      this.isLoading = false;
      this.isInitialLoad = false;
      await this.updateComplete;

      // Keep whatever is already on screen when a refresh could not read any
      // calendar and came back empty. Replacing good data with a blank card is a
      // worse outcome than showing events that are a few minutes stale, and the
      // next successful refresh overwrites them anyway. An empty result is only
      // taken at face value when every calendar actually answered.
      //
      // Preserving is only valid while the events still answer the current
      // question: `_instanceId` covers the entities, date range and past-event
      // settings, so a config change makes the previous events stop counting as
      // stale and start counting as wrong. Without that check, pointing a card at
      // a broken entity would leave the old entity's events on screen forever.
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

      // Only a clean fetch counts as a completed update. Leaving the timestamp
      // alone after a failure lets the visibility handler retry straight away
      // instead of waiting out the refresh threshold.
      if (!this._hasFetchError) {
        this._lastUpdateTime = Date.now();
        Logger.info('Event update completed successfully');
      }
    } catch (error) {
      Logger.error('Failed to update events:', error);
      this._hasFetchError = true;
      this.isLoading = false;
      this.isInitialLoad = false;
    }
  }

  /**
   * Determine whether compact mode is actually limiting what the card renders.
   *
   * Mirrors the guards in `groupEventsByDay`: a limit counts as set when it is a
   * finite number, not merely truthy. `compact_events_to_show: 0` is a valid
   * configuration meaning "show nothing until expanded", and per-entity limits
   * constrain the compact view even when no global limit is set.
   */
  private hasCompactModeLimits(): boolean {
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
    // Determine action type based on which config matches
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

    // Create event handlers object for the card
    const handlers = {
      keyDown: (ev: KeyboardEvent) => this._handleKeyDown(ev),
      pointerDown: (ev: PointerEvent) => this._handlePointerDown(ev),
      pointerUp: (ev: PointerEvent) => this._handlePointerUp(ev),
      pointerCancel: () => this._handlePointerCancel(),
      pointerLeave: () => this._handlePointerCancel(),
    };

    // Determine card content based on state
    let content: TemplateResult;

    // Both event-bearing branches below dispatch through this, so the two renderers
    // can never drift apart by one call site being updated and the other missed.
    const renderDays = (days: Types.EventsByDay[]): TemplateResult =>
      this.effectiveView === 'column'
        ? Render.renderColumnGroupedEvents(
            // Width-driven reduction is applied here rather than inside the renderer,
            // so separators and week numbers are derived from the columns actually
            // drawn. Trailing days are dropped, never leading ones — the first column
            // is the anchor the user reads from.
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
      // Initial load — no data yet, show minimal loading screen
      content = Render.renderCardContent('loading', this.effectiveLanguage);
    } else if (!this.safeHass || !this.config.entities.length) {
      // Error state - missing entities
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0 && this._hasFetchError) {
      // Calendars could not be read and there is nothing to fall back on.
      // "No upcoming events" would be a claim about the calendar's contents,
      // which is precisely what the card failed to find out — so say that the
      // calendar could not be read instead.
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0) {
      // Even with no events, use the regular groupEventsByDay function
      // which now handles empty API results correctly
      const groupedEmptyDays = EventUtils.groupEventsByDay(
        [], // Empty events array
        this.effectiveConfig,
        this.isExpanded,
        this.effectiveLanguage,
        this.effectiveView,
      );
      content = renderDays(groupedEmptyDays);
    } else {
      content = renderDays(this.groupedEvents);
    }

    // Render main card structure with content
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

// The card element is registered by its decorator. The editor is not registered here
// at all: it is defined by getConfigElement() once its file has loaded, which is what
// keeps it off the eager path.

// Create interface extending CustomElementConstructor to allow getStubConfig property
interface CalendarCardConstructor extends CustomElementConstructor {
  getStubConfig?: typeof Config.getStubConfig;
}

// Expose getStubConfig for Home Assistant card picker preview
const element = customElements.get('calendar-card-pro-dev');
if (element) {
  (element as CalendarCardConstructor).getStubConfig = Config.getStubConfig;
}

// Register with HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'calendar-card-pro-dev',
  name: 'Calendar Card Pro',
  preview: true,
  description: 'A calendar card that supports multiple calendars with individual styling.',
  documentationURL: 'https://github.com/alexpfau/calendar-card-pro',
  // Offer this card in the picker's community suggestions for calendar entities.
  // Ignored by Home Assistant versions older than 2026.6.
  getEntitySuggestion: Config.getEntitySuggestion,
});
