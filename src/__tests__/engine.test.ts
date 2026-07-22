import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { filterIgnored } from '../config/config.js';
import { diffOpenApi, makeResult } from '../diff/engine.js';
import { loadOpenApi, parseOpenApi } from '../loader.js';
import { resolveObject, resolvePointer } from '../ref.js';
import { formatResult } from '../reporters/index.js';
import type { Change, JsonObject } from '../types.js';

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
    'RESPONSE_TYPE_CHANGED', 'SECURITY_STRENGTHENED', 'SECURITY_ACCESS_BROADENED'
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

test('detects document-level security becoming anonymous through an empty security array', () => {
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
  candidate.security = [];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  const broadened = result.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED');
  assert.equal(broadened.length, 1);
  assert.match(broadened[0]?.message ?? '', /anonymously reachable under the candidate OpenAPI contract/);
  assert.deepEqual(broadened[0]?.before, [{ ApiKey: [] }]);
  assert.deepEqual(broadened[0]?.after, []);
  assert.ok(!result.changes.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));
});

test('detects an operation override that adds an anonymous security alternative', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
security: [{ ApiKey: [] }]
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  const get = ((candidate.paths as Record<string, JsonObject>)['/status'] as JsonObject).get as JsonObject;
  get.security = [{ ApiKey: [] }, {}];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(result.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED').length, 1);
  assert.ok(!result.changes.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));
});

