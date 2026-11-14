/**
 * Shared leaf renderers for Calendar Card Pro.
 *
 * These functions own content, not layout. Keep whitespace inside `html` templates exact:
 * Lit preserves text-node whitespace and DOM snapshots pin it.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as ColorMix from '../utils/color-mix';
import * as EntityColors from '../utils/entity-colors';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';
import * as Links from '../utils/links';
import * as TextDirection from '../utils/text-direction';
import { splitTitleWords, titleDirection } from '../utils/title-words';
import * as Weather from '../utils/weather';

//-----------------------------------------------------------------------------
// WEATHER LEAVES
//-----------------------------------------------------------------------------

/**
 * Render the weather badge that belongs to a date block.
 *
 * @param date Date the badge describes
 * @param config Card configuration
 * @param weatherForecasts Fetched forecasts, if any
 * @returns Rendered badge, or `nothing`
 */
export function renderDateWeather(
  date: Date,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult | typeof nothing {
  const position = Weather.resolveWeatherPosition(config.weather);
  const showDateWeather = (position === 'date' || position === 'both') && config.weather?.entity;

  if (!showDateWeather || !weatherForecasts?.daily) {
    return nothing;
  }

  const dailyForecast = Weather.findDailyForecast(date, weatherForecasts.daily);

  if (!dailyForecast) {
    return nothing;
  }

  const dateConfig = config.weather?.date || {};
  const showConditions = dateConfig.show_conditions !== false;
  const showHighTemp = dateConfig.show_high_temp !== false;
  const showUvIndex =
    dateConfig.show_uv_index === true &&
    dailyForecast.uv_index !== undefined &&
    dailyForecast.uv_index >= (dateConfig.uv_index_threshold ?? 0);
  const showLowTemp =
    dateConfig.show_low_temp === true && !showUvIndex && dailyForecast.templow !== undefined;

  // Keep the rendered parts adjacent; whitespace here becomes text nodes in column headers.
  // prettier-ignore
  return html`
    <div class="weather">${
      showConditions
        ? html`<ha-icon .icon=${dailyForecast.icon}></ha-icon>`
        : nothing
    }${
      showHighTemp
        ? html`<span class="weather-temp-high">${dailyForecast.temperature}°</span>`
        : nothing
    }${
      showLowTemp
        ? html`<span class="weather-temp-low">/${dailyForecast.templow}°</span>`
        : nothing
    }${
      showUvIndex
        ? html`<span class="weather-uv-index">UV${dailyForecast.uv_index}</span>`
        : nothing
    }</div>
  `;
}

/**
 * Classify a day's start-of-day timestamp as today and/or tomorrow.
 *
 * @param timestamp Start-of-day timestamp for the day
 * @returns Whether the day is today, and whether it is tomorrow
 */
export function classifyDay(timestamp: number): { isToday: boolean; isTomorrow: boolean } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDateString = new Date(timestamp).toDateString();

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  return {
    isToday: dayDateString === todayStart.toDateString(),
    isTomorrow: dayDateString === tomorrowStart.toDateString(),
  };
}

//-----------------------------------------------------------------------------
// DATE LEAVES
//-----------------------------------------------------------------------------

/**
 * Render the shared column-style day header.
 *
 * The class names are the shared day-header classes now, even though they still say
 * `column`. They predate grid view, and renaming them would be a separate mechanical
 * change that should not be bundled with a behavior fix.
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language Language code for translations
 * @param isToday Whether the date is today
 * @param weatherContent Already-rendered weather badge, or `nothing`
 * @param separator Optional rule under the header
 * @param hass Home Assistant instance, whose country decides which days are the weekend,
 *   or its language when no country is set
 * @param id The day's id, given only while the day's events are tap targets or the header is
 *   the day's add button; see `dayLabelId` in `activation.ts`
 * @param dayAdd The header as the day's add button: its name and its day. While it is one,
 *   the id moves from the header to the date inside it, which describes the button and the
 *   day's events alike; on the header it would describe both by the button's name.
 * @returns Rendered shared day header
 */
export function renderSharedDayHeader(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherContent: TemplateResult | typeof nothing = nothing,
  separator?: { width: string; color: string } | null,
  hass?: Types.Hass | null,
  id?: string,
  dayAdd?: { label: string; timestamp: number },
): TemplateResult {
  const todayIndicator = renderTodayIndicator(config, isToday, 'inline');
  const hasInlineIndicator = todayIndicator !== nothing;
  const headerSeparator = separator
    ? html`<div
        class="column-header-separator"
        style=${styleMap({
          borderTopWidth: separator.width,
          borderTopColor: ColorMix.floorColor(separator.color),
          borderTopStyle: 'solid',
        })}
      ></div>`
    : nothing;

  return html`
    <div
      class=${dayAdd ? 'column-day-header day-add-button' : 'column-day-header'}
      id=${dayAdd ? nothing : (id ?? nothing)}
      role=${dayAdd ? 'button' : nothing}
      tabindex=${dayAdd ? '0' : nothing}
      aria-label=${dayAdd ? dayAdd.label : nothing}
      aria-describedby=${dayAdd && id ? id : nothing}
      .calendarCardDayAdd=${dayAdd?.timestamp}
    >
      <div
        class=${classMap({
          'column-date-content': true,
          'with-today-indicator': hasInlineIndicator,
          'with-today-tile': isTileIndicator(config),
        })}
        id=${dayAdd && id ? id : nothing}
      >
        ${todayIndicator}
        ${renderDateContent(date, config, language, isToday, weatherContent, hass)}
      </div>
    </div>
    ${headerSeparator}
  `;
}

/**
 * Render one day's week-number cell.
 *
 * The class name is shared with column view for the same reason as the day-header
 * classes in {@link renderSharedDayHeader}: it was named before grid view reused it.
 *
 * @param weekNumber Week number for this day, or null when unavailable
 * @param visible Whether this column is the one that shows the number
 * @param gridColumn One-based CSS grid column line for the cell
 * @returns Rendered week-number cell
 */
export function renderDayWeekNumber(
  weekNumber: number | null | undefined,
  visible: boolean,
  gridColumn: number,
): TemplateResult {
  return html`
    <div
      class="column-week-number"
      style=${styleMap({
        gridColumn: String(gridColumn),
        gridRow: '1',
        ...(visible ? {} : { visibility: 'hidden' }),
      })}
    >
      <div class="week-number">${weekNumber ?? ''}</div>
    </div>
  `;
}

/**
 * Whether today's indicator is the tile drawn behind the day number itself.
 *
 * The tile is the one style that is not an element of its own: it restyles the day number,
 * so `renderDateContent` draws it and {@link renderTodayIndicator} draws nothing.
 *
 * @param config Card configuration, already resolved for the view
 * @returns `true` when the configured indicator is `tile`
 */
export function isTileIndicator(config: Types.Config): boolean {
  return (
    Boolean(config.today_indicator) &&
    Helpers.getTodayIndicatorType(config.today_indicator) === 'tile'
  );
}

