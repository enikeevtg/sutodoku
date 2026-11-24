import {clockwisePositions} from './model';
import {cardCenter as center} from './layout';

interface InsertionGap {
  position: number;
  after: boolean;
  x: number;
  y: number;
  vertical: boolean;
}

const gaps: InsertionGap[] = [
  {position:0, after:false, x:-.01, y:center(0).y, vertical:true},
  ...clockwisePositions.slice(1).map((position, index) => {
    const before = center(clockwisePositions[index]), after = center(position);
    return {position, after:false, x:(before.x + after.x) / 2, y:(before.y + after.y) / 2, vertical:before.y === after.y};
  }),
  {position:3, after:true, x:-.01, y:.5, vertical:true},
];

/** Pointer coordinates are fractions of the block, independent of its size. */
export function nearestInsertionGap(x: number, y: number): InsertionGap {
  return gaps.reduce((nearest, gap) =>
    Math.hypot(x - gap.x, y - gap.y) < Math.hypot(x - nearest.x, y - nearest.y) ? gap : nearest);
}
