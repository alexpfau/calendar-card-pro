import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type * as Types from '../src/config/types';
import { PLACES_STORAGE_KEY, resetMapTilesToken } from '../src/interaction/event-map';
import type { PopoverParams } from '../src/interaction/popover-model';
import { BEAK_EDGE, EVENT_POPOVER_TAG } from '../src/rendering/event-popover';

/**
 * The event popover as Home Assistant's dialog manager drives it: `showDialog` before the
 * element is attached, then the native modal, then `dialog-closed` once it is gone. Every write
 * goes through `hass.callWS`, which these tests stub and read back.
 */

type Popover = HTMLElement & {
  hass?: Types.Hass;
  showDialog(params: PopoverParams): void;
  closeDialog(): boolean;
  readonly updateComplete: Promise<boolean>;
};

const SWIM = {
  summary: '🏊 Swim',
  dtstart: '2026-11-03T16:00:00+00:00',
  dtend: '2026-11-03T17:00:00+00:00',
  location: 'Riverside Pool',
  description: 'Bring goggles',
  uid: 'u-swim',
};

const WEEKLY = { ...SWIM, rrule: 'FREQ=WEEKLY;BYDAY=TU', recurrence_id: '20261103T160000Z' };

const BEN = { id: 'calendar.ben', name: 'Ben', color: 'rgb(51, 102, 204)' };
const ANNA = { id: 'calendar.anna', name: 'Anna', color: 'rgb(204, 51, 102)' };

const POOL_ZONE = {
  'zone.swim_club': {
    entity_id: 'zone.swim_club',
    state: '0',
    attributes: { friendly_name: 'Riverside Pool', latitude: 52.5, longitude: 13.45 },
  },
};

interface Options {
  strings?: Record<string, string>;
  states?: Record<string, unknown>;
  write?: (message: Record<string, unknown>) => Promise<unknown>;
  tiles?: boolean;
}

/**
 * Open a popover the way Home Assistant does, and wait for it to draw.
 *
 * @param params - What differs from an editable, deletable event on Ben's calendar
 * @param options - Home Assistant's strings and states, and how its writes answer
 */
async function open(params: Partial<PopoverParams>, options: Options = {}) {
  const callWS = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'map_tiles/access_token') {
      if (options.tiles === false) throw { code: 'unknown_command' };
      return { token: 'tok' };
    }
    return options.write ? options.write(message) : undefined;
  });
  const updated = vi.fn((..._calendarIds: string[]) => undefined);
  const closed = vi.fn();

  const el = document.createElement(EVENT_POPOVER_TAG) as Popover;
  el.hass = {
    states: options.states ?? {},
    callWS,
    localize: (key: string) => options.strings?.[key] ?? '',
  } as unknown as Types.Hass;
  el.addEventListener('dialog-closed', (ev) => closed((ev as CustomEvent).detail));
  el.showDialog({
    mode: 'event',
    calendarId: BEN.id,
    entry: SWIM,
    display: { title: 'Swim', location: SWIM.location, description: SWIM.description },
    canEdit: true,
    canDelete: true,
    color: BEN.color,
    calendars: [BEN],
    language: 'en',
    hour24: true,
    dark: false,
    updated,
    ...params,
  });
  document.body.appendChild(el);
  await el.updateComplete;
  await el.updateComplete;

  const root = el.shadowRoot!;
  const writes = () =>
    callWS.mock.calls
      .map(([message]) => message)
      .filter((message) => String(message.type).startsWith('calendar/event/'));
  const buttons = (selector = 'button') =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(selector));
  const button = (text: string) => {
    const found = buttons().find((b) => b.textContent?.trim() === text);
    if (!found)
      throw new Error(`No button "${text}" in ${buttons().map((b) => b.textContent?.trim())}`);
    return found;
  };
  const type = async (selector: string, value: string) => {
    const input = root.querySelector<HTMLInputElement>(selector)!;
    input.dispatchEvent(new Event('focus'));
    await el.updateComplete;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await el.updateComplete;
  };
  const press = async (target: Element) => {
    (target as HTMLElement).click();
    await el.updateComplete;
  };
  return { el, root, callWS, updated, closed, writes, buttons, button, type, press };
}

// A location that reads as a place name is looked up in Open-Meteo, and tests must never reach
// the network: every test starts with a fetch that finds nothing, and one that wants a place
// stubs its own. The places kept in local storage go with each test.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) })),
  );
  localStorage.removeItem(PLACES_STORAGE_KEY);
});

afterEach(() => {
  document.body.innerHTML = '';
  resetMapTilesToken();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.removeItem(PLACES_STORAGE_KEY);
});

describe('opening', () => {
  it('opens as a modal once Home Assistant attaches it', async () => {
    const { root, closed } = await open({});
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(closed).not.toHaveBeenCalled();
  });

  it("puts focus on the event's title, for a screen reader to announce", async () => {
    const { root } = await open({});
    expect(root.activeElement).toBe(root.querySelector('h2#popover-title'));
  });

  it('shows the title as the card does, and what is stored once you edit it', async () => {
    const { el, root } = await open({});
    const title = root.querySelector<HTMLInputElement>('input.title')!;
    expect(title.value).toBe('Swim');
    title.dispatchEvent(new Event('focus'));
    await el.updateComplete;
    expect(title.value).toBe('🏊 Swim');
  });

  it('closes at once on an event whose start it cannot read, and tells Home Assistant', async () => {
    const { closed, root } = await open({ entry: { ...SWIM, dtstart: 'soon' } });
    expect(closed).toHaveBeenCalledWith({ dialog: EVENT_POPOVER_TAG });
    expect(root.querySelector('dialog')?.open).not.toBe(true);
  });

  it("words its cells in Home Assistant's language", async () => {
    const { root } = await open({}, { strings: { 'ui.common.delete': 'Löschen' } });
    expect(root.querySelector('.foot button')?.textContent?.trim()).toBe('Löschen');
  });
});

/**
 * A finger lifts where it pressed, and a browser sends the mouse events and click it derives
 * from the touch there, after the popover has opened over that spot. Those must not start
 * editing a field: the title would raise a phone's keyboard, the times would open.
 */
describe('the touch that opened it', () => {
  const ghost = (target: Element) => {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, composed: true, cancelable: true }),
      );
    }
  };
  const touched = { anchor: { x: 10, y: 10, pointerType: 'touch' } };

  it.each(['touch', 'pen'])('leaves the times closed for the click a %s derives', async (kind) => {
    const { el, root } = await open({ anchor: { x: 10, y: 10, pointerType: kind } });
    ghost(root.querySelector('button.time')!);
    await el.updateComplete;
    expect(root.querySelector('button.time')).not.toBeNull();
    expect(root.activeElement).toBe(root.querySelector('h2#popover-title'));
  });

  it('answers a click that comes after the derived one, as a key pressing a button sends', async () => {
    const { el, root, press } = await open(touched);
    ghost(root.querySelector('button.time')!);
    await el.updateComplete;
    await press(root.querySelector('button.time')!);
    expect(root.querySelector('button.time')).toBeNull();
  });

  it('guards only for a moment after it opened', async () => {
    const { el, root } = await open(touched);
    const opened = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(opened + 1000);
    onTestFinished(() => vi.mocked(Date.now).mockRestore());
    ghost(root.querySelector('button.time')!);
    await el.updateComplete;
    expect(root.querySelector('button.time')).toBeNull();
  });

  it('keeps the focus off a field the derived events focus anyway', async () => {
    const { el, root } = await open(touched);
    root.querySelector<HTMLInputElement>('input.title')!.focus();
    await el.updateComplete;
    expect(root.activeElement).toBe(root.querySelector('h2#popover-title'));
  });

  it("answers the popover's own presses: one that begins with a pointer-down", async () => {
    const { el, root } = await open(touched);
    const time = root.querySelector('button.time')!;
    time.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    ghost(time);
    await el.updateComplete;
    expect(root.querySelector('button.time')).toBeNull();
  });

  it('guards nothing after a mouse press or a key, which click what they mean to', async () => {
    const { el, root } = await open({ anchor: { x: 10, y: 10, pointerType: 'mouse' } });
    ghost(root.querySelector('button.time')!);
    await el.updateComplete;
    expect(root.querySelector('button.time')).toBeNull();
  });
});

