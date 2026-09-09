import { render as litRender } from 'lit';
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as Styles from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

/**
 * Why each `VIEW_SCOPE` entry added for grid is true.
 *
 * `editor-schema.test.ts` pins the table's membership, so an entry can neither vanish nor
 * appear unannounced. That is a different question from whether an entry is *correct*:
 * both directions of that pin are satisfied by an entry which is simply wrong, and a wrong
 * entry withholds a control that does work. This file is the other half — the measurement
 * the table is a record of.
 *
 * Two mechanisms, deliberately checked two different ways, because one method is dishonest
 * for the other's key.
 *
 * The five all-day content options are **structural**: grid's banner renderer emits the
 * summary and drops the rest, so flipping one changes the tree in list and cannot change
 * it in grid. A DOM comparison settles that outright.
 *
 * `event_spacing` is **not** structural and a DOM comparison would get it backwards. The
 * custom property is emitted in grid exactly as in list; what happens to it is that the
 * declaration reading it loses in the cascade. happy-dom does not do cascade resolution,
 * so the only honest unit-level check is on the stylesheet's own text — which is where the
 * mechanism lives anyway. The browser-level confirmation is recorded in the plan; what is
 * reproducible here is the three declarations and their order.
 */

/**
 * A frozen clock for the grid renderer's now-line only.
 *
 * Grouping is *not* frozen — `groupEventsByDay` filters against the real date — so the
 * fixture below is built relative to today rather than pinned to a literal. A literal date
 * renders an empty grid, which is trivially unchanged by every option here and reads as a
 * proof of inertness. The controls in this file exist because that is what happened.
 */
const NOW = new Date();

/** `YYYY-MM-DD`, `offset` days from today, in local time to match the grouping. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);

  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}

/**
 * An all-day event with somewhere to be and something to say.
 *
 * Every field the five options gate has to be populated, or flipping the option that shows
 * it changes nothing in *any* view and the control below is what fails rather than the
 * claim. Invented names only.
 */
function allDayEvent(start: string, end: string, summary: string): Types.CalendarEventData {
  return {
    start: { date: start },
    end: { date: end },
    summary,
    location: '12 Rowan Street, Springfield',
    description: 'Bring the folder Anna left out.',
    _entityId: 'calendar.personal',
  };
}

const EVENTS: Types.CalendarEventData[] = [
  // One single-day and one multi-day, because two of the five options gate on exactly that
  // distinction and a fixture holding only one shape cannot exercise both.
  allDayEvent(day(0), day(1), 'Ben study day'),
  allDayEvent(day(1), day(4), 'Anna away'),
];

/**
 * Config every render in this file starts from.
 *
 * Two of the five options are *sub*-options: `show_description_allday` decides whether an
 * all-day row joins in what `show_description` is already showing, so with the parent off
 * it changes nothing in any view — including list, where it works. That is a fixture
 * defect wearing the exact shape of the finding, and it is what the denominator test
 * below caught.
 */
const BASE: Partial<Types.Config> = {
  days_to_show: 5,
  show_location: true,
  show_description: true,
  show_countdown: true,
};

/**
 * One view's rendered tree, as markup.
 *
 * Grouping runs per view because `groupEventsByDay` resolves the view's own overrides, and
 * the renderer is handed the *effective* config so grid's divergent defaults arrive.
 * Skipping either renders something the card never would.
 */
function renderView(view: Types.EffectiveView, overrides: Partial<Types.Config>): string {
  const config = buildConfig({ view, ...BASE, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', view);
  const container = document.createElement('div');

  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, NOW)
      : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );

  return container.innerHTML;
}

/** The five options whose value grid's banner renderer computes and discards. */
const ALLDAY_CONTENT_KEYS = [
  'show_single_allday_time',
  'show_multiday_allday_time',
  'show_location_allday',
  'show_description_allday',
  'show_countdown_allday',
] as const;

