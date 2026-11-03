import { afterEach, describe, expect, it, vi } from 'vitest';

import { eventBox, textBlockRight } from '../src/interaction/feedback';

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

  it.each(['event grid-event', 'event grid-banner'])(
    'keeps the box of a grid block, %s, which is drawn as one',
    (classes) => {
      stubLayout();
      expect(eventBox(row(classes)).right).toBe(1100);
    },
  );

  it('keeps the box of anything that is not an event, such as a button', () => {
    stubLayout();
    const button = document.createElement('button');
    button.textContent = 'Swim lesson';
    document.body.append(button);
    expect(eventBox(button).right).toBe(1100);
  });
});
