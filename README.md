# Asynqmon

[![Go Reference](https://pkg.go.dev/badge/github.com/pars-aria-labs/asynqmon.svg)](https://pkg.go.dev/github.com/pars-aria-labs/asynqmon)
[![Test](https://github.com/pars-aria-labs/asynqmon/actions/workflows/test.yml/badge.svg)](https://github.com/pars-aria-labs/asynqmon/actions/workflows/test.yml)
[![CodeQL](https://github.com/pars-aria-labs/asynqmon/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/pars-aria-labs/asynqmon/actions/workflows/codeql-analysis.yml)

Asynqmon is a web dashboard for understanding what is happening inside your
Asynq queues. It gives operators a clear view of queues, tasks, workers,
schedulers, Redis, and Prometheus history. You can run it as a small standalone
service or mount it inside an existing Go application.

## Where this project comes from

This project is based on the MIT-licensed
[original Asynqmon project](https://github.com/hibiken/asynqmon). The
modernization maintained here started from the preserved baseline commit
[`8bf6ad3`](https://github.com/pars-aria-labs/asynqmon/commit/8bf6ad3618d90570102589ee2c8e2e891d07547f).
The original Git history, copyright notice, and license remain intact.

This is an independently maintained project, not an official upstream release.
Its current module path is:

```text
github.com/pars-aria-labs/asynqmon
```

The code imports the Pars Aria Labs Asynq modules directly. The `v1.0.1`
line of this dashboard is built and tested with:

- `github.com/pars-aria-labs/asynq v1.0.1`
- `github.com/pars-aria-labs/asynq/x v1.0.1`

No consumer-side `replace` directive is needed.

## What changed here

- The Go module and all internal imports now use the
  `github.com/pars-aria-labs/asynqmon` identity.
- The frontend was rebuilt with React 18, TypeScript 5, Vite 7, Material UI 7,
  and Recharts 3. It now has a responsive application shell, light and dark
  themes, clearer summaries, task details, JSON tools, and shareable URL
  filters.
- Polling and manual refreshes are cancellation-aware. A late response from an
  older screen, filter, or refresh generation cannot silently replace newer
  data.
- Large “all tasks” operations run in bounded batches of at most 500 tasks and
  show progress. The initial workload is frozen, so a busy producer cannot keep
  one operator action running forever.
- Standalone and embedded deployments support Basic Auth, read-only mode,
  application middleware, cross-origin mutation protection, and anti-framing
  headers.
- Prometheus remains server-side. The browser receives only a boolean
  “configured” marker; internal URLs and credentials are not written into the
  HTML bundle.
- Prometheus queries now have cancellation, timeouts, concurrency and body-size
  limits, URL validation, and safe PromQL escaping.
- CI tests the Go and browser applications, scans both languages with CodeQL,
  smoke-tests `linux/amd64` and `linux/arm64` containers, and produces verified
  release artifacts.

## Quick start

Building the complete application requires Go 1.25, Node.js 22.12 or newer,
and npm.

```sh
git clone https://github.com/pars-aria-labs/asynqmon.git
cd asynqmon
make build
./asynqmon --redis-addr=127.0.0.1:6379
```

Open <http://localhost:8080>.

The frontend is compiled first and embedded in the Go binary, so the resulting
`asynqmon` file is self-contained. If the UI has already been built, `make api`
is a quicker backend-only build for development.

### Release binary

Releases produced by the current workflow contain Linux, macOS, and Windows
archives for `amd64` and `arm64`, plus `checksums.txt`. Download the archive for your platform from
[GitHub Releases](https://github.com/pars-aria-labs/asynqmon/releases), extract
it, and run `asynqmon` (`asynqmon.exe` on Windows).

### Container

After the release workflow has completed, the same version is available for
`linux/amd64` and `linux/arm64`:

```sh
docker run --rm \
  --name asynqmon \
  --add-host=host.docker.internal:host-gateway \
  --publish 127.0.0.1:8080:8080 \
  ghcr.io/pars-aria-labs/asynqmon:v1.0.1 \
  --redis-addr=host.docker.internal:6379
```

Use a versioned tag—or, for immutable deployments, an image digest—instead of
`latest` in production.

## Configuration

Every command-line option has a matching environment variable:

| Flag | Environment variable | Purpose | Default |
| --- | --- | --- | --- |
| `--port` | `PORT` | HTTP listening port | `8080` |
| `--redis-url` | `REDIS_URL` | Redis or Sentinel connection URL | empty |
| `--redis-addr` | `REDIS_ADDR` | Single Redis address | `127.0.0.1:6379` |
| `--redis-db` | `REDIS_DB` | Redis database number | `0` |
| `--redis-password` | `REDIS_PASSWORD` | Redis password | empty |
| `--redis-cluster-nodes` | `REDIS_CLUSTER_NODES` | Comma-separated cluster seed addresses | empty |
| `--redis-prefix` | `REDIS_PREFIX` | Prefix for Asynq Redis keys | empty |
| `--redis-tls` | `REDIS_TLS` | Server name used for TLS verification | empty |
| `--redis-insecure-tls` | `REDIS_INSECURE_TLS` | Disable TLS host verification | `false` |
| `--max-payload-length` | `MAX_PAYLOAD_LENGTH` | Maximum payload characters displayed in tables | `200` |
| `--max-result-length` | `MAX_RESULT_LENGTH` | Maximum result characters displayed in tables | `200` |
| `--read-only` | `READ_ONLY` | Reject queue and task mutations | `false` |
| `--basic-auth-username` | `BASIC_AUTH_USERNAME` | HTTP Basic Auth username | empty |
| `--basic-auth-password` | `BASIC_AUTH_PASSWORD` | HTTP Basic Auth password | empty |
| `--enable-metrics-exporter` | `ENABLE_METRICS_EXPORTER` | Expose current queue metrics at `/metrics` | `false` |
| `--prometheus-addr` | `PROMETHEUS_ADDR` | Prometheus URL used for historical charts | empty |

Run `./asynqmon --help` for the authoritative list; printing help is a successful
operation and exits with status `0`. Both Basic Auth values must be set together.
Secret-bearing environment defaults are deliberately omitted from help output,
so a password or internal URL is not echoed into a terminal or log.

### Redis examples

Connect to a single instance with either a URL or separate settings:

```sh
./asynqmon --redis-url='redis://:secret@localhost:6380/2'

./asynqmon \
  --redis-addr=localhost:6380 \
  --redis-db=2 \
  --redis-password='secret'
```

For Sentinel, include every endpoint and the master name in the URL:

```sh
./asynqmon \
  --redis-url='redis-sentinel://:secret@sentinel-1:5000,sentinel-2:5001?master=mymaster'
```

For Redis Cluster, provide the seed nodes:

```sh
./asynqmon \
  --redis-cluster-nodes='redis-1:7000,redis-2:7001,redis-3:7002'
```

Keep TLS verification enabled in production. `--redis-insecure-tls` is meant
only for controlled development environments.

## Bounded bulk operations

The dashboard processes delete, run, and archive-all actions in batches of at
most 500 tasks. It remembers the amount of work seen by the first response and
stops after that budget is exhausted, even if producers continue adding tasks.
Authentication, read-only mode, and cross-origin protection apply to every
batch request exactly as they do to any other mutation.

The UI handles this protocol automatically. An API client can opt in by adding
`batch_size`:

```sh
curl --user "$ASYNQMON_USER:$ASYNQMON_PASS" \
  --request POST \
  'https://monitor.example.com/api/queues/critical/scheduled_tasks:run_all?batch_size=500'
```

A successful response reports both confirmed work and what remains:

```json
{"remaining":23,"scheduled":500}
```

Repeat with a limit no larger than 500 until `remaining` is zero. If the
follow-up count fails after Redis has committed a mutation, the error response
includes `processed`; do not blindly retry an ambiguous mutation. Older
Asynqmon builds that do not support the bounded API continue to use the
original single-request behavior.

## Prometheus: exporter and chart history

Two settings solve two different jobs:

1. `--enable-metrics-exporter` exposes current Asynq metrics from this process
   at `/metrics`.
2. `--prometheus-addr` tells Asynqmon where to query stored time-series data for
   its charts.

Start Asynqmon with both:

```sh
./asynqmon \
  --redis-addr=redis:6379 \
  --enable-metrics-exporter \
  --prometheus-addr=http://prometheus:9090
```

Then ask Prometheus to scrape it:

```yaml
scrape_configs:
  - job_name: asynqmon
    scrape_interval: 5s
    static_configs:
      - targets: ["asynqmon:8080"]
```

If the standalone server uses Basic Auth, Prometheus needs the same credentials
because `/metrics` is protected too. Prefer a mounted secret file over an
inline password:

```yaml
scrape_configs:
  - job_name: asynqmon
    static_configs:
      - targets: ["asynqmon:8080"]
    basic_auth:
      username: monitor
      password_file: /run/secrets/asynqmon_password
```

The browser never talks directly to Prometheus. Chart requests go through the
same-origin `/api/metrics` endpoint, while the real Prometheus address stays on
the server. Paths such as `https://example.com/prometheus` are supported. Each
upstream query has a ten-second timeout. A request may cover from one second to
30 days; the raw query string is capped at 32 KiB and the decoded `queues`
parameter at 16 KiB. Asynqmon reads at most 4 MiB from any one Prometheus
response and 24 MiB across the complete chart request. At most two chart
requests run concurrently; extra requests receive `503 Service Unavailable`
with `Retry-After: 1`, so clients know when to try again.

When Asynqmon is embedded as a library, `Options.PrometheusAddress` enables
chart queries only. The host application owns its Prometheus registry and
scrape route:

```go
inspector := asynq.NewInspector(redisOptions)
defer inspector.Close()

registry := prometheus.NewRegistry()
registry.MustRegister(metrics.NewQueueMetricsCollector(inspector))

mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
```

Protect that host-owned route with your network policy or application
middleware.

## Secure deployment

For a read-only standalone dashboard protected by Basic Auth:

```sh
export BASIC_AUTH_USERNAME='monitor'
export BASIC_AUTH_PASSWORD='load-this-from-a-secret-manager'
export READ_ONLY=true
./asynqmon --redis-addr=redis.internal:6379
```

Basic Auth encodes credentials; it does not encrypt them. Terminate HTTPS at
the application or a trusted reverse proxy before exposing the dashboard
outside a private development network. Avoid putting passwords in shell
history, image arguments, or source control.

Read-only mode returns `405 Method Not Allowed` for mutations. Unsafe
cross-origin browser requests are rejected, and responses include both
`Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.
These safeguards complement authentication; they do not replace it.

## Use Asynqmon as a Go library

Once the `v1.0.1` release workflow has completed, install the dashboard and its
matching queue modules:

```sh
go get github.com/pars-aria-labs/asynqmon@v1.0.1
go get github.com/pars-aria-labs/asynq@v1.0.1
go get github.com/pars-aria-labs/asynq/x@v1.0.1
go mod tidy
```

Here is a small, production-minded `net/http` example:

```go
package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pars-aria-labs/asynq"
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
	// The trailing slash mounts the entire dashboard subtree.
	mux.Handle(monitor.RootPath()+"/", monitor)

	server := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil &&
		!errors.Is(err, http.ErrServerClosed) {
		log.Printf("asynqmon stopped: %v", err)
	}
}
```

Open <http://localhost:8080/monitoring/>. Do not use `http.StripPrefix` here;
`RootPath` must match the route on which the handler is mounted. Call `Close`
during shutdown so the Redis resources owned by the handler are released.

`Options.Middleware` can wrap the complete handler when the host already has a
session, JWT, or SSO layer. If custom middleware and built-in Basic Auth are
both configured, both checks must succeed.

## Development and verification

The frontend has its own focused guide in [`ui/README.md`](ui/README.md). A
complete local check looks like this:

```sh
cd ui
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
cd ..

ASYNQMON_TEST_REDIS_ADDR=127.0.0.1:6379 go test -race -count=1 ./...
go vet ./...
mkdir -p bin
CGO_ENABLED=0 go build -o ./bin/asynqmon ./cmd/asynqmon
```

The Redis-backed tests use isolated prefixes and clean up their queues. Without
`ASYNQMON_TEST_REDIS_ADDR`, those integration cases are skipped.

## Maintainer release checklist

Releases are tag-driven. Before tagging, make sure the exact commit is already
on `main` and that Test plus both CodeQL analyses are green. Protect `main` from
force-pushes and protect `v*` tags from updates or deletion. Repository Actions
must be allowed to create Releases, publish packages, and write attestations.

Create an annotated or signed SemVer tag on that verified commit:

```sh
git switch main
git pull --ff-only
git status --short
git tag -s v1.0.1 -m 'Asynqmon v1.0.1'
git push origin v1.0.1
```

Use `git tag -a` instead of `-s` only when release signing is not available.
Do not create a GitHub Release manually. The tag starts the Release workflow,
which validates the tag, reruns tests and CodeQL, builds six archives, generates
checksums and provenance, publishes a multi-architecture GHCR image, uploads
the assets to a draft, and publishes the Release only after the required jobs
succeed. Stable releases update `latest`; pre-releases do not.

A new GHCR package may initially be private. Private pulls require a classic
personal access token with `read:packages`, plus SSO authorization when the
organization requires it. Making a package public is an explicit maintainer
decision.

If a workflow job fails, correct the cause and rerun the failed jobs. Never move
or replace a published release tag; publish a patch release instead.

### Verify release artifacts

After downloading all archives and `checksums.txt` into one directory:

```sh
sha256sum --check checksums.txt

gh attestation verify \
  asynqmon_v1.0.1_linux_amd64.tar.gz \
  --repo pars-aria-labs/asynqmon

docker buildx imagetools inspect \
  ghcr.io/pars-aria-labs/asynqmon:v1.0.1
```

Pin the reported container digest when promoting an image to production.

## License and attribution

Asynqmon is distributed under the [MIT License](LICENSE). It is derived from
the original Asynqmon work by Kentaro Hibino and its contributors; the existing
copyright notice remains in place.

The original logo was created by
[Vic Shóstak](https://github.com/koddr) and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
