# راهنمای CI/CD و انتشار برای نگه‌دارندگان

این سند مسیر رسمی انتشار Asynqmon در مخزن
`github.com/pars-aria-labs/asynqmon` است. پس از انجام تنظیمات یک‌باره، برای هر
نسخه فقط کافی است یک tag معتبر روی commit تأییدشدهٔ شاخهٔ پیش‌فرض push شود؛
ساخت GitHub Release و image داکر به‌صورت خودکار انجام می‌شود.

## پیش از اولین اجرا: یکپارچه‌کردن شاخه‌ها

شاخهٔ پیش‌فرض مخزن GitHub در حال حاضر `main` است، اما تغییرات جدید این checkout
روی `master` قرار دارند و تاریخچهٔ این دو شاخه از یکدیگر فاصله گرفته است. تا
زمانی که تغییرات با یک Pull Request بازبینی و وارد `main` نشده‌اند، tag انتشار
نسازید. به‌ویژه، `main` را force-push نکنید؛ این کار commitهای موجود در مخزن
دور را از بین می‌برد.

پس از commit کردن تغییرات محلی، مسیر امن این است که شاخهٔ integration را از
`origin/main` بسازید و تمام تاریخچهٔ `master` را بدون بازنویسی روی آن merge
کنید:

```sh
git fetch origin --prune
git switch -c reconcile/ci-cd origin/main
git merge --no-ff master
```

اگر merge از conflict خبر داد، هر مورد را با حفظ تغییرات هر دو سمت حل و مجموعهٔ
کامل تست‌ها را دوباره اجرا کنید:

```sh
# پس از حل دقیق conflictها:
git add path/to/resolved-file
git commit
git push -u origin reconcile/ci-cd
```

سپس در GitHub یک Pull Request از `reconcile/ci-cd` به `main` باز کنید. ادغام
باید از راه Pull Request انجام شود تا نتیجهٔ Test و CodeQL پیش از ورود به شاخهٔ
اصلی قابل مشاهده باشد.

## اجزای خط تحویل

سه workflow مسئول کنترل کیفیت و انتشار هستند:

1. `Test` روی Pull Request و push به `main` یا `master` اجرا می‌شود. تست‌های Go،
   UI، مرورگر، imageهای amd64/arm64 و Compose demo را پوشش می‌دهد و workflow
   انتشار نیز همین بررسی کامل را دوباره فراخوانی می‌کند.
2. `CodeQL` تغییرات Go و JavaScript/TypeScript را در Pull Request، push و اجرای
   هفتگی تحلیل می‌کند.
3. `Release` با push شدن tagهایی مانند `v0.8.0` یا `v0.8.0-rc.1` آغاز می‌شود.
   ابتدا معتبر بودن tag و حضور commit آن در شاخهٔ پیش‌فرض را بررسی می‌کند، سپس
   Test و CodeQL را برای همان commit اجرا می‌کند و بعد شش archive باینری،
   checksum و attestation، image چندمعماری، SBOM و provenance را می‌سازد.
   GitHub Release فقط پس از موفقیت تمام این مراحل منتشر می‌شود.

نسخه‌های پایدار علاوه بر tag نسخه، tag داکر `latest` را نیز به‌روز می‌کنند.
نسخه‌های پیش‌انتشار مانند `v0.8.0-rc.1` هرگز `latest` را جابه‌جا نمی‌کنند.

## تنظیمات یک‌باره در GitHub

در بخش **Settings → Actions → General** مطمئن شوید GitHub Actions و
GitHub-hosted runners برای مخزن فعال‌اند و استفاده از actionهای رسمی
`actions/*`، `github/*` و `docker/*` مجاز است. workflow انتشار حداقل مجوزهای
لازم برای Release، Packages و attestation را در سطح هر job اعلام کرده و از
`GITHUB_TOKEN` داخلی استفاده می‌کند؛ بنابراین secret یا PAT جداگانه‌ای برای
خود CI/CD لازم نیست.

