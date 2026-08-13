import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import * as Leaves from '../src/rendering/leaves';
import * as Helpers from '../src/utils/helpers';

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

  /**
   * The editor offers a control per label shape, so it needs to know which shape a value
   * holds — and `renderLabel` is the authority on that, because it is what actually
   * draws the thing. It now *calls* `getLabelType` rather than mirroring its three tests,
   * so the two can no longer drift; this keeps asserting against what is **rendered**, so
   * a change to the classifier that the renderer does not want still shows up here.
   */
  it.each([
    ['mdi:briefcase', 'icon'],
    ['phu:octopusenergy', 'icon'],
    ['/local/family.png', 'image'],
    ['/static/icons/favicon-192x192.png', 'image'],
    ['photo.JPEG', 'image'],
    ['Familienkalender:', 'text'],
    ['🎉', 'text'],
    ['2024', 'text'],
    ['', 'none'],
  ])('classifies %s the way renderLabel draws it', (label, expected) => {
    expect(Helpers.getLabelType(label)).toBe(expected);

    const el = renderLabel(label);
    const drawn =
      el === null
        ? 'none'
        : el.tagName.toLowerCase() === 'ha-icon'
          ? 'icon'
          : el.tagName.toLowerCase() === 'img'
            ? 'image'
            : 'text';

    expect(drawn, label).toBe(expected);
  });

  it('classifies a missing label as none', () => {
    expect(Helpers.getLabelType(undefined)).toBe('none');
    expect(Helpers.getLabelType(null)).toBe('none');
    expect(Helpers.getLabelType(42)).toBe('none');
  });

  /**
   * Reading the shape off the value cannot express two things a user can legitimately
   * want, and one of them is not a corner case — it is the state every text label passes
   * through while it is being typed. A calendar may therefore name its own shape, and
   * where it does, that naming wins over the reading.
   *
   * The case with teeth is the first: `mdi:calendar` as **literal text**. There was no
   * way to write it before, because the value would always have been read as an icon.
   */
  describe('an explicitly named shape', () => {
    /** Renders with an explicit shape and reports what was drawn. */
    function drawnWith(label: string, type: Helpers.LabelType): string {
      litRender(Leaves.renderLabel(label, undefined, type), host);
      const el = host.firstElementChild;
      if (el === null) return 'none';
      const tag = el.tagName.toLowerCase();
      return tag === 'ha-icon' ? 'icon' : tag === 'img' ? 'image' : 'text';
    }

    it.each([
      ['an icon name as text', 'mdi:calendar', 'text' as const, 'text'],
      ['an image path as text', '/local/family.png', 'text' as const, 'text'],
      ['text as an icon', 'briefcase', 'icon' as const, 'icon'],
      ['an icon suppressed entirely', 'mdi:calendar', 'none' as const, 'none'],
    ])('draws %s', (_name, label, type, expected) => {
      expect(drawnWith(label, type)).toBe(expected);
    });

    it('renders the literal characters when text is named', () => {
      litRender(Leaves.renderLabel('mdi:calendar', undefined, 'text'), host);
      expect(host.firstElementChild?.textContent).toBe('mdi:calendar');
    });

    it('falls back to reading the value when no shape is named', () => {
      expect(Helpers.resolveLabelType('mdi:calendar')).toBe('icon');
      expect(Helpers.resolveLabelType('mdi:calendar', undefined)).toBe('icon');
      // A value that is not one of the four shapes is not a shape.
      expect(Helpers.resolveLabelType('mdi:calendar', 'banana')).toBe('icon');
    });
  });
});
