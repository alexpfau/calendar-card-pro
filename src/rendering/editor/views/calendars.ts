/**
 * The overview's calendar list and the parts of a calendar entry's page that are not fields: a
 * row per entry, a calendar row above the entries of a calendar listed more than once, the action
 * strip under a row, Add Calendar, and the entry page's Previous and Next Calendar. Templates only,
 * as `overview.ts`: each takes what it shows and what to call.
 *
 * What a row says comes from `calendar-list.ts`; what an action does is the element's.
 */

import {
  mdiAlertOutline,
  mdiCalendarBlankOutline,
  mdiChevronDown,
  mdiChevronRight,
  mdiChevronUp,
  mdiDotsVertical,
  mdiInformationOutline,
} from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { icon } from './icon';

/** One action of a strip. */
export interface StripAction {
  /** Its part of the `data-focus` key, so focus can return to it after a move. */
  readonly id: string;
  readonly label: string;
  /** Its icon's path, drawn before the label. */
  readonly icon?: string;
  /** Its accessible name, which says whose action it is. */
  readonly name: string;
  /** A line under the label: "From Ben", "Copy settings first". */
  readonly note?: string;
  /** Keys beside a move: "Alt ↑". */
  readonly keys?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onPress: () => void;
}

/**
 * A row's action strip, in flow under its row.
 *
 * @param key - The row's key: `entry:<key>`, `calendar:<entity id>` or `page`
 * @param name - The group's name: "Actions for Anna"
 * @param actions - Its actions, in order
 * @returns The strip
 */
export function strip(
  key: string,
  name: string,
  actions: ReadonlyArray<StripAction>,
): TemplateResult {
  return html`<div class="strip" role="group" aria-label=${name}>
    ${actions.map(
      (action) =>
        html`<button
          type="button"
          class="strip-button${action.danger ? ' destructive' : ''}"
          data-focus=${`strip:${key}:${action.id}`}
          aria-label=${action.name}
          ?disabled=${action.disabled === true}
          @click=${action.onPress}
        >
          ${action.icon ? icon(action.icon) : nothing}
          <span class="strip-text">
            <span class="strip-label">${action.label}</span>
            ${
              action.keys
                ? html`<kbd class="strip-keys" aria-hidden="true">${action.keys}</kbd>`
                : nothing
            }
            ${action.note ? html`<small class="strip-note">${action.note}</small>` : nothing}
          </span>
        </button>`,
    )}
  </div>`;
}

/** The ⋮ button that opens a row's strip. */
export interface MoreButton {
  /** The strip's key, which `data-focus` names as `more:<key>`. */
  readonly key: string;
  /** "Actions for Anna". */
  readonly name: string;
  readonly open: boolean;
  /** The calendar Alt+Arrow moves from here, where the row can move. */
  readonly moves?: string;
  readonly onToggle: () => void;
}

/**
 * The ⋮ button of a row.
 *
 * @param more - What it shows
 * @returns The button
 */
export function moreButton(more: MoreButton): TemplateResult {
  return html`<button
    type="button"
    class="icon-button row-more"
    data-focus=${`more:${more.key}`}
    data-move-calendar=${more.moves ?? nothing}
    aria-label=${more.name}
    title=${more.name}
    aria-expanded=${more.open ? 'true' : 'false'}
    @click=${more.onToggle}
  >
    ${icon(mdiDotsVertical)}
  </button>`;
}

/** A calendar's label, resolved as the card resolves it (`utils/events.ts` › `resolveEntityLabel`). */
export interface RowLabel {
  readonly type: 'text' | 'icon' | 'image';
  /** The words, the icon's name or the picture's address. */
  readonly value: string;
  /** An icon's color, `label_icon_color`. */
  readonly color?: string;
}

/**
 * A row's label slot: the label as the card draws it beside an event, decorative beside the
 * calendar's name. An icon goes through Home Assistant's `ha-icon`, the one place the list names
 * an element of Home Assistant's, and only where it is defined; elsewhere the slot stays empty.
 *
 * @param label - The label, where the entry has one
 * @param slot - Whether the list keeps a slot on every row, so names align
 * @returns The slot, or nothing on a list where no row has a label
 */
export function rowLabel(
  label: RowLabel | undefined,
  slot: boolean,
): TemplateResult | typeof nothing {
  if (!slot && label === undefined) return nothing;
  let drawn: TemplateResult | typeof nothing = nothing;
  if (label?.type === 'text') drawn = html`${label.value}`;
  else if (label?.type === 'image') drawn = html`<img src=${label.value} alt="" />`;
  else if (label?.type === 'icon' && customElements.get('ha-icon') !== undefined) {
    drawn = html`<ha-icon
      .icon=${label.value}
      style=${styleMap(label.color ? { color: label.color } : {})}
    ></ha-icon>`;
  }
  return html`<span class="cal-badge" aria-hidden="true">${drawn}</span>`;
}

