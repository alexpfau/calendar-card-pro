/**
 * Styles for the editor chassis around Home Assistant form controls.
 */

import { css } from 'lit';

export default css`
  .card-config {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .view-controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  .workspace-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
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

  .misplaced-options li {
    padding: 2px 0;
  }

  .misplaced-options code {
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

  .quick-setup-chevron {
    flex: none;
    color: var(--primary-color);
  }

  /* The chevron points the way the text runs. */
  .quick-setup-chevron:dir(rtl) {
    transform: scaleX(-1);
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

  .view-resets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  ha-expansion-panel {
    margin: 8px 0;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0 4px;
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

  .filter-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
    padding: 8px 0 4px;
  }

  .filter-empty {
    color: var(--primary-text-color);
    padding: 24px 8px;
    text-align: center;
  }

  .filter-empty-note {
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 8px;
  }

  ha-expansion-panel.button-panel,
  ha-expansion-panel.entity-panel {
    margin: 0;
  }

  /* The action row sits above the settings rather than below them, so it is visible when
     the panel opens instead of after a scroll. That puts the one destructive action where
     the user lands, so Remove is separated from the three that can be undone by simply
     doing them again: an auto start margin holds it against the far edge, and on a narrow
     panel — where the four buttons no longer fit on one line — it wraps onto a line of its
     own rather than sitting next to Duplicate. A toolbar button's panel lays out Move Up,
     Move Down and Remove the same way. */
  .button-actions,
  .entity-actions {
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 8px;
  }

  .button-actions-safe,
  .entity-actions-safe {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .button-actions .destructive,
  .entity-actions .destructive {
    margin-inline-start: auto;
  }

  /* Home Assistant's own Visibility editor sits between the two halves of a calendar's form,
     under the Visibility heading that ends the first half. Its helper reads as a form field's
     helper does, above the editor rather than below it, since the editor grows downward as
     conditions are added. */
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

  /* The panel body spaces its children 16px apart, and a form spaces its fields 24px apart;
     the buttons' sub-heading takes the form's spacing from the toolbar's last switch above it. */
  .buttons-heading {
    margin-top: 8px;
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
  .scope-choice:hover {
    background: var(--secondary-background-color);
  }

  .icon-button:focus-visible,
  .nav-row:focus-visible,
  .text-button:focus-visible,
  .link:focus-visible,
  .field:focus-visible,
  .heading:focus-visible,
  .page-title:focus-visible,
  .display-choice:focus-within,
  .scope-choice:focus-within {
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
  .displays {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .scope-compact {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 12px;
    border: 1px solid var(--divider-color);
    border-radius: 12px;
    color: var(--secondary-text-color);
  }

  .scope-line b {
    color: var(--primary-text-color);
    font-weight: 500;
  }

  .scope-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .scope-choice {
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
    padding-top: 12px;
    border-top: 1px solid var(--divider-color);
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
    .quick-setup-banner {
      transition: none;
    }
  }
`;
