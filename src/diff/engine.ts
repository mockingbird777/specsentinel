import { resolveObject, pointerPart } from '../ref.js';
import { rules } from '../rules.js';
import { isObject, severityOrder, type Change, type DiffResult, type DiffSummary, type JsonObject, type Severity } from '../types.js';
import { compareRequestSchema, compareResponseSchema } from './schema.js';
import { effectiveSecurity, securityStrengthened } from './security.js';

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export interface DiffInput {
  baseline: JsonObject;
  candidate: JsonObject;
  baselineSource?: string;
  candidateSource?: string;
  generatedAt?: string;
}

function add(changes: Change[], ruleId: string, location: string, message: string, before?: unknown, after?: unknown): void {
  const definition = rules[ruleId];
  if (!definition) throw new Error(`Unknown rule ${ruleId}`);
  const change: Change = { ruleId, severity: definition.defaultSeverity, location, message };
  if (before !== undefined) change.before = before;
  if (after !== undefined) change.after = after;
  changes.push(change);
}

function records(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

interface NamedParameter {
  parameter: JsonObject;
  where: string;
  name: string;
}

function parameterMap(document: JsonObject, pathItem: JsonObject, operation: JsonObject): Map<string, NamedParameter> {
  const result = new Map<string, NamedParameter>();
  const entries = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : [])
  ];
  for (const entry of entries) {
    const parameter = resolveObject(document, entry);
    if (!parameter || typeof parameter.name !== 'string' || typeof parameter.in !== 'string') continue;
    const where = parameter.in;
    const name = parameter.name;
    result.set(JSON.stringify([where, name]), { parameter, where, name });
  }
  return result;
}

function parameterSchema(document: JsonObject, parameter: JsonObject): JsonObject | undefined {
  return resolveObject(document, parameter.schema);
}

function compareParameters(
  baseline: JsonObject, candidate: JsonObject,
  beforePath: JsonObject, afterPath: JsonObject,
  beforeOperation: JsonObject, afterOperation: JsonObject,
  operationLocation: string, changes: Change[]
): void {
  const beforeParameters = parameterMap(baseline, beforePath, beforeOperation);
  const afterParameters = parameterMap(candidate, afterPath, afterOperation);

  for (const [key, afterEntry] of afterParameters) {
    const beforeEntry = beforeParameters.get(key);
    const { parameter: afterParameter, where, name } = afterEntry;
    const beforeParameter = beforeEntry?.parameter;
    const location = `${operationLocation}/parameters/${pointerPart(where)}/${pointerPart(name)}`;
    if (!beforeParameter) {
      if (afterParameter.required === true) {
        add(changes, 'PARAM_REQUIRED_ADDED', location, `Required ${where} parameter '${name}' was added.`, undefined, afterParameter);
      }
      continue;
    }
    if (afterParameter.required === true && beforeParameter.required !== true) {
      add(changes, 'PARAM_REQUIRED_ADDED', location, `${where} parameter '${name}' is now required.`, beforeParameter.required ?? false, true);
    }
    const beforeSchema = parameterSchema(baseline, beforeParameter);
    const afterSchema = parameterSchema(candidate, afterParameter);
    const beforeType = beforeSchema?.type;
    const afterType = afterSchema?.type;
    if (beforeType !== undefined && afterType !== undefined && JSON.stringify(beforeType) !== JSON.stringify(afterType)) {
      add(changes, 'PARAM_TYPE_CHANGED', `${location}/schema/type`, `Parameter '${name}' type changed from ${JSON.stringify(beforeType)} to ${JSON.stringify(afterType)}.`, beforeType, afterType);
    }
    const beforeEnum = Array.isArray(beforeSchema?.enum) ? beforeSchema.enum : undefined;
    const afterEnum = Array.isArray(afterSchema?.enum) ? afterSchema.enum : undefined;
    const removedValues = beforeEnum && afterEnum
      ? beforeEnum.filter((value) => !afterEnum.some((candidateValue) => JSON.stringify(candidateValue) === JSON.stringify(value)))
      : beforeEnum === undefined && afterEnum ? ['<previously unrestricted>'] : [];
    if (removedValues.length > 0) {
      add(changes, 'PARAM_ENUM_NARROWED', `${location}/schema/enum`, `Parameter '${name}' no longer accepts all baseline values.`, beforeEnum, afterEnum);
    }
  }
}

function compareRequestBody(
  baseline: JsonObject, candidate: JsonObject,
  beforeOperation: JsonObject, afterOperation: JsonObject,
  operationLocation: string, changes: Change[]
): void {
  const beforeBody = resolveObject(baseline, beforeOperation.requestBody);
  const afterBody = resolveObject(candidate, afterOperation.requestBody);
  if (afterBody?.required === true && beforeBody?.required !== true) {
    add(changes, 'REQUEST_BODY_REQUIRED', `${operationLocation}/requestBody`, 'Request body is now required.', beforeBody?.required ?? false, true);
  }
  if (!beforeBody || !afterBody) return;
  const beforeContent = records(beforeBody.content);
  const afterContent = records(afterBody.content);
  for (const [mediaType, beforeMediaValue] of Object.entries(beforeContent)) {
    const contentLocation = `${operationLocation}/requestBody/content/${pointerPart(mediaType)}`;
    if (!(mediaType in afterContent)) {
      add(changes, 'REQUEST_CONTENT_REMOVED', contentLocation, `Request media type '${mediaType}' was removed.`, beforeMediaValue, undefined);
      continue;
    }
    const beforeMedia = resolveObject(baseline, beforeMediaValue);
    const afterMedia = resolveObject(candidate, afterContent[mediaType]);
    if (!beforeMedia || !afterMedia || beforeMedia.schema === undefined || afterMedia.schema === undefined) continue;
    compareRequestSchema(beforeMedia.schema, afterMedia.schema, {
      baseline, candidate, changes, seen: new Set(),
      location: `${contentLocation}/schema`
    });
  }
}

