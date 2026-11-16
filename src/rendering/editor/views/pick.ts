/**
 * Pick From Preview in the preview itself: finding the card Home Assistant's dialog shows beside
 * the editor, swallowing its gestures while a pick is on, and outlining the part under the pointer.
 *
 * Nothing here names a Home Assistant element. The card is found by its own tag, `preview` set, in
 * the shadow root that holds the editor's own host, which is Home Assistant's card dialog: its
 * preview sits there beside the editor, the card a light child of what wraps it on a masonry
 * dashboard, and one shadow root further down on a sections dashboard, where the preview is a
 * section holding the card. So the search looks two shadow roots up from the editor at most, and
 * one down from each; a dashboard's own cards, which also run in preview while it is edited, sit
 * far deeper and are never reached. Where no card is found, the editor draws no Pick From Preview
 * button at all.
 *
 * Home Assistant rebuilds the preview's card element on every change in preview mode, so the
 * picker never holds on to one: it watches the card's parent and follows the replacement.
 */

import { mdiCursorDefaultClickOutline } from '@mdi/js';
import { type TemplateResult, css, html } from 'lit';

import { icon } from './icon';
import { PICK_PARTS, type PickTarget } from '../pick';

/** The card's own tag, which the build renames with the card (`rollup.config.mjs`). */
export const CARD_TAG = 'calendar-card-pro-dev';

/** How many shadow roots up from the editor the preview is looked for. */
const LEVELS = 2;

/** The gestures a pick swallows before the card sees them. */
const SWALLOWED = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'dblclick',
  'contextmenu',
  'keydown',
] as const;

/** Of those, the ones whose default is prevented too; never a touch, so the preview still scrolls. */
const PREVENTED: ReadonlySet<string> = new Set(['mousedown', 'dblclick', 'contextmenu']);

/**
 * The outline's look, inside the card's shadow root while a pick is on. Written as `css` so the
 * build collapses it as it does the editor's own stylesheet.
 */
const STYLE = css`
  * {
    cursor: pointer !important;
  }
  .ccp-pick-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 10;
  }
  .ccp-pick-box {
    position: absolute;
    box-sizing: border-box;
    border-radius: 6px;
    border: 2px solid var(--primary-color, #03a9f4);
  }
  .ccp-pick-label {
    position: absolute;
    box-sizing: border-box;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
    font: 500 11px/16px var(--ha-font-family-body, inherit);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`.cssText;

/**
 * The card in Home Assistant's dialog preview, where it is found.
 *
 * @param from - The editor
 * @param tag - The card's tag
 * @returns The card, or `undefined`
 */
export function findPreviewCard(from: Element, tag = CARD_TAG): HTMLElement | undefined {
  let node: Node = from;
  for (let level = 0; level < LEVELS; level++) {
    const root = node.getRootNode();
    // Never the document: a dashboard's own cards are not the preview.
    if (!(root instanceof ShadowRoot)) return undefined;
    const card = previewIn(root, tag, node);
    if (card) return card;
    node = root.host;
  }
  return undefined;
}

/**
 * A card in preview in a shadow root, or one shadow root below it.
 *
 * @param root - Where to look
 * @param tag - The card's tag
 * @param skip - The editor's own side, which holds no preview
 * @param down - How many more shadow roots to look into
 * @returns The card, or `undefined`
 */
function previewIn(root: ShadowRoot, tag: string, skip: Node, down = 1): HTMLElement | undefined {
  for (const card of root.querySelectorAll<HTMLElement & { preview?: boolean }>(tag)) {
    if (card.preview === true && card.shadowRoot) return card;
  }
  if (down === 0) return undefined;
  for (const each of root.querySelectorAll('*')) {
    if (each === skip || !each.shadowRoot) continue;
    const card = previewIn(each.shadowRoot, tag, skip, down - 1);
    if (card) return card;
  }
  return undefined;
}

/** A part found under the pointer. */
export interface PickedPart {
  readonly target: PickTarget;
  /** The element that matched, which the outline follows. */
  readonly element: Element;
}

/**
 * The part an event's path reaches first, innermost out.
 *
 * @param path - `composedPath()`
 * @param card - The card, where the search stops
 * @returns The part, or `undefined` outside the card's parts
 */
export function partOn(path: ReadonlyArray<EventTarget>, card?: Element): PickedPart | undefined {
  for (const each of path) {
    if (each === card) return undefined;
    if (!(each instanceof Element)) continue;
    for (const [selector, target] of PICK_PARTS) {
      if (each.matches(selector)) return { target, element: each };
    }
  }
  return undefined;
}

/** What the picker asks of the editor. */
export interface PickerHooks {
  /** The words on the outline: "Events › Location · Click to Edit". */
  label(part: PickedPart, touch: boolean): string;
  /** A part was picked. */
  pick(part: PickedPart): void;
  /** Escape in the preview. */
  cancel(): void;
  /** Where the preview is now, for when Home Assistant replaces the card. */
  find(): HTMLElement | undefined;
}

/**
 * The pick while it is on: listeners, a style and the outline in the card's shadow root, all
 * taken away again by `detach`.
 */
export class PreviewPicker {
  private _card?: HTMLElement;
  private _layer?: HTMLElement;
  private _style?: HTMLStyleElement;
  private _watch?: MutationObserver;
  private _shown?: Element;
  private _touch = false;

  constructor(private readonly _hooks: PickerHooks) {}

