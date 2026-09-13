import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
  readonly groupedEvents: Types.EventsByDay[];
  readonly visibleEventCount: number;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
}

const EVENT: Types.CalendarEventData = {
  summary: 'Sunday rehearsal',
  start: { dateTime: '2026-06-21T10:00:00Z' },
  end: { dateTime: '2026-06-21T11:00:00Z' },
};

async function mount(
  view: Types.EffectiveView,
  language: string,
  filter?: Types.DaysOfWeekFilter,
  hideWhenEmpty = true,
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  const callApi = vi.fn().mockResolvedValue([EVENT]);
  const hass: Types.Hass = {
    states: {},
    locale: { language, first_weekday: 'monday', time_format: '24' },
    callApi,
    callService: vi.fn(),
  };
  card.setConfig({
    view,
    entities: [{ entity: 'calendar.anna', ...(filter ? { days_of_week: filter } : {}) }],
    language: 'en',
    first_day_of_week: 'monday',
    start_date: '2026-06-21',
    days_to_show: 1,
    hide_when_empty: hideWhenEmpty,
  });
  card.hass = hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return { card, callApi };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['list', 'column', 'grid'] as const)('%s weekend-dependent visibility', (view) => {
  it.each(
    (['en', 'he'] as const).flatMap((language) =>
      ([undefined, 'weekdays', 'weekends'] as const).flatMap((filter) =>
        [false, true].map((hideWhenEmpty) => ({ language, filter, hideWhenEmpty })),
      ),
    ),
  )(
    'tracks $language changes with filter=$filter, hide_when_empty=$hideWhenEmpty',
    async ({ language, filter, hideWhenEmpty }) => {
      const { card, callApi } = await mount(view, language, filter, hideWhenEmpty);
      const admitted = (locale: string): number =>
        filter === undefined ? 1 : Number((locale === 'en') === (filter === 'weekends'));
      const assertVisible = (locale: string): void => {
        const count = admitted(locale);
        expect(
          card.groupedEvents.flatMap((day) => day.events.filter((e) => !e._isEmptyDay)),
        ).toHaveLength(count);
        expect(card.visibleEventCount).toBe(count);
        expect(card.hidden).toBe(hideWhenEmpty && count === 0);
        expect(card.style.display).toBe(hideWhenEmpty && count === 0 ? 'none' : '');
        expect(card.shadowRoot!.textContent?.includes(EVENT.summary!)).toBe(count > 0);
      };
      assertVisible(language);
      const events = card.events;
      callApi.mockClear();
      const changed = language === 'en' ? 'he' : 'en';
      card.hass = { ...card.hass, locale: { ...card.hass.locale, language: changed } };
      await card.updateComplete;
      expect(card.events).toBe(events);
      expect(callApi).not.toHaveBeenCalled();
      assertVisible(changed);
    },
  );
});

it('retains the memo for new HA objects with an equivalent weekend definition', async () => {
  const { card } = await mount('list', 'he', 'weekdays');
  expect(card.visibleEventCount).toBe(1);
  const group = vi.spyOn(EventUtils, 'groupEventsByDay');
  card.hass = { ...card.hass, locale: { ...card.hass.locale, language: 'ar' } };
  expect(card.visibleEventCount).toBe(1);
  expect(card.visibleEventCount).toBe(1);
  expect(group).not.toHaveBeenCalled();
});
