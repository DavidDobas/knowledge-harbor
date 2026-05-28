export const SPACE_COLORS = [
  "#7B70D0", "#5CAF7A", "#5B8FD4", "#4FBDBA",
  "#D45B8F", "#D4905B", "#9B59B6", "#E05252",
];

export function colorForSpaceIndex(i: number): string {
  return SPACE_COLORS[i % SPACE_COLORS.length];
}
