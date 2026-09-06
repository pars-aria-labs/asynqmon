// Command demo generates synthetic background work for the local Compose stack.
// Its handlers simulate work only: they do not send emails or contact services.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pars-aria-labs/asynq"
)

type payload struct {
	Description string `json:"description"`
	DurationMS  int    `json:"duration_ms"`
	Failures    int    `json:"failures_before_success"`
}

func newTask(kind, description string, duration time.Duration, failures int) *asynq.Task {
	data, err := json.Marshal(payload{description, int(duration.Milliseconds()), failures})
	if err != nil {
		panic(err)
	} // This struct contains only JSON-safe primitive values.
	return asynq.NewTask(kind, data)
}

func handleTask(ctx context.Context, task *asynq.Task) error {
	var p payload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("invalid demo payload: %w", asynq.SkipRetry)
	}
	timer := time.NewTimer(time.Duration(p.DurationMS) * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
	}
	retries, _ := asynq.GetRetryCount(ctx)
	if p.Failures < 0 || retries < p.Failures {
		return errors.New("simulated demo failure: this task intentionally fails so you can inspect retries and errors")
	}
	result, _ := json.Marshal(map[string]any{"status": "completed", "description": p.Description, "attempt": retries + 1})
	_, err := task.ResultWriter().Write(result)
	return err
}

func enqueueBatch(ctx context.Context, client *asynq.Client) error {
	jobs := []struct {
		queue   string
		task    *asynq.Task
		options []asynq.Option
	}{
		{"default", newTask("demo:work", "Long-running work visible in Active", 12*time.Second, 0), nil},
		{"default", newTask("demo:work", "Another job waiting for a worker", 12*time.Second, 0), nil},
		{"default", newTask("demo:work", "Background work waiting in the queue", 12*time.Second, 0), nil},
		{"emails", newTask("demo:email", "Simulated welcome email; no email is sent", 2*time.Second, 0), nil},
		{"emails", newTask("demo:retry", "Fails twice, then succeeds", time.Second, 2), nil},
		{"reports", newTask("demo:archive", "Intentional permanent failure for the Archived view", time.Second, -1), []asynq.Option{asynq.MaxRetry(0)}},
		{"reports", newTask("demo:report", "Report scheduled two minutes from now", 5*time.Second, 0), []asynq.Option{asynq.ProcessIn(2 * time.Minute)}},
	}
	for _, job := range jobs {
		opts := []asynq.Option{asynq.Queue(job.queue), asynq.MaxRetry(3), asynq.Retention(time.Hour), asynq.Timeout(time.Minute)}
		opts = append(opts, job.options...)
		info, err := client.EnqueueContext(ctx, job.task, opts...)
		if err != nil {
			return fmt.Errorf("enqueue %s: %w", job.task.Type(), err)
		}
		log.Printf("enqueued %s in %s (%s)", job.task.Type(), job.queue, info.ID)
	}
	return nil
}

func run(ctx context.Context, addr string) error {
	conn := asynq.RedisClientOpt{Addr: addr}
	client := asynq.NewClient(conn)
	defer client.Close()
	server := asynq.NewServer(conn, asynq.Config{
		Concurrency:     2,
		Queues:          map[string]int{"default": 3, "emails": 2, "reports": 1},
		RetryDelayFunc:  func(int, error, *asynq.Task) time.Duration { return 20 * time.Second },
		ShutdownTimeout: 5 * time.Second,
	})
	mux := asynq.NewServeMux()
	mux.HandleFunc("demo:", handleTask)
	if err := server.Start(mux); err != nil {
		return err
	}
	defer server.Shutdown()
	scheduler := asynq.NewScheduler(conn, &asynq.SchedulerOpts{Location: time.UTC})
	if _, err := scheduler.Register("@every 1m", newTask("demo:scheduled", "Recurring report every minute", 3*time.Second, 0), asynq.Queue("reports"), asynq.Retention(time.Hour)); err != nil {
		return err
	}
	if err := scheduler.Start(); err != nil {
		return err
	}
	defer scheduler.Shutdown()
	if err := enqueueBatch(ctx, client); err != nil {
		return err
	}
	log.Print("demo ready: three queues, two workers, one recurring schedule; adding seven tasks every 30 seconds")
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := enqueueBatch(ctx, client); err != nil {
				log.Printf("demo batch failed: %v", err)
			}
		}
	}
}

func main() {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "127.0.0.1:6379"
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx, addr); err != nil {
		log.Fatal(err)
	}
}
