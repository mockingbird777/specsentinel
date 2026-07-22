import { ruleList } from '../rules.js';
import type { DiffResult, Severity } from '../types.js';

function level(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

export function sarifReport(result: DiffResult): string {
  const used = new Set(result.changes.map((change) => change.ruleId));
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'SpecSentinel', version: result.version,
          informationUri: 'https://github.com/mockingbird777/specsentinel',
          rules: ruleList.filter((rule) => used.has(rule.id)).map((rule) => ({
            id: rule.id, name: rule.title.replaceAll(' ', ''),
            shortDescription: { text: rule.title }, fullDescription: { text: rule.description },
            defaultConfiguration: { level: level(rule.defaultSeverity) },
            properties: {
              severity: rule.defaultSeverity,
              tags: rule.id.startsWith('SECURITY_') ? ['openapi', 'security'] : ['openapi', 'compatibility']
            }
          }))
        }
      },
      artifacts: [{ location: { uri: result.candidate } }],
      results: result.changes.map((change) => ({
        ruleId: change.ruleId, level: level(change.severity), message: { text: change.message },
        locations: [{
          physicalLocation: { artifactLocation: { uri: result.candidate } },
          logicalLocations: [{ fullyQualifiedName: change.location, kind: 'OpenAPI JSON Pointer' }]
        }],
        properties: { severity: change.severity, location: change.location, before: change.before, after: change.after }
      }))
    }]
  }, null, 2);
}
