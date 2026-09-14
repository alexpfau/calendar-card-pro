/**
 * One geometrically visible title cohort per card. CSS owns movement and pausing.
 */

import * as Logger from './logger';
import { TitleMotionCohort, type TitleMotionInput, titleMotionCurve } from './title-motion';
import { TITLE_SCROLL } from '../config/constants';

export interface TitleScrollMeasurement extends TitleMotionInput {
  readonly title: HTMLElement;
  readonly content: HTMLElement;
}

interface TitleTarget {
  visible: boolean;
  measurement?: TitleScrollMeasurement;
}

interface ActiveTitle {
  readonly title: HTMLElement;
  readonly animation: CSSAnimation;
}

const MODE = 'data-title-motion';
const PERIOD = '--calendar-card-title-cohort-period';
const CURVE = '--calendar-card-title-cohort-curve';
const PAUSED = 'calendar-card-title-scroll-paused';
const NAMES = ['calendar-card-title-cohort-a', 'calendar-card-title-cohort-b'] as const;

/** Whether the browser can enhance the existing independent CSS marquee without a polyfill. */
export function supportsTitleMotion(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS.supports('animation-timing-function', 'linear(0, 1, 0)') &&
    typeof CSSAnimation !== 'undefined' &&
    typeof Animation !== 'undefined' &&
    typeof Object.getOwnPropertyDescriptor(Animation.prototype, 'startTime')?.set === 'function' &&
    typeof Element.prototype.getAnimations === 'function' &&
    typeof IntersectionObserver !== 'undefined' &&
    typeof matchMedia === 'function' &&
    typeof matchMedia('(prefers-reduced-motion: reduce)').addEventListener === 'function' &&
    document.timeline !== undefined
  );
}

/** Coordinates admission and one-time native clock alignment, never frame-by-frame movement. */
export class TitleMotionController {
  private readonly targets = new Map<HTMLElement, TitleTarget>();
  private readonly active = new Map<HTMLElement, ActiveTitle>();
  private readonly cohort = new TitleMotionCohort<HTMLElement>();
  private readonly intersections: IntersectionObserver;
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private hostVisible = false;
  private hostHasBox = true;
  private frame: number | null = null;
  private generation = 0;
  private nameIndex = 0;
  private leader: HTMLElement | undefined;
  private stopLeader: (() => void) | undefined;
  private disposed = false;
  private fallback = false;

  /** Whether measurements should use the enhanced moving-box geometry. */
  get enhanced(): boolean {
    return !this.fallback;
  }

  constructor(
    private readonly host: HTMLElement,
    private readonly remeasure: () => void,
  ) {
    this.intersections = new IntersectionObserver((entries) => {
      // Process the host first regardless of callback order: all-false title entries
      // when the whole card leaves the screen mean freeze, not an empty cohort.
      const hostEntry = entries.find((entry) => entry.target === host);
      if (hostEntry) {
        this.hostHasBox =
          hostEntry.boundingClientRect.width > 0 && hostEntry.boundingClientRect.height > 0;
        this.hostVisible = this.visible(hostEntry);
      }
      for (const entry of entries) {
        const target = this.targets.get(entry.target as HTMLElement);
        if (target) target.visible = this.visible(entry);
      }
      this.refresh();
    });
    this.intersections.observe(host);
    this.motion.addEventListener('change', this.motionChanged);
    host.ownerDocument.addEventListener('visibilitychange', this.visibilityChanged);
  }

  private visible(entry: IntersectionObserverEntry): boolean {
    return (
      entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
    );
  }

  private get paused(): boolean {
    if (!this.hostVisible || this.host.ownerDocument.hidden) return true;
    // A header can reenter before any title does. Keep the frozen scene until a
    // viewport is visible rather than clearing it on that intermediate IO callback.
    for (const target of this.targets.values()) {
      if (target.visible) return false;
    }
    return true;
  }

