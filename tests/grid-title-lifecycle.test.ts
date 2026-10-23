import { afterEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type { Hass } from '../src/config/types';

interface TestCard extends HTMLElement {
  setConfig(config: unknown): void;
  preview: boolean;
  hass: Hass;
  updateEvents(): Promise<void>;
  updated(changes: Map<string, unknown>): void;
  readonly updateComplete: Promise<boolean>;
  _gridDisclosureChanged(changes: Map<string, unknown>): boolean;
  _gridDisclosureObserver: ResizeObserver | null;
  _gridDisclosureRaf: number | null;
  _gridDisclosureReleaseRaf: number | null;
  _gridDisclosureMutations: MutationObserver | null;
  _gridDisclosureDirty: Set<HTMLElement>;
  _applyGridDisclosureSafety(): void;
  _scheduleGridDisclosureSafety(all?: boolean): void;
  _syncGridDisclosureSafety(remeasure?: boolean): void;
  _scheduleGridScaleSync(): void;
  _syncOverflowStrip(): void;
  _tickNowLine(): void;
  requestUpdate(): void;
}

function card(): TestCard {
  const element = document.createElement('calendar-card-pro-dev') as unknown as TestCard;
  element.setConfig({
    entities: [{ entity: 'calendar.anna', label: 'person.anna' }],
    view: 'grid',
  });
  element.preview = true;
  return element;
}

function hass(): Hass {
  return {
    states: {},
    locale: { language: 'en' },
    callApi: async () => [],
    callService: () => {},
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Grid fitting invalidation', () => {
  it('does no full fitting pass for an unrelated Home Assistant update', () => {
    const element = card();
    const previous = hass();
    element.hass = { ...previous, locale: { language: 'en' }, states: { ...previous.states } };
    expect(element._gridDisclosureChanged(new Map([['hass', previous]]))).toBe(false);
  });

  it('invalidates language, config, event, and weather changes', () => {
    const element = card();
    const previous = hass();
    element.hass = { ...previous, locale: { language: 'he' } };
    expect(element._gridDisclosureChanged(new Map([['hass', previous]]))).toBe(true);
    for (const property of ['config', 'events', 'weatherForecasts', '_language']) {
      expect(element._gridDisclosureChanged(new Map([[property, undefined]]))).toBe(true);
    }
  });

  it.each(['card', 'shadow ancestor', 'document'])(
    'invalidates inherited language changes on the %s without a resize',
    async (scope) => {
      const ancestor = document.createElement('div');
      const root = ancestor.attachShadow({ mode: 'open' });
      document.body.append(ancestor);
      const element = card();
      vi.spyOn(element, 'updateEvents').mockResolvedValue(undefined);
      root.append(element);
      await element.updateComplete;
      element.shadowRoot!.innerHTML =
        '<div class="grid-event"><div class="grid-event-disclosure"><div class="event-content">' +
        '<div class="summary-row"><div class="summary"><span class="event-title">Library pickup</span></div></div>' +
        '</div></div></div>';
      const target =
        scope === 'card'
          ? element
          : scope === 'shadow ancestor'
            ? ancestor
            : document.documentElement;
      const previousLanguage = target.getAttribute('lang');
      target.setAttribute('lang', 'en');
      const schedule = vi
        .spyOn(element, '_scheduleGridDisclosureSafety')
        .mockImplementation(() => {});
      const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

      try {
        element.updated(new Map());
        await flush();
        schedule.mockClear();

        target.removeAttribute('lang');
        await flush();
        expect(schedule).toHaveBeenCalledExactlyOnceWith(true);

        schedule.mockClear();
        element.classList.add('calendar-card-title-scroll-paused');
        target.setAttribute('data-unrelated', 'changed');
        await flush();
        expect(schedule).not.toHaveBeenCalled();

        target.setAttribute('lang', 'de');
        await flush();
        expect(schedule).toHaveBeenCalledExactlyOnceWith(true);

        element.remove();
        schedule.mockClear();
        target.removeAttribute('lang');
        await flush();
        expect(schedule).not.toHaveBeenCalled();
      } finally {
        element.remove();
        if (previousLanguage === null) target.removeAttribute('lang');
        else target.setAttribute('lang', previousLanguage);
        target.removeAttribute('data-unrelated');
      }
    },
  );

  it('reacquires fitting on reconnect without a fetch or another Lit update', async () => {
    const element = card();
    vi.spyOn(element, 'updateEvents').mockResolvedValue(undefined);
    document.body.append(element);
    await element.updateComplete;
    element.shadowRoot!.innerHTML =
      '<div class="grid-event"><div class="grid-event-disclosure"><div class="event-content">' +
      '<div class="summary-row"><div class="summary"><span class="event-title">Library pickup</span></div></div>' +
      '</div></div></div>';
    element.updated(new Map());
    const firstObserver = element._gridDisclosureObserver;
    expect(firstObserver).not.toBeNull();
    element.remove();
    expect(element._gridDisclosureObserver).toBeNull();
    expect(element._gridDisclosureMutations).toBeNull();
    const render = vi.spyOn(element, 'updated');

    document.body.append(element);
    expect(element._gridDisclosureObserver).not.toBeNull();
    expect(element._gridDisclosureObserver).not.toBe(firstObserver);
    expect(element._gridDisclosureMutations).not.toBeNull();
    expect(element._gridDisclosureRaf).not.toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it('cancels the suppression-release frame as well as the pending fitting frame', async () => {
    const element = card();
    vi.spyOn(element, 'updateEvents').mockResolvedValue(undefined);
    document.body.append(element);
    await element.updateComplete;
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    element._applyGridDisclosureSafety();
    const release = element._gridDisclosureReleaseRaf;
    expect(release).not.toBeNull();
    element.remove();
    expect(cancel).toHaveBeenCalledWith(release);
    expect(element._gridDisclosureReleaseRaf).toBeNull();
    expect(element._gridDisclosureRaf).toBeNull();
  });
});

/**
 * The now line repaints once a minute through a bare `requestUpdate()`, which reaches
 * `updated()` with no changed properties — the same shape as every other bare request. Before
 * the two were told apart, each tick refit every block: 268 unchanged class and style writes a
 * minute on a modest week, 3,017 with ~500 events.
 */
describe('Grid fitting on the now line repaint', () => {
  async function connected(): Promise<{
    element: TestCard;
    sync: ReturnType<typeof vi.spyOn>;
  }> {
    const element = card();
    vi.spyOn(element, 'updateEvents').mockResolvedValue(undefined);
    document.body.append(element);
    await element.updateComplete;
    // Let anything the first render requested settle before the spy starts counting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
    const sync = vi.spyOn(element, '_syncGridDisclosureSafety');
    return { element, sync };
  }

  it('skips the full fitting pass for an update caused only by the tick', async () => {
    const { element, sync } = await connected();
    element._tickNowLine();
    await element.updateComplete;
    expect(sync).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('still refits for any other bare request', async () => {
    const { element, sync } = await connected();
    element.requestUpdate();
    await element.updateComplete;
    expect(sync).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('refits when another bare request lands in the same update as the tick', async () => {
    const { element, sync } = await connected();
    element.requestUpdate();
    element._tickNowLine();
    await element.updateComplete;
    expect(sync).toHaveBeenCalledExactlyOnceWith(true);

    sync.mockClear();
    element._tickNowLine();
    element.requestUpdate();
    await element.updateComplete;
    expect(sync).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('refits for a request a scale pass makes from inside updated()', async () => {
    const { element, sync } = await connected();
    let requested = false;
    vi.spyOn(element, '_syncOverflowStrip').mockImplementation(() => {
      if (requested) return;
      requested = true;
      element.requestUpdate();
    });
    element.requestUpdate();
    await element.updateComplete;
    await element.updateComplete;
    expect(sync.mock.calls).toEqual([[true], [true]]);
  });
});

/**
 * A repaint that skips the full pass can still add or remove blocks — an event ending under
 * `show_past_events: false`, lanes repacking — and the resize observer only knows the blocks it
 * was attached to. The disclosure observer reacts to elements arriving outside every block.
 */
describe('Grid structure changes outside a full refit', () => {
  const block = (title: string) =>
    '<div class="grid-event"><div class="grid-event-disclosure"><div class="event-content">' +
    `<div class="summary-row"><div class="summary"><span class="event-title">${title}</span></div></div>` +
    '</div></div></div>';

  async function observed(): Promise<TestCard> {
    const element = card();
    vi.spyOn(element, 'updateEvents').mockResolvedValue(undefined);
    document.body.append(element);
    await element.updateComplete;
    element.shadowRoot!.innerHTML = `<div class="grid-day-body"><div class="grid-day-plane">${block('Library pickup')}</div></div>`;
    element.updated(new Map([['config', undefined]]));
    expect(element._gridDisclosureObserver).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return element;
  }

  it('fits a block that arrived without a full refit, and remeasures the scale', async () => {
    const element = await observed();
    const schedule = vi
      .spyOn(element, '_scheduleGridDisclosureSafety')
      .mockImplementation(() => {});
    const scale = vi.spyOn(element, '_scheduleGridScaleSync').mockImplementation(() => {});
    const plane = element.shadowRoot!.querySelector('.grid-day-plane')!;
    plane.insertAdjacentHTML('beforeend', block('Swimming lesson'));
    const added = plane.lastElementChild as HTMLElement;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scale).toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledWith(false);
    expect(schedule).not.toHaveBeenCalledWith(true);
    expect([...element._gridDisclosureDirty]).toEqual([added]);
  });

  it('remeasures the scale when a block leaves', async () => {
    const element = await observed();
    const scale = vi.spyOn(element, '_scheduleGridScaleSync').mockImplementation(() => {});
    element.shadowRoot!.querySelector('.grid-event')!.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scale).toHaveBeenCalled();
  });

  it('ignores the probe the cascade measurement inserts, so a measurement cannot schedule another', async () => {
    const { SCALE_PROBE_CLASS } = await import('../src/utils/grid-cascade-threshold');
    const element = await observed();
    const scale = vi.spyOn(element, '_scheduleGridScaleSync').mockImplementation(() => {});
    const body = element.shadowRoot!.querySelector('.grid-day-body')!;
    const probe = document.createElement('div');
    probe.className = SCALE_PROBE_CLASS;
    body.appendChild(probe);
    probe.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scale).not.toHaveBeenCalled();
  });
});
