/**
 * The day panel: one day's events, as a month lists them, opened from a "+N more": a wide day's,
 * or the one that ends a narrow month's day list.
 *
 * It is the event popover's kind of panel (`popover-shell.ts`): opened through Home Assistant's
 * dialog manager (`show-dialog` with this element's tag), which gives it Back to close and puts
 * focus back on the "+N more" that opened it, and drawn as a native modal `<dialog>` in the top
 * layer beside that button, or as a sheet from the bottom of a narrow screen, in the popover's
 * glass and palette. Under the day's name, in full, it lists the day as the day model does
 * (`utils/month-day.ts`): List's rows, drawn by the card's own renderer in the card's own
 * stylesheet and custom properties, so a row reads here as it does in the card.
 *
 * Each row's time is beside its title, as in the card's own day list, and the panel fits it there
 * as the card fits its rows (`TitleFit.fitTitlesBesideTime`): the card's measuring stops at its
 * own shadow root, which the panel is outside. Until a row is measured, and in a row that cannot
 * be, its time takes a line of its own under the title.
 *
 * A row that is a button in the card is one here. Pressing it closes the panel and, once the
 * panel has gone and focus is back on "+N more", runs what a tap on the event runs on the card:
 * `event_tap_action`, the details popover among them, opening from where the panel did, or
 * `event_hold_action` where only that is set, as the card's keyboard does. Holding it runs what a
 * hold on the event runs on the card, where a hold runs anything there: `event_hold_action`, else
 * the card's `hold_action`. A link in a row stays a link. The only words of its own are Home
 * Assistant's "Close".
 */

