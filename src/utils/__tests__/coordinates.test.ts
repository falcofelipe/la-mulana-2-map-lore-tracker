import { describe, expect, it } from 'vitest';
import {
  colIndexToLetter,
  formatCellCoord,
  letterToColIndex,
  normalizeCellCoord,
  parseCellCoord,
} from '../coordinates';

describe('Excel Grid Coordinate Utilities', () => {
  it('converts 0-based column indices to Excel letters and back', () => {
    expect(colIndexToLetter(0)).toBe('A');
    expect(colIndexToLetter(2)).toBe('C');
    expect(colIndexToLetter(7)).toBe('H');
    expect(colIndexToLetter(25)).toBe('Z');
    expect(colIndexToLetter(26)).toBe('AA');
    expect(colIndexToLetter(27)).toBe('AB');

    expect(letterToColIndex('A')).toBe(0);
    expect(letterToColIndex('C')).toBe(2);
    expect(letterToColIndex('H')).toBe(7);
    expect(letterToColIndex('Z')).toBe(25);
    expect(letterToColIndex('AA')).toBe(26);
    expect(letterToColIndex('AB')).toBe(27);
  });

  it('formats and parses ($Col$Row) coordinates accurately', () => {
    expect(formatCellCoord(0, 0)).toBe('$A$1');
    expect(formatCellCoord(1, 2)).toBe('$C$2');
    expect(formatCellCoord(6, 7)).toBe('$H$7');

    expect(parseCellCoord('$C$2')).toEqual({ row: 1, col: 2 });
    expect(parseCellCoord('c2')).toEqual({ row: 1, col: 2 });
    expect(parseCellCoord(' $H$7 ')).toEqual({ row: 6, col: 7 });
    expect(parseCellCoord('invalid')).toBeNull();
  });

  it('normalizes user coordinate inputs into canonical $Col$Row format', () => {
    expect(normalizeCellCoord('c2')).toBe('$C$2');
    expect(normalizeCellCoord('C2')).toBe('$C$2');
    expect(normalizeCellCoord('$c2')).toBe('$C$2');
    expect(normalizeCellCoord('$C$2')).toBe('$C$2');
    expect(normalizeCellCoord('  aa10 ')).toBe('$AA$10');
  });
});
