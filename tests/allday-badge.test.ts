import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * `allday_badge` — drawing the all-day label as its own pill instead of as plain words.
 *
 * This file exists because the rest of the suite cannot see this option. Every DOM gate is
 * built from default config, the option defaults to `false`, and a `false` boolean renders
 * nothing — so the entire feature is invisible to `list-dom` and `column-dom` no matter how
 * thorough those are. Everything here turns it on.
 *
 * The four rows of the truth table are the point. "All-day" is not the same question as
 * "spans one day": a timed meeting running Wednesday 09:00 to Friday 17:00 is not an all-day
 * event and must not get the badge, but with `split_multiday_events` on, its **Thursday**
 * segment occupies that whole day and does. `splitMultiDayEvent` encodes exactly that by
 * rewriting middle days as `start: { date }`, which is why the plain all-day check gets all
 * four rows right and no extra predicate is needed.
 */

const CALENDAR = 'calendar.personal';

function serialize(container: HTMLElement): string {
  return container.innerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '').replace(/<!---->/g, '');
}

function renderList(
  events: Types.CalendarEventData[],
  config: Types.Config,
  language = 'en',
): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, language);
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, language), container);
  return container;
}

/** iCal all-day ends are exclusive, so a single-day event on the 18th ends on the 19th. */
function allDayEvent(start: string, endExclusive: string, summary: string) {
  return {
    start: { date: start },
    end: { date: endExclusive },
    summary,
    _entityId: CALENDAR,
  };
}

function timedEvent(start: string, end: string, summary: string) {
  return {
    start: { dateTime: start },
    end: { dateTime: end },
    summary,
    _entityId: CALENDAR,
  };
}

/** The event row carrying a given title, so assertions can be scoped to one event. */
function rowFor(container: ParentNode, title: string): Element {
  const titles = Array.from(container.querySelectorAll('.event-title')).filter(
    (element) => element.textContent?.trim() === title,
  );
  expect(titles.length).toBeGreaterThan(0);
  const row = titles[0].closest('td.event');
  expect(row).not.toBeNull();
  return row as Element;
}

/** Every row for a title, in document order — a split event contributes one per day. */
function rowsFor(container: ParentNode, title: string): Element[] {
  return Array.from(container.querySelectorAll('.event-title'))
    .filter((element) => element.textContent?.trim() === title)
    .map((element) => element.closest('td.event'))
    .filter((row): row is Element => row !== null);
}

function badgeIn(row: ParentNode): Element | null {
  return row.querySelector('.allday-badge');
}

/** The time row's text with the badge removed, so the remainder can be asserted alone. */
function timeTextIn(row: ParentNode): string {
  const timeActual = row.querySelector('.time-actual');
  if (!timeActual) return '';
  const clone = timeActual.cloneNode(true) as Element;
  clone.querySelector('.allday-badge')?.remove();
  clone.querySelector('ha-icon')?.remove();
  return clone.textContent?.trim() ?? '';
}

