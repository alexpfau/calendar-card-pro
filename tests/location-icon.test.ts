/**
 * The location row's icon: `location_icon`, the built-in Microsoft Teams detection, and
 * the default marker.
 *
 * ## Why Teams and nothing else
 *
 * The reason is checkable rather than a matter of taste, and it is asserted at the bottom
 * of this file against MDI's own metadata: **Material Design Icons ships a brand icon for
 * Teams and for no competitor.** Zoom, Google Meet and Webex could not be given a logo
 * here even if they were detected, so detecting them would buy a wrong icon rather than a
 * right one. `location_icon` is the answer for everyone else.
 *
 * ## Why the brand substring and not the English phrase
 *
 * Teams localizes the location text. The words around the brand name are translated and
 * reordered — `Microsoft Teams-Besprechung`, `Réunion Microsoft Teams`, `Riunione di
 * Microsoft Teams` — and the brand name itself is not. Matching `Microsoft Teams Meeting`
 * would have detected English tenants only, which is the failure this file exists to stop
 * from coming back.
 *
 * The strings below are the real ones, taken from Microsoft's localization documentation
 * and from `.ics` files published by Microsoft's own PnP repositories. The URL form is
 * real too: some calendars store the join link rather than a phrase.
 *
 * ## Where it is resolved
 *
 * `presentation.ts`, not `leaves.ts` — one answer shared by both views. The end-to-end
 * cases here go through the real render so that the wiring is covered and not just the
 * predicate; a pure-function suite would stay green if nothing ever called it.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import {
  LOCATION_ICON,
  TEAMS_LOCATION_ICON,
  isTeamsLocation,
  resolveLocationIcon,
} from '../src/utils/format';

/**
 * The location text Teams writes, per locale.
 *
 * Every one of these carries `Microsoft Teams` as a contiguous substring; that is the
 * property the detection rests on, and these cases are what make it falsifiable.
 */
const LOCALIZED: ReadonlyArray<[string, string]> = [
  ['English', 'Microsoft Teams Meeting'],
  ['German', 'Microsoft Teams-Besprechung'],
  ['French', 'Réunion Microsoft Teams'],
  ['Spanish', 'Reunión de Microsoft Teams'],
  ['Dutch', 'Microsoft Teams-vergadering'],
  ['Italian', 'Riunione di Microsoft Teams'],
  ['Japanese', 'Microsoft Teams の会議'],
];

/** The join-URL shapes, for calendars that store a link instead of a phrase. */
const URLS: ReadonlyArray<[string, string]> = [
  ['commercial', 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZWQyNjRlMmU'],
  ['government', 'https://teams.microsoft.us/l/meetup-join/19%3ameeting_ZWQyNjRlMmU'],
  ['consumer', 'https://teams.live.com/meet/9312345678'],
];

function timedEvent(summary: string, extra: Partial<Types.CalendarEventData> = {}) {
  return {
    start: { dateTime: '2026-06-17T09:00:00.000Z' },
    end: { dateTime: '2026-06-17T10:00:00.000Z' },
    summary,
    _entityId: 'calendar.work',
    ...extra,
  } as Types.CalendarEventData;
}

/**
 * The icon actually rendered beside the location, through the real pipeline.
 *
 * @param events - Events to draw
 * @param overrides - Card configuration
 * @returns The `icon` attribute of each location row's icon, in order
 */
function renderedLocationIcons(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
): string[] {
  const config = buildConfig(overrides) as Types.Config;
  const days = EventUtils.groupEventsByDay(events, config, false, 'en');
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, 'en', undefined, null), container);

  return Array.from(container.querySelectorAll('.location ha-icon')).map(
    (icon) => icon.getAttribute('icon') ?? '',
  );
}

describe('Teams detection', () => {
  it.each(LOCALIZED)('recognises the %s location text', (_locale, location) => {
    expect(isTeamsLocation(location)).toBe(true);
  });

  it.each(URLS)('recognises a %s Teams join URL', (_cloud, url) => {
    expect(isTeamsLocation(url)).toBe(true);
  });

  it('recognises the hybrid form Outlook writes for a room booked alongside a call', () => {
    // Outlook puts the room first and appends the Teams phrase after a semicolon, so an
    // anchored match would miss every hybrid meeting — which is most of them in an office.
    expect(isTeamsLocation('Conference Room A; Microsoft Teams Meeting')).toBe(true);
  });

  it('tolerates the non-breaking space some clients emit between the two words', () => {
    expect(isTeamsLocation('Microsoft\u00a0Teams Meeting')).toBe(true);
  });

  it('ignores case, because the phrase is not always title-cased', () => {
    expect(isTeamsLocation('microsoft teams meeting')).toBe(true);
  });

  it.each([
    ['a physical room', 'Room 4.02'],
    ['an address', '1 Microsoft Way, Redmond'],
    ['a Zoom link', 'https://zoom.us/j/123456789'],
    ['a Meet link', 'https://meet.google.com/abc-defg-hij'],
    ['the vendor alone', 'Microsoft'],
    ['the product alone', 'Teams'],
    ['nothing at all', ''],
  ])('leaves %s alone', (_what, location) => {
    // The negatives matter as much as the positives: a detection that fired on everything
    // would pass every case above. `Microsoft` and `Teams` separately are the sharp ones —
    // a visit to a Microsoft office is not a Teams call, and neither is a sports fixture.
    expect(isTeamsLocation(location)).toBe(false);
  });
});

