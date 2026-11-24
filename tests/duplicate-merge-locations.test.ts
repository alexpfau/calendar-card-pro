/**
 * `filter_duplicates: merge_locations` matches copies as `ignore_location` does, on title, start
 * and end, and then lists every copy's location on the row it keeps instead of the first one's.
 *
 * It is opt-in because the regional-holiday case `ignore_location` exists for wants the
 * opposite: `tests/duplicate-ignore-location.test.ts` pins that the first calendar's location
 * alone is shown there, and nothing here changes that. Each case below pairs copies that differ
 * in location alone, and most assert the `ignore_location` answer beside the new one, so a
 * change that leaked the merge into the default fails here as well as there.
 *
 * Each listed location is drawn as its own calendar draws it: its `show_location`, its location
 * replacement and its privacy, never the kept calendar's. The cases for those set them on the
 * calendar whose copy is dropped, where an implementation reading the kept row's options alone
 * would still pass a case that set them on the kept one.
 *
 * The suite is built from default config, where `filter_duplicates` is `false`, so nothing here
 * is reachable unless a test sets it.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { type StoryEvent, listRows, mountStory } from './story-card';
import * as Config from '../src/config/config';
import { DUPLICATES_IGNORE_LOCATION, DUPLICATES_MERGE_LOCATIONS } from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { buildDetailEntry, displayText, privateFields } from '../src/interaction/event-details';
import * as Routing from '../src/rendering/editor/routing';
import { buildContentSchema } from '../src/rendering/editor/schemas/content';
import {
  FILTER_DUPLICATES_MODES,
  deriveSyntheticData,
  filterDuplicatesMode,
} from '../src/rendering/editor/synthetic';
import { applyFormChange, toStoredConfig } from '../src/rendering/editor/value';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import * as EventUtils from '../src/utils/events';
import * as MonthDay from '../src/utils/month-day';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';

/** A timed event, as one calendar delivers it, with `_source` as `processEvents` stamps it. */
function timed(entityId: string, location: string | undefined): Types.CalendarEventData {
  const raw = {
    summary: 'Review',
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    ...(location === undefined ? {} : { location }),
  };
  return { ...raw, _source: raw, _entityId: entityId };
}

/** A one-day all-day event, as one calendar delivers it. */
function allDay(entityId: string, location: string | undefined): Types.CalendarEventData {
  const raw = {
    summary: 'Field Trip',
    start: { date: '2026-06-18' },
    end: { date: '2026-06-19' },
    ...(location === undefined ? {} : { location }),
  };
  return { ...raw, _source: raw, _entityId: entityId };
}

/** The days a configuration draws, matched and grouped as the card does, in the given view. */
function grouped(
  events: Types.CalendarEventData[],
  filterDuplicates: unknown,
  extra: Partial<Types.Config> = {},
  view: Types.EffectiveView = 'list',
): { days: Types.EventsByDay[]; effective: Types.Config } {
  const config = buildConfig({
    entities: [ANNA, BEN, LEO],
    days_to_show: 7,
    filter_duplicates: filterDuplicates,
    ...extra,
  } as Partial<Types.Config>);

  // Matched as the card matches them, so each copy carries its entry (`_matchedConfig`), whose
  // options and privacy decide its location.
  const matched = EventUtils.processEvents(events, config);
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  return { days: EventUtils.groupEventsByDay(matched, effective, false, 'en', view), effective };
}

/** The rows a configuration draws, in the given view. */
function drawn(...args: Parameters<typeof grouped>): Types.CalendarEventData[] {
  return grouped(...args)
    .days.flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay);
}

/** Each drawn row's location. */
const locations = (...args: Parameters<typeof drawn>) =>
  drawn(...args).map((event) => event.location);

