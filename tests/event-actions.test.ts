import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import {
  EVENT_FIELDS,
  type EventField,
  eventActionKind,
  eventFields,
  fillEventAction,
} from '../src/interaction/event-actions';

/**
 * What an event action amounts to, and the tapped event's fields filled into one.
 *
 * The classification and the field list are pinned by value rather than walked, so an entry
 * leaving either fails here instead of quietly becoming `none` or an unfilled placeholder.
 * The card-level behavior, from a press to what Home Assistant receives, is in
 * `event-details.test.ts`.
 */

const FIELDS: Record<EventField, string> = {
  title: 'Swim & dive',
  start: '2026-06-17T14:00:00+02:00',
  end: '2026-06-17T15:00:00+02:00',
  all_day: 'false',
  location: 'Pool 1/B, Mill Road',
  description: 'Bring goggles',
  calendar: 'calendar.ben',
};

const action = (value: Record<string, unknown>) => value as unknown as Types.ActionConfig;

describe('eventActionKind', () => {
  it.each([
    ['details', { action: 'details' }, 'details'],
    ['none', { action: 'none' }, 'none'],
    ['expand', { action: 'expand' }, 'none'],
    ['refresh', { action: 'refresh' }, 'none'],
    ['add-event', { action: 'add-event' }, 'none'],
    ['reset', { action: 'reset' }, 'none'],
    ['more-info', { action: 'more-info' }, 'forward'],
    ['toggle', { action: 'toggle' }, 'forward'],
    ['navigate', { action: 'navigate' }, 'forward'],
    ['url', { action: 'url' }, 'forward'],
    ['perform-action', { action: 'perform-action' }, 'forward'],
    ['call-service', { action: 'call-service' }, 'forward'],
    ['assist', { action: 'assist' }, 'forward'],
    ['fire-dom-event', { action: 'fire-dom-event' }, 'forward'],
    ['an action Home Assistant adds later', { action: 'future-action' }, 'forward'],
    ['an empty action', { action: '' }, 'none'],
    ['no action key', {}, 'none'],
    ['a bare key', null, 'none'],
    ['nothing at all', undefined, 'none'],
  ] as const)('reads %s as %s', (_name, value, kind) => {
    expect(eventActionKind(value as Types.ActionConfig | null | undefined)).toBe(kind);
  });
});

describe('EVENT_FIELDS', () => {
  it('names exactly the documented fields', () => {
    expect([...EVENT_FIELDS]).toEqual([
      'title',
      'start',
      'end',
      'all_day',
      'location',
      'description',
      'calendar',
    ]);
  });
});

