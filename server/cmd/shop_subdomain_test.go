package main

import "testing"

func TestShopSubdomainFromHost(t *testing.T) {
	cases := []struct {
		host string
		want string
	}{
		{"agent-one.ru", ""},
		{"www.agent-one.ru", ""},
		{"WWW.agent-one.ru", ""},
		{"auth.agent-one.ru", ""},
		{"api.agent-one.ru", ""},
		{"myshop.agent-one.ru", "myshop"},
		{"myshop.agent-one.ru:443", "myshop"},
		{"localhost", ""},
		{"shop.localhost", ""},
		{"127.0.0.1", ""},
	}
	for _, tc := range cases {
		if got := shopSubdomainFromHost(tc.host); got != tc.want {
			t.Fatalf("shopSubdomainFromHost(%q)=%q want %q", tc.host, got, tc.want)
		}
	}
}
