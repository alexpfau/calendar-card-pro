/**
 * Visibility conditions on one calendar (`src/utils/visibility.ts`), judged as Home Assistant
 * judges a card's `visibility:`.
 *
 * Every expectation here is Home Assistant's answer, taken from its frontend's
 * `checkConditionsMet` (`validate-condition.ts`) for a single condition and from
 * `evaluateConditionsLocally` (`evaluate-locally.ts`) for how `and`, `or`, `not`, `enabled` and a
 * condition the browser cannot judge combine. A probe ran those two functions and this module
 * over the same 6,706 cases and found no difference; the deliberate departures are pinned at the
 * end, each with its reason.
 *
 * Times here run under UTC, the `unit` project's zone. `visibility-time.dst.test.ts` covers the
 * days a clock skips or repeats an hour.
 */
import { describe, expect, it } from 'vitest';

import { normalizeEntities } from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  conditionTimeZone,
  coreConditions,
  coreKey,
  entriesCoreConditions,
  entriesUseLocation,
  evaluateVisibility,
  isServerCondition,
  locationEntityIds,
  nextVisibilityChange,
  normalizeVisibility,
  parseTimeOfDay,
  unjudgedConditions,
  visibilityMediaQueries,
  visibilityPasses,
  visibilitySignature,
} from '../src/utils/visibility';

const state = (value: string, attributes: Record<string, unknown> = {}): Types.HassEntity =>
  ({ state: value, attributes }) as unknown as Types.HassEntity;

const HASS = {
  states: {
    'input_boolean.vacation': state('off'),
    'input_boolean.guest': state('on'),
    'sensor.temp': state('21.5'),
    'sensor.text': state('abc'),
    'sensor.limit': state('20'),
    'sun.sun': state('above_horizon', { elevation: 30, rising: true }),
    'calendar.work': state('on'),
    'input_select.mode': state('night'),
    'sensor.ref': state('night'),
  },
  user: { id: 'u-anna' },
  locale: { language: 'en', time_zone: 'local' },
  config: { time_zone: 'Europe/Berlin' },
} as unknown as Types.Hass;

/** Wednesday, June 17, 2026, 12:00 UTC. */
const NOON = Date.UTC(2026, 5, 17, 12, 0, 0);

const WIDE = '(min-width: 600px)';

function judge(conditions: unknown[], overrides: { hass?: Types.Hass; now?: number } = {}) {
  return evaluateVisibility(conditions, {
    hass: 'hass' in overrides ? overrides.hass : HASS,
    entityId: 'calendar.work',
    now: overrides.now ?? NOON,
    matches: (query) => query === WIDE,
  });
}

const TEMPLATE = { condition: 'template', value_template: '{{ true }}' };

describe('one condition', () => {
  it.each([
    ['user listed', { condition: 'user', users: ['u-anna'] }, true],
    ['user not listed', { condition: 'user', users: ['u-ben'] }, false],
    ['user with no list', { condition: 'user' }, false],
    ['state', { condition: 'state', entity: 'input_boolean.vacation', state: 'off' }, true],
    [
      'state, other value',
      { condition: 'state', entity: 'input_boolean.vacation', state: 'on' },
      false,
    ],
    ['state_not', { condition: 'state', entity: 'input_boolean.vacation', state_not: 'on' }, true],
    [
      'state from a list',
      { condition: 'state', entity: 'input_boolean.vacation', state: ['on', 'off'] },
      true,
    ],
    ['state with no value', { condition: 'state', entity: 'input_boolean.vacation' }, false],
    // A value naming an entity also reads as that entity's state.
    [
      'state naming an entity',
      { condition: 'state', entity: 'input_select.mode', state: 'sensor.ref' },
      true,
    ],
    [
      'state of an attribute',
      { condition: 'state', entity: 'sun.sun', attribute: 'rising', state: 'true' },
      true,
    ],
    ['state with no condition key', { entity: 'input_boolean.guest', state: 'on' }, true],
    // No entity reads the calendar the entry draws.
    ['state of the calendar itself', { condition: 'state', state: 'on' }, true],
    [
      'core-shaped state',
      { condition: 'state', entity_id: 'input_boolean.vacation', state: 'off' },
      true,
    ],
    ['numeric above', { condition: 'numeric_state', entity: 'sensor.temp', above: 20 }, true],
    [
      'numeric at its bound',
      { condition: 'numeric_state', entity: 'sensor.temp', above: 21.5 },
      false,
    ],
    [
      'numeric below, as text',
      { condition: 'numeric_state', entity: 'sensor.temp', below: '22' },
      true,
    ],
    [
      'numeric above an entity',
      { condition: 'numeric_state', entity: 'sensor.temp', above: 'sensor.limit' },
      true,
    ],
    [
      'numeric with an unreadable bound',
      { condition: 'numeric_state', entity: 'sensor.temp', above: 'garbage' },
      true,
    ],
    ['numeric with no bound', { condition: 'numeric_state', entity: 'sensor.temp' }, true],
    ['numeric of text', { condition: 'numeric_state', entity: 'sensor.text', above: 1 }, false],
    [
      'numeric attribute',
      {
        condition: 'numeric_state',
        entity: 'sun.sun',
        attribute: 'elevation',
        above: 10,
        below: 40,
      },
      true,
    ],
    [
      'core-shaped numeric',
      { condition: 'numeric_state', entity_id: 'sensor.temp', below: 21.5 },
      false,
    ],
    ['screen matching', { condition: 'screen', media_query: WIDE }, true],
    ['screen not matching', { condition: 'screen', media_query: '(max-width: 599px)' }, false],
    ['screen with no query', { condition: 'screen' }, false],
    ['view_columns', { condition: 'view_columns', min: 2 }, true],
  ])('%s', (_name, condition, expected) => {
    expect(judge([condition])).toBe(expected);
  });

  it.each([
    ['template', TEMPLATE],
    ['sun', { condition: 'sun', after: 'sunset' }],
    [
      'a state of an entity with no state',
      { condition: 'state', entity: 'sensor.missing', state: 'on' },
    ],
    ['not a condition at all', 'user'],
    ['a templated enabled', { condition: 'user', users: ['u-anna'], enabled: '{{ x }}' }],
  ])('cannot judge %s, before core answers', (_name, condition) => {
    expect(judge([condition])).toBeUndefined();
  });
});

