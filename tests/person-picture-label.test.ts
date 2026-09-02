import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, SINGLE_EVENT, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fromEntityFormData, toEntityFormData } from '../src/rendering/editor/entities';
import {
  LABEL_ICON_SOURCE,
  LABEL_IMAGE_SOURCE,
  LABEL_TYPE,
  buildEntitySchema,
  entitySchemaFor,
  labelIconSourceOf,
  labelImageSourceOf,
} from '../src/rendering/editor/schemas/entity';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';
import { firstPersonEntityId, isPersonEntityId, personPicture } from '../src/utils/person-pictures';

/**
 * A calendar label that follows the picture Home Assistant holds for a person (#215).
 *
 * The half of that issue #568 did not cover. That change taught the card to read any address
 * Home Assistant serves, so *pasting* `/api/image/serve/…/512x512` into `label` works — which
 * fixed the symptom the reporter hit. What they asked for was the other thing: **"an option
 * where you can select a person"**, so the card resolves the picture itself and a photo
 * changed in Home Assistant reaches the card instead of being copied into it by hand.
 *
 * Everything here is written against a branch a default config never takes: `label` is opt-in
 * and a person id is opt-in twice over, so a suite built from `buildConfig()` alone renders
 * none of it and would agree perfectly with the feature deleted.
 */

const ENTITY = 'calendar.work';

const PERSON = 'person.anna';

const PICTURE = '/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512';

/**
 * A `hass` holding a picture for one person and nothing else of interest.
 *
 * Deliberately bare rather than a fake of Home Assistant: `personPicture` reads exactly one
 * path, and a fixture carrying more would invite a test to lean on something the production
 * read never touches.
 */
function hassWith(picture?: string): Types.Hass {
  return {
    states: {
      [ENTITY]: { entity_id: ENTITY, state: 'on', attributes: {} },
      [PERSON]: {
        entity_id: PERSON,
        state: 'home',
        attributes: picture === undefined ? {} : { entity_picture: picture },
      },
    },
  } as unknown as Types.Hass;
}

describe('recognising a person entity id', () => {
  it('matches a person', () => {
    for (const id of ['person.anna', 'person.a', 'person.ben_2', 'person.jean_luc']) {
      expect(isPersonEntityId(id), id).toBe(true);
    }
  });

  /**
   * Anchored at both ends, so a label that merely *mentions* a person is still a label. The
   * uppercase and dotted forms are not entity ids Home Assistant can produce at all — it
   * slugifies an object id — so accepting them would only widen the collision with real text.
   */
  it('declines anything that is not one whole entity id', () => {
    for (const near of [
      'Person.anna',
      'person.Anna',
      'person.',
      'person',
      'persons.anna',
      'calendar.anna',
      'person.anna.picture',
      'ask person.anna',
      'person.anna ',
      '/api/image/serve/person.anna',
    ]) {
      expect(isPersonEntityId(near), `${near} is not a person entity id`).toBe(false);
    }
  });

  it.each([
    ['a number', 42],
    ['nothing', undefined],
    ['null', null],
    ['an object', { entity: PERSON }],
  ])('declines %s', (_name, value) => {
    expect(isPersonEntityId(value)).toBe(false);
  });
});