test('detects removed OAuth scopes and a newly added weaker OR alternative', () => {
  const scopedBaseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
security: [{ OAuth: [read, write] }]
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const scopedCandidate = structuredClone(scopedBaseline);
  scopedCandidate.security = [{ OAuth: ['read'] }];
  const scoped = diffOpenApi({ baseline: scopedBaseline, candidate: scopedCandidate, generatedAt: 'fixed' });
  assert.equal(scoped.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED').length, 1);
  assert.ok(!scoped.changes.some((change) => change.ruleId === 'SECURITY_STRENGTHENED'));

  const alternativeBaseline = structuredClone(scopedBaseline);
  alternativeBaseline.security = [{ ApiKey: [], OAuth: ['read'] }];
  const alternativeCandidate = structuredClone(alternativeBaseline);
  alternativeCandidate.security = [
    { ApiKey: [], OAuth: ['read'] },
    { ApiKey: [] },
  ];
  const alternative = diffOpenApi({ baseline: alternativeBaseline, candidate: alternativeCandidate, generatedAt: 'fixed' });
  assert.equal(alternative.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED').length, 1);
});

test('does not report equivalent reordered security alternatives or a redundant stronger alternative', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
security:
  - OAuth: [read, write]
  - ApiKey: []
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  candidate.security = [
    { ApiKey: [] },
    { OAuth: ['write', 'read'] },
    { ApiKey: [], OAuth: ['admin'] },
  ];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(result.changes.filter((change) => change.ruleId.startsWith('SECURITY_')).length, 0);
});

test('reports incomparable scheme replacement in deterministic rule order', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
security: [{ ApiKey: [] }]
paths:
  /status:
    get:
      responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  candidate.security = [{ OAuth: ['read'] }];
  const first = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  const second = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.changes.map((change) => change.ruleId),
    ['SECURITY_ACCESS_BROADENED', 'SECURITY_STRENGTHENED'],
  );
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
  const html = formatResult(result, 'html');
  assert.match(html, /<!doctype html>/);
  for (const metadata of [
    '<meta name="description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="SpecSentinel · OpenAPI contract report">',
    '<meta property="og:description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">',
    '<meta name="twitter:card" content="summary">',
    '<meta name="twitter:title" content="SpecSentinel · OpenAPI contract report">',
    '<meta name="twitter:description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">'
  ]) assert.ok(html.includes(metadata), `missing metadata: ${metadata}`);
  assert.doesNotMatch(html, /(?:og:image|twitter:image)/);
  assert.match(html, /<a href="https:\/\/github\.com\/mockingbird777\/specsentinel" target="_blank" rel="noopener noreferrer">Explore SpecSentinel on GitHub ↗<\/a>/);
  assert.doesNotMatch(html, /<(?:script|img|link)\b[^>]*(?:src|href)="https?:\/\//);
  assert.match(formatResult(makeResult({ baseline: {}, candidate: {}, generatedAt: 'fixed' }, []), 'html'), /No breaking or security-sensitive changes/);
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

test('detects security access broadening through local path-item refs and rejects external refs', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
paths:
  /status: { $ref: '#/components/pathItems/Status' }
components:
  pathItems:
    Status:
      get:
        security: [{ OpenID: [profile, email] }]
        responses: { '200': { description: OK } }
`);
  const candidate = structuredClone(baseline);
  const pathItems = (candidate.components as Record<string, Record<string, JsonObject>>).pathItems;
  const get = pathItems?.Status?.get as JsonObject;
  get.security = [{ OpenID: ['profile'] }];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(result.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED').length, 1);

  const external = structuredClone(candidate);
  (external.paths as Record<string, unknown>)['/status'] = { $ref: './paths.yaml#/Status' };
  assert.throws(
    () => diffOpenApi({ baseline, candidate: external, generatedAt: 'fixed' }),
    /External \$ref is not supported/,
  );
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

function docWithRequestType(typeYaml: string): string {
  return [
    'openapi: 3.1.0',
    "info: { title: T, version: '1' }",
    'paths:',
    '  /widgets:',
    '    post:',
    '      requestBody:',
    '        content:',
    '          application/json:',
    '            schema:',
    '              type: object',
    '              properties:',
    `                name: { type: ${typeYaml} }`,
    "      responses: { '200': { description: OK } }",
  ].join('\n');
}

function docWithResponseType(typeYaml: string): string {
  return [
    'openapi: 3.1.0',
    "info: { title: T, version: '1' }",
    'paths:',
    '  /widgets:',
    '    get:',
    '      responses:',
    "        '200':",
    '          description: OK',
    '          content:',
    '            application/json:',
    '              schema:',
    '                type: object',
    '                properties:',
    `                  name: { type: ${typeYaml} }`,
  ].join('\n');
}

test('reordering type-union members does not report a request TYPE_CHANGED finding', () => {
  const baseline = parseOpenApi(docWithRequestType('[string, "null"]'));
  const candidate = parseOpenApi(docWithRequestType('["null", string]'));
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(
    result.changes.filter((change) => change.ruleId === 'REQUEST_TYPE_CHANGED').length,
    0,
  );
});

test('reordering type-union members does not report a response TYPE_CHANGED finding', () => {
  const baseline = parseOpenApi(docWithResponseType('[string, "null"]'));
  const candidate = parseOpenApi(docWithResponseType('["null", string]'));
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(
    result.changes.filter((change) => change.ruleId === 'RESPONSE_TYPE_CHANGED').length,
    0,
  );
});

test('adding a real union member still reports a request TYPE_CHANGED finding', () => {
  const baseline = parseOpenApi(docWithRequestType('[string]'));
  const candidate = parseOpenApi(docWithRequestType('[string, "null"]'));
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(
    result.changes.filter((change) => change.ruleId === 'REQUEST_TYPE_CHANGED').length,
    1,
  );
});

test('removing a real union member still reports a response TYPE_CHANGED finding', () => {
  const baseline = parseOpenApi(docWithResponseType('[string, "null"]'));
  const candidate = parseOpenApi(docWithResponseType('[string]'));
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(
    result.changes.filter((change) => change.ruleId === 'RESPONSE_TYPE_CHANGED').length,
    1,
  );
});

test('type-union reordering is order-insensitive for JSON input too', () => {
  const baselineJson = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'T', version: '1' },
    paths: {
      '/widgets': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { name: { type: ['string', 'null'] } } },
              },
            },
          },
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  });
  const candidateJson = baselineJson.replace('["string","null"]', '["null","string"]');
  const result = diffOpenApi({
    baseline: parseOpenApi(baselineJson),
    candidate: parseOpenApi(candidateJson),
    generatedAt: 'fixed',
  });
  assert.equal(
    result.changes.filter((change) => change.ruleId === 'REQUEST_TYPE_CHANGED').length,
    0,
  );
});

test('type-union reordering is order-insensitive for parameter schemas and local refs', () => {
  const baseline = parseOpenApi(`
openapi: 3.1.0
info: { title: T, version: '1' }
paths:
  /widgets:
    get:
      parameters:
        - name: filter
          in: query
          schema: { $ref: '#/components/schemas/Filter' }
      responses: { '200': { description: OK } }
components:
  schemas:
    Filter: { type: [string, "null"] }
`);
  const candidate = structuredClone(baseline);
  const schemas = (candidate.components as Record<string, Record<string, JsonObject>>).schemas;
  if (schemas?.Filter) schemas.Filter.type = ['null', 'string'];
  const reordered = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(reordered.changes.filter((change) => change.ruleId === 'PARAM_TYPE_CHANGED').length, 0);

  if (schemas?.Filter) schemas.Filter.type = ['string'];
  const narrowed = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(narrowed.changes.filter((change) => change.ruleId === 'PARAM_TYPE_CHANGED').length, 1);
});

test('renders hostile security requirement names safely in every report format', () => {
  const hostile = '</script><script>globalThis.compromised=true</script>\u001b';
  const baseline = parseOpenApi(JSON.stringify({
    openapi: '3.1.0', info: { title: 'T', version: '1' },
    paths: {
      '/status': {
        get: {
          security: [{ [hostile]: [], ApiKey: [] }],
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  }));
  const candidate = structuredClone(baseline);
  const get = ((candidate.paths as Record<string, JsonObject>)['/status'] as JsonObject).get as JsonObject;
  get.security = [{ [hostile]: [] }];
  const result = diffOpenApi({ baseline, candidate, generatedAt: 'fixed' });
  assert.equal(result.changes.filter((change) => change.ruleId === 'SECURITY_ACCESS_BROADENED').length, 1);

  const json = formatResult(result, 'json');
  assert.equal((JSON.parse(json) as { changes: Change[] }).changes[0]?.ruleId, 'SECURITY_ACCESS_BROADENED');
  assert.match(formatResult(result, 'markdown'), /SECURITY_ACCESS_BROADENED/);
  const html = formatResult(result, 'html');
  assert.match(html, /SECURITY_ACCESS_BROADENED/);
  assert.doesNotMatch(html, /<script>globalThis\.compromised/);
  assert.match(html, /\\u003c\/script>/);
  const terminal = formatResult(result, 'terminal', { color: false });
  assert.match(terminal, /SECURITY_ACCESS_BROADENED/);
  assert.doesNotMatch(terminal, /\u001b/);

  const sarif = JSON.parse(formatResult(result, 'sarif')) as {
    runs: Array<{ tool: { driver: { rules: Array<{ properties: { tags: string[] } }> } } }>;
  };
  assert.deepEqual(sarif.runs[0]?.tool.driver.rules[0]?.properties.tags, ['openapi', 'security']);
});
