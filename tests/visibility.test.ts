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
  evaluateVisibility,
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
    ['location', { condition: 'location', locations: ['home'] }],
    [
      'a state of an entity with no state',
      { condition: 'state', entity: 'sensor.missing', state: 'on' },
    ],
    ['not a condition at all', 'user'],
    ['a templated enabled', { condition: 'user', users: ['u-anna'], enabled: '{{ x }}' }],
  ])('cannot judge %s', (_name, condition) => {
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

  it('names the conditions it cannot judge, to warn about', () => {
    expect(
      unjudgedConditions([
        TEMPLATE,
        { condition: 'or', conditions: [{ condition: 'location' }, { condition: 'user' }] },
        42,
        { entity: 'input_boolean.guest', state: 'on' },
      ]),
    ).toEqual(['template', 'location', 'malformed']);
  });
});

/**
 * Where the card answers differently from Home Assistant's own functions, on purpose.
 *
 * Home Assistant leaves the first three to core and has no answer of its own in the browser;
 * the card has no core to ask, so it answers as core would. The last two hide what Home
 * Assistant would show or compare oddly, because an entry is hidden whenever the card is unsure.
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

  it('leaves a state held for a while to core in the dashboard shape too', () => {
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
  });

  it('leaves to core what only core can judge', () => {
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

  it('cannot judge an attribute of an entity with no state, which Home Assistant reads as unknown', () => {
    expect(
      judge([{ condition: 'state', entity: 'sensor.missing', attribute: 'x', state: 'unknown' }]),
    ).toBeUndefined();
  });
});
