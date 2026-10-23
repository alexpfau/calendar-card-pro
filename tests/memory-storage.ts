/**
 * A fresh, Map-backed `localStorage` for one test.
 *
 * happy-dom's own storage persists across the tests of a file and has no usable
 * `clear()`. The card caches every load, failed ones included, and draws whatever is
 * cached the moment it is attached, so without a fresh store a card in one test starts
 * from whatever the previous test's card left behind.
 *
 * @returns An empty storage object
 */
export function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}
