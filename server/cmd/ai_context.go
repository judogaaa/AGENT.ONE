package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

func toAIShopContext(shop *Shop, settings *AIManagerSettings) *AIShopContext {
	if shop == nil {
		return nil
	}
	sc := &AIShopContext{
		ID:            shop.ID,
		Name:          shop.Name,
		Slug:          shop.Slug,
		Description:   shop.Description,
		About:         shop.About,
		Category:      shop.Category,
		Phone:         shop.Phone,
		Email:         shop.Email,
		City:          shop.City,
		ContactMethod: shop.ContactMethod,
		WorkingHours:  shop.WorkingHours,
		Tagline:       shop.Tagline,
	}
	if shop.AITone != nil {
		sc.AiTone = *shop.AITone
	}
	if settings != nil {
		sc.AiGreeting = settings.AiGreeting
		if settings.AiTone != "" {
			sc.AiTone = settings.AiTone
		}
		sc.AiStylePrompt = settings.AiStylePrompt
		sc.AiForbidden = settings.AiForbiddenClaims
		sc.AiPreferredCTA = settings.AiPreferredCTA
	}
	return sc
}

func toAIProductContext(p *ExProduct) *AIProductContext {
	if p == nil {
		return nil
	}
	ctx := &AIProductContext{
		ID:          p.ID,
		Name:        p.Name,
		Price:       p.Price,
		OldPrice:    p.OldPrice,
		Category:    p.Category,
		Brand:       p.Brand,
		Condition:   p.Condition,
		Description: p.Description,
		Benefits:    p.Benefits,
		ImageCount:  len(normalizeImages(p.Images)),
	}
	return ctx
}

func toAIProductContextFromCopilot(p CopilotProduct) AIProductContext {
	return AIProductContext{
		ID:          p.ID,
		Name:        p.Name,
		Price:       p.Price,
		OldPrice:    p.OldPrice,
		Category:    p.Category,
		Brand:       p.Brand,
		Condition:   p.Condition,
		Description: p.Description,
		Benefits:    p.Benefits,
		ImageCount:  0,
	}
}

func (a *App) fetchShopProductsForAI(ctx context.Context, shopID string, limit int) ([]AIProductContext, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := a.db.Query(ctx,
		`SELECT id, name, description, benefits, price, old_price, category, COALESCE(brand,''), COALESCE(condition,'new'), images
		 FROM products WHERE shop_id=$1 AND is_active=true ORDER BY price DESC LIMIT $2`,
		shopID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AIProductContext
	for rows.Next() {
		var p AIProductContext
		var images []string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Condition, &images); err != nil {
			continue
		}
		p.ImageCount = len(normalizeImages(images))
		out = append(out, p)
	}
	return out, nil
}

func (a *App) fetchRelatedProductsForAI(ctx context.Context, shopID, excludeID, category string, limit int) ([]AIProductContext, error) {
	if limit <= 0 {
		limit = 6
	}
	var rows pgx.Rows
	var err error
	if category != "" {
		rows, err = a.db.Query(ctx,
			`SELECT id, name, description, benefits, price, old_price, category, COALESCE(brand,''), COALESCE(condition,'new'), images
			 FROM products WHERE shop_id=$1 AND is_active=true AND id!=$2 AND category=$3
			 ORDER BY price DESC LIMIT $4`,
			shopID, excludeID, category, limit)
	} else {
		rows, err = a.db.Query(ctx,
			`SELECT id, name, description, benefits, price, old_price, category, COALESCE(brand,''), COALESCE(condition,'new'), images
			 FROM products WHERE shop_id=$1 AND is_active=true AND id!=$2
			 ORDER BY price DESC LIMIT $3`,
			shopID, excludeID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AIProductContext
	for rows.Next() {
		var p AIProductContext
		var images []string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Condition, &images); err != nil {
			continue
		}
		p.ImageCount = len(normalizeImages(images))
		out = append(out, p)
	}
	return out, nil
}

func (a *App) searchProductsForAI(ctx context.Context, query, productType string, maxPrice, minPrice *int, limit int) ([]AIProductContext, error) {
	if limit <= 0 {
		limit = 10
	}
	where := []string{"p.is_active=true", "s.is_published=true"}
	args := []interface{}{}
	idx := 1
	if productType != "" {
		where = append(where, fmt.Sprintf("p.category=$%d", idx))
		args = append(args, productType)
		idx++
	}
	if maxPrice != nil {
		where = append(where, fmt.Sprintf("p.price <= $%d", idx))
		args = append(args, *maxPrice)
		idx++
	}
	if minPrice != nil {
		where = append(where, fmt.Sprintf("p.price >= $%d", idx))
		args = append(args, *minPrice)
		idx++
	}
	smartWhere, smartArgs, newIdx := smartSearchWhere(query, idx)
	if smartWhere != "" {
		where = append(where, smartWhere)
		args = append(args, smartArgs...)
		idx = newIdx
	}
	scoreSQL, scoreArgs, _ := smartSearchScore(query, idx)
	orderBy := "p.price ASC"
	if scoreSQL != "" {
		orderBy = scoreSQL + " DESC, p.price ASC"
		args = append(args, scoreArgs...)
	}
	q := fmt.Sprintf(`SELECT p.id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, COALESCE(p.brand,''), COALESCE(p.condition,'new'), p.images
		FROM products p JOIN shops s ON p.shop_id=s.id
		WHERE %s ORDER BY %s LIMIT %d`, strings.Join(where, " AND "), orderBy, limit)
	rows, err := a.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AIProductContext
	for rows.Next() {
		var p AIProductContext
		var images []string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Condition, &images); err != nil {
			continue
		}
		p.ImageCount = len(normalizeImages(images))
		out = append(out, p)
	}
	return out, nil
}
