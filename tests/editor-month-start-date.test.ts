/**
 * Start Date on Month's page: Month opens the month holding the start date, fixed or relative to
 * today, except Tomorrow and Start of Week, which open today's month (`ViewConfig.monthHomeDay`).
 * So its page offers Today, A Fixed Date and Relative to Today, and reads a stored Tomorrow or
 * Start of Week as Today. Those have no Reset there, which would change the other layouts alone,
 * and the line under the chips names what those layouts start on instead. Start Date's home and
 * the other layouts' pages keep all five choices. Names are invented.
 */
import { describe, expect, it } from 'vitest';

import {
  changeField,
  goOverview,
  goPage,
  lastConfig,
  mountEditor,
  reportsOf,
  resultRows,
  searchFor,
  valueOf,
} from './helpers/editor-host';
import { CURRENT_CONFIG_VERSION } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Synthetic from '../src/rendering/editor/synthetic';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const CARD = {
  type: 'custom:calendar-card-pro',
  config_version: CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna'],
  view: 'list',
  toolbar: { show: true, view_switcher: true },
};

const $ = (editor: Element, selector: string) =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);
const text = (element: Element | null): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function press(editor: Editor, key: string): Promise<void> {
  $(editor, `[data-focus="${key}"]`)!.click();
  await editor.updateComplete;
}

/** Opens a layout's Which Events, or Start Date's home for `shared`. */
async function openStartDate(editor: Editor, scope: 'list' | 'month' | 'shared'): Promise<void> {
  await goOverview(editor);
  if (scope === 'shared') {
    await goPage(editor, 'events_weather_language');
    return;
  }
  await press(editor, `layout:${scope}`);
  await press(editor, 'nav:which_events');
}

/** What Start Date draws where it is open: its choices, the one chosen, its helper and its line. */
function startDate(editor: Editor): {
  choices: string[];
  chosen: string | undefined;
  helper: string;
  facts: string[];
  expression: boolean;
} {
  const group = $(editor, '[data-field="content:start_date_mode"][data-composed="chips"]')!;
  const choices = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  return {
    choices: choices.map((input) => text(input.closest('label'))),
    chosen: choices.find((input) => input.checked)?.value,
    helper: text(group.querySelector('p.hint')),
    facts: [...group.querySelectorAll('.fact, .line-button')].map(text),
    expression: $(editor, '[data-field="content:start_date_offset"]') !== null,
  };
}

/** The buttons on the Expression's own line, such as Remove Setting. */
const expressionActions = (editor: Editor): string[] =>
  [
    ...(editor
      .shadowRoot!.querySelector('[data-setting="content:start_date_offset"]')
      ?.querySelectorAll('.line-button') ?? []),
  ].map(text);

