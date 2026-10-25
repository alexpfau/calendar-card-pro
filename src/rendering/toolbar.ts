/**
 * The header toolbar: the card's own controls, between the title and the events.
 *
 * The toolbar exists only while it holds a control, so a card with none renders exactly as
 * it did before there was a toolbar. Controls come in groups, each in a fixed place: a
 * leading group for the dates (previous, home and next on one track, then the range on
 * screen, which opens a date picker), and a trailing group for the view switcher and the
 * commands (refresh, still to come, then add, always last). A calendar legend, when it
 * comes, gets a lane of its own below.
 *
 * Every control shares one look: a neutral pill on a gray track, the selected view raised
 * out of it. The theme's primary color is kept for the keyboard focus ring, so the bar never
 * competes with the events for attention.
 */

import { mdiCalendarToday, mdiChevronLeft, mdiChevronRight, mdiMenuDown, mdiPlus } from '@mdi/js';
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

/** What the card hands the wrapper when it should draw the date navigation. */
export interface DateNavigation {
  /** The dates on screen, in the card's language. */
  range: string;
  /**
   * The widest name a page of this length can have in this language. The range reserves
   * room for it, so paging changes the words and never moves a control.
   */
  widestRange: string;
  /** The home button's name: "Today", or the day the card's own window starts on. */
  homeName: string;
  /**
   * Home Assistant's names for the arrows, shown as their tooltips, or undefined when it has
   * none; the arrows are then named in English for assistive technology alone.
   */
  previousName: string | undefined;
  nextName: string | undefined;
  /** True while the card is being edited: everything is drawn, and nothing opens or moves. */
  inert: boolean;
  /** The first day on screen, as `YYYY-MM-DD`, which the date picker opens on. */
  pickerValue: string;
  onPrevious: () => void;
  onHome: () => void;
  onNext: () => void;
  /** A day picked in the date picker, as `YYYY-MM-DD`. */
  onPick: (date: string) => void;
}

