# Security Policy

## Supported versions

Until SpecSentinel reaches 1.0, security fixes are released on the latest minor line.

| Version | Supported |
| --- | --- |
| `0.2.x` | Yes |
| Earlier | No |

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's **Report a vulnerability** flow under the repository Security tab. If private vulnerability reporting is unavailable, open a minimal issue asking the maintainer for a private contact channel; do not include vulnerability details.

Include the affected version, impact, reproduction steps, and any suggested mitigation. Remove credentials and proprietary OpenAPI documents. We aim to acknowledge a report within 3 business days, provide an initial assessment within 7 business days, and coordinate disclosure after a fix is available.

## Threat model

SpecSentinel processes untrusted JSON and YAML locally. It does not execute input documents, fetch URLs, or resolve external references. Reports may reproduce schema fragments, so treat generated JSON, SARIF, Markdown, and HTML as having the same sensitivity as the source contracts. The HTML reporter escapes rendered fields and embeds report data in a non-executable JSON script element.
