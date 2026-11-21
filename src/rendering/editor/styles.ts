/**
 * Styles for the editor chassis around Home Assistant form controls.
 */

import { css } from 'lit';

export default css`
  /* Every ring the editor draws, focus first, in one color: the theme's primary mixed half and
     half with its text color in oklab. The primary alone measures 3.26:1 on Home Assistant's light
     card, 2.59:1 on the gray of a calendar's strip or the status bar and 2.98:1 on the chosen
     layout row's tint. On the default theme the mix measures 6.7:1 on the gray and 7.7:1 on the
     tint, and 5.4:1 or more against every background and divider this sheet paints, in light and
     dark. It moves toward the color the theme sets its text in, so other primaries clear 3:1 on
     the default themes as well: each of Material's nineteen hues does. A custom theme can still
     fall below it, with a mid-gray text color and a light primary; no fixed mix clears every
     theme, the text color alone included. With a gray text color, as every default theme has, the
     ring keeps the primary's hue. Without color-mix(), Safari before 16.2, the ring is the text
     color itself. A ring must not touch a color it does not clear, such as the primary of a frame
     or the text color of a tooltip: tests/editor-focus-ring.test.ts holds the rings, the surfaces,
     the frames the rings reach and the tooltips. */
  :host {
    --calendar-card-editor-focus-ring: var(--primary-text-color);
  }

  @supports (color: color-mix(in oklab, red, blue)) {
    :host {
      --calendar-card-editor-focus-ring: color-mix(
        in oklab,
        var(--primary-color) 50%,
        var(--primary-text-color)
      );
    }
  }

  .card-config {
    display: flex;
    flex-direction: column;
    padding: 0 0 4px;
  }

  .config-migration {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-inline-start: 3px solid var(--primary-color);
    border-radius: 4px;
    background: var(--secondary-background-color);
    line-height: 1.4;
  }

  .grid-reconciliation {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
    padding: 12px;
    border-inline-start: 3px solid var(--primary-color);
    border-radius: 4px;
    background: var(--secondary-background-color);
    line-height: 1.4;
  }

  .grid-reconciliation .text-button {
    align-self: flex-start;
  }

  .misplaced-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
    padding: 12px;
    border-inline-start: 3px solid var(--warning-color, #ffa600);
    border-radius: 4px;
    background: var(--secondary-background-color);
    line-height: 1.4;
  }

  .misplaced-options ul {
    margin: 4px 0 0;
    padding-inline-start: 20px;
  }

  .old-options {
    margin: 0;
    padding-inline-start: 20px;
    line-height: 1.4;
  }

  .misplaced-options li,
  .old-options li {
    padding: 2px 0;
  }

  .misplaced-options code,
  .old-options code,
  .audit-meta code {
    font-family: var(--code-font-family, monospace);
    overflow-wrap: anywhere;
  }

  .misplaced-taken {
    color: var(--secondary-text-color);
  }

  /* The banner and its ✕ share one frame, drawn from Home Assistant's theme variables so it
     reads as native in any theme; rgb-primary-color is the primary color as an r, g, b triple,
     which Home Assistant derives for every theme. The fallback triple is its default blue. */
  .quick-setup-entry {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-inline-end: 4px;
    border: 1px solid rgba(var(--rgb-primary-color, 3, 169, 244), 0.32);
    border-radius: var(--ha-card-border-radius, 12px);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    transition: background-color 0.15s ease-in-out;
  }

  .quick-setup-entry:has(.quick-setup-banner:hover) {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
  }

  .quick-setup-banner {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    min-height: 76px;
    padding-block: 14px;
    padding-inline: 16px 4px;
    border: none;
    border-radius: inherit;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .quick-setup-banner .nav-chevron {
    fill: var(--primary-color);
  }

  .quick-setup-dismiss {
    align-self: flex-start;
    margin-top: 4px;
  }

  .quick-setup-dismiss:hover {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
  }

  .quick-setup-banner:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -2px;
  }

  .quick-setup-badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    --mdc-icon-size: 24px;
  }

  .quick-setup-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .quick-setup-name {
    font-size: 16px;
    font-weight: 500;
  }

  .quick-setup-line {
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  /* Quick Setup in the step-by-step tasks' shared look: the examples as rows in one card, each a
     toggle button with a radio mark, the example's icon and its two lines, and ↗ to its page. */
  .quick-setup-intro {
    margin: 0;
  }

  /* Two classes, so the row wins over the shared .wizard-option, which comes later. */
  .wizard-option.story-option {
    flex-direction: row;
    align-items: center;
    gap: 0;
    padding: 0 4px 0 0;
  }

  /* The row Starting Layout's choices share: its mark, its picture and its lines in a line. */
  .story-tile,
  .display-choice {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .story-tile {
    flex: 1;
    min-height: 64px;
    padding: 10px 8px 10px 16px;
    border: none;
    border-radius: inherit;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .story-tile:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -2px;
  }

  .story-radio {
    flex: none;
    box-sizing: border-box;
    width: 20px;
    height: 20px;
    border: 2px solid var(--secondary-text-color);
    border-radius: 50%;
  }

  .story-tile[aria-pressed='true'] .story-radio {
    border-color: var(--primary-color);
    background: var(--primary-color);
    box-shadow: inset 0 0 0 3px var(--card-background-color, #fff);
  }

  .story-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.12);
    --mdc-icon-size: 20px;
  }

  .story-icon .icon {
    fill: var(--primary-color);
  }

  .story-text,
  .display-choice > .display-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 0;
  }

  .story-name {
    font-weight: 500;
  }

  .story-detail,
  .display-choice .display-description {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
  }

  .story-link {
    --mdc-icon-size: 20px;
  }

  .story-link .icon {
    fill: var(--secondary-text-color);
  }

  /* Step 4's switches sit in a card, inset as the preferences under More are. */
  .quick-setup-form.boxed {
    display: block;
    padding: 4px 16px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  /* Review: what Apply leaves, then what it replaces, each a card of rows, a name beside its
     value; on a narrow pane a long value wraps under its name. */
  .quick-setup-review {
    gap: 0;
    margin: 0;
    padding-block: 4px;
  }

  .quick-setup-review > div,
  .quick-setup-replaced li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 16px;
    padding: 8px 0;
  }

  .quick-setup-review > div + div,
  .quick-setup-replaced li + li {
    border-top: 1px solid var(--divider-color);
  }

  .quick-setup-review dt,
  .quick-setup-replaced li > :first-child {
    color: var(--secondary-text-color);
  }

  .quick-setup-review dd,
  .quick-setup-change {
    margin: 0;
    margin-inline-start: auto;
    text-align: end;
  }

  .quick-setup-replaces {
    margin: 0;
    font-weight: 500;
  }

  .quick-setup-replaced ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .quick-setup-show-all {
    align-self: flex-start;
    margin-inline-start: -12px;
  }

  .wizard-actions-end {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-inline-start: auto;
  }

  .width-table {
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    padding: 12px;
  }

  .width-table-title {
    color: var(--primary-text-color);
    font-weight: 500;
    margin-bottom: 8px;
  }

  .width-table table {
    border-collapse: collapse;
    width: 100%;
  }

  .width-table td {
    padding: 2px 0;
    vertical-align: baseline;
  }

  .width-table-width {
    color: var(--primary-text-color);
    font-variant-numeric: tabular-nums;
    padding-right: 12px !important;
    text-align: right;
    white-space: nowrap;
    width: 1%;
  }

  .width-table-layout {
    color: var(--secondary-text-color);
  }

  /* The fit summary's head cells: the layouts across the top, each width down the side. */
  .fit-summary th {
    font-weight: 400;
    padding: 2px 8px 2px 0;
    text-align: start;
    vertical-align: baseline;
  }

  .fit-summary tr:first-child th {
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .fit-summary td.width-table-layout {
    padding-inline-end: 8px;
  }

  .width-table + .width-table {
    margin-top: 12px;
  }

  .width-table-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.3;
    margin-top: 10px;
  }

  /* Undo and Redo above the migration choice. */
  .filter-bar:not(.search-row) {
    padding-bottom: 12px;
  }

  /* The overview's search row: the field takes the width, Undo and Redo sit at its end. Home
     Assistant's field is 56px tall and reserves 8px for a helper line below it, so the 48px
     buttons are aligned with the box rather than with the form: 4px down from its top. */
  .search-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0 6px;
  }

  /* The field and, while it holds a query, its ✕. Where the row is narrower than 340px, as on a
     320px phone, the field takes the whole row and the tools move to a line under it, at its end:
     beside them and the ✕ the field kept no room to type in. Wider, the basis is negative, which
     counts as 0, and the field shares the row as before. */
  .search-field {
    display: flex;
    flex: 1 1 calc((340px - 100%) * 999);
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }

  .search-row .filter-form {
    flex: 1;
    min-width: 0;
  }

  .search-row .history-controls {
    margin-top: 4px;
    margin-inline-start: auto;
  }

  /* The search field's ✕, beside Home Assistant's box rather than in it, centered on its 56px. */
  .search-row .search-clear {
    margin-top: 6px;
  }

  .filter-empty {
    color: var(--primary-text-color);
    padding: 24px 8px;
    text-align: center;
  }

  /* The action row sits above the settings rather than below them, so it is visible when
     the row opens instead of after a scroll. That puts the one destructive action where the
     user lands, so Remove is held against the far edge by an auto start margin, apart from the
     two moves, and on a narrow row it wraps onto a line of its own. A toolbar button's row lays
     out Move Up, Move Down and Remove this way. */
  .button-actions {
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 8px;
  }

  .button-actions-safe {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .button-actions .destructive {
    margin-inline-start: auto;
  }

  /* Home Assistant's own Visibility editor, under an entry page's Who Sees It. Its helper reads
     as a form field's helper does, above the editor rather than below it, since the editor grows
     downward as conditions are added. */
  .entity-visibility {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .entity-visibility-helper {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
  }

  /* Every text button is a 44px target in weight 500, as Home Assistant's buttons are, and lays
     out an icon beside its label rather than on the text's baseline. */
  .text-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    background: none;
    border: none;
    border-radius: 22px;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 6px 12px;
  }

  /* Remove is the only action in this row that discards anything, and the only one with
     no inverse: a card editor has no undo, and the block's settings go with it. It takes
     the color Home Assistant gives a destructive action everywhere else rather than
     sitting in a row of four buttons that all look equally safe. */
  .text-button.destructive {
    color: var(--error-color, #db4437);
  }

  /* An inline text action (Reset, Remove, Undo, Edit List, a calendar row's strip) keeps its 44px
     target, but draws its hover, pressed and focus fill as a pill inset 6px top and bottom, 32px
     on one line, so the fill hugs its words rather than dwarfing the line beside it. An add action
     and a filled button draw a fill of their own instead. */
  .text-button:not(.filled, .add-action),
  .strip-button {
    position: relative;
    isolation: isolate;
  }

  .text-button:not(.filled, .add-action)::before,
  .strip-button::before {
    content: '';
    position: absolute;
    inset: 6px 0;
    z-index: -1;
    border-radius: 16px;
  }

  .text-button:not(.filled, .add-action):hover:not(:disabled)::before,
  .strip-button:hover:not(:disabled)::before {
    background: var(--secondary-background-color);
  }

  .text-button:not(.filled, .add-action):active:not(:disabled)::before,
  .strip-button:active:not(:disabled)::before {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
  }

  .text-button:not(.filled, .add-action):focus-visible,
  .strip-button:focus-visible {
    outline: none;
  }

  .text-button:not(.filled, .add-action):focus-visible::before,
  .strip-button:focus-visible::before {
    box-shadow: 0 0 0 2px var(--calendar-card-editor-focus-ring);
  }

  /* A filled button keeps its color under the pointer, a shade darker. */
  .text-button.filled:hover:not(:disabled) {
    background-image: linear-gradient(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.12));
  }

  .text-button:disabled {
    color: var(--disabled-text-color);
    cursor: default;
  }

  /* An icon beside a button's label takes the label's color, disabled and destructive included,
     rather than the theme's icon color. */
  .with-icon,
  .strip-button {
    --mdc-icon-size: 18px;
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .with-icon .icon,
  .strip-button .icon {
    fill: currentcolor;
  }

  /* --- Overview and pages ---------------------------------------------------
     Drawn by the editor itself from Home Assistant's theme variables. Every target is at least
     44px tall, nothing is sticky, and labels wrap rather than truncate. */
  .overview,
  .page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .icon {
    flex: none;
    width: var(--mdc-icon-size, 24px);
    height: var(--mdc-icon-size, 24px);
    fill: var(--icon-primary-color, currentcolor);
  }

  .icon-button {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
  }

  .icon-button:hover,
  .nav-row:hover,
  .display-choice:hover,
  .chip-choice:not(:has(input:checked)):hover {
    background: var(--secondary-background-color);
  }

  .icon-button:focus-visible,
  .audit-edit:focus-visible,
  .nav-row:focus-visible,
  .text-button:focus-visible,
  .link:focus-visible,
  .field:focus-visible,
  .heading:focus-visible,
  .page-title:focus-visible,
  .wizard-title:focus-visible,
  .display-choice:has(input:focus-visible),
  .chip-choice:has(input:focus-visible) {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 2px;
  }

  .heading:focus:not(:focus-visible),
  .page-title:focus:not(:focus-visible),
  .wizard-title:focus:not(:focus-visible),
  .field:focus:not(:focus-visible) {
    outline: none;
  }

  .label {
    padding: 0;
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .hint,
  .page-line {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .page-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    --mdc-icon-size: 16px;
  }

  /* A card-built control's helper sits where Home Assistant's own helpers sit, inset from the
     field's edge. */
  .field .hint:not(.color-kept),
  .displays > .hint,
  .chip-group ~ .hint,
  .entity-visibility-helper {
    padding-inline: 16px;
  }

  .displays,
  .chips {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .chip-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Start Date's choices are native radios drawn as the toggle chips are: the circle hidden, the
     chosen one tinted with a check, so the state never rests on color alone. The radio keeps the
     arrow keys and the group's name; it takes no pointer events. Positioned, so the hidden radio's
     containing block is its own chip: left unpositioned, it was Home Assistant's dialog body,
     across the shadow boundary, and WebKit scrolled that body to the radio whenever it took focus,
     preventScroll or not. A hidden input's chip or row must always be positioned. */
  .chip-choice {
    position: relative;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--divider-color);
    border-radius: 22px;
    cursor: pointer;
    font-size: 14px;
    --mdc-icon-size: 18px;
  }

  .chip-choice input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .chip-choice:has(input:checked) {
    border-color: transparent;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18);
    color: var(--primary-color);
  }

  .chip-choice:has(input:checked) .icon {
    fill: currentcolor;
  }

  .display-choice:has(input:checked) {
    border-color: var(--primary-color);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
  }

  input[type='radio'] {
    accent-color: var(--primary-color);
  }

  /* A fieldset's legend is no flex item, so the gap under it is its own. */
  .chips > legend,
  .displays > legend {
    margin-bottom: 8px;
  }

  /* Orange, as the mockup draws it, so the line stands out: the warning color mixed toward the
     text color, as the card's today tile mixes its digits, since the warning color alone is under
     2:1 on a light theme. At 55% the 12px text measures 4.8 to 5.0 to 1 on stock HA light (#fff,
     #fafafa), 10.6 to 11.7 on stock HA dark (#1c1c1c, #111) and 4.9 to 5.3 on a Material light
     theme warning in #ff9800. The eye takes the same color, the plain warning color being under
     3:1 on a light theme. Without color-mix() the line keeps the hint's secondary text color. */
  .scope-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    --mdc-icon-size: 18px;
  }

  .scope-preview .icon {
    fill: currentcolor;
  }

  .scope-preview-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  @supports (color: color-mix(in oklab, red, blue)) {
    .scope-preview {
      color: color-mix(in oklab, var(--warning-color, #ffa600) 55%, var(--primary-text-color));
    }
  }

  /* Starting Layout: a row per layout, stacked, each in the shape of Quick Setup's example rows
     (the row, text and line rules there are shared): the radio, the layout's picture, then its
     name over its description, so every name and description stays whole in every language at
     any width. Native radios, so the arrow keys move from row to row. Each row is a frame of its
     own, the chosen one in the primary color and tinted. */
  .display-choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .display-choice {
    box-sizing: border-box;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    cursor: pointer;
  }

  .display-choice input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
  }

  .display-image {
    flex: none;
    width: 48px;
    height: 32px;
    object-fit: contain;
  }

  .display-text {
    display: flex;
    flex-direction: column;
    padding-top: 2px;
  }

  .display-label {
    font-weight: 500;
  }

  .display-description {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.35;
  }

  .display-choice .display-description {
    overflow-wrap: break-word;
  }

  /* Layouts: Starting Layout's rows, each split in two. The radio sits in a zone of its own at the
     start, behind a divider, and is the one thing that picks the layout the card opens in; the rest
     of the row is a button that opens the layout's page. The row keeps its frame and the chosen
     one its tint, so the choice reads as before. */
  .display-choice.layout-choice {
    align-items: stretch;
    gap: 0;
    padding: 0;
    cursor: default;
  }

  /* Each half draws its own fill under the pointer, so the row draws none; the chosen row keeps
     its tint. */
  .display-choice.layout-choice:not(:has(input:checked)):hover {
    background: none;
  }

  /* Each half rounds the corners it shares with the row, to the row's 12px less its 1px border, so
     its fill follows the frame rather than squaring off across it. The frame does not clip, so the
     row's focus ring is never cut. Logical corners, so a right-to-left editor needs no rule of its
     own. */
  .layout-pick {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    min-height: 48px;
    border-inline-end: 1px solid var(--divider-color);
    border-start-start-radius: 11px;
    border-end-start-radius: 11px;
    cursor: pointer;
  }

  .layout-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 48px;
    padding: 8px 4px 8px 12px;
    border: none;
    border-radius: 0;
    border-start-end-radius: 11px;
    border-end-end-radius: 11px;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .layout-pick:hover,
  .layout-open:hover {
    background: var(--secondary-background-color);
  }

  /* Drawn 4px in, so the row's own fill lies on both sides of the ring: at 2px it touched the
     chosen row's frame, which is the primary color itself. */
  .layout-open:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -4px;
  }

  .layout-open > .display-text {
    flex: 1;
    min-width: 0;
  }

  .row-group > .frame-hint {
    padding: 0 16px 4px;
  }

  .layout-block > .layout-defaults {
    margin-inline: 0;
  }

  /* Layout Defaults ends the Layouts block 12px above its edge, so it rounds its bottom corners as
     a list's last row does: the frame's radius less its border and those 12px, which at the
     default radius is nothing. */
  .layout-block > .layout-defaults:last-child > .nav-row:last-child {
    border-bottom-left-radius: calc(var(--ha-card-border-radius, 12px) - 13px);
    border-bottom-right-radius: calc(var(--ha-card-border-radius, 12px) - 13px);
  }

  .layouts-help {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 4px;
  }

  .layouts-help .text-button {
    display: inline;
    min-height: 0;
    padding: 0;
    font-size: inherit;
    vertical-align: baseline;
  }

  .row-group {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    padding: 4px 0;
  }

  /* A row at the frame's top or bottom rounds the two corners it shares with it: the frame's
     radius less its 1px border and the 4px between it and the rows. That puts the fill's curve
     inside the frame's, touching it at the sides, where a square corner would cross it. A theme
     radius taller than the heading above a list's first row would reach that row too, which this
     leaves square. The frame does not clip, so a focused row's ring is never cut. */
  .row-group > .rows:first-child > .nav-row:first-child,
  .row-group > .result:first-child > .nav-row {
    border-top-left-radius: calc(var(--ha-card-border-radius, 12px) - 5px);
    border-top-right-radius: calc(var(--ha-card-border-radius, 12px) - 5px);
  }

  .row-group > .rows:last-child > .nav-row:last-child,
  .row-group > .result:last-child > .nav-row,
  .row-group > .nav-row:last-child {
    border-bottom-left-radius: calc(var(--ha-card-border-radius, 12px) - 5px);
    border-bottom-right-radius: calc(var(--ha-card-border-radius, 12px) - 5px);
  }

  .row-group > .heading {
    padding: 8px 16px 4px;
  }

  .heading {
    margin: 0;
    color: var(--primary-text-color);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  }

  .nav-row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 56px;
    padding: 8px 16px;
    border: none;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .nav-icon,
  .nav-chevron {
    color: var(--secondary-text-color);
  }

  .nav-chevron:dir(rtl) {
    transform: scaleX(-1);
  }

  .nav-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .nav-summary {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  /* A page header is two rows at every width: Back and the title, which keeps the whole first
     row, then the actions at the second row's end. Sharing one row, a long title wrapped beside
     them, at some widths and not others, and the actions dropped to a row of their own at others. */
  .page-head {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 0 8px;
    margin-inline-start: -8px;
  }

  /* A page header's actions, Search Settings first, sit together at the second row's end. */
  .head-actions {
    display: flex;
    grid-column: 1 / -1;
    justify-self: end;
    align-items: center;
  }

  .head-actions .history-controls {
    margin-inline-start: 0;
  }

  .head-search {
    width: 48px;
    height: 48px;
  }

  /* Undo and Redo: at the end of the overview's search row and of every page header. */
  .history-controls {
    display: flex;
    justify-content: flex-end;
    margin-inline-start: auto;
  }

  .history-button {
    width: 48px;
    height: 48px;
  }

  .history-button:disabled {
    color: var(--disabled-text-color, #bdbdbd);
    cursor: default;
  }

  .history-button:disabled:hover {
    background: none;
  }

  /* Pick From Preview, after Undo and Redo, tinted while a pick is on. */
  .search-row .pick-button {
    margin-top: 4px;
  }

  .pick-button[aria-pressed='true'] {
    color: var(--primary-color);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
  }

  .pick-button[aria-pressed='true'] .icon {
    fill: currentcolor;
  }

  /* The overview header's ⋯ menu of preferences: under its button, at the row's end, and never
     wider than the dialog leaves on a phone. Each item is a 48px target with a check column. */
  .menu-wrap {
    position: relative;
    flex: none;
  }

  .search-row .menu-wrap {
    margin-top: 4px;
  }

  .menu-button {
    width: 48px;
    height: 48px;
  }

  .menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 4px);
    z-index: 4;
    display: flex;
    flex-direction: column;
    width: max-content;
    max-width: min(320px, calc(100vw - 48px));
    padding: 4px 0;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color, var(--primary-background-color));
    box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.2));
  }

  .menu-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 48px;
    padding: 10px 16px 10px 12px;
    border: none;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--secondary-background-color);
  }

  .menu-item:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -2px;
  }

  /* The first and last items round the corners they share with the menu: its 8px less its 1px
     border and 4px padding. */
  .menu-item:first-child {
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
  }

  .menu-item:last-child {
    border-bottom-left-radius: 3px;
    border-bottom-right-radius: 3px;
  }

  /* A checkbox's box, empty or checked, so an item reads as off as plainly as it reads as on. */
  .menu-check {
    flex: none;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin: 1px;
    border: 2px solid var(--secondary-text-color);
    border-radius: 2px;
    --mdc-icon-size: 16px;
  }

  .menu-check.checked {
    border-color: var(--primary-color);
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }

  .menu-check .icon {
    fill: currentcolor;
  }

  .menu-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
  }

  /* The line a removal or an applied story leaves, until the next change. */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 12px;
    border-radius: 8px;
    background: var(--secondary-background-color);
  }

  .status-text {
    flex: 1;
    min-width: 0;
  }

  /* A fresh card's note on the calendar it was started with, and Change Calendar. */
  .started-with {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  /* The upgrade's receipt: its sentences, then its two buttons, which wrap under them. */
  .upgrade-receipt {
    flex-wrap: wrap;
    padding: 8px 4px 4px 12px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
  }

  .upgrade-receipt .status-text {
    flex-basis: 100%;
  }

  .upgrade-actions {
    display: flex;
    flex-wrap: wrap;
    margin-inline-start: -12px;
  }

  .page-head .icon-button:not(.head-search):dir(rtl),
  .page-foot .icon:dir(rtl) {
    transform: scaleX(-1);
  }

  .page-titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .page-title {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }

  .page-sub {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .page-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Each heading of a page and what it holds is a card, as Home Assistant draws its own, so which
     settings belong together reads at a glance on a long page. Its text sits 16 px inside the
     edge, as in Home Assistant's cards: 12 px here and the 4 px every row keeps. */
  .page > .page-group:not(.audit-group) {
    padding: 12px;
    border: 1px solid var(--ha-card-border-color, var(--divider-color));
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .page > .page-group:not(.audit-group) > .heading,
  .page > .page-group:not(.audit-group) > .hint,
  .page > .page-group:not(.audit-group) > .page-line,
  .page > .page-group:not(.audit-group) > .gate-line {
    padding-inline: 4px;
  }

  .page > .page-group > .heading {
    font-size: 15px;
    font-weight: 600;
  }

  .page-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0 16px;
    padding-top: 12px;
    border-top: 1px solid var(--divider-color);
  }

  /* The page's documentation, at the end of the foot's line: opens the site in a new tab. */
  .docs-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    color: var(--primary-color);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    --mdc-icon-size: 18px;
  }

  .docs-link:hover {
    text-decoration: underline;
  }

  .page-foot .text-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
  }

  /* A link is a 24px target both ways, WCAG's least: a layout named by one character, as Japanese
     names Columns and Month (列, 月), is half that wide, and two side by side came closer than
     their targets allow. Its words are centered in the room this leaves. */
  .link {
    min-height: 24px;
    min-width: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 4px;
  }

  /* Use a Pattern and Use Words: a small link under their list, in line with its helper. */
  /* Use a Pattern or Use Words: an inline text action as Reset is, its words where a link's were. */
  .word-mode {
    align-self: flex-start;
    margin-inline-start: 4px;
    font-size: 13px;
  }

  /* --- Show what applies -----------------------------------------------------
     The line under a field with what its state words leave out and its Reset or Remove; a
     heading's Add row and gate lines. */
  /* A family's Remove, under the heading it removes. */
  .heading-action {
    margin-top: -12px;
  }

  .field-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
    --mdc-icon-size: 16px;
  }

  .field-line-body {
    flex: 1;
    min-width: 0;
  }

  /* Stored Settings: a row per stored line, its label, value and the lines under them as
     one button, and its strip under it while open. */
  .audit-head,
  .audit-row,
  .audit-line,
  .audit-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
  }

  /* A basis of its own, so a long "Go to {name}" moves to a line of its own on a phone rather
     than squeezing the calendar's name into a narrow column beside it. */
  .audit-head .heading {
    flex: 1 1 12em;
  }

  .audit-meta {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .audit-row {
    flex-direction: column;
    align-items: stretch;
    border-top: 1px solid var(--divider-color);
  }

  .audit-row > .strip {
    margin-bottom: 8px;
  }

  /* "Grid Has Its Own: 5", a line each under the tags. */
  .audit-own {
    flex-basis: 100%;
  }

  .audit-text {
    flex: 1;
    min-width: 0;
    padding: 4px 0;
  }

  .audit-edit {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 2px;
    width: 100%;
    min-height: 48px;
    padding: 4px 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .audit-line {
    justify-content: space-between;
  }

  .audit-value {
    overflow-wrap: anywhere;
  }

  .tag {
    padding: 0 6px;
    border-radius: 8px;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }

  /* Not in Use: text in the primary text color on a warning tint, since the warning color as
     text on a light theme is under 2:1. */
  .tag.warning {
    background: rgba(var(--rgb-warning-color, 255, 166, 0), 0.24);
    color: var(--primary-text-color);
  }

  .field-note,
  .gate-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
    margin: 0;
  }

  .gate-line {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  /*
    Reset or Remove under a field names what it leaves, "Reset to Follow Home Assistant", on one
    line at any width: a value too long for the line ends in an ellipsis rather than wrapping
    the button under its icon.
  */
  .line-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 44px;
    font-size: 13px;
    white-space: nowrap;
    --mdc-icon-size: 16px;
  }

  .line-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- A setting's head row -------------------------------------------------
     Every setting has a 44 px head row drawn the same folded and open, one grid of three columns:
     name and, while folded, value, which ends next to the chevron; the chevron; ⓘ, at the row's
     end on every row, so it lines up down every page. Under the name, the setting's facts, none of
     them pressable. Nothing of the editor's sits inside Home Assistant's field box, which an open
     setting draws below its head, so nothing covers the box's arrow, clear button, spinner or
     suffix, and nothing in the head moves when the setting opens: a second press lands where the
     first did. A switch keeps Home Assistant's own row, label and switch, across the name and
     chevron columns, so every switch ends where the chevrons end. */
  .setting {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Settings read as one list. The space after an open one is its own, so opening a setting
     never moves its head. */
  .setting + .setting {
    margin-top: -8px;
  }

  .setting.open {
    padding-bottom: 8px;
  }

  .setting-head {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px 44px;
    align-items: start;
    min-height: 44px;
    border-radius: 4px;
  }

  .setting-head > .setting-text,
  .setting-head > .setting-control {
    grid-column: 1;
    grid-row: 1;
  }

  .setting-head > .setting-text {
    margin-inline-end: 4px;
  }

  /* A switch has no chevron: Home Assistant's switch row takes its column. */
  .setting-head.switch > .setting-control {
    grid-column: 1 / 3;
  }

  .setting-head.switch .setting-end {
    display: none;
  }

  /* Home Assistant centers its switch on a label that wraps, so ⓘ follows it. */
  .setting-head.switch > .setting-tools > * {
    align-self: center;
  }

  .setting-head.folds:hover {
    background: var(--secondary-background-color);
  }

  /* A setting's facts, under its name, inside the row they belong to: Set, what the value
     reaches, where it comes from, each in a form of its own, and a line for each layout that uses
     something else. None of them can be pressed, so none of them is drawn as a button: no fill, no
     border, no link color. They let a press through to the row's toggle. */
  .setting-head > .setting-facts {
    grid-column: 1 / 3;
    grid-row: 2;
    margin-top: -10px;
    padding: 0 0 10px;
    padding-inline-start: 4px;
    pointer-events: none;
  }

  .setting-head.switch > .setting-facts {
    margin-top: 0;
  }

  /* Reset or Remove after Set: a 44 px target, so its line is 44 px tall, starting in the space
     under the name, which is never a target on a stored setting. It stays 16 px clear of the ⓘ
     column, and under a switch, whose whole label row toggles it, 16 px below that row. */
  .setting-facts.has-actions {
    align-items: center;
    min-height: 44px;
    padding-inline-end: 16px;
  }

  .setting-head > .setting-facts.has-actions {
    margin-top: -12px;
    padding-bottom: 0;
  }

  .setting-head.switch > .setting-facts.has-actions {
    margin-top: 8px;
  }

  .setting-facts .line-button {
    pointer-events: auto;
  }

  .setting-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 2px 12px;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 16px;
    --mdc-icon-size: 14px;
  }

  .fact {
    display: inline-flex;
    align-items: flex-start;
    gap: 4px;
  }

  .fact .icon {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 1px;
    fill: currentcolor;
  }

  /* Set: a dot in the primary color and the word, in the text color. A status, never a link. */
  .fact-set {
    align-items: center;
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .fact-set::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary-color);
  }

  /* A layout's own value: a line of its own, after that layout's icon. */
  .fact-layout {
    flex-basis: 100%;
  }

  .setting-text {
    display: flex;
    align-items: baseline;
    gap: 0 8px;
    min-width: 0;
    padding: 12px 0;
    padding-inline-start: 4px;
    color: var(--primary-text-color);
    font: inherit;
    line-height: 20px;
    text-align: start;
  }

  .setting-toggle {
    border: none;
    background: none;
    cursor: pointer;
  }

  /* The whole row is the toggle; ⓘ sits above it. */
  .setting-toggle::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 4px;
  }

  .setting-toggle:focus-visible {
    outline: none;
  }

  .setting-toggle:focus-visible::after {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 2px;
  }

  /* At least as wide as the name's longest word, so the value gives way before a word splits. */
  .setting-name {
    flex: 1 1 0;
    min-width: min-content;
  }

  /* A long label breaks between words only; a word longer than the whole line is the one case
     that breaks inside it. */
  .setting-label {
    overflow-wrap: break-word;
    hyphens: manual;
  }

  /* One line, cut with an ellipsis, so a folded head is as tall open as folded and an opened
     setting leaves no gap where a long value wrapped. It ends next to the chevron. Up to 45% of
     the row, so the name, which says what the setting is, keeps the rest to wrap in. */
  .setting-value {
    flex: 0 1 auto;
    max-width: 45%;
    margin-inline-start: auto;
    overflow: hidden;
    color: var(--secondary-text-color);
    font-size: 13px;
    text-align: end;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Kept in place while open, so the row wraps the same in both states. */
  .setting-kept {
    visibility: hidden;
  }

  /* A switch: Home Assistant's own row, label and switch, starts the head, and ⓘ sits on its
     line. Home Assistant draws that line, 24 px, at the top of a 56 px box it keeps out of reach,
     so the box is moved down to center the line in the 44 px head, and the empty part below it is
     taken back. */
  .setting-head.switch {
    align-items: flex-start;
  }

  .setting-head.switch .setting-control {
    margin-top: 10px;
    padding-inline-start: 4px;
  }

  .setting-control {
    min-width: 0;
  }

  /* The chevron and ⓘ each take a column of the head; they sit above the toggle. */
  .setting-tools {
    display: contents;
  }

  .setting-tools > * {
    position: relative;
    z-index: 1;
    grid-row: 1;
  }

  .setting-head > .setting-tools > .setting-end {
    grid-column: 2;
  }

  .setting-head > .setting-tools > .setting-info,
  .setting-head > .setting-tools > .setting-slot {
    grid-column: 3;
  }

  .setting-target {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0 2px;
    border: none;
    border-radius: 22px;
    background: none;
    color: var(--secondary-text-color);
    cursor: pointer;
    font: inherit;
  }

  .setting-target:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -2px;
  }

  .setting-info {
    --mdc-icon-size: 20px;
  }

  .setting-info:hover {
    color: var(--primary-text-color);
  }

  .setting-slot {
    flex: none;
    width: 44px;
  }

  /* The chevron's slot is kept where nothing folds, so ⓘ lines up down the page. */
  .setting-end {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-height: 44px;
    color: var(--secondary-text-color);
    pointer-events: none;
    --mdc-icon-size: 20px;
  }

  /* A helper, set apart from the facts above it: the body's own text, after a rule, with no box
     around it, so it reads as words about the setting rather than as a control. */
  .setting-help {
    margin: 0 4px 4px;
    padding-inline-start: 10px;
    border-inline-start: 2px solid var(--divider-color);
    color: var(--primary-text-color);
    font-size: 13px;
  }

  .setting-help[hidden] {
    display: none;
  }

  /* A phone's dialog: the value gives its width to the name, which matters more. */
  :host([narrow]) .setting-value {
    display: none;
  }

  /* No value to give way: a word longer than the whole line is the one that breaks. */
  :host([narrow]) .setting-name {
    min-width: 0;
  }

  /* A setting a gate withholds, in its place: its name, and under it, where its facts would be,
     when it appears. Beside the name, the sentence sat where values sit and read on from it. */
  .setting-gated {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    padding: 12px 0 10px;
    padding-inline: 4px 76px;
    color: var(--secondary-text-color);
  }

  .setting-gated > .setting-label {
    line-height: 20px;
  }

  .setting-gated-when {
    font-size: 12px;
    line-height: 16px;
  }

  /* A gate line shared by several settings reads as a sentence, the width of the card. */
  .setting-gated > .setting-gated-when:only-child {
    padding: 0;
    line-height: 1.45;
  }

  .setting-gated:has(> .setting-gated-when:only-child) {
    padding-inline-end: 0;
  }

  /* A heading with nothing to edit until its part is on, or an entity chosen: Off or No Entity
     beside its title, then the button that changes that, then one line naming what it holds. */
  .heading-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 12px;
  }

  .heading-row > .heading {
    flex: 1 1 auto;
    padding-inline: 4px;
    font-size: 15px;
    font-weight: 600;
  }

  .heading-state {
    color: var(--secondary-text-color);
    font-size: 13px;
  }

  .heading-row > .line-button {
    margin-inline-end: -8px;
  }

  .off-group > .gate-summary {
    margin: -8px 0 0;
  }

  /* --- The calendar list and entry pages ------------------------------------
     A row per entry; a calendar listed more than once gets a row of its own, its entries indented
     under it. Every target is at least 44px. */
  .cal-list,
  .cal-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cal-list {
    gap: 8px;
  }

  .cal-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 56px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
  }

  .cal-row-entry {
    margin-inline-start: 28px;
  }

  /* The overview's Calendars block is one card, as Settings and More are (the D03 mockup): its
     heading and Add Calendar inside it, and a calendar's rows set apart from the next calendar's
     by a divider rather than by a border of their own. The divider is each calendar's bottom
     edge, so it follows the order the keyboard grab previews, which moves rows by CSS order.
     The toolbar's button list keeps a bordered card per row. */
  /* The overview's framed blocks: Calendars, and Starting Layout around Card Displays. */
  .cal-block,
  .layout-block {
    padding: 4px 0 12px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .cal-block > .heading,
  .layout-block > .heading {
    padding-top: 8px;
  }

  .cal-block > :not(.cal-list),
  .layout-block > * {
    margin-inline: 16px;
  }

  .cal-block .cal-list,
  .cal-block .cal-group {
    gap: 0;
  }

  .cal-block .cal-group {
    border-bottom: 1px solid var(--divider-color);
  }

  .cal-block .cal-row {
    border: none;
    border-radius: 0;
  }

  /* An entry under its calendar's row hangs from a line under the calendar's drag handle. */
  .cal-block .cal-row-entry {
    margin-inline-start: 19px;
    border-inline-start: 2px solid var(--divider-color);
  }

  /* Its dot, label and name start where a single row's do: the handle's 40px, the row's 4px gap
     and the body's own 4px, 48px in all, less the 19px margin and the 2px line. */
  .cal-block .cal-row-entry > .cal-body {
    padding-inline-start: 27px;
  }

  .cal-block .strip {
    margin: 0 8px 8px;
  }

  .cal-block .cal-list > .status-bar {
    margin: 4px 8px;
  }

  /* Hovering a row's body fills the whole row, its handle and ⋮ included. */
  .cal-block .cal-row:has(> .cal-body:hover) {
    background: var(--secondary-background-color);
  }

  .cal-block .cal-body {
    border-radius: 0;
  }

  .cal-block .cal-body:hover {
    background: none;
  }

  .cal-block .cal-group.grabbed {
    border-radius: 8px;
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -2px;
  }

  .cal-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 56px;
    padding: 8px 4px 8px 16px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .drag-handle + .cal-body {
    padding-inline-start: 4px;
  }

  .cal-body:hover,
  .drag-handle:hover,
  .cal-body:focus-visible,
  .cal-filter:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 2px;
  }

  /* --- Reordering -------------------------------------------------------------
     A calendar's drag handle. Only the handle stops touch scrolling, so a finger on the rest of
     a row still scrolls the dialog. While the keyboard grab holds a calendar its row is marked
     and the list shows the preview order by CSS order (views/calendars.ts); while a pointer drags
     one, it and the rows it passes move by transform (views/reorder.ts). */
  .drag-handle {
    flex: none;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    min-height: 44px;
    padding: 0;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--secondary-text-color);
    cursor: grab;
    touch-action: none;
  }

  .row-more[aria-expanded='true'] {
    background: var(--secondary-background-color);
  }

  .drag-handle:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: -4px;
  }

  .drag-handle[aria-pressed='true'] {
    color: var(--primary-color);
  }

  /* --- Chips and the toolbar ------------------------------------
     Toggle chips: native buttons, pressed with a check and the primary color, so the state never
     rests on color alone. An unpressable chip stays focusable and shows its reason inside it.
     Toggle chips and Start Date's radio chips share one size, 44px tall with 8px between them.
     A pressed toolbar control with a choice has a qualifier line under the chips, drawn unlike
     them: native radios or checkboxes under a legend, set in by a rule at its start, so a line
     never reads as more chips. The toolbar's own buttons are the
     calendar list's rows, each bordered as one card that opens in place. The group is not .chips,
     which Start Date's radio chips use as a column. */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--divider-color);
    border-radius: 22px;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    --mdc-icon-size: 18px;
  }

  .chip[aria-pressed='true'] {
    border-color: transparent;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18);
    color: var(--primary-color);
  }

  .chip[aria-pressed='true'] .icon {
    fill: currentcolor;
  }

  .chip[aria-disabled='true'] {
    color: var(--disabled-text-color, #bdbdbd);
    cursor: default;
  }

  .chip-needs,
  .chip-yaml {
    font-size: 12px;
  }

  .chip:hover:not([aria-disabled='true']) {
    background: var(--secondary-background-color);
  }

  .chip:focus-visible,
  .chip-group:focus-visible,
  .qualifier:focus-visible {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 2px;
  }

  .chip-group:focus:not(:focus-visible),
  .qualifier:focus:not(:focus-visible) {
    outline: none;
  }

  .qualifiers {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .qualifier {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin: 0;
    padding: 0 0 0 12px;
    border: none;
    border-inline-start: 2px solid var(--divider-color);
  }

  .qualifier > legend {
    padding: 0;
  }

  .qualifier-choices {
    display: flex;
    flex-wrap: wrap;
    column-gap: 16px;
  }

  /* Each choice is a 44px target: the native control, its name, and a kept one's reason. */
  .qualifier-choice {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    cursor: pointer;
  }

  .qualifier-choice input {
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--primary-color);
    cursor: inherit;
  }

  .qualifier-choice.kept {
    color: var(--secondary-text-color);
    cursor: default;
  }

  .qualifier-choice.kept input {
    filter: grayscale(1);
    opacity: 0.7;
  }

  .qualifier-kept {
    font-size: 12px;
  }

  .chip-source {
    color: var(--secondary-text-color);
  }

  /* A stored value that does nothing now: the warning's icon, the words in the text color. */
  .inactive-line {
    flex-wrap: nowrap;
    align-items: flex-start;
    color: var(--primary-text-color);
    --mdc-icon-size: 16px;
  }

  .inactive-line > .icon {
    flex: none;
    margin-top: 1px;
    fill: var(--warning-color, #ffa600);
  }

  .inactive-line > span {
    flex: 1 1 auto;
  }

  /* The facts of a control with no head row, first on the line under it. */
  .field-line .setting-facts {
    margin-bottom: 4px;
  }

  .button-row {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
  }

  .button-row > .cal-row {
    border: none;
  }

  /* The border and the shadow beside it draw one 2px ring, so both take the ring's color: a
     primary border beside it would touch the ring with a color it does not clear. */
  .button-row.grabbed {
    border-color: var(--calendar-card-editor-focus-ring);
    box-shadow: 0 0 0 1px var(--calendar-card-editor-focus-ring);
  }

  .button-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 0 12px 12px;
  }

  .cal-list > :not([data-reorder]) {
    order: var(--bar, 0);
  }

  .cal-block .cal-body:focus-visible {
    outline-offset: -2px;
  }

  .cal-list.dragging {
    user-select: none;
  }

  .cal-list.dragging > [data-reorder] {
    transition: transform 0.15s ease;
  }

  .cal-list.dragging > .lifted {
    position: relative;
    z-index: 1;
    border-radius: 12px;
    background: var(--card-background-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: none;
    cursor: grabbing;
  }

  .grab-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 4px 8px;
    border-radius: 8px;
    background: var(--secondary-background-color);
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.6;
    --mdc-icon-size: 16px;
  }

  .grab-status kbd {
    padding: 0 4px;
    border: 1px solid var(--divider-color);
    border-radius: 4px;
    font: inherit;
  }

  .cal-dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--cal-dot, var(--primary-color));
  }

  /* One slot on every row of a list where any calendar has a label, so the names align. A text
     label wider than it is cut. */
  .cal-badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    overflow: hidden;
    font-size: 18px;
    line-height: 1;
    white-space: nowrap;
    --mdc-icon-size: 22px;
  }

  .cal-badge img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .cal-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .cal-summary {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
    --mdc-icon-size: 16px;
  }

  .cal-missing,
  .entry-notice.warning .icon {
    fill: var(--warning-color);
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: var(--secondary-background-color);
  }

  .strip-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 4px 12px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    text-align: start;
  }

  .strip-button.destructive {
    color: var(--error-color, #db4437);
  }

  .strip-button:disabled {
    color: var(--disabled-text-color, #bdbdbd);
    cursor: default;
  }

  .strip-text {
    display: flex;
    flex-direction: column;
  }

  .strip-keys,
  .strip-note {
    color: var(--secondary-text-color);
    font: inherit;
    font-size: 12px;
  }

  .cal-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    text-align: center;
  }

  .cal-empty p {
    margin: 0;
  }

  .cal-filter {
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font: inherit;
  }

  .add-calendar {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-calendar-actions,
  .entry-steps {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .entry-steps {
    justify-content: space-between;
  }

  .text-button.filled {
    padding-inline: 16px;
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }

  .text-button.filled .icon {
    fill: currentcolor;
  }

  .text-button.filled:disabled {
    background: var(--disabled-color, #bdbdbd);
  }

  /* An add action (Add Calendar, Add Button) is its list's one primary action, so it is a tonal
     pill rather than a link. */
  .text-button.add-action {
    align-self: flex-start;
    padding: 0 16px 0 12px;
    border-radius: 22px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
    font-weight: 500;
  }

  .text-button.add-action:hover:not(:disabled) {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.22);
  }

  .entry-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--secondary-background-color);
    font-size: 14px;
    --mdc-icon-size: 20px;
  }

  /* The jump list: Edit Here beside the count, the tag saying why a setting is not drawn, a
     helper-only match's phrase, and a calendar's row under its folded result. Each result is one
     button. */
  .result-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .result {
    display: flex;
    align-items: center;
  }

  /* The query's words in a label, tinted rather than the browser's yellow, which ignores the
     theme. The text keeps its own color, so its contrast is the label's. */
  .results mark {
    border-radius: 2px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
    color: inherit;
    font-weight: 500;
  }

  .result-tag,
  .result-phrase {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .result-tag {
    font-style: italic;
  }

  .result-entry {
    padding-inline-start: 40px;
  }

  .result-go {
    flex-shrink: 0;
    color: var(--primary-color);
    font-size: 14px;
  }

  .result--edit {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px 16px;
  }

  .result--info .nav-row {
    cursor: default;
  }

  /* --- The step-by-step tasks ----------------------------------------------
     Quick Setup and Split This Calendar share one look (views/wizard.ts): a header with a round
     badge, the task's heading and its step line, a segmented progress bar, choices as radio rows in
     one card, a card for each thing a step holds, and the actions above a divider. Split sits among
     a page's fields, so it is framed; Quick Setup takes the editor's place and is not. */
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .wizard.framed {
    padding: 12px 16px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .wizard-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .wizard-badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
    --mdc-icon-size: 22px;
  }

  .wizard-badge .icon {
    fill: var(--primary-color);
  }

  .wizard-titles {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .wizard-title {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    line-height: 1.3;
  }

  .wizard-step {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .wizard-close {
    margin-inline-end: -8px;
  }

  .wizard-progress {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .wizard-progress > li {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--divider-color);
  }

  .wizard-progress > .done,
  .wizard-progress > .current {
    background: var(--primary-color);
  }

  /* No overflow clipping on the card, so a focused radio's ring is never cut: the rows round
     their own outer corners instead. */
  .wizard-options {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .wizard-option {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
  }

  .wizard-option + .wizard-option {
    border-top: 1px solid var(--divider-color);
  }

  .wizard-option:first-child {
    border-start-start-radius: inherit;
    border-start-end-radius: inherit;
  }

  .wizard-option:last-child {
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
  }

  .wizard-option.checked {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
  }

  .wizard-option input[type='radio'] {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
  }

  .wizard-option label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
  }

  .wizard-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .wizard-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--divider-color);
  }

  /* Read by assistive technology, not drawn: the progress bar's step names. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /*
   * Split This Calendar (D12): the row under Which Events, a refusal inside its method's row, and
   * the panel a split leaves. The task itself is drawn in the step-by-step tasks' shared look
   * above.
   */
  .split-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 8px 4px 8px 16px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  /* The panel a split leaves, tinted as a notice. */
  .split-done {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
  }

  .split-part-head,
  .split-done-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .split-method.refused label {
    cursor: default;
    opacity: 0.6;
  }

  /* Review's counts under a part's head, set apart from it as a card's rows are. */
  .split-part .split-counts {
    padding-top: 8px;
    border-top: 1px solid var(--divider-color);
  }

  .split-refusal {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--secondary-background-color);
    font-size: 14px;
    --mdc-icon-size: 20px;
  }

  .split-refusal p,
  .split-counts,
  .split-writes,
  .split-events {
    margin: 0;
  }

  .split-refusal .icon {
    fill: var(--warning-color);
  }

  .split-counts,
  .split-writes,
  .split-events {
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  .split-events {
    padding-inline-start: 0;
    list-style: none;
  }

  .wizard-note {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    color: var(--primary-text-color);
    font-size: 14px;
    --mdc-icon-size: 20px;
  }

  /* A row's New, on the list and the split's panel; the audit's tags are .audit-meta's. */
  .cal-title .tag {
    padding: 0 6px;
    border-radius: 8px;
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    font-size: 11px;
  }

  /* The field a search result opened, Return to Results above it, highlighted for 2 s. */
  .jump {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .return {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    min-height: 44px;
  }

  .jumped {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 4px;
  }

  .color-head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 56px;
    padding: 0 8px 0 12px;
    border: none;
    border-bottom: 1px solid var(--divider-color);
    border-radius: 4px 4px 0 0;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .color-control.open .color-toggle {
    border-bottom-color: var(--primary-color);
  }

  .color-toggle:focus-visible,
  .color-row:has(input:focus-visible),
  .color-swatch:has(input:focus-visible) {
    outline: 2px solid var(--calendar-card-editor-focus-ring);
    outline-offset: 2px;
  }

  .color-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .color-name {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .color-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .color-dot {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--divider-color);
    border-radius: 50%;
    box-sizing: border-box;
    background: var(--dot);
    color: #fff;
    --mdc-icon-size: 20px;
  }

  .color-dot.crossed {
    background: linear-gradient(
      135deg,
      transparent 46%,
      var(--secondary-text-color) 46% 54%,
      transparent 54%
    );
  }

  .color-dot .icon {
    filter: drop-shadow(0 0 1px #000);
  }

  .color-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 4px 0 0;
    padding: 8px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
  }

  .color-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 4px 8px;
    border-radius: 8px;
    cursor: pointer;
  }

  .color-row:has(input:checked) {
    background: var(--secondary-background-color);
  }

  .color-row input,
  .color-swatch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .color-row-label {
    font-weight: 500;
  }

  .color-check {
    margin-inline-start: auto;
    fill: var(--primary-color);
  }

  .color-mark {
    display: inline-grid;
    place-items: center;
    width: 32px;
  }

  .color-swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, 44px);
    gap: 4px 2px;
    margin: 4px 0;
    padding: 8px 0;
    border: none;
    border-top: 1px solid var(--divider-color);
  }

  .color-swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
  }

  .color-swatch .color-dot {
    width: 36px;
    height: 36px;
  }

  .color-swatch:has(input:checked) .color-dot {
    outline: 2px solid var(--primary-text-color);
    outline-offset: 2px;
  }

  /* Clear of a focused swatch's ring, which reaches 4px past it: the tip is the text color, which
     the ring does not clear. */
  .color-tip {
    position: absolute;
    bottom: calc(100% + 6px);
    z-index: 1;
    display: none;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--primary-text-color);
    color: var(--card-background-color, #fff);
    font-size: 12px;
    white-space: nowrap;
  }

  /* A swatch under the pointer names itself only while the keyboard is neither in the color control
     nor on what holds it: the tip of a hovered swatch would lie over the ring of a focused
     neighbor, of the row above the swatches or of the field around them, which Undo focuses, in
     the text color the ring does not clear. */
  .color-control:not(:has(:focus-visible), :focus-visible *) .color-swatch:hover .color-tip,
  .color-control:not(:has(:focus-visible), :focus-visible *) .color-swatch:active .color-tip,
  .color-swatch:has(input:focus-visible) .color-tip {
    display: block;
  }

  .color-custom {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 4px 12px;
    padding-inline-start: 8px;
  }

  .color-invalid {
    grid-column: 2;
    margin: 0;
    color: var(--error-color);
    font-size: 12px;
  }

  .color-yaml {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    margin: 4px 0 0;
    padding: 8px 8px 0;
    border-top: 1px solid var(--divider-color);
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .color-yaml code {
    color: var(--primary-text-color);
    overflow-wrap: anywhere;
  }

  .color-kept {
    flex-basis: 100%;
  }

  .live-region {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .quick-setup-entry,
    .cal-list.dragging > [data-reorder] {
      transition: none;
    }
  }
`;
