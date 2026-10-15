package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ── MODELS ──

type Profile struct {
	ID                 string `json:"id"`
	Role               string `json:"role"`
	DisplayName        string `json:"displayName"`
	Email              string `json:"email"`
	Password           string `json:"-"`
	Phone              string `json:"phone,omitempty"`
	FirstName          string `json:"firstName,omitempty"`
	LastName           string `json:"lastName,omitempty"`
	Patronymic         string `json:"patronymic,omitempty"`
	BirthDate          string `json:"birthDate,omitempty"`
	AvatarUrl          string `json:"avatarUrl,omitempty"`
	DeliveryCity       string `json:"deliveryCity,omitempty"`
	DeliveryAddress    string `json:"deliveryAddress,omitempty"`
	DeliveryComment    string `json:"deliveryComment,omitempty"`
	PayerType          string `json:"payerType,omitempty"`
	BillingName        string `json:"billingName,omitempty"`
	BillingCompanyName string `json:"billingCompanyName,omitempty"`
	BillingInn         string `json:"billingInn,omitempty"`
	EmailVerifiedAt    string `json:"-"`
}

type Shop struct {
	ID                 string  `json:"id"`
	OwnerID            string  `json:"ownerId"`
	Slug               string  `json:"slug"`
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	About              string  `json:"about,omitempty"`
	Category           string  `json:"category"`
	IsPublished        bool    `json:"isPublished"`
	LogoURL            *string `json:"logoUrl,omitempty"`
	CoverURL           *string `json:"coverUrl,omitempty"`
	Color              *string `json:"color,omitempty"`
	AITone             *string `json:"aiTone,omitempty"`
	CustomDomain       *string `json:"customDomain,omitempty"`
	Phone              string  `json:"phone,omitempty"`
	Email              string  `json:"email,omitempty"`
	City               string  `json:"city,omitempty"`
	ContactMethod      string  `json:"contactMethod,omitempty"`
	WorkingHours       string  `json:"workingHours,omitempty"`
	ShowAiManager      bool    `json:"showAiManager"`
	Tagline            string  `json:"tagline,omitempty"`
	CreatedAt          string  `json:"createdAt,omitempty"`
	VerificationStatus string  `json:"verificationStatus,omitempty"`
}

type Product struct {
	ID          string   `json:"id"`
	ShopID      string   `json:"shopId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Benefits    []string `json:"benefits,omitempty"`
	Price       int      `json:"price"`
	OldPrice    *int     `json:"oldPrice,omitempty"`
	Category    string   `json:"category"`
	Images      []string `json:"images,omitempty"`
	IsActive    bool     `json:"isActive"`
}

// ExProduct — Product with extended filter fields returned by catalog/search endpoints
type ExProduct struct {
	ID                 string   `json:"id"`
	ShopID             string   `json:"shopId"`
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	Benefits           []string `json:"benefits,omitempty"`
	Price              int      `json:"price"`
	OldPrice           *int     `json:"oldPrice,omitempty"`
	Category           string   `json:"category"`
	Images             []string `json:"images,omitempty"`
	IsActive           bool     `json:"isActive"`
	Brand              string   `json:"brand,omitempty"`
	Color              string   `json:"color,omitempty"`
	DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
	KeyboardType       string   `json:"keyboardType,omitempty"`
	KeyboardConnection string   `json:"keyboardConnection,omitempty"`
	Condition          string   `json:"condition,omitempty"`
	ProductType        string   `json:"productType,omitempty"`
	SearchKeywords     string   `json:"searchKeywords,omitempty"`
	PopularityScore    int      `json:"popularityScore"`
	RatingAvg          float64  `json:"ratingAvg"`
	CreatedAt          string   `json:"createdAt,omitempty"`
	ShopName           string   `json:"shopName,omitempty"`
	ShopSlug           string   `json:"shopSlug,omitempty"`
}

type Lead struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Phone             string `json:"phone,omitempty"`
	Email             string `json:"email,omitempty"`
	Message           string `json:"message,omitempty"`
	Status            string `json:"status"`
	CreatedAt         string `json:"createdAt,omitempty"`
	ProductName       string `json:"productName,omitempty"`
	AiReply           string `json:"aiReply,omitempty"`
	Source            string `json:"source,omitempty"`
	DeliveryCity      string `json:"deliveryCity,omitempty"`
	ContactPreference string `json:"contactPreference,omitempty"`
	CustomerNeed      string `json:"customerNeed,omitempty"`
	StatusUpdatedAt   string `json:"statusUpdatedAt,omitempty"`
	SellerNote        string `json:"sellerNote,omitempty"`
}

type Order struct {
	ID             string      `json:"id"`
	ShopID         string      `json:"shopId"`
	UserID         string      `json:"userId,omitempty"`
	CustomerName   string      `json:"customerName"`
	CustomerPhone  string      `json:"customerPhone"`
	CustomerEmail  string      `json:"customerEmail"`
	TotalAmount    int         `json:"totalAmount"`
	PaymentMethod  string      `json:"paymentMethod"`
	PaymentStatus  string      `json:"paymentStatus"`
	DeliveryMethod string      `json:"deliveryMethod"`
	OrderStatus    string      `json:"orderStatus"`
	Source         string      `json:"source"`
	CreatedAt      string      `json:"createdAt"`
	UpdatedAt      string      `json:"updatedAt"`
	Items          []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	ID           string `json:"id"`
	OrderID      string `json:"orderId"`
	ProductID    string `json:"productId"`
	ProductName  string `json:"productName"`
	ProductImage string `json:"productImage,omitempty"`
	Price        int    `json:"price"`
	Quantity     int    `json:"quantity"`
	CreatedAt    string `json:"createdAt"`
}

type PaymentSettings struct {
	ID                  string  `json:"id"`
	ShopID              string  `json:"shopId"`
	Provider            string  `json:"provider"`
	OnlineEnabled       bool    `json:"onlineEnabled"`
	CardEnabled         bool    `json:"cardEnabled"`
	SBPEnabled          bool    `json:"sbpEnabled"`
	QREnabled           bool    `json:"qrEnabled"`
	StorePaymentEnabled bool    `json:"storePaymentEnabled"`
	CashEnabled         bool    `json:"cashEnabled"`
	InvoiceEnabled      bool    `json:"invoiceEnabled"`
	IsTestMode          bool    `json:"isTestMode"`
	ShopIDExternal      *string `json:"shopIdExternal,omitempty"`
	EncryptedSecretKey  *string `json:"encryptedSecretKey,omitempty"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
}

type CopilotRequest struct {
	ID                 string `json:"id"`
	ShopID             string `json:"shopId"`
	RawCustomerMessage string `json:"rawCustomerMessage"`
	GeneratedReply     string `json:"generatedReply"`
	Style              string `json:"style"`
	SourceChannel      string `json:"sourceChannel,omitempty"`
	CreatedLeadID      string `json:"createdLeadId,omitempty"`
	CreatedOrderID     string `json:"createdOrderId,omitempty"`
	CreatedAt          string `json:"createdAt"`
}

type AIManagerSettings struct {
	ID                       string `json:"id"`
	ShopID                   string `json:"shopId"`
	Enabled                  bool   `json:"enabled"`
	Mode                     string `json:"mode"`
	Tone                     string `json:"tone"`
	WelcomeMessage           string `json:"welcomeMessage"`
	HandoffMessage           string `json:"handoffMessage"`
	DeliveryPolicy           string `json:"deliveryPolicy"`
	WarrantyPolicy           string `json:"warrantyPolicy"`
	PaymentPolicy            string `json:"paymentPolicy"`
	DiscountPolicy           string `json:"discountPolicy"`
	ForbiddenTopics          string `json:"forbiddenTopics"`
	AiGreeting               string `json:"aiGreeting"`
	AiTone                   string `json:"aiTone"`
	AiStylePrompt            string `json:"aiStylePrompt"`
	AiForbiddenClaims        string `json:"aiForbiddenClaims"`
	AiPreferredCTA           string `json:"aiPreferredCTA"`
	AiUseShopContacts        bool   `json:"aiUseShopContacts"`
	AiAnswerOutsideCatalog   bool   `json:"aiAnswerOutsideCatalog"`
	AiStrictCatalogGrounding bool   `json:"aiStrictCatalogGrounding"`
	AutoCreateLeads          bool   `json:"autoCreateLeads"`
	AutoSuggestProducts      bool   `json:"autoSuggestProducts"`
	AutoSuggestCheckout      bool   `json:"autoSuggestCheckout"`
	HandoffOnUnknown         bool   `json:"handoffOnUnknown"`
	CreatedAt                string `json:"createdAt"`
	UpdatedAt                string `json:"updatedAt"`
}

type AIManagerDialog struct {
	ID                  string  `json:"id"`
	ShopID              string  `json:"shopId"`
	ClientUserID        *string `json:"clientUserId,omitempty"`
	ProductID           *string `json:"productId,omitempty"`
	LeadID              *string `json:"leadId,omitempty"`
	Status              string  `json:"status"`
	Source              string  `json:"source"`
	Title               string  `json:"title"`
	LastMessage         string  `json:"lastMessage"`
	LastActor           string  `json:"lastActor"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
	ClosedAt            *string `json:"closedAt,omitempty"`
	TakenOverByBusiness bool    `json:"takenOverByBusiness"`
	TakenOverAt         *string `json:"takenOverAt,omitempty"`
}

type AIManagerMessage struct {
	ID           string                 `json:"id"`
	DialogID     string                 `json:"dialogId"`
	ShopID       string                 `json:"shopId"`
	ClientUserID *string                `json:"clientUserId,omitempty"`
	SenderRole   string                 `json:"senderRole"`
	Message      string                 `json:"message"`
	MessageType  string                 `json:"messageType"`
	ProductIDs   []string               `json:"productIds,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt    string                 `json:"createdAt"`
}

type jwtClaims struct {
	Sub  string `json:"sub"`
	Role string `json:"role"`
	Exp  int64  `json:"exp"`
	Jti  string `json:"jti,omitempty"`
}

type App struct {
	db          *pgxpool.Pool
	jwtKey      []byte
	aiKey       string
	ctx         context.Context
	aiProvider  AIProvider
	secCfg      AccountSecurityConfig
	emailSender EmailVerificationSender

	distDir    string // path to client/dist, resolved at startup
	uploadsDir string // path to uploads root, resolved at startup
}

// ── HELPERS ──

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func hashPW(pw string) string {
	h, _ := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(h)
}

func checkPW(hashed, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(pw)) == nil
}

func makeJWT(userID, role string, secret []byte) string {
	token, _ := makeJWTWithTTL(userID, role, secret, 60*24*3) // 3 days
	return token
}

func makeJWTWithTTL(userID, role string, secret []byte, ttlMinutes int) (string, string) {
	jti := newID() + newID() // 32 hex chars
	claims := jwtClaims{Sub: userID, Role: role, Exp: time.Now().Add(time.Duration(ttlMinutes) * time.Minute).Unix(), Jti: jti}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(claims)
	signingInput := header + "." + base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signingInput))
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), jti
}

func parseJWT(token string, secret []byte) (*jwtClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("bad token")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal([]byte(base64.RawURLEncoding.EncodeToString(mac.Sum(nil))), []byte(parts[2])) {
		return nil, errors.New("bad sig")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c jwtClaims
	if json.Unmarshal(payloadBytes, &c) != nil {
		return nil, err
	}
	if time.Now().Unix() > c.Exp {
		return nil, errors.New("expired")
	}
	return &c, nil
}

func jsonOK(w http.ResponseWriter, d interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "data": d})
}

func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": msg})
}

func (a *App) auth(r *http.Request) (*jwtClaims, error) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return nil, errors.New("no token")
	}
	claims, err := parseJWT(strings.TrimPrefix(h, "Bearer "), a.jwtKey)
	if err != nil {
		return nil, err
	}
	// Проверяем JTI в Redis (если Redis доступен)
	if claims.Jti != "" && !JTIExists(r.Context(), claims.Jti) {
		return nil, errors.New("token revoked")
	}
	return claims, nil
}

var corsOrigins []string

func initCORS() {
	origins := envCSV("CORS_ORIGINS")
	if len(origins) == 0 {
		origins = envCSV("APP_ORIGIN")
	}
	if len(origins) == 0 {
		corsOrigins = []string{"http://localhost:8080", "http://localhost:5173"}
		return
	}
	corsOrigins = origins
}

func corsAllowed(origin string) bool {
	if origin == "" {
		return true // same-origin / no Origin header
	}
	for _, o := range corsOrigins {
		if strings.EqualFold(o, origin) {
			return true
		}
	}
	return false
}

// resolveProjectRoot — находит корень проекта по любому из маркеров
func resolveProjectRoot() string {
	cwd, _ := os.Getwd()
	markers := []string{"server/go.mod", "docker-compose.yml", "client"}

	dir := cwd
	for {
		for _, m := range markers {
			if _, err := os.Stat(filepath.Join(dir, m)); err == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	log.Println("WARNING: project root not found, using CWD")
	return cwd
}

// resolveDistDir — находит client/dist относительно projectRoot
func resolveDistDir() string {
	root := resolveProjectRoot()
	distPath := filepath.Join(root, "client", "dist")
	if _, err := os.Stat(distPath); err == nil {
		if _, err := os.Stat(filepath.Join(distPath, "index.html")); err == nil {
			return distPath
		}
	}
	log.Println("WARNING: client/dist not found, trying default path")
	return "client/dist"
}

// resolveUploadsDir — находит uploads относительно projectRoot
func resolveUploadsDir() string {
	root := resolveProjectRoot()
	uploadsPath := filepath.Join(root, "uploads")
	if _, err := os.Stat(uploadsPath); err != nil {
		os.MkdirAll(uploadsPath, 0755)
	}
	return uploadsPath
}

// ── DB ──

func initDB(connStr string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		return nil, err
	}
	schema := `
	CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, role TEXT DEFAULT 'client', display_name TEXT, email TEXT UNIQUE, password TEXT, phone TEXT, first_name TEXT, last_name TEXT, patronymic TEXT, birth_date TEXT);
	CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, owner_id TEXT, slug TEXT UNIQUE, name TEXT, description TEXT, category TEXT, is_published BOOLEAN DEFAULT true, logo_url TEXT, color TEXT, ai_tone TEXT, custom_domain TEXT UNIQUE);
	CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, shop_id TEXT REFERENCES shops(id), name TEXT, description TEXT, benefits TEXT[], price INTEGER DEFAULT 0, old_price INTEGER, category TEXT, images TEXT[], is_active BOOLEAN DEFAULT true);
	CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, shop_id TEXT REFERENCES shops(id), product_id TEXT, name TEXT, phone TEXT, email TEXT, message TEXT, status TEXT DEFAULT 'new', created_at TIMESTAMP DEFAULT NOW());
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_name TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_reply TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS delivery_city TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_preference TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_need TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS seller_note TEXT;
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_user_id TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS delivery_city TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS delivery_address TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS delivery_comment TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payer_type TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_name TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_company_name TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_inn TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS custom_domain TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS patronymic TEXT;
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date TEXT;
	`
	// Новые таблицы для MVP
	schema += `
	CREATE TABLE IF NOT EXISTS orders (
		id TEXT PRIMARY KEY,
		shop_id TEXT REFERENCES shops(id),
		user_id TEXT,
		customer_name TEXT,
		customer_phone TEXT,
		customer_email TEXT,
		total_amount INTEGER DEFAULT 0,
		payment_method TEXT,
		payment_status TEXT DEFAULT 'not_paid',
		delivery_method TEXT,
		order_status TEXT DEFAULT 'created',
		source TEXT DEFAULT 'site',
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS order_items (
		id TEXT PRIMARY KEY,
		order_id TEXT REFERENCES orders(id),
		product_id TEXT,
		product_name TEXT,
		price INTEGER DEFAULT 0,
		quantity INTEGER DEFAULT 1,
		created_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS payment_settings (
		id TEXT PRIMARY KEY,
		shop_id TEXT UNIQUE REFERENCES shops(id),
		provider TEXT DEFAULT 'yookassa',
		online_enabled BOOLEAN DEFAULT false,
		card_enabled BOOLEAN DEFAULT false,
		sbp_enabled BOOLEAN DEFAULT false,
		qr_enabled BOOLEAN DEFAULT false,
		store_payment_enabled BOOLEAN DEFAULT true,
		cash_enabled BOOLEAN DEFAULT true,
		invoice_enabled BOOLEAN DEFAULT false,
		is_test_mode BOOLEAN DEFAULT false,
		shop_id_external TEXT,
		encrypted_secret_key TEXT,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS copilot_requests (
		id TEXT PRIMARY KEY,
		shop_id TEXT REFERENCES shops(id),
		raw_customer_message TEXT,
		generated_reply TEXT,
		style TEXT,
		source_channel TEXT,
		created_lead_id TEXT,
		created_order_id TEXT,
		created_at TIMESTAMP DEFAULT NOW()
	);
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
	ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS cover_url TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS about TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS phone TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS email TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS city TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS contact_method TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS working_hours TEXT;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS show_ai_manager BOOLEAN DEFAULT true;
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS tagline TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_term TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS keyboard_type TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS keyboard_connection TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS popularity_score INT DEFAULT 0;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_avg NUMERIC DEFAULT 0;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
	ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS search_keywords TEXT;
	ALTER TABLE products ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new';
	CREATE TABLE IF NOT EXISTS shop_reviews (
		id TEXT PRIMARY KEY,
		shop_id TEXT REFERENCES shops(id),
		user_id TEXT,
		author_name TEXT NOT NULL,
		rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
		text TEXT,
		created_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS shop_followers (
		shop_id TEXT REFERENCES shops(id),
		user_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT NOW(),
		UNIQUE(shop_id, user_id)
	);
	CREATE TABLE IF NOT EXISTS ai_manager_settings (
		id TEXT PRIMARY KEY,
		shop_id TEXT UNIQUE REFERENCES shops(id),
		enabled BOOLEAN DEFAULT true,
		mode TEXT DEFAULT 'assistive',
		tone TEXT DEFAULT 'professional',
		welcome_message TEXT,
		handoff_message TEXT,
		delivery_policy TEXT,
		warranty_policy TEXT,
		payment_policy TEXT,
		discount_policy TEXT,
		forbidden_topics TEXT,
		auto_create_leads BOOLEAN DEFAULT true,
		auto_suggest_products BOOLEAN DEFAULT true,
		auto_suggest_checkout BOOLEAN DEFAULT true,
		handoff_on_unknown BOOLEAN DEFAULT true,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS ai_manager_dialogs (
		id TEXT PRIMARY KEY,
		shop_id TEXT REFERENCES shops(id),
		client_user_id TEXT,
		product_id TEXT,
		lead_id TEXT,
		status TEXT DEFAULT 'open',
		source TEXT DEFAULT 'shop_page',
		title TEXT,
		last_message TEXT,
		last_actor TEXT,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW(),
		closed_at TIMESTAMP,
		taken_over_by_business BOOLEAN DEFAULT false,
		taken_over_at TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS ai_manager_messages (
		id TEXT PRIMARY KEY,
		dialog_id TEXT REFERENCES ai_manager_dialogs(id) ON DELETE CASCADE,
		shop_id TEXT REFERENCES shops(id),
		client_user_id TEXT,
		sender_role TEXT,
		message TEXT,
		message_type TEXT DEFAULT 'text',
		product_ids TEXT,
		metadata TEXT,
		created_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS ai_manager_events (
		id TEXT PRIMARY KEY,
		dialog_id TEXT REFERENCES ai_manager_dialogs(id) ON DELETE CASCADE,
		shop_id TEXT REFERENCES shops(id),
		event_type TEXT,
		payload TEXT,
		created_at TIMESTAMP DEFAULT NOW()
	);
	ALTER TABLE leads ADD COLUMN IF NOT EXISTS dialog_id TEXT;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_greeting TEXT;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_tone TEXT DEFAULT 'professional';
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_style_prompt TEXT;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_forbidden_claims TEXT;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_preferred_cta TEXT;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_use_shop_contacts BOOLEAN DEFAULT true;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_answer_outside_catalog BOOLEAN DEFAULT true;
	ALTER TABLE ai_manager_settings ADD COLUMN IF NOT EXISTS ai_strict_catalog_grounding BOOLEAN DEFAULT true;
	CREATE TABLE IF NOT EXISTS user_favorites (
		user_id TEXT NOT NULL,
		product_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT NOW(),
		PRIMARY KEY (user_id, product_id)
	);
	ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'approved';
	CREATE TABLE IF NOT EXISTS business_verifications (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		shop_id TEXT,
		org_name TEXT NOT NULL,
		inn TEXT,
		ogrn TEXT,
		legal_address TEXT,
		contact_phone TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		submitted_at TIMESTAMP DEFAULT NOW(),
		reviewed_at TIMESTAMP,
		rejection_reason TEXT
	);
	`
	_, err = pool.Exec(context.Background(), schema)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("schema phase 1: %w", err)
	}

	// Phase 2: indexes, constraints, audit_events
	schema2 := `
	-- ═══ INDEXES ═══
	CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active);
	CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
	CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug);
	CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id);
	CREATE INDEX IF NOT EXISTS idx_shops_verification_status ON shops(verification_status);
	CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
	CREATE INDEX IF NOT EXISTS idx_leads_shop_created ON leads(shop_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_leads_customer_user_created ON leads(customer_user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON user_favorites(user_id);
	CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON user_favorites(product_id);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_product_unique ON user_favorites(user_id, product_id);
	CREATE INDEX IF NOT EXISTS idx_ai_dialogs_shop_updated ON ai_manager_dialogs(shop_id, updated_at DESC);
	CREATE INDEX IF NOT EXISTS idx_ai_dialogs_client_updated ON ai_manager_dialogs(client_user_id, updated_at DESC);
	CREATE INDEX IF NOT EXISTS idx_ai_messages_dialog_created ON ai_manager_messages(dialog_id, created_at ASC);
	CREATE INDEX IF NOT EXISTS idx_business_verifications_user_id ON business_verifications(user_id);
	CREATE INDEX IF NOT EXISTS idx_business_verifications_shop_id ON business_verifications(shop_id);
	CREATE INDEX IF NOT EXISTS idx_business_verifications_status ON business_verifications(status);

	-- ═══ SAFE CONSTRAINTS ═══
	DO $$ BEGIN
		ALTER TABLE shops ADD CONSTRAINT chk_shop_verification_status CHECK (verification_status IN ('none','pending','approved','rejected'));
	EXCEPTION WHEN duplicate_object THEN NULL;
	END $$;
	DO $$ BEGIN
		ALTER TABLE business_verifications ADD CONSTRAINT chk_business_verification_status CHECK (status IN ('pending','approved','rejected'));
	EXCEPTION WHEN duplicate_object THEN NULL;
	END $$;
	DO $$ BEGIN
		ALTER TABLE profiles ADD CONSTRAINT chk_profiles_role CHECK (role IN ('client','business'));
	EXCEPTION WHEN duplicate_object THEN NULL;
	END $$;

	-- ═══ ROLE IMMUTABILITY ═══
	CREATE OR REPLACE FUNCTION block_role_change() RETURNS trigger AS $$
	BEGIN
		IF OLD.role IS DISTINCT FROM NEW.role THEN
			RAISE EXCEPTION 'role cannot be changed once set';
		END IF;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;
	DROP TRIGGER IF EXISTS trg_block_role_change ON profiles;
	CREATE TRIGGER trg_block_role_change BEFORE UPDATE OF role ON profiles FOR EACH ROW EXECUTE FUNCTION block_role_change();

	-- ═══ CASE-INSENSITIVE EMAIL INDEX ═══
	-- Safe preflight: only create index if no case-insensitive duplicates exist.
	-- If duplicates exist, defer index creation and log a warning.
	DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_profiles_email_lower') THEN
			IF EXISTS (SELECT 1 FROM profiles GROUP BY LOWER(BTRIM(email)) HAVING COUNT(*) > 1) THEN
				RAISE WARNING 'idx_profiles_email_lower deferred: case-insensitive email duplicates exist in profiles';
			ELSE
				CREATE UNIQUE INDEX idx_profiles_email_lower ON profiles (LOWER(BTRIM(email)));
			END IF;
		END IF;
	END $$;

	-- ═══ AUDIT EVENTS ═══
	CREATE TABLE IF NOT EXISTS audit_events (
		id TEXT PRIMARY KEY,
		actor_user_id TEXT,
		actor_role TEXT,
		action TEXT NOT NULL,
		entity_type TEXT,
		entity_id TEXT,
		shop_id TEXT,
		ip TEXT,
		user_agent TEXT,
		metadata JSONB,
		created_at TIMESTAMPTZ DEFAULT now()
	);
	CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actor_user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_shop_created ON audit_events(shop_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_action_created ON audit_events(action, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
	`
	_, err = pool.Exec(context.Background(), schema2)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("schema phase 2: %w", err)
	}

	// P5.1B: account security schema
	if err := ensureAccountSecuritySchema(context.Background(), pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("account security schema: %w", err)
	}

	if err := ensureLegalConsentSchema(context.Background(), pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("legal consent schema: %w", err)
	}

	// Auth identities foundation
	if err := ensureAuthIdentitiesSchema(context.Background(), pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("auth identities schema: %w", err)
	}

	// Business onboarding organizations
	if err := ensureOrganizationsSchema(context.Background(), pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("organizations schema: %w", err)
	}

	// Backfill password identities for existing profiles
	if _, err := backfillPasswordAuthIdentities(context.Background(), pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("backfill auth identities: %w", err)
	}

	return pool, nil
}

// ── AUDIT ──

func (a *App) recordAuditEvent(r *http.Request, actorID, actorRole, action, entityType, entityID, shopID string, meta map[string]interface{}) {
	id := newID()
	ip := clientIP(r)
	ua := userAgent(r)
	metaJSON, _ := json.Marshal(meta)
	_, err := a.db.Exec(r.Context(), "INSERT INTO audit_events (id, actor_user_id, actor_role, action, entity_type, entity_id, shop_id, ip, user_agent, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
		id, actorID, actorRole, action, entityType, entityID, shopID, ip, ua, string(metaJSON))
	if err != nil {
		log.Printf("audit insert error: %v", err)
	}
}

// ── AI ──

func (a *App) aiChat(system, user string) string {
	if a.aiProvider == nil {
		return a.aiLocalFallback(system, user)
	}
	fullPrompt := system + "\n\n" + user
	resp, err := a.aiProvider.Generate(context.Background(), AIRequest{
		Scenario:    ScenarioBuyerAssistant,
		UserMessage: fullPrompt,
		MaxTokens:   900,
		Temperature: 0.3,
	})
	if err != nil {
		log.Printf("aiChat via provider err: %v", err)
		return a.aiLocalFallback(system, user)
	}
	if resp.Text == "" {
		return a.aiLocalFallback(system, user)
	}
	return resp.Text
}

// aiLocalFallback — безопасный локальный режим без LLM
// Не выдумывает гарантию, доставку, скидки, наличие или возврат.
func (a *App) aiLocalFallback(system, user string) string {
	lines := strings.Split(system, "\n")
	var productsSection string
	inProducts := false
	for _, l := range lines {
		if strings.Contains(l, "Товары магазина:") {
			inProducts = true
			continue
		}
		if inProducts && strings.HasPrefix(l, "Правила:") {
			break
		}
		if inProducts {
			productsSection += l + "\n"
		}
	}
	if strings.TrimSpace(productsSection) == "" {
		productsSection = "Товары не загружены."
	}

	q := strings.ToLower(strings.TrimSpace(user))

	switch {
	case strings.Contains(q, "привет") || strings.Contains(q, "здравствуй") || strings.Contains(q, "хай"):
		return "Здравствуйте! Я AI-продавец. Чем могу помочь?"

	case strings.Contains(q, "цен") || strings.Contains(q, "скольк") || strings.Contains(q, "стоимость"):
		var sb strings.Builder
		sb.WriteString("Вот цены на товары:\n")
		for _, l := range strings.Split(productsSection, "\n") {
			if strings.TrimSpace(l) != "" {
				sb.WriteString("• " + strings.TrimSpace(l) + "\n")
			}
		}
		sb.WriteString("\nТочную цену и наличие уточняйте у продавца.")
		return sb.String()

	case strings.Contains(q, "сравн") || strings.Contains(q, "разниц") || strings.Contains(q, "отлич"):
		var sb strings.Builder
		sb.WriteString("Сравнение товаров:\n")
		for _, l := range strings.Split(productsSection, "\n") {
			if strings.TrimSpace(l) != "" {
				sb.WriteString(strings.TrimSpace(l) + "\n")
			}
		}
		sb.WriteString("\nПодробнее по каждому — спрашивайте у продавца.")
		return sb.String()

	case strings.Contains(q, "заказ") || strings.Contains(q, "оформ") || strings.Contains(q, "купить"):
		return "Чтобы оформить заказ, нажмите «Оставить заявку» на товаре и заполните форму. Продавец свяжется с вами."

	case strings.Contains(q, "доставк") || strings.Contains(q, "привез") || strings.Contains(q, "курьер"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."

	case strings.Contains(q, "гарант") || strings.Contains(q, "возврат") || strings.Contains(q, "обмен"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."

	case strings.Contains(q, "скидк") || strings.Contains(q, "акци") || strings.Contains(q, "дешевл"):
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."

	case strings.Contains(q, "налич") || strings.Contains(q, "есть в наличии"):
		var sb strings.Builder
		sb.WriteString("Вот товары магазина:\n")
		for _, l := range strings.Split(productsSection, "\n") {
			if strings.TrimSpace(l) != "" {
				sb.WriteString("• " + strings.TrimSpace(l) + "\n")
			}
		}
		sb.WriteString("\nНаличие уточняйте у продавца.")
		return sb.String()

	default:
		if strings.TrimSpace(productsSection) != "" && productsSection != "Товары не загружены." {
			var sb strings.Builder
			sb.WriteString("Вот что есть в магазине:\n")
			for _, l := range strings.Split(productsSection, "\n") {
				if strings.TrimSpace(l) != "" {
					sb.WriteString(strings.TrimSpace(l) + "\n")
				}
			}
			sb.WriteString("\nЕсли у вас есть вопросы по товарам, спрашивайте!")
			return sb.String()
		}
		return "Этой информации нет в карточке товара. Лучше уточнить у продавца."
	}
}

// ═══════════════════════════════════════════════
//  AI GENERATE — генерация описания товара
// ═══════════════════════════════════════════════

func (a *App) handleAIGenerate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductName string `json:"productName"`
		Category    string `json:"category"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.ProductName == "" {
		jsonErr(w, 400, "productName required")
		return
	}

	// Пытаемся использовать AI
	if a.aiKey != "" {
		system := "Ты — ассистент продавца. Улучши название и описание товара. Не выдумывай характеристики, гарантию, доставку, скидки, цену, наличие. Используй только общие улучшения текста. Ответь строго в JSON: {\"name\": \"...\", \"description\": \"...\", \"benefits\": [\"...\", \"...\"]}"
		user := fmt.Sprintf("Товар: %s, Категория: %s", req.ProductName, req.Category)
		resp := a.aiChat(system, user)
		// Пробуем распарсить JSON из ответа
		var gen struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Benefits    []string `json:"benefits"`
		}
		if json.Unmarshal([]byte(resp), &gen) == nil && gen.Name != "" {
			jsonOK(w, gen)
			return
		}
	}

	// Безопасный fallback без выдуманных характеристик
	cat := req.Category
	if cat == "" {
		cat = "данной категории"
	}
	jsonOK(w, map[string]interface{}{
		"name":        req.ProductName,
		"description": fmt.Sprintf("Качественный товар в категории «%s». Подходит для ежедневного использования.", cat),
		"benefits":    []string{"Проверенное качество", "Надёжность"},
	})
}

// ═══════════════════════════════════════════════
//  AI MANAGER 24/7 — deterministic shop manager
// ═══════════════════════════════════════════════

func (a *App) getOrCreateAIManagerSettings(shopID string) (*AIManagerSettings, error) {
	var s AIManagerSettings
	var createdAt, updatedAt time.Time
	err := a.db.QueryRow(a.ctx,
		`SELECT id, shop_id, enabled, mode, tone, COALESCE(welcome_message,''), COALESCE(handoff_message,''), COALESCE(delivery_policy,''), COALESCE(warranty_policy,''), COALESCE(payment_policy,''), COALESCE(discount_policy,''), COALESCE(forbidden_topics,''),
		COALESCE(ai_greeting,''), COALESCE(ai_tone,'professional'), COALESCE(ai_style_prompt,''), COALESCE(ai_forbidden_claims,''), COALESCE(ai_preferred_cta,''),
		COALESCE(ai_use_shop_contacts,true), COALESCE(ai_answer_outside_catalog,true), COALESCE(ai_strict_catalog_grounding,true),
		auto_create_leads, auto_suggest_products, auto_suggest_checkout, handoff_on_unknown, created_at, updated_at FROM ai_manager_settings WHERE shop_id=$1`,
		shopID).Scan(&s.ID, &s.ShopID, &s.Enabled, &s.Mode, &s.Tone, &s.WelcomeMessage, &s.HandoffMessage, &s.DeliveryPolicy, &s.WarrantyPolicy, &s.PaymentPolicy, &s.DiscountPolicy, &s.ForbiddenTopics,
		&s.AiGreeting, &s.AiTone, &s.AiStylePrompt, &s.AiForbiddenClaims, &s.AiPreferredCTA,
		&s.AiUseShopContacts, &s.AiAnswerOutsideCatalog, &s.AiStrictCatalogGrounding,
		&s.AutoCreateLeads, &s.AutoSuggestProducts, &s.AutoSuggestCheckout, &s.HandoffOnUnknown, &createdAt, &updatedAt)
	if err == nil {
		s.CreatedAt = createdAt.Format(time.RFC3339)
		s.UpdatedAt = updatedAt.Format(time.RFC3339)
		return &s, nil
	}
	s.ID = newID()
	s.ShopID = shopID
	s.Enabled = true
	s.Mode = "assistive"
	s.Tone = "professional"
	s.AiTone = "professional"
	s.AiUseShopContacts = true
	s.AiAnswerOutsideCatalog = true
	s.AiStrictCatalogGrounding = true
	s.AutoCreateLeads = true
	s.AutoSuggestProducts = true
	s.AutoSuggestCheckout = true
	s.HandoffOnUnknown = true
	_, err = a.db.Exec(a.ctx,
		`INSERT INTO ai_manager_settings (id, shop_id, enabled, mode, tone, welcome_message, handoff_message, delivery_policy, warranty_policy, payment_policy, discount_policy, forbidden_topics,
		ai_greeting, ai_tone, ai_style_prompt, ai_forbidden_claims, ai_preferred_cta, ai_use_shop_contacts, ai_answer_outside_catalog, ai_strict_catalog_grounding,
		auto_create_leads, auto_suggest_products, auto_suggest_checkout, handoff_on_unknown) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
		s.ID, s.ShopID, s.Enabled, s.Mode, s.Tone, s.WelcomeMessage, s.HandoffMessage, s.DeliveryPolicy, s.WarrantyPolicy, s.PaymentPolicy, s.DiscountPolicy, s.ForbiddenTopics,
		s.AiGreeting, s.AiTone, s.AiStylePrompt, s.AiForbiddenClaims, s.AiPreferredCTA, s.AiUseShopContacts, s.AiAnswerOutsideCatalog, s.AiStrictCatalogGrounding,
		s.AutoCreateLeads, s.AutoSuggestProducts, s.AutoSuggestCheckout, s.HandoffOnUnknown)
	if err != nil {
		return nil, err
	}
	s.CreatedAt = time.Now().Format(time.RFC3339)
	s.UpdatedAt = time.Now().Format(time.RFC3339)
	return &s, nil
}

