import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import { FROZEN_NOW } from './fixtures';
import type { PopoverRequest } from './popover-spy';
import type * as Types from '../src/config/types';
import { eventFields } from '../src/interaction/event-actions';
import { detailPermissions } from '../src/interaction/event-details';
import type { PopoverParams } from '../src/interaction/popover-model';
import { SearchSession } from '../src/interaction/search-session';
import { EVENT_POPOVER_TAG } from '../src/rendering/event-popover';
import * as EventUtils from '../src/utils/events';
import * as MonthDay from '../src/utils/month-day';
import { privateText } from '../src/utils/private-events';

/**
 * `private: true` on a calendar entry: its events show when they are and whose they are, and
 * nothing they say. Every word that comes from the event, its title, location and description,
 * is written into the fixtures with `SECRET` in it, so one search of everything the card and the
 * popover draw, attributes and accessible names included, proves none of it got out.
 */

const SECRET = 'SECRET';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

interface RawEvent {
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  uid?: string;
  status?: string;
  rrule?: string;
}

const ANNA_EVENTS: RawEvent[] = [
  {
    summary: 'Dentist',
    start: { dateTime: '2026-06-17T16:00:00Z' },
    end: { dateTime: '2026-06-17T17:00:00Z' },
    location: '12 High Street, Germany',
    description: 'Bring the referral',
    uid: 'uid-dentist',
  },
];

const BEN_EVENTS: RawEvent[] = [
  {
    summary: 'SECRET-TITLE Roadmap review',
    start: { dateTime: '2026-06-17T13:00:00Z' },
    end: { dateTime: '2026-06-17T14:00:00Z' },
    location: 'SECRET-PLACE Meeting Room 2',
    description: 'SECRET-NOTES the agenda https://example.com/SECRET-LINK',
    uid: 'uid-roadmap',
    status: 'tentative',
    rrule: 'FREQ=WEEKLY',
  },
  {
    summary: 'SECRET-ALLDAY Offsite',
    start: { date: '2026-06-18' },
    end: { date: '2026-06-19' },
    location: 'SECRET-PLACE Lakeside Hotel',
    uid: 'uid-offsite',
  },
  {
    summary: 'SECRET-LONG Conference trip',
    start: { dateTime: '2026-06-18T08:00:00Z' },
    end: { dateTime: '2026-06-19T20:00:00Z' },
    uid: 'uid-trip',
  },
  {
    summary: 'SECRET-BDAY Colleague birthday',
    start: { date: '2026-06-19' },
    end: { date: '2026-06-20' },
    description: 'YEAR=1976',
    uid: 'uid-birthday',
  },
];

interface Card extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  _searchHost(): ConstructorParameters<typeof SearchSession>[0] extends () => infer H ? H : never;
}

const PRIVATE_BEN = { entity: BEN, private: true };

function makeHass(anna = ANNA_EVENTS, ben = BEN_EVENTS): Types.Hass {
  const calendar = (id: string, name: string) => ({
    entity_id: id,
    state: 'off',
    attributes: { supported_features: 7, friendly_name: name },
  });
  return {
    states: { [ANNA]: calendar(ANNA, 'Anna'), [BEN]: calendar(BEN, 'Ben') },
    locale: { language: 'en', time_format: '24' },
    callApi: vi.fn(async (_method: string, path: string) =>
      path.startsWith(`calendars/${BEN}?`)
        ? ben
        : path.startsWith(`calendars/${ANNA}?`)
          ? anna
          : [],
    ),
    callService: vi.fn(),
  } as unknown as Types.Hass;
}

async function mount(
  config: Record<string, unknown>,
  shows = 'Dentist',
  events: { anna?: RawEvent[]; ben?: RawEvent[] } = {},
) {
  const card = document.createElement('calendar-card-pro-dev') as unknown as Card;
  card.setConfig({
    entities: [ANNA, PRIVATE_BEN],
    days_to_show: 3,
    show_location: true,
    show_description: true,
    event_tap_action: { action: 'details' },
    ...config,
  });
  card.hass = makeHass(events.anna, events.ben);
  const dialogs: PopoverRequest[] = [];
  card.addEventListener('show-dialog', (ev) =>
    dialogs.push((ev as Event & { detail: PopoverRequest }).detail),
  );
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.textContent).toContain(shows));
  await card.updateComplete;
  return { card, dialogs };
}

/** Every event root on the card whose text includes `text`. */
function eventsShowing(card: Card, text: string): HTMLElement[] {
  return Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>('.event')).filter((el) =>
    el.textContent?.includes(text),
  );
}

