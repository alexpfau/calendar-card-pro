/**
 * What the card's `back` action does: go back to the page before this one, as Home Assistant's
 * own back arrow does, and never out of Home Assistant.
 *
 * Home Assistant's arrow (`goBack` in its `src/common/navigate.ts`) goes back through the
 * browser's history only where the page behind is one Home Assistant itself navigated from,
 * which it marks by stamping `from` on the history entry it creates. A fresh tab, a bookmark, a
 * wall tablet's first page or the app opened straight on this view has no such page behind it,
 * and going back there could leave Home Assistant, or land on its login page. There it replaces
 * the page with a fallback instead: here, the action's own `navigation_path`, else the root of
 * the dashboard the card is on.
 *
 * 🚨 `history.state.from` is Home Assistant's own, undocumented, and could be renamed in any
 * release. If it is, nothing here throws: every press reads as having no page behind it and
 * takes the fallback, which stays on this dashboard. The test pinning that fallback is what
 * keeps the degradation that gentle.
 *
 * A pure decision, so it is tested without a browser's history; the card carries it out.
 */

/** What a press of `back` does. */
export type BackStep =
  /** The page behind is Home Assistant's own: go back to it through the browser's history. */
  | { kind: 'history' }
  /** No page of Home Assistant's is behind this one: show `path` in place of this page. */
  | { kind: 'replace'; path: string };

/**
 * Whether the history entry says Home Assistant navigated here from a page of its own, the
 * test its `canGoBack()` makes.
 *
 * @param state - `window.history.state`, whatever it holds
 * @returns True when a page of Home Assistant's own is behind this one
 */
export function cameFromHomeAssistant(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>).from !== undefined
  );
}

/**
 * The root of the dashboard a page belongs to: the first segment of its path, which is the
 * dashboard's own address in Home Assistant (`/dashboard-admin/ccp-current-testing` belongs to
 * `/dashboard-admin`). Home Assistant shows that dashboard's first view there, as its own back
 * arrow's fallback does.
 *
 * @param pathname - `location.pathname`
 * @returns The dashboard's path, or `/` for a page with no path at all
 */
export function dashboardRoot(pathname: string): string {
  const first = pathname.split('/').find((segment) => segment !== '');
  return first === undefined ? '/' : `/${first}`;
}

/**
 * Decides what a press of `back` does.
 *
 * @param state - `window.history.state` at the press
 * @param pathname - `location.pathname` at the press
 * @param navigationPath - The action's own `navigation_path`, the page to show where there is
 *   no page behind this one
 * @returns Go back through the history, or replace this page with the fallback
 */
export function backStep(state: unknown, pathname: string, navigationPath?: unknown): BackStep {
  if (cameFromHomeAssistant(state)) return { kind: 'history' };

  const configured = typeof navigationPath === 'string' ? navigationPath.trim() : '';
  return { kind: 'replace', path: configured !== '' ? configured : dashboardRoot(pathname) };
}
