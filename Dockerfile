# syntax=docker/dockerfile:1
#
# First stage: 
# Building a frontend.
#

FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
WORKDIR /static
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui .
RUN npm run build

#
# Second stage: 
# Building a backend.
#

FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend

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
# Creating and running a new scratch container with the backend binary.
#

FROM scratch

# Copy binary from /build to the root folder of the scratch container.
COPY --from=backend ["/build/asynqmon", "/"]
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

USER 65534:65534

# Command to run when starting the container.
ENTRYPOINT ["/asynqmon"]
