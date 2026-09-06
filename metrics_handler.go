package asynqmon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type getMetricsResponse struct {
	QueueSize            *json.RawMessage `json:"queue_size"`
	QueueLatency         *json.RawMessage `json:"queue_latency_seconds"`
	QueueMemUsgApprox    *json.RawMessage `json:"queue_memory_usage_approx_bytes"`
	ProcessedPerSecond   *json.RawMessage `json:"tasks_processed_per_second"`
	FailedPerSecond      *json.RawMessage `json:"tasks_failed_per_second"`
	ErrorRate            *json.RawMessage `json:"error_rate"`
	PendingTasksByQueue  *json.RawMessage `json:"pending_tasks_by_queue"`
	RetryTasksByQueue    *json.RawMessage `json:"retry_tasks_by_queue"`
	ArchivedTasksByQueue *json.RawMessage `json:"archived_tasks_by_queue"`
}

type metricsFetchOptions struct {
	// Specifies the number of seconds to scan for metrics.
	duration time.Duration

	// Specifies the end time when fetching metrics.
	endTime time.Time

	// Optional filter to speicify a list of queues to get metrics for.
	// Empty list indicates no filter (i.e. get metrics for all queues).
	queues []string
}

const (
	prometheusAPIPath              = "/api/v1/query_range"
	prometheusRequestTimeout       = 10 * time.Second
	prometheusMaxResponseBodyBytes = 4 << 20 // 4 MiB per Prometheus query.
	prometheusMaxAggregateBytes    = 24 << 20
	maxConcurrentMetricsRequests   = 2
	maxMetricsDurationSeconds      = 30 * 24 * 60 * 60
	maxMetricsQueuesParameterBytes = 16 << 10
	maxMetricsRawQueryBytes        = 32 << 10
)

type prometheusHandlerConfig struct {
	requestTimeout        time.Duration
	maxBodyBytes          int64
	maxAggregateBodyBytes int64
}

func newGetMetricsHandlerFunc(client *http.Client, prometheusAddr string) http.HandlerFunc {
	return newGetMetricsHandlerFuncWithConfig(client, prometheusAddr, prometheusHandlerConfig{
		requestTimeout:        prometheusRequestTimeout,
		maxBodyBytes:          prometheusMaxResponseBodyBytes,
		maxAggregateBodyBytes: prometheusMaxAggregateBytes,
	})
}

