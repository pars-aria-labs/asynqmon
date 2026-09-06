# گزارش پیاده‌سازی و اعتبارسنجی Asynqmon

این سند خلاصهٔ فنی تغییراتی است که روی fork جدید Asynqmon انجام شده است. راهنمای
اصلی نصب، اجرا، امنیت، Prometheus و استفادهٔ کتابخانه‌ای در
[`README.md`](../README.md) قرار دارد؛ این فایل بیشتر برای مرور تصمیم‌های
پیاده‌سازی و وضعیت اعتبارسنجی نگه‌داری می‌شود.

## نتیجهٔ نهایی

تمام موارد اجراییِ مشخص‌شده برای این مرحله پیاده‌سازی شده‌اند:

- نام module به `github.com/pars-aria-labs/asynqmon` تغییر کرده است.
- رابط قدیمی CRA/React 16 با React 18، TypeScript 5، Vite، Material UI 7 و
  Recharts 3 جایگزین شده است.
- احراز هویت، حالت read-only و محافظت در برابر mutationهای cross-origin در
  backend اضافه و تست شده‌اند.
- چرخهٔ request و polling در برابر unmount، تغییر query، پاسخ دیررس، قطعی موقت
  و دادهٔ stale مقاوم شده است.
- Metrics همیشه قابل کشف است؛ در نبود Prometheus به‌جای صفحهٔ خراب یا منوی
  مخفی، راهنمای راه‌اندازی نمایش داده می‌شود.
- ارتباط backend با Prometheus محدودیت زمان و اندازه، validation و نگاشت خطای
  روشن دارد.
- demo واقعی Redis/worker/Prometheus، تست مرورگر، visual regression، تست
  adapterهای Gin/Echo و workflowهای CI/release اضافه یا نوسازی شده‌اند.

## منشأ سورس و هویت module

