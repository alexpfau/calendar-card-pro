/**
 * How long a page-wide read that failed waits before it is tried again: the Home Assistant
 * calendar colors (`entity-colors.ts`) and the weather condition words (`weather-i18n.ts`), each
 * shared by every card on the page.
 *
 * The calendar fetch's default schedule: a minute, doubling per further failure, capped at the
 * default refresh interval rather than at a card's own `refresh_interval`, because no one card's
 * interval is the page's.
 */

import * as Constants from '../config/constants';

const FIRST_MS = Constants.CACHE.RETRY_INITIAL_SECONDS * 1000;
const MAX_MS = Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES * 60 * 1000;

/**
 * The wait before the next try.
 *
 * @param failures Consecutive failures so far, at least one
 * @returns Milliseconds
 */
export function pageRetryDelay(failures: number): number {
  return Math.min(FIRST_MS * 2 ** Math.min(Math.max(failures, 1) - 1, 20), MAX_MS);
}
