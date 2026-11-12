/**
 * The search panel as Home Assistant's dialog manager drives it (`src/rendering/search-panel.ts`):
 * `showDialog` before the element is attached, then the native modal, then `dialog-closed` once
 * it has gone. What it finds comes from a stand-in for the card (`SearchSource`) over rows built
 * by hand, so this file pins the panel alone: its combobox and listbox, the keyboard, the count
 * announced once typing pauses, the notes under the results, where it opens, how it stands above
 * an on-screen keyboard, that it is drawn in the shell the event popover is drawn in, and how it
 * waits for a slow year. The card's half is `toolbar-search.test.ts`.
 *
 * happy-dom lays nothing out and cannot animate, so a close is immediate here; how the panel
 * looks and moves is checked in a browser.
 */

import { CSSResult } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeViewport } from './helpers/visual-viewport';
import { withoutComments } from './helpers/without-comments';
import type * as Types from '../src/config/types';
import type { PopoverAnchor, PopoverBox } from '../src/interaction/popover-model';
import { EventPopover } from '../src/rendering/event-popover';
import * as Shell from '../src/rendering/popover-shell';
import {
  SEARCH_PANEL_TAG,
  SearchPanel,
  type SearchPanelHandle,
  type SearchPanelParams,
  type SearchSource,
  hangFrom,
  hangIn,
} from '../src/rendering/search-panel';
import * as Search from '../src/utils/search';

type Panel = HTMLElement & {
  hass?: Types.Hass;
  showDialog(params: SearchPanelParams): void;
  closeDialog(): boolean;
  readonly updateComplete: Promise<boolean>;
};

const NOW = Date.parse('2026-06-17T10:00:00.000Z');

/** Home Assistant's words, as its `localize` fills them. */
const STRINGS: Record<string, (values?: Record<string, unknown>) => string> = {
  'ui.common.search': () => 'Search',
  'ui.common.close': () => 'Close',
  'ui.components.combo-box.no_match': () => 'No matching items found',
  'ui.components.combo-box.no_results': (v) => `No results for ${v?.term}`,
  'ui.components.combo-box.result_count': (v) =>
    `${v?.count} ${v?.count === 1 ? 'result' : 'results'} for ${v?.term}`,
  'ui.components.calendar.event_retrieval_error': () => 'Could not retrieve events for calendars',
};

function row(
  at: string,
  title: string,
  extra: { location?: string; calendar?: string; color?: string } = {},
): Search.SearchRow {
  const start = Date.parse(at);
  const day = at.slice(0, 10);
  const location = extra.location ?? '';
  return {
    id: `${title}@${at}`,
    entityId: 'calendar.anna',
    title,
    location,
    folded: {
      title: Search.foldText(title, 'en'),
      location: Search.foldText(location, 'en'),
      description: '',
    },
    start,
    end: start + 3_600_000,
    day,
    monthKey: day.slice(0, 7),
    month: `Month ${day.slice(0, 7)}`,
    dayText: `Day ${day}`,
    timeText: '9:00 AM - 10:00 AM',
    color: extra.color ?? 'rgb(204, 51, 102)',
    calendar: extra.calendar ?? 'Anna',
    target: { entityId: 'calendar.anna', start: at, summary: title },
  };
}

const ROWS = [
  row('2026-06-20T09:00:00.000Z', 'Dentist check-up', { location: 'Dental Clinic' }),
  row('2026-07-08T09:00:00.000Z', 'Dentist follow-up'),
  row('2026-06-10T09:00:00.000Z', 'Dentist cleaning', { calendar: 'Ben' }),
  row('2026-06-21T09:00:00.000Z', 'Swim'),
];

/** A stand-in for the card: what it finds, how its load stands, and what the panel told it. */
function stubSource(rows = ROWS, state: { loading?: boolean; failed?: string[] } = {}) {
  const handle: { current?: SearchPanelHandle } = {};
  const gone = vi.fn();
  const pick = vi.fn<(id: string) => void>();
  const source: SearchSource & { loading: boolean; failed: string[]; rows: Search.SearchRow[] } = {
    rows,
    loading: state.loading ?? false,
    failed: state.failed ?? [],
    find(term) {
      return Search.findRows(this.rows, term, 'en', NOW);
    },
    attach(panel) {
      handle.current = panel;
      return gone;
    },
    pick,
  };
  return { source, handle, gone, pick };
}

/** The magnifier at the end of a toolbar, as the card hands its press over. */
const MAGNIFIER: PopoverAnchor = {
  x: 722,
  y: 42,
  rect: { left: 700, right: 744, top: 20, bottom: 64 },
  below: true,
};

/**
 * Open a panel the way Home Assistant does, and wait for it to draw.
 *
 * @param params - What differs from a panel below the magnifier, in English, light
 * @param options - Home Assistant's words, or none
 */
async function open(
  params: Partial<SearchPanelParams> = {},
  options: { words?: boolean; source?: ReturnType<typeof stubSource> } = {},
) {
  const stub = options.source ?? stubSource();
  const closed = vi.fn();
  const el = document.createElement(SEARCH_PANEL_TAG) as Panel;
  el.hass = {
    localize: (key: string, values?: Record<string, unknown>) =>
      options.words === false ? '' : (STRINGS[key]?.(values) ?? ''),
  } as unknown as Types.Hass;
  el.addEventListener('dialog-closed', (ev) => closed((ev as CustomEvent).detail));
  el.showDialog({
    source: stub.source,
    anchor: MAGNIFIER,
    hang: 'left',
    dark: false,
    language: 'en',
    pastOpacity: 0.6,
    ...params,
  });
  document.body.appendChild(el);
  await el.updateComplete;
  await el.updateComplete;

  const root = el.shadowRoot!;
  const field = () => root.querySelector<HTMLInputElement>('input')!;
  const type = async (term: string) => {
    field().value = term;
    field().dispatchEvent(new Event('input'));
    await el.updateComplete;
  };
  const key = async (name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    });
    field().dispatchEvent(event);
    await el.updateComplete;
    return event;
  };
  const options_ = () => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
  const status = () => root.querySelector('[role="status"]')!.textContent!.trim();
  const dialog = () => root.querySelector('dialog')!;
  return { el, root, field, type, key, options: options_, status, dialog, closed, ...stub };
}

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function viewport(width: number, height = 768): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

