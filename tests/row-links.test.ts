import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import * as Constants from '../src/config/constants';
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
 * Links in event rows (`open_links`): which rows draw them, what they are, and that a press on
 * one is the link's, under the gesture model in docs/architecture.md.
 *
 * The option defaults off, so the suite built from default config never draws a link; every
 * case here turns it on, and the states that must draw none are cases of their own.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  preview: boolean;
  readonly updateComplete: Promise<boolean>;
}

interface HassActionDetail {
  action: string;
}

const ANNA = 'calendar.anna';

const STATES = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { supported_features: 7 } },
};

const MEET = 'https://meet.example.com/swim-123';
const PLAN = 'https://docs.example.com/plan?a=1&b=2';

/** A video call in its location, a calendar's anchor and a bare address in its description. */
const EVENTS = [
  {
    summary: 'Swim practice',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    location: `Call ${MEET}`,
    description: `Read <a href="https://docs.example.com/plan?a=1&amp;b=2">the plan</a>, then ${MEET}.`,
    uid: 'uid-swim',
  },
  {
    summary: 'Piano',
    start: { dateTime: '2026-06-17T16:00:00Z' },
    end: { dateTime: '2026-06-17T17:00:00Z' },
    location: 'Music school',
    description: 'Bring the <a href="javascript:alert(1)">red book</a>',
    uid: 'uid-piano',
  },
];

const LINKS = { open_links: true, show_location: true, show_description: true } as const;

async function mount(config: Record<string, unknown>) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({ entities: [ANNA], days_to_show: 1, ...config });
  card.hass = {
    states: STATES as unknown as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async () => EVENTS),
    callService: vi.fn(),
    localize: (key: string) => key,
  } as unknown as Types.Hass;

  const hassActions: HassActionDetail[] = [];
  card.addEventListener('hass-action', (ev) =>
    hassActions.push((ev as Event & { detail: HassActionDetail }).detail),
  );

  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain('Swim practice'));
  return { card, hassActions };
}

const all = <T extends Element = HTMLElement>(card: Card, selector: string): T[] =>
  Array.from(card.shadowRoot!.querySelectorAll<T>(selector));

const links = (card: Card) => all<HTMLAnchorElement>(card, 'a.event-link');

/** Each row's location and description, as the text the reader sees. */
const rowText = (card: Card) =>
  all(card, '.location span, .description span').map((span) => span.textContent);

function pointer(target: Element, type: string, pointerType = 'mouse', x = 400, y = 300): void {
  const ev = new Event(type, { bubbles: true, composed: true });
  target.dispatchEvent(
    Object.assign(ev, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType,
      clientX: x,
      clientY: y,
    }),
  );
}

/**
 * Dispatch a click, and report whether anything before the window refused its default, which for
 * a link is following it. The window then refuses it itself, so the test browser never fetches
 * the address.
 *
 * @returns Whether the card, or anything else on the way up, prevented the click's default
 */
function click(target: Element): boolean {
  let prevented = true;
  const last = (ev: Event) => {
    prevented = ev.defaultPrevented;
    ev.preventDefault();
  };
  window.addEventListener('click', last, { once: true });
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }),
  );
  window.removeEventListener('click', last);
  return prevented;
}

/** A press and release where it started, then the click a browser derives from them. */
function tap(target: Element): boolean {
  pointer(target, 'pointerdown');
  pointer(target, 'pointerup');
  return click(target);
}

/** A press held past the hold threshold, then released. */
function hold(target: Element): boolean {
  pointer(target, 'pointerdown');
  vi.advanceTimersByTime(Constants.TIMING.HOLD_THRESHOLD + 1);
  pointer(target, 'pointerup');
  return click(target);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('open_links: what a row draws', () => {
  it.each(['list', 'column'])(
    'links the addresses in %s rows, and keeps every word of them',
    async (view) => {
      const plain = await mount({ view, show_location: true, show_description: true });
      const words = rowText(plain.card);
      expect(links(plain.card)).toEqual([]);
      document.body.replaceChildren();

      const { card } = await mount({ view, ...LINKS });

      expect(links(card).map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        [MEET, MEET],
        ['the plan', PLAN],
        [MEET, MEET],
      ]);
      for (const a of links(card)) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
      expect(rowText(card)).toEqual(words);
    },
  );

  it('never links an address that is not http or https', async () => {
    const { card } = await mount(LINKS);
    expect(links(card).some((a) => a.textContent === 'red book')).toBe(false);
    expect(card.shadowRoot!.textContent).toContain('Bring the red book');
  });

  it.each([
    ['the option is off', { show_location: true, show_description: true }],
    ['events open their details', { ...LINKS, event_tap_action: { action: 'details' } }],
    ['events have a hold', { ...LINKS, event_hold_action: { action: 'details' } }],
    [
      "events run one of Home Assistant's actions",
      { ...LINKS, event_tap_action: { action: 'url', url_path: 'https://example.com' } },
    ],
    ['the card is a grid', { ...LINKS, view: 'grid', time_grid: { show_location: true } }],
  ])('draws no link when %s', async (_name, config) => {
    const { card } = await mount(config);
    expect(links(card)).toEqual([]);
  });

  it("still links where an event's action is the card's own, which on an event is none", async () => {
    const { card } = await mount({ ...LINKS, event_tap_action: { action: 'expand' } });
    expect(links(card)).toHaveLength(3);
  });

  it('draws the links in the editor preview, where events are no targets', async () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
    card.preview = true;
    card.setConfig({ entities: [ANNA], days_to_show: 1, ...LINKS });
    card.hass = {
      states: STATES as unknown as Types.Hass['states'],
      locale: { language: 'en', time_format: '24' },
      callApi: vi.fn(async () => EVENTS),
      localize: (key: string) => key,
    } as unknown as Types.Hass;
    document.body.appendChild(card);
    await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain('Swim practice'));
    expect(links(card)).toHaveLength(3);
  });
});

