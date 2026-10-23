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
  _applyGridDisclosureSafety(): void;
  _scheduleGridDisclosureSafety(all?: boolean): void;
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
