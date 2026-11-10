/**
 * A 12-hour clock reading in a right-to-left card.
 *
 * A 24-hour range is digits and punctuation, which a right-to-left line orders like a run of
 * numbers: start first, from the right. A 12-hour range carries AM and PM, strong left-to-right
 * letters, and the bidi algorithm grouped the first reading's meridiem with the dash and the
 * second reading instead of with its own digits, drawing "AM - 12:30 PM 11:30" in list, column
 * and grid view alike. `isolateClockReadings` makes each reading do what a number does in the
 * same place.
 *
 * happy-dom lays nothing out, so this file pins the decision and the characters written for it.
 * The layout those characters produce was measured in Chromium, Firefox and WebKit against the
 * 24-hour rendering of the same rows.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { languageDirection } from '../src/translations/language-codes';
import * as Localize from '../src/translations/localize';
import * as EventUtils from '../src/utils/events';
import { formatTime, isolateClockReadings } from '../src/utils/format';

const FSI = '\u2068';
const PDI = '\u2069';
const RLM = '\u200f';
const NBSP = '\u00a0';
/** A reading kept on one line: the space between its digits and its meridiem cannot break. */
const whole = (text: string) => text.replace(/(\d) ([AP]M)/g, `$1${NBSP}$2`);
const isolated = (reading: string) => `${FSI}${whole(reading)}${PDI}`;
const withoutMarks = (text: string) =>
  text.replace(/[\u2068\u2069\u200f]/g, '').replace(/\u00a0/g, ' ');

describe('isolateClockReadings', () => {
  it('isolates both readings of a range, and a start time on its own', () => {
    expect(isolateClockReadings('11:30 AM - 12:30 PM')).toBe(
      `${isolated('11:30 AM')} - ${isolated('12:30 PM')}`,
    );
    expect(isolateClockReadings('9:41 AM')).toBe(isolated('9:41 AM'));
  });

  it('isolates the grid axis\'s hour-only labels, which read "AM 9" in a right-to-left gutter', () => {
    expect(isolateClockReadings('9 AM')).toBe(isolated('9 AM'));
    expect(isolateClockReadings('12 PM')).toBe(isolated('12 PM'));
    expect(isolateClockReadings('9')).toBe('9');
  });

  it('leaves a reading after a left-to-right word as it is, as a number there joins the word', () => {
    // Isolated, the reading would be a neutral at the end of the line, and a right-to-left line
    // puts that at its far end: "12:30 AM Ends tomorrow at", where the tip already drew this right.
    expect(isolateClockReadings('Ends tomorrow at 12:30 AM')).toBe(
      whole('Ends tomorrow at 12:30 AM'),
    );
    expect(isolateClockReadings('10:30 PM, ends tomorrow at 12:30 AM')).toBe(
      `${isolated('10:30 PM')}, ends tomorrow at ${whole('12:30 AM')}`,
    );
    expect(isolateClockReadings('11:30 AM until Saturday, Oct 31 at 12:30 PM')).toBe(
      `${isolated('11:30 AM')} until Saturday, Oct 31 at ${whole('12:30 PM')}`,
    );
  });

  it('follows a reading after a right-to-left word with a right-to-left mark', () => {
    // A number after Hebrew counts as right-to-left for what follows it. An isolate alone counts
    // as neutral, which in a left-to-right card moves it past the end of the Hebrew run.
    expect(isolateClockReadings('10:30 PM, מסתיים מחר בשעה 12:30 AM')).toBe(
      `${isolated('10:30 PM')}, מסתיים מחר בשעה ${isolated('12:30 AM')}${RLM}`,
    );
  });

  it('judges an end drawn on its own by the text before it, skipping that text’s meridiems', () => {
    // Grid draws the droppable end as an element of its own. The AM before it is not a word: a
    // 24-hour range has nothing there, so the end is laid out as the start of a range is.
    expect(isolateClockReadings(' - 12:30 PM', '11:30 AM')).toBe(` - ${isolated('12:30 PM')}`);
    expect(isolateClockReadings(' 12:30 PM', 'until Saturday at')).toBe(whole(' 12:30 PM'));
  });

  it('changes no 24-hour text', () => {
    for (const text of [
      '11:30 - 12:30',
      '22:30, ends tomorrow at 0:30',
      '22:30, מסתיים מחר בשעה 0:30',
      '09:00',
    ]) {
      expect(isolateClockReadings(text)).toBe(text);
    }
  });

  it('matches every 12-hour reading formatTime writes, and no 24-hour one', () => {
    // Reconciled against the producer rather than against a list of examples: a reading the
    // pattern missed would be left exposed in a right-to-left card, with nothing else failing.
    const missed: string[] = [];
    let checked = 0;
    for (const twoDigitHours of [false, true]) {
      for (let minute = 0; minute < 24 * 60; minute++) {
        const date = new Date(2026, 5, 17, Math.floor(minute / 60), minute % 60);
        const twelve = formatTime(date, false, twoDigitHours);
        const twentyFour = formatTime(date, true, twoDigitHours);
        if (isolateClockReadings(twelve) !== isolated(twelve)) missed.push(twelve);
        if (isolateClockReadings(twentyFour) !== twentyFour) missed.push(twentyFour);
        checked += 1;
      }
    }
    expect(checked).toBe(2 * 24 * 60);
    expect(missed).toEqual([]);
  });

  it('keeps every 12-hour reading formatTime writes on one line, in either direction', () => {
    // Reconciled against the producer, as above: a breakable space left in any reading lets a
    // narrow row wrap between its digits and its meridiem, "12:30 / PM" (backlog item 138). The
    // pattern is UAX #14's own: a SPACE breaks after it, a NO-BREAK SPACE does not.
    const breakable: string[] = [];
    for (const twoDigitHours of [false, true]) {
      for (let minute = 0; minute < 24 * 60; minute++) {
        const date = new Date(2026, 5, 17, Math.floor(minute / 60), minute % 60);
        const twelve = formatTime(date, false, twoDigitHours);
        for (const before of ['', 'Ends tomorrow at ', 'מסתיים מחר בשעה ']) {
          const drawn = isolateClockReadings(twelve, before);
          if (/\d [AP]M/.test(drawn) || withoutMarks(drawn) !== twelve) breakable.push(drawn);
        }
      }
    }
    expect(breakable).toEqual([]);
    expect(isolateClockReadings('11:30 - 12:30')).not.toContain(NBSP);
  });

  it('reads each card language the way it is written', () => {
    // The direction is judged by a letter class, not a bidi lookup, so it is reconciled against
    // CLDR's own answer for every language the card ships, through the end-time phrase each one
    // writes. The right-to-left set is pinned by value, so a new one has to be added on purpose.
    const rtl: string[] = [];
    for (const [language, t] of Object.entries(Localize.TRANSLATIONS)) {
      // The method on Node 24, the getter on older runtimes, as for `getWeekInfo`.
      const locale = new Intl.Locale(language) as unknown as {
        getTextInfo?: () => { direction: string };
        textInfo?: { direction: string };
      };
      const info =
        typeof locale.getTextInfo === 'function' ? locale.getTextInfo() : locale.textInfo;
      const direction = info?.direction;
      expect(direction, `${language}: CLDR has no text direction`).toMatch(/^(ltr|rtl)$/);
      if (direction === 'rtl') rtl.push(language);
      // The card's own list of right-to-left languages, which decides where its words are
      // marked against the dashboard (text-direction.ts), answers as CLDR does for every one.
      expect(languageDirection(language), language).toBe(direction);
      const phrase = `${t.endsTomorrow} ${t.at} 12:30 AM`;
      const expected =
        direction === 'rtl'
          ? `${t.endsTomorrow} ${t.at} ${isolated('12:30 AM')}${RLM}`
          : whole(phrase);
      expect(isolateClockReadings(phrase), language).toBe(expected);
      expect(withoutMarks(isolateClockReadings(phrase)), language).toBe(phrase);
    }
    expect(rtl).toEqual(['he']);
  });
});