beforeEach(() => viewport(1024, 768));

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  viewport(originalWidth, originalHeight);
});

//-----------------------------------------------------------------------------
// OPENING
//-----------------------------------------------------------------------------

describe('opening', () => {
  it('opens a modal named Search, with focus in the field and nothing found yet', async () => {
    const { root, dialog, field, options } = await open();

    expect(dialog().open).toBe(true);
    expect(dialog().getAttribute('aria-label')).toBe('Search');
    expect(root.activeElement).toBe(field());
    expect(field().value).toBe('');
    expect(field().getAttribute('placeholder')).toBe('Search');
    expect(options()).toEqual([]);
    expect(root.querySelector('.results')!.classList).toContain('empty');
  });

  it('opens empty again, remembering nothing of the search before', async () => {
    const panel = await open();
    await panel.type('dent');
    expect(panel.options()).toHaveLength(3);
    panel.el.closeDialog();
    await panel.el.updateComplete;

    panel.el.showDialog({
      source: panel.source,
      anchor: MAGNIFIER,
      hang: 'left',
      dark: false,
      language: 'en',
      pastOpacity: 0.6,
    });
    await panel.el.updateComplete;
    await panel.el.updateComplete;

    expect(panel.field().value).toBe('');
    expect(panel.options()).toEqual([]);
  });

  it('names its field and its close button in English where Home Assistant has no words', async () => {
    const { dialog, field, root } = await open({}, { words: false });

    expect(dialog().getAttribute('aria-label')).toBe('Search');
    expect(field().getAttribute('aria-label')).toBe('Search');
    expect(field().hasAttribute('placeholder')).toBe(false);
    const close = root.querySelector('.field-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(close.hasAttribute('title')).toBe(false);
  });
});

//-----------------------------------------------------------------------------
// THE COMBOBOX
//-----------------------------------------------------------------------------

describe('the field and its results', () => {
  it('are a combobox and its listbox, the results grouped by month', async () => {
    const { root, field, type, options } = await open();
    expect(field().getAttribute('role')).toBe('combobox');
    expect(field().getAttribute('type')).toBe('search');
    expect(field().getAttribute('aria-autocomplete')).toBe('list');
    expect(field().getAttribute('aria-controls')).toBe('search-results');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);

    await type('dent');

    const listbox = root.getElementById('search-results')!;
    expect(listbox.getAttribute('role')).toBe('listbox');
    expect(listbox.getAttribute('aria-label')).toBe('Search');
    expect(listbox.getAttribute('lang')).toBe('en');
    expect(field().getAttribute('aria-expanded')).toBe('true');
    const groups = Array.from(listbox.querySelectorAll('[role="group"]'));
    expect(
      groups.map((group) => [
        root.getElementById(group.getAttribute('aria-labelledby')!)!.textContent,
        group.className,
        Array.from(group.querySelectorAll('[role="option"]')).map((o) => o.id),
      ]),
    ).toEqual([
      ['Month 2026-06', 'month', ['search-option-0']],
      ['Month 2026-07', 'month', ['search-option-1']],
      ['Month 2026-06', 'month past past-start', ['search-option-2']],
    ]);
    for (const heading of listbox.querySelectorAll('.month-name')) {
      expect(heading.getAttribute('role')).toBe('presentation');
    }
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual([
      'Dentist check-up, Day 2026-06-20, 9:00 AM - 10:00 AM, Anna',
      'Dentist follow-up, Day 2026-07-08, 9:00 AM - 10:00 AM, Anna',
      'Dentist cleaning, Day 2026-06-10, 9:00 AM - 10:00 AM, Ben',
    ]);
    expect(options().map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'false',
    ]);
  });

  it('draw each result as a cell with its calendar’s color, the term marked', async () => {
    const { type, options } = await open();
    await type('dent');

    const first = options()[0];
    expect(first.className).toBe('cell group result');
    expect(first.getAttribute('style')).toBe('--event-color:rgb(204, 51, 102)');
    expect(first.querySelector('.bar')).not.toBeNull();
    expect(withoutComments(first.querySelector('.result-title')!).innerHTML).toBe(
      '<mark>Dent</mark>ist check-up',
    );
    expect(
      withoutComments(first.querySelector('.result-detail')!).innerHTML.replace(/\s+/g, ' '),
    ).toBe('Day 2026-06-20 · 9:00 AM - 10:00 AM · <mark>Dent</mark>al Clinic');
    expect(options()[1].querySelector('.result-detail')!.textContent!.replace(/\s+/g, ' ')).toBe(
      'Day 2026-07-08 · 9:00 AM - 10:00 AM',
    );
  });

  it('start the past at a rule only where upcoming results come before it', async () => {
    const { type, root } = await open();
    await type('cleaning');

    expect(Array.from(root.querySelectorAll('.month')).map((m) => m.className)).toEqual([
      'month past',
    ]);
  });

  it('dim the past as the card dims past events', async () => {
    const { root } = await open({ pastOpacity: 0.35 });

    expect(root.querySelector<HTMLElement>('.panel')!.getAttribute('style')).toContain(
      '--past-opacity:0.35',
    );
  });
});

