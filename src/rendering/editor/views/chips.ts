/**
 * The composed controls of section 5.9 as templates: toggle chips (D08 A, D09 A), Calendar
 * Filter's segmented radio group, and the toolbar's own buttons as rows that open in place
 * (D09 A). What each one shows and does is the element's; these only draw it. Every row that
 * moves carries `data-reorder`, as the calendar list's do, so `reorder.ts`'s pointer drag and
 * the list's styles serve both.
 */

import { mdiCheck, mdiChevronDown, mdiChevronUp, mdiRestore } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { icon } from './icon';
import { TOOLBAR_BUTTON_ICON } from '../schemas/card';

/** One toggle chip. */
export interface ChipModel {
  /** Its field's id, which focus after Undo and a search's jump find it by. */
  readonly id: string;
  readonly label: string;
  /** Its accessible name: the label, then the state words where a value is stored. */
  readonly name: string;
  readonly pressed: boolean;
  /** Why it cannot be pressed now ("Needs Time"); a chip with a reason is disabled. */
  readonly needs?: string;
  readonly onPress: () => void;
}

/**
 * A group of toggle chips: native buttons with `aria-pressed` and a check while pressed. A
 * chip that cannot be pressed is still drawn and still focusable, with `aria-disabled` and its
 * reason as its description, so the reason is read where the chip is.
 *
 * @param label - The group's name: "Event Details", "Controls"
 * @param chips - The chips, in order
 * @param shown - Whether the name is drawn above the chips, where no heading says it
 * @returns The group
 */
export function chipGroup(
  label: string,
  chips: ReadonlyArray<ChipModel>,
  shown: boolean,
): TemplateResult {
  return html`${shown ? html`<p class="label">${label}</p>` : nothing}
    <div class="chips" role="group" aria-label=${label} tabindex="-1">
      ${chips.map((chip) => {
        const why = chip.needs === undefined ? undefined : `needs-${chip.id.replace(/\W/g, '-')}`;
        return html`<button
          type="button"
          class="chip"
          data-field=${chip.id}
          aria-label=${chip.name}
          aria-pressed=${chip.pressed ? 'true' : 'false'}
          aria-disabled=${why === undefined ? nothing : 'true'}
          aria-describedby=${why ?? nothing}
          @click=${why === undefined ? chip.onPress : nothing}
        >
          ${chip.pressed ? icon(mdiCheck) : nothing}<span>${chip.label}</span>${
            why === undefined
              ? nothing
              : html`<span class="chip-needs" id=${why}>${chip.needs}</span>`
          }
        </button>`;
      })}
    </div>`;
}

/** A card-built segmented radio group, as Calendar Filter draws it. */
export interface SegmentedModel {
  readonly id: string;
  readonly label: string;
  readonly helper?: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onPick: (value: string) => void;
  /** Reset, named "Reset Calendar Filter", while a value is stored. */
  readonly reset?: { readonly name: string; readonly onPress: () => void };
}

/**
 * A segmented radio group: one native radio per option, with Reset beside it while a value is
 * stored, and the helper under it.
 *
 * @param model - What it shows and does
 * @returns The group
 */
export function segmented(model: SegmentedModel): TemplateResult {
  return html`<fieldset class="segmented" data-field=${model.id} tabindex="-1">
    <legend class="label">${model.label}</legend>
    <div class="segmented-row">
      <div class="segments">
        ${model.options.map(
          (option) =>
            html`<label class="segment">
              <input
                type="radio"
                name=${model.id}
                value=${option.value}
                .checked=${option.value === model.value}
                @change=${() => model.onPick(option.value)}
              /><span>${option.label}</span>
            </label>`,
        )}
      </div>
      ${
        model.reset
          ? html`<button
              type="button"
              class="icon-button"
              data-focus=${`reset:${model.id}`}
              aria-label=${model.reset.name}
              title=${model.reset.name}
              @click=${model.reset.onPress}
            >
              ${icon(mdiRestore)}
            </button>`
          : nothing
      }
    </div>
    ${model.helper ? html`<p class="hint">${model.helper}</p>` : nothing}
  </fieldset>`;
}

/** One action in a button row's strip. */
export interface StripAction {
  readonly label: string;
  readonly move?: 'up' | 'down';
  readonly enabled: boolean;
  readonly onPress: () => void;
}

/** One of the toolbar's own buttons, as its row draws it. */
export interface ButtonRowModel {
  readonly key: number;
  readonly title: string;
  /** "Toggle · light.kitchen". */
  readonly summary: string;
  readonly open: boolean;
  /** Where the keyboard grab previews it, counting from zero. */
  readonly place?: number;
  readonly grabbed: boolean;
  readonly handle: TemplateResult;
  readonly onToggle: () => void;
  /** Move Up, Move Down, then Remove. */
  readonly actions: readonly [StripAction, StripAction, StripAction];
  /** Its fields, drawn while it is open. */
  readonly body: () => unknown;
}

/**
 * The toolbar's own buttons: a list of rows, each with its drag handle, the button's name and
 * what a press does; pressed, a row opens in place to Move Up, Move Down, Remove and its fields.
 *
 * @param rows - The rows, in list order
 * @returns The list
 */
export function buttonList(rows: ReadonlyArray<ButtonRowModel>): TemplateResult {
  return html`<div class="cal-list button-list" role="list">
    ${repeat(
      rows,
      (row) => row.key,
      (row) => {
        const [up, down, remove] = row.actions;
        const strip = (action: StripAction, destructive = false) =>
          html`<button
            type="button"
            class="text-button${destructive ? ' destructive' : ''}"
            data-move=${action.move ?? nothing}
            ?disabled=${!action.enabled}
            @click=${action.onPress}
          >
            ${action.label}
          </button>`;
        return html`<div
          role="listitem"
          class="button-row${row.grabbed ? ' grabbed' : ''}"
          style=${row.place === undefined ? nothing : `order: ${row.place}`}
          data-reorder=${row.key}
          data-button-key=${row.key}
        >
          <div class="cal-row" data-move-button=${row.key}>
            ${row.handle}
            <button
              type="button"
              class="cal-body"
              data-focus=${`button:${row.key}`}
              aria-expanded=${row.open ? 'true' : 'false'}
              @click=${row.onToggle}
            >
              ${icon(TOOLBAR_BUTTON_ICON)}
              <span class="cal-text">
                <span class="cal-title">${row.title}</span>
                <span class="cal-summary">${row.summary}</span>
              </span>
              ${icon(row.open ? mdiChevronUp : mdiChevronDown, 'nav-chevron')}
            </button>
          </div>
          ${
            row.open
              ? html`<div class="button-body">
                  <div class="button-actions">
                    <div class="button-actions-safe">${strip(up)} ${strip(down)}</div>
                    ${strip(remove, true)}
                  </div>
                  ${row.body()}
                </div>`
              : nothing
          }
        </div>`;
      },
    )}
  </div>`;
}
