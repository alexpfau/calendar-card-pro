/**
 * Reordering calendars: the order a grab or a drag means (`reorder.ts`), and, through
 * the mounted editor, the keyboard grab on a calendar's handle, Alt+Arrow, and the pointer drag over
 * measured rows. What every move writes is `calendar-list.ts` › `moveCalendar`, pinned in
 * `editor-calendar-list.test.ts`; these pin when it is called, how often, and what the user is told.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fakeHass,
  goEntry,
  goOverview,
  keysOf,
  lastConfig,
  mountEditor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import {
  dropTarget,
  edgeSpeed,
  grab,
  moveBy,
  order,
  placeIn,
  shift,
} from '../src/rendering/editor/reorder';
import { pointerDrag } from '../src/rendering/editor/views/reorder';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';
const FAMILY = 'calendar.family';
const BIN = 'calendar.bin_day';

const NAMES: Record<string, string> = {
  [ANNA]: 'Anna',
  [BEN]: 'Ben',
  [LEO]: 'Leo',
  [FAMILY]: 'Family',
  [BIN]: 'Bin Day',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

/**
 * Mounts the editor over calendars Home Assistant knows by name, counting what it writes.
 *
 * @param entities - Calendars as stored
 * @returns The editor and its write count
 */
async function mount(
  entities: ReadonlyArray<unknown>,
): Promise<{ editor: Editor; writes: () => number }> {
  const editor = await mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, entities },
    {
      hass: fakeHass({
        states: Object.fromEntries(
          Object.entries(NAMES).map(([id, name]) => [
            id,
            { entity_id: id, state: 'off', attributes: { friendly_name: name } },
          ]),
        ),
      }),
    },
  );
  let count = 0;
  editor.addEventListener('config-changed', () => count++);
  return { editor, writes: () => count };
}

/**
 * A calendar's drag handle.
 *
 * @param editor - The editor
 * @param entityId - The calendar
 * @returns The handle
 */
function handle(editor: Editor, entityId: string): HTMLButtonElement {
  const found = editor.shadowRoot!.querySelector<HTMLButtonElement>(
    `[data-focus="handle:${entityId}"]`,
  );
  if (!found) throw new Error(`no handle for ${entityId}`);
  return found;
}

/**
 * Presses a key on an element, as the browser dispatches it, and waits for the render.
 *
 * @param editor - The editor
 * @param target - Where the key lands
 * @param key - `KeyboardEvent.key`
 * @param init - Modifiers
 * @returns The event, to read whether it was taken
 */
async function key(
  editor: Editor,
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  await editor.updateComplete;
  await editor.updateComplete;
  return event;
}

/**
 * What the live region says now.
 *
 * @param editor - The editor
 * @returns Its text
 */
function said(editor: Editor): string {
  return editor.shadowRoot!.querySelector('.live-region')?.textContent?.trim() ?? '';
}

/**
 * The calendars in the order the list shows them: by CSS `order` while a grab previews one, else
 * as they stand.
 *
 * @param editor - The editor
 * @returns Their names, in shown order
 */
function shown(editor: Editor): string[] {
  const groups = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.cal-group')];
  return groups
    .map((group, index) => ({ group, order: Number(group.style.order || 0), index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ group }) => NAMES[group.dataset.calendar!]);
}

/**
 * The grab's line under the list.
 *
 * @param editor - The editor
 * @returns It, or null
 */
function statusLine(editor: Editor): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>('[data-grab-status]');
}

/**
 * The `data-focus` key of what has focus inside the editor.
 *
 * @param editor - The editor
 * @returns The key
 */
function focused(editor: Editor): string | undefined {
  return (editor.shadowRoot!.activeElement as HTMLElement | null)?.dataset.focus;
}

/**
 * What the editor's history can do, from its Undo and Redo.
 *
 * @param editor - The editor
 * @returns Undo's name and whether it is on
 */
function undoButton(editor: Editor): HTMLButtonElement {
  return editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="undo"]')!;
}

