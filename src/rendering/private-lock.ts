/**
 * The lock a private event's Private follows (`EntityConfig.private`, `_privateTitle`). Hidden
 * from assistive technology, which reads the word after it.
 */

import { mdiLock } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

/**
 * The lock as an event row draws it: an icon label's own markup (`Leaves.renderLabel`), so every
 * view lays it out, sizes it and fits a title beside it as it does a calendar's icon label.
 *
 * @param color - The title's color, so the lock reads as part of it; unset, it inherits
 * @returns The lock
 */
export function renderRowLock(color?: string): TemplateResult {
  return html`<ha-icon
    icon="mdi:lock"
    class="label-icon private-lock"
    style=${color ? `color: ${color};` : nothing}
    aria-hidden="true"
  ></ha-icon>`;
}

/**
 * The lock as the event popover and the search panel draw it: inline, as they draw their other
 * icons, at the size of the text it leads (`.private-lock` in each one's styles).
 *
 * @returns The lock
 */
export function renderInlineLock(): TemplateResult {
  // One line, so the text of the title the lock leads is the word alone: whitespace inside the
  // svg draws nothing but is text all the same.
  // prettier-ignore
  return html`<svg class="private-lock" viewBox="0 0 24 24" aria-hidden="true"><path d=${mdiLock}></path></svg>`;
}
