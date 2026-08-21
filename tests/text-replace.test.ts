/**
 * Per-calendar text replacement, end to end (#153, #212, #186).
 *
 * Three properties make a naive file here prove nothing, and each shaped what is below.
 *
 * **The suite is built from default config, and every one of these keys defaults to
 * absent.** An option that renders nothing until it is set is invisible to every other
 * test in the repository — `AGENTS.md` records four branches missed exactly that way — so
 * every case here sets the keys it means to exercise, and the no-op cases assert the
 * *absence* of a change rather than assuming it.
 *
 * **Two of the three keys are independently optional, and the four combinations mean four
 * different things.** Delete, replace, replace-the-whole-field and do-nothing are one
 * feature only if all four are pinned; testing the middle two would leave the shape that
 * forced this design — the editor cannot store an empty string, so an absent value is the
 * only way to say "remove this" — completely uncovered.
 *
 * **The read side and the write side are different objects**, as with the age marker one
 * file over. The rewrite is applied to the display copy `groupEventsByDay` builds, never
 * to the cached event, so the assertions that matter are the ones proving the *raw* event
 * is untouched: that the filters still see what the calendar delivered, and that rendering
 * the same payload twice does not compound the rewrite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import * as Logger from '../src/utils/logger';

const ENTITY = 'calendar.personal';

/**
 * Frozen for every case in the file, not only the ones that ask.
 *
 * The fixtures below sit on a fixed date, and `show_past_events` defaults to `false` — so
 * without this the whole file quietly renders empty days instead of events and every
 * assertion fails for a reason that has nothing to do with the feature.
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * One timed event on the frozen day, carrying whichever fields a case needs.
 *
 * @param fields - Title, location and description as the calendar delivers them
 * @returns One raw event
 */
function event(fields: {
  summary?: string;
  location?: string;
  description?: string;
}): Types.CalendarEventData {
  return {
    start: { dateTime: '2026-06-17T14:00:00Z' },
    end: { dateTime: '2026-06-17T15:00:00Z' },
    _entityId: ENTITY,
    ...fields,
  };
}

/** An all-day event, which is the shape a recurring birthday takes. */
function allDay(fields: { summary?: string; description?: string }): Types.CalendarEventData {
  return {
    start: { date: '2026-06-17' },
    end: { date: '2026-06-18' },
    _entityId: ENTITY,
    ...fields,
  };
}

/**
 * The display copy the card would draw for one raw event under one calendar's settings.
 *
 * @param raw - The event as delivered
 * @param entity - The calendar's own settings, minus its id
 * @param overrides - Card-level configuration for the case
 * @returns The single display copy
 */
function drawn(
  raw: Types.CalendarEventData,
  entity: Partial<Types.EntityConfig> = {},
  overrides: Partial<Types.Config> = {},
): Types.CalendarEventData {
  const config = buildConfig({
    days_to_show: 7,
    entities: [{ entity: ENTITY, ...entity }],
    ...overrides,
  });

  const events = groupEventsByDay([raw], config, true, 'en').flatMap((day) => day.events);

  expect(events).toHaveLength(1);
  return events[0];
}

describe('the four combinations of pattern and replacement', () => {
  const TITLE = 'Geburtstag von Hans Müller';

  /**
   * 🚨 The row that forces the whole design. `isSet` in `rendering/editor/synthetic.ts`
   * counts the empty string as unset and the entity write path drops any key failing it,
   * so `replace_with: ''` is unreachable from the visual editor. Deleting a match has to
   * be spelled by *omitting* the replacement or #153's own first example — strip
   * `Geburtstag von ` off a birthday — is available only to people hand-editing YAML.
   */
  it('removes the match when only a pattern is set (#153 ex.1)', () => {
    expect(drawn(event({ summary: TITLE }), { replace_pattern: 'Geburtstag von ' }).summary).toBe(
      'Hans Müller',
    );
  });

  it('replaces the match when both are set (#153 ex.2)', () => {
    expect(
      drawn(event({ summary: 'micth frei:' }), {
        replace_pattern: 'micth frei:',
        replace_with: 'freier tag',
      }).summary,
    ).toBe('freier tag');
  });

  it('replaces the whole field when only a replacement is set (#212)', () => {
    expect(drawn(event({ summary: 'Therapy appointment' }), { replace_with: 'Busy' }).summary).toBe(
      'Busy',
    );
  });

  it('does nothing when neither is set', () => {
    // The denominator for the three above: naming a field is not an instruction, so this
    // has to leave the title exactly as delivered. Without it, an implementation that
    // blanked the field whenever `replace_field` was present would pass every other case
    // in this block.
    expect(drawn(event({ summary: TITLE }), { replace_field: 'title' }).summary).toBe(TITLE);
  });

  it('treats an empty pattern from YAML as no pattern at all', () => {
    // Reachable only by hand-editing, and it has to agree with the editor, which cannot
    // produce it. Read literally, an empty global pattern matches at every position and
    // would splice the replacement between every pair of characters.
    expect(
      drawn(event({ summary: 'Therapy' }), { replace_pattern: '', replace_with: 'Busy' }).summary,
    ).toBe('Busy');
  });
});