describe('a new event opened by finger or pen', () => {
  it.each(['touch', 'pen'])(
    'opens on its title heading after a %s, no field editing',
    async (kind) => {
      const { root } = await open({
        mode: 'new',
        entry: undefined,
        display: undefined,
        times: { allDay: false, start: new Date(2026, 10, 3, 9), end: new Date(2026, 10, 3, 10) },
        canDelete: false,
        anchor: { x: 10, y: 10, pointerType: kind },
      });
      // Not the title field: a field taking the focus raises a phone's keyboard unasked.
      expect(root.activeElement).toBe(root.querySelector('h2#popover-title'));
      expect(root.querySelector('button.time')).not.toBeNull();
    },
  );
});

describe("Home Assistant's shortcuts", () => {
  it('never hears a letter typed in the popover, outside a text field too', async () => {
    const { root } = await open({});
    const heard: string[] = [];
    const listen = (ev: Event) => heard.push((ev as KeyboardEvent).key);
    document.addEventListener('keydown', listen);
    onTestFinished(() => document.removeEventListener('keydown', listen));
    const key = (target: Element, init: KeyboardEventInit) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, composed: true, ...init }),
      );

    key(root.querySelector('h2#popover-title')!, { key: 'a' });
    key(root.querySelector('button.time')!, { key: 'E', shiftKey: true });
    key(root.querySelector('h2#popover-title')!, { key: 'c', metaKey: true });
    key(root.querySelector('h2#popover-title')!, { key: 'Tab' });
    expect(heard).toEqual(['c', 'Tab']);
  });
});

describe('telling the card', () => {
  it('reports every change to the draft, and its closing once', async () => {
    const changed = vi.fn();
    const hook = vi.fn();
    const { el, closed, type } = await open({ changed, closed: hook });
    await type('input.title', 'Swim practice');
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'Swim practice' }));
    expect(hook).not.toHaveBeenCalled();

    el.closeDialog();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('opens again with no field being edited, whatever was when it last closed', async () => {
    const { el, root, closed, press } = await open({});
    await press(root.querySelector('button.time')!);
    expect(root.querySelector('button.time')).toBeNull();
    el.closeDialog();
    await vi.waitFor(() => expect(closed).toHaveBeenCalled());

    el.showDialog({
      mode: 'event',
      calendarId: BEN.id,
      entry: SWIM,
      display: { title: 'Swim', location: SWIM.location, description: SWIM.description },
      canEdit: true,
      canDelete: true,
      color: BEN.color,
      calendars: [BEN],
      language: 'en',
      hour24: true,
      dark: false,
      updated: vi.fn(),
    });
    await el.updateComplete;
    await el.updateComplete;
    expect(root.querySelector('button.time')).not.toBeNull();
  });
});

describe('saving on close', () => {
  it('closes without writing when nothing changed, even after a field was focused', async () => {
    const { el, root, writes, closed, updated } = await open({});
    root.querySelector('input.title')!.dispatchEvent(new Event('focus'));
    await el.updateComplete;
    expect(el.closeDialog()).toBe(true);
    expect(writes()).toEqual([]);
    expect(updated).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledWith({ dialog: EVENT_POPOVER_TAG });
  });

  it('writes a changed title once, on close, and refreshes the calendar', async () => {
    const { el, type, writes, closed, updated } = await open({});
    await type('input.title', 'Swim lesson');
    await type('input.plain', '12 Mill Road');
    expect(writes()).toEqual([]);

    // Home Assistant reads the answer at once, so a save under way is a plain false, and the
    // popover closes itself, through dialog-closed, once Home Assistant has saved.
    expect(el.closeDialog()).toBe(false);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      {
        type: 'calendar/event/update',
        entity_id: 'calendar.ben',
        uid: 'u-swim',
        event: {
          summary: 'Swim lesson',
          dtstart: '2026-11-03T16:00:00Z',
          dtend: '2026-11-03T17:00:00Z',
          description: 'Bring goggles',
          location: '12 Mill Road',
        },
      },
    ]);
    expect(updated).toHaveBeenCalledWith('calendar.ben');
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("keeps out what the event's calendar hides, and saves it as stored", async () => {
    // The control: the same event, nothing hidden, shows both and asks for the zone's map.
    const shown = await open({}, { states: POOL_ZONE });
    expect(shown.root.querySelector('input.plain')).not.toBeNull();
    expect(shown.root.querySelector('.notes')).not.toBeNull();
    await vi.waitFor(() => expect(shown.root.querySelector('a.map-link')).not.toBeNull());
    shown.el.remove();

    const { el, root, callWS, type, writes, closed } = await open(
      { hidden: { location: true, description: true } },
      { states: POOL_ZONE },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
    expect(root.querySelector('input.plain')).toBeNull();
    expect(root.querySelector('.notes')).toBeNull();
    expect(root.querySelector('a.pin, a.map-link')).toBeNull();
    expect(callWS.mock.calls.map(([message]) => message.type)).not.toContain(
      'map_tiles/access_token',
    );

    await type('input.title', 'Swim lesson');
    expect(el.closeDialog()).toBe(false);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({
          summary: 'Swim lesson',
          location: 'Riverside Pool',
          description: 'Bring goggles',
        }),
      }),
    ]);
  });

  it('throws the changes away on Escape', async () => {
    const { root, type, writes, closed } = await open({});
    await type('input.title', 'Swim lesson');
    const cancel = new Event('cancel', { cancelable: true });
    root.querySelector('dialog')!.dispatchEvent(cancel);
    await Promise.resolve();
    expect(cancel.defaultPrevented).toBe(true);
    expect(writes()).toEqual([]);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('saves on a press that starts and ends on the backdrop, but not on the one that opened it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T08:00:00Z'));
    const { root, type, writes } = await open({});
    await type('input.title', 'Swim lesson');
    const dialog = root.querySelector('dialog')!;
    const backdropPress = () => {
      dialog.dispatchEvent(new Event('pointerdown'));
      dialog.dispatchEvent(new MouseEvent('click'));
    };

    backdropPress();
    await Promise.resolve();
    expect(writes()).toEqual([]);

    vi.setSystemTime(new Date('2026-11-03T08:00:01Z'));
    // A press that started inside the panel and ended on the backdrop is not one.
    root.querySelector('.panel')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent('click'));
    await Promise.resolve();
    expect(writes()).toEqual([]);

    backdropPress();
    await vi.waitFor(() => expect(writes()).toHaveLength(1));
  });

  it("keeps the popover open and says why when Home Assistant refuses, in its words or HA's own", async () => {
    let answer: unknown = { code: 'failed', message: 'Calendar is read-only' };
    const { el, root, type, closed } = await open(
      {},
      { write: async () => Promise.reject(answer) },
    );
    await type('input.title', 'Swim lesson');

    expect(el.closeDialog()).toBe(false);
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toBe('Calendar is read-only'),
    );
    expect(root.querySelector('dialog')?.open).toBe(true);

    answer = { code: 'failed' };
    expect(el.closeDialog()).toBe(false);
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toBe('Unknown error'),
    );
    expect(closed).not.toHaveBeenCalled();
  });

  it('refuses an end before the start without writing', async () => {
    const { el, root, writes, press } = await open({});
    await press(root.querySelector('button.time')!);
    const [, endTime] = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="time"]'));
    endTime.value = '15:00';
    endTime.dispatchEvent(new Event('change'));
    await el.updateComplete;

    expect(el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'The duration of the event is not valid. Please check start and end date.',
    );
    expect(writes()).toEqual([]);
  });

  it('moves the end with the start, keeping the length', async () => {
    const { el, root, writes, press } = await open({});
    await press(root.querySelector('button.time')!);
    const [startTime] = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="time"]'));
    startTime.value = '18:30';
    startTime.dispatchEvent(new Event('change'));
    await el.updateComplete;

    el.closeDialog();
    expect(writes()[0].event).toMatchObject({
      dtstart: '2026-11-03T18:30:00Z',
      dtend: '2026-11-03T19:30:00Z',
    });
  });
});

