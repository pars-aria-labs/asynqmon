<img src="https://user-images.githubusercontent.com/11155743/114745460-57760500-9d57-11eb-9a2c-43fa88171807.png" alt="Asynqmon logo" width="360px" />

# Web UI for monitoring & administering [Asynq](https://github.com/pars-aria-labs/asynq) task queue

## Overview

Asynqmon is a web UI for monitoring and administering [Asynq](https://github.com/pars-aria-labs/asynq) queues and tasks.
It supports integration with [Prometheus](https://prometheus.io) to display time-series data.

Asynqmon is both a library that you can include in your web application, as well as a binary that you can simply install and run.

## Source and fork provenance

This repository is an independent continuation of the original MIT-licensed
Asynqmon project. Its imported history baseline is commit
[`8bf6ad3618d90570102589ee2c8e2e891d07547f`](https://github.com/pars-aria-labs/asynqmon/commit/8bf6ad3618d90570102589ee2c8e2e891d07547f).
Original copyright notices, the MIT license, and Git history are preserved.

The changes maintained here include:

- compatibility with `github.com/pars-aria-labs/asynq` and its `x` module;
- a canonical Go module identity at `github.com/pars-aria-labs/asynqmon`;
- bounded bulk delete, run, and archive operations, with visible UI progress;
- safer release automation, a Go 1.25 toolchain, and an organization-owned GHCR target.

This independently maintained fork is published under the Pars Aria Labs
namespace. Applications should import both Asynq and Asynqmon from that
namespace so builds consistently use the features documented here.

## Version compatibility

Choose an Asynqmon version that matches the Asynq version used by your workers:

| Asynq version          | Web UI version       |
| ---------------------- | -------------------- |
| Pars Aria Labs 0.27.x  | 0.8.x                |
| 0.23.x                 | 0.7.x                |
| 0.22.x                 | 0.6.x                |
| 0.20.x, 0.21.x         | 0.5.x                |
| 0.19.x                 | 0.4.x                |
| 0.18.x                 | 0.2.x, 0.3.x         |
| 0.16.x, 0.17.x         | 0.1.x                |

The current `main` branch pins both Pars Aria Labs modules to `v0.27.1`. Keep
the root and `x` dependencies on the same release when updating a checkout.

### Bounded bulk operations

When the Asynq dependency provides the batch Inspector APIs, bulk delete, run,
and archive actions process at most 500 tasks per request and show progress in
the UI. Each action freezes its initial work budget, so concurrent producers
cannot keep it running indefinitely.

The existing endpoint paths and response fields remain compatible. With an
older Asynq dependency, the server falls back to the legacy one-request
operation; the UI detects the missing `remaining` field and does not repeat the
mutation. If a mutation commits but the follow-up progress read fails, the error
response includes the confirmed `processed` count and the UI reports it without
automatically retrying. Basic authentication and read-only restrictions continue
to apply to the same endpoints.

## Install the binary

> **Artifact provenance matters:** use source, binaries, and container images
> published by `pars-aria-labs` when you need the features described in this
> README. Artifacts from other namespaces may represent a different codebase.

### Build and install from source

Building the complete application requires Go 1.25, Node.js 24 LTS, and Yarn 1.x.
The following commands clone the maintained source, rebuild the UI, and produce
an `asynqmon` binary in the repository root:

```bash
git clone https://github.com/pars-aria-labs/asynqmon.git
cd asynqmon
npm install --global yarn@1.22.22
make build
./asynqmon --help
```

The generated UI is committed under `ui/build`. If you trust those checked-in
assets and only need to install the Go binary into `GOBIN`, Node.js and Yarn are
not required:

```bash
go install github.com/pars-aria-labs/asynqmon/cmd/asynqmon@v0.8.0
asynqmon --help
```

The second form installs the executable to `GOBIN`, or to `GOPATH/bin` when
`GOBIN` is unset. Run `go env GOBIN GOPATH` if the `asynqmon` command is not on
your shell's `PATH`.

### Release binaries and container images

The `v0.8.0` source is published under the canonical repository's
[version tags](https://github.com/pars-aria-labs/asynqmon/tags). Binary assets
appear on the [releases page](https://github.com/pars-aria-labs/asynqmon/releases)
when a release bundle is published. After a maintainer explicitly publishes a
container, pull a specific version from GHCR:

```bash
# Replace VERSION with a tag shown on the package page.
docker pull ghcr.io/pars-aria-labs/asynqmon:VERSION
```

No image is published automatically when code is pushed. Changes that affect
the image are built in CI, but only a manual workflow run with its `publish`
switch enabled can send an image to `ghcr.io/pars-aria-labs/asynqmon`. To
publish a semantic version, create the corresponding Git tag, select that tag
in the workflow's **Use workflow from** control, and enable `publish`.
Dispatching the workflow from `main` produces only an immutable `sha-*` image
tag.

### Build a container locally

To build and run a local image without publishing it to a registry (Docker may
still pull the declared base images):

```bash
docker build --tag asynqmon:local .
docker run --rm --name asynqmon -p 8080:8080 \
  asynqmon:local --redis-addr=host.docker.internal:6379
```

The `make docker` target performs the same kind of local build-and-run cycle.

## Run the binary

To use the defaults, start the process and open
[http://localhost:8080](http://localhost:8080).

```bash
# with a binary
./asynqmon

# with the locally built Docker image
docker run --rm \
    --name asynqmon \
    -p 8080:8080 \
    asynqmon:local --redis-addr=host.docker.internal:6379
```

By default, Asynqmon web server listens on port `8080` and connects to a Redis server running on `127.0.0.1:6379`.
Inside a container, `127.0.0.1` refers to that container, so pass the reachable
Redis address explicitly. On Linux, add
`--add-host=host.docker.internal:host-gateway` when the Docker engine does not
provide that hostname automatically.

To see all available flags, run:

```bash
# with a binary
./asynqmon --help

# with the locally built Docker image
docker run --rm asynqmon:local --help
```

Here's the available flags:

_Note_: Use `--redis-url` to specify the address, database number, and password
in one value. Alternatively, use `--redis-addr`, `--redis-db`, and
`--redis-password` separately.

| Flag                              | Env                       | Description                                                                                                                  | Default          |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `--port`(int)                     | `PORT`                    | port number to use for web ui server                                                                                         | 8080             |
| `--redis-url`(string)             | `REDIS_URL`               | URL to Redis or Sentinel. See [godoc](https://pkg.go.dev/github.com/pars-aria-labs/asynq#ParseRedisURI) for supported formats | ""               |
| `--redis-addr`(string)            | `REDIS_ADDR`              | address of redis server to connect to                                                                                        | "127.0.0.1:6379" |
| `--redis-db`(int)                 | `REDIS_DB`                | redis database number                                                                                                        | 0                |
| `--redis-password`(string)        | `REDIS_PASSWORD`          | password to use when connecting to redis server                                                                              | ""               |
| `--redis-cluster-nodes`(string)   | `REDIS_CLUSTER_NODES`     | comma separated list of host:port addresses of cluster nodes                                                                 | ""               |
| `--redis-prefix`(string)          | `REDIS_PREFIX`            | prefix used for asynq redis keys                                                                                             | ""               |
| `--redis-tls`(string)             | `REDIS_TLS`               | server name for TLS validation used when connecting to redis server                                                          | ""               |
| `--redis-insecure-tls`(bool)      | `REDIS_INSECURE_TLS`      | disable TLS certificate host checks                                                                                          | false            |
| `--enable-metrics-exporter`(bool) | `ENABLE_METRICS_EXPORTER` | enable prometheus metrics exporter to expose queue metrics                                                                   | false            |
| `--prometheus-addr`(string)       | `PROMETHEUS_ADDR`         | address of prometheus server to query time series                                                                            | ""               |
| `--read-only`(bool)               | `READ_ONLY`               | use web UI in read-only mode                                                                                                 | false            |
| `--basic-auth-username`(string)   | `BASIC_AUTH_USERNAME`     | username for HTTP basic authentication                                                                                       | ""               |
| `--basic-auth-password`(string)   | `BASIC_AUTH_PASSWORD`     | password for HTTP basic authentication                                                                                       | ""               |
| `--max-payload-length`(int)       | `MAX_PAYLOAD_LENGTH`      | maximum number of UTF-8 characters displayed from a task payload                                                             | 200              |
| `--max-result-length`(int)        | `MAX_RESULT_LENGTH`       | maximum number of UTF-8 characters displayed from a task result                                                              | 200              |

Basic authentication is enabled only when both `--basic-auth-username` and `--basic-auth-password` are set, or both corresponding environment variables are set.

### Connecting to Redis

To connect to a **single redis server**, use either `--redis-url` or (`--redis-addr`, `--redis-db`, and `--redis-password`).

Example:

```sh
$ ./asynqmon --redis-url=redis://:mypassword@localhost:6380/2

$ ./asynqmon --redis-addr=localhost:6380 --redis-db=2 --redis-password=mypassword
```

The Redis prefix must exactly match the value used by producers, workers, and
other administration tools. If a prefix contains Redis hash-tag braces, its
first `{...}` pair must not be empty; for example, `tenant{billing}` is valid,
while `tenant{}` is rejected during startup. This prevents multi-key operations
from failing later with Redis Cluster `CROSSSLOT` errors.

To connect to **redis-sentinels**, use `--redis-url`.

Example:

```sh
$ ./asynqmon --redis-url=redis-sentinel://:mypassword@localhost:5000,localhost:5001,localhost:5002?master=mymaster
```

To connect to a **redis-cluster**, use `--redis-cluster-nodes`.

Example:

```sh
$ ./asynqmon --redis-cluster-nodes=localhost:7000,localhost:7001,localhost:7002,localhost:7003,localhost:7004,localhost:7006
```

### Integration with Prometheus

The two Prometheus options solve different parts of the integration:

- `--enable-metrics-exporter` exposes current queue metrics at `/metrics`.
- `--prometheus-addr` lets the dashboard query a Prometheus server for historical
  time-series data.

First, start Asynqmon with the exporter enabled:

```bash
./asynqmon --redis-addr=127.0.0.1:6379 --enable-metrics-exporter
```

Then configure Prometheus to scrape that Asynqmon process. In a container
network where the service is named `asynqmon`, the relevant part of
`prometheus.yml` is:

```yaml
scrape_configs:
  - job_name: asynqmon
    static_configs:
      - targets: ["asynqmon:8080"]
```

If Asynqmon basic authentication is enabled, `/metrics` is protected too. Give
Prometheus the same credentials in that scrape job:

```yaml
scrape_configs:
  - job_name: asynqmon
    basic_auth:
      username: "metrics-reader"
      password: "replace-with-a-secret"
    static_configs:
      - targets: ["asynqmon:8080"]
```

Prefer loading the password from your deployment's secret mechanism instead of
committing a real credential to `prometheus.yml`.

After Prometheus has collected samples, give its base URL to Asynqmon to enable
the metrics view:

```bash
./asynqmon \
    --redis-addr=127.0.0.1:6379 \
    --enable-metrics-exporter \
    --prometheus-addr=http://127.0.0.1:9090
```

<img width="1532" alt="Screen Shot 2021-12-19 at 4 37 19 PM" src="https://user-images.githubusercontent.com/10953044/146696852-25916465-07f0-4ed5-af31-18be02390bcb.png">

### Examples

```bash
# with a local binary; custom port and connect to redis server at localhost:6380
./asynqmon --port=3000 --redis-addr=localhost:6380

# with prometheus integration enabled
./asynqmon --enable-metrics-exporter --prometheus-addr=http://localhost:9090

# with a locally built Docker image (connect to Redis on the host)
docker run --rm \
    --name asynqmon \
    -p 3000:3000 \
    asynqmon:local --port=3000 --redis-addr=host.docker.internal:6380

# with a locally built Docker image and a shared Docker network
docker run --rm \
    --name asynqmon \
    --network dev-network \
    -p 8080:8080 \
    asynqmon:local --redis-addr=dev-redis:6379
```

Next, go to [localhost:8080](http://localhost:8080) and see Asynqmon dashboard:

![Web UI Queues View](https://user-images.githubusercontent.com/11155743/114697016-07327f00-9d26-11eb-808c-0ac841dc888e.png)

**Tasks view**

![Web UI TasksView](https://user-images.githubusercontent.com/11155743/114697070-1f0a0300-9d26-11eb-855c-d3ec263865b7.png)

**Settings and adaptive dark mode**

![Web UI Settings and adaptive dark mode](https://user-images.githubusercontent.com/11155743/114697149-3517c380-9d26-11eb-9f7a-ae2dd00aad5b.png)

## Import as a library

Asynqmon can also be mounted inside an existing Go web application. Add the
canonical module to your application, then import it from the Pars Aria Labs
namespace:

```bash
go get github.com/pars-aria-labs/asynqmon@v0.8.0
```

Version `v0.8.0` is the first release using this canonical module path. Keep the
Asynq root and `x` dependencies on matching versions.

### Migrating an existing library integration

Replace the previous Asynqmon import with
`github.com/pars-aria-labs/asynqmon`, remove any obsolete local `replace`
directive that selected another checkout, and then reconcile the module graph:

```bash
go get github.com/pars-aria-labs/asynqmon@v0.8.0
go mod tidy
go test ./...
```

No handler API change is required solely for this module-path migration; the
package name remains `asynqmon`.

Example with [net/http](https://pkg.go.dev/net/http):

```go
package main

import (
	"log"
	"net/http"

	"github.com/pars-aria-labs/asynq"
	"github.com/pars-aria-labs/asynqmon"
)

func main() {
	h := asynqmon.New(asynqmon.Options{
		RootPath: "/monitoring", // RootPath specifies the root for asynqmon app
		RedisConnOpt: asynq.RedisClientOpt{Addr: ":6379"},
	})

	// net/http.ServeMux requires the trailing slash here.
	http.Handle(h.RootPath()+"/", h)

	// Go to http://localhost:8080/monitoring to see asynqmon homepage.
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

Example with [gorilla/mux](https://pkg.go.dev/github.com/gorilla/mux):

```go
package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/pars-aria-labs/asynq"
	"github.com/pars-aria-labs/asynqmon"
)

func main() {
	h := asynqmon.New(asynqmon.Options{
		RootPath: "/monitoring", // RootPath specifies the root for asynqmon app
		RedisConnOpt: asynq.RedisClientOpt{Addr: ":6379"},
	})

	r := mux.NewRouter()
	r.PathPrefix(h.RootPath()).Handler(h)

	srv := &http.Server{
		Handler: r,
		Addr:    ":8080",
	}

	// Go to http://localhost:8080/monitoring to see asynqmon homepage.
	log.Fatal(srv.ListenAndServe())
}
```

Example with [labstack/echo](https://github.com/labstack/echo):

```go
package main

import (
	"log"

	"github.com/labstack/echo/v4"
	"github.com/pars-aria-labs/asynq"
	"github.com/pars-aria-labs/asynqmon"
)

func main() {
	e := echo.New()

	mon := asynqmon.New(asynqmon.Options{
		RootPath: "/monitoring/tasks",
		RedisConnOpt: asynq.RedisClientOpt{
			Addr: ":6379",
			Password: "",
			DB: 0,
		},
	})
	e.Any("/monitoring/tasks/*", echo.WrapHandler(mon))
	log.Fatal(e.Start(":8080"))
}
```

## License

Copyright (c) 2019-present Ken Hibino and Contributors. `Asynqmon` is free and open-source software licensed under the local [MIT License](LICENSE). Official logo was created by [Vic Shóstak](https://github.com/koddr) and distributed under [Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/) license (CC0 1.0 Universal).