اگر package هم‌نام از قبل در GHCR ساخته شده ولی به این repository متصل نیست،
در **Package settings → Manage Actions access** همین repository را اضافه و
دسترسی `Write` را برای Actions فعال کنید. packageای که برای نخستین‌بار توسط همین
workflow ساخته شود معمولاً به‌طور خودکار به repository متصل خواهد شد.

پس از نخستین اجرای موفق workflowها، برای `main` یک ruleset یا branch protection
بسازید و این موارد را الزامی کنید:

- ادغام فقط از راه Pull Request؛
- موفق بودن jobهای workflow `Test`؛
- موفق بودن هر دو تحلیل Go و JavaScript/TypeScript در `CodeQL`؛
- جلوگیری از ادغام در صورت وجود alert جدید با شدت مورد توافق تیم، با استفاده
  از Code scanning merge protection؛
- جلوگیری از force-push و حذف شاخهٔ پیش‌فرض.

یک tag ruleset جداگانه برای الگوی `v*` نیز بسازید و update و delete را محدود
کنید. این ruleset از جابه‌جایی یا حذف Git tag جلوگیری می‌کند، اما روی tagهای
GHCR اثری ندارد. دسترسی `packages:write` را محدود نگه دارید، هنگام بازیابی فقط
jobهای ناموفق را دوباره اجرا کنید و در محیط production همواره image را با
digest مصرف کنید.

اگر قابلیت **Immutable Releases** برای مخزن در دسترس است، می‌توانید آن را فعال
کنید. workflow ابتدا Release را به‌صورت draft می‌سازد، همهٔ assetها را روی آن
قرار می‌دهد و در پایان منتشرش می‌کند؛ بنابراین بعد از انتشار نیازی به تغییر
assetهای یک نسخه نیست.

## انتشار یک نسخه

ابتدا مطمئن شوید Pull Request وارد `main` شده، working tree خالی است و آخرین
commit شاخهٔ پیش‌فرض را در اختیار دارید:

```sh
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short
```

برای نسخهٔ پایدار، ترجیحاً یک tag امضاشده بسازید و push کنید:

```sh
RELEASE_VERSION=v0.8.0
git tag -s "$RELEASE_VERSION" -m "Asynqmon $RELEASE_VERSION"
git push origin "$RELEASE_VERSION"
```

اگر امضای Git تنظیم نشده است، tag حاشیه‌نویسی‌شده نیز قابل استفاده است:

```sh
RELEASE_VERSION=v0.8.0
git tag -a "$RELEASE_VERSION" -m "Asynqmon $RELEASE_VERSION"
git push origin "$RELEASE_VERSION"
```

برای release candidate همین مسیر را با نامی مانند `v0.8.0-rc.1` طی کنید. بعد
از push، صفحهٔ **Actions → Release** را زیر نظر بگیرید و تا پایان آن tag نسخهٔ
دیگری push نکنید. workflow اجراهای هم‌زمان را به‌ترتیب در صف قرار می‌دهد، اما
انتشار یک نسخه در هر نوبت، تشخیص خطا و کنترل `latest` را روشن‌تر نگه می‌دارد.
Release را از رابط GitHub به‌صورت دستی نسازید؛ workflow این کار را پس از ساخت
موفق باینری و container انجام می‌دهد.

## دسترسی به image داکر

خروجی انتشار در این نشانی قرار می‌گیرد:

```text
ghcr.io/pars-aria-labs/asynqmon:<version>
```

GitHub Container Registry به‌طور پیش‌فرض package تازه را با visibility خصوصی
ایجاد می‌کند. پس از اولین انتشار به صفحهٔ package بروید، **Package settings**
را باز کنید و در صورت نیاز visibility را به `Public` تغییر دهید. این تغییر از
`Private` به `Public` برگشت‌پذیر نیست؛ پیش از تأیید، سیاست انتشار سازمان را
بررسی کنید. image عمومی بدون login قابل pull است:

```sh
docker pull ghcr.io/pars-aria-labs/asynqmon:v0.8.0
```

