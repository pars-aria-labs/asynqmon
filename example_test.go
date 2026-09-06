package asynqmon_test

import (
	"log"
	"net/http"

	"github.com/pars-aria-labs/asynq"
	"github.com/pars-aria-labs/asynqmon"
)

func ExampleHTTPHandler() {
	h := asynqmon.New(asynqmon.Options{
		RootPath:     "/monitoring",
		RedisConnOpt: asynq.RedisClientOpt{Addr: ":6379"},
	})
	defer h.Close()

	mux := http.NewServeMux()
	mux.Handle(h.RootPath()+"/", h)
	// Visit localhost:8000/monitoring/ to see the Asynqmon homepage.
	log.Print(http.ListenAndServe(":8000", mux))
}
