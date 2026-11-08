/**
 * The control that runs the card's own `tap_action` while the card hosts controls of its own.
 *
 * A button may not contain another, so a card whose toolbar, events or links are buttons is
 * not one itself. Until v5.1 it kept a tab stop anyway, so a screen reader met a focusable
 * container with no role and an Enter nobody announced. Its tap now has a native button of its
 * own, first in the card's Tab order (`Render.TapControl`). The wrapper's markup is pinned in
 * `card-wrapper-dom.test.ts`; this file pins how the card names the control and what pressing it
 * runs, on the real card.
 *
 * The toolbar defaults to hidden and `tap_action` to `none`, so every DOM gate built from default
 * config draws no control at all; every case here turns both on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import '../src/calendar-card-pro';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
const NOW = new Date(Date.UTC(2026, 5, 17, 10, 0));

/** A shown toolbar holding the refresh button and nothing else: the card hosts one control. */
const REFRESH_ONLY: Types.ToolbarConfig = {
  show: true,
  add_event: false,
  view_switcher: false,
  navigation: false,
  reset: false,
  refresh: true,
  legend: false,
};

const STRINGS: Record<string, string> = {
  'ui.common.refresh': 'Aktualisieren',
  'ui.common.reset': 'Zurücksetzen',
  'ui.common.back': 'Zurück',
  'ui.components.calendar.event.add': 'Termin hinzufügen',
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: unknown): void;
  hass?: unknown;
  isExpanded: boolean;
  readonly updateComplete: Promise<boolean>;
}

const callApi = vi.fn();

function hass(localize: (key: string) => string) {
  return {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { supported_features: 7, friendly_name: 'Anna' },
      },
    },
    locale: { language: 'en' },
    callApi,
    localize,
  };
}

async function settle(card: CardUnderTest): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

async function mount(
  overrides: Partial<Types.Config>,
  localize: (key: string) => string = (key) => STRINGS[key] ?? key,
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(
    buildConfig({
      entities: ['calendar.anna'],
      days_to_show: 3,
      toolbar: REFRESH_ONLY,
      ...overrides,
    }),
  );
  card.hass = hass(localize);
  document.body.appendChild(card);
  await settle(card);
  return card;
}

const haCard = (card: CardUnderTest) => card.shadowRoot!.querySelector<HTMLElement>('ha-card')!;
const control = (card: CardUnderTest) =>
  card.shadowRoot!.querySelector<HTMLButtonElement>('ha-card > button.card-tap-control');

/** Every `hass-action` the card hands Home Assistant. */
function listen(card: CardUnderTest): Array<Record<string, unknown>> {
  const fired: Array<Record<string, unknown>> = [];
  card.addEventListener('hass-action', (event) => {
    fired.push((event as unknown as { detail: Record<string, unknown> }).detail);
  });
  return fired;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  callApi.mockReset();
  callApi.mockResolvedValue([
    {
      summary: 'Dentist',
      start: { dateTime: '2026-06-17T14:00:00Z' },
      end: { dateTime: '2026-06-17T15:00:00Z' },
    },
    {
      summary: 'Piano',
      start: { dateTime: '2026-06-18T16:00:00Z' },
      end: { dateTime: '2026-06-18T17:00:00Z' },
    },
  ]);
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
});