describe("Start Date on Month's page", () => {
  it('offers Today, A Fixed Date and Relative to Today, as Whole Card', async () => {
    const editor = await mountEditor(CARD);
    await openStartDate(editor, 'month');
    expect(startDate(editor)).toEqual({
      choices: ['Today', 'A Fixed Date', 'Relative to Today'],
      chosen: 'default',
      helper: '',
      facts: ['Whole Card'],
      expression: false,
    });
  });

  it.each([
    ['Tomorrow', 'today+1', 'Tomorrow'],
    ['Tomorrow written +1', '+1', 'Tomorrow'],
    ['Start of Week', 'start_of_week', 'Start of Week'],
  ])(
    'reads %s as Today, with no Reset, naming what the other layouts start on',
    async (_name, start_date, value) => {
      const editor = await mountEditor({ ...CARD, start_date });
      await openStartDate(editor, 'month');
      expect(startDate(editor)).toEqual({
        choices: ['Today', 'A Fixed Date', 'Relative to Today'],
        chosen: 'default',
        helper: '',
        facts: ['Whole Card', `${value} in List, Columns, and Grid`],
        expression: false,
      });
      expect($(editor, '[data-focus="reset:content:start_date_mode"]')).toBeNull();
      // Pressing the Today it shows writes nothing: the other layouts keep their start date.
      $(editor, '[data-focus="start_date_mode:default"]')!.click();
      await editor.updateComplete;
      expect(reportsOf(editor)).toEqual([]);
    },
  );

  it.each(['today+30', 'today-29', 'friday'])(
    'shows %s as Relative to Today, with its Expression and the usual line',
    async (start_date) => {
      const editor = await mountEditor({ ...CARD, start_date });
      await openStartDate(editor, 'month');
      expect(startDate(editor)).toEqual({
        choices: ['Today', 'A Fixed Date', 'Relative to Today'],
        chosen: 'offset',
        helper: '',
        facts: ['Set', 'Reset (Today)', 'Whole Card'],
        expression: true,
      });
      expect(valueOf(editor, 'content:start_date_offset')).toBe(start_date);
    },
  );

  it('keeps the usual line for a fixed date, whose Reset changes Month too', async () => {
    const editor = await mountEditor({ ...CARD, start_date: '2027-01-15' });
    await openStartDate(editor, 'month');
    expect(startDate(editor)).toMatchObject({
      chosen: 'fixed',
      facts: ['Set', 'Reset (Today)', 'Whole Card'],
    });
    expect($(editor, '[data-field="content:start_date_fixed"]')).not.toBeNull();
  });

  it('writes a fixed date for the whole card from A Fixed Date', async () => {
    const editor = await mountEditor({ ...CARD, start_date: 'start_of_week' });
    await openStartDate(editor, 'month');
    $(editor, '[data-focus="start_date_mode:fixed"]')!.click();
    await editor.updateComplete;
    const written = lastConfig(editor)!;
    expect(written.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(written).not.toHaveProperty('month');
    expect(startDate(editor)).toMatchObject({ chosen: 'fixed', expression: false });
  });

  it('writes an expression for the whole card from Relative to Today', async () => {
    const editor = await mountEditor(CARD);
    await openStartDate(editor, 'month');
    $(editor, '[data-focus="start_date_mode:offset"]')!.click();
    await editor.updateComplete;
    expect(startDate(editor)).toMatchObject({ chosen: 'offset', expression: true });
    await changeField(editor, 'content:start_date_offset', 'today+30');
    const written = lastConfig(editor)!;
    expect(written.start_date).toBe('today+30');
    expect(written).not.toHaveProperty('month');
    expect(startDate(editor)).toMatchObject({
      chosen: 'offset',
      facts: ['Set', 'Reset (Today)', 'Whole Card'],
    });
  });

  it('turns Tomorrow into another expression from Relative to Today', async () => {
    const editor = await mountEditor({ ...CARD, start_date: 'today+1' });
    await openStartDate(editor, 'month');
    // Relative to Today over Tomorrow writes nothing, and holds the choice, so the Expression
    // opens on Tomorrow's own. Month still opens today's month for it, so the line stays.
    $(editor, '[data-focus="start_date_mode:offset"]')!.click();
    await editor.updateComplete;
    expect(startDate(editor)).toMatchObject({
      chosen: 'offset',
      facts: ['Whole Card', 'Tomorrow in List, Columns, and Grid'],
      expression: true,
    });
    expect($(editor, '[data-focus="reset:content:start_date_mode"]')).toBeNull();
    // Nor does the Expression offer to reset or remove it.
    expect(expressionActions(editor)).toEqual([]);
    expect(valueOf(editor, 'content:start_date_offset')).toBe('today+1');
    await changeField(editor, 'content:start_date_offset', 'today+30');
    expect(lastConfig(editor)!.start_date).toBe('today+30');
    expect(startDate(editor)).toMatchObject({
      chosen: 'offset',
      facts: ['Set', 'Reset (Today)', 'Whole Card'],
      expression: true,
    });
    expect(expressionActions(editor)).toEqual(['Remove Setting']);
  });

  it('keeps Tomorrow when Today is pressed after Relative to Today', async () => {
    const editor = await mountEditor({ ...CARD, start_date: 'today+1' });
    await openStartDate(editor, 'month');
    $(editor, '[data-focus="start_date_mode:offset"]')!.click();
    await editor.updateComplete;
    $(editor, '[data-focus="start_date_mode:default"]')!.click();
    await editor.updateComplete;
    // Today on Month's page is what Month draws for Tomorrow: nothing is written.
    expect(reportsOf(editor)).toEqual([]);
    expect(startDate(editor)).toMatchObject({
      chosen: 'default',
      facts: ['Whole Card', 'Tomorrow in List, Columns, and Grid'],
      expression: false,
    });
  });
});

describe("Start Date on Month's page, reached another way", () => {
  it('shows Relative to Today held on another page as held, Expression and all', async () => {
    const editor = await mountEditor({ ...CARD, start_date: 'today+1' });
    await openStartDate(editor, 'list');
    // Relative to Today over Tomorrow writes nothing, and holds the choice instead.
    $(editor, '[data-focus="start_date_mode:offset"]')!.click();
    await editor.updateComplete;
    expect(startDate(editor)).toMatchObject({ chosen: 'offset', expression: true });

    await openStartDate(editor, 'month');
    expect(startDate(editor)).toMatchObject({
      choices: ['Today', 'A Fixed Date', 'Relative to Today'],
      chosen: 'offset',
      facts: ['Whole Card', 'Tomorrow in List, Columns, and Grid'],
      expression: true,
    });
    expect(valueOf(editor, 'content:start_date_offset')).toBe('today+1');
  });

  it('is found from Month’s page with its home value, and edited there as Month’s page draws it', async () => {
    const editor = await mountEditor({ ...CARD, start_date: 'today+1' });
    await openStartDate(editor, 'month');
    await press(editor, 'search-open');
    await searchFor(editor, 'tomorrow');
    expect(resultRows(editor).find(({ id }) => id === 'content:start_date_mode')?.meta).toMatch(
      /^Tomorrow( · |$)/,
    );
    $(editor, '[data-focus="edit-here"]')!.click();
    await editor.updateComplete;
    const group = $(
      editor,
      '.result--edit [data-field="content:start_date_mode"][data-composed="chips"]',
    )!;
    expect(
      [...group.querySelectorAll('input[type="radio"]')].map((input) =>
        text(input.closest('label')),
      ),
    ).toEqual(['Today', 'A Fixed Date', 'Relative to Today']);
    expect([...group.querySelectorAll('.fact, .line-button')].map(text)).toEqual([
      'Whole Card',
      'Tomorrow in List, Columns, and Grid',
    ]);

    // Relative to Today brings its Expression into the result, where the page would draw it.
    const expression = () =>
      $(editor, '.result--edit [data-field="content:start_date_offset"]') !== null;
    expect(expression()).toBe(false);
    group.querySelector<HTMLElement>('[data-focus="start_date_mode:offset"]')!.click();
    await editor.updateComplete;
    expect(expression()).toBe(true);
    // Typed into the result's own form, which reports its whole data as Home Assistant's does.
    const form = $(editor, '.result--edit [data-field="content:start_date_offset"] ha-form') as
      (HTMLElement & { data: Record<string, unknown> }) | null;
    expect(form).not.toBeNull();
    form!.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...form!.data, start_date_offset: 'today+30' } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(lastConfig(editor)!.start_date).toBe('today+30');
    expect(expression()).toBe(true);
  });
});

