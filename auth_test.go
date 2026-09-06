package asynqmon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pars-aria-labs/asynq"
)

func TestLibraryAuthenticationCoversAllRoutes(t *testing.T) {
	h := New(Options{RootPath: "/monitoring", RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"}, BasicAuthUsername: "admin", BasicAuthPassword: "secret", ReadOnly: true})
	defer h.Close()
	for _, path := range []string{"/monitoring/", "/monitoring/queues/default", "/monitoring/assets/missing.js", "/monitoring/api/queues", "/monitoring/api/missing"} {
		for _, method := range []string{"GET", "POST", "DELETE", "HEAD"} {
			t.Run(method+path, func(t *testing.T) {
				for _, credentials := range [][2]string{{"", ""}, {"admin", "wrong"}, {"wrong", "secret"}} {
					req := httptest.NewRequest(method, path, nil)
					if credentials[0] != "" {
						req.SetBasicAuth(credentials[0], credentials[1])
					}
					res := httptest.NewRecorder()
					h.ServeHTTP(res, req)
					if res.Code != http.StatusUnauthorized {
						t.Fatalf("got %d, want 401", res.Code)
					}
					if !strings.HasPrefix(res.Header().Get("WWW-Authenticate"), "Basic ") {
						t.Fatal("missing auth challenge")
					}
				}
			})
		}
	}
	// Authenticated deep links render the SPA; no Redis request is needed.
	req := httptest.NewRequest("GET", "/monitoring/queues/default", nil)
	req.SetBasicAuth("admin", "secret")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != 200 || !strings.Contains(res.Body.String(), `id="root"`) {
		t.Fatalf("authenticated UI: %d", res.Code)
	}
	// Read-only must be enforced server-side, including unrecognized API paths.
	for _, path := range []string{"/monitoring/api/queues/default:pause", "/monitoring/api/missing"} {
		req := httptest.NewRequest("POST", path, nil)
		req.SetBasicAuth("admin", "secret")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != 405 {
			t.Fatalf("read-only %s: got %d", path, res.Code)
		}
	}
}

func TestLibraryRejectsPartialCredentials(t *testing.T) {
	for _, credentials := range [][2]string{{"admin", ""}, {"", "secret"}} {
		t.Run(credentials[0]+credentials[1], func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("partial credentials must fail closed")
				}
			}()
			New(Options{RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"}, BasicAuthUsername: credentials[0], BasicAuthPassword: credentials[1]})
		})
	}
}

func TestLibraryCustomMiddleware(t *testing.T) {
	type identityKey struct{}
	called := false
	h := New(Options{RootPath: "/monitoring", RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"}, Middleware: func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			if r.Context().Value(identityKey{}) != "operator" {
				http.Error(w, "Forbidden", 403)
				return
			}
			next.ServeHTTP(w, r)
		})
	}})
	defer h.Close()
	for _, allowed := range []bool{false, true} {
		req := httptest.NewRequest("GET", "/monitoring/queues/example", nil)
		if allowed {
			req = req.WithContext(context.WithValue(req.Context(), identityKey{}, "operator"))
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		want := 403
		if allowed {
			want = 200
		}
		if res.Code != want || !called {
			t.Fatalf("custom middleware: got %d, want %d", res.Code, want)
		}
	}
}

func TestLibraryCrossOriginProtection(t *testing.T) {
	h := New(Options{
		RootPath:     "/monitoring",
		RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"},
	})
	defer h.Close()

	tests := []struct {
		name       string
		method     string
		origin     string
		fetchSite  string
		wantStatus int
	}{
		{name: "cross-site POST", method: http.MethodPost, origin: "https://attacker.example", wantStatus: http.StatusForbidden},
		{name: "cross-site DELETE", method: http.MethodDelete, fetchSite: "cross-site", wantStatus: http.StatusForbidden},
		{name: "same-origin POST", method: http.MethodPost, origin: "http://monitor.example", wantStatus: http.StatusOK},
		{name: "non-browser POST", method: http.MethodPost, wantStatus: http.StatusOK},
		{name: "safe cross-site GET", method: http.MethodGet, fetchSite: "cross-site", wantStatus: http.StatusOK},
		{name: "safe cross-site HEAD", method: http.MethodHead, fetchSite: "cross-site", wantStatus: http.StatusOK},
		{name: "safe cross-site OPTIONS", method: http.MethodOptions, fetchSite: "cross-site", wantStatus: http.StatusOK},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "http://monitor.example/monitoring/api/missing", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.fetchSite != "" {
				req.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}
			res := httptest.NewRecorder()
			h.ServeHTTP(res, req)
			if res.Code != tc.wantStatus {
				t.Fatalf("got %d, want %d", res.Code, tc.wantStatus)
			}
		})
	}
}

func TestLibraryDeniesFraming(t *testing.T) {
	h := New(Options{
		RootPath:     "/monitoring",
		RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"},
	})
	defer h.Close()

	for _, path := range []string{
		"/monitoring/",
		"/monitoring/api/missing",
	} {
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		if got := res.Header().Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
			t.Errorf("%s: Content-Security-Policy = %q", path, got)
		}
		if got := res.Header().Get("X-Frame-Options"); got != "DENY" {
			t.Errorf("%s: X-Frame-Options = %q", path, got)
		}
	}
}

func TestLibraryPreservesHostContentSecurityPolicy(t *testing.T) {
	h := New(Options{
		RootPath:     "/monitoring",
		RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"},
		Middleware: func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Security-Policy", "default-src 'self'")
				next.ServeHTTP(w, r)
			})
		},
	})
	defer h.Close()

	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/monitoring/", nil))
	policies := res.Header().Values("Content-Security-Policy")
	if len(policies) != 2 {
		t.Fatalf("Content-Security-Policy values = %q, want host and Asynqmon policies", policies)
	}
	if policies[0] != "default-src 'self'" || policies[1] != "frame-ancestors 'none'" {
		t.Fatalf("Content-Security-Policy values = %q", policies)
	}
}

func TestLibrarySecurityMiddlewareOrdering(t *testing.T) {
	customCalled := false
	h := New(Options{
		RootPath:          "/monitoring",
		RedisConnOpt:      asynq.RedisClientOpt{Addr: "127.0.0.1:1"},
		ReadOnly:          true,
		BasicAuthUsername: "admin",
		BasicAuthPassword: "secret",
		Middleware: func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				customCalled = true
				next.ServeHTTP(w, r)
			})
		},
	})
	defer h.Close()

	request := func(authenticated bool, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "http://monitor.example/monitoring/api/missing", nil)
		if authenticated {
			req.SetBasicAuth("admin", "secret")
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		return res
	}

	if res := request(false, "https://attacker.example"); res.Code != http.StatusUnauthorized {
		t.Fatalf("Basic Auth should run before cross-origin protection: got %d, want 401", res.Code)
	}
	if !customCalled {
		t.Fatal("custom middleware did not remain the outermost wrapper")
	}
	if res := request(true, "https://attacker.example"); res.Code != http.StatusForbidden {
		t.Fatalf("cross-origin protection should run before read-only: got %d, want 403", res.Code)
	}
	if res := request(true, "http://monitor.example"); res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("same-origin mutation should reach read-only protection: got %d, want 405", res.Code)
	}
}
