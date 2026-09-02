/**
 * The per-calendar panel's heading, its secondary line, and the two actions that change
 * the shape of the calendar list rather than the settings on one entry.
 *
 * Three separate things are pinned here, and each fails in a way the others cannot see.
 *
 * The **heading** is a name resolved out of `hass`, so it has three outcomes for one
 * input: a friendly name, and two different ways of having none. A test that only ever
 * supplies a populated `hass` proves nothing about a calendar the user has since deleted
 * from Home Assistant, which is the case where a blank heading would be worst — the panel
 * would name nothing at all, right where the user needs to know which entry to remove.
 *
 * The **secondary line** only earns its new half when a calendar is listed twice, and
 * duplicates are exactly what the default config does not have. Both directions are here:
 * a single listing must not gain the marker, or every card in the world grows noise.
 *
 * The **actions** are the reason the other two changed. Duplicate writes the calendar list
 * directly, because Home Assistant's picker refuses to hold the same entity twice, so the
 * one thing that has to be proven is that the picker accepts the result: its value derives
 * from `config.entities` and applies back over it, and an append that does not survive
 * that round trip would be silently undone the next time the picker fired. Reordering is
 * included because that is the round trip with the parts moving — the queue in
 * `SYNTHETIC_FIELDS.calendars` has to hand each duplicate back its own settings, in picker
 * order, and a Map keyed by entity id would pass the straight case and fail this one.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';
import editorStyles from '../src/rendering/editor/styles';
import * as Synthetic from '../src/rendering/editor/synthetic';

customElements.define('editor-entity-actions-probe', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  updateComplete: Promise<unknown>;
}

interface PanelElement extends Element {
  header?: string;
  secondary?: string;
}

interface Harness {
  element: EditorHost;
  /** The heading of every per-calendar panel, in order. */
  headers(): Array<string | undefined>;
  /** The line under every per-calendar panel's heading, in order. */
  secondaries(): Array<string | undefined>;
  /**
   * One calendar's button, by the text on it.
   *
   * @param calendar - Which calendar's row, counting from zero
   * @param label - The text on the button
   * @returns That button
   */
  action(calendar: number, label: string): HTMLButtonElement;
  emitted: Array<Record<string, unknown>>;
}

/** A calendar Home Assistant knows about, under a name that is not its id. */
const FAMILY_STATE = {
  entity_id: 'calendar.calendar_card_pro_family',
  state: 'on',
  attributes: { friendly_name: 'Calendar card pro - family' },
};

/**
 * Builds a rendered editor over the given calendars.
 *
 * @param entities - Calendars as they would be stored in the card config
 * @param states - The entities Home Assistant is holding, keyed by entity id
 * @returns Handles for driving and observing the rendered editor
 */
async function renderEditor(
  entities: ReadonlyArray<unknown>,
  states: Record<string, unknown> = {},
): Promise<Harness> {
  const element = document.createElement('editor-entity-actions-probe') as EditorHost;
  element.hass = { states, locale: { language: 'en' } };
  document.body.appendChild(element);
  element.setConfig({ entities });
  await element.updateComplete;

  const emitted: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
  });

  const panels = () =>
    Array.from(
      element.shadowRoot!.querySelectorAll('ha-expansion-panel.entity-panel'),
    ) as PanelElement[];

  return {
    element,
    headers: () => panels().map((panel) => panel.header),
    secondaries: () => panels().map((panel) => panel.secondary),
    action: (calendar, label) => {
      const row = element.shadowRoot!.querySelectorAll('.entity-actions')[calendar];
      const found = Array.from(row.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === label,
      );
      if (!found) throw new Error(`no ${label} button on calendar ${calendar}`);

      return found;
    },
    emitted,
  };
}

