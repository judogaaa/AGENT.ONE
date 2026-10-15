package main

import "net/http"

// defaultAIManagerSettings returns a settings struct with safe defaults.
func defaultAIManagerSettings(shopID string) *AIManagerSettings {
	return &AIManagerSettings{
		ID: newID(), ShopID: shopID,
		Enabled: true, Mode: "assistive", Tone: "professional",
		AutoCreateLeads: true, AutoSuggestProducts: true,
		AutoSuggestCheckout: true, HandoffOnUnknown: true,
		AiTone: "professional", AiUseShopContacts: true,
		AiAnswerOutsideCatalog: true, AiStrictCatalogGrounding: true,
	}
}

// updateAIDialogLastMessage updates the last message metadata on a dialog.
func (a *App) updateAIDialogLastMessage(dialogID, message, actor string) {
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET last_message=$1, last_actor=$2, updated_at=NOW() WHERE id=$3", message, actor, dialogID)
}

// callAIProvider wraps the AI provider call.
func (a *App) callAIProvider(w http.ResponseWriter, r *http.Request, req AIRequest) (AIResponse, bool) {
	if a.aiProvider == nil {
		return AIResponse{}, false
	}
	resp, err := a.aiProvider.Generate(r.Context(), req)
	if err != nil || resp.Text == "" {
		return AIResponse{}, false
	}
	return resp, true
}
