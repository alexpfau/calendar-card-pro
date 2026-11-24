/**
 * Split This Calendar's templates: the row under Which Events, the task with
 * its stepper and three steps, a refusal, a part's card in Colors and in Review, and the panel a
 * split leaves. Templates only, as `calendars.ts`: each takes what it shows and what to call.
 *
 * What a split does and refuses is `split.ts`'s; what the review lists is `split-review.ts`'s.
 */

import { mdiAlertOutline, mdiCallSplit, mdiCheckCircleOutline, mdiChevronRight } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { type TextButton, textButton } from './calendars';
import { icon } from './icon';
import { wizardHead, wizardNote, wizardProgress } from './wizard';

/**
 * The row under Which Events that opens the task.
 *
 * @param title - "Split This Calendar"
 * @param helper - What it does
 * @param name - Its accessible name, "Split Ben"
 * @param onOpen - It was pressed
 * @returns The row
 */
export function splitRow(
  title: string,
  helper: string,
  name: string,
  onOpen: () => void,
): TemplateResult {
  return html`<button
    type="button"
    class="split-row"
    data-focus="split-row"
    aria-label=${name}
    @click=${onOpen}
  >
    ${icon(mdiCallSplit)}
    <span class="cal-text">
      <span class="cal-title">${title}</span>
      <span class="cal-summary">${helper}</span>
    </span>
    ${icon(mdiChevronRight, 'nav-chevron')}
  </button>`;
}

/** The task as one step draws it. */
export interface SplitTask {
  /** "Split This Calendar", the group's name. */
  readonly name: string;
  /** The steps' names: How, Colors, Review. */
  readonly steps: ReadonlyArray<string>;
  /** The step shown, counting from zero. */
  readonly step: number;
  /** "Step 1 of 3". */
  readonly stepOf: string;
  /** Cancel's name, for the close button. */
  readonly closeName: string;
  readonly onClose: () => void;
  /** "Split Ben", on every step. */
  readonly title: string;
  /** "Step 2 of 3 · Colors", under the title. */
  readonly stepLine: string;
  readonly intro: string;
  readonly body: unknown;
  /** Cancel on the first step, else Back. */
  readonly back: TextButton;
  /** Next, or Split on the last step. */
  readonly next: TextButton;
}

/**
 * The task in the wizards' shared look (`wizard.ts`): its header with the ✕, the progress bar, the
 * step's intro and body, and Back and Next above a divider.
 *
 * @param task - What it shows
 * @returns The task
 */
export function splitTask(task: SplitTask): TemplateResult {
  const last = task.step === task.steps.length - 1;
  return html`<div
    class="split-task wizard framed"
    role="group"
    aria-label=${task.name}
    data-split-step=${task.step}
  >
    ${wizardHead({
      iconPath: mdiCallSplit,
      title: task.title,
      titleClass: 'split-title',
      level: 4,
      stepLine: task.stepLine,
      stepClass: 'split-step-line',
      id: 'split',
      close: { name: task.closeName, focus: 'split-close', onPress: task.onClose },
    })}
    ${wizardProgress(task.steps, task.step, task.stepOf, 'split-steps')}
    <p class="hint">${task.intro}</p>
    ${task.body}
    <div class="split-actions wizard-actions">
      ${textButton(task.back)}
      <button
        type="button"
        class="text-button filled"
        data-focus=${task.next.focus}
        aria-label=${task.next.name ?? nothing}
        ?disabled=${task.next.disabled === true}
        @click=${task.next.onPress}
      >
        ${last ? icon(mdiCallSplit) : nothing}${task.next.label}
      </button>
    </div>
  </div>`;
}

/** A refusal: why, and the way out. */
export interface Refusal {
  readonly text: string;
  readonly action?: TextButton;
}

/**
 * A refusal's words and its way out, in the warning's shape.
 *
 * @param refusal - What it says
 * @param warning - Whether it stands above the methods, as the compact budget's does
 * @returns The block
 */
export function refusal(refusal: Refusal, warning = false): TemplateResult {
  return html`<div
    class="split-refusal${warning ? ' warning' : ''}"
    role=${warning ? 'alert' : nothing}
  >
    ${icon(mdiAlertOutline)}
    <div>
      <p>${refusal.text}</p>
      ${refusal.action ? textButton(refusal.action, ' link-button') : nothing}
    </div>
  </div>`;
}

/** One method of step 1. */
export interface Method {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly refusal?: Refusal;
  readonly onPick: () => void;
}

/**
 * Step 1's two methods, as radio cards: a refused one stays visible and disabled, its reason
 * and way out inside it.
 *
 * @param name - The group's name, "How"
 * @param methods - The methods
 * @returns The group
 */
