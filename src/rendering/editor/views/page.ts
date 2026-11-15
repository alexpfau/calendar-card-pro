/**
 * A section page's frame: its header with Back and the page's own `h2`, its headings with their
 * helper lines and cross-links, and Back again at its foot. Templates only, as `overview.ts`.
 *
 * Every heading is the editor's own element, never a `constant` node inside a form: Home
 * Assistant does not expose those as headings to assistive technology (`spike/ha-probe.md` §3).
 */

import { mdiArrowRight, mdiChevronLeft, mdiInformationOutline } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';
import type { Translate } from './overview';

/**
 * The page's header: Back, then its title as the `h2` that takes focus as the page opens, then
 * Undo and Redo.
 *
 * @param title - The page's title
 * @param t - The editor's strings
 * @param onBack - Back was pressed
 * @param actions - What the header holds at its end
 * @returns The header
 */
export function pageHead(
  title: string,
  t: Translate,
  onBack: () => void,
  actions?: unknown,
): TemplateResult {
  return html`<div class="page-head">
    <button
      type="button"
      class="icon-button"
      data-focus="back-top"
      aria-label=${t('nav.back')}
      title=${t('nav.back')}
      @click=${onBack}
    >
      ${icon(mdiChevronLeft)}
    </button>
    <div class="page-titles">
      <h2 class="page-title" tabindex="-1">${title}</h2>
      <span class="page-sub">${t('overview.settings')}</span>
    </div>
    ${actions}
  </div>`;
}

/**
 * Back at the page's foot.
 *
 * @param t - The editor's strings
 * @param onBack - Back was pressed
 * @returns The button, above a rule
 */
export function footBack(t: Translate, onBack: () => void): TemplateResult {
  return html`<div class="page-foot">
    <button type="button" class="text-button" data-focus="back-foot" @click=${onBack}>
      ${icon(mdiChevronLeft)} ${t('nav.back')}
    </button>
  </div>`;
}

/**
 * A line in the page's own voice: the note a page opens with, or the line saying it applies to
 * the whole card.
 *
 * @param text - The line
 * @returns The line
 */
export function pageLine(text: string): TemplateResult {
  return html`<p class="page-line">${icon(mdiInformationOutline)}<span>${text}</span></p>`;
}

/** A link to a heading on another page. */
export interface CrossLink {
  /** The question it answers: "Dates of past days:". */
  readonly text: string;
  /** Where it goes: "Day Header › Past Days". */
  readonly label: string;
  readonly key: string;
  readonly onOpen: () => void;
}

/** One heading of a page and what it holds. */
export interface HeadingBlock {
  /** Absent for a page's unheaded top run. */
  readonly title?: string;
  /** The heading's `data-heading` key, which a cross-link scrolls to. */
  readonly key?: string;
  readonly helper?: string;
  readonly crossLink?: CrossLink;
  readonly body: unknown;
}

/**
 * One heading of a page, its helper line and cross-link, and the fields under it.
 *
 * @param block - What it shows
 * @returns The group
 */
export function headingBlock(block: HeadingBlock): TemplateResult {
  const link = block.crossLink;
  return html`<section class="page-group" data-heading=${block.key ?? ''}>
    ${block.title ? html`<h3 class="heading" tabindex="-1">${block.title}</h3>` : nothing}
    ${block.helper ? html`<p class="hint">${block.helper}</p>` : nothing}
    ${
      link
        ? html`<p class="page-line">
            ${icon(mdiArrowRight)}<span
              >${link.text}
              <button type="button" class="link" data-focus=${link.key} @click=${link.onOpen}>
                ${link.label}
              </button></span
            >
          </p>`
        : nothing
    }
    ${block.body}
  </section>`;
}
