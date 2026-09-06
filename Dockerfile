#
# First stage: 
# Building a frontend.
#

FROM node:24-alpine AS frontend

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

FROM golang:1.25-alpine AS backend

# Move to a working directory (/build).
WORKDIR /build

# Copy and download dependencies.
COPY go.mod go.sum ./
RUN go mod download

# Copy a source code to the container.
COPY . .

# Copy frontend static files from /static to the root folder of the backend container.
COPY --from=frontend ["/static/build", "ui/build"]

# Set necessary environmet variables needed for the image and build the server.
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64

# Run go build (with ldflags to reduce binary size).
RUN go build -ldflags="-s -w" -o asynqmon ./cmd/asynqmon

#
# Third stage: 
# Creating and running a new scratch container with the backend binary.
#

FROM scratch

# Copy binary from /build to the root folder of the scratch container.
COPY --from=backend ["/build/asynqmon", "/"]

# Command to run when starting the container.
ENTRYPOINT ["/asynqmon"]
