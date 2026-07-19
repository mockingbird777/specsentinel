import type { DiffResult, Severity } from '../types.js';

const colors: Record<Severity, string> = {
  critical: '\u001b[1;31m', high: '\u001b[31m', medium: '\u001b[33m', low: '\u001b[36m', info: '\u001b[37m'
};
const reset = '\u001b[0m';

function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => {
    switch (character) {
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      default: return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  });
}

export function terminalReport(result: DiffResult, color = true): string {
  const lines = [
    `SpecSentinel ${result.version}`,
    `Comparing ${terminalText(result.baseline)} → ${terminalText(result.candidate)}`,
    ''
  ];
  if (result.changes.length === 0) {
    lines.push(color ? '\u001b[32m✓ No incompatible changes found.\u001b[0m' : '✓ No incompatible changes found.');
    return lines.join('\n');
  }
  for (const change of result.changes) {
    const label = `[${change.severity.toUpperCase()}]`;
    lines.push(`${color ? `${colors[change.severity]}${label}${reset}` : label} ${terminalText(change.ruleId)} ${terminalText(change.location)}`);
    lines.push(`  ${terminalText(change.message)}`);
  }
  const counts = (['critical', 'high', 'medium', 'low', 'info'] as Severity[])
    .filter((severity) => result.summary.bySeverity[severity] > 0)
    .map((severity) => `${result.summary.bySeverity[severity]} ${severity}`)
    .join(', ');
  lines.push('', `${result.summary.total} incompatible change${result.summary.total === 1 ? '' : 's'} (${counts})`);
  return lines.join('\n');
}
