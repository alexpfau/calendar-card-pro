import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { getEntitySuggestion } from '../src/config/config';
import type * as Types from '../src/config/types';
import { loadedDaysToShow, resolveEffectiveConfig } from '../src/config/view';
import { getFirstDayOfWeek } from '../src/utils/format';
import { generateDeterministicId } from '../src/utils/helpers';

/**
 * The card picker's "add card by entity" suggestions.
 *
 * Home Assistant calls `getEntitySuggestion` synchronously for every entity a
 * user selects and mounts each returned entry as a live card. Two things make
 * this worth pinning rather than trusting: the hook runs against a `hass` we do
 * not control and must be total, and the recipes are required to load the same
 * events so that they share an event-cache entry. Neither property is visible in
 * the rendered DOM, so no other gate in this repo can see them break.
 */
const hass = (...entityIds: string[]): Types.Hass =>
  ({
    states: Object.fromEntries(
      entityIds.map((id) => [id, { entity_id: id, state: 'off', attributes: {} }]),
    ),
  }) as unknown as Types.Hass;

describe('getEntitySuggestion', () => {
  describe('returns null rather than an empty array', () => {
    it('for a non-calendar domain', () => {
      expect(getEntitySuggestion(hass('light.kitchen'), 'light.kitchen')).toBeNull();
    });

    it('for an entity that is not in the state machine', () => {
      expect(getEntitySuggestion(hass(), 'calendar.absent')).toBeNull();
    });

    it('for a malformed or absent hass', () => {
      expect(getEntitySuggestion(undefined, 'calendar.family')).toBeNull();
      expect(getEntitySuggestion(null, 'calendar.family')).toBeNull();
      expect(getEntitySuggestion({} as Types.Hass, 'calendar.family')).toBeNull();
      expect(
        getEntitySuggestion('nonsense' as unknown as Types.Hass, 'calendar.family'),
      ).toBeNull();
    });

    it('for an entity id that is not a string', () => {
      expect(
        getEntitySuggestion(hass('calendar.family'), undefined as unknown as string),
      ).toBeNull();
      expect(getEntitySuggestion(hass('calendar.family'), 42 as unknown as string)).toBeNull();
    });
  });

  describe('for a calendar entity', () => {
    const suggestions = getEntitySuggestion(hass('calendar.family'), 'calendar.family');

    /**
     * The whole list, by value. Every other test here reads one property across the entries,
     * so an entry that vanished, gained an option or changed one would leave them green; this
     * one fails on any of it, in either direction.
     */
    it('offers exactly these five recipes', () => {
      const plain = {
        type: 'custom:calendar-card-pro-dev',
        config_version: 5,
        entities: ['calendar.family'],
        days_to_show: 3,
      };
      const interactive = {
        toolbar: { show: true },
        event_tap_action: { action: 'details' },
        day_tap_action: { action: 'add-event' },
      };
      const gridOptions = { grid_options: { columns: 'full', rows: 'auto' } };

      expect(suggestions).toEqual([
        { label: 'Interactive List', config: { ...plain, ...interactive, ...gridOptions } },
        {
          label: 'Interactive Time Grid',
          config: { ...plain, view: 'grid', ...interactive, ...gridOptions },
        },
        { config: { ...plain, ...gridOptions } },
        { label: 'Columns', config: { ...plain, view: 'column', ...gridOptions } },
        { label: 'Time Grid', config: { ...plain, view: 'grid', ...gridOptions } },
      ]);
    });

    it('offers the interactive list and time grid first, then the plain layouts', () => {
      // Home Assistant shows a card's suggestions in the order returned, so the first two
      // tiles a new user sees are the ones with the toolbar and the event actions on.
      expect(suggestions?.map((suggestion) => suggestion.config.view)).toEqual([
        undefined,
        'grid',
        undefined,
        'column',
        'grid',
      ]);
    });

    it('leaves the plain list unlabeled and labels every variant', () => {
      // Home Assistant renders `${cardName} - ${label}`, so the plain list recipe
      // carries no label and reads as the card's own name.
      expect(suggestions?.map((suggestion) => suggestion.label)).toEqual([
        'Interactive List',
        'Interactive Time Grid',
        undefined,
        'Columns',
        'Time Grid',
      ]);
    });

    it('pre-fills the picked entity in all of them', () => {
      for (const suggestion of suggestions ?? []) {
        expect(suggestion.config.entities).toEqual(['calendar.family']);
      }
    });

    it('asks for full width in all of them, because a column or grid card needs the room', () => {
      for (const suggestion of suggestions ?? []) {
        expect(suggestion.config.grid_options).toEqual({ columns: 'full', rows: 'auto' });
      }
    });

    it('shares no mutable object between the entries', () => {
      // The picker keeps whichever config the user takes, and the editor then writes into it.
      const shared = ['grid_options', 'toolbar', 'event_tap_action', 'day_tap_action'];
      const list = suggestions ?? [];
      for (const key of shared) {
        const objects = list
          .map((suggestion) => suggestion.config[key])
          .filter((value) => value !== undefined);
        expect(new Set(objects).size, key).toBe(objects.length);
      }
    });

    it("shows the clock but not the address in the time grids, through grid's own default", () => {
      // A postal address is several lines in a block read by its position and height, so
      // the grid preview stops at the clock. Grid's own default does that, so no recipe
      // writes the option at all: YAML that said `show_location: true` above a grid that
      // draws no locations would read as a lie.
      const views = (suggestions ?? []).map((suggestion) => {
        const { view, show_location } = suggestion.config as Partial<Types.Config>;
        const config = buildConfig({ ...(suggestion.config as Partial<Types.Config>) });
        return {
          view: view ?? 'list',
          written: show_location,
          drawn: resolveEffectiveConfig(config, view ?? 'list').show_location,
        };
      });
      expect(views).toEqual([
        { view: 'list', written: undefined, drawn: true },
        { view: 'grid', written: undefined, drawn: false },
        { view: 'list', written: undefined, drawn: true },
        { view: 'column', written: undefined, drawn: true },
        { view: 'grid', written: undefined, drawn: false },
      ]);
    });
  });

  /**
   * The load-bearing one.
   *
   * All five suggestions are mounted as live cards at once, and each fetches on
   * setup. They are affordable together only because they share one event-cache
   * key. Give one recipe its own `days_to_show` and every pick silently becomes
   * several real calendar API requests instead of one.
   *
   * The key is derived here exactly as the card derives it (`_instanceId`): from the
   * config `setConfig` produces, with the days the card *loads* rather than the
   * `days_to_show` the recipe writes. Those differ once a recipe shows the toolbar,
   * whose layout switcher makes every view reachable, so the card loads the longest
   * `days_to_show` among them (`loadedDaysToShow`). Hashing the written count instead,
   * as this test once did, left it green under `list: { days_to_show: 7 }` added to
   * the interactive time grid, which loads seven days where the others load three.
   *
   * Pass every input `_instanceId` hashes. `first_day_of_week` joined the key in #461,
   * and a call that omitted it once let a recipe set it alone with this test green. The
   * card hashes the weekday it resolves, under the profile it is shown with, so the
   * profile is named here rather than left to a fallback.
   */
  it('keeps every recipe on one event-cache key', () => {
    const locale = { language: 'en', first_weekday: 'sunday' };
    const suggestions = getEntitySuggestion(hass('calendar.family'), 'calendar.family');
    const ids = (suggestions ?? []).map((suggestion) => {
      const config = buildConfig(suggestion.config as Partial<Types.Config>);
      return generateDeterministicId(
        config.entities,
        loadedDaysToShow(config),
        config.start_date,
        getFirstDayOfWeek(config.first_day_of_week, locale),
      );
    });

    // Compared as a set rather than pairwise, so a sixth recipe cannot be added
    // without this noticing.
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size, 'every suggestion must hash to the same cache key').toBe(1);
  });

  it('never throws, whatever it is handed', () => {
    // A throw is contained by Home Assistant to this card, but the containment is
    // silent: our suggestions just do not appear.
    const nasty: unknown[] = [
      undefined,
      null,
      0,
      '',
      [],
      { states: null },
      { states: 'not-an-object' },
      { states: { 'calendar.family': null } },
    ];

    for (const value of nasty) {
      expect(() => getEntitySuggestion(value as Types.Hass, 'calendar.family')).not.toThrow();
      expect(() => getEntitySuggestion(value as Types.Hass, '')).not.toThrow();
    }
  });
});
