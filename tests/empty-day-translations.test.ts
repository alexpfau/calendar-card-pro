import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as Localize from '../src/translations/localize';
import * as Events from '../src/utils/events';

/**
 * The empty-day notice's default wording, in every supported card language.
 *
 * The card writes this string onto a day that has nothing on it. It used to say "No
 * upcoming events" and its equivalents, which is a claim about the *future* — correct
 * on a future day, wrong on a past one, and the card draws both. Now that a past
 * notice dims rather than disappearing, the wording has to be date-neutral in all 35
 * languages, or a dimmed row reads as a statement about a future that has already
 * happened.
 *
 * ## Why this is pinned by value and reconciled, not walked
 *
 * `for (const key of Object.keys(TABLE)) expect(TABLE[key]).toBeDefined()` reads like
 * coverage and is not: delete an entry and the loop simply runs one fewer time, so the
 * table can shrink with the suite green. That has been found three times in this
 * repository. This file therefore does two separate things, and neither is a walk:
 *
 * 1. **Pins the whole map by value.** `EXPECTED` below is the complete approved map,
 *    written out. A changed string, a dropped language or an unexplained new one all
 *    fail, because the comparison is `toEqual` against a literal rather than a lookup
 *    keyed by whatever happens to exist.
 * 2. **Reconciles three independent surfaces in both directions** — the files on disk,
 *    the runtime `TRANSLATIONS` registrations, and this literal. A file nothing
 *    registers is invisible to users; a registration with no file cannot build; and
 *    either one missing from the literal means this gate quietly stopped covering it.
 *
 * The three are genuinely independent mechanisms rather than one read three times: the
 * disk set comes from `readdirSync`, the runtime set from importing the module, and the
 * literal from this file. Only the first two could ever share a cause.
 */

/** Where the card's own language resources live. Editor strings are a separate family. */
const LANGUAGE_DIR = join(__dirname, '..', 'src', 'translations', 'languages');

/**
 * The complete approved map, filename to `noEvents` value.
 *
 * Lithuanian and Slovak are **retentions, not omissions**: both already read as
 * date-neutral, so the approved map keeps them verbatim. They are listed here for the
 * same reason as every other language — a literal that skipped them would let them
 * change without failing anything.
 *
 * These are real language proposals reviewed against the project's own editor glossary.
 * They are **not native-speaker-certified**; see this file's closing note.
 */
const EXPECTED: Record<string, string> = {
  'bg.json': 'Няма събития',
  'ca.json': 'Cap esdeveniment',
  'cs.json': 'Žádné události',
  'da.json': 'Ingen begivenheder',
  'de.json': 'Keine Termine',
  'el.json': 'Δεν υπάρχουν γεγονότα',
  'en-GB.json': 'No events',
  'en.json': 'No events',
  'es.json': 'No hay eventos',
  'et.json': 'Sündmusi pole',
  'fi.json': 'Ei tapahtumia',
  'fr.json': 'Aucun événement',
  'he.json': 'אין אירועים',
  'hr.json': 'Nema događaja',
  'hu.json': 'Nincs esemény',
  'is.json': 'Engir viðburðir',
  'it.json': 'Nessun evento',
  'lt.json': 'Nėra įvykių',
  'lv.json': 'Nav notikumu',
  'nb.json': 'Ingen hendelser',
  'nl.json': 'Geen afspraken',
  'nn.json': 'Ingen hendingar',
  'pl.json': 'Brak wydarzeń',
  'pt.json': 'Nenhum evento',
  'ro.json': 'Nu sunt evenimente',
  'ru.json': 'Нет событий',
  'sk.json': 'Žiadne udalosti',
  'sl.json': 'Ni dogodkov',
  'sv.json': 'Inga händelser',
  'th.json': 'ไม่มีเหตุการณ์',
  'tr.json': 'Etkinlik yok',
  'uk.json': 'Немає подій',
  'vi.json': 'Không có sự kiện',
  'zh-CN.json': '没有活动',
  'zh-TW.json': '沒有活動',
};

/** The two languages the approved map deliberately leaves untouched. */
const VERBATIM_RETENTIONS = ['lt.json', 'sk.json'];

