/**
 * The card's own words, kept in the direction their language reads in.
 *
 * The dashboard decides which way a card runs: Home Assistant sets the document's direction from
 * its own interface language, and the card mirrors its layout with it. The card's words are
 * written in the card's language, which can run the other way: `language: en` on a Hebrew
 * dashboard, a Home Assistant language the card does not speak and so draws in English, such as
 * Arabic or Persian, or a Hebrew card on an English dashboard.
 *
 * A word ordered by its letters reads right either way. Text with digits or punctuation at its
 * edges does not, because the bidi algorithm orders those by the direction of the line they sit
 * in. On a right-to-left dashboard an English "7:30 - 8:00" drew as "8:00 - 7:30", and "22:00
 * until Friday, Nov 13 at 2:00" moved its start to the far end of the line; a Turkish countdown,
 * "6 saat sonra", read "saat sonra 6", and the grid's "+2" read "2+". On an English dashboard a
 * Hebrew card's ranges read end first the same way, and its weekdays put the geresh before the
 * letter.
 *
 * So where the two directions differ, each piece of the card's own text is drawn between two
 * marks of its language's direction, LEFT-TO-RIGHT MARK or RIGHT-TO-LEFT MARK, one at each end.
 * A mark is a strong letter with no glyph, so the digits and punctuation between two of them
 * resolve as the language's letters do, and the piece reads as it does on a dashboard of its own
 * direction. The layout stays the dashboard's: a mark orders text and moves no box, so the time
 * sits where a mirrored row puts it, aligned as it was.
 *
 * Marks rather than a `dir` on the element, because an element's direction moves its alignment,
 * its logical margins and every `:dir()` rule under it, which is the layout this leaves alone, and
 * because a new element splits the text into another node, which Chromium places up to 2/64 px
 * differently (`isolateClockReadings` in format.ts keeps the time one text node for the same
 * reason). Marks rather than an isolate around each piece, because an isolate is neutral to what
 * is beside it: grid draws a range as two pieces, its start and its droppable end, and two
 * isolates on a right-to-left line are ordered right to left, end first, as the digits were.
 * Marked, the two join into one run.
 *
 * Where the two directions agree, or where `hass` does not say which way the dashboard runs,
 * nothing is added, and every node holds the text it always did.
 */
import type * as Types from '../config/types';
import { languageDirection } from '../translations/language-codes';

const LEFT_TO_RIGHT_MARK = '\u200e';
const RIGHT_TO_LEFT_MARK = '\u200f';

/** The mark a card's own text is drawn between, or `''` for none. */
export type LanguageMark = '' | typeof LEFT_TO_RIGHT_MARK | typeof RIGHT_TO_LEFT_MARK;

/**
 * Which way the dashboard runs, as Home Assistant decides it: right to left where its interface
 * language is marked so in its translation metadata, left to right otherwise.
 *
 * @param hass - Home Assistant instance
 * @returns The dashboard's direction, or undefined where `hass` does not carry what decides it
 */
export function dashboardDirection(hass?: Types.Hass | null): 'ltr' | 'rtl' | undefined {
  const translations = hass?.translationMetadata?.translations;
  const language = hass?.language ?? hass?.locale?.language;
  if (!translations || !language) return undefined;
  return translations[language]?.isRTL ? 'rtl' : 'ltr';
}

/**
 * The mark that keeps the card's own text in its language's direction on this dashboard.
 *
 * @param language - The card's effective language
 * @param hass - Home Assistant instance
 * @returns The language's mark where the dashboard runs the other way, `''` everywhere else
 */
export function languageMark(language: string, hass?: Types.Hass | null): LanguageMark {
  const dashboard = dashboardDirection(hass);
  const own = languageDirection(language);
  if (dashboard === undefined || dashboard === own) return '';
  return own === 'rtl' ? RIGHT_TO_LEFT_MARK : LEFT_TO_RIGHT_MARK;
}

/**
 * A piece of the card's own text, drawn between two of its language's marks.
 *
 * For drawn text only: anything that compares, measures by content or announces a string keeps
 * the plain one, as `isolateClockReadings` does.
 *
 * @param text - Text written in the card's language
 * @param mark - From `languageMark`
 * @returns The text between two marks, or unchanged where there is no mark or no text
 */
export function inLanguageDirection(text: string, mark: LanguageMark): string {
  return mark && text ? `${mark}${text}${mark}` : text;
}
