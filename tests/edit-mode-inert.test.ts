import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import {
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
} from '../src/interaction/ha-calendar-dialogs';

/**
 * Nothing the card draws for someone editing a dashboard may write to a calendar.
 *
 * Home Assistant sets `preview` on a card in the card editor's live preview and `editMode`
 * on one on a dashboard in edit mode. A press there is someone trying the configuration or
 * arranging the dashboard, and the dialogs the card opens save real events. So while either
 * is set the add button is drawn, keeping the layout the dashboard will have, but opens
 * nothing; events are not tap targets at all; and the functions that open the dialogs
 * refuse, for anything that reaches them anyway.
 *
 * Both flags default off, so every other suite runs with them clear and could not notice
 * either being ignored. Each case here is paired with the same card with the flag cleared,
 * which must work, so a pass cannot come from a fixture that never opens anything.
 */

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  preview: boolean;
  editMode: boolean;
  events: Types.CalendarEventData[];
  readonly updateComplete: Promise<boolean>;
}

type Flag = 'preview' | 'editMode';

const EVENTS = [
  {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    uid: 'uid-dentist',
  },
];

async function mount(config: Record<string, unknown>, flag?: Flag) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });
  if (flag) card[flag] = true;
  card.hass = {
    states: {
      'calendar.anna': {
        entity_id: 'calendar.anna',
        state: 'off',
        attributes: { supported_features: 7 },
      },
    } as Types.Hass['states'],
    locale: { language: 'en', time_format: '24' },
    localize: (key: string) => (key === 'ui.components.calendar.event.add' ? 'Add event' : ''),
    callApi: vi.fn(async () => EVENTS),
    callService: vi.fn(),
  } as unknown as Types.Hass;

  // Everything the card could dispatch to open something or to leave the dashboard,
  // fallbacks included.
  const opened: string[] = [];
  for (const type of ['show-dialog', 'hass-action', 'hass-more-info', 'location-changed']) {
    card.addEventListener(type, () => opened.push(type));
  }

  document.body.appendChild(card);
  await vi.waitFor(() => expect(eventRoots(card).length).toBeGreaterThan(0));
  return { card, opened };
}

function eventRoots(card: Card): HTMLElement[] {
  return Array.from(card.shadowRoot?.querySelectorAll<HTMLElement>('.event') ?? []).filter((el) =>
    el.textContent?.includes('Dentist'),
  );
}

function addButton(card: Card): HTMLButtonElement | null {
  return card.shadowRoot!.querySelector<HTMLButtonElement>('.add-event-button');
}

/** A pointer tap and its click, a bare click, and Enter and Space: every way to activate. */
function activateEveryWay(target: Element): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const ev = new Event(type, { bubbles: true, composed: true });
    target.dispatchEvent(
      Object.assign(ev, { pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0 }),
    );
  }
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  for (const [type, key] of [
    ['keydown', 'Enter'],
    ['keydown', ' '],
    ['keyup', ' '],
  ]) {
    target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, composed: true }));
  }
}

/** The innermost element showing the event's title, where a real pointer lands. */
function leaf(root: Element): Element {
  const leaves = Array.from(root.querySelectorAll('*')).filter((el) =>
    el.textContent?.includes('Dentist'),
  );
  return leaves[leaves.length - 1] ?? root;
}

/** Let the async open finish; it awaits the loader before dispatching. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeAll(() => {
  customElements.define(EVENT_DETAIL_DIALOG_TAG, class extends HTMLElement {});
  customElements.define(EVENT_EDITOR_DIALOG_TAG, class extends HTMLElement {});
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each<Flag>(['preview', 'editMode'])('while %s is set', (flag) => {
  it('draws the add button, and a press on it opens nothing', async () => {
    const { card, opened } = await mount({ show_add_event: true }, flag);

    expect(addButton(card)).not.toBeNull();
    addButton(card)!.click();
    await settle();
    expect(opened).toEqual([]);

    // The control: the same card, no longer being edited, opens the dialog.
    card[flag] = false;
    await card.updateComplete;
    addButton(card)!.click();
    await settle();
    expect(opened).toEqual(['show-dialog']);
  });

  it.each(['list', 'column', 'grid'])(
    'leaves %s events inert, with no role, no tab stop and no action',
    async (view) => {
      const { card, opened } = await mount({ view, event_tap_action: { action: 'details' } }, flag);

      const root = card.shadowRoot!;
      expect(root.querySelectorAll('.event-interactive, .event-button')).toHaveLength(0);
      expect(root.querySelectorAll('.content-container [role="button"]')).toHaveLength(0);
      expect(
        root.querySelectorAll('.content-container [tabindex]:not(.grid-container)'),
      ).toHaveLength(0);
      activateEveryWay(leaf(eventRoots(card)[0]));
      activateEveryWay(eventRoots(card)[0]);
      await settle();
      expect(opened).toEqual([]);

      // The control: cleared, the same event is a button and activating it opens it.
      card[flag] = false;
      await card.updateComplete;
      const button = root.querySelector<HTMLElement>('.content-container [role="button"]');
      expect(button?.textContent).toContain('Dentist');
      button!.click();
      await settle();
      expect(opened).toEqual(['show-dialog']);
    },
  );

  it('refuses to open either dialog when asked directly', async () => {
    // The last guard, for anything that reaches the openers past the inert markup: a render
    // made before the flag was set, or a future caller.
    const { card, opened } = await mount({ event_tap_action: { action: 'details' } }, flag);
    const openers = card as unknown as {
      _openEventDetails(event: Types.CalendarEventData, color: string | undefined): void;
      _openCreateEventDialog(calendarId: string): void;
    };
    const event = card.events.find((candidate) => candidate.summary === 'Dentist')!;

    openers._openEventDetails(event, undefined);
    openers._openCreateEventDialog('calendar.anna');
    await settle();
    expect(opened).toEqual([]);

    card[flag] = false;
    openers._openEventDetails(event, undefined);
    await settle();
    openers._openCreateEventDialog('calendar.anna');
    await settle();
    expect(opened).toEqual(['show-dialog', 'show-dialog']);
  });

  it("leaves the card's own tap action as it was", async () => {
    // Out of scope here, and pinned so that stays true: a tap on the card still runs it.
    const { card, opened } = await mount(
      { tap_action: { action: 'more-info' }, event_tap_action: { action: 'details' } },
      flag,
    );

    const haCard = card.shadowRoot!.querySelector('ha-card')!;
    for (const type of ['pointerdown', 'pointerup']) {
      const ev = new Event(type, { bubbles: true, composed: true });
      haCard.dispatchEvent(
        Object.assign(ev, { pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0 }),
      );
    }
    await settle();
    expect(opened).toEqual(['hass-action']);
  });
});
