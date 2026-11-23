/**
 * Full-Size Overlay on Taps & Refresh: the layout the `overlay` action opens the card in, written
 * under `overlay:`, which keeps every other option written there by hand. Names are invented.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  labelOf,
  mountEditor,
  openPageOf,
  reportsOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { overlayFormBlock, stripOverlayDefaults } from '../src/rendering/editor/value';

const VIEW = 'actions:overlay.view';

const merged = (config: Record<string, unknown>): Types.Config =>
  ({ ...Config.DEFAULT_CONFIG, ...config }) as Types.Config;

afterEach(() => {
  document.body.replaceChildren();
});

describe('Full-Size Overlay’s Layout', () => {
  it('shows Grid until the YAML names another, and writes only what it changes', async () => {
    const editor = await mountEditor({
      entities: ['calendar.anna'],
      view: 'list',
      tap_action: { action: 'overlay' },
      overlay: { toolbar: { search: false }, days_to_show: 14 },
    });
    await openPageOf(editor, VIEW);
    expect(labelOf(editor, VIEW)).toBe('Layout');
    expect(valueOf(editor, VIEW)).toBe('grid');

    await changeField(editor, VIEW, 'month');
    expect(reportsOf(editor).slice(-1)[0].overlay).toEqual({
      toolbar: { search: false },
      days_to_show: 14,
      view: 'month',
    });

    await changeField(editor, VIEW, 'grid');
    expect(reportsOf(editor).slice(-1)[0].overlay).toEqual({
      toolbar: { search: false },
      days_to_show: 14,
    });
  });

  it('writes no block for a card that has none', async () => {
    const editor = await mountEditor({ entities: ['calendar.anna'], view: 'list' });
    await changeField(editor, 'actions:refresh_interval', 10);
    expect(reportsOf(editor).slice(-1)[0]).not.toHaveProperty('overlay');
  });
});

describe('the overlay block as stored', () => {
  it('drops Grid, which is the default, unless the YAML holds it', () => {
    expect(stripOverlayDefaults(merged({ overlay: { view: 'grid' } }))).toBeUndefined();
    expect(stripOverlayDefaults(merged({ overlay: { view: 'grid' } }), { view: 'grid' })).toEqual({
      view: 'grid',
    });
    expect(stripOverlayDefaults(merged({ overlay: { view: 'list', title: 'Big' } }))).toEqual({
      view: 'list',
      title: 'Big',
    });
  });

  it('shows the block as written, its layout filled in', () => {
    expect(overlayFormBlock(merged({}))).toEqual({ view: 'grid' });
    expect(overlayFormBlock(merged({ overlay: { view: 'month', title: 'Big' } }))).toEqual({
      view: 'month',
      title: 'Big',
    });
  });
});