describe('a repeating event', () => {
  const display = { title: 'Swim', location: '', description: '' };

  it.each([
    ['This and all future events', 'THISANDFUTURE', { rrule: 'FREQ=WEEKLY;BYDAY=TU' }],
    ['Only this event', '', {}],
  ])('asks once which occurrences a change covers: %s', async (choice, range, rule) => {
    const { el, root, type, writes, button, press, closed } = await open({
      entry: WEEKLY,
      display,
    });
    await type('input.title', 'Swim lesson');

    expect(el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('.ask')).not.toBeNull();
    expect(writes()).toEqual([]);

    await press(button(choice));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      {
        type: 'calendar/event/update',
        entity_id: 'calendar.ben',
        uid: 'u-swim',
        recurrence_id: '20261103T160000Z',
        recurrence_range: range,
        event: expect.objectContaining({ summary: 'Swim lesson', ...rule }),
      },
    ]);
    if (!range) expect(writes()[0].event).not.toHaveProperty('rrule');
  });

  it('goes back to editing on Escape while it asks, closing nothing', async () => {
    const { el, root, type, closed } = await open({ entry: WEEKLY, display });
    await type('input.title', 'Swim lesson');
    el.closeDialog();
    await el.updateComplete;

    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await el.updateComplete;
    expect(root.querySelector('.ask')).toBeNull();
    expect(closed).not.toHaveBeenCalled();
  });

  describe('dropped by a drag in a grid', () => {
    // Wednesday at 18:00, from Tuesday at 16:00: the weekly rule moves to Wednesday with it.
    /** The question's last button, Cancel. */
    const lastAsk = (root: ShadowRoot) => {
      const asked = root.querySelectorAll<HTMLElement>('.ask button');
      return asked[asked.length - 1];
    };
    const moved = {
      allDay: false,
      start: new Date('2026-11-04T18:00:00Z'),
      end: new Date('2026-11-04T19:00:00Z'),
    };

    it.each([
      ['This and all future events', 'THISANDFUTURE', { rrule: 'FREQ=WEEKLY;BYDAY=WE' }],
      ['Only this event', '', {}],
    ])('asks at once which occurrences move, and moves them: %s', async (choice, range, rule) => {
      const { root, writes, button, press, closed, updated } = await open({
        entry: WEEKLY,
        display,
        moved,
      });
      expect(root.querySelector('.ask')).not.toBeNull();
      expect(writes()).toEqual([]);

      await press(button(choice));
      await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
      expect(writes()).toEqual([
        {
          type: 'calendar/event/update',
          entity_id: 'calendar.ben',
          uid: 'u-swim',
          recurrence_id: '20261103T160000Z',
          recurrence_range: range,
          event: expect.objectContaining({
            summary: '🏊 Swim',
            dtstart: '2026-11-04T18:00:00Z',
            dtend: '2026-11-04T19:00:00Z',
            ...rule,
          }),
        },
      ]);
      if (!range) expect(writes()[0].event).not.toHaveProperty('rrule');
      expect(updated).toHaveBeenCalledWith('calendar.ben');
    });

    it.each([
      ['Cancel', (root: ShadowRoot) => lastAsk(root).click()],
      [
        'Escape',
        (root: ShadowRoot) =>
          root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })),
      ],
    ])('throws the move away on %s, writing nothing', async (_name, back) => {
      const { el, root, writes, closed, updated } = await open({
        entry: WEEKLY,
        display,
        moved,
      });
      expect(lastAsk(root).textContent?.trim()).toBe('Cancel');
      back(root);
      await el.updateComplete;

      await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
      expect(writes()).toEqual([]);
      expect(updated).not.toHaveBeenCalled();
    });

    it('offers Save for a series stored with its rule, writing the rule moved with it', async () => {
      const { entry, ...rest } = { entry: { ...SWIM, rrule: 'FREQ=WEEKLY;BYDAY=TU' }, display };
      const { root, writes, button, press, closed } = await open({ entry, ...rest, moved });
      expect(root.querySelector('.ask')).toBeNull();

      await press(button('Save'));
      await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
      expect(writes()).toEqual([
        {
          type: 'calendar/event/update',
          entity_id: 'calendar.ben',
          uid: 'u-swim',
          event: expect.objectContaining({
            dtstart: '2026-11-04T18:00:00Z',
            rrule: 'FREQ=WEEKLY;BYDAY=WE',
          }),
        },
      ]);
    });

    it('leaves a question asked about an ordinary change as it was', async () => {
      const { el, root, type, closed } = await open({ entry: WEEKLY, display });
      await type('input.title', 'Swim lesson');
      el.closeDialog();
      await el.updateComplete;
      lastAsk(root).click();
      await el.updateComplete;
      expect(root.querySelector('.ask')).toBeNull();
      expect(closed).not.toHaveBeenCalled();
    });
  });

  it("words its rule in Home Assistant's strings", async () => {
    const strings = {
      'ui.components.calendar.event.rrule.every': 'every',
      'ui.components.calendar.event.rrule.week': 'week',
      'ui.components.calendar.event.rrule.weeks': 'weeks',
      'ui.components.calendar.event.rrule.on': 'on',
    };
    const { root } = await open({ entry: WEEKLY, display }, { strings });
    expect(root.querySelector('.cell.time .sub')?.textContent).toBe('Every week on Tuesday');
  });
});

describe('deleting', () => {
  it('asks, then deletes a single event and refreshes its calendar', async () => {
    const { root, button, press, writes, updated, closed } = await open({});
    await press(button('Delete'));
    expect(root.querySelector('.ask b')?.textContent).toBe('Do you want to delete this event?');
    expect(writes()).toEqual([]);

    await press(button('Delete'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      { type: 'calendar/event/delete', entity_id: 'calendar.ben', uid: 'u-swim' },
    ]);
    expect(updated).toHaveBeenCalledWith('calendar.ben');
  });

  it('deletes the occurrences chosen of a repeating event', async () => {
    const { button, press, writes, closed } = await open({ entry: WEEKLY });
    await press(button('Delete'));
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      {
        type: 'calendar/event/delete',
        entity_id: 'calendar.ben',
        uid: 'u-swim',
        recurrence_id: '20261103T160000Z',
        recurrence_range: 'THISANDFUTURE',
      },
    ]);
  });

  it('keeps the popover open when the delete fails', async () => {
    const { root, button, press, closed } = await open(
      {},
      { write: async () => Promise.reject({ message: 'Not found' }) },
    );
    await press(button('Delete'));
    await press(button('Delete'));
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toBe('Not found'),
    );
    expect(closed).not.toHaveBeenCalled();
  });
});

