import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBasename} from '../src/filename';

test('goal titles become readable portable filenames without changing their wording unnecessarily', () => {
  assert.equal(planBasename('My next goal'), 'My next goal');
  assert.equal(planBasename('  My\nnext\tgoal  '), 'My next goal');
  assert.equal(planBasename('Plan: work/home?'), 'Plan work home');
  assert.equal(planBasename('Finish...'), 'Finish');
  assert.equal(planBasename(''), 'suToDoku');
  assert.equal(planBasename(' ... '), 'suToDoku');
  assert.equal(planBasename('CON'), 'suToDoku - CON');
});

test('long Unicode goal names fit within filename limits without splitting characters', () => {
  for (const character of ['A', 'Ж', '目', '🎯']) {
    const title = planBasename(character.repeat(300));
    assert(new TextEncoder().encode(title).length <= 200);
    assert(!title.includes('\ufffd'));
    assert(Array.from(title).every(value => value === character));
  }
});
