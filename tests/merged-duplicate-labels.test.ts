/**
 * A merged duplicate must name every calendar it came from.
 *
 * `filter_duplicates` keeps the first-listed entry's copy and discards the rest, styling and
 * all. That is right for the accent color, which answers "which calendar is this" and can only
 * name one. It is wrong for the label, which is how a household dashboard says *whose* event
 * this is: a row that Anna and Ben both hold showed Anna's face alone, so the merge told the
 * reader less than leaving both rows visible would have.
 *
 * The suite is built from default config and `filter_duplicates` defaults to `false`, so none
 * of this is reachable unless a test turns it on — which is why the existing DOM gates stayed
 * green throughout and prove only that nothing leaked into the common path.
 *
 * ## What each case is the only one able to see
 *
 * - **Stacking** fails if `_mergedFrom` is never stamped, if the hand-written display-copy
 *   projection in `groupEventsByDay` drops it, or if rendering reads only the winner's label.
 *   Three separate mutations, one assertion, because the stamp is worthless at any missing link.
 * - **The block gate** is the only case that fails when the gate counts matching *blocks*
 *   rather than distinct *calendars*. That mutation leaves every other case here green while
 *   breaking the documented keyword-icon mapping pattern, where a title matching two blocks of
 *   one calendar is supposed to take the first block's icon and not both.
 * - **Resolved-value dedupe** is carried by the pair of `home-assistant` cases, and it is the
 *   second of them that discriminates: both calendars store the identical configured string,
 *   so a config-string comparison collapses two genuinely different icons into one and looks
 *   correct everywhere else. Measured — replacing the resolved comparison with a configured
 *   one fails that case and leaves the same-icon case green.
 * - **The single-label fallback** is carried by the case where the calendar that *wins* the
 *   merge is the unlabelled one. The obvious arrangement — winner labelled, loser not —
 *   cannot see the mutation, and neither can a markup comparison, because a one-element list
 *   renders byte-identically. Both were measured before this case was written.
 * - **The per-view isolation** case is the only one that fails if the stamp is written onto the
 *   event object instead of a copy. Both views deduplicate the same array in one render.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** The same event, as two calendars each return it. Identical on every signature field. */
function sharedEvent(entityId: string, matched?: Types.EntityConfig): Types.CalendarEventData {
  return {
    summary: 'Team lunch',
    start: { dateTime: '2026-06-17T11:00:00.000Z' },
    end: { dateTime: '2026-06-17T12:00:00.000Z' },
    location: 'Canteen',
    _entityId: entityId,
    ...(matched ? { _matchedConfig: matched } : {}),
  };
}

/** A Home Assistant whose entity registry holds an icon for each named calendar. */
function hassWithIcons(icons: Record<string, string>): Types.Hass {
  return {
    states: Object.fromEntries(
      Object.entries(icons).map(([entityId, icon]) => [entityId, { attributes: { icon } }]),
    ),
  } as unknown as Types.Hass;
}

function renderRows(
  events: Types.CalendarEventData[],
  config: Types.Config,
  hass?: Types.Hass | null,
): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en', undefined, hass), container);
  return container;
}

/** Every label drawn in front of an event title, in document order. */
function labelsDrawn(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.summary')].flatMap((summary) =>
    [...summary.children]
      .filter(
        (node) =>
          node.classList.contains('calendar-label') || node.matches('.label-icon, .label-image'),
      )
      .map(
        (node) =>
          node.getAttribute('icon') ?? node.getAttribute('src') ?? node.textContent?.trim() ?? '',
      ),
  );
}

