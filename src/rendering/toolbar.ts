/**
 * The header toolbar: the card's own controls, between the title and the events.
 *
 * The toolbar exists only while it holds a control, so a card with none renders exactly as
 * it did before there was a toolbar. With one it is two rows. The action row holds what acts
 * on the card, each in a fixed place: the calendar filter and add at its start, the view
 * switcher in its middle, reset and refresh at its end. The heading row comes last, right
 * above the days: the month the page on screen starts in, under the card's title, which
 * shrinks to a small label over it, the date navigation (previous, home and next) at the row's
 * end, and, where they fit, a chip per calendar in its middle, under the switcher.
 * The month opens a date picker. Where the chips do not all fit, the filter folds into a button
 * at the start of the action row instead (`legend.ts`).
 *
 * Every control shares one look: a neutral gray pill, the selected view raised out of its track,
 * so the bar never competes with the events for attention. Color shows only on the control in
 * use: the card's hover color, its accent, laid over the gray under the pointer and while
 * pressed, and the theme's primary color as the keyboard focus ring.
 *
 * Each control is either an icon or words, never both, and which is fixed per control rather
 * than configured. The commands (the filter, add, reset, refresh and the arrows) are icons, named
 * by Home Assistant's own words in their tooltips and for assistive technology. The views are
 * words, which say what a pictogram cannot, until the card is too narrow for them; then they too
 * are pictograms. The month and the chips are words.
 */

import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiChevronLeft,
  mdiChevronRight,
  mdiHomeOutline,
  mdiMenuDown,
  mdiPlus,
  mdiRefresh,
  mdiUndoVariant,
} from '@mdi/js';
import { TemplateResult, html, nothing, svg } from 'lit';

import { CalendarLegend, renderLegendButton, renderLegendChips } from './legend';
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

/**
 * Where a refresh stands. `turning` while the card loads, and after a refresh someone asked
 * for for at least one turn, however quickly the load ends; then `done`, or `failed` when a
 * calendar could not be loaded, for a moment; `idle` otherwise.
 */
export type RefreshPhase = 'idle' | 'turning' | 'done' | 'failed';

/** What the card hands the wrapper when it should draw the refresh button. */
export interface RefreshButton {
  /** Home Assistant's own word for it, or undefined when it offers none. */
  label: string | undefined;
  /** Where the refresh stands; in any phase but `idle`, a press does nothing. */
  phase: RefreshPhase;
  onActivate: () => void;
}

