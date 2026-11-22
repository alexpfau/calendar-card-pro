import { describe, expect, it } from 'vitest';

import { headPin } from '../src/utils/head-pin';

describe('headPin', () => {
  // What stays at the top of a scrolling events area: the head and the band under it while
  // together they take at most two thirds of it, the head alone while only it does, and nothing
  // on a card shorter still, or one that does not scroll. Backlog item 402: a 300px Grid with its
  // toolbar held a 99px head over 162px of hours, past the half #951 allowed, and let it go.
  it.each([
    ['head and band within two thirds', 75, 24, 162, 460, 'all'],
    ['head and band at exactly two thirds', 100, 50, 225, 800, 'all'],
    ['head and band past two thirds, the head within it', 75, 70, 162, 460, 'head'],
    ['the head alone at exactly two thirds', 100, 70, 150, 800, 'head'],
    ['the head alone past two thirds', 101, 70, 150, 800, 'none'],
    ['no band, the head within two thirds', 55, 0, 162, 320, 'all'],
    ['no band, the head past two thirds', 120, 0, 162, 320, 'none'],
    ['a head taller than the whole area', 79, 0, 68, 440, 'none'],
    ['an area that does not scroll', 80, 20, 800, 800, 'none'],
    ['an area not laid out', 80, 20, 0, 0, 'none'],
    ['a head not laid out', 0, 20, 228, 800, 'none'],
  ] as const)('%s', (_case, headPx, bandPx, areaPx, contentPx, expected) => {
    expect(headPin(headPx, bandPx, areaPx, contentPx)).toBe(expected);
  });
});
