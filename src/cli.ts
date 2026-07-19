#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { compareFiles } from './compare.js';
import { SpecSentinelError } from './errors.js';
import { formatResult } from './reporters/index.js';
import { severityAtLeast, severityOrder, type OutputFormat, type Severity } from './types.js';

const VERSION = '0.1.0';
const formats: OutputFormat[] = ['terminal', 'json', 'markdown', 'sarif', 'html'];

interface CliOptions {
  baseline?: string;
  candidate?: string;
  format?: OutputFormat;
  output?: string;
  failOn?: Severity;
  config?: string;
  ignores: string[];
  color: boolean;
  help: boolean;
  version: boolean;
}

const help = `SpecSentinel ${VERSION} — security-aware OpenAPI contract diff

Usage:
  specsentinel [diff] <baseline> <candidate> [options]

Options:
  -f, --format <name>     terminal | json | markdown | sarif | html
  -o, --output <file>     Write the report to a file
      --fail-on <level>   info | low | medium | high | critical (default: high)
      --ignore <rule>     Ignore a rule ID; repeat or use comma-separated IDs
  -c, --config <file>     YAML or JSON configuration
      --no-color          Disable terminal colors
  -h, --help              Show this help
  -v, --version           Print the version

Exit codes: 0 compatible, 1 threshold reached, 2 usage/input/config error.`;

function valueAfter(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new SpecSentinelError(`${option} requires a value`);
  return value;
}

export function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = { ignores: [], color: true, help: false, version: false };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    const equals = argument.startsWith('--') ? argument.indexOf('=') : -1;
    const option = equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue = equals > 0 ? argument.slice(equals + 1) : undefined;
    const take = (): string => inlineValue ?? valueAfter(argv, index++, option);
    switch (option) {
      case 'diff':
        if (positional.length > 0) positional.push(argument);
        break;
      case '-h': case '--help': options.help = true; break;
      case '-v': case '--version': options.version = true; break;
      case '--no-color': options.color = false; break;
      case '-f': case '--format': {
        const value = take() as OutputFormat;
        if (!formats.includes(value)) throw new SpecSentinelError(`Unknown format '${value}'`);
        options.format = value; break;
      }
      case '-o': case '--output': options.output = take(); break;
      case '-c': case '--config': options.config = take(); break;
      case '--fail-on': {
        const value = take() as Severity;
        if (!severityOrder.includes(value)) throw new SpecSentinelError(`Unknown severity '${value}'`);
        options.failOn = value; break;
      }
      case '--ignore': options.ignores.push(...take().split(',').map((item) => item.trim()).filter(Boolean)); break;
      default:
        if (argument.startsWith('-')) throw new SpecSentinelError(`Unknown option '${argument}'`);
        positional.push(argument);
    }
  }
  if (positional[0] !== undefined) options.baseline = positional[0];
  if (positional[1] !== undefined) options.candidate = positional[1];
  if (positional.length > 2) throw new SpecSentinelError(`Unexpected positional argument '${positional[2]}'`);
  return options;
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArguments(argv);
    if (options.help) { process.stdout.write(`${help}\n`); return 0; }
    if (options.version) { process.stdout.write(`${VERSION}\n`); return 0; }
    if (!options.baseline || !options.candidate) throw new SpecSentinelError('Both baseline and candidate documents are required. Run with --help for usage.');

    const { result, config } = await compareFiles({
      baseline: options.baseline, candidate: options.candidate,
      ...(options.config ? { config: options.config } : {}), ignoreRules: options.ignores
    });
    const format = options.format ?? config.format ?? 'terminal';
    const rendered = formatResult(result, format, { color: options.color && Boolean(process.stdout.isTTY) });
    if (options.output) await writeFile(options.output, `${rendered}\n`, 'utf8');
    else process.stdout.write(`${rendered}\n`);
    const threshold = options.failOn ?? config.failOn ?? 'high';
    return result.changes.some((change) => severityAtLeast(change.severity, threshold)) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SpecSentinel: ${message}\n`);
    return 2;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exitCode = await runCli();
