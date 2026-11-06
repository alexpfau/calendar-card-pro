/**
 * The docs' list of options a view block ignores names every one of them, and nothing else.
 *
 * _Options That Cannot Be Overridden_ in `docs/features/column-view.md` is the one exhaustive
 * list; `core-settings.md` and `grid-view.md` name a few with "such as" and link to it. It went
 * stale without anything failing: `tap_action` and `hold_action` were never on it, and
 * `day_tap_action` and `event_hold_action` arrived in v5.1 without joining it. Eighteen more,
 * from `title` to `event_type`, were missing too. Each is ignored inside `list:`, `column:` and
 * `time_grid:`, and the warning about it is a console warning the production build does not
 * log, so a reader trusting the list wrote an override that silently did nothing.
 *
 * So the list is reconciled against the code that decides it rather than kept by hand: an
 * option is card-wide when it is a `DEFAULT_CONFIG` key no block in `VIEW_BLOCKS` hoists. The
 * registry is the resolver's own table, so a fourth view block, or an option moving into or out
 * of the override keys, reaches this test without anyone editing it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import { FETCH_TIME_KEYS, VIEW_BLOCKS } from '../src/config/view';

const PAGE = 'docs/features/column-view.md';
const HEADING = '## 🚫 Options That Cannot Be Overridden';

/** Keys that configure the card or its blocks themselves, and so mean nothing inside a block. */
const NOT_OPTIONS_OF_A_VIEW = new Set(['config_version', 'view']);

/**
 * Every option a view block ignores, from the code.
 *
 * @returns The card-wide `DEFAULT_CONFIG` keys
 */
function cardWideOptions(): Set<string> {
  const blocks = Object.values(VIEW_BLOCKS);
  const hoisted = new Set(blocks.flatMap((block) => [...(block?.overrideKeys ?? [])]));
  const blockKeys = new Set<string>(blocks.map((block) => String(block?.blockKey)));
  return new Set(
    Object.keys(DEFAULT_CONFIG).filter(
      (key) => !hoisted.has(key) && !blockKeys.has(key) && !NOT_OPTIONS_OF_A_VIEW.has(key),
    ),
  );
}

/**
 * The option lists the section writes as a line of names and nothing else, `a` · `b` · `c`.
 * Names in its prose, such as the exceptions it explains, are not part of a list.
 *
 * @returns One array of option names per list, in page order
 */
function documentedLists(): string[][] {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const lines = readFileSync(join(root, PAGE), 'utf8').split('\n');
  const start = lines.indexOf(HEADING);
  expect(start, `${PAGE} should have the heading "${HEADING}"`).toBeGreaterThan(-1);
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => /^`[a-z0-9_]+`( · `[a-z0-9_]+`)*$/.test(line.trim()))
    .map((line) => [...line.matchAll(/`([a-z0-9_]+)`/g)].map((match) => match[1]));
}

describe('Options That Cannot Be Overridden', () => {
  const lists = documentedLists();
  const documented = new Set(lists.flat());
  const cardWide = cardWideOptions();

  it('reads lists to compare, and has options to compare them with', () => {
    // Both sides must be able to be non-empty, or the two below compare nothing with nothing.
    expect(lists.length).toBeGreaterThan(1);
    expect(cardWide.size).toBeGreaterThan(FETCH_TIME_KEYS.size);
  });

  it('opens with exactly the options that decide which events are loaded', () => {
    expect(new Set(lists[0])).toEqual(new Set(FETCH_TIME_KEYS));
  });

  it('names every option a view block ignores', () => {
    expect([...cardWide].filter((key) => !documented.has(key))).toEqual([]);
  });

  it('names nothing a view block accepts', () => {
    expect([...documented].filter((key) => !cardWide.has(key))).toEqual([]);
  });

  it('names each option once', () => {
    expect(lists.flat()).toHaveLength(documented.size);
  });
});
