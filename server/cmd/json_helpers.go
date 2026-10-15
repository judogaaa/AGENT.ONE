package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// writeJSON sends a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("writeJSON encode error: %v", err)
	}
}

// writeError sends a JSON error response.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

func writeUnauthorized(w http.ResponseWriter) {
	writeError(w, 401, "unauthorized", "Требуется авторизация.")
}

func writeForbidden(w http.ResponseWriter, msg string) {
	if msg == "" {
		msg = "Недостаточно прав."
	}
	writeError(w, 403, "forbidden", msg)
}

func writeNotFound(w http.ResponseWriter, msg string) {
	if msg == "" {
		msg = "Не найдено."
	}
	writeError(w, 404, "not_found", msg)
}

func writeBadRequest(w http.ResponseWriter, msg string) {
	if msg == "" {
		msg = "Некорректный запрос."
	}
	writeError(w, 400, "bad_request", msg)
}

// defaultJSONBodyLimit is the max read size for JSON body.
const defaultJSONBodyLimit = 1 << 20 // 1 MB

// decodeJSONBody safely reads and decodes a JSON request body.
// Returns false if the body is malformed, too large, or empty.
func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst interface{}, maxBytes int64) bool {
	if maxBytes <= 0 {
		maxBytes = defaultJSONBodyLimit
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	// Only enable DisallowUnknownFields for strict endpoints later if needed
	if err := dec.Decode(dst); err != nil {
		if strings.Contains(err.Error(), "http: request body too large") {
			writeError(w, 413, "payload_too_large", "Слишком большой запрос.")
			return false
		}
		if err.Error() == "EOF" {
			writeError(w, 400, "bad_request", "Пустое тело запроса.")
			return false
		}
		writeError(w, 400, "bad_request", "Некорректный JSON.")
		return false
	}
	return true
}
