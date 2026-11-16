/**
 * What This Card Changes, drawn (section 5.10): a group per place the YAML stores lines, and a
 * compact row per line whose body is its Edit, with Reset and Go to Setting beside it. Templates
 * only, as `overview.ts`.
 */

import { mdiArrowRight, mdiRestore } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { icon } from './icon';

/** An icon button: its glyph, its name and its tooltip. */
export interface RowAction {
  readonly name: string;
  readonly title: string;
  readonly focus: string;
  readonly onPress: () => void;
}

/** One stored line, as its row shows it. */
export interface AuditRow {
  /** Its YAML path, which keys the row. */
  readonly path: string;
  readonly label: string;
  readonly value: string;
  /** Its state words, or what keeps it as written. */
  readonly words: string;
  /** "Same as the Default", "Home Assistant’s own, from the Layout tab". */
  readonly tags: ReadonlyArray<string>;
  /** "Not in Use until Show Description is on". */
  readonly warning?: string;
  /** Edit's name; absent for a line the editor keeps as written. */
  readonly edit?: { readonly name: string; readonly onPress: () => void };
  /** The field's control, while it is being edited. */
  readonly editing?: unknown;
  readonly reset?: RowAction;
  readonly go?: RowAction;
}

/**
 * An icon button of a row.
 *
 * @param action - What it does
 * @param glyph - Its icon
 * @returns The button
 */
function iconAction(action: RowAction | undefined, glyph: string): TemplateResult | typeof nothing {
  return action
    ? html`<button
        type="button"
        class="icon-button"
        data-focus=${action.focus}
        aria-label=${action.name}
        title=${action.title}
        @click=${action.onPress}
      >
        ${icon(glyph)}
      </button>`
    : nothing;
}

/**
 * One line's row: its label and value over its path, state words and tags, which as a whole is
 * Edit and gives way to the field's own control while edited, then Reset and Go to Setting. Edit
 * is named by the label and value, and described by the line under them.
 *
 * @param row - What it shows
 * @returns The row
 */
export function auditRow(row: AuditRow): TemplateResult {
  const text = html`<span class="audit-line"
    ><span>${row.label}</span><span class="audit-value">${row.value}</span></span
  >`;
  const metaId = `audit-meta:${row.path}`;
  const meta = html`<span class="audit-meta" id=${metaId}
    ><code>${row.path}</code> ·
    ${row.words}${row.tags.map(
      (tag) => html` <span class="tag">${tag}</span>`,
    )}${row.warning ? html` <span class="tag warning">${row.warning}</span>` : nothing}</span
  >`;
  return html`<div class="audit-row" data-audit=${row.path}>
    <div class="audit-text">
      ${
        row.editing === undefined && row.edit
          ? html`<button
              type="button"
              class="audit-edit"
              data-focus=${`edit:${row.path}`}
              aria-label=${row.edit.name}
              aria-describedby=${metaId}
              @click=${row.edit.onPress}
            >
              ${text} ${meta}
            </button>`
          : html`${row.editing ?? text} ${meta}`
      }
    </div>
    ${iconAction(row.reset, mdiRestore)}${iconAction(row.go, mdiArrowRight)}
  </div>`;
}

/** One group of the page. */
export interface AuditGroupView {
  /** `data-heading`, which See What Grid Keeps scrolls to. */
  readonly key: string;
  readonly title: string;
  /** "Set: 3". */
  readonly count: string;
  readonly note?: string;
  /** Reset All in Grid, Go to Anna. */
  readonly action?: {
    readonly label: string;
    readonly name?: string;
    readonly focus: string;
    readonly onPress: () => void;
  };
  readonly rows: ReadonlyArray<TemplateResult>;
  /** A calendar's group, under the Calendars heading. */
  readonly sub?: boolean;
  /** A calendar group's dot color, as its row on the overview draws it. */
  readonly color?: string;
  /** A calendar group's text or emoji label. */
  readonly badge?: string;
}

/**
 * A group: its title, count and action, the line under its title, and its rows. A calendar's
 * group leads with its dot and label, as its row on the overview does.
 *
 * @param group - What it shows
 * @returns The group
 */
export function auditGroup(group: AuditGroupView): TemplateResult {
  const action = group.action;
  return html`<section class="page-group audit-group" data-heading=${group.key}>
    <div class="audit-head">
      ${
        group.sub
          ? html`<span
                class="cal-dot"
                aria-hidden="true"
                style=${styleMap(group.color ? { '--cal-dot': group.color } : {})}
              ></span>
              ${
                group.badge
                  ? html`<span class="cal-badge" aria-hidden="true">${group.badge}</span>`
                  : nothing
              }
              <h4 class="heading" tabindex="-1">${group.title}</h4>`
          : html`<h3 class="heading" tabindex="-1">${group.title}</h3>`
      }
      <span class="audit-count">${group.count}</span>
      ${
        action
          ? html`<button
              type="button"
              class="text-button"
              data-focus=${action.focus}
              aria-label=${action.name ?? nothing}
              @click=${action.onPress}
            >
              ${action.label}
            </button>`
          : nothing
      }
    </div>
    ${group.note ? html`<p class="hint">${group.note}</p>` : nothing} ${group.rows}
  </section>`;
}
