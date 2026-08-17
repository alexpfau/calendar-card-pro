/**
 * Colour conversion and icon detection in `src/utils/helpers.ts`.
 *
 * `convertToRGBA` turns a configured accent colour plus `event_background_opacity`
 * into the event background. A mutation sweep found two of its branches free to
 * break with the whole suite green:
 *
 * 1. The `var(...)` branch divides the 0-100 opacity by 100 to reach a CSS alpha.
 *    Dropping that division emits `alpha: 30` instead of `0.3`, which CSS clamps to
 *    a fully opaque background — so a themed card configured for a 30% tint would
 *    render solid. Themed colours are the common case, since the default
 *    `accent_color` and every HA theme variable arrive as `var(...)`.
 *
 * 2. The two `rgb()` / `rgba()` branches convert a resolved literal colour. Neither
 *    is reachable under happy-dom, which returns `getComputedStyle(el).color`
 *    verbatim (`#ff0000`) rather than resolving it to `rgb(255, 0, 0)` as a browser
 *    does. Stubbing the resolved value is what makes the production path testable
 *    at all; without the stub the function returns the colour unchanged and the
 *    opacity is silently dropped.
 *
 * `isIconValue` decides whether a `today_indicator` string is an icon. Its
 * `startsWith('http')` guard is load-bearing only for the malformed `http:<char>`
 * shape, which the leading regex would otherwise accept as an icon prefix.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as Helpers from '../src/utils/helpers';

/**
 * Pin the value `getComputedStyle().color` resolves to, the way a browser would.
 * happy-dom echoes the authored string instead, so both literal-colour branches
 * of `computeRGBA` are unreachable without this.
 */
function stubResolvedColor(resolved: string): void {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    color: resolved,
  } as unknown as CSSStyleDeclaration);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('convertToRGBA turns a configured opacity into a CSS alpha', () => {
  it('scales a themed var() colour from 0-100 to a 0-1 alpha', () => {
    expect(Helpers.convertToRGBA('var(--primary-color)', 30)).toBe(
      'rgba(var(--calendar-color-rgb, 3, 169, 244), 0.3)',
    );
  });

  it('scales the extremes of the same var() branch', () => {
    expect(Helpers.convertToRGBA('var(--accent-color)', 100)).toBe(
      'rgba(var(--calendar-color-rgb, 3, 169, 244), 1)',
    );
    expect(Helpers.convertToRGBA('var(--card-background-color)', 5)).toBe(
      'rgba(var(--calendar-color-rgb, 3, 169, 244), 0.05)',
    );
  });

  it('applies the alpha to a literal colour the browser resolves to rgb()', () => {
    stubResolvedColor('rgb(255, 0, 0)');
    expect(Helpers.convertToRGBA('#ff0000', 30)).toBe('rgba(255, 0, 0, 0.3)');
  });

  it('replaces the alpha of a literal colour that already resolves to rgba()', () => {
    stubResolvedColor('rgba(18, 52, 86, 0.5)');
    expect(Helpers.convertToRGBA('#123456', 40)).toBe('rgba(18, 52, 86, 0.4)');
  });

  it('leaves transparent alone rather than tinting it black', () => {
    // A browser resolves `color: transparent` to `rgba(0, 0, 0, 0)`, so without the
    // short-circuit the rgba branch would claim it and emit an opaque black tint.
    // happy-dom echoes `transparent` back instead, which makes the fallback return
    // the same string and hides the difference — hence the stub.
    stubResolvedColor('rgba(0, 0, 0, 0)');
    expect(Helpers.convertToRGBA('transparent', 30)).toBe('transparent');
  });

  it('returns an unresolvable colour unchanged instead of emitting a broken alpha', () => {
    // Pins the outcome, not a particular line: the early `!computedColor` return and
    // the function's tail both yield the colour unchanged, so this cannot distinguish
    // them. The guarded behaviour is that no malformed `rgba(, , , 0.3)` escapes.
    stubResolvedColor('');
    expect(Helpers.convertToRGBA('notacolor', 30)).toBe('notacolor');
  });
});

describe('isIconValue separates an icon name from a URL', () => {
  it('accepts the prefixed icon names the editor offers', () => {
    expect(Helpers.isIconValue('mdi:home')).toBe(true);
    expect(Helpers.isIconValue('phu:octopusenergy')).toBe(true);
  });

  it('rejects a bare http scheme the leading regex would otherwise accept', () => {
    expect(Helpers.isIconValue('http:x')).toBe(false);
    expect(Helpers.isIconValue('https:x')).toBe(false);
  });

  it('rejects ordinary URLs and plain text', () => {
    expect(Helpers.isIconValue('https://example.com/a.png')).toBe(false);
    expect(Helpers.isIconValue('/local/badge.png')).toBe(false);
    expect(Helpers.isIconValue('Holiday')).toBe(false);
  });
});
