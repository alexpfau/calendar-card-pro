import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Types from '../src/config/types';
import { resetMapTilesToken } from '../src/interaction/event-map';
import type { PopoverParams } from '../src/interaction/popover-model';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';

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
  /** What Home Assistant's calendar REST API answers, for a series moved by its count. */
  occurrences?: unknown;
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
  const callApi = vi.fn(async (_method: string, _path: string) => options.occurrences ?? []);
  const closed = vi.fn();

  const el = document.createElement(EVENT_POPOVER_TAG) as Popover;
  el.hass = {
    states: options.states ?? {},
    callWS,
    callApi,
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
  return { el, root, callWS, callApi, updated, closed, writes, buttons, button, type, press };
}

afterEach(() => {
  document.body.innerHTML = '';
  resetMapTilesToken();
  vi.useRealTimers();
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

  it('opens on its title, and adds nothing without one', async () => {
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
    ).toEqual(['Cancel']);
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
    await vi.waitFor(() => expect(root.querySelector('a.map')).not.toBeNull());
    const map = root.querySelector<HTMLAnchorElement>('a.map')!;
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
    expect(map.textContent).toContain('© OpenStreetMap');
    // The map is the location's link now; the pin beside the text would be a second one.
    expect(root.querySelector('a.pin')).toBeNull();
    expect(callWS).toHaveBeenCalledWith({ type: 'map_tiles/access_token' });
  });

  it('draws no map, and asks nothing, for a place no zone is called', async () => {
    const { root, callWS } = await open(
      { display: { title: 'Swim', location: '12 Mill Road', description: '' } },
      { states: POOL_ZONE },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('a.map')).toBeNull();
    expect(root.querySelector('a.pin')?.getAttribute('href')).toContain('query=12%20Mill%20Road');
    expect(callWS).not.toHaveBeenCalled();
  });

  it('draws no map where Home Assistant has no tile proxy', async () => {
    const { root, callWS } = await open({}, { states: POOL_ZONE, tiles: false });
    await vi.waitFor(() => expect(callWS).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('a.map')).toBeNull();
    expect(root.querySelector('a.pin')).not.toBeNull();
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
    expect(dialog.style.left).toBe('314px');
    expect(root.querySelector('.arrow.left')).not.toBeNull();
  });

  it('opens to its left where the right has no room', async () => {
    const { root } = await open({
      anchor: { x: 900, y: 215, rect: { left: 700, right: 980, top: 200, bottom: 230 } },
    });
    expect(root.querySelector('dialog')!.style.left).toBe(`${700 - 14 - 340}px`);
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

  it('appears beside Delete, at the end of the row, once anything was changed', async () => {
    const { root, type } = await open({});
    expect(foot(root)).toEqual([['Delete', false]]);
    await type('input.title', 'Swim lesson');
    expect(foot(root)).toEqual([
      ['Delete', false],
      ['Cancel', true],
    ]);
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
    expect(root.querySelector('dialog')?.open).not.toBe(true);
  });

  it('is never offered on an event that may not be changed', async () => {
    const { root } = await open({ canEdit: false, canDelete: false });
    expect(root.querySelector('.foot')).toBeNull();
  });
});

describe('placing beside a wide event', () => {
  it('opens beside the press on an event wider than the popover, centered on the event', async () => {
    // A list row across the card, pressed on its title near the left.
    const { root } = await open({
      anchor: { x: 150, y: 210, rect: { left: 80, right: 1100, top: 200, bottom: 240 } },
    });
    const dialog = root.querySelector('dialog')!;
    expect(dialog.style.left).toBe(`${150 + 14}px`);
    expect(root.querySelector('.arrow.left')).not.toBeNull();
  });

  it('opens beside the middle of a wide event pressed from the keyboard', async () => {
    const { root } = await open({
      anchor: { x: 590, y: 220, rect: { left: 80, right: 1100, top: 200, bottom: 240 } },
    });
    expect(root.querySelector('dialog')!.style.left).toBe(`${590 + 14}px`);
  });

  it('turns to the left of the press where the right has no room', async () => {
    const { root } = await open({
      anchor: { x: 900, y: 210, rect: { left: 80, right: 1100, top: 200, bottom: 240 } },
    });
    expect(root.querySelector('dialog')!.style.left).toBe(`${900 - 14 - 340}px`);
    expect(root.querySelector('.arrow.right')).not.toBeNull();
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
    const { el, root, writes, closed, press, button, callApi } = await open({
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
    expect(callApi).not.toHaveBeenCalled();
  });

  it('ends a series counted in occurrences on its last one, read from the calendar', async () => {
    const counted = { ...WEEKLY, rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' };
    const occurrences = [
      // Another event, and the occurrence before the one pressed, are both left out.
      { uid: 'u-other', start: { dateTime: '2026-12-29T16:00:00+00:00' } },
      { uid: 'u-swim', start: { dateTime: '2026-10-27T16:00:00+00:00' } },
      { uid: 'u-swim', start: { dateTime: '2026-11-03T16:00:00+00:00' } },
      { uid: 'u-swim', start: { dateTime: '2026-11-10T16:00:00+00:00' } },
      { uid: 'u-swim', start: { dateTime: '2026-11-17T16:00:00+00:00' } },
    ];
    const { el, root, writes, closed, press, button, callApi } = await open(
      { entry: counted, calendars: [BEN, ANNA] },
      { occurrences },
    );
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await el.updateComplete;
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));

    const [method, path] = callApi.mock.calls[0];
    expect(method).toBe('GET');
    // From the occurrence pressed, as far as six weeks could reach.
    expect(path).toBe(
      `calendars/calendar.ben?start=${encodeURIComponent('2026-11-03T16:00:00.000Z')}&end=${encodeURIComponent('2026-12-16T16:00:00.000Z')}`,
    );
    expect(writes()[0].event).toMatchObject({
      rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261117T160000Z',
    });
  });

  it('moves nothing when the occurrence pressed is not among those the calendar lists', async () => {
    // Without it, the series would be written to end before it starts, and then deleted here.
    const counted = { ...WEEKLY, rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=6' };
    const occurrences = [{ uid: 'u-swim', start: { dateTime: '2026-10-27T16:00:00+00:00' } }];
    const { el, root, writes, closed, press, button } = await open(
      { entry: counted, calendars: [BEN, ANNA] },
      { occurrences },
    );
    await pick(root, el, 'calendar.anna');
    el.closeDialog();
    await el.updateComplete;
    await press(button('This and all future events'));
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    expect(writes()).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
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
