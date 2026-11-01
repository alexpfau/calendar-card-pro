/**
 * A calendar write through one of Home Assistant's dialogs, and the windows stored on disk.
 *
 * Every card on the page refreshes after a write, but only for the window it is drawing. The
 * windows stored in `localStorage` for anything else kept looking fresh: home's, while the
 * writing card was paged away, and those of cards on another view or dashboard. With
 * `refresh_on_navigate: false` a card trusts a fresh entry, so a reload within
 * `refresh_interval` drew the events from before the write, and fetched nothing.
 *
 * A write now marks every stored window holding a calendar it may have touched as due. A
 * card appearing draws it first, as it draws any entry, and then fetches. Everything else is
 * pinned beside that: the default `refresh_on_navigate: true`, a write at home, a calendar the
 * write cannot have touched, and a request that started before the write and lands after it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import {
  EVENT_DETAIL_DIALOG_TAG,
  EVENT_EDITOR_DIALOG_TAG,
} from '../src/interaction/ha-calendar-dialogs';
import * as EventUtils from '../src/utils/events';
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

interface Card extends HTMLElement {
  setConfig(config: unknown): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
}

interface DialogDetail {
  dialogTag: string;
  dialogParams: { calendarId?: string; updated: () => unknown };
}

const event = (summary: string, day: number, hour: number) => {
  const at = (h: number) => `2026-06-${day}T${String(h).padStart(2, '0')}:00:00Z`;
  return {
    summary,
    start: { dateTime: at(hour) },
    end: { dateTime: at(hour + 1) },
    uid: `uid-${summary}`,
  };
};

/** Home is June 17–19; the next page is June 20–22. */
const DENTIST = event('Dentist', 17, 14);
/** The event a save adds, so a card drawing it proves it saw an answer from after the save. */
const LUNCH = event('Lunch', 17, 12);
const PIANO = event('Piano', 17, 16);
/** On the next page, until an edit moves it home. */
const RECITAL = event('Recital', 21, 18);
const RECITAL_MOVED = event('Recital', 17, 18);

/** What each calendar holds right now; a save changes it. */
let calendars: Record<string, unknown[]> = {};

/** Calendars the user may write to; any other is read-only. */
const WRITABLE = new Set(['calendar.anna', 'calendar.ben']);

function makeHass(callApi: ReturnType<typeof vi.fn>): Types.Hass {
  return {
    states: Object.fromEntries(
      ['calendar.anna', 'calendar.ben', 'calendar.holidays'].map((id) => [
        id,
        {
          entity_id: id,
          state: 'off',
          attributes: { supported_features: WRITABLE.has(id) ? 7 : 0 },
        },
      ]),
    ),
    locale: { language: 'en', time_format: '24' },
    callApi,
    callService: vi.fn(),
    localize: (key: string) => key,
  } as unknown as Types.Hass;
}

/** Answers from `calendars`, now, unless a test holds the answer back. */
function answering() {
  return vi.fn((_method: string, path: string) => {
    const id = path.split('?')[0].replace('calendars/', '');
    return Promise.resolve<unknown>([...(calendars[id] ?? [])]);
  });
}

async function settle(card: Card): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
}

const TOOLBAR = { show: true, view_switcher: false, legend: false, refresh: false };

async function mount(config: Record<string, unknown>, callApi = answering()) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  card.setConfig(buildConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config }));
  card.hass = makeHass(callApi);
  const dialogs: DialogDetail[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: DialogDetail }).detail),
  );
  document.body.appendChild(card);
  await settle(card);
  return { card, callApi, dialogs };
}

/** Which of the fixture's events a card draws. */
function drawn(card: Card): string[] {
  const text = card.shadowRoot?.textContent ?? '';
  return [DENTIST, LUNCH, PIANO, RECITAL]
    .map(({ summary }) => summary)
    .filter((summary) => text.includes(summary));
}

async function pageForward(card: Card): Promise<void> {
  card.shadowRoot!.querySelectorAll<HTMLElement>('.date-navigation-segment')[2].click();
  await settle(card);
}

/**
 * Save through a dialog: the add dialog from the toolbar, or the details dialog from an event.
 * Anna's calendar then holds what the save left, and the dialog reports it.
 *
 * @param card - The card the dialog opens from
 * @param dialogs - The dialogs it has opened
 * @param how - Which dialog, and for details the event it opens on
 * @param after - Anna's events once the save landed; by default Lunch is added
 */
async function save(
  card: Card,
  dialogs: DialogDetail[],
  how: 'add' | { details: string },
  after: unknown[] = [DENTIST, LUNCH],
): Promise<void> {
  if (how === 'add') {
    card.shadowRoot!.querySelector<HTMLElement>('.add-event-button')!.click();
  } else {
    Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>('.event'))
      .find((el) => el.textContent?.includes(how.details))!
      .querySelector<HTMLElement>('[role="button"]')!
      .click();
  }
  await settle(card);
  expect(dialogs).toHaveLength(1);
  calendars['calendar.anna'] = after;
  dialogs[0].dialogParams.updated();
  await settle(card);
}