describe('what an event may not do', () => {
  it('shows an event it may not change as text, and closes without writing', async () => {
    const { el, root, writes } = await open({ canEdit: false, canDelete: false });
    expect(root.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(root.querySelector('.cell.title')?.textContent).toBe('Swim');
    expect(root.querySelector('button.time')).toBeNull();
    expect(root.querySelector('.foot')).toBeNull();
    expect(el.closeDialog()).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('offers Delete alone where only deleting is allowed', async () => {
    const { root, buttons } = await open({ canEdit: false, canDelete: true });
    expect(root.querySelector('input.title')).toBeNull();
    expect(buttons('.foot button').map((b) => b.textContent?.trim())).toEqual(['Delete']);
  });
});

describe('a new event', () => {
  const times = {
    allDay: false,
    start: new Date('2026-11-04T09:00:00Z'),
    end: new Date('2026-11-04T10:00:00Z'),
  };
  const fresh: Partial<PopoverParams> = {
    mode: 'new',
    entry: undefined,
    display: undefined,
    times,
    canDelete: false,
    calendars: [BEN, ANNA],
  };

  it('opens in its title field by mouse or key, and adds nothing without a title', async () => {
    const { el, root, writes, closed } = await open(fresh);
    expect(root.activeElement).toBe(root.querySelector('input.title'));
    expect(el.closeDialog()).toBe(true);
    expect(writes()).toEqual([]);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('adds it on close, to the calendar picked', async () => {
    const { el, root, type, writes, updated } = await open(fresh);
    const picker = root.querySelector<HTMLSelectElement>('select')!;
    expect(Array.from(picker.options).map((o) => o.textContent?.trim())).toEqual(['Ben', 'Anna']);
    picker.value = 'calendar.anna';
    picker.dispatchEvent(new Event('change'));
    await type('input.title', 'Piano');

    expect(el.closeDialog()).toBe(false);
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith('calendar.anna'));
    expect(writes()).toEqual([
      {
        type: 'calendar/event/create',
        entity_id: 'calendar.anna',
        event: {
          summary: 'Piano',
          dtstart: '2026-11-04T09:00:00Z',
          dtend: '2026-11-04T10:00:00Z',
          description: '',
          location: '',
        },
      },
    ]);
    expect(updated).toHaveBeenCalledWith('calendar.anna');
  });

  it('has nothing to delete, and throws it away on Cancel once anything was typed', async () => {
    const { root, type, button, press, writes, closed } = await open(fresh);
    expect(root.querySelector('.foot')).toBeNull();
    await type('input.title', 'Piano');
    expect(
      Array.from(root.querySelectorAll('.foot button')).map((b) => b.textContent?.trim()),
    ).toEqual(['Cancel', 'Add']);
    await press(button('Cancel'));
    expect(writes()).toEqual([]);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('names its one calendar without a picker', async () => {
    const { root } = await open({ ...fresh, calendars: [BEN] });
    expect(root.querySelector('select')).toBeNull();
    expect(root.querySelector('.cell.calendar')?.textContent?.trim()).toBe('Ben');
  });
});

describe('links', () => {
  const description =
    'Plan: https://swim.example.com/plan and <a href="javascript:alert(1)">this</a>';

  it('links web addresses in the description, and nothing else', async () => {
    const { root } = await open({
      entry: { ...SWIM, description },
      display: { title: 'Swim', location: SWIM.location, description },
    });
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('.notes a'));
    expect(links.map((a) => [a.textContent, a.getAttribute('href'), a.target, a.rel])).toEqual([
      [
        'https://swim.example.com/plan',
        'https://swim.example.com/plan',
        '_blank',
        'noopener noreferrer',
      ],
    ]);
    expect(root.querySelector('.notes')?.textContent).toContain('this');
  });

  it('follows a link without editing, and edits the stored text on a press beside it', async () => {
    const { root, press } = await open({
      entry: { ...SWIM, description },
      display: { title: 'Swim', location: SWIM.location, description },
    });
    root
      .querySelector<HTMLAnchorElement>('.notes a')!
      .addEventListener('click', (ev) => ev.preventDefault());
    await press(root.querySelector('.notes a')!);
    expect(root.querySelector('textarea')).toBeNull();

    await press(root.querySelector('.notes')!);
    expect(root.querySelector('textarea')?.value).toBe(description);
  });

  it('links the location of an event it may not change', async () => {
    const location = 'Online: https://meet.example.com/swim';
    const { root } = await open({
      canEdit: false,
      entry: { ...SWIM, location },
      display: { title: 'Swim', location, description: '' },
    });
    expect(root.querySelector('.with-pin .text a')?.getAttribute('href')).toBe(
      'https://meet.example.com/swim',
    );
  });
});

describe('the map', () => {
  it('draws a place Home Assistant knows from its own tiles, and links it to Google Maps', async () => {
    const { root, callWS } = await open({}, { states: POOL_ZONE });
    await vi.waitFor(() => expect(root.querySelector('a.map-link')).not.toBeNull());
    const map = root.querySelector<HTMLAnchorElement>('a.map-link')!;
    expect(map.getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Riverside%20Pool',
    );
    const images = Array.from(map.querySelectorAll('img'));
    expect(images.length).toBeGreaterThan(0);
    expect(
      images.every((img) =>
        /^\/api\/map_tiles\/raster\/\d+\/\d+\/\d+\.png\?token=tok$/.test(img.getAttribute('src')!),
      ),
    ).toBe(true);
    // The credit sits beside the map's link, not in it, linking to OpenStreetMap's terms; a
    // zone owes Open-Meteo nothing.
    const credit = root.querySelector('.map > .attribution')!;
    expect(
      Array.from(credit.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([['OpenStreetMap', 'https://www.openstreetmap.org/copyright']]);
    expect(map.contains(credit)).toBe(false);
    // The map is the location's link now; the pin beside the text would be a second one.
    expect(root.querySelector('a.pin')).toBeNull();
    expect(callWS).toHaveBeenCalledWith({ type: 'map_tiles/access_token' });
  });

  it('shows a zone drawn around a city whole, and one around a spot up close', async () => {
    const zoomOf = (root: ShadowRoot) =>
      new Set(
        Array.from(root.querySelectorAll('a.map-link img')).map(
          (img) => Number(/raster\/(\d+)\//.exec(img.getAttribute('src')!)![1]) - dense,
        ),
      );
    const dense = window.devicePixelRatio >= 1.5 ? 1 : 0;
    const city = {
      'zone.hannover': {
        entity_id: 'zone.hannover',
        state: '0',
        attributes: { friendly_name: 'Hannover', latitude: 52.37, longitude: 9.73, radius: 13000 },
      },
    };
    const wide = await open(
      { display: { title: 'Swim', location: 'Hannover', description: '' } },
      { states: city },
    );
    await vi.waitFor(() => expect(wide.root.querySelector('a.map-link')).not.toBeNull());
    // 26 km across fits the 312-pixel map at zoom 10.
    expect(zoomOf(wide.root)).toEqual(new Set([10]));
    wide.el.remove();

    const close = await open({}, { states: POOL_ZONE });
    await vi.waitFor(() => expect(close.root.querySelector('a.map-link')).not.toBeNull());
    expect(zoomOf(close.root)).toEqual(new Set([15]));
  });

  it('draws no map, and asks nothing, for a street address', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { root, callWS } = await open(
      { display: { title: 'Swim', location: '12 Mill Road', description: '' } },
      { states: POOL_ZONE },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(root.querySelector('.map')).toBeNull();
    expect(root.querySelector('a.pin')?.getAttribute('href')).toContain('query=12%20Mill%20Road');
    expect(callWS).not.toHaveBeenCalled();
  });

  it('draws no map where Home Assistant has no tile proxy', async () => {
    const { root, callWS } = await open({}, { states: POOL_ZONE, tiles: false });
    await vi.waitFor(() => expect(callWS).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('.map')).toBeNull();
    expect(root.querySelector('a.pin')).not.toBeNull();
  });

  it('places a town Open-Meteo knows, and credits it beside OpenStreetMap', async () => {
    localStorage.removeItem('calendar-card-pro-places');
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            name: 'Rosenheim',
            latitude: 47.86,
            longitude: 12.12,
            country_code: 'DE',
            feature_code: 'PPLA3',
            population: 61844,
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetch);
    onTestFinished(() => {
      vi.unstubAllGlobals();
      localStorage.removeItem('calendar-card-pro-places');
    });
    const { root } = await open({
      // This Home Assistant names no home country, so the town needs its region beside it.
      display: { title: 'Swim', location: 'Rosenheim, Bayern', description: '' },
    });
    await vi.waitFor(() => expect(root.querySelector('a.map-link')).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);
    // A town is drawn closer than a city: zoom 13, one finer on a dense screen.
    const zooms = Array.from(root.querySelectorAll('a.map-link img')).map((img) =>
      Number(/raster\/(\d+)\//.exec(img.getAttribute('src')!)![1]),
    );
    expect(new Set(zooms)).toEqual(new Set([window.devicePixelRatio >= 1.5 ? 14 : 13]));
    const credit = root.querySelector('.map > .attribution')!;
    expect(Array.from(credit.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      'https://www.openstreetmap.org/copyright',
      'https://open-meteo.com/',
    ]);
  });

  it('looks nothing up for a new event, even one handed a place', async () => {
    // Nothing hands a new event a location today, so this gives it one: without it the test
    // would pass on the empty location alone and say nothing about new events.
    const { callWS } = await open(
      {
        mode: 'new',
        entry: undefined,
        display: { title: '', location: 'Riverside Pool', description: '' },
        calendars: [BEN],
      },
      { states: POOL_ZONE },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callWS).not.toHaveBeenCalled();
  });
});

describe('placing', () => {
  it('opens beside the event pressed, to its right where there is room', async () => {
    const { root } = await open({
      anchor: { x: 150, y: 215, rect: { left: 80, right: 300, top: 200, bottom: 230 } },
    });
    const dialog = root.querySelector('dialog')!;
    expect(dialog.classList.contains('popover')).toBe(true);
    expect(dialog.style.left).toBe('310px');
    expect(root.querySelector('.arrow.left')).not.toBeNull();
  });

  it('opens to its left where the right has no room', async () => {
    const { root } = await open({
      anchor: { x: 900, y: 215, rect: { left: 700, right: 980, top: 200, bottom: 230 } },
    });
    expect(root.querySelector('dialog')!.style.left).toBe(`${700 - 10 - 340}px`);
    expect(root.querySelector('.arrow.right')).not.toBeNull();
  });

  it('is a sheet from the bottom on a narrow screen', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      const { root } = await open({ anchor: { x: 100, y: 200 } });
      expect(root.querySelector('dialog')!.classList.contains('sheet')).toBe(true);
      expect(root.querySelector('.arrow')).toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });
});

/** A write Home Assistant answers only when the test says so. */
function deferredWrite() {
  let settle!: (fail?: unknown) => void;
  const write = vi.fn(
    () =>
      new Promise<unknown>((resolve, reject) => {
        settle = (fail?: unknown) => (fail ? reject(fail) : resolve(undefined));
      }),
  );
  return { write, settle: (fail?: unknown) => settle(fail) };
}

describe('while Home Assistant is saving', () => {
  it('takes no input, so nothing typed meanwhile is silently left out', async () => {
    const { write, settle } = deferredWrite();
    const { el, root, type, writes, closed } = await open({}, { write });
    await type('input.title', 'First');
    expect(el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('.panel')?.hasAttribute('inert')).toBe(true);

    const title = root.querySelector<HTMLInputElement>('input.title')!;
    title.value = 'Second';
    title.dispatchEvent(new Event('input'));
    settle();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].event).toMatchObject({ summary: 'First' });
  });

  it('closes on nothing else, and a delete Escape cannot call back still closes once', async () => {
    const { write, settle } = deferredWrite();
    const { el, root, button, press, writes, closed } = await open({}, { write });
    await press(button('Delete'));
    await press(button('Delete'));

    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(closed).not.toHaveBeenCalled();
    expect(root.querySelector('dialog')?.open).toBe(true);

    settle();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      { type: 'calendar/event/delete', entity_id: 'calendar.ben', uid: 'u-swim' },
    ]);
  });

  it.each([
    ['fails', { message: 'Calendar is read-only' }],
    ['succeeds', undefined],
  ])('leaves the event opened next alone when an earlier save %s', async (outcome, failure) => {
    const { write, settle } = deferredWrite();
    const { el, root, type, updated, closed } = await open({}, { write });
    await type('input.title', 'Swim lesson');
    el.closeDialog();

    // Home Assistant reuses the element for the next event before the first save is back.
    el.showDialog({
      mode: 'event',
      calendarId: ANNA.id,
      entry: { ...SWIM, summary: 'Piano', uid: 'u-piano' },
      display: { title: 'Piano', location: '', description: '' },
      canEdit: true,
      canDelete: true,
      calendars: [ANNA],
      language: 'en',
      hour24: true,
      dark: false,
      updated: () => undefined,
    });
    await el.updateComplete;
    settle(failure);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input.title')?.value).toBe('Piano');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('.panel')?.hasAttribute('inert')).toBe(false);
    expect(closed).not.toHaveBeenCalled();
    // A save that went through still refreshes the calendar it wrote to.
    expect(updated.mock.calls).toEqual(outcome === 'succeeds' ? [['calendar.ben']] : []);
  });
});

describe('a new event changed but not titled', () => {
  it('stays open and asks for a title rather than losing the change', async () => {
    const { el, root, writes, closed } = await open({
      mode: 'new',
      entry: undefined,
      display: undefined,
      times: {
        allDay: false,
        start: new Date('2026-11-04T09:00:00Z'),
        end: new Date('2026-11-04T10:00:00Z'),
      },
      canDelete: false,
      calendars: [BEN, ANNA],
    });
    const picker = root.querySelector<HTMLSelectElement>('select')!;
    picker.value = 'calendar.anna';
    picker.dispatchEvent(new Event('change'));
    await el.updateComplete;

    expect(el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'Not all required fields are filled in',
    );
    expect(writes()).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });
});

/**
 * Switching All day on and off again. Before, switching it off started the event at the hour
 * it was switched in, whatever times it had had: a slot tapped in a grid, or an event's own.
 */
describe('switching All day off again', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // An hour no event below starts at, so the current hour cannot pass for a restored one.
    vi.setSystemTime(new Date(2026, 10, 1, 7, 42));
  });
  afterEach(() => vi.useRealTimers());

  /** The popover opened and its time cell open, with a way to flip All day. */
  async function openTimes(params: Partial<PopoverParams>) {
    const opened = await open(params);
    await opened.press(opened.root.querySelector('button.time')!);
    const allDay = async (on: boolean) => {
      const toggle = opened.root.querySelector<HTMLInputElement>('input.switch')!;
      toggle.checked = on;
      toggle.dispatchEvent(new Event('change'));
      await opened.el.updateComplete;
    };
    const dates = () =>
      Array.from(opened.root.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    const shown = () =>
      Array.from(
        opened.root.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="time"]'),
      ).map((input) => input.value);
    return { ...opened, allDay, dates, shown };
  }

  const tapped = {
    mode: 'new' as const,
    entry: undefined,
    display: undefined,
    times: {
      allDay: false,
      start: new Date(2026, 10, 4, 15, 30),
      end: new Date(2026, 10, 4, 16, 30),
    },
    canDelete: false,
  };

  it('gives a new event back the slot it was tapped in, not the hour it is now', async () => {
    const { el, allDay, shown, type, writes } = await openTimes(tapped);
    await allDay(true);
    expect(shown()).toEqual(['2026-11-04', '2026-11-04']);
    await allDay(false);

    expect(shown()).toEqual(['2026-11-04', '15:30', '2026-11-04', '16:30']);
    await type('input.title', 'Swim');
    el.closeDialog();
    expect(writes()[0].event).toMatchObject({
      dtstart: new Date(2026, 10, 4, 15, 30).toISOString().slice(0, 19) + 'Z',
      dtend: new Date(2026, 10, 4, 16, 30).toISOString().slice(0, 19) + 'Z',
    });
  });

  it('gives an event its own times back, on the day it was moved to while all day', async () => {
    const { el, allDay, dates, shown } = await openTimes({});
    await allDay(true);
    const [startDate] = dates();
    startDate.value = '2026-11-05';
    startDate.dispatchEvent(new Event('change'));
    await el.updateComplete;
    await allDay(false);

    expect(shown()).toEqual(['2026-11-05', '16:00', '2026-11-05', '17:00']);
  });

  it('keeps an event that runs past midnight as it was', async () => {
    const { allDay, shown } = await openTimes({
      ...tapped,
      times: {
        allDay: false,
        start: new Date(2026, 10, 4, 23, 0),
        end: new Date(2026, 10, 5, 0, 30),
      },
    });
    await allDay(true);
    await allDay(false);

    expect(shown()).toEqual(['2026-11-04', '23:00', '2026-11-05', '00:30']);
  });

  it('gives back the times it had when All day was last switched on', async () => {
    const { el, root, allDay, shown } = await openTimes(tapped);
    await allDay(true);
    await allDay(false);
    const [startTime] = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="time"]'));
    startTime.value = '11:15';
    startTime.dispatchEvent(new Event('change'));
    await el.updateComplete;
    expect(shown()).toEqual(['2026-11-04', '11:15', '2026-11-04', '12:15']);

    await allDay(true);
    await allDay(false);
    expect(shown()).toEqual(['2026-11-04', '11:15', '2026-11-04', '12:15']);
  });

  it('starts a draft that began all day at the hour it is now, as before', async () => {
    const { allDay, shown } = await openTimes({
      ...tapped,
      times: { allDay: true, start: new Date(2026, 10, 4), end: new Date(2026, 10, 4) },
    });
    await allDay(false);

    expect(shown()).toEqual(['2026-11-04', '07:00', '2026-11-04', '08:00']);
  });

  it('forgets the times once the same popover opens again', async () => {
    // Home Assistant's dialog manager keeps the element and opens it again.
    const { el, root, allDay, shown, press } = await openTimes(tapped);
    await allDay(true);
    await allDay(false);
    expect(el.closeDialog()).toBe(true);
    await el.updateComplete;

    el.showDialog({
      mode: 'new',
      calendarId: BEN.id,
      times: { allDay: true, start: new Date(2026, 10, 4), end: new Date(2026, 10, 4) },
      canEdit: true,
      canDelete: false,
      color: BEN.color,
      calendars: [BEN],
      language: 'en',
      hour24: true,
      dark: false,
      updated: () => undefined,
    });
    await el.updateComplete;
    await press(root.querySelector('button.time')!);
    await allDay(false);

    expect(shown()).toEqual(['2026-11-04', '07:00', '2026-11-04', '08:00']);
  });
});

