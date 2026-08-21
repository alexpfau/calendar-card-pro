/**
 * Calendar colours read from Home Assistant's entity registry.
 *
 * Home Assistant 2026.2 stores a colour per calendar at `options.calendar.color`, and
 * `accent_color: home-assistant` opts a card or one of its calendars into using it. The
 * cases below pin the three things that are easy to get wrong and impossible to see:
 *
 * 1. **CSS colour names must stay CSS colour names.** Sixteen of Home Assistant's theme
 *    tokens — `red`, `blue`, `green` and friends — are also valid CSS colours, and
 *    `styles.ts` writes the user's own `accent_color` straight into a custom property. If
 *    token resolution ever leaked onto configured values, `accent_color: red` would
 *    silently move from CSS red to Home Assistant's Material red on upgrade. Nothing
 *    would throw and no other test would notice.
 *
 * 2. **The fall-through is the common path, not the edge case.** Google Calendar is the
 *    only integration in core that populates a colour, so most calendars have none. A
 *    sentinel that rendered nothing when the registry is empty would look broken for the
 *    majority of anyone who tried it.
 *
 * 3. **Neither mode dropdown may ever be written.** Both are read back off the value's
 *    shape; storing one would put a key in the user's YAML that the card never reads.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  asEntityConfig,
  fromEntityFormData,
  toEntityFormData,
} from '../src/rendering/editor/entities';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import {
  accentColorModeOf,
  buildEntitySchema,
  entitySchemaFor,
} from '../src/rendering/editor/schemas/entity';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';
import { accentColorMode, applySyntheticChange } from '../src/rendering/editor/synthetic';
import * as Render from '../src/rendering/render';
import * as EntityColors from '../src/utils/entity-colors';
import * as EventUtils from '../src/utils/events';

const SENTINEL = EntityColors.ENTITY_COLOR_SENTINEL;

const DEFAULT_ACCENT = Config.DEFAULT_CONFIG.accent_color;

/**
 * Drain the promise chain behind a registry read.
 *
 * The fetch resolves, the extract runs on its `.then`, and the listeners fire on a
 * `.then` after that — so counting microtasks by hand is brittle. A macrotask boundary
 * drains all of them.
 *
 * @returns A promise that settles once every pending microtask has run
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Resolve one calendar's accent colour under a given card config and registry. */
function accentFor(
  config: Types.Config,
  entityId: string,
  registry?: ReadonlyMap<string, string>,
  opacity?: number,
): string {
  return EventUtils.getEntityAccentColorWithOpacity(entityId, config, opacity, undefined, registry);
}

beforeEach(() => {
  EntityColors.resetEntityColors();
});

describe('entity colours: the sentinel', () => {
  it('is spelled for where it is read, not where it is written', () => {
    // `entity` was the first proposal and reads as a different word entirely two lines
    // under `entity: calendar.work`.
    expect(SENTINEL).toBe('home-assistant');
  });

  it('is not a value the previous grammar could hold', () => {
    // The backwards-compatibility argument in one assertion: the sentinel cannot collide
    // with an existing config, because it was never a colour anything would render.
    const style = document.createElement('div').style;
    style.color = SENTINEL;
    expect(style.color).toBe('');
  });
});

describe('entity colours: token resolution', () => {
  /**
   * Pinned by value rather than walked. A loop over the table's own keys cannot notice a
   * key leaving it — it simply runs one fewer time — and a dropped token here means a
   * calendar silently rendering the literal string `deep-purple`, which is not a colour.
   */
  it('resolves exactly Home Assistant own theme tokens', () => {
    expect([...EntityColors.THEME_COLOR_TOKENS].sort()).toEqual([
      'accent',
      'amber',
      'black',
      'blue',
      'blue-grey',
      'brown',
      'cyan',
      'dark-grey',
      'deep-orange',
      'deep-purple',
      'disabled',
      'green',
      'grey',
      'indigo',
      'light-blue',
      'light-green',
      'light-grey',
      'lime',
      'orange',
      'pink',
      'primary',
      'primary-text',
      'purple',
      'red',
      'secondary-text',
      'teal',
      'white',
      'yellow',
    ]);
  });

  it('turns a token into the custom property Home Assistant defines', () => {
    expect(EntityColors.resolveRegistryColor('red')).toBe('var(--red-color)');
    expect(EntityColors.resolveRegistryColor('deep-purple')).toBe('var(--deep-purple-color)');
  });

  it('passes anything that is not a token through untouched', () => {
    expect(EntityColors.resolveRegistryColor('#4285f4')).toBe('#4285f4');
    expect(EntityColors.resolveRegistryColor('rebeccapurple')).toBe('rebeccapurple');
    expect(EntityColors.resolveRegistryColor('var(--my-own-color)')).toBe('var(--my-own-color)');
  });
});

