/**
 * What a page draws around its live fields (backlog item 307): the line under a field with its
 * state, Reset outcome and actions, a heading's Add row, its gate line and the values stored for
 * settings that are not in use, the page's line naming what other layouts add, and the two
 * preferences. Templates only, as `overview.ts`.
 */

import { mdiClose, mdiPlus, mdiRestore } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';
import type { Translate } from './overview';
import { interpolate } from '../strings';

/** A button of the editor's own, in a field's line or a heading's. */
export interface LineButton {
  readonly label: string;
  /** Its accessible name, where it is not its label. */
  readonly name?: string;
  readonly focus: string;
  /** The id of what describes it: the Reset outcome. */
  readonly describedBy?: string;
  readonly kind?: 'reset' | 'remove';
  /** The options a Reset or Remove deletes here, space-separated. */
  readonly resetKeys?: string;
  readonly onPress: () => void;
}

/**
 * A button in a line.
 *
 * @param button - What it shows
 * @returns The button
 */
export function lineButton(button: LineButton): TemplateResult {
  const glyph =
    button.kind === 'reset' ? mdiRestore : button.kind === 'remove' ? mdiClose : undefined;
  return html`<button
    type="button"
    class="text-button line-button"
    data-focus=${button.focus}
    aria-label=${button.name ?? nothing}
    aria-describedby=${button.describedBy ?? nothing}
    data-reset-keys=${button.resetKeys || nothing}
    @click=${button.onPress}
  >
    ${glyph ? icon(glyph) : nothing}${button.label}
  </button>`;
}

/** What the line under a live field shows. */
export interface FieldLine {
  /** Whether the field stores a value here: a filled dot, else a ring. */
  readonly stored: boolean;
  /** Lines of their own: "Grid Sets Its Own: 20" with Edit Grid, the ignored All Layouts value. */
  readonly notes: ReadonlyArray<{ readonly text: string; readonly button?: LineButton }>;
  /** "Set on Calendars:" with a link per entry. */
  readonly calendars?: { readonly label: string; readonly links: ReadonlyArray<LineButton> };
  /** What Reset gives, and the id Reset is described by. */
  readonly outcome?: { readonly id: string; readonly text: string };
  readonly actions: ReadonlyArray<LineButton>;
}

/**
 * The line under a live field: the mark, what it adds to the words in the form, and its actions.
 *
 * @param line - What it shows
 * @returns The line, or nothing where it has nothing to say
 */
export function fieldLine(line: FieldLine): TemplateResult | typeof nothing {
  if (
    line.notes.length === 0 &&
    line.calendars === undefined &&
    line.outcome === undefined &&
    line.actions.length === 0
  ) {
    return nothing;
  }
  return html`<div class="field-line">
    <span class="mark${line.stored ? ' stored' : ''}" aria-hidden="true"></span>
    <div class="field-line-body">
      ${line.notes.map(
        (note) =>
          html`<p class="field-note">
            <span>${note.text}</span>${note.button ? lineButton(note.button) : nothing}
          </p>`,
      )}
      ${
        line.calendars
          ? html`<p class="field-note">
              <span>${line.calendars.label}</span>${line.calendars.links.map(lineButton)}
            </p>`
          : nothing
      }
      ${
        line.outcome || line.actions.length > 0
          ? html`<p class="field-note">
              ${
                line.outcome
                  ? html`<span id=${line.outcome.id} class="outcome">${line.outcome.text}</span>`
                  : nothing
              }${line.actions.map(lineButton)}
            </p>`
          : nothing
      }
    </div>
  </div>`;
}

/** One setting an Add row offers. */
export interface AddItem {
  readonly key: string;
  readonly label: string;
  /** The first sentence of its helper. */
  readonly helper?: string;
  /** Its value as it stands. */
  readonly value?: string;
  readonly onAdd: () => void;
}

/** What a heading's Add row shows. */
export interface AddRow {
  /** The `data-focus` key of the row's own button. */
  readonly key: string;
  readonly heading: string;
  /** Whether nothing under the heading is live, so the row carries the heading's name. */
  readonly named: boolean;
  /** The settings' names as the closed row shows them. */
  readonly names: string;
  readonly items: ReadonlyArray<AddItem>;
  readonly open: boolean;
  readonly query: string;
  readonly onToggle: () => void;
  readonly onShowAll: () => void;
  readonly onQuery: (query: string) => void;
}

/** Past this many settings, an open Add row offers a box to narrow them. */
const FILTER_PAST = 7;

/**
 * A heading's Add row: closed, "Add Setting" with the names it holds and their count; open, a
 * group of one button per setting, Show All first where there are two or more, and a box to
 * narrow them where there are many.
 *
 * @param row - What it shows
 * @param t - The editor's strings
 * @returns The row
 */