/**
 * Render the contents of a date block: weekday, day number, optional month, and the already-rendered weather badge.
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language Language code for translations
 * @param isToday Whether the date is today
 * @param weatherContent Already-rendered weather badge, or `nothing`
 * @param hass Home Assistant instance, whose country decides which days are the weekend,
 *   or its language when no country is set
 * @returns Rendered date block contents
 */
export function renderDateContent(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherContent: TemplateResult | typeof nothing = nothing,
  hass?: Types.Hass | null,
): TemplateResult {
  const isWeekendDay = FormatUtils.isWeekendDate(date, hass);

  let weekdayColor = config.weekday_color;
  let dayColor = config.day_color;
  let monthColor = config.month_color;

  if (isWeekendDay) {
    weekdayColor = config.weekend_weekday_color || weekdayColor;
    dayColor = config.weekend_day_color || dayColor;
    monthColor = config.weekend_month_color || monthColor;
  }

  const todayTile = isToday && isTileIndicator(config);

  if (isToday) {
    weekdayColor = config.today_weekday_color || weekdayColor;
    // On the tile the digits take a deeper shade of the tile's own color (see
    // `.day.today-tile` in the stylesheet), unless the user named a color for them: today's,
    // or on a weekend the weekend one, which today's falls back to everywhere else too.
    const namedDayColor = config.today_day_color || (isWeekendDay && config.weekend_day_color);
    dayColor = namedDayColor || (todayTile ? 'var(--calendar-card-today-indicator-ink)' : dayColor);
    monthColor = config.today_month_color || monthColor;
  }

  const translations = Localize.getTranslations(language);

  // In the language's own direction where the dashboard runs the other way: an abbreviation
  // ends in punctuation in several languages ("пон.", "ม.ค.", "ג'"), which a line running the
  // other way moves to the word's start.
  const mark = TextDirection.languageMark(language, hass);
  const weekday = TextDirection.inLanguageDirection(translations.daysOfWeek[date.getDay()], mark);
  const day = date.getDate();
  const month = TextDirection.inLanguageDirection(translations.months[date.getMonth()], mark);

  // Prettier 3.9 would put the `${…}` below on lines of its own and re-indent the month
  // template inside it, which moves the whitespace beside its text node and with it the
  // list and column DOM snapshots.
  // prettier-ignore
  return html`
    <div
      class="weekday"
      style=${styleMap({
        'font-size': config.weekday_font_size,
        color: weekdayColor,
      })}
    >
      ${weekday}
    </div>
    <div
      class=${todayTile ? 'day today-tile' : 'day'}
      style=${styleMap({
        'font-size': config.day_font_size,
        color: dayColor,
      })}
    >
      ${day}
    </div>
    ${config.show_month
      ? html`
          <div
            class="month"
            style=${styleMap({
              'font-size': config.month_font_size,
              color: monthColor,
            })}
          >
            ${month}
          </div>
        `
      : nothing}
    ${weatherContent}
  `;
}

//-----------------------------------------------------------------------------
// EVENT LEAVES
//-----------------------------------------------------------------------------
/**
 * A pictographic character: emoji (as a surrogate pair) or a symbol/dingbat.
 *
 * The `\u2000-\u3300` range is deliberately coarse and overlaps several scripts
 * (Hiragana, Katakana, Bopomofo, Hangul Jamo). `PROSE_CHAR` is what vetoes those,
 * so the two constants have to be read together.
 */
const GLYPH_CHAR =
  /[\u2000-\u3300]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/;

/**
 * A character that makes a label prose rather than ornament: any letter, in any
 * script, plus whitespace.
 *
 * This must stay `\p{L}` and not `A-Za-z`. Matching only Latin letters classified
 * every non-Latin label as a glyph -- either when an emoji was joined directly to
 * a word (`🎉Отпуск`), or, because `GLYPH_CHAR` covers kana, for plain Japanese
 * labels with no emoji at all (`やすみ`). Those then got the single-glyph hanging
 * indent below sized for their full width. Digits are excluded on purpose: `①`
 * and other numeric glyphs are ornament, not prose.
 */
const PROSE_CHAR = /[\s\p{L}]/u;

/**
 * Whether a text label is a compact glyph (emoji, symbol) rather than prose.
 */
function isGlyphLabel(label: string): boolean {
  return GLYPH_CHAR.test(label) && !PROSE_CHAR.test(label);
}

/**
 * Render calendar label with support for text, emojis, images, and icons
 *
 * @param label - Label content from entity configuration
 * @param labelIconColor - Optional color for icon labels
 * @param labelType - Shape the entity configuration names, if it names one
 * @param alt - Text alternative for a picture label; `''` marks it as decorative
 * @returns TemplateResult for the appropriate label type
 */
export function renderLabel(
  label: string | undefined,
  labelIconColor?: string,
  labelType?: Helpers.LabelType,
  alt = '',
): TemplateResult | typeof nothing {
  if (!label) return nothing;

  const type = Helpers.resolveLabelType(label, labelType);
  if (type === 'none') return nothing;

  const styleAttr = labelIconColor ? `color: ${labelIconColor};` : nothing;

  if (type === 'icon') {
    return html`<ha-icon icon="${label}" class="label-icon" style=${styleAttr}></ha-icon>`;
  }

  if (type === 'image') {
    return html`<img src="${label}" class="label-image" alt=${alt} />`;
  }

  const glyphClass = isGlyphLabel(label) ? ' label-emoji' : '';
  return html`<span class="calendar-label${glyphClass}">${label}</span>`;
}

/**
 * Render an event title with optional label and weather data
 *
 * `aside` is `time_position: title`'s time row. Given one, the row draws the time after the title
 * in `.title-aside`, after list view's weather badge: at the end of the title's last line, which
 * wraps across the row, or, with `title_max_lines: 1` or `scroll_long_titles`, beside a title
 * kept to its line, where it scrolls with `scroll_long_titles` and otherwise ends in "…". Without
 * one the row is the markup every view drew before the option existed.
 */
