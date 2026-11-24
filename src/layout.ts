// All expanded blocks share the board's 22% lattice: 16% cards + 6% gaps.
// In a 64% block this becomes 25% cards and a 34.375% center-to-center pitch.
// For example, the top-left block's r2c3 and the home block's r1c2 both
// have board coordinates (50%, 28%). Keep styles.css in sync.
export const cardSize = .25;
export function cardCenter(position: number) {
  return {x:.15625 + position % 3 * .34375, y:.15625 + Math.floor(position / 3) * .34375};
}
