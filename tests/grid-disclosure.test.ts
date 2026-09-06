import { afterEach, describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import { gridContentOverflows } from '../src/calendar-card-pro';

describe('grid disclosure safety', () => {
  it('tolerates a one-pixel rounding difference but detects a clipped detail row', () => {
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 61 })).toBe(false);
    expect(gridContentOverflows({ clientHeight: 60, scrollHeight: 62 })).toBe(true);
  });

  it('marks an overflowing timed block so CSS withdraws its optional detail rows', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as HTMLElement & {
      _applyGridDisclosureSafety(): void;
    };
    const root = card.attachShadow({ mode: 'open' });
    Object.defineProperty(card, 'renderRoot', { value: root });
    root.innerHTML = `
      <div class="grid-event">
        <div class="grid-event-disclosure">
          <div class="event-content"><div class="time">10:00</div></div>
        </div>
      </div>
    `;
    const content = root.querySelector<HTMLElement>('.event-content')!;
    Object.defineProperties(content, {
      clientHeight: { value: 60 },
      scrollHeight: { value: 66 },
    });

    card._applyGridDisclosureSafety();

    expect(root.querySelector('.grid-event')?.classList).toContain('grid-event-content-clipped');
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

    expect(root.querySelector('.grid-event')?.classList).not.toContain(
      'grid-event-content-clipped',
    );
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

  it('observes content-sized rows so a font load is not missed when the block height is fixed', async () => {
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
    expect(labels).toContain('time');
    expect(labels).toContain('location');

    card.remove();
    expect(gridObserver.disconnected).toBe(true);
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
});
