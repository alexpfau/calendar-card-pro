import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { buildEventsSchema } from '../src/rendering/editor/schemas/events';

/**
 * The card-level Events panel must offer the styling controls that apply in the view the
 * card renders, not the ones that would apply in list view.
 *
 * 🚨 Every `show_*` flag gating a styling group is a `COLUMN_OVERRIDE_KEYS` member, so a
 * card carrying a `column:` block renders one thing and configures another. Reading
 * `ctx.config` directly answered for the card; `resolveViewOption` answers for the view.
 *
 * The harmful direction is the second of the two below: locations render in column view
 * and every control for styling them is absent from the editor, so the user can see the
 * thing on screen and has no way to configure it without hand-editing YAML.
 */

function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .map(({ node }) => node.name);
}

function eventsFields(config: Types.Config, view: Types.EffectiveView): string[] {
  return fieldNames(buildEventsSchema({ view, config, language: 'en' }));
}

describe('card-level Events panel resolves its gates per view', () => {
  it('offers location styling in column view when the column override turns locations on', () => {
    const config = buildConfig({
      show_location: false,
      column: { show_location: true },
    } as Partial<Types.Config>);

    const fields = eventsFields(config, 'column');

    // The control the user needs and could not reach.
    expect(fields).toContain('location_font_size');
    expect(fields).toContain('location_color');
  });

  it('withholds location styling in column view when the column override turns locations off', () => {
    const config = buildConfig({
      show_location: true,
      column: { show_location: false },
    } as Partial<Types.Config>);

    const fields = eventsFields(config, 'column');

    expect(fields).not.toContain('location_font_size');
    expect(fields).not.toContain('location_color');
  });

  it('still reads the card-level value in list view, where no override applies', () => {
    const on = eventsFields(
      buildConfig({
        show_location: true,
        column: { show_location: false },
      } as Partial<Types.Config>),
      'list',
    );
    const off = eventsFields(
      buildConfig({
        show_location: false,
        column: { show_location: true },
      } as Partial<Types.Config>),
      'list',
    );

    // A column override must not reach list view in either direction.
    expect(on).toContain('location_font_size');
    expect(off).not.toContain('location_font_size');
  });

  it('resolves every gated group, not only locations', () => {
    // 🚨 The denominator matters: `show_location` was the one reported, and the other four
    // are equally column-overridable. A fix covering only the reported one would pass the
    // three cases above and leave four groups wrong.
    const allOff = buildConfig({
      show_time: true,
      show_description: true,
      show_countdown: true,
      show_progress_bar: true,
      column: {
        show_time: false,
        show_description: false,
        show_countdown: false,
        show_progress_bar: false,
      },
    } as Partial<Types.Config>);

    const fields = eventsFields(allOff, 'column');

    expect(fields).not.toContain('time_font_size');
    expect(fields).not.toContain('description_font_size');
    expect(fields).not.toContain('progress_bar_height');

    // Control: the panel is not simply empty — ungated fields survive.
    expect(fields).toContain('event_font_size');
  });
});
