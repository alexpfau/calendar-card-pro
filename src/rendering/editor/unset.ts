/**
 * What a folded setting says it uses while nothing names a value for it (backlog item 307): the
 * value column is never empty where the editor can name what applies. One rule: a setting that
 * follows another one says so, "Same as Weekday Color"; any other setting names what it does,
 * "No Limit", "None", "Theme Default".
 *
 * No DOM and no Lit here, so the tests can call it directly.
 */

import { type FieldId, parseFieldId } from './field-index';

/** Resolves one of the editor's own strings by its literal key, with its values. */
export type Translate = (key: string, values?: Readonly<Record<string, string>>) => string;

/** The setting each setting that follows another follows, by name. */
export const FOLLOWS: Readonly<Record<string, string>> = {
  weekend_weekday_color: 'weekday_color',
  weekend_day_color: 'day_color',
  weekend_month_color: 'month_color',
  today_weekday_color: 'weekday_color',
  today_day_color: 'day_color',
  today_month_color: 'month_color',
  month_separator_label_color: 'month_separator_color',
};

/**
 * The words for a setting whose value is unset, or `undefined` where the field's own value words
 * are the answer.
 *
 * @param id - The field
 * @param t - The editor's strings
 * @param label - Names a card setting by its option name: "Weekday Color"
 * @param tile - Whether today's date is drawn as a tile, whose digits take the tile's own ink
 * @returns The words
 */
export function unsetWord(
  id: FieldId,
  t: Translate,
  label: (name: string) => string,
  tile = false,
): string | undefined {
  const { scope, name } = parseFieldId(id);
  if (name === 'today_day_color' && tile) return t('value.tile_ink');
  const follows = FOLLOWS[name];
  if (follows !== undefined) return t('value.same_as', { label: label(follows) });
  if (scope === 'calendar') {
    switch (name) {
      case 'color':
      case 'text_scale':
        return t('value.follow_card');
      case 'allday_expires_at':
        return t('value.end_of_day');
      // The marker the location row draws while the calendar names no icon of its own.
      case 'location_icon':
        return t('value.map_marker');
      case 'allowlist':
      case 'blocklist':
      case 'replace_pattern':
      case 'replace_with':
        return t('value.none');
      default:
        return undefined;
    }
  }
  switch (name) {
    case 'title_font_size':
    case 'title_color':
      return t('value.theme_default');
    case 'compact_events_to_show':
    case 'compact_days_to_show':
      return t('value.no_limit');
    case 'skip_first_events':
      return t('value.none');
    default:
      return undefined;
  }
}
