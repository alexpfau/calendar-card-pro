import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, SINGLE_EVENT, buildConfig } from './fixtures';
import '../src/calendar-card-pro';
import { DEFAULT_CONFIG } from '../src/config/config';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import {
  COLUMN_OVERRIDE_KEYS,
  TIME_GRID_OVERRIDE_KEYS,
  resolveEffectiveConfig,
} from '../src/config/view';
import * as Render from '../src/rendering/render';
import { cardStyles } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

/**
 * `scroll_long_titles` — the opt-in horizontal auto-scroll of overflowing event titles.
 *
 * The behaviour a browser shows — real overflow measurement, the animation, the observers,
 * reduced motion and off-screen pausing — needs layout happy-dom does not compute, and is
 * verified live in Home Assistant. What is pinned here is everything a unit test *can* own:
 * the config wiring, the DOM contract the measurement step keys off, the stylesheet
 * contract, and the measurement arithmetic itself with the geometry stubbed.
 *
 * 🚨 The suite is built from default config and this option defaults **off**, so every test
 * below turns it on. A test that left it off would agree with a card that never wired the
 * feature at all — the recurring way defects have shipped here unnoticed.
 */

const CSS = (cardStyles.cssText as string).replace(/\/\*[\s\S]*?\*\//g, '');

function renderListContainer(config: Types.Config): HTMLElement {
  const days = EventUtils.groupEventsByDay(SINGLE_EVENT, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);
  return container;
}

describe('scroll_long_titles config plumbing', () => {
  it('defaults off so existing cards keep wrapping', () => {
    expect(DEFAULT_CONFIG.scroll_long_titles).toBe(false);
  });

  it('is a per-view override for both column and grid', () => {
    expect(COLUMN_OVERRIDE_KEYS).toContain('scroll_long_titles');
    expect(TIME_GRID_OVERRIDE_KEYS).toContain('scroll_long_titles');
  });

  it('resolves per view, so grid can scroll while the list wraps', () => {
    const config = buildConfig({
      scroll_long_titles: false,
      time_grid: { scroll_long_titles: true },
      column: { scroll_long_titles: true },
    });
    expect(resolveEffectiveConfig(config, 'list').scroll_long_titles).toBe(false);
    expect(resolveEffectiveConfig(config, 'grid').scroll_long_titles).toBe(true);
    expect(resolveEffectiveConfig(config, 'column').scroll_long_titles).toBe(true);
  });
});

describe('scroll_long_titles rendered DOM contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wraps the title in the scroll structure the measurement step keys off', () => {
    const container = renderListContainer(buildConfig({ scroll_long_titles: true }));

    const summary = container.querySelector('.summary');
    expect(summary?.classList.contains('summary-scroll')).toBe(true);

    const title = container.querySelector('.event-title');
    expect(title?.classList.contains('title-scrollable')).toBe(true);

    const inner = title?.querySelector('.event-title-scroll');
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toContain('Upcoming one-to-one');
  });

  it('adds none of the scroll structure when the option is off', () => {
    const container = renderListContainer(buildConfig({ scroll_long_titles: false }));

    expect(container.querySelector('.summary-scroll')).toBeNull();
    expect(container.querySelector('.title-scrollable')).toBeNull();
    expect(container.querySelector('.event-title-scroll')).toBeNull();
    // The title is still there — it just renders as it always has.
    expect(container.querySelector('.event-title')?.textContent).toContain('Upcoming one-to-one');
  });
});

