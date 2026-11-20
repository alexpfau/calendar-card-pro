/**
 * The overview's own controls and the pages': Quick Setup's banner, the preview line, Starting
 * Layout, the section rows and More. Templates only: each takes what it shows and what to call, holds no state and
 * reaches nothing in the element (AGENTS.md, _Editor_: `views/` is where the editor's Lit
 * templates live outside `element.ts`).
 */

import { mdiCheck, mdiChevronRight, mdiClose, mdiCreation, mdiEyeOutline } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';

import { icon } from './icon';

/** Resolves one of the editor's own strings by its literal key. */
export type Translate = (key: string) => string;

/**
 * The preview line: "Preview shows Grid · The card opens in Month", led by an eye that is no part
 * of its words. Drawn under a page's head, and above the overview's search results.
 *
 * @param text - The sentence
 * @returns The line
 */
export function previewLine(text: string): TemplateResult {
  return html`<p class="hint scope-preview">
    ${icon(mdiEyeOutline)}<span class="scope-preview-text">${text}</span>
  </p>`;
}

/** One chip of a group of radio chips. */
export interface ChipChoice {
  readonly value: string;
  readonly label: string;
}

/**
 * A field drawn as radio chips, as Start Date is on the overview: native radios inside the
 * field's own wrapper, so arrow keys move within the group, drawn as the toggle chips are.
 * Named, labeled and explained as the field's own form would be, state words included, with the
 * line under a field after it.
 *
 * @param id - The field's id, which its wrapper names
 * @param name - The radios' name
 * @param text - The group's accessible name, its visible legend and the helper under it
 * @param choices - The chips, in order
 * @param value - The chosen one
 * @param line - The line under the field: its notes, and Reset or Remove
 * @param onPick - A chip was chosen
 * @returns The group
 */
export function radioChips(
  id: string,
  name: string,
  text: { readonly name: string; readonly legend: string; readonly helper?: string },
  choices: ReadonlyArray<ChipChoice>,
  value: string,
  line: TemplateResult | typeof nothing,
  onPick: (value: string) => void,
): TemplateResult {
  return html`<fieldset
    class="field chips"
    data-field=${id}
    data-composed="chips"
    tabindex="-1"
    aria-label=${text.name}
  >
    <legend class="label">${text.legend}</legend>
    <div class="chip-choices">
      ${choices.map(
        (choice) =>
          html`<label class="chip-choice">
            <input
              type="radio"
              name=${name}
              value=${choice.value}
              data-focus=${`${name}:${choice.value}`}
              .checked=${choice.value === value}
              @change=${() => onPick(choice.value)}
            />
            ${choice.value === value ? icon(mdiCheck) : nothing}
            <span>${choice.label}</span>
          </label>`,
      )}
    </div>
    ${text.helper ? html`<p class="hint">${text.helper}</p>` : nothing} ${line}
  </fieldset>`;
}

/** One illustrated choice of Starting Layout. */
export interface DisplayChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly image?: string;
}

/**
 * Starting Layout: a row per layout, as Quick Setup draws its examples: a native radio, the
 * layout's picture, its name over its description, then the helper line. Its frame's heading
 * already says its name, so the legend is read and not seen.
 *
 * @param label - The group's name
 * @param helper - The line under it
 * @param choices - The layouts
 * @param value - The layout the card displays
 * @param onPick - A layout was chosen
 * @returns The group
 */
export function displayControl(
  label: string,
  helper: string | undefined,
  choices: ReadonlyArray<DisplayChoice>,
  value: string,
  onPick: (view: string) => void,
): TemplateResult {
  return html`<fieldset class="displays">
    <legend class="visually-hidden">${label}</legend>
    <div class="display-choices">
      ${choices.map(
        (choice) =>
          html`<label class="display-choice">
            <input
              type="radio"
              name="view"
              value=${choice.value}
              data-focus=${`view:${choice.value}`}
              .checked=${
                // Compared with the radio as it is, so a press the editor did not take leaves no
                // other radio checked.
                live(choice.value === value)
              }
              @change=${() => onPick(choice.value)}
            />
            ${choice.image ? html`<img class="display-image" src=${choice.image} alt="" />` : nothing}
            <span class="display-text">
              <span class="display-label">${choice.label}</span>
              ${
                choice.description
                  ? html`<span class="display-description">${choice.description}</span>`
                  : nothing
              }
            </span>
          </label>`,
      )}
    </div>
    ${helper ? html`<p class="hint">${helper}</p>` : nothing}
  </fieldset>`;
}

/** One layout's row under Layouts. */
export interface LayoutChoice extends DisplayChoice {
  /** The settings button's accessible name: "Grid Settings". */
  readonly settingsName: string;
}

/**
 * Layouts: a row per layout, each two targets side by side. The radio alone, in a zone of its
 * own at the start, picks the layout the card opens in; the rest of the row, the layout's picture,
 * name and description and a chevron, is one button that opens the layout's page and changes
 * nothing. The radios are one group, so the arrow keys move the choice as Starting Layout's did;
 * each row's button is a Tab stop of its own. The help sits above the rows, the note and Layout
 * Defaults below them.
 *
 * @param legend - The radio group's name: Starting Layout
 * @param help - The lines above the rows
 * @param choices - The layouts
 * @param value - The layout the card opens in
 * @param note - The line under the rows
 * @param after - What follows the note: Layout Defaults
 * @param onPick - A layout was picked to open the card in
 * @param onOpen - A layout's page was asked for
 * @returns The block's body
 */