/** Leave the page, and come back ten seconds later with the same configuration. */
async function reload(card: Card, config: Record<string, unknown>) {
  card.remove();
  await vi.advanceTimersByTimeAsync(10_000);
  return mount(config);
}

beforeAll(() => {
  customElements.define(EVENT_DETAIL_DIALOG_TAG, class extends HTMLElement {});
  customElements.define(EVENT_EDITOR_DIALOG_TAG, class extends HTMLElement {});
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();
  calendars = { 'calendar.anna': [DENTIST], 'calendar.ben': [PIANO], 'calendar.holidays': [] };
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a write while the card is paged away from home', () => {
  const config = { toolbar: TOOLBAR, refresh_on_navigate: false };

  it('through the add dialog: a reload fetches home again and draws the new event', async () => {
    const first = await mount(config);
    expect(drawn(first.card)).toEqual(['Dentist']);
    await pageForward(first.card);

    await save(first.card, first.dialogs, 'add');

    const second = await reload(first.card, config);
    expect(drawn(second.card)).toEqual(['Dentist', 'Lunch']);
    expect(second.callApi).toHaveBeenCalledTimes(1);
  });

  it('through the details dialog: an event moved onto a home date is there after a reload', async () => {
    calendars['calendar.anna'] = [DENTIST, RECITAL];
    const withDetails = { ...config, event_tap_action: { action: 'details' } };
    const first = await mount(withDetails);
    expect(drawn(first.card)).toEqual(['Dentist']);
    await pageForward(first.card);
    expect(drawn(first.card)).toEqual(['Recital']);

    await save(first.card, first.dialogs, { details: 'Recital' }, [DENTIST, RECITAL_MOVED]);
    expect(drawn(first.card)).toEqual([]);

    const second = await reload(first.card, withDetails);
    expect(drawn(second.card)).toEqual(['Dentist', 'Recital']);
    expect(second.callApi).toHaveBeenCalledTimes(1);
  });

  it('draws the stored events first, as any appearing card does, then the fetched ones', async () => {
    const first = await mount(config);
    await pageForward(first.card);
    await save(first.card, first.dialogs, 'add');

    first.card.remove();
    await vi.advanceTimersByTimeAsync(10_000);
    let answer: (events: unknown) => void = () => {};
    const held = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const second = await mount(config, held);

    expect(held).toHaveBeenCalledTimes(1);
    expect(drawn(second.card)).toEqual(['Dentist']);
    answer([DENTIST, LUNCH]);
    await settle(second.card);
    expect(drawn(second.card)).toEqual(['Dentist', 'Lunch']);
  });

  it('control: with the default refresh_on_navigate, the reload fetched before and still does', async () => {
    const withDefault = { toolbar: TOOLBAR };
    const first = await mount(withDefault);
    await pageForward(first.card);
    await save(first.card, first.dialogs, 'add');

    const second = await reload(first.card, withDefault);
    expect(drawn(second.card)).toEqual(['Dentist', 'Lunch']);
    expect(second.callApi).toHaveBeenCalledTimes(1);
  });

  it('control: a write at home refreshes home itself, so a reload needs nothing', async () => {
    const first = await mount(config);
    await save(first.card, first.dialogs, 'add');
    expect(drawn(first.card)).toEqual(['Dentist', 'Lunch']);

    const second = await reload(first.card, config);
    expect(drawn(second.card)).toEqual(['Dentist', 'Lunch']);
    expect(second.callApi).not.toHaveBeenCalled();
  });
});

