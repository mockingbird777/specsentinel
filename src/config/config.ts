import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { SpecSentinelError } from '../errors.js';
import { isObject, severityOrder, type Change, type IgnoreEntry, type OutputFormat, type SentinelConfig } from '../types.js';

const formats: OutputFormat[] = ['terminal', 'json', 'markdown', 'sarif', 'html'];

export async function loadConfig(filePath: string): Promise<SentinelConfig> {
  let value: unknown;
  try {
    value = YAML.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new SpecSentinelError(`Unable to load config ${filePath}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
  if (!isObject(value)) throw new SpecSentinelError(`Config ${filePath} must contain an object`);
  if (value.failOn !== undefined && !severityOrder.includes(value.failOn as never)) {
    throw new SpecSentinelError(`Invalid failOn value in ${filePath}`);
  }
  if (value.format !== undefined && !formats.includes(value.format as OutputFormat)) {
    throw new SpecSentinelError(`Invalid format value in ${filePath}`);
  }
  if (value.ignoreRules !== undefined && (!Array.isArray(value.ignoreRules) || !value.ignoreRules.every((item) => typeof item === 'string'))) {
    throw new SpecSentinelError(`ignoreRules in ${filePath} must be an array of rule IDs`);
  }
  if (value.ignores !== undefined && (!Array.isArray(value.ignores) || !value.ignores.every(validIgnore))) {
    throw new SpecSentinelError(`ignores in ${filePath} must contain { rule, location? } entries`);
  }
  return value as SentinelConfig;
}

function validIgnore(value: unknown): value is IgnoreEntry {
  return isObject(value) && typeof value.rule === 'string' && (value.location === undefined || typeof value.location === 'string');
}

function wildcardMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

export function filterIgnored(changes: Change[], config: SentinelConfig, cliRules: string[] = []): Change[] {
  const ruleIds = new Set([...(config.ignoreRules ?? []), ...cliRules]);
  return changes.filter((change) => {
    if (ruleIds.has(change.ruleId)) return false;
    return !(config.ignores ?? []).some((ignore) =>
      wildcardMatches(ignore.rule, change.ruleId) &&
      (ignore.location === undefined || wildcardMatches(ignore.location, change.location))
    );
  });
}
