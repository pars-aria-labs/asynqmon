package asynqmon

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
)

func basicAuthMiddleware(username, password string) func(http.Handler) http.Handler {
	expectedUser := sha256.Sum256([]byte(username))
	expectedPass := sha256.Sum256([]byte(password))
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, pass, ok := r.BasicAuth()
			actualUser := sha256.Sum256([]byte(user))
			actualPass := sha256.Sum256([]byte(pass))
			userMatch := subtle.ConstantTimeCompare(actualUser[:], expectedUser[:])
			passMatch := subtle.ConstantTimeCompare(actualPass[:], expectedPass[:])
			// Prevent shared caches from reusing authenticated monitoring responses.
			w.Header().Set("Cache-Control", "private, no-store")
			if !ok || userMatch&passMatch != 1 {
				w.Header().Set("WWW-Authenticate", `Basic realm="Asynqmon", charset="UTF-8"`)
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
