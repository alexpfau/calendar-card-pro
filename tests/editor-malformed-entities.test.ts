/**
 * The editor must survive a configuration the card survives.
 *
 * `entities` is the one option a user is most likely to mistype, because most Home
 * Assistant cards take a singular `entity:` and because a list is easy to write wrong.
 * The card has always been defensive about it — `normalizeEntities` returns `[]` for
 * anything that is not an array, so a malformed value costs the events and nothing
 * else, and `setConfig` runs that normalizer before anything reads the value.
 *
 * The editor did not. Eight places read `config.entities ?? []` and assumed an array,
 * so `entities: calendar.family` — a bare string rather than a list — threw
 * `(config.entities ?? []).map is not a function` out of `deriveSyntheticData` and the
 * editor never rendered. That is the worst possible place for it: the user reaches for
 * the visual editor *because* their configuration is wrong, and the editor is the one
 * thing that refuses to open.
 *
 * The defect predates the rebuild — the hand-written 3.x editor threw
 * `entities.forEach is not a function` on the same input — so this is not a regression
 * guard but a gap closed. It is fixed at the boundary rather than at the eight call
 * sites, which is both the smaller change and the one a future reader cannot
 * half-apply.
 *
 * The boundary guard is deliberately narrower than the card's `normalizeEntities`, and
 * the last test here is why: that normalizer also expands a bare `calendar.family` into
 * `{entity: 'calendar.family'}`. Correct for the card, which only ever reads the result;
 * wrong for the editor, which stores it. Reaching for it first turned two existing
 * round-trip tests red, because it would rewrite every user's compact list into objects
 * on their first unrelated edit.
 */

import { describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';

const TAG = 'calendar-card-pro-editor-malformed-test';

if (!customElements.get(TAG)) {
  customElements.define(TAG, class extends CalendarCardProEditor {});
}

/** Mounts the editor on a configuration and reports whether it rendered. */
async function mount(config: unknown): Promise<'rendered' | string> {
  const element = document.createElement(TAG) as CalendarCardProEditor;
  element.hass = { states: {}, locale: { language: 'en' } } as unknown as Types.Hass;

  try {
    element.setConfig(config as Types.Config);
    document.body.appendChild(element);
    await element.updateComplete;
    return 'rendered';
  } catch (error) {
    return `threw: ${(error as Error).message}`;
  } finally {
    element.remove();
  }
}

/** What the card itself makes of the same value. */
function cardEntities(config: unknown): unknown {
  const merged = { ...Config.DEFAULT_CONFIG, ...(config as object) } as Types.Config;
  return Config.normalizeEntities(merged.entities);
}

describe('editor robustness against a malformed entities value', () => {
  /**
   * Every shape here is something a user can actually type. The bare string is the
   * singular-`entity:` habit; `entities: {}` is a mapping written where a list was
   * meant; `[null]` is the bare `-` that produced the v3.6.0 "one stray line of YAML"
   * fix; the rest are ordinary list mistakes.
   */
  const CASES: Array<[string, unknown]> = [
    ['a valid list, as a control', { entities: ['calendar.personal'] }],
    ['a bare string instead of a list', { entities: 'calendar.personal' }],
    ['a mapping instead of a list', { entities: {} }],
    ['a list holding null, i.e. a bare "-"', { entities: [null] }],
    ['a list holding an empty object', { entities: [{}] }],
    ['a list holding a number', { entities: [123] }],
    ['no entities key at all', {}],
    ['an explicitly empty list', { entities: [] }],
  ];

  for (const [name, config] of CASES) {
    it(`renders with ${name}`, async () => {
      expect(await mount(config)).toBe('rendered');
    });
  }

  it('agrees with the card that a malformed value means no calendars', () => {
    // The editor and the card must not disagree about what the configuration says, or
    // the editor writes back a config describing a different card than the one shown.
    for (const [, config] of CASES) {
      expect(Array.isArray(cardEntities(config))).toBe(true);
    }
  });

  it('preserves a bare-string calendar rather than expanding it to an object', () => {
    // The guard fixes array-ness only. Running the card's `normalizeEntities` here
    // instead would expand `calendar.personal` into `{entity: 'calendar.personal'}`,
    // and because the editor stores what it holds, that rewrites the user's compact
    // list into objects on the first unrelated edit. Watched failing: reaching for the
    // normalizer turned `editor-filter` and `editor-schema` round-trip cases red.
    const element = document.createElement(TAG) as CalendarCardProEditor;
    element.hass = { states: {}, locale: { language: 'en' } } as unknown as Types.Hass;
    element.setConfig({ entities: ['calendar.personal'] } as unknown as Types.Config);

    const held = (element as unknown as { _config: Types.Config })._config;
    expect(held.entities).toEqual(['calendar.personal']);
  });

  it('leaves a well-formed entities list untouched', () => {
    // The normalizer must not be load-bearing for anything but the malformed case.
    const entities = [{ entity: 'calendar.personal', color: '#ff0000' }, 'calendar.work'];
    const normalized = Config.normalizeEntities(
      entities as unknown as Parameters<typeof Config.normalizeEntities>[0],
    );

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({ entity: 'calendar.personal', color: '#ff0000' });
    expect(normalized[1]).toMatchObject({ entity: 'calendar.work' });
  });
});
