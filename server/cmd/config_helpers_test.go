package main

import (
	"testing"
)

func TestEnvString(t *testing.T) {
	t.Setenv("TEST_KEY", "hello")
	if v := envString("TEST_KEY", "fallback"); v != "hello" {
		t.Errorf("envString(key,fallback) = %q, want %q", v, "hello")
	}
}

func TestEnvStringFallback(t *testing.T) {
	if v := envString("NONEXISTENT_ENV_KEY_AGENT_ONE", "default"); v != "default" {
		t.Errorf("envString(missing,fallback) = %q, want %q", v, "default")
	}
}

func TestEnvStringEmptyUsesFallback(t *testing.T) {
	t.Setenv("EMPTY_KEY", "   ")
	if v := envString("EMPTY_KEY", "fb"); v != "fb" {
		t.Errorf("envString(empty val, fallback) = %q, want %q", v, "fb")
	}
}

func TestEnvBoolTrueVariants(t *testing.T) {
	for _, v := range []string{"true", "TRUE", "1"} {
		t.Setenv("TB", v)
		if !envBool("TB", false) {
			t.Errorf("envBool(%q, false) = false, want true", v)
		}
	}
}

func TestEnvBoolFalseVariants(t *testing.T) {
	for _, v := range []string{"false", "FALSE", "0"} {
		t.Setenv("FB", v)
		if envBool("FB", true) {
			t.Errorf("envBool(%q, true) = true, want false", v)
		}
	}
}

func TestEnvBoolFallback(t *testing.T) {
	if envBool("GARBAGE_KEY_XYZ", true) != true {
		t.Errorf("envBool(garbage, true) != true")
	}
	if envBool("GARBAGE_KEY_XYZ", false) != false {
		t.Errorf("envBool(garbage, false) != false")
	}
}

func TestEnvInt(t *testing.T) {
	t.Setenv("INT_KEY", "42")
	if v := envInt("INT_KEY", 0); v != 42 {
		t.Errorf("envInt(key,0) = %d, want 42", v)
	}
}

func TestEnvIntFallback(t *testing.T) {
	t.Setenv("INT_KEY", "notanumber")
	if v := envInt("INT_KEY", 99); v != 99 {
		t.Errorf("envInt(bad,99) = %d, want 99", v)
	}
}