describe('entity colours: configured colours are never resolved as tokens', () => {
  /**
   * The regression this file exists for. Sixteen tokens are also CSS colour names, so a
   * card configured `accent_color: red` renders CSS red today. Resolving configured
   * values would repaint every one of them to a different shade, with no error and no
   * visible cause.
   */
  it.each(['red', 'blue', 'green', 'orange', 'pink', 'purple', 'teal', 'cyan'])(
    'leaves a card-wide accent_color of %s as the CSS colour',
    (name) => {
      const config = buildConfig({ accent_color: name });
      expect(accentFor(config, 'calendar.personal')).toBe(name);
    },
  );

  it('leaves a per-calendar accent_color of red as the CSS colour', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.work', accent_color: 'red' }],
    });

    expect(accentFor(config, 'calendar.work')).toBe('red');
  });

  it('leaves a configured colour alone even while the registry holds one', () => {
    const config = buildConfig({ accent_color: 'red' });
    const registry = new Map([['calendar.personal', 'var(--blue-color)']]);

    // Opting out is not opting in: without the sentinel the registry is not consulted.
    expect(accentFor(config, 'calendar.personal', registry)).toBe('red');
  });
});

describe('entity colours: the resolution chain', () => {
  it('uses the registry colour when a calendar defers to Home Assistant', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.work', accent_color: SENTINEL }],
    });
    const registry = new Map([['calendar.work', 'var(--red-color)']]);

    expect(accentFor(config, 'calendar.work', registry)).toBe('var(--red-color)');
  });

  it('falls through to the card colour when Home Assistant holds none', () => {
    const config = buildConfig({
      accent_color: '#123456',
      entities: [{ entity: 'calendar.work', accent_color: SENTINEL }],
    });

    expect(accentFor(config, 'calendar.work', new Map())).toBe('#123456');
  });

  it('lets one calendar override a card-wide sentinel', () => {
    const config = buildConfig({
      accent_color: SENTINEL,
      entities: [{ entity: 'calendar.work', accent_color: '#abcdef' }, 'calendar.personal'],
    });
    const registry = new Map([
      ['calendar.work', 'var(--red-color)'],
      ['calendar.personal', 'var(--green-color)'],
    ]);

    expect(accentFor(config, 'calendar.work', registry)).toBe('#abcdef');
    expect(accentFor(config, 'calendar.personal', registry)).toBe('var(--green-color)');
  });

  it('falls back to the shipped default under a card-wide sentinel', () => {
    // Nothing else is available: the sentinel occupies the slot the card-wide literal
    // would have held, so the default is the floor. Documented rather than hidden.
    const config = buildConfig({ accent_color: SENTINEL });

    expect(accentFor(config, 'calendar.personal', new Map())).toBe(DEFAULT_ACCENT);
  });

  it('is untouched when no sentinel appears anywhere', () => {
    const config = buildConfig({
      accent_color: '#03a9f4',
      entities: [{ entity: 'calendar.work', accent_color: '#ff6347' }, 'calendar.personal'],
    });
    const registry = new Map([['calendar.work', 'var(--red-color)']]);

    expect(accentFor(config, 'calendar.work', registry)).toBe('#ff6347');
    expect(accentFor(config, 'calendar.personal', registry)).toBe('#03a9f4');
  });
});

describe('entity colours: opacity', () => {
  /**
   * A token resolves to `var(--red-color)`, and a `var()` cannot be taken apart into the
   * channels `rgba()` needs — which is the defect v4 fixed by moving to `color-mix`. This
   * asserts the registry path lands on that branch rather than on the literal one.
   */
  it('composites a registry token through color-mix', () => {
    const config = buildConfig({
      accent_color: SENTINEL,
      event_background_opacity: 30,
    });
    const registry = new Map([['calendar.personal', 'var(--red-color)']]);

    expect(accentFor(config, 'calendar.personal', registry, 30)).toBe(
      'color-mix(in srgb, var(--red-color) 30%, transparent)',
    );
  });
});

