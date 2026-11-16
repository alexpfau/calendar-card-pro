/**
 * The overview and its pages as the editor draws them: the overview's blocks in order, Settings
 * For compact or full, the named radio groups, Quick Setup's banner, focus across a move, the
 * Escape guard, and a stylesheet that pins nothing in place.
 *
 * The predicates behind these are tested without a DOM in `editor-overview.test.ts`,
 * `editor-navigation.test.ts` and `editor-escape.test.ts`; this file holds the element to them.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import {
  type MountedEditor,
  changeField,
  formOf,
  goOverview,
  goPage,
  lastConfig,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import styles from '../src/rendering/editor/styles';

const CARD = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna'],
  title: 'Family',
};

afterEach(() => document.body.replaceChildren());

/**
 * One element the editor draws, or null.
 *
 * @param editor - Editor element
 * @param selector - Selector
 * @returns The element
 */
function $(editor: MountedEditor, selector: string): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(selector);
}

/**
 * Whether Settings For is drawn as its compact line.
 *
 * @param editor - Editor element
 * @returns True for the line, false for the four choices
 */
function compact(editor: MountedEditor): boolean {
  if ($(editor, '.scope-compact') !== null) return true;
  if ($(editor, 'fieldset.scope') !== null) return false;
  throw new Error('The editor draws no Settings For');
}

/**
 * Clicks a control the editor draws, then waits for what it opens.
 *
 * @param editor - Editor element
 * @param selector - The control
 */
async function click(editor: MountedEditor, selector: string): Promise<void> {
  const control = $(editor, selector);
  if (control === null) throw new Error(`The editor draws no ${selector}`);
  control.click();
  await editor.updateComplete;
  // Focus moves once the move has rendered (`_afterMove`).
  await editor.updateComplete;
}

/**
 * Presses Escape where focus is, as a keyboard does, and reports what the editor did with it.
 *
 * @param editor - Editor element
 * @param from - The element the key is pressed on
 * @returns Whether the editor consumed it, and whether it reached the editor's host
 */
async function escape(
  editor: MountedEditor,
  from: Element,
): Promise<{ prevented: boolean; reachedHost: boolean }> {
  let reachedHost = false;
  const listen = (): void => {
    reachedHost = true;
  };
  editor.addEventListener('keydown', listen);
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  from.dispatchEvent(event);
  editor.removeEventListener('keydown', listen);
  await editor.updateComplete;
  await editor.updateComplete;
  return { prevented: event.defaultPrevented, reachedHost };
}