describe('several conditions', () => {
  const yes = { condition: 'user', users: ['u-anna'] };
  const no = { condition: 'user', users: ['u-ben'] };

  it('needs every condition of the list', () => {
    expect(judge([yes, yes])).toBe(true);
    expect(judge([yes, no])).toBe(false);
  });

  it('reads not as not all of them', () => {
    expect(judge([{ condition: 'not', conditions: [yes, no] }])).toBe(true);
    expect(judge([{ condition: 'not', conditions: [yes, yes] }])).toBe(false);
  });

  it('reads or as any of them, a single child as a list of one', () => {
    expect(judge([{ condition: 'or', conditions: [no, yes] }])).toBe(true);
    expect(judge([{ condition: 'or', conditions: yes }])).toBe(true);
    expect(judge([{ condition: 'or', conditions: [no, no] }])).toBe(false);
  });

  it('holds where and, or or not has no conditions', () => {
    expect(judge([{ condition: 'or' }])).toBe(true);
    expect(judge([{ condition: 'and', conditions: [] }])).toBe(true);
    expect(judge([{ condition: 'not', conditions: [] }])).toBe(false);
  });

  it('skips a condition that is switched off, at any depth', () => {
    expect(judge([{ ...no, enabled: false }, yes])).toBe(true);
    expect(judge([{ condition: 'or', conditions: [{ ...yes, enabled: false }, no] }])).toBe(false);
  });

  it('keeps what it cannot judge unknown, so not never shows it', () => {
    expect(judge([{ condition: 'not', conditions: [TEMPLATE] }])).toBeUndefined();
    expect(judge([TEMPLATE, yes])).toBeUndefined();
    // Settled anyway where the answer does not depend on it.
    expect(judge([TEMPLATE, no])).toBe(false);
    expect(judge([{ condition: 'or', conditions: [TEMPLATE, yes] }])).toBe(true);
    expect(judge([{ condition: 'or', conditions: [TEMPLATE, no] }])).toBeUndefined();
  });

  it('shows an entry only when its conditions are known to hold', () => {
    const context = { hass: HASS, now: NOON, matches: () => false };
    expect(visibilityPasses(undefined, context)).toBe(true);
    expect(visibilityPasses([yes], context)).toBe(true);
    expect(visibilityPasses([no], context)).toBe(false);
    expect(visibilityPasses([TEMPLATE], context)).toBe(false);
  });

  it('cannot judge a user or a state before Home Assistant has arrived', () => {
    expect(judge([yes], { hass: undefined })).toBe(false);
    expect(
      judge([{ condition: 'state', entity: 'input_boolean.vacation', state: 'off' }], {
        hass: { states: {} } as unknown as Types.Hass,
      }),
    ).toBeUndefined();
  });
});