import { mdiClose } from '@mdi/js';
import { PropertyValues, TemplateResult, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import * as Shell from './popover-shell';
import { cardStyles } from './styles';
import * as Constants from '../config/constants';
import type * as Feedback from '../interaction/feedback';
import type * as Model from '../interaction/popover-model';
import { reserveScrollingLabelWidths } from '../utils/grid-title-fit';
import * as TitleFit from '../utils/title-fit';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What the panel can ask of the card's side while it is open. */
export interface DayPanelHandle {
  /** What the day lists, or how it is drawn, changed: draw it again. */
  changed(): void;
  /** Close, as for Escape: the card is about to be edited, hidden, resized or taken away. */
  close(): void;
}

/** How the rows' titles are fitted beside their times, as the card decides it for its own. */
export interface DayPanelTitleFit {
  /** The lines a title beside its time is cut at (`title_max_lines`), or 0 for none. */
  readonly cutLines: number;
  /** Whether `title_max_lines` caps titles across lines, so a cut may fall inside a word. */
  readonly capped: boolean;
  /** Whether titles are kept to one line, beside their labels. */
  readonly oneLine: boolean;
}

/** What the day panel reads from the card, live, while it is open. */
export interface DayPanelSource {
  /** The day's rows, as the card draws them (`renderMonthDayRows`). */
  rows(): TemplateResult | typeof nothing;
  /** How the rows' titles are fitted, which the card works out from its configuration. */
  titleFit(): DayPanelTitleFit;
  /** The card's custom properties, which the rows' stylesheet reads. */
  styles(): Readonly<Record<string, string>>;
  /**
   * The day, named in full in the card's language as it is now, so a language changed while the
   * panel is open renames it with its rows; the panel keeps `DayPanelParams.title` without it.
   */
  title?(): string;
  /** The card's language as it is now, which the title and the rows are marked with. */
  language?(): string;
  /**
   * The color the card sets for its day names (`weekday_color`), which the panel's title takes as
   * the narrow list's does; `undefined` while the card leaves it at its default, and the title
   * keeps the panel's own text color.
   */
  titleColor?(): string | undefined;
  /**
   * Called as the panel opens, so the card can tell it about changes and close it.
   *
   * @param panel - The open panel
   * @returns What the panel calls once it has closed
   */
  attach(panel: DayPanelHandle): () => void;
  /**
   * Runs what a tap or a hold on a row's event runs on the card. Called once the panel has gone.
   *
   * @param target - The event, and the accent it is drawn in
   * @param origin - Where the panel opened, for the details popover to open beside in its place
   * @param gesture - A tap, the default, or a hold where `holds` says one runs anything
   */
  activate(
    target: Activation.EventTapTarget,
    origin: Feedback.PressOrigin,
    gesture?: 'tap' | 'hold',
  ): void;
  /**
   * Whether a hold on a row's event runs anything on the card, as a hold on the event there
   * would; where it does not, a long press is a tap, as on the card.
   */
  holds?(): boolean;
  /**
   * Home Assistant's "Add event" while a tap on a day adds an event on it (`day_tap_action`), so the
   * panel's title adds on its day as the narrow month's day name does; undefined while it adds
   * nothing.
   */
  addLabel?(): string | undefined;
  /**
   * Adds an event on the day. Called once the panel has gone.
   *
   * @param origin - Where the panel opened, for the new event's popover to open beside in its place
   */
  add?(origin: Feedback.PressOrigin): void;
}

/** What the card hands the day panel, through Home Assistant's `show-dialog`. */
export interface DayPanelParams {
  source: DayPanelSource;
  /** The day, named in full, as the panel opens (`DayPanelSource.title`). */
  title: string;
  /** The "+N more" it opens beside. */
  anchor?: Model.PopoverAnchor;
  /** Whether it is drawn dark, as Home Assistant's dark mode chooses. */
  dark: boolean;
  /** The card's language, which its title and rows are written in, as the panel opens. */
  language: string;
  /**
   * Opened for a search's pick hidden behind "+N more": focus starts on the row it rings, where
   * that row is a button, rather than on Close.
   */
  focusRinged?: boolean;
  /** Called once the panel has closed, however it closed. Returns nothing. */
  closed?: () => undefined;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The panel's element name; the production build drops `-dev`, as it does for the card. */
export const DAY_PANEL_TAG = 'calendar-card-pro-dev-day';

/** The panel's width beside "+N more". */
const PANEL_WIDTH = 360;

/** Home Assistant's word for closing, and the English it falls back to for assistive technology. */
const CLOSE = ['ui.common.close', 'Close'] as const;

/**
 * A box as a press beside it: its center, and the box.
 *
 * @param rect - The box, in viewport pixels
 * @returns The press
 */
function boxOrigin(rect: DOMRect): Feedback.PressOrigin {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
  };
}

//-----------------------------------------------------------------------------
// ELEMENT
//-----------------------------------------------------------------------------

/**
 * The day panel. Home Assistant's dialog manager creates it, hands it `hass`, calls `showDialog`
 * before attaching it, and calls `closeDialog` for Back; the shell it shares with the event
 * popover opens, places and closes it (`PopoverShell`).
 */
export class DayPanel extends Shell.PopoverShell {
  @state() private _params?: DayPanelParams;
  /** Bumped when the card says what the day lists changed, so the rows are drawn again. */
  @state() private _version = 0;

  private _detach?: () => void;
  /** The row pressed, whose action runs once the panel has gone, and whether it was held. */
  private _picked?: {
    target: Activation.EventTapTarget;
    origin: Feedback.PressOrigin;
    gesture: 'tap' | 'hold';
  };
  /** A pointer's press on a row, while it may still become a hold (`_onRowPointerDown`). */
  private _press?: {
    pointerId: number;
    x: number;
    y: number;
    hit: Activation.EventTapHit;
    timer: number;
    held: boolean;
  };
  /** Where an event is added on the day once the panel has gone, its title having been pressed. */
  private _adding?: Feedback.PressOrigin;
  /** Watches the rows' titles and times while they are fitted (`_syncTitleFits`). */
  private _titleWatch?: ResizeObserver;
  /** The fit asked for on the next frame, if one is. */
  private _titleFitFrame: number | null = null;
  /** Stops listening for fonts loading, while the rows' titles are fitted. */
  private _titleFontsCleanup?: () => void;

  protected readonly _logName = 'Day panel';

  protected readonly _panelWidth = PANEL_WIDTH;

  protected get _anchor(): Model.PopoverAnchor | undefined {
    return this._params?.anchor;
  }

  /** Drops what the panel showed, and runs the action of the row pressed, after it has gone. */
  protected _clear(): void {
    this._stopTitleFits();
    const detach = this._detach;
    const source = this._params?.source;
    const picked = this._picked;
    const adding = this._adding;
    this._detach = undefined;
    this._params = undefined;
    this._picked = undefined;
    this._adding = undefined;
    detach?.();
    // After the dialog manager has heard the panel close, so the popover a details action opens
    // is the dialog it opens next, and focus goes back to "+N more" when that one closes.
    if (source && picked) {
      setTimeout(() => source.activate(picked.target, picked.origin, picked.gesture));
    }
    if (source && adding) setTimeout(() => source.add?.(adding));
  }

  //---------------------------------------------------------------------------
  // HOME ASSISTANT'S DIALOG CONTRACT
  //---------------------------------------------------------------------------

  /**
   * Opens the panel on a day. Called before the element is attached, so the modal opens once it
   * is (`updated`).
   *
   * @param params - What the card handed over
   */
  public showDialog(params: DayPanelParams): void {
    // Opened again while still playing its way out: gone at once, so it opens afresh. Whatever
    // was pressed in it then is dropped, since another day is what was asked for now.
    if (this._closing) {
      this._picked = undefined;
      this._adding = undefined;
      this._closeNow();
    }
    this._detach?.();
    this._params = params;
    this._onClosed = params.closed;
    this._picked = undefined;
    this._adding = undefined;
    this._place = undefined;
    this._maxHeight = undefined;
    this._detach = params.source.attach({
      changed: () => {
        this._version += 1;
      },
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

  /**
   * Puts focus where the panel starts: on Close, or on the row a search rang where it was opened
   * for one and the row is a button, scrolled into the rows' view.
   */
  protected _focusStart(): void {
    const ringed = this._params?.focusRinged
      ? this.renderRoot.querySelector<HTMLElement>(
          '.day-panel-rows .search-ring [role="button"][tabindex]',
        )
      : null;
    if (!ringed || !this._dialog?.open) {
      super._focusStart();
      return;
    }
    ringed.focus({ preventScroll: true });
    ringed.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  //---------------------------------------------------------------------------
  // TITLES BESIDE THEIR TIMES
  //---------------------------------------------------------------------------

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._syncTitleFits();
  }

  /**
   * Places the panel beside its press once its rows are fitted, at the height it is drawn at.
   * Unfitted, a title wraps under a time it has no room beside, so the panel measures taller
   * than it draws, and keeps the top it was placed at as it shrinks: above its "+N more" rather
   * than beside it, where the popover of a row pressed in it then opens.
   *
   * @param room - The part of the screen in sight
   * @param width - The screen's width
   */
  protected _placeBeside(room: Shell.Room, width: number): void {
    this._fitTitles();
    super._placeBeside(room, width);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTitleFits();
    this._endPress();
  }

  /**
   * Fits each row's time beside its title after every render, as the card fits its own rows:
   * sized to the time, cut at `title_max_lines`, a cut inside a word without its hyphen, and the
   * labels of a title kept to one line on that line. Then again on the next frame whenever a title,
   * a time or the rows change size, as placing the panel or a sheet does, and once fonts load.
   * Measuring a row again leaves it exactly as it was, so nothing here resizes the panel twice.
   */
  private _syncTitleFits(): void {
    this._stopTitleFits();
    const source = this._params?.source;
    const rows = this.renderRoot?.querySelector<HTMLElement>('.day-panel-rows');
    if (!source || !rows || !this.isConnected) return;
    const fit = source.titleFit();
    const wrapping = Array.from(rows.querySelectorAll<HTMLElement>('.summary-row.title-wrap'));
    const oneLine = fit.oneLine
      ? Array.from(rows.querySelectorAll<HTMLElement>('.event-title.title-scrollable'))
      : [];
    if (!wrapping.length && !fit.capped && !oneLine.length) return;
    this._fitTitles();

    if (typeof ResizeObserver !== 'undefined') {
      const watch = new ResizeObserver(() => this._scheduleTitleFits());
      this._titleWatch = watch;
      watch.observe(rows);
      wrapping.forEach((row) =>
        row
          .querySelectorAll<HTMLElement>(':scope > .summary, :scope > .title-aside')
          .forEach((part) => watch.observe(part)),
      );
    }
    const fonts = document.fonts;
    if (fonts) {
      let active = true;
      const onFonts = (): void => {
        if (active) this._scheduleTitleFits();
      };
      void fonts.ready.then(onFonts);
      fonts.addEventListener?.('loadingdone', onFonts);
      this._titleFontsCleanup = () => {
        active = false;
        fonts.removeEventListener?.('loadingdone', onFonts);
      };
    }
  }

  /** Measures every row's title and time at once, then writes what it measured. */
  private _fitTitles(): void {
    const source = this._params?.source;
    const rows = this.renderRoot?.querySelector<HTMLElement>('.day-panel-rows');
    if (!source || !rows) return;
    const fit = source.titleFit();
    rows
      .querySelectorAll<HTMLElement>(`[${TitleFit.TITLE_UNHYPHENATED}]`)
      .forEach((summary) => summary.removeAttribute(TitleFit.TITLE_UNHYPHENATED));
    TitleFit.fitTitlesBesideTime(
      rows.querySelectorAll<HTMLElement>('.summary-row.title-wrap'),
      fit.cutLines,
    );
    if (fit.capped) {
      TitleFit.unhyphenateTitleCuts(
        rows.querySelectorAll<HTMLElement>('.summary:not(.summary-scroll)'),
      );
    }
    if (fit.oneLine) {
      reserveScrollingLabelWidths(
        rows.querySelectorAll<HTMLElement>('.event-title.title-scrollable'),
      );
    }
  }

  /** Fits again on the next frame, once a resize or a font load has settled. */
  private _scheduleTitleFits(): void {
    if (this._titleFitFrame !== null) cancelAnimationFrame(this._titleFitFrame);
    this._titleFitFrame = requestAnimationFrame(() => {
      this._titleFitFrame = null;
      if (this.isConnected) this._fitTitles();
    });
  }

  /** Stops watching the rows, leaving every fit in place. */
  private _stopTitleFits(): void {
    this._titleWatch?.disconnect();
    this._titleWatch = undefined;
    this._titleFontsCleanup?.();
    this._titleFontsCleanup = undefined;
    if (this._titleFitFrame !== null) {
      cancelAnimationFrame(this._titleFitFrame);
      this._titleFitFrame = null;
    }
  }

  //---------------------------------------------------------------------------
  // ROWS
  //---------------------------------------------------------------------------

  /**
   * The row an input event is on, as a button of its own: a press on a link in it is the link's.
   *
   * @param ev - A click or a key in the rows
   * @returns The row's button and its event, or undefined
   */
  private _rowAt(ev: Event): Activation.EventTapHit | undefined {
    const path = ev.composedPath();
    const link = path.findIndex(
      (node) => node instanceof Element && node.classList.contains(Activation.ROW_LINK_CLASS),
    );
    const hit = Activation.findEventTap(path, ev.currentTarget);
    if (!hit) return undefined;
    return link >= 0 && link < path.indexOf(hit.element) ? undefined : hit;
  }

  /**
   * Picks a row: the panel closes, and its event's action runs once the panel has gone, opening
   * where the panel opened, from its "+N more" or its day's cell, rather than beside a row that is
   * no longer there. Without the pointer that opened the panel: a popover reads that as its own
   * opening press, whose touch may still send it events (`EventPopover`), and the row's click,
   * which opens this one, has none left to send.
   *
   * @param hit - The row's button and its event
   * @param gesture - Whether the row was tapped or held
   */
  private _pick(hit: Activation.EventTapHit, gesture: 'tap' | 'hold' = 'tap'): void {
    if (this._closing || !this._params) return;
    this._picked = {
      target: hit.target,
      origin: this._whereOpened(hit.element as Element),
      gesture,
    };
    this._close();
  }

  /**
   * Where the panel opened, for what runs once it has gone to open in its place, without the
   * pointer that opened it (`_pick`).
   *
   * @param pressed - What was pressed in the panel, where it opened beside nothing
   * @returns The press
   */
  private _whereOpened(pressed: Element): Feedback.PressOrigin {
    const anchor = this._params?.anchor;
    return anchor
      ? { x: anchor.x, y: anchor.y, rect: anchor.rect, below: anchor.below }
      : boxOrigin(pressed.getBoundingClientRect());
  }

  /**
   * The title pressed while a tap on a day adds: the panel closes, and an event is added on its day
   * once it has gone, opening where the panel opened, as a row's popover does (`_pick`).
   *
   * @param ev - The title's click, from a press, Enter or Space
   */
  private readonly _onAdd = (ev: MouseEvent): void => {
    if (this._closing || !this._params) return;
    this._adding = this._whereOpened(ev.currentTarget as Element);
    this._close();
  };

  private readonly _onRowClick = (ev: MouseEvent): void => {
    const hit = this._rowAt(ev);
    if (!hit) return;
    ev.preventDefault();
    // The click a held press derives finds the panel closing for the hold, and picks nothing.
    this._pick(hit);
  };

  /**
   * A pointer's press on a row's button, where a hold on it runs anything: held still for as long
   * as the card waits for a hold, it is a hold, which its pointer-up picks (`_onRowPointerUp`).
   * Its primary button only, as on the card.
   */
  private readonly _onRowPointerDown = (ev: PointerEvent): void => {
    this._endPress();
    if (ev.isPrimary === false || (typeof ev.button === 'number' && ev.button !== 0)) return;
    if (this._closing || !this._params?.source.holds?.()) return;
    const hit = this._rowAt(ev);
    if (!hit) return;
    const press = {
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      hit,
      held: false,
      timer: window.setTimeout(() => {
        press.held = true;
      }, Constants.TIMING.HOLD_THRESHOLD),
    };
    this._press = press;
  };

  /** A press that moves, as a finger scrolling the rows does, is no hold. */
  private readonly _onRowPointerMove = (ev: PointerEvent): void => {
    const press = this._press;
    if (!press || press.held || ev.pointerId !== press.pointerId) return;
    if (
      Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > Constants.UI.POINTER_MOVE_TOLERANCE
    ) {
      this._endPress();
    }
  };

  /** A held press picks its row as a hold as it lets go; any other is left to its click. */
  private readonly _onRowPointerUp = (ev: PointerEvent): void => {
    const press = this._press;
    if (!press || ev.pointerId !== press.pointerId) return;
    this._endPress();
    if (press.held) this._pick(press.hit, 'hold');
  };

  /** Forgets the press on a row, if one is under way. */
  private _endPress(): void {
    if (this._press) clearTimeout(this._press.timer);
    this._press = undefined;
  }

  private readonly _onRowPointerCancel = (ev: PointerEvent): void => {
    if (ev.pointerId === this._press?.pointerId) this._endPress();
  };

  /** Enter and Space on a row's button press it, as on a native button. */
  private readonly _onRowKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.repeat || ev.isComposing) return;
    const hit = this._rowAt(ev);
    if (!hit || ev.composedPath()[0] !== hit.element) return;
    ev.preventDefault();
    this._pick(hit);
  };

  //---------------------------------------------------------------------------
  // RENDERING
  //---------------------------------------------------------------------------

  /**
   * One of Home Assistant's strings, or the English for assistive technology where it has none.
   *
   * @param key - The string's key
   * @param fallback - The English
   * @returns The words
   */
  private _named(key: string, fallback: string): string {
    const value = this.hass?.localize?.(key);
    return value && value !== key ? value : fallback;
  }

  protected render(): TemplateResult {
    const params = this._params;
    if (!params) return html`<dialog></dialog>`;
    // Read so a change the card reports draws the rows again.
    void this._version;

    const place = this._place;
    const panelStyle = [
      this._roomStyle,
      place?.arrow ? `transform-origin:${Shell.arrowPoint(place.arrow)}` : '',
    ]
      .filter((part) => part !== '')
      .join(';');
    const close = this._named(...CLOSE);
    const addLabel = params.source.addLabel?.();
    // Marked with the card's language, which may not be the page's; the add button around it is
    // named in Home Assistant's.
    const language = params.source.language?.() ?? params.language;
    const day = html`<span id="day-panel-day" lang=${language}
      >${params.source.title?.() ?? params.title}</span
    >`;

    return html`
      <dialog
        class="${params.dark ? 'dark' : 'light'} ${this._sheet ? 'sheet' : 'popover'}${this._lift > 0 ? ' lifted' : ''}"
        ?data-placed=${this._sheet || !!place}
        style=${Shell.placedStyle(this._sheet, place, this._lift)}
        aria-labelledby="day-panel-day"
        @cancel=${this._onCancel}
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
        @keydown=${this._keepKeys}
      >
        <div class="panel day-panel" style=${panelStyle} ?inert=${this._closing}>
          ${Shell.renderGrabber(this._sheet)}
          <div class="day-panel-head">
            <h2
              class="day-panel-title"
              id="day-panel-title"
              style=${styleMap({ color: params.source.titleColor?.() })}
            >
              ${
                addLabel
                  ? html`<button
                      type="button"
                      class="day-panel-add"
                      aria-label=${addLabel}
                      aria-describedby="day-panel-day"
                      @click=${this._onAdd}
                    >
                      ${day}
                    </button>`
                  : day
              }
            </h2>
            <button
              type="button"
              class="day-panel-close"
              autofocus
              aria-label=${close}
              title=${close}
              @click=${() => this._close()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d=${mdiClose}></path>
              </svg>
            </button>
          </div>
          <div
            class="day-panel-rows"
            lang=${language}
            style=${styleMap(params.source.styles())}
            @click=${this._onRowClick}
            @keydown=${this._onRowKey}
            @pointerdown=${this._onRowPointerDown}
            @pointermove=${this._onRowPointerMove}
            @pointerup=${this._onRowPointerUp}
            @pointercancel=${this._onRowPointerCancel}
          >
            ${params.source.rows()}
          </div>
        </div>
        ${Shell.renderBeak(place?.arrow)}
      </dialog>
    `;
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

  /*
   * The card's own stylesheet comes after the shell's, so a row reads here as in the card, and
   * the panel's own rules come last. The card's sets its host as a block as tall as its slot,
   * which a dialog's host must not be.
   */
  static styles = [
    Shell.shellStyles,
    Shell.cellStyles,
    cardStyles,
    css`
      :host {
        display: inline;
        height: auto;
      }
      .panel.day-panel {
        width: 360px;
        gap: 10px;
        overflow: hidden;
      }
      .sheet .panel.day-panel {
        width: 100%;
      }
      .day-panel-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .day-panel-title {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.3;
        color: var(--text);
      }
      /* While a tap on a day adds, the title is a button that adds on the day, as the narrow
         month's day name is: the title as it is, with the press feedback of the name. */
      .day-panel-add {
        display: block;
        width: 100%;
        margin: -4px -6px;
        padding: 4px 6px;
        border: 0;
        border-radius: 6px;
        background: none;
        font: inherit;
        color: inherit;
        text-align: start;
        cursor: pointer;
        box-sizing: content-box;
      }
      @media (hover: hover) {
        .day-panel-add:hover {
          background-color: var(--button);
        }
      }
      .day-panel-add:active {
        background-color: var(--button);
      }
      .day-panel-close {
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
      .day-panel-close svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }
      /* The rows are the card's, in the card's font and colors, on the panel's glass. */
      .day-panel-rows {
        flex: 0 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
        color: var(--primary-text-color);
      }
      .day-panel-rows .month-day-table {
        margin: 0;
      }
    `,
  ];
}

if (!customElements.get(DAY_PANEL_TAG)) {
  customElements.define(DAY_PANEL_TAG, DayPanel);
}
