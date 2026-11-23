import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
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

/**
 * `expand` folds only a List with compact limits, so anywhere else it is no action: the card draws
 * no ripple, no pointer cursor and no tab stop for a press that would do nothing, as it already
 * did for `add-event`, `reset` and `back` where they cannot run (`_cardActionRuns`).
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly effectiveView: Types.EffectiveView;
  readonly updateComplete: Promise<boolean>;
}

const ANNA = 'calendar.anna';
const EVENTS = [17, 18, 19, 20].map((day) => ({
  summary: `Event ${day}`,
  start: { dateTime: `2026-06-${day}T12:00:00Z` },
  end: { dateTime: `2026-06-${day}T13:00:00Z` },
}));

async function mount(config: Record<string, unknown>): Promise<Card> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({ entities: [ANNA], days_to_show: 4, ...config });
  card.hass = {
    states: { [ANNA]: { entity_id: ANNA, state: 'off', attributes: {} } },
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => EVENTS),
    callService: vi.fn(),
    localize: (key: string) => key,
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent ?? '').toContain('Event 17'));
  await card.updateComplete;
  return card;
}

/** What the card advertises: the ripple, the class that carries the pointer cursor, a tab stop. */
function advertised(card: Card) {
  const haCard = card.shadowRoot!.querySelector('ha-card')!;
  return {
    ripple: haCard.querySelector(':scope > ha-ripple') !== null,
    interactive: haCard.classList.contains('card-interactive'),
    tabStop:
      haCard.getAttribute('tabindex') === '0' ||
      card.shadowRoot!.querySelector('.card-tap-control') !== null,
  };
}

const ON = { ripple: true, interactive: true, tabStop: true };
const OFF = { ripple: false, interactive: false, tabStop: false };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('the expand action', () => {
  it('is advertised in List with compact limits', async () => {
    const card = await mount({
      view: 'list',
      tap_action: { action: 'expand' },
      compact_events_to_show: 2,
    });
    expect(card.effectiveView).toBe('list');
    expect(advertised(card)).toEqual(ON);
  });

  it('is no action in List without compact limits', async () => {
    const card = await mount({ view: 'list', tap_action: { action: 'expand' } });
    expect(advertised(card)).toEqual(OFF);
  });

  it.each(['grid', 'month'] as const)('is no action in %s, compact limits or not', async (view) => {
    const card = await mount({
      view,
      tap_action: { action: 'expand' },
      hold_action: { action: 'expand' },
      compact_events_to_show: 2,
    });
    expect(card.effectiveView).toBe(view);
    expect(advertised(card)).toEqual(OFF);
  });

  it('leaves every other action advertised in Grid', async () => {
    const card = await mount({
      view: 'grid',
      tap_action: { action: 'more-info' },
      compact_events_to_show: 2,
    });
    expect(advertised(card)).toEqual(ON);
  });
});

describe('a compact height alone', () => {
  /** The height and cap the card writes on `ha-card`. */
  function drawn(card: Card) {
    const style = card.shadowRoot!.querySelector<HTMLElement>('ha-card')!.style;
    return { height: style.height, max: style.maxHeight };
  }

  /** Presses the card once, as a tap does. */
  async function tap(card: Card): Promise<void> {
    (card as unknown as { toggleExpanded(): void }).toggleExpanded();
    await card.updateComplete;
  }

  it('folds a List card with no event or day limit: compact, then the card’s own once expanded', async () => {
    const card = await mount({
      view: 'list',
      tap_action: { action: 'expand' },
      card_height: 'calc(100dvh - 56px)',
      list: { compact_card_height: '300px' },
    });
    expect(advertised(card)).toEqual(ON);
    expect(drawn(card)).toEqual({ height: '300px', max: '' });
    await tap(card);
    expect(drawn(card)).toEqual({ height: 'calc(100dvh - 56px)', max: '' });
    // Every event is drawn in both states; only the height changes.
    expect(card.shadowRoot!.textContent).toContain('Event 20');
    await tap(card);
    expect(drawn(card)).toEqual({ height: '300px', max: '' });
  });

  it('caps the compact card, which grows with its events up to the cap', async () => {
    const card = await mount({
      view: 'list',
      tap_action: { action: 'expand' },
      compact_card_max_height: '20em',
    });
    expect(advertised(card)).toEqual(ON);
    expect(drawn(card)).toEqual({ height: '', max: '20em' });
    await tap(card);
    expect(drawn(card)).toEqual({ height: '', max: '' });
  });

  it('is no action where it would change nothing: the card’s own height, or another layout', async () => {
    const same = await mount({
      view: 'list',
      tap_action: { action: 'expand' },
      card_height: '400px',
      compact_card_height: '400px',
    });
    expect(advertised(same)).toEqual(OFF);
    document.body.replaceChildren();
    const column = await mount({
      view: 'column',
      tap_action: { action: 'expand' },
      card_height: '600px',
      compact_card_height: '300px',
    });
    expect(column.effectiveView).toBe('column');
    expect(advertised(column)).toEqual(OFF);
    expect(drawn(column)).toEqual({ height: '600px', max: '' });
  });
});