/** Every event button on the card whose text includes `text`: what a tap has to reach. */
function buttonsShowing(card: Card, text: string): HTMLElement[] {
  return Array.from(card.shadowRoot!.querySelectorAll<HTMLElement>('[role="button"]')).filter(
    (el) => el.textContent?.includes(text),
  );
}

async function openPopover(params: PopoverParams, callWS = vi.fn(async () => ({ token: 't' }))) {
  const el = document.createElement(EVENT_POPOVER_TAG) as HTMLElement & {
    hass?: Types.Hass;
    showDialog(params: PopoverParams): void;
    readonly updateComplete: Promise<boolean>;
  };
  el.hass = {
    states: {
      'zone.room': {
        entity_id: 'zone.room',
        state: '0',
        attributes: { friendly_name: 'SECRET-PLACE Meeting Room 2', latitude: 52, longitude: 13 },
      },
    },
    callWS,
    localize: () => '',
  } as unknown as Types.Hass;
  el.showDialog(params);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
  return { el, root: el.shadowRoot!, callWS };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a private calendar on the card', () => {
  it.each(['list', 'column', 'grid', 'month'])(
    'draws a lock and Private in place of every word of its events in %s',
    async (view) => {
      const { card } = await mount({ view });
      const root = card.shadowRoot!;

      // The control: the card drew Ben's events, and Anna's say what they are.
      expect(eventsShowing(card, 'Dentist').length).toBeGreaterThan(0);
      const privateRows = eventsShowing(card, 'Private');
      expect(privateRows.length).toBeGreaterThan(0);
      for (const row of privateRows) {
        expect(row.querySelector('.private-lock')).not.toBeNull();
        expect(row.textContent).not.toContain('(50)');
      }

      // Nowhere: not in text, not in an attribute, not in an accessible name.
      expect(root.innerHTML).not.toContain(SECRET);
      expect(eventsShowing(card, 'Dentist')[0].querySelector('.private-lock')).toBeNull();
    },
  );

  it('keeps its calendar’s color, label and name', async () => {
    const { card } = await mount({
      entities: [ANNA, { ...PRIVATE_BEN, label: '🅱️', accent_color: 'rgb(1, 2, 3)' }],
    });
    const row = eventsShowing(card, 'Private')[0];
    expect(row.textContent).toContain('🅱️');
    expect(row.getAttribute('style') ?? '').toContain('rgb(1, 2, 3)');
  });

  it('shows a whole-field replacement in place of Private, without the lock', async () => {
    const { card } = await mount({
      entities: [ANNA, { ...PRIVATE_BEN, replace_with: 'Busy' }],
    });
    const busy = eventsShowing(card, 'Busy');
    expect(busy.length).toBeGreaterThan(0);
    for (const row of busy) expect(row.querySelector('.private-lock')).toBeNull();
    expect(eventsShowing(card, 'Private')).toEqual([]);
    expect(card.shadowRoot!.innerHTML).not.toContain(SECRET);
  });

  it('does not apply a replacement with a pattern, which would show the rest', async () => {
    const { card } = await mount({
      entities: [ANNA, { ...PRIVATE_BEN, replace_pattern: 'SECRET-TITLE', replace_with: 'X' }],
    });
    expect(eventsShowing(card, 'Private').length).toBeGreaterThan(0);
    expect(card.shadowRoot!.innerHTML).not.toContain(SECRET);
  });

  it('never merges with a copy from a calendar that is not private', async () => {
    const shared = {
      summary: 'Team dinner',
      start: { dateTime: '2026-06-17T18:00:00Z' },
      end: { dateTime: '2026-06-17T20:00:00Z' },
    };
    ANNA_EVENTS.push(shared);
    BEN_EVENTS.push(shared);
    try {
      const { card } = await mount({
        filter_duplicates: true,
        entities: [
          { entity: ANNA, label: '🅰️' },
          { ...PRIVATE_BEN, label: '🅱️' },
        ],
      });
      const dinner = eventsShowing(card, 'Team dinner');
      expect(dinner).toHaveLength(1);
      expect(dinner[0].textContent).toContain('🅰️');
      expect(dinner[0].textContent).not.toContain('🅱️');
    } finally {
      ANNA_EVENTS.pop();
      BEN_EVENTS.pop();
    }
  });

  it('keeps a replaced location or description off the rows, and its link with it', async () => {
    const linked: RawEvent = {
      summary: 'SECRET-TITLE Vendor call',
      start: { dateTime: '2026-06-17T15:00:00Z' },
      end: { dateTime: '2026-06-17T15:30:00Z' },
      description: '<a href="https://example.com/SECRET-HREF">Office</a>',
      uid: 'uid-linked',
    };
    const { card, dialogs } = await mount(
      {
        open_links: true,
        entities: [ANNA, { ...PRIVATE_BEN, replace_field: 'description', replace_with: 'Office' }],
      },
      'Dentist',
      { ben: [linked] },
    );
    expect(card.shadowRoot!.innerHTML).not.toContain(SECRET);
    expect(eventsShowing(card, 'Office')).toEqual([]);

    // The popover shows the replacement, as it shows what it replaces.
    buttonsShowing(card, 'Private')[0].click();
    await vi.advanceTimersByTimeAsync(0);
    expect(dialogs[0].dialogParams.display?.description).toBe('Office');
    expect(JSON.stringify(dialogs[0].dialogParams)).not.toContain(SECRET);
  });

  describe('beside a copy of its event from a calendar that is not private', () => {
    const retreat = (start: RawEvent['start'], end: RawEvent['end']): RawEvent => ({
      summary: 'Team retreat',
      start,
      end,
    });

    it.each([
      ['listed first', 'anna-first'],
      ['listed last', 'ben-first'],
    ])('keeps every day of the private copy, the other calendar %s', async (_name, order) => {
      const event = retreat({ date: '2026-06-17' }, { date: '2026-06-20' });
      const anna = { entity: ANNA, split_multiday_events: false };
      const ben = { ...PRIVATE_BEN, split_multiday_events: true };
      const { card } = await mount(
        {
          filter_duplicates: true,
          entities: order === 'anna-first' ? [anna, ben] : [ben, anna],
        },
        'Team retreat',
        { anna: [event], ben: [event] },
      );
      expect(eventsShowing(card, 'Team retreat')).toHaveLength(1);
      expect(eventsShowing(card, 'Private')).toHaveLength(3);
    });

    it.each([
      ['listed first', 'anna-first'],
      ['listed last', 'ben-first'],
    ])('draws each copy as its own calendar says in grid, the other %s', async (_name, order) => {
      const event = retreat(
        { dateTime: '2026-06-17T06:00:00Z' },
        { dateTime: '2026-06-18T18:00:00Z' },
      );
      const anna = { entity: ANNA, multiday_banners: true };
      const ben = { ...PRIVATE_BEN, multiday_banners: false };
      const { card } = await mount(
        {
          view: 'grid',
          filter_duplicates: true,
          entities: order === 'anna-first' ? [anna, ben] : [ben, anna],
        },
        'Team retreat',
        { anna: [event], ben: [event] },
      );
      const banners = (text: string) =>
        eventsShowing(card, text).filter((el) => el.classList.contains('grid-banner'));
      expect(banners('Team retreat').length).toBeGreaterThan(0);
      expect(banners('Private')).toEqual([]);
      expect(eventsShowing(card, 'Private').length).toBeGreaterThan(0);
    });
  });

  it('is found by search as Private, never by its own words', async () => {
    const { card } = await mount({});
    const session = new SearchSession(() => card._searchHost(), {
      picked: () => undefined,
      gone: () => undefined,
    });
    expect(session.find('Dentist').total).toBe(1);
    const found = session.find('Private');
    expect(found.total).toBeGreaterThan(0);
    // Each one drawn after a lock in the panel.
    expect(found.groups.flatMap((group) => group.hits).map((hit) => hit.row.privateTitle)).toEqual(
      Array(found.total).fill(true),
    );
    for (const term of ['SECRET', 'Roadmap', 'Meeting Room', 'agenda', 'Offsite']) {
      expect(session.find(term).total).toBe(0);
    }
    // Nor does what a pick hands the card, which finds the event again by what it draws.
    expect(JSON.stringify(found.groups)).not.toContain(SECRET);
  });

  it('lists the day for a month’s panel as Private', () => {
    const config = {
      entities: [PRIVATE_BEN],
    } as unknown as Types.Config;
    const events = EventUtils.processEvents(
      BEN_EVENTS.map((event) => ({ ...event, _entityId: BEN })) as Types.CalendarEventData[],
      { ...config, show_location: true, show_description: true } as Types.Config,
    );
    const day = MonthDay.monthDayEvents(events, config, new Date(2026, 5, 17), 'en');
    expect(day.length).toBeGreaterThan(0);
    expect(
      JSON.stringify(
        day.map(({ summary, location, description }) => [summary, location, description]),
      ),
    ).not.toContain(SECRET);
  });
});