describe('Start Date everywhere else', () => {
  it.each(['shared', 'list'] as const)(
    'keeps all five choices on %s, and the Expression an expression asks for',
    async (scope) => {
      const editor = await mountEditor({ ...CARD, start_date: 'today-29' });
      await openStartDate(editor, scope);
      const drawn = startDate(editor);
      expect(drawn).toMatchObject({
        choices: ['Today', 'Tomorrow', 'Start of Week', 'A Fixed Date', 'Relative to Today'],
        chosen: 'offset',
        helper: '',
        expression: true,
      });
      expect(drawn.facts.slice(0, 2)).toEqual(['Set', 'Reset (Today)']);
    },
  );
});

describe('the card and the editor', () => {
  // The card opens today's month for exactly the start dates Month's page reads as Today, and the
  // month holding the resolved date for every other: Tomorrow and Start of Week, in the forms the
  // editor reads as those choices, are the only relative ones it does not follow.
  it.each([
    [undefined, true],
    ['', true],
    // Blank text resolves to today, as no start date does.
    [' ', true],
    ['today+1', true],
    [' today+1 ', true],
    ['+1', true],
    ['start_of_week', true],
    [' start_of_week', true],
    ['today', false],
    ['today+2', false],
    ['today + 1', false],
    ['Today+1', false],
    ['start_of_week+1', false],
    ['friday', false],
    ['today-29', false],
    ['2027-01-15', false],
  ] as const)('agree on %j', (start_date, today) => {
    expect(ViewConfig.monthOpensToday(start_date)).toBe(today);
    expect(Synthetic.startDateModeIn({ start_date } as Types.Config, 'month') === 'default').toBe(
      today,
    );
  });
});
