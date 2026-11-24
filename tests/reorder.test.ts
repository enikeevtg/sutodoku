import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nearestInsertionGap} from '../src/reorder';
import {insertionPosition} from '../src/model';

test('corner insertions follow the physical gap above, below, left or right', () => {
  const cases = [
    {x:.7, y:.16, neighbor:2, vertical:true},
    {x:.84, y:.3, neighbor:5, vertical:false},
    {x:.84, y:.7, neighbor:8, vertical:false},
    {x:.7, y:.84, neighbor:7, vertical:true},
    {x:.3, y:.84, neighbor:6, vertical:true},
    {x:.16, y:.7, neighbor:3, vertical:false},
  ];
  for (const {x, y, neighbor, vertical} of cases) {
    const gap = nearestInsertionGap(x, y);
    assert.equal(gap.position, neighbor);
    assert.equal(gap.after, false);
    assert.equal(gap.vertical, vertical);
  }
});

test('indicator is at the midpoint between cards and dropping in the gap selects that insertion', () => {
  const rightGap = nearestInsertionGap(.84, .33);
  assert(Math.abs(rightGap.x - .84375) < 1e-12);
  assert(Math.abs(rightGap.y - .328125) < 1e-12);
  assert.equal(insertionPosition(0, rightGap.position, rightGap.after), 2);
  const bottomGap = nearestInsertionGap(.67, .84);
  assert(Math.abs(bottomGap.x - .671875) < 1e-12);
  assert(Math.abs(bottomGap.y - .84375) < 1e-12);
  assert.equal(insertionPosition(0, bottomGap.position, bottomGap.after), 8);
});

test('first and last insertion positions remain reachable', () => {
  const first = nearestInsertionGap(.02, .16);
  assert.equal(insertionPosition(8, first.position, first.after), 0);
  const last = nearestInsertionGap(.02, .5);
  assert.equal(insertionPosition(0, last.position, last.after), 3);
});
