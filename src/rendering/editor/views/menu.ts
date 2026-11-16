/**
 * The overview header's ⋯ menu, which holds the editor's preferences (Show Every Setting, Show YAML
 * Option Names): a menu button and, open, a menu of checkbox items. Templates and the keys a menu
 * answers, as `reorder.ts` holds its own: Down and Up move between the items and wrap, Home and End
 * reach the ends, Escape closes it with focus back on the button, and Tab closes it and lets focus
 * move on. Down or Up on the button opens it at the first or last item.
 */

import { mdiCheck, mdiDotsHorizontal } from '@mdi/js';
import { type TemplateResult, html, nothing } from 'lit';

import { icon } from './icon';

/** One checkbox item. */
export interface MenuCheck {
  /** Its `data-pref`, which a test names it by. */
  readonly key: string;
  readonly label: string;
  /** The line under it, which describes it. */
  readonly note?: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

/** What the menu shows. */
export interface MenuModel {
  /** The button's name: "Editor Preferences". */
  readonly name: string;
  readonly open: boolean;
  readonly items: ReadonlyArray<MenuCheck>;
  /** Opens or closes it; `at` names the item to focus as it opens. */
  readonly onOpen: (open: boolean, at?: 'first' | 'last') => void;
}

/** The menu's id, which its button controls. */
const MENU_ID = 'prefs-menu';

/**
 * The items of the menu holding an element.
 *
 * @param from - An element inside the menu's wrapper
 * @returns The items, in order
 */
function itemsOf(from: Element): HTMLElement[] {
  return [
    ...(from.closest('.menu-wrap')?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
  ];
}

/**
 * Moves focus among a menu's items, or closes it, for one key.
 *
 * @param event - The key
 * @param onOpen - Opens or closes the menu
 */
function menuKey(event: KeyboardEvent, onOpen: MenuModel['onOpen']): void {
  const target = event.target as HTMLElement;
  const items = itemsOf(target);
  const at = items.indexOf(target);
  let next: number | undefined;
  switch (event.key) {
    case 'ArrowDown':
      next = (at + 1) % items.length;
      break;
    case 'ArrowUp':
      next = (at - 1 + items.length) % items.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = items.length - 1;
      break;
    case 'Escape':
      event.preventDefault();
      // Inside Home Assistant's dialog, Escape would close the dialog as well.
      event.stopPropagation();
      onOpen(false);
      target.closest('.menu-wrap')?.querySelector<HTMLElement>('.menu-button')?.focus();
      return;
    case 'Tab':
      onOpen(false);
      return;
    default:
      return;
  }
  event.preventDefault();
  items[next]?.focus();
}

/**
 * The ⋯ button and, while open, its menu of checkbox items under it, each with the line that
 * describes it. Pressing an item turns it over and leaves the menu open; focus leaving the menu
 * closes it.
 *
 * @param menu - What it shows
 * @returns The button and its menu
 */
export function prefsMenu(menu: MenuModel): TemplateResult {
  return html`<div
    class="menu-wrap"
    @focusout=${(event: FocusEvent) => {
      const wrap = event.currentTarget as HTMLElement;
      const to = event.relatedTarget as Node | null;
      if (menu.open && (to === null || !wrap.contains(to))) menu.onOpen(false);
    }}
  >
    <button
      type="button"
      class="icon-button menu-button"
      data-focus="prefs-menu"
      aria-label=${menu.name}
      title=${menu.name}
      aria-haspopup="menu"
      aria-expanded=${String(menu.open)}
      aria-controls=${MENU_ID}
      @click=${() => menu.onOpen(!menu.open, 'first')}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        menu.onOpen(true, event.key === 'ArrowDown' ? 'first' : 'last');
      }}
    >
      ${icon(mdiDotsHorizontal)}
    </button>
    ${
      menu.open
        ? html`<div
            class="menu"
            id=${MENU_ID}
            role="menu"
            aria-label=${menu.name}
            @keydown=${(event: KeyboardEvent) => menuKey(event, menu.onOpen)}
            @mousedown=${(event: MouseEvent) => event.preventDefault()}
          >
            ${menu.items.map((item) => {
              const id = `menu-${item.key}`;
              return html`<button
                type="button"
                class="menu-item"
                role="menuitemcheckbox"
                tabindex="-1"
                data-pref=${item.key}
                aria-checked=${String(item.checked)}
                aria-labelledby=${`${id}-label`}
                aria-describedby=${item.note ? `${id}-note` : nothing}
                @click=${item.onToggle}
              >
                <span class="menu-check" aria-hidden="true"
                  >${item.checked ? icon(mdiCheck) : nothing}</span
                >
                <span class="menu-text">
                  <span id=${`${id}-label`}>${item.label}</span>
                  ${
                    item.note
                      ? html`<span class="menu-note" id=${`${id}-note`}>${item.note}</span>`
                      : nothing
                  }
                </span>
              </button>`;
            })}
          </div>`
        : nothing
    }
  </div>`;
}

/**
 * Focuses an item of the open menu.
 *
 * @param root - The editor's shadow root
 * @param at - The first or the last item
 */
export function focusMenuItem(root: ParentNode, at: 'first' | 'last'): void {
  const items = [...root.querySelectorAll<HTMLElement>('.menu [role^="menuitem"]')];
  (at === 'first' ? items[0] : items[items.length - 1])?.focus();
}
