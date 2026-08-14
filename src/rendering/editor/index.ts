/**
 * The schema-driven editor.
 *
 * Public surface of `src/rendering/editor/`. Import from here rather than reaching
 * into a module, so the internal layout can change without touching the card.
 *
 * Module map, for orientation:
 *
 * | Module | Holds |
 * | --- | --- |
 * | `element.ts` | the Lit element: lifecycle, panel mounts, one change handler |
 * | `panels.ts` | the panel registry and the schema-context type |
 * | `schemas/*.ts` | one module per panel, plus the vocabulary they share |
 * | `ha-form.ts` | our declaration of Home Assistant's schema shape |
 * | `value.ts` | the write path: default-stripping, pruning, the `column:` pass |
 * | `synthetic.ts` | UI-only fields, and the values that are invalid while typed |
 * | `localize.ts` | the three string hooks `ha-form` calls |
 * | `strings.ts` | English strings, in a fresh namespace |
 * | `translations/*.json` | the same keys, per language, partial by design |
 *
 * `check:i18n` imports the schema half directly and reconciles `strings.ts` against
 * the fields that use it, in both directions. That is the payoff of being
 * schema-driven: the schema is the field registry, so a missing label or a dead string
 * is a fact about data rather than something to be inferred from source text.
 * | `styles.ts` | the chassis, and nothing that names an input element |
 *
 * Everything except `element.ts` and `styles.ts` is free of Lit and of the DOM, which
 * is what lets the test suite import a schema and assert on it directly.
 *
 * This module is also the editor's **build entry**. `rollup.config.mjs` names it as the
 * input of a second, separate build, so everything in its graph — the panels, the
 * schemas, `strings.ts` and `translations/` — is emitted into `editor.js`, which a
 * browser fetches only when the editor is opened. Two builds rather than one with
 * code-splitting, so that neither emitted file imports the other; the reasoning is in
 * `rollup.config.mjs`.
 *
 * The previous editor's namespace was imported here and registered at module scope until
 * it was found to be unreachable at runtime *and* 145 KB of the editor chunk. It has
 * since been deleted; the strings worth keeping went into `translations/`.
 */

export { CalendarCardProEditor } from './element';
export { PANELS, walkSchema } from './panels';
export type { PanelDef, PanelExtra, SchemaCtx, WidthTableRow } from './panels';
export type { HaFormSchema } from './ha-form';
export { toStoredConfig, stripColumnDefaults, applyFormChange, changedKeys } from './value';
export { deriveSyntheticData, isCommittableOffset, isSyntheticKey } from './synthetic';
