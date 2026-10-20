/**
 * Width of one card in a horizontal row.
 *
 * `peek` 0 (desktop): as many whole cards as fit `minWidth`, stretched to fill
 * the row exactly. `peek` > 0 (iOS): whole cards plus that fraction of the next
 * one, the touch cue that the row scrolls. Never returns less than 1 card's
 * worth of space and never makes the row wider than `available`.
 */
export function rowCellWidth(available: number, minWidth: number, gap: number, peek: number): number {
  const fits = Math.max(1, Math.floor((available + gap) / (minWidth + gap) - peek));
  return peek
    ? (available - fits * gap) / (fits + peek)
    : (available - (fits - 1) * gap) / fits;
}
