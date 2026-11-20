/**
 * What the editor reads of `hass` while it renders, held to its key (backlog item 307).
 *
 * The editor skips a render whose only change is a `hass` that moved nothing in its key
 * (`hass-key.ts` › `editorHassKey`): the language, Home Assistant's string table, locale and
 * theme, and the states of the entities it draws. A render path that read anything else of `hass`
 * would then draw it stale, with every other test green. So every member of `hass` the editor
 * reads while it renders, and every member its forms' callbacks read, is recorded across a matrix
 * of configurations, panels and filters, and each must be in the key.
 *
 * Three kinds of read could escape a recorder, and each is closed:
 *
 * - **Before it is armed.** The recorder is installed on the editor's class before anything is
 *   mounted, around `willUpdate`, `update` and `updated`, so the first render is recorded, and with
 *   it what a factory cached on that render reads once and never again.
 * - **Through the feeds.** The two feeds copy `hass` into a wrapper (`{ ...hass, localize }`), which
 *   touches every member without depending on any of them, so the recorder is disarmed while
 *   `withCardActionLabels` and `steadyHass` build one. The copy is then handed on behind a proxy
 *   that records what is read of it, the same proxy for the same copy, so a form's `hass` keeps its
 *   identity: what a render reads through a feed is recorded like what it reads of `hass` itself.
 * - **By walking.** `Object.keys`, `in` and `for…in` reach `hass` and its states through `ownKeys`
 *   and `has`, not `get`; walking the states records `*`, as `hass-relevance.test.ts` ›
 *   `recordReads` does, and walking `hass` records `*` among its members. Neither is in any key.
 *
 * A read of `hass.config` in a render path fails this; another member copied into the wrapper
 * does not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FormElement,
  changeField,
  changeFields,
  editLayout,
  fakeHass,
  formsOf,
  mountEditor,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import { EDITOR_HASS_MEMBERS, editorEntityIds } from '../src/rendering/editor/hass-key';
import { walkSchema } from '../src/rendering/editor/panels';

const recorder = vi.hoisted(() => {
  const feeds = new WeakMap<object, object>();
  const recording = {
    armed: 0,
    /** How often an editor subscribed to Home Assistant's calendar colors (`ensureEntityColors`). */
    registry: 0,
    members: new Set<string>(),
    states: new Set<string>(),
    /** Runs a wrapper's copy with the recorder disarmed. */
    disarmed<T>(copy: () => T): T {
      const armed = recording.armed;
      recording.armed = 0;
      try {
        return copy();
      } finally {
        recording.armed = armed;
      }
    },
    /**
     * Records a member read of `hass` or of a feed, `*` for a walk over all of them. Lit's own
     * markers (`_$litDirective$`, `_$litStatic$`) are not: Lit looks for them on every object a
     * binding is handed, which says nothing about what the editor draws from it.
     */
    member(member: string | symbol): void {
      if (recording.armed > 0 && typeof member === 'string' && !member.startsWith('_$lit')) {
        recording.members.add(member);
      }
    },
    /**
     * A feed behind a proxy that records what is read of it while the recorder is armed: the same
     * proxy for the same feed, so a feed kept the same object stays one.
     */
    tracked<T>(feed: T): T {
      if (feed === null || typeof feed !== 'object') return feed;
      let proxy = feeds.get(feed);
      if (!proxy) {
        proxy = new Proxy(feed, {
          get(target, member, receiver) {
            recording.member(member);
            return Reflect.get(target, member, receiver);
          },
          has(target, member) {
            recording.member(member);
            return Reflect.has(target, member);
          },
          ownKeys(target) {
            recording.member('*');
            return Reflect.ownKeys(target);
          },
        });
        feeds.set(feed, proxy);
      }
      return proxy as T;
    },
  };
  return recording;
});

vi.mock('../src/rendering/editor/hass-localize', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/rendering/editor/hass-localize')>();
  return {
    ...original,
    withCardActionLabels: (...args: Parameters<typeof original.withCardActionLabels>) =>
      recorder.tracked(recorder.disarmed(() => original.withCardActionLabels(...args))),
  };
});

vi.mock('../src/rendering/editor/hass-key', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/rendering/editor/hass-key')>();
  return {
    ...original,
    steadyHass: (...args: Parameters<typeof original.steadyHass>) =>
      recorder.tracked(recorder.disarmed(() => original.steadyHass(...args))),
  };
});

