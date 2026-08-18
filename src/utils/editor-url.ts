/**
 * Builds the editor module URL beside the card bundle.
 * The card's query string is copied so HACS and dev cache-busters apply to both files.
 */
export function editorModuleUrl(cardUrl: string): string {
  const url = new URL('./editor-dev.js', cardUrl);

  url.search = new URL(cardUrl).search;

  return url.href;
}
