package asynqmon

import (
	"embed"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
)

//go:embed ui/build/*
var testUIAssets embed.FS

func TestProductionUIAtRuntimeRoot(t *testing.T) {
	for _, root := range []string{"", "/monitoring"} {
		t.Run(root, func(t *testing.T) {
			h := &uiAssetsHandler{rootPath: root, contents: testUIAssets, staticDirPath: "ui/build", indexFileName: "index.html", prometheusAddr: "http://operator:secret@prometheus.internal:9090", readOnly: true}
			// A direct deep link must return a configured SPA with absolute entry URLs.
			res := httptest.NewRecorder()
			h.ServeHTTP(res, httptest.NewRequest("GET", root+"/queues/default", nil))
			html := res.Body.String()
			// html/template escapes slashes inside JavaScript string literals.
			flagHTML := strings.ReplaceAll(html, `\/`, `/`)
			if res.Code != 200 || strings.Contains(html, "/[[") || strings.Contains(html, "__ROOT_PATH__") {
				t.Fatalf("unrendered or unsuccessful UI: %d %s", res.Code, html)
			}
			for _, flag := range []string{`window.FLAG_ROOT_PATH = "` + root + `"`, `window.FLAG_READ_ONLY = "true"`, `window.FLAG_PROMETHEUS_CONFIGURED = "true"`} {
				if !strings.Contains(flagHTML, flag) {
					t.Errorf("missing flag %s", flag)
				}
			}
			if strings.Contains(flagHTML, "prometheus.internal") || strings.Contains(flagHTML, "secret") {
				t.Fatal("rendered UI leaked the server-side Prometheus address")
			}
			scripts := regexp.MustCompile(`<script[^>]+src="([^"]+)"`).FindAllStringSubmatch(html, -1)
			if len(scripts) == 0 {
				t.Fatal("no entry scripts")
			}
			for _, script := range scripts {
				if !strings.HasPrefix(script[1], root+"/assets/") {
					t.Errorf("entry script outside runtime root: %s", script[1])
				}
				asset := httptest.NewRecorder()
				h.ServeHTTP(asset, httptest.NewRequest("GET", script[1], nil))
				if asset.Code != 200 || !strings.HasPrefix(asset.Header().Get("Content-Type"), "application/javascript") || strings.HasPrefix(asset.Body.String(), "<!doctype") {
					t.Fatalf("entry script was not served as JavaScript: %s", script[1])
				}
			}
		})
	}
}

func TestProductionUIRejectsPathsOutsideRuntimeRoot(t *testing.T) {
	h := &uiAssetsHandler{rootPath: "/monitoring", contents: testUIAssets, staticDirPath: "ui/build", indexFileName: "index.html"}
	for _, requestPath := range []string{
		"/monitoring-other",
		"/monitoring/../outside",
		"/outside",
	} {
		t.Run(requestPath, func(t *testing.T) {
			res := httptest.NewRecorder()
			h.ServeHTTP(res, httptest.NewRequest("GET", requestPath, nil))
			if res.Code != 400 {
				t.Fatalf("status = %d, want 400", res.Code)
			}
		})
	}
}

func TestProductionUIOnlyMarksValidPrometheusURLsConfigured(t *testing.T) {
	tests := []struct {
		name       string
		address    string
		configured string
	}{
		{name: "not configured", configured: ""},
		{name: "whitespace", address: "   ", configured: ""},
		{name: "invalid URL", address: "prometheus:9090", configured: ""},
		{name: "valid URL", address: "http://prometheus:9090", configured: "true"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := &uiAssetsHandler{
				contents:       testUIAssets,
				staticDirPath:  "ui/build",
				indexFileName:  "index.html",
				prometheusAddr: tt.address,
			}
			res := httptest.NewRecorder()
			h.ServeHTTP(res, httptest.NewRequest("GET", "/", nil))
			if res.Code != 200 {
				t.Fatalf("status = %d; body: %s", res.Code, res.Body.String())
			}
			want := `window.FLAG_PROMETHEUS_CONFIGURED = "` + tt.configured + `"`
			if !strings.Contains(res.Body.String(), want) {
				t.Fatalf("rendered flag does not contain %q", want)
			}
		})
	}
}

func TestProductionUITemplateFailureDoesNotWritePartialResponse(t *testing.T) {
	h := &uiAssetsHandler{
		contents: fstest.MapFS{
			"ui/build/index.html": &fstest.MapFile{
				Data: []byte(`<html>partial/[[.UnknownField]]</html>`),
			},
		},
		staticDirPath: "ui/build",
		indexFileName: "index.html",
	}
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest("GET", "/", nil))
	if res.Code != 500 {
		t.Fatalf("status = %d, want 500", res.Code)
	}
	if strings.Contains(res.Body.String(), "<html>partial") {
		t.Fatalf("response contains partially rendered HTML: %q", res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); got == "text/html; charset=utf-8" {
		t.Fatalf("failed template was marked as a successful HTML response: %q", got)
	}
}

func TestProductionSVGContentType(t *testing.T) {
	h := &uiAssetsHandler{contents: testUIAssets, staticDirPath: "ui/build", indexFileName: "index.html"}
	entries, err := testUIAssets.ReadDir("ui/build/assets")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".svg") {
			continue
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest("GET", "/assets/"+entry.Name(), nil))
		if res.Header().Get("Content-Type") != "image/svg+xml" {
			t.Errorf("SVG served as %q", res.Header().Get("Content-Type"))
		}
		return
	}
	t.Fatal("no SVG asset found")
}
