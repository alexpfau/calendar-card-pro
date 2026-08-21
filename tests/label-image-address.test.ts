import { render as litRender } from 'lit';
import { beforeEach, describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import {
  fromEntityFormData,
  labelTypeOf,
  toEntityFormData,
} from '../src/rendering/editor/entities';
import { LABEL_TYPE } from '../src/rendering/editor/schemas/entity';
import * as Leaves from '../src/rendering/leaves';
import { ENTITY_ICON_SENTINEL } from '../src/utils/entity-icons';
import * as Helpers from '../src/utils/helpers';

/**
 * A `label` holding an image address Home Assistant serves (#566, and the whole of #215).
 *
 * `getLabelType` reads a label's shape off the value, and its image test used to accept only
 * the `/local/` prefix or a filename ending in one of six extensions. Everything else fell
 * through to `text`, so a valid address was drawn as its own characters in front of the event
 * title — with no warning and nothing in the log, which is why #215 read as a wrong path for
 * fifteen months when the path was right all along.
 *
 * Counted against a live instance rather than reasoned about: 169 entities carried an
 * `entity_picture` and 52 of those values the old rule read as text, across six `/api/*`
 * families. A person's picture — the value #215 asked for — is one of them.
 *
 * Everything here is written against a branch a default config never takes: `label` is opt-in,
 * so a suite built from `buildConfig()` alone renders none of it.
 */

const ENTITY = 'calendar.work';

/**
 * Addresses the card must read as images, one per way the old rule declined them.
 *
 * The first six are the `/api/*` families #566 counted; the rest are the shapes that reach
 * the same verdict by a different route, so that a fix narrower than the one made here fails
 * on the case it missed rather than passing on the ones it covered.
 */
const ADDRESSES: ReadonlyArray<readonly [string, string]> = [
  // No extension and the wrong prefix. This is the value #215 was given and told was wrong.
  ["a person's picture", '/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512'],
  // Contains `.png` and still failed: `$` anchored the old match to the end of the string.
  ['a brand icon behind a query string', '/api/brands/integration/homeassistant/icon.png?p=no'],
  ['a camera snapshot', '/api/camera_proxy/camera.front'],
  ['an add-on icon', '/api/hassio/addons/core_mosquitto/icon'],
  ['a proxied image', '/api/image_proxy/image.doorbell'],
  ['a media player cover', '/api/media_player_proxy/media_player.kitchen'],

  ['an absolute URL with no extension', 'https://example.com/avatar'],
  ['an insecure absolute URL', 'http://example.com/avatar'],
  ['a protocol-relative URL with no extension', '//example.com/avatar'],

  // Already worked, and must go on working: the fix widens the rule rather than swapping it.
  ['a /local/ path', '/local/school.png'],
  ['an absolute URL with an extension', 'https://example.com/a.png'],

  // 🚨 The shape test cannot reach these two. A relative path starts with neither a slash nor
  // a scheme, so retiring the extension arm — which the suggested fix in #566 proposed —
  // would have turned a working image label back into text. `photo.JPEG` is pinned in
  // `label-glyph.test.ts` too; the query-string form is the one that was broken.
  ['a relative path', 'photo.JPEG'],
  ['a relative path behind a query string', 'photo.png?v=2'],
  ['a relative path behind a fragment', 'photo.svg#icon'],

  // Extensions the old six-entry list left out. `avif` in particular is what Home Assistant's
  // own image proxy emits for a browser that accepts it.
  ['an avif file', 'cover.avif'],
  ['a bmp file', 'cover.bmp'],
  ['an ico file', 'favicon.ico'],
  ['an apng file', 'spinner.apng'],
] as const;

/**
 * Values that must keep their shape, so a widened image test is not simply a wider net.
 *
 * The slash-leading word is the one real regression the fix accepts, and it is here as an
 * `image` rather than as a control: pinning the cost makes it a decision rather than an
 * oversight, and the escape hatch that pays for it is exercised further down.
 */
const CONTROLS: ReadonlyArray<readonly [string, string, Helpers.LabelType]> = [
  ['a plain word', 'Work', 'text'],
  ['a word with a colon in it', 'Familienkalender:', 'text'],
  ['an emoji', '🎂', 'text'],
  ['a non-Latin label', 'やすみ', 'text'],
  ['a year', '2024', 'text'],
  ['a sentence mentioning a file', 'Send notes.png to Ana', 'text'],
  ['an mdi icon', 'mdi:calendar', 'icon'],
  ['a non-mdi icon prefix', 'phu:octopusenergy', 'icon'],
  ['the Home Assistant sentinel', ENTITY_ICON_SENTINEL, 'icon'],
] as const;

describe('reading an image address off a label', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  /** Render a label and report which of the four shapes was actually drawn. */
  function drawn(label: string, type?: Helpers.LabelType): string {
    litRender(Leaves.renderLabel(label, undefined, type), host);

    const el = host.firstElementChild;
    if (el === null) return 'none';

    const tag = el.tagName.toLowerCase();
    return tag === 'ha-icon' ? 'icon' : tag === 'img' ? 'image' : 'text';
  }

  /**
   * Asserted against what `renderLabel` draws as well as against the classifier, because the
   * classifier is only interesting insofar as it decides the markup. A change that satisfies
   * one and not the other is the drift this pairing exists to catch.
   */
  it.each(ADDRESSES)('reads %s as an image', (_name, address) => {
    expect(Helpers.getLabelType(address), address).toBe('image');
    expect(drawn(address), address).toBe('image');
  });

  it.each(ADDRESSES)('points the img at %s unchanged', (_name, address) => {
    litRender(Leaves.renderLabel(address), host);

    expect(host.firstElementChild?.getAttribute('src')).toBe(address);
  });

  it.each(CONTROLS)('still reads %s as %s', (_name, value, expected) => {
    expect(Helpers.getLabelType(value), value).toBe(expected);
    expect(drawn(value), value).toBe(expected);
  });

  /**
   * The order inside `getLabelType` is what makes the widened test safe, so it is pinned
   * rather than trusted. `isIconValue` runs first and already declines anything beginning with
   * a slash or a scheme — the regex needs `[a-z0-9]` after the colon, which `//` is not, and
   * the explicit `http` guard covers the rest. So the image arm cannot take a value the icon
   * arm should have had, in either direction.
   */
  it('cannot steal a value from the icon test that runs before it', () => {
    for (const [, address] of ADDRESSES) {
      expect(Helpers.isIconValue(address), address).toBe(false);
    }

    expect(Helpers.isIconValue('mdi:calendar')).toBe(true);
    expect(Helpers.getLabelType('mdi:calendar')).toBe('icon');
  });

  /**
   * 🚨 A `data:` URI is **not** covered, and this pins the reason rather than the wish.
   * `isIconValue` matches `data:image/…` — `data` is a scheme-shaped prefix followed by a
   * letter — so it is claimed as an icon two tests before the image arm is reached, and an
   * image test that accepted it would be dead code. Widening `isIconValue` instead would
   * reach `today_indicator`, which shares it, so it is left alone and `label_type: image`
   * carries the case.
   */
  it('leaves a data URI to the explicit shape', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo=';

    expect(Helpers.isIconValue(uri)).toBe(true);
    expect(Helpers.getLabelType(uri)).toBe('icon');

    expect(Helpers.resolveLabelType(uri, 'image')).toBe('image');
    expect(drawn(uri, 'image')).toBe('image');
  });
});

