/**
 * `buildQuickSetupConfig` and the answers Quick Setup starts from (backlog item 188).
 *
 * Outputs are pinned whole: Quick Setup rewrites a card's YAML, so a key it should have kept,
 * dropped or replaced is the defect, and only a comparison of the whole result sees all three.
 */
import { describe, expect, it } from 'vitest';

import { CURRENT_CONFIG_VERSION } from '../src/config/config';
import {
  type QuickSetupAnswers,
  answersForStory,
  buildQuickSetupConfig,
  initialAnswers,
  storyColors,
} from '../src/rendering/editor/quick-setup';
import { STORIES, storyById } from '../src/rendering/editor/stories';

const OPENING: Record<string, unknown> = {
  type: 'custom:calendar-card-pro',
  config_version: CURRENT_CONFIG_VERSION,
  title: 'Our Week',
  entities: [
    'calendar.anna',
    { entity: 'calendar.ben', accent_color: '#123456' },
    { entity: 'calendar.anna', event_type: 'all_day' },
    'calendar.leo',
  ],
  show_location: false,
  column: { min_day_width: '100px' },
  grid_options: { columns: 'full', rows: 'auto' },
  view_layout: { position: 'main' },
  card_mod: { style: 'ha-card { border: none; }' },
  _description: 'from the picker',
};

const ONE_WEATHER = { 'weather.home': {}, 'calendar.anna': {} };

describe('buildQuickSetupConfig', () => {
  it('builds the Family Hub on this card’s calendars, keeping what the card does not own', () => {
    const answers = initialAnswers(OPENING, 'family_hub', ONE_WEATHER);

    expect(buildQuickSetupConfig(OPENING, answers)).toEqual({
      type: 'custom:calendar-card-pro',
      config_version: CURRENT_CONFIG_VERSION,
      title: 'Our Week',
      view: 'grid',
      days_to_show: 7,
      event_gap: '4px',
      filter_duplicates: true,
      duplicate_accent_color: '#ffb74d',
      weather: { entity: 'weather.home' },
      toolbar: { show: true, legend: 'chips', reset: true },
      event_tap_action: { action: 'details' },
      day_tap_action: { action: 'add-event' },
      // Anna's two blocks stay together, in first-listed order; Ben keeps his own color.
      entities: [
        { entity: 'calendar.anna', accent_color: '#ff6c92' },
        { entity: 'calendar.anna', event_type: 'all_day', accent_color: '#ff6c92' },
        { entity: 'calendar.ben', accent_color: '#123456' },
        { entity: 'calendar.leo', accent_color: '#03a9f4' },
      ],
      list: { days_to_show: 3 },
      column: {
        min_days_to_show: 3,
        show_past_events: true,
        past_event_opacity: 40,
        event_background_opacity: 15,
      },
      time_grid: { start_time: '07:00', end_time: '22:00', hour_height: '36px' },
      grid_options: { columns: 'full', rows: 'auto' },
      view_layout: { position: 'main' },
      card_mod: { style: 'ha-card { border: none; }' },
    });
  });

  it.each(STORIES.map((story) => story.id))(
    'writes every line of %s and nothing the story does not say',
    (id) => {
      const answers = initialAnswers({ entities: ['calendar.anna'] }, id, ONE_WEATHER);
      const built = buildQuickSetupConfig({ entities: ['calendar.anna'] }, answers);
      const shell = storyById(id).shell();

      for (const [key, value] of Object.entries(shell)) {
        if (key === 'weather') continue;
        expect(built[key], key).toEqual(value);
      }
      expect(Object.keys(built).sort()).toEqual(
        [...Object.keys(shell), 'config_version', 'entities'].sort(),
      );
    },
  );

  it('answers no to weather and taps by leaving those lines out, and hides the toolbar', () => {
    const answers: QuickSetupAnswers = {
      ...initialAnswers(OPENING, 'family_hub', ONE_WEATHER),
      weather: '',
      toolbar: false,
      eventDetails: false,
      dayAdds: false,
    };
    const built = buildQuickSetupConfig(OPENING, answers);

    expect(built).not.toHaveProperty('weather');
    expect(built).not.toHaveProperty('event_tap_action');
    expect(built).not.toHaveProperty('day_tap_action');
    // Kept, hidden, so switching the toolbar on later brings back the story's own.
    expect(built.toolbar).toEqual({ show: false, legend: 'chips', reset: true });
    expect(
      buildQuickSetupConfig(OPENING, {
        ...initialAnswers(OPENING, 'now_and_next', {}),
        toolbar: false,
      }),
    ).not.toHaveProperty('toolbar');
  });

  it('overrides a leaf of the story’s weather and toolbar, never the whole block', () => {
    const answers: QuickSetupAnswers = {
      ...initialAnswers(OPENING, 'today_and_tomorrow', {}),
      weather: 'weather.cabin',
      toolbar: true,
    };
    const built = buildQuickSetupConfig(OPENING, answers);

    expect(built.weather).toEqual({
      entity: 'weather.cabin',
      position: 'both',
      event: { show_conditions: false },
    });
    expect(built.toolbar).toEqual({ show: true, view_switcher: false, legend: false });
  });

  it('keeps the story’s own actions that Quick Setup does not ask about', () => {
    const built = buildQuickSetupConfig(
      OPENING,
      initialAnswers(OPENING, 'now_and_next', ONE_WEATHER),
    );

    expect(built.tap_action).toEqual({ action: 'expand' });
    expect(built.event_hold_action).toEqual({ action: 'details' });
    expect(built).not.toHaveProperty('event_tap_action');
    expect(built).not.toHaveProperty('weather');
  });

  it('keeps a development card a development card', () => {
    const opening = { ...OPENING, type: 'custom:calendar-card-pro-dev' };

    expect(buildQuickSetupConfig(opening, initialAnswers(opening, 'family_hub', {})).type).toBe(
      'custom:calendar-card-pro-dev',
    );
  });

  it('brings a calendar’s blocks back when it is removed and added again', () => {
    const answers = initialAnswers(OPENING, 'now_and_next', {});
    const without = buildQuickSetupConfig(OPENING, {
      ...answers,
      calendars: ['calendar.ben', 'calendar.leo'],
    });
    const again = buildQuickSetupConfig(OPENING, {
      ...answers,
      calendars: ['calendar.ben', 'calendar.leo', 'calendar.anna'],
    });

    expect(without.entities).toEqual([
      { entity: 'calendar.ben', accent_color: '#123456' },
      'calendar.leo',
    ]);
    expect(again.entities).toEqual([
      { entity: 'calendar.ben', accent_color: '#123456' },
      'calendar.leo',
      'calendar.anna',
      { entity: 'calendar.anna', event_type: 'all_day' },
    ]);
  });

  it('returns fresh objects, and never changes a story or the opening configuration', () => {
    const opening = structuredClone(OPENING);
    const answers = initialAnswers(opening, 'family_hub', ONE_WEATHER);
    const first = buildQuickSetupConfig(opening, answers);
    (first.toolbar as Record<string, unknown>).show = false;
    (first.entities as Array<Record<string, unknown>>)[0].accent_color = 'red';
    (first.grid_options as Record<string, unknown>).columns = 1;

    expect(buildQuickSetupConfig(opening, answers)).toEqual(
      buildQuickSetupConfig(structuredClone(OPENING), answers),
    );
    expect(opening).toEqual(OPENING);
    expect(storyById('family_hub').shell().toolbar).toEqual({
      show: true,
      legend: 'chips',
      reset: true,
    });
  });
});

