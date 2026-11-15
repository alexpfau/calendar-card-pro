/**
 * The overview's own controls: Quick Setup's banner, Settings For, Card Displays, the section
 * rows and More. Templates only: each takes what it shows and what to call, holds no state and
 * reaches nothing in the element (AGENTS.md, _Editor_: `views/` is where the editor's Lit
 * templates live outside `element.ts`).
 */

import { mdiChevronRight, mdiClose, mdiCreation } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';
import { interpolate } from '../strings';
import type { EditorWorkspace } from '../workspace';

/** Resolves one of the editor's own strings by its literal key. */
export type Translate = (key: string) => string;

/** One choice of Settings For. */
export interface ScopeChoice {
  readonly value: EditorWorkspace;
  readonly label: string;
  /** Values the YAML stores there, shown as "Set: N" when there are any. */
  readonly set: number;
}

/** What Settings For shows. */
export interface ScopeModel {
  readonly compact: boolean;
  readonly workspace: EditorWorkspace;
  readonly choices: ReadonlyArray<ScopeChoice>;
  /** The label of the layout the card displays, for the preview line. */
  readonly displayedLabel: string;
  /** Whether the scope is a layout the card does not display, so the preview shows another. */
  readonly previewDiffers: boolean;
}

/**
 * A template with one placeholder drawn bold, as "Settings for **List**".
 *
 * @param template - The sentence, holding `{layout}`
 * @param value - What fills it
 * @returns The sentence
 */
function withBold(template: string, value: string): TemplateResult {
  const [before, after = ''] = template.split('{layout}');
  return html`${before}<b>${value}</b>${after}`;
}

/**
 * Settings For: one compact line, "Settings for List · Change", or the four choices with what
 * each stores, a line on what the chosen one means, and the preview line where the card shows
 * another layout. Native radios, so arrow keys move within the group and focus stays on the
 * chosen one; choosing writes nothing.
 *
 * @param model - What it shows
 * @param t - The editor's strings
 * @param onChange - Change was pressed
 * @param onPick - A scope was chosen
 * @returns The control
 */
export function scopeControl(
  model: ScopeModel,
  t: Translate,
  onChange: () => void,
  onPick: (workspace: EditorWorkspace) => void,
): TemplateResult {
  const current = model.choices.find((choice) => choice.value === model.workspace);
  const name = current?.label ?? '';
  if (model.compact) {
    return html`<div class="scope scope-compact">
      <span class="scope-line">${withBold(t('settings_for.compact'), name)}</span>
      <button
        type="button"
        class="text-button"
        data-focus="scope-change"
        aria-label=${interpolate(t('settings_for.change_named'), { layout: name })}
        @click=${onChange}
      >
        ${t('settings_for.change')}
      </button>
    </div>`;
  }
  const help =
    model.workspace === 'shared'
      ? t('settings_for.help_shared')
      : interpolate(t('settings_for.help_layout'), { layout: name });
  return html`<fieldset class="scope">
    <legend class="label">${t('settings_for.label')}</legend>
    <div class="scope-choices">
      ${model.choices.map(
        (choice) =>
          html`<label class="scope-choice">
            <input
              type="radio"
              name="scope"
              value=${choice.value}
              data-focus=${`scope:${choice.value}`}
              .checked=${choice.value === model.workspace}
              aria-label=${
                choice.set > 0
                  ? interpolate(t('settings_for.option_set'), {
                      layout: choice.label,
                      count: String(choice.set),
                    })
                  : choice.label
              }
              @change=${() => onPick(choice.value)}
            />
            <span>${choice.label}</span>
            ${
              choice.set > 0
                ? html`<span class="scope-count" aria-hidden="true"
                    >${interpolate(t('summary.set'), { count: String(choice.set) })}</span
                  >`
                : nothing
            }
          </label>`,
      )}
    </div>
    <p class="hint">${help}</p>
    ${
      model.previewDiffers
        ? html`<p class="hint scope-preview">
            ${interpolate(t('settings_for.preview'), {
              layout: name,
              displayed: model.displayedLabel,
            })}
          </p>`
        : nothing
    }
  </fieldset>`;
}

/** One illustrated choice of Card Displays. */
export interface DisplayChoice {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly image?: string;
}

/**
 * Card Displays: the three illustrated layouts as native radios, labels that wrap, and today's
 * helper line.
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
    <legend class="label">${label}</legend>
    <div class="display-choices">
      ${choices.map(
        (choice) =>
          html`<label class="display-choice">
            <input
              type="radio"
              name="view"
              value=${choice.value}
              data-focus=${`view:${choice.value}`}
              .checked=${choice.value === value}
              @change=${() => onPick(choice.value)}
            />
            <span class="display-text">
              <span class="display-label">${choice.label}</span>
              ${
                choice.description
                  ? html`<span class="display-description">${choice.description}</span>`
                  : nothing
              }
            </span>
            ${choice.image ? html`<img class="display-image" src=${choice.image} alt="" />` : nothing}
          </label>`,
      )}
    </div>
    ${helper ? html`<p class="hint">${helper}</p>` : nothing}
  </fieldset>`;
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
  return html`<button
    type="button"
    class="nav-row"
    data-focus=${row.key}
    ?data-quick-setup-open=${row.key === 'more:example'}
    @click=${onOpen}
  >
    ${icon(row.iconPath, 'nav-icon')}
    <span class="nav-text">
      <span class="nav-title">${row.title}</span>
      ${row.summary ? html`<span class="nav-summary">${row.summary}</span>` : nothing}
    </span>
    ${icon(mdiChevronRight, 'nav-chevron')}
  </button>`;
}

/**
 * A titled group of rows on the overview: Settings, More.
 *
 * @param title - The heading
 * @param rows - Its rows
 * @returns The group
 */
export function rowGroup(title: string, rows: ReadonlyArray<TemplateResult>): TemplateResult {
  return html`<section class="row-group">
    <h3 class="heading" tabindex="-1">${title}</h3>
    <div class="rows">${rows}</div>
  </section>`;
}

/**
 * Quick Setup's banner, on a fresh card: opening it, or dismissing it for the session.
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
      @click=${onOpen}
    >
      <span class="quick-setup-badge" aria-hidden="true">${icon(mdiCreation)}</span>
      <span class="quick-setup-text">
        <span class="quick-setup-name">${t('quick_setup.open')}</span>
        <span class="quick-setup-line">${t('quick_setup.open_note')}</span>
      </span>
    </button>
    <button
      type="button"
      class="icon-button"
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
