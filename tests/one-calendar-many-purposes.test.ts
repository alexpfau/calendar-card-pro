/**
 * The Filtered Agenda walkthrough's worked example, run through the real pipeline.
 *
 * `docs/guide/one-calendar-many-purposes.md` is the walkthrough that combines eight
 * per-calendar blocks with the card-level all-day options, and it makes specific, checkable
 * promises about what the card draws: that a birthday reads `Grandma (70)` under a 🎂 label,
 * that the trash collection retires at 11:00, that a work event without the marker reads
 * `Busy` beside Ben's face, and that nothing is drawn twice.
 *
 * Nothing pinned any of that. `check:docs` validates that the option *names* in a yaml block
 * exist and that a block claiming to be a card has an `entities:` list — it never runs one.
 * So every claim on that page could go false from a source change with all nine gates green.
 *
 * 🚨 **The config is read out of the page, not copied into this file** — see
 * `tests/guide-config.ts`. Editing the yaml in the guide therefore changes what this suite
 * asserts, which is the intent: the page is the fixture. That makes the reader a probe, and a
 * probe that silently parses nothing would turn every assertion into a vacuous pass, so the
 * first test pins its denominator — eight blocks over six calendars, carrying the specific
 * keys the page teaches.
 *
 * The page and The Weekly Grid describe one family's week, and
 * `tests/family-walkthroughs.test.ts` holds the two pages to that. This suite is about what
 * this card does with the events it is given.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { AGENDA_GUIDE, GRID_GUIDE, readGuideCard } from './guide-config';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

const { config: GUIDE_CONFIG, entities: GUIDE_ENTITIES } = readGuideCard(AGENDA_GUIDE);

/** The page's blocks for one calendar, in the order the page lists them. */
const blocksOf = (entity: string) => GUIDE_ENTITIES.filter((block) => block.entity === entity);

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

/**
 * Events chosen so that every block on the page has something to claim and something to
 * reject, and so the two work blocks are separated only by the description marker. The titles
 * are the family's own, written as the calendars write them — with the emoji the grid needs —
 * so the rewrites the page describes are exercised on the text they are meant for.
 *
 * Times sit after `FROZEN_NOW` (10:00 on Wed 17 Jun 2026) unless a case is about the past:
 * `show_past_events` is off by default, and an event scheduled before the frozen instant is
 * hidden for that reason rather than by any filter on the page. Getting that wrong reads as
 * a filter defect, which is a trap this fixture is shaped to avoid.
 */
const PAYLOAD: Record<string, unknown[]> = {
  'calendar.anna': [
    {
      summary: 'Haircut 💇‍♀️',
      start: { dateTime: '2026-06-17T18:00:00Z' },
      end: { dateTime: '2026-06-17T19:00:00Z' },
    },
  ],
  'calendar.ben': [
    {
      summary: 'Bike ride 🚴',
      start: { dateTime: '2026-06-17T16:00:00Z' },
      end: { dateTime: '2026-06-17T17:30:00Z' },
    },
  ],
  'calendar.leo': [
    {
      summary: 'Music class 🥁',
      start: { dateTime: '2026-06-17T15:00:00Z' },
      end: { dateTime: '2026-06-17T16:00:00Z' },
    },
  ],
  'calendar.work': [
    {
      summary: 'Team offsite',
      description: '#family',
      start: { dateTime: '2026-06-17T11:00:00Z' },
      end: { dateTime: '2026-06-17T14:00:00Z' },
    },
    {
      summary: 'Design review',
      description: 'agenda attached',
      start: { dateTime: '2026-06-17T14:00:00Z' },
      end: { dateTime: '2026-06-17T15:00:00Z' },
    },
    // No `description` key at all — the case the page's "Why the Two Halves Add Up" tip is
    // about. It must land in the Busy block and only there.
    {
      summary: 'Roadmap review',
      start: { dateTime: '2026-06-17T15:00:00Z' },
      end: { dateTime: '2026-06-17T17:30:00Z' },
    },
  ],
  'calendar.family': [
    {
      summary: "🎂 Grandma's birthday",
      description: 'YEAR=1956',
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
    },
    {
      summary: '🧳 Grandma & Grandpa visiting',
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
    },
  ],
  'calendar.trash_pickup': [
    { summary: '🗑️ Trash collection', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } },
  ],
};

