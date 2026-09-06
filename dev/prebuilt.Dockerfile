# Optional offline runtime image. Build the executable on the host first.
FROM scratch
ARG BINARY
COPY ${BINARY} /app
USER 65534:65534
ENTRYPOINT ["/app"]
