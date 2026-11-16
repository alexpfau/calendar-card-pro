/**
 * Search finds a setting by the words people use for it (backlog item 316).
 *
 * The editor's search matches what a setting shows, its YAML key and its dropdown's options, so a
 * user's own word for it found nothing: "12h" (forum, "For family acceptance I need to have
 * 12H"), "hide past events" (forum, "I cannot find hide past events"), and the words of issue
 * titles such as "Sort events newest first" and "Exclude post based on words". A setting now
 * carries an `.aliases` string of such words, searched like its label and translated where a
 * language's words differ.
 *
 * Three things are pinned. The families by value against `strings.ts`, so an alias string that
 * appears or disappears fails here. Each family's words finding its setting as a jump-list row,
 * on the card or on a calendar. And each language searching its own words where it has them and
 * the English ones where it has none.
 */
import { describe, expect, it } from 'vitest';

import { searchIndex } from './helpers/search-index';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { parseFieldId } from '../src/rendering/editor/field-index';
import { search } from '../src/rendering/editor/search';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';

interface Family {
  /** The setting, as its form names it. */
  field: string;
  /** Where it is set: on the card, or in one calendar's form. */
  scope: 'card' | 'calendar';
  /** Users' words for it, none of which its label, helper or key contains. */
  queries: ReadonlyArray<string>;
}

/** Every alias string, by key, with the setting it must find. */
const FAMILIES: Readonly<Record<string, Family>> = {
  'entity.text_scale.aliases': {
    field: 'text_scale',
    scope: 'calendar',
    queries: ['text size', 'bigger text'],
  },
  'entity.visibility.aliases': {
    field: 'visibility',
    scope: 'calendar',
    queries: ['who sees', 'specific users'],
  },
  'entity.blocklist.aliases': { field: 'blocklist', scope: 'calendar', queries: ['exclude'] },
  'entity.allowlist.aliases': { field: 'allowlist', scope: 'calendar', queries: ['include only'] },
  'days_to_show.aliases': {
    field: 'days_to_show',
    scope: 'card',
    queries: ['future weeks', 'weeks ahead'],
  },
  'start_date_mode.aliases': { field: 'start_date_mode', scope: 'card', queries: ['tomorrow'] },
  'event_order.aliases': { field: 'event_order', scope: 'card', queries: ['newest first', 'sort'] },
  'compact_events_to_show.aliases': {
    field: 'compact_events_to_show',
    scope: 'card',
    queries: ['max events', 'limit events'],
  },
  'show_past_events.aliases': { field: 'show_past_events', scope: 'card', queries: ['hide past'] },
  'time_format.aliases': { field: 'time_format', scope: 'card', queries: ['12h', 'AM/PM'] },
};

/** The settings a search lists on the card, in the List workspace, and on its one calendar. */
function rows(language: string, query: string): { card: string[]; calendar: string[] } {
  const config = { ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'] } as Types.Config;
  const found = { card: [] as string[], calendar: [] as string[] };
  for (const { entry } of search(searchIndex(config, { workspace: 'list', language }), query)) {
    const { name } = parseFieldId(entry.target.id);
    found[entry.target.kind === 'field' ? 'card' : 'calendar'].push(name);
  }
  return found;
}

/** What a search lists on the card. */
function cardHits(language: string, query: string): string[] {
  return rows(language, query).card;
}

/** What a search lists on the calendar. */
function calendarHits(language: string, query: string): string[] {
  return rows(language, query).calendar;
}

function hits(language: string, query: string, scope: Family['scope']): string[] {
  return scope === 'card' ? cardHits(language, query) : calendarHits(language, query);
}

describe('the alias families', () => {
  it('are pinned by value against the strings', () => {
    const defined = Object.keys(EDITOR_STRINGS)
      .filter((key) => key.endsWith('.aliases'))
      .sort();
    expect(defined).toEqual(Object.keys(FAMILIES).sort());
  });

  describe.each(Object.entries(FAMILIES))('%s', (_key, family) => {
    it.each(family.queries)('finds the setting by "%s"', (query) => {
      expect(hits('en', query, family.scope)).toContain(family.field);
    });
  });

  it('lend a calendar’s own limit the card’s words, which it has none of its own for', () => {
    expect(EDITOR_STRINGS['entity.compact_events_to_show.aliases']).toBeUndefined();
    expect(calendarHits('en', 'max events')).toContain('compact_events_to_show');
  });

  it('control: a word no alias holds still finds nothing', () => {
    expect([...cardHits('en', 'zebra'), ...calendarHits('en', 'zebra')]).toEqual([]);
  });
});

describe('aliases in each editor language', () => {
  const LANGUAGES = Object.keys(EDITOR_LANGUAGE_STRINGS).filter((code) => code !== 'en-gb');

  /** The first word in an alias list. */
  const firstWord = (aliases: string): string => aliases.split(',')[0].trim();

  it('are written where a language’s words differ', () => {
    const translated = LANGUAGES.flatMap((code) =>
      Object.keys(FAMILIES).filter((key) => EDITOR_LANGUAGE_STRINGS[code][key] !== undefined),
    );
    // The denominator: translated aliases exist, so the next test can tell the two apart.
    expect(translated.length).toBeGreaterThan(0);
  });

  it.each(LANGUAGES)(
    '%s searches its own words, and the English ones where it has none',
    (code) => {
      for (const [key, family] of Object.entries(FAMILIES)) {
        const own = EDITOR_LANGUAGE_STRINGS[code][key];
        const words = own ?? EDITOR_STRINGS[key];
        expect(hits(code, firstWord(words), family.scope), `${code} ${key}`).toContain(
          family.field,
        );
      }
    },
  );
});
