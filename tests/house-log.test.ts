/**
 * The House Log story's card, mounted, doing what its page says.
 *
 * `docs/guide/house-log.md` prints a list card for a calendar kept as a log, and its promises:
 * the last 30 days up to today, entries that have ended included, the newest at the top; each
 * entry one line, its title and how long ago it was, with no clock time; every entry at full
 * strength; a tap opens the entry. Its section on writing an entry promises that a script's
 * one-minute entry reads "a few seconds ago" once its minute is up, and its variation that the
 * same card, changed as it says, keeps each front-door entry's time beside how long ago it was.
 *
 * The card, the script and the variation's lines are all read off the page, for the reason
 * `tests/guide-config.ts` gives. Each promise is pinned beside a control arm: the page's card
 * with the option responsible taken out.
 *
 * Runs in the UTC project, with every instant written in UTC, so "today" and each "ago" are
 * fixed by `NOW` alone. Count-ups across a change of clocks are pinned in
 * `count-up.dst.test.ts`.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { spyOnPopovers } from './popover-spy';
import {
  type StoryCard,
  type StoryEvent,
  type StoryHass,
  dropOption,
  listRows,
  mountStory,
  readStoryCard,
  rowTitled,
  settle,
  shadow,
  storyGuide,
  styleValue,
  tap,
  withOptions,
} from './story-card';

vi.mock('../src/utils/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/logger')>()),
  debug: vi.fn(),
  info: vi.fn(),
}));

const PAGE = 'house-log';
const { config: CARD, entities: BLOCKS } = readStoryCard(PAGE);
const MARKDOWN = readFileSync(storyGuide(PAGE), 'utf8');

/** Sunday 21 June 2026, early evening. The card's window runs from Saturday 23 May. */
const NOW = new Date('2026-06-21T18:30:00.000Z');

