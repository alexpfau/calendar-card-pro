/**
 * `filter_field` decides which part of an event `blocklist` and `allowlist` read.
 *
 * The option is an **out-of-band mode flag**, and deliberately not a widening of the
 * pattern grammar. `blocklist` and `allowlist` are documented as arbitrary RegExp and
 * reach `new RegExp()` unnormalized, so there is no character and no token left free to
 * carry a second meaning: a `location:` prefix collides with the legal pattern for a title
 * containing that text, and so does any sentinel. A separate key collides with nothing,
 * which is why the grammar is untouched here and asserted to stay that way.
 *
 * Two properties carry the feature, and neither implies the other:
 *
 * - **The default is today's behavior, exactly.** Unset means the title, so every card
 *   already in the wild renders unchanged. Every case below that means to test a field
 *   sets the key, because the suite is built from `DEFAULT_CONFIG` and an option whose
 *   default is `title` is otherwise invisible to it.
 * - **Allow and block are exact complements on any field**, including for an event that
 *   does not carry that field at all. That is what makes the two-block pattern behind #205
 *   a partition: the same calendar listed twice, once each way, yields every event exactly
 *   once, so a user can give Teams calls one icon and everything else another without
 *   losing or doubling a row.
 *
 * The subject is read from the event as the calendar delivered it, before
 * `groupEventsByDay` makes the display copies. `tests/filter-field-raw-subject.test.ts`
 * would be the wrong shape for that — it is asserted here, at the end, because the failure
 * it guards against is a *display* switch silently deciding which events exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';

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
 * A timed event carrying whichever of the three fields a case needs.
 *
 * @param summary - Event title
 * @param hour - Start hour on the frozen day
 * @param extra - `location` and/or `description`, where the case uses them
 * @returns One event as Home Assistant returns it
 */
function event(
  summary: string,
  hour: number,
  extra: { location?: string; description?: string } = {},
) {
  return {
    summary,
    start: { dateTime: `2026-06-17T${String(hour).padStart(2, '0')}:00:00Z` },
    end: { dateTime: `2026-06-17T${String(hour + 1).padStart(2, '0')}:00:00Z` },
    ...extra,
  };
}

/**
 * The payload every case draws from.
 *
 * Built so that no two fields agree about any event, which is the only way a test can tell
 * `location` from `title`: each event's title, location and description name a *different*
 * one of the three, so a filter reading the wrong field returns a visibly different set
 * rather than the same one by luck.
 */
const STANDUP = event('Standup', 9, {
  location: 'Microsoft Teams Meeting',
  description: 'Bring the retro notes',
});
const REVIEW = event('Design review', 11, {
  location: 'Room 4.02',
  description: 'Standup follow-up, join at teams.microsoft.com later',
});
const LUNCH = event('Lunch', 12, { location: 'Canteen' });
const RETRO = event('Retro', 14, {
  location: 'Microsoft Teams Meeting',
  description: 'Room 4.02 is booked as backup',
});

const ALL = [STANDUP, REVIEW, LUNCH, RETRO];

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => (path.startsWith('calendars/') ? events : []),
  } as unknown as Types.Hass;
}

let instance = 0;

/**
 * Titles the card would draw, in order, for one payload and one configuration.
 *
 * Runs the real path — `fetchEventData` then `groupEventsByDay` — rather than calling the
 * filter directly, so a change that moves the filter to a stage where a display option has
 * already rewritten its subject fails here.
 *
 * @param events - Payload the calendar returns
 * @param overrides - Card configuration under test
 * @returns Each drawn event's title
 */
async function shown(events: unknown[], overrides: Partial<Types.Config>): Promise<string[]> {
  const config = buildConfig(overrides) as Types.Config;
  const result = await fetchEventData(hassReturning(events), config, `filter-field-${instance++}`);

  return groupEventsByDay(result.events, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => event.summary || '(untitled)');
}

/**
 * One calendar filtering one field one way.
 *
 * @param list - Which list to set
 * @param pattern - The pattern
 * @param field - Field to match against, or unset for the default
 * @returns A card configuration
 */
function block(
  list: 'allowlist' | 'blocklist',
  pattern: string,
  field?: Types.FilterField,
): Partial<Types.Config> {
  return {
    entities: [
      { entity: 'calendar.work', [list]: pattern, ...(field ? { filter_field: field } : {}) },
    ],
  };
}

