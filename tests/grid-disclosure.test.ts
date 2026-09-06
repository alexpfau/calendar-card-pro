import { afterEach, describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import { gridContentOverflows } from '../src/calendar-card-pro';

describe('grid disclosure safety', () => {
  it('tolerates a one-pixel rounding difference but detects a clipped detail row', () => {
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 61 })).toBe(false);
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 62 })).toBe(true);
  });

  it('withdraws only the trailing detail rows needed to make the content fit', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">10:00</div>
            <div class="location">Office</div>
            <div class="description">Notes</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: {
        get: () =>
          90 -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();

    expect(rows.map((row) => row.classList.contains('grid-event-detail-clipped'))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('keeps every detail row when the title alone is what overflows', () => {
    // The maintainer's report: a 2.5-hour event whose title wrapped to three lines in a
    // narrow column rendered with neither its time nor its location, while a taller
    // neighbour with a two-line title showed both. No detail row was responsible for the
    // overflow, so withdrawing them could never resolve it — but the loop hid every one of
    // them on the way to discovering that, and left the block overflowing anyway.
    //
    // The fixture is the title-too-tall case in the abstract: scrollHeight stays above
    // clientHeight no matter how many rows are withdrawn.
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">11:30 - 14:00</div>
            <div class="location">Corner Cafe</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 50 },
      // A three-line title owns 100px of a 50px block on its own, so withdrawing both 20px
      // rows still leaves 60px in a 50px box — the overflow was never theirs to fix.
      scrollHeight: {
        get: () =>
          100 -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();

    expect(
      rows.map((row) => row.classList.contains('grid-event-detail-clipped')),
      'a row may only be withdrawn when withdrawing it resolves the overflow',
    ).toEqual([false, false]);
  });

  it('restores a previously hidden detail row once it fits', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="time">10:00</div>
            <div class="description">Notes</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    const rows = Array.from(content.children) as HTMLElement[];
    let expandedHeight = 80;
    rows.forEach((row) => {
      row.getClientRects = () =>
        row.classList.contains('grid-event-detail-clipped')
          ? ({} as DOMRectList)
          : ({ 0: {} as DOMRect, length: 1, item: () => null } as unknown as DOMRectList);
    });
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: {
        get: () =>
          expandedHeight -
          rows.filter((row) => row.classList.contains('grid-event-detail-clipped')).length * 20,
      },
    });

    card._applyGridDisclosureSafety();
    expect(rows[1].classList).toContain('grid-event-detail-clipped');

    expandedHeight = 60;
    card._applyGridDisclosureSafety();
    expect(rows.every((row) => !row.classList.contains('grid-event-detail-clipped'))).toBe(true);
  });

  it('does not apply the fallback to an overflow-count placeholder', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event grid-event-overflow">
        <div class="grid-event-disclosure">
          <div class="event-content"><div class="time">+2</div></div>
        </div>
      </div>
    `;

    card._applyGridDisclosureSafety();

    expect(root.querySelector('.grid-event-detail-clipped')).toBeNull();
  });
});

describe('grid disclosure observer lifecycle', () => {
  class RecordingResizeObserver {
    static instances: RecordingResizeObserver[] = [];

    readonly observed: Element[] = [];
    disconnected = false;

    constructor(readonly callback: ResizeObserverCallback) {
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

  const originalResizeObserver = globalThis.ResizeObserver;

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    RecordingResizeObserver.instances = [];
    document.body.innerHTML = '';
  });

  it('does not recreate an observer from an update that finishes after disconnection', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;

    document.body.appendChild(card);
    await card.updateComplete;
    const root = card.shadowRoot!;
    root.innerHTML = '<div class="grid-event"></div>';
    card.updated(new Map());
    const gridObserver = RecordingResizeObserver.instances.at(-1)!;
    expect(RecordingResizeObserver.instances).toHaveLength(2);
    expect(gridObserver.observed).toHaveLength(1);

    card.remove();
    expect(gridObserver.disconnected).toBe(true);

    // Lit can run an already queued update after disconnectedCallback. It must not
    // restore an observer holding the detached block.
    card.updated(new Map());

    expect(RecordingResizeObserver.instances).toHaveLength(2);
  });

  it('observes title metrics that stay visible under the clip fallback, not optional detail rows', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;

    document.body.appendChild(card);
    await card.updateComplete;
    const root = card.shadowRoot!;
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="summary"><span class="event-title">Meeting</span></div>
            <div class="time">10:00</div>
            <div class="location">Office</div>
            <div class="description">Notes</div>
            <div class="event-weather"></div>
            <div class="progress-bar-row"></div>
          </div>
        </div>
      </div>
    `;
    card.updated(new Map());

    const gridObserver = RecordingResizeObserver.instances.at(-1)!;
    const labels = gridObserver.observed.map((el) => el.className);
    expect(labels).toContain('grid-event');
    expect(labels).toContain('summary');
    expect(labels).toContain('event-title');
    // Optional rows go display:none under grid-event-content-clipped. Observing them
    // re-fires the observer from the apply pass that hid them and reschedules forever.
    expect(labels).not.toContain('time');
    expect(labels).not.toContain('location');
    expect(labels).not.toContain('description');
    expect(labels).not.toContain('event-weather');
    expect(labels).not.toContain('progress-bar-row');

    card.remove();
    expect(gridObserver.disconnected).toBe(true);
  });

  it('does not re-arm disclosure from a ResizeObserver notification caused by its own clip toggle', async () => {
    class FiringResizeObserver {
      static instances: FiringResizeObserver[] = [];
      readonly observed = new Set<Element>();
      disconnected = false;

      constructor(readonly callback: ResizeObserverCallback) {
        FiringResizeObserver.instances.push(this);
      }

      observe(target: Element): void {
        this.observed.add(target);
      }

      unobserve(target: Element): void {
        this.observed.delete(target);
      }

      disconnect(): void {
        this.disconnected = true;
        this.observed.clear();
      }

      /** Deliver a notification as if every currently observed target resized. */
      fire(): void {
        if (this.disconnected || !this.observed.size) return;
        const entries = [...this.observed].map(
          (target) => ({ target }) as unknown as ResizeObserverEntry,
        );
        this.callback(entries, this as unknown as ResizeObserver);
      }
    }

    globalThis.ResizeObserver = FiringResizeObserver as unknown as typeof ResizeObserver;

    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      setConfig(config: unknown): void;
      preview: boolean;
      updated(changedProps: Map<unknown, unknown>): void;
      readonly updateComplete: Promise<boolean>;
      _applyGridDisclosureSafety(): void;
      _scheduleGridDisclosureSafety(): void;
    };
    card.setConfig({ entities: [], view: 'grid' });
    card.preview = true;
    document.body.appendChild(card);
    await card.updateComplete;

    const root = card.shadowRoot!;
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content">
            <div class="summary"><span class="event-title">Meeting</span></div>
            <div class="time">10:00</div>
          </div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 60 },
      scrollHeight: { configurable: true, value: 90 },
    });

    card.updated(new Map());
    const observer = FiringResizeObserver.instances.at(-1)!;

    let scheduleCount = 0;
    const originalSchedule = card._scheduleGridDisclosureSafety.bind(card);
    card._scheduleGridDisclosureSafety = () => {
      scheduleCount += 1;
      originalSchedule();
    };

    // Detail rows must not be observed: a clip toggle would notify them every apply.
    const time = root.querySelector('.time')!;
    expect(observer.observed.has(time)).toBe(false);

    // Apply always unclips then may reclip, which reflows title/block. While suppress
    // is armed, even a full fire on every observed target must not re-arm schedule.
    card._applyGridDisclosureSafety();
    const before = scheduleCount;
    observer.fire();
    expect(scheduleCount).toBe(before);

    card.remove();
    FiringResizeObserver.instances = [];
  });

  it('drops the document.fonts listener when the observer stops', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;

    const listeners: Array<{ type: string; fn: EventListener }> = [];
    const fakeFonts = {
      ready: Promise.resolve(),
      addEventListener(type: string, fn: EventListener) {
        listeners.push({ type, fn });
      },
      removeEventListener(type: string, fn: EventListener) {
        const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    const originalFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      get: () => fakeFonts,
    });

    try {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: unknown): void;
        preview: boolean;
        updated(changedProps: Map<unknown, unknown>): void;
        readonly updateComplete: Promise<boolean>;
      };
      card.setConfig({ entities: [], view: 'grid' });
      card.preview = true;
      document.body.appendChild(card);
      await card.updateComplete;
      card.shadowRoot!.innerHTML = '<div class="grid-event"><div class="time">1</div></div>';
      card.updated(new Map());

      expect(listeners.some((l) => l.type === 'loadingdone')).toBe(true);

      card.remove();
      expect(listeners).toHaveLength(0);
    } finally {
      if (originalFonts) {
        Object.defineProperty(Document.prototype, 'fonts', originalFonts);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (document as any).fonts;
      }
    }
  });

  it('does not re-arm disclosure after stop when a pending fonts.ready resolves', async () => {
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver;

    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const listeners: Array<{ type: string; fn: EventListener }> = [];
    const fakeFonts = {
      ready,
      addEventListener(type: string, fn: EventListener) {
        listeners.push({ type, fn });
      },
      removeEventListener(type: string, fn: EventListener) {
        const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    const originalFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      get: () => fakeFonts,
    });

    try {
      const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
        setConfig(config: unknown): void;
        preview: boolean;
        updated(changedProps: Map<unknown, unknown>): void;
        readonly updateComplete: Promise<boolean>;
        _scheduleGridDisclosureSafety(): void;
        _applyGridDisclosureSafety(): void;
      };
      card.setConfig({ entities: [], view: 'grid' });
      card.preview = true;
      document.body.appendChild(card);
      await card.updateComplete;
      card.shadowRoot!.innerHTML = '<div class="grid-event"><div class="time">1</div></div>';
      card.updated(new Map());

      expect(listeners.some((l) => l.type === 'loadingdone')).toBe(true);

      let scheduleCount = 0;
      let applyCount = 0;
      card._scheduleGridDisclosureSafety = () => {
        scheduleCount += 1;
      };
      card._applyGridDisclosureSafety = () => {
        applyCount += 1;
      };

      card.remove();
      expect(listeners).toHaveLength(0);

      resolveReady();
      await ready;
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      expect(scheduleCount).toBe(0);
      expect(applyCount).toBe(0);
    } finally {
      if (originalFonts) {
        Object.defineProperty(Document.prototype, 'fonts', originalFonts);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (document as any).fonts;
      }
    }
  });
});
