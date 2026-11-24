/**
 * The month's name on a list's month rule (`month_separator_label`).
 *
 * The suite is built from default config, where the month rule is `0px` and the label off, so
 * nothing else in it draws either. Every assertion below is paired with the case that shows the
 * branch is reachable at all, and the three rule widths differ wherever more than one could be
 * drawn, so a branch that picks the wrong rule shows up as the wrong width.
 */

import { readdirSync } from 'node:fs';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';
import * as ColorMix from '../src/utils/color-mix';
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
  headingMonth?: Date,
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
        : Render.renderGroupedEvents(
            days,
            effective,
            language,
            undefined,
            hass,
            false,
            undefined,
            headingMonth,
          ),
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

/** The month label on, with week numbers, so a month that starts a week takes the week row. */
const WEEKS: Partial<Types.Config> = {
  ...RULES,
  show_week_numbers: 'iso',
  month_separator_label: true,
};

/** Every card language, read off the files as the card's own table is built from them. */
const CARD_LANGUAGES = readdirSync('src/translations/languages')
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length));

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
    const rule = [...container.querySelectorAll<HTMLElement>('.month-separator')].pop()!;

    // June's is the first month's, above the list (below).
    expect(labels(container)).toEqual(['Jun 2026', 'Jul 2026']);
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

  it('names the first month above the list, on a rule with no space above it', () => {
    // Without it the first days sat under no name of their own: a list whose first days with
    // events are in the next month read under the month of the page's first day.
    const container = render({ ...RULES, month_separator_label: true });
    const first = container.querySelector<HTMLElement>('.month-separator')!;
    const boundary = [...container.querySelectorAll<HTMLElement>('.month-separator')].pop()!;

    expect(first.classList.contains('month-separator-labeled')).toBe(true);
    expect(first.querySelector('.month-separator-label')?.textContent).toBe('Jun 2026');
    expect(property(first, '--separator-border-width')).toBe('5px');
    expect(first.style.marginTop).toBe('0px');
    expect(first.style.marginBottom).toBe(boundary.style.marginBottom);
    // The control: the first day still opens with no rule while the label is off.
    expect(labels(render(RULES))).toEqual([]);
    expect(render(RULES).querySelectorAll('.month-separator')).toHaveLength(1);
  });

  it('names the first month on every path into the first day', () => {
    // The plain path, the first week without its number, and the first week with it.
    const nextMonth = eventsOn(['2026-12-02', '2026-12-03']);
    const start = { start_date: '2026-11-21', days_to_show: 14 };
    expect(labels(render({ ...RULES, ...start, month_separator_label: true }, nextMonth))).toEqual([
      'Dec 2026',
    ]);
    expect(
      labels(
        render(
          { ...WEEKS, ...start, show_current_week_number: false } as Partial<Types.Config>,
          nextMonth,
        ),
      ),
    ).toEqual(['Dec 2026']);
    const numbered = render(
      { ...WEEKS, ...start, show_current_week_number: true } as Partial<Types.Config>,
      nextMonth,
    );
    expect(labels(numbered)).toEqual(['Dec 2026']);
    const row = numbered.querySelector('.week-row-table')!;
    expect(row.querySelector('.week-number')?.textContent).toBe('49');
    expect(row.querySelector('.month-separator-label')?.textContent).toBe('Dec 2026');
    expect(property(row.querySelector('.separator-cell'), '--separator-display')).toBe('block');
  });

  it('leaves the first month to a toolbar heading that names it, on every path', () => {
    // The toolbar's month sits right above the list: labeling the first block as well named the
    // same month twice, one under the other.
    const nextMonth = eventsOn(['2026-12-02', '2026-12-03', '2027-01-04']);
    const start = { start_date: '2026-11-21', days_to_show: 50 };
    const paths: Array<[string, Partial<Types.Config>]> = [
      ['plain', { ...RULES, ...start, month_separator_label: true }],
      ['first week', { ...WEEKS, ...start, show_current_week_number: false }],
      ['week row', { ...WEEKS, ...start, show_current_week_number: true }],
    ];
    const strip = (html: string) =>
      html.replace(/<!--\?lit\$[0-9]+\$-->/g, '').replace(/<!---->/g, '');
    const firstDay = (container: HTMLElement) =>
      strip(container.innerHTML.split(/<table class="\s*day-table/)[0]);

    for (const [path, config] of paths) {
      const december = new Date(2026, 11, 1);
      const named = render(config, nextMonth, 'list', null, 'en', december);
      // Later months keep theirs.
      expect(labels(named), path).toEqual(['Jan 2027']);
      // The first day opens as it does with the label off; on the week row path, with its row.
      expect(firstDay(named).includes('week-row-table'), path).toBe(path === 'week row');
      expect(firstDay(named), path).toBe(
        firstDay(render({ ...config, month_separator_label: false }, nextMonth)),
      );
      // Controls: a heading naming another month, the page's November, leaves the label, as does
      // no heading at all.
      const november = new Date(2026, 10, 21);
      expect(labels(render(config, nextMonth, 'list', null, 'en', november)), path).toEqual([
        'Dec 2026',
        'Jan 2027',
      ]);
      expect(labels(render(config, nextMonth)), path).toEqual(['Dec 2026', 'Jan 2027']);
      // The same month of another year is another month.
      const lastYear = new Date(2025, 11, 1);
      expect(labels(render(config, nextMonth, 'list', null, 'en', lastYear)), path).toEqual([
        'Dec 2026',
        'Jan 2027',
      ]);
    }
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

    // The denominator: more week rows than the one the month opens. The first names January.
    expect(rows.length).toBeGreaterThan(1);
    expect(labeled).toHaveLength(2);
    expect(labels(container)).toEqual(['Jan 2027', 'Feb 2027']);
    const cell = labeled[1].querySelector('.separator-cell')!;
    expect(property(cell, '--separator-border-width')).toBe('5px');
    expect(cell.querySelector('.separator-line')).toBeNull();
    expect(
      [...cell.querySelector('.month-separator-labeled')!.children].map((c) => c.className),
    ).toEqual(['month-separator-label', 'month-separator-line']);
    // The number still comes first.
    expect(labeled[1].querySelector('.week-number')?.textContent).toBe('5');
  });

  it('draws a week row that opens no month exactly as before', () => {
    // Into a second week of February, so one week row opens neither the list nor a month.
    const events = [...WEEK_START, ...eventsOn(['2027-02-08'])];
    const on = render({ ...RULES, show_week_numbers: 'iso', month_separator_label: true }, events);
    const off = render({ ...RULES, show_week_numbers: 'iso' }, events);
    const rows = (container: HTMLElement) =>
      new Map(
        [...container.querySelectorAll('.week-row-table')].map((row) => [
          row.querySelector('.week-number')?.textContent,
          row,
        ]),
      );
    const plain = [...rows(on)].filter(([, row]) => !row.querySelector('.month-separator-label'));

    expect(plain.map(([week]) => week)).toEqual(['6']);
    for (const [week, row] of plain) {
      expect(
        row.outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '').replace(/<!---->/g, ''),
        week!,
      ).toBe(
        rows(off)
          .get(week)!
          .outerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '')
          .replace(/<!---->/g, ''),
      );
    }
  });

  it('uses the plain rule at a mid-week month even with week numbers on', () => {
    const container = render({ ...RULES, show_week_numbers: 'iso', month_separator_label: true });

    expect(labels(container)).toEqual(['Jun 2026', 'Jul 2026']);
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
    ).toEqual(['Jul 2026', 'Jun 2026']);
  });

  it('reads the list block over the top level, either way round', () => {
    const labelsWith = (overrides: Record<string, unknown>) =>
      labels(render({ ...RULES, ...overrides } as Partial<Types.Config>));

    expect(
      labelsWith({ month_separator_label: true, list: { month_separator_label: false } }),
    ).toEqual([]);
    expect(labelsWith({ list: { month_separator_label: true } })).toEqual(['Jun 2026', 'Jul 2026']);
  });

  it('draws the label whether the dates show their month or not, on both paths', () => {
    for (const showMonth of [false, true]) {
      const on = { ...RULES, show_month: showMonth, month_separator_label: true };
      expect(labels(render(on)), `plain ${showMonth}`).toEqual(['Jun 2026', 'Jul 2026']);
      expect(
        labels(render({ ...on, show_week_numbers: 'iso' }, WEEK_START)),
        `week row ${showMonth}`,
      ).toEqual(['Jan 2027', 'Feb 2027']);
    }
  });

  it("writes the month in the card's language, on both paths", () => {
    const june = new Date(2026, 5, 1);
    const july = new Date(2026, 6, 1);
    const january = new Date(2027, 0, 1);
    const february = new Date(2027, 1, 1);
    for (const language of ['de', 'pl', 'ja']) {
      const plain = render(
        { ...RULES, month_separator_label: true },
        MID_WEEK,
        'list',
        null,
        language,
      );
      const row = render(WEEKS, WEEK_START, 'list', null, language);
      expect(labels(plain), language).toEqual([
        intlMonth(june, language, 'short'),
        intlMonth(july, language, 'short'),
      ]);
      expect(labels(row), language).toEqual([
        intlMonth(january, language, 'short'),
        intlMonth(february, language, 'short'),
      ]);
      expect(row.querySelector('.week-row-table .month-separator-label'), language).not.toBeNull();
      for (const label of [plain, row].flatMap((each) => [
        ...each.querySelectorAll('.month-separator-label'),
      ])) {
        expect(label.getAttribute('lang'), language).toBe(language);
      }
    }
    // The control: German and English differ here, so an English label would fail above.
    expect(intlMonth(july, 'de', 'short')).not.toBe(intlMonth(july, 'en', 'short'));
  });

  it('names the month in full where the short form is only a number, on both paths', () => {
    // Which language abbreviates a month to its number is CLDR's to say and can change between
    // runtimes, so the language is found in the runtime's own data rather than named here.
    const june = new Date(2026, 5, 1);
    const july = new Date(2026, 6, 1);
    const january = new Date(2027, 0, 1);
    const february = new Date(2027, 1, 1);
    const named = (language: string, date: Date, form: 'long' | 'short') =>
      new Intl.DateTimeFormat(language, { month: form, year: 'numeric' })
        .formatToParts(date)
        .some((part) => part.type === 'month' && /\p{L}/u.test(part.value));
    const numeric = CARD_LANGUAGES.filter((language) =>
      [june, july, january, february].every(
        (date) => !named(language, date, 'short') && named(language, date, 'long'),
      ),
    );
    // The denominator: some card language takes the fallback, or this test checked nothing.
    expect(numeric.length).toBeGreaterThan(0);

    for (const language of numeric) {
      expect(
        labels(render({ ...RULES, month_separator_label: true }, MID_WEEK, 'list', null, language)),
        language,
      ).toEqual([intlMonth(june, language, 'long'), intlMonth(july, language, 'long')]);
      expect(labels(render(WEEKS, WEEK_START, 'list', null, language)), language).toEqual([
        intlMonth(january, language, 'long'),
        intlMonth(february, language, 'long'),
      ]);
    }
  });

  it("keeps the label in its language's direction on a dashboard running the other way", () => {
    const hebrew = (year: number, month: number) =>
      intlMonth(new Date(year, month, 1), 'he', 'short');
    const weeks = WEEKS;
    const on = { ...RULES, month_separator_label: true };
    const marked = (mark: string, ...texts: string[]) =>
      texts.map((text) => `${mark}${text}${mark}`);

    // An English card on a right-to-left dashboard, and a Hebrew card on a left-to-right one,
    // each on both paths: marked in the card language's own direction.
    expect(labels(render(on, MID_WEEK, 'list', dashboard('he')))).toEqual(
      marked(LRM, 'Jun 2026', 'Jul 2026'),
    );
    expect(labels(render(weeks, WEEK_START, 'list', dashboard('he')))).toEqual(
      marked(LRM, 'Jan 2027', 'Feb 2027'),
    );
    expect(labels(render(on, MID_WEEK, 'list', dashboard('en'), 'he'))).toEqual(
      marked(RLM, hebrew(2026, 5), hebrew(2026, 6)),
    );
    expect(labels(render(weeks, WEEK_START, 'list', dashboard('en'), 'he'))).toEqual(
      marked(RLM, hebrew(2027, 0), hebrew(2027, 1)),
    );
    // The controls: where the two directions agree, nothing is added.
    expect(labels(render(on, MID_WEEK, 'list', dashboard('en')))).toEqual(['Jun 2026', 'Jul 2026']);
    expect(labels(render(on, MID_WEEK, 'list', dashboard('he'), 'he'))).toEqual([
      hebrew(2026, 5),
      hebrew(2026, 6),
    ]);
  });
});

