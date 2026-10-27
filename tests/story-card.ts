/**
 * Mounts an Example Stories card on the real card element, so a test can check what the card a
 * page prints actually draws.
 *
 * The four short stories promise things only the mounted card can show: a tap that expands
 * (`now-and-next.md`), a card that hides itself (`bin-day.md`), an entry retired by the next
 * refresh, weather that arrives over Home Assistant's websocket. Calling the grouping and render
 * functions directly would skip the host that does each of those, so the card is configured,
 * handed a `hass`, attached and left to load, in Home Assistant's own order.
 *
 * 🚨 **The card comes from the page, never from a test file** — read with `readGuideCard`, for
 * the reason `tests/guide-config.ts` gives. A control arm is a copy of the page's card with one
 * option taken out, through `dropOption` or `dropFromBlocks`, or set, through `withOptions`. The
 * two that take an option out fail when the page does not set it, so a control can never be
 * the page's card unchanged because the option it meant to remove was renamed on the page.
 *
 * The `hass` answers each calendar from a payload, and only with the events overlapping the
 * window the card asked for, as Home Assistant does. A test about the window therefore sees the
 * card's own request as well as its own drawing.
 */
import { expect, vi } from 'vitest';

import { type GuideCard, STORY_GUIDES, readGuideCard } from './guide-config';
import { memoryStorage } from './memory-storage';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import '../src/calendar-card-pro';

/** An event as Home Assistant's calendar API returns it. */
export interface StoryEvent {
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
  location?: string;
  uid?: string;
}

/** What one card's `hass` holds besides its calendars' events. */
export interface StoryHass {
  /** Events per calendar entity id. A calendar not listed answers with none. */
  payload: Record<string, StoryEvent[]>;
  /** `hass.states`, for person pictures and calendar features. */
  states?: Record<string, unknown>;
  /** What the weather entity's forecast subscriptions deliver, in Home Assistant's shape. */
  forecasts?: { daily: unknown[]; hourly: unknown[] };
  /** Collects every calendar request the card makes, as its path, when given. */
  requests?: string[];
}

/** The parts of the card element these tests drive or read. */
export interface StoryCard extends HTMLElement {
  setConfig(config: unknown): void;
  hass: unknown;
  hidden: boolean;
  readonly effectiveView: Types.EffectiveView;
  readonly updateComplete: Promise<boolean>;
}

/**
 * The path of one story page, by its file name, taken from `STORY_GUIDES`.
 *
 * @param page - File name without `.md`, such as `bin-day`
 * @returns The page's path
 */
export function storyGuide(page: string): string {
  const matches = STORY_GUIDES.filter((path) => path.endsWith(`/${page}.md`));
  expect(matches, `STORY_GUIDES should list ${page}.md exactly once`).toHaveLength(1);
  return matches[0];
}

/**
 * The card a story page prints.
 *
 * @param page - File name without `.md`
 * @returns The card, as `readGuideCard` reads it
 */
export function readStoryCard(page: string): GuideCard {
  return readGuideCard(storyGuide(page));
}

