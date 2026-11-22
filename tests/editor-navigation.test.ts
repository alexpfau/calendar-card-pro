/**
 * Where the editor is and where Back goes (`navigation.ts`), and the queue its one live region
 * speaks from (`announce.ts`).
 */

import { describe, expect, it } from 'vitest';

import { Announcer } from '../src/rendering/editor/announce';
import {
  type NavState,
  OVERVIEW,
  type Route,
  type TrailEntry,
  back,
  go,
  jumpedFrom,
  parentOf,
  returnTo,
  routeKey,
  validate,
} from '../src/rendering/editor/navigation';

const events: Route = { kind: 'page', page: 'events' };
const dayHeader: Route = { kind: 'page', page: 'day_header' };
const whichEvents: Route = { kind: 'page', page: 'which_events' };
// A place an outside change can take away: an entry whose calendar is removed.
const gone: Route = { kind: 'entry', key: 7 };

/**
 * A trail entry for leaving a place.
 *
 * @param route - The place left
 * @param scrollTop - Its scroll position
 * @param focusKey - The control that left it
 * @returns The entry
 */
function from(route: Route, scrollTop = 0, focusKey?: string): TrailEntry {
  return { route, scrollTop, focusKey };
}

describe('routes', () => {
  it('opens a page from the overview with the overview on the trail', () => {
    const nav = go(OVERVIEW, events, from(OVERVIEW.route, 320, 'nav:events'));
    expect(nav.route).toEqual(events);
    expect(nav.trail).toEqual([from(OVERVIEW.route, 320, 'nav:events')]);
    expect(nav.fromResults).toBe(false);
  });

  it('goes back to where it came from, with what to restore', () => {
    const open = go(OVERVIEW, events, from(OVERVIEW.route, 320, 'nav:events'));
    const result = back(open);
    expect(result.nav).toEqual(OVERVIEW);
    expect(result.restore).toEqual({
      route: { kind: 'overview' },
      scrollTop: 320,
      focusKey: 'nav:events',
    });
  });

  it('lands on the row that opens the page when nothing was left on the way down', () => {
    const lost: NavState = { route: events, trail: [], fromResults: false };
    expect(back(lost)).toEqual({
      nav: OVERVIEW,
      restore: { route: OVERVIEW.route, focusKey: 'nav:events' },
    });
    expect(back(OVERVIEW)).toEqual({ nav: OVERVIEW, restore: undefined });
  });

  it('holds a trail of two: overview, then the page a cross-link left', () => {
    const page = go(OVERVIEW, whichEvents, from(OVERVIEW.route, 100, 'nav:which_events'));
    const linked = go(page, dayHeader, from(whichEvents, 40, 'xlink:past_days'), 'cross-link');
    expect(linked.route).toEqual(dayHeader);
    expect(linked.trail.map((entry) => entry.route)).toEqual([OVERVIEW.route, whichEvents]);

    // The link's return line steps back to it; Back goes up from either page.
    expect(back(linked).nav).toEqual(OVERVIEW);
    const first = returnTo(linked);
    expect(first.nav.route).toEqual(whichEvents);
    expect(first.restore?.focusKey).toBe('xlink:past_days');
    const second = back(first.nav);
    expect(second.nav).toEqual(OVERVIEW);
    expect(second.restore?.focusKey).toBe('nav:which_events');
  });

  it('replaces a page reached by a cross-link when it cross-links again', () => {
    // Overview, a layout's page, its topic: a cross-link from the topic still returns to it.
    const grid = { kind: 'layout', layout: 'grid' } as const;
    const layout = go(OVERVIEW, grid, from(OVERVIEW.route));
    const page = go(layout, whichEvents, from(grid));
    const linked = go(page, dayHeader, from(whichEvents), 'cross-link');
    expect(returnTo(linked).nav.route).toEqual(whichEvents);
    const again = go(linked, events, from(dayHeader), 'cross-link');
    expect(again.route).toEqual(events);
    expect(again.trail.map((entry) => entry.route)).toEqual([OVERVIEW.route, grid, whichEvents]);
    expect(returnTo(again).nav.route).toEqual(whichEvents);
  });

  it('pushes a cross-link from a page opened from the overview', () => {
    const page = go(OVERVIEW, whichEvents, from(OVERVIEW.route));
    expect(go(page, dayHeader, from(whichEvents), 'cross-link').trail).toHaveLength(2);
  });

  it('replaces without touching the trail, as Previous and Next Calendar do', () => {
    const anna = go(OVERVIEW, { kind: 'entry', key: 1 }, from(OVERVIEW.route, 0, 'row:1'));
    const ben = go(anna, { kind: 'entry', key: 2 }, from(anna.route), 'replace');
    expect(ben.route).toEqual({ kind: 'entry', key: 2 });
    expect(ben.trail).toEqual(anna.trail);
  });

  it('clears the trail on the way to the overview, and stays put on the same place', () => {
    const page = go(OVERVIEW, events, from(OVERVIEW.route));
    expect(go(page, OVERVIEW.route, from(events))).toEqual(OVERVIEW);
    expect(go(page, events, from(events))).toBe(page);
  });

  it('marks a page opened from search results', () => {
    const results = {
      route: OVERVIEW.route,
      scrollTop: 0,
      search: { query: 'color', editHere: false },
    };
    const nav = go(OVERVIEW, events, results);
    expect(nav.fromResults).toBe(true);
    expect(back(nav).restore?.search).toEqual({ query: 'color', editHere: false });
  });

  it('still marks a page opened from search results after Back from a cross-link', () => {
    const results = {
      route: OVERVIEW.route,
      scrollTop: 0,
      search: { query: 'past', editHere: false },
    };
    const page = go(OVERVIEW, events, results);
    const linked = go(page, dayHeader, from(events), 'cross-link');
    expect(linked.fromResults).toBe(false);
    // Back on the page the results opened, Return to Results is there again.
    expect(returnTo(linked).nav).toMatchObject({ route: events, fromResults: true });
  });

  it('keys each route apart', () => {
    const keys = [
      OVERVIEW.route,
      events,
      { kind: 'entry', key: 3 },
      { kind: 'audit' },
      { kind: 'audit', group: 'grid' },
      { kind: 'notices' },
    ].map((route) => routeKey(route as Route));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Back goes up one level', () => {
  const month = { kind: 'layout', layout: 'month' } as const;
  const grid = { kind: 'layout', layout: 'grid' } as const;
  const monthWhich: Route = { kind: 'page', page: 'which_events', scope: 'month' };
  const gridWhich: Route = { kind: 'page', page: 'which_events', scope: 'grid' };
  const monthDays: Route = { kind: 'page', page: 'day_header', scope: 'month' };
  const wholeCard: Route = { kind: 'page', page: 'events_weather_language' };

  /** Overview, Month's page, then Month's Which Events, each left by its row. */
  function down(): NavState {
    const layout = go(OVERVIEW, month, from(OVERVIEW.route, 640, 'layout:month'));
    return go(layout, monthWhich, from(month, 30, 'nav:which_events'));
  }

  it('lands on the layout the page names after Also for, not the one it started in', () => {
    const also = go(down(), gridWhich, from(monthWhich, 0, 'also:grid'), 'replace');
    const result = back(also);
    expect(result.nav.route).toEqual(grid);
    // Grid's page was never left: Back lands on the row it came back by.
    expect(result.restore).toEqual({ route: grid, focusKey: 'nav:which_events' });
    const top = back(result.nav);
    expect(top.nav).toEqual(OVERVIEW);
    // The overview keeps where it was left; focus goes to the row Back came back by.
    expect(top.restore).toEqual({ route: OVERVIEW.route, scrollTop: 640, focusKey: 'layout:grid' });
  });

  it('goes up from a page a link opened, to the page it belongs to', () => {
    const linked = go(down(), monthDays, from(monthWhich, 80, 'xlink:past_days'), 'cross-link');
    expect(back(linked).nav.route).toEqual(month);
    const home = go(down(), wholeCard, from(monthWhich, 80, 'reference:x'));
    expect(back(home)).toEqual({
      nav: OVERVIEW,
      restore: { route: OVERVIEW.route, scrollTop: 640, focusKey: 'nav:events_weather_language' },
    });
  });

  it('names the place each place belongs to, and the row there that opens it', () => {
    const places: Route[] = [
      OVERVIEW.route,
      month,
      { kind: 'layout', layout: 'shared' },
      monthWhich,
      { kind: 'page', page: 'size_spacing', scope: 'shared' },
      wholeCard,
      { kind: 'entry', key: 4 },
      { kind: 'entry', key: 4, scope: 'grid' },
      { kind: 'audit' },
      { kind: 'audit', group: 'grid' },
      { kind: 'notices' },
    ];
    expect(places.map((route) => [routeKey(route), parentOf(route)])).toEqual([
      ['overview', undefined],
      ['layout:month', { route: OVERVIEW.route, focusKey: 'layout:month' }],
      ['layout:shared', { route: OVERVIEW.route, focusKey: 'layout:shared' }],
      ['page:which_events@month', { route: month, focusKey: 'nav:which_events' }],
      [
        'page:size_spacing@shared',
        { route: { kind: 'layout', layout: 'shared' }, focusKey: 'nav:size_spacing' },
      ],
      [
        'page:events_weather_language',
        { route: OVERVIEW.route, focusKey: 'nav:events_weather_language' },
      ],
      ['entry:4', { route: OVERVIEW.route, focusKey: 'row:4' }],
      ['entry:4@grid', { route: OVERVIEW.route, focusKey: 'row:4' }],
      ['audit', { route: OVERVIEW.route, focusKey: 'more:audit' }],
      ['audit:grid', { route: OVERVIEW.route, focusKey: 'more:audit' }],
      ['notices', { route: OVERVIEW.route, focusKey: 'notices' }],
    ]);
  });

  it('names where a page was jumped to from, and not a place it was reached from by going down', () => {
    expect(jumpedFrom(down())).toBeUndefined();
    const left = from(monthWhich, 80, 'reference:x');
    const home = go(down(), wholeCard, left);
    expect(jumpedFrom(home)).toEqual(left);
    expect(returnTo(home)).toEqual({
      nav: { route: monthWhich, trail: down().trail, fromResults: false },
      restore: left,
    });
    // Results have their own line.
    const results = {
      route: OVERVIEW.route,
      scrollTop: 0,
      search: { query: 'week', editHere: false },
    };
    expect(jumpedFrom(go(down(), wholeCard, results))).toBeUndefined();
  });

  it('keeps a jump on the trail across Also for, and drops the way up it replaced', () => {
    const also = go(down(), gridWhich, from(monthWhich, 0, 'also:grid'), 'replace');
    expect(also.trail).toEqual([from(OVERVIEW.route, 640, 'layout:month')]);
    expect(jumpedFrom(also)).toBeUndefined();
    const left = from(wholeCard, 12, 'layout-link:grid');
    const linked = go(go(OVERVIEW, wholeCard, from(OVERVIEW.route)), gridWhich, left);
    const sideways = go(linked, monthWhich, from(gridWhich, 0, 'also:month'), 'replace');
    expect(jumpedFrom(sideways)).toEqual(left);
  });

  it('restores the place as it was left when it returns by the row that left it', () => {
    const result = back(down());
    expect(result.nav).toEqual({
      route: month,
      trail: [from(OVERVIEW.route, 640, 'layout:month')],
      fromResults: false,
    });
    expect(result.restore).toEqual(from(month, 30, 'nav:which_events'));
    expect(back(result.nav).restore).toEqual(from(OVERVIEW.route, 640, 'layout:month'));
  });
});

describe('validation after an outside change', () => {
  const existsButGone = (route: Route): boolean => !(route.kind === 'entry' && route.key === 7);

  it('falls back to the overview when the open page is gone', () => {
    const open = go(OVERVIEW, gone, from(OVERVIEW.route));
    expect(validate(open, existsButGone)).toEqual({ nav: OVERVIEW, dropped: true });
  });

  it('drops a place gone from the trail and keeps the open page', () => {
    const viaGone: NavState = {
      route: dayHeader,
      trail: [from(OVERVIEW.route), from(gone)],
      fromResults: false,
    };
    const { nav, dropped } = validate(viaGone, existsButGone);
    expect(dropped).toBe(false);
    expect(nav.route).toEqual(dayHeader);
    expect(nav.trail.map((entry) => entry.route)).toEqual([OVERVIEW.route]);
  });

  it('leaves a state that still holds unchanged', () => {
    const open = go(OVERVIEW, events, from(OVERVIEW.route));
    expect(validate(open, () => true).nav).toBe(open);
  });
});

describe('announcements', () => {
  it('joins what one update says into one announcement', () => {
    const announcer = new Announcer();
    announcer.say('Removed Ben.');
    announcer.say('Now editing settings for Grid.');
    expect(announcer.pending).toBe(true);
    expect(announcer.take()?.trim()).toBe('Removed Ben. Now editing settings for Grid.');
    expect(announcer.pending).toBe(false);
    expect(announcer.take()).toBeUndefined();
  });

  it('drops empty messages and a repeat within one announcement', () => {
    const announcer = new Announcer();
    expect(announcer.say('')).toBe(false);
    expect(announcer.say(undefined)).toBe(false);
    expect(announcer.say('Moved.')).toBe(true);
    expect(announcer.say('Moved.')).toBe(false);
    expect(announcer.take()?.trim()).toBe('Moved.');
  });

  it('speaks the same words said twice in a row as a change', () => {
    const announcer = new Announcer();
    announcer.say('Now editing settings for Grid.');
    const first = announcer.take();
    announcer.say('Now editing settings for Grid.');
    const second = announcer.take();
    expect(first).not.toBe(second);
    expect(first?.trim()).toBe(second?.trim());
  });
});
