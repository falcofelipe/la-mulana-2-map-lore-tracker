/**
 * Coordinate Conversion Utilities
 * -------------------------------
 * Handles Excel-style grid coordinate formatting (e.g., row 1, col 2 -> "$C$2").
 */

/**
 * Converts a 0-based column index into an Excel column letter (0 -> "A", 25 -> "Z", 26 -> "AA").
 */
export function colIndexToLetter(colIndex: number): string {
  let index = Math.max(0, colIndex);
  let letters = '';
  while (index >= 0) {
    letters = String.fromCharCode((index % 26) + 65) + letters;
    index = Math.floor(index / 26) - 1;
  }
  return letters;
}

/**
 * Converts an Excel column letter ("A" -> 0, "C" -> 2, "AA" -> 26) back to a 0-based index.
 */
export function letterToColIndex(letters: string): number {
  const clean = letters.toUpperCase().replace(/[^A-Z]/g, '');
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    index = index * 26 + (clean.charCodeAt(i) - 64);
  }
  return Math.max(0, index - 1);
}

/**
 * Formats 0-based (row, col) indices into an Excel-style absolute coordinate string (e.g., "$C$2").
 */
export function formatCellCoord(row: number, col: number): string {
  const colLetter = colIndexToLetter(col);
  const rowNumber = row + 1;
  return `$${colLetter}$${rowNumber}`;
}

/**
 * Parses an Excel coordinate string (e.g., "$C$2" or "C2") into 0-based { row, col }.
 * Returns null if the string is not a valid coordinate.
 */
export function parseCellCoord(coord: string): { row: number; col: number } | null {
  const match = coord.trim().toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!match) return null;
  const col = letterToColIndex(match[1]);
  const row = Math.max(0, parseInt(match[2], 10) - 1);
  return { row, col };
}
