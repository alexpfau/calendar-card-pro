import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { preselectedCalendarId } from '../src/interaction/add-event';
import { laneAt } from '../src/rendering/activation';
import * as EventUtils from '../src/utils/events';
import * as GridUtils from '../src/utils/grid';
import * as Lanes from '../src/utils/lanes';

/**
 * Calendar lanes (backlog item 334): which lane an entry draws into, in what order, which a
 * layout draws, and how they reach the fit, the duplicates and a new event's calendar. The
 * renderer's geometry is `grid-lanes.test.ts`.
 */

const ANNA = 'calendar.anna';
const ANNA_WORK = 'calendar.anna_work';
const BEN = 'calendar.ben';

const entries = (...items: Array<string | Types.EntityConfig>) => Config.normalizeEntities(items);

describe('a lane', () => {
  it('is the entry’s calendar, or the lane its `lane` names, trimmed', () => {
    const [plain, named, blank] = entries(
      ANNA,
      { entity: ANNA_WORK, lane: '  Anna ' },
      { entity: BEN, lane: '   ' },
    );
    expect(Lanes.laneKey(plain)).toBe(ANNA);
    expect(Lanes.laneKey(named)).toBe('Anna');
    // Blank is no lane: normalization drops it, and the entry keeps its calendar's.
    expect(blank.lane).toBeUndefined();
    expect(Lanes.laneKey(blank)).toBe(BEN);
    expect(Lanes.laneKey(BEN)).toBe(BEN);
  });

  it('groups the calendars that share a `lane`, in the order the editor writes them', () => {
    // Written interleaved: the editor groups a calendar's entries whenever it edits the list, so
    // the lanes must come out in that grouped order already, or an unrelated edit moves them.
    const lanes = Lanes.buildLanes(
      entries(
        { entity: ANNA, lane: 'Anna', allowlist: 'work' },
        BEN,
        { entity: ANNA, lane: 'Kids', allowlist: 'school' },
        { entity: ANNA_WORK, lane: 'Anna' },
      ),
    );
    expect(lanes.map((lane) => [lane.key, lane.entityIds])).toEqual([
      ['Anna', [ANNA, ANNA_WORK]],
      ['Kids', [ANNA]],
      [BEN, [BEN]],
    ]);
    // The order the editor's regrouping writes leaves them where they were.
    const regrouped = Lanes.canonicalEntries(
      entries(
        { entity: ANNA, lane: 'Anna', allowlist: 'work' },
        BEN,
        { entity: ANNA, lane: 'Kids', allowlist: 'school' },
        { entity: ANNA_WORK, lane: 'Anna' },
      ),
    );
    expect(Lanes.buildLanes(regrouped).map((lane) => lane.key)).toEqual(['Anna', 'Kids', BEN]);
  });

  it('reads an event’s lane off the entry that admitted it', () => {
    const [entry] = entries({ entity: ANNA, lane: 'Anna' });
    expect(Lanes.eventLaneKey({ _entityId: ANNA, _matchedConfig: entry })).toBe('Anna');
    expect(Lanes.eventLaneKey({ _entityId: BEN })).toBe(BEN);
  });
});

describe('the lanes a layout draws', () => {
  it('are none unless the layout can draw them and `lanes` is on for it', () => {
    const config = buildConfig({ entities: [ANNA, BEN] });
    expect(Lanes.laneUniverse(config, 'grid')).toEqual([]);
    const on = buildConfig({ entities: [ANNA, BEN], lanes: true });
    expect(Lanes.laneUniverse(on, 'grid').map((lane) => lane.key)).toEqual([ANNA, BEN]);
    for (const view of ['list', 'column', 'month'] as const) {
      expect(Lanes.laneUniverse(on, view)).toEqual([]);
    }
  });

  it('leave out in Grid a calendar that keeps only all-day events, which the band shows', () => {
    const config = buildConfig({
      lanes: true,
      entities: [ANNA, { entity: 'calendar.holidays', event_type: 'all_day' }, BEN],
    });
    expect(Lanes.laneUniverse(config, 'grid').map((lane) => lane.key)).toEqual([ANNA, BEN]);
    // Every entry keeps only all-day events: no lane at all, so the grid draws as without lanes.
    const allDay = buildConfig({ lanes: true, event_type: 'all_day', entities: [ANNA, BEN] });
    expect(Lanes.laneUniverse(allDay, 'grid')).toEqual([]);
  });

  it('drop a lane only once the calendar filter hides every calendar in it', () => {
    const universe = Lanes.buildLanes(
      entries({ entity: ANNA, lane: 'Anna' }, { entity: ANNA_WORK, lane: 'Anna' }, BEN),
    );
    expect(Lanes.shownLanes(universe, new Set([ANNA])).map((lane) => lane.key)).toEqual([
      'Anna',
      BEN,
    ]);
    expect(Lanes.shownLanes(universe, new Set([ANNA, ANNA_WORK])).map((lane) => lane.key)).toEqual([
      BEN,
    ]);
  });

  it('are scoped in the editor’s tables exactly where the card draws them', () => {
    expect([...ViewConfig.VIEW_SCOPE.lanes].sort()).toEqual([...Lanes.LANE_VIEWS].sort());
    expect([...ViewConfig.VIEW_SCOPE.min_lane_width].sort()).toEqual([...Lanes.LANE_VIEWS].sort());
    expect([...ViewConfig.ENTITY_VIEW_SCOPE.lane].sort()).toEqual([...Lanes.LANE_VIEWS].sort());
  });
});

