import { render as litRender } from 'lit';
import { describe, expect, it } from 'vitest';

import { renderLabel } from '../src/rendering/leaves';

/**
 * Whether the per-entity `label_icon_color` option actually colours anything.
 *
 * The option is normalized in `config.ts`, offered in the visual editor and covered by
 * three test files -- but every one of them stops at the config object. Nothing asserted
 * that the colour reaches the DOM, so deleting the label's entire style attribute left the
 * whole suite green while making the option inert.
 *
 * The scoping is asserted alongside the effect, because it is a real documented rule rather
 * than an implementation detail: `core-settings.md` says the option "only applies to `mdi:`
 * and other icon labels", and the other three label shapes -- emoji, image, plain text --
 * are supposed to ignore it. That is what stops a future fix for "my emoji label ignores
 * label_icon_color" from being applied without a decision.
 */
type Shape = readonly [label: string, value: string, expectedTag: string, expectedClass: string];

const COLOR = 'rgb(1, 2, 3)';

const UNAFFECTED: readonly Shape[] = [
  ['emoji', '🏠', 'span', 'calendar-label label-emoji'],
  ['image', '/local/label.png', 'img', 'label-image'],
  ['text', 'Work', 'span', 'calendar-label'],
] as const;

function renderLabelNode(label: string, color?: string): HTMLElement {
  const container = document.createElement('div');

  litRender(renderLabel(label, color), container);
  const node = container.firstElementChild as HTMLElement | null;

  if (!node) throw new Error(`renderLabel produced nothing for ${label}`);
  return node;
}

describe('label icon color', () => {
  it('colors an icon label with the configured value', () => {
    const node = renderLabelNode('mdi:home', COLOR);

    expect(node.tagName.toLowerCase()).toBe('ha-icon');
    expect(node.className).toBe('label-icon');
    expect(node.getAttribute('style')).toBe(`color: ${COLOR};`);
  });

  it('leaves an icon label unstyled when no color is configured', () => {
    // Paired absence: proves the assertion above is reading the configured value
    // rather than a colour the icon would have carried regardless.
    const node = renderLabelNode('mdi:home');

    expect(node.tagName.toLowerCase()).toBe('ha-icon');
    expect(node.className).toBe('label-icon');
    expect(node.getAttribute('style') ?? '').toBe('');
  });

  describe('does not reach the other label shapes', () => {
    it.each(UNAFFECTED)('ignores the color on a %s label', (_shape, label, tag, className) => {
      const node = renderLabelNode(label, COLOR);

      // The tag and class are asserted too, so a branch cannot pass this by rendering
      // some other unstyled shape instead of the one being tested.
      expect(node.tagName.toLowerCase()).toBe(tag);
      expect(node.className).toBe(className);
      expect(node.getAttribute('style') ?? '').toBe('');
    });
  });
});