//-----------------------------------------------------------------------------
// THE KEYBOARD
//-----------------------------------------------------------------------------

describe('the keyboard', () => {
  it('moves through the results with Down and Up, focus staying in the field', async () => {
    const { root, field, type, key, options } = await open();
    await type('dent');

    const down = await key('ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(field().getAttribute('aria-activedescendant')).toBe('search-option-0');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(root.activeElement).toBe(field());

    await key('ArrowDown');
    await key('ArrowDown');
    expect(field().getAttribute('aria-activedescendant')).toBe('search-option-2');
    await key('ArrowDown');
    expect(field().getAttribute('aria-activedescendant')).toBe('search-option-0');
    await key('ArrowUp');
    expect(field().getAttribute('aria-activedescendant')).toBe('search-option-2');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('starts from the last result with Up', async () => {
    const { field, type, key } = await open();
    await type('dent');

    await key('ArrowUp');
    expect(field().getAttribute('aria-activedescendant')).toBe('search-option-2');
  });

  it('forgets the result it was on once the term changes', async () => {
    const { field, type, key } = await open();
    await type('dent');
    await key('ArrowDown');

    await type('dentist');
    expect(field().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('picks the result it is on with Enter, closing first', async () => {
    const panel = await open();
    await panel.type('dent');
    await panel.key('ArrowDown');
    await panel.key('ArrowDown');

    const enter = await panel.key('Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(panel.pick).toHaveBeenCalledTimes(1);
    expect(panel.pick).toHaveBeenCalledWith('Dentist follow-up@2026-07-08T09:00:00.000Z');
    expect(panel.closed).toHaveBeenCalledTimes(1);
    expect(panel.closed.mock.invocationCallOrder[0]).toBeLessThan(
      panel.pick.mock.invocationCallOrder[0],
    );
    // Gone once it has played its way out, which is when the card may move focus.
    await vi.waitFor(() => expect(panel.gone).toHaveBeenCalledTimes(1));
    expect(panel.dialog().open).toBe(false);
  });

  it('picks nothing with Enter before a result is chosen', async () => {
    const panel = await open();
    await panel.type('dent');

    const enter = await panel.key('Enter');

    expect(enter.defaultPrevented).toBe(false);
    expect(panel.pick).not.toHaveBeenCalled();
    expect(panel.dialog().open).toBe(true);
  });

  it('leaves the keys to an input method while it composes', async () => {
    const panel = await open();
    await panel.type('dent');

    await panel.key('ArrowDown', { isComposing: true });
    await panel.key('Escape', { isComposing: true });

    expect(panel.field().hasAttribute('aria-activedescendant')).toBe(false);
    expect(panel.dialog().open).toBe(true);
  });

  it('closes with Escape, picking nothing', async () => {
    const panel = await open();
    await panel.type('dent');

    const escape = await panel.key('Escape');

    expect(escape.defaultPrevented).toBe(true);
    expect(panel.pick).not.toHaveBeenCalled();
    expect(panel.closed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(panel.gone).toHaveBeenCalledTimes(1));
  });
});

describe('a press', () => {
  it('on a result picks it', async () => {
    const panel = await open();
    await panel.type('dent');

    panel.options()[2].click();
    await panel.el.updateComplete;

    expect(panel.pick).toHaveBeenCalledWith('Dentist cleaning@2026-06-10T09:00:00.000Z');
    expect(panel.closed).toHaveBeenCalledTimes(1);
  });

  it('on the close button closes, and so does Home Assistant’s Back', async () => {
    const first = await open();
    first.root.querySelector<HTMLButtonElement>('.field-close')!.click();
    await first.el.updateComplete;
    expect(first.closed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(first.gone).toHaveBeenCalledTimes(1));
    document.body.innerHTML = '';

    const second = await open();
    expect(second.el.closeDialog()).toBe(true);
    expect(second.closed).toHaveBeenCalledTimes(1);
    expect(second.pick).not.toHaveBeenCalled();
  });
});

//-----------------------------------------------------------------------------
// ANNOUNCING
//-----------------------------------------------------------------------------

describe('the count', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('is announced once typing pauses, every match counted, in Home Assistant’s words', async () => {
    const { type, status, el } = await open();

    await type('d');
    vi.advanceTimersByTime(300);
    await type('dent');
    vi.advanceTimersByTime(499);
    await el.updateComplete;
    expect(status()).toBe('');

    vi.advanceTimersByTime(1);
    await el.updateComplete;
    expect(status()).toBe('3 results for ‘dent’');
  });

  it('counts every match, not only those drawn', async () => {
    const many = Array.from({ length: 205 }, (_, i) =>
      row(new Date(NOW + (i + 1) * 3_600_000).toISOString(), `Dentist ${i}`),
    );
    const { type, status, el, options } = await open({}, { source: stubSource(many) });

    await type('dent');
    vi.advanceTimersByTime(500);
    await el.updateComplete;

    expect(options()).toHaveLength(200);
    expect(status()).toBe('205 results for ‘dent’');
  });

  it('says when nothing is found, and nothing for no term', async () => {
    const { type, status, el } = await open();

    await type('xyz');
    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('No results for ‘xyz’');

    await type('  ');
    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('');
  });

  it('falls back to English words where Home Assistant has none', async () => {
    const { type, status, el } = await open({}, { words: false });

    await type('swim');
    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('1 result for ‘swim’');

    await type('xyz');
    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('No results for ‘xyz’');
  });

  it('is announced again as calendars answer', async () => {
    const stub = stubSource([ROWS[0]], { loading: true });
    const { type, status, el, options, handle } = await open({}, { source: stub });
    await type('dent');
    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('1 result for ‘dent’');

    stub.source.rows = ROWS;
    stub.source.loading = false;
    handle.current!.changed();
    await el.updateComplete;
    expect(options()).toHaveLength(3);

    vi.advanceTimersByTime(500);
    await el.updateComplete;
    expect(status()).toBe('3 results for ‘dent’');
  });
});

//-----------------------------------------------------------------------------
// NOTES
//-----------------------------------------------------------------------------

describe('under the results', () => {
  it('says nothing matched once every calendar has answered, and not before', async () => {
    const stub = stubSource(ROWS, { loading: true });
    const { type, root, el, handle } = await open({}, { source: stub });
    await type('xyz');

    expect(root.querySelector('.note')).toBeNull();
    expect(root.querySelector('.field-mark > .field-wait')).not.toBeNull();

    stub.source.loading = false;
    handle.current!.changed();
    await el.updateComplete;

    expect(root.querySelector('.note')!.textContent).toBe('No matching items found');
    expect(root.querySelector('.field-mark > .field-wait')).toBeNull();
  });

  it('names the calendars that could not be loaded, in Home Assistant’s words', async () => {
    const { root } = await open({}, { source: stubSource(ROWS, { failed: ['Anna', 'Ben'] }) });

    expect(root.querySelector('.note.error')!.textContent).toBe(
      'Could not retrieve events for calendars: Anna, Ben',
    );
  });

  it('says nothing of a failure where Home Assistant has no words for it', async () => {
    const { root } = await open(
      {},
      { source: stubSource(ROWS, { failed: ['Anna'] }), words: false },
    );

    expect(root.querySelector('.note')).toBeNull();
  });
});

//-----------------------------------------------------------------------------
// WHERE IT OPENS
//-----------------------------------------------------------------------------

/** The dialog's placement and the beak's, as plain values. */
function placed(root: ShadowRoot) {
  const arrow = root.querySelector('.arrow');
  return {
    dialog: root.querySelector('dialog')!.getAttribute('style'),
    className: root.querySelector('dialog')!.className,
    panel: root.querySelector('.panel')!.getAttribute('style'),
    arrow: arrow ? [arrow.className, arrow.getAttribute('style')] : null,
    grabber: root.querySelector('.grabber') !== null,
  };
}

describe('where it opens', () => {
  it('hangs below the magnifier, back across the card, its beak pointing up at it', async () => {
    const { root } = await open();

    expect(placed(root)).toEqual({
      dialog: 'left:314px;top:74px;',
      className: 'light popover',
      panel: '--past-opacity:0.6;max-height:682px;transform-origin:408px top',
      arrow: ['arrow top', 'left:408px'],
      grabber: false,
    });
  });

  it('hangs the other way from a magnifier right to left', async () => {
    const { root } = await open({ hang: 'right' });

    expect(placed(root)).toMatchObject({
      dialog: 'left:572px;top:74px;',
      arrow: ['arrow top', 'left:150px'],
    });
  });

  it('opens above a magnifier with little room below and more above, its foot held there', async () => {
    const { root } = await open({
      anchor: { ...MAGNIFIER, rect: { left: 700, right: 744, top: 700, bottom: 744 } },
    });

    expect(placed(root)).toEqual({
      dialog: 'left:314px;top:auto;bottom:78px;',
      className: 'light popover',
      panel: '--past-opacity:0.6;max-height:678px;transform-origin:408px bottom',
      arrow: ['arrow bottom', 'left:408px'],
      grabber: false,
    });
  });

  it('is a sheet from the bottom of a narrow screen, with its grabber and no beak', async () => {
    viewport(390, 844);
    const { root } = await open({ dark: true });

    expect(placed(root)).toEqual({
      dialog: '',
      className: 'dark sheet',
      panel: '--past-opacity:0.6',
      arrow: null,
      grabber: true,
    });
  });

  it('stands centered at the top without a press to hang from', async () => {
    const { root } = await open({ anchor: undefined });

    expect(placed(root)).toEqual({
      dialog: 'left:292px;top:12px;',
      className: 'light popover',
      panel: '--past-opacity:0.6;max-height:744px',
      arrow: null,
      grabber: false,
    });
  });
});

//-----------------------------------------------------------------------------
// OVER AN ON-SCREEN KEYBOARD
//-----------------------------------------------------------------------------

describe('over an on-screen keyboard', () => {
  /** Raises the keyboard, or lowers it at 0, and waits for the panel to draw what it read. */
  async function keyboard(
    el: Panel,
    viewport: ReturnType<typeof fakeViewport>,
    px: number,
    pan = 0,
  ): Promise<void> {
    viewport.keyboard(px, pan);
    await el.updateComplete;
  }

  const SHEET = {
    dialog: '',
    className: 'light sheet',
    panel: '--past-opacity:0.6',
    arrow: null,
    grabber: true,
  };

  it('stands its sheet on the keys, the field and the results above them, and lowers it again', async () => {
    viewport(390, 844);
    const vv = fakeViewport();
    const { el, root, field } = await open();
    expect(root.activeElement).toBe(field());
    expect(placed(root)).toEqual(SHEET);

    await keyboard(el, vv, 336);
    // No taller than the room the keys leave, less the margin at the top; the strip a phone keeps
    // clear at its foot is under the keys, so it goes (`lifted`).
    expect(placed(root)).toEqual({
      ...SHEET,
      dialog: 'bottom:336px;',
      className: 'light sheet lifted',
      panel: '--past-opacity:0.6;max-height:496px',
    });

    await keyboard(el, vv, 0);
    expect(placed(root)).toEqual(SHEET);
  });

  it('reads the keyboard only while the field has the focus', async () => {
    viewport(390, 844);
    const vv = fakeViewport();
    const { el, root, field } = await open();
    await keyboard(el, vv, 336);
    expect(placed(root).dialog).toBe('bottom:336px;');

    // The keyboard goes with the focus, while the browser still reports its room, as some do.
    field().blur();
    await vi.waitFor(() => expect(placed(root)).toEqual(SHEET));

    field().focus();
    await vi.waitFor(() => expect(placed(root).dialog).toBe('bottom:336px;'));
  });

  it('moves up from the magnifier only as far as it must to keep its room, and back', async () => {
    // A phone held sideways, the magnifier at the top: the keys leave 190 pixels.
    viewport(844, 390);
    const vv = fakeViewport();
    const { el, root } = await open();
    const opened = placed(root);
    expect(opened).toEqual({
      dialog: 'left:314px;top:74px;',
      className: 'light popover',
      panel: '--past-opacity:0.6;max-height:304px;transform-origin:408px top',
      arrow: ['arrow top', 'left:408px'],
      grabber: false,
    });

    await keyboard(el, vv, 200);
    expect(placed(root)).toEqual({
      ...opened,
      dialog: 'left:314px;top:12px;',
      panel: '--past-opacity:0.6;max-height:166px;transform-origin:408px top',
    });

    await keyboard(el, vv, 0);
    expect(placed(root)).toEqual(opened);
  });

  it('stays at the magnifier where the keys leave it room enough, its results shorter', async () => {
    const vv = fakeViewport();
    const { el, root } = await open();
    const opened = placed(root);

    await keyboard(el, vv, 300);
    expect(placed(root)).toEqual({
      ...opened,
      panel: '--past-opacity:0.6;max-height:382px;transform-origin:408px top',
    });
  });

  it('holds its foot above the keys where it opened above the magnifier', async () => {
    const vv = fakeViewport();
    const { el, root } = await open({
      anchor: { ...MAGNIFIER, rect: { left: 700, right: 744, top: 700, bottom: 744 } },
    });
    const opened = placed(root);
    expect(opened.dialog).toBe('left:314px;top:auto;bottom:78px;');

    // Its foot moves up out of the keys' way, only as far as it must to keep its room.
    await keyboard(el, vv, 300);
    expect(placed(root)).toEqual({
      ...opened,
      dialog: 'left:314px;top:auto;bottom:312px;',
      panel: '--past-opacity:0.6;max-height:444px;transform-origin:408px bottom',
    });

    // With less room than that above the keys, it takes what there is.
    await keyboard(el, vv, 600);
    expect(placed(root)).toEqual({
      ...opened,
      dialog: 'left:314px;top:auto;bottom:612px;',
      panel: '--past-opacity:0.6;max-height:144px;transform-origin:408px bottom',
    });

    await keyboard(el, vv, 0);
    expect(placed(root)).toEqual(opened);
  });

  it('keeps within what is in sight where the browser pans the page for the field', async () => {
    const vv = fakeViewport();
    const { el, root } = await open();
    await keyboard(el, vv, 300);

    // The band in sight, 468 pixels tall above the keys, panned 100 pixels down the window.
    vv.pan(100);
    await el.updateComplete;
    expect(placed(root)).toMatchObject({
      dialog: 'left:314px;top:112px;',
      panel: '--past-opacity:0.6;max-height:444px;transform-origin:408px top',
    });
  });

  it('stays where it opened on a screen nothing covers', async () => {
    const vv = fakeViewport();
    const { el, root } = await open();
    const opened = placed(root);

    await keyboard(el, vv, 0);
    window.dispatchEvent(new Event('resize'));
    await el.updateComplete;
    expect(placed(root)).toEqual(opened);
  });

  it('becomes a sheet when the phone is turned upright while it is open', async () => {
    viewport(844, 390);
    const { el, root } = await open();
    expect(placed(root).className).toBe('light popover');

    viewport(390, 844);
    window.dispatchEvent(new Event('resize'));
    await el.updateComplete;
    await vi.waitFor(() => expect(placed(root)).toEqual(SHEET));
  });

  // Placed afresh for the screen's new width, from the magnifier's press as it was: the card
  // closes the panel itself where its own width changes too (`_startWidthObserver`).
  it('hangs afresh when a wide screen turns and stays wide', async () => {
    const { el, root } = await open({
      anchor: { ...MAGNIFIER, x: 922, rect: { left: 900, right: 944, top: 20, bottom: 64 } },
    });
    expect(placed(root).dialog).toBe('left:514px;top:74px;');

    // A tablet turned upright: still wide enough to hang from the magnifier, but narrower.
    viewport(768, 1024);
    window.dispatchEvent(new Event('resize'));
    await el.updateComplete;
    await vi.waitFor(() => expect(placed(root).dialog).toBe('left:316px;top:74px;'));
  });

  it('stops watching once it has closed', async () => {
    const vv = fakeViewport();
    const { el, gone } = await open();
    expect(vv.listening()).toBe(2);

    el.closeDialog();
    await vi.waitFor(() => expect(gone).toHaveBeenCalled());
    expect(vv.listening()).toBe(0);
  });

  it('hangs where it hung before it read the keyboard, wherever the magnifier is', () => {
    // The placement as it was before the keyboard was read, kept here as the specification of a
    // screen nothing covers: the search panel must stand exactly there on such a screen.
    function before(rect: PopoverBox, hang: 'left' | 'right', w: number, h: number) {
      const { left, at } = Shell.hangBelow(rect, 440, w, hang);
      const below = h - rect.bottom - Shell.BELOW_GAP - Shell.MARGIN;
      const above = rect.top - Shell.BELOW_GAP - Shell.MARGIN;
      if (below < 240 && above > below) {
        const foot = rect.top - Shell.BELOW_GAP;
        return {
          place: { left, top: foot, arrow: { side: 'bottom', at } },
          maxHeight: above,
          bottom: h - foot,
        };
      }
      return {
        place: { left, top: rect.bottom + Shell.BELOW_GAP, arrow: { side: 'top', at } },
        maxHeight: Math.max(0, below),
      };
    }

    let compared = 0;
    for (const h of [300, 390, 600, 768, 1000]) {
      const room = { top: 0, bottom: h };
      for (const w of [600, 844, 1024, 1440]) {
        for (const hang of ['left', 'right'] as const) {
          for (let top = 10; top <= h - 54; top += 7) {
            const rect = { left: w - 80, right: w - 36, top, bottom: top + 44 };
            const anchor = { x: w - 58, y: top + 22, rect, below: true };
            expect(hangIn(hangFrom(anchor, hang, w, room), room, h)).toEqual(
              before(rect, hang, w, h),
            );
            compared += 1;
          }
        }
      }
      const { left } = Shell.placeAt(undefined, 240, { width: 1024, height: h }, 440);
      expect(hangIn(hangFrom(undefined, 'left', 1024, room), room, h)).toEqual({
        place: { left, top: Shell.MARGIN },
        maxHeight: h - 2 * Shell.MARGIN,
      });
    }
    expect(compared).toBeGreaterThan(1000);
  });
});

//-----------------------------------------------------------------------------
// THE PAGE BEHIND
//-----------------------------------------------------------------------------

describe('the page behind', () => {
  /** A wheel turned over an element, and whether the panel stopped it scrolling the page. */
  function wheel(target: EventTarget, init: WheelEventInit = { deltaY: 120 }): boolean {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    });
    // happy-dom's WheelEvent leaves the modifier keys out of what it takes.
    if (init.ctrlKey) Object.defineProperty(event, 'ctrlKey', { value: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** A finger moving up over an element, and whether the panel stopped it. */
  function swipe(target: EventTarget): boolean {
    const touch = (y: number) => ({ identifier: 1, target, clientX: 100, clientY: y }) as Touch;
    const init = { bubbles: true, composed: true, cancelable: true };
    target.dispatchEvent(new TouchEvent('touchstart', { ...init, touches: [touch(300)] }));
    const move = new TouchEvent('touchmove', { ...init, touches: [touch(200)] });
    target.dispatchEvent(move);
    return move.defaultPrevented;
  }

  /** The elements made to scroll, which happy-dom cannot lay out. */
  const scrollers = new Set<Element>();

  /** Makes the results list scroll, `room` pixels of it, from `top`. */
  function scrollable(list: HTMLElement, top: number, room = 700): void {
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 300 + room },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: top, writable: true },
    });
    scrollers.add(list);
  }

  beforeEach(() => {
    scrollers.clear();
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
      scrollers.has(element)
        ? ({ overflowX: 'hidden', overflowY: 'auto', direction: 'ltr' } as CSSStyleDeclaration)
        : real(element, pseudo),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not scroll under a wheel on the backdrop, or on a part of the panel with nothing to scroll', async () => {
    const { dialog, field } = await open();

    expect(wheel(dialog())).toBe(true);
    expect(wheel(field())).toBe(true);
    expect(wheel(document.body)).toBe(true);
  });

  it('leaves a wheel to the results while they can still scroll its way', async () => {
    const { type, root, options } = await open();
    await type('dent');
    const list = root.querySelector<HTMLElement>('.results')!;

    scrollable(list, 0);
    expect(wheel(options()[0], { deltaY: 120 })).toBe(false);
    expect(wheel(options()[0], { deltaY: -120 })).toBe(true);

    scrollable(list, 700);
    expect(wheel(options()[0], { deltaY: 120 })).toBe(true);
    expect(wheel(options()[0], { deltaY: -120 })).toBe(false);
  });

  it('leaves zooming to the browser', async () => {
    const { dialog } = await open();

    expect(wheel(dialog(), { deltaY: 120, ctrlKey: true })).toBe(false);
  });

  it('does not scroll under a finger on the backdrop, and leaves one in the results to them', async () => {
    const { dialog, type, root, options } = await open();
    expect(swipe(dialog())).toBe(true);

    await type('dent');
    scrollable(root.querySelector<HTMLElement>('.results')!, 0);
    expect(swipe(options()[0])).toBe(false);
  });

  it('scrolls freely again once the panel has closed', async () => {
    const panel = await open();
    panel.el.closeDialog();
    await vi.waitFor(() => expect(panel.gone).toHaveBeenCalled());

    expect(wheel(document.body)).toBe(false);
    expect(swipe(document.body)).toBe(false);
    expect(key(document.body, 'PageDown')).toBe(false);
  });

  /** A key pressed on an element, and whether the panel stopped it scrolling the page. */
  function key(target: EventTarget, name: string, init: KeyboardEventInit = {}): boolean {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  const PAGING = ['PageDown', 'PageUp', ' ', 'End', 'Home', 'ArrowDown', 'ArrowUp'];

  it.each(PAGING)(
    'does not scroll under %j on a part of the panel with nothing to scroll',
    async (name) => {
      const { dialog } = await open();

      expect(key(dialog(), name)).toBe(true);
      expect(key(document.body, name)).toBe(true);
      expect(key(dialog(), name, { shiftKey: true })).toBe(true);
    },
  );

  it('leaves its field every key it types or moves in, and stops the page under paging keys', async () => {
    const { field, type } = await open();
    await type('dent');
    const input = field() as HTMLInputElement;
    input.setSelectionRange(2, 2);

    for (const name of [' ', 'Home', 'End', 'ArrowLeft', 'a']) {
      expect(key(field(), name)).toBe(false);
    }
    // A single-line field never pages; Chromium and WebKit scroll the page behind instead.
    expect(key(field(), 'PageDown')).toBe(true);
    expect(key(field(), 'PageUp')).toBe(true);

    // Home and End with the caret already there move nothing, and macOS scrolls the page.
    input.setSelectionRange(4, 4);
    expect(key(field(), 'End')).toBe(true);
    expect(key(field(), 'Home')).toBe(false);
    input.setSelectionRange(0, 0);
    expect(key(field(), 'Home')).toBe(true);
    expect(key(field(), 'End')).toBe(false);
    // A selection is moved off by either.
    input.setSelectionRange(0, 4);
    expect(key(field(), 'Home')).toBe(false);
    expect(key(field(), 'End')).toBe(false);
  });

  it('leaves a press of Space to a button, and paging keys on it still stopped', async () => {
    const { root } = await open();
    const close = root.querySelector<HTMLButtonElement>('button.field-close')!;

    expect(key(close, ' ')).toBe(false);
    expect(key(close, 'PageDown')).toBe(true);
    expect(key(close, 'ArrowDown')).toBe(true);
  });

  it('leaves a key to a part of the panel that can still scroll its way', async () => {
    // Keys reach the results only from inside them; the field keeps focus while they are
    // browsed, so the list stands in here for whatever scrolls with focus in it.
    const { type, root } = await open();
    await type('dent');
    const list = root.querySelector<HTMLElement>('.results')!;

    scrollable(list, 0);
    expect(key(list, 'PageDown')).toBe(false);
    expect(key(list, ' ')).toBe(false);
    expect(key(list, ' ', { shiftKey: true })).toBe(true);
    expect(key(list, 'PageUp')).toBe(true);

    scrollable(list, 700);
    expect(key(list, 'End')).toBe(true);
    expect(key(list, 'Home')).toBe(false);
  });

  it('leaves shortcuts with a modifier to whoever has them', async () => {
    const { dialog } = await open();

    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      expect(key(dialog(), 'End', { [modifier]: true })).toBe(false);
    }
  });
});

describe('its look', () => {
  it('is placed by its inline position alone, the dialog’s own insets reset', () => {
    // A modal dialog's default insets pin it to the viewport's edges, and in a right-to-left
    // document the start one outranks an inline left. happy-dom lays nothing out; measured in
    // all three engines, the panel opened flush against the right edge without this.
    const rule = /(?:^|\}|\*\/)\s*dialog\s*\{([^}]*)\}/.exec(Shell.shellStyles.cssText)?.[1] ?? '';
    expect(rule).toMatch(/(?:^|;)\s*inset:\s*auto\s*;/);
  });

  it('is the event popover’s: the same shell, glass, palettes and cells', () => {
    const own = (SearchPanel.styles as CSSResult).cssText;
    const popover = (EventPopover.styles as CSSResult).cssText;

    for (const shared of [Shell.shellStyles.cssText, Shell.cellStyles.cssText]) {
      expect(own).toContain(shared);
      expect(popover).toContain(shared);
    }
  });
});

//-----------------------------------------------------------------------------
// WHILE THE YEAR LOADS
//-----------------------------------------------------------------------------

/** A stylesheet's keyframes and its plain rules, those inside an at-rule included. */
function parsed(cssText: string) {
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const keyframes = new Map<string, string>();
  const frames = /@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g;
  for (const [, name, body] of text.matchAll(frames)) keyframes.set(name, body);
  const rules = [...text.replace(frames, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body }),
  );
  return { keyframes, rules };
}

