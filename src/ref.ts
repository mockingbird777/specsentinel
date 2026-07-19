import { SpecSentinelError } from './errors.js';
import { isObject, type JsonObject } from './types.js';

function decodePointerPart(part: string, reference: string): string {
  if (/~(?:[^01]|$)/.test(part)) {
    throw new SpecSentinelError(`Invalid JSON Pointer escape in local $ref: ${reference}`);
  }
  return part.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function pointerPart(part: string): string {
  return part.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function resolvePointer(document: JsonObject, reference: string): unknown {
  if (!reference.startsWith('#')) {
    throw new SpecSentinelError(`External $ref is not supported: ${reference}`);
  }
  let pointer: string;
  try {
    pointer = decodeURIComponent(reference.slice(1));
  } catch {
    throw new SpecSentinelError(`Invalid percent-encoding in local $ref: ${reference}`);
  }
  if (pointer === '') return document;
  if (!pointer.startsWith('/')) {
    throw new SpecSentinelError(`Invalid local $ref: ${reference}`);
  }

  let current: unknown = document;
  for (const encodedPart of pointer.slice(1).split('/')) {
    const part = decodePointerPart(encodedPart, reference);
    if (!isObject(current) && !Array.isArray(current)) {
      throw new SpecSentinelError(`Unresolvable local $ref: ${reference}`);
    }
    if (Array.isArray(current) && !/^(?:0|[1-9]\d*)$/.test(part)) {
      throw new SpecSentinelError(`Invalid array index in local $ref: ${reference}`);
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      throw new SpecSentinelError(`Unresolvable local $ref: ${reference}`);
    }
    current = current[part as keyof typeof current];
  }
  return current;
}

/** Resolves a local reference chain and preserves OpenAPI 3.1 sibling fields. */
export function resolveObject(document: JsonObject, value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  let current = value;
  const overlays: JsonObject[] = [];
  const seen = new Set<string>();
  const preserveSiblings = typeof document.openapi === 'string' && document.openapi.startsWith('3.1');
  while (typeof current.$ref === 'string') {
    const reference = current.$ref;
    if (seen.has(reference)) {
      throw new SpecSentinelError(`Circular local $ref chain: ${[...seen, reference].join(' -> ')}`);
    }
    seen.add(reference);
    if (preserveSiblings) overlays.push(Object.fromEntries(Object.entries(current).filter(([key]) => key !== '$ref')));
    const resolved = resolvePointer(document, reference);
    if (!isObject(resolved)) {
      throw new SpecSentinelError(`$ref ${reference} does not point to an object`);
    }
    current = resolved;
  }
  return Object.assign({}, current, ...overlays.reverse());
}