describe('what the pattern matches', () => {
  it('replaces every occurrence, not just the first (#212, @Tom-10101)', () => {
    // The case the reporter actually has: a generated title with a fragment repeated in
    // it. A first-match replace leaves the second copy behind and looks half-broken.
    expect(
      drawn(event({ summary: '[AUTO] Standup [AUTO] daily' }), {
        replace_pattern: '\\[AUTO\\] ',
      }).summary,
    ).toBe('Standup daily');
  });

  it('matches whatever the case', () => {
    // Consistent with `blocklist`, `allowlist` and `remove_location_country`, all three of
    // which compile with `i`. A pattern lifted from one of those and silently doing
    // nothing here is the worse failure, because nothing reports it.
    expect(
      drawn(event({ summary: 'PRIVATE: dentist' }), { replace_pattern: 'private: ' }).summary,
    ).toBe('dentist');
  });

  it('leaves the text alone when the pattern matches nothing', () => {
    expect(
      drawn(event({ summary: 'Standup' }), {
        replace_pattern: 'Retro',
        replace_with: 'Review',
      }).summary,
    ).toBe('Standup');
  });

  it('substitutes a capture group', () => {
    // Falls out of `String.replace` rather than being built, and #153 asked for "title
    // replace with regex" — so someone will reach for it. Pinned so a future refactor to
    // a literal replacement cannot silently drop it.
    expect(
      drawn(event({ summary: 'Geburtstag von Hans Müller' }), {
        replace_pattern: 'Geburtstag von (.+)',
        replace_with: '$1 🎂',
      }).summary,
    ).toBe('Hans Müller 🎂');
  });
});

describe('which field is rewritten', () => {
  const RAW = { summary: 'Standup', location: 'Room 4.02', description: 'Bring the notes' };

  it('rewrites the title by default', () => {
    const shown = drawn(event(RAW), { replace_with: 'Busy' }, { show_description: true });

    expect(shown.summary).toBe('Busy');
    // The other two are the discriminator: an implementation ignoring `replace_field`
    // entirely would rewrite all three and still pass an assertion about the title.
    expect(shown.location).toBe('Room 4.02');
    expect(shown.description).toBe('Bring the notes');
  });

  it('rewrites the location when asked, and nothing else', () => {
    const shown = drawn(
      event(RAW),
      { replace_field: 'location', replace_with: 'Zoom call' },
      { show_description: true },
    );

    expect(shown.location).toBe('Zoom call');
    expect(shown.summary).toBe('Standup');
    expect(shown.description).toBe('Bring the notes');
  });

  it('rewrites the description when asked, and nothing else', () => {
    const shown = drawn(
      event(RAW),
      { replace_field: 'description', replace_with: 'Hidden' },
      { show_description: true },
    );

    expect(shown.description).toBe('Hidden');
    expect(shown.summary).toBe('Standup');
    expect(shown.location).toBe('Room 4.02');
  });

  it('answers #186 — a URL in the location becomes a name', () => {
    // The half of #186 the two-block `show_location: false` pattern could not serve: the
    // reporter asked to *replace* the value, not only to hide it.
    expect(
      drawn(event({ summary: 'Sync', location: 'https://zoom.us/j/9876543210' }), {
        replace_field: 'location',
        replace_pattern: 'https://zoom\\.us/\\S+',
        replace_with: 'Zoom call',
      }).location,
    ).toBe('Zoom call');
  });

  it('never gives an event a field it did not have', () => {
    // Whole-field replacement rewrites text that exists. Without this guard a bare
    // `replace_with` on the location grows a location row on every event on the calendar,
    // which reads as a rendering bug rather than as a configuration mistake.
    const shown = drawn(
      event({ summary: 'Standup' }),
      { replace_field: 'location', replace_with: 'Somewhere' },
      { show_description: true },
    );

    expect(shown.location).toBe('');
    expect(shown.description).toBe('');
  });
});

