/**
 * What This Card Changes, drawn: a group per place the YAML stores lines, and a
 * row per line, which is one button: pressed, it opens a strip under it with Change Here, Open in
 * the setting's page and Reset or Remove, as a calendar row's ⋮ does. A line the editor keeps as
 * written is a row with nothing to press. Templates only, as `overview.ts`.
 */

import { type TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { type StripAction, strip } from './calendars';

/** One stored line, as its row shows it. */
export interface AuditRow {
  /** Its YAML path, which keys the row. */
  readonly path: string;
  readonly label: string;
  readonly value: string;
  /** Its YAML path as shown, with Show YAML Option Names on. */
  readonly yaml?: string;
  /** "Same as the Default", "Home Assistant’s own, from the Layout tab". */
  readonly tags: ReadonlyArray<string>;
  /** A line each: "Grid Has Its Own: 5". */
  readonly lines?: ReadonlyArray<string>;
  /** "Not in Use until Show Description is on". */
  readonly warning?: string;
  /** The row's button and strip; absent for a line the editor keeps as written. */
  readonly menu?: {
    /** The button's name: "Past Date Opacity in Grid, 60%". */
    readonly name: string;
    /** The strip's name: "Actions for Past Date Opacity in Grid". */
    readonly stripName: string;
    readonly open: boolean;
    readonly onToggle: () => void;
    readonly actions: ReadonlyArray<StripAction>;
  };
  /** The field's control, while it is changed here. */
  readonly editing?: unknown;
}

/**
 * One line's row: its label and value over its YAML path (on request), tags and lines, which as a
 * whole is the button opening its strip, and gives way to the field's own control while changed
 * here. The button is named by the label and value, and described by the lines under them.
 *
 * @param row - What it shows
 * @returns The row
 */
export function auditRow(row: AuditRow): TemplateResult {
  const text = html`<span class="audit-line"
    ><span>${row.label}</span><span class="audit-value">${row.value}</span></span
  >`;
  const metaId = `audit-meta:${row.path}`;
  const lines = row.lines ?? [];
  const hasMeta =
    row.yaml !== undefined || row.tags.length > 0 || lines.length > 0 || row.warning !== undefined;
  const meta = hasMeta
    ? html`<span class="audit-meta" id=${metaId}
        >${row.yaml === undefined ? nothing : html`<code class="audit-path">${row.yaml}</code>`}${row.tags.map(
          (tag) => html` <span class="tag">${tag}</span>`,
        )}${row.warning ? html` <span class="tag warning">${row.warning}</span>` : nothing}${lines.map(
          (line) => html`<span class="audit-own">${line}</span>`,
        )}</span
      >`
    : nothing;
  const menu = row.menu;
  return html`<div class="audit-row" data-audit=${row.path}>
    ${
      row.editing === undefined && menu
        ? html`<button
            type="button"
            class="audit-edit"
            data-focus=${`more:audit:${row.path}`}
            aria-label=${menu.name}
            aria-describedby=${hasMeta ? metaId : nothing}
            aria-expanded=${String(menu.open)}
            @click=${menu.onToggle}
          >
            ${text} ${meta}
          </button>`
        : html`<div class="audit-text">${row.editing ?? text} ${meta}</div>`
    }
    ${menu?.open && row.editing === undefined ? strip(`audit:${row.path}`, menu.stripName, menu.actions) : nothing}
  </div>`;
}

/** One group of the page. */
export interface AuditGroupView {
  /** `data-heading`, which See What Grid Keeps scrolls to. */
  readonly key: string;
  readonly title: string;
  readonly note?: string;
  /** Reset All in Grid, Go to Anna. */
  readonly action?: {
    readonly label: string;
    readonly name?: string;
    readonly focus: string;
    readonly onPress: () => void;
  };
  /** Its rows, after the line a reset left in it, where one did. */
  readonly rows: ReadonlyArray<unknown>;
  /** A calendar's group, under the Calendars heading. */
  readonly sub?: boolean;
  /** A calendar group's dot color, as its row on the overview draws it. */
  readonly color?: string;
  /** A calendar group's text or emoji label. */
  readonly badge?: string;
}

/**
 * A group: its title and action, the line under its title, and its rows. A calendar's
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
