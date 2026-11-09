/**
 * `filter_duplicates: ignore_location` matches copies on their title, start and end, and
 * leaves the location out.
 *
 * Holiday calendars are why it exists. Home Assistant's Holiday integration gives each event
 * its calendar's region as the location, and calendars imported from elsewhere often do the
 * same, so one holiday that two regional calendars both carry reaches the card as two copies
 * that differ in location alone. `true` keeps both, correctly: it is the setting for two
 * genuinely separate bookings of one title in two rooms.
 *
 * The suite is built from default config, where `filter_duplicates` is `false`, so nothing
 * here is reachable unless a test sets it. Each runtime case pairs events that are identical
 * except for the one field under test, the way `duplicate-signature.test.ts` does for `true`,
 * so a signature that stops reading a field fails here rather than in someone's calendar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { type StoryEvent, listRows, mountStory } from './story-card';
import * as Config from '../src/config/config';
import { DUPLICATES_IGNORE_LOCATION } from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Routing from '../src/rendering/editor/routing';
import { buildContentSchema } from '../src/rendering/editor/schemas/content';
import {
  FILTER_DUPLICATES_MODES,
  deriveSyntheticData,
  filterDuplicatesMode,
} from '../src/rendering/editor/synthetic';
import { applyFormChange, toStoredConfig } from '../src/rendering/editor/value';
import * as EventUtils from '../src/utils/events';

const BAVARIA = 'calendar.holidays_bavaria';
const TICINO = 'calendar.holidays_ticino';

/** One all-day holiday, as a regional holiday calendar delivers it: its region as location. */
function holiday(
  entityId: string,
  location: string | undefined,
  summary = 'All Saints',
  date = '2026-06-18',
  endDate = '2026-06-19',
): Types.CalendarEventData {
  return {
    summary,
    start: { date },
    end: { date: endDate },
    ...(location === undefined ? {} : { location }),
    _entityId: entityId,
  };
}

/** A timed event, in one calendar or the other. */
function timed(
  entityId: string,
  location: string,
  from = '09:00',
  to = '10:00',
  summary = 'Review',
): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `2026-06-18T${from}:00.000Z` },
    end: { dateTime: `2026-06-18T${to}:00.000Z` },
    location,
    _entityId: entityId,
  };
}

/** The events a configuration draws, grouped as the card groups them, in the given view. */
function drawn(
  events: Types.CalendarEventData[],
  filterDuplicates: unknown,
  extra: Partial<Types.Config> = {},
  view: Types.EffectiveView = 'list',
): Types.CalendarEventData[] {
  const config = buildConfig({
    entities: [BAVARIA, TICINO],
    days_to_show: 7,
    filter_duplicates: filterDuplicates,
    ...extra,
  } as Partial<Types.Config>);
  config.entities = Config.normalizeEntities(config.entities);

  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  return EventUtils.groupEventsByDay(events, effective, false, 'en', view)
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay);
}