describe('labels on a merged duplicate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws one label per contributing calendar, in entities order', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
    );

    expect(container.querySelectorAll('.summary')).toHaveLength(1);
    expect(labelsDrawn(container)).toEqual(['👩', '👨']);
  });

  it('leaves an unmerged row alone when the same calendars hold different events', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: true,
    });

    const bensOwn = { ...sharedEvent('calendar.ben'), summary: 'Dentist' };
    const container = renderRows([sharedEvent('calendar.anna'), bensOwn], config);

    expect(labelsDrawn(container)).toEqual(['👩', '👨']);
    expect(container.querySelectorAll('.summary')).toHaveLength(2);
  });

  it('shows both rows and both labels when deduplication is off', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: false,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
    );

    expect(container.querySelectorAll('.summary')).toHaveLength(2);
    expect(labelsDrawn(container)).toEqual(['👩', '👨']);
  });

  it('does not stack two blocks of one calendar, so keyword icon mapping keeps its winner', () => {
    const swim: Types.EntityConfig = {
      entity: 'calendar.family',
      allowlist: 'swim',
      label: 'mdi:swim',
    };
    const meeting: Types.EntityConfig = {
      entity: 'calendar.family',
      allowlist: 'meeting',
      label: 'mdi:briefcase',
    };

    const config = buildConfig({ entities: [swim, meeting], filter_duplicates: true });

    // What `processEvents` hands over for a title matching both blocks: one copy per block,
    // each stamped with the block that claimed it.
    const container = renderRows(
      [
        { ...sharedEvent('calendar.family', swim), summary: 'Swim meeting' },
        { ...sharedEvent('calendar.family', meeting), summary: 'Swim meeting' },
      ],
      config,
    );

    expect(container.querySelectorAll('.summary')).toHaveLength(1);
    expect(labelsDrawn(container)).toEqual(['mdi:swim']);
  });

  it('draws a label once when two calendars resolve to the same one', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: 'home-assistant' },
        { entity: 'calendar.ben', label: 'home-assistant' },
      ],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
      hassWithIcons({ 'calendar.anna': 'mdi:calendar', 'calendar.ben': 'mdi:calendar' }),
    );

    expect(labelsDrawn(container)).toEqual(['mdi:calendar']);
  });

  /**
   * The discriminator between deduplicating on the configured value and on the resolved one.
   * Both calendars store the identical string `home-assistant`, so a config-string comparison
   * collapses them here too and draws one icon where two calendars are genuinely distinct.
   * Only the resolved values differ, and only they answer what the reader sees.
   */
  it('keeps both labels when one configured value resolves to two different icons', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: 'home-assistant' },
        { entity: 'calendar.ben', label: 'home-assistant' },
      ],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
      hassWithIcons({ 'calendar.anna': 'mdi:account', 'calendar.ben': 'mdi:briefcase' }),
    );

    expect(labelsDrawn(container)).toEqual(['mdi:account', 'mdi:briefcase']);
  });

  it('keeps the winner alone when only one contributing calendar carries a label', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna', label: '👩' }, { entity: 'calendar.ben' }],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
    );

    expect(labelsDrawn(container)).toEqual(['👩']);
  });

  /**
   * What the `length > 1` gate actually buys, and the only case able to see it.
   *
   * The reverse arrangement is what discriminates. Here the calendar that *wins* the merge
   * carries no label and the one that loses does, so the gate is the difference between the
   * row rendering as it always has and the row promoting a label belonging to a calendar
   * whose color it is not wearing.
   *
   * The obvious version of this test — winner labelled, loser not — cannot see the mutation
   * at all, and neither can a comparison of the rendered markup. Both were measured: routing
   * a single label through the list produces byte-identical DOM, so there is no marker
   * argument here, only a behavioral one.
   */
  it('draws no label when the calendar that won the merge has none', () => {
    const config = buildConfig({
      entities: [{ entity: 'calendar.anna' }, { entity: 'calendar.ben', label: '👨' }],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
    );

    expect(container.querySelectorAll('.summary')).toHaveLength(1);
    expect(labelsDrawn(container)).toEqual([]);
  });

  it('stacks icons and emoji together, each keeping its own shape', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: 'mdi:briefcase' },
      ],
      filter_duplicates: true,
    });

    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      config,
    );

    const summary = container.querySelector('.summary');
    expect(summary?.querySelectorAll('.calendar-label')).toHaveLength(1);
    expect(summary?.querySelectorAll('.label-icon')).toHaveLength(1);
    expect(labelsDrawn(container)).toEqual(['👩', 'mdi:briefcase']);
  });
});

describe('the stamp is per view, not per event object', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * `filter_duplicates` is a `COLUMN_OVERRIDE_KEYS` member, so one render can deduplicate the
   * same array twice with different answers. Stamping the event object rather than a copy
   * passes every case above and fails here, because the list view would inherit the column
   * view's merge.
   */
  it('does not write the stamp onto the events it was handed', () => {
    const events = [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')];
    const config = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: true,
    });

    EventUtils.groupEventsByDay(events, config, false, 'en');

    expect(events.map((event) => event._mergedFrom)).toEqual([undefined, undefined]);
  });

  it('reports no merge to a view that has deduplication switched off', () => {
    const events = [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')];
    const merging = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: true,
    });
    const plain = buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩' },
        { entity: 'calendar.ben', label: '👨' },
      ],
      filter_duplicates: false,
    });

    renderRows(events, merging);
    const after = renderRows(events, plain);

    expect(after.querySelectorAll('.summary')).toHaveLength(2);
  });
});