describe("the card's tap, while the card hosts controls", () => {
  it('is a control of its own, first in the Tab order, and the card is no tab stop', async () => {
    const card = await mount({ title: 'Family', tap_action: { action: 'more-info' } });

    expect(haCard(card).hasAttribute('tabindex')).toBe(false);
    expect(haCard(card).hasAttribute('role')).toBe(false);
    const first = card.shadowRoot!.querySelector('button, [tabindex], a[href]');
    expect(first).toBe(control(card));
    // The denominator: the card does host a control, the refresh button after it.
    expect(card.shadowRoot!.querySelector('.refresh-button')).not.toBeNull();
  });

  it("is named after the card for one of Home Assistant's actions, and runs it", async () => {
    const card = await mount({ title: 'Family', tap_action: { action: 'more-info' } });
    const fired = listen(card);

    expect(control(card)!.getAttribute('aria-label')).toBe('Family');
    expect(control(card)!.hasAttribute('aria-expanded')).toBe(false);

    control(card)!.click();
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      action: 'tap',
      config: { tap_action: { action: 'more-info' } },
    });
  });

  it("is named after the card's first calendar where the card has no title", async () => {
    const card = await mount({
      tap_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    });

    expect(control(card)!.getAttribute('aria-label')).toBe('Anna');
  });

  it("takes Home Assistant's word for an action a button of the card's own runs", async () => {
    const labels: Record<string, string> = {};
    for (const action of ['refresh', 'reset', 'back', 'add-event']) {
      const card = await mount({ title: 'Family', tap_action: { action } as Types.ActionConfig });
      labels[action] = control(card)?.getAttribute('aria-label') ?? '(no control)';
      card.remove();
    }

    // Reset runs only while there is something to reset, so a fresh card offers no tap at all.
    expect(labels).toEqual({
      refresh: 'Aktualisieren',
      reset: '(no control)',
      back: 'Zurück',
      'add-event': 'Termin hinzufügen',
    });
  });

  it('falls back to English where Home Assistant has no word', async () => {
    const card = await mount({ tap_action: { action: 'refresh' } }, () => '');

    expect(control(card)!.getAttribute('aria-label')).toBe('Refresh');
  });

  it('runs a refresh from the control', async () => {
    const card = await mount({ tap_action: { action: 'refresh' } });
    const before = callApi.mock.calls.length;

    control(card)!.click();
    await settle(card);

    expect(callApi.mock.calls.length).toBeGreaterThan(before);
  });

  it('says whether an expanding card is expanded, and expands it', async () => {
    const card = await mount({
      title: 'Family',
      tap_action: { action: 'expand' },
      compact_events_to_show: 1,
    });

    expect(control(card)!.getAttribute('aria-label')).toBe('Family');
    expect(control(card)!.getAttribute('aria-expanded')).toBe('false');

    control(card)!.click();
    await settle(card);

    expect(card.isExpanded).toBe(true);
    expect(control(card)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('says nothing about expanding where there is nothing to fold', async () => {
    const card = await mount({ title: 'Family', tap_action: { action: 'expand' } });

    expect(control(card)!.hasAttribute('aria-expanded')).toBe(false);
  });
});

describe('the control, where the card needs none', () => {
  it('is not drawn for a card that is a button itself', async () => {
    const card = await mount({
      title: 'Family',
      tap_action: { action: 'more-info' },
      toolbar: { show: false },
    });

    expect(control(card)).toBeNull();
    expect(haCard(card).getAttribute('role')).toBe('button');
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
  });

  it('is not drawn for a card with no tap action', async () => {
    const card = await mount({ title: 'Family' });

    expect(control(card)).toBeNull();
    expect(haCard(card).hasAttribute('tabindex')).toBe(false);
  });
});

describe("focus on the card's tap, as the card starts or stops hosting controls", () => {
  it('moves from the card to the control when events that are buttons arrive', async () => {
    let answer: (events: unknown[]) => void = () => {};
    callApi.mockReset();
    callApi.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const card = await mount({
      title: 'Family',
      tap_action: { action: 'more-info' },
      event_tap_action: { action: 'details' },
      toolbar: { show: false },
    });
    // Loading: nothing in it to press, so the card is the button, and the keyboard is on it.
    expect(control(card)).toBeNull();
    haCard(card).focus();
    expect(card.shadowRoot!.activeElement).toBe(haCard(card));

    answer([
      {
        summary: 'Dentist',
        start: { dateTime: '2026-06-17T14:00:00Z' },
        end: { dateTime: '2026-06-17T15:00:00Z' },
      },
    ]);
    await settle(card);

    expect(control(card)).not.toBeNull();
    expect(card.shadowRoot!.activeElement).toBe(control(card));
  });

  it('moves from the control back to the card when the controls go', async () => {
    const config = { title: 'Family', tap_action: { action: 'more-info' } } as const;
    const card = await mount(config);
    control(card)!.focus();
    expect(card.shadowRoot!.activeElement).toBe(control(card));

    card.setConfig(buildConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config }));
    await settle(card);

    expect(control(card)).toBeNull();
    expect(haCard(card).getAttribute('tabindex')).toBe('0');
    expect(card.shadowRoot!.activeElement).toBe(haCard(card));
  });

  it('leaves focus anywhere else where it is', async () => {
    const card = await mount({ title: 'Family', tap_action: { action: 'more-info' } });
    const refresh = card.shadowRoot!.querySelector<HTMLElement>('.refresh-button')!;
    refresh.focus();
    card.setConfig(
      buildConfig({
        entities: ['calendar.anna'],
        days_to_show: 4,
        toolbar: REFRESH_ONLY,
        title: 'Family',
        tap_action: { action: 'more-info' },
      }),
    );
    await settle(card);

    expect(card.shadowRoot!.activeElement).toBe(card.shadowRoot!.querySelector('.refresh-button'));
  });
});
