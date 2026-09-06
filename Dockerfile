#
# First stage: 
# Building a frontend.
#

FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend

# Move to a working directory (/static).
WORKDIR /static

# react-scripts still uses a legacy digest while producing static assets. This
# compatibility flag is scoped to the disposable frontend build stage.
ENV NODE_OPTIONS=--openssl-legacy-provider

# Install the same Yarn major version used by the checked-in lockfile.
RUN npm install --global yarn@1.22.22

# Cache dependency installation separately from application sources.
COPY ui/package.json ui/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY ui .

# Run yarn scripts (install & build).
RUN yarn build

#
# Second stage: 
# Building a backend.
#

FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS backend

ARG TARGETOS
ARG TARGETARCH

# Move to a working directory (/build).
WORKDIR /build

# Copy and download dependencies.
COPY go.mod go.sum ./
RUN go mod download

# Copy a source code to the container.
COPY . .

# Copy frontend static files from /static to the root folder of the backend container.
COPY --from=frontend ["/static/build", "ui/build"]

# Build for the target image architecture (with ldflags to reduce binary size).
RUN CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" \
    go build -ldflags="-s -w" -o asynqmon ./cmd/asynqmon

#
# Third stage:
# Preparing the public CA bundle used by Redis TLS and HTTPS Prometheus URLs.
#

FROM --platform=$BUILDPLATFORM alpine:3.22 AS certificates
RUN apk add --no-cache ca-certificates

#
# Fourth stage:
# Creating and running a minimal container with the backend binary.
#

FROM scratch

# Keep TLS certificate verification functional in the scratch image.
COPY --from=certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary from /build to the root folder of the scratch container.
COPY --from=backend ["/build/asynqmon", "/"]

# Command to run when starting the container.
ENTRYPOINT ["/asynqmon"]
