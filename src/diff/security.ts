import { SpecSentinelError } from '../errors.js';
import { isObject, type JsonObject } from '../types.js';

type SecurityOption = Map<string, Set<string>>;

function normalize(value: unknown): SecurityOption[] {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return [new Map()];
  if (!Array.isArray(value)) throw new SpecSentinelError('OpenAPI security must be an array of security requirement objects');
  const options: SecurityOption[] = [];
  for (const item of value) {
    if (!isObject(item)) throw new SpecSentinelError('OpenAPI security entries must be objects');
    const option: SecurityOption = new Map();
    for (const [scheme, scopes] of Object.entries(item)) {
      if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) {
        throw new SpecSentinelError(`Security requirement '${scheme}' must contain an array of scope names`);
      }
      option.set(scheme, new Set(scopes));
    }
    options.push(option);
  }
  return options;
}

/** True when candidate credentials are a subset of credentials already required by baseline. */
function noStricter(candidate: SecurityOption, baseline: SecurityOption): boolean {
  for (const [scheme, candidateScopes] of candidate) {
    const baselineScopes = baseline.get(scheme);
    if (!baselineScopes) return false;
    for (const scope of candidateScopes) {
      if (!baselineScopes.has(scope)) return false;
    }
  }
  return true;
}

export function securityStrengthened(baseline: unknown, candidate: unknown): boolean {
  const beforeOptions = normalize(baseline);
  const afterOptions = normalize(candidate);
  return beforeOptions.some((before) => !afterOptions.some((after) => noStricter(after, before)));
}

export function effectiveSecurity(document: JsonObject, operation: JsonObject): unknown {
  return Object.prototype.hasOwnProperty.call(operation, 'security') ? operation.security : document.security;
}