function renderEventTitle(
  event: Types.CalendarEventData,
  config: Types.Config,
  entityLabel: string | undefined,
  weatherForecasts?: Types.WeatherForecasts,
  titlePill?: { accent: string; mode: Helpers.AlldayBadgeStyle; inheritsText: boolean },
  mergedLabels?: Types.ResolvedLabel[],
  titleWords = false,
  entityLabelAlt = '',
  aside?: TemplateResult,
): TemplateResult {
  const isEmptyDay = !!event._isEmptyDay;
  const showEmptyDayCheckmark = isEmptyDay && !event._isCustomEmptyText;
  // The title is the one governed field the card colors inline rather than through its
  // custom property, so the sentinel has to be resolved here as well. Resolving it to
  // `undefined` drops the attribute, which hands the question back to `.event-title`'s own
  // `var(--calendar-card-color-event)` — and that is the property the event element has
  // just set to this calendar's accent. Emitting the literal string would work only by
  // accident, through the browser discarding an invalid declaration.
  const configuredTitleColor = event._matchedConfig?.color || config.event_color;
  const entityColor = isEmptyDay
    ? 'var(--calendar-card-empty-day-color)'
    : EntityColors.isAccentTextSentinel(configuredTitleColor)
      ? undefined
      : configuredTitleColor;

  const labelIconColor = event._matchedConfig?.label_icon_color;
  const labelType = event._matchedConfig?.label_type;

  const titleString = showEmptyDayCheckmark ? `✓ ${event.summary}` : event.summary;
  // A title with a time beside it wraps across the row, and the time ends its last line; see
  // `Helpers.titleBesideTimeLayout`. With `title_max_lines: 1` it is kept to one line instead:
  // the time takes the line's end and the title has the rest, cut with "…" where it is too long,
  // as a scrolling title is under reduced motion. Only `scroll_long_titles` moves it.
  const besideLayout = aside !== undefined ? Helpers.titleBesideTimeLayout(config) : undefined;
  const oneLineTitle = Boolean(config.scroll_long_titles) || besideLayout === 'line';
  const titleMoves = Boolean(config.scroll_long_titles);
  // No whitespace inside the word spans, and the spaces between them stay text: joined, the
  // pieces are the title exactly, so its text content does not change.
  //
  // 🚨 The one inline wrapper is what keeps those spaces on screen. `.event-title` is a
  // `-webkit-box`, and with no line clamp in force Chrome lays that out as the legacy
  // flexbox, which drops whitespace between its children: words sitting directly inside it
  // rendered as "Homeoffice" on every unlabeled title. Inside one inline child they are
  // ordinary inline content again. A labeled title hid this, because the label makes the
  // title itself inline.
  //
  // The words take the title's own direction from `.event-title`, below. Inline-blocks
  // are ordered by the direction of the line around them, so on a right-to-left dashboard
  // an English title read "landlord with Call" until something said which way its words
  // run.
  //
  // A run in a script written without spaces gets an inline element of its own. It breaks
  // between characters exactly as bare text does, and the element is what lets the title
  // cut hide it: a cut on the word before such a run has to take the run out too, or the
  // run's text keeps the line going after the ellipsis. See cutGridTitleLines.
  const titleText =
    titleWords && !oneLineTitle
      ? html`<span class="title-words"
          >${splitTitleWords(titleString ?? '').map((segment) =>
            segment.kind === 'word'
              ? html`<span class="title-word">${segment.text}</span>`
              : segment.kind === 'text'
                ? html`<span class="title-run">${segment.text}</span>`
                : segment.text,
          )}</span
        >`
      : titleString;

  // The pill is nested INSIDE `.event-title` rather than replacing it, and that placement is
  // what makes the `neutral` treatment mean the right thing here.
  //
  // `neutral` is defined as `color: inherit`, so what it resolves to is decided entirely by
  // what it is nested in -- and its wash is currentColor at 14% alpha, so the ground follows
  // the ink. In the time row it inherits the time color, which is the whole point of that
  // treatment: the row's own ink in a capsule of itself. Put the pill where `.event-title`'s
  // inline `color` is in scope and it inherits the TITLE color -- `event_color`, or this
  // calendar's own `color` override -- so the treatment keeps its meaning at both positions
  // without either needing a rule of its own.
  //
  // Nesting is also the only arrangement that works at all. `.event-title` carries its color
  // as an inline style, and an inline style beats any class selector -- so putting the pill
  // classes ON that element would let the inline color override `--badge-ink` and every
  // treatment but the text source would silently render in the title color.
  //
  // 🚨 The text source publishes the title's color as `--badge-source` rather than letting
  // the stylesheet read `currentColor`, and that is not redundant with inheriting it. The
  // pill's own `color` is what the treatments SET, so a `currentColor` inside any other
  // property reads the color the treatment just wrote instead of the one the row had.
  // Three treatments get away with it because they set `color` to the inherited value
  // anyway; `filled` deliberately does not, and its ground would come out as its own ink.
  // A token settled before the treatment runs has no such ordering.
  const pillClass = titlePill
    ? `allday-title-pill allday-pill-${titlePill.mode}` +
      (titlePill.inheritsText ? ' allday-source-text' : '')
    : '';
  const pillStyle = titlePill
    ? `--calendar-card-event-accent: ${titlePill.accent};` +
      (titlePill.inheritsText ? ` --badge-source: ${entityColor};` : '')
    : '';

  // prettier-ignore
  const titleContent = titlePill
    ? html`<span
        class=${pillClass}
        style=${pillStyle}
        >${titleText}</span
      >`
    : titleText;

  // A merged row answers for every calendar that contributed a copy, so it draws each of
  // their labels, in `entities` order, with nothing inserted between them — the 4px gap is
  // the inline-end margin every label kind already carries. The branch is behavioral rather
  // than defensive: `mergedLabels` is undefined unless there are two labels to draw, so a
  // merge whose winner carries none renders as it always has.
  const labels = mergedLabels
    ? mergedLabels.map((entry) => renderLabel(entry.value, entry.iconColor, entry.type, entry.alt))
    : entityLabel
      ? renderLabel(entityLabel, labelIconColor, labelType, entityLabelAlt)
      : nothing;
  // Asked of what renders rather than of the configuration: a label whose type resolves to
  // `none` draws nothing, and its title takes the unlabeled markup below.
  const hasLabel = Array.isArray(labels)
    ? labels.some((label) => label !== nothing)
    : labels !== nothing;

  // `scroll_long_titles` forces the title onto a single line so it can scroll horizontally
  // when it overflows. That mode and `title_max_lines` are mutually exclusive by nature —
  // you cannot scroll one line horizontally and wrap it to N lines at once — so scrolling
  // wins: the extra classes here switch `.event-title` from the wrapping/-webkit-box clamp
  // (see the note on --calendar-card-title-display in styles.ts) to a single-line clip, and
  // whatever `title_max_lines` is set to is ignored for that event. When the option is off,
  // both branches below are byte-identical to the historical markup so no snapshot moves.
  //
  // The text is wrapped in `.event-title-scroll` only when the title can move: `.event-title`
  // is the fixed-width clip viewport and the inner span is the full-width element the
  // measurement step (in calendar-card-pro.ts) animates once it confirms real overflow. A title
  // kept to one line beside the time without `scroll_long_titles` has the viewport and no inner
  // span, so nothing in it can move and its ellipsis is all it ever shows. The span is inline
  // while still, so its absence draws the same title.
  const titleInner = titleMoves
    ? html`<span class="event-title-scroll">${titleContent}</span>`
    : titleContent;

  const titleClass = `event-title ${isEmptyDay ? 'empty-day-title' : ''}${
    oneLineTitle ? ' title-scrollable' : ''
  }`;
  const titleStyle = entityColor === undefined ? nothing : `color: ${entityColor}`;

  // 🚨 On `.event-title`, not on `.title-words` inside it, and never on both. A grid title
  // cut to one line ends where its *block* ends, so a title running against the dashboard
  // (Hebrew on an English one, English on a Hebrew one) lost its beginning: Chromium showed
  // "… הצוות", the end of the title, and WebKit, measuring the first letter at zero width,
  // blanked it. Giving the block the title's direction moves the cut to the title's own
  // end. It has to move rather than be copied, because `dir="auto"` skips any descendant
  // carrying a `dir` of its own: with both set the outer element finds no letters, resolves
  // to left-to-right, and blanks Hebrew on a Hebrew dashboard instead. Alignment stays on
  // the dashboard's side; see the matching rule in styles.ts.
  //
  // A title kept to one line takes its own direction as well, for the same reason: the crop and
  // the ellipsis fall at the end of the box's direction, so on a right-to-left dashboard an
  // English title showed its last words, and a Hebrew title on an English one its end. Named
  // by the card, as the capped title's line below is, rather than `auto`: `auto` reads a title
  // with no letter in it, a time or an emoji, as left-to-right, where this leaves it the
  // dashboard's. The empty-day line is left as it was.
  const titleDir = oneLineTitle
    ? isEmptyDay
      ? nothing
      : (titleDirection(event.summary ?? '') ?? nothing)
    : titleWords
      ? 'auto'
      : nothing;

  // A list or column title cut by `title_max_lines` lays out its whole line, labels included,
  // in its own direction. The clamp puts its "…" at the end of the line in the direction of
  // the box it clamps, so a title running against the dashboard (English on a Hebrew one,
  // Hebrew on an English one) ended in "…" at its own start and lost its first letters, in
  // Chromium, WebKit and Firefox alike, at one line and at three. Only the whole line's
  // direction moves the "…": the title's own, through `dir="auto"` as grid has it, does not
  // once a label shares the line. So the label leads the title in the title's own reading
  // order on such a line, and the stylesheet keeps the line on the dashboard's side.
  // Unclamped titles, the empty-day line and grid, which cuts its titles itself, are left as
  // they were; so is the dir attribute on a title in the dashboard's direction, which moves
  // nothing. A title beside the time cut at a limit of two or more takes it as well, and the
  // stylesheet keeps the time on the dashboard's side of it.
  const summaryDir =
    !titleWords && !oneLineTitle && !isEmptyDay && config.title_max_lines > 0
      ? (titleDirection(event.summary ?? '') ?? nothing)
      : nothing;

  // 🚨 No whitespace between the last label and the title, and none inside the title before
  // its text, wherever a label is drawn. Lit keeps both as text nodes, and inline layout
  // collapses them into one visible word space after the label: about 3px on top of the
  // label's own 4px margin, so the title sat 7px from a picture or icon while the time sat
  // 4px from its clock. The list and column hanging indent budgets the label plus exactly
  // that 4px, so the same space also left every wrapped line 3px short of the first glyph.
  //
  // An unlabeled title keeps the historical shape, byte for byte. Nothing sits before it,
  // so its leading space starts a line and collapses to nothing, and the list and column
  // DOM snapshots pin the whitespace inside the title as text.
  //
  // The directive guards that second branch. Without it Prettier folds the template onto
  // one line, turning its whitespace into single spaces that the snapshots then disagree
  // with; delete it, run npm run format and then npm test to see it.
  // prettier-ignore
  const title = hasLabel
    ? html`${labels}<span class=${titleClass} style=${titleStyle} dir=${titleDir}>${titleInner}</span>`
    : html`<span
          class=${titleClass}
          style=${titleStyle}
          dir=${titleDir}
        >
          ${titleInner}
        </span>`;

  // The title line of `time_position: title` kept to one line: the title, then the badge and the
  // time together in `.title-aside`, which the stylesheet caps so the title keeps the rest. No
  // directive here: every element in this template is a flex container, which draws none of the
  // whitespace between its children, so Prettier may lay the template out as it likes.
  if (aside && oneLineTitle) {
    return html`
      <div class="summary-row">
        <div class="summary summary-scroll">${title}</div>
        <div class="title-aside">
          ${renderEventWeather(event, config, weatherForecasts)}${aside}
        </div>
      </div>
    `;
  }

  // A wrapping title beside the time: the title wraps across the row, and `.title-room`, an empty
  // float the size of the time, ends its text, on its last line where it fits there and on a line
  // of its own where it does not. The badge and the time are placed over it, from `.title-aside`
  // beside `.summary`, so their sizes are measured against the card's text as they are on one
  // line, rather than against the title's. The card measures the time and sizes the room to it;
  // see `TitleFit.fitTitlesBesideTime`. `title-capped` marks a `title_max_lines` of two or more,
  // which the card cuts the same way. Nothing between the title and the room: a space there is
  // text on the title's last line. `.title-strut` opens the time's box with a word joiner at the
  // title's size, which puts the box's baseline where the title's is and lets the card measure
  // whether the time moved it.
  // prettier-ignore
  if (aside) {
    return html`
      <div class="summary-row title-wrap${besideLayout === 'cap' ? ' title-capped' : ''}">
        <div class="summary" dir=${summaryDir}>${title}<span class="title-room"></span></div>
        <div class="title-aside">
          <span class="title-strut" aria-hidden="true">\u2060</span>${renderEventWeather(event, config, weatherForecasts)}${aside}
        </div>
      </div>
    `;
  }

  // Prettier pulls `${title}` up beside the tags around it, and the list and column DOM
  // snapshots record the whitespace that separates the summary from its title. The same
  // experiment as above shows it.
  // prettier-ignore
  return html`
    <div class="summary-row">
      <div class="summary${oneLineTitle ? ' summary-scroll' : ''}" dir=${summaryDir}>
        ${title}
      </div>
      ${renderEventWeather(event, config, weatherForecasts)}
    </div>
  `;
}