/** The controls the card wants in its header toolbar. No control draws no toolbar. */
export interface HeaderToolbar {
  /**
   * Whether the card is wide enough for its controls to carry a text label beside their
   * icon. Icon-only otherwise, with the label as the control's accessible name.
   */
  labeled?: boolean;
  /** The date navigation, which leads the bar and gives it a row of its own. */
  navigation?: DateNavigation;
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

/** The arrows' accessible names when Home Assistant has none, under the same rule. */
const UNLOCALIZED_PREVIOUS_NAME = 'Previous';
const UNLOCALIZED_NEXT_NAME = 'Next';

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
 * Render the date navigation: previous, home and next on one track, then the range on
 * screen, which opens the browser's own date picker.
 *
 * The three buttons share a track, styled like the view switcher's but with nothing raised,
 * because they are one control: a step back, a way home and a step forward. Home is always
 * an icon, named by its tooltip, so the track is the same width in every language and at
 * every card width. The arrows are drawn for left-to-right reading and mirrored in a
 * right-to-left one, where "previous" points right.
 *
 * The range is a button over a hidden native date input. Pressing it asks the input to show
 * its picker; a browser that cannot gets the input focused and clicked instead. The input
 * stays out of the tab order and away from assistive technology: the button is the control,
 * and the input only lends it the browser's picker. Inside the button, the label and the
 * caret after it share one grid cell with an invisible copy of the widest label this page
 * length can have, so the button is as wide as that one, whatever it says now, and a press
 * never moves the controls after it. The label is a polite live region, so the new dates are
 * read out after a press.
 *
 * @param nav - Navigation description from the card
 * @returns The leading group
 */
function renderDateNavigation(nav: DateNavigation): TemplateResult {
  const press = (handler: () => void) => (ev: Event) => {
    ev.stopPropagation();
    handler();
  };
  const openPicker = (ev: Event) => {
    ev.stopPropagation();
    if (nav.inert) return;
    const anchor = (ev.currentTarget as HTMLElement).parentElement;
    const input = anchor?.querySelector<HTMLInputElement>('input.toolbar-date-input');
    if (!input) return;
    input.value = nav.pickerValue;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };
  const onChange = (ev: Event) => {
    const value = (ev.target as HTMLInputElement).value;
    if (value) nav.onPick(value);
  };
  const segment = (
    name: string | undefined,
    fallback: string,
    path: string,
    handler: () => void,
    direction: boolean,
  ) =>
    html`<button
      type="button"
      class="date-navigation-segment"
      aria-label=${name ?? fallback}
      title=${name ?? nothing}
      @pointerdown=${stopCardGesture}
      @click=${press(handler)}
    >
      <svg
        class=${direction ? 'toolbar-button-icon date-navigation-direction' : 'toolbar-button-icon'}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d=${path}></path>
      </svg>
    </button>`;

  // The group is named by the dates it moves through, so a screen reader entering it hears
  // where it is before which way it can go.
  return html`<div class="toolbar-leading" role="group" aria-labelledby="toolbar-range-text">
    <div class="date-navigation">
      ${segment(nav.previousName, UNLOCALIZED_PREVIOUS_NAME, mdiChevronLeft, nav.onPrevious, true)}
      ${segment(nav.homeName, nav.homeName, mdiCalendarToday, nav.onHome, false)}
      ${segment(nav.nextName, UNLOCALIZED_NEXT_NAME, mdiChevronRight, nav.onNext, true)}
    </div>
    <div class="toolbar-range-anchor">
      <button
        type="button"
        class="toolbar-range"
        @pointerdown=${stopCardGesture}
        @click=${openPicker}
      >
        <span id="toolbar-range-text" class="toolbar-range-text" aria-live="polite"
          ><bdi>${nav.range}</bdi
          ><svg class="toolbar-range-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d=${mdiMenuDown}></path></svg
        ></span>
        <span class="toolbar-range-reserve" aria-hidden="true">${nav.widestRange}</span>
      </button>
      <input
        type="date"
        class="toolbar-date-input"
        tabindex="-1"
        aria-hidden="true"
        .value=${nav.pickerValue}
        @change=${onChange}
      />
    </div>
  </div>`;
}

/**
 * Render the trailing group: the view switcher, then add, always last.
 *
 * @param toolbar - The controls the card wants
 * @param labeled - Whether the controls carry their labels
 * @returns The group, or nothing when it holds no control
 */
function renderTrailing(toolbar: HeaderToolbar, labeled: boolean): TemplateResult | typeof nothing {
  if (!toolbar.addEvent && !toolbar.viewSwitcher) return nothing;

  return html`<div class="toolbar-trailing">
    ${toolbar.viewSwitcher ? renderViewSwitcher(toolbar.viewSwitcher, labeled) : nothing}
    ${toolbar.addEvent ? renderAddEventButton(toolbar.addEvent, labeled) : nothing}
  </div>`;
}

/**
 * Render the header toolbar, or nothing when it would hold no control.
 *
 * Where it sits is the layout rule. With only trailing actions and a title — a pending
 * templated title included — the actions share the title's row, at its inline end, so
 * the title keeps its markup and the card gains no height. With only trailing actions
 * and no title they get a slim row of their own. With the date navigation the toolbar is
 * a band of its own between the title and the events, the dates at its start and the
 * trailing group at its end; where the card is too narrow for both on one row, the
 * trailing group wraps onto a second one. Which row each group is on depends on the card's
 * width and the controls it holds, never on the dates it shows.
 *
 * @param toolbar - The controls the card wants
 * @param hasTitle - Whether the header draws a title, pending or not
 * @returns The toolbar, or undefined when it would be empty
 */
export function renderHeaderToolbar(
  toolbar: HeaderToolbar,
  hasTitle: boolean,
): TemplateResult | undefined {
  if (!toolbar.addEvent && !toolbar.viewSwitcher && !toolbar.navigation) return undefined;

  const labeled = toolbar.labeled === true;

  if (toolbar.navigation) {
    return html`<div
      class="card-toolbar toolbar-band"
      @pointerdown=${stopCardGesture}
      @click=${stopCardGesture}
    >
      ${renderDateNavigation(toolbar.navigation)} ${renderTrailing(toolbar, labeled)}
    </div>`;
  }

  // The press guard sits on the toolbar's own box as well as on each control, because the
  // switcher's gray track and the gaps between controls are part of the bar but no button:
  // a near miss there must do nothing, not run the card's tap or hold action.
  return html`<div
    class=${hasTitle ? 'card-toolbar toolbar-in-title-row' : 'card-toolbar toolbar-own-row'}
    @pointerdown=${stopCardGesture}
    @click=${stopCardGesture}
  >
    <div class="toolbar-trailing">
      ${toolbar.viewSwitcher ? renderViewSwitcher(toolbar.viewSwitcher, labeled) : nothing}
      ${toolbar.addEvent ? renderAddEventButton(toolbar.addEvent, labeled) : nothing}
    </div>
  </div>`;
}
