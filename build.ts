import { dependencies, version } from './package.json';
import { chmod, copyFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';

// Build freee CLI entry point
const freeeBinFile = './bin/freee.js';
const freeeResult = await Bun.build({
  entrypoints: ['src/cli-app/entry.ts'],
  external: Object.keys(dependencies),
  minify: true,
  target: 'node',
  format: 'esm',
  outdir: '.',
  naming: { entry: freeeBinFile },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(version),
  },
  banner: '#! /usr/bin/env node\n',
});

if (!freeeResult.success) {
  console.error('Build failed (freee CLI):');
  for (const log of freeeResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

await chmod(freeeBinFile, 0o755);
console.log(`Built ${freeeBinFile}`);

// Copy minimal schema files to dist for npm package
const minimalSrcDir = './openapi/minimal';
const minimalDestDir = './dist/openapi/minimal';
await mkdir(minimalDestDir, { recursive: true });

const minimalFiles = await readdir(minimalSrcDir);
for (const file of minimalFiles) {
  if (file.endsWith('.json')) {
    await copyFile(join(minimalSrcDir, file), join(minimalDestDir, file));
  }
}
console.log(`Copied ${minimalFiles.filter(f => f.endsWith('.json')).length} minimal schema files to dist/`);

// Copy full schema files to dist for --help/--spec
const fullSrcDir = './openapi';
const fullDestDir = './dist/openapi';
const fullFiles = await readdir(fullSrcDir);
let fullCopyCount = 0;
for (const file of fullFiles) {
  if (file.endsWith('-api-schema.json')) {
    await copyFile(join(fullSrcDir, file), join(fullDestDir, file));
    fullCopyCount++;
  }
}
console.log(`Copied ${fullCopyCount} full schema files to dist/`);
