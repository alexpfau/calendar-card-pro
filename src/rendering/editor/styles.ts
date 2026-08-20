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

  ha-expansion-panel.entity-panel,
  ha-expansion-panel.exceptions {
    margin: 0;
  }

  /* The action row sits above the settings rather than below them, so it is visible when
     the panel opens instead of after a scroll. That puts the one destructive action where
     the user lands, so Remove is separated from the three that can be undone by simply
     doing them again: an auto start margin holds it against the far edge, and on a narrow
     panel — where the four buttons no longer fit on one line — it wraps onto a line of its
     own rather than sitting next to Duplicate. */
  .entity-actions {
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 8px;
  }

  .entity-actions-safe {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .entity-actions .destructive {
    margin-inline-start: auto;
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
`;
