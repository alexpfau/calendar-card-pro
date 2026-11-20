/**
 * Undo and Redo as the overview's search row and every page header draw them, and the line a
 * removal or an applied story leaves behind ("Removed Ben · Undo").
 */

import { mdiRedo, mdiUndo } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** One of the two history buttons. */
export interface HistoryButton {
  /** Its name: "Undo: Remove Ben" while it can act, "Undo" while it cannot. */
  readonly label: string;
  readonly enabled: boolean;
  readonly onPress: () => void;
}

/**
 * Undo and Redo, as two icon buttons.
 *
 * @param undo - Undo
 * @param redo - Redo
 * @returns The pair
 */
export function historyControls(undo: HistoryButton, redo: HistoryButton): TemplateResult {
  const button = (each: HistoryButton, focus: string, path: string) =>
    html`<button
      type="button"
      class="icon-button history-button"
      data-focus=${focus}
      aria-label=${each.label}
      title=${each.label}
      ?disabled=${!each.enabled}
      @click=${each.onPress}
    >
      ${icon(path)}
    </button>`;
  return html`<div class="history-controls">
    ${button(undo, 'undo', mdiUndo)}${button(redo, 'redo', mdiRedo)}
  </div>`;
}

/**
 * The persistent line after a removal or an applied story, with its own Undo. It stays until the
 * next change.
 *
 * Its words reach a screen reader through the announcement queue, so it is not a live region of its
 * own (`announce.ts`).
 *
 * @param iconPath - What kind of change it was
 * @param text - What happened: "Removed Ben"
 * @param undoLabel - Its button's words
 * @param onUndo - Takes the change back
 * @returns The line
 */
export function statusBar(
  iconPath: string,
  text: string,
  undoLabel: string,
  onUndo: () => void,
): TemplateResult {
  return html`<div class="status-bar" data-status-bar>
    ${icon(iconPath)}<span class="status-text">${text}</span>
    <button type="button" class="text-button" data-focus="status-undo" @click=${onUndo}>
      ${undoLabel}
    </button>
  </div>`;
}

/**
 * The receipt the upgrade on opening leaves at the top of the overview: "Upgraded. Day Spacing
 * now applies to List, as before. The card looks the same." with Use It for Every Layout, until it
 * is, and Undo.
 *
 * @param receipt - Its title, sentences, share button and Undo
 * @param receipt.title - "Upgraded."
 * @param receipt.text - The sentences after it
 * @param receipt.share - Use Them for Every Layout, while they are List's
 * @param receipt.undoLabel - Undo's label
 * @param receipt.onUndo - Undo
 * @returns The receipt
 */
export function upgradeReceipt(receipt: {
  readonly title: string;
  readonly text: string;
  readonly share?: { readonly label: string; readonly onPress: () => void };
  readonly undoLabel: string;
  readonly onUndo: () => void;
}): TemplateResult {
  return html`<div class="status-bar upgrade-receipt" data-status-bar data-upgrade-receipt>
    <span class="status-text"><strong>${receipt.title}</strong> ${receipt.text}</span>
    <span class="upgrade-actions">
      ${
        receipt.share
          ? html`<button
              type="button"
              class="text-button"
              data-focus="upgrade-share"
              @click=${receipt.share.onPress}
            >
              ${receipt.share.label}
            </button>`
          : nothing
      }
      <button type="button" class="text-button" data-focus="status-undo" @click=${receipt.onUndo}>
        ${receipt.undoLabel}
      </button>
    </span>
  </div>`;
}
