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
  closeDialog(): Promise<boolean>;
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
  const updated = vi.fn((_calendarId?: string) => undefined);
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
    expect(await el.closeDialog()).toBe(true);
    expect(writes()).toEqual([]);
    expect(updated).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledWith({ dialog: EVENT_POPOVER_TAG });
  });

  it('writes a changed title once, on close, and refreshes the calendar', async () => {
    const { el, type, writes, closed, updated } = await open({});
    await type('input.title', 'Swim lesson');
    await type('input.plain', '12 Mill Road');
    expect(writes()).toEqual([]);

    expect(await el.closeDialog()).toBe(true);
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

    expect(await el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Calendar is read-only');
    expect(root.querySelector('dialog')?.open).toBe(true);

    answer = { code: 'failed' };
    expect(await el.closeDialog()).toBe(false);
    await el.updateComplete;
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Unknown error');
    expect(closed).not.toHaveBeenCalled();
  });

  it('refuses an end before the start without writing', async () => {
    const { el, root, writes, press } = await open({});
    await press(root.querySelector('button.time')!);
    const [, endTime] = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="time"]'));
    endTime.value = '15:00';
    endTime.dispatchEvent(new Event('change'));
    await el.updateComplete;

    expect(await el.closeDialog()).toBe(false);
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

    await el.closeDialog();
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

    expect(await el.closeDialog()).toBe(false);
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
    await el.closeDialog();
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
    expect(await el.closeDialog()).toBe(true);
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
    expect(await el.closeDialog()).toBe(true);
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

    expect(await el.closeDialog()).toBe(true);
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

  it('throws it away on Delete', async () => {
    const { type, button, press, writes, closed } = await open(fresh);
    await type('input.title', 'Piano');
    await press(button('Delete'));
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
