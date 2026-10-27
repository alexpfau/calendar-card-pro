/**
 * The two family stories describe one family's week, and this suite holds them to it.
 *
 * `docs/guide/family-calendar.md` (the Family Hub) and
 * `docs/guide/one-calendar-many-purposes.md` (the Family Agenda) show Anna, Ben and Leo on
 * two displays. Each page is pinned on its own elsewhere, and that was not enough: the pages
 * drifted apart while each stayed internally correct. Before this suite the agenda had five
 * calendars to the grid's six, put the trash pickup on the family calendar, and gave every
 * person and calendar a different color — Anna pink on one screen and purple on the other —
 * with every gate green, because nothing compared the two.
 *
 * So the comparisons here run in both directions and are pinned by value, never by walking
 * one page's keys and looking them up on the other: a calendar dropped from both pages, or a
 * color changed on both, must still fail. The palette and the calendar list are the family's,
 * decided once, and a change to either is a change to both pages and to this file.
 *
 * Three things legitimately differ between the displays: the Family Hub leaves Ben's work
 * calendar off, the number of blocks per calendar, and the labels on the calendars the Hub's
 * grid draws only as banners. Each is pinned on its own below, and the blocks and labels are
 * checked against each page's own calendar table rather than against the other page.
 *
 * What this suite cannot see is the events themselves. The week both screenshots show is
 * generated outside the repository, from the demo pack that also feeds the capture
 * dashboards, so the titles and times in the pictures are held together by that one
 * generator rather than by a test. `tests/one-calendar-many-purposes.test.ts` runs the agenda
 * card over events written with the family's titles, which is as close as the repository
 * gets.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AGENDA_GUIDE,
  type GuideBlock,
  HUB_GUIDE,
  readGuideCalendarTable,
  readGuideCard,
} from './guide-config';

const PAGES = { hub: HUB_GUIDE, agenda: AGENDA_GUIDE } as const;
const CARDS = { hub: readGuideCard(HUB_GUIDE), agenda: readGuideCard(AGENDA_GUIDE) };

/** The family's calendars, in the order both cards list them. The Hub has no work calendar. */
const CALENDARS = {
  hub: [
    'calendar.anna',
    'calendar.ben',
    'calendar.leo',
    'calendar.family',
    'calendar.trash_pickup',
  ],
  agenda: [
    'calendar.anna',
    'calendar.ben',
    'calendar.leo',
    'calendar.work',
    'calendar.family',
    'calendar.trash_pickup',
  ],
};

/** One color for each calendar, on every display and every block. */
const PALETTE: Record<string, string> = {
  'calendar.anna': '#ff6c92',
  'calendar.ben': '#03a9f4',
  'calendar.leo': '#66bb6a',
  'calendar.work': '#90a4ae',
  'calendar.family': '#ffb74d',
  'calendar.trash_pickup': '#b388ff',
};

/** The faces, as `person.*` labels. Ben's is on his work calendar too, where it appears. */
const FACES: Record<string, string> = {
  'calendar.anna': 'person.anna',
  'calendar.ben': 'person.ben',
  'calendar.leo': 'person.leo',
  'calendar.work': 'person.ben',
};

/** Each calendar once, in the order of its first block. */
function calendarsOf(blocks: GuideBlock[]): string[] {
  return [...new Set(blocks.map((b) => String(b.entity)))];
}

/** Every distinct value of `key` across a calendar's blocks, so a split color shows as two. */
function valuesBy(blocks: GuideBlock[], key: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const block of blocks) {
    const values = (out[String(block.entity)] ??= []);
    const value = block[key] === undefined ? '(none)' : String(block[key]);
    if (!values.includes(value)) values.push(value);
  }
  return out;
}

