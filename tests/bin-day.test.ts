/**
 * The Bin Day story's card, mounted, doing what its page says.
 *
 * `docs/guide/bin-day.md` splits one waste-collection feed into four blocks so the card answers
 * "which bin goes out tonight?". Its promises: each block's `allowlist` keeps one bin and its
 * `compact_events_to_show: 1` leaves only that bin's next pickup, nearest first, a month ahead
 * so a monthly bin still shows; `replace_pattern` strips the feed's prefix while the dialog keeps
 * it; the bin's name sits in a pill of its color with "tomorrow" where "All day" would be;
 * `allday_expires_at: '10:00'` retires today's pickup at the first refresh after 10:00; and with
 * no pickups there is no card. Nothing ran this card before this file.
 *
 * Every row here comes from one calendar, so which block claimed a row is read off its icon.
 *
 * Runs in the UTC project: the fixture is all-day dates and the clock is set in UTC, so the
 * 10:00 expiry is 10:00 local. `allday_expires_at` at the local clock in other zones is pinned in
 * `local-day-filters.dst.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type StoryCard,
  type StoryEvent,
  type StoryHass,
  dropFromBlocks,
  dropOption,
  listRows,
  mountStory,
  readStoryCard,
  rowTitled,
  settle,
  tap,
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

const { config: CARD, entities: BLOCKS } = readStoryCard('bin-day');

/** Wednesday 17 June 2026, early, before the truck. */
const MORNING = new Date('2026-06-17T08:00:00.000Z');

