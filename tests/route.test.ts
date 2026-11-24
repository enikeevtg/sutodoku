import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clockwisePositions, createPlan, positions, toMarkdown} from '../src/model';
import {routePoints, stepRoute} from '../src/route';

function areaWith(...cells: number[]) {
  const area = createPlan().areas[0];
  cells.forEach(cell => {area.tasks[positions.indexOf(cell)].text = `Карточка ${cell}`;});
  return area;
}
test('every single filled step connects directly to the center; empty blocks have no route', () => {
  assert.deepEqual(stepRoute(areaWith()), {start:null,end:null,proxies:[],links:[]});
  for (const cell of clockwisePositions) {
    const route = stepRoute(areaWith(cell));
    assert.deepEqual(route, {start:cell,end:cell,proxies:[],links:[{from:cell,to:4,via:[]}]});
    assert(!routePoints(route.links[0]).includes('NaN'));
  }
  const whitespace = areaWith(0);
  whitespace.tasks[0].text = '  \n ';
  assert.equal(stepRoute(whitespace).links.length, 0);
});
test('a multiple-step route never closes back to its start', () => {
  const route = stepRoute(areaWith(...clockwisePositions));
  assert.equal(route.start, 0); assert.equal(route.end, 3);
  assert.deepEqual(route.links.map(link => [link.from,link.to]), [[0,1],[1,2],[2,5],[5,8],[8,7],[7,6],[6,3],[3,4]]);
  assert.equal(route.links.filter(link => link.to === 0).length,0);
});
test('starts at the first clockwise filled step and routes through intermediate empty cards', () => {
  const route = stepRoute(areaWith(1,8,3));
  assert.equal(route.start, 1); assert.equal(route.end, 3);
  assert.deepEqual(route.links, [{from:1,to:8,via:[2,5]}, {from:8,to:3,via:[7,6]}, {from:3,to:4,via:[]}]);
  assert.deepEqual(route.proxies, [2,5,7,6]);
  assert(!route.proxies.includes(0));
  assert.deepEqual(stepRoute(areaWith(0,2)).links, [{from:0,to:2,via:[1]},{from:2,to:4,via:[]}]);
});
test('SVG geometry clips filled endpoints and passes through proxy centers', () => {
  assert.equal(routePoints({from:0,to:1,via:[]}), '287.25,156.25 369,156.25');
  assert.equal(routePoints({from:0,to:2,via:[1]}), '287.25,156.25 500,156.25 712.75,156.25');
  assert.equal(routePoints({from:8,to:4,via:[]}), '712.75,712.75 631,631');
  for (const link of stepRoute(areaWith(1,8,3)).links) {
    assert(!routePoints(link).includes('NaN'));
  }
});
test('Markdown follows the same clockwise order as the visual path', () => {
  const plan = createPlan(); plan.areas[0] = areaWith(...clockwisePositions);
  const lines = toMarkdown(plan).split('\n').filter(line => line.startsWith('- ['));
  assert.deepEqual(lines.map(line => Number(line.match(/Карточка (\d)/)![1])), clockwisePositions);
});
