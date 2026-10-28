/**
 * Keyword & Colored Tablet Text Highlighting Utility
 * --------------------------------------------------
 * 1. Renders inline color tags inside tablet transcripts and lore notes:
 *    - `{g:golden key}`  -> Emerald / Green highlight (in-game green tablet keywords)
 *    - `{r:Jormungand}`  -> Rose / Red highlight (in-game red/coral tablet keywords)
 *    - `{b:Dark Star}`   -> Sky / Blue highlight (in-game blue/periwinkle tablet keywords)
 *    - `{c:Sakit's}`     -> Cyan / Aqua highlight (in-game bright cyan/aqua tablet keywords)
 *    - `{y:light}`       -> Amber / Yellow highlight
 * 2. Automatically highlights uppercase La-Mulana 2 lore keywords (2+ characters,
 *    such as "GOLDEN WINGS", "GLOVE OF POWER", "FIRE", "UNDERWORLD") inside
 *    plain text segments for fast visual scanning.
 */

import React from 'react';

const KEYWORD_REGEX = /\b([A-Z0-9]{2,}(?:\s+[A-Z0-9]{2,})*)\b/g;

/**
 * Rough UI reference palette for colored tablet text tags.
 * Note: In-game rendered tablet fonts use anti-aliased and stylized hues that
 * only roughly approximate these standard UI palette colors.
 */
export const LORE_TEXT_COLOR_PALETTE = {
  g: {
    tag: 'g',
    name: 'green',
    approxHex: '#10b981',
    approxRgb: [16, 185, 129] as const,
  },
  r: {
    tag: 'r',
    name: 'red',
    approxHex: '#f43f5e',
    approxRgb: [244, 63, 94] as const,
  },
  b: {
    tag: 'b',
    name: 'blue',
    approxHex: '#3b82f6',
    approxRgb: [59, 130, 246] as const,
  },
  c: {
    tag: 'c',
    name: 'cyan',
    approxHex: '#06b6d4',
    approxRgb: [6, 182, 212] as const,
  },
  y: {
    tag: 'y',
    name: 'yellow',
    approxHex: '#eab308',
    approxRgb: [234, 179, 8] as const,
  },
} as const;

/**
 * Matches `{g:text}`, `{r:text}`, `{c:text}`, `{b:text}`, `{y:text}`
 * (or full names `{green:text}`, `{red:text}`, `{cyan:text}`, `{blue:text}`, `{yellow:text}`).
 */
const COLOR_TAG_REGEX =
  /\{(g|green|r|red|c|cyan|b|blue|y|yellow):([^{}]+)\}/gi;

const COLOR_TAG_CLASSES: Record<string, string> = {
  g: 'text-emerald-300 font-semibold tracking-wide bg-emerald-500/15 border border-emerald-500/30 px-1 rounded',
  green:
    'text-emerald-300 font-semibold tracking-wide bg-emerald-500/15 border border-emerald-500/30 px-1 rounded',
  r: 'text-rose-300 font-semibold tracking-wide bg-rose-500/15 border border-rose-500/30 px-1 rounded',
  red: 'text-rose-300 font-semibold tracking-wide bg-rose-500/15 border border-rose-500/30 px-1 rounded',
  c: 'text-cyan-300 font-semibold tracking-wide bg-cyan-500/15 border border-cyan-500/30 px-1 rounded',
  cyan: 'text-cyan-300 font-semibold tracking-wide bg-cyan-500/15 border border-cyan-500/30 px-1 rounded',
  b: 'text-sky-300 font-semibold tracking-wide bg-sky-500/15 border border-sky-500/30 px-1 rounded',
  blue: 'text-sky-300 font-semibold tracking-wide bg-sky-500/15 border border-sky-500/30 px-1 rounded',
  y: 'text-amber-300 font-semibold tracking-wide bg-amber-500/15 border border-amber-500/30 px-1 rounded',
  yellow:
    'text-amber-300 font-semibold tracking-wide bg-amber-500/15 border border-amber-500/30 px-1 rounded',
};

/**
 * Strips `{g:...}` / `{r:...}` / `{b:...}` / `{c:...}` / `{y:...}` markup so
 * plain-text search queries like "the golden key" match seamlessly across color tag boundaries.
 */
export function stripLoreColorTags(text: string): string {
  if (!text) return '';
  return text.replace(COLOR_TAG_REGEX, '$2');
}

function renderCapsSegment(
  segment: string,
  keyPrefix: string
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(KEYWORD_REGEX);
  while ((match = regex.exec(segment)) !== null) {
    const word = match[0];
    if (match.index > lastIndex) {
      parts.push(segment.slice(lastIndex, match.index));
    }

    if (word === 'TODO') {
      parts.push(
        <span
          key={`${keyPrefix}-kw-${match.index}`}
          className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[11px]"
        >
          {word}
        </span>
      );
    } else {
      parts.push(
        <span
          key={`${keyPrefix}-kw-${match.index}`}
          className="text-amber-300 font-semibold tracking-wide bg-amber-500/10 px-1 rounded"
        >
          {word}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < segment.length) {
    parts.push(segment.slice(lastIndex));
  }

  return parts;
}

export function renderHighlightedLoreText(text: string): React.ReactNode {
  if (!text) return null;

  const output: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const tagRegex = new RegExp(COLOR_TAG_REGEX);
  while ((match = tagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainBefore = text.slice(lastIndex, match.index);
      output.push(...renderCapsSegment(plainBefore, `seg-${lastIndex}`));
    }

    const colorKey = match[1].toLowerCase();
    const innerText = match[2];
    const className =
      COLOR_TAG_CLASSES[colorKey] ||
      'text-amber-300 font-semibold tracking-wide bg-amber-500/10 px-1 rounded';

    output.push(
      <span key={`col-${match.index}`} className={className}>
        {innerText}
      </span>
    );

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    output.push(...renderCapsSegment(text.slice(lastIndex), `seg-${lastIndex}`));
  }

  return output;
}
