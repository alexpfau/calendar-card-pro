/**
 * The toolbar's month heading sets the month's own name bold and the year regular, as a desktop
 * calendar does: "**November** 2026", "2026년 **11월**", "2026年**11**月".
 *
 * Which run is the month comes from `Intl.DateTimeFormat.prototype.formatToParts`, so these walk
 * every card language rather than a few: the order and the separators are each language's own,
 * and a split by position would be right for the languages it was written against and wrong for
 * the rest. The oracle is `Intl`'s parts themselves, compared with the runs the card cuts from
 * `format()`, which are two different derivations of the same boundaries.
 */
import { readdirSync } from 'node:fs';

import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';

import * as Toolbar from '../src/rendering/toolbar';
import * as Paging from '../src/utils/paging';

/** Every card language, as the card's own translation files name them. */
const CARD_LANGUAGES = readdirSync('src/translations/languages')
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

const FORMS = ['long', 'short'] as const;

/** Every kind of space as one plain space: `Intl`'s parts and its `format()` differ only there. */
const spaces = (text: string): string => text.replace(/\s/g, ' ');

const noop = (): void => undefined;

const RANGE = 'Nov 2 – 8';

/**
 * Draw the toolbar's heading row for one language and form, as the card hands it over.
 *
 * @param language - Card language
 * @param form - The month in full or short
 * @param withNavigation - Whether the month is the date picker's button
 * @returns The rendered toolbar
 */
function drawHeading(
  language: string,
  form: Paging.MonthForm,
  withNavigation: boolean,
): HTMLElement {
  const host = document.createElement('div');
  const toolbar: Toolbar.HeaderToolbar = {
    heading: {
      text: Paging.monthHeadingParts(new Date(2026, 10, 1), language, form),
      reserve: Paging.monthHeadings(language, form),
      full: Paging.monthHeadings(language, 'long'),
      short: form === 'short',
      range: RANGE,
    },
    navigation: withNavigation
      ? {
          homeName: 'Today',
          previousName: 'Previous',
          nextName: 'Next',
          inert: false,
          pickerValue: '2026-11-02',
          onPrevious: noop,
          onHome: noop,
          onNext: noop,
          onPick: noop,
        }
      : undefined,
    reset: withNavigation ? undefined : { label: 'Reset', active: true, onActivate: noop },
  };
  render(
    Toolbar.renderHeaderToolbar(toolbar, html`<div class="card-header-placeholder"></div>`),
    host,
  );
  return host;
}

describe("the month heading's runs", () => {
  it("mark exactly Intl's month part, in every card language, and leave the rest as written", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const language of CARD_LANGUAGES) {
      for (const form of FORMS) {
        for (let month = 0; month < 12; month++) {
          const date = new Date(2026, month, 1);
          const format = new Intl.DateTimeFormat(language, { month: form, year: 'numeric' });
          const parts = format.formatToParts(date);
          const locale = format.resolvedOptions().locale;
          const intlMonth = parts.find((part) => part.type === 'month')!.value;
          const expectedMonth =
            parts[0].type === 'month'
              ? intlMonth.charAt(0).toLocaleUpperCase(locale) + intlMonth.slice(1)
              : intlMonth;
          const expectedRest = parts
            .filter((part) => part.type !== 'month')
            .map((part) => part.value)
            .join('');

          const runs = Paging.monthHeadingParts(date, language, form);
          const months = runs.filter((run) => run.month);
          const rest = runs
            .filter((run) => !run.month)
            .map((run) => run.text)
            .join('');
          const where = `${language} ${form} ${month}: ${JSON.stringify(runs)}`;
          checked++;

          if (months.length !== 1 || months[0].text !== expectedMonth) wrong.push(where);
          else if (spaces(rest) !== spaces(expectedRest)) wrong.push(where);
          // The runs are the heading's words exactly, spaces included, cut and nothing more.
          else if (Paging.monthHeadingText(runs) !== Paging.monthHeading(date, language, form)) {
            wrong.push(where);
          } else if (runs.some((run, i) => i > 0 && !run.month && !runs[i - 1].month)) {
            wrong.push(where);
          }
        }
      }
    }
    expect(CARD_LANGUAGES).toHaveLength(36);
    expect(checked).toBe(36 * 2 * 12);
    expect(wrong).toEqual([]);
  });

  it("follow each language's own order", () => {
    const runs = (language: string, form: Paging.MonthForm = 'long') =>
      Paging.monthHeadingParts(new Date(2026, 10, 1), language, form).map((run) =>
        run.month ? `[${run.text}]` : run.text,
      );
    expect(runs('en')).toEqual(['[November]', ' 2026']);
    expect(runs('de', 'short')).toEqual(['[Nov.]', ' 2026']);
    expect(runs('hu')).toEqual(['2026. ', '[november]']);
    expect(runs('ko')).toEqual(['2026년 ', '[11월]']);
    expect(runs('zh-CN')).toEqual(['2026年', '[11]', '月']);
    expect(runs('vi')).toEqual(['[Tháng 11]', ' năm 2026']);
  });
});

