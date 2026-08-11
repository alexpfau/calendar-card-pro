import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import * as Leaves from '../src/rendering/leaves';

/**
 * Entity-label classification.
 *
 * `renderLabel` splits a label three ways -- icon, image, and everything else.
 * The "everything else" branch conflated two cases that want opposite layout
 * treatment, which is what this file pins down:
 *
 * - A **glyph** (emoji, symbol) is about one character wide. Hanging it in the
 *   margin so a wrapped title lines up underneath itself costs nothing and stops
 *   continuation lines tucking under the label, where they read as a separate
 *   event.
 * - A **prose** label ("Familienkalender: ") is not. Hanging that would indent
 *   every continuation line by the width of the whole word and throw most of a
 *   narrow column view away.
 *
 * The indent itself is pure CSS and therefore invisible to this suite -- see the
 * note in `max-lines.test.ts` about the stylesheet being ungated. What *is*
 * checkable, and what actually decides the behaviour, is which class comes out.
 *
 * The predicate is written without `\p{Extended_Pictographic}` because tsconfig
 * targets ES2017 and Unicode property escapes are ES2018, so the surrogate ranges
 * are spelled out longhand. That makes it worth testing against real emoji rather
 * than trusting it by inspection.
 */
describe('renderLabel glyph classification', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  /** Render a label and return the resulting element, or null when nothing rendered. */
  function renderLabel(label: string | undefined): Element | null {
    litRender(Leaves.renderLabel(label), host);
    return host.firstElementChild;
  }

  it.each([
    ['a single emoji', '🎉'],
    ['two emoji', '📅🎉'],
    ['an emoji with a variation selector', '☀️'],
    ['a ZWJ family sequence', '👨‍👩‍👧‍👦'],
    ['a skin-tone modifier sequence', '👋🏽'],
    ['a dingbat', '✔'],
  ])('marks %s as a glyph', (_name, label) => {
    const el = renderLabel(label);
    expect(el?.classList.contains('calendar-label')).toBe(true);
    expect(el?.classList.contains('label-emoji')).toBe(true);
  });

  it.each([
    ['a plain word', 'Familienkalender:'],
    ['a word with a trailing space', 'Familienkalender: '],
    ['an emoji followed by prose', '🎉 Party'],
    ['prose followed by an emoji', 'Party 🎉'],
    ['a bare number', '2024'],
    ['a single letter', 'F'],
  ])('does not mark %s as a glyph', (_name, label) => {
    const el = renderLabel(label);
    expect(el?.classList.contains('calendar-label')).toBe(true);
    expect(el?.classList.contains('label-emoji')).toBe(false);
  });

  it('leaves the icon branch alone', () => {
    const el = renderLabel('mdi:briefcase');
    expect(el?.tagName.toLowerCase()).toBe('ha-icon');
    expect(el?.classList.contains('label-icon')).toBe(true);
  });

  it.each([
    ['a /local/ path', '/local/family.png'],
    ['a bare image extension', '/static/icons/favicon-192x192.png'],
  ])('leaves the image branch alone for %s', (_name, label) => {
    const el = renderLabel(label);
    expect(el?.tagName.toLowerCase()).toBe('img');
    expect(el?.classList.contains('label-image')).toBe(true);
  });

  it('renders nothing without a label', () => {
    expect(renderLabel(undefined)).toBeNull();
    expect(renderLabel('')).toBeNull();
  });
});
