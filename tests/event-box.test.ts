import { afterEach, describe, expect, it, vi } from 'vitest';

import { eventBox, paints, textBlockRight } from '../src/interaction/feedback';

/**
 * Where the popover takes an event to end: a grid block at its box, a list row or column event
 * at the end of its text, leaving out a part pinned to the row's far edge. happy-dom lays
 * nothing out, so the geometry is stubbed: each text node is given its line boxes by its text.
 */

const line = (left: number, right: number) => ({ left, right });

describe('textBlockRight', () => {
  it('ends a block of lines at its longest one', () => {
    // Title, time and location lines of a list row, all starting at the same place.
    expect(textBlockRight([line(110, 230), line(130, 200), line(130, 260)])).toBe(260);
  });

  it('leaves out a part pinned to the far edge, past a wide gap', () => {
    // A weather badge at the right end of a row as wide as the card.
    expect(textBlockRight([line(1090, 1102), line(110, 230), line(130, 200)])).toBe(230);
  });

  it('keeps a part only a narrow gap away, such as words after an icon', () => {
    expect(textBlockRight([line(110, 230), line(260, 300)])).toBe(300);
  });

  it('measures nothing without text', () => {
    expect(textBlockRight([])).toBeUndefined();
    expect(textBlockRight([line(50, 50)])).toBeUndefined();
  });
});

describe('eventBox', () => {
  const box = { left: 100, top: 200, right: 1100, bottom: 260, width: 1000, height: 60 };
  const lines: Record<string, Array<{ left: number; right: number }>> = {
    'Swim lesson': [line(110, 200)],
    '16:00 - 17:00': [line(130, 230)],
    '6°': [line(1080, 1095)],
  };

  function stubLayout() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect);
    let selected: Node | null = null;
    vi.spyOn(document, 'createRange').mockImplementation(
      () =>
        ({
          selectNodeContents: (node: Node) => (selected = node),
          getClientRects: () => lines[selected?.nodeValue?.trim() ?? ''] ?? [],
        }) as unknown as Range,
    );
  }

  function row(classes: string) {
    const el = document.createElement('div');
    el.className = classes;
    el.innerHTML =
      '<span class="event-title">Swim lesson</span> <span>6°</span><div>16:00 - 17:00</div>';
    document.body.append(el);
    return el;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('ends a list row or column event where its text does, not where the card does', () => {
    stubLayout();
    expect(eventBox(row('event event-first'))).toEqual({
      left: 100,
      top: 200,
      right: 230,
      bottom: 260,
    });
  });

  it('never ends past its own box, as text cut short by an ellipsis would', () => {
    stubLayout();
    lines['Swim lesson'] = [line(110, 1400)];
    try {
      expect(eventBox(row('event')).right).toBe(1100);
    } finally {
      lines['Swim lesson'] = [line(110, 200)];
    }
  });

  it('measures from inside the event too, as a keyboard press on its button does', () => {
    stubLayout();
    const button = document.createElement('div');
    button.setAttribute('role', 'button');
    const event = row('event');
    button.append(...Array.from(event.childNodes));
    event.append(button);
    expect(eventBox(button).right).toBe(230);
  });

  it.each([
    ['a grid block', 'rgba(63, 81, 181, 0.2)'],
    // happy-dom keeps an rgba() as written; Chrome's color() form is read in `paints` below.
    ['a list row under event_background_opacity', 'rgba(0, 154, 199, 0.2)'],
  ])('keeps the box of %s, which is drawn tinted', (_name, tint) => {
    stubLayout();
    const tinted = row('event');
    tinted.style.backgroundColor = tint;
    expect(eventBox(tinted).right).toBe(1100);
  });

  it('measures the words of a row whose tint is fully transparent', () => {
    stubLayout();
    const clear = row('event');
    clear.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    expect(eventBox(clear).right).toBe(230);
  });

  it('keeps the box of a right-to-left row, whose words it does not measure', () => {
    stubLayout();
    const rtl = row('event');
    rtl.style.direction = 'rtl';
    expect(eventBox(rtl).right).toBe(1100);
  });

  it('keeps the box of anything that is not an event, such as a button', () => {
    stubLayout();
    const button = document.createElement('button');
    button.textContent = 'Swim lesson';
    document.body.append(button);
    expect(eventBox(button).right).toBe(1100);
  });
});

describe('paints', () => {
  it.each([
    ['rgba(0, 0, 0, 0)', false],
    ['transparent', false],
    ['', false],
    ['color(srgb 0 0.6 0.78 / 0)', false],
    ['rgb(0 0 0 / 0%)', false],
    ['rgba(63, 81, 181, 0.2)', true],
    ['rgb(255, 0, 0)', true],
    ['color(srgb 0 0.6 0.78 / 0.2)', true],
    ['rgb(0 0 0 / 50%)', true],
    ['a color it cannot read', true],
  ])('reads %j as painting: %j', (color, painted) => {
    expect(paints(color)).toBe(painted);
  });
});
