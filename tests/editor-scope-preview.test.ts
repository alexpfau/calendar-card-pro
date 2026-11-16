/**
 * The preview switch on Settings For (`views/scope-preview.ts`): the preview's own card drawn in
 * the layout being edited, through its `setConfig`, following Home Assistant's rebuilds, and given
 * the configuration as written back when the switch goes off. Nothing reaches Home Assistant.
 */

import { describe, expect, it } from 'vitest';

import { ScopePreview } from '../src/rendering/editor/views/scope-preview';

type FakeCard = HTMLElement & { setConfig: (config: unknown) => void; calls: unknown[] };

/**
 * A card that records what it is configured with, as Home Assistant's preview holds one.
 *
 * @returns The card
 */
function fakeCard(): FakeCard {
  const card = document.createElement('div') as unknown as FakeCard;
  card.calls = [];
  card.setConfig = (config) => card.calls.push(config);
  return card;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the preview switch', () => {
  const written = { type: 'custom:calendar-card-pro', view: 'grid', days_to_show: 3 };

  it('draws the layout asked for, once, and the card as written again when switched off', () => {
    document.body.innerHTML = '';
    const parent = document.createElement('div');
    document.body.append(parent);
    const card = fakeCard();
    parent.append(card);
    const preview = new ScopePreview(() => parent.firstElementChild as HTMLElement);

    preview.sync({ view: 'list', config: written });
    expect(card.calls).toEqual([{ ...written, view: 'list' }]);
    // A render that changes nothing configures nothing.
    preview.sync({ view: 'list', config: written });
    expect(card.calls).toHaveLength(1);

    preview.sync(undefined);
    expect(card.calls).toEqual([{ ...written, view: 'list' }, written]);
    // Off again is no change.
    preview.sync(undefined);
    expect(card.calls).toHaveLength(2);
  });

  it('follows Home Assistant’s rebuild of the card, and leaves alone a card it replaced', async () => {
    document.body.innerHTML = '';
    const parent = document.createElement('div');
    document.body.append(parent);
    const first = fakeCard();
    parent.append(first);
    const preview = new ScopePreview(() => parent.firstElementChild as HTMLElement);
    preview.sync({ view: 'column', config: written });

    // Home Assistant configures a new card with the YAML and puts it in place of the old one.
    const second = fakeCard();
    second.setConfig(written);
    parent.replaceChildren(second);
    await settle();
    expect(second.calls).toEqual([written, { ...written, view: 'column' }]);

    // Switched off after the rebuild: the new card goes back to the YAML, the old one is gone.
    preview.sync(undefined);
    expect(second.calls[second.calls.length - 1]).toEqual(written);
    expect(first.calls).toEqual([{ ...written, view: 'column' }]);
  });

  it('does nothing where no preview is found', () => {
    const preview = new ScopePreview(() => undefined);
    expect(() => preview.sync({ view: 'list', config: written })).not.toThrow();
    expect(() => preview.sync(undefined)).not.toThrow();
  });
});
