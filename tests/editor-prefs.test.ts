/**
 * The editor's two preferences (backlog item 307): Show Every Setting and Show YAML Option Names,
 * remembered in this browser under one key, read and written inside `try`, since private browsing
 * throws on storage, and the key Essentials Only remembered removed on the first read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NO_PREFS,
  PREFS_KEY,
  RETIRED_KEY,
  readPrefs,
  writePrefs,
} from '../src/rendering/editor/prefs';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the editor’s preferences', () => {
  it('are off until set, and remembered as written', () => {
    expect(readPrefs()).toEqual(NO_PREFS);
    writePrefs({ every: true, yaml: false });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual({
      v: 1,
      every: true,
      yaml: false,
    });
    expect(readPrefs()).toEqual({ every: true, yaml: false });
  });

  it('remove the key Essentials Only remembered, and keep their own', () => {
    localStorage.setItem(RETIRED_KEY, 'true');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: 1, every: false, yaml: true }));
    expect(readPrefs()).toEqual({ every: false, yaml: true });
    expect(localStorage.getItem(RETIRED_KEY)).toBeNull();
  });

  it('read anything but their own shape as off', () => {
    for (const stored of ['not json', '"every"', 'null', '{"every":"yes","yaml":1}']) {
      localStorage.setItem(PREFS_KEY, stored);
      expect(readPrefs(), stored).toEqual(NO_PREFS);
    }
  });

  it('carry on where the browser refuses storage', () => {
    const refusing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    vi.stubGlobal('localStorage', refusing);
    expect(readPrefs()).toEqual(NO_PREFS);
    expect(() => writePrefs({ every: true, yaml: true })).not.toThrow();
  });
});
