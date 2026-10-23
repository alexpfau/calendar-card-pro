import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/calendar-card-pro';
import type * as Types from '../src/config/types';

const EVENT = {
  summary: 'Appointment',
  start: { dateTime: '2026-06-18T11:00:00Z' },
  end: { dateTime: '2026-06-18T12:00:00Z' },
};

async function mounted(view: Types.EffectiveView, language?: string) {
  const card = document.createElement('calendar-card-pro-dev');
  card.preview = true;
  card.setConfig({
    entities: ['calendar.anna'],
    days_to_show: 1,
    view,
    ...(language ? { language } : {}),
  });
  card.hass = {
    states: {},
    locale: { language: 'en' },
    callApi: vi.fn(async () => [EVENT]),
  } as unknown as Types.Hass;
  document.body.appendChild(card);
  await card.updateEvents();
  await vi.waitFor(() => {
    expect(card.events).toHaveLength(1);
    expect(card.isLoading).toBe(false);
    expect(card.isInitialLoad).toBe(false);
  });
  await card.updateComplete;
  return card;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-18T08:00:00Z'));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe.each(['list', 'column', 'grid'] as const)('%s language updates', (view) => {
  it('repaints a config language edit without a second HA update or fetch', async () => {
    const card = await mounted(view);
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Thu');
    const before = vi.mocked(card.hass!.callApi).mock.calls.length;
    card.setConfig({ ...card.config, language: 'de' });
    await card.updateComplete;
    expect(card.effectiveLanguage).toBe('de');
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Do');
    expect(vi.mocked(card.hass!.callApi).mock.calls).toHaveLength(before);
  });

  it('repaints a Home Assistant locale change in the same update', async () => {
    const card = await mounted(view);
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Thu');
    card.hass = { ...card.hass!, locale: { language: 'de' } };
    await card.updateComplete;
    expect(card.effectiveLanguage).toBe('de');
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Do');
  });

  it('control: an explicit card language stays ahead of the profile language', async () => {
    const card = await mounted(view, 'en');
    card.hass = { ...card.hass!, locale: { language: 'de' } };
    await card.updateComplete;
    expect(card.effectiveLanguage).toBe('en');
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Thu');
  });

  it('returns to English when the profile language is removed', async () => {
    const card = await mounted(view);
    card.hass = { ...card.hass!, locale: { language: 'de' } };
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Do');

    card.hass = { ...card.hass!, locale: undefined };
    await card.updateComplete;
    expect(card.effectiveLanguage).toBe('en');
    expect(card.shadowRoot?.querySelector('.weekday')?.textContent?.trim()).toBe('Thu');
  });
});