  /**
   * Starts on a card, or moves to it from the one it was on.
   *
   * @param card - The preview's card
   */
  attach(card: HTMLElement): void {
    if (card === this._card) return;
    this.detach();
    const root = card.shadowRoot!;
    this._card = card;
    this._style = document.createElement('style');
    this._style.textContent = STYLE;
    this._layer = document.createElement('div');
    this._layer.className = 'ccp-pick-layer';
    this._layer.setAttribute('aria-hidden', 'true');
    root.append(this._style, this._layer);
    for (const type of SWALLOWED) root.addEventListener(type, this._swallow, true);
    root.addEventListener('click', this._click, true);
    root.addEventListener('pointermove', this._move, { capture: true, passive: true });
    card.addEventListener('pointerleave', this._leave);
    window.addEventListener('scroll', this._scrolled, { capture: true, passive: true });
    if (card.parentNode) {
      this._watch = new MutationObserver(this._replaced);
      this._watch.observe(card.parentNode, { childList: true });
    }
  }

  /** Ends the pick, leaving the card as it was. */
  detach(): void {
    const card = this._card;
    if (!card) return;
    const root = card.shadowRoot!;
    for (const type of SWALLOWED) root.removeEventListener(type, this._swallow, true);
    root.removeEventListener('click', this._click, true);
    root.removeEventListener('pointermove', this._move, true);
    card.removeEventListener('pointerleave', this._leave);
    window.removeEventListener('scroll', this._scrolled, true);
    this._watch?.disconnect();
    this._style?.remove();
    this._layer?.remove();
    this._card = this._layer = this._style = this._watch = this._shown = undefined;
  }

  private _swallow = (event: Event): void => {
    if (event.type === 'pointerdown') this._touch = (event as PointerEvent).pointerType === 'touch';
    // A key's default still runs, so Tab moves through the preview and Enter on a button clicks
    // it, which picks; only the card's own key handling is kept out.
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') this._hooks.cancel();
    event.stopPropagation();
    if (PREVENTED.has(event.type)) event.preventDefault();
  };

  private _click = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
    const part = partOn(event.composedPath(), this._card);
    if (!part) return;
    // No hover on a touch screen: the first tap outlines the part, a second on it opens it.
    if (this._touch && part.element !== this._shown) {
      this._show(part);
      return;
    }
    this._hooks.pick(part);
  };

  private _move = (event: Event): void => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    this._touch = false;
    const part = partOn(event.composedPath(), this._card);
    if (part) this._show(part);
    else this._hide();
  };

  private _leave = (event: Event): void => {
    if ((event as PointerEvent).pointerType !== 'touch') this._hide();
  };

  private _scrolled = (): void => {
    if (this._shown && this._card) {
      const part = partOn([this._shown], this._card);
      if (part) this._show(part);
    }
  };

  private _replaced = (): void => {
    const card = this._hooks.find();
    if (card && card !== this._card) this.attach(card);
  };

  private _hide(): void {
    this._shown = undefined;
    this._layer?.replaceChildren();
  }

  /**
   * Outlines a part and labels it, placed by measuring against the layer's own containing
   * block, so a transformed or scrolled dialog places it right.
   *
   * @param part - The part
   */
  private _show(part: PickedPart): void {
    const layer = this._layer;
    if (!layer) return;
    this._shown = part.element;
    const origin = layer.getBoundingClientRect();
    const rect = part.element.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'ccp-pick-box';
    const label = document.createElement('div');
    label.className = 'ccp-pick-label';
    label.textContent = this._hooks.label(part, this._touch);
    const left = rect.left - origin.left;
    const top = rect.top - origin.top;
    Object.assign(box.style, {
      left: `${left - 2}px`,
      top: `${top - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
    });
    // Above the part, or inside its top edge where the card has no room above it, and never
    // past the card's end.
    const card = this._card!.getBoundingClientRect();
    Object.assign(label.style, {
      left: `${left - 2}px`,
      top: `${top - 2 - (rect.top - card.top >= 18 ? 18 : 0)}px`,
      maxWidth: `${Math.max(card.right - rect.left, 48)}px`,
    });
    layer.replaceChildren(box, label);
  }
}

/**
 * The Pick From Preview button, beside Undo and Redo, pressed while a pick is on.
 *
 * @param label - Its name and tooltip
 * @param on - Whether a pick is on
 * @param onPress - Turns it on or off
 * @returns The button
 */
export function pickButton(label: string, on: boolean, onPress: () => void): TemplateResult {
  return html`<button
    type="button"
    class="icon-button history-button pick-button"
    data-focus="pick"
    aria-label=${label}
    aria-pressed=${on ? 'true' : 'false'}
    title=${label}
    @click=${onPress}
  >
    ${icon(mdiCursorDefaultClickOutline)}
  </button>`;
}

/**
 * The line that says a pick is on, with Cancel.
 *
 * @param text - What to do now
 * @param cancel - Cancel's words
 * @param onCancel - Ends the pick
 * @returns The line
 */
export function pickBanner(text: string, cancel: string, onCancel: () => void): TemplateResult {
  return html`<div class="status-bar pick-banner" role="status" data-pick-banner>
    ${icon(mdiCursorDefaultClickOutline)}<span class="status-text">${text}</span>
    <button type="button" class="text-button" data-focus="pick-cancel" @click=${onCancel}>
      ${cancel}
    </button>
  </div>`;
}

/**
 * Whether the device has no hover, so a pick is a tap and the outline comes on the first one.
 *
 * @returns True on a touch screen
 */
export function touchOnly(): boolean {
  return window.matchMedia?.('(hover: none)').matches ?? false;
}
