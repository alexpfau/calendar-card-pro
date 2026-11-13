/**
 * Which `hass` updates the card renders for (#19).
 *
 * Home Assistant hands the card a new `hass` on every state change in the house. The card
 * renders only when the new one can change what it draws (`shouldUpdate`, from
 * `src/utils/hass-relevance.ts`). Three things are pinned here:
 *
 * - the rule itself, as a pure function;
 * - that a mounted card follows it, counted at `render()`, with a control that must render;
 * - and a reconciliation: every part of `hass` the card reads while it loads and draws, across
 *   a matrix of views and features, is a part the rule watches. This is what fails when a later
 *   change reads a new entity's state, or walks every state, without the rule knowing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';
import {
  configEntityIds,
  hassChangeIsVisible,
  watchedEntityIds,
} from '../src/utils/hass-relevance';

const NOW = new Date('2026-06-17T10:00:00Z');

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  weatherForecasts: Types.WeatherForecasts;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  requestUpdate(): void;
  render(): unknown;
}

const EVENTS: Types.CalendarEventData[] = [
  {
    summary: 'Team sync',
    start: { dateTime: '2026-06-17T11:00:00Z' },
    end: { dateTime: '2026-06-17T12:00:00Z' },
    location: 'Office',
    description: 'Weekly',
  },
  {
    summary: 'Running review',
    start: { dateTime: '2026-06-17T09:30:00Z' },
    end: { dateTime: '2026-06-17T10:30:00Z' },
  },
  {
    summary: 'Holiday',
    start: { date: '2026-06-18' },
    end: { date: '2026-06-19' },
  },
];

const state = (entityId: string, attributes: Record<string, unknown> = {}): Types.HassEntity =>
  ({ entity_id: entityId, state: 'on', attributes }) as unknown as Types.HassEntity;

/** Every state the house holds: the ones a config may name, and the noise around them. */
function houseStates(): Record<string, Types.HassEntity> {
  return {
    'calendar.anna': state('calendar.anna', { friendly_name: 'Anna', supported_features: 7 }),
    'calendar.ben': state('calendar.ben', { friendly_name: 'Ben', icon: 'mdi:soccer' }),
    'person.anna': state('person.anna', {
      entity_picture: '/api/image/serve/anna/512x512',
      user_id: 'u-anna',
      in_zones: ['zone.home'],
    }),
    'weather.home': state('weather.home', { friendly_name: 'Home' }),
    'sensor.noise': state('sensor.noise'),
    'zone.home': state('zone.home', { friendly_name: 'Home', latitude: 1, longitude: 2 }),
    'person.someone_else': state('person.someone_else'),
  };
}

function baseHass(states = houseStates()): Types.Hass {
  return {
    states,
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    // As Home Assistant sends them: the interface language and whether each one runs right to
    // left, from which it sets the dashboard's direction and the card reads it.
    language: 'en',
    translationMetadata: {
      fragments: [],
      translations: {
        en: { nativeName: 'English', isRTL: false },
        de: { nativeName: 'Deutsch', isRTL: false },
        he: { nativeName: 'עברית', isRTL: true },
      },
    },
    config: { country: 'DE' },
    user: { id: 'u-anna' },
    themes: { darkMode: false },
    // The entity registry, through which a location condition finds the viewer's person.
    entities: {
      'person.anna': { entity_id: 'person.anna' },
      'person.someone_else': { entity_id: 'person.someone_else' },
    },
    devices: {},
    areas: {},
    connection: {
      // Answers calendar subscriptions as Home Assistant before 2026.5 does, so the card polls.
      subscribeMessage: vi.fn((_callback: unknown, message: { type: string }) =>
        message.type === 'calendar/event/subscribe'
          ? Promise.reject({ code: 'unknown_command' })
          : Promise.resolve(() => {}),
      ),
      subscribeEvents: vi.fn().mockResolvedValue(() => {}),
    },
    callWS: vi.fn().mockResolvedValue({}),
    localize: (key: string) => key,
    formatEntityState: (_stateObj: unknown, value?: string) => String(value ?? ''),
    callApi: vi.fn(async (_method: string, path: string) =>
      path.startsWith('calendars/calendar.anna') ? EVENTS : [],
    ),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function mount(config: Record<string, unknown>, hass = baseHass()): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig(config);
  card.hass = hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the entity ids a config names', () => {
  it('collects them at any depth, whatever option holds them', () => {
    const config = {
      entities: [
        'calendar.anna',
        { entity: 'calendar.ben', label: 'person.anna' },
        { entity: 'calendar.ben', label: '🎉' },
      ],
      weather: { entity: 'weather.home', position: 'date' },
      title: 'Family',
      day_spacing: '0.5em',
    } as unknown as Types.Config;

    const ids = configEntityIds(config);

    expect([...ids].filter((id) => !id.startsWith('0'))).toEqual([
      'calendar.anna',
      'calendar.ben',
      'person.anna',
      'weather.home',
    ]);
  });

  it('works them out once per configuration object', () => {
    const config = { entities: ['calendar.anna'] } as unknown as Types.Config;

    expect(configEntityIds(config)).toBe(configEntityIds(config));
  });
});

