package asynqmon

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/hibiken/asynq"
	"github.com/hibiken/asynq/x/metrics"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func TestLibraryWithRedis(t *testing.T) {
	addr := os.Getenv("ASYNQMON_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("set ASYNQMON_TEST_REDIS_ADDR to an isolated test Redis")
	}
	conn := asynq.RedisClientOpt{Addr: addr}
	client := asynq.NewClient(conn)
	defer client.Close()
	inspector := asynq.NewInspector(conn)
	defer inspector.Close()
	queue := fmt.Sprintf("asynqmon-test-%d", time.Now().UnixNano())
	if _, err := client.Enqueue(asynq.NewTask("integration:task", []byte(`{"example":true}`)), asynq.Queue(queue)); err != nil {
		t.Fatal(err)
	}
	defer inspector.DeleteQueue(queue, true)
	h := New(Options{RootPath: "/monitoring", RedisConnOpt: conn, BasicAuthUsername: "operator", BasicAuthPassword: "test-secret", ReadOnly: true})
	defer h.Close()
	app := http.NewServeMux()
	app.Handle("/monitoring/", h)
	request := func(method, path string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, nil)
		r.SetBasicAuth("operator", "test-secret")
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		return w
	}
	w := request("GET", "/monitoring/api/queues")
	if w.Code != 200 || !strings.Contains(w.Body.String(), queue) {
		t.Fatalf("queue list: %d %s", w.Code, w.Body.String())
	}
	w = request("POST", "/monitoring/api/queues/"+queue+":pause")
	if w.Code != 405 {
		t.Fatalf("read-only mutation: %d", w.Code)
	}
	info, err := inspector.GetQueueInfo(queue)
	if err != nil || info.Paused {
		t.Fatalf("read-only queue was mutated: %v", err)
	}
	// Integrate with an existing registry and existing /metrics endpoint.
	registry := prometheus.NewRegistry()
	registry.MustRegister(prometheus.NewGauge(prometheus.GaugeOpts{Name: "host_service_ready", Help: "Host service state"}))
	registry.MustRegister(metrics.NewQueueMetricsCollector(inspector))
	app.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	w = request("GET", "/metrics")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "host_service_ready") || !strings.Contains(w.Body.String(), `queue="`+queue+`"`) {
		t.Fatalf("registry integration: %d", w.Code)
	}
}

func TestLibraryPrometheusConfiguration(t *testing.T) {
	// Use an in-process RoundTripper to test custom-root API routing without
	// depending on a Prometheus instance or opening a listener.
	original := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "prometheus.example" || r.URL.Path != "/api/v1/query_range" {
			t.Errorf("unexpected upstream %s", r.URL)
		}
		if r.Header.Get("Authorization") != "" {
			t.Error("monitoring credentials leaked upstream")
		}
		body := `{"status":"success","data":{"resultType":"matrix","result":[]}}`
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	defer func() { http.DefaultClient = original }()
	h := New(Options{RootPath: "/monitoring", RedisConnOpt: asynq.RedisClientOpt{Addr: "127.0.0.1:1"}, PrometheusAddress: "http://prometheus.example", BasicAuthUsername: "operator", BasicAuthPassword: "test-secret"})
	defer h.Close()
	r := httptest.NewRequest("GET", "/monitoring/api/metrics?duration=60", nil)
	r.SetBasicAuth("operator", "test-secret")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("metrics query: %d %s", w.Code, w.Body.String())
	}
	var response map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || len(response) != 9 {
		t.Fatalf("invalid metrics response: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
