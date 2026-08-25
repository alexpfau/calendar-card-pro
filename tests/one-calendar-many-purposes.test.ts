/**
 * The flagship guide's worked example, run through the real pipeline.
 *
 * `docs/guide/one-calendar-many-purposes.md` is the page the README and both "What's New"
 * surfaces point at to explain what v4.1 is for. It is also the only place in the docs that
 * combines seven per-calendar blocks with the card-level all-day options, and it makes
 * specific, checkable promises about what the card draws: that a birthday reads `Lena (32)`,
 * that bin day retires at 11:00, that a work event without the marker reads `Busy`, and that
 * nothing is drawn twice.
 *
 * Nothing pinned any of that. `check:docs` validates that the option *names* in a yaml block
 * exist and that a block claiming to be a card has an `entities:` list — it never runs one.
 * So every claim on that page could go false from a source change with all nine gates green,
 * and the page is the first thing a new user is sent to.
 *
 * 🚨 **The config is read out of the page, not copied into this file.** A second copy is one
 * more thing to keep in step, and the bug being guarded against is precisely that the page
 * and the code drift apart — a copy here would keep passing while the published page went
 * wrong. Editing the yaml in the guide therefore changes what this suite asserts, which is
 * the intent: the page is the fixture.
 *
 * That makes the reader below a probe, and a probe that silently parses nothing would turn
 * every assertion into a vacuous pass. `readGuideConfig` therefore asserts its own
 * denominator first — seven blocks over four calendars, carrying the specific keys the page
 * teaches — so a shape change the reader cannot handle fails as a parse error rather than as
 * an empty card that happens to satisfy nothing.
 *
 * The parser understands only the subset the page uses: a flat mapping, plus an `entities:`
 * block sequence of flat mappings. It is deliberately not a YAML implementation, and it
 * rejects rather than guesses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';

const GUIDE = join(__dirname, '..', 'docs', 'guide', 'one-calendar-many-purposes.md');

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

/** `'11:00'` -> `11:00`, `false` -> `false`, `3` -> `3`. Quotes are the page's, not data. */
function scalar(raw: string): string | number | boolean {
  const value = raw
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^'(.*)'$/, '$1')
    .replace(/^"(.*)"$/, '$1');
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

/** Every ```yaml block on the page, in order. */
function yamlBlocks(): string[] {
  const text = readFileSync(GUIDE, 'utf8');
  return (text.match(/^```ya?ml\n[\s\S]*?^```/gm) || []).map((b) =>
    b.replace(/^```ya?ml\n/, '').replace(/```$/, ''),
  );
}

/**
 * The page's card, assembled the way the page tells the reader to assemble it: the full
 * example, plus the six card-level lines the second block says go "beside `days_to_show`,
 * above the `entities:` list".
 */
function readGuideConfig(): Record<string, unknown> {
  const blocks = yamlBlocks();
  const card = blocks.find((b) => /^type:\s*custom:calendar-card-pro$/m.test(b));
  expect(card, 'the guide no longer contains a complete card example').toBeDefined();

  const out: Record<string, unknown> = {};
  const entities: Array<Record<string, unknown>> = [];
  let inEntities = false;

  for (const line of (card as string).split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^entities:\s*$/.test(line)) {
      inEntities = true;
      continue;
    }
    if (!inEntities) {
      const top = line.match(/^([a-z_]+):\s*(.+)$/);
      if (top) out[top[1]] = scalar(top[2]);
      continue;
    }
    const item = line.match(/^\s*-\s+([a-z_]+):\s*(.+)$/);
    if (item) {
      entities.push({ [item[1]]: scalar(item[2]) });
      continue;
    }
    const field = line.match(/^\s+([a-z_]+):\s*(.+)$/);
    if (field) {
      expect(entities.length, `a field appeared before any entity: ${line}`).toBeGreaterThan(0);
      entities[entities.length - 1][field[1]] = scalar(field[2]);
      continue;
    }
    throw new Error(`the guide's yaml uses a shape this reader does not handle: ${line}`);
  }
  out.entities = entities;

  // The card-level block: the page presents it separately and tells the reader to merge it.
  const cardLevel = blocks.find((b) => /^allday_badge:/m.test(b) && !/^type:/m.test(b));
  expect(cardLevel, 'the guide no longer shows the card-level block').toBeDefined();
  for (const line of (cardLevel as string).split('\n')) {
    const top = line.match(/^([a-z_]+):\s*(.+)$/);
    if (top) out[top[1]] = scalar(top[2]);
  }
  return out;
}