describe('filter_duplicates: ignore_location', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows one holiday two regional calendars carry once, and twice under true', () => {
    const pair = [holiday(BAVARIA, 'Bavaria'), holiday(TICINO, 'Ticino')];

    const once = drawn(pair, DUPLICATES_IGNORE_LOCATION);
    expect(once.map((event) => event.summary)).toEqual(['All Saints']);
    // The copy kept is the first-listed calendar's, location and all, as under `true`.
    expect(once[0]._entityId).toBe(BAVARIA);
    expect(once[0].location).toBe('Bavaria');
    // And it is a merged row, so labels and `duplicate_accent_color` reach it.
    expect(once[0]._mergedFrom?.map((calendar) => calendar.entityId)).toEqual([BAVARIA, TICINO]);

    expect(drawn(pair, true).map((event) => event.location)).toEqual(['Bavaria', 'Ticino']);
    expect(drawn(pair, false).map((event) => event.location)).toEqual(['Bavaria', 'Ticino']);
  });

  it('control: true collapses the same pair once the locations agree', () => {
    // Without this the `true` arm above would also pass against a filter that never matched
    // anything, and the location would be shown to separate nothing.
    const pair = [holiday(BAVARIA, 'Europe'), holiday(TICINO, 'Europe')];

    expect(drawn(pair, true)).toHaveLength(1);
  });

  it('matches a copy with a location and one without', () => {
    const pair = [holiday(BAVARIA, 'Bavaria'), holiday(TICINO, undefined)];

    expect(drawn(pair, DUPLICATES_IGNORE_LOCATION)).toHaveLength(1);
    expect(drawn(pair, true)).toHaveLength(2);
  });

  it('collapses one booking in two rooms, which true keeps apart', () => {
    const pair = [timed(BAVARIA, 'Room A'), timed(TICINO, 'Room B')];

    expect(drawn(pair, DUPLICATES_IGNORE_LOCATION)).toHaveLength(1);
    expect(drawn(pair, true)).toHaveLength(2);
  });

  it('still keeps a pair apart that differs in title', () => {
    const pair = [holiday(BAVARIA, 'Bavaria'), holiday(TICINO, 'Ticino', 'Assumption Day')];

    expect(drawn(pair, DUPLICATES_IGNORE_LOCATION).map((event) => event.summary)).toEqual([
      'All Saints',
      'Assumption Day',
    ]);
  });

  it('still keeps an all-day pair apart that shares its start but not its end', () => {
    const pair = [
      holiday(BAVARIA, 'Bavaria', 'Holidays', '2026-06-18', '2026-06-19'),
      holiday(TICINO, 'Ticino', 'Holidays', '2026-06-18', '2026-06-21'),
    ];

    expect(drawn(pair, DUPLICATES_IGNORE_LOCATION)).toHaveLength(2);
  });

  it('still keeps an all-day pair apart that shares its end but not its start', () => {
    const pair = [
      holiday(BAVARIA, 'Bavaria', 'Holidays', '2026-06-18', '2026-06-21'),
      holiday(TICINO, 'Ticino', 'Holidays', '2026-06-20', '2026-06-21'),
    ];

    expect(drawn(pair, DUPLICATES_IGNORE_LOCATION)).toHaveLength(2);
  });

  it('still keeps a timed pair apart that differs in start or in end', () => {
    expect(
      drawn([timed(BAVARIA, 'Room A'), timed(TICINO, 'Room B', '09:30')], 'ignore_location'),
    ).toHaveLength(2);
    expect(
      drawn(
        [timed(BAVARIA, 'Room A'), timed(TICINO, 'Room B', '09:00', '10:30')],
        'ignore_location',
      ),
    ).toHaveLength(2);
  });

  it.each([
    ['list', 'list'],
    ['column', 'column'],
    // Grid deduplicates without the first-eligible pass list and column make, and splits
    // through its own function, so it is a separate path rather than a third copy of one.
    ['grid', 'time_grid'],
  ] as const)('applies in %s view, from the card and from its %s: block', (view, block) => {
    const inBlock = (value: unknown) =>
      ({ [block]: { filter_duplicates: value } }) as Partial<Types.Config>;

    for (const pair of [
      [holiday(BAVARIA, 'Bavaria'), holiday(TICINO, 'Ticino')],
      [timed(BAVARIA, 'Room A'), timed(TICINO, 'Room B')],
    ]) {
      expect(drawn(pair, DUPLICATES_IGNORE_LOCATION, {}, view)).toHaveLength(1);
      expect(drawn(pair, true, {}, view)).toHaveLength(2);
      expect(drawn(pair, true, inBlock(DUPLICATES_IGNORE_LOCATION), view)).toHaveLength(1);
      expect(drawn(pair, DUPLICATES_IGNORE_LOCATION, inBlock(true), view)).toHaveLength(2);
      expect(drawn(pair, DUPLICATES_IGNORE_LOCATION, inBlock(false), view)).toHaveLength(2);
    }
  });

  it('leaves a view without a block of its own on the card-wide value', () => {
    const pair = [holiday(BAVARIA, 'Bavaria'), holiday(TICINO, 'Ticino')];
    const column = { column: { filter_duplicates: DUPLICATES_IGNORE_LOCATION } };

    expect(drawn(pair, true, column as Partial<Types.Config>, 'list')).toHaveLength(2);
    expect(drawn(pair, true, column as Partial<Types.Config>, 'column')).toHaveLength(1);
  });
});

describe('a card set to ignore_location', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The holiday as each regional calendar's feed returns it. */
  const feed = (location: string): StoryEvent => ({
    summary: 'All Saints',
    start: { date: '2026-06-18' },
    end: { date: '2026-06-19' },
    location,
  });

  const payload = { [BAVARIA]: [feed('Bavaria')], [TICINO]: [feed('Ticino')] };

  async function rows(filterDuplicates: unknown) {
    const card = await mountStory(
      {
        type: 'custom:calendar-card-pro-dev',
        entities: [BAVARIA, TICINO],
        days_to_show: 7,
        filter_duplicates: filterDuplicates,
      },
      { payload },
    );
    return listRows(card).map((row) => [row.title, row.location]);
  }

  it('draws the holiday once, with the first-listed calendar’s location', async () => {
    // The whole path: `setConfig` and view resolution must hand the string through untouched.
    // A boolean coercion anywhere on the way would read it as `true` and draw two rows.
    expect(await rows(DUPLICATES_IGNORE_LOCATION)).toEqual([['All Saints', 'Bavaria']]);
  });

  it('control: draws it twice under true', async () => {
    expect(await rows(true)).toEqual([
      ['All Saints', 'Bavaria'],
      ['All Saints', 'Ticino'],
    ]);
  });
});

