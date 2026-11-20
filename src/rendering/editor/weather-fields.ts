/**
 * The field id of the weather entity every layout draws from, at the top level. A module of its
 * own, importing nothing, so the page registry, the gates and the element all name it alike
 * without importing each other. A layout's own weather is edited on its Weather page as
 * `weather:weather.*`, stored in that layout's block (`workspace.ts` › `LAYOUT_GROUPS`).
 */

/** The weather entity every layout draws from, at the top level. */
export const WEATHER_ENTITY = 'weather:weather_entity';