describe('time', () => {
  const at = (hours: number, minutes = 0, seconds = 0) =>
    Date.UTC(2026, 5, 17, hours, minutes, seconds);

  it.each([
    ['inside a span', { after: '08:00', before: '18:00' }, at(12), true],
    ['at its start', { after: '08:00', before: '18:00' }, at(8), true],
    ['at its end, which is included', { after: '08:00', before: '18:00' }, at(18), true],
    ['a second past its end', { after: '08:00', before: '18:00' }, at(18, 0, 1), false],
    ['a span past midnight, late', { after: '22:00', before: '06:00' }, at(23), true],
    ['a span past midnight, early', { after: '22:00', before: '06:00' }, at(5), true],
    ['a span past midnight, by day', { after: '22:00', before: '06:00' }, at(12), false],
    ['after alone', { after: '12:00' }, at(11, 59), false],
    ['before alone, with seconds', { before: '12:00:30' }, at(12, 0, 30), true],
    ['on a weekday listed', { weekdays: ['wed'] }, at(12), true],
    ['on a weekday not listed', { weekdays: ['sat', 'sun'] }, at(12), false],
    ['weekday and time', { weekdays: ['wed'], after: '11:00' }, at(12), true],
    ['nothing to compare', {}, at(12), true],
    ['an empty time, which is none', { after: '', before: '13:00' }, at(12), true],
  ])('%s', (_name, fields, now, expected) => {
    expect(judge([{ condition: 'time', ...fields }], { now })).toBe(expected);
  });

  it("reads Home Assistant's zone where the profile asks for the server's", () => {
    const server = {
      ...HASS,
      locale: { language: 'en', time_zone: 'server' },
    } as unknown as Types.Hass;
    // 12:00 UTC is 14:00 in Berlin in June.
    const condition = { condition: 'time', after: '13:00', before: '15:00' };
    expect(judge([condition], { hass: server })).toBe(true);
    expect(judge([condition])).toBe(false);
    expect(conditionTimeZone(server)).toBe('Europe/Berlin');
    expect(conditionTimeZone(HASS)).toBe('UTC');
  });

  it("keeps the browser's zone where the server's is unknown", () => {
    const hass = {
      ...HASS,
      locale: { language: 'en', time_zone: 'server' },
      config: { time_zone: 'Not/AZone' },
    } as unknown as Types.Hass;
    expect(conditionTimeZone(hass)).toBe('UTC');
  });

  it('reads times as Home Assistant accepts them', () => {
    expect(parseTimeOfDay('08:30')).toBe(30_600_000);
    expect(parseTimeOfDay('08:30:15')).toBe(30_615_000);
    for (const value of ['8:00 AM', '24:00', '12:60', '12', '', 830]) {
      expect(parseTimeOfDay(value)).toBeNull();
    }
  });
});

describe('when to look again', () => {
  it('names the next after, the moment past a before, and midnight', () => {
    const conditions = [{ condition: 'time', after: '13:00', before: '18:00' }];
    expect(nextVisibilityChange(conditions, HASS, NOON)).toBe(Date.UTC(2026, 5, 17, 13));
    expect(nextVisibilityChange(conditions, HASS, Date.UTC(2026, 5, 17, 14))).toBe(
      Date.UTC(2026, 5, 17, 18) + 1,
    );
    expect(nextVisibilityChange(conditions, HASS, Date.UTC(2026, 5, 17, 19))).toBe(
      Date.UTC(2026, 5, 18),
    );
  });

  it('finds time conditions inside and, or and not', () => {
    const conditions = [
      {
        condition: 'or',
        conditions: [{ condition: 'not', conditions: [{ condition: 'time', before: '12:30' }] }],
      },
    ];
    expect(nextVisibilityChange(conditions, HASS, NOON)).toBe(Date.UTC(2026, 5, 17, 12, 30) + 1);
  });

  it('has nothing to wait for without a time condition', () => {
    expect(nextVisibilityChange([{ condition: 'user', users: ['u-anna'] }], HASS, NOON)).toBeNull();
  });
});

describe('the list as written', () => {
  it('reads one condition as a list of one, and an empty list as none', () => {
    const one = { condition: 'user', users: ['u-anna'] };
    expect(normalizeVisibility(one)).toEqual([one]);
    expect(normalizeVisibility([])).toBeUndefined();
    expect(normalizeVisibility(null)).toBeUndefined();
    expect(normalizeVisibility('user')).toEqual(['user']);
  });

  it('carries visibility through normalizeEntities', () => {
    const condition = { condition: 'user', users: ['u-anna'] };
    const [entry] = normalizeEntities([
      { entity: 'calendar.work', visibility: condition as unknown as never },
    ]);
    expect(entry.visibility).toEqual([condition]);
  });

  it('signs a list by what it says, not by the object holding it', () => {
    const a = [{ condition: 'user', users: ['u-anna'] }];
    const b = [{ condition: 'user', users: ['u-anna'] }];
    expect(visibilitySignature(a)).toBe(visibilitySignature(b));
    expect(visibilitySignature(a)).not.toBe(
      visibilitySignature([{ condition: 'user', users: [] }]),
    );
  });

  it('lists the media queries to listen to, at any depth, once each', () => {
    const conditions = [
      { condition: 'screen', media_query: WIDE },
      {
        condition: 'or',
        conditions: [
          { condition: 'screen', media_query: WIDE },
          { condition: 'screen', media_query: '(orientation: portrait)' },
        ],
      },
    ];
    expect(visibilityMediaQueries(conditions)).toEqual([WIDE, '(orientation: portrait)']);
  });

  it('names the conditions neither it nor core judges, to warn about', () => {
    expect(
      unjudgedConditions([
        TEMPLATE,
        { condition: 'or', conditions: [{ condition: 'location' }, { condition: 'user' }] },
        42,
        { entity: 'input_boolean.guest', state: 'on' },
        { condition: 'numeric_state', entity: 'sensor.temp', above: 1, value_template: '{{ 2 }}' },
        { condition: 'state', entity_id: 'input_boolean.guest', state: 'on', for: 5 },
      ]),
    ).toEqual(['malformed', 'numeric_state with value_template']);
  });
});

/**
 * Where the card answers differently from Home Assistant's own functions, on purpose.
 *
 * Home Assistant leaves the first three to core and has no answer of its own in the browser;
 * the card answers them as core would until core does, and for good on a Home Assistant too old
 * to ask. The last two hide what Home Assistant would show or compare oddly, because an entry is
 * hidden whenever the card is unsure.
 */
