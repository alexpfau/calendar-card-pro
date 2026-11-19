/**
 * Where each editor page is explained on the documentation site (backlog item 307). The helpers
 * under the settings say only what is not obvious; the page's foot links here for the rest.
 *
 * Paths are site-relative with their anchor, and the link joins them to `DOCS_SITE`, so the
 * editor always opens an absolute address. `tests/editor-docs-links.test.ts` resolves every one
 * against the pages and headings in `docs/`, so a renamed heading fails there rather than
 * shipping a link into the void.
 */

import type { PageId } from './pages';
import { DOCS_SITE } from './stories';

/** A page of the editor that has a foot: a section page, a calendar entry, or one under More. */
export type DocsPage = PageId | 'entry' | 'audit' | 'notices';

/** Each page's documentation, as a path and anchor on the site. */
export const PAGE_DOCS: Readonly<Record<DocsPage, string>> = {
  which_events: '/features/core-settings#event-filtering',
  card_header: '/features/layout-appearance#header-toolbar',
  events_weather_language: '/features/editor#events-weather-language',
  day_header: '/features/layout-appearance#date-column-customization',
  events: '/features/event-content',
  size_spacing: '/features/layout-appearance#spacing-alignment',
  weather: '/features/weather',
  taps_refresh: '/features/actions',
  entry: '/features/core-settings#entity-configuration',
  audit: '/features/editor#stored-settings',
  notices: '/features/editor#options-the-card-ignores',
};

/**
 * The absolute address of a page's documentation.
 *
 * @param page - The page
 * @returns Its address on the documentation site
 */
export function docsUrl(page: DocsPage): string {
  return `${DOCS_SITE}${PAGE_DOCS[page]}`;
}