describe('per-calendar panel headings', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it('names the calendar the way Home Assistant does, not by its entity id', async () => {
    const harness = await renderEditor([FAMILY_STATE.entity_id], {
      [FAMILY_STATE.entity_id]: FAMILY_STATE,
    });

    expect(harness.headers()).toEqual(['Calendar card pro - family']);
  });

  it('keeps showing the entity id for a calendar Home Assistant no longer has', async () => {
    // The panel a user most needs to identify is the one for a calendar they deleted, and
    // it is the one with no name to resolve. Anything but the id here is a blank heading.
    const harness = await renderEditor(['calendar.deleted_last_week'], {
      [FAMILY_STATE.entity_id]: FAMILY_STATE,
    });

    expect(harness.headers()).toEqual(['calendar.deleted_last_week']);
  });

  it('falls back to the entity id when the state carries no usable name', async () => {
    const harness = await renderEditor(['calendar.unnamed', 'calendar.blank'], {
      'calendar.unnamed': { entity_id: 'calendar.unnamed', state: 'on', attributes: {} },
      'calendar.blank': {
        entity_id: 'calendar.blank',
        state: 'on',
        attributes: { friendly_name: '   ' },
      },
    });

    expect(harness.headers()).toEqual(['calendar.unnamed', 'calendar.blank']);
  });
});

describe('per-calendar secondary line', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it('says nothing about position when a calendar is listed once', async () => {
    const harness = await renderEditor(['calendar.a', { entity: 'calendar.b', label: 'Work' }]);

    expect(harness.secondaries()).toEqual(['Using the card settings', 'Work']);
  });

  it('numbers the panels when one calendar is listed more than once', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.family', event_type: 'all_day' },
      'calendar.other',
      { entity: 'calendar.family', event_type: 'timed' },
    ]);

    // Counted across the whole list rather than among neighbours, because the two blocks
    // for one calendar need not be adjacent — a user can drag anything between them.
    expect(harness.secondaries()).toEqual([
      'Entry 1 of 2 · Configured',
      'Using the card settings',
      'Entry 2 of 2 · Configured',
    ]);
  });

  it('keeps a label the user wrote, and numbers it as well', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.family', label: 'Birthdays' },
      { entity: 'calendar.family', label: 'Meetings' },
    ]);

    // The label stays because it is the user's own answer to "which one is this". The
    // number is added anyway: two differently-labelled panels give no hint that they are
    // the same underlying calendar, which is the thing that explains the shared heading.
    expect(harness.secondaries()).toEqual(['Entry 1 of 2 · Birthdays', 'Entry 2 of 2 · Meetings']);
  });
});

