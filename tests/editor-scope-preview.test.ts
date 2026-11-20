/**
 * The preview following the layout being edited (`views/scope-preview.ts`): the preview's own card drawn in
 * the layout being edited, through its `setConfig`, following Home Assistant's rebuilds, and given
 * the configuration as written back once it is to show the card as it opens. Nothing reaches Home
 * Assistant.
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

describe('the preview of the layout being edited', () => {
  const written = { type: 'custom:calendar-card-pro', view: 'grid', days_to_show: 3 };

  it('draws the layout asked for, once, and the card as written again once released', () => {
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
    // Released again is no change.
    preview.sync(undefined);
    expect(card.calls).toHaveLength(2);
  });

  /**
   * The dialog as Home Assistant draws it: a shadow root holding the editor and the preview, the
   * card inside an element that wraps it.
   *
   * @returns The dialog's root, and a way to rebuild the preview as Home Assistant does
   */
  function dialog() {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const editor = document.createElement('div');
    const preview = document.createElement('div');
    root.append(editor, preview);
    const build = (): FakeCard => {
      // Configured with the YAML before it is put in place, as `hui-card` does.
      const card = fakeCard();
      card.className = 'card';
      card.setConfig(written);
      const wrapper = document.createElement('div');
      wrapper.append(card);
      preview.replaceChildren(wrapper);
      return card;
    };
    const find = () => preview.querySelector<HTMLElement>('.card') ?? undefined;
    return { editor, build, find };
  }

  it('follows Home Assistant’s rebuild of the card, and leaves alone a card it replaced', async () => {
    const { editor, build, find } = dialog();
    const first = build();
    const preview = new ScopePreview(find, editor);
    preview.sync({ view: 'column', config: written });
    expect(first.calls).toEqual([written, { ...written, view: 'column' }]);

    // A sections dashboard builds the element around the card anew too, so its parent is gone.
    const second = build();
    await settle();
    expect(second.calls).toEqual([written, { ...written, view: 'column' }]);

    // Released after the rebuild: the new card goes back to the YAML, the old one is gone.
    preview.sync(undefined);
    expect(second.calls[second.calls.length - 1]).toEqual(written);
    expect(first.calls).toEqual([written, { ...written, view: 'column' }]);

    // Released, a rebuild is Home Assistant's alone.
    const third = build();
    await settle();
    expect(third.calls).toEqual([written]);
  });

  it('does nothing where no preview is found', () => {
    const preview = new ScopePreview(() => undefined);
    expect(() => preview.sync({ view: 'list', config: written })).not.toThrow();
    expect(() => preview.sync(undefined)).not.toThrow();
  });
});
