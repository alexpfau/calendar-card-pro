/**
 * What a page draws around its settings (backlog item 307): each setting's head row with its
 * facts, Reset or Remove, chevron and ⓘ, the line under its control, a setting a gate
 * withholds in its place, and the values stored for settings that are not in use. Templates only,
 * as `overview.ts`.
 */

import {
  mdiAlertCircleOutline,
  mdiArrowUp,
  mdiCalendarMultiple,
  mdiCardTextOutline,
  mdiChevronDown,
  mdiChevronRight,
  mdiChevronUp,
  mdiClose,
  mdiFormatListBulleted,
  mdiInformationOutline,
  mdiRestore,
  mdiSubdirectoryArrowRight,
  mdiTimelineClockOutline,
  mdiToggleSwitchOffOutline,
  mdiViewColumnOutline,
} from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';
import type { Fact } from '../shown';

/** A button of the editor's own, in a field's line or a heading's. */
export interface LineButton {
  readonly label: string;
  /** Its accessible name, where it is not its label. */
  readonly name?: string;
  readonly focus: string;
  /** Its glyph: Reset, Remove, Turn On a part, or go up to the control a heading waits on. */
  readonly kind?: 'reset' | 'remove' | 'turn-on' | 'go-up';
  /** The options a Reset or Remove deletes here, space-separated. */
  readonly resetKeys?: string;
  readonly onPress: () => void;
}

/** Each kind of line button's glyph. */
const GLYPHS: Readonly<Record<NonNullable<LineButton['kind']>, string>> = {
  reset: mdiRestore,
  remove: mdiClose,
  'turn-on': mdiToggleSwitchOffOutline,
  'go-up': mdiArrowUp,
};

/**
 * A button in a line.
 *
 * @param button - What it shows
 * @returns The button
 */
export function lineButton(button: LineButton): TemplateResult {
  const glyph = button.kind === undefined ? undefined : GLYPHS[button.kind];
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
  /** Lines of their own. */
  readonly notes: ReadonlyArray<{ readonly text: string }>;
  /** "Set on Calendars:" with a link per entry. */
  readonly calendars?: { readonly label: string; readonly links: ReadonlyArray<LineButton> };
  /** Reset or Remove, named for what it leaves. */
  readonly actions: ReadonlyArray<LineButton>;
  /** A control without a head row of its own (the overview's): its facts, first. */
  readonly facts?: ReadonlyArray<Fact>;
}

/**
 * The line under a live field: its facts where it has no head row, with Reset or Remove after Set,
 * a button in plain view named for what it leaves, and the calendars that store their own.
 *
 * @param line - What it shows
 * @returns The line, or nothing where it has nothing to say
 */
export function fieldLine(line: FieldLine): TemplateResult | typeof nothing {
  const facts = line.facts ?? [];
  if (
    facts.length === 0 &&
    line.notes.length === 0 &&
    line.calendars === undefined &&
    line.actions.length === 0
  ) {
    return nothing;
  }
  // Where the facts are drawn here, Reset or Remove joins them, after Set.
  const inFacts = line.facts !== undefined && line.actions.length > 0;
  return html`<div class="field-line">
    <div class="field-line-body">
      ${facts.length > 0 || inFacts ? factLine(facts, inFacts ? line.actions : []) : nothing}
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
        line.actions.length > 0 && !inFacts
          ? html`<p class="field-note">${line.actions.map(lineButton)}</p>`
          : nothing
      }
    </div>
  </div>`;
}

const LAYOUT_ICONS: Readonly<Record<string, string>> = {
  list: mdiFormatListBulleted,
  column: mdiViewColumnOutline,
  grid: mdiTimelineClockOutline,
};

/**
 * One fact, in the form of its kind, none of them pressable: Set as a dot and the word; a scope
 * as the words after an icon of what it reaches; a source as the words after ↳; a layout's value
 * as the words after that layout's icon, on a line of its own.
 *
 * @param fact - The fact
 * @returns The fact
 */
function factView(fact: Fact): TemplateResult {
  switch (fact.kind) {
    case 'set':
      return html`<span class="fact fact-set setting-state">${fact.text}</span>`;
    case 'scope':
      return html`<span class="fact fact-scope"
        >${icon(fact.entries ? mdiCalendarMultiple : mdiCardTextOutline)}<span
          >${fact.text}</span
        ></span
      >`;
    case 'source':
      return html`<span class="fact fact-source setting-state"
        >${icon(mdiSubdirectoryArrowRight)}<span>${fact.text}</span></span
      >`;
    case 'layout':
      return html`<span class="fact fact-layout"
        >${icon(LAYOUT_ICONS[fact.view ?? ''] ?? mdiTimelineClockOutline)}<span
          >${fact.text}</span
        ></span
      >`;
  }
}

/**
 * A setting's facts, as one block: the first line holds Set, the scope and the source; each
 * layout's value takes a line of its own. Reset or Remove follows Set, or leads where nothing says
 * Set, on the side away from ⓘ: a button among the facts, never drawn as one of them.
 *
 * @param facts - The facts
 * @param actions - Reset or Remove
 * @returns The block
 */
export function factLine(
  facts: ReadonlyArray<Fact>,
  actions: ReadonlyArray<LineButton> = [],
): TemplateResult {
  const set = facts.findIndex((fact) => fact.kind === 'set');
  const at = set < 0 ? 0 : set + 1;
  return html`<div class="setting-facts${actions.length > 0 ? ' has-actions' : ''}">
    ${facts.slice(0, at).map(factView)}${actions.map(lineButton)}${facts.slice(at).map(factView)}
  </div>`;
}

