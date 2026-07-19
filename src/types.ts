export const severityOrder = ['info', 'low', 'medium', 'high', 'critical'] as const;

export type Severity = (typeof severityOrder)[number];
export type OutputFormat = 'terminal' | 'json' | 'markdown' | 'sarif' | 'html';
export type JsonObject = Record<string, unknown>;

export interface Change {
  ruleId: string;
  severity: Severity;
  location: string;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffSummary {
  total: number;
  bySeverity: Record<Severity, number>;
  byRule: Record<string, number>;
}

export interface DiffResult {
  tool: 'SpecSentinel';
  version: string;
  baseline: string;
  candidate: string;
  generatedAt: string;
  summary: DiffSummary;
  changes: Change[];
}

export interface IgnoreEntry {
  rule: string;
  location?: string;
}

export interface SentinelConfig {
  failOn?: Severity;
  format?: OutputFormat;
  ignoreRules?: string[];
  ignores?: IgnoreEntry[];
}

export interface RuleDefinition {
  id: string;
  title: string;
  description: string;
  defaultSeverity: Severity;
}

export function severityAtLeast(value: Severity, threshold: Severity): boolean {
  return severityOrder.indexOf(value) >= severityOrder.indexOf(threshold);
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
