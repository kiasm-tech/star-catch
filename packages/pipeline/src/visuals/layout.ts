/** Deterministic layouts in the 1000 × 562 canvas: at most seven elements never need a graph solver. */
import { CANVAS } from "@kiasm-tech/star-catch-contracts";

const MARGIN = 60;
const GAP = 28;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `count` boxes in one row (up to four) or two, centred. */
export function rows(count: number, h = 72): Box[] {
  const perRow = count <= 4 ? count : Math.ceil(count / 2);
  const rowCount = Math.ceil(count / Math.max(perRow, 1));
  const w = Math.min(200, (CANVAS.width - 2 * MARGIN - (perRow - 1) * GAP) / Math.max(perRow, 1));
  const height = rowCount * h + (rowCount - 1) * GAP * 2;
  const top = (CANVAS.height - height) / 2;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const left = (CANVAS.width - (inRow * w + (inRow - 1) * GAP)) / 2;
    return { x: round(left + (i % perRow) * (w + GAP)), y: round(top + row * (h + GAP * 2)), w: round(w), h };
  });
}

/** Groups laid out on their own, stacked top to bottom with a row's gap between them, centred as a whole. */
export function stack(groups: Box[][]): Box[][] {
  const extent = (group: Box[]) => ({ top: Math.min(...group.map((b) => b.y)), bottom: Math.max(...group.map((b) => b.y + b.h)) });
  const kept = groups.filter((g) => g.length > 0);
  const heights = kept.map((g) => extent(g).bottom - extent(g).top);
  let y = (CANVAS.height - (heights.reduce((a, b) => a + b, 0) + GAP * 2 * (kept.length - 1))) / 2;
  return groups.map((group) => {
    if (group.length === 0) return group;
    const dy = y - extent(group).top;
    y += extent(group).bottom - extent(group).top + GAP * 2;
    return group.map((b) => ({ ...b, y: round(b.y + dy) }));
  });
}

/** Lifeline positions for `count` participants, evenly spread. */
export function lanes(count: number): number[] {
  const step = (CANVAS.width - 2 * MARGIN) / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => round(MARGIN + step * (i + 0.5)));
}

const round = (n: number) => Math.round(n * 10) / 10;
