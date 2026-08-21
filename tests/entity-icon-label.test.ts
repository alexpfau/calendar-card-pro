import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, SINGLE_EVENT, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fromEntityFormData, toEntityFormData } from '../src/rendering/editor/entities';
import {
  LABEL_ICON_SOURCE,
  buildEntitySchema,
  entitySchemaFor,
  labelIconSourceOf,
} from '../src/rendering/editor/schemas/entity';
import * as Render from '../src/rendering/render';
import { ENTITY_COLOR_SENTINEL } from '../src/utils/entity-colors';
import { ENTITY_ICON_SENTINEL, entityIcon, isEntityIconSentinel } from '../src/utils/entity-icons';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

/**
 * A calendar label that follows the icon Home Assistant holds for the entity (#188).
 *
 * The half of that issue the colors did not cover. `accent_color: home-assistant` already
 * takes the registry's color; this does the same for the label, so an icon changed in Home
 * Assistant reaches the card instead of being copied into it by hand and drifting.
 *
 * Everything here is written against the branch a default config never takes — the sentinel
 * is opt-in, so a suite built from `buildConfig()` alone renders none of it and would agree
 * perfectly with the feature deleted.
 */

const ENTITY = 'calendar.work';

/**
 * A `hass` whose only interesting property is the icon it holds for one calendar.
 *
 * Deliberately a bare object rather than a fake of Home Assistant: `entityIcon` reads exactly
 * one path, and a fixture carrying more would invite a test to lean on something the
 * production read never touches.
 */
function hassWith(icon?: string): Types.Hass {
  return {
    states: {
      [ENTITY]: {
        entity_id: ENTITY,
        state: 'on',
        attributes: icon === undefined ? {} : { icon },
      },
    },
  } as unknown as Types.Hass;
}

describe('the sentinel itself', () => {
  /**
   * 🚨 Pinned against the colors' spelling rather than against a literal, so the two cannot
   * drift apart quietly. They mean the same thing one option apart — "inherit this from Home
   * Assistant" — and a user who learns the word for one should not have to learn a second.
   * Changing either spelling should be a deliberate act that fails here first.
   */
  it('is spelled exactly like the accent colour sentinel', () => {
    expect(ENTITY_ICON_SENTINEL).toBe(ENTITY_COLOR_SENTINEL);
  });

  it('matches only itself', () => {
    expect(isEntityIconSentinel(ENTITY_ICON_SENTINEL)).toBe(true);

    for (const near of ['Home Assistant', 'home assistant', 'homeassistant', 'home-assistant ']) {
      expect(isEntityIconSentinel(near), `${near} is not the sentinel`).toBe(false);
    }
  });

  /**
   * The wrinkle the whole feature turns on. `getLabelType` reads a label's shape off its
   * value, and every one of its tests declines a bare hyphenated word — so without an
   * explicit case the sentinel falls through to `text` and the card renders the literal
   * string `home-assistant` where the icon should be.
   */
  it('reads as an icon rather than as text', () => {
    expect(Helpers.getLabelType(ENTITY_ICON_SENTINEL)).toBe('icon');
  });

  /**
   * The escape hatch the spelling decision rests on. A calendar that genuinely wants those
   * words as a text label can still say so, because an explicit `label_type` outranks shape
   * inference — which is what makes the collision recoverable rather than merely unlikely.
   */
  it('still renders as words when the configuration insists it is text', () => {
    expect(Helpers.resolveLabelType(ENTITY_ICON_SENTINEL, 'text')).toBe('text');
  });
});

describe('reading the icon Home Assistant holds', () => {
  it('reads it from the entity state attributes', () => {
    expect(entityIcon(ENTITY, hassWith('mdi:briefcase'))).toBe('mdi:briefcase');
  });

  /**
   * Home Assistant omits the attribute entirely for an entity it holds no icon for — it is
   * absent, not present-and-empty, which was checked against a live instance. The empty
   * string is covered anyway because `undefined` and `''` have to reach the same fall-through
   * for the render path below to be safe.
   */
  it.each([
    ['no icon attribute at all', undefined],
    ['an empty icon attribute', ''],
  ])('returns nothing for %s', (_name, icon) => {
    expect(entityIcon(ENTITY, hassWith(icon))).toBeUndefined();
  });

  it.each([
    ['no hass yet', undefined],
    ['a null hass', null],
  ])('returns nothing given %s', (_name, hass) => {
    expect(entityIcon(ENTITY, hass as Types.Hass | null | undefined)).toBeUndefined();
  });

  it('returns nothing for a calendar hass has never heard of', () => {
    expect(entityIcon('calendar.gone', hassWith('mdi:briefcase'))).toBeUndefined();
  });
});

