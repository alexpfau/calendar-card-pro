/**
 * Quick Setup's templates: the examples as one card of rows, each with its icon and a link to its
 * Example Story. Templates only, as `split.ts`: each takes what it shows and what to call. The
 * header, progress bar, notes and actions are the step-by-step tasks' shared ones (`wizard.ts`).
 */

import {
  mdiCakeVariant,
  mdiCalendarToday,
  mdiFormatListBulleted,
  mdiFullscreen,
  mdiHomeHeart,
  mdiOpenInNew,
  mdiTimelineClockOutline,
  mdiWrenchClock,
} from '@mdi/js';
import { type TemplateResult, html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import type { StoryId } from '../stories';
import { icon } from './icon';

/** Each example's icon, kept here so the paths stay in the editor's bundle. */
const STORY_ICONS: Readonly<Record<StoryId, string>> = {
  simple_agenda: mdiFormatListBulleted,
  family_hub: mdiHomeHeart,
  small_card_big_picture: mdiFullscreen,
  now_and_next: mdiTimelineClockOutline,
  today_and_tomorrow: mdiCalendarToday,
  birthdays_and_holidays: mdiCakeVariant,
  house_log: mdiWrenchClock,
};

/** One example as its row draws it. */
export interface StoryChoice {
  readonly id: StoryId;
  readonly name: string;
  /** What it is best for: "What is on now and what comes next". */
  readonly bestFor: string;
  /** Where it fits: "A small tile on a phone". */
  readonly space: string;
  /** Its Example Story on the docs site. */
  readonly href: string;
  /** The link's name: "Read about Now & Next". */
  readonly readName: string;
  readonly picked: boolean;
  readonly onPick: () => void;
}

/**
 * The examples, one row each in one card: a radio mark, the example's icon, its name and its two
 * lines, then ↗ to its Example Story. Each row's choice is a toggle button, pressed when picked,
 * and the link is a stop of its own beside it.
 *
 * @param stories - The examples, in order
 * @returns The card
 */
export function storyOptions(stories: ReadonlyArray<StoryChoice>): TemplateResult {
  return html`<div class="wizard-options quick-setup-stories">
    ${stories.map(
      (story) =>
        html`<div class="wizard-option story-option${story.picked ? ' checked' : ''}">
          <button
            type="button"
            class="story-tile"
            data-story=${story.id}
            aria-pressed=${story.picked ? 'true' : 'false'}
            @click=${story.onPick}
          >
            <span class="story-radio" aria-hidden="true"></span>
            <span class="story-icon" aria-hidden="true">${icon(STORY_ICONS[story.id])}</span>
            <span class="story-text">
              <span class="story-name">${story.name}</span>
              <span class="story-detail">${story.bestFor}</span>
              <span class="story-detail">${story.space}</span>
            </span>
          </button>
          <a
            class="icon-button story-link"
            href=${story.href}
            target="_blank"
            rel="noopener noreferrer"
            title=${story.readName}
            >${icon(mdiOpenInNew)}<span class="visually-hidden">${story.readName}</span></a
          >
        </div>`,
    )}
  </div>`;
}

/**
 * The calendars an example colors, each with its swatch: "● Anna ● Ben", on the calendars step and
 * in the review, so the colors are seen before Apply rather than found after it.
 *
 * @param items - Each calendar's name and the color the example gives it
 * @returns The list
 */
export function swatches(
  items: ReadonlyArray<{ readonly name: string; readonly color: string }>,
): TemplateResult {
  return html`<ul class="quick-setup-swatches">
    ${items.map(
      ({ name, color }) =>
        html`<li>
          <span class="cal-dot" aria-hidden="true" style=${styleMap({ '--cal-dot': color })}></span
          >${name}
        </li>`,
    )}
  </ul>`;
}