func newGetMetricsHandlerFuncWithConfig(client *http.Client, prometheusAddr string, config prometheusHandlerConfig) http.HandlerFunc {
	// res is the result of calling a JSON API endpoint.
	type res struct {
		query string
		msg   *json.RawMessage
		err   error
	}

	// List of PromQLs.
	// Strings are used as template to optionally insert queue filter specified by QUEUE_FILTER.
	const (
		promQLQueueSize      = "asynq_queue_size{QUEUE_FILTER}"
		promQLQueueLatency   = "asynq_queue_latency_seconds{QUEUE_FILTER}"
		promQLMemUsage       = "asynq_queue_memory_usage_approx_bytes{QUEUE_FILTER}"
		promQLProcessedTasks = "rate(asynq_tasks_processed_total{QUEUE_FILTER}[5m])"
		promQLFailedTasks    = "rate(asynq_tasks_failed_total{QUEUE_FILTER}[5m])"
		promQLErrorRate      = "rate(asynq_tasks_failed_total{QUEUE_FILTER}[5m]) / rate(asynq_tasks_processed_total{QUEUE_FILTER}[5m])"
		promQLPendingTasks   = "asynq_tasks_enqueued_total{state=\"pending\",QUEUE_FILTER}"
		promQLRetryTasks     = "asynq_tasks_enqueued_total{state=\"retry\",QUEUE_FILTER}"
		promQLArchivedTasks  = "asynq_tasks_enqueued_total{state=\"archived\",QUEUE_FILTER}"
	)
	baseURL, configErr := parsePrometheusBaseURL(prometheusAddr)
	if config.requestTimeout <= 0 {
		config.requestTimeout = prometheusRequestTimeout
	}
	if config.maxBodyBytes <= 0 {
		config.maxBodyBytes = prometheusMaxResponseBodyBytes
	}
	if config.maxAggregateBodyBytes <= 0 {
		config.maxAggregateBodyBytes = prometheusMaxAggregateBytes
	}
	client = newPrometheusHTTPClient(client, config.requestTimeout)
	requestSlots := make(chan struct{}, maxConcurrentMetricsRequests)

	// Optional query params:
	// `duration_sec`: specifies the number of seconds to scan
	// `end_time`:     specifies the end_time in Unix time seconds
	return func(w http.ResponseWriter, r *http.Request) {
		if configErr != nil {
			http.Error(w, "Prometheus is not configured correctly", http.StatusServiceUnavailable)
			return
		}
		opts, err := extractMetricsFetchOptions(r)
		if err != nil {
			http.Error(w, fmt.Sprintf("invalid query parameter: %v", err), http.StatusBadRequest)
			return
		}
		select {
		case requestSlots <- struct{}{}:
			defer func() { <-requestSlots }()
		default:
			w.Header().Set("Retry-After", "1")
			http.Error(w, "Prometheus request capacity is temporarily exhausted", http.StatusServiceUnavailable)
			return
		}
		// List of queries (i.e. promQL) to send to prometheus server.
		queries := []string{
			promQLQueueSize,
			promQLQueueLatency,
			promQLMemUsage,
			promQLProcessedTasks,
			promQLFailedTasks,
			promQLErrorRate,
			promQLPendingTasks,
			promQLRetryTasks,
			promQLArchivedTasks,
		}
		resp := getMetricsResponse{}
		// Make multiple API calls concurrently
		n := len(queries)
		ch := make(chan res, len(queries))
		ctx, cancel := context.WithTimeout(r.Context(), config.requestTimeout)
		defer cancel()
		for _, q := range queries {
			go func(q string) {
				endpoint := buildPrometheusURLFromBase(baseURL, q, opts)
				msg, err := fetchPrometheusMetricsWithContext(ctx, client, endpoint, config.maxBodyBytes)
				ch <- res{q, msg, err}
			}(q)
		}
		var aggregateBodyBytes int64
		for r := range ch {
			n--
			if r.err != nil {
				status := prometheusGatewayStatus(r.err)
				message := "Prometheus request failed"
				if status == http.StatusGatewayTimeout {
					message = "Prometheus request timed out"
				}
				http.Error(w, message, status)
				return
			}
			aggregateBodyBytes += int64(len(*r.msg))
			if aggregateBodyBytes > config.maxAggregateBodyBytes {
				http.Error(w, "Prometheus response is too large", http.StatusBadGateway)
				return
			}
			switch r.query {
			case promQLQueueSize:
				resp.QueueSize = r.msg
			case promQLQueueLatency:
				resp.QueueLatency = r.msg
			case promQLMemUsage:
				resp.QueueMemUsgApprox = r.msg
			case promQLProcessedTasks:
				resp.ProcessedPerSecond = r.msg
			case promQLFailedTasks:
				resp.FailedPerSecond = r.msg
			case promQLErrorRate:
				resp.ErrorRate = r.msg
			case promQLPendingTasks:
				resp.PendingTasksByQueue = r.msg
			case promQLRetryTasks:
				resp.RetryTasksByQueue = r.msg
			case promQLArchivedTasks:
				resp.ArchivedTasksByQueue = r.msg
			}
			if n == 0 {
				break // fetched all metrics
			}
		}
		bytes, err := json.Marshal(resp)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to marshal response into JSON: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write(bytes); err != nil {
			http.Error(w, fmt.Sprintf("failed to write to response: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func extractMetricsFetchOptions(r *http.Request) (*metricsFetchOptions, error) {
	opts := &metricsFetchOptions{
		duration: 60 * time.Minute,
		endTime:  time.Now(),
	}
	if len(r.URL.RawQuery) > maxMetricsRawQueryBytes {
		return nil, errors.New("query string is too large")
	}
	q := r.URL.Query()
	if d := q.Get("duration"); d != "" {
		val, err := strconv.ParseInt(d, 10, 64)
		if err != nil || val <= 0 || val > maxMetricsDurationSeconds {
			return nil, fmt.Errorf("invalid value provided for duration: %q", d)
		}
		opts.duration = time.Duration(val) * time.Second
	}
	if t := q.Get("endtime"); t != "" {
		val, err := strconv.ParseInt(t, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid value provided for end_time: %q", t)
		}
		opts.endTime = time.Unix(val, 0)
	}
	if qs := q.Get("queues"); qs != "" {
		if len(qs) > maxMetricsQueuesParameterBytes {
			return nil, errors.New("queues filter is too large")
		}
		opts.queues = strings.Split(qs, ",")
		for _, queue := range opts.queues {
			if queue == "" {
				return nil, errors.New("queues filter contains an invalid queue name")
			}
		}
	}
	return opts, nil
}

func parsePrometheusBaseURL(addr string) (*url.URL, error) {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return nil, errors.New("address is not configured")
	}
	u, err := url.Parse(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("invalid address scheme %q: only http and https are supported", u.Scheme)
	}
	if u.Host == "" {
		return nil, errors.New("invalid address: host is required")
	}
	if u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return nil, errors.New("invalid address: query parameters and fragments are not supported")
	}
	return u, nil
}

// buildPrometheusURL is kept as the string-based helper used by older internal
// callers. The handler parses and validates its configured base URL once and
// calls buildPrometheusURLFromBase for each query.
func buildPrometheusURL(baseAddr, promQL string, opts *metricsFetchOptions) string {
	baseURL, err := parsePrometheusBaseURL(baseAddr)
	if err != nil {
		return ""
	}
	return buildPrometheusURLFromBase(baseURL, promQL, opts)
}

func buildPrometheusURLFromBase(baseURL *url.URL, promQL string, opts *metricsFetchOptions) string {
	u := *baseURL
	u.Path = strings.TrimRight(u.Path, "/") + prometheusAPIPath
	u.RawPath = ""
	v := url.Values{}
	v.Add("query", applyQueueFilter(promQL, opts.queues))
	v.Add("start", unixTimeString(opts.endTime.Add(-opts.duration)))
	v.Add("end", unixTimeString(opts.endTime))
	v.Add("step", strconv.Itoa(int(step(opts).Seconds())))
	u.RawQuery = v.Encode()
	return u.String()
}

func applyQueueFilter(promQL string, qnames []string) string {
	if len(qnames) == 0 {
		return strings.ReplaceAll(promQL, "QUEUE_FILTER", "")
	}
	escaped := make([]string, len(qnames))
	for i, q := range qnames {
		escaped[i] = regexp.QuoteMeta(q)
	}
	matcher := "queue=~" + strconv.Quote(strings.Join(escaped, "|"))
	return strings.ReplaceAll(promQL, "QUEUE_FILTER", matcher)
}

func newPrometheusHTTPClient(client *http.Client, timeout time.Duration) *http.Client {
	if client == nil {
		client = http.DefaultClient
	}
	if client.Timeout > 0 && client.Timeout < timeout {
		timeout = client.Timeout
	}
	return &http.Client{
		Transport:     client.Transport,
		CheckRedirect: client.CheckRedirect,
		Jar:           client.Jar,
		Timeout:       timeout,
	}
}

type prometheusUpstreamStatusError struct {
	statusCode int
	status     string
}

func (e *prometheusUpstreamStatusError) Error() string {
	return fmt.Sprintf("Prometheus returned HTTP %d (%s)", e.statusCode, e.status)
}

// fetchPrometheusMetrics retains the original helper contract while applying
// the same bounded timeout and response validation as the HTTP handler.
func fetchPrometheusMetrics(client *http.Client, endpoint string) (*json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), prometheusRequestTimeout)
	defer cancel()
	return fetchPrometheusMetricsWithContext(
		ctx,
		newPrometheusHTTPClient(client, prometheusRequestTimeout),
		endpoint,
		prometheusMaxResponseBodyBytes,
	)
}