/**
 * The escape hatch the widened test rests on.
 *
 * A label that begins with a slash and means words is the one thing the fix gives up, so the
 * way back has to work — and it is the same one that already makes `label: home-assistant`
 * recoverable, rather than a second mechanism invented for this.
 */
describe('naming the shape explicitly', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
  });

  it.each([
    ['a slash-leading word', '/dev'],
    ['a bare slash', '/'],
    ["a person's picture", '/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512'],
  ])('renders %s literally when the configuration says it is text', (_name, label) => {
    expect(Helpers.resolveLabelType(label, 'text')).toBe('text');

    litRender(Leaves.renderLabel(label, undefined, 'text'), host);

    expect(host.firstElementChild?.tagName.toLowerCase()).toBe('span');
    expect(host.firstElementChild?.textContent).toBe(label);
  });

  it('suppresses an address entirely when the shape says none', () => {
    litRender(Leaves.renderLabel('/api/camera_proxy/camera.front', undefined, 'none'), host);

    expect(host.firstElementChild).toBe(null);
  });
});

/**
 * What the editor does with a calendar whose label is one of these addresses.
 *
 * The card and the editor read the same classifier, so widening it moves both — which is the
 * property to want, and also the one that needs pinning: the failure worth fearing is the two
 * disagreeing, leaving a calendar drawn as an image and edited as text.
 */
