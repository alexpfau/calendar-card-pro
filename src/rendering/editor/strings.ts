/**
 * English strings for the schema-driven editor.
 *
 * A deliberately **fresh namespace**, held here rather than in
 * `src/translations/languages/*.json` for the duration of the rebuild. Three reasons:
 *
 * 1. The old editor is still shipping and still owns the `editor.*` namespace. Two
 *    editors writing into one key space would leave dead keys behind in 35 language
 *    files with nothing able to tell which editor abandoned them.
 * 2. `npm run check:i18n` reports keys that no editor references, and it reads the old
 *    editor by regex. Landing forty unreferenced keys in `en.json` would turn a useful
 *    gate into noise for the whole of the build-out.
 * 3. Per-key fallback in `translateEditorKey` means a partially translated editor
 *    degrades to English rather than to raw key names, so shipping English-only is
 *    safe at every intermediate step — the property that makes this affordable.
 *
 * `resolveString` already consults the translation files first, so migrating a key is
 * adding it to `en.json` and deleting the line below. Nothing else has to move.
 *
 * **Naming.** Keys are the config key they label. A key inside a nested group is
 * qualified with the group's path (`column.min_day_width`) so an override can never
 * collide with the option it overrides. Helper text is the key plus `.helper`.
 */

/**
 * Label and helper strings, keyed as described above.
 *
 * Wording notes worth keeping: this is the surface where column view either explains
 * itself or generates support threads, so the sentences here state *what the card
 * does at a width* rather than *what an option is called*.
 */
export const EDITOR_STRINGS: Readonly<Record<string, string>> = {
  // --- Panels ---------------------------------------------------------------
  'panel.layout': 'Layout',
  'panel.layout.helper': 'How the card arranges days, and how much room it takes up.',

  // --- View -----------------------------------------------------------------
  view: 'Layout',
  'view.option.list.label': 'List',
  'view.option.list.description': 'Days stacked, one per row',
  'view.option.column.label': 'Columns',
  'view.option.column.description': 'Days side by side',
  'view.helper':
    'Column layout needs width. Below the threshold in the table, the same card ' +
    'renders as a list — so both layouts are live for one card, and the list ' +
    'settings still matter.',

  // --- Width table ----------------------------------------------------------
  'width_table.title': 'This card renders',
  'width_table.columns': '{count} columns',
  'width_table.columns_one': '1 column',
  'width_table.as_list': 'as a list',
  'width_table.cramped': '{count} columns, narrower than the minimum',
  'width_table.at_least': '\u2265 {width} px',
  'width_table.below': '< {width} px',
  'width_table.hysteresis':
    'Within {band} px of a boundary the card keeps the layout it already has, so a ' +
    'card sitting on the line settles instead of flickering.',

  // --- Spacing --------------------------------------------------------------
  day_spacing: 'Day Spacing',
  'day_spacing.helper': 'Gap between days. In column layout this is the gutter between columns.',
  event_spacing: 'Event Spacing',
  additional_card_spacing: 'Additional Card Spacing',
  'additional_card_spacing.helper': 'Extra padding above and below the card contents.',

  // --- Height ---------------------------------------------------------------
  height_mode: 'Card Height',
  'height_mode.helper': 'Whether the card grows with its content or is held to a height.',
  'height_mode.option.auto.label': 'Fit content',
  'height_mode.option.fixed.label': 'Fixed height',
  'height_mode.option.maximum.label': 'Maximum height',
  height: 'Height',
  'height.helper': 'The card is always this tall, scrolling if the events do not fit.',
  max_height: 'Maximum Height',
  'max_height.helper': 'The card grows with its content up to this height, then scrolls.',

  // --- Column density -------------------------------------------------------
  'column.density': 'Column Density',
  'column.density.helper':
    'How narrow a column may get before the card gives up a column, and what it does ' +
    'when it runs out.',
  'column.min_day_width': 'Minimum Day Width',
  'column.min_day_width.helper':
    'The narrowest a day column may be. Raising it makes the card demand more width ' +
    'for the same number of columns.',
  'column.min_days_to_show': 'Fewest Day Columns',
  'column.min_days_to_show.helper':
    'How far the card may reduce the column count to keep the layout. Defaults to the ' +
    'number of days shown, which means it never reduces.',
  'column.min_days_fallback': 'When Too Narrow',
  'column.min_days_fallback.option.list.label': 'Fall back to a list',
  'column.min_days_fallback.option.cramp.label': 'Keep the columns, narrower',
  'column.day_header_gap': 'Day Header Gap',
  'column.day_header_gap.helper': 'Space between a column heading and the events under it.',
  'column.day_header_separator_width': 'Day Header Rule Width',
  'column.day_header_separator_color': 'Day Header Rule Color',

  // --- Applicability --------------------------------------------------------
  //
  // Phrased as what the option *does* apply to, never as "this does nothing".
  // A column card renders as a list on a narrow screen, so a list-only option on a
  // column card is still the live control for what that card shows on a phone.
  'scope.list_only': 'Applies to the list layout, which this card also uses on narrow screens.',
  'scope.list_only.today_indicator_position':
    'Applies to the list layout — column layout places the indicator for you.',
  'scope.list_only.compact_events_to_show':
    'Applies to the list layout. Capping events per card would empty columns rather ' +
    'than shorten the card.',
  'scope.list_only.compact_days_to_show':
    'Applies to the list layout — capping days would delete trailing columns.',
  'scope.list_only.compact_events_complete_days':
    'Applies to the list layout — the height budget rotates per column.',
};

/**
 * Renders `{placeholder}` substitutions in a string.
 *
 * @param template - String possibly containing `{name}` placeholders
 * @param values - Replacements, keyed by placeholder name
 * @returns The string with every matching placeholder replaced
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
