/**
 * The real card with weather, for tests: its forecasts arrive through a fake
 * `weather/subscribe_forecast` stream, never set by hand, so whatever it draws it subscribed for.
 *
 * Calendar subscriptions are refused as Home Assistant before 2026.5 refuses them, so the card
 * never waits for a first push (AGENTS.md). Width is reported to the card's own resize observer,
 * which the test must install as `RecordingResizeObserver` before mounting.
 */
import { vi } from 'vitest';

import '../../src/calendar-card-pro';
import * as Constants from '../../src/config/constants';
import type * as Types from '../../src/config/types';

export const ENTITY = 'weather.home';

export interface SubRecord {
  forecastType: string;
  entityId: string;
  emit: (forecast: Array<Record<string, unknown>>) => void;
  unsubscribed: number;
}

export interface Card extends HTMLElement {
  setConfig(config: unknown): void;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
  isInitialLoad: boolean;
  preview: boolean;
  config: Types.Config;
  effectiveView: Types.EffectiveView;
  updateEvents(): Promise<void>;
  updateComplete: Promise<boolean>;
  _chooseView(view: Types.EffectiveView): void;
}

/** Answers the resize observer the card starts, with a width a test reports. */
export class RecordingResizeObserver {
  static instances: RecordingResizeObserver[] = [];
  constructor(readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    RecordingResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Resolve pending microtasks and the macrotask queue, so `queueMicrotask` has run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const DAILY = ['2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20'].map((day) => ({
  datetime: `${day}T12:00:00.000Z`,
  condition: 'sunny',
  temperature: 24,
  templow: 13,
}));
const HOURLY = Array.from({ length: 48 }, (_, hour) => ({
  datetime: new Date(Date.UTC(2026, 5, 17, hour)).toISOString(),
  condition: 'rainy',
  temperature: 17,
  is_daytime: true,
}));

/** A fake websocket that records forecast subscriptions and answers each with its forecast. */
export function makeConnection() {
  const subs: SubRecord[] = [];
  return {
    subs,
    live: () => subs.filter((sub) => sub.unsubscribed === 0).map((sub) => sub.forecastType),
    connection: {
      async subscribeMessage(
        callback: (message: { forecast: Array<Record<string, unknown>> }) => void,
        payload: { type: string; forecast_type: string; entity_id: string },
      ) {
        // Calendar subscriptions answered as Home Assistant before 2026.5 does.
        if (payload.type !== 'weather/subscribe_forecast') throw { code: 'unknown_command' };
        const record: SubRecord = {
          forecastType: payload.forecast_type,
          entityId: payload.entity_id,
          emit: (forecast) => callback({ forecast }),
          unsubscribed: 0,
        };
        subs.push(record);
        queueMicrotask(() => record.emit(payload.forecast_type === 'daily' ? DAILY : HOURLY));
        return () => {
          record.unsubscribed += 1;
        };
      },
    },
  };
}

const event = (
  summary: string,
  start: string,
  end: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData =>
  ({
    summary,
    start: start.length === 10 ? { date: start } : { dateTime: start },
    end: end.length === 10 ? { date: end } : { dateTime: end },
    _entityId: 'calendar.anna',
    ...extra,
  }) as Types.CalendarEventData;

const EVENTS = [
  event('Dentist', '2026-06-17T12:00:00Z', '2026-06-17T13:00:00Z'),
  event('Swim', '2026-06-18T15:00:00Z', '2026-06-18T16:00:00Z'),
  event('Bin Day', '2026-06-19', '2026-06-20'),
];

/**
 * The card on a page, with its events matched and its forecasts subscribed through the fake.
 *
 * @param config - The card's configuration, with `calendar.anna` and three days by default
 * @param width - A card width to report, as the resize observer would
 * @returns The card and its connection
 */
export async function mount(config: Record<string, unknown>, width = 1200) {
  RecordingResizeObserver.instances = [];
  const conn = makeConnection();
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  vi.spyOn(card, 'updateEvents').mockResolvedValue();
  card.setConfig({ entities: ['calendar.anna'], days_to_show: 3, ...config });
  card.hass = {
    states: { [ENTITY]: { state: 'sunny', attributes: {} } },
    locale: { language: 'en' },
    callApi: async () => [],
    connection: conn.connection,
  } as unknown as Types.Hass;
  card.events = EVENTS.map((each) => ({
    ...each,
    _matchedConfig: card.config.entities[0] as Types.EntityConfig,
  }));
  card.isInitialLoad = false;
  document.body.appendChild(card);
  widthObservers.set(card, RecordingResizeObserver.instances[0]);
  await card.updateComplete;
  await flush();
  await resize(card, width);
  return { card, conn };
}

/** The observer each card measures its own width with: the first it starts, on attaching. */
const widthObservers = new WeakMap<Card, RecordingResizeObserver>();

/** Reports a width to the card's own resize observer and lets it draw. */
export async function resize(card: Card, width: number): Promise<void> {
  widthObservers.get(card)?.callback([{ contentRect: { width } }]);
  // The card settles on a width before it fits its layout to it.
  await new Promise((resolve) => setTimeout(resolve, Constants.TIMING.WIDTH_SETTLE_DELAY + 1));
  await card.updateComplete;
  await flush();
  await card.updateComplete;
}

/** How much weather the card draws: beside its days, and beside its events. */
export function drawn(card: Card): { days: number; events: number } {
  const root = card.shadowRoot!;
  return {
    days: root.querySelectorAll('.weather').length,
    events: root.querySelectorAll('.event-weather').length,
  };
}