describe('entity colours: the fetch gate', () => {
  it('is off for a configuration that never opts in', () => {
    expect(EntityColors.usesEntityColor(buildConfig())).toBe(false);
    expect(EntityColors.usesEntityColor(buildConfig({ accent_color: '#ff0000' }))).toBe(false);
  });

  it('is on for a card-wide sentinel', () => {
    expect(EntityColors.usesEntityColor(buildConfig({ accent_color: SENTINEL }))).toBe(true);
  });

  it('is on for a single calendar that opts in', () => {
    const config = buildConfig({
      entities: ['calendar.personal', { entity: 'calendar.work', accent_color: SENTINEL }],
    });

    expect(EntityColors.usesEntityColor(config)).toBe(true);
  });

  it('survives a bare-string entity list', () => {
    expect(EntityColors.usesEntityColor(buildConfig({ entities: ['calendar.personal'] }))).toBe(
      false,
    );
  });
});

describe('entity colours: degradation', () => {
  it('renders configured colours when the registry was never read', () => {
    const config = buildConfig({ accent_color: SENTINEL });

    // No map at all — an old Home Assistant, or a fetch that has not landed yet.
    expect(accentFor(config, 'calendar.personal')).toBe(DEFAULT_ACCENT);
  });

  it('ignores a calendar the registry does not mention', () => {
    const config = buildConfig({ accent_color: SENTINEL });
    const registry = new Map([['calendar.other', 'var(--red-color)']]);

    expect(accentFor(config, 'calendar.personal', registry)).toBe(DEFAULT_ACCENT);
  });

  it('does nothing without a hass object', () => {
    let notified = false;
    EntityColors.ensureEntityColors(undefined, () => {
      notified = true;
    });

    expect(notified).toBe(false);
    expect(EntityColors.entityColors().size).toBe(0);
  });

  it('reports no colours when the instance exposes no WebSocket API', () => {
    const hass = { states: {} } as unknown as Types.Hass;

    expect(() => EntityColors.ensureEntityColors(hass, () => {})).not.toThrow();
    expect(EntityColors.entityColors().size).toBe(0);
  });
});

describe('entity colours: reading the registry', () => {
  /** A `hass` that answers the registry command with the given entries. */
  function hassWith(entries: unknown[]): Types.Hass {
    return {
      states: {},
      callWS: () => Promise.resolve(entries),
    } as unknown as Types.Hass;
  }

  it('keeps calendar colours and resolves their tokens', async () => {
    const hass = hassWith([
      { entity_id: 'calendar.work', options: { calendar: { color: 'red' } } },
      { entity_id: 'calendar.trash', options: { calendar: { color: '#43a047' } } },
    ]);

    EntityColors.ensureEntityColors(hass, () => {});
    await flush();

    expect(EntityColors.entityColors().get('calendar.work')).toBe('var(--red-color)');
    expect(EntityColors.entityColors().get('calendar.trash')).toBe('#43a047');
  });

  it('drops everything that is not a calendar carrying a colour', async () => {
    const hass = hassWith([
      { entity_id: 'light.kitchen', options: { calendar: { color: 'red' } } },
      { entity_id: 'calendar.none', options: {} },
      { entity_id: 'calendar.null', options: null },
      { entity_id: 'calendar.empty', options: { calendar: { color: '' } } },
      { entity_id: 'calendar.cleared', options: { calendar: { color: null } } },
      { entity_id: 'sensor.temperature' },
    ]);

    EntityColors.ensureEntityColors(hass, () => {});
    await flush();

    // The registry command returns every entity in the instance; keeping any of these
    // would grow the map without bound on a large install.
    expect([...EntityColors.entityColors().keys()]).toEqual([]);
  });

  it('tells the card once the colours have landed', async () => {
    let repaints = 0;
    const hass = hassWith([
      { entity_id: 'calendar.work', options: { calendar: { color: 'red' } } },
    ]);

    EntityColors.ensureEntityColors(hass, () => {
      repaints += 1;
    });
    await flush();

    expect(repaints).toBe(1);
  });

  it('stops telling a card that has gone away', async () => {
    let repaints = 0;
    const onChange = () => {
      repaints += 1;
    };
    const hass = hassWith([
      { entity_id: 'calendar.work', options: { calendar: { color: 'red' } } },
    ]);

    EntityColors.ensureEntityColors(hass, onChange);
    EntityColors.releaseEntityColors(onChange);
    await flush();

    expect(repaints).toBe(0);
  });
});