describe("the month name's color and size", () => {
  /** A color as the DOM reports it once written inline, so the comparison is like with like. */
  const asWritten = (color: string): string => {
    const probe = document.createElement('span');
    probe.style.color = color;
    return probe.style.color;
  };

  /** The first label's inline style, on the plain rule or in the week row. */
  const labelStyle = (overrides: Partial<Types.Config>, weekRow = false): CSSStyleDeclaration => {
    const container = weekRow
      ? render({ ...WEEKS, ...overrides }, WEEK_START)
      : render({ ...RULES, month_separator_label: true, ...overrides });
    return container.querySelector<HTMLElement>('.month-separator-label')!.style;
  };

  it("takes the month rule's color while its own is unset, on both paths", () => {
    for (const weekRow of [false, true]) {
      expect(labelStyle({}, weekRow).color, String(weekRow)).toBe(asWritten('#ff0000'));
      expect(labelStyle({ month_separator_color: '#0000ff' }, weekRow).color).toBe(
        asWritten('#0000ff'),
      );
    }
    // The control: the rule's color reaches the label only because it is the rule's, so a
    // label drawn in the theme's text color would fail above.
    expect(asWritten('#ff0000')).not.toBe(asWritten('var(--primary-text-color)'));
  });

  it("follows the default month rule color, the theme's text", () => {
    const shipped = DEFAULT_CONFIG.month_separator_color;
    expect(shipped).toBe('var(--primary-text-color)');
    expect(labelStyle({ month_separator_color: shipped }).color).toBe(asWritten(shipped));
  });

  it('writes a shipped mix as the browser can draw it, inherited or its own, on both paths', () => {
    // The grid rules' shipped color: a mix the card floors to a translucent gray where the
    // browser has no color-mix().
    const mix = ViewConfig.TIME_GRID_DEFAULTS.hour_line_color;
    const floor = ColorMix.COLOR_MIX_FLOORS.get(mix)!;
    expect(floor).toBeDefined();
    expect(asWritten(floor)).not.toBe('');
    expect(asWritten(mix)).not.toBe(asWritten(floor));
    const cases: Array<Partial<Types.Config>> = [
      { month_separator_color: mix },
      { month_separator_color: '#ff0000', month_separator_label_color: mix },
    ];
    try {
      for (const supported of [true, false]) {
        vi.stubGlobal('CSS', { supports: () => supported });
        ColorMix.resetColorMixSupport();
        for (const overrides of cases) {
          for (const weekRow of [false, true]) {
            expect(labelStyle(overrides, weekRow).color, `${supported} ${weekRow}`).toBe(
              asWritten(supported ? mix : floor),
            );
          }
        }
      }
    } finally {
      vi.unstubAllGlobals();
      ColorMix.resetColorMixSupport();
    }
  });

  it("takes its own color over the rule's, and the list block over the top level", () => {
    for (const weekRow of [false, true]) {
      expect(labelStyle({ month_separator_label_color: '#00ff00' }, weekRow).color).toBe(
        asWritten('#00ff00'),
      );
    }
    expect(
      labelStyle({
        month_separator_label_color: '#00ff00',
        list: { month_separator_label_color: '#123456' },
      } as Partial<Types.Config>).color,
    ).toBe(asWritten('#123456'));
    // The rule keeps its own color.
    const rule = render({
      ...RULES,
      month_separator_label: true,
      month_separator_label_color: '#00ff00',
    }).querySelector<HTMLElement>('.month-separator-labeled')!;
    expect(rule.style.getPropertyValue('--separator-border-color').trim()).toBe('#ff0000');
  });

  it('takes its size from the card, 12px unless set, the list block over the top level', () => {
    const PROPERTY = '--calendar-card-month-separator-label-font-size';
    const sizeFor = (overrides: Partial<Types.Config>): string =>
      generateCustomPropertiesObject(
        ViewConfig.resolveEffectiveConfig(buildConfig(overrides), 'list'),
      )[PROPERTY];

    expect(sizeFor({})).toBe('12px');
    for (const size of ['16px', '1.2em', '0.9rem', 'small', 'calc(10px + 0.2em)']) {
      expect(sizeFor({ month_separator_label_font_size: size }), size).toBe(size);
    }
    expect(
      sizeFor({
        month_separator_label_font_size: '16px',
        list: { month_separator_label_font_size: '1.5em' },
      } as Partial<Types.Config>),
    ).toBe('1.5em');
    // The label reads it, on both paths, and is not sized inline over it.
    expect(cardStyles.cssText).toMatch(
      new RegExp(`\\.month-separator-label \\{[^}]*font-size: var\\(${PROPERTY}\\);`),
    );
    for (const weekRow of [false, true]) {
      expect(labelStyle({ month_separator_label_font_size: '20px' }, weekRow).fontSize).toBe('');
    }
  });
});

describe('column and grid ignore the month label', () => {
  for (const view of ['column', 'grid'] as const) {
    it(`draws ${view} view the same with the label and its style on`, () => {
      const markup = (label: boolean) =>
        render(
          {
            ...RULES,
            ...(label
              ? {
                  month_separator_label: true,
                  month_separator_label_color: '#00ff00',
                  month_separator_label_font_size: '20px',
                }
              : {}),
          },
          MID_WEEK,
          view,
        )
          .innerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '')
          .replace(/<!---->/g, '');

      // The control: the month boundary is in view, so a month rule is drawn there.
      expect(markup(false)).toContain(`${view}-separator-month`);
      expect(markup(true)).toBe(markup(false));
    });
  }
});