describe('departures from the browser side of Home Assistant', () => {
  it('reads a core-shaped list of entities as core does: all, or any with match: any', () => {
    const both = {
      condition: 'state',
      entity_id: ['input_boolean.vacation', 'input_boolean.guest'],
      state: 'off',
    };
    expect(judge([both])).toBe(false);
    expect(judge([{ ...both, match: 'any' }])).toBe(true);
  });

  it('reads a core-shaped numeric bound naming an entity, or written as text', () => {
    expect(
      judge([{ condition: 'numeric_state', entity_id: 'sensor.temp', above: 'sensor.limit' }]),
    ).toBe(true);
    expect(judge([{ condition: 'numeric_state', entity_id: 'sensor.temp', below: '21' }])).toBe(
      false,
    );
  });

  it('keeps a state held for a while unknown in the dashboard shape, without asking core', () => {
    // Home Assistant drops `for` here and shows the entry at once; the card hides it and warns.
    const held = {
      condition: 'state',
      entity: 'input_boolean.vacation',
      state: 'off',
      for: '01:00:00',
    };
    expect(judge([held])).toBeUndefined();
    expect(judge([{ condition: 'not', conditions: [held] }])).toBeUndefined();
    expect(judge([{ entity: 'input_boolean.guest', state: 'on', for: 5 }])).toBeUndefined();
    expect(
      unjudgedConditions([held, { entity: 'input_boolean.guest', state: 'on', for: 5 }]),
    ).toEqual(['state with for']);
    expect(isServerCondition(held)).toBe(false);
    expect(coreConditions([held], 'calendar.work')).toEqual([]);
  });

  it('cannot judge, before core answers, what only core can judge', () => {
    for (const extra of [{ for: '00:05:00' }, { attribute: 'x' }, { match: 'some' }]) {
      expect(
        judge([
          { condition: 'state', entity_id: 'input_boolean.vacation', state: 'off', ...extra },
        ]),
      ).toBeUndefined();
    }
    // Core compares a value naming an entity as written, the dashboards as that entity's state.
    expect(
      judge([{ condition: 'state', entity_id: 'input_select.mode', state: 'sensor.ref' }]),
    ).toBeUndefined();
  });

  it('hides a time that is not a time, which Home Assistant would read as always', () => {
    expect(judge([{ condition: 'time', after: 'noon' }])).toBe(false);
  });
});

describe('an entity with no state', () => {
  it('reads as unknown where Home Assistant judges the condition in the browser too', () => {
    const missing = { condition: 'state', entity: 'sensor.missing', attribute: 'x' };
    expect(judge([{ ...missing, state: 'unknown' }])).toBe(true);
    expect(judge([{ ...missing, state_not: 'unknown' }])).toBe(false);
    expect(judge([{ condition: 'state', entity: 'sensor.missing', state_not: 'sensor.ref' }])).toBe(
      true,
    );
    expect(
      judge([{ condition: 'numeric_state', entity: 'sensor.missing', above: 'sensor.limit' }]),
    ).toBe(false);
  });

  it('is unknown where Home Assistant asks core, which reports an error for it', () => {
    expect(judge([{ condition: 'state', entity: 'sensor.missing', state: 'unknown' }])).toBe(
      undefined,
    );
    expect(judge([{ condition: 'numeric_state', entity: 'sensor.missing', above: 1 }])).toBe(
      undefined,
    );
  });
});