describe('location icon resolution', () => {
  it('gives a Teams meeting the Teams icon and everything else the marker', () => {
    expect(resolveLocationIcon('Microsoft Teams Meeting')).toBe(TEAMS_LOCATION_ICON);
    expect(resolveLocationIcon('Room 4.02')).toBe(LOCATION_ICON);
  });

  it('lets a configured icon win over the detection', () => {
    // Which is also the opt-out, and the reason no second key exists for one: a user who
    // wants the plain marker back on a Teams calendar names the marker.
    expect(resolveLocationIcon('Microsoft Teams Meeting', 'mdi:video')).toBe('mdi:video');
    expect(resolveLocationIcon('Microsoft Teams Meeting', LOCATION_ICON)).toBe(LOCATION_ICON);
  });

  it('applies a configured icon to every location, not only to unrecognised ones', () => {
    expect(resolveLocationIcon('Room 4.02', 'mdi:office-building')).toBe('mdi:office-building');
  });

  it('falls back to the marker for an empty configured value', () => {
    // The editor writes an absent key rather than an empty string, and normalization maps
    // `''` to undefined — but the resolver is the last line and must not emit `icon=""`.
    expect(resolveLocationIcon('Room 4.02', '')).toBe(LOCATION_ICON);
  });
});

describe('the icon the card actually draws', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the default marker, exactly as it did before this option existed', () => {
    // The compatibility case. Every card in the wild has no `location_icon` and no Teams
    // meeting, and must be byte-identical — the DOM snapshot gates say so too, and this
    // says it in a form that names the icon.
    expect(renderedLocationIcons([timedEvent('Standup', { location: 'Room 4.02' })])).toEqual([
      'mdi:map-marker-outline',
    ]);
  });

  it('draws the Teams icon for a Teams meeting with no configuration at all', () => {
    // The silent visual change on upgrade, asserted rather than described: this is what
    // existing users see the first time they load 4.1 with a Teams meeting on the card.
    expect(
      renderedLocationIcons([timedEvent('Standup', { location: 'Microsoft Teams-Besprechung' })]),
    ).toEqual(['mdi:microsoft-teams']);
  });

  it('draws this calendar’s icon when it names one', () => {
    expect(
      renderedLocationIcons(
        [
          timedEvent('Standup', {
            location: 'Room 4.02',
            _matchedConfig: { entity: 'calendar.work', location_icon: 'mdi:office-building' },
          }),
        ],
        { entities: [{ entity: 'calendar.work', location_icon: 'mdi:office-building' }] },
      ),
    ).toEqual(['mdi:office-building']);
  });

  it('lets one calendar override the detection while another keeps it', () => {
    // The per-calendar half, which is where the option earns its keep: the two blocks a
    // **Duplicate** produces resolve independently, so a Teams block can carry the Teams
    // icon while a second block of the same calendar carries something else.
    const teamsBlock = { entity: 'calendar.work' };
    const roomBlock = { entity: 'calendar.work', location_icon: 'mdi:office-building' };

    expect(
      renderedLocationIcons(
        [
          timedEvent('Standup', {
            location: 'Microsoft Teams Meeting',
            _matchedConfig: teamsBlock,
          }),
          timedEvent('Retro', {
            location: 'Microsoft Teams Meeting',
            _matchedConfig: roomBlock,
          }),
        ],
        { entities: [teamsBlock, roomBlock], filter_duplicates: false },
      ),
    ).toEqual(['mdi:microsoft-teams', 'mdi:office-building']);
  });

  it('draws no location row at all when the calendar hides locations', () => {
    // The control that stops the two cases above from passing for the wrong reason. With
    // `show_location: false` the row is absent, so there is no icon to be right or wrong —
    // a resolver that ran anyway and emitted a stray icon would show up here.
    expect(
      renderedLocationIcons([timedEvent('Standup', { location: 'Microsoft Teams Meeting' })], {
        show_location: false,
      }),
    ).toEqual([]);
  });
});

describe('the premise the feature rests on', () => {
  /**
   * MDI ships a Teams icon and no competitor's.
   *
   * Asserted against the icon set Home Assistant itself renders from, so the claim in the
   * docs — *"MDI ships a brand icon for Teams and not for Zoom, Meet or Webex"* — is
   * checked rather than repeated. If a future MDI adds a Zoom icon this fails, and the
   * decision not to detect Zoom is worth revisiting rather than silently outdated.
   *
   * Read from the installed `@mdi/js` package: it exports one `mdi`-prefixed camelCase
   * constant per icon, which is exactly the set of icons a user can name.
   */
  it('has a Teams icon available and none for Zoom, Meet or Webex', async () => {
    const mdi = await import('@mdi/js');
    const names = Object.keys(mdi);

    // The denominator. Against an empty import every absence below would "pass".
    expect(names.length, 'the icon set imported as empty').toBeGreaterThan(1000);

    expect(names).toContain('mdiMicrosoftTeams');
    expect(names).not.toContain('mdiZoom');
    expect(names).not.toContain('mdiGoogleMeet');
    expect(names).not.toContain('mdiWebex');
    expect(names).not.toContain('mdiCiscoWebex');

    // And the constant this card names is the one that exists.
    expect(TEAMS_LOCATION_ICON).toBe('mdi:microsoft-teams');
  });
});