/** One entry, as its row draws it. */
export interface EntryRowModel {
  readonly key: number;
  /** The row's title: the calendar's name, or inside a group its parts. */
  readonly title: string;
  /** The line under it: its parts and "Set: N", or "Set: N" alone inside a group. */
  readonly summary: string;
  /** "Edit Anna, Without: Homework, Set: 4". */
  readonly editName: string;
  /** A CSS color for the dot, where the entry has one. */
  readonly color?: string;
  /** What the entry is labeled with. */
  readonly label?: RowLabel;
  /** Whether the list keeps a label slot on every row. */
  readonly labelSlot: boolean;
  /** Whether Home Assistant no longer has its calendar. */
  readonly missing: boolean;
  /** A tag beside the title: "New", for an entry a split wrote this session. */
  readonly tag?: string;
  /** The calendar Alt+Arrow moves from the row, where it can move. */
  readonly moves?: string;
  /** Its calendar's drag handle, on the row of a calendar with one entry. */
  readonly handle?: TemplateResult;
  readonly more: MoreButton;
  /** Its strip, while open. */
  readonly strip?: TemplateResult;
  readonly onOpen: () => void;
}

/** One calendar and its entries, as the list draws them. */
export interface CalendarModel {
  readonly entityId: string;
  /** Whether the keyboard grab holds it, which marks it. */
  readonly grabbed?: boolean;
  /**
   * Its place in the keyboard grab's preview order, while there is one. The list shows that order
   * by CSS `order` rather than by moving its rows, so the handle keeps focus throughout.
   */
  readonly place?: number;
  /** Its calendar row, drawn above its entries when it has several. */
  readonly head?: {
    /** The calendar's drag handle, which moves all its entries. */
    readonly handle?: TemplateResult;
    readonly name: string;
    readonly count: string;
    readonly missing: boolean;
    readonly more: MoreButton;
    readonly strip?: TemplateResult;
  };
  readonly rows: ReadonlyArray<EntryRowModel>;
}

/**
 * One entry's row: a dot, its label, its title and summary, a chevron, and its ⋮.
 *
 * @param row - What it shows
 * @param grouped - Whether it sits under its calendar's row
 * @returns The row, with its strip while open
 */
function entryRow(row: EntryRowModel, grouped: boolean): TemplateResult {
  return html`<div class="cal-row${grouped ? ' cal-row-entry' : ''}" data-entry-row=${row.key}>
      ${row.handle ?? nothing}
      <button
        type="button"
        class="cal-body"
        data-focus=${`row:${row.key}`}
        data-move-calendar=${row.moves ?? nothing}
        aria-label=${row.editName}
        @click=${row.onOpen}
      >
        <span
          class="cal-dot"
          aria-hidden="true"
          style=${styleMap(row.color ? { '--cal-dot': row.color } : {})}
        ></span>
        ${rowLabel(row.label, row.labelSlot)}
        <span class="cal-text">
          <span class="cal-title"
            >${row.title}${row.tag ? html` <span class="tag">${row.tag}</span>` : nothing}</span
          >
          <span class="cal-summary"
            >${row.missing ? icon(mdiAlertOutline, 'cal-missing') : nothing}${row.summary}</span
          >
        </span>
        ${icon(mdiChevronRight, 'nav-chevron')}
      </button>
      ${moreButton(row.more)}
    </div>
    ${row.strip ?? nothing}`;
}

/**
 * The list: each calendar, its row when it has several entries, and its entries' rows, with the
 * line a removal left drawn where the removed row was.
 *
 * @param calendars - The calendars, in list order
 * @param status - The line a removal left, and the place among the calendars it stands at
 * @returns The list
 */
