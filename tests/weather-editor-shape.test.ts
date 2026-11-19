/**
 * The editor writes weather per layout (backlog item 339): the one entity every layout draws from
 * as `weather_entity`, and each layout's own `weather:` in its block, edited on that layout's
 * Weather page. A card written before v6 is converted when it opens, with a receipt.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  lastConfig,
  mountEditor,
  openPageOf,
  reportsOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import type { SelectorSchema } from '../src/rendering/editor/ha-form';

afterEach(() => {
  document.body.replaceChildren();
});

const CARD = { config_version: Config.CURRENT_CONFIG_VERSION, entities: ['calendar.anna'] };

/** The receipt the upgrade on opening leaves, as read. */
function receipt(editor: HTMLElement): string | undefined {
  return editor
    .shadowRoot!.querySelector('[data-upgrade-receipt]')
    ?.textContent?.replace(/\s+/g, ' ')
    .trim();
}

describe('the entity every layout draws from', () => {
  it('is written as weather_entity, and turns the forecast on in the layout it is chosen in', async () => {
    const editor = await mountEditor({ ...CARD, view: 'grid' });
    await changeField(editor, 'workspace:editing_workspace', 'grid');

    await changeField(editor, 'weather:weather_entity', 'weather.home');
    expect(lastConfig(editor)).toEqual({
      ...CARD,
      view: 'grid',
      weather_entity: 'weather.home',
      time_grid: { weather: { position: 'date' } },
    });
  });

  it('turns it on beside events in Month, and leaves a layout that shows one as it is', async () => {
    const editor = await mountEditor({
      ...CARD,
      view: 'month',
      list: { weather: { position: 'event' } },
    });
    await changeField(editor, 'workspace:editing_workspace', 'month');

    await changeField(editor, 'weather:weather_entity', 'weather.home');
    expect(lastConfig(editor)).toMatchObject({
      weather_entity: 'weather.home',
      list: { weather: { position: 'event' } },
      month: { weather: { position: 'event' } },
    });
    expect(lastConfig(editor)).not.toHaveProperty('time_grid');
    expect(lastConfig(editor)).not.toHaveProperty('column');
  });

  it('turns nothing on from Layout Defaults, which draws no forecast of its own', async () => {
    const editor = await mountEditor(CARD);
    await changeField(editor, 'workspace:editing_workspace', 'shared');

    await changeField(editor, 'weather:weather_entity', 'weather.home');
    expect(lastConfig(editor)).toEqual({ ...CARD, weather_entity: 'weather.home' });
  });

  it('is cleared for every layout, which keep their own settings for the next entity', async () => {
    const editor = await mountEditor({
      ...CARD,
      weather_entity: 'weather.home',
      list: { weather: { position: 'both' } },
    });

    await changeField(editor, 'weather:weather_entity', undefined);
    expect(lastConfig(editor)).toEqual({ ...CARD, list: { weather: { position: 'both' } } });
  });

  it('writes no line for a picker cleared to an empty string', async () => {
    const editor = await mountEditor({ ...CARD, weather_entity: 'weather.home' });

    await changeField(editor, 'weather:weather_entity', '');
    expect(lastConfig(editor)).toEqual(CARD);
  });
});

describe('a layout’s own weather', () => {
  it.each([
    ['list', 'list'],
    ['column', 'column'],
    ['grid', 'time_grid'],
  ])('is written in %s’s block alone, and minimized there', async (workspace, block) => {
    const editor = await mountEditor({ ...CARD, weather_entity: 'weather.home' });
    await changeField(editor, 'workspace:editing_workspace', workspace);

    await changeField(editor, 'weather:weather.position', 'both');
    await changeField(editor, 'weather:weather.date.show_low_temp', true);
    expect(lastConfig(editor)).toEqual({
      ...CARD,
      weather_entity: 'weather.home',
      [block]: { weather: { position: 'both', date: { show_low_temp: true } } },
    });

    // Off again: the block's weather says nothing a layout does not do by default.
    await changeField(editor, 'weather:weather.date.show_low_temp', false);
    await changeField(editor, 'weather:weather.position', 'none');
    expect(lastConfig(editor)).toEqual({ ...CARD, weather_entity: 'weather.home' });
  });

  it('reads each layout’s own value, off where a layout says nothing', async () => {
    const editor = await mountEditor({
      ...CARD,
      weather_entity: 'weather.home',
      time_grid: { weather: { position: 'event' } },
    });
    await changeField(editor, 'workspace:editing_workspace', 'grid');
    await openPageOf(editor, 'weather:weather.position');
    expect(valueOf(editor, 'weather:weather.position')).toBe('event');

    await changeField(editor, 'workspace:editing_workspace', 'list');
    await openPageOf(editor, 'weather:weather.position');
    expect(valueOf(editor, 'weather:weather.position')).toBe('none');
  });

  it('offers Month only Nowhere and Beside Each Event, since it has no day header', () => {
    const position = (workspace: 'month' | 'list') => {
      const config = { ...Config.DEFAULT_CONFIG, ...CARD, weather_entity: 'weather.home' };
      const field = buildFieldIndex(schemaCtx(config, workspace, 'en')).fields.get(
        'weather:weather.position',
      )!;
      const { select } = (field.node as SelectorSchema).selector as {
        select: { options: ReadonlyArray<{ value: string; label: string }> };
      };
      return select.options.map((option) => [option.value, option.label]);
    };
    // The same words as every other layout's, so every translation reaches Month too.
    expect(position('month')).toEqual([
      ['none', 'Nowhere'],
      ['event', 'Beside Each Event'],
    ]);
    expect(position('list').map(([value]) => value)).toEqual(['none', 'date', 'event', 'both']);
  });

  it('keeps a layout’s own weather and weather_entity as written through an unrelated edit', async () => {
    const written = {
      ...CARD,
      weather_entity: 'weather.home',
      list: { weather: { position: 'event', event: { show_temp: false } } },
      month: { weather: { position: 'event' } },
    };
    const editor = await mountEditor(written);

    await changeField(editor, 'card:title', 'Family');
    expect(lastConfig(editor)).toEqual({ ...written, title: 'Family' });
  });
});