describe('entity colours: the rendered card', () => {
  /**
   * The end of the pipeline. Everything above works on the resolver in isolation; this
   * asserts the colour survives `groupEventsByDay` → `renderGroupedEvents` → Lit and
   * reaches an inline style, which is the only part a user can see.
   */
  const EVENT = [
    {
      summary: 'Standup',
      start: { dateTime: '2026-06-18T09:00:00Z' },
      end: { dateTime: '2026-06-18T09:30:00Z' },
      _entityId: 'calendar.personal',
    },
  ] as unknown as Types.CalendarEventData[];

  function accentStyles(overrides: Record<string, unknown>): string {
    const config = buildConfig({ days_to_show: 7, start_date: '2026-06-18', ...overrides });
    const days = EventUtils.groupEventsByDay(EVENT, config, false, 'en');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en'), container);

    return Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .map((node) => node.getAttribute('style') ?? '')
      .join(' | ');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    EntityColors.resetEntityColors();
  });

  it('draws the colour Home Assistant holds', async () => {
    const hass = {
      states: {},
      callWS: () =>
        Promise.resolve([
          { entity_id: 'calendar.personal', options: { calendar: { color: 'red' } } },
        ]),
    } as unknown as Types.Hass;

    EntityColors.ensureEntityColors(hass, () => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(accentStyles({ accent_color: SENTINEL })).toContain('var(--red-color)');
  });

  it('draws the configured colour, not a token, for a card that never opted in', () => {
    // The control. `red` is both a CSS colour and a theme token, so this is the one
    // assertion that separates "resolved the registry" from "resolved everything".
    const styles = accentStyles({ accent_color: 'red' });

    expect(styles).toContain('red');
    expect(styles).not.toContain('var(--red-color)');
  });
});

describe('entity colours: the colour field sits with its dropdown', () => {
  /**
   * Reported from live testing on a phone: the colour input was separated from the
   * dropdown that governs it by an unrelated field.
   *
   * `row()` is an `ha-form` grid, and a grid collapses to one column on a narrow viewport.
   * So a conditional field placed *after* a row containing the dropdown reads correctly on
   * desktop — where the row is two columns and the field lands underneath — and wrongly on
   * a phone, where the row's second child drops between them.
   *
   * Flattened render order is therefore the thing to assert, because that is exactly what
   * the single-column layout renders. Asserting the field is merely *present* passes in
   * the broken state and is worth nothing.
   */
  const names = (schema: ReadonlyArray<HaFormSchema>) =>
    [...walkSchema(schema)].map((entry) => entry.node.name).filter(Boolean);

  const eventsSchemaFor = (accent: string) =>
    buildEventsSchema({
      view: 'list',
      config: buildConfig({ accent_color: accent }),
      language: 'en',
    });

  it('renders the colour immediately after the mode, card-wide', () => {
    const order = names(eventsSchemaFor('#ff6c92'));
    const mode = order.indexOf('accent_color_mode');

    expect(mode).toBeGreaterThanOrEqual(0);
    expect(order[mode + 1]).toBe('accent_color');
  });

  it('renders the colour immediately after the mode, per calendar', () => {
    const declared = buildEntitySchema({
      view: 'list',
      config: buildConfig(),
      language: 'en',
    });
    const order = names(entitySchemaFor(declared, 'text', 'custom'));
    const mode = order.indexOf('accent_color_mode');

    expect(mode).toBeGreaterThanOrEqual(0);
    expect(order[mode + 1]).toBe('accent_color');
  });

  it('drops the colour entirely in the other modes, at both levels', () => {
    // The control: adjacency must not be bought by rendering the field unconditionally.
    expect(names(eventsSchemaFor(SENTINEL))).not.toContain('accent_color');

    const declared = buildEntitySchema({
      view: 'list',
      config: buildConfig(),
      language: 'en',
    });
    for (const mode of ['inherit', 'home_assistant']) {
      expect(names(entitySchemaFor(declared, 'text', mode))).not.toContain('accent_color');
    }
  });
});

