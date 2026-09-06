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
});
