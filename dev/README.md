# Local demo

Run the updated UI against real Redis queues and synthetic work with Docker
Engine and Docker Compose. Go and Node.js do not need to be installed on the
host.

From the repository root:

```sh
docker compose -f compose.demo.yaml up --build -d --wait
# Or: make demo
```

Open **http://localhost:8080**. The first build downloads the Go/Node
dependencies and container images. Allow about a minute after startup for
completed, retry, and archived tasks and the first Prometheus samples to appear.

If port 8080 is occupied:

```sh
ASYNQMON_PORT=8081 docker compose -f compose.demo.yaml up --build -d --wait
```

Open http://localhost:8081 in that case. Only the dashboard is published, bound
to localhost. Redis and Prometheus are reachable inside this Compose project.
The stack has its own Redis instance and does not use existing Redis containers
or application data.

## What to try

- **Queues:** search `emails`, inspect `default`, and pause/resume a queue to see
  its pending tasks accumulate.
- **Active / Pending:** long-running `demo:work` jobs keep background activity visible.
- **Completed:** successful tasks retain their payload and result for one hour.
- **Retry:** `demo:retry` fails twice with a 20-second retry delay, then succeeds.
- **Archived:** `demo:archive` fails deliberately with no retries. Run it again or delete it from the UI.
- **Scheduled:** `demo:report` starts two minutes after it is enqueued.
- **Schedulers:** one recurring entry enqueues `demo:scheduled` every minute.
- **Servers:** one worker process with concurrency two and three queues.
- **Metrics:** Prometheus scrapes every five seconds; rate charts need a few
  samples before showing data.

Seven tasks are added every 30 seconds. No emails are actually sent and no
external services are called by task handlers. To stop adding and processing
tasks while leaving the dashboard running:

```sh
docker compose -f compose.demo.yaml stop demo
# Resume later:
docker compose -f compose.demo.yaml start demo
```

## Logs, rebuild, and reset

```sh
docker compose -f compose.demo.yaml ps
docker compose -f compose.demo.yaml logs -f demo dashboard
# Or: make demo-logs

# Rebuild after editing UI or Go code:
docker compose -f compose.demo.yaml up --build -d --wait

# Stop and remove this demo stack (also discards its test data):
docker compose -f compose.demo.yaml down
# Or: make demo-down
```

Redis and Prometheus use temporary in-memory storage. Restarting those
containers resets their data. Stop the demo when done: the generator
intentionally keeps adding tasks until stopped.

For frontend hot reload, keep this stack on port 8080, then run `npm start` from
`ui/` and open http://localhost:3000. Vite proxies API requests to the demo
backend on port 8080. The development HTML keeps the Metrics route visible but
does not have the Go server's boolean “Prometheus configured” marker, so it
shows the setup guide. The actual Prometheus URL stays on the Go server and is
never embedded in browser HTML. Use the built dashboard on port 8080 to
exercise live Prometheus charts.

## When Docker Hub downloads are unavailable

There is also a prebuilt-binary fallback. It requires Go on the host and uses
the existing `ui/build` assets. Build those assets first if you changed the
frontend. Select Redis and Prometheus images that are already cached, for
example:

```sh
DEMO_REDIS_IMAGE=redis:8-trixie \
DEMO_PROMETHEUS_IMAGE=prom/prometheus:latest \
make demo-prebuilt
```

The fallback builds two Linux executables into ignored `dev/bin/` and packages
them in scratch images, so it does not download Node or Go builder images. If
those executables are already built, start directly with:

```sh
DEMO_REDIS_IMAGE=redis:8-trixie \
DEMO_PROMETHEUS_IMAGE=prom/prometheus:latest \
docker compose -f compose.demo.yaml -f dev/compose.prebuilt.yaml up --build -d --wait
```

Both modes use the same demo project. `make demo-down` stops either mode.