/** A filename as the lowercase key the runtime registers it under. */
function runtimeKey(file: string): string {
  return file.replace(/\.json$/, '').toLowerCase();
}

function languageFiles(): string[] {
  return readdirSync(LANGUAGE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function onDisk(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const file of languageFiles()) {
    found[file] = JSON.parse(readFileSync(join(LANGUAGE_DIR, file), 'utf8')).noEvents;
  }
  return found;
}

describe('empty-day default wording', () => {
  it('matches the approved map exactly, in every language', () => {
    expect(onDisk()).toEqual(EXPECTED);
  });

  it('covers 35 languages and no more', () => {
    expect(languageFiles()).toHaveLength(35);
    expect(Object.keys(EXPECTED)).toHaveLength(35);
  });

  /**
   * Direction one: nothing on disk is unregistered. A language file that
   * `localize.ts` never imports resolves to English for every user, silently.
   */
  it('registers every language file at runtime, under a lowercase key', () => {
    const registered = Object.keys(Localize.TRANSLATIONS).sort();
    expect(languageFiles().map(runtimeKey).sort()).toEqual(registered);
    expect(registered).toEqual(registered.map((key) => key.toLowerCase()));
  });

  /**
   * Direction two: nothing registered is missing a file or an entry here. Written as
   * two set differences rather than a loop, so a shrunk table fails instead of
   * iterating one fewer time.
   */
  it('has a file and a pinned value for every runtime registration', () => {
    const registered = new Set(Object.keys(Localize.TRANSLATIONS));
    const fromDisk = new Set(languageFiles().map(runtimeKey));
    const fromLiteral = new Set(Object.keys(EXPECTED).map(runtimeKey));

    expect([...registered].filter((key) => !fromDisk.has(key))).toEqual([]);
    expect([...fromDisk].filter((key) => !registered.has(key))).toEqual([]);
    expect([...registered].filter((key) => !fromLiteral.has(key))).toEqual([]);
    expect([...fromLiteral].filter((key) => !registered.has(key))).toEqual([]);
  });

  /**
   * The value a user actually gets, read through the runtime rather than off the disk —
   * a third mechanism, and the only one that would notice an import wired to the wrong
   * file.
   */
  it('resolves the approved string through getTranslations for every language', () => {
    const resolved: Record<string, string> = {};
    for (const file of languageFiles()) {
      resolved[file] = Localize.getTranslations(runtimeKey(file)).noEvents;
    }
    expect(resolved).toEqual(EXPECTED);
  });

  it('keeps the two already-neutral languages verbatim', () => {
    // Pinned as their own assertion so that "unchanged" stays a decision on the record
    // rather than something a future edit can quietly reverse.
    for (const file of VERBATIM_RETENTIONS) {
      expect(EXPECTED[file]).toBe(onDisk()[file]);
    }
    expect(EXPECTED['lt.json']).toBe('Nėra įvykių');
    expect(EXPECTED['sk.json']).toBe('Žiadne udalosti');
  });

  /**
   * The point of the change. Every string is checked against the qualifiers the old
   * wording carried, in the languages that carried them, so "date-neutral" is asserted
   * rather than asserted-about.
   */
  it('carries no forward-looking qualifier in any language', () => {
    const qualifiers = [
      'upcoming',
      'próximo',
      'próximos',
      'à venir',
      'anstehend',
      'nadcházející',
      'kommende',
      'kommande',
      'nadchodzących',
      'gaidāmu',
      'tulevia',
      'tulevasi',
      'viitoare',
      'предстоящих',
      'майбутніх',
      'nadolazećih',
      'planiranih',
      'планирани',
      'προγραμματισμένα',
      'yaklaşan',
      'sắp tới',
      'næstunni',
      'gepland',
      'in arrivo',
      '即将到来',
      '即將到來',
      'ที่กำลังจะเกิดขึ้น',
      'proper',
    ];

    const offenders = Object.entries(EXPECTED).filter(([, value]) =>
      qualifiers.some((word) => value.toLowerCase().includes(word.toLowerCase())),
    );
    expect(offenders).toEqual([]);

    // Control: the probe can find a qualifier when one is present, so an empty result
    // above is a finding rather than a pattern that matches nothing.
    expect(qualifiers.some((word) => 'No upcoming events'.toLowerCase().includes(word))).toBe(true);
    expect(
      qualifiers.some((word) => 'Keine anstehenden Termine'.toLowerCase().includes(word)),
    ).toBe(true);
  });

  /**
   * Glossary alignment for the terms `scripts/editor-glossary.mjs` governs. German is
   * the one most easily got wrong — `Termin` is the decided form and `Ereignis` is
   * rejected — so it is named rather than left to the general sweep.
   */
  it('uses the glossary-decided event noun where one is governed', () => {
    expect(EXPECTED['de.json']).toBe('Keine Termine');
    expect(EXPECTED['de.json']).not.toContain('Ereignis');
    expect(EXPECTED['nl.json']).toContain('afspraken');
  });

  it('has no leading or trailing whitespace and no checkmark', () => {
    for (const [file, value] of Object.entries(EXPECTED)) {
      expect(value, file).toBe(value.trim());
      expect(value, file).not.toContain('✓');
      expect(value.length, file).toBeGreaterThan(0);
    }
  });
});

/**
 * Every language rendered, not merely resolved.
 *
 * `getTranslations` returning the right string does not prove the card draws it: the
 * renderer owns the checkmark, and `groupEventsByDay` picks between the translation and
 * a configured `empty_day_text`. This renders a real empty day in each language and
 * reads what is on screen.
 */
describe('every language renders its own empty-day notice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function drawnNotice(language: string, overrides: Partial<Types.Config> = {}): string {
    const config = buildConfig({
      entities: ['calendar.anna'],
      start_date: '2026-06-17',
      days_to_show: 1,
      show_empty_days: true,
      ...overrides,
    } as Partial<Types.Config>);
    const days = Events.groupEventsByDay([], config, false, language, 'list');
    const container = document.createElement('div');
    litRender(Render.renderGroupedEvents(days, config, language, undefined, null), container);
    return container.querySelector('.empty-day-title')?.textContent?.trim() ?? '';
  }

  it.each(Object.keys(EXPECTED))('renders %s with the renderer checkmark', (file) => {
    expect(drawnNotice(runtimeKey(file))).toBe(`✓ ${EXPECTED[file]}`);
  });

  /**
   * Regional resolution is unchanged by this edit, and these are the cases where it
   * could silently regress: three explicit regional resources that must not collapse
   * into their base, and a base that must not pick up a regional file.
   */
  it('keeps regional resources distinct from their base language', () => {
    expect(drawnNotice('en-gb')).toBe('✓ No events');
    expect(drawnNotice('zh-cn')).toBe('✓ 没有活动');
    expect(drawnNotice('zh-tw')).toBe('✓ 沒有活動');
    expect(EXPECTED['zh-CN.json']).not.toBe(EXPECTED['zh-TW.json']);
  });

  it('falls back to English for an unregistered language, whole-table', () => {
    expect(drawnNotice('xx')).toBe('✓ No events');
  });

  /**
   * Custom text wins over every language, and is never translated, trimmed or
   * decorated. The decision is truthiness: `''` is absence and selects the default,
   * `'   '` is an authored message that merely looks blank.
   */
  it('lets an authored message override the default in any language', () => {
    expect(drawnNotice('de', { empty_day_text: 'Leftovers' })).toBe('Leftovers');
    expect(drawnNotice('de', { empty_day_text: '  padded  ' })).toBe('padded');
    expect(drawnNotice('de', { empty_day_text: '' })).toBe('✓ Keine Termine');
    expect(drawnNotice('de', { empty_day_text: undefined } as Partial<Types.Config>)).toBe(
      '✓ Keine Termine',
    );
  });

  /**
   * A message equal to the *former* default is still an authored message. Nothing may
   * migrate it to the new wording, and it must not acquire the renderer's checkmark.
   */
  it('preserves a custom message equal to the old default', () => {
    expect(drawnNotice('en', { empty_day_text: 'No upcoming events' })).toBe('No upcoming events');
    expect(drawnNotice('de', { empty_day_text: 'Keine anstehenden Termine' })).toBe(
      'Keine anstehenden Termine',
    );
  });
});
