import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlan, parsePlan} from '../src/model';
import {cardColor, colorFromHex, colorHex, colorStyles, defaultColor, setCardColor} from '../src/colors';

test('default colors: orange goal, light gray directions, darker gray steps', () => {
  const plan = createPlan();
  const goal = cardColor(plan, {kind:'goal'});
  const area = cardColor(plan, {kind:'area', area:0});
  const task = cardColor(plan, {kind:'task', area:0, task:0});
  assert.equal(goal.h, 30); assert(goal.s > 50);
  assert.equal(area.s, 0); assert(area.v > 80 && area.v < 100);
  assert.equal(task.s, 0); assert(task.v < area.v);
});
test('direction colors drive inherited steps; explicit step colors and resets persist', () => {
  const plan = createPlan();
  const direction = {kind:'area' as const, area:0};
  const step = {kind:'task' as const, area:0, task:0};
  setCardColor(plan, direction, {h:210, s:80, v:90});
  const inherited = cardColor(plan, step);
  assert.equal(inherited.h, 210); assert(inherited.s < 80); assert(inherited.v < 90);
  setCardColor(plan, step, {h:300, s:70, v:60});
  setCardColor(plan, direction, {h:40, s:90, v:95});
  assert.deepEqual(cardColor(parsePlan(JSON.stringify(plan)), step), {h:300, s:70, v:60});
  setCardColor(plan, step, undefined);
  assert.deepEqual(cardColor(plan, step), defaultColor(plan, step));
  setCardColor(plan, direction, undefined);
  assert.deepEqual(cardColor(plan, direction), {h:0, s:0, v:86});
  assert.equal(plan.areas[1].color, undefined);
});
test('HSV conversion retains native picker colors, brightness, and saturation', () => {
  for (const hex of ['#ff0000','#00ff00','#0000ff','#000000','#ffffff','#b8b8b8','#2473ca']) {
    assert.equal(colorHex(colorFromHex(hex)), hex);
  }
  assert.equal(colorHex({h:360,s:100,v:100}), '#ff0000');
  assert.equal(colorHex({h:120,s:0,v:50}), '#808080');
  assert.equal(colorStyles({h:0,s:0,v:0})['--ow-card-text'], '#fff');
  assert.equal(colorStyles({h:0,s:0,v:100})['--ow-card-text'], '#16191e');
});
test('reject invalid color data at every stored card location', () => {
  for (const color of [null, 'red', {h:361,s:20,v:30}, {h:20,s:-1,v:30}, {h:20,s:30,v:101}, {h:20,s:30}, {h:'20',s:30,v:40}]) {
    for (const location of ['goal', 'area', 'task']) {
      const plan = createPlan();
      if (location === 'goal') Object.assign(plan, {goalColor:color});
      else if (location === 'area') Object.assign(plan.areas[0], {color});
      else Object.assign(plan.areas[0].tasks[0], {color});
      assert.throws(() => parsePlan(JSON.stringify(plan)));
    }
  }
});
