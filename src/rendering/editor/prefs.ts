/**
 * The editor's two preferences, remembered in this browser (backlog item 307): Show Every
 * Setting, which draws every setting that applies as a control instead of naming the rest in Add
 * Setting rows, and Show YAML Option Names, which puts each setting's option name before its
 * helper.
 *
 * Read and written inside `try`, because private browsing throws on storage. The first read also
 * removes the key Essentials Only remembered, which nothing reads any more.
 *
 * No DOM beyond `localStorage`, and no Lit, so the tests can call it directly.
 */

/** What the editor remembers. */
export interface Prefs {
  /** Show Every Setting. */
  readonly every: boolean;
  /** Show YAML Option Names. */
  readonly yaml: boolean;
}

/** Where the preferences live: `{ "v": 1, "every": false, "yaml": false }`. */
export const PREFS_KEY = 'calendar-card-pro-editor-ui';

/** The key Essentials Only remembered, removed on the first read. */
export const RETIRED_KEY = 'calendar-card-pro-editor-essentials-only';

export const NO_PREFS: Prefs = { every: false, yaml: false };

/**
 * The browser's storage, where it can be reached.
 *
 * @returns It, or `undefined`
 */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The preferences as this browser remembers them; none where nothing, or nothing readable, is
 * stored. Removes the retired Essentials Only key.
 *
 * @returns The preferences
 */
export function readPrefs(): Prefs {
  const store = storage();
  try {
    store?.removeItem(RETIRED_KEY);
  } catch {
    // Private browsing: there is nothing to remove.
  }
  try {
    const parsed: unknown = JSON.parse(store?.getItem(PREFS_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return NO_PREFS;
    const read = parsed as Record<string, unknown>;
    return { every: read.every === true, yaml: read.yaml === true };
  } catch {
    return NO_PREFS;
  }
}

/**
 * Remembers the preferences in this browser, where it lets the editor.
 *
 * @param prefs - The preferences
 */
export function writePrefs(prefs: Prefs): void {
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify({ v: 1, every: prefs.every, yaml: prefs.yaml }));
  } catch {
    // Private browsing: kept for this session only.
  }
}
