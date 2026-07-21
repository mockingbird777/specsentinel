# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- OpenAPI 3.1 `type` unions are compared order-insensitively: reordering identical members no longer reports a request/response `TYPE_CHANGED` finding, while adding or removing a member still does.

## [0.2.0] - 2026-07-20

### Added

- A zero-setup `specsentinel demo` command that analyzes bundled OpenAPI fixtures and exits successfully unless an explicit failure threshold is requested.
- Dedicated 1280×640 social-preview artwork in editable SVG and upload-ready PNG formats.

### Changed

- Reworked the README's first-run flow, positioning, and contribution paths around an immediate, reproducible contract report.

## [0.1.0] - 2026-07-19

### Added

- OpenAPI 3.x JSON and YAML loading with internal `$ref` resolution.
- Breaking-change rules for paths, operations, parameters, request schemas, responses, and response schemas.
- Security-strengthening analysis across OpenAPI security alternatives, schemes, and scopes.
- Terminal, JSON, Markdown, SARIF 2.1.0, and self-contained HTML reports.
- Severity-based exit gates, whole-rule ignores, and location-scoped wildcard suppressions.
- Typed library API, Node 20 GitHub Action, CI workflow, fixtures, and test suite.

[Unreleased]: https://github.com/mockingbird777/specsentinel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mockingbird777/specsentinel/releases/tag/v0.2.0
[0.1.0]: https://github.com/mockingbird777/specsentinel/releases/tag/v0.1.0
