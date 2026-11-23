/**
 * Each calendar row on the overview shows the calendar's label as the card draws it beside an
 * event: text and emoji, a picture, a person's picture, and an icon, the icon through Home
 * Assistant's `ha-icon` only where it is defined. Every row keeps the same slot once any row has a
 * label, so the names align. The editor resolves labels with a mirror of the card's resolver
 * (`entities.ts` › `resolvedLabel`), held here to the card's answers.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import { changeField, entry, fakeHass, lastConfig, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { resolvedLabel } from '../src/rendering/editor/entities';
import styles from '../src/rendering/editor/styles';
import { wordValue } from '../src/rendering/editor/summary';
import { resolveEntityLabel, resolveLabelParts } from '../src/utils/events';
import { resolveLabelType } from '../src/utils/helpers';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

/**
 * A calendar's state, with an icon where given.
 *
 * @param id - Its entity id
 * @param name - Its name
 * @param icon - Its icon in Home Assistant
 * @returns The state
 */
function calendar(id: string, name: string, icon?: string): Record<string, unknown> {
  return { entity_id: id, state: 'off', attributes: { friendly_name: name, icon } };
}

const STATES = {
  'calendar.anna': calendar('calendar.anna', 'Anna', 'mdi:school'),
  'calendar.ben': calendar('calendar.ben', 'Ben'),
  'calendar.leo': calendar('calendar.leo', 'Leo'),
  'calendar.family': calendar('calendar.family', 'Family'),
  'calendar.trash': calendar('calendar.trash', 'Trash'),
  'calendar.work': calendar('calendar.work', 'Work'),
  'person.anna': {
    entity_id: 'person.anna',
    state: 'home',
    attributes: { friendly_name: 'Anna', entity_picture: '/api/image/serve/anna/512x512' },
  },
};

/** One of each kind of label, and a calendar with none. */
const ENTITIES: ReadonlyArray<string | Types.EntityConfig> = [
  { entity: 'calendar.anna', label: 'home-assistant' },
  { entity: 'calendar.ben', label: 'person.anna' },
  { entity: 'calendar.leo', label: 'mdi:soccer', label_icon_color: '#ff0000' },
  { entity: 'calendar.family', label: '/local/family.png' },
  { entity: 'calendar.trash', label: '🗑️' },
  { entity: 'calendar.work', label: 'W' },
  'calendar.none',
];

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Mounts the editor over the calendars.
 *
 * @param entities - Calendars as stored
 * @returns The editor
 */
function mount(entities: ReadonlyArray<unknown>): Promise<Editor> {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, entities },
    { hass: fakeHass({ states: STATES }) },
  );
}

/**
 * Each row's label slot as drawn: what it holds, or `none` for an empty slot, or `absent`.
 *
 * @param editor - The editor
 * @returns One description per row
 */
function slots(editor: Editor): string[] {
  return [...editor.shadowRoot!.querySelectorAll('.cal-body')].map((row) => {
    const slot = row.querySelector('.cal-badge');
    if (slot === null) return 'absent';
    const image = slot.querySelector('img');
    if (image) return `img ${image.getAttribute('src')} alt="${image.getAttribute('alt')}"`;
    const icon = slot.querySelector('ha-icon') as (HTMLElement & { icon?: string }) | null;
    if (icon) return `icon ${icon.icon} ${icon.style.color}`.trim();
    return slot.textContent?.trim() || 'none';
  });
}

describe('a calendar row’s label', () => {
  it('shows every kind, an icon only where Home Assistant defines ha-icon', async () => {
    const editor = await mount(ENTITIES);

    // No ha-icon here: an icon's slot stays empty rather than drawing an unknown element.
    expect(slots(editor)).toEqual([
      'none',
      'img /api/image/serve/anna/512x512 alt=""',
      'none',
      'img /local/family.png alt=""',
      '🗑️',
      'W',
      'none',
    ]);
    expect(editor.shadowRoot!.querySelector('.cal-badge ha-icon')).toBeNull();

    customElements.define('ha-icon', class extends HTMLElement {});
    editor.requestUpdate();
    await editor.updateComplete;

    expect(slots(editor)).toEqual([
      'icon mdi:school',
      'img /api/image/serve/anna/512x512 alt=""',
      'icon mdi:soccer #ff0000',
      'img /local/family.png alt=""',
      '🗑️',
      'W',
      'none',
    ]);
  });

  it('keeps no slot on a list where no calendar has a label', async () => {
    const editor = await mount(['calendar.ben', { entity: 'calendar.leo', label: '' }]);

    expect(slots(editor)).toEqual(['absent', 'absent']);
  });

  it('draws nothing for a sentinel Home Assistant holds nothing for, nor for label_type none', async () => {
    const editor = await mount([
      { entity: 'calendar.ben', label: 'home-assistant' },
      { entity: 'calendar.leo', label: 'W', label_type: 'none' },
      { entity: 'calendar.work', label: 'W' },
    ]);

    expect(slots(editor)).toEqual(['none', 'none', 'W']);
  });
});