describe('a card written before v6', () => {
  const BEFORE = {
    ...CARD,
    weather: { entity: 'weather.home', position: 'both', event: { show_conditions: false } },
    month: { weather: { position: 'event' } },
  };
  const LAYOUT = { position: 'both', event: { show_conditions: false } };

  it('is converted when it opens, with a receipt that names what changed', async () => {
    const editor = await mountEditor(BEFORE);

    expect(reportsOf(editor)).toEqual([
      {
        ...CARD,
        weather_entity: 'weather.home',
        list: { weather: LAYOUT },
        column: { weather: LAYOUT },
        time_grid: { weather: LAYOUT },
      },
    ]);
    expect(receipt(editor)).toBe(
      'Upgraded. Weather is now set per layout: List, Columns and Grid keep what the card ' +
        'showed, and Month is off. Lines the card ignored are gone: month.weather. Undo',
    );
  });

  it('comes back as written on Undo, and is converted again by the next write', async () => {
    const editor = await mountEditor(BEFORE);
    editor
      .shadowRoot!.querySelector<HTMLButtonElement>(
        '[data-upgrade-receipt] [data-focus="status-undo"]',
      )!
      .click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual(BEFORE);

    await changeField(editor, 'card:title', 'Family');
    expect(lastConfig(editor)).toEqual({
      ...CARD,
      title: 'Family',
      weather_entity: 'weather.home',
      list: { weather: LAYOUT },
      column: { weather: LAYOUT },
      time_grid: { weather: LAYOUT },
    });
  });

  it('is left alone on opening where it names no entity, and dropped by the first write', async () => {
    const editor = await mountEditor({ ...CARD, weather: { position: 'both' } });
    expect(reportsOf(editor)).toEqual([]);
    expect(receipt(editor)).toBeUndefined();

    await changeField(editor, 'card:title', 'Family');
    expect(lastConfig(editor)).toEqual({ ...CARD, title: 'Family' });
  });

  it('takes weather_entity as the entity of a block that names none, and says which layouts', async () => {
    const editor = await mountEditor({
      ...CARD,
      weather_entity: 'weather.home',
      weather: { position: 'event' },
      list: { weather: { position: 'date' } },
    });
    expect(lastConfig(editor)).toEqual({
      ...CARD,
      weather_entity: 'weather.home',
      list: { weather: { position: 'date' } },
      column: { weather: { position: 'event' } },
      time_grid: { weather: { position: 'event' } },
    });
    // Columns and Grid show what they did not before, and Month is not mentioned.
    expect(receipt(editor)).toBe(
      'Upgraded. Weather is now set per layout: Columns and Grid now use the top-level weather ' +
        'options. Undo',
    );
  });

  it('says nothing of Month when it keeps its own weather beside weather_entity', async () => {
    const editor = await mountEditor({
      ...CARD,
      weather_entity: 'weather.home',
      weather: { position: 'date' },
      month: { weather: { position: 'event' } },
    });
    expect(lastConfig(editor)).toMatchObject({ month: { weather: { position: 'event' } } });
    expect(receipt(editor)).toBe(
      'Upgraded. Weather is now set per layout: List, Columns, and Grid now use the top-level ' +
        'weather options. Undo',
    );
  });
});
