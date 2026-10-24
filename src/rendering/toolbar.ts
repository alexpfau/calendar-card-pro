/**
 * The header toolbar: the card's own controls, between the title and the events.
 *
 * The toolbar exists only while it holds a control, so a card with none renders exactly as
 * it did before there was a toolbar. Its markup is built for the controls still to come:
 * a leading group for navigation (previous, Today, next) and the visible range, and a
 * trailing group for actions (refresh, the view switch, and add, always last). Only add
 * exists so far, so only the trailing group is ever drawn.
 */

import { mdiPlus } from '@mdi/js';
import { TemplateResult, html, nothing } from 'lit';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What the card hands the wrapper when it should draw an add-event button. */
export interface AddEventButton {
  /** Home Assistant's own words for the button, or undefined when it offers none. */
  label: string | undefined;
  onActivate: () => void;
}

/** The controls the card wants in its header toolbar. No control draws no toolbar. */
export interface HeaderToolbar {
  /**
   * Whether the card is wide enough for its controls to carry a text label beside their
   * icon. Icon-only otherwise, with the label as the control's accessible name.
   */
  labeled?: boolean;
  /** The add-event button, always the last control in the trailing group. */
  addEvent?: AddEventButton;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The add button's accessible name when Home Assistant has no string for it.
 *
 * Only ever an `aria-label`: the card has no strings of its own for its controls, and an
 * English word drawn on a card set to another language would be worse than an icon.
 */
const UNLOCALIZED_ADD_EVENT_NAME = 'Add event';

//-----------------------------------------------------------------------------
// RENDERING
//-----------------------------------------------------------------------------

/**
 * Keep a press on a toolbar control from also becoming a press on the card.
 *
 * `pointerdown` is what arms the card's tap and hold gesture, and the card captures the
 * pointer there, so stopping it is what keeps the card's `tap_action` and `hold_action`
 * out of a press on the control. `click` is stopped so nothing above the card mistakes
 * the press for a tap on the card. `keydown` is deliberately left alone: the card already
 * ignores keys aimed at anything but itself, and stopping every key would hide them from
 * Home Assistant's own keyboard shortcuts.
 *
 * @param ev - The event to keep inside the control
 */
function stopCardGesture(ev: Event): void {
  ev.stopPropagation();
}

/**
 * Render the add-event button.
 *
 * A native button rather than `ha-button`, styled from Home Assistant's theme variables:
 * the card names as few of Home Assistant's elements as it can, because their names and
 * attributes change without notice.
 *
 * Labeled, it is named by its text. Icon-only, Home Assistant's label names it and shows
 * as its tooltip; the English fallback names it and nothing else.
 *
 * @param button - Button description from the card
 * @param roomForLabel - Whether the card is wide enough to draw the label
 * @returns The button
 */
function renderAddEventButton(button: AddEventButton, roomForLabel: boolean): TemplateResult {
  const labeled = roomForLabel && button.label !== undefined;
  const className = labeled
    ? 'toolbar-button add-event-button'
    : 'toolbar-button add-event-button icon-only';
  const onClick = (ev: Event) => {
    ev.stopPropagation();
    button.onActivate();
  };

  // Whitespace between the icon and the label is not drawn: the button is a flex
  // container, and its gap is the only space between them.
  return html`<button
    type="button"
    class=${className}
    aria-label=${labeled ? nothing : (button.label ?? UNLOCALIZED_ADD_EVENT_NAME)}
    title=${labeled || button.label === undefined ? nothing : button.label}
    @pointerdown=${stopCardGesture}
    @click=${onClick}
  >
    <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d=${mdiPlus}></path>
    </svg>
    ${labeled ? html`<span class="toolbar-button-label">${button.label}</span>` : nothing}
  </button>`;
}

/**
 * Render the header toolbar, or nothing when it would hold no control.
 *
 * Where it sits is the layout rule. With only trailing actions and a title — a pending
 * templated title included — the actions share the title's row, at its inline end, so
 * the title keeps its markup and the card gains no height. With only trailing actions
 * and no title they get a slim row of their own. A leading group, once there is one,
 * always takes a row of its own between the title and the events.
 *
 * @param toolbar - The controls the card wants
 * @param hasTitle - Whether the header draws a title, pending or not
 * @returns The toolbar, or undefined when it would be empty
 */
export function renderHeaderToolbar(
  toolbar: HeaderToolbar,
  hasTitle: boolean,
): TemplateResult | undefined {
  if (!toolbar.addEvent) return undefined;

  return html`<div
    class=${hasTitle ? 'card-toolbar toolbar-in-title-row' : 'card-toolbar toolbar-own-row'}
  >
    <div class="toolbar-trailing">
      ${renderAddEventButton(toolbar.addEvent, toolbar.labeled === true)}
    </div>
  </div>`;
}
