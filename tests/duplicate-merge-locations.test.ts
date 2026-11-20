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
import { buildDetailEntry, displayText } from '../src/interaction/event-details';
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

/** The rows a configuration draws, grouped as the card groups them, in the given view. */
function drawn(
  events: Types.CalendarEventData[],
  filterDuplicates: unknown,
  extra: Partial<Types.Config> = {},
  view: Types.EffectiveView = 'list',
): Types.CalendarEventData[] {
  const config = buildConfig({
    entities: [ANNA, BEN, LEO],
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

  it('merges a multi-day banner in grid view the way it merges a row', () => {
    const banner = (entityId: string, location: string): Types.CalendarEventData => ({
      summary: 'Conference',
      start: { dateTime: '2026-06-17T08:00:00.000Z' },
      end: { dateTime: '2026-06-19T18:00:00.000Z' },
      location,
      _entityId: entityId,
    });
    const rows = drawn(
      [banner(ANNA, 'Hall 1'), banner(BEN, 'Hall 2')],
      DUPLICATES_MERGE_LOCATIONS,
      { multiday_banners: true, time_grid: { show_location: true } } as Partial<Types.Config>,
      'grid',
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((event) => event.location))).toEqual(new Set(['Hall 1 · Hall 2']));
    expect(rows.every((event) => event._gridBanner)).toBe(true);
  });

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

  it('applies a replace_field: location rewrite to the merged list', () => {
    const rows = drawn([timed(ANNA, 'Room A'), timed(BEN, 'Room B')], 'merge_locations', {
      entities: [
        { entity: ANNA, replace_field: 'location', replace_pattern: 'Room ', replace_with: '' },
        BEN,
      ],
    } as Partial<Types.Config>);

    expect(rows.map((event) => event.location)).toEqual(['A · B']);
  });

  it('keeps the calendar’s own location in _source, for the details and edit dialogs', () => {
    const [row] = drawn([timed(ANNA, 'Room A'), timed(BEN, 'Room B')], 'merge_locations');

    expect(row.location).toBe('Room A · Room B');
    expect(row._source?.location).toBe('Room A');
    expect(buildDetailEntry(row)?.location).toBe('Room A');
    expect(displayText(row, 'en').location).toBe('Room A');
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

  async function rows(filterDuplicates: unknown) {
    const card = await mountStory(
      {
        type: 'custom:calendar-card-pro-dev',
        entities: [ANNA, BEN],
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