describe('reorder.ts', () => {
  it('picks a row up where it stands and moves it a place at a time, never past either end', () => {
    const state = grab([10, 11, 12], 11);
    expect(state).toEqual({ key: 11, from: 1, at: 1, total: 3 });
    expect(moveBy(state, -1)).toEqual({ key: 11, from: 1, at: 0, total: 3 });
    expect(moveBy(moveBy(state, -1), -1).at).toBe(0);
    expect(moveBy(moveBy(state, 1), 1).at).toBe(2);
  });

  it('previews the order with the held row at its new place and the rest in theirs', () => {
    const keys = [10, 11, 12, 13];
    expect(order(keys, { key: 10, from: 0, at: 2, total: 4 })).toEqual([11, 12, 10, 13]);
    expect(order(keys, { key: 13, from: 3, at: 0, total: 4 })).toEqual([13, 10, 11, 12]);
    expect(order(keys, grab(keys, 12))).toEqual(keys);
  });

  it('drops before the first other row whose midpoint lies below the dragged one', () => {
    expect(dropTarget([30, 90, 150], 10)).toBe(0);
    expect(dropTarget([30, 90, 150], 31)).toBe(1);
    expect(dropTarget([30, 90, 150], 90)).toBe(1);
    expect(dropTarget([30, 90, 150], 151)).toBe(3);
    expect(dropTarget([], 999)).toBe(0);
  });

  it('steps the passed rows aside toward where the dragged one came from', () => {
    // Dragged from 1 to 3: rows 2 and 3 step up a slot; 0 and 4 stay.
    expect([0, 2, 3, 4].map((index) => shift(index, 1, 3))).toEqual([0, -1, -1, 0]);
    // Dragged from 3 to 1: rows 1 and 2 step down.
    expect([0, 1, 2, 4].map((index) => shift(index, 3, 1))).toEqual([0, 1, 1, 0]);
  });

  it('scrolls only near an edge, faster the nearer, both ways', () => {
    expect(edgeSpeed(300, 100, 700)).toBe(0);
    expect(edgeSpeed(141, 100, 700)).toBe(0);
    expect(edgeSpeed(120, 100, 700)).toBeLessThan(0);
    expect(edgeSpeed(100, 100, 700)).toBeLessThan(edgeSpeed(120, 100, 700));
    expect(edgeSpeed(680, 100, 700)).toBeGreaterThan(0);
    expect(edgeSpeed(2000, 100, 700)).toBe(-edgeSpeed(-2000, 100, 700));
  });

  it('maps a place among the rows shown onto the whole list', () => {
    const all = ['a', 'b', 'c', 'd', 'e'];
    // Shown: a, c, e. Dropping c first lands it before a; last, right after e.
    expect(placeIn(all, ['a', 'c', 'e'], 'c', 0)).toBe(0);
    expect(placeIn(all, ['a', 'c', 'e'], 'c', 2)).toBe(4);
    // Dropping a between c and e lands it before e, after the hidden d.
    expect(placeIn(all, ['a', 'c', 'e'], 'a', 1)).toBe(3);
  });
});

