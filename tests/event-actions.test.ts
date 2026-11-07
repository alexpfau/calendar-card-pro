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
  it('percent-encodes fields in url_path and navigation_path, and only there', () => {
    expect(
      fillEventAction(
        action({
          action: 'url',
          url_path: 'https://example.com/?q={title}&at={location}#{description}',
          data: { note: '{title}' },
        }),
        FIELDS,
      ),
    ).toEqual({
      action: 'url',
      url_path:
        'https://example.com/?q=Swim%20%26%20dive&at=Pool%201%2FB%2C%20Mill%20Road#Bring%20goggles',
      data: { note: 'Swim & dive' },
    });
    expect(
      fillEventAction(
        action({ action: 'navigate', navigation_path: '/lovelace/{calendar}?d={start}' }),
        FIELDS,
      ),
    ).toEqual({
      action: 'navigate',
      navigation_path: '/lovelace/calendar.ben?d=2026-06-17T14%3A00%3A00%2B02%3A00',
    });
  });

  it('fills free text into data, service_data and a confirmation, at any depth', () => {
    expect(
      fillEventAction(
        action({
          action: 'perform-action',
          perform_action: 'script.{calendar}',
          data: { '{title}': '{title}', list: ['{start}', 2, true, null], nested: { at: '{end}' } },
          service_data: { where: '{location}' },
          target: { entity_id: '{calendar}' },
          confirmation: { text: 'Run for {title}?' },
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
      service_data: { where: 'Pool 1/B, Mill Road' },
      target: { entity_id: 'calendar.ben' },
      confirmation: { text: 'Run for Swim & dive?' },
    });
    // A popup another card opens, whose data sits one level down, is payload too.
    expect(
      fillEventAction(
        action({
          action: 'fire-dom-event',
          popup: { service: 'example.popup', data: { title: '{title}' } },
        }),
        FIELDS,
      ),
    ).toEqual({
      action: 'fire-dom-event',
      popup: { service: 'example.popup', data: { title: 'Swim & dive' } },
    });
  });

  /**
   * An event's title, location and description are written by whoever wrote the event, so
   * none of them may decide what an action does. Each row puts one where it would, and the
   * action must not run at all: filled, the event would choose the service, the device, the
   * site or the page.
   */
  it.each([
    ['the service', { action: 'perform-action', perform_action: '{title}' }],
    ['part of the service', { action: 'perform-action', perform_action: 'script.{title}' }],
    ['the legacy service', { action: 'call-service', service: '{title}' }],
    [
      'the target',
      {
        action: 'perform-action',
        perform_action: 'light.turn_on',
        target: { entity_id: '{location}' },
      },
    ],
    ['the entity', { action: 'more-info', entity: '{title}' }],
    [
      'a confirmation exemption',
      { action: 'toggle', confirmation: { text: 'ok', exemptions: [{ user: '{title}' }] } },
    ],
    ['a key of an unknown action', { action: 'fire-dom-event', name: '{title}' }],
    ['the host of a URL', { action: 'url', url_path: 'https://{location}/join' }],
    [
      'a path segment, where .. climbs out',
      { action: 'url', url_path: 'https://example.com/events/{title}/view' },
    ],
    ['the start of a URL', { action: 'url', url_path: '{title}' }],
    ['a navigation path', { action: 'navigate', navigation_path: '/lovelace/{title}/secret' }],
  ])('refuses free text in %s', (_name, value) => {
    expect(fillEventAction(action(value), FIELDS)).toBeUndefined();
    expect(
      fillEventAction(action(value), { ...FIELDS, title: '..', location: 'evil.example' }),
    ).toBeUndefined();
  });

  it("never fills a field into the action's own name", () => {
    // An event's title must not choose which action Home Assistant runs.
    expect(
      fillEventAction(action({ action: '{title}', data: { note: '{title}' } }), FIELDS),
    ).toEqual({
      action: '{title}',
      data: { note: 'Swim & dive' },
    });
  });

  it('leaves names that are not fields as written, case included', () => {
    expect(
      fillEventAction(
        action({
          action: 'fire-dom-event',
          a: '{Title} {unknown} {} {title',
          data: { b: '{{title}}' },
        }),
        FIELDS,
      ),
    ).toEqual({
      action: 'fire-dom-event',
      a: '{Title} {unknown} {} {title',
      data: { b: '{Swim & dive}' },
    });
  });

  it.each([
    ['javascript', 'javascript:alert("{start}")'],
    ['an uppercase scheme', 'JavaScript:alert("{start}")'],
    ['leading space', '  javascript:{start}'],
    ['data', 'data:text/html,{start}'],
    ['tel', 'tel:{start}'],
    ['javascript, with free text in its query', 'javascript:x()?{title}'],
  ])('refuses a url action with %s once a field is filled into it', (_name, urlPath) => {
    expect(fillEventAction(action({ action: 'url', url_path: urlPath }), FIELDS)).toBeUndefined();
  });

  it('runs http, https and paths with a field, and any scheme the user wrote without one', () => {
    for (const urlPath of [
      'http://example.com/{start}',
      'HTTPS://example.com/day/{start}?q={title}',
      '/x/{calendar}?q={title}',
      '?q={title}',
    ]) {
      expect(fillEventAction(action({ action: 'url', url_path: urlPath }), FIELDS)).toBeDefined();
    }
    // No field in it: the user's own URL, as `tap_action` would hand it over.
    expect(fillEventAction(action({ action: 'url', url_path: 'tel:+4912345' }), FIELDS)).toEqual({
      action: 'url',
      url_path: 'tel:+4912345',
    });
  });

  it('fills free text into a fragment that has no query before it', () => {
    expect(
      fillEventAction(
        action({ action: 'navigate', navigation_path: '/lovelace/plan#{title}' }),
        FIELDS,
      ),
    ).toEqual({ action: 'navigate', navigation_path: '/lovelace/plan#Swim%20%26%20dive' });
  });

  it('keeps a field from adding a parameter, a fragment or a path to a query', () => {
    const fields = { ...FIELDS, title: 'a&b=c#d/../e?f' };
    expect(
      fillEventAction(
        action({ action: 'url', url_path: 'https://example.com/s?q={title}' }),
        fields,
      ),
    ).toEqual({ action: 'url', url_path: 'https://example.com/s?q=a%26b%3Dc%23d%2F..%2Fe%3Ff' });
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