describe('which hass changes can change what is drawn', () => {
  const ids = new Set(['calendar.anna', 'person.anna', 'weather.home']);
  const before = baseHass();
  const withState = (id: string): Types.Hass => ({
    ...before,
    states: { ...before.states, [id]: state(id, { changed: true }) },
  });

  it('ignores a state change of an entity the config does not name', () => {
    expect(hassChangeIsVisible(before, withState('sensor.noise'), ids)).toBe(false);
  });

  it('ignores a new hass that changed nothing at all', () => {
    expect(hassChangeIsVisible(before, { ...before }, ids)).toBe(false);
  });

  it.each(['calendar.anna', 'person.anna', 'weather.home'])(
    'counts a state change of %s, which the config names',
    (id) => {
      expect(hassChangeIsVisible(before, withState(id), ids)).toBe(true);
    },
  );

  it('counts a named entity appearing or going away', () => {
    const rest = { ...before.states };
    delete rest['calendar.anna'];

    expect(hassChangeIsVisible(before, { ...before, states: rest }, ids)).toBe(true);
    expect(hassChangeIsVisible({ ...before, states: rest }, before, ids)).toBe(true);
  });

  it.each([
    ['locale', { language: 'de', first_weekday: 'monday', time_format: '24' }],
    ['config', { country: 'US' }],
    ['themes', { darkMode: true }],
    ['entities', {}],
    ['localize', (key: string) => `${key}!`],
    ['connection', {}],
    // Deny by default: a key nothing reads today counts too, so a later reader needs nothing.
    ['user', { is_admin: false }],
  ])('counts any change of hass.%s', (key, value) => {
    expect(
      hassChangeIsVisible(before, { ...before, [key]: value } as unknown as Types.Hass, ids),
    ).toBe(true);
  });

  it('counts a key going away', () => {
    const rest: Partial<Types.Hass> = { ...before };
    delete rest.themes;

    expect(hassChangeIsVisible(before, rest as Types.Hass, ids)).toBe(true);
  });

  it('counts the first hass, and the loss of one', () => {
    expect(hassChangeIsVisible(undefined, before, ids)).toBe(true);
    expect(hassChangeIsVisible(before, undefined, ids)).toBe(true);
  });
});

