import { describe, expect, it } from 'vitest';

import {
  CASCADE_THRESHOLD_FLOOR_MIN,
  type CascadeScale,
  cascadeThresholdMin,
  measureCascadeThreshold,
} from '../src/utils/grid-cascade-threshold';

/**
 * The cascade threshold: how far below an event another must start before the grid may
 * draw it on top, for the scale the card is drawn at.
 *
 * The scale is pixels the host measures; everything here is the pure conversion from
 * those pixels to minutes. What it protects is one title row in the strip a nested event
 * leaves above itself, so the expectations below are read off that row, not off the
 * formula: at the default 48px hour thirty minutes is 24px, which is the row.
 */

/** The default 07:00–22:00 band. */
const BAND = 15 * 60;

/** A body for `hourPx` per hour across the default band, at default type and chrome. */
const scale = (hourPx: number, overrides: Partial<CascadeScale> = {}): CascadeScale => ({
  bodyHeightPx: (BAND / 60) * hourPx,
  fontPx: 12,
  chromePx: 7,
  ...overrides,
});

describe('cascadeThresholdMin', () => {
  it.each([
    ['the default 48px hour', scale(48), 30],
    ['a 100px hour, which the floor holds at half an hour', scale(100), 30],
    ['a compressed 30px hour', scale(30), 50],
    ['a compressed 20px hour', scale(20), 75],
    ['20px type at the default hour', scale(48, { fontPx: 20 }), 50],
  ])('protects one title row at %s', (_case, measured, expected) => {
    expect(cascadeThresholdMin(measured, BAND)).toBe(expected);
  });

  it('never drops below the half hour that makes two events start together', () => {
    expect(cascadeThresholdMin(scale(400), BAND)).toBe(CASCADE_THRESHOLD_FLOOR_MIN);
    expect(CASCADE_THRESHOLD_FLOOR_MIN).toBe(30);
  });

  it('counts a thicker hour rule as headroom the title does not get', () => {
    // 3px more chrome is 27px of headroom, which at 0.8px a minute is 33.75 minutes.
    expect(cascadeThresholdMin(scale(48, { chromePx: 10 }), BAND)).toBe(35);
  });

  it('passes the band rather than capping, so an overcompressed card draws side by side', () => {
    // A one-hour band 12px tall: one title row is two hours of it.
    expect(cascadeThresholdMin({ bodyHeightPx: 12, fontPx: 12, chromePx: 7 }, 60)).toBe(61);
  });

  it('absorbs measurement noise instead of stepping up for it', () => {
    // 719.5px is a rounded 720px body, and must not read as thirty-and-a-bit minutes.
    expect(cascadeThresholdMin({ bodyHeightPx: 719.5, fontPx: 12, chromePx: 7 }, BAND)).toBe(30);
  });

  it.each([
    ['no measurement', null],
    ['a body with no height', scale(0)],
    ['an unreadable font size', scale(48, { fontPx: Number.NaN })],
    ['unreadable chrome', scale(48, { chromePx: Number.NaN })],
  ])('keeps the threshold in use for %s', (_case, measured) => {
    expect(cascadeThresholdMin(measured, BAND)).toBe(CASCADE_THRESHOLD_FLOOR_MIN);
    expect(cascadeThresholdMin(measured, BAND, 50)).toBe(50);
  });

  it('raises at once, because a threshold too low blanks titles', () => {
    expect(cascadeThresholdMin(scale(30), BAND, 30)).toBe(50);
  });

  it('lowers only once the scale is clearly past a step', () => {
    // 24px of headroom over 45 minutes: just inside the 45 step, so still 50.
    const justPast = { bodyHeightPx: (24 / 44.9) * BAND, fontPx: 12, chromePx: 7 };
    // ...and over 42 minutes, which is clearly inside it.
    const clearlyPast = { bodyHeightPx: (24 / 42) * BAND, fontPx: 12, chromePx: 7 };

    expect(cascadeThresholdMin(justPast, BAND)).toBe(45);
    expect(cascadeThresholdMin(justPast, BAND, 50)).toBe(50);
    expect(cascadeThresholdMin(clearlyPast, BAND, 50)).toBe(45);
  });
});

describe('measureCascadeThreshold', () => {
  it('reports nothing for a grid that has not been laid out', () => {
    // happy-dom has no layout, so every height reads 0 — the state of a card that has not
    // painted yet, which must keep the floor rather than divide by zero.
    const root = document.createElement('div');
    root.innerHTML =
      '<div class="grid-day-body"><div class="grid-event" style="padding: 2px 4px"></div></div>';

    expect(measureCascadeThreshold(root)).toBeNull();
  });

  it('reads a laid-out body and removes its probe again', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div class="grid-day-body"><div class="grid-event" style="padding: 2px 4px"></div></div>';
    const body = root.querySelector<HTMLElement>('.grid-day-body')!;
    Object.defineProperty(body, 'clientHeight', { value: 720 });
    // Computed styles resolve only for an attached element.
    document.body.appendChild(root);

    const measured = measureCascadeThreshold(root);
    root.remove();

    expect(measured?.bodyHeightPx).toBe(720);
    // The padding is read off the rendered block rather than restated here.
    expect(measured!.chromePx).toBeGreaterThanOrEqual(4);
    expect(body.children).toHaveLength(1);
    expect(body.firstElementChild!.classList.contains('grid-event')).toBe(true);
  });

  it('reports nothing for a grid with no blocks, where there is nothing to cascade', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="grid-day-body"></div>';

    expect(measureCascadeThreshold(root)).toBeNull();
  });
});
