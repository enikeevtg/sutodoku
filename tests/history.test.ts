import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlanHistory} from '../src/history';
import {createPlan, deleteArchivedTask, moveCards, removeStep, setTaskText, syncCompletion, toggleStep} from '../src/model';

test('undo restores a deleted card and all shifted neighbors with colors, dates and completion', () => {
  const plan = createPlan(), area = plan.areas[0];
  setTaskText(area.tasks[0], 'Keep my metadata', '2026-11-12T09:00:00.000Z');
  area.tasks[0].color = {h:25, s:50, v:75};
  toggleStep(area, 0, '2026-11-12T10:00:00.000Z');
  setTaskText(area.tasks[1], 'Next step', '2026-11-12T09:30:00.000Z');
  syncCompletion(plan);
  const before = JSON.stringify(plan), history = new PlanHistory();
  history.reset(plan);
  removeStep(area, 0, false); syncCompletion(plan); history.record(plan);
  const after = JSON.stringify(plan);
  const restored = history.undo()!;
  assert.equal(JSON.stringify(restored), before);
  restored.areas[0].tasks[0].text = 'Mutating the returned object must not alter history';
  assert.equal(JSON.stringify(history.redo()), after);
  assert.equal(JSON.stringify(history.undo()), before);
});

test('undo and redo restore archived rows and archiving without duplicate live or archived cards', () => {
  const plan = createPlan(), area = plan.areas[0];
  setTaskText(area.tasks[0], 'Archive me'); toggleStep(area, 0); syncCompletion(plan);
  const history = new PlanHistory(); history.reset(plan);
  const live = JSON.stringify(plan);
  removeStep(area, 0, true, '2026-11-12T12:00:00.000Z'); syncCompletion(plan); history.record(plan);
  const archived = JSON.stringify(plan);
  deleteArchivedTask(area, area.archive![0]); history.record(plan);
  const deleted = JSON.stringify(plan);
  assert.equal(JSON.stringify(history.undo()), archived);
  assert.equal(JSON.stringify(history.undo()), live);
  assert.equal(JSON.stringify(history.redo()), archived);
  assert.equal(JSON.stringify(history.redo()), deleted);
});

test('successive edits, moves and confirmations undo and redo in order', () => {
  const plan = createPlan(), history = new PlanHistory(); history.reset(plan);
  const states = [JSON.stringify(plan)];
  const record = () => {syncCompletion(plan); history.record(plan); states.push(JSON.stringify(plan));};
  setTaskText(plan.areas[0].tasks[0], 'First'); record();
  toggleStep(plan.areas[0], 0); record();
  moveCards(plan, 0, 0, 8); record();
  for (const expected of states.slice(0, -1).reverse()) assert.equal(JSON.stringify(history.undo()), expected);
  assert.equal(history.undo(), null);
  for (const expected of states.slice(1)) assert.equal(JSON.stringify(history.redo()), expected);
  assert.equal(history.redo(), null);
});

test('no-op saves preserve redo, while an edit after undo discards the old future', () => {
  const plan = createPlan(), history = new PlanHistory(); history.reset(plan);
  plan.goal = 'First'; history.record(plan);
  plan.goal = 'Second'; history.record(plan);
  const restored = history.undo()!;
  history.record(restored);
  assert(history.canRedo);
  restored.goal = 'New branch'; history.record(restored);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), null);
  assert.equal(history.undo()!.goal, 'First');
});

test('history is bounded and resetting or clearing prevents restoring another file', () => {
  const plan = createPlan(), history = new PlanHistory(2); history.reset(plan);
  for (const goal of ['One', 'Two', 'Three']) {plan.goal = goal; history.record(plan);}
  assert.equal(history.undo()!.goal, 'Two');
  assert.equal(history.undo()!.goal, 'One');
  assert.equal(history.undo(), null);
  history.reset(createPlan());
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  history.clear();
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});
