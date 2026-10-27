/**
 * The Today & Tomorrow story's card, mounted, doing what its page says.
 *
 * `docs/guide/today-and-tomorrow.md` prints a two-day grid for "where are we in the day, and
 * what is still to come", and each row of its "What It Adds" table is a promise about what is
 * drawn: two days on a 07:00–21:00 axis, a bar on the running event, a face and a color per
 * person with shared plans once and in gold, the day's forecast over each column and the hour's
 * icon and temperature inside each timed event, and a tap that opens the event with Edit and
 * Delete except on a shared plan. Nothing ran this card before this file.
 *
 * The card is mounted with a weather entity whose forecasts arrive over a fake websocket, so the
 * weather is the card's own subscription, not a forecast table handed to a renderer. Each
 * promise sits beside a control arm, the page's card with the responsible option taken out.
 *
 * Runs in the UTC project: the fixture's instants are UTC, so the axis, "running" and the
 * forecast hours are fixed by `FROZEN_NOW` alone. Grid geometry across zones is pinned in
 * `grid-geometry.dst.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import {
  type StoryCard,
  type StoryEvent,
  type StoryHass,
  dropFromBlocks,
  dropOption,
  mountStory,
  readStoryCard,
  shadow,
  styleValue,
  tap,
  text,
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

const { config: CARD, entities: BLOCKS } = readStoryCard('today-and-tomorrow');

/** A timed event on a day of June 2026, in UTC like `FROZEN_NOW`. */
function at(day: number, from: string, to: string, summary: string, uid: string): StoryEvent {
  return {
    summary,
    uid,
    start: { dateTime: `2026-06-${day}T${from}:00Z` },
    end: { dateTime: `2026-06-${day}T${to}:00Z` },
  };
}

/**
 * Wednesday the 17th at 10:00: Ben's standup is under way, a design review sits on his work
 * calendar, and the zoo trip is on Anna's and Leo's calendars both. Thursday has dinner on the
 * family calendar and Leo's paper round at 06:00, before the axis starts. Friday is past the two
 * days the card shows.
 */
const DAYS: StoryHass = {
  payload: {
    'calendar.anna': [at(17, '14:00', '16:00', 'Zoo 🦒', 'zoo-anna')],
    'calendar.ben': [at(17, '09:30', '10:30', 'Standup', 'standup')],
    'calendar.leo': [
      at(17, '14:00', '16:00', 'Zoo 🦒', 'zoo-leo'),
      at(18, '06:00', '06:45', 'Paper round', 'paper'),
      at(19, '10:00', '11:00', 'Football', 'football'),
    ],
    'calendar.work': [at(17, '11:00', '12:00', 'Design review', 'review')],
    'calendar.family': [at(18, '17:30', '18:30', 'Dinner', 'dinner')],
  },
  states: {
    ...Object.fromEntries(
      ['Anna', 'Ben', 'Leo'].map((name) => [
        `person.${name.toLowerCase()}`,
        {
          entity_id: `person.${name.toLowerCase()}`,
          state: 'home',
          attributes: { friendly_name: name, entity_picture: `/api/image/${name}.jpg` },
        },
      ]),
    ),
    // Every calendar can be written to, so whatever withholds Edit and Delete is the card.
    ...Object.fromEntries(
      ['anna', 'ben', 'leo', 'work', 'family'].map((name) => [
        `calendar.${name}`,
        { entity_id: `calendar.${name}`, state: 'off', attributes: { supported_features: 7 } },
      ]),
    ),
    'weather.home': { entity_id: 'weather.home', state: 'sunny', attributes: {} },
  },
  forecasts: {
    // Each day's high differs from every hourly temperature an event shows, so a block
    // drawing the day's figure instead of its hour's is a visible failure.
    daily: [
      { datetime: '2026-06-17T00:00:00Z', condition: 'sunny', temperature: 27 },
      { datetime: '2026-06-18T00:00:00Z', condition: 'rainy', temperature: 19 },
      { datetime: '2026-06-19T00:00:00Z', condition: 'cloudy', temperature: 22 },
    ],
    hourly: [17, 18, 19].flatMap((day) =>
      Array.from({ length: 24 }, (_, hour) => ({
        datetime: new Date(Date.UTC(2026, 5, day, hour)).toISOString(),
        condition: 'partlycloudy',
        temperature: day === 17 ? 10 + hour : hour - 2,
      })),
    ),
  },
};

