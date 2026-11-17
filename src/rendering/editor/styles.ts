/**
 * Styles for the editor chassis around Home Assistant form controls.
 */

import { css } from 'lit';

export default css`
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
    outline: 2px solid var(--primary-color);
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

  .story-tile {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
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
    outline: 2px solid var(--primary-color);
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

  .story-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .story-name {
    font-weight: 500;
  }

  .story-detail {
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
    align-items: flex-start;
    gap: 6px;
  }

  .search-row .filter-form {
    flex: 1;
    min-width: 0;
  }

  .search-row .history-controls {
    margin-top: 4px;
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

  .add-button {
    align-self: flex-start;
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

  .text-button:hover:not(:disabled) {
    background: var(--secondary-background-color);
  }

  .text-button:disabled {
    color: var(--disabled-text-color);
    cursor: default;
  }

  /* An icon beside a button's label takes the label's color, disabled and destructive included,
     rather than the theme's icon color. */
  .with-icon,
  .strip-button,
  .scope-lead {
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

  .scope-lead {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
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
  .scope-choice:not(:has(input:checked)):hover,
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
  .scope-choice:has(input:focus-visible),
  .chip-choice:has(input:focus-visible) {
    outline: 2px solid var(--primary-color);
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

  .scope,
  .displays,
  .chips,
  .tap-line {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .scope-compact,
  .tap-line {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 12px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    color: var(--secondary-text-color);
  }

  .scope-line b,
  .tap-line b {
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .scope-choices,
  .chip-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Settings For's choices and Start Date's are native radios drawn as the toggle chips are:
     the circle hidden, the chosen one tinted with a check, so the state never rests on color
     alone. The radio keeps the arrow keys and the group's name; it takes no pointer events. */
  .scope-choice,
  .chip-choice {
    position: relative;
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

  .scope-choice input,
  .chip-choice input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .scope-choice:has(input:checked),
  .chip-choice:has(input:checked) {
    border-color: transparent;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18);
    color: var(--primary-color);
  }

  .scope-choice:has(input:checked) .icon,
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
  .scope > legend,
  .chips > legend,
  .displays > legend,
  .segmented > legend {
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

  /* The switch keeps the button's own color, and wraps under the sentence on a narrow editor. */
  .scope-preview {
    flex-wrap: wrap;
  }

  .scope-preview-text {
    flex: 1 1 12em;
  }

  .scope-preview-switch {
    color: var(--primary-color);
  }

  @supports (color: color-mix(in oklab, red, blue)) {
    .scope-preview {
      color: color-mix(in oklab, var(--warning-color, #ffa600) 55%, var(--primary-text-color));
    }
  }

  /* Three across at every width, as Home Assistant's box select draws its options. */
  .display-choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .display-choice {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 4px 6px;
    padding: 8px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    cursor: pointer;
  }

  .display-choice input {
    width: 20px;
    height: 20px;
    margin: 0;
  }

  .display-text {
    display: flex;
    flex-direction: column;
    padding-top: 2px;
  }

  /* The label beside the radio, and the description under both, across the card's width: three
     across leaves each card about 118px at 372px, and the longest translations (German) would
     otherwise run to five lines. */
  .display-choice > .display-text {
    display: contents;
  }

  .display-label {
    align-self: center;
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
    grid-column: 1 / -1;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .display-image {
    grid-column: 1 / -1;
    width: 100%;
    max-height: 72px;
    object-fit: contain;
  }

  .row-group {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    padding: 4px 0;
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

  /* A header too narrow for its title beside its actions, a phone's, puts the actions on a line
     of their own at its end rather than squeezing the title into a column of single words. */
  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
    margin-inline-start: -8px;
  }

  /* A page header's actions, Search Settings first, sit together at its end and wrap together. */
  .head-actions {
    display: flex;
    align-items: center;
    margin-inline-start: auto;
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
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }

  .menu-check {
    flex: none;
    width: 20px;
    height: 20px;
    color: var(--primary-color);
    --mdc-icon-size: 20px;
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
    flex: 1 1 6rem;
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

  .link {
    min-height: 24px;
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
  .word-mode {
    align-self: flex-start;
    margin-inline-start: 16px;
    font-size: 12px;
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

  /* What This Card Changes: a row per stored line, its label, value and the lines under them as
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
     Every setting has a 44 px head row drawn the same folded and open, one grid of four columns:
     name and, while folded, value; the state pill; the chevron; ⓘ, at the row's end on every row,
     so it lines up down every page. Nothing of the editor's sits
     inside Home Assistant's field box, which an open setting draws below its head, so nothing
     covers the box's arrow, clear button, spinner or suffix, and nothing in the head moves when
     the setting opens: a second press lands where the first did. A switch keeps Home Assistant's
     own row, label and switch, across the name and chevron columns, so every switch ends where
     the chevrons end. */
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
    grid-template-columns: minmax(0, 1fr) auto 32px 44px;
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
    grid-column: 1 / 4;
  }

  .setting-head.switch .setting-end {
    display: none;
  }

  /* What a layout keeps of its own, under the name, inside the row it belongs to. */
  .setting-own {
    display: flex;
    grid-column: 1 / 3;
    grid-row: 3;
    align-items: flex-start;
    gap: 4px;
    margin-top: -8px;
    padding: 0 0 10px;
    padding-inline-start: 4px;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 16px;
    pointer-events: none;
    --mdc-icon-size: 16px;
  }

  .setting-head.switch .setting-own {
    margin-top: 0;
  }

  /* Home Assistant centers its switch on a label that wraps, so ⓘ follows it. */
  .setting-head.switch > .setting-tools > * {
    align-self: center;
  }

  .setting-own .icon {
    fill: var(--warning-color, #ffa600);
  }

  .setting-head.folds:hover {
    background: var(--secondary-background-color);
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

  /* The whole row is the toggle; the pill and ⓘ sit above it. */
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
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  /* A name and the mark of a whole-card setting. */
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

  /* Inline, so the word joiner before the mark keeps it on the line of the name's last word. */
  .setting-scope {
    margin-inline-start: 6px;
    color: var(--secondary-text-color);
    --mdc-icon-size: 16px;
  }

  .setting-scope .icon {
    display: inline-block;
    vertical-align: -2px;
    fill: currentcolor;
  }

  /* One line, cut with an ellipsis, so a folded head is as tall open as folded and an opened
     setting leaves no gap where a long value wrapped. */
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

  /* A switch: Home Assistant's own row, label and switch, starts the head, and the pill and ⓘ
     sit on its line. Home Assistant draws that line, 24 px, at the top of a 56 px box it keeps
     out of reach, so the box is moved down to center the line in the 44 px head, and the empty
     part below it is taken back. Centering the box instead put the pill under the switch. */
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

  /* The pill, the chevron and ⓘ each take a column of the head; they sit above the toggle. */
  .setting-tools {
    display: contents;
  }

  .setting-tools > * {
    position: relative;
    z-index: 1;
    grid-row: 1;
  }

  .setting-head > .setting-tools > .setting-pill-col {
    grid-column: 2;
  }

  .setting-head > .setting-tools > .setting-end {
    grid-column: 3;
  }

  .setting-head > .setting-tools > .setting-info,
  .setting-head > .setting-tools > .setting-slot {
    grid-column: 4;
  }

  /* A pill goes under the name where the column it would take is not the pill's: on a switch
     row, whose switch spans it, and on a phone. "Default", read but not drawn, takes no room. */
  .setting-head.switch > .setting-tools > .setting-pill-col:not(.quiet),
  :host([narrow]) .setting-head > .setting-tools > .setting-pill-col:not(.quiet) {
    grid-column: 1;
    grid-row: 2;
    justify-content: flex-start;
    width: auto;
    min-height: 0;
    margin: -10px 0 4px;
    padding-inline-start: 2px;
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
    outline: 2px solid var(--primary-color);
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

  /* One width for every pill on every page, measured from the words the pill can take, so
     values and pills line up down the page and nothing moves when a state changes. */
  .setting-pill-col {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    width: var(--pill-col, auto);
    min-height: 44px;
  }

  /* "Default", read but not drawn, takes no room. */
  .setting-pill.visually-hidden {
    height: 1px;
    padding: 0;
    border: 0;
  }

  .setting-pill-col > .setting-pill-button {
    padding: 0;
  }

  /* The chevron's slot is kept where nothing folds, so pills line up down the page. */
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

  .setting-pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--secondary-text-color);
    font-size: 12px;
    font-weight: 500;
    line-height: 22px;
    white-space: nowrap;
    box-sizing: border-box;
    --mdc-icon-size: 16px;
  }

  .setting-pill.tone-default {
    border-color: var(--divider-color);
  }

  .setting-pill.tone-set {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
    color: var(--primary-text-color);
    font-weight: 600;
  }

  .setting-pill.tone-inherited {
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
  }

  /* Text in the primary text color on a warning tint, as Not in Use's tag. */
  .setting-pill.tone-warning {
    background: rgba(var(--rgb-warning-color, 255, 166, 0), 0.28);
    color: var(--primary-text-color);
  }

  .setting-menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: flex-end;
    max-width: 100%;
    margin-top: -4px;
    padding: 0 12px 4px;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color);
    box-sizing: border-box;
  }

  .setting-menu-note {
    margin: 8px 0 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .setting-help {
    margin: 0;
    padding-inline: 4px;
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

  :host([narrow]) .setting-head > .setting-tools > .setting-pill-col.quiet {
    width: 0;
  }

  /* A setting a gate withholds, in its place. */
  .setting-gated {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
    min-height: 44px;
    padding-inline-start: 4px;
    color: var(--secondary-text-color);
  }

  .setting-gated-when {
    margin-inline-start: auto;
    font-size: 12px;
    line-height: 1.45;
    text-align: end;
  }

  /* A gate line shared by several settings reads as a sentence. */
  .setting-gated > .setting-gated-when:only-child {
    margin-inline-start: 0;
    text-align: start;
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
  .cal-block {
    padding: 4px 0 12px;
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .cal-block > .heading {
    padding-top: 8px;
  }

  .cal-block > :not(.cal-list) {
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
    outline: 2px solid var(--primary-color);
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
  .strip-button:hover:not(:disabled) {
    background: var(--secondary-background-color);
  }

  .cal-body:focus-visible,
  .strip-button:focus-visible,
  .cal-filter:focus-visible {
    outline: 2px solid var(--primary-color);
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
    outline: 2px solid var(--primary-color);
    outline-offset: -4px;
  }

  .drag-handle[aria-pressed='true'] {
    color: var(--primary-color);
  }

  /* --- Chips and the toolbar (section 5.9) ------------------------------------
     Toggle chips: native buttons, pressed with a check and the primary color, so the state never
     rests on color alone. An unpressable chip stays focusable and shows its reason inside it.
     Calendar Filter is a segmented row of native radios. The toolbar's own buttons are the
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
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--divider-color);
    border-radius: 20px;
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

  .chip:hover:not([aria-disabled='true']),
  .segment:hover {
    background: var(--secondary-background-color);
  }

  .chip:focus-visible,
  .chip-group:focus-visible,
  .segmented:focus-visible,
  .segment:focus-within {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .chip-group:focus:not(:focus-visible),
  .segmented:focus:not(:focus-visible) {
    outline: none;
  }

  .chip-source {
    color: var(--secondary-text-color);
  }

  .segmented {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 4px;
  }

  .segmented-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .segments {
    flex: 1;
    display: flex;
    overflow: hidden;
    border: 1px solid var(--divider-color);
    border-radius: 22px;
  }

  .segment {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 8px;
    color: var(--primary-color);
    cursor: pointer;
    text-align: center;
  }

  .segment + .segment {
    border-inline-start: 1px solid var(--divider-color);
  }

  .segment input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segment:has(input:checked) {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
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

  .button-row.grabbed {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
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

  .add-calendar-button {
    align-self: flex-start;
  }

  /* Add Calendar is the list's one primary action, so it is a tonal pill rather than a link. */
  .text-button.add-calendar-button {
    padding: 0 16px 0 12px;
    border-radius: 22px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
    font-weight: 500;
  }

  .text-button.add-calendar-button:hover {
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
    outline: 2px solid var(--primary-color);
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
    outline: 2px solid var(--primary-color);
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

  .color-tip {
    position: absolute;
    bottom: calc(100% + 2px);
    z-index: 1;
    display: none;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--primary-text-color);
    color: var(--card-background-color, #fff);
    font-size: 12px;
    white-space: nowrap;
  }

  .color-swatch:hover .color-tip,
  .color-swatch:active .color-tip,
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