func (a *App) detectAIManagerIntent(msg string) string {
	m := strings.ToLower(msg)
	if containsAny(m, "создать заявку", "создай заявку", "свяжитесь", "свяжись", "передай продавц", "передайте продавц", "передать продавц", "передать продавцу", "хочу купить", "оформить заказ", "хочу заказать", "можно заказать") {
		return "lead_request"
	}
	if containsAny(m, "живой продавец", "человек", "оператор", "менеджер", "переключить", "связаться с продавц", "связаться с продавцом", "соединить с продавц") {
		return "handoff_request"
	}
	if containsAny(m, "сравн", "чем отличает", "что лучше", "какой лучше", "посовету") {
		return "compare_shop_products"
	}
	if containsAny(m, "подобр", "подбери", "покажи", "посоветуй", "ищу", "нужен", "нужна", "нужны") {
		return "product_search"
	}
	if containsAny(m, "доставк", "привез", "курьер", "отправ", "пришлите") {
		return "delivery_question"
	}
	if containsAny(m, "гарант", "возврат", "обмен") {
		return "warranty_question"
	}
	if containsAny(m, "оплат", "платеж", "счет", "счёт", "наличн", "картой", "карта") {
		return "payment_question"
	}
	if containsAny(m, "скидк", "дешевл", "акци", "скиньте", "торг", "уступ") {
		return "discount_question"
	}
	if containsAny(m, "налич", "есть ли", "в наличии", "найдётся") {
		return "availability_question"
	}
	if containsAny(m, "цен", "стоимост", "сколько стоит", "почём") {
		return "price_question"
	}
	if containsAny(m, "как заказать", "как оформить", "оформлени", "заказ", "купить") {
		return "checkout_help"
	}
	if containsAny(m, "привет", "здравствуй", "хай", "добрый день", "добрый вечер") {
		return "greeting"
	}
	return "unknown"
}

func (a *App) searchAIManagerProducts(shopID, query string, limit int) []map[string]interface{} {
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	intent := parseSmartIntent(query)
	args := []interface{}{shopID}
	idx := 2
	where := []string{"p.is_active=true", "s.is_published=true", "p.shop_id=$1", "COALESCE(array_length(p.images, 1), 0) > 0"}

	if intent.Category != "" {
		where = append(where, fmt.Sprintf("p.category=$%d", idx))
		args = append(args, intent.Category)
		idx++
	}
	if intent.MaxPrice != nil {
		where = append(where, fmt.Sprintf("p.price <= $%d", idx))
		args = append(args, *intent.MaxPrice)
		idx++
	}
	if intent.MinPrice != nil {
		where = append(where, fmt.Sprintf("p.price >= $%d", idx))
		args = append(args, *intent.MinPrice)
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

	q := fmt.Sprintf("SELECT p.id, p.shop_id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, p.images, p.is_active, COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.condition,'new'), COALESCE(p.delivery_term,''), p.popularity_score, COALESCE(p.rating_avg,0), COALESCE(p.created_at::text,''), COALESCE(p.product_type,''), COALESCE(p.search_keywords,''), s.name AS shop_name, s.slug AS shop_slug FROM products p JOIN shops s ON p.shop_id=s.id WHERE %s ORDER BY %s LIMIT %d", strings.Join(where, " AND "), orderBy, limit*2)
	rows, err := a.db.Query(a.ctx, q, args...)
	if err != nil {
		log.Printf("aiManager search error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []map[string]interface{}
	shopSet := map[string]string{}
	for rows.Next() {
		var p ExProduct
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.Condition, &p.DeliveryTerm, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.ProductType, &p.SearchKeywords, &p.ShopName, &p.ShopSlug)
		if !p.IsActive {
			continue
		}
		if len(normalizeImages(p.Images)) == 0 {
			continue
		}
		score, explanation := scoreSmartProduct(p.Name, p.Description, p.Benefits, p.Category, p.Price, intent)
		if score > 0 || intent.MaxPrice != nil || intent.MinPrice != nil {
			result = append(result, map[string]interface{}{
				"id": p.ID, "name": p.Name, "price": p.Price, "oldPrice": p.OldPrice,
				"category": p.Category, "images": normalizeImages(p.Images), "brand": p.Brand,
				"condition": p.Condition, "deliveryTerm": p.DeliveryTerm, "shopName": p.ShopName,
				"shopSlug": p.ShopSlug, "score": score, "reason": explanation,
			})
			shopSet[p.ShopSlug] = p.ShopName
		}
	}
	if len(result) == 0 {
		rows2, err := a.db.Query(a.ctx,
			"SELECT p.id, p.shop_id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, p.images, p.is_active, COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.condition,'new'), COALESCE(p.delivery_term,''), p.popularity_score, COALESCE(p.rating_avg,0), COALESCE(p.created_at::text,''), COALESCE(p.product_type,''), COALESCE(p.search_keywords,''), s.name AS shop_name, s.slug AS shop_slug FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.shop_id=$1 AND p.is_active=true AND s.is_published=true AND COALESCE(array_length(p.images, 1), 0) > 0 ORDER BY p.popularity_score DESC, p.price ASC LIMIT $2",
			shopID, limit)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				var p ExProduct
				rows2.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.Condition, &p.DeliveryTerm, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.ProductType, &p.SearchKeywords, &p.ShopName, &p.ShopSlug)
				if !p.IsActive {
					continue
				}
				if len(normalizeImages(p.Images)) == 0 {
					continue
				}
				result = append(result, map[string]interface{}{
					"id": p.ID, "name": p.Name, "price": p.Price, "oldPrice": p.OldPrice,
					"category": p.Category, "images": normalizeImages(p.Images), "brand": p.Brand,
					"condition": p.Condition, "deliveryTerm": p.DeliveryTerm, "shopName": p.ShopName,
					"shopSlug": p.ShopSlug, "score": 1, "reason": "Вариант из каталога магазина",
				})
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		si, _ := result[i]["score"].(int)
		sj, _ := result[j]["score"].(int)
		return si > sj
	})
	if len(result) > limit {
		result = result[:limit]
	}
	return result
}

func buildAIManagerReply(settings *AIManagerSettings, shop *Shop, product *ExProduct, msg string, intent string, suggested []map[string]interface{}) (string, []map[string]interface{}, bool, bool) {
	reply := ""
	products := suggested
	leadCreated := false
	handoff := false

	if !settings.Enabled || settings.Mode == "off" {
		return settings.HandoffMessage, nil, false, true
	}

	switch intent {
	case "greeting":
		if settings.WelcomeMessage != "" {
			reply = settings.WelcomeMessage
		} else {
			reply = fmt.Sprintf("Здравствуйте! Я AI-менеджер магазина «%s». Помогу подобрать товар, отвечу по ценам и условиям, а при необходимости передам вопрос продавцу.", shop.Name)
		}
	case "lead_request":
		reply = "Хорошо, я создам заявку продавцу. Он свяжется с вами в ближайшее время."
		leadCreated = true
	case "handoff_request":
		reply = settings.HandoffMessage
		if reply == "" {
			reply = "Понял, передаю ваш вопрос продавцу. Он ответит вам лично."
		}
		handoff = true
	case "product_search":
		if len(products) > 0 {
			reply = fmt.Sprintf("Вот что подошло в магазине «%s»:", shop.Name)
		} else {
			reply = fmt.Sprintf("В магазине «%s» по вашему запросу ничего не нашлось. Уточните запрос или попросите подобрать что-то другое.", shop.Name)
		}
	case "compare_shop_products":
		if len(products) >= 2 {
			reply = fmt.Sprintf("Сравнил %d товара из магазина «%s». Лучший выбор зависит от ваших приоритетов — смотрите варианты ниже.", len(products), shop.Name)
		} else if len(products) == 1 {
			reply = fmt.Sprintf("В магазине «%s» под ваш запрос подходит один товар. Вот он:", shop.Name)
		} else {
			reply = fmt.Sprintf("В магазине «%s» по вашему запросу ничего не нашлось. Уточните запрос.", shop.Name)
		}
	case "price_question":
		if product != nil {
			reply = fmt.Sprintf("Цена «%s» — %d ₽. Точная стоимость подтверждается при оформлении.", product.Name, product.Price)
		} else if len(products) > 0 {
			reply = fmt.Sprintf("Вот цены на подходящие товары в магазине «%s»:", shop.Name)
		} else {
			reply = "Уточните, какой товар вас интересует, и я назову цену."
		}
	case "delivery_question":
		if settings.DeliveryPolicy != "" {
			reply = settings.DeliveryPolicy
		} else {
			reply = "Условия доставки в настройках магазина не указаны. Лучше уточнить у продавца."
		}
	case "warranty_question":
		if settings.WarrantyPolicy != "" {
			reply = settings.WarrantyPolicy
		} else {
			reply = "Гарантия в настройках магазина не указана. Лучше уточнить у продавца."
		}
	case "payment_question":
		if settings.PaymentPolicy != "" {
			reply = settings.PaymentPolicy
		} else {
			reply = "Способы оплаты в настройках магазина не указаны. Сейчас оформление идёт через заявку продавцу."
		}
	case "discount_question":
		if settings.DiscountPolicy != "" {
			reply = settings.DiscountPolicy
		} else {
			reply = "Скидки в настройках магазина не указаны. Я могу передать вопрос продавцу."
		}
	case "availability_question":
		if product != nil {
			reply = fmt.Sprintf("Товар «%s» опубликован в каталоге. Актуальное наличие лучше уточнить у продавца — я не имею доступа к складу.", product.Name)
		} else {
			reply = "Актуальное наличие лучше уточнить у продавца. Я могу создать заявку, чтобы он связался с вами."
		}
	case "checkout_help":
		reply = "Чтобы оформить заказ, добавьте товар в корзину, перейдите к оформлению, выберите офлайн-способ оплаты (в магазине, наличными или счёт) и создайте заказ. Онлайн-оплата в данный момент не подключена."
	case "product_question":
		if product != nil {
			reply = fmt.Sprintf("По товару «%s» (%d ₽): %s", product.Name, product.Price, truncate(product.Description, 180))
			if len(product.Benefits) > 0 {
				reply += "\nПреимущества: " + strings.Join(product.Benefits, ", ")
			}
			if product.Brand != "" {
				reply += "\nБренд: " + product.Brand
			}
			if product.Color != "" {
				reply += "\nЦвет: " + product.Color
			}
			if product.Condition != "" {
				reply += "\nСостояние: " + conditionLabel(product.Condition)
			}
		} else {
			reply = "Уточните, о каком товаре идёт речь."
		}
	case "unknown":
		if settings.HandoffOnUnknown {
			reply = settings.HandoffMessage
			if reply == "" {
				reply = "Я не уверен, что имею в виду. Передаю вопрос продавцу, он ответит лично."
			}
			handoff = true
		} else {
			reply = fmt.Sprintf("Я не совсем понял вопрос. Могу помочь с подбором товара, ценами и условиями магазина «%s». Уточните, пожалуйста, что именно вас интересует.", shop.Name)
		}
	default:
		reply = fmt.Sprintf("Спасибо за обращение! Чем могу помочь по магазину «%s»?", shop.Name)
	}

	if settings.AutoSuggestProducts && len(products) > 0 && intent != "handoff_request" && intent != "lead_request" {
		// products already included
	} else if intent != "product_search" && intent != "compare_shop_products" && intent != "price_question" && intent != "product_question" {
		products = nil
	}

	return reply, products, leadCreated, handoff
}

func conditionLabel(c string) string {
	if c == "new" {
		return "новое"
	}
	if c == "used" {
		return "б/у"
	}
	return c
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// insertAIManagerMessage saves a message and returns its id
func (a *App) insertAIManagerMessage(dialogID, shopID, clientUserID, senderRole, message, msgType string, productIDs []string, metadata map[string]interface{}) (string, error) {
	id := newID()
	pids := ""
	if len(productIDs) > 0 {
		pids = strings.Join(productIDs, ",")
	}
	meta := ""
	if metadata != nil {
		b, _ := json.Marshal(metadata)
		meta = string(b)
	}
	var cid interface{} = nil
	if clientUserID != "" {
		cid = clientUserID
	}
	_, err := a.db.Exec(a.ctx,
		"INSERT INTO ai_manager_messages (id, dialog_id, shop_id, client_user_id, sender_role, message, message_type, product_ids, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
		id, dialogID, shopID, cid, senderRole, message, msgType, pids, meta)
	return id, err
}

func (a *App) insertAIManagerEvent(dialogID, shopID, eventType string, payload map[string]interface{}) {
	p := ""
	if payload != nil {
		b, _ := json.Marshal(payload)
		p = string(b)
	}
	a.db.Exec(a.ctx, "INSERT INTO ai_manager_events (id, dialog_id, shop_id, event_type, payload) VALUES ($1,$2,$3,$4,$5)", newID(), dialogID, shopID, eventType, p)
}

func (a *App) loadAIManagerDialogMessages(dialogID string) ([]AIManagerMessage, error) {
	rows, err := a.db.Query(a.ctx,
		"SELECT id, dialog_id, shop_id, client_user_id, sender_role, message, message_type, COALESCE(product_ids,''), COALESCE(metadata,''), created_at FROM ai_manager_messages WHERE dialog_id=$1 ORDER BY created_at ASC",
		dialogID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var msgs []AIManagerMessage
	for rows.Next() {
		var m AIManagerMessage
		var createdAt time.Time
		var cid sql.NullString
		var pids, meta string
		rows.Scan(&m.ID, &m.DialogID, &m.ShopID, &cid, &m.SenderRole, &m.Message, &m.MessageType, &pids, &meta, &createdAt)
		if cid.Valid {
			m.ClientUserID = &cid.String
		}
		if pids != "" {
			m.ProductIDs = strings.Split(pids, ",")
		}
		if meta != "" {
			json.Unmarshal([]byte(meta), &m.Metadata)
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		msgs = append(msgs, m)
	}
	return msgs, nil
}

func (a *App) createLeadFromDialog(shopID, productID, clientUserID, dialogID, message string) (string, error) {
	leadID := newID()
	var productName string
	if productID != "" {
		a.db.QueryRow(a.ctx, "SELECT name FROM products WHERE id=$1", productID).Scan(&productName)
	}
	var shopName string
	a.db.QueryRow(a.ctx, "SELECT name FROM shops WHERE id=$1", shopID).Scan(&shopName)
	clientName := "Клиент"
	if clientUserID != "" {
		var dn string
		a.db.QueryRow(a.ctx, "SELECT COALESCE(display_name, email, '') FROM profiles WHERE id=$1", clientUserID).Scan(&dn)
		if dn != "" {
			clientName = dn
		}
	}
	var cid interface{} = nil
	if clientUserID != "" {
		cid = clientUserID
	}
	_, err := a.db.Exec(a.ctx,
		"INSERT INTO leads (id, shop_id, product_id, name, phone, email, message, product_name, ai_reply, source, customer_user_id, status, dialog_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12)",
		leadID, shopID, productID, clientName, "", "", message, productName, "Заявка создана AI-менеджером", "ai_manager", cid, dialogID)
	return leadID, err
}

// ═══════════════════════════════════════════════
//  SEPARATE HANDLERS — каждый роут = свой handler
// ═══════════════════════════════════════════════

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	var products, shops int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM products WHERE is_active=true").Scan(&products)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shops WHERE is_published=true").Scan(&shops)
	aiEnabled := false
	if gp, ok := a.aiProvider.(*GroqProvider); ok {
		aiEnabled = gp.cfg.Enabled()
	}
	jsonOK(w, map[string]interface{}{"status": "ok", "products": products, "shops": shops, "ai": aiEnabled})
}

func (a *App) handleShops(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("mine") == "1" {
		claims, err := a.auth(r)
		if err != nil {
			jsonErr(w, 401, "unauthorized")
			return
		}
		rows, _ := a.db.Query(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE owner_id=$1 ORDER BY name", claims.Sub)
		defer rows.Close()
		var shops []Shop
		for rows.Next() {
			var s Shop
			rows.Scan(&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.About, &s.Category, &s.IsPublished, &s.LogoURL, &s.CoverURL, &s.Color, &s.AITone, &s.CustomDomain, &s.Phone, &s.Email, &s.City, &s.ContactMethod, &s.WorkingHours, &s.ShowAiManager, &s.Tagline, &s.CreatedAt, &s.VerificationStatus)
			shops = append(shops, s)
		}
		jsonOK(w, map[string]interface{}{"shops": shops})
		return
	}
	rows, _ := a.db.Query(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE is_published=true AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = shops.id AND p.is_active = true AND COALESCE(array_length(p.images, 1), 0) > 0) ORDER BY name")
	defer rows.Close()
	var shopsPub []Shop
	for rows.Next() {
		var s Shop
		rows.Scan(&s.ID, &s.OwnerID, &s.Slug, &s.Name, &s.Description, &s.About, &s.Category, &s.IsPublished, &s.LogoURL, &s.CoverURL, &s.Color, &s.AITone, &s.CustomDomain, &s.Phone, &s.Email, &s.City, &s.ContactMethod, &s.WorkingHours, &s.ShowAiManager, &s.Tagline, &s.CreatedAt, &s.VerificationStatus)
		shopsPub = append(shopsPub, s)
	}
	jsonOK(w, map[string]interface{}{"shops": shopsPub})
}

func (a *App) handleShopBySlug(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		jsonErr(w, 400, "slug is empty")
		return
	}

	var shop Shop
	err := a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE slug=$1", slug).Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil {
		log.Printf("shop not found by slug %q: %v", slug, err)
		jsonErr(w, 404, "shop not found")
		return
	}
	rows, _ := a.db.Query(a.ctx, "SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active, COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''), COALESCE(keyboard_type,''), COALESCE(keyboard_connection,''), COALESCE(condition,'new'), popularity_score, COALESCE(rating_avg,0), COALESCE(created_at::text,''), COALESCE(product_type,''), COALESCE(search_keywords,'') FROM products WHERE shop_id=$1 AND is_active=true AND COALESCE(array_length(images, 1), 0) > 0", shop.ID)
	defer rows.Close()
	var products []ExProduct
	for rows.Next() {
		var p ExProduct
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.ProductType, &p.SearchKeywords)
		products = append(products, p)
	}

	// ── Extended stats ──
	var ordersCount, reviewsCount, ratingSum, followersCount int
	var isFollowing bool

	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1 AND order_status!='cancelled'", shop.ID).Scan(&ordersCount)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*), COALESCE(SUM(rating),0) FROM shop_reviews WHERE shop_id=$1", shop.ID).Scan(&reviewsCount, &ratingSum)

	// Joined year
	joinedYear := ""
	if shop.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, shop.CreatedAt); err == nil {
			joinedYear = fmt.Sprintf("%d", t.Year())
		} else if t2, err := time.Parse("2006-01-02T15:04:05Z", shop.CreatedAt); err == nil {
			joinedYear = fmt.Sprintf("%d", t2.Year())
		} else if len(shop.CreatedAt) >= 4 {
			joinedYear = shop.CreatedAt[:4]
		}
	}

	// Rating
	ratingAvg := 0.0
	if reviewsCount > 0 {
		ratingAvg = float64(ratingSum) / float64(reviewsCount)
	}

	// Trust status
	var trustStatus string
	if ordersCount > 0 {
		trustStatus = "reliable"
	} else {
		trustStatus = "new"
	}

	// Followers
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shop_followers WHERE shop_id=$1", shop.ID).Scan(&followersCount)

	// Check if current user is following
	claims, _ := a.auth(r)
	if claims != nil {
		var count int
		a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shop_followers WHERE shop_id=$1 AND user_id=$2", shop.ID, claims.Sub).Scan(&count)
		isFollowing = count > 0
	}

	jsonOK(w, map[string]interface{}{
		"shop":           shop,
		"products":       products,
		"ordersCount":    ordersCount,
		"ratingAvg":      ratingAvg,
		"reviewsCount":   reviewsCount,
		"followersCount": followersCount,
		"isFollowing":    isFollowing,
		"joinedYear":     joinedYear,
		"trustStatus":    trustStatus,
	})
}

// handleShopByDomain — поиск магазина по кастомному домену из Host header или query param
func (a *App) handleShopByDomain(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" {
		host = r.Host
	}
	// Убираем порт если есть
	if i := strings.Index(host, ":"); i >= 0 {
		host = host[:i]
	}

	var shop Shop
	err := a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE custom_domain=$1", host).Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	rows, _ := a.db.Query(a.ctx, "SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active, COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''), COALESCE(keyboard_type,''), COALESCE(keyboard_connection,''), COALESCE(condition,'new'), popularity_score, COALESCE(rating_avg,0), COALESCE(created_at::text,'') FROM products WHERE shop_id=$1 AND is_active=true", shop.ID)
	defer rows.Close()
	var products []ExProduct
	for rows.Next() {
		var p ExProduct
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt)
		products = append(products, p)
	}

	jsonOK(w, map[string]interface{}{"shop": shop, "products": products})
}