/** A rule's declarations, by property, whitespace collapsed. */
function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    body
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => {
        const colon = part.indexOf(':');
        return [
          part.slice(0, colon).trim(),
          part
            .slice(colon + 1)
            .trim()
            .replace(/\s+/g, ' '),
        ];
      }),
  );
}

/** The keyframes a rule's `animation` or `animation-name` names. */
function animationsOf(body: string, keyframes: Map<string, string>): string[] {
  return [...body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)].flatMap(([, value]) =>
    value.split(/[\s,]+/).filter((token) => keyframes.has(token)),
  );
}

/** A single `animation` shorthand, read as the browser reads it: the first time is the duration. */
function animationOf(body: string, keyframes: Map<string, string>) {
  const tokens = (declarations(body).animation ?? '').split(' ');
  const times = tokens.filter((token) => /^\d+(?:\.\d+)?m?s$/.test(token));
  return {
    name: tokens.find((token) => keyframes.has(token)),
    duration: times[0],
    delay: times[1],
    fill: tokens.find((token) => ['none', 'forwards', 'backwards', 'both'].includes(token)),
  };
}

/** A keyframes body's `from` and `to` blocks, `0%` and `100%` read as them. */
function framesOf(body: string): Record<string, Record<string, string>> {
  const named: Record<string, string> = { '0%': 'from', '100%': 'to' };
  return Object.fromEntries(
    [...body.matchAll(/(from|to|0%|100%)\s*\{([^{}]*)\}/g)].map(([, at, block]) => [
      named[at] ?? at,
      declarations(block),
    ]),
  );
}