describe('the editor’s label resolution', () => {
  it('answers as the card’s does, for every kind and every override', () => {
    const hass = fakeHass({ states: STATES });
    const entries: Types.EntityConfig[] = [
      ...ENTITIES.filter((entry): entry is Types.EntityConfig => typeof entry === 'object'),
      { entity: 'calendar.ben', label: 'home-assistant' },
      { entity: 'calendar.anna', label: 'home-assistant', label_type: 'text' },
      { entity: 'calendar.ben', label: 'person.anna', label_type: 'text' },
      { entity: 'calendar.ben', label: 'person.nobody' },
      { entity: 'calendar.work', label: 'W', label_type: 'none' },
      { entity: 'calendar.work', label: '/local/w.png', label_type: 'text' },
      { entity: 'calendar.work' },
    ];
    for (const entry of entries) {
      const card = resolveEntityLabel(
        entry.entity,
        { ...Config.DEFAULT_CONFIG, entities: [entry] } as Types.Config,
        { _matchedConfig: entry } as Types.CalendarEventData,
        hass,
      );
      const type = card ? resolveLabelType(card, entry.label_type) : 'none';
      const expected = !card || type === 'none' ? undefined : { value: card, type };
      expect(resolvedLabel(entry, hass), JSON.stringify(entry)).toEqual(expected);
    }
  });
});

describe('a label of several parts', () => {
  it('shows its first part the card draws in the row’s one slot', async () => {
    const editor = await mount([
      { entity: 'calendar.ben', label: ['person.anna', 'mdi:soccer'] },
      { entity: 'calendar.leo', label: ['person.nobody', '⚽', 'W'] },
    ]);

    expect(slots(editor)).toEqual(['img /api/image/serve/anna/512x512 alt=""', '⚽']);
  });

  it('answers as the card’s first drawn part does', () => {
    const hass = fakeHass({ states: STATES });
    const entries: Types.EntityConfig[] = [
      { entity: 'calendar.ben', label: ['person.anna', 'mdi:soccer'] },
      { entity: 'calendar.anna', label: ['person.nobody', 'home-assistant', 'W'] },
      { entity: 'calendar.ben', label: ['home-assistant', 'W'] },
      { entity: 'calendar.work', label: ['mdi:soccer', 'W'], label_type: 'text' },
      { entity: 'calendar.work', label: ['W'], label_type: 'none' },
      { entity: 'calendar.work', label: [] },
    ];
    for (const entry of entries) {
      const [card] = resolveLabelParts(
        entry.entity,
        { ...Config.DEFAULT_CONFIG, entities: [entry] } as Types.Config,
        { _matchedConfig: entry } as Types.CalendarEventData,
        hass,
      );
      const type = card ? resolveLabelType(card.value, entry.label_type) : 'none';
      const expected = !card || type === 'none' ? undefined : { value: card.value, type };
      expect(resolvedLabel(entry, hass), JSON.stringify(entry)).toEqual(expected);
    }
  });

  /**
   * The calendar as stored after one edit to its page.
   *
   * @param fields - The calendar's options before the edit
   * @param id - The field edited
   * @param value - Its new value
   * @returns The calendar as stored
   */
  const after = async (fields: Record<string, unknown>, id: string, value: unknown) => {
    const editor = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: [{ entity: 'calendar.anna', ...fields }],
      },
      { hass: fakeHass({ states: STATES }) },
    );
    await changeField(editor, id, value, entry(0));
    const stored = (lastConfig(editor)!.entities as unknown[])[0];
    editor.remove();
    return stored;
  };

  it('is chosen from Label Type, starting from the label as it stood', async () => {
    expect(await after({ label: 'W' }, 'calendar:label_type', 'parts')).toEqual({
      entity: 'calendar.anna',
      label: ['W'],
    });
    // A literal that needed label_type keeps its words and leaves the type behind.
    expect(
      await after({ label: '/dev', label_type: 'text' }, 'calendar:label_type', 'parts'),
    ).toEqual({ entity: 'calendar.anna', label: ['/dev'] });
    // With nothing to start from, an empty list, which reads back as several parts.
    expect(await after({}, 'calendar:label_type', 'parts')).toEqual({
      entity: 'calendar.anna',
      label: [],
    });
  });

  it('stores its lines as written, an emptied one included', async () => {
    expect(
      await after({ label: ['person.anna'] }, 'calendar:label', ['person.anna', 'mdi:soccer', '']),
    ).toEqual({ entity: 'calendar.anna', label: ['person.anna', 'mdi:soccer', ''] });
  });

  it('keeps the first part of the shape chosen when it leaves for one', async () => {
    const parts = { label: ['⚽', 'person.anna', 'mdi:soccer', '/local/a.png'] };
    expect(await after(parts, 'calendar:label_type', 'icon')).toEqual({
      entity: 'calendar.anna',
      label: 'mdi:soccer',
    });
    expect(await after(parts, 'calendar:label_type', 'image')).toEqual({
      entity: 'calendar.anna',
      label: 'person.anna',
    });
    expect(await after(parts, 'calendar:label_type', 'text')).toEqual({
      entity: 'calendar.anna',
      label: '⚽',
    });
  });

  it('keeps a shape the YAML gave the list through an edit to another field', async () => {
    expect(
      await after({ label: ['mdi:soccer', 'W'], label_type: 'text' }, 'calendar:name', 'Anna'),
    ).toEqual({
      entity: 'calendar.anna',
      name: 'Anna',
      label: ['mdi:soccer', 'W'],
      label_type: 'text',
    });
  });

  it('keeps Image Size and Label Icon Color while it holds them, and drops them for text', async () => {
    const image = { label: '/local/a.png', label_image_size: '2em' };
    expect(await after(image, 'calendar:label_type', 'parts')).toEqual({
      entity: 'calendar.anna',
      label: ['/local/a.png'],
      label_image_size: '2em',
    });
    // The path stays, as words, which is how leaving An Image for text has always read it.
    expect(await after(image, 'calendar:label_type', 'text')).toEqual({
      entity: 'calendar.anna',
      label: '/local/a.png',
      label_type: 'text',
    });
    expect(
      await after(
        { label: 'mdi:soccer', label_icon_color: '#ff0000' },
        'calendar:label_type',
        'parts',
      ),
    ).toEqual({ entity: 'calendar.anna', label: ['mdi:soccer'], label_icon_color: '#ff0000' });
  });

  it('reads its lines in turn where the editor words the value', () => {
    const lines = { node: { name: 'label', selector: { text: { multiple: true } } } };
    expect(wordValue(lines as never, ['person.anna', '', 'mdi:soccer'], 'en')).toBe(
      'person.anna, mdi:soccer',
    );
    expect(wordValue(lines as never, [''], 'en')).toBeUndefined();
  });

  it('stores Image Size as typed', async () => {
    expect(await after({ label: 'person.anna' }, 'calendar:label_image_size', '2.5em')).toEqual({
      entity: 'calendar.anna',
      label: 'person.anna',
      label_image_size: '2.5em',
    });
  });
});