/**
 * Whether the card is configured to show a weather badge on individual events.
 */
function hasEventWeather(config: Types.Config): boolean {
  const position = Weather.resolveWeatherPosition(config.weather);
  return !!(config.weather?.entity && (position === 'event' || position === 'both'));
}

/**
 * Render weather information for an event
 *
 * @param event Event the badge describes
 * @param config Card configuration
 * @param weatherForecasts Fetched forecasts, if any
 * @param placement Where the badge is being placed. `'title'` is the list view's inline
 *   badge inside the summary row; `'row'` is column view's dedicated line, which always
 *   shows the icon and localizes the condition text.
 * @param hass Home Assistant instance, used only to localize the condition text
 * @returns Rendered badge, or an empty template when there is nothing to show
 */
export function renderEventWeather(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
  placement: 'title' | 'row' = 'title',
  hass?: Types.Hass | null,
): TemplateResult {
  const content = eventWeatherContent(event, config, weatherForecasts, placement, hass);
  if (!content) return html``;
  const { forecast, showIcon, showTemp, showUvIndex, conditionText } = content;

  // prettier-ignore
  return html`
    <div class="event-weather">${
      showIcon ? html`<ha-icon .icon=${forecast.icon}></ha-icon>` : nothing
    }<span class="event-weather-text">${
      showTemp
        ? html`<span>${forecast.temperature}°</span>`
        : nothing
    }${
      showUvIndex
        ? html`<span class="weather-uv-index">UV${forecast.uv_index}</span>`
        : nothing
    }${
      conditionText
        ? html`<span class="weather-condition">${conditionText}</span>`
        : nothing
    }</span></div>
  `;
}

