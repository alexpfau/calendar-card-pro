/**
 * A theme's date colors, and a card-mod rule on the date, reach the date (backlog item 310).
 *
 * The card wrote `--calendar-card-color-weekday`, `--calendar-card-color-day` and
 * `--calendar-card-color-month` on `ha-card` whether an option set them or not, and wrote the same
 * color and size inline on every `.weekday`, `.day` and `.month` as well. So a theme setting the
 * properties was hidden twice over, and a card-mod rule on a part needed `!important`. The colors
 * are now written on `ha-card` only where an option names one, and inline only where a day departs
 * from the card's own (a weekend's or today's color, today's tile).
 *
 * Mounted on the real card, with the theme set on the document's root as Home Assistant applies
 * one, so what is checked is the cascade a browser resolves rather than the strings the renderer
 * writes. Every value is distinct, so a part taking the wrong one fails too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type StoryCard, type StoryHass, mountStory, shadow } from './story-card';
import { DEFAULT_CONFIG } from '../src/config/config';
import { cardStyles } from '../src/rendering/styles';

/** Wednesday 17 June 2026. Thursday the 18th is a plain weekday, Saturday the 20th a weekend. */
const NOW = new Date('2026-06-17T08:00:00.000Z');

/**
 * What the theme sets on the document's root. Home Assistant's own text color is part of every
 * theme, and it matters here beyond realism: the card's shipped date colors name it, and happy-dom
 * drops a declaration whose `var()` names nothing rather than unsetting it, which would let a rule
 * win against an inline color that a browser would have kept.
 */
const THEME = {
  '--primary-text-color': 'rgb(33, 33, 33)',
  '--calendar-card-color-weekday': 'rgb(0, 160, 160)',
  '--calendar-card-color-day': 'rgb(200, 0, 200)',
  '--calendar-card-color-month': 'rgb(150, 110, 0)',
};

const FEED: StoryHass = {
  payload: {
    'calendar.anna': [
      {
        summary: 'Swim',
        start: { dateTime: '2026-06-18T17:00:00Z' },
        end: { dateTime: '2026-06-18T18:00:00Z' },
      },
      {
        summary: 'Hike',
        start: { dateTime: '2026-06-20T09:00:00Z' },
        end: { dateTime: '2026-06-20T12:00:00Z' },
      },
      {
        summary: 'Market',
        start: { dateTime: '2026-07-01T10:00:00Z' },
        end: { dateTime: '2026-07-01T11:00:00Z' },
      },
    ],
  },
};

const LIST = { type: 'custom:calendar-card-pro-dev', entities: ['calendar.anna'], days_to_show: 7 };
const MONTH = { ...LIST, view: 'month' };

/** The computed color of the first element `selector` finds in the card. */
function colorOf(card: StoryCard, selector: string): string {
  const element = shadow(card).querySelector(selector);
  expect(element, `${selector} is drawn`).not.toBeNull();
  return getComputedStyle(element!).color;
}

/** The weekday, number and month of the list's first row drawn on `day`. */
function listParts(card: StoryCard, day: number) {
  const cell = [...shadow(card).querySelectorAll('.date-column')].find(
    (element) => element.querySelector('.day')?.textContent?.trim() === String(day),
  );
  expect(cell, `the list draws the ${day}th`).toBeDefined();
  const color = (part: string) => getComputedStyle(cell!.querySelector(part)!).color;
  return { weekday: color('.weekday'), day: color('.day'), month: color('.month') };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  for (const [property, value] of Object.entries(THEME)) {
    document.documentElement.style.setProperty(property, value);
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  for (const property of Object.keys(THEME)) {
    document.documentElement.style.removeProperty(property);
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a theme's date colors", () => {
  it('reach every part of a list date where no option sets one', async () => {
    const card = await mountStory(LIST, FEED);

    expect(listParts(card, 18)).toEqual({
      weekday: THEME['--calendar-card-color-weekday'],
      day: THEME['--calendar-card-color-day'],
      month: THEME['--calendar-card-color-month'],
    });
  });

  it("reach a month's numbers, month names and weekday names", async () => {
    const card = await mountStory(MONTH, FEED);

    expect(colorOf(card, '.month-day:not(.today):not(.weekend) + .month-date > .day')).toBe(
      THEME['--calendar-card-color-day'],
    );
    expect(colorOf(card, '.month-date-month')).toBe(THEME['--calendar-card-color-month']);
    expect(colorOf(card, '.month-weekday:not(.weekend)')).toBe(
      THEME['--calendar-card-color-weekday'],
    );
  });

  it('give way to a color option, which the card still writes', async () => {
    const card = await mountStory({ ...LIST, day_color: 'rgb(190, 0, 0)' }, FEED);

    expect(listParts(card, 18)).toEqual({
      weekday: THEME['--calendar-card-color-weekday'],
      day: 'rgb(190, 0, 0)',
      month: THEME['--calendar-card-color-month'],
    });
  });

  it("give way to a day's own color", async () => {
    const card = await mountStory({ ...LIST, weekend_day_color: 'rgb(200, 100, 0)' }, FEED);

    expect(listParts(card, 20).day).toBe('rgb(200, 100, 0)');
    expect(listParts(card, 18).day).toBe(THEME['--calendar-card-color-day']);
  });

  it("give way to a day's own color even where it names the card's default", async () => {
    // Which color is a day's own is decided by the option it came from, not by its value.
    const card = await mountStory(
      { ...LIST, weekend_day_color: 'var(--primary-text-color)' },
      FEED,
    );

    expect(listParts(card, 20).day).toBe(THEME['--primary-text-color']);
    expect(listParts(card, 18).day).toBe(THEME['--calendar-card-color-day']);
  });
});

describe('a card-mod rule on the date and the title', () => {
  it('applies without !important where no day departs from the card', async () => {
    const card = await mountStory(LIST, FEED);
    const rule = document.createElement('style');
    rule.textContent =
      '.date-column .day { color: rgb(1, 2, 3); } .event .event-title { color: rgb(4, 5, 6); }';
    shadow(card).appendChild(rule);

    expect(listParts(card, 18).day).toBe('rgb(1, 2, 3)');
    expect(colorOf(card, '.event-title')).toBe('rgb(4, 5, 6)');
  });
});

describe("the stylesheet's fallback for each date color", () => {
  it.each([
    ['weekday_color', '--calendar-card-color-weekday'],
    ['day_color', '--calendar-card-color-day'],
    ['month_color', '--calendar-card-color-month'],
  ] as const)('is the %s default wherever %s is read', (option, property) => {
    // The card writes nothing for a color at its default, so the fallback is what every card
    // that sets none draws. A reader without one, or with another value, would draw something
    // the option's default does not say; and a changed default would leave the stylesheet behind.
    const css = cardStyles.cssText;
    const reads = css.match(new RegExp(`var\\(${property}(?=[,)])`, 'g')) ?? [];
    const withDefault = css.split(`var(${property}, ${DEFAULT_CONFIG[option]})`).length - 1;

    expect(reads.length).toBeGreaterThan(0);
    expect(withDefault).toBe(reads.length);
  });
});
