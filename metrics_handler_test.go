package asynqmon

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const successfulPrometheusResponse = `{"status":"success","data":{"resultType":"matrix","result":[]}}`

func TestMetricsHandlerPrometheusConfiguration(t *testing.T) {
	tests := []struct {
		name             string
		address          string
		wantStatus       int
		wantUpstreamPath string
		wantCalls        int
	}{
		{
			name:             "configured root URL",
			address:          "http://prometheus.example",
			wantStatus:       http.StatusOK,
			wantUpstreamPath: prometheusAPIPath,
			wantCalls:        9,
		},
		{
			name:             "configured URL with path prefix and trailing slash",
			address:          "https://prometheus.example/monitoring/",
			wantStatus:       http.StatusOK,
			wantUpstreamPath: "/monitoring" + prometheusAPIPath,
			wantCalls:        9,
		},
		{name: "unconfigured", address: "", wantStatus: http.StatusServiceUnavailable},
		{name: "missing scheme", address: "prometheus.example:9090", wantStatus: http.StatusServiceUnavailable},
		{name: "unsupported scheme", address: "file:///tmp/prometheus", wantStatus: http.StatusServiceUnavailable},
		{name: "missing host", address: "http:///prometheus", wantStatus: http.StatusServiceUnavailable},
		{name: "query in base URL", address: "http://prometheus.example?tenant=one", wantStatus: http.StatusServiceUnavailable},
		{name: "fragment in base URL", address: "http://prometheus.example/#fragment", wantStatus: http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var mu sync.Mutex
			var paths []string
			client := &http.Client{Transport: metricsRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				mu.Lock()
				paths = append(paths, r.URL.Path)
				mu.Unlock()
				return metricsHTTPResponse(http.StatusOK, successfulPrometheusResponse), nil
			})}
			handler := newGetMetricsHandlerFuncWithConfig(client, tt.address, prometheusHandlerConfig{
				requestTimeout: time.Second,
				maxBodyBytes:   1024,
			})

			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/metrics?duration=60", nil))
			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", w.Code, tt.wantStatus, w.Body.String())
			}
			mu.Lock()
			defer mu.Unlock()
			if len(paths) != tt.wantCalls {
				t.Fatalf("upstream calls = %d, want %d", len(paths), tt.wantCalls)
			}
			for _, path := range paths {
				if path != tt.wantUpstreamPath {
					t.Errorf("upstream path = %q, want %q", path, tt.wantUpstreamPath)
				}
			}
			if tt.wantStatus == http.StatusOK {
				if got := w.Header().Get("Content-Type"); got != "application/json" {
					t.Errorf("Content-Type = %q, want application/json", got)
				}
				var response map[string]json.RawMessage
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if len(response) != 9 {
					t.Errorf("response field count = %d, want 9", len(response))
				}
			}
		})
	}
}

func TestMetricsHandlerRejectsInvalidPrometheusResponses(t *testing.T) {
	tests := []struct {
		name          string
		statusCode    int
		body          string
		maxBodyBytes  int64
		wantBodyMatch string
		wantNotInBody string
	}{
		{
			name:          "upstream non-2xx",
			statusCode:    http.StatusServiceUnavailable,
			body:          `sensitive upstream details: bearer-token`,
			maxBodyBytes:  1024,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "bearer-token",
		},
		{
			name:          "oversized response",
			statusCode:    http.StatusOK,
			body:          strings.Repeat("x", 65),
			maxBodyBytes:  64,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "64-byte",
		},
		{
			name:          "invalid JSON",
			statusCode:    http.StatusOK,
			body:          `{"status":`,
			maxBodyBytes:  1024,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "decode Prometheus response",
		},
		{
			name:          "missing data",
			statusCode:    http.StatusOK,
			body:          `{"status":"success"}`,
			maxBodyBytes:  1024,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "malformed Prometheus response",
		},
		{
			name:          "null data",
			statusCode:    http.StatusOK,
			body:          `{"status":"success","data":null}`,
			maxBodyBytes:  1024,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "malformed Prometheus response",
		},
		{
			name:          "error envelope returned with HTTP 200",
			statusCode:    http.StatusOK,
			body:          `{"status":"error","data":{}}`,
			maxBodyBytes:  1024,
			wantBodyMatch: "Prometheus request failed",
			wantNotInBody: "malformed Prometheus response",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &http.Client{Transport: metricsRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return metricsHTTPResponse(tt.statusCode, tt.body), nil
			})}
			handler := newGetMetricsHandlerFuncWithConfig(client, "http://prometheus.example", prometheusHandlerConfig{
				requestTimeout: time.Second,
				maxBodyBytes:   tt.maxBodyBytes,
			})

			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
			if w.Code != http.StatusBadGateway {
				t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadGateway, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantBodyMatch) {
				t.Errorf("response body %q does not contain %q", w.Body.String(), tt.wantBodyMatch)
			}
			if tt.wantNotInBody != "" && strings.Contains(w.Body.String(), tt.wantNotInBody) {
				t.Errorf("response body leaked upstream content %q", tt.wantNotInBody)
			}
		})
	}
}

