/**
 * The composed controls as templates: toggle chips (D08 A, D09 A), the qualifier lines under the
 * toolbar's chips, Start Date's segmented radio group, and the toolbar's own buttons as rows that
 * open in place
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
import { live } from 'lit/directives/live.js';
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

/** One choice of a qualifier line. */
export interface QualifierChoice {
  readonly value: string;
  readonly label: string;
  readonly checked: boolean;
  /**
   * Why it stays as it is ("Starting Layout"): drawn after its label and read in its name. A kept
   * choice stays focusable, `aria-disabled`, and a click leaves it as it is.
   */
  readonly kept?: string;
}

/** A qualifier line: what a pressed control offers or shows, under the chips. */
export interface QualifierModel {
  /** The control it qualifies, as `data-qualifies` names it. */
  readonly qualifies: string;
  /** Its field's id where it is a field of its own, which `data-field` names; none for a form. */
  readonly field?: string;
  /** "Calendar Filter shows", its legend. */
  readonly legend: string;
  /** Radios for one of a few forms, or checkboxes for any number of values. */
  readonly kind: 'radio' | 'checkbox';
  readonly choices: ReadonlyArray<QualifierChoice>;
  /** Its state words where it stores a value, read after its legend. */
  readonly words?: string;
  /** Lines under the choices, and the id of each, which the group is described by. */
  readonly notes?: ReadonlyArray<{ readonly id?: string; readonly text: string }>;
  /** The line under it: its notes and its Reset, where drawn alone. */
  readonly line?: TemplateResult | typeof nothing;
  readonly onPick: (value: string) => void;
}

/**
 * A qualifier line, drawn alike for every pressed control that has a choice and unlike the chips
 * above it: a native radio group or a row of native checkboxes under a legend, set in by a rule at
 * its start. A kept checkbox is focusable and `aria-disabled`, its reason after its label and in
 * its name, and a click on it changes nothing.
 *
 * @param model - What it shows and does
 * @returns The line
 */
export function qualifier(model: QualifierModel): TemplateResult {
  const described = (model.notes ?? []).flatMap((note) => note.id ?? []).join(' ');
  const name = model.qualifies.replace(/\W/g, '-');
  return html`<fieldset
    class="qualifier"
    data-qualifies=${model.qualifies}
    data-field=${model.field ?? nothing}
    data-composed=${model.field === undefined ? nothing : 'layouts'}
    tabindex="-1"
    aria-describedby=${described || nothing}
  >
    <legend class="label">
      ${model.legend}${model.words ? html`<span class="state-words"> · ${model.words}</span>` : nothing}
    </legend>
    <div class="qualifier-choices">
      ${model.choices.map(
        (choice) =>
          html`<label class="qualifier-choice${choice.kept === undefined ? '' : ' kept'}">
            <input
              type=${model.kind}
              name=${`qualifier-${name}`}
              value=${choice.value}
              data-value=${choice.value}
              data-focus=${`qualifier:${model.qualifies}:${choice.value}`}
              aria-disabled=${choice.kept === undefined ? nothing : 'true'}
              aria-label=${choice.kept === undefined ? nothing : `${choice.label}, ${choice.kept}`}
              .checked=${live(choice.checked)}
              @click=${(event: Event) => {
                // A kept choice stays as it is, and keeps focus.
                if (choice.kept !== undefined) event.preventDefault();
              }}
              @change=${() => {
                if (choice.kept === undefined) model.onPick(choice.value);
              }}
            /><span>${choice.label}</span>${
              choice.kept === undefined
                ? nothing
                : html`<span class="qualifier-kept" aria-hidden="true">${choice.kept}</span>`
            }
          </label>`,
      )}
    </div>
    ${(model.notes ?? []).map(
      (note) => html`<p class="hint" id=${note.id ?? nothing}>${note.text}</p>`,
    )}
    ${model.line ?? nothing}
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
