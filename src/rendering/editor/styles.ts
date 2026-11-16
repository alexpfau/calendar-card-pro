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

  .migration-choice {
    align-self: flex-start;
    min-height: 44px;
    max-width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--primary-color);
    border-radius: 4px;
    background: transparent;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    font-weight: 500;
  }

  .migration-choice:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }

  .migration-choice.primary {
    background: var(--primary-color);
    color: var(--text-primary-color, white);
  }

  .migration-choice-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
    margin-top: -8px;
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

  .quick-setup-entry {
    padding-bottom: 20px;
  }

  /* The banner is one button, drawn from Home Assistant's theme variables so it reads as native
     in any theme; rgb-primary-color is the primary color as an r, g, b triple, which Home
     Assistant derives for every theme. The fallback triple is its default blue. */
  .quick-setup-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 76px;
    padding: 14px 16px;
    border: 1px solid rgba(var(--rgb-primary-color, 3, 169, 244), 0.32);
    border-radius: var(--ha-card-border-radius, 12px);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
    transition: background-color 0.15s ease-in-out;
  }

  .quick-setup-banner:hover {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
  }

  .quick-setup-banner:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
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

  .quick-setup {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-inline-start: 3px solid var(--primary-color);
    border-radius: 4px;
    background: var(--secondary-background-color);
    line-height: 1.4;
  }

  .quick-setup-step,
  .quick-setup-note {
    color: var(--secondary-text-color);
  }

  .quick-setup-stories {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .story-option {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .story-tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 44px;
    padding: 12px;
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color, transparent);
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .story-tile[aria-pressed='true'] {
    border-color: var(--primary-color);
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }

  .story-tile:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .story-name {
    font-weight: 500;
  }

  .story-detail {
    color: var(--secondary-text-color);
    font-size: 13px;
  }

  .story-link {
    color: var(--primary-color);
    font-size: 13px;
    padding-inline-start: 2px;
  }

  .quick-setup-review {
    margin: 0;
    padding-inline-start: 20px;
  }

  .quick-setup-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .quick-setup-actions .migration-choice {
    align-self: auto;
  }

  .quick-setup-actions [data-quick-setup-cancel] {
    margin-inline-end: auto;
  }

  .migration-choice:disabled {
    cursor: not-allowed;
    opacity: 0.5;
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

  .filter-bar {
    border-bottom: 1px solid var(--divider-color);
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

  .text-button {
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    padding: 6px 8px;
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
  .scope-choice:hover,
  .chip-choice:hover {
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
  .display-choice:focus-within,
  .scope-choice:focus-within,
  .chip-choice:focus-within {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .heading:focus:not(:focus-visible),
  .page-title:focus:not(:focus-visible),
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

  .scope-choice,
  .chip-choice {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px 0 6px;
    border: 1px solid var(--divider-color);
    border-radius: 22px;
    cursor: pointer;
  }

  .scope-choice:has(input:checked),
  .chip-choice:has(input:checked),
  .display-choice:has(input:checked) {
    border-color: var(--primary-color);
  }

  .scope-count {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .scope-preview {
    color: var(--warning-color);
  }

  .display-choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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

  .quick-setup-entry {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .page-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-inline-start: -8px;
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

  .page-head .icon-button:dir(rtl),
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

  /* Use a Pattern and Use Words sit under their list at their own width. */
  .word-mode {
    align-self: flex-start;
  }

  /* --- Show what applies -----------------------------------------------------
     The line under a field with what its state words leave out and its Reset or Remove; a
     heading's Add row and gate lines; the preferences. */
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

  /* What This Card Changes: a compact row per stored line, its label and value as Edit. */
  .audit-head,
  .audit-row,
  .audit-line,
  .audit-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 8px;
  }

  .audit-head .heading {
    flex: 1;
  }

  .audit-count,
  .audit-meta {
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .audit-row {
    flex-wrap: nowrap;
    border-top: 1px solid var(--divider-color);
  }

  .audit-text {
    flex: 1;
    min-width: 0;
    padding: 4px 0;
  }

  .audit-edit {
    width: 100%;
    min-height: 44px;
    padding: 0;
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
  }

  .tag.warning {
    color: var(--warning-color, #ffa600);
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

  .add-row {
    border: 1px dashed var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
  }

  .add-toggle,
  .add-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: none;
    border-radius: inherit;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .add-toggle:hover,
  .add-item:hover {
    background: var(--secondary-background-color);
  }

  .add-toggle:focus-visible,
  .add-item:focus-visible,
  .pref-switch:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .add-text,
  .add-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .add-text {
    flex: 1;
    display: flex;
    gap: 2px;
    min-width: 0;
  }

  .add-title {
    color: var(--primary-color);
    font-weight: 500;
  }

  .add-names,
  .add-count,
  .add-item-note,
  .add-item-value {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.45;
  }

  /* The names wrap to two lines at most; "+N" stands outside the clamp, so a long name is cut
     rather than the count of the names that did not fit. */
  .add-names {
    display: flex;
    align-items: flex-end;
    min-width: 0;
  }

  .add-names-list {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    min-width: 0;
    overflow: hidden;
  }

  .add-more {
    flex: none;
    white-space: nowrap;
  }

  .add-toggle .add-plus {
    fill: var(--primary-color);
  }

  .add-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px 8px;
    border-top: 1px solid var(--divider-color);
  }

  .add-item {
    gap: 2px;
  }

  .add-filter {
    margin: 8px 4px;
    padding: 8px;
    border: 1px solid var(--divider-color);
    border-radius: 4px;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font: inherit;
  }

  .pref-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 16px 8px;
  }

  .pref-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 44px;
    padding: 0;
    border: none;
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .pref-track {
    flex: none;
    width: 36px;
    height: 14px;
    border-radius: 7px;
    background: var(--secondary-text-color);
    opacity: 0.5;
    position: relative;
  }

  .pref-thumb {
    position: absolute;
    top: -3px;
    inset-inline-start: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--card-background-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .pref-switch[aria-checked='true'] .pref-track {
    background: var(--primary-color);
  }

  .pref-switch[aria-checked='true'] .pref-thumb {
    inset-inline-start: 16px;
    background: var(--primary-color);
  }

  @media (prefers-reduced-motion: no-preference) {
    .pref-thumb {
      transition: inset-inline-start 0.15s;
    }
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
    color: var(--primary-color);
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

  .cal-group.grabbed > .cal-row:first-child {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
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

  .cal-badge {
    flex: none;
    max-width: 48px;
    overflow: hidden;
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
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }

  .text-button.filled:disabled {
    background: var(--disabled-color, #bdbdbd);
  }

  .add-calendar-button,
  .text-button.filled,
  .entry-steps .text-button {
    min-height: 44px;
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

  /* The jump list: Edit Here beside the count, Add beside a row, the tag saying why a setting
     is not drawn, a helper-only match's phrase, and a calendar's row under its folded result. */
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

  .result-add {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    min-height: 44px;
    margin-inline-end: 8px;
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

  /*
   * Split This Calendar (D12): the row under Which Events, the task in place of it with its
   * stepper, a refusal inside its method's card, a part's card, and the panel a split leaves.
   * The task and the panel are outlined in the primary color, the way the mockups frame them.
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

  .split-task,
  .split-done {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    border: 2px solid var(--primary-color);
    border-radius: 12px;
  }

  .split-stepper,
  .split-steps,
  .split-step,
  .split-actions,
  .split-part-head,
  .split-done-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .split-steps {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  .split-step {
    flex: 1;
  }

  .split-step.current {
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .split-step-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 12px;
    --mdc-icon-size: 16px;
  }

  .split-step.current .split-step-dot,
  .split-step.done .split-step-dot {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .split-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .split-actions {
    justify-content: space-between;
  }

  .split-methods,
  .split-part,
  .split-method {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .split-method,
  .split-part {
    padding: 12px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
  }

  .split-method.checked {
    border-color: var(--primary-color);
  }

  .split-method label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
  }

  .split-method.refused label {
    cursor: default;
    opacity: 0.6;
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

  .tag {
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
  .color-row:focus-within,
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

  .color-mark {
    display: inline-grid;
    place-items: center;
    width: 32px;
  }

  .color-swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, 44px);
    gap: 4px;
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
    .quick-setup-banner,
    .cal-list.dragging > [data-reorder] {
      transition: none;
    }
  }
`;
