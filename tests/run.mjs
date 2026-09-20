import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const specs = ['smoke', 'exports-pptx', 'exports-images', 'review', 'workflow', 'editor-ui', 'workspace', 'usefulness', 'simplicity', 'appearance', 'deep-ui', 'pptx-compat', 'pptx-import', 'editing-reliability'];

const artifactsRoot = 'artifacts/tests';
const only = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));

async function loadSpecs() {
  const registry = [];
  for (const name of specs) {
    if (only.length && !only.includes(name)) continue;
    const module = await import(`./specs/${name}.mjs`);
    module.default((testName, fn) => registry.push({ spec: name, name: testName, fn }));
  }
  return registry;
}

async function main() {
  await rm(artifactsRoot, { recursive: true, force: true });
  await mkdir(artifactsRoot, { recursive: true });
  const tests = await loadSpecs();
  if (!tests.length) {
    console.error('No tests matched', only);
    process.exit(1);
  }

  const server = await createServer({ server: { host: '127.0.0.1', port: 4178, strictPort: true }, logLevel: 'warn' });
  await server.listen();
  const baseUrl = 'http://127.0.0.1:4178/';

  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const results = [];

  try {
    for (const test of tests) {
      const dir = path.join(artifactsRoot, test.spec);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const started = Date.now();
      try {
        await test.fn({ page, context, browser, baseUrl, dir, artifactsRoot });
        results.push({ spec: test.spec, name: test.name, ok: true, ms: Date.now() - started });
        console.log(`  ok   ${test.spec} › ${test.name}`);
      } catch (error) {
        results.push({ spec: test.spec, name: test.name, ok: false, ms: Date.now() - started, error: error.stack || String(error) });
        console.error(`  FAIL ${test.spec} › ${test.name}`);
        console.error(String(error.stack || error).split('\n').slice(0, 12).join('\n'));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const failed = results.filter((result) => !result.ok);
  await writeFile(
    path.join(artifactsRoot, 'report.json'),
    `${JSON.stringify({ ranAt: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2)}\n`,
  );
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error(`\nFailures:\n${failed.map((result) => `- ${result.spec} › ${result.name}`).join('\n')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