/** An entry as a script writes it: a minute long, from `iso`. */
function entry(iso: string, summary: string, minutes = 1): StoryEvent {
  const start = new Date(iso);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    summary,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/**
 * A month of household jobs. The plants are watered twice, a week apart, so the log holds a
 * job more than once. Saturday 23 May is the window's first day, 29 days back; Friday 22 May,
 * a day before it, is out.
 */
const LOG: StoryHass = {
  payload: {
    'calendar.house_log': [
      entry('2026-05-22T10:00:00Z', 'Gutters cleared'),
      entry('2026-05-23T10:00:00Z', 'Smoke alarms tested'),
      entry('2026-06-07T10:00:00Z', 'Lawn mowed'),
      entry('2026-06-14T15:00:00Z', 'Plants watered'),
      entry('2026-06-20T20:15:00Z', 'Water filter changed'),
      entry('2026-06-21T15:10:00Z', 'Plants watered'),
      entry('2026-06-21T18:05:00Z', 'Dishwasher descaled'),
    ],
  },
};

/** Each row as `date · title · count`. */
const drawn = (card: StoryCard) =>
  listRows(card).map((row) => `${row.date} · ${row.title} · ${row.countdown}`);

const NEWEST_FIRST = [
  'Jun 21 · Dishwasher descaled · 24 minutes ago',
  'Jun 21 · Plants watered · 3 hours ago',
  'Jun 20 · Water filter changed · yesterday',
  'Jun 14 · Plants watered · 7 days ago',
  'Jun 7 · Lawn mowed · 14 days ago',
  'May 23 · Smoke alarms tested · a month ago',
];

/** The first YAML block after a heading on the page, parsed. */
function yamlAfter(heading: string): Record<string, unknown> {
  const section = MARKDOWN.split(heading)[1];
  expect(section, `the page has no ${heading}`).toBeDefined();
  const block = /^```yaml\n([\s\S]*?)^```$/m.exec(section as string);
  expect(block, `no YAML block after ${heading}`).not.toBeNull();
  return parse((block as RegExpExecArray)[1]) as Record<string, unknown>;
}

describe('the House Log card behaves as its page describes', () => {
  let popovers: ReturnType<typeof spyOnPopovers>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    popovers = spyOnPopovers();
  });

  afterEach(() => {
    popovers.stop();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads the card off the page: one calendar, the last 30 days, newest first', () => {
    expect(BLOCKS).toEqual([{ entity: 'calendar.house_log', accent_color: '#8d6e63' }]);
    expect(CARD).toMatchObject({
      start_date: 'today-29',
      days_to_show: 30,
      show_past_events: true,
      past_event_opacity: 100,
      show_countdown: true,
      show_time: false,
      time_position: 'title',
      event_tap_action: { action: 'details' },
      list: { event_order: 'latest_first' },
    });
  });

  it('lists the last 30 days newest first, each entry with how long ago it was', async () => {
    const card = await mountStory(CARD, LOG);
    expect(drawn(card)).toEqual(NEWEST_FIRST);

    // Controls. Without the order the same entries run oldest first. Without past events no
    // entry is drawn, since every one has ended; the card says so on today.
    const oldest = await mountStory(dropOption(CARD, 'list.event_order'), LOG);
    expect(drawn(oldest)).toEqual([
      'May 23 · Smoke alarms tested · a month ago',
      'Jun 7 · Lawn mowed · 14 days ago',
      'Jun 14 · Plants watered · 7 days ago',
      'Jun 20 · Water filter changed · yesterday',
      'Jun 21 · Plants watered · 3 hours ago',
      'Jun 21 · Dishwasher descaled · 24 minutes ago',
    ]);
    const unlogged = await mountStory(dropOption(CARD, 'show_past_events'), LOG);
    expect(listRows(unlogged).map((row) => [row.date, row.empty])).toEqual([['Jun 21', true]]);

    // "The last 30 days up to today": a day further back brings in the gutters.
    const longer = await mountStory(
      withOptions(CARD, { start_date: 'today-30', days_to_show: 31 }),
      LOG,
    );
    expect(drawn(longer)).toEqual([...NEWEST_FIRST, 'May 22 · Gutters cleared · a month ago']);
  });

  it('puts how long ago beside the title, with no clock time', async () => {
    const card = await mountStory(CARD, LOG);
    const row = rowTitled(card, 'Lawn mowed').element;
    expect(row.querySelector('.title-aside .time-countdown')?.textContent?.trim()).toBe(
      '14 days ago',
    );
    expect(listRows(card).every((r) => r.time === null)).toBe(true);

    // Controls: with the time shown each entry gains its clock time, and with the time row
    // below the title the count leaves the title's line.
    const timed = await mountStory(dropOption(CARD, 'show_time'), LOG);
    expect(rowTitled(timed, 'Lawn mowed').time).toBe('10:00 AM - 10:01 AM14 days ago');
    const below = await mountStory(dropOption(CARD, 'time_position'), LOG);
    const belowRow = rowTitled(below, 'Lawn mowed').element;
    expect(belowRow.querySelector('.title-aside')).toBeNull();
    expect(rowTitled(below, 'Lawn mowed').countdown).toBe('14 days ago');
  });

  it('keeps every entry at full strength', async () => {
    const opacity = (card: StoryCard) =>
      styleValue(shadow(card).querySelector('ha-card'), '--calendar-card-past-event-opacity');
    const card = await mountStory(CARD, LOG);
    expect(listRows(card).every((row) => row.element.classList.contains('past-event'))).toBe(true);
    expect(opacity(card)).toBe('1');

    // Control: without it, finished entries fade to the default 60%.
    expect(opacity(await mountStory(dropOption(CARD, 'past_event_opacity'), LOG))).toBe('0.6');
  });

  it('opens the entry on a tap', async () => {
    const card = await mountStory(CARD, LOG);
    await tap(card, rowTitled(card, 'Water filter changed').target);
    expect(popovers.opened).toHaveBeenCalledTimes(1);
    expect(popovers.opened.mock.calls[0][0].entry?.summary).toBe('Water filter changed');
  });

  it("writes an entry the card counts up from once the script's minute is up", async () => {
    // "Writing an Entry": the script writes to the card's calendar, a minute from now.
    const script = yamlAfter('## ✍️ Writing an Entry');
    const [step] = script.sequence as Array<Record<string, unknown>>;
    expect(step).toMatchObject({
      action: 'calendar.create_event',
      target: { entity_id: BLOCKS[0].entity },
      data: {
        start_date_time: '{{ now() }}',
        end_date_time: '{{ now() + timedelta(minutes=1) }}',
      },
    });

    // The entry as that script writes it at 18:30: under way, so no count, for its minute;
    // "a few seconds ago" once it has ended, with no refresh.
    const requests: string[] = [];
    const fresh: StoryHass = {
      payload: { 'calendar.house_log': [entry(NOW.toISOString(), 'Lawn mowed')] },
      requests,
    };
    const card = await mountStory(CARD, fresh);
    expect(drawn(card)).toEqual(['Jun 21 · Lawn mowed · null']);
    await vi.advanceTimersByTimeAsync(61_000);
    await settle(card);
    expect(drawn(card)).toEqual(['Jun 21 · Lawn mowed · a few seconds ago']);
    expect(requests).toHaveLength(1);
  });

  it("keeps each job's last time only, when each job has a block of its own", async () => {
    // "Each job's last time only": one block per job, each capped at one entry.
    const perJob = withOptions(CARD, {
      entities: ['Plants watered', 'Lawn mowed', 'Smoke alarms tested'].map((job) => ({
        entity: 'calendar.house_log',
        allowlist: job,
        compact_events_to_show: 1,
      })),
    });
    const card = await mountStory(perJob, LOG);
    expect(drawn(card)).toEqual([
      'Jun 21 · Plants watered · 3 hours ago',
      'Jun 7 · Lawn mowed · 14 days ago',
      'May 23 · Smoke alarms tested · a month ago',
    ]);

    // Control: without the cap the plants' earlier watering is back.
    const uncapped = withOptions(perJob, {
      entities: (perJob.entities as Array<Record<string, unknown>>).map(
        ({ compact_events_to_show: _cap, ...block }) => block,
      ),
    });
    expect(drawn(await mountStory(uncapped, LOG))).toContain(
      'Jun 14 · Plants watered · 7 days ago',
    );
  });
});

