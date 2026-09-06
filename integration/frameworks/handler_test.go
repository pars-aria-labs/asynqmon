package frameworks_test

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pars-aria-labs/asynq"
	"github.com/pars-aria-labs/asynqmon"
	"github.com/labstack/echo/v4"
)

// Run real framework adapters without a Redis server. UI/auth/read-only
// requests must complete before any Redis operation is needed.
func TestFrameworkEmbedding(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adapters := map[string]func(http.Handler) http.Handler{
		"net-http": func(h http.Handler) http.Handler { m := http.NewServeMux(); m.Handle("/monitoring/", h); return m },
		"echo": func(h http.Handler) http.Handler {
			e := echo.New()
			e.Any("/monitoring/*", echo.WrapHandler(h))
			return e
		},
		"gin": func(h http.Handler) http.Handler { g := gin.New(); g.Any("/monitoring/*path", gin.WrapH(h)); return g },
	}
	for name, adapt := range adapters {
		t.Run(name, func(t *testing.T) {
			monitor := asynqmon.New(asynqmon.Options{RootPath: "/monitoring/", RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"}, BasicAuthUsername: "operator", BasicAuthPassword: "test-password", ReadOnly: true})
			defer monitor.Close()
			h := adapt(monitor)
			request := func(method, path string, authenticated bool) *httptest.ResponseRecorder {
				r := httptest.NewRequest(method, path, nil)
				if authenticated {
					r.SetBasicAuth("operator", "test-password")
				}
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				return w
			}
			for _, path := range []string{"/monitoring/", "/monitoring/queues/default/tasks/example", "/monitoring/api/queues", "/monitoring/assets/missing.js"} {
				if w := request("GET", path, false); w.Code != 401 {
					t.Fatalf("unprotected %s: %d", path, w.Code)
				}
			}
			page := request("GET", "/monitoring/queues/default/tasks/example", true)
			if page.Code != 200 || !strings.Contains(page.Body.String(), `id="root"`) {
				t.Fatalf("deep link: %d", page.Code)
			}
			assets := regexp.MustCompile(`<script[^>]+src="([^"]+)"`).FindAllStringSubmatch(page.Body.String(), -1)
			if len(assets) == 0 {
				t.Fatal("no production entry script")
			}
			for _, asset := range assets {
				if !strings.HasPrefix(asset[1], "/monitoring/assets/") {
					t.Fatalf("bad asset path: %s", asset[1])
				}
				if w := request("GET", asset[1], false); w.Code != 401 {
					t.Fatalf("asset auth bypass: %d", w.Code)
				}
				if w := request("GET", asset[1], true); w.Code != 200 || !strings.Contains(w.Header().Get("Content-Type"), "javascript") {
					t.Fatalf("asset response: %d", w.Code)
				}
			}
			for _, method := range []string{"POST", "DELETE"} {
				if w := request(method, "/monitoring/api/queues/default", true); w.Code != 405 {
					t.Fatalf("read-only bypass: %d", w.Code)
				}
			}
		})
	}
}
