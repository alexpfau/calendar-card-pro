/**
 * Helper utilities for Calendar Card Pro
 *
 * General purpose utility functions for debouncing, memoization,
 * performance monitoring, and other common tasks.
 */

//-----------------------------------------------------------------------------
// COLOR UTILITIES
//-----------------------------------------------------------------------------

/**
 * Convert any color format to RGBA with specific opacity
 *
 * @param color - Color in any valid CSS format
 * @param opacity - Opacity value (0-100)
 * @returns RGBA color string
 */
export function convertToRGBA(color: string, opacity: number): string {
  // If color is a CSS variable, we need to handle it specially
  if (color.startsWith('var(')) {
    // Create a temporary CSS variable with opacity
    return `rgba(var(--calendar-color-rgb, 3, 169, 244), ${opacity / 100})`;
  }

  if (color === 'transparent') {
    return color;
  }

  // Create temporary element to compute the color
  const tempElement = document.createElement('div');
  tempElement.style.display = 'none';
  tempElement.style.color = color;
  document.body.appendChild(tempElement);

  // Get computed color in RGB format
  const computedColor = getComputedStyle(tempElement).color;
  document.body.removeChild(tempElement);

  // If computation failed, return original color
  if (!computedColor) return color;

  // Handle RGB format (rgb(r, g, b))
  const rgbMatch = computedColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // If already RGBA, replace the alpha component
  const rgbaMatch = computedColor.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // Fallback to original color if parsing fails
  return color;
}

//-----------------------------------------------------------------------------
// INDICATOR TYPE DETECTION
//-----------------------------------------------------------------------------

/**
 * Checks if a string is an emoji
 *
 * @param str String to check
 * @returns True if the string is an emoji
 */
export function isEmoji(str: string): boolean {
  // Basic emoji detection using Unicode ranges
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  return str.length <= 2 && emojiRegex.test(str);
}

/**
 * Determine the type of today indicator based on the value
 *
 * @param value The today_indicator value from config
 * @returns Type of indicator ('dot', 'pulse', 'glow', 'mdi', 'image', 'emoji', 'none')
 */
export function getTodayIndicatorType(value: string | boolean): string {
  // Boolean values
  if (value === false) return 'none';
  if (value === true) return 'dot';

  // String values
  if (typeof value === 'string') {
    // Check for built-in types
    if (value === 'dot') return 'dot';
    if (value === 'pulse') return 'pulse';
    if (value === 'glow') return 'glow';

    // Check if value is an MDI icon path
    if (value.startsWith('mdi:')) return 'mdi';

    // Check if value is an image path
    if (value.startsWith('/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(value)) return 'image';

    // Assume emoji if it's a short string (typically 1-2 characters)
    if (value.length <= 2) return 'emoji';

    // Default to dot if unrecognized
    return 'dot';
  }

  // Default to none for unexpected types
  return 'none';
}

//-----------------------------------------------------------------------------
// ID GENERATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Generate a random instance ID
 *
 * @returns {string} Random alphanumeric identifier
 */
export function generateInstanceId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a deterministic ID based on calendar config
 * Creates a stable ID that persists across page reloads
 * but changes when the data requirements change
 *
 * @param entities Array of calendar entities
 * @param daysToShow Number of days to display
 * @param showPastEvents Whether to show past events
 * @param startDate Optional custom start date
 * @returns Deterministic ID string based on input parameters
 */
export function generateDeterministicId(
  entities: Array<string | { entity: string; color?: string }>,
  daysToShow: number,
  showPastEvents: boolean,
  startDate?: string,
): string {
  // Extract just the entity IDs, normalized for comparison
  const entityIds = entities
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join('_');

  // Normalize ISO date format to YYYY-MM-DD for caching
  let normalizedStartDate = '';
  if (startDate) {
    try {
      if (startDate.includes('T')) {
        // It's an ISO date, extract just the date part
        normalizedStartDate = startDate.split('T')[0];
      } else {
        normalizedStartDate = startDate;
      }
    } catch {
      normalizedStartDate = startDate; // Fallback to original
    }
  }

  // Include the normalized startDate in the ID
  const startDatePart = normalizedStartDate ? `_${normalizedStartDate}` : '';

  // Create a base string with all data-affecting parameters
  const baseString = `calendar_${entityIds}_${daysToShow}_${showPastEvents ? 1 : 0}${startDatePart}`;

  // Hash it for a compact, consistent ID
  return hashString(baseString);
}

/**
 * Simple string hash function for creating deterministic IDs
 * Converts a string into a stable hash value for use as an identifier
 *
 * @param str - Input string to hash
 * @returns Alphanumeric hash string
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to alphanumeric string
  return Math.abs(hash).toString(36);
}
