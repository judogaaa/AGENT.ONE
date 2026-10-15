package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, 200, map[string]string{"ok": "yes"})

	if w.Code != 200 {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var v map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if v["ok"] != "yes" {
		t.Errorf("ok = %q, want yes", v["ok"])
	}
}

func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, 403, "forbidden", "no access")

	if w.Code != 403 {
		t.Errorf("status = %d, want 403", w.Code)
	}
	var v map[string]string
	json.Unmarshal(w.Body.Bytes(), &v)
	if v["error"] != "forbidden" {
		t.Errorf("error = %q, want forbidden", v["error"])
	}
	if v["message"] != "no access" {
		t.Errorf("message = %q, want 'no access'", v["message"])
	}
}

func TestDecodeJSONBodyValid(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"name":"test"}`)
	r := httptest.NewRequest("POST", "/", body)
	var v struct{ Name string }
	if !decodeJSONBody(w, r, &v, 1<<20) {
		t.Fatal("decodeJSONBody returned false for valid JSON")
	}
	if v.Name != "test" {
		t.Errorf("name = %q, want test", v.Name)
	}
}

func TestDecodeJSONBodyMalformed(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(`not json`)
	r := httptest.NewRequest("POST", "/", body)
	var v struct{ Name string }
	if decodeJSONBody(w, r, &v, 1<<20) {
		t.Error("decodeJSONBody returned true for malformed JSON")
	}
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestDecodeJSONBodyEmpty(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(``)
	r := httptest.NewRequest("POST", "/", body)
	var v struct{ Name string }
	if decodeJSONBody(w, r, &v, 1<<20) {
		t.Error("decodeJSONBody returned true for empty body")
	}
}

func TestDecodeJSONBodyOversized(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(strings.Repeat("x", 2000))
	r := httptest.NewRequest("POST", "/", body)
	var v struct{ Name string }
	// 10 byte limit — body is way larger
	decodeJSONBody(w, r, &v, 10)
	// Either a 413 or 400 is acceptable
	if w.Code < 400 {
		t.Errorf("status = %d, want error", w.Code)
	}
}

func TestWriteUnauthorized(t *testing.T) {
	w := httptest.NewRecorder()
	writeUnauthorized(w)
	if w.Code != 401 {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestWriteForbidden(t *testing.T) {
	w := httptest.NewRecorder()
	writeForbidden(w, "test")
	if w.Code != 403 {
		t.Errorf("status = %d, want 403", w.Code)
	}
}

func TestWriteNotFound(t *testing.T) {
	w := httptest.NewRecorder()
	writeNotFound(w, "gone")
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestWriteBadRequest(t *testing.T) {
	w := httptest.NewRecorder()
	writeBadRequest(w, "bad")
	if w.Code != 400 {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestDecodeJSONBodyLiteral(t *testing.T) {
	w := httptest.NewRecorder()
	// "null" is valid JSON but decodes to zero-value
	body := bytes.NewReader([]byte(`42`))
	r := httptest.NewRequest("POST", "/", body)
	var v int
	if decodeJSONBody(w, r, &v, 1<<20) {
		if v != 42 {
			t.Errorf("decoded = %d, want 42", v)
		}
	}
}