/** A deep copy of a card, so an arm can change it without touching the page's. */
function copyOf(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

/**
 * The card with one option taken out, by dotted path (`list.compact_events_to_show`).
 *
 * @param config - The page's card
 * @param path - The option to drop; it must be on the page
 * @returns A copy without it
 */
export function dropOption(config: Record<string, unknown>, path: string): Record<string, unknown> {
  const copy = copyOf(config);
  const keys = path.split('.');
  let parent = copy;
  for (const key of keys.slice(0, -1)) {
    expect(parent[key], `${path}: the page has no ${key}`).toBeTypeOf('object');
    parent = parent[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  expect(Object.keys(parent), `${path}: the page does not set it`).toContain(last);
  delete parent[last];
  return copy;
}

/**
 * The card with one per-calendar option taken off the blocks `pick` selects.
 *
 * @param config - The page's card
 * @param key - The option to drop; every selected block must carry it
 * @param pick - Which blocks; every block when omitted
 * @returns A copy without it on those blocks
 */
export function dropFromBlocks(
  config: Record<string, unknown>,
  key: string,
  pick: (block: Record<string, unknown>) => boolean = () => true,
): Record<string, unknown> {
  const copy = copyOf(config);
  const blocks = (copy.entities as Array<Record<string, unknown>>).filter(pick);
  expect(blocks.length, `no block selected to drop ${key} from`).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(Object.keys(block), `a selected block does not set ${key}`).toContain(key);
    delete block[key];
  }
  return copy;
}

/**
 * The card with card-level options set, over a copy.
 *
 * @param config - The page's card
 * @param patch - Options to set or replace
 * @returns The changed copy
 */
export function withOptions(
  config: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...copyOf(config), ...copyOf(patch) };
}

/** Local midnight of a `YYYY-MM-DD` date, as Home Assistant reads an all-day boundary. */
function instantOf(time: { dateTime?: string; date?: string }): number {
  return time.dateTime ? Date.parse(time.dateTime) : Date.parse(`${time.date}T00:00:00`);
}

/** The events of one calendar that overlap the window a request asks for. */
function answer(payload: Record<string, StoryEvent[]>, path: string): StoryEvent[] {
  const [route, query = ''] = path.split('?');
  const entityId = decodeURIComponent(route.replace(/^calendars\//, ''));
  const params = new URLSearchParams(query);
  const from = Date.parse(params.get('start') ?? '');
  const to = Date.parse(params.get('end') ?? '');
  return (payload[entityId] ?? []).filter(
    (event) => instantOf(event.end) > from && instantOf(event.start) < to,
  );
}

/** Home Assistant's English words for the forecast conditions the fixtures use. */
const CONDITION_WORDS: Record<string, string> = {
  cloudy: 'Cloudy',
  partlycloudy: 'Partly cloudy',
  rainy: 'Rainy',
  sunny: 'Sunny',
};

/** A websocket connection whose forecast subscriptions deliver `forecasts` once. */
function connection(forecasts: StoryHass['forecasts']) {
  return {
    async subscribeMessage(
      callback: (message: { forecast: unknown[] }) => void,
      message: { forecast_type: 'daily' | 'hourly' },
    ) {
      const forecast = forecasts?.[message.forecast_type] ?? [];
      // Delivered after the subscription resolves, as Home Assistant's first message is.
      void Promise.resolve().then(() => callback({ forecast }));
      return () => undefined;
    },
  };
}

/**
 * Let every render the card has asked for land.
 *
 * @param card - The mounted card
 */
export async function settle(card: StoryCard): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await card.updateComplete;
  }
}

/**
 * Configure the card, hand it a `hass`, attach it and let it load.
 *
 * Each mount gets an empty `localStorage` and page store, so a card never draws the events
 * another arm of the same test cached.
 *
 * @param config - The card, from the page or an arm of it
 * @param hass - What Home Assistant holds
 * @returns The card, loaded and rendered
 */
export async function mountStory(
  config: Record<string, unknown>,
  hass: StoryHass,
): Promise<StoryCard> {
  vi.stubGlobal('localStorage', memoryStorage());
  EventUtils.clearPageStore();

  const card = document.createElement('calendar-card-pro-dev') as StoryCard;
  card.setConfig(copyOf(config));
  card.hass = {
    states: hass.states ?? {},
    locale: { language: 'en' },
    localize: (key: string) => key,
    formatEntityState: (_state: unknown, value: string) => CONDITION_WORDS[value] ?? value,
    callApi: async (_method: string, path: string) => {
      hass.requests?.push(path);
      return answer(hass.payload, path);
    },
    ...(hass.forecasts ? { connection: connection(hass.forecasts) } : {}),
  };
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/**
 * Tap an element of the card: a primary pointer going down and up on it, unmoved.
 *
 * Dispatched as bubbling, composed events, so the card's own listener on `ha-card` sees the
 * path from the element tapped, which is how it tells a tap on an event from a tap on the card.
 *
 * @param card - The mounted card
 * @param target - What the finger lands on, inside the card's shadow root
 */
export async function tap(card: StoryCard, target: Element): Promise<void> {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      button: { value: 0 },
      isPrimary: { value: true },
      clientX: { value: 0 },
      clientY: { value: 0 },
    });
    target.dispatchEvent(event);
  }
  await settle(card);
}

