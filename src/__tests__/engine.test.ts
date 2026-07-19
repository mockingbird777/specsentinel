import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { filterIgnored } from '../config/config.js';
import { diffOpenApi, makeResult } from '../diff/engine.js';
import { loadOpenApi, parseOpenApi } from '../loader.js';
import { resolveObject, resolvePointer } from '../ref.js';
import { formatResult } from '../reporters/index.js';
import type { Change } from '../types.js';

async function fixtureDiff() {
  const [baseline, candidate] = await Promise.all([
    loadOpenApi(resolve('fixtures/baseline.yaml')),
    loadOpenApi(resolve('fixtures/candidate.yaml'))
  ]);
  return diffOpenApi({
    baseline: baseline.document, candidate: candidate.document,
    baselineSource: baseline.source, candidateSource: candidate.source,
    generatedAt: '2026-01-01T00:00:00.000Z'
  });
}

test('detects operation, parameter, schema, response, and security breaks through local refs', async () => {
  const result = await fixtureDiff();
  const ids = new Set(result.changes.map((change) => change.ruleId));
  for (const expected of [
    'PATH_REMOVED', 'OPERATION_REMOVED', 'PARAM_REQUIRED_ADDED', 'PARAM_TYPE_CHANGED',
    'PARAM_ENUM_NARROWED', 'REQUEST_BODY_REQUIRED', 'REQUEST_PROPERTY_REQUIRED',
    'REQUEST_TYPE_CHANGED', 'RESPONSE_REMOVED', 'RESPONSE_PROPERTY_REMOVED',
    'RESPONSE_TYPE_CHANGED', 'SECURITY_STRENGTHENED'
  ]) assert.ok(ids.has(expected), `missing ${expected}`);
  assert.ok(result.changes.some((change) => change.location.includes('Pet') === false && change.message.includes("Response property 'tag'")));
  assert.equal(result.summary.total, result.changes.length);
  assert.ok(result.summary.bySeverity.critical >= 2);
});

test('does not report compatible identical contracts', () => {
  const document = parseOpenApi(`openapi: 3.0.3\ninfo: {title: T, version: 1}\npaths: {}`);
  const result = diffOpenApi({ baseline: document, candidate: document, generatedAt: 'fixed' });
  assert.equal(result.summary.total, 0);
});

test('detects an existing parameter becoming required', () => {
  const baseline = parseOpenApi(`
openapi: 3.0.3
info: { title: T, version: '1' }
paths:
  /search:
    get:
      parameters:
        - { name: q, in: query, required: false, schema: { type: string } }
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  const paths = candidate.paths as Record<string, Record<string, Record<string, unknown>>>;
  const parameters = paths['/search']?.get?.parameters as Array<Record<string, unknown>>;
  if (parameters[0]) parameters[0].required = true;
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(result.changes.filter((change) => change.ruleId === 'PARAM_REQUIRED_ADDED').length, 1);
});

test('does not flag security that becomes weaker by adding anonymous access', () => {
  const baseline = parseOpenApi(`
openapi: 3.0.3
info: { title: T, version: '1' }
security: [{ ApiKey: [] }]
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  candidate.security = [{ ApiKey: [] }, {}];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.ok(!result.changes.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));
});