/** What the card hands the wrapper when it should draw the reset button. */
export interface ResetButton {
  /** Home Assistant's own word for it, or undefined when it offers none. */
  label: string | undefined;
  /**
   * True while the card shows something its configuration does not: a press then undoes it.
   * False hides the button, keeping its room, and a press does nothing.
   */
  active: boolean;
  /**
   * Set for a moment after a press did its work: `showing` while the button shows a check instead
   * of hiding, so the press is seen to have worked, then `leaving` while it fades out still
   * showing it, so the U-turn never reappears on the way out.
   */
  confirmation?: 'showing' | 'leaving';
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

/** What the card hands the wrapper for the month heading, drawn whenever the toolbar is. */
export interface MonthHeading {
  /** The month and year the page on screen starts in, in the form drawn. */
  text: string;
  /**
   * Every month's heading in the form drawn. The heading keeps the room of the widest, so
   * paging changes the words and never moves a control.
   */
  reserve: ReadonlyArray<string>;
  /**
   * Every month in full, which the card measures to decide whether the full form fits
   * (`_syncMonthFit`), whichever form is drawn.
   */
  full: ReadonlyArray<string>;
  /** True while the short form is drawn, because the full one does not fit. */
  short: boolean;
  /**
   * The dates on screen, in the card's language: the heading's tooltip, and what assistive
   * technology announces when they change.
   */
  range: string;
}

/** What the card hands the wrapper when it should draw the date navigation. */
export interface DateNavigation {
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
   * Whether the card is wide enough for the view switcher to name its views in words. Its
   * pictograms otherwise, each named by its view's word for assistive technology and as its
   * tooltip. The commands are icons either way.
   */
  labeled?: boolean;
  /** The month heading, which the heading row carries whenever the toolbar is drawn. */
  heading?: MonthHeading;
  /** Previous, home and next beside the month, which then opens a date picker. */
  navigation?: DateNavigation;
  /**
   * The calendar filter: chips in the middle of the heading row, or, folded, a button leading the
   * action row.
   */
  legend?: CalendarLegend;
  /** The view switcher, in the middle of the action row. */
  viewSwitcher?: ViewSwitcher;
  /** The reset button, at the end of the action row, before refresh. */
  reset?: ResetButton;
  /** The refresh button, last in the action row. */
  refresh?: RefreshButton;
  /** The add-event button, at the start of the action row, after a folded filter. */
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

/** The refresh button's accessible name when Home Assistant has none, under the same rule. */
const UNLOCALIZED_REFRESH_NAME = 'Refresh';

/** The reset button's accessible name when Home Assistant has none, under the same rule. */
const UNLOCALIZED_RESET_NAME = 'Reset';

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

/** Date pickers the card opened and has not seen close yet, each with how to stop following. */
const openDatePickers = new WeakMap<HTMLInputElement, () => void>();

/** Date inputs whose open picker the press under way closed. */
const pickersClosedByPress = new WeakSet<HTMLInputElement>();

/**
 * Whether the input's picker is showing, or undefined where the browser cannot say.
 *
 * @param input - A date input
 * @returns The `:open` state, if the browser knows the selector
 */
function datePickerOpen(input: HTMLInputElement): boolean | undefined {
  try {
    return input.matches(':open');
  } catch {
    return undefined;
  }
}

/**
 * Whether the input holds focus in its own tree.
 *
 * @param input - A date input
 * @returns True while it is the focused element
 */
function hasFocus(input: HTMLInputElement): boolean {
  return (input.getRootNode() as Document | ShadowRoot).activeElement === input;
}

/**
 * Follows a picker the card just opened, focused, until it closes.
 *
 * Browsers close their pickers in two ways a press on the month has to fit. Chrome closes its
 * picker on any press outside it and then hands that press to the page, so the press that
 * closes it would open it again at once. Safari closes its picker when the input loses focus,
 * and otherwise only on a scroll, which is why the input is focused to open it. So a press on
 * the month that finds the picker followed here closes it, by taking focus from the input,
 * and opens nothing.
 *
 * The picker counts as closed when the input loses focus, a day is picked or Escape is
 * pressed, and, where the browser reports `:open`, once that turns false: Chrome keeps the
 * input focused when its picker closes, and nothing else tells the page, so that is checked
 * once a frame. If the input still has focus then, it goes back to the month button where
 * the button had it, so a keyboard is where it started, or else nowhere. While it is followed
 * the input is exposed to assistive technology, named by the dates, because it holds focus.
 *
 * @param input - The input whose picker was just shown
 * @param returnFocus - The month button, if it had focus when it was pressed
 */
function followDatePicker(input: HTMLInputElement, returnFocus: HTMLElement | null): void {
  openDatePickers.get(input)?.();
  const listeners: Array<[string, (ev: Event) => void]> = [];
  const stop = (): void => {
    openDatePickers.delete(input);
    for (const [type, listener] of listeners) input.removeEventListener(type, listener);
    input.setAttribute('aria-hidden', 'true');
  };
  const closed = (): void => {
    if (!openDatePickers.has(input)) return;
    stop();
    if (!hasFocus(input)) return;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else input.blur();
  };
  const listen = (type: string, listener: (ev: Event) => void): void => {
    input.addEventListener(type, listener);
    listeners.push([type, listener]);
  };
  listen('blur', stop);
  listen('change', closed);
  listen('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') closed();
  });
  openDatePickers.set(input, stop);
  input.removeAttribute('aria-hidden');

