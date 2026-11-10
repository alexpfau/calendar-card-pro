/**
 * The search panel: a field to search the card's events with, and what it finds.
 *
 * It is the event popover's kind of panel (`popover-shell.ts`): opened through Home Assistant's
 * dialog manager (`show-dialog` with this element's tag), which gives it Back to close and puts
 * focus back on the magnifier that opened it, and drawn as a native modal `<dialog>` in the top
 * layer, hanging below the magnifier with its beak pointing up at it, or as a sheet from the
 * bottom of a narrow screen, in the popover's glass and palette. The field is its first cell and
 * the results are cells under it, grouped by month: upcoming first, then a thin rule and the
 * past, dimmed. What it finds comes from the card (`SearchSource`), which loads a year back and
 * a year ahead once the panel opens and tells the panel as each calendar answers.
 *
 * The field is a combobox and the results its listbox, as the WAI-ARIA Authoring Practices
 * describe one: Down and Up move through the results while focus stays in the field, Enter
 * picks, Escape closes. Picking does what a result is for, paging the card to it, rather than
 * putting its words in the field: the combobox pattern allows a pick to perform such a default
 * action, as its own example of a messaging app accepting a recipient does. How many results a
 * term finds is announced once typing pauses, as Home Assistant's own search does. Every word it
 * shows is Home Assistant's own (`hass.localize`), so it needs no translation of its own.
 */

