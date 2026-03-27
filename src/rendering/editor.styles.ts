/**
 * Styling for the Calendar Card Pro editor
 */

import { css } from 'lit';

export default css`
  ha-textfield,
  ha-select,
  ha-formfield,
  ha-entity-picker,
  ha-icon-picker {
    display: block;
    margin: 8px 0;
  }

  .card-config {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .helper-text {
    color: var(--secondary-text-color);
    font-size: 10px;
    line-height: 1.1;
    margin-top: -4px;
    margin-bottom: 8px;
  }

  h3 {
    margin: 24px 0 6px 0;
    font-size: 14px;
  }

  h3:first-of-type {
    margin-top: 8px;
  }

  h4 {
    margin: 24px 0 6px 0;
  }

  h5 {
    margin: 2px 0 0 0;
  }

  .panel-content {
    padding: 8px 0 12px 0;
  }

  .action-config {
    display: flex;
    flex-direction: column;
  }

  ha-expansion-panel {
    margin: 8px 0;
  }

  ha-button {
    margin: 8px 0;
  }

  .indicator-field {
    display: flex;
    flex-direction: column;
    margin: 8px 0;
  }

  ha-formfield {
    display: flex;
    align-items: center;
    padding: 8px 0;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
  }

  .date-field-label {
    font-size: 12px;
    font-weight: 400;
    color: var(--secondary-text-color);
    padding-left: 4px;
  }

  .date-field input[type='date'] {
    width: 100%;
    height: 56px;
    border-radius: 4px 4px 0 0;
    border: none;
    border-bottom: 1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color));
    background-color: var(
      --mdc-text-field-fill-color,
      var(--input-fill-color, rgba(var(--rgb-primary-text-color), 0.06))
    );
    color: var(--primary-text-color);
    font-family: var(
      --mdc-typography-subtitle1-font-family,
      var(--mdc-typography-font-family, Roboto, sans-serif)
    );
    font-size: var(--mdc-typography-subtitle1-font-size, 1rem);
    padding: 0 16px;
    box-sizing: border-box;
    outline: none;
    -webkit-appearance: none;
    color-scheme: dark light;
  }

  .date-field input[type='date']:focus {
    border-bottom: 2px solid var(--primary-color);
  }

  .date-field input[type='date']:hover {
    border-bottom-color: var(--primary-text-color);
  }
`;