// The registry subscription an entry's color control asks for reads `connection` and `callWS` once,
// to subscribe; what the editor draws from it comes through the module's own map and its
// `onChange`, never through `hass`, so a skipped render cannot draw it stale. Its reads are left
// out, counted, as the feeds' copies are; every other read is still recorded.
vi.mock('../src/utils/entity-colors', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils/entity-colors')>();
  return {
    ...original,
    ensureEntityColors: (...args: Parameters<typeof original.ensureEntityColors>) => {
      recorder.registry += 1;
      return recorder.disarmed(() => original.ensureEntityColors(...args));
    },
  };
});

/** An editor. */
type Editor = Awaited<ReturnType<typeof mountEditor>>;

/** The parts of an editor's update cycle the recorder is armed around. */
const STEPS = ['willUpdate', 'update', 'updated'] as const;

function state(id: string, name: string) {
  return { entity_id: id, state: 'on', attributes: { friendly_name: name } };
}

const STATES = Object.fromEntries(
  [
    ['calendar.anna', 'Anna'],
    ['calendar.ben', 'Ben'],
    ['person.leo', 'Leo'],
    ['weather.home', 'Home'],
    ['light.hall', 'Hall'],
    ['sensor.porch', 'Porch'],
  ].map(([id, name]) => [id, state(id, name)]),
);

/**
 * A Home Assistant that records what is read of it, and of its states, while the recorder is
 * armed.
 *
 * @returns The `hass`
 */
function recordedHass(): Types.Hass {
  const hass = fakeHass({
    states: STATES,
    localize: (key: string) => key,
    themes: { darkMode: false },
    config: { country: 'DE' },
    user: { id: 'anna', name: 'Anna' },
  });
  const states = new Proxy(hass.states, {
    get(target, id, receiver) {
      if (recorder.armed > 0 && typeof id === 'string') recorder.states.add(id);
      return Reflect.get(target, id, receiver);
    },
    has(target, id) {
      if (recorder.armed > 0) recorder.states.add('*');
      return Reflect.has(target, id);
    },
    ownKeys(target) {
      if (recorder.armed > 0) recorder.states.add('*');
      return Reflect.ownKeys(target);
    },
  });
  return new Proxy(hass, {
    get(target, member, receiver) {
      recorder.member(member);
      return member === 'states' ? states : Reflect.get(target, member, receiver);
    },
    has(target, member) {
      recorder.member(member);
      return Reflect.has(target, member);
    },
    ownKeys(target) {
      recorder.member('*');
      return Reflect.ownKeys(target);
    },
  });
}

/**
 * Arms the recorder around every editor's update cycle: `willUpdate`, `update`, which renders and
 * commits, the forms of panels opened inside it included, and `updated`. Installed on the class
 * before an editor is mounted, so its first update is armed too.
 *
 * @returns Undoes it
 */
function armEditors(): () => void {
  const proto = CalendarCardProEditor.prototype as unknown as Record<
    (typeof STEPS)[number],
    (this: unknown, changed: unknown) => void
  >;
  const undo = STEPS.map((step) => {
    const own = Object.prototype.hasOwnProperty.call(proto, step);
    const original = proto[step];
    proto[step] = function (this: unknown, changed: unknown) {
      recorder.armed += 1;
      try {
        original.call(this, changed);
      } finally {
        recorder.armed -= 1;
      }
    };
    return () => {
      if (own) proto[step] = original;
      else delete proto[step];
    };
  });
  return () => undo.forEach((step) => step());
}

/**
 * Reads every input of every form drawn, as `ha-form` does, with the recorder armed: each node's
 * label and helper, with the path an expandable hands down, and an option label.
 *
 * @param editor - The editor
 * @returns How many forms were read
 */
function readForms(editor: Editor): number {
  const forms: FormElement[] = formsOf(editor);
  recorder.armed += 1;
  try {
    for (const form of forms) {
      for (const { node, path } of walkSchema(form.schema)) {
        form.computeLabel?.(node, form.data, { path: [...path] });
        form.computeHelper?.(node, { path: [...path] });
      }
      (form as FormElement & { localizeValue?: (key: string) => unknown }).localizeValue?.(
        'view.option.list.label',
      );
    }
  } finally {
    recorder.armed -= 1;
  }
  return forms.length;
}