describe('moving a repeating event', () => {
  it('moves its weekday with it', async () => {
    const { el, root, type, press, button, writes, closed } = await open({ entry: WEEKLY });
    await press(root.querySelector('button.time')!);
    const [startDate] = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    startDate.value = '2026-11-04';
    startDate.dispatchEvent(new Event('change'));
    await el.updateComplete;
    await type('input.title', 'Swim lesson');

    el.closeDialog();
    await el.updateComplete;
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()[0].event).toMatchObject({
      dtstart: '2026-11-04T16:00:00Z',
      rrule: 'FREQ=WEEKLY;BYDAY=WE',
    });
  });
});

describe('the keyboard', () => {
  it('lands on the choices of a question, and back where it started once it is backed out of', async () => {
    const { el, root, type } = await open({ entry: WEEKLY });
    await type('input.title', 'Swim lesson');
    el.closeDialog();
    await el.updateComplete;
    await el.updateComplete;
    expect(root.activeElement).toBe(root.querySelector('.ask button'));

    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await el.updateComplete;
    await el.updateComplete;
    expect(root.activeElement).toBe(root.querySelector('h2#popover-title'));
  });

  it('reaches the description through a button, and leaves its text as text', async () => {
    const { el, root } = await open({});
    const notes = root.querySelector('.notes')!;
    expect(notes.getAttribute('role')).toBeNull();
    const edit = notes.querySelector<HTMLButtonElement>('button.reveal')!;
    expect(edit.getAttribute('aria-label')).toBe('Edit: Description');
    edit.click();
    await el.updateComplete;
    expect(root.querySelector('textarea')?.value).toBe('Bring goggles');
  });
});

