/**
 * What the editor's own controls are called, and where focus goes when a key takes its control
 * away, as found by the accessibility pass over the redesigned editor (backlog item 307).
 *
 * A control whose accessible name does not hold the words it shows cannot be reached by speaking
 * them (WCAG 2.5.3, Label in Name): "Move Up" was named "Move Ben up". A row named by its title
 * and its summary together is read as one run-on phrase ("Which Events Show Past Events: On").
 * And Escape on a search result cleared the search but focused the search form's host, which
 * takes no focus, so focus fell to the document and the next Escape closed the dialog.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  fakeHass,
  goEntry,
  keysOf,
  mountEditor,
  resultRows,
  searchFor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const FAMILY = 'calendar.family';

const STATES = Object.fromEntries(
  [
    [ANNA, 'Anna'],
    [BEN, 'Ben'],
    [FAMILY, 'Family'],
  ].map(([id, name]) => [id, { entity_id: id, state: 'off', attributes: { friendly_name: name } }]),
);

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Mounts the editor on a card.
 *
 * @param config - The card, besides its format marker
 * @returns The editor
 */
function mount(config: Record<string, unknown>): Promise<Editor> {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, ...config },
    { hass: fakeHass({ states: STATES }) },
  );
}

/**
 * The control a `data-focus` key names.
 *
 * @param editor - The editor
 * @param focus - The key
 * @returns The control
 */
function control(editor: Editor, focus: string): HTMLElement {
  const found = editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
  if (!found) throw new Error(`no control ${focus}`);
  return found;
}

/**
 * Presses a control and waits for focus to settle.
 *
 * @param editor - The editor
 * @param focus - Its key
 */
async function press(editor: Editor, focus: string): Promise<void> {
  control(editor, focus).click();
  await editor.updateComplete;
  await editor.updateComplete;
}

/**
 * Text as a person reads it.
 *
 * @param text - Raw text
 * @returns Whitespace collapsed
 */
function words(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

const FAMILY_TWICE = {
  entities: [
    ANNA,
    BEN,
    { entity: FAMILY, event_type: 'all_day' },
    { entity: FAMILY, event_type: 'timed' },
  ],
};

describe('a row action is named by the words it shows, then whose it is', () => {
  it('in the strip of a calendar with one entry and of an entry of a calendar with two', async () => {
    const editor = await mount(FAMILY_TWICE);
    const [, ben, family] = keysOf(editor, 'entry');
    const checked: string[] = [];
    for (const key of [ben, family]) {
      await press(editor, `more:entry:${key}`);
      for (const button of editor.shadowRoot!.querySelectorAll('.strip .strip-button')) {
        const shown = words(button.querySelector('.strip-label')?.textContent);
        const name = button.getAttribute('aria-label') ?? '';
        // Speech input matches words, not case.
        expect(
          name.toLowerCase().startsWith(shown.toLowerCase()),
          `"${name}" shows "${shown}"`,
        ).toBe(true);
        checked.push(name);
      }
    }
    expect(checked).toContain('Move Up: Ben');
    expect(checked).toContain('Move to Top: Ben');
    expect(checked).toContain('Remove This Entry: Family, entry 1, All-day events');
  });

  it('at the foot of an entry page', async () => {
    const editor = await mount(FAMILY_TWICE);
    await goEntry(editor, keysOf(editor, 'entry')[3]);
    const remove = control(editor, 'entry-remove');
    expect(words(remove.textContent)).toBe('Remove This Entry');
    expect(remove.getAttribute('aria-label')).toBe(
      'Remove This Entry: Family, entry 2, Events with a time',
    );
  });
});

describe('a settings row', () => {
  it('is named by its title and described by its summary', async () => {
    const editor = await mount({ entities: [ANNA] });
    const rows = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.nav-row')];
    expect(rows.length).toBeGreaterThan(8);
    let summaries = 0;
    for (const row of rows) {
      const title = editor.shadowRoot!.getElementById(row.getAttribute('aria-labelledby') ?? '');
      expect(title, row.dataset.focus).toBe(row.querySelector('.nav-title'));
      const summary = row.querySelector('.nav-summary');
      if (summary === null) {
        expect(row.hasAttribute('aria-describedby'), row.dataset.focus).toBe(false);
        continue;
      }
      summaries += 1;
      expect(editor.shadowRoot!.getElementById(row.getAttribute('aria-describedby') ?? '')).toBe(
        summary,
      );
    }
    expect(summaries).toBeGreaterThan(4);
  });
});

describe('Quick Setup’s banner', () => {
  it('is named Quick Setup and described by its line', async () => {
    const editor = await mountEditor({ entities: [ANNA] }, { hass: fakeHass({ states: STATES }) });
    const banner = control(editor, 'quick-setup');
    const root = editor.shadowRoot!;
    expect(
      words(root.getElementById(banner.getAttribute('aria-labelledby') ?? '')?.textContent),
    ).toBe('Quick Setup');
    expect(root.getElementById(banner.getAttribute('aria-describedby') ?? '')).toBe(
      banner.querySelector('.quick-setup-line'),
    );
  });
});

describe('Escape on a search result', () => {
  it('clears the search and leaves focus on the overview, not on the document', async () => {
    const editor = await mount({ entities: [ANNA] });
    await searchFor(editor, 'font size');
    const [first] = resultRows(editor);
    const row = control(editor, first.key);
    row.focus();
    expect(editor.shadowRoot!.activeElement).toBe(row);

    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await editor.updateComplete;
    await editor.updateComplete;

    expect(resultRows(editor)).toHaveLength(0);
    expect(editor.shadowRoot!.activeElement).toBe(
      editor.shadowRoot!.querySelector('[data-heading="calendars"] .heading'),
    );
  });
});
