import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as EditorSchemas from '../src/rendering/editor/schemas/events';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';
import * as Helpers from '../src/utils/helpers';

/**
 * `allday_badge` — drawing an all-day event's label, or its whole title, as a pill.
 *
 * This file exists because the rest of the suite cannot see this option. Every DOM gate is
 * built from default config, the option defaults to `off`, and `off` renders nothing — so the
 * entire feature is invisible to `list-dom` and `column-dom` no matter how thorough those
 * are. Everything here turns it on.
 *
 * The option is now a POSITION (`off` / `time` / `title`), with the treatment moved to
 * `allday_badge_style`. There is no boolean form of either: `false` is accepted only in the
 * sense that it is outside the closed set and therefore means off, like every other
 * unrecognized value.
 *
 * The four rows of the truth table are the point. "All-day" is not the same question as
 * "spans one day": a timed meeting running Wednesday 09:00 to Friday 17:00 is not an all-day
 * event and must not get the badge, but with `split_multiday_events` on, its **Thursday**
 * segment occupies that whole day and does. `splitMultiDayEvent` encodes exactly that by
 * rewriting middle days as `start: { date }`, which is why the plain all-day check gets all
 * four rows right and no extra predicate is needed.
 */

const CALENDAR = 'calendar.personal';

function serialize(container: HTMLElement): string {
  return container.innerHTML.replace(/<!--\?lit\$[0-9]+\$-->/g, '').replace(/<!---->/g, '');
}

function renderList(
  events: Types.CalendarEventData[],
  config: Types.Config,
  language = 'en',
): HTMLElement {
  const days = EventUtils.groupEventsByDay(events, config, false, language);
  const container = document.createElement('div');
  litRender(Render.renderGroupedEvents(days, config, language), container);
  return container;
}

/** iCal all-day ends are exclusive, so a single-day event on the 18th ends on the 19th. */
function allDayEvent(start: string, endExclusive: string, summary: string) {
  return {
    start: { date: start },
    end: { date: endExclusive },
    summary,
    _entityId: CALENDAR,
  };
}

function timedEvent(start: string, end: string, summary: string) {
  return {
    start: { dateTime: start },
    end: { dateTime: end },
    summary,
    _entityId: CALENDAR,
  };
}

/** The event row carrying a given title, so assertions can be scoped to one event. */
function rowFor(container: ParentNode, title: string): Element {
  const titles = Array.from(container.querySelectorAll('.event-title')).filter(
    (element) => element.textContent?.trim() === title,
  );
  expect(titles.length).toBeGreaterThan(0);
  const row = titles[0].closest('td.event');
  expect(row).not.toBeNull();
  return row as Element;
}

/** Every row for a title, in document order — a split event contributes one per day. */
function rowsFor(container: ParentNode, title: string): Element[] {
  return Array.from(container.querySelectorAll('.event-title'))
    .filter((element) => element.textContent?.trim() === title)
    .map((element) => element.closest('td.event'))
    .filter((row): row is Element => row !== null);
}

function badgeIn(row: ParentNode): Element | null {
  return row.querySelector('.allday-badge');
}

/** The time row's text with the badge removed, so the remainder can be asserted alone. */
function timeTextIn(row: ParentNode): string {
  const timeActual = row.querySelector('.time-actual');
  if (!timeActual) return '';
  const clone = timeActual.cloneNode(true) as Element;
  clone.querySelector('.allday-badge')?.remove();
  clone.querySelector('ha-icon')?.remove();
  return clone.textContent?.trim() ?? '';
}

