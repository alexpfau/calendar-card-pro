/**
 * The element that scrolls the editor, found rather than named.
 *
 * Home Assistant's edit-card dialog nests the editor in more than one scrolling-capable
 * ancestor (`div.element-editor.ha-scrollbar` and `div.body.ha-scrollbar` at 1440 px,
 * `spike/ha-probe.md` §6), and which of them scrolls can change with the width and with Home
 * Assistant's version. So the editor walks up the flat tree from itself, through shadow roots
 * and slots, and takes the first ancestor that scrolls now; it asks again on every move.
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
 * Whether an element scrolls its content now.
 *
 * @param element - An element
 * @returns `true` when it scrolls vertically and has more to show than it fits
 */
function scrolls(element: Element): boolean {
  const overflow = getComputedStyle(element).overflowY;
  return (
    (overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight
  );
}

/**
 * The element that scrolls the editor: its nearest flat-tree ancestor that scrolls now, else
 * the document's scrolling element.
 *
 * @param editor - The editor element
 * @returns The scroll container, or `undefined` where nothing scrolls
 */
export function scrollContainer(editor: Element): Element | undefined {
  for (let at = flatParent(editor); at !== null; at = flatParent(at)) {
    if (scrolls(at)) return at;
  }
  return editor.ownerDocument.scrollingElement ?? undefined;
}