describe('location', () => {
  const zone = (name: string, extra: Record<string, unknown> = {}): Types.HassEntity =>
    state('0', { friendly_name: name, ...extra });

  /**
   * A house with two persons, registered zones in areas, on floors, under labels and on a device,
   * one passive, one registered without a state, and Home's own zone, which is never registered.
   */
  function house(person: { state: string; in_zones?: unknown }, userId = 'u-anna'): Types.Hass {
    return {
      states: {
        'person.anna': state(person.state, {
          user_id: 'u-anna',
          ...(person.in_zones !== undefined ? { in_zones: person.in_zones } : {}),
        }),
        'person.ben': state('home', { user_id: 'u-ben', in_zones: ['zone.home'] }),
        'zone.home': zone('Home'),
        'zone.work': zone('Work'),
        'zone.gym': zone('Gym'),
        'zone.mall': zone('Mall', { passive: true }),
        'zone.school': zone('School'),
        'zone.depot': zone('Depot'),
        'zone.stop': zone('Stop'),
        'zone.cafe': zone('Work', { passive: true }),
        'zone.yaml': zone('Not Home'),
        'light.desk': state('on'),
      },
      user: { id: userId },
      entities: {
        'person.anna': { entity_id: 'person.anna' },
        'person.ben': { entity_id: 'person.ben' },
        'zone.work': { entity_id: 'zone.work', area_id: 'office', labels: ['weekday'] },
        'zone.gym': { entity_id: 'zone.gym', labels: ['weekday'] },
        'zone.mall': { entity_id: 'zone.mall', area_id: 'town', labels: [] },
        'zone.school': { entity_id: 'zone.school', device_id: 'bus', labels: [] },
        // On the bus, but placed in the office: reached through the town, it stays out.
        'zone.depot': { entity_id: 'zone.depot', device_id: 'bus', area_id: 'office', labels: [] },
        // On the seat, a part of the bus with no area of its own.
        'zone.stop': { entity_id: 'zone.stop', device_id: 'seat', labels: [] },
        'zone.cafe': { entity_id: 'zone.cafe', labels: [] },
        'zone.gone': { entity_id: 'zone.gone', area_id: 'office', labels: [] },
        'light.desk': { entity_id: 'light.desk', area_id: 'office', labels: ['weekday'] },
      },
      devices: {
        bus: { id: 'bus', area_id: 'town', labels: [] },
        seat: { id: 'seat', area_id: null, parent_device_id: 'bus', labels: [] },
      },
      areas: {
        office: { area_id: 'office', floor_id: 'ground', labels: [] },
        town: { area_id: 'town', floor_id: 'upper', labels: ['out'] },
      },
    } as unknown as Types.Hass;
  }

  const at = (hass: Types.Hass, condition: Record<string, unknown>) =>
    judge([{ condition: 'location', ...condition }], { hass });

  it("is false where the viewer has no person, or Home Assistant's registry lists none", () => {
    expect(at(house({ state: 'home' }, 'u-carl'), { locations: ['home'] })).toBe(false);
    const unregistered = { ...house({ state: 'home' }), entities: {} } as Types.Hass;
    expect(at(unregistered, { locations: ['home'] })).toBe(false);
  });

  it("reads the viewer's own person, not another's", () => {
    const hass = house({ state: 'not_home', in_zones: [] });
    expect(at(hass, { locations: ['home'] })).toBe(false);
    expect(at({ ...hass, user: { id: 'u-ben' } } as Types.Hass, { locations: ['home'] })).toBe(
      true,
    );
  });

  it('matches the state against locations as written, and away against not_home', () => {
    const work = house({ state: 'Work', in_zones: ['zone.work'] });
    expect(at(work, { locations: ['home', 'Work'] })).toBe(true);
    expect(at(work, { locations: ['home'] })).toBe(false);
    // Home Assistant calls includes on whatever is written: a text matches within itself, and
    // anything else fails the condition rather than being skipped.
    expect(at(work, { locations: 'Workshop' })).toBe(true);
    expect(at(work, { locations: 'Home' })).toBe(false);
    expect(at(house({ state: 'not_home', in_zones: [] }), { locations: 7, away: true })).toBe(
      false,
    );
    expect(at(house({ state: 'not_home', in_zones: [] }), { away: true })).toBe(true);
    expect(at(work, { away: true })).toBe(false);
  });

  it('matches any zone the person is in, or only the one its state shows', () => {
    // At home, and inside the passive mall zone that never becomes the state.
    const hass = house({ state: 'home', in_zones: ['zone.home', 'zone.mall'] });
    const mall = { target: { entity_id: 'zone.mall' } };
    expect(at(hass, mall)).toBe(true);
    expect(at(hass, { ...mall, match_mode: 'active_zone' })).toBe(false);
    expect(at(hass, { target: { entity_id: ['zone.home'] }, match_mode: 'active_zone' })).toBe(
      true,
    );
    // A passive cafe named like the office never sets the state, though listed first.
    const cafe = house({ state: 'Work', in_zones: ['zone.cafe', 'zone.work'] });
    expect(at(cafe, { target: { entity_id: 'zone.cafe' }, match_mode: 'active_zone' })).toBe(false);
    expect(at(cafe, { target: { entity_id: 'zone.work' }, match_mode: 'active_zone' })).toBe(true);
  });

  it('matches by the state alone where the tracker does not report its zones, never as away', () => {
    expect(at(house({ state: 'Work' }), { target: { entity_id: 'zone.work' } })).toBe(true);
    expect(at(house({ state: 'Gym' }), { target: { entity_id: 'zone.work' } })).toBe(false);
    // A passive zone never becomes the state, whatever its name.
    expect(at(house({ state: 'Work' }), { target: { entity_id: 'zone.cafe' } })).toBe(false);
    // A zone named like the away state does not make away a place.
    const named = house({ state: 'not_home' });
    named.states['zone.yaml'] = zone('not_home');
    expect(at(named, { target: { entity_id: 'zone.yaml' } })).toBe(false);
  });

  it('resolves zones through areas, floors, labels and devices, as Home Assistant does', () => {
    const where = (zoneId: string) => house({ state: 'x', in_zones: [zoneId] });
    expect(at(where('zone.work'), { target: { area_id: 'office' } })).toBe(true);
    expect(at(where('zone.work'), { target: { floor_id: ['ground'] } })).toBe(true);
    expect(at(where('zone.gym'), { target: { label_id: 'weekday' } })).toBe(true);
    // The school zone hangs off a bus in town, and has no area of its own.
    expect(at(where('zone.school'), { target: { area_id: 'town' } })).toBe(true);
    expect(at(where('zone.school'), { target: { device_id: 'bus' } })).toBe(true);
    expect(at(where('zone.school'), { target: { label_id: 'out' } })).toBe(true);
    expect(at(where('zone.school'), { target: { area_id: 'office' } })).toBe(false);
    // A zone with an area of its own counts for its device named directly, not through the
    // device's area.
    expect(at(where('zone.depot'), { target: { device_id: 'bus' } })).toBe(true);
    expect(at(where('zone.depot'), { target: { area_id: 'town' } })).toBe(false);
    expect(at(where('zone.depot'), { target: { area_id: 'office' } })).toBe(true);
    // Naming the bus names its seat; the seat takes the bus's area.
    expect(at(where('zone.stop'), { target: { device_id: 'bus' } })).toBe(true);
    expect(at(where('zone.stop'), { target: { area_id: 'town' } })).toBe(true);
    expect(at(where('zone.stop'), { target: { device_id: 'seat' } })).toBe(true);
    expect(at(where('zone.school'), { target: { device_id: 'seat' } })).toBe(false);
    // The light shares the office and the label but is no zone.
    expect(at(where('light.desk'), { target: { area_id: 'office', label_id: 'weekday' } })).toBe(
      false,
    );
  });

  it('leaves out what the target excludes, and zones with no state', () => {
    const gym = house({ state: 'x', in_zones: ['zone.gym'] });
    expect(at(gym, { target: { label_id: 'weekday', exclude: { entity_id: 'zone.gym' } } })).toBe(
      false,
    );
    expect(at(gym, { target: { label_id: 'weekday', exclude: { area_id: 'office' } } })).toBe(true);
    expect(
      at(house({ state: 'x', in_zones: ['zone.gone'] }), { target: { area_id: 'office' } }),
    ).toBe(false);
  });

  it('reads an id as Home Assistant does, a zone only with a dot, and an in_zones entry as written', () => {
    expect(at(house({ state: 'x', in_zones: ['zonex'] }), { target: { entity_id: 'zonex' } })).toBe(
      false,
    );
    // A list in in_zones finds the zone it names, and so matches no zone the target names.
    expect(
      at(house({ state: 'Work', in_zones: [['zone.work'], 'zone.work'] }), {
        target: { entity_id: 'zone.work' },
        match_mode: 'active_zone',
      }),
    ).toBe(false);
  });

  it('is false for a target Home Assistant could not resolve', () => {
    const hass = house({ state: 'Work', in_zones: ['zone.work'] });
    for (const target of [
      'zone.work',
      { entity_id: 5 },
      { zone: 'zone.work' },
      { entity_id: 'zone.work', exclude: { exclude: {} } },
    ]) {
      expect(at(hass, { target })).toBe(false);
    }
  });

  it('names the states it reads beyond the configuration, for the render rule', () => {
    const hass = house({ state: 'x', in_zones: ['zone.work', 'zone.yaml'] });
    expect(new Set(locationEntityIds(hass))).toEqual(
      new Set([
        'person.anna',
        'person.ben',
        'zone.work',
        'zone.gym',
        'zone.mall',
        'zone.school',
        'zone.depot',
        'zone.stop',
        'zone.cafe',
        'zone.gone',
        'zone.home',
        'zone.yaml',
      ]),
    );
    // A person found once is watched while its state lasts, though the registry has let go of it.
    expect(at(house({ state: 'home' }), { locations: ['home'] })).toBe(true);
    const unregistered = { ...hass, entities: {} } as Types.Hass;
    expect(locationEntityIds(unregistered)).toContain('person.anna');
    expect(
      entriesUseLocation([
        'calendar.a',
        {
          entity: 'calendar.b',
          visibility: [
            { condition: 'not', conditions: [{ condition: 'location', enabled: false }] },
          ],
        },
      ]),
    ).toBe(true);
    expect(entriesUseLocation([{ entity: 'calendar.b', visibility: [TEMPLATE] }])).toBe(false);
  });
});

