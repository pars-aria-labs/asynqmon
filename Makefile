.PHONY: api assets build docker

assets:
	cd ./ui && npm ci --no-audit --no-fund
	cd ./ui && npm run build

# This target skips the overhead of building UI assets.
# Intended to be used during development.
api:
	go build -o api ./cmd/asynqmon

# Build a release binary.
build: assets
	go build -o asynqmon ./cmd/asynqmon

# Build image and run Asynqmon server (with default settings).
docker:
	docker build -t asynqmon .
	docker run --rm \
		--name asynqmon \
		--add-host=host.docker.internal:host-gateway \
		--publish 127.0.0.1:8080:8080 \
		asynqmon --redis-addr=host.docker.internal:6379

# Isolated local demo with Redis, synthetic tasks, and Prometheus.
.PHONY: demo demo-down demo-logs
demo:
	docker compose -f compose.demo.yaml up --build -d --wait

demo-down:
	docker compose -f compose.demo.yaml down

demo-logs:
	docker compose -f compose.demo.yaml logs -f demo dashboard

# Fallback when builder images cannot be downloaded. Uses existing ui/build.
.PHONY: demo-prebuilt
demo-prebuilt:
	mkdir -p dev/bin
	CGO_ENABLED=0 GOOS=linux go build -o dev/bin/dashboard ./cmd/asynqmon
	CGO_ENABLED=0 GOOS=linux go build -o dev/bin/demo ./cmd/demo
	docker compose -f compose.demo.yaml -f dev/compose.prebuilt.yaml up --build -d --wait