func (a *App) handleShopChat(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var req struct {
		Message string `json:"message"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Загружаем магазин
	var shop Shop
	err := a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE slug=$1", slug).Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	// Загружаем товары магазина
	rows, _ := a.db.Query(a.ctx, "SELECT id, name, description, benefits, price, old_price, category FROM products WHERE shop_id=$1 AND is_active=true ORDER BY price DESC", shop.ID)
	defer rows.Close()
	var products []Product
	for rows.Next() {
		var p Product
		rows.Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category)
		products = append(products, p)
	}

	// Формируем системный промпт
	tone := "дружелюбный"
	if shop.AITone != nil && *shop.AITone != "" {
		tone = *shop.AITone
	}

	productsList := "Товаров пока нет."
	if len(products) > 0 {
		var sb strings.Builder
		for _, p := range products {
			sb.WriteString(fmt.Sprintf("- %s: %d ₽", p.Name, p.Price))
			if p.Description != "" {
				sb.WriteString(fmt.Sprintf(" — %s", p.Description))
			}
			if p.OldPrice != nil && *p.OldPrice > 0 {
				sb.WriteString(fmt.Sprintf(" (старая цена: %d ₽)", *p.OldPrice))
			}
			if len(p.Benefits) > 0 {
				sb.WriteString(fmt.Sprintf("\n  Преимущества: %s", strings.Join(p.Benefits, ", ")))
			}
			sb.WriteString("\n")
		}
		productsList = sb.String()
	}

	shopDesc := ""
	if shop.Description != "" {
		shopDesc = fmt.Sprintf("Описание магазина: %s\n", shop.Description)
	}
	shopCategory := ""
	if shop.Category != "" {
		shopCategory = fmt.Sprintf("Категория: %s\n", shop.Category)
	}
	shopLogo := ""
	if shop.LogoURL != nil && *shop.LogoURL != "" {
		shopLogo = fmt.Sprintf("Логотип: %s\n", *shop.LogoURL)
	}
	shopColor := ""
	if shop.Color != nil && *shop.Color != "" {
		shopColor = fmt.Sprintf("Брендовый цвет: %s\n", *shop.Color)
	}
	shopDomain := ""
	if shop.CustomDomain != nil && *shop.CustomDomain != "" {
		shopDomain = fmt.Sprintf("Кастомный домен: %s\n", *shop.CustomDomain)
	}

	system := fmt.Sprintf(`Ты — AI-продавец магазина "%s". Отвечай на русском языке. Тон общения: %s.

О магазине:
%s%s%s%s%s

Товары магазина:
%s

Правила:
- Отвечай только на основе информации о товарах магазина выше
- Если спрашивают про товар которого нет — предложи похожий из списка
- Если спрашивают про цену — называй точную цену из списка
- Если спрашивают про доставку, гарантию, возврат, скидки или наличие — НЕ выдумывай. Если данных нет, скажи: "Этой информации нет в карточке товара. Лучше уточнить у продавца."
- Если спрашивают как заказать — скажи что можно оставить заявку на сайте или написать в чат
- Не выдумывай бесплатную доставку, гарантию, акции или скидки, если их нет в описании товара
- Будь полезным и дружелюбным, не выдумывай товаров которых нет
- Короткие ответы 2-3 предложения`, shop.Name, tone, shopDesc, shopCategory, shopLogo, shopColor, shopDomain, productsList)

	resp := a.aiChat(system, req.Message)
	jsonOK(w, map[string]interface{}{"response": resp})
}

func (a *App) handleAIManagerChat(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "AI-менеджер доступен после входа")
		return
	}
	if claims.Role == "business" {
		jsonErr(w, 403, "AI-менеджер покупателя недоступен для аккаунта продавца")
		return
	}

	var req struct {
		ShopSlug  string `json:"shopSlug"`
		ProductID string `json:"productId"`
		DialogID  string `json:"dialogId"`
		Message   string `json:"message"`
		Source    string `json:"source"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Message = strings.TrimSpace(req.Message)
	if len(req.Message) > 500 {
		req.Message = req.Message[:500]
	}
	if req.Message == "" {
		jsonErr(w, 400, "Введите сообщение")
		return
	}
	if req.ShopSlug == "" {
		jsonErr(w, 400, "shopSlug required")
		return
	}

	// Load shop
	var shop Shop
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE slug=$1", req.ShopSlug).
		Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil || !shop.IsPublished {
		jsonErr(w, 404, "shop not found")
		return
	}
	if !shop.ShowAiManager {
		jsonErr(w, 403, "AI manager disabled for this shop")
		return
	}

	// Validate product belongs to shop
	var product *ExProduct
	if req.ProductID != "" {
		var p ExProduct
		err = a.db.QueryRow(a.ctx,
			"SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active, COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''), COALESCE(condition,'new'), COALESCE(product_type,''), COALESCE(search_keywords,'') FROM products WHERE id=$1 AND shop_id=$2 AND is_active=true",
			req.ProductID, shop.ID).Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.Condition, &p.ProductType, &p.SearchKeywords)
		if err == nil && len(normalizeImages(p.Images)) > 0 {
			product = &p
		} else {
			req.ProductID = ""
		}
	}

	// Settings
	settings, _ := a.getOrCreateAIManagerSettings(shop.ID)
	if settings == nil {
		settings = defaultAIManagerSettings(shop.ID)
	}

	// Get or create dialog
	dialogID := req.DialogID
	if dialogID == "" {
		dialogID = newID()
		source := req.Source
		if source == "" {
			source = "shop_page"
		}
		if product != nil {
			source = "product_page"
		}
		title := "Диалог с AI-менеджером"
		if product != nil {
			title = product.Name
		}
		var cid interface{} = nil
		if claims != nil {
			cid = claims.Sub
		}
		a.db.Exec(a.ctx,
			"INSERT INTO ai_manager_dialogs (id, shop_id, client_user_id, product_id, status, source, title, last_message, last_actor) VALUES ($1,$2,$3,$4,'open',$5,$6,$7,'client')",
			dialogID, shop.ID, cid, req.ProductID, source, title, req.Message)
		a.insertAIManagerEvent(dialogID, shop.ID, "dialog_created", map[string]interface{}{"source": source})
	} else {
		// Verify ownership
		var dialogClientID string
		var dialogShopID string
		err = a.db.QueryRow(a.ctx, "SELECT COALESCE(client_user_id,''), shop_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&dialogClientID, &dialogShopID)
		if err != nil {
			jsonErr(w, 404, "dialog not found")
			return
		}
		if dialogShopID != shop.ID {
			jsonErr(w, 403, "dialog does not belong to this shop")
			return
		}
		if dialogClientID != "" && (claims == nil || dialogClientID != claims.Sub) {
			jsonErr(w, 403, "not your dialog")
			return
		}
	}

	// Save client message
	clientID := ""
	if claims != nil {
		clientID = claims.Sub
	}
	a.insertAIManagerMessage(dialogID, shop.ID, clientID, "client", req.Message, "text", nil, map[string]interface{}{"source": req.Source})
	a.updateAIDialogLastMessage(dialogID, req.Message, "client")

	// Check if taken over
	var takenOver bool
	a.db.QueryRow(a.ctx, "SELECT taken_over_by_business FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&takenOver)
	if takenOver {
		a.insertAIManagerEvent(dialogID, shop.ID, "ai_answered", map[string]interface{}{"skipped": true, "reason": "taken_over"})
		jsonOK(w, map[string]interface{}{
			"dialogId": dialogID, "message": "Диалог передан продавцу. Он ответит вам лично.",
			"status": "taken_over", "products": []interface{}{}, "actions": []interface{}{"handoff"},
			"lead": nil, "handoff": true,
		})
		return
	}

	// If disabled/off mode
	if !settings.Enabled || settings.Mode == "off" {
		reply := settings.HandoffMessage
		if reply == "" {
			reply = "AI-менеджер магазина сейчас отключён. Вы можете отправить заявку продавцу."
		}
		a.insertAIManagerMessage(dialogID, shop.ID, clientID, "ai_manager", reply, "handoff", nil, map[string]interface{}{"intent": "disabled"})
		a.updateAIDialogLastMessage(dialogID, reply, "ai_manager")
		a.insertAIManagerEvent(dialogID, shop.ID, "handoff_requested", map[string]interface{}{"reason": "disabled"})
		jsonOK(w, map[string]interface{}{
			"dialogId": dialogID, "message": reply, "status": "open", "products": []interface{}{},
			"actions": []interface{}{"handoff"}, "lead": nil, "handoff": true,
		})
		return
	}

	// Build response
	intent := a.detectAIManagerIntent(req.Message)
	if intent == "product_question" && product != nil {
		// specific product context
	}
	searchQuery := req.Message
	if product != nil && intent == "product_question" {
		searchQuery = product.Category + " " + product.Brand
	}
	suggested := []map[string]interface{}{}
	if settings.AutoSuggestProducts {
		suggested = a.searchAIManagerProducts(shop.ID, searchQuery, 5)
	}

	// AI gateway path
	var reply string
	var products []map[string]interface{}
	var leadCreated, handoff bool
	if a.aiProvider != nil {
		aiReq, _ := a.buildAIManagerAIRequest(req.Message, &shop, product, settings, intent, suggested)
		if aiResp, ok := a.callAIProvider(w, r, aiReq); ok && aiResp.Text != "" {
			reply = aiResp.Text
			for _, sp := range suggested {
				products = append(products, sp)
			}
			if intent == "lead_request" || intent == "handoff_request" {
				handoff = true
				if intent == "lead_request" {
					leadCreated = true
				}
			}
		}
	}
	if reply == "" {
		reply, products, leadCreated, handoff = buildAIManagerReply(settings, &shop, product, req.Message, intent, suggested)
	}

	var leadID string
	if leadCreated || (handoff && settings.AutoCreateLeads && intent == "handoff_request") {
		// Check existing lead
		var existingLead string
		a.db.QueryRow(a.ctx, "SELECT lead_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&existingLead)
		if existingLead == "" {
			var pid string
			if product != nil {
				pid = product.ID
			}
			leadID, _ = a.createLeadFromDialog(shop.ID, pid, clientID, dialogID, req.Message)
			a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET lead_id=$1 WHERE id=$2", leadID, dialogID)
			a.insertAIManagerMessage(dialogID, shop.ID, clientID, "system", "Заявка создана и передана продавцу.", "lead_created", nil, map[string]interface{}{"leadId": leadID})
			a.insertAIManagerEvent(dialogID, shop.ID, "lead_created", map[string]interface{}{"leadId": leadID})
		}
	}

	// Save AI message
	var productIDs []string
	for _, p := range products {
		productIDs = append(productIDs, p["id"].(string))
	}
	msgType := "text"
	if leadID != "" {
		msgType = "lead_created"
	}
	if handoff {
		msgType = "handoff"
	}
	if len(products) > 0 {
		msgType = "product_suggestions"
	}
	a.insertAIManagerMessage(dialogID, shop.ID, clientID, "ai_manager", reply, msgType, productIDs, map[string]interface{}{"intent": intent, "leadId": leadID, "handoff": handoff})
	a.updateAIDialogLastMessage(dialogID, reply, "ai_manager")
	a.insertAIManagerEvent(dialogID, shop.ID, "ai_answered", map[string]interface{}{"intent": intent, "leadCreated": leadID != "", "handoff": handoff})

	status := "open"
	if handoff {
		status = "waiting_seller"
	}
	if leadID != "" {
		status = "lead_created"
	}
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET status=$1 WHERE id=$2", status, dialogID)

	actions := []string{}
	if len(products) > 0 {
		actions = append(actions, "product_suggestions")
	}
	if leadID != "" {
		actions = append(actions, "lead_created")
	}
	if handoff {
		actions = append(actions, "handoff")
	}
	if settings.AutoSuggestCheckout && intent != "checkout_help" {
		actions = append(actions, "checkout_help")
	}

	jsonOK(w, map[string]interface{}{
		"dialogId": dialogID,
		"message":  reply,
		"status":   status,
		"products": products,
		"actions":  actions,
		"lead":     map[string]interface{}{"id": leadID, "created": leadID != ""},
		"handoff":  handoff,
	})
}

func (a *App) buildAIManagerAIRequest(userMsg string, shop *Shop, product *ExProduct, settings *AIManagerSettings, intent string, suggested []map[string]interface{}) (AIRequest, []AIHistoryMessage) {
	ctx := a.ctx
	catalog := []AIProductContext{}
	if product != nil {
		related, _ := a.fetchRelatedProductsForAI(ctx, shop.ID, product.ID, product.Category, 6)
		catalog = append(catalog, related...)
	} else {
		shopProducts, _ := a.fetchShopProductsForAI(ctx, shop.ID, 8)
		catalog = append(catalog, shopProducts...)
	}
	// Merge suggested products if not already present
	seen := map[string]bool{}
	for i := range catalog {
		seen[catalog[i].ID] = true
	}
	for _, sp := range suggested {
		id, _ := sp["id"].(string)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		price, _ := strconv.Atoi(fmt.Sprintf("%v", sp["price"]))
		catalog = append(catalog, AIProductContext{
			ID:         id,
			Name:       fmt.Sprintf("%v", sp["name"]),
			Price:      price,
			Category:   fmt.Sprintf("%v", sp["category"]),
			Brand:      fmt.Sprintf("%v", sp["brand"]),
			ImageCount: 1,
		})
	}
	if len(catalog) > 12 {
		catalog = catalog[:12]
	}

	shopCtx := toAIShopContext(shop, settings)
	var prodCtx *AIProductContext
	if product != nil {
		prodCtx = toAIProductContext(product)
	}

	temp := 0.25
	if settings != nil && settings.AiTone == "friendly" {
		temp = 0.3
	}
	if settings != nil && settings.AiTone == "technical" {
		temp = 0.2
	}

	return AIRequest{
		Scenario:       ScenarioClientAIManager,
		UserMessage:    userMsg,
		Shop:           shopCtx,
		Product:        prodCtx,
		Catalog:        catalog,
		SellerSettings: settings,
		Language:       "ru",
		Temperature:    temp,
	}, nil
}

func (a *App) handleGetMyAIManagerDialogs(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	rows, err := a.db.Query(a.ctx,
		"SELECT d.id, d.shop_id, d.client_user_id, d.product_id, d.lead_id, d.status, d.source, d.title, d.last_message, d.last_actor, d.created_at, d.updated_at, d.closed_at, d.taken_over_by_business, d.taken_over_at, s.name AS shop_name, s.slug AS shop_slug, COALESCE(p.name,'') AS product_name, p.images AS product_images FROM ai_manager_dialogs d JOIN shops s ON d.shop_id=s.id LEFT JOIN products p ON d.product_id=p.id WHERE d.client_user_id=$1 ORDER BY d.updated_at DESC",
		claims.Sub)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()
	var dialogs []map[string]interface{}
	for rows.Next() {
		var d AIManagerDialog
		var createdAt, updatedAt time.Time
		var closedAt, takenOverAt sql.NullTime
		var cid, pid, lid sql.NullString
		var shopName, shopSlug, productName string
		var productImages []string
		rows.Scan(&d.ID, &d.ShopID, &cid, &pid, &lid, &d.Status, &d.Source, &d.Title, &d.LastMessage, &d.LastActor, &createdAt, &updatedAt, &closedAt, &d.TakenOverByBusiness, &takenOverAt, &shopName, &shopSlug, &productName, &productImages)
		d.CreatedAt = createdAt.Format(time.RFC3339)
		d.UpdatedAt = updatedAt.Format(time.RFC3339)
		if cid.Valid {
			d.ClientUserID = &cid.String
		}
		if pid.Valid {
			d.ProductID = &pid.String
		}
		if lid.Valid {
			d.LeadID = &lid.String
		}
		if closedAt.Valid {
			s := closedAt.Time.Format(time.RFC3339)
			d.ClosedAt = &s
		}
		if takenOverAt.Valid {
			s := takenOverAt.Time.Format(time.RFC3339)
			d.TakenOverAt = &s
		}
		dialogs = append(dialogs, map[string]interface{}{
			"id": d.ID, "shopId": d.ShopID, "shopName": shopName, "shopSlug": shopSlug,
			"clientUserId": d.ClientUserID, "productId": d.ProductID, "leadId": d.LeadID,
			"status": d.Status, "source": d.Source, "title": d.Title, "lastMessage": d.LastMessage,
			"lastActor": d.LastActor, "createdAt": d.CreatedAt, "updatedAt": d.UpdatedAt,
			"closedAt": d.ClosedAt, "takenOverByBusiness": d.TakenOverByBusiness,
			"takenOverAt": d.TakenOverAt, "productName": productName,
			"productImages": normalizeImages(productImages),
		})
	}
	jsonOK(w, map[string]interface{}{"dialogs": dialogs})
}

func (a *App) handleGetMyAIManagerDialog(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	dialogID := r.PathValue("id")
	var clientID, shopID string
	err := a.db.QueryRow(a.ctx, "SELECT COALESCE(client_user_id,''), shop_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&clientID, &shopID)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if clientID == "" || clientID != claims.Sub {
		jsonErr(w, 403, "not your dialog")
		return
	}
	msgs, err := a.loadAIManagerDialogMessages(dialogID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"dialog": map[string]interface{}{"id": dialogID, "shopId": shopID}, "messages": msgs})
}

func (a *App) handleCreateAIManagerLead(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	dialogID := r.PathValue("id")
	var clientID, shopID, productID, existingLead string
	err := a.db.QueryRow(a.ctx, "SELECT COALESCE(client_user_id,''), shop_id, COALESCE(product_id,''), COALESCE(lead_id,'') FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&clientID, &shopID, &productID, &existingLead)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if clientID != claims.Sub {
		jsonErr(w, 403, "not your dialog")
		return
	}
	if existingLead != "" {
		jsonOK(w, map[string]interface{}{"leadId": existingLead, "created": false})
		return
	}
	leadID, err := a.createLeadFromDialog(shopID, productID, clientID, dialogID, "Заявка создана клиентом из диалога с AI-менеджером")
	if err != nil {
		jsonErr(w, 500, "failed to create lead")
		return
	}
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET lead_id=$1, status='lead_created' WHERE id=$2", leadID, dialogID)
	a.insertAIManagerMessage(dialogID, shopID, clientID, "system", "Заявка создана и передана продавцу.", "lead_created", nil, map[string]interface{}{"leadId": leadID})
	a.insertAIManagerEvent(dialogID, shopID, "lead_created", map[string]interface{}{"leadId": leadID})
	jsonOK(w, map[string]interface{}{"leadId": leadID, "created": true})
}

func (a *App) handleGetBusinessAIManagerSettings(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	settings, err := a.getOrCreateAIManagerSettings(shopID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"settings": settings})
}

func (a *App) handleUpdateBusinessAIManagerSettings(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	var req struct {
		Enabled                  *bool  `json:"enabled"`
		Mode                     string `json:"mode"`
		Tone                     string `json:"tone"`
		WelcomeMessage           string `json:"welcomeMessage"`
		HandoffMessage           string `json:"handoffMessage"`
		DeliveryPolicy           string `json:"deliveryPolicy"`
		WarrantyPolicy           string `json:"warrantyPolicy"`
		PaymentPolicy            string `json:"paymentPolicy"`
		DiscountPolicy           string `json:"discountPolicy"`
		ForbiddenTopics          string `json:"forbiddenTopics"`
		AiGreeting               string `json:"aiGreeting"`
		AiTone                   string `json:"aiTone"`
		AiStylePrompt            string `json:"aiStylePrompt"`
		AiForbiddenClaims        string `json:"aiForbiddenClaims"`
		AiPreferredCTA           string `json:"aiPreferredCTA"`
		AiUseShopContacts        *bool  `json:"aiUseShopContacts"`
		AiAnswerOutsideCatalog   *bool  `json:"aiAnswerOutsideCatalog"`
		AiStrictCatalogGrounding *bool  `json:"aiStrictCatalogGrounding"`
		AutoCreateLeads          *bool  `json:"autoCreateLeads"`
		AutoSuggestProducts      *bool  `json:"autoSuggestProducts"`
		AutoSuggestCheckout      *bool  `json:"autoSuggestCheckout"`
		HandoffOnUnknown         *bool  `json:"handoffOnUnknown"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	validModes := map[string]bool{"off": true, "assistive": true, "auto_reply": true, "auto_reply_and_lead": true}
	if req.Mode != "" && !validModes[req.Mode] {
		jsonErr(w, 400, "invalid mode: off|assistive|auto_reply|auto_reply_and_lead")
		return
	}
	validAiTones := map[string]bool{"professional": true, "friendly": true, "short": true, "premium": true, "technical": true}
	if req.AiTone != "" && !validAiTones[req.AiTone] {
		jsonErr(w, 400, "invalid aiTone: professional|friendly|short|premium|technical")
		return
	}
	clamp := func(s string, max int) string {
		if len(s) > max {
			return s[:max]
		}
		return s
	}
	req.WelcomeMessage = clamp(req.WelcomeMessage, 2000)
	req.HandoffMessage = clamp(req.HandoffMessage, 2000)
	req.DeliveryPolicy = clamp(req.DeliveryPolicy, 2000)
	req.WarrantyPolicy = clamp(req.WarrantyPolicy, 2000)
	req.PaymentPolicy = clamp(req.PaymentPolicy, 2000)
	req.DiscountPolicy = clamp(req.DiscountPolicy, 2000)
	req.ForbiddenTopics = clamp(req.ForbiddenTopics, 2000)
	req.AiGreeting = clamp(req.AiGreeting, 2000)
	req.AiTone = clamp(req.AiTone, 50)
	req.AiStylePrompt = clamp(req.AiStylePrompt, 2000)
	req.AiForbiddenClaims = clamp(req.AiForbiddenClaims, 2000)
	req.AiPreferredCTA = clamp(req.AiPreferredCTA, 500)
	req.Tone = clamp(req.Tone, 50)

	s, err := a.getOrCreateAIManagerSettings(shopID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	// If mode is missing, preserve existing; text fields may be explicitly cleared.
	mode := req.Mode
	if mode == "" {
		mode = s.Mode
	}
	_, err = a.db.Exec(a.ctx,
		`UPDATE ai_manager_settings SET
			enabled=COALESCE($2,enabled),
			mode=$3,
			tone=COALESCE(NULLIF($4,''),tone),
			welcome_message=$5,
			handoff_message=$6,
			delivery_policy=$7,
			warranty_policy=$8,
			payment_policy=$9,
			discount_policy=$10,
			forbidden_topics=$11,
			ai_greeting=$12,
			ai_tone=COALESCE(NULLIF($13,''),ai_tone),
			ai_style_prompt=$14,
			ai_forbidden_claims=$15,
			ai_preferred_cta=$16,
			ai_use_shop_contacts=COALESCE($17,ai_use_shop_contacts),
			ai_answer_outside_catalog=COALESCE($18,ai_answer_outside_catalog),
			ai_strict_catalog_grounding=COALESCE($19,ai_strict_catalog_grounding),
			auto_create_leads=COALESCE($20,auto_create_leads),
			auto_suggest_products=COALESCE($21,auto_suggest_products),
			auto_suggest_checkout=COALESCE($22,auto_suggest_checkout),
			handoff_on_unknown=COALESCE($23,handoff_on_unknown),
			updated_at=NOW()
		WHERE id=$1`,
		s.ID, req.Enabled, mode, req.Tone, req.WelcomeMessage, req.HandoffMessage, req.DeliveryPolicy, req.WarrantyPolicy, req.PaymentPolicy, req.DiscountPolicy, req.ForbiddenTopics,
		req.AiGreeting, req.AiTone, req.AiStylePrompt, req.AiForbiddenClaims, req.AiPreferredCTA, req.AiUseShopContacts, req.AiAnswerOutsideCatalog, req.AiStrictCatalogGrounding,
		req.AutoCreateLeads, req.AutoSuggestProducts, req.AutoSuggestCheckout, req.HandoffOnUnknown)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	settings, _ := a.getOrCreateAIManagerSettings(shopID)
	jsonOK(w, map[string]interface{}{"settings": settings})
}

func (a *App) handleGetBusinessAIManagerDialogs(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}

	// Query params: status, q, limit, offset, sort
	qStatus := r.URL.Query().Get("status")
	qSearch := r.URL.Query().Get("q")
	qSort := r.URL.Query().Get("sort")
	qLimit := 50
	qOffset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := fmt.Sscanf(v, "%d", &qLimit); err == nil && n == 1 && qLimit > 0 && qLimit <= 200 {
		} else {
			qLimit = 50
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		fmt.Sscanf(v, "%d", &qOffset)
	}

	// Base WHERE used for counts and list (without status filter)
	baseWhere := []string{"d.shop_id=$1"}
	baseArgs := []interface{}{shopID}
	bidx := 2
	if qSearch != "" {
		baseWhere = append(baseWhere, fmt.Sprintf("(COALESCE(profiles.display_name,'') ILIKE '%%' || $%d || '%%' OR COALESCE(profiles.email,'') ILIKE '%%' || $%d || '%%' OR COALESCE(p.name,'') ILIKE '%%' || $%d || '%%' OR d.last_message ILIKE '%%' || $%d || '%%')", bidx, bidx, bidx, bidx))
		baseArgs = append(baseArgs, qSearch)
		bidx++
	}

	// Counts (same search scope, no status filter)
	var total int
	countWhere := strings.Join(baseWhere, " AND ")
	a.db.QueryRow(a.ctx, fmt.Sprintf("SELECT COUNT(*) FROM ai_manager_dialogs d LEFT JOIN products p ON d.product_id=p.id LEFT JOIN profiles ON d.client_user_id=profiles.id WHERE %s", countWhere), baseArgs...).Scan(&total)
	counts := map[string]int{"open": 0, "waiting_seller": 0, "lead_created": 0, "taken_over": 0, "closed": 0}
	if countRows, err := a.db.Query(a.ctx, fmt.Sprintf("SELECT d.status, COUNT(*) FROM ai_manager_dialogs d LEFT JOIN products p ON d.product_id=p.id LEFT JOIN profiles ON d.client_user_id=profiles.id WHERE %s GROUP BY d.status", countWhere), baseArgs...); err == nil {
		defer countRows.Close()
		for countRows.Next() {
			var st string
			var c int
			countRows.Scan(&st, &c)
			counts[st] = c
		}
	}

	// List WHERE includes status filter
	where := append([]string{}, baseWhere...)
	args := append([]interface{}{}, baseArgs...)
	idx := bidx
	if qStatus != "" && qStatus != "all" {
		where = append(where, fmt.Sprintf("d.status=$%d", idx))
		args = append(args, qStatus)
		idx++
	}

	orderBy := "d.updated_at DESC"
	if qSort == "waiting" || qSort == "priority" {
		orderBy = "CASE WHEN d.status='waiting_seller' THEN 0 WHEN d.status='open' THEN 1 WHEN d.status='lead_created' THEN 2 WHEN d.status='taken_over' THEN 3 ELSE 4 END, d.updated_at DESC"
	} else if qSort == "leads" {
		orderBy = "CASE WHEN d.lead_id IS NOT NULL THEN 0 ELSE 1 END, d.updated_at DESC"
	}

	// Subquery for messages count
	query := fmt.Sprintf(`SELECT d.id, d.shop_id, d.client_user_id, d.product_id, d.lead_id, d.status, d.source, d.title, d.last_message, d.last_actor, d.created_at, d.updated_at, d.closed_at, d.taken_over_by_business, d.taken_over_at, COALESCE(p.name,'') AS product_name, p.images AS product_images, COALESCE(p.price,0) AS product_price, COALESCE(p.category,'') AS product_category, COALESCE(profiles.display_name, profiles.email, '') AS client_name, COALESCE(profiles.email,'') AS client_email, COALESCE(profiles.phone,'') AS client_phone, COALESCE(l.status,'') AS lead_status, (SELECT COUNT(*) FROM ai_manager_messages m WHERE m.dialog_id=d.id) AS messages_count FROM ai_manager_dialogs d LEFT JOIN products p ON d.product_id=p.id LEFT JOIN profiles ON d.client_user_id=profiles.id LEFT JOIN leads l ON d.lead_id=l.id WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`, strings.Join(where, " AND "), orderBy, idx, idx+1)
	args = append(args, qLimit, qOffset)

	rows, err := a.db.Query(a.ctx, query, args...)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()
	var dialogs []map[string]interface{}
	for rows.Next() {
		var d AIManagerDialog
		var createdAt, updatedAt time.Time
		var closedAt, takenOverAt sql.NullTime
		var cid, pid, lid sql.NullString
		var productName, clientName, clientEmail, clientPhone, productCategory, leadStatus string
		var productImages []string
		var productPrice, messagesCount int
		rows.Scan(&d.ID, &d.ShopID, &cid, &pid, &lid, &d.Status, &d.Source, &d.Title, &d.LastMessage, &d.LastActor, &createdAt, &updatedAt, &closedAt, &d.TakenOverByBusiness, &takenOverAt, &productName, &productImages, &productPrice, &productCategory, &clientName, &clientEmail, &clientPhone, &leadStatus, &messagesCount)
		d.CreatedAt = createdAt.Format(time.RFC3339)
		d.UpdatedAt = updatedAt.Format(time.RFC3339)
		if cid.Valid {
			d.ClientUserID = &cid.String
		}
		if pid.Valid {
			d.ProductID = &pid.String
		}
		if lid.Valid {
			d.LeadID = &lid.String
		}
		if closedAt.Valid {
			s := closedAt.Time.Format(time.RFC3339)
			d.ClosedAt = &s
		}
		if takenOverAt.Valid {
			s := takenOverAt.Time.Format(time.RFC3339)
			d.TakenOverAt = &s
		}
		productImages = normalizeImages(productImages)
		productImage := ""
		if len(productImages) > 0 {
			productImage = productImages[0]
		}
		requiresSeller := d.Status == "waiting_seller" || (d.Status == "open" && d.LastActor == "client")
		dialogs = append(dialogs, map[string]interface{}{
			"id": d.ID, "shopId": d.ShopID, "clientUserId": d.ClientUserID, "clientName": clientName, "clientEmail": clientEmail, "clientPhone": clientPhone,
			"productId": d.ProductID, "leadId": d.LeadID, "status": d.Status, "source": d.Source,
			"title": d.Title, "lastMessage": d.LastMessage, "lastActor": d.LastActor,
			"createdAt": d.CreatedAt, "updatedAt": d.UpdatedAt, "closedAt": d.ClosedAt,
			"takenOverByBusiness": d.TakenOverByBusiness, "takenOverAt": d.TakenOverAt,
			"productName": productName, "productImages": productImages, "productImage": productImage,
			"productPrice": productPrice, "productCategory": productCategory,
			"leadStatus": leadStatus, "messagesCount": messagesCount,
			"requiresSellerAttention": requiresSeller,
		})
	}
	jsonOK(w, map[string]interface{}{"dialogs": dialogs, "total": total, "counts": counts})
}

func (a *App) handleGetBusinessAIManagerDialog(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	dialogID := r.PathValue("id")
	var dialogShopID string
	var d AIManagerDialog
	var createdAt, updatedAt time.Time
	var closedAt, takenOverAt sql.NullTime
	var cid, pid, lid sql.NullString
	err = a.db.QueryRow(a.ctx,
		`SELECT d.shop_id, d.client_user_id, d.product_id, d.lead_id, d.status, d.source, d.title, d.last_message, d.last_actor, d.created_at, d.updated_at, d.closed_at, d.taken_over_by_business, d.taken_over_at
		 FROM ai_manager_dialogs d WHERE d.id=$1`, dialogID).Scan(
		&dialogShopID, &cid, &pid, &lid, &d.Status, &d.Source, &d.Title, &d.LastMessage, &d.LastActor, &createdAt, &updatedAt, &closedAt, &d.TakenOverByBusiness, &takenOverAt)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if dialogShopID != shopID {
		jsonErr(w, 403, "not your dialog")
		return
	}
	d.ID = dialogID
	d.ShopID = shopID
	d.CreatedAt = createdAt.Format(time.RFC3339)
	d.UpdatedAt = updatedAt.Format(time.RFC3339)
	if cid.Valid {
		d.ClientUserID = &cid.String
	}
	if pid.Valid {
		d.ProductID = &pid.String
	}
	if lid.Valid {
		d.LeadID = &lid.String
	}
	if closedAt.Valid {
		s := closedAt.Time.Format(time.RFC3339)
		d.ClosedAt = &s
	}
	if takenOverAt.Valid {
		s := takenOverAt.Time.Format(time.RFC3339)
		d.TakenOverAt = &s
	}

	// Build dialog map
	dialogMap := map[string]interface{}{
		"id": d.ID, "shopId": d.ShopID, "status": d.Status, "source": d.Source,
		"title": d.Title, "lastMessage": d.LastMessage, "lastActor": d.LastActor,
		"createdAt": d.CreatedAt, "updatedAt": d.UpdatedAt,
		"takenOverByBusiness": d.TakenOverByBusiness, "leadId": d.LeadID,
		"productId": d.ProductID, "clientUserId": d.ClientUserID,
	}
	if d.ClosedAt != nil {
		dialogMap["closedAt"] = *d.ClosedAt
	}
	if d.TakenOverAt != nil {
		dialogMap["takenOverAt"] = *d.TakenOverAt
	}

	// Enrich: client info
	if d.ClientUserID != nil {
		var clientName, clientEmail, clientPhone string
		a.db.QueryRow(a.ctx, "SELECT COALESCE(display_name,''), COALESCE(email,''), COALESCE(phone,'') FROM profiles WHERE id=$1", *d.ClientUserID).Scan(&clientName, &clientEmail, &clientPhone)
		dialogMap["clientName"] = clientName
		dialogMap["clientEmail"] = clientEmail
		dialogMap["clientPhone"] = clientPhone
	}

	// Enrich: product info
	if d.ProductID != nil {
		var pName, pCategory string
		var pPrice int
		var pImages []string
		a.db.QueryRow(a.ctx, "SELECT name, price, category, images FROM products WHERE id=$1", *d.ProductID).Scan(&pName, &pPrice, &pCategory, &pImages)
		pImages = normalizeImages(pImages)
		dialogMap["productName"] = pName
		dialogMap["productPrice"] = pPrice
		dialogMap["productCategory"] = pCategory
		dialogMap["productImages"] = pImages
		if len(pImages) > 0 {
			dialogMap["productImage"] = pImages[0]
		}
	}

	// Enrich: lead info
	if d.LeadID != nil {
		var leadStatus, leadMessage string
		var leadCreatedAt time.Time
		a.db.QueryRow(a.ctx, "SELECT status, COALESCE(message,''), created_at FROM leads WHERE id=$1", *d.LeadID).Scan(&leadStatus, &leadMessage, &leadCreatedAt)
		dialogMap["leadStatus"] = leadStatus
		dialogMap["leadMessage"] = leadMessage
		dialogMap["leadCreatedAt"] = leadCreatedAt.Format(time.RFC3339)
	}

	msgs, err := a.loadAIManagerDialogMessages(dialogID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"dialog": dialogMap, "messages": msgs})
}

func (a *App) handleBusinessTakeoverDialog(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	dialogID := r.PathValue("id")
	var dialogShopID string
	err = a.db.QueryRow(a.ctx, "SELECT shop_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&dialogShopID)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if dialogShopID != shopID {
		jsonErr(w, 403, "not your dialog")
		return
	}
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET taken_over_by_business=true, taken_over_at=NOW(), status='taken_over', updated_at=NOW() WHERE id=$1", dialogID)
	a.insertAIManagerMessage(dialogID, shopID, "", "system", "Диалог взят на контроль продавцом.", "system", nil, map[string]interface{}{"action": "takeover"})
	a.insertAIManagerEvent(dialogID, shopID, "business_takeover", map[string]interface{}{"by": claims.Sub})
	jsonOK(w, map[string]interface{}{"ok": true})
}

func (a *App) handleBusinessReplyDialog(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	dialogID := r.PathValue("id")
	var dialogShopID string
	err = a.db.QueryRow(a.ctx, "SELECT shop_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&dialogShopID)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if dialogShopID != shopID {
		jsonErr(w, 403, "not your dialog")
		return
	}
	var req struct {
		Message string `json:"message"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		jsonErr(w, 400, "message required")
		return
	}
	if len(req.Message) > 1000 {
		req.Message = req.Message[:1000]
	}
	a.insertAIManagerMessage(dialogID, shopID, "", "business", req.Message, "text", nil, map[string]interface{}{"by": claims.Sub})
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET last_message=$1, last_actor='business', status='taken_over', updated_at=NOW() WHERE id=$2", req.Message, dialogID)
	a.insertAIManagerEvent(dialogID, shopID, "business_reply", map[string]interface{}{"by": claims.Sub})
	jsonOK(w, map[string]interface{}{"ok": true})
}

func (a *App) handleBusinessUpdateDialogStatus(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	dialogID := r.PathValue("id")
	var dialogShopID string
	err = a.db.QueryRow(a.ctx, "SELECT shop_id FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&dialogShopID)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if dialogShopID != shopID {
		jsonErr(w, 403, "not your dialog")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	valid := map[string]bool{"open": true, "waiting_client": true, "waiting_seller": true, "lead_created": true, "taken_over": true, "closed": true}
	if !valid[req.Status] {
		jsonErr(w, 400, "invalid status")
		return
	}
	closedAt := ""
	if req.Status == "closed" {
		closedAt = "NOW()"
		a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET status=$1, closed_at=NOW(), updated_at=NOW() WHERE id=$2", req.Status, dialogID)
	} else {
		a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET status=$1, closed_at=NULL, updated_at=NOW() WHERE id=$2", req.Status, dialogID)
	}
	_ = closedAt
	a.insertAIManagerEvent(dialogID, shopID, "status_changed", map[string]interface{}{"status": req.Status})
	jsonOK(w, map[string]interface{}{"ok": true})
}

func (a *App) handleBusinessCreateAIManagerLead(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}
	dialogID := r.PathValue("id")
	var clientID, dialogShopID, productID, existingLead string
	err = a.db.QueryRow(a.ctx, "SELECT COALESCE(client_user_id,''), shop_id, COALESCE(product_id,''), COALESCE(lead_id,'') FROM ai_manager_dialogs WHERE id=$1", dialogID).Scan(&clientID, &dialogShopID, &productID, &existingLead)
	if err != nil {
		jsonErr(w, 404, "dialog not found")
		return
	}
	if dialogShopID != shopID {
		jsonErr(w, 403, "not your dialog")
		return
	}
	if existingLead != "" {
		jsonOK(w, map[string]interface{}{"leadId": existingLead, "created": false})
		return
	}
	leadID, err := a.createLeadFromDialog(shopID, productID, clientID, dialogID, "Заявка создана продавцом из диалога с AI-менеджером")
	if err != nil {
		jsonErr(w, 500, "failed to create lead")
		return
	}
	a.db.Exec(a.ctx, "UPDATE ai_manager_dialogs SET lead_id=$1, status='lead_created', updated_at=NOW() WHERE id=$2", leadID, dialogID)
	a.insertAIManagerMessage(dialogID, shopID, clientID, "system", "Заявка создана продавцом.", "lead_created", nil, map[string]interface{}{"leadId": leadID})
	a.insertAIManagerEvent(dialogID, shopID, "lead_created", map[string]interface{}{"leadId": leadID, "by": "business"})
	jsonOK(w, map[string]interface{}{"leadId": leadID, "created": true})
}

// Legal document versions recorded at registration.
// Bump when the documents published at /terms and /privacy change.
const (
	termsVersion   = legalTermsVersion
	privacyVersion = legalPrivacyVersion
)

func (a *App) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email         string `json:"email"`
		Password      string `json:"password"`
		DisplayName   string `json:"displayName"`
		Role          string `json:"role"`
		TermsAccepted *bool  `json:"terms_accepted"`
		PDConsent     *bool  `json:"pd_consent"`
		ConsentSource string `json:"consent_source"`
		Phone         string `json:"phone"`
		FirstName     string `json:"firstName"`
		LastName      string `json:"lastName"`
		Patronymic    string `json:"patronymic"`
		BirthDate     string `json:"birthDate"`
	}
	// Strict body parsing: the request must be exactly one valid JSON object.
	// Any decode error or trailing data is rejected with 400 before any DB
	// access — no profile, session or other records are created. The body
	// itself is never logged.
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		jsonErr(w, 400, "invalid request body")
		return
	}
	// A valid request must end immediately after the first JSON object.
	// A second object, an array, or any trailing text is rejected.
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		jsonErr(w, 400, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" || len(req.Password) < 6 {
		jsonErr(w, 400, "email and password (min 6) required")
		return
	}

	// Normalise email
	req.Email = normalizeEmail(req.Email)

	// Role must be explicitly chosen at registration — no default
	if req.Role != "client" && req.Role != "business" {
		jsonErr(w, 400, "invalid role; must be 'client' or 'business'")
		return
	}

	// Legal consent is mandatory and must be a boolean true.
	// Missing, false, or string values ("true"/"yes"/"1") are rejected.
	if req.TermsAccepted == nil || !*req.TermsAccepted {
		jsonErr(w, 400, "terms acceptance required")
		return
	}
	if !requirePersonalDataConsent(w, req.PDConsent) {
		return
	}

	// Brute-force check on normalized email
	remoteIP := clientIP(r)
	bfKey := authKey(req.Email, remoteIP)
	if authLimiter.isLocked(bfKey) {
		jsonErr(w, 429, "too many requests")
		return
	}

	ctx := r.Context()
	id := newID()

	// Compute bcrypt hash + generate refresh token before transaction
	hashedPW := hashPW(req.Password)

	tx, err := a.db.Begin(ctx)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	// Case-insensitive duplicate check (works even before index is created)
	var exists bool
	tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1)))", req.Email).Scan(&exists)
	if exists {
		jsonErr(w, 409, "email taken")
		return
	}

	_, err = tx.Exec(ctx, "INSERT INTO profiles (id, role, display_name, email, password, phone, first_name, last_name, patronymic, birth_date, terms_accepted_at, terms_version, privacy_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12)", id, req.Role, req.DisplayName, req.Email, hashedPW, req.Phone, req.FirstName, req.LastName, req.Patronymic, req.BirthDate, termsVersion, privacyVersion)
	if err != nil {
		if isUniqueViolation(err) {
			jsonErr(w, 409, "email taken")
		} else {
			jsonErr(w, 500, "internal error")
		}
		return
	}

	// Create auth session within same transaction
	raw, _ := GenerateToken()
	hash, _ := HashToken(raw)
	sessionID := newID()
	family := newID()
	expiresAt := time.Now().Add(time.Duration(a.secCfg.RefreshTokenTTLHours) * time.Hour)
	_, err = tx.Exec(ctx, "INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at) VALUES ($1,$2,$3,$4,NOW(),$5)", sessionID, id, hash, family, expiresAt)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	consentSource := strings.TrimSpace(req.ConsentSource)
	if consentSource == "" {
		consentSource = "signup_email"
	}
	_ = a.recordUserConsent(r, id, "personal_data", legalPDConsentVer, consentSource, true)
	_ = a.recordUserConsent(r, id, "terms", legalTermsVersion, consentSource, true)

	// Record signup with legal consent versions (best-effort audit)
	a.recordAuditEvent(r, id, req.Role, "signup", "profile", id, "", map[string]interface{}{
		"method":          "email",
		"terms_version":   termsVersion,
		"privacy_version": privacyVersion,
		"pd_consent_ver":  legalPDConsentVer,
		"consent_source":  consentSource,
	})

	accessToken, jti := makeJWTWithTTL(id, req.Role, a.jwtKey, a.secCfg.AccessTokenTTLMinutes)
	fp := ComputeFingerprint(clientIP(r), r.Header.Get("User-Agent"), r.Header.Get("Accept-Language"))
	bindIssuedAccessSession(a.ctx, family, id, fp, sessionID, jti, a.secCfg.AccessTokenTTLMinutes, a.secCfg.RefreshTokenTTLHours)
	setRefreshCookie(w, raw, a.secCfg.RefreshTokenTTLHours)
	noStoreHeaders(w)

	// Auto-issue verification token (non-blocking, after commit)
	vToken, _, _ := issueVerificationToken(r.Context(), a.db, a.secCfg, id, req.Email)
	resp := map[string]interface{}{"token": accessToken, "profile": map[string]interface{}{"id": id, "email": req.Email, "displayName": req.DisplayName, "role": req.Role, "phone": req.Phone, "firstName": req.FirstName, "lastName": req.LastName, "patronymic": req.Patronymic, "birthDate": req.BirthDate, "email_verified": false}}
	if req.Role == "business" {
		// A fresh business account must complete onboarding before the
		// business cabinet becomes available.
		resp["onboarding"] = map[string]interface{}{"status": onboardingRequired, "legalType": ""}
	}
	if a.secCfg.EmailVerificationExposeToken && vToken != "" {
		resp["verification_token"] = vToken
	}
	jsonOK(w, resp)
}

func (a *App) handleSignin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	ctx := r.Context()

	// Brute-force guard
	remoteIP := clientIP(r)
	bfKey := authKey(req.Email, remoteIP)
	if authLimiter.isLocked(bfKey) {
		jsonErr(w, 429, "too many requests")
		return
	}

	normalizedEmail := normalizeEmail(req.Email)
	var p Profile
	err := a.db.QueryRow(ctx, "SELECT id, role, display_name, email, password, COALESCE(phone,''), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(patronymic,''), COALESCE(birth_date,''), COALESCE(avatar_url,''), COALESCE(delivery_city,''), COALESCE(delivery_address,''), COALESCE(delivery_comment,''), COALESCE(payer_type,''), COALESCE(billing_name,''), COALESCE(billing_company_name,''), COALESCE(billing_inn,''), COALESCE(email_verified_at::text,'') FROM profiles WHERE LOWER(BTRIM(email))=$1", normalizedEmail).Scan(&p.ID, &p.Role, &p.DisplayName, &p.Email, &p.Password, &p.Phone, &p.FirstName, &p.LastName, &p.Patronymic, &p.BirthDate, &p.AvatarUrl, &p.DeliveryCity, &p.DeliveryAddress, &p.DeliveryComment, &p.PayerType, &p.BillingName, &p.BillingCompanyName, &p.BillingInn, &p.EmailVerifiedAt)
	if err != nil || !checkPW(p.Password, req.Password) {
		authLimiter.recordFailure(bfKey)
		jsonErr(w, 401, "invalid credentials")
		return
	}

	// Clear brute-force state on success
	authLimiter.reset(bfKey)

	// Generate session tokens
	raw, _ := GenerateToken()
	hash, _ := HashToken(raw)
	if !validRefreshToken.MatchString(raw) {
		jsonErr(w, 500, "internal error")
		return
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	sessionID := newID()
	family := newID()
	expiresAt := time.Now().Add(time.Duration(a.secCfg.RefreshTokenTTLHours) * time.Hour)
	_, err = tx.Exec(ctx, "INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family, created_at, expires_at) VALUES ($1,$2,$3,$4,NOW(),$5)", sessionID, p.ID, hash, family, expiresAt)
	if err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, 500, "internal error")
		return
	}

	accessToken, jti := makeJWTWithTTL(p.ID, p.Role, a.jwtKey, a.secCfg.AccessTokenTTLMinutes)
	fp := ComputeFingerprint(clientIP(r), r.Header.Get("User-Agent"), r.Header.Get("Accept-Language"))
	bindIssuedAccessSession(a.ctx, family, p.ID, fp, sessionID, jti, a.secCfg.AccessTokenTTLMinutes, a.secCfg.RefreshTokenTTLHours)
	setRefreshCookie(w, raw, a.secCfg.RefreshTokenTTLHours)
	noStoreHeaders(w)
	profile := map[string]interface{}{"id": p.ID, "email": p.Email, "displayName": p.DisplayName, "role": p.Role, "phone": p.Phone, "firstName": p.FirstName, "lastName": p.LastName, "patronymic": p.Patronymic, "birthDate": p.BirthDate, "avatarUrl": p.AvatarUrl, "deliveryCity": p.DeliveryCity, "deliveryAddress": p.DeliveryAddress, "deliveryComment": p.DeliveryComment, "payerType": p.PayerType, "billingName": p.BillingName, "billingCompanyName": p.BillingCompanyName, "billingInn": p.BillingInn, "email_verified": p.EmailVerifiedAt != ""}
	attachOnboardingToProfile(ctx, a.db, profile, p.ID, p.Role)
	jsonOK(w, map[string]interface{}{"token": accessToken, "profile": profile})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	var p Profile
	var termsVersion, privacyVersion string
	a.db.QueryRow(a.ctx, "SELECT id, role, COALESCE(display_name,''), COALESCE(email,''), COALESCE(phone,''), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(patronymic,''), COALESCE(birth_date,''), COALESCE(avatar_url,''), COALESCE(delivery_city,''), COALESCE(delivery_address,''), COALESCE(delivery_comment,''), COALESCE(payer_type,''), COALESCE(billing_name,''), COALESCE(billing_company_name,''), COALESCE(billing_inn,''), COALESCE(terms_version,''), COALESCE(privacy_version,'') FROM profiles WHERE id=$1", claims.Sub).Scan(&p.ID, &p.Role, &p.DisplayName, &p.Email, &p.Phone, &p.FirstName, &p.LastName, &p.Patronymic, &p.BirthDate, &p.AvatarUrl, &p.DeliveryCity, &p.DeliveryAddress, &p.DeliveryComment, &p.PayerType, &p.BillingName, &p.BillingCompanyName, &p.BillingInn, &termsVersion, &privacyVersion)
	profile := map[string]interface{}{"id": p.ID, "email": p.Email, "displayName": p.DisplayName, "role": p.Role, "phone": p.Phone, "firstName": p.FirstName, "lastName": p.LastName, "patronymic": p.Patronymic, "birthDate": p.BirthDate, "avatarUrl": p.AvatarUrl, "deliveryCity": p.DeliveryCity, "deliveryAddress": p.DeliveryAddress, "deliveryComment": p.DeliveryComment, "payerType": p.PayerType, "billingName": p.BillingName, "billingCompanyName": p.BillingCompanyName, "billingInn": p.BillingInn, "termsVersion": termsVersion, "privacyVersion": privacyVersion}
	attachOnboardingToProfile(r.Context(), a.db, profile, p.ID, p.Role)
	jsonOK(w, profile)
}

