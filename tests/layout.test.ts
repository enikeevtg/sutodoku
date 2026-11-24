import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardCenter, cardSize} from '../src/layout';
import {positions} from '../src/model';
import {readFileSync} from 'node:fs';

test('expanded peripheral cards occupy the same lattice as the home cards', () => {
  // Read the actual CSS dimensions so changes in presentation cannot silently
  // invalidate the shared route/card geometry or these alignment guarantees.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const active = css.match(/\.ow-block\.is-active \{ width: ([\d.]+)%; height: ([\d.]+)%;/)!;
  const card = css.match(/\.ow-card \{[^}]*width: ([\d.]+)%; height: ([\d.]+)%;/)!;
  const size = Number(active[1]) / 100;
  assert.equal(active[1], active[2]);
  assert.equal(card[1], card[2]);
  assert.equal(Number(card[1]) / 100, cardSize);
  const centerOnBoard = (block: number, cell: number) => {
    const local = cardCenter(cell);
    return {
      x:.28 + block % 3 * .22 + (local.x - .5) * size,
      y:.28 + Math.floor(block / 3) * .22 + (local.y - .5) * size,
    };
  };
  const samePoint = (a: ReturnType<typeof centerOnBoard>, b: ReturnType<typeof centerOnBoard>) => {
    assert(Math.abs(a.x - b.x) < 1e-12);
    assert(Math.abs(a.y - b.y) < 1e-12);
  };
  // User example: r2c3 in the top-left block → r1c2 in the home block.
  samePoint(centerOnBoard(0, 5), centerOnBoard(4, 1));
  for (const block of positions) {
    for (let cell = 0; cell < 9; cell++) {
      const row = Math.floor(block / 3) + Math.floor(cell / 3) - 1;
      const col = block % 3 + cell % 3 - 1;
      if (row < 0 || row > 2 || col < 0 || col > 2) continue;
      samePoint(centerOnBoard(block, cell), centerOnBoard(4, row * 3 + col));
    }
    const gap = (cardCenter(1).x - cardCenter(0).x - cardSize) * size;
    assert(Math.abs(gap - .06) < 1e-12);
    assert(Math.abs(cardSize * size - .16) < 1e-12);
  }
});

test('each home direction keeps its screen position and size when its block opens', () => {
  for (const boardSize of [840, 1000, 1400]) {
    for (const position of positions) {
      const home = cardCenter(position);
      const anchor = {x:.28 + position % 3 * .22, y:.28 + Math.floor(position / 3) * .22};
      const child = cardCenter(4);
      for (const axis of ['x', 'y'] as const) {
        const homeCenter = (.5 + (home[axis] - .5) * .64) * boardSize;
        const childCenter = (anchor[axis] + (child[axis] - .5) * .64) * boardSize;
        assert(Math.abs(homeCenter - childCenter) < 1e-10);
      }
      // Both active copies use the same size and leave wider gaps than before.
      assert.equal(cardSize * .64, .16);
      assert((cardCenter(1).x - cardCenter(0).x - cardSize) * .2 > .06 * .2);
    }
  }
});
