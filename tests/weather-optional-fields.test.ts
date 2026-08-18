/**
 * Weather forecast entries carry two optional numeric fields, `templow` and `uv_index`.
 * Home Assistant's weather entity contract makes `temperature` and `condition` required
 * but leaves both of these to the integration, so a perfectly valid forecast can omit
 * either one. The render sites guard for that -- `show_low_temp` additionally requires
 * `templow !== undefined`, and the UV badge requires a value at or above the threshold.
 *
 * Nothing exercised those guards. The shared `WEATHER` fixture populates both fields for
 * every day, precisely so the opt-in branches are reachable, which means the absent-data
 * path was never rendered. Deleting the `templow` guard left the whole suite green while
 * a forecast without a low temperature rendered a bare `/` and degree sign next to the
 * high, so the guard was both load-bearing and unprotected.
 *
 * Each absence case is paired with a presence control, so a change that stops rendering
 * the field at all cannot pass by making the absence assertion trivially true.
 *
 * The UV badge's two conditions -- `uv_index !== undefined` and the threshold comparison
 * -- mask each other: `undefined >= n` is false for every threshold, so neutralising
 * either one alone leaves behaviour unchanged and no test can distinguish it. Both are
 * therefore deliberately kept, and the assertions below pin the combined outcome, which
 * does fail when both conditions are removed together.
 */
import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, SINGLE_EVENT, WEATHER, buildConfig } from './fixtures';
import * as Types from '../src/config/types';
import * as Leaves from '../src/rendering/leaves';

function withoutField(field: 'templow' | 'uv_index', bucket: 'daily' | 'hourly') {
  const clone = JSON.parse(JSON.stringify(WEATHER)) as Types.WeatherForecasts;
  for (const entry of Object.values(clone[bucket] ?? {})) {
    delete (entry as unknown as Record<string, unknown>)[field];
  }
  return clone;
}

function dateWeatherHtml(weather: Types.WeatherForecasts, dateOverrides: Record<string, unknown>) {
  const config = buildConfig({
    weather: { entity: 'weather.home', position: 'date', date: dateOverrides },
  });
  const host = document.createElement('div');
  render(Leaves.renderDateWeather(new Date(FROZEN_NOW), config, weather), host);
  return host.innerHTML;
}

function eventWeatherHtml(
  weather: Types.WeatherForecasts,
  eventOverrides: Record<string, unknown>,
) {
  const config = buildConfig({
    weather: { entity: 'weather.home', position: 'event', event: eventOverrides },
  });
  const host = document.createElement('div');
  render(Leaves.renderEventWeather(SINGLE_EVENT[0], config, weather, 'title'), host);
  return host.innerHTML;
}

describe('weather rendering with optional forecast fields absent', () => {
  // `renderEventWeather` suppresses the badge for an event that has already ended, so
  // the fixture event is only in the future while the clock is frozen at FROZEN_NOW.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('omits the low temperature when the forecast has no templow', () => {
    const overrides = { show_low_temp: true };

    // Control: the fixture supplies templow, so the opt-in branch really does render.
    expect(dateWeatherHtml(WEATHER, overrides)).toContain('weather-temp-low');

    const html = dateWeatherHtml(withoutField('templow', 'daily'), overrides);
    expect(html).not.toContain('weather-temp-low');
    // The high temperature is unaffected, so this is an omission and not a blank render.
    expect(html).toContain('weather-temp-high');
  });

  it('never emits a bare degree sign for a missing low temperature', () => {
    // Removing the guard rendered `<span class="weather-temp-low">/°</span>`. Assert on
    // the visible text so the regression is caught however the markup is restructured.
    const html = dateWeatherHtml(withoutField('templow', 'daily'), { show_low_temp: true });
    expect(html).not.toContain('/°');
  });

  it('omits the date UV badge when the forecast has no uv_index', () => {
    const overrides = { show_uv_index: true };

    expect(dateWeatherHtml(WEATHER, overrides)).toContain('weather-uv-index');

    expect(dateWeatherHtml(withoutField('uv_index', 'daily'), overrides)).not.toContain(
      'weather-uv-index',
    );
  });

  it('falls back to the low temperature when the UV index is absent', () => {
    // `show_low_temp` is suppressed while a UV badge shows. With no uv_index the badge
    // cannot render, so the low temperature must take its place rather than both vanishing.
    const html = dateWeatherHtml(withoutField('uv_index', 'daily'), {
      show_uv_index: true,
      show_low_temp: true,
    });
    expect(html).not.toContain('weather-uv-index');
    expect(html).toContain('weather-temp-low');
  });

  it('omits the event UV badge when the hourly forecast has no uv_index', () => {
    const overrides = { show_uv_index: true };

    // The shared fixture's hourly entries carry no uv_index, so the control has to add
    // one rather than remove it. Building the control this way also proves the fixture
    // itself is the reason this branch had never rendered.
    const withUv = JSON.parse(JSON.stringify(WEATHER)) as Types.WeatherForecasts;
    for (const entry of Object.values(withUv.hourly ?? {})) {
      (entry as unknown as Record<string, unknown>).uv_index = 7;
    }
    expect(eventWeatherHtml(withUv, overrides)).toContain('weather-uv-index');

    expect(eventWeatherHtml(WEATHER, overrides)).not.toContain('weather-uv-index');
  });
});