func (a *App) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	var req struct {
		FirstName          string `json:"firstName"`
		LastName           string `json:"lastName"`
		Patronymic         string `json:"patronymic"`
		BirthDate          string `json:"birthDate"`
		Phone              string `json:"phone"`
		AvatarUrl          string `json:"avatarUrl"`
		DeliveryCity       string `json:"deliveryCity"`
		DeliveryAddress    string `json:"deliveryAddress"`
		DeliveryComment    string `json:"deliveryComment"`
		PayerType          string `json:"payerType"`
		BillingName        string `json:"billingName"`
		BillingCompanyName string `json:"billingCompanyName"`
		BillingInn         string `json:"billingInn"`
		PDConsent          *bool  `json:"pd_consent"`
		ConsentSource      string `json:"consent_source"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.PDConsent == nil || !*req.PDConsent {
		var hasPriorConsent bool
		_ = a.db.QueryRow(a.ctx, `SELECT (
			EXISTS(SELECT 1 FROM user_consents WHERE user_id=$1 AND consent_type='personal_data' AND granted=true AND withdrawn_at IS NULL)
			OR EXISTS(SELECT 1 FROM profiles WHERE id=$1 AND terms_accepted_at IS NOT NULL)
		)`, claims.Sub).Scan(&hasPriorConsent)
		if !hasPriorConsent {
			if !requirePersonalDataConsent(w, req.PDConsent) {
				return
			}
		}
	} else {
		src := strings.TrimSpace(req.ConsentSource)
		if src == "" {
			src = "profile_update"
		}
		_ = a.recordUserConsent(r, claims.Sub, "personal_data", legalPDConsentVer, src, true)
	}
	a.db.Exec(a.ctx,
		`UPDATE profiles SET
			first_name=COALESCE(NULLIF($2,''),first_name),
			last_name=COALESCE(NULLIF($3,''),last_name),
			patronymic=COALESCE(NULLIF($4,''),patronymic),
			birth_date=COALESCE(NULLIF($5,''),birth_date),
			phone=COALESCE(NULLIF($6,''),phone),
			avatar_url=COALESCE(NULLIF($7,''),avatar_url),
			delivery_city=COALESCE(NULLIF($8,''),delivery_city),
			delivery_address=COALESCE(NULLIF($9,''),delivery_address),
			delivery_comment=COALESCE(NULLIF($10,''),delivery_comment),
			payer_type=COALESCE(NULLIF($11,''),payer_type),
			billing_name=COALESCE(NULLIF($12,''),billing_name),
			billing_company_name=COALESCE(NULLIF($13,''),billing_company_name),
			billing_inn=COALESCE(NULLIF($14,''),billing_inn)
		WHERE id=$1`,
		claims.Sub, req.FirstName, req.LastName, req.Patronymic, req.BirthDate, req.Phone, req.AvatarUrl, req.DeliveryCity, req.DeliveryAddress, req.DeliveryComment, req.PayerType, req.BillingName, req.BillingCompanyName, req.BillingInn)
	// Return updated profile
	var p Profile
	a.db.QueryRow(a.ctx, "SELECT id, role, COALESCE(display_name,''), COALESCE(email,''), COALESCE(phone,''), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(patronymic,''), COALESCE(birth_date,''), COALESCE(avatar_url,''), COALESCE(delivery_city,''), COALESCE(delivery_address,''), COALESCE(delivery_comment,''), COALESCE(payer_type,''), COALESCE(billing_name,''), COALESCE(billing_company_name,''), COALESCE(billing_inn,'') FROM profiles WHERE id=$1", claims.Sub).Scan(&p.ID, &p.Role, &p.DisplayName, &p.Email, &p.Phone, &p.FirstName, &p.LastName, &p.Patronymic, &p.BirthDate, &p.AvatarUrl, &p.DeliveryCity, &p.DeliveryAddress, &p.DeliveryComment, &p.PayerType, &p.BillingName, &p.BillingCompanyName, &p.BillingInn)
	jsonOK(w, map[string]interface{}{"profile": map[string]interface{}{"id": p.ID, "email": p.Email, "displayName": p.DisplayName, "role": p.Role, "phone": p.Phone, "firstName": p.FirstName, "lastName": p.LastName, "patronymic": p.Patronymic, "birthDate": p.BirthDate, "avatarUrl": p.AvatarUrl, "deliveryCity": p.DeliveryCity, "deliveryAddress": p.DeliveryAddress, "deliveryComment": p.DeliveryComment, "payerType": p.PayerType, "billingName": p.BillingName, "billingCompanyName": p.BillingCompanyName, "billingInn": p.BillingInn}})
}

func (a *App) handleCreateShop(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireBusiness(w, r)
	if !ok {
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		Slug         string `json:"slug"`
		Category     string `json:"category"`
		CustomDomain string `json:"customDomain"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" {
		jsonErr(w, 400, "name required")
		return
	}
	if req.Slug == "" {
		req.Slug = strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	}
	// Нормализуем slug
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Slug = strings.ReplaceAll(req.Slug, " ", "-")
	id := newID()
	_, err := a.db.Exec(a.ctx, "INSERT INTO shops (id, owner_id, slug, name, description, category, custom_domain) VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''))", id, claims.Sub, req.Slug, req.Name, req.Description, req.Category, req.CustomDomain)
	if err != nil {
		jsonErr(w, 409, "slug taken")
		return
	}
	jsonOK(w, map[string]interface{}{"shop": map[string]interface{}{"id": id, "slug": req.Slug, "name": req.Name}})
}

func (a *App) handleUpdateMyShop(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireBusiness(w, r)
	if !ok {
		return
	}
	var req struct {
		Name          string `json:"name"`
		Description   string `json:"description"`
		About         string `json:"about"`
		Category      string `json:"category"`
		LogoURL       string `json:"logoUrl"`
		CoverURL      string `json:"coverUrl"`
		Color         string `json:"color"`
		AITone        string `json:"aiTone"`
		CustomDomain  string `json:"customDomain"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		City          string `json:"city"`
		ContactMethod string `json:"contactMethod"`
		WorkingHours  string `json:"workingHours"`
		ShowAiManager *bool  `json:"showAiManager,omitempty"`
		Tagline       string `json:"tagline"`
		IsPublished   *bool  `json:"isPublished,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	showAiManager := true
	if req.ShowAiManager != nil {
		showAiManager = *req.ShowAiManager
	}
	isPublished := true
	if req.IsPublished != nil {
		isPublished = *req.IsPublished
	}

	_, err := a.db.Exec(a.ctx, `
		UPDATE shops SET
			name=COALESCE(NULLIF($2,''),name),
			description=COALESCE(NULLIF($3,''),description),
			about=COALESCE(NULLIF($4,''),about),
			category=COALESCE(NULLIF($5,''),category),
			logo_url=COALESCE(NULLIF($6,''),logo_url),
			cover_url=COALESCE(NULLIF($7,''),cover_url),
			color=COALESCE(NULLIF($8,''),color),
			ai_tone=COALESCE(NULLIF($9,''),ai_tone),
			custom_domain=NULLIF($10,''),
			phone=COALESCE(NULLIF($11,''),phone),
			email=COALESCE(NULLIF($12,''),email),
			city=COALESCE(NULLIF($13,''),city),
			contact_method=COALESCE(NULLIF($14,''),contact_method),
			working_hours=COALESCE(NULLIF($15,''),working_hours),
			show_ai_manager=$16,
			tagline=COALESCE(NULLIF($17,''),tagline),
			is_published=$18
		WHERE owner_id=$1`,
		claims.Sub, req.Name, req.Description, req.About, req.Category, req.LogoURL, req.CoverURL, req.Color, req.AITone, req.CustomDomain,
		req.Phone, req.Email, req.City, req.ContactMethod, req.WorkingHours, showAiManager, req.Tagline, isPublished)
	if err != nil {
		jsonErr(w, 500, "failed to update shop")
		return
	}

	// Return fresh shop
	var shop Shop
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).
		Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil {
		jsonErr(w, 500, "failed to load updated shop")
		return
	}
	jsonOK(w, map[string]interface{}{"shop": shop})
}

func (a *App) handleCreateLead(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ShopID        string `json:"shopId"`
		ProductID     string `json:"productId"`
		Name          string `json:"name"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		Message       string `json:"message"`
		PDConsent     *bool  `json:"pd_consent"`
		ConsentSource string `json:"consent_source"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.ShopID == "" || req.Name == "" {
		jsonErr(w, 400, "shopId and name required")
		return
	}
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "Для отправки заявки необходимо войти в аккаунт")
		return
	}
	if !a.requirePersonalDataConsentOrPrior(w, claims.Sub, req.PDConsent) {
		return
	}
	customerUserID := claims.Sub
	id := newID()
	a.db.Exec(a.ctx, "INSERT INTO leads (id, shop_id, product_id, name, phone, email, message, customer_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", id, req.ShopID, req.ProductID, req.Name, req.Phone, req.Email, req.Message, customerUserID)
	src := strings.TrimSpace(req.ConsentSource)
	if src == "" {
		src = "lead_form"
	}
	_ = a.recordUserConsent(r, customerUserID, "personal_data", legalPDConsentVer, src, true)
	jsonOK(w, map[string]interface{}{"leadId": id})
}

func (a *App) handleMyLeads(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}

	if claims.Role == "client" {
		rows, err := a.db.Query(a.ctx, "SELECT l.id, COALESCE(l.status,'new'), l.created_at, COALESCE(CASE WHEN l.product_name != '' THEN l.product_name ELSE p.name END,''), COALESCE(l.ai_reply,''), COALESCE(l.source,''), COALESCE(l.delivery_city,''), COALESCE(l.contact_preference,''), COALESCE(l.customer_need,''), COALESCE(l.product_id,''), COALESCE(l.shop_id,''), COALESCE(l.name,''), COALESCE(l.phone,''), COALESCE(l.email,''), COALESCE(l.message,''), COALESCE(s.name,''), COALESCE(s.slug,''), COALESCE(array_to_json(p.images), '[]')::text, COALESCE(p.price, 0) FROM leads l LEFT JOIN shops s ON l.shop_id=s.id LEFT JOIN products p ON l.product_id=p.id WHERE l.customer_user_id=$1 ORDER BY l.created_at DESC", claims.Sub)
		if err != nil {
			log.Printf("my leads client query error: %v", err)
			jsonOK(w, map[string]interface{}{"leads": []interface{}{}})
			return
		}
		defer rows.Close()
		type ClientLead struct {
			ID                string `json:"id"`
			Status            string `json:"status"`
			CreatedAt         string `json:"createdAt"`
			ProductName       string `json:"productName,omitempty"`
			AiReply           string `json:"aiReply,omitempty"`
			Source            string `json:"source,omitempty"`
			DeliveryCity      string `json:"deliveryCity,omitempty"`
			ContactPreference string `json:"contactPreference,omitempty"`
			CustomerNeed      string `json:"customerNeed,omitempty"`
			ProductID         string `json:"productId,omitempty"`
			ShopID            string `json:"shopId,omitempty"`
			Name              string `json:"name,omitempty"`
			Phone             string `json:"phone,omitempty"`
			Email             string `json:"email,omitempty"`
			Message           string `json:"message,omitempty"`
			ShopName          string `json:"shopName,omitempty"`
			ShopSlug          string `json:"shopSlug,omitempty"`
			ProductImages     string `json:"productImages,omitempty"`
			ProductPrice      int    `json:"productPrice,omitempty"`
		}
		leads := []ClientLead{}
		for rows.Next() {
			var l ClientLead
			var createdAt time.Time
			if err := rows.Scan(&l.ID, &l.Status, &createdAt, &l.ProductName, &l.AiReply, &l.Source, &l.DeliveryCity, &l.ContactPreference, &l.CustomerNeed, &l.ProductID, &l.ShopID, &l.Name, &l.Phone, &l.Email, &l.Message, &l.ShopName, &l.ShopSlug, &l.ProductImages, &l.ProductPrice); err != nil {
				log.Printf("my leads client scan error: %v", err)
				continue
			}
			l.CreatedAt = createdAt.Format(time.RFC3339)
			if l.Status == "" {
				l.Status = "new"
			}
			leads = append(leads, l)
		}
		jsonOK(w, map[string]interface{}{"leads": leads})
		return
	}

	if claims.Role != "business" {
		jsonErr(w, 403, "business or client only")
		return
	}

	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	rows, err := a.db.Query(a.ctx, "SELECT l.id, l.name, l.phone, l.email, l.message, COALESCE(l.status,'new'), l.created_at, COALESCE(l.status_updated_at::text,''), COALESCE(l.seller_note,''), COALESCE(CASE WHEN l.product_name != '' THEN l.product_name ELSE p.name END,''), COALESCE(l.ai_reply,''), COALESCE(l.source,''), COALESCE(l.delivery_city,''), COALESCE(l.contact_preference,''), COALESCE(l.customer_need,'') FROM leads l LEFT JOIN products p ON l.product_id=p.id WHERE l.shop_id=$1 ORDER BY l.id DESC", shopID)
	if err != nil {
		log.Printf("my leads query error: %v", err)
		jsonOK(w, map[string]interface{}{"leads": []Lead{}})
		return
	}
	defer rows.Close()
	leads := []Lead{}
	for rows.Next() {
		var l Lead
		var createdAt time.Time
		if err := rows.Scan(&l.ID, &l.Name, &l.Phone, &l.Email, &l.Message, &l.Status, &createdAt, &l.StatusUpdatedAt, &l.SellerNote, &l.ProductName, &l.AiReply, &l.Source, &l.DeliveryCity, &l.ContactPreference, &l.CustomerNeed); err != nil {
			log.Printf("my leads scan error: %v", err)
			continue
		}
		l.CreatedAt = createdAt.Format(time.RFC3339)
		if l.Status == "" {
			l.Status = "new"
		}
		leads = append(leads, l)
	}
	jsonOK(w, map[string]interface{}{"leads": leads})
}

func (a *App) handleUpdateLeadStatus(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	leadID := r.PathValue("id")

	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}

	var leadShopID, currentStatus string
	err = a.db.QueryRow(a.ctx, "SELECT shop_id, COALESCE(status,'new') FROM leads WHERE id=$1", leadID).Scan(&leadShopID, &currentStatus)
	if err != nil {
		jsonErr(w, 404, "lead not found")
		return
	}
	if leadShopID != shopID {
		jsonErr(w, 403, "not your lead")
		return
	}

	var req struct {
		Status     string `json:"status"`
		SellerNote string `json:"sellerNote"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	allowed := map[string]bool{"new": true, "in_progress": true, "contacted": true, "deal": true, "rejected": true}
	if req.Status != "" && !allowed[req.Status] {
		jsonErr(w, 400, "invalid status: use new|in_progress|contacted|deal|rejected")
		return
	}
	if len(req.SellerNote) > 1000 {
		req.SellerNote = req.SellerNote[:1000]
	}

	if req.Status != "" {
		a.updateLeadStatus(leadShopID, leadID, req.Status, req.SellerNote)
	} else {
		a.db.Exec(a.ctx, "UPDATE leads SET seller_note=$1 WHERE id=$2", req.SellerNote, leadID)
	}

	jsonOK(w, map[string]interface{}{
		"lead": map[string]interface{}{
			"id": leadID, "status": req.Status, "sellerNote": req.SellerNote, "statusUpdatedAt": "now",
		},
	})
}

func (a *App) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Query string `json:"query"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Экранируем LIKE диакритику
	safe := strings.ReplaceAll(req.Query, "%", "\\%")
	safe = strings.ReplaceAll(safe, "_", "\\_")
	q := "%" + strings.ToLower(safe) + "%"

	rows, _ := a.db.Query(a.ctx, "SELECT p.id, p.name, p.price, s.name, s.slug FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.is_active=true AND s.is_published=true AND (LOWER(p.name) LIKE $1 ESCAPE '\\' OR LOWER(p.description) LIKE $1 ESCAPE '\\') LIMIT 20", q)
	defer rows.Close()
	type R struct {
		ID, Name, ShopName, ShopSlug string
		Price                        int
	}
	var results []R
	for rows.Next() {
		var r R
		rows.Scan(&r.ID, &r.Name, &r.Price, &r.ShopName, &r.ShopSlug)
		results = append(results, r)
	}

	// AI summary если есть результаты и есть ключ
	summary := ""
	if len(results) > 0 && a.aiKey != "" {
		var items []string
		for _, r := range results {
			items = append(items, fmt.Sprintf("%s (%d ₽) из магазина %s", r.Name, r.Price, r.ShopName))
		}
		aiSystem := fmt.Sprintf("Ты — AI-помощник маркетплейса AGENT.ONE. Пользователь искал: %q. Найдено %d товаров:\n%s\nНапиши краткое резюме результатов поиска на русском (2-3 предложения).", req.Query, len(results), strings.Join(items, "\n"))
		summary = a.aiChat(aiSystem, "Подведи итог поиска")
	}

	jsonOK(w, map[string]interface{}{"results": results, "total": len(results), "summary": summary})
}

// ═══════════════════════════════════════════════
//  SMART SEARCH — fallback parser + ranking
// ═══════════════════════════════════════════════

type SmartSearchIntent struct {
	Category string   `json:"category,omitempty"`
	MaxPrice *int     `json:"maxPrice,omitempty"`
	MinPrice *int     `json:"minPrice,omitempty"`
	Keywords []string `json:"keywords,omitempty"`
	Brand    string   `json:"brand,omitempty"`
	YearMin  *int     `json:"yearMin,omitempty"`
}

type SmartSearchItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Price       int    `json:"price"`
	Category    string `json:"category"`
	ShopName    string `json:"shopName"`
	ShopSlug    string `json:"shopSlug"`
	Score       int    `json:"score"`
	Explanation string `json:"explanation"`
}

func unitMul(u string) int {
	u = strings.ToLower(strings.TrimSpace(u))
	if strings.Contains(u, "млн") || strings.Contains(u, "миллион") {
		return 1000000
	}
	if strings.Contains(u, "тыс") || strings.Contains(u, "k") || strings.Contains(u, "т.") {
		return 1000
	}
	return 1
}

func parseMaxPrice(q string) *int {
	re := regexp.MustCompile(`(?:до|бюджет\s*до|максимум|max)\s+(\d[\d\s.,]*)\s*(тыс(?:яч[ьей])?|т\.?\s*р\.?|k|млн|миллион(?:ов|а)?)?`)
	m := re.FindStringSubmatch(strings.ToLower(q))
	if m == nil {
		return nil
	}
	s := strings.NewReplacer(" ", "", "\u00a0", "").Replace(m[1])
	mul := unitMul(m[2])
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		r := v * mul
		if r > 0 {
			return &r
		}
		return nil
	}
	s = strings.ReplaceAll(s, ",", ".")
	if v, err := strconv.ParseFloat(s, 64); err == nil && v > 0 {
		r := int(v * float64(mul))
		if r > 0 {
			return &r
		}
	}
	return nil
}

func parseMinPrice(q string) *int {
	re := regexp.MustCompile(`(?:от|минимум|min)\s+(\d[\d\s.,]*)\s*(тыс(?:яч[ьей])?|т\.?\s*р\.?|k|млн|миллион(?:ов|а)?)?`)
	m := re.FindStringSubmatch(strings.ToLower(q))
	if m == nil {
		return nil
	}
	s := strings.NewReplacer(" ", "", "\u00a0", "").Replace(m[1])
	mul := unitMul(m[2])
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		r := v * mul
		if r > 0 {
			return &r
		}
		return nil
	}
	s = strings.ReplaceAll(s, ",", ".")
	if v, err := strconv.ParseFloat(s, 64); err == nil && v > 0 {
		r := int(v * float64(mul))
		if r > 0 {
			return &r
		}
	}
	return nil
}

func parseYearMin(q string) *int {
	re := regexp.MustCompile(`(?:не старше|от|с)\s*(\d{4})`)
	m := re.FindStringSubmatch(strings.ToLower(q))
	if m == nil {
		return nil
	}
	y, _ := strconv.Atoi(m[1])
	if y >= 1900 && y <= 2100 {
		return &y
	}
	return nil
}

func parseSmartCategory(q string) string {
	lower := strings.ToLower(q)
	rules := map[string][]string{
		"electronics": {"телефон", "смартфон", "iphon", "айфон", "samsung", "ноутбук", "компьютер", "монитор", "наушник", "клавиатур", "мышк", "приставк", "playstation", "ps5", "xbox", "планшет", "часы", "watch", "игр", "колонк", "динамик", "jbl", "airpod", "музык", "звук", "чехол", "зарядк", "кабель", "стекл", "аксессуар", "steam", "клава", "гаджет", "ноут"},
		"auto":        {"авто", "машин", "автомобил", "шины", "диск", "запчаст", "мотор", "кузов"},
		"fashion":     {"одежд", "куртк", "футболк", "обув", "кроссовк", "плать", "джинс", "штаны", "шапк", "шарф", "сумк"},
		"home":        {"мебель", "стол", "диван", "кресл", "стул", "шкаф", "полк", "ковр", "люстр", "светильник", "лампа"},
		"real_estate": {"квартир", "дом", "участок", "недвижим", "аренд", "снять", "сда", "жиль"},
		"repair":      {"ремонт", "услуг", "мастер", "почин", "установк", "монтаж"},
		"webdev":      {"сайт", "разработк", "программист", "дизайн", "верстк", "лендинг"},
		"beauty":      {"косметик", "макияж", "ногт", "волос", "ресниц", "бров", "ногтев", "маникюр", "педикюр", "стрижк"},
		"education":   {"обучен", "курс", "репетитор", "урок", "преподават", "школ", "english", "язык", "инструктор"},
	}
	for cat, keywords := range rules {
		for _, kw := range keywords {
			if strings.Contains(lower, kw) {
				return cat
			}
		}
	}
	return ""
}

func parseKeywords(q string) []string {
	q = strings.ToLower(q)
	// Remove price/year patterns
	q = regexp.MustCompile(`до\s+\d[\d\s.,]*`).ReplaceAllString(q, " ")
	q = regexp.MustCompile(`от\s+\d[\d\s.,]*`).ReplaceAllString(q, " ")
	q = regexp.MustCompile(`не старше \d{4}`).ReplaceAllString(q, " ")
	// Replace punctuation
	for _, r := range []string{".", ",", "!", "?", ":", ";", "-", "(", ")", "\"", "'"} {
		q = strings.ReplaceAll(q, r, " ")
	}
	words := strings.Fields(q)
	stopWords := map[string]bool{
		"я": true, "мне": true, "мой": true, "мои": true,
		"нужен": true, "нужна": true, "нужно": true, "нужны": true,
		"хочу": true, "ищу": true, "найти": true, "подобрать": true, "подбери": true, "покажи": true, "покажите": true,
		"для": true, "до": true, "от": true, "по": true, "с": true, "со": true, "в": true, "на": true, "к": true, "из": true, "за": true,
		"и": true, "или": true, "а": true, "но": true, "не": true, "есть": true, "ли": true, "бы": true,
		"старше": true, "младше": true, "чем": true, "какой": true, "какая": true, "какое": true, "какие": true,
		"хороший": true, "хорошая": true, "хорошие": true, "хорошо": true, "лучше": true, "лучший": true,
		"плохой": true, "плохая": true,
		"бюджет": true, "цена": true, "стоимость": true, "стоит": true,
		"рублей": true, "рубля": true, "руб": true, "тыс": true, "тысяч": true, "тысячи": true,
		"млн": true, "миллион": true, "миллиона": true, "миллионов": true,
		"спасибо": true, "пожалуйста": true, "привет": true, "здравствуйте": true,
		"максимум": true, "минимум": true, "максимально": true, "минимально": true,
		"помоги": true, "помогите": true, "посоветуй": true, "посоветуйте": true,
		"можно": true, "как": true, "что": true, "где": true, "когда": true, "какойто": true,
		"k": true, "t": true, "р": true,
	}
	seen := map[string]bool{}
	var kw []string
	for _, w := range words {
		w = strings.Trim(w, ".,!?:;-()"+"`"+`"'`+"0123456789")
		if len(w) < 2 || len(w) > 30 || seen[w] || stopWords[w] {
			continue
		}
		// Skip pure numbers left after trimming
		if _, err := strconv.Atoi(w); err == nil {
			continue
		}
		seen[w] = true
		kw = append(kw, w)
	}
	if len(kw) > 6 {
		kw = kw[:6]
	}
	return kw
}
func parseSmartIntent(query string) SmartSearchIntent {
	q := strings.ToLower(strings.TrimSpace(query))
	intent := SmartSearchIntent{Keywords: parseKeywords(q)}
	if p := parseMaxPrice(q); p != nil {
		intent.MaxPrice = p
	}
	if p := parseMinPrice(q); p != nil {
		intent.MinPrice = p
	}
	if c := parseSmartCategory(q); c != "" {
		intent.Category = c
	}
	if y := parseYearMin(q); y != nil {
		intent.YearMin = y
	}
	return intent
}

func scoreSmartProduct(name, desc string, benefits []string, productCategory string, price int, intent SmartSearchIntent) (int, string) {
	// If category is confidently detected and product doesn't match, exclude entirely
	if intent.Category != "" && productCategory != intent.Category {
		return 0, ""
	}

	score := 0
	var reasons []string
	lowerName := strings.ToLower(name)
	lowerDesc := strings.ToLower(desc)
	lowerBenefits := strings.ToLower(strings.Join(benefits, " "))

	if intent.Category != "" {
		score += 4
		reasons = append(reasons, "Совпадает категория")
	}
	if intent.MaxPrice != nil && price <= *intent.MaxPrice {
		score += 3
		reasons = append(reasons, "Подходит по бюджету")
	}
	if intent.MinPrice != nil && price >= *intent.MinPrice {
		score += 1
	}
	for _, kw := range intent.Keywords {
		if strings.Contains(lowerName, kw) {
			score += 3
			reasons = append(reasons, fmt.Sprintf("Название: %s", kw))
		} else if strings.Contains(lowerDesc, kw) {
			score += 2
		} else if strings.Contains(lowerBenefits, kw) {
			score += 2
		}
	}
	if score == 0 {
		return 0, ""
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "Похожий вариант из каталога")
	}
	return score, strings.Join(reasons, "; ")
}

func generateSmartSummary(intent SmartSearchIntent, total int, shops []string) string {
	if total == 0 {
		if intent.Category != "" {
			return fmt.Sprintf("Я понял, что вы ищете товары в категории «%s», но сейчас в каталоге нет подходящих вариантов. Попробуйте изменить запрос.", intent.Category)
		}
		return "Точных совпадений нет. Попробуйте изменить бюджет, категорию или запрос."
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Нашёл %d подходящих товар", total))
	if total%10 == 1 && total%100 != 11 {
		sb.WriteString("")
	} else if (total%10 >= 2 && total%10 <= 4) && !(total%100 >= 12 && total%100 <= 14) {
		sb.WriteString("а")
	} else {
		sb.WriteString("ов")
	}
	if len(shops) > 0 {
		sb.WriteString(fmt.Sprintf(" в %d магазин", len(shops)))
		if len(shops)%10 == 1 && len(shops)%100 != 11 {
			sb.WriteString("е")
		} else {
			sb.WriteString("ах")
		}
	}
	sb.WriteString(". Показываю варианты из каталога AGENT.ONE.")
	return sb.String()
}

func generateSmartSuggestions(intent SmartSearchIntent) []string {
	var s []string
	if intent.MaxPrice != nil {
		s = append(s, "Без ограничения цены")
	}
	if intent.Category != "" {
		s = append(s, "Изменить категорию")
	}
	s = append(s, "Все товары")
	return s
}

func (a *App) handleSmartSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	query := strings.TrimSpace(req.Query)
	if len(query) > 300 {
		jsonErr(w, 400, "Слишком длинный запрос (максимум 300 символов)")
		return
	}
	if query == "" {
		jsonErr(w, 400, "Введите поисковый запрос")
		return
	}
	if req.Limit <= 0 || req.Limit > 24 {
		req.Limit = 12
	}

	intent := parseSmartIntent(query)

	// Gather candidate products: first by category, then by keyword LIKE
	type candidate struct {
		Product
		ShopName string
		ShopSlug string
	}
	seen := map[string]bool{}
	var candidates []candidate

	// Query 1: match by category
	if intent.Category != "" {
		rows, err := a.db.Query(a.ctx,
			"SELECT p.id,p.shop_id,p.name,p.description,p.benefits,p.price,p.old_price,p.category,p.images,p.is_active,s.name,s.slug "+
				"FROM products p JOIN shops s ON p.shop_id=s.id "+
				"WHERE p.is_active=true AND s.is_published=true AND p.category=$1 LIMIT 50", intent.Category)
		if err == nil {
			for rows.Next() {
				var c candidate
				rows.Scan(&c.ID, &c.ShopID, &c.Name, &c.Description, &c.Benefits, &c.Price, &c.OldPrice, &c.Category, &c.Images, &c.IsActive, &c.ShopName, &c.ShopSlug)
				if !seen[c.ID] {
					seen[c.ID] = true
					candidates = append(candidates, c)
				}
			}
			rows.Close()
		}
	}

	// Query 2: full-text LIKE on keywords
	if len(intent.Keywords) > 0 && len(candidates) < req.Limit*3 {
		safeQ := strings.ReplaceAll(strings.ToLower(query), "%", "\\%")
		safeQ = strings.ReplaceAll(safeQ, "_", "\\_")
		likeQ := "%" + safeQ + "%"
		rows, err := a.db.Query(a.ctx,
			"SELECT p.id,p.shop_id,p.name,p.description,p.benefits,p.price,p.old_price,p.category,p.images,p.is_active,s.name,s.slug "+
				"FROM products p JOIN shops s ON p.shop_id=s.id "+
				"WHERE p.is_active=true AND s.is_published=true "+
				"AND (LOWER(p.name) LIKE $1 ESCAPE '\\' OR LOWER(p.description) LIKE $1 ESCAPE '\\') LIMIT 50", likeQ)
		if err == nil {
			for rows.Next() {
				var c candidate
				rows.Scan(&c.ID, &c.ShopID, &c.Name, &c.Description, &c.Benefits, &c.Price, &c.OldPrice, &c.Category, &c.Images, &c.IsActive, &c.ShopName, &c.ShopSlug)
				if !seen[c.ID] {
					seen[c.ID] = true
					candidates = append(candidates, c)
				}
			}
			rows.Close()
		}
	}

	// If still not enough, get top products overall
	if len(candidates) < req.Limit {
		rows, err := a.db.Query(a.ctx,
			"SELECT p.id,p.shop_id,p.name,p.description,p.benefits,p.price,p.old_price,p.category,p.images,p.is_active,s.name,s.slug "+
				"FROM products p JOIN shops s ON p.shop_id=s.id "+
				"WHERE p.is_active=true AND s.is_published=true ORDER BY p.price DESC LIMIT 50")
		if err == nil {
			for rows.Next() {
				var c candidate
				rows.Scan(&c.ID, &c.ShopID, &c.Name, &c.Description, &c.Benefits, &c.Price, &c.OldPrice, &c.Category, &c.Images, &c.IsActive, &c.ShopName, &c.ShopSlug)
				if !seen[c.ID] {
					seen[c.ID] = true
					candidates = append(candidates, c)
				}
			}
			rows.Close()
		}
	}

	// Score and rank
	type rankedItem struct {
		SmartSearchItem
		productIndex int
	}
	var ranked []rankedItem
	shopSet := map[string]string{} // slug -> name
	for i, c := range candidates {
		score, explanation := scoreSmartProduct(c.Name, c.Description, c.Benefits, c.Category, c.Price, intent)
		if score > 0 {
			ranked = append(ranked, rankedItem{
				SmartSearchItem: SmartSearchItem{
					ID:          c.ID,
					Name:        c.Name,
					Price:       c.Price,
					Category:    c.Category,
					ShopName:    c.ShopName,
					ShopSlug:    c.ShopSlug,
					Score:       score,
					Explanation: explanation,
				},
				productIndex: i,
			})
			shopSet[c.ShopSlug] = c.ShopName
		}
	}

	// Sort by score desc
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].Score > ranked[j].Score })
	if len(ranked) > req.Limit {
		ranked = ranked[:req.Limit]
	}

	var items []SmartSearchItem
	for _, ri := range ranked {
		items = append(items, ri.SmartSearchItem)
	}

	type shopEntry struct {
		Slug string `json:"slug"`
		Name string `json:"name"`
	}
	var shops []shopEntry
	for slug, name := range shopSet {
		if len(shops) < 10 {
			shops = append(shops, shopEntry{Slug: slug, Name: name})
		}
	}

	summary := generateSmartSummary(intent, len(items), shopKeys(shopSet))
	suggestions := generateSmartSuggestions(intent)

	jsonOK(w, map[string]interface{}{
		"query":       query,
		"mode":        "fallback",
		"intent":      intent,
		"summary":     summary,
		"products":    items,
		"shops":       shops,
		"suggestions": suggestions,
	})
}

func hasValidImages(images []string) bool {
	for _, img := range images {
		if strings.TrimSpace(img) != "" {
			return true
		}
	}
	return false
}

func normalizeImages(images []string) []string {
	var out []string
	for _, img := range images {
		img = strings.TrimSpace(img)
		if img != "" {
			out = append(out, img)
		}
	}
	return out
}

func shopKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// ═══════════════════════════════════════════════
//  ASSISTANT CHAT — rule-based buyer AI
// ═══════════════════════════════════════════════