describe('what core is asked', () => {
  const ask = (conditions: unknown[]) =>
    coreConditions(conditions, 'calendar.work').map(({ condition }) => condition);

  it('asks about everything Home Assistant judges in core, and nothing it judges in the browser', () => {
    const table = {
      template: TEMPLATE,
      sun: { condition: 'sun', after: 'sunset' },
      zone: { condition: 'zone', entity_id: 'person.anna', zone: 'zone.home' },
      device: { condition: 'device', device_id: 'x', domain: 'light', type: 'is_on' },
      unknown: { condition: 'spaceship' },
      dashboardState: { condition: 'state', entity: 'sun.sun', state: 'below_horizon' },
      bareState: { entity: 'sun.sun', state: 'below_horizon' },
      coreState: { condition: 'state', entity_id: 'sun.sun', state: 'below_horizon', for: 60 },
      numeric: { condition: 'numeric_state', entity: 'sensor.temp', above: 1 },
      allServer: { condition: 'or', conditions: [TEMPLATE, { condition: 'sun' }] },
      screen: { condition: 'screen', media_query: WIDE },
      user: { condition: 'user', users: ['u-anna'] },
      time: { condition: 'time', after: '08:00' },
      view_columns: { condition: 'view_columns', min: 2 },
      location: { condition: 'location', locations: ['home'] },
      attribute: { condition: 'state', entity: 'sun.sun', attribute: 'rising', state: 'true' },
      reference: { condition: 'state', entity: 'input_select.mode', state: 'sensor.ref' },
      referenceBound: { condition: 'numeric_state', entity: 'sensor.temp', above: 'sensor.limit' },
      held: { condition: 'state', entity: 'sun.sun', state: 'x', for: 5 },
      mixed: { condition: 'or', conditions: [TEMPLATE, { condition: 'user' }] },
      notACondition: 'template',
      noType: { condition: 3 },
    };
    expect(
      Object.fromEntries(Object.entries(table).map(([name, c]) => [name, isServerCondition(c)])),
    ).toEqual({
      template: true,
      sun: true,
      zone: true,
      device: true,
      unknown: true,
      dashboardState: true,
      bareState: true,
      coreState: true,
      numeric: true,
      allServer: true,
      screen: false,
      user: false,
      time: false,
      view_columns: false,
      location: false,
      attribute: false,
      reference: false,
      referenceBound: false,
      held: false,
      mixed: false,
      notACondition: false,
      noType: false,
    });
  });

  it("asks core about core's shape written without condition:, wait and all", () => {
    const held = { entity_id: 'sun.sun', state: 'above_horizon', for: '00:00:05' };
    expect(isServerCondition(held)).toBe(true);
    expect(ask([held])).toEqual([{ condition: 'state', ...held }]);
    expect(unjudgedConditions([held])).toEqual([]);
  });

  it("translates the dashboard's shapes to core's, as Home Assistant does", () => {
    expect(
      [
        { condition: 'state', entity: 'sun.sun', state: 'below_horizon', alias: 'Night' },
        { entity: 'sun.sun', state_not: ['above_horizon'] },
        { condition: 'numeric_state', entity: 'sensor.temp', above: '10.5', below: 30 },
        { condition: 'numeric_state', entity: 'sensor.temp', attribute: 'x' },
        { condition: 'numeric_state', entity: 'sensor.temp', above: 'warm' },
        { condition: 'numeric_state', entity: 'sensor.temp', above: Infinity },
        { condition: 'numeric_state', entity: 'sensor.temp', below: Infinity, above: 2 },
        { condition: 'state', entity: 'sun.sun' },
      ].map((condition) => ask([condition])[0]),
    ).toEqual([
      {
        alias: 'Night',
        condition: 'state',
        entity_id: 'sun.sun',
        state: 'below_horizon',
      },
      {
        condition: 'not',
        conditions: [{ condition: 'state', entity_id: 'sun.sun', state: ['above_horizon'] }],
      },
      {
        condition: 'numeric_state',
        entity_id: 'sensor.temp',
        above: 10.5,
        below: 30,
      },
      {
        condition: 'template',
        value_template: '{{ is_number(state_attr("sensor.temp", "x")) }}',
      },
      { condition: 'template', value_template: '{{ is_number(states("sensor.temp")) }}' },
      { condition: 'not', conditions: [{ condition: 'and', conditions: [] }] },
      { condition: 'numeric_state', entity_id: 'sensor.temp', above: 2 },
      { condition: 'not', conditions: [{ condition: 'and', conditions: [] }] },
    ]);
  });

  it('points a condition naming no entity at the calendar, at any depth', () => {
    expect(ask([{ condition: 'and', conditions: [{ condition: 'state', state: 'on' }] }])).toEqual([
      {
        condition: 'and',
        conditions: [{ condition: 'state', entity_id: 'calendar.work', state: 'on' }],
      },
    ]);
  });

  it("reads the dashboard's not as not(all of them), where core's is not(any of them)", () => {
    expect(ask([{ condition: 'not', conditions: [TEMPLATE, { condition: 'sun' }] }])).toEqual([
      {
        condition: 'not',
        conditions: [{ condition: 'and', conditions: [TEMPLATE, { condition: 'sun' }] }],
      },
    ]);
  });

  it('asks the children core judges under one parent together, like their parent, and none switched off', () => {
    const sun = { condition: 'sun', after: 'sunset' };
    expect(
      ask([
        TEMPLATE,
        { condition: 'or', conditions: [{ condition: 'user' }, sun, { ...TEMPLATE }] },
        { ...sun, enabled: false },
        { condition: 'not', conditions: [{ condition: 'screen' }, { condition: 'zone' }] },
        // A templated enabled on a node the browser judges leaves it unknown, unasked.
        {
          condition: 'or',
          enabled: '{{ x }}',
          conditions: [{ condition: 'user' }, { condition: 'device' }],
        },
      ]),
    ).toEqual([TEMPLATE, { condition: 'or', conditions: [sun, TEMPLATE] }, { condition: 'zone' }]);
    expect(ask([TEMPLATE, { condition: 'screen' }, sun])).toEqual([
      { condition: 'and', conditions: [TEMPLATE, sun] },
    ]);
  });

  it('asks each question once across the entries, and keys it by what it says', () => {
    const questions = entriesCoreConditions([
      'calendar.a',
      { entity: 'calendar.b', visibility: [TEMPLATE] },
      { entity: 'calendar.c', visibility: [{ ...TEMPLATE }, { condition: 'state', state: 'on' }] },
    ]);
    expect([...questions.values()]).toEqual([
      TEMPLATE,
      {
        condition: 'and',
        conditions: [TEMPLATE, { condition: 'state', entity_id: 'calendar.c', state: 'on' }],
      },
    ]);
    expect(coreKey({ ...TEMPLATE }, 'calendar.x')).toBe([...questions.keys()][0]);
    // JSON writes an infinity as null; the key still tells them apart.
    const bound = (above: number) =>
      coreKey({ condition: 'numeric_state', entity_id: 'sensor.temp', above }, 'calendar.x');
    expect(bound(Infinity)).not.toBe(bound(-Infinity));
  });
});

