/**
 * The jump list (D05 A): a status line, then a row per result with its label, the match marked,
 * a breadcrumb, its value and its YAML path. Choosing a row opens its page at the field, where
 * Return to Results goes back. Templates only, as `overview.ts`.
 */

import { mdiChevronRight, mdiKeyboardReturn } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** One result row. */
export interface ResultRow {
  /** Its `data-focus` key, which Back restores focus to. */
  readonly key: string;
  readonly label: string;
  /** Where the label shows the query. */
  readonly marks: ReadonlyArray<readonly [number, number]>;
  readonly crumbs: ReadonlyArray<string>;
  /** Absent where the value has no words. */
  readonly value?: string;
  /** "YAML: list.day_spacing". */
  readonly yaml: string;
  readonly onOpen: () => void;
}

/**
 * A label with the query marked.
 *
 * @param label - The label
 * @param marks - Ranges to mark
 * @returns The label
 */
function marked(label: string, marks: ResultRow['marks']): unknown {
  let at = 0;
  const parts: unknown[] = [];
  for (const [start, end] of marks) {
    parts.push(label.slice(at, start), html`<mark>${label.slice(start, end)}</mark>`);
    at = end;
  }
  parts.push(label.slice(at));
  return parts;
}

/**
 * The results: "Results for “color”: 42", "Values for Grid" beside it in a layout's scope, and
 * the rows.
 *
 * @param status - The count line
 * @param values - The scope's line, or `undefined` for Shared
 * @param rows - The rows
 * @returns The list
 */
export function resultList(
  status: string,
  values: string | undefined,
  rows: ReadonlyArray<ResultRow>,
): TemplateResult {
  return html`<p class="hint result-status">
      ${status}${values ? html`<span> · ${values}</span>` : nothing}
    </p>
    <div class="row-group">
      ${rows.map(
        (row) =>
          html`<button type="button" class="nav-row" data-focus=${row.key} @click=${row.onOpen}>
            <span class="nav-text">
              <span>${marked(row.label, row.marks)}</span>
              <span class="nav-summary">${row.crumbs.join(' › ')}</span>
              <span class="nav-summary"
                >${row.value === undefined ? row.yaml : `${row.value} · ${row.yaml}`}</span
              >
            </span>
            ${icon(mdiChevronRight, 'nav-chevron')}
          </button>`,
      )}
    </div>`;
}

/**
 * Return to Results, above the field a result opened.
 *
 * @param text - Its words
 * @param onReturn - It was pressed
 * @returns The button
 */
export function returnButton(text: string, onReturn: () => void): TemplateResult {
  return html`<button
    type="button"
    class="text-button return"
    data-focus="return"
    @click=${onReturn}
  >
    ${icon(mdiKeyboardReturn)} ${text}
  </button>`;
}
