import { appendFile } from 'node:fs/promises';
import { compareFiles } from './compare.js';
import { formatResult } from './reporters/index.js';
import { severityAtLeast, severityOrder, type OutputFormat, type Severity } from './types.js';

function input(name: string, required = false): string {
  const value = process.env[`INPUT_${name.toUpperCase()}`]?.trim() ?? '';
  if (required && !value) throw new Error(`Missing required action input: ${name.toLowerCase()}`);
  return value;
}

function workflowCommandValue(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

async function run(): Promise<void> {
  try {
    const baseline = input('BASELINE', true);
    const candidate = input('CANDIDATE', true);
    const configPath = input('CONFIG');
    const formatValue = (input('FORMAT') || 'terminal') as OutputFormat;
    const failOnValue = (input('FAIL-ON') || 'high') as Severity;
    if (!['terminal', 'json', 'markdown', 'sarif', 'html'].includes(formatValue)) throw new Error(`Invalid format: ${formatValue}`);
    if (!severityOrder.includes(failOnValue)) throw new Error(`Invalid fail-on severity: ${failOnValue}`);

    const { result } = await compareFiles({ baseline, candidate, ...(configPath ? { config: configPath } : {}) });
    process.stdout.write(`${formatResult(result, formatValue, { color: false })}\n`);

    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) await appendFile(summaryFile, `${formatResult(result, 'markdown')}\n`, 'utf8');
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) await appendFile(outputFile, `findings=${result.summary.total}\n`, 'utf8');
    if (result.changes.some((change) => severityAtLeast(change.severity, failOnValue))) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error title=SpecSentinel failed::${workflowCommandValue(message)}\n`);
    process.exitCode = 2;
  }
}

void run();
