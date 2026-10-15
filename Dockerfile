# в”Ђв”Ђв”Ђ Frontend build stage в”Ђв”Ђв”Ђ
FROM node:24-alpine AS frontend
WORKDIR /src
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY shared/legal /shared/legal
COPY client/ ./
ARG VITE_AUTH_ORIGIN=http://localhost:5180
ENV VITE_AUTH_ORIGIN=${VITE_AUTH_ORIGIN}
RUN npm run build

# в”Ђв”Ђв”Ђ Backend build stage в”Ђв”Ђв”Ђ
FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.buildTime=${BUILD_TIME}" -o /app/server ./cmd

# в”Ђв”Ђв”Ђ Runtime stage в”Ђв”Ђв”Ђ
FROM alpine:3.19 AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /app/uploads /app/data && chown -R appuser:appgroup /app
WORKDIR /app

COPY --from=frontend /src/dist/ ./client/dist/
COPY --from=backend /app/server ./

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/live || exit 1

USER appuser

ENTRYPOINT ["./server"]
