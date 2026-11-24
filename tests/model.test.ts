import {test} from 'node:test';
import assert from 'node:assert/strict';
import {areaDone, canComplete, canUncomplete, toggleStep, insertionPosition, clockwisePositions, removeStep, createPlan, parsePlan, progress, moveCards, syncCompletion, toMarkdown, positions} from '../src/model';
test('64 independent tasks and eight positions surrounding the center', () => {
 const p = createPlan(); assert.equal(p.areas.flatMap(a => a.tasks).length, 64);
 p.areas[0].tasks[0].text = 'Один'; assert.equal(p.areas[1].tasks[0].text, '');
 assert.deepEqual(positions, [0,1,2,3,5,6,7,8]);
 syncCompletion(p);
 assert.deepEqual(parsePlan(JSON.stringify(p)), p);
});
test('reject corrupt files without silently replacing them', () => {
 for (const raw of ['{}', 'null', '{', JSON.stringify({...createPlan(), areas: []})]) assert.throws(() => parsePlan(raw));
});
test('progress counts only populated tasks; Markdown preserves completion and links', () => {
 const p = createPlan(); p.goal = 'Цель'; p.areas[0].title = 'Здоровье';
 p.areas[0].tasks[0] = {text:'[[Прогулка]]', done:true};
 p.areas[0].tasks[1] = {text:'Бег', done:false};
 assert.deepEqual(progress(p), {total:2, done:1});
 assert.match(toMarkdown(p), /- \[x\] \[\[Прогулка\]\]/); assert.match(toMarkdown(p), /- \[ \] Бег/);
});
test('old manual direction completion is recalculated from populated steps', () => {
 const old = createPlan();
 old.areas.forEach(area => delete area.done);
 assert.deepEqual(parsePlan(JSON.stringify(old)), createPlan());
 old.areas[0].title = 'Здоровье'; old.areas[0].done = true;
 old.areas[0].tasks[0] = {text:'Прогулка', done:false};
 old.areas[1].done = false;
 const loaded = parsePlan(JSON.stringify(old));
 assert.equal(loaded.areas[0].done, false);
 assert.equal(loaded.areas[1].done, true);
 assert.equal(loaded.areas[1].confirmedAt, undefined);
 assert.deepEqual(progress(loaded), {total:1, done:0});
 assert.match(toMarkdown(loaded), /## Здоровье/);
 assert.match(toMarkdown(loaded), /- \[ \] Прогулка/);
 const invalid = createPlan();
 Object.assign(invalid.areas[0], {done:'yes'});
 assert.throws(() => parsePlan(JSON.stringify(invalid)));
});
test('a direction is complete whenever it has no unfinished populated steps', () => {
 const plan = createPlan(), area = plan.areas[0];
 assert.equal(area.done, true);
 assert.equal(areaDone(area), true);
 assert.match(toMarkdown(plan), /## ✓ Direction 1/);
 area.tasks[0] = {text:'Первый', done:true};
 assert.equal(areaDone(area), true);
 area.tasks[7] = {text:'Последний', done:false};
 assert.equal(areaDone(area), false);
 area.tasks[7].done = true;
 syncCompletion(plan);
 assert.equal(area.done, true);
 assert.match(toMarkdown(plan), /## ✓ Direction 1/);
 area.tasks[0].done = false;
 syncCompletion(plan);
 assert.equal(area.done, false);
 area.tasks.forEach(task => {task.text = '  ';});
 assert.equal(areaDone(area), true);
 area.tasks[0] = {text:'Открытый шаг', done:false};
 syncCompletion(plan);
 assert.equal(area.done, false);
 assert(removeStep(area, 0, false));
 syncCompletion(plan);
 assert.equal(area.done, true);
});
test('moving steps carries their text, color and completion; moving directions carries the entire area', () => {
 const plan = createPlan();
 const step = {text:'Цветной шаг', done:true, color:{h:20,s:30,v:40}};
 plan.areas[0].tasks[0] = step;
 assert.equal(moveCards(plan, 0, 0, 8), true);
 assert.equal(plan.areas[0].tasks[7], step);
 assert.equal(plan.areas[0].tasks[0].text, '');
 const area = plan.areas[0]; area.title = 'Первое направление';
 assert.equal(moveCards(plan, 4, 0, 8), true);
 assert.equal(plan.areas[7], area);
 assert.equal(plan.areas[7].tasks[7], step);
 assert.equal(plan.areas[7].done, true);
 const before = JSON.stringify(plan);
 for (const [block, from, to] of [[4,4,0], [0,0,4], [-1,0,1], [9,0,1], [0,0,0], [0,0,9]]) {
   assert.equal(moveCards(plan, block, from, to), false);
 }
 assert.equal(JSON.stringify(plan), before);
});

test('completion requires prior filled steps and removal shifts clockwise with archive data', () => {
 const area = createPlan().areas[0];
 area.tasks[0] = {text:'First',done:false}; area.tasks[2] = {text:'Next',done:false};
 assert.equal(canComplete(area, 0), true); assert.equal(canComplete(area, 2), false);
 area.tasks[0].done = true; assert.equal(canComplete(area, 2), true);
 removeStep(area, 0, true); assert.equal(area.archive?.[0].text, 'First');
 assert.equal(area.tasks[1].text, 'Next'); assert.equal(area.tasks[3].text, '');
});


test('insertion shifts every intermediate card in both directions along the clockwise path', () => {
 for (const block of [0, 4]) for (const from of clockwisePositions) for (const to of clockwisePositions) {
   const plan = createPlan();
   const cards = block === 4 ? plan.areas : plan.areas[0].tasks;
   const original = clockwisePositions.map(position => cards[positions.indexOf(position)]);
   const expected = [...original];
   const [moved] = expected.splice(clockwisePositions.indexOf(from), 1);
   expected.splice(clockwisePositions.indexOf(to), 0, moved);
   assert.equal(moveCards(plan, block, from, to), from !== to);
   clockwisePositions.forEach((position, index) => assert.equal(cards[positions.indexOf(position)], expected[index]));
   assert.equal(cards.length, 8);
 }
});

test('drop edges insert between neighbors, adjusting the gap when the source is removed', () => {
 assert.equal(insertionPosition(0, 2, false), 1);
 assert.equal(insertionPosition(0, 2, true), 2);
 assert.equal(insertionPosition(8, 1, false), 1);
 assert.equal(insertionPosition(8, 1, true), 2);
 assert.equal(insertionPosition(0, 1, false), 0);
 assert.equal(insertionPosition(0, 3, true), 3);
 assert.equal(insertionPosition(3, 0, false), 0);
});

test('completed steps can only be undone from the last completed step backwards, skipping empty steps', () => {
 const area = createPlan().areas[0];
 for (const position of [0, 2, 8]) area.tasks[positions.indexOf(position)] = {text:`Step ${position}`, done:false};
 for (const position of [0, 2, 8]) assert.equal(toggleStep(area, positions.indexOf(position)), true);
 assert.equal(canUncomplete(area, 0), false);
 assert.equal(toggleStep(area, 0), false);
 assert.equal(toggleStep(area, 2), false);
 assert.equal(area.tasks[0].done, true);
 assert.equal(toggleStep(area, positions.indexOf(8)), true);
 assert.equal(toggleStep(area, 0), false);
 assert.equal(toggleStep(area, 2), true);
 assert.equal(toggleStep(area, 0), true);
 assert.equal(toggleStep(area, 2), false);
 assert.equal(toggleStep(area, 1), false);
});
