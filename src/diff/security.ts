import { SpecSentinelError } from '../errors.js';
import { isObject, type JsonObject } from '../types.js';

type SecurityOption = Map<string, Set<string>>;

export interface SecurityComparison {
  strengthened: boolean;
  accessBroadened: boolean;
  becameAnonymous: boolean;
}

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

/** True when candidate requires no more schemes or scopes than baseline. */
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

function losesAcceptedAlternative(before: SecurityOption[], after: SecurityOption[]): boolean {
  return before.some((beforeOption) =>
    !after.some((afterOption) => noStricter(afterOption, beforeOption))
  );
}

function allowsAnonymous(options: SecurityOption[]): boolean {
  return options.some((option) => option.size === 0);
}

/**
 * Compares the credential/scope alternatives declared by OpenAPI. This is a
 * contract-level relation only; it does not inspect or make claims about the
 * server's authorization implementation.
 */
export function compareSecurity(baseline: unknown, candidate: unknown): SecurityComparison {
  const beforeOptions = normalize(baseline);
  const afterOptions = normalize(candidate);
  return {
    strengthened: losesAcceptedAlternative(beforeOptions, afterOptions),
    accessBroadened: losesAcceptedAlternative(afterOptions, beforeOptions),
    becameAnonymous: !allowsAnonymous(beforeOptions) && allowsAnonymous(afterOptions),
  };
}

export function securityStrengthened(baseline: unknown, candidate: unknown): boolean {
  return compareSecurity(baseline, candidate).strengthened;
}

export function securityAccessBroadened(baseline: unknown, candidate: unknown): boolean {
  return compareSecurity(baseline, candidate).accessBroadened;
}

export function effectiveSecurity(document: JsonObject, operation: JsonObject): unknown {
  return Object.prototype.hasOwnProperty.call(operation, 'security') ? operation.security : document.security;
}