describe.each(['list', 'column', 'grid'] as const)('the %s time row', (view) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const EVENT: Types.CalendarEventData = {
    start: { dateTime: '2026-06-17T14:00:00.000Z' },
    end: { dateTime: '2026-06-17T15:00:00.000Z' },
    summary: 'Dentist',
    _entityId: 'calendar.personal',
  };

  function timeRow(overrides: Partial<Types.Config>): HTMLElement {
    const config = buildConfig({ view, days_to_show: 1, ...overrides });
    const effective = ViewConfig.resolveEffectiveConfig(config, view);
    const days = EventUtils.groupEventsByDay([EVENT], config, false, 'en', view);
    const container = document.createElement('div');
    litRender(
      view === 'grid'
        ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, new Date(FROZEN_NOW))
        : view === 'column'
          ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
          : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
      container,
    );
    const row = container.querySelector<HTMLElement>('.time .time-actual');
    expect(row, 'no time row rendered').not.toBeNull();
    return row!;
  }

  it('isolates each 12-hour reading, keeps it on one line, and adds nothing a reader sees', () => {
    const row = timeRow({ time_24h: false });
    // ASCII whitespace only: \s would also fold the NO-BREAK SPACE this pins.
    const text = row.textContent!.replace(/[ \t\n]+/g, ' ').trim();

    expect(text).toBe(`${isolated('2:00 PM')} - ${isolated('3:00 PM')}`);
    expect(withoutMarks(text)).toBe('2:00 PM - 3:00 PM');
    // Characters, not elements: the time stays the one span it always was.
    expect(row.querySelectorAll('bdi')).toHaveLength(0);
  });

  it('leaves a 24-hour row exactly as it was', () => {
    const row = timeRow({ time_24h: true });

    expect(row.textContent!.replace(/\s+/g, ' ').trim()).toBe('14:00 - 15:00');
  });

  if (view === 'grid') {
    it('keeps the droppable end a suffix, with its reading isolated inside it', () => {
      // grid-time-fit.ts measures and hides `.time-end`, so it must still hold the separator and
      // the whole end reading, and nothing of the start.
      const row = timeRow({ time_24h: false });
      const end = row.querySelector('.time-end');
      const head = [...(end?.parentElement?.childNodes ?? [])]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('');

      expect(end?.textContent).toBe(` - ${isolated('3:00 PM')}`);
      expect(head).toBe(isolated('2:00 PM'));
    });
  }
});