describe('allday_badge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the option is genuinely off by default', () => {
    it('renders no badge, and the label stays in the time text', () => {
      const config = buildConfig({ days_to_show: 5 });
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config);

      expect(badgeIn(rowFor(container, 'Bin day'))).toBeNull();
      expect(timeTextIn(rowFor(container, 'Bin day'))).toBe('All day');
    });

    it('leaves the multi-day phrase joined by a comma', () => {
      const config = buildConfig({ days_to_show: 8, split_multiday_events: false });
      const container = renderList([allDayEvent('2026-06-18', '2026-06-21', 'Festival')], config);

      expect(timeTextIn(rowFor(container, 'Festival'))).toBe('All day, until Saturday, Jun 20');
    });
  });

  describe('which events qualify', () => {
    const config = () =>
      buildConfig({
        allday_badge: 'time',
        allday_badge_style: 'tinted',
        days_to_show: 8,
        split_multiday_events: false,
      });

    it('badges a single-day all-day event, leaving no time text beside it', () => {
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());
      const row = rowFor(container, 'Bin day');

      expect(badgeIn(row)?.textContent).toBe('all day');
      // Nothing follows the label, so there is no empty span left behind to lay out.
      expect(timeTextIn(row)).toBe('');
      expect(row.querySelectorAll('.time-actual > span')).toHaveLength(1);
    });

    it('badges a multi-day all-day event and drops the comma before the remainder', () => {
      const container = renderList([allDayEvent('2026-06-18', '2026-06-21', 'Festival')], config());
      const row = rowFor(container, 'Festival');

      expect(badgeIn(row)?.textContent).toBe('all day');
      expect(timeTextIn(row)).toBe('until Saturday, Jun 20');
      // The joined form must not survive anywhere in the row.
      expect(row.textContent).not.toContain('All day,');
    });

    it('does not badge an unsplit timed multi-day event', () => {
      const container = renderList(
        [timedEvent('2026-06-17T17:00:00.000Z', '2026-06-22T10:00:00.000Z', 'Conference')],
        config(),
      );
      const row = rowFor(container, 'Conference');

      expect(badgeIn(row)).toBeNull();
      expect(timeTextIn(row)).toContain('until');
    });

    it('badges the middle segment of a split timed multi-day event, but not its ends', () => {
      const container = renderList(
        [timedEvent('2026-06-17T09:00:00.000Z', '2026-06-19T17:00:00.000Z', 'Offsite')],
        buildConfig({
          allday_badge: 'time',
          allday_badge_style: 'tinted',
          days_to_show: 8,
          split_multiday_events: true,
        }),
      );
      const rows = rowsFor(container, 'Offsite');

      // Three days: a timed first, an all-day middle, a timed last.
      expect(rows).toHaveLength(3);
      expect(badgeIn(rows[0])).toBeNull();
      expect(badgeIn(rows[1])?.textContent).toBe('all day');
      expect(badgeIn(rows[2])).toBeNull();
    });

    it('does not badge an ordinary timed event', () => {
      const container = renderList(
        [timedEvent('2026-06-18T09:00:00.000Z', '2026-06-18T10:00:00.000Z', 'Dentist')],
        config(),
      );

      expect(badgeIn(rowFor(container, 'Dentist'))).toBeNull();
    });
  });

  describe('how the badge is drawn', () => {
    const config = () =>
      buildConfig({ allday_badge: 'time', allday_badge_style: 'tinted', days_to_show: 5 });

    it('sits outside .time-text, where the time_max_lines clamp cannot truncate it', () => {
      // The clamp selector is `.time .time-actual .time-text > span`. A badge inside
      // `.time-text` would match it and be line-clamped like body text, so this pins the
      // structural choice rather than the styling that depends on it.
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.parentElement?.classList.contains('time-actual')).toBe(true);
      expect(badge?.closest('.time-text')).toBeNull();
    });

    it('keeps the label in its natural case, leaving uppercase to CSS', () => {
      // Uppercasing in the DOM would reach the accessibility tree, where some screen
      // readers spell capitals out letter by letter.
      const container = renderList([allDayEvent('2026-06-18', '2026-06-19', 'Bin day')], config());

      expect(badgeIn(rowFor(container, 'Bin day'))?.textContent).toBe('all day');
    });

    it('declares the language, which is what makes the CSS uppercase correct', () => {
      // Greek loses its tonos in capitals, and a browser only applies that rule when the
      // language is declared. Without `lang` the badge would read ΟΛΟΉΜΕΡΟ.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        config(),
        'el',
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.getAttribute('lang')).toBe('el');
      expect(badge?.textContent).toBe('Ολοήμερο');
    });

    it('republishes the calendar accent color, which no descendant could otherwise read', () => {
      // The accent reaches the row as an inline `border-inline-start` value. The badge
      // carries its own copy so the stylesheet can blend it.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({
          allday_badge: 'time',
          allday_badge_style: 'tinted',
          days_to_show: 5,
          entities: [{ entity: CALENDAR, accent_color: '#ff0000' }],
        }),
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.getAttribute('style')?.replace(/\s/g, '')).toContain(
        '--calendar-card-event-accent:#ff0000',
      );
    });

    it('localizes the label', () => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        config(),
        'de',
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.textContent).toBe('ganztägig');
    });
  });

  describe('the colour the treatment is drawn in', () => {
    /*
     * `allday_badge_color` is the second axis: the treatment names a SHAPE, this names whose
     * colour that shape carries. Two of its three sources need nothing in the stylesheet at
     * all -- `accent` is the default every rule already describes, and a custom colour is
     * handed to the pill AS the accent, because a colour the whole card shares is just the
     * accent overridden. Only `text` carries a class, and only `text` publishes a token.
     *
     * That asymmetry is the thing worth pinning. A custom colour that arrived any other way
     * would need every rule to learn about a second source, and the chroma recovery would
     * stop reaching it.
     */
    const withColor = (position: string, color: string) =>
      buildConfig({
        allday_badge: position,
        allday_badge_style: 'tinted',
        allday_badge_color: color,
        days_to_show: 5,
        entities: [{ entity: CALENDAR, accent_color: '#ff0000' }],
      });

    const pillFor = (container: HTMLElement, position: string) =>
      position === 'time'
        ? badgeIn(rowFor(container, 'Bin day'))
        : (rowFor(container, 'Bin day')?.querySelector('.allday-title-pill') ?? null);

    it.each(['time', 'title'])('hands a custom colour over as the accent, at %s', (position) => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        withColor(position, '#b5651d'),
      );
      const pill = pillFor(container, position);

      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('style')?.replace(/\s/g, '')).toContain(
        '--calendar-card-event-accent:#b5651d',
      );
      // The calendar's own accent is REPLACED, not sat beside: one card-wide colour means
      // every event alike, which is the whole difference from `accent`.
      expect(pill?.getAttribute('style')).not.toContain('#ff0000');
      // And no class, because nothing about the shape rules changes.
      expect(pill?.className).not.toContain('allday-source-text');
    });

    it.each(['time', 'title'])('marks the text source with a class, at %s', (position) => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        withColor(position, 'text'),
      );
      const pill = pillFor(container, position);

      expect(pill?.className).toContain('allday-source-text');
    });

    it('publishes the TIME colour on the time row', () => {
      // Not `currentColor`, and not a colour resolved here. The stylesheet cannot use
      // currentColor because `filled` sets a contrasting ink that its own ground would then
      // read back; the renderer cannot resolve the colour because it is a theme token. Naming
      // the property `.time` sets its own colour from is what makes the two agree.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        withColor('time', 'text'),
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.getAttribute('style')).toContain(
        '--badge-source: var(--calendar-card-color-time)',
      );
    });

    it('publishes the TITLE colour on the title, not the time colour', () => {
      // The one source that reads differently at each position, and the reason it is worth
      // two tests rather than one: a title pill following the TIME colour would be wrong in a
      // way no shared assertion could see.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({
          allday_badge: 'title',
          allday_badge_color: 'text',
          event_color: '#336699',
          days_to_show: 5,
        }),
      );
      const style = rowFor(container, 'Bin day')
        ?.querySelector('.allday-title-pill')
        ?.getAttribute('style');

      expect(style?.replace(/\s/g, '')).toContain('--badge-source:#336699');
      expect(style).not.toContain('--calendar-card-color-time');
    });

    it('leaves the accent source carrying neither the class nor the token', () => {
      // The control for all four above: without it they would pass against a card that added
      // the class and the token unconditionally.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        withColor('time', 'accent'),
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge?.className).toBe('allday-badge allday-pill-tinted');
      expect(badge?.getAttribute('style')).not.toContain('--badge-source');
      expect(badge?.getAttribute('style')?.replace(/\s/g, '')).toContain(
        '--calendar-card-event-accent:#ff0000',
      );
    });

    describe('the colour resolver itself', () => {
      it.each(['accent', 'text'])('takes %s as a source, not as a colour', (value) => {
        expect(Helpers.resolveAlldayBadgeColor(value)).toEqual({ source: value });
      });

      it.each(['ACCENT', ' Text '])('folds case and space on a keyword: %s', (value) => {
        expect(Helpers.resolveAlldayBadgeColor(value).source).not.toBe('custom');
      });

      it.each([undefined, null, '', '   ', 42, true])(
        'falls back to the accent for %s',
        (value) => {
          expect(Helpers.resolveAlldayBadgeColor(value)).toEqual({ source: 'accent' });
        },
      );

      it.each(['#ff6c92', 'tomato', 'rgb(1, 2, 3)', 'var(--my-token)'])(
        'takes %s as a colour',
        (value) => {
          expect(Helpers.resolveAlldayBadgeColor(value)).toEqual({
            source: 'custom',
            color: value,
          });
        },
      );

      it('never folds the case of a colour', () => {
        // 🚨 Custom property names are case-sensitive, so folding `var(--MyToken)` turns a
        // working theme token into one that resolves to nothing. Only the keyword comparison
        // folds, and it folds a copy.
        expect(Helpers.resolveAlldayBadgeColor('var(--MyToken)')).toEqual({
          source: 'custom',
          color: 'var(--MyToken)',
        });
      });

      it('takes a typo as a colour rather than correcting it', () => {
        // The one badge option whose value set is OPEN, which changes what a typo does. The
        // other two are closed sets that fall back. Here an unrecognized string IS a colour,
        // because that is the point -- the same contract `accent_color` has.
        expect(Helpers.resolveAlldayBadgeColor('acccent')).toEqual({
          source: 'custom',
          color: 'acccent',
        });
      });
    });
  });

  describe('the four treatments', () => {
    // The constant itself, not a copy of it. A hand-written literal that happens to match a
    // table reads as a reconciliation and is one only until somebody edits the table -- the
    // trap the stylesheet gate records against `ALLDAY_BADGE_STYLES` in as many words.
    const styles = [...Helpers.ALLDAY_BADGE_STYLES];

    it.each(styles)('draws %s as its own class, so the stylesheet can tell them apart', (style) => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({ allday_badge: 'time', allday_badge_style: style, days_to_show: 5 }),
      );
      const badge = badgeIn(rowFor(container, 'Bin day'));

      expect(badge).not.toBeNull();
      // The treatment class is deliberately NOT prefixed with the position. Both positions
      // wear the same four, which is what lets the stylesheet declare each colour derivation
      // once -- so a name tied to one position would either be a lie at the other or force a
      // second copy of every rule.
      expect(badge?.className).toBe(`allday-badge allday-pill-${style}`);
    });

    it.each(styles)('draws %s at the title position too, from the same class', (style) => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({ allday_badge: 'title', allday_badge_style: style, days_to_show: 5 }),
      );
      const pill = rowFor(container, 'Bin day')?.querySelector('.allday-title-pill');

      expect(pill).not.toBeNull();
      expect(pill?.className).toBe(`allday-title-pill allday-pill-${style}`);
      expect(badgeIn(rowFor(container, 'Bin day'))).toBeNull();
    });

    it('falls back to the default treatment rather than off for an unknown style', () => {
      // The asymmetry against the position resolver below is the point. The closed-set rule
      // exists so a value that READS AS OFF cannot turn a feature on; no treatment name reads
      // as off, and `allday_badge_style` cannot answer "is there a badge" at all -- only
      // "which one". Drawing nothing because `tintd` is not a word would be the same class of
      // surprise pointing the other way.
      for (const value of ['tintd', 'solid', '', 'true']) {
        const container = renderList(
          [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
          buildConfig({ allday_badge: 'time', allday_badge_style: value, days_to_show: 5 }),
        );

        expect(badgeIn(rowFor(container, 'Bin day'))?.className, value).toBe(
          `allday-badge allday-pill-${Helpers.DEFAULT_ALLDAY_BADGE_STYLE}`,
        );
      }
    });

    it('is case- and whitespace-tolerant, because YAML is', () => {
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({
          allday_badge: '  Time  ',
          allday_badge_style: '  Filled  ',
          days_to_show: 5,
        }),
      );

      expect(badgeIn(rowFor(container, 'Bin day'))?.className).toContain('allday-pill-filled');
    });
  });

  describe('the position is a closed set, and everything outside it is off', () => {
    it('renders nothing at all for a value outside the closed set', () => {
      // The failure this guards is `getTodayIndicatorType`'s: there `'none'` DRAWS a dot,
      // because every unmatched string reached the default. A value that reads as off must
      // never turn the feature on, so the table is closed and anything outside it is off.
      //
      // Both placements are asserted, not just the time row. Checking one would pass against
      // a resolver that fell through to the other, which is precisely the bug shape.
      for (const value of ['none', 'off', 'Time!', 'true', '', 'row', 'summary', true, false]) {
        const container = renderList(
          [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
          buildConfig({ allday_badge: value, days_to_show: 5 }),
        );
        const row = rowFor(container, 'Bin day');

        expect(badgeIn(row), String(value)).toBeNull();
        expect(row?.querySelector('.allday-title-pill'), String(value)).toBeNull();
      }
    });

    it('leaves the time row alone at the title position', () => {
      // The two positions compose rather than compete: the pill says THAT an event is
      // all-day, the time row says HOW LONG it runs, which for a multi-day event is real
      // information the pill cannot carry. So the title position must not quietly strip the
      // label out of the time row the way the time position does.
      const events = [allDayEvent('2026-06-18', '2026-06-21', 'Festival')];
      const plain = renderList(events, buildConfig({ days_to_show: 8 }));
      const titled = renderList(events, buildConfig({ allday_badge: 'title', days_to_show: 8 }));

      const timeOf = (c: HTMLElement) =>
        rowFor(c, 'Festival')?.querySelector('.time-actual')?.textContent?.trim();

      expect(timeOf(titled)).toBe(timeOf(plain));
      expect(timeOf(titled)).not.toBe('');
    });
  });

  /*
   * The renderer routes on the two names EXACTLY, so an open resolver is invisible here:
   * `resolveAlldayBadgePosition('row')` returning 'row' draws no pill, because 'row' is
   * neither branch. A mutation that deleted the closed-set check therefore passed every
   * rendering test in this file.
   *
   * It is not invisible in the EDITOR, which is what makes it worth gating. The synthetic
   * field derives the dropdown's value from this resolver, so an open one puts a value in
   * the control that the control does not offer; and the schema reveals the treatment select
   * whenever the resolver returns non-null, so a garbage position would show a styling
   * control for a badge that is not drawn.
   *
   * Assert the resolver directly rather than through a render, since the render is precisely
   * the layer that cannot tell the difference.
   */
  describe('the position resolver itself', () => {
    it.each(['time', 'title'])('accepts %s', (value) => {
      expect(Helpers.resolveAlldayBadgePosition(value)).toBe(value);
    });

    it.each(['  Time  ', 'TITLE'])('normalizes %s, because YAML is written by hand', (value) => {
      expect(Helpers.resolveAlldayBadgePosition(value)).toBe(value.trim().toLowerCase());
    });

    it.each(['off', 'none', 'row', 'summary', 'label', 'tinted', 'true', '', '   ', 'Time!'])(
      'resolves %s to off, because the table is closed',
      (value) => {
        expect(Helpers.resolveAlldayBadgePosition(value)).toBeNull();
      },
    );

    it.each([true, false, null, undefined, 0, 1, {}, []])(
      'resolves the non-string %s to off',
      (value) => {
        expect(Helpers.resolveAlldayBadgePosition(value)).toBeNull();
      },
    );
  });

  describe('the two defaults that have to agree', () => {
    /*
     * 🚨 There are TWO defaults per badge option, in different modules, and nothing made
     * them agree. `DEFAULT_CONFIG` is merged in by `setConfig`, so it is what a card WITHOUT
     * the key draws; `DEFAULT_ALLDAY_BADGE_STYLE` is the resolver's answer for a key that is
     * present and unusable. A card omitting the option and a card carrying a typo would
     * silently draw different pills, and every existing test would pass, because each
     * exercises only one of the two paths.
     *
     * This is not hypothetical. A pin added to the flagship guide's suite resolved
     * `GUIDE_CONFIG.allday_badge_color` -- absent from that page's YAML -- and so asserted
     * the RESOLVER's fallback while claiming to protect the CARD's default. It survived
     * flipping the card default outright.
     *
     * Both options are covered, since the colour key has the same pair and the same trap.
     */
    it('resolves an absent option and an unusable one to the same thing', () => {
      // The absent path: what the card merges in.
      expect(Helpers.resolveAlldayBadgeStyle(Config.DEFAULT_CONFIG.allday_badge_style)).toBe(
        Helpers.DEFAULT_ALLDAY_BADGE_STYLE,
      );
      expect(Helpers.resolveAlldayBadgeColor(Config.DEFAULT_CONFIG.allday_badge_color)).toEqual({
        source: Helpers.DEFAULT_ALLDAY_BADGE_COLOR,
      });

      // And the card's own default has to be a value the resolver accepts at all -- a typo
      // there would resolve to the fallback and hide itself.
      expect([...Helpers.ALLDAY_BADGE_STYLES]).toContain(Config.DEFAULT_CONFIG.allday_badge_style);
      expect([...Helpers.ALLDAY_BADGE_COLOR_SOURCES]).toContain(
        Config.DEFAULT_CONFIG.allday_badge_color,
      );
    });

    it('draws the same pill for an omitted option as for an unusable one', () => {
      // The end-to-end form of the above, through the renderer rather than the resolvers, so
      // it holds even if the two ever stop being the only path to a class name.
      //
      // 🚨 The omitted arm passes NO key and lets `buildConfig` merge `DEFAULT_CONFIG` in,
      // which is what `setConfig` does for a real card. Written first as a `delete` of the
      // key from the already-merged config, it bypassed the merge entirely and sent BOTH
      // arms to the resolver's fallback -- so it agreed with itself no matter how far the
      // two constants had drifted, and stayed green while the sibling assertion above
      // failed on exactly that mutation.
      const classFor = (overrides: Record<string, unknown>) => {
        const container = renderList(
          [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
          buildConfig({ allday_badge: 'time', days_to_show: 5, ...overrides }),
        );
        return badgeIn(rowFor(container, 'Bin day'))?.className;
      };

      const omitted = classFor({});
      expect(omitted).toBe(`allday-badge allday-pill-${Config.DEFAULT_CONFIG.allday_badge_style}`);
      expect(classFor({ allday_badge_style: 'tintd' })).toBe(omitted);
    });
  });

  describe('the style resolver itself', () => {
    it.each([...Helpers.ALLDAY_BADGE_STYLES])('accepts %s', (value) => {
      expect(Helpers.resolveAlldayBadgeStyle(value)).toBe(value);
    });

    it.each(['tintd', 'solid', '', 'off', 'true'])(
      'falls back to the default for %s, rather than to nothing',
      (value) => {
        expect(Helpers.resolveAlldayBadgeStyle(value)).toBe(Helpers.DEFAULT_ALLDAY_BADGE_STYLE);
      },
    );

    it('never returns null, because it cannot answer whether there is a badge', () => {
      for (const value of [undefined, null, true, 0, {}, []]) {
        expect(Helpers.resolveAlldayBadgeStyle(value)).not.toBeNull();
      }
    });

    it('defaults to a treatment the editor actually offers', () => {
      // A default outside the dropdown's option list would render the control blank.
      expect(Helpers.ALLDAY_BADGE_STYLES).toContain(Helpers.DEFAULT_ALLDAY_BADGE_STYLE);
    });
  });

  /*
   * The editor keeps its own copy of each value set, because a schema names plain strings and
   * cannot import a `const` tuple's type. Two hand-written copies of one table is precisely
   * the shape AGENTS.md warns about, and it is unguarded in both directions:
   *
   *   - a treatment added to ALLDAY_BADGE_STYLES but not to the editor list renders correctly
   *     from YAML and is silently absent from the dropdown, so nobody can reach it from the UI;
   *   - a value added to the editor list but not to the resolver is OFFERED by the dropdown
   *     and then rejected at render, falling back to the default with no error.
   *
   * Measured before this existed: planting a sixth treatment in ALLDAY_BADGE_STYLES left the
   * entire suite green at 3195 passed. Only `check:docs` caught it, and only because it
   * reconciles the DOCS table against the constant -- nothing looked at the editor at all.
   *
   * Reconciled by value in both directions, so neither a dropped entry nor an unexplained new
   * one can pass.
   */
  describe('an empty day is not an all-day event', () => {
    /*
     * It looks exactly like one. An empty day is a placeholder the card invents for a day
     * with nothing on it, and it carries a date-only start -- so `allDayLabel` is defined for
     * it and it qualified for a pill. Shipped as a filled capsule around "No upcoming
     * events", found by rendering a column-view card and reading the pill text rather than by
     * any test.
     *
     * The time position never showed it, which is why this went unnoticed: a badge is only
     * PLACED inside the `shouldShowTime` branch, and that already excludes empty days. The
     * title has no such branch, so the exclusion has to be written out.
     *
     * Both positions are asserted. The time one is a regression guard on an exclusion that is
     * currently a side effect of where the markup sits -- if the badge is ever moved out of
     * that branch, this says so.
     */
    const withEmptyDays = (position: string) =>
      buildConfig({
        allday_badge: position,
        allday_badge_style: 'filled',
        days_to_show: 3,
        show_empty_days: true,
      });

    it.each(['title', 'time'])('draws no pill on an empty day at position %s', (position) => {
      const container = renderList([], withEmptyDays(position));

      // The control: empty days must actually be rendered, or this asserts nothing at all.
      expect(container.querySelectorAll('.event-title').length).toBeGreaterThan(0);

      expect(container.querySelector('.allday-title-pill')).toBeNull();
      expect(container.querySelector('.allday-badge')).toBeNull();
    });

    it('republishes the calendar accent on the title pill, as the time badge does', () => {
      // The sixth unguarded declaration, and the one that matters most: this property is
      // written in exactly two places and READ in ten, so losing it takes four of the five
      // treatments with it -- only the text colour source, which names no accent, survives.
      // Deleting the
      // binding left the suite green at 3221, and so did replacing the accent with
      // `rebeccapurple`; the mirror binding on the time badge was already caught, and so was
      // the class on this very element, so nothing absorbed it.
      //
      // The value is asserted, not merely its presence, because a binding that survives with
      // the WRONG colour is the failure mode a presence check cannot see.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        buildConfig({
          allday_badge: 'title',
          allday_badge_style: 'filled',
          days_to_show: 5,
          entities: [{ entity: CALENDAR, accent_color: '#123456' }],
        }),
      );
      const pill = rowFor(container, 'Bin day')?.querySelector('.allday-title-pill');

      expect(pill).not.toBeNull();
      expect(pill?.getAttribute('style')).toContain('--calendar-card-event-accent: #123456');
    });

    it('draws no title pill on a timed event', () => {
      // The guard is `hasAllDayLabel`, and nothing witnessed it at the TITLE position -- a
      // mutation dropping it there left the suite green at 3202, so the pill could have been
      // made to wrap every event on the card without a single test noticing. The time
      // position was already covered; the title inherited none of it.
      const container = renderList(
        [
          {
            start: { dateTime: '2026-06-18T09:00:00.000Z' },
            end: { dateTime: '2026-06-18T10:00:00.000Z' },
            summary: 'Dentist',
            _entityId: CALENDAR,
          } as unknown as Types.CalendarEventData,
        ],
        buildConfig({ allday_badge: 'title', allday_badge_style: 'filled', days_to_show: 5 }),
      );

      // The control: the row has to be there for its lack of a pill to mean anything.
      expect(rowFor(container, 'Dentist')).not.toBeNull();
      expect(container.querySelector('.allday-title-pill')).toBeNull();
      expect(container.querySelector('.allday-badge')).toBeNull();
    });

    it('still draws one on a real all-day event in the same card', () => {
      // Which is what stops the test above passing because pills are broken outright.
      const container = renderList(
        [allDayEvent('2026-06-18', '2026-06-19', 'Bin day')],
        withEmptyDays('title'),
      );

      expect(container.querySelector('.allday-title-pill')).not.toBeNull();
    });
  });

  describe('the editor offers exactly the values the resolvers accept', () => {
    it('offers every treatment and no others', () => {
      expect([...EditorSchemas.ALLDAY_BADGE_STYLE_OPTIONS].sort()).toEqual(
        [...Helpers.ALLDAY_BADGE_STYLES].sort(),
      );

      // 🚨 And in the SAME ORDER, not merely the same members. Both tables document
      // themselves as quietest-first, and a claim made in two places can disagree with
      // itself: sorting both sides before comparing is exactly what would hide it. The
      // dropdown is what a user reads top to bottom, so the order is a user-visible
      // property rather than an internal detail.
      expect([...EditorSchemas.ALLDAY_BADGE_STYLE_OPTIONS]).toEqual([
        ...Helpers.ALLDAY_BADGE_STYLES,
      ]);
    });

    it('offers every position, plus off and nothing else', () => {
      // `off` is the one legitimate difference: it is the editor's spelling for "no pill",
      // which the resolver expresses as null rather than as a member of the set. Asserted as
      // an exact set rather than as a subset, so a second UI-only value cannot creep in.
      expect([...EditorSchemas.ALLDAY_BADGE_POSITION_OPTIONS].sort()).toEqual(
        ['off', ...Helpers.ALLDAY_BADGE_POSITIONS].sort(),
      );
    });

    it('offers the positions in the order the card lays them out', () => {
      /*
       * Order is a decision here, not an accident, and the set comparison above is
       * deliberately blind to it -- it sorts both sides so that a value creeping in is
       * caught regardless of where it lands. So the order needs its own assertion or
       * nothing holds it.
       *
       * `off` leads because it is the default. `title` comes before `time` because the
       * title sits ABOVE the time row on the card, so a dropdown offering them the other
       * way round reads against the thing it is describing. It shipped that way round
       * first and was corrected.
       */
      expect(EditorSchemas.ALLDAY_BADGE_POSITION_OPTIONS).toEqual(['off', 'title', 'time']);
      expect(Helpers.ALLDAY_BADGE_POSITIONS).toEqual(['title', 'time']);
    });

    it('resolves every treatment the dropdown offers to itself', () => {
      // The set comparison above would still pass if the resolver lower-cased or trimmed a
      // value into something else, so walk them.
      for (const style of EditorSchemas.ALLDAY_BADGE_STYLE_OPTIONS) {
        expect(Helpers.resolveAlldayBadgeStyle(style), style).toBe(style);
      }
    });

    it('resolves every position the dropdown offers, and only off to nothing', () => {
      for (const position of EditorSchemas.ALLDAY_BADGE_POSITION_OPTIONS) {
        const resolved = Helpers.resolveAlldayBadgePosition(position);
        if (position === 'off') expect(resolved, position).toBeNull();
        else expect(resolved, position).toBe(position);
      }
    });
  });

  it('leaves no text node between the badge and the time text', () => {
    // `${allDayBadgeEl}${timeText}` is written tight on purpose, and the comment there says
    // why: `.time-actual` is a flex row and flex drops a whitespace-only text node between
    // two items, so a space renders as nothing TODAY -- but the markup is not meant to depend
    // on the container staying a flex row. Nothing held that. Reintroducing the space left
    // the suite green at 3206.
    //
    // 🚨 This cannot be asserted through the DOM snapshot. Per AGENTS.md the serializer
    // normalizes whitespace BETWEEN TAGS only, which is exactly the position the space would
    // occupy -- so a snapshot passes either way. Walking the child nodes is what sees it.
    //
    // Nor can the site be pinned with a `prettier-ignore`: inside an `html` template that has
    // to be an HTML comment, which lit renders as a real comment NODE. Adding one broke 25
    // DOM snapshots. This test is the guard; there is nothing to put in the template.
    const container = renderList(
      [allDayEvent('2026-06-18', '2026-06-21', 'Festival')],
      buildConfig({ allday_badge: 'time', days_to_show: 8 }),
    );
    const actual = rowFor(container, 'Festival')?.querySelector('.time-actual');

    // The control: both elements have to be present for their adjacency to mean anything.
    expect(actual?.querySelector('.allday-badge')).not.toBeNull();

    const badge = actual!.querySelector('.allday-badge')!;
    let node = badge.nextSibling;
    while (node && node.nodeType === Node.COMMENT_NODE) node = node.nextSibling;

    if (node && node.nodeType === Node.TEXT_NODE) {
      expect(node.textContent, 'text node directly after the badge').toBe('');
    }
  });

  describe('the option reaches the DOM at all', () => {
    it('changes the rendered markup, so the assertions above are not vacuous', () => {
      const events = [allDayEvent('2026-06-18', '2026-06-21', 'Festival')];
      const off = serialize(renderList(events, buildConfig({ days_to_show: 8 })));
      const on = serialize(
        renderList(
          events,
          buildConfig({ allday_badge: 'time', allday_badge_style: 'tinted', days_to_show: 8 }),
        ),
      );

      expect(off).not.toBe(on);
      expect(off).not.toContain('allday-badge');
      expect(on).toContain('allday-badge');
    });
  });
});
