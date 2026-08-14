#!/usr/bin/env node
/**
 * The en-GB derivation — one substitution list, shared by the generator and the check.
 *
 * `en-GB` is a spelling variant layered over `strings.ts`, not a full translation. It is
 * generated output plus an assertion, and it overrides only strings that genuinely differ
 * from en-US.
 */

/**
 * US → UK spellings, applied whole-word and case-preserving.
 *
 * Phrase-level exclusions avoid UI nouns where a broad British spelling rule would be
 * wrong, such as `meter`, `program`, `disk`, `dialog`, `practice` and `license`.
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
 * Emits only the keys the substitution changed, in `EDITOR_STRINGS` order.
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
