# Asynqmon UI

This directory contains the browser application embedded in Asynqmon. It uses
React 18, TypeScript 5, Vite 7, Material UI 7, Recharts 3, Redux Toolkit, and
Emotion. The goal is a monitoring interface that stays understandable when a
queue is busy, a network request is slow, or the dashboard is opened on a small
screen.

## Start the UI locally

Use Node.js 22.12 or newer and npm:

```sh
cd ui
npm ci --no-audit --no-fund
npm start
```

Open <http://localhost:3000>. Vite forwards `/api` requests to the Go server on
`127.0.0.1:8080`, so start the backend in another terminal:

```sh
# From the repository root.
make api
./api --redis-addr=127.0.0.1:6379
```

The development server does not invent demo data. What you see comes from the
configured backend and Redis instance.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm start` | Starts Vite with the API development proxy |
| `npm run typecheck` | Checks application and Playwright TypeScript projects |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Keeps Vitest open while files change |
| `npm run build` | Type-checks and creates the production bundle in `build/` |
| `npm run test:e2e` | Runs the Playwright browser suite |
| `npm run preview` | Serves a built Vite bundle without Go template evaluation |

Use `npm ci`, rather than `npm install`, for reproducible checks. The Dockerfile
and GitHub workflows use the same `package-lock.json`.

## How the production UI is served

`npm run build` writes `ui/build`. Go embeds that directory into the binary and
renders `index.html` at request time. A small template bridge provides only:

- the configured `RootPath`;
- whether the server is read-only;
- a boolean saying whether Prometheus is configured.

The actual Prometheus address stays on the server and is never placed in HTML
or JavaScript. Asset URLs work at `/` and below prefixes such as `/monitoring`,
including direct links to lazy-loaded routes. Because `vite preview` does not
evaluate the Go template, use the Go server when checking the final embedded
behavior.

## Code map

- `layout/` owns the responsive shell, navigation, and lazy page routes.
- `views/` contains the dashboard, tasks, metrics, Redis, server, scheduler,
  and settings screens.
- `components/common/` contains shared page headers, cards, copy tools, and
  freshness feedback.
- `actions/`, `reducers/`, and `store.ts` contain the Redux data layer.
- `api.ts` describes the server API; `request.ts` applies the shared network
  timeout and records useful failures.
- `requestStatus.ts` tracks request variants without allowing stale responses
  to make current data look fresh.
- `bulkActions.ts` coordinates bounded mutation batches and their progress.
- `theme.tsx` contains the light and dark design system.

## Request and polling behavior

Polling is serial: the next request is scheduled only after the current one
settles. Every polled read receives an `AbortSignal`. Unmounting a view or
changing its query cancels the old generation before it can update Redux or
freshness state.

The Dashboard Refresh button starts a fresh generation for both queue summaries
and queue history. Pause, resume, and delete operations also supersede an older
poll and then fetch authoritative state. This matters in real deployments,
where a slow response should never overwrite a newer operator action.

Delete-all, run-all, and archive-all actions use batches of no more than 500
tasks. The progress panel reports confirmed work, stops at the workload observed
at the beginning, and does not automatically retry an ambiguous mutation.

## Tests

Run fast checks while developing:

```sh
npm run typecheck
npm test
npm run build
```

Vitest covers routing, URL filters, polling cancellation, stale-response
protection, request status, metric controls, bounded operations, task details,
and read-only behavior.

For browser-level coverage:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright starts Vite with API fixtures and a real Go process where security
or embedded assets matter. It checks desktop and mobile navigation, queue and
task flows, authenticated/read-only behavior, recovery from stale or failed
requests, Prometheus states, lazy routes, and a deterministic chart image.

The Linux chart baseline lives beside `e2e/charts.visual.spec.ts`. When a chart
change is intentional, review the new image before accepting it:

```sh
npx playwright test e2e/charts.visual.spec.ts --update-snapshots
npx playwright test e2e/charts.visual.spec.ts
```

Before opening a change, leave the lockfile and generated `build/` output in
sync with the source, and run the type-check, unit, build, and relevant browser
tests. That small discipline keeps the embedded application and the code people
review from drifting apart.
