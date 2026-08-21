/**
 * The `YEAR=` marker: an age or anniversary count read out of an event's description.
 *
 * A yearly recurring birthday event carries its own year in every occurrence, so the
 * arithmetic is a subtraction and nothing else — `age = eventYear - markerYear`. There is
 * no need for the full birth date and no "has it happened yet this year" branch, because
 * the event *is* the birthday. That is also what makes the result self-updating: nothing
 * has to be reconfigured as the years pass.
 *
 * The count is rendered as a bracketed number appended to the title, which is deliberately
 * language-neutral. `Annas Geburtstag (40)` needs no date formatting, no
 * pluralization and no translated string, so all 35 languages get it on the day it ships.
 * It is also why one implementation serves anniversaries as well as birthdays: a bracketed
 * number does not claim to be an age, so the card never has to know which it is looking at.
 *
 * Deliberately pure — no DOM and no Lit, in the same spirit as `start-date.ts`. HTML
 * stripping happens in the caller, which already does it for the displayed description.
 */

/**
 * The marker, and every boundary in it is load-bearing.
 *
 * - **No whitespace around the separator.** This is the discriminator that makes the
 *   false-positive claim actually true, and the reason is `Academic Year: 2025` — a
 *   plausible timetable description that a `\s*` grammar reads as a marker and turns into
 *   `(1)` on every event in the calendar half of the year. Prose puts a space after a
 *   colon; a marker does not. The cost is that a tidy `YEAR = 1976` is not recognized,
 *   which is a self-correctable miss against an unexplained corruption a subscribed-feed
 *   user cannot fix at all.
 * - **Start-of-string or whitespace on the left**, so the marker stands as its own token.
 *   This is what rejects `FISCALYEAR=2024` and, more usefully, the query string in a
 *   ticketing link — `https://example.com/?year=2024&…` is otherwise a clean match.
 * - **Exactly four digits, not followed by a word character**, so `YEAR=19766` does not
 *   quietly yield 1976.
 * - **Case-insensitive, and both separators.** `YEAR:1996` and `YEAR=1976` each have a
 *   real proponent on #124, and supporting both costs one character.
 */
const MARKER = /(?:^|\s)year[:=](\d{4})(?!\w)/i;

/** The same pattern, global, for removing every occurrence rather than reading the first. */
const MARKER_GLOBAL = new RegExp(MARKER.source, 'gi');

/**
 * The cheapest test that can rule a description out, used to avoid stripping HTML from
 * every event's description on every render when almost none carries a marker.
 *
 * 🚨 This must not be able to produce a false negative, which holds only because HTML
 * stripping cannot *introduce* the letters `year` — tags and entities surround text, they
 * do not spell it. The two inputs that would defeat it are a description entity-encoding
 * the letters themselves (`&#89;EAR=1976`) or a tag inside the word (`Y<b>EAR</b>=1976`).
 * Neither is something a calendar produces.
 *
 * @param rawDescription Description exactly as the calendar delivered it
 * @returns Whether the description is worth stripping and scanning
 */
export function mayCarryAgeMarker(rawDescription: string): boolean {
  return rawDescription.length > 0 && /year/i.test(rawDescription);
}

/**
 * Read the year out of a marker.
 *
 * Expects text with HTML already stripped, because that is what the user typed and sees.
 * Google Calendar's description editor emits `&nbsp;`, so `Geboren&nbsp;YEAR=1996` has no
 * ordinary space in front of the marker until entities are decoded — and `\s` does match
 * U+00A0 once they are.
 *
 * @param plainDescription Description with tags removed and entities decoded
 * @returns The four-digit year, or null when the description carries no marker
 */
export function readMarkerYear(plainDescription: string): number | null {
  const match = MARKER.exec(plainDescription);
  if (!match) return null;

  return Number(match[1]);
}