describe('storyColors', () => {
  it('stops when the story runs out of colors', () => {
    const opening = { entities: ['calendar.a', 'calendar.b', 'calendar.c'] };
    const answers = initialAnswers(opening, 'birthdays_and_holidays', {});

    expect(storyColors(opening, answers)).toEqual([
      { calendar: 'calendar.a', color: '#f06292' },
      { calendar: 'calendar.b', color: '#26a69a' },
    ]);
    expect(buildQuickSetupConfig(opening, answers).entities).toEqual([
      { entity: 'calendar.a', accent_color: '#f06292' },
      { entity: 'calendar.b', accent_color: '#26a69a' },
      'calendar.c',
    ]);
  });

  it('counts a null or empty color as none, and a story with no colors gives none', () => {
    const opening = {
      entities: [
        { entity: 'calendar.a', accent_color: null },
        { entity: 'calendar.b', accent_color: '' },
      ],
    };

    expect(
      storyColors(opening, initialAnswers(opening, 'family_hub', {})).map(({ color }) => color),
    ).toEqual(['#ff6c92', '#03a9f4']);
    expect(storyColors(opening, initialAnswers(opening, 'now_and_next', {}))).toEqual([]);
  });
});

describe('initialAnswers', () => {
  it('takes the title and calendars from the card, and the rest from the story', () => {
    expect(initialAnswers(OPENING, 'birthdays_and_holidays', ONE_WEATHER)).toEqual({
      story: 'birthdays_and_holidays',
      title: 'Our Week',
      calendars: ['calendar.anna', 'calendar.ben', 'calendar.leo'],
      weather: '',
      toolbar: true,
      eventDetails: true,
      dayAdds: false,
    });
  });

  it('prefers the card’s own weather entity, else the only one in a story that shows weather', () => {
    const own = { ...OPENING, weather: { entity: 'weather.cabin' } };
    expect(initialAnswers(own, 'now_and_next', ONE_WEATHER).weather).toBe('weather.cabin');
    expect(initialAnswers(OPENING, 'family_hub', ONE_WEATHER).weather).toBe('weather.home');
    expect(
      initialAnswers(OPENING, 'family_hub', { 'weather.home': {}, 'weather.cabin': {} }).weather,
    ).toBe('');
    expect(initialAnswers(OPENING, 'now_and_next', ONE_WEATHER).weather).toBe('');
  });

  it('takes the story’s title when the card has none', () => {
    expect(initialAnswers({ entities: [] }, 'today_and_tomorrow', {}).title).toBe(
      'Today & Tomorrow',
    );
  });
});

describe('answersForStory', () => {
  const opening = { entities: ['calendar.anna'] };

  it('keeps what the user typed when the story changes, and follows the story otherwise', () => {
    const family = initialAnswers(opening, 'family_hub', ONE_WEATHER);
    const switched = answersForStory(family, 'today_and_tomorrow', opening, ONE_WEATHER);
    expect(switched.title).toBe('Today & Tomorrow');
    expect(switched.toolbar).toBe(true);

    const typed = answersForStory(
      { ...family, title: 'Kitchen', calendars: ['calendar.ben'], weather: 'weather.cabin' },
      'now_and_next',
      opening,
      ONE_WEATHER,
    );
    expect(typed).toEqual({
      story: 'now_and_next',
      title: 'Kitchen',
      calendars: ['calendar.ben'],
      weather: 'weather.cabin',
      toolbar: false,
      eventDetails: false,
      dayAdds: false,
    });
  });
});
