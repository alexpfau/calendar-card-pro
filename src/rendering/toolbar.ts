/**
 * The header toolbar: the card's own controls, between the title and the events.
 *
 * The toolbar exists only while it holds a control, so a card with none renders exactly as
 * it did before there was a toolbar. Its markup is built for the controls still to come:
 * a leading group for navigation (previous, Today, next) and the visible range, and a
 * trailing group for actions (refresh, the view switcher, and add, always last). The view
 * switcher and add exist so far, so only the trailing group is ever drawn.
 *
 * Every control shares one look: a neutral pill on a gray track, the selected view raised
 * out of it. The theme's primary color is kept for the keyboard focus ring, so the bar never
 * competes with the events for attention.
 */

import { mdiPlus } from '@mdi/js';
import { TemplateResult, html, nothing, svg } from 'lit';

import { VIEW_PICTOGRAMS, VIEW_PICTOGRAM_VIEWBOX } from './view-pictograms';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** What the card hands the wrapper when it should draw an add-event button. */
export interface AddEventButton {
  /** Home Assistant's own words for the button, or undefined when it offers none. */
  label: string | undefined;
  onActivate: () => void;
}

/** One view the switcher offers. */
export interface ViewOption {
  view: Types.EffectiveView;
  /** The view's name in the card's language. */
  label: string;
  /** False when the card is too narrow to draw it; the segment is shown but inert. */
  available: boolean;
}

/** What the card hands the wrapper when it should draw the view switcher. */
export interface ViewSwitcher {
  /** Every view, in the switcher's order. */
  views: ReadonlyArray<ViewOption>;
  /** The view marked as current. */
  selected: Types.EffectiveView;
  onSelect: (view: Types.EffectiveView) => void;
}

/** The controls the card wants in its header toolbar. No control draws no toolbar. */
export interface HeaderToolbar {
  /**
   * Whether the card is wide enough for its controls to carry a text label beside their
   * icon. Icon-only otherwise, with the label as the control's accessible name.
   */
  labeled?: boolean;
  /** The view switcher, just before add. */
  viewSwitcher?: ViewSwitcher;
  /** The add-event button, always the last control in the trailing group. */
  addEvent?: AddEventButton;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The add button's accessible name when Home Assistant has no string for it.
 *
 * Only ever an `aria-label`: an English word drawn on a card set to another language would
 * be worse than an icon.
 */
const UNLOCALIZED_ADD_EVENT_NAME = 'Add event';

/** The card string naming each view in the switcher. */
export const VIEW_LABEL_KEYS = {
  list: 'viewList',
  column: 'viewColumns',
  grid: 'viewGrid',
} as const satisfies Record<Types.EffectiveView, keyof Types.Translations>;

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
 * Render a view's pictogram, in the current text color.
 *
 * @param view - The view to draw
 * @returns The icon
 */
function renderViewPictogram(view: Types.EffectiveView): TemplateResult {
  return html`<svg
    class="view-switcher-icon"
    viewBox=${VIEW_PICTOGRAM_VIEWBOX}
    aria-hidden="true"
    focusable="false"
  >
    <g fill="currentColor">
      ${VIEW_PICTOGRAMS[view].map(
        ([x, y, width, height, rx, opacity]) =>
          svg`<rect x=${x} y=${y} width=${width} height=${height} rx=${rx} opacity=${opacity ?? nothing}></rect>`,
      )}
    </g>
  </svg>`;
}

/**
 * Render the view switcher: one segment per view, the current one raised.
 *
 * Native buttons in a group, each a toggle with `aria-pressed`, so every segment is its own
 * tab stop and Enter and Space work without any key handling of ours. A view the card is
 * too narrow to draw stays in place, dimmed and `aria-disabled`, rather than disappearing:
 * the bar keeps its shape as a tablet turns, and a screen reader still learns the view
 * exists. Pressing it does nothing.
 *
 * Icon-only, each segment is named by its label, which also shows as its tooltip.
 *
 * @param switcher - Switcher description from the card
 * @param labeled - Whether the card is wide enough to draw the labels
 * @returns The switcher
 */
function renderViewSwitcher(switcher: ViewSwitcher, labeled: boolean): TemplateResult {
  return html`<div class="view-switcher" role="group">
    ${switcher.views.map((option) => {
      const pressed = option.view === switcher.selected;
      const className = [
        'view-switcher-segment',
        pressed ? 'selected' : '',
        option.available ? '' : 'unavailable',
        labeled ? '' : 'icon-only',
      ]
        .filter((cls) => cls !== '')
        .join(' ');
      const onClick = (ev: Event) => {
        ev.stopPropagation();
        if (option.available) switcher.onSelect(option.view);
      };

      return html`<button
        type="button"
        class=${className}
        data-view=${option.view}
        aria-pressed=${pressed ? 'true' : 'false'}
        aria-disabled=${option.available ? nothing : 'true'}
        aria-label=${labeled ? nothing : option.label}
        title=${labeled ? nothing : option.label}
        @pointerdown=${stopCardGesture}
        @click=${onClick}
      >
        ${renderViewPictogram(option.view)}
        ${labeled ? html`<span class="toolbar-button-label">${option.label}</span>` : nothing}
      </button>`;
    })}
  </div>`;
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
  if (!toolbar.addEvent && !toolbar.viewSwitcher) return undefined;

  const labeled = toolbar.labeled === true;

  return html`<div
    class=${hasTitle ? 'card-toolbar toolbar-in-title-row' : 'card-toolbar toolbar-own-row'}
  >
    <div class="toolbar-trailing">
      ${toolbar.viewSwitcher ? renderViewSwitcher(toolbar.viewSwitcher, labeled) : nothing}
      ${toolbar.addEvent ? renderAddEventButton(toolbar.addEvent, labeled) : nothing}
    </div>
  </div>`;
}