export function calendarList(
  calendars: ReadonlyArray<CalendarModel>,
  status?: { readonly at: number; readonly bar: TemplateResult },
): TemplateResult {
  const at = status === undefined ? -1 : Math.min(status.at, calendars.length);
  // While the grab previews an order, the rows take odd places and the removal line the even one
  // before the row it was drawn before.
  const previewing = calendars.some((calendar) => calendar.place !== undefined);
  return html`<div class="cal-list" style=${previewing ? `--bar: ${2 * at}` : nothing}>
    ${repeat(
      calendars,
      (calendar) => calendar.entityId,
      (calendar, index) => {
        const head = calendar.head;
        return html`${index === at ? status!.bar : nothing}
          <div
            class="cal-group${calendar.grabbed ? ' grabbed' : ''}"
            style=${calendar.place === undefined ? nothing : `order: ${2 * calendar.place + 1}`}
            data-calendar=${calendar.entityId}
            data-reorder=${calendar.entityId}
          >
            ${
              head
                ? html`<div class="cal-row cal-row-head">
                      ${head.handle ?? nothing}
                      <span class="cal-text">
                        <span class="cal-title">${head.name}</span>
                        <span class="cal-summary"
                          >${head.missing ? icon(mdiAlertOutline, 'cal-missing') : nothing}${
                            head.count
                          }</span
                        >
                      </span>
                      ${moreButton(head.more)}
                    </div>
                    ${head.strip ?? nothing}`
                : nothing
            }
            ${repeat(
              calendar.rows,
              (row) => row.key,
              (row) => entryRow(row, head !== undefined),
            )}
          </div>`;
      },
    )}
    ${at === calendars.length ? status!.bar : nothing}
  </div>`;
}

/**
 * The list's empty state, on a card with no calendars yet.
 *
 * @param title - "No Calendars Yet"
 * @param note - "Add the calendars this card shows."
 * @returns The block
 */
export function emptyCalendars(title: string, note: string): TemplateResult {
  return html`<div class="cal-empty">
    ${icon(mdiCalendarBlankOutline)}
    <p class="cal-empty-title">${title}</p>
    <p class="hint">${note}</p>
  </div>`;
}

/**
 * Filter Calendars: a native search input above a long list.
 *
 * @param label - Its name
 * @param value - What it holds
 * @param onInput - It changed
 * @returns The field
 */
export function calendarFilter(
  label: string,
  value: string,
  onInput: (value: string) => void,
): TemplateResult {
  return html`<input
    class="cal-filter"
    type="search"
    data-focus="calendar-filter"
    aria-label=${label}
    placeholder=${label}
    .value=${value}
    @input=${(event: Event) => onInput((event.target as HTMLInputElement).value)}
  />`;
}

/** A text button with its `data-focus` key. */
export interface TextButton {
  readonly label: string;
  readonly focus: string;
  readonly name?: string;
  /** An icon's path, drawn before the label. */
  readonly iconPath?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

/**
 * A text button.
 *
 * @param button - What it shows
 * @param classes - Further classes
 * @returns The button
 */
export function textButton(button: TextButton, classes = ''): TemplateResult {
  return html`<button
    type="button"
    class="text-button${button.iconPath ? ' with-icon' : ''}${classes}"
    data-focus=${button.focus}
    aria-label=${button.name ?? nothing}
    ?disabled=${button.disabled === true}
    @click=${button.onPress}
  >
    ${button.iconPath ? icon(button.iconPath) : nothing}${button.label}
  </button>`;
}

/**
 * Add Calendar, open: Home Assistant's picker, its helper, the line naming a calendar already on
 * the card with its Open, then Cancel and Add.
 *
 * @param picker - The picker's form
 * @param already - The line and its Open, where the calendar chosen is already on the card
 * @param cancel - Cancel
 * @param add - Add, disabled until a calendar is chosen
 * @returns The block
 */
export function addCalendar(
  picker: TemplateResult,
  already: { readonly line: string; readonly open: TextButton } | undefined,
  cancel: TextButton,
  add: TextButton,
): TemplateResult {
  return html`<div class="add-calendar">
    ${picker}
    ${
      already
        ? html`<p class="page-line">
            <span>${already.line}</span> ${textButton(already.open, ' link-button')}
          </p>`
        : nothing
    }
    <div class="add-calendar-actions">${textButton(cancel)} ${textButton(add, ' filled')}</div>
  </div>`;
}

/**
 * Previous Calendar and Next Calendar, under an entry page's header, each with the chevron
 * pointing the way it steps through the list.
 *
 * @param previous - Previous Calendar
 * @param next - Next Calendar
 * @returns The pair
 */
export function previousNext(previous: TextButton, next: TextButton): TemplateResult {
  return html`<div class="entry-steps">
    ${textButton({ ...previous, iconPath: mdiChevronUp })}
    ${textButton({ ...next, iconPath: mdiChevronDown })}
  </div>`;
}

/**
 * A warning or a notice under an entry page's header.
 *
 * @param text - What it says
 * @param warning - Whether it warns, drawn with the warning icon
 * @returns The line
 */
export function entryNotice(text: string, warning: boolean): TemplateResult {
  return html`<p class="entry-notice${warning ? ' warning' : ''}">
    ${icon(warning ? mdiAlertOutline : mdiInformationOutline)}<span>${text}</span>
  </p>`;
}