/** Resolve shared weather content for the badge and Grid's unclipped accessible event name. */
export function eventWeatherContent(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
  placement: 'title' | 'row' = 'title',
  hass?: Types.Hass | null,
) {
  const showEventWeather = hasEventWeather(config);

  if (!showEventWeather || !weatherForecasts?.hourly) {
    return null;
  }

  if (event.end?.dateTime) {
    const now = new Date();
    const eventEndTime = new Date(event.end.dateTime);

    if (eventEndTime < now) {
      return null;
    }
  }

  const eventConfig = config.weather?.event || {};

  const forecast = Weather.findForecastForEvent(
    event,
    weatherForecasts.hourly,
    weatherForecasts.daily,
    eventConfig.daily_forecast_fallback !== false,
  );

  if (!forecast) {
    return null;
  }

  const showConditions = eventConfig.show_conditions !== false;
  const showTemp = eventConfig.show_temp !== false;
  const showUvIndex =
    eventConfig.show_uv_index === true &&
    forecast.uv_index !== undefined &&
    forecast.uv_index >= (eventConfig.uv_index_threshold ?? 0);

  const ownRow = placement === 'row';
  const showIcon = ownRow || showConditions;
  const conditionText =
    ownRow && showConditions
      ? Weather.formatCondition(hass, config.weather?.entity, forecast.condition, config.language)
      : undefined;

  return { forecast, showIcon, showTemp, showUvIndex, conditionText };
}

/**
 * Locals that `renderEventContent` needs but must not recompute.
 */
export interface EventContentParts {
  eventTime: string;

  /**
   * The droppable trailing end time of `eventTime`, straight from
   * `FormatUtils.EventTimeParts.end` — see there for which shapes have one and why.
   * Rendered as its own element only where a view asks for it via `splitTimeEnd`.
   */
  eventTimeEnd?: string;

  /**
   * The all-day label to draw as its own badge, present only when `allday_badge` names a
   * treatment and the event is all-day. When set, `eventTime` holds only what follows the
   * label, which is empty for a single-day all-day event.
   *
   * Carries its own `lang` because the badge uppercases in CSS, and only a declared language
   * gets that right — Greek must lose its tonos in capitals.
   *
   * Carries its own `accent` because the badge's accent is not always the calendar's: a
   * custom `allday_badge_color` stands in for it. The row does hand the calendar's color down,
   * as `--calendar-card-event-accent-bar-color` for its accent bar, but that would be the
   * wrong color then. The badge republishes its own as a custom property on itself and the
   * stylesheet derives every color from it, so the derivation stays themeable and no event
   * that has no badge pays for the property.
   *
   * `inheritsText` is `allday_badge_color: text` — the one source whose color this side of
   * the render cannot name, because it differs per position. A custom color needs no flag:
   * it arrives as `accent` and is indistinguishable from one by the time it gets here.
   */
  allDayBadge?: {
    label: string;
    lang: string;
    accent: string;
    mode: Helpers.AlldayBadgeStyle;
    inheritsText: boolean;
  };

  /**
   * The pill to draw around the event title, present only when `allday_badge` names the
   * title position and the event is all-day.
   *
   * Carries no label: the pill wraps the title the row was going to draw anyway, so unlike
   * the time-row badge there is no text to hand it and no language to declare — the title is
   * the user's own words and is never uppercased.
   *
   * Carries its own `accent` for the same reason the time badge does: a custom
   * `allday_badge_color` stands in for the calendar's color, which the row hands its bar.
   */
  titlePill?: {
    accent: string;
    mode: Helpers.AlldayBadgeStyle;
    inheritsText: boolean;
  };

  eventLocation: string;

  /**
   * Icon for the location row: this calendar's `location_icon`, the Teams icon where the
   * location names a Teams meeting, or the default marker.
   *
   * Resolved by the container rather than here, so both views draw one answer — and so
   * that `renderEventContent` stays free of per-calendar config reads.
   */
  locationIcon: string;

  eventDescription: string;

  /**
   * The label drawn before the event title: this calendar's own, or the icon Home Assistant
   * holds for it where the label defers to Home Assistant.
   *
   * Resolved by the container for the same reason as `locationIcon` above — one answer for
   * both views, and no per-calendar config reads down here — and for one more that is
   * specific to it: substituting the icon needs `hass`, which the list view does not pass
   * into `renderEventContent` at all.
   */
  entityLabel: string | undefined;

  /**
   * Text alternative for `entityLabel` when it draws as a picture: the person's name for a
   * `person.…` label, `''` for any other picture. See `resolveLabelAlt`.
   */
  entityLabelAlt?: string;

  /**
   * One label per calendar that contributed a copy of a merged duplicate, present only on
   * a row `filter_duplicates` collapsed across two or more calendars that each carry one.
   *
   * 🚨 Kept beside `entityLabel` rather than replacing it, and **not** because an iterable
   * binding would disturb the DOM. That was the original justification here and it is
   * false: routing every single-label row through a one-element list was measured to leave
   * the whole unit suite green, snapshots included. What `undefined` buys is behavioral.
   * It is how a row says "no merge to draw", which sends it down the branch below and
   * leaves a merge involving an unlabeled winner rendering exactly as it does today,
   * rather than promoting the label of a calendar that lost.
   */
  mergedLabels?: Types.ResolvedLabel[];

  shouldShowTime: boolean;

  countdownStr: string | null;

  /**
   * "Day 2 of 3", the progress bar's form on an event a day or more long, drawn in the
   * countdown's place wherever the row has no countdown, and exactly as the countdown is, in
   * every placement it has. Absent everywhere the card draws no counter, grid included.
   */
  dayCounter?: string | null;

  progressPercentage: number | null;

  /**
   * The localized "Now" drawn before the time of an event that is under way, or `null`.
   *
   * Set by `buildEventPresentation` from `show_now_indicator`; grid clears it in
   * `gridTimedEventContentParts`, because its now line already says the same thing.
   */
  nowLabel?: string | null;

  /**
   * The mark the row's own words are drawn between: its time and its countdown, where the card's
   * language runs against the dashboard. `''` or absent everywhere else, which draws them as they
   * always were. See `TextDirection.languageMark`.
   */
  languageMark?: TextDirection.LanguageMark;
}

/**
 * Per-view choices `renderEventContent` cannot derive for itself.
 */
