/**
 * The Example Stories Quick Setup starts from (backlog item 188).
 *
 * Each is the card-wide part of one Example Story in the docs: its YAML without `type`,
 * `config_version` and `entities`, which belong to the card being set up rather than to the
 * story. Each calendar's colors survive as a palette, given in order to the user's calendars
 * that have no color of their own. Its names and labels do not: they name the story's people.
 *
 * Only the four stories that work without per-calendar filters are here. Bin Day splits one
 * calendar four ways by words in event titles, and Family Agenda separates work events by a tag
 * in their descriptions; neither can be guessed for someone else's calendars (Alex, Nov 9).
 *
 * 🚨 These are copies of the docs, and `tests/quick-setup-stories.test.ts` reconciles each one,
 * shell and palette, against the first YAML block on its page. Edit both, or that test fails.
 *
 * Free of Lit and the DOM, like every editor module but the element and its styles.
 */

/** A story's id, which is also the stem of its editor strings: `quick_setup.story.<id>`. */
export type StoryId =
  'family_hub' | 'now_and_next' | 'today_and_tomorrow' | 'birthdays_and_holidays';

/** One story Quick Setup can start from. */
export interface Story {
  readonly id: StoryId;
  /** Its page on the docs site, from the site's root. */
  readonly page: string;
  /** Each calendar's accent color in the story, in the order its calendars are listed. */
  readonly palette: ReadonlyArray<string>;
  /** A fresh copy of the story's card-wide options and view blocks. */
  shell(): Record<string, unknown>;
}

/**
 * Builds a story whose shell is copied fresh on every call, so nothing a caller does to one
 * configuration can reach the next.
 *
 * @param id - Story id
 * @param page - Docs page
 * @param palette - Calendar colors, in order
 * @param shell - The story's card-wide options and view blocks
 * @returns The story
 */
function story(
  id: StoryId,
  page: string,
  palette: ReadonlyArray<string>,
  shell: Readonly<Record<string, unknown>>,
): Story {
  return { id, page, palette, shell: () => structuredClone(shell) as Record<string, unknown> };
}

/** The four stories, in the order Quick Setup offers them. */
export const STORIES: ReadonlyArray<Story> = [
  story(
    'family_hub',
    '/guide/family-calendar',
    ['#ff6c92', '#03a9f4', '#66bb6a', '#ffb74d', '#b388ff'],
    {
      title: 'Family',
      view: 'grid',
      days_to_show: 7,
      event_gap: '4px',
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      weather: { entity: 'weather.home' },
      toolbar: { show: true, legend: 'chips', reset: true },
      event_tap_action: { action: 'details' },
      day_tap_action: { action: 'add-event' },
      list: { days_to_show: 3 },
      column: {
        min_days_to_show: 3,
        show_past_events: true,
        past_event_opacity: 40,
        event_background_opacity: 15,
      },
      time_grid: { start_time: '07:00', end_time: '22:00', hour_height: '36px' },
    },
  ),
  story('now_and_next', '/guide/now-and-next', [], {
    days_to_show: 2,
    filter_duplicates: true,
    show_empty_today: true,
    show_countdown: true,
    show_progress_bar: true,
    show_location: false,
    show_end_time: false,
    scroll_long_titles: true,
    event_gap: '4px',
    tap_action: { action: 'expand' },
    event_hold_action: { action: 'details' },
    list: { compact_events_to_show: 4 },
  }),
  story(
    'today_and_tomorrow',
    '/guide/today-and-tomorrow',
    ['#ff6c92', '#03a9f4', '#66bb6a', '#90a4ae', '#ffb74d'],
    {
      title: 'Today & Tomorrow',
      view: 'grid',
      days_to_show: 2,
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      show_progress_bar: true,
      weather: { entity: 'weather.home', position: 'both', event: { show_conditions: false } },
      toolbar: { show: true, view_switcher: false, legend: false },
      event_tap_action: { action: 'details' },
      day_tap_action: { action: 'add-event' },
      time_grid: {
        start_time: '07:00',
        end_time: '21:00',
        hour_height: '56px',
        slot_minutes: 30,
        event_font_size: '13px',
      },
    },
  ),
  story('birthdays_and_holidays', '/guide/birthdays-and-holidays', ['#f06292', '#26a69a'], {
    title: 'Coming Up',
    days_to_show: 60,
    show_countdown: true,
    show_single_allday_time: false,
    month_separator_width: '1px',
    day_spacing: '4px',
    event_gap: '4px',
    vertical_line_width: '4px',
    toolbar: { show: true, legend: false, add_event: false, refresh: false, view_switcher: false },
    event_tap_action: { action: 'details' },
  }),
];

/**
 * The story with an id.
 *
 * @param id - Story id
 * @returns The story
 */
export function storyById(id: StoryId): Story {
  return STORIES.find((candidate) => candidate.id === id) ?? STORIES[0];
}

/** The docs site, where each story's page explains every line of its card. */
export const DOCS_SITE = 'https://calendar-card-pro.alexpfau.com';
