package main

// getClientOrders returns orders for a given user.
func (a *App) getClientOrders(userID string) ([]Order, error) {
	rows, err := a.db.Query(a.ctx,
		`SELECT o.id, o.shop_id, COALESCE(o.user_id,''), o.customer_name, o.customer_phone, COALESCE(o.customer_email,''),
		 o.total_amount, COALESCE(o.payment_method,''), COALESCE(o.payment_status,''), COALESCE(o.delivery_method,'online'),
		 COALESCE(o.order_status,'created'), COALESCE(o.source,'site'), COALESCE(o.created_at::text,''), COALESCE(o.updated_at::text,'')
		 FROM orders o WHERE o.user_id=$1 ORDER BY o.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.ShopID, &o.UserID, &o.CustomerName, &o.CustomerPhone, &o.CustomerEmail,
			&o.TotalAmount, &o.PaymentMethod, &o.PaymentStatus, &o.DeliveryMethod, &o.OrderStatus, &o.Source, &o.CreatedAt, &o.UpdatedAt); err == nil {
			orders = append(orders, o)
		}
	}
	return orders, nil
}

// getBusinessOrders returns orders for a given shop.
func (a *App) getBusinessOrders(shopID string) ([]Order, error) {
	rows, err := a.db.Query(a.ctx,
		`SELECT o.id, o.shop_id, COALESCE(o.user_id,''), o.customer_name, o.customer_phone, COALESCE(o.customer_email,''),
		 o.total_amount, COALESCE(o.payment_method,''), COALESCE(o.payment_status,''), COALESCE(o.delivery_method,'online'),
		 COALESCE(o.order_status,'created'), COALESCE(o.source,'site'), COALESCE(o.created_at::text,''), COALESCE(o.updated_at::text,'')
		 FROM orders o WHERE o.shop_id=$1 ORDER BY o.created_at DESC`, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.ShopID, &o.UserID, &o.CustomerName, &o.CustomerPhone, &o.CustomerEmail,
			&o.TotalAmount, &o.PaymentMethod, &o.PaymentStatus, &o.DeliveryMethod, &o.OrderStatus, &o.Source, &o.CreatedAt, &o.UpdatedAt); err == nil {
			orders = append(orders, o)
		}
	}
	return orders, nil
}

// updateOrderStatus updates an order's status.
func (a *App) updateOrderStatus(shopID, orderID, status string) error {
	_, err := a.db.Exec(a.ctx, "UPDATE orders SET order_status=$1, updated_at=NOW() WHERE id=$2 AND shop_id=$3", status, orderID, shopID)
	return err
}