/** The card's shadow root. */
export function shadow(card: StoryCard): ShadowRoot {
  expect(card.shadowRoot, 'the card has not rendered').not.toBeNull();
  return card.shadowRoot as ShadowRoot;
}

/** An element's text with its whitespace collapsed, or `null` when there is no element. */
export function text(element: Element | null | undefined): string | null {
  return element ? (element.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

/** One row of a list-view card, as the reader sees it. */
export interface ListRow {
  /** The day of the month the row sits under. */
  day: number;
  /** The date the row sits under, as its date column prints it: `Jun 17`. */
  date: string;
  title: string;
  /** The time row's text, `''` when the row has a time line with nothing in it. */
  time: string | null;
  countdown: string | null;
  /** The progress bar's fill, such as `50%`, or `null` without one. */
  progress: string | null;
  location: string | null;
  /** Every label before the title: an emoji's text, a picture's `alt`, an icon's name. */
  labels: string[];
  /** The all-day title pill's accent, or `null` without a pill. */
  pill: string | null;
  /** Whether this is the card's own notice for a day with nothing on it. */
  empty: boolean;
  /** The row's cell. */
  element: HTMLElement;
  /** The title, which is where a finger tapping the event lands. */
  target: Element;
}

/** What one label element stands for. */
function labelOf(element: Element): string {
  if (element.tagName === 'IMG') return element.getAttribute('alt') ?? '';
  if (element.tagName === 'HA-ICON') return element.getAttribute('icon') ?? '';
  return text(element) ?? '';
}

/** A custom property's value in an element's inline style. */
export function styleValue(element: Element | null, property: string): string | null {
  const style = element?.getAttribute('style') ?? '';
  const match = new RegExp(`${property}:\\s*([^;]+)`).exec(style);
  return match ? match[1].trim() : null;
}

/**
 * Every row a list-view card draws, in order.
 *
 * @param card - The mounted card
 * @returns One entry per row
 */
export function listRows(card: StoryCard): ListRow[] {
  return [...shadow(card).querySelectorAll('table.day-table')].flatMap((table) => {
    const day = Number(text(table.querySelector('.date-column .day')));
    const date = `${text(table.querySelector('.date-column .month'))} ${day}`;
    return [...table.querySelectorAll<HTMLElement>('td.event')].map((element) => {
      const title = element.querySelector('.event-title');
      return {
        day,
        date,
        title: text(title) ?? '',
        time: text(element.querySelector('.time-actual')),
        countdown: text(element.querySelector('.time-countdown')),
        progress: styleValue(element.querySelector('.progress-bar-filled'), 'width'),
        location: text(element.querySelector('.location')),
        labels: [
          ...element.querySelectorAll(
            '.summary .calendar-label, .summary .label-image, .summary .label-icon',
          ),
        ].map(labelOf),
        pill: styleValue(
          element.querySelector('.allday-title-pill'),
          '--calendar-card-event-accent',
        ),
        empty: title?.classList.contains('empty-day-title') ?? false,
        element,
        target: title ?? element,
      };
    });
  });
}

/** Each row's title, in order. */
export function titles(card: StoryCard): string[] {
  return listRows(card).map((row) => row.title);
}

/** The single row titled `title`. */
export function rowTitled(card: StoryCard, title: string): ListRow {
  const rows = listRows(card).filter((row) => row.title === title);
  expect(rows, `exactly one row should read ${title}`).toHaveLength(1);
  return rows[0];
}
