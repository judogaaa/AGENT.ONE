package main

// getProductByID scans an ExProduct from the products table.
func (a *App) getProductByID(productID string) (*ExProduct, error) {
	var p ExProduct
	err := a.db.QueryRow(a.ctx,
		`SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active,
		 COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''),
		 COALESCE(condition,'new'), COALESCE(product_type,''), COALESCE(search_keywords,'')
		 FROM products WHERE id=$1`, productID).
		Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category,
			&p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.Condition, &p.ProductType, &p.SearchKeywords)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// getProductShopOwner returns the owner_id of the shop that owns a product.
func (a *App) getProductShopOwner(productID string) (string, string, error) {
	var shopID, ownerID string
	err := a.db.QueryRow(a.ctx, "SELECT s.id, s.owner_id FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1", productID).
		Scan(&shopID, &ownerID)
	return shopID, ownerID, err
}