  if (datePickerOpen(input) !== true) return;
  const check = (): void => {
    if (!openDatePickers.has(input)) return;
    if (!input.isConnected || datePickerOpen(input) !== true) {
      closed();
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/**
 * Render the add-event button.
 *
 * A native button rather than `ha-button`, styled from Home Assistant's theme variables:
 * the card names as few of Home Assistant's elements as it can, because their names and
 * attributes change without notice.
 *
 * An icon, a plus. Home Assistant's own words name it and show as its tooltip; the English
 * fallback names it and nothing else.
 *
 * @param button - Button description from the card
 * @returns The button
 */
function renderAddEventButton(button: AddEventButton): TemplateResult {
  const onClick = (ev: Event) => {
    ev.stopPropagation();
    button.onActivate();
  };

  return html`<button
    type="button"
    class="toolbar-button add-event-button"
    aria-label=${button.label ?? UNLOCALIZED_ADD_EVENT_NAME}
    title=${button.label ?? nothing}
    @pointerdown=${stopCardGesture}
    @click=${onClick}
  >
    <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d=${mdiPlus}></path>
    </svg>
  </button>`;
}

/**
 * Render the reset button.
 *
 * Drawn whether or not there is anything to undo, so it keeps its room and never moves the
 * controls beside it. With nothing to undo it is `.unavailable`, which the stylesheet hides and
 * fades out, so it appears only once there is something to undo, and `aria-disabled`, and a
 * press does nothing. A press that did its work shows a check on a green wash for a moment, as
 * refresh does, and the button then hides by itself. A keyboard that pressed it keeps it, dimmed,
 * until focus moves on, so focus is never left on nothing. Alone in its row it is never hidden,
 * only dimmed (`.alone`): hidden, it would leave the row an empty strip over the month. Named as
 * the add button is. Its icon is a U-turn, not a circular arrow: two circular arrows side by side
 * read as one control turned round.
 *
 * @param button - Button description from the card
 * @param alone - Whether it is the only control in its row
 * @returns The button
 */
function renderResetButton(button: ResetButton, alone: boolean): TemplateResult {
  const confirmation = button.active ? undefined : button.confirmation;
  const className = [
    'toolbar-button',
    'reset-button',
    alone ? 'alone' : '',
    confirmation ? 'reset-done' : '',
    button.active || confirmation === 'showing' ? '' : 'unavailable',
  ]
    .filter((cls) => cls !== '')
    .join(' ');
  const onClick = (ev: Event) => {
    ev.stopPropagation();
    if (button.active) button.onActivate();
  };

  return html`<button
    type="button"
    class=${className}
    aria-disabled=${button.active ? nothing : 'true'}
    aria-label=${button.label ?? UNLOCALIZED_RESET_NAME}
    title=${button.label ?? nothing}
    @pointerdown=${stopCardGesture}
    @click=${onClick}
  >
    <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d=${confirmation ? mdiCheck : mdiUndoVariant}></path>
    </svg>
  </button>`;
}

/** The class each refresh phase gives the button, and the corner where there is no button. */
export const REFRESH_PHASE_CLASS: Readonly<Record<RefreshPhase, string>> = {
  idle: '',
  turning: 'busy',
  done: 'refresh-done',
  failed: 'refresh-failed',
};

/** The icon each refresh phase draws: the refresh arrow until it shows how the refresh ended. */
export const REFRESH_PHASE_ICON: Readonly<Record<RefreshPhase, string>> = {
  idle: mdiRefresh,
  turning: mdiRefresh,
  done: mdiCheck,
  failed: mdiAlertCircleOutline,
};

/**
 * Render the refresh button.
 *
 * Its icon turns while the card loads, whatever started the load, and the card's corner
 * spinner is left out meanwhile: it would sit right beside it saying the same thing. A
 * refresh someone asked for turns it for at least one turn, then shows a check, or an alert
 * where a calendar could not be loaded, before the button is itself again. A press in any
 * of that does nothing (the card decides that), so the button keeps its look rather than
 * flickering to disabled and back with every scheduled refresh. Named as the add button is.
 *
 * @param button - Button description from the card
 * @returns The button
 */
function renderRefreshButton(button: RefreshButton): TemplateResult {
  const className = ['toolbar-button', 'refresh-button', REFRESH_PHASE_CLASS[button.phase]]
    .filter((cls) => cls !== '')
    .join(' ');
  const onClick = (ev: Event) => {
    ev.stopPropagation();
    button.onActivate();
  };

  return html`<button
    type="button"
    class=${className}
    aria-label=${button.label ?? UNLOCALIZED_REFRESH_NAME}
    title=${button.label ?? nothing}
    @pointerdown=${stopCardGesture}
    @click=${onClick}
  >
    <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d=${REFRESH_PHASE_ICON[button.phase]}></path>
    </svg>
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
 * Each view is its word, which says what a pictogram cannot, wherever the card is wide enough for
 * all three; narrower, each is its pictogram, named by its word for assistive technology and as
 * its tooltip. Never both, so the switcher reads as words beside the icon commands around it.
 *
 * @param switcher - Switcher description from the card
 * @param labeled - Whether the card is wide enough for the words
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
        ${
          labeled
            ? html`<span class="toolbar-button-label">${option.label}</span>`
            : renderViewPictogram(option.view)
        }
      </button>`;
    })}
  </div>`;
}

/**
 * Render previous, home and next, side by side.
 *
 * Three small round buttons close together, each a pill of its own like the action row's, in
 * one group: a step back, a way home and a step forward. The group is named by the dates on
 * screen, so a screen reader entering it hears where it is before which way it can go. Home is
 * always an icon, a house, named by its tooltip: it leads to the days the card opens with, which
 * are not always today, so neither the word "Today" nor a calendar glyph, which beside the month
 * reads as the date picker's, would say where it goes. The group is the same width in every
 * language and at every card width. The arrows are drawn for left-to-right reading and
 * mirrored in a right-to-left one, where "previous" points right.
 *
 * @param nav - Navigation description from the card
 * @returns The group
 */
function renderDateNavigation(nav: DateNavigation): TemplateResult {
  const press = (handler: () => void) => (ev: Event) => {
    ev.stopPropagation();
    handler();
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

  return html`<div class="date-navigation" role="group" aria-labelledby="toolbar-range-text">
    ${segment(nav.previousName, UNLOCALIZED_PREVIOUS_NAME, mdiChevronLeft, nav.onPrevious, true)}
    ${segment(nav.homeName, nav.homeName, mdiHomeOutline, nav.onHome, false)}
    ${segment(nav.nextName, UNLOCALIZED_NEXT_NAME, mdiChevronRight, nav.onNext, true)}
  </div>`;
}

/**
 * Render each label in a set, laid over one another by the stylesheet, so the set is as wide
 * as the widest of them.
 *
 * @param labels - The labels
 * @returns One span per label
 */
function renderOverlaid(labels: ReadonlyArray<string>): TemplateResult[] {
  return labels.map((label) => html`<span>${label}</span>`);
}

/**
 * Render the month heading: the month the page on screen starts in, which opens the browser's
 * own date picker where the card has date navigation, and is plain text where it has none.
 *
 * As a control it is a button over a hidden native date input, with a caret after the month.
 * Pressing it focuses the input and asks it to show its picker; a browser that cannot gets the
 * input clicked instead. Pressed while the picker it opened is showing, it closes it
 * (`followDatePicker`). The input stays out of the tab order and, unless it holds focus for its
 * picker, away from assistive technology: the button is the control, and the input only lends
 * it the browser's picker.
 *
 * The month names the page by its first day, so the exact dates live beside it: in its
 * tooltip, and in a polite live region, visually hidden, that describes the button and names
 * the row, so a screen reader hears the dates on reaching it and again after every press.
 *
 * Behind the month, in the same grid cell, invisible copies of every month in the form drawn
 * keep the room of the widest, so paging changes the words and never moves the controls after
 * them. Out of the flow, the months in full are laid over one another once more, for the card
 * to measure whichever form is drawn (`_syncMonthFit`). An empty box at the start of the words,
 * one capital tall and standing on their baseline, is what the card reads to center the controls
 * beside the month on its capitals (`_syncHeadingMiddle`).
 *
 * @param heading - Heading description from the card
 * @param nav - The date navigation, when the card draws it
 * @returns The heading
 */
function renderMonth(heading: MonthHeading, nav: DateNavigation | undefined): TemplateResult {
  const reserve = html`<span class="toolbar-month-reserve" aria-hidden="true"
    >${renderOverlaid(heading.reserve)}</span
  >`;
  const measure = html`<span class="toolbar-month-measure" aria-hidden="true"
    ><span class="toolbar-month-probe">${renderOverlaid(heading.full)}</span></span
  >`;
  const live = html`<span id="toolbar-range-text" class="toolbar-range-text" aria-live="polite"
    >${heading.range}</span
  >`;

  if (!nav) {
    return html`<div class="toolbar-month">
      ${reserve}
      <span class="toolbar-month-slot">
        <span class="toolbar-month-label" title=${heading.range}
          ><bdi class="toolbar-month-text"
            ><span class="toolbar-month-cap"></span>${heading.text}</bdi
          ></span
        >
      </span>
      ${measure}${live}
    </div>`;
  }

  const inputBeside = (button: EventTarget | null): HTMLInputElement | null =>
    (button as HTMLElement | null)?.parentElement?.querySelector<HTMLInputElement>(
      'input.toolbar-date-input',
    ) ?? null;
  const pressMonth = (ev: Event) => {
    stopCardGesture(ev);
    const input = inputBeside(ev.currentTarget);
    if (!input) return;
    pickersClosedByPress.delete(input);
    const stop = openDatePickers.get(input);
    if (!stop) return;
    stop();
    pickersClosedByPress.add(input);
    input.blur();
  };
  const openPicker = (ev: MouseEvent) => {
    ev.stopPropagation();
    const button = ev.currentTarget as HTMLElement;
    const input = inputBeside(button);
    if (!input) return;
    // Only a pointer's click: a key press arrives without a pointerdown of its own.
    if (pickersClosedByPress.delete(input) && ev.detail > 0) return;
    if (nav.inert) return;
    const returnFocus =
      (button.getRootNode() as Document | ShadowRoot).activeElement === button ? button : null;
    input.value = nav.pickerValue;
    input.focus({ preventScroll: true });
    try {
      input.showPicker();
      followDatePicker(input, returnFocus);
    } catch {
      input.click();
    }
  };
  const onChange = (ev: Event) => {
    const value = (ev.target as HTMLInputElement).value;
    if (value) nav.onPick(value);
  };

  return html`<div class="toolbar-month with-picker">
    ${reserve}
    <span class="toolbar-month-slot">
      <button
        type="button"
        class="toolbar-month-button"
        title=${heading.range}
        aria-describedby="toolbar-range-text"
        @pointerdown=${pressMonth}
        @click=${openPicker}
      >
        <span class="toolbar-month-label"
          ><bdi class="toolbar-month-text"
            ><span class="toolbar-month-cap"></span>${heading.text}</bdi
          ><svg class="toolbar-month-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d=${mdiMenuDown}></path></svg
        ></span>
      </button>
      <input
        type="date"
        class="toolbar-date-input"
        tabindex="-1"
        aria-hidden="true"
        aria-labelledby="toolbar-range-text"
        .value=${nav.pickerValue}
        @change=${onChange}
      />
    </span>
    ${measure}${live}
  </div>`;
}

/**
 * The legend, when it is folded into a button in the action row.
 *
 * @param toolbar - The controls the card wants
 * @returns The legend, or undefined when it is drawn as chips or not at all
 */
function foldedLegend(toolbar: HeaderToolbar): CalendarLegend | undefined {
  return toolbar.legend?.folded ? toolbar.legend : undefined;
}

/**
 * Whether the toolbar draws the legend's chips, in the middle of the heading row.
 *
 * @param toolbar - The controls the card wants
 * @returns True when the legend is on and not folded
 */
export function drawsLegendChips(toolbar: HeaderToolbar): boolean {
  return toolbar.legend !== undefined && !toolbar.legend.folded;
}

/**
 * Whether the toolbar draws an action row.
 *
 * @param toolbar - The controls the card wants
 * @returns True when it holds at least one control
 */
export function drawsActionRow(toolbar: HeaderToolbar): boolean {
  return Boolean(
    foldedLegend(toolbar) ||
    toolbar.addEvent ||
    toolbar.viewSwitcher ||
    toolbar.reset ||
    toolbar.refresh,
  );
}

/**
 * Render the action row: a folded filter and add at its start, the view switcher in its
 * middle, reset and refresh at its end.
 *
 * The start and the end are groups of their own, there even when empty, so the stylesheet
 * can share the room left beside the switcher out equally between them and the switcher sits
 * in the middle of the card while there is room for that. Both groups space their icons alike,
 * so the end reads as the start does.
 *
 * The press guard sits on the row's own box as well as on each control, because the
 * switcher's gray track and the gaps between controls are part of the row but no button: a
 * near miss there must do nothing, not run the card's tap or hold action.
 *
 * @param toolbar - The controls the card wants
 * @param labeled - Whether the view switcher names its views in words
 * @returns The row, or nothing when it holds no control
 */
function renderActionRow(
  toolbar: HeaderToolbar,
  labeled: boolean,
): TemplateResult | typeof nothing {
  if (!drawsActionRow(toolbar)) return nothing;
  const legend = foldedLegend(toolbar);
  const resetAlone = !legend && !toolbar.addEvent && !toolbar.viewSwitcher && !toolbar.refresh;

  return html`<div
    class="card-toolbar toolbar-actions"
    @pointerdown=${stopCardGesture}
    @click=${stopCardGesture}
  >
    <div class="toolbar-start">
      ${legend ? renderLegendButton(legend) : nothing}
      ${toolbar.addEvent ? renderAddEventButton(toolbar.addEvent) : nothing}
    </div>
    ${toolbar.viewSwitcher ? renderViewSwitcher(toolbar.viewSwitcher, labeled) : nothing}
    <div class="toolbar-end">
      ${toolbar.reset ? renderResetButton(toolbar.reset, resetAlone) : nothing}
      ${toolbar.refresh ? renderRefreshButton(toolbar.refresh) : nothing}
    </div>
  </div>`;
}

/**
 * Keep a press inside the heading row from becoming a press on the card, unless it is on the
 * title, which is the card's own and runs the card's tap and hold actions as it always has.
 *
 * @param ev - The event to keep inside the row
 */
function stopHeadingGesture(ev: Event): void {
  const target = ev.target as Element | null;
  if (target?.closest?.('.card-header')) return;
  ev.stopPropagation();
}

/**
 * Render the heading row: the title over the month at its start, the chips where they fit, and
 * the date navigation at its end.
 *
 * The title and the month are one block, the title a small label over the month, so a long
 * title wraps within it and the controls beside it never move. Those controls are smaller than
 * the action row's and centered on the month's capitals, so they read as level with its words
 * rather than raised above them. The arrows keep to the row's end in every layout, so a press on
 * next lands on the same spot page after page however long each month's name is. The chips sit
 * between, in the middle of the card under the view switcher while there is room for that, by
 * the switcher's own rule: the title's block and the group holding the arrows share the room
 * beside them equally.
 *
 * The row is no group of its own, since it holds the card's heading; the arrows' group is,
 * named by the dates on screen. It keeps every press from the card, as the action row does,
 * except a press on the title (`stopHeadingGesture`).
 *
 * @param toolbar - The controls the card wants
 * @param title - The header's title block: the `h1`, or the empty placeholder without a title
 * @returns The row
 */
function renderHeadingRow(toolbar: HeaderToolbar, title: TemplateResult): TemplateResult {
  const chips = drawsLegendChips(toolbar) ? toolbar.legend : undefined;
  const heading = toolbar.heading;
  const className = [
    'card-toolbar',
    'toolbar-heading',
    chips ? 'chips-shown' : '',
    heading?.short ? 'short-month' : '',
  ]
    .filter((cls) => cls !== '')
    .join(' ');

  return html`<div
    class=${className}
    @pointerdown=${stopHeadingGesture}
    @click=${stopHeadingGesture}
  >
    <div class="toolbar-identity">
      ${title}${heading ? renderMonth(heading, toolbar.navigation) : nothing}
    </div>
    ${chips ? renderLegendChips(chips) : nothing}
    <div class="toolbar-heading-end">
      ${toolbar.navigation ? renderDateNavigation(toolbar.navigation) : nothing}
    </div>
  </div>`;
}

/**
 * Render the header toolbar, or nothing when it would hold no control.
 *
 * Where it sits is the layout rule. With no control the header is exactly as it was before
 * there was a toolbar, and the caller draws the title itself. With one, the header is two rows
 * above the events: the action row, when it holds a control, then the heading row, which takes
 * the title in, as a small label over the month. The title keeps its element and classes there,
 * inside `.header-container` still. Which row a control sits on depends on the configuration
 * and, for the chips alone, on whether all of them fit; never on the dates.
 *
 * @param toolbar - The controls the card wants
 * @param title - The header's title block: the `h1`, or the empty placeholder without a title
 * @returns The toolbar, title included, or undefined when it would be empty
 */
export function renderHeaderToolbar(
  toolbar: HeaderToolbar,
  title: TemplateResult,
): TemplateResult | undefined {
  if (
    !toolbar.addEvent &&
    !toolbar.viewSwitcher &&
    !toolbar.navigation &&
    !toolbar.reset &&
    !toolbar.refresh &&
    !toolbar.legend
  ) {
    return undefined;
  }

  const labeled = toolbar.labeled === true;
  return html`${renderActionRow(toolbar, labeled)}${renderHeadingRow(toolbar, title)}`;
}
