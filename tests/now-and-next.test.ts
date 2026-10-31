/**
 * The Now & Next story's card, mounted, doing what its page says.
 *
 * `docs/guide/now-and-next.md` prints a no-title phone tile for "what is on now, and what comes
 * next", and its promises are behaviors rather than option names: four events until tapped and
 * the rest on a tap, a free today that still says so, a plan on two people's calendars drawn
 * once, a countdown and a progress bar, two short lines per event, and events left as no tap
 * target of their own so a tap anywhere expands. `tests/example-stories.test.ts` checks the
 * card's option names; nothing ran the card until this file.
 *
 * Each promise is pinned beside a control arm — the page's card with the option responsible
 * taken out — so an assertion that could not fail is visible as a control that does not move.
 *
 * Runs in the UTC project. The fixture's instants are written in UTC, so "today", "running" and
 * "in 2 hours" are fixed by `FROZEN_NOW` alone; the zone arithmetic under countdowns and
 * progress is pinned in `countdown-calendar-days.dst.test.ts` and
 * `multiday-progress.dst.test.ts`.
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

const PAGE = 'now-and-next';
const { config: CARD, entities: BLOCKS } = readStoryCard(PAGE);

/** A timed event on a day of June 2026, in UTC like `FROZEN_NOW`. */
function at(day: number, from: string, to: string, summary: string, extra = {}): StoryEvent {
  return {
    summary,
    start: { dateTime: `2026-06-${day}T${from}:00Z` },
    end: { dateTime: `2026-06-${day}T${to}:00Z` },
    ...extra,
  };
}

/**
 * Wednesday the 17th at 10:00 holds two events under way, two still to come — one of them on
 * Ben's and Leo's calendars both — and one more after that; Thursday holds two. That is seven
 * rows across the two days, three more than the tile shows collapsed, and Friday's football is
 * outside the window altogether.
 */
const ZOO = at(17, '15:00', '17:00', 'Zoo 🦒');
const WEEK: StoryHass = {
  payload: {
    'calendar.anna': [
      at(17, '09:30', '10:30', 'Pilates'),
      at(18, '09:00', '10:00', 'Dentist', { location: '12 High Street' }),
    ],
    'calendar.ben': [at(17, '09:00', '11:00', 'Bike repair'), ZOO],
    'calendar.leo': [
      at(17, '12:00', '13:00', 'Swimming'),
      { ...ZOO },
      at(18, '16:00', '17:00', 'Piano'),
      at(19, '10:00', '11:00', 'Football'),
    ],
    'calendar.family': [at(17, '18:00', '18:30', 'Groceries')],
  },
  states: Object.fromEntries(
    ['anna', 'ben', 'leo'].map((name) => [
      `person.${name}`,
      {
        entity_id: `person.${name}`,
        state: 'home',
        attributes: {
          friendly_name: name[0].toUpperCase() + name.slice(1),
          entity_picture: `/api/image/${name}.jpg`,
        },
      },
    ]),
  ),
};

const COLLAPSED = ['Bike repair', 'Pilates', 'Swimming', 'Zoo 🦒'];
const EXPANDED = [...COLLAPSED, 'Groceries', 'Dentist', 'Piano'];

/** The card's own element, where a tap on the card lands. */
const haCard = (card: Awaited<ReturnType<typeof mountStory>>) =>
  shadow(card).querySelector('ha-card') as Element;

