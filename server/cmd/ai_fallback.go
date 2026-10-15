package main

import (
	"context"
	"fmt"
	"strings"
)

// RuleBasedProvider is the deterministic fallback when Groq is disabled or fails.
type RuleBasedProvider struct {
	cfg AIConfig
}

func (r *RuleBasedProvider) Generate(ctx context.Context, req AIRequest) (AIResponse, error) {
	var text string
	switch req.Scenario {
	case ScenarioBuyerAssistant:
		text = fallbackBuyerAssistant(req)
	case ScenarioClientAIManager:
		text = fallbackClientAIManager(req)
	case ScenarioBusinessCopilot:
		text = fallbackBusinessCopilot(req)
	default:
		text = safeUnknownAnswer()
	}
	return AIResponse{
		Text:         text,
		Provider:     "rule_based",
		Model:        "rule_based",
		UsedFallback: true,
		Confidence:   0.6,
	}, nil
}

func fallbackBuyerAssistant(req AIRequest) string {
	q := strings.ToLower(strings.TrimSpace(req.UserMessage))
	products := req.Catalog
	if len(products) == 0 && req.Product != nil {
		products = []AIProductContext{*req.Product}
	}

	switch {
	case strings.Contains(q, "привет") || strings.Contains(q, "здравствуй") || strings.Contains(q, "хай"):
		return "Здравствуйте! Я AI-ассистент AGENT.ONE. Помогу подобрать товар из каталога. Что вас интересует?"
	case strings.Contains(q, "цен") || strings.Contains(q, "скольк") || strings.Contains(q, "стоимост") || strings.Contains(q, "почём"):
		if len(products) > 0 {
			var sb strings.Builder
			sb.WriteString("Актуальные цены:\n")
			for _, p := range products {
				sb.WriteString(fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price))
			}
			sb.WriteString("\nТочную цену и наличие уточняйте у продавца.")
			return sb.String()
		}
	case strings.Contains(q, "сравн") || strings.Contains(q, "что лучше") || strings.Contains(q, "какой лучше") || strings.Contains(q, "отличает"):
		if len(products) >= 2 {
			var sb strings.Builder
			sb.WriteString("Сравнение по данным карточек:\n")
			cheapest := products[0]
			for _, p := range products[1:] {
				if p.Price < cheapest.Price {
					cheapest = p
				}
			}
			for _, p := range products {
				sb.WriteString(fmt.Sprintf("• %s — %d ₽", p.Name, p.Price))
				if p.Brand != "" {
					sb.WriteString(fmt.Sprintf(", %s", p.Brand))
				}
				sb.WriteString("\n")
			}
			sb.WriteString(fmt.Sprintf("\nСамый доступный вариант — %s (%d ₽). Детали уточните у продавца.", cheapest.Name, cheapest.Price))
			return sb.String()
		}
	case strings.Contains(q, "доставк") || strings.Contains(q, "привез") || strings.Contains(q, "курьер"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	case strings.Contains(q, "гарант") || strings.Contains(q, "возврат") || strings.Contains(q, "обмен"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	case strings.Contains(q, "скидк") || strings.Contains(q, "акци") || strings.Contains(q, "дешевл"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	case strings.Contains(q, "налич") || strings.Contains(q, "есть ли"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	case strings.Contains(q, "заказ") || strings.Contains(q, "оформ") || strings.Contains(q, "купит"):
		return "Чтобы оформить заказ, выберите товар и нажмите «Оставить заявку». Продавец свяжется с вами."
	}

	if len(products) > 0 {
		var sb strings.Builder
		sb.WriteString("Нашёл подходящие товары:\n")
		for _, p := range products {
			sb.WriteString(fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price))
		}
		sb.WriteString("\nЕсли нужно сравнить или узнать подробности — спрашивайте.")
		return sb.String()
	}
	return safeUnknownAnswer()
}

func fallbackClientAIManager(req AIRequest) string {
	q := strings.ToLower(strings.TrimSpace(req.UserMessage))
	shop := req.Shop
	product := req.Product
	products := req.Catalog

	greeting := "Здравствуйте!"
	if shop != nil {
		if shop.AiGreeting != "" {
			greeting = shop.AiGreeting
		} else {
			greeting = fmt.Sprintf("Здравствуйте! Я AI-менеджер магазина %s. Помогу с выбором и отвечу на вопросы по товарам.", shop.Name)
		}
	}

	if strings.Contains(q, "привет") || strings.Contains(q, "здравствуй") {
		return greeting
	}
	if strings.Contains(q, "цен") || strings.Contains(q, "скольк") || strings.Contains(q, "стоимост") || strings.Contains(q, "почём") {
		if product != nil {
			return fmt.Sprintf("%s — %d ₽. Точную цену и наличие уточняйте у продавца.", product.Name, product.Price)
		}
		if len(products) > 0 {
			var sb strings.Builder
			sb.WriteString("Цены на товары магазина:\n")
			for _, p := range products {
				sb.WriteString(fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price))
			}
			sb.WriteString("\nТочную цену и наличие уточняйте у продавца.")
			return sb.String()
		}
	}
	if strings.Contains(q, "доставк") || strings.Contains(q, "привез") || strings.Contains(q, "курьер") ||
		strings.Contains(q, "гарант") || strings.Contains(q, "возврат") || strings.Contains(q, "обмен") ||
		strings.Contains(q, "скидк") || strings.Contains(q, "акци") || strings.Contains(q, "дешевл") ||
		strings.Contains(q, "налич") || strings.Contains(q, "есть ли") {
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	}
	if strings.Contains(q, "заказ") || strings.Contains(q, "оформ") || strings.Contains(q, "купит") {
		return "Чтобы оформить заказ, оставьте заявку на товаре. Продавец свяжется с вами."
	}
	if len(products) > 0 {
		var sb strings.Builder
		sb.WriteString(greeting + "\n\nВот что могу предложить из товаров магазина:\n")
		for _, p := range products {
			sb.WriteString(fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price))
		}
		return sb.String()
	}
	return greeting
}

