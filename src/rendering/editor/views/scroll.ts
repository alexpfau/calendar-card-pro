/**
 * The element that scrolls the editor, found rather than named.
 *
 * Home Assistant's edit-card dialog nests the editor in more than one scrolling-capable
 * ancestor (`div.element-editor.ha-scrollbar` and `div.body.ha-scrollbar` at 1440 px,
 * `spike/ha-probe.md` §6), and which of them scrolls can change with the width and with Home
 * Assistant's version. So the editor walks up the flat tree from itself, through shadow roots
 * and slots, and takes the first ancestor that scrolls now; it asks again on every move.
 *
 * Where nothing scrolls now, because the page fits, it takes the nearest ancestor that can, and
 * reaches the document only where none can. In Home Assistant the document is the dashboard
 * behind the dialog: taken for a page that fits, every move to such a page scrolled the dashboard
 * by the page header's offset, and the position Back saved for that page was the dashboard's.
 */

/**
 * The next node up the flat tree: the slot an element is assigned to, else its parent, else
 * the host of the shadow root it sits in.
 *
 * @param node - An element
 * @returns Its flat-tree parent, or `null` at the top
 */
function flatParent(node: Element): Element | null {
  if (node.assignedSlot) return node.assignedSlot;
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * Whether an element scrolls its content vertically, by its style.
 *
 * @param element - An element
 * @returns `true` for `overflow-y: auto` or `scroll`
 */
function canScroll(element: Element): boolean {
  const overflow = getComputedStyle(element).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/**
 * Whether an element scrolls its content now.
 *
 * @param element - An element
 * @returns `true` when it scrolls vertically and has more to show than it fits
 */
function scrolls(element: Element): boolean {
  return canScroll(element) && element.scrollHeight > element.clientHeight;
}

/**
 * The element that scrolls the editor: its nearest flat-tree ancestor that scrolls now, else the
 * nearest that can scroll, else the document's scrolling element.
 *
 * @param editor - The editor element
 * @returns The scroll container, or `undefined` where nothing scrolls
 */
export function scrollContainer(editor: Element): Element | undefined {
  let able: Element | undefined;
  for (let at = flatParent(editor); at !== null; at = flatParent(at)) {
    if (scrolls(at)) return at;
    if (able === undefined && canScroll(at)) able = at;
  }
  return able ?? editor.ownerDocument.scrollingElement ?? undefined;
}
