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
 * appears or disappears fails here. Each family's words finding its setting, on the card or in a
 * calendar's form. And each language searching its own words where it has them and the English
 * ones where it has none.
 */
import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  type FilterCtx,
  NO_FILTER,
  filterEntitySchema,
  filterSchema,
  withholdInertFields,
} from '../src/rendering/editor/filter';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import { workspaceFields } from '../src/rendering/editor/routing';
import { ENTITY_PATH } from '../src/rendering/editor/schemas/calendars';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
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

function ids(schema: Parameters<typeof workspaceFields>[0]): string[] {
  return [...workspaceFields(schema)].map(({ node, path }) => [...path, node.name].join('.'));
}

function ctxFor(language: string, query: string): FilterCtx {
  const config = { ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'] } as Types.Config;
  const ctx: SchemaCtx = { view: 'list', workspace: 'list', config, rawConfig: config, language };
  return { ...ctx, criteria: { ...NO_FILTER, query } };
}

/** What a search shows on the card's panels, in the List workspace. */
function cardHits(language: string, query: string): string[] {
  const ctx = ctxFor(language, query);
  return PANELS.flatMap((panel) =>
    ids(filterSchema(withholdInertFields(panel.build(ctx), 'list'), ctx)),
  );
}

/** What a search shows in one calendar's form. */
function calendarHits(language: string, query: string): string[] {
  const ctx = ctxFor(language, query);
  return ids(filterEntitySchema(buildEntitySchema(ctx), 'calendar.anna', ENTITY_PATH, ctx));
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