func TestMetricsHandlerDoesNotExposeUpstreamNetworkErrors(t *testing.T) {
	const sensitiveDetail = "dial tcp prometheus.internal:9090 with bearer-token"
	client := &http.Client{Transport: metricsRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New(sensitiveDetail)
	})}
	handler := newGetMetricsHandlerFuncWithConfig(client, "http://operator:secret@prometheus.internal:9090", prometheusHandlerConfig{
		requestTimeout: time.Second,
		maxBodyBytes:   1024,
	})

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadGateway, w.Body.String())
	}
	if got := w.Body.String(); got != "Prometheus request failed\n" {
		t.Fatalf("response body = %q, want a stable public error", got)
	}
	for _, secret := range []string{"prometheus.internal", "operator", "secret", "bearer-token"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Errorf("response body leaked %q", secret)
		}
	}
}

func TestMetricsHandlerRejectsOversizedAggregateResponse(t *testing.T) {
	client := &http.Client{Transport: metricsRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return metricsHTTPResponse(http.StatusOK, successfulPrometheusResponse), nil
	})}
	handler := newGetMetricsHandlerFuncWithConfig(client, "http://prometheus.example", prometheusHandlerConfig{
		requestTimeout:        time.Second,
		maxBodyBytes:          1024,
		maxAggregateBodyBytes: int64(len(successfulPrometheusResponse)),
	})

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadGateway, w.Body.String())
	}
	if got := w.Body.String(); got != "Prometheus response is too large\n" {
		t.Fatalf("response body = %q, want stable aggregate-size error", got)
	}
}

func TestMetricsHandlerLimitsConcurrentRequests(t *testing.T) {
	type requestIDKey struct{}
	started := make(chan int, maxConcurrentMetricsRequests)
	release := make(chan struct{})
	var seen sync.Map
	client := &http.Client{Transport: metricsRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		id, _ := r.Context().Value(requestIDKey{}).(int)
		if _, loaded := seen.LoadOrStore(id, struct{}{}); !loaded {
			started <- id
		}
		<-release
		return metricsHTTPResponse(http.StatusOK, successfulPrometheusResponse), nil
	})}
	handler := newGetMetricsHandlerFuncWithConfig(client, "http://prometheus.example", prometheusHandlerConfig{
		requestTimeout: time.Second,
		maxBodyBytes:   1024,
	})

	type result struct {
		id       int
		response *httptest.ResponseRecorder
	}
	done := make(chan result, maxConcurrentMetricsRequests)
	startRequest := func(id int) {
		request := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
		request = request.WithContext(context.WithValue(request.Context(), requestIDKey{}, id))
		go func() {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			done <- result{id: id, response: response}
		}()
	}
	waitForStart := func(want int) {
		t.Helper()
		select {
		case got := <-started:
			if got != want {
				t.Fatalf("request %d started, want request %d", got, want)
			}
		case <-time.After(time.Second):
			t.Fatalf("request %d did not reach Prometheus", want)
		}
	}

	startRequest(1)
	waitForStart(1)
	startRequest(2)
	waitForStart(2)

	overflow := httptest.NewRecorder()
	handler.ServeHTTP(overflow, httptest.NewRequest(http.MethodGet, "/api/metrics", nil))
	if overflow.Code != http.StatusServiceUnavailable {
		t.Fatalf("overflow status = %d, want %d", overflow.Code, http.StatusServiceUnavailable)
	}
	if overflow.Header().Get("Retry-After") != "1" {
		t.Errorf("overflow response is missing Retry-After")
	}

	close(release)
	for range maxConcurrentMetricsRequests {
		select {
		case completed := <-done:
			if completed.response.Code != http.StatusOK {
				t.Errorf("request %d status = %d; body: %s", completed.id, completed.response.Code, completed.response.Body.String())
			}
		case <-time.After(2 * time.Second):
			t.Fatal("admitted metrics request did not finish")
		}
	}
}