describe('the Now & Next card behaves as its page describes', () => {
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
    // The denominator. A page read as nothing would leave every arm below comparing an empty
    // card with an empty card, so the card is pinned by value before anything runs it.
    expect(BLOCKS.map((block) => [block.entity, block.label ?? null])).toEqual([
      ['calendar.anna', 'person.anna'],
      ['calendar.ben', 'person.ben'],
      ['calendar.leo', 'person.leo'],
      ['calendar.family', null],
    ]);
    expect(CARD.title).toBeUndefined();
    expect(CARD).toMatchObject({
      type: 'custom:calendar-card-pro',
      days_to_show: 2,
      filter_duplicates: true,
      show_empty_today: true,
      show_countdown: true,
      show_progress_bar: true,
      show_location: false,
      show_end_time: false,
      tap_action: { action: 'expand' },
      list: { compact_events_to_show: 4 },
    });
    // "Why Events Do Not Open on Tap": left out on purpose, and pinned as left out.
    expect(CARD.event_tap_action).toBeUndefined();
  });

  it('shows four events until tapped, then the rest of today and tomorrow, then folds back', async () => {
    const card = await mountStory(CARD, WEEK);
    expect(card.effectiveView).toBe('list');
    expect(titles(card)).toEqual(COLLAPSED);

    await tap(card, haCard(card));
    expect(titles(card)).toEqual(EXPANDED);
    // Friday's football is in the feed and never on the card: a tap shows everything in
    // `days_to_show`, and that is today and tomorrow.
    expect(listRows(card).map((row) => row.day)).toEqual([17, 17, 17, 17, 17, 18, 18]);

    await tap(card, haCard(card));
    expect(titles(card)).toEqual(COLLAPSED);

    // Controls. Without the limit every row is there from the start, so the four above is the
    // option and not the fixture. Without `tap_action` the same tap changes nothing, so the
    // expansion above is the page's action. With a third day the football does arrive, so its
    // absence above is the window.
    expect(titles(await mountStory(dropOption(CARD, 'list.compact_events_to_show'), WEEK))).toEqual(
      EXPANDED,
    );

    const inert = await mountStory(dropOption(CARD, 'tap_action'), WEEK);
    await tap(inert, haCard(inert));
    expect(titles(inert)).toEqual(COLLAPSED);

    const threeDays = await mountStory(withOptions(CARD, { days_to_show: 3 }), WEEK);
    await tap(threeDays, haCard(threeDays));
    expect(titles(threeDays)).toEqual([...EXPANDED, 'Football']);
  });

  it('expands on a tap that lands on an event, because events are no tap target here', async () => {
    // "A tap on an event wins over the card's tap, and events cover most of this card." With
    // `event_tap_action` left out, the event under the finger hands the tap to the card.
    const card = await mountStory(CARD, WEEK);
    await tap(card, rowTitled(card, 'Swimming').target);
    expect(titles(card)).toEqual(EXPANDED);
    expect(openDetails).not.toHaveBeenCalled();

    // Control: the option the page leaves out. The same tap on the same event now opens the
    // event and the card stays collapsed, which is the trade the page declines.
    const details = await mountStory(
      withOptions(CARD, { event_tap_action: { action: 'details' } }),
      WEEK,
    );
    await tap(details, rowTitled(details, 'Swimming').target);
    expect(titles(details)).toEqual(COLLAPSED);
    expect(openDetails).toHaveBeenCalledTimes(1);
  });

  it('still shows today when nothing is left on it', async () => {
    // "A free today still says so." Thursday's two events and nothing on Wednesday.
    const freeToday: StoryHass = {
      ...WEEK,
      payload: {
        'calendar.anna': [at(18, '09:00', '10:00', 'Dentist')],
        'calendar.leo': [at(18, '16:00', '17:00', 'Piano')],
      },
    };
    const card = await mountStory(CARD, freeToday);
    expect(listRows(card).map((row) => [row.day, row.title, row.empty])).toEqual([
      [17, '✓ No events', true],
      [18, 'Dentist', false],
      [18, 'Piano', false],
    ]);

    // Control: without the option the free day is simply not there.
    const without = await mountStory(dropOption(CARD, 'show_empty_today'), freeToday);
    expect(listRows(without).map((row) => [row.day, row.title])).toEqual([
      [18, 'Dentist'],
      [18, 'Piano'],
    ]);
  });

  it("draws a plan on two people's calendars once", async () => {
    // "A shared plan appears once." The zoo trip is on Ben's and Leo's calendars.
    const card = await mountStory(CARD, WEEK);
    await tap(card, haCard(card));
    expect(titles(card).filter((title) => title === 'Zoo 🦒')).toHaveLength(1);

    // Control: without `filter_duplicates` it is drawn once per calendar.
    const twice = await mountStory(dropOption(CARD, 'filter_duplicates'), WEEK);
    await tap(twice, haCard(twice));
    expect(titles(twice).filter((title) => title === 'Zoo 🦒')).toHaveLength(2);
  });

  it("puts each person's face on their own events and none on the family's", async () => {
    // "A face per person." Read as the picture's name, which is the person Home Assistant holds.
    const card = await mountStory(CARD, WEEK);
    await tap(card, haCard(card));
    const faces = Object.fromEntries(listRows(card).map((row) => [row.title, row.labels]));
    expect(faces).toMatchObject({
      Pilates: ['Anna'],
      'Bike repair': ['Ben'],
      Swimming: ['Leo'],
      Groceries: [],
    });
    expect(rowTitled(card, 'Pilates').element.querySelector('img')?.getAttribute('src')).toBe(
      '/api/image/anna.jpg',
    );

    // Control: the same card with every label taken off draws no face at all.
    const faceless = withOptions(CARD, {
      entities: BLOCKS.map(({ entity }) => ({ entity })),
    });
    const bare = await mountStory(faceless, WEEK);
    expect(listRows(bare).every((row) => row.labels.length === 0)).toBe(true);
  });

  it('counts down to what is next and fills a bar on what is under way', async () => {
    // The page quotes the countdown as "in 2 hours", and the swim at noon is two hours off.
    expect(readFileSync(storyGuide(PAGE), 'utf8')).toContain('"in 2 hours"');

    const card = await mountStory(CARD, WEEK);
    const shown = listRows(card).map((row) => [row.title, row.progress, row.countdown]);
    expect(shown).toEqual([
      ['Bike repair', '50%', null],
      ['Pilates', '50%', null],
      ['Swimming', null, 'in 2 hours'],
      ['Zoo 🦒', null, 'in 5 hours'],
    ]);

    // Control: the two options off, and neither line appears on any row.
    const plain = await mountStory(
      dropOption(dropOption(CARD, 'show_countdown'), 'show_progress_bar'),
      WEEK,
    );
    expect(listRows(plain).map((row) => [row.title, row.progress, row.countdown])).toEqual(
      COLLAPSED.map((title) => [title, null, null]),
    );
  });

  it('keeps every event to two short lines: no place, no end time', async () => {
    // "Two short lines per event": the title, and a time line holding only the start.
    const card = await mountStory(CARD, WEEK);
    await tap(card, haCard(card));
    const dentist = rowTitled(card, 'Dentist');
    expect(dentist.location).toBeNull();
    expect(dentist.time).toBe('9:00 AM');

    // Control: the two options out, and the place and the end come back.
    const full = await mountStory(
      dropOption(dropOption(CARD, 'show_location'), 'show_end_time'),
      WEEK,
    );
    await tap(full, haCard(full));
    const long = rowTitled(full, 'Dentist');
    expect(long.location).toBe('12 High Street');
    expect(long.time).toBe('9:00 AM - 10:00 AM');
  });
});