describe('fitting a grid that draws lanes', () => {
  const people = [ANNA, BEN, 'calendar.clara', 'calendar.david'];

  it('needs each lane’s width in every day, and nothing more without lanes', () => {
    // Three plain days at the default spacing, as the grid docs give it: 383px.
    const plain = buildConfig({ view: 'grid', days_to_show: 7, entities: people });
    expect(ViewConfig.computeColumnThresholdPxFor(plain, 3, 'grid')).toBe(383);
    // Four lanes of 40px make a day 160px, wider than its own 100px: seven days at 1,207px.
    const lanes = buildConfig({ view: 'grid', days_to_show: 7, entities: people, lanes: true });
    expect(ViewConfig.laneFit(lanes, 'grid')).toEqual({ count: 4, width: 40 });
    expect(ViewConfig.computeColumnThresholdPxFor(lanes, 7, 'grid')).toBe(1207);
    // A card opening on it pays half the hysteresis band on top, 16px, as every fit does.
    expect(ViewConfig.resolveColumnFit('grid', lanes, 1223, null)).toEqual({
      view: 'grid',
      columns: 7,
    });
    expect(ViewConfig.resolveColumnFit('grid', lanes, 1222, null).columns).toBe(6);
    // One already drawing seven keeps them down to the threshold less the half band.
    const seven = { view: 'grid' as const, columns: 7 };
    expect(ViewConfig.resolveColumnFit('grid', lanes, 1191, seven).columns).toBe(7);
  });

  it('reads the grid’s own `lanes` and `min_lane_width` over the card’s', () => {
    const own = buildConfig({
      view: 'grid',
      entities: people,
      time_grid: { lanes: true, min_lane_width: 50 },
    });
    expect(ViewConfig.laneFit(own, 'grid')).toEqual({ count: 4, width: 50 });
    const off = buildConfig({
      view: 'grid',
      entities: people,
      lanes: true,
      time_grid: { lanes: false },
    });
    expect(ViewConfig.laneFit(off, 'grid')).toBeNull();
    // Two lanes of 40px are narrower than the day itself: the day's own width decides.
    const two = buildConfig({ view: 'grid', entities: [ANNA, BEN], lanes: true });
    expect(ViewConfig.computeColumnThresholdPxFor(two, 3, 'grid')).toBe(383);
  });

  it('counts the lanes of the entries it is handed, so a hidden one takes no room', () => {
    const config = buildConfig({ view: 'grid', entities: people, lanes: true });
    const shownToBen = { ...config, entities: config.entities.slice(0, 3) };
    expect(ViewConfig.laneFit(shownToBen, 'grid')).toEqual({ count: 3, width: 40 });
  });
});