/**
 * `duplicate_accent_color` answers a different question from the labels above.
 *
 * The labels say *who* a merged row belongs to and scale to as many calendars as share it.
 * This says only *that* it is shared, which is a binary — so one color suffices where a
 * color per combination could never work. The two compose rather than compete, which is
 * why the first case below asserts on both at once.
 *
 * Every case here is unreachable on default config: `filter_duplicates` is `false` and the
 * option is `undefined`, so nothing in the wider suite can see any of it.
 */
describe('the accent color of a merged duplicate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const twoCalendars = (extra: Partial<Types.Config> = {}) =>
    buildConfig({
      entities: [
        { entity: 'calendar.anna', label: '👩', accent_color: '#e91e63' },
        { entity: 'calendar.ben', label: '👨', accent_color: '#1e88e5' },
      ],
      filter_duplicates: true,
      ...extra,
    });

  /** The inline `border-inline-start` color the row draws its accent bar with. */
  function accentOf(container: HTMLElement, index = 0): string {
    const cell = [...container.querySelectorAll('[style*="border-inline-start"]')][index];
    return (cell?.getAttribute('style') ?? '').match(/border-inline-start:[^;]*/)?.[0] ?? '';
  }

  it('recolors a row merged across two calendars, and still draws both labels', () => {
    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      twoCalendars({ duplicate_accent_color: '#43a047' }),
    );

    expect(labelsDrawn(container)).toEqual(['👩', '👨']);
    expect(accentOf(container)).toContain('#43a047');
  });

  it('leaves a solitary row on its own calendar color', () => {
    const container = renderRows(
      [sharedEvent('calendar.anna')],
      twoCalendars({ duplicate_accent_color: '#43a047' }),
    );

    expect(accentOf(container)).toContain('#e91e63');
    expect(accentOf(container)).not.toContain('#43a047');
  });

  /**
   * The same gate the labels use, and the case that matters most: two blocks of one calendar
   * are the keyword-icon mapping pattern, not a shared event, and recoloring them would
   * repaint a perfectly ordinary row.
   */
  it('does not recolor two blocks of a single calendar', () => {
    const swim: Types.EntityConfig = {
      entity: 'calendar.family',
      allowlist: 'swim',
      label: 'mdi:swim',
      accent_color: '#e91e63',
    };
    const meeting: Types.EntityConfig = { ...swim, allowlist: 'meeting', label: 'mdi:briefcase' };

    const container = renderRows(
      [
        { ...sharedEvent('calendar.family', swim), summary: 'Swim meeting' },
        { ...sharedEvent('calendar.family', meeting), summary: 'Swim meeting' },
      ],
      buildConfig({
        entities: [swim, meeting],
        filter_duplicates: true,
        duplicate_accent_color: '#43a047',
      }),
    );

    expect(accentOf(container)).toContain('#e91e63');
    expect(accentOf(container)).not.toContain('#43a047');
  });

  it('keeps the first calendar color when the option is unset', () => {
    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      twoCalendars(),
    );

    expect(accentOf(container)).toContain('#e91e63');
  });

  /**
   * The background tint derives from the same accent, so it has to follow the override or the
   * row ends up wearing one calendar's wash under another's bar. Reading it separately is the
   * only way to catch an override applied to the bar alone.
   *
   * Uses a `var()` color deliberately. `convertToRGBA` resolves a hex through
   * `getComputedStyle` on a temp element, which happy-dom does not implement, so a hex comes
   * back unchanged here and the assertion could not tell an applied opacity from a skipped
   * one. The `var()` branch is pure string work and exercises the same call.
   */
  it('tints the row background from the merged color too', () => {
    const container = renderRows(
      [sharedEvent('calendar.anna'), sharedEvent('calendar.ben')],
      twoCalendars({
        duplicate_accent_color: 'var(--shared-event-color)',
        event_background_opacity: 20,
      }),
    );

    const style = [...container.querySelectorAll('[style*="background-color"]')]
      .map((n) => n.getAttribute('style') ?? '')
      .join(' ');

    expect(style).toContain('color-mix(in srgb, var(--shared-event-color) 20%, transparent)');
  });
});
