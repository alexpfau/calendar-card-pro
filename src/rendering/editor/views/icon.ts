/**
 * An icon drawn by the editor itself, as inline SVG, in place of Home Assistant's `ha-svg-icon`:
 * rows and pages draw many, a template cannot be renamed under the editor, and it renders in
 * the test environment.
 *
 * Its size follows the custom property `ha-svg-icon` reads (`--mdc-icon-size`, 24 px unless a
 * theme sets it) and its color `--icon-primary-color`, else the text color, as there (read in
 * the frontend's `src/components/ha-svg-icon.ts`), set in `styles.ts` under `.icon`.
 */

import { type TemplateResult, html } from 'lit';

/**
 * An inline icon, hidden from assistive technology: whatever it sits in carries the name.
 *
 * @param path - The icon's path data, as `@mdi/js` exports it
 * @param extra - A class to add beside `icon`
 * @returns The icon
 */
export function icon(path: string, extra = ''): TemplateResult {
  // An `<svg>` element written in `html`, which parses its children as SVG; Lit's `svg` tag is
  // for fragments inside one.
  return html`<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d=${path}></path>
  </svg>`;
}
