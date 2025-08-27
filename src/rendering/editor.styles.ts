/* eslint-disable import/order */
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

  .date-input {
    position: relative;
    margin-bottom: 16px;
    width: 100%;
  }

  .date-input .mdc-text-field {
    width: 100%;
    height: 56px;
    border-radius: 4px 4px 0 0;
    padding: 0;
    background-color: var(
      --mdc-text-field-fill-color,
      var(--input-fill-color, rgba(var(--rgb-primary-text-color), 0.06))
    );
    border-bottom: 1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color));
    transition:
      background-color 15ms linear,
      border-bottom-color 15ms linear;
    box-sizing: border-box;
    position: relative;
    overflow: hidden; /* Important for containing the ripple */
  }

  .date-input .mdc-text-field__ripple {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0; /* Hidden by default */
    background-color: var(--mdc-ripple-color, var(--primary-text-color));
    transition:
      opacity 15ms linear,
      background-color 15ms linear;
    z-index: 1;
  }

  .date-input .mdc-floating-label {
    position: absolute;
    top: 8px;
    left: 4px;
    -webkit-font-smoothing: antialiased;
    font-family: var(
      --mdc-typography-subtitle1-font-family,
      var(--mdc-typography-font-family, Roboto, sans-serif)
    );
    font-size: var(--mdc-typography-subtitle1-font-size, 1rem);
    font-weight: var(--mdc-typography-subtitle1-font-weight, 400);
    letter-spacing: var(--mdc-typography-subtitle1-letter-spacing, 0.009375em);
    text-transform: var(--mdc-typography-subtitle1-text-transform, inherit);
    transform: scale(0.75);
    color: var(--mdc-select-label-ink-color, rgba(0, 0, 0, 0.6));
    pointer-events: none;
    transition: color 15ms linear;
    z-index: 2;
  }

  .date-input .value-container {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 8px 16px 8px;
    position: relative;
    z-index: 2;
  }

  .date-input .value-text {
    -webkit-font-smoothing: antialiased;
    font-family: var(
      --mdc-typography-subtitle1-font-family,
      var(--mdc-typography-font-family, Roboto, sans-serif)
    );
    font-size: var(--mdc-typography-subtitle1-font-size, 1rem);
    line-height: var(--mdc-typography-subtitle1-line-height, 1.75rem);
    font-weight: var(--mdc-typography-subtitle1-font-weight, 400);
    letter-spacing: var(--mdc-typography-subtitle1-letter-spacing, 0.009375em);
    text-transform: var(--mdc-typography-subtitle1-text-transform, inherit);
    color: var(--primary-text-color);
  }

  .date-input input[type='date'] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 3;
  }

  /* Handle focus and hover states with JavaScript toggling classes */
  .date-input .mdc-text-field.focused {
    border-bottom: 2px solid var(--primary-color);
  }

  .date-input .mdc-text-field.focused .mdc-floating-label {
    color: var(--primary-color);
  }
`;
