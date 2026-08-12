/**
 * Styling for the schema-driven editor.
 *
 * Deliberately small, and it should stay that way. Every field in the form is a Home
 * Assistant selector rendering with Home Assistant's own styling, so the only things
 * that need rules here are the chassis around the forms and the one piece of content
 * that is not a field. A rule targeting an input element would be a rule that breaks
 * when Home Assistant renames one — the exact liability the rebuild exists to shed.
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

  /*
   * The width table. Two columns, the widths right-aligned so the figures line up as
   * a scale — the point of the table is the ordering of the numbers, and a ragged
   * left edge on a column of measurements defeats it.
   */
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
`;