  /** Rebinds only new viewports; ordinary renders preserve intersections and native effects. */
  sync(titles: Iterable<HTMLElement>): void {
    const current = new Set(titles);
    for (const title of this.targets.keys()) {
      if (current.has(title)) continue;
      this.intersections.unobserve(title);
      this.targets.delete(title);
      this.clearTitle(title);
    }
    for (const title of current) {
      if (this.targets.has(title)) continue;
      this.targets.set(title, { visible: false });
      if (!this.fallback) title.setAttribute(MODE, 'pending');
      this.intersections.observe(title);
    }
    this.refresh();
  }

  /** Merges partial Grid recovery measurements into the complete observed scene. */
  measure(measurements: ReadonlyArray<TitleScrollMeasurement>): void {
    for (const measurement of measurements) {
      const target = this.targets.get(measurement.title);
      if (target) target.measurement = measurement;
    }
    this.refresh();
  }

  /** Reconciles visibility, static Grid modes, and canceled effects in bounded O(N) work. */
  refresh(): void {
    if (this.disposed) return;
    this.host.classList.toggle(PAUSED, this.paused);
    if (this.fallback) return;
    if (this.motion.matches || !this.hostHasBox) {
      this.reset();
      return;
    }
    if (this.paused) {
      this.cancelFrame();
      return;
    }

    const desired = new Map<HTMLElement, TitleMotionInput>();
    for (const [title, { visible, measurement }] of this.targets) {
      const mode = title.closest<HTMLElement>('.grid-event')?.dataset.gridTitleFit;
      if (
        visible &&
        measurement &&
        title.isConnected &&
        title.contains(measurement.content) &&
        title.classList.contains('title-scrollable') &&
        !title.classList.contains('empty-day-title') &&
        measurement.distance > TITLE_SCROLL.MIN_OVERFLOW_PX &&
        mode !== 'compact' &&
        mode !== 'blank' &&
        mode !== 'measuring'
      ) {
        desired.set(measurement.content, measurement);
      }
    }

    const retired = [...this.active]
      .filter(([, { animation }]) => animation.playState === 'idle')
      .map(([content]) => content);
    for (const content of retired) {
      this.cohort.retire(content);
      this.withdraw(content);
    }
    for (const content of this.cohort.update(desired)) this.withdraw(content);
    this.bindLeader();
    if (this.cohort.empty) {
      this.reset();
    } else if (this.cohort.members.size === 0) {
      this.scheduleCommit();
    }
  }

  private withdraw(content: HTMLElement): void {
    const active = this.active.get(content);
    if (active && this.targets.has(active.title)) active.title.setAttribute(MODE, 'pending');
    this.clearTiming(content);
    this.active.delete(content);
  }

  private bindLeader(): void {
    const leader = this.cohort.members.keys().next().value;
    if (leader === this.leader) return;
    this.stopLeader?.();
    this.stopLeader = undefined;
    this.leader = leader;
    if (!leader) return;
    const generation = this.generation;
    const name = NAMES[this.nameIndex];
    const onIteration = (event: AnimationEvent): void => {
      if (
        generation === this.generation &&
        event.target === leader &&
        event.animationName === name &&
        this.cohort.pending &&
        !this.paused
      ) {
        this.scheduleCommit();
      }
    };
    leader.addEventListener('animationiteration', onIteration);
    this.stopLeader = () => leader.removeEventListener('animationiteration', onIteration);
  }

