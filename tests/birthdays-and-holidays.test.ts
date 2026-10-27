/**
 * The Birthdays & Holidays story's card, mounted, doing what its page says.
 *
 * `docs/guide/birthdays-and-holidays.md` prints a two-month list for "whose birthday is next,
 * how old they turn, and when the next break starts and ends", and promises it with nothing set
 * up on the card beyond the page's yaml: `YEAR=1990` in a description adds the age to the title
 * and counts up each year, every event still to come carries a countdown, a one-day event has no
 * "All day" line while a holiday of several days still says when it ends, two months are shown
 * with empty days hidden, a rule marks where a month ends, and a tap opens the entry as the
 * calendar stores it. Nothing ran this card before this file.
 *
 * The age is the one promise with no option behind it, so its control is a fixture: the same
 * birthday without the marker.
 *
 * Runs in the UTC project: the fixture is all-day dates and `FROZEN_NOW`, so every countdown
 * and window edge is fixed. All-day parsing and countdown day arithmetic across zones are
 * pinned in `all-day-parse.dst.test.ts` and `countdown-calendar-days.dst.test.ts`.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import {
  type StoryEvent,
  type StoryHass,
  dropOption,
  listRows,
  mountStory,
  readStoryCard,
  rowTitled,
  shadow,
  storyGuide,
  tap,
  text,
  titles,
  withOptions,
} from './story-card';

vi.mock('../src/utils/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/logger')>()),
  debug: vi.fn(),
  info: vi.fn(),
}));

const openDetails = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../src/interaction/ha-calendar-dialogs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/interaction/ha-calendar-dialogs')>()),
  openEventDetailDialog: openDetails,
}));

const PAGE = 'birthdays-and-holidays';
const { config: CARD, entities: BLOCKS } = readStoryCard(PAGE);

/** An all-day event from `first` through `last`, both inclusive. */
function allDay(summary: string, first: string, last = first, description?: string): StoryEvent {
  const end = new Date(`${last}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    summary,
    start: { date: first },
    end: { date: end.toISOString().slice(0, 10) },
    ...(description ? { description } : {}),
  };
}

/**
 * From Wednesday 17 June 2026: a fair under way since yesterday, three birthdays with the marker
 * and one without, a one-day bank holiday and a summer break of twelve days. Clara's birthday
 * falls on the last of the sixty days and Tom's on the day after it.
 */
const BIRTHDAYS = [
  allDay('Mia', '2026-06-20', undefined, 'YEAR=1990'),
  allDay('Mia', '2027-06-20', undefined, 'YEAR=1990'),
  allDay('Noah', '2026-07-02'),
  allDay('Clara', '2026-08-15', undefined, 'YEAR=2019'),
  allDay('Tom', '2026-08-16', undefined, 'YEAR=1985'),
];
const SEASON: StoryHass = {
  payload: {
    'calendar.birthdays': BIRTHDAYS,
    'calendar.holidays': [
      allDay('Midsummer fair', '2026-06-16', '2026-06-18'),
      allDay('Bank holiday', '2026-06-29'),
      allDay('Summer break', '2026-07-20', '2026-07-31'),
    ],
  },
};

const DRAWN = ['Midsummer fair', 'Mia (36)', 'Bank holiday', 'Noah', 'Summer break', 'Clara (7)'];

describe('the Birthdays & Holidays card behaves as its page describes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(FROZEN_NOW);
    openDetails.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the card off the page, with the options the page teaches', () => {
    expect(BLOCKS.map((b) => [b.entity, b.label, b.accent_color])).toEqual([
      ['calendar.birthdays', '🎂', '#f06292'],
      ['calendar.holidays', '🎉', '#26a69a'],
    ]);
    expect(CARD).toMatchObject({
      days_to_show: 60,
      show_countdown: true,
      show_single_allday_time: false,
      month_separator_width: '1px',
      event_tap_action: { action: 'details' },
    });
  });

  it('adds the age from YEAR= to the title, and counts it up a year later', async () => {
    // "The card adds the age to the title, (36) in 2026, and counts up by itself every year."
    const page = readFileSync(storyGuide(PAGE), 'utf8');
    expect(page).toContain('`YEAR=1990`');
    expect(page).toContain('`(36)` in 2026');

    const card = await mountStory(CARD, SEASON);
    expect(titles(card)).toEqual(DRAWN);
    expect(rowTitled(card, 'Mia (36)').labels).toEqual(['🎂']);

    vi.setSystemTime(new Date('2027-06-17T10:00:00.000Z'));
    const nextYear = await mountStory(CARD, SEASON);
    expect(titles(nextYear)).toContain('Mia (37)');

    // Control: the same birthday without the marker. Noah above has none either; this is Mia's
    // own event, so the age above is the description and nothing else about her.
    vi.setSystemTime(FROZEN_NOW);
    const unmarked: StoryHass = {
      payload: { 'calendar.birthdays': [allDay('Mia', '2026-06-20')] },
    };
    expect(titles(await mountStory(CARD, unmarked))).toEqual(['Mia']);
  });

  it('opens the entry as the calendar stores it, without the age', async () => {
    // "A tap opens the entry as the calendar stores it, so the dialog shows the title without
    // the age." The row it was tapped on does carry the age, so its absence below is the dialog.
    const card = await mountStory(CARD, SEASON);
    await tap(card, rowTitled(card, 'Mia (36)').target);
    expect(openDetails).toHaveBeenCalledTimes(1);
    const { calendarId, entry } = (openDetails.mock.calls[0] as unknown[])[1] as {
      calendarId: string;
      entry: { summary: string; description?: string };
    };
    expect([calendarId, entry.summary, entry.description]).toEqual([
      'calendar.birthdays',
      'Mia',
      'YEAR=1990',
    ]);
  });

  it('counts down to every event still to come, and not to one under way', async () => {
    const card = await mountStory(CARD, SEASON);
    expect(listRows(card).map((row) => [row.title, row.countdown])).toEqual([
      ['Midsummer fair', null],
      ['Mia (36)', 'in 3 days'],
      ['Bank holiday', 'in 12 days'],
      ['Noah', 'in 15 days'],
      ['Summer break', 'in a month'],
      ['Clara (7)', 'in 2 months'],
    ]);

    // Control: `show_countdown` out, and no row counts down.
    const quiet = await mountStory(dropOption(CARD, 'show_countdown'), SEASON);
    expect(listRows(quiet).map((row) => row.countdown)).toEqual(Array(DRAWN.length).fill(null));
  });

  it('drops "All day" under a one-day event and keeps when a longer holiday ends', async () => {
    // The words on each row's time line: none under a one-day event, the end under a longer
    // one. A line holding only its countdown and no line at all both say nothing here, so the
    // two read alike; what a one-day row must not say is "All day".
    const card = await mountStory(CARD, SEASON);
    expect(listRows(card).map((row) => [row.title, row.time || null])).toEqual([
      ['Midsummer fair', 'All day, ends tomorrow'],
      ['Mia (36)', null],
      ['Bank holiday', null],
      ['Noah', null],
      ['Summer break', 'All day, until Friday, Jul 31'],
      ['Clara (7)', null],
    ]);

    // Control: `show_single_allday_time` out, and every one-day event says "All day" again.
    const wordy = await mountStory(dropOption(CARD, 'show_single_allday_time'), SEASON);
    expect(listRows(wordy).map((row) => row.time)).toEqual([
      'All day, ends tomorrow',
      'All day',
      'All day',
      'All day',
      'All day, until Friday, Jul 31',
      'All day',
    ]);
  });

  it('shows sixty days ahead, and only the days with something on them', async () => {
    // "Two months ahead; days with nothing on them stay hidden." Clara is on day sixty, Tom on
    // day sixty-one.
    const card = await mountStory(CARD, SEASON);
    expect(listRows(card).map((row) => row.date)).toEqual([
      'Jun 17',
      'Jun 20',
      'Jun 29',
      'Jul 2',
      'Jul 20',
      'Aug 15',
    ]);
    expect(shadow(card).querySelectorAll('table.day-table')).toHaveLength(6);

    // Controls. A sixty-first day brings Tom in, so the window is what kept him out; and empty
    // days switched on fill all sixty, so their absence above is the default the page relies on.
    const longer = await mountStory(withOptions(CARD, { days_to_show: 61 }), SEASON);
    expect(titles(longer)).toEqual([...DRAWN, 'Tom (41)']);
    const filled = await mountStory(withOptions(CARD, { show_empty_days: true }), SEASON);
    expect(shadow(filled).querySelectorAll('table.day-table')).toHaveLength(60);
  });

  it('draws a rule where one month ends and the next begins', async () => {
    // "A rule between months", read as the months on either side of each rule.
    const monthOf = (table: Element | null) => text(table?.querySelector('.date-column .month'));
    const rules = (card: Awaited<ReturnType<typeof mountStory>>) =>
      [...shadow(card).querySelectorAll('.month-separator')].map((rule) => [
        monthOf(rule.previousElementSibling),
        monthOf(rule.nextElementSibling),
      ]);

    expect(rules(await mountStory(CARD, SEASON))).toEqual([
      ['Jun', 'Jul'],
      ['Jul', 'Aug'],
    ]);

    // Control: without `month_separator_width` there is no rule at all.
    expect(rules(await mountStory(dropOption(CARD, 'month_separator_width'), SEASON))).toEqual([]);
  });
});