describe('a private calendar’s event popover', () => {
  it('is handed nothing the event says, and offers no change', async () => {
    const { card, dialogs } = await mount({});
    buttonsShowing(card, 'Private')[0].click();
    await vi.advanceTimersByTimeAsync(0);

    const params = dialogs[0].dialogParams;
    expect(JSON.stringify(params)).not.toContain(SECRET);
    expect(params.display).toEqual({
      title: 'Private',
      location: 'Private',
      description: 'Private',
    });
    expect(params.private).toEqual({ title: true, location: true, description: true });
    expect(params.canEdit).toBe(false);
    expect(params.canDelete).toBe(false);
    // Moving needs both, so it offers no other calendar.
    expect(params.calendars.map((calendar) => calendar.id)).toEqual([BEN]);
    // What it is still shown: when, how it repeats, whose.
    expect(params.entry).toMatchObject({
      dtstart: '2026-06-17T13:00:00Z',
      dtend: '2026-06-17T14:00:00Z',
      rrule: 'FREQ=WEEKLY',
    });
    expect(params.entry?.status).toBeUndefined();
  });

  it('draws a lock and Private for each field the event has, no map, and nothing to type in', async () => {
    const { card, dialogs } = await mount({});
    buttonsShowing(card, 'Private')[0].click();
    await vi.advanceTimersByTimeAsync(0);

    const { root, callWS } = await openPopover(dialogs[0].dialogParams);
    expect(root.innerHTML).not.toContain(SECRET);
    expect(root.querySelectorAll('.private-lock')).toHaveLength(3);
    expect(root.querySelector('input, textarea, select')).toBeNull();
    expect(root.querySelector('a.pin, a.map-link, .badge')).toBeNull();
    expect(callWS).not.toHaveBeenCalled();
  });

  it('leaves out a field the event does not have', async () => {
    const { card, dialogs } = await mount({ view: 'grid' });
    const offsite = eventsShowing(card, 'Private').find(
      (row) =>
        row.classList.contains('grid-banner') && !row.classList.contains('grid-banner-timed'),
    )!;
    offsite.click();
    await vi.advanceTimersByTimeAsync(0);
    const params = dialogs[0].dialogParams;
    expect(params.display).toEqual({ title: 'Private', location: 'Private', description: '' });
    expect(params.private).toEqual({ title: true, location: true, description: false });

    const { root } = await openPopover(params);
    expect(root.querySelectorAll('.private-lock')).toHaveLength(2);
  });

  it('shows a whole-field replacement without the lock', async () => {
    const { card, dialogs } = await mount({
      entities: [ANNA, { ...PRIVATE_BEN, replace_with: 'Busy' }],
    });
    buttonsShowing(card, 'Busy')[0].click();
    await vi.advanceTimersByTimeAsync(0);
    const params = dialogs[0].dialogParams;
    expect(params.display?.title).toBe('Busy');
    expect(params.private).toEqual({ title: false, location: true, description: true });

    const { root } = await openPopover(params);
    expect(root.querySelector('.cell.title')?.textContent?.trim()).toBe('Busy');
    expect(root.querySelector('.cell.title .private-lock')).toBeNull();
    expect(root.querySelectorAll('.private-lock')).toHaveLength(2);
  });
});

