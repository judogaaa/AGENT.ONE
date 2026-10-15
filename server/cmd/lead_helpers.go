package main

import "net/http"

// createLead inserts a lead and returns the lead ID.
func (a *App) createLead(shopID, productID, customerUserID, name, phone, email, message, productName, source, aiReply, deliveryCity, contactPreference, customerNeed string) (string, error) {
	id := newID()
	_, err := a.db.Exec(a.ctx,
		`INSERT INTO leads (id, shop_id, product_id, name, phone, email, message, product_name, source, ai_reply, delivery_city, contact_preference, customer_need, status, customer_user_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'new',$14)`,
		id, shopID, productID, name, phone, email, message, productName, source, aiReply, deliveryCity, contactPreference, customerNeed, customerUserID)
	return id, err
}

// getBusinessLeads returns leads for a shop with optional status filter.
func (a *App) getBusinessLeads(shopID, statusFilter string) ([]Lead, error) {
	query := `SELECT l.id, l.name, COALESCE(l.phone,''), COALESCE(l.email,''), COALESCE(l.message,''), l.status, COALESCE(l.created_at::text,''), COALESCE(l.product_name,''), COALESCE(l.ai_reply,''), COALESCE(l.source,''), COALESCE(l.delivery_city,''), COALESCE(l.contact_preference,''), COALESCE(l.customer_need,''), COALESCE(l.status_updated_at::text,''), COALESCE(l.seller_note,'')
		FROM leads l WHERE l.shop_id=$1`
	args := []interface{}{shopID}
	if statusFilter != "" {
		query += " AND l.status=$2"
		args = append(args, statusFilter)
	}
	query += " ORDER BY COALESCE(l.status_updated_at,l.created_at) DESC"
	rows, err := a.db.Query(a.ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var leads []Lead
	for rows.Next() {
		var l Lead
		if err := rows.Scan(&l.ID, &l.Name, &l.Phone, &l.Email, &l.Message, &l.Status, &l.CreatedAt, &l.ProductName, &l.AiReply, &l.Source, &l.DeliveryCity, &l.ContactPreference, &l.CustomerNeed, &l.StatusUpdatedAt, &l.SellerNote); err == nil {
			leads = append(leads, l)
		}
	}
	return leads, nil
}

// updateLeadStatus updates a lead's status.
func (a *App) updateLeadStatus(shopID, leadID, status, sellerNote string) error {
	_, err := a.db.Exec(a.ctx, "UPDATE leads SET status=$1, status_updated_at=NOW(), seller_note=$2 WHERE id=$3 AND shop_id=$4", status, sellerNote, leadID, shopID)
	return err
}

// storeLeadProductName stores a product name for a lead.
func (a *App) storeLeadProductName(w http.ResponseWriter, leadID, shopID, productID string) string {
	if productID == "" {
		return ""
	}
	var name string
	a.db.QueryRow(a.ctx, "SELECT name FROM products WHERE id=$1 AND shop_id=$2 AND is_active=true", productID, shopID).Scan(&name)
	return name
}
