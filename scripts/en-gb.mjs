#!/usr/bin/env node
/**
 * The en-GB derivation — one substitution list, shared by the generator and the check.
 *
 * `en-GB` is not a translation and must never be filled to 312 keys. It is a spelling
 * variant layered over `strings.ts`, and `lookup()` resolves per key, so it should
 * override **only** where British English genuinely differs. Filling it would ship
 * hundreds of strings identical to the American ones, inflate the editor chunk for no
 * benefit, and guarantee silent divergence the next time an English string is edited.
 *
 * So it is **generated output plus an assertion**, not a file anyone writes by hand.
 * That is what makes it unable to drift, unable to lose Title Case, and unable to go
 * stale when an English string changes.
 *
 * **The measured answer is 36 keys**, and three routes agree on exactly those 36:
 *
 *   1. this list, applied to `EDITOR_STRINGS`;
 *   2. the pre-v4 editor's hand-written `en-GB.json`, which overrode 29 keys years
 *      earlier and is a strict subset;
 *   3. the vocabulary extracted from Home Assistant's own `en-GB` table and applied to
 *      our 312 keys — same 36, same per-substitution counts.
 *
 * Route 3 is weaker evidence than it first looks and the caveat is worth keeping. Taken
 * raw it yields **125** keys, because HA's `en-GB` diffs mix genuine spelling with
 * grammar fixes, style rewrites and outright errors — `home` → `overview`,
 * `movie` → `film`, `the` → `a`, and one entry whose value is in French. It only lands
 * on 36 once an orthographic filter throws those away, and that filter encodes the same
 * judgement this list encodes. The routes therefore **confirm the answer without being
 * fully independent of each other**; routes 1 and 2 are the independent pair.
 *
 * **Do not derive the count from a rate.** HA diverges on ~3.9% of its strings, which
 * would predict 12–15 of our 312. The measured answer is 36, or 11.5%, because corpus
 * shape dominates: this table configures a card's *appearance* and **32 of its 312 keys
 * contain the word `Color`**. A general UI table is not colour-dense. Any figure
 * extrapolated from HA's percentage is wrong.
 *
 * **And do not learn substitutions from HA's table wholesale.** 23 of its 61 sampled
 * divergences are casing-only — `Add event` → `Add Event` — which is contributor drift,
 * not a British convention. A generator that adopted them would silently re-case our
 * labels.
 */

/**
 * US → UK spellings, applied whole-word and case-preserving.
 *
 * The list is deliberately wider than what fires today, so that a future English string
 * is caught without anyone remembering to extend it. Only three entries fire against the
 * current table (`color` ×32, `colors` ×2, `customized` ×2); the rest are inert and cost
 * nothing.
 *
 * **Deliberately excluded**, because each would be wrong at least as often as right in a
 * Home Assistant card editor. They are listed rather than merely omitted, so that nobody
 * adds them later believing they were an oversight:
 *
 * | not substituted | why |
 * |---|---|
 * | `meter` → `metre` | a device. HA is full of electricity, gas and water *meters*. |
 * | `program` → `programme` | computing keeps `program` in British English. |
 * | `disk` → `disc` | likewise; a storage disk is a `disk` in both. |
 * | `dialog` → `dialogue` | a UI dialog is `dialog` in both; `dialogue` is conversation. |
 * | `practice` → `practise` | British splits noun/verb, so the rule is not lexical. |
 * | `license` → `licence` | same noun/verb split. |
 * | `analog` → `analogue` | kept — unambiguous — but note the pair above it. |
 */
export const SUBSTITUTIONS = [
  // -or → -our
  ['color', 'colour'],
  ['colors', 'colours'],
  ['colored', 'coloured'],
  ['coloring', 'colouring'],
  ['behavior', 'behaviour'],
  ['behaviors', 'behaviours'],
  ['favorite', 'favourite'],
  ['favorites', 'favourites'],
  ['neighbor', 'neighbour'],
  ['neighbors', 'neighbours'],
  // -ize → -ise
  ['customize', 'customise'],
  ['customized', 'customised'],
  ['customizes', 'customises'],
  ['customizing', 'customising'],
  ['customization', 'customisation'],
  ['customizations', 'customisations'],
  ['organize', 'organise'],
  ['organized', 'organised'],
  ['organization', 'organisation'],
  ['recognize', 'recognise'],
  ['recognized', 'recognised'],
  ['optimize', 'optimise'],
  ['optimized', 'optimised'],
  ['normalize', 'normalise'],
  ['normalized', 'normalised'],
  ['personalize', 'personalise'],
  ['personalized', 'personalised'],
  ['synchronize', 'synchronise'],
  ['synchronized', 'synchronise'],
  ['initialize', 'initialise'],
  ['initialized', 'initialised'],
  ['visualize', 'visualise'],
  ['visualization', 'visualisation'],
  ['anonymize', 'anonymise'],
  ['anonymized', 'anonymised'],
  // -yze → -yse
  ['analyze', 'analyse'],
  ['analyzed', 'analysed'],
  ['analyzing', 'analysing'],
  // -er → -re
  ['center', 'centre'],
  ['centers', 'centres'],
  ['centered', 'centred'],
  ['centering', 'centring'],
  // doubled -l-
  ['canceled', 'cancelled'],
  ['canceling', 'cancelling'],
  ['labeled', 'labelled'],
  ['labeling', 'labelling'],
  ['modeling', 'modelling'],
  ['traveled', 'travelled'],
  // miscellaneous, unambiguous
  ['gray', 'grey'],
  ['catalog', 'catalogue'],
  ['analog', 'analogue'],
  ['defense', 'defence'],
  ['offense', 'offence'],
  ['liter', 'litre'],
  ['liters', 'litres'],
  ['fiber', 'fibre'],
  ['aluminum', 'aluminium'],
  ['maneuver', 'manoeuvre'],
];

/** Applies the replacement with the source's capitalisation, so Title Case survives. */
const matchCase = (source, replacement) =>
  source[0] === source[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

/**
 * Rewrites one American string as British English.
 *
 * Longest source first, so `colors` is not consumed by `color` and left as `colours`
 * with a stray `s`.
 *
 * @param text - The American English string
 * @returns The British English string, unchanged when nothing applies
 */
export function britishise(text) {
  let out = text;
  for (const [us, uk] of [...SUBSTITUTIONS].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`\\b${us}\\b`, 'gi'), (m) => matchCase(m, uk));
  }
  return out;
}

/**
 * The whole en-GB file, derived.
 *
 * Emits **only** the keys the substitution changed. A key whose British and American
 * spellings are identical must not appear: an entry equal to the English is a no-op that
 * ships bytes and does nothing, and 28 of them are what the hand-written file
 * accumulated.
 *
 * Key order follows `EDITOR_STRINGS`, so the generated file reviews as a diff against
 * the table it derives from rather than against an arbitrary sort.
 *
 * @param strings - `EDITOR_STRINGS`
 * @returns The en-GB overrides
 */
export function deriveEnGb(strings) {
  const out = {};
  for (const [key, value] of Object.entries(strings)) {
    const british = britishise(value);
    if (british !== value) out[key] = british;
  }
  return out;
}
