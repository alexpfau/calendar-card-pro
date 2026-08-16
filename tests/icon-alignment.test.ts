import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as ViewConfig from '../src/config/view';
import { generateCustomPropertiesObject } from '../src/rendering/styles';

/**
 * `event_icon_vertical_alignment`, and the reason it needs a file of its own.
 *
 * The option resolves to a **host custom property**, never to an attribute on any
 * element, so it is invisible to both DOM goldens: changing its default moved not one
 * byte of `list-dom.test.ts` or `column-dom.test.ts`, and the whole suite stayed green
 * across the v4 change from `middle` to `top`. `stylesheet.test.ts` asserts that the
 * rules *read* the property; nothing asserted what it resolves to, in either direction.
 *
 * That is exactly the blind spot AGENTS.md describes: the suite is built from default
 * config, so an option is covered only by whichever value happens to be the default, and
 * a change of default silently swaps which branch is tested for which is not. Every
 * value is therefore pinned here explicitly, so neither `top` nor `middle` is ever again
 * covered only by being the default.
 */
describe('event icon vertical alignment', () => {
  const PROP = '--calendar-card-event-icon-vertical-alignment';

  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as const)('maps %s to the flex value %s', (option, expected) => {
    expect(
      generateCustomPropertiesObject(buildConfig({ event_icon_vertical_alignment: option }))[PROP],
    ).toBe(expected);
  });

  it('defaults to top, which is a breaking change from v3', () => {
    // Pinned as two assertions on purpose. The first states the shipped default, so the
    // release note and the documented default cannot drift from the code without a
    // failure. The second states what it resolves to, so the mapping cannot be quietly
    // rewired underneath a default that still reads `top`.
    expect(Config.DEFAULT_CONFIG.event_icon_vertical_alignment).toBe('top');
    expect(generateCustomPropertiesObject(buildConfig())[PROP]).toBe('flex-start');
  });

  it('falls back to centre for a value it does not recognise', () => {
    // Not a design decision so much as a documented one: the mapping is a two-armed
    // ternary whose else branch catches everything, so a typo renders centred rather
    // than unstyled. Pinned because it is the one behaviour a reader would otherwise
    // have to reconstruct from the ternary, and because the fallback is now *not* the
    // default -- before v4 the two coincided and this test could not have failed.
    expect(
      generateCustomPropertiesObject(buildConfig({ event_icon_vertical_alignment: 'centre' }))[
        PROP
      ],
    ).toBe('center');
  });

  it('is not a per-view default, so a top-level value still reaches column view', () => {
    // The evidence behind shipping one default for both views rather than a column-only
    // one. `COLUMN_DEFAULT_OVERRIDES` does not mean "a different default": a key listed
    // there stops inheriting the top-level value altogether, so `middle` written at the
    // top level would be ignored in column view until it was repeated inside `column:`.
    // That trade is worth it for `show_empty_days`, whose alternative is a grid that no
    // longer corresponds to consecutive days. It is not worth it for an icon.
    expect(ViewConfig.hasDivergentDefault('event_icon_vertical_alignment', 'column')).toBe(false);

    const config = buildConfig({
      view: 'column',
      event_icon_vertical_alignment: 'middle',
    });
    expect(ViewConfig.resolveEffectiveConfig(config, 'column').event_icon_vertical_alignment).toBe(
      'middle',
    );
  });

  it('stays overridable inside the column block', () => {
    // The other half: not diverging by default does not mean not divergible at all. The
    // key is a `COLUMN_OVERRIDE_KEYS` member, so a user who wants the two views to differ
    // still can -- which is the escape hatch that makes a shared default safe to ship.
    const config = buildConfig({
      view: 'column',
      event_icon_vertical_alignment: 'top',
      column: { event_icon_vertical_alignment: 'bottom' },
    });

    expect(ViewConfig.resolveEffectiveConfig(config, 'column').event_icon_vertical_alignment).toBe(
      'bottom',
    );
    expect(ViewConfig.resolveEffectiveConfig(config, 'list').event_icon_vertical_alignment).toBe(
      'top',
    );
  });

  it('leaves the date column alignment alone', () => {
    // `date_vertical_alignment` is a different option governing a different element, and
    // it keeps its `middle`. It is list-only -- column view ignores it, spec A3-A -- and
    // it centres the date against the whole day's events, which is a deliberate and
    // long-standing behaviour nobody has reported a problem with. Pinned here because the
    // two option names are one word apart and a future "make the alignments consistent"
    // pass would be a silent regression for every list-view user.
    expect(Config.DEFAULT_CONFIG.date_vertical_alignment).toBe('middle');
  });
});

describe('time text display custom property', () => {
  const PROP = '--calendar-card-time-display';

  it('leaves the time inline at the default, so the countdown can share its line', () => {
    // The countdown's text placement nests the time and the countdown as inline siblings
    // inside `.time-text`. `-webkit-box` is block-level, so a literal one here would put
    // the countdown on a line of its own always -- which is the very thing that placement
    // exists to stop.
    expect(generateCustomPropertiesObject(buildConfig())[PROP]).toBe('inline');
  });

  it('blockifies the time only once a limit is actually set', () => {
    // `-webkit-line-clamp` takes effect on a `-webkit-box` and nowhere else, so asking
    // for a limit necessarily costs the shared line. Same trade `weather.event.max_lines`
    // already makes for the condition, and the same shape as `title_max_lines`.
    expect(generateCustomPropertiesObject(buildConfig({ time_max_lines: 2 }))[PROP]).toBe(
      '-webkit-box',
    );
  });
});
