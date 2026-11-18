/**
 * Today's editor keeps writing weather as it was written before v6 (backlog item 339).
 *
 * The card reads per-layout weather (`weather_entity` and each layout's `weather:`), but the
 * editor's weather pages move to the layouts in a later change. Until then the editor must keep
 * writing the top-level `weather:` block, which the card draws exactly as before, and must leave
 * a layout's own `weather:` as written. This pins both, so the editor's later change is the one
 * that moves them, on purpose.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { changeField, lastConfig, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';

afterEach(() => {
  document.body.replaceChildren();
});

describe('the editor before its per-layout weather pages', () => {
  it('writes the entity and the position into the top-level weather block', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });

    await changeField(editor, 'weather:weather.entity', 'weather.home');
    expect(lastConfig(editor)?.weather).toEqual({ entity: 'weather.home' });
    expect(lastConfig(editor)).not.toHaveProperty('weather_entity');

    await changeField(editor, 'weather:weather.position', 'event');
    expect(lastConfig(editor)?.weather).toEqual({ entity: 'weather.home', position: 'event' });
    for (const block of ['list', 'column', 'time_grid', 'month']) {
      expect(lastConfig(editor)?.[block], block).toBeUndefined();
    }
  });

  it('keeps a layout’s own weather and weather_entity as written through an edit', async () => {
    const written = {
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      weather_entity: 'weather.home',
      list: { weather: { position: 'event', event: { show_temp: false } } },
      month: { weather: { position: 'event' } },
    };
    const editor = await mountEditor(written);

    await changeField(editor, 'card:title', 'Family');
    const stored = lastConfig(editor);
    expect(stored?.title).toBe('Family');
    expect(stored?.weather_entity).toBe('weather.home');
    expect(stored?.list).toEqual(written.list);
    expect(stored?.month).toEqual(written.month);
  });
});
