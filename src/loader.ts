import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import YAML from 'yaml';
import { SpecSentinelError } from './errors.js';
import { isObject, type JsonObject } from './types.js';

export interface LoadedSpec {
  document: JsonObject;
  source: string;
}

export function parseOpenApi(text: string, source = '<memory>'): JsonObject {
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (error) {
    throw new SpecSentinelError(`Unable to parse ${source}: ${error instanceof Error ? error.message : String(error)}`, error);
  }

  if (!isObject(parsed)) {
    throw new SpecSentinelError(`${source} must contain an object at the document root`);
  }
  if (typeof parsed.openapi !== 'string' || !parsed.openapi.startsWith('3.')) {
    throw new SpecSentinelError(`${source} is not an OpenAPI 3.x document`);
  }
  if (!isObject(parsed.paths)) {
    throw new SpecSentinelError(`${source} must define a paths object`);
  }
  return parsed;
}

export async function loadOpenApi(filePath: string): Promise<LoadedSpec> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new SpecSentinelError(`Unable to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
  const extension = extname(filePath).toLowerCase();
  if (extension && !['.yaml', '.yml', '.json'].includes(extension)) {
    // YAML is a superset of JSON, so parsing is still safe; this is intentionally permissive.
  }
  return { document: parseOpenApi(text, filePath), source: filePath };
}