describe('duplicate and remove buttons', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it('lists the calendar again, next to the one it came from, with its settings', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      'calendar.other',
    ]);

    harness.action(0, 'Duplicate').click();
    await harness.element.updateComplete;

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0].entities).toEqual([
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      'calendar.other',
    ]);
  });

  it('gives the new block a panel of its own, numbered', async () => {
    const harness = await renderEditor([{ entity: 'calendar.family', event_type: 'all_day' }], {
      'calendar.family': {
        entity_id: 'calendar.family',
        state: 'on',
        attributes: { friendly_name: 'Family' },
      },
    });

    harness.action(0, 'Duplicate').click();
    await harness.element.updateComplete;

    expect(harness.headers()).toEqual(['Family', 'Family']);
    expect(harness.secondaries()).toEqual([
      'Entry 1 of 2 · Configured',
      'Entry 2 of 2 · Configured',
    ]);
  });

  it('puts the actions above the settings, with Remove apart from the rest', async () => {
    const harness = await renderEditor(['calendar.a']);

    // `.panel-body` is used by every panel, so this must be scoped to the per-calendar
    // one — the first match in the shadow root is the Calendars panel wrapping them all.
    const body = harness.element.shadowRoot!.querySelector('.entity-panel .panel-body')!;
    // Placement is the point of the row, not decoration: below the form it was reached
    // only after scrolling past every per-calendar setting, so nobody found it.
    expect([...body.children].map((child) => child.className || child.localName)).toEqual([
      'entity-actions',
      'entity-form',
    ]);

    // Remove sits outside the group holding the three that can be undone by doing them
    // again, so it is not one more identical-looking button beside Duplicate.
    const row = body.querySelector('.entity-actions')!;
    expect(
      [...row.querySelector('.entity-actions-safe')!.querySelectorAll('button')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Copy Settings', 'Paste Settings', 'Duplicate']);
    expect([...row.children].at(-1)!.textContent?.trim()).toBe('Remove');
  });

  it('holds Remove visually apart from the actions that can be undone', () => {
    // The DOM grouping above is only half of it: without the auto start margin the four
    // buttons sit flush together and Remove is one more identical-looking target beside
    // Duplicate. That is a rule with no DOM consequence, so it is pinned in the
    // stylesheet, the way this project pins the card's own layout rules.
    const css = editorStyles.cssText;
    expect(typeof css).toBe('string');

    // Logical, not `margin-left`: Home Assistant renders right-to-left for several of the
    // languages the editor ships in, and Remove has to stay on the far side in both.
    expect(css).toMatch(/\.entity-actions\s+\.destructive\s*\{[^}]*margin-inline-start:\s*auto/);
    expect(css).toMatch(/\.text-button\.destructive\s*\{[^}]*color:\s*var\(--error-color/);
  });

  it('drops one block without touching the other copy of the same calendar', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);

    harness.action(0, 'Remove').click();
    await harness.element.updateComplete;

    // The picker cannot do this. `_entityChanged` upstream rebuilds the list by filtering
    // out every entry equal to the row's old value, so clearing either of these two rows
    // takes both — the survivor here is the whole reason the button exists.
    expect(harness.emitted[0].entities).toEqual([
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
  });

  it('removes the last calendar, the way clearing the picker row would', async () => {
    const harness = await renderEditor(['calendar.only']);

    harness.action(0, 'Remove').click();
    await harness.element.updateComplete;

    expect(harness.emitted[0].entities).toEqual([]);
  });
});

describe('duplicate list algebra', () => {
  it('copies the settings object rather than sharing it', () => {
    const source = { entity: 'calendar.family', event_type: 'all_day' as const };
    const next = Entities.duplicateEntity([source], 0);

    // Identity, not equality: sharing one object would pass every `toEqual` in this file
    // and then edit both blocks at once the first time either dropdown moved.
    expect(next[0]).not.toBe(next[1]);
    expect(next[0]).toEqual(next[1]);
  });

  it('leaves the list alone for an index that is not in it', () => {
    const entities = ['calendar.a', 'calendar.b'];

    expect(Entities.duplicateEntity(entities, 5)).toEqual(entities);
    expect(Entities.duplicateEntity(entities, -1)).toEqual(entities);
    expect(Entities.removeEntity(entities, 5)).toEqual(entities);
    expect(Entities.removeEntity(entities, -1)).toEqual(entities);
  });

  it('counts a calendar among its own duplicates only', () => {
    const entities = ['calendar.a', 'calendar.b', 'calendar.a', 'calendar.a'];

    expect(Entities.occurrenceOf(entities, 0)).toEqual({ position: 1, total: 3 });
    expect(Entities.occurrenceOf(entities, 1)).toEqual({ position: 1, total: 1 });
    expect(Entities.occurrenceOf(entities, 3)).toEqual({ position: 3, total: 3 });
    expect(Entities.occurrenceOf(entities, 9)).toEqual({ position: 0, total: 0 });
  });
});

describe('the picker, which shows one row per calendar rather than one per block', () => {
  /**
   * Sends a calendar list out to the picker and back, as re-rendering the editor does.
   *
   * @param entities - The list as stored
   * @param picked - Picker value to apply instead of the derived one, for a drag or an edit
   * @returns The list as it comes back
   */
  function roundTrip(
    entities: ReadonlyArray<string | Types.EntityConfig>,
    picked?: ReadonlyArray<string>,
  ): unknown {
    const config = { entities } as unknown as Types.Config;
    const derived = Synthetic.SYNTHETIC_FIELDS.calendars.derive(config);

    return Synthetic.applySyntheticChange('calendars', picked ?? derived, config).changes.entities;
  }

  /**
   * The picker rows for a stored list.
   *
   * @param entities - The list as stored
   * @returns One id per row
   */
  function rows(entities: ReadonlyArray<string | Types.EntityConfig>): unknown {
    return Synthetic.SYNTHETIC_FIELDS.calendars.derive({ entities } as unknown as Types.Config);
  }

  const SPLIT = [
    { entity: 'calendar.family', event_type: 'all_day' as const },
    'calendar.other',
    { entity: 'calendar.family', event_type: 'timed' as const },
  ];

  it('shows a calendar once however many blocks it has', () => {
    // The picker answers "which calendars", the panels below answer "how many blocks".
    // Deriving one row per block made it answer both: a duplicate could be seen there and
    // cleared there, but never added there, because the picker will not hold one id twice.
    expect(rows(SPLIT)).toEqual(['calendar.family', 'calendar.other']);
    expect(rows(['calendar.a'])).toEqual(['calendar.a']);
    expect(rows([])).toEqual([]);
  });

  it('keeps first-occurrence order, which is the only order anything reads', () => {
    // `deduplicateEvents` walks the stored list and matches on `event._entityId`, so an
    // id's priority under `filter_duplicates` is fixed by where it FIRST appears; a later
    // block of the same id finds every signature already seen. Interleaving is therefore
    // free to collapse, but the relative order of distinct ids is not.
    expect(rows(SPLIT)).toEqual(['calendar.family', 'calendar.other']);
    expect(rows(['calendar.other', ...SPLIT])).toEqual(['calendar.other', 'calendar.family']);
  });

  it('gives every block back, not one per row', () => {
    // The half that cannot be changed alone. With `derive` deduplicated and `apply` still
    // shifting a single block off the queue, a calendar listed twice would come back
    // listed once and the second block's settings would be gone — silently, on the next
    // thing the user touched in the picker.
    expect(roundTrip(SPLIT)).toEqual([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
      'calendar.other',
    ]);
  });

  it('moves a calendar’s blocks together when its row is dragged', () => {
    expect(roundTrip(SPLIT, ['calendar.other', 'calendar.family'])).toEqual([
      'calendar.other',
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
  });

  it('drops every block for a calendar whose row is cleared', () => {
    // Deliberate, and the reason Remove exists on the panel: the picker decides whether a
    // calendar is on the card at all, so clearing its row takes the calendar with all its
    // blocks. Removing one block of several is the panel's own action, not this one.
    expect(roundTrip(SPLIT, ['calendar.other'])).toEqual(['calendar.other']);
  });

  it('gives a newly picked calendar exactly one bare block', () => {
    expect(roundTrip(SPLIT, ['calendar.family', 'calendar.other', 'calendar.new'])).toEqual([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
      'calendar.other',
      'calendar.new',
    ]);
  });

  it('survives the round trip after a block is duplicated or removed', () => {
    const duplicated = Entities.duplicateEntity(
      [{ entity: 'calendar.family', event_type: 'all_day' }, 'calendar.other'],
      0,
    );
    expect(roundTrip(duplicated)).toEqual(duplicated);

    const remaining = Entities.removeEntity(duplicated, 0);
    expect(roundTrip(remaining)).toEqual(remaining);
  });

  it('emits a calendar’s queue once even if a row somehow repeats', () => {
    // The picker cannot produce this, but a queue emitted per occurrence would double
    // every block rather than failing, so the guard is pinned rather than assumed.
    expect(roundTrip(SPLIT, ['calendar.family', 'calendar.family'])).toEqual([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
  });
});
