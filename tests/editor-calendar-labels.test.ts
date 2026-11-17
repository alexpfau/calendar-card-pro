/**
 * Each calendar row on the overview shows the calendar's label as the card draws it beside an
 * event: text and emoji, a picture, a person's picture, and an icon, the icon through Home
 * Assistant's `ha-icon` only where it is defined. Every row keeps the same slot once any row has a
 * label, so the names align. The editor resolves labels with a mirror of the card's resolver
 * (`entities.ts` › `resolvedLabel`), held here to the card's answers.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import { fakeHass, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { resolvedLabel } from '../src/rendering/editor/entities';
import styles from '../src/rendering/editor/styles';
import { resolveEntityLabel } from '../src/utils/events';
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