describe('the front-door variation behaves as its page describes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** "Change these lines on the card above, and delete `show_time: false`". */
  function frontDoor(): Record<string, unknown> {
    expect(MARKDOWN).toContain(
      'Change these lines on the card above, and delete `show_time: false`',
    );
    return dropOption(withOptions(CARD, yamlAfter('### A Visitor or Camera Log')), 'show_time');
  }

  /** A week at the front door; a visit runs ten minutes, so it has an end of its own. */
  const DOOR: StoryHass = {
    payload: {
      'calendar.front_door': [
        entry('2026-06-14T09:00:00Z', 'Window cleaner'),
        entry('2026-06-15T09:00:00Z', 'Car arrived · KL 4821'),
        entry('2026-06-20T16:30:00Z', 'Parcel delivered'),
        entry('2026-06-21T14:05:00Z', 'Person at the door', 10),
      ],
    },
  };

  it('keeps the last seven days, each with its time and how long ago it was', async () => {
    const card = await mountStory(frontDoor(), DOOR);
    expect(listRows(card).map((row) => [row.date, row.title, row.time])).toEqual([
      ['Jun 21', 'Person at the door', '2:05 PM4 hours ago'],
      ['Jun 20', 'Parcel delivered', '4:30 PMyesterday'],
      ['Jun 15', 'Car arrived · KL 4821', '9:00 AM6 days ago'],
    ]);

    // Control: without `show_end_time: false` a visit with a length shows both its times.
    const both = await mountStory(dropOption(frontDoor(), 'show_end_time'), DOOR);
    expect(rowTitled(both, 'Person at the door').time).toBe('2:05 PM - 2:15 PM4 hours ago');
  });
});