import { mdiClose, mdiMagnify } from '@mdi/js';
import { TemplateResult, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import * as Shell from './popover-shell';
import type * as Model from '../interaction/popover-model';
import type * as Search from '../utils/search';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What the panel can ask of it while it is open. */
export interface SearchPanelHandle {
  /** What `find` answers, or how the load stands, changed. */
  changed(): void;
  /** Close, as for Escape: the card is about to be edited, hidden, resized or taken away. */
  close(): void;
}

/** What the search panel reads from the card, live, while it is open. */
export interface SearchSource {
  /**
   * What a term finds, in the order and groups the panel draws them.
   *
   * @param term - The term as typed
   */
  find(term: string): Search.SearchResults;
  /** Whether calendars of the year-wide load are still to answer. */
  readonly loading: boolean;
  /** The calendars that could not be loaded, as the card names them. */
  readonly failed: ReadonlyArray<string>;
  /**
   * Called as the panel opens, so the card can tell it about changes and close it.
   *
   * @param panel - The open panel
   * @returns What the panel calls once it has closed and focus has gone back
   */
  attach(panel: SearchPanelHandle): () => void;
  /**
   * Pages the card to a result's day, and rings the event there.
   *
   * @param id - The result's row (`SearchRow.id`)
   */
  pick(id: string): void;
}

/** What the card hands the search panel, through Home Assistant's `show-dialog`. */
export interface SearchPanelParams {
  source: SearchSource;
  /** The magnifier's press, which the panel hangs below. */
  anchor?: Model.PopoverAnchor;
  /** Which way it hangs from the magnifier: over the card, left of it unless right to left. */
  hang: 'left' | 'right';
  /** Whether it is drawn dark, as Home Assistant's dark mode chooses. */
  dark: boolean;
  /** The card's language, which its results are written in. */
  language: string;
  /** How opaque a past event's row is, as the card draws past events. */
  pastOpacity: number;
  /** Called once the panel has closed, however it closed. Returns nothing. */
  closed?: () => undefined;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The panel's element name; the production build drops `-dev`, as it does for the card. */
export const SEARCH_PANEL_TAG = 'calendar-card-pro-dev-search';

/** The panel's width below the magnifier. */
const PANEL_WIDTH = 440;

/**
 * The room a few results need under the field. Where there is less below the magnifier and more
 * above it, as at the foot of a scrolled page, the panel opens above the magnifier instead.
 */
const MIN_ROOM = 240;

/** How long typing has to pause before the count is announced, as in Home Assistant's search. */
const ANNOUNCE_AFTER_MS = 500;

/** Home Assistant's strings, and the English each falls back to for assistive technology alone. */
const T = {
  search: ['ui.common.search', 'Search'],
  close: ['ui.common.close', 'Close'],
  noMatch: ['ui.components.combo-box.no_match', 'No matching items found'],
  noResults: ['ui.components.combo-box.no_results', 'No results for {term}'],
  count: ['ui.components.combo-box.result_count', '{count} results for {term}'],
  failed: [
    'ui.components.calendar.event_retrieval_error',
    'Could not retrieve events for calendars',
  ],
} as const;

type StringKey = keyof typeof T;

//-----------------------------------------------------------------------------
// ELEMENT
//-----------------------------------------------------------------------------

/**
 * The search panel. Home Assistant's dialog manager creates it, hands it `hass`, calls
 * `showDialog` before attaching it, and calls `closeDialog` for Back; the shell it shares with
 * the event popover opens, places and closes it (`PopoverShell`).
 */
export class SearchPanel extends Shell.PopoverShell {
  @state() private _params?: SearchPanelParams;
  /** The term as typed. */
  @state() private _term = '';
  /** The result the keyboard is on (`SearchRow.id`), which Enter picks. */
  @state() private _active?: string;
  /** What the status region says: the count, once typing pauses. */
  @state() private _status = '';
  /** The room the panel has, beside its anchor, and where its foot is held when it opens above. */
  @state() private _room?: { maxHeight: number; bottom?: number };
  /** Bumped when the card says what it finds changed, so the results are read again. */
  @state() private _version = 0;

  private _detach?: () => void;
  private _announceTimer?: ReturnType<typeof setTimeout>;
  private _found?: { term: string; version: number; results: Search.SearchResults };

  protected readonly _logName = 'Search';

  protected readonly _panelWidth = PANEL_WIDTH;

  protected get _anchor(): Model.PopoverAnchor | undefined {
    return this._params?.anchor;
  }

  protected _clear(): void {
    clearTimeout(this._announceTimer);
    this._announceTimer = undefined;
    const detach = this._detach;
    this._detach = undefined;
    this._params = undefined;
    this._found = undefined;
    this._term = '';
    this._active = undefined;
    this._status = '';
    this._room = undefined;
    detach?.();
  }

  //---------------------------------------------------------------------------
  // HOME ASSISTANT'S DIALOG CONTRACT
  //---------------------------------------------------------------------------

  /**
   * Opens the panel, empty: nothing is remembered from one search to the next.
   *
   * Called before the element is attached, so the modal opens once it is (`updated`).
   *
   * @param params - What the card handed over
   */
  public showDialog(params: SearchPanelParams): void {
    // Opened again while still playing its way out: gone at once, so it opens afresh.
    if (this._closing) this._closeNow();
    this._detach?.();
    this._params = params;
    this._onClosed = params.closed;
    this._found = undefined;
    this._term = '';
    this._active = undefined;
    this._status = '';
    this._place = undefined;
    this._room = undefined;
    this._detach = params.source.attach({
      changed: () => this._changed(),
      close: () => this._close(),
    });
    this._wantOpen = true;
    this.requestUpdate();
  }

  /**
   * Closes the panel for Home Assistant's Back.
   *
   * @returns Always true: there is nothing to keep it open for
   */
  public closeDialog(): boolean {
    this._close();
    return true;
  }

  /** Closes the panel, once, playing its way out. */
  private _close(): void {
    if (this._closing || !this._params) return;
    this._finish();
  }

  //---------------------------------------------------------------------------
  // PLACING
  //---------------------------------------------------------------------------

  /**
   * Hangs the panel below the magnifier, its beak pointing up at it, and lets it grow down to the
   * foot of the viewport, scrolling its results inside. Where there is too little room below and
   * more above, it opens above the magnifier and grows up from it instead, its foot held there. On
   * a narrow screen it is a sheet from the bottom, as the event popover is.
   */
  protected _position(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this._sheet = width < Shell.SHEET_BELOW_PX;
    if (this._sheet) {
      this._place = undefined;
      this._room = undefined;
      return;
    }

    const anchor = this._params?.anchor;
    if (!anchor) {
      const { left } = Shell.placeAt(undefined, MIN_ROOM, { width, height }, PANEL_WIDTH);
      this._place = { left, top: Shell.MARGIN };
      this._room = { maxHeight: height - 2 * Shell.MARGIN };
      return;
    }

    const rect = anchor.rect ?? {
      left: anchor.x,
      right: anchor.x,
      top: anchor.y,
      bottom: anchor.y,
    };
    const { left, at } = Shell.hangBelow(rect, PANEL_WIDTH, width, this._params?.hang);
    const below = height - rect.bottom - Shell.BELOW_GAP - Shell.MARGIN;
    const above = rect.top - Shell.BELOW_GAP - Shell.MARGIN;
    if (below < MIN_ROOM && above > below) {
      this._place = { left, top: rect.top - Shell.BELOW_GAP, arrow: { side: 'bottom', at } };
      this._room = { maxHeight: above, bottom: height - (rect.top - Shell.BELOW_GAP) };
    } else {
      this._place = { left, top: rect.bottom + Shell.BELOW_GAP, arrow: { side: 'top', at } };
      this._room = { maxHeight: Math.max(0, below) };
    }
  }

  //---------------------------------------------------------------------------
  // FINDING
  //---------------------------------------------------------------------------

  /** The card says what it finds changed: read the results again, and announce them anew. */
  private _changed(): void {
    this._version += 1;
    if (this._term.trim()) this._scheduleAnnounce();
  }

  /** What the term finds now, read once per term and per change the card reports. */
  private get _results(): Search.SearchResults | undefined {
    const source = this._params?.source;
    if (!source) return undefined;
    const found = this._found;
    if (found && found.term === this._term && found.version === this._version) return found.results;
    const results = source.find(this._term);
    this._found = { term: this._term, version: this._version, results };
    return results;
  }

  /** The rows drawn, in the order the keyboard moves through them. */
  private _drawnRows(): Search.SearchRow[] {
    return (this._results?.groups ?? []).flatMap((group) => group.hits.map((hit) => hit.row));
  }

  private _onInput(ev: Event): void {
    this._term = (ev.target as HTMLInputElement).value;
    this._active = undefined;
    this._scheduleAnnounce();
  }

  /**
   * The field's keys: Down and Up move through the results while focus stays in the field, Enter
   * picks the one the keyboard is on, Escape closes. Not while an input method is composing.
   *
   * @param ev - A key in the field
   */
  private _onKeyDown(ev: KeyboardEvent): void {
    if (ev.isComposing) return;
    const rows = this._drawnRows();
    const at = rows.findIndex((row) => row.id === this._active);
    switch (ev.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        ev.preventDefault();
        if (rows.length === 0) return;
        const step = ev.key === 'ArrowDown' ? 1 : -1;
        const next =
          at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length;
        this._active = rows[next].id;
        void this.updateComplete.then(() =>
          this.renderRoot
            .querySelector('[role="option"][aria-selected="true"]')
            ?.scrollIntoView?.({ block: 'nearest' }),
        );
        return;
      }
      case 'Enter':
        if (at >= 0) {
          ev.preventDefault();
          this._pick(rows[at].id);
        }
        return;
      case 'Escape':
        ev.preventDefault();
        this._close();
        return;
    }
  }

  /**
   * Picks a result: the panel closes, and the card pages to its day and rings it.
   *
   * @param id - The result's row
   */
  private _pick(id: string): void {
    const source = this._params?.source;
    if (!source || this._closing) return;
    this._close();
    source.pick(id);
  }

  //---------------------------------------------------------------------------
  // ANNOUNCING
  //---------------------------------------------------------------------------

  /**
   * Announces how many results the term finds once typing pauses, in Home Assistant's own words,
   * so the count never competes with each character typed. Focus stays in the field, so without
   * it a screen reader would hear nothing of the list changing.
   */
  private _scheduleAnnounce(): void {
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => {
      this._announceTimer = undefined;
      this._status = this._statusText();
    }, ANNOUNCE_AFTER_MS);
  }

  /**
   * What the status region says for the term typed: how many results it finds, every one and not
   * only those drawn, or that it finds none; nothing for no term. The term is quoted as Home
   * Assistant's own search quotes it.
   *
   * @returns The words
   */
  private _statusText(): string {
    const typed = this._term.trim();
    if (!typed) return '';
    const term = `‘${typed}’`;
    const total = this._results?.total ?? 0;
    if (total === 0) {
      return (
        this._localized(T.noResults[0], { term }) ??
        this._localized(T.noMatch[0]) ??
        T.noResults[1].replace('{term}', term)
      );
    }
    return (
      this._localized(T.count[0], { count: total, term }) ??
      `${total} ${total === 1 ? 'result' : 'results'} for ${term}`
    );
  }

  //---------------------------------------------------------------------------
  // WORDS
  //---------------------------------------------------------------------------

  /**
   * One of Home Assistant's strings, or undefined where it has none.
   *
   * @param key - The string's key
   * @param values - What it is filled with
   * @returns The words
   */
  private _localized(key: string, values?: Record<string, unknown>): string | undefined {
    const value = values ? this.hass?.localize?.(key, values) : this.hass?.localize?.(key);
    return value && value !== key ? value : undefined;
  }

  /**
   * One of Home Assistant's strings for assistive technology, in English where it has none.
   *
   * @param key - Which
   * @returns The words
   */
  private _named(key: StringKey): string {
    return this._localized(T[key][0]) ?? T[key][1];
  }

  //---------------------------------------------------------------------------
  // RENDERING
  //---------------------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    const params = this._params;
    if (!params) return html`<dialog></dialog>`;

    const place = this._place;
    const room = this._room;
    const dialogStyle =
      place && room?.bottom !== undefined
        ? `left:${place.left}px;top:auto;bottom:${room.bottom}px;`
        : Shell.placedStyle(this._sheet, place);
    const panelStyle = [
      `--past-opacity:${params.pastOpacity}`,
      room ? `max-height:${room.maxHeight}px` : '',
      place?.arrow ? `transform-origin:${Shell.arrowPoint(place.arrow)}` : '',
    ]
      .filter((part) => part !== '')
      .join(';');
    const results = this._results;
    const searchWord = this._localized(T.search[0]);
    const rows = this._drawnRows();
    const active = rows.findIndex((row) => row.id === this._active);
    const term = this._term.trim();

    return html`
      <dialog
        class="${params.dark ? 'dark' : 'light'} ${this._sheet ? 'sheet' : 'popover'}"
        ?data-placed=${this._sheet || !!place}
        style=${dialogStyle}
        aria-label=${this._named('search')}
        @cancel=${this._onCancel}
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
        @keydown=${this._keepKeys}
      >
        <div class="panel search" style=${panelStyle} ?inert=${this._closing}>
          ${Shell.renderGrabber(this._sheet)}
          <div class="cell field">
            <span class="field-mark" aria-hidden="true">
              ${
                params.source.loading
                  ? html`<span class="field-wait">
                      ${this._renderMagnifier()}
                      <span class="field-ring"><span class="spinner"></span></span>
                    </span>`
                  : this._renderMagnifier()
              }
            </span>
            <input
              type="search"
              class="field-input"
              role="combobox"
              autofocus
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="search"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-expanded=${rows.length > 0 ? 'true' : 'false'}
              aria-activedescendant=${active >= 0 ? `search-option-${active}` : nothing}
              aria-label=${this._named('search')}
              placeholder=${searchWord ?? nothing}
              .value=${this._term}
              @input=${this._onInput}
              @keydown=${this._onKeyDown}
            />
            <button
              type="button"
              class="field-close"
              aria-label=${this._named('close')}
              title=${this._localized(T.close[0]) ?? nothing}
              @click=${() => this._close()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d=${mdiClose}></path>
              </svg>
            </button>
          </div>
          <div class="visually-hidden" role="status">${this._status}</div>
          ${this._renderResults(results, rows, active)}
          ${
            term && results?.total === 0 && !params.source.loading
              ? this._renderNote(this._localized(T.noMatch[0]))
              : nothing
          }
          ${this._renderFailed(params.source.failed)}
        </div>
        ${Shell.renderBeak(place?.arrow)}
      </dialog>
    `;
  }

  /**
   * The field's magnifier. A template of its own, so the wait for a slow year (`render`) draws a
   * new one each time it begins, and the step that hides it starts again with it.
   *
   * @returns The icon
   */
  private _renderMagnifier(): TemplateResult {
    return html`<svg class="field-icon" viewBox="0 0 24 24" focusable="false">
      <path d=${mdiMagnify}></path>
    </svg>`;
  }

  /**
   * The results, grouped by month: upcoming first, then a thin rule and the past, dimmed. In the
   * card's language, which their dates and times are written in; Home Assistant's words around
   * them are in its own.
   *
   * @param results - What the term finds
   * @param rows - The rows drawn, in order
   * @param active - Where the keyboard is among them, or -1
   * @returns The listbox, there even when empty, since the field names it
   */
  private _renderResults(
    results: Search.SearchResults | undefined,
    rows: Search.SearchRow[],
    active: number,
  ): TemplateResult {
    const groups = results?.groups ?? [];
    const firstPast = groups.findIndex((group) => group.past);
    let drawn = 0;
    return html`<div
      class=${rows.length > 0 ? 'results' : 'results empty'}
      id="search-results"
      role="listbox"
      lang=${this._params?.language ?? nothing}
      aria-label=${this._named('search')}
    >
      ${groups.map((group, at) => {
        const className = [
          'month',
          group.past ? 'past' : '',
          at === firstPast && firstPast > 0 ? 'past-start' : '',
        ]
          .filter((part) => part !== '')
          .join(' ');
        const first = drawn;
        drawn += group.hits.length;
        return html`<div class=${className} role="group" aria-labelledby="search-month-${at}">
          <div class="month-name" id="search-month-${at}" role="presentation">${group.label}</div>
          ${group.hits.map((hit, offset) =>
            this._renderHit(hit, first + offset, first + offset === active),
          )}
        </div>`;
      })}
    </div>`;
  }

  /**
   * One result: the calendar's color bar, the title, and a line with the day, the time and the
   * location, the term marked where it was found. Named for assistive technology by its title,
   * day, time and calendar.
   *
   * @param hit - The result
   * @param index - Its place among the rows drawn
   * @param active - Whether the keyboard is on it
   * @returns The option
   */
  private _renderHit(hit: Search.SearchHit, index: number, active: boolean): TemplateResult {
    const row = hit.row;
    const name = [row.title, row.dayText, row.timeText, row.calendar]
      .filter((part) => part.trim() !== '')
      .join(', ');
    return html`<div
      class="cell group result"
      id="search-option-${index}"
      role="option"
      aria-selected=${active ? 'true' : 'false'}
      aria-label=${name}
      style="--event-color:${row.color}"
      @click=${() => this._pick(row.id)}
    >
      <span class="bar"></span>
      <span class="lines">
        <span class="result-title">${marked(row.title, hit.title)}</span>
        <span class="result-detail"
          >${row.dayText} ·
          ${row.timeText}${
            row.location ? html` · ${marked(row.location, hit.location)}` : nothing
          }</span
        >
      </span>
    </div>`;
  }

  /**
   * A line under the results, in Home Assistant's words, or nothing where it has none.
   *
   * @param words - The words
   * @param error - Whether they report a failure
   * @returns The line
   */
  private _renderNote(words: string | undefined, error = false): TemplateResult | typeof nothing {
    return words ? html`<div class=${error ? 'note error' : 'note'}>${words}</div>` : nothing;
  }

  /**
   * The calendars whose year could not be loaded, named after Home Assistant's own words for it.
   *
   * @param failed - Their names
   * @returns The line, or nothing
   */
  private _renderFailed(failed: ReadonlyArray<string>): TemplateResult | typeof nothing {
    if (failed.length === 0) return nothing;
    const words = this._localized(T.failed[0]);
    return words ? this._renderNote(`${words}: ${failed.join(', ')}`, true) : nothing;
  }

  //---------------------------------------------------------------------------
  // INPUT
  //---------------------------------------------------------------------------

  /** Escape, wherever focus is in the panel, closes it. */
  private readonly _onCancel = (ev: Event): void => {
    ev.preventDefault();
    this._close();
  };

  /** Where a press begins: on the backdrop, it may close the panel (`_onClick`). */
  private readonly _onPointerDown = (ev: PointerEvent): void => {
    this._backdropDown = ev.target === this._dialog;
  };

  /** A press that starts and ends outside the panel closes it. */
  private readonly _onClick = (ev: MouseEvent): void => {
    if (this._isBackdropPress(ev)) this._close();
  };

  static styles = css`
    ${Shell.shellStyles}
    ${Shell.cellStyles}
    .light {
      --mark: rgba(255, 204, 0, 0.45);
    }
    .dark {
      --mark: rgba(255, 214, 10, 0.34);
    }
    .panel.search {
      width: 440px;
      overflow: hidden;
      gap: 8px;
    }
    /* A sheet opens at its full height, so the field stands high on a phone's screen, above
       the keyboard that typing into it raises. */
    .sheet .panel.search {
      width: 100%;
      height: 85vh;
    }
    .field {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 12px;
    }
    .field:focus-within {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    /* Without color-mix() (Safari before 16.2) the ring above is no ring at all, as the
       popover's focus rings are not; a thinner one in the solid accent stands in, as there. */
    @supports not (color: color-mix(in srgb, red, blue)) {
      .field:focus-within {
        box-shadow: 0 0 0 2px var(--accent);
      }
    }
    /* The magnifier, and in its place, once the year has been loading for a second, a spinner.
       A load that ends sooner, as most do, shows the magnifier alone: until then the search
       finds what the card holds, and nobody has waited long enough to need telling. A step at
       that second swaps them in one frame, with no timer, so a sooner load never paints the
       spinner. Each wait the panel draws gets its own magnifier and spinner, so a load that
       begins again after the panel drew the last one ending waits its own second, rather than
       keeping a step that already ran and leaving the field empty. A load whose end the panel
       never drew is one wait to the person waiting, and goes on. The spinner's step is on its
       wrapper, so stopping the spinner for reduced motion keeps it.
       The magnifier itself never turns: it is not round, and turning it read as a glitch
       rather than as waiting. */
    .field-mark,
    .field-wait {
      flex: none;
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
    }
    .field-wait > * {
      grid-area: 1 / 1;
    }
    .field-icon {
      width: 20px;
      height: 20px;
      fill: var(--dim);
    }
    .field-wait > .field-icon {
      animation: field-wait-hide 0s linear 1s both;
    }
    .field-ring {
      display: flex;
      animation: field-wait-show 0s linear 1s both;
    }
    .field-ring .spinner {
      box-sizing: border-box;
      width: 16px;
      height: 16px;
    }
    @keyframes field-wait-hide {
      to {
        opacity: 0;
      }
    }
    @keyframes field-wait-show {
      from {
        opacity: 0;
      }
    }
    /* At least 16px, below which a phone zooms the page in as the field takes focus. */
    .field-input {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 16px;
      appearance: none;
    }
    .field-input:focus-visible {
      outline: none;
    }
    .field-input::-webkit-search-cancel-button,
    .field-input::-webkit-search-decoration {
      appearance: none;
    }
    .field-input::placeholder {
      color: var(--dim);
    }
    .field-close {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--button);
      color: var(--text);
      cursor: pointer;
    }
    .field-close svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .results {
      flex: 0 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .results.empty {
      display: none;
    }
    .month {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .month.past-start {
      margin-top: 4px;
      padding-top: 10px;
      border-top: 1px solid var(--pop-edge);
    }
    .month-name {
      padding: 2px 4px 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--dim);
    }
    .result {
      padding: 8px 12px 8px 10px;
      cursor: pointer;
    }
    .result[aria-selected='true'] {
      background: color-mix(in srgb, var(--accent) 18%, var(--cell));
    }
    /* Without color-mix() (Safari before 16.2) the tint above is invalid once its var() is
       substituted, which leaves the selected result with no background at all, and so less
       marked than its neighbors. It keeps the cell's own background there, ringed inside in
       the accent, which is what the arrow keys need to see. */
    @supports not (color: color-mix(in srgb, red, blue)) {
      .result[aria-selected='true'] {
        background: var(--cell);
        box-shadow: inset 0 0 0 2px var(--accent);
      }
    }
    .past .result > * {
      opacity: var(--past-opacity, 0.6);
    }
    .lines {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }
    .result-title,
    .result-detail {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .result-title {
      font-weight: 500;
    }
    .result-detail {
      font-size: 13px;
      color: var(--dim);
    }
    mark {
      border-radius: 3px;
      background: var(--mark);
      color: inherit;
    }
    .note {
      padding: 2px 4px;
      font-size: 13px;
      color: var(--dim);
    }
    .note.error {
      color: var(--danger);
    }
  `;
}

/**
 * Words with the part where the term was found marked.
 *
 * @param words - The words as drawn
 * @param range - Where the term was found, if it was
 * @returns The words, the found part in a `<mark>`
 */
function marked(words: string, range: Search.TextRange | undefined): TemplateResult | string {
  if (!range) return words;
  const [from, to] = range;
  return html`${words.slice(0, from)}<mark>${words.slice(from, to)}</mark>${words.slice(to)}`;
}

if (!customElements.get(SEARCH_PANEL_TAG)) {
  customElements.define(SEARCH_PANEL_TAG, SearchPanel);
}
