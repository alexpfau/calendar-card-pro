/**
 * The card's entry in `window.customCards`, the registration Home Assistant reads for its card
 * picker and card editor.
 *
 * `documentationURL` is the help icon in the header of Home Assistant's card editor dialog, so
 * it is opened by someone in the middle of configuring the card. It pointed at the GitHub
 * repository until v5.1, several clicks from any page about an option.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getEntitySuggestion } from '../src/config/config';
import '../src/calendar-card-pro';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The hostname the documentation site is served on, read from the Worker that serves it.
 * Compared against rather than restated, so the help icon cannot keep a domain the site left.
 */
function docsHostname(): string {
  const wrangler = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8');
  const patterns = [...wrangler.matchAll(/"pattern":\s*"([^"]+)"/g)].map((match) => match[1]);
  expect(patterns, 'wrangler.jsonc should route exactly one custom domain').toHaveLength(1);
  return patterns[0];
}

describe('the window.customCards entry', () => {
  const entry = window.customCards.find((card) => card.type === 'calendar-card-pro-dev');

  it('is registered once', () => {
    expect(window.customCards.filter((card) => card.type === 'calendar-card-pro-dev')).toHaveLength(
      1,
    );
  });

  it("opens the documentation site's home from Home Assistant's help icon", () => {
    const url = new URL(entry?.documentationURL ?? '');
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe(docsHostname());
    expect(url.pathname).toBe('/');
  });

  it('offers the card for calendar entities through getEntitySuggestion', () => {
    expect(entry?.getEntitySuggestion).toBe(getEntitySuggestion);
  });
});
