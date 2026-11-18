/**
 * The day panel: one day's events, as a month lists them, opened from a wide month's "+N more".
 *
 * It is the event popover's kind of panel (`popover-shell.ts`): opened through Home Assistant's
 * dialog manager (`show-dialog` with this element's tag), which gives it Back to close and puts
 * focus back on the "+N more" that opened it, and drawn as a native modal `<dialog>` in the top
 * layer beside that button, or as a sheet from the bottom of a narrow screen, in the popover's
 * glass and palette. Under the day's name, in full, it lists the day as the day model does
 * (`utils/month-day.ts`): List's rows, drawn by the card's own renderer in the card's own
 * stylesheet and custom properties, so a row reads here as it does in the card.
 *
 * A row that is a button in the card is one here. Pressing it closes the panel and, once the
 * panel has gone and focus is back on "+N more", runs what a tap on the event runs on the card:
 * `event_tap_action`, the details popover among them, or `event_hold_action` where only that is
 * set, as the card's keyboard does. A link in a row stays a link. The only words of its own are
 * Home Assistant's "Close".
 */

import { mdiClose } from '@mdi/js';
import { TemplateResult, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import * as Shell from './popover-shell';
import { cardStyles } from './styles';
import type * as Feedback from '../interaction/feedback';
import type * as Model from '../interaction/popover-model';

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

/** What the day panel reads from the card, live, while it is open. */
export interface DayPanelSource {
  /** The day's rows, as the card draws them (`renderMonthDayRows`). */
  rows(): TemplateResult | typeof nothing;
  /** The card's custom properties, which the rows' stylesheet reads. */
  styles(): Readonly<Record<string, string>>;
  /**
   * Called as the panel opens, so the card can tell it about changes and close it.
   *
   * @param panel - The open panel
   * @returns What the panel calls once it has closed
   */
  attach(panel: DayPanelHandle): () => void;
  /**
   * Runs what a tap on a row's event runs on the card. Called once the panel has gone.
   *
   * @param target - The event, and the accent it is drawn in
   * @param origin - Where its row was, for the details popover to open beside
   */
  activate(target: Activation.EventTapTarget, origin: Feedback.PressOrigin): void;
}

/** What the card hands the day panel, through Home Assistant's `show-dialog`. */
export interface DayPanelParams {
  source: DayPanelSource;
  /** The day, named in full. */
  title: string;
  /** The "+N more" it opens beside. */
  anchor?: Model.PopoverAnchor;
  /** Whether it is drawn dark, as Home Assistant's dark mode chooses. */
  dark: boolean;
  /** The card's language, which its rows are written in. */
  language: string;
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
  /** The row pressed, whose action runs once the panel has gone. */
  private _picked?: { target: Activation.EventTapTarget; origin: Feedback.PressOrigin };

  protected readonly _logName = 'Day panel';

  protected readonly _panelWidth = PANEL_WIDTH;

  protected get _anchor(): Model.PopoverAnchor | undefined {
    return this._params?.anchor;
  }

  /** Drops what the panel showed, and runs the action of the row pressed, after it has gone. */
  protected _clear(): void {
    const detach = this._detach;
    const source = this._params?.source;
    const picked = this._picked;
    this._detach = undefined;
    this._params = undefined;
    this._picked = undefined;
    detach?.();
    // After the dialog manager has heard the panel close, so the popover a details action opens
    // is the dialog it opens next, and focus goes back to "+N more" when that one closes.
    if (source && picked) setTimeout(() => source.activate(picked.target, picked.origin));
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
      this._closeNow();
    }
    this._detach?.();
    this._params = params;
    this._onClosed = params.closed;
    this._picked = undefined;
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
   * Picks a row: the panel closes, and its event's action runs once the panel has gone.
   *
   * @param hit - The row's button and its event
   */
  private _pick(hit: Activation.EventTapHit): void {
    if (this._closing || !this._params) return;
    const element = hit.element as Element;
    const rect = element.getBoundingClientRect();
    this._picked = {
      target: hit.target,
      origin: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      },
    };
    this._close();
  }

  private readonly _onRowClick = (ev: MouseEvent): void => {
    const hit = this._rowAt(ev);
    if (!hit) return;
    ev.preventDefault();
    this._pick(hit);
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

    return html`
      <dialog
        class="${params.dark ? 'dark' : 'light'} ${this._sheet ? 'sheet' : 'popover'}${this._lift > 0 ? ' lifted' : ''}"
        ?data-placed=${this._sheet || !!place}
        style=${Shell.placedStyle(this._sheet, place, this._lift)}
        aria-labelledby="day-panel-title"
        @cancel=${this._onCancel}
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
        @keydown=${this._keepKeys}
      >
        <div class="panel day-panel" style=${panelStyle} ?inert=${this._closing}>
          ${Shell.renderGrabber(this._sheet)}
          <div class="day-panel-head">
            <h2 class="day-panel-title" id="day-panel-title">${params.title}</h2>
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
            lang=${params.language}
            style=${styleMap(params.source.styles())}
            @click=${this._onRowClick}
            @keydown=${this._onRowKey}
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