describe('the keyboard grab', () => {
  it('picks up with Space, moves with the arrows, and drops with Space as one write and one undo step', async () => {
    const { editor, writes } = await mount([ANNA, BEN, LEO, FAMILY, BIN]);
    const anna = handle(editor, ANNA);
    anna.focus();

    const space = await key(editor, anna, ' ');
    expect(space.defaultPrevented).toBe(true);
    expect(said(editor)).toBe(
      'Anna, position 1 of 5. ↑ ↓ move it, Space drops it, Esc puts it back.',
    );
    const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    await key(editor, anna, 'ArrowDown');
    expect(said(editor)).toBe('Anna, position 2 of 5.');
    // The held row is kept in sight.
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrolled.mock.contexts[scrolled.mock.contexts.length - 1]).toBe(
      anna.closest('.cal-group'),
    );
    await key(editor, anna, 'ArrowDown');
    expect(said(editor)).toBe('Anna, position 3 of 5.');
    // The list shows the preview order; nothing is written while Anna is held.
    expect(shown(editor)).toEqual(['Ben', 'Leo', 'Anna', 'Family', 'Bin Day']);
    expect(writes()).toBe(0);
    expect(focused(editor)).toBe(`handle:${ANNA}`);

    await key(editor, anna, ' ');

    expect(writes()).toBe(1);
    expect(lastConfig(editor)?.entities).toEqual([BEN, LEO, ANNA, FAMILY, BIN]);
    expect(said(editor)).toBe('Moved Anna to position 3 of 5.');
    expect(focused(editor)).toBe(`handle:${ANNA}`);
    expect(statusLine(editor)).toBeNull();
    // One step: one Undo puts the list back, and none is left.
    expect(undoButton(editor).getAttribute('aria-label')).toBe('Undo: Move Anna');
    undoButton(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.entities).toEqual([ANNA, BEN, LEO, FAMILY, BIN]);
    expect(undoButton(editor).disabled).toBe(true);
  });

  it('shows the line under the list, not as a live region, and presses the handle while held', async () => {
    const { editor } = await mount([ANNA, BEN, LEO]);
    const ben = handle(editor, BEN);
    expect(ben.getAttribute('aria-label')).toBe('Move Ben');
    expect(ben.getAttribute('title')).toBe('Drag to move Ben, or press Space');
    expect(ben.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown');
    expect(ben.getAttribute('aria-pressed')).toBe('false');
    expect(statusLine(editor)).toBeNull();
    ben.focus();

    await key(editor, ben, ' ');
    // Space held down repeats its keydown; the grab holds.
    await key(editor, ben, ' ', { repeat: true });
    expect(ben.getAttribute('aria-pressed')).toBe('true');
    expect(handle(editor, ANNA).getAttribute('aria-pressed')).toBe('false');
    const line = statusLine(editor)!;
    expect(line.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Ben, position 2 of 3. ↑ ↓ move it, Space drops it, Esc puts it back.',
    );
    expect([...line.querySelectorAll('kbd')].map((cap) => cap.textContent)).toEqual([
      '↑',
      '↓',
      'Space',
      'Esc',
    ]);
    // The queue is the one region that speaks: the line has no role or live attribute of its own.
    for (const each of [line, ...line.querySelectorAll('*')]) {
      expect(each.getAttribute('role')).toBeNull();
      expect(each.getAttribute('aria-live')).toBeNull();
    }
    expect(editor.shadowRoot!.querySelectorAll('[aria-live]')).toHaveLength(1);
    // The held calendar is marked.
    expect(ben.closest('.cal-group')!.classList.contains('grabbed')).toBe(true);

    await key(editor, ben, 'ArrowUp');
    expect(statusLine(editor)!.textContent).toContain('Ben, position 1 of 3.');
    await key(editor, ben, ' ');
    expect(ben.getAttribute('aria-pressed')).toBe('false');
    expect(statusLine(editor)).toBeNull();
  });

  it('puts the calendar back on Escape, writing nothing, focus kept on its handle', async () => {
    const { editor, writes } = await mount([ANNA, BEN, LEO]);
    const leo = handle(editor, LEO);
    leo.focus();
    await key(editor, leo, ' ');
    await key(editor, leo, 'ArrowUp');
    await key(editor, leo, 'ArrowUp');
    expect(shown(editor)).toEqual(['Leo', 'Anna', 'Ben']);

    const escape = await key(editor, leo, 'Escape');

    expect(escape.defaultPrevented).toBe(true);
    expect(writes()).toBe(0);
    expect(shown(editor)).toEqual(['Anna', 'Ben', 'Leo']);
    expect(said(editor)).toBe('Put Leo back at position 3 of 3.');
    expect(leo.getAttribute('aria-pressed')).toBe('false');
    expect(focused(editor)).toBe(`handle:${LEO}`);
  });

  it('puts the calendar back when focus leaves its handle, writing nothing', async () => {
    const { editor, writes } = await mount([ANNA, BEN, LEO]);
    const anna = handle(editor, ANNA);
    anna.focus();
    await key(editor, anna, ' ');
    await key(editor, anna, 'ArrowDown');

    handle(editor, BEN).focus();
    await editor.updateComplete;

    expect(writes()).toBe(0);
    expect(shown(editor)).toEqual(['Anna', 'Ben', 'Leo']);
    expect(said(editor)).toBe('Put Anna back at position 1 of 3.');
    expect(statusLine(editor)).toBeNull();
    // Focus stays where it went.
    expect(focused(editor)).toBe(`handle:${BEN}`);
  });

  it('lets Escape put the grab back before it closes any other disclosure', async () => {
    const { editor } = await mount([ANNA, BEN, LEO]);
    const [, ben] = keysOf(editor, 'entry');
    editor
      .shadowRoot!.querySelector<HTMLButtonElement>(`[data-focus="more:entry:${ben}"]`)!
      .click();
    await editor.updateComplete;
    expect(editor.shadowRoot!.querySelector('.strip')).not.toBeNull();
    const handleBen = handle(editor, BEN);
    handleBen.focus();
    await key(editor, handleBen, ' ');

    await key(editor, handleBen, 'Escape');
    // The grab went back; the strip is still open.
    expect(statusLine(editor)).toBeNull();
    expect(editor.shadowRoot!.querySelector('.strip')).not.toBeNull();

    await key(editor, handleBen, 'Escape');
    expect(editor.shadowRoot!.querySelector('.strip')).toBeNull();
  });

  it('moves a calendar at once with Alt+Arrow on its handle, one write each', async () => {
    const { editor, writes } = await mount([ANNA, BEN, LEO]);
    const anna = handle(editor, ANNA);
    anna.focus();

    await key(editor, anna, 'ArrowDown', { altKey: true });

    expect(writes()).toBe(1);
    expect(lastConfig(editor)?.entities).toEqual([BEN, ANNA, LEO]);
    expect(said(editor)).toBe('Moved Anna to position 2 of 3.');
    expect(statusLine(editor)).toBeNull();
    expect(focused(editor)).toBe(`handle:${ANNA}`);

    await key(editor, handle(editor, ANNA), 'ArrowDown', { altKey: true });
    expect(writes()).toBe(2);
    expect(lastConfig(editor)?.entities).toEqual([BEN, LEO, ANNA]);
  });

  it('moves a calendar listed twice with all its entries, from its one handle', async () => {
    const family = [
      { entity: FAMILY, event_type: 'all_day' },
      { entity: FAMILY, event_type: 'timed' },
    ];
    const { editor, writes } = await mount([ANNA, ...family, BEN]);
    // One handle for the calendar, on its own row; its entries have none.
    expect(editor.shadowRoot!.querySelectorAll('.cal-row-entry .drag-handle')).toHaveLength(0);
    const handleFamily = handle(editor, FAMILY);
    expect(handleFamily.closest('.cal-row-head')).not.toBeNull();
    handleFamily.focus();

    await key(editor, handleFamily, ' ');
    await key(editor, handleFamily, 'ArrowUp');
    expect(said(editor)).toBe('Family, position 1 of 3.');
    await key(editor, handleFamily, ' ');

    expect(writes()).toBe(1);
    expect(lastConfig(editor)?.entities).toEqual([...family, ANNA, BEN]);
    expect(said(editor)).toBe('Moved Family to position 1 of 3.');
  });
});

