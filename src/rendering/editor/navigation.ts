/**
 * Where the editor is, and the way back: the overview, a section page, a calendar entry's page,
 * What This Card Changes or the notices page, and the trail of at most two places a Back
 * returns to. Data only; the element saves scroll and focus into the trail as it leaves a place
 * and restores them as Back returns there.
 *
 * There is no browser history. Back in the browser closes Home Assistant's dialog, and an entry
 * pushed for a page here would not survive it, so Back is the editor's own, at the top and foot
 * of every page.
 */

import type { PageId } from './pages';

/** A place in the editor. */
export type Route =
  | { readonly kind: 'overview' }
  | { readonly kind: 'page'; readonly page: PageId }
  | { readonly kind: 'entry'; readonly key: number }
  | { readonly kind: 'audit'; readonly group?: string }
  | { readonly kind: 'notices' };

/** A place left behind, with what Back restores there. */
export interface TrailEntry {
  readonly route: Route;
  /** The scroll container's `scrollTop` as it was left. */
  readonly scrollTop: number;
  /** The `data-focus` key of the row, result or link that left it. */
  readonly focusKey?: string;
  /** The search it held, so Return to Results can restore it. */
  readonly search?: { readonly query: string; readonly editHere: boolean };
}

/** Where the editor is, and where Back goes. */
export interface NavState {
  readonly route: Route;
  /** Places Back returns to, nearest last; at most two. */
  readonly trail: ReadonlyArray<TrailEntry>;
  /** Whether the open place was reached from search results (Return to Results). */
  readonly fromResults: boolean;
}

/** The most places the trail holds. */
export const TRAIL_LIMIT = 2;

/** The editor as it opens. */
export const OVERVIEW: NavState = { route: { kind: 'overview' }, trail: [], fromResults: false };

/**
 * A key naming a route, so a render can key what it draws for it.
 *
 * @param route - The route
 * @returns The key
 */
export function routeKey(route: Route): string {
  switch (route.kind) {
    case 'page':
      return `page:${route.page}`;
    case 'entry':
      return `entry:${route.key}`;
    case 'audit':
      return route.group === undefined ? 'audit' : `audit:${route.group}`;
    default:
      return route.kind;
  }
}

/**
 * Whether two routes name the same place.
 *
 * @param a - A route
 * @param b - Another
 * @returns `true` when they are one place
 */
export function sameRoute(a: Route, b: Route): boolean {
  return routeKey(a) === routeKey(b);
}

/**
 * Goes to a place.
 *
 * - `push` keeps the place left on the trail, so Back returns to it.
 * - `replace` swaps the open place and keeps the trail, as Previous and Next Calendar do.
 * - `cross-link` pushes, unless the open place was itself reached by a cross-link, which it
 *   then replaces, so the trail never grows past two.
 *
 * Going to the overview clears the trail: nothing lies behind it.
 *
 * @param nav - Where the editor is
 * @param to - Where it goes
 * @param from - The place it leaves, as the element saved it
 * @param how - How the trail changes
 * @returns The new state
 */
export function go(
  nav: NavState,
  to: Route,
  from: TrailEntry,
  how: 'push' | 'replace' | 'cross-link' = 'push',
): NavState {
  const fromResults = from.search !== undefined && from.search.query !== '';
  if (to.kind === 'overview') return OVERVIEW;
  if (sameRoute(nav.route, to)) return nav;
  const replaces = how === 'replace' || (how === 'cross-link' && nav.trail.length >= TRAIL_LIMIT);
  if (replaces) return { route: to, trail: nav.trail, fromResults: nav.fromResults };
  const trail = [...nav.trail, from].slice(-TRAIL_LIMIT);
  return { route: to, trail, fromResults };
}

/**
 * Goes back one place.
 *
 * @param nav - Where the editor is
 * @returns The new state, and the trail entry to restore scroll, focus and search from, or
 * `undefined` where the trail was empty and Back fell to the overview
 */
export function back(nav: NavState): { nav: NavState; restore: TrailEntry | undefined } {
  const restore = nav.trail[nav.trail.length - 1];
  if (restore === undefined) return { nav: OVERVIEW, restore: undefined };
  const trail = nav.trail.slice(0, -1);
  // The place returned to was reached from the results when the place before it held them.
  const before = trail[trail.length - 1]?.search?.query;
  return {
    nav: { route: restore.route, trail, fromResults: before !== undefined && before !== '' },
    restore,
  };
}

/**
 * Checks the open place and the trail against the card as it now is, after a configuration
 * the editor did not send: a place that no longer exists (an entry removed) is dropped from the
 * trail, and when it is the open place the editor falls back to the overview.
 *
 * @param nav - Where the editor is
 * @param exists - Whether a place exists on the card now
 * @returns The new state, and whether the open place was dropped
 */
export function validate(
  nav: NavState,
  exists: (route: Route) => boolean,
): { nav: NavState; dropped: boolean } {
  if (!exists(nav.route)) return { nav: OVERVIEW, dropped: true };
  const trail = nav.trail.filter((entry) => exists(entry.route));
  if (trail.length === nav.trail.length) return { nav, dropped: false };
  return { nav: { ...nav, trail }, dropped: false };
}
