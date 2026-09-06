package asynqmon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/pars-aria-labs/asynq"
	"github.com/redis/go-redis/v9"
)

type recordingTaskBatchInspector struct {
	queue     string
	state     string
	action    string
	group     string
	limit     int
	processed int
	remaining int
	calls     int
	err       error
}

func (i *recordingTaskBatchInspector) ProcessTaskBatch(
	_ context.Context,
	queue, state, action, group string,
	limit int,
) (int, int, error) {
	i.queue = queue
	i.state = state
	i.action = action
	i.group = group
	i.limit = limit
	i.calls++
	return i.processed, i.remaining, i.err
}

func newScheduledBatchRouter(inspector any, middlewares ...mux.MiddlewareFunc) *mux.Router {
	router := mux.NewRouter()
	router.HandleFunc(
		"/api/queues/{qname}/scheduled_tasks:run_all",
		func(w http.ResponseWriter, r *http.Request) {
			serveTaskBatch(w, r, inspector, "scheduled", "run")
		},
	).Methods(http.MethodPost)
	for _, middleware := range middlewares {
		router.Use(middleware)
	}
	return router
}

func TestServeTaskBatchRejectsInvalidLimit(t *testing.T) {
	for _, limit := range []string{"", "0", "-1", "501", "abc", "%zz", "500&batch_size=1"} {
		t.Run(limit, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodPost, "/queues/default/scheduled_tasks:run_all?batch_size="+limit, nil)
			if !serveTaskBatch(w, r, nil, "scheduled", "run") {
				t.Fatal("serveTaskBatch returned false")
			}
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestServeTaskBatchReturnsProgress(t *testing.T) {
	inspector := &recordingTaskBatchInspector{processed: 500, remaining: 23}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(
		http.MethodPost,
		"/api/queues/critical/scheduled_tasks:run_all?batch_size=500",
		nil,
	)

	newScheduledBatchRouter(inspector).ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var got map[string]int
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["scheduled"] != 500 || got["remaining"] != 23 {
		t.Fatalf("response = %v, want scheduled=500 and remaining=23", got)
	}
	if inspector.calls != 1 || inspector.queue != "critical" || inspector.state != "scheduled" || inspector.action != "run" || inspector.group != "" || inspector.limit != 500 {
		t.Fatalf("unexpected inspector call: %+v", inspector)
	}
}

func TestServeTaskBatchPreservesProcessedCountOnError(t *testing.T) {
	inspector := &recordingTaskBatchInspector{
		processed: 3,
		err:       errors.New("remaining count failed"),
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(
		http.MethodPost,
		"/api/queues/critical/scheduled_tasks:run_all?batch_size=10",
		nil,
	)

	newScheduledBatchRouter(inspector).ServeHTTP(w, r)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
	var got struct {
		Error     string `json:"error"`
		Processed int    `json:"processed"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.Processed != 3 || got.Error != "remaining count failed" {
		t.Fatalf("response = %+v", got)
	}
}

func TestBulkEndpointMiddleware(t *testing.T) {
	bulkPath := "/api/queues/default/scheduled_tasks:run_all?batch_size=500"

	t.Run("read-only blocks bounded mutation", func(t *testing.T) {
		inspector := &recordingTaskBatchInspector{processed: 1}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, bulkPath, nil)
		newScheduledBatchRouter(inspector, restrictToReadOnly).ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusMethodNotAllowed)
		}
		if inspector.calls != 0 {
			t.Fatalf("inspector called %d times, want 0", inspector.calls)
		}
	})

	t.Run("basic auth blocks missing credentials", func(t *testing.T) {
		inspector := &recordingTaskBatchInspector{processed: 1}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, bulkPath, nil)
		newScheduledBatchRouter(inspector, basicAuthMiddleware("admin", "secret")).ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
		if got := w.Header().Get("WWW-Authenticate"); got == "" {
			t.Fatal("WWW-Authenticate header is missing")
		}
		if inspector.calls != 0 {
			t.Fatalf("inspector called %d times, want 0", inspector.calls)
		}
	})

	t.Run("basic auth allows valid credentials", func(t *testing.T) {
		inspector := &recordingTaskBatchInspector{processed: 7, remaining: 2}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, bulkPath, nil)
		r.SetBasicAuth("admin", "secret")
		newScheduledBatchRouter(inspector, basicAuthMiddleware("admin", "secret")).ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}
		if inspector.calls != 1 {
			t.Fatalf("inspector called %d times, want 1", inspector.calls)
		}
	})
}

func TestMuxRouterProtectsBatchEndpoint(t *testing.T) {
	const addr = "127.0.0.1:0"
	redisClient := redis.NewClient(&redis.Options{Addr: addr})
	inspector := asynq.NewInspector(asynq.RedisClientOpt{Addr: addr})
	t.Cleanup(func() {
		_ = redisClient.Close()
		_ = inspector.Close()
	})
	router := muxRouter(Options{
		ReadOnly:          true,
		BasicAuthUsername: "admin",
		BasicAuthPassword: "secret",
	}, redisClient, inspector)
	path := "/api/queues/default/scheduled_tasks:run_all?batch_size=500"

	t.Run("authentication runs before the API handler", func(t *testing.T) {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})

	t.Run("read-only runs after valid authentication", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, path, nil)
		r.SetBasicAuth("admin", "secret")
		router.ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusMethodNotAllowed)
		}
	})
}

func TestTaskBatchEndpointIntegration(t *testing.T) {
	addr := os.Getenv("ASYNQ_TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("ASYNQ_TEST_REDIS_ADDR is not set")
	}
	queue := "batch-integration"
	opt := asynq.RedisClientOpt{
		Addr:   addr,
		DB:     13,
		Prefix: fmt.Sprintf("asynqmon-batch-%d", time.Now().UnixNano()),
	}
	inspector := asynq.NewInspector(opt)
	if _, ok := any(inspector).(taskBatchInspector); !ok {
		_ = inspector.Close()
		t.Skip("asynq dependency does not provide ProcessTaskBatch")
	}
	client := asynq.NewClient(opt)
	t.Cleanup(func() {
		_ = inspector.DeleteQueue(queue, true)
		_ = client.Close()
		_ = inspector.Close()
	})

	for i := 0; i < 523; i++ {
		_, err := client.Enqueue(
			asynq.NewTask("batch:scheduled", nil),
			asynq.Queue(queue),
			asynq.ProcessIn(time.Hour),
		)
		if err != nil {
			t.Fatalf("enqueue task %d: %v", i, err)
		}
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequest(
		http.MethodPost,
		"/api/queues/"+queue+"/scheduled_tasks:run_all?batch_size=500",
		nil,
	)
	newScheduledBatchRouter(inspector).ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}
	var got map[string]int
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["scheduled"] != 500 || got["remaining"] != 23 {
		t.Fatalf("response = %v, want scheduled=500 and remaining=23", got)
	}
	info, err := inspector.GetQueueInfo(queue)
	if err != nil {
		t.Fatalf("get queue info: %v", err)
	}
	if info.Pending != 500 || info.Scheduled != 23 {
		t.Fatalf("queue stats = %+v, want pending=500 and scheduled=23", info)
	}
}