describe('scroll_long_titles stylesheet contract', () => {
  it('leaves the wrapping title untouched: no unconditional single line', () => {
    // white-space:nowrap must be reachable only through the scroll classes, or every
    // existing card would stop wrapping its titles unasked.
    expect(CSS).not.toMatch(/\.event-title\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('turns the title into a single-line clip only under the scroll classes', () => {
    expect(CSS).toMatch(
      /\.summary-scroll\s*>\s*\.event-title\.title-scrollable\s*\{[^}]*white-space:\s*nowrap/,
    );
    expect(CSS).toMatch(
      /\.summary-scroll\s*>\s*\.event-title\.title-scrollable\s*\{[^}]*text-overflow:\s*ellipsis/,
    );
  });

  it('animates only real overflow, and only when motion is allowed', () => {
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
    expect(CSS).toMatch(
      /\.title-scrollable\.title-overflowing\s+\.event-title-scroll\s*\{[^}]*animation:\s*calendar-card-title-scroll/,
    );
  });

  it('travels in one direction and restarts, rather than alternating', () => {
    expect(CSS).toMatch(/@keyframes\s+calendar-card-title-scroll/);
    expect(CSS).toContain('var(--calendar-card-title-scroll-distance, 0px)');
    expect(CSS).toContain('var(--calendar-card-title-scroll-duration, 8s)');

    const kfIdx = CSS.indexOf('@keyframes calendar-card-title-scroll');
    expect(kfIdx).toBeGreaterThan(-1);
    const kfSlice = CSS.slice(kfIdx, kfIdx + CSS.slice(kfIdx).indexOf('\n  }\n') + 5);

    // Two stops, not three. A third one returning to translateX(0) is what made the title
    // run backwards through words the reader had just read; the marquee ends at the far end
    // and the wrap back to 0% does the return instantly.
    expect(kfSlice.match(/translateX/g)?.length).toBe(2);
    expect(kfSlice).toMatch(/0%,\s*15%\s*\{\s*transform:\s*translateX\(0\)/);
    expect(kfSlice).toMatch(/85%,\s*100%\s*\{\s*transform:\s*translateX\(calc\(-1 \*/);

    // The last stop must be the far end. If the cycle ended back at zero it would be a
    // ping-pong again whatever the percentages said.
    const stops = [...kfSlice.matchAll(/transform:\s*translateX\(([^;]*)\);/g)].map((m) => m[1]);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toBe('0');
    expect(stops[1]).toContain('--calendar-card-title-scroll-distance');

    // Both ends still held: the first stop spans 0% to 15%, the second 85% to 100%.
    expect(kfSlice).not.toMatch(/\n\s*0%\s*\{/);
  });

  it('holds at both ends for the fraction the duration is derived through', () => {
    // The keyframes and TRAVEL_FRACTION are two halves of one number. If the travel span
    // here stops matching the constant, every title silently changes speed -- the duration
    // stays proportional to distance, so nothing else notices.
    const kfIdx = CSS.indexOf('@keyframes calendar-card-title-scroll');
    const kfSlice = CSS.slice(kfIdx, kfIdx + CSS.slice(kfIdx).indexOf('\n  }\n') + 5);
    const percents = [...kfSlice.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(percents).toEqual([0, 15, 85, 100]);

    const travelStart = percents[1];
    const travelEnd = percents[2];
    expect((travelEnd - travelStart) / 100).toBeCloseTo(Constants.TITLE_SCROLL.TRAVEL_FRACTION, 10);
    // Split evenly, so neither end is held longer than the other.
    expect(travelStart).toBe(100 - travelEnd);
  });

  it('pauses the animation while the card is off-screen', () => {
    expect(CSS).toMatch(
      /:host\(\.calendar-card-title-scroll-paused\)\s+\.event-title-scroll\s*\{[^}]*animation-play-state:\s*paused/,
    );
  });
});

/** A card with a stubbed shadow root carrying one scrollable title of a chosen geometry. */
function cardWithTitle(scrollWidth: number, clientWidth: number) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
    _measureTitleScroll(): void;
  };
  const root = card.attachShadow({ mode: 'open' });
  Object.defineProperty(card, 'renderRoot', { value: root });
  root.innerHTML =
    '<span class="event-title title-scrollable">' +
    '<span class="event-title-scroll">A long event title</span></span>';
  const title = root.querySelector<HTMLElement>('.event-title')!;
  Object.defineProperties(title, {
    scrollWidth: { value: scrollWidth, configurable: true },
    clientWidth: { value: clientWidth, configurable: true },
  });
  return { card, title };
}

describe('scroll_long_titles measurement', () => {
  it('marks a title that overflows and publishes the distance', () => {
    const { card, title } = cardWithTitle(300, 100);
    card._measureTitleScroll();

    expect(title.classList.contains('title-overflowing')).toBe(true);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-duration')).not.toBe('');
  });

  it('never moves a title that fits', () => {
    const { card, title } = cardWithTitle(100, 100);
    card._measureTitleScroll();

    expect(title.classList.contains('title-overflowing')).toBe(false);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('');
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-duration')).toBe('');
  });

  it('ignores a sub-threshold overflow but acts one pixel past it', () => {
    const below = cardWithTitle(100 + Constants.TITLE_SCROLL.MIN_OVERFLOW_PX, 100);
    below.card._measureTitleScroll();
    expect(below.title.classList.contains('title-overflowing')).toBe(false);

    const above = cardWithTitle(100 + Constants.TITLE_SCROLL.MIN_OVERFLOW_PX + 1, 100);
    above.card._measureTitleScroll();
    expect(above.title.classList.contains('title-overflowing')).toBe(true);
  });

  it('scales duration with distance so every title scrolls at one speed', () => {
    // Both distances must clear the floor, or the comparison silently becomes
    // `MIN_DURATION_S` against itself and proves nothing about the speed. At 45 px/s over
    // a 0.7 travel fraction the floor is reached at 126px, so 240 and 480 sit clearly
    // above it and remain exactly double.
    const short = cardWithTitle(340, 100); // distance 240
    short.card._measureTitleScroll();
    const shortSeconds = parseFloat(
      short.title.style.getPropertyValue('--calendar-card-title-scroll-duration'),
    );

    const long = cardWithTitle(580, 100); // distance 480, exactly twice as far
    long.card._measureTitleScroll();
    const longSeconds = parseFloat(
      long.title.style.getPropertyValue('--calendar-card-title-scroll-duration'),
    );

    // Twice the distance, twice the time: constant px/s. Both are above the floor.
    expect(shortSeconds).toBeGreaterThan(Constants.TITLE_SCROLL.MIN_DURATION_S);
    expect(longSeconds).toBeCloseTo(shortSeconds * 2, 5);
  });

  it('floors the duration so a tiny overflow eases rather than snaps', () => {
    const { card, title } = cardWithTitle(110, 100); // distance 10, well under the floor
    card._measureTitleScroll();
    const seconds = parseFloat(
      title.style.getPropertyValue('--calendar-card-title-scroll-duration'),
    );
    expect(seconds).toBe(Constants.TITLE_SCROLL.MIN_DURATION_S);
  });

  it('clears the class and properties when a title stops overflowing', () => {
    const { card, title } = cardWithTitle(300, 100);
    card._measureTitleScroll();
    expect(title.classList.contains('title-overflowing')).toBe(true);

    Object.defineProperty(title, 'scrollWidth', { value: 100, configurable: true });
    card._measureTitleScroll();
    expect(title.classList.contains('title-overflowing')).toBe(false);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('');
  });
});

describe('scroll_long_titles lifecycle', () => {
  class RecordingResizeObserver {
    static instances: RecordingResizeObserver[] = [];

    readonly observed: Element[] = [];
    disconnected = false;

    constructor(_callback: ResizeObserverCallback) {
      RecordingResizeObserver.instances.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);
    }

    unobserve(): void {}

    disconnect(): void {
      this.disconnected = true;
    }
  }

  class RecordingIntersectionObserver {
    static instances: RecordingIntersectionObserver[] = [];

    disconnected = false;

    constructor(_callback: IntersectionObserverCallback) {
      RecordingIntersectionObserver.instances.push(this);
    }

    observe(): void {}

    unobserve(): void {}

    disconnect(): void {
      this.disconnected = true;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0];
  }

  const originalResizeObserver = globalThis.ResizeObserver;
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    RecordingResizeObserver.instances = [];
    RecordingIntersectionObserver.instances = [];
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
    globalThis.IntersectionObserver =
      RecordingIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.IntersectionObserver = originalIntersectionObserver;
    document.body.innerHTML = '';
  });

  it('reacquires observers when a disconnected card is reconnected', async () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: Types.Config): void;
      _syncTitleScroll(): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig(buildConfig({ entities: [], scroll_long_titles: true }));
    document.body.appendChild(card);
    await card.updateComplete;

    const title = document.createElement('span');
    title.className = 'event-title title-scrollable';
    card.shadowRoot?.appendChild(title);
    card._syncTitleScroll();

    const firstResize = RecordingResizeObserver.instances.at(-1)!;
    const firstIntersection = RecordingIntersectionObserver.instances.at(-1)!;
    expect(firstResize.observed).toContain(card);

    card.remove();
    expect(firstResize.disconnected).toBe(true);
    expect(firstIntersection.disconnected).toBe(true);

    const resizeCount = RecordingResizeObserver.instances.length;
    const intersectionCount = RecordingIntersectionObserver.instances.length;
    document.body.appendChild(card);

    const reconnectObservers = RecordingResizeObserver.instances.slice(resizeCount);
    expect(reconnectObservers.some((observer) => observer.observed.includes(title))).toBe(true);
    expect(RecordingIntersectionObserver.instances).toHaveLength(intersectionCount + 1);
  });
});