describe("core's answers", () => {
  const sun = { condition: 'sun', after: 'sunset' };

  function answered(conditions: unknown[], answers: Record<string, boolean | 'error'>) {
    const byKey = new Map(
      Object.entries(answers).map(([name, answer]) => [
        coreKey(
          name === 'template' ? TEMPLATE : name === 'sun' ? sun : JSON.parse(name),
          'calendar.work',
        ),
        answer,
      ]),
    );
    return evaluateVisibility(conditions, {
      hass: HASS,
      entityId: 'calendar.work',
      now: NOON,
      matches: (query) => query === WIDE,
      core: (key) => byKey.get(key),
    });
  }

  it('decide what the card could not', () => {
    expect(answered([TEMPLATE], { template: true })).toBe(true);
    expect(answered([TEMPLATE], { template: false })).toBe(false);
    // A not over what only core judges is one question, about the not.
    const notTemplate = { condition: 'not', conditions: [TEMPLATE] };
    expect(answered([notTemplate], { [JSON.stringify(notTemplate)]: true })).toBe(true);
    expect(answered([notTemplate], { template: false })).toBeUndefined();
    expect(answered([TEMPLATE, sun], { template: true })).toBeUndefined();
  });

  it('combine with what the browser judges', () => {
    const wide = { condition: 'screen', media_query: WIDE };
    expect(answered([{ condition: 'or', conditions: [TEMPLATE, wide] }], { template: false })).toBe(
      true,
    );
    expect(answered([wide, TEMPLATE], { template: true })).toBe(true);
    expect(
      answered([{ condition: 'state', entity: 'input_boolean.guest', state: 'off' }, TEMPLATE], {
        template: true,
      }),
    ).toBe(false);
  });

  it('win over what the card judged before they came', () => {
    const guest = { condition: 'state', entity: 'input_boolean.guest', state: 'on' };
    expect(judge([guest])).toBe(true);
    expect(answered([guest], { [JSON.stringify(guest)]: false })).toBe(false);
  });

  it('hide the entry on an error, even under a not', () => {
    expect(answered([TEMPLATE], { template: 'error' })).toBeUndefined();
    expect(
      answered([{ condition: 'not', conditions: [TEMPLATE] }], { template: 'error' }),
    ).toBeUndefined();
    expect(
      answered(
        [{ condition: 'or', conditions: [{ condition: 'user', users: ['u-anna'] }, TEMPLATE] }],
        {
          template: 'error',
        },
      ),
    ).toBeUndefined();
  });
});

