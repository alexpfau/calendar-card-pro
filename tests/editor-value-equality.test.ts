/**
 * Structural equality behind the editor's write suppression.
 *
 * `deepEqual` decides whether the editor emits a `config-changed` event at all:
 * `equalConfigs` delegates to it, and a false positive means an edit is
 * silently dropped. Two of its guards are unreachable through the ordinary
 * config shapes the suite already exercises, so both survived deletion with
 * every gate green — `Object.keys` returns `[]` for `[]` and for `{}` alike,
 * and an explicit `undefined` compares equal to a missing key.
 *
 * These test the guards directly rather than hoping a config shape reaches
 * them, since the shapes that would are exactly the ones nobody writes.
 */

import { describe, expect, it } from 'vitest';

import { deepEqual } from '../src/rendering/editor/value';

describe('deepEqual', () => {
  describe('agrees with structural identity on the ordinary shapes', () => {
    it('holds for equal primitives, objects and arrays', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
      expect(deepEqual([1, [2]], [1, [2]])).toBe(true);
    });

    it('fails for differing primitives, values and lengths', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual([1], [1, 2])).toBe(false);
      expect(deepEqual(null, {})).toBe(false);
    });
  });

  /**
   * `Array.isArray(a) !== Array.isArray(b)`. Both operands are `typeof
   * 'object'` and both have zero own keys, so without this guard an empty
   * array and an empty object compare *equal* — the key-count check that
   * catches every other mismatch cannot see this one.
   */
  describe('separates arrays from objects', () => {
    it('does not treat an empty array as an empty object', () => {
      expect(deepEqual([], {})).toBe(false);
      expect(deepEqual({}, [])).toBe(false);
    });

    it('does not treat a populated array as its index-keyed object', () => {
      expect(deepEqual(['x'], { 0: 'x' })).toBe(false);
    });

    it('still compares two empty objects and two empty arrays as equal', () => {
      expect(deepEqual({}, {})).toBe(true);
      expect(deepEqual([], [])).toBe(true);
    });
  });

  /**
   * `hasOwnProperty.call(b, key)`. A missing key reads as `undefined`, which is
   * `Object.is`-equal to an explicit `undefined`, so without this guard the two
   * compare equal whenever the key counts happen to match. `DEFAULT_CONFIG`
   * carries several explicit `undefined` values, which is what makes the shape
   * reachable at all.
   */
  describe('separates an explicit undefined from a missing key', () => {
    it('does not treat a missing key as an undefined value', () => {
      expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
    });

    it('holds when both sides declare the same undefined key', () => {
      expect(deepEqual({ a: undefined }, { a: undefined })).toBe(true);
    });

    it('fails on differing key counts either way round', () => {
      expect(deepEqual({ a: undefined }, {})).toBe(false);
      expect(deepEqual({}, { a: undefined })).toBe(false);
    });
  });
});
