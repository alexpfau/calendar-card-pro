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
 * The behavior a browser shows — real overflow measurement, the animation, the observers,
 * reduced motion and off-screen pausing — needs native-browser coverage because happy-dom
 * does not compute layout. What is pinned here is everything a unit test *can* own:
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

  it('retains the independent snapping keyframes for the unsupported-engine fallback', () => {
    expect(CSS).toMatch(/@keyframes\s+calendar-card-title-scroll/);
    expect(CSS).toContain('var(--calendar-card-title-scroll-distance, 0px)');
    expect(CSS).toContain('var(--calendar-card-title-scroll-duration, 8s)');

    const kfIdx = CSS.indexOf('@keyframes calendar-card-title-scroll');
    expect(kfIdx).toBeGreaterThan(-1);
    const kfSlice = CSS.slice(kfIdx, kfIdx + CSS.slice(kfIdx).indexOf('\n  }\n') + 5);

    // The compatibility path must keep its original two-stop shape and duration.
    // The enhanced whole-timeline curve uses separate from/to keyframes below.
    expect(kfSlice.match(/translateX/g)?.length).toBe(2);
    expect(kfSlice).toMatch(/0%,\s*15%\s*\{\s*transform:\s*translateX\(0\)/);
    expect(kfSlice).toMatch(
      /85%,\s*100%\s*\{\s*transform:\s*translateX\(\s*calc\(\s*var\(--calendar-card-title-scroll-direction, -1\) \*/,
    );

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

  it('gives each enhanced curve one interpolation interval and only two fixed names', () => {
    const names = [...CSS.matchAll(/@keyframes\s+(calendar-card-title-cohort-[\w-]+)/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual(['calendar-card-title-cohort-a', 'calendar-card-title-cohort-b']);
    for (const name of names) {
      const start = CSS.indexOf(`@keyframes ${name}`);
      const keyframes = CSS.slice(start, start + CSS.slice(start).indexOf('\n  }\n') + 5);
      expect(keyframes.match(/translateX/g)).toHaveLength(2);
      expect(keyframes).toMatch(/from\s*\{/);
      expect(keyframes).toMatch(/to\s*\{/);
      expect(keyframes).not.toMatch(/\d+%/);
    }
    expect(CSS).toContain('animation-duration: var(--calendar-card-title-cohort-period)');
    expect(CSS).toContain('animation-timing-function: var(--calendar-card-title-cohort-curve)');
    expect(CSS).toMatch(/data-title-motion='pending'[^}]*animation:\s*none/);
  });

  it('gives the offscreen pause rule more specificity than the animation shorthand', () => {
    const animated = CSS.match(
      /(\.event-title\.title-scrollable\.title-overflowing\s+\.event-title-scroll)\s*\{[^}]*animation:\s*calendar-card-title-scroll/,
    );
    const paused = CSS.match(/(:host\(\.calendar-card-title-scroll-paused\)[^{]+)\{([^}]*)\}/);
    expect(animated).not.toBeNull();
    expect(paused).not.toBeNull();
    expect(paused![2]).toMatch(/animation-play-state:\s*paused/);
    // Retain all activation qualifiers: a host class alone loses to the shorthand.
    expect(paused![1].trim().replace(/\s+/g, ' ')).toBe(
      `:host(.calendar-card-title-scroll-paused) ${animated![1].replace(/\s+/g, ' ')}`,
    );
  });
});

/** A card with a stubbed shadow root carrying one scrollable title of a chosen geometry. */
function cardWithTitle(contentWidth: number, clientWidth: number, direction = 'ltr') {
  const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
    _measureTitleScroll(): void;
  };
  const styleHost = document.createElement('div');
  document.body.appendChild(styleHost);
  const root = styleHost.attachShadow({ mode: 'open' });
  Object.defineProperty(card, 'renderRoot', { value: root });
  root.innerHTML =
    '<span class="event-title title-scrollable">' +
    '<span class="event-title-scroll">A long event title</span></span>';
  const title = root.querySelector<HTMLElement>('.event-title')!;
  const content = root.querySelector<HTMLElement>('.event-title-scroll')!;
  title.style.direction = direction;
  Object.defineProperties(title, {
    scrollWidth: { value: contentWidth, configurable: true },
    clientWidth: { value: clientWidth, configurable: true },
  });
  Object.defineProperty(content, 'offsetWidth', { value: contentWidth, configurable: true });
  return { card, title, content };
}

describe('scroll_long_titles measurement', () => {
  afterEach(() => document.body.replaceChildren());

  it('keeps overflowing empty-day placeholders static without changing their markup', () => {
    const { card, title } = cardWithTitle(500, 100);
    title.classList.add('empty-day-title');
    card._measureTitleScroll();
    expect(title.classList.contains('title-scrollable')).toBe(true);
    expect(title.classList.contains('title-overflowing')).toBe(false);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('');
  });

  it('measures enhanced pending text in its moving box without changing the legacy measurement', () => {
    const { card, content, title } = cardWithTitle(301, 100);
    content.style.display = 'inline';
    Object.defineProperty(content, 'offsetWidth', {
      configurable: true,
      get: () => (content.style.display === 'inline-block' ? 300 : 301),
    });
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('201px');

    const measure = vi.fn();
    Object.defineProperty(card, '_titleMotion', { value: { enhanced: true, measure } });
    card._measureTitleScroll();
    expect(content.style.display).toBe('inline');
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');
    expect(measure).toHaveBeenLastCalledWith([expect.objectContaining({ distance: 200 })]);

    content.style.display = 'inline-block';
    card._measureTitleScroll();
    expect(content.style.display).toBe('inline-block');
    expect(measure).toHaveBeenLastCalledWith([expect.objectContaining({ distance: 200 })]);
  });

  it('skips compact Grid titles and measures them again after normal disclosure returns', () => {
    const { card, title, content } = cardWithTitle(300, 100);
    const block = document.createElement('div');
    block.className = 'grid-event';
    title.replaceWith(block);
    block.append(title);
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');

    block.dataset.gridTitleFit = 'compact';
    Object.defineProperty(content, 'offsetWidth', { value: 500, configurable: true });
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');

    delete block.dataset.gridTitleFit;
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('400px');
  });

  it.each([
    ['ltr', '-1'],
    ['rtl', '1'],
  ])('travels toward the unread ending in %s', (direction, sign) => {
    const { card, title } = cardWithTitle(300, 100, direction);
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-direction')).toBe(sign);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');
  });

  it('ignores transform-expanded ancestor scroll extents on repeated measurements', () => {
    const { card, title } = cardWithTitle(400, 100, 'rtl');
    card._measureTitleScroll();
    const duration = title.style.getPropertyValue('--calendar-card-title-scroll-duration');
    for (const transformedWidth of [550, 700, 1000]) {
      Object.defineProperty(title, 'scrollWidth', { value: transformedWidth, configurable: true });
      card._measureTitleScroll();
      expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('300px');
      expect(title.style.getPropertyValue('--calendar-card-title-scroll-duration')).toBe(duration);
    }
  });

  it('remeasures intrinsic content and the viewport after a resize or font change', () => {
    const { card, title, content } = cardWithTitle(400, 100, 'rtl');
    Object.defineProperty(title, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(content, 'offsetWidth', { value: 500, configurable: true });
    Object.defineProperty(title, 'clientWidth', { value: 200, configurable: true });
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('300px');
    Object.defineProperty(title, 'clientWidth', { value: 350, configurable: true });
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('150px');
  });

  it('travels across the content box, not the room the title keeps at its inline edges', () => {
    // The title keeps 0.125em of room at each inline edge, padding its margin gives back ("Marks
    // above and below the line" in styles.ts), which clientWidth counts and the text never uses.
    const { card, title } = cardWithTitle(300, 103.5);
    title.style.paddingLeft = '1.75px';
    title.style.paddingRight = '1.75px';
    card._measureTitleScroll();
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('200px');
  });

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

  it('keeps a title with no moving text out of the measurement', () => {
    const { card, title, content } = cardWithTitle(300, 100);
    content.replaceWith(...content.childNodes);
    const measure = vi.fn();
    Object.defineProperty(card, '_titleMotion', { value: { enhanced: false, measure } });
    card._measureTitleScroll();
    expect(title.classList.contains('title-overflowing')).toBe(false);
    expect(measure).toHaveBeenLastCalledWith([]);
  });

  it('clears the class and properties when a title stops overflowing', () => {
    const { card, title, content } = cardWithTitle(300, 100);
    card._measureTitleScroll();
    expect(title.classList.contains('title-overflowing')).toBe(true);

    Object.defineProperty(title, 'scrollWidth', { value: 100, configurable: true });
    Object.defineProperty(content, 'offsetWidth', { value: 100, configurable: true });
    card._measureTitleScroll();
    expect(title.classList.contains('title-overflowing')).toBe(false);
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('');
    expect(title.style.getPropertyValue('--calendar-card-title-scroll-direction')).toBe('');
  });
});

/** A title as `scroll_long_titles` draws it: the one-line viewport and the text that moves. */
function movingTitle(): HTMLElement {
  const title = document.createElement('span');
  title.className = 'event-title title-scrollable';
  const content = document.createElement('span');
  content.className = 'event-title-scroll';
  content.textContent = 'A long event title';
  title.append(content);
  return title;
}

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

  it.each([
    ['dir', 'rtl'],
    ['style', 'direction: rtl'],
    ['class', 'rtl'],
    ['lang', 'en'],
  ])(
    'remeasures inherited %s changes across a shadow boundary and stops on detach',
    async (attribute, value) => {
      const ancestor = document.createElement('div');
      const root = ancestor.attachShadow({ mode: 'open' });
      document.body.appendChild(ancestor);
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: Types.Config): void;
        _syncTitleScroll(): void;
        _scheduleTitleScrollMeasure(): void;
        readonly updateComplete: Promise<boolean>;
      };
      card.setConfig(buildConfig({ entities: [], scroll_long_titles: true }));
      root.appendChild(card);
      await card.updateComplete;
      const title = movingTitle();
      card.shadowRoot!.appendChild(title);
      card._syncTitleScroll();
      const schedule = vi.spyOn(card, '_scheduleTitleScrollMeasure').mockImplementation(() => {});
      const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

      try {
        await flush();
        schedule.mockClear();
        ancestor.setAttribute(attribute, value);
        await flush();
        expect(schedule).toHaveBeenCalledTimes(1);

        schedule.mockClear();
        card.classList.add('calendar-card-title-scroll-paused');
        await flush();
        expect(schedule).not.toHaveBeenCalled();

        card.remove();
        schedule.mockClear();
        ancestor.removeAttribute(attribute);
        await flush();
        expect(schedule).not.toHaveBeenCalled();
      } finally {
        schedule.mockRestore();
      }
    },
  );

  it('retains known offscreen state while rebinding active observers', async () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: Types.Config): void;
      _syncTitleScroll(): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig(buildConfig({ entities: [], scroll_long_titles: true }));
    document.body.appendChild(card);
    await card.updateComplete;

    const title = movingTitle();
    card.shadowRoot!.appendChild(title);
    card._syncTitleScroll();
    card.classList.add('calendar-card-title-scroll-paused');
    const previousResize = RecordingResizeObserver.instances.slice(-1)[0]!;
    const previousIntersection = RecordingIntersectionObserver.instances.slice(-1)[0]!;

    card._syncTitleScroll();

    expect(previousResize.disconnected).toBe(true);
    expect(previousIntersection.disconnected).toBe(true);
    expect(RecordingResizeObserver.instances.slice(-1)[0]?.observed).toContain(title);
    expect(card.classList).toContain('calendar-card-title-scroll-paused');

    card.remove();
    expect(card.classList).not.toContain('calendar-card-title-scroll-paused');
  });

  it.each(['disabled', 'no titles'])(
    'clears paused state when scrolling has %s',
    async (reason) => {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: Types.Config): void;
        _syncTitleScroll(): void;
        readonly updateComplete: Promise<boolean>;
      };
      card.setConfig(buildConfig({ entities: [], scroll_long_titles: reason !== 'disabled' }));
      document.body.appendChild(card);
      await card.updateComplete;
      card.classList.add('calendar-card-title-scroll-paused');

      card._syncTitleScroll();

      expect(card.classList).not.toContain('calendar-card-title-scroll-paused');
    },
  );

  it('reacquires observers when a disconnected card is reconnected', async () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: Types.Config): void;
      _syncTitleScroll(): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig(buildConfig({ entities: [], scroll_long_titles: true }));
    document.body.appendChild(card);
    await card.updateComplete;

    const title = movingTitle();
    card.shadowRoot?.appendChild(title);
    card._syncTitleScroll();

    const firstResize = RecordingResizeObserver.instances.slice(-1)[0]!;
    const firstIntersection = RecordingIntersectionObserver.instances.slice(-1)[0]!;
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

  /**
   * A title beside the time with `title_max_lines: 1` and without `scroll_long_titles` is kept to
   * its line with nothing in it that can move. The card still measures it, so a text label beside
   * it keeps its line, but nothing that moves or pauses a title is started for it, and a card
   * whose titles moved hands that machinery back once none can.
   */
  describe('a title kept to its line beside the time', () => {
    type Card = HTMLElement & {
      setConfig(config: Types.Config): void;
      _syncTitleScroll(): void;
      _titleMotion: { dispose(): void; sync(titles: Iterable<HTMLElement>): void } | null;
      readonly updateComplete: Promise<boolean>;
    };

    async function cardBesideTheTime(scroll: boolean): Promise<Card> {
      const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
      card.setConfig(
        buildConfig({
          entities: [],
          time_position: 'title',
          title_max_lines: 1,
          scroll_long_titles: scroll,
        }),
      );
      document.body.appendChild(card);
      await card.updateComplete;
      return card;
    }

    function stillTitle(): HTMLElement {
      const title = document.createElement('span');
      title.className = 'event-title title-scrollable';
      title.textContent = 'A long event title';
      return title;
    }

    it('measures a still title but starts nothing that moves or pauses it', async () => {
      const card = await cardBesideTheTime(false);
      const title = stillTitle();
      card.shadowRoot!.appendChild(title);
      const intersections = RecordingIntersectionObserver.instances.length;

      card._syncTitleScroll();

      expect(RecordingResizeObserver.instances.slice(-1)[0]?.observed).toContain(title);
      expect(RecordingIntersectionObserver.instances).toHaveLength(intersections);
      expect(card._titleMotion).toBeNull();
    });

    it('starts the pause observer for the same card with scroll_long_titles on', async () => {
      // The control: the same card and the same sync, with a title that can move.
      const card = await cardBesideTheTime(true);
      card.shadowRoot!.appendChild(movingTitle());
      const intersections = RecordingIntersectionObserver.instances.length;

      card._syncTitleScroll();

      expect(RecordingIntersectionObserver.instances).toHaveLength(intersections + 1);
    });

    it('hands motion back once no title can move, keeping the labels reserved', async () => {
      const card = await cardBesideTheTime(false);
      const title = stillTitle();
      card.shadowRoot!.appendChild(title);
      const summary = document.createElement('div');
      summary.className = 'summary summary-scroll';
      summary.setAttribute('data-scroll-labels', '');
      card.shadowRoot!.appendChild(summary);
      const motion = { dispose: vi.fn(), sync: vi.fn() };
      card._titleMotion = motion;
      card.classList.add('calendar-card-title-scroll-paused');

      card._syncTitleScroll();

      expect(motion.dispose).toHaveBeenCalledTimes(1);
      expect(motion.sync).not.toHaveBeenCalled();
      expect(card._titleMotion).toBeNull();
      expect(card.classList).not.toContain('calendar-card-title-scroll-paused');
      expect(summary.hasAttribute('data-scroll-labels')).toBe(true);
    });

    it('takes the scroll state off a title before the frame after scrolling is turned off', async () => {
      // A real render: Lit keeps the viewport when only the text inside it changes, so whatever
      // the measurement wrote on it survives the switch unless the update itself clears it.
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(10, 0, 0, 0);
      const long = {
        summary: 'Quarterly planning review with the whole product team and every partner',
        start: { dateTime: start.toISOString() },
        end: { dateTime: new Date(start.getTime() + 90 * 60 * 1000).toISOString() },
      };
      const hass = {
        states: { 'calendar.anna': { entity_id: 'calendar.anna', state: 'off', attributes: {} } },
        locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
        config: { country: 'DE' },
        themes: { darkMode: false },
        entities: {},
        connection: {
          subscribeMessage: (_callback: unknown, message: { type: string }) =>
            message.type === 'calendar/event/subscribe'
              ? Promise.reject({ code: 'unknown_command' })
              : Promise.resolve(() => {}),
          subscribeEvents: () => Promise.resolve(() => {}),
        },
        callWS: () => Promise.resolve({}),
        localize: (key: string) => key,
        callApi: () => Promise.resolve([{ ...long }]),
        callService: () => Promise.resolve(),
      } as unknown as Types.Hass;
      const config = {
        entities: ['calendar.anna'],
        days_to_show: 3,
        time_position: 'title',
        title_max_lines: 1,
        scroll_long_titles: true,
      } as unknown as Types.Config;
      const card = document.createElement('calendar-card-pro-dev') as unknown as Card & {
        hass: Types.Hass;
        updateEvents(force?: boolean): Promise<void>;
      };
      card.setConfig(config);
      card.hass = hass;
      document.body.appendChild(card);
      await card.updateEvents(true);
      await card.updateComplete;

      const title = card.shadowRoot!.querySelector<HTMLElement>(
        '.time-beside-title .event-title.title-scrollable',
      )!;
      expect(title.querySelector('.event-title-scroll')).not.toBeNull();
      // What a measurement of an overflowing title writes, which happy-dom cannot lay out.
      title.classList.add('title-overflowing');
      title.style.setProperty('--calendar-card-title-scroll-distance', '200px');
      title.style.setProperty('--calendar-card-title-scroll-direction', '-1');
      title.style.setProperty('--calendar-card-title-scroll-duration', '6.00s');

      const frames = vi.fn(() => 1);
      vi.stubGlobal('requestAnimationFrame', frames);
      try {
        card.setConfig({ ...config, scroll_long_titles: false });
        await card.updateComplete;

        const still = card.shadowRoot!.querySelector<HTMLElement>(
          '.time-beside-title .event-title.title-scrollable',
        );
        expect(still).toBe(title);
        expect(title.querySelector('.event-title-scroll')).toBeNull();
        expect(title.classList.contains('title-overflowing')).toBe(false);
        expect(title.style.getPropertyValue('--calendar-card-title-scroll-distance')).toBe('');
        expect(title.style.getPropertyValue('--calendar-card-title-scroll-direction')).toBe('');
        expect(title.style.getPropertyValue('--calendar-card-title-scroll-duration')).toBe('');
        // The labels are still measured, on the frame this test holds back.
        expect(frames).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

/**
 * Whether the card measures titles at all. `time_position: title` with `title_max_lines: 1` keeps
 * every title it puts a time beside to one line, whatever `scroll_long_titles` says, so the card
 * measures them with the option off as well, for the labels beside them; only the option gives
 * them text that moves (see 'a title kept to its line beside the time'). Without that limit, or
 * with a higher one, a title beside the time wraps, and nothing here measures it. Grid ignores the
 * placement, so it measures there only as the option says. Both gates are held, the one that
 * starts the observers and the one each frame passes, by counting the measurements a sync leads
 * to.
 */
describe('which cards measure their titles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function measured(config: Partial<Types.Config>, view: Types.EffectiveView): number {
    const { card } = cardWithTitle(500, 100);
    const gated = card as unknown as {
      _syncTitleScroll(): void;
      _measureTitleScroll(): void;
    };
    Object.defineProperty(card, 'isConnected', { value: true });
    Object.defineProperty(card, 'effectiveConfig', { value: buildConfig(config) });
    Object.defineProperty(card, 'effectiveView', { value: view });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const measure = vi.spyOn(gated, '_measureTitleScroll').mockImplementation(() => {});
    gated._syncTitleScroll();
    return measure.mock.calls.length;
  }

  it.each([
    [
      'the time beside a one-line title, list view',
      { time_position: 'title', title_max_lines: 1 },
      'list',
    ],
    [
      'the time beside a one-line title, column view',
      { time_position: 'title', title_max_lines: 1 },
      'column',
    ],
    ['scroll_long_titles, grid view', { scroll_long_titles: true }, 'grid'],
    ['scroll_long_titles, list view', { scroll_long_titles: true }, 'list'],
  ] as const)('measures with %s', (_name, config, view) => {
    expect(measured(config as Partial<Types.Config>, view)).toBeGreaterThan(0);
  });

  it.each([
    ['neither option, list view', {}, 'list'],
    ['the time beside a wrapping title, list view', { time_position: 'title' }, 'list'],
    [
      'the time beside a title cut at two lines, column view',
      { time_position: 'title', title_max_lines: 2 },
      'column',
    ],
    [
      'the time beside the title, grid view',
      { time_position: 'title', title_max_lines: 1 },
      'grid',
    ],
    ['an unknown time_position', { time_position: 'beside' }, 'list'],
  ] as const)('does not measure with %s', (_name, config, view) => {
    expect(measured(config as Partial<Types.Config>, view)).toBe(0);
  });
});
