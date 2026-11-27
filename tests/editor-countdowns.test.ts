/**
 * A calendar's own countdown settings (backlog item 407) and Show Time Left (backlog item 281) in
 * the visual editor: what each choice writes, and when what a countdown does is offered.
 *
 * Every presence check unfolds the page first, so a missing form means a field the page does not
 * build, never one folded to its head.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  type EditorElement,
  changeField,
  entry,
  formOf,
  lastConfig,
  mountEditor,
  openPageOf,
  unfoldAll,
  valueOf,
} from './helpers/editor-host';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

const REFINEMENTS = [
  'calendar:countdown_max_days',
  'calendar:show_countdown_allday',
  'calendar:countdown_exact_days',
] as const;

/** Which of a calendar's countdown fields its page builds, every setting opened. */
async function built(editor: EditorElement, at: number): Promise<Record<string, boolean>> {
  await openPageOf(editor, 'calendar:show_countdown', entry(at));
  await unfoldAll(editor);
  return Object.fromEntries(
    ['calendar:show_countdown', ...REFINEMENTS, 'calendar:show_time_left'].map((id) => [
      id,
      formOf(editor, id, entry(at)) !== undefined,
    ]),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("a calendar's countdowns", () => {
  it('writes each choice to that entry alone, and nothing for Follow the card', async () => {
    const editor = await mountEditor({ entities: [ANNA, BEN] });
    await changeField(editor, 'calendar:show_countdown', 'once_per_day', entry(0));
    expect(lastConfig(editor)?.entities).toEqual([
      { entity: ANNA, show_countdown: 'once_per_day' },
      BEN,
    ]);

    await changeField(editor, 'calendar:show_countdown', 'hide', entry(0));
    expect(lastConfig(editor)?.entities).toEqual([{ entity: ANNA, show_countdown: false }, BEN]);
    expect(valueOf(editor, 'calendar:show_countdown', entry(0))).toBe('hide');

    await changeField(editor, 'calendar:show_countdown', 'inherit', entry(0));
    const [anna] = lastConfig(editor)?.entities as unknown[];
    expect(typeof anna === 'string' ? {} : anna).not.toHaveProperty('show_countdown');
  });

  it("offers what a countdown does only while the calendar's countdowns are on", async () => {
    const editor = await mountEditor({ entities: [ANNA, BEN] });
    expect(await built(editor, 0)).toEqual({
      'calendar:show_countdown': true,
      'calendar:countdown_max_days': false,
      'calendar:show_countdown_allday': false,
      'calendar:countdown_exact_days': false,
      'calendar:show_time_left': true,
    });

    await changeField(editor, 'calendar:show_countdown', 'show', entry(0));
    await changeField(editor, 'calendar:countdown_max_days', 3, entry(0));
    await changeField(editor, 'calendar:show_countdown_allday', 'hide', entry(0));
    await changeField(editor, 'calendar:countdown_exact_days', 'days', entry(0));
    expect(lastConfig(editor)?.entities).toEqual([
      {
        entity: ANNA,
        show_countdown: true,
        countdown_max_days: 3,
        show_countdown_allday: false,
        countdown_exact_days: true,
      },
      BEN,
    ]);
  });

  it("offers them on a calendar following the card's countdowns, and not on one turning them off", async () => {
    const editor = await mountEditor({
      show_countdown: true,
      entities: [ANNA, { entity: BEN, show_countdown: false }],
    });
    const anna = await built(editor, 0);
    expect(REFINEMENTS.map((id) => anna[id])).toEqual([true, true, true]);
    const ben = await built(editor, 1);
    expect(ben['calendar:show_countdown']).toBe(true);
    expect(REFINEMENTS.map((id) => ben[id])).toEqual([false, false, false]);
  });
});

describe('Show Time Left', () => {
  it('is written by the part on Event Appearance, and by each calendar', async () => {
    const editor = await mountEditor({ entities: [ANNA, BEN] });
    // Written where Countdown is: in the layout being edited, List.
    await changeField(editor, 'events:show_time_left', true);
    expect(lastConfig(editor)?.list).toEqual({ show_time_left: true });

    await changeField(editor, 'calendar:show_time_left', 'hide', entry(1));
    expect(lastConfig(editor)?.entities).toEqual([ANNA, { entity: BEN, show_time_left: false }]);
  });
});
