# syntax=docker/dockerfile:1
#
# First stage: 
# Building a frontend.
#

FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS frontend
WORKDIR /static
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui .
RUN npm run build

#
# Second stage: 
# Building a backend.
#

FROM --platform=$BUILDPLATFORM golang:1.25-alpine@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 AS backend

ARG TARGETOS
ARG TARGETARCH

# Move to a working directory (/build).
WORKDIR /build

# The final scratch image needs the system trust store when Redis or
# Prometheus is configured with TLS.
RUN apk add --no-cache ca-certificates

# Copy and download dependencies.
COPY go.mod go.sum ./
RUN go mod download

# Copy a source code to the container.
COPY . .

# Copy frontend static files from /static to the root folder of the backend container.
COPY --from=frontend ["/static/build", "ui/build"]

# Cross-compile for the selected target while running the compiler natively on
# the builder. Frontend assets and CA certificates are architecture-neutral.
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o asynqmon ./cmd/asynqmon

#
# Third stage:
# Creating and running a minimal container with the backend binary.
#

FROM scratch

LABEL org.opencontainers.image.title="Asynqmon" \
      org.opencontainers.image.description="A web dashboard for Asynq queues and tasks" \
      org.opencontainers.image.source="https://github.com/pars-aria-labs/asynqmon" \
      org.opencontainers.image.licenses="MIT"

# Copy binary from /build to the root folder of the scratch container.
COPY --from=backend ["/build/asynqmon", "/"]
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

USER 65534:65534

EXPOSE 8080

# Command to run when starting the container.
ENTRYPOINT ["/asynqmon"]
