<p align="center">
  <img src="https://user-images.githubusercontent.com/11155743/114745460-57760500-9d57-11eb-9a2c-43fa88171807.png" alt="Asynqmon logo" width="360">
</p>

# Asynqmon

[![Go Reference](https://pkg.go.dev/badge/github.com/pars-aria-labs/asynqmon.svg)](https://pkg.go.dev/github.com/pars-aria-labs/asynqmon)
[![Test](https://github.com/pars-aria-labs/asynqmon/actions/workflows/test.yml/badge.svg)](https://github.com/pars-aria-labs/asynqmon/actions/workflows/test.yml)

Asynqmon is a responsive web dashboard for inspecting and administering
[Asynq](https://github.com/hibiken/asynq) queues, tasks, schedulers, servers,
Redis state, and Prometheus time series. It can run as a standalone binary or
be mounted as an HTTP handler inside an existing Go service.

## Source, lineage, and scope

This repository is an independently maintained fork, not an official release
of the upstream Asynqmon project.

| Part | Source used by this repository |
| --- | --- |
| Original dashboard | [`github.com/hibiken/asynqmon`](https://github.com/hibiken/asynqmon), distributed under the MIT License |
| Migration baseline | Tag [`v0.7.2-parsidev-1`](https://github.com/pars-aria-labs/asynqmon/tree/v0.7.2-parsidev-1), commit [`8bf6ad3`](https://github.com/pars-aria-labs/asynqmon/commit/8bf6ad3618d90570102589ee2c8e2e891d07547f) |
| Current module | `github.com/pars-aria-labs/asynqmon` |
| Asynq implementation | [`github.com/parsidev/asynq`](https://github.com/parsidev/asynq) at `v0.26.0-parsidev.0.20260609061401-e6fb2f09f7f8` |

The Asynq fork intentionally declares the original module path
`github.com/hibiken/asynq`. For that reason, application code continues to
import Asynq from its original path while `go.mod` replaces its implementation
with the Parsidev fork. See [Using Asynqmon as a library](#using-asynqmon-as-a-library)
for the one replacement directive consumers must copy.

This branch is tested against the exact Parsidev Asynq pseudo-version shown in
the table. Historical upstream compatibility tables should not be assumed to
describe this fork.

### What changed in this fork

- Renamed the Go module and all Asynqmon imports to
  `github.com/pars-aria-labs/asynqmon`.
- Rebuilt the frontend around React 18, TypeScript 5, Vite, and Material UI 7;
  upgraded the charts to Recharts 3.
- Added a responsive desktop/mobile shell, light and dark themes, clearer data
  summaries, task detail tools, JSON search/copy, and shareable URL filters.
- Made request state resilient to refreshes, route changes, polling, aborted
  requests, temporary failures, and stale data. A manual Dashboard refresh now
  starts a new generation for both queue summaries and queue history, so a late
  response from the previous generation cannot overwrite newer data. Queue
  mutations likewise supersede an older poll and fetch authoritative state
  after the mutation completes.
- Hardened the existing read-only and standalone Basic Auth behavior; added
  full-handler library authentication, pluggable Go middleware, protection
  against unsafe cross-origin mutations, and clickjacking response headers.
- Kept Metrics discoverable even before Prometheus is configured, with an
  actionable setup screen instead of a hidden route.
- Hardened Prometheus queries with request cancellation, bounded timeouts and
  bodies, URL and response validation, safe PromQL escaping, and explicit
  `502`/`504` failures.
- Added a self-contained Redis/worker/Prometheus demo plus Go, React, browser,
  framework-adapter, security, and visual-regression tests.
- Added CI smoke tests for `linux/amd64` and `linux/arm64`, and a release flow
  that publishes multi-platform binaries and containers with checksums, SBOM,
  and build-provenance attestations.

The original copyright, MIT license, contributor credit, and logo attribution
are preserved in [License and attribution](#license-and-attribution).

## Try the complete demo

The demo starts an isolated Redis instance, a synthetic producer/worker,
Prometheus, and the dashboard:

```sh
docker compose -f compose.demo.yaml up --build --detach --wait
```

Open <http://localhost:8080>. Tasks continuously move through successful,
retrying, archived, and scheduled states, so the tables and charts contain
useful data immediately.

```sh
# Follow dashboard and task-generator logs.
docker compose -f compose.demo.yaml logs --follow dashboard demo

# Stop the stack and remove its temporary data.
docker compose -f compose.demo.yaml down --volumes
```

See [the demo guide](dev/README.md) for port overrides, architecture notes, and
troubleshooting.

## Install

### Release binary

Download the archive for your operating system and architecture from the
[GitHub Releases page](https://github.com/pars-aria-labs/asynqmon/releases),
extract it, and run `asynqmon` (`asynqmon.exe` on Windows).

Releases created by the new workflow contain Linux, macOS, and Windows builds
for `amd64` and `arm64`, along with `checksums.txt`. The
[release verification instructions](#verify-a-release) show how to validate a
download.

### Container image

When a release is published, its image supports `linux/amd64` and
`linux/arm64`:

```sh
docker pull ghcr.io/pars-aria-labs/asynqmon:latest

docker run --rm \
  --name asynqmon \
  --add-host=host.docker.internal:host-gateway \
  --publish 127.0.0.1:8080:8080 \
  ghcr.io/pars-aria-labs/asynqmon:latest \
  --redis-addr=host.docker.internal:6379
```

Prefer an immutable release tag instead of `latest` in production.

### Build from source

Building requires the Go version declared in `go.mod`, Node.js 22.12 or newer,
and npm:

```sh
git clone https://github.com/pars-aria-labs/asynqmon.git
cd asynqmon
make build
./asynqmon --help
```

`make build` installs the locked UI dependencies, creates the production web
assets, embeds them, and writes the standalone binary to `./asynqmon`.

## Run and configure

With Redis listening on `127.0.0.1:6379`, the minimum command is:

```sh
./asynqmon
```

Then open <http://localhost:8080>. Flags can also be supplied through the
corresponding environment variables:

| Flag | Environment variable | Purpose | Default |
| --- | --- | --- | --- |
| `--port` | `PORT` | HTTP listen port | `8080` |
| `--redis-url` | `REDIS_URL` | Redis or Sentinel connection URL | empty |
| `--redis-addr` | `REDIS_ADDR` | Single Redis address | `127.0.0.1:6379` |
| `--redis-db` | `REDIS_DB` | Redis database number | `0` |
| `--redis-password` | `REDIS_PASSWORD` | Redis password | empty |
| `--redis-cluster-nodes` | `REDIS_CLUSTER_NODES` | Comma-separated cluster node addresses | empty |
| `--redis-prefix` | `REDIS_PREFIX` | Prefix used by Asynq Redis keys | empty |
| `--redis-tls` | `REDIS_TLS` | Server name used for TLS verification | empty |
| `--redis-insecure-tls` | `REDIS_INSECURE_TLS` | Disable TLS certificate-host validation | `false` |
| `--max-payload-length` | `MAX_PAYLOAD_LENGTH` | Maximum payload characters shown in a table cell | `200` |
| `--max-result-length` | `MAX_RESULT_LENGTH` | Maximum result characters shown in a table cell | `200` |
| `--read-only` | `READ_ONLY` | Disable queue and task mutations | `false` |
| `--basic-auth-username` | `BASIC_AUTH_USERNAME` | HTTP Basic Auth username | empty |
| `--basic-auth-password` | `BASIC_AUTH_PASSWORD` | HTTP Basic Auth password | empty |
| `--enable-metrics-exporter` | `ENABLE_METRICS_EXPORTER` | Expose Asynq metrics at `/metrics` | `false` |
| `--prometheus-addr` | `PROMETHEUS_ADDR` | Prometheus base URL queried for charts | empty |

Run `./asynqmon --help` for the authoritative list. Help exits successfully
with status `0`. Values loaded from `REDIS_PASSWORD`, `REDIS_URL`,
`PROMETHEUS_ADDR`, and `BASIC_AUTH_PASSWORD` remain active configuration, but
their defaults are deliberately omitted from help output so credentials and
internal service URLs are not echoed into terminals or logs. Both Basic Auth
values must be set together; a partial configuration is rejected before the
server starts.

### Redis examples

A single Redis instance can be described either with a URL or individual
options:

```sh
./asynqmon --redis-url='redis://:secret@localhost:6380/2'

./asynqmon \
  --redis-addr=localhost:6380 \
  --redis-db=2 \
  --redis-password='secret'
```

For Sentinel, put all endpoints and the master name in `--redis-url`:

```sh
./asynqmon \
  --redis-url='redis-sentinel://:secret@sentinel-1:5000,sentinel-2:5001,sentinel-3:5002?master=mymaster'
```

For Redis Cluster, provide the seed nodes:

```sh
./asynqmon \
  --redis-cluster-nodes='redis-1:7000,redis-2:7001,redis-3:7002'
```

`--redis-insecure-tls` is intended only for controlled development systems.
Keep certificate verification enabled in production.

## Prometheus tutorial

There are two separate pieces:

1. `--enable-metrics-exporter` exposes current Asynq queue metrics from the
   dashboard process at `/metrics`.
2. `--prometheus-addr` tells the dashboard where it can query previously
   scraped time-series data for its charts.

Start Asynqmon with both features:

```sh
./asynqmon \
  --redis-addr=redis:6379 \
  --enable-metrics-exporter \
  --prometheus-addr=http://prometheus:9090
```

Configure Prometheus to scrape the dashboard:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: asynqmon
    scrape_interval: 5s
    static_configs:
      - targets: ["asynqmon:8080"]
```

If Basic Auth protects the standalone server, Prometheus must use the same
credentials because `/metrics` is protected too:

```yaml
scrape_configs:
  - job_name: asynqmon
    static_configs:
      - targets: ["asynqmon:8080"]
    basic_auth:
      username: monitor
      password_file: /run/secrets/asynqmon_password
```

After the first samples are scraped, select **Metrics** in the dashboard.
Without `--prometheus-addr`, that route remains visible and explains exactly
which server-side setting is missing; the browser never attempts to contact
Prometheus directly. The rendered HTML receives only a boolean
“Prometheus configured” marker—not the configured URL, credentials, or
internal hostname—and chart requests go through Asynqmon's same-origin
`/api/metrics` endpoint. The literal `/metrics` URL is the Prometheus scrape
endpoint, not the chart page.

The configured Prometheus address must be an `http` or `https` URL with a host.
A path prefix such as `https://example.com/prometheus` is supported. Dashboard
queries inherit the incoming request cancellation, time out after ten seconds,
and reject invalid or oversized upstream responses.

The metrics endpoint applies the following limits before or while querying
Prometheus:

- `duration` is inclusive from `1` second through `30` days; the UI also
  normalizes imported or shared URLs to this range.
- The raw URL query string is limited to 32 KiB, and the decoded `queues`
  parameter is limited to 16 KiB.
- Each of the nine Prometheus response bodies is limited to 4 MiB, and their
  accepted aggregate is limited to 24 MiB.
- At most two dashboard metrics requests may run at once per handler instance.
  An additional request receives `503 Service Unavailable` with
  `Retry-After: 1`, allowing a client to retry without creating unbounded
  Prometheus fan-out.

### Export metrics when Asynqmon is embedded

`Options.PrometheusAddress` only enables server-side chart queries. In library
mode, the host application owns its Prometheus registry and scrape endpoint:

```go
import (
	"net/http"

	"github.com/hibiken/asynq"
	"github.com/hibiken/asynq/x/metrics"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

redisOptions := asynq.RedisClientOpt{Addr: "redis:6379"}
inspector := asynq.NewInspector(redisOptions)
defer inspector.Close()

registry := prometheus.NewRegistry()
registry.MustRegister(metrics.NewQueueMetricsCollector(inspector))

mux := http.NewServeMux()
mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
```

The embedded Asynqmon authentication options do not automatically protect this
host-owned `/metrics` route. Restrict it at the network layer or wrap it with
the host service's authentication middleware, then configure matching scrape
credentials in Prometheus.

## Secure deployment

For a read-only dashboard protected with Basic Auth:

```sh
export BASIC_AUTH_USERNAME='monitor'
export BASIC_AUTH_PASSWORD='use-a-secret-manager-here'
export READ_ONLY=true
./asynqmon --redis-addr=redis.internal:6379
```

Basic Auth credentials are only encoded, not encrypted. Terminate HTTPS at the
application or a trusted reverse proxy before exposing the dashboard outside a
private development network. Avoid putting passwords directly in shell history
or image arguments.

Read-only mode rejects mutation endpoints with `405 Method Not Allowed`.
Unsafe cross-origin browser requests are also rejected to protect task and
queue operations from CSRF. These controls complement authentication; they do
not replace it. The handler also emits
`Content-Security-Policy: frame-ancestors 'none'` and
`X-Frame-Options: DENY` to prevent the dashboard from being framed for
clickjacking.

## Using Asynqmon as a library

First add the module and copy its Asynq replacement into the consuming
application. Dependency-module `replace` directives are not inherited by Go,
so the `go mod edit -replace` command is required:

```sh
go mod edit \
  -replace=github.com/hibiken/asynq=github.com/parsidev/asynq@v0.26.0-parsidev.0.20260609061401-e6fb2f09f7f8
go get github.com/pars-aria-labs/asynqmon@latest
go mod tidy
```

`@latest` starts resolving this module path only after a new tag containing
the rename has been published. Do not reuse the baseline
`v0.7.2-parsidev-1` tag, whose `go.mod` still belongs to the previous module.

Keep importing Asynq as `github.com/hibiken/asynq`; the Parsidev fork retains
that module identity.

### `net/http` example

```go
package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/hibiken/asynq"
	"github.com/pars-aria-labs/asynqmon"
)

func main() {
	username := os.Getenv("ASYNQMON_USER")
	password := os.Getenv("ASYNQMON_PASS")
	if username == "" || password == "" {
		log.Fatal("ASYNQMON_USER and ASYNQMON_PASS are required")
	}

	monitor := asynqmon.New(asynqmon.Options{
		RootPath:          "/monitoring",
		RedisConnOpt:      asynq.RedisClientOpt{Addr: "127.0.0.1:6379"},
		PrometheusAddress: "http://127.0.0.1:9090",
		ReadOnly:          true,
		BasicAuthUsername: username,
		BasicAuthPassword: password,
	})
	defer monitor.Close()

	mux := http.NewServeMux()
	// The trailing slash is required by ServeMux for the whole subtree.
	mux.Handle(monitor.RootPath()+"/", monitor)

	server := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("asynqmon server stopped: %v", err)
	}
}
```

Open <http://localhost:8080/monitoring/>. Do not wrap the handler in
`http.StripPrefix`; `RootPath` must match the route on which the handler is
mounted. Call `Close` during application shutdown so its Redis resources are
released.

### Existing session, JWT, or SSO middleware

`Options.Middleware` wraps HTML, static assets, and every monitoring API route:

```go
monitor := asynqmon.New(asynqmon.Options{
	RootPath:     "/monitoring",
	RedisConnOpt: redisOptions,
	Middleware: func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !currentUserMayMonitor(r.Context()) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	},
})
```

If custom middleware and built-in Basic Auth are both configured, both checks
must succeed. Adapter examples for Gin and Echo are compiled and tested under
[`integration/frameworks`](integration/frameworks).

### Migrating from the upstream import

Change only the Asynqmon module/import path:

```diff
- github.com/hibiken/asynqmon
+ github.com/pars-aria-labs/asynqmon
```

Then add the Asynq `replace` directive shown above. Public handler concepts such
as `Options`, `New`, `RootPath`, and `Close` remain familiar, while the new auth
and middleware fields are opt-in.

## Development and verification

The shortest complete local verification is:

```sh
cd ui
npm ci --no-audit --no-fund
npx playwright install --with-deps chromium
npm run typecheck
npm test
npm run build
npm run test:e2e
cd ..

go test -race ./...
go vet ./...
(cd integration/frameworks && go test -race ./...)
```

Integration tests use Redis when `ASYNQMON_TEST_REDIS_ADDR` is set:

```sh
ASYNQMON_TEST_REDIS_ADDR=127.0.0.1:6379 go test -race ./...
```

The browser suite starts its own fixture server and does not mutate your Redis
instance. See [`ui/README.md`](ui/README.md) for frontend development details
and [`docs/HANDOFF.fa.md`](docs/HANDOFF.fa.md) for the Persian implementation
and validation record.

## Verify a release

Download all archives plus `checksums.txt` into one directory, then verify their
contents on Linux:

```sh
sha256sum --check checksums.txt
```

On macOS, use the system `shasum` command instead:

```sh
shasum -a 256 --check checksums.txt
```

With the GitHub CLI installed, verify that GitHub Actions built an individual
asset from this repository:

```sh
gh attestation verify \
  asynqmon_vX.Y.Z_linux_amd64.tar.gz \
  --repo pars-aria-labs/asynqmon
```

Containers published by the release workflow include an SBOM and
registry-backed provenance. Use immutable tags or digests when promoting an
image between environments.

## License and attribution

This project is distributed under the [MIT License](LICENSE). It is derived
from [Asynqmon by Ken Hibino and its contributors](https://github.com/hibiken/asynqmon),
and the existing copyright notice remains intact.

The original Asynqmon logo was created by
[Vic Shóstak](https://github.com/koddr) and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
