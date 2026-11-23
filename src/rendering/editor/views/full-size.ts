/**
 * Full Size's list of what `overlay:` holds beyond the page's own settings: a row per line, its
 * setting and value over its YAML path (on request), and Remove under them, as a setting's line
 * carries Reset. Drawn as Stored Settings draws a line the editor keeps, so a YAML-made override is
 * in sight. Templates only, as `overview.ts`.
 */

import { type TemplateResult, html, nothing } from 'lit';

import { type LineButton, fieldLine } from './shown';

/** One line of `overlay:`, as its row shows it. */
export interface FullSizeRow {
  /** Its YAML path inside the card, which keys the row: `overlay.toolbar.search`. */
  readonly path: string;
  /** Its setting's name, "Days To Show in Grid", or the YAML path where no setting writes it. */
  readonly label: string;
  readonly value: string;
  /** Its YAML path as shown, with Show YAML Option Names on. */
  readonly yaml?: string;
  readonly remove: LineButton;
}

/**
 * One line's row.
 *
 * @param row - What it shows
 * @returns The row
 */
export function fullSizeRow(row: FullSizeRow): TemplateResult {
  return html`<div class="audit-row" data-full-size=${row.path}>
    <div class="audit-text">
      <span class="audit-line"
        ><span>${row.label}</span><span class="audit-value">${row.value}</span></span
      >
      ${
        row.yaml === undefined
          ? nothing
          : html`<span class="audit-meta"><code class="audit-path">${row.yaml}</code></span>`
      }
    </div>
    ${fieldLine({ notes: [], actions: [row.remove] })}
  </div>`;
}
