/**
 * The card's outer wrapper.
 *
 * `tests/list-dom.test.ts` renders `renderGroupedEvents`, which is the events table and
 * nothing around it. The wrapper `renderMainCardStructure` produces — the `ha-card`, its
 * class list, the header, the loading indicator — was untested.
 *
 * That mattered beyond the missing coverage: **acceptance criterion E1, "list output is
 * byte-identical", is asserted against the list DOM gate**, so E1 was only ever true of
 * the part of the DOM that gate renders. A wrapper change could not have failed it.
 *
 * The concrete defect it hid: the class attribute was built by interpolating two
 * conditional strings, both empty for a default list card, leaving
 * `class="calendar-card-pro  "` — two spaces and a trailing one. Harmless in itself
 * (card-mod matches `ha-card.calendar-card-pro`), which is exactly why nothing caught it.
 *
 * These tests pin the wrapper structurally rather than by snapshot. The class list is the
 * thing that regressed and the thing a view addition will touch next, so it is asserted
 * as a *set* — order-independent, and a stray empty entry fails it.
 */

import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';

const noopHandlers = {
  keyDown: () => {},
  pointerDown: () => {},
  pointerMove: () => {},
  pointerUp: () => {},
  pointerCancel: () => {},
  pointerLeave: () => {},
  lostPointerCapture: () => {},
};

/** Renders the wrapper and returns its `ha-card` element. */
function wrapper(
  opts: {
    view?: Types.EffectiveView;
    title?: string;
    isLoading?: boolean;
    titlePending?: boolean;
    hasTapAction?: boolean;
    hasHoldAction?: boolean;
  } = {},
): Element {
  const host = document.createElement('div');
  render(
    Render.renderMainCardStructure(
      {},
      opts.title,
      html`<div class="sentinel"></div>`,
      noopHandlers,
      opts.isLoading ?? false,
      opts.titlePending ?? false,
      opts.view ?? 'list',
      opts.hasTapAction ?? false,
      opts.hasHoldAction ?? false,
    ),
    host,
  );
  const card = host.querySelector('ha-card');
  if (!card) throw new Error('no ha-card rendered — the harness is broken, not the card');
  return card;
}

/** The class attribute as a set, so assertions do not depend on order. */
function classes(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c !== '');
}

describe('the card wrapper', () => {
  it('renders an ha-card containing the content it was given', () => {
    // The denominator: everything below asserts on this element, so prove it exists and
    // that the content argument actually reaches the DOM.
    const card = wrapper();
    expect(card.querySelector('.sentinel')).not.toBeNull();
  });

  it('carries no empty class entries in list view', () => {
    // The regression. `calendar-card-pro  ` split on whitespace yields an empty string
    // between the separators; asserting the raw attribute would pass on either shape.
    const card = wrapper({ view: 'list' });
    expect(card.getAttribute('class')).toBe('calendar-card-pro');
    expect(classes(card)).toEqual(['calendar-card-pro']);
  });

  it('adds column-view only in column view, without a stray separator', () => {
    const card = wrapper({ view: 'column' });
    expect(classes(card).sort()).toEqual(['calendar-card-pro', 'column-view']);
    // `viewCssClass` returns '' for list view, so the join must not leave padding
    // behind on either side of the conditional class.
    expect(card.getAttribute('class')).not.toMatch(/\s{2}|^\s|\s$/);
    expect(classes(wrapper({ view: 'list' }))).not.toContain('column-view');
  });

  it('keeps the header container present whether or not there is a title', () => {
    // The comment in render.ts states this is deliberate — the element identity must not
    // change when the title arrives. That is a claim about the DOM, so it is pinned here.
    expect(wrapper({ title: 'Agenda' }).querySelector('.header-container')).not.toBeNull();
    expect(wrapper({}).querySelector('.header-container')).not.toBeNull();
    expect(wrapper({ title: 'Agenda' }).querySelector('h1.card-header')?.textContent).toBe(
      'Agenda',
    );
    expect(wrapper({}).querySelector('h1.card-header')).toBeNull();
  });

  it('reflects loading state on the host and renders a spinner', () => {
    const loading = wrapper({ isLoading: true });
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.querySelector('.loading-indicator')).not.toBeNull();

    const idle = wrapper({ isLoading: false });
    expect(idle.getAttribute('aria-busy')).toBe('false');
    expect(idle.querySelector('.loading-indicator')).toBeNull();
  });

  it('advertises interaction only when a card action can run', () => {
    const tap = wrapper({ hasTapAction: true });
    expect(tap.getAttribute('tabindex')).toBe('0');
    expect(tap.getAttribute('role')).toBe('button');
    expect(classes(tap)).toContain('card-interactive');
    expect(tap.querySelector('ha-ripple')).not.toBeNull();

    const holdOnly = wrapper({ hasHoldAction: true });
    expect(holdOnly.hasAttribute('tabindex')).toBe(false);
    expect(holdOnly.hasAttribute('role')).toBe(false);
    expect(classes(holdOnly)).toContain('card-interactive');
    expect(holdOnly.querySelector('ha-ripple')).not.toBeNull();

    const inert = wrapper();
    expect(inert.hasAttribute('tabindex')).toBe(false);
    expect(inert.hasAttribute('role')).toBe(false);
    expect(classes(inert)).not.toContain('card-interactive');
    expect(inert.querySelector('ha-ripple')).toBeNull();
  });
});
