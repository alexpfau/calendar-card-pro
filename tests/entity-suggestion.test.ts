import { describe, expect, it } from 'vitest';

import { getEntitySuggestion } from '../src/config/config';
import type * as Types from '../src/config/types';
import { generateDeterministicId } from '../src/utils/helpers';

/**
 * The card picker's "add card by entity" suggestions.
 *
 * Home Assistant calls `getEntitySuggestion` synchronously for every entity a
 * user selects and mounts each returned entry as a live card. Two things make
 * this worth pinning rather than trusting: the hook runs against a `hass` we do
 * not control and must be total, and the two recipes are required to differ by
 * exactly one key so that they share an event-cache entry. Neither property is
 * visible in the rendered DOM, so no other gate in this repo can see them break.
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

    it('offers the list layout, then the column layout, then the time grid', () => {
      expect(suggestions).toHaveLength(3);
      expect(suggestions?.[0].config.view).toBeUndefined();
      expect(suggestions?.[1].config.view).toBe('column');
      expect(suggestions?.[2].config.view).toBe('grid');
    });

    it('leaves the first entry unlabelled and labels only the variant', () => {
      // Home Assistant renders `${cardName} - ${label}`, so the canonical recipe
      // carries no label and reads as the card's own name.
      expect(suggestions?.[0].label).toBeUndefined();
      expect(suggestions?.[1].label).toBe('Columns');
      expect(suggestions?.[2].label).toBe('Time Grid');
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

    it('does not share a mutable grid_options object between the entries', () => {
      expect(suggestions?.[0].config.grid_options).not.toBe(suggestions?.[1].config.grid_options);
      expect(suggestions?.[1].config.grid_options).not.toBe(suggestions?.[2].config.grid_options);
      expect(suggestions?.[0].config.grid_options).not.toBe(suggestions?.[2].config.grid_options);
    });

    it('shows the clock but not the address in the time grid', () => {
      // The one deliberate divergence between the three. A postal address is several lines
      // in a block read by its position and height, so the grid preview stops at the clock.
      expect(suggestions?.[0].config.show_location).toBe(true);
      expect(suggestions?.[1].config.show_location).toBe(true);
      expect(suggestions?.[2].config.show_location).toBe(false);
    });
  });

  /**
   * The load-bearing one.
   *
   * All three suggestions are mounted as live cards at once, and each fetches on
   * setup. They are affordable together only because the event cache keys on
   * `generateDeterministicId`, which hashes entities, `days_to_show`,
   * `start_date` and `first_day_of_week` — and on none of those do the recipes
   * differ. Give one variant its own `days_to_show` and every pick silently
   * becomes three real calendar API requests instead of one. The grid recipe's
   * `show_location: false` is safe precisely because it is not among them.
   *
   * Pass every current input. `show_past_events` was dropped from the key in
   * #461 and `first_day_of_week` added; a call that still names the first and
   * omits the second cannot see a divergence in the input that is actually
   * hashed — adding `first_day_of_week` to one recipe alone typechecked and
   * left this test green.
   */
  it('keeps every recipe on one event-cache key', () => {
    const suggestions = getEntitySuggestion(hass('calendar.family'), 'calendar.family');
    const ids = (suggestions ?? []).map((suggestion) => {
      const config = suggestion.config as {
        entities: string[];
        days_to_show: number;
        start_date?: string;
        first_day_of_week?: string;
      };
      return generateDeterministicId(
        config.entities,
        config.days_to_show,
        config.start_date,
        config.first_day_of_week,
      );
    });

    // Compared as a set rather than pairwise, so a fourth recipe cannot be added
    // without this noticing.
    expect(ids).toHaveLength(3);
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