/** What a setting's head row shows. */
export interface SettingHead {
  readonly id: string;
  readonly label: string;
  /** The editor's language, so a long label breaks where that language puts spaces. */
  readonly lang?: string;
  /** Its value in words, while it is folded. */
  readonly value?: string;
  /** What it says under its name: Set, what it reaches, where its value comes from. */
  readonly facts: ReadonlyArray<Fact>;
  /** Reset or Remove, after Set. */
  readonly actions?: ReadonlyArray<LineButton>;
  /** "Default", read by a screen reader where no fact says Set or where a value comes from. */
  readonly quiet?: string;
  /** The helper behind ⓘ, its button named "About {label}". */
  readonly help?: {
    readonly id: string;
    readonly name: string;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
  /** The chevron of a setting that folds; otherwise the slot is kept, so ⓘ lines up. */
  readonly fold?: { readonly key: string; readonly open: boolean; readonly onToggle: () => void };
  /**
   * Home Assistant's own control in place of the name, for a switch: its row, label and switch
   * span the name and chevron columns, so every switch ends where the chevrons end.
   */
  readonly control?: unknown;
}

/**
 * A setting's head row (backlog item 307): drawn the same folded and open, so nothing in it moves
 * when the setting opens. The name and, while folded, the value; the chevron; ⓘ at the row's end;
 * and under the name its facts, none of which can be pressed, with Reset or Remove after Set. A
 * stored setting never folds, so its Reset is always in plain view. Home Assistant's control is drawn below
 * the head while the setting is open, so nothing of the editor's sits inside Home Assistant's field
 * box. Where the setting folds the whole row is its toggle, except ⓘ, which sits above it; while
 * folded, the toggle is what `[data-field]` finds, as the control is once open.
 *
 * @param head - What it shows
 * @returns The row
 */
export function settingHead(head: SettingHead): TemplateResult {
  const { help, fold, facts } = head;
  const actions = head.actions ?? [];
  // The value is isolated, so a color or a length reads in its own order right to left.
  const text = html`<span class="setting-name"
      ><span class="setting-label" lang=${head.lang ?? nothing}>${head.label}</span></span
    >${
      head.value === undefined
        ? nothing
        : html`<bdi class="setting-value${fold?.open ? ' setting-kept' : ''}">${head.value}</bdi>`
    }`;
  const accessible = [head.label, ...facts.map((fact) => fact.text), head.value]
    .filter(Boolean)
    .join(', ');
  return html`<div
    class="setting-head${fold ? ' folds' : ''}${head.control !== undefined ? ' switch' : ''}${
      facts.length > 0 || actions.length > 0 ? ' has-facts' : ''
    }"
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
    <span class="setting-tools">
      <span class="setting-end" aria-hidden="true"
        >${fold ? icon(fold.open ? mdiChevronUp : mdiChevronDown) : nothing}</span
      >
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
          : // The slot is kept, so ⓘ lines up down the page.
            html`<span class="setting-slot" aria-hidden="true"></span>`
      }
    </span>
    ${facts.length > 0 || actions.length > 0 ? factLine(facts, actions) : nothing}
    ${
      head.quiet === undefined
        ? nothing
        : html`<span class="setting-state visually-hidden">${head.quiet}</span>`
    }
  </div>`;
}

/** A whole-card setting a topic names, and the page it is at home on. */
export interface ReferenceRow {
  readonly id: string;
  readonly label: string;
  /** The editor's language, so a long label breaks where that language puts spaces. */
  readonly lang?: string;
  /** Its value in words. */
  readonly value?: string;
  /** Whole Card and the page: "Whole Card · Events, Weather & Language". */
  readonly facts: ReadonlyArray<Fact>;
  /** "First Day Of Week: Monday. Whole Card. Opens Events, Weather & Language." */
  readonly name: string;
  readonly onOpen: () => void;
}

/**
 * A whole-card setting named on a topic whose home is a Whole Card page: drawn as its folded head
 * row would be, its name, value and facts, with a chevron pointing on rather than down, since the
 * whole row opens the setting at home. It carries no `data-field`, so what finds a setting by its
 * field, search's landing and Pick From Preview among them, finds it at home alone.
 *
 * @param row - What it shows
 * @returns The row
 */
export function referenceRow(row: ReferenceRow): TemplateResult {
  return html`<div class="setting reference" data-reference=${row.id}>
    <div class="setting-head folds${row.facts.length > 0 ? ' has-facts' : ''}">
      <button
        type="button"
        class="setting-text setting-toggle"
        data-focus=${`reference:${row.id}`}
        aria-label=${row.name}
        @click=${row.onOpen}
      >
        <span class="setting-name"
          ><span class="setting-label" lang=${row.lang ?? nothing}>${row.label}</span></span
        >${row.value === undefined ? nothing : html`<bdi class="setting-value">${row.value}</bdi>`}
      </button>
      <span class="setting-tools">
        <span class="setting-end" aria-hidden="true">${icon(mdiChevronRight)}</span>
        <span class="setting-slot" aria-hidden="true"></span>
      </span>
      ${row.facts.length > 0 ? factLine(row.facts) : nothing}
    </div>
  </div>`;
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
        ${icon(mdiAlertCircleOutline)}<span>${line.text}</span>${line.button ? lineButton(line.button) : nothing}
      </p>`,
  )}`;
}