describe('resolving one calendar’s label', () => {
  function resolve(
    entity: string | Types.EntityConfig,
    hass?: Types.Hass | null,
  ): string | undefined {
    return EventUtils.resolveEntityLabel(
      ENTITY,
      buildConfig({ entities: [entity] }),
      undefined,
      hass,
    );
  }

  it('substitutes the icon Home Assistant holds', () => {
    expect(
      resolve({ entity: ENTITY, label: ENTITY_ICON_SENTINEL }, hassWith('mdi:briefcase')),
    ).toBe('mdi:briefcase');
  });

  /**
   * The fall-through, and the reason it is `undefined` rather than an empty icon. `renderLabel`
   * draws nothing at all for a falsy label, which is the same nothing an unlabelled calendar
   * draws; an `ha-icon` with no icon in it is a sized, empty box that indents the title as
   * though a label were there.
   */
  it('falls through to no label when Home Assistant holds no icon', () => {
    expect(resolve({ entity: ENTITY, label: ENTITY_ICON_SENTINEL }, hassWith())).toBeUndefined();
  });

  it('leaves a label that is not the sentinel exactly as configured', () => {
    expect(resolve({ entity: ENTITY, label: 'mdi:home' }, hassWith('mdi:briefcase'))).toBe(
      'mdi:home',
    );
    expect(resolve({ entity: ENTITY, label: '🎉' }, hassWith('mdi:briefcase'))).toBe('🎉');
    expect(resolve(ENTITY, hassWith('mdi:briefcase'))).toBeUndefined();
  });

  it('honours an explicit text shape over the sentinel', () => {
    expect(
      resolve(
        { entity: ENTITY, label: ENTITY_ICON_SENTINEL, label_type: 'text' },
        hassWith('mdi:briefcase'),
      ),
    ).toBe(ENTITY_ICON_SENTINEL);
  });

  it('substitutes under an explicit icon shape too', () => {
    expect(
      resolve(
        { entity: ENTITY, label: ENTITY_ICON_SENTINEL, label_type: 'icon' },
        hassWith('mdi:briefcase'),
      ),
    ).toBe('mdi:briefcase');
  });
});