describe('the keyboard grab, when the list changes under it', () => {
  it('ends a grab on a configuration from outside, which no later list revives', async () => {
    const { editor, writes } = await mount([ANNA, BEN, LEO]);
    const anna = handle(editor, ANNA);
    anna.focus();
    await key(editor, anna, ' ');
    await key(editor, anna, 'ArrowDown');

    // Another editor, or the YAML, drops Anna, then adds a calendar: Ben now stands first.
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities: [BEN, LEO] });
    await editor.updateComplete;
    editor.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities: [BEN, LEO, BIN] });
    await editor.updateComplete;

    expect(statusLine(editor)).toBeNull();
    expect(handle(editor, BEN).getAttribute('aria-pressed')).toBe('false');
    // Space on Ben picks Ben up; nothing drops him where Anna was taken.
    const ben = handle(editor, BEN);
    ben.focus();
    await key(editor, ben, ' ');
    expect(said(editor)).toContain('Ben, position 1 of 3.');
    expect(writes()).toBe(0);
  });

  it('swallows the click a Space makes, but not one after focus left the handle', async () => {
    const { editor } = await mount([ANNA, BEN]);
    const anna = handle(editor, ANNA);
    anna.focus();
    await key(editor, anna, ' ');
    // The click a browser may send on Space's keyup does not drop what Space just picked up.
    anna.click();
    await editor.updateComplete;
    expect(anna.getAttribute('aria-pressed')).toBe('true');
    anna.click();
    await editor.updateComplete;
    expect(anna.getAttribute('aria-pressed')).toBe('false');

    // A Space whose keyup lands elsewhere leaves no click to swallow behind it.
    await key(editor, anna, ' ');
    handle(editor, BEN).focus();
    await editor.updateComplete;
    anna.click();
    await editor.updateComplete;
    expect(anna.getAttribute('aria-pressed')).toBe('true');
  });
});

