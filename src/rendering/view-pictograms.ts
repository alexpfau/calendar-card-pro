/**
 * The card's own picture of each view: the tiles of the editor's view picker, and the
 * icons of the header toolbar's view switcher.
 *
 * One drawing in two places, so the editor and the card always show the same picture for a
 * view. Shared by both bundles, and immutable, so the copy each bundle carries is inert.
 * Coordinates are kept as the strings they are written as, because the editor's data URIs
 * are built from them and must not change by a character.
 */

import * as Types from '../config/types';

/** One rectangle: x, y, width, height and corner radius, then an opacity when not solid. */
export type PictogramRect = readonly [
  x: string,
  y: string,
  width: string,
  height: string,
  rx: string,
  opacity?: string,
];

/** Every pictogram is drawn in this frame. */
export const VIEW_PICTOGRAM_VIEWBOX = '0 0 48 32';

export const VIEW_PICTOGRAMS: Readonly<Record<Types.EffectiveView, ReadonlyArray<PictogramRect>>> =
  {
    // A date, then the day's events beside it, three days stacked.
    list: [
      ['2', '3', '10', '7', '2'],
      ['15', '3', '31', '7', '2', '.4'],
      ['2', '12.5', '10', '7', '2'],
      ['15', '12.5', '31', '7', '2', '.4'],
      ['2', '22', '10', '7', '2'],
      ['15', '22', '31', '7', '2', '.4'],
    ],
    // Three day headers, each over its own column of events.
    column: [
      ['2', '3', '13', '5', '2'],
      ['17.5', '3', '13', '5', '2'],
      ['33', '3', '13', '5', '2'],
      ['2', '10.5', '13', '18.5', '2', '.4'],
      ['17.5', '10.5', '13', '18.5', '2', '.4'],
      ['33', '10.5', '13', '18.5', '2', '.4'],
    ],
    // Reads left to right as the grid's own structure: an hour axis, three day headers, an
    // all-day banner spanning two of them, then blocks whose differing heights are the whole
    // point of the view.
    grid: [
      ['9', '3', '11', '4', '1.5'],
      ['22', '3', '11', '4', '1.5'],
      ['35', '3', '11', '4', '1.5'],
      ['9', '9', '24', '3', '1.5', '.55'],
      ['2', '15.5', '5', '1.5', '.75', '.5'],
      ['2', '21', '5', '1.5', '.75', '.5'],
      ['2', '26.5', '5', '1.5', '.75', '.5'],
      ['9', '14.5', '11', '6', '1.5', '.4'],
      ['9', '23', '11', '5', '1.5', '.4'],
      ['22', '14.5', '11', '13.5', '1.5', '.4'],
      ['35', '19', '11', '7', '1.5', '.4'],
    ],
  };

/**
 * A view's rectangles as SVG markup, for a context that needs text rather than a template.
 *
 * @param view - The view to draw
 * @returns `<rect/>` elements, in drawing order
 */
export function pictogramMarkup(view: Types.EffectiveView): string {
  return VIEW_PICTOGRAMS[view]
    .map(
      ([x, y, width, height, rx, opacity]) =>
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"` +
        `${opacity === undefined ? '' : ` opacity="${opacity}"`}/>`,
    )
    .join('');
}
