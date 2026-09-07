package asynqmon

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/pars-aria-labs/asynq"
)

// These optional interfaces keep asynqmon compatible with the published
// asynq dependency. A local workspace or a release containing these APIs
// activates the batch fast paths.
type queueBatchInspector interface {
	GetQueueInfoBatch(context.Context, []string, time.Duration) ([]*asynq.QueueInfo, error)
}

type taskBatchInspector interface {
	ProcessTaskBatch(context.Context, string, string, string, string, int) (int, int, error)
}

func getQueueInfos(ctx context.Context, inspector *asynq.Inspector, queues []string) ([]*asynq.QueueInfo, error) {
	if batch, ok := any(inspector).(queueBatchInspector); ok {
		return batch.GetQueueInfoBatch(ctx, queues, 15*time.Second)
	}
	infos := make([]*asynq.QueueInfo, 0, len(queues))
	for _, q := range queues {
		info, err := inspector.GetQueueInfo(q)
		if err != nil {
			return nil, err
		}
		infos = append(infos, info)
	}
	return infos, nil
}

func getQueueInfo(ctx context.Context, inspector *asynq.Inspector, queue string) (*asynq.QueueInfo, error) {
	infos, err := getQueueInfos(ctx, inspector, []string{queue})
	if err != nil {
		return nil, err
	}
	return infos[0], nil
}

// serveTaskBatch adds an optional bounded mode to the existing bulk endpoints.
// Returning false delegates to the legacy unbounded Inspector method, which
// preserves compatibility when asynq does not provide ProcessTaskBatch.
func serveTaskBatch(w http.ResponseWriter, r *http.Request, inspector any, state, action string) bool {
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		http.Error(w, "invalid query string", http.StatusBadRequest)
		return true
	}
	values, present := query["batch_size"]
	if !present {
		return false
	}
	if len(values) != 1 {
		http.Error(w, "batch_size must be specified exactly once", http.StatusBadRequest)
		return true
	}
	raw := values[0]
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > 500 {
		http.Error(w, "batch_size must be between 1 and 500", http.StatusBadRequest)
		return true
	}
	batch, ok := any(inspector).(taskBatchInspector)
	if !ok {
		return false
	}
	vars := mux.Vars(r)
	n, remaining, err := batch.ProcessTaskBatch(r.Context(), vars["qname"], state, action, vars["gname"], limit)
	if err != nil {
		// The mutation and the follow-up remaining-count read are separate Redis
		// operations. Preserve a committed mutation count if only the latter
		// fails, so clients can report confirmed progress without retrying.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":     err.Error(),
			"processed": n,
		})
		return true
	}
	field := map[string]string{"delete": "deleted", "run": "scheduled", "archive": "archived"}[action]
	writeResponseJSON(w, map[string]int{field: n, "remaining": remaining})
	return true
}
