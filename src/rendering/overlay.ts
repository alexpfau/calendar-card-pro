/**
 * The overlay: the card opened full size over the dashboard, by the `overlay` action.
 *
 * Opened through Home Assistant's dialog manager (`show-dialog` with this element's tag), which
 * hands it `hass`, gives it Back to close, and stacks it with whatever opens above it: a popover,
 * the Day Panel or the search panel opened inside it close before it does. Drawn as a native modal
 * `<dialog>` in the top layer, the whole screen below `SHEET_BELOW_PX` wide or below 500 px tall,
 * and otherwise 92% of it, no wider than `MAX_WIDTH`. It opens and closes as a popover does,
 * growing out of the press that opened it and fading in, and shrinking back toward it as it fades
 * out. The popover shell gives it the contract, the guard on the page behind, Escape, the press
 * on the backdrop and focus coming back; it places nothing.
 *
 * What it holds is a second card, built from the card's own configuration
 * (`config/overlay.ts`). It shares the page's events and live subscriptions with every card on
 * it, so a window the dashboard already loaded draws at once. The card that opened it hands over
 * the date in view and the calendars its legend hides, and takes nothing back: the overlay's card
 * stores no choice on the device (`OverlayFrame`). Its toolbar carries the Close button
 * (`Toolbar.CloseButton`), and `back` inside it closes the overlay.
 */

