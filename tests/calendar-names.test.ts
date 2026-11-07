/**
 * The per-calendar `name` option, as the configuration holds it and as the card resolves it.
 *
 * Every case here sets `name`, because the default configuration has none and a suite built
 * from defaults would pass against a resolver that ignored it. The surfaces that read the
 * resolver — the legend, the "Couldn't load" notice, the event popover and the grid's
 * screen-reader names — are pinned beside their own existing tests; this file pins the two
 * things they share: what normalization keeps, and which name wins.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  calendarName,
  configuredCalendarName,
  failedCalendarName,
  homeAssistantName,
} from '../src/utils/calendar-names';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** Home Assistant holding a name for Anna's calendar and a blank one for Ben's. */
const hass = {
  states: {
    [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna calendar' } },
    [BEN]: { entity_id: BEN, state: 'off', attributes: { friendly_name: '   ' } },
  },
} as unknown as Types.Hass;

/**
 * A configuration holding just the given entities.
 *
 * @param entities - The list, as written
 * @returns The configuration the resolver reads
 */
function configWith(entities: Array<string | Types.EntityConfig>): Pick<Types.Config, 'entities'> {
  return { entities };
}

describe('normalizing a calendar name', () => {
  it('keeps a name, trimmed, and drops a blank one or one that is not text', () => {
    const normalized = Config.normalizeEntities([
      { entity: ANNA, name: '  Anna at work  ' },
      { entity: BEN, name: '   ' },
      { entity: 'calendar.family', name: '' },
      { entity: 'calendar.carl', name: 42 },
      { entity: 'calendar.dora' },
      'calendar.emil',
    ] as unknown as Parameters<typeof Config.normalizeEntities>[0]);

    // Pinned by value, so a name surviving where it should not fails as loudly as one lost.
    expect(normalized.map((entry) => [entry.entity, entry.name])).toEqual([
      [ANNA, 'Anna at work'],
      [BEN, undefined],
      ['calendar.family', undefined],
      ['calendar.carl', undefined],
      ['calendar.dora', undefined],
      ['calendar.emil', undefined],
    ]);
  });
});

describe('which name a calendar goes by', () => {
  it('is the name the configuration gives it, then Home Assistant’s, then its entity id', () => {
    const resolved = (entities: Array<string | Types.EntityConfig>, id: string) =>
      calendarName(id, configWith(entities), hass);

    expect({
      named: resolved([{ entity: ANNA, name: 'Anna at work' }], ANNA),
      homeAssistant: resolved([ANNA], ANNA),
      // Ben's state carries only a blank name, which is no name.
      blankInHomeAssistant: resolved([BEN], BEN),
      unknown: resolved(['calendar.typo'], 'calendar.typo'),
      noHass: calendarName(ANNA, configWith([ANNA]), undefined),
      noConfig: calendarName(ANNA, undefined, hass),
    }).toEqual({
      named: 'Anna at work',
      homeAssistant: 'Anna calendar',
      blankInHomeAssistant: BEN,
      unknown: 'calendar.typo',
      noHass: ANNA,
      noConfig: 'Anna calendar',
    });
  });

  it('reads the whole list, so a name on a later block of the calendar still names it', () => {
    const config = configWith([
      { entity: ANNA, event_type: 'timed' },
      BEN,
      { entity: ANNA, event_type: 'all_day', name: 'Anna at work' },
    ]);

    expect(calendarName(ANNA, config, hass)).toBe('Anna at work');
    // Another calendar's name is not this one's.
    expect(calendarName(BEN, config, hass)).toBe(BEN);
  });

  it('takes the first name that is not blank, and trims it', () => {
    const config = configWith([
      { entity: ANNA, name: '   ' },
      { entity: ANNA, name: ' Anna at work ' },
      { entity: ANNA, name: 'Anna at home' },
    ]);

    expect(configuredCalendarName(config.entities, ANNA)).toBe('Anna at work');
    expect(calendarName(ANNA, config, hass)).toBe('Anna at work');
  });

  it('reads a list as the editor holds it, malformed entries and all', () => {
    const entities = [null, 42, 'calendar.anna', { name: 'No entity' }, { entity: ANNA, name: 7 }];

    expect(configuredCalendarName(entities, ANNA)).toBeUndefined();
    expect(configuredCalendarName(undefined, ANNA)).toBeUndefined();
  });

  it("reads Home Assistant's name only where it is usable text", () => {
    expect([
      homeAssistantName(ANNA, hass),
      homeAssistantName(BEN, hass),
      homeAssistantName('calendar.typo', hass),
      homeAssistantName(ANNA, null),
    ]).toEqual(['Anna calendar', undefined, undefined, undefined]);
  });
});

describe('a calendar named in the "Couldn\'t load" notice', () => {
  it('keeps the entity id beside a name only where Home Assistant does not know the calendar', () => {
    const config = configWith([
      { entity: ANNA, name: 'Anna at work' },
      { entity: 'calendar.typo', name: 'Ben at school' },
      BEN,
      'calendar.unknown',
    ]);

    expect(
      [ANNA, 'calendar.typo', BEN, 'calendar.unknown'].map((id) =>
        failedCalendarName(id, config, hass),
      ),
    ).toEqual([
      // Known to Home Assistant: named as everywhere else.
      'Anna at work',
      // Unknown to it, so the id someone has to fix stays in view.
      'Ben at school (calendar.typo)',
      // No name of its own and only a blank one in Home Assistant: its id, as before.
      BEN,
      'calendar.unknown',
    ]);
  });
});
