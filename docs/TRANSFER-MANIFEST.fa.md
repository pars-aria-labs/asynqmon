# نقشهٔ انتقال و مهاجرت

این manifest مسیرهایی را مشخص می‌کند که در نوسازی Asynqmon اضافه، جایگزین یا
حذف شده‌اند. برای انتقال تغییرات به clone دیگر، commitهای این branch را منتقل
کنید؛ کپی کردن انتخابی فایل‌ها ممکن است assetهای قدیمی CRA را باقی بگذارد.

## تغییر هویت module

module ریشه از `github.com/hibiken/asynqmon` به مسیر زیر تغییر کرده است:

```text
github.com/pars-aria-labs/asynqmon
```

ماژول تست adapterها نیز اکنون
`github.com/pars-aria-labs/asynqmon/integration/frameworks` است. importهای
`github.com/hibiken/asynq` نباید به‌صورت مکانیکی تغییر کنند؛ fork Parsidev همین
module identity را اعلام می‌کند و از راه `replace` انتخاب می‌شود.

## مسیرهای جدید مهم

```text
.github/workflows/test.yml
auth.go
auth_test.go
cmd/demo/
compose.demo.yaml
dev/
docs/HANDOFF.fa.md
docs/TRANSFER-MANIFEST.fa.md
integration/frameworks/
library_integration_test.go
metrics_handler_test.go
static_test.go
ui/index.html
ui/package-lock.json
ui/playwright.config.ts
ui/tsconfig.e2e.json
ui/vite.config.ts
ui/e2e/
ui/src/actions/metricsActions.test.ts
ui/src/components/common/
ui/src/components/MetricsFetchControls.test.tsx
ui/src/hooks/index.test.tsx
ui/src/hooks/useURLFilters.ts
ui/src/layout/
ui/src/metricsLimits.ts
ui/src/request.ts
ui/src/request.test.ts
ui/src/requestStatus.ts
ui/src/types/preferences.ts
ui/src/utils.test.ts
ui/build/assets/
```

workflowهای `release.yml` و `codeql-analysis.yml` جایگزین نسخه‌های قدیمی
شده‌اند. workflow مستقل `docker-image-publish.yml` عمداً حذف شده، چون image
upstream را در Docker Hub هدف می‌گرفت؛ انتشار container اکنون بخشی از workflow
Release و مقصد آن GHCR همین repository است.

## مسیرهای عمداً حذف‌شده

```text
.github/workflows/docker-image-publish.yml
ui/yarn.lock
ui/public/index.html
ui/src/serviceWorker.ts
ui/src/components/ListItemLink.tsx
ui/build/asset-manifest.json
ui/build/static/js/*
ui/build/static/media/logo-*.svg
```

این فایل‌ها متعلق به زنجیرهٔ CRA/Webpack قبلی‌اند. خروجی جدید Vite در
`ui/build/assets/` قرار می‌گیرد و نام فایل‌های آن content-hash دارد؛ بنابراین
پس از هر تغییر frontend باید `npm run build` یا `make build` اجرا و کل خروجی
جدید جایگزین شود.

## فایل‌هایی که نباید منتقل یا commit شوند

```text
ui/node_modules/
dev/bin/
ui/playwright-report/
ui/test-results/
باینری‌های محلی ./api و ./asynqmon
فایل‌های موقت زیر /tmp
```

پس از انتقال، راه‌اندازی تمیز و مستقل از cache را با دستورهای زیر بررسی کنید:

```sh
cd ui
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run test:e2e
cd ..

go test -race ./...
go vet ./...
(cd integration/frameworks && go test -race ./...)
```
