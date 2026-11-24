import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {buildSync} from 'esbuild';
import {createPlan, positions, clockwisePositions, Plan} from '../src/model';
import {PlanHistory} from '../src/history';

interface SvgOptions { cls?: string | string[]; attr?: Record<string, string> }

// Obsidian's SVG helper passes a string as ONE classList.add token.
// Unlike createEl, createSvg requires an array for multiple classes.
class SvgParent {
  children: {tag: string; options: SvgOptions; node: SvgParent}[] = [];
  createSvg(tag: string, options: SvgOptions = {}) {
    const classes = typeof options.cls === 'string' ? [options.cls] : options.cls ?? [];
    if (classes.some(token => !token || /\s/.test(token))) {
      throw new DOMException('Invalid class token', 'InvalidCharacterError');
    }
    const node = new SvgParent();
    this.children.push({tag, options, node});
    return node;
  }
  querySelectorAll() { return []; }
}

const bundle = buildSync({
  stdin: {
    contents: `${readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')}\nexport {MandalaView};`,
    resolveDir: fileURLToPath(new URL('../src', import.meta.url)),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false,
});
interface TestFile {basename: string; extension: string; parent: {path: string}}
interface RenameContext {
  availablePath: (base: string, extension: string) => Promise<string>;
  app: {fileManager: {renameFile: (file: TestFile, path: string) => Promise<void>}};
}
interface SaveContext {
  valid: boolean; file: TestFile; plan: Plan; history: PlanHistory; queue: Promise<void>;
  updateHistoryButtons: () => void;
  app: {vault: {modify: (file: TestFile, data: string) => Promise<void>}};
  renameFile: (file: TestFile, goal: string) => Promise<void>;
}
const module = {exports: {} as {
  MandalaView?: {prototype: {
    renderRoute: (this: {plan: Plan}, parent: SvgParent, area: number) => void;
    getDisplayText: (this: {file: TestFile | null}) => string;
    save: (this: SaveContext, recordHistory?: boolean) => void;
  }};
  default?: {prototype: {renamePlan: (this: RenameContext, file: TestFile, goal: string) => Promise<void>}};
}};
runInNewContext(bundle.outputFiles[0].text, {
  exports: module.exports, module, TextEncoder,
  require: (id: string) => {
    assert.equal(id, 'obsidian');
    return {FileView: class {}, Modal: class {}, Plugin: class {}};
  },
});

test('renaming uses the goal, preserves the folder and extension, and accepts a collision suffix', async () => {
  const file = {basename:'Old name', extension:'mandala', parent:{path:'Projects'}};
  const renamed: string[] = [];
  const context: RenameContext = {
    availablePath: async (base, extension) => {assert.equal(base, 'Projects/My goal'); assert.equal(extension, 'mandala'); return `${base} 2.${extension}`;},
    app: {fileManager: {renameFile: async (target, path) => {assert.equal(target, file); renamed.push(path); file.basename = 'My goal 2';}}},
  };
  const rename = module.exports.default!.prototype.renamePlan;
  await rename.call(context, file, 'My goal');
  await rename.call(context, file, 'My goal');
  assert.deepEqual(renamed, ['Projects/My goal 2.mandala']);
  assert.equal(module.exports.MandalaView!.prototype.getDisplayText.call({file}), 'My goal 2');
});

test('queued saves rename to their own goal snapshot, including Undo without losing Redo', async () => {
  const writes: string[][] = [], file = {basename:'Original', extension:'mandala', parent:{path:''}};
  const plan = createPlan(), history = new PlanHistory(); history.reset(plan);
  const context: SaveContext = {
    valid:true, file, plan, history, queue:Promise.resolve(), updateHistoryButtons:() => {},
    app:{vault:{modify:async (target, data) => {writes.push([target.basename, JSON.parse(data).goal]);}}},
    renameFile:async (target, goal) => {target.basename = goal;},
  };
  const save = module.exports.MandalaView!.prototype.save;
  plan.goal = 'First goal'; save.call(context);
  plan.goal = 'Second goal'; save.call(context);
  await context.queue;
  assert.deepEqual(writes, [['Original', 'First goal'], ['First goal', 'Second goal']]);
  assert.equal(file.basename, 'Second goal');
  context.plan = history.undo()!; save.call(context, false);
  await context.queue;
  assert.equal(file.basename, 'First goal');
  assert(history.canRedo);
});

test('route rendering accepts SVG classes after filling multiple cards, including empty proxies', () => {
  for (const filled of [[], ...clockwisePositions.map(cell => [cell]), [0, 1], [0, 2], [1, 8, 3], clockwisePositions]) {
    const plan = createPlan();
    filled.forEach(position => {plan.areas[0].tasks[positions.indexOf(position)].text = `Шаг ${position}`;});
    const parent = new SvgParent();
    module.exports.MandalaView!.prototype.renderRoute.call({plan}, parent, 0);
    assert.equal(parent.children.length, filled.length ? 1 : 0);
    if (!filled.length) continue;
    const lines = parent.children[0].node.children.filter(child => child.tag === 'polyline');
    assert(lines.length >= filled.length);
    assert(lines.every(line => line.options.cls?.includes('ow-route-link')));
    assert(lines.some(line => line.options.cls?.includes('ow-route-segment')));
    assert.equal(lines.some(line => line.options.cls?.includes('ow-route-proxy')), filled.length < 8 && filled.some((position, i) => i > 0 && clockwisePositions.indexOf(position) > clockwisePositions.indexOf(filled[i - 1]) + 1));
    const markers = parent.children[0].node.children.find(child => child.tag === 'defs')!.node.children;
    assert.equal(markers.length, filled.length);
    for (const line of lines.filter(line => line.options.cls?.includes('ow-route-segment'))) {
      const marker = markers.find(marker => line.options.attr?.['marker-end'] === `url(#${marker.options.attr?.id})`);
      assert(marker);
      assert.equal(marker.options.attr?.['data-from'], line.options.attr?.['data-from']);
      assert.equal(marker.options.cls, 'ow-route-arrow');
      assert.equal(marker.node.children[0].options.attr?.stroke, 'currentColor');
    }
  }
});