/** Each calendar group's top, as these tests lay the list out: 60 px rows, 8 px apart, from 200. */
const ROW = 60;
const GAP = 8;
const TOP = 200;

/**
 * Lays the list's rows out at fixed heights, since happy-dom lays out nothing.
 */
function layOut(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const siblings = [...(this.parentElement?.children ?? [])].filter(
      (each) => each instanceof HTMLElement && each.dataset.reorder !== undefined,
    );
    const index = this.dataset.reorder === undefined ? -1 : siblings.indexOf(this);
    const top = index < 0 ? 0 : TOP + index * (ROW + GAP);
    const height = index < 0 ? 0 : ROW;
    return {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

/**
 * Sends a pointer event to a handle.
 *
 * @param target - The handle
 * @param type - The event type
 * @param clientY - Where the pointer is
 */
function pointer(target: Element, type: string, clientY: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      clientY,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
}

describe('the pointer drag', () => {
  it('drops a dragged calendar where its middle passed another’s, as one write, focus on its handle', async () => {
    layOut();
    const { editor, writes } = await mount([ANNA, BEN, LEO, BIN]);
    const anna = handle(editor, ANNA);
    const start = TOP + ROW / 2;

    pointer(anna, 'pointerdown', start);
    // Under 4 px is not a drag yet.
    pointer(anna, 'pointermove', start + 3);
    expect(anna.closest('.cal-group')!.classList.contains('lifted')).toBe(false);
    // Past Leo's middle (row 3 of 4), short of Bin Day's.
    pointer(anna, 'pointermove', start + 2 * (ROW + GAP) + 10);
    const group = (id: string) =>
      editor.shadowRoot!.querySelector<HTMLElement>(`.cal-group[data-calendar="${id}"]`)!;
    expect(group(ANNA).classList.contains('lifted')).toBe(true);
    expect(group(ANNA).style.transform).toBe(`translateY(${2 * (ROW + GAP) + 10}px)`);
    // Ben and Leo step up a slot to make room; Bin Day stays.
    expect(group(BEN).style.transform).toBe(`translateY(${-(ROW + GAP)}px)`);
    expect(group(LEO).style.transform).toBe(`translateY(${-(ROW + GAP)}px)`);
    expect(group(BIN).style.transform).toBe('translateY(0px)');
    expect(writes()).toBe(0);

    pointer(anna, 'pointerup', start + 2 * (ROW + GAP) + 10);
    // The click that ends a drag does not pick the calendar up.
    anna.click();
    await editor.updateComplete;
    await editor.updateComplete;

    expect(writes()).toBe(1);
    expect(lastConfig(editor)?.entities).toEqual([BEN, LEO, ANNA, BIN]);
    expect(said(editor)).toBe('Moved Anna to position 3 of 4.');
    expect(statusLine(editor)).toBeNull();
    expect(focused(editor)).toBe(`handle:${ANNA}`);
    for (const id of [ANNA, BEN, LEO, BIN]) expect(group(id).style.transform).toBe('');
  });

  it('puts the calendar back on pointercancel, writing nothing', async () => {
    layOut();
    const { editor, writes } = await mount([ANNA, BEN, LEO]);
    const leo = handle(editor, LEO);
    const start = TOP + 2 * (ROW + GAP) + ROW / 2;
    pointer(leo, 'pointerdown', start);
    pointer(leo, 'pointermove', start - 2 * (ROW + GAP));

    pointer(leo, 'pointercancel', start - 2 * (ROW + GAP));
    await editor.updateComplete;

    expect(writes()).toBe(0);
    expect(said(editor)).toBe('Put Leo back at position 3 of 3.');
    const groups = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.cal-group')];
    expect(groups.map((each) => each.style.transform)).toEqual(['', '', '']);
    expect(editor.shadowRoot!.querySelector('.cal-list')!.classList.contains('dragging')).toBe(
      false,
    );
  });

  it('puts the calendar back on Escape during a drag', async () => {
    layOut();
    const { editor, writes } = await mount([ANNA, BEN]);
    const anna = handle(editor, ANNA);
    pointer(anna, 'pointerdown', TOP + 30);
    pointer(anna, 'pointermove', TOP + 30 + ROW + GAP);

    await key(editor, anna, 'Escape');
    // Let go later: the click that follows does not pick Anna up.
    await new Promise((resolve) => setTimeout(resolve, 20));
    pointer(anna, 'pointerup', TOP + 30 + ROW + GAP);
    anna.click();
    await editor.updateComplete;

    expect(writes()).toBe(0);
    expect(said(editor)).toBe('Put Anna back at position 1 of 2.');
    expect(anna.getAttribute('aria-pressed')).toBe('false');
    expect(statusLine(editor)).toBeNull();
  });

  it('ends a drag when a configuration from outside reorders the list, writing nothing', async () => {
    layOut();
    const { editor, writes } = await mount([ANNA, BEN, LEO, BIN]);
    const anna = handle(editor, ANNA);
    pointer(anna, 'pointerdown', TOP + 30);
    pointer(anna, 'pointermove', TOP + 30 + 2 * (ROW + GAP) + 10);

    editor.setConfig({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA, LEO, BIN, BEN],
    });
    await editor.updateComplete;
    pointer(anna, 'pointerup', TOP + 30 + 2 * (ROW + GAP) + 10);
    await editor.updateComplete;

    expect(writes()).toBe(0);
    const groups = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.cal-group')];
    expect(groups.map((each) => each.style.transform)).toEqual(['', '', '', '']);
  });

  it('ends a drag when the editor is taken away mid-drag', async () => {
    layOut();
    const { editor, writes } = await mount([ANNA, BEN]);
    const anna = handle(editor, ANNA);
    pointer(anna, 'pointerdown', TOP + 30);
    pointer(anna, 'pointermove', TOP + 30 + ROW + GAP);
    const group = anna.closest<HTMLElement>('.cal-group')!;
    expect(group.style.transform).not.toBe('');

    editor.remove();

    expect(group.style.transform).toBe('');
    expect((editor as unknown as { _drag?: unknown })._drag).toBeUndefined();
    expect(writes()).toBe(0);
  });

  it('scrolls while the pointer is near the scroller’s edge, and drops among the rows it reached', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    layOut();
    /**
     * Drags the first of four rows 60 px down, to 290, inside a scroller whose bottom is given.
     *
     * @param bottom - The scroller's bottom
     * @returns How it ended, and how far the scroller scrolled
     */
    const drag = (bottom: number) => {
      const list = document.createElement('div');
      for (const id of ['a', 'b', 'c', 'd']) {
        const row = document.createElement('div');
        row.dataset.reorder = id;
        row.append(document.createElement('button'));
        list.append(row);
      }
      document.body.replaceChildren(list);
      const scroller = {
        scrollTop: 0,
        getBoundingClientRect: () => ({ top: 0, bottom }),
      } as unknown as Element;
      const button = list.querySelector('button')!;
      const finish = vi.fn();
      button.addEventListener('pointerdown', (event) => pointerDrag(event, scroller, finish), {
        once: true,
      });
      pointer(button, 'pointerdown', TOP + 30);
      pointer(button, 'pointermove', 290);
      vi.advanceTimersByTime(16 * 20);
      pointer(button, 'pointerup', 290);
      return { outcome: finish.mock.calls[0][0], scrolled: scroller.scrollTop };
    };

    // 10 px from the bottom edge: it scrolls, and the row follows the content down to last place.
    const near = drag(300);
    expect(near.scrolled).toBeGreaterThan(2 * (ROW + GAP));
    expect(near.outcome).toEqual({ ids: ['a', 'b', 'c', 'd'], from: 0, at: 3, dropped: true });
    // A list taken out of the page mid-drag ends it on the next frame, the row put back.
    const list = document.createElement('div');
    const row = document.createElement('div');
    row.dataset.reorder = 'a';
    row.append(document.createElement('button'));
    list.append(row);
    document.body.replaceChildren(list);
    const finish = vi.fn();
    const button = row.querySelector('button')!;
    button.addEventListener('pointerdown', (event) => pointerDrag(event, undefined, finish), {
      once: true,
    });
    pointer(button, 'pointerdown', TOP + 30);
    pointer(button, 'pointermove', TOP + 60);
    list.remove();
    vi.advanceTimersByTime(32);
    expect(finish).toHaveBeenCalledWith({ ids: ['a'], from: 0, at: 0, dropped: false });
    expect(row.style.transform).toBe('');
    // Far from any edge: nothing scrolls, and the same pointer travel stays short of b's middle.
    const far = drag(1000);
    expect(far.scrolled).toBe(0);
    expect(far.outcome).toEqual({ ids: ['a', 'b', 'c', 'd'], from: 0, at: 0, dropped: true });
  });
});