describe('entity colours: mode derivation', () => {
  it('reads the card-wide mode off the value', () => {
    expect(accentColorMode(buildConfig())).toBe('custom');
    expect(accentColorMode(buildConfig({ accent_color: '#ff0000' }))).toBe('custom');
    expect(accentColorMode(buildConfig({ accent_color: SENTINEL }))).toBe('home_assistant');
  });

  it('reads the per-calendar mode off the value', () => {
    expect(accentColorModeOf(undefined)).toBe('inherit');
    expect(accentColorModeOf('')).toBe('inherit');
    expect(accentColorModeOf(SENTINEL)).toBe('home_assistant');
    expect(accentColorModeOf('#ff0000')).toBe('custom');
    // A CSS colour name that is also a theme token is still just a custom colour.
    expect(accentColorModeOf('red')).toBe('custom');
  });
});

describe('entity colours: every per-calendar dropdown round-trips', () => {
  /**
   * The generalisation, and the guard against the next control rather than this one.
   *
   * A class-level invariant for the **card-wide** synthetic dropdowns already exists in
   * `editor-schema.test.ts` — it walks `SYNTHETIC_FIELDS`, covers `accent_color_mode`, and
   * passed throughout this defect, because the card-wide control was never broken. Its
   * corpus is the gap: the per-calendar dropdowns are not in `SYNTHETIC_FIELDS` at all,
   * they round-trip through `toEntityFormData` / `fromEntityFormData`, and nothing
   * enforced the same invariant on them. That is why a bug of exactly the shape that test
   * exists to catch reached a user.
   *
   * The invariant: **the value stored for a mode must derive back to that mode.** Break it
   * and a dropdown becomes unselectable, whichever transition happens to expose it.
   *
   * `accent_color` is the one dropdown here whose valueless state means a *different* mode
   * — empty derives to `inherit` — so `custom` is the only mode that must be positively
   * represented by a value. Every other per-calendar dropdown maps each option to a
   * distinct stored value, which is why none of them needed a seed and none of them broke.
   */
  const ctx = { view: 'list' as const, config: buildConfig(), language: 'en' };

  /** Discovered from the schema, so a dropdown added later is covered the day it lands. */
  function entityDropdowns(): Array<[string, string[]]> {
    const found: Array<[string, string[]]> = [];

    for (const { node } of walkSchema(buildEntitySchema(ctx))) {
      const options = (node as { selector?: { select?: { options?: Array<{ value: string }> } } })
        .selector?.select?.options;
      if (node.name && options?.length) {
        found.push([node.name, options.map((o) => o.value)]);
      }
    }

    return found;
  }

  it('finds exactly the per-calendar dropdowns that exist', () => {
    // Membership, pinned by value. Walking the schema to assert something about each
    // dropdown cannot notice one leaving — the loop simply runs one fewer time — so a
    // deleted control would silently stop being covered while this file stayed green.
    expect(
      entityDropdowns()
        .map(([name]) => name)
        .sort(),
    ).toEqual([
      'accent_color_mode',
      'days_of_week',
      'event_type',
      'filter_field',
      'label_icon_source',
      'label_type',
      'show_description',
      'show_location',
      'show_time',
      'split_multiday_events',
    ]);
  });

  /**
   * What has to be stored before a dropdown is reachable at all.
   *
   * Empty for every control but one, which is why this table did not exist until now: the
   * per-calendar dropdowns are independent, so a bare entity id offers each of them every
   * value it has. `label_icon_source` is the first that is **nested** — `labelFields` renders
   * it only under `label_type: icon`, because "where does this icon come from" says nothing
   * about a text label — and `fromEntityFormData` stores the sentinel only for an icon label
   * for the same reason.
   *
   * 🚨 This is a precondition, not an exemption. The invariant below is unchanged and still
   * enumerates every ordered transition; all this does is start from a state the editor can
   * actually produce. Drop the precondition and `home_assistant` becomes unreachable — but
   * for a reason that says nothing about the control, since no user can reach that state
   * either. Weaken the *assertion* instead and the round trip stops being a round trip.
   */
  const PRECONDITION: Readonly<Record<string, Types.EntityConfig>> = {
    label_icon_source: { entity: 'calendar.work', label_type: 'icon' },
  };

  it.each(entityDropdowns())('%s returns to every value it offers', (field, values) => {
    const base: string | Types.EntityConfig = PRECONDITION[field] ?? 'calendar.work';

    for (const from of values) {
      for (const to of values) {
        const entered = fromEntityFormData(
          'calendar.work',
          { ...toEntityFormData(base), [field]: from },
          base,
          '#ff6c92',
        );

        // Without this the loop would compare every transition against the starting state
        // and would still pass with half the control broken.
        expect(toEntityFormData(entered)[field], `${field} never reached ${from}`).toBe(from);

        const moved = fromEntityFormData(
          'calendar.work',
          { ...toEntityFormData(entered), [field]: to },
          entered,
          '#ff6c92',
        );

        expect(toEntityFormData(moved)[field], `${field}: picking ${to} while on ${from}`).toBe(to);
      }
    }
  });
});

