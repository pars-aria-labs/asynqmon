package main

import (
	"crypto/tls"
	"flag"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/hibiken/asynq"
)

func TestParseFlags(t *testing.T) {
	t.Setenv("BASIC_AUTH_USERNAME", "")
	t.Setenv("BASIC_AUTH_PASSWORD", "")

	tests := []struct {
		args []string
		want *Config
	}{
		{
			args: []string{"--redis-addr", "localhost:6380", "--redis-db", "3"},
			want: &Config{
				RedisAddr: "localhost:6380",
				RedisDB:   3,

				// Default values
				Port:                  8080,
				RedisPassword:         "",
				RedisTLS:              "",
				RedisURL:              "",
				RedisInsecureTLS:      false,
				RedisClusterNodes:     "",
				RedisPrefix:           "",
				MaxPayloadLength:      200,
				MaxResultLength:       200,
				EnableMetricsExporter: false,
				PrometheusServerAddr:  "",
				ReadOnly:              false,
				BasicAuthUsername:     "",
				BasicAuthPassword:     "",

				Args: []string{},
			},
		},
		{
			args: []string{"--basic-auth-username", "admin", "--basic-auth-password", "secret"},
			want: &Config{
				Port:                  8080,
				RedisAddr:             "127.0.0.1:6379",
				RedisDB:               0,
				RedisPassword:         "",
				RedisTLS:              "",
				RedisURL:              "",
				RedisInsecureTLS:      false,
				RedisClusterNodes:     "",
				RedisPrefix:           "",
				ReadOnly:              false,
				MaxPayloadLength:      200,
				MaxResultLength:       200,
				BasicAuthUsername:     "admin",
				BasicAuthPassword:     "secret",
				EnableMetricsExporter: false,
				PrometheusServerAddr:  "",
				Args:                  []string{},
			},
		},
		{
			args: []string{"--redis-prefix", "tenant-a"},
			want: &Config{
				Port:                  8080,
				RedisAddr:             "127.0.0.1:6379",
				RedisDB:               0,
				RedisPassword:         "",
				RedisTLS:              "",
				RedisURL:              "",
				RedisInsecureTLS:      false,
				RedisClusterNodes:     "",
				RedisPrefix:           "tenant-a",
				MaxPayloadLength:      200,
				MaxResultLength:       200,
				EnableMetricsExporter: false,
				PrometheusServerAddr:  "",
				ReadOnly:              false,
				BasicAuthUsername:     "",
				BasicAuthPassword:     "",
				Args:                  []string{},
			},
		},
	}

	for _, tc := range tests {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			cfg, output, err := parseFlags("asynqmon", tc.args)
			if err != nil {
				t.Errorf("parseFlags returned error: %v", err)
			}
			if output != "" {
				t.Errorf("parseFlag returned output=%q, want empty", output)
			}
			if diff := cmp.Diff(tc.want, cfg); diff != "" {
				t.Errorf("parseFlag returned Config %v, want %v; (-want,+got)\n%s", cfg, tc.want, diff)
			}
		})
	}

}

