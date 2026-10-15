package main

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// legalDetailSpec mirrors shared/legal/config.js LEGAL_DETAILS.
var legalDetailSpecs = []struct {
	Key      string
	Env      string
	Required bool
}{
	{"operatorName", "LEGAL_OPERATOR_NAME", true},
	{"operatorLegalForm", "LEGAL_OPERATOR_LEGAL_FORM", true},
	{"inn", "LEGAL_INN", true},
	{"ogrn", "LEGAL_OGRN", true},
	{"legalAddress", "LEGAL_LEGAL_ADDRESS", true},
	{"postalAddress", "LEGAL_POSTAL_ADDRESS", true},
	{"generalEmail", "LEGAL_GENERAL_EMAIL", true},
	{"contactEmail", "LEGAL_CONTACT_EMAIL", true},
	{"contactPhone", "LEGAL_CONTACT_PHONE", true},
	{"workingHours", "LEGAL_WORKING_HOURS", true},
}

func missingLegalDetails() []string {
	var missing []string
	for _, spec := range legalDetailSpecs {
		if !spec.Required {
			continue
		}
		val := strings.TrimSpace(os.Getenv(spec.Env))
		if val == "" {
			missing = append(missing, spec.Key)
		}
	}
	return missing
}

func handleLegalDeployCheck(w http.ResponseWriter, r *http.Request) {
	missing := missingLegalDetails()
	jsonOK(w, map[string]interface{}{
		"ready":   len(missing) == 0,
		"missing": missing,
	})
}

// ValidateLegalDetailsForProduction aborts startup/deploy when required operator details are empty.
func ValidateLegalDetailsForProduction() error {
	if os.Getenv("LEGAL_DEPLOY_SKIP_CHECK") == "1" {
		return nil
	}
	if os.Getenv("GO_ENV") != "production" && os.Getenv("AGENTONE_ENV") != "production" {
		return nil
	}
	missing := missingLegalDetails()
	if len(missing) > 0 {
		b, _ := json.Marshal(missing)
		return &legalDetailsError{missing: string(b)}
	}
	return nil
}

type legalDetailsError struct {
	missing string
}

func (e *legalDetailsError) Error() string {
	return "LEGAL_DETAILS required fields missing: " + e.missing
}