describe('the overview', () => {
  it('draws its blocks in order', async () => {
    const editor = await mountEditor(CARD);
    const blocks = [
      '.scope',
      'section[data-heading="calendars"]',
      'fieldset.displays',
      '[data-field="content:days_to_show"]',
      '.row-group [data-focus="nav:card_header"]',
      '[data-quick-setup-open]',
    ].map((selector) => {
      const found = $(editor, selector);
      expect(found, selector).not.toBeNull();
      return found!;
    });
    blocks.slice(1).forEach((block, at) => {
      expect(
        blocks[at].compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${at} before ${at + 1}`,
      ).toBeTruthy();
    });
  });

  it('names its two radio groups, each option with a value', async () => {
    const editor = await mountEditor({ ...CARD, toolbar: { show: true } });
    for (const name of ['scope', 'view']) {
      const radios = [
        ...editor.shadowRoot!.querySelectorAll<HTMLInputElement>(`input[type="radio"]`),
      ].filter((radio) => radio.name === name);
      expect(radios.length, name).toBeGreaterThan(1);
      expect(radios.every((radio) => radio.value !== '')).toBe(true);
      expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
      expect(radios.every((radio) => radio.closest('fieldset')?.querySelector('legend'))).toBe(
        true,
      );
    }
    expect(
      [...editor.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(
        (radio) => radio.name === 'scope' || radio.name === 'view',
      ),
    ).toBe(true);
  });
});

describe('the search field', () => {
  it('stays the same element, so it keeps focus, as a query starts and clears', async () => {
    const editor = await mountEditor(CARD);
    const search = (): Element =>
      editor.shadowRoot!.querySelector('[data-field="filter:search"], ha-form.filter-form') ??
      formOf(editor, 'filter:search')!;
    const field = search();
    expect(field.isConnected).toBe(true);

    await changeField(editor, 'filter:search', 'c');
    expect($(editor, '[data-focus^="nav:"]')).toBeNull();
    expect(search()).toBe(field);
    expect(field.isConnected).toBe(true);

    await changeField(editor, 'filter:search', '');
    expect($(editor, '[data-focus^="nav:"]')).not.toBeNull();
    expect(search()).toBe(field);
    expect(field.isConnected).toBe(true);
  });
});

describe('a search by a page’s title', () => {
  it.each(['shared', 'list', 'column', 'grid'])(
    'finds every page the overview lists, by the title it shows, in %s',
    async (scope) => {
      const editor = await mountEditor(CARD);
      await changeField(editor, 'workspace:editing_workspace', scope);
      await goOverview(editor);
      const rows = [
        ...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-focus^="nav:"]'),
      ].map((row) => ({
        page: row.dataset.focus!.slice('nav:'.length),
        title: row.querySelector('.nav-title')!.textContent!.trim(),
      }));
      expect(rows.length).toBeGreaterThan(5);
      const missed: string[] = [];
      for (const { page, title } of rows) {
        await changeField(editor, 'filter:search', title);
        if ($(editor, `section.page-group[data-heading="${page}"] [data-field]`) === null) {
          missed.push(`${page} by "${title}"`);
        }
      }
      expect(missed).toEqual([]);
    },
  );
});

describe('Settings For', () => {
  it('stays compact after a List card’s edit lands in list:', async () => {
    const editor = await mountEditor({ ...CARD, view: 'list' });
    expect(compact(editor)).toBe(true);

    await changeField(editor, 'events:event_font_size', '20px');
    const written = lastConfig(editor)!;
    expect(written.list).toMatchObject({ event_font_size: '20px' });
    await goOverview(editor);
    expect(compact(editor)).toBe(true);
  });

  it('is full when column: stores a value', async () => {
    const editor = await mountEditor({ ...CARD, column: { event_font_size: '13px' } });
    expect(compact(editor)).toBe(false);
  });

  it('is full while the toolbar shows its View Switcher', async () => {
    const editor = await mountEditor({ ...CARD, toolbar: { show: true } });
    expect(compact(editor)).toBe(false);
  });

  it('is full after Change, for the rest of the session', async () => {
    const editor = await mountEditor(CARD);
    expect(compact(editor)).toBe(true);
    await click(editor, '[data-focus="scope-change"]');
    expect(compact(editor)).toBe(false);

    // Choosing the scope it already had, moving about and editing: it stays full.
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await changeField(editor, 'card:title', 'Home');
    await goOverview(editor);
    expect(compact(editor)).toBe(false);
  });
});

describe('Quick Setup’s banner', () => {
  const FRESH = { config_version: Config.CURRENT_CONFIG_VERSION, entities: [] };

  it('shows on a fresh card only', async () => {
    expect($(await mountEditor(FRESH), '.quick-setup-banner')).not.toBeNull();
    document.body.replaceChildren();
    expect($(await mountEditor(CARD), '.quick-setup-banner')).toBeNull();
  });

  it('stays once a calendar is added, and goes on Dismiss', async () => {
    const editor = await mountEditor(FRESH);
    await changeField(editor, 'calendars:calendars', ['calendar.anna']);
    await goOverview(editor);
    expect($(editor, '.quick-setup-banner')).not.toBeNull();

    await click(editor, `.quick-setup-entry .icon-button`);
    expect($(editor, '.quick-setup-banner')).toBeNull();
  });
});

describe('focus across a move', () => {
  it('lands on the page’s heading after opening, and on its row after Back', async () => {
    const editor = await mountEditor(CARD);
    const row = '[data-focus="nav:card_header"]';
    $(editor, row)!.focus();
    await click(editor, row);
    expect(editor.shadowRoot!.activeElement).toBe($(editor, 'h2.page-title'));

    await click(editor, '[data-focus="back-foot"]');
    expect(editor.shadowRoot!.activeElement).toBe($(editor, row));
  });
});

describe('the Escape guard', () => {
  it('goes Back from a page, and consumes the key', async () => {
    const editor = await mountEditor(CARD);
    await goPage(editor, 'card_header');
    const result = await escape(editor, $(editor, 'h2.page-title')!);
    expect(result).toEqual({ prevented: true, reachedHost: false });
    expect($(editor, 'h2.page-title')).toBeNull();
  });

  it('closes an open Settings For first, then goes Back', async () => {
    const editor = await mountEditor(CARD);
    await openPageOf(editor, 'events:event_font_size');
    await click(editor, '[data-focus="scope-change"]');
    expect(compact(editor)).toBe(false);

    expect(await escape(editor, $(editor, 'h2.page-title')!)).toEqual({
      prevented: true,
      reachedHost: false,
    });
    expect(compact(editor)).toBe(true);
    expect($(editor, 'h2.page-title')).not.toBeNull();

    await escape(editor, $(editor, 'h2.page-title')!);
    expect($(editor, 'h2.page-title')).toBeNull();
  });

  it('contains a listbox’s Escape in a nested shadow root, and does nothing else', async () => {
    const editor = await mountEditor(CARD);
    await openPageOf(editor, 'events:event_font_size');
    const frame = $(editor, '[data-field="events:event_font_size"]')!;
    const host = document.createElement('div');
    const listbox = document.createElement('div');
    listbox.setAttribute('role', 'listbox');
    host.attachShadow({ mode: 'open' }).append(listbox);
    frame.append(host);

    expect(await escape(editor, listbox)).toEqual({ prevented: true, reachedHost: false });
    expect($(editor, 'h2.page-title')).not.toBeNull();
    host.remove();
  });

  it('clears a query on the overview, and puts focus back in the search field', async () => {
    const editor = await mountEditor(CARD);
    await changeField(editor, 'filter:search', 'color');
    const search = $(editor, 'ha-form.filter-form')!;
    expect(await escape(editor, search)).toEqual({ prevented: true, reachedHost: false });
    expect($(editor, '[data-focus^="nav:"]')).not.toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe(search);
  });

  it('is Quick Setup’s Back, and Cancel on its first step', async () => {
    const editor = await mountEditor(CARD);
    await click(editor, '[data-quick-setup-open]');
    await click(editor, '[data-story="family_hub"]');
    await click(editor, '[data-quick-setup-next]');
    const second = $(editor, '[data-quick-setup]')!.dataset.quickSetup;

    expect(await escape(editor, $(editor, '[data-quick-setup-next]')!)).toEqual({
      prevented: true,
      reachedHost: false,
    });
    expect($(editor, '[data-quick-setup]')!.dataset.quickSetup).not.toBe(second);
    expect($(editor, '[data-quick-setup]')!.dataset.quickSetup).toBe('story');

    // On the first step, Cancel: the card as it was, the overview, focus on what opened it.
    await escape(editor, $(editor, '[data-quick-setup-next]')!);
    expect($(editor, '[data-quick-setup]')).toBeNull();
    expect(lastConfig(editor) ?? CARD).toMatchObject({ title: 'Family' });
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '[data-quick-setup-open]'));
  });

  it('reaches Quick Setup when a click focused nothing, as in Safari, and leaves Next focused', async () => {
    const editor = await mountEditor(CARD);
    // A click focuses no button here, as in Safari: focus is on nothing in the editor.
    await click(editor, '[data-quick-setup-open]');
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '.quick-setup-step'));
    await click(editor, '[data-story="family_hub"]');
    (editor.shadowRoot!.activeElement as HTMLElement | null)?.blur();
    await click(editor, '[data-quick-setup-next]');
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '.quick-setup-step'));

    // A keyboard user on Next stays on Next.
    $(editor, '[data-quick-setup-next]')!.focus();
    await click(editor, '[data-quick-setup-next]');
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '[data-quick-setup-next]'));
  });

  it('lets the key through on the overview with nothing open', async () => {
    const editor = await mountEditor(CARD);
    expect(await escape(editor, $(editor, '[data-focus="nav:card_header"]')!)).toEqual({
      prevented: false,
      reachedHost: true,
    });
  });
});

describe('a nested field’s own data', () => {
  /**
   * Each field form's data on the open page, by field id; the color controls draw none.
   *
   * @param editor - Editor element
   * @param prefix - The fields' id prefix
   * @returns Each form's data object
   */
  function dataOf(editor: MountedEditor, prefix: string): Map<string, unknown> {
    // A color control draws no form until its Custom text is open (`tests/editor-colors.test.ts`).
    return new Map(
      [
        ...editor.shadowRoot!.querySelectorAll<HTMLElement>(
          `[data-field^="${prefix}"]:not(.color-field)`,
        ),
      ].map((frame) => [
        frame.dataset.field!,
        (frame.querySelector('ha-form') as { data?: unknown }).data,
      ]),
    );
  }

  it.each([
    ['weather:weather.', 'weather:weather.date.font_size', '15px'],
    ['card:toolbar.', 'card:toolbar.search', false],
  ] as const)('leaves every other %s form its very data on a write', async (prefix, id, value) => {
    const editor = await mountEditor({
      ...CARD,
      weather: { entity: 'weather.home', position: 'both' },
      toolbar: { show: true },
    });
    await openPageOf(editor, id);
    const before = dataOf(editor, prefix);
    expect(before.size).toBeGreaterThan(3);

    await changeField(editor, id, value);
    const after = dataOf(editor, prefix);
    const renewed = [...after]
      .filter(([field, data]) => before.get(field) !== data)
      .map(([f]) => f);
    expect(renewed).toEqual([id]);
  });
});

describe('the stylesheet', () => {
  it('pins nothing in place', () => {
    const sticky = declarations(styles.cssText).filter(
      ({ property, value }) => property === 'position' && /\bsticky\b/.test(value),
    );
    expect(declarations(styles.cssText).length).toBeGreaterThan(100);
    expect(sticky).toEqual([]);
  });
});
