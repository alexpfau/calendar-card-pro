/**
 * The composed color control (D13): closed, a swatch of the color in use, its name and what is
 * chosen; open, the field's own rows, Home Assistant's named swatches and Custom, with the YAML
 * line under them. A template only: what each row means and writes is the element's
 * (`colors.ts`, `element.ts`).
 */

import { mdiCheck, mdiClose, mdiHomeAssistant, mdiMenuDown, mdiMenuUp, mdiPalette } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** One row above the swatches. */
export interface ColorRow {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  /** The color its swatch shows; else Home Assistant's mark, for Follow Home Assistant. */
  readonly color?: string;
  readonly onPick: () => void;
}

/** One of Home Assistant's named colors. */
export interface ColorSwatch {
  readonly token: string;
  readonly name: string;
  readonly color: string;
  readonly checked: boolean;
  readonly onPick: () => void;
}

/** Everything the control shows. */
export interface ColorControlView {
  /** The radio group's name and the base of its ids, unique on the page. */
  readonly id: string;
  /** What Escape and Undo focus: the closed control's button. */
  readonly focusKey: string;
  /** The field's name: "Accent Color". */
  readonly name: string;
  /** The choice's name: "Pink". */
  readonly value: string;
  /** The button's accessible name: "Accent Color, Pink". */
  readonly accessibleName: string;
  /** The color its swatch shows; undefined for one the card cannot draw, shown crossed out. */
  readonly color?: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** ✕ beside an entry's own color. */
  readonly remove?: { readonly label: string; readonly onRemove: () => void };
  readonly rows: ReadonlyArray<ColorRow>;
  readonly swatchesLabel: string;
  readonly swatches: ReadonlyArray<ColorSwatch>;
  readonly custom: {
    readonly label: string;
    readonly description: string;
    readonly checked: boolean;
    readonly onPick: () => void;
  };
  /** Custom's text field, while Custom is chosen: the form, its live swatch and its flag. */
  readonly field?: {
    readonly form: TemplateResult;
    readonly color?: string;
    readonly invalid?: string;
  };
  /** The field's helper, under the control. */
  readonly helper?: string;
  /** Its state words, under the helper. */
  readonly words?: string;
  /** The configuration as written: the line, or what stands for none, and the kept note. */
  readonly yaml: { readonly line?: string; readonly none: string; readonly kept?: string };
}

/**
 * A round swatch, crossed out where there is no color to show.
 *
 * @param color - The CSS color, if any
 * @param extra - A class beside `color-dot`
 * @returns The swatch
 */
function dot(color: string | undefined, extra = ''): TemplateResult {
  return color === undefined
    ? html`<span class="color-dot crossed ${extra}" aria-hidden="true"></span>`
    : html`<span class="color-dot ${extra}" style="--dot: ${color}" aria-hidden="true"></span>`;
}

/**
 * The control.
 *
 * @param view - What it shows
 * @returns The control
 */
export function colorControl(view: ColorControlView): TemplateResult {
  const radio = (checked: boolean, onPick: () => void, label?: string) =>
    html`<input
      type="radio"
      name=${view.id}
      aria-label=${label ?? nothing}
      .checked=${checked}
      @change=${onPick}
    />`;
  return html`<div class="color-control${view.open ? ' open' : ''}">
    <div class="color-head">
      <button
        type="button"
        class="color-toggle"
        data-focus=${view.focusKey}
        aria-expanded=${view.open ? 'true' : 'false'}
        aria-label=${view.accessibleName}
        @click=${view.onToggle}
      >
        ${dot(view.color)}
        <span class="color-text">
          <span class="color-name">${view.name}</span>
          <span class="color-value">${view.value}</span>
        </span>
        ${icon(view.open ? mdiMenuUp : mdiMenuDown)}
      </button>
      ${
        view.remove
          ? html`<button
              type="button"
              class="icon-button"
              aria-label=${view.remove.label}
              @click=${view.remove.onRemove}
            >
              ${icon(mdiClose)}
            </button>`
          : nothing
      }
    </div>
    ${
      view.open
        ? html`<fieldset class="color-panel">
            <legend class="live-region">${view.name}</legend>
            ${view.rows.map(
              (row) =>
                html`<label class="color-row" data-color-row=${row.key}>
                  ${radio(row.checked, row.onPick)}
                  ${
                    row.color === undefined
                      ? html`<span class="color-mark">${icon(mdiHomeAssistant)}</span>`
                      : dot(row.color)
                  }
                  <span class="display-text">
                    <span class="color-row-label">${row.label}</span>
                    ${
                      row.description
                        ? html`<span class="display-description">${row.description}</span>`
                        : nothing
                    }
                  </span>
                </label>`,
            )}
            <fieldset class="color-swatches">
              <legend class="live-region">${view.swatchesLabel}</legend>
              ${view.swatches.map(
                (swatch) =>
                  html`<label
                    class="color-swatch"
                    data-swatch=${swatch.token}
                    style="--dot: ${swatch.color}"
                  >
                    ${radio(swatch.checked, swatch.onPick, swatch.name)}
                    <span class="color-dot" aria-hidden="true">
                      ${swatch.checked ? icon(mdiCheck) : nothing}
                    </span>
                    <span class="color-tip" aria-hidden="true">${swatch.name}</span>
                  </label>`,
              )}
            </fieldset>
            <label class="color-row" data-color-row="custom">
              ${radio(view.custom.checked, view.custom.onPick)}
              <span class="color-mark">${icon(mdiPalette)}</span>
              <span class="display-text">
                <span class="color-row-label">${view.custom.label}</span>
                <span class="display-description">${view.custom.description}</span>
              </span>
            </label>
            ${
              view.field
                ? html`<div class="color-custom">
                    ${dot(view.field.color, 'live')} ${view.field.form}
                    ${
                      view.field.invalid
                        ? html`<p class="color-invalid" role="status">${view.field.invalid}</p>`
                        : nothing
                    }
                  </div>`
                : nothing
            }
            <p class="color-yaml">
              <span class="color-yaml-label">YAML</span>
              ${
                view.yaml.line === undefined
                  ? html`<span>${view.yaml.none}</span>`
                  : html`<code>${view.yaml.line}</code>`
              }
              ${view.yaml.kept ? html`<span class="hint color-kept">${view.yaml.kept}</span>` : nothing}
            </p>
          </fieldset>`
        : nothing
    }
    ${view.helper ? html`<p class="hint">${view.helper}</p>` : nothing}
    ${view.words ? html`<p class="hint color-words">${view.words}</p>` : nothing}
  </div>`;
}