describe('reading a person id as a label shape', () => {
  /**
   * The wrinkle the whole feature turns on, and the state of things before it. `getLabelType`
   * reads a label's shape off its value: a person id carries no colon, no leading slash, no
   * scheme and no picture extension, so every test declines it and the final `return 'text'`
   * claimed it — drawing the characters `person.anna` in front of every event.
   */
  it('reads as an image rather than as text', () => {
    expect(Helpers.getLabelType(PERSON)).toBe('image');
  });

  /**
   * 🚨 The ten strings the person arm and the extension arm can both claim — `person.` followed
   * by one of the nine picture extensions — and what settles them. **Not** an ordering test:
   * both arms answer `image`, so moving the person arm below the extension one changes
   * `getLabelType` for nothing (checked by moving it and running the suite; 2810 unit tests,
   * none cared). What settles them is `resolveEntityLabel`, which asks `isPersonEntityId` and
   * nothing else — so these resolve as people wherever the arm sits, which is why the
   * resolution below is the assertion that carries this test and the classification is only
   * the setup for it.
   *
   * The right answer for the ten: they are legal person ids, but as image paths they are
   * *relative* ones, and a dashboard-relative path is not somewhere Home Assistant serves
   * anything. So nothing loadable is given up.
   */
  it.each(['person.png', 'person.gif', 'person.svg', 'person.webp', 'person.jpeg'])(
    'resolves %s as a person rather than as a relative image path',
    (id) => {
      expect(Helpers.getLabelType(id), id).toBe('image');
      expect(isPersonEntityId(id), id).toBe(true);

      const hass = {
        states: { [id]: { entity_id: id, state: 'home', attributes: { entity_picture: PICTURE } } },
      } as unknown as Types.Hass;

      expect(
        EventUtils.resolveEntityLabel(
          ENTITY,
          buildConfig({ entities: [{ entity: ENTITY, label: id }] }),
          undefined,
          hass,
        ),
        id,
      ).toBe(PICTURE);
    },
  );

  /**
   * The escape hatch this claim rests on, and the same one that makes `label: home-assistant`
   * and a slash-leading word recoverable. An explicit `label_type` outranks shape inference,
   * so a calendar that genuinely wants those characters can still have them.
   */
  it('still renders as words when the configuration insists it is text', () => {
    expect(Helpers.resolveLabelType(PERSON, 'text')).toBe('text');
  });

  /**
   * The near-misses have to keep their old shape, or the arm is a wider net rather than a new
   * one. `person` alone and `persons.anna` are words; `calendar.anna` is the shape a user
   * might reach for by mistake and is deliberately *not* claimed, because restricting the
   * inference to one domain is what keeps `v2.0` and `Sprint.3` out of it.
   */
  it.each([
    ['a bare domain word', 'person', 'text'],
    ['a plural', 'persons.anna', 'text'],
    ['a calendar entity id', 'calendar.anna', 'text'],
    ['a version number', 'v2.0', 'text'],
    ['an mdi icon', 'mdi:account', 'icon'],
    ['a pasted picture address', PICTURE, 'image'],
  ] as ReadonlyArray<readonly [string, string, Helpers.LabelType]>)(
    'still reads %s as %s',
    (_name, value, expected) => {
      expect(Helpers.getLabelType(value), value).toBe(expected);
    },
  );
});

