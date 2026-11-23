/**
 * The label of each field the editor draws as a toggle chip, with no imports, so
 * `gates.ts` reads it for a gate line's clause ("Progress Bar is pressed") without joining an
 * import cycle. Which fields are chips is the page registry's; `tests/editor-chips.test.ts` holds
 * this table to it in both directions, and pins it by value.
 */

/**
 * Each chip's label: a short word where the field's own label reads as a sentence ("Show End
 * Time"). Time, Location and Description are their headings' words, so they cost no string.
 */
export const CHIP_LABELS: Readonly<Record<string, string>> = {
  'events:show_time': 'time',
  'events:show_end_time': 'chip.end_time',
  'events:show_location': 'location',
  'events:show_description': 'description',
  'events:show_countdown': 'chip.countdown',
  'events:show_progress_bar': 'chip.progress_bar',
  'events:show_duration': 'chip.duration',
  'events:show_now_indicator': 'chip.now',
  'card:toolbar.add_event': 'toolbar.controls.add_event',
  'card:toolbar.view_switcher': 'toolbar.view_switcher',
  'card:toolbar.legend': 'toolbar.legend',
  'card:toolbar.reset': 'toolbar.controls.reset',
  'card:toolbar.refresh': 'toolbar.controls.refresh',
  'card:toolbar.search': 'toolbar.controls.search',
  'card:toolbar.overlay': 'toolbar.controls.overlay',
  'card:toolbar.navigation': 'toolbar.navigation',
};
