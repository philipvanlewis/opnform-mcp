# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-31

### Added

- Initial release.
- 27 tools across forms, submissions, workspaces, workspace users, and integrations.
- Two transports: stdio (npx-friendly local) and Streamable HTTP (remote, bearer-gated).
- `export_submissions_csv` with field-id → column-name resolution and full pagination.
- Graceful fallbacks for OpnForm builds missing the `/user` and single-submission `GET` routes.
- Multi-stage Docker image, `docker-compose.yml`, and GitHub Actions for CI + npm/GHCR release.

[Unreleased]: https://github.com/philipvanlewis/opnform-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/philipvanlewis/opnform-mcp/releases/tag/v0.1.0