test('detects removed security alternatives and added scopes, and rejects malformed requirements', () => {
  const baseline = parseOpenApi(`
openapi: 3.0.3
info: { title: T, version: '1' }
security: [{ OAuth: [read] }, { ApiKey: [] }]
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  candidate.security = [{ OAuth: ['read', 'write'] }];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.ok(result.changes.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));
  candidate.security = [{ OAuth: 'read' }];
  assert.throws(() => diffOpenApi({ baseline, candidate, generatedAt: 'fixed' }), /array of scope names/);
});

test('supports rule and location-scoped suppressions', async () => {
  const result = await fixtureDiff();
  const filtered = filterIgnored(result.changes, {
    ignoreRules: ['SECURITY_STRENGTHENED'],
    ignores: [{ rule: 'PATH_*', location: '#/paths/~1legacy' }]
  });
  assert.ok(!filtered.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));
  assert.ok(!filtered.some((change) => change.ruleId === 'PATH_REMOVED'));
  assert.ok(filtered.length < result.changes.length);
});

test('renders machine-readable JSON and SARIF plus Markdown and standalone HTML', async () => {
  const result = await fixtureDiff();
  const json = JSON.parse(formatResult(result, 'json')) as { changes: unknown[] };
  const sarif = JSON.parse(formatResult(result, 'sarif')) as { version: string; runs: unknown[] };
  assert.equal(json.changes.length, result.changes.length);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs.length, 1);
  assert.match(formatResult(result, 'markdown'), /\| Severity \| Rule \|/);
  assert.match(formatResult(result, 'html'), /<!doctype html>/);
  assert.match(formatResult(makeResult({ baseline: {}, candidate: {}, generatedAt: 'fixed' }, []), 'html'), /No incompatible changes/);
});

test('rejects documents that are not OpenAPI 3.x', () => {
  assert.throws(() => parseOpenApi('swagger: "2.0"\npaths: {}'), /not an OpenAPI 3\.x/);
});

test('resolves URI-fragment JSON Pointers and chained refs without prototype traversal', () => {
  const document = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
paths: {}
components:
  schemas:
    Base: { type: string, description: base }
    Alias: { $ref: '#/components/schemas/Base', description: alias }
    Outer: { $ref: '#/components/schemas/Alias', title: outer }
`);
  assert.equal(resolvePointer(document, '#/components%2Fschemas%2FBase'), (document.components as Record<string, Record<string, unknown>>).schemas?.Base);
  assert.deepEqual(resolveObject(document, { $ref: '#/components/schemas/Outer' }), {
    type: 'string', description: 'alias', title: 'outer'
  });
  assert.throws(() => resolvePointer(document, '#/constructor'), /Unresolvable local \$ref/);
  assert.throws(() => resolvePointer(document, '#/%ZZ'), /Invalid percent-encoding/);
});

test('handles recursive refs once and uses RFC 6901 locations for property names', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
paths:
  /nodes:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json: { schema: { $ref: '#/components/schemas/Node' } }
components:
  schemas:
    Node:
      type: object
      properties:
        a/b~c: { type: string }
        next: { $ref: '#/components/schemas/Node' }
`);
  const candidate = structuredClone(baseline);
  const schemas = (candidate.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
  delete (schemas?.Node?.properties as Record<string, unknown>)['a/b~c'];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  const removals = result.changes.filter((change) => change.ruleId === 'RESPONSE_PROPERTY_REMOVED');
  assert.equal(removals.length, 1);
  assert.match(removals[0]?.location ?? '', /a~1b~0c$/);
});

test('detects removed request media types and preserves parameter names containing colons', () => {
  const baseline = parseOpenApi(`
openapi: 3.0.3
info: { title: T, version: '1' }
paths:
  /search:
    post:
      parameters:
        - { name: 'filter:mode', in: query, schema: { type: string } }
      requestBody:
        content:
          application/json: { schema: { type: object } }
      responses: { '204': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  const operation = (candidate.paths as Record<string, Record<string, Record<string, unknown>>>)['/search']?.post;
  const parameter = (operation?.parameters as Array<Record<string, unknown>>)[0];
  if (parameter) parameter.required = true;
  (operation?.requestBody as Record<string, unknown>).content = {};
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.ok(result.changes.some((change) => change.ruleId === 'REQUEST_CONTENT_REMOVED'));
  assert.ok(result.changes.some((change) => change.ruleId === 'PARAM_REQUIRED_ADDED' && change.message.includes("'filter:mode'")));
});

test('escapes untrusted report fields in Markdown and standalone HTML', () => {
  const change: Change = {
    ruleId: 'PATH_REMOVED', severity: 'critical', location: '#/paths/`x|y',
    message: '<img src=x onerror=alert(1)>\n# injected'
  };
  const result = makeResult({ baseline: {}, candidate: {}, baselineSource: 'old`\n# heading', candidateSource: '</script><script>alert(1)</script>', generatedAt: 'fixed' }, [change]);
  const markdown = formatResult(result, 'markdown');
  assert.doesNotMatch(markdown, /<img|\n# injected|\n# heading/);
  assert.match(markdown, /&lt;img/);
  assert.match(markdown, /&#124;/);
  const html = formatResult(result, 'html');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script>/);
  change.message = '\u001b]8;;https://example.invalid\u0007click\nnext';
  const terminal = formatResult(makeResult({ baseline: {}, candidate: {}, generatedAt: 'fixed' }, [change]), 'terminal', { color: false });
  assert.doesNotMatch(terminal, /\u001b|\u0007/);
  assert.match(terminal, /\\u001b.*\\u0007.*\\nnext/);
});