func fetchPrometheusMetricsWithContext(ctx context.Context, client *http.Client, endpoint string, maxBodyBytes int64) (*json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create Prometheus request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, &prometheusUpstreamStatusError{statusCode: resp.StatusCode, status: http.StatusText(resp.StatusCode)}
	}
	bytes, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read Prometheus response: %w", err)
	}
	if int64(len(bytes)) > maxBodyBytes {
		return nil, fmt.Errorf("Prometheus response exceeds the %d-byte limit", maxBodyBytes)
	}
	var envelope struct {
		Status string          `json:"status"`
		Data   json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(bytes, &envelope); err != nil {
		return nil, fmt.Errorf("decode Prometheus response: %w", err)
	}
	if envelope.Status != "success" || len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return nil, errors.New("malformed Prometheus response: expected a successful response with data")
	}
	msg := json.RawMessage(bytes)
	return &msg, nil
}

func prometheusGatewayStatus(err error) int {
	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusGatewayTimeout
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return http.StatusGatewayTimeout
	}
	return http.StatusBadGateway
}

// Returns step to use given the fetch options.
// In general, the longer the duration, longer the each step.
func step(opts *metricsFetchOptions) time.Duration {
	if opts.duration <= 6*time.Hour {
		// maximum number of data points to return: 6h / 10s = 2160
		return 10 * time.Second
	}
	if opts.duration <= 24*time.Hour {
		// maximum number of data points to return: 24h / 1m = 1440
		return 1 * time.Minute
	}
	if opts.duration <= 8*24*time.Hour {
		// maximum number of data points to return: (8*24)h / 3m = 3840
		return 3 * time.Minute
	}
	if opts.duration <= 30*24*time.Hour {
		// maximum number of data points to return: (30*24)h / 10m = 4320
		return 10 * time.Minute
	}
	return opts.duration / 3000
}

func unixTimeString(t time.Time) string {
	return strconv.Itoa(int(t.Unix()))
}