export interface EventContentOptions {
  weatherForecasts?: Types.WeatherForecasts;
  /**
   * Where the event weather badge goes. `'title'` uses the summary row; `'row'`
   * gives the badge its own row beneath the time.
   */
  weatherPlacement?: 'title' | 'row';
  /**
   * Where the progress bar goes. `'inline'` keeps it on the time row; `'row'`
   * gives it a dedicated row.
   */
  progressPlacement?: 'inline' | 'row';
  /**
   * Where the countdown goes. `'trailing'` keeps it at the end of the time row;
   * `'text'` folds it into the time text.
   */
  countdownPlacement?: 'trailing' | 'text';
  /**
   * Home Assistant instance, used only to localize the condition text the own-row weather placement can carry. Absent for the title placement, which has no words.
   */
  hass?: Types.Hass | null;
  /**
   * Whether the droppable end time is drawn as its own element rather than as part of one
   * text node. Grid only, and not a styling preference: the grid measures this row and
   * degrades it, and CSS cannot hide half of a text node.
   *
   * The two views that leave it off get byte-identical markup to before, which is the
   * point — a list row has no bottom edge standing in for the end time, so there the end
   * is not droppable and the element would be dead weight.
   */
  splitTimeEnd?: boolean;
  /**
   * Draw each word of the title as its own element, so the title wraps only at spaces and a
   * word too wide for the block is cut with an ellipsis instead of broken. Grid sets this for
   * its timed blocks, which can be narrower than one word; list and column rows are never
   * that narrow, so their markup stays a single text node. Ignored while
   * `scroll_long_titles` is on, because a scrolling title is one line that moves rather
   * than wraps. See `splitTitleWords`.
   */
  titleWords?: boolean;
  /**
   * Draw the web addresses in the location and the description as links (`open_links`). List
   * and column set it from `rowLinksOn`; grid never does, because its blocks draw their words
   * for the eye only. Rows holding no link draw their text exactly as they do without it.
   */
  links?: boolean;
  /**
   * Where the time row goes (`time_position`): `'below'` under the title, which is the markup
   * every view drew before the option existed, or `'title'` at the end of the title's line, on a
   * row with a time or a countdown, where it stays at any width. In that mode the countdown folds
   * into the time text and the progress bar takes a row of its own, whatever the two placements
   * above ask for. List and column pass their resolved value; grid never does, because its blocks
   * fit their own rows, and this function never reads the option from `config`.
   */
  timePosition?: Helpers.TimePosition;
}

/**
 * Text and links for a location or a description: each link a real `<a>` through Lit
 * bindings, so no event text becomes markup, opening in a new tab with no opener and no
 * referrer. The words stay exactly as the row shows them.
 *
 * @param pieces - The row's text as pieces
 * @returns The pieces, drawn
 */
function renderLinkedText(pieces: ReadonlyArray<Links.TextPiece>): unknown[] {
  return pieces.map((piece) =>
    'href' in piece
      ? html`<a class="event-link" href=${piece.href} target="_blank" rel="noopener noreferrer"
          >${piece.text}</a
        >`
      : piece.text,
  );
}

/**
 * Render the body of a single event: title row, time, location and description.
 *
 * @param event Event to render
 * @param config Card configuration
 * @param parts Pre-computed locals from the container - see `EventContentParts`
 * @param options Per-view placement choices - see `EventContentOptions`
 * @returns Rendered event body
 */