describe('what a private event leaves the card', () => {
  const privateEvent = (): Types.CalendarEventData => {
    const source = { ...BEN_EVENTS[0], _entityId: BEN } as Types.CalendarEventData;
    return {
      ...source,
      _entityId: BEN,
      _matchedConfig: { entity: BEN, private: true },
      _source: source as Types.CalendarEventData['_source'],
    };
  };

  it('is neither changed nor deleted, whatever the calendar allows', () => {
    const hass = makeHass();
    const event = privateEvent();
    const entry = {
      summary: 'Private',
      dtstart: '2026-06-17T13:00:00Z',
      dtend: '2026-06-17T14:00:00Z',
      uid: 'uid-roadmap',
    };
    const context = { allowEdit: true, allowDelete: true, failedEntities: [] };
    expect(detailPermissions(hass, event, entry, context)).toEqual({
      canEdit: false,
      canDelete: false,
    });
    // The control: the same event on a calendar that is not private.
    expect(
      detailPermissions(hass, { ...event, _matchedConfig: { entity: BEN } }, entry, context),
    ).toEqual({ canEdit: true, canDelete: true });
  });

  it('still reads its replacement where the event has no title', () => {
    const entry = { entity: BEN, private: true, replace_with: 'Busy' };
    expect(privateText({ summary: '' }, entry, 'en')).toMatchObject({
      title: 'Busy',
      location: '',
      description: '',
      locked: { title: false, location: false, description: false },
    });
    // Without one, it reads Private, so it does not say it has none.
    expect(privateText({}, { entity: BEN, private: true }, 'en').title).toBe('Private');
  });

  it('fills an action with what the popover shows', () => {
    const fields = eventFields(privateEvent(), 'en');
    expect(fields).toMatchObject({
      title: 'Private',
      location: 'Private',
      description: 'Private',
      start: '2026-06-17T13:00:00Z',
      calendar: BEN,
    });
    expect(JSON.stringify(fields)).not.toContain(SECRET);
  });
});
