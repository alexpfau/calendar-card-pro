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

import {
  LitElement,
  PropertyValues,
  TemplateResult,
  html,
  render as litRender,
  nothing,
} from 'lit';
import { customElement, property } from 'lit/decorators.js';

import * as Config from './config/config';
import * as Constants from './config/constants';
import * as Types from './config/types';
import * as ViewConfig from './config/view';
import * as Actions from './interaction/actions';
import * as AddEvent from './interaction/add-event';
import * as Back from './interaction/back';
import * as CalendarChanges from './interaction/calendar-changes';
import * as Writes from './interaction/calendar-writes';
import * as EventActions from './interaction/event-actions';
import * as EventDetails from './interaction/event-details';
import type * as Times from './interaction/event-times';
import * as Feedback from './interaction/feedback';
import * as GridDraft from './interaction/grid-draft';
import * as GridMove from './interaction/grid-move';
import type * as PopoverModel from './interaction/popover-model';
import { type SearchHost, SearchSession } from './interaction/search-session';
import * as Activation from './rendering/activation';
import type * as Editor from './rendering/editor/index';
import * as EventPopover from './rendering/event-popover';
import * as GridRender from './rendering/grid';
import * as Legend from './rendering/legend';
import * as Menu from './rendering/menu';
import * as Render from './rendering/render';
import * as SearchPanel from './rendering/search-panel';
import * as Styles from './rendering/styles';
import * as Toolbar from './rendering/toolbar';
import * as Localize from './translations/localize';
import * as CalendarNames from './utils/calendar-names';
import { editorModuleUrl } from './utils/editor-url';
import * as EntityColors from './utils/entity-colors';
import * as EventUtils from './utils/events';
import * as FormatUtils from './utils/format';
import * as GridUtils from './utils/grid';
import * as CascadeThreshold from './utils/grid-cascade-threshold';
import * as OverflowStrip from './utils/grid-overflow-strip';
import * as GridTimeFit from './utils/grid-time-fit';
import * as GridTitleFit from './utils/grid-title-fit';
import * as HassRelevance from './utils/hass-relevance';
import * as Helpers from './utils/helpers';
import * as LiveCalendars from './utils/live-calendars';
import * as Logger from './utils/logger';
import * as Paging from './utils/paging';
import * as Search from './utils/search';
import * as StartDate from './utils/start-date';
import * as Templates from './utils/templates';
import {
  TitleMotionController,
  type TitleScrollMeasurement,
  supportsTitleMotion,
} from './utils/title-motion-controller';
import * as ToolbarFold from './utils/toolbar-fold';
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
 * the reaction to this very signal inserts, and so is the new event the card is adding, which
 * comes and goes with a press and is fitted on its own (`_fitNewBlocks`).
 *
 * @param record - A record from the grid disclosure observer, already known to lie outside
 *   every timed block
 * @returns Whether the grid's element structure changed
 */
function changesGridStructure(record: MutationRecord): boolean {
  if (record.type !== 'childList') return false;
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(`.${GridRender.NEW_EVENT_HOST_CLASS}`)) return false;
  return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
    (node) =>
      node instanceof Element &&
      !node.classList.contains(CascadeThreshold.SCALE_PROBE_CLASS) &&
      !node.classList.contains(GridRender.NEW_EVENT_HOST_CLASS),
  );
}

/**
 * Where an element is on screen, for the popover to open beside: its center, and its box, which
 * for an event drawn without one of its own ends where its text does (`eventBox`). For a press
 * made without a pointer, by the keyboard or assistive technology, whose events carry no
 * position, and for the box of an event pressed with one.
 *
 * @param node - The element pressed
 * @returns Its center and box, or undefined for anything that is not an element
 */
function originOf(node: EventTarget | null): Feedback.PressOrigin | undefined {
  if (!(node instanceof Element)) return undefined;
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: Feedback.eventBox(node),
  };
}

/** Whether the person asked for less motion, which turns a swipe's nudge and arrival off. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * How far the days follow a swipe's finger: half its pace at first, easing toward
 * `SWIPE_NUDGE_MAX` and never past it, so the hint stays a hint however far the finger goes.
 *
 * @param deltaX - Horizontal travel from pointer-down, positive to the right
 * @returns The offset to draw the days at, in CSS pixels, with the finger's sign
 */
function resistedSwipeOffset(deltaX: number): number {
  const max = Constants.UI.SWIPE_NUDGE_MAX;
  return Math.sign(deltaX) * max * (1 - Math.exp(-Math.abs(deltaX) / (2 * max)));
}

/**
 * Takes a swipe's offset off an element, and its `style` attribute with it when nothing else
 * is left in it, so the card's markup reads as it did before the swipe.
 *
 * @param element - The content container the swipe moved
 */