describe('the stored windows of cards that are not on the page', () => {
  /** A card with its own window, which is a different entry from the writing card's. */
  const elsewhere = (entities: string[]) => ({
    entities,
    days_to_show: 5,
    refresh_on_navigate: false,
  });

  /** Store a window for a card, the way a visit to another view would, and leave it. */
  async function visit(config: Record<string, unknown>): Promise<void> {
    const { card } = await mount(config);
    card.remove();
  }

  it('expires one holding the calendar a details dialog wrote to', async () => {
    await visit(elsewhere(['calendar.anna']));
    const writer = await mount({ event_tap_action: { action: 'details' } });
    await save(writer.card, writer.dialogs, { details: 'Dentist' });

    const back = await mount(elsewhere(['calendar.anna']));
    expect(back.callApi).toHaveBeenCalledTimes(1);
    expect(drawn(back.card)).toEqual(['Dentist', 'Lunch']);
  });

  it('leaves one alone that holds only other calendars', async () => {
    await visit(elsewhere(['calendar.ben']));
    const writer = await mount({ event_tap_action: { action: 'details' } });
    await save(writer.card, writer.dialogs, { details: 'Dentist' });

    const back = await mount(elsewhere(['calendar.ben']));
    expect(back.callApi).not.toHaveBeenCalled();
    expect(drawn(back.card)).toEqual(['Piano']);
  });

  it('after a new event, expires every one holding a calendar that accepts new events', async () => {
    // Home Assistant's add dialog lets the user pick any writable calendar, not only the one
    // the card offered, so Ben's window may hold the new event too. The holidays cannot.
    await visit(elsewhere(['calendar.ben']));
    await visit(elsewhere(['calendar.holidays']));
    const writer = await mount({ toolbar: TOOLBAR });
    await save(writer.card, writer.dialogs, 'add');

    const ben = await mount(elsewhere(['calendar.ben']));
    expect(ben.callApi).toHaveBeenCalledTimes(1);
    const holidays = await mount(elsewhere(['calendar.holidays']));
    expect(holidays.callApi).not.toHaveBeenCalled();
  });
});

describe('a request that started before the write and lands after it', () => {
  const hass = (callApi: ReturnType<typeof vi.fn>) => makeHass(callApi);
  const config = buildConfig({ entities: ['calendar.anna'], days_to_show: 3 });
  const anna = (ids: ReadonlyArray<string>) => ids.includes('calendar.anna');

  it('stores its answer as due, because it may predate the write', async () => {
    let answer: (events: unknown) => void = () => {};
    const callApi = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const load = EventUtils.fetchEventData(hass(callApi), config, 'before-write', 'network');

    EventUtils.expireStoredCalendars(anna);
    answer([DENTIST]);
    await load;

    expect(EventUtils.readEventSnapshot(hass(callApi), config, 'before-write')?.due).toBe(true);
  });

  it('control: a request started after the write is stored fresh', async () => {
    EventUtils.expireStoredCalendars(anna);
    const callApi = answering();
    await EventUtils.fetchEventData(hass(callApi), config, 'after-write', 'network');

    expect(EventUtils.readEventSnapshot(hass(callApi), config, 'after-write')?.due).toBe(false);
  });

  /** A Home Assistant that holds every answer until the test gives it, in order. */
  function holding() {
    const answers: Array<(events: unknown) => void> = [];
    const callApi = vi.fn(() => new Promise((resolve) => answers.push(resolve)));
    return { callApi, answers };
  }

  it('is never joined: a load after the write asks Home Assistant again', async () => {
    const { callApi, answers } = holding();
    const before = EventUtils.fetchEventData(hass(callApi), config, 'joined', 'network');

    EventUtils.expireStoredCalendars(anna);
    const after = EventUtils.fetchEventData(hass(callApi), config, 'joined', 'network');
    expect(callApi).toHaveBeenCalledTimes(2);

    answers[0]([DENTIST]);
    answers[1]([DENTIST, LUNCH]);
    expect((await after).events.map((e) => e.summary).sort()).toEqual(['Dentist', 'Lunch']);
    await before;
    expect(EventUtils.readEventSnapshot(hass(callApi), config, 'joined')?.due).toBe(false);
  });

  it('control: with no write in between, a second load joins the first', async () => {
    const { callApi, answers } = holding();
    const first = EventUtils.fetchEventData(hass(callApi), config, 'shared', 'network');
    const second = EventUtils.fetchEventData(hass(callApi), config, 'shared', 'network');
    expect(callApi).toHaveBeenCalledTimes(1);

    answers[0]([DENTIST]);
    await Promise.all([first, second]);
  });

  it('is not joined for a paged window either, once any write has been made', async () => {
    const { callApi, answers } = holding();
    const load = () =>
      EventUtils.fetchEventData(hass(callApi), config, 'paged', 'network', 0, undefined, 'page');
    const before = load();

    EventUtils.advanceWriteGeneration();
    const after = load();
    expect(callApi).toHaveBeenCalledTimes(2);

    answers[0]([DENTIST]);
    answers[1]([DENTIST, LUNCH]);
    expect((await after).events.map((e) => e.summary).sort()).toEqual(['Dentist', 'Lunch']);
    await before;
  });

  it('control: a request for calendars the write did not touch is stored fresh', async () => {
    let answer: (events: unknown) => void = () => {};
    const callApi = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const ben = buildConfig({ entities: ['calendar.ben'], days_to_show: 3 });
    const load = EventUtils.fetchEventData(hass(callApi), ben, 'untouched', 'network');

    EventUtils.expireStoredCalendars(anna);
    answer([PIANO]);
    await load;

    expect(EventUtils.readEventSnapshot(hass(callApi), ben, 'untouched')?.due).toBe(false);
  });
});
