/**
 * A deep copy of a node with every comment removed, for comparing rendered markup.
 *
 * Lit leaves comment markers through everything it renders, and a test reading `innerHTML` or
 * `outerHTML` usually wants them gone. Removing the `Comment` nodes, rather than matching their
 * text in the serialization, is exact by construction: every element, attribute and text node
 * serializes as it did, so the markup differs from the original only by its comments. A regex
 * over the serialization has to guess where a comment ends, and CodeQL reports a single pass of
 * one as incomplete sanitization (js/incomplete-multi-character-sanitization).
 *
 * The copy is made with `cloneNode`, so the rendered tree, whose markers Lit holds references
 * to, is never touched. Read the result's `innerHTML` or `outerHTML` as the test needs.
 *
 * @param node - The rendered node to copy
 * @returns A detached deep copy of the node, without a single comment in it
 */
export function withoutComments<T extends Node>(node: T): T {
  const copy = node.cloneNode(true) as T;
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode!.removeChild(comment);
  return copy;
}