export function renderEventContent(
  event: Types.CalendarEventData,
  config: Types.Config,
  parts: EventContentParts,
  options: EventContentOptions = {},
): TemplateResult {
  const {
    weatherForecasts,
    weatherPlacement = 'title',
    progressPlacement: requestedProgressPlacement = 'inline',
    countdownPlacement: requestedCountdownPlacement = 'trailing',
    hass,
    splitTimeEnd = false,
    titleWords = false,
    links = false,
    timePosition = 'below',
  } = options;
  // Beside the title nothing trails the time: the countdown folds into its text and the bar
  // takes a row of its own, in list view as column view always draws them.
  const besideTitle = timePosition === 'title';
  const progressPlacement = besideTitle ? 'row' : requestedProgressPlacement;
  const countdownPlacement = besideTitle ? 'text' : requestedCountdownPlacement;
  const {
    eventTime,
    eventTimeEnd,
    allDayBadge,
    titlePill,
    eventLocation,
    locationIcon,
    eventDescription,
    shouldShowTime,
    countdownStr: countdownOnly,
    dayCounter = null,
    progressPercentage,
    entityLabel,
    entityLabelAlt,
    mergedLabels,
    nowLabel,
    languageMark = '',
  } = parts;

  // The row's own words, in their language's direction where the dashboard runs the other way.
  const own = (text: string): string => TextDirection.inLanguageDirection(text, languageMark);

  // The day counter takes the countdown's place where the row has none, so from here on it is
  // the countdown, and every placement below draws it as one. Its own class is what tells the
  // two apart, for a theme.
  const countdownStr = countdownOnly ?? dayCounter;
  const countdownClass =
    countdownOnly === null && dayCounter !== null ? 'time-countdown day-counter' : 'time-countdown';

  // Pieces only where a field holds a link, so every other row binds its plain string as before.
  const linked = links
    ? Links.rowLinks({ location: eventLocation, description: eventDescription }, event._source)
    : undefined;
  const locationText = linked?.location ? renderLinkedText(linked.location) : eventLocation;
  const descriptionText = linked?.description
    ? renderLinkedText(linked.description)
    : eventDescription;

  const hasProgressBar = progressPercentage !== null && config.show_progress_bar;
  const showInlineProgress = hasProgressBar && progressPlacement === 'inline';

  const progressRow =
    hasProgressBar && progressPlacement === 'row'
      ? html`
          <div class="progress-bar progress-bar-row">
            <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
          </div>
        `
      : nothing;

  const titleForecasts = weatherPlacement === 'title' ? weatherForecasts : undefined;

  const weatherRow =
    weatherPlacement === 'row' && hasEventWeather(config)
      ? renderEventWeather(event, config, weatherForecasts, 'row', hass)
      : nothing;

  const foldCountdown = countdownPlacement === 'text' && countdownStr !== null;

  // Drawn rather than compared from here on, so marked once for every placement below.
  const countdownText = countdownStr === null ? null : own(countdownStr);

  const trailingCountdown = foldCountdown ? null : countdownText;

  // A single-day all-day event has nothing left to say once the badge has the label, so
  // there is no empty span to lay out beside it.
  //
  // `endsWith` here is a guard rather than a parse. `eventTimeEnd` was built as a suffix by
  // the same formatter that built the string, so there is no separator to find and no
  // locale assumption; the only thing that can come between them is `joinEventTimeParts`
  // capitalizing index 0, which a droppable end never reaches because a start time is
  // always in front of it. Should the two ever disagree the row falls back to one text
  // node, which is what every view drew before the split existed.
  const splitEnd =
    splitTimeEnd && eventTimeEnd && eventTime.endsWith(eventTimeEnd) && eventTime !== eventTimeEnd
      ? eventTimeEnd
      : null;

  // The text before a droppable end, which the end's own layout depends on (see below).
  const timeHead = splitEnd ? eventTime.slice(0, -splitEnd.length) : eventTime;

  // No whitespace inside the split: a text node between the two spans would put a second
  // space in the middle of "10:00 - 12:00".
  //
  // The directive is documentation here rather than a guard, and that was measured rather
  // than assumed: deleting it, running `npm run format` and running the suite leaves every
  // test green. Prettier does reformat this line, but it breaks INSIDE the tag -- `<span\n
  // >` -- so no text node appears and the DOM is identical. What it buys is that the source
  // reads as the single line the browser sees, instead of the `>`-on-its-own-line form that
  // is exactly what the two lines above are warning about.
  //
  // Each piece goes through `isolateClockReadings`, so a 12-hour reading reads as one unit in a
  // right-to-left card. The end is handed the text before it, because how each reading
  // is laid out depends on the letter that precedes it. Then `own`, so a card whose language
  // runs against the dashboard reads start first; each piece is marked on its own, so the end
  // the grid hides leaves a whole start behind.
  // prettier-ignore
  const timeValue = eventTime
    ? splitEnd
      ? html`<span>${own(FormatUtils.isolateClockReadings(timeHead))}<span class="time-end">${own(FormatUtils.isolateClockReadings(splitEnd, timeHead))}</span></span>`
      : html`<span>${own(FormatUtils.isolateClockReadings(eventTime))}</span>`
    : nothing;

  // The badge is a direct child of `.time-actual`, never of `.time-text`: inside the latter
  // it would match the `time_max_lines` clamp selector and be truncated like body text.
  //
  // No whitespace between the badge and what follows it. Today that is belt and braces
  // rather than the fix it looks like: `.time-actual` is a flex row, and flex drops a
  // whitespace-only text node between two items, so the space this used to carry was never
  // rendering. The real double gap was two margins — the badge's own and the countdown's
  // lead-in — and the stylesheet drops the second when it follows a badge. Written tightly
  // anyway so the markup does not quietly depend on the container staying a flex row.
  // `--calendar-card-color-time` is the property `.time` sets its own color from, so naming
  // it here hands the pill exactly the color it is sitting in -- the shipped gray, or the
  // user's `time_color`. See the note at the title pill for why this is published as a token
  // rather than read as `currentColor`: a treatment that sets `color` would otherwise be
  // read back by its own ground.
  const allDayBadgeEl = allDayBadge
    ? // prettier-ignore
      html`<span
        class=${'allday-badge allday-pill-' + allDayBadge.mode + (allDayBadge.inheritsText ? ' allday-source-text' : '')}
        lang=${allDayBadge.lang}
        style=${`--calendar-card-event-accent: ${allDayBadge.accent};` + (allDayBadge.inheritsText ? ' --badge-source: var(--calendar-card-color-time);' : '')}
        >${allDayBadge.label}</span
      >`
    : nothing;

  // Keep folded time/countdown spans adjacent; whitespace would render before the separator.
  // prettier-ignore
  const timeText = foldCountdown
    ? html`<span class="time-text">${timeValue}<span class=${countdownClass}>${countdownText}</span></span>`
    : timeValue;

  // A running event's row keeps its clock where every row has it, filled rather than outlined,
  // and reads "Now · 22:30 - 23:59" after it as one run of inline text, so it wraps as a
  // sentence on a narrow card instead of squeezing the time beside a label that holds its
  // width. Composed into the time's own binding, so a row that is not under way renders
  // exactly the markup it always did. No whitespace inside: the spacing is the stylesheet's.
  // prettier-ignore
  const timeContent = nowLabel
    ? html`<span class="now-time"><span class="now-indicator">${nowLabel}</span>${timeText}</span>`
    : timeText;

  // `time_position: title`, on a row with a time or a countdown to put beside the title. Every
  // other row, an empty day's included, keeps the template below, with the placements above.
  // The title-line markup is a function of its own, after this one, so the template below stays
  // the markup every view drew before the option existed.
  if (besideTitle && (shouldShowTime || countdownStr)) {
    return renderTimeBesideTitle({
      title: (aside) =>
        renderEventTitle(
          event,
          config,
          entityLabel,
          titleForecasts,
          titlePill,
          mergedLabels,
          titleWords,
          entityLabelAlt,
          aside,
        ),
      shouldShowTime,
      allDayBadgeEl,
      timeContent,
      countdownStr: countdownText,
      countdownClass,
      progressRow,
      weatherRow,
      eventLocation,
      locationIcon,
      locationText,
      eventDescription,
      descriptionText,
    });
  }

  // Prettier 3.9 would put each multi-line `${…}` below on lines of its own, which breaks
  // the source-shape guard on the `: ''` idiom here ("preserves no-output idioms at
  // extraction seams" in tests/list-dom.test.ts).
  // prettier-ignore
  return html`
    <div class="event-content">
      ${renderEventTitle(event, config, entityLabel, titleForecasts, titlePill, mergedLabels, titleWords, entityLabelAlt)}
      <div class="time-location">
        ${progressRow}
        ${shouldShowTime
          ? html`
              <div class="time">
                <div class="time-actual">
                  <ha-icon icon=${nowLabel ? 'mdi:clock' : 'mdi:clock-outline'}></ha-icon>
                  ${allDayBadgeEl}${timeContent}
                </div>
                ${trailingCountdown
                  ? html`<div class=${countdownClass}>${trailingCountdown}</div>`
                  : showInlineProgress
                    ? html`
                        <div class="progress-bar">
                          <div
                            class="progress-bar-filled"
                            style="width: ${progressPercentage}%"
                          ></div>
                        </div>
                      `
                    : nothing}
              </div>
            `
          : // No text placement here: with `show_time: false` there is no time text to
            // fold the countdown into, so it always renders on its own.
            countdownStr
            ? html`
                <div class="time">
                  <div class="time-actual"></div>
                  <div class=${countdownClass}>${countdownText}</div>
                </div>
              `
            : showInlineProgress
              ? html`
                  <div class="time">
                    <div class="time-actual"></div>
                    <div class="progress-bar">
                      <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
                    </div>
                  </div>
                `
              : nothing}
        ${weatherRow}
        ${eventLocation
          ? html`
              <div class="location">
                <ha-icon icon="${locationIcon}"></ha-icon>
                <span>${locationText}</span>
              </div>
            `
          : ''}
        ${eventDescription
          ? html`
              <div class="description">
                <ha-icon icon="mdi:information-outline"></ha-icon>
                <span>${descriptionText}</span>
              </div>
            `
          : ''}
      </div>
    </div>
  `;
}

/**
 * What `renderTimeBesideTitle` lays out, computed once by `renderEventContent` so that neither
 * function derives a piece of the row the other already has.
 */