describe('fillEventAction', () => {
  it('percent-encodes fields in url_path and navigation_path only', () => {
    expect(
      fillEventAction(
        action({
          action: 'url',
          url_path: 'https://example.com/?q={title}&at={location}',
          note: '{title}',
        }),
        FIELDS,
      ),
    ).toEqual({
      action: 'url',
      url_path: 'https://example.com/?q=Swim%20%26%20dive&at=Pool%201%2FB%2C%20Mill%20Road',
      note: 'Swim & dive',
    });
    expect(
      fillEventAction(
        action({ action: 'navigate', navigation_path: '/lovelace/day?d={start}' }),
        FIELDS,
      ),
    ).toEqual({
      action: 'navigate',
      navigation_path: '/lovelace/day?d=2026-06-17T14%3A00%3A00%2B02%3A00',
    });
  });

  it('fills strings at any depth, keeps other values, and never fills a key or the action', () => {
    expect(
      fillEventAction(
        action({
          action: 'perform-action',
          perform_action: 'script.{calendar}',
          data: { '{title}': '{title}', list: ['{start}', 2, true, null], nested: { at: '{end}' } },
          target: { entity_id: '{calendar}' },
        }),
        FIELDS,
      ),
    ).toEqual({
      action: 'perform-action',
      perform_action: 'script.calendar.ben',
      data: {
        '{title}': 'Swim & dive',
        list: ['2026-06-17T14:00:00+02:00', 2, true, null],
        nested: { at: '2026-06-17T15:00:00+02:00' },
      },
      target: { entity_id: 'calendar.ben' },
    });
  });

  it("never fills a field into the action's own name", () => {
    // An event's title must not choose which action Home Assistant runs.
    expect(fillEventAction(action({ action: '{title}', note: '{title}' }), FIELDS)).toEqual({
      action: '{title}',
      note: 'Swim & dive',
    });
  });

  it('leaves names that are not fields as written, case included', () => {
    expect(
      fillEventAction(
        action({ action: 'fire-dom-event', a: '{Title} {unknown} {} {title', b: '{{title}}' }),
        FIELDS,
      ),
    ).toEqual({
      action: 'fire-dom-event',
      a: '{Title} {unknown} {} {title',
      b: '{Swim & dive}',
    });
  });

  it.each([
    ['javascript', 'javascript:alert("{title}")'],
    ['an uppercase scheme', 'JavaScript:alert("{title}")'],
    ['leading space', '  javascript:{title}'],
    ['data', 'data:text/html,{title}'],
    ['tel', 'tel:{title}'],
  ])('refuses a url action with %s once a field is filled into it', (_name, urlPath) => {
    expect(fillEventAction(action({ action: 'url', url_path: urlPath }), FIELDS)).toBeUndefined();
  });

  it('runs http, https and paths with a field, and any scheme the user wrote without one', () => {
    for (const urlPath of [
      'http://example.com/{title}',
      'HTTPS://example.com/{title}',
      '/x/{title}',
      '{title}',
    ]) {
      expect(fillEventAction(action({ action: 'url', url_path: urlPath }), FIELDS)).toBeDefined();
    }
    // No field in it: the user's own URL, as `tap_action` would hand it over.
    expect(fillEventAction(action({ action: 'url', url_path: 'tel:+4912345' }), FIELDS)).toEqual({
      action: 'url',
      url_path: 'tel:+4912345',
    });
    // A scheme only another key carries is not the URL's.
    expect(
      fillEventAction(
        action({ action: 'navigate', navigation_path: 'javascript:{title}' }),
        FIELDS,
      ),
    ).toBeDefined();
  });

  it('keeps a field from forming a scheme even where the URL starts with it', () => {
    const fields = { ...FIELDS, title: 'javascript:alert(1)' };
    expect(fillEventAction(action({ action: 'url', url_path: '{title}' }), fields)).toEqual({
      action: 'url',
      url_path: 'javascript%3Aalert(1)',
    });
  });
});

describe('eventFields', () => {
  const event = (overrides: Partial<Types.CalendarEventData>) =>
    ({
      summary: 'Row title (50)',
      start: { dateTime: '2026-06-18T00:00:00+02:00' },
      end: { dateTime: '2026-06-18T23:59:59+02:00' },
      _entityId: 'calendar.ben',
      ...overrides,
    }) as Types.CalendarEventData;

  it("reads the event's own text and whole interval from its source", () => {
    expect(
      eventFields(
        event({
          location: '',
          description: '',
          _source: {
            summary: 'Trip',
            start: { dateTime: '2026-06-17T20:00:00+02:00' },
            end: { dateTime: '2026-06-19T09:00:00+02:00' },
            location: 'Harbor',
            description: '<p>Ferry&nbsp;<b>at nine</b></p>',
          } as Types.CalendarEventData['_source'],
        }),
      ),
    ).toEqual({
      title: 'Trip',
      start: '2026-06-17T20:00:00+02:00',
      end: '2026-06-19T09:00:00+02:00',
      all_day: 'false',
      location: 'Harbor',
      description: 'Ferry\u00a0at nine',
      calendar: 'calendar.ben',
    });
  });

  it('gives an all-day event its dates, and reads a row without a source from itself', () => {
    expect(
      eventFields(
        event({ summary: 'Holiday', start: { date: '2026-06-18' }, end: { date: '2026-06-19' } }),
      ),
    ).toMatchObject({ title: 'Holiday', start: '2026-06-18', end: '2026-06-19', all_day: 'true' });
  });

  it("applies the calendar's text replacement to the field it names", () => {
    const source = {
      summary: 'Dentist',
      start: { dateTime: '2026-06-17T14:00:00Z' },
      end: { dateTime: '2026-06-17T15:00:00Z' },
      location: 'Dr. Example, 12 High Street',
      description: 'Referral',
    } as Types.CalendarEventData['_source'];

    const masked = eventFields(
      event({ _source: source, _matchedConfig: { entity: 'calendar.ben', replace_with: 'Busy' } }),
    );
    expect(masked).toMatchObject({
      title: 'Busy',
      location: 'Dr. Example, 12 High Street',
      description: 'Referral',
    });

    const location = eventFields(
      event({
        _source: source,
        _matchedConfig: {
          entity: 'calendar.ben',
          replace_field: 'location',
          replace_pattern: 'Dr\\. Example, ',
        },
      }),
    );
    expect(location).toMatchObject({ title: 'Dentist', location: '12 High Street' });
  });
});
