/**
 * The composed controls as templates: toggle chips (D08 A, D09 A), Calendar
 * Filter's segmented radio group, and the toolbar's own buttons as rows that open in place
 * (D09 A). What each one shows and does is the element's; these only draw it. Every row that
 * moves carries `data-reorder`, as the calendar list's do, so `reorder.ts`'s pointer drag and
 * the list's styles serve both.
 */

import {
  mdiArrowDown,
  mdiArrowUp,
  mdiCheck,
  mdiChevronDown,
  mdiChevronUp,
  mdiDeleteOutline,
} from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { icon } from './icon';
import { TOOLBAR_BUTTON_ICON } from '../schemas/card';

/** One toggle chip. */
export interface ChipModel {
  /** Its field's id, which focus after Undo and a search's jump find it by. */
  readonly id: string;
  /**
   * The value it stands for, where it is one of a field's values rather than a field of its own
   * (Layouts in Switcher's layouts). Such a chip names its value, and its field is its group's.
   */
  readonly value?: string;
  readonly label: string;
  /** Its accessible name: the label, then the state words where a value is stored. */
  readonly name: string;
  readonly pressed: boolean;
  /** Why it cannot be pressed now ("Needs Time"); a chip with a reason is disabled. */
  readonly needs?: string;
  /**
   * Why it stays as it is ("Starting Layout"): drawn inside it as `needs` is, and read in its
   * name, which carries it. A kept chip is disabled too.
   */
  readonly kept?: string;
  /** "YAML: list.show_time", while Show YAML Option Names is on. */
  readonly yaml?: string;
  readonly onPress: () => void;
}

/**
 * A group of toggle chips: native buttons with `aria-pressed` and a check while pressed. A
 * chip that cannot be pressed is still drawn and still focusable, with `aria-disabled` and its
 * reason as its description, or in its name where it is kept as it is, so the reason is read
 * where the chip is.
 *
 * @param label - The group's name: "Event Details", "Controls"
 * @param chips - The chips, in order
 * @param shown - Whether the name is drawn above the chips, where no heading says it
 * @param grouped - Whether the chips are a group of their own; not where the field's own wrapper
 *   already groups them under the same name
 * @returns The group
 */
export function chipGroup(
  label: string,
  chips: ReadonlyArray<ChipModel>,
  shown: boolean,
  grouped = true,
): TemplateResult {
  return html`${shown ? html`<p class="label">${label}</p>` : nothing}
    <div
      class="chip-group"
      role=${grouped ? 'group' : nothing}
      aria-label=${grouped ? label : nothing}
      tabindex=${grouped ? '-1' : nothing}
    >
      ${chips.map((chip) => {
        const why = chip.needs === undefined ? undefined : `needs-${chip.id.replace(/\W/g, '-')}`;
        const locked = why !== undefined || chip.kept !== undefined;
        // A chip that can be pressed is composed for its field; one a gate withholds stands for
        // no field built here, and one standing for a value is its group's to compose.
        return html`<button
          type="button"
          class="chip"
          data-field=${chip.value === undefined ? chip.id : nothing}
          data-value=${chip.value ?? nothing}
          data-composed=${chip.value === undefined && why === undefined ? 'toggle' : nothing}
          aria-label=${chip.name}
          aria-pressed=${chip.pressed ? 'true' : 'false'}
          aria-disabled=${locked ? 'true' : nothing}
          aria-describedby=${why ?? nothing}
          title=${chip.yaml ?? nothing}
          @click=${locked ? nothing : chip.onPress}
        >
          ${chip.pressed ? icon(mdiCheck) : nothing}<span>${chip.label}</span>${
            why === undefined
              ? nothing
              : html`<span class="chip-needs" id=${why}>${chip.needs}</span>`
          }${
            chip.kept === undefined ? nothing : html`<span class="chip-needs">${chip.kept}</span>`
          }${chip.yaml ? html`<code class="chip-yaml">${chip.yaml}</code>` : nothing}
        </button>`;
      })}
    </div>`;
}

/** A card-built segmented radio group, as Calendar Filter draws it. */
export interface SegmentedModel {
  readonly id: string;
  readonly label: string;
  /** Its state words, which its name carries. */
  readonly words?: string;
  readonly helper?: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onPick: (value: string) => void;
}

/**
 * A segmented radio group: one native radio per option, and the helper under it. Its legend
 * carries its state words; its Reset is the line under it every field has.
 *
 * @param model - What it shows and does
 * @returns The group
 */
export function segmented(model: SegmentedModel): TemplateResult {
  return html`<fieldset
    class="segmented"
    data-field=${model.id}
    data-composed="chips"
    tabindex="-1"
  >
    <legend class="label">
      ${model.label}${model.words ? html`<span class="state-words"> · ${model.words}</span>` : nothing}
    </legend>
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
            class="text-button with-icon${destructive ? ' destructive' : ''}"
            data-move=${action.move ?? nothing}
            ?disabled=${!action.enabled}
            @click=${action.onPress}
          >
            ${icon(
              destructive ? mdiDeleteOutline : action.move === 'up' ? mdiArrowUp : mdiArrowDown,
            )}${action.label}
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
