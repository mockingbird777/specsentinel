import { pointerPart, resolveObject } from '../ref.js';
import { isObject, type Change, type JsonObject } from '../types.js';

interface SchemaContext {
  baseline: JsonObject;
  candidate: JsonObject;
  location: string;
  changes: Change[];
  seen: Set<string>;
  depth?: number;
}

function schemaType(schema: JsonObject | undefined): unknown {
  if (!schema) return undefined;
  if (schema.type !== undefined) return schema.type;
  if (isObject(schema.properties)) return 'object';
  if (schema.items !== undefined) return 'array';
  return undefined;
}

// OpenAPI 3.1 allows `type` to be an array (a union). Reordering identical
// members is semantically equivalent, so compare unions as sorted sets — a
// reorder is a no-op, while adding/removing a member still differs. Scalar
// types are returned unchanged. Only used for the equality check; the reported
// before/after keep the author's original ordering.
function typeComparisonKey(type: unknown): string {
  if (Array.isArray(type)) {
    return JSON.stringify([...new Set(type.map((member) => JSON.stringify(member)))].sort());
  }
  return JSON.stringify(type);
}

function requiredSet(schema: JsonObject | undefined): Set<string> {
  return new Set(Array.isArray(schema?.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []);
}

function schemaPairKey(before: unknown, after: unknown): string | undefined {
  if (!isObject(before) || !isObject(after)) return undefined;
  if (typeof before.$ref === 'string' || typeof after.$ref === 'string') {
    const beforeSiblings = Object.fromEntries(Object.entries(before).filter(([name]) => name !== '$ref'));
    const afterSiblings = Object.fromEntries(Object.entries(after).filter(([name]) => name !== '$ref'));
    return `${String(before.$ref ?? '<inline>')}::${JSON.stringify(beforeSiblings)}::${String(after.$ref ?? '<inline>')}::${JSON.stringify(afterSiblings)}`;
  }
  return undefined;
}

export function compareRequestSchema(beforeValue: unknown, afterValue: unknown, context: SchemaContext): void {
  if ((context.depth ?? 0) > 40) return;
  const key = schemaPairKey(beforeValue, afterValue);
  if (key && context.seen.has(key)) return;
  if (key) context.seen.add(key);

  const before = resolveObject(context.baseline, beforeValue);
  const after = resolveObject(context.candidate, afterValue);
  if (!before || !after) return;

  const beforeType = schemaType(before);
  const afterType = schemaType(after);
  if (beforeType !== undefined && afterType !== undefined && typeComparisonKey(beforeType) !== typeComparisonKey(afterType)) {
    context.changes.push({
      ruleId: 'REQUEST_TYPE_CHANGED', severity: 'high', location: `${context.location}/type`,
      message: `Request schema type changed from ${JSON.stringify(beforeType)} to ${JSON.stringify(afterType)}.`,
      before: beforeType, after: afterType
    });
    return;
  }

  const beforeRequired = requiredSet(before);
  const afterRequired = requiredSet(after);
  for (const property of afterRequired) {
    if (!beforeRequired.has(property)) {
      context.changes.push({
        ruleId: 'REQUEST_PROPERTY_REQUIRED', severity: 'high',
        location: `${context.location}/properties/${pointerPart(property)}`,
        message: `Request property '${property}' is now required.`, before: false, after: true
      });
    }
  }

  const beforeProperties = isObject(before.properties) ? before.properties : {};
  const afterProperties = isObject(after.properties) ? after.properties : {};
  for (const [property, childBefore] of Object.entries(beforeProperties)) {
    if (property in afterProperties) {
      compareRequestSchema(childBefore, afterProperties[property], {
        ...context,
        location: `${context.location}/properties/${pointerPart(property)}`,
        depth: (context.depth ?? 0) + 1
      });
    }
  }

  if (before.items !== undefined && after.items !== undefined) {
    compareRequestSchema(before.items, after.items, {
      ...context, location: `${context.location}/items`, depth: (context.depth ?? 0) + 1
    });
  }
}

export function compareResponseSchema(beforeValue: unknown, afterValue: unknown, context: SchemaContext): void {
  if ((context.depth ?? 0) > 40) return;
  const key = schemaPairKey(beforeValue, afterValue);
  if (key && context.seen.has(key)) return;
  if (key) context.seen.add(key);

  const before = resolveObject(context.baseline, beforeValue);
  const after = resolveObject(context.candidate, afterValue);
  if (!before || !after) return;

  const beforeType = schemaType(before);
  const afterType = schemaType(after);
  if (beforeType !== undefined && afterType !== undefined && typeComparisonKey(beforeType) !== typeComparisonKey(afterType)) {
    context.changes.push({
      ruleId: 'RESPONSE_TYPE_CHANGED', severity: 'high', location: `${context.location}/type`,
      message: `Response schema type changed from ${JSON.stringify(beforeType)} to ${JSON.stringify(afterType)}.`,
      before: beforeType, after: afterType
    });
    return;
  }

  const beforeProperties = isObject(before.properties) ? before.properties : {};
  const afterProperties = isObject(after.properties) ? after.properties : {};
  for (const [property, childBefore] of Object.entries(beforeProperties)) {
    const childLocation = `${context.location}/properties/${pointerPart(property)}`;
    if (!(property in afterProperties)) {
      context.changes.push({
        ruleId: 'RESPONSE_PROPERTY_REMOVED', severity: 'high', location: childLocation,
        message: `Response property '${property}' was removed.`, before: childBefore, after: undefined
      });
    } else {
      compareResponseSchema(childBefore, afterProperties[property], {
        ...context, location: childLocation, depth: (context.depth ?? 0) + 1
      });
    }
  }

  if (before.items !== undefined && after.items !== undefined) {
    compareResponseSchema(before.items, after.items, {
      ...context, location: `${context.location}/items`, depth: (context.depth ?? 0) + 1
    });
  }
}