describe('the calendar list’s geometry', () => {
  /**
   * The last px value a selector's declaration of a property takes, in cascade order.
   *
   * @param selector - The selector, as written
   * @param property - The property
   * @returns Its px value
   */
  function px(selector: string, property: string): number {
    const found = declarations(styles.cssText).filter(
      (each) => each.selectors.includes(selector) && each.property === property,
    );
    const value = found[found.length - 1]?.value ?? '';
    if (!/^\d+px$/.test(value))
      throw new Error(`${selector} { ${property} } is ${value || 'unset'}`);
    return Number.parseFloat(value);
  }

  it('starts an indented entry’s dot, label and name where a single row’s start', () => {
    // A single row: its drag handle, the row's gap, then the body's own padding.
    const single =
      px('.drag-handle', 'width') +
      px('.cal-row', 'gap') +
      px('.drag-handle + .cal-body', 'padding-inline-start');
    // An entry of a calendar listed twice: its margin, the line it hangs from, its body's padding.
    const entry =
      px('.cal-block .cal-row-entry', 'margin-inline-start') +
      Number.parseFloat(
        /^(\d+)px/.exec(
          declarations(styles.cssText).filter(
            (each) =>
              each.selectors.includes('.cal-block .cal-row-entry') &&
              each.property === 'border-inline-start',
          )[0]?.value ?? '',
        )?.[1] ?? 'NaN',
      ) +
      px('.cal-block .cal-row-entry > .cal-body', 'padding-inline-start');

    expect(single).toBe(48);
    expect(entry).toBe(single);
  });
});

describe('an edit to another field of a calendar keeps what it did not touch', () => {
  const edited = async (fields: Record<string, unknown>, id: string, value: unknown) => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [{ entity: 'calendar.anna', ...fields }],
    });
    await changeField(editor, id, value, entry(0));
    const kept = (lastConfig(editor)!.entities as unknown[])[0];
    editor.remove();
    return kept;
  };

  it('keeps a literal label and a label under label_type: none', async () => {
    // `label_type: text` is how the word home-assistant is meant literally, not as the sentinel.
    expect(
      await edited({ label: 'home-assistant', label_type: 'text' }, 'calendar:name', 'Anna'),
    ).toEqual({
      entity: 'calendar.anna',
      name: 'Anna',
      label: 'home-assistant',
      label_type: 'text',
    });
    expect(await edited({ label: 'Anna', label_type: 'none' }, 'calendar:name', 'Anna')).toEqual({
      entity: 'calendar.anna',
      name: 'Anna',
      label: 'Anna',
      label_type: 'none',
    });
  });

  it('keeps a visibility the card reads as unknown, which keeps the calendar hidden', async () => {
    for (const visibility of [{}, []]) {
      expect(await edited({ label: 'A', visibility }, 'calendar:label', 'B')).toEqual({
        entity: 'calendar.anna',
        label: 'B',
        visibility,
      });
    }
  });
});