describe('moving a calendar Split This Calendar made two of', () => {
  /**
   * Presses one of the editor's own controls by its `data-focus` key.
   *
   * @param editor - The editor
   * @param focus - The key
   */
  async function press(editor: Editor, focus: string): Promise<void> {
    const control = editor.shadowRoot!.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
    if (control === null) throw new Error(`no control ${focus}`);
    control.click();
    await editor.updateComplete;
    await editor.updateComplete;
  }

  it('moves both parts with their New tags as one step, and the audit lists them where they went', async () => {
    const { editor, writes } = await mount([{ entity: BEN, accent_color: '#3f51b5' }, ANNA]);
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    await press(editor, 'split-row');
    await press(editor, 'split-next');
    await press(editor, 'split-next');
    for (let turn = 0; turn < 5; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.updateComplete;
    }
    await press(editor, 'split-apply');
    await goOverview(editor);
    const split = lastConfig(editor)!.entities as ReadonlyArray<unknown>;
    expect(split).toHaveLength(3);
    const before = writes();

    // Ben is a calendar with two entries now: one handle, on his calendar row.
    const ben = handle(editor, BEN);
    expect(ben.closest('.cal-row-head')).not.toBeNull();
    ben.focus();
    await key(editor, ben, ' ');
    expect(said(editor)).toContain('Ben, position 1 of 2.');
    await key(editor, ben, 'ArrowDown');
    await key(editor, ben, ' ');

    expect(writes() - before).toBe(1);
    expect(lastConfig(editor)?.entities).toEqual([ANNA, split[0], split[1]]);
    expect(said(editor)).toBe('Moved Ben to position 2 of 2.');
    // The New tags went with the parts.
    const tagged = [...editor.shadowRoot!.querySelectorAll('.cal-row')]
      .filter((row) => row.querySelector('.tag') !== null)
      .map((row) => row.closest<HTMLElement>('.cal-group')!.dataset.calendar);
    expect(tagged).toEqual([BEN, BEN]);
    expect(shown(editor)).toEqual(['Anna', 'Ben']);

    // What This Card Changes lists Ben's parts at their new places.
    await press(editor, 'more:audit');
    const paths = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-audit]')].map(
      (row) => row.dataset.audit!,
    );
    expect(paths).toContain('entities[1].event_type');
    expect(paths).toContain('entities[2].event_type');
    expect(paths.some((path) => path.startsWith('entities[0].'))).toBe(false);

    // One Undo puts the split list back as it was, Ben first.
    await goOverview(editor);
    expect(undoButton(editor).getAttribute('aria-label')).toBe('Undo: Move Ben');
    undoButton(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.entities).toEqual(split);
  });
});