describe('while the year loads', () => {
  const panelCss = () => parsed((SearchPanel.styles as CSSResult).cssText);

  it('never turns the magnifier: it is not round, and a turning one reads as a glitch', () => {
    const { keyframes, rules } = panelCss();
    const turning = [...keyframes].filter(([, body]) => /rotate/.test(body)).map(([name]) => name);
    // The panel does turn something, its spinner, so a rule turning the field would be found.
    expect(turning).not.toEqual([]);

    // The magnifier and everything around it in the field: the field, its mark, the wait, the
    // ring the spinner sits in. The spinner itself turns by its own rule, which names no field.
    const field = rules.filter(({ selector }) => /\.field\b/.test(selector));
    expect(field.map(({ selector }) => selector)).toEqual(
      expect.arrayContaining(['.field', '.field-mark, .field-wait', '.field-wait > .field-icon']),
    );
    for (const { selector, body } of field) {
      expect({
        selector,
        turns: animationsOf(body, keyframes).filter((name) => turning.includes(name)),
        rotates: /transform\s*:[^;]*rotate|rotate\s*:/.test(body),
      }).toEqual({ selector, turns: [], rotates: false });
    }
  });

  it('puts a spinner in the magnifier’s place while calendars are still to answer', async () => {
    const stub = stubSource(ROWS, { loading: true });
    const { root, el, handle } = await open({}, { source: stub });
    const mark = () => root.querySelector('.field > .field-mark')!;

    expect(mark().getAttribute('aria-hidden')).toBe('true');
    expect(mark().querySelector(':scope > .field-wait > svg.field-icon')).not.toBeNull();
    expect(mark().querySelector(':scope > .field-wait > .field-ring > .spinner')).not.toBeNull();

    stub.source.loading = false;
    handle.current!.changed();
    await el.updateComplete;

    expect(mark().querySelector(':scope > svg.field-icon')).not.toBeNull();
    expect(mark().querySelector('.field-wait, .spinner')).toBeNull();
  });

  it('waits a whole second again for a load that begins just after one ended', async () => {
    // The step that swaps them belongs to the elements it animates: kept, a magnifier whose
    // step had already run would stay hidden while a new spinner waited out its second, and
    // the field would be empty. Each wait draws both afresh.
    const stub = stubSource(ROWS, { loading: true });
    const { root, el, handle } = await open({}, { source: stub });
    const wait = () => root.querySelector('.field-wait');
    const icon = () => root.querySelector('.field-icon');
    const first = { wait: wait(), icon: icon() };

    stub.source.loading = false;
    handle.current!.changed();
    await el.updateComplete;
    stub.source.loading = true;
    handle.current!.changed();
    await el.updateComplete;

    expect(wait()).not.toBeNull();
    expect(wait()).not.toBe(first.wait);
    expect(icon()).not.toBe(first.icon);

    // A load whose end the panel never drew is one wait to the person waiting: a spinner already
    // shown stays, rather than giving way to the magnifier for a second and coming back.
    const second = { wait: wait(), icon: icon() };
    stub.source.loading = false;
    handle.current!.changed();
    stub.source.loading = true;
    handle.current!.changed();
    await el.updateComplete;

    expect(wait()).toBe(second.wait);
    expect(icon()).toBe(second.icon);
  });

  it('swaps them only once the load has lasted a second, in a single step', () => {
    const { keyframes, rules } = panelCss();
    const rule = (selector: string) =>
      rules.find((candidate) => candidate.selector === selector)?.body ?? '';
    const hide = animationOf(rule('.field-wait > .field-icon'), keyframes);
    const show = animationOf(rule('.field-ring'), keyframes);

    expect(hide).toEqual({ name: 'field-wait-hide', duration: '0s', delay: '1s', fill: 'both' });
    expect(show).toEqual({ name: 'field-wait-show', duration: '0s', delay: '1s', fill: 'both' });
    // The magnifier ends hidden and the spinner begins hidden: opacity alone, a step rather
    // than motion, so it is the same with reduced motion.
    expect(framesOf(keyframes.get(hide.name!)!)).toEqual({ to: { opacity: '0' } });
    expect(framesOf(keyframes.get(show.name!)!)).toEqual({ from: { opacity: '0' } });
  });

  it('draws the event popover’s own spinner, still where the system asks for less motion', () => {
    const shell = parsed(Shell.shellStyles.cssText).rules;
    const own = (selector: string) => shell.filter((rule) => rule.selector === selector);
    expect(own('.spinner').map(({ body }) => declarations(body))).toEqual([
      {
        width: '18px',
        height: '18px',
        'border-radius': '50%',
        border: '2px solid var(--button)',
        'border-top-color': 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      },
      { animation: 'none' },
    ]);
    expect(Shell.shellStyles.cssText).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.spinner\s*\{\s*animation:\s*none;?\s*\}\s*\}/,
    );

    // Neither panel draws it any other way: the search panel only sizes it to the field.
    const touching = (styles: unknown) =>
      parsed((styles as CSSResult).cssText)
        .rules.map(({ selector }) => selector)
        .filter((selector) => /\.spinner\b/.test(selector));
    expect(touching(EventPopover.styles)).toEqual(['.spinner', '.spinner']);
    expect(touching(SearchPanel.styles)).toEqual(['.spinner', '.spinner', '.field-ring .spinner']);
  });
});
