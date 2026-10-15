package main

import "net/http"

// requireAuth checks auth and returns claims or writes 401.
func (a *App) requireAuth(w http.ResponseWriter, r *http.Request) (*jwtClaims, bool) {
	claims, err := a.auth(r)
	if err != nil {
		writeUnauthorized(w)
		return nil, false
	}
	return claims, true
}

// requireRole checks auth + role. Writes 401/403 as appropriate.
func (a *App) requireRole(w http.ResponseWriter, r *http.Request, roles ...string) (*jwtClaims, bool) {
	claims, ok := a.requireAuth(w, r)
	if !ok {
		return nil, false
	}
	for _, ro := range roles {
		if claims.Role == ro {
			return claims, true
		}
	}
	writeForbidden(w, "Недостаточно прав.")
	return nil, false
}

// requireBusiness requires auth + role=business.
func (a *App) requireBusiness(w http.ResponseWriter, r *http.Request) (*jwtClaims, bool) {
	return a.requireRole(w, r, "business")
}

// requireClient requires auth + role=client.
func (a *App) requireClient(w http.ResponseWriter, r *http.Request) (*jwtClaims, bool) {
	return a.requireRole(w, r, "client")
}