func TestParseFlagsRejectsPartialBasicAuth(t *testing.T) {
	t.Setenv("BASIC_AUTH_USERNAME", "")
	t.Setenv("BASIC_AUTH_PASSWORD", "")

	for _, args := range [][]string{
		{"--basic-auth-username", "admin"},
		{"--basic-auth-password", "secret"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			cfg, _, err := parseFlags("asynqmon", args)
			if err == nil {
				t.Fatal("parseFlags accepted a partial Basic Auth configuration")
			}
			if cfg != nil {
				t.Fatalf("parseFlags returned config %v with validation error", cfg)
			}
			if !strings.Contains(err.Error(), "requires both --basic-auth-username and --basic-auth-password") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestParseFlagsHelpDoesNotExposeSensitiveEnvironmentDefaults(t *testing.T) {
	const (
		redisPassword     = "redis-password-from-env"
		redisURL          = "redis://:url-password-from-env@redis.internal:6379/4"
		prometheusAddr    = "https://monitor-token@prometheus.internal:9090"
		basicAuthPassword = "basic-auth-password-from-env"
	)

	t.Setenv("REDIS_PASSWORD", redisPassword)
	t.Setenv("REDIS_URL", redisURL)
	t.Setenv("PROMETHEUS_ADDR", prometheusAddr)
	t.Setenv("BASIC_AUTH_USERNAME", "operator")
	t.Setenv("BASIC_AUTH_PASSWORD", basicAuthPassword)

	config, output, err := parseFlags("asynqmon", []string{"--help"})
	if err != flag.ErrHelp {
		t.Fatalf("parseFlags error = %v, want flag.ErrHelp", err)
	}
	if config != nil {
		t.Fatalf("parseFlags config = %#v, want nil", config)
	}

	for _, secret := range []string{redisPassword, redisURL, prometheusAddr, basicAuthPassword} {
		if strings.Contains(output, secret) {
			t.Errorf("help output exposes sensitive environment default %q", secret)
		}
	}
	for _, name := range []string{"redis-password", "redis-url", "prometheus-addr", "basic-auth-password"} {
		if !strings.Contains(output, "-"+name) {
			t.Errorf("help output does not document -%s", name)
		}
	}

	config, output, err = parseFlags("asynqmon", nil)
	if err != nil {
		t.Fatalf("parseFlags returned error: %v", err)
	}
	if output != "" {
		t.Fatalf("parseFlags output = %q, want empty", output)
	}
	if config.RedisPassword != redisPassword {
		t.Errorf("RedisPassword = %q, want environment value", config.RedisPassword)
	}
	if config.RedisURL != redisURL {
		t.Errorf("RedisURL = %q, want environment value", config.RedisURL)
	}
	if config.PrometheusServerAddr != prometheusAddr {
		t.Errorf("PrometheusServerAddr = %q, want environment value", config.PrometheusServerAddr)
	}
	if config.BasicAuthPassword != basicAuthPassword {
		t.Errorf("BasicAuthPassword = %q, want environment value", config.BasicAuthPassword)
	}
}

func TestWithOptionalBasicAuth(t *testing.T) {
	handler := withOptionalBasicAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), &Config{
		BasicAuthUsername: "admin",
		BasicAuthPassword: "secret",
	})

	tests := []struct {
		desc       string
		path       string
		username   string
		password   string
		wantStatus int
	}{
		{desc: "missing credentials", path: "/", wantStatus: http.StatusUnauthorized},
		{desc: "wrong credentials", path: "/", username: "admin", password: "bad", wantStatus: http.StatusUnauthorized},
		{desc: "correct credentials", path: "/", username: "admin", password: "secret", wantStatus: http.StatusNoContent},
		{desc: "metrics exporter missing credentials", path: "/metrics", wantStatus: http.StatusUnauthorized},
		{desc: "metrics exporter correct credentials", path: "/metrics", username: "admin", password: "secret", wantStatus: http.StatusNoContent},
	}

	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.username != "" || tc.password != "" {
				req.SetBasicAuth(tc.username, tc.password)
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if got := rec.Header().Get("Cache-Control"); got != "private, no-store" {
				t.Fatalf("Cache-Control = %q, want private, no-store", got)
			}
			if tc.wantStatus == http.StatusUnauthorized {
				if got := rec.Header().Get("WWW-Authenticate"); got != `Basic realm="Asynqmon", charset="UTF-8"` {
					t.Fatalf("WWW-Authenticate = %q", got)
				}
			}
		})
	}
}

func TestWithOptionalBasicAuthDisabled(t *testing.T) {
	handler := withOptionalBasicAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), &Config{})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestWithOptionalBasicAuthRejectsPartialConfig(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("withOptionalBasicAuth accepted a partial configuration")
		}
	}()
	withOptionalBasicAuth(http.NotFoundHandler(), &Config{BasicAuthUsername: "admin"})
}

func TestMakeRedisConnOpt(t *testing.T) {
	var tests = []struct {
		desc string
		cfg  *Config
		want asynq.RedisConnOpt
	}{
		{
			desc: "With address, db number and password",
			cfg: &Config{
				RedisAddr:     "localhost:6380",
				RedisDB:       1,
				RedisPassword: "foo",
				RedisPrefix:   "tenant-a",
			},
			want: asynq.RedisClientOpt{
				Addr:     "localhost:6380",
				DB:       1,
				Password: "foo",
				Prefix:   "tenant-a",
			},
		},
		{
			desc: "With TLS server name",
			cfg: &Config{
				RedisAddr: "localhost:6379",
				RedisTLS:  "foobar",
			},
			want: asynq.RedisClientOpt{
				Addr:      "localhost:6379",
				TLSConfig: &tls.Config{ServerName: "foobar"},
			},
		},
		{
			desc: "With redis URL",
			cfg: &Config{
				RedisURL: "redis://:bar@localhost:6381/2",
			},
			want: asynq.RedisClientOpt{
				Addr:     "localhost:6381",
				DB:       2,
				Password: "bar",
			},
		},
		{
			desc: "With redis-sentinel URL",
			cfg: &Config{
				RedisURL: "redis-sentinel://:secretpassword@localhost:5000,localhost:5001,localhost:5002?master=mymaster",
			},
			want: asynq.RedisFailoverClientOpt{
				MasterName: "mymaster",
				SentinelAddrs: []string{
					"localhost:5000", "localhost:5001", "localhost:5002"},
				SentinelPassword: "secretpassword",
			},
		},
		{
			desc: "With cluster nodes",
			cfg: &Config{
				RedisClusterNodes: "localhost:5000,localhost:5001,localhost:5002,localhost:5003,localhost:5004,localhost:5005",
				RedisPrefix:       "tenant-a",
			},
			want: asynq.RedisClusterClientOpt{
				Addrs: []string{
					"localhost:5000", "localhost:5001", "localhost:5002", "localhost:5003", "localhost:5004", "localhost:5005"},
				Prefix: "tenant-a",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.desc, func(t *testing.T) {
			got, err := makeRedisConnOpt(tc.cfg)
			if err != nil {
				t.Fatalf("makeRedisConnOpt returned error: %v", err)
			}

			if diff := cmp.Diff(tc.want, got, cmpopts.IgnoreUnexported(tls.Config{})); diff != "" {
				t.Errorf("diff found: want=%v, got=%v; (-want,+got)\n%s",
					tc.want, got, diff)
			}
		})
	}
}
