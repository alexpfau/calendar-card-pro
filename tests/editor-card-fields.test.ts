/**
 * Whole-card fields and what the editor says about them: a title that is a template is rendered
 * by Home Assistant, whose own error message shows under Title while it cannot be; and the card's
 * own tap action is named as the card's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  changeField,
  fakeHass,
  formOf,
  helperOf,
  labelOf,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('a title template Home Assistant cannot render', () => {
  it('shows Home Assistant’s error under Title, and clears it once the title renders', async () => {
    const asked: string[] = [];
    const subscribeMessage = vi.fn(
      async (
        callback: (message: unknown) => void,
        message: { type?: string; template?: string },
      ) => {
        if (message?.type !== 'render_template') throw { code: 'unknown_command' };
        asked.push(message.template!);
        callback(
          message.template!.includes('broken')
            ? { error: "UndefinedError: 'broken' is undefined", level: 'ERROR' }
            : { result: 'Family', listeners: {} },
        );
        return () => undefined;
      },
    );
    const editor = await mountEditor(
      {
        config_version: Config.CURRENT_CONFIG_VERSION,
        entities: ['calendar.anna'],
        title: '{{ broken }}',
      },
      { hass: fakeHass({ connection: { subscribeMessage } }) },
    );
    await openPageOf(editor, 'card:title');
    const error = () =>
      (formOf(editor, 'card:title') as unknown as { error?: Record<string, string> }).error;
    await vi.waitFor(() =>
      expect(error()).toEqual({ title: "UndefinedError: 'broken' is undefined" }),
    );

    await changeField(editor, 'card:title', '{{ "Family" }}');
    await vi.waitFor(() => expect(asked).toContain('{{ "Family" }}'));
    await vi.waitFor(() => expect(error()).toBeUndefined());
    editor.remove();
  });
});

describe('the card’s own tap and hold actions', () => {
  it('say they are the card’s, and that an event’s and a day’s come first', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    await openPageOf(editor, 'actions:tap_action');
    expect(labelOf(editor, 'actions:tap_action')).toBe('Card Tap Action');
    expect(helperOf(editor, 'actions:tap_action')).toBe(
      'An event’s or a day’s own tap action comes first.',
    );
    editor.remove();
  });
});