const CONFIGS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['a fresh card', { entities: ['calendar.anna'] }],
  [
    'every entity it draws',
    {
      entities: [
        { entity: 'calendar.anna', label: 'person.leo', name: 'Anna at home' },
        { entity: 'calendar.ben', visibility: [{ condition: 'state', entity: 'sensor.porch' }] },
        'calendar.ben',
      ],
      weather: { entity: 'weather.home', position: 'both' },
      toolbar: { show: true, buttons: [{ icon: 'mdi:lightbulb', entity: 'light.hall' }] },
    },
  ],
  ['Grid', { view: 'grid', entities: ['calendar.anna', 'calendar.ben'] }],
  // Month's own page fields and its scope, opened as the card shows it.
  ['Month', { view: 'month', entities: ['calendar.anna', 'calendar.ben'] }],
];

let disarm: () => void = () => {};

beforeEach(() => {
  disarm = armEditors();
});

afterEach(() => {
  disarm();
  document.body.replaceChildren();
  recorder.members.clear();
  recorder.states.clear();
  recorder.registry = 0;
});

describe('what the editor reads of hass while it renders', () => {
  it.each(CONFIGS)(
    'is in its key, for %s, through every panel and filter',
    async (_name, extra) => {
      const config = { config_version: Config.CURRENT_CONFIG_VERSION, ...extra };
      const editor = (await mountEditor(config, { hass: recordedHass() })) as Editor;
      let renders = 0;
      let forms = 0;
      const settle = async () => {
        await editor.updateComplete;
        renders += 1;
        forms += readForms(editor);
      };

      editor.requestUpdate();
      await settle();
      await openPanels(editor);
      await settle();
      await changeField(editor, 'card:title', 'Family');
      await settle();
      for (const workspace of ['shared', 'grid', 'column']) {
        await editLayout(editor, workspace);
        await settle();
      }
      for (const criteria of [
        { 'filter:search': 'anna' },
        { 'filter:search': 'ben' },
        { 'filter:search': '' },
      ]) {
        await changeFields(editor, criteria);
        await settle();
      }

      const allowed = new Set<string>([...EDITOR_HASS_MEMBERS, 'states']);
      const drawn = editorEntityIds({ ...Config.DEFAULT_CONFIG, ...config } as Types.Config);
      console.info(
        `Read set: ${recorder.members.size} members and ${recorder.states.size} states, ` +
          `over ${renders} renders and ${forms} forms read; ` +
          `${recorder.registry} registry subscriptions`,
      );
      // An entry's page drew a color control, which subscribed: the exemption above was used.
      expect(recorder.registry).toBeGreaterThan(0);
      // The recorder sees what the editor reads: the language and a calendar's name at least.
      expect(recorder.members).toContain('locale');
      expect(recorder.states).toContain('calendar.anna');
      expect([...recorder.members].filter((member) => !allowed.has(member))).toEqual([]);
      expect([...recorder.states].filter((id) => !drawn.has(id))).toEqual([]);
      // Over a second in a full local run; the limit is set for CI's slower runner under load
      // rather than for a hang.
    },
    30_000,
  );

  it('is in its key while Quick Setup reviews the calendars it was given', async () => {
    const config = {
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna', 'calendar.ben'],
    };
    const editor = (await mountEditor(config, { hass: recordedHass() })) as Editor;
    const press = async (selector: string) => {
      editor.shadowRoot!.querySelector<HTMLButtonElement>(selector)!.click();
      await editor.updateComplete;
      readForms(editor);
    };

    await press('[data-quick-setup-open]');
    await press('[data-story="family_hub"]');
    for (let step = 0; step < 4; step++) await press('[data-quick-setup-next]');
    expect(editor.shadowRoot!.querySelector('.quick-setup-review')).not.toBeNull();

    // The answers' weather entity, which the review names, is in the key as their calendars are.
    const drawn = editorEntityIds({ ...Config.DEFAULT_CONFIG, ...config } as Types.Config, [
      'weather.home',
    ]);
    expect(recorder.states).toContain('calendar.anna');
    expect(recorder.states).toContain('weather.home');
    expect([...recorder.members].filter((member) => member !== 'states')).toEqual(
      [...recorder.members].filter((member) =>
        (EDITOR_HASS_MEMBERS as ReadonlyArray<string>).includes(member),
      ),
    );
    expect([...recorder.states].filter((id) => !drawn.has(id))).toEqual([]);
  });
});