describe('ordering against the formatting the card already does', () => {
  it('rewrites a location after the country has been stripped', () => {
    // `remove_location_country` is end-anchored and does its own trailing-comma cleanup,
    // so it has to run first — a rewrite that moved the end of the string would leave it
    // matching nothing. Pinned in the form that fails if the two are swapped: the pattern
    // below is anchored at the end and only matches once the country is gone.
    expect(
      drawn(
        event({ summary: 'Sync', location: 'Hauptstraße 1, Berlin, Germany' }),
        { replace_field: 'location', replace_pattern: ', Berlin$', replace_with: '' },
        { remove_location_country: true },
      ).location,
    ).toBe('Hauptstraße 1');
  });

  it('rewrites a description after its HTML has been flattened', () => {
    // Google Calendar's editor emits markup the row never shows. A pattern written
    // against what the user sees must not have to know about `<b>` or `&nbsp;`.
    //
    // Both halves of the fixture are load-bearing. The tags have to be gone for
    // `the retro notes` to be contiguous text at all, and `&nbsp;` has to have been
    // decoded for `\s` to match it — decoding leaves U+00A0, which `\s` matches and a
    // literal space does not, so a pattern written with an ordinary space here would
    // silently match nothing. The same asymmetry `event-age.ts` documents for its marker.
    expect(
      drawn(
        event({ summary: 'Sync', description: 'Bring&nbsp;the <b>retro</b> notes' }),
        {
          replace_field: 'description',
          replace_pattern: 'Bring\\s+the retro notes',
          replace_with: 'Done',
        },
        { show_description: true },
      ).description,
    ).toBe('Done');
  });

  it('rewrites a description after the age marker has been removed', () => {
    // The marker is card syntax rather than content, so a user's pattern should never
    // have to account for it — and `.*` here would otherwise capture it.
    expect(
      drawn(
        allDay({ summary: 'Annas Geburtstag', description: 'Geboren YEAR=1976 in Berlin' }),
        { replace_field: 'description', replace_pattern: 'Geboren (.+)', replace_with: '$1' },
        { show_description: true },
      ).description,
    ).toBe('in Berlin');
  });
});

describe('the age count from #124', () => {
  const BIRTHDAY = { summary: 'Annas Geburtstag', description: 'YEAR=1976' };

  it('is appended to a title the pattern merely edited (#153 ex.1)', () => {
    // The case that must keep working: stripping a prefix off a birthday is #153's own
    // example, and the person is still forty. Suppressing here would break the feature
    // the suppression exists to protect.
    expect(drawn(allDay(BIRTHDAY), { replace_pattern: ' Geburtstag' }).summary).toBe('Annas (50)');
  });

  it('is suppressed when the whole title was replaced (#212)', () => {
    // The privacy case. `Busy (40)` announces that the hidden event is a birthday, which
    // is precisely what the reporter asked to be spared.
    expect(drawn(allDay(BIRTHDAY), { replace_with: 'Busy' }).summary).toBe('Busy');
  });

  it('is suppressed when a pattern emptied the title', () => {
    // `appendAgeCount` deliberately returns a bare `(40)` for an event with no title,
    // which is right for an untitled event and a leak after a deliberate deletion — and
    // louder than `Busy (40)`, since a lone bracketed number is nothing else.
    expect(drawn(allDay(BIRTHDAY), { replace_pattern: '.+' }).summary).toBe('');
  });

  it('still appends when the rewrite targets another field', () => {
    // The discriminator for the two suppression cases above: a rewrite of the *location*
    // says nothing about the title, so an implementation suppressing on any configured
    // rewrite at all would fail here.
    expect(
      drawn(
        allDay(BIRTHDAY),
        { replace_field: 'location', replace_with: 'Elsewhere' },
        { show_description: true },
      ).summary,
    ).toBe('Annas Geburtstag (40)');
  });
});