function hass(): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => {
      const match = /^calendars\/([^?]+)/.exec(path);
      return match ? (PAYLOAD[match[1]] ?? []) : [];
    },
  } as unknown as Types.Hass;
}

let instance = 0;

interface DrawnRow {
  title: string;
  entity: string;
  label: string;
  mergedFrom: string[];
}

/** What the card draws, as `title` paired with the block that claimed it. */
async function drawn(overrides: Partial<Types.Config> = {}): Promise<DrawnRow[]> {
  const config = buildConfig({
    ...(GUIDE_CONFIG as unknown as Partial<Types.Config>),
    ...overrides,
  }) as Types.Config;
  const result = await fetchEventData(hass(), config, `guide-${instance++}`);
  return groupEventsByDay(result.events, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => ({
      title: event.summary ?? '',
      entity: event._entityId ?? '',
      label: String(event._entityLabel ?? ''),
      mergedFrom: (event._mergedFrom ?? []).map((m) => m.entityId),
    }));
}

/** The page's blocks with one key taken off the one block that `pick` selects. */
function withoutKey(pick: (block: Record<string, unknown>) => boolean, key: string) {
  const picked = GUIDE_ENTITIES.filter(pick);
  expect(picked, `withoutKey must select exactly one block to drop ${key} from`).toHaveLength(1);
  return GUIDE_ENTITIES.map((block) => {
    if (!pick(block)) return block;
    const copy: Record<string, unknown> = { ...block };
    expect(copy[key], `the selected block carries no ${key}`).toBeDefined();
    delete copy[key];
    return copy;
  });
}