function compareResponses(
  baseline: JsonObject, candidate: JsonObject,
  beforeOperation: JsonObject, afterOperation: JsonObject,
  operationLocation: string, changes: Change[]
): void {
  const beforeResponses = records(beforeOperation.responses);
  const afterResponses = records(afterOperation.responses);
  for (const [status, beforeResponseValue] of Object.entries(beforeResponses)) {
    const responseLocation = `${operationLocation}/responses/${pointerPart(status)}`;
    if (!(status in afterResponses)) {
      add(changes, 'RESPONSE_REMOVED', responseLocation, `Response '${status}' was removed.`, beforeResponseValue, undefined);
      continue;
    }
    const beforeResponse = resolveObject(baseline, beforeResponseValue);
    const afterResponse = resolveObject(candidate, afterResponses[status]);
    if (!beforeResponse || !afterResponse) continue;
    const beforeContent = records(beforeResponse.content);
    const afterContent = records(afterResponse.content);
    for (const [mediaType, beforeMediaValue] of Object.entries(beforeContent)) {
      const contentLocation = `${responseLocation}/content/${pointerPart(mediaType)}`;
      if (!(mediaType in afterContent)) {
        add(changes, 'RESPONSE_CONTENT_REMOVED', contentLocation, `Response media type '${mediaType}' was removed.`, beforeMediaValue, undefined);
        continue;
      }
      const beforeMedia = resolveObject(baseline, beforeMediaValue);
      const afterMedia = resolveObject(candidate, afterContent[mediaType]);
      if (!beforeMedia || !afterMedia) continue;
      if (beforeMedia.schema !== undefined && afterMedia.schema === undefined) {
        add(changes, 'RESPONSE_CONTENT_REMOVED', `${contentLocation}/schema`, `Response schema for '${mediaType}' was removed.`, beforeMedia.schema, undefined);
      } else if (beforeMedia.schema !== undefined && afterMedia.schema !== undefined) {
        compareResponseSchema(beforeMedia.schema, afterMedia.schema, {
          baseline, candidate, changes, seen: new Set(), location: `${contentLocation}/schema`
        });
      }
    }
  }
}

function summary(changes: Change[]): DiffSummary {
  const bySeverity = Object.fromEntries(severityOrder.map((severity) => [severity, 0])) as Record<Severity, number>;
  const byRule: Record<string, number> = {};
  for (const change of changes) {
    bySeverity[change.severity] += 1;
    byRule[change.ruleId] = (byRule[change.ruleId] ?? 0) + 1;
  }
  return { total: changes.length, bySeverity, byRule };
}

export function makeResult(input: DiffInput, changes: Change[]): DiffResult {
  return {
    tool: 'SpecSentinel', version: '0.1.0',
    baseline: input.baselineSource ?? '<baseline>', candidate: input.candidateSource ?? '<candidate>',
    generatedAt: input.generatedAt ?? new Date().toISOString(), summary: summary(changes), changes
  };
}

export function diffOpenApi(input: DiffInput): DiffResult {
  const changes: Change[] = [];
  const beforePaths = records(input.baseline.paths);
  const afterPaths = records(input.candidate.paths);

  for (const [path, beforePathValue] of Object.entries(beforePaths)) {
    const pathLocation = `#/paths/${pointerPart(path)}`;
    if (!(path in afterPaths)) {
      add(changes, 'PATH_REMOVED', pathLocation, `Path '${path}' was removed.`, beforePathValue, undefined);
      continue;
    }
    const beforePath = resolveObject(input.baseline, beforePathValue);
    const afterPath = resolveObject(input.candidate, afterPaths[path]);
    if (!beforePath || !afterPath) continue;

    for (const method of methods) {
      const beforeOperation = resolveObject(input.baseline, beforePath[method]);
      if (!beforeOperation) continue;
      const operationLocation = `${pathLocation}/${method}`;
      const afterOperation = resolveObject(input.candidate, afterPath[method]);
      if (!afterOperation) {
        add(changes, 'OPERATION_REMOVED', operationLocation, `${method.toUpperCase()} ${path} was removed.`, beforeOperation, undefined);
        continue;
      }
      compareParameters(input.baseline, input.candidate, beforePath, afterPath, beforeOperation, afterOperation, operationLocation, changes);
      compareRequestBody(input.baseline, input.candidate, beforeOperation, afterOperation, operationLocation, changes);
      compareResponses(input.baseline, input.candidate, beforeOperation, afterOperation, operationLocation, changes);

      const beforeSecurity = effectiveSecurity(input.baseline, beforeOperation);
      const afterSecurity = effectiveSecurity(input.candidate, afterOperation);
      if (securityStrengthened(beforeSecurity, afterSecurity)) {
        add(changes, 'SECURITY_STRENGTHENED', `${operationLocation}/security`, 'Security requirements became stricter for previously valid requests.', beforeSecurity ?? [], afterSecurity ?? []);
      }
    }
  }

  changes.sort((left, right) => left.location.localeCompare(right.location) || left.ruleId.localeCompare(right.ruleId));
  return makeResult(input, changes);
}
