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
  country?: string | null,
) {
  const card = document.createElement('calendar-card-pro-dev') as Card;
  const callApi = vi.fn().mockResolvedValue([EVENT]);
  const hass: Types.Hass = {
    states: {},
    locale: { language, first_weekday: 'monday', time_format: '24' },
    ...(country === undefined ? {} : { config: { country } }),
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
  /**
   * Assert what the card shows for the one Sunday event, given whether Sunday is currently
   * a weekend day. Every surface that reads the visible count is checked, because the memo
   * guarding it is what a missed weekend change leaves stale.
   */
  function expectVisible(
    card: Card,
    filter: Types.DaysOfWeekFilter | undefined,
    hideWhenEmpty: boolean,
    sundayIsWeekend: boolean,
  ): void {
    const count = filter === undefined ? 1 : Number(sundayIsWeekend === (filter === 'weekends'));
    expect(
      card.groupedEvents.flatMap((day) => day.events.filter((e) => !e._isEmptyDay)),
    ).toHaveLength(count);
    expect(card.visibleEventCount).toBe(count);
    expect(card.hidden).toBe(hideWhenEmpty && count === 0);
    expect(card.style.display).toBe(hideWhenEmpty && count === 0 ? 'none' : '');
    expect(card.shadowRoot!.textContent?.includes(EVENT.summary!)).toBe(count > 0);
  }

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
      expectVisible(card, filter, hideWhenEmpty, language === 'en');
      const events = card.events;
      callApi.mockClear();
      const changed = language === 'en' ? 'he' : 'en';
      card.hass = { ...card.hass, locale: { ...card.hass.locale, language: changed } };
      await card.updateComplete;
      expect(card.events).toBe(events);
      expect(callApi).not.toHaveBeenCalled();
      expectVisible(card, filter, hideWhenEmpty, changed === 'en');
    },
  );

  it.each(
    ([null, 'IL'] as const).flatMap((country) =>
      ([undefined, 'weekdays', 'weekends'] as const).flatMap((filter) =>
        [false, true].map((hideWhenEmpty) => ({ country, filter, hideWhenEmpty })),
      ),
    ),
  )(
    'tracks a country change from $country with filter=$filter, hide_when_empty=$hideWhenEmpty',
    async ({ country, filter, hideWhenEmpty }) => {
      // English throughout, so only the country moves the weekend: Sunday is a weekend day
      // with no country set and a working day in Israel. A memo keyed on the language alone
      // would keep the first answer here, which is the stale count this case exists to see.
      const { card, callApi } = await mount(view, 'en', filter, hideWhenEmpty, country);
      expectVisible(card, filter, hideWhenEmpty, country === null);
      const events = card.events;
      callApi.mockClear();
      const changed = country === null ? 'IL' : null;
      card.hass = { ...card.hass, config: { country: changed } };
      await card.updateComplete;
      expect(card.events).toBe(events);
      expect(callApi).not.toHaveBeenCalled();
      expectVisible(card, filter, hideWhenEmpty, changed === null);
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

it('retains the memo when the country or language changes without moving the weekend', async () => {
  // Israel to Saudi Arabia keeps Friday and Saturday, and so does a language change while a
  // country is set, because the country is what decides. The memo is keyed on the resolved
  // days rather than on either input, so neither change may regroup.
  const { card } = await mount('list', 'en', 'weekdays', true, 'IL');
  expect(card.visibleEventCount).toBe(1);
  const group = vi.spyOn(EventUtils, 'groupEventsByDay');
  card.hass = { ...card.hass, config: { country: 'SA' } };
  expect(card.visibleEventCount).toBe(1);
  card.hass = { ...card.hass, locale: { ...card.hass.locale, language: 'de' } };
  expect(card.visibleEventCount).toBe(1);
  expect(group).not.toHaveBeenCalled();
});