describe('a mounted card', () => {
  const CONFIG = {
    entities: [{ entity: 'calendar.anna', label: 'person.anna' }],
    days_to_show: 3,
  };

  async function counted(view: Types.EffectiveView) {
    const card = await mount({ ...CONFIG, view });
    const render = vi.spyOn(card, 'render');
    return { card, render };
  }

  const tick = (card: CardUnderTest, id: string): void => {
    card.hass = {
      ...card.hass,
      states: { ...card.hass.states, [id]: state(id, { tick: Math.random() }) },
    };
  };

  it.each(['list', 'column', 'grid'] as const)(
    'does not render for 20 changes elsewhere in the house, in %s view',
    async (view) => {
      const { card, render } = await counted(view);

      for (let i = 0; i < 20; i++) {
        tick(card, 'sensor.noise');
        await card.updateComplete;
      }

      expect(render).toHaveBeenCalledTimes(0);
    },
  );

  it.each(['list', 'column', 'grid'] as const)(
    'renders for each of 20 changes of its own calendar, in %s view (control)',
    async (view) => {
      const { card, render } = await counted(view);

      for (let i = 0; i < 20; i++) {
        tick(card, 'calendar.anna');
        await card.updateComplete;
      }

      expect(render).toHaveBeenCalledTimes(20);
    },
  );

  it('renders for a state a visibility condition reads, and only then', async () => {
    const card = await mount({
      entities: [
        {
          entity: 'calendar.anna',
          visibility: [{ condition: 'state', entity: 'sensor.noise', state: 'on' }],
        },
      ],
      days_to_show: 3,
    });
    const render = vi.spyOn(card, 'render');

    tick(card, 'sensor.noise');
    await card.updateComplete;
    tick(card, 'zone.home');
    await card.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders for the persons and zones a location condition reads, and only for such a card', async () => {
    const location = await mount({
      entities: [
        {
          entity: 'calendar.anna',
          visibility: [{ condition: 'location', locations: ['home'] }],
        },
      ],
      days_to_show: 3,
    });
    const plain = await mount({ entities: ['calendar.anna'], days_to_show: 3 });
    const renders = [vi.spyOn(location, 'render'), vi.spyOn(plain, 'render')];

    for (const card of [location, plain]) {
      tick(card, 'person.someone_else');
      await card.updateComplete;
      tick(card, 'zone.home');
      await card.updateComplete;
      tick(card, 'sensor.noise');
      await card.updateComplete;
    }

    expect(renders.map((render) => render.mock.calls.length)).toEqual([2, 0]);
  });

  it("renders for a label's person, whose picture it draws", async () => {
    const { card, render } = await counted('list');

    tick(card, 'person.anna');
    await card.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders when the language changes', async () => {
    const { card, render } = await counted('list');

    card.hass = { ...card.hass, locale: { language: 'de', first_weekday: 'monday' } };
    await card.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
    expect(card.shadowRoot!.textContent).toContain('Mi');
  });

  it('renders when the dashboard turns right to left, and marks its own words', async () => {
    // An English card stays English; Home Assistant switching to Hebrew changes `language` and
    // `locale` in one new hass, which is what turns the dashboard and the card's marks around.
    const card = await mount({ ...CONFIG, view: 'list', language: 'en' });
    const render = vi.spyOn(card, 'render');
    expect(card.shadowRoot!.textContent).not.toContain('\u200e');

    card.hass = { ...card.hass, language: 'he', locale: { ...card.hass.locale!, language: 'he' } };
    await card.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
    expect(card.shadowRoot!.textContent).toContain('\u200e');
  });

  it('keeps a bare request that arrives in the same batch as an unrelated hass', async () => {
    // A registry color or a forecast arriving in the same microtask as a state tick elsewhere:
    // the batch carries only `hass` in its changed properties, and must still render.
    const { card, render } = await counted('list');

    tick(card, 'sensor.noise');
    card.requestUpdate();
    await card.updateComplete;

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('draws from the newest hass once it does render', async () => {
    const { card } = await counted('list');

    tick(card, 'sensor.noise');
    await card.updateComplete;
    card.hass = { ...card.hass, locale: { language: 'de', first_weekday: 'monday' } };
    await card.updateComplete;

    expect(card.shadowRoot!.textContent).toContain('Mi');
  });
});

/**
 * Every `hass` read the card makes while it loads and draws, for one config.
 *
 * Top-level keys and `states` entries are recorded separately. Anything that walks every state
 * (`Object.keys`, `in`, `for…in`) is recorded as `*`, because no list of entity ids could then
 * say which state changes matter.
 */
async function recordReads(config: Record<string, unknown>, forecast = false) {
  const keys = new Set<string>();
  const ids = new Set<string>();
  const states = new Proxy(houseStates(), {
    get(target, prop, receiver) {
      if (typeof prop === 'string') ids.add(prop);
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      ids.add('*');
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      ids.add('*');
      return Reflect.ownKeys(target);
    },
  });
  const hass = new Proxy(baseHass(states), {
    get(target, prop, receiver) {
      if (typeof prop === 'string') keys.add(prop);
      return Reflect.get(target, prop, receiver);
    },
  });

  const card = await mount(config, hass);
  if (forecast) {
    card.weatherForecasts = {
      daily: {
        '2026-06-17': { condition: 'sunny', temperature: 21 },
        '2026-06-18': { condition: 'rainy', temperature: 17 },
      },
      hourly: { '2026-06-17T11': { condition: 'cloudy', temperature: 19 } },
    } as unknown as Types.WeatherForecasts;
    await card.updateComplete;
  }
  await vi.advanceTimersByTimeAsync(0);
  await card.updateComplete;
  card.remove();

  return { card, keys, ids, hass };
}

describe('reconciliation: the rule watches everything the card reads', () => {
  const ENTITIES = [
    { entity: 'calendar.anna', label: 'person.anna' },
    { entity: 'calendar.ben', label_icon_source: 'entity' },
  ];
  const FEATURES = {
    entities: ENTITIES,
    days_to_show: 3,
    show_countdown: true,
    show_progress_bar: true,
    show_location: true,
    show_description: true,
    show_week_numbers: 'iso',
    filter_duplicates: true,
    weather: { entity: 'weather.home', position: 'both' },
    toolbar: { show: true, add_event: true, view_switcher: true, legend: true, navigation: true },
    event_tap_action: { action: 'details' },
    day_tap_action: { action: 'add-event' },
  };

  // Each case names states it must be seen reading, so a recorder that saw nothing fails rather
  // than passing every check below vacuously. A plain card reads no state at all.
  const MATRIX: Array<[string, Record<string, unknown>, string[]]> = [
    ['list, every feature', { ...FEATURES, view: 'list' }, ['calendar.ben', 'person.anna']],
    ['column, every feature', { ...FEATURES, view: 'column' }, ['person.anna', 'weather.home']],
    ['grid, every feature', { ...FEATURES, view: 'grid' }, ['calendar.anna', 'weather.home']],
    ['compact list', { ...FEATURES, view: 'list', compact_events_to_show: 2 }, ['person.anna']],
    [
      'grid without a now line',
      { ...FEATURES, view: 'grid', time_grid: { show_now_line: false } },
      ['calendar.anna', 'weather.home'],
    ],
    ['a plain card', { entities: ['calendar.anna'] }, []],
    [
      // Every kind of condition the card judges reads a state the configuration names, or a
      // top-level key: the viewer, the profile's and Home Assistant's time zones.
      'calendars with visibility conditions',
      {
        entities: [
          {
            entity: 'calendar.anna',
            visibility: [
              { condition: 'user', users: ['u-anna'] },
              { condition: 'state', entity: 'sensor.noise', state: 'on' },
              { condition: 'numeric_state', entity: 'weather.home', above: 'zone.home' },
              { condition: 'or', conditions: [{ condition: 'time', after: '08:00' }] },
              { condition: 'screen', media_query: '(min-width: 0px)' },
            ],
          },
          { entity: 'calendar.ben', visibility: [{ condition: 'state', state: 'on' }] },
        ],
        toolbar: { show: true, legend: true, add_event: true },
      },
      ['sensor.noise', 'weather.home', 'calendar.ben'],
    ],
    [
      // A location condition reads the viewer's person, found through the registry, and the
      // zone that set its state, though the configuration names neither.
      'a calendar with a location condition',
      {
        entities: [
          {
            entity: 'calendar.anna',
            visibility: [
              { condition: 'location', target: { area_id: 'garden' }, match_mode: 'active_zone' },
            ],
          },
        ],
      },
      ['person.anna', 'zone.home'],
    ],
    [
      // The magnifier is named by Home Assistant's own word, a top-level read; the search reads
      // Home Assistant only once pressed.
      'a toolbar with search',
      { entities: ['calendar.anna'], toolbar: { show: true, search: true } },
      [],
    ],
    [
      // Named by Home Assistant's own words, which are top-level reads; a button's entity is
      // named in the configuration and read by Home Assistant only when pressed.
      'a toolbar of its own buttons',
      {
        entities: ['calendar.anna'],
        toolbar: {
          show: true,
          buttons: [
            { icon: 'mdi:arrow-left', tap_action: { action: 'back' } },
            { icon: 'mdi:lamp', entity: 'sensor.noise', tap_action: { action: 'toggle' } },
            { icon: 'mdi:weather-partly-cloudy', tap_action: { action: 'more-info' } },
          ],
        },
      },
      [],
    ],
  ];

  it.each(MATRIX)('%s', async (_name, config, mustRead) => {
    const { card, keys, ids, hass } = await recordReads(config, true);
    const watched = watchedEntityIds((card as unknown as { config: Types.Config }).config, hass);

    // Denominators: the recorder saw the card read hass, and the states this case draws from.
    expect(keys.has('locale')).toBe(true);
    expect(mustRead.filter((id) => !ids.has(id))).toEqual([]);
    // Nothing walks every state, and every state read is one the rule compares.
    expect(ids.has('*')).toBe(false);
    expect([...ids].filter((id) => !watched.has(id))).toEqual([]);
    // Every top-level key read is an own key of hass, which the rule compares by identity.
    expect([...keys].filter((key) => !Object.keys(hass).includes(key))).toEqual([]);
  });

  it('would notice a read the rule does not watch (self-test of the recorder)', async () => {
    const { card, ids, hass } = await recordReads({ entities: ['calendar.anna'] });
    const watched = configEntityIds((card as unknown as { config: Types.Config }).config);

    void hass.states['sensor.noise'];
    void Object.keys(hass.states);

    expect([...ids].filter((id) => !watched.has(id))).toEqual(['sensor.noise', '*']);
  });
});