describe('adding in a lane', () => {
  it('starts in the lane’s first writable, shown calendar, else where any press would', () => {
    const writable = [ANNA, BEN, ANNA_WORK];
    expect(preselectedCalendarId(writable, new Set())).toBe(ANNA);
    expect(preselectedCalendarId(writable, new Set(), [BEN])).toBe(BEN);
    expect(preselectedCalendarId(writable, new Set([ANNA]), [ANNA, ANNA_WORK])).toBe(ANNA_WORK);
    // A lane holding no writable calendar starts the event as a press anywhere else does.
    expect(preselectedCalendarId(writable, new Set(), ['calendar.holidays'])).toBe(ANNA);
  });

  it('finds the lane under the pointer from the inline start, right to left too', () => {
    const rect = { left: 100, width: 300 };
    const lanes = [ANNA, BEN, 'calendar.clara'];
    expect(laneAt(rect, 101, lanes, false)).toBe(ANNA);
    expect(laneAt(rect, 250, lanes, false)).toBe(BEN);
    expect(laneAt(rect, 399, lanes, false)).toBe('calendar.clara');
    expect(laneAt(rect, 101, lanes, true)).toBe('calendar.clara');
    // Held to the area at its edges, as a drag that leaves it is.
    expect(laneAt(rect, 50, lanes, false)).toBe(ANNA);
    expect(laneAt(rect, 500, lanes, false)).toBe('calendar.clara');
    expect(laneAt(rect, 200, [], false)).toBeUndefined();
  });
});

describe('a lane’s slice of the day', () => {
  it('maps a whole day’s position into the slice, keeping the end of one at the start of the next', () => {
    expect(GridUtils.intoLane(0, 0, 4)).toBe(0);
    expect(GridUtils.intoLane(100, 0, 4)).toBe(25);
    expect(GridUtils.intoLane(50, 2, 4)).toBe(62.5);
    expect(GridUtils.intoLane(100, 1, 3)).toBe(GridUtils.intoLane(0, 2, 3));
  });

  it('never makes blocks touching in time in neighboring slices touch', () => {
    const band = GridUtils.resolveBand('07:00', '22:00');
    const blocks = [
      {
        startMin: 600,
        endMin: 660,
        x0Pct: GridUtils.intoLane(0, 0, 2),
        x1Pct: GridUtils.intoLane(100, 0, 2),
      },
      {
        startMin: 660,
        endMin: 720,
        x0Pct: GridUtils.intoLane(0, 1, 2),
        x1Pct: GridUtils.intoLane(100, 1, 2),
      },
    ];
    const edges = GridUtils.resolveBlockEdges(blocks, band, 60);
    expect(edges.map((edge) => [edge.touchedAbove, edge.touchedBelow])).toEqual([
      [false, false],
      [false, false],
    ]);
  });
});

describe('duplicates while a grid draws lanes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (hour: number) => new Date(2026, 5, 17, hour).toISOString();
  const copy = (entry: Types.EntityConfig, summary: string, from: number, to: number) => ({
    summary,
    start: { dateTime: at(from) },
    end: { dateTime: at(to) },
    _entityId: entry.entity,
    _matchedConfig: entry,
  });
  const holiday = (entry: Types.EntityConfig) => ({
    summary: 'School Holiday',
    start: { date: '2026-06-17' },
    end: { date: '2026-06-18' },
    _entityId: entry.entity,
    _matchedConfig: entry,
  });

  function grouped(lanes: boolean): Types.CalendarEventData[] {
    const config = buildConfig({
      view: 'grid',
      days_to_show: 1,
      filter_duplicates: true,
      lanes,
      entities: [{ entity: ANNA, lane: 'Anna' }, { entity: ANNA_WORK, lane: 'Anna' }, BEN],
    });
    const [anna, annaWork, ben] = config.entities as Types.EntityConfig[];
    const events = [
      copy(anna, 'Dinner', 18, 19),
      copy(annaWork, 'Dinner', 18, 19),
      copy(ben, 'Dinner', 18, 19),
      holiday(anna),
      holiday(ben),
    ];
    const [day] = EventUtils.groupEventsByDay(events, config, false, 'en', 'grid');
    return day.events;
  }

  it('merge only within a lane, so a shared dinner is drawn in each lane holding it', () => {
    const drawn = grouped(true)
      .filter((event) => event.summary === 'Dinner')
      .map((event) => [Lanes.eventLaneKey(event), event._mergedFrom?.map((m) => m.entityId)]);
    expect(drawn).toEqual([
      ['Anna', [ANNA, ANNA_WORK]],
      [BEN, undefined],
    ]);
  });

  it('merge what every lane shares, the all-day band, as they always have', () => {
    expect(grouped(true).filter((event) => event.summary === 'School Holiday')).toHaveLength(1);
  });

  it('merge across calendars as before while the grid draws no lanes', () => {
    const drawn = grouped(false).filter((event) => event.summary === 'Dinner');
    expect(drawn).toHaveLength(1);
    expect(drawn[0]._mergedFrom?.map((m) => m.entityId)).toEqual([ANNA, ANNA_WORK, BEN]);
  });
});