describe('reading the picture Home Assistant holds', () => {
  it('reads it from the person state attributes', () => {
    expect(personPicture(PERSON, hassWith(PICTURE))).toBe(PICTURE);
  });

  /**
   * Home Assistant omits the attribute entirely for a person with no picture — absent, not
   * present-and-empty. The empty string is covered anyway because both have to reach the same
   * fall-through for the render path below to be safe.
   */
  it.each([
    ['no entity_picture attribute at all', undefined],
    ['an empty entity_picture attribute', ''],
  ])('returns nothing for %s', (_name, picture) => {
    expect(personPicture(PERSON, hassWith(picture))).toBeUndefined();
  });

  it.each([
    ['no hass yet', undefined],
    ['a null hass', null],
  ])('returns nothing given %s', (_name, hass) => {
    expect(personPicture(PERSON, hass as Types.Hass | null | undefined)).toBeUndefined();
  });

  it('returns nothing for a person hass has never heard of', () => {
    expect(personPicture('person.gone', hassWith(PICTURE))).toBeUndefined();
  });

  /**
   * Checked against a live instance rather than assumed: `person.ben` carries no `user_id`
   * and does have an `entity_picture`. Gating on a linked login would have dropped exactly
   * those people, and nothing about a picture depends on one.
   */
  it('reads a person with no linked user', () => {
    const hass = {
      states: {
        'person.ben': {
          entity_id: 'person.ben',
          state: 'home',
          attributes: { entity_picture: PICTURE, user_id: null },
        },
      },
    } as unknown as Types.Hass;

    expect(personPicture('person.ben', hass)).toBe(PICTURE);
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

  it('substitutes the picture Home Assistant holds for the person', () => {
    expect(resolve({ entity: ENTITY, label: PERSON }, hassWith(PICTURE))).toBe(PICTURE);
  });

  /**
   * 🚨 The one asymmetry this feature can get backwards, and the falsifier for it.
   *
   * The icon sentinel resolves from the **calendar's own** entity id, because the icon belongs
   * to the calendar being labelled. A person's picture belongs to a **different entity** — the
   * one the `label` names — so it must be looked up by the label value.
   *
   * This fixture is built to fail the mistake rather than to pass the fix: the *calendar*
   * carries an `entity_picture` and the *person* carries none. Reading the calendar's id, as
   * the icon path does, returns the calendar's picture and every other test in this file still
   * passes. Reading the label's, as production does, correctly finds nothing.
   */
  it('reads the person named by the label, not the calendar carrying it', () => {
    const hass = {
      states: {
        [ENTITY]: {
          entity_id: ENTITY,
          state: 'on',
          attributes: { entity_picture: '/api/image/serve/the-calendars-own/512x512' },
        },
        [PERSON]: { entity_id: PERSON, state: 'home', attributes: {} },
      },
    } as unknown as Types.Hass;

    expect(resolve({ entity: ENTITY, label: PERSON }, hass)).toBeUndefined();
  });

  /**
   * The fall-through, and it is `undefined` rather than the raw id on purpose: `renderLabel`
   * draws nothing at all for a falsy label, which is the same nothing an unlabelled calendar
   * draws. Returning `person.anna` would print the entity id, which is the defect this feature
   * exists to remove.
   */
  it.each([
    ['the person has no picture', hassWith()],
    ['hass has never heard of the person', { states: {} } as unknown as Types.Hass],
    ['there is no hass yet', undefined],
  ])('resolves to nothing when %s', (_name, hass) => {
    expect(resolve({ entity: ENTITY, label: PERSON }, hass)).toBeUndefined();
  });

  /**
   * An explicit shape outranks the stand-in, exactly as it does for the icon sentinel — and
   * `image` is the one value that does **not** suppress it, because that is the shape a person
   * id resolves to. Naming the natural shape is agreement, not an override.
   */
  it.each([
    ['text', PERSON],
    ['none', PERSON],
    ['icon', PERSON],
  ] as ReadonlyArray<readonly [Helpers.LabelType, string]>)(
    'leaves the id alone when the configuration says %s',
    (labelType, expected) => {
      expect(
        resolve({ entity: ENTITY, label: PERSON, label_type: labelType }, hassWith(PICTURE)),
      ).toBe(expected);
    },
  );

  it('still resolves when the configuration names the shape it already has', () => {
    expect(resolve({ entity: ENTITY, label: PERSON, label_type: 'image' }, hassWith(PICTURE))).toBe(
      PICTURE,
    );
  });

  /** A calendar labelled anything else is untouched by any of this. */
  it.each([
    ['a word', 'Work'],
    ['an mdi icon', 'mdi:briefcase'],
    ['a pasted address', PICTURE],
  ])('passes %s straight through', (_name, label) => {
    expect(resolve({ entity: ENTITY, label }, hassWith(PICTURE))).toBe(label);
  });
});

describe('rendering a calendar labelled with a person', () => {
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
   * time — `processEvents` sets it to the very object in `config.entities`. A fixture that
   * skips it renders a card no user can configure, because `renderEventTitle` reads
   * `label_type` straight off the stamp.
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

  it('draws the picture as an image', () => {
    const el = renderLabelElement({ entity: ENTITY, label: PERSON }, hassWith(PICTURE));

    expect(el?.tagName.toLowerCase()).toBe('img');
    expect(el?.getAttribute('src')).toBe(PICTURE);
  });

  /**
   * The end of the fall-through, checked at the DOM rather than at the resolver: no label
   * element, not an empty one and not the entity id as text. All three look the same to a
   * resolver test and only one of them is right on screen.
   */
  it('draws no label at all when the person has no picture', () => {
    expect(renderLabelElement({ entity: ENTITY, label: PERSON }, hassWith())).toBe(null);
  });

  it('draws the words when the configuration insists the id is text', () => {
    const el = renderLabelElement(
      { entity: ENTITY, label: PERSON, label_type: 'text' },
      hassWith(PICTURE),
    );

    expect(el?.tagName.toLowerCase()).toBe('span');
    expect(el?.textContent?.trim()).toBe(PERSON);
  });

  /**
   * 🚨 What the reporter asked for, and the property that pasting an address cannot have.
   *
   * The resolution happens at render time, so a photo changed in Home Assistant reaches the
   * card on its next state update — no refetch, no reload. Same config, same events, same
   * grouping: only `hass` moves. A resolver that ran at fetch time would return the first
   * address twice and this would fail.
   */
  it('follows a picture changed in Home Assistant without refetching', () => {
    const entity = { entity: ENTITY, label: PERSON };

    expect(renderLabelElement(entity, hassWith(PICTURE))?.getAttribute('src')).toBe(PICTURE);
    expect(
      renderLabelElement(entity, hassWith('/api/image/serve/new/512x512'))?.getAttribute('src'),
    ).toBe('/api/image/serve/new/512x512');
  });
});

describe('the editor’s image source control', () => {
  const ctx = { view: 'list' as const, config: buildConfig(), language: 'en' };

  function fieldsFor(entry: string | Types.EntityConfig): string[] {
    const config = typeof entry === 'string' ? { entity: entry } : entry;

    return (
      entitySchemaFor(
        buildEntitySchema(ctx),
        Helpers.resolveLabelType(config.label, config.label_type),
        'inherit',
        labelIconSourceOf(config.label),
        true,
        labelImageSourceOf(config.label),
      )
        // Section headings are `constant` nodes rather than options, and they carry names of
        // their own. Left in, the positional assertion below would be pinning the heading.
        .filter((node) => !('type' in node && node.type === 'constant'))
        .map((node) => node.name)
        .filter(Boolean)
    );
  }

  function labelNode(entry: Types.EntityConfig): Record<string, unknown> | undefined {
    return entitySchemaFor(
      buildEntitySchema(ctx),
      Helpers.resolveLabelType(entry.label, entry.label_type),
      'inherit',
      labelIconSourceOf(entry.label),
      true,
      labelImageSourceOf(entry.label),
    ).find((node) => node.name === 'label') as Record<string, unknown> | undefined;
  }

  it('reads the source off the stored label', () => {
    expect(labelImageSourceOf(PERSON)).toBe('person');
    expect(labelImageSourceOf(PICTURE)).toBe('custom');
    expect(labelImageSourceOf('/local/work.png')).toBe('custom');
    expect(labelImageSourceOf(undefined)).toBe('custom');
  });

  /**
   * The source qualifies the control below it, so it precedes it — the same ordering rule that
   * puts the icon source before the icon picker and `filter_field` before `blocklist`.
   */
  it('sits between the shape dropdown and the picker', () => {
    expect(fieldsFor({ entity: ENTITY, label: PERSON }).slice(0, 3)).toEqual([
      LABEL_TYPE,
      LABEL_IMAGE_SOURCE,
      'label',
    ]);
  });

  /**
   * 🚨 Both modes keep a control, unlike the icon source, which drops its picker in the mode
   * that follows Home Assistant. An icon label following Home Assistant has nothing left to
   * choose; a person's picture still needs somebody named, so dropping the picker would leave
   * the mode unable to say who.
   */
  it('offers a person picker in the person mode and a path field in the custom one', () => {
    const person = labelNode({ entity: ENTITY, label: PERSON });
    expect(person, 'the person mode kept no control').toBeDefined();
    expect((person as { selector: Record<string, unknown> }).selector).toEqual({
      entity: { filter: { domain: 'person' } },
    });

    const custom = labelNode({ entity: ENTITY, label: PICTURE });
    expect((custom as { selector: Record<string, unknown> }).selector).toHaveProperty('text');
  });

  it.each([
    ['a text label', { entity: ENTITY, label: 'Work' }],
    ['an icon label', { entity: ENTITY, label: 'mdi:briefcase' }],
    ['no label at all', ENTITY],
  ])('offers no image source for %s', (_name, entry) => {
    expect(fieldsFor(entry)).not.toContain(LABEL_IMAGE_SOURCE);
  });

  /** The two sources never appear together: each belongs to one shape. */
  it('offers no icon source alongside it', () => {
    const fields = fieldsFor({ entity: ENTITY, label: PERSON });

    expect(fields).toContain(LABEL_IMAGE_SOURCE);
    expect(fields).not.toContain(LABEL_ICON_SOURCE);
    expect(fields).not.toContain('label_icon_color');
  });
});

describe('the editor’s image source round trip', () => {
  const HASS = {
    states: {
      [ENTITY]: { entity_id: ENTITY, state: 'on', attributes: {} },
      'person.zoe': { entity_id: 'person.zoe', state: 'home', attributes: {} },
      [PERSON]: { entity_id: PERSON, state: 'home', attributes: { entity_picture: PICTURE } },
    },
  } as unknown as Types.Hass;

  function write(
    previous: string | Types.EntityConfig,
    overrides: Record<string, unknown> = {},
    hass: Types.Hass | undefined = HASS,
  ): Types.EntityConfig {
    return fromEntityFormData(
      ENTITY,
      { ...toEntityFormData(previous), ...overrides },
      previous,
      undefined,
      hass,
    ) as Types.EntityConfig;
  }

  it('stores the person the picker names, and nothing restating its shape', () => {
    expect(write({ entity: ENTITY, label: PERSON })).toEqual({ entity: ENTITY, label: PERSON });
  });

  /**
   * 🚨 The mode has no value of its own until somebody is picked, so choosing it has to seed
   * one — otherwise nothing is stored, the next derivation reads `custom`, and the dropdown
   * snaps back before the picker is ever shown. This is `accentColorFor`'s "custom has to be
   * seeded rather than left empty" one option over, and `tests/entity-colors.test.ts` walks
   * every ordered transition of every per-calendar dropdown to catch it generically.
   */
  it('seeds a person when the mode is chosen from a typed path', () => {
    const written = write(
      { entity: ENTITY, label: '/local/work.png' },
      {
        [LABEL_IMAGE_SOURCE]: 'person',
      },
    );

    expect(isPersonEntityId(written.label)).toBe(true);
    expect(labelImageSourceOf(written.label)).toBe('person');
  });

  /**
   * Which person, and why it is not simply the first alphabetically. Seeding somebody with no
   * picture renders **nothing**, so the user picks "a person's picture" and sees no change at
   * all — the precise failure this feature was opened about. `person.zoe` sorts second and has
   * no picture; `person.anna` sorts first and has one, so this passes either way unless the
   * preference is expressed. The pair below is the one that separates them.
   */
  it('prefers a person Home Assistant actually holds a picture for', () => {
    const hass = {
      states: {
        'person.aaron': { entity_id: 'person.aaron', state: 'home', attributes: {} },
        'person.zoe': {
          entity_id: 'person.zoe',
          state: 'home',
          attributes: { entity_picture: PICTURE },
        },
      },
    } as unknown as Types.Hass;

    expect(firstPersonEntityId(hass)).toBe('person.zoe');
  });

  it('falls back to any person when none has a picture', () => {
    const hass = {
      states: {
        'person.zoe': { entity_id: 'person.zoe', state: 'home', attributes: {} },
        'person.aaron': { entity_id: 'person.aaron', state: 'home', attributes: {} },
      },
    } as unknown as Types.Hass;

    expect(firstPersonEntityId(hass)).toBe('person.aaron');
  });

  it.each([
    ['an instance with no people', { states: { [ENTITY]: {} } } as unknown as Types.Hass],
    ['no hass at all', undefined],
  ])('seeds nothing given %s', (_name, hass) => {
    expect(firstPersonEntityId(hass)).toBeUndefined();
  });

  /**
   * The other direction, and the reason the guard runs both ways where the icon sentinel needs
   * one. Both image modes hold a real value, so the form hands back the person when moving
   * away from the picker — and storing it would derive the dropdown straight back.
   */
  it('drops the person when the mode moves back to a typed path', () => {
    const written = write(
      { entity: ENTITY, label: PERSON },
      {
        [LABEL_IMAGE_SOURCE]: 'custom',
      },
    );

    expect(written.label).toBeUndefined();
    expect(labelImageSourceOf(written.label)).toBe('custom');
  });

  /**
   * Nothing about this reaches the other two label shapes. Moving a person label to **Text**
   * keeps the id as words, which is the escape hatch spelled out through the editor rather
   * than by hand.
   */
  it('keeps the id as words when the shape is moved to text', () => {
    const written = write({ entity: ENTITY, label: PERSON }, { [LABEL_TYPE]: 'text' });

    expect(written).toEqual({ entity: ENTITY, label: PERSON, label_type: 'text' });
  });

  /**
   * A calendar the reporter had already configured by hand, opened in the editor. #568 taught
   * the card to read the pasted address, so it is an image either way — what matters is that
   * touching the panel leaves it alone rather than rewriting it into a person.
   */
  it('leaves a pasted address alone', () => {
    expect(write({ entity: ENTITY, label: PICTURE })).toEqual({ entity: ENTITY, label: PICTURE });
  });
});