describe("core's answers, as Home Assistant combines them", () => {
  const sun = { condition: 'sun', after: 'sunset' };
  const missing = { condition: 'state', entity_id: 'sensor.missing', state: 'on' };

  /** Judges a list with core's answers, given in the order its questions are asked. */
  function withAnswers(conditions: unknown[], answers: Array<boolean | null | 'error'>) {
    const questions = coreConditions(conditions, 'calendar.work');
    const byKey = new Map(questions.map(({ key }, index) => [key, answers[index]]));
    return evaluateVisibility(conditions, {
      hass: HASS,
      entityId: 'calendar.work',
      now: NOON,
      matches: (query) => query === WIDE,
      core: (key) => byKey.get(key),
    });
  }

  it('lets an or that holds through one child hide nothing, though another errs', () => {
    const list = [
      { condition: 'or', conditions: [{ condition: 'user', users: ['u-ben'] }, TEMPLATE, missing] },
    ];
    expect(coreConditions(list, 'calendar.work').map(({ condition }) => condition)).toEqual([
      { condition: 'or', conditions: [TEMPLATE, missing] },
    ]);
    // Core judges the or as a whole, and answers true despite the missing entity.
    expect(withAnswers(list, [true])).toBe(true);
    expect(withAnswers(list, ['error'])).toBeUndefined();
  });

  it("reads core's null, a node switched off, as passing an and and failing an or", () => {
    expect(withAnswers([TEMPLATE], [null])).toBe(true);
    expect(
      withAnswers(
        [{ condition: 'or', conditions: [{ condition: 'user', users: ['u-ben'] }, sun] }],
        [null],
      ),
    ).toBe(false);
    expect(
      withAnswers(
        [{ condition: 'not', conditions: [{ condition: 'screen', media_query: WIDE }, sun] }],
        [null],
      ),
    ).toBe(false);
  });

  it("falls back to the card's own judgment while an answer it needs is missing", () => {
    const guest = { condition: 'state', entity: 'input_boolean.guest', state: 'on' };
    // The guest switch is asked of core with the template; without an answer the card judges the
    // switch itself and cannot judge the template.
    expect(withAnswers([guest, TEMPLATE], [])).toBeUndefined();
    expect(withAnswers([guest], [])).toBe(true);
    expect(withAnswers([guest], [false])).toBe(false);
  });
});
