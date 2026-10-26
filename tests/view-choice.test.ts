/**
 * What the toolbar remembers per device — the switcher's view and the calendars the legend
 * hides — as a pure module.
 *
 * The card-level behavior — a switch surviving a reload, an edit resetting it — is in
 * `view-switcher.test.ts`. This file pins what that rests on: the fingerprint ignores key
 * order and nothing else, the stored map is bounded, and storage that misbehaves in any way
 * a browser can make it misbehave costs a remembered choice and never an exception.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  type ChoiceStorage,
  MAX_VIEW_CHOICES,
  VIEW_CHOICE_STORAGE_KEY,
  canonicalJson,
  configFingerprint,
  readHiddenCalendars,
  readViewChoice,
  writeHiddenCalendars,
  writeViewChoice,
} from '../src/utils/view-choice';

/** A `Storage` stand-in that can be told to fail at any of the three calls. */
function memoryStorage(fail: Partial<Record<keyof ChoiceStorage, boolean>> = {}) {
  const items = new Map<string, string>();
  const storage: ChoiceStorage & { items: Map<string, string> } = {
    items,
    getItem(key) {
      if (fail.getItem) throw new Error('SecurityError');
      return items.has(key) ? items.get(key)! : null;
    },
    setItem(key, value) {
      if (fail.setItem) throw new Error('QuotaExceededError');
      items.set(key, value);
    },
    removeItem(key) {
      if (fail.removeItem) throw new Error('SecurityError');
      items.delete(key);
    },
  };
  return storage;
}

afterEach(() => {
  localStorage.clear();
});

describe('the configuration fingerprint', () => {
  it('ignores the order of keys, at every depth', () => {
    const a = { type: 'custom:x', view: 'grid', toolbar: { show: true, add_event: false } };
    const b = { toolbar: { add_event: false, show: true }, view: 'grid', type: 'custom:x' };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(configFingerprint(a)).toBe(configFingerprint(b));
  });

  it('keeps the order of arrays, which carries meaning', () => {
    const a = { entities: ['calendar.anna', 'calendar.ben'] };
    const b = { entities: ['calendar.ben', 'calendar.anna'] };

    expect(configFingerprint(a)).not.toBe(configFingerprint(b));
  });

  it('changes with any value, nested ones included', () => {
    const base = { view: 'list', toolbar: { show: true } };

    expect(configFingerprint({ ...base, title: 'Family' })).not.toBe(configFingerprint(base));
    expect(configFingerprint({ ...base, toolbar: { show: false } })).not.toBe(
      configFingerprint(base),
    );
  });

  it('reads an absent key and an undefined one as the same configuration', () => {
    expect(configFingerprint({ view: 'list', title: undefined })).toBe(
      configFingerprint({ view: 'list' }),
    );
  });
});

