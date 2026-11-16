/**
 * The editor's keys: what Escape does, decided from the event's path and the editor's own state.
 *
 * DOM-free except for reading the path the event took. Home Assistant's dialog closes on an
 * Escape that reaches it, and only an Escape both `preventDefault()`-ed and
 * `stopPropagation()`-ed stays inside the editor (`spike/ha-probe.md` §1: either alone lets the
 * dialog close), so every action except `pass` means the caller calls both.
 */

/** What Escape does. */
export type EscapeAction =
  /** A Home Assistant overlay is open on the path: keep the Escape, do nothing else. */
  | 'contain'
  /** Close the innermost disclosure the editor has open. */
  | 'close'
  /** Go Back one place. */
  | 'back'
  /** Clear the overview's query. */
  | 'clear'
  /** Let it through, and Home Assistant closes the dialog. */
  | 'pass';

/** What the editor has open, read from its own state, never from `aria-expanded`. */
export interface EscapeState {
  /** One of the editor's own disclosures is open. */
  readonly disclosure: boolean;
  /** The open place is not the overview. */
  readonly onPage: boolean;
  /** The overview holds a query. */
  readonly query: boolean;
}

const OVERLAY_ROLES: ReadonlySet<string> = new Set(['menu', 'listbox', 'dialog', 'alertdialog']);

/**
 * Whether an element is an open overlay: a menu, list box or dialog by role, an open
 * `<dialog>`, or an open popover. `:popover-open` throws where the Popover API is missing
 * (Safari before 17), so it is asked inside `try`.
 *
 * @param element - An element on the path
 * @returns `true` for an overlay
 */
function isOverlay(element: Element): boolean {
  if (OVERLAY_ROLES.has(element.getAttribute('role') ?? '')) return true;
  if (element.localName === 'dialog' && element.hasAttribute('open')) return true;
  try {
    return element.matches(':popover-open');
  } catch {
    return false;
  }
}

/**
 * Whether an Escape passed through a Home Assistant overlay on its way to the editor.
 *
 * The path is cut at the editor's host: everything above it carries an open `<dialog>` that is
 * Home Assistant's own edit-card dialog. Below it, only an element outside the editor's own
 * shadow root can be Home Assistant's: a picker, a dropdown or a popover a form drew.
 *
 * @param path - The event's `composedPath()`
 * @param host - The editor element
 * @returns `true` when an overlay is on the path
 */
export function overlayOnPath(path: ReadonlyArray<EventTarget>, host: Element): boolean {
  const own = host.shadowRoot;
  for (const target of path) {
    if (target === host) return false;
    if (!(target instanceof Element)) continue;
    if (target.getRootNode() !== own && isOverlay(target)) return true;
  }
  return false;
}

/**
 * What an Escape does, innermost first: a Home Assistant overlay keeps it; else the editor's
 * open disclosure closes; else a page goes Back; else the overview's query clears; else it goes
 * through, and Home Assistant closes the dialog.
 *
 * @param path - The event's `composedPath()`
 * @param host - The editor element
 * @param state - What the editor has open
 * @returns The action
 */
export function escapeAction(
  path: ReadonlyArray<EventTarget>,
  host: Element,
  state: EscapeState,
): EscapeAction {
  if (overlayOnPath(path, host)) return 'contain';
  if (state.disclosure) return 'close';
  if (state.onPage) return 'back';
  if (state.query) return 'clear';
  return 'pass';
}

/** Roles of an element that edits text, whose own Ctrl/Cmd+Z the editor leaves alone. */
const EDITING_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'combobox',
  'spinbutton',
  'searchbox',
]);

/**
 * Whether a key's path runs through anything that edits text: an input, a text area, editable
 * content, or an element in one of the roles that do.
 *
 * @param path - The event's composed path
 * @returns True to leave the key to it
 */
export function inTextField(path: ReadonlyArray<EventTarget>): boolean {
  return path.some(
    (target) =>
      target instanceof Element &&
      (target.localName === 'input' ||
        target.localName === 'textarea' ||
        target.hasAttribute('contenteditable') ||
        EDITING_ROLES.has(target.getAttribute('role') ?? '')),
  );
}

/**
 * What a key does to the editor's history: Ctrl/Cmd+Z undoes; Ctrl+Y and Ctrl/Cmd+Shift+Z redo.
 * Home Assistant's Ctrl+Shift+Y, which its code editor uses, is left alone, and so is every key
 * typed in a text field, whose own undo it is (ia-final §9).
 *
 * @param event - A `keydown`
 * @returns Which step to take, or undefined to let the key through
 */
export function historyKey(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'composedPath'
  >,
): 'undo' | 'redo' | undefined {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return undefined;
  const key = event.key.toLowerCase();
  const step =
    key === 'z'
      ? event.shiftKey
        ? 'redo'
        : 'undo'
      : key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey
        ? 'redo'
        : undefined;
  return step !== undefined && !inTextField(event.composedPath()) ? step : undefined;
}