describe('the drawn month heading', () => {
  it('sets only the month bold, in the heading and in every copy that keeps or measures its room', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const language of CARD_LANGUAGES) {
      for (const form of FORMS) {
        for (const withNavigation of [false, true]) {
          const host = drawHeading(language, form, withNavigation);
          const where = `${language} ${form}${withNavigation ? ' picker' : ''}`;
          const runs = Paging.monthHeadingParts(new Date(2026, 10, 1), language, form);
          const monthRun = runs.find((run) => run.month)!.text;

          const text = host.querySelector('.toolbar-month-text')!;
          const names = text.querySelectorAll('.toolbar-month-name');
          checked++;
          if (text.textContent !== Paging.monthHeading(new Date(2026, 10, 1), language, form)) {
            wrong.push(`${where}: words ${JSON.stringify(text.textContent)}`);
          }
          if (names.length !== 1 || names[0].textContent !== monthRun) {
            wrong.push(`${where}: name ${JSON.stringify([...names].map((n) => n.textContent))}`);
          }

          const copies: Array<[string, ReadonlyArray<Paging.MonthHeadingText>]> = [
            ['.toolbar-month-reserve > span', Paging.monthHeadings(language, form)],
            ['.toolbar-month-probe > span', Paging.monthHeadings(language, 'long')],
          ];
          for (const [selector, headings] of copies) {
            const spans = [...host.querySelectorAll(selector)];
            if (spans.length !== 12) wrong.push(`${where}: ${spans.length} in ${selector}`);
            spans.forEach((span, i) => {
              const marked = span.querySelectorAll('.toolbar-month-name');
              const month = headings[i].find((run) => run.month)!.text;
              if (
                span.textContent !== Paging.monthHeadingText(headings[i]) ||
                marked.length !== 1 ||
                marked[0].textContent !== month
              ) {
                wrong.push(`${where}: ${selector} ${i} ${JSON.stringify(span.textContent)}`);
              }
            });
          }
        }
      }
    }
    expect(checked).toBe(36 * 2 * 2);
    expect(wrong).toEqual([]);
  });

  it('reads and is named exactly as before: the words, with the dates as the tooltip', () => {
    for (const withNavigation of [false, true]) {
      const host = drawHeading('en', 'long', withNavigation);
      const label = withNavigation
        ? host.querySelector<HTMLElement>('button.toolbar-month-button')!
        : host.querySelector<HTMLElement>('.toolbar-month-slot > span.toolbar-month-label')!;
      expect(label.getAttribute('title')).toBe(RANGE);
      // No name of its own: the button is named by its words, which inline markup leaves whole.
      expect(label.hasAttribute('aria-label')).toBe(false);
      expect(label.textContent!.trim()).toBe('November 2026');
      expect(host.querySelector('.toolbar-month-name')!.getAttribute('aria-hidden')).toBeNull();
      expect(host.querySelector('.toolbar-range-text')!.textContent).toBe(RANGE);
    }
  });
});
