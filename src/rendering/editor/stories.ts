/**
 * The Example Stories Quick Setup starts from (backlog item 188).
 *
 * Each is the card-wide part of one Example Story in the docs: its YAML without `type`,
 * `config_version` and `entities`, which belong to the card being set up rather than to the
 * story. Each calendar's colors survive as a palette, given in order to the user's calendars
 * that have no color of their own. Its names, labels and lanes do not: they name the story's people.
 *
 * The shared-plan color (`duplicate_accent_color`) goes last in a palette, behind at least four
 * others. On the story's page it is the Family calendar's; on someone else's calendars nothing says
 * which one is the family's, and a fourth calendar in gold would read as a plan they share. A page
 * with fewer than four other colors continues with the Family Hub's, whose family it shows: Now &
 * Next's fourth calendar is the Hub's purple, not its gold.
 *
 * Simple Agenda comes first: not a story but the card Usage's Your First Card documents, for
 * someone who wants a short list of the next few days and nothing more.
 *
 * Only the six stories that work without per-calendar filters are here. Bin Day splits one
 * calendar four ways by words in event titles, and Hallway Agenda separates work events by a tag
 * in their descriptions; neither can be guessed for someone else's calendars.
 *
 * 🚨 These are copies of the docs, and `tests/quick-setup-stories.test.ts` reconciles each one,
 * shell and palette, against the first YAML block on its page. Edit both, or that test fails.
 *
 * Free of Lit and the DOM, like every editor module but the element and its styles.
 */

/** A story's id, which is also the stem of its editor strings: `quick_setup.story.<id>`. */
export type StoryId =
  | 'simple_agenda'
  | 'family_hub'
  | 'small_card_big_picture'
  | 'now_and_next'
  | 'today_and_tomorrow'
  | 'birthdays_and_holidays'
  | 'house_log';

/** One story Quick Setup can start from. */
export interface Story {
  readonly id: StoryId;
  /** Its page on the docs site, from the site's root, with the heading its card is under where
   * the page holds more than one. */
  readonly page: string;
  /** Each calendar's accent color in the story, in the order its calendars are listed, but the
   * shared-plan color last. */
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

/** The seven starting points, in the order Quick Setup offers them. */
export const STORIES: ReadonlyArray<Story> = [
  // Not an Example Story: the card Usage starts everyone with, for a plain list of the next days.
  story('simple_agenda', '/guide/usage#your-first-card', [], {
    days_to_show: 3,
    show_location: false,
    show_month: false,
    tap_action: { action: 'overlay' },
  }),
  story(
    'family_hub',
    '/guide/family-calendar',
    ['#ff6c92', '#03a9f4', '#66bb6a', '#b388ff', '#ffb74d'],
    {
      title: 'Family',
      view: 'grid',
      days_to_show: 7,
      event_gap: '4px',
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      weather_entity: 'weather.home',
      toolbar: { show: true, legend: 'chips', reset: true },
      day_tap_action: { action: 'add-event' },
      // A person per lane in Columns, and in List where four fit; a phone keeps the plain list.
      list: {
        days_to_show: 3,
        event_background_opacity: 15,
        lanes: true,
        lanes_fallback: 'list',
        weather: { position: 'date' },
      },
      column: {
        min_days_to_show: 3,
        show_past_events: true,
        past_event_opacity: 40,
        event_background_opacity: 15,
        lanes: true,
        show_location: false,
        weather: { position: 'date' },
      },
      time_grid: {
        start_time: '07:00',
        end_time: '22:00',
        hour_height: '36px',
        weather: { position: 'date' },
      },
      month: { event_gap: '4px', start: 'week', weeks: 4 },
    },
  ),
  story(
    'small_card_big_picture',
    '/guide/small-card-big-picture',
    ['#ff6c92', '#03a9f4', '#66bb6a', '#b388ff', '#ffb74d'],
    {
      title: 'Family',
      days_to_show: 3,
      event_gap: '4px',
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      // A tap anywhere but an event opens the card full size, as the toolbar's button does.
      tap_action: { action: 'overlay' },
      toolbar: {
        show: true,
        legend: false,
        add_event: false,
        refresh: false,
        search: false,
        overlay: true,
      },
      overlay: { view: 'month', toolbar: { legend: 'chips', add_event: true, search: true } },
      // The four weeks from this one, in the column and full size.
      month: { event_gap: '4px', start: 'week', weeks: 4 },
    },
  ),
  story(
    'now_and_next',
    '/guide/now-and-next',
    ['#ff6c92', '#03a9f4', '#66bb6a', '#b388ff', '#ffb74d'],
    {
      days_to_show: 2,
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      show_empty_today: true,
      show_countdown: 'once_per_day',
      show_time_left: true,
      show_progress_bar: true,
      show_location: false,
      show_end_time: false,
      scroll_long_titles: true,
      event_gap: '4px',
      // A tap anywhere expands the card, events included, and a hold opens an event.
      tap_action: { action: 'expand' },
      event_tap_action: { action: 'none' },
      event_hold_action: { action: 'details' },
      list: { compact_events_to_show: 4 },
    },
  ),
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
      weather_entity: 'weather.home',
      toolbar: { show: true, view_switcher: false, legend: false, overlay: true },
      day_tap_action: { action: 'add-event' },
      // List, which the card opened full size can switch to, with the same forecast.
      list: { weather: { position: 'both', event: { show_conditions: false } } },
      time_grid: {
        start_time: '07:00',
        end_time: '21:00',
        hour_height: '56px',
        slot_minutes: 30,
        event_font_size: '13px',
        weather: { position: 'both', event: { show_conditions: false } },
      },
    },
  ),
  story('birthdays_and_holidays', '/guide/birthdays-and-holidays', ['#f06292', '#26a69a'], {
    title: 'Coming Up',
    days_to_show: 60,
    show_countdown: true,
    countdown_exact_days: true,
    show_single_allday_time: false,
    show_month: false,
    month_separator_width: '1px',
    day_spacing: '4px',
    event_gap: '4px',
    vertical_line_width: '4px',
    tap_action: { action: 'overlay' },
    toolbar: { show: true, legend: false, add_event: false, refresh: false, view_switcher: false },
    overlay: { view: 'month' },
    list: { month_separator_label: true },
  }),
  story('house_log', '/guide/house-log', ['#8d6e63'], {
    title: 'House Log',
    start_date: 'today-29',
    days_to_show: 30,
    show_past_events: true,
    past_event_opacity: 100,
    show_countdown: true,
    show_time: false,
    time_position: 'title',
    list: { event_order: 'latest_first' },
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
