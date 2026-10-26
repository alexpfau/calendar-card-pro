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

import { LitElement, PropertyValues, TemplateResult, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as ViewConfig from './config/view';
import * as Actions from './interaction/actions';
import * as AddEvent from './interaction/add-event';
import * as CalendarChanges from './interaction/calendar-changes';
import * as EventDetails from './interaction/event-details';
import * as Feedback from './interaction/feedback';
import * as Dialogs from './interaction/ha-calendar-dialogs';
import * as Activation from './rendering/activation';
import type * as Editor from './rendering/editor/index';
import * as Legend from './rendering/legend';
import * as Render from './rendering/render';
import * as Styles from './rendering/styles';
import * as Toolbar from './rendering/toolbar';
import * as Localize from './translations/localize';
import { editorModuleUrl } from './utils/editor-url';
import * as EntityColors from './utils/entity-colors';
import * as EventUtils from './utils/events';
import * as FormatUtils from './utils/format';
import * as GridUtils from './utils/grid';
import * as CascadeThreshold from './utils/grid-cascade-threshold';
import * as OverflowStrip from './utils/grid-overflow-strip';
import * as GridTimeFit from './utils/grid-time-fit';
import * as GridTitleFit from './utils/grid-title-fit';
import * as Helpers from './utils/helpers';
import * as Logger from './utils/logger';
import * as Paging from './utils/paging';
import * as Templates from './utils/templates';
import {
  TitleMotionController,
  type TitleScrollMeasurement,
  supportsTitleMotion,
} from './utils/title-motion-controller';
import * as ViewChoice from './utils/view-choice';
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

/** Observe inherited typography, language, and direction changes across shadow boundaries. */
function observeTypographyAncestors(observer: MutationObserver, host: HTMLElement): void {
  for (let ancestor: Element | null = host; ancestor;) {
    observer.observe(ancestor, {
      attributes: true,
      attributeOldValue: true,
      // Compact boxes may not resize when a language change alters normal hyphenation.
      attributeFilter: ['style', 'class', 'dir', 'lang'],
    });
    const root = ancestor.getRootNode();
    ancestor = ancestor.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
}

/** The host's offscreen animation state does not change its typography. */
function isScrollPauseOnlyMutation(record: MutationRecord, host: HTMLElement): boolean {
  if (record.target !== host || record.attributeName !== 'class') return false;
  const typographyClasses = (value: string) =>
    value
      .split(/\s+/)
      .filter((name) => name && name !== 'calendar-card-title-scroll-paused')
      .sort()
      .join(' ');
  return typographyClasses(record.oldValue ?? '') === typographyClasses(host.className);
}

/**
 * Whether a mutation outside every timed block added or removed an element.
 *
 * Blocks, banners and whole day columns arrive and leave this way whenever a render changes
 * what the grid draws, and nothing else announces it. A once-a-minute repaint can end an event
 * under `show_past_events: false`, expire a banner, repack lanes or drop a sparse day, and the
 * resize observer keyed to existing blocks cannot see a block that did not exist when it was
 * attached. Text and comment nodes are ignored, and so is the cascade-threshold probe, which
 * the reaction to this very signal inserts.
 *
 * @param record - A record from the grid disclosure observer, already known to lie outside
 *   every timed block
 * @returns Whether the grid's element structure changed
 */
function changesGridStructure(record: MutationRecord): boolean {
  if (record.type !== 'childList') return false;
  return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
    (node) =>
      node instanceof Element && !node.classList.contains(CascadeThreshold.SCALE_PROBE_CLASS),
  );
}

/**
 * How far content may exceed its box before the grid calls it clipped.
 *
 * Sub-pixel layout puts `scrollHeight` a pixel over `clientHeight` on content that visibly
 * fits, so both the overflow test and the line-fitting arithmetic forgive that pixel. They
 * share the constant because they have to agree: a row is asked to give back only the
 * overflow this does not already absolve, and charging it the raw difference costs it a
 * whole extra line every time the overflow lands just past a line box.
 */
const GRID_FIT_TOLERANCE_PX = 1;

/**
 * Whether rendered event content exceeds its available height by more than rounding noise.
 *
 * @param content - The event content whose rendered dimensions to compare
 * @returns Whether a disclosed detail row is clipped
 */
export function gridContentOverflows(
  content: Pick<HTMLElement, 'clientHeight' | 'scrollHeight'>,
): boolean {
  return content.scrollHeight > content.clientHeight + GRID_FIT_TOLERANCE_PX;
}

/**
 * Resolves a computed `line-height` to pixels, including the `normal` keyword.
 *
 * `getComputedStyle` returns a used pixel value for both a length and a unitless ratio, but
 * `normal` stays a keyword — and a keyword parses to `NaN`, which would make every line count
 * derived from it garbage. 1.2 is the ratio browsers use for `normal` at ordinary font stacks;
 * an approximation is acceptable here because a wrong count only costs one line of fitting,
 * and the caller re-measures and withdraws the row if the clamp did not resolve the overflow.
 *
 * @param style - The row text's computed `line-height` and `font-size`
 * @returns The line box height in pixels, or 0 when neither value is usable
 */
export function resolveLineHeightPx(
  style: Pick<CSSStyleDeclaration, 'lineHeight' | 'fontSize'>,
): number {
  if (style.lineHeight.endsWith('px')) {
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      return lineHeight;
    }
  }

  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : 0;
}

/**
 * How many of a grid detail row's lines still fit once the block's overflow is paid for.
 *
 * Returned counts below 1 mean the row cannot show even its first line, so the caller
 * withdraws it rather than clamping it. The count can never exceed what the row already
 * draws, because `renderedHeightPx` is measured after the user's own `*_max_lines` clamp has
 * applied — so this pass can only ever reduce what is shown, never restore a line the
 * configuration had already taken away.
 *
 * The row is charged for the overflow `gridContentOverflows` does not already forgive, not
 * for the raw difference. The two must agree about what fits, and a pixel is not free here:
 * `Math.ceil` rounds it up to a whole line box, so an address overflowing by one line plus
 * one pixel used to be told two lines had to go. At two rendered lines that came out at
 * zero, the clamp was refused as impossible, and the caller withdrew the address entirely —
 * leaving a line of empty space in the block where one ellipsized line belonged.
 *
 * Erring toward more lines is the safe direction: the caller re-measures after applying a
 * clamp and withdraws the row anyway if the clamp did not resolve the overflow. A count that
 * is too generous is corrected; a count that is too stingy is never revisited.
 *
 * @param overflowPx - How far the block's content exceeds its box
 * @param renderedHeightPx - The row text's current rendered height
 * @param lineHeightPx - One line box, from `resolveLineHeightPx`
 * @returns The number of lines the row may keep, which may be zero or negative
 */
export function fittedGridDetailLines(
  overflowPx: number,
  renderedHeightPx: number,
  lineHeightPx: number,
): number {
  if (lineHeightPx <= 0) {
    return 0;
  }

  const currentLines = Math.max(1, Math.round(renderedHeightPx / lineHeightPx));
  const mustRecoverPx = overflowPx - GRID_FIT_TOLERANCE_PX;
  return currentLines - Math.max(0, Math.ceil(mustRecoverPx / lineHeightPx));
}

/**
 * The disclosed grid detail rows, most expendable first, and how each one may be shortened.
 *
 * `lineProperty` names the custom property the row's own stylesheet rule already reads for
 * `-webkit-line-clamp`, so setting it inline on the row cascades to the text span and reuses
 * the shipped clamp — including the ellipsis it draws on the last visible line.
 *
 * Only the two rows whose content is a paragraph carry one. `.time` is `white-space: nowrap`
 * inside a grid block and so is one line by construction: there is no line count left to
 * reduce, which is why it is all-or-nothing here. What that single line does horizontally is
 * a separate problem, settled in the stylesheet by blockifying the span so it can draw an
 * ellipsis; this pass only ever decides whether the row is shown at all.
 * `.event-weather` clamps a chip run whose text stays `display: inline` unless
 * `weather.event.max_lines` is set, so a line count alone would not bind. `.progress-bar-row`
 * has no text at all. Those three remain all-or-nothing.
 */
export const GRID_DETAIL_ROWS: ReadonlyArray<{ selector: string; lineProperty: string | null }> = [
  { selector: '.description', lineProperty: '--calendar-card-description-max-lines' },
  { selector: '.location', lineProperty: '--calendar-card-location-max-lines' },
  { selector: '.event-weather', lineProperty: null },
  { selector: '.progress-bar-row', lineProperty: null },
  { selector: '.time', lineProperty: null },
];

//-----------------------------------------------------------------------------
// MAIN COMPONENT CLASS
//-----------------------------------------------------------------------------

/**
 * How `updateEvents` uses the cache and the network; its docblock has the table.
 */
type LoadMode = 'navigate' | 'page' | 'cache' | 'reprocess' | 'network' | 'reload';

/** The controls a render draws in the header toolbar, before it decides on their labels. */
type ToolbarControls = Omit<Toolbar.HeaderToolbar, 'labeled'>;