describe('Cancel', () => {
  const foot = (root: ShadowRoot) =>
    Array.from(root.querySelectorAll('.foot button')).map((b) => [
      b.textContent?.trim(),
      b.classList.contains('end'),
    ]);

  it('appears with Save at the end of the row, beside Delete, once anything was changed', async () => {
    const { root, type } = await open({});
    expect(foot(root)).toEqual([['Delete', false]]);
    await type('input.title', 'Swim lesson');
    expect(foot(root)).toEqual([
      ['Delete', false],
      ['Cancel', true],
      ['Save', false],
    ]);
    expect(root.querySelector('.foot .btn.primary')?.textContent?.trim()).toBe('Save');
    // Typed back to what it was, there is nothing to cancel.
    await type('input.title', '🏊 Swim');
    expect(foot(root)).toEqual([['Delete', false]]);
  });

  it('throws every change away and closes, writing nothing', async () => {
    const { root, type, press, button, writes, closed, updated } = await open({});
    await type('input.title', 'Swim lesson');
    await type('input.plain', '12 Mill Road');
    await press(button('Cancel'));
    expect(writes()).toEqual([]);
    expect(updated).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(root.querySelector('dialog')?.open).not.toBe(true));
  });

  it('is never offered on an event that may not be changed', async () => {
    const { root } = await open({ canEdit: false, canDelete: false });
    expect(root.querySelector('.foot')).toBeNull();
  });
});

describe('opening and closing', () => {
  // As measured from a screen recording of Calendar on macOS.
  const css = () =>
    (customElements.get(EVENT_POPOVER_TAG) as unknown as { styles: { cssText: string } }).styles
      .cssText;
  const played = () => {
    const animate = vi.spyOn(HTMLElement.prototype, 'animate');
    onTestFinished(() => animate.mockRestore());
    return () =>
      animate.mock.calls.map(([keyframes, options]) => ({
        keyframes,
        options: options as KeyframeAnimationOptions,
      }));
  };

  it('grows out of its arrow from a tenth of its size, and fades in a little faster', () => {
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        css(),
      )?.[1] ?? '';
    for (const part of ['.panel', '.arrow']) {
      const animation = rule(`dialog.popover[open][data-placed] > ${part}`);
      expect(animation).toContain('230ms cubic-bezier(0.33, 1, 0.68, 1)');
      expect(animation).toContain('pop-fade 180ms cubic-bezier(0, 0, 0.58, 1)');
    }
    expect(css()).toMatch(/@keyframes pop-grow\s*\{\s*from\s*\{\s*transform:\s*scale\(0\.1\)/);
    // None of it where the system asks for less motion, the sheet included.
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*\}/.exec(
      css(),
    )?.[1];
    for (const selector of [
      'dialog.popover[open][data-placed] > .panel',
      'dialog.popover[open][data-placed] > .arrow',
      'dialog.sheet[open][data-placed] > .panel',
    ]) {
      expect(reduced).toContain(selector);
    }
  });

  it('starts growing only once it is placed, so none of it plays unseen', async () => {
    const { root } = await open({});
    const dialog = root.querySelector('dialog')!;
    expect(dialog.hasAttribute('data-placed')).toBe(true);
    expect(dialog.style.visibility).not.toBe('hidden');
  });

  it('tells Home Assistant at once, then shrinks toward its arrow and fades before it closes', async () => {
    const calls = played();
    const { el, root, closed } = await open({ anchor: { x: 150, y: 300 } });
    expect(root.querySelector('.arrow')).not.toBeNull();
    const dialog = root.querySelector('dialog')!;
    expect(el.closeDialog()).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    // Still drawn while it plays out, and nothing in it can be pressed.
    await el.updateComplete;
    expect(dialog.open).toBe(true);
    expect(root.querySelector('.panel')!.hasAttribute('inert')).toBe(true);
    expect(calls()).toEqual([
      {
        keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(0.15)' }],
        options: { duration: 180, easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'forwards' },
      },
      {
        keyframes: [{ opacity: 1 }, { opacity: 0 }],
        options: { duration: 180, easing: 'ease', fill: 'forwards' },
      },
      {
        keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(0.15)' }],
        options: { duration: 180, easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'forwards' },
      },
      {
        keyframes: [{ opacity: 1 }, { opacity: 0 }],
        options: { duration: 180, easing: 'ease', fill: 'forwards' },
      },
    ]);
    // A second request while it plays out is already answered.
    expect(el.closeDialog()).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(root.querySelector('.panel')).toBeNull();
  });

  it('closes at once where the system asks for less motion', async () => {
    const calls = played();
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (query: string) =>
          ({ matches: query.includes('prefers-reduced-motion: reduce') }) as MediaQueryList,
      );
    onTestFinished(() => media.mockRestore());
    const { el, root, closed } = await open({});
    el.closeDialog();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(root.querySelector('dialog')!.open).toBe(false);
    expect(calls()).toEqual([]);
  });

  it('sinks away as a sheet on a narrow screen', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    onTestFinished(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    });
    const calls = played();
    const { el, root } = await open({});
    expect(root.querySelector('dialog')!.classList.contains('sheet')).toBe(true);
    el.closeDialog();
    expect(calls()).toEqual([
      {
        keyframes: [
          { transform: 'none', opacity: 1 },
          { transform: 'translateY(24px)', opacity: 0 },
        ],
        options: { duration: 180, easing: 'ease-in', fill: 'forwards' },
      },
    ]);
  });

  it('opens afresh when opened again while it plays its way out', async () => {
    const animate = vi.spyOn(HTMLElement.prototype, 'animate');
    onTestFinished(() => animate.mockRestore());
    const { el, root, closed } = await open({});
    el.closeDialog();
    const leaving = animate.mock.results.map((result) => result.value as Animation);
    expect(leaving.length).toBeGreaterThan(0);
    el.showDialog({
      mode: 'event',
      calendarId: BEN.id,
      entry: { ...SWIM, summary: 'Piano', uid: 'u-piano' },
      display: { title: 'Piano', location: '', description: '' },
      canEdit: true,
      canDelete: true,
      calendars: [BEN],
      language: 'en',
      hour24: true,
      dark: false,
      updated: () => undefined,
    });
    await el.updateComplete;
    await el.updateComplete;
    // Well past the way out the first one was playing, the second is still open, unchanged.
    await new Promise((resolve) => setTimeout(resolve, 450));
    await el.updateComplete;
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input.title')?.value).toBe('Piano');
    expect(root.querySelector('.panel')!.hasAttribute('inert')).toBe(false);
    // The way out is canceled, not left filling: the panel is drawn again, not held shrunk.
    expect(leaving.map((animation) => animation.playState)).toEqual(leaving.map(() => 'idle'));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('the beak and the outline', () => {
  const css = () =>
    (customElements.get(EVENT_POPOVER_TAG) as unknown as { styles: { cssText: string } }).styles
      .cssText;
  // A rule's body by its exact selector, whitespace collapsed, so wrapping does not matter.
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css())?.[1] ?? '';
    return body.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')');
  };

  it('outlines the panel with one hairline, and no second ring outside it', () => {
    const panel = rule('.panel');
    // A half-pixel line just inside the edge, the one the beak's outline continues, and the
    // shadow below; no border and no ring outside.
    expect(panel).toContain(
      'box-shadow: inset 0 0 0 0.5px var(--pop-outline), 0 18px 50px rgba(0, 0, 0, 0.35);',
    );
    expect(panel.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/(^|;)\s*border:/);
  });

  it('points with a rounded beak whose outline continues the hairline', async () => {
    const { root } = await open({ anchor: { x: 150, y: 300 } });
    const arrow = root.querySelector('.arrow.left')!;
    expect(arrow.querySelector('.beak > .glass')).not.toBeNull();
    expect(arrow.querySelector('.beak > svg path')!.getAttribute('d')).toBe(BEAK_EDGE);
    // Its outline is the panel's own line, half a pixel wide.
    expect(rule('.beak path')).toMatch(/stroke:\s*var\(--pop-outline\);\s*stroke-width:\s*0\.5;/);
    // The glass is cut to the same curve, closed along the border's inner side.
    expect(rule('.glass')).toContain(`clip-path: path('${BEAK_EDGE}L15 7L0 7Z')`);
    // Drawn pointing up, and turned toward its side.
    expect(rule('.arrow.left .beak')).toContain('rotate(-90deg)');
    expect(rule('.arrow.right .beak')).toContain('rotate(90deg)');
    expect(rule('.arrow.bottom .beak')).toContain('rotate(180deg)');
  });
});