  private scheduleCommit(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.disposed || this.fallback || this.paused || this.motion.matches) return;
      this.refresh();
      // refresh may schedule the initial commit again; this callback already owns it.
      this.cancelFrame();
      if (!this.cohort.pending || this.cohort.empty) return;
      const clock = this.leader && this.active.get(this.leader)?.animation.currentTime;
      if (typeof clock === 'number' && this.cohort.period > 0) {
        const phase = (clock / 1000) % this.cohort.period;
        // A delayed iteration event must not interrupt a forward pass. Wait for the
        // next native boundary rather than polling or advancing an independent clock.
        if (phase > TITLE_SCROLL.START_PAUSE_S) return;
      }
      this.commit();
    });
  }

  private commit(): void {
    this.stopLeader?.();
    this.stopLeader = undefined;
    this.leader = undefined;
    this.generation += 1;
    this.nameIndex = 1 - this.nameIndex;
    this.cohort.commit();
    const period = this.cohort.period;
    const targets = new Map<HTMLElement, HTMLElement>();
    for (const [title, target] of this.targets) {
      if (target.measurement) targets.set(target.measurement.content, title);
    }
    for (const [content, input] of this.cohort.members) {
      const title = targets.get(content)!;
      // The viewport's inline color is a Lit-owned string attribute. Keep timing on the
      // inner span so changing that color cannot erase a surviving animation's period.
      content.style.setProperty(PERIOD, `${period}s`);
      content.style.setProperty(CURVE, titleMotionCurve(input.distance, period));
      title.setAttribute(MODE, this.nameIndex === 0 ? 'a' : 'b');
    }
    // Read all effects after the batch of style writes, then align once. Equal durations
    // alone do not align late-created CSSAnimation clocks.
    const effects = [...this.cohort.members.keys()].map((content) => ({
      content,
      animation: content
        .getAnimations()
        .find(
          (animation): animation is CSSAnimation =>
            animation instanceof CSSAnimation && animation.animationName === NAMES[this.nameIndex],
        ),
    }));
    const epoch = this.host.ownerDocument.timeline.currentTime;
    if (typeof epoch !== 'number' || effects.some(({ animation }) => !animation)) {
      this.useFallback('Native title animation effects or document clock are unavailable.');
      return;
    }
    try {
      for (const { animation } of effects) animation!.startTime = epoch;
    } catch (error) {
      this.useFallback('Native title animation clocks could not be aligned.', error);
      return;
    }
    this.active.clear();
    for (const { content, animation } of effects) {
      this.active.set(content, { title: targets.get(content)!, animation: animation! });
    }
    this.bindLeader();
    Logger.debug('Title motion cohort committed; native startTime aligned once per member', {
      generation: this.generation,
      members: effects.length,
      periodSeconds: period,
      startTime: epoch,
    });
  }

  private useFallback(message: string, error?: unknown): void {
    Logger.warn(`${message} Keeping independent legacy title scrolling.`, error);
    this.reset();
    this.fallback = true;
    for (const title of this.targets.keys()) this.clearTitle(title);
  }

  private readonly motionChanged = (): void => {
    if (!this.fallback) this.reset();
    this.refresh();
    if (!this.motion.matches) this.remeasure();
  };

  private readonly visibilityChanged = (): void => {
    this.refresh();
  };

  private cancelFrame(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private reset(): void {
    this.cancelFrame();
    this.stopLeader?.();
    this.stopLeader = undefined;
    this.leader = undefined;
    this.generation += 1;
    for (const content of this.active.keys()) this.clearTiming(content);
    this.active.clear();
    this.cohort.clear();
    for (const title of this.targets.keys()) {
      title.setAttribute(MODE, 'pending');
      this.clearTiming(title.querySelector<HTMLElement>('.event-title-scroll'));
    }
  }

  private clearTiming(content: HTMLElement | null): void {
    content?.style.removeProperty(PERIOD);
    content?.style.removeProperty(CURVE);
  }

  private clearTitle(title: HTMLElement): void {
    title.removeAttribute(MODE);
    this.clearTiming(title.querySelector<HTMLElement>('.event-title-scroll'));
  }

  /** Removes observers, media listeners, effects, and pending work owned by this card. */
  dispose(): void {
    this.disposed = true;
    this.reset();
    this.intersections.disconnect();
    this.motion.removeEventListener('change', this.motionChanged);
    this.host.ownerDocument.removeEventListener('visibilitychange', this.visibilityChanged);
    for (const title of this.targets.keys()) this.clearTitle(title);
    this.targets.clear();
    this.host.classList.remove(PAUSED);
  }
}