function clearInlineTransform(element: HTMLElement): void {
  element.style.removeProperty('transform');
  if (!element.getAttribute('style')) element.removeAttribute('style');
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
type LoadMode = 'navigate' | 'page' | 'cache' | 'reprocess' | 'network' | 'reload' | 'live';

/** The controls a render draws in the header toolbar, before it decides on the switcher's words. */
type ToolbarControls = Omit<Toolbar.HeaderToolbar, 'labeled'>;

/**
 * An event drawn as a target of its own, which a search pick moves focus to: list view's button
 * inside the row, or column and grid view's event itself.
 */
const FOCUSABLE_EVENT = '[role="button"][tabindex]';

/** No calendar hidden: the one empty set, so an unchanged answer keeps its identity. */
const NO_HIDDEN_CALENDARS: ReadonlySet<string> = new Set();

/** What the card drew of a complete load (`_commitEvents`), and the query it was loaded for. */
interface CompleteDrawing {
  /** Query identity the events were loaded for (`_eventsInstanceId`). */
  readonly instanceId: string;
  /** The events drawn (`events`). */
  readonly events: readonly Types.CalendarEventData[];
  /** The same events, as loaded (`_drawnRaw`). */
  readonly raw: readonly Types.CalendarEventData[];
  /** When each calendar drawn last loaded successfully (`_drawnLoadedAt`). */
  readonly loadedAt: Readonly<Record<string, number>>;
  /** When the oldest of them loaded, for a calendar with no record of its own. */
  readonly fetchedAt: number;
}

/** Nothing drawn yet, which no query matches. */
const NOTHING_DRAWN: CompleteDrawing = {
  instanceId: '',
  events: [],
  raw: [],
  loadedAt: {},
  fetchedAt: 0,
};

/**
 * When the events drawn of a calendar last loaded successfully: by its own record, and for a
 * calendar with none, by the oldest load drawn.
 *
 * @param drawing - When each calendar drawn loaded, and the oldest of them
 * @param entityId - The calendar the events belong to
 * @returns Epoch milliseconds
 */
function loadedAtOf(
  drawing: Pick<CompleteDrawing, 'loadedAt' | 'fetchedAt'>,
  entityId: string | undefined,
): number {
  const recorded = entityId === undefined ? undefined : drawing.loadedAt[entityId];
  return typeof recorded === 'number' ? recorded : drawing.fetchedAt;
}

/**
 * Toolbar buttons already reported as having no name, by icon, so a card that renders again
 * does not say so again.
 */
const unnamedButtonsReported = new Set<string>();

/**
 * The real events in a grouping, leaving out the placeholders that stand for empty days.
 *
 * @param days - Grouped days
 * @returns How many events they hold
 */
function countRealEvents(days: ReadonlyArray<Types.EventsByDay>): number {
  return days.reduce(
    (total, day) => total + day.events.filter((event) => !event._isEmptyDay).length,
    0,
  );
}

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

  /**
   * Home's query identity (`_instanceIdForPage`), as of now: it follows the configuration and,
   * under `first_day_of_week: system` with a week-relative `start_date`, the profile.
   */
  private get _instanceId(): string {
    return this._instanceIdForPage(null);
  }
  /**
   * The `_instanceId` the events currently held in `events` were fetched for.
   */
  private _eventsInstanceId = '';
  /**
   * The live subscriptions this card holds, for the window it shows (`_syncLive`), each with
   * its release.
   */
  private _liveReleases: Array<(linger: number) => void> = [];
  /** The calendars of the window it shows, whose live changes it listens for. */
  private _liveCalendars: ReadonlySet<string> = new Set();
  /** Stops listening, and the connection it listens on. */
  private _liveUnlisten: (() => void) | null = null;
  private _liveConnection: unknown = null;
  /** The pending `_syncLive`, coalescing the changes of one task. */
  private _liveSyncTimer: number | null = null;
  /**
   * The drift (`EventUtils.liveDrift`) the last `live` load was started for, until the card
   * commits events: the same drift is not loaded for again before then, so a load that commits
   * nothing (one that failed outright) never loads in a loop. A `live` load that commits takes
   * its events from the subscriptions, so no drift it was for outlives it. Each change has its
   * own page-wide number, so a new change never reads as one loaded already.
   */
  private _liveDriftLoaded = '';
  /**
   * The events drawn, as loaded (`EventFetchResult.raw`), compared with live subscriptions.
   * While a cold load draws calendars as they answer, only theirs; what a failing calendar
   * keeps is read from `_completeDrawing`.
   */
  private _drawnRaw: readonly Types.CalendarEventData[] = [];
  /**
   * When each calendar drawn last loaded successfully (`EventFetchResult.lastSuccess`): what
   * bounds how long the card keeps drawing that calendar's events when nothing newer can be
   * loaded, whatever the age of any other calendar drawn (`_drawnLoadedAtOf`).
   */
  private _drawnLoadedAt: Readonly<Record<string, number>> = {};
  /**
   * What the card last drew of a complete load, which a load keeps its failing calendars from
   * (`_keepFailedCalendars`), read as the load starts.
   *
   * A cold load draws each calendar as it answers (`_schedulePartialCommit`), which replaces
   * `events`, `_drawnRaw` and `_drawnLoadedAt` with the calendars that have answered, so a
   * calendar failing after them would find nothing of its own there. Only `_commitEvents` writes
   * this, so neither a partial draw nor a load a newer one replaced moves it. Letting go of
   * events the card may no longer draw (`_dropUndrawableResidentEvents`) leaves it too: what is
   * kept from it is held to the load's own query and to each calendar's 24 hours as it is read.
   */
  private _completeDrawing: CompleteDrawing = NOTHING_DRAWN;
  /**
   * Monotonic ticket for in-flight event requests.
   *
   * `updateEvents()` awaits the API, and two entry points can bump this during that
   * await: `setConfig()` moving `_instanceId` and starting a second request, and
   * `disconnectedCallback` superseding any fetch that is still open, so a response for a
   * configuration a detached `setConfig` has since replaced is never drawn. Comparing the ticket
   * a request started with against the current value is what tells a superseded
   * response to discard itself instead of committing.
   */
  private _eventRequestGeneration = 0;

  /**
   * The newest partial result of a cold load, and the timer that will draw it
   * (`_schedulePartialCommit`). Calendars answering within one task draw once, and a load whose
   * calendars all answer together draws only its full result.
   */
  private _partialCommit: {
    partial: Types.EventFetchResult;
    instanceId: string;
    page: string | null;
    generation: number;
  } | null = null;

  private _partialTimer: number | null = null;

  private _language = '';
  private _refreshTimerId?: number;
  private _lastUpdateTime = 0;
  private _initialLoadRetryId?: number;
  /**
   * When the oldest of the events held in `events` last loaded successfully, in epoch
   * milliseconds. Not the time of the attempt that delivered them: an attempt that only carried
   * a failing calendar's events forward does not make them any younger. Each calendar is bounded
   * by its own load (`_drawnLoadedAt`); this bounds one with no record of its own.
   */
  private _eventsFetchedAt = 0;
  /**
   * Set when the card is attached and cleared by the first load that can run. That load
   * draws whatever is cached before it asks Home Assistant, and honors
   * `refresh_on_navigate`; every later load is a refresh.
   */
  private _appearLoadPending = false;
  /**
   * Consecutive failed attempts this card has seen, for when no cache can record them, and the
   * query they were counted for. A count belongs to the query that produced it: a load for any
   * other query starts from zero (`updateEvents`), or it would begin a step deeper in the backoff
   * for every page visited during an outage, every configuration that moved the window, and
   * every profile that moved the week under `first_day_of_week: system`.
   */
  private _failureCountHint = 0;
  /** The query `_failureCountHint` was counted for. */
  private _failureCountQuery = '';
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
    loadedDays: number | null;
    resolved: Types.Config;
    /** The view's own `days_to_show`, before the days drawn wait for a wider load. */
    configuredDays: number;
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
   * Whether the active gesture may end as a swipe that pages: a touch or pen press, away from
   * the screen's edges, on a card that swipes (`_swipeAvailable`). Decided at pointer-down.
   */
  private _pointerSwipeable = false;
  /**
   * The content container the active swipe nudges, while its days follow the finger, and the
   * offset last written. Written straight onto that element's style, which no render binds.
   */
  private _swipeNudge: { element: HTMLElement; offset: number } | null = null;
  /** The motion last started on the content container: a spring-back or an arrival. */
  private _swipeMotion: Animation | null = null;
  /**
   * The page a swipe asked for, until it is drawn, and the side its days arrive from: `1` from
   * the right, `-1` from the left. Physical rather than logical: the days arrive from where the
   * finger came from, in either reading direction.
   */
  private _swipeArrival: { page: string | null; from: -1 | 1 } | null = null;
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
   * The day a press on a day that adds an event landed on, read at pointer-down while a tap on
   * a day adds (`_dayTapsActive`); null otherwise. Never set for a press on an event, which
   * covers its day.
   */
  private _pointerDayHit: Activation.DayHit | null = null;
  /**
   * Where the active press landed, events walked past, for the card's own `add-event` action:
   * read at pointer-down only while `tap_action` or `hold_action` is `add-event`.
   */
  private _pointerAddContext: Activation.DayHit | null = null;
  /** The day's add button the active press began on, if any; see `_derivedClick`. */
  private _pointerDayAdd: EventTarget | null = null;
  /**
   * Whether the active press began on a link in an event's row (`open_links`). Such a press is
   * armed only to page, by a touch or pen swipe: it captures nothing, and ends in no tap and no
   * hold, so the browser follows the link wherever the finger stayed put.
   */
  private _pointerOnLink = false;
  /**
   * Where a new event may be drawn from, for the active press: a grid's time area or all-day
   * band, while a tap on a day adds. Such a press has a hold of its own, which draws instead of
   * running `hold_action` (`_startDraft`).
   */
  private _pointerDraftFrom: GridDraft.DraftAnchor | null = null;
  /** The new event the active press is drawing, if any; see `_startDraft`. */
  private _draft: {
    readonly anchor: GridDraft.DraftAnchor;
    /** Whether the pointer has left the slot the draft began in. */
    moved: boolean;
    /** The day element under the pointer, for the popover to open beside. */
    under: Element | null;
  } | null = null;
  /**
   * The event the active press may move, from pointer-down on a block a drag moves
   * (`_moveFrom`), and once the press lifts it (`_startMove`), where the pointer is taking it.
   */
  private _move: {
    /** The block pressed, and the event and color it carries. */
    readonly element: Element;
    readonly target: Activation.EventTapTarget;
    /** The event as stored, and its span. */
    readonly entry: EventDetails.DetailEntry;
    readonly times: Times.EventTimes;
    readonly key: GridMove.MoveKey;
    /** Where the pointer grabbed it. */
    readonly grab: GridMove.MovePoint;
    /** Whether the press has lifted it, so it follows the pointer. */
    started: boolean;
    /** Whether the pointer has had it anywhere but where it was. */
    left: boolean;
    /** The day element under the pointer, for the popover to open beside. */
    under: Element | null;
  } | null = null;
  /**
   * The new event a grid shows as a block of its own: while a press draws it, and then while
   * the popover adds it, following what is typed and chosen there, as Calendar on macOS shows
   * a "New Event" until it is saved or thrown away (`_paintNew`).
   */
  private _newShown: {
    times: Times.EventTimes;
    /** The title typed so far; until there is one, the block says "New event". */
    title: string;
    /** The calendar it would be added to, whose options draw it as they draw its events. */
    calendarId?: string;
    /** The location and description typed so far, which an event's block may show. */
    location?: string;
    description?: string;
    /**
     * What the grid showed when it was first drawn (`_draftContext`). A block on days the card
     * no longer shows, after a page turn, a view switch or anything else that redrew other days,
     * is taken away, and a press drawing it is thrown away rather than added on dates nobody can
     * see.
     */
    context: string;
    /** Whether the add popover is open on it, which it outlives the press that drew it for. */
    inPopover: boolean;
    /** Whether the popover saved it, so it stays until the card's events bring the real one. */
    saved: boolean;
    /** Whether the refresh after its save has put the card's events on it (`_newArrived`). */
    arrived: boolean;
    /**
     * For an event a drag moves rather than a new one: which it is, and the event as Home
     * Assistant returned it, which the block is drawn from at its new times.
     */
    moving?: { key: GridMove.MoveKey; source: Types.SourceEvent };
  } | null = null;
  /**
   * What the new event is drawn into, by the element holding each: a day's plane for a timed
   * one, the all-day band for an all-day one (`_paintNew`).
   */
  private _newHosts = new Map<Element, HTMLElement>();
  /** The new event's blocks the grid's fitting observes, to be forgotten once they go. */
  private _newObserved = new Set<HTMLElement>();
  /** Takes a saved new event's block away if the events bringing the real one are slow. */
  private _newTimer?: number;
  /**
   * Until when the `touchend` of a finger that just opened the popover is refused, which keeps
   * the mouse events and click a browser derives from it off the popover (`_swallowTouchEnd`).
   */
  private _swallowTouchEndUntil = 0;
  /** Whether a finger is lifting, while its pointer-up runs what the press does. */
  private _liftingTouch = false;
  /** The day the press under way is washing, so it can be unwashed however the press ends. */
  private _washedDay: Element | null = null;
  /**
   * Whether the grid draws the new event as a banner (`_paintNew`), which opens its all-day
   * band, one row, on days that hold no all-day event of their own (`_openBandForNew`).
   */
  private _bandOpenForNew = false;

  /**
   * Whether the card's own action of this kind would run: one is configured, and it is not
   * `add-event` on a card that cannot add one now (`_canAddEvents`), `reset` on a card
   * with nothing a reset could ever undo (`_canReset`), nor `back` while the card is being
   * edited, when leaving the page would take the editor with it. Such an action is no action
   * at all: no tab stop, ripple or hold indicator promises what a press then refuses.
   *
   * @param kind - Which of the card's actions
   * @returns Whether a press of that kind runs something
   */
  private _cardActionRuns(kind: 'tap' | 'hold'): boolean {
    const action = kind === 'hold' ? this.config.hold_action : this.config.tap_action;
    if (!action || action.action === 'none') return false;
    if (action.action === Constants.ADD_EVENT_ACTION) return this._canAddEvents;
    if (action.action === Constants.RESET_ACTION) return this._canReset;
    if (action.action === Constants.BACK_ACTION) return !this._isBeingEdited;
    return true;
  }

  /**
   * Whether the card has a tap action to advertise to pointer and keyboard users.
   */
  private get _hasTapAction(): boolean {
    return this._cardActionRuns('tap');
  }

  /**
   * Whether the card has a hold action to advertise to pointer users.
   */
  private get _hasHoldAction(): boolean {
    return this._cardActionRuns('hold');
  }

  /** The card's calendars a new event can be written to now, in configuration order. */
  private get _writableCalendars(): string[] {
    return AddEvent.writableCalendarIds(this.safeHass, this.config.entities, this._failedEntities);
  }

  /**
   * Whether anything on the card may open Home Assistant's new-event dialog now: there is a
   * calendar to write to, and the card is not being edited, where nothing may write.
   */
  private get _canAddEvents(): boolean {
    return !this._isBeingEdited && this._writableCalendars.length > 0;
  }

  /**
   * Whether a tap on a day, where it shows no event, adds an event there: `day_tap_action` is
   * `add-event`, and the card can add one now. Every other value reads as `none`, which leaves
   * such a tap to `tap_action`, as `event_tap_action` does for events.
   */
  private get _dayTapsActive(): boolean {
    const dayTapAction: Types.ActionConfig | null | undefined = this.config.day_tap_action;
    return dayTapAction?.action === Constants.ADD_EVENT_ACTION && this._canAddEvents;
  }

  /**
   * How this render draws each day as a button that adds an event on it, or undefined while a
   * tap on a day adds nothing. Named by Home Assistant's own "Add event", as the add button is.
   */
  private get _dayAddButtons(): Activation.DayAddButtons | undefined {
    if (!this._dayTapsActive) return undefined;
    return { label: AddEvent.addEventLabel(this.safeHass) ?? AddEvent.UNLOCALIZED_ADD_EVENT_NAME };
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
   * Before any of them starts, every stored window holding a calendar the change may have
   * touched is marked due, because no card on the page refreshes a window it is not drawing:
   * home while this card is paged away, or a card on another view (`expireStoredCalendars`).
   *
   * @param changed - The calendars the change may have touched
   * @param committed - Called once this card's refresh has put the events on it
   */
  private _refreshAfterWrite(
    changed: CalendarChanges.ChangedCalendars,
    committed?: () => void,
  ): undefined {
    this._markHomeStaleIfAway();
    const hass = this.safeHass;
    EventUtils.expireStoredCalendars((ids) => CalendarChanges.touchesCalendars(changed, ids, hass));
    const writeGeneration = EventUtils.advanceWriteGeneration();
    void this.refreshEvents(writeGeneration).then(() => committed?.());
    this._search?.calendarsChanged();
    CalendarChanges.announceCalendarsChanged(this, changed, writeGeneration);
  }

  /**
   * Takes up the calendars another card hid with its legend, when that card has this card's
   * configuration and so shares its remembered choice. Without it the two would disagree on
   * screen, and the next press on either would write its own stale set over the other's.
   *
   * @param ev - The legend's change, naming the configuration and the calendars now hidden
   */
  private readonly _handleLegendChanged = (ev: Event): void => {
    const detail = (ev as CustomEvent<Legend.LegendChange>).detail;
    if (!detail || detail.source === this || !this._wantsLegend) return;
    if (detail.fingerprint !== this._configFingerprint) return;

    this._adoptHiddenCalendars(detail.hidden);
    this._hiddenMatchesStorage = detail.stored;
  };

  /**
   * Takes up the calendars another tab hid or showed for this card's configuration, the way
   * `_handleLegendChanged` does for a card on the same page. A tab that kept its own stale
   * set would write it back on its next press, over a reset made in the other tab.
   *
   * Only this configuration's hidden set counts: a write that changed another card's choice,
   * or only the switcher's view, leaves this card as it is (`hiddenCalendarsChange`).
   *
   * @param ev - The `storage` event, fired on `window` for another tab's write
   */
  private readonly _handleStorageChanged = (ev: Event): void => {
    const change = ev as StorageEvent;
    if (!this._wantsLegend || this._configFingerprint === null) return;
    const storage = ViewChoice.deviceStorage();
    if (storage === null || change.storageArea !== storage) return;

    const hidden = ViewChoice.hiddenCalendarsChange(change, this._configFingerprint);
    if (hidden === undefined) return;
    this._adoptHiddenCalendars(hidden);
    this._hiddenMatchesStorage = true;
  };

  /**
   * Reads the hidden calendars again, for a card that may have missed another tab's write:
   * one reattached, which listened for nothing while detached, and one whose tab comes back,
   * which may have been held where no event reaches it. Never when the set lives in this page
   * only, or when the storage cannot be read: neither says anything about this card.
   */
  private _resyncHiddenCalendars(): void {
    if (!this._wantsLegend || this._configFingerprint === null || !this._hiddenMatchesStorage) {
      return;
    }
    const stored = ViewChoice.readStoredHiddenCalendars(this._configFingerprint);
    if (stored === undefined) return;

    const calendars = new Set(Legend.legendCalendarIds(this.config.entities));
    const next = stored.filter((id) => calendars.has(id));
    const current = this._hiddenCalendars;
    if (next.length === current.size && next.every((id) => current.has(id))) return;
    this._adoptHiddenCalendars(next);
  }

  /**
   * Shows the calendars this card's configuration has hidden elsewhere: on another card on the
   * page, or in another tab. Only calendars the card shows are kept.
   *
   * @param hidden - Entity ids of the calendars hidden now
   */
  private _adoptHiddenCalendars(hidden: ReadonlyArray<string>): void {
    const calendars = new Set(Legend.legendCalendarIds(this.config.entities));
    const shown = hidden.filter((id) => calendars.has(id));
    this._hiddenCalendars = shown.length > 0 ? new Set(shown) : NO_HIDDEN_CALENDARS;
    this.requestUpdate();
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
      this._search?.calendarsChanged();
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
   * Opens the event popover on a tapped event.
   *
   * Refuses while the card is being edited. Events are not tap targets then, so nothing
   * should reach here; this is the last guard for anything that does, since the popover
   * edits and deletes events.
   *
   * @param event - The event
   * @param color - The accent it is drawn in
   * @param origin - Where the press was, for the popover to open beside
   */
  private readonly _openEventDetails = (
    event: Types.CalendarEventData,
    color: string | undefined,
    origin?: Feedback.PressOrigin,
  ): void => {
    if (this._isBeingEdited) {
      Logger.debug('Not opening the event popover while the card is being edited');
      return;
    }

    const params = this._detailsParams(event, color, origin);
    if (params) this._openPopover(params);
  };

  /**
   * The popover's parameters for an existing event.
   *
   * @param event - The event
   * @param color - The accent it is drawn in
   * @param origin - Where the press was, for the popover to open beside
   * @returns The parameters, or undefined for a row that is no event of a calendar
   */
  private _detailsParams(
    event: Types.CalendarEventData,
    color: string | undefined,
    origin?: Feedback.PressOrigin,
  ): Omit<PopoverModel.PopoverParams, 'language' | 'hour24' | 'dark'> | undefined {
    const calendarId = event._entityId;
    const entry = EventDetails.buildDetailEntry(event);
    if (!calendarId || !entry) return undefined;

    const calendar = this._popoverCalendar(calendarId, color);
    const permissions = this._eventPermissions(event, entry);
    // Moving an event writes it to another calendar and deletes it from its own, so it is
    // offered where both are allowed, to the card's other calendars that accept new events.
    const moveTargets =
      permissions.canEdit && permissions.canDelete
        ? this._writableCalendars.filter((id) => id !== calendarId)
        : [];
    return {
      mode: 'event',
      calendarId,
      entry,
      display: EventDetails.displayText(event),
      hidden: EventDetails.hiddenFields(event),
      color: calendar.color,
      calendars: [calendar, ...moveTargets.map((id) => this._popoverCalendar(id))],
      ...permissions,
      anchor: origin,
      updated: (...ids) => this._refreshAfterWrite({ ids: ids.length ? ids : [calendarId] }),
    };
  }

  /**
   * Whether an event may be changed and deleted from this card: what its calendar supports,
   * narrowed by the card's own say (`detailPermissions`).
   *
   * @param event - The rendered event
   * @param entry - The event as stored
   * @returns The two permissions
   */
  private _eventPermissions(
    event: Types.CalendarEventData,
    entry: EventDetails.DetailEntry,
  ): { canEdit: boolean; canDelete: boolean } {
    return EventDetails.detailPermissions(this.safeHass, event, entry, {
      allowEdit: this.config.allow_event_edit !== false,
      allowDelete: this.config.allow_event_delete !== false,
      failedEntities: this._failedEntities,
    });
  }

  /**
   * Opens the event popover through Home Assistant's dialog manager, which puts it above the
   * whole page, closes it on Back and gives focus back afterwards.
   *
   * @param params - The popover's parameters, without what every popover shares
   */
  private _openPopover(
    params: Omit<PopoverModel.PopoverParams, 'language' | 'hour24' | 'dark'>,
  ): void {
    const hass = this.safeHass;
    const dialogParams: PopoverModel.PopoverParams = {
      ...params,
      language: hass?.locale?.language ?? this._language ?? 'en',
      hour24: FormatUtils.resolveTimeFormat24h(this.config, hass),
      dark: this._panelsDark(),
    };
    // A finger lifting as it opens it lifts onto the popover; see `_swallowTouchEnd`. Not a
    // click, whose touch has ended already, nor a pen, which sends no touch events.
    if (this._liftingTouch) {
      this._swallowTouchEndUntil = Date.now() + Constants.TIMING.DERIVED_CLICK_WINDOW;
    }
    const showDialog = new Event('show-dialog', { bubbles: true, composed: true });
    (showDialog as Event & { detail?: unknown }).detail = {
      dialogTag: EventPopover.EVENT_POPOVER_TAG,
      dialogImport: () => customElements.whenDefined(EventPopover.EVENT_POPOVER_TAG),
      dialogParams,
    };
    this.dispatchEvent(showDialog);
    Logger.debug(`Opened the event popover for ${params.calendarId}`);
  }

  /**
   * A calendar as the popover names it: by its name on this card (`CalendarNames`), and its
   * accent resolved to a color that means something outside the card, where the popover is
   * drawn.
   *
   * @param id - The calendar
   * @param color - Its accent where the caller has it already, else the card's for it
   * @returns The calendar
   */
  private _popoverCalendar(id: string, color?: string): PopoverModel.PopoverCalendar {
    const accent =
      color ??
      EventUtils.getEntityAccentColorWithOpacity(
        id,
        this.config,
        undefined,
        undefined,
        EntityColors.entityColors(),
      );
    return {
      id,
      name: CalendarNames.calendarName(id, this.config, this.safeHass),
      color: this._resolvedColor(accent),
    };
  }

  /**
   * A color with the card's own custom properties read out of it, since the popover is drawn
   * outside the card where they are not defined. Theme variables stay as they are: they mean
   * the same everywhere on the page.
   *
   * @param color - A color as the card draws it
   * @returns The same color for use outside the card
   */
  private _resolvedColor(color: string): string {
    const style = getComputedStyle(this);
    let resolved = color;
    for (let depth = 0; depth < 3 && /var\(--calendar-card-/.test(resolved); depth++) {
      resolved = resolved.replace(
        /var\((--calendar-card-[\w-]+)(?:,\s*([^()]*))?\)/g,
        (_match, name: string, fallback?: string) =>
          style.getPropertyValue(name).trim() || fallback?.trim() || 'var(--primary-color)',
      );
    }
    return resolved;
  }

  /**
   * Whether a tap on an event runs something of its own: `event_tap_action` opens the event's
   * details, or is one of Home Assistant's actions, run with the event's fields filled in.
   *
   * `none` and the card's own actions read as nothing (`eventActionKind`): the events stay what
   * they are by default, and a tap on one is a tap on the card. A bare `event_tap_action:` in
   * YAML is `null`, which reads the same way.
   */
  private get _eventTapRuns(): boolean {
    return EventActions.eventActionKind(this.config.event_tap_action) !== 'none';
  }

  /**
   * Whether a hold on an event runs something of its own, read like `_eventTapRuns`: anything
   * else leaves a hold on an event to the card's `hold_action`.
   */
  private get _eventHoldRuns(): boolean {
    return EventActions.eventActionKind(this.config.event_hold_action) !== 'none';
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
   * Whether events are targets of their own: a tap or a hold on one runs an action of its own,
   * and the card is not being edited. While it is, events render and behave as they do with
   * both off. A target is a button, reached by the keyboard, whichever of the two it has.
   */
  private get _eventsActivatable(): boolean {
    return (this._eventTapRuns || this._eventHoldRuns) && !this._isBeingEdited;
  }

  /**
   * Runs an event's own action for a tap or a hold: `event_tap_action` or `event_hold_action`.
   *
   * `details` opens the event's details. One of Home Assistant's actions goes to Home Assistant
   * with the event's fields filled in (`fillEventAction`), and with the event's calendar as its
   * entity, so `more-info` opens the calendar of the event pressed rather than the card's
   * first. An action that names an entity of its own keeps it.
   *
   * @param target - The event and the accent color it is drawn in
   * @param gesture - Whether the event was tapped or held
   * @param origin - Where the press was, for the cue while the dialog loads
   */
  private _runEventAction(
    { event, color }: Activation.EventTapTarget,
    gesture: 'tap' | 'hold',
    origin?: Feedback.PressOrigin,
  ): void {
    const action =
      gesture === 'hold' ? this.config.event_hold_action : this.config.event_tap_action;
    const kind = EventActions.eventActionKind(action);
    if (kind === 'details') {
      Logger.debug(`Executing event ${gesture} action: details`);
      this._openEventDetails(event, color, origin);
      return;
    }
    if (kind !== 'forward' || !action || this._isBeingEdited) return;

    const filled = EventActions.fillEventAction(action, EventActions.eventFields(event));
    if (!filled) {
      Logger.warn(
        `Not running event ${gesture} action: it puts an event's text outside its data or URL query, or its URL would not open over http or https`,
      );
      return;
    }
    Actions.fireHassAction(
      this,
      { entity: event._entityId, [`${gesture}_action`]: filled },
      gesture,
    );
    Logger.debug(`Delegated event ${gesture} action (${filled.action}) to HA native handler`);
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
   * Card width as the observer last reported it, which is what the switcher's words follow.
   *
   * Set from the observer's own callback rather than after the settle delay the view fit
   * waits for: the browser delivers that callback after layout and before paint, and the
   * update it requests runs in the microtask straight after, so the first frame painted
   * already has the right controls. The settle delay would paint the wrong ones first.
   * Null until a width arrives, so a card that is never measured draws icons, and the narrowest
   * start group (`_startFold`): the smallest row it has.
   */
  private _toolbarWidthPx: number | null = null;

  /**
   * The width at which the action row, with the switcher's words, last did not fit on one line,
   * and what it held. See `_syncToolbarLabelFit`.
   */
  private _toolbarLabelsOverflowed: { widthPx: number; signature: string } | null = null;

  /**
   * The card width from which the month heading fits in full beside the arrows, and what that
   * width depends on. See `_syncMonthFit`.
   */
  private _monthFit: { signature: string; fullFromPx: number } | null = null;

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

  /**
   * Whether `localStorage` holds `_hiddenCalendars` as this card last read or wrote it. False
   * once a write was refused, when the set lives in this page only: catching up with the
   * storage then would show calendars someone hid here (`_resyncHiddenCalendars`).
   */
  private _hiddenMatchesStorage = false;

  /**
   * Where a refresh someone asked for stands (`_requestRefresh`): `idle` when none is under
   * way, and then the button and the corner spinner follow `isLoading` alone.
   */
  private _refreshPhase: Toolbar.RefreshPhase = 'idle';

  /** Bumped by every refresh someone asks for and on disconnect, so a stale step never lands. */
  private _refreshTicket = 0;

  /** The timer that moves `_refreshPhase` on to its next step. */
  private _refreshPhaseTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Set for a moment after a press on reset did its work: while the button shows its check, then
   * while it fades out still showing it (`_confirmReset`); the timer that moves it on.
   */
  private _resetConfirmation: 'showing' | 'leaving' | null = null;

  private _resetConfirmTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Set for a moment after a press on home brought the card back, while home shows a filled
   * house (`_pressHome`); the timer that clears it.
   */
  private _homeConfirming = false;

  private _homeConfirmTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * A refresh someone asked for whose load another replaced before it answered, waiting for
   * that load to end before it shows how it went (`_requestRefresh`).
   */
  private _refreshAwaitsLoad: { ticket: number; startedAt: number } | null = null;

  /** `events` without the hidden calendars', and what it was filtered from. */
  private _shownEventsCache: {
    events: Types.CalendarEventData[];
    hidden: ReadonlySet<string>;
    shown: Types.CalendarEventData[];
  } | null = null;

  /**
   * Set once the legend's chips did not all fit in the heading row: what they were drawn with,
   * and the card width from which they fit again. See `_syncLegendFit`.
   */
  private _legendFold: { signature: string; unfoldAtPx: number } | null = null;

  /**
   * The card width the legend's fold is judged at. Kept apart from `_toolbarWidthPx` and
   * moved only by the legend's own pass, a frame after a resize, so a render the resize
   * observer causes never folds or unfolds the legend: that changes the card's height, and a
   * height changed while the browser delivers resize observations is reported as an error.
   */
  private _legendWidthPx: number | null = null;

  /**
   * The card width at which the legend last unfolded, until a measurement at that width
   * confirms the chips fit. A fold that follows before then folds from wider than this, so a
   * lane that itself narrows the card cannot fold and unfold for good: drawing it can make the
   * page tall enough for a scrollbar, which narrows the card under the chips it just drew.
   */
  private _legendUnfoldedAtPx: number | null = null;

  private _legendFitRaf: number | null = null;

  /**
   * What the action row held when it was last drawn, as the start group's plan reckons with it,
   * so a resize can tell whether the plan moves before anything is drawn again
   * (`_syncToolbarLabels`).
   */
  private _toolbarRow: ToolbarFold.ActionRow | null = null;

  /**
   * The fewest of the start group's controls to fold at the width where the row the plan drew did
   * not fit on one line, and what the row held then. See `_syncStartFoldFit`.
   */
  private _startFoldGuard: { widthPx: number; signature: string; atLeast: number } | null = null;

  /**
   * The start group's control that held focus as the coming render began, which the menu button
   * takes over where that render folds it (`_handFocusToMenu`).
   */
  private _focusBeforeFold: ToolbarFold.StartControl | null = null;

  /**
   * Whether the card's tap held focus as the coming render began, on the card itself or on the
   * control standing in for it (`_tapControl`), which `_keepTapFocus` hands to whichever of the
   * two that render draws.
   */
  private _tapFocusBefore: 'card' | 'control' | null = null;

  /**
   * Counts fonts finishing loading while the toolbar is shown, since a chip or the month may
   * change width.
   */
  private _toolbarFontGeneration = 0;

  private _toolbarFontsCleanup: (() => void) | null = null;

  /** The width the switcher's words needed in the toolbar drawn last, which `_syncToolbarLabels` watches for. */
  private _toolbarLabelMinWidthPx: number | null = null;

  /**
   * The search behind the toolbar's magnifier: its year-wide load, kept in memory for this card,
   * and the panel open on it. Made at the first press.
   */
  private _search: SearchSession | null = null;

  /**
   * The event a search pick rings: from the pick until its ring has shown for `SEARCH_RING`, or
   * the page asked for turned out not to draw it. `page` is the page the pick asked for, the only
   * one the ring is drawn on; `until` is set once it is drawn; `focus` until focus has moved to it.
   */
  private _searchRing: {
    target: Search.RingTarget;
    page: string | null;
    until?: number;
    focus: boolean;
  } | null = null;

  private _searchRingTimer?: ReturnType<typeof setTimeout>;

  /** Whether the render just made drew the event a pick rings (`Search.ringIn`). */
  private _searchRingDrawn = false;

  /**
   * Whether no search panel is open or closing, and Home Assistant has had its moment to put
   * focus back on the magnifier: only then may a ringed event take focus, which that would move
   * back otherwise.
   */
  private _searchPanelGone = true;

  /**
   * How `handleAction` runs the actions only the card knows, for one press.
   *
   * @param context - Where the press landed, which `add-event` starts the new event on; none
   *   for a press with no day under it, such as the keyboard on the card
   * @param origin - Where the press was, for the cue while the dialog loads
   * @returns The callbacks
   */
  private _cardActions(
    context?: Activation.DayHit | null,
    origin?: Feedback.PressOrigin,
  ): Actions.CardActionCallbacks {
    return {
      expand: () => this.toggleExpanded(),
      refresh: () => this._requestRefresh(),
      addEvent: () => this._addEventAt(context ?? undefined, origin),
      reset: () => this._resetFromAction(),
      back: (action) => this._goBack(action),
    };
  }

  /**
   * The card's `back` action: back to the page before this one where Home Assistant navigated
   * here from a page of its own, as its back arrow does, and otherwise this page replaced by the
   * action's `navigation_path`, else by the root of this dashboard (`Back.backStep`).
   *
   * The fallback goes through Home Assistant's own `navigate` action, so the card writes no
   * history of its own and Home Assistant routes the page as it routes any other. Nothing runs
   * while the card is being edited: leaving the page would take the editor with it.
   *
   * @param action - The action pressed, for its `navigation_path`
   */
  private _goBack(action: Types.ActionConfig): void {
    if (this._isBeingEdited) {
      Logger.debug('Not going back while the card is being edited');
      return;
    }

    const step = Back.backStep(
      window.history.state,
      window.location.pathname,
      action.navigation_path,
    );
    if (step.kind === 'history') {
      Logger.debug('Going back to the page before this one');
      window.history.back();
      return;
    }

    Logger.debug(`No page of Home Assistant's behind this one; going to ${step.path}`);
    Actions.fireHassAction(
      this,
      { tap_action: { action: 'navigate', navigation_path: step.path, navigation_replace: true } },
      'tap',
    );
  }

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

  /**
   * How many days the events in `events` were loaded for, or null before any load has put
   * events there.
   *
   * Lags the configuration while a wider load is out, as `_pageShown` lags a page: raising
   * `days_to_show` past the days loaded keeps the days on screen those the events cover, rather
   * than adding days that read as empty before anything has been asked about them. Only a
   * complete load moves it, failures included, since the card names a calendar that failed; a
   * partial one has not heard from every calendar yet.
   */
  private _loadedDaysShown: number | null = null;

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

  /**
   * True only while a clock repaint is requesting itself: the now line's tick, or the minute
   * tick of countdowns and progress bars (`_tickClock`). Neither moves a block, so neither
   * counts as a bare request.
   */
  private _clockRepainting = false;

  /**
   * Whether a bare `requestUpdate()`, a clock repaint's included, is waiting in the current
   * batch. `shouldUpdate` skips a batch whose only change is a `hass` that changed nothing
   * drawn, and must never skip one that also carries such a request: a registry color or a
   * forecast arriving in the same microtask as an unrelated state tick would be lost.
   */
  private _bareUpdatePending = false;

  /**
   * One-shot timer for the next time the card draws something different with nothing else
   * changing, and the instant it is set for; see `_nextClockRepaint`.
   *
   * Every unrelated `hass` update used to repaint the card, and that is what kept a countdown,
   * a progress bar and the marks of today moving. The card skips those renders now
   * (`shouldUpdate`), so this repaints in their place.
   */
  private _clockTimerId: number | null = null;

  private _clockTimerAt: number | null = null;

  /**
   * One-shot timer for the next local midnight, held while something on the card moves then
   * and nothing else notices; see `_wantsMidnightTimer`.
   *
   * It re-renders and asks for a cache load, which fetches only if the requested window moved.
   */
  private _midnightTimerId: number | null = null;

  /** The local day the midnight timer was set on, so a midnight it slept through is noticed. */
  private _midnightArmedDay: string | null = null;

  /** Whether the configured start date follows today, for the start date it was worked out for. */
  private _followsTodayCache: { startDate: string | undefined; follows: boolean } | null = null;

  /**
   * One-shot timer for the next moment a timed event starts or ends, or `allday_expires_at`
   * retires an all-day one, held in list and column view and in a grid without its now line,
   * and the instant it is set for.
   *
   * Those views otherwise repaint only when something they draw changes, so an event could keep
   * its "Now" label, or a finished one stay on screen under `show_past_events: false`, until
   * the next refresh. A timeout per boundary rather than a tick: a day with eight events costs
   * sixteen repaints, not 1,440. A grid with its now line needs none of it, because the line's
   * tick already repaints every minute.
   */
  private _nowBoundaryTimerId: number | null = null;

  private _nowBoundaryAt: number | null = null;

  /**
   * The event list and configuration the armed boundary was computed from, so an unrelated
   * update skips the scan.
   */
  private _nowBoundaryEvents: ReadonlyArray<Types.CalendarEventData> | null = null;

  private _nowBoundaryConfig: Types.Config | null = null;

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
    const loadedDays = this._loadedDaysShown;
    const cache = this._effectiveConfigCache;

    if (
      cache &&
      cache.config === config &&
      cache.view === view &&
      cache.loadedDays === loadedDays
    ) {
      return cache.resolved;
    }

    let resolved = ViewConfig.resolveEffectiveConfig(config, view);
    const configuredDays = resolved.days_to_show;
    // Days past those the events were loaded for are drawn once a load covering them lands.
    if (loadedDays !== null && configuredDays > loadedDays) {
      resolved = { ...resolved, days_to_show: loadedDays };
    }

    this._effectiveConfigCache = { config, view, loadedDays, resolved, configuredDays };

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
   * page share its request and its entry. Keyed by the days loaded, which span every view the
   * card can show, so switching views never changes it.
   *
   * The first weekday is resolved here, from the profile as it is now, and counts only where it
   * moves the window (`Helpers.firstDayKeyPart`). So `system` and the weekday it resolves to
   * share a query, a page never depends on it, and home's identity moves when a profile change
   * moves its week. Resolved on every call rather than kept from `setConfig`, which usually runs
   * before Home Assistant hands over `hass`.
   *
   * @param page - First day of the page, or null for home
   * @returns The instance id
   */
  private _instanceIdForPage(page: string | null): string {
    return Helpers.generateDeterministicId(
      this.config.entities,
      ViewConfig.loadedDaysToShow(this.config),
      page ?? this.config.start_date,
      FormatUtils.getFirstDayOfWeek(this.config.first_day_of_week, this.hass?.locale),
    );
  }

  /**
   * The configuration a page's events are loaded with: the page's own, with `days_to_show`
   * as long as the longest view the card can show, so every view draws from one load.
   *
   * @param page - First day of the page, or null for home
   * @returns The configuration to fetch and read the cache with
   */
  private _loadConfigForPage(page: string | null): Types.Config {
    return ViewConfig.loadConfig(this._configForPage(page));
  }

  /**
   * How many days the view on screen spans: its own `days_to_show`. Paging, the date picker and
   * the range follow it at once; only the days drawn wait for a wider load (`_loadedDaysShown`),
   * so pages stay lined up with home whenever the arrows are pressed.
   */
  private get _viewDays(): number {
    void this.effectiveConfig;
    return this._effectiveConfigCache!.configuredDays;
  }

  /** Whether the configuration asks for the date navigation. */
  private get _wantsNavigation(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.navigation;
  }

  /**
   * Whether a swipe across the days pages the card, as the date navigation's arrows do.
   *
   * It comes with the arrows, so a swipe always has a press beside it that does the same. Not
   * while the card is being edited, where the arrows do nothing either, and not while it shows
   * a crammed grid, whose days scroll sideways under the finger instead: one holding its
   * `min_days_to_show` floor below `min_day_width` under `min_days_fallback: cramp`
   * (`columnFitCrams`). A grid configured to cramp that has room for its days swipes. Everywhere
   * else the card keeps the browser's own touch behavior: a card that does not swipe changes
   * nothing at all.
   */
  private get _swipeAvailable(): boolean {
    return (
      this._wantsNavigation &&
      !this._isBeingEdited &&
      !(
        this.effectiveView === 'grid' &&
        ViewConfig.columnFitCrams('grid', this.config, this._measuredWidthPx, {
          view: this._effectiveView,
          columns: this._columnCount,
        })
      )
    );
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
    return Paging.homeRange(this._homeWindowStart(now), this._viewDays, this._shedColumns, now);
  }

  /**
   * The days a page covers as drawn now: as many as the view on screen shows, so switching
   * views keeps a page's first day and changes how far it runs.
   *
   * @param page - First day of the page, or null for home
   * @param now - The current moment
   * @returns The page's days
   */
  private _pageRange(page: string | null, now: Date = new Date()): Paging.PageRange {
    if (page === null) return this._homeRange(now);
    return {
      start: Paging.pageStart(page),
      days: Paging.pageSpan(this._viewDays, this._shedColumns),
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
      ? countRealEvents(
          EventUtils.groupEventsByDay(
            events,
            this.effectiveConfig,
            true,
            language,
            view,
            this.hass,
          ),
        )
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

  /**
   * Whether any view the card can show would draw an event in its own range, for
   * `hide_when_empty`. The view on screen answers first, and usually alone.
   *
   * Each other view is grouped from the raw configuration and resolves its own block there.
   * Never from `effectiveConfig`: that already carries the view on screen's hoisted values,
   * so a view without an override of its own would inherit them — a list with no count of
   * its own would draw the grid's seven days instead of the card's fourteen. Home only, as
   * its one caller is, so the raw configuration is home's.
   *
   * @returns True when some reachable view has an event to draw
   */
  private _anyReachableViewHasEvents(): boolean {
    if (this.visibleEventCount > 0) return true;

    const events = this._shownEvents;
    if (events.length === 0) return false;

    const shown = this.effectiveView;
    return ViewConfig.reachableViews(this.config).some(
      (view) =>
        view !== shown &&
        countRealEvents(
          EventUtils.groupEventsByDay(
            events,
            this.config,
            true,
            this.effectiveLanguage,
            view,
            this.hass,
          ),
        ) > 0,
    );
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
    window.addEventListener(Legend.LEGEND_CHANGED_EVENT, this._handleLegendChanged);
    window.addEventListener('storage', this._handleStorageChanged);
    this._resyncHiddenCalendars();

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
    Menu.closeMenus(this.renderRoot);
    this._search?.close();
    this._settleSearchRing();
    this._toolbarFontsCleanup?.();
    this._toolbarFontsCleanup = null;
    this._settleResetConfirmation();
    this._settleHomeConfirmation();
    if (this._legendFitRaf !== null) {
      cancelAnimationFrame(this._legendFitRaf);
      this._legendFitRaf = null;
    }

    this._weatherSetupVersion++;
    this._weatherSetupPending = false;

    this._cleanupWeatherSubscriptions();

    this._titleSubscription?.destroy();
    this._titleSubscription = undefined;

    // Supersede any in-flight updateEvents. Detached setConfig can move
    // `_instanceId` while a pre-disconnect fetch is still open; without this
    // bump the late response is not superseded, and draws the old calendar's
    // events under the configuration that replaced it until the next load.
    this._eventRequestGeneration++;
    this.isLoading = false;
    this._settleRefreshPhase();

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
    this._swipeArrival = null;
    this._swipeMotion?.cancel();
    this._swipeMotion = null;

    this._stopNowLineTimer();
    this._stopMidnightTimer();
    this._stopNowBoundaryTimer();
    this._stopClockTimer();
    this._cancelPartialCommit();
    this._releaseLive();

    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    window.removeEventListener(
      CalendarChanges.CALENDARS_CHANGED_EVENT,
      this._handleCalendarsChanged,
    );
    window.removeEventListener(Legend.LEGEND_CHANGED_EVENT, this._handleLegendChanged);
    window.removeEventListener('storage', this._handleStorageChanged);

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
        // The card moved under an open menu, which is placed by where its button was, and
        // under the search panel, whose beak points at the magnifier.
        if (this._toolbarWidthPx !== null && Math.abs(width - this._toolbarWidthPx) > 0.5) {
          Menu.closeMenus(this.renderRoot);
          this._search?.close();
        }
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
   * Records the card's width for the toolbar, and re-renders at once if that moves it across the
   * width the switcher's words need, the width the month fits in full from, or a width at which
   * the start group's plan folds a control more or fewer.
   *
   * No hysteresis: a dashboard sizes the card, not the card's content, so neither the switcher's
   * words nor the month's form can feed back into the width they were chosen from, and there is
   * no loop for a band to damp. Whether the switcher shows words also depends on which controls
   * the row draws, so that is decided at render (`_toolbarLabeledFor`); this only notices a
   * threshold being crossed.
   *
   * @param widthPx - Measured card width in CSS pixels
   */
  private _syncToolbarLabels(widthPx: number): void {
    // The switcher's own threshold, the one the row drawn last needs, and the width the month
    // fits in full from.
    const thresholds = [
      Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH,
      this._toolbarLabelMinWidthPx,
      this._monthFit?.fullFromPx,
    ].filter((threshold): threshold is number => typeof threshold === 'number');
    const band = (width: number | null): string =>
      width === null ? '' : thresholds.map((threshold) => (width >= threshold ? 1 : 0)).join('');
    const crossed = band(widthPx) !== band(this._toolbarWidthPx);
    const replanned = this._startHidden(widthPx) !== this._startHidden(this._toolbarWidthPx);
    // Words that overflowed at some width are tried again once the card grows past it.
    const overflowed = this._toolbarLabelsOverflowed;
    const outgrew =
      overflowed !== null &&
      widthPx > overflowed.widthPx &&
      (this._toolbarWidthPx ?? 0) <= overflowed.widthPx;

    // The guard's fold holds at the width it was recorded at, and only there.
    if (widthPx !== this._toolbarWidthPx) this._startFoldGuard = null;
    this._toolbarWidthPx = widthPx;
    if ((crossed || replanned || outgrew) && Config.resolveToolbar(this.config).show) {
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
    // passed before the timer was reacquired. The midnight timer runs in a hidden tab, and
    // records the day it loaded for (`_claimRollover`); otherwise this loads through the
    // cache, as the tick does (`_tickNowLine`).
    const dayKey = FormatUtils.getLocalDateKey(new Date());
    if (this._nowLineDayKey !== null && dayKey !== this._nowLineDayKey) {
      this._nowLineDayKey = dayKey;
      Logger.debug('Local day rolled over while the now-line timer was stopped, refreshing events');
      this.updateEvents('cache');
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
   * Whether the window the card opens with moves as days pass: no start date, or a relative
   * one. Memoized per start date, because resolving one logs and this is read after every
   * update.
   */
  private get _windowFollowsToday(): boolean {
    const startDate = this.config.start_date;
    if (this._followsTodayCache === null || this._followsTodayCache.startDate !== startDate) {
      this._followsTodayCache = {
        startDate,
        follows: EventUtils.startDateFollowsToday(startDate),
      };
    }
    return this._followsTodayCache.follows;
  }

  /**
   * Whether the card needs to hear about midnight from a timer of its own. Each reason is a
   * render that would otherwise draw a new day from the old day's events, until the next
   * refresh or an unrelated update:
   *
   * - A grid or column card shedding day columns keeps today among the ones it draws
   *   (`visibleDayWindowStart`), so its slice moves at midnight even on fixed dates.
   * - A window that follows today moves at midnight, and draws its new last day empty until
   *   new events arrive.
   *
   * A card on fixed dates drawing all of them has nothing that moves at midnight. A grid with its
   * now line hears about midnight from the line's tick as well, up to a minute later, so without
   * the timer its window would wait for the tick. Of the timer and the tick only the first to see
   * the new day loads (`_claimRollover`).
   */
  private get _wantsMidnightTimer(): boolean {
    const shedding =
      (this.effectiveView === 'grid' || this.effectiveView === 'column') &&
      this._shownColumnCount > 0 &&
      this._shownColumnCount < this.effectiveConfig.days_to_show;

    return shedding || this._windowFollowsToday;
  }

  /**
   * Holds a timer for the next local midnight exactly while `_wantsMidnightTimer` asks for one.
   *
   * Reconciled from `updated()`, like the now-line timer, because the column count and the
   * view both change after connection. The timer re-renders once and this re-arms it for the
   * following midnight, so a card left open for a week moves its window every night.
   *
   * Set again on every render with the delay measured then, like the other display timers: a
   * timer the browser held back while the machine slept keeps the delay it had left. And where
   * the day it was set on has already ended, midnight passed while it was held back, so the
   * new day loads at once rather than waiting for the following midnight.
   */
  private _syncMidnightTimer(): void {
    if (!this.isConnected || !this._wantsMidnightTimer) {
      this._stopMidnightTimer();
      return;
    }

    const now = new Date();
    const today = FormatUtils.getLocalDateKey(now);
    const missed =
      this._midnightTimerId !== null &&
      this._midnightArmedDay !== null &&
      this._midnightArmedDay !== today;
    this._stopMidnightTimer();
    this._midnightArmedDay = today;
    if (missed) this._onMidnight();

    // One second past, so the render it causes reads the new day even if the timer fires a
    // little early. Built from local fields, so a DST night is as long as it really is.
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    this._midnightTimerId = window.setTimeout(() => {
      this._midnightTimerId = null;
      this._midnightArmedDay = null;
      this._onMidnight();
    }, nextMidnight.getTime() - now.getTime());
  }

  /** Midnight has passed: repaint, and load the new day where the window moved with it. */
  private _onMidnight(): void {
    this.requestUpdate();
    // A window that follows today moves at midnight — start_of_week only once a week — and
    // drawing the new window from the old window's events shows false empty days. A cache
    // load fetches exactly when the window it asks for has changed.
    if (this._claimRollover()) void this.updateEvents('cache');
  }

  /**
   * Whether the midnight timer is the one to load the new day.
   *
   * A card drawing its now line hears about midnight from the line too: its minute tick, and the
   * timer starting again when a hidden tab comes back, load the new day the first time they see
   * it, and record that day (`_nowLineDayKey`). The timer records it the same way, so of the
   * timer and the line only the first to see the new day loads, and the other only repaints. The
   * cache cannot promise that on its own: a window with no events is kept for seconds only, and a
   * browser may keep nothing.
   *
   * @returns False where the line has already loaded the new day
   */
  private _claimRollover(): boolean {
    if (!this._wantsNowLine) return true;
    const dayKey = FormatUtils.getLocalDateKey(new Date());
    if (this._nowLineDayKey === dayKey) return false;
    this._nowLineDayKey = dayKey;
    return true;
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
   * itself causes, so it walks from one boundary to the next. It reuses the boundary computed
   * from the same events, so the renders in between cost no scan, only setting the timer again.
   */
  private _syncNowBoundaryTimer(): void {
    const wanted =
      this.isConnected && this._wantsNowBoundary && document.visibilityState !== 'hidden';
    // What is drawn, so a hidden calendar's events never wake the card.
    const events = this._shownEvents;
    const config = this.effectiveConfig;

    // An armed timer computed from these same events is still right until it fires: no
    // boundary lies between the moment it was computed and the one it waits for, and a
    // later moment cannot add one. So the renders in between skip the scan.
    const next =
      wanted &&
      this._nowBoundaryTimerId !== null &&
      this._nowBoundaryEvents === events &&
      this._nowBoundaryConfig === config &&
      this._nowBoundaryAt !== null &&
      this._nowBoundaryAt > Date.now()
        ? this._nowBoundaryAt
        : wanted
          ? EventUtils.nextEventBoundary(events, Date.now(), config)
          : null;

    if (next === null) {
      this._stopNowBoundaryTimer();
      return;
    }

    // Set again on every render, with the delay measured now. A timer the browser held back
    // while the machine slept keeps the delay it had left, and would fire late by the length
    // of the sleep; the render on waking is the moment to correct it.
    this._stopNowBoundaryTimer();
    this._nowBoundaryAt = next;
    this._nowBoundaryEvents = events;
    this._nowBoundaryConfig = config;
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
    this._nowBoundaryConfig = null;
  }

  /**
   * Repaints the now line, and the whole card when the local day has rolled over.
   *
   * The rollover check is why this is not simply `requestUpdate()`. At midnight every
   * day header is wrong, "today" has moved to a different column and the events on
   * screen are a day out of date — a repaint would move the line to the top of a column
   * that is no longer today. Loading again is the only thing that fixes that. A grid whose window
   * moves at midnight, by shedding columns or by following today, has a midnight timer of its own,
   * which may have loaded the new day already and recorded it, so the line sees no rollover then
   * (`_claimRollover`). The load goes through the cache, as the timer's does, so it
   * fetches only where nothing fresh is stored for the new window: another card on the same
   * calendars may have fetched it a moment before.
   */
  private _tickNowLine(): void {
    const dayKey = FormatUtils.getLocalDateKey(new Date());

    if (this._nowLineDayKey !== null && dayKey !== this._nowLineDayKey) {
      this._nowLineDayKey = dayKey;
      Logger.debug('Local day rolled over, refreshing events');
      this.updateEvents('cache');
      return;
    }

    this._nowLineDayKey = dayKey;
    this._clockRepainting = true;
    try {
      this.requestUpdate();
    } finally {
      this._clockRepainting = false;
    }
  }

  /**
   * When the card next draws something different with nothing else changing, other than at
   * an event's start or end, which `_syncNowBoundaryTimer` covers.
   *
   * A minute from now while a countdown that names minutes or hours, or a progress bar, is on
   * screen. Otherwise the next local midnight, which moves the mark of today, "Today" and
   * "Tomorrow", a countdown that names days, and the dimming of a past all-day event or empty
   * day, on every card. Null where the now line's own tick repaints every minute anyway.
   *
   * @param now - Epoch milliseconds
   * @returns Epoch milliseconds, or null
   */
  private _nextClockRepaint(now: number): number | null {
    if (this._wantsNowLine) return null;

    const today = new Date(now);
    // One second past, so the render reads the new day even if the timer fires a little early.
    // Built from local fields, so a DST night is as long as it really is.
    const midnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
      0,
      0,
      1,
    ).getTime();

    return this._drawsMovingClockText(now, midnight)
      ? Math.min(now + Constants.TIMING.CLOCK_TICK_INTERVAL, midnight)
      : midnight;
  }

  /**
   * Whether a countdown or a progress bar on screen changes within the next minute or so.
   *
   * A countdown to a start later today reads in minutes or hours; one to a later day reads in
   * days, and moves only at midnight. A progress bar moves while its event runs.
   *
   * @param now - Epoch milliseconds
   * @param midnight - The next local midnight, in epoch milliseconds
   * @returns True when the minute tick is needed
   */
  private _drawsMovingClockText(now: number, midnight: number): boolean {
    const config = this.effectiveConfig;
    const countdown = config.show_countdown;
    const progress = config.show_progress_bar;
    if (!countdown && !progress) return false;

    return this._shownEvents.some((event) => {
      if (event._isEmptyDay) return false;
      if (progress && EventUtils.calculateEventProgress(event) !== null) return true;
      if (!countdown || !event.start?.dateTime) return false;
      const start = new Date(event.start.dateTime).getTime();
      return start > now && start < midnight;
    });
  }

  /**
   * Holds the clock repaint (`_nextClockRepaint`) while the card is connected and visible.
   *
   * Reconciled from `updated()` like the other timers, and set again on every render with the
   * delay measured then. A timer the browser held back while the machine slept keeps the delay
   * it had left, and would fire late by the length of the sleep; the render on waking is the
   * moment to correct it. A render also redraws everything this repaints, so a minute tick
   * pushed back by renders in between loses nothing.
   */
  private _syncClockTimer(): void {
    const next =
      this.isConnected && document.visibilityState !== 'hidden'
        ? this._nextClockRepaint(Date.now())
        : null;

    if (next === null) {
      this._stopClockTimer();
      return;
    }

    this._stopClockTimer();
    this._clockTimerAt = next;
    this._clockTimerId = window.setTimeout(() => this._tickClock(), Math.max(0, next - Date.now()));
  }

  private _stopClockTimer(): void {
    if (this._clockTimerId !== null) {
      clearTimeout(this._clockTimerId);
      this._clockTimerId = null;
    }
    this._clockTimerAt = null;
  }

  /**
   * Repaints for the clock alone. Nothing moves in the grid, so like the now line's tick this
   * is not a bare request: it refits no block (`_gridDisclosureChanged`).
   */
  private _tickClock(): void {
    Logger.debug(`Clock repaint due ${new Date(this._clockTimerAt ?? Date.now()).toISOString()}`);
    this._clockTimerId = null;
    this._clockTimerAt = null;
    this._clockRepainting = true;
    try {
      this.requestUpdate();
    } finally {
      this._clockRepainting = false;
    }
  }

  /**
   * Counts every bare update request except a clock repaint (see `_bareUpdateRequests`), and
   * marks any bare request as pending for `shouldUpdate`.
   *
   * Lit calls this from its own constructor, before the counter's initializer has run, hence
   * the `?? 0`.
   */
  override requestUpdate(...args: Parameters<LitElement['requestUpdate']>): void {
    if (args[0] === undefined) {
      this._bareUpdatePending = true;
      if (!this._clockRepainting) {
        this._bareUpdateRequests = (this._bareUpdateRequests ?? 0) + 1;
      }
    }
    super.requestUpdate(...args);
  }

  /**
   * Skips an update whose only cause is a `hass` that changed nothing the card draws: another
   * entity's state, on a dashboard where something changes every few seconds. Everything else
   * updates, a bare `requestUpdate()` batched with that `hass` included.
   *
   * @param changedProps - Properties changed since the last update
   * @returns False to skip the update
   */
  protected override shouldUpdate(changedProps: PropertyValues): boolean {
    const bare = this._bareUpdatePending;
    this._bareUpdatePending = false;
    if (changedProps.has('hass') && this.hass) LiveCalendars.observeStates(this.hass);
    if (bare || changedProps.size !== 1 || !changedProps.has('hass')) return true;

    return HassRelevance.hassChangeIsVisible(
      changedProps.get('hass') as Types.Hass | undefined,
      this.hass,
      HassRelevance.configEntityIds(this.config),
    );
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
   * The 2px a labeled title keeps under its text gives way before any of that. It is spacing,
   * and where it would cost a row or a line the block has no room for it: a one-hour block at
   * `hour_height: 36px` lost its time row to it. So it is taken out wherever the content
   * overflows, before any row is shortened or withdrawn, and handed back once the rows are
   * settled wherever they leave room for it. It stays out only where it alone decides the
   * fit, which never happens to an unlabeled title, whose summary has no such gap.
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
    // Every pass starts with the gap in, so the title is measured the same way whatever the
    // last pass decided. The hand-back below would correct the outcome anyway, not the reads.
    for (const block of pending) delete block.dataset.gridTitleGap;
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

      const spending = this._applyGridTimeFit(pending);

      // The title settles before anything measures the block's overflow: its first word moves
      // up beside the labels, then it stops at the last whole line the block shows. After the
      // time fit, because the class that reveals the time row also tightens an authored title
      // clamp. Before the wrap and detail decisions, because they ask whether the content
      // overflows, and a title line running past the block's edge answered yes for all of
      // them: a time wrap was demoted, and the rows were withdrawn and then restored, unseen,
      // beneath a title nobody could read whole.
      GridTitleFit.leadGridTitles(titles);
      GridTitleFit.cutGridTitleLines(titles);

      // Take the labeled title's 2px out of every block it does not fit in, before the wrap or
      // any row is asked to pay for it. Harmless where the block has no such gap: the rule
      // that draws it matches nothing there, and the hand-back below clears the attribute.
      const tight = transactions.filter(({ content }) => gridContentOverflows(content));
      for (const { block } of tight) block.dataset.gridTitleGap = 'yielded';

      // A wrap, or a countdown's words flowing onto a line of their own, is decided on width
      // but paid for in height, so settle that here, before anything else competes for the
      // same pixels. Withdrawing it lands on exactly the class set its fallback rung produces,
      // which is what makes the loop underneath see an identical state whether or not any row
      // was ever offered the extra line - so no location, weather, description or progress
      // row can be withdrawn *because* a time row wrapped, or because its countdown took a line
      // a narrower rung would have saved. Where no rung keeps a countdown's words on the
      // time's line, the countdown itself is left out, so its words cannot cost another row a
      // line either. That is the opportunistic constraint, held by construction rather than
      // by ordering care.
      const unaffordable = transactions.flatMap((transaction) => {
        const spent = spending.get(transaction.block);
        return spent && gridContentOverflows(transaction.content) ? [spent] : [];
      });
      for (const { target, fallback } of unaffordable) {
        GridTimeFit.demoteGridTimeFit(target, fallback);
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
      // Hand the gap back wherever the rows that stayed leave room for it, so it stays out only
      // where it alone decides the fit. Where the content overflows either way, a title too tall
      // for its block, the gap returns too: taking it out would change nothing that fits.
      const yielded = transactions.filter(({ block }) => block.dataset.gridTitleGap);
      const fitsWithout = yielded.map(({ content }) => !gridContentOverflows(content));
      for (const { block } of yielded) delete block.dataset.gridTitleGap;
      const decides = yielded.map(
        ({ content }, index) => fitsWithout[index] && gridContentOverflows(content),
      );
      yielded.forEach(({ block }, index) => {
        if (decides[index]) block.dataset.gridTitleGap = 'yielded';
      });
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
   * @returns Each block whose decision spends a line a narrower rung would save, with that
   *   fallback, for the height pass to withdraw where the block cannot pay
   */
  private _applyGridTimeFit(
    blocks: ReadonlyArray<HTMLElement>,
  ): ReadonlyMap<
    HTMLElement,
    { target: GridTimeFit.GridTimeTarget; fallback: GridTimeFit.GridTimeFit }
  > {
    const pairs = blocks
      .map((block) => ({ block, target: GridTimeFit.gridTimeTarget(block) }))
      .filter(
        (pair): pair is { block: HTMLElement; target: GridTimeFit.GridTimeTarget } =>
          pair.target !== null,
      );
    const spending = new Map<
      HTMLElement,
      { target: GridTimeFit.GridTimeTarget; fallback: GridTimeFit.GridTimeFit }
    >();
    if (pairs.length === 0) return spending;

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

    const costs = base.map((measured, index) => ({ ...measured, wrapped: wrapWidths[index] }));
    const fits = costs.map(GridTimeFit.gridTimeFit);
    pairs.forEach(({ block, target }, index) => {
      GridTimeFit.applyGridTimeFit(target, fits[index]);
      const fallback = GridTimeFit.gridTimeFallback(costs[index], fits[index]);
      if (fallback) spending.set(block, { target, fallback });
    });

    return spending;
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
   * Whether this update's `hass` moved the window home opens with, the configuration unchanged.
   *
   * `first_day_of_week: system` follows the profile: its first weekday, or its language when that
   * is left at the language's default. Under a week-relative `start_date` a profile change therefore
   * moves home, which the card draws at once, and moves home's query identity and cache key, which
   * both follow the resolved weekday, while nothing asked for the new window: the card drew it with
   * the old window's events, without any on the day it gained, until its next refresh. A page is not
   * asked for again, since its first day is a date; home loads when the card goes back to it.
   *
   * @param changedProps - Properties changed in this update
   * @returns True when home now starts on another day of the week
   */
  private _homeWeekMoved(changedProps: PropertyValues): boolean {
    const previous = changedProps.get('hass') as Types.Hass | undefined;
    const startDate = this.config?.start_date;
    if (!previous || !this.hass || this._pageRequested !== null) return false;
    if (typeof startDate !== 'string' || !StartDate.isWeekRelative(startDate)) return false;

    const setting = this.config.first_day_of_week;
    return (
      FormatUtils.getFirstDayOfWeek(setting, previous.locale) !==
      FormatUtils.getFirstDayOfWeek(setting, this.hass.locale)
    );
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
    // Three things on screen depend on the width without being the dashboard's layout: which
    // views the switcher offers, which can change while the layout does not, the day
    // columns the configured view is fitted to while it is being edited, and whether a grid
    // holding its days is crammed, which decides whether it swipes (`_swipeAvailable`).
    const offeredBefore = this._offeredViewsKey();
    const shownBefore = this._shownColumnCount;
    const swipeBefore = this._swipeAvailable;

    this._measuredWidthPx = widthPx;

    if (next.view === this._effectiveView && next.columns === this._columnCount) {
      if (
        this._offeredViewsKey() !== offeredBefore ||
        this._shownColumnCount !== shownBefore ||
        this._swipeAvailable !== swipeBefore
      ) {
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
    // render that takes the button away: the legend unfolding or going, every control of the
    // start group coming back into the row, or editing starting.
    if (Menu.hasOpenMenu(this.renderRoot, 'legend') && !this._legendMenuMayStayOpen()) {
      Menu.closeMenus(this.renderRoot, 'legend');
    }
    if (Menu.hasOpenMenu(this.renderRoot, 'overflow') && !this._startMenuMayStayOpen()) {
      Menu.closeMenus(this.renderRoot, 'overflow');
    }
    // The search panel, likewise, before the card is edited or hidden, or loses its magnifier.
    if (this._search?.isOpen && (this._isBeingEdited || this.hidden || !this._searchButton())) {
      this._search.close();
    }
    this._focusBeforeFold = this._focusedStartControl();
    this._tapFocusBefore = this._focusedTapTarget();

    if (
      changedProps.has('hass') ||
      (changedProps.has('config') && changedProps.get('config')?.language !== this.config.language)
    ) {
      this._language = Localize.getEffectiveLanguage(this.config.language, this.hass?.locale);
    }
  }

  updated(changedProps: PropertyValues) {
    this._syncNewShown();
    this._keepTapFocus();

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
    this._syncReplacedRefresh();
    this._syncNowBoundaryTimer();
    this._syncClockTimer();
    this._syncSwipeArrival();
    // The same gate as the disclosure pass: a hass refresh that changed nothing this card
    // draws re-measures neither, and neither does a clock repaint. A resize reaches
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
    } else if (!this._appearLoadPending && this._homeWeekMoved(changedProps)) {
      this.updateEvents('cache');
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
    this._syncMonthFit();
    this._syncHeadingMiddle();
    this._syncLegendFit(false);
    this._handFocusToMenu();
    this._syncStartFoldFit();
    this._syncSearchRing();
    Legend.markShortenedChips(this.renderRoot);
    Menu.repositionMenus(this.renderRoot);
    Toolbar.paintSelectedView(this.renderRoot);
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
    // by the legend, that hid itself would take with it the only way back. And only when no
    // view the card can show has an event: a seven-day view can be empty where a fourteen-day
    // one is not, and hiding for it would take the view switcher with it.
    const shouldHide =
      this.config.hide_when_empty === true &&
      this._pageRequested === null &&
      this._pageShown === null &&
      this._activeHiddenCalendars.size === 0 &&
      !this.preview &&
      !this.editMode &&
      !isErrorState &&
      !this._hasFetchError &&
      !this._anyReachableViewHasEvents();

    if (this.hidden === shouldHide) {
      return;
    }

    Logger.debug(`hide_when_empty: ${shouldHide ? 'hiding' : 'revealing'} card`);

    // A menu open over a card about to hide would keep the page inert under nothing visible.
    if (shouldHide) {
      Menu.closeMenus(this.renderRoot);
      this._search?.close();
    }

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
  // TITLE SCROLL (scroll_long_titles, and time_position: title)
  //-----------------------------------------------------------------------------

  /**
   * Reconciles horizontal title scrolling after every render.
   *
   * Measurement observers rebind as titles change; the visible cohort and native clocks
   * survive those rebinds. A card on which no title can scroll returns immediately: see
   * `Helpers.titlesScroll`, which `time_position: title` turns on as well.
   *
   * Shares the detached-card guard the other reconcilers use, and re-measures after a
   * card/title resize, a late font load, or an inherited style or direction change.
   * This `updated()` pass is the backstop after a config or data change. A separate
   * IntersectionObserver pauses the animation while the card is off-screen — these live
   * on 24/7 wall panels.
   */
  private _syncTitleScroll(): void {
    if (!this.isConnected || !Helpers.titlesScroll(this.effectiveConfig, this.effectiveView)) {
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
      if (!this.isConnected || !Helpers.titlesScroll(this.effectiveConfig, this.effectiveView)) {
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
    this._syncClockTimer();

    if (document.visibilityState === 'visible') {
      // A boundary, a minute or midnight may have passed while the tab was hidden and its
      // timers stopped.
      if (this._wantsNowLine || this._wantsNowBoundary) {
        this.requestUpdate();
      }

      this._resyncHiddenCalendars();

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
   * Follow the live subscriptions of the window on screen, after every load and whenever one of
   * its calendars changes.
   *
   * Holds the window's subscriptions and releases the rest. Where a subscription holds other
   * events than the card drew (`EventUtils.liveDrift`), a push or one that came while a load was
   * out, a `live` load takes them from it: every change reaches the screen through
   * `updateEvents`, with its ticket, its cache and its failures. Arms the refresh timer while a
   * calendar is not live, at the entry's own deadline, and drops it once all are.
   *
   * Waits while a load is out: that load runs it when it ends.
   */
  private _syncLive(): void {
    if (this._liveSyncTimer !== null) {
      clearTimeout(this._liveSyncTimer);
      this._liveSyncTimer = null;
    }
    const hass = this.safeHass;
    if (!this.isConnected || !hass || !this.config.entities?.length || this.isLoading) return;

    if (this._liveConnection !== hass.connection) {
      this._liveUnlisten?.();
      this._liveUnlisten = LiveCalendars.listen(hass, this._onLiveChange);
      this._liveConnection = hass.connection;
    }

    const page = this._pageShown;
    const config = this._loadConfigForPage(page);
    const scope = EventUtils.liveScope(hass, config);
    const releases = scope.entityIds.flatMap(
      (entityId) => LiveCalendars.hold(hass, entityId, scope.window) ?? [],
    );
    for (const release of this._liveReleases) release(0);
    this._liveReleases = releases;
    this._liveCalendars = new Set(scope.entityIds);

    const store: EventUtils.CacheStore = page === null ? 'persistent' : 'page';
    const live = releases.length > 0 && LiveCalendars.allLive(hass, scope.entityIds, scope.window);
    if (releases.length === 0 || !live) {
      // Some calendar is not live: poll, at the entry's own deadline, unless a timer is armed.
      if (!this._refreshTimerId) {
        const snapshot = EventUtils.readEventSnapshot(
          hass,
          config,
          this._instanceIdForPage(page),
          store,
        );
        this._scheduleRefresh(snapshot?.nextAttemptAt ?? Date.now() + this._refreshIntervalMs());
      }
      if (releases.length === 0) return;
    }

    const drift = EventUtils.liveDrift(hass, config, this._drawnRaw, this._failedEntities).join();
    if (drift && drift !== this._liveDriftLoaded) {
      Logger.info(`Live update: ${drift}`);
      this._liveDriftLoaded = drift;
      void this.updateEvents('live');
      return;
    }

    if (live && this._refreshTimerId) {
      // Every load arms the timer as it ends (`_scheduleRefresh`); with nothing to poll, this
      // takes it down again.
      Logger.debug('Every calendar shown is live; not polling');
      clearTimeout(this._refreshTimerId);
      this._refreshTimerId = undefined;
    }
  }

  /**
   * Run `_syncLive` in the next task when a calendar the card shows changed live.
   *
   * @param entityId The calendar
   */
  private readonly _onLiveChange = (entityId: string): void => {
    // The search covers every calendar the card names, and decides itself whether this was a
    // real change to one of them (`LiveCalendars.eventChanges`).
    this._search?.calendarsChanged();
    if (entityId !== '*' && !this._liveCalendars.has(entityId)) return;
    if (this._liveSyncTimer !== null) return;
    this._liveSyncTimer = window.setTimeout(() => {
      this._liveSyncTimer = null;
      this._syncLive();
    }, 0);
  };

  /**
   * Let go of the live subscriptions, keeping them open a while in case the card comes back.
   */
  private _releaseLive(): void {
    if (this._liveSyncTimer !== null) {
      clearTimeout(this._liveSyncTimer);
      this._liveSyncTimer = null;
    }
    for (const release of this._liveReleases) release(LiveCalendars.DISCONNECT_LINGER);
    this._liveReleases = [];
    this._liveCalendars = new Set();
    this._liveUnlisten?.();
    this._liveUnlisten = null;
    this._liveConnection = null;
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
   * This is also the one moment the targets are known. The capture below retargets every
   * later event of the gesture, the click included, to `ha-card`, so the event the pointer
   * landed on, or the day and in a grid's time area the hour, is read from this
   * pointer-down's path and position and held until pointer-up. A press arms only when it
   * could end in something: an action of the card's own, the event's own, a day that adds
   * an event, or a swipe. So turning any of them on changes nothing about a press anywhere
   * else.
   */
  private _handlePointerDown(ev: PointerEvent) {
    // A second contact while a new event is drawn has thrown it away already
    // (`_draftSecondContact`), and is no new gesture of its own.
    if (this._draft && ev.pointerId !== this._activePointerId) return;
    if (typeof ev.button === 'number' && ev.button !== 0) {
      return;
    }
    // A press on a link in an event's row is the link's: the browser follows it, so it is no
    // tap or hold on anything of the card's, and arms only for a swipe, which a finger may
    // start anywhere on the days.
    const onLink = this._startsOnRowLink(ev);
    const tapTarget = onLink ? undefined : this._eventTapAt(ev);
    const dayHit = onLink || tapTarget ? undefined : this._dayHitAt(ev);
    // A press on an event, a day or a link is theirs, so the card's ripple stays still for it
    // from start to end; the stylesheet reads the mark, and the next press anywhere else clears
    // it.
    (ev.currentTarget as Element | null)?.toggleAttribute?.(
      'data-own-press',
      Boolean(onLink || tapTarget || dayHit),
    );
    const swipeable = this._swipeStartsAt(ev);
    const draftFrom = this._draftAnchorFor(dayHit);
    const moveFrom = this._moveFrom(ev, tapTarget);
    // A press where a new event may be drawn has a hold of its own, which draws one, and so does
    // a press on an event a drag may move, which lifts it.
    const holds =
      !onLink &&
      (draftFrom !== undefined || moveFrom !== undefined || this._holdRunsFor(tapTarget));
    // A press arms only when it could end in something: the card's own tap or hold, the
    // event's own, the day under it, or a swipe. Any other press is left wholly to the browser.
    if (
      onLink ? !swipeable : !this._hasTapAction && !holds && !tapTarget && !dayHit && !swipeable
    ) {
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
    this._pointerDayHit = dayHit ?? null;
    this._pointerAddContext = onLink ? null : (this._addContextAt(ev) ?? null);
    this._pointerDayAdd = onLink ? null : (this._dayAddAt(ev)?.element ?? null);
    this._pointerSwipeable = swipeable;
    this._pointerOnLink = onLink;
    this._pointerDraftFrom = draftFrom ?? null;
    this._move = moveFrom ?? null;
    // A new gesture: whatever click the last one owed has had its chance.
    this._derivedClick = null;
    // Not for a link: capture would retarget the click a tap derives to `ha-card`, and the
    // link would never see it. A swipe needs no capture to be followed, and a finger that
    // moved far enough to page derives no click at all.
    if (!onLink) this._captureActivePointer(ev);
    this._washDay(dayHit);

    // Defensive cleanup for an indicator left by an externally interrupted prior
    // gesture. Ordinary multi-touch never reaches here: the active/primary guard above
    // keeps the first contact's indicator and ownership intact.
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }

    // The timer runs only when a hold would run something: the event's own hold, else the
    // card's. Arming it for an action pointer-up would then refuse to run drew a hold indicator
    // for nothing and swallowed the tap with it; a bare `hold_action:` in YAML, which means
    // "nothing on hold", once did exactly that (`_cardActionRuns`).
    if (holds) {
      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
      }

      this._holdTimer = window.setTimeout(() => {
        if (this._activePointerId === ev.pointerId) {
          this._holdTriggered = true;
          // The hold indicator is a hold's feedback; the day's wash promised a tap.
          this._washDay(undefined);

          // The slot's own hold: the draft is its feedback, under the finger.
          if (this._pointerDraftFrom) {
            this._startDraft();
            return;
          }

          // An event's that a drag may move: it lifts, under the finger. Lifted and let go where
          // it was, the hold runs what it always ran (`_handlePointerUp`).
          if (this._move) {
            this._startMove();
            return;
          }

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
   * Keeps the new event's block in step with a render: painted again, so its label follows the
   * language and the time format, and taken away once the grid shows other days (and a press
   * drawing it thrown away).
   */
  private _syncNewShown(): void {
    const shown = this._newShown;
    if (!shown) return;
    if (this._draftContext() !== shown.context) {
      if (this._drawingPress) this._draftStillShown();
      else this._dropNew();
      return;
    }
    this._paintNew();
  }

  /**
   * Whether the active press is drawing on the grid: a new event (`_draft`), or an event it
   * moves, once lifted (`_move`). Escape, a second contact, and the days giving way to others
   * end either, and a finger's scroll is refused while either is under way.
   */
  private get _drawingPress(): boolean {
    return Boolean(this._draft || this._move?.started);
  }

  /**
   * Where a press may draw a new event from: a grid's time area or its all-day band, while a
   * tap on a day adds an event there (`_dayTapsActive`), so the same switch turns both on.
   *
   * @param hit - The day the press landed on, if any
   * @returns The draft's anchor, or undefined where nothing may be drawn
   */
  private _draftAnchorFor(hit: Activation.DayHit | undefined): GridDraft.DraftAnchor | undefined {
    if (!hit || this.effectiveView !== 'grid' || !this._dayTapsActive) return undefined;
    if (hit.allDay) return { allDay: true, timestamp: hit.timestamp };
    if (hit.minute === undefined) return undefined;
    return { allDay: false, point: { timestamp: hit.timestamp, minute: hit.minute } };
  }

  /**
   * Begins drawing a new event, from the slot or day the press is on: what a tap there would
   * add, until the pointer moves (`_moveDraft`). Escape throws it away.
   */
  private _startDraft(): void {
    const anchor = this._pointerDraftFrom;
    if (!anchor || this._draft) return;
    this._dropNew();
    this._draft = { anchor, moved: false, under: this._pointerDayHit?.element ?? null };
    this._newShown = {
      times: anchor.allDay
        ? GridDraft.allDayDraft(anchor.timestamp, anchor.timestamp)
        : GridDraft.timedDraft(anchor.point, anchor.point, false),
      title: '',
      calendarId: this._draftCalendarId(),
      context: this._draftContext(),
      inPopover: false,
      saved: false,
      arrived: false,
    };
    window.addEventListener('keydown', this._draftKeyDown, true);
    window.addEventListener('pointerdown', this._draftSecondContact, true);
    this._paintNew();
  }

  /**
   * What the grid shows now, as far as a draft depends on it: the view, the page, whether a tap
   * on a day still adds, and the days drawn.
   *
   * @returns A string that changes whenever any of them does
   */
  private _draftContext(): string {
    const days = [...this.renderRoot.querySelectorAll('.grid-day-body')].map((body) => {
      const slot = Activation.daySlotOn(body);
      return slot?.kind === 'time' ? GridDraft.dayOf(slot.timestamp) : '';
    });
    return [this.effectiveView, this._pageShown, this._drawsNewEvents, ...days].join('|');
  }

  /**
   * Whether the draft, or the event a press moves, still stands on the days the grid shows;
   * throws it away, and the press with it, where it does not.
   *
   * @returns True while the draft may go on
   */
  private _draftStillShown(): boolean {
    if (!this._drawingPress || !this._newShown) return false;
    if (this._draftContext() === this._newShown.context) return true;
    Logger.debug('The days an event was drawn on are gone; throwing the press away');
    this._endGesture();
    return false;
  }

  /**
   * A second contact anywhere while a new event is drawn, or an event moved, throws it away.
   * Heard on the window in the capture phase, because the toolbar's controls keep their presses
   * from the card (`stopCardGesture`) and a second finger on one would otherwise never be heard.
   */
  private readonly _draftSecondContact = (ev: PointerEvent): void => {
    if (this._drawingPress && ev.pointerId !== this._activePointerId) this._endGesture();
  };

  /**
   * Follows the pointer while a new event is drawn: the slot under it in the time area of the
   * day whose column is nearest, or that day in the all-day band, which may be another day
   * than the one the press began on.
   *
   * @param x - The pointer's viewport x
   * @param y - The pointer's viewport y
   */
  private _moveDraft(x: number, y: number): void {
    if (!this._draftStillShown()) return;
    const draft = this._draft;
    const shown = this._newShown;
    if (!draft || !shown) return;
    const anchor = draft.anchor;
    const before = shown.times;
    if (anchor.allDay) {
      const day = Activation.nearestDayAt(this.renderRoot.querySelectorAll('.grid-day-header'), x);
      if (!day) return;
      shown.times = GridDraft.allDayDraft(anchor.timestamp, day.timestamp);
      draft.under = day.element;
    } else {
      const day = Activation.nearestDayAt(this.renderRoot.querySelectorAll('.grid-day-body'), x);
      if (!day?.band) return;
      const point = {
        timestamp: day.timestamp,
        minute: Activation.minuteAt(
          day.element.getBoundingClientRect(),
          y,
          day.band.startMin,
          day.band.endMin,
        ),
      };
      if (!GridDraft.sameSlot(point, anchor.point)) draft.moved = true;
      shown.times = GridDraft.timedDraft(anchor.point, point, draft.moved);
      draft.under = day.element;
    }
    // A pointer moves many times within one quarter hour; only a new span is drawn again.
    if (GridDraft.sameSpan(before, shown.times)) return;
    this._paintNew();
  }

  /**
   * Draws the new event as the grid draws its events: on each day it covers, the timed block it
   * will be once saved, or for an all-day one the banner, through the grid's own templates, so
   * every option that styles an event styles it. Each is rendered into an element of its own,
   * `NEW_EVENT_HOST_CLASS`, put into the day's plane or the all-day band, which the grid's
   * structure observer leaves alone: that it comes and goes changes nothing else the grid
   * draws, and its block is fitted on its own (`_fitNewBlocks`). Every render paints it again.
   * A banner on days with no all-day event of their own opens the band it is drawn into
   * (`_openBandForNew`).
   */
  private _paintNew(): void {
    const shown = this._newShown;
    if (!shown) {
      this._clearNewDrawing();
      this._markMoveOrigin();
      return;
    }
    const config = this.effectiveConfig;
    const language = this.effectiveLanguage;
    const hass = this.safeHass;
    const daysOn = (selector: string, kind: 'day' | 'time') =>
      [...this.renderRoot.querySelectorAll(selector)].flatMap((element) => {
        const slot = Activation.daySlotOn(element);
        return slot?.kind === kind ? [{ element, slot, day: GridDraft.dayOf(slot.timestamp) }] : [];
      });
    const wanted = new Map<Element, unknown>();
    if (shown.times.allDay) {
      const headers = daysOn('.grid-day-header', 'day');
      const dayStarts = headers.map(({ day }) => day);
      const byDay = this._newEventByDay(shown, dayStarts);
      const columns = dayStarts.flatMap((day, column) => (byDay.has(day) ? [column] : []));
      const shownAs = byDay.values().next().value;
      const banners: unknown[] = [];
      if (shownAs && columns.length) {
        // As the grid lays out a banner: the event's whole span, over each run of its days.
        const event = { ...shownAs, ...(shownAs._gridSource ?? {}) };
        let runStart = 0;
        for (let index = 1; index <= columns.length; index++) {
          if (index < columns.length && columns[index] === columns[index - 1] + 1) continue;
          const first = columns[runStart];
          const run = dayStarts.slice(first, columns[index - 1] + 1).map((day) => new Date(day));
          const placement = GridUtils.computeBannerPlacement(event, run);
          if (placement) {
            banners.push(
              GridRender.renderNewBanner(
                event,
                { ...placement, columnIndex: placement.columnIndex + first },
                config,
                language,
                hass,
              ),
            );
          }
          runStart = index;
        }
      }
      // Where the days shown hold no all-day event there is no band yet: the render this asks
      // for opens one, and paints the banner into it.
      this._openBandForNew(banners.length > 0);
      const band = this.renderRoot.querySelector('.grid-allday-band');
      if (band && banners.length) wanted.set(band, banners);
    } else {
      this._openBandForNew(false);
      const bodies = daysOn('.grid-day-body', 'time');
      const byDay = this._newEventByDay(
        shown,
        bodies.map(({ day }) => day),
      );
      const showNowLine = ViewConfig.resolveTimeGridOption(config, 'show_now_line');
      const now = new Date();
      now.setSeconds(0, 0);
      for (const { element, slot, day } of bodies) {
        const plane = element.querySelector(':scope > .grid-day-plane');
        const event = byDay.get(day);
        const extent = event && GridUtils.segmentMinutes(event);
        if (slot.kind !== 'time' || !plane || !event || !extent) continue;
        const band = { startMin: slot.startMin, endMin: slot.endMin, usedFallback: false };
        // As the grid draws the line over the block under way, on today's column only.
        const nowMin =
          showNowLine &&
          day === GridDraft.dayOf(now.getTime()) &&
          GridUtils.computeNowLinePct(now, band) !== null
            ? GridUtils.minutesFromMidnight(now)
            : null;
        const raised = this._coversAnEvent(plane, extent.startMin, extent.endMin, band);
        wanted.set(
          plane,
          GridRender.renderNewTimedEvent(
            { ...event, ...extent },
            band,
            raised,
            nowMin,
            config,
            language,
            this.weatherForecasts,
            hass,
          ),
        );
      }
    }

    for (const [holder, host] of this._newHosts) {
      if (!wanted.has(holder) || host.parentNode !== holder) this._removeNewHost(holder);
    }
    for (const [holder, template] of wanted) {
      let host = this._newHosts.get(holder);
      if (!host) {
        host = document.createElement('div');
        host.className = GridRender.NEW_EVENT_HOST_CLASS;
        host.setAttribute('data-add-draft', '');
        host.setAttribute('aria-hidden', 'true');
        litRender(template, host, { host: this });
        holder.append(host);
        this._newHosts.set(holder, host);
      } else {
        litRender(template, host, { host: this });
      }
    }
    this._fitNewBlocks();
    this._markMoveOrigin();
  }

  /**
   * Whether the new event's piece of a day lies over an event the day draws, which is when it
   * is drawn raised, hiding what is beneath it as a block over another does.
   *
   * @param plane - The day's plane
   * @param fromMin - Where the piece starts, in minutes of the day
   * @param untilMin - Where it ends
   * @param band - The day's visible band
   * @returns True where it covers part of one
   */
  private _coversAnEvent(
    plane: Element,
    fromMin: number,
    untilMin: number,
    band: { startMin: number; endMin: number },
  ): boolean {
    const { topPct, heightPct } = Activation.spanPct(fromMin, untilMin, band);
    return [...plane.querySelectorAll<HTMLElement>(':scope > .grid-event')].some((block) => {
      const top = parseFloat(block.style.getPropertyValue('--calendar-card-grid-block-top'));
      const height = parseFloat(block.style.getPropertyValue('--calendar-card-grid-block-height'));
      return top < topPct + heightPct && topPct < top + height;
    });
  }

  /**
   * Has the new event's blocks fitted as any block is: its title clamped to the room it has,
   * and fitted again whenever it is resized or its text changes, as the grid's observers do for
   * every block, with its title scrolling where long titles scroll. The full refit a block's
   * arrival sets off elsewhere would measure every block on the grid, twice a press, for one
   * that changes nothing about them. A block that has gone, with its host or replaced inside
   * it, is forgotten.
   */
  private _fitNewBlocks(): void {
    for (const block of [...this._newObserved]) {
      if (block.isConnected) continue;
      for (const [target, observed] of this._gridDisclosureTargets) {
        if (observed !== block) continue;
        this._gridDisclosureObserver?.unobserve(target);
        this._gridDisclosureTargets.delete(target);
      }
      this._newObserved.delete(block);
    }
    const blocks = [...this._newHosts.values()].flatMap((host) => [
      ...host.querySelectorAll<HTMLElement>(':scope > .grid-event'),
    ]);
    if (!blocks.length) return;
    // A grid with no timed block of its own has no observers yet.
    if (!this._gridDisclosureObserver) this._syncGridDisclosureSafety(false);
    const observer = this._gridDisclosureObserver;
    if (!observer) return;
    let added = false;
    for (const block of blocks) {
      this._newObserved.add(block);
      for (const target of [block, ...block.querySelectorAll('.summary, .event-title')]) {
        if (this._gridDisclosureTargets.has(target)) continue;
        this._gridDisclosureTargets.set(target, block);
        observer.observe(target);
        this._gridDisclosureDirty.add(block);
        added = true;
      }
    }
    if (!added) return;
    this._scheduleGridDisclosureSafety(false);
    this._syncTitleScroll();
  }

  /**
   * Takes the new event out of one element.
   *
   * @param holder - The day's plane or the all-day band it is drawn into
   */
  private _removeNewHost(holder: Element): void {
    this._newHosts.get(holder)?.remove();
    this._newHosts.delete(holder);
  }

  /** Takes the new event off the grid, and its blocks off the observers. */
  private _clearNewDrawing(): void {
    for (const holder of [...this._newHosts.keys()]) this._removeNewHost(holder);
    this._fitNewBlocks();
  }

  /**
   * Ends the press drawing a new event. Its block goes with it, unless the popover has just
   * opened on it, which keeps it until the popover closes (`_newClosed`).
   */
  private _endDraft(): void {
    if (!this._draft) return;
    this._draft = null;
    window.removeEventListener('keydown', this._draftKeyDown, true);
    window.removeEventListener('pointerdown', this._draftSecondContact, true);
    if (!this._newShown?.inPopover) this._dropNew();
  }

  /** Takes the new event's block away, whatever it was waiting for. */
  private _dropNew(): void {
    this._clearNewDrawing();
    this._newShown = null;
    this._markMoveOrigin();
    this._openBandForNew(false);
    if (this._newTimer !== undefined) {
      clearTimeout(this._newTimer);
      this._newTimer = undefined;
    }
  }

  /**
   * Opens the grid's all-day band for the new event's banner, or closes it once the banner goes.
   * A grid draws its band for the all-day events of the days it shows, and a new one is not
   * among them until it is saved and the card's events bring it, so on days without one the
   * band opens, one row, while the banner is drawn: switched to all-day in the popover, the new
   * event would otherwise have nowhere to be drawn. That row is the banner's own, as every row
   * of the band is, so it costs the height one all-day event does. A grid whose days hold an
   * all-day event draws its band anyway, and is unchanged by this. Renders only where it changes.
   *
   * @param open - Whether the new event is drawn as a banner
   */
  private _openBandForNew(open: boolean): void {
    if (open === this._bandOpenForNew) return;
    this._bandOpenForNew = open;
    this.requestUpdate();
  }

  /**
   * Follows the popover adding the new event: its block moves with the times, takes the
   * calendar's color, and is titled as it is typed.
   *
   * @param draft - The popover's draft
   */
  private _followNew(draft: PopoverModel.Draft): void {
    const shown = this._newShown;
    if (!shown?.inPopover) return;
    shown.times = draft.times;
    shown.title = draft.summary;
    shown.calendarId = draft.calendarId;
    shown.location = draft.location;
    shown.description = draft.description;
    this._paintNew();
  }

  /**
   * The popover adding the new event has closed. Thrown away, its block goes at once; saved,
   * it stays until the card's events bring the real event, or a few seconds if they are slow.
   */
  private _newClosed(): void {
    const shown = this._newShown;
    if (!shown?.inPopover) return;
    shown.inPopover = false;
    if (!shown.saved || shown.arrived) {
      this._dropNew();
      return;
    }
    this._awaitArrival(shown);
  }

  /**
   * Keeps a saved block until the refresh after its save brings the real event
   * (`_newArrived`), or a few seconds if the refresh is slow.
   *
   * @param shown - The block saved
   */
  private _awaitArrival(shown: NonNullable<CalendarCardPro['_newShown']>): void {
    if (this._newShown !== shown || shown.arrived) return;
    if (this._newTimer !== undefined) clearTimeout(this._newTimer);
    this._newTimer = window.setTimeout(() => {
      this._newTimer = undefined;
      if (this._newShown === shown) this._dropNew();
    }, Constants.TIMING.NEW_EVENT_HOLD);
  }

  /**
   * The refresh after the new event was saved has put the card's events on it, the real event
   * among them: its block goes, or goes as the popover closes if it is still open. Only that
   * refresh counts, since any other may have started before the save and not carry the event.
   *
   * @param shown - The block the saved event was added from
   */
  private _newArrived(shown: NonNullable<CalendarCardPro['_newShown']>): void {
    if (this._newShown !== shown) return;
    shown.arrived = true;
    if (!shown.inPopover) this._dropNew();
  }

  /**
   * Refuses the `touchend` of a finger that just opened the popover, for a moment: the mouse
   * events and the click a browser derives from a touch arrive where it lifted, on the popover
   * now, and would start editing whichever field is there. The popover guards itself as well
   * (`_ghostGuard`), for a browser that sends `touchend` before the pointer-up that opens it.
   */
  private readonly _swallowTouchEnd = (ev: TouchEvent): void => {
    if (Date.now() > this._swallowTouchEndUntil) return;
    this._swallowTouchEndUntil = 0;
    if (ev.cancelable) ev.preventDefault();
  };

  /**
   * Escape while a new event is drawn, or an event moved, throws it away, and the press with
   * it. Heard on the window, since a pointer press leaves no focus in the card for a key to
   * reach it by.
   */
  private readonly _draftKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !this._drawingPress) return;
    ev.preventDefault();
    ev.stopPropagation();
    this._endGesture();
  };

  /**
   * While a new event is drawn, or an event moved, a finger's movement is the press's, not the
   * page's, so its scroll is refused. Bound without `passive` on `ha-card`, and only on a grid
   * card that adds or moves events (`_drawsNewEvents`, `_movesEvents`), so no other card makes
   * the browser wait on a touch to scroll.
   */
  private readonly _draftTouchMove = {
    handleEvent: (ev: TouchEvent): void => {
      if (this._drawingPress && ev.cancelable) ev.preventDefault();
    },
    passive: false,
  };

  /** Whether a press on this card may draw a new event: a grid whose day taps add. */
  private get _drawsNewEvents(): boolean {
    return this.effectiveView === 'grid' && this._dayTapsActive;
  }

  /**
   * The calendar a new event would be added to, as the popover will preselect it.
   *
   * @returns Its entity id, or undefined where no calendar takes one
   */
  private _draftCalendarId(): string | undefined {
    return AddEvent.preselectedCalendarId(this._writableCalendars, this._activeHiddenCalendars);
  }

  /**
   * The new event as Home Assistant will return it once saved: its title, or "New event", its
   * times, location and description, on its calendar.
   *
   * @param shown - The new event
   * @returns Its event data, before the card has matched it to a calendar entry
   */
  private _newEventSource(
    shown: NonNullable<CalendarCardPro['_newShown']>,
  ): Types.CalendarEventData {
    const { times } = shown;
    const dayAfter = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const span = {
      start: times.allDay
        ? { date: FormatUtils.getLocalDateKey(times.start) }
        : { dateTime: times.start.toISOString() },
      end: times.allDay
        ? { date: FormatUtils.getLocalDateKey(dayAfter(times.end)) }
        : { dateTime: times.end.toISOString() },
    };
    // An event a drag moves is drawn as itself, at its new times.
    if (shown.moving) return { ...shown.moving.source, ...span, _entityId: shown.calendarId };
    return {
      summary: shown.title.trim() || Localize.getTranslations(this.effectiveLanguage).newEvent,
      ...span,
      ...(shown.location?.trim() && { location: shown.location }),
      ...(shown.description?.trim() && { description: shown.description }),
      _entityId: shown.calendarId,
    };
  }

  /**
   * The new event as the card will show it once saved, by day: matched to the calendar entry
   * that will admit it (`processEvents`) and grouped into days as the card's events are
   * (`groupEventsByDay`), so that entry's options, its text replacements and every rule about
   * which days show what apply as they will. Where the card would not show it at all, as a
   * title an entry's filter turns away or a time a hidden past covers, it is split into days as
   * it stands, with its calendar's first entry, so a press drawing it still sees where it goes.
   *
   * @param shown - The new event
   * @param dayStarts - The days the grid shows, as the start of each
   * @returns Its pieces, by the start of the day each is on
   */
  private _newEventByDay(
    shown: NonNullable<CalendarCardPro['_newShown']>,
    dayStarts: readonly number[],
  ): Map<number, Types.CalendarEventData> {
    const config = this.effectiveConfig;
    const source = this._newEventSource(shown);
    const byDay = new Map<number, Types.CalendarEventData>();
    const [matched] = EventUtils.processEvents([source], config);
    if (matched) {
      const days = EventUtils.groupEventsByDay(
        [matched],
        config,
        this.isExpanded,
        this.effectiveLanguage,
        this.effectiveView,
        this.hass,
      );
      for (const day of days) {
        const event = day.events.find((candidate) => !candidate._isEmptyDay);
        if (event) byDay.set(GridDraft.dayOf(day.timestamp), event);
      }
      if (byDay.size) return byDay;
    }
    if (!dayStarts.length) return byDay;
    const entry = config.entities.find(
      (candidate) => typeof candidate === 'object' && candidate.entity === source._entityId,
    );
    const asItStands: Types.CalendarEventData = {
      ...source,
      ...(typeof entry === 'object' && { _matchedConfig: entry }),
    };
    asItStands._entityLabel = EventUtils.getEntityLabel(source._entityId, config, asItStands);
    const first = new Date(Math.min(...dayStarts));
    const last = new Date(Math.max(...dayStarts));
    const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    for (const piece of GridUtils.splitGridEventByDay(asItStands, first, end)) {
      const day = piece.start.dateTime
        ? new Date(piece.start.dateTime)
        : FormatUtils.parseAllDayDate(piece.start.date ?? '');
      byDay.set(GridDraft.dayOf(day.getTime()), piece);
    }
    return byDay;
  }

  /**
   * The box of the draft's piece on one day, for the popover to open beside.
   *
   * @param element - A day's time area, or its header for an all-day draft
   * @returns The box, in viewport coordinates
   */
  private _draftBoxOn(element: Element): Feedback.PressOrigin['rect'] {
    const rect = element.getBoundingClientRect();
    const slot = Activation.daySlotOn(element);
    const times = this._newShown?.times;
    const piece =
      times && !times.allDay && slot?.kind === 'time'
        ? GridDraft.pieceOnDay(times, slot.timestamp)
        : undefined;
    if (!piece || slot?.kind !== 'time') return rect;
    const { topPct, heightPct } = Activation.spanPct(piece.fromMin, piece.untilMin, slot);
    const top = rect.top + (rect.height * topPct) / 100;
    return {
      left: rect.left,
      right: rect.right,
      top,
      bottom: top + (rect.height * heightPct) / 100,
    };
  }

  /**
   * Whether a press on this card may move an event by drag: a grid whose events open their
   * popover (`event_tap_action` or `event_hold_action` is `details`), where it may change them.
   * Which events, among those, is each event's own (`_moveFrom`).
   */
  private get _movesEvents(): boolean {
    if (this.effectiveView !== 'grid' || this._isBeingEdited) return false;
    if (this.config.allow_event_edit === false) return false;
    return [this.config.event_tap_action, this.config.event_hold_action].some(
      (action) => EventActions.eventActionKind(action) === 'details',
    );
  }

  /**
   * The event a press may move, read at pointer-down: a grid's timed block for an event that
   * starts and ends on one day (`movableTimes`) and that the popover may change. Repeating
   * events included; their drop asks which occurrences it moves (`_dropMove`).
   *
   * @param ev - A pointer-down on `ha-card`
   * @param hit - The event it landed on, if any
   * @returns The move it arms, not yet started, or undefined
   */
  private _moveFrom(
    ev: PointerEvent,
    hit: Activation.EventTapHit | undefined,
  ): NonNullable<CalendarCardPro['_move']> | undefined {
    if (!hit || !this._movesEvents || typeof ev.composedPath !== 'function') return undefined;
    const element = hit.element;
    if (!(element instanceof Element) || !element.classList.contains('grid-event')) {
      return undefined;
    }
    const { event } = hit.target;
    const entityId = event._entityId;
    const entry = EventDetails.buildDetailEntry(event);
    if (!entityId || !entry?.uid) return undefined;
    const times = GridMove.movableTimes(entry);
    if (!times || !this._eventPermissions(event, entry).canEdit) return undefined;

    const body = ev.composedPath().find((node) => Activation.daySlotOn(node)?.kind === 'time') as
      Element | undefined;
    const slot = Activation.daySlotOn(body);
    if (!body || slot?.kind !== 'time') return undefined;
    return {
      element,
      target: hit.target,
      entry,
      times,
      key: {
        entityId,
        uid: entry.uid,
        recurrenceId: entry.recurrence_id,
        start: times.start.getTime(),
      },
      grab: {
        timestamp: slot.timestamp,
        minute: GridMove.preciseMinuteAt(
          body.getBoundingClientRect(),
          ev.clientY,
          slot.startMin,
          slot.endMin,
        ),
      },
      started: false,
      left: false,
      under: body,
    };
  }

  /**
   * Lifts the event the press is on: drawn as itself, where it is, raised over its own block,
   * which fades (`_markMoveOrigin`), to follow the pointer from here (`_followMove`). Escape
   * puts it back.
   */
  private _startMove(): void {
    const move = this._move;
    if (!move || move.started || this._draft) return;
    this._dropNew();
    move.started = true;
    this._washDay(undefined);
    if (this._holdIndicator) {
      Feedback.removeHoldIndicator(this._holdIndicator);
      this._holdIndicator = null;
    }
    const { event } = move.target;
    this._newShown = {
      times: move.times,
      title: '',
      calendarId: move.key.entityId,
      context: this._draftContext(),
      inPopover: false,
      saved: false,
      arrived: false,
      moving: { key: move.key, source: event._source ?? event },
    };
    window.addEventListener('keydown', this._draftKeyDown, true);
    window.addEventListener('pointerdown', this._draftSecondContact, true);
    this._paintNew();
  }

  /**
   * Follows the pointer with the event a press moves: the time area of the day whose column is
   * nearest, and as many quarter hours up or down as the pointer went (`movedTimes`).
   *
   * @param x - The pointer's viewport x
   * @param y - The pointer's viewport y
   */
  private _followMove(x: number, y: number): void {
    if (!this._draftStillShown()) return;
    const move = this._move;
    const shown = this._newShown;
    if (!move || !shown) return;
    const day = Activation.nearestDayAt(this.renderRoot.querySelectorAll('.grid-day-body'), x);
    if (!day?.band) return;
    const at = {
      timestamp: day.timestamp,
      minute: GridMove.preciseMinuteAt(
        day.element.getBoundingClientRect(),
        y,
        day.band.startMin,
        day.band.endMin,
      ),
    };
    const times = GridMove.movedTimes(move.times, move.grab, at);
    move.under = day.element;
    if (GridDraft.sameSpan(shown.times, times)) return;
    shown.times = times;
    if (!GridDraft.sameSpan(times, move.times)) move.left = true;
    this._paintNew();
  }

  /**
   * Moves the event where the press let it go. A single event is written at once, as Calendar
   * on macOS moves one, and stays drawn there until the refresh after the write. A repeating one
   * opens its popover at the new times: an occurrence asks first whether the move is for it or
   * for it and every later one, a series stored with its rule offers Save, and either puts it
   * back on Cancel.
   *
   * @param move - The move
   * @param shown - Its block
   * @param ev - The pointer-up
   */
  private _dropMove(
    move: NonNullable<CalendarCardPro['_move']>,
    shown: NonNullable<CalendarCardPro['_newShown']>,
    ev: PointerEvent,
  ): void {
    // An event that repeats, an occurrence of a series or a series stored with its rule, is moved
    // in the popover, which keeps the rule and moves it with the event; written here, the rule
    // would be lost.
    if (!move.entry.recurrence_id && !move.entry.rrule) {
      shown.saved = true;
      this._markMoveOrigin();
      void this._writeMove(move, shown);
      return;
    }
    const box = move.under ? this._draftBoxOn(move.under) : undefined;
    const params = this._detailsParams(move.target.event, move.target.color, {
      x: ev.clientX,
      y: ev.clientY,
      pointerType: ev.pointerType,
      rect: box,
    });
    if (!params) return;
    shown.inPopover = true;
    this._openPopover({
      ...params,
      moved: shown.times,
      updated: (...ids) => {
        if (this._newShown === shown) {
          shown.saved = true;
          this._markMoveOrigin();
        }
        return this._refreshAfterWrite({ ids: ids.length ? ids : [move.key.entityId] }, () =>
          this._newArrived(shown),
        );
      },
      closed: () => {
        if (this._newShown === shown) this._newClosed();
        return undefined;
      },
    });
  }

  /**
   * Writes a single event at the times it was dropped at. Refused, it goes back where it was and
   * Home Assistant shows why, in its own notification.
   *
   * @param move - The move
   * @param shown - Its block, drawn where it was dropped
   */
  private async _writeMove(
    move: NonNullable<CalendarCardPro['_move']>,
    shown: NonNullable<CalendarCardPro['_newShown']>,
  ): Promise<void> {
    const hass = this.safeHass;
    const entityId = move.key.entityId;
    try {
      if (!hass) throw new Error('Home Assistant is not connected');
      await Writes.updateEvent(
        hass,
        { entityId, uid: move.key.uid },
        GridMove.moveWrite(move.entry, shown.times),
      );
    } catch (error) {
      Logger.warn('Moving the event failed', error);
      if (this._newShown === shown) this._dropNew();
      this._notify(Writes.writeErrorMessage(error) ?? 'Unknown error');
      return;
    }
    Logger.debug(`Moved an event of ${entityId}`);
    this._refreshAfterWrite({ ids: [entityId] }, () => this._newArrived(shown));
    this._awaitArrival(shown);
  }

  /**
   * Shows a message in Home Assistant's own notification, at the foot of the screen.
   *
   * @param message - What to say
   */
  private _notify(message: string): void {
    const notification = new Event('hass-notification', { bubbles: true, composed: true });
    (notification as Event & { detail?: unknown }).detail = { message };
    this.dispatchEvent(notification);
  }

  /**
   * Ends the press moving an event. Its block goes with it, unless it was dropped, which keeps
   * it while the popover asks about it or until the refresh after its write brings it.
   */
  private _endMove(): void {
    const move = this._move;
    if (!move) return;
    this._move = null;
    if (!move.started) return;
    // However it ended, the click a browser derives from the press is not a tap on the event:
    // thrown away by Escape or a second contact before the pointer lifted, it would otherwise
    // open the event the press set out to move. Pointer-up guards the same element already.
    this._derivedClick = {
      element: move.element,
      deadline: Date.now() + Constants.TIMING.DERIVED_CLICK_WINDOW,
    };
    if (!this._draft) {
      window.removeEventListener('keydown', this._draftKeyDown, true);
      window.removeEventListener('pointerdown', this._draftSecondContact, true);
    }
    const shown = this._newShown;
    if (shown?.moving && !shown.inPopover && !shown.saved) this._dropNew();
  }

  /**
   * Fades the block of the event a drag moves while it is lifted, and hides it once it is
   * dropped, through an attribute on the block the grid drew, which its structure observers do
   * not see. Found by the event it draws rather than kept from the press, since a render may
   * draw another event in that element meanwhile, and the refresh after the move draws the
   * event in its new place.
   */
  private _markMoveOrigin(): void {
    const shown = this._newShown;
    const key = shown?.moving?.key;
    const state = shown?.saved ? 'dropped' : 'lifted';
    const blocks = this.renderRoot.querySelectorAll(key ? '.grid-event' : '[data-move-origin]');
    for (const block of blocks) {
      const tap =
        key && !block.closest(`.${GridRender.NEW_EVENT_HOST_CLASS}`)
          ? Activation.tapTargetOn(block)
          : undefined;
      const origin =
        key !== undefined &&
        tap !== undefined &&
        GridMove.isMoveOrigin(key, tap.event._entityId, EventDetails.buildDetailEntry(tap.event));
      if (!origin) block.removeAttribute('data-move-origin');
      else if (block.getAttribute('data-move-origin') !== state) {
        block.setAttribute('data-move-origin', state);
      }
    }
  }

  /**
   * Refuses the browser's own text selection and drag while a press is on an event a drag may
   * move, which would otherwise take the pointer from the card.
   */
  private readonly _refuseNativeDrag = (ev: Event): void => {
    if (this._move && ev.cancelable) ev.preventDefault();
  };

  /**
   * Whether a press began on a link drawn in an event's row (`open_links`). See
   * `_pointerOnLink` for what such a press may still do.
   *
   * @param ev - A pointer-down on `ha-card`
   * @returns True when the press is the link's
   */
  private _startsOnRowLink(ev: PointerEvent): boolean {
    if (typeof ev.composedPath !== 'function') return false;
    return Activation.startsOnRowLink(ev.composedPath(), ev.currentTarget);
  }

  /**
   * Whether a hold on a press's target runs something: an event's own hold where it has one,
   * else the card's `hold_action`.
   *
   * @param tapTarget - The event the press landed on, if any
   * @returns Whether a hold would run an action
   */
  private _holdRunsFor(tapTarget: Activation.EventTapHit | undefined | null): boolean {
    return (tapTarget != null && this._eventHoldRuns) || this._hasHoldAction;
  }

  /**
   * The day a press landed on, and in a grid's time area the hour, while a tap on a day adds
   * an event there (`_dayTapsActive`). Undefined on an event, which covers its day, and off the
   * days.
   *
   * @param ev - A pointer-down on `ha-card`
   * @returns Where the press landed, or undefined
   */
  private _dayHitAt(ev: PointerEvent): Activation.DayHit | undefined {
    if (!this._dayTapsActive || typeof ev.composedPath !== 'function') return undefined;
    return Activation.findDayHit(ev.composedPath(), ev.currentTarget, {
      x: ev.clientX,
      y: ev.clientY,
    });
  }

  /**
   * Where a press landed, events walked past, for the card's own `add-event` action: read only
   * while `tap_action` or `hold_action` is `add-event`, so a hold on an event on Thursday adds
   * on Thursday.
   *
   * @param ev - A pointer-down on `ha-card`
   * @returns Where the press landed, or undefined
   */
  private _addContextAt(ev: PointerEvent): Activation.DayHit | undefined {
    const adds = (action: Types.ActionConfig | null | undefined) =>
      action?.action === Constants.ADD_EVENT_ACTION;
    if (!adds(this.config.tap_action) && !adds(this.config.hold_action)) return undefined;
    if (!this._canAddEvents || typeof ev.composedPath !== 'function') return undefined;
    return Activation.findDayHit(
      ev.composedPath(),
      ev.currentTarget,
      { x: ev.clientX, y: ev.clientY },
      true,
    );
  }

  /**
   * The day's add button an input event started on, while there are any.
   *
   * @param ev - An input event dispatched to `ha-card` or inside it
   * @returns The button and its day, or undefined
   */
  private _dayAddAt(ev: Event): { element: EventTarget; timestamp: number } | undefined {
    if (!this._dayTapsActive || typeof ev.composedPath !== 'function') return undefined;
    return Activation.findDayAdd(ev.composedPath(), ev.currentTarget);
  }

  /**
   * Washes the day a press is on, where the new event would go: the date or header, and in a
   * grid's time area the hour a tap there adds. Through an attribute and two custom properties on the day's own
   * element, so the grid's structure observers, which watch elements come and go, see nothing.
   * Undefined unwashes the day washed last.
   *
   * @param hit - The day to wash, or undefined for none
   */
  private _washDay(hit: Activation.DayHit | undefined): void {
    const previous = this._washedDay;
    if (previous) {
      previous.removeAttribute('data-add-pressed');
      if (previous instanceof HTMLElement) {
        previous.style.removeProperty('--calendar-card-add-hour-top');
        previous.style.removeProperty('--calendar-card-add-hour-height');
      }
      this._washedDay = null;
    }
    if (!hit) return;

    hit.element.setAttribute('data-add-pressed', '');
    if (hit.minute !== undefined && hit.band && hit.element instanceof HTMLElement) {
      const { topPct, heightPct } = Activation.spanPct(hit.minute, hit.minute + 60, hit.band);
      hit.element.style.setProperty('--calendar-card-add-hour-top', `${topPct}%`);
      hit.element.style.setProperty('--calendar-card-add-hour-height', `${heightPct}%`);
    }
    this._washedDay = hit.element;
  }

  /**
   * Cancel a pending card gesture once it becomes a scroll or drag.
   *
   * Movement after the hold threshold has already fired does not cancel the
   * hold: the indicator is the user's confirmation that the long-press landed,
   * and a few pixels of slip while lifting is normal on touch. Only motion
   * before that threshold turns the gesture into a drag.
   *
   * A gesture that may become a swipe keeps being followed past that point, and its days
   * follow the finger (`_nudgeSwipe`).
   */
  private _handlePointerMove(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId || !this._pointerStart) return;
    if (this._draft) {
      this._moveDraft(ev.clientX, ev.clientY);
      return;
    }
    if (this._move?.started) {
      this._followMove(ev.clientX, ev.clientY);
      return;
    }
    if (this._holdTriggered) return;

    const deltaX = ev.clientX - this._pointerStart.x;
    const deltaY = ev.clientY - this._pointerStart.y;
    if (!this._pointerMoved) {
      if (Math.hypot(deltaX, deltaY) <= Constants.UI.POINTER_MOVE_TOLERANCE) {
        return;
      }

      // A mouse dragging an event a drag may move moves it at once, as Calendar on macOS does.
      // Moved, it is no tap, and no hold either, since the mouse never held still for one.
      if (this._move && ev.pointerType === 'mouse') {
        if (this._holdTimer) {
          clearTimeout(this._holdTimer);
          this._holdTimer = null;
        }
        this._pointerMoved = true;
        this._startMove();
        this._followMove(ev.clientX, ev.clientY);
        return;
      }

      // A mouse never swipes or scrolls the card, so where a hold would draw a new event, a
      // drag draws it at once, as Calendar on macOS does. Touch and pen hold first.
      if (this._pointerDraftFrom && ev.pointerType === 'mouse') {
        if (this._holdTimer) {
          clearTimeout(this._holdTimer);
          this._holdTimer = null;
        }
        this._holdTriggered = true;
        this._washDay(undefined);
        this._startDraft();
        this._moveDraft(ev.clientX, ev.clientY);
        return;
      }

      this._pointerMoved = true;
      // A moved press is never a tap, so it adds nothing.
      this._washDay(undefined);

      if (this._holdTimer) {
        clearTimeout(this._holdTimer);
        this._holdTimer = null;
      }

      if (this._holdIndicator) {
        Feedback.removeHoldIndicator(this._holdIndicator);
        this._holdIndicator = null;
      }
    }

    if (this._pointerSwipeable) this._nudgeSwipe(deltaX, deltaY);
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
   *
   * A hold, an event's tap, a day's and the card's all need a pointer that stayed put. A
   * gesture that moved, held nothing and could swipe ends as a swipe instead, which pages the
   * card when it went far enough and mostly sideways (`_swipeEnded`).
   */
  private _handlePointerUp(ev: PointerEvent) {
    if (ev.pointerId !== this._activePointerId) return;
    if (typeof ev.button === 'number' && ev.button !== 0) return;
    this._liftingTouch = ev.pointerType === 'touch';

    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }

    // Every press ends in exactly one of four ways (the gesture model in docs/architecture.md).
    // Held: in a grid, a hold on a slot draws a new event, which the release opens in the
    // popover, and a hold on an event a drag may move lifts it, which the release drops where it
    // is let go; one that never left its place runs the event's hold instead. Otherwise the
    // event's own hold where it has one, else the card's, wherever it landed. Stayed: a tap, run
    // by the innermost target that has one: the event's, else the day's where the press was on a
    // day and not on an event, else the card's. Moved: never a tap or a hold on anything; a mouse
    // in a grid draws or moves at once, and otherwise it is a swipe when it can be one. Canceled:
    // `_handlePointerCancel` ends it and runs nothing. A hold cannot fire once the pointer has
    // moved, and movement after it fired only carries what it drew or lifted, so the four never
    // overlap.
    const tapTarget = this._pointerTapTarget;
    const dayHit = this._pointerDayHit;
    // Where the press went down: a pointer that moved after a hold fired still acts on what it
    // held, so the cue belongs there rather than where it was let go. On an event it carries
    // what can be seen of the event, for the popover to open beside; on a day or an empty slot
    // only the point, for it to open right there.
    const pressedAt = this._pointerStart ?? { x: ev.clientX, y: ev.clientY };
    const origin: Feedback.PressOrigin = {
      ...pressedAt,
      pointerType: ev.pointerType,
      rect: tapTarget ? originOf(tapTarget.element)?.rect : undefined,
    };
    const actions = this._cardActions(this._pointerAddContext, origin);
    let ranOffEvents = false;
    const move = this._move?.started && this._draftStillShown() ? this._move : null;
    const moved = move ? this._newShown : null;
    const draft = this._draftStillShown() ? this._draft : null;
    const drawn = draft ? this._newShown : null;
    if (move && moved && move.left) {
      // Let go where it was taken from, it stays; anywhere else it is moved there.
      if (!GridDraft.sameSpan(moved.times, move.times)) {
        this._releasePressFocus();
        this._dropMove(move, moved, ev);
      }
    } else if (draft && drawn) {
      // The new event drawn: the popover opens on it, beside its piece under the pointer, and
      // the block stays while it is open.
      Logger.debug('Adding the event drawn');
      const box = draft.under ? this._draftBoxOn(draft.under) : undefined;
      this._releasePressFocus();
      this._openCreateEventDialog(
        drawn.times,
        { x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType, rect: box },
        true,
      );
      ranOffEvents = true;
    } else if (this._holdTriggered) {
      if (tapTarget && this._eventHoldRuns) {
        this._releasePressFocus();
        this._runEventAction(tapTarget.target, 'hold', origin);
      } else if (this._hasHoldAction) {
        Logger.debug('Executing hold action');
        this._releasePressFocus();
        Actions.handleAction(this, this.config, 'hold', actions);
      }
    } else if (!this._pointerMoved) {
      if (this._pointerOnLink) {
        // The link's own tap: the browser follows it with the click it derives.
      } else if (tapTarget && this._eventTapRuns) {
        this._releasePressFocus();
        this._runEventAction(tapTarget.target, 'tap', origin);
      } else if (dayHit && this._dayTapsActive) {
        Logger.debug('Executing day tap action');
        this._releasePressFocus();
        this._addEventAt(dayHit, origin);
        ranOffEvents = true;
      } else if (this._hasTapAction) {
        Logger.debug('Executing tap action');
        this._releasePressFocus();
        Actions.handleAction(this, this.config, 'tap', actions);
        ranOffEvents = true;
      }
    } else if (this._pointerSwipeable) {
      const start = this._pointerStart;
      if (start) this._swipeEnded(ev.clientX - start.x, ev.clientY - start.y);
    }

    // The click a browser derives from this gesture is not a second activation. Guarded for
    // the event or the day's add button the gesture began on, whatever it was, or for no
    // element after a tap elsewhere on the card or a day; a gesture that ran nothing and began
    // off those owes nothing that could act. See `_derivedClick`.
    const owedBy = tapTarget
      ? tapTarget.element
      : (this._pointerDayAdd ?? (ranOffEvents ? null : undefined));
    this._derivedClick =
      owedBy === undefined
        ? null
        : { element: owedBy, deadline: Date.now() + Constants.TIMING.DERIVED_CLICK_WINDOW };

    this._endGesture();
  }

  /**
   * Leaves no focus in the card after a press by pointer that runs something.
   *
   * A mouse press focuses the button it lands on, an event or a day, or the card itself. Home
   * Assistant gives focus back to whatever held it when one of its dialogs opened, by script,
   * once the dialog closes, and a browser shows a ring for a script's focus that follows the
   * dialog's own keyboard-like focus, so the event or day pressed stayed ringed after its dialog
   * closed, as though it had been reached from the keyboard. Released before the action runs,
   * since Home Assistant notes the focus as it opens the dialog. The keyboard and assistive
   * technology keep their focus, and with it the ring that shows them where they are.
   */
  private _releasePressFocus(): void {
    const focused = this.shadowRoot?.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
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
   * Forget the active gesture: its hold timer, its pointer capture, its bookkeeping, its hold
   * indicator and its day's wash, and spring back any days a swipe moved.
   *
   * Leaves `_derivedClick` alone, which outlives the gesture on purpose: pointer-up sets it
   * just before calling this, for the click that follows. The one exception is a press that
   * lifted an event to move it, which guards that event's click however it ends (`_endMove`).
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
    this._pointerDayHit = null;
    this._pointerAddContext = null;
    this._pointerDayAdd = null;
    this._pointerSwipeable = false;
    this._pointerOnLink = false;
    this._pointerDraftFrom = null;
    this._liftingTouch = false;
    this._endDraft();
    this._endMove();
    this._washDay(undefined);
    this._springBackSwipe();

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
   * Whether a press may end as a swipe that pages: a touch or a pen, on a card that swipes
   * (`_swipeAvailable`), away from the screen's edges. A mouse never swipes: it has the
   * arrows, and a drag with it selects text. The edges belong to the host's own swipes
   * (`SWIPE_EDGE_GUARD`).
   *
   * @param ev - The pointer-down
   * @returns Whether the gesture it starts may page
   */
  private _swipeStartsAt(ev: PointerEvent): boolean {
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return false;
    if (!this._swipeAvailable) return false;

    const guard = Constants.UI.SWIPE_EDGE_GUARD;
    const width = window.innerWidth;
    return ev.clientX >= guard && (!(width > 0) || ev.clientX <= width - guard);
  }

  /**
   * Which way a swipe pages once its finger lifts: far enough sideways
   * (`SWIPE_MIN_DISTANCE`), and mostly sideways (`SWIPE_MIN_SLOPE_RATIO`).
   *
   * A finger moving left turns to the next page, as a page of a book turns, and right to the
   * previous one. Reading right to left, the days run the other way and so does the swipe,
   * as the arrows do: the direction is the card's own, the authority its `:dir(rtl)` rules
   * follow too.
   *
   * @param deltaX - Horizontal travel from pointer-down to pointer-up, positive to the right
   * @param deltaY - Vertical travel, positive downward
   * @returns `1` forward, `-1` back, `0` for a gesture that does not page
   */
  private _swipeDirection(deltaX: number, deltaY: number): -1 | 0 | 1 {
    const across = Math.abs(deltaX);
    if (across < Constants.UI.SWIPE_MIN_DISTANCE) return 0;
    if (across < Constants.UI.SWIPE_MIN_SLOPE_RATIO * Math.abs(deltaY)) return 0;

    const card = this.renderRoot?.querySelector('ha-card');
    const rightToLeft = card instanceof Element && getComputedStyle(card).direction === 'rtl';
    return deltaX < 0 !== rightToLeft ? 1 : -1;
  }

  /**
   * Ends a gesture that moved and could swipe: pages the card through the arrows' own path,
   * when it went far enough and mostly sideways, and remembers the page asked for so its days
   * slide in from the side the finger came from once they are drawn (`_syncSwipeArrival`).
   *
   * @param deltaX - Horizontal travel from pointer-down to pointer-up, positive to the right
   * @param deltaY - Vertical travel, positive downward
   */
  private _swipeEnded(deltaX: number, deltaY: number): void {
    const direction = this._swipeDirection(deltaX, deltaY);
    // Asked again rather than trusted from pointer-down: the configuration or the layout may
    // have taken swiping away while the finger was down.
    if (direction === 0 || !this._swipeAvailable) return;

    Logger.debug(`Swipe pages ${direction > 0 ? 'forward' : 'back'}`);
    const before = this._pageRequested;
    this._stepPage(direction);
    if (this._pageRequested === before || prefersReducedMotion()) return;
    this._swipeArrival = { page: this._pageRequested, from: deltaX < 0 ? 1 : -1 };
  }

  /**
   * Lets the days follow a swipe's finger while it moves mostly sideways: with resistance and
   * no further than `SWIPE_NUDGE_MAX`, a hint at the page to come rather than a drag of this
   * one. Back where they belong once the finger turns mostly vertical, and never under
   * `prefers-reduced-motion`.
   *
   * The offset is written straight onto the content container's style, which no render binds,
   * and only while a swipe is under way: a transform left standing would make the container a
   * containing block and a stacking context for everything drawn in it.
   *
   * @param deltaX - Horizontal travel from pointer-down, positive to the right
   * @param deltaY - Vertical travel, positive downward
   */
  private _nudgeSwipe(deltaX: number, deltaY: number): void {
    const sideways = Math.abs(deltaX) >= Constants.UI.SWIPE_MIN_SLOPE_RATIO * Math.abs(deltaY);
    let nudge = this._swipeNudge;
    if (!nudge) {
      if (!sideways || prefersReducedMotion()) return;
      const element = this.renderRoot.querySelector<HTMLElement>('.content-container');
      if (!element) return;
      this._swipeMotion?.cancel();
      this._swipeMotion = null;
      nudge = this._swipeNudge = { element, offset: 0 };
    }

    const offset = sideways ? resistedSwipeOffset(deltaX) : 0;
    if (offset === nudge.offset) return;
    nudge.offset = offset;
    if (offset === 0) {
      clearInlineTransform(nudge.element);
    } else {
      nudge.element.style.transform = `translateX(${offset.toFixed(1)}px)`;
    }
  }

  /** Springs the days a swipe moved back to where they belong, as its gesture ends. */
  private _springBackSwipe(): void {
    const nudge = this._swipeNudge;
    if (!nudge) return;
    this._swipeNudge = null;
    clearInlineTransform(nudge.element);
    if (nudge.offset === 0) return;

    this._startSwipeMotion(
      nudge.element,
      [{ transform: `translateX(${nudge.offset.toFixed(1)}px)` }, { transform: 'translateX(0)' }],
      Constants.TIMING.SWIPE_SPRING_BACK,
    );
  }

  /**
   * Runs one piece of a swipe's motion on the content container, ending the one before it.
   * Nothing runs under `prefers-reduced-motion`, asked here rather than once per gesture, since
   * an arrival can start well after the swipe that asked for it.
   *
   * Ending an animation rejects its `finished` promise, and nothing here waits on it, so the
   * rejection is caught where the animation starts: otherwise a swipe that interrupts the last
   * one's spring-back, or an arrival that follows it, reports an unhandled rejection.
   *
   * @param element - The content container
   * @param keyframes - Where the motion starts and ends
   * @param duration - How long it takes, in milliseconds
   */
  private _startSwipeMotion(element: HTMLElement, keyframes: Keyframe[], duration: number): void {
    this._swipeMotion?.cancel();
    this._swipeMotion = null;
    if (typeof element.animate !== 'function' || prefersReducedMotion()) return;

    const motion = element.animate(keyframes, { duration, easing: 'ease-out' });
    motion.finished?.catch(() => undefined);
    this._swipeMotion = motion;
  }

  /**
   * Slides in the page a swipe asked for, from the side the finger came from, once its days
   * are drawn: at once for a page already loaded, after its events arrive for one that is not.
   * A page asked for any other way since, by the arrows, the picker, home or another swipe,
   * takes the arrival with it (`_requestPage`), and so does the card ceasing to swipe.
   *
   * A page already loaded is drawn in the update straight after the finger lifts, before the
   * days have sprung back, and the arrival takes over from the spring-back. That is the turn of
   * a page rather than a jump: the days that followed the finger are gone by then, and the new
   * ones come in from the other side.
   *
   * Through the Web Animations API, so nothing is added to the card's DOM or attributes: the
   * observers that refit the grid when its structure changes see nothing.
   */
  private _syncSwipeArrival(): void {
    const arrival = this._swipeArrival;
    if (!arrival) return;
    if (!this._swipeAvailable) {
      this._swipeArrival = null;
      return;
    }
    if (this._pageShown !== arrival.page || this.isInitialLoad) return;

    this._swipeArrival = null;
    const element = this.renderRoot.querySelector<HTMLElement>('.content-container');
    if (!element) return;

    const offset = arrival.from * Constants.UI.SWIPE_ARRIVAL_OFFSET;
    this._startSwipeMotion(
      element,
      [
        { transform: `translateX(${offset}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      Constants.TIMING.SWIPE_ARRIVAL,
    );
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
      // Match pointer-up: default and explicit `tap_action: none` must not activate, and
      // neither must an `add-event` the card cannot run now.
      if (!this._hasTapAction) {
        return;
      }
      ev.preventDefault();
      Actions.handleAction(this, this.config, 'tap', this._cardActions(null, originOf(ev.target)));
    }
  }

  /**
   * What a focused button of the card's own acts on: an event, or a day's add button.
   *
   * @param node - The key's or click's target
   * @returns The event or the day, or undefined for anything else
   */
  private _keyTargetOn(
    node: EventTarget | null,
  ): { event: Activation.EventTapTarget } | { day: number } | undefined {
    const event = this._eventsActivatable ? Activation.tapTargetOn(node) : undefined;
    if (event) return { event };
    const day = this._dayTapsActive ? Activation.dayAddOn(node) : undefined;
    return day === undefined ? undefined : { day };
  }

  /**
   * Activates a button of the card's own from the keyboard or assistive technology: an
   * event's own action, or a day's add button. Neither has a hold there, so an event runs its
   * tap where it has one, and otherwise its hold.
   *
   * @param target - What the button acts on
   * @param origin - Where the button is, for the cue while the dialog loads
   */
  private _activate(
    target: { event: Activation.EventTapTarget } | { day: number },
    origin: Feedback.PressOrigin | undefined,
  ): void {
    if ('event' in target) {
      this._runEventAction(target.event, this._eventTapRuns ? 'tap' : 'hold', origin);
    } else {
      Logger.debug('Executing day tap action');
      this._addEventAt(undefined, origin, target.day);
    }
  }

  /**
   * Enter and Space on a focused event or day's add button, taken as a native button takes
   * them: Enter on its keydown, Space on its keyup, and only if focus is still on the element
   * Space went down on. Neither repeats while the key is held, and Space never scrolls the
   * card.
   *
   * Only when the button itself is the key's target. Neither has focusable content, so
   * anything else holding focus inside the card keeps its keys.
   *
   * @param ev - A keydown bubbling to `ha-card`
   * @returns True when the key was the focused button's, and was consumed
   */
  private _handleEventKeyDown(ev: KeyboardEvent): boolean {
    if (ev.key !== 'Enter' && ev.key !== ' ') return false;
    const target = this._keyTargetOn(ev.target);
    if (!target) return false;

    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat) return true;

    if (ev.key === 'Enter') {
      this._activate(target, originOf(ev.target));
    } else {
      this._spaceArmedOn = ev.target;
    }
    return true;
  }

  /**
   * Space's keyup on the event or day's add button its keydown armed activates it.
   *
   * @param ev - A keyup bubbling to `ha-card`
   */
  private _handleKeyUp(ev: KeyboardEvent) {
    if (ev.key !== ' ') return;
    const armed = this._spaceArmedOn;
    this._spaceArmedOn = null;

    const target = this._keyTargetOn(ev.target);
    if (!target || armed === null || armed !== ev.target) return;

    ev.preventDefault();
    ev.stopPropagation();
    this._activate(target, originOf(ev.target));
  }

  /**
   * A click on an event or a day's add button: assistive technology's way of activating it,
   * or the echo of a pointer gesture the pointer-up already decided.
   *
   * Assistive technology activates a `role="button"` with a bare `click` and no pointer
   * events, so a click that names one runs it. Unless it is the click the pointer gesture
   * that just ended owes, which names that gesture's event or button, or nothing at all; see
   * `_derivedClick`. A click naming another is not that click: it acts, and leaves the guard
   * for the one still owed. Either way a click the button owns stops here, as a click on a
   * native button would be the button's and not its container's.
   *
   * @param ev - A click bubbling to `ha-card`
   */
  private _handleClick(ev: MouseEvent) {
    const eventHit = this._eventTapAt(ev);
    const dayHit = eventHit ? undefined : this._dayAddAt(ev);
    const owed = this._derivedClick;
    if (owed && Date.now() > owed.deadline) this._derivedClick = null;

    const element = eventHit?.element ?? dayHit?.element ?? null;
    if (this._derivedClick && (element === null || element === this._derivedClick.element)) {
      this._derivedClick = null;
      if (element) ev.stopPropagation();
      return;
    }

    if (!element) return;
    ev.stopPropagation();
    if (eventHit) {
      this._activate({ event: eventHit.target }, originOf(eventHit.element));
    } else if (dayHit) {
      this._activate({ day: dayHit.timestamp }, originOf(dayHit.element));
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
    // Reported once per configuration, rather than by every render that leaves them out.
    for (const entry of Config.undrawableToolbarButtons(this.config)) {
      Logger.warn(
        `Toolbar button left out, as it cannot be drawn as written: ${JSON.stringify(entry)}. ` +
          'Each needs an icon; a name and an entity are text, and a tap_action is an action.',
      );
    }
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

    if (this._instanceId !== previousInstanceId) {
      // Failures belong to the query that produced them. Carrying the notice over would name a
      // calendar this card no longer shows; the count starts again by itself (`updateEvents`).
      this._setFailures([]);
    }

    // Compared as loaded, not as configured: a view's own count that leaves the longest one
    // where it was changes what is drawn, never what is fetched, and needs no request.
    const configChanged = Config.hasConfigChanged(
      ViewConfig.loadConfig(previousConfig),
      ViewConfig.loadConfig(this.config),
    );
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
    const stored = this._wantsLegend
      ? ViewChoice.readStoredHiddenCalendars(fingerprint)
      : undefined;
    const hidden = (stored ?? []).filter((id) => calendars.has(id));
    this._hiddenCalendars = hidden.length > 0 ? new Set(hidden) : NO_HIDDEN_CALENDARS;
    this._hiddenMatchesStorage = stored !== undefined;
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
   * | `live`      | no                             | as `network`, a calendar without a live subscription only once due |
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
    // supersedes it, and a superseded response must not touch card state: committing it
    // would draw the previous query's events under the current configuration until the
    // next load. The identity is taken once, below, and carried to the commit, so such a
    // payload is at least never stamped as the current query's.
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
        // Nothing to load, and so nothing failing either, and no wider load to draw days for.
        this._loadedDaysShown = null;
        this._setFailures([]);
        this.isInitialLoad = false;
      }
      return;
    }

    const isAppearLoad = load === 'navigate';
    this._appearLoadPending = false;

    const page = this._pageRequested;
    const config = this._loadConfigForPage(page);
    const instanceId = this._instanceIdForPage(page);
    const store: EventUtils.CacheStore = page === null ? 'persistent' : 'page';
    const usesCache = load !== 'network' && load !== 'reload' && load !== 'live';
    // Another query's failures are not this one's (`_failureCountHint`). Asked here rather than
    // where a query changes, because a profile change reaches no code that could reset it.
    if (this._failureCountQuery !== instanceId) {
      this._failureCountHint = 0;
      this._failureCountQuery = instanceId;
    }

    // A reload asks REST for every calendar; their subscriptions, which may still hold the
    // answer from before a write, are closed and opened again after it.
    if (load === 'reload') {
      LiveCalendars.invalidate(hass, EventUtils.liveScope(hass, config).entityIds);
    }

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
      this._commitEvents(snapshot, instanceId, page, config.days_to_show);
    } else if (isAppearLoad && this.events.length > 0) {
      // The element itself still holds events from before it was detached. With nothing
      // cached to replace them, they would be drawn under a config they were not fetched
      // for, or beyond the 24-hour bound, until the fetch lands.
      this._dropUndrawableResidentEvents();
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
      this._syncLive();
      return;
    }

    try {
      this.isLoading = true;
      await this.updateComplete;

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event request');
        return;
      }

      // No event drawn on any of these days yet: a first load, a page or a start date not shown
      // before, or a retry after everything failed. Draw each calendar as it answers, so one
      // slow calendar no longer holds back the others. Where an event is drawn on one of them,
      // the day after midnight or a configuration changed in place included, the events drawn
      // stay until every calendar has answered, so none of them vanishes and comes back.
      const cold = this.isInitialLoad || !this._drawsEventOn(page);
      // What the card drew of its last complete load, before this one draws anything: a failing
      // calendar keeps its events from here, not from what a cold load has drawn by then.
      const drawnBefore = this._completeDrawing;
      let result: Types.EventFetchResult;
      try {
        result = await EventUtils.fetchEventData(
          hass,
          config,
          instanceId,
          load === 'reload' || load === 'live' ? load : 'network',
          this._failureCountHint,
          afterWrite,
          store,
          cold
            ? (partial) => this._schedulePartialCommit(partial, instanceId, page, generation)
            : undefined,
        );
      } finally {
        this._cancelPartialCommit(generation);
      }

      if (isSuperseded()) {
        Logger.debug('Discarding a superseded event response');
        return;
      }

      const failedEntities = result.failedEntities ?? [];
      if (failedEntities.length > 0) {
        Logger.warn(`Could not load calendar(s): ${failedEntities.join(', ')}`);
      }
      this._failureCountHint = failedEntities.length > 0 ? this._failureCountHint + 1 : 0;

      const eventsMatchCurrentQuery = drawnBefore.instanceId === instanceId;
      // The cache normally carries a failing calendar's last events forward itself. This
      // covers the calendars it cannot, with nothing stored or held in memory for them
      // (`heldEntries` in events.ts), within the same bound, counted from each one's own load:
      // each keeps what the card drew of it at its last complete load for this query, whatever
      // the other calendars answered, and the calendars that answered are drawn as they
      // answered, empty included.
      const mayKeepDrawn =
        failedEntities.length > 0 && drawnBefore.events.length > 0 && eventsMatchCurrentQuery;

      this._commitEvents(
        mayKeepDrawn ? this._keepFailedCalendars(hass, config, result, drawnBefore) : result,
        instanceId,
        page,
        config.days_to_show,
      );

      this.isLoading = false;
      this._scheduleRefresh(result.nextAttemptAt ?? Date.now() + this._refreshIntervalMs());
      this._syncLive();

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
      this._syncLive();
    }
  }

  /**
   * Put a loaded set of events on the card.
   *
   * @param result Events and what is known about them
   * @param instanceId Query identity the events were loaded for
   * @param page The page they belong to, null for home; it becomes the page on screen
   * @param loadedDays How many days they were loaded for (`_loadedDaysShown`)
   */
  private _commitEvents(
    result: Types.EventFetchResult,
    instanceId: string,
    page: string | null,
    loadedDays: number,
  ): void {
    const failedEntities = result.failedEntities ?? [];

    this.events = [...(result.events ?? [])];
    this._eventsInstanceId = instanceId;
    this._pageShown = page;
    this._loadedDaysShown = loadedDays;
    this._eventsFetchedAt = result.loadedAt ?? result.fetchedAt ?? Date.now();
    this._drawnRaw = result.raw ?? [];
    this._drawnLoadedAt = result.lastSuccess ?? {};
    this._completeDrawing = {
      instanceId,
      events: this.events,
      raw: this._drawnRaw,
      loadedAt: this._drawnLoadedAt,
      fetchedAt: this._eventsFetchedAt,
    };
    // What is drawn now settles every drift it can; one it cannot is loaded for again.
    this._liveDriftLoaded = '';
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
   * A result with the events the card drew of each calendar that failed in it and that it
   * knows nothing of (`lastSuccess`): those the cache could not carry forward
   * (`fetchRawEvents`). Only theirs: a calendar that answered is drawn as it answered, and one
   * whose last success the cache carried is drawn as the cache holds it, empty included, never
   * twice and never from older events the card still drew of it.
   *
   * They are added as loaded and processed with the result's own, as the cache adds the events
   * it carries, so they are drawn in the order they would be had the calendar answered. They
   * come from the card's last complete load for this query (`drawing`), never from what a cold
   * load has drawn since, which holds only the calendars that answered first. Each calendar is
   * kept for 24 hours from when its own events loaded (`loadedAtOf`), whatever the age of any
   * other calendar drawn, and the result carries that time on, so keeping a calendar again does
   * not make its events any younger. The rule works from what this card drew, so a newer answer
   * only another card saw is not known to it.
   *
   * @param hass Home Assistant instance the result was loaded from
   * @param config The configuration the result was loaded for
   * @param result Events of the calendars that answered, and of failed ones the cache carried
   * @param drawing What the card drew of its last complete load for this query, as it started
   * @returns The result with those events, or the result itself where the card drew none
   */
  private _keepFailedCalendars(
    hass: Types.Hass,
    config: Types.Config,
    result: Types.EventFetchResult,
    drawing: CompleteDrawing,
  ): Types.EventFetchResult {
    const known = result.lastSuccess ?? {};
    const now = Date.now();
    const maxStaleMs = Constants.CACHE.MAX_STALE_HOURS * 60 * 60 * 1000;
    const keptLoadedAt: Record<string, number> = Object.fromEntries(
      (result.failedEntities ?? []).flatMap((entityId) => {
        if (typeof known[entityId] === 'number') return [];
        const loadedAt = loadedAtOf(drawing, entityId);
        return now - loadedAt < maxStaleMs ? [[entityId, loadedAt]] : [];
      }),
    );
    const drawn = drawing.raw.filter(
      (event) => typeof keptLoadedAt[event._entityId ?? ''] === 'number',
    );
    if (drawn.length === 0) return result;

    const names = [...new Set(drawn.map((event) => event._entityId))].join(', ');
    Logger.warn(`Keeping the last events drawn of ${names}, which the cache could not carry`);
    return EventUtils.withAddedEvents(hass, config, result, drawn, keptLoadedAt);
  }

  /**
   * When the events the card draws now of a calendar last loaded successfully (`loadedAtOf`): by
   * its own record (`_drawnLoadedAt`), and for a calendar with none, by the oldest load drawn
   * (`_eventsFetchedAt`).
   *
   * @param entityId The calendar the events belong to
   * @returns Epoch milliseconds
   */
  private _drawnLoadedAtOf(entityId: string | undefined): number {
    return loadedAtOf(
      { loadedAt: this._drawnLoadedAt, fetchedAt: this._eventsFetchedAt },
      entityId,
    );
  }

  /**
   * Draw the calendars of a cold load that have answered so far, in the next task.
   *
   * Calendars still out are simply not drawn yet, and nothing is reported failed until every
   * calendar has answered, a failure named for other dates included: the header keeps its
   * loading spinner, and the full result replaces this one. Neither the cache nor the deadlines
   * move. Nothing is drawn until a calendar has an event this view would show, so the loading
   * state never gives way to a day that only looks empty.
   *
   * @param partial The events of every calendar that has answered
   * @param instanceId Query identity the events were loaded for
   * @param page The page they belong to, null for home
   * @param generation The request they belong to; a newer one discards them
   */
  private _schedulePartialCommit(
    partial: Types.EventFetchResult,
    instanceId: string,
    page: string | null,
    generation: number,
  ): void {
    // A request a newer one replaced must not take the newer one's place in the queue.
    if (generation !== this._eventRequestGeneration) return;
    this._partialCommit = { partial, instanceId, page, generation };
    if (this._partialTimer !== null) return;

    this._partialTimer = window.setTimeout(() => {
      this._partialTimer = null;
      const pending = this._partialCommit;
      this._partialCommit = null;
      if (!pending || pending.generation !== this._eventRequestGeneration || !this.isConnected) {
        return;
      }
      if (!this._partialDrawsAnEvent(pending.partial.events, pending.page)) return;
      this.events = [...pending.partial.events];
      this._drawnRaw = pending.partial.raw ?? [];
      this._drawnLoadedAt = pending.partial.lastSuccess ?? {};
      this._eventsInstanceId = pending.instanceId;
      this._pageShown = pending.page;
      this._eventsFetchedAt = pending.partial.fetchedAt;
      this._setFailures([]);
      this.isInitialLoad = false;
    }, 0);
  }

  /**
   * Whether a load for a page would replace an event drawn on any of its days, by the render's
   * own test over what it draws now (`_daysOnScreen`, `Render.drawsEvent`).
   *
   * Decided from what is drawn, not from the dates the events were loaded for: an all-day trip
   * or a timed event still running past midnight is drawn beyond the window it was loaded for,
   * and events loaded for a window can be drawn on none of its days after a view switch, a width
   * change, a change to `start_date`, or a snapshot of yesterday drawn for today.
   *
   * The page on screen owns every day it draws. Only a load of another page is held to the days
   * its range names, which are the days a page with the date navigation draws; without it, where
   * the width sheds columns and empty days are not drawn, the days drawn need not be a run.
   *
   * @param page First day of the page loaded, or null for home
   * @returns False when no event is drawn on any day of it, which makes the load cold
   */
  private _drawsEventOn(page: string | null): boolean {
    if (this.events.length === 0) return false;
    let days = this._daysOnScreen(this.groupedEvents, this._pageShown);
    if (page !== this._pageShown) {
      const span = this._daysSpan(page);
      days = days.filter((day) => day.timestamp >= span.from && day.timestamp < span.until);
    }
    return Render.drawsEvent(this.effectiveView, days, this.effectiveConfig);
  }

  /**
   * The days a page draws now, from its first to midnight after its last (`_pageRange`).
   *
   * @param page First day of the page, or null for home
   * @returns Epoch milliseconds
   */
  private _daysSpan(page: string | null): { from: number; until: number } {
    const range = this._pageRange(page);
    return {
      from: range.start.getTime(),
      until: Paging.addDays(range.start, range.days).getTime(),
    };
  }

  /**
   * The days a view draws: column and grid shed days to fit the width, list never does.
   *
   * Only when the width sheds columns; see `visibleDayWindowStart` for which ones stay. With
   * the date navigation the days are the page's, by date: the page the range names and the
   * arrows step by is a run of calendar days, and where empty days are not drawn, a slice by
   * index would hold other days than those.
   *
   * @param days Days grouped for the view
   * @param page The page they belong to, null for home
   * @returns The days drawn
   */
  private _daysOnScreen(days: Types.EventsByDay[], page: string | null): Types.EventsByDay[] {
    if (this.effectiveView === 'list') return days;

    const count = this._shownColumnCount;
    if (this._wantsNavigation && count > 0 && count < this._viewDays) {
      const range = this._pageRange(page);
      const from = range.start.getTime();
      const until = Paging.addDays(range.start, range.days).getTime();
      return days.filter((day) => day.timestamp >= from && day.timestamp < until);
    }
    if (count <= 0 || count >= days.length) {
      return days;
    }
    const start = ViewConfig.visibleDayWindowStart(days, count, new Date());
    return days.slice(start, start + count);
  }

  /**
   * Whether events of a partial load would put at least one event on screen in the view shown,
   * by the render's own test (`Render.drawsEvent`) over the days it draws: ones that ended, that
   * a filter or the legend hides, that fall outside the grid's hours or on a day the width sheds
   * do not.
   *
   * @param events Events of the calendars that have answered
   * @param page The page they belong to, null for home
   * @returns True when drawing them shows an event
   */
  private _partialDrawsAnEvent(events: Types.CalendarEventData[], page: string | null): boolean {
    const hidden = this._activeHiddenCalendars;
    const shown = hidden.size ? events.filter((e) => !hidden.has(e._entityId ?? '')) : events;
    const config = ViewConfig.resolveEffectiveConfig(this._configForPage(page), this.effectiveView);
    const days = EventUtils.groupEventsByDay(
      shown,
      config,
      this.isExpanded,
      this.effectiveLanguage,
      this.effectiveView,
      this.hass,
    );
    return Render.drawsEvent(this.effectiveView, this._daysOnScreen(days, page), config);
  }

  /**
   * Drop a partial commit still waiting for its timer, once its request has settled.
   *
   * @param generation The settled request; a newer one's pending commit is left alone
   */
  private _cancelPartialCommit(generation?: number): void {
    if (generation !== undefined && this._partialCommit?.generation !== generation) return;
    if (this._partialTimer !== null) {
      clearTimeout(this._partialTimer);
      this._partialTimer = null;
    }
    this._partialCommit = null;
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
   * Let go of what the element already holds that may no longer be drawn for the current config:
   * everything, when it was loaded for another query, and otherwise each calendar's events once
   * 24 hours have passed since they loaded (`_drawnLoadedAtOf`), whatever the age of any other
   * calendar drawn. With nothing left, the card shows its loading state.
   */
  private _dropUndrawableResidentEvents(): void {
    // Events nothing on this card loaded carry no query to compare, so they are left alone.
    if (this._eventsInstanceId === '') return;

    const now = Date.now();
    const maxStaleMs = Constants.CACHE.MAX_STALE_HOURS * 60 * 60 * 1000;
    const sameQuery = this._eventsInstanceId === this._instanceIdForPage(this._pageRequested);
    const drawable = (event: Types.CalendarEventData): boolean =>
      sameQuery && now - this._drawnLoadedAtOf(event._entityId) < maxStaleMs;
    const events = this.events.filter(drawable);

    if (events.length > 0) {
      if (events.length === this.events.length) return;
      this._eventsFetchedAt = Math.min(
        ...events.map((event) => this._drawnLoadedAtOf(event._entityId)),
      );
      this.events = events;
      this._drawnRaw = this._drawnRaw.filter(drawable);
      return;
    }

    this.events = [];
    this._drawnRaw = [];
    this._drawnLoadedAt = {};
    this._eventsInstanceId = '';
    this._setFailures([]);
    this.isInitialLoad = true;
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
    Actions.handleAction(this, this.config, action, this._cardActions());
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
      touchMove: this._drawsNewEvents || this._movesEvents ? this._draftTouchMove : undefined,
      touchEnd: this._swallowTouchEnd,
      nativeDrag: this._movesEvents ? this._refuseNativeDrag : undefined,
    };

    let content: TemplateResult;
    // Whether the content holds at least one control of its own: an event that is a target, a
    // day's add button, or a link in an event's row. Not while loading, and not for an error
    // or, for events, for days holding nothing but empty-day placeholders.
    let drawsEventTarget = false;
    const dayAdd = this._dayAddButtons;

    const shownDays = (days: Types.EventsByDay[]): Types.EventsByDay[] =>
      this._daysOnScreen(days, this._pageShown);

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
          dayAdd,
          this._bandOpenForNew,
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
            dayAdd,
          )
        : Render.renderGroupedEvents(
            days,
            this.effectiveConfig,
            this.effectiveLanguage,
            this.weatherForecasts,
            this.safeHass,
            this._eventsActivatable,
            dayAdd,
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
      const ring = this._searchRing;
      const ringed = Search.ringIn(
        shownDays(this.groupedEvents),
        ring && this._pageShown === ring.page ? ring.target : null,
      );
      this._searchRingDrawn = ringed.found;
      const days = ringed.days;
      content = renderDays(days);
      drawsEventTarget =
        (dayAdd !== undefined && days.length > 0) ||
        (this._eventsActivatable &&
          Render.drawsEvent(this.effectiveView, days, this.effectiveConfig)) ||
        Render.drawsLink(this.effectiveView, days, this.effectiveConfig);
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
      this._refreshPhase,
      this._swipeAvailable,
      this._tapControl(),
    );
  }

  /**
   * Which of the card's two tap targets has focus: the card itself, or the control that stands
   * in for it while the card hosts controls of its own.
   *
   * @returns The target with focus, or null for focus anywhere else
   */
  private _focusedTapTarget(): 'card' | 'control' | null {
    const active = this.shadowRoot?.activeElement;
    if (!active) return null;
    if (active.matches('ha-card')) return 'card';
    return active.matches('.card-tap-control') ? 'control' : null;
  }

  /**
   * Keeps focus on the card's tap when a render moves it between the card and its control.
   *
   * The card starts or stops hosting controls whenever events arrive or go, a load or a page
   * away. Left alone, a keyboard user on the card would stay on a container that has lost its
   * role and tab stop, and one on the control would drop to the page when it went. The focus
   * moves with the tap instead, without scrolling, so the keyboard is where it was.
   */
  private _keepTapFocus(): void {
    const before = this._tapFocusBefore;
    this._tapFocusBefore = null;
    if (!before) return;
    const card = this.shadowRoot?.querySelector<HTMLElement>('ha-card');
    const control = card?.querySelector<HTMLElement>(':scope > .card-tap-control');
    const target = control ?? (card?.hasAttribute('tabindex') ? card : null);
    if (!target || target === this.shadowRoot?.activeElement) return;
    // Only from one tap target to the other, or from one that went to nowhere: focus a render
    // left on anything else is not the tap's to move.
    if (this._focusedTapTarget() !== null || !this.shadowRoot?.activeElement) {
      target.focus({ preventScroll: true });
    }
  }

  /**
   * The control standing in for the card's tap while it hosts controls (`Render.TapControl`).
   *
   * Named as a button of the card's own that runs the same action is named, Home Assistant's
   * word for it: Refresh, Reset, Back, Add event. Every other action is named after the card,
   * its title or else its first calendar, as Home Assistant's own cards name what a tap opens;
   * `expand` adds whether the card is expanded, where it has events to fold.
   *
   * @returns The control; the renderer draws it only while the card hosts controls
   */
  private _tapControl(): Render.TapControl | undefined {
    if (!this._hasTapAction) return undefined;
    const action = this.config.tap_action?.action;
    const activate = (control: HTMLElement) =>
      Actions.handleAction(this, this.config, 'tap', this._cardActions(null, originOf(control)));
    const command = this._commandName(action);
    if (command) return { label: command.word ?? command.fallback, activate };
    const first = this.config.entities[0];
    const firstId = typeof first === 'string' ? first : first?.entity;
    const label = this.effectiveTitle?.trim() || (firstId ? this._calendarName(firstId) : '');
    const expanded =
      action === 'expand' && this.hasCompactModeLimits() ? this.isExpanded : undefined;
    return { label, expanded, activate };
  }

  /**
   * The controls this render draws in the header toolbar, and whether the switcher shows words.
   *
   * @returns The toolbar; with no control in it, no toolbar is drawn
   */
  private _headerToolbar(): Toolbar.HeaderToolbar {
    const legend = this._legend();
    const controls: ToolbarControls = {
      heading: this._monthHeading(legend !== undefined && !legend.folded),
      navigation: this._dateNavigation(),
      legend,
      viewSwitcher: this._viewSwitcher(),
      reset: this._resetButton(),
      refresh: this._refreshButton(),
      search: this._searchButton(),
      addEvent: this._addEventButton(),
      customButtons: this._customButtons(),
    };
    // Last, because which of the start group's controls fold depends on all the row holds.
    this._toolbarRow = this._actionRow(controls);
    controls.startFold = this._startFold(this._toolbarRow);
    this._toolbarLabelMinWidthPx = this._toolbarLabelMinWidth(controls);

    return { labeled: this._toolbarLabeledFor(controls), ...controls };
  }

  /**
   * Whether the view switcher names its views in words rather than pictograms.
   *
   * Only the switcher ever does: the commands beside it are icons at every width, named by Home
   * Assistant's words in their tooltips. The switcher shows its words where the card is wide
   * enough for them beside those icons, and only while the whole row fits on one line
   * (`_syncToolbarLabelFit`).
   *
   * @param controls - The controls this render draws
   * @returns True to draw the words
   */
  private _toolbarLabeledFor(controls: ToolbarControls): boolean {
    const minWidth = this._toolbarLabelMinWidth(controls);
    if (this._toolbarWidthPx === null || minWidth === null) return false;

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
   * The card width from which the view switcher shows its words, or null without a switcher.
   *
   * `UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH` holds for the switcher alone in its row. The commands
   * beside it add their two groups' widths exactly: the folded filter, add and the
   * configuration's own buttons at the start, one icon each and none in the menu, since the words
   * give way before any control folds; and reset, refresh and search at the end, each an icon,
   * with a gap between two in a group.
   *
   * @param controls - The controls this render draws
   * @returns A width in CSS pixels, or null
   */
  private _toolbarLabelMinWidth(controls: ToolbarControls): number | null {
    if (!controls.viewSwitcher) return null;
    const count = (members: ReadonlyArray<unknown>): number =>
      members.filter((member) => member !== undefined).length;
    const end = count([controls.reset, controls.refresh, controls.search]);
    return (
      Constants.UI.TOOLBAR_SWITCHER_LABEL_MIN_WIDTH +
      ToolbarFold.groupWidth(Toolbar.startControls(controls).length) +
      ToolbarFold.groupWidth(end)
    );
  }

  /**
   * What the fit of the switcher's words depends on, other than the width.
   *
   * Only what the row holds: the language, which sets the words, and which commands sit beside
   * the switcher, the configuration's own buttons by how many there are. The title and the
   * dates sit in the heading row, so neither a templated title ticking over nor a page turned
   * retries words that did not fit.
   *
   * @param controls - The controls this render draws
   * @returns A string that changes whenever the row would
   */
  private _toolbarLabelSignature(controls: ToolbarControls): string {
    return [
      this.effectiveLanguage,
      controls.viewSwitcher ? 'views' : '',
      controls.addEvent ? 'add' : '',
      controls.reset ? 'reset' : '',
      controls.refresh ? 'refresh' : '',
      controls.search ? 'search' : '',
      controls.legend?.folded ? 'filter' : '',
      `buttons:${controls.customButtons?.length ?? 0}`,
    ].join('\u0000');
  }

  /**
   * Drops the switcher's words when the action row does not fit on one line with them.
   *
   * The width thresholds are measured in English and German; a language with longer words can
   * need more. Read after the render that drew them: if a control wrapped onto a second line, or
   * reaches past the row, the card remembers the width, and draws the switcher's pictograms until
   * it is wider than that, or the language or the controls change. Never the other way round, so a measurement cannot set the card flipping
   * between the two.
   *
   * Only ever reads layout that exists. Without it — a card not laid out yet, or a test
   * environment with no layout engine — every box is empty, and nothing is concluded.
   */
  private _syncToolbarLabelFit(): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.toolbar-actions');
    if (!row || !row.querySelector('.toolbar-button-label')) return;

    const rowRect = row.getBoundingClientRect();
    if (rowRect.width === 0) return;
    const boxes = [...row.querySelectorAll<HTMLElement>('.toolbar-button, .view-switcher')]
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    if (boxes.length === 0) return;

    const overflows = boxes.some(
      (box) => box.right > rowRect.right + 0.5 || box.left < rowRect.left - 0.5,
    );
    const firstLineEnds = Math.min(...boxes.map((box) => box.bottom));
    const wraps = boxes.some((box) => box.top > firstLineEnds - 0.5);
    if (!overflows && !wraps) return;

    Logger.debug(`View switcher words do not fit at ${this._toolbarWidthPx}px`);
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
   * the toolbar's controls, the events while they are targets, the days while each is a
   * button that adds an event, and the links in event rows (`open_links`). Answered from what
   * this render draws rather than from the configuration: `event_tap_action: details` on a
   * card showing only "No events", an error or the loading line hosts nothing, and stays a
   * button. A card that hosts controls hands its tap action to a control of its own
   * (`_tapControl`).
   *
   * @param toolbar - The header toolbar this render draws
   * @param drawsEventTarget - Whether this render draws at least one event as a target, a
   *   day's add button, or a link in an event's row
   * @returns True while the card hosts at least one control
   */
  private _hostsControls(toolbar: Toolbar.HeaderToolbar, drawsEventTarget: boolean): boolean {
    return (
      toolbar.navigation !== undefined ||
      toolbar.legend !== undefined ||
      toolbar.viewSwitcher !== undefined ||
      toolbar.reset !== undefined ||
      toolbar.refresh !== undefined ||
      toolbar.search !== undefined ||
      toolbar.addEvent !== undefined ||
      toolbar.customButtons !== undefined ||
      drawsEventTarget
    );
  }

  /**
   * The notice naming calendars that could not be loaded, or nothing.
   *
   * Each is named as the card names it everywhere else, with one addition: an entity Home
   * Assistant does not know — the usual cause of a calendar that never loads — keeps its id
   * in view, after the name the configuration gives it or alone where it has none, because
   * the id is exactly what someone fixing the config needs to see
   * (`CalendarNames.failedCalendarName`).
   *
   * @returns The notice, or `nothing`
   */
  private _renderFetchErrorNotice(): TemplateResult | typeof nothing {
    if (this.isInitialLoad || this._failedEntities.length === 0) {
      return nothing;
    }

    const names = this._failedEntities.map((entityId) =>
      CalendarNames.failedCalendarName(entityId, this.config, this.hass),
    );

    return Render.renderFetchErrorNotice(names, this.effectiveLanguage);
  }

  /**
   * A calendar's name on this card: the name the configuration gives it, else Home
   * Assistant's, else its entity id (`CalendarNames.calendarName`).
   *
   * @param entityId - The calendar
   * @returns Its name
   */
  private _calendarName(entityId: string): string {
    return CalendarNames.calendarName(entityId, this.config, this.hass);
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
   * past midnight still offers the right day. Taken from the page on screen, home included,
   * so a view that draws fewer days, or a narrow card that sheds some, never suggests a day
   * outside it. Within the page, rows are not consulted: a collapsed compact card, or an empty
   * day the card leaves out, still suggests today, the day an event is most often added for.
   *
   * @returns The dialog's `selectedDate`
   */
  private _newEventDate(): Date {
    const range = this._pageRange(this._pageShown);
    return AddEvent.newEventDate(range.start, range.days);
  }

  /**
   * The add-event button, when the card asks for one and has somewhere to write.
   *
   * @returns Button description for the wrapper, or undefined for no button
   */
  private _addEventButton(): Toolbar.AddEventButton | undefined {
    const toolbar = Config.resolveToolbar(this.config);
    if (!toolbar.show || !toolbar.addEvent) return undefined;
    if (this._writableCalendars.length === 0) return undefined;

    return {
      label: AddEvent.addEventLabel(this.safeHass),
      onActivate: (button, pressed) => {
        // A press leaves no focus behind for Home Assistant to ring when the dialog closes;
        // see `_releasePressFocus`. A key keeps it.
        if (pressed) this._releasePressFocus();
        // The popover opens below the button, as macOS opens its toolbar's, by pointer or key.
        const at = originOf(button);
        this._addEventAt(
          undefined,
          at && { ...at, ...(pressed && { pointerType: pressed.pointerType }), below: true },
        );
      },
    };
  }

  /**
   * Opens the event popover on a new event, for a press: the add button, a tap on a day, or the
   * card's own `add-event` action.
   *
   * The new event starts where the press landed (`newEventTimesOn`): on a day, at the hour it
   * is now; in a grid's time area, at the quarter hour pressed; in a grid's all-day band, as an
   * all-day event. With no day under the press, it starts on the date the add button uses
   * (`_newEventDate`). A timed one lasts an hour. The calendar is the first writable one the
   * legend shows (`preselectedCalendarId`), read when pressed so it follows the legend.
   *
   * @param hit - The day the press landed on, if any
   * @param origin - Where the press was, for the popover to open beside
   * @param dayTimestamp - A day to add on with no hit, from a day's add button
   */
  private _addEventAt(
    hit: Activation.DayHit | undefined,
    origin?: Feedback.PressOrigin,
    dayTimestamp?: number,
  ): void {
    const timestamp = hit?.timestamp ?? dayTimestamp;
    const times =
      timestamp === undefined
        ? AddEvent.newEventTimes(this._newEventDate())
        : AddEvent.newEventTimesOn(timestamp, hit?.allDay ? 'all-day' : hit?.minute);
    // A press in a grid's time area or all-day band shows the event being added there.
    const inGrid = hit !== undefined && (hit.minute !== undefined || hit.allDay === true);
    this._openCreateEventDialog(times, origin, inGrid);
  }

  /**
   * Opens the event popover on a new event, and refetches once it has saved one.
   *
   * Refuses while the card is being edited: the button is still drawn there, so the
   * preview shows the layout the dashboard will have, but a press on it opens nothing.
   *
   * @param times - The span the new event starts with
   * @param origin - Where the press was, for the popover to open beside
   * @param showNew - Whether a grid shows the new event as a block while the popover is open
   *   (`_newShown`): one a press drew, or a tap in the grid adds
   */
  private _openCreateEventDialog(
    times: Times.EventTimes,
    origin?: Feedback.PressOrigin,
    showNew = false,
  ): void {
    if (this._isBeingEdited) {
      Logger.debug('Not opening a new event while the card is being edited');
      this._dropNew();
      return;
    }

    const writable = this._writableCalendars;
    const calendarId = AddEvent.preselectedCalendarId(writable, this._activeHiddenCalendars);
    if (!calendarId) {
      this._dropNew();
      return;
    }

    // Only the block this press drew carries on into the popover. Any other is left from an
    // earlier one, still open or waiting on its saved event, and gives way, its timer with it.
    let shown = this._draft ? this._newShown : null;
    if (!shown) this._dropNew();
    if (showNew && this._drawsNewEvents) {
      shown ??= {
        times,
        title: '',
        context: this._draftContext(),
        inPopover: false,
        saved: false,
        arrived: false,
      };
      shown.times = times;
      shown.calendarId = calendarId;
      shown.inPopover = true;
      this._newShown = shown;
      this._paintNew();
    }
    const follows = shown !== null && shown.inPopover;

    this._openPopover({
      mode: 'new',
      calendarId,
      calendars: writable.map((id) => this._popoverCalendar(id)),
      times,
      canEdit: true,
      canDelete: false,
      anchor: origin,
      // The popover names the calendar it wrote to; one that does not is any that accepts
      // new events.
      updated: (...ids) => {
        const saved = follows && shown && this._newShown === shown ? shown : null;
        if (saved) saved.saved = true;
        return this._refreshAfterWrite(
          ids.length ? { ids } : { feature: Writes.CREATE_EVENT_FEATURE },
          saved ? () => this._newArrived(saved) : undefined,
        );
      },
      changed: follows
        ? (draft) => {
            if (this._newShown === shown) this._followNew(draft);
            return undefined;
          }
        : undefined,
      closed: follows
        ? () => {
            if (this._newShown === shown) this._newClosed();
            return undefined;
          }
        : undefined,
    });
  }

  //-----------------------------------------------------------------------------
  // DATE NAVIGATION
  //-----------------------------------------------------------------------------

  /**
   * The month heading, whenever the toolbar is shown.
   *
   * It names the page asked for, so a press on the arrows answers at once; the days below stay
   * those of the page whose events have arrived, dimmed, until the new page's land. The month is
   * the one the page's first day falls in, in full while every month in full fits beside the
   * arrows and in the language's short form while it does not (`_syncMonthFit`), and always in
   * full while the chips show, since they are drawn only where the full month leaves them room.
   * Everything comes from `Intl` in the card's language, so no card string is needed.
   *
   * @param chipsShown - Whether this render draws the legend's chips
   * @returns Heading description for the wrapper, or undefined while the toolbar is hidden
   */
  private _monthHeading(chipsShown: boolean): Toolbar.MonthHeading | undefined {
    if (!Config.resolveToolbar(this.config).show) return undefined;

    const now = new Date();
    const language = this.effectiveLanguage;
    const page = this._pageRange(this._pageRequested, now);
    const short = !chipsShown && this._monthFormShort();
    const form: Paging.MonthForm = short ? 'short' : 'long';

    return {
      text: Paging.monthHeadingParts(page.start, language, form),
      reserve: Paging.monthHeadings(language, form),
      full: Paging.monthHeadings(language, 'long'),
      short,
      range: Paging.rangeLabel(page, language, now),
    };
  }

  /**
   * What the width the month fits in full from depends on, other than the card's width.
   *
   * @returns A string that changes whenever that width might
   */
  private _monthFitSignature(): string {
    return [
      this.effectiveLanguage,
      // The heading row's inline padding follows the view.
      this.effectiveView,
      String(this._toolbarFontGeneration),
      this._wantsNavigation ? 'navigation' : '',
      String(this.config.title_font_size ?? ''),
    ].join('\u0000');
  }

  /**
   * Whether the month heading takes its short form at the card's width now: only once a
   * measurement found that every month in full does not fit there, with the same language,
   * view, fonts, navigation and title size.
   *
   * @returns True to draw the short form
   */
  private _monthFormShort(): boolean {
    const fit = this._monthFit;
    if (!fit || this._toolbarWidthPx === null) return false;
    if (fit.signature !== this._monthFitSignature()) return false;
    return this._toolbarWidthPx < fit.fullFromPx;
  }

  /**
   * Measures the card width from which every month in full fits in the heading row beside the
   * arrows, and re-renders when that moves the month into the other form at this width.
   *
   * The heading's room is everything from its own start to the row's end, less the arrows, when
   * there are any, and the gap before the group at the row's end, which is drawn either way:
   * where the filter is folded the arrows keep to the row's end, and where the chips show the
   * month is drawn in full regardless. The months in full are measured in a
   * hidden copy laid over one another, in the heading's own font, so the answer is the same
   * whichever form is drawn, and nothing the answer changes feeds back into it. The form never
   * changes the card's height, so this may act at once, inside a resize too.
   *
   * Only ever reads layout that exists. Without it — a card not laid out yet, a section folded
   * away, or a test environment with no layout engine — every box is empty, and nothing is
   * concluded.
   */
  private _syncMonthFit(): void {
    if (!this.isConnected) return;
    const row = this.renderRoot.querySelector<HTMLElement>('.toolbar-heading');
    const month = row?.querySelector<HTMLElement>('.toolbar-month');
    const probe = month?.querySelector<HTMLElement>('.toolbar-month-probe');
    if (!row || !month || !probe) return;
    this._watchToolbarFonts();

    const cardWidth = this.getBoundingClientRect().width;
    const full = probe.getBoundingClientRect().width;
    const rowBox = row.getBoundingClientRect();
    const monthBox = month.getBoundingClientRect();
    if (cardWidth <= 0 || full <= 0 || rowBox.width <= 0) return;

    const style = getComputedStyle(row);
    const gap = parseFloat(style.columnGap) || 0;
    // The group at the row's end is drawn with or without the arrows, and costs a gap either way.
    // Its own width grows while the chips show, so the arrows' group is what is read.
    const navigation = row.querySelector<HTMLElement>('.date-navigation');
    const navigationRoom = row.querySelector('.toolbar-heading-end')
      ? (navigation?.getBoundingClientRect().width ?? 0) + gap
      : 0;
    const room =
      style.direction === 'rtl'
        ? monthBox.right - rowBox.left - (parseFloat(style.paddingLeft) || 0)
        : rowBox.right - (parseFloat(style.paddingRight) || 0) - monthBox.left;
    // Half a pixel of give: layout widths are fractional, and a month that fits exactly must
    // not be judged short by the rounding.
    const fullFromPx = cardWidth + full - (room - navigationRoom) - 0.5;

    // The resize observer reads the new width back from here (`_syncToolbarLabels`).
    const wasShort = this._monthFormShort();
    this._monthFit = { signature: this._monthFitSignature(), fullFromPx };
    if (this._monthFormShort() !== wasShort) {
      Logger.debug(
        `Month heading ${wasShort ? 'fits in full' : 'shortened'} at ${Math.round(cardWidth)}px`,
      );
      this.requestUpdate();
    }
  }

  /**
   * Centers the controls beside the month on its capitals: writes how far the middle of the
   * month's capital letters stands above the foot of the heading row
   * (`--calendar-card-heading-middle`), which the stylesheet sets the middle of the arrows
   * and of each chip on. So they read as level with the month's words, as they would not with
   * their bottom edges on its baseline: a pill much taller than the letters then rises far above
   * them.
   *
   * Read from an empty box at the start of the month's words, one capital tall (`1cap`) and
   * standing on their baseline. The row aligns its items' feet and the month stands at its foot,
   * so the height depends only on the month's own font and line, never on where the controls
   * sit: writing it cannot move what it was measured from. Written straight onto the row, which
   * no render binds a style to, and only when it changed, so it costs no render. Until it is
   * first written, the stylesheet stands in 15px.
   *
   * Only ever reads layout that exists: a row with no height (the card hidden, or not yet laid
   * out) writes nothing. Both boxes are read in the viewport's coordinates, so a card scrolled
   * above the viewport, whose boxes read negative, measures the same height as one in view.
   */
  private _syncHeadingMiddle(): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.toolbar-heading');
    const marker = row?.querySelector<HTMLElement>('.toolbar-month-cap');
    if (!row || !marker) return;
    const rowBox = row.getBoundingClientRect();
    if (rowBox.height <= 0) return;
    const cap = marker.getBoundingClientRect();

    const foot = rowBox.bottom - (parseFloat(getComputedStyle(row).paddingBottom) || 0);
    const value = `${Math.max(0, foot - (cap.top + cap.bottom) / 2).toFixed(2)}px`;
    if (row.style.getPropertyValue('--calendar-card-heading-middle') !== value) {
      row.style.setProperty('--calendar-card-heading-middle', value);
    }
  }

  /**
   * The date navigation, when the configuration asks for it.
   *
   * While the card is being edited everything is drawn and nothing responds. Previous and next
   * are named by Home Assistant's own strings, in its language, as the add button is; without
   * them the wrapper falls back to English accessible names that are never shown. Home is named
   * through `Intl` in the card's language, so no card string is needed.
   *
   * @returns Navigation description for the wrapper, or undefined for none
   */
  private _dateNavigation(): Toolbar.DateNavigation | undefined {
    if (!this._wantsNavigation) return undefined;

    const now = new Date();
    const language = this.effectiveLanguage;
    const page = this._pageRange(this._pageRequested, now);

    return {
      homeName: Paging.homeButtonName(this._homeRange(now), language, now),
      previousName: this._haString('ui.common.previous'),
      nextName: this._haString('ui.common.next'),
      inert: this._isBeingEdited,
      pickerValue: Paging.pageKey(page.start),
      // Only while the card is still home: paging away ends it at once.
      homeConfirming: this._homeConfirming && this._pageRequested === null,
      onPrevious: () => this._stepPage(-1),
      onHome: () => this._pressHome(),
      onNext: () => this._stepPage(1),
      onPick: (date) => this._pickDate(date),
    };
  }

  /**
   * Goes home from a press on the home button, and shows that it did for `HOME_CONFIRMATION`.
   * A press with the card already home, or while it is being edited, moves nothing and shows
   * nothing.
   */
  private _pressHome(): void {
    const away = this._pageRequested !== null;
    this._goToPage(null);
    if (!away || this._pageRequested !== null) return;

    clearTimeout(this._homeConfirmTimer);
    this._homeConfirming = true;
    this._homeConfirmTimer = setTimeout(() => {
      this._homeConfirmTimer = undefined;
      this._homeConfirming = false;
      this.requestUpdate();
    }, Constants.TIMING.HOME_CONFIRMATION);
  }

  /** Ends home's filled house at once, as on disconnect, so a card put back is never stuck on it. */
  private _settleHomeConfirmation(): void {
    clearTimeout(this._homeConfirmTimer);
    this._homeConfirmTimer = undefined;
    this._homeConfirming = false;
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
   * Asks for another page without loading it yet.
   *
   * @param page - First day of the page, or null for home
   */
  private _requestPage(page: string | null): void {
    this._pageRequested = page;
    // A page asked for any way at all ends the slide a swipe's page was waiting for. A swipe
    // asks through here as well, and records its arrival only once this returns.
    this._swipeArrival = null;
    // Likewise a search ring waiting for another page than this one: it would otherwise ring,
    // and take focus, whenever that page was next shown, however long after.
    if (this._searchRing && this._searchRing.page !== page) this._settleSearchRing();
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
      phase:
        this._refreshPhase !== 'idle' ? this._refreshPhase : this.isLoading ? 'turning' : 'idle',
      unasked: this._refreshPhase === 'idle' && this.isLoading,
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
   * Shows that it did, wherever it is shown: on the refresh button, or in the card's corner
   * where there is none. It turns for at least one turn (`REFRESH_MIN_TURN`) and for as long
   * as the load takes, then shows a check, or an alert where a calendar could not be loaded,
   * for `REFRESH_CONFIRMATION`. On a fast network the load ends within a frame or two, and
   * without the minimum a press would show nothing at all. A load the card starts by itself
   * shows only while it lasts, with nothing after.
   *
   * The outcome is the one on screen. Where another load replaced this one before it answered
   * (a page turned, the card was edited, a calendar was written to), this one commits nothing,
   * so the sequence keeps turning until the card is done loading, and reads that load's.
   *
   * Does nothing until all of that is over, nor while any load is under way, so a second
   * press never starts a second request beside the first, nor before the card's first load
   * has drawn anything. The guard is here rather than in `refreshEvents`, which a calendar
   * write must still be able to force.
   */
  private _requestRefresh(): void {
    if (this._refreshPhase !== 'idle') {
      Logger.debug('Not refreshing: the last refresh is still showing');
      return;
    }
    if (this.isLoading || this.isInitialLoad) {
      Logger.debug('Not refreshing: a load is already under way');
      return;
    }
    Logger.debug('Refreshing on request');
    const ticket = ++this._refreshTicket;
    const startedAt = Date.now();
    this._setRefreshPhase('turning');
    const load = this.refreshEvents();
    // `updateEvents` takes its own ticket before it first awaits, so this is that ticket.
    const generation = this._eventRequestGeneration;
    void load
      .then(
        () => false,
        () => true,
      )
      .then((rejected) => {
        if (ticket !== this._refreshTicket) return;
        if (generation !== this._eventRequestGeneration && this.isLoading) {
          this._refreshAwaitsLoad = { ticket, startedAt };
          return;
        }
        this._showRefreshOutcome(startedAt, rejected || this._hasFetchError);
      });
  }

  /**
   * Show how a refresh someone asked for ended, once it has turned for its minimum, and then
   * end it.
   *
   * @param startedAt - When it was asked for
   * @param failed - Whether a calendar could not be loaded
   */
  private _showRefreshOutcome(startedAt: number, failed: boolean): void {
    const turnLeft = Math.max(0, Constants.TIMING.REFRESH_MIN_TURN - (Date.now() - startedAt));
    this._refreshPhaseTimer = setTimeout(() => {
      this._setRefreshPhase(failed ? 'failed' : 'done');
      this._refreshPhaseTimer = setTimeout(
        () => this._settleRefreshPhase(),
        Constants.TIMING.REFRESH_CONFIRMATION,
      );
    }, turnLeft);
  }

  /** Show how a refresh ended whose load was replaced, once the card is done loading. */
  private _syncReplacedRefresh(): void {
    const awaiting = this._refreshAwaitsLoad;
    if (!awaiting || this.isLoading) return;
    this._refreshAwaitsLoad = null;
    if (awaiting.ticket !== this._refreshTicket) return;
    this._showRefreshOutcome(awaiting.startedAt, this._hasFetchError);
  }

  /**
   * Move a refresh someone asked for on to its next step, and draw it.
   *
   * @param phase - The step
   */
  private _setRefreshPhase(phase: Toolbar.RefreshPhase): void {
    this._refreshPhase = phase;
    this.requestUpdate();
  }

  /**
   * End a refresh someone asked for wherever it stands, with nothing left to move it on.
   * Also on disconnect, so a card put back is never stuck showing one.
   */
  private _settleRefreshPhase(): void {
    this._refreshTicket++;
    this._refreshAwaitsLoad = null;
    clearTimeout(this._refreshPhaseTimer);
    this._refreshPhaseTimer = undefined;
    if (this._refreshPhase !== 'idle') this._setRefreshPhase('idle');
  }

  //-----------------------------------------------------------------------------
  // SEARCH
  //-----------------------------------------------------------------------------

  /**
   * The search button, when the configuration asks for it and the card has its date navigation:
   * a picked result pages the card, and home is the way back.
   *
   * Named by Home Assistant's own word, as refresh is. While the card is being edited it is drawn
   * and a press does nothing.
   *
   * @returns Button description for the wrapper, or undefined for none
   */
  private _searchButton(): Toolbar.SearchButton | undefined {
    const toolbar = Config.resolveToolbar(this.config);
    if (!toolbar.show || !toolbar.search || !toolbar.navigation) return undefined;

    return {
      label: this._haString('ui.common.search'),
      onActivate: (button, pressed) => this._openSearch(button, pressed),
    };
  }

  /**
   * Opens the search panel below the magnifier, through Home Assistant's dialog manager as the
   * event popover is, and readies the year-wide load it searches (`SearchSession.prepare`).
   *
   * The magnifier takes focus first, so focus comes back to it when the panel closes, whichever
   * browser pressed it: Home Assistant and the dialog itself both give focus back to what held it
   * when the panel opened, and Safari leaves a pressed button unfocused. Nothing opens while the
   * card is being edited.
   *
   * @param button - The magnifier
   * @param pressed - Where a pointer pressed it, and with what; undefined for a key
   */
  private _openSearch(button: HTMLElement, pressed: Toolbar.ButtonPress | undefined): void {
    if (this._isBeingEdited) {
      Logger.debug('Not searching while the card is being edited');
      return;
    }
    const session = (this._search ??= new SearchSession(() => this._searchHost(), {
      picked: (row) => this._pickSearchResult(row),
      gone: () => this._searchGone(),
    }));
    if (session.isOpen) return;
    session.prepare();

    button.focus({ preventScroll: true });
    this._searchPanelGone = false;
    const at = originOf(button);
    const params: SearchPanel.SearchPanelParams = {
      source: session,
      anchor: at && { ...at, ...(pressed && { pointerType: pressed.pointerType }), below: true },
      // Over the card: the magnifier ends the row, so the panel hangs back across it.
      hang: getComputedStyle(button).direction === 'rtl' ? 'right' : 'left',
      dark: this._panelsDark(),
      language: this.effectiveLanguage,
      pastOpacity: this.effectiveConfig.past_event_opacity / 100,
    };
    const showDialog = new Event('show-dialog', { bubbles: true, composed: true });
    (showDialog as Event & { detail?: unknown }).detail = {
      dialogTag: SearchPanel.SEARCH_PANEL_TAG,
      dialogImport: () => customElements.whenDefined(SearchPanel.SEARCH_PANEL_TAG),
      dialogParams: params,
    };
    this.dispatchEvent(showDialog);
    Logger.debug('Opened the search panel');
  }

  /**
   * What a search reads of the card: its calendars and how it matches events to them, the view
   * on screen's configuration, the events it holds, the calendars the filter hides, and how it
   * names and colors a calendar.
   *
   * @returns What the search reads now
   */
  private _searchHost(): SearchHost {
    return {
      hass: this.hass,
      config: this.config,
      viewConfig: this.effectiveConfig,
      view: this.effectiveView,
      language: this.effectiveLanguage,
      hidden: this._activeHiddenCalendars,
      held: this.events,
      today: this._haString('ui.components.calendar.today'),
      colorOf: (event) =>
        this._resolvedColor(
          EventUtils.getEntityAccentColorWithOpacity(
            event._entityId,
            this.config,
            undefined,
            event,
            EntityColors.entityColors(),
          ),
        ),
      nameOf: (entityId) => this._calendarName(entityId),
      failedNameOf: (entityId) =>
        CalendarNames.failedCalendarName(entityId, this.config, this.hass),
    };
  }

  /**
   * Pages the card to a picked result's day, through the date picker's path so the page lines up
   * with home's, in the view on screen, and rings the event once that page draws it. Home brings
   * the card back, as after any jump.
   *
   * @param row - The result picked
   */
  private _pickSearchResult(row: Search.SearchRow): void {
    this._settleSearchRing();
    this._pickDate(row.day);
    this._searchRing = { target: row.target, page: this._pageRequested, focus: true };
    Logger.debug(`Search: paging to ${row.day} to ring a result`);
    this.requestUpdate();
  }

  /**
   * The search panel has closed. Home Assistant gives focus back to the magnifier a frame after
   * it hears so, so a ringed event takes focus only once that has happened, two frames on.
   */
  private _searchGone(): void {
    const afterRender = (then: () => void) => requestAnimationFrame(() => setTimeout(then));
    afterRender(() =>
      afterRender(() => {
        this._searchPanelGone = true;
        this.requestUpdate();
      }),
    );
  }

  /**
   * Rings the event a pick paged to once the page draws it, for `SEARCH_RING`, and moves focus to
   * it once the panel has gone where it is a target; where the page cannot draw it, a compact
   * card's limit or a column the width sheds, the card was paged all the same and there is
   * nothing to ring, so focus stays on the magnifier. Called after every update.
   */
  private _syncSearchRing(): void {
    const ring = this._searchRing;
    if (!ring) return;

    if (ring.until === undefined) {
      if (this._searchRingDrawn) {
        ring.until = Date.now() + Constants.TIMING.SEARCH_RING;
        clearTimeout(this._searchRingTimer);
        this._searchRingTimer = setTimeout(
          () => this._settleSearchRing(),
          Constants.TIMING.SEARCH_RING,
        );
      } else if (this._pageShown === ring.page && !this.isLoading && !this.isInitialLoad) {
        Logger.debug('Search: the page does not draw the result picked; nothing to ring');
        this._searchRing = null;
        return;
      }
    }

    if (ring.focus && ring.until !== undefined && this._searchPanelGone) {
      ring.focus = false;
      const ringed = this.renderRoot.querySelector<HTMLElement>('.search-ring');
      const target = ringed?.matches(FOCUSABLE_EVENT)
        ? ringed
        : ringed?.querySelector<HTMLElement>(FOCUSABLE_EVENT);
      target?.focus({ preventScroll: true });
      ringed?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  /** Ends a ring wherever it stands: at its end, at another pick, and on disconnect. */
  private _settleSearchRing(): void {
    clearTimeout(this._searchRingTimer);
    this._searchRingTimer = undefined;
    if (this._searchRing === null) return;
    this._searchRing = null;
    this.requestUpdate();
  }

  /**
   * Whether the card's panels, the event popover and the search panel, are drawn dark: as Home
   * Assistant's dark mode, else as the system's.
   *
   * @returns True for dark
   */
  private _panelsDark(): boolean {
    return (
      this.safeHass?.themes?.darkMode ??
      window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ??
      false
    );
  }

  //-----------------------------------------------------------------------------
  // LEGEND
  //-----------------------------------------------------------------------------

  /** Whether the configuration asks for the calendar legend, in either form. */
  private get _wantsLegend(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.legend !== false;
  }

  /** Whether the configuration asks for the legend as chips, which fold where they do not fit. */
  private get _wantsLegendChips(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.legend === 'chips';
  }

  /**
   * The calendar legend, when the configuration asks for it.
   *
   * One entry per calendar, colored by its accent as its events are and named as the card
   * names it: the name the configuration gives it, else Home Assistant's. While the card is
   * being edited every calendar is shown and nothing
   * toggles. Folded into a button under `menu`, and under `chips` while they did not all fit
   * at this width (`_syncLegendFit`).
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
      folded: !this._wantsLegendChips || this._legendFoldedFor(this._legendSignature(calendars)),
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
      // The month beside the chips, which keeps the room of its widest name, follows all of
      // these, as the chips' own width follows the language and the fonts.
      this.effectiveLanguage,
      // The heading row's inline padding follows the view.
      this.effectiveView,
      String(this._toolbarFontGeneration),
      this._wantsNavigation ? 'navigation' : '',
      String(this.config.title_font_size ?? ''),
      ...calendars.map((calendar) => `${calendar.id}\u0001${calendar.name}`),
    ].join('\u0000');
  }

  /**
   * Whether the legend's chips are folded into a button now.
   *
   * Folded from the width at which its chips did not fit, drawn with the same calendars,
   * names, language, view, fonts, navigation and title size, until the card is wide enough for
   * them by a margin. Anything else draws the chips, which `_syncLegendFit` then measures.
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
      this._hiddenMatchesStorage = ViewChoice.writeHiddenCalendars(this._configFingerprint, [
        ...next,
      ]);
    }
    this._announceHiddenCalendars([...next], this._hiddenMatchesStorage);
    Logger.debug(`${next.has(id) ? 'Hid' : 'Showed'} ${id}`);
    this.requestUpdate();
  }

  /**
   * Tells every other card with this configuration which calendars it hides now. They share
   * the remembered set, and take this one up at once (`_handleLegendChanged`).
   *
   * @param hidden - Entity ids of the calendars hidden now
   * @param stored - Whether `localStorage` took the change
   */
  private _announceHiddenCalendars(hidden: string[], stored: boolean): void {
    if (this._configFingerprint === null) return;
    const change: Legend.LegendChange = {
      fingerprint: this._configFingerprint,
      hidden,
      stored,
      source: this,
    };
    window.dispatchEvent(new CustomEvent(Legend.LEGEND_CHANGED_EVENT, { detail: change }));
  }

  /**
   * Under `legend: chips`, folds the chips into the filter button when they do not all fit in
   * the heading row, and, after a resize, draws them again once they fit.
   *
   * Reads the chips the last render drew, laid out: their natural width against the room the
   * month, which keeps the room of its widest name in full, and the arrows leave them
   * (`_legendChipsRoom`). When
   * they overflow it, the card remembers what they were drawn with and the card width from
   * which they would fit by a small margin, and draws exactly the `menu` layout instead until
   * the card is that wide, or the calendars, their names, the language, the view, the fonts,
   * the navigation or the title size change. Then the chips are drawn again and measured again.
   * An unfold that still does not fit folds again from a wider width, so the two cannot
   * alternate. Never a part of the chips, so the card never shows a filter that seems to list
   * every calendar and does not.
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
    if (!this.isConnected || !this._wantsLegendChips) return;
    this._watchToolbarFonts();

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
      if (mayUnfold && drawnFolded && this._legend()?.folded === false) {
        this._legendUnfoldedAtPx = cardWidth;
        this.requestUpdate();
      }
      return;
    }

    const needed = chips.getBoundingClientRect().width;
    const available = this._legendChipsRoom(lane);
    if (needed <= 0 || available === null) return;
    if (needed <= available + 0.5) {
      this._legendUnfoldedAtPx = null;
      return;
    }

    const legend = this._legend();
    if (!legend) return;

    const fitsFrom = Math.ceil(cardWidth + needed - available) + Constants.UI.LEGEND_UNFOLD_MARGIN;
    this._legendWidthPx = cardWidth;
    this._legendFold = {
      signature: this._legendSignature(legend.calendars),
      unfoldAtPx: Math.max(fitsFrom, (this._legendUnfoldedAtPx ?? 0) + 1),
    };
    this._legendUnfoldedAtPx = null;
    Logger.debug(
      `Legend chips need ${Math.ceil(needed)}px of ${Math.floor(available)}px; folded until ` +
        `${this._legendFold.unfoldAtPx}px`,
    );
    this.requestUpdate();
  }

  /**
   * The room the heading row leaves the legend's chips, in CSS pixels: the row less every month
   * in full, which the month keeps the room of while the chips show, and the arrows, with a gap
   * on either side of the chips, and less the chips' box's own padding, which its negative
   * margins give back. Read from the month's hidden copy and the arrows' group rather than from
   * the chips' box, which never shrinks below nothing: a month and arrows that already overflow
   * the row would otherwise read as no room at all, and say nothing about how much wider the card
   * must be. The same answer whichever layout is drawn. Negative while they overflow.
   *
   * @param lane - The chips' box
   * @returns The room, or null without layout
   */
  private _legendChipsRoom(lane: HTMLElement): number | null {
    const row = lane.parentElement;
    const probe = row?.querySelector<HTMLElement>('.toolbar-month-probe');
    if (!row || !probe) return null;
    const rowWidth = row.getBoundingClientRect().width;
    const month = probe.getBoundingClientRect().width;
    if (rowWidth <= 0 || month <= 0) return null;

    const rowStyle = getComputedStyle(row);
    const laneStyle = getComputedStyle(lane);
    const px = (value: string): number => parseFloat(value) || 0;
    const navigation = row.querySelector<HTMLElement>('.date-navigation');
    // The month's own margin pulls it back over the row's padding, as drawn.
    const monthBox = row.querySelector<HTMLElement>('.toolbar-month');
    const monthMargin = monthBox ? px(getComputedStyle(monthBox).marginInlineStart) : 0;
    return (
      rowWidth -
      px(rowStyle.paddingLeft) -
      px(rowStyle.paddingRight) -
      (month + monthMargin) -
      (navigation?.getBoundingClientRect().width ?? 0) -
      2 * px(rowStyle.columnGap) -
      px(laneStyle.paddingLeft) -
      px(laneStyle.paddingRight) -
      px(laneStyle.marginLeft) -
      px(laneStyle.marginRight)
    );
  }

  /**
   * Runs `_syncLegendFit` in the next frame, once per frame, for a card whose width moved.
   */
  private _scheduleLegendFit(): void {
    if (!this._wantsLegendChips || this._legendFitRaf !== null) return;
    this._legendFitRaf = requestAnimationFrame(() => {
      this._legendFitRaf = null;
      this._syncLegendFit();
    });
  }

  /**
   * Re-measures the heading row whenever a font finishes loading, since a late web font can
   * change the width of the month or a chip without changing anything else. Held from the first
   * measurement while the card is attached.
   */
  private _watchToolbarFonts(): void {
    if (this._toolbarFontsCleanup) return;
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts || typeof fonts.addEventListener !== 'function') return;

    const onLoaded = () => {
      if (!this.isConnected || !Config.resolveToolbar(this.config).show) return;
      this._toolbarFontGeneration++;
      this.requestUpdate();
    };
    fonts.addEventListener('loadingdone', onLoaded);
    this._toolbarFontsCleanup = () => fonts.removeEventListener('loadingdone', onLoaded);
  }

  //-----------------------------------------------------------------------------
  // THE CONFIGURATION'S OWN BUTTONS
  //-----------------------------------------------------------------------------

  /**
   * The buttons the configuration adds to the toolbar, when it adds any.
   *
   * Drawn after add, in the order written, each named by `_customButtonNames`. Where the action
   * row runs out of room they fold into its menu from the last, before add does (`_startFold`).
   * While the card is being edited everything is drawn, folded as on the dashboard, and nothing
   * runs or opens.
   *
   * @returns Each button's description for the wrapper, or undefined for none
   */
  private _customButtons(): ReadonlyArray<Toolbar.CustomButton> | undefined {
    const toolbar = Config.resolveToolbar(this.config);
    if (!toolbar.show || toolbar.buttons.length === 0) return undefined;

    return toolbar.buttons.map((button): Toolbar.CustomButton => ({
      icon: button.icon!.trim(),
      ...this._customButtonNames(button),
      onActivate: (element, pressed) => this._pressCustomButton(button, element, pressed),
    }));
  }

  /**
   * A toolbar button's names: its accessible name, which a folded menu also shows as the row's
   * words, and its tooltip.
   *
   * Its `name` is both. Without one, a button running `back`, `refresh`, `add-event` or `reset`
   * is named as the card's own button for it is, `back` as Home Assistant's own arrow: by Home
   * Assistant's word, which is its tooltip too, or in English for assistive technology alone
   * where Home Assistant has none (`_commandName`). Anything else is named by its icon's words
   * (`iconWords`), for assistive technology alone, which is why the editor asks for a name.
   *
   * @param button - The button, as configured
   * @returns Its accessible name, and its tooltip where it has one
   */
  private _customButtonNames(button: Types.ToolbarButtonConfig): {
    label: string;
    tooltip: string | undefined;
  } {
    const name = typeof button.name === 'string' ? button.name.trim() : '';
    if (name !== '') return { label: name, tooltip: name };

    const command = this._commandName(button.tap_action?.action);
    if (command) return { label: command.word ?? command.fallback, tooltip: command.word };

    const icon = button.icon!.trim();
    const words = Helpers.iconWords(icon) || icon;
    if (!unnamedButtonsReported.has(icon)) {
      unnamedButtonsReported.add(icon);
      Logger.debug(`Toolbar button ${icon} has no name; screen readers hear "${words}"`);
    }
    return { label: words, tooltip: undefined };
  }

  /**
   * The name a command's own button goes by, for a button of the configuration's own that runs
   * it: Home Assistant's word, resolved exactly as that button resolves it, and the English
   * name the button falls back on.
   *
   * @param action - The action a button runs
   * @returns The names, or undefined for an action no button of the card's own runs
   */
  private _commandName(
    action: unknown,
  ): { word: string | undefined; fallback: string } | undefined {
    switch (action) {
      case Constants.BACK_ACTION:
        return { word: this._haString('ui.common.back'), fallback: Toolbar.UNLOCALIZED_BACK_NAME };
      case 'refresh':
        return {
          word: this._haString('ui.common.refresh'),
          fallback: Toolbar.UNLOCALIZED_REFRESH_NAME,
        };
      case Constants.ADD_EVENT_ACTION:
        return {
          word: AddEvent.addEventLabel(this.safeHass),
          fallback: AddEvent.UNLOCALIZED_ADD_EVENT_NAME,
        };
      case Constants.RESET_ACTION:
        return {
          word: this._haString('ui.common.reset'),
          fallback: Toolbar.UNLOCALIZED_RESET_NAME,
        };
      default:
        return undefined;
    }
  }

  /**
   * Runs a toolbar button's action for a press, as the card runs its own `tap_action`: the
   * card's own actions through their callbacks, every other one handed to Home Assistant with the
   * button's `entity` (`Actions.handleButtonAction`).
   *
   * As for the add button, a pointer's press leaves no focus behind for Home Assistant to ring
   * once a dialog the action opens closes, and the popover `add-event` opens points at the button
   * pressed, below it. Nothing runs while the card is being edited, as for every toolbar control.
   *
   * @param button - The button, as configured
   * @param element - The button pressed, or the menu button for a row of its menu
   * @param pressed - Where a pointer pressed it, and with what; undefined for a key
   */
  private _pressCustomButton(
    button: Types.ToolbarButtonConfig,
    element: HTMLElement,
    pressed: Toolbar.ButtonPress | undefined,
  ): void {
    if (this._isBeingEdited) {
      Logger.debug('Not running a toolbar button while the card is being edited');
      return;
    }
    if (pressed) this._releasePressFocus();
    const at = originOf(element);
    const origin = at && {
      ...at,
      ...(pressed && { pointerType: pressed.pointerType }),
      below: true,
    };
    Actions.handleButtonAction(this, button, this.config.entities, this._cardActions(null, origin));
  }

  //-----------------------------------------------------------------------------
  // THE START GROUP'S MENU
  //-----------------------------------------------------------------------------

  /**
   * What the action row holds, as the start group's plan reckons with it: its start group's
   * controls in order, its end group's, how many views the switcher draws, and how far the row
   * stands in from the card's edges in this view.
   *
   * @param controls - The controls this render draws
   * @returns The row
   */
  private _actionRow(controls: ToolbarControls): ToolbarFold.ActionRow {
    const end: ToolbarFold.EndControl[] = [];
    if (controls.reset) end.push('reset');
    if (controls.refresh) end.push('refresh');
    if (controls.search) end.push('search');
    return {
      start: Toolbar.startControls(controls),
      end,
      views: controls.viewSwitcher?.views.length ?? 0,
      insetPx: Constants.UI.TOOLBAR_ROW_INSET[this.effectiveView],
    };
  }

  /**
   * Which of the start group's controls the action row draws at the card's width, and which fold
   * into its menu (`ToolbarFold.planStartGroup`).
   *
   * Decided at render, from the width the resize observer last reported, by arithmetic alone:
   * every control the plan reckons with is as wide as the stylesheet makes it, and every plan is
   * one line tall, so none changes the card's height, and the observer's own callback may decide
   * it before anything is painted. The switcher's words give way first, since they are drawn only
   * where every control fits beside them (`_toolbarLabelMinWidth`).
   *
   * A card not measured yet draws the narrowest start group, its first control and the menu
   * button, as the switcher draws its pictograms. Not every control: the observer's first report
   * would then find a row too wide for a narrow card, wrapped onto a second line, and the plan
   * drawn in its callback would change the card's height while the browser delivered that report,
   * which it reports as an error. From the narrowest group the first report only gives controls
   * back, and the row stays one line throughout.
   *
   * @param row - What the row holds
   * @returns The fold, or undefined where every control fits
   */
  private _startFold(row: ToolbarFold.ActionRow): Toolbar.StartFold | undefined {
    const widthPx = this._toolbarWidthPx ?? 0;
    const plan = ToolbarFold.planStartGroup(row, widthPx, this._startFoldAtLeast(row, widthPx));
    if (plan.overflow.length === 0) return undefined;
    return { plan, menuName: this._haString('ui.common.menu'), inert: this._isBeingEdited };
  }

  /**
   * How many of the start group's controls the plan folds at a card width, for the row drawn
   * last; as many as can fold before the card has a width (`_startFold`).
   *
   * @param widthPx - A card width, or null for none yet
   * @returns How many controls the menu holds there
   */
  private _startHidden(widthPx: number | null): number {
    const row = this._toolbarRow;
    if (row === null) return 0;
    const width = widthPx ?? 0;
    return ToolbarFold.planStartGroup(row, width, this._startFoldAtLeast(row, width)).overflow
      .length;
  }

  /**
   * The fewest controls the guard folds at a card width: what it recorded at exactly that width
   * for exactly this row, and none anywhere else (`_syncStartFoldFit`).
   *
   * @param row - What the row holds
   * @param widthPx - A card width
   * @returns The fewest controls to fold
   */
  private _startFoldAtLeast(row: ToolbarFold.ActionRow, widthPx: number): number {
    const guard = this._startFoldGuard;
    if (guard === null || guard.widthPx !== widthPx) return 0;
    return guard.signature === JSON.stringify(row) ? guard.atLeast : 0;
  }

  /**
   * Folds one more of the start group's controls into the menu where the action row, drawn by
   * the plan, still wraps or reaches past its edge: a theme's border, a card-mod rule or a zoom's
   * rounding the arithmetic cannot see.
   *
   * One way only. It records, for the width the row was drawn at and what the row held, one more
   * control to fold than the row drew there, and never fewer. So at one width the count only
   * grows, up to every control that can fold, and the passes at a width end. Nothing but the
   * width brings a control back, through the arithmetic alone, since a new width clears the record
   * (`_syncToolbarLabels`). So it cannot oscillate, and needs no hysteresis. Neither can it move the width it was
   * recorded at: every fold it adds leaves the row one line tall, never taller, and is drawn before
   * the browser looks at the card's size again, so the row it corrected never reaches the resize
   * observer, and every one-line row is as tall as every other.
   *
   * The switcher's words give way first: while it draws them, their own check decides
   * (`_syncToolbarLabelFit`), and the row is judged again once it draws its pictograms. Only
   * ever reads layout that exists. Without it, a card not laid out yet or a test environment with
   * no layout engine, every box is empty, and nothing is concluded.
   */
  private _syncStartFoldFit(): void {
    const widthPx = this._toolbarWidthPx;
    const row = this._toolbarRow;
    const actions = this.renderRoot.querySelector<HTMLElement>('.toolbar-actions');
    if (widthPx === null || row === null || !actions) return;
    if (actions.querySelector('.toolbar-button-label')) return;

    const rowBox = actions.getBoundingClientRect();
    if (rowBox.width === 0) return;
    const boxes = [...actions.querySelectorAll<HTMLElement>('.toolbar-button, .view-switcher')]
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0);
    if (boxes.length === 0) return;
    const overflows = boxes.some(
      (box) => box.right > rowBox.right + 0.5 || box.left < rowBox.left - 0.5,
    );
    const firstLineEnds = Math.min(...boxes.map((box) => box.bottom));
    const wraps = boxes.some((box) => box.top > firstLineEnds - 0.5);
    if (!overflows && !wraps) return;

    // Everything that can fold has: the end group wraps, as it does with no menu at all.
    const folded = this._startHidden(widthPx);
    if (folded >= row.start.length - 1 || row.start.length < 3) return;

    Logger.debug(`Toolbar row does not fit on one line at ${widthPx}px; folding one more control`);
    this._startFoldGuard = { widthPx, signature: JSON.stringify(row), atLeast: folded + 1 };
    this.requestUpdate();
  }

  /**
   * Whether an open menu of the start group still has its button after the coming render.
   *
   * @returns False where every control comes back into the row, the card is being edited, or
   *   hidden
   */
  private _startMenuMayStayOpen(): boolean {
    if (this._isBeingEdited || this.hidden) return false;
    return this._headerToolbar().startFold !== undefined;
  }

  /**
   * The start group's control that holds focus, where one does: add, or a button of the
   * configuration's own by its place in the list.
   *
   * @returns The control, or null
   */
  private _focusedStartControl(): ToolbarFold.StartControl | null {
    const active = (this.renderRoot as ShadowRoot).activeElement;
    if (
      !(active instanceof HTMLElement) ||
      active.parentElement?.classList.contains('toolbar-start') !== true
    ) {
      return null;
    }
    if (active.classList.contains('add-event-button')) return { kind: 'add' };
    if (!active.classList.contains('custom-button')) return null;
    const drawn = [...this.renderRoot.querySelectorAll('.toolbar-start > .custom-button')];
    return { kind: 'button', index: drawn.indexOf(active) };
  }

  /**
   * Hands focus to the menu button where the render just made folded the control that held it,
   * so a keyboard is not dropped at the start of the page.
   */
  private _handFocusToMenu(): void {
    const focused = this._focusBeforeFold;
    this._focusBeforeFold = null;
    const row = this._toolbarRow;
    const widthPx = this._toolbarWidthPx;
    if (focused === null || row === null || widthPx === null) return;

    const { overflow } = ToolbarFold.planStartGroup(
      row,
      widthPx,
      this._startFoldAtLeast(row, widthPx),
    );
    const folded = overflow.some(
      (control) =>
        control.kind === focused.kind &&
        (control.kind !== 'button' ||
          (focused.kind === 'button' && control.index === focused.index)),
    );
    if (folded) {
      this.renderRoot
        .querySelector<HTMLElement>('.custom-menu-button')
        ?.focus({ preventScroll: true });
    }
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
   * fetched: every view draws from the same events, loaded as far as the longest view the
   * card can show, so a view with fewer days draws the first of them.
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

  //-----------------------------------------------------------------------------
  // RESET
  //-----------------------------------------------------------------------------

  /** Whether a tap or hold expands the card, the one way it can be expanded. */
  private get _hasExpandAction(): boolean {
    const tapAction: Types.ActionConfig | null | undefined = this.config.tap_action;
    const holdAction: Types.ActionConfig | null | undefined = this.config.hold_action;
    return tapAction?.action === 'expand' || holdAction?.action === 'expand';
  }

  /**
   * Whether the card has something a reset could ever undo: the date navigation, the view
   * switcher, the legend or an `expand` action. Decided by the configuration alone, never by
   * what the card shows, so neither the reset button nor a `reset` action comes and goes.
   */
  private get _hasResettable(): boolean {
    return (
      this._wantsNavigation || this._wantsViewSwitcher || this._wantsLegend || this._hasExpandAction
    );
  }

  /**
   * Whether the configuration asks for the reset button, and the card has something it could
   * ever undo (`_hasResettable`). Without that the button could only ever be hidden, so it is
   * not drawn, and it never moves the controls after it.
   */
  private get _wantsReset(): boolean {
    const toolbar = Config.resolveToolbar(this.config);
    return toolbar.show && toolbar.reset && this._hasResettable;
  }

  /**
   * Whether a `reset` action may run: the card has something a reset could ever undo, with
   * or without the button, and is not being edited, when it shows its configuration anyway.
   * Elsewhere `reset` is no action at all (`_cardActionRuns`).
   *
   * Also while an expansion shows that no `expand` action can undo any more: a configuration
   * change keeps the card expanded, so an edit that swaps `expand` for `reset` would otherwise
   * leave it expanded until a reload. Asked of the action only; the button keeps its rule.
   */
  private get _canReset(): boolean {
    if (this._isBeingEdited) return false;
    return this._hasResettable || (this.isExpanded && this.hasCompactModeLimits());
  }

  /**
   * Whether the card shows something its configuration does not, on this device: a page away
   * from home, a layout picked with the switcher that draws something else at this width
   * (`_viewChoiceShows`), a hidden calendar, or a compact card expanded. Never while it is being
   * edited, when every control is inert: the page, the layout and the calendars show the
   * configuration then, and an expansion is left as it is for when editing ends.
   *
   * The page is the one asked for, so a press answers at once while home loads. An expansion
   * counts only where it shows, as a pick does: a card expanded as a list and switched to a
   * layout without compact limits keeps the flag and draws nothing different, and a lit button
   * with nothing to undo on screen would read as broken. A reset clears that flag too.
   */
  private get _differsFromConfiguration(): boolean {
    if (this._isBeingEdited) return false;
    return (
      this._pageRequested !== null ||
      this._viewChoiceShows ||
      this._activeHiddenCalendars.size > 0 ||
      (this.isExpanded && this.hasCompactModeLimits())
    );
  }

  /**
   * Whether the layout picked with the switcher draws something the configuration would not at
   * this width, as a reset would draw it. A pick the card is too narrow for falls back to the
   * list, which may be just what the configuration draws there too; the pick is kept for when
   * the card is wide enough again, and counts again then. The view alone decides it: a pick is
   * never the configured view (`_chooseView`), and two views only ever draw the same as the list.
   */
  private get _viewChoiceShows(): boolean {
    if (this._viewChoice === null) return false;
    const configured = ViewConfig.resolveColumnFitIfPicked(
      this.config.view,
      this.config,
      this._measuredWidthPx,
    );
    return configured.view !== this._effectiveView;
  }

  /**
   * The reset button, when the configuration asks for it.
   *
   * Named by Home Assistant's own word, as refresh is. Hidden while the card shows its
   * configuration, which it always does while it is being edited, after a check for a moment
   * where a press brought it back.
   *
   * @returns Button description for the wrapper, or undefined for none
   */
  private _resetButton(): Toolbar.ResetButton | undefined {
    if (!this._wantsReset) return undefined;

    return {
      label: this._haString('ui.common.reset'),
      active: this._differsFromConfiguration,
      confirmation: this._resetConfirmation ?? undefined,
      onActivate: () => this._resetToConfiguration(),
    };
  }

  /**
   * Shows the reset button's check for `RESET_CONFIRMATION`, then lets it fade out for
   * `RESET_FADE` still showing the check, and only then gives it its U-turn back, by which time it
   * is hidden: drawing the U-turn for the fade made the button flash back before it went. A press
   * during any of it does nothing, there being nothing left to undo; a change made during it shows
   * the button as itself again at once, since `active` wins over the check.
   */
  private _confirmReset(): void {
    clearTimeout(this._resetConfirmTimer);
    this._resetConfirmation = 'showing';
    this._resetConfirmTimer = setTimeout(() => {
      this._resetConfirmation = 'leaving';
      this.requestUpdate();
      this._resetConfirmTimer = setTimeout(() => {
        this._resetConfirmTimer = undefined;
        this._resetConfirmation = null;
        this.requestUpdate();
      }, Constants.TIMING.RESET_FADE);
    }, Constants.TIMING.RESET_CONFIRMATION);
  }

  /** Ends a reset's check at once, as on disconnect, so a card put back is never stuck on it. */
  private _settleResetConfirmation(): void {
    clearTimeout(this._resetConfirmTimer);
    this._resetConfirmTimer = undefined;
    this._resetConfirmation = null;
  }

  /**
   * Brings the card back to its configuration on this device: the days it opens with, `view`,
   * every calendar shown and a compact card collapsed. Forgets the layout and the calendars
   * remembered for this configuration, in one write.
   *
   * Every other card with this configuration shares that memory, and takes up the calendars
   * shown at once, as after a legend press. Its layout stays until it is reset itself, reloaded
   * or edited, since the switcher's choice is never announced.
   *
   * The view goes first: home's days follow the view on screen. Nothing is fetched for the view
   * or the calendars; home is drawn from its cache, and fetched only where it is due or a
   * calendar changed while the card was away.
   */
  private _resetToConfiguration(): void {
    if (this._isBeingEdited) {
      Logger.debug('Not resetting while the card is being edited');
      return;
    }
    if (!this._canReset) return;

    Logger.debug('Resetting to the configuration');
    if (this._configFingerprint !== null) {
      this._hiddenMatchesStorage = ViewChoice.forgetChoice(this._configFingerprint);
    }

    if (this._viewChoice !== null) {
      this._viewChoice = null;
      const fit = ViewConfig.resolveColumnFitIfPicked(
        this.requestedView,
        this.config,
        this._measuredWidthPx,
      );
      this._effectiveView = fit.view;
      this._columnCount = fit.columns;
    }

    if (this._hiddenCalendars.size > 0) {
      this._hiddenCalendars = NO_HIDDEN_CALENDARS;
      this._announceHiddenCalendars([], this._hiddenMatchesStorage);
    }

    this.isExpanded = false;
    this._goToPage(null);
    // The check belongs to the button; a card reset by its action alone has none to show it.
    if (this._wantsReset) this._confirmReset();
    this.requestUpdate();
  }

  /**
   * The card's `reset` action: what the toolbar's reset button does, run only where the card
   * shows something its configuration does not. Elsewhere there is nothing to undo, so it
   * writes nothing and shows no check, as the button, hidden then, cannot be pressed.
   */
  private _resetFromAction(): void {
    if (!this._differsFromConfiguration) {
      Logger.debug('Nothing to reset');
      return;
    }
    this._resetToConfiguration();
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
  // Home Assistant shows it as the help icon of its card editor dialog, so it opens on the docs.
  documentationURL: 'https://calendar-card-pro.alexpfau.com',
  getEntitySuggestion: Config.getEntitySuggestion,
});