describe('the editor and an image address', () => {
  const ADDRESS = '/api/image/serve/8672f1121a4d15c3ed5c422e6bc0597c/512x512';

  function write(
    previous: string | Types.EntityConfig,
    overrides: Record<string, unknown> = {},
  ): string | Types.EntityConfig {
    return fromEntityFormData(
      ENTITY,
      { ...toEntityFormData(previous), ...overrides },
      previous,
      undefined,
      undefined,
    );
  }

  it('opens the image panel for a calendar carrying one', () => {
    expect(labelTypeOf({ entity: ENTITY, label: ADDRESS })).toBe('image');
  });

  /**
   * `needsExplicitType` writes `label_type` only where inference would read the value back as
   * something else, so an address configured through the editor carries no key restating what
   * the value already says.
   *
   * This passed before the fix as well, and for a different reason — the editor agreed with
   * the card that the value was *text*, so there was equally nothing to write. What changed is
   * what the absent key now means. It is here as a pin on that contract, not as evidence for
   * the fix; the two tests below are the ones that fail without it.
   */
  it('writes no redundant label_type beside one', () => {
    const written = write({ entity: ENTITY, label: ADDRESS });

    expect(written).toEqual({ entity: ENTITY, label: ADDRESS });
    expect(Helpers.resolveLabelType((written as Types.EntityConfig).label, undefined)).toBe(
      'image',
    );
  });

  /**
   * 🚨 The stored-config case, and the one to be sure of before shipping this.
   *
   * `label_type: image` is what #215's reporter was told to write, and touching anything in
   * the editor drops it — `fromEntityFormData` rebuilds the entry and re-derives the key. That
   * is a rewrite, so it is pinned rather than left to be noticed: it is safe **because** the
   * value it removes is the one inference now returns, so the card draws the same picture
   * before and after. The assertion is on the rendered shape rather than on the key alone,
   * which is what makes that an observation instead of a hope.
   */
  it('drops a now-redundant label_type without changing what is drawn', () => {
    const stored: Types.EntityConfig = { entity: ENTITY, label: ADDRESS, label_type: 'image' };

    const written = write(stored) as Types.EntityConfig;

    expect(Object.keys(written)).not.toContain('label_type');
    expect(Helpers.resolveLabelType(written.label, written.label_type)).toBe(
      Helpers.resolveLabelType(stored.label, stored.label_type),
    );
  });

  /**
   * The opposite direction, and the one that has to be written down rather than inferred. A
   * label the user means as words now reads back as an image, so the editor has to record the
   * disagreement — otherwise a calendar edited once would start drawing a broken picture.
   */
  it('writes label_type: text beside a slash-leading word', () => {
    const written = write({ entity: ENTITY, label: '/dev', label_type: 'text' });

    expect(written).toEqual({ entity: ENTITY, label: '/dev', label_type: 'text' });
  });

  /**
   * `fitsShape` drops the stored value when the user moves the dropdown to a shape that
   * cannot draw it. Before the fix that included moving an `/api/…` address to **An Image** —
   * the one move that was obviously right — so the editor silently cleared the path the user
   * had just pasted.
   */
  it('keeps the address when the shape is moved to image by hand', () => {
    const written = write({ entity: ENTITY, label: ADDRESS, label_type: 'text' }, {
      [LABEL_TYPE]: 'image',
    } as Record<string, unknown>);

    expect((written as Types.EntityConfig).label).toBe(ADDRESS);
  });
});
