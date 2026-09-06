# Changelog

All notable changes to this project will be documented in this file.

The format is based on ["Keep a Changelog"](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Full-handler authentication for library consumers, custom middleware
  support, CSRF protection, and clickjacking defenses through CSP
  `frame-ancestors` and `X-Frame-Options` headers.
- Shareable URL filters, resilient request freshness, an expanded task detail
  view, responsive navigation, and a guided Prometheus setup state.
- Redis/worker/Prometheus Compose demo; Go, Vitest, Playwright, framework
  adapter, security, and visual-regression coverage.
- Multi-architecture container CI and release provenance, checksums, SBOM, and
  GHCR publishing.
- Persian maintainer runbook for GitHub Actions, immutable-ready releases,
  GHCR access, verification, and failure recovery.

### Changed

- Module path is now `github.com/pars-aria-labs/asynqmon`.
- Frontend migrated from CRA/React 16/Material UI 4 to
  Vite/React 18/Material UI 7, with Recharts 3.
- Prometheus proxy requests now validate configuration and responses, inherit
  cancellation, enforce bounded ranges/query sizes, cap each upstream body at
  4 MiB and their aggregate at 24 MiB, and escape queue matchers safely. Each
  handler admits at most two concurrent metrics requests and responds to
  excess load with `503` and `Retry-After`.
- Runtime HTML now receives only a boolean Prometheus-configuration marker;
  the configured upstream URL is kept on the server.
- CLI help exits successfully without echoing sensitive environment-derived
  defaults.
- Existing standalone Basic Auth and read-only handling now cover their full
  intended route scope and fail closed on partial configuration.
- Release binaries now cover Linux, macOS, and Windows on amd64 and arm64.
- Release automation is now driven by validated SemVer-style tags whose
  commits already belong to the default branch. It reuses the complete test
  and CodeQL workflows, publishes containers only after all binary artifacts
  and attestations succeed, and publishes the GitHub Release from a completed
  draft so immutable releases remain compatible.
- GitHub Actions are pinned to full commit SHAs and tracked by Dependabot;
  Docker build stages are pinned to manifest digests, duplicate CI runs are
  cancelled, and release runs remain serialized in a FIFO queue.
- Release publication revalidates the remote tag and queries the Releases API
  fail-closed before registry and final publication steps, preventing a moved
  or reused tag from silently binding artifacts to another commit.

### Fixed

- Manual Dashboard refreshes now supersede in-flight queue and queue-history
  generations, preventing late responses from overwriting newer state. Queue
  mutations also cancel an older poll and refresh authoritative state after
  completion.

## [0.7.0] - 2022-04-11

Version 0.7 added support for [Task Aggregation](https://github.com/hibiken/asynq/wiki/Task-aggregation) feature

### Added
 
- (ui): Added tasks view to show aggregated tasks

## [0.6.1] - 2022-03-17

### Fixed
- (ui): Show metrics link in sidebar when --prometheus-addr flag is provided

## [0.6.0] - 2022-03-02

### Added

- (cmd): Added `--read-only` flag to specify read-only mode
- (pkg): Added `Options.ReadOnly` to restrict user to view-only mode
- (ui): Hide action buttons in read-only mode
- (ui): Display queue latency in dashboard page and queue detail page.
- (ui): Added copy-to-clipboard button for task ID in tasks list-view page.
- (ui): Use logo image in the appbar (thank you @koddr!)

### Fixed
- (ui): Pagination in ActiveTasks table is fixed

## [0.5.0] - 2021-12-19

Version 0.5 added support for [Prometheus](https://prometheus.io/) integration.

- (cmd): Added `--enable-metrics-exporter` option to export queue metrics.
- (cmd): Added `--prometheus-addr` to enable metrics view in Web UI.
- (pkg): Added `Options.PrometheusAddress` to enable metrics view in Web UI.

## [0.4.0] - 2021-11-06

- Added "completed" state
- Updated to be compatible with asynq v0.19

## [0.3.2] - 2021-10-22

- (ui): Fixed build

## [0.3.1] - 2021-10-21

### Added

- (cmd): Added --max-payload-length to allow specifying number of characters displayed for payload, defaults to 200 chars
- (pkg): DefaultPayloadFormatter is now exported from the package

## [0.3.0]

### Changed

- Asynqmon is now a go package that can be imported to other projects!

## [0.2.1]

### Addded

- Task details view is added
- Search by task ID feature is added

## [0.2]

### Changed

- Updated to depend on asynq 0.18

## [0.1.0-beta1] - 2021-01-31

Initial Beta Release 🎉