func TestExtractMetricsFetchOptionsRejectsUnboundedQueries(t *testing.T) {
	tests := []struct {
		name  string
		query string
	}{
		{name: "zero duration", query: "duration=0"},
		{name: "negative duration", query: "duration=-1"},
		{name: "duration over maximum", query: "duration=" + strconv.Itoa(maxMetricsDurationSeconds+1)},
		{name: "duration integer overflow", query: "duration=999999999999999999999999"},
		{name: "invalid end time", query: "endtime=tomorrow"},
		{name: "empty queue name", query: "queues=critical,,default"},
		{name: "queue parameter too large", query: "queues=" + strings.Repeat("q", maxMetricsQueuesParameterBytes+1)},
		{name: "raw query too large", query: "unused=" + strings.Repeat("q", maxMetricsRawQueryBytes+1)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/metrics?"+tt.query, nil)
			if _, err := extractMetricsFetchOptions(request); err == nil {
				t.Fatal("extractMetricsFetchOptions accepted an unbounded query")
			}
		})
	}

	validQueues := strings.TrimSuffix(strings.Repeat("queue,", 1000), ",")
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/metrics?duration="+strconv.Itoa(maxMetricsDurationSeconds)+"&queues="+validQueues,
		nil,
	)
	opts, err := extractMetricsFetchOptions(request)
	if err != nil {
		t.Fatalf("maximum bounded query was rejected: %v", err)
	}
	if opts.duration != 30*24*time.Hour || len(opts.queues) != 1000 {
		t.Fatalf("unexpected bounded options: duration=%s queues=%d", opts.duration, len(opts.queues))
	}
}

func TestMetricsHandlerPropagatesCancellationAndDeadline(t *testing.T) {
	tests := []struct {
		name           string
		requestTimeout time.Duration
		cancelParent   bool
		wantStatus     int
	}{
		{name: "Prometheus request deadline", requestTimeout: 20 * time.Millisecond, wantStatus: http.StatusGatewayTimeout},
		{name: "incoming request cancellation", requestTimeout: time.Second, cancelParent: true, wantStatus: http.StatusBadGateway},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			started := make(chan struct{}, 1)
			var sawDeadline atomic.Bool
			client := &http.Client{Transport: metricsRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				if _, ok := r.Context().Deadline(); ok {
					sawDeadline.Store(true)
				}
				select {
				case started <- struct{}{}:
				default:
				}
				<-r.Context().Done()
				return nil, r.Context().Err()
			})}
			handler := newGetMetricsHandlerFuncWithConfig(client, "http://prometheus.example", prometheusHandlerConfig{
				requestTimeout: tt.requestTimeout,
				maxBodyBytes:   1024,
			})
			requestContext, cancel := context.WithCancel(context.Background())
			request := httptest.NewRequest(http.MethodGet, "/api/metrics", nil).WithContext(requestContext)
			w := httptest.NewRecorder()
			done := make(chan struct{})
			go func() {
				handler.ServeHTTP(w, request)
				close(done)
			}()

			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("Prometheus request did not start")
			}
			if tt.cancelParent {
				cancel()
			} else {
				defer cancel()
			}
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("handler did not return after cancellation")
			}
			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", w.Code, tt.wantStatus, w.Body.String())
			}
			if !sawDeadline.Load() {
				t.Error("outbound Prometheus request did not inherit a deadline")
			}
		})
	}
}

