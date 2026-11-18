/**
 * The month's name on a list's month rule (`month_separator_label`).
 *
 * The suite is built from default config, where the month rule is `0px` and the label off, so
 * nothing else in it draws either. Every assertion below is paired with the case that shows the
 * branch is reachable at all, and the three rule widths differ wherever more than one could be
 * drawn, so a branch that picks the wrong rule shows up as the wrong width.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** One event a day on each date given. */
function eventsOn(dates: string[]): Types.CalendarEventData[] {
  return dates.map((date) => ({
    start: { dateTime: `${date}T09:00:00.000Z` },
    end: { dateTime: `${date}T10:00:00.000Z` },
    summary: `event-${date}`,
    _entityId: 'calendar.anna',
  }));
}

/** Into July on a Wednesday: with week numbers on, the month rule is the plain one. */
const MID_WEEK = eventsOn(['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02']);

/**
 * Into February on a Monday: with ISO week numbers on, the month rule is the week row's. After
 * the frozen today, so no day of it is past.
 */
const WEEK_START = eventsOn(['2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02']);

/**
 * Three rule widths, all different, so a wrong branch draws a wrong width, on a card that leaves
 * the month out of every date, as the issue's does.
 */
const RULES: Partial<Types.Config> = {
  show_month: false,
  day_separator_width: '1px',
  week_separator_width: '2px',
  month_separator_width: '5px',
  month_separator_color: '#ff0000',
};

/**
 * One view's tree, grouped and drawn as the card does: grouping for the view, and the
 * renderer handed the view's effective configuration.
 */
function render(
  overrides: Partial<Types.Config>,
  events: Types.CalendarEventData[] = MID_WEEK,
  view: Types.EffectiveView = 'list',
  hass: Types.Hass | null = null,
  language = 'en',
): HTMLElement {
  const config = buildConfig({
    view,
    days_to_show: 10,
    start_date: events[0].start.dateTime!.slice(0, 10),
    ...overrides,
  });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(events, config, false, language, view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, language, undefined, hass, FROZEN_NOW)
      : view === 'column'
        ? Render.renderColumnGroupedEvents(days, effective, language, undefined, hass)
        : Render.renderGroupedEvents(days, effective, language, undefined, hass),
    container,
  );
  return container;
}

/**
 * A month and year as `Intl` writes them, its first letter raised where the month leads: the
 * oracle for the label, built from `Intl` directly rather than from the card's own formatter.
 */
function intlMonth(date: Date, language: string, form: 'long' | 'short'): string {
  const format = new Intl.DateTimeFormat(language, { month: form, year: 'numeric' });
  const text = format.format(date);
  return format.formatToParts(date)[0]?.type === 'month'
    ? text.charAt(0).toLocaleUpperCase(format.resolvedOptions().locale) + text.slice(1)
    : text;
}

/** A dashboard in a given language, with what decides its direction. */
function dashboard(language: string): Types.Hass {
  return {
    language,
    translationMetadata: { translations: { he: { isRTL: true }, en: { isRTL: false } } },
  } as unknown as Types.Hass;
}

const LRM = '\u200E';
const RLM = '\u200F';

/** The labels drawn, in document order. */
function labels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.month-separator-label')].map(
    (label) => label.textContent ?? '',
  );
}