func fallbackBusinessCopilot(req AIRequest) string {
	q := strings.ToLower(strings.TrimSpace(req.UserMessage))
	shop := req.Shop
	product := req.Product
	products := req.Catalog

	greeting := "Здравствуйте!"
	if shop != nil {
		greeting = fmt.Sprintf("Здравствуйте! %s на связи.", shop.Name)
	}

	switch {
	case strings.Contains(q, "привет") || strings.Contains(q, "здравствуй"):
		return greeting + " Что вас интересует?"
	case strings.Contains(q, "цен") || strings.Contains(q, "сколько стоит") || strings.Contains(q, "прайс"):
		if product != nil {
			return fmt.Sprintf("%s%s — %d ₽. Если нужны подробности или фото — напишите, вышлю.", greeting, product.Name, product.Price)
		}
		if len(products) > 0 {
			var sb strings.Builder
			sb.WriteString(greeting + " Актуальные цены:\n")
			for _, p := range products[:min(5, len(products))] {
				sb.WriteString(fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price))
			}
			sb.WriteString("\nУточните, какая модель интересует — подготовлю детали.")
			return sb.String()
		}
	case strings.Contains(q, "доставк"):
		return greeting + " Доставка обсуждается индивидуально. Уточните город и удобный способ получения — рассчитаю варианты."
	case strings.Contains(q, "гарант") || strings.Contains(q, "возврат"):
		return greeting + " Условия гарантии и возврата уточню и отвечу точно."
	case strings.Contains(q, "скидк") || strings.Contains(q, "дешевл"):
		return greeting + " Цены актуальные. Индивидуальные условия обсуждаем отдельно."
	case strings.Contains(q, "налич"):
		return greeting + " Проверю актуальное наличие и отвечу."
	}

	if product != nil {
		return fmt.Sprintf("%s Спасибо за обращение. По товару %s (%d ₽) подготовлю ответ. Если нужно — уточните детали.", greeting, product.Name, product.Price)
	}
	if len(products) > 0 {
		return fmt.Sprintf("%s Спасибо за обращение. Подобрал варианты из каталога, напишу подробности.", greeting)
	}
	return greeting + " Спасибо за обращение. Уточните, что именно вас интересует — помогу."
}

func safeUnknownAnswer() string {
	return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