describe('the editor’s duplicate dropdown', () => {
  function pick(config: Types.Config, value: string) {
    const before = { ...config, ...deriveSyntheticData(config) } as Record<string, unknown>;
    const applied = applyFormChange(
      config,
      before,
      { ...before, filter_duplicates_mode: value },
      {},
    );
    return { config: applied.config, stored: toStoredConfig(applied.config) };
  }

  it('offers off, every field, and every field but the location, in that order', () => {
    expect(FILTER_DUPLICATES_MODES).toEqual(['off', 'exact', 'ignore_location']);
  });

  it.each([
    [false, 'off'],
    [undefined, 'off'],
    [true, 'exact'],
    [DUPLICATES_IGNORE_LOCATION, 'ignore_location'],
    // The card treats any other truthy value as `true`, so the dropdown must not say off.
    ['yes', 'exact'],
  ])('reads %s as %s', (value, mode) => {
    expect(filterDuplicatesMode(value)).toBe(mode);
  });

  it('stores ignore_location as the string the card reads', () => {
    const { config, stored } = pick(buildConfig(), 'ignore_location');

    expect(config.filter_duplicates).toBe(DUPLICATES_IGNORE_LOCATION);
    expect(stored.filter_duplicates).toBe(DUPLICATES_IGNORE_LOCATION);
  });

  it('stores exact as true and off as the default, never the strings a select emits', () => {
    const configured = buildConfig({ filter_duplicates: DUPLICATES_IGNORE_LOCATION });

    expect(pick(configured, 'exact').stored.filter_duplicates).toBe(true);

    const off = pick(configured, 'off');
    expect(off.config.filter_duplicates).toBe(false);
    expect(off.stored).not.toHaveProperty('filter_duplicates');
  });

  it.each([
    ['list', 'list'],
    ['column', 'column'],
    ['grid', 'time_grid'],
  ] as const)(
    'writes from the %s workspace into %s: and leaves the card-wide value alone',
    (workspace, block) => {
      const config = buildConfig({ filter_duplicates: true });
      const frame: Routing.FormFrame = {
        workspace,
        schema: [{ name: 'filter_duplicates_mode', selector: { text: {} } }],
        data: Routing.workspaceFormData(config, workspace),
      };
      expect(frame.data.filter_duplicates_mode).toBe('exact');

      const ignore = Routing.applyWorkspaceChange(
        config,
        frame,
        { ...frame.data, filter_duplicates_mode: 'ignore_location' },
        {},
      ).config;
      expect(ignore[block]).toMatchObject({ filter_duplicates: DUPLICATES_IGNORE_LOCATION });
      expect(ignore.filter_duplicates).toBe(true);
      expect(toStoredConfig(ignore)[block]).toMatchObject({
        filter_duplicates: DUPLICATES_IGNORE_LOCATION,
      });
      expect(Routing.workspaceFormData(ignore, workspace).filter_duplicates_mode).toBe(
        'ignore_location',
      );

      // Off in a view is a stored `false`, not a cleared key, which would inherit the card's on.
      const off = Routing.applyWorkspaceChange(
        config,
        frame,
        { ...frame.data, filter_duplicates_mode: 'off' },
        {},
      ).config;
      expect(off[block]).toMatchObject({ filter_duplicates: false });
      expect(Routing.workspaceFormData(off, workspace).filter_duplicates_mode).toBe('off');
    },
  );

  it('offers the shared-event color under ignore_location, as under true', () => {
    const names = (filterDuplicates: unknown) =>
      buildContentSchema({
        view: 'list',
        language: 'en',
        config: buildConfig({ filter_duplicates: filterDuplicates } as Partial<Types.Config>),
      }).map((node) => node.name);

    expect(names(false)).not.toContain('duplicate_accent_color');
    expect(names(true)).toContain('duplicate_accent_color');
    expect(names(DUPLICATES_IGNORE_LOCATION)).toContain('duplicate_accent_color');
  });
});