describe('open_links: a press on a link is the link', () => {
  const CARD_ACTIONS = {
    ...LINKS,
    tap_action: { action: 'navigate', navigation_path: '/tapped' },
    hold_action: { action: 'navigate', navigation_path: '/held' },
  } as const;

  it("follows the link and never runs the card's tap", async () => {
    const { card, hassActions } = await mount(CARD_ACTIONS);
    // Nothing captured the pointer or swallowed the click, so the browser follows the link.
    expect(tap(links(card)[0])).toBe(false);
    expect(hassActions).toEqual([]);
  });

  it("never runs the card's hold either", async () => {
    const { card, hassActions } = await mount(CARD_ACTIONS);
    hold(links(card)[1]);
    expect(hassActions).toEqual([]);
  });

  it("keeps the card's tap and hold everywhere else in the same row", async () => {
    const { card, hassActions } = await mount(CARD_ACTIONS);
    const title = all(card, '.event-title')[0] ?? all(card, '.summary')[0];
    tap(title);
    hold(title);
    expect(hassActions.map((detail) => detail.action)).toEqual(['tap', 'hold']);
  });

  it('captures no pointer for a press on a link, so its click reaches the link', async () => {
    const { card } = await mount(CARD_ACTIONS);
    const haCard = all(card, 'ha-card')[0];
    const capture = vi.fn();
    Object.assign(haCard, { setPointerCapture: capture, hasPointerCapture: () => false });

    tap(links(card)[0]);
    expect(capture).not.toHaveBeenCalled();

    // The control: a press beside the link, in the same row, is the card's and captures.
    tap(all(card, '.location ha-icon')[0]);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("marks the press as not the card's, so its ripple stays still", async () => {
    const { card } = await mount(CARD_ACTIONS);
    const haCard = all(card, 'ha-card')[0];
    pointer(links(card)[0], 'pointerdown');
    expect(haCard.hasAttribute('data-own-press')).toBe(true);
  });

  it("leaves Enter on a focused link to the link, not the card's tap", async () => {
    const { card, hassActions } = await mount(CARD_ACTIONS);
    const key = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    links(card)[0].dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(hassActions).toEqual([]);
  });

  describe('on a card that swipes', () => {
    const SWIPES = {
      ...CARD_ACTIONS,
      days_to_show: 7,
      toolbar: {
        show: true,
        navigation: true,
        view_switcher: false,
        add_event: false,
        refresh: false,
      },
    } as const;
    const range = (card: Card) => all(card, '.toolbar-range-text')[0]?.textContent?.trim();

    it('pages for a finger swiping from a link, and taps the link where it stays put', async () => {
      const { card, hassActions } = await mount(SWIPES);
      const before = range(card);
      expect(before).toBeTruthy();

      // A tap with a finger: the link's, with no tap of the card's, and armed to page without
      // capturing the finger, which would take the click it derives away from the link.
      const capture = vi.fn();
      Object.assign(all(card, 'ha-card')[0], {
        setPointerCapture: capture,
        hasPointerCapture: () => false,
      });
      pointer(links(card)[0], 'pointerdown', 'touch');
      pointer(links(card)[0], 'pointerup', 'touch');
      expect(hassActions).toEqual([]);
      expect(range(card)).toBe(before);
      expect(capture).not.toHaveBeenCalled();

      // A swipe starting on the same link pages, as it would anywhere on the days.
      const link = links(card)[0];
      pointer(link, 'pointerdown', 'touch', 400, 300);
      for (const x of [370, 340, 310, 280]) pointer(link, 'pointermove', 'touch', x, 305);
      pointer(link, 'pointerup', 'touch', 280, 305);
      await vi.waitFor(() => expect(range(card)).not.toBe(before));
      expect(hassActions).toEqual([]);
    });
  });

  it('stops presenting the card as a button while it holds a link', async () => {
    const withLinks = await mount(CARD_ACTIONS);
    const haCard = all(withLinks.card, 'ha-card')[0];
    expect(haCard.getAttribute('role')).toBeNull();
    // It keeps its tab stop, so Enter on the card itself still runs its tap.
    expect(haCard.getAttribute('tabindex')).toBe('0');
    document.body.replaceChildren();

    // The control: the same card with nothing to link is a button as before.
    const without = await mount({ ...CARD_ACTIONS, open_links: false });
    expect(all(without.card, 'ha-card')[0].getAttribute('role')).toBe('button');
  });
});