func (a *App) handleAssistantChat(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "AI-ассистент доступен после входа")
		return
	}
	if claims.Role == "business" {
		jsonErr(w, 403, "AI-ассистент покупателя доступен аккаунту покупателя. Для продавца используйте AI Sales Copilot в кабинете бизнеса.")
		return
	}

	var req struct {
		Message string `json:"message"`
		Context struct {
			CompareIDs     []string `json:"compareIds"`
			LastProductIDs []string `json:"lastProductIds"`
		} `json:"context"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	msg := sanitizeUserMessage(req.Message, 3000)
	if msg == "" {
		jsonErr(w, 400, "Введите сообщение")
		return
	}
	msg = normalizeMessage(msg)

	reply := ""
	intent := "fallback"
	var products []map[string]interface{}
	var recommendations []map[string]interface{}
	var comparison map[string]interface{}
	suggestions := []string{}

	// Parse price
	maxPrice := parseAssistantMaxPrice(msg)
	minPrice := parseAssistantMinPrice(msg)

	// Detect productType from message
	detectedPT := detectProductType(msg)

	// Detect compare intent
	isCompare := containsAny(msg, "сравн", "что лучше", "какой лучше", "выбери лучш", "чем отличает", "посовету")
	hasCompareCtx := len(req.Context.CompareIDs) >= 2

	// Detect ordinal references: "первый", "второй", "третий"
	ordinalIdx := detectOrdinal(msg)
	hasOrdinal := ordinalIdx >= 0 && ordinalIdx < len(req.Context.LastProductIDs)

	// Detect intents — isProductQ only valid with ordinal context or lastRecId
	isProductQ := hasOrdinal && containsAny(msg, "подробн", "расскаж", "доставк", "бренд", "характеристик", "плюс", "минус", "почему", "описан", "цен", "состоян", "цвет", "срок")
	isCheckout := containsAny(msg, "заказат", "купит", "оформит", "беру")
	isContactReq := containsAny(msg, "напиши продавц", "связатьс", "спроси продавц", "задай вопрос")

	if isCompare && hasCompareCtx {
		intent = "compare_products"
		products, recommendations, comparison, reply = a.assistantCompareProducts(req.Context.CompareIDs)
		jsonOK(w, map[string]interface{}{
			"reply":           reply,
			"intent":          intent,
			"products":        products,
			"recommendations": recommendations,
			"comparison":      comparison,
			"suggestions":     suggestions,
		})
		return
	} else if hasOrdinal && isProductQ {
		intent = "product_question"
		products, reply = a.assistantProductQuestion(req.Context.LastProductIDs, ordinalIdx)
	} else if isCompare && ordinalIdx < 0 && len(req.Context.LastProductIDs) >= 2 {
		intent = "compare_products"
		products, recommendations, comparison, reply = a.assistantCompareProducts(req.Context.LastProductIDs)
		if comparison == nil {
			reply = "Пока у меня только один товар в контексте. Напишите, что хотите найти, чтобы я подобрал варианты."
		} else {
			jsonOK(w, map[string]interface{}{
				"reply":           reply,
				"intent":          intent,
				"products":        products,
				"recommendations": recommendations,
				"comparison":      comparison,
				"suggestions":     suggestions,
			})
			return
		}
	} else if hasOrdinal && isContactReq {
		intent = "contact_seller_instruction"
		products, reply = a.assistantOrdinalProduct(req.Context.LastProductIDs, ordinalIdx, "contact")
	} else if hasOrdinal && isCheckout {
		intent = "checkout_instruction"
		products, reply = a.assistantOrdinalProduct(req.Context.LastProductIDs, ordinalIdx, "checkout")
	} else if isCheckout && !hasOrdinal {
		intent = "checkout_help"
		reply = "Чтобы оформить заказ в AGENT.ONE: выберите товар, добавьте его в корзину и нажмите «Перейти к оформлению». Сейчас онлайн-оплата отключена, поэтому доступны способы оформления через продавца: наличные, счёт или договорённость с продавцом."
	} else {
		// Search products and optionally use AI gateway
		intent = "search_products"
		products = searchAssistantProducts(a, req.Message, detectedPT, maxPrice, minPrice)
		if len(products) == 0 && (maxPrice != nil || minPrice != nil) {
			products = searchAssistantProducts(a, req.Message, detectedPT, nil, nil)
			if len(products) > 0 {
				reply = "С ограничением по цене ничего не найдено. Вот подходящие товары без учёта бюджета:"
			}
		}

		// Build AI context
		aiCatalog := make([]AIProductContext, 0, len(products))
		for _, p := range products {
			price, _ := strconv.Atoi(fmt.Sprintf("%v", p["price"]))
			aiCatalog = append(aiCatalog, AIProductContext{
				ID:         fmt.Sprintf("%v", p["id"]),
				Name:       fmt.Sprintf("%v", p["name"]),
				Price:      price,
				Category:   fmt.Sprintf("%v", p["category"]),
				Brand:      fmt.Sprintf("%v", p["brand"]),
				Condition:  fmt.Sprintf("%v", p["condition"]),
				ImageCount: 1,
			})
		}

		aiReq := AIRequest{
			Scenario:    ScenarioBuyerAssistant,
			UserMessage: msg,
			Catalog:     aiCatalog,
			Language:    "ru",
			Temperature: 0.3,
		}
		aiResp, _ := a.aiProvider.Generate(r.Context(), aiReq)
		if aiResp.Text != "" {
			reply = aiResp.Text
			if aiResp.UsedFallback && len(products) > 0 && reply == safeUnknownAnswer() {
				reply = fmt.Sprintf("Нашёл %d товаров по вашему запросу:", len(products))
			}
		} else if len(products) > 0 {
			reply = fmt.Sprintf("Нашёл %d товаров по вашему запросу:", len(products))
			suggestions = []string{"Сравни мои товары", "Что лучше выбрать"}
		} else {
			reply = "По запросу ничего не найдено. Попробуйте изменить бюджет, категорию или характеристики."
			suggestions = []string{"Хочу телефон", "Нужен ноутбук для игр", "Как оформить заказ?"}
		}
	}

	jsonOK(w, map[string]interface{}{
		"reply":           reply,
		"intent":          intent,
		"products":        products,
		"recommendations": recommendations,
		"comparison":      comparison,
		"suggestions":     suggestions,
	})
}

func (a *App) assistantCompareProducts(ids []string) (products []map[string]interface{}, recommendations []map[string]interface{}, comparison map[string]interface{}, reply string) {
	type cp struct {
		ID, Name, ShopName, Images, Brand, Condition, DeliveryTerm string
		Price                                                      int
		Pros                                                       []string
	}
	var cps []cp
	for _, id := range ids {
		var p cp
		if err := a.db.QueryRow(a.ctx, "SELECT p.id, p.name, p.price, s.name, COALESCE(array_to_json(p.images), '[]')::text, COALESCE(p.brand,''), COALESCE(p.condition,'new'), COALESCE(p.delivery_term,'') FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", id).Scan(&p.ID, &p.Name, &p.Price, &p.ShopName, &p.Images, &p.Brand, &p.Condition, &p.DeliveryTerm); err == nil {
			cps = append(cps, p)
		}
	}
	if len(cps) < 2 {
		return nil, nil, nil, ""
	}
	minP, maxP := cps[0].Price, cps[0].Price
	for _, p := range cps[1:] {
		if p.Price < minP {
			minP = p.Price
		}
		if p.Price > maxP {
			maxP = p.Price
		}
	}
	for pi := range cps {
		var pros []string
		if cps[pi].Price == minP && minP < maxP {
			pros = append(pros, "Лучшая цена")
		}
		if cps[pi].Brand != "" {
			pros = append(pros, "Бренд: "+cps[pi].Brand)
		}
		if cps[pi].DeliveryTerm != "" && strings.Contains(cps[pi].DeliveryTerm, "1–2") {
			pros = append(pros, "Быстрая доставка")
		}
		if cps[pi].Condition == "new" {
			pros = append(pros, "Новое состояние")
		}
		cps[pi].Pros = pros
	}
	best := cps[0]
	for _, p := range cps[1:] {
		if p.Price < best.Price && p.Price > 0 {
			best = p
		}
	}
	reply = fmt.Sprintf("Я сравнил %d товаров по данным карточек. Лучший вариант — «%s» (%d ₽).", len(cps), best.Name, best.Price)
	recommendations = append(recommendations, map[string]interface{}{"productId": best.ID, "id": best.ID, "name": best.Name, "price": best.Price, "shopName": best.ShopName, "images": parsePGImages(best.Images), "reason": "Оптимальный выбор по цене и полноте данных", "pros": best.Pros})
	var compItems []map[string]interface{}
	for _, p := range cps {
		compItems = append(compItems, map[string]interface{}{"id": p.ID, "name": p.Name, "price": p.Price, "shopName": p.ShopName, "images": parsePGImages(p.Images), "brand": p.Brand, "condition": p.Condition, "deliveryTerm": p.DeliveryTerm, "pros": p.Pros})
	}
	comparison = map[string]interface{}{"items": compItems}
	return
}

func (a *App) assistantProductQuestion(ids []string, ordinalIdx int) (products []map[string]interface{}, reply string) {
	prodID := ids[ordinalIdx]
	var name, shopName, brand, color, cond, delivery, desc, imagesRaw string
	var price int
	err := a.db.QueryRow(a.ctx, "SELECT p.name, p.price, COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.condition,'new'), COALESCE(p.delivery_term,''), COALESCE(p.description,''), COALESCE(array_to_json(p.images), '[]')::text, s.name FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", prodID).Scan(&name, &price, &brand, &color, &cond, &delivery, &desc, &imagesRaw, &shopName)
	if err == nil {
		reply = fmt.Sprintf("Товар №%d — «%s». Цена — %d ₽. Магазин — %s.", ordinalIdx+1, name, price, shopName)
		if brand != "" {
			reply += " Бренд — " + brand + "."
		}
		if color != "" {
			reply += " Цвет — " + color + "."
		}
		if cond == "new" {
			reply += " Состояние — новое."
		} else if cond == "used" {
			reply += " Состояние — б/у."
		}
		if delivery != "" {
			reply += " Доставка — " + delivery + "."
		}
		products = append(products, map[string]interface{}{"id": prodID, "name": name, "price": price, "shopName": shopName, "images": parsePGImages(imagesRaw)})
	} else {
		reply = "Этот товар больше недоступен."
	}
	return
}

func (a *App) assistantOrdinalProduct(ids []string, ordinalIdx int, kind string) (products []map[string]interface{}, reply string) {
	prodID := ids[ordinalIdx]
	var name, shopName, imagesRaw string
	var price int
	if err := a.db.QueryRow(a.ctx, "SELECT p.name, p.price, s.name, COALESCE(array_to_json(p.images), '[]')::text FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", prodID).Scan(&name, &price, &shopName, &imagesRaw); err == nil {
		products = append(products, map[string]interface{}{"productId": prodID, "id": prodID, "name": name, "price": price, "shopName": shopName, "images": parsePGImages(imagesRaw)})
		if kind == "contact" {
			reply = fmt.Sprintf("По товару «%s» (%d ₽) — вы можете написать продавцу. Используйте кнопку «Выбрать».", name, price)
		} else {
			reply = fmt.Sprintf("Вы выбрали «%s» (%d ₽). Можете добавить в корзину, перейти к оформлению или написать продавцу.", name, price)
		}
	} else {
		reply = "Этот товар больше недоступен."
	}
	return
}

// parsePGImages parses a JSON array string like ["url1","url2"] into a Go string slice.
// Safe for empty strings, null, and malformed input.
func parsePGImages(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" || raw == "null" {
		return []string{}
	}
	var arr []string
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return []string{}
	}
	return arr
}

func detectOrdinal(msg string) int {
	ordinals := map[string]int{"перв": 0, "1": 0, "один": 0, "втор": 1, "2": 1, "трет": 2, "3": 2}
	for k, v := range ordinals {
		if strings.Contains(msg, k) {
			return v
		}
	}
	return -1
}
func normalizeMessage(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, r := range []string{".", ",", "!", "?", ":", ";", "(", ")", "\"", "'"} {
		s = strings.ReplaceAll(s, r, " ")
	}
	return strings.Join(strings.Fields(s), " ")
}

// containsAny returns true if msg contains any of the given substrs
func containsAny(msg string, substrs ...string) bool {
	for _, s := range substrs {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

// productTypeSynonyms maps keywords to product_type values
var productTypeSynonyms = map[string][]string{
	"phone":      {"телефон", "смартфон", "айфон", "iphone", "мобильн"},
	"laptop":     {"ноутбук", "laptop", "ноут", "игров"},
	"headphones": {"наушник", "airpods", "гарнитур", "headphones"},
	"watch":      {"часы", "watch", "smartwatch"},
	"speaker":    {"колонк", "speaker", "акустик", "jbl"},
	"monitor":    {"монитор", "экран", "дисплей", "display"},
	"keyboard":   {"клавиатур", "keyboard"},
	"console":    {"приставк", "консол", "ps5", "playstation", "xbox"},
}

func detectProductType(msg string) string {
	for pt, keywords := range productTypeSynonyms {
		for _, kw := range keywords {
			if strings.Contains(msg, kw) {
				return pt
			}
		}
	}
	return ""
}

func parseAssistantMaxPrice(msg string) *int {
	re := regexp.MustCompile(`до\s+(\d[\d\s.,]*)\s*(тыс(?:яч[ьей])?|т\.?\s*р\.?|k|млн|миллион(?:ов|а)?)?`)
	m := re.FindStringSubmatch(msg)
	if m == nil {
		return nil
	}
	s := strings.NewReplacer(" ", "", "\u00a0", "").Replace(m[1])
	mul := 1
	if u := m[2]; u != "" {
		if strings.Contains(u, "млн") || strings.Contains(u, "миллион") {
			mul = 1000000
		}
		if strings.Contains(u, "тыс") || strings.Contains(u, "k") || strings.Contains(u, "т.") {
			mul = 1000
		}
	}
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		r := v * mul
		return &r
	}
	s = strings.ReplaceAll(s, ",", ".")
	if v, err := strconv.ParseFloat(s, 64); err == nil && v > 0 {
		r := int(v * float64(mul))
		return &r
	}
	return nil
}

func parseAssistantMinPrice(msg string) *int {
	re := regexp.MustCompile(`от\s+(\d[\d\s.,]*)\s*(тыс(?:яч[ьей])?|т\.?\s*р\.?|k|млн|миллион(?:ов|а)?)?`)
	m := re.FindStringSubmatch(msg)
	if m == nil {
		return nil
	}
	s := strings.NewReplacer(" ", "", "\u00a0", "").Replace(m[1])
	mul := 1
	if u := m[2]; u != "" {
		if strings.Contains(u, "млн") || strings.Contains(u, "миллион") {
			mul = 1000000
		}
		if strings.Contains(u, "тыс") || strings.Contains(u, "k") || strings.Contains(u, "т.") {
			mul = 1000
		}
	}
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		r := v * mul
		return &r
	}
	return nil
}

func searchAssistantProducts(a *App, query string, detectedPT string, maxPrice, minPrice *int) []map[string]interface{} {
	// Build parameterized query with scoring
	args := []interface{}{}
	idx := 1
	scoreParts := []string{}
	whereParts := []string{"p.is_active=true", "s.is_published=true", "COALESCE(array_length(p.images, 1), 0) > 0"}

	// Product type filter
	if detectedPT != "" {
		whereParts = append(whereParts, fmt.Sprintf("LOWER(COALESCE(p.product_type,'')) = $%d", idx))
		args = append(args, detectedPT)
		idx++
		scoreParts = append(scoreParts, fmt.Sprintf("CASE WHEN LOWER(COALESCE(p.product_type,'')) = $%d THEN 10 ELSE 0 END", idx-1))
	}

	// Smart token search — use same alias expansion as catalog search
	if query != "" {
		smartWhere, smartArgs, newIdx := smartSearchWhere(query, idx)
		if smartWhere != "" {
			whereParts = append(whereParts, smartWhere)
			args = append(args, smartArgs...)
			idx = newIdx
		}
		// Smart scoring
		scoreSQL, scoreArgs, _ := smartSearchScore(query, idx)
		if scoreSQL != "" {
			scoreParts = append(scoreParts, scoreSQL)
			args = append(args, scoreArgs...)
		}
	}

	// If no filters at all, search broadly
	if len(whereParts) == 2 {
		// No filters applied — get any active products sorted by popularity/price
		simpleQuery := "SELECT p.id, p.name, p.price, s.name, s.slug, p.category, COALESCE(array_to_json(p.images), '[]')::text, COALESCE(p.brand,''), COALESCE(p.condition,'new') FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.is_active=true AND s.is_published=true ORDER BY p.popularity_score DESC, p.price ASC LIMIT 5"
		rows, err := a.db.Query(a.ctx, simpleQuery)
		if err != nil {
			return nil
		}
		defer rows.Close()
		var result []map[string]interface{}
		for rows.Next() {
			var id, name, shopName, shopSlug, cat, imagesRaw, brand, condition string
			var price int
			rows.Scan(&id, &name, &price, &shopName, &shopSlug, &cat, &imagesRaw, &brand, &condition)
			var images []string
			json.Unmarshal([]byte(imagesRaw), &images)
			if images == nil {
				images = []string{}
			}
			result = append(result, map[string]interface{}{"id": id, "name": name, "price": price, "shopName": shopName, "shopSlug": shopSlug, "category": cat, "images": images, "brand": brand, "condition": condition})
		}
		return result
	}

	// Filter by price
	if maxPrice != nil {
		whereParts = append(whereParts, fmt.Sprintf("p.price <= $%d", idx))
		args = append(args, *maxPrice)
		idx++
	}
	if minPrice != nil {
		whereParts = append(whereParts, fmt.Sprintf("p.price >= $%d", idx))
		args = append(args, *minPrice)
		idx++
	}

	orderBy := "p.id DESC"
	if len(scoreParts) > 0 {
		orderBy = "(" + strings.Join(scoreParts, " + ") + ") DESC, p.price ASC"
	}

	q := fmt.Sprintf("SELECT p.id, p.name, p.price, s.name, s.slug, p.category, COALESCE(array_to_json(p.images), '[]')::text, COALESCE(p.brand,''), COALESCE(p.condition,'new') FROM products p JOIN shops s ON p.shop_id=s.id WHERE %s ORDER BY %s LIMIT 5",
		strings.Join(whereParts, " AND "), orderBy)

	rows, err := a.db.Query(a.ctx, q, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var id, name, shopName, shopSlug, cat, imagesRaw, brand, condition string
		var price int
		rows.Scan(&id, &name, &price, &shopName, &shopSlug, &cat, &imagesRaw, &brand, &condition)
		var images []string
		json.Unmarshal([]byte(imagesRaw), &images)
		if images == nil {
			images = []string{}
		}
		result = append(result, map[string]interface{}{"id": id, "name": name, "price": price, "shopName": shopName, "shopSlug": shopSlug, "category": cat, "images": images, "brand": brand, "condition": condition})
	}
	return result
}

func (a *App) handleMyShop(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	var shop Shop
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).
		Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	if err != nil {
		jsonOK(w, map[string]interface{}{"shop": nil})
		return
	}
	rows, _ := a.db.Query(a.ctx, "SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active, COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''), COALESCE(keyboard_type,''), COALESCE(keyboard_connection,''), COALESCE(condition,'new'), popularity_score, COALESCE(rating_avg,0), COALESCE(created_at::text,'') FROM products WHERE shop_id=$1 AND is_active=true", shop.ID)
	defer rows.Close()
	var products []ExProduct
	for rows.Next() {
		var p ExProduct
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt)
		products = append(products, p)
	}

	// Stats for editor preview
	var ordersCount, reviewsCount, ratingSum, followersCount int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1 AND order_status!='cancelled'", shop.ID).Scan(&ordersCount)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*), COALESCE(SUM(rating),0) FROM shop_reviews WHERE shop_id=$1", shop.ID).Scan(&reviewsCount, &ratingSum)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shop_followers WHERE shop_id=$1", shop.ID).Scan(&followersCount)

	ratingAvg := 0.0
	if reviewsCount > 0 {
		ratingAvg = float64(ratingSum) / float64(reviewsCount)
	}

	trustStatus := "new"
	if ordersCount > 0 {
		trustStatus = "reliable"
	}

	joinedYear := ""
	if shop.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, shop.CreatedAt); err == nil {
			joinedYear = fmt.Sprintf("%d", t.Year())
		} else if t2, err := time.Parse("2006-01-02T15:04:05Z", shop.CreatedAt); err == nil {
			joinedYear = fmt.Sprintf("%d", t2.Year())
		} else if len(shop.CreatedAt) >= 4 {
			joinedYear = shop.CreatedAt[:4]
		}
	}

	jsonOK(w, map[string]interface{}{
		"shop":           shop,
		"products":       products,
		"ordersCount":    ordersCount,
		"ratingAvg":      ratingAvg,
		"reviewsCount":   reviewsCount,
		"followersCount": followersCount,
		"trustStatus":    trustStatus,
		"joinedYear":     joinedYear,
	})
}

func (a *App) handleCreateProduct(w http.ResponseWriter, r *http.Request) {
	claims, _, ok := a.requireApprovedBusinessShop(w, r)
	if !ok {
		return
	}
	var req struct {
		ShopID             string   `json:"shopId"`
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Benefits           []string `json:"benefits"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images"`
		IsActive           *bool    `json:"isActive,omitempty"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		ProductType        string   `json:"productType,omitempty"`
		SearchKeywords     string   `json:"searchKeywords,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	var ownerID string
	a.db.QueryRow(a.ctx, "SELECT owner_id FROM shops WHERE id=$1", req.ShopID).Scan(&ownerID)
	if ownerID != claims.Sub {
		jsonErr(w, 403, "not your shop")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	cond := req.Condition
	if cond == "" {
		cond = "new"
	}
	if cond != "new" && cond != "used" {
		jsonErr(w, 400, "condition должен быть new или used")
		return
	}
	// Auto-fill productType and searchKeywords if empty
	pt := strings.TrimSpace(req.ProductType)
	if pt == "" {
		pt = inferProductType(req.Name, req.Description, req.Category, req.Brand)
	}
	kw := strings.TrimSpace(req.SearchKeywords)
	if kw == "" {
		kw = buildSearchKeywords(req.Name, req.Description, req.Brand, req.Category, pt, req.Color, req.KeyboardType, req.KeyboardConnection, req.Benefits)
	}
	id := newID()
	a.db.Exec(a.ctx, "INSERT INTO products (id, shop_id, name, description, benefits, price, old_price, category, images, is_active, brand, color, delivery_term, keyboard_type, keyboard_connection, condition, product_type, search_keywords) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)", id, req.ShopID, req.Name, req.Description, req.Benefits, req.Price, req.OldPrice, req.Category, req.Images, isActive, req.Brand, req.Color, req.DeliveryTerm, req.KeyboardType, req.KeyboardConnection, cond, pt, kw)
	a.recordAuditEvent(r, claims.Sub, claims.Role, "product.created", "product", id, req.ShopID, map[string]interface{}{"name": req.Name, "price": req.Price})
	jsonOK(w, map[string]interface{}{"product": map[string]interface{}{"id": id}})
}

// ═══════════════════════════════════════════════
//  SMART SEARCH — alias expansion, token search, scoring
// ═══════════════════════════════════════════════

// searchAliases maps user-facing terms to DB-searchable tokens.
// Keys and values are all lowercase (no spaces).
// Future products match via DB fields — aliases only bridge user language → DB columns.
var searchAliases = map[string][]string{
	// Apple / iPhone
	"айфон":  {"iphone", "apple", "смартфон", "телефон"},
	"айфоны": {"iphone", "apple", "смартфон", "телефон"},
	"айфн":   {"iphone"},
	"iphon":  {"iphone"},
	"iphone": {"iphone", "apple", "айфон", "смартфон"},

	// MacBook
	"макбук":   {"macbook", "apple", "ноутбук"},
	"мак":      {"macbook", "apple"},
	"macbook":  {"macbook", "apple", "макбук", "ноутбук"},
	"mackbook": {"macbook"},
	"макбуук":  {"macbook"},

	// Smartphone
	"смартфон": {"смартфон", "телефон", "iphone", "samsung", "xiaomi", "телефон"},
	"телефон":  {"смартфон", "телефон", "iphone", "samsung", "xiaomi"},
	"мобила":   {"смартфон", "телефон"},
	"смарт":    {"смартфон"},

	// Gaming / PC
	"игровой":     {"gaming", "rtx", "компьютер", "пк", "игровой"},
	"игровойпк":   {"gaming", "rtx", "компьютер", "пк"},
	"игровой пк":  {"gaming", "rtx", "компьютер", "пк"},
	"комп":        {"компьютер", "пк", "pc", "gaming"},
	"компьютер":   {"пк", "pc", "gaming", "компьютер"},
	"пк":          {"компьютер", "pc", "gaming"},
	"pc":          {"пк", "компьютер", "gaming"},
	"rtx":         {"rtx", "gaming", "видеокарта"},
	"игровойкомп": {"gaming", "rtx", "компьютер", "пк"},

	// Laptop
	"ноут":    {"ноутбук", "laptop"},
	"ноутбук": {"laptop", "ноутбук", "macbook", "asus", "lenovo", "msi", "acer"},
	"laptop":  {"ноутбук", "laptop", "macbook", "asus", "lenovo", "msi", "acer"},
	"лэптоп":  {"ноутбук", "laptop"},
	"ноутбу":  {"ноутбук", "laptop"},

	// Brands
	"асус":      {"asus"},
	"леново":    {"lenovo"},
	"самсунг":   {"samsung"},
	"сяоми":     {"xiaomi"},
	"ксяоми":    {"xiaomi"},
	"ксайоми":   {"xiaomi"},
	"эйсер":     {"acer"},
	"гигабайт":  {"gigabyte"},
	"сони":      {"sony"},
	"яндекс":    {"yandex"},
	"самсун":    {"samsung"},
	"ленов":     {"lenovo"},
	"сяом":      {"xiaomi"},
	"ксиаоми":   {"xiaomi"},
	"hp":        {"hewlettpackard", "hewlett", "packard"},
	"msi":       {"msi"},
	"razer":     {"razer"},
	"logitech":  {"logitech"},
	"логитек":   {"logitech"},
	"джейбиэль": {"jbl"},
	"jbl":       {"jbl"},

	// Smart home
	"умныйдом":    {"смарт", "камера", "датчик", "колонка", "роутер", "ламп"},
	"умного дома": {"смарт", "камера", "датчик", "колонка", "роутер", "ламп"},
	"камера":      {"camera", "камера", "видеокамера"},
	"роутер":      {"router", "wifi", "роутер"},
	"колонка":     {"speaker", "jbl", "yandex", "станция"},
	"станция":     {"yandex", "колонка"},
	"датчик":      {"датчик", "sensor", "смарт"},
	"смартхаб":    {"смарт", "хаб", "контроллер"},
	"реле":        {"смарт", "выключатель", "switch"},

	// Accessories
	"наушники":  {"наушники", "headphones", "airpods", "гарнитур"},
	"airpods":   {"airpods", "наушники", "apple"},
	"зарядка":   {"зарядка", "charger", "adapter", "power"},
	"адаптер":   {"адаптер", "charger", "adapter", "power"},
	"гарнитура": {"наушники", "headphones"},

	// General
	"дешево":        {"бюджет"},
	"недорого":      {"бюджет"},
	"бюджетный":     {"бюджет"},
	"профессиональ": {"professional", "pro"},
	"ультра":        {"ultra", "pro"},
	"планшет":       {"планшет", "ipad", "tablet"},
	"ipad":          {"ipad", "планшет", "tablet", "apple"},
	"часы":          {"часы", "watch", "смарт"},
	"watch":         {"watch", "часы", "apple"},
	"клавиатура":    {"keyboard", "клавиатура"},
	"keyboard":      {"keyboard", "клавиатура"},
	"мышь":          {"mouse", "мышь"},
	"мышка":         {"mouse", "мышь"},
	"монитор":       {"монитор", "monitor", "экран", "display"},
	"экран":         {"монитор", "monitor", "display"},
	"приставка":     {"приставка", "console", "ps5", "playstation", "xbox"},
	"консоль":       {"console", "приставка", "ps5", "playstation", "xbox"},
	"ps5":           {"ps5", "playstation", "console", "приставка"},
	"playstation":   {"playstation", "ps5", "console"},
	"xbox":          {"xbox", "console", "приставка"},
}

// normalizeSearchText trims, lowercases, replaces ё→е, collapses whitespace.
func normalizeSearchText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "ё", "е")
	// Collapse multiple spaces
	s = strings.Join(strings.Fields(s), " ")
	return s
}

// expandSearchTokens takes a raw query, normalizes it, returns unique search tokens
// including original words + alias expansions.
func expandSearchTokens(raw string) []string {
	norm := normalizeSearchText(raw)
	if norm == "" {
		return nil
	}
	seen := map[string]bool{}
	// Split into words
	words := strings.Fields(norm)
	for _, w := range words {
		seen[w] = true
	}
	// Check multi-word phrases (up to 3-grams)
	phraseParts := strings.Fields(norm)
	for l := 2; l <= 3; l++ {
		for i := 0; i+l <= len(phraseParts); i++ {
			phrase := strings.Join(phraseParts[i:i+l], "")
			if aliases, ok := searchAliases[phrase]; ok {
				for _, a := range aliases {
					seen[a] = true
				}
			}
		}
	}
	// Check single words against aliases (space-free)
	for _, w := range words {
		if aliases, ok := searchAliases[w]; ok {
			for _, a := range aliases {
				seen[a] = true
			}
		}
	}
	// Also check full phrase
	if aliases, ok := searchAliases[strings.Join(words, "")]; ok {
		for _, a := range aliases {
			seen[a] = true
		}
	}
	tokens := make([]string, 0, len(seen))
	for t := range seen {
		tokens = append(tokens, t)
	}
	// Always include original normalized words too
	return tokens
}

// parseSearchBudget extracts max price from query (e.g. "до 100000", "не дороже 50000")
func parseSearchBudget(q string) *int {
	re := regexp.MustCompile(`(?:до|не\s+дороже)\s+(\d[\d\s.]*?)(?:\s*(?:тыс|т\.?\s*р\.?|k|руб|р\.?|₽))?`)
	m := re.FindStringSubmatch(strings.ToLower(q))
	if m == nil {
		return nil
	}
	s := strings.NewReplacer(" ", "", "\u00a0", "", ".", "").Replace(m[1])
	if v, err := strconv.Atoi(s); err == nil && v > 0 {
		return &v
	}
	return nil
}

// smartSearchWhere replaces the simple LIKE search in buildFilterWhere.
// Returns (extra_where_clause, args_slice, next_arg_idx).
// Uses token expansion + parameterized ILIKE across all product fields.
func smartSearchWhere(q string, idx int) (string, []interface{}, int) {
	tokens := expandSearchTokens(q)
	if len(tokens) == 0 {
		return "", nil, idx
	}

	// Deduplicate tokens
	seen := map[string]bool{}
	var uniq []string
	for _, t := range tokens {
		if len(t) < 2 || seen[t] {
			continue
		}
		seen[t] = true
		uniq = append(uniq, t)
	}
	if len(uniq) == 0 {
		return "", nil, idx
	}

	// Build OR clauses: each token searched across all fields with ILIKE
	clauses := make([]string, 0, len(uniq))
	args := make([]interface{}, 0, len(uniq))

	for _, token := range uniq {
		likeVal := "%" + token + "%"
		clauses = append(clauses, fmt.Sprintf(
			"(LOWER(p.name) LIKE $%d ESCAPE '\\' OR LOWER(COALESCE(p.brand,'')) LIKE $%d ESCAPE '\\' OR LOWER(p.category) LIKE $%d ESCAPE '\\' OR LOWER(COALESCE(p.product_type,'')) LIKE $%d ESCAPE '\\' OR LOWER(COALESCE(p.search_keywords,'')) LIKE $%d ESCAPE '\\' OR LOWER(p.description) LIKE $%d ESCAPE '\\')",
			idx, idx, idx, idx, idx, idx,
		))
		args = append(args, likeVal)
		idx++
	}

	return "(" + strings.Join(clauses, " OR ") + ")", args, idx
}

// smartSearchScore builds an ORDER BY expression for token-based relevance scoring.
// Uses parameterized placeholders for safety.
// Returns (order_by_sql, extra_args, next_arg_idx).
func smartSearchScore(q string, idx int) (string, []interface{}, int) {
	tokens := expandSearchTokens(q)
	if len(tokens) == 0 {
		return "", nil, idx
	}

	seen := map[string]bool{}
	var uniq []string
	for _, t := range tokens {
		if len(t) < 2 || seen[t] {
			continue
		}
		seen[t] = true
		uniq = append(uniq, t)
	}
	if len(uniq) == 0 {
		return "", nil, idx
	}

	args := make([]interface{}, 0, len(uniq))
	scoreParts := make([]string, 0, len(uniq)*6)

	for _, token := range uniq {
		likeVal := "%" + token + "%"

		scoreParts = append(scoreParts, fmt.Sprintf(
			"CASE WHEN LOWER(p.name) = $%d THEN 100 WHEN LOWER(p.name) LIKE $%d THEN 50 WHEN LOWER(COALESCE(p.product_type,'')) LIKE $%d THEN 35 WHEN LOWER(COALESCE(p.search_keywords,'')) LIKE $%d THEN 30 WHEN LOWER(COALESCE(p.brand,'')) = $%d THEN 25 WHEN LOWER(p.category) LIKE $%d THEN 20 WHEN LOWER(p.description) LIKE $%d THEN 10 ELSE 0 END",
			idx, idx, idx, idx, idx, idx, idx,
		))
		args = append(args, likeVal)
		idx++
	}

	return "(" + strings.Join(scoreParts, " + ") + ")", args, idx
}

// ═══════════════════════════════════════════════
//  PRODUCTS — общий каталог
// ═══════════════════════════════════════════════

// buildFilterWhere — shared WHERE builder used by /api/products and /api/catalog/facets.
// excludeField: omit this filter from WHERE (for facet self-exclusion: e.g. "brand" facet excludes brand filter).
func buildFilterWhere(r *http.Request, excludeField string) (string, []interface{}, int) {
	where := "WHERE p.is_active=true AND s.is_published=true AND COALESCE(array_length(p.images, 1), 0) > 0"
	var args []interface{}
	idx := 1

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) > 300 {
		q = q[:300]
	}
	if q != "" && excludeField != "q" {
		smartWhere, smartArgs, _ := smartSearchWhere(q, idx)
		if smartWhere != "" {
			where += " AND " + smartWhere
			args = append(args, smartArgs...)
			idx += len(smartArgs)
		}
	}

	category := r.URL.Query().Get("category")
	if category != "" && excludeField != "category" {
		where += fmt.Sprintf(" AND p.category=$%d", idx)
		args = append(args, category)
		idx++
	}

	minPrice := r.URL.Query().Get("minPrice")
	if minPrice != "" && excludeField != "price" {
		if v, err := strconv.Atoi(minPrice); err == nil && v >= 0 {
			where += fmt.Sprintf(" AND p.price >= $%d", idx)
			args = append(args, v)
			idx++
		}
	}

	maxPrice := r.URL.Query().Get("maxPrice")
	if maxPrice != "" && excludeField != "price" {
		if v, err := strconv.Atoi(maxPrice); err == nil && v >= 0 {
			where += fmt.Sprintf(" AND p.price <= $%d", idx)
			args = append(args, v)
			idx++
		}
	}

	brand := r.URL.Query().Get("brand")
	if brand != "" && excludeField != "brand" {
		brands := parseCSV(brand)
		if len(brands) > 0 {
			phs := make([]string, len(brands))
			for i, b := range brands {
				phs[i] = fmt.Sprintf("$%d", idx)
				args = append(args, b)
				idx++
			}
			where += fmt.Sprintf(" AND LOWER(COALESCE(p.brand,'')) IN (%s)", strings.Join(phs, ","))
		}
	}

	color := r.URL.Query().Get("color")
	if color != "" && excludeField != "color" {
		colors := parseCSV(color)
		if len(colors) > 0 {
			phs := make([]string, len(colors))
			for i, c := range colors {
				phs[i] = fmt.Sprintf("$%d", idx)
				args = append(args, c)
				idx++
			}
			where += fmt.Sprintf(" AND LOWER(COALESCE(p.color,'')) IN (%s)", strings.Join(phs, ","))
		}
	}

	deliveryTerm := r.URL.Query().Get("deliveryTerm")
	if deliveryTerm != "" && excludeField != "deliveryTerm" {
		terms := parseCSV(deliveryTerm)
		if len(terms) > 0 {
			phs := make([]string, len(terms))
			for i, t := range terms {
				phs[i] = fmt.Sprintf("$%d", idx)
				args = append(args, t)
				idx++
			}
			where += fmt.Sprintf(" AND LOWER(COALESCE(p.delivery_term,'')) IN (%s)", strings.Join(phs, ","))
		}
	}

	keyboardType := r.URL.Query().Get("keyboardType")
	if keyboardType != "" && excludeField != "keyboardType" {
		types := parseCSV(keyboardType)
		if len(types) > 0 {
			phs := make([]string, len(types))
			for i, t := range types {
				phs[i] = fmt.Sprintf("$%d", idx)
				args = append(args, t)
				idx++
			}
			where += fmt.Sprintf(" AND LOWER(COALESCE(p.keyboard_type,'')) IN (%s)", strings.Join(phs, ","))
		}
	}

	keyboardConnection := r.URL.Query().Get("keyboardConnection")
	if keyboardConnection != "" && excludeField != "keyboardConnection" {
		conns := parseCSV(keyboardConnection)
		for _, c := range conns {
			where += fmt.Sprintf(" AND EXISTS(SELECT 1 FROM unnest(string_to_array(COALESCE(p.keyboard_connection,''), ',')) AS kc(v) WHERE TRIM(kc.v) = $%d)", idx)
			args = append(args, c)
			idx++
		}
	}

	condition := r.URL.Query().Get("condition")
	if condition != "" && excludeField != "condition" {
		if condition == "new" || condition == "used" {
			where += fmt.Sprintf(" AND COALESCE(p.condition,'new') = $%d", idx)
			args = append(args, condition)
			idx++
		}
	}

	return where, args, idx
}

func (a *App) handleProducts(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	sortParam := r.URL.Query().Get("sort")
	limitStr := r.URL.Query().Get("limit")

	whereClause, args, idx := buildFilterWhere(r, "")
	query := `SELECT p.id, p.shop_id, p.name, p.description, p.price, p.old_price, p.category, p.images, p.is_active,
		COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.delivery_term,''), COALESCE(p.keyboard_type,''), COALESCE(p.keyboard_connection,''), p.popularity_score, COALESCE(p.rating_avg,0), COALESCE(p.created_at::text,''), COALESCE(p.condition,'new'), COALESCE(p.product_type,''), COALESCE(p.search_keywords,''),
		s.name AS shop_name, s.slug AS shop_slug
		FROM products p JOIN shops s ON p.shop_id = s.id
		` + whereClause

	// Sort allowlist — with parameterized search ranking when q is present
	var orderBy string
	if q != "" {
		scoreSQL, scoreArgs, _ := smartSearchScore(q, idx)
		if scoreSQL != "" {
			orderBy = " ORDER BY " + scoreSQL + " DESC"
			args = append(args, scoreArgs...)
			idx += len(scoreArgs)
		} else {
			orderBy = " ORDER BY"
		}
	} else {
		orderBy = " ORDER BY"
	}
	switch sortParam {
	case "popularity":
		orderBy += " p.popularity_score DESC, p.created_at DESC"
	case "rating":
		orderBy += " p.rating_avg DESC, p.created_at DESC"
	case "price_asc":
		orderBy += " p.price ASC"
	case "price_desc":
		orderBy += " p.price DESC"
	case "newest":
		orderBy += " p.created_at DESC"
	default:
		if q == "" {
			orderBy += " p.id DESC"
		} else {
			orderBy += ", p.id DESC"
		}
	}
	query += orderBy

	limit := 500
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	query += fmt.Sprintf(" LIMIT %d", limit)

	rows, err := a.db.Query(a.ctx, query, args...)
	if err != nil {
		log.Printf("products query error: %v", err)
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type ProductRow struct {
		ID                 string   `json:"id"`
		ShopID             string   `json:"shopId"`
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images,omitempty"`
		IsActive           bool     `json:"isActive"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		PopularityScore    int      `json:"popularityScore"`
		RatingAvg          float64  `json:"ratingAvg"`
		CreatedAt          string   `json:"createdAt,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		ProductType        string   `json:"productType,omitempty"`
		SearchKeywords     string   `json:"searchKeywords,omitempty"`
		ShopName           string   `json:"shopName"`
		ShopSlug           string   `json:"shopSlug"`
	}

	var products []ProductRow
	for rows.Next() {
		var p ProductRow
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.Condition, &p.ProductType, &p.SearchKeywords, &p.ShopName, &p.ShopSlug)
		products = append(products, p)
	}

	jsonOK(w, map[string]interface{}{"products": products, "total": len(products)})
}

// parseCSV splits comma-separated values and trims whitespace
func parseCSV(s string) []string {
	parts := strings.Split(s, ",")
	var res []string
	for _, p := range parts {
		p = strings.TrimSpace(strings.ToLower(p))
		if p != "" {
			res = append(res, p)
		}
	}
	return res
}

// inferProductType — guesses product type from name/desc/category/brand
func inferProductType(name, desc, category, brand string) string {
	text := strings.ToLower(name + " " + desc + " " + brand)
	for _, t := range productTypeRules {
		for _, kw := range t.keywords {
			if strings.Contains(text, kw) {
				return t.value
			}
		}
	}
	return ""
}

type ptRule struct {
	value    string
	keywords []string
}

