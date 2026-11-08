/**
 * The calendar filter, which the configuration calls the legend: each calendar hides or shows
 * its events on this device.
 *
 * It takes one of two forms. As a menu, a button at the start of the action row opens a
 * checkbox per calendar, floating over the events. As chips, one per calendar sits in the middle
 * of the heading row, tinted in its color, so the chips are also the key to the colors below;
 * where they do not all fit beside the month and the arrows, the chips give way to exactly the
 * menu's layout. The card decides which; this module draws either, and runs the menu.
 *
 * The menu is a native `<dialog>` opened with `showModal()`, placed, painted opaque and closed
 * by the controller every toolbar menu shares (`menu.ts`).
 */

import { mdiCalendarFilter } from '@mdi/js';
import { TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import * as Menu from './menu';

export { placeMenu, type MenuPlacement, type Rect } from './menu';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** One calendar the legend lists. */
export interface LegendCalendar {
  /** The calendar's entity id. */
  id: string;
  /** Its name, as Home Assistant holds it. */
  name: string;
  /** Its accent color, which tints its chip. */
  color: string;
  /** False while the legend hides it. */
  shown: boolean;
}

/** What the card hands the wrapper when it should draw the legend. */
export interface CalendarLegend {
  /** Every calendar on the card, once each, in the order the configuration first names it. */
  calendars: ReadonlyArray<LegendCalendar>;
  /** Home Assistant's name for a list of calendars, or undefined when it offers none. */
  name: string | undefined;
  /**
   * True when the legend is a button opening a menu: always under `menu`, and under `chips`
   * while they do not all fit.
   */
  folded: boolean;
  /** True while the card is being edited: everything is drawn, and nothing toggles or opens. */
  inert: boolean;
  onToggle: (id: string) => void;
}

/**
 * What a card announces when its legend hides or shows a calendar, so another card with the
 * same configuration, which shares the remembered choice, can take it up.
 */
export interface LegendChange {
  /** The configuration's fingerprint, which keys the remembered choice. */
  fingerprint: string;
  /** Every calendar now hidden. */
  hidden: ReadonlyArray<string>;
  /**
   * Whether `localStorage` took the change. A card taking up the set takes this up with it, or
   * it would catch up with a storage that never held the set and show the calendars again.
   */
  stored: boolean;
  /** The card that changed it, which ignores its own announcement. */
  source: unknown;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The legend's accessible name when Home Assistant has no string for it. Only ever an
 * `aria-label`, under the toolbar's rule for English fallbacks.
 */
const UNLOCALIZED_LEGEND_NAME = 'Calendars';

/** The window event a {@link LegendChange} travels on. */
export const LEGEND_CHANGED_EVENT = 'calendar-card-pro-legend-changed';

/** The legend's menu, to the controller: its kind, and the stand-ins its surface is read off. */
const LEGEND_MENU: Menu.MenuParts = {
  kind: 'legend',
  surface: 'legend-menu-surface',
  page: 'legend-menu-page',
};

//-----------------------------------------------------------------------------
// RENDERING
//-----------------------------------------------------------------------------

/**
 * Keep a press inside the legend from also becoming a press on the card, as the toolbar's
 * controls do (`stopCardGesture` in `toolbar.ts`).
 *
 * @param ev - The event to keep inside
 */
function stopCardGesture(ev: Event): void {
  ev.stopPropagation();
}

/**
 * A chip's or a row's color, as the custom property its stylesheet rules read.
 *
 * @param calendar - The calendar
 * @returns The inline style
 */
function legendColor(calendar: LegendCalendar) {
  return styleMap({ '--calendar-card-legend-color': calendar.color });
}

/**
 * Render the legend's chips: one per calendar, in the middle of the heading row.
 *
 * Each chip is a native toggle button, pressed while its calendar is shown, so it is a tab
 * stop of its own and Enter and Space work without key handling of ours. A hidden calendar's
 * chip stays in place, gray, so a filtered card always shows that it is filtered.
 *
 * @param legend - Legend description from the card
 * @returns The chips
 */
export function renderLegendChips(legend: CalendarLegend): TemplateResult {
  const name = legend.name ?? UNLOCALIZED_LEGEND_NAME;

  return html`<div
    class="toolbar-legend"
    role="group"
    aria-label=${name}
    @pointerdown=${stopCardGesture}
    @click=${stopCardGesture}
  >
    <div class="legend-chips">
      ${legend.calendars.map(
        (calendar) =>
          html`<button
            type="button"
            class=${calendar.shown ? 'legend-chip' : 'legend-chip hidden-calendar'}
            style=${legendColor(calendar)}
            data-calendar=${calendar.id}
            aria-pressed=${calendar.shown ? 'true' : 'false'}
            @click=${() => {
              if (!legend.inert) legend.onToggle(calendar.id);
            }}
          >
            <span class="legend-chip-label">${calendar.name}</span>
          </button>`,
      )}
    </div>
  </div>`;
}

/**
 * Render the folded legend: a button leading the action row, and the menu it opens.
 *
 * The menu lists every calendar as a checkbox, tinted as its chip would be. It closes on a
 * press outside it, on Escape, on a scroll or a resize, and on a second press on the button.
 * The button carries a dot while any calendar is hidden, so a folded legend still says the
 * card is filtered. An icon, a calendar with a funnel: Home Assistant's name for it names it and
 * shows as its tooltip, and the English fallback names it and nothing else.
 *
 * `aria-expanded` is written once by the template and then kept by the menu itself, so a
 * re-render while the menu is open does not reset it.
 *
 * @param legend - Legend description from the card
 * @returns The button and its menu
 */
export function renderLegendButton(legend: CalendarLegend): TemplateResult {
  const name = legend.name ?? UNLOCALIZED_LEGEND_NAME;
  const filtered = legend.calendars.some((calendar) => !calendar.shown);
  const className = filtered
    ? 'toolbar-button legend-button filtered'
    : 'toolbar-button legend-button';

  const dialogOf = (button: HTMLElement): HTMLDialogElement | null =>
    button.parentElement?.querySelector<HTMLDialogElement>('dialog.legend-menu') ?? null;
  const onClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    const dialog = dialogOf(ev.currentTarget as HTMLElement);
    if (dialog) Menu.pressMenuButton(ev, dialog, legend.inert, LEGEND_MENU);
  };

  return html`<button
      type="button"
      class=${className}
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-label=${name}
      title=${legend.name ?? nothing}
      @pointerdown=${stopCardGesture}
      @click=${onClick}
    >
      <svg class="toolbar-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d=${mdiCalendarFilter}></path>
      </svg>
    </button>
    <dialog
      class="legend-menu"
      tabindex="-1"
      aria-label=${name}
      @pointerdown=${stopCardGesture}
      @click=${Menu.closeOnPressOutside}
    >
      <div class="legend-menu-list" role="group" aria-label=${name}>
        ${legend.calendars.map(
          (calendar) =>
            html`<label
              class=${calendar.shown ? 'legend-menu-row' : 'legend-menu-row hidden-calendar'}
              style=${legendColor(calendar)}
              data-calendar=${calendar.id}
            >
              <input
                type="checkbox"
                class="legend-menu-check"
                .checked=${calendar.shown}
                @change=${(ev: Event) => {
                  const input = ev.currentTarget as HTMLInputElement;
                  if (legend.inert) {
                    input.checked = calendar.shown;
                    return;
                  }
                  legend.onToggle(calendar.id);
                }}
              />
              <span class="legend-menu-label">${calendar.name}</span>
            </label>`,
        )}
      </div>
      <span class="legend-menu-surface" aria-hidden="true"></span>
      <span class="legend-menu-page" aria-hidden="true"></span>
    </dialog>`;
}

/**
 * The calendars a legend lists: every entity on the card, once, in the order the
 * configuration first names it. A calendar listed twice, split by `event_type`, is one chip.
 *
 * @param entities - The card's normalized entities
 * @returns Entity ids
 */
export function legendCalendarIds(entities: ReadonlyArray<string | { entity: string }>): string[] {
  const ids: string[] = [];
  for (const entry of entities) {
    const id = typeof entry === 'string' ? entry : entry?.entity;
    if (typeof id === 'string' && id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Names, in a tooltip, each chip whose name was cut short.
 *
 * A chip is only as wide as a long name allows (`.legend-chip-label`), so a long name ends in
 * an ellipsis. Its full name then shows on hover. Read after a render, from layout: a name
 * that fits needs no tooltip repeating it, and only layout can say which those are. Without
 * layout every box is empty and nothing changes.
 *
 * @param root - The card's shadow root
 */
export function markShortenedChips(root: ParentNode): void {
  for (const label of root.querySelectorAll<HTMLElement>('.legend-chip-label')) {
    const chip = label.closest('.legend-chip');
    if (!chip) continue;
    if (label.scrollWidth > label.clientWidth + 0.5) {
      chip.setAttribute('title', label.textContent ?? '');
    } else {
      chip.removeAttribute('title');
    }
  }
}
