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
 * The full search (backlog item 307) adds the same kind of words where users' own missed: "week
 * numbers" (forum, "how to add the week numbers in the week view") with German's "Wochennummern",
 * "all-day events" (forum, "show all-day events in a different accent color than the timed
 * events") with German's "Ganztagsereignisse", and "full width" (forum, "expand this card to take
 * full width of the section"), which is a job of Home Assistant's Layout tab. A page carries the
 * titles of the panels whose settings it took, on its title key: Layout and Separators on Size &
 * Spacing, Time Range & Content on Which Events, Actions & Refresh on Taps & Refresh.
 *
 * Three things are pinned. The families by value against `strings.ts`, so an alias string that
 * appears or disappears fails here. Each family's words finding its setting, page or tab as a
 * jump-list row, on the card or on a calendar. And each language searching its own words where it
 * has them and the English ones where it has none.
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
  /** The setting, as its form names it; a page's id; a Home Assistant tab. */
  field: string;
  /** Where it is set: on the card, or in one calendar's form; or a page, a tab, or a block of the
   * overview's own. */
  scope: 'card' | 'calendar' | 'page' | 'ha-tab' | 'overview';
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
  'event_type.aliases': { field: 'event_type', scope: 'card', queries: ['all-day events'] },
  'event_tap_action.aliases': {
    field: 'event_tap_action',
    scope: 'card',
    queries: ['open event', 'tapping'],
  },
  'week_number_mode.aliases': {
    field: 'week_number_mode',
    scope: 'card',
    queries: ['week numbers'],
  },
  'search.ha_tab.layout.aliases': { field: 'layout', scope: 'ha-tab', queries: ['full width'] },
  'page.size_spacing.aliases': {
    field: 'size_spacing',
    scope: 'page',
    queries: ['Layout', 'Separators', 'separator'],
  },
  'page.which_events.aliases': {
    field: 'which_events',
    scope: 'page',
    queries: ['Time Range & Content'],
  },
  'panel.events.aliases': {
    field: 'events',
    scope: 'page',
    queries: ['Events'],
  },
  'page.taps_refresh.aliases': {
    field: 'taps_refresh',
    scope: 'page',
    queries: ['Actions & Refresh'],
  },
  // Starting Layout's name before v6.
  'view.aliases': { field: 'starting_layout', scope: 'overview', queries: ['card displays'] },
  // The control's own name, which the label of the setting that qualifies it inflects. English
  // finds it through the key as well, which holds the same words; Swedish, Norwegian, Italian,
  // Polish, Lithuanian and Latvian need words of their own (`aliases in each editor language`).
  'toolbar.view_switcher_layouts.aliases': {
    field: 'view_switcher_layouts',
    scope: 'card',
    queries: ['view switcher'],
  },
};

/**
 * The settings a search lists on the card, in the List workspace, and on its one calendar, and
 * the pages and Home Assistant's tabs it lists.
 */
function rows(language: string, query: string): Record<Family['scope'], string[]> {
  const config = { ...Config.DEFAULT_CONFIG, entities: ['calendar.anna'] } as Types.Config;
  const found = { card: [], calendar: [], page: [], 'ha-tab': [], overview: [] } as Record<
    Family['scope'],
    string[]
  >;
  for (const { entry } of search(searchIndex(config, { workspace: 'list', language }), query)) {
    const { target } = entry;
    if (target.kind === 'page') found.page.push(target.page);
    else if (target.kind === 'ha-tab') found['ha-tab'].push(target.tab);
    else if (target.kind === 'overview') found.overview.push(target.block);
    else if (target.kind === 'split') continue;
    else {
      found[target.kind === 'field' ? 'card' : 'calendar'].push(parseFieldId(target.id).name);
    }
  }
  return found;
}

/** What a search lists on the calendar. */
function calendarHits(language: string, query: string): string[] {
  return rows(language, query).calendar;
}

function hits(language: string, query: string, scope: Family['scope']): string[] {
  return rows(language, query)[scope];
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
    expect(Object.values(rows('en', 'zebra')).flat()).toEqual([]);
  });

  it('control: the retired titles find nothing without the words on the pages', () => {
    // Removing a page's words takes its old title with it: "Actions & Refresh" then finds no
    // page, so the row above is the words working, not the title matching anyway.
    const words = EDITOR_STRINGS['page.taps_refresh.aliases'];
    try {
      delete (EDITOR_STRINGS as Record<string, string>)['page.taps_refresh.aliases'];
      expect(hits('en', 'Actions & Refresh', 'page')).toEqual([]);
    } finally {
      (EDITOR_STRINGS as Record<string, string>)['page.taps_refresh.aliases'] = words;
    }
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

  it('find Layouts in Switcher by the View Switcher’s own name where the label does not', () => {
    // Swedish names the control "Layoutväljare" and the setting "Layouter i väljaren", so the
    // control's name finds the setting only through the Swedish words. English, German and a few
    // others find it through the label or the key, so carry no words of their own.
    const strings = EDITOR_LANGUAGE_STRINGS.sv as Record<string, string>;
    const words = strings['toolbar.view_switcher_layouts.aliases'];
    try {
      delete strings['toolbar.view_switcher_layouts.aliases'];
      expect(hits('sv', 'Layoutväljare', 'card')).toEqual(['view_switcher']);
    } finally {
      strings['toolbar.view_switcher_layouts.aliases'] = words;
    }
    expect(hits('sv', 'Layoutväljare', 'card')).toEqual(['view_switcher', 'view_switcher_layouts']);
    expect(EDITOR_LANGUAGE_STRINGS.de['toolbar.view_switcher_layouts.aliases']).toBeUndefined();
    expect(hits('de', 'Layout-Umschalter', 'card')).toContain('view_switcher_layouts');
  });

  it('find what German users call the settings where the labels say otherwise', () => {
    // The words ia-final §6 names, which the German labels ("Nummerierung", "Nur ganztägige
    // Termine") do not hold: without their German aliases each finds nothing.
    expect(hits('de', 'Wochennummern', 'card')).toContain('week_number_mode');
    expect(hits('de', 'Ganztagsereignisse', 'card')).toContain('event_type');
    expect(hits('de', 'Ganztagsereignisse', 'calendar')).toContain('event_type');
    expect(hits('en', 'Wochennummern', 'card')).toEqual([]);
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