/** One drawn block, as the reader sees it. */
interface Block {
  day: string;
  title: string;
  accent: string | null;
  faces: string[];
  progress: string | null;
  weather: { temperature: string | null; icon: string; condition: string | null } | null;
  target: Element;
}

/** The `ha-icon` an element holds, by the icon it was handed. */
const iconIn = (element: Element | null): string =>
  String((element?.querySelector('ha-icon') as unknown as { icon?: string } | null)?.icon ?? '');

/** The days the grid draws, as `YYYY-MM-DD`, in column order. */
function days(card: StoryCard): string[] {
  return [...shadow(card).querySelectorAll('.grid-day-header .column-day-header')].map((header) =>
    header.id.replace('calendar-card-day-', ''),
  );
}

/** Every timed block the grid draws, with the day whose column it sits in. */
function blocks(card: StoryCard): Block[] {
  const columns = days(card);
  const bodies = [...shadow(card).querySelectorAll('.grid-day-body')];
  expect(bodies, 'one body per drawn day').toHaveLength(columns.length);
  return bodies.flatMap((body, index) =>
    [...body.querySelectorAll<HTMLElement>('.grid-event:not(.grid-event-overflow)')].map(
      (element) => {
        const weather = element.querySelector('.event-weather');
        return {
          day: columns[index],
          title: text(element.querySelector('.event-title')) ?? '',
          accent: styleValue(element, '--calendar-card-event-accent-bar-color'),
          faces: [...element.querySelectorAll('.summary .label-image')].map(
            (image) => image.getAttribute('alt') ?? '',
          ),
          progress: styleValue(element.querySelector('.progress-bar-filled'), 'width'),
          weather: weather
            ? {
                temperature: text(weather.querySelector('.event-weather-text > span')),
                icon: iconIn(weather),
                condition: text(weather.querySelector('.weather-condition')),
              }
            : null,
          target: element.querySelector('.event-title') ?? element,
        };
      },
    ),
  );
}

/** The single block titled `title`. */
function block(card: StoryCard, title: string): Block {
  const found = blocks(card).filter((b) => b.title === title);
  expect(found, `exactly one block should read ${title}`).toHaveLength(1);
  return found[0];
}

/** Each drawn block as `day title`. */
const placed = (card: StoryCard) => blocks(card).map((b) => `${b.day} ${b.title}`);

/** The card with one key of its `time_grid:` block changed. */
const withTimeGrid = (patch: Record<string, unknown>) =>
  withOptions(CARD, { time_grid: { ...(CARD.time_grid as object), ...patch } });

/** The card with its weather placed elsewhere. */
const withWeatherAt = (position: string) =>
  withOptions(CARD, { weather: { ...(CARD.weather as object), position } });

