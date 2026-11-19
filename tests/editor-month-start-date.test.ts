/**
 * Start Date on Month's page: Month opens today's month for every start date that follows today
 * and a fixed date's own month otherwise (`ViewConfig.monthHomeDay`), so its page offers Today and
 * A Fixed Date alone and reads every other stored start date as Today. A start date Month reads as
 * Today has no Reset there, which would change the other layouts alone, and the line under the
 * chips names what those layouts start on instead. Start Date's home and the other layouts' pages
 * keep all five choices. Names are invented.
 */
import { describe, expect, it } from 'vitest';

import { goOverview, goPage, lastConfig, mountEditor, reportsOf } from './helpers/editor-host';
import { CURRENT_CONFIG_VERSION } from '../src/config/config';

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

const HELPER = "Month opens on today's month, or on a fixed date's own month.";

describe("Start Date on Month's page", () => {
  it('offers Today and A Fixed Date, with the helper, as Whole Card', async () => {
    const editor = await mountEditor(CARD);
    await openStartDate(editor, 'month');
    expect(startDate(editor)).toEqual({
      choices: ['Today', 'A Fixed Date'],
      chosen: 'default',
      helper: HELPER,
      facts: ['Whole Card'],
      expression: false,
    });
  });

  it.each([
    ['Tomorrow', 'today+1', 'Tomorrow'],
    ['Start of Week', 'start_of_week', 'Start of Week'],
    ['an expression', 'today-29', 'today-29'],
  ])(
    'reads %s as Today, with no Reset, naming what the other layouts start on',
    async (_name, start_date, value) => {
      const editor = await mountEditor({ ...CARD, start_date });
      await openStartDate(editor, 'month');
      expect(startDate(editor)).toEqual({
        choices: ['Today', 'A Fixed Date'],
        chosen: 'default',
        helper: HELPER,
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
        helper: HELPER,
        expression: true,
      });
      expect(drawn.facts.slice(0, 2)).toEqual(['Set', 'Reset (Today)']);
    },
  );
});