describe('filter_field', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads a different set of events out of each of the three fields', async () => {
    // One pattern, three fields, four arms. `Room 4.02` appears in a different event's
    // location than description, and in no title at all, so each arm must return a
    // *different* set — an implementation that ignored the option entirely would return
    // the unfiltered arm three times, and one that read a fixed wrong field would return
    // one arm's answer twice.
    await expect(
      Promise.all([
        shown(ALL, { entities: ['calendar.work'] }),
        shown(ALL, block('allowlist', 'Room 4\\.02')),
        shown(ALL, block('allowlist', 'Room 4\\.02', 'location')),
        shown(ALL, block('allowlist', 'Room 4\\.02', 'description')),
      ]),
    ).resolves.toEqual([
      ['Standup', 'Design review', 'Lunch', 'Retro'],
      // No title contains it, so the title arm keeps nothing. This is the arm that proves
      // the other two are not simply passing everything through.
      [],
      ['Design review'],
      ['Retro'],
    ]);
  });

  it('matches the title when the option is unset, exactly as it always has', async () => {
    // The compatibility case, stated as an equality rather than as a separate expectation:
    // an unset `filter_field` and an explicit `title` must be the same card. Writing it
    // this way means a regression in either one fails, including the one where `title`
    // stops being an accepted value.
    const [implicit, explicit] = await Promise.all([
      shown(ALL, block('blocklist', 'Standup')),
      shown(ALL, block('blocklist', 'Standup', 'title')),
    ]);

    expect(implicit).toEqual(['Design review', 'Lunch', 'Retro']);
    expect(explicit).toEqual(implicit);
  });

  it.each([
    ['title', 'Standup', ['Standup']],
    ['location', 'Microsoft Teams', ['Standup', 'Retro']],
    ['description', 'retro notes', ['Standup']],
  ] as Array<[Types.FilterField, string, string[]]>)(
    'partitions the calendar exactly when %s is filtered both ways',
    async (field, pattern, allowed) => {
      // The property the two-block pattern behind #205 depends on, checked per field
      // rather than assumed from the title case. Allow and block must be complements over
      // the *whole* payload — union is everything, intersection is nothing — so listing
      // one calendar twice loses no event and doubles none.
      const [allow, blocked] = await Promise.all([
        shown(ALL, block('allowlist', pattern, field)),
        shown(ALL, block('blocklist', pattern, field)),
      ]);

      expect(allow).toEqual(allowed);
      expect([...allow, ...blocked].sort()).toEqual(
        ['Standup', 'Design review', 'Lunch', 'Retro'].sort(),
      );
      expect(allow.filter((title) => blocked.includes(title))).toEqual([]);
    },
  );

  it('treats an event that lacks the field the way it has always treated an untitled one', async () => {
    // `Lunch` carries no description at all. The established rule for a missing subject is
    // the one the title filter has always applied to an event with no summary — an
    // allowlist drops it, a blocklist keeps it — and it is what makes the partition above
    // hold for events that do not carry the field. Anything else silently strands such an
    // event in both blocks or in neither.
    await expect(
      Promise.all([
        shown(ALL, block('allowlist', '.', 'description')),
        shown(ALL, block('blocklist', 'nothing-matches-this', 'description')),
      ]),
    ).resolves.toEqual([
      ['Standup', 'Design review', 'Retro'],
      ['Standup', 'Design review', 'Lunch', 'Retro'],
    ]);
  });

  it('leaves the pattern grammar alone, so a field name is still only text', async () => {
    // The design decision, made falsifiable. An in-band syntax would have had to give
    // `location:` a meaning, and this calendar's title genuinely contains that string. If
    // anyone ever reaches for a prefix or a sentinel, this fails.
    const events = [event('Book location: Room 4.02', 9), event('Standup', 10)];

    await expect(shown(events, block('allowlist', 'location:'))).resolves.toEqual([
      'Book location: Room 4.02',
    ]);
  });

  it('reads the event as delivered, not as the card will draw it', async () => {
    // 🚨 The stage assertion, and the reason it matters: the display copies are made later,
    // in `groupEventsByDay`, where `show_description: false` blanks the description
    // outright. Filtering the drawn text would let a display switch decide which events
    // *exist* — every `description` allowlist would match nothing the moment descriptions
    // were hidden. Both arms must agree.
    const [visible, hidden] = await Promise.all([
      shown(ALL, { ...block('allowlist', 'retro notes', 'description'), show_description: true }),
      shown(ALL, { ...block('allowlist', 'retro notes', 'description'), show_description: false }),
    ]);

    expect(visible).toEqual(['Standup']);
    expect(hidden).toEqual(visible);
  });

  it('matches the description before its HTML is stripped', async () => {
    // The same stage question from the other side. Google Calendar delivers HTML in the
    // description and the card flattens it with `stripHtmlTags` for display only, so a
    // pattern written against the raw text is the one that works — and a filter that ran
    // after the flattening would answer differently for a pattern touching a tag.
    const events = [
      event('Kickoff', 9, { description: '<a href="https://zoom.us/j/123">Join</a>' }),
      event('Standup', 10, { description: 'No link here' }),
    ];

    await expect(shown(events, block('allowlist', 'href', 'description'))).resolves.toEqual([
      'Kickoff',
    ]);
  });

  it('keeps each block of a duplicated calendar on its own field', async () => {
    // The whole point of the feature, end to end: one calendar listed twice, split by
    // location, each block filtering independently. This is the configuration the editor's
    // **Duplicate** action produces, and #205's own suggested mechanism.
    await expect(
      shown(ALL, {
        entities: [
          { entity: 'calendar.work', allowlist: 'Microsoft Teams', filter_field: 'location' },
          { entity: 'calendar.work', blocklist: 'Microsoft Teams', filter_field: 'location' },
        ],
        filter_duplicates: false,
      }),
    ).resolves.toEqual(['Standup', 'Design review', 'Lunch', 'Retro']);
  });

  it('applies one field per block, not several', async () => {
    // Stated because the option's name does not rule it out. Setting `location` stops the
    // title being read — the patterns move, they do not accumulate — so a title pattern on
    // a location block matches nothing. Filtering two fields is two blocks, which is the
    // case above.
    await expect(shown(ALL, block('allowlist', 'Standup', 'location'))).resolves.toEqual([]);
  });

  it('leaves the calendar untouched when the pattern will not compile', async () => {
    // Unchanged behavior, re-checked on a new field: an invalid RegExp warns and filters
    // nothing, rather than emptying the card. A user mid-edit in the YAML editor sees
    // their events, not a blank card.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(shown(ALL, block('allowlist', '[unclosed', 'location'))).resolves.toEqual([
      'Standup',
      'Design review',
      'Lunch',
      'Retro',
    ]);

    warn.mockRestore();
  });
});
