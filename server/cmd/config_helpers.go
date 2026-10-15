package main

import (
	"os"
	"strconv"
	"strings"
)

// envString reads an environment variable or returns fallback.
func envString(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// envBool reads a boolean environment variable (true/1) or returns fallback.
func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "true" || v == "1" {
		return true
	}
	if v == "false" || v == "0" {
		return false
	}
	return fallback
}

// envInt reads an integer environment variable or returns fallback.
func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	if n, err := strconv.Atoi(v); err == nil {
		return n
	}
	return fallback
}

// envCSV reads a comma-separated environment variable into a slice.
func envCSV(key string) []string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return nil
	}
	var out []string
	for _, s := range strings.Split(v, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// isLocalDev returns true if APP_ENV is not "production".
func isLocalDev() bool {
	return strings.ToLower(envString("APP_ENV", "development")) != "production"
}
