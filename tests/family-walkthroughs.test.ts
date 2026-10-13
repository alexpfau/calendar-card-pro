/**
 * The two family walkthroughs describe one family's week, and this suite holds them to it.
 *
 * `docs/guide/family-calendar.md` (The Weekly Grid) and
 * `docs/guide/one-calendar-many-purposes.md` (The Filtered Agenda) show Anna, Ben and Leo on
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
 * What may legitimately differ between the displays is the number of blocks per calendar and
 * the labels on the calendars whose events the grid draws only as banners. Both are checked
 * against each page's own calendar table rather than against the other page.
 */
import { describe, expect, it } from 'vitest';

import {
  AGENDA_GUIDE,
  GRID_GUIDE,
  type GuideBlock,
  readGuideCalendarTable,
  readGuideCard,
} from './guide-config';

const PAGES = { grid: GRID_GUIDE, agenda: AGENDA_GUIDE } as const;
const CARDS = { grid: readGuideCard(GRID_GUIDE), agenda: readGuideCard(AGENDA_GUIDE) };

/** The family's calendars, in the order both cards list them. */
const CALENDARS = [
  'calendar.anna',
  'calendar.ben',
  'calendar.leo',
  'calendar.work',
  'calendar.family',
  'calendar.trash_pickup',
];

/** One color for each calendar, on every display and every block. */
const PALETTE: Record<string, string> = {
  'calendar.anna': '#ff6c92',
  'calendar.ben': '#03a9f4',
  'calendar.leo': '#66bb6a',
  'calendar.work': '#90a4ae',
  'calendar.family': '#ffb74d',
  'calendar.trash_pickup': '#b388ff',
};

/** The faces. Ben's is on his work calendar too, on both displays. */
const FACES: Record<string, string> = {
  'calendar.anna': '/local/demo/anna.png',
  'calendar.ben': '/local/demo/ben.png',
  'calendar.leo': '/local/demo/leo.png',
  'calendar.work': '/local/demo/ben.png',
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

describe('the two family walkthroughs describe one family', () => {
  it('feed both cards from the same six calendars, in the same order', () => {
    expect(calendarsOf(CARDS.grid.entities)).toEqual(CALENDARS);
    expect(calendarsOf(CARDS.agenda.entities)).toEqual(CALENDARS);

    // The grid's point is one block per calendar; the agenda's is that two of them split.
    // Both are stated in each page's table, and checked against it below.
    expect(CARDS.grid.entities).toHaveLength(CALENDARS.length);
  });

  it('give each calendar one color, the same on both displays', () => {
    const expected = Object.fromEntries(CALENDARS.map((c) => [c, [PALETTE[c]]]));
    expect(valuesBy(CARDS.grid.entities, 'accent_color')).toEqual(expected);
    // One entry per calendar, not per block: the work calendar's two blocks and the family
    // calendar's two must not differ from each other either.
    expect(valuesBy(CARDS.agenda.entities, 'accent_color')).toEqual(expected);
  });

  it("color a shared plan in the Family calendar's gold on both displays", () => {
    for (const card of Object.values(CARDS)) {
      expect(card.config.filter_duplicates).toBe(true);
      expect(card.config.duplicate_accent_color).toBe(PALETTE['calendar.family']);
    }
  });

  it('put the same face on the same calendars on both displays', () => {
    const faces = Object.fromEntries(Object.entries(FACES).map(([c, f]) => [c, [f]]));
    const grid = valuesBy(CARDS.grid.entities, 'label');
    const agenda = valuesBy(CARDS.agenda.entities, 'label');

    for (const [calendar, face] of Object.entries(faces)) {
      expect(grid[calendar], `${calendar} on the grid`).toEqual(face);
      expect(agenda[calendar], `${calendar} on the agenda`).toEqual(face);
    }

    // The grid draws the family and trash calendars only as all-day banners, which show no
    // label, so it gives them none. The agenda gives them emoji, because every list row has a
    // label column. A face on either would claim a person the calendar does not belong to.
    expect(grid['calendar.family']).toEqual(['(none)']);
    expect(grid['calendar.trash_pickup']).toEqual(['(none)']);
    for (const calendar of ['calendar.family', 'calendar.trash_pickup']) {
      expect(agenda[calendar].some((label) => label.startsWith('/'))).toBe(false);
    }
  });

  it("describe each calendar in the same words, and count each page's own blocks", () => {
    const tables = {
      grid: readGuideCalendarTable(PAGES.grid),
      agenda: readGuideCalendarTable(PAGES.agenda),
    };

    for (const [page, rows] of Object.entries(tables)) {
      expect(
        rows.map((r) => r.calendar),
        `${page}: the table lists the card's calendars`,
      ).toEqual(CALENDARS);

      const card = CARDS[page as keyof typeof CARDS];
      const counted = Object.fromEntries(
        CALENDARS.map((c) => [c, card.entities.filter((b) => b.entity === c).length]),
      );
      expect(
        Object.fromEntries(rows.map((r) => [r.calendar, r.blocks])),
        `${page}: the Blocks column matches the card`,
      ).toEqual(counted);
    }

    // The Holds column describes the calendar, not the display, so it is the same sentence on
    // both pages. A wording change has to be made twice, which is the point.
    expect(tables.agenda.map((r) => [r.calendar, r.holds])).toEqual(
      tables.grid.map((r) => [r.calendar, r.holds]),
    );
  });
});