/**
 * Remove every marker from a description, and tidy what removing it leaves behind.
 *
 * The leading whitespace is part of the match, so `Geboren YEAR=1996 in Berlin` closes up
 * to `Geboren in Berlin` rather than leaving a double space. A marker on its own line
 * leaves an empty line, which the newline collapse removes; a marker that was the *whole*
 * description leaves nothing at all, and the description block is rendered behind a
 * truthiness guard, so that row simply loses its description rather than showing an empty
 * one.
 *
 * Applied whenever the marker is recognized, whether or not a count is shown. The marker
 * is card syntax rather than content, and showing the raw syntax with no number beside it
 * is the worst of the available outcomes.
 *
 * The horizontal-whitespace collapse is what stops `Geboren  YEAR=1996  in Berlin` from
 * closing up to three spaces: the left boundary consumes exactly one whitespace character
 * and the right side none, so a doubled separator loses one space of four rather than two.
 * It is a post-pass rather than a wider match because consuming the trailing run would
 * eat the boundary the *next* marker needs, and `a YEAR=1900 YEAR=1901 b` would then strip
 * only the first. It deliberately runs over the whole description rather than the seam,
 * which needs a lookbehind to locate — nothing in `src/` uses one, and a lookbehind is a
 * parse-time syntax error on an engine that lacks it, so the whole bundle would fail to
 * load rather than this one feature. The over-reach costs nothing either way: `.description`
 * sets no `white-space`, so the browser already collapses these runs before anyone sees
 * them, and the pass only runs on a description that carried a marker at all.
 *
 * @param plainDescription Description with tags removed and entities decoded
 * @returns The description without its marker
 */
export function stripAgeMarker(plainDescription: string): string {
  return plainDescription
    .replace(MARKER_GLOBAL, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The count to show for one occurrence, or null when there is nothing to show.
 *
 * Suppressing anything below 1 is the guard that earns its place, and it does more work
 * than a plausibility range on the year would. The false positives that actually occur
 * cluster at *recent* years — a feed stamping the current year into every description —
 * which any plausible range admits and which this reduces to a no-op. A future-dated
 * marker likewise vanishes rather than rendering a negative number.
 *
 * There is no upper bound. An age above 150 is implausible for a person and perfectly
 * ordinary for an anniversary, and the four-digit rule already rejects the malformed input
 * an upper bound would be aimed at.
 *
 * @param eventYear Calendar year of this occurrence, in the viewer's own time zone
 * @param markerYear Year read from the marker
 * @returns The count, or null when it would be zero or negative
 */
export function resolveAgeCount(eventYear: number, markerYear: number): number | null {
  const count = eventYear - markerYear;

  return count >= 1 ? count : null;
}

/**
 * Append the count to a title.
 *
 * Appending rather than prefixing is not a matter of taste. `groupEventsByDay` sorts
 * same-time all-day events by `summary.localeCompare`, and that sort runs *after* the
 * display copies are built — so it reads whatever this writes. A suffix sits past the
 * character two titles differ at and leaves the order untouched; a prefix would silently
 * reorder every birthday list on the card. The summary comparison is the last link of a
 * chain that tries entity index first, so it only ever fires within one calendar at one
 * all-day start; two genuinely identical titles then order by count, which is harmless.
 *
 * 🚨 **Two constraints this function does not enforce and cannot, both now live.** They
 * were written here conditionally, against a `title_replace` option that had not been
 * built; #153 and #212 shipped it in v4.1 as `replace_pattern` / `replace_with`, and both
 * requirements are implemented in `groupEventsByDay`:
 *
 * 1. **The rewrite runs before this.** `applyTextReplacement` is applied to the raw
 *    `summary` and it is that result — not the calendar's own title — that arrives here.
 *    A user's pattern therefore sees the title the calendar delivered rather than one the
 *    card has already decorated, so an end-anchored pattern does not have to tolerate a
 *    suffix its author never wrote.
 * 2. **A withheld title suppresses the count entirely**, rather than having one appended.
 *    `groupEventsByDay`'s `titleWithheld` decides that, and calls this only when it is
 *    false. `Busy (40)` announces that the hidden event is a birthday, which is exactly
 *    what #212 asked to be spared.
 *
 * The second is why the empty-title branch below is narrower than it looks. Drawing a bare
 * `(40)` is right for an event that never had a title and a **louder** leak than `Busy (40)`
 * after a deliberate deletion, since a lone bracketed number is nothing else. `titleWithheld`
 * is what tells those apart, and it has to ask the same question this function asks — it
 * tests `.trim()` on both sides for that reason. Testing the replaced title for exact
 * emptiness instead let a blank-but-not-empty result through: `Annas Geburtstag` minus
 * `[A-Za-z]+` is two spaces, which passed the guard, failed the branch below, and rendered
 * the bare count. Keep the two tests spelled the same way.
 *
 * @param summary Title to append to — the calendar's own, or what a rewrite left of it
 * @param count Count to show
 * @returns The title with the count appended
 */
export function appendAgeCount(summary: string, count: number): string {
  const trimmed = summary.trim();

  return trimmed.length > 0 ? `${summary} (${count})` : `(${count})`;
}
