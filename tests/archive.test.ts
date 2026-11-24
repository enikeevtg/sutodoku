import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlan, deleteArchivedTask, moveCards, parsePlan, removeStep, setAreaTitle, setGoalText, setTaskText, sortedArchive, sortedPlanArchive, syncCompletion, toggleStep} from '../src/model';

const created = '2026-11-12T09:00:00.000Z';
const firstConfirmation = '2026-11-12T10:00:00.000Z';
const lastConfirmation = '2026-11-12T11:00:00.000Z';
const archived = '2026-11-12T12:00:00.000Z';

test('creation is recorded once, edits preserve it, and reconfirming updates only confirmation time', () => {
  const area = createPlan().areas[0], task = area.tasks[0];
  setTaskText(task, 'First step', created);
  assert.equal(task.createdAt, created);
  assert.equal(task.confirmedAt, undefined);
  setTaskText(task, 'Revised step', firstConfirmation);
  assert.equal(task.createdAt, created);
  assert(toggleStep(area, 0, firstConfirmation));
  assert.equal(task.confirmedAt, firstConfirmation);
  assert(toggleStep(area, 0, lastConfirmation));
  assert.equal(task.confirmedAt, firstConfirmation);
  assert(toggleStep(area, 0, lastConfirmation));
  assert.equal(task.confirmedAt, lastConfirmation);
  assert.equal(task.createdAt, created);
  setTaskText(task, '', archived);
  assert.equal(task.createdAt, undefined);
  assert.equal(task.confirmedAt, undefined);
  assert.equal(task.done, false);
});

test('goal and direction creation dates persist; automatic direction confirmation is stamped once', () => {
  const plan = createPlan(), area = plan.areas[0];
  setGoalText(plan, 'Goal', created);
  setAreaTitle(area, 'Direction', created);
  setGoalText(plan, 'Revised goal', archived);
  assert.equal(plan.createdAt, created);
  assert.equal(area.createdAt, created);
  setTaskText(area.tasks[0], 'Step', created);
  syncCompletion(plan, true, created);
  toggleStep(area, 0, firstConfirmation);
  syncCompletion(plan, true, firstConfirmation);
  syncCompletion(plan, true, lastConfirmation);
  assert.equal(area.confirmedAt, firstConfirmation);
});

test('unconfirmed and empty cards cannot be archived and a rejected archive leaves all data intact', () => {
  const area = createPlan().areas[0];
  setTaskText(area.tasks[0], 'Pending', created);
  for (const index of [0, 1]) {
    const before = JSON.stringify(area);
    assert.equal(removeStep(area, index, true, archived), false);
    assert.equal(JSON.stringify(area), before);
  }
  assert.equal(removeStep(area, 0, false), true);
  assert.equal(area.tasks[0].text, '');
});

test('archiving preserves dates, color and completion, then shifts live steps into the vacated slot', () => {
  const plan = createPlan(), area = plan.areas[0];
  setTaskText(area.tasks[0], 'Confirmed step', created);
  area.tasks[0].color = {h:20, s:30, v:40};
  toggleStep(area, 0, lastConfirmation);
  setTaskText(area.tasks[1], 'Next step', created);
  assert(removeStep(area, 0, true, archived));
  assert.deepEqual(area.archive?.[0], {text:'Confirmed step', done:true, color:{h:20,s:30,v:40}, createdAt:created, confirmedAt:lastConfirmation, archivedAt:archived});
  assert.equal(area.tasks[0].text, 'Next step');
  assert.equal(area.tasks.length, 8);
  assert.deepEqual(parsePlan(JSON.stringify(plan)).areas[0].archive, area.archive);
});