describe('the Filtered Agenda example behaves as the page describes', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads a config off the page matching the shape the prose claims', () => {
    // The page says "The six calendars of The Weekly Grid go into it, as eight blocks": the
    // work and family calendars twice each, every other calendar once. Pinned by value rather
    // than by walking what was parsed, so losing a block fails here instead of quietly
    // shrinking every assertion below it.
    expect(GUIDE_ENTITIES).toHaveLength(8);
    const byCalendar = GUIDE_ENTITIES.reduce<Record<string, number>>((acc, block) => {
      acc[String(block.entity)] = (acc[String(block.entity)] ?? 0) + 1;
      return acc;
    }, {});
    expect(byCalendar).toEqual({
      'calendar.anna': 1,
      'calendar.ben': 1,
      'calendar.leo': 1,
      'calendar.work': 2,
      'calendar.family': 2,
      'calendar.trash_pickup': 1,
    });

    // The options the page teaches, each on the block that teaches it. A page rewritten to
    // drop one of these is no longer the page this suite is describing.
    expect(blocksOf('calendar.anna')[0]).toMatchObject({ label: '/local/demo/anna.png' });
    expect(blocksOf('calendar.work')[0]).toMatchObject({
      filter_field: 'description',
      allowlist: '#family',
      label: '/local/demo/ben.png',
    });
    expect(blocksOf('calendar.work')[1]).toMatchObject({
      filter_field: 'description',
      blocklist: '#family',
      replace_with: 'Busy',
      label: '/local/demo/ben.png',
    });
    expect(blocksOf('calendar.family')[0]).toMatchObject({
      allowlist: 'birthday',
      replace_pattern: "🎂 |'s birthday",
      label: '🎂',
    });
    expect(blocksOf('calendar.family')[1]).toMatchObject({ blocklist: 'birthday' });
    expect(blocksOf('calendar.trash_pickup')[0]).toMatchObject({
      replace_pattern: '🗑️ ',
      allday_expires_at: '11:00',
      label: '🗑️',
    });
    expect(GUIDE_CONFIG).toMatchObject({
      view: 'list',
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      event_background_opacity: 20,
      list: { today_indicator_position: '50% 8%' },
      allday_badge: 'title',
      allday_badge_style: 'filled',
      show_single_allday_time: false,
      show_location_allday: false,
      today_indicator: 'Today',
      today_indicator_size: '13px',
    });

    // 🚨 The page's legend is the COLOR, not the shape: a gold capsule is the family's only
    // because each pill takes its own calendar's accent. `allday_badge_color` decides that,
    // and the page relies on its DEFAULT rather than writing it out -- so a change of that
    // default would draw every pill alike and silently retire the whole guide, with its YAML
    // untouched and every other assertion here still passing.
    //
    // 🚨 Resolved through `buildConfig`, which performs the card's own merge, and NOT by
    // handing `GUIDE_CONFIG.allday_badge_color` to the resolver directly. The guide omits the
    // key, so the direct form passes `undefined` and asserts `DEFAULT_ALLDAY_BADGE_COLOR` in
    // `helpers.ts` -- the resolver's fallback for an absent value, which is a different
    // constant from `DEFAULT_CONFIG.allday_badge_color` in `config.ts` and is not the one the
    // card reads. Written that way first, it survived flipping the card's default to `text`
    // and proved nothing at all. The merge is what makes this falsifiable.
    expect(
      Helpers.resolveAlldayBadgeColor(
        buildConfig(GUIDE_CONFIG as unknown as Partial<Types.Config>).allday_badge_color,
      ),
    ).toEqual({ source: 'accent' });
  });

  it('draws every event exactly once, under the block the page assigns it', async () => {
    // The page's central claim: "Nothing is drawn twice, because within each calendar the
    // blocks claim disjoint sets of events." Asserted as a whole set rather than as a count,
    // so a duplicate and a disappearance are different failures with different diffs.
    const rows = await drawn();
    expect(rows.map((r) => `${r.title} <- ${r.entity}`).sort()).toEqual(
      [
        'Haircut 💇‍♀️ <- calendar.anna',
        'Bike ride 🚴 <- calendar.ben',
        'Music class 🥁 <- calendar.leo',
        'Team offsite <- calendar.work',
        'Busy <- calendar.work',
        'Busy <- calendar.work',
        'Grandma (70) <- calendar.family',
        '🧳 Grandma & Grandpa visiting <- calendar.family',
        'Trash collection <- calendar.trash_pickup',
      ].sort(),
    );

    // Every event supplied is accounted for: 9 payload events, 9 rows. A partition that
    // started dropping one would still satisfy a "no duplicates" check on its own.
    const supplied = Object.values(PAYLOAD).flat().length;
    expect(rows).toHaveLength(supplied);
  });

  it("turns 🎂 Grandma's birthday into the name and the age, under the cake", async () => {
    // "What the grid shows as 🎂 Grandma's birthday (70) reads here as 🎂 Grandma (70), with
    // the cake as its label."
    const rows = await drawn();
    const birthday = rows.filter((r) => r.title.startsWith('Grandma ('));
    expect(birthday).toHaveLength(1);
    expect(birthday[0].title).toBe('Grandma (70)');
    expect(birthday[0].label).toBe('🎂');
    expect(rows.some((r) => /birthday|🎂/i.test(r.title))).toBe(false);

    // The control is the grid's own wording. Take the pattern off the birthday block and the
    // row reads exactly what both pages quote the grid as showing, so the two pages are
    // describing one event and the rewrite is the only difference between them.
    const unrewritten = (
      await drawn({
        entities: withoutKey((b) => b.allowlist === 'birthday', 'replace_pattern'),
      } as unknown as Partial<Types.Config>)
    ).filter((r) => r.entity === 'calendar.family' && r.label === '🎂');
    expect(unrewritten.map((r) => r.title)).toEqual(["🎂 Grandma's birthday (70)"]);
    for (const page of [GRID_GUIDE, AGENDA_GUIDE]) {
      expect(readFileSync(page, 'utf8')).toContain("_🎂 Grandma's birthday (70)_");
    }
  });

  it('moves the collection emoji into the label, and retires the row at 11:00', async () => {
    // Two arms against one payload. The first is the control: at 10:00 the event must be on
    // the card, so a disappearance in the second arm cannot be read off a fixture that never
    // showed it. `allday_expires_at: '11:00'` is the only thing separating them.
    const present = await drawn();
    const collection = present.filter((r) => r.entity === 'calendar.trash_pickup');
    expect(collection.map((r) => [r.title, r.label])).toEqual([['Trash collection', '🗑️']]);

    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
    const afterCollection = await drawn();
    expect(afterCollection.some((r) => r.entity === 'calendar.trash_pickup')).toBe(false);

    // The family calendar's all-day events are the second control: all-day on the same day,
    // with no `allday_expires_at`, so they must survive the clock moving. Without them, an
    // arm that hid every all-day event would pass.
    expect(afterCollection.some((r) => r.title === 'Grandma (70)')).toBe(true);
    expect(afterCollection.some((r) => r.title === '🧳 Grandma & Grandpa visiting')).toBe(true);
  });

  it('keeps a work title only when the description carries the marker', async () => {
    const rows = (await drawn()).filter((r) => r.entity === 'calendar.work');

    // The allowlist half keeps the real title; the blocklist half overrides every title.
    expect(rows.filter((r) => r.title === 'Team offsite')).toHaveLength(1);
    expect(rows.some((r) => r.title.includes('Design review'))).toBe(false);
    expect(rows.some((r) => r.title.includes('Roadmap review'))).toBe(false);

    // "An event with no description at all counts as not matching, so an allowlist drops it
    // and a blocklist keeps it." Two Busy rows: the one with a private description and the
    // one carrying no description at all. One row here would mean the tip is wrong in the
    // damaging direction — an event silently visible to nobody.
    expect(rows.filter((r) => r.title === 'Busy')).toHaveLength(2);

    // "A Busy row then says who is busy without saying what with": both halves carry Ben's
    // face, so the marker changes the title and nothing else.
    expect(rows.map((r) => r.label)).toEqual(Array(3).fill('/local/demo/ben.png'));
  });

  it("draws a plan on two people's calendars once, as filter_duplicates promises", async () => {
    // "The zoo trip on Thursday is on Ben's and Leo's [...] filter_duplicates: true draws it
    // once, with every face in front of the title, and duplicate_accent_color colors it the
    // Family calendar's gold." The same event goes on both calendars; the control proves the
    // merge is filter_duplicates and not the fixture.
    const zoo = {
      summary: 'Zoo 🦒',
      location: 'City Zoo',
      start: { dateTime: '2026-06-17T16:30:00Z' },
      end: { dateTime: '2026-06-17T18:00:00Z' },
    };
    PAYLOAD['calendar.ben'].push(zoo);
    PAYLOAD['calendar.leo'].push({ ...zoo });
    try {
      const merged = (await drawn()).filter((r) => r.title === 'Zoo 🦒');
      expect(merged).toHaveLength(1);
      expect(merged[0].entity).toBe('calendar.ben');
      // Two distinct calendars, which is what `duplicate_accent_color` keys on: a merge
      // between blocks of one calendar keeps that calendar's color.
      expect(merged[0].mergedFrom).toEqual(['calendar.ben', 'calendar.leo']);

      const unmerged = (await drawn({ filter_duplicates: false } as Partial<Types.Config>)).filter(
        (r) => r.title === 'Zoo 🦒',
      );
      expect(unmerged).toHaveLength(2);
    } finally {
      PAYLOAD['calendar.ben'].pop();
      PAYLOAD['calendar.leo'].pop();
    }
  });

  it('keeps the work calendar off the weekend', async () => {
    // The page sets `days_of_week: weekdays` on both work blocks: "A work calendar that keeps
    // talking on Sunday is noise on a family screen." The documented `days_to_show: 3` runs
    // Wed–Fri and never reaches a weekend, so this arm widens the window to Saturday. That is
    // a deviation from the page's value, stated here rather than silently made, because the
    // option is otherwise untestable from this fixture.
    const saturday = {
      summary: 'Weekend on-call',
      description: 'confidential',
      start: { dateTime: '2026-06-20T09:00:00Z' },
      end: { dateTime: '2026-06-20T10:00:00Z' },
    };
    PAYLOAD['calendar.work'].push(saturday);
    try {
      const rows = await drawn({ days_to_show: 4 } as Partial<Types.Config>);
      expect(rows.some((r) => r.title === 'Weekend on-call')).toBe(false);
      expect(rows.filter((r) => r.title === 'Busy')).toHaveLength(2);

      // Control: the same event on the same Saturday reaches the card once the restriction is
      // lifted, so the assertion above is about `days_of_week` and not about the window.
      const unrestricted = GUIDE_ENTITIES.map((block) => {
        const copy = { ...block };
        delete copy.days_of_week;
        return copy;
      });
      const widened = await drawn({
        days_to_show: 4,
        entities: unrestricted,
      } as unknown as Partial<Types.Config>);
      expect(widened.filter((r) => r.title === 'Busy')).toHaveLength(3);
    } finally {
      PAYLOAD['calendar.work'].pop();
    }
  });
});