import { PropertyValues, TemplateResult, css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import * as Shell from './popover-shell';
import { CLOSE_BUTTON_CLASS } from './toolbar';
import type * as Types from '../config/types';
import type * as Model from '../interaction/popover-model';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * What the overlay's card is told about the overlay it is in. Its presence is what makes a card
 * the overlay's: it fills the overlay, draws Close, closes it for `back`, and stores no choice.
 */
export interface OverlayFrame {
  /** Closes the overlay. */
  close(): void;
  /** The calendars the card that opened it hides with its legend, which it starts with hidden. */
  readonly hidden: ReadonlyArray<string>;
}

/** The card the overlay holds, as the overlay reaches it. */
export interface OverlayCard extends HTMLElement {
  hass?: Types.Hass;
  overlayFrame?: OverlayFrame;
  setConfig(config: Partial<Types.Config>): void;
  /** Opens the card on a day, as a layout switch carries one; null for its own home. */
  openOn(day: Date | null): void;
  readonly updateComplete: Promise<boolean>;
}

/** What the card hands the overlay, through Home Assistant's `show-dialog`. */
export interface OverlayParams {
  /** The card's element name, which the overlay builds its card as. */
  cardTag: string;
  /** The overlay card's configuration, as written (`overlayConfig`). */
  config: Record<string, unknown>;
  /** The date in view on the card, which the overlay's card opens on; null for its home. */
  day: Date | null;
  /** The calendars the card's legend hides. */
  hidden: ReadonlyArray<string>;
  /** The overlay's accessible name: the card's title, or its first calendar's name. */
  label: string;
  /**
   * Where it grows out of and shrinks back to, in viewport pixels: the press that opened it, or
   * the middle of what a key pressed. Its middle where there is none.
   */
  from?: { readonly x: number; readonly y: number };
  /**
   * Whether a pointer opened it. Focus then starts on the overlay itself, which shows no ring;
   * a key starts it on Close, ringed, so the keyboard sees where it is.
   */
  pointer?: boolean;
  /** Called once the overlay has closed, however it closed. Returns nothing. */
  closed?: () => undefined;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** The overlay's element name; the production build drops `-dev`, as it does for the card. */
export const OVERLAY_TAG = 'calendar-card-pro-dev-overlay';

/** The widest the overlay grows on a large screen, in CSS pixels. */
export const MAX_WIDTH = 1600;

/*
 * How it opens, as a popover does (`pop-grow` and `pop-fade` in the popover shell's stylesheet):
 * growing from a tenth of its size, fast and then settling, over 230 ms, and fading in over
 * 180 ms. It leaves as a popover does too (`Shell.LEAVE_MS`).
 */
export const GROW_FROM = 0.1;
export const GROW_MS = 230;
export const GROW_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
export const FADE_IN_MS = 180;
export const FADE_IN_EASING = 'cubic-bezier(0, 0, 0.58, 1)';

//-----------------------------------------------------------------------------
// ELEMENT
//-----------------------------------------------------------------------------

/**
 * The overlay. Home Assistant's dialog manager creates it, hands it `hass`, calls `showDialog`
 * before attaching it, and calls `closeDialog` for Back.
 */
export class CardOverlay extends Shell.PopoverShell {
  @state() private _params?: OverlayParams;
  /** The card it holds while open. */
  @state() private _card?: OverlayCard;
  /** Whether it is still to play its way in, which it does once it is open (`_position`). */
  private _entering = false;

  protected readonly _logName = 'Overlay';

  protected readonly _panelWidth = MAX_WIDTH;

  protected readonly _pagingKeysFirst = false;

  protected get _anchor(): Model.PopoverAnchor | undefined {
    return undefined;
  }

  /** Lets go of the card, which leaves the page with it, its subscriptions released. */
  protected _clear(): void {
    this._params = undefined;
    this._card = undefined;
  }

  //---------------------------------------------------------------------------
  // HOME ASSISTANT'S DIALOG CONTRACT
  //---------------------------------------------------------------------------

  /**
   * Opens the overlay on a new card, built and configured before it is attached, so its first
   * load is the page it opens on. Called before the element is attached, so the modal opens once
   * it is (`updated`).
   *
   * @param params - What the card handed over
   */
  public showDialog(params: OverlayParams): void {
    // Opened again while still playing its way out: gone at once, so it opens afresh.
    if (this._closing) this._closeNow();
    const card = document.createElement(params.cardTag) as OverlayCard;
    card.overlayFrame = { close: () => this._close(), hidden: params.hidden };
    card.hass = this.hass;
    card.setConfig(params.config as Partial<Types.Config>);
    card.openOn(params.day);
    this._params = params;
    this._card = card;
    this._onClosed = params.closed;
    this._entering = true;
    this._wantOpen = true;
    this.requestUpdate();
  }

  /**
   * Closes the overlay for Home Assistant's Back, or as it navigates.
   *
   * @returns Always true: there is nothing to keep it open for
   */
  public closeDialog(): boolean {
    this._close();
    return true;
  }

  /** Closes the overlay, once, playing its way out. */
  private _close(): void {
    if (this._closing || !this._params) return;
    this._finish();
  }

  //---------------------------------------------------------------------------
  // THE SHELL'S HOOKS
  //---------------------------------------------------------------------------

  /** The frame holding the card, drawn while it is open. */
  private get _frame(): HTMLElement | null {
    return this._dialog?.querySelector<HTMLElement>('.frame') ?? null;
  }

  /**
   * Sized by its stylesheet, never placed: called once it is open, before it is first drawn, to
   * play its way in. It grows out of where it was opened from (`OverlayParams.from`), or its
   * middle, which is where it shrinks back to as it leaves (`_leave`). Nothing plays where the
   * system asks for less motion, or where the browser cannot animate.
   */
  protected _position(): void {
    if (!this._entering) return;
    this._entering = false;
    const frame = this._frame;
    if (!frame) return;
    const from = this._params?.from;
    const box = frame.getBoundingClientRect();
    frame.style.transformOrigin = from ? `${from.x - box.left}px ${from.y - box.top}px` : 'center';
    if (typeof frame.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    frame.animate([{ transform: `scale(${GROW_FROM})` }, { transform: 'scale(1)' }], {
      duration: GROW_MS,
      easing: GROW_EASING,
    });
    frame.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_IN_MS,
      easing: FADE_IN_EASING,
    });
  }

  /**
   * Puts focus where it starts: on the overlay itself after a pointer's press, which a browser
   * would otherwise ring on Close as though a key had moved it there; on Close after a key, once
   * the card has drawn it, and on the frame where it has not, so focus is in the overlay either
   * way.
   */
  protected _focusStart(): void {
    const card = this._card;
    if (!card || !this._dialog?.open) return;
    if (this._params?.pointer) {
      this._frame?.focus({ preventScroll: true });
      return;
    }
    void card.updateComplete.then(() => {
      if (this._card !== card || !this._dialog?.open) return;
      const close = card.shadowRoot?.querySelector<HTMLElement>(`.${CLOSE_BUTTON_CLASS}`);
      (close ?? this._frame)?.focus({ preventScroll: true });
    });
  }

  /**
   * Shrinks back toward where it grew out of and fades out, as a popover leaves, and its backdrop
   * fades with it where the browser animates one. Closed while still opening, it leaves from
   * where it had got to: played after the way in, the way out overrides it until it ends. Nothing
   * where the system asks for less motion.
   *
   * @returns The animations, or none
   */
  protected _leave(): Animation[] {
    const dialog = this._dialog;
    const frame = this._frame;
    if (!dialog?.open || !frame || typeof frame.animate !== 'function') return [];
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];

    const now = getComputedStyle(frame);
    const scale = now.transform && now.transform !== 'none' ? now.transform : 'scale(1)';
    const opacity = now.opacity || '1';
    const timing = (easing: string): KeyframeAnimationOptions => ({
      duration: Shell.LEAVE_MS,
      easing,
      fill: 'forwards',
    });
    const animations = [
      frame.animate(
        [{ transform: scale }, { transform: `scale(${Shell.LEAVE_SCALE})` }],
        timing(Shell.LEAVE_SHRINK),
      ),
      frame.animate([{ opacity }, { opacity: 0 }], timing('ease')),
    ];
    try {
      animations.push(
        dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
          ...timing('ease'),
          pseudoElement: '::backdrop',
        }),
      );
    } catch {
      // A browser that cannot animate a backdrop drops it as the overlay closes.
    }
    return animations;
  }

  //---------------------------------------------------------------------------
  // HASS
  //---------------------------------------------------------------------------

  /**
   * Hands every `hass` to the card, which decides for itself whether to draw again
   * (`hass-relevance.ts`); the overlay draws nothing for it.
   *
   * @param changed - What changed
   * @returns Whether the overlay draws
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('hass') && this._card) this._card.hass = this.hass;
    return !(changed.size === 1 && changed.has('hass'));
  }

  //---------------------------------------------------------------------------
  // RENDERING
  //---------------------------------------------------------------------------

  protected render(): TemplateResult {
    const params = this._params;
    if (!params) return html`<dialog></dialog>`;

    return html`
      <dialog
        class="overlay"
        aria-label=${params.label || nothing}
        @cancel=${this._onCancel}
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
        @keydown=${this._onKeyDown}
      >
        <div class="frame" tabindex="-1" ?inert=${this._closing}>${this._card ?? nothing}</div>
      </dialog>
    `;
  }

  //---------------------------------------------------------------------------
  // INPUT
  //---------------------------------------------------------------------------

  /** Escape closes it, once nothing inside it took the key. */
  private readonly _onCancel = (ev: Event): void => {
    ev.preventDefault();
    this._close();
  };

  /** Where a press begins: on the backdrop, it may close the overlay (`_onClick`). */
  private readonly _onPointerDown = (ev: PointerEvent): void => {
    this._backdropDown = ev.target === this._dialog;
  };

  /** A press that starts and ends on the backdrop closes it. */
  private readonly _onClick = (ev: MouseEvent): void => {
    if (this._isBackdropPress(ev)) this._close();
  };

  /**
   * Keeps the letters typed in the card from Home Assistant's shortcuts (`_keepKeys`), after the
   * card has had them. Space goes on, to the guard on the page behind, which hears it last.
   */
  private readonly _onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== ' ') this._keepKeys(ev);
  };

  /*
   * The whole screen on a phone, upright or turned, where 92% of it would leave a frame of nothing
   * worth seeing; the card's corners and border go there, and its padding takes the device's safe
   * areas. Otherwise 92% of the screen, centered, as wide as MAX_WIDTH at most.
   */
  static styles = css`
    dialog {
      box-sizing: border-box;
      width: min(92vw, ${MAX_WIDTH}px);
      height: 92vh;
      height: 92dvh;
      max-width: none;
      max-height: none;
      margin: auto;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      overflow: visible;
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.32);
    }
    .frame {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--ha-card-background, var(--card-background-color, #fff));
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
      outline: none;
    }
    @media (max-width: 599.98px), (max-height: 499.98px) {
      dialog {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
      }
      .frame {
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
          env(safe-area-inset-left);
        border-radius: 0;
        box-shadow: none;
        --ha-card-border-radius: 0;
        --ha-card-border-width: 0;
      }
    }
    /* The frame grows in from script (_position), from the press that opened it; the backdrop
       fades in with it here. */
    dialog[open]::backdrop {
      animation: backdrop-in ${FADE_IN_MS}ms ease;
    }
    @keyframes backdrop-in {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open]::backdrop {
        animation: none;
      }
    }
  `;
}

if (!customElements.get(OVERLAY_TAG)) {
  customElements.define(OVERLAY_TAG, CardOverlay);
}