test('archives sort by confirmation time rather than archive time, with unknown legacy dates last', () => {
  const area = createPlan().areas[0];
  const legacy = {text:'Legacy', done:true};
  const older = {text:'Older', done:true, confirmedAt:firstConfirmation, archivedAt:archived};
  const newer = {text:'Newer', done:true, confirmedAt:lastConfirmation, archivedAt:lastConfirmation};
  area.archive = [legacy, older, newer];
  assert.deepEqual(sortedArchive(area), [newer, older, legacy]);
  assert.deepEqual(area.archive, [legacy, older, newer]);
  area.tasks[0] = {text:'Newest', done:true, confirmedAt:archived};
  removeStep(area, 0, true, archived);
  assert.deepEqual(area.archive?.map(item => item.text), ['Newest', 'Newer', 'Older', 'Legacy']);
});

test('archive deletion targets the selected object even when card texts match, and survives reload', () => {
  const plan = createPlan(), area = plan.areas[0];
  const first = {text:'Same text', done:true, confirmedAt:firstConfirmation};
  const second = {text:'Same text', done:true, confirmedAt:lastConfirmation};
  area.archive = [first, second];
  assert(deleteArchivedTask(area, first));
  assert.equal(area.archive[0], second);
  assert.equal(deleteArchivedTask(area, first), false);
  assert.deepEqual(parsePlan(JSON.stringify(plan)).areas[0].archive, [second]);
});

test('the plan archive interleaves directions by confirmation date and keeps each original row linked to its source', () => {
  const plan = createPlan();
  const older = {text:'Same text', done:true, confirmedAt:firstConfirmation, archivedAt:archived};
  const newer = {text:'Same text', done:true, confirmedAt:lastConfirmation, archivedAt:lastConfirmation};
  const legacy = {text:'Legacy', done:true};
  plan.areas[0].archive = [legacy, newer];
  plan.areas[7].archive = [older];

  const rows = sortedPlanArchive(plan);
  assert.deepEqual(rows, [{areaIndex:0, item:newer}, {areaIndex:7, item:older}, {areaIndex:0, item:legacy}]);
  assert.deepEqual(plan.areas[0].archive, [legacy, newer]);
  assert(deleteArchivedTask(plan.areas[rows[1].areaIndex], rows[1].item));
  assert.deepEqual(plan.areas[7].archive, []);
  assert.deepEqual(plan.areas[0].archive, [legacy, newer]);
});

test('legacy dates remain unknown on load; moving cards preserves known dates', () => {
  const legacy = createPlan();
  legacy.areas[0].tasks[0] = {text:'Old completed step', done:true};
  legacy.areas[0].archive = [{text:'Old archive', done:false}];
  const loaded = parsePlan(JSON.stringify(legacy));
  assert.equal(loaded.areas[0].tasks[0].createdAt, undefined);
  assert.equal(loaded.areas[0].tasks[0].confirmedAt, undefined);
  assert.equal(loaded.areas[0].confirmedAt, undefined);
  const task = loaded.areas[0].tasks[1];
  setTaskText(task, 'New step', created);
  toggleStep(loaded.areas[0], 1, firstConfirmation);
  moveCards(loaded, 0, 1, 8);
  assert.equal(loaded.areas[0].tasks[7], task);
  assert.equal(task.createdAt, created);
  assert.equal(task.confirmedAt, firstConfirmation);
});

test('invalid date fields are rejected in live cards, directions, goals and archived cards', () => {
  for (const invalid of ['not a date', '2026-99-99T00:00:00Z', 123, null]) {
    for (const target of ['goal', 'direction', 'task', 'archive']) {
      const plan = createPlan();
      plan.areas[0].archive = [{text:'Archived', done:true}];
      const item = target === 'goal' ? plan : target === 'direction' ? plan.areas[0] : target === 'task' ? plan.areas[0].tasks[0] : plan.areas[0].archive[0];
      for (const key of target === 'archive' ? ['createdAt', 'confirmedAt', 'archivedAt'] : ['createdAt', 'confirmedAt']) {
        Object.assign(item, {[key]:invalid});
        assert.throws(() => parsePlan(JSON.stringify(plan)));
        delete (item as unknown as Record<string, unknown>)[key];
      }
    }
  }
});