describe('filter_duplicates: merge_locations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws two calendars with different locations as one row listing both', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, 'Room B')];

    const rows = drawn(pair, DUPLICATES_MERGE_LOCATIONS);
    expect(rows.map((event) => [event.summary, event.location])).toEqual([
      ['Review', 'Room A · Room B'],
    ]);
    // Everything else is `ignore_location`'s: the first calendar's copy, merged from both.
    expect(rows[0]._entityId).toBe(ANNA);
    expect(rows[0]._mergedFrom?.map((calendar) => calendar.entityId)).toEqual([ANNA, BEN]);

    // Control: the default keeps the first calendar's location alone.
    expect(locations(pair, DUPLICATES_IGNORE_LOCATION)).toEqual(['Room A']);
  });

  it('lists the locations in entities order, not in the order the events arrive', () => {
    const arriving = [timed(BEN, 'Room B'), timed(ANNA, 'Room A')];

    expect(locations(arriving, DUPLICATES_MERGE_LOCATIONS)).toEqual(['Room A · Room B']);
    expect(
      locations(arriving, DUPLICATES_MERGE_LOCATIONS, { entities: [BEN, ANNA] } as never),
    ).toEqual(['Room B · Room A']);
  });

  it('lists a location two copies share once', () => {
    expect(locations([timed(ANNA, 'Room A'), timed(BEN, 'Room A')], 'merge_locations')).toEqual([
      'Room A',
    ]);
    // Trimmed before comparing, so stray whitespace does not make a second entry.
    expect(locations([timed(ANNA, 'Room A'), timed(BEN, ' Room A ')], 'merge_locations')).toEqual([
      'Room A',
    ]);
  });

  it('leaves out a copy without a location, or with a blank one', () => {
    expect(locations([timed(ANNA, undefined), timed(BEN, 'Room B')], 'merge_locations')).toEqual([
      'Room B',
    ]);
    expect(
      locations(
        [timed(ANNA, 'Room A'), timed(BEN, '  '), timed(LEO, undefined)],
        'merge_locations',
      ),
    ).toEqual(['Room A']);
  });

  it.each([
    ['timed', timed],
    ['all-day', allDay],
  ] as const)('merges three calendars, %s', (_, make) => {
    const trio = [make(LEO, 'Gym'), make(ANNA, 'Room A'), make(BEN, 'Room B')];

    const rows = drawn(trio, DUPLICATES_MERGE_LOCATIONS);
    expect(rows.map((event) => event.location)).toEqual(['Room A · Room B · Gym']);
    expect(rows[0]._mergedFrom?.map((calendar) => calendar.entityId)).toEqual([ANNA, BEN, LEO]);
    expect(locations(trio, DUPLICATES_IGNORE_LOCATION)).toEqual(['Room A']);
  });

  it('still keeps apart copies that true and ignore_location keep apart', () => {
    const otherTitle = { ...timed(BEN, 'Room B'), summary: 'Standup' };

    expect(locations([timed(ANNA, 'Room A'), otherTitle], 'merge_locations')).toEqual([
      'Room A',
      'Room B',
    ]);
  });

  it.each([
    ['list', 'list'],
    ['column', 'column'],
    // Grid deduplicates per day without the first-eligible pass, and settles its banners in
    // `resolveGridBanners`, so it is a path of its own.
    ['grid', 'time_grid'],
  ] as const)('applies in %s view, from the card and from its %s: block', (view, block) => {
    // Grid draws no location in a block by default, so every block turns it on.
    const shown = { show_location: true };
    const inBlock = (value?: unknown) =>
      ({
        [block]: { ...shown, ...(value === undefined ? {} : { filter_duplicates: value }) },
      }) as Partial<Types.Config>;

    for (const pair of [
      [timed(ANNA, 'Room A'), timed(BEN, 'Room B')],
      [allDay(ANNA, 'Room A'), allDay(BEN, 'Room B')],
    ]) {
      expect(locations(pair, DUPLICATES_MERGE_LOCATIONS, inBlock(), view)).toEqual([
        'Room A · Room B',
      ]);
      expect(locations(pair, true, inBlock(DUPLICATES_MERGE_LOCATIONS), view)).toEqual([
        'Room A · Room B',
      ]);
      // A view's own value wins over the card's, either way round.
      expect(locations(pair, DUPLICATES_MERGE_LOCATIONS, inBlock('ignore_location'), view)).toEqual(
        ['Room A'],
      );
      expect(locations(pair, DUPLICATES_MERGE_LOCATIONS, inBlock(true), view)).toEqual([
        'Room A',
        'Room B',
      ]);
    }
  });

  it.each([
    ['both calendars', {}],
    // The banner is settled per event before the merge (`resolveGridBanners`), so a calendar
    // that draws no banners of its own still adds its location on every day. A banner draws no
    // location, but its rows carry it to search.
    ['the kept calendar not', { entities: [{ entity: ANNA, multiday_banners: false }, BEN] }],
    ['the dropped calendar not', { entities: [ANNA, { entity: BEN, multiday_banners: false }] }],
  ] as const)(
    'merges a multi-day banner in grid view on every day, banners from %s',
    (_, extra) => {
      const banner = (entityId: string, location: string): Types.CalendarEventData => ({
        summary: 'Conference',
        start: { dateTime: '2026-06-17T08:00:00.000Z' },
        end: { dateTime: '2026-06-19T18:00:00.000Z' },
        location,
        _entityId: entityId,
      });
      const { days } = grouped(
        [banner(ANNA, 'Hall 1'), banner(BEN, 'Hall 2')],
        DUPLICATES_MERGE_LOCATIONS,
        {
          multiday_banners: true,
          time_grid: { show_location: true },
          ...extra,
        } as Partial<Types.Config>,
        'grid',
      );

      const byDay = days
        .map((day) => [
          new Date(day.timestamp).toISOString().slice(0, 10),
          day.events.filter((event) => !event._isEmptyDay).map((event) => event.location),
        ])
        .filter(([, locations]) => locations.length > 0);
      expect(byDay).toEqual([
        ['2026-06-17', ['Hall 1 · Hall 2']],
        ['2026-06-18', ['Hall 1 · Hall 2']],
        ['2026-06-19', ['Hall 1 · Hall 2']],
      ]);
    },
  );

  it('draws the merged location on a grid block', () => {
    const config = buildConfig({
      view: 'grid',
      days_to_show: 1,
      entities: [ANNA, BEN],
      filter_duplicates: DUPLICATES_MERGE_LOCATIONS,
      time_grid: { show_location: true },
    } as Partial<Types.Config>);
    config.entities = Config.normalizeEntities(config.entities);
    const event = (entityId: string, location: string): Types.CalendarEventData => ({
      summary: 'Team lunch',
      start: { dateTime: '2026-06-17T11:00:00.000Z' },
      end: { dateTime: '2026-06-17T13:00:00.000Z' },
      location,
      _entityId: entityId,
    });
    const host = document.createElement('div');
    litRender(
      renderGridGroupedEvents(
        EventUtils.groupEventsByDay(
          [event(ANNA, 'Room A'), event(BEN, 'Room B')],
          config,
          false,
          'en',
          'grid',
        ),
        ViewConfig.resolveEffectiveConfig(config, 'grid'),
        'en',
        undefined,
        null,
        FROZEN_NOW,
      ),
      host,
    );

    expect(host.textContent).toContain('Room A · Room B');
  });

  it('strips the country from each location, not only from the last', () => {
    const pair = [timed(ANNA, 'Munich, Germany'), timed(BEN, 'Lugano, Switzerland')];

    expect(locations(pair, 'merge_locations', { remove_location_country: true })).toEqual([
      'Munich · Lugano',
    ]);
    expect(locations(pair, 'merge_locations', { remove_location_country: false })).toEqual([
      'Munich, Germany · Lugano, Switzerland',
    ]);
    // Two locations that differ only in their country read as one once it is gone.
    expect(
      locations([timed(ANNA, 'Munich, Germany'), timed(BEN, 'Munich')], 'merge_locations', {
        remove_location_country: true,
      }),
    ).toEqual(['Munich']);
  });

  it('rewrites each location with its own calendar’s replacement', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, 'Room B')];
    const strip = { replace_field: 'location', replace_pattern: 'Room ', replace_with: '' };
    const mask = { replace_field: 'location', replace_with: 'Home' };

    expect(
      locations(pair, 'merge_locations', { entities: [{ entity: ANNA, ...strip }, BEN] } as never),
    ).toEqual(['A · Room B']);
    expect(
      locations(pair, 'merge_locations', { entities: [ANNA, { entity: BEN, ...strip }] } as never),
    ).toEqual(['Room A · B']);
    // A calendar that masks its location keeps it masked on another calendar's row.
    expect(
      locations(pair, 'merge_locations', { entities: [ANNA, { entity: BEN, ...mask }] } as never),
    ).toEqual(['Room A · Home']);
  });

  it('rewrites each location as its calendar wrote it, spaces included', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, ' Secret Hall ')];
    const mask = {
      replace_field: 'location',
      replace_pattern: '^ Secret Hall $',
      replace_with: 'Home',
    };
    const entities = [ANNA, { entity: BEN, ...mask }];

    // Ben's own row masks it, so the merged row must too.
    expect(locations(pair, false, { entities } as never)).toEqual(['Room A', 'Home']);
    expect(locations(pair, 'merge_locations', { entities } as never)).toEqual(['Room A · Home']);
  });

  it('lists the locations in the order of the entries that matched them', () => {
    const atRoom = (room: string) => ({ entity: ANNA, filter_field: 'location', allowlist: room });
    const three = [timed(ANNA, 'Room A'), timed(BEN, 'Room B'), timed(ANNA, 'Room C')];

    expect(
      locations(three, 'merge_locations', {
        entities: [atRoom('Room A'), BEN, atRoom('Room C')],
      } as never),
    ).toEqual(['Room A · Room B · Room C']);

    // A card-level edit rebuilds the entries (`normalizeEntities`) and leaves the events matched
    // to the old ones, so the order is found by value as well.
    const options = {
      entities: [atRoom('Room A'), BEN, atRoom('Room C')],
      days_to_show: 7,
      filter_duplicates: DUPLICATES_MERGE_LOCATIONS,
    } as Partial<Types.Config>;
    const matched = EventUtils.processEvents(three, buildConfig(options));
    const edited = buildConfig({ ...options, title: 'Edited' });
    expect(
      EventUtils.groupEventsByDay(matched, edited, false, 'en', 'list')
        .flatMap((day) => day.events)
        .map((event) => event.location),
    ).toEqual(['Room A · Room B · Room C']);
  });

  it('lists each location only where its own calendar shows locations', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, 'Room B')];
    const hidden = (entity: string) => ({ entity, show_location: false });

    // A calendar that hides its location keeps it hidden on another calendar's row.
    expect(locations(pair, 'merge_locations', { entities: [ANNA, hidden(BEN)] } as never)).toEqual([
      'Room A',
    ]);
    // The calendar whose copy is kept hiding its own still lists the other's.
    expect(locations(pair, 'merge_locations', { entities: [hidden(ANNA), BEN] } as never)).toEqual([
      'Room B',
    ]);
    // A room both calendars carry is listed once, by the calendar that shows it.
    expect(
      locations([timed(ANNA, 'Room A'), timed(BEN, 'Room A')], 'merge_locations', {
        entities: [hidden(ANNA), BEN],
      } as never),
    ).toEqual(['Room A']);
    // Off card-wide, a calendar turning it on lists its own alone.
    expect(
      locations(pair, 'merge_locations', {
        show_location: false,
        entities: [ANNA, { entity: BEN, show_location: true }],
      } as never),
    ).toEqual(['Room B']);
    expect(locations(pair, 'merge_locations', { show_location: false })).toEqual(['']);
  });

  it('lists the locations of two events from one calendar it merged', () => {
    const same = [timed(ANNA, 'Room A'), timed(ANNA, 'Room B')];

    const rows = drawn(same, DUPLICATES_MERGE_LOCATIONS);
    expect(rows.map((event) => event.location)).toEqual(['Room A · Room B']);
    // Merged within one calendar, so no calendars are listed.
    expect(rows[0]._mergedFrom).toBeUndefined();
    expect(locations(same, DUPLICATES_IGNORE_LOCATION)).toEqual(['Room A']);
  });

  it('never lists a private calendar’s location on another calendar’s row', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, 'Room B')];

    // A private copy is never merged with one that is not, so each keeps its own row.
    const apart = drawn(pair, DUPLICATES_MERGE_LOCATIONS, {
      entities: [ANNA, { entity: BEN, private: true }],
    } as never);
    expect(apart.map((event) => [event._entityId, event.location])).toEqual([
      [ANNA, 'Room A'],
      [BEN, ''],
    ]);
    // Two private copies merge, and draw no location at all.
    const together = drawn(pair, DUPLICATES_MERGE_LOCATIONS, {
      entities: [
        { entity: ANNA, private: true },
        { entity: BEN, private: true },
      ],
    } as never);
    expect(together.map((event) => event.location)).toEqual(['']);
  });

  it('lists every location in Month’s day list, from the card and from its month: block', () => {
    const day = new Date(2026, 5, 18);
    const listedOn = (overrides: Partial<Types.Config>) => {
      const config = ViewConfig.resolveEffectiveConfig(
        buildConfig({ view: 'month', entities: [ANNA, BEN], ...overrides }),
        'month',
      );
      const events = EventUtils.processEvents(
        [timed(ANNA, 'Room A'), timed(BEN, 'Room B')],
        config,
      );
      return MonthDay.monthDayEvents(events, config, day, 'en').map((event) => event.location);
    };

    expect(listedOn({ filter_duplicates: DUPLICATES_MERGE_LOCATIONS } as never)).toEqual([
      'Room A · Room B',
    ]);
    expect(
      listedOn({
        filter_duplicates: true,
        month: { filter_duplicates: DUPLICATES_MERGE_LOCATIONS },
      } as never),
    ).toEqual(['Room A · Room B']);
    expect(listedOn({ filter_duplicates: DUPLICATES_IGNORE_LOCATION } as never)).toEqual([
      'Room A',
    ]);
  });

  it('keeps the calendar’s own location in _source, for the edit dialog', () => {
    const [row] = drawn([timed(ANNA, 'Room A'), timed(BEN, 'Room B')], 'merge_locations');

    expect(row.location).toBe('Room A · Room B');
    expect(row._source?.location).toBe('Room A');
    expect(buildDetailEntry(row)?.location).toBe('Room A');
  });

  it('shows every location in the popover, a calendar’s hidden ones included', () => {
    const pair = [timed(ANNA, 'Room A'), timed(BEN, 'Room B')];
    expect(displayText(drawn(pair, 'merge_locations')[0], 'en').location).toBe('Room A · Room B');

    // The rows leave out Ben's; the popover shows every location an event has, as for any event.
    const [hidden] = drawn(pair, 'merge_locations', {
      entities: [ANNA, { entity: BEN, show_location: false }],
    } as never);
    expect(hidden.location).toBe('Room A');
    expect(displayText(hidden, 'en').location).toBe('Room A · Room B');

    // Control: ignore_location keeps the first calendar's location alone there too.
    expect(displayText(drawn(pair, DUPLICATES_IGNORE_LOCATION)[0], 'en').location).toBe('Room A');
  });

  it('shows a private calendar’s merged location as Private, behind a lock', () => {
    // The kept copy has no location of its own, so only the merged list can say there is one.
    const [row] = drawn([timed(ANNA, undefined), timed(BEN, 'Room B')], 'merge_locations', {
      entities: [
        { entity: ANNA, private: true },
        { entity: BEN, private: true },
      ],
    } as never);
    expect(row._mergedFrom?.map((calendar) => calendar.entityId)).toEqual([ANNA, BEN]);
    expect(displayText(row, 'en').location).toBe('Private');
    expect(privateFields(row, 'en')).toEqual({ title: true, location: true, description: false });
  });
});