این پروژه یک fork مستقل از
[`github.com/hibiken/asynqmon`](https://github.com/hibiken/asynqmon) با مجوز MIT
است. نقطهٔ شروع این نوسازی، tag محلی `v0.7.2-parsidev-1` در commit
[`8bf6ad3`](https://github.com/pars-aria-labs/asynqmon/commit/8bf6ad3618d90570102589ee2c8e2e891d07547f)
از تاریخچهٔ همین پروژه بوده است. module نگه‌داری‌شدهٔ فعلی این است:

```text
github.com/pars-aria-labs/asynqmon
```

پیاده‌سازی Asynq مستقیماً از moduleهای زیر استفاده می‌کند:

```text
github.com/pars-aria-labs/asynq v0.27.1
github.com/pars-aria-labs/asynq/x v0.27.1
```

هر module هویت سازمانی متناظر خود، یعنی `github.com/pars-aria-labs/asynq` و
`github.com/pars-aria-labs/asynq/x`، را مستقیماً اعلام می‌کند؛ بنابراین importهای
برنامه نیز از همین مسیرها استفاده می‌کنند و دیگر نیازی به دستور `replace` در
این پروژه یا برنامهٔ مصرف‌کننده نیست. برای افزودن وابستگی‌ها به یک برنامهٔ
تازه می‌توان از این فرمان‌ها استفاده کرد:

```sh
go get github.com/pars-aria-labs/asynqmon@latest
go get github.com/pars-aria-labs/asynq@v0.27.1
go mod tidy
```

برای توسعه روی checkout محلی می‌توان replacement دوم را هم موقتاً افزود:

```go
replace github.com/pars-aria-labs/asynqmon => ../asynqmon
```

## تغییرات رابط کاربری

### معماری و تجربهٔ کاربری

- CRA، `react-scripts` و Yarn کنار گذاشته شده‌اند؛ build قطعی پروژه از
  `package-lock.json` و Vite استفاده می‌کند.
- shell برنامه در `ui/src/layout/` شامل routeهای lazy، drawer واکنش‌گرا برای
  موبایل و دسکتاپ، theme روشن/تیره و نشانگر read-only است.
- Dashboard، Tasks، Metrics، Servers، Schedulers، Redis Info و Settings با
  componentهای MUI جدید بازطراحی شده‌اند.
- filterهای مهم در URL ذخیره می‌شوند؛ refresh، share-link و back/forward مرورگر
  state مورد انتظار را نگه می‌دارند.
- جزئیات task، جست‌وجو و کپی JSON، نمایش payload/result/error، و اجرای مجدد
  taskهای مجاز خواناتر و قابل آزمون شده‌اند.
- componentهای مشترک مانند `PageHeader`، `StatCard`، `CopyButton`، `JsonViewer`
  و `DataFreshness` تکرار UI را کم می‌کنند.

### request، polling و freshness

هر polling ابتدا منتظر پایان request قبلی می‌ماند و سپس فاصلهٔ زمانی را حساب
می‌کند؛ بنابراین روی اتصال کند، requestهای هم‌پوشان ساخته نمی‌شوند. برای هر
نسل یک `AbortController` مستقل وجود دارد. تغییر dependency یا unmount شدن view
request فعال را لغو می‌کند و thunkها نیز پیش از dispatch نهایی دوباره
`signal.aborted` را بررسی می‌کنند. این بررسی دوم برای adapter یا mockی مهم است
که cancellation شبکه را نادیده می‌گیرد.

لغو عمدی نه success ثبت می‌شود و نه error؛ پس freshness با خروج از صفحه به
اشتباه «تازه» یا «offline» نمی‌شود. registry وضعیت request نیز queryهای مختلف
را تفکیک می‌کند و اندازهٔ آن محدود می‌ماند.

دکمهٔ Refresh در Dashboard برای هر دو منبع `queues` و `queue_stats` نسل تازه‌ای
می‌سازد و request فعال قبلی را لغو می‌کند. thunkها پس از پایان `await` نیز
لغوشدن signal را بررسی می‌کنند؛ بنابراین حتی اگر adapter یا mock پاسخ request
لغوشده را دیرتر تحویل دهد، آن پاسخ نمی‌تواند state جدیدتر را بازنویسی کند.
عملیات pause، resume و delete نیز ابتدا نسل قدیمی خواندن queueها را لغو می‌کنند
و پس از پایان mutation، وضعیت معتبر را دوباره از server می‌گیرند؛ در نتیجه یک
poll متعلق به پیش از mutation نمی‌تواند نتیجهٔ جدیدتر را برگرداند.

### Recharts 3 و visual regression

API کلیک و tooltip با typeهای Recharts 3 هماهنگ شده و animation seriesها برای
خروجی آزمون قطعی غیرفعال است. تست تصویری، کارت کامل Queue Size را با viewport،
timezone، theme و reduced-motion ثابت مقایسه می‌کند. راه به‌روزرسانی عمدی
baseline در [`ui/README.md`](../ui/README.md) آمده است.

## تغییرات backend و امنیت

- `Options.BasicAuthUsername` و `Options.BasicAuthPassword` کل handler
  مانیتورینگ، شامل HTML، assetها و API را محافظت می‌کنند. مقدار ناقص پذیرفته
  نمی‌شود.
- `Options.Middleware` اجازه می‌دهد session، JWT، SSO یا policy سرویس میزبان
  بدون دور زدن assetها و fallback routeها اعمال شود.
- مقایسهٔ credential در CLI با digest هم‌اندازه و constant-time انجام می‌شود و
  پاسخ‌های auth با `Cache-Control: private, no-store` علامت‌گذاری شده‌اند.
- `ReadOnly` برای تمام namespace مربوط به `/api` اعمال می‌شود و mutationهای
  شناخته‌شده یا ناشناخته را با `405` رد می‌کند.
- `http.CrossOriginProtection` درخواست browser ناامن از origin دیگر را پیش از
  mutation با `403` متوقف می‌کند؛ درخواست same-origin و clientهای non-browser
  تحت تأثیر قرار نمی‌گیرند.
- handler برای جلوگیری از clickjacking هدرهای
  `Content-Security-Policy: frame-ancestors 'none'` و
  `X-Frame-Options: DENY` را روی پاسخ‌ها قرار می‌دهد. policy محدود
  `frame-ancestors` به‌صورت جداگانه افزوده می‌شود تا CSP گسترده‌تری را که سرویس
  میزبان تنظیم کرده است جایگزین نکند.
- MIME type فایل‌های JS، SVG و سایر assetهای embedded از extension تعیین
  می‌شود و deep-link مربوط به SPA به index صحیح برمی‌گردد.

فرمان `--help` با کد خروج صفر پایان می‌یابد. مقادیر پیش‌فرضی که ممکن است حاوی
رمز یا آدرس داخلی باشند—`REDIS_PASSWORD`، `REDIS_URL`، `PROMETHEUS_ADDR` و
`BASIC_AUTH_PASSWORD`—در متن راهنما چاپ نمی‌شوند؛ بااین‌حال، برنامه هنگام اجرا
همچنان از مقدار واقعی آن‌ها استفاده می‌کند.

در حالت standalone، wrapper احراز هویت بیرون کل mux قرار دارد؛ بنابراین اگر
exporter فعال باشد، `/metrics` نیز محافظت می‌شود. در حالت library، endpoint
متریک معمولاً متعلق به سرویس میزبان است و policy آن باید جداگانه تعریف شود.

## Prometheus

دو قابلیت مستقل وجود دارد:

- exporter با `--enable-metrics-exporter` متریک‌های queue را در `/metrics`
  ارائه می‌کند؛
- `--prometheus-addr` آدرس Prometheus را برای queryهای نمودار به backend می‌دهد.

صفحهٔ Metrics در هر دو حالت وجود دارد. بدون آدرس Prometheus هیچ request متریک
یا queue از آن view ارسال نمی‌شود و صفحه نمونهٔ CLI، `scrape_configs` و
استفادهٔ Go را نشان می‌دهد.

HTML فقط یک نشانگر بولی برای «تنظیم بودن Prometheus» دریافت می‌کند. آدرس کامل،
اطلاعات ورود احتمالی و نام میزبان داخلی Prometheus هرگز در HTML یا assetهای
مرورگر قرار نمی‌گیرند؛ مرورگر نیز نمودارها را از endpoint هم‌مبدأ
`/api/metrics` می‌گیرد و ارتباط با Prometheus در backend انجام می‌شود.

backend فقط URL دارای scheme `http` یا `https` و host معتبر را می‌پذیرد و path
prefix را حفظ می‌کند. نه query string و نه fragment در base URL پذیرفته
نمی‌شوند. `duration` باید در بازهٔ بستهٔ یک ثانیه تا ۳۰ روز باشد. query string
خام حداکثر ۳۲ KiB و مقدار پارامتر `queues` پس از URL-decoding حداکثر ۱۶ KiB
است.

هر request پذیرفته‌شده به `/api/metrics` نه query را با context ورودی و deadline
مشترک ده‌ثانیه‌ای برای Prometheus اجرا می‌کند. بدنهٔ پاسخ هر query حداکثر ۴ MiB
و مجموع بدنه‌های پذیرفته‌شده حداکثر ۲۴ MiB است؛ status HTTP و envelope JSON هر
پاسخ نیز اعتبارسنجی می‌شود. هر نمونه از handler هم‌زمان حداکثر دو request متریک
Dashboard را می‌پذیرد و request اضافه را با `503 Service Unavailable` و هدر
`Retry-After: 1` رد می‌کند. timeout با `504` و سایر خطاهای upstream با `502`
گزارش می‌شوند؛ بدنهٔ خطای upstream نیز به کاربر نشت نمی‌کند. نام queue برای
regex و string مربوط به PromQL به‌درستی escape می‌شود.

## Demo، container و انتشار

فایل `compose.demo.yaml` چهار سرویس ایزوله بالا می‌آورد: Redis، dashboard،
producer/worker مصنوعی و Prometheus. داده‌ها موقت‌اند و سرویس demo بدون تماس با
سرویس بیرونی taskهای موفق، retry، archived، scheduled و recurring تولید می‌کند.
راهنمای سناریوها در [`dev/README.md`](../dev/README.md) است.

Dockerfile با BuildKit برای `linux/amd64` و `linux/arm64` cross-compile می‌کند،
base imageها را به digest دقیق پین می‌کند، گواهی‌های CA را به image نهایی
scratch می‌برد، metadata استاندارد OCI را ثبت می‌کند و process را با کاربر
non-root اجرا می‌کند.

workflow تست شامل این بخش‌هاست:

- install تمیز npm، typecheck، unit test و production build؛
- Playwright و نگه‌داری diagnosticها در صورت شکست؛
- Go race test با Redis واقعی، `go vet` و adapterهای Gin/Echo؛
- build و smoke واقعی container روی amd64 و arm64؛
- بالا آوردن Compose و بررسی هم‌زمان API Redis و ۹ query مربوط به Prometheus.

workflow انتشار با push شدن tag معتبری مانند `v0.8.0` یا `v0.8.0-rc.1` آغاز
می‌شود. job نخست علاوه بر قالب نسخه، بررسی می‌کند commit موردنظر پیش‌تر وارد
شاخهٔ پیش‌فرض شده باشد. سپس workflowهای کامل Test و CodeQL را به‌صورت reusable
اجرا می‌کند، برای Linux، macOS و Windows روی amd64 و arm64 archive می‌سازد،
checksum SHA-256 و attestation تولید می‌کند و image چندمعماری GHCR را همراه
SBOM و provenance منتشر می‌سازد. GitHub Release فقط پس از موفقیت تمام این
مراحل، ابتدا به شکل draft و سپس به شکل نهایی منتشر می‌شود؛ این ترتیب با
Immutable Releases سازگار است.

نسخهٔ پایدار tag داکر `latest` را نیز به‌روز می‌کند، اما پیش‌انتشار چنین کاری
نمی‌کند. image دارای برچسب‌های استاندارد OCI، از جمله repository منبع، است.
workflow قدیمی Docker Hub که مقصد upstream داشت حذف شده و CodeQL زبان‌های Go و
JavaScript/TypeScript را پوشش می‌دهد. تمام GitHub Actionها به commit SHA دقیق
پین شده‌اند و Dependabot به‌روزرسانی هفتگی آن‌ها را پیشنهاد می‌دهد.

## روش استفاده در سرویس Go

نمونهٔ حداقلی و امن:

```go
monitor := asynqmon.New(asynqmon.Options{
	RootPath:          "/monitoring",
	RedisConnOpt:      asynq.RedisClientOpt{Addr: "127.0.0.1:6379"},
	PrometheusAddress: "http://prometheus:9090",
	ReadOnly:          true,
	BasicAuthUsername: os.Getenv("ASYNQMON_USER"),
	BasicAuthPassword: os.Getenv("ASYNQMON_PASS"),
})
defer monitor.Close()

http.Handle(monitor.RootPath()+"/", monitor)
```

از `StripPrefix` استفاده نکنید؛ `RootPath` باید با مسیری که در router میزبان
ثبت شده یکسان باشد. برای middleware سفارشی و adapterهای Gin/Echo به README و
`integration/frameworks` مراجعه کنید.

## اعتبارسنجی انجام‌شده

اعتبارسنجی نهایی در ۶ سپتامبر ۲۰۲۶ انجام شده است:

- install تمیز npm، TypeScript typecheck و Vite production build موفق بودند؛
- مجموعهٔ Vitest به‌طور کامل پاس شد؛
- مجموعهٔ Playwright بدون skip پاس شد؛ این مجموعه visual regression، auth
  واقعی، CSRF/read-only، Go embed و lazy route، جزئیات task، URL history،
  freshness/offline/recovery، موبایل و هر دو حالت Metrics را پوشش می‌دهد؛
- workflowهای GitHub Actions با `actionlint` بدون خطا بررسی شدند؛
- matcher تولیدی PromQL روی `deps-prometheus:9090` واقعی با پاسخ موفق بررسی شد؛
- تست‌های Prometheus برای URL، path prefix، timeout/cancel، non-2xx، پاسخ بزرگ
  یا malformed، محدودیت ظرفیت و queueهای دارای کاراکتر ویژه با race detector
  پاس شدند؛
- race test کامل module ریشه با Redis واقعی `deps-redis:6379` در package اصلی
  و CLI پاس شد؛
- `go vet ./...` در module ریشه بدون diagnostic پایان یافت؛
- race test و vet ماژول `integration/frameworks` برای `net/http`، Gin و Echo
  موفق بودند؛
- هر شش target انتشار برای Linux، macOS و Windows روی amd64 و arm64 با flagهای
  workflow ساخته شد؛ header معماری، module path داخل باینری، محتوای tar/zip و
  هر شش checksum بررسی و تأیید شدند؛
- باینری native لینوکس/arm64 با `deps-redis:6379` اجرا شد و API queue پاسخ سالم
  داد؛
- `npm audit --omit=dev` پس از ارتقای dependencyهای آسیب‌پذیر با صفر
  vulnerability پایان یافت.

## موارد وابسته به محیط بیرونی

پیاده‌سازی محلی این مرحله کامل است، اما فعال شدن CI/CD به یک ادغام بیرونی
وابسته است. در ۶ سپتامبر ۲۰۲۶ مخزن مقصد وجود دارد، `origin` به
`github.com/pars-aria-labs/asynqmon` اشاره می‌کند و شاخهٔ پیش‌فرض آن `main` است؛
بااین‌حال، تاریخچهٔ `master` محلی و `origin/main` دارای commitهای اختصاصی و
متفاوت است. بنابراین workflowهای جدید باید با یک شاخهٔ integration و Pull
Request بازبینی‌شده وارد `main` شوند. force-push کردن `main` یا ساخت tag پیش از
این ادغام مجاز نیست.

پس از ادغام، workflowهای Test و CodeQL باید روی GitHub-hosted runner سبز شوند و
یک tag تازه روی commit موجود در `main` نخستین Release واقعی و package مربوط به
GHCR را بسازد. tag مبنای `v0.7.2-parsidev-1` نباید به‌عنوان نسخهٔ جدید دوباره
استفاده یا جابه‌جا شود. تنظیمات دقیق GitHub، دسترسی GHCR، فرمان‌های انتشار و
روش بازیابی خطا در [`RELEASING.fa.md`](RELEASING.fa.md) ثبت شده‌اند.

Docker CLI در محیط فعلی نصب نیست؛ بنابراین smoke کانتینر و Compose در همین
ماشین قابل تکرار نیست. این بررسی‌ها داخل workflow واقعی تعریف شده‌اند و تمام
بخش‌های قابل اجرای آن‌ها (build، تست، cross-compile و lint workflow) محلی
اعتبارسنجی شده‌اند.