var productTypeRules = []ptRule{
	{"phone", []string{"телефон", "смартфон", "iphone", "айфон", "redmi", "xiaomi", "galaxy", "mobile", "phone"}},
	{"headphones", []string{"наушники", "airpods", "гарнитура", "headphones", "headset", "earbuds"}},
	{"speaker", []string{"колонка", "speaker", "акустика", "jbl charge", "саундбар"}},
	{"laptop", []string{"ноутбук", "laptop", "macbook", "rog", "игровой"}},
	{"keyboard", []string{"клавиатура", "keyboard", "keychron", "механическая"}},
	{"monitor", []string{"монитор", "monitor", "дисплей", "экран"}},
	{"console", []string{"приставка", "консоль", "ps5", "playstation", "xbox"}},
	{"watch", []string{"часы", "smartwatch", "watch", "умные часы"}},
}

// synonymsByType returns search keywords for a given productType
func synonymsByType(pt string) string {
	m := map[string]string{
		"phone":      "телефон смартфон mobile phone",
		"headphones": "наушники гарнитура headphones headset",
		"speaker":    "колонка акустика speaker звук",
		"laptop":     "ноутбук компьютер laptop",
		"keyboard":   "клавиатура keyboard",
		"monitor":    "монитор экран дисплей monitor",
		"console":    "приставка консоль playstation игры",
		"watch":      "часы smartwatch watch",
	}
	return m[pt]
}

// buildSearchKeywords generates search keywords from product fields
func buildSearchKeywords(name, desc, brand, category, productType, color, kbType, kbConn string, benefits []string) string {
	var parts []string
	add := func(s string) {
		s = strings.TrimSpace(strings.ToLower(s))
		if s != "" && len(s) > 2 {
			parts = append(parts, s)
		}
	}
	add(name)
	add(desc)
	add(brand)
	if category != "" && category != "other" {
		add(category)
	}
	add(color)
	add(kbType)
	add(kbConn)
	for _, b := range benefits {
		add(b)
	}
	// Add synonyms
	if pt := productType; pt != "" {
		if syn := synonymsByType(pt); syn != "" {
			parts = append(parts, syn)
		}
	} else if pt := inferProductType(name, desc, category, brand); pt != "" {
		if syn := synonymsByType(pt); syn != "" {
			parts = append(parts, syn)
		}
	}

	seen := map[string]bool{}
	var deduped []string
	for _, p := range parts {
		if !seen[p] {
			seen[p] = true
			deduped = append(deduped, p)
		}
	}
	result := strings.Join(deduped, " ")
	if len(result) > 1000 {
		result = result[:1000]
	}
	return result
}

func (a *App) handleCatalogFacets(w http.ResponseWriter, r *http.Request) {
	facets := map[string]interface{}{}

	// Price range — exclude price filter so the range reflects unfiltered pricing
	priceWhere, priceArgs, _ := buildFilterWhere(r, "price")
	var minP, maxP int
	priceQuery := "SELECT COALESCE(MIN(p.price),0), COALESCE(MAX(p.price),0) FROM products p JOIN shops s ON p.shop_id=s.id " + priceWhere
	a.db.QueryRow(a.ctx, priceQuery, priceArgs...).Scan(&minP, &maxP)
	facets["price"] = map[string]int{"min": minP, "max": maxP}

	// Brands — exclude brand filter
	brandWhere, brandArgs, _ := buildFilterWhere(r, "brand")
	facets["brands"] = queryFacetCounts(a, "brand", brandWhere, brandArgs)

	// Colors — exclude color filter
	colorWhere, colorArgs, _ := buildFilterWhere(r, "color")
	facets["colors"] = queryFacetCounts(a, "color", colorWhere, colorArgs)

	// Delivery terms — exclude deliveryTerm filter
	deliveryWhere, deliveryArgs, _ := buildFilterWhere(r, "deliveryTerm")
	facets["deliveryTerms"] = queryFacetCounts(a, "delivery_term", deliveryWhere, deliveryArgs)

	// Keyboard types — exclude keyboardType filter
	ktWhere, ktArgs, _ := buildFilterWhere(r, "keyboardType")
	facets["keyboardTypes"] = queryFacetCounts(a, "keyboard_type", ktWhere, ktArgs)

	// Keyboard connections — exclude keyboardConnection filter
	kcWhere, kcArgs, _ := buildFilterWhere(r, "keyboardConnection")
	facets["keyboardConnections"] = queryFacetSplit(a, "keyboard_connection", kcWhere, kcArgs)

	// Conditions — exclude condition filter
	condWhere, condArgs, _ := buildFilterWhere(r, "condition")
	facets["conditions"] = queryConditions(a, condWhere, condArgs)

	jsonOK(w, facets)
}

func queryConditions(a *App, baseWhere string, baseArgs []interface{}) []map[string]interface{} {
	query := "SELECT COALESCE(condition,'new'), COUNT(*) FROM products p JOIN shops s ON p.shop_id=s.id " + baseWhere + " GROUP BY condition ORDER BY COUNT(*) DESC"
	rows, err := a.db.Query(a.ctx, query, baseArgs...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	labels := map[string]string{"new": "Новое", "used": "Б/у"}
	var result []map[string]interface{}
	for rows.Next() {
		var val string
		var count int
		rows.Scan(&val, &count)
		label := labels[val]
		if label == "" {
			label = val
		}
		result = append(result, map[string]interface{}{"value": val, "label": label, "count": count})
	}
	return result
}

func queryFacetCounts(a *App, column string, baseWhere string, baseArgs []interface{}) []map[string]interface{} {
	query := fmt.Sprintf("SELECT COALESCE(p.%s,'') AS v, COUNT(*) AS c FROM products p JOIN shops s ON p.shop_id=s.id %s AND COALESCE(p.%s,'')!='' GROUP BY p.%s ORDER BY c DESC LIMIT 50", column, baseWhere, column, column)
	rows, err := a.db.Query(a.ctx, query, baseArgs...)
	if err != nil {
		log.Printf("queryFacetCounts %s error: %v", column, err)
		return nil
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var val string
		var count int
		rows.Scan(&val, &count)
		result = append(result, map[string]interface{}{"value": val, "label": val, "count": count})
	}
	return result
}

// queryFacetSplit — like queryFacetCounts but splits comma-separated values into individual facet entries
func queryFacetSplit(a *App, column string, baseWhere string, baseArgs []interface{}) []map[string]interface{} {
	query := fmt.Sprintf("SELECT TRIM(v), COUNT(*) FROM products p JOIN shops s ON p.shop_id=s.id, LATERAL unnest(string_to_array(COALESCE(p.%s,''), ',')) AS v %s AND COALESCE(p.%s,'')!='' GROUP BY TRIM(v) ORDER BY COUNT(*) DESC LIMIT 50", column, baseWhere, column)
	rows, err := a.db.Query(a.ctx, query, baseArgs...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var val string
		var count int
		rows.Scan(&val, &count)
		result = append(result, map[string]interface{}{"value": val, "label": val, "count": count})
	}
	return result
}

func (a *App) handleProductsBatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Deduplicate and limit
	seen := map[string]bool{}
	var ids []string
	for _, id := range req.IDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
		if len(ids) >= 20 {
			break
		}
	}
	if len(ids) == 0 {
		jsonOK(w, map[string]interface{}{"products": []interface{}{}, "unavailableIds": []string{}})
		return
	}

	// Build parameterized IN clause
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(`SELECT p.id, p.shop_id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, p.images, p.is_active,
		COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.delivery_term,''), COALESCE(p.keyboard_type,''), COALESCE(p.keyboard_connection,''), COALESCE(p.condition,'new'), p.popularity_score, COALESCE(p.rating_avg,0), COALESCE(p.created_at::text,''), COALESCE(p.product_type,''), COALESCE(p.search_keywords,''),
		s.name AS shop_name, s.slug AS shop_slug
		FROM products p JOIN shops s ON p.shop_id = s.id
		WHERE p.id IN (%s) AND p.is_active = true AND s.is_published = true`, strings.Join(placeholders, ","))

	rows, err := a.db.Query(a.ctx, query, args...)
	if err != nil {
		log.Printf("products batch error: %v", err)
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type ProdRow struct {
		ID                 string   `json:"id"`
		ShopID             string   `json:"shopId"`
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Benefits           []string `json:"benefits,omitempty"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images,omitempty"`
		IsActive           bool     `json:"isActive"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		ProductType        string   `json:"productType,omitempty"`
		SearchKeywords     string   `json:"searchKeywords,omitempty"`
		PopularityScore    int      `json:"popularityScore"`
		RatingAvg          float64  `json:"ratingAvg"`
		CreatedAt          string   `json:"createdAt,omitempty"`
		ShopName           string   `json:"shopName"`
		ShopSlug           string   `json:"shopSlug"`
	}

	prodMap := map[string]ProdRow{}
	for rows.Next() {
		var p ProdRow
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.ProductType, &p.SearchKeywords, &p.ShopName, &p.ShopSlug)
		prodMap[p.ID] = p
	}

	// Preserve input order
	var products []ProdRow
	var unavailable []string
	for _, id := range ids {
		if p, ok := prodMap[id]; ok {
			products = append(products, p)
		} else {
			unavailable = append(unavailable, id)
		}
	}

	jsonOK(w, map[string]interface{}{
		"products":       products,
		"unavailableIds": unavailable,
	})
}

func (a *App) handleProductByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		jsonErr(w, 400, "id required")
		return
	}

	type ProductRow struct {
		ID                 string   `json:"id"`
		ShopID             string   `json:"shopId"`
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Benefits           []string `json:"benefits,omitempty"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images,omitempty"`
		IsActive           bool     `json:"isActive"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		ProductType        string   `json:"productType,omitempty"`
		SearchKeywords     string   `json:"searchKeywords,omitempty"`
		PopularityScore    int      `json:"popularityScore"`
		RatingAvg          float64  `json:"ratingAvg"`
		CreatedAt          string   `json:"createdAt,omitempty"`
		ShopName           string   `json:"shopName"`
		ShopSlug           string   `json:"shopSlug"`
	}

	var p ProductRow
	err := a.db.QueryRow(a.ctx, `SELECT p.id, p.shop_id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, p.images, p.is_active,
		COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.delivery_term,''), COALESCE(p.keyboard_type,''), COALESCE(p.keyboard_connection,''), COALESCE(p.condition,'new'), p.popularity_score, COALESCE(p.rating_avg,0), COALESCE(p.created_at::text,''), COALESCE(p.product_type,''), COALESCE(p.search_keywords,''),
		s.name, s.slug FROM products p JOIN shops s ON p.shop_id = s.id WHERE p.id = $1`, id).
		Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt, &p.ProductType, &p.SearchKeywords, &p.ShopName, &p.ShopSlug)
	if err != nil {
		jsonErr(w, 404, "product not found")
		return
	}

	// Fetch shop info
	shopInfo := map[string]interface{}{}
	var shopName, shopSlug, shopDesc, shopLogo, shopTrust string
	var shopRating float64
	var shopReviews, shopOrders int
	a.db.QueryRow(a.ctx, "SELECT name, slug, COALESCE(description,''), COALESCE(logo_url,'') FROM shops WHERE id=$1", p.ShopID).
		Scan(&shopName, &shopSlug, &shopDesc, &shopLogo)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*), COALESCE(AVG(rating),0) FROM shop_reviews WHERE shop_id=$1", p.ShopID).Scan(&shopReviews, &shopRating)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1 AND order_status!='cancelled'", p.ShopID).Scan(&shopOrders)
	if shopOrders > 0 {
		shopTrust = "reliable"
	} else {
		shopTrust = "new"
	}
	shopInfo = map[string]interface{}{
		"shopId": p.ShopID, "shopName": shopName, "shopSlug": shopSlug,
		"shopDescription": shopDesc, "shopLogoUrl": shopLogo,
		"shopRatingAvg": shopRating, "shopReviewsCount": shopReviews,
		"shopOrdersCount": shopOrders, "trustStatus": shopTrust,
	}

	jsonOK(w, map[string]interface{}{"product": p, "shop": shopInfo})
}

// ═══════════════════════════════════════════════
//  PRODUCT CONTACT — AI-manager reply + lead
// ═══════════════════════════════════════════════

func (a *App) handleProductContact(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "Чтобы написать продавцу, необходимо войти в аккаунт")
		return
	}
	_ = claims
	productID := r.PathValue("id")
	var req struct {
		Message           string `json:"message"`
		Name              string `json:"name"`
		Phone             string `json:"phone"`
		Email             string `json:"email"`
		Source            string `json:"source"`
		DeliveryCity      string `json:"deliveryCity"`
		ContactPreference string `json:"contactPreference"`
		CustomerNeed      string `json:"customerNeed"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Message = strings.TrimSpace(req.Message)
	req.Name = strings.TrimSpace(req.Name)
	if req.Message == "" {
		jsonErr(w, 400, "Сообщение обязательно")
		return
	}
	if len(req.Message) > 1000 {
		req.Message = req.Message[:1000]
	}
	if req.Name == "" {
		jsonErr(w, 400, "Имя обязательно")
		return
	}
	if len(req.Name) > 120 {
		req.Name = req.Name[:120]
	}
	if len(req.Phone) > 120 {
		req.Phone = req.Phone[:120]
	}
	if len(req.Email) > 120 {
		req.Email = req.Email[:120]
	}
	if req.Phone == "" && req.Email == "" {
		jsonErr(w, 400, "Телефон или email обязательны")
		return
	}

	// Get product + shop info
	var shopID, prodName, shopName, shopDesc string
	var prodPrice int
	err = a.db.QueryRow(a.ctx, "SELECT p.shop_id, p.name, p.price, s.name, COALESCE(s.description,'') FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", productID).
		Scan(&shopID, &prodName, &prodPrice, &shopName, &shopDesc)
	if err != nil {
		jsonErr(w, 404, "Товар не найден")
		return
	}

	// Check owner can't write to themselves
	if claims != nil {
		var ownerID string
		a.db.QueryRow(a.ctx, "SELECT owner_id FROM shops WHERE id=$1", shopID).Scan(&ownerID)
		if ownerID == claims.Sub {
			jsonErr(w, 403, "Это ваш товар")
			return
		}
	}

	// Validate source
	source := strings.TrimSpace(req.Source)
	allowedSources := map[string]bool{"product_contact": true, "ai_compare": true, "shop_contact": true, "assistant": true}
	if source == "" || !allowedSources[source] {
		source = "product_contact"
	}

	// Generate AI fallback reply from product data
	reply := generateProductReply(prodName, prodPrice, shopName, shopDesc, req.Message)

	// Create lead
	leadID := newID()
	customerUserID := ""
	if claims != nil {
		customerUserID = claims.Sub
	}
	a.db.Exec(a.ctx, "INSERT INTO leads (id, shop_id, product_id, name, phone, email, message, product_name, ai_reply, source, delivery_city, contact_preference, customer_need, customer_user_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'new')",
		leadID, shopID, productID, req.Name, req.Phone, req.Email, req.Message, prodName, reply, source, req.DeliveryCity, req.ContactPreference, req.CustomerNeed, customerUserID)

	jsonOK(w, map[string]interface{}{
		"leadId":  leadID,
		"reply":   reply,
		"product": map[string]interface{}{"id": productID, "name": prodName, "price": prodPrice},
		"shop":    map[string]interface{}{"id": shopID, "name": shopName},
	})
}

func generateProductReply(prodName string, prodPrice int, shopName, shopDesc, question string) string {
	q := strings.ToLower(question)
	switch {
	case strings.Contains(q, "цен") || strings.Contains(q, "стоим") || strings.Contains(q, "скольк"):
		return fmt.Sprintf("Здравствуйте! Цена товара «%s» — %d ₽. Если нужна дополнительная информация, уточняйте у продавца.", prodName, prodPrice)
	case strings.Contains(q, "доставк") || strings.Contains(q, "привез"):
		return fmt.Sprintf("Здравствуйте! Информацию о доставке товара «%s» лучше уточнить у продавца — в карточке товара нет точных данных о доставке.", prodName)
	case strings.Contains(q, "гарант") || strings.Contains(q, "возврат"):
		return fmt.Sprintf("Здравствуйте! Информацию о гарантии на товар «%s» лучше уточнить у продавца.", prodName)
	case strings.Contains(q, "скидк") || strings.Contains(q, "акци"):
		return fmt.Sprintf("Здравствуйте! Текущая цена товара «%s» — %d ₽. Информацию о возможных скидках уточняйте у продавца.", prodName, prodPrice)
	case strings.Contains(q, "налич") || strings.Contains(q, "есть"):
		return fmt.Sprintf("Здравствуйте! Актуальное наличие товара «%s» лучше уточнить у продавца «%s».", prodName, shopName)
	default:
		return fmt.Sprintf("Здравствуйте! Спасибо за интерес к товару «%s» в магазине «%s». Я передал ваш вопрос продавцу, он свяжется с вами.", prodName, shopName)
	}
}

// ═══════════════════════════════════════════════
//  AI COMPARE — scoring fallback without external AI
// ═══════════════════════════════════════════════

func (a *App) handleCompareAI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductIDs []string `json:"productIds"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if len(req.ProductIDs) < 2 {
		jsonErr(w, 400, "Нужно минимум 2 товара для сравнения")
		return
	}
	if len(req.ProductIDs) > 20 {
		req.ProductIDs = req.ProductIDs[:20]
	}

	// Deduplicate
	seen := map[string]bool{}
	var ids []string
	for _, id := range req.ProductIDs {
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}

	type cmpProd struct {
		ID, Name, ShopName, ShopSlug, Category, Brand, Color, Condition, DeliveryTerm, KeyboardType, KeyboardConnection, ProductType string
		Price, OldPrice                                                                                                              int
		Benefits                                                                                                                     []string
		Description                                                                                                                  string
		Images                                                                                                                       []string
	}
	_ = cmpProd{}.ID // force JSON fields
	// Use explicit tag struct for JSON serialization
	type cmpProdJSON struct {
		ID                 string   `json:"id"`
		Name               string   `json:"name"`
		ShopName           string   `json:"shopName"`
		ShopSlug           string   `json:"shopSlug"`
		Category           string   `json:"category"`
		Brand              string   `json:"brand"`
		Color              string   `json:"color"`
		Condition          string   `json:"condition"`
		DeliveryTerm       string   `json:"deliveryTerm"`
		KeyboardType       string   `json:"keyboardType"`
		KeyboardConnection string   `json:"keyboardConnection"`
		ProductType        string   `json:"productType"`
		Price              int      `json:"price"`
		OldPrice           int      `json:"oldPrice"`
		Benefits           []string `json:"benefits"`
		Description        string   `json:"description"`
		Images             []string `json:"images"`
	}
	var products []cmpProd
	validIDs := []string{}
	for _, id := range ids {
		var p cmpProd
		err := a.db.QueryRow(a.ctx,
			"SELECT p.id, p.name, p.price, COALESCE(p.old_price,0), p.category, COALESCE(p.brand,''), COALESCE(p.color,''), COALESCE(p.condition,'new'), COALESCE(p.delivery_term,''), COALESCE(p.keyboard_type,''), COALESCE(p.keyboard_connection,''), COALESCE(p.product_type,''), p.description, p.benefits, p.images, s.name, s.slug FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", id).
			Scan(&p.ID, &p.Name, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Color, &p.Condition, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.ProductType, &p.Description, &p.Benefits, &p.Images, &p.ShopName, &p.ShopSlug)
		if err == nil {
			products = append(products, p)
			validIDs = append(validIDs, id)
		}
	}

	if len(products) < 2 {
		jsonErr(w, 400, "Недостаточно действительных товаров для сравнения (нужно >=2)")
		return
	}

	// Score each product
	type ranked struct {
		cmpProdJSON
		Score  int      `json:"score"`
		Rank   int      `json:"rank"`
		Reason string   `json:"reason"`
		Pros   []string `json:"pros"`
		Cons   []string `json:"cons"`
	}
	var results []ranked

	for _, p := range products {
		score := 0
		var pros, cons []string

		// Condition
		if p.Condition == "new" {
			score += 10
			pros = append(pros, "Новый товар")
		}

		// Benefits
		if len(p.Benefits) > 0 {
			score += len(p.Benefits) * 3
			pros = append(pros, fmt.Sprintf("%d преимуществ", len(p.Benefits)))
		}

		// Delivery
		if p.DeliveryTerm != "" {
			score += 8
			pros = append(pros, "Срок доставки: "+p.DeliveryTerm)
		}

		// Brand
		if p.Brand != "" {
			score += 5
			pros = append(pros, "Бренд: "+p.Brand)
		}

		// Description
		if len(p.Description) > 50 {
			score += 8
			pros = append(pros, "Подробное описание")
		}

		// Old price (potential discount)
		if p.OldPrice > 0 && p.Price < p.OldPrice {
			score += 3
		}

		// Images
		if len(p.Images) > 1 {
			score += 5
			pros = append(pros, fmt.Sprintf("%d фото", len(p.Images)))
		}

		// Product type match with group
		if p.ProductType != "" {
			score += 7
		}

		if p.Condition != "new" {
			cons = append(cons, "Б/у товар")
		}
		if p.DeliveryTerm == "" {
			cons = append(cons, "Срок доставки не указан")
		}
		if len(p.Description) < 20 {
			cons = append(cons, "Краткое описание")
		}

		reason := fmt.Sprintf("%s — %d ₽. %s", p.Name, p.Price, p.ShopName)
		if len(pros) > 0 {
			reason += ". Плюсы: " + strings.Join(pros, ", ")
		}

		results = append(results, ranked{cmpProdJSON: cmpProdJSON{
			ID: p.ID, Name: p.Name, ShopName: p.ShopName, ShopSlug: p.ShopSlug,
			Category: p.Category, Brand: p.Brand, Color: p.Color, Condition: p.Condition,
			DeliveryTerm: p.DeliveryTerm, KeyboardType: p.KeyboardType, KeyboardConnection: p.KeyboardConnection,
			ProductType: p.ProductType, Price: p.Price, OldPrice: p.OldPrice,
			Benefits: p.Benefits, Description: p.Description, Images: p.Images,
		}, Score: score, Reason: reason, Pros: pros, Cons: cons})
	}

	// Sort by score desc
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}
	if len(results) > 5 {
		results = results[:5]
	}
	for i := range results {
		results[i].Rank = i + 1
	}

	// Generate summary
	summary := "AI сравнил товары по данным из карточек."
	if len(results) > 0 {
		summary += fmt.Sprintf(" Лучший вариант — «%s» (%d ₽).", results[0].Name, results[0].Price)
	}

	jsonOK(w, map[string]interface{}{
		"summary": summary,
		"top":     results,
	})
}

// ═══════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════

func (a *App) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []struct {
			ProductID string `json:"productId"`
			Quantity  int    `json:"quantity"`
		} `json:"items"`
		CustomerName   string `json:"customerName"`
		CustomerPhone  string `json:"customerPhone"`
		CustomerEmail  string `json:"customerEmail"`
		PaymentMethod  string `json:"paymentMethod"`
		DeliveryMethod string `json:"deliveryMethod"`
		PDConsent      *bool  `json:"pd_consent"`
		ConsentSource  string `json:"consent_source"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Требуется авторизация + роль client (проверяем до валидации тела)
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	userID := claims.Sub

	if req.CustomerName == "" || req.CustomerPhone == "" || req.CustomerEmail == "" {
		jsonErr(w, 400, "customerName, customerPhone and customerEmail required")
		return
	}
	if !a.requirePersonalDataConsentOrPrior(w, userID, req.PDConsent) {
		return
	}
	if len(req.Items) == 0 {
		jsonErr(w, 400, "at least one item required")
		return
	}
	validPayments := map[string]bool{"store": true, "cash": true, "invoice": true}
	if !validPayments[req.PaymentMethod] {
		jsonErr(w, 400, "invalid paymentMethod (store, cash, invoice)")
		return
	}
	validDeliveries := map[string]bool{"pickup": true, "delivery_agreement": true}
	if !validDeliveries[req.DeliveryMethod] {
		jsonErr(w, 400, "invalid deliveryMethod (pickup, delivery_agreement)")
		return
	}

	// Проверяем что все товары из одного магазина
	var firstShopID string
	var totalAmount int
	var orderItems []OrderItem

	for i, item := range req.Items {
		if item.Quantity < 1 {
			item.Quantity = 1
		}
		var shopID, prodName string
		var price int
		err := a.db.QueryRow(a.ctx, "SELECT shop_id, name, price FROM products WHERE id=$1 AND is_active=true", item.ProductID).
			Scan(&shopID, &prodName, &price)
		if err != nil {
			jsonErr(w, 404, fmt.Sprintf("product %s not found", item.ProductID))
			return
		}
		if i == 0 {
			firstShopID = shopID
		} else if shopID != firstShopID {
			jsonErr(w, 400, "На первом этапе можно оформить заказ только у одного продавца.")
			return
		}
		totalAmount += price * item.Quantity
		orderItems = append(orderItems, OrderItem{
			ID: newID(), ProductID: item.ProductID,
			ProductName: prodName, Price: price, Quantity: item.Quantity,
		})
	}

	orderID := newID()
	_, err := a.db.Exec(a.ctx,
		"INSERT INTO orders (id, shop_id, user_id, customer_name, customer_phone, customer_email, total_amount, payment_method, payment_status, delivery_method, order_status, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'not_paid',$9,'created','site')",
		orderID, firstShopID, userID, req.CustomerName, req.CustomerPhone, req.CustomerEmail, totalAmount, req.PaymentMethod, req.DeliveryMethod)
	if err != nil {
		jsonErr(w, 500, "failed to create order")
		return
	}

	for _, oi := range orderItems {
		a.db.Exec(a.ctx, "INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1,$2,$3,$4,$5,$6)",
			oi.ID, orderID, oi.ProductID, oi.ProductName, oi.Price, oi.Quantity)
	}

	src := strings.TrimSpace(req.ConsentSource)
	if src == "" {
		src = "checkout"
	}
	_ = a.recordUserConsent(r, userID, "personal_data", legalPDConsentVer, src, true)

	jsonOK(w, map[string]interface{}{"orderId": orderID, "totalAmount": totalAmount, "status": "created"})
}

func (a *App) handleMyOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}

	rows, err := a.db.Query(a.ctx,
		"SELECT o.id, o.shop_id, o.customer_name, o.customer_phone, o.customer_email, o.total_amount, o.payment_method, o.payment_status, o.delivery_method, o.order_status, o.source, COALESCE(o.created_at::text,''), COALESCE(o.updated_at::text,''), COALESCE(s.name,''), COALESCE(s.slug,'') FROM orders o LEFT JOIN shops s ON o.shop_id=s.id WHERE o.user_id=$1 ORDER BY o.created_at DESC", claims.Sub)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type OrderWithDetails struct {
		Order
		ShopName string `json:"shopName,omitempty"`
		ShopSlug string `json:"shopSlug,omitempty"`
		Items    []struct {
			ID           string `json:"id"`
			ProductID    string `json:"productId"`
			ProductName  string `json:"productName"`
			Price        int    `json:"price"`
			Quantity     int    `json:"quantity"`
			ProductImage string `json:"productImage,omitempty"`
		} `json:"items,omitempty"`
	}
	var orders []OrderWithDetails
	for rows.Next() {
		var o OrderWithDetails
		rows.Scan(&o.ID, &o.ShopID, &o.CustomerName, &o.CustomerPhone, &o.CustomerEmail, &o.TotalAmount, &o.PaymentMethod, &o.PaymentStatus, &o.DeliveryMethod, &o.OrderStatus, &o.Source, &o.CreatedAt, &o.UpdatedAt, &o.ShopName, &o.ShopSlug)

		// Load items with product image
		itemRows, _ := a.db.Query(a.ctx, "SELECT oi.id, oi.product_id, COALESCE(oi.product_name,p.name,''), oi.price, oi.quantity, COALESCE(p.images,'{}')::text FROM order_items oi LEFT JOIN products p ON oi.product_id=p.id WHERE oi.order_id=$1", o.ID)
		if itemRows != nil {
			for itemRows.Next() {
				var it struct {
					ID           string `json:"id"`
					ProductID    string `json:"productId"`
					ProductName  string `json:"productName"`
					Price        int    `json:"price"`
					Quantity     int    `json:"quantity"`
					ProductImage string `json:"productImage,omitempty"`
				}
				itemRows.Scan(&it.ID, &it.ProductID, &it.ProductName, &it.Price, &it.Quantity, &it.ProductImage)
				o.Items = append(o.Items, it)
			}
			itemRows.Close()
		}
		orders = append(orders, o)
	}

	jsonOK(w, map[string]interface{}{"orders": orders})
}

// ═══════════════════════════════════════════════
//  BUSINESS — заказы, управление товарами
// ═══════════════════════════════════════════════

func (a *App) handleBusinessOrders(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var shop Shop
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shop.ID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	orders, err := a.getBusinessOrders(shop.ID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	// Batch-fetch order items with product images
	if len(orders) > 0 {
		orderIDs := make([]string, len(orders))
		orderIdx := make(map[string]int)
		for i, o := range orders {
			orderIDs[i] = o.ID
			orderIdx[o.ID] = i
			orders[i].Items = []OrderItem{}
		}
		itemRows, itemErr := a.db.Query(a.ctx,
			"SELECT oi.id, oi.order_id, oi.product_id, COALESCE(oi.product_name, p.name, ''), COALESCE(NULLIF(p.images[1],''),''), oi.price, oi.quantity FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ANY($1)", orderIDs)
		if itemErr == nil {
			defer itemRows.Close()
			for itemRows.Next() {
				var item OrderItem
				itemRows.Scan(&item.ID, &item.OrderID, &item.ProductID, &item.ProductName, &item.ProductImage, &item.Price, &item.Quantity)
				if idx, ok := orderIdx[item.OrderID]; ok {
					orders[idx].Items = append(orders[idx].Items, item)
				}
			}
		}
	}

	jsonOK(w, map[string]interface{}{"orders": orders})
}

func (a *App) handleUpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	orderID := r.PathValue("id")
	if orderID == "" {
		jsonErr(w, 400, "id required")
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	validStatuses := map[string]bool{"created": true, "accepted": true, "ready": true, "completed": true, "cancelled": true}
	if !validStatuses[req.Status] {
		jsonErr(w, 400, "invalid status (created, accepted, ready, completed, cancelled)")
		return
	}

	// Проверяем что заказ принадлежит магазину владельца
	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT shop_id FROM orders WHERE id=$1", orderID).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "order not found")
		return
	}

	var ownerID string
	a.db.QueryRow(a.ctx, "SELECT owner_id FROM shops WHERE id=$1", shopID).Scan(&ownerID)
	if ownerID != claims.Sub {
		jsonErr(w, 403, "not your order")
		return
	}

	err = a.updateOrderStatus(shopID, orderID, req.Status)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	jsonOK(w, map[string]interface{}{"ok": true})
}

