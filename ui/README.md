# Asynqmon UI

React 18, TypeScript 5, Material UI 7, Recharts 3, and Vite power the
frontend. The monitoring views share a Redux data layer and the server API.
Styles use Emotion; older hook-based components use `tss-react` instead of
JSS.

## Development

Use Node.js 22.12+ and npm:

```sh
cd ui
npm ci
npm start
```

Open http://localhost:3000. Vite proxies `/api` to the Go server on
`127.0.0.1:8080`. Run the backend with your Redis configuration in another
terminal. The UI does not include demo data.

```sh
# From the repository root; needs Go as specified in go.mod.
make api
./api --redis-addr=127.0.0.1:6379
```

The Metrics entry remains visible in development, but Vite does not have the
Go server's runtime “Prometheus configured” marker. It therefore shows the
setup guide. Use the embedded production UI or the Compose demo to exercise
live charts.

## Checks and production build

```sh
npm run typecheck
npm test
npm run build
```

The build produces `ui/build`, which is embedded in the Go binary. From the
repository root, `make build` installs the locked frontend dependencies, builds
the UI, and compiles the binary. Docker and the release workflow use the same
npm lockfile.

The Vite HTML plugin preserves Go's runtime `RootPath`, read-only flag, and a
boolean marker indicating whether Prometheus is configured. The Prometheus URL
from the server configuration is never embedded in browser assets or HTML.
Entry asset URLs are prefixed by the server's root path; lazy chunks resolve
relative to their own
URLs. This supports both `/` and mounts such as `/monitoring`, including direct
links to nested pages. `vite preview` alone does not evaluate Go templates; use
the Go server to preview a production build.

## Structure

- `layout/`: responsive navigation, application shell, and lazy page routes.
- `components/common/`: shared page headers and statistic cards.
- `views/`: monitoring pages and settings.
- `theme.tsx`: shared colors, typography, component styles, and light/dark themes.
- `actions/`, `reducers/`, `api.ts`: existing server operations and state management.

Polling is serial: the next request is scheduled only after the current one
settles. Every polled read receives an `AbortSignal`, and unmounting or changing
its query cancels the old generation before it can update Redux or freshness
state. The Dashboard's manual Refresh action also creates a new generation for
both the queue list and queue-history request. Even if a test adapter or network
layer resolves an aborted request late, that older payload is discarded. Pause,
resume, and delete actions cancel an older queue poll before the mutation and
refresh the queue list after it completes.

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright starts Vite and supplies local API fixtures. It also starts a real
Go process for authentication, CSRF/read-only, embedded assets, and lazy-route
checks. The suite covers URL history, queue search, task details, stale/offline
recovery, the Prometheus setup state, live metrics fixtures, mobile navigation,
and a deterministic chart screenshot without mutating a Redis instance.

The screenshot baseline is Linux-specific and stored beside
`e2e/charts.visual.spec.ts`. Review an intentional chart change locally before
updating it:

```sh
npx playwright test e2e/charts.visual.spec.ts --update-snapshots
npx playwright test e2e/charts.visual.spec.ts
```
