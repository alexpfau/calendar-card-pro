/**
 * What a page draws around its settings (backlog item 307): each setting's head row with its
 * state pill, ⓘ and chevron, the pill's menu with the notes and Reset, a setting a gate withholds
 * in its place, and the values stored for settings that are not in use. Templates only, as
 * `overview.ts`.
 */

import {
  mdiAlertCircleOutline,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiInformationOutline,
  mdiLinkVariant,
  mdiRestore,
} from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** A button of the editor's own, in a field's line or a heading's. */
export interface LineButton {
  readonly label: string;
  /** Its accessible name, where it is not its label. */
  readonly name?: string;
  readonly focus: string;
  readonly kind?: 'reset' | 'remove';
  /** The options a Reset or Remove deletes here, space-separated. */
  readonly resetKeys?: string;
  readonly onPress: () => void;
}

/**
 * A button in a line.
 *
 * @param button - What it shows
 * @returns The button
 */
export function lineButton(button: LineButton): TemplateResult {
  const glyph =
    button.kind === 'reset' ? mdiRestore : button.kind === 'remove' ? mdiClose : undefined;
  return html`<button
    type="button"
    class="text-button line-button"
    data-focus=${button.focus}
    aria-label=${button.name ?? nothing}
    data-reset-keys=${button.resetKeys || nothing}
    @click=${button.onPress}
  >
    ${glyph ? icon(glyph) : nothing}<span class="line-text">${button.label}</span>
  </button>`;
}

/** What the line under a live field shows. */
export interface FieldLine {
  /** Lines of their own: "Grid Sets Its Own: 20", the ignored All Layouts value. */
  readonly notes: ReadonlyArray<{ readonly text: string }>;
  /** "Set on Calendars:" with a link per entry. */
  readonly calendars?: { readonly label: string; readonly links: ReadonlyArray<LineButton> };
  /** Reset or Remove, named for what it leaves. */
  readonly actions: ReadonlyArray<LineButton>;
}

/**
 * The line under a live field: what it adds to the words in the form, and its actions.
 *
 * @param line - What it shows
 * @returns The line, or nothing where it has nothing to say
 */
export function fieldLine(line: FieldLine): TemplateResult | typeof nothing {
  if (line.notes.length === 0 && line.calendars === undefined && line.actions.length === 0) {
    return nothing;
  }
  return html`<div class="field-line">
    <div class="field-line-body">
      ${line.notes.map(
        (note) =>
          html`<p class="field-note">
            <span>${note.text}</span>
          </p>`,
      )}
      ${
        line.calendars
          ? html`<p class="field-note">
              <span>${line.calendars.label}</span>${line.calendars.links.map(lineButton)}
            </p>`
          : nothing
      }
      ${
        line.actions.length > 0
          ? html`<p class="field-note">${line.actions.map(lineButton)}</p>`
          : nothing
      }
    </div>
  </div>`;
}

/** A state pill's tone: outlined for Default, tinted for Set, gray for a value from elsewhere. */
export type PillTone = 'default' | 'set' | 'inherited' | 'warning';

/** A state pill: "Default", "Set", "From All Layouts", "From the Card". */
export interface Pill {
  readonly text: string;
  readonly tone: PillTone;
  /** Read by a screen reader but not drawn: a setting at its default shows no pill. */
  readonly quiet?: boolean;
}

/** The menu a pill opens: the notes and the Reset the line under a field used to hold. */
export interface PillMenu {
  readonly key: string;
  readonly open: boolean;
  readonly notes: ReadonlyArray<string>;
  readonly buttons: ReadonlyArray<LineButton>;
  readonly onToggle: () => void;
}

