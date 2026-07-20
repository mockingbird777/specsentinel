import type { DiffResult } from '../types.js';

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function htmlReport(result: DiffResult): string {
  const rows = result.changes.map((change) => `
      <article class="finding ${change.severity}">
        <div class="badges"><span class="severity">${change.severity}</span><code>${escape(change.ruleId)}</code></div>
        <h2>${escape(change.message)}</h2>
        <code class="location">${escape(change.location)}</code>
        <details><summary>Before / after</summary><pre>${escape(JSON.stringify({ before: change.before, after: change.after }, null, 2))}</pre></details>
      </article>`).join('');
  const data = JSON.stringify(result).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">
<meta property="og:type" content="website"><meta property="og:title" content="SpecSentinel · OpenAPI contract report">
<meta property="og:description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="SpecSentinel · OpenAPI contract report">
<meta name="twitter:description" content="Catch breaking and security-sensitive OpenAPI changes before they ship with a local, self-contained contract report.">
<title>SpecSentinel · OpenAPI contract report</title><style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#131b31;--text:#e8edf8;--muted:#98a6c5;--line:#263454;--accent:#8b5cf6}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#21214b 0,transparent 34%),var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}
main{width:min(1020px,calc(100% - 32px));margin:48px auto 80px}.hero{padding:32px;border:1px solid var(--line);background:linear-gradient(140deg,#171f39dd,#11182bdd);border-radius:20px;box-shadow:0 24px 70px #0008}
.eyebrow{color:#b9a6ff;text-transform:uppercase;letter-spacing:.14em;font-weight:800;font-size:12px}h1{font-size:clamp(34px,6vw,62px);letter-spacing:-.045em;margin:8px 0}.meta{color:var(--muted)}.count{display:inline-block;margin-top:16px;padding:8px 12px;background:#8b5cf622;border:1px solid #8b5cf655;border-radius:99px}
.findings{display:grid;gap:14px;margin-top:22px}.finding{padding:22px;border:1px solid var(--line);border-left:4px solid #64748b;background:var(--panel);border-radius:14px}.finding.critical{border-left-color:#f43f5e}.finding.high{border-left-color:#fb7185}.finding.medium{border-left-color:#fbbf24}.finding.low{border-left-color:#22d3ee}.finding h2{font-size:17px;margin:12px 0}.badges{display:flex;gap:9px;align-items:center}.severity{text-transform:uppercase;font-size:11px;font-weight:900;letter-spacing:.1em}.location{color:#a5b4fc;word-break:break-all}details{margin-top:15px;color:var(--muted)}pre{overflow:auto;background:#080c18;padding:14px;border-radius:9px;color:#cbd5e1}.empty{padding:28px;text-align:center;color:#86efac}
.source{margin:24px 0 0;text-align:center;color:var(--muted);font-size:13px}.source a{color:#c4b5fd;text-decoration:none}.source a:hover,.source a:focus-visible{text-decoration:underline}
</style></head><body><main><section class="hero"><div class="eyebrow">OpenAPI contract intelligence</div><h1>SpecSentinel</h1><div class="meta">${escape(result.baseline)} → ${escape(result.candidate)}</div><span class="count">${result.summary.total} finding${result.summary.total === 1 ? '' : 's'}</span></section>
<section class="findings">${rows || '<div class="empty">✓ No incompatible changes found.</div>'}</section><p class="source">Generated locally · <a href="https://github.com/mockingbird777/specsentinel" target="_blank" rel="noopener noreferrer">Explore SpecSentinel on GitHub ↗</a></p></main><script type="application/json" id="specsentinel-data">${data}</script></body></html>`;
}
