/**
 * Where the editor is, and the way back: the overview, a section page, a calendar entry's page,
 * Stored Settings or the notices page, and the trail of at most three places left. Data only;
 * the element saves scroll and focus into the trail as it leaves a place and restores them as it
 * returns there.
 *
 * Back goes up one level, to the place the open one belongs to (`parentOf`), whatever led here:
 * the page header names that place, so where Back goes can be read before it is pressed. A place
 * reached by a jump instead, a link from another page, a result or a pick, says so in a line of its
 * own (`jumpedFrom`, `returnTo`), which steps back along the trail as Back once did.
 *
 * There is no browser history. Back in the browser closes Home Assistant's dialog, and an entry
 * pushed for a page here would not survive it, so Back is the editor's own, at the top and foot
 * of every page.
 */

import type { PageId } from './pages';
import type { EditorWorkspace } from './workspace';

/**
 * A place in the editor. A layout's page lists its topics, and a topic page under a layout carries
 * that layout as its `scope`; Layout Defaults is the `shared` layout. A Whole Card page has none.
 * A calendar's page carries one only where a deep link opened it for an option another layout
 * offers; opened from its row, it edits in the layout the card opens in.
 */
export type Route =
  | { readonly kind: 'overview' }
  | { readonly kind: 'page'; readonly page: PageId; readonly scope?: EditorWorkspace }
  | { readonly kind: 'layout'; readonly layout: EditorWorkspace }
  | { readonly kind: 'entry'; readonly key: number; readonly scope?: EditorWorkspace }
  | { readonly kind: 'audit'; readonly group?: string }
  | { readonly kind: 'notices' };

/** A place left behind, with what Back restores there. */
export interface TrailEntry {
  readonly route: Route;
  /**
   * The scroll container's `scrollTop` as it was left. Absent where Back lands on a place by
   * another row than the one that left it, or on one it never left: it brings that row into view.
   */
  readonly scrollTop?: number;
  /** The `data-focus` key of the row, result or link that left it. */
  readonly focusKey?: string;
  /** The search it held, so Return to Results can restore it. */
  readonly search?: { readonly query: string; readonly editHere: boolean };
}

/** Where the editor is, and where Back goes. */
export interface NavState {
  readonly route: Route;
  /** Places Back returns to, nearest last; at most three. */
  readonly trail: ReadonlyArray<TrailEntry>;
  /** Whether the open place was reached from search results (Return to Results). */
  readonly fromResults: boolean;
}

/**
 * The most places the trail holds: the overview, a layout's page and one of its topics, so a
 * cross-link from a topic still returns to it.
 */
export const TRAIL_LIMIT = 3;

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
      return route.scope === undefined ? `page:${route.page}` : `page:${route.page}@${route.scope}`;
    case 'layout':
      return `layout:${route.layout}`;
    case 'entry':
      return route.scope === undefined ? `entry:${route.key}` : `entry:${route.key}@${route.scope}`;
    case 'audit':
      return route.group === undefined ? 'audit' : `audit:${route.group}`;
    default:
      return route.kind;
  }
}

/**
 * The layout a place edits: a layout's own page, a topic page under it, or a calendar's page a
 * deep link opened in another layout.
 *
 * @param route - The place
 * @returns The layout, `shared` for Layout Defaults, or `undefined` for a place of no layout
 */
