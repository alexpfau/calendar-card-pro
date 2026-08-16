import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Leaves from '../src/rendering/leaves';

/**
 * Template hygiene, and the two renders that were affected by the lack of it.
 *
 * `<img>` is a void element, so `</img>` is not a closing tag -- it is a parse
 * error that the HTML parser discards. Writing it is therefore invisible at
 * runtime, which is why two of them survived in `leaves.ts` from before v4 and
 * were twice dismissed on review as cosmetic.
 *
 * They were not cosmetic. Prettier's embedded-HTML formatter **silently bails**
 * on a template it cannot parse, leaving it byte-for-byte untouched and
 * reporting success. `npm run check:format` passing therefore said nothing
 * about those two templates -- and the only two lines of trailing whitespace in
 * the entire `src/` tree sat inside one of them, unreported, for exactly that
 * reason.
 *
 * The bail was established by planting a semantically inert mangle (an extra
 * space before a tag's closing `>`, which prettier always normalises) into
 * every `html` template in the codebase and checking which ones prettier failed
 * to restore. Of 66 mangles across the 4 files that contain templates, 11
 * survived: 9 inside the three deliberate `// prettier-ignore` regions in this
 * file, and 2 with no such marker -- precisely the two `</img>` sites. Removing
 * the end tags dropped the survivor count to exactly the 9 intentional ones.
 *
 * Two tests follow from that:
 *
 * 1. The **guard** below fails the build if a void-element end tag reappears,
 *    because the failure mode is a formatter that stops working while still
 *    reporting success -- there is no other signal.
 * 2. The **DOM assertions** pin the output of the two templates that had to be
 *    reformatted. `renderLabel`'s image branch was already covered
 *    (`label-glyph.test.ts`), but the today-indicator's `image` and `emoji`
 *    branches had no DOM coverage at all -- only config-level classification in
 *    `editor-schema.test.ts` -- so reformatting them was unverifiable. All five
 *    rendered variants are pinned here rather than just the two that moved,
 *    since the gap was the whole `renderIndicatorByType` switch.
 */

/** HTML void elements: these never take a closing tag. */
const VOID_ELEMENTS = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
];

/** Recursively collect every TypeScript source file under `dir`. */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('template hygiene', () => {
  const sources = collectSources(join(__dirname, '..', 'src'));

  it('scans a non-empty set of source files', () => {
    // Guards the guard: a broken walk would make the scan below pass vacuously.
    expect(sources.length).toBeGreaterThan(20);
  });

  it('has no closing tags on void elements, which make prettier bail silently', () => {
    const pattern = new RegExp(`</(${VOID_ELEMENTS.join('|')})\\s*>`, 'i');
    const offenders: string[] = [];

    for (const file of sources) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          offenders.push(`${file.split('/src/')[1]}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('has no trailing whitespace, the symptom a bailing formatter leaves behind', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (/[ \t]+$/.test(line)) {
          offenders.push(`${file.split('/src/')[1]}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe('renderTodayIndicator DOM output', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  /** Render the indicator for `today_indicator` and return the inner glyph element. */
  function renderIndicator(value: string | boolean): Element | null {
    litRender(Leaves.renderTodayIndicator(buildConfig({ today_indicator: value }), true), host);
    const container = host.querySelector('.today-indicator-container');
    return container?.querySelector('.today-indicator') ?? null;
  }

  it.each([
    ['dot', true, 'HA-ICON', 'mdi:circle'],
    ['pulse', 'pulse', 'HA-ICON', 'mdi:circle'],
    ['glow', 'glow', 'HA-ICON', 'mdi:circle'],
    ['mdi', 'mdi:star', 'HA-ICON', 'mdi:star'],
  ])('renders %s as an ha-icon', (_label, value, tag, icon) => {
    const el = renderIndicator(value as string | boolean);
    expect(el?.tagName).toBe(tag);
    expect(el?.getAttribute('icon')).toBe(icon);
  });

  it('renders an image indicator as a real img element with the source applied', () => {
    const el = renderIndicator('/local/today.png');

    // The `</img>` that used to close this template was discarded by the parser,
    // so the element count is the check that the reformat changed nothing.
    expect(el?.tagName).toBe('IMG');
    expect(el?.getAttribute('src')).toBe('/local/today.png');
    expect(el?.getAttribute('alt')).toBe('Today');
    expect(el?.classList.contains('image')).toBe(true);
    expect(host.querySelectorAll('img')).toHaveLength(1);
  });

  it('renders an emoji indicator as a span', () => {
    const el = renderIndicator('⭐');
    expect(el?.tagName).toBe('SPAN');
    expect(el?.classList.contains('emoji')).toBe(true);
    expect(el?.textContent?.trim()).toBe('⭐');
  });

  it('renders nothing when the indicator is disabled or the day is not today', () => {
    litRender(Leaves.renderTodayIndicator(buildConfig({ today_indicator: false }), true), host);
    expect(host.querySelector('.today-indicator-container')).toBeNull();

    litRender(Leaves.renderTodayIndicator(buildConfig({ today_indicator: true }), false), host);
    expect(host.querySelector('.today-indicator-container')).toBeNull();
  });
});

describe('renderLabel image output', () => {
  it('renders an image label as a single img element', () => {
    const host = document.createElement('div');
    litRender(Leaves.renderLabel('/local/label.png'), host);

    const img = host.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/local/label.png');
    expect(img?.classList.contains('label-image')).toBe(true);
    expect(host.querySelectorAll('img')).toHaveLength(1);
  });
});
