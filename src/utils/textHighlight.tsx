/**
 * Keyword Highlighting Utility
 * ----------------------------
 * Automatically highlights uppercase La-Mulana 2 lore keywords (2+ characters,
 * such as "GOLDEN WINGS", "GLOVE OF POWER", "FIRE", "UNDERWORLD") inside
 * tablet transcripts and NPC dialogue for fast visual scanning.
 */

import React from 'react';

const KEYWORD_REGEX = /\b([A-Z0-9]{2,}(?:\s+[A-Z0-9]{2,})*)\b/g;

export function renderHighlightedLoreText(text: string): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(KEYWORD_REGEX);
  while ((match = regex.exec(text)) !== null) {
    const word = match[0];
    // Skip common prefix tokens like "TODO" if at start, or highlight them distinctly
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (word === 'TODO') {
      parts.push(
        <span
          key={`kw-${match.index}`}
          className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[11px]"
        >
          {word}
        </span>
      );
    } else {
      parts.push(
        <span
          key={`kw-${match.index}`}
          className="text-amber-300 font-semibold tracking-wide bg-amber-500/10 px-1 rounded"
        >
          {word}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
