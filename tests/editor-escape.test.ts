/**
 * What Escape does in the editor (`views/keys.ts` › `escapeAction`), over synthetic event paths
 * built the way Home Assistant's dialog builds them (`spike/ha-probe.md` §1): a dropdown's menu
 * and a picker's list box sit in shadow roots of their own below the editor, and Home
 * Assistant's dialog sits above it.
 */

import { describe, expect, it } from 'vitest';

import { type EscapeState, escapeAction, overlayOnPath } from '../src/rendering/editor/views/keys';

const IDLE: EscapeState = { disclosure: false, onPage: false, query: false };

/**
 * An editor host, inside a dialog as Home Assistant draws one, with a field of its own.
 *
 * @returns The host, its shadow root, and an input in it
 */
function editor(): { host: HTMLElement; root: ShadowRoot; input: HTMLInputElement } {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  dialog.setAttribute('role', 'dialog');
  const host = document.createElement('div');
  dialog.appendChild(host);
  document.body.appendChild(dialog);
  const root = host.attachShadow({ mode: 'open' });
  const input = document.createElement('input');
  root.appendChild(input);
  return { host, root, input };
}

/**
 * The composed path from a node up to the window, through shadow roots.
 *
 * @param node - Where the event starts
 * @returns The path
 */
function pathFrom(node: Node): EventTarget[] {
  const path: EventTarget[] = [];
  for (let at: Node | null = node; at !== null;) {
    path.push(at);
    at = at instanceof ShadowRoot ? at.host : at.parentNode;
  }
  path.push(window);
  return path;
}

/**
 * A Home Assistant control drawn in the editor's shadow root, with an overlay in a shadow root
 * of its own.
 *
 * @param root - The editor's shadow root
 * @param build - Builds the overlay in the control's shadow root
 * @returns The innermost element of the overlay, where focus sits
 */
function haControl(root: ShadowRoot, build: (shadow: ShadowRoot) => Element): Element {
  const form = document.createElement('ha-form');
  root.appendChild(form);
  const control = document.createElement('ha-select');
  form.appendChild(control);
  return build(control.attachShadow({ mode: 'open' }));
}

describe('Escape', () => {
  it('keeps an Escape that passed through a dropdown menu, and does nothing else', () => {
    const { host, root } = editor();
    const item = haControl(root, (shadow) => {
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      shadow.appendChild(menu);
      const option = document.createElement('div');
      option.setAttribute('role', 'menuitem');
      menu.appendChild(option);
      return option;
    });
    const path = pathFrom(item);
    expect(overlayOnPath(path, host)).toBe(true);
    // Even on a page with a disclosure open: the overlay closes itself, the editor stays put.
    expect(escapeAction(path, host, { disclosure: true, onPage: true, query: true })).toBe(
      'contain',
    );
  });

  it('keeps one that passed through a list box in a nested shadow root', () => {
    const { host, root } = editor();
    const input = haControl(root, (shadow) => {
      const picker = document.createElement('ha-picker-combo-box');
      shadow.appendChild(picker);
      const inner = picker.attachShadow({ mode: 'open' });
      const list = document.createElement('div');
      list.setAttribute('role', 'listbox');
      inner.appendChild(list);
      const field = document.createElement('input');
      list.appendChild(field);
      return field;
    });
    expect(escapeAction(pathFrom(input), host, { ...IDLE, onPage: true })).toBe('contain');
  });

  it('keeps one that passed through an open native dialog below the editor', () => {
    const { host, root } = editor();
    const input = haControl(root, (shadow) => {
      const popover = document.createElement('dialog');
      popover.setAttribute('open', '');
      shadow.appendChild(popover);
      const field = document.createElement('input');
      popover.appendChild(field);
      return field;
    });
    expect(escapeAction(pathFrom(input), host, IDLE)).toBe('contain');
  });

  it('ignores the dialog above the editor, which always holds it', () => {
    const { host, input } = editor();
    const path = pathFrom(input);
    expect(path.some((target) => target instanceof HTMLDialogElement)).toBe(true);
    expect(overlayOnPath(path, host)).toBe(false);
    expect(escapeAction(path, host, IDLE)).toBe('pass');
  });

  it('ignores a role the editor draws in its own shadow root', () => {
    const { host, root } = editor();
    const group = document.createElement('div');
    group.setAttribute('role', 'dialog');
    root.appendChild(group);
    const field = document.createElement('input');
    group.appendChild(field);
    expect(escapeAction(pathFrom(field), host, IDLE)).toBe('pass');
  });

  it('closes an open disclosure first, then goes Back, then clears the query', () => {
    const { host, input } = editor();
    const path = pathFrom(input);
    expect(escapeAction(path, host, { disclosure: true, onPage: true, query: true })).toBe('close');
    expect(escapeAction(path, host, { disclosure: false, onPage: true, query: true })).toBe('back');
    expect(escapeAction(path, host, { disclosure: false, onPage: false, query: true })).toBe(
      'clear',
    );
    expect(escapeAction(path, host, IDLE)).toBe('pass');
  });

  it('survives a browser without the Popover API', () => {
    const { host, root } = editor();
    const odd = document.createElement('div');
    root.appendChild(odd);
    const original = Element.prototype.matches;
    const unsupported = function (this: Element, selector: string): boolean {
      if (selector === ':popover-open') throw new SyntaxError('unsupported');
      return original.call(this, selector);
    };
    Element.prototype.matches = unsupported as typeof original;
    try {
      const control = haControl(root, (shadow) => {
        const plain = document.createElement('div');
        shadow.appendChild(plain);
        return plain;
      });
      expect(escapeAction(pathFrom(control), host, IDLE)).toBe('pass');
    } finally {
      Element.prototype.matches = original;
    }
  });
});