/** A custom property written inline on an element. */
function property(element: Element | null, name: string): string | undefined {
  return element === null
    ? undefined
    : (element as HTMLElement).style.getPropertyValue(name).trim() || undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the month rule names its month', () => {
  it('draws the plain rule as it always has while the option is off', () => {
    const container = render(RULES);
    const rule = container.querySelector<HTMLElement>('.month-separator')!;

    expect(labels(container)).toEqual([]);
    expect(rule.style.borderTopWidth).toBe('5px');
    expect(rule.classList.contains('month-separator-labeled')).toBe(false);
    expect(rule.children).toHaveLength(0);
  });

  it('writes the month it opens at the start of the plain rule, the rule after it', () => {
    const off = render(RULES).querySelector<HTMLElement>('.month-separator')!;
    const container = render({ ...RULES, month_separator_label: true });
    const rule = container.querySelector<HTMLElement>('.month-separator')!;

    expect(labels(container)).toEqual(['Jul 2026']);
    expect([...rule.children].map((child) => child.className)).toEqual([
      'month-separator-label',
      'month-separator-line',
    ]);
    expect(rule.classList.contains('month-separator-labeled')).toBe(true);
    // The line draws the rule, at the month's own width and color; the container draws none.
    expect(rule.style.borderTopWidth).toBe('');
    expect(property(rule, '--separator-border-width')).toBe('5px');
    expect(property(rule, '--separator-border-color')).toBe('#ff0000');
    // And it keeps the plain rule's spacing.
    expect(rule.style.marginTop).toBe(off.style.marginTop);
    expect(rule.style.marginBottom).toBe(off.style.marginBottom);
    expect(rule.style.marginTop).not.toBe('');
  });

  it('marks the label with the card language', () => {
    const label = render({ ...RULES, month_separator_label: true }).querySelector(
      '.month-separator-label',
    )!;

    expect(label.getAttribute('lang')).toBe('en');
  });

  it('names the month after the number in the week row, and labels no plain week', () => {
    const container = render(
      { ...RULES, show_week_numbers: 'iso', month_separator_label: true },
      WEEK_START,
    );
    const rows = [...container.querySelectorAll('.week-row-table')];
    const labeled = rows.filter((row) => row.querySelector('.month-separator-label'));

    // The denominator: more week rows than the one the month opens.
    expect(rows.length).toBeGreaterThan(1);
    expect(labeled).toHaveLength(1);
    expect(labels(container)).toEqual(['Feb 2027']);
    const cell = labeled[0].querySelector('.separator-cell')!;
    expect(property(cell, '--separator-border-width')).toBe('5px');
    expect(cell.querySelector('.separator-line')).toBeNull();
    expect(
      [...cell.querySelector('.month-separator-labeled')!.children].map((c) => c.className),
    ).toEqual(['month-separator-label', 'month-separator-line']);
    // The number still comes first.
    expect(labeled[0].querySelector('.week-number')?.textContent).toBe('5');
  });

  it('draws a week row that opens no month exactly as before', () => {
    const on = render(
      { ...RULES, show_week_numbers: 'iso', month_separator_label: true },
      WEEK_START,
    );
    const off = render({ ...RULES, show_week_numbers: 'iso' }, WEEK_START);
    const plain = (container: HTMLElement) =>
      [...container.querySelectorAll('.week-row-table')]
        .filter((row) => !row.querySelector('.month-separator-label'))
        .map((row) => row.outerHTML.replace(/<!--[^>]*-->/g, ''));

    expect(plain(on).length).toBeGreaterThan(0);
    expect(plain(on)).toEqual(plain(off).slice(0, plain(on).length));
  });

  it('uses the plain rule at a mid-week month even with week numbers on', () => {
    const container = render({ ...RULES, show_week_numbers: 'iso', month_separator_label: true });

    expect(labels(container)).toEqual(['Jul 2026']);
    expect(container.querySelector('.month-separator .month-separator-label')?.textContent).toBe(
      'Jul 2026',
    );
  });

  it('draws no label where no month rule is drawn', () => {
    for (const width of ['0px', '0', '0em']) {
      const container = render({
        ...RULES,
        month_separator_width: width,
        month_separator_label: true,
      });
      expect(labels(container), width).toEqual([]);
      expect(container.querySelector('.month-separator'), width).toBeNull();
    }
  });

  it('keeps the width as written, in any unit', () => {
    for (const width of ['0.15em', 'thin', 'calc(1px + 0.1em)']) {
      const rule = render({
        ...RULES,
        month_separator_width: width,
        month_separator_label: true,
      }).querySelector('.month-separator-labeled');
      expect(property(rule, '--separator-border-width'), width).toBe(width);
    }
  });

  it('names the block below it in a list read latest first', () => {
    expect(
      labels(render({ ...RULES, month_separator_label: true, event_order: 'latest_first' })),
    ).toEqual(['Jun 2026']);
  });

  it('reads the list block over the top level, either way round', () => {
    const labelsWith = (overrides: Record<string, unknown>) =>
      labels(render({ ...RULES, ...overrides } as Partial<Types.Config>));

    expect(
      labelsWith({ month_separator_label: true, list: { month_separator_label: false } }),
    ).toEqual([]);
    expect(labelsWith({ list: { month_separator_label: true } })).toEqual(['Jul 2026']);
  });

  it('draws the label whether the dates show their month or not', () => {
    for (const showMonth of [false, true]) {
      expect(
        labels(render({ ...RULES, show_month: showMonth, month_separator_label: true })),
        String(showMonth),
      ).toEqual(['Jul 2026']);
    }
  });

  it("writes the month in the card's language, on both paths", () => {
    const july = new Date(2026, 6, 1);
    const february = new Date(2027, 1, 1);
    const weeks = { ...RULES, show_week_numbers: 'iso', month_separator_label: true } as const;
    for (const language of ['de', 'pl', 'ja']) {
      const plain = render(
        { ...RULES, month_separator_label: true },
        MID_WEEK,
        'list',
        null,
        language,
      );
      const row = render(weeks, WEEK_START, 'list', null, language);
      expect(labels(plain), language).toEqual([intlMonth(july, language, 'short')]);
      expect(labels(row), language).toEqual([intlMonth(february, language, 'short')]);
      expect(row.querySelector('.week-row-table .month-separator-label'), language).not.toBeNull();
      for (const label of plain.querySelectorAll('.month-separator-label')) {
        expect(label.getAttribute('lang'), language).toBe(language);
      }
    }
    // The control: German and English differ here, so an English label would fail above.
    expect(intlMonth(july, 'de', 'short')).not.toBe(intlMonth(july, 'en', 'short'));
  });

  it('names the month in full where the short form is only a number', () => {
    // The oracle says which form names the month, so this asserts the renderer takes the label
    // from the rule's own formatter, not from the plain short heading.
    const july = new Date(2026, 6, 1);
    const named = (form: 'long' | 'short') =>
      new Intl.DateTimeFormat('lt', { month: form, year: 'numeric' })
        .formatToParts(july)
        .some((part) => part.type === 'month' && /\p{L}/u.test(part.value));
    expect(named('short')).toBe(false);
    expect(named('long')).toBe(true);
    expect(
      labels(render({ ...RULES, month_separator_label: true }, MID_WEEK, 'list', null, 'lt')),
    ).toEqual([intlMonth(july, 'lt', 'long')]);
  });

  it("keeps the label in its language's direction on a dashboard running the other way", () => {
    const july = new Date(2026, 6, 1);
    const february = new Date(2027, 1, 1);
    const weeks = { ...RULES, show_week_numbers: 'iso', month_separator_label: true } as const;
    const on = { ...RULES, month_separator_label: true };
    const hebrewJuly = intlMonth(july, 'he', 'short');
    const hebrewFebruary = intlMonth(february, 'he', 'short');

    // An English card on a right-to-left dashboard, and a Hebrew card on a left-to-right one,
    // each on both paths: marked in the card language's own direction.
    expect(labels(render(on, MID_WEEK, 'list', dashboard('he')))).toEqual([`${LRM}Jul 2026${LRM}`]);
    expect(labels(render(weeks, WEEK_START, 'list', dashboard('he')))).toEqual([
      `${LRM}Feb 2027${LRM}`,
    ]);
    expect(labels(render(on, MID_WEEK, 'list', dashboard('en'), 'he'))).toEqual([
      `${RLM}${hebrewJuly}${RLM}`,
    ]);
    expect(labels(render(weeks, WEEK_START, 'list', dashboard('en'), 'he'))).toEqual([
      `${RLM}${hebrewFebruary}${RLM}`,
    ]);
    // The controls: where the two directions agree, nothing is added.
    expect(labels(render(on, MID_WEEK, 'list', dashboard('en')))).toEqual(['Jul 2026']);
    expect(labels(render(on, MID_WEEK, 'list', dashboard('he'), 'he'))).toEqual([hebrewJuly]);
  });
});

describe('column and grid ignore the month label', () => {
  for (const view of ['column', 'grid'] as const) {
    it(`draws ${view} view the same with the label on`, () => {
      const markup = (label: boolean) =>
        render({ ...RULES, month_separator_label: label }, MID_WEEK, view).innerHTML.replace(
          /<!--[^>]*-->/g,
          '',
        );

      // The control: the month boundary is in view, so a month rule is drawn there.
      expect(markup(false)).toContain(`${view}-separator-month`);
      expect(markup(true)).toBe(markup(false));
    });
  }
});