/** No calendar hidden: the one empty set, so an unchanged answer keeps its identity. */
const NO_HIDDEN_CALENDARS: ReadonlySet<string> = new Set();

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
  /**
   * When the oldest of the events held in `events` last loaded successfully, in epoch
   * milliseconds. Bounds how long the card keeps drawing them when nothing newer can be
   * loaded. Not the time of the attempt that delivered them: an attempt that only carried
   * a failing calendar's events forward does not make them any younger.
   */
  private _eventsFetchedAt = 0;
  /**
   * Set when the card is attached and cleared by the first load that can run. That load
   * draws whatever is cached before it asks Home Assistant, and honors
   * `refresh_on_navigate`; every later load is a refresh.
   */
  private _appearLoadPending = false;
  /** Consecutive failed attempts this card has seen, for when no cache can record them. */
  private _failureCountHint = 0;
  private _weatherUnsubscribers: Array<() => void> = [];
  /**
   * Monotonic ticket for weather forecast setup and callbacks.
   *
   * Bumped by `_setupWeatherSubscriptions`, by `disconnectedCallback`, and by
   * an entity switch that blanks `weatherForecasts` before the next setup
   * microtask runs. Callbacks close over the ticket they were registered with
   * and no-op when it no longer matches — otherwise a late emit after blank
   * (or after unsubscribe) rewrites the previous entity's forecast onto the
   * card under the new configuration.
   */
  private _weatherSetupVersion = 0;
  private _weatherSetupPending = false;
  /**
   * Subscription that keeps `renderedTitle` in step with a templated `title`.
   */
  private _titleSubscription?: Templates.TemplateSubscription;
  /**
   * True when the most recent load could not read at least one calendar.
   */
  private _hasFetchError = false;
  /**
   * Calendars that failed on the most recent load, named in the notice at the bottom of
   * the card.
   */
  private _failedEntities: string[] = [];
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
    /**
     * Resolved weekend days, joined. Neither `config` nor `language` covers them: they
     * follow the country set in Home Assistant, or its language when no country is set,
     * and either can change while the config object stays identical. Keyed on the result
     * rather than on the two inputs, so a change that leaves the weekend where it was
     * keeps the memo.
     */
    weekendDaysKey: string;
    evaluatedAt: number;
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
   * The event the active gesture's pointer-down landed on, if any. A tap ending this
   * gesture runs `event_tap_action` for it instead of the card's `tap_action`.
   */
  private _pointerTapTarget: Activation.EventTapHit | null = null;
  /**
   * The `click` a browser owes the pointer gesture that just ended, and until when.
   *
   * A browser follows a pointer gesture with a `click`, and the pointer-up has already
   * decided the gesture, so that click must not act again. Where the card captured the
   * pointer the click is aimed at `ha-card` and names no event. Where capture failed, or a
   * browser does not retarget it, it is aimed at the event the pointer went down on. So
   * the guard remembers that event's element (null when the gesture began off the events)
   * and swallows only a click naming that element or naming none, then is spent.
   *
   * Assistive technology activates a button with a bare `click` and no pointer events at
   * all, so every other click is an activation in its own right, a click on a different
   * event included. A gesture that ran nothing and began off the events arms no guard.
   * A hold or a drag that began on an event does, for that event alone: the click a browser
   * that does not retarget sends after it would otherwise open the event the hold or drag
   * deliberately did not.
   *
   * The element rather than its event data, because a hold on an event whose `hold_action`
   * expands the card regroups the events before the click arrives, which replaces every
   * row's data and keeps the element. The deadline only bounds a gesture no click follows,
   * such as a touch long-press, so the guard cannot swallow a later activation.
   */
  private _derivedClick: { element: EventTarget | null; deadline: number } | null = null;
  /** The event a Space keydown armed. A native button activates on Space's keyup. */
  private _spaceArmedOn: EventTarget | null = null;

  /**
   * Whether the card has a tap action to advertise to pointer and keyboard users.
   */
  private get _hasTapAction(): boolean {
    return Boolean(this.config.tap_action && this.config.tap_action.action !== 'none');
  }

  /**
   * Whether the card has a hold action to advertise to pointer users.
   */
  private get _hasHoldAction(): boolean {
    return Boolean(this.config.hold_action && this.config.hold_action.action !== 'none');
  }

  /**
   * Whether the card has any pointer-level action to advertise or track.
   */
  private get _hasCardAction(): boolean {
    return this._hasTapAction || this._hasHoldAction;
  }

  /**
   * Refetch once one of Home Assistant's dialogs reports that it saved a change, and tell
   * the other cards on the page.
   *
   * The write advances the page's write generation once, here, and every card refreshes for
   * that one number: this card directly, the others through the announcement. So a request
   * started before the save, which carries the old answer, is never joined, while the cards
   * refreshing for this save share one request per calendar set and window. Returns
   * nothing, deliberately: Home Assistant awaits this callback before it closes the dialog;
   * see `DialogUpdated`.
   *
   * @param changed - The calendars the change may have touched
   */
  private _refreshAfterWrite(changed: CalendarChanges.ChangedCalendars): undefined {
    this._markHomeStaleIfAway();
    const writeGeneration = EventUtils.advanceWriteGeneration();
    void this.refreshEvents(writeGeneration);
    CalendarChanges.announceCalendarsChanged(this, changed, writeGeneration);
  }

  /**
   * Refetch when another card announces a change that may have touched a calendar this card
   * shows: one it names, or after a new event, any this card shows that accepts new events.
   *
   * The announcing card is skipped: it refreshed before it announced. Refreshes for the
   * announced write's generation, as the announcer did, so they can share its request.
   */
  private readonly _handleCalendarsChanged = (ev: Event): void => {
    const detail = (ev as CustomEvent<CalendarChanges.CalendarsChangedDetail>).detail;
    if (!detail || detail.source === this) return;

    const shownIds = this.config.entities.map((entity) =>
      typeof entity === 'string' ? entity : entity.entity,
    );
    if (CalendarChanges.concernsCalendars(detail, shownIds, this.safeHass)) {
      this._markHomeStaleIfAway();
      void this.refreshEvents(detail.writeGeneration);
    }
  };

  /**
   * Remember that home's cached events may predate a calendar change, when the card is away
   * from home and so refreshes the page on screen instead. Other pages need nothing: the page
   * store drops what was fetched before a write.
   */
  private _markHomeStaleIfAway(): void {
    if (this._pageRequested !== null || this._pageShown !== null) this._homeStale = true;
  }

  /**
   * Opens Home Assistant's event-detail dialog for a tapped event, and refetches once the
   * dialog reports an edit or a delete.
   *
   * Refuses while the card is being edited. Events are not tap targets then, so nothing
   * should reach here; this is the last guard for anything that does, since the dialog
   * offers Edit and Delete.
   */
  private readonly _openEventDetails = (
    event: Types.CalendarEventData,
    color: string | undefined,
  ): void => {
    if (this._isBeingEdited) {
      Logger.debug('Not opening event details while the card is being edited');
      return;
    }

    const calendarId = event._entityId;
    const entry = EventDetails.buildDetailEntry(event);
    if (!calendarId || !entry) return;

    void Dialogs.openEventDetailDialog(this, {
      calendarId,
      entry,
      color,
      ...EventDetails.detailPermissions(this.safeHass, event, entry, {
        allowEdit: this.config.allow_event_edit !== false,
        allowDelete: this.config.allow_event_delete !== false,
        failedEntities: this._failedEntities,
      }),
      updated: () => this._refreshAfterWrite({ ids: [calendarId] }),
    });
  };

  /**
   * Whether a tap on an event opens its details, the one thing `event_tap_action` does.
   *
   * Every other value, Home Assistant's actions and `expand` included, reads as `none`: the
   * events stay what they are by default, and a tap on one is a tap on the card. A bare
   * `event_tap_action:` in YAML is `null`, which reads the same way.
   */
  private get _eventTapOpensDetails(): boolean {
    const eventTapAction: Types.ActionConfig | null | undefined = this.config.event_tap_action;
    return eventTapAction?.action === 'details';
  }

  /**
   * Whether Home Assistant is drawing the card for someone editing a dashboard: in the card
   * editor's live preview (`preview`), or on a dashboard in edit mode (`editMode`).
   *
   * Nothing drawn there may write to a calendar. A press meant to try the configuration or
   * to arrange the dashboard would otherwise open a dialog whose Save writes a real event.
   */
  private get _isBeingEdited(): boolean {
    return this.preview || this.editMode;
  }

  /**
   * Whether events are tap targets: a tap on one opens its details, and the card is not
   * being edited. While it is, events render and behave as they do with taps off.
   */
  private get _eventsActivatable(): boolean {
    return this._eventTapOpensDetails && !this._isBeingEdited;
  }

  /**
   * Runs `event_tap_action` for one tapped event, which opens its details.
   *
   * @param target - The tapped event and the accent color it is drawn in
   */
  private _runEventTapAction({ event, color }: Activation.EventTapTarget): void {
    Logger.debug('Executing event tap action');
    this._openEventDetails(event, color);
  }

  /**
   * The tappable event an input event started on, or undefined.
   *
   * Read from the composed path rather than the target, because a pointer-down's target is
   * whatever leaf of the event's content the pointer hit. Undefined whenever events are not
   * tap targets, so a render still showing the previous configuration cannot act on it.
   *
   * @param ev - A pointer or mouse event dispatched to `ha-card` or inside it
   * @returns The event's element and tap target, or undefined
   */
  private _eventTapAt(ev: Event): Activation.EventTapHit | undefined {
    if (!this._eventsActivatable || typeof ev.composedPath !== 'function') return undefined;
    return Activation.findEventTap(ev.composedPath(), ev.currentTarget);
  }

  /**
   * Card width in CSS pixels, as most recently measured.
   */
  private _measuredWidthPx: number | null = null;

  /**
   * Card width as the observer last reported it, which is what the toolbar's labels follow.
   *
   * Set from the observer's own callback rather than after the settle delay the view fit
   * waits for: the browser delivers that callback after layout and before paint, and the
   * update it requests runs in the microtask straight after, so the first frame painted
   * already has the right controls. The settle delay would paint the wrong ones first.
   * Null until a width arrives, so a card that is never measured draws icons, which fit at
   * any width.
   */
  private _toolbarWidthPx: number | null = null;

  /**
   * The width at which the labeled toolbar last overflowed the header, and what it was
   * drawn beside. See `_syncToolbarLabelFit`.
   */
  private _toolbarLabelsOverflowed: { widthPx: number; signature: string } | null = null;

  /**
   * Fingerprint of the configuration last set, which keys this device's remembered view.
   * See `utils/view-choice.ts`.
   */
  private _configFingerprint: string | null = null;

  /**
   * The view this device picked with the toolbar's switcher, or null to follow `view`.
   * Never the configured view itself: choosing that clears the choice.
   */
  private _viewChoice: Types.EffectiveView | null = null;

  /**
   * The calendars this device hid with the legend, by entity id; only ever calendars the card
   * shows. Replaced rather than changed in place, so the memo keyed on it (`_shownEvents`)
   * notices every change.
   */
  private _hiddenCalendars: ReadonlySet<string> = NO_HIDDEN_CALENDARS;

  /** `events` without the hidden calendars', and what it was filtered from. */
  private _shownEventsCache: {
    events: Types.CalendarEventData[];
    hidden: ReadonlySet<string>;
    shown: Types.CalendarEventData[];
  } | null = null;

  /**
   * Set once the legend's chips did not fit on one row: what they were drawn with, and the
   * card width from which they fit again. See `_syncLegendFit`.
   */
  private _legendFold: { signature: string; unfoldAtPx: number } | null = null;

  /**
   * The card width the legend's fold is judged at. Kept apart from `_toolbarWidthPx` and
   * moved only by the legend's own pass, a frame after a resize, so a render the resize
   * observer causes never folds or unfolds the legend: that changes the card's height, and a
   * height changed while the browser delivers resize observations is reported as an error.
   */
  private _legendWidthPx: number | null = null;

  private _legendFitRaf: number | null = null;

  /** Counts fonts finishing loading while the legend is on, since a chip may change width. */
  private _legendFontGeneration = 0;

  private _legendFontsCleanup: (() => void) | null = null;

  /** The label width the toolbar drawn last needs, which `_syncToolbarLabels` watches for. */
  private _toolbarLabelMinWidthPx: number | null = null;

  /** How `handleAction` runs the actions only the card knows. */
  private readonly _cardActionCallbacks: Actions.CardActionCallbacks = {
    expand: () => this.toggleExpanded(),
    refresh: () => this._requestRefresh(),
  };

  /**
   * First day of the page the date navigation asked for, as `YYYY-MM-DD`, or null for home:
   * the window the card is configured to open with.
   *
   * Never stored anywhere: a reload, any change to the configuration and the start of editing
   * all bring the card home. A fixed day rather than a distance from home, so a page stays on
   * its dates at midnight while home moves on.
   */
  private _pageRequested: string | null = null;

  /**
   * First day of the page whose events `events` holds, or null for home.
   *
   * Lags `_pageRequested` while a page loads: the days on screen stay those of the page the
   * events belong to, dimmed, rather than drawing one window's events under another's dates.
   */
  private _pageShown: string | null = null;

  /** The configuration a page is drawn and fetched with, per page, for one configuration. */
  private _pageConfigs: { config: Types.Config; pages: Map<string, Types.Config> } | null = null;

  /**
   * Set when a calendar changed while the card was away from home: home's cached events may
   * predate the change, and nothing refreshes them meanwhile, so the way home fetches.
   */
  private _homeStale = false;

  /** First day of the configured window, for the local day and options it was resolved for. */
  private _homeWindowCache: { key: string; start: Date } | null = null;

  private _effectiveView: Types.EffectiveView = 'list';

  /**
   * Day columns actually rendered, after any width-driven reduction.
   */
  private _columnCount = 0;

  /**
   * Minutes a later event must start below an earlier one for the grid's cascade to draw
   * it on top, for the scale this card is drawn at. The floor until a render has been
   * measured; see `_syncCascadeThreshold`.
   */
  private _cascadeThresholdMin = CascadeThreshold.CASCADE_THRESHOLD_FLOOR_MIN;

  /**
   * Share of a day column the grid's `+N` strip prefers, as a percentage. `Infinity` until a
   * strip on screen has been measured, which leaves it as wide as its bounds allow; see
   * `_syncOverflowStrip`.
   */
  private _overflowStripPct = Infinity;

  private _gridScaleRaf: number | null = null;

  private _resizeObserver: ResizeObserver | null = null;
  private _gridDisclosureObserver: ResizeObserver | null = null;
  private _gridDisclosureRaf: number | null = null;
  private _gridDisclosureReleaseRaf: number | null = null;
  private _gridDisclosureTargets = new Map<Element, HTMLElement>();
  private _gridDisclosureDirty = new Set<HTMLElement>();
  private _gridDisclosureMutations: MutationObserver | null = null;
  private _gridDisclosureAssetsCleanup: (() => void) | null = null;
  /**
   * Last size delivered for each disclosure target.
   *
   * Apply temporarily changes layout while suppression is armed. An unchanged notification
   * is therefore self-generated and safe to ignore, but a real resize during those two
   * frames must still schedule another fit pass or the old withdrawal becomes permanent.
   */
  private _gridDisclosureObservedSizes = new WeakMap<Element, { width: number; height: number }>();
  /**
   * When true, unchanged ResizeObserver callbacks for grid disclosure are ignored.
   *
   * `_applyGridDisclosureSafety` always restores then may re-hide detail rows, which
   * reflows observed title/block nodes and would otherwise re-schedule apply from its
   * own layout. A notification carrying a genuinely new target size still gets through,
   * because ResizeObserver will not repeat it after suppression clears. Generation bumps
   * invalidate pending double-rAF clears after stop or a newer apply.
   */
  private _gridDisclosureSuppressRo = false;
  private _gridDisclosureSuppressGeneration = 0;
  /**
   * Cancels `document.fonts` work armed while grid disclosure is active.
   *
   * Drops the `loadingdone` listener and marks the `fonts.ready` callback inactive so a
   * late promise resolve cannot schedule disclosure after stop.
   */
  private _gridDisclosureFontsCleanup: (() => void) | null = null;

  /**
   * Repaint timer for the grid's now line, and the local day it last painted.
   *
   * Only ever running in grid view. The line is the only thing on the card that goes
   * stale purely with the passage of time — everything else changes when `hass` does.
   */
  private _nowLineTimerId: number | null = null;

  private _nowLineDayKey: string | null = null;

  /**
   * Bare `requestUpdate()` calls other than the now line's own repaint, and how many of them
   * the last `updated()` had already seen.
   *
   * A bare call leaves `changedProperties` empty, so an update it causes looks the same as
   * one the now-line tick causes. They need opposite treatment: a tick moves one line and must
   * not refit every block (it rewrote 268 unchanged attributes a minute on a modest week, 3,017
   * with ~500 events), while the others — a new cascade threshold, a width change, a forecast
   * arriving — do change what is drawn. A counter rather than a flag, because two causes can
   * land in one update, and because the scale passes call `requestUpdate()` from inside
   * `updated()` itself, which a flag reset there would swallow.
   */
  private _bareUpdateRequests = 0;
  private _bareUpdateRequestsSeen = 0;

  /** True only while `_tickNowLine` is requesting its repaint. */
  private _nowLineRepainting = false;

  /**
   * One-shot timer for the next local midnight, held while the card sheds day columns.
   *
   * Which columns survive depends on what today is (`visibleDayWindowStart`), so the window has
   * to move at midnight. Grid with a now line already refetches then; column view and a grid
   * without the line had nothing that re-renders at midnight. It re-renders and asks for a
   * cache load, which fetches only if a relative start date moved the requested window.
   */
  private _midnightTimerId: number | null = null;

  /**
   * One-shot timer for the next moment a timed event starts or ends, held in list and column
   * view and in a grid without its now line, and the instant it is set for.
   *
   * Those views otherwise repaint only when `hass` happens to change, so an event could keep
   * its "Now" label, or a finished one stay on screen under `show_past_events: false`, until
   * some unrelated entity updated. A timeout per boundary rather than a tick: a day with eight
   * events costs sixteen repaints, not 1,440. A grid with its now line needs none of it,
   * because the line's tick already repaints every minute.
   */
  private _nowBoundaryTimerId: number | null = null;

  private _nowBoundaryAt: number | null = null;

  /** The event list the armed boundary was computed from, so an unrelated update skips the scan. */
  private _nowBoundaryEvents: ReadonlyArray<Types.CalendarEventData> | null = null;

  /**
   * Pending trailing timer for the last width measurement.
   */
  private _widthSettleTimerId: number | null = null;

  /**
   * Observers and pending work for `scroll_long_titles`.
   *
   * Kept apart from the grid disclosure observer above, which reshapes layout by hiding
   * detail rows and so has to suppress its own re-entrancy. Title scrolling only ever adds
   * a transform animation and inline custom properties, and neither resizes the box the
   * observer measures, so it needs no such guard.
   */
  private _titleScrollObserver: ResizeObserver | null = null;
  private _titleScrollIntersectionObserver: IntersectionObserver | null = null;
  private _titleScrollMutations: MutationObserver | null = null;
  private _titleScrollRaf: number | null = null;
  private _titleScrollFontsCleanup: (() => void) | null = null;
  private _titleMotion: TitleMotionController | null = null;

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
      this._shownEvents,
      this.effectiveConfig,
      this.isExpanded,
      this.effectiveLanguage,
      this.effectiveView,
      this.hass,
    );
  }

  /**
   * The calendars the legend hides now: none while the card is being edited, which shows
   * the card as configured, or while it has no legend.
   */
  private get _activeHiddenCalendars(): ReadonlySet<string> {
    return this._wantsLegend && !this._isBeingEdited ? this._hiddenCalendars : NO_HIDDEN_CALENDARS;
  }

  /**
   * The events the card draws: `events` without those of the calendars the legend hides.
   *
   * `events` itself while nothing is hidden, so every memo keyed on it keeps its hits. Taken
   * before anything else is decided, so expiry, `days_of_week`, which copy of a duplicate wins,
   * the compact limits and the empty days all see only the calendars shown. What was loaded —
   * the cache, the page store, the failures — stays `events`.
   */
  private get _shownEvents(): Types.CalendarEventData[] {
    const hidden = this._activeHiddenCalendars;
    if (hidden.size === 0) return this.events;

    const cache = this._shownEventsCache;
    if (cache && cache.events === this.events && cache.hidden === hidden) return cache.shown;

    const shown = this.events.filter((event) => !hidden.has(event._entityId ?? ''));
    this._shownEventsCache = { events: this.events, hidden, shown };
    return shown;
  }

  /**
   * The view the dashboard asks for, before any width-based fallback: this device's
   * switcher choice, or the configured `view`.
   *
   * Editing never changes it. The card shows `view` while it is being edited (see
   * `effectiveView`), but the fit this drives is the dashboard's, and it must still be
   * there when editing ends; a width measured in edit mode keeps fitting this view.
   */
  get requestedView(): Types.EffectiveView {
    return this._viewChoice ?? this.config.view;
  }

  /**
   * The view that will actually render.
   */
  get effectiveView(): Types.EffectiveView {
    if (this._isBeingEdited) {
      return this.config.view;
    }

    return this._effectiveView;
  }

  /**
   * Day columns this render draws, `0` for as many as there are days.
   *
   * While the card is being edited it shows `view` rather than the view the dashboard asks
   * for. When the two differ, the count is fitted for that display alone, without
   * hysteresis, and the dashboard's own fit is left untouched for when editing ends.
   */
  private get _shownColumnCount(): number {
    if (!this._isBeingEdited || this.requestedView === this.config.view) {
      return this._columnCount;
    }

    return ViewConfig.resolveColumnFit(this.config.view, this.config, this._measuredWidthPx, null)
      .columns;
  }

  /**
   * The configuration as it applies to the view currently on screen.
   */
  get effectiveConfig(): Types.Config {
    const view = this.effectiveView;
    const config = this._configForPage(this._pageShown);
    const cache = this._effectiveConfigCache;

    if (cache && cache.config === config && cache.view === view) {
      return cache.resolved;
    }

    const resolved = ViewConfig.resolveEffectiveConfig(config, view);

    this._effectiveConfigCache = { config, view, resolved };

    return resolved;
  }

  /**
   * The configuration a page is fetched and drawn with: home's is the card's own; any other's
   * starts on that page's first day and shows past events.
   *
   * Past events because `show_past_events: false` hides whatever has ended, which on a page in
   * the past is everything; looking back is the reason to page there. It is set in every view
   * block that sets it too, since a block's value outranks the shared one. Memoized per
   * configuration, so the caches downstream that compare configurations by identity keep
   * hitting while a page stays on screen.
   *
   * @param page - First day of the page, or null for home
   * @returns The configuration for that page
   */
  private _configForPage(page: string | null): Types.Config {
    if (page === null) return this.config;

    if (this._pageConfigs?.config !== this.config) {
      this._pageConfigs = { config: this.config, pages: new Map() };
    }
    const cached = this._pageConfigs.pages.get(page);
    if (cached) return cached;

    const derived: Types.Config = { ...this.config, start_date: page, show_past_events: true };
    for (const view of ViewConfig.VIEWS) {
      const blockKey = ViewConfig.VIEW_BLOCKS[view]?.blockKey as keyof Types.Config | undefined;
      const block = blockKey ? this.config[blockKey] : undefined;
      if (blockKey && Helpers.isConfigBlock(block) && 'show_past_events' in block) {
        (derived as unknown as Record<string, unknown>)[blockKey] = {
          ...block,
          show_past_events: true,
        };
      }
    }

    this._pageConfigs.pages.set(page, derived);
    return derived;
  }

  /**
   * The query identity a page's events are fetched and cached under: home's is the card's
   * own; a page's is that of a card configured to open on its first day, so two cards on one
   * page share its request and its entry.
   *
   * @param page - First day of the page, or null for home
   * @returns The instance id
   */
  private _instanceIdForPage(page: string | null): string {
    if (page === null) return this._instanceId;

    return Helpers.generateDeterministicId(
      this.config.entities,
      this.config.days_to_show,
      page,
      this.config.first_day_of_week,
    );
  }

  /** Whether the configuration asks for the date navigation. */
  private get _wantsNavigation(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.navigation;
  }

  /** Day columns this render draws while the layout drops some, `0` when it draws them all. */
  private get _shedColumns(): number {
    return this.effectiveView === 'list' ? 0 : this._shownColumnCount;
  }

  /**
   * First day of the window the card is configured to open with, at local midnight.
   *
   * Memoized per local day and per the options that decide it, because resolving a relative
   * `start_date` logs, and this is read on every render while the date navigation is on.
   *
   * @param now - The current moment
   * @returns The configured window's first day
   */
  private _homeWindowStart(now: Date): Date {
    const firstDayOfWeek = FormatUtils.getFirstDayOfWeek(
      this.config.first_day_of_week,
      this.hass?.locale,
    );
    const key = [
      FormatUtils.getLocalDateKey(now),
      this.config.start_date ?? '',
      this.config.days_to_show,
      firstDayOfWeek,
    ].join('|');
    if (this._homeWindowCache?.key !== key) {
      const { start } = EventUtils.getTimeWindow(
        this.config.days_to_show,
        this.config.start_date,
        firstDayOfWeek,
      );
      this._homeWindowCache = { key, start };
    }
    return this._homeWindowCache.start;
  }

  /**
   * The page the card opens with, as drawn now: the configured window, or the slice of it the
   * card draws while the layout drops columns.
   *
   * @param now - The current moment
   * @returns Home
   */
  private _homeRange(now: Date = new Date()): Paging.PageRange {
    return Paging.homeRange(
      this._homeWindowStart(now),
      this.config.days_to_show,
      this._shedColumns,
      now,
    );
  }

  /**
   * The days a page covers as drawn now.
   *
   * @param page - First day of the page, or null for home
   * @param now - The current moment
   * @returns The page's days
   */
  private _pageRange(page: string | null, now: Date = new Date()): Paging.PageRange {
    if (page === null) return this._homeRange(now);
    return {
      start: Paging.pageStart(page),
      days: Paging.pageSpan(this.config.days_to_show, this._shedColumns),
    };
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
    const weekendDaysKey = FormatUtils.getWeekendDays(this.hass).join(',');
    // Expiry and relative date windows can change without new events or configuration.
    const evaluatedAt = Date.now();
    const cache = this._visibleCountCache;
    const events = this._shownEvents;

    if (
      cache &&
      cache.events === events &&
      cache.config === this.config &&
      cache.view === view &&
      cache.language === language &&
      cache.firstWeekday === firstWeekday &&
      cache.weekendDaysKey === weekendDaysKey &&
      cache.evaluatedAt === evaluatedAt
    ) {
      return cache.count;
    }

    const count = events.length
      ? EventUtils.groupEventsByDay(
          events,
          this.effectiveConfig,
          true,
          language,
          view,
          this.hass,
        ).reduce((total, day) => total + day.events.filter((event) => !event._isEmptyDay).length, 0)
      : 0;

    this._visibleCountCache = {
      events,
      config: this.config,
      view,
      language,
      firstWeekday,
      weekendDaysKey,
      evaluatedAt,
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

    // Provisional: the load below re-arms it for the data's own deadline once it lands.
    this.startRefreshTimer();

    this._appearLoadPending = true;
    this.updateEvents('navigate');

    this._scheduleWeatherSetup();

    this._updateTitleSubscription();

    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    window.addEventListener(CalendarChanges.CALENDARS_CHANGED_EVENT, this._handleCalendarsChanged);

    this._syncEntityColors();

    this._startWidthObserver();

    // Disconnect tears title-scrolling observers down, and reconnect does not
    // necessarily schedule a Lit update. Reacquire from the existing shadow DOM
    // immediately; the first connection still gets its normal post-render sync.
    this._syncTitleScroll();
    this._syncGridDisclosureSafety();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this._stopWidthObserver();
    this._stopGridDisclosureObserver();
    this._stopTitleScrollObserver();
    Legend.closeLegendMenus(this.renderRoot);
    this._legendFontsCleanup?.();
    this._legendFontsCleanup = null;
    if (this._legendFitRaf !== null) {
      cancelAnimationFrame(this._legendFitRaf);
      this._legendFitRaf = null;
    }

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

    this._endGesture();
    this._derivedClick = null;
    this._spaceArmedOn = null;

    this._stopNowLineTimer();
    this._stopMidnightTimer();
    this._stopNowBoundaryTimer();

    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    window.removeEventListener(
      CalendarChanges.CALENDARS_CHANGED_EVENT,
      this._handleCalendarsChanged,
    );

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
        this._syncToolbarLabels(width);
        this._scheduleLegendFit();
        this._scheduleWidthMeasurement(width);
      }

      // A resize can change the time body's height, or a day column's width, without any
      // width threshold moving, so the grid's scale is re-read on every resize rather than
      // only after a re-render.
      this._scheduleGridScaleSync();
    });

    this._resizeObserver.observe(this);
  }

  /**
   * Records the card's width for the toolbar's labels, and re-renders at once if that moves
   * it across a label threshold.
   *
   * No hysteresis: a dashboard sizes the card, not the card's content, so the label cannot
   * feed back into the width it was chosen from, and there is no loop for a band to damp.
   * Whether the bar is actually labeled also depends on which controls it draws, so that is
   * decided at render (`_toolbarLabeledFor`); this only notices a threshold being crossed.
   *
   * @param widthPx - Measured card width in CSS pixels
   */
  private _syncToolbarLabels(widthPx: number): void {
    // The fixed thresholds, the one the bar drawn last needs, and the width a folded legend
    // opens again from.
    const thresholds = [
      Constants.UI.TOOLBAR_LABEL_MIN_WIDTH,
      Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH,
      Constants.UI.TOOLBAR_BAND_LABEL_MIN_WIDTH,
      Constants.UI.TOOLBAR_BAND_SWITCHER_LABEL_MIN_WIDTH,
      this._toolbarLabelMinWidthPx,
    ].filter((threshold): threshold is number => typeof threshold === 'number');
    const band = (width: number | null): string =>
      width === null ? '' : thresholds.map((threshold) => (width >= threshold ? 1 : 0)).join('');
    const crossed = band(widthPx) !== band(this._toolbarWidthPx);
    // Labels that overflowed at some width are tried again once the card grows past it.
    const overflowed = this._toolbarLabelsOverflowed;
    const outgrew =
      overflowed !== null &&
      widthPx > overflowed.widthPx &&
      (this._toolbarWidthPx ?? 0) <= overflowed.widthPx;

    this._toolbarWidthPx = widthPx;
    if ((crossed || outgrew) && Config.resolveToolbar(this.config).show) {
      this.requestUpdate();
    }
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

    // Repaint once a minute, using the precise wall-clock position at each render.
    // The interval need not align with a wall-clock minute to keep that cadence.
    this._nowLineTimerId = window.setInterval(() => {
      this._tickNowLine();
    }, Constants.TIMING.NOW_LINE_INTERVAL);

    // Keep the key across stops so a hidden or disconnected card can detect that midnight
    // passed before the timer was reacquired.
    const dayKey = FormatUtils.getLocalDateKey(new Date());
    if (this._nowLineDayKey !== null && dayKey !== this._nowLineDayKey) {
      this._nowLineDayKey = dayKey;
      Logger.debug('Local day rolled over while the now-line timer was stopped, refreshing events');
      this.updateEvents('network');
      return;
    }

    this._nowLineDayKey = dayKey;
  }

  private _stopNowLineTimer(): void {
    if (this._nowLineTimerId !== null) {
      clearInterval(this._nowLineTimerId);
      this._nowLineTimerId = null;
    }
  }

  /**
   * Holds a timer for the next local midnight exactly while the card is shedding day columns.
   *
   * Reconciled from `updated()`, like the now-line timer, because the column count and the
   * view both change after connection. The timer re-renders once and this re-arms it for the
   * following midnight, so a card left open for a week moves its window every night.
   */
  private _syncMidnightTimer(): void {
    const shedding =
      this.isConnected &&
      (this.effectiveView === 'grid' || this.effectiveView === 'column') &&
      this._shownColumnCount > 0 &&
      this._shownColumnCount < this.effectiveConfig.days_to_show;

    if (!shedding) {
      this._stopMidnightTimer();
      return;
    }

    if (this._midnightTimerId !== null) {
      return;
    }

    const now = new Date();
    // One second past, so the render it causes reads the new day even if the timer fires a
    // little early. Built from local fields, so a DST night is as long as it really is.
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    this._midnightTimerId = window.setTimeout(() => {
      this._midnightTimerId = null;
      this.requestUpdate();
      // A relative start_date can move the whole window at midnight — start_of_week by a
      // week — and drawing the new window from the old window's events shows false empty
      // days. A cache load fetches exactly when the window it asks for has changed.
      void this.updateEvents('cache');
    }, nextMidnight.getTime() - now.getTime());
  }

  private _stopMidnightTimer(): void {
    if (this._midnightTimerId !== null) {
      clearTimeout(this._midnightTimerId);
      this._midnightTimerId = null;
    }
  }

  /**
   * Whether the card draws a view that changes at event boundaries without a repaint of its
   * own. List and column always do. Grid does when its now line is off: the line's minute
   * tick is what otherwise repaints a finished event dim, or away under show_past_events off.
   */
  private get _wantsNowBoundary(): boolean {
    return (
      this.effectiveView === 'list' ||
      this.effectiveView === 'column' ||
      (this.effectiveView === 'grid' && !this._wantsNowLine)
    );
  }

  /**
   * Holds a timer for the next event boundary exactly while a view that needs one is on screen.
   *
   * Reconciled from `updated()` like the other timers, and re-armed by the render the timer
   * itself causes, so it walks from one boundary to the next. It keeps a timer already set
   * from the same events, so the renders `hass` causes in between cost nothing here.
   */
  private _syncNowBoundaryTimer(): void {
    const wanted =
      this.isConnected && this._wantsNowBoundary && document.visibilityState !== 'hidden';
    // What is drawn, so a hidden calendar's events never wake the card.
    const events = this._shownEvents;

    // An armed timer computed from these same events is still right until it fires: no
    // boundary lies between the moment it was computed and the one it waits for, and a
    // later moment cannot add one. So the renders hass causes in between skip the scan.
    if (
      wanted &&
      this._nowBoundaryTimerId !== null &&
      this._nowBoundaryEvents === events &&
      this._nowBoundaryAt !== null &&
      this._nowBoundaryAt > Date.now()
    ) {
      return;
    }

    const next = wanted ? EventUtils.nextEventBoundary(events, Date.now()) : null;

    if (next === null) {
      this._stopNowBoundaryTimer();
      return;
    }

    if (this._nowBoundaryTimerId !== null && this._nowBoundaryAt === next) {
      return;
    }

    this._stopNowBoundaryTimer();
    this._nowBoundaryAt = next;
    this._nowBoundaryEvents = events;
    // A second past the boundary, so the render reads the new state even if the timer fires
    // a little early, and capped so a boundary far ahead never meets setTimeout's 24.8-day
    // limit; the capped timer simply re-arms.
    const delay = Math.min(next - Date.now() + 1000, Constants.TIMING.NOW_BOUNDARY_MAX_DELAY);
    this._nowBoundaryTimerId = window.setTimeout(() => {
      this._nowBoundaryTimerId = null;
      this._nowBoundaryAt = null;
      this.requestUpdate();
    }, delay);
  }

  private _stopNowBoundaryTimer(): void {
    if (this._nowBoundaryTimerId !== null) {
      clearTimeout(this._nowBoundaryTimerId);
      this._nowBoundaryTimerId = null;
    }
    this._nowBoundaryAt = null;
    this._nowBoundaryEvents = null;
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
      this.updateEvents('network');
      return;
    }

    this._nowLineDayKey = dayKey;
    this._nowLineRepainting = true;
    try {
      this.requestUpdate();
    } finally {
      this._nowLineRepainting = false;
    }
  }

  /**
   * Counts every bare update request except the now line's repaint; see
   * `_bareUpdateRequests`.
   *
   * Lit calls this from its own constructor, before the counter's initializer has run, hence
   * the `?? 0`.
   */
  override requestUpdate(...args: Parameters<LitElement['requestUpdate']>): void {
    if (args[0] === undefined && !this._nowLineRepainting) {
      this._bareUpdateRequests = (this._bareUpdateRequests ?? 0) + 1;
    }
    super.requestUpdate(...args);
  }

  private _stopWidthObserver(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._widthSettleTimerId !== null) {
      clearTimeout(this._widthSettleTimerId);
      this._widthSettleTimerId = null;
    }

    if (this._gridScaleRaf !== null) {
      cancelAnimationFrame(this._gridScaleRaf);
      this._gridScaleRaf = null;
    }
  }

  //-----------------------------------------------------------------------------
  // GRID SCALE
  //-----------------------------------------------------------------------------

  /**
   * Coalesces resize notifications into one re-measurement per frame.
   */
  private _scheduleGridScaleSync(): void {
    if (this._gridScaleRaf !== null || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    this._gridScaleRaf = requestAnimationFrame(() => {
      this._gridScaleRaf = null;
      this._syncCascadeThreshold();
      this._syncOverflowStrip();
    });
  }

  /**
   * Re-reads the scale the grid is drawn at and re-renders once if it moved the cascade's
   * threshold.
   *
   * Stable by construction: the inputs are the time body's height, the event font size and
   * a block's vertical chrome, and none of them depends on how events are laid out, so the
   * render this triggers measures the same scale and stops. Raising takes effect at once;
   * lowering waits out a little hysteresis, so a resize across a step boundary cannot flip
   * the layout back and forth. See `grid-cascade-threshold.ts`.
   */
  private _syncCascadeThreshold(): void {
    if (
      !this.isConnected ||
      this.effectiveView !== 'grid' ||
      ViewConfig.resolveTimeGridOption(this.effectiveConfig, 'overlap_layout') !== 'cascade'
    ) {
      return;
    }

    const band = GridUtils.resolveBand(
      ViewConfig.resolveTimeGridOption(this.effectiveConfig, 'start_time'),
      ViewConfig.resolveTimeGridOption(this.effectiveConfig, 'end_time'),
    );
    const next = CascadeThreshold.cascadeThresholdMin(
      CascadeThreshold.measureCascadeThreshold(this.renderRoot),
      band.endMin - band.startMin,
      this._cascadeThresholdMin,
    );

    if (next !== this._cascadeThresholdMin) {
      Logger.debug(`Cascade threshold ${this._cascadeThresholdMin} -> ${next} minutes`);
      this._cascadeThresholdMin = next;
      this.requestUpdate();
    }
  }

  /**
   * Re-reads the width the grid's `+N` strip needs and re-renders once if it moved.
   *
   * Both overlap layouts draw the strip, so unlike the threshold this is not gated on the
   * cascade. Stable for the same reason: a day column's width and the label's font do not
   * depend on how wide the strip is drawn, so the render this triggers measures the same
   * and stops. Nothing is measured, or redrawn, while no strip is on screen. See
   * `grid-overflow-strip.ts`.
   */
  private _syncOverflowStrip(): void {
    if (!this.isConnected || this.effectiveView !== 'grid') {
      return;
    }

    const next = OverflowStrip.overflowStripPct(
      OverflowStrip.measureOverflowStrip(this.renderRoot),
      this._overflowStripPct,
    );

    if (next !== this._overflowStripPct) {
      Logger.debug(`Overflow strip ${this._overflowStripPct} -> ${next}% of a day column`);
      this._overflowStripPct = next;
      this.requestUpdate();
    }
  }

  /**
   * Stops observing grid disclosure targets and cancels any document.fonts work.
   *
   * Clears the ResizeObserver, the pending rAF, the loadingdone listener, and the
   * active flag on the fonts.ready callback so a late promise resolve cannot schedule
   * apply after this returns.
   */
  private _stopGridDisclosureObserver(): void {
    this._gridDisclosureObserver?.disconnect();
    this._gridDisclosureObserver = null;

    this._gridDisclosureFontsCleanup?.();
    this._gridDisclosureFontsCleanup = null;
    this._gridDisclosureMutations?.disconnect();
    this._gridDisclosureMutations = null;
    this._gridDisclosureAssetsCleanup?.();
    this._gridDisclosureAssetsCleanup = null;
    this._gridDisclosureTargets.clear();
    this._gridDisclosureDirty.clear();

    if (this._gridDisclosureRaf !== null) {
      cancelAnimationFrame(this._gridDisclosureRaf);
      this._gridDisclosureRaf = null;
    }
    if (this._gridDisclosureReleaseRaf !== null) {
      cancelAnimationFrame(this._gridDisclosureReleaseRaf);
      this._gridDisclosureReleaseRaf = null;
    }

    // Invalidate any pending double-rAF that would clear RO suppress after apply.
    this._gridDisclosureSuppressGeneration += 1;
    this._gridDisclosureSuppressRo = false;
  }

  /**
   * Fits the disclosed grid details into their block, by the line rather than by the row.
   *
   * Container queries make the usual case cheap, but their fixed pixel rungs cannot account
   * for a theme or configuration that enlarges text. Keep the title visible and, from the
   * bottom up, first shorten and then — only if shortening cannot help — withdraw the
   * optional rows until the remaining disclosed content fits.
   *
   * Shortening comes first because withdrawal reads as a bug. A 2.5-hour event with a
   * five-line postal address showed its title and its time and then nothing at all, with
   * roughly three empty lines sitting inside the block below them: the whole location row
   * had been given up because its last line did not fit. `-webkit-line-clamp` is already how
   * `location_max_lines` and `description_max_lines` limit those rows, and it supplies the
   * ellipsis on the last visible line for free, so the fix is to compute how many lines the
   * remaining space holds and set that row's own clamp property inline. The clamp can only
   * tighten: the line count is measured after the user's configured limit has applied, so a
   * `location_max_lines: 2` stays at two even where four would have fitted.
   *
   * Measuring requires restoring every hidden and every clamped detail row first, so every
   * apply can reflow observed title/block nodes even when the final result is unchanged.
   * Suppress ResizeObserver until two animation frames later so that reflow cannot re-arm
   * schedule.
   */
  private _applyGridDisclosureSafety(blocks?: Iterable<HTMLElement>): void {
    this._gridDisclosureSuppressGeneration += 1;
    const generation = this._gridDisclosureSuppressGeneration;
    this._gridDisclosureSuppressRo = true;
    const pending = Array.from(
      blocks ??
        this.renderRoot.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)'),
    );
    const titles = pending
      .map(GridTitleFit.gridTitleTarget)
      .filter((target): target is GridTitleFit.GridTitleTarget => target !== null);
    titles.forEach(GridTitleFit.resetGridTitle);
    GridTitleFit.reserveScrollingLabelWidths(titles.map((target) => target.title));

    try {
      const transactions = pending.flatMap((block) => {
        const content = block.querySelector<HTMLElement>('.grid-event-disclosure .event-content');
        if (!content) return [];
        const detailRows = GRID_DETAIL_ROWS.map((row) => ({
          lineProperty: row.lineProperty,
          element: content.querySelector<HTMLElement>(row.selector),
        })).filter(
          (row): row is { lineProperty: string | null; element: HTMLElement } =>
            row.element !== null,
        );

        for (const row of detailRows) {
          row.element.classList.remove('grid-event-detail-clipped');
          if (row.lineProperty) {
            row.element.style.removeProperty(row.lineProperty);
          }
        }
        return [{ block, content, detailRows, withdrawn: [] as HTMLElement[] }];
      });

      const wrappedTimes = this._applyGridTimeFit(pending);

      // The title settles before anything measures the block's overflow: its first word moves
      // up beside the labels, then it stops at the last whole line the block shows. After the
      // time fit, because the class that reveals the time row also tightens an authored title
      // clamp. Before the wrap and detail decisions, because they ask whether the content
      // overflows, and a title line running past the block's edge answered yes for all of
      // them: a time wrap was demoted, and the rows were withdrawn and then restored, unseen,
      // beneath a title nobody could read whole.
      GridTitleFit.leadGridTitles(titles);
      GridTitleFit.cutGridTitleLines(titles);

      // A wrap is decided on width but paid for in height, so settle that here, before
      // anything else competes for the same pixels. Withdrawing it lands on exactly the
      // class set the rung below produces, which is what makes the loop underneath see an
      // identical state whether or not any row was ever offered a wrap - so no location,
      // weather, description or progress row can be withdrawn *because* a time row
      // wrapped. That is the opportunistic constraint, held by construction rather than by
      // ordering care.
      const unaffordable = transactions.filter(
        (transaction) =>
          wrappedTimes.has(transaction.block) && gridContentOverflows(transaction.content),
      );
      for (const transaction of unaffordable) {
        const target = wrappedTimes.get(transaction.block);
        if (target) GridTimeFit.demoteGridTimeWrap(target);
      }

      // Keep the existing priority/rollback transaction, but batch each row's reads and
      // writes across blocks. Otherwise restoring one block forces layout for the next.
      for (const { selector } of GRID_DETAIL_ROWS) {
        const choices = transactions.flatMap((transaction) => {
          if (!gridContentOverflows(transaction.content)) return [];
          const row = transaction.detailRows.find(({ element }) => element.matches(selector));
          if (!row || row.element.getClientRects().length === 0) return [];
          const lines = row.lineProperty
            ? this._gridDetailLineCount(transaction.content, row.element)
            : 0;
          return [{ transaction, row, lines }];
        });
        for (const { row, lines } of choices) {
          if (row.lineProperty && lines > 0) {
            row.element.style.setProperty(row.lineProperty, String(lines));
          }
        }
        const withdrawals = choices.filter(
          ({ transaction, lines }) => lines < 1 || gridContentOverflows(transaction.content),
        );
        for (const { transaction, row } of withdrawals) {
          if (row.lineProperty) row.element.style.removeProperty(row.lineProperty);
          row.element.classList.add('grid-event-detail-clipped');
          transaction.withdrawn.push(row.element);
        }
      }
      // A too-tall title cannot be repaired by sacrificing details. Restore them if the
      // transaction did not fit; title rescue below makes its own, separate decision.
      const rollbacks = transactions.filter(({ content }) => gridContentOverflows(content));
      for (const { withdrawn } of rollbacks) {
        withdrawn.forEach((row) => row.classList.remove('grid-event-detail-clipped'));
      }
      const compact: GridTitleFit.GridTitleTarget[] = [];
      const centered: GridTitleFit.GridTitleTarget[] = [];
      for (const target of titles) {
        if (!GridTitleFit.normalGridTitleFits(target)) {
          compact.push(target);
          continue;
        }
        const details = GRID_DETAIL_ROWS.flatMap(({ selector }) =>
          Array.from(target.disclosure.querySelectorAll<HTMLElement>(selector)),
        );
        if (details.length && details.every((detail) => detail.getClientRects().length === 0)) {
          centered.push(target);
        }
      }
      GridTitleFit.centerGridTitles(centered);
      GridTitleFit.fitCompactGridTitles(compact);
      const resumed = titles
        .filter(
          (target) =>
            (target.previousMode === 'compact' || target.previousMode === 'blank') &&
            target.block.dataset.gridTitleFit !== 'compact' &&
            target.block.dataset.gridTitleFit !== 'blank' &&
            target.title.classList.contains('title-scrollable'),
        )
        .map((target) => target.title);
      if (resumed.length) this._measureTitleScroll(resumed);
      this._titleMotion?.refresh();
    } finally {
      // Two frames: layout from the class toggle, then the RO notifications that follow it.
      if (this._gridDisclosureReleaseRaf !== null) {
        cancelAnimationFrame(this._gridDisclosureReleaseRaf);
      }
      this._gridDisclosureReleaseRaf = requestAnimationFrame(() => {
        this._gridDisclosureReleaseRaf = requestAnimationFrame(() => {
          this._gridDisclosureReleaseRaf = null;
          if (generation === this._gridDisclosureSuppressGeneration) {
            this._gridDisclosureSuppressRo = false;
          }
        });
      });
    }
  }

  /**
   * Fit each block's time row across, before the vertical pass decides what to withdraw.
   *
   * Runs first so the vertical budget sees the row set the width decision actually leaves
   * behind: a row this pass hides is not a row the height pass has to pay for, and a row it
   * strips an icon from is no shorter but is finally readable.
   *
   * Phased so that the whole card costs three style recalculations rather than three per
   * block. Each phase is entirely reads or entirely writes, and the second read depends on
   * the second write, which is why there are three and not two.
   *
   * @param blocks - The timed grid blocks being fitted
   */
  private _applyGridTimeFit(
    blocks: ReadonlyArray<HTMLElement>,
  ): ReadonlyMap<HTMLElement, GridTimeFit.GridTimeTarget> {
    const pairs = blocks
      .map((block) => ({ block, target: GridTimeFit.gridTimeTarget(block) }))
      .filter(
        (pair): pair is { block: HTMLElement; target: GridTimeFit.GridTimeTarget } =>
          pair.target !== null,
      );
    const wrapped = new Map<HTMLElement, GridTimeFit.GridTimeTarget>();
    if (pairs.length === 0) return wrapped;

    const targets = pairs.map(({ target }) => target);

    targets.forEach(GridTimeFit.prepareGridTimeMeasurement);
    const available = targets.map(GridTimeFit.measureGridTimeAvailable);
    targets.forEach(GridTimeFit.releaseGridTimeWidth);
    const base = targets.map((target, index) =>
      GridTimeFit.measureGridTimeCosts(target, available[index]),
    );
    // The wrapped width needs the row in its wrapped shape, which is a write, so it cannot
    // share a phase with the read above. Keep each phase batched across every block: four
    // alternations rather than two is still a constant number of layout flushes, where
    // measuring one block at a time would be one per block.
    targets.forEach(GridTimeFit.openGridTimeWrapMeasurement);
    const wrapWidths = targets.map(GridTimeFit.measureGridTimeWrapped);
    targets.forEach(GridTimeFit.settleGridTimeWrapMeasurement);

    const fits = base.map((costs, index) =>
      GridTimeFit.gridTimeFit({ ...costs, wrapped: wrapWidths[index] }),
    );
    pairs.forEach(({ block, target }, index) => {
      GridTimeFit.applyGridTimeFit(target, fits[index]);
      if (fits[index].wrap) wrapped.set(block, target);
    });

    return wrapped;
  }

  /**
   * Measure how many lines of a detail row fit, before the batched clamp write.
   *
   * Measures the text span rather than the row, because the row is a flex line that also
   * carries an icon; the span is both what wraps and what the clamp rule targets.
   *
   * @param content - The block's disclosed content, whose overflow is being paid for
   * @param row - The detail row to shorten
   * @returns Fitting line count, or zero when the row must be withdrawn
   */
  private _gridDetailLineCount(content: HTMLElement, row: HTMLElement): number {
    const text = row.querySelector<HTMLElement>('span') ?? row;
    const lineHeight = resolveLineHeightPx(getComputedStyle(text));
    const fitted = fittedGridDetailLines(
      content.scrollHeight - content.clientHeight,
      text.getBoundingClientRect().height,
      lineHeight,
    );

    return Math.max(0, fitted);
  }

  /**
   * Reconciles the disclosure safety fallback after layout has settled.
   */
  private _scheduleGridDisclosureSafety(all = true): void {
    if (all) {
      this._gridDisclosureTargets.forEach((block) => this._gridDisclosureDirty.add(block));
    }
    if (this._gridDisclosureRaf !== null) return;

    this._gridDisclosureRaf = requestAnimationFrame(() => {
      this._gridDisclosureRaf = null;
      // A deferred fonts.ready can resolve after stop/disconnect. Match the weather
      // and entity-color guards: never apply disclosure safety on a detached card or
      // after the view has left the grid.
      if (!this.isConnected || this.effectiveView !== 'grid') {
        return;
      }
      const dirty = Array.from(this._gridDisclosureDirty).filter((block) => block.isConnected);
      this._gridDisclosureDirty.clear();
      if (dirty.length) this._applyGridDisclosureSafety(dirty);
    });
  }

  /**
   * Observes timed grid blocks and title metrics that stay visible under the clip fallback.
   *
   * Block height is absolute time geometry, so a late font load or a theme that only
   * enlarges the title can overflow `.event-content` without resizing `.grid-event`.
   * Observing `.summary` / `.event-title` catches that without watching optional detail
   * rows: those rows can be `display: none` after the safety pass, so observing them
   * re-fires ResizeObserver from the apply pass that just hid them.
   * Apply also suppresses RO for two frames after every measure, because unclip→reclip
   * reflows the title/block nodes we *do* observe even when the final clip state matches.
   * `document.fonts` covers detail-row font loads; `updated()` re-applies after
   * config/theme edits as a backstop.
   */
  private _syncGridDisclosureSafety(remeasure = true): void {
    if (
      !this.isConnected ||
      this.effectiveView !== 'grid' ||
      typeof ResizeObserver === 'undefined'
    ) {
      this._stopGridDisclosureObserver();
      return;
    }
    if (!remeasure && this._gridDisclosureObserver) return;

    const blocks = this.renderRoot.querySelectorAll<HTMLElement>(
      '.grid-event:not(.grid-event-overflow)',
    );
    if (!blocks.length) {
      this._stopGridDisclosureObserver();
      return;
    }

    if (!this._gridDisclosureObserver) {
      this._gridDisclosureObserver = new ResizeObserver((entries) => {
        let targetChangedSize = false;
        for (const entry of entries) {
          const previous = this._gridDisclosureObservedSizes.get(entry.target);
          const next = { width: entry.contentRect.width, height: entry.contentRect.height };
          this._gridDisclosureObservedSizes.set(entry.target, next);
          if (
            previous === undefined ||
            previous.width !== next.width ||
            previous.height !== next.height
          ) {
            const block = this._gridDisclosureTargets.get(entry.target);
            if (block) this._gridDisclosureDirty.add(block);
            targetChangedSize = true;
          }
        }

        if (this._gridDisclosureSuppressRo && !targetChangedSize) return;
        if (targetChangedSize) this._scheduleGridDisclosureSafety(false);
      });
      this._watchGridDisclosureFonts();
    }
    this._observeGridDisclosureTargets(blocks);
    this._scheduleGridDisclosureSafety();
  }

  /**
   * Brings the observed disclosure targets in line with the blocks now on screen.
   *
   * Drops targets whose block has gone and starts observing the title metrics of blocks that
   * arrived since the last call. Observing is all it does to a block that was already there.
   *
   * @param blocks - The timed blocks currently rendered
   */
  private _observeGridDisclosureTargets(blocks: Iterable<HTMLElement>): void {
    const current = new Set<HTMLElement>(blocks);
    for (const [target, block] of this._gridDisclosureTargets) {
      if (!current.has(block) || !block.contains(target)) {
        this._gridDisclosureObserver?.unobserve(target);
        this._gridDisclosureTargets.delete(target);
      }
    }
    // Title stays visible under the clip class; detail rows do not — see the method doc.
    const contentTargets = '.summary, .event-title';
    current.forEach((block) => {
      for (const target of [block, ...block.querySelectorAll(contentTargets)]) {
        if (this._gridDisclosureTargets.has(target)) continue;
        this._gridDisclosureTargets.set(target, block);
        this._gridDisclosureObserver?.observe(target);
      }
    });
  }

  /**
   * Reacts to blocks, banners or day columns arriving or leaving outside a full refit.
   *
   * The update that caused it may have skipped the full pass — a now-line tick does, and so
   * does a Home Assistant update that changed nothing this card was told about but still
   * re-rendered against a later clock. So it observes the new blocks, refits every block, and
   * takes the two scale measurements, which read a day body's height and width, again.
   *
   * Every block, not just the new ones, because a block that stays can change shape through
   * attributes alone, which nothing else here watches. A longer event's text area ends where
   * an event drawn inside it starts; when that event ends and leaves, the longer one drops
   * its limit and grows its text area without changing size, so the resize observer stays
   * quiet and its old fit would stand. Structure changes at event boundaries, a few times a
   * day, so this costs the steady tick nothing.
   */
  private _reconcileGridStructure(): void {
    if (!this.isConnected || this.effectiveView !== 'grid' || !this._gridDisclosureObserver) {
      return;
    }
    this._observeGridDisclosureTargets(
      this.renderRoot.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)'),
    );
    this._scheduleGridDisclosureSafety(true);
    this._scheduleGridScaleSync();
  }

  /** Watch font loads, inherited theme changes, and late/recycled title content once per bind. */
  private _watchGridDisclosureFonts(): void {
    const onImage = (event: Event): void => {
      if (!(event.target instanceof HTMLImageElement) || !event.target.matches('.label-image')) {
        return;
      }
      const block = event.target.closest<HTMLElement>('.grid-event');
      if (block) {
        this._gridDisclosureDirty.add(block);
        this._scheduleGridDisclosureSafety(false);
      }
    };
    this.renderRoot.addEventListener('load', onImage, true);
    this.renderRoot.addEventListener('error', onImage, true);
    this._gridDisclosureAssetsCleanup = () => {
      this.renderRoot.removeEventListener('load', onImage, true);
      this.renderRoot.removeEventListener('error', onImage, true);
    };
    const fonts = document.fonts;
    if (fonts) {
      // fonts.ready is a Promise: removeEventListener cannot cancel it. Flag the
      // callback dead in cleanup so a late resolve after stop/disconnect cannot
      // re-arm a disclosure rAF the way a leaked weather subscription does.
      let active = true;
      const onFonts = (): void => {
        if (!active) return;
        this._scheduleGridDisclosureSafety();
      };
      void fonts.ready.then(onFonts);
      if (typeof fonts.addEventListener === 'function') {
        fonts.addEventListener('loadingdone', onFonts);
      }
      this._gridDisclosureFontsCleanup = () => {
        active = false;
        if (typeof fonts.removeEventListener === 'function') {
          fonts.removeEventListener('loadingdone', onFonts);
        }
      };
    }
    if (typeof MutationObserver !== 'undefined') {
      this._gridDisclosureMutations = new MutationObserver((records) => {
        let all = false;
        let structural = false;
        for (const record of records) {
          if (record.type === 'attributes') {
            if (isScrollPauseOnlyMutation(record, this)) continue;
            all = true;
          } else {
            const element =
              record.target instanceof Element ? record.target : record.target.parentElement;
            const block = element?.closest<HTMLElement>('.grid-event:not(.grid-event-overflow)');
            if (block) this._gridDisclosureDirty.add(block);
            else if (element?.closest('style')) all = true;
            else if (changesGridStructure(record)) structural = true;
          }
        }
        if (structural) this._reconcileGridStructure();
        if (all || this._gridDisclosureDirty.size) this._scheduleGridDisclosureSafety(all);
      });
      this._gridDisclosureMutations.observe(this.renderRoot, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      observeTypographyAncestors(this._gridDisclosureMutations, this);
    }
  }

  /**
   * Whether this update can have changed what the grid's fitting passes measured.
   *
   * Unrelated Home Assistant state ticks must not remeasure thousands of unchanged blocks, and
   * neither must the now line's once-a-minute repaint: an update whose only cause was that
   * repaint arrives with no changed properties and no other bare request since the last one.
   * What such a repaint can still change — a block ending or appearing, a banner expiring, a
   * day leaving — adds or removes elements, and the disclosure observer reacts to that on its
   * own (`_reconcileGridStructure`).
   */
  private _gridDisclosureChanged(changedProps: PropertyValues): boolean {
    if (changedProps.size === 0) {
      return this._bareUpdateRequests !== this._bareUpdateRequestsSeen;
    }
    if (changedProps.size !== 1 || !changedProps.has('hass')) return true;
    const previous = changedProps.get('hass') as Types.Hass | undefined;
    if (
      !previous ||
      !this.hass ||
      previous.locale?.language !== this.hass.locale?.language ||
      previous.locale?.time_format !== this.hass.locale?.time_format ||
      previous.locale?.first_weekday !== this.hass.locale?.first_weekday
    ) {
      return true;
    }
    return this.config.entities.some((entry) => {
      const entity = typeof entry === 'string' ? entry : entry.entity;
      const label = typeof entry === 'string' ? undefined : entry.label;
      return (
        previous.states[entity] !== this.hass?.states[entity] ||
        (label?.startsWith('person.') && previous.states[label] !== this.hass?.states[label])
      );
    });
  }

  /**
   * Records a new width and re-renders if it changes the layout.
   *
   * @param widthPx - Measured content width in CSS pixels
   */
  private _handleWidthMeasured(widthPx: number): void {
    // A layout this device picked, or remembers picking, is fitted by the pick rule until a
    // measurement has confirmed it, as `_chooseView` fitted it; the cold entry rule is the
    // configured view's alone. Otherwise the first measurement undoes a pick the switcher
    // granted: a reload at the width it was made at, or a press before the width settled.
    const next =
      this._measuredWidthPx === null && this._viewChoice !== null
        ? ViewConfig.resolveColumnFitIfPicked(this.requestedView, this.config, widthPx)
        : ViewConfig.resolveColumnFitOnMeasurement(
            this.requestedView,
            this.config,
            this._measuredWidthPx,
            widthPx,
            { view: this._effectiveView, columns: this._columnCount },
          );
    // Two things on screen depend on the width without being the dashboard's layout: which
    // views the switcher offers, which can change while the layout does not, and the day
    // columns the configured view is fitted to while it is being edited.
    const offeredBefore = this._offeredViewsKey();
    const shownBefore = this._shownColumnCount;

    this._measuredWidthPx = widthPx;

    if (next.view === this._effectiveView && next.columns === this._columnCount) {
      if (this._offeredViewsKey() !== offeredBefore || this._shownColumnCount !== shownBefore) {
        this.requestUpdate();
      }
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

  /** Resolve language before rendering so the current update uses the new strings. */
  protected willUpdate(changedProps: PropertyValues): void {
    // A modal menu outliving its button would leave the page inert, so it closes before a
    // render that takes the button away: the legend unfolding or going, or editing starting.
    if (Legend.hasOpenLegendMenu(this.renderRoot) && !this._legendMenuMayStayOpen()) {
      Legend.closeLegendMenus(this.renderRoot);
    }

    if (
      changedProps.has('hass') ||
      (changedProps.has('config') && changedProps.get('config')?.language !== this.config.language)
    ) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass?.locale);
    }
  }

  updated(changedProps: PropertyValues) {
    // Editing shows the card as configured: a page the date navigation reached gives way to
    // home, and the controls do nothing until editing ends.
    if (
      (changedProps.has('editMode') || changedProps.has('preview')) &&
      this._isBeingEdited &&
      this._pageRequested !== null
    ) {
      this._requestPage(null);
      this._loadPage();
    }

    // Reconciled after every update rather than acquired once: the view can change after
    // connection — a width fallback or an edit to `view` both flip it — so a timer taken
    // in `connectedCallback` would either never start or never stop.
    this._syncNowLineTimer();
    this._syncMidnightTimer();
    this._syncNowBoundaryTimer();
    // The same gate as the disclosure pass: a hass refresh that changed nothing this card
    // draws re-measures neither, and neither does the now line's repaint. A resize reaches
    // the cascade through the width observer.
    const gridChanged = this._gridDisclosureChanged(changedProps);
    // Read before the passes below run: each can request another update from in here, and
    // that request belongs to the next update, not to this one.
    this._bareUpdateRequestsSeen = this._bareUpdateRequests;
    this._syncGridDisclosureSafety(gridChanged);
    if (gridChanged) {
      this._syncCascadeThreshold();
      this._syncOverflowStrip();
    }

    const hassJustAvailable = changedProps.has('hass') && this.hass && !changedProps.get('hass');

    // Only for a card attached before `hass` existed: its appear load is still waiting.
    // Home Assistant hands over `hass` before it attaches a card, so normally the load in
    // `connectedCallback` has already run — and forcing another fetch here, as this arm
    // once did, threw away the cached events that load had just drawn.
    if (hassJustAvailable && this._appearLoadPending) {
      this.updateEvents('navigate');
    }

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
    //
    // Setup only runs on a microtask (and can be delayed further while a previous
    // subscribe await is still open), so blanking alone is not enough: the still-live
    // callback still holds the previous setup ticket and will write the old forecast
    // back until that ticket moves. Bump and unsubscribe here so the blank sticks.
    if (weatherEntityChanged) {
      this.weatherForecasts = { daily: {}, hourly: {} };
      this._weatherSetupVersion++;
      this._cleanupWeatherSubscriptions();
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
    this._syncTitleScroll();
    this._syncToolbarLabelFit();
    this._syncLegendFit(false);
    Legend.repositionLegendMenus(this.renderRoot);
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

    // Home only, and only with every calendar shown: a card paged to an empty week, or emptied
    // by the legend, that hid itself would take with it the only way back.
    const shouldHide =
      this.config.hide_when_empty === true &&
      this._pageRequested === null &&
      this._pageShown === null &&
      this._activeHiddenCalendars.size === 0 &&
      !this.preview &&
      !this.editMode &&
      !isErrorState &&
      !this._hasFetchError &&
      this.visibleEventCount === 0;

    if (this.hidden === shouldHide) {
      return;
    }

    Logger.debug(`hide_when_empty: ${shouldHide ? 'hiding' : 'revealing'} card`);

    // A menu open over a card about to hide would keep the page inert under nothing visible.
    if (shouldHide) Legend.closeLegendMenus(this.renderRoot);

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

  //-----------------------------------------------------------------------------
  // TITLE SCROLL (scroll_long_titles)
  //-----------------------------------------------------------------------------

  /**
   * Reconciles horizontal title scrolling after every render.
   *
   * Measurement observers rebind as titles change; the visible cohort and native clocks
   * survive those rebinds. A card that never enables the option returns immediately.
   *
   * Shares the detached-card guard the other reconcilers use, and re-measures after a
   * card/title resize, a late font load, or an inherited style or direction change.
   * This `updated()` pass is the backstop after a config or data change. A separate
   * IntersectionObserver pauses the animation while the card is off-screen — these live
   * on 24/7 wall panels.
   */
  private _syncTitleScroll(): void {
    if (!this.isConnected || !this.effectiveConfig.scroll_long_titles) {
      this._stopTitleScrollObserver();
      return;
    }

    const titles = this.renderRoot.querySelectorAll<HTMLElement>('.event-title.title-scrollable');
    this._stopTitleScrollObserver(titles.length === 0);
    if (!titles.length) {
      return;
    }

    if (!this._titleMotion && supportsTitleMotion()) {
      this._titleMotion = new TitleMotionController(this, () => this._scheduleTitleScrollMeasure());
    }
    this._titleMotion?.sync(titles);

    if (typeof ResizeObserver !== 'undefined') {
      this._titleScrollObserver = new ResizeObserver(() => this._scheduleTitleScrollMeasure());
      // The card catches a width change that reflows every title at once; each title catches
      // its own. A transform animation resizes neither, so this cannot re-arm itself.
      this._titleScrollObserver.observe(this);
      titles.forEach((title) => {
        this._titleScrollObserver?.observe(title);
        const summary = title.parentElement;
        if (summary) {
          this._titleScrollObserver?.observe(summary);
          Array.from(summary.children).forEach((label) =>
            this._titleScrollObserver?.observe(label),
          );
        }
      });
    }

    if (!this._titleMotion && typeof IntersectionObserver !== 'undefined') {
      this._titleScrollIntersectionObserver = new IntersectionObserver((entries) => {
        const offscreen = entries.every((entry) => !entry.isIntersecting);
        this.classList.toggle('calendar-card-title-scroll-paused', offscreen);
      });
      this._titleScrollIntersectionObserver.observe(this);
    }

    // A direction change can leave every observed width unchanged.
    if (typeof MutationObserver !== 'undefined') {
      this._titleScrollMutations = new MutationObserver((records) => {
        if (records.some((record) => !isScrollPauseOnlyMutation(record, this))) {
          this._scheduleTitleScrollMeasure();
        }
      });
      this._titleScrollMutations.observe(this.renderRoot, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      observeTypographyAncestors(this._titleScrollMutations, this);
    }

    const fonts = document.fonts;
    if (fonts) {
      // fonts.ready is a Promise removeEventListener cannot cancel, so flag the callback
      // dead in cleanup — the same pattern the disclosure observer uses.
      let active = true;
      const onFonts = (): void => {
        if (active) this._scheduleTitleScrollMeasure();
      };
      void fonts.ready.then(onFonts);
      if (typeof fonts.addEventListener === 'function') {
        fonts.addEventListener('loadingdone', onFonts);
      }
      this._titleScrollFontsCleanup = () => {
        active = false;
        if (typeof fonts.removeEventListener === 'function') {
          fonts.removeEventListener('loadingdone', onFonts);
        }
      };
    }

    this._scheduleTitleScrollMeasure();
  }

  /**
   * Measures on the next frame, so layout has settled and reads are batched.
   */
  private _scheduleTitleScrollMeasure(): void {
    if (this._titleScrollRaf !== null) {
      cancelAnimationFrame(this._titleScrollRaf);
    }
    this._titleScrollRaf = requestAnimationFrame(() => {
      this._titleScrollRaf = null;
      if (!this.isConnected || !this.effectiveConfig.scroll_long_titles) {
        return;
      }
      this._measureTitleScroll();
    });
  }

  /**
   * Toggles the scrolling class per title and publishes the overflow distance and duration.
   *
   * The text's own offsetWidth is unaffected by its animation. The viewport's scrollWidth
   * is not: translated RTL overflow can enlarge it on each measurement. Read all intrinsic
   * extents before changing classes, then travel toward the unread end in the text's direction.
   * Duration keeps a constant speed over the moving part of the cycle, with a short-trip floor.
   */
  private _measureTitleScroll(
    titles: Iterable<HTMLElement> = this.renderRoot.querySelectorAll<HTMLElement>(
      '.event-title.title-scrollable',
    ),
  ): void {
    const current = Array.from(titles);
    GridTitleFit.reserveScrollingLabelWidths(current);
    const candidates = current.flatMap((title) => {
      const fit = title.closest<HTMLElement>('.grid-event')?.dataset.gridTitleFit;
      if (fit === 'compact' || fit === 'blank' || fit === 'measuring') return [];
      const content = title.querySelector<HTMLElement>('.event-title-scroll');
      return content ? [{ title, content }] : [];
    });
    // WebKit rounds an inline fragment's offsetWidth differently from an inline-block.
    // Measure pending text in the same local-pixel box it will move in, then restore its
    // static ellipsis before paint. Otherwise an unchanged tick withdraws a reader over
    // a one-pixel measurement-only change. Existing moving effects never change display.
    const inline = this._titleMotion?.enhanced
      ? candidates
          .filter(({ content }) => getComputedStyle(content).display === 'inline')
          .map(({ content }) => ({
            content,
            display: content.style.getPropertyValue('display'),
            priority: content.style.getPropertyPriority('display'),
          }))
      : [];
    for (const { content } of inline) {
      content.style.setProperty('display', 'inline-block', 'important');
    }
    let measurements: TitleScrollMeasurement[];
    try {
      measurements = candidates.map(({ title, content }) => {
        const style = getComputedStyle(title);
        return {
          title,
          content,
          distance: content.offsetWidth - title.clientWidth,
          direction: style.direction === 'rtl' ? 1 : -1,
          signature: JSON.stringify([
            content.textContent,
            style.font,
            style.letterSpacing,
            style.wordSpacing,
            style.textTransform,
          ]),
        };
      });
    } finally {
      for (const { content, display, priority } of inline) {
        if (display) content.style.setProperty('display', display, priority);
        else content.style.removeProperty('display');
      }
    }
    measurements.forEach(({ title, distance, direction }) => {
      if (
        distance > Constants.TITLE_SCROLL.MIN_OVERFLOW_PX &&
        !title.classList.contains('empty-day-title')
      ) {
        const seconds = Math.max(
          Constants.TITLE_SCROLL.MIN_DURATION_S,
          distance /
            (Constants.TITLE_SCROLL.SPEED_PX_PER_S * Constants.TITLE_SCROLL.TRAVEL_FRACTION),
        );
        title.style.setProperty('--calendar-card-title-scroll-distance', `${distance}px`);
        title.style.setProperty('--calendar-card-title-scroll-direction', String(direction));
        title.style.setProperty('--calendar-card-title-scroll-duration', `${seconds.toFixed(2)}s`);
        title.classList.add('title-overflowing');
      } else {
        title.classList.remove('title-overflowing');
        title.style.removeProperty('--calendar-card-title-scroll-distance');
        title.style.removeProperty('--calendar-card-title-scroll-direction');
        title.style.removeProperty('--calendar-card-title-scroll-duration');
      }
    });
    this._titleMotion?.measure(measurements);
  }

  /**
   * Tears down the title-scroll observers, cancels pending work, and clears the pause class.
   *
   * @param clearPause - Keep false during active rebinding so offscreen titles stay paused
   */
  private _stopTitleScrollObserver(clearPause = true): void {
    this._titleScrollObserver?.disconnect();
    this._titleScrollObserver = null;

    this._titleScrollIntersectionObserver?.disconnect();
    this._titleScrollIntersectionObserver = null;

    this._titleScrollMutations?.disconnect();
    this._titleScrollMutations = null;

    this._titleScrollFontsCleanup?.();
    this._titleScrollFontsCleanup = null;

    if (this._titleScrollRaf !== null) {
      cancelAnimationFrame(this._titleScrollRaf);
      this._titleScrollRaf = null;
    }

    if (clearPause) {
      this._titleMotion?.dispose();
      this._titleMotion = null;
      this.renderRoot.querySelectorAll('[data-scroll-labels]').forEach((summary) => {
        summary.removeAttribute('data-scroll-labels');
      });
      this.classList.remove('calendar-card-title-scroll-paused');
    }
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
    this._syncNowBoundaryTimer();

    if (document.visibilityState === 'visible') {
      // A boundary may have passed while the tab was hidden and its timer stopped.
      if (this._wantsNowLine || this._wantsNowBoundary) {
        this.requestUpdate();
      }

      const now = Date.now();
      if (now - this._lastUpdateTime > Constants.TIMING.VISIBILITY_REFRESH_THRESHOLD) {
        Logger.debug('Visibility changed to visible, updating events');
        this.updateEvents('cache');
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
   * matches its neighbors.
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
   * Arm the refresh timer one interval from now.
   *
   * Provisional: called on connect, before any data has landed. Every load re-arms it
   * through `_scheduleRefresh` for the deadline of the data it actually committed.
   */
  private startRefreshTimer() {
    this._scheduleRefresh(Date.now() + this._refreshIntervalMs());
  }

  /**
   * Arm the refresh timer for a deadline.
   *
   * The deadline comes from the data, never from when the timer happens to be armed.
   * Arming one interval from "now" — before the fetch it accompanied had written the
   * cache — is what made every other tick find the cache a few milliseconds too young to
   * refetch, so the card refreshed at twice its configured interval.
   *
   * The tick runs a `cache` load. If another card sharing the calendars refreshed them in
   * the meantime, that load reuses their data and re-arms from its timestamp; a tick that
   * fires a little early by the wall clock just re-arms for the remainder.
   *
   * 🚨 Guarded on `isConnected` for the same reason as `_syncNowLineTimer`: a load can
   * finish after the card left the DOM, and must not re-arm a periodic `updateEvents`
   * loop on a detached element. `connectedCallback` starts the timer once the card is
   * live again.
   *
   * @param at Epoch milliseconds at which to refresh
   */
  private _scheduleRefresh(at: number): void {
    if (this._refreshTimerId) {
      clearTimeout(this._refreshTimerId);
      this._refreshTimerId = undefined;
    }

    if (!this.isConnected) {
      return;
    }

    // `setTimeout` treats anything beyond 2^31 - 1 ms as zero, which would refresh in a loop.
    const delay = Math.min(
      Math.max(at - Date.now(), Constants.TIMING.REFRESH_MIN_DELAY),
      2 ** 31 - 1,
    );

    this._refreshTimerId = window.setTimeout(() => {
      this._refreshTimerId = undefined;
      this.updateEvents('cache');
    }, delay);

    Logger.debug(`Scheduled next refresh in ${Math.round(delay / 1000)}s`);
  }

  /**
   * The configured refresh interval in milliseconds.
   *
   * @returns Interval in milliseconds
   */
  private _refreshIntervalMs(): number {
    return EventUtils.getCacheDuration(this.config);
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
   * Only the primary button and primary contact can start a card gesture, and
   * one already-active pointer keeps ownership until up/cancel. A right-click
   * still delivers `pointerdown` with `button === 2`; a second touch arrives
   * with `isPrimary === false`. Accepting either armed or transferred the hold
   * to an input that was not the gesture the user began. Touch and pen primary
   * contacts report `button === 0`; unit stubs may omit either field.
   *
   * This is also the one moment the tapped event is known. The capture below retargets
   * every later event of the gesture, the click included, to `ha-card`, so the event the
   * pointer landed on is read from this pointer-down's path and held until pointer-up. A
   * card with no action of its own arms only for a pointer that landed on an event, so
   * turning event taps on changes nothing about a press anywhere else.
   */
  private _handlePointerDown(ev: PointerEvent) {
    if (typeof ev.button === 'number' && ev.button !== 0) {
      return;
    }
    const tapTarget = this._eventTapAt(ev);
    if (!this._hasCardAction && !tapTarget) {
      return;
    }
    if (ev.isPrimary === false || this._activePointerId !== null) {
      return;
    }

    this._activePointerId = ev.pointerId;
    this._pointerStart = { x: ev.clientX, y: ev.clientY };
    this._pointerMoved = false;
    this._holdTriggered = false;
    this._pointerTapTarget = tapTarget ?? null;
    // A new gesture: whatever click the last one owed has had its chance.
    this._derivedClick = null;
    this._captureActivePointer(ev);

    // Defensive cleanup for an indicator left by an externally interrupted prior
    // gesture. Ordinary multi-touch never reaches here: the active/primary guard above
    // keeps the first contact's indicator and ownership intact.
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

    // A hold is the card's wherever it lands, an event included; only a tap is the event's.
    const tapTarget = this._pointerTapTarget;
    let ranCardTap = false;
    if (
      !this._pointerMoved &&
      this._holdTriggered &&
      this.config.hold_action &&
      this.config.hold_action.action !== 'none'
    ) {
      Logger.debug('Executing hold action');
      Actions.handleAction(this, this.config, 'hold', this._cardActionCallbacks);
    } else if (!this._pointerMoved && !this._holdTriggered && tapTarget) {
      this._runEventTapAction(tapTarget.target);
    } else if (
      !this._pointerMoved &&
      !this._holdTriggered &&
      this.config.tap_action &&
      this.config.tap_action.action !== 'none'
    ) {
      Logger.debug('Executing tap action');
      Actions.handleAction(this, this.config, 'tap', this._cardActionCallbacks);
      ranCardTap = true;
    }

    // The click a browser derives from this gesture is not a second activation. Guarded for
    // the event the gesture began on, whatever it was, or for no event after a tap on the
    // card; a gesture that ran nothing and began off the events owes nothing that could
    // act. See `_derivedClick`.
    const owedBy = tapTarget ? tapTarget.element : ranCardTap ? null : undefined;
    this._derivedClick =
      owedBy === undefined
        ? null
        : { element: owedBy, deadline: Date.now() + Constants.TIMING.DERIVED_CLICK_WINDOW };

    this._endGesture();
  }

  /**
   * Handle pointer cancel events to clean up an aborted gesture
   */
  private _handlePointerCancel(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) {
      return;
    }

    this._endGesture();
  }

  /**
   * Forget the active gesture: its hold timer, its pointer capture, its bookkeeping and its
   * hold indicator.
   *
   * Leaves `_derivedClick` alone, which outlives the gesture on purpose: pointer-up sets it
   * just before calling this, for the click that follows.
   */
  private _endGesture(): void {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    this._releaseActivePointerCapture();
    this._activePointerId = null;
    this._pointerStart = null;
    this._pointerMoved = false;
    this._holdTriggered = false;
    this._pointerTapTarget = null;

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
    if (this._handleEventKeyDown(ev)) return;
    if (ev.currentTarget != null && ev.target !== ev.currentTarget) return;

    if (ev.key === 'Enter' || ev.key === ' ') {
      // Match pointer-up: default and explicit `tap_action: none` must not activate.
      if (!this.config.tap_action || this.config.tap_action.action === 'none') {
        return;
      }
      ev.preventDefault();
      Actions.handleAction(this, this.config, 'tap', this._cardActionCallbacks);
    }
  }

  /**
   * Enter and Space on a focused event, taken as a native button takes them: Enter on its
   * keydown, Space on its keyup, and only if focus is still on the event Space went down
   * on. Neither repeats while the key is held, and Space never scrolls the card.
   *
   * Only when the event itself is the key's target. An event has no focusable content, so
   * anything else holding focus inside the card is not an event and keeps its keys.
   *
   * @param ev - A keydown bubbling to `ha-card`
   * @returns True when the key was the focused event's, and was consumed
   */
  private _handleEventKeyDown(ev: KeyboardEvent): boolean {
    if (ev.key !== 'Enter' && ev.key !== ' ') return false;
    const target = this._eventsActivatable ? Activation.tapTargetOn(ev.target) : undefined;
    if (!target) return false;

    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return true;

    if (ev.key === 'Enter') {
      this._runEventTapAction(target);
    } else {
      this._spaceArmedOn = ev.target;
    }
    return true;
  }

  /**
   * Space's keyup on the event its keydown armed activates it.
   *
   * @param ev - A keyup bubbling to `ha-card`
   */
  private _handleKeyUp(ev: KeyboardEvent) {
    if (ev.key !== ' ') return;
    const armed = this._spaceArmedOn;
    this._spaceArmedOn = null;

    const target = this._eventsActivatable ? Activation.tapTargetOn(ev.target) : undefined;
    if (!target || armed === null || armed !== ev.target) return;

    ev.preventDefault();
    ev.stopPropagation();
    this._runEventTapAction(target);
  }

  /**
   * A click on an event: assistive technology's way of activating it, or the echo of a
   * pointer gesture the pointer-up already decided.
   *
   * Assistive technology activates a `role="button"` with a bare `click` and no pointer
   * events, so a click that names an event runs `event_tap_action` for it. Unless it is the
   * click the pointer gesture that just ended owes, which names that gesture's event or no
   * event at all; see `_derivedClick`. A click naming another event is not that click: it
   * acts, and leaves the guard for the one still owed. Either way a click the event owns
   * stops here, as a click on a native button would be the button's and not its container's.
   *
   * @param ev - A click bubbling to `ha-card`
   */
  private _handleClick(ev: MouseEvent) {
    const hit = this._eventTapAt(ev);
    const owed = this._derivedClick;
    if (owed && Date.now() > owed.deadline) this._derivedClick = null;

    const element = hit ? hit.element : null;
    if (this._derivedClick && (element === null || element === this._derivedClick.element)) {
      this._derivedClick = null;
      if (hit) ev.stopPropagation();
      return;
    }

    if (!hit) return;
    ev.stopPropagation();
    this._runEventTapAction(hit.target);
  }

  //-----------------------------------------------------------------------------
  // PUBLIC METHODS
  //-----------------------------------------------------------------------------

  /**
   * Handle configuration updates from Home Assistant
   */
  setConfig(config: Partial<Types.Config>): void {
    const previousConfig = this.config;
    const previousInstanceId = this._instanceId;

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
    // Reported here, on the value as written, because normalizing is what replaces it.
    Config.validateFoldedLengths(this.config);
    Config.normalizeLengthOptions(this.config);
    ViewConfig.validateView(this.config);
    ViewConfig.validateColumnOverrides(this.config);
    if (this.config.time_grid) {
      const start = ViewConfig.resolveTimeGridOption(this.config, 'start_time');
      const end = ViewConfig.resolveTimeGridOption(this.config, 'end_time');
      if (GridUtils.resolveBand(start, end).usedFallback) {
        Logger.warn(
          `Invalid time_grid time range "${start} - ${end}": expected HH:mm bounds with the end after the start ` +
            `(24:00 is allowed for the end). Falling back to ${GridUtils.DEFAULT_BAND_START}-${GridUtils.DEFAULT_BAND_END}.`,
        );
      }
      // Read raw rather than through `resolveTimeGridOption`, which returns the value
      // already folded — the point of the message is to name what was written.
      const axisWidth = this.config.time_grid.axis_width;
      if (axisWidth !== undefined && ViewConfig.normalizeAxisWidth(axisWidth).usedFallback) {
        Logger.warn(
          `Invalid time_grid axis_width "${axisWidth}": expected a pixel length such as "128px", or "max-content". ` +
            `Other CSS lengths cannot be reserved before the grid is laid out, so the day columns would be ` +
            `fitted against the wrong axis width. Falling back to "max-content".`,
        );
      }
    }

    // Column fitting is hysteretic: it holds the current answer inside a band so
    // the layout does not oscillate. Discarding that state on every setConfig()
    // re-fit the card from scratch, so an edit unrelated to layout could drop a
    // measured column card back to the list view at an unchanged width and leave
    // it there until the next resize. Only seed from a fit that a real
    // measurement produced — the optimistic pre-measurement answer must not.
    const replaced = this._syncDeviceChoice(config);
    // Any other configuration starts at home, as a reload does. The days on screen stay until
    // home's events are committed, so nothing is drawn under the wrong dates meanwhile.
    const leftPage = replaced && this._pageRequested !== null;
    if (leftPage) this._requestPage(null);
    const seededFit = ViewConfig.resolveColumnFit(
      this.requestedView,
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

    if (this._instanceId !== previousInstanceId) {
      // Failures belong to the query that produced them. Carrying them over would name a
      // calendar this card no longer shows, or start the new query mid-backoff.
      this._setFailures([]);
      this._failureCountHint = 0;
    }

    const configChanged = Config.hasConfigChanged(previousConfig, this.config);
    if (configChanged) {
      Logger.debug('Configuration changed, refreshing data');
      // A card configured after it was attached has not had its appear load yet, so it
      // still gets to draw from the cache first.
      this.updateEvents(this._appearLoadPending ? 'navigate' : 'network');
    } else if (Config.hasEntityProcessingChanged(previousConfig, this.config)) {
      // A per-calendar edit that left every entity ID alone. The API request is
      // unchanged, but the decoration derived from it — label, color, filters — is
      // stamped onto each event at fetch time and shadows the live config, so the
      // cached payload has to be run through processing again. `reprocess` never goes
      // to the network for it; without that a color tweak in the editor would either
      // appear to do nothing or, against a calendar that is failing, cost a fetch per
      // keystroke.
      Logger.debug('Per-calendar configuration changed, reprocessing cached data');
      this.updateEvents('reprocess');
    } else if (leftPage) {
      this._loadPage();
    }
  }

  /**
   * Adopts what this device remembers for a newly set configuration: the view its switcher
   * picked, and the calendars its legend hides.
   *
   * Each half is read for itself, the view only while the switcher is on and the hidden
   * calendars only while the legend is, so a card with a legend and no switcher remembers
   * too. A different fingerprint is a different configuration, which is what resets every
   * device to `view`, and to every calendar shown, after an edit. Nothing is deleted here:
   * Home Assistant builds a fresh card for a changed configuration rather than handing it to
   * the old one, so a card almost never learns which configuration it replaced. The cost is
   * narrow and stated in the docs: a configuration changed back to exactly what it was finds
   * the choice made for it again.
   *
   * @param rawConfig - Configuration exactly as Home Assistant passed it
   * @returns True when the configuration is a different one from the last
   */
  private _syncDeviceChoice(rawConfig: unknown): boolean {
    const fingerprint = ViewChoice.configFingerprint(rawConfig);
    if (fingerprint === this._configFingerprint) return false;

    this._configFingerprint = fingerprint;
    const remembered = this._wantsViewSwitcher ? ViewChoice.readViewChoice(fingerprint) : undefined;
    this._viewChoice =
      remembered !== undefined && remembered !== this.config.view ? remembered : null;

    const calendars = new Set(Legend.legendCalendarIds(this.config.entities));
    const hidden = this._wantsLegend
      ? ViewChoice.readHiddenCalendars(fingerprint).filter((id) => calendars.has(id))
      : [];
    this._hiddenCalendars = hidden.length > 0 ? new Set(hidden) : NO_HIDDEN_CALENDARS;
    this._legendFold = null;
    return true;
  }

  /**
   * Fetch fresh events now, ignoring the cache and any request that may have started before
   * a calendar changed.
   *
   * For the moment after a calendar was written to: a request that started before the
   * change may already be carrying the old answer, so this one never joins it, and only the
   * newest response may write the cache. Called with no argument it joins no request at all.
   * Given a write's generation (`EventUtils.advanceWriteGeneration`), it joins a request
   * started since that write, which is how every card refreshing for one write shares one
   * request per calendar set and window.
   *
   * @param afterWrite - The generation of the write this refresh is for
   * @returns Resolves once the new events are committed
   */
  refreshEvents(afterWrite?: number): Promise<void> {
    return this.updateEvents('reload', afterWrite);
  }

  /**
   * Update calendar events from API or cache. Simplified for card-mod compatibility.
   *
   * | Mode        | Draws the cache                | Asks Home Assistant when                       |
   * | ----------- | ------------------------------ | ---------------------------------------------- |
   * | `navigate`  | anything up to 24 h old, first | nothing cached, cache due, or `refresh_on_navigate` and ≥ 5 s old |
   * | `page`      | anything up to 24 h old, first | nothing cached, or cache due                   |
   * | `cache`     | only if not due                | nothing fresh is cached                        |
   * | `reprocess` | anything up to 24 h old        | nothing is cached at all                       |
   * | `network`   | no                             | always, joining a matching request under way   |
   * | `reload`    | no                             | always, never joining a request from before a write |
   *
   * Every mode but `reload` joins a matching request already in flight rather than
   * stopping at the cache. A later call supersedes an earlier one, so a cache read that
   * stopped there would discard a fetch another call had just started. A `reload` given a
   * write's generation joins only a request started since that write; without one it joins
   * none (see `refreshEvents`).
   *
   * A boolean is still accepted: `true` is `network`, `false` is `cache`.
   *
   * Every mode loads the page the date navigation asks for (`_pageRequested`): home from
   * `localStorage`, any other page from the in-memory page store, so paging leaves nothing
   * behind in a store shared with Home Assistant.
   *
   * @param mode How to use the cache and the network
   * @param afterWrite For `reload`, the generation of the write it refreshes for
   */
  async updateEvents(mode: LoadMode | boolean = 'cache', afterWrite?: number): Promise<void> {
    const load: LoadMode = mode === true ? 'network' : mode === false ? 'cache' : mode;
    Logger.debug(`Updating events (${load})`);

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
    // retry has nothing left to do, and it would fire 1.5 seconds after the card has
    // already rendered.
    if (this.safeHass && this._initialLoadRetryId) {
      clearTimeout(this._initialLoadRetryId);
      this._initialLoadRetryId = undefined;
    }

    const hass = this.safeHass;
    if (!hass || !this.config.entities.length) {
      this.isLoading = false;
      if (!hass) {
        if (this._initialLoadRetryId) {
          clearTimeout(this._initialLoadRetryId);
        }
        this._initialLoadRetryId = window.setTimeout(() => {
          this.updateEvents(load, afterWrite);
        }, 1500);
      } else {
        // Nothing to load, and so nothing failing either.
        this._setFailures([]);
        this.isInitialLoad = false;
      }
      return;
    }

    const isAppearLoad = load === 'navigate';
    this._appearLoadPending = false;

    const page = this._pageRequested;
    const config = this._configForPage(page);
    const instanceId = this._instanceIdForPage(page);
    const store: EventUtils.CacheStore = page === null ? 'persistent' : 'page';
    const usesCache = load !== 'network' && load !== 'reload';

    // Read synchronously, before any await, so a card attached with data on disk draws
    // it on its very first render.
    let snapshot: Types.EventSnapshot | null = null;
    if (usesCache) {
      try {
        snapshot = EventUtils.readEventSnapshot(hass, config, instanceId, store);
      } catch (error) {
        Logger.warn('Could not read cached events:', error);
      }
    }

    const draws =
      snapshot !== null &&
      (load === 'navigate' || load === 'page' || load === 'reprocess' || !snapshot.due);

    if (draws && snapshot) {
      Logger.info(`Drawing ${snapshot.events.length} cached events`);
      this._commitEvents(snapshot, instanceId, page);
    } else if (isAppearLoad && this.events.length > 0 && !this._residentEventsDrawable()) {
      // The element itself still holds events from before it was detached. With nothing
      // cached to replace them, they would be drawn under a config they were not fetched
      // for, or beyond the 24-hour bound, until the fetch lands.
      this.events = [];
      this._eventsInstanceId = '';
      this._setFailures([]);
      this.isInitialLoad = true;
    }

    const ageMs = snapshot ? Date.now() - snapshot.fetchedAt : Infinity;
    const needsNetwork =
      !snapshot ||
      snapshot.inFlight ||
      (load !== 'reprocess' && snapshot.due) ||
      (isAppearLoad &&
        config.refresh_on_navigate === true &&
        snapshot.failedEntities.length === 0 &&
        ageMs >= Constants.CACHE.NAVIGATION_REFETCH_MIN_AGE_SECONDS * 1000);

    if (!needsNetwork && snapshot) {
      this.isLoading = false;
      this._scheduleRefresh(snapshot.nextAttemptAt);
      return;
    }

    try {
      this.isLoading = true;
      await this.updateComplete;

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event request');
        return;
      }

      const result = await EventUtils.fetchEventData(
        hass,
        config,
        instanceId,
        load === 'reload' ? 'reload' : 'network',
        this._failureCountHint,
        afterWrite,
        store,
      );

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event response');
        return;
      }

      const failedEntities = result.failedEntities ?? [];
      if (failedEntities.length > 0) {
        Logger.warn(`Could not load calendar(s): ${failedEntities.join(', ')}`);
      }
      this._failureCountHint = failedEntities.length > 0 ? this._failureCountHint + 1 : 0;

      const eventsMatchCurrentQuery = this._eventsInstanceId === instanceId;
      const maxStaleMs = Constants.CACHE.MAX_STALE_HOURS * 60 * 60 * 1000;
      // The cache normally carries a failing calendar's last events forward itself. This
      // covers the case where it cannot — storage unavailable — within the same bound.
      const keepPreviousEvents =
        failedEntities.length > 0 &&
        result.events.length === 0 &&
        this.events.length > 0 &&
        eventsMatchCurrentQuery &&
        Date.now() - this._eventsFetchedAt < maxStaleMs;

      if (keepPreviousEvents) {
        Logger.warn('Refresh failed and returned nothing — keeping previously loaded events');
        this._setFailures(failedEntities);
        this.isInitialLoad = false;
      } else {
        this._commitEvents(result, instanceId, page);
      }

      this.isLoading = false;
      this._scheduleRefresh(result.nextAttemptAt ?? Date.now() + this._refreshIntervalMs());

      if (failedEntities.length === 0) {
        Logger.info('Event update completed successfully');
      }
    } catch (error) {
      if (isSuperseded()) {
        Logger.debug('Ignoring a failure from a superseded event request');
        return;
      }
      Logger.error('Failed to update events:', error);
      this._failureCountHint += 1;
      this._setFailures(
        Array.from(
          new Set(
            config.entities.map((entity) => (typeof entity === 'string' ? entity : entity.entity)),
          ),
        ),
      );
      this.isLoading = false;
      this.isInitialLoad = false;
      this._scheduleRefresh(
        Date.now() +
          Math.min(
            Constants.CACHE.RETRY_INITIAL_SECONDS *
              1000 *
              2 ** Math.min(this._failureCountHint - 1, 20),
            this._refreshIntervalMs(),
          ),
      );
    }
  }

  /**
   * Put a loaded set of events on the card.
   *
   * @param result Events and what is known about them
   * @param instanceId Query identity the events were loaded for
   * @param page The page they belong to, null for home; it becomes the page on screen
   */
  private _commitEvents(
    result: Types.EventFetchResult,
    instanceId: string,
    page: string | null,
  ): void {
    const failedEntities = result.failedEntities ?? [];

    this.events = [...(result.events ?? [])];
    this._eventsInstanceId = instanceId;
    this._pageShown = page;
    this._eventsFetchedAt = result.loadedAt ?? result.fetchedAt ?? Date.now();
    this._setFailures(failedEntities);
    this.isInitialLoad = false;

    if (failedEntities.length === 0) {
      this._lastUpdateTime = Date.now();
      // Healthy data, from the network or from another card's cache entry, ends whatever
      // run of failures this card had counted.
      this._failureCountHint = 0;
    }
  }

  /**
   * Record which calendars failed, and whether anything failed at all.
   *
   * @param failedEntities Calendar entity ids that could not be loaded
   */
  private _setFailures(failedEntities: string[]): void {
    const changed =
      failedEntities.length !== this._failedEntities.length ||
      failedEntities.some((id, i) => id !== this._failedEntities[i]);

    this._failedEntities = [...failedEntities];
    this._hasFetchError = failedEntities.length > 0;

    if (changed) {
      this.requestUpdate();
    }
  }

  /**
   * Whether the events the element already holds may still be drawn for the current
   * config.
   *
   * @returns True when they belong to the current query and are within the 24-hour bound
   */
  private _residentEventsDrawable(): boolean {
    // Events nothing on this card loaded carry no query to compare, so they are left alone.
    if (this._eventsInstanceId === '') return true;

    const maxStaleMs = Constants.CACHE.MAX_STALE_HOURS * 60 * 60 * 1000;
    return (
      this._eventsInstanceId === this._instanceIdForPage(this._pageRequested) &&
      Date.now() - this._eventsFetchedAt < maxStaleMs
    );
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

    const config = this.effectiveConfig;
    if (isLimit(config.compact_events_to_show) || isLimit(config.compact_days_to_show)) {
      return true;
    }

    return (config.entities ?? []).some(
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
    Actions.handleAction(this, this.config, action, this._cardActionCallbacks);
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
      keyUp: (ev: KeyboardEvent) => this._handleKeyUp(ev),
      click: (ev: MouseEvent) => this._handleClick(ev),
      pointerDown: (ev: PointerEvent) => this._handlePointerDown(ev),
      pointerMove: (ev: PointerEvent) => this._handlePointerMove(ev),
      pointerUp: (ev: PointerEvent) => this._handlePointerUp(ev),
      pointerCancel: (ev: PointerEvent) => this._handlePointerCancel(ev),
      pointerLeave: (ev: PointerEvent) => this._handlePointerLeave(ev),
      lostPointerCapture: (ev: PointerEvent) => this._handleLostPointerCapture(ev),
    };

    let content: TemplateResult;
    // Whether the content holds at least one event that is a tap target. Not while loading,
    // and not for an error or for days holding nothing but empty-day placeholders.
    let drawsEventTarget = false;

    // Only when the width sheds columns; see `visibleDayWindowStart` for which ones stay.
    // With the date navigation the days are the page's, by date: the page the range names and
    // the arrows step by is a run of calendar days, and where empty days are not drawn, a slice
    // by index would hold other days than those.
    const visibleDays = (days: Types.EventsByDay[]): Types.EventsByDay[] => {
      const count = this._shownColumnCount;
      if (this._wantsNavigation && count > 0 && count < this.config.days_to_show) {
        const page = this._pageRange(this._pageShown);
        const from = page.start.getTime();
        const until = Paging.addDays(page.start, page.days).getTime();
        return days.filter((day) => day.timestamp >= from && day.timestamp < until);
      }
      if (count <= 0 || count >= days.length) {
        return days;
      }
      const start = ViewConfig.visibleDayWindowStart(days, count, new Date());
      return days.slice(start, start + count);
    };

    // The days a view draws: column and grid shed days to fit the width, list never does.
    const shownDays = (days: Types.EventsByDay[]): Types.EventsByDay[] =>
      this.effectiveView === 'list' ? days : visibleDays(days);

    const renderDays = (days: Types.EventsByDay[]): TemplateResult => {
      if (this.effectiveView === 'grid') {
        return Render.renderGridGroupedEvents(
          days,
          this.effectiveConfig,
          this.effectiveLanguage,
          this.weatherForecasts,
          this.safeHass,
          undefined,
          this._cascadeThresholdMin,
          this._overflowStripPct,
          this._eventsActivatable,
        );
      }

      return this.effectiveView === 'column'
        ? Render.renderColumnGroupedEvents(
            days,
            this.effectiveConfig,
            this.effectiveLanguage,
            this.weatherForecasts,
            this.safeHass,
            this._eventsActivatable,
          )
        : Render.renderGroupedEvents(
            days,
            this.effectiveConfig,
            this.effectiveLanguage,
            this.weatherForecasts,
            this.safeHass,
            this._eventsActivatable,
          );
    };

    if (this.isInitialLoad) {
      content = Render.renderCardContent('loading', this.effectiveLanguage);
    } else if (!this.safeHass || !this.config.entities.length) {
      content = Render.renderCardContent('error', this.effectiveLanguage);
    } else if (this.events.length === 0 && this._hasFetchError) {
      // Nothing loaded and nothing kept: the notice below names what failed, and an empty
      // calendar here would claim there was nothing to show.
      content = html``;
    } else {
      // No separate empty-events branch: `groupedEvents` groups `this.events`, which is
      // already the empty array in that case, with exactly the arguments a dedicated
      // branch would pass. Column and grid views both default `show_empty_days` on, so
      // an eventless card still fills from here — with empty day columns in column view
      // and a full empty time axis in grid.
      const days = shownDays(this.groupedEvents);
      content = renderDays(days);
      drawsEventTarget =
        this._eventsActivatable &&
        Render.drawsEvent(this.effectiveView, days, this.effectiveConfig);
    }

    const toolbar = this._headerToolbar();

    return Render.renderMainCardStructure(
      customStyles,
      this.effectiveTitle,
      content,
      handlers,
      this.isLoading,
      this.isTitlePending,
      this.effectiveView,
      this._hasTapAction,
      this._hasHoldAction,
      this._renderFetchErrorNotice(),
      toolbar,
      this._hostsControls(toolbar, drawsEventTarget),
      this._pageRequested !== this._pageShown && !this.isInitialLoad,
    );
  }

  /**
   * The controls this render draws in the header toolbar, and whether they carry labels.
   *
   * @returns The toolbar; with no control in it, no toolbar is drawn
   */
  private _headerToolbar(): Toolbar.HeaderToolbar {
    const controls: ToolbarControls = {
      navigation: this._dateNavigation(),
      legend: this._legend(),
      viewSwitcher: this._viewSwitcher(),
      refresh: this._refreshButton(),
      addEvent: this._addEventButton(),
    };
    this._toolbarLabelMinWidthPx = this._toolbarLabelMinWidth(controls);

    return { labeled: this._toolbarLabeledFor(controls), ...controls };
  }

  /**
   * Whether the toolbar's controls carry text labels beside their icons.
   *
   * All or nothing, so the controls stay one family: the bar is labeled only when it is wide
   * enough for every control it draws, and only when every one of them has a label to show.
   * Home Assistant may have no words for the add button, refresh or the folded legend, which
   * then stays an icon, and so does everything beside it.
   *
   * `toolbar.labels: false` keeps every control an icon at any width. With the date
   * navigation in the band, labels need the room for it as well, and are drawn only while the
   * whole band fits on one row (`_syncToolbarLabelFit`).
   *
   * @param controls - The controls this render draws
   * @returns True to draw labels
   */
  private _toolbarLabeledFor(controls: ToolbarControls): boolean {
    const minWidth = this._toolbarLabelMinWidth(controls);
    if (this._toolbarWidthPx === null || minWidth === null) return false;
    if (!Config.resolveToolbar(this.config).labels) return false;

    const overflowed = this._toolbarLabelsOverflowed;
    const signature = this._toolbarLabelSignature(controls);
    if (
      overflowed &&
      overflowed.signature === signature &&
      this._toolbarWidthPx <= overflowed.widthPx
    ) {
      return false;
    }

    return this._toolbarWidthPx >= minWidth;
  }

  /**
   * The card width from which the toolbar's controls carry labels, or null when they never do.
   *
   * The fixed thresholds each allow for one command beside the switcher and the dates, the add
   * button they were measured with; every further one, refresh or the folded legend, needs
   * `UI.TOOLBAR_EXTRA_LABEL_MIN_WIDTH` more. Null when there is nothing to label, the date
   * navigation carrying none, or a control has no words to show.
   *
   * @param controls - The controls this render draws
   * @returns A width in CSS pixels, or null
   */
  private _toolbarLabelMinWidth(controls: ToolbarControls): number | null {
    const legendButton = controls.legend?.folded ? controls.legend : undefined;
    const commands = [controls.addEvent, controls.refresh, legendButton].filter(
      (control) => control !== undefined,
    ).length;
    if (commands === 0 && !controls.viewSwitcher) return null;
    if (controls.addEvent && controls.addEvent.label === undefined) return null;
    if (controls.refresh && controls.refresh.label === undefined) return null;
    if (legendButton && legendButton.name === undefined) return null;

    const base = controls.navigation
      ? controls.viewSwitcher
        ? Constants.UI.TOOLBAR_BAND_SWITCHER_LABEL_MIN_WIDTH
        : Constants.UI.TOOLBAR_BAND_LABEL_MIN_WIDTH
      : controls.viewSwitcher
        ? Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH
        : Constants.UI.TOOLBAR_LABEL_MIN_WIDTH;
    return base + Math.max(0, commands - 1) * Constants.UI.TOOLBAR_EXTRA_LABEL_MIN_WIDTH;
  }

  /**
   * What the labeled toolbar's fit beside the title depends on, other than the width.
   *
   * @param controls - The controls this render draws
   * @returns A string that changes whenever the labeled bar or the title beside it would
   */
  private _toolbarLabelSignature(controls: ToolbarControls): string {
    return [
      this.effectiveTitle ?? '',
      this.effectiveLanguage,
      controls.addEvent?.label ?? '',
      controls.viewSwitcher ? 'views' : '',
      controls.refresh?.label ?? '',
      controls.legend?.folded ? (controls.legend.name ?? '') : '',
      // The range's reserved width, not its words: the widest label changes with the language
      // and the page length, and the dates on screen never decide the layout.
      controls.navigation?.widestRange ?? '',
    ].join('\u0000');
  }

  /**
   * Drops the toolbar's labels when the title leaves them no room.
   *
   * The width thresholds assume a title of a word or two. A longer single word cannot wrap,
   * so beside the labeled controls it pushes them past the card's edge, where the card
   * clips them. Read after the render that drew them: if the labeled bar overflows the
   * header, the card remembers the width, and draws icons until it is wider than that, or
   * the title, the language or the controls change. Never the other way round, so a
   * measurement cannot set the card flipping between the two.
   *
   * Only ever reads layout that exists. Without it — a card not laid out yet, or a test
   * environment with no layout engine — every box is empty, and nothing is concluded.
   */
  private _syncToolbarLabelFit(): void {
    const header = this.renderRoot.querySelector<HTMLElement>('.header-container.has-toolbar');
    const toolbar = header?.querySelector<HTMLElement>('.card-toolbar');
    if (!header || !toolbar || !toolbar.querySelector('.toolbar-button-label')) return;

    const headerRect = header.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    if (headerRect.width === 0 || toolbarRect.width === 0) return;

    const overflows =
      toolbarRect.right > headerRect.right + 0.5 || toolbarRect.left < headerRect.left - 0.5;
    // In the band, labels are for a band that fits on one row: a labeled trailing group that
    // wrapped under the dates costs a row the icons would not.
    const leading = toolbar.querySelector<HTMLElement>('.toolbar-leading');
    const trailing = toolbar.querySelector<HTMLElement>('.toolbar-trailing');
    const wraps =
      leading !== null &&
      trailing !== null &&
      trailing.getBoundingClientRect().top > leading.getBoundingClientRect().bottom - 0.5;
    if (!overflows && !wraps) return;

    Logger.debug(`Toolbar labels do not fit at ${this._toolbarWidthPx}px`);
    this._toolbarLabelsOverflowed = {
      widthPx: this._toolbarWidthPx ?? 0,
      signature: this._toolbarLabelSignature(this._headerToolbar()),
    };
    this.requestUpdate();
  }

  /**
   * Whether this render draws interactive children of the card's own, so `ha-card` must not
   * present itself as a button around them.
   *
   * The one place that answers it, so every control that makes the card a host joins here:
   * the toolbar's controls, and the events while they are tap targets. Answered from what
   * this render draws rather than from the configuration: `event_tap_action: details` on a
   * card showing only "No events", an error or the loading line hosts nothing, and stays a
   * button. Either way the card keeps its tab stop while it has a tap action; only the
   * button role goes.
   *
   * @param toolbar - The header toolbar this render draws
   * @param drawsEventTarget - Whether this render draws at least one event as a tap target
   * @returns True while the card hosts at least one control
   */
  private _hostsControls(toolbar: Toolbar.HeaderToolbar, drawsEventTarget: boolean): boolean {
    return (
      toolbar.navigation !== undefined ||
      toolbar.legend !== undefined ||
      toolbar.viewSwitcher !== undefined ||
      toolbar.refresh !== undefined ||
      toolbar.addEvent !== undefined ||
      drawsEventTarget
    );
  }

  /**
   * The notice naming calendars that could not be loaded, or nothing.
   *
   * Names come from Home Assistant's friendly names; an entity that does not exist — the
   * usual cause of a calendar that never loads — has none, and is named by its id, which
   * is exactly what someone fixing the config needs to see.
   *
   * @returns The notice, or `nothing`
   */
  private _renderFetchErrorNotice(): TemplateResult | typeof nothing {
    if (this.isInitialLoad || this._failedEntities.length === 0) {
      return nothing;
    }

    const names = this._failedEntities.map((entityId) => this._calendarName(entityId));

    return Render.renderFetchErrorNotice(names, this.effectiveLanguage);
  }

  /**
   * A calendar's name as Home Assistant holds it, or its entity id where it holds none.
   *
   * @param entityId - The calendar
   * @returns Its name
   */
  private _calendarName(entityId: string): string {
    const friendlyName = this.hass?.states?.[entityId]?.attributes?.friendly_name;
    return typeof friendlyName === 'string' && friendlyName.trim() !== '' ? friendlyName : entityId;
  }

  /**
   * One of Home Assistant's own strings, in its language, or undefined where it has none.
   *
   * @param key - The string's key
   * @returns The string
   */
  private _haString(key: string): string | undefined {
    const text = this.hass?.localize?.(key);
    return text && text !== key ? text : undefined;
  }

  /**
   * The date a new event starts on in Home Assistant's create dialog.
   *
   * Taken when the button is pressed rather than when it was drawn, so a card left open
   * past midnight still offers the right day.
   *
   * @returns The dialog's `selectedDate`
   */
  private _newEventDate(): Date {
    if (this._pageShown !== null) {
      const page = this._pageRange(this._pageShown);
      return AddEvent.newEventDate(page.start, page.days);
    }

    const firstDayOfWeek = FormatUtils.getFirstDayOfWeek(
      this.config.first_day_of_week,
      this.hass?.locale,
    );
    const { start } = EventUtils.getTimeWindow(
      this.config.days_to_show,
      this.config.start_date,
      firstDayOfWeek,
    );
    return AddEvent.newEventDate(start, this.config.days_to_show);
  }

  /**
   * The add-event button, when the card asks for one and has somewhere to write.
   *
   * @returns Button description for the wrapper, or undefined for no button
   */
  private _addEventButton(): Toolbar.AddEventButton | undefined {
    const toolbar = Config.resolveToolbar(this.config);
    if (!toolbar.show || !toolbar.addEvent) return undefined;

    const writable = AddEvent.writableCalendarIds(
      this.safeHass,
      this.config.entities,
      this._failedEntities,
    );
    if (writable.length === 0) return undefined;

    return {
      label: AddEvent.addEventLabel(this.safeHass),
      onActivate: () => this._openCreateEventDialog(writable[0]),
    };
  }

  /**
   * Opens Home Assistant's create-event dialog, and refetches once it reports a new event.
   *
   * Refuses while the card is being edited: the button is still drawn there, so the
   * preview shows the layout the dashboard will have, but a press on it opens nothing.
   *
   * @param calendarId - The calendar the dialog preselects
   */
  private _openCreateEventDialog(calendarId: string): void {
    if (this._isBeingEdited) {
      Logger.debug('Not opening the new-event dialog while the card is being edited');
      return;
    }

    void Dialogs.openCreateEventDialog(this, {
      calendarId,
      selectedDate: this._newEventDate(),
      // Home Assistant's create dialog lets the user pick any calendar that accepts new
      // events, so every card showing one refreshes, and no card showing only read-only ones.
      updated: () => this._refreshAfterWrite({ feature: Dialogs.CREATE_EVENT_FEATURE }),
    });
  }

  //-----------------------------------------------------------------------------
  // DATE NAVIGATION
  //-----------------------------------------------------------------------------

  /**
   * The date navigation, when the configuration asks for it.
   *
   * The range names the page asked for, so a press answers at once; the days below stay those
   * of the page whose events have arrived, dimmed, until the new page's land. While the card is
   * being edited everything is drawn and nothing responds.
   *
   * Previous and next are named by Home Assistant's own strings, in its language, as the add
   * button is; without them the wrapper falls back to English accessible names that are never
   * shown. Home and the range come from `Intl` in the card's language, so no card string is
   * needed.
   *
   * @returns Navigation description for the wrapper, or undefined for none
   */
  private _dateNavigation(): Toolbar.DateNavigation | undefined {
    if (!this._wantsNavigation) return undefined;

    const now = new Date();
    const language = this.effectiveLanguage;
    const page = this._pageRange(this._pageRequested, now);

    return {
      range: Paging.rangeLabel(page, language, now),
      widestRange: Paging.widestRangeLabel(page.days, language),
      homeName: Paging.homeButtonName(this._homeRange(now), language, now),
      previousName: this._haString('ui.common.previous'),
      nextName: this._haString('ui.common.next'),
      inert: this._isBeingEdited,
      pickerValue: Paging.pageKey(page.start),
      onPrevious: () => this._stepPage(-1),
      onHome: () => this._goToPage(null),
      onNext: () => this._stepPage(1),
      onPick: (date) => this._pickDate(date),
    };
  }

  /**
   * Moves one page back or forward, by exactly the days on screen.
   *
   * From the page asked for rather than the one shown, so quick presses add up while a page
   * is still loading.
   *
   * @param direction - `-1` for back, `1` for forward
   */
  private _stepPage(direction: -1 | 1): void {
    const from = this._pageRange(this._pageRequested);
    this._goToPage(Paging.stepPage(from.start, from.days, direction));
  }

  /**
   * Opens the page holding a day picked in the date picker, lined up with home, or home when
   * the day is one of its own.
   *
   * @param value - The picked day, `YYYY-MM-DD`
   */
  private _pickDate(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const date = Paging.pageStart(value);
    if (isNaN(date.getTime())) return;

    const home = this._homeRange();
    this._goToPage(
      Paging.rangeContains(home, date) ? null : Paging.pageContaining(date, home, home.days),
    );
  }

  /**
   * Asks for a page, and loads it.
   *
   * A page starting where home does is home: it draws the card's own window, past events
   * hidden as configured. Nothing happens for the page already asked for, so the home button
   * at home is inert, and nothing at all while the card is being edited.
   *
   * @param start - First day of the page, or null for home
   */
  private _goToPage(start: Date | null): void {
    if (this._isBeingEdited) {
      Logger.debug('Not paging while the card is being edited');
      return;
    }

    const homeKey = Paging.pageKey(this._homeRange().start);
    const key = start === null ? null : Paging.pageKey(start);
    const page = key === null || key === homeKey ? null : key;
    if (page === this._pageRequested) return;

    Logger.debug(`Paging to ${page ?? 'home'}`);
    this._requestPage(page);
    this.requestUpdate();
    this._loadPage();
  }

  /**
   * Asks for another page without loading it yet. The failure count belongs to the page that
   * produced it: a page never fetched has no cache entry to record one, and would otherwise
   * start from the count this card carried, a step deeper in the backoff for every page
   * visited during an outage.
   *
   * @param page - First day of the page, or null for home
   */
  private _requestPage(page: string | null): void {
    this._pageRequested = page;
    this._failureCountHint = 0;
  }

  /**
   * Loads the page asked for: drawn from its cache at once when there is one, fetched when it
   * is due or missing. Home after a calendar changed while the card was away is fetched.
   */
  private _loadPage(): void {
    if (this._pageRequested === null && this._homeStale) {
      this._homeStale = false;
      void this.updateEvents('network');
      return;
    }
    void this.updateEvents('page');
  }

  //-----------------------------------------------------------------------------
  // REFRESH
  //-----------------------------------------------------------------------------

  /**
   * The refresh button, when the configuration asks for it.
   *
   * Named by Home Assistant's own word, as the add button is. While the card is being edited
   * it is drawn and a press does nothing.
   *
   * @returns Button description for the wrapper, or undefined for none
   */
  private _refreshButton(): Toolbar.RefreshButton | undefined {
    const toolbar = Config.resolveToolbar(this.config);
    if (!toolbar.show || !toolbar.refresh) return undefined;

    return {
      label: this._haString('ui.common.refresh'),
      busy: this.isLoading,
      onActivate: () => {
        if (this._isBeingEdited) {
          Logger.debug('Not refreshing from the toolbar while the card is being edited');
          return;
        }
        this._requestRefresh();
      },
    };
  }

  /**
   * Loads the events again because someone asked to: the refresh button, or a `refresh` tap
   * or hold action.
   *
   * Does nothing while a load is under way, which the button shows by turning, so a second
   * press never starts a second request beside the first. The guard is here rather than in
   * `refreshEvents`, which a calendar write must still be able to force.
   */
  private _requestRefresh(): void {
    if (this.isLoading) {
      Logger.debug('Not refreshing: a load is already under way');
      return;
    }
    Logger.debug('Refreshing on request');
    void this.refreshEvents();
  }

  //-----------------------------------------------------------------------------
  // LEGEND
  //-----------------------------------------------------------------------------

  /** Whether the configuration asks for the calendar legend. */
  private get _wantsLegend(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.legend;
  }

  /**
   * The calendar legend, when the configuration asks for it.
   *
   * One entry per calendar, colored by its accent as its events are and named as Home
   * Assistant names it. While the card is being edited every calendar is shown and nothing
   * toggles. Folded when its chips did not fit on one row at this width (`_syncLegendFit`).
   *
   * @returns Legend description for the wrapper, or undefined for none
   */
  private _legend(): Legend.CalendarLegend | undefined {
    if (!this._wantsLegend) return undefined;

    const ids = Legend.legendCalendarIds(this.config.entities);
    if (ids.length === 0) return undefined;

    const hidden = this._activeHiddenCalendars;
    const registryColors = EntityColors.entityColors();
    const calendars = ids.map((id) => ({
      id,
      name: this._calendarName(id),
      color: EventUtils.getEntityAccentColorWithOpacity(
        id,
        this.effectiveConfig,
        undefined,
        undefined,
        registryColors,
      ),
      shown: !hidden.has(id),
    }));

    return {
      calendars,
      name: this._haString('ui.components.calendar.my_calendars'),
      folded: this._legendFoldedFor(this._legendSignature(calendars)),
      inert: this._isBeingEdited,
      onToggle: (id) => this._toggleCalendar(id),
    };
  }

  /**
   * What the width of the legend's chips depends on, other than the card's width.
   *
   * @param calendars - The calendars the legend lists
   * @returns A string that changes whenever the chips might change width
   */
  private _legendSignature(calendars: ReadonlyArray<Legend.LegendCalendar>): string {
    return [
      this.effectiveLanguage,
      // The lane's inline padding follows the view.
      this.effectiveView,
      String(this._legendFontGeneration),
      ...calendars.map((calendar) => `${calendar.id}\u0001${calendar.name}`),
    ].join('\u0000');
  }

  /**
   * Whether the legend is folded into a button now.
   *
   * Folded from the width at which its chips did not fit, drawn with the same calendars,
   * names, language and view, until the card is wide enough for them by a margin. Anything
   * else draws the chips, which `_syncLegendFit` then measures.
   *
   * @param signature - From `_legendSignature`
   * @returns True to draw the button
   */
  private _legendFoldedFor(signature: string): boolean {
    const fold = this._legendFold;
    if (!fold || fold.signature !== signature) return false;
    return this._legendWidthPx === null || this._legendWidthPx < fold.unfoldAtPx;
  }

  /**
   * Whether an open legend menu still has its button after the coming render.
   *
   * @returns False when the legend is going, unfolding or the card is being edited
   */
  private _legendMenuMayStayOpen(): boolean {
    if (!this._wantsLegend || this._isBeingEdited || this.hidden) return false;
    return this._legend()?.folded === true;
  }

  /**
   * Hides a calendar's events on this device, or shows them again, and remembers it there.
   *
   * Nothing is fetched: hidden calendars stay loaded, so this only redraws.
   *
   * @param id - The calendar's entity id
   */
  private _toggleCalendar(id: string): void {
    if (this._isBeingEdited) {
      Logger.debug('Not hiding calendars while the card is being edited');
      return;
    }
    if (!this._wantsLegend) return;

    const next = new Set(this._hiddenCalendars);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._hiddenCalendars = next.size > 0 ? next : NO_HIDDEN_CALENDARS;
    if (this._configFingerprint !== null) {
      ViewChoice.writeHiddenCalendars(this._configFingerprint, [...next]);
    }
    Logger.debug(`${next.has(id) ? 'Hid' : 'Showed'} ${id}`);
    this.requestUpdate();
  }

  /**
   * Folds the legend into a button when its chips do not fit on one row, and, after a resize,
   * draws them again once they fit.
   *
   * Reads the chips the last render drew, laid out: their natural width against the lane's.
   * When they overflow it, the card remembers what they were drawn with and the card width
   * from which they would fit by a small margin, and draws the button instead until the card
   * is that wide, or the calendars, their names, the language, the view or a font change.
   * Then the chips are drawn again and measured again. An unfold that still does not fit folds
   * again from a wider width, so the two cannot alternate.
   *
   * After a render (`updated`) this only folds, at the width the legend was last judged at,
   * and before anything is painted, so a card that cannot fit its chips never shows them cut
   * off. Anything a width change decides waits for the pass a frame after the resize
   * (`_scheduleLegendFit`): a fold or an unfold changes the card's height, which must not
   * happen while the browser is delivering resize observations.
   *
   * Only ever reads layout that exists. Without it — a card not laid out yet, a section folded
   * away, or a test environment with no layout engine — every box is empty, and nothing is
   * concluded.
   *
   * @param mayUnfold - Whether the card width may move, which can draw the chips again
   */
  private _syncLegendFit(mayUnfold = true): void {
    if (!this.isConnected || !this._wantsLegend) return;
    this._watchLegendFonts();

    const cardWidth = this.getBoundingClientRect().width;
    if (cardWidth <= 0) return;
    if (mayUnfold || this._legendWidthPx === null) {
      this._legendWidthPx = cardWidth;
    } else if (Math.abs(cardWidth - this._legendWidthPx) > 0.5) {
      // A width the legend has not been judged at is a resize, and this render may be running
      // inside the browser's delivery of it: the pass a frame later decides.
      this._scheduleLegendFit();
      return;
    }

    const lane = this.renderRoot.querySelector<HTMLElement>('.toolbar-legend');
    const chips = lane?.querySelector<HTMLElement>('.legend-chips');
    if (!lane || !chips) {
      // Folded: draw the chips again if the card is now wide enough for them.
      const drawnFolded = this.renderRoot.querySelector('.legend-button') !== null;
      if (mayUnfold && drawnFolded && this._legend()?.folded === false) this.requestUpdate();
      return;
    }

    const style = getComputedStyle(lane);
    const available =
      lane.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);
    const needed = chips.getBoundingClientRect().width;
    if (available <= 0 || needed <= 0 || needed <= available + 0.5) return;

    const legend = this._legend();
    if (!legend) return;

    this._legendWidthPx = cardWidth;
    this._legendFold = {
      signature: this._legendSignature(legend.calendars),
      unfoldAtPx: Math.ceil(cardWidth + needed - available) + Constants.UI.LEGEND_UNFOLD_MARGIN,
    };
    Logger.debug(
      `Legend chips need ${Math.ceil(needed)}px of ${Math.floor(available)}px; folded until ` +
        `${this._legendFold.unfoldAtPx}px`,
    );
    this.requestUpdate();
  }

  /**
   * Runs `_syncLegendFit` in the next frame, once per frame, for a card whose width moved.
   */
  private _scheduleLegendFit(): void {
    if (!this._wantsLegend || this._legendFitRaf !== null) return;
    this._legendFitRaf = requestAnimationFrame(() => {
      this._legendFitRaf = null;
      this._syncLegendFit();
    });
  }

  /**
   * Re-measures the legend's chips whenever a font finishes loading, since a late web font can
   * change their width without changing anything else. Held from the first measurement while
   * the card is attached.
   */
  private _watchLegendFonts(): void {
    if (this._legendFontsCleanup) return;
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts || typeof fonts.addEventListener !== 'function') return;

    const onLoaded = () => {
      if (!this.isConnected || !this._wantsLegend) return;
      this._legendFontGeneration++;
      this.requestUpdate();
    };
    fonts.addEventListener('loadingdone', onLoaded);
    this._legendFontsCleanup = () => fonts.removeEventListener('loadingdone', onLoaded);
  }

  //-----------------------------------------------------------------------------
  // VIEW SWITCHER
  //-----------------------------------------------------------------------------

  /**
   * Whether the configuration asks for the view switcher. Not whether it is drawn: that also
   * takes at least two views that fit (`_viewSwitcher`).
   */
  private get _wantsViewSwitcher(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.viewSwitcher;
  }

  /**
   * Whether picking a view would draw it at the card's current width, rather than the list
   * a narrow card falls back to.
   *
   * The view on screen fits by definition. Every other one is fitted as `_chooseView` fits
   * a pick, through `resolveColumnFitIfPicked`, so a segment offered is a segment that
   * works and the rule is the same for each: a layout the card was just drawing stays on
   * offer after switching away from it, and the configured view, fallen back to the list
   * at a width it could have kept, is offered exactly as it would be after a detour through
   * another. List has no width requirement; before the first measurement every view fits,
   * as `resolveColumnFit` itself assumes.
   *
   * @param view - View to test
   * @returns True when the view can be drawn now
   */
  private _viewFits(view: Types.EffectiveView): boolean {
    if (!ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(view)) return true;
    if (view === this._effectiveView) return true;

    return (
      ViewConfig.resolveColumnFitIfPicked(view, this.config, this._measuredWidthPx).view === view
    );
  }

  /**
   * The views the switcher would offer now, as a comparable string; empty without one.
   *
   * @returns One letter per view that fits
   */
  private _offeredViewsKey(): string {
    if (!this._wantsViewSwitcher) return '';
    return ViewConfig.VIEWS.filter((view) => this._viewFits(view)).join(',');
  }

  /**
   * The view switcher, when the card asks for one and more than one view fits.
   *
   * While the card is being edited it marks `view`, the layout the dashboard opens with, and
   * offers every view; pressing one does nothing. Otherwise it marks the view on screen,
   * which for a remembered view too wide for this card is the list it fell back to.
   *
   * @returns Switcher description for the wrapper, or undefined for none
   */
  private _viewSwitcher(): Toolbar.ViewSwitcher | undefined {
    if (!this._wantsViewSwitcher) return undefined;

    const editing = this._isBeingEdited;
    const translations = Localize.getTranslations(this.effectiveLanguage);
    const views = ViewConfig.VIEWS.map((view) => ({
      view,
      label: translations[Toolbar.VIEW_LABEL_KEYS[view]],
      available: editing || this._viewFits(view),
    }));

    if (views.filter((option) => option.available).length < 2) return undefined;

    return {
      views,
      selected: this.effectiveView,
      onSelect: (view) => this._chooseView(view),
    };
  }

  /**
   * Shows another view on this device, and remembers it there.
   *
   * Pressing the view already on screen still counts. On a narrow card it may be the list
   * standing in for a remembered view that does not fit, and the press makes the list the
   * choice. Pressing the view already asked for while the list stands in for it draws it,
   * when it is offered at all: the choice is unchanged, the layout is not. Nothing is
   * fetched: every view draws the same days from the same events.
   *
   * @param view - The view picked
   */
  private _chooseView(view: Types.EffectiveView): void {
    if (this._isBeingEdited) {
      Logger.debug('Not switching views while the card is being edited');
      return;
    }
    if (!this._wantsViewSwitcher || !this._viewFits(view)) return;

    const choice = view === this.config.view ? null : view;
    if (this._configFingerprint !== null) {
      ViewChoice.writeViewChoice(this._configFingerprint, choice ?? undefined);
    }
    if (choice === this._viewChoice && view === this._effectiveView) return;

    this._viewChoice = choice;
    const fit = ViewConfig.resolveColumnFitIfPicked(
      this.requestedView,
      this.config,
      this._measuredWidthPx,
    );
    Logger.debug(`Switched to ${view}, drawn as ${fit.view}/${fit.columns}`);
    this._effectiveView = fit.view;
    this._columnCount = fit.columns;
    this.requestUpdate();
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
