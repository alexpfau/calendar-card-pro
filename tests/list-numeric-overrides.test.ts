import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
  groupedEvents: Types.EventsByDay[];
  isExpanded: boolean;
  toggleExpanded(): void;
  updateComplete: Promise<boolean>;
}

const events: Types.CalendarEventData[] = [
  ['2026-09-14', '11:00', 'Planning'],
  ['2026-09-14', '13:00', 'Workshop'],
  ['2026-09-15', '11:00', 'Delivery'],
  ['2026-09-16', '11:00', 'Rehearsal'],
].map(([date, time, summary]) => ({
  summary,
  start: { dateTime: `${date}T${time}:00Z` },
  end: { dateTime: `${date}T${time}:30Z` },
}));

async function mount(overrides: Record<string, unknown>): Promise<CardUnderTest> {
  const card = document.createElement('calendar-card-pro-dev') as CardUnderTest;
  card.hass = {
    states: {},
    locale: { language: 'en' },
    callApi: async () => events,
    callService: vi.fn(),
  };
  card.setConfig({
    entities: ['calendar.anna'],
    start_date: '2026-09-14',
    days_to_show: 3,
    tap_action: { action: 'expand' },
    ...overrides,
  });
  document.body.append(card);
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  await card.updateComplete;
  return card;
}

function realCount(card: CardUnderTest): number {
  return card.groupedEvents.flatMap((day) => day.events).filter((event) => !event._isEmptyDay)
    .length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-14T10:00:00Z'));
  localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('numeric List overrides use the same rules as roots', () => {
  it.each(View.VIEWS)('keeps scalar and bulk numeric resolution aligned in %s', (view) => {
    const block = View.viewBlockFor(view)!.blockKey;
    const config = buildConfig({ [block]: { event_background_opacity: '17' } });
    expect(View.resolveViewOption(config, 'event_background_opacity', view)).toBe(17);
    expect(View.resolveEffectiveConfig(config, view).event_background_opacity).toBe(17);
  });

  it.each(['compact_events_to_show', 'compact_days_to_show'])(
    'honors a quoted %s and can expand it',
    async (key) => {
      const expected = key === 'compact_events_to_show' ? 1 : 2;
      const root = await mount({ [key]: '1' });
      const block = await mount({ list: { [key]: '1' } });

      expect(realCount(root)).toBe(expected);
      expect(realCount(block)).toBe(expected);
      root.toggleExpanded();
      block.toggleExpanded();
      expect(root.isExpanded).toBe(true);
      expect(block.isExpanded).toBe(true);
      expect(realCount(root)).toBe(4);
      expect(realCount(block)).toBe(4);
    },
  );

  it.each(['compact_events_to_show', 'compact_days_to_show'])(
    'keeps root/block parity for invalid or fractional %s',
    async (key) => {
      for (const value of [null, '', 'invalid', -1, '-1', '1.5', '0']) {
        const root = await mount({ [key]: value });
        const block = await mount({ list: { [key]: value } });

        expect(realCount(block), `${key}: ${String(value)}`).toBe(realCount(root));
        root.toggleExpanded();
        block.toggleExpanded();
        expect(block.isExpanded, `${key}: ${String(value)}`).toBe(root.isExpanded);
        expect(realCount(block), `${key}: ${String(value)}, expanded`).toBe(realCount(root));
        root.remove();
        block.remove();
      }
    },
  );

  it('control: keeps a real zero event limit and an unconfigured card distinct', async () => {
    const zero = await mount({ list: { compact_events_to_show: 0 } });
    const unlimited = await mount({});
    expect(realCount(zero)).toBe(0);
    expect(realCount(unlimited)).toBe(4);
    zero.toggleExpanded();
    unlimited.toggleExpanded();
    expect(zero.isExpanded).toBe(true);
    expect(unlimited.isExpanded).toBe(false);
    expect(realCount(zero)).toBe(4);
  });
});
