/**
 * Where the editor file lives, relative to the card that loads it.
 *
 * The build emits two files into one flat directory — `calendar-card-pro.js` and
 * `editor.js` — and the card reaches the second through a dynamic `import()`. That
 * import cannot be written as a plain relative specifier, for a reason that is entirely
 * about how HACS serves the card.
 *
 * HACS registers the Lovelace resource as `…/calendar-card-pro.js?hacstag=N` and serves
 * `/hacsfiles/**` with `max-age=2678400` — one month. A relative specifier resolves
 * against the importing module's URL **with the query dropped**, so `import('./editor.js')`
 * would request a URL carrying no cache-buster at all, and a browser that had fetched a
 * previous release's `editor.js` would keep serving it for up to 31 days after the update.
 *
 * Building the URL by hand and copying the card's own query across fixes that: the editor
 * is fetched as `…/editor.js?hacstag=N`, so it busts exactly when the card busts. The
 * `hacstag` HACS writes changes on every upgrade, and the `?v=` a dev deploy appends does
 * the same for local testing — where the previous, content-hashed shape never busted the
 * editor at all, because a hash only changes when the *editor* changes.
 *
 * @param cardUrl - The card module's own absolute URL, i.e. `import.meta.url`
 * @returns Absolute URL of the editor file, carrying the card's query string
 */
export function editorModuleUrl(cardUrl: string): string {
  const url = new URL('./editor-dev.js', cardUrl);

  // Assigning the empty string sets the URL's query to null rather than to an empty one,
  // so a card loaded without a query yields a bare `…/editor.js` and not `…/editor.js?`.
  // That matters because the two are different cache keys.
  url.search = new URL(cardUrl).search;

  return url.href;
}