describe('allday_badge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the option is genuinely off by default', () => {
    it('renders no badge, and the label stays in the time text', () => {
      const config = buildConfig({ days_to_show: 5 });
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config);

      expect(badgeIn(rowFor(container, 'Bin day'))).toBeNull();
      expect(timeTextIn(rowFor(container, 'Bin day'))).toBe('All day');
    });

    it('leaves the multi-day phrase joined by a comma', () => {
      const config = buildConfig({ days_to_show: 8, split_multiday_events: false });
      const container = renderList([allDayEvent('2026-06-18', '2026-06-21', 'Festival')], config);

      expect(timeTextIn(rowFor(container, 'Festival'))).toBe('All day, until Saturday, Jun 20');
    });
  });

  describe('which events qualify', () => {
    const config = () =>
      buildConfig({ allday_badge: 'tinted', days_to_show: 8, split_multiday_events: false });

    it('badges a single-day all-day event, leaving no time text beside it', () => {
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());
      const row = rowFor(container, 'Bin day');

      expect(badgeIn(row)?.textContent).toBe('all day');
      // Nothing follows the label, so there is no empty span left behind to lay out.
      expect(timeTextIn(row)).toBe('');
      expect(row.querySelectorAll('.time-actual > span')).toHaveLength(1);
    });

    it('badges a multi-day all-day event and drops the comma before the remainder', () => {
      const container = renderList([allDayEvent('2026-06-18', '2026-06-21', 'Festival')], config());
      const row = rowFor(container, 'Festival');

      expect(badgeIn(row)?.textContent).toBe('all day');
      expect(timeTextIn(row)).toBe('until Saturday, Jun 20');
      // The joined form must not survive anywhere in the row.
      expect(row.textContent).not.toContain('All day,');
    });

    it('does not badge an unsplit timed multi-day event', () => {
      const container = renderList(
        [timedEvent('2026-06-17T17:00:00.000Z', '2026-06-22T10:00:00.000Z', 'Conference')],
        config(),
      );
      const row = rowFor(container, 'Conference');

      expect(badgeIn(row)).toBeNull();
      expect(timeTextIn(row)).toContain('until');
    });

    it('badges the middle segment of a split timed multi-day event, but not its ends', () => {
      const container = renderList(
        [timedEvent('2026-06-17T09:00:00.000Z', '2026-06-19T17:00:00.000Z', 'Offsite')],
        buildConfig({ allday_badge: 'tinted', days_to_show: 8, split_multiday_events: true }),
      );
      const rows = rowsFor(container, 'Offsite');

      // Three days: a timed first, an all-day middle, a timed last.
      expect(rows).toHaveLength(3);
      expect(badgeIn(rows[0])).toBeNull();
      expect(badgeIn(rows[1])?.textContent).toBe('all day');
      expect(badgeIn(rows[2])).toBeNull();
    });

    it('does not badge an ordinary timed event', () => {
      const container = renderList(
        [timedEvent('2026-06-18T09:00:00.000Z', '2026-06-18T10:00:00.000Z', 'Dentist')],
        config(),
      );

      expect(badgeIn(rowFor(container, 'Dentist'))).toBeNull();
    });
  });

  describe('how the badge is drawn', () => {
    const config = () => buildConfig({ allday_badge: 'tinted', days_to_show: 5 });

    it('sits outside .time-text, where the time_max_lines clamp cannot truncate it', () => {
      // The clamp selector is `.time .time-actual .time-text > span`. A badge inside
      // `.time-text` would match it and be line-clamped like body text, so this pins the
      // structural choice rather than the styling that depends on it.
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.parentElement?.classList.contains('time-actual')).toBe(true);
      expect(badge?.closest('.time-text')).toBeNull();
    });

    it('keeps the label in its natural case, leaving uppercase to CSS', () => {
      // Uppercasing in the DOM would reach the accessibility tree, where some screen
      // readers spell capitals out letter by letter.
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());

      expect(badgeIn(rowFor(container, 'Bin day'))?.textContent).toBe('all day');
    });

    it('declares the language, which is what makes the CSS uppercase correct', () => {
      // Greek loses its tonos in capitals, and a browser only applies that rule when the
      // language is declared. Without `lang` the badge would read ΟΛΟΉΜΕΡΟ.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        config(),
        'el',
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.getAttribute('lang')).toBe('el');
      expect(badge?.textContent).toBe('Ολοήμερο');
    });

    it('republishes the calendar accent color, which no descendant could otherwise read', () => {
      // The accent reaches the row as an inline `border-inline-start` value. The badge
      // carries its own copy so the stylesheet can blend it.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({
          allday_badge: 'tinted',
          days_to_show: 5,
          entities: [{ entity: CALENDAR, accent_color: '#ff0000' }],
        }),
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.getAttribute('style')?.replace(/\s/g, '')).toContain(
        '--calendar-card-event-accent:#ff0000',
      );
    });

    it('localizes the label', () => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        config(),
        'de',
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.textContent).toBe('ganztägig');
    });
  });

  describe('the four treatments', () => {
    const modes = ['outline', 'soft', 'tinted', 'filled'];

    it.each(modes)('draws %s as its own class, so the stylesheet can tell them apart', (mode) => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({ allday_badge: mode, days_to_show: 5 }),
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge).not.toBeNull();
      expect(badge?.className).toBe(`allday-badge allday-badge-${mode}`);
    });

    it('renders no badge for a value outside the closed set', () => {
      // The failure this guards is `getTodayIndicatorType`'s: there `'none'` DRAWS a dot,
      // because every unmatched string reached the default. A value that reads as off must
      // never turn the feature on, so the table is closed and anything outside it is off.
      for (const value of ['none', 'off', 'Tinted!', 'true', '', 'solid']) {
        const container = renderList(
          [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
          buildConfig({ allday_badge: value, days_to_show: 5 }),
        );

        expect(badgeIn(rowFor(container, 'Bin day')), value).toBeNull();
      }
    });

    it('still honours the boolean the option shipped as', () => {
      // Live test cards on the maintainer's dashboard say `allday_badge: true`; dropping the
      // boolean would blank them silently rather than loudly.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({ allday_badge: true, days_to_show: 5 }),
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.className).toContain('allday-badge-tinted');
    });

    it('is case- and whitespace-tolerant, because YAML is', () => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({ allday_badge: '  Filled  ', days_to_show: 5 }),
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.className).toContain('allday-badge-filled');
    });
  });

  describe('the option reaches the DOM at all', () => {
    it('changes the rendered markup, so the assertions above are not vacuous', () => {
      const events = [allDayEvent('2026-06-18', '2026-06-21', 'Festival')];
      const off = serialize(renderList(events, buildConfig({ days_to_show: 8 })));
      const on = serialize(
        renderList(events, buildConfig({ allday_badge: 'tinted', days_to_show: 8 })),
      );

      expect(off).not.toBe(on);
      expect(off).not.toContain('allday-badge');
      expect(on).toContain('allday-badge');
    });
  });
});
