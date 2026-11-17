/**
 * The views the card can render, in the order every list of them follows: the view switcher's
 * segments, the editor's layouts and the views a configuration can reach.
 *
 * A module of its own that imports nothing at runtime, so `config.ts` can read the toolbar's
 * `view_switcher` list against it without importing `view.ts`, which imports `config.ts`.
 * `view.ts` exports it again as `VIEWS`, which is where everything else reads it.
 */

import type * as Types from './types';

const ORDERED = ['list', 'column', 'grid', 'month'] as const;

/** Every view, in order. */
export const VIEWS: ReadonlyArray<Types.EffectiveView> = ORDERED;

type AssertNever<T extends never> = T;

/** A view the list leaves out fails here, at compile time, naming it. */
export type _AssertEveryViewListed = AssertNever<
  Exclude<Types.EffectiveView, (typeof ORDERED)[number]>
>;
