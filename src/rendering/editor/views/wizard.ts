/**
 * The parts Quick Setup and Split This Calendar share, so the two step-by-step tasks look alike:
 * a header with a round badge, the task's heading and the step line under it, and a segmented
 * progress bar. Templates only; each task passes its own words, classes and actions.
 */

import { mdiClose, mdiInformationOutline } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** The header as a task draws it. */
export interface WizardHead {
  readonly iconPath: string;
  /** The heading: "Split Ben", "Quick Setup". */
  readonly title: string;
  /** The heading's own class, which focus and tests find it by. */
  readonly titleClass: string;
  /**
   * Its level: 2 where the task takes the editor's place, as Quick Setup does, 4 where it sits
   * among a page's headings, as Split does.
   */
  readonly level: 2 | 4;
  /** The step line: "Step 2 of 3 · Colors". */
  readonly stepLine: string;
  /** The step line's own class. */
  readonly stepClass: string;
  /** Ties the heading to its step line, so focus on the heading says which step this is. */
  readonly id: string;
  /** A ✕ at the header's end, where the task has one. */
  readonly close?: { readonly name: string; readonly focus: string; readonly onPress: () => void };
}

/**
 * The header: badge, heading and step line, and the ✕ where the task has one. The heading takes
 * focus as a step opens, and reads its step line as its description.
 *
 * @param head - What it shows
 * @returns The header
 */
export function wizardHead(head: WizardHead): TemplateResult {
  const stepId = `${head.id}-step`;
  const title =
    head.level === 2
      ? html`<h2
          class="wizard-title ${head.titleClass}"
          id=${`${head.id}-title`}
          tabindex="-1"
          aria-describedby=${stepId}
        >
          ${head.title}
        </h2>`
      : html`<h4
          class="wizard-title ${head.titleClass}"
          id=${`${head.id}-title`}
          tabindex="-1"
          aria-describedby=${stepId}
        >
          ${head.title}
        </h4>`;
  return html`<div class="wizard-head">
    <span class="wizard-badge" aria-hidden="true">${icon(head.iconPath)}</span>
    <div class="wizard-titles">
      ${title}
      <p class="wizard-step ${head.stepClass}" id=${stepId}>${head.stepLine}</p>
    </div>
    ${
      head.close
        ? html`<button
            type="button"
            class="icon-button wizard-close"
            data-focus=${head.close.focus}
            aria-label=${head.close.name}
            title=${head.close.name}
            @click=${head.close.onPress}
          >
            ${icon(mdiClose)}
          </button>`
        : nothing
    }
  </div>`;
}

/**
 * The progress bar: one segment per step, filled up to the step shown. Each segment carries its
 * step's name for assistive technology, and the shown step is `aria-current`.
 *
 * @param steps - The steps' names
 * @param step - The step shown, counting from zero
 * @param label - The list's name: "Step 2 of 3"
 * @param className - The task's own class for the list
 * @returns The bar
 */
export function wizardProgress(
  steps: ReadonlyArray<string>,
  step: number,
  label: string,
  className: string,
): TemplateResult {
  return html`<ol class="wizard-progress ${className}" aria-label=${label}>
    ${steps.map(
      (name, at) =>
        html`<li
          class=${at < step ? 'done' : at === step ? 'current' : ''}
          aria-current=${at === step ? 'step' : nothing}
        >
          <span class="visually-hidden">${name}</span>
        </li>`,
    )}
  </ol>`;
}

/**
 * A note in the task's own voice, tinted, with its icon.
 *
 * @param text - What it says
 * @param className - The task's own class for it
 * @returns The note
 */
export function wizardNote(text: string, className = ''): TemplateResult {
  return html`<p class="page-line wizard-note ${className}">
    ${icon(mdiInformationOutline)}<span>${text}</span>
  </p>`;
}