describe('entity colours: every mode transition survives the round trip', () => {
  /**
   * The defect this exists for: from "Follow Home Assistant" you could not reach "Custom
   * color". The stored value in that mode *is* the sentinel, so the form handed it back as
   * `accent_color`, `accentColorFor` carried it as though it were a colour, and the next
   * derivation read it straight back as `home_assistant`. From `inherit` the value is
   * genuinely unset, so it fell through to the seed and worked — which is why a test suite
   * covering only "custom with no value" missed it.
   *
   * A three-mode control has six ordered transitions and the previous tests covered a
   * subset that happened to exclude the broken one. Enumerate them instead of choosing
   * them: a hand-picked list is exactly what let this through, and it would miss a fourth
   * mode added later too.
   */
  const MODES = ['inherit', 'home_assistant', 'custom'] as const;

  const ENTRY: Record<string, Types.EntityConfig> = {
    inherit: { entity: 'calendar.work' },
    home_assistant: { entity: 'calendar.work', accent_color: SENTINEL },
    custom: { entity: 'calendar.work', accent_color: '#ff6347' },
  };

  /** One edit, exactly as the form performs it: the whole merged object, one field moved. */
  function move(from: string, to: string, inherited: unknown = '#ff6c92') {
    const previous = ENTRY[from];
    const data = { ...toEntityFormData(previous), accent_color_mode: to };

    return fromEntityFormData('calendar.work', data, previous, inherited);
  }

  const transitions = MODES.flatMap((from) =>
    MODES.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it('has all six ordered transitions', () => {
    // The denominator. A matrix that quietly shrank would still pass every case it ran.
    expect(transitions).toHaveLength(6);
  });

  it.each(transitions)('goes from %s to %s and stays there', (from, to) => {
    expect(toEntityFormData(move(from, to)).accent_color_mode).toBe(to);
  });

  it.each(MODES)('stays in %s when nothing is moved', (mode) => {
    const previous = ENTRY[mode];
    const stored = fromEntityFormData(
      'calendar.work',
      toEntityFormData(previous),
      previous,
      '#ff6c92',
    );

    expect(toEntityFormData(stored).accent_color_mode).toBe(mode);
  });

  /**
   * The invariant underneath all nine cases above, and the one worth keeping: whatever
   * value a mode stores must derive back to that mode. Anything that breaks this makes a
   * dropdown unselectable, whichever transition happens to expose it.
   */
  it.each(MODES)('stores a value for %s that re-derives to %s', (mode) => {
    const stored = asEntityConfig(move(mode === 'inherit' ? 'custom' : 'inherit', mode));

    expect(accentColorModeOf(stored.accent_color)).toBe(mode);
  });

  it('never carries the sentinel into a custom colour', () => {
    // The one-line cause, asserted directly rather than only through its symptom.
    const stored = asEntityConfig(move('home_assistant', 'custom'));

    expect(stored.accent_color).not.toBe(SENTINEL);
    expect(stored.accent_color).toBe('#ff6c92');
  });
});

describe('entity colours: the card-wide control has no such hole', () => {
  /**
   * Confirmed rather than assumed. Its `apply` rejects the sentinel before carrying, so
   * the two-mode equivalent of the matrix above holds.
   */
  const CARD_MODES = ['custom', 'home_assistant'] as const;

  function moveCardWide(from: string, to: string) {
    const config = buildConfig({
      accent_color: from === 'home_assistant' ? SENTINEL : '#ff6347',
    });
    const { changes } = applySyntheticChange('accent_color_mode', to, config);

    return { ...config, ...changes } as Types.Config;
  }

  const cardTransitions = CARD_MODES.flatMap((from) =>
    CARD_MODES.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it('has both ordered transitions', () => {
    expect(cardTransitions).toHaveLength(2);
  });

  it.each(cardTransitions)('goes from %s to %s and stays there', (from, to) => {
    expect(accentColorMode(moveCardWide(from, to))).toBe(to);
  });

  it('never carries the sentinel into a custom colour', () => {
    expect(moveCardWide('home_assistant', 'custom').accent_color).not.toBe(SENTINEL);
  });
});

describe('entity colours: the per-calendar round trip', () => {
  /**
   * Reported from live testing: picking "Custom color" on a calendar snapped straight back
   * to "Follow the card".
   *
   * `custom` is the one mode with no value of its own to be derived from — `inherit` is
   * the absent key and `home_assistant` is the sentinel, but a custom colour the user has
   * not typed yet is indistinguishable from no colour at all. Storing nothing therefore
   * re-derived as `inherit` on the very next render, and the dropdown could never stay
   * where it was put. The card-wide control never had this because its `apply` always
   * writes a concrete colour.
   *
   * The round trip is the assertion, not the stored value: what the user sees is the
   * dropdown after the form re-renders.
   */
  it('stays in custom mode after picking it, before any colour is typed', () => {
    const stored = fromEntityFormData('calendar.work', { accent_color_mode: 'custom' });

    expect(toEntityFormData(stored).accent_color_mode).toBe('custom');
  });

  it('seeds the colour a calendar was already showing', () => {
    // Picking "custom" starts from what is on screen rather than jumping to the shipped
    // blue, so the first thing the user sees is the colour they were looking at.
    const stored = fromEntityFormData(
      'calendar.work',
      { accent_color_mode: 'custom' },
      'calendar.work',
      '#ff6c92',
    );

    expect(stored).toEqual({ entity: 'calendar.work', accent_color: '#ff6c92' });
  });

  it('falls back to the shipped default when the card itself follows Home Assistant', () => {
    // The editor cannot know which colour Home Assistant holds for this calendar — that
    // map belongs to the render path — so the sentinel is not a seed and the floor applies.
    const stored = fromEntityFormData(
      'calendar.work',
      { accent_color_mode: 'custom' },
      'calendar.work',
      SENTINEL,
    );

    expect(stored).toEqual({ entity: 'calendar.work', accent_color: DEFAULT_ACCENT });
  });

  it('keeps a colour the user has already typed rather than reseeding it', () => {
    const stored = fromEntityFormData(
      'calendar.work',
      { accent_color_mode: 'custom', accent_color: '#123456' },
      'calendar.work',
      '#ff6c92',
    );

    expect(stored).toEqual({ entity: 'calendar.work', accent_color: '#123456' });
  });

  it('shows a stored colour back as a custom one', () => {
    const data = toEntityFormData({ entity: 'calendar.work', accent_color: '#ff6347' });

    expect(data.accent_color_mode).toBe('custom');
    expect(data.accent_color).toBe('#ff6347');
  });

  it('never writes the mode key, in any mode', () => {
    for (const mode of ['inherit', 'home_assistant', 'custom']) {
      const stored = fromEntityFormData('calendar.work', {
        accent_color_mode: mode,
        accent_color: '#ff6347',
      });

      expect(Object.keys(stored)).not.toContain('accent_color_mode');
    }
  });

  it('stores the sentinel when a calendar follows Home Assistant', () => {
    const stored = fromEntityFormData('calendar.work', {
      accent_color_mode: 'home_assistant',
      accent_color: '#ff6347',
    });

    expect(stored).toEqual({ entity: 'calendar.work', accent_color: SENTINEL });
  });

  it('drops the colour entirely when a calendar follows the card', () => {
    const stored = fromEntityFormData(
      'calendar.work',
      { accent_color_mode: 'inherit', accent_color: '#ff6347' },
      { entity: 'calendar.work', accent_color: '#ff6347' },
    );

    // Back to a bare id: an entry carrying no settings is stored as a plain string.
    expect(stored).toBe('calendar.work');
  });

  it('leaves an untouched calendar byte-identical', () => {
    const previous: Types.EntityConfig = { entity: 'calendar.work', accent_color: '#ff6347' };
    const stored = fromEntityFormData('calendar.work', toEntityFormData(previous), previous);

    expect(stored).toEqual(previous);
  });
});