export function layoutsControl(
  legend: string,
  help: TemplateResult,
  choices: ReadonlyArray<LayoutChoice>,
  value: string,
  note: string | undefined,
  after: TemplateResult,
  onPick: (view: string) => void,
  onOpen: (view: string) => void,
): TemplateResult {
  return html`<div class="layouts-help">${help}</div>
    <fieldset class="displays layouts">
      <legend class="visually-hidden">${legend}</legend>
      <div class="display-choices">
        ${choices.map(
          (choice) =>
            html`<div class="display-choice layout-choice">
              <label class="layout-pick">
                <input
                  type="radio"
                  name="view"
                  value=${choice.value}
                  data-focus=${`view:${choice.value}`}
                  aria-label=${choice.label}
                  .checked=${
                    // Compared with the radio as it is, not as Lit last set it.
                    live(choice.value === value)
                  }
                  @change=${() => onPick(choice.value)}
                />
              </label>
              <button
                type="button"
                class="layout-open"
                data-focus=${`layout:${choice.value}`}
                aria-label=${choice.settingsName}
                aria-describedby=${`layout-${choice.value}-description`}
                @click=${() => onOpen(choice.value)}
              >
                ${
                  choice.image
                    ? html`<img class="display-image" src=${choice.image} alt="" />`
                    : nothing
                }
                <span class="display-text">
                  <span class="display-label">${choice.label}</span>
                  ${
                    choice.description
                      ? html`<span
                          class="display-description"
                          id=${`layout-${choice.value}-description`}
                          >${choice.description}</span
                        >`
                      : nothing
                  }
                </span>
                ${icon(mdiChevronRight, 'nav-chevron')}
              </button>
            </div>`,
        )}
      </div>
      ${note ? html`<p class="hint">${note}</p>` : nothing}
    </fieldset>
    ${after}`;
}

/** One row that opens a page. */
export interface NavRow {
  /** `data-focus` key, so Back can return focus to it. */
  readonly key: string;
  readonly iconPath: string;
  readonly title: string;
  readonly summary?: string;
}

/**
 * A row that opens a page: its icon, title and one-line summary, and a chevron.
 *
 * @param row - What it shows
 * @param onOpen - It was activated
 * @returns The row
 */
export function navRow(row: NavRow, onOpen: () => void): TemplateResult {
  // The title names the row and the summary describes it, so a screen reader does not run the two
  // together ("Which Events Show Past Events: On").
  const id = `nav-${row.key.replace(/[^\w-]/g, '-')}`;
  return html`<button
    type="button"
    class="nav-row"
    data-focus=${row.key}
    aria-labelledby=${`${id}-title`}
    aria-describedby=${row.summary ? `${id}-summary` : nothing}
    ?data-quick-setup-open=${row.key === 'more:example'}
    @click=${onOpen}
  >
    ${icon(row.iconPath, 'nav-icon')}
    <span class="nav-text">
      <span class="nav-title" id=${`${id}-title`}>${row.title}</span>
      ${
        row.summary
          ? html`<span class="nav-summary" id=${`${id}-summary`}>${row.summary}</span>`
          : nothing
      }
    </span>
    ${icon(mdiChevronRight, 'nav-chevron')}
  </button>`;
}

/**
 * A titled group of rows on the overview: Settings, More.
 *
 * @param title - The heading
 * @param rows - Its rows
 * @param lead - What comes before the rows: Whole Card's line, under its heading
 * @returns The group
 */
export function rowGroup(
  title: string,
  rows: ReadonlyArray<TemplateResult>,
  lead: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  return html`<section class="row-group">
    <h3 class="heading" tabindex="-1">${title}</h3>
    ${lead}
    <div class="rows">${rows}</div>
  </section>`;
}

/**
 * Quick Setup's banner, on a fresh card: opening it, or dismissing it for the session. The two
 * are sibling buttons, since a button cannot hold another, inside one tinted frame (the D06
 * mockup): ✕ at its end, beside the banner's chevron.
 *
 * @param t - The editor's strings
 * @param onOpen - The banner was activated
 * @param onDismiss - Dismiss was pressed
 * @returns The banner
 */
export function quickSetupBanner(
  t: Translate,
  onOpen: () => void,
  onDismiss: () => void,
): TemplateResult {
  return html`<div class="quick-setup-entry">
    <button
      type="button"
      class="quick-setup-banner"
      data-quick-setup-open
      data-focus="quick-setup"
      aria-labelledby="quick-setup-name"
      aria-describedby="quick-setup-line"
      @click=${onOpen}
    >
      <span class="quick-setup-badge" aria-hidden="true">${icon(mdiCreation)}</span>
      <span class="quick-setup-text">
        <span class="quick-setup-name" id="quick-setup-name">${t('quick_setup.open')}</span>
        <span class="quick-setup-line" id="quick-setup-line">${t('quick_setup.open_note')}</span>
      </span>
      ${icon(mdiChevronRight, 'nav-chevron')}
    </button>
    <button
      type="button"
      class="icon-button quick-setup-dismiss"
      aria-label=${t('quick_setup.dismiss')}
      title=${t('quick_setup.dismiss')}
      @click=${onDismiss}
    >
      ${icon(mdiClose)}
    </button>
  </div>`;
}

/**
 * Start From an Example, under More: Quick Setup, always offered.
 *
 * @param t - The editor's strings
 * @param onOpen - It was activated
 * @returns The row
 */
export function exampleRow(t: Translate, onOpen: () => void): TemplateResult {
  return navRow(
    {
      key: 'more:example',
      iconPath: mdiCreation,
      title: t('more.example'),
      summary: t('more.example_note'),
    },
    onOpen,
  );
}