const GUIDE_CONFIG = readGuideConfig();
const GUIDE_ENTITIES = GUIDE_CONFIG.entities as Array<Record<string, unknown>>;

/**
 * Events chosen so that every block on the page has something to claim and something to
 * reject, and so the two work blocks are separated only by the description marker.
 *
 * Times sit after `FROZEN_NOW` (10:00 on Wed 17 Jun 2026) unless a case is about the past:
 * `show_past_events` is off by default, and an event scheduled before the frozen instant is
 * hidden for that reason rather than by any filter on the page. Getting that wrong reads as
 * a filter defect, which is a trap this fixture is shaped to avoid.
 */
const PAYLOAD: Record<string, unknown[]> = {
  'calendar.family': [
    {
      summary: 'Birthday of Lena',
      description: 'YEAR=1994',
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
    },
    { summary: 'Recycling collection', start: { date: '2026-06-17' }, end: { date: '2026-06-18' } },
    {
      summary: 'Swimming lesson',
      start: { dateTime: '2026-06-17T16:00:00Z' },
      end: { dateTime: '2026-06-17T17:00:00Z' },
    },
  ],
  'calendar.ben': [
    {
      summary: 'Five-a-side',
      start: { dateTime: '2026-06-17T19:00:00Z' },
      end: { dateTime: '2026-06-17T20:00:00Z' },
    },
  ],
  'calendar.anna': [
    {
      summary: 'Book club',
      start: { dateTime: '2026-06-17T18:00:00Z' },
      end: { dateTime: '2026-06-17T19:00:00Z' },
    },
  ],
  'calendar.work': [
    {
      summary: 'School run — leaving early',
      description: 'fine to share #family',
      start: { dateTime: '2026-06-17T15:00:00Z' },
      end: { dateTime: '2026-06-17T15:30:00Z' },
    },
    {
      summary: '1:1 with Sarah — performance review',
      description: 'confidential',
      start: { dateTime: '2026-06-17T13:00:00Z' },
      end: { dateTime: '2026-06-17T13:30:00Z' },
    },
    // No `description` key at all — the case the page's "Why the Two Halves Add Up" tip is
    // about. It must land in the Busy block and only there.
    {
      summary: 'Quarterly planning with the board',
      start: { dateTime: '2026-06-17T11:00:00Z' },
      end: { dateTime: '2026-06-17T12:00:00Z' },
    },
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

/** What the card draws, as `title` paired with the block that claimed it. */
async function drawn(
  overrides: Partial<Types.Config> = {},
): Promise<Array<{ title: string; entity: string; label: string }>> {
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
    }));
}

