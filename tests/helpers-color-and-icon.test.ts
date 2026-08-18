/**
 * Colour conversion and icon detection in `src/utils/helpers.ts`.
 *
 * `convertToRGBA` turns a configured accent colour plus `event_background_opacity`
 * into the event background. A mutation sweep found two of its branches free to
 * break with the whole suite green:
 *
 * 1. The `var(...)` branch applies the 0-100 opacity as a `color-mix` percentage.
 *    It used to emit `rgba(var(--calendar-color-rgb, 3, 169, 244), …)` against a
 *    variable this card defines nowhere and no theme knows about, so the literal
 *    fallback always won — and that fallback is the default `accent_color`, which is
 *    why a themed card looked correct until someone compared it against the theme it
 *    was supposed to follow. Themed colours are the common case, since every HA theme
 *    variable arrives as `var(...)`. The assertions below pin the configured colour
 *    reaching the output, which the old form could not do at all.
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
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
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
  it('carries a themed var() colour through to the output', () => {
    // The colour itself has to appear. The previous form discarded it entirely and
    // emitted a fixed fallback, so an assertion that only checked the alpha passed while
    // every themed card rendered the shipped blue.
    expect(Helpers.convertToRGBA('var(--primary-color)', 30)).toBe(
      'color-mix(in srgb, var(--primary-color) 30%, transparent)',
    );
  });

  it('keeps the two apart when different variables are configured', () => {
    // The control for the assertion above: two distinct inputs must give two distinct
    // outputs, which is exactly what a hardcoded fallback cannot do.
    expect(Helpers.convertToRGBA('var(--accent-color)', 30)).not.toBe(
      Helpers.convertToRGBA('var(--primary-color)', 30),
    );
  });

  it('scales the extremes of the same var() branch', () => {
    expect(Helpers.convertToRGBA('var(--accent-color)', 100)).toBe(
      'color-mix(in srgb, var(--accent-color) 100%, transparent)',
    );
    expect(Helpers.convertToRGBA('var(--card-background-color)', 5)).toBe(
      'color-mix(in srgb, var(--card-background-color) 5%, transparent)',
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

/**
 * The end-to-end half of the same defect.
 *
 * `convertToRGBA` is only reached from `getEntityAccentColorWithOpacity`, behind two
 * opt-ins — a `var()` accent colour and a non-zero `event_background_opacity`, which
 * defaults to `0` on a path that returns before the conversion happens. So the unit
 * assertions above can all pass while nothing a user sees ever changes. This renders the
 * card and reads the background off the event, which is the only claim that matters.
 */
describe('a themed accent colour reaches the rendered event background', () => {
  const EVENT = [
    {
      start: { dateTime: '2026-06-18T09:00:00.000Z' },
      end: { dateTime: '2026-06-18T10:00:00.000Z' },
      summary: 'themed',
      _entityId: 'calendar.personal',
    },
  ] as unknown as Types.CalendarEventData[];

  function backgrounds(overrides: Record<string, unknown>): string[] {
    const config = buildConfig({ days_to_show: 7, start_date: '2026-06-18', ...overrides });
    const days = EventUtils.groupEventsByDay(EVENT, config, false, 'en');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en'), container);
    return Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map((node) => node.getAttribute('style') ?? '')
      .filter((style) => style.includes('background-color'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the configured variable, not a hardcoded fallback', () => {
    const styles = backgrounds({
      accent_color: 'var(--primary-color)',
      event_background_opacity: 30,
    });

    expect(styles.length).toBeGreaterThan(0);
    expect(styles.join(' ')).toContain('color-mix(in srgb, var(--primary-color) 30%, transparent)');
    // The colour the old fallback always resolved to. Its absence is the regression guard:
    // every themed card used to render this instead of the theme's own colour.
    expect(styles.join(' ')).not.toContain('3, 169, 244');
  });

  it('follows a different variable when a different one is configured', () => {
    // The control. A fallback that happens to match the theme would satisfy the assertion
    // above; two distinct inputs producing two distinct outputs cannot be faked that way.
    const primary = backgrounds({
      accent_color: 'var(--primary-color)',
      event_background_opacity: 30,
    });
    const accent = backgrounds({
      accent_color: 'var(--accent-color)',
      event_background_opacity: 30,
    });

    expect(primary.join(' ')).not.toBe(accent.join(' '));
    expect(accent.join(' ')).toContain('var(--accent-color)');
  });
});