describe('the two family stories describe one family', () => {
  it('feed both cards from the same calendars, in the same order, the Hub without work', () => {
    expect(calendarsOf(CARDS.hub.entities)).toEqual(CALENDARS.hub);
    expect(calendarsOf(CARDS.agenda.entities)).toEqual(CALENDARS.agenda);
    // The agenda is the Hub's list with Ben's work calendar added, and nothing else.
    expect(CALENDARS.agenda.filter((c) => c !== 'calendar.work')).toEqual(CALENDARS.hub);

    // The Hub's point is one block per calendar; the agenda's is that two of them split.
    // Both are stated in each page's table, and checked against it below.
    expect(CARDS.hub.entities).toHaveLength(CALENDARS.hub.length);
  });

  it('give each calendar one color, the same on both displays', () => {
    for (const page of ['hub', 'agenda'] as const) {
      const expected = Object.fromEntries(CALENDARS[page].map((c) => [c, [PALETTE[c]]]));
      // One entry per calendar, not per block: the agenda's two work blocks and two family
      // blocks must not differ from each other either.
      expect(valuesBy(CARDS[page].entities, 'accent_color'), page).toEqual(expected);
    }
  });

  it("color a shared plan in the Family calendar's gold on both displays", () => {
    for (const card of Object.values(CARDS)) {
      expect(card.config.filter_duplicates).toBe(true);
      expect(card.config.duplicate_accent_color).toBe(PALETTE['calendar.family']);
    }
  });

  it('open the details dialog on a tap on both displays', () => {
    // Both pages explain what the dialog shows, and the agenda's privacy section is written
    // around it being on. A card that dropped it would leave that prose describing nothing.
    for (const card of Object.values(CARDS)) {
      expect(card.config.event_tap_action).toEqual({ action: 'details' });
    }
  });

  it('show the window and the hours each page describes', () => {
    // The Hub is seven days from today in grid view on a 07:00-22:00 axis, with a phone's List
    // at three days, and the agenda three days from today. These are the numbers the prose and
    // the screenshots quote, so each is pinned beside the sentence that quotes it: a card that
    // changed one would leave its page describing a picture the card no longer draws.
    const hub = readFileSync(PAGES.hub, 'utf8');
    const agenda = readFileSync(PAGES.agenda, 'utf8');

    expect(CARDS.hub.config).toMatchObject({
      view: 'grid',
      days_to_show: 7,
      list: { days_to_show: 3 },
      column: { min_days_to_show: 3 },
      time_grid: { start_time: '07:00', end_time: '22:00', hour_height: '36px' },
    });
    expect(CARDS.hub.config.start_date).toBeUndefined();
    expect(hub).toContain('The axis runs from 07:00 to 22:00');
    expect(hub).toContain('With no `start_date`, the seven days start today');
    expect(hub).toContain(
      "`list.days_to_show: 3` gives a phone's List today and the next two days",
    );

    expect(CARDS.agenda.config.view).toBeUndefined();
    expect(CARDS.agenda.config).toMatchObject({ days_to_show: 3 });
    expect(CARDS.agenda.config.start_date).toBeUndefined();
    expect(agenda).toContain('three days, today first');
  });

  it('put the same face on the same calendars on both displays', () => {
    const hub = valuesBy(CARDS.hub.entities, 'label');
    const agenda = valuesBy(CARDS.agenda.entities, 'label');

    for (const [calendar, face] of Object.entries(FACES)) {
      if (CALENDARS.hub.includes(calendar)) {
        expect(hub[calendar], `${calendar} on the Hub`).toEqual([face]);
      }
      expect(agenda[calendar], `${calendar} on the agenda`).toEqual([face]);
    }

    // The Hub's grid draws the family and trash calendars only as all-day banners, which show
    // no label, so it gives them none. The agenda gives them emoji, because every list row has
    // a label column. A face on either would claim a person the calendar does not belong to.
    expect(hub['calendar.family']).toEqual(['(none)']);
    expect(hub['calendar.trash_pickup']).toEqual(['(none)']);
    for (const calendar of ['calendar.family', 'calendar.trash_pickup']) {
      expect(agenda[calendar].some((label) => label.startsWith('person.'))).toBe(false);
    }
  });

  it("describe each calendar in the same words, and count each page's own blocks", () => {
    const tables = {
      hub: readGuideCalendarTable(PAGES.hub),
      agenda: readGuideCalendarTable(PAGES.agenda),
    };

    for (const page of ['hub', 'agenda'] as const) {
      const rows = tables[page];
      expect(
        rows.map((r) => r.calendar),
        `${page}: the table lists the card's calendars`,
      ).toEqual(CALENDARS[page]);

      const counted = Object.fromEntries(
        CALENDARS[page].map((c) => [c, CARDS[page].entities.filter((b) => b.entity === c).length]),
      );
      expect(
        Object.fromEntries(rows.map((r) => [r.calendar, r.blocks])),
        `${page}: the Blocks column matches the card`,
      ).toEqual(counted);
    }

    // The Holds column describes the calendar, not the display, so it is the same sentence on
    // both pages. A wording change has to be made twice, which is the point.
    const holds = (page: 'hub' | 'agenda') =>
      tables[page]
        .filter((r) => CALENDARS.hub.includes(r.calendar))
        .map((r) => [r.calendar, r.holds]);
    expect(holds('agenda')).toEqual(holds('hub'));
  });
});
