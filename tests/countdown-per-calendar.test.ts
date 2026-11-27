/**
 * A calendar's own countdown options (backlog item 407, #156): `show_countdown`,
 * `show_countdown_allday`, `countdown_max_days`, `countdown_exact_days` and `show_time_left` on a
 * calendar entry, each over its view block's and the card's.
 *
 * Countdowns are off by default, so every case turns one on somewhere, and asserts beside it a
 * calendar left as it is: a harness that drew no countdown at all, or one on every event, fails.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { render } from 'lit';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import '../src/calendar-card-pro';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderMonthDayRows } from '../src/rendering/month';
import * as Presentation from '../src/rendering/presentation';

const NOW = new Date('2026-06-17T10:00:00Z');

const timed = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

const allDay = (summary: string, start: string, end: string): Types.CalendarEventData => ({
  summary,
  start: { date: start },
  end: { date: end },
});

/** Each calendar's events: Anna's piano lessons, Ben's dentist, three days from NOW. */
const EVENTS: Readonly<Record<string, Types.CalendarEventData[]>> = {
  'calendar.anna': [timed('Piano', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z')],
  'calendar.ben': [timed('Dentist', '2026-06-20T11:00:00Z', '2026-06-20T12:00:00Z')],
};

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  readonly updateComplete: Promise<boolean>;
  updateEvents(force?: boolean): Promise<void>;
  _clockTimerAt: number | null;
}

async function mount(
  config: Record<string, unknown>,
  events: Readonly<Record<string, Types.CalendarEventData[]>> = EVENTS,
): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
  card.setConfig({ entities: ['calendar.anna', 'calendar.ben'], days_to_show: 7, ...config });
  const state = (id: string) => ({ entity_id: id, state: 'off', attributes: {} });
  card.hass = {
    states: { 'calendar.anna': state('calendar.anna'), 'calendar.ben': state('calendar.ben') },
    locale: { language: 'en', first_weekday: 'monday', time_format: '24' },
    connection: { subscribeMessage: () => Promise.reject({ code: 'unknown_command' }) },
    callApi: vi.fn((_method: string, url: string) =>
      Promise.resolve(events[url.slice('calendars/'.length).split('?')[0]] ?? []),
    ),
    callService: vi.fn(),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents(true);
  await card.updateComplete;
  return card;
}

/** Each drawn event's title and countdown, by title; null where it draws none. */
function countdowns(card: CardUnderTest): Record<string, string | null> {
  const drawn: Record<string, string | null> = {};
  for (const event of card.shadowRoot!.querySelectorAll('.event, .grid-event')) {
    // Column view shows empty days by default, and their notices are not events.
    if (event.querySelector('.empty-day-title')) continue;
    const title = event.querySelector('.event-title')?.textContent?.trim();
    if (!title) continue;
    drawn[title] = event.querySelector('.time-countdown')?.textContent?.trim() || null;
  }
  return drawn;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['list', 'column', 'grid'] as const)('in %s view', (view) => {
  it('counts down for a calendar that sets it, on a card that does not', async () => {
    const card = await mount({
      view,
      entities: [{ entity: 'calendar.anna', show_countdown: true }, 'calendar.ben'],
    });
    expect(countdowns(card)).toEqual({ Piano: 'in 3 days', Dentist: null });
  });

  it('leaves out the countdown of a calendar that turns it off, on a card that counts down', async () => {
    const card = await mount({
      view,
      show_countdown: true,
      entities: ['calendar.anna', { entity: 'calendar.ben', show_countdown: false }],
    });
    expect(countdowns(card)).toEqual({ Piano: 'in 3 days', Dentist: null });
  });
});

describe('precedence', () => {
  it("takes a calendar's own value over its view block's, and the block's over the card's", async () => {
    const config = {
      show_countdown: false,
      list: { show_countdown: true, countdown_max_days: 1 },
      entities: [
        { entity: 'calendar.anna', countdown_max_days: 7 },
        { entity: 'calendar.ben', show_countdown: false },
      ],
    };
    // Ben's dentist is tomorrow, inside List's limit, so only his own setting leaves it out.
    const events = {
      ...EVENTS,
      'calendar.ben': [timed('Dentist', '2026-06-18T11:00:00Z', '2026-06-18T12:00:00Z')],
    };
    // List turns countdowns on and limits them to tomorrow; Anna's own limit is a week.
    expect(countdowns(await mount({ ...config, view: 'list' }, events))).toEqual({
      Piano: 'in 3 days',
      Dentist: null,
    });
    document.body.replaceChildren();
    // Columns keeps the card's off, which Anna's limit does not turn on.
    expect(countdowns(await mount({ ...config, view: 'column' }, events))).toEqual({
      Piano: null,
      Dentist: null,
    });
  });

  it("reads a calendar's own limit, all-day switch and counting in days", async () => {
    const events = {
      'calendar.anna': [
        allDay('Bins', '2026-06-18', '2026-06-19'),
        timed('Piano', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
      ],
      'calendar.ben': [
        allDay('Holiday', '2026-06-18', '2026-06-19'),
        timed('Dentist', '2026-06-20T11:00:00Z', '2026-06-20T12:00:00Z'),
      ],
    };
    const card = await mount(
      {
        view: 'list',
        show_countdown: true,
        entities: [
          { entity: 'calendar.anna', countdown_exact_days: true, countdown_max_days: 1 },
          { entity: 'calendar.ben', show_countdown_allday: false },
        ],
      },
      events,
    );
    expect(countdowns(card)).toEqual({
      Bins: 'in 1 day',
      Piano: null,
      Holiday: null,
      Dentist: 'in 3 days',
    });
  });

  it('lets two entries of one calendar count down differently', async () => {
    const events = {
      'calendar.anna': [
        allDay('Bins', '2026-06-18', '2026-06-19'),
        timed('Piano', '2026-06-20T09:00:00Z', '2026-06-20T10:00:00Z'),
      ],
    };
    const card = await mount(
      {
        view: 'list',
        entities: [
          { entity: 'calendar.anna', event_type: 'timed', show_countdown: true },
          { entity: 'calendar.anna', event_type: 'all_day' },
        ],
      },
      events,
    );
    expect(countdowns(card)).toEqual({ Bins: null, Piano: 'in 3 days' });
  });
});

describe('once_per_day', () => {
  const day = (summary: string, entity: string, setting: Types.EntityConfig['show_countdown']) => ({
    ...allDay(summary, '2026-06-20', '2026-06-21'),
    _entityId: entity,
    _matchedConfig: { entity, show_countdown: setting },
  });

  it("leaves out a repeat whose own calendar's setting is once_per_day, under any calendar's", () => {
    const config = buildConfig({ show_countdown: false });
    const events = [
      day('Paper', 'calendar.ben', true),
      day('Plastic', 'calendar.anna', 'once_per_day'),
      day('Glass', 'calendar.anna', 'once_per_day'),
    ];
    expect([...Presentation.repeatedCountdowns(events, config, 'en')]).toEqual([1, 2]);
  });

  it('keeps the countdown of a calendar set to true under a repeat it reads like', () => {
    const config = buildConfig({ show_countdown: false });
    const events = [
      day('Paper', 'calendar.anna', 'once_per_day'),
      day('Plastic', 'calendar.ben', true),
      day('Glass', 'calendar.ben', true),
    ];
    expect([...Presentation.repeatedCountdowns(events, config, 'en')]).toEqual([]);
    // The control: all three under once_per_day leave the two repeats out.
    const once = events.map((event) => ({
      ...event,
      _matchedConfig: { ...event._matchedConfig, show_countdown: 'once_per_day' as const },
    }));
    expect([...Presentation.repeatedCountdowns(once, config, 'en')]).toEqual([1, 2]);
  });
});

describe('month', () => {
  it("draws no countdown and no time left in a day's list, whatever a calendar says", () => {
    const config = resolveEffectiveConfig(
      buildConfig({
        view: 'month',
        entities: [{ entity: 'calendar.anna', show_countdown: true, show_time_left: true }],
      }),
      'month',
    );
    const matched = config.entities[0] as Types.EntityConfig;
    const piano = {
      ...EVENTS['calendar.anna'][0],
      _entityId: 'calendar.anna',
      _matchedConfig: matched,
    };
    const running = {
      ...timed('Swim', '2026-06-17T09:30:00Z', '2026-06-17T10:30:00Z'),
      _entityId: 'calendar.anna',
      _matchedConfig: matched,
    };
    // The control: the calendar's options would bring both back, Month's pin aside.
    expect(Presentation.eventCountdown(piano, config, 'en')).toBe('in 3 days');
    expect(Presentation.eventTimeLeft(running, config, 'en')).toBe('30 min left');

    const host = document.createElement('div');
    render(renderMonthDayRows([piano, running], config, 'en'), host);
    expect(host.querySelectorAll('.event')).toHaveLength(2);
    expect(host.querySelector('.time-countdown')).toBeNull();
  });
});

describe('the clock repaint', () => {
  const LATER_TODAY = {
    'calendar.anna': [timed('Piano', '2026-06-17T10:40:00Z', '2026-06-17T11:30:00Z')],
    'calendar.ben': [],
  };

  it("ticks by the minute for a calendar's own countdown to a start later today", async () => {
    const card = await mount(
      {
        view: 'list',
        days_to_show: 2,
        entities: [{ entity: 'calendar.anna', show_countdown: true }, 'calendar.ben'],
      },
      LATER_TODAY,
    );
    expect(countdowns(card)).toEqual({ Piano: 'in 40 minutes' });
    expect(card._clockTimerAt).toBe(NOW.getTime() + 60_000);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await card.updateComplete;
    expect(countdowns(card)).toEqual({ Piano: 'in 30 minutes' });
  });

  it('waits for midnight where the only calendar counting down to today turns it off', async () => {
    const card = await mount(
      {
        view: 'list',
        days_to_show: 2,
        show_countdown: true,
        entities: [{ entity: 'calendar.anna', show_countdown: false }, 'calendar.ben'],
      },
      LATER_TODAY,
    );
    expect(countdowns(card)).toEqual({ Piano: null });
    expect(card._clockTimerAt).not.toBe(NOW.getTime() + 60_000);
    // The control: the same card with Anna left as she is ticks.
    document.body.replaceChildren();
    const ticking = await mount(
      { view: 'list', days_to_show: 2, show_countdown: true },
      LATER_TODAY,
    );
    expect(ticking._clockTimerAt).toBe(NOW.getTime() + 60_000);
  });
});

describe('normalizeEntities', () => {
  it('keeps the values the card reads and drops the rest, so the card applies', () => {
    const [kept, dropped] = Config.normalizeEntities([
      {
        entity: 'calendar.anna',
        show_countdown: 'once_per_day',
        show_countdown_allday: false,
        countdown_max_days: '7' as unknown as number,
        countdown_exact_days: true,
        show_time_left: true,
      },
      {
        entity: 'calendar.ben',
        show_countdown: 'yes' as unknown as boolean,
        show_countdown_allday: 'no' as unknown as boolean,
        countdown_max_days: -1,
        countdown_exact_days: 1 as unknown as boolean,
        show_time_left: 'true' as unknown as boolean,
      },
    ]);
    expect(kept).toMatchObject({
      show_countdown: 'once_per_day',
      show_countdown_allday: false,
      countdown_max_days: 7,
      countdown_exact_days: true,
      show_time_left: true,
    });
    for (const key of [
      'show_countdown',
      'show_countdown_allday',
      'countdown_max_days',
      'countdown_exact_days',
      'show_time_left',
    ] as const) {
      expect([key, dropped[key]]).toEqual([key, undefined]);
    }
  });
});

describe('the one reader', () => {
  /** The options `Presentation.countdownSettings` resolves for an event. */
  const OPTIONS = new Set([
    'show_countdown',
    'show_countdown_allday',
    'countdown_max_days',
    'countdown_exact_days',
    'show_time_left',
  ]);

  /**
   * Every place a source file names one of the options: a property read or written, a key
   * destructured, or the name as a string. Read from the syntax tree, so a comment or a stylesheet
   * mentioning one is not a reader.
   */
  function namings(fileName: string, source: string): string[] {
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      const name =
        ts.isPropertyAccessExpression(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isBindingElement(node)
          ? ts.isBindingElement(node)
            ? (node.propertyName ?? node.name)
            : node.name
          : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
            ? node
            : undefined;
      const text = name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ? name.text : '';
      if (OPTIONS.has(text)) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${fileName}:${line + 1} ${text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  }

  /** Where the options may be named: the configuration, the editor, and the one reader. */
  const allowed = (relative: string) =>
    relative.startsWith('config/') ||
    relative.startsWith('rendering/editor/') ||
    relative === 'rendering/presentation.ts';

  it('finds the namings it is for', () => {
    expect(
      namings(
        'planted.ts',
        [
          '// config.show_countdown, in a comment',
          'const a = config.show_countdown;',
          'const { countdown_max_days } = config;',
          "const b = getEntitySetting(id, 'show_time_left', config);",
          'const c = { countdown_exact_days: true };',
        ].join('\n'),
      ),
    ).toEqual([
      'planted.ts:2 show_countdown',
      'planted.ts:3 countdown_max_days',
      'planted.ts:4 show_time_left',
      'planted.ts:5 countdown_exact_days',
    ]);
  });

  it('reads them nowhere else in src/, so no reader can pass a calendar by', () => {
    const root = path.resolve(__dirname, '../src');
    const files = (fs.readdirSync(root, { recursive: true }) as string[])
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => file.endsWith('.ts'));
    const scanned = files.filter((file) => !allowed(file));
    expect(scanned.length).toBeGreaterThan(80);
    // The denominator's other side: the reader itself names them, so a scan that read nothing
    // would not pass this.
    expect(
      namings(
        'presentation.ts',
        fs.readFileSync(path.join(root, 'rendering/presentation.ts'), 'utf8'),
      ).length,
    ).toBeGreaterThan(5);
    expect(
      scanned.flatMap((file) => namings(file, fs.readFileSync(path.join(root, file), 'utf8'))),
    ).toEqual([]);
  });
});