describe('remembered choices', () => {
  it('reads back what was written, per fingerprint', () => {
    const storage = memoryStorage();
    writeViewChoice('a', 'grid', storage);
    writeViewChoice('b', 'column', storage);

    expect(readViewChoice('a', storage)).toBe('grid');
    expect(readViewChoice('b', storage)).toBe('column');
    expect(readViewChoice('c', storage)).toBeUndefined();
  });

  it('forgets a choice, and removes the entry once nothing is left in it', () => {
    const storage = memoryStorage();
    writeViewChoice('a', 'grid', storage);
    writeViewChoice('b', 'column', storage);

    writeViewChoice('a', undefined, storage);
    expect(readViewChoice('a', storage)).toBeUndefined();
    expect(readViewChoice('b', storage)).toBe('column');

    writeViewChoice('b', undefined, storage);
    expect(storage.items.has(VIEW_CHOICE_STORAGE_KEY)).toBe(false);
  });

  it('keeps only the newest choices once the cap is reached', () => {
    const storage = memoryStorage();
    for (let index = 0; index <= MAX_VIEW_CHOICES; index++) {
      writeViewChoice(`card-${index}`, 'grid', storage, 1_000 + index);
    }

    expect(readViewChoice('card-0', storage)).toBeUndefined();
    expect(readViewChoice('card-1', storage)).toBe('grid');
    expect(readViewChoice(`card-${MAX_VIEW_CHOICES}`, storage)).toBe('grid');
    const stored = JSON.parse(storage.items.get(VIEW_CHOICE_STORAGE_KEY)!);
    expect(Object.keys(stored.choices)).toHaveLength(MAX_VIEW_CHOICES);
  });

  it.each([
    ['text that is not JSON', '{not json'],
    ['another version', JSON.stringify({ version: 2, choices: { a: { view: 'grid', at: 1 } } })],
    ['no choices object', JSON.stringify({ version: 1, choices: [] })],
    [
      'a view that does not exist',
      JSON.stringify({ version: 1, choices: { a: { view: 'month', at: 1 } } }),
    ],
    ['a choice with no time', JSON.stringify({ version: 1, choices: { a: { view: 'grid' } } })],
  ])('ignores %s', (_name, text) => {
    const storage = memoryStorage();
    storage.items.set(VIEW_CHOICE_STORAGE_KEY, text);

    expect(readViewChoice('a', storage)).toBeUndefined();
    // And writing over it replaces it rather than throwing.
    writeViewChoice('a', 'column', storage);
    expect(readViewChoice('a', storage)).toBe('column');
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'survives storage that refuses %s',
    (call) => {
      const storage = memoryStorage({ [call]: true });

      expect(() => writeViewChoice('a', 'grid', storage)).not.toThrow();
      expect(() => readViewChoice('a', storage)).not.toThrow();
      expect(() => writeViewChoice('a', undefined, storage)).not.toThrow();
    },
  );

  it('has nothing to do without storage at all', () => {
    expect(() => writeViewChoice('a', 'grid', null)).not.toThrow();
    expect(readViewChoice('a', null)).toBeUndefined();
  });

  it("uses the device's localStorage by default", () => {
    writeViewChoice('a', 'grid');

    expect(readViewChoice('a')).toBe('grid');
    expect(localStorage.getItem(VIEW_CHOICE_STORAGE_KEY)).toContain('"grid"');
  });
});

describe('the calendars the legend hides', () => {
  it('reads back what was written, per fingerprint, and nothing for another', () => {
    const storage = memoryStorage();
    writeHiddenCalendars('a', ['calendar.ben'], storage);

    expect(readHiddenCalendars('a', storage)).toEqual(['calendar.ben']);
    expect(readHiddenCalendars('b', storage)).toEqual([]);
  });

  it('shares the view choice’s entry, and changing one half keeps the other', () => {
    const storage = memoryStorage();
    writeViewChoice('a', 'grid', storage, 1);
    writeHiddenCalendars('a', ['calendar.ben'], storage, 2);

    expect(readViewChoice('a', storage)).toBe('grid');
    expect(readHiddenCalendars('a', storage)).toEqual(['calendar.ben']);
    expect(JSON.parse(storage.items.get(VIEW_CHOICE_STORAGE_KEY)!).choices).toEqual({
      a: { view: 'grid', hidden: ['calendar.ben'], at: 2 },
    });

    writeViewChoice('a', undefined, storage, 3);
    expect(readViewChoice('a', storage)).toBeUndefined();
    expect(readHiddenCalendars('a', storage)).toEqual(['calendar.ben']);

    writeHiddenCalendars('a', [], storage, 4);
    expect(storage.items.has(VIEW_CHOICE_STORAGE_KEY)).toBe(false);
  });

  it('keeps showing every calendar a view-only choice from before the legend', () => {
    // Version 1 has always been a view and a time. Still version 1, still read.
    const storage = memoryStorage();
    storage.items.set(
      VIEW_CHOICE_STORAGE_KEY,
      JSON.stringify({ version: 1, choices: { a: { view: 'column', at: 1 } } }),
    );

    expect(readViewChoice('a', storage)).toBe('column');
    expect(readHiddenCalendars('a', storage)).toEqual([]);
  });

  it('counts a choice holding only hidden calendars against the cap like any other', () => {
    const storage = memoryStorage();
    for (let index = 0; index <= MAX_VIEW_CHOICES; index++) {
      writeHiddenCalendars(`card-${index}`, ['calendar.ben'], storage, 1_000 + index);
    }

    expect(readHiddenCalendars('card-0', storage)).toEqual([]);
    expect(readHiddenCalendars(`card-${MAX_VIEW_CHOICES}`, storage)).toEqual(['calendar.ben']);
  });

  it('drops what is not a calendar id, and repeats, and keeps the rest of the choice', () => {
    const storage = memoryStorage();
    storage.items.set(
      VIEW_CHOICE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        choices: {
          a: { view: 'grid', hidden: ['calendar.ben', 7, '', 'calendar.ben', null], at: 1 },
          b: { view: 'month', hidden: 'calendar.ben', at: 1 },
          c: { hidden: ['calendar.anna'], at: 1 },
        },
      }),
    );

    expect(readHiddenCalendars('a', storage)).toEqual(['calendar.ben']);
    expect(readViewChoice('a', storage)).toBe('grid');
    // Neither half valid: no choice at all.
    expect(readHiddenCalendars('b', storage)).toEqual([]);
    expect(readViewChoice('b', storage)).toBeUndefined();
    expect(readHiddenCalendars('c', storage)).toEqual(['calendar.anna']);
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'survives storage that refuses %s',
    (call) => {
      const storage = memoryStorage({ [call]: true });

      expect(() => writeHiddenCalendars('a', ['calendar.ben'], storage)).not.toThrow();
      expect(() => readHiddenCalendars('a', storage)).not.toThrow();
      expect(() => writeHiddenCalendars('a', [], storage)).not.toThrow();
    },
  );
});