describe('a pattern that does not compile', () => {
  it('leaves the text untouched and warns once', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

    // Unclosed group. A broken pattern should cost the user their rewrite, never their
    // content — the same bargain an uncompilable `blocklist` strikes by leaving the event
    // list alone rather than emptying it.
    const broken = { replace_pattern: '([unclosed', replace_with: 'Busy' };

    expect(drawn(event({ summary: 'Standup' }), broken).summary).toBe('Standup');
    expect(drawn(event({ summary: 'Retro' }), broken).summary).toBe('Retro');

    // Once, not once per event per render. The compile cache is what makes that true, and
    // without it this runs on every row of every frame.
    const ours = warn.mock.calls.filter((call) => String(call[0]).includes('replace_pattern'));
    expect(ours).toHaveLength(1);
    expect(String(ours[0][0])).toContain('not a valid regular expression');
  });
});

describe('the rewrite reaches the display copy and nothing else', () => {
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

  let instance = 0;

  function hassReturning(events: unknown[]): Types.Hass {
    return {
      states: {},
      callService: () => {},
      locale: { language: 'en' },
      callApi: async (_method: string, path: string) =>
        path.startsWith('calendars/') ? events : [],
    } as unknown as Types.Hass;
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not compound when the same payload is rendered twice', () => {
    // The failure this rules out is mutation of the cached event. Rendering is not a
    // one-shot: the card regroups the same `this.events` on every width change, expand
    // and refresh, so a rewrite written back to the raw event would stack.
    const raw = [event({ summary: 'aaa' })];
    const config = buildConfig({
      days_to_show: 7,
      entities: [{ entity: ENTITY, replace_pattern: 'a', replace_with: 'aa' }],
    });

    const once = groupEventsByDay(raw, config, true, 'en').flatMap((d) => d.events)[0].summary;
    const twice = groupEventsByDay(raw, config, true, 'en').flatMap((d) => d.events)[0].summary;

    expect(once).toBe('aaaaaa');
    expect(twice).toBe(once);
    expect(raw[0].summary).toBe('aaa');
  });

  it('cannot change which events the filters keep', () => {
    // The property `filterSubject` exists to hold: filtering reads the event as delivered,
    // in `processEvents`, before any display copy is made. A rewrite that ran first would
    // let a *display* option decide which events exist — here, blocking `Standup` after
    // renaming it to `Busy` would keep the event instead of dropping it.
    const raw = [
      { summary: 'Standup', ...event({}) },
      { summary: 'Retro', ...event({}) },
    ];

    return fetchEventData(
      hassReturning(raw),
      buildConfig({
        days_to_show: 7,
        entities: [{ entity: ENTITY, blocklist: 'Standup', replace_with: 'Busy' }],
      }) as Types.Config,
      `text-replace-${instance++}`,
    ).then((result) => {
      const config = buildConfig({
        days_to_show: 7,
        entities: [{ entity: ENTITY, blocklist: 'Standup', replace_with: 'Busy' }],
      });

      const titles = groupEventsByDay(result.events, config, true, 'en')
        .flatMap((day) => day.events)
        .filter((e) => !e._isEmptyDay)
        .map((e) => e.summary);

      // One event survived the blocklist, and it is the rewritten Retro. Two would mean
      // the rewrite had run before the filter and hidden `Standup` from it.
      expect(titles).toEqual(['Busy']);
    });
  });

  it('leaves an empty-day placeholder alone', () => {
    // Placeholders are card text rather than calendar text, and they carry no
    // `_matchedConfig` and an entity id no configuration can match — so the rewrite is
    // structurally unable to reach them. Pinned because that is a property of two other
    // functions rather than of this one.
    const config = buildConfig({
      days_to_show: 2,
      show_empty_days: true,
      entities: [{ entity: ENTITY, replace_with: 'Busy' }],
    });

    const days = groupEventsByDay([], config, true, 'en').flatMap((day) => day.events);

    expect(days.length).toBeGreaterThan(0);
    expect(days.every((day) => day._isEmptyDay)).toBe(true);
    expect(days.map((day) => day.summary)).not.toContain('Busy');
  });
});
