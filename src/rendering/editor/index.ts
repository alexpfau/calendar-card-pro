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
 * | `schemas/*.ts` | one module per panel — the unit of parallel work |
 * | `ha-form.ts` | our declaration of Home Assistant's schema shape |
 * | `value.ts` | the write path: default-stripping, pruning, the `column:` pass |
 * | `synthetic.ts` | UI-only fields, and the values that are invalid while typed |
 * | `localize.ts` | the three string hooks `ha-form` calls |
 * | `strings.ts` | English strings, in a fresh namespace |
 * | `styles.ts` | the chassis, and nothing that names an input element |
 *
 * Everything except `element.ts` and `styles.ts` is free of Lit and of the DOM, which
 * is what lets the test suite import a schema and assert on it directly.
 */

export { CalendarCardProEditorNext } from './element';
export { PANELS, walkSchema } from './panels';
export type { PanelDef, PanelExtra, SchemaCtx, WidthTableRow } from './panels';
export type { HaFormSchema } from './ha-form';
export { toStoredConfig, stripColumnDefaults, applyFormChange, changedKeys } from './value';
export { deriveSyntheticData, isCommittableOffset, isSyntheticKey } from './synthetic';