func (a *App) handleBusinessProducts(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	rows, err := a.db.Query(a.ctx,
		"SELECT id, shop_id, name, description, benefits, price, old_price, category, images, is_active, COALESCE(brand,''), COALESCE(color,''), COALESCE(delivery_term,''), COALESCE(keyboard_type,''), COALESCE(keyboard_connection,''), COALESCE(condition,'new'), popularity_score, COALESCE(rating_avg,0), COALESCE(created_at::text,'') FROM products WHERE shop_id=$1 ORDER BY id DESC", shopID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type ProdRow struct {
		ID                 string   `json:"id"`
		ShopID             string   `json:"shopId"`
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Benefits           []string `json:"benefits,omitempty"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images,omitempty"`
		IsActive           bool     `json:"isActive"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		PopularityScore    int      `json:"popularityScore"`
		RatingAvg          float64  `json:"ratingAvg"`
		CreatedAt          string   `json:"createdAt,omitempty"`
	}
	var products []ProdRow
	for rows.Next() {
		var p ProdRow
		rows.Scan(&p.ID, &p.ShopID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Images, &p.IsActive, &p.Brand, &p.Color, &p.DeliveryTerm, &p.KeyboardType, &p.KeyboardConnection, &p.Condition, &p.PopularityScore, &p.RatingAvg, &p.CreatedAt)
		products = append(products, p)
	}

	jsonOK(w, map[string]interface{}{"products": products})
}

func (a *App) handleUpdateProduct(w http.ResponseWriter, r *http.Request) {
	claims, _, ok := a.requireApprovedBusinessShop(w, r)
	if !ok {
		return
	}

	productID := r.PathValue("id")
	if productID == "" {
		jsonErr(w, 400, "id required")
		return
	}

	// Проверяем владение через centralized helper
	shopID, ownerID, err := a.getProductShopOwner(productID)
	if err != nil {
		jsonErr(w, 404, "product not found")
		return
	}
	if ownerID != claims.Sub {
		jsonErr(w, 403, "not your product")
		return
	}

	var req struct {
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Benefits           []string `json:"benefits"`
		Price              int      `json:"price"`
		OldPrice           *int     `json:"oldPrice,omitempty"`
		Category           string   `json:"category"`
		Images             []string `json:"images"`
		IsActive           *bool    `json:"isActive,omitempty"`
		Brand              string   `json:"brand,omitempty"`
		Color              string   `json:"color,omitempty"`
		DeliveryTerm       string   `json:"deliveryTerm,omitempty"`
		KeyboardType       string   `json:"keyboardType,omitempty"`
		KeyboardConnection string   `json:"keyboardConnection,omitempty"`
		Condition          string   `json:"condition,omitempty"`
		ProductType        string   `json:"productType,omitempty"`
		SearchKeywords     string   `json:"searchKeywords,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	cond := req.Condition
	if cond != "" && cond != "new" && cond != "used" {
		jsonErr(w, 400, "condition должен быть new или used")
		return
	}

	// Auto-fill productType and searchKeywords if empty
	pt := strings.TrimSpace(req.ProductType)
	if pt == "" {
		pt = inferProductType(req.Name, req.Description, req.Category, req.Brand)
	}
	kw := strings.TrimSpace(req.SearchKeywords)
	if kw == "" {
		kw = buildSearchKeywords(req.Name, req.Description, req.Brand, req.Category, pt, req.Color, req.KeyboardType, req.KeyboardConnection, req.Benefits)
	}

	_, err = a.db.Exec(a.ctx,
		`UPDATE products SET
			name=COALESCE(NULLIF($2,''),name),
			description=COALESCE(NULLIF($3,''),description),
			benefits=COALESCE($4,benefits),
			price=CASE WHEN $5=0 THEN price ELSE $5 END,
			old_price=$6,
			category=COALESCE(NULLIF($7,''),category),
			images=COALESCE($8,images),
			is_active=COALESCE($9,is_active),
			brand=COALESCE(NULLIF($10,''),brand),
			color=COALESCE(NULLIF($11,''),color),
			delivery_term=COALESCE(NULLIF($12,''),delivery_term),
			keyboard_type=COALESCE(NULLIF($13,''),keyboard_type),
			keyboard_connection=COALESCE(NULLIF($14,''),keyboard_connection),
			condition=CASE WHEN $15='' THEN condition ELSE $15 END,
			product_type=COALESCE(NULLIF($16,''),product_type),
			search_keywords=COALESCE(NULLIF($17,''),search_keywords)
		WHERE id=$1`,
		productID, req.Name, req.Description, req.Benefits, req.Price, req.OldPrice, req.Category, req.Images, req.IsActive, req.Brand, req.Color, req.DeliveryTerm, req.KeyboardType, req.KeyboardConnection, cond, pt, kw)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	a.recordAuditEvent(r, claims.Sub, claims.Role, "product.updated", "product", productID, shopID, map[string]interface{}{"name": req.Name})
	jsonOK(w, map[string]interface{}{"ok": true})
}

func (a *App) handleDeleteProduct(w http.ResponseWriter, r *http.Request) {
	claims, _, ok := a.requireApprovedBusinessShop(w, r)
	if !ok {
		return
	}

	productID := r.PathValue("id")
	if productID == "" {
		jsonErr(w, 400, "id required")
		return
	}

	shopID, ownerID, err := a.getProductShopOwner(productID)
	if err != nil {
		jsonErr(w, 404, "product not found")
		return
	}
	if ownerID != claims.Sub {
		jsonErr(w, 403, "not your product")
		return
	}

	_, err = a.db.Exec(a.ctx, "UPDATE products SET is_active=false WHERE id=$1", productID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	a.recordAuditEvent(r, claims.Sub, claims.Role, "product.deleted", "product", productID, shopID, nil)
	jsonOK(w, map[string]interface{}{"ok": true})
}

// ═══════════════════════════════════════════════
//  PAYMENT SETTINGS (без реальной ЮKassa)
// ═══════════════════════════════════════════════

func (a *App) handleGetPaymentSettings(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	var ps PaymentSettings
	var extID, encKey sql.NullString
	var createdAt, updatedAt time.Time
	err = a.db.QueryRow(a.ctx,
		"SELECT id, shop_id, provider, online_enabled, card_enabled, sbp_enabled, qr_enabled, store_payment_enabled, cash_enabled, invoice_enabled, is_test_mode, shop_id_external, encrypted_secret_key, created_at, updated_at FROM payment_settings WHERE shop_id=$1", shopID).
		Scan(&ps.ID, &ps.ShopID, &ps.Provider, &ps.OnlineEnabled, &ps.CardEnabled, &ps.SBPEnabled, &ps.QREnabled, &ps.StorePaymentEnabled, &ps.CashEnabled, &ps.InvoiceEnabled, &ps.IsTestMode, &extID, &encKey, &createdAt, &updatedAt)
	if err != nil {
		ps.ID = newID()
		ps.ShopID = shopID
		ps.Provider = "yookassa"
		ps.OnlineEnabled = false
		ps.CardEnabled = false
		ps.SBPEnabled = false
		ps.QREnabled = false
		ps.StorePaymentEnabled = true
		ps.CashEnabled = true
		ps.InvoiceEnabled = false
		ps.IsTestMode = false
		ps.CreatedAt = time.Now().Format(time.RFC3339)
		ps.UpdatedAt = time.Now().Format(time.RFC3339)
		_, err = a.db.Exec(a.ctx,
			"INSERT INTO payment_settings (id, shop_id, provider, online_enabled, card_enabled, sbp_enabled, qr_enabled, store_payment_enabled, cash_enabled, invoice_enabled, is_test_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
			ps.ID, ps.ShopID, ps.Provider, false, false, false, false, true, true, false, false)
		if err != nil {
			jsonErr(w, 500, "db error")
			return
		}
	} else {
		ps.CreatedAt = createdAt.Format(time.RFC3339)
		ps.UpdatedAt = updatedAt.Format(time.RFC3339)
		if extID.Valid {
			ps.ShopIDExternal = &extID.String
		}
		if encKey.Valid {
			ps.EncryptedSecretKey = &encKey.String
		}
	}

	jsonOK(w, map[string]interface{}{"settings": ps})
}

func (a *App) handleUpdatePaymentSettings(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	var req struct {
		StorePaymentEnabled *bool `json:"storePaymentEnabled"`
		CashEnabled         *bool `json:"cashEnabled"`
		InvoiceEnabled      *bool `json:"invoiceEnabled"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Можно обновлять только офлайн-способы
	if req.StorePaymentEnabled != nil {
		a.db.Exec(a.ctx, "UPDATE payment_settings SET store_payment_enabled=$1 WHERE shop_id=$2", *req.StorePaymentEnabled, shopID)
	}
	if req.CashEnabled != nil {
		a.db.Exec(a.ctx, "UPDATE payment_settings SET cash_enabled=$1 WHERE shop_id=$2", *req.CashEnabled, shopID)
	}
	if req.InvoiceEnabled != nil {
		a.db.Exec(a.ctx, "UPDATE payment_settings SET invoice_enabled=$1 WHERE shop_id=$2", *req.InvoiceEnabled, shopID)
	}
	// Всегда обновляем updated_at
	a.db.Exec(a.ctx, "UPDATE payment_settings SET updated_at=NOW() WHERE shop_id=$1", shopID)

	// Убеждаемся что online/card/sbp/qr всегда false
	a.db.Exec(a.ctx, "UPDATE payment_settings SET online_enabled=false, card_enabled=false, sbp_enabled=false, qr_enabled=false WHERE shop_id=$1", shopID)

	jsonOK(w, map[string]interface{}{"ok": true})
}

// ═══════════════════════════════════════════════
//  AI SALES COPILOT
// ═══════════════════════════════════════════════

type CopilotProduct struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Benefits     []string `json:"benefits,omitempty"`
	Price        int      `json:"price"`
	OldPrice     *int     `json:"oldPrice,omitempty"`
	Category     string   `json:"category"`
	Brand        string   `json:"brand"`
	Condition    string   `json:"condition"`
	DeliveryTerm string   `json:"deliveryTerm"`
	ProductType  string   `json:"productType"`
}

func (a *App) handleCopilotReply(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var req struct {
		Message  string `json:"message"`
		Style    string `json:"style"`
		Channel  string `json:"channel"`
		Scenario string `json:"scenario"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Message = strings.TrimSpace(req.Message)
	if len(req.Message) > 4000 {
		req.Message = req.Message[:4000]
	}
	if req.Message == "" {
		jsonErr(w, 400, "message required")
		return
	}
	if req.Style == "" {
		req.Style = "friendly"
	}
	if req.Scenario == "" {
		req.Scenario = "auto"
	}

	var shop Shop
	err = a.db.QueryRow(a.ctx, "SELECT id, slug, name, description, COALESCE(about,''), category, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,'') FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).
		Scan(&shop.ID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	rows, err := a.db.Query(a.ctx,
		"SELECT id, name, description, benefits, price, old_price, category, COALESCE(brand,''), COALESCE(condition,'new'), COALESCE(delivery_term,''), COALESCE(product_type,'') FROM products WHERE shop_id=$1 AND is_active=true ORDER BY price DESC", shop.ID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	var products []CopilotProduct
	for rows.Next() {
		var p CopilotProduct
		rows.Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Condition, &p.DeliveryTerm, &p.ProductType)
		products = append(products, p)
	}

	msgLower := strings.ToLower(req.Message)

	// Detect intent and entities
	detected := map[string]string{
		"intent":       detectCopilotIntent(msgLower),
		"budget":       "",
		"city":         "",
		"contact":      "",
		"productQuery": "",
		"objection":    "",
		"urgency":      "",
	}
	if containsAny(msgLower, "срочн", "сегодня", "завтра", "быстр") {
		detected["urgency"] = "high"
	}
	if containsAny(msgLower, "дорого", "цена", "скидк", "дешевл") {
		detected["objection"] = "price"
	}

	// Match products
	var matchedProducts []CopilotProduct
	for _, p := range products {
		pLower := strings.ToLower(p.Name + " " + p.Description + " " + p.Category + " " + p.Brand + " " + p.ProductType)
		score := 0
		words := strings.Fields(msgLower)
		for _, w := range words {
			if len(w) > 2 && strings.Contains(pLower, w) {
				score++
			}
		}
		if score >= 1 {
			matchedProducts = append(matchedProducts, p)
		}
	}
	if len(matchedProducts) == 0 {
		matchedProducts = products
	}
	if len(matchedProducts) > 5 {
		matchedProducts = matchedProducts[:5]
	}

	// Generate replies
	reply, shortReply, detailedReply, followUp, objReply, nextStep := generateCopilotReplies(req.Message, req.Style, req.Channel, req.Scenario, matchedProducts, shop.Name, detected)

	// AI gateway path
	if a.aiProvider != nil {
		aiCatalog := make([]AIProductContext, 0, len(matchedProducts))
		for _, p := range matchedProducts {
			aiCatalog = append(aiCatalog, toAIProductContextFromCopilot(p))
		}
		aiReq := AIRequest{
			Scenario:    ScenarioBusinessCopilot,
			UserMessage: req.Message,
			Shop:        toAIShopContext(&shop, nil),
			Catalog:     aiCatalog,
			Language:    "ru",
			Temperature: 0.4,
		}
		if aiResp, ok := a.callAIProvider(w, r, aiReq); ok && aiResp.Text != "" {
			reply = aiResp.Text
			if shortReply == "" {
				shortReply = reply
			}
			if detailedReply == "" {
				detailedReply = reply
			}
			if followUp == "" {
				followUp = "Уточните детали, если нужно — подготовлю точный ответ."
			}
			if nextStep == "" {
				nextStep = "Проверить черновик перед отправкой клиенту."
			}
		}
	}

	crID := newID()
	a.db.Exec(a.ctx,
		"INSERT INTO copilot_requests (id, shop_id, raw_customer_message, generated_reply, style) VALUES ($1,$2,$3,$4,$5)",
		crID, shop.ID, req.Message, reply, req.Style)

	jsonOK(w, map[string]interface{}{
		"reply":           reply,
		"shortReply":      shortReply,
		"detailedReply":   detailedReply,
		"followUp":        followUp,
		"objectionReply":  objReply,
		"nextStep":        nextStep,
		"products":        matchedProducts,
		"detected":        detected,
		"suggestedAction": detected["intent"],
	})
}

func detectCopilotIntent(msg string) string {
	if containsAny(msg, "в наличии", "есть ли", "наличи", "привез", "найдётся") {
		return "ask_stock"
	}
	if containsAny(msg, "почём", "цен", "стоимост", "сколько стоит", "прайс") {
		return "ask_price"
	}
	if containsAny(msg, "доставк", "привезти", "отправ", "привезёте", "доставите", "в город", "в казань", "в москв", "в питер", "в спб") {
		return "ask_delivery"
	}
	if containsAny(msg, "скидк", "дешевл", "торг", "уступит", "подешевле") {
		return "ask_discount"
	}
	if containsAny(msg, "дорого", "цена высока", "завышен", "недорого") {
		return "expensive_objection"
	}
	if containsAny(msg, "сравн", "чем отличает", "какой лучше", "выбери", "посовету", "что лучше") {
		return "product_selection"
	}
	if containsAny(msg, "подробн", "расскаж", "характеристик", "описан", "что за") {
		return "product_details"
	}
	if containsAny(msg, "куп", "заказат", "оформит", "беру", "возьму", "давайт оформим") {
		return "close_deal"
	}
	if containsAny(msg, "привет", "здравствуй", "добрый день", "здравствуйте") {
		return "first_contact"
	}
	return "fallback"
}

func generateCopilotReplies(msg, style, channel, scenario string, products []CopilotProduct, shopName string, detected map[string]string) (reply, shortReply, detailedReply, followUp, objReply, nextStep string) {
	intent := detected["intent"]
	if intent == "" {
		intent = "fallback"
	}

	greeting := "Здравствуйте!"
	switch style {
	case "short", "minimal":
		greeting = ""
	case "professional":
		greeting = "Здравствуйте."
	case "friendly":
		greeting = "Здравствуйте! "
	case "confident":
		greeting = "Здравствуйте."
	}

	hasProds := len(products) > 0

	switch intent {
	case "ask_stock":
		reply = greeting + "Товар опубликован в каталоге. Актуальное наличие лучше подтвердить перед оформлением."
		if hasProds {
			reply += "\nПозиции из каталога:\n"
			for _, p := range products[:min(3, len(products))] {
				reply += fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price)
			}
		}
		shortReply = "Товар в каталоге. Уточню актуальное наличие."
		detailedReply = greeting + "Вижу товар в каталоге. Сейчас уточню актуальное наличие и подскажу, как оформить. Могу показать подробные характеристики."
		followUp = "Уточню наличие и сразу напишу. Какой товар вас интересует?"
		nextStep = "Подтвердить наличие и уточнить модель."
	case "ask_price":
		reply = greeting + "Актуальные цены:\n"
		if hasProds {
			for _, p := range products[:min(5, len(products))] {
				reply += fmt.Sprintf("• %s — %d ₽\n", p.Name, p.Price)
			}
		}
		shortReply = "Цены актуальны. Уточните интересующую модель."
		detailedReply = greeting + "Все цены актуальны. При покупке от 2 единиц возможны индивидуальные условия."
		nextStep = "Уточнить, какая модель интересует."
	case "ask_delivery":
		reply = greeting + "Доставку можно оформить. Уточните ваш город и удобный способ получения — рассчитаю срок и стоимость."
		shortReply = "Доставка доступна. Уточните город."
		nextStep = "Уточнить город и способ доставки."
	case "ask_discount":
		reply = greeting + "Могу уточнить возможность индивидуального предложения. Цены уже выгодные, но для постоянных клиентов бывают особые условия."
		shortReply = "Могу уточнить индивидуальные условия."
		objReply = greeting + "Цена отражает реальную ценность товара. Могу предложить альтернативу с похожими характеристиками."
		nextStep = "Предложить альтернативу дешевле."
	case "expensive_objection":
		reply = greeting + "Понимаю ваш бюджет. Этот товар стоит своих денег благодаря качеству и характеристикам. Могу подобрать похожий вариант с лучшей ценой."
		shortReply = "Могу подобрать похожий дешевле."
		objReply = greeting + "Цена обусловлена качеством и надёжностью. Могу предложить альтернативу с похожими характеристиками."
		nextStep = "Подобрать альтернативу дешевле."
	case "product_selection":
		reply = greeting + "Вот что могу предложить:\n"
		if hasProds {
			for _, p := range products[:min(5, len(products))] {
				reply += fmt.Sprintf("• %s — %d ₽", p.Name, p.Price)
				if p.Description != "" {
					reply += fmt.Sprintf(" (%s)", p.Description)
				}
				reply += "\n"
			}
		}
		shortReply = "Вот подходящие варианты. Какой интересует?"
		followUp = "Могу подробнее рассказать про любой вариант."
		nextStep = "Уточнить преимущества конкретного товара."
	case "product_details":
		reply = greeting + "Подробности по товарам:\n"
		if hasProds {
			for _, p := range products[:min(3, len(products))] {
				reply += fmt.Sprintf("• %s — %d ₽", p.Name, p.Price)
				if p.Description != "" {
					reply += fmt.Sprintf(" — %s", p.Description)
				}
				reply += "\n"
			}
		}
		shortReply = "Подробности по запросу."
		nextStep = "Предложить сравнить варианты."
	case "close_deal":
		reply = greeting + "Отлично! Для оформления заказа мне понадобятся ваше имя, телефон и город доставки. Свяжусь в течение 15 минут."
		shortReply = "Для заказа нужны имя и телефон."
		detailedReply = greeting + "Для оформления заказа мне нужны:\n• Ваше имя\n• Контактный телефон\n• Город доставки\n• Удобный способ связи\n\nСвяжусь в ближайшее время."
		nextStep = "Запросить контакты для оформления."
	case "first_contact":
		reply = greeting + "Спасибо за обращение! Помогу подобрать товар, расскажу про характеристики и условия. Что вас интересует?"
		shortReply = "Здравствуйте! Что интересует?"
		nextStep = "Уточнить потребность клиента."
	default:
		if hasProds {
			reply = greeting + "Спасибо за обращение! Вот что могу предложить по вашему запросу:\n"
			for _, p := range products[:min(5, len(products))] {
				reply += fmt.Sprintf("• %s — %d ₽", p.Name, p.Price)
				if p.Description != "" {
					reply += fmt.Sprintf(" (%s)", p.Description)
				}
				reply += "\n"
			}
			reply += "\nЕсли есть вопросы — спрашивайте!"
			shortReply = "Подобрал варианты по вашему запросу."
			nextStep = "Уточнить детали и предложить оформить."
		} else {
			reply = greeting + "Спасибо за обращение! Уточните, что именно вас интересует — помогу подобрать лучший вариант."
			shortReply = "Здравствуйте! Что интересует?"
			nextStep = "Уточнить потребность клиента."
		}
	}
	return
}

// ═══════════════════════════════════════════════
//  COPILOT LEAD
// ═══════════════════════════════════════════════

func (a *App) handleCopilotCreateLead(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var req struct {
		Name              string `json:"name"`
		Phone             string `json:"phone"`
		Email             string `json:"email"`
		Channel           string `json:"channel"`
		ProductID         string `json:"productId"`
		CustomerNeed      string `json:"customerNeed"`
		Message           string `json:"message"`
		AiReply           string `json:"aiReply"`
		ContactPreference string `json:"contactPreference"`
		DeliveryCity      string `json:"deliveryCity"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	req.Name = strings.TrimSpace(req.Name)
	req.Message = strings.TrimSpace(req.Message)
	req.CustomerNeed = strings.TrimSpace(req.CustomerNeed)
	if req.Message == "" && req.CustomerNeed == "" {
		jsonErr(w, 400, "Укажите сообщение клиента или потребность")
		return
	}
	if len(req.Message) > 2000 {
		req.Message = req.Message[:2000]
	}
	if req.Name == "" {
		req.Name = "Клиент"
	}

	var shopID string
	a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if shopID == "" {
		jsonErr(w, 404, "shop not found")
		return
	}

	var productName string
	if req.ProductID != "" {
		var ownerCheck string
		err := a.db.QueryRow(a.ctx, "SELECT p.name, s.owner_id FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", req.ProductID).
			Scan(&productName, &ownerCheck)
		if err != nil {
			jsonErr(w, 404, "product not found")
			return
		}
		if ownerCheck != claims.Sub {
			jsonErr(w, 403, "product not yours")
			return
		}
	}

	leadID, err := a.createLead(shopID, req.ProductID, "", req.Name, req.Phone, req.Email, req.Message, productName, "copilot", req.AiReply, req.DeliveryCity, req.ContactPreference, req.CustomerNeed)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	jsonOK(w, map[string]interface{}{
		"lead": map[string]interface{}{
			"id": leadID, "name": req.Name, "phone": req.Phone, "email": req.Email,
			"source": "copilot", "productName": productName, "message": req.Message,
			"aiReply": req.AiReply, "channel": req.Channel, "customerNeed": req.CustomerNeed,
		},
	})
}

// ═══════════════════════════════════════════════
//  COMPARE
// ═══════════════════════════════════════════════

func (a *App) handleCompare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductIDs      []string `json:"productIds"`
		CustomerRequest string   `json:"customerRequest,omitempty"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if len(req.ProductIDs) < 2 || len(req.ProductIDs) > 20 {
		jsonErr(w, 400, "compare 2-3 products")
		return
	}

	type CompareProduct struct {
		ID          string   `json:"id"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Benefits    []string `json:"benefits,omitempty"`
		Price       int      `json:"price"`
		OldPrice    *int     `json:"oldPrice,omitempty"`
		Category    string   `json:"category"`
		ShopName    string   `json:"shopName"`
		ShopSlug    string   `json:"shopSlug"`
	}

	var products []CompareProduct
	for _, pid := range req.ProductIDs {
		var p CompareProduct
		err := a.db.QueryRow(a.ctx,
			"SELECT p.id, p.name, p.description, p.benefits, p.price, p.old_price, p.category, s.name, s.slug FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.id=$1 AND p.is_active=true", pid).
			Scan(&p.ID, &p.Name, &p.Description, &p.Benefits, &p.Price, &p.OldPrice, &p.Category, &p.ShopName, &p.ShopSlug)
		if err != nil {
			jsonErr(w, 404, fmt.Sprintf("product %s not found", pid))
			return
		}
		products = append(products, p)
	}

	// Формируем сравнение
	var summary string
	if len(products) == 2 {
		p1, p2 := products[0], products[1]
		if p1.Price < p2.Price {
			summary = fmt.Sprintf("«%s» дешевле «%s» (%d ₽ vs %d ₽). ", p1.Name, p2.Name, p1.Price, p2.Price)
		} else if p1.Price > p2.Price {
			summary = fmt.Sprintf("«%s» дешевле «%s» (%d ₽ vs %d ₽). ", p2.Name, p1.Name, p2.Price, p1.Price)
		} else {
			summary = fmt.Sprintf("«%s» и «%s» стоят одинаково (%d ₽). ", p1.Name, p2.Name, p1.Price)
		}
		if p1.Category != p2.Category {
			summary += fmt.Sprintf("Категории разные: «%s» — %s, «%s» — %s. ", p1.Name, p1.Category, p2.Name, p2.Category)
		}
		summary += "Рекомендуем выбрать исходя из ваших потребностей и уточнить детали у продавца."
	} else if len(products) == 3 {
		cheapest := products[0]
		for _, p := range products {
			if p.Price < cheapest.Price {
				cheapest = p
			}
		}
		summary = fmt.Sprintf("Самый доступный вариант — «%s» за %d ₽. ", cheapest.Name, cheapest.Price)
		summary += "Все товары отличаются по цене и характеристикам. Рекомендуем уточнить детали у продавца."
	}

	jsonOK(w, map[string]interface{}{
		"summary":  summary,
		"products": products,
	})
}

// ═══════════════════════════════════════════════
//  PRODUCT DRAFT (Фаза 4)
// ═══════════════════════════════════════════════

type ProductDraft struct {
	Name        string `json:"name"`
	Price       int    `json:"price"`
	OldPrice    *int   `json:"oldPrice,omitempty"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Benefits    string `json:"benefits"`
	Images      string `json:"images"`
}

func extractPrice(text string) int {
	re := regexp.MustCompile(`(?:цена|price|cost)\s*[:：]?\s*(\d{2,})`)
	if m := re.FindStringSubmatch(text); len(m) > 1 {
		if v, _ := strconv.Atoi(m[1]); v > 0 {
			return v
		}
	}
	re2 := regexp.MustCompile(`(\d{2,})\s*(?:руб|₽|р\.)`)
	if m := re2.FindStringSubmatch(text); len(m) > 1 {
		if v, _ := strconv.Atoi(m[1]); v > 0 {
			return v
		}
	}
	// Standalone number (3-7 digits) that looks like a price
	re3 := regexp.MustCompile(`(?:^|\s|—|–)\d{3,7}(?:\s|$|—|–|,)`)
	if m := re3.FindString(text); m != "" {
		reNum := regexp.MustCompile(`\d{3,7}`)
		if n := reNum.FindString(m); n != "" {
			if v, _ := strconv.Atoi(n); v > 0 {
				return v
			}
		}
	}
	return 0
}

func extractOldPrice(text string) *int {
	re := regexp.MustCompile(`(?:старая цена|old price|было|вместо)\s*[:：]?\s*(\d{2,})`)
	if m := re.FindStringSubmatch(text); len(m) > 1 {
		if v, _ := strconv.Atoi(m[1]); v > 0 {
			return &v
		}
	}
	return nil
}

func extractName(text string) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "-") || strings.HasPrefix(line, "+") || strings.HasPrefix(line, "http") {
			continue
		}
		if len(line) >= 3 && len(line) < 200 {
			// Take first part before comma/dash if it's clearly the name
			short := line
			if idx := strings.IndexAny(short, ","); idx > 0 && idx < 50 {
				short = short[:idx]
			}
			short = strings.TrimRight(short, ".,!?:; ")
			if len(short) > 2 {
				return short
			}
			return strings.TrimRight(line, ".,!?:; ")
		}
	}
	// fallback: first sentence
	if idx := strings.IndexAny(text, ".!?"); idx > 0 {
		return strings.TrimSpace(text[:idx])
	}
	return ""
}

func extractCategory(text string) string {
	lower := strings.ToLower(text)
	rules := map[string][]string{
		"electronics": {"телефон", "iphone", "samsung", "смартфон", "ноутбук", "macbook", "asus", "dell", "наушник", "airpods", "jbl", "приставк", "playstation", "ps5", "xbox", "компьютер", "монитор", "клавиатур", "мышк"},
		"fashion":     {"одежд", "куртк", "футболк", "обув", "кроссовк", "плать", "джинс", "штаны", "шапк", "шарф"},
		"home":        {"мебель", "стол", "диван", "кресл", "стул", "шкаф", "полк", "ковр", "люстр", "светильник"},
		"auto":        {"авто", "машин", "шины", "диск", "запчаст", "масл", "аккумулятор"},
	}
	for cat, keywords := range rules {
		for _, kw := range keywords {
			if strings.Contains(lower, kw) {
				return cat
			}
		}
	}
	return "other"
}

func extractBenefits(text string) string {
	var benefits []string
	lower := strings.ToLower(text)
	if !strings.Contains(lower, "преимуществ") && !strings.Contains(lower, "плюс") {
		return ""
	}
	// Try inline first: "Преимущества: A; B; C"
	re := regexp.MustCompile(`(?i)(?:преимуществ[ао]|плюсы)\s*[:\s]\s*(.+)`)
	if m := re.FindStringSubmatch(text); len(m) > 1 {
		parts := strings.Split(m[1], ";")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" && !strings.HasPrefix(p, "http") {
				benefits = append(benefits, strings.TrimRight(p, ". "))
			}
		}
		if len(benefits) > 0 {
			return strings.Join(benefits, "; ")
		}
	}
	// Fallback: multi-line after marker
	lines := strings.Split(text, "\n")
	inBenefits := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if regexp.MustCompile(`(?i)(?:преимуществ[ао]|плюсы)`).MatchString(trimmed) {
			inBenefits = true
			continue
		}
		if inBenefits {
			if strings.HasPrefix(trimmed, "•") || strings.HasPrefix(trimmed, "-") || strings.HasPrefix(trimmed, "+") || strings.HasPrefix(trimmed, "✓") || strings.HasPrefix(trimmed, "✅") {
				benefits = append(benefits, strings.TrimLeft(trimmed, "•-+✓✅ "))
			} else if len(benefits) > 0 && len(trimmed) < 100 {
				break
			}
		}
	}
	return strings.Join(benefits, "; ")
}

func extractImages(text string) string {
	re := regexp.MustCompile(`https?://[^\s,;"'<>()]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s,;"'<>()]*)?`)
	matches := re.FindAllString(text, -1)
	return strings.Join(matches, "\n")
}

func parseProductDraft(text string) ProductDraft {
	price := extractPrice(text)
	oldPrice := extractOldPrice(text)
	name := extractName(text)
	category := extractCategory(text)
	description := strings.TrimSpace(text)
	benefits := extractBenefits(text)
	images := extractImages(text)

	return ProductDraft{
		Name:        name,
		Price:       price,
		OldPrice:    oldPrice,
		Category:    category,
		Description: description,
		Benefits:    benefits,
		Images:      images,
	}
}

func (a *App) handleProductDraft(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var req struct {
		Text string `json:"text"`
		Mode string `json:"mode"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if strings.TrimSpace(req.Text) == "" {
		jsonErr(w, 400, "text is required")
		return
	}

	draft := parseProductDraft(req.Text)
	jsonOK(w, map[string]interface{}{"draft": draft})
}

func (a *App) handleProductDraftBulk(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var req struct {
		Text string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if strings.TrimSpace(req.Text) == "" {
		jsonErr(w, 400, "text is required")
		return
	}

	// Split by double newline or numbered items
	blocks := splitProductBlocks(req.Text)
	var drafts []ProductDraft
	for _, block := range blocks {
		block = strings.TrimSpace(block)
		if block == "" || len(block) < 3 {
			continue
		}
		drafts = append(drafts, parseProductDraft(block))
	}

	jsonOK(w, map[string]interface{}{"drafts": drafts})
}

func splitProductBlocks(text string) []string {
	// Try numbered list first: "Товар 1:" or "1." or "1)"
	re := regexp.MustCompile(`(?m)^(?:(?:Товар|Product)\s*\d+\s*[:.)]\s*|\d+\s*[.)]\s*)`)
	if re.MatchString(text) {
		parts := re.Split(text, -1)
		var result []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, p)
			}
		}
		if len(result) > 0 {
			return result
		}
	}

	// Try splitting by double newline
	blocks := strings.Split(text, "\n\n")
	var result []string
	for _, b := range blocks {
		b = strings.TrimSpace(b)
		if b != "" {
			result = append(result, b)
		}
	}
	if len(result) > 1 {
		return result
	}

	// Line-by-line: each short non-empty line is a separate product
	lines := strings.Split(text, "\n")
	var singleLineItems []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) >= 3 && len(line) < 300 && !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, "//") {
			singleLineItems = append(singleLineItems, line)
		}
	}
	if len(singleLineItems) > 1 {
		return singleLineItems
	}

	return []string{text}
}

// ═══════════════════════════════════════════════
//  SHOP AVATAR / COVER UPLOAD
// ═══════════════════════════════════════════════

func safeFilename(ext string) string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b) + ext
}

func (a *App) handleUploadShopAvatar(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireBusiness(w, r)
	if !ok {
		return
	}

	var shopID string
	err := a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		writeNotFound(w, "shop not found")
		return
	}

	url, ok := saveUpload(w, a, r, "avatar", "shops", maxAvatarSize)
	if !ok {
		return
	}

	a.db.Exec(a.ctx, "UPDATE shops SET logo_url=$1 WHERE id=$2", url, shopID)
	var shop Shop
	a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE id=$1", shopID).
		Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
	a.recordAuditEvent(r, claims.Sub, claims.Role, "shop.avatar_uploaded", "shop", shopID, shopID, map[string]interface{}{"url": url})
	jsonOK(w, map[string]interface{}{"url": url, "shop": shop})
}

func (a *App) handleUploadShopCover(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireBusiness(w, r)
	if !ok {
		return
	}

	var shopID string
	err := a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		writeNotFound(w, "shop not found")
		return
	}

	url, ok := saveUpload(w, a, r, "cover", "covers", maxCoverSize)
	if !ok {
		return
	}

	a.db.Exec(a.ctx, "UPDATE shops SET cover_url=$1 WHERE id=$2", url, shopID)

	var shop Shop
	a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE id=$1", shopID).
		Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)

	a.recordAuditEvent(r, claims.Sub, claims.Role, "shop.cover_uploaded", "shop", shopID, shopID, map[string]interface{}{"url": url})
	jsonOK(w, map[string]interface{}{"url": url, "shop": shop})
}

// ═══════════════════════════════════════════════
//  CLIENT AVATAR UPLOAD
// ═══════════════════════════════════════════════

func (a *App) handleUploadClientAvatar(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}

	url, ok := saveUpload(w, a, r, "avatar", "avatars", maxAvatarSize)
	if !ok {
		return
	}

	a.db.Exec(a.ctx, "UPDATE profiles SET avatar_url=$1 WHERE id=$2", url, claims.Sub)

	var p Profile
	a.db.QueryRow(a.ctx, "SELECT id, role, COALESCE(display_name,''), COALESCE(email,''), COALESCE(phone,''), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(patronymic,''), COALESCE(birth_date,''), COALESCE(avatar_url,''), COALESCE(delivery_city,''), COALESCE(delivery_address,''), COALESCE(delivery_comment,''), COALESCE(payer_type,''), COALESCE(billing_name,''), COALESCE(billing_company_name,''), COALESCE(billing_inn,'') FROM profiles WHERE id=$1", claims.Sub).Scan(&p.ID, &p.Role, &p.DisplayName, &p.Email, &p.Phone, &p.FirstName, &p.LastName, &p.Patronymic, &p.BirthDate, &p.AvatarUrl, &p.DeliveryCity, &p.DeliveryAddress, &p.DeliveryComment, &p.PayerType, &p.BillingName, &p.BillingCompanyName, &p.BillingInn)
	a.recordAuditEvent(r, claims.Sub, claims.Role, "user.avatar_uploaded", "profile", claims.Sub, "", nil)
	jsonOK(w, map[string]interface{}{"avatarUrl": url, "profile": map[string]interface{}{"id": p.ID, "email": p.Email, "displayName": p.DisplayName, "role": p.Role, "phone": p.Phone, "firstName": p.FirstName, "lastName": p.LastName, "patronymic": p.Patronymic, "birthDate": p.BirthDate, "avatarUrl": p.AvatarUrl, "deliveryCity": p.DeliveryCity, "deliveryAddress": p.DeliveryAddress, "deliveryComment": p.DeliveryComment, "payerType": p.PayerType, "billingName": p.BillingName, "billingCompanyName": p.BillingCompanyName, "billingInn": p.BillingInn}})
}

// ═══════════════════════════════════════════════
//  REVIEWS
// ═══════════════════════════════════════════════

func (a *App) handleGetShopReviews(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var shopID string
	err := a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE slug=$1", slug).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	rows, err := a.db.Query(a.ctx, "SELECT id, author_name, rating, COALESCE(text,''), created_at FROM shop_reviews WHERE shop_id=$1 ORDER BY created_at DESC", shopID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type Review struct {
		ID         string `json:"id"`
		AuthorName string `json:"authorName"`
		Rating     int    `json:"rating"`
		Text       string `json:"text"`
		CreatedAt  string `json:"createdAt"`
	}
	var reviews []Review
	for rows.Next() {
		var rv Review
		var createdAt time.Time
		rows.Scan(&rv.ID, &rv.AuthorName, &rv.Rating, &rv.Text, &createdAt)
		rv.CreatedAt = createdAt.Format(time.RFC3339)
		reviews = append(reviews, rv)
	}

	var ratingSum, reviewsCount int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*), COALESCE(SUM(rating),0) FROM shop_reviews WHERE shop_id=$1", shopID).Scan(&reviewsCount, &ratingSum)
	ratingAvg := 0.0
	if reviewsCount > 0 {
		ratingAvg = float64(ratingSum) / float64(reviewsCount)
	}

	jsonOK(w, map[string]interface{}{
		"reviews":      reviews,
		"ratingAvg":    ratingAvg,
		"reviewsCount": reviewsCount,
	})
}

func (a *App) handleCreateShopReview(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "Только авторизованные пользователи могут оставлять отзывы")
		return
	}
	if claims.Role != "client" {
		jsonErr(w, 403, "Только покупатели могут оставлять отзывы")
		return
	}

	var shopID, ownerID string
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id FROM shops WHERE slug=$1", slug).Scan(&shopID, &ownerID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}
	if ownerID == claims.Sub {
		jsonErr(w, 403, "Владелец не может оставить отзыв своему магазину")
		return
	}

	var orderCount int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1 AND user_id=$2 AND order_status!='cancelled'", shopID, claims.Sub).Scan(&orderCount)
	if orderCount == 0 {
		jsonErr(w, 403, "Отзыв можно оставить только после оформленного заказа в этом магазине")
		return
	}

	var req struct {
		Rating int    `json:"rating"`
		Text   string `json:"text"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Rating < 1 || req.Rating > 5 {
		jsonErr(w, 400, "Рейтинг от 1 до 5")
		return
	}
	if len(req.Text) > 500 {
		jsonErr(w, 400, "Текст отзыва максимум 500 символов")
		return
	}

	// Get author name
	var authorName string
	a.db.QueryRow(a.ctx, "SELECT COALESCE(display_name, email, '') FROM profiles WHERE id=$1", claims.Sub).Scan(&authorName)

	id := newID()
	_, err = a.db.Exec(a.ctx, "INSERT INTO shop_reviews (id, shop_id, user_id, author_name, rating, text) VALUES ($1,$2,$3,$4,$5,$6)", id, shopID, claims.Sub, authorName, req.Rating, req.Text)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"id": id})
}

// ═══════════════════════════════════════════════
//  FOLLOW
// ═══════════════════════════════════════════════

func (a *App) handleFollowShop(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}

	var shopID, ownerID string
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id FROM shops WHERE slug=$1", slug).Scan(&shopID, &ownerID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}
	if ownerID == claims.Sub {
		jsonErr(w, 403, "Нельзя подписаться на свой магазин")
		return
	}

	_, err = a.db.Exec(a.ctx, "INSERT INTO shop_followers (shop_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", shopID, claims.Sub)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}

	var count int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shop_followers WHERE shop_id=$1", shopID).Scan(&count)
	jsonOK(w, map[string]interface{}{"isFollowing": true, "followersCount": count})
}

func (a *App) handleUnfollowShop(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}

	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE slug=$1", slug).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	a.db.Exec(a.ctx, "DELETE FROM shop_followers WHERE shop_id=$1 AND user_id=$2", shopID, claims.Sub)

	var count int
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM shop_followers WHERE shop_id=$1", shopID).Scan(&count)
	jsonOK(w, map[string]interface{}{"isFollowing": false, "followersCount": count})
}

// ═══════════════════════════════════════════════
//  CONTACT SHOP
// ═══════════════════════════════════════════════