export function addRow(row: AddRow, t: Translate): TemplateResult {
  const count = String(row.items.length);
  const counted = interpolate(t('add.count'), { count });
  const query = row.query.trim().toLowerCase();
  const items =
    query === '' ? row.items : row.items.filter((item) => item.label.toLowerCase().includes(query));
  return html`<div class="add-row${row.open ? ' open' : ''}">
    <button
      type="button"
      class="add-toggle"
      data-focus=${row.key}
      aria-expanded=${row.open ? 'true' : 'false'}
      aria-label=${interpolate(t('add.name'), { heading: row.heading, count })}
      @click=${row.onToggle}
    >
      ${icon(mdiPlus)}
      <span class="add-text">
        <span class="add-title"
          >${
            row.named
              ? interpolate(t('add.setting_under'), { heading: row.heading })
              : t('add.setting')
          }</span
        >
        <span class="add-names">${row.names}</span>
      </span>
      <span class="add-count">${counted}</span>
    </button>
    ${
      row.open
        ? html`<div
            class="add-list"
            role="group"
            aria-label=${interpolate(t('add.group'), { heading: row.heading })}
          >
            ${
              row.items.length >= 2
                ? html`<button
                    type="button"
                    class="add-item add-all"
                    data-focus=${`${row.key}:all`}
                    @click=${row.onShowAll}
                  >
                    <span class="add-item-label">${t('add.show_all')}</span>
                    <span class="add-item-note">${counted}</span>
                  </button>`
                : nothing
            }
            ${
              row.items.length > FILTER_PAST
                ? html`<input
                    type="search"
                    class="add-filter"
                    aria-label=${t('add.filter')}
                    placeholder=${t('add.filter')}
                    .value=${row.query}
                    @input=${(event: Event) =>
                      row.onQuery((event.target as HTMLInputElement).value)}
                  />`
                : nothing
            }
            ${items.map(
              (item) =>
                html`<button
                  type="button"
                  class="add-item"
                  data-focus=${`${row.key}:${item.key}`}
                  @click=${item.onAdd}
                >
                  <span class="add-item-label">${item.label}</span>
                  ${item.helper ? html`<span class="add-item-note">${item.helper}</span>` : nothing}
                  ${item.value ? html`<span class="add-item-value">${item.value}</span>` : nothing}
                </button>`,
            )}
          </div>`
        : nothing
    }
  </div>`;
}

/**
 * A heading's gate line, "Appears once Show Description is on: Description Color.", and the
 * values stored for settings that are not in use, each with its action.
 *
 * @param gateLines - The gate lines, one per condition waited on
 * @param inactive - The stored lines
 * @returns The lines
 */
export function gateLines(
  gateLines: ReadonlyArray<string>,
  inactive: ReadonlyArray<{ readonly text: string; readonly button: LineButton }>,
): TemplateResult | typeof nothing {
  if (gateLines.length === 0 && inactive.length === 0) return nothing;
  return html`${gateLines.map((line) => html`<p class="gate-line">${line}</p>`)}
  ${inactive.map(
    (line) =>
      html`<p class="gate-line inactive-line">
        <span>${line.text}</span>${lineButton(line.button)}
      </p>`,
  )}`;
}

/**
 * The page's foot line for the layouts that add settings here: "List and Columns add here: Now,
 * Time Position, +7. Settings: 10." with Edit List.
 *
 * @param text - The sentence
 * @param count - "Settings: 10"
 * @param button - Edit, for the first of the layouts
 * @returns The line
 */
export function otherLayoutsLine(text: string, count: string, button: LineButton): TemplateResult {
  return html`<p class="page-line other-layouts">
    <span>${text} ${count}</span>${lineButton(button)}
  </p>`;
}

/** One of the preferences under More. */
export interface PrefRow {
  readonly key: string;
  readonly label: string;
  readonly helper: string;
  readonly on: boolean;
  readonly onToggle: () => void;
}

/**
 * A preference, as a switch of the editor's own with its line under it.
 *
 * @param pref - What it shows
 * @returns The row
 */
export function prefRow(pref: PrefRow): TemplateResult {
  const helperId = `pref-${pref.key}-helper`;
  return html`<div class="pref-row">
    <button
      type="button"
      role="switch"
      class="pref-switch"
      data-focus=${`pref:${pref.key}`}
      aria-checked=${pref.on ? 'true' : 'false'}
      aria-describedby=${helperId}
      @click=${pref.onToggle}
    >
      <span class="pref-label">${pref.label}</span>
      <span class="pref-track" aria-hidden="true"><span class="pref-thumb"></span></span>
    </button>
    <p class="hint" id=${helperId}>${pref.helper}</p>
  </div>`;
}