/** A one-day pickup, titled the way the feed titles it. */
function pickup(bin: string, date: string): StoryEvent {
  const end = new Date(`${date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { summary: `🗑️ ${bin}`, start: { date }, end: { date: end.toISOString().slice(0, 10) } };
}

/**
 * Trash weekly from today, recycling fortnightly from tomorrow, organic weekly from Friday,
 * paper monthly with its next pickup 23 days out and the one after past the month. Glass is a
 * bin the page's blocks do not name.
 */
const FEED: StoryHass = {
  payload: {
    'calendar.trash_pickup': [
      pickup('Trash', '2026-06-17'),
      pickup('Trash', '2026-06-24'),
      pickup('Trash', '2026-07-01'),
      pickup('Recycling', '2026-06-18'),
      pickup('Recycling', '2026-07-02'),
      pickup('Organic', '2026-06-19'),
      pickup('Organic', '2026-06-26'),
      pickup('Paper', '2026-07-10'),
      pickup('Paper', '2026-08-07'),
      pickup('Glass', '2026-06-22'),
    ],
  },
};

const ICON: Record<string, string> = {
  Trash: 'mdi:trash-can',
  Recycling: 'mdi:recycle',
  Organic: 'mdi:leaf',
  Paper: 'mdi:newspaper-variant-outline',
};

/** Each row as `date title icon`. */
const drawn = (card: StoryCard) =>
  listRows(card).map((row) => `${row.date} ${row.title} ${row.labels.join(' ')}`);

const NEXT_PICKUPS = [
  'Jun 17 Trash mdi:trash-can',
  'Jun 18 Recycling mdi:recycle',
  'Jun 19 Organic mdi:leaf',
  'Jul 10 Paper mdi:newspaper-variant-outline',
];

describe('the Bin Day card behaves as its page describes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(MORNING);
    openDetails.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the card off the page: one calendar in four blocks, one bin each', () => {
    expect(BLOCKS.map((b) => [b.entity, b.allowlist, b.label])).toEqual(
      ['Trash', 'Recycling', 'Paper', 'Organic'].map((bin) => [
        'calendar.trash_pickup',
        bin,
        ICON[bin],
      ]),
    );
    for (const block of BLOCKS) {
      expect(block).toMatchObject({
        replace_pattern: '🗑️ ',
        allday_expires_at: '10:00',
        compact_events_to_show: 1,
      });
    }
    expect(CARD).toMatchObject({
      days_to_show: 31,
      show_countdown: true,
      show_single_allday_time: false,
      allday_badge: 'title',
      allday_badge_style: 'tinted',
      hide_when_empty: true,
      event_tap_action: { action: 'details' },
    });
  });

  it("shows each bin's next pickup only, nearest first, a month ahead", async () => {
    const card = await mountStory(CARD, FEED);
    expect(drawn(card)).toEqual(NEXT_PICKUPS);

    // Controls. Without the per-block limit every pickup in the month is drawn, so the one each
    // above is the limit, counted per block rather than per calendar. Without the Organic
    // block's allowlist that block claims the whole feed and draws its first pickup, today's
    // trash, under the leaf, so the bins above are kept apart by the allowlists. Glass is in
    // the feed and in no block, and is never drawn.
    const every = await mountStory(dropFromBlocks(CARD, 'compact_events_to_show'), FEED);
    expect(drawn(every)).toEqual([
      'Jun 17 Trash mdi:trash-can',
      'Jun 18 Recycling mdi:recycle',
      'Jun 19 Organic mdi:leaf',
      'Jun 24 Trash mdi:trash-can',
      'Jun 26 Organic mdi:leaf',
      'Jul 1 Trash mdi:trash-can',
      'Jul 2 Recycling mdi:recycle',
      'Jul 10 Paper mdi:newspaper-variant-outline',
    ]);

    const unsorted = await mountStory(
      dropFromBlocks(CARD, 'allowlist', (b) => b.allowlist === 'Organic'),
      FEED,
    );
    expect(drawn(unsorted)).toContain('Jun 17 Trash mdi:leaf');

    // "A month ahead, so a monthly bin still shows": two weeks would lose the paper.
    const fortnight = await mountStory(withOptions(CARD, { days_to_show: 14 }), FEED);
    expect(drawn(fortnight)).toEqual(NEXT_PICKUPS.slice(0, 3));
  });

  it("strips the feed's prefix on the card and keeps it in the dialog", async () => {
    const card = await mountStory(CARD, FEED);
    expect(listRows(card).map((row) => row.title)).toEqual([
      'Trash',
      'Recycling',
      'Organic',
      'Paper',
    ]);

    // "A tap shows the entry as the feed stores it, prefix included."
    await tap(card, rowTitled(card, 'Recycling').target);
    const { entry } = (openDetails.mock.calls[0] as unknown[])[1] as { entry: { summary: string } };
    expect(entry.summary).toBe('🗑️ Recycling');

    // Control: without `replace_pattern` the card draws the feed's titles as they come.
    const raw = await mountStory(dropFromBlocks(CARD, 'replace_pattern'), FEED);
    expect(listRows(raw).map((row) => row.title)).toEqual([
      '🗑️ Trash',
      '🗑️ Recycling',
      '🗑️ Organic',
      '🗑️ Paper',
    ]);
  });

  it('puts each name in a pill of its color, with "tomorrow" where "All day" would be', async () => {
    const card = await mountStory(CARD, FEED);
    const pills = listRows(card).map((row) => [
      row.title,
      row.pill,
      row.element.querySelector('.allday-title-pill')?.classList.contains('allday-pill-tinted'),
    ]);
    expect(pills).toEqual([
      ['Trash', '#78909c', true],
      ['Recycling', '#f9a825', true],
      ['Organic', '#43a047', true],
      ['Paper', '#1e88e5', true],
    ]);
    // Today's pickup has begun and has nothing to count down to, so it has no time line at
    // all; the others carry their countdown alone.
    expect(listRows(card).map((row) => [row.title, row.time, row.countdown])).toEqual([
      ['Trash', null, null],
      ['Recycling', '', 'tomorrow'],
      ['Organic', '', 'in 2 days'],
      ['Paper', '', 'in 23 days'],
    ]);

    // Controls: without `allday_badge` there is no pill; without `show_single_allday_time:
    // false` "All day" is back beside "tomorrow".
    const plain = await mountStory(dropOption(CARD, 'allday_badge'), FEED);
    expect(listRows(plain).map((row) => row.pill)).toEqual([null, null, null, null]);
    const wordy = await mountStory(dropOption(CARD, 'show_single_allday_time'), FEED);
    expect([rowTitled(wordy, 'Recycling').time, rowTitled(wordy, 'Recycling').countdown]).toEqual([
      'All day',
      'tomorrow',
    ]);
  });

  it("retires today's pickup at the first refresh after 10:00", async () => {
    // "Gone at the first refresh after 10:00." Mounted at 09:45, the card refreshes on its own
    // half an hour later; by then the truck has been, and the trash block's next pickup is next
    // week's.
    const trashDate = (card: StoryCard) =>
      listRows(card).find((row) => row.title === 'Trash')?.date;
    vi.setSystemTime(new Date('2026-06-17T09:45:00.000Z'));

    const requests: string[] = [];
    const card = await mountStory(CARD, { ...FEED, requests });
    expect(trashDate(card)).toBe('Jun 17');
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    await settle(card);
    expect(new Date().toISOString()).toBe('2026-06-17T10:16:00.000Z');
    // The card did refresh in that half hour: it asked the feed again.
    expect(requests).toHaveLength(2);
    expect(drawn(card)).toEqual([
      'Jun 18 Recycling mdi:recycle',
      'Jun 19 Organic mdi:leaf',
      'Jun 24 Trash mdi:trash-can',
      'Jul 10 Paper mdi:newspaper-variant-outline',
    ]);

    // Control: the trash block without `allday_expires_at`, over the same half hour, keeps
    // today's pickup until midnight.
    document.body.innerHTML = '';
    vi.setSystemTime(new Date('2026-06-17T09:45:00.000Z'));
    const midnight = await mountStory(
      dropFromBlocks(CARD, 'allday_expires_at', (b) => b.allowlist === 'Trash'),
      FEED,
    );
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    await settle(midnight);
    expect(trashDate(midnight)).toBe('Jun 17');
  });

  it('hides the card when no bin has a pickup', async () => {
    // "No pickups, no card." The feed below holds only glass, which no block takes.
    const glassOnly: StoryHass = {
      payload: { 'calendar.trash_pickup': [pickup('Glass', '2026-06-22')] },
    };
    const card = await mountStory(CARD, glassOnly);
    expect([card.hidden, card.style.display]).toEqual([true, 'none']);

    // Controls: the same card with pickups is shown, and the same empty feed without
    // `hide_when_empty` leaves the card on the dashboard.
    expect((await mountStory(CARD, FEED)).hidden).toBe(false);
    expect((await mountStory(dropOption(CARD, 'hide_when_empty'), glassOnly)).hidden).toBe(false);
  });
});
