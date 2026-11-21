/**
 * A title that is a template is rendered by Home Assistant, and the editor shows Home Assistant's
 * own error message under the Title field while it cannot be rendered.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { changeField, fakeHass, formOf, mountEditor, openPageOf } from './helpers/editor-host';
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