describe('a card set to merge_locations', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const feed = (location: string): StoryEvent => ({
    summary: 'Review',
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    location,
  });

  async function rows(filterDuplicates: unknown, entities: unknown[] = [ANNA, BEN]) {
    const card = await mountStory(
      {
        type: 'custom:calendar-card-pro-dev',
        entities,
        days_to_show: 7,
        filter_duplicates: filterDuplicates,
      },
      { payload: { [ANNA]: [feed('Room A')], [BEN]: [feed('Room B')] } },
    );
    return listRows(card).map((row) => [row.title, row.location]);
  }

  it('draws one row listing both locations, through setConfig and the renderer', async () => {
    expect(await rows(DUPLICATES_MERGE_LOCATIONS)).toEqual([['Review', 'Room A · Room B']]);
  });

  it('leaves out the location of a calendar that hides its own', async () => {
    expect(
      await rows(DUPLICATES_MERGE_LOCATIONS, [ANNA, { entity: BEN, show_location: false }]),
    ).toEqual([['Review', 'Room A']]);
  });

  it('control: ignore_location draws the first calendar’s location alone', async () => {
    expect(await rows(DUPLICATES_IGNORE_LOCATION)).toEqual([['Review', 'Room A']]);
  });
});

describe('the editor’s duplicate dropdown, for merge_locations', () => {
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

  it('offers it last, after the mode it refines', () => {
    expect(FILTER_DUPLICATES_MODES).toEqual(['off', 'exact', 'ignore_location', 'merge_locations']);
  });

  it('reads the stored string back as its own choice', () => {
    expect(filterDuplicatesMode(DUPLICATES_MERGE_LOCATIONS)).toBe('merge_locations');
  });

  it('stores merge_locations as the string the card reads, and switches back', () => {
    const { config, stored } = pick(buildConfig(), 'merge_locations');
    expect(config.filter_duplicates).toBe(DUPLICATES_MERGE_LOCATIONS);
    expect(stored.filter_duplicates).toBe(DUPLICATES_MERGE_LOCATIONS);

    expect(pick(config, 'ignore_location').stored.filter_duplicates).toBe('ignore_location');
    expect(pick(config, 'exact').stored.filter_duplicates).toBe(true);
    expect(pick(config, 'off').stored).not.toHaveProperty('filter_duplicates');
  });

  it.each([
    ['list', 'list'],
    ['column', 'column'],
    ['grid', 'time_grid'],
    ['month', 'month'],
  ] as const)('writes from the %s workspace into %s:', (workspace, block) => {
    const config = buildConfig({ filter_duplicates: true });
    const frame: Routing.FormFrame = {
      workspace,
      schema: [{ name: 'filter_duplicates_mode', selector: { text: {} } }],
      data: Routing.workspaceFormData(config, workspace),
    };

    const merged = Routing.applyWorkspaceChange(
      config,
      frame,
      { ...frame.data, filter_duplicates_mode: 'merge_locations' },
      {},
    ).config;
    expect(merged.filter_duplicates).toBe(true);
    expect(toStoredConfig(merged)[block]).toMatchObject({
      filter_duplicates: DUPLICATES_MERGE_LOCATIONS,
    });
    expect(Routing.workspaceFormData(merged, workspace).filter_duplicates_mode).toBe(
      'merge_locations',
    );
  });

  it('offers the shared-event color under merge_locations', () => {
    const names = buildContentSchema({
      view: 'list',
      language: 'en',
      config: buildConfig({ filter_duplicates: DUPLICATES_MERGE_LOCATIONS }),
    }).map((node) => node.name);

    expect(names).toContain('duplicate_accent_color');
  });

  it('labels the choice in the dropdown', () => {
    const select = buildContentSchema({
      view: 'list',
      language: 'en',
      config: buildConfig(),
    }).find((node) => node.name === 'filter_duplicates_mode') as unknown as {
      selector: { select: { options: Array<{ value: string; label: string }> } };
    };

    expect(select.selector.select.options).toContainEqual({
      value: 'merge_locations',
      label: 'Same title, start and end, listing every location',
    });
  });
});
