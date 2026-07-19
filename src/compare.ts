import { filterIgnored, loadConfig } from './config/config.js';
import { diffOpenApi, makeResult } from './diff/engine.js';
import { loadOpenApi } from './loader.js';
import type { DiffResult, SentinelConfig } from './types.js';

export interface CompareFilesOptions {
  baseline: string;
  candidate: string;
  config?: string;
  ignoreRules?: string[];
}

export async function compareFiles(options: CompareFilesOptions): Promise<{ result: DiffResult; config: SentinelConfig }> {
  const [baseline, candidate, config] = await Promise.all([
    loadOpenApi(options.baseline), loadOpenApi(options.candidate),
    options.config ? loadConfig(options.config) : Promise.resolve({} as SentinelConfig)
  ]);
  const raw = diffOpenApi({
    baseline: baseline.document, candidate: candidate.document,
    baselineSource: baseline.source, candidateSource: candidate.source
  });
  const changes = filterIgnored(raw.changes, config, options.ignoreRules);
  return {
    result: makeResult({
      baseline: baseline.document, candidate: candidate.document,
      baselineSource: baseline.source, candidateSource: candidate.source,
      generatedAt: raw.generatedAt
    }, changes),
    config
  };
}
