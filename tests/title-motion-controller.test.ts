/**
 * Deterministic adapter tests with fake intersection entries and native effects.
 * Real CSS clocks, glyphs, and offscreen pausing are covered by the emitted-browser probe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as Logger from '../src/utils/logger';
import { titleMotionTiming } from '../src/utils/title-motion';
import {
  TitleMotionController,
  type TitleScrollMeasurement,
} from '../src/utils/title-motion-controller';

let now = 1000;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const writes: number[] = [];
const controllers: TitleMotionController[] = [];

class FakeAnimation {
  playState: AnimationPlayState = 'running';
  private start: number | null = null;
  constructor(readonly animationName: string) {}
  get startTime(): number | null {
    return this.start;
  }
  set startTime(value: number | null) {
    this.start = value;
    if (value !== null) writes.push(value);
  }
  get currentTime(): number {
    return now - (this.start ?? now);
  }
}

class MotionPreference extends EventTarget {
  matches = false;
  set(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

class RecordingIntersectionObserver {
  static latest: RecordingIntersectionObserver;
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    RecordingIntersectionObserver.latest = this;
  }
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
  }
  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }
  emit(entries: Array<[Element, boolean, number?]>): void {
    this.callback(
      entries.map(([target, visible, width = 100]) => ({
        target,
        isIntersecting: visible,
        time: now,
        rootBounds: null,
        intersectionRatio: visible ? 1 : 0,
        boundingClientRect: new DOMRect(0, 0, width, 20),
        intersectionRect: new DOMRect(0, 0, visible ? width : 0, visible ? 20 : 0),
      })),
      this as unknown as IntersectionObserver,
    );
  }
}

let preference: MotionPreference;
const originalTimeline = Object.getOwnPropertyDescriptor(document, 'timeline');

beforeEach(() => {
  now = 1000;
  nextFrame = 0;
  frames.clear();
  writes.length = 0;
  preference = new MotionPreference();
  vi.stubGlobal('CSSAnimation', FakeAnimation);
  vi.stubGlobal('IntersectionObserver', RecordingIntersectionObserver);
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {
      get currentTime() {
        return now;
      },
    },
  });
  vi.spyOn(Logger, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalTimeline) Object.defineProperty(document, 'timeline', originalTimeline);
  else Reflect.deleteProperty(document, 'timeline');
  document.body.replaceChildren();
});

function flush(): void {
  for (const [id, callback] of [...frames]) {
    frames.delete(id);
    callback(now);
  }
}

function title(distance: number, index: number): TitleScrollMeasurement {
  const viewport = document.createElement('span');
  viewport.className = 'event-title title-scrollable title-overflowing';
  const content = document.createElement('span');
  content.className = 'event-title-scroll';
  content.textContent = `Fictional garden agenda ${index}`;
  viewport.append(content);
  let animation: FakeAnimation | undefined;
  Object.defineProperty(content, 'getAnimations', {
    configurable: true,
    value: () => {
      const mode = viewport.getAttribute('data-title-motion');
      if (mode !== 'a' && mode !== 'b') return [];
      const name = `calendar-card-title-cohort-${mode}`;
      if (animation?.animationName !== name || animation.playState === 'idle') {
        if (animation) animation.playState = 'idle';
        animation = new FakeAnimation(name);
      }
      return [animation];
    },
  });
  return { title: viewport, content, distance, direction: -1, signature: content.textContent };
}

function setup(distances = [178, 268, 299, 371, 713]) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const targets = distances.map((distance, index) => title(distance, index));
  root.append(...targets.map(({ title }) => title));
  const remeasure = vi.fn();
  const controller = new TitleMotionController(host, remeasure);
  controllers.push(controller);
  controller.sync(targets.map(({ title }) => title));
  controller.measure(targets);
  const observer = RecordingIntersectionObserver.latest;
  observer.emit([[host, true], ...targets.map(({ title }): [Element, boolean] => [title, true])]);
  flush();
  return { host, root, targets, controller, observer, remeasure };
}

function effect(target: TitleScrollMeasurement): FakeAnimation {
  return target.content.getAnimations()[0] as unknown as FakeAnimation;
}

function boundary(target: TitleScrollMeasurement): void {
  const animation = effect(target);
  const period = Number.parseFloat(
    target.content.style.getPropertyValue('--calendar-card-title-cohort-period'),
  );
  now = animation.startTime! + period * 1000 + 1;
  const event = new Event('animationiteration');
  Object.defineProperty(event, 'animationName', { value: animation.animationName });
  target.content.dispatchEvent(event);
  flush();
}

describe('native title cohort adapter', () => {
  it('withdraws placeholders without letting them set the next visible cohort period', () => {
    const { targets, controller } = setup([178, 713]);
    const survivor = effect(targets[0]);
    targets[1].title.classList.add('empty-day-title');
    controller.measure(targets);
    expect(targets[1].title.getAttribute('data-title-motion')).toBe('pending');
    expect(effect(targets[0])).toBe(survivor);
    boundary(targets[0]);
    expect(targets[0].content.style.getPropertyValue('--calendar-card-title-cohort-period')).toBe(
      `${titleMotionTiming(178).total}s`,
    );
  });

  it('observes stable viewports, commits once, and ignores unchanged rebinding and measurements', () => {
    const { targets, controller, observer, host } = setup();
    expect(observer.observed).toEqual(new Set([host, ...targets.map(({ title }) => title)]));
    expect(writes).toEqual([now, now, now, now, now]);
    const effects = targets.map(effect);
    for (let i = 0; i < 5; i++) {
      now += 100;
      controller.sync(targets.map(({ title }) => title));
      controller.measure(targets.map((target) => ({ ...target })));
      flush();
    }
    expect(targets.map(effect)).toEqual(effects);
    expect(writes).toHaveLength(5);
    expect(frames.size).toBe(0);
  });

  it('keeps a late arrival at its beginning until a surviving reader reaches the boundary', () => {
    const { root, targets, controller, observer } = setup([178, 268]);
    now += 1600;
    const added = title(713, 2);
    root.append(added.title);
    controller.sync([...targets, added].map(({ title }) => title));
    controller.measure([added]);
    observer.emit([[added.title, true]]);
    flush();
    expect(added.title.getAttribute('data-title-motion')).toBe('pending');
    expect(added.content.getAnimations()).toEqual([]);
    expect(writes).toHaveLength(2);
    boundary(targets[0]);
    expect(writes).toHaveLength(5);
    expect([...targets, added].map((target) => effect(target).startTime)).toEqual([now, now, now]);
  });

  it('keeps timing off the viewport style attribute that Lit replaces for title colors', () => {
    const { targets, controller } = setup();
    const effects = targets.map(effect);
    const period = titleMotionTiming(713).total;
    for (const target of targets) target.title.style.cssText = 'color: #123456';
    controller.measure(targets);
    for (const target of targets) {
      expect(target.content.style.getPropertyValue('--calendar-card-title-cohort-period')).toBe(
        `${period}s`,
      );
      expect(target.content.style.getPropertyValue('--calendar-card-title-cohort-curve')).toMatch(
        /^linear\(/,
      );
    }
    expect(targets.map(effect)).toEqual(effects);
    expect(writes).toHaveLength(5);
  });

  it('merges a changed partial measurement rather than replacing full membership', () => {
    const { targets, controller } = setup();
    now += 1000;
    const changed = {
      ...targets[4],
      distance: 1521,
      signature: 'A newly expanded fictional title',
    };
    const surviving = effect(targets[0]);
    controller.measure([changed]);
    flush();
    expect(targets[4].title.getAttribute('data-title-motion')).toBe('pending');
    expect(effect(targets[0])).toBe(surviving);
    expect(writes).toHaveLength(5);
    boundary(targets[0]);
    expect(writes).toHaveLength(10);
    expect(targets.every((target) => effect(target).startTime === now)).toBe(true);
    expect(
      Number.parseFloat(
        targets[0].content.style.getPropertyValue('--calendar-card-title-cohort-period'),
      ),
    ).toBe(titleMotionTiming(1521).total);
  });

  it('replaces a removed longest leader without shortening surviving readers mid-cycle', () => {
    const { targets, controller, observer } = setup([713, 178, 268]);
    const survivor = effect(targets[1]);
    const period = targets[1].content.style.getPropertyValue('--calendar-card-title-cohort-period');
    targets[0].title.remove();
    controller.sync(targets.slice(1).map(({ title }) => title));
    expect(observer.observed.has(targets[0].title)).toBe(false);
    expect(effect(targets[1])).toBe(survivor);
    expect(targets[1].content.style.getPropertyValue('--calendar-card-title-cohort-period')).toBe(
      period,
    );
    boundary(targets[1]);
    expect(writes).toHaveLength(5);
    expect(
      Number.parseFloat(
        targets[1].content.style.getPropertyValue('--calendar-card-title-cohort-period'),
      ),
    ).toBe(titleMotionTiming(268).total);
  });

  it('freezes membership on whole-card all-false entries, not on internally clipped titles', () => {
    const { targets, host, observer, controller } = setup();
    const effects = targets.map(effect);
    observer.emit([
      ...targets.map(({ title }): [Element, boolean] => [title, false]),
      [host, false],
    ]);
    expect(host.classList.contains('calendar-card-title-scroll-paused')).toBe(true);
    controller.sync(targets.map(({ title }) => title));
    controller.measure(targets);
    flush();
    expect(targets.map(effect)).toEqual(effects);
    expect(writes).toHaveLength(5);
    observer.emit([[host, true]]);
    expect(host.classList.contains('calendar-card-title-scroll-paused')).toBe(true);
    expect(targets.map(effect)).toEqual(effects);
    expect(writes).toHaveLength(5);
    observer.emit([[host, true], ...targets.map(({ title }): [Element, boolean] => [title, true])]);
    expect(host.classList.contains('calendar-card-title-scroll-paused')).toBe(false);
    expect(writes).toHaveLength(5);
    observer.emit([[targets[4].title, false]]);
    expect(targets[4].title.getAttribute('data-title-motion')).toBe('pending');
    expect(effect(targets[0])).toBe(effects[0]);
    boundary(targets[0]);
    expect(writes).toHaveLength(9);
  });

  it('does not admit zero-area edge intersections or non-overflowing titles', () => {
    const { targets, controller, observer } = setup([0, 1, 178]);
    expect(writes).toHaveLength(1);
    observer.emit([[targets[2].title, true, 0]]);
    flush();
    expect(
      targets.every(({ title }) => title.getAttribute('data-title-motion') === 'pending'),
    ).toBe(true);
    controller.measure(targets);
    expect(writes).toHaveLength(1);
  });

  it.each(['compact', 'blank', 'measuring'])(
    'withdraws %s Grid content and readmits a partial recovery',
    (mode) => {
      const { targets, controller, root } = setup();
      const block = document.createElement('div');
      block.className = 'grid-event';
      root.append(block);
      block.append(targets[4].title);
      block.dataset.gridTitleFit = mode;
      controller.refresh();
      expect(targets[4].title.getAttribute('data-title-motion')).toBe('pending');
      delete block.dataset.gridTitleFit;
      controller.measure([targets[4]]);
      expect(writes).toHaveLength(5);
      boundary(targets[0]);
      expect(writes).toHaveLength(10);
    },
  );

  it('readmits canceled CSS effects even on an unchanged content node', () => {
    const { targets, controller } = setup();
    effect(targets[4]).playState = 'idle';
    controller.measure([targets[4]]);
    expect(targets[4].title.getAttribute('data-title-motion')).toBe('pending');
    expect(writes).toHaveLength(5);
    boundary(targets[0]);
    expect(writes).toHaveLength(10);
  });

  it('cancels pending admission immediately for reduced motion and starts a fresh scene afterward', () => {
    const { targets, remeasure } = setup();
    preference.set(true);
    expect(
      targets.every(({ title }) => title.getAttribute('data-title-motion') === 'pending'),
    ).toBe(true);
    expect(frames.size).toBe(0);
    now += 1500;
    preference.set(false);
    flush();
    expect(remeasure).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(10);
    expect(targets.every((target) => effect(target).startTime === now)).toBe(true);
  });

  it('retains legacy fallback rather than claiming alignment when native effects are missing', () => {
    const warning = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const { targets, controller } = setup([178]);
    Object.defineProperty(targets[0].content, 'getAnimations', { value: () => [] });
    controller.measure([{ ...targets[0], signature: 'Changed title' }]);
    flush();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('independent legacy'), undefined);
    expect(targets[0].title.hasAttribute('data-title-motion')).toBe(false);
    controller.sync(targets.map(({ title }) => title));
    expect(targets[0].title.hasAttribute('data-title-motion')).toBe(false);
    preference.set(true);
    preference.set(false);
    expect(targets[0].title.hasAttribute('data-title-motion')).toBe(false);
  });

  it('disposes every owned observer/listener/frame and does not revive on late callbacks', () => {
    const { host, targets, observer, controller, remeasure } = setup();
    controller.measure([{ ...targets[0], signature: 'Changed' }]);
    controller.dispose();
    expect(observer.disconnected).toBe(true);
    expect(frames.size).toBe(0);
    expect(targets.every(({ title }) => !title.hasAttribute('data-title-motion'))).toBe(true);
    preference.set(true);
    preference.set(false);
    observer.emit([[host, false]]);
    expect(host.classList.contains('calendar-card-title-scroll-paused')).toBe(false);
    expect(remeasure).not.toHaveBeenCalled();
    expect(writes).toHaveLength(5);
  });
});
