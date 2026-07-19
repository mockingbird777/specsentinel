import type { DiffResult, OutputFormat } from '../types.js';
import { htmlReport } from './html.js';
import { markdownReport } from './markdown.js';
import { sarifReport } from './sarif.js';
import { terminalReport } from './terminal.js';

export interface FormatOptions { color?: boolean }

export function formatResult(result: DiffResult, format: OutputFormat, options: FormatOptions = {}): string {
  switch (format) {
    case 'json': return JSON.stringify(result, null, 2);
    case 'markdown': return markdownReport(result);
    case 'sarif': return sarifReport(result);
    case 'html': return htmlReport(result);
    case 'terminal': return terminalReport(result, options.color ?? true);
  }
}