describe('rendering a calendar that follows Home Assistant', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Runs the real list pipeline and returns the label element, if one rendered.
   *
   * `_matchedConfig` is stamped here by reference because production stamps it at **fetch**
   * time, not during grouping — `processEvents` sets it to the very object in
   * `config.entities`. A fixture that skips it renders a card no user can configure:
   * `renderEventTitle` reads `label_icon_color` and `label_type` straight off the stamp, so
   * both silently vanish and two of the tests below would be measuring the fixture.
   */
  function renderLabelElement(
    entity: string | Types.EntityConfig,
    hass?: Types.Hass | null,
  ): Element | null {
    const config = buildConfig({ entities: [entity] });
    const events = SINGLE_EVENT.map((event) => ({
      ...event,
      _entityId: ENTITY,
      _matchedConfig: typeof entity === 'object' ? entity : undefined,
    }));
    const days = EventUtils.groupEventsByDay(events, config, false, 'en');

    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, 'en', undefined, hass), container);

    return container.querySelector('.summary > *:first-child:not(.event-title)');
  }

  it('draws the icon Home Assistant holds', () => {
    const el = renderLabelElement(
      { entity: ENTITY, label: ENTITY_ICON_SENTINEL },
      hassWith('mdi:briefcase'),
    );

    expect(el?.tagName.toLowerCase()).toBe('ha-icon');
    expect(el?.getAttribute('icon')).toBe('mdi:briefcase');
  });

  /**
   * The end of the fall-through, checked at the DOM rather than at the resolver: no label
   * element, not an empty one. A control that renders `<ha-icon icon="">` looks identical in
   * a resolver test and wrong on screen.
   */
  it('draws no label at all when Home Assistant holds no icon', () => {
    expect(renderLabelElement({ entity: ENTITY, label: ENTITY_ICON_SENTINEL }, hassWith())).toBe(
      null,
    );
  });

  it('still tints the inherited icon with the calendar’s own colour', () => {
    const el = renderLabelElement(
      { entity: ENTITY, label: ENTITY_ICON_SENTINEL, label_icon_color: 'red' },
      hassWith('mdi:briefcase'),
    );

    expect(el?.getAttribute('style')).toContain('color: red');
  });

  it('renders the words when the configuration insists the sentinel is text', () => {
    const el = renderLabelElement(
      { entity: ENTITY, label: ENTITY_ICON_SENTINEL, label_type: 'text' },
      hassWith('mdi:briefcase'),
    );

    expect(el?.tagName.toLowerCase()).toBe('span');
    expect(el?.textContent?.trim()).toBe(ENTITY_ICON_SENTINEL);
  });

  /**
   * 🚨 The whole point of the issue, and the one thing about this feature that cannot move.
   *
   * `processEvents` bakes `_entityLabel` into the cached event, so resolving the sentinel
   * there would freeze whichever icon Home Assistant held at fetch time — reintroducing, as
   * the fix for it, exactly the drift #188 was opened about. Resolving at render time is what
   * makes the second render below disagree with the first.
   *
   * Same config, same events, same grouping: only `hass` moves. A resolver that ran any
   * earlier would return `mdi:briefcase` twice and this would fail.
   */
  it('follows an icon changed in Home Assistant without refetching', () => {
    const entity = { entity: ENTITY, label: ENTITY_ICON_SENTINEL };

    expect(renderLabelElement(entity, hassWith('mdi:briefcase'))?.getAttribute('icon')).toBe(
      'mdi:briefcase',
    );
    expect(renderLabelElement(entity, hassWith('mdi:beach'))?.getAttribute('icon')).toBe(
      'mdi:beach',
    );
  });
});

describe('the editor’s icon source control', () => {
  const ctx = { view: 'list' as const, config: buildConfig(), language: 'en' };

  function fieldsFor(entry: string | Types.EntityConfig): string[] {
    const config = typeof entry === 'string' ? { entity: entry } : entry;

    return (
      entitySchemaFor(
        buildEntitySchema(ctx),
        Helpers.resolveLabelType(config.label, config.label_type),
        'inherit',
        labelIconSourceOf(config.label),
      )
        // Section headings are `constant` nodes rather than options, and they carry names of
        // their own. Left in, the positional assertion below would be pinning the heading.
        .filter((node) => !('type' in node && node.type === 'constant'))
        .map((node) => node.name)
        .filter(Boolean)
    );
  }

  it('reads the source off the stored label', () => {
    expect(labelIconSourceOf(ENTITY_ICON_SENTINEL)).toBe('home_assistant');
    expect(labelIconSourceOf('mdi:home')).toBe('custom');
    expect(labelIconSourceOf(undefined)).toBe('custom');
  });

  /**
   * The source qualifies the picker, so it precedes it — the same ordering rule that puts
   * `filter_field` before `blocklist` and `allowlist`. A reader who meets the picker first has
   * already assumed the icon is theirs to choose.
   */
  it('sits between the shape dropdown and the picker', () => {
    const fields = fieldsFor({ entity: ENTITY, label: 'mdi:home' });

    expect(fields.slice(0, 4)).toEqual([
      'label_type',
      LABEL_ICON_SOURCE,
      'label',
      'label_icon_color',
    ]);
  });

  it('hides the picker while the calendar follows Home Assistant', () => {
    const fields = fieldsFor({ entity: ENTITY, label: ENTITY_ICON_SENTINEL });

    expect(fields).toContain(LABEL_ICON_SOURCE);
    expect(fields).not.toContain('label');
    // Tinting an inherited icon is still the card's choice, so this one stays.
    expect(fields).toContain('label_icon_color');
  });

  it.each([
    ['a text label', { entity: ENTITY, label: 'Work' }],
    ['an image label', { entity: ENTITY, label: '/local/work.png' }],
    ['no label at all', ENTITY],
  ])('offers no icon source for %s', (_name, entry) => {
    expect(fieldsFor(entry)).not.toContain(LABEL_ICON_SOURCE);
  });
});

