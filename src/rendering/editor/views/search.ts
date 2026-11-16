/**
 * The jump list (D05 A): a status line with Edit Here, then a row per result with its label, the
 * match marked, a breadcrumb, its value, where the value comes from and, on request, its YAML
 * path, its tag and the phrase a helper-only match was found by. Each row is one action. One field of
 * several calendars is one row that opens to a row per calendar. With Edit Here on, a card
 * setting found is its live control under its breadcrumb. Templates only, as `overview.ts`.
 */

import { mdiChevronDown, mdiChevronRight, mdiKeyboardReturn, mdiOpenInNew } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { icon } from './icon';

type Marks = ReadonlyArray<readonly [number, number]>;

/** One result row. */
export interface ResultRow {
  /** Its `data-focus` key, which Back restores focus to. */
  readonly key: string;
  readonly label: string;
  /** Where the label shows the query. */
  readonly marks: Marks;
  readonly crumbs: ReadonlyArray<string>;
  /** "Not Set · Whole Card · YAML: list.day_spacing". */
  readonly meta: string;
  /** "Needs Show Description", "Only in List and Columns". */
  readonly tag?: string;
  /** A helper-only match's phrase, in its template: `Help: “{phrase}”`. */
  readonly phrase?: { readonly template: string; readonly text: string; readonly marks: Marks };
  /** Absent for a row that opens nothing: Home Assistant's tabs. */
  readonly onOpen?: () => void;
}

/** One calendar's row under a folded result. */
export interface EntryResultRow {
  readonly key: string;
  readonly label: string;
  readonly crumbs: ReadonlyArray<string>;
  readonly meta: string;
  readonly tag?: string;
  /** "Go to Setting". */
  readonly go: string;
  readonly onOpen: () => void;
}

/** What the list draws for one result. */
export type ResultItem =
  | { readonly kind: 'row'; readonly row: ResultRow }
  | {
      readonly kind: 'calendars';
      readonly row: ResultRow;
      readonly expanded: boolean;
      readonly entries: ReadonlyArray<EntryResultRow>;
    }
  | {
      readonly kind: 'field';
      readonly key: string;
      readonly crumbs: ReadonlyArray<string>;
      readonly field: TemplateResult;
    };

/**
 * Text with ranges marked.
 *
 * @param text - The text
 * @param marks - Ranges to mark
 * @returns The text
 */
function marked(text: string, marks: Marks): unknown {
  let at = 0;
  const parts: unknown[] = [];
  for (const [start, end] of marks) {
    parts.push(text.slice(at, start), html`<mark>${text.slice(start, end)}</mark>`);
    at = end;
  }
  parts.push(text.slice(at));
  return parts;
}

/**
 * A helper-only match's phrase in its template, the query marked.
 *
 * @param phrase - The phrase
 * @returns The line
 */
function phraseLine(phrase: NonNullable<ResultRow['phrase']>): unknown {
  const [before, after = ''] = phrase.template.split('{phrase}');
  return html`<span class="result-phrase"
    >${before}${marked(phrase.text, phrase.marks)}${after}</span
  >`;
}

/**
 * The words of a row: the label, the breadcrumb, the line under it, then its tag and phrase.
 *
 * @param row - The row
 * @returns Its text
 */
function rowText(row: ResultRow): TemplateResult {
  return html`<span class="nav-text">
    <span>${marked(row.label, row.marks)}</span>
    <span class="nav-summary">${row.crumbs.join(' › ')}</span>
    <span class="nav-summary">${row.meta}</span>
    ${row.tag ? html`<span class="result-tag">${row.tag}</span>` : nothing}
    ${row.phrase ? phraseLine(row.phrase) : nothing}
  </span>`;
}

/**
 * One result's row.
 *
 * @param row - The row
 * @param expanded - For a folded result, whether it is open
 * @returns The row
 */
function resultRow(row: ResultRow, expanded?: boolean): TemplateResult {
  if (row.onOpen === undefined) {
    return html`<div class="result result--info">
      <div class="nav-row" data-focus=${row.key}>
        ${icon(mdiOpenInNew, 'nav-chevron')} ${rowText(row)}
      </div>
    </div>`;
  }
  return html`<div class="result">
    <button
      type="button"
      class="nav-row"
      data-focus=${row.key}
      aria-expanded=${expanded === undefined ? nothing : String(expanded)}
      @click=${row.onOpen}
    >
      ${rowText(row)}
      ${icon(expanded === undefined ? mdiChevronRight : mdiChevronDown, 'nav-chevron')}
    </button>
  </div>`;
}

/**
 * The results: "Results for “color”: 42", "Values for Grid" beside it in a layout's scope, Edit
 * Here, and the results.
 *
 * @param head - The status line, the scope's line (absent for All Layouts) and Edit Here
 * @param head.status - The count line
 * @param head.values - The scope's line
 * @param head.editHere - The toggle's words, state and action
 * @param head.editHere.label - Its words
 * @param head.editHere.pressed - Whether it is on
 * @param head.editHere.onToggle - It was pressed
 * @param items - The results
 * @returns The list
 */
export function resultList(
  head: {
    readonly status: string;
    readonly values?: string;
    readonly editHere: {
      readonly label: string;
      readonly pressed: boolean;
      readonly onToggle: () => void;
    };
  },
  items: ReadonlyArray<ResultItem>,
): TemplateResult {
  return html`<div class="result-head">
      <p class="hint result-status">
        ${head.status}${head.values ? html`<span> · ${head.values}</span>` : nothing}
      </p>
      <button
        type="button"
        class="text-button"
        data-focus="edit-here"
        aria-pressed=${String(head.editHere.pressed)}
        @click=${head.editHere.onToggle}
      >
        ${head.editHere.label}
      </button>
    </div>
    <div class="row-group results">
      ${repeat(
        items,
        // Keyed by result: a field's form is never handed to another field's result, where a
        // change it sends late would write through the other field's frame.
        (item) => (item.kind === 'field' ? item.key : item.row.key),
        (item) => {
          if (item.kind === 'row') return resultRow(item.row);
          if (item.kind === 'field') {
            return html`<div class="result result--edit" data-result=${item.key}>
              <span class="nav-summary">${item.crumbs.join(' › ')}</span>
              ${item.field}
            </div>`;
          }
          return html`${resultRow(item.row, item.expanded)}
          ${item.entries.map(
            (entry) =>
              html`<button
                type="button"
                class="nav-row result-entry"
                data-focus=${entry.key}
                @click=${entry.onOpen}
              >
                <span class="nav-text">
                  <span>${entry.label}</span>
                  <span class="nav-summary">${entry.crumbs.join(' › ')}</span>
                  <span class="nav-summary">${entry.meta}</span>
                  ${entry.tag ? html`<span class="result-tag">${entry.tag}</span>` : nothing}
                </span>
                <span class="result-go">${entry.go}</span>
              </button>`,
          )}`;
        },
      )}
    </div>`;
}

/**
 * What a query that finds nothing shows: the message, a hint, and Clear Search.
 *
 * @param message - "Nothing matches “xyz”."
 * @param hint - What to try instead
 * @param clear - Clear Search
 * @param onClear - It was pressed
 * @returns The lines
 */
export function noMatches(
  message: string,
  hint: string,
  clear: string,
  onClear: () => void,
): TemplateResult {
  return html`<div class="filter-empty">
    <p>${message}</p>
    <p class="hint">${hint}</p>
    <button type="button" class="text-button" data-focus="clear-search" @click=${onClear}>
      ${clear}
    </button>
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
