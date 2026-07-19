import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