describe('the editor’s icon source round trip', () => {
  const ICON_ENTRY: Types.EntityConfig = { entity: ENTITY, label_type: 'icon' };

  function write(
    previous: string | Types.EntityConfig,
    overrides: Record<string, unknown>,
    hass?: Types.Hass,
  ): string | Types.EntityConfig {
    return fromEntityFormData(
      ENTITY,
      { ...toEntityFormData(previous), ...overrides },
      previous,
      undefined,
      hass,
    );
  }

  it('stores the sentinel when the calendar starts following Home Assistant', () => {
    const written = write(ICON_ENTRY, { [LABEL_ICON_SOURCE]: 'home_assistant' });

    expect(written).toEqual({ entity: ENTITY, label: ENTITY_ICON_SENTINEL });
  });

  /**
   * The source is a form field, never a stored one — it is read back off whether `label` holds
   * the sentinel. Writing it would put a key in the user's YAML that the card never reads,
   * which is the contract `accent_color_mode` already keeps one field over.
   */
  it('never writes the source itself into the configuration', () => {
    const written = write(ICON_ENTRY, { [LABEL_ICON_SOURCE]: 'home_assistant' });

    expect(Object.keys(written as Types.EntityConfig)).not.toContain(LABEL_ICON_SOURCE);
  });

  /**
   * Nor a redundant shape beside it. `getLabelType` reads the sentinel as an icon, so
   * `needsExplicitType` has nothing left to say — and a `label_type: icon` written here would
   * be a second, quietly disagreeing source of truth for the same fact.
   */
  it('writes no redundant label_type beside the sentinel', () => {
    const written = write(ICON_ENTRY, { [LABEL_ICON_SOURCE]: 'home_assistant' });

    expect(Object.keys(written as Types.EntityConfig)).not.toContain('label_type');
  });

  /**
   * Leaving `home_assistant`, the form hands back the stored value — which *is* the sentinel.
   * Carried through, it would store the sentinel again, derive straight back to
   * `home_assistant`, and make "Custom icon" unselectable. That is the trap the accent colour
   * fell into and documents; this is the same one, one field over.
   */
  it('starts a custom icon from the one it was inheriting', () => {
    const following = { entity: ENTITY, label: ENTITY_ICON_SENTINEL };

    const written = write(following, { [LABEL_ICON_SOURCE]: 'custom' }, hassWith('mdi:briefcase'));

    expect(written).toEqual({ entity: ENTITY, label: 'mdi:briefcase' });
    expect(labelIconSourceOf((written as Types.EntityConfig).label)).toBe('custom');
  });

  /**
   * With nothing to seed from, the picker is left empty — the same place choosing "An Icon"
   * from scratch starts. The sentinel must still not survive: `custom` has to derive back to
   * `custom` whether or not Home Assistant had an icon to offer.
   */
  it('leaves the picker empty when there was no icon to inherit', () => {
    const following = { entity: ENTITY, label: ENTITY_ICON_SENTINEL };

    const written = write(following, { [LABEL_ICON_SOURCE]: 'custom' }, hassWith());

    expect((written as Types.EntityConfig).label).toBeUndefined();
    expect(labelIconSourceOf((written as Types.EntityConfig).label)).toBe('custom');
  });

  it('leaves an icon the user picked alone', () => {
    const written = write(
      { entity: ENTITY, label: 'mdi:home' },
      { [LABEL_ICON_SOURCE]: 'custom' },
      hassWith('mdi:briefcase'),
    );

    expect(written).toEqual({ entity: ENTITY, label: 'mdi:home' });
  });

  /**
   * Moving the shape away has to take the sentinel with it. Left behind, the label would read
   * as an icon again on the next derivation and the calendar would snap back to following
   * Home Assistant — with the shape dropdown saying something else.
   */
  it('drops the sentinel when the label stops being an icon', () => {
    const written = write({ entity: ENTITY, label: ENTITY_ICON_SENTINEL }, { label_type: 'none' });

    expect(written).toBe(ENTITY);
  });
});