describe('placing at the press', () => {
  const arrowTop = (root: ShadowRoot) =>
    Number.parseFloat((root.querySelector('.arrow') as HTMLElement).style.top);
  const top = (root: ShadowRoot) => Number.parseFloat(root.querySelector('dialog')!.style.top);

  it('opens right at a pointer press, the arrow on it, whatever it was pressed on', async () => {
    // happy-dom lays nothing out; the panel is given the height a browser would measure.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    // A list row's title near the left of a row across the card: no box comes with the press.
    const { root } = await open({ anchor: { x: 150, y: 300 } });
    expect(root.querySelector('dialog')!.style.left).toBe(`${150 + 10}px`);
    expect(root.querySelector('.arrow.left')).not.toBeNull();
    expect(top(root) + arrowTop(root)).toBe(300);
  });

  it('grows out of its arrow as it opens', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const { root } = await open({ anchor: { x: 150, y: 300 } });
    const panel = root.querySelector<HTMLElement>('.panel')!;
    expect(panel.style.transformOrigin).toBe(`left ${arrowTop(root)}px`);
  });

  it('turns to the left of the press where the right has no room', async () => {
    const { root } = await open({ anchor: { x: 900, y: 300 } });
    expect(root.querySelector('dialog')!.style.left).toBe(`${900 - 10 - 340}px`);
    expect(root.querySelector('.arrow.right')).not.toBeNull();
  });

  it('opens beside the box a press without a position comes with, from the keyboard', async () => {
    // A wide box with no room on either side opens in the middle, without an arrow.
    const { root } = await open({
      anchor: { x: 590, y: 220, rect: { left: 80, right: 1000, top: 200, bottom: 240 } },
    });
    expect(root.querySelector('dialog')!.style.left).toBe(`${(window.innerWidth - 340) / 2}px`);
    expect(root.querySelector('.arrow')).toBeNull();
  });
});