describe('the Today & Tomorrow card behaves as its page describes', () => {
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
    // The denominator: five calendars, Ben's face on his own and on his work calendar.
    expect(BLOCKS.map((b) => [b.entity, b.label ?? null, b.accent_color])).toEqual([
      ['calendar.anna', 'person.anna', '#ff6c92'],
      ['calendar.ben', 'person.ben', '#03a9f4'],
      ['calendar.leo', 'person.leo', '#66bb6a'],
      ['calendar.work', 'person.ben', '#90a4ae'],
      ['calendar.family', null, '#ffb74d'],
    ]);
    expect(CARD).toMatchObject({
      view: 'grid',
      days_to_show: 2,
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      show_progress_bar: true,
      weather: { entity: 'weather.home', position: 'both', event: { show_conditions: false } },
      event_tap_action: { action: 'details' },
      time_grid: { start_time: '07:00', end_time: '21:00', hour_height: '56px', slot_minutes: 30 },
    });
  });

  it('draws today and tomorrow on one axis from 07:00 to 21:00', async () => {
    const card = await mountStory(CARD, DAYS);
    expect(card.effectiveView).toBe('grid');
    expect(days(card)).toEqual(['2026-06-17', '2026-06-18']);

    const axis = [...shadow(card).querySelectorAll('.grid-axis-label')].map((l) => text(l));
    expect(axis).toHaveLength(15);
    expect([axis[0], axis[axis.length - 1]]).toEqual(['7 AM', '9 PM']);

    // "An event wholly outside them is not drawn": the 06:00 paper round, on a day the card
    // does draw. Friday's football is outside the two days.
    expect(placed(card)).toEqual([
      '2026-06-17 Standup',
      '2026-06-17 Design review',
      '2026-06-17 Zoo 🦒',
      '2026-06-18 Dinner',
    ]);

    // Controls. Start the axis at 06:00 and the paper round is drawn, so the bound removed it.
    // Show three days and Friday's football arrives, so the window kept it out.
    const early = await mountStory(withTimeGrid({ start_time: '06:00' }), DAYS);
    expect(placed(early)).toContain('2026-06-18 Paper round');

    const three = await mountStory(withOptions(CARD, { days_to_show: 3 }), DAYS);
    expect(days(three)).toEqual(['2026-06-17', '2026-06-18', '2026-06-19']);
    expect(placed(three)).toContain('2026-06-19 Football');
  });

  it('draws a shared plan once, in gold, with every face on it', async () => {
    // "A face and color per person; shared plans once, in gold."
    const card = await mountStory(CARD, DAYS);
    const zoo = block(card, 'Zoo 🦒');
    expect(zoo.accent).toBe('#ffb74d');
    expect(zoo.faces).toEqual(['Anna', 'Leo']);

    // Control: without `filter_duplicates` each calendar draws its own, in its own color.
    const unmerged = await mountStory(dropOption(CARD, 'filter_duplicates'), DAYS);
    expect(
      blocks(unmerged)
        .filter((b) => b.title === 'Zoo 🦒')
        .map((b) => [b.accent, b.faces]),
    ).toEqual([
      ['#ff6c92', ['Anna']],
      ['#66bb6a', ['Leo']],
    ]);

    // Control: without `duplicate_accent_color` the one block keeps the first calendar's pink,
    // so the gold above is that option and not the family calendar, which is gold as well.
    const ungilded = await mountStory(dropOption(CARD, 'duplicate_accent_color'), DAYS);
    expect(block(ungilded, 'Zoo 🦒').accent).toBe('#ff6c92');
  });

  it('puts the day forecast over each column and the hour in each event, without words', async () => {
    const card = await mountStory(CARD, DAYS);
    const headers = [...shadow(card).querySelectorAll('.grid-day-header')].map((header) => [
      text(header.querySelector('.weather-temp-high')),
      iconIn(header.querySelector('.weather')),
    ]);
    expect(headers).toEqual([
      ['27°', 'mdi:weather-sunny'],
      ['19°', 'mdi:weather-rainy'],
    ]);

    // The hour each event starts in: 09:00 is 19°, 11:00 is 21°, 14:00 is 24°, and Thursday's
    // 17:00 is 15°. An icon on each, and no condition words.
    expect(blocks(card).map((b) => [b.title, b.weather])).toEqual([
      ['Standup', { temperature: '19°', icon: 'mdi:weather-partly-cloudy', condition: null }],
      ['Design review', { temperature: '21°', icon: 'mdi:weather-partly-cloudy', condition: null }],
      ['Zoo 🦒', { temperature: '24°', icon: 'mdi:weather-partly-cloudy', condition: null }],
      ['Dinner', { temperature: '15°', icon: 'mdi:weather-partly-cloudy', condition: null }],
    ]);

    // Control: without `event.show_conditions: false` every block names its condition.
    const worded = await mountStory(dropOption(CARD, 'weather.event.show_conditions'), DAYS);
    expect(blocks(worded).map((b) => b.weather?.condition)).toEqual(Array(4).fill('Partly cloudy'));

    // Control: `both` is what puts it in both places. Each single position empties the other.
    const dateOnly = await mountStory(withWeatherAt('date'), DAYS);
    expect(blocks(dateOnly).map((b) => b.weather)).toEqual(Array(4).fill(null));
    const eventOnly = await mountStory(withWeatherAt('event'), DAYS);
    expect(shadow(eventOnly).querySelectorAll('.grid-day-header .weather')).toHaveLength(0);
  });

  it("puts Ben's work calendar under Ben's face, in the work calendar's gray", async () => {
    const card = await mountStory(CARD, DAYS);
    expect([block(card, 'Design review').faces, block(card, 'Design review').accent]).toEqual([
      ['Ben'],
      '#90a4ae',
    ]);
    expect([block(card, 'Standup').faces, block(card, 'Standup').accent]).toEqual([
      ['Ben'],
      '#03a9f4',
    ]);
    const picture = shadow(card).querySelectorAll('.label-image[alt="Ben"]');
    expect([...picture].map((image) => image.getAttribute('src'))).toEqual([
      '/api/image/Ben.jpg',
      '/api/image/Ben.jpg',
    ]);

    // Control: the work calendar's label taken off, and its event has no face.
    const faceless = await mountStory(
      dropFromBlocks(CARD, 'label', (b) => b.entity === 'calendar.work'),
      DAYS,
    );
    expect(block(faceless, 'Design review').faces).toEqual([]);
  });

  it('fills a bar on the running event and on nothing else', async () => {
    // Standup runs 09:30 to 10:30, and it is 10:00.
    const card = await mountStory(CARD, DAYS);
    expect(blocks(card).map((b) => [b.title, b.progress])).toEqual([
      ['Standup', '50%'],
      ['Design review', null],
      ['Zoo 🦒', null],
      ['Dinner', null],
    ]);

    // Control: without `show_progress_bar` the running event has none either.
    const bare = await mountStory(dropOption(CARD, 'show_progress_bar'), DAYS);
    expect(block(bare, 'Standup').progress).toBeNull();
  });

  it('opens the event on tap, with Edit and Delete, but not on a shared plan', async () => {
    // "The whole event on tap, with Edit and Delete where the calendar allows, but not on a
    // shared plan." Every calendar here allows both.
    const card = await mountStory(CARD, DAYS);
    const opened = () => {
      const params = openDetails.mock.calls[openDetails.mock.calls.length - 1] as unknown[];
      const { calendarId, entry, canEdit, canDelete } = params[1] as {
        calendarId: string;
        entry: { summary: string };
        canEdit: boolean;
        canDelete: boolean;
      };
      return { calendarId, summary: entry.summary, canEdit, canDelete };
    };

    await tap(card, block(card, 'Standup').target);
    expect(opened()).toEqual({
      calendarId: 'calendar.ben',
      summary: 'Standup',
      canEdit: true,
      canDelete: true,
    });

    await tap(card, block(card, 'Zoo 🦒').target);
    expect(opened()).toEqual({
      calendarId: 'calendar.anna',
      summary: 'Zoo 🦒',
      canEdit: false,
      canDelete: false,
    });
    expect(openDetails).toHaveBeenCalledTimes(2);

    // Control: the same zoo trip, not merged, is Anna's event alone and editable like any other,
    // so what withheld Edit and Delete above is the merge.
    const unmerged = await mountStory(dropOption(CARD, 'filter_duplicates'), DAYS);
    const annas = blocks(unmerged).filter((b) => b.title === 'Zoo 🦒' && b.faces[0] === 'Anna');
    expect(annas).toHaveLength(1);
    await tap(unmerged, annas[0].target);
    expect(opened()).toEqual({
      calendarId: 'calendar.anna',
      summary: 'Zoo 🦒',
      canEdit: true,
      canDelete: true,
    });
  });
});
