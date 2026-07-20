import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseArguments } from '../cli.js';

test('parses command and repeatable CLI options', () => {
  const options = parseArguments(['diff', 'old.yaml', 'new.yaml', '--format=json', '--ignore', 'A,B', '--fail-on', 'critical']);
  assert.equal(options.baseline, 'old.yaml');
  assert.equal(options.candidate, 'new.yaml');
  assert.deepEqual(options.ignores, ['A', 'B']);
  assert.equal(options.format, 'json');
  assert.equal(options.failOn, 'critical');
});

test('CLI emits JSON and exits 1 when the high threshold is reached', () => {
  const execution = spawnSync(process.execPath, [
    resolve('dist/cli.js'), resolve('fixtures/baseline.yaml'), resolve('fixtures/candidate.yaml'), '--format', 'json'
  ], { encoding: 'utf8' });
  assert.equal(execution.status, 1, execution.stderr);
  const report = JSON.parse(execution.stdout) as { summary: { total: number } };
  assert.ok(report.summary.total > 0);
});

test('CLI returns 2 for invalid input', () => {
  const execution = spawnSync(process.execPath, [resolve('dist/cli.js'), 'missing.yaml', 'also-missing.yaml'], { encoding: 'utf8' });
  assert.equal(execution.status, 2);
  assert.match(execution.stderr, /Unable to read/);
});

test('CLI returns 0 for compatible input', () => {
  const baseline = resolve('fixtures/baseline.yaml');
  const execution = spawnSync(process.execPath, [resolve('dist/cli.js'), baseline, baseline, '--no-color'], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
  assert.match(execution.stdout, /No incompatible changes/);
});

test('CLI demo shows bundled breaking changes without failing the shell', () => {
  const execution = spawnSync(process.execPath, [resolve('dist/cli.js'), 'demo', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(execution.stdout) as { baseline: string; candidate: string; summary: { total: number } };
  assert.equal(report.baseline, 'demo/baseline.yaml');
  assert.equal(report.candidate, 'demo/candidate.yaml');
  assert.ok(report.summary.total > 0);
});

test('CLI demo respects an explicit failure threshold', () => {
  const execution = spawnSync(process.execPath, [resolve('dist/cli.js'), 'demo', '--fail-on', 'critical'], { encoding: 'utf8' });
  assert.equal(execution.status, 1, execution.stderr);
});

test('bundled Action escapes workflow-command control characters in errors', () => {
  const execution = spawnSync(process.execPath, [resolve('dist/action.cjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      INPUT_BASELINE: resolve('fixtures/baseline.yaml'),
      INPUT_CANDIDATE: 'missing\n::warning title=Injected::message',
      'INPUT_FAIL-ON': 'critical',
      INPUT_FORMAT: 'json'
    }
  });
  assert.equal(execution.status, 2);
  assert.doesNotMatch(execution.stderr, /\n::warning/);
  assert.match(execution.stderr, /%0A::warning/);
});

test('parses dash output target in all three spellings', () => {
  for (const args of [
    ['a.yaml', 'b.yaml', '--output', '-'],
    ['a.yaml', 'b.yaml', '-o', '-'],
    ['a.yaml', 'b.yaml', '--output=-']
  ]) {
    assert.equal(parseArguments(args).output, '-', args.join(' '));
  }
});

test('CLI --output - writes the report to stdout and creates no dash file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'specsentinel-cli-'));
  try {
    const execution = spawnSync(process.execPath, [
      resolve('dist/cli.js'), resolve('fixtures/baseline.yaml'), resolve('fixtures/candidate.yaml'),
      '--format', 'json', '--output', '-'
    ], { encoding: 'utf8', cwd: directory });
    assert.equal(execution.status, 1, execution.stderr); // threshold behaviour unchanged
    assert.ok(execution.stdout.endsWith('}\n'), 'report plus one trailing newline');
    const report = JSON.parse(execution.stdout) as { summary: { total: number } };
    assert.ok(report.summary.total > 0);
    assert.equal(existsSync(join(directory, '-')), false, 'no dash-named file');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