export function methods(name: string, methods: ReadonlyArray<Method>): TemplateResult {
  return html`<div class="split-methods wizard-options" role="radiogroup" aria-label=${name}>
    ${methods.map(
      (method) =>
        html`<div
          class="split-method wizard-option${method.checked ? ' checked' : ''}${method.refusal ? ' refused' : ''}"
        >
          <label>
            <input
              type="radio"
              name="split-how"
              data-focus=${`split-how:${method.id}`}
              .checked=${method.checked}
              ?disabled=${method.refusal !== undefined}
              @change=${method.onPick}
            />
            <span class="cal-text">
              <span class="cal-title">${method.label}</span>
              <span class="cal-summary">${method.description}</span>
            </span>
          </label>
          ${method.refusal ? refusal(method.refusal) : nothing}
        </div>`,
    )}
  </div>`;
}

/** One part, as Colors and Review head it. */
export interface PartHead {
  /** "Ben · All-day events". */
  readonly title: string;
  /** "Part 1 of 2", or the rule and color in Review. */
  readonly sub: string;
  readonly color?: string;
  readonly badge?: string;
}

/**
 * A part's card: its dot, label and title, and what it holds.
 *
 * @param head - Its head
 * @param body - Its controls, or its review
 * @returns The card
 */
export function partCard(head: PartHead, body: unknown): TemplateResult {
  return html`<div class="split-part wizard-card">
    <div class="split-part-head">
      <span
        class="cal-dot"
        aria-hidden="true"
        style=${styleMap(head.color ? { '--cal-dot': head.color } : {})}
      ></span>
      ${head.badge ? html`<span class="cal-badge" aria-hidden="true">${head.badge}</span>` : nothing}
      <span class="cal-text">
        <span class="cal-title">${head.title}</span>
        <span class="cal-summary">${head.sub}</span>
      </span>
    </div>
    ${body}
  </div>`;
}

/**
 * What a part's review lists: its counts, its events or what stands in for them, and what it
 * writes.
 *
 * @param counts - "Days Ahead: 7 · Events: 1", absent while reading or after a failed read
 * @param lines - Its events, or the line saying there are none or that they could not be read
 * @param writes - "Writes Allowlist: Training, matching the event title", by words
 * @returns The block
 */
export function partReview(
  counts: string | undefined,
  lines: ReadonlyArray<string>,
  writes?: string,
): TemplateResult {
  return html`${counts ? html`<p class="split-counts">${counts}</p>` : nothing}
    <ul class="split-events">
      ${lines.map((line) => html`<li>${line}</li>`)}
    </ul>
    ${writes ? html`<p class="split-writes">${writes}</p>` : nothing}`;
}

/**
 * A note in the task's own voice.
 *
 * @param text - What it says
 * @returns The note
 */
export function note(text: string): TemplateResult {
  return wizardNote(text, 'split-note');
}

/** One entry the split wrote, as the completion panel lists it. */
export interface DoneRow {
  readonly key: number;
  readonly title: string;
  readonly summary: string;
  readonly tag: string;
  readonly color?: string;
  readonly badge?: string;
  readonly onOpen: () => void;
}

/**
 * The panel a split leaves at the top of the page: what happened, both entries as rows, then Undo
 * and Done. It takes focus as it opens.
 *
 * @param line - "Split Ben into 2 entries. This page now edits the first."
 * @param rows - The two entries
 * @param undo - Undo
 * @param done - Done
 * @returns The panel
 */
export function done(
  line: string,
  rows: ReadonlyArray<DoneRow>,
  undo: TextButton,
  doneButton: TextButton,
): TemplateResult {
  return html`<div class="split-done" role="status" tabindex="-1" data-focus="split-done">
    <p class="split-done-line">${icon(mdiCheckCircleOutline)}<span>${line}</span></p>
    ${rows.map(
      (row) =>
        html`<button
          type="button"
          class="cal-body split-done-row"
          data-focus=${`split-done:${row.key}`}
          @click=${row.onOpen}
        >
          <span
            class="cal-dot"
            aria-hidden="true"
            style=${styleMap(row.color ? { '--cal-dot': row.color } : {})}
          ></span>
          ${row.badge ? html`<span class="cal-badge" aria-hidden="true">${row.badge}</span>` : nothing}
          <span class="cal-text">
            <span class="cal-title">${row.title} <span class="tag">${row.tag}</span></span>
            ${row.summary === '' ? nothing : html`<span class="cal-summary">${row.summary}</span>`}
          </span>
          ${icon(mdiChevronRight, 'nav-chevron')}
        </button>`,
    )}
    <div class="split-actions">${textButton(undo)} ${textButton(doneButton, ' filled')}</div>
  </div>`;
}
