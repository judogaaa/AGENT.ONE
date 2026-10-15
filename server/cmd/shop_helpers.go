package main

import "net/http"

// getShopByOwnerID returns the shop owned by the given user, scanning all public fields.
func (a *App) getShopByOwnerID(ownerID string) (*Shop, error) {
	var s Shop
	err := a.db.QueryRow(a.ctx,
		`SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published,
		 logo_url, cover_url, color, ai_tone, custom_domain,
		 COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''),
		 COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager,
		 COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved')
		 FROM shops WHERE owner_id=$1 LIMIT 1`, ownerID).
		Scan(&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.About, &s.Category,
			&s.IsPublished, &s.LogoURL, &s.CoverURL, &s.Color, &s.AITone, &s.CustomDomain,
			&s.Phone, &s.Email, &s.City, &s.ContactMethod, &s.WorkingHours, &s.ShowAiManager,
			&s.Tagline, &s.CreatedAt, &s.VerificationStatus)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// getShopIDForBusiness returns the shop ID for the authenticated business user.
func (a *App) getShopIDForBusiness(claims *jwtClaims) (string, error) {
	var shopID string
	err := a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	return shopID, err
}

// requireApprovedBusinessShop authenticates a business user and ensures their shop is approved.
// Returns (claims, shopID, true) on success, writes error and returns false on failure.
func (a *App) requireApprovedBusinessShop(w http.ResponseWriter, r *http.Request) (*jwtClaims, string, bool) {
	claims, ok := a.requireBusiness(w, r)
	if !ok {
		return nil, "", false
	}

	shopID, err := a.getShopIDForBusiness(claims)
	if err != nil {
		writeNotFound(w, "shop not found")
		return nil, "", false
	}

	var status string
	a.db.QueryRow(a.ctx, "SELECT COALESCE(verification_status,'approved') FROM shops WHERE id=$1", shopID).Scan(&status)
	if status == "pending" {
		writeForbidden(w, "your shop must be approved to perform this action")
		return nil, "", false
	}
	if status == "rejected" {
		writeForbidden(w, "your shop verification was rejected")
		return nil, "", false
	}

	return claims, shopID, true
}
