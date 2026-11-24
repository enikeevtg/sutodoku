import {readFile} from 'node:fs/promises';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const license = await readFile(new URL('./LICENSE', import.meta.url), 'utf8');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2020',
  outfile: 'main.js',
  sourcemap: watch ? 'inline' : false,
  banner: {js: `/*\n${license.trimEnd()}\n*/`},
});

if (watch) {
  await context.watch();
} else {
  try {
    await context.rebuild();
  } finally {
    await context.dispose();
  }
}