describe('the One Calendar, Many Purposes example behaves as the page describes', () => {
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
    // The page says "Four calendars go into it, as seven blocks. The shared family calendar
    // is listed three times, and the work calendar twice." Pinned by value rather than by
    // walking what was parsed, so losing a block fails here instead of quietly shrinking
    // every assertion below it.
    expect(GUIDE_ENTITIES).toHaveLength(7);
    const byCalendar = GUIDE_ENTITIES.reduce<Record<string, number>>((acc, block) => {
      acc[String(block.entity)] = (acc[String(block.entity)] ?? 0) + 1;
      return acc;
    }, {});
    expect(byCalendar).toEqual({
      'calendar.family': 3,
      'calendar.ben': 1,
      'calendar.anna': 1,
      'calendar.work': 2,
    });

    // The options the page teaches, each on the block that teaches it. A page rewritten to
    // drop one of these is no longer the page this suite is describing.
    expect(GUIDE_ENTITIES[0]).toMatchObject({
      allowlist: 'Birthday of',
      replace_pattern: 'Birthday of ',
    });
    expect(GUIDE_ENTITIES[1]).toMatchObject({ event_type: 'all_day', allday_expires_at: '11:00' });
    expect(GUIDE_ENTITIES[2]).toMatchObject({ blocklist: 'Birthday of|collection' });
    expect(GUIDE_ENTITIES[3]).toMatchObject({ label: 'person.ben' });
    expect(GUIDE_ENTITIES[5]).toMatchObject({ filter_field: 'description', allowlist: '#family' });
    expect(GUIDE_ENTITIES[6]).toMatchObject({ filter_field: 'description', replace_with: 'Busy' });
    expect(GUIDE_CONFIG).toMatchObject({ allday_badge: 'title', allday_badge_style: 'filled' });
  });

  it('draws every event exactly once, under the block the page assigns it', async () => {
    // The page's central claim: "Nothing is drawn twice, because within each calendar the
    // blocks claim disjoint sets of events." Asserted as a whole set rather than as a count,
    // so a duplicate and a disappearance are different failures with different diffs.
    const rows = await drawn();
    expect(rows.map((r) => `${r.title} <- ${r.entity}`).sort()).toEqual(
      [
        'Lena (32) <- calendar.family',
        'Recycling collection <- calendar.family',
        'Swimming lesson <- calendar.family',
        'Five-a-side <- calendar.ben',
        'Book club <- calendar.anna',
        'School run — leaving early <- calendar.work',
        'Busy <- calendar.work',
        'Busy <- calendar.work',
      ].sort(),
    );

    // Every event supplied is accounted for: 8 payload events, 8 rows. A partition that
    // started dropping one would still satisfy a "no duplicates" check on its own.
    const supplied = Object.values(PAYLOAD).flat().length;
    expect(rows).toHaveLength(supplied);
  });

  it('turns "Birthday of Lena" into the name and the age, as the page promises', async () => {
    // "What was Birthday of Lena — All day becomes 🎂 Lena (32)."
    const rows = await drawn();
    const birthday = rows.filter((r) => r.title.startsWith('Lena'));
    expect(birthday).toHaveLength(1);
    expect(birthday[0].title).toBe('Lena (32)');
    expect(birthday[0].label).toBe('🎂');

    // Both halves are load-bearing and fail differently: without `replace_pattern` the row
    // still reads "Birthday of Lena", and without the YEAR marker it loses the "(32)".
    expect(rows.some((r) => r.title.includes('Birthday of'))).toBe(false);
  });

  it('keeps a work title only when the description carries the marker', async () => {
    const rows = (await drawn()).filter((r) => r.entity === 'calendar.work');

    // The allowlist half keeps the real title; the blocklist half overrides every title.
    expect(rows.filter((r) => r.title === 'School run — leaving early')).toHaveLength(1);
    expect(rows.some((r) => r.title.includes('performance review'))).toBe(false);
    expect(rows.some((r) => r.title.includes('Quarterly planning'))).toBe(false);

    // "An event with no description at all counts as not matching, so an allowlist drops it
    // and a blocklist keeps it." Two Busy rows: the confidential one and the one carrying no
    // description at all. One row here would mean the tip is wrong in the damaging direction
    // — an event silently visible to nobody.
    expect(rows.filter((r) => r.title === 'Busy')).toHaveLength(2);
  });

  it('retires bin day at allday_expires_at, and not before', async () => {
    // Two arms against one payload. The first is the control: at 10:00 the event must be on
    // the card, so a disappearance in the second arm cannot be read off a fixture that never
    // showed it. `allday_expires_at: '11:00'` is the only thing separating them.
    const present = await drawn();
    expect(present.some((r) => r.title === 'Recycling collection')).toBe(true);

    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
    const afterCollection = await drawn();
    expect(afterCollection.some((r) => r.title === 'Recycling collection')).toBe(false);

    // The birthday is the second control: it is all-day on the same calendar and the same
    // day, and it has no `allday_expires_at`, so it must survive the clock moving. Without
    // it, an arm that hid every all-day event would pass.
    expect(afterCollection.some((r) => r.title === 'Lena (32)')).toBe(true);
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
      expect(widened.some((r) => r.title === 'Busy')).toBe(true);
    } finally {
      PAYLOAD['calendar.work'].pop();
    }
  });
});