func (a *App) handleContactShop(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "Чтобы написать продавцу, необходимо войти в аккаунт")
		return
	}
	_ = claims
	slug := r.PathValue("slug")

	var shopID, ownerID string
	err = a.db.QueryRow(a.ctx, "SELECT id, owner_id FROM shops WHERE slug=$1", slug).Scan(&shopID, &ownerID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	var req struct {
		Name          string `json:"name"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		Message       string `json:"message"`
		PDConsent     *bool  `json:"pd_consent"`
		ConsentSource string `json:"consent_source"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if req.Name == "" || req.Message == "" {
		jsonErr(w, 400, "Имя и сообщение обязательны")
		return
	}
	if !a.requirePersonalDataConsentOrPrior(w, claims.Sub, req.PDConsent) {
		return
	}
	if req.Phone == "" && req.Email == "" {
		jsonErr(w, 400, "Телефон или email обязательны")
		return
	}
	if len(req.Message) > 1000 {
		jsonErr(w, 400, "Сообщение максимум 1000 символов")
		return
	}

	// Check if owner is writing to themselves
	if claims != nil && claims.Sub == ownerID {
		jsonErr(w, 403, "Это ваш магазин")
		return
	}

	customerUserID := ""
	if claims != nil {
		customerUserID = claims.Sub
	}

	id := newID()
	_, err = a.db.Exec(a.ctx, "INSERT INTO leads (id, shop_id, name, phone, email, message, customer_user_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'new')",
		id, shopID, req.Name, req.Phone, req.Email, req.Message, customerUserID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	src := strings.TrimSpace(req.ConsentSource)
	if src == "" {
		src = "shop_contact"
	}
	if customerUserID != "" {
		_ = a.recordUserConsent(r, customerUserID, "personal_data", legalPDConsentVer, src, true)
	}

	jsonOK(w, map[string]interface{}{"ok": true})
}

// ═══════════════════════════════════════════════
//  DASHBOARD STATS
// ═══════════════════════════════════════════════

func (a *App) handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}

	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}

	var productsTotal, productsActive, ordersTotal, ordersNew, leadsTotal, clientsTotal int

	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM products WHERE shop_id=$1", shopID).Scan(&productsTotal)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM products WHERE shop_id=$1 AND is_active=true", shopID).Scan(&productsActive)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1", shopID).Scan(&ordersTotal)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM orders WHERE shop_id=$1 AND order_status='created'", shopID).Scan(&ordersNew)
	a.db.QueryRow(a.ctx, "SELECT COUNT(*) FROM leads WHERE shop_id=$1", shopID).Scan(&leadsTotal)
	a.db.QueryRow(a.ctx, "SELECT COUNT(DISTINCT customer_email) FROM orders WHERE shop_id=$1 AND customer_email!=''", shopID).Scan(&clientsTotal)

	jsonOK(w, map[string]interface{}{
		"productsTotal":  productsTotal,
		"productsActive": productsActive,
		"ordersTotal":    ordersTotal,
		"ordersNew":      ordersNew,
		"leadsTotal":     leadsTotal,
		"clientsTotal":   clientsTotal,
	})
}

// reservedHostLabels must never be treated as shop subdomains.
// www.agent-one.ru/legal was incorrectly redirected to /#/shop/www.
var reservedHostLabels = map[string]struct{}{
	"www": {}, "auth": {}, "api": {}, "cdn": {}, "static": {},
	"mail": {}, "m": {}, "app": {}, "admin": {}, "assets": {},
}

func hostWithoutPort(host string) string {
	if i := strings.Index(host, ":"); i >= 0 {
		return host[:i]
	}
	return host
}

// shopSubdomainFromHost returns a shop slug candidate, or "" for apex / reserved / local hosts.
func shopSubdomainFromHost(host string) string {
	host = strings.ToLower(hostWithoutPort(host))
	if host == "" || strings.Contains(host, "127.0.0.1") {
		return ""
	}
	parts := strings.Split(host, ".")
	if len(parts) < 3 {
		return ""
	}
	if parts[len(parts)-2] == "localhost" {
		return ""
	}
	sub := parts[0]
	if _, reserved := reservedHostLabels[sub]; reserved {
		return ""
	}
	return sub
}

func (a *App) handleSPA(w http.ResponseWriter, r *http.Request) {
	// Проверяем поддомен для продакшена (не www/auth/api и т.п.)
	if subdomain := shopSubdomainFromHost(r.Host); subdomain != "" {
		var shop Shop
		err := a.db.QueryRow(a.ctx, "SELECT id, owner_id, slug, name, description, COALESCE(about,''), category, is_published, logo_url, cover_url, color, ai_tone, custom_domain, COALESCE(phone,''), COALESCE(email,''), COALESCE(city,''), COALESCE(contact_method,''), COALESCE(working_hours,''), show_ai_manager, COALESCE(tagline,''), COALESCE(created_at::text,''), COALESCE(verification_status,'approved') FROM shops WHERE slug=$1", subdomain).
			Scan(&shop.ID, &shop.OwnerID, &shop.Slug, &shop.Name, &shop.Description, &shop.About, &shop.Category, &shop.IsPublished, &shop.LogoURL, &shop.CoverURL, &shop.Color, &shop.AITone, &shop.CustomDomain, &shop.Phone, &shop.Email, &shop.City, &shop.ContactMethod, &shop.WorkingHours, &shop.ShowAiManager, &shop.Tagline, &shop.CreatedAt, &shop.VerificationStatus)
		if err == nil {
			// Поддомен найден — отдаём SPA, он сам загрузит магазин через API
			log.Printf("subdomain: %s → shop %s", subdomain, shop.Slug)
		}
	}
	http.ServeFile(w, r, a.distDir+"/index.html")
}

// handleSubdomain — редирект с поддомена на главную с hash-навигацией
func (a *App) handleSubdomain(w http.ResponseWriter, r *http.Request) {
	if subdomain := shopSubdomainFromHost(r.Host); subdomain != "" {
		http.Redirect(w, r, "/#/shop/"+subdomain, http.StatusTemporaryRedirect)
		return
	}
	http.ServeFile(w, r, a.distDir+"/index.html")
}

// ═══════════════════════════════════════════════
//  FAVORITES
// ═══════════════════════════════════════════════

func (a *App) handleMyFavorites(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unavailable to guests")
		return
	}
	if claims.Role == "business" {
		jsonErr(w, 403, "favorites available for client accounts only")
		return
	}
	rows, err := a.db.Query(a.ctx,
		"SELECT p.id, p.name, p.price, p.old_price, COALESCE(p.category,''), COALESCE(p.brand,''), COALESCE(p.condition,'new'), p.images, s.name AS shop_name, s.slug AS shop_slug, uf.created_at FROM user_favorites uf JOIN products p ON uf.product_id=p.id JOIN shops s ON p.shop_id=s.id WHERE uf.user_id=$1 AND p.is_active=true ORDER BY uf.created_at DESC", claims.Sub)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()
	type FavoritesProduct struct {
		ID        string   `json:"id"`
		Name      string   `json:"name"`
		Price     int      `json:"price"`
		OldPrice  *int     `json:"oldPrice,omitempty"`
		Category  string   `json:"category,omitempty"`
		Brand     string   `json:"brand,omitempty"`
		Condition string   `json:"condition,omitempty"`
		Images    []string `json:"images,omitempty"`
		ShopName  string   `json:"shopName"`
		ShopSlug  string   `json:"shopSlug"`
		CreatedAt string   `json:"createdAt"`
		Favorite  bool     `json:"favorite"`
	}
	var items []FavoritesProduct
	for rows.Next() {
		var p FavoritesProduct
		var images []string
		var createdAt time.Time
		if err := rows.Scan(&p.ID, &p.Name, &p.Price, &p.OldPrice, &p.Category, &p.Brand, &p.Condition, &images, &p.ShopName, &p.ShopSlug, &createdAt); err != nil {
			continue
		}
		p.Images = normalizeImages(images)
		p.CreatedAt = createdAt.Format(time.RFC3339)
		p.Favorite = true
		items = append(items, p)
	}
	if items == nil {
		items = []FavoritesProduct{}
	}
	jsonOK(w, map[string]interface{}{"favorites": items})
}

func (a *App) handleMyFavoritesIDs(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	rows, err := a.db.Query(a.ctx,
		"SELECT uf.product_id FROM user_favorites uf JOIN products p ON uf.product_id=p.id WHERE uf.user_id=$1 AND p.is_active=true", claims.Sub)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	if ids == nil {
		ids = []string{}
	}
	jsonOK(w, map[string]interface{}{"ids": ids})
}

func (a *App) handleAddFavorite(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unavailable to guests")
		return
	}
	if claims.Role == "business" {
		jsonErr(w, 403, "favorites available for client accounts only")
		return
	}
	productID := r.PathValue("productId")
	if productID == "" {
		jsonErr(w, 400, "productId required")
		return
	}
	var exists bool
	a.db.QueryRow(a.ctx, "SELECT EXISTS(SELECT 1 FROM products WHERE id=$1 AND is_active=true)", productID).Scan(&exists)
	if !exists {
		jsonErr(w, 404, "product not found")
		return
	}
	_, err = a.db.Exec(a.ctx,
		"INSERT INTO user_favorites (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", claims.Sub, productID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"ok": true, "productId": productID, "favorite": true})
}

func (a *App) handleRemoveFavorite(w http.ResponseWriter, r *http.Request) {
	claims, ok := a.requireClient(w, r)
	if !ok {
		return
	}
	productID := r.PathValue("productId")
	if productID == "" {
		jsonErr(w, 400, "productId required")
		return
	}
	_, err := a.db.Exec(a.ctx,
		"DELETE FROM user_favorites WHERE user_id=$1 AND product_id=$2", claims.Sub, productID)
	if err != nil {
		jsonErr(w, 500, "db error")
		return
	}
	jsonOK(w, map[string]interface{}{"ok": true, "productId": productID, "favorite": false})
}

// ═══════════════════════════════════════════════
//  APPEALS — unified client inquiries
// ═══════════════════════════════════════════════

func (a *App) handleMyConversations(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "client" {
		jsonErr(w, 403, "forbidden")
		return
	}

	type TopicItem struct {
		ProductID   string `json:"productId,omitempty"`
		ProductName string `json:"productName,omitempty"`
		Count       int    `json:"count"`
	}

	// Group by shop: collect all leads + dialogs for this client
	type shopConv struct {
		ShopID      string `json:"shopId"`
		ShopName    string `json:"shopName"`
		ShopSlug    string `json:"shopSlug"`
		LastPreview string `json:"lastPreview"`
		LastAt      string `json:"lastMessageAt"`
		TopicCount  int    `json:"topicCount"`
		MsgCount    int    `json:"messageCount"`
		Topics      []TopicItem
	}
	shopMap := map[string]*shopConv{}
	var shopList []*shopConv

	// Load leads
	leadRows, _ := a.db.Query(a.ctx,
		`SELECT COALESCE(s.id,''), COALESCE(s.name,''), COALESCE(s.slug,''), l.message, l.customer_need, COALESCE(l.ai_reply,''), l.product_id, COALESCE(p.name,''), COALESCE(l.status_updated_at::text,l.created_at::text)
		FROM leads l JOIN shops s ON l.shop_id=s.id LEFT JOIN products p ON l.product_id=p.id
		WHERE l.customer_user_id=$1`, claims.Sub)
	if leadRows != nil {
		defer leadRows.Close()
		for leadRows.Next() {
			var shopID, shopName, shopSlug, msg, need, aiReply, productID, productName, date string
			leadRows.Scan(&shopID, &shopName, &shopSlug, &msg, &need, &aiReply, &productID, &productName, &date)
			sc, ok := shopMap[shopID]
			if !ok {
				sc = &shopConv{ShopID: shopID, ShopName: shopName, ShopSlug: shopSlug}
				shopMap[shopID] = sc
				shopList = append(shopList, sc)
			}
			preview := msg
			if preview == "" {
				preview = need
			}
			if preview == "" {
				preview = aiReply
			}
			if date > sc.LastAt {
				sc.LastAt = date
				sc.LastPreview = truncate(preview, 120)
			}
			sc.MsgCount++
			pid := productID
			if pid == "" {
				pid = "_general"
			}
			found := false
			for i, t := range sc.Topics {
				if t.ProductID == pid {
					sc.Topics[i].Count++
					found = true
					break
				}
			}
			if !found {
				sc.Topics = append(sc.Topics, TopicItem{ProductID: productID, ProductName: productName, Count: 1})
			}
		}
	}

	// Load dialogs
	dialogRows, _ := a.db.Query(a.ctx,
		`SELECT COALESCE(s.id,''), COALESCE(s.name,''), COALESCE(s.slug,''), COALESCE(d.last_message,''), d.product_id, COALESCE(p.name,''), COALESCE(d.updated_at::text,d.created_at::text)
		FROM ai_manager_dialogs d JOIN shops s ON d.shop_id=s.id LEFT JOIN products p ON d.product_id=p.id
		WHERE d.client_user_id=$1`, claims.Sub)
	if dialogRows != nil {
		defer dialogRows.Close()
		for dialogRows.Next() {
			var shopID, shopName, shopSlug, lastMsg, productID, productName, date string
			dialogRows.Scan(&shopID, &shopName, &shopSlug, &lastMsg, &productID, &productName, &date)
			sc, ok := shopMap[shopID]
			if !ok {
				sc = &shopConv{ShopID: shopID, ShopName: shopName, ShopSlug: shopSlug}
				shopMap[shopID] = sc
				shopList = append(shopList, sc)
			}
			if date > sc.LastAt {
				sc.LastAt = date
				sc.LastPreview = truncate(lastMsg, 120)
			}
			sc.MsgCount++
			pid := productID
			if pid == "" {
				pid = "_general"
			}
			found := false
			for i, t := range sc.Topics {
				if t.ProductID == pid {
					sc.Topics[i].Count++
					found = true
					break
				}
			}
			if !found {
				sc.Topics = append(sc.Topics, TopicItem{ProductID: productID, ProductName: productName, Count: 1})
			}
		}
	}

	// Set topic counts
	for _, sc := range shopList {
		sc.TopicCount = len(sc.Topics)
	}

	// Sort by last activity
	sort.Slice(shopList, func(i, j int) bool { return shopList[i].LastAt > shopList[j].LastAt })

	// Pagination
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 20
	}
	totalShops := len(shopList)
	totalPages := (totalShops + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}
	start := (page - 1) * limit
	var paged []*shopConv
	if start < len(shopList) {
		end := start + limit
		if end > len(shopList) {
			end = len(shopList)
		}
		paged = shopList[start:end]
	}
	if paged == nil {
		paged = []*shopConv{}
	}

	if shopList == nil {
		shopList = []*shopConv{}
	}
	jsonOK(w, map[string]interface{}{"shops": paged, "page": page, "limit": limit, "total": totalShops, "totalPages": totalPages})
}

// handleMyConversationShop returns all topics+messages for a specific shop
func (a *App) handleMyConversationShop(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil || claims.Sub == "" {
		jsonErr(w, 401, "unauthorized")
		return
	}
	shopID := r.PathValue("shopId")
	if shopID == "" {
		jsonErr(w, 400, "invalid shopId")
		return
	}

	type MsgItem struct {
		ID          string `json:"id"`
		SenderType  string `json:"senderType"` // "client" or "shop"
		Text        string `json:"text"`
		CreatedAt   string `json:"createdAt"`
		ProductID   string `json:"productId,omitempty"`
		ProductName string `json:"productName,omitempty"`
		SourceType  string `json:"sourceType,omitempty"` // "ai_reply", "seller_reply", "question"
	}

	var messages []MsgItem

	// Leads for this shop
	lRows, _ := a.db.Query(a.ctx,
		`SELECT l.id, l.message, COALESCE(l.ai_reply,''), COALESCE(l.created_at::text,''), COALESCE(l.product_id,''), COALESCE(p.name,'')
		FROM leads l LEFT JOIN products p ON l.product_id=p.id
		WHERE l.shop_id=$1 AND l.customer_user_id=$2 ORDER BY l.created_at ASC`, shopID, claims.Sub)
	if lRows != nil {
		defer lRows.Close()
		for lRows.Next() {
			var id, msg, aiReply, createdAt, productID, productName string
			lRows.Scan(&id, &msg, &aiReply, &createdAt, &productID, &productName)
			if msg != "" {
				messages = append(messages, MsgItem{ID: id + "_q", SenderType: "client", Text: msg, CreatedAt: createdAt, ProductID: productID, ProductName: productName, SourceType: "question"})
			}
			if aiReply != "" {
				messages = append(messages, MsgItem{ID: id + "_a", SenderType: "shop", Text: aiReply, CreatedAt: createdAt, ProductID: productID, ProductName: productName, SourceType: "ai_reply"})
			}
		}
	}

	// Dialogs for this shop
	dRows, _ := a.db.Query(a.ctx,
		`SELECT d.id, COALESCE(d.last_message,''), COALESCE(d.updated_at::text,d.created_at::text), COALESCE(d.product_id,''), COALESCE(p.name,'')
		FROM ai_manager_dialogs d LEFT JOIN products p ON d.product_id=p.id
		WHERE d.shop_id=$1 AND d.client_user_id=$2 ORDER BY d.updated_at ASC`, shopID, claims.Sub)
	if dRows != nil {
		defer dRows.Close()
		for dRows.Next() {
			var id, msg, createdAt, productID, productName string
			dRows.Scan(&id, &msg, &createdAt, &productID, &productName)
			if msg != "" {
				messages = append(messages, MsgItem{ID: id, SenderType: "unknown", Text: msg, CreatedAt: createdAt, ProductID: productID, ProductName: productName, SourceType: "dialog"})
			}
		}
	}

	// Sort by time
	sort.Slice(messages, func(i, j int) bool { return messages[i].CreatedAt < messages[j].CreatedAt })

	if messages == nil {
		messages = []MsgItem{}
	}
	jsonOK(w, map[string]interface{}{"shopId": shopID, "messages": messages})
}

func mapLeadStatus(s string) string {
	switch s {
	case "answered":
		return "answered"
	case "closed", "cancelled":
		return "closed"
	case "lead_created", "taken_over":
		return "answered"
	default:
		return "waiting"
	}
}

// ═══════════════════════════════════════════════
//  BUSINESS VERIFICATION
// ═══════════════════════════════════════════════

func (a *App) requireApprovedBusiness(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return "", "", false
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return "", "", false
	}
	var shopID, status string
	err = a.db.QueryRow(a.ctx, "SELECT id, COALESCE(verification_status,'approved') FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID, &status)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return "", "", false
	}
	return shopID, status, true
}

func (a *App) handleGetBusinessVerification(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		jsonErr(w, 401, "unauthorized")
		return
	}
	if claims.Role != "business" {
		jsonErr(w, 403, "business only")
		return
	}
	var shopID, vStatus string
	err = a.db.QueryRow(a.ctx, "SELECT id, COALESCE(verification_status,'approved') FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID, &vStatus)
	if err != nil {
		jsonErr(w, 404, "shop not found")
		return
	}
	var app struct {
		ID, OrgName, Inn, Ogrn, LegalAddress, ContactPhone, Status, SubmittedAt, ReviewedAt, RejectionReason string
	}
	err = a.db.QueryRow(a.ctx, "SELECT id, org_name, COALESCE(inn,''), COALESCE(ogrn,''), COALESCE(legal_address,''), COALESCE(contact_phone,''), status, COALESCE(submitted_at::text,''), COALESCE(reviewed_at::text,''), COALESCE(rejection_reason,'') FROM business_verifications WHERE shop_id=$1 ORDER BY submitted_at DESC LIMIT 1", shopID).
		Scan(&app.ID, &app.OrgName, &app.Inn, &app.Ogrn, &app.LegalAddress, &app.ContactPhone, &app.Status, &app.SubmittedAt, &app.ReviewedAt, &app.RejectionReason)
	if err != nil {
		jsonOK(w, map[string]interface{}{"status": vStatus, "application": nil, "shopId": shopID})
		return
	}
	jsonOK(w, map[string]interface{}{"status": vStatus, "application": map[string]interface{}{
		"id": app.ID, "orgName": app.OrgName, "inn": app.Inn, "ogrn": app.Ogrn,
		"legalAddress": app.LegalAddress, "contactPhone": app.ContactPhone,
		"status": app.Status, "submittedAt": app.SubmittedAt, "reviewedAt": app.ReviewedAt,
		"rejectionReason": app.RejectionReason,
	}, "shopId": shopID})
}

func (a *App) handlePostBusinessVerification(w http.ResponseWriter, r *http.Request) {
	claims, err := a.auth(r)
	if err != nil {
		writeUnauthorized(w)
		return
	}
	if claims.Role != "business" {
		writeForbidden(w, "business only")
		return
	}
	var shopID string
	err = a.db.QueryRow(a.ctx, "SELECT id FROM shops WHERE owner_id=$1 LIMIT 1", claims.Sub).Scan(&shopID)
	if err != nil {
		writeNotFound(w, "shop not found")
		return
	}
	var req struct {
		OrgName      string `json:"orgName"`
		Inn          string `json:"inn"`
		Ogrn         string `json:"ogrn"`
		LegalAddress string `json:"legalAddress"`
		ContactPhone string `json:"contactPhone"`
	}
	if !decodeJSONBody(w, r, &req, 1<<18) {
		return
	}
	if strings.TrimSpace(req.OrgName) == "" || strings.TrimSpace(req.ContactPhone) == "" {
		writeBadRequest(w, "orgName and contactPhone required")
		return
	}
	id := newID()
	a.db.Exec(a.ctx, "INSERT INTO business_verifications (id, user_id, shop_id, org_name, inn, ogrn, legal_address, contact_phone, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')",
		id, claims.Sub, shopID, req.OrgName, req.Inn, req.Ogrn, req.LegalAddress, req.ContactPhone)
	a.db.Exec(a.ctx, "UPDATE shops SET verification_status='pending' WHERE id=$1", shopID)
	a.recordAuditEvent(r, claims.Sub, claims.Role, "business.verification.submitted", "shop", shopID, shopID, map[string]interface{}{"orgName": req.OrgName})
	jsonOK(w, map[string]interface{}{"status": "pending", "shopId": shopID})
}

func (a *App) handleDevApproveVerification(w http.ResponseWriter, r *http.Request) {
	token := envString("DEV_ADMIN_TOKEN", "dev-secret")
	if r.Header.Get("X-Dev-Admin-Token") != token {
		jsonErr(w, 401, "dev only")
		return
	}
	shopID := r.PathValue("shopId")
	a.db.Exec(a.ctx, "UPDATE shops SET verification_status='approved' WHERE id=$1", shopID)
	a.db.Exec(a.ctx, "UPDATE business_verifications SET status='approved', reviewed_at=NOW() WHERE shop_id=$1 AND status='pending'", shopID)
	a.recordAuditEvent(r, "dev-admin", "admin", "business.verification.approved", "shop", shopID, shopID, nil)
	jsonOK(w, map[string]interface{}{"ok": true, "shopId": shopID, "status": "approved"})
}

func (a *App) handleDevRejectVerification(w http.ResponseWriter, r *http.Request) {
	token := envString("DEV_ADMIN_TOKEN", "dev-secret")
	if r.Header.Get("X-Dev-Admin-Token") != token {
		jsonErr(w, 401, "dev only")
		return
	}
	shopID := r.PathValue("shopId")
	var req struct {
		Reason string `json:"reason"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	a.db.Exec(a.ctx, "UPDATE shops SET verification_status='rejected' WHERE id=$1", shopID)
	a.db.Exec(a.ctx, "UPDATE business_verifications SET status='rejected', rejection_reason=$2, reviewed_at=NOW() WHERE shop_id=$1 AND status='pending'", shopID, req.Reason)
	a.recordAuditEvent(r, "dev-admin", "admin", "business.verification.rejected", "shop", shopID, shopID, map[string]interface{}{"reason": req.Reason})
	jsonOK(w, map[string]interface{}{"ok": true, "shopId": shopID, "status": "rejected"})
}

// ── MAIN ──

func main() {
	envCandidates := []string{".env", "../.env", "../../.env"}
	for _, p := range envCandidates {
		f, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(f), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 && os.Getenv(parts[0]) == "" {
				os.Setenv(parts[0], strings.Trim(parts[1], "\"'"))
			}
		}
		break
	}

	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		dbConnStr = "postgres://localhost:5432/agentone?sslmode=disable"
	}

	secCfg := LoadAccountSecurityConfig()
	issues := secCfg.Validate()
	for _, i := range issues {
		slog.Error("config_error", "msg", i)
	}
	if len(issues) > 0 {
		log.Fatal("account security config validation failed")
	}
	if isProduction() {
		issues = secCfg.ValidateProduction()
		for _, i := range issues {
			slog.Error("config_error", "msg", i)
		}
		if len(issues) > 0 {
			log.Fatal("account security production config validation failed")
		}
	}

	db, err := initDB(dbConnStr)
	if err != nil {
		log.Fatal("db:", err)
	}
	defer db.Close()

	jwtSecret := os.Getenv("JWT_SECRET")
	var jwtKey []byte
	if jwtSecret == "" {
		jwtKey = make([]byte, 32)
		rand.Read(jwtKey)
	} else {
		jwtKey = []byte(jwtSecret)
	}

	aiCfg := loadAIConfig()
	initCORS()
	refreshCookieDomain = envString("REFRESH_COOKIE_DOMAIN", "")
	if refreshCookieDomain != "" && isProduction() {
		slog.Info("refresh_cookie_domain", "domain", refreshCookieDomain)
	}
	startAuthLimiterCleanup()
	InitRedis()

	app := &App{db: db, jwtKey: jwtKey, aiKey: os.Getenv("OPENMODEL_API_KEY"), ctx: context.Background(), distDir: resolveDistDir(), uploadsDir: resolveUploadsDir(), aiProvider: NewAIProvider(aiCfg), secCfg: secCfg, emailSender: &noopEmailSender{}}
	if app.aiKey == "" {
		app.aiKey = os.Getenv("OPENROUTER_API_KEY")
	}
	log.Printf("AI provider=%s model=%s configured=%v fallback=%v", aiCfg.Provider, aiCfg.Model, aiCfg.Enabled(), aiCfg.FallbackEnabled)
	if !aiCfg.Enabled() {
		log.Printf("AI provider disabled: GROQ_API_KEY is empty")
	}
	log.Printf("Dist dir: %s", app.distDir)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	// Static files
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(app.distDir+"/assets/"))))
	mux.HandleFunc("GET /brand-mark.png", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, app.distDir+"/brand-mark.png")
	})
	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, app.distDir+"/brand-mark.png")
	})

	// API — используем Go 1.22+ PathValue
	mux.HandleFunc("GET /api/health", app.handleHealth)
	mux.HandleFunc("GET /api/live", handleLiveness)
	mux.HandleFunc("GET /api/ready", handleReadiness)
	mux.HandleFunc("GET /api/metrics", handleMetrics)
	mux.HandleFunc("GET /api/ops/status", handleOpsStatus)
	mux.HandleFunc("GET /api/shops", app.handleShops)
	mux.HandleFunc("GET /api/shop/{slug}", app.handleShopBySlug)
	mux.HandleFunc("POST /api/shop/{slug}/chat", app.handleShopChat)
	mux.HandleFunc("GET /api/shop-by-domain", app.handleShopByDomain)
	mux.HandleFunc("POST /api/auth/signup", app.handleSignup)
	mux.HandleFunc("POST /api/auth/signin", app.handleSignin)
	mux.HandleFunc("POST /api/auth/refresh", app.handleRefresh)
	mux.HandleFunc("POST /api/auth/logout", app.handleLogout)
	mux.HandleFunc("POST /api/auth/logout-all", app.handleLogoutAll)
	mux.HandleFunc("POST /api/auth/email-verification/request", app.handleEmailVerificationRequest)
	mux.HandleFunc("POST /api/auth/email-verification/verify", app.handleEmailVerificationVerify)
	mux.HandleFunc("GET /api/auth/me", app.handleMe)
	mux.HandleFunc("PUT /api/auth/profile", app.handleUpdateProfile)
	mux.HandleFunc("POST /api/shop", app.handleCreateShop)
	mux.HandleFunc("PUT /api/my/shop", app.handleUpdateMyShop)
	mux.HandleFunc("POST /api/leads", app.handleCreateLead)
	mux.HandleFunc("GET /api/my/leads", app.handleMyLeads)
	mux.HandleFunc("PUT /api/business/leads/{id}/status", app.handleUpdateLeadStatus)
	mux.HandleFunc("GET /api/my/shop", app.handleMyShop)
	mux.HandleFunc("POST /api/search", app.handleSearch)
	mux.HandleFunc("POST /api/search/smart", app.handleSmartSearch)
	mux.HandleFunc("POST /api/assistant/chat", app.handleAssistantChat)
	mux.HandleFunc("POST /api/products", app.handleCreateProduct)
	mux.HandleFunc("POST /api/ai/generate", app.handleAIGenerate)

	// Фаза 1 — новые endpoints
	mux.HandleFunc("GET /api/products", app.handleProducts)
	mux.HandleFunc("GET /api/products/{id}", app.handleProductByID)
	mux.HandleFunc("POST /api/products/batch", app.handleProductsBatch)
	mux.HandleFunc("GET /api/catalog/facets", app.handleCatalogFacets)
	mux.HandleFunc("POST /api/orders", app.handleCreateOrder)
	mux.HandleFunc("GET /api/my/orders", app.handleMyOrders)
	mux.HandleFunc("GET /api/business/orders", app.handleBusinessOrders)
	mux.HandleFunc("PUT /api/business/orders/{id}/status", app.handleUpdateOrderStatus)
	mux.HandleFunc("GET /api/business/products", app.handleBusinessProducts)
	mux.HandleFunc("PUT /api/products/{id}", app.handleUpdateProduct)
	mux.HandleFunc("DELETE /api/products/{id}", app.handleDeleteProduct)
	mux.HandleFunc("GET /api/business/payment-settings", app.handleGetPaymentSettings)
	mux.HandleFunc("PUT /api/business/payment-settings", app.handleUpdatePaymentSettings)
	mux.HandleFunc("POST /api/business/copilot/reply", app.handleCopilotReply)
	mux.HandleFunc("POST /api/business/copilot/leads", app.handleCopilotCreateLead)
	mux.HandleFunc("POST /api/compare", app.handleCompare)
	mux.HandleFunc("POST /api/compare/ai", app.handleCompareAI)
	mux.HandleFunc("POST /api/products/{id}/contact", app.handleProductContact)
	mux.HandleFunc("GET /api/business/dashboard/stats", app.handleDashboardStats)

	// AI Manager 24/7
	mux.HandleFunc("POST /api/ai-manager/chat", app.handleAIManagerChat)
	mux.HandleFunc("GET /api/my/ai-manager/dialogs", app.handleGetMyAIManagerDialogs)
	mux.HandleFunc("GET /api/my/ai-manager/dialogs/{id}", app.handleGetMyAIManagerDialog)
	mux.HandleFunc("POST /api/my/ai-manager/dialogs/{id}/lead", app.handleCreateAIManagerLead)
	mux.HandleFunc("GET /api/business/ai-manager/settings", app.handleGetBusinessAIManagerSettings)
	mux.HandleFunc("PUT /api/business/ai-manager/settings", app.handleUpdateBusinessAIManagerSettings)
	mux.HandleFunc("GET /api/business/ai-manager/dialogs", app.handleGetBusinessAIManagerDialogs)
	mux.HandleFunc("GET /api/business/ai-manager/dialogs/{id}", app.handleGetBusinessAIManagerDialog)
	mux.HandleFunc("POST /api/business/ai-manager/dialogs/{id}/takeover", app.handleBusinessTakeoverDialog)
	mux.HandleFunc("POST /api/business/ai-manager/dialogs/{id}/reply", app.handleBusinessReplyDialog)
	mux.HandleFunc("PUT /api/business/ai-manager/dialogs/{id}/status", app.handleBusinessUpdateDialogStatus)
	mux.HandleFunc("POST /api/business/ai-manager/dialogs/{id}/lead", app.handleBusinessCreateAIManagerLead)

	// Favorites
	mux.HandleFunc("GET /api/my/favorites", app.handleMyFavorites)
	mux.HandleFunc("GET /api/my/favorites/ids", app.handleMyFavoritesIDs)
	mux.HandleFunc("POST /api/my/favorites/{productId}", app.handleAddFavorite)
	mux.HandleFunc("DELETE /api/my/favorites/{productId}", app.handleRemoveFavorite)

	// Appeals
	mux.HandleFunc("GET /api/my/appeals", app.handleMyConversations)
	mux.HandleFunc("GET /api/my/appeals/{shopId}", app.handleMyConversationShop)

	// Business verification
	mux.HandleFunc("GET /api/business/verification", app.handleGetBusinessVerification)
	mux.HandleFunc("POST /api/business/verification", app.handlePostBusinessVerification)
	mux.HandleFunc("GET /api/business/onboarding", app.handleGetBusinessOnboarding)
	mux.HandleFunc("POST /api/business/onboarding", app.handlePostBusinessOnboarding)
	mux.HandleFunc("POST /api/dev/business-verification/{shopId}/approve", app.handleDevApproveVerification)
	mux.HandleFunc("POST /api/dev/business-verification/{shopId}/reject", app.handleDevRejectVerification)

	// Фаза 4 — умное добавление товаров
	mux.HandleFunc("POST /api/business/products/draft", app.handleProductDraft)
	mux.HandleFunc("POST /api/business/products/draft-bulk", app.handleProductDraftBulk)

	// Yandex OAuth
	mux.HandleFunc("GET /api/auth/oauth/yandex/start", app.handleYandexOAuthStart)
	mux.HandleFunc("GET /api/auth/oauth/yandex/callback", app.handleYandexOAuthCallback)
	mux.HandleFunc("GET /api/auth/providers", yandexProvidersHandler)

	// Legal compliance
	mux.HandleFunc("GET /api/legal/meta", app.handleLegalMeta)
	mux.HandleFunc("POST /api/legal/consents", app.handleRecordConsent)
	mux.HandleFunc("POST /api/legal/consents/withdraw", app.handleWithdrawConsent)
	mux.HandleFunc("GET /api/legal/consents", app.handleMyConsents)
	mux.HandleFunc("GET /api/legal/deploy-check", handleLegalDeployCheck)

	// Uploads
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(app.uploadsDir))))

	// Shop profile
	mux.HandleFunc("POST /api/my/shop/avatar", app.handleUploadShopAvatar)
	mux.HandleFunc("POST /api/my/shop/cover", app.handleUploadShopCover)
	mux.HandleFunc("POST /api/my/avatar", app.handleUploadClientAvatar)
	mux.HandleFunc("GET /api/shops/{slug}/reviews", app.handleGetShopReviews)
	mux.HandleFunc("POST /api/shops/{slug}/reviews", app.handleCreateShopReview)
	mux.HandleFunc("POST /api/shops/{slug}/follow", app.handleFollowShop)
	mux.HandleFunc("DELETE /api/shops/{slug}/follow", app.handleUnfollowShop)
	mux.HandleFunc("POST /api/shops/{slug}/contact", app.handleContactShop)

	// Demo products static files
	demoDir := filepath.Join(app.distDir, "demo-products")
	mux.HandleFunc("GET /demo-products/", func(w http.ResponseWriter, r *http.Request) {
		http.StripPrefix("/demo-products/", http.FileServer(http.Dir(demoDir))).ServeHTTP(w, r)
	})

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, app.distDir+"/index.html")
	})

	// SPA fallback + API 404 — всё остальное
	mux.HandleFunc("/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			jsonErr(w, 404, "Эндпоинт не найден")
			return
		}
		// Shop subdomains only — never treat www/auth/api as a shop
		// (www.agent-one.ru/legal must serve the legal SPA, not /#/shop/www).
		if subdomain := shopSubdomainFromHost(r.Host); subdomain != "" {
			http.Redirect(w, r, "/#/shop/"+subdomain, http.StatusTemporaryRedirect)
			return
		}
		app.handleSPA(w, r)
	})

	// Set readiness pinger
	readinessPinger = db

	server := &http.Server{
		Addr:           ":" + port,
		Handler:        metricsMiddleware(recoveryMiddleware(loggingMiddleware(requestIDMiddleware(rateLimitMiddleware(bodyLimitMiddleware(securityHeadersMiddleware(corsMiddleware(mux)))))))),
		ReadTimeout:    serverReadTimeout(),
		WriteTimeout:   serverWriteTimeout(),
		IdleTimeout:    serverIdleTimeout(),
		MaxHeaderBytes: serverMaxHeaderBytes(),
	}

	conn, _ := net.Dial("udp", "8.8.8.8:80")
	localIP := "localhost"
	if conn != nil {
		host, _, _ := net.SplitHostPort(conn.LocalAddr().String())
		localIP = host
		conn.Close()
	}

	logBuildMeta()
	log.Printf("🚀 AGENT.ONE — %s", port)
	log.Printf("   Local:   http://localhost:%s", port)
	if localIP != "localhost" {
		log.Printf("   Network: http://%s:%s", localIP, port)
	}
	log.Printf("   Shop:    http://localhost:%s/test-shop", port)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
		sig := <-sigCh
		slog.Info("shutdown_requested", "signal", sig.String())
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("http_shutdown_error", "err", err.Error())
		} else {
			slog.Info("http_shutdown_complete")
		}
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("server:", err)
	}

	db.Close()
	slog.Info("database_close_complete")
	slog.Info("shutdown_complete")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if corsAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer-when-downgrade")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