اگر package باید خصوصی بماند، کاربر دریافت‌کننده به یک personal access token
(classic) با مجوز `read:packages` نیاز دارد. اگر سازمان SSO را اجباری کرده
است، token را برای همان سازمان authorize کنید:

```sh
printf '%s' "$GHCR_TOKEN" | \
  docker login ghcr.io --username YOUR_GITHUB_USERNAME --password-stdin
docker pull ghcr.io/pars-aria-labs/asynqmon:v0.8.0
```

## بررسی نتیجهٔ انتشار

وضعیت run را می‌توانید با GitHub CLI دنبال کنید:

```sh
gh run list \
  --repo pars-aria-labs/asynqmon \
  --workflow release.yml \
  --limit 5
gh run watch RUN_ID --repo pars-aria-labs/asynqmon --exit-status
```

archiveها را در یک پوشهٔ موقت دریافت و checksum آن‌ها را بررسی کنید:

```sh
RELEASE_VERSION=v0.8.0
VERIFY_DIR=$(mktemp -d)
gh release download "$RELEASE_VERSION" \
  --repo pars-aria-labs/asynqmon \
  --dir "$VERIFY_DIR"
(cd "$VERIFY_DIR" && sha256sum --check checksums.txt)

gh attestation verify \
  "$VERIFY_DIR/asynqmon_${RELEASE_VERSION}_linux_amd64.tar.gz" \
  --repo pars-aria-labs/asynqmon
```

در macOS به‌جای `sha256sum` از `shasum -a 256 --check checksums.txt` استفاده
کنید.

اگر Immutable Releases را فعال کرده‌اید، attestation خود Release را نیز بررسی
کنید:

```sh
gh release verify "$RELEASE_VERSION" --repo pars-aria-labs/asynqmon
```

وجود manifest هر دو معماری را بررسی کنید:

```sh
docker buildx imagetools inspect \
  ghcr.io/pars-aria-labs/asynqmon:v0.8.0
```

provenance ثبت‌شده برای image را نیز می‌توان با GitHub CLI اعتبارسنجی کرد:

`gh attestation verify` برای URIهای OCI حتی در صورت عمومی بودن image به یک
session معتبر registry نیاز دارد. ابتدا با همان token کلاسیک دارای
`read:packages` وارد GHCR شوید، سپس verification را اجرا کنید:

```sh
printf '%s' "$GHCR_TOKEN" | \
  docker login ghcr.io --username YOUR_GITHUB_USERNAME --password-stdin
gh attestation verify \
  oci://ghcr.io/pars-aria-labs/asynqmon:v0.8.0 \
  --repo pars-aria-labs/asynqmon
```

برای باینری‌ها، archiveها و `checksums.txt` را از Release دریافت و مطابق بخش
«Verify a release» در README بررسی کنید.

## شکست و اجرای دوباره

- اگر jobی پیش از انتشار نهایی شکست خورد، علت را برطرف و از صفحهٔ همان run
  گزینهٔ **Re-run failed jobs** را انتخاب کنید. اگر job `publish-release` هنوز
  شروع نشده باشد، هیچ Releaseای ساخته نشده است؛ اگر این job پس از ساخت draft
  شکست بخورد، draft باقی می‌ماند و اجرای بعدی همان را ادامه می‌دهد.
- ممکن است image با tag نسخه منتشر شده باشد، اما مرحلهٔ نهایی GitHub Release
  شکست بخورد. در این حالت tag را جابه‌جا نکنید؛ اجرای jobهای ناموفق را تکرار
  کنید.
- اگر یک Release نهایی منتشر شده است، asset یا tag آن را بازنویسی نکنید. اصلاح
  را با commit و نسخهٔ patch تازه، برای نمونه `v0.8.1`، منتشر کنید.
- اگر validation اعلام کرد commit در شاخهٔ پیش‌فرض نیست، ابتدا همان commit را
  با Pull Request وارد `main` کنید و سپس یک tag تازه بسازید.