func TestApplyQueueFilterQuotesQueueNamesAsRegexLiterals(t *testing.T) {
	queueNames := []string{
		"critical.v1",
		"jobs(fast)",
		"pipe|queue",
		`quote"slash\queue`,
		"line\nbreak",
	}
	got := applyQueueFilter("metric{QUEUE_FILTER}", queueNames)
	quotedMatcher := strings.TrimSuffix(strings.TrimPrefix(got, "metric{queue=~"), "}")
	regexSource, err := strconv.Unquote(quotedMatcher)
	if err != nil {
		t.Fatalf("queue matcher %q is not a valid PromQL string literal: %v", quotedMatcher, err)
	}
	wantRegexSource := strings.Join(quoteRegexps(queueNames), "|")
	if regexSource != wantRegexSource {
		t.Fatalf("regex source = %q, want %q", regexSource, wantRegexSource)
	}
	compiled, err := regexp.Compile("^(?:" + regexSource + ")$")
	if err != nil {
		t.Fatalf("compile generated queue regex: %v", err)
	}
	for _, queueName := range queueNames {
		if !compiled.MatchString(queueName) {
			t.Errorf("generated regex does not match exact queue name %q", queueName)
		}
	}
	for _, unintended := range []string{"criticalXv1", "jobsfast", "pipe", `quoteslash\queue`} {
		if compiled.MatchString(unintended) {
			t.Errorf("generated regex unexpectedly matches %q", unintended)
		}
	}
	if got := applyQueueFilter("metric{QUEUE_FILTER}", nil); got != "metric{}" {
		t.Errorf("empty queue filter = %q, want metric{}", got)
	}
}

func TestBuildPrometheusURL(t *testing.T) {
	baseURL, err := url.Parse("https://prometheus.example/prefix/")
	if err != nil {
		t.Fatal(err)
	}
	opts := &metricsFetchOptions{
		duration: 2 * time.Minute,
		endTime:  time.Unix(1_000, 0),
		queues:   []string{"critical.v1"},
	}
	endpoint, err := url.Parse(buildPrometheusURLFromBase(baseURL, "metric{QUEUE_FILTER}", opts))
	if err != nil {
		t.Fatalf("parse generated URL: %v", err)
	}
	if endpoint.Path != "/prefix"+prometheusAPIPath {
		t.Errorf("path = %q, want %q", endpoint.Path, "/prefix"+prometheusAPIPath)
	}
	if got := endpoint.Query().Get("query"); got != `metric{queue=~"critical\\.v1"}` {
		t.Errorf("query = %q, want escaped queue matcher", got)
	}
	if got := endpoint.Query().Get("start"); got != "880" {
		t.Errorf("start = %q, want 880", got)
	}
	if got := endpoint.Query().Get("end"); got != "1000" {
		t.Errorf("end = %q, want 1000", got)
	}
	if got := endpoint.Query().Get("step"); got != "10" {
		t.Errorf("step = %q, want 10", got)
	}
}

func TestNewPrometheusHTTPClientHasIndependentTimeout(t *testing.T) {
	transport := metricsRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("not called")
	})
	base := &http.Client{Transport: transport}
	got := newPrometheusHTTPClient(base, 250*time.Millisecond)
	if got == base {
		t.Fatal("newPrometheusHTTPClient returned the caller's client")
	}
	if got.Timeout != 250*time.Millisecond {
		t.Errorf("timeout = %s, want 250ms", got.Timeout)
	}
	if _, ok := got.Transport.(metricsRoundTripFunc); !ok {
		t.Errorf("custom transport type was not preserved: %T", got.Transport)
	}
	if base.Timeout != 0 {
		t.Errorf("caller's client timeout was mutated to %s", base.Timeout)
	}

	shorter := newPrometheusHTTPClient(&http.Client{Timeout: 10 * time.Millisecond}, time.Second)
	if shorter.Timeout != 10*time.Millisecond {
		t.Errorf("shorter caller timeout = %s, want 10ms", shorter.Timeout)
	}
}

func quoteRegexps(values []string) []string {
	quoted := make([]string, len(values))
	for i, value := range values {
		quoted[i] = regexp.QuoteMeta(value)
	}
	return quoted
}

type metricsRoundTripFunc func(*http.Request) (*http.Response, error)

func (f metricsRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func metricsHTTPResponse(statusCode int, body string) *http.Response {
	return &http.Response{
		StatusCode: statusCode,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