interface TimeBesideTitlePieces {
  /** The title line, drawn with the given time row after the title. */
  title: (aside: TemplateResult) => TemplateResult;
  shouldShowTime: boolean;
  allDayBadgeEl: TemplateResult | typeof nothing;
  timeContent: TemplateResult | typeof nothing;
  countdownStr: string | null;
  countdownClass: string;
  progressRow: TemplateResult | typeof nothing;
  weatherRow: TemplateResult | typeof nothing;
  eventLocation: string;
  locationIcon: string;
  locationText: unknown;
  eventDescription: string;
  descriptionText: unknown;
}

/**
 * An event body with its time at the end of the title's line (`time_position: title`).
 *
 * The time keeps the classes and rules it has below the title, so its "Now" run, an all-day
 * badge, a clamp and the folded countdown look as they do there. It drops its clock, since the
 * title already leads the line, and anything that would trail it: the countdown is folded into
 * the time text and the progress bar is the row of its own `renderEventContent` passes here,
 * in list view as in column view. With times off, the countdown alone takes the time's place.
 *
 * The title wraps across the row by default, and the time ends its last line where it fits and
 * takes a line of its own, at the end, where it does not; `title_max_lines` of two or more cuts
 * a longer title on its last line, with the time at the end of that line. With
 * `title_max_lines: 1` or `scroll_long_titles` the title is one line instead: the time takes
 * what it needs, normally up to a cap the stylesheet sets, and the title has the rest of the
 * line, scrolling there with `scroll_long_titles` and otherwise ending in "…". Everything else
 * stays below in its usual order: the progress row, column view's weather row, the location
 * and the description. tests/time-position.test.ts holds those, and the title, to the markup
 * the card draws without the option.
 *
 * `time-beside-title` on `.event-content` is what the stylesheet keys on; see the block of rules
 * under that name.
 *
 * @param pieces - The row's parts, as `renderEventContent` computed them
 * @returns Rendered event body
 */
function renderTimeBesideTitle(pieces: TimeBesideTitlePieces): TemplateResult {
  const { shouldShowTime, allDayBadgeEl, timeContent, countdownStr, countdownClass } = pieces;

  const timeRow = shouldShowTime
    ? html`<div class="time"><div class="time-actual">${allDayBadgeEl}${timeContent}</div></div>`
    : html`<div class="time"><div class=${countdownClass}>${countdownStr}</div></div>`;

  return html`
    <div class="event-content time-beside-title">
      ${pieces.title(timeRow)}
      <div class="time-location">
        ${pieces.progressRow} ${pieces.weatherRow}
        ${
          pieces.eventLocation
            ? html`<div class="location">
                <ha-icon icon="${pieces.locationIcon}"></ha-icon>
                <span>${pieces.locationText}</span>
              </div>`
            : nothing
        }
        ${
          pieces.eventDescription
            ? html`<div class="description">
                <ha-icon icon="mdi:information-outline"></ha-icon>
                <span>${pieces.descriptionText}</span>
              </div>`
            : nothing
        }
      </div>
    </div>
  `;
}

/**
 * The accent bar beside an event, in every view that draws one.
 *
 * An element of its own rather than a border on the event, because a border can neither have
 * rounded ends nor sit inside the event's tinted box. It carries no color: the event element
 * writes `--calendar-card-event-accent-bar-color`, and the stylesheet places and paints the
 * bar (see `.event-accent-bar`). Grid all-day banners and the `+N` block draw none.
 *
 * @returns The bar
 */
export function renderAccentBar(): TemplateResult {
  return html`<span class="event-accent-bar"></span>`;
}

//-----------------------------------------------------------------------------
// TODAY-INDICATOR LEAVES
//-----------------------------------------------------------------------------

/**
 * Parse position from CSS-like syntax (e.g., "10% 50%") and convert to absolute positioning styles with centering transform
 *
 * The first value is measured from the inline start, so the indicator mirrors in a
 * right-to-left card, and the translation that centers it on that point reads its horizontal
 * half from `--calendar-card-today-indicator-shift`, which the stylesheet turns around there.
 * Unset, as in every left-to-right card, it is the -50% this always was.
 *
 * @param position Position in CSS-like syntax ("x y" format)
 * @returns Style object with positioning properties
 */
function parseIndicatorPosition(position: string): Record<string, string> {
  const positionStyles: Record<string, string> = {
    position: 'absolute',
    transform: 'translate(var(--calendar-card-today-indicator-shift, -50%), -50%)',
  };

  const parts = position.trim().split(/\s+/);

  if (parts.length >= 1) {
    positionStyles['inset-inline-start'] = parts[0];
  }

  if (parts.length >= 2) {
    positionStyles.top = parts[1];
  } else {
    positionStyles.top = '50%';
  }

  return positionStyles;
}

/**
 * Render the today indicator based on configuration
 *
 * @param config Calendar card configuration
 * @param isToday Whether the current day is today
 * @param layout Placement strategy — `absolute` positions by percentage from
 *   `today_indicator_position` (list view), `inline` ignores that option and lets the
 *   indicator flow inside the column-view day header.
 * @returns TemplateResult or nothing
 */
export function renderTodayIndicator(
  config: Types.Config,
  isToday: boolean,
  layout: 'absolute' | 'inline' = 'absolute',
): TemplateResult | typeof nothing {
  if (!config.today_indicator || !isToday) {
    return nothing;
  }

  const indicatorValue = config.today_indicator;
  const indicatorType = Helpers.getTodayIndicatorType(indicatorValue);

  // The tile is drawn on the day number itself, by `renderDateContent`.
  if (indicatorType === 'none' || indicatorType === 'tile') {
    return nothing;
  }

  const positionStyles =
    layout === 'inline' ? {} : parseIndicatorPosition(config.today_indicator_position);

  return html`
    <div class="today-indicator-container${layout === 'inline' ? ' inline' : ''}">
      ${renderIndicatorByType(indicatorType, indicatorValue, positionStyles)}
    </div>
  `;
}

/**
 * Render specific indicator based on type
 */
function renderIndicatorByType(
  type: string,
  value: string | boolean,
  positionStyles: Record<string, string>,
): TemplateResult | typeof nothing {
  let icon = '';

  switch (type) {
    case 'dot':
      icon = 'mdi:circle';
      break;
    case 'pulse':
      icon = 'mdi:circle';
      break;
    case 'glow':
      icon = 'mdi:circle';
      break;
    case 'mdi':
      icon = typeof value === 'string' ? value : 'mdi:circle';
      break;
    case 'image':
      if (typeof value === 'string') {
        return html` <img
          src="${value}"
          class="today-indicator image"
          style=${styleMap(positionStyles)}
          alt="Today"
        />`;
      }
      return nothing;
    case 'emoji':
      if (typeof value === 'string') {
        return html` <span class="today-indicator emoji" style=${styleMap(positionStyles)}>
          ${value}
        </span>`;
      }
      return nothing;
    default:
      return nothing;
  }

  if (icon) {
    return html` <ha-icon
      icon="${icon}"
      class="today-indicator ${type}"
      style=${styleMap(positionStyles)}
    >
    </ha-icon>`;
  }

  return nothing;
}
