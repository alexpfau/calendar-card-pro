import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { renderTodayIndicator } from '../src/rendering/leaves';

/**
 * Where the today indicator is actually drawn, for each of the three things it can be.
 *
 * `today_indicator` accepts an icon, an emoji or an image path, and all three are rendered
 * by different branches of the same switch -- an `ha-icon`, a `span` and an `img`. Only the
 * markup differs; the positioning is meant to be identical, because `today_indicator_position`
 * is documented once and says nothing about the indicator's type.
 *
 * That shared intent was only enforced for the icon branch. Deleting the style binding from
 * the emoji or image branch left every test green, even though it removes `position:absolute`
 * outright -- so the indicator stops being positioned at all and drops back into normal flow
 * somewhere else in the date column. The icon branch losing the same binding failed three
 * tests, which is what proves the other two are an omission rather than dead markup.
 *
 * The list and column views deliberately disagree here, and that is asserted too. List view
 * positions the indicator absolutely by percentage; column view puts it in the day header and
 * lets it flow, ignoring `today_indicator_position` entirely. Pinning both halves means the
 * asymmetry has to be changed on purpose rather than by accident.
 */
const POSITION = '20% 80%';

function renderIndicator(
  value: string,
  layout: 'absolute' | 'inline',
): { className: string; style: string } {
  const config = buildConfig({
    today_indicator: value,
    today_indicator_position: POSITION,
  }) as Types.Config;
  const container = document.createElement('div');

  litRender(renderTodayIndicator(config, true, layout), container);
  const node = container.querySelector('.today-indicator');

  return {
    className: node?.className ?? '(absent)',
    style: node?.getAttribute('style') ?? '',
  };
}

const INDICATORS = [
  ['icon', 'mdi:star', 'today-indicator mdi'],
  ['emoji', '🎯', 'today-indicator emoji'],
  ['image', '/local/today.png', 'today-indicator image'],
] as const;

describe('today indicator position', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('list view positions every indicator type by percentage', () => {
    it.each(INDICATORS)('places the %s at the configured position', (_label, value, className) => {
      const { className: actualClass, style } = renderIndicator(value, 'absolute');

      // The class is asserted alongside the style so a branch cannot pass by rendering
      // some other type's markup that happens to be positioned correctly.
      expect(actualClass).toBe(className);
      expect(style).toContain('position:absolute');
      expect(style).toContain('left:20%');
      expect(style).toContain('top:80%');
    });
  });

  describe('column view lets the indicator flow instead', () => {
    it.each(INDICATORS)('gives the %s no positioning at all', (_label, value, className) => {
      // The paired absence, and a real documented difference rather than a formality:
      // the column-view indicator sits inside the day header, so absolute positioning
      // would take it out of that header and `today_indicator_position` does not apply.
      const { className: actualClass, style } = renderIndicator(value, 'inline');

      expect(actualClass).toBe(className);
      expect(style).toBe('');
    });
  });
});