describe('moving to another calendar', () => {
  const pick = async (root: ShadowRoot, el: Popover, id: string) => {
    const picker = root.querySelector<HTMLSelectElement>('.cell.calendar select')!;
    picker.value = id;
    picker.dispatchEvent(new Event('change'));
    await el.updateComplete;
  };

  it("offers the calendars the card names, the event's own first", async () => {
    const { root } = await open({ calendars: [BEN, ANNA] });
    const picker = root.querySelector<HTMLSelectElement>('.cell.calendar select')!;
    expect(Array.from(picker.options).map((o) => [o.value, o.selected])).toEqual([
      ['calendar.ben', true],
      ['calendar.anna', false],
    ]);
  });

  it('offers no picker on an event that may not be changed', async () => {
    const { root } = await open({ calendars: [BEN, ANNA], canEdit: false });
    expect(root.querySelector('.cell.calendar select')).toBeNull();
    expect(root.querySelector('.cell.calendar')?.textContent?.trim()).toBe('Ben');
  });

  it('adds the event to the new calendar, then deletes it from its own, and refreshes both', async () => {
    const { el, root, writes, updated, closed } = await open({ calendars: [BEN, ANNA] });
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      {
        type: 'calendar/event/create',
        entity_id: 'calendar.anna',
        event: {
          summary: '🏊 Swim',
          dtstart: '2026-11-03T16:00:00Z',
          dtend: '2026-11-03T17:00:00Z',
          description: 'Bring goggles',
          location: 'Riverside Pool',
        },
      },
      { type: 'calendar/event/delete', entity_id: 'calendar.ben', uid: 'u-swim' },
    ]);
    expect(updated).toHaveBeenCalledWith('calendar.anna', 'calendar.ben');
  });

  it('moves one occurrence of a repeating event as a single event', async () => {
    const { el, root, writes, closed, press, button } = await open({
      entry: WEEKLY,
      calendars: [BEN, ANNA],
    });
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await el.updateComplete;
    await press(button('Only this event'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()[0]).toMatchObject({
      type: 'calendar/event/create',
      entity_id: 'calendar.anna',
    });
    expect(writes()[0].event).not.toHaveProperty('rrule');
    expect(writes()[1]).toEqual({
      type: 'calendar/event/delete',
      entity_id: 'calendar.ben',
      uid: 'u-swim',
      recurrence_id: '20261103T160000Z',
      recurrence_range: '',
    });
  });

  it('moves a series from the occurrence pressed on, keeping a rule without a count', async () => {
    const { el, root, writes, closed, press, button } = await open({
      entry: WEEKLY,
      calendars: [BEN, ANNA],
    });
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await el.updateComplete;
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()[0].event).toMatchObject({ rrule: 'FREQ=WEEKLY;BYDAY=TU' });
    expect(writes()[1]).toMatchObject({
      type: 'calendar/event/delete',
      recurrence_range: 'THISANDFUTURE',
    });
  });

  it.each([
    ['ends after a count', { rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' }],
    ['was changed on its own, and so has no rule', { rrule: undefined }],
  ])('moves only the occurrence pressed of a series that %s', async (_name, change) => {
    const { el, root, writes, closed, press, button, buttons } = await open({
      entry: { ...WEEKLY, ...change },
      calendars: [BEN, ANNA],
    });
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await el.updateComplete;
    expect(buttons('.ask button').map((b) => b.textContent?.trim())).toEqual([
      'Only this event',
      'Cancel',
    ]);
    await press(button('Only this event'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()[0].event).not.toHaveProperty('rrule');
    expect(writes()[1]).toMatchObject({ type: 'calendar/event/delete', recurrence_range: '' });
  });

  it('writes nothing if the series of a counted rule is asked to move anyway', async () => {
    // The question does not offer it; the move checks again before it deletes anything.
    const { el, root, writes, closed } = await open({
      entry: { ...WEEKLY, rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' },
      calendars: [BEN, ANNA],
    });
    await pick(root, el, 'calendar.anna');
    (el as unknown as { _requestClose(mode: string, range: string): boolean })._requestClose(
      'save',
      'THISANDFUTURE',
    );
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    expect(writes()).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });

  it('moves a counted series whole once its end is set to a date', async () => {
    const { el, root, writes, closed, press, button, buttons } = await open({
      entry: { ...WEEKLY, rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' },
      calendars: [BEN, ANNA],
    });
    await pick(root, el, 'calendar.anna');
    await press(root.querySelector('button.time')!);
    const end = Array.from(root.querySelectorAll<HTMLSelectElement>('select')).find((select) =>
      Array.from(select.options).some((option) => option.value === 'on'),
    )!;
    end.value = 'on';
    end.dispatchEvent(new Event('change'));
    await el.updateComplete;
    el.closeDialog();
    await el.updateComplete;
    expect(buttons('.ask button').map((b) => b.textContent?.trim())).toContain(
      'This and all future events',
    );
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()[0].event).toMatchObject({
      rrule: expect.stringMatching(/^FREQ=WEEKLY;BYDAY=TU;UNTIL=\d{8}T\d{6}Z$/),
    });
    expect(writes()[1]).toMatchObject({ recurrence_range: 'THISANDFUTURE' });
  });

  it('still asks both for a change that stays in its calendar', async () => {
    const { el, type, buttons } = await open({
      entry: { ...WEEKLY, rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' },
      calendars: [BEN, ANNA],
    });
    await type('input.title', 'Swim lesson');
    el.closeDialog();
    await el.updateComplete;
    expect(buttons('.ask button').map((b) => b.textContent?.trim())).toEqual([
      'This and all future events',
      'Only this event',
      'Cancel',
    ]);
  });

  it('changes nothing and says why when the new calendar refuses the event', async () => {
    const { el, root, writes, closed } = await open(
      { calendars: [BEN, ANNA] },
      {
        write: async (message) =>
          message.type === 'calendar/event/create'
            ? Promise.reject({ message: 'Calendar is read-only' })
            : undefined,
      },
    );
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toBe('Calendar is read-only'),
    );
    expect(writes().map((w) => w.type)).toEqual(['calendar/event/create']);
    expect(closed).not.toHaveBeenCalled();
    expect(root.querySelector('.cell.calendar select')).not.toBeNull();
  });

  it('offers nothing more to write once it is in both calendars, after the delete failed', async () => {
    const { el, root, writes, updated, closed } = await open(
      { calendars: [BEN, ANNA] },
      {
        write: async (message) =>
          message.type === 'calendar/event/delete'
            ? Promise.reject({ message: 'Not found' })
            : undefined,
      },
    );
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await vi.waitFor(() =>
      expect(root.querySelector('[role="alert"]')?.textContent).toBe('Not found'),
    );
    expect(updated.mock.calls).toEqual([['calendar.anna']]);
    expect(root.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(root.querySelector('.foot')).toBeNull();

    expect(el.closeDialog()).toBe(true);
    expect(writes().map((w) => w.type)).toEqual(['calendar/event/create', 'calendar/event/delete']);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('Save and Add', () => {
  it('saves a change and closes, as closing the popover does', async () => {
    const { el, type, press, button, writes, closed, updated } = await open({});
    await type('input.title', 'Swim lesson');
    await press(button('Save'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([expect.objectContaining({ type: 'calendar/event/update' })]);
    expect(writes()[0].event).toMatchObject({ summary: 'Swim lesson' });
    expect(updated).toHaveBeenCalledWith('calendar.ben');
    expect(el.isConnected).toBe(true);
  });

  it('adds a new event', async () => {
    const { type, press, button, writes, closed } = await open({
      mode: 'new',
      entry: undefined,
      display: undefined,
      times: {
        allDay: false,
        start: new Date('2026-11-04T09:00:00Z'),
        end: new Date('2026-11-04T10:00:00Z'),
      },
      canDelete: false,
    });
    await type('input.title', 'Piano');
    await press(button('Add'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      expect.objectContaining({ type: 'calendar/event/create', entity_id: 'calendar.ben' }),
    ]);
  });

  it('asks which occurrences first, for a repeating event', async () => {
    const { root, type, press, button, writes } = await open({ entry: WEEKLY });
    await type('input.title', 'Swim lesson');
    await press(button('Save'));
    expect(root.querySelector('.ask')).not.toBeNull();
    expect(writes()).toEqual([]);
  });

  it('saves on Return in the title, but not while an input method composes', async () => {
    const { root, type, writes, closed } = await open({});
    await type('input.title', 'Swim lesson');
    const title = root.querySelector('input.title')!;
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    await Promise.resolve();
    expect(writes()).toEqual([]);
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
  });

  it("words both in Home Assistant's language", async () => {
    const { root, type } = await open(
      {},
      { strings: { 'ui.common.save': 'Speichern', 'ui.common.cancel': 'Abbrechen' } },
    );
    await type('input.title', 'Schwimmen');
    expect(
      Array.from(root.querySelectorAll('.foot button')).map((b) => b.textContent?.trim()),
    ).toEqual(['Delete', 'Abbrechen', 'Speichern']);
  });
});

describe('below a toolbar button', () => {
  const BUTTON = { left: 60, top: 100, right: 96, bottom: 136 };
  const heightIs = (px: number) => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
  };

  it('hangs below the button, its arrow on top pointing at the button', async () => {
    heightIs(400);
    const { root } = await open({ anchor: { x: 78, y: 118, rect: BUTTON, below: true } });
    const dialog = root.querySelector('dialog')!;
    // The arrow sits a little in from the left, under the button's middle.
    expect(dialog.style.left).toBe(`${78 - 32}px`);
    expect(dialog.style.top).toBe(`${136 + 10}px`);
    const arrow = root.querySelector<HTMLElement>('.arrow.top')!;
    expect(arrow.style.left).toBe('32px');
    expect(root.querySelector<HTMLElement>('.panel')!.style.transformOrigin).toBe('32px top');
  });

  it('keeps on screen at the left edge, the beak off its corner and still at the button', async () => {
    heightIs(400);
    const { root } = await open({
      anchor: { x: 20, y: 118, rect: { left: 4, top: 100, right: 36, bottom: 136 }, below: true },
    });
    expect(root.querySelector('dialog')!.style.left).toBe('12px');
    // 24 pixels in: the 16-pixel corner and half the beak's 15. Its near side, at 12 + 24 - 7.5,
    // still lies under the button, which ends at 36.
    expect(root.querySelector<HTMLElement>('.arrow.top')!.style.left).toBe('24px');
  });

  it('opens above the button where there is no room below', async () => {
    heightIs(400);
    const low = {
      left: 60,
      top: window.innerHeight - 60,
      right: 96,
      bottom: window.innerHeight - 24,
    };
    const { root } = await open({ anchor: { x: 78, y: low.top + 18, rect: low, below: true } });
    expect(root.querySelector('dialog')!.style.top).toBe(`${low.top - 10 - 400}px`);
    expect(root.querySelector('.arrow.bottom')).not.toBeNull();
  });
});

describe('the page behind', () => {
  // The shell holds the page still for every panel on it: the search panel's tests try each
  // gesture, and these only that the popover has it too.
  function wheel(target: EventTarget): boolean {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      composed: true,
      cancelable: true,
      deltaY: 120,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('does not scroll while the popover is open, and scrolls again once it has closed', async () => {
    const { el, root, closed } = await open({});
    const dialog = root.querySelector('dialog')!;

    expect(wheel(dialog)).toBe(true);
    expect(wheel(document.body)).toBe(true);
    expect(key(root.querySelector('h2#popover-title')!, 'PageDown')).toBe(true);
    expect(key(root.querySelector('h2#popover-title')!, ' ')).toBe(true);

    // Home Assistant hears it has closed at once, while it is still playing its way out: the
    // modal is open until then, and the page stays still with it.
    el.closeDialog();
    expect(closed).toHaveBeenCalled();
    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(wheel(document.body)).toBe(false);
    expect(key(document.body, 'PageDown')).toBe(false);
  });

  /** A key pressed on an element, and whether the popover stopped it scrolling the page. */
  function key(target: EventTarget, name: string): boolean {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('leaves each of its controls the keys it takes, and stops the page under the rest', async () => {
    const { root, press } = await open({});
    await press(root.querySelector('button.time')!);
    const toggle = root.querySelector<HTMLInputElement>('input.switch')!;
    const date = root.querySelector<HTMLInputElement>('input[type="date"]')!;
    const time = root.querySelector<HTMLInputElement>('input[type="time"]')!;
    const select = root.querySelector('select')!;

    // A switch takes Space, and nothing that pages.
    expect(key(toggle, ' ')).toBe(false);
    expect(key(toggle, 'ArrowDown')).toBe(true);
    expect(key(toggle, 'PageDown')).toBe(true);
    // A date, a time or a list of choices takes them all, to change its value.
    for (const control of [date, time, select]) {
      for (const name of [' ', 'ArrowDown', 'PageDown', 'End']) {
        expect(key(control, name)).toBe(false);
      }
    }
  });
});