/** What a setting's head row shows. */
export interface SettingHead {
  readonly id: string;
  readonly label: string;
  /** The editor's language, so a long label breaks where that language puts spaces. */
  readonly lang?: string;
  /** Its value in words, while it is folded; never the pill's own word. */
  readonly value?: string;
  readonly pill: Pill;
  /**
   * A setting with one value for the whole card: a mark after its name, which says so to a
   * screen reader as well.
   */
  readonly wholeCard?: { readonly name: string };
  /** "Grid Has Its Own: 20", under All Layouts: a line of the head, under the name. */
  readonly own?: string;
  readonly menu?: PillMenu;
  /** The helper behind ⓘ, its button named "About {label}". */
  readonly help?: {
    readonly id: string;
    readonly name: string;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
  /** The chevron of a setting that folds; otherwise the slot is kept, so pills line up. */
  readonly fold?: { readonly key: string; readonly open: boolean; readonly onToggle: () => void };
  /**
   * Home Assistant's own control in place of the name, for a switch: its row, label and switch
   * start the head, and the pill and ⓘ follow it outside its box.
   */
  readonly control?: unknown;
}

/**
 * A setting's head row (backlog item 307): drawn the same folded and open, so nothing in it moves
 * when the setting opens. The name and, while folded, the value at the start, and under the name
 * what a layout keeps of its own; then the state pill, the chevron and ⓘ, each in a column of its
 * own width, so values, pills and ⓘ line up down the page. A switch spans the chevron's column. Home Assistant's control is drawn
 * below it while the setting is open, so nothing of the editor's sits inside Home Assistant's
 * field box. Where the setting folds the whole row is its toggle, except the pill and ⓘ, which
 * sit above it; while folded, the toggle is what `[data-field]` finds, as the control is once
 * open.
 *
 * @param head - What it shows
 * @returns The row, and the pill's menu while open
 */
export function settingHead(head: SettingHead): TemplateResult {
  const { menu, help, fold, pill, own, wholeCard } = head;
  // The value is isolated, so a color or a length reads in its own order right to left.
  const text = html`<span class="setting-name"
      ><span class="setting-label" lang=${head.lang ?? nothing}>${head.label}</span>${
        wholeCard
          ? html`<span
              class="setting-scope"
              role="img"
              aria-label=${wholeCard.name}
              title=${wholeCard.name}
              >⁠${icon(mdiLinkVariant)}</span
            >`
          : nothing
      }</span
    >${
      head.value === undefined
        ? nothing
        : html`<bdi class="setting-value${fold?.open ? ' setting-kept' : ''}">${head.value}</bdi>`
    }`;
  const pillEl = pill.quiet
    ? html`<span class="setting-pill tone-${pill.tone} visually-hidden">${pill.text}</span>`
    : menu
      ? html`<button
          type="button"
          class="setting-target setting-pill-button"
          data-focus=${menu.key}
          aria-expanded=${menu.open ? 'true' : 'false'}
          aria-label=${`${head.label}: ${pill.text}`}
          @click=${menu.onToggle}
        >
          <span class="setting-pill tone-${pill.tone}"
            >${pill.text}${icon(menu.open ? mdiChevronUp : mdiChevronDown)}</span
          >
        </button>`
      : html`<span class="setting-pill tone-${pill.tone}">${pill.text}</span>`;
  const accessible = [head.label, wholeCard?.name, head.value, own].filter(Boolean).join(', ');
  return html`<div
      class="setting-head${fold ? ' folds' : ''}${head.control !== undefined ? ' switch' : ''}${own ? ' owned' : ''}"
    >
      ${
        fold
          ? html`<button
              type="button"
              class="setting-text setting-toggle"
              data-focus=${fold.key}
              data-field=${fold.open ? nothing : head.id}
              aria-expanded=${fold.open ? 'true' : 'false'}
              aria-label=${accessible}
              @click=${fold.onToggle}
            >
              ${text}
            </button>`
          : head.control !== undefined
            ? html`<div class="setting-control">${head.control}</div>`
            : html`<span class="setting-text">${text}</span>`
      }
      ${own ? html`<span class="setting-own">${icon(mdiAlertCircleOutline)}<span>${own}</span></span>` : nothing}
      <span class="setting-tools">
        <span class="setting-pill-col${pill.quiet ? ' quiet' : ''}">${pillEl}</span>
        ${
          help
            ? html`<button
                type="button"
                class="setting-target setting-info"
                aria-expanded=${help.open ? 'true' : 'false'}
                aria-controls=${help.id}
                aria-label=${help.name}
                @click=${help.onToggle}
              >
                ${icon(mdiInformationOutline)}
              </button>`
            : // The slot is kept, so pills line up down the page.
              html`<span class="setting-slot" aria-hidden="true"></span>`
        }
        <span class="setting-end" aria-hidden="true"
          >${fold ? icon(fold.open ? mdiChevronUp : mdiChevronDown) : nothing}</span
        >
      </span>
    </div>
    ${
      menu?.open
        ? html`<div class="setting-menu" role="group" aria-label=${`${head.label}: ${pill.text}`}>
            ${menu.notes.map((note) => html`<p class="setting-menu-note">${note}</p>`)}
            ${menu.buttons.map(lineButton)}
          </div>`
        : nothing
    }`;
}

/**
 * A setting's helper, behind its ⓘ: always in the tree as the setting's accessible description,
 * and shown while ⓘ is pressed.
 *
 * @param id - Its element id
 * @param text - The helper
 * @param open - Whether it is shown
 * @returns The paragraph
 */
export function settingHelp(id: string, text: string, open: boolean): TemplateResult {
  return html`<p class="hint setting-help" id=${id} ?hidden=${!open}>${text}</p>`;
}

/**
 * A setting a gate withholds, in its place: its name and when it appears; several in a row
 * waiting on the same condition share one line.
 *
 * @param id - The first setting's field id, which a search lands on
 * @param text - "Indicator Size · Appears once …", or the shared gate line
 * @param label - The setting's name, for one setting alone
 * @returns The row
 */
export function gatedRow(id: string, text: string, label?: string): TemplateResult {
  return html`<div
    class="setting-gated"
    data-field=${id}
    tabindex="-1"
    role="group"
    aria-label=${label === undefined ? text : `${label}. ${text}`}
  >
    ${label === undefined ? nothing : html`<span class="setting-label">${label}</span>`}
    <span class="setting-gated-when">${text}</span>
  </div>`;
}

/**
 * A heading's gate line, "Appears once Show Description is on: Description Color.", and the
 * values stored for settings that are not in use, each with its Reset where one reaches it.
 *
 * @param gateLines - The gate lines, one per condition waited on
 * @param inactive - The stored lines
 * @returns The lines
 */
export function gateLines(
  gateLines: ReadonlyArray<string>,
  inactive: ReadonlyArray<{
    readonly text: string;
    readonly button?: LineButton;
    /** A line without a button: the `data-focus` key a search lands on. */
    readonly focus?: string;
  }>,
): TemplateResult | typeof nothing {
  if (gateLines.length === 0 && inactive.length === 0) return nothing;
  return html`${gateLines.map((line) => html`<p class="gate-line">${line}</p>`)}
  ${inactive.map(
    (line) =>
      html`<p
        class="gate-line inactive-line"
        data-focus=${line.focus ?? nothing}
        tabindex=${line.focus ? '-1' : nothing}
      >
        <span>${line.text}</span>${line.button ? lineButton(line.button) : nothing}
      </p>`,
  )}`;
}