describe('all-day content options in grid', () => {
  /**
   * Flip the option away from whatever the view actually resolves it to.
   *
   * Reading the default off `DEFAULT_CONFIG` would be wrong: grid diverges on several
   * options, so a "flip" against the card-wide default can land on the value the view
   * already had. Setting an option to the value it already holds changes nothing, which is
   * indistinguishable from the option being inert — a passing test measuring itself.
   */
  function flipped(view: Types.EffectiveView, key: string): Partial<Types.Config> {
    const base = ViewConfig.resolveEffectiveConfig(
      buildConfig({ view, ...BASE }),
      view,
    ) as unknown as Record<string, unknown>;
    const current = base[key];

    expect(typeof current, `${key} should resolve to a boolean in ${view}`).toBe('boolean');

    return { [key]: !(current as boolean) } as Partial<Types.Config>;
  }

  it.each(ALLDAY_CONTENT_KEYS)('%s changes the list tree', (key) => {
    // The denominator. Without this the grid assertion below is satisfied by a fixture
    // that exercises nothing, and reads as a proof of inertness either way.
    expect(renderView('list', flipped('list', key))).not.toBe(renderView('list', {}));
  });

  it.each(ALLDAY_CONTENT_KEYS)('%s cannot change the grid tree', (key) => {
    expect(renderView('grid', flipped('grid', key))).toBe(renderView('grid', {}));
  });

  it('renders something in grid for those options to have been inert in', () => {
    // A tree that is empty, or that holds no banner at all, is trivially unchanged by any
    // of the five. This is the second control: it asserts the grid fixture actually drew
    // the all-day rows whose content the claim is about.
    const markup = renderView('grid', {});

    expect(markup).toContain('grid-banner');
    expect(markup).toContain('Ben study day');
    expect(markup).toContain('Anna away');
  });

  it('a control option still moves the grid tree', () => {
    // And the third: proves the comparison can report a difference in grid at all, so the
    // five zeroes above are a reading of the card rather than of a broken harness.
    //
    // `days_to_show` rather than a display toggle, deliberately. Two better-looking
    // choices are both no-ops in grid for reasons that are themselves findings:
    // `show_past_events` moves nothing because every fixture event is today or later, and
    // `show_empty_days` moves nothing because grid draws a column per day whether or not
    // it has events. A control has to be something the view is known to honor, not
    // something it ought to.
    expect(renderView('grid', { days_to_show: 4 })).not.toBe(renderView('grid', {}));
  });
});

describe('event_spacing in grid', () => {
  /**
   * The stylesheet as text.
   *
   * `cardStyles` is a `css` tagged template, so its contents are one string and the
   * ordering question is answerable by index. Nothing here parses CSS — it looks for three
   * specific declarations and compares where they sit.
   */
  const sheet = Styles.cardStyles.cssText;

  /** Where a rule's own `padding` declaration is, measured from the selector. */
  function paddingIndex(selector: string): number {
    const start = sheet.indexOf(`${selector} {`);
    expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);

    const end = sheet.indexOf('}', start);
    const declaration = sheet.slice(start, end).indexOf('padding:');
    expect(declaration, `${selector} sets no padding`).toBeGreaterThan(-1);

    return start + declaration;
  }

  it('is the property .event padding reads', () => {
    const start = sheet.indexOf('.event {');
    const rule = sheet.slice(start, sheet.indexOf('}', start));

    expect(rule).toContain('var(--calendar-card-event-spacing)');
  });

  it('is overridden by rules that come later at the same specificity', () => {
    // Equal specificity — each is a single class — so source order alone decides, and both
    // grid rules are below `.event`. This is the whole mechanism: the property is emitted
    // in grid, the declaration reading it is simply not the one that wins.
    const base = paddingIndex('.event');

    expect(paddingIndex('.grid-event')).toBeGreaterThan(base);
    expect(paddingIndex('.grid-banner')).toBeGreaterThan(base);
  });

  it('is overridden on every grid node that carries .event', () => {
    // The half that ordering alone does not give. A later rule only wins where it matches,
    // so this asserts there is no grid node wearing `.event` without one of the two
    // overriding classes beside it — the timed block, the banner and the "+N more" chip.
    const container = document.createElement('div');
    container.innerHTML = renderView('grid', {});

    const nodes = [...container.querySelectorAll('.event')];

    expect(nodes.length, 'no .event nodes in the grid tree to check').toBeGreaterThan(0);

    for (const node of nodes) {
      expect(
        node.classList.contains('grid-event') || node.classList.contains('grid-banner'),
        `a grid node carries .event with neither override: ${node.className}`,
      ).toBe(true);
    }
  });
});
