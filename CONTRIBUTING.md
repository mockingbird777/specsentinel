# Contributing to SpecSentinel

Thank you for helping API teams ship safer contracts. Contributions are expected to be focused, tested, and easy to review.

## Development setup

Requirements: Node.js 20 or newer and npm 10 or newer.

```bash
git clone https://github.com/mockingbird777/specsentinel.git
cd specsentinel
npm ci
npm test
```

Useful commands:

```bash
npm run build   # Type-check and compile; bundle the GitHub Action
npm test        # Build and run the node:test suite
npm pack --dry-run
```

## Proposing a rule

Before implementation, open a rule proposal that includes:

1. A minimal baseline and candidate OpenAPI pair.
2. Why the change is incompatible for an existing client.
3. A stable rule ID, suggested severity, and expected location.
4. Counterexamples that must not produce a finding.

Rules should be deterministic and conservative: a false green is dangerous, but noisy false positives teach users to ignore the tool. Add fixtures and tests for both breaking and compatible cases. Keep reporting separate from detection logic.

## Pull requests

- Keep changes scoped to one concern.
- Add or update tests and user-facing documentation.
- Run `npm test` and `npm pack --dry-run` locally.
- Add an entry under **Unreleased** in `CHANGELOG.md` for user-visible changes.
- Do not commit secrets, private API documents, or generated reports containing sensitive schemas.

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Security vulnerabilities belong in the private process described in [SECURITY.md](SECURITY.md), not a public issue.