export function routeScope(route: Route): EditorWorkspace | undefined {
  if (route.kind === 'layout') return route.layout;
  if (route.kind === 'page' || route.kind === 'entry') return route.scope;
  return undefined;
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
 * The place a place belongs to, and the row there that opens it: a layout's topic belongs to the
 * layout's page; a layout's page, a Whole Card page, a calendar's page, Stored Settings and the
 * notices page belong to the overview. A page route carries a `scope` only as a layout's topic.
 *
 * @param route - A place
 * @returns The place above it and the `data-focus` key of the row that opens it there, or
 * `undefined` for the overview
 */
export function parentOf(
  route: Route,
): { readonly route: Route; readonly focusKey: string } | undefined {
  switch (route.kind) {
    case 'overview':
      return undefined;
    case 'layout':
      return { route: OVERVIEW.route, focusKey: `layout:${route.layout}` };
    case 'page':
      return route.scope === undefined
        ? { route: OVERVIEW.route, focusKey: `nav:${route.page}` }
        : { route: { kind: 'layout', layout: route.scope }, focusKey: `nav:${route.page}` };
    case 'entry':
      return { route: OVERVIEW.route, focusKey: `row:${route.key}` };
    case 'audit':
      return { route: OVERVIEW.route, focusKey: 'more:audit' };
    case 'notices':
      return { route: OVERVIEW.route, focusKey: 'notices' };
  }
}

/**
 * Whether a place lies above another, on the way Back takes from it.
 *
 * @param above - The place that may lie above
 * @param route - The place below
 * @returns `true` when Back from `route` passes through `above`
 */
export function isAbove(above: Route, route: Route): boolean {
  for (let up = parentOf(route); up !== undefined; up = parentOf(up.route)) {
    if (sameRoute(up.route, above)) return true;
  }
  return false;
}

/**
 * Whether a place left held search results.
 *
 * @param entry - The place left, if any
 * @returns `true` where a query was typed there
 */
function heldResults(entry: TrailEntry | undefined): boolean {
  return entry?.search !== undefined && entry.search.query !== '';
}

/**
 * Goes to a place.
 *
 * - `push` keeps the place left on the trail, so a return line or Back restores it.
 * - `replace` swaps the open place, as Also for, Continue with and Previous and Next Calendar do.
 *   A place above the one replaced that is not above the new one leaves the trail: it was the way
 *   up from there, not where the new place was jumped to from.
 * - `cross-link` pushes, unless the trail is full, when it replaces the open place, so the trail
 *   never grows past `TRAIL_LIMIT`.
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
  const fromResults = heldResults(from);
  if (to.kind === 'overview') return OVERVIEW;
  if (sameRoute(nav.route, to)) return nav;
  const replaces = how === 'replace' || (how === 'cross-link' && nav.trail.length >= TRAIL_LIMIT);
  if (replaces) {
    const trail = nav.trail.filter(
      (entry) => !isAbove(entry.route, nav.route) || isAbove(entry.route, to),
    );
    return { route: to, trail, fromResults: nav.fromResults };
  }
  const trail = [...nav.trail, from].slice(-TRAIL_LIMIT);
  return { route: to, trail, fromResults };
}

/**
 * Goes Back: up one level, to the place the open one belongs to (`parentOf`). The trail keeps the
 * places above the one Back lands on. A place Back lands on that was left on the way here keeps
 * the scroll position it was left at; focus goes to the row that opens the place Back came from,
 * which the element brings into view, and back to the result chosen where it held search results.
 *
 * @param nav - Where the editor is
 * @returns The new state, and what to restore there, or `undefined` on the overview
 */
export function back(nav: NavState): { nav: NavState; restore: TrailEntry | undefined } {
  const up = parentOf(nav.route);
  if (up === undefined) return { nav: OVERVIEW, restore: undefined };
  const saved = [...nav.trail].reverse().find((entry) => sameRoute(entry.route, up.route));
  const trail = nav.trail.filter((entry) => isAbove(entry.route, up.route));
  const restore =
    saved === undefined
      ? { route: up.route, focusKey: up.focusKey }
      : heldResults(saved)
        ? saved
        : { ...saved, focusKey: up.focusKey };
  return {
    nav: { route: up.route, trail, fromResults: heldResults(trail[trail.length - 1]) },
    restore,
  };
}

/**
 * The place the open one was jumped to from: the last place left, where it is not above the open
 * one, as a link from another page, a pick or a step Undo took leave it, and held no search
 * (Return to Results covers that). A return line names it.
 *
 * @param nav - Where the editor is
 * @returns The place, or `undefined` where the open one was reached by going down
 */
export function jumpedFrom(nav: NavState): TrailEntry | undefined {
  const last = nav.trail[nav.trail.length - 1];
  if (last === undefined || heldResults(last) || isAbove(last.route, nav.route)) return undefined;
  return last;
}

/**
 * Steps back along the trail to the last place left, as Return to Results and a jump's return
 * line do. With nothing on the trail, it goes up as Back does.
 *
 * @param nav - Where the editor is
 * @returns The new state, and the trail entry to restore scroll, focus and search from
 */
export function returnTo(nav: NavState): { nav: NavState; restore: TrailEntry | undefined } {
  const restore = nav.trail[nav.trail.length - 1];
  if (restore === undefined) return back(nav);
  const trail = nav.trail.slice(0, -1);
  // The place returned to was reached from the results when the place before it held them.
  return {
    nav: { route: restore.route, trail, fromResults: heldResults(trail[trail.length - 1]) },
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
