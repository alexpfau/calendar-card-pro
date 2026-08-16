/**
 * Column-view inline style bindings.
 *
 * ## Why this file exists
 *
 * Both views paint two things directly onto the event element's `style` attribute
 * rather than through a CSS custom property: the per-calendar accent border and the
 * event background colour that `event_background_opacity` turns on. The two bindings
 * are written out character-for-character identically in `render.ts` (list) and
 * `column.ts` (column).
 *
 * Only one of the two copies was guarded. `tests/list-dom.test.ts` keeps a committed
 * DOM snapshot, and that snapshot happens to contain the `style` attribute 363 times,
 * so dropping either binding from the list view fails 17 snapshot tests immediately.
 * The column view has 63 tests and no snapshot at all — its assertions are targeted at
 * classes, structure and shared content, and none of them reads `style`. Deleting both
 * bindings from `column.ts` left the entire suite green.
 *
 * That asymmetry is the whole point: the killed list-view sibling proves the effect is
 * observable, so the surviving column mutation was a coverage gap rather than dead
 * code. Because the two views share `presentation.ts`, a change made for the list view
 * reaches the column view too — and until now, only one of them would have told us if
 * it went wrong there.
 *
 * The list assertions below are deliberately duplicated from the snapshot's implicit
 * coverage. They are the control: if the shape of these assertions were wrong, they
 * would fail on the view that is already known to be correct.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW, buildConfig } from './fixtures';
import * as Types from '../src/config/types';
import * as Column from '../src/rendering/column';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** Renders one view and returns the inline `style` of its first event element. */
function eventStyle(view: Types.EffectiveView, overrides: Partial<Types.Config> = {}): string {
  const config = buildConfig(overrides as never);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'column'
      ? Column.renderColumnGroupedEvents(days, config, 'en', undefined, null)
      : Render.renderGroupedEvents(days, config, 'en', undefined, null),
    container,
  );
  const element = container.querySelector('.event');
  expect(element, `expected the ${view} view to render an .event element`).not.toBeNull();
  return element?.getAttribute('style') ?? '';
}

describe('column view inline style bindings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the per-calendar accent border', () => {
    it('paints the configured accent colour onto the column event', () => {
      expect(eventStyle('column', { accent_color: '#ff0000' })).toContain('solid #ff0000');
    });

    it('paints the same accent colour onto the list event', () => {
      // Control: already covered by the list DOM snapshot, so a failure here means the
      // assertion shape is wrong rather than the column view being broken.
      expect(eventStyle('list', { accent_color: '#ff0000' })).toContain('solid #ff0000');
    });
  });

  describe('the event background colour', () => {
    it('draws a background on the column event once an opacity is configured', () => {
      expect(eventStyle('column', { event_background_opacity: 50 })).toContain(
        'background-color: #03a9f4',
      );
    });

    it('draws the same background on the list event', () => {
      expect(eventStyle('list', { event_background_opacity: 50 })).toContain(
        'background-color: #03a9f4',
      );
    });

    it('leaves the column background empty at the default opacity', () => {
      // Paired with the presence test above: without it, a binding that never draws
      // anything would satisfy this assertion for entirely the wrong reason.
      expect(eventStyle('column', {})).toContain('background-color: ;');
    });
  });
});
