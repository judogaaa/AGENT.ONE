/* ─── STORE (state machine) ─── */
import { getProductMainImage } from '../utils/productImages';
import { loadFunctionalJSON, saveFunctionalJSON, clearFunctionalStorage } from '../../../shared/legal/functionalStorage.js';

const API = '/api';

const ONBOARDING_DONE = new Set(['completed', 'pending_review', 'verified'])

export function requiresBusinessOnboarding(user) {
  if (!user || user.role !== 'business') return false
  const status = user.onboarding && user.onboarding.status
  if (!status) return false
  return !ONBOARDING_DONE.has(status)
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function persistFunctional(key, value) {
  saveFunctionalJSON(key, value);
}

export const store = {
  user: loadJSON('profile', null),
  token: localStorage.getItem('token') || null,
  authChecked: false,
  authLoading: false,
  page: 'home',
  authMode: null,
  authRole: null,
  authModal: false,
  pendingAction: null,
  shops: [],
  products: [],
  currentShop: null,
  currentProducts: [],
  currentSlug: '',
  leads: [],
  chatOpen: false,
  chatMessages: [],
  chatConvId: '',
  leadFormOpen: false,
  leadProductId: null,
  searchQuery: '',
  searchResults: [],
  searchSummary: '',
  smartSearchLoading: false,
  smartSearchResult: null,
  smartSearchError: '',
  catalogFacets: null,
  catalogFacetsLoading: false,
  allProducts: [],
  selectedProduct: null,
  cartItems: loadFunctionalJSON('cart', []),
  compareItems: loadFunctionalJSON('compare', []),
  myOrders: [],
  listeners: [],

  applyCookieCategories(categories) {
    if (categories?.functional) return;
    this.cartItems = [];
    this.compareItems = [];
    clearFunctionalStorage();
    this.notify();
  },

  shopReviews: [],
  shopRatingAvg: 0,
  shopReviewsCount: 0,
  shopFollowersCount: 0,
  shopIsFollowing: false,
  shopJoinedYear: '',
  shopTrustStatus: '',
  shopOrdersCount: 0,
  contactSent: false,
  toast: null,
  productsError: '',
  compareAutoAIRequestId: 0,

  // AI Manager 24/7
  aiManagerSettings: null,
  aiManagerDialogs: [],
  aiManagerDialog: null,
  aiManagerMessages: [],
  aiManagerTotal: 0,
  aiManagerCounts: { open: 0, waiting_seller: 0, lead_created: 0, taken_over: 0, closed: 0, total: 0 },
  aiManagerLoading: false,
  aiManagerError: '',

  // Refresh single-flight
  _refreshPromise: null,
  _refreshInFlight: false,

  // Favorites
  favoriteIds: [],
  favorites: [],
  favoritesLoading: false,
  accountTab: 'orders',

  // Appeals
  appeals: [],
  appealsCounts: { all: 0, waiting: 0, answered: 0, closed: 0, page: 1, totalPages: 1 },

  subscribe(fn) { this.listeners.push(fn); },
  notify() { this.listeners.forEach(fn => fn()); },

  showToast(message, type='success') {
    this.toast = { message, type };
    this.notify();
    setTimeout(() => { this.toast = null; this.notify(); }, 2500);
  },

  setPage(page) {
    if (page === 'dashboard' && requiresBusinessOnboarding(this.user)) {
      page = 'business-onboarding';
    }
    this.page = page;
    this.notify();
  },
  setDashboardTab(tab) {
    this.dashboardTab = tab || 'overview';
    this.notify();
  },
  openAuthModal() { this.authModal = true; this.notify(); },
  closeAuthModal() { this.authModal = false; this.notify(); },
  setPendingAction(action) {
    this.pendingAction = action && typeof action.run === 'function' ? action : null;
    this.notify();
  },
  clearPendingAction() {
    this.pendingAction = null;
    this.notify();
  },
  requireAuth(run, opts = {}) {
    if (this.user && this.token) {
      this.clearPendingAction();
      if (typeof run === 'function') run();
      return true;
    }
    this.setPendingAction({ run: typeof run === 'function' ? run : null, opts });
    this.openAuthModal();
    return false;
  },
  setUser(user, token) {
    this.user = user; this.token = token;
    localStorage.setItem('profile', JSON.stringify(user));
    localStorage.setItem('token', token);
    this.notify();
    if (user?.role === 'client') this.loadFavoriteIds();
  },
  logout() {
    fetch(API + '/auth/logout', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    this.user = null; this.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    this.page = 'home';
    this.dashboardTab = 'overview';
    this.currentShop = null;
    this.dashboardStats = null;
    this.myLeads = [];
    this.myOrders = [];
    this.businessProducts = [];
    this.favoriteIds = [];
    this.favorites = [];
    this.authChecked = false;
    this.authLoading = false;
    this.notify();
  },
  setShops(shops) { this.shops = shops; this.notify(); },
  setProducts(products) { this.products = products; this.notify(); },
  setCurrentShop(shop, products) { this.currentShop = shop; this.currentProducts = products; this.notify(); },
  setLeads(leads) { this.leads = leads; this.notify(); },
  setChatOpen(open) { this.chatOpen = open; this.notify(); },
  setChatMessages(msgs) { this.chatMessages = msgs; this.notify(); },
  setChatConvId(id) { this.chatConvId = id; this.notify(); },
  setLeadForm(open, productId) { this.leadFormOpen = open; this.leadProductId = productId; this.notify(); },

  async api(path, opts = {}) {
    const h = { 'Content-Type': 'application/json', ...opts.headers };
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    try {
      const r = await fetch(API + path, { ...opts, headers: h });
      const d = await r.json();

      if (r.status === 401) {
        if (path === '/auth/refresh' || path === '/auth/signin' || path === '/auth/signup') {
          throw new Error('╨б╨╡╤Б╤Б╨╕╤П ╨╕╤Б╤В╨╡╨║╨╗╨░. ╨Т╨╛╨╣╨┤╨╕╤В╨╡ ╨╖╨░╨╜╨╛╨▓╨╛.');
        }
        let refreshData;
        try {
          refreshData = await this._doRefresh();
        } catch {
          if (path === '/auth/me') this.logout();
          throw new Error('╨б╨╡╤Б╤Б╨╕╤П ╨╕╤Б╤В╨╡╨║╨╗╨░. ╨Т╨╛╨╣╨┤╨╕╤В╨╡ ╨╖╨░╨╜╨╛╨▓╨╛.');
        }
        this.setUser(refreshData.profile, refreshData.token);
        h.Authorization = 'Bearer ' + refreshData.token;
        const r2 = await fetch(API + path, { ...opts, headers: h });
        const d2 = await r2.json();
        if (r2.status === 401) {
          this.logout();
          throw new Error('╨б╨╡╤Б╤Б╨╕╤П ╨╕╤Б╤В╨╡╨║╨╗╨░. ╨Т╨╛╨╣╨┤╨╕╤В╨╡ ╨╖╨░╨╜╨╛╨▓╨╛.');
        }
        if (!r2.ok || !d2.ok) {
          throw new Error(mapError(d2.error) || 'HTTP ' + r2.status);
        }
        return d2.data;
      }

      if (r.status === 403) {
        throw new Error('╨Э╨╡╨┤╨╛╤Б╤В╨░╤В╨╛╤З╨╜╨╛ ╨┐╤А╨░╨▓ ╨┤╨╗╤П ╤Н╤В╨╛╨│╨╛ ╨┤╨╡╨╣╤Б╤В╨▓╨╕╤П.');
      }
      if (!r.ok || !d.ok) {
        throw new Error(mapError(d.error) || 'HTTP ' + r.status);
      }
      return d.data;
    } catch (e) {
      if (e.message === 'Failed to fetch') throw new Error('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨┤╨░╨╜╨╜╤Л╨╡. ╨Я╤А╨╛╨▓╨╡╤А╤М╤В╨╡ ╤Б╨╡╤А╨▓╨╡╤А.');
      if (e.name === 'SyntaxError') throw new Error('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨┤╨░╨╜╨╜╤Л╨╡. ╨Я╤А╨╛╨▓╨╡╤А╤М╤В╨╡ ╤Б╨╡╤А╨▓╨╡╤А.');
      throw e;
    }
  },

  async checkAuth() {
    if (!this.token) { this.authChecked = true; this.authLoading = false; this.notify(); return; }
    this.authLoading = true;
    this.notify();
    try {
      const d = await this.api('/auth/me');
      this.setUser(d, this.token);
    } catch (e) {
      // Only clear session on explicit 401 (invalid/expired token)
      // Network errors, server errors, etc. keep the session alive
      const msg = e.message || '';
      if (msg.includes('╨╕╤Б╤В╨╡╨║╨╗╨░') || msg.includes('╨б╨╡╤Б╤Б╨╕╤П ╨╕╤Б╤В╨╡╨║╨╗╨░')) {
        this.user = null;
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('profile');
      }
    }
    this.authChecked = true;
    this.authLoading = false;
    if (this.user?.role === 'client') this.loadFavoriteIds();
    this.notify();
  },

  async _doRefresh() {
    if (this._refreshInFlight) {
      return this._refreshPromise;
    }
    this._refreshInFlight = true;
    this._refreshPromise = (async () => {
      const r = await fetch(API + '/auth/refresh', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'refresh failed');
      }
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'refresh failed');
      return d.data;
    })();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshInFlight = false;
      this._refreshPromise = null;
    }
  },

  async signup(email, password, name, role, shopName, phone, firstName, lastName, patronymic, birthDate) {
    const d = await this.api('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, displayName: name, role, phone, firstName, lastName, patronymic, birthDate }) });
    this.setUser(d.profile, d.token);
    if (role === 'business') {
      await this.api('/shop', { method: 'POST', body: JSON.stringify({ name: shopName || name }) });
      await this.loadMyShop();
    }
    this._runPendingAction();
    return d;
  },

  async signin(email, password) {
    const d = await this.api('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setUser(d.profile, d.token);
    this._runPendingAction();
    return d;
  },

  // ─── Business onboarding ───
  businessOnboarding: null,

  async loadBusinessOnboarding() {
    if (!this.token || this.user?.role !== 'business') return null;
    try {
      const d = await this.api('/business/onboarding');
      this.businessOnboarding = d;
      if (this.user && d.onboarding) {
        this.setUser({ ...this.user, onboarding: d.onboarding }, this.token);
      }
      return d;
    } catch (e) {
      console.error('loadBusinessOnboarding error:', e);
      return null;
    }
  },

  async submitBusinessOnboarding(payload) {
    const d = await this.api('/business/onboarding', { method: 'POST', body: JSON.stringify(payload) });
    if (this.user && d.onboarding) {
      this.setUser({ ...this.user, onboarding: d.onboarding }, this.token);
    }
    this.businessOnboarding = d;
    this.setPage('dashboard');
    return d;
  },

  _runPendingAction() {
    const action = this.pendingAction;
    if (!action || typeof action.run !== 'function') {
      this.clearPendingAction();
      return;
    }
    this.closeAuthModal();
    // Defer so React can close modal and render authenticated state first
    setTimeout(() => {
      try {
        action.run();
      } finally {
        this.clearPendingAction();
      }
    }, 50);
  },

  async updateProfile(payload) {
    const d = await this.api('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
    this.setUser(d.profile, this.token);
    return d;
  },

  async loadShops() {
    try {
      const d = await this.api('/shops');
      this.setShops(d.shops || []);
    } catch(e) { console.error(e); }
  },

  async loadShop(slug) {
    try {
      const d = await this.api('/shop/' + slug);
      this.setCurrentShop(d.shop, d.products || []);
      this.shopOrdersCount = d.ordersCount || 0;
      this.shopRatingAvg = d.ratingAvg || 0;
      this.shopReviewsCount = d.reviewsCount || 0;
      this.shopFollowersCount = d.followersCount || 0;
      this.shopIsFollowing = d.isFollowing || false;
      this.shopJoinedYear = d.joinedYear || '';
      this.shopTrustStatus = d.trustStatus || 'new';
      this.notify();
    } catch(e) { 
      console.error('loadShop error:', e);
      try {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && !host.match(/^(\d+\.){3}\d+$/)) {
          const d2 = await this.api('/shop-by-domain?host=' + encodeURIComponent(host));
          if (d2 && d2.shop) {
            this.setCurrentShop(d2.shop, d2.products || []);
            this.notify();
            return;
          }
        }
      } catch(e2) { console.error('loadShopByDomain error:', e2); }
    }
  },

  async loadMyShop() {
    try {
      if (!this.token) return;
      const d = await this.api('/my/shop');
      if (d && d.shop) {
        this.setCurrentShop(d.shop, d.products || []);
        this.shopOrdersCount = d.ordersCount || 0;
        this.shopRatingAvg = d.ratingAvg || 0;
        this.shopReviewsCount = d.reviewsCount || 0;
        this.shopFollowersCount = d.followersCount || 0;
        this.shopTrustStatus = d.trustStatus || 'new';
        this.shopJoinedYear = d.joinedYear || '';
        this.notify();
      }
    } catch(e) { console.error('loadMyShop error:', e); }
  },

  async saveShopProfile(payload) {
    const d = await this.api('/my/shop', { method: 'PUT', body: JSON.stringify(payload) });
    if (d && d.shop) {
      this.setCurrentShop(d.shop, this.currentProducts || []);
    }
    return d;
  },

  async search(query) {
    this.searchQuery = query;
    try {
      const d = await this.api('/search', { method: 'POST', body: JSON.stringify({ query, limit: 20 }) });
      this.searchResults = d.results || [];
      this.searchSummary = d.summary || '';
      this.notify();
      return d;
    } catch(e) { console.error(e); }
  },

  async smartSearch(query) {
    this.smartSearchLoading = true;
    this.smartSearchResult = null;
    this.smartSearchError = '';
    this.notify();
    try {
      const d = await this.api('/search/smart', { method: 'POST', body: JSON.stringify({ query, limit: 12 }) });
      this.smartSearchResult = d;
      this.notify();
      return d;
    } catch (e) {
      this.smartSearchError = e.message || '╨Ю╤И╨╕╨▒╨║╨░ ╨┐╨╛╨╕╤Б╨║╨░';
      this.notify();
    } finally {
      this.smartSearchLoading = false;
      this.notify();
    }
  },

  clearSmartSearch() {
    this.smartSearchResult = null;
    this.smartSearchError = '';
    this.smartSearchLoading = false;
    this.notify();
  },

  async createProduct(data) {
    return this.api('/products', { method: 'POST', body: JSON.stringify(data) });
  },

  async loadLeads() {
    const d = await this.api('/my/leads');
    this.setLeads(d.leads || []);
  },

  async createLead(data) {
    return this.api('/leads', { method: 'POST', body: JSON.stringify(data) });
  },

  async sendChat(message) {
    if (!this.currentShop) return;
    const d = await this.api('/shop/' + this.currentShop.slug + '/chat', { method: 'POST', body: JSON.stringify({ message, convId: this.chatConvId }) });
    this.setChatConvId(d.convId);
    const msgs = [...this.chatMessages, { role: 'user', content: message }, { role: 'assistant', content: d.response }];
    this.setChatMessages(msgs);
    return d;
  },

  async aiGenerate(name, category) {
    return this.api('/ai/generate', { method: 'POST', body: JSON.stringify({ productName: name, category }) });
  },

  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
  //  ╨д╨Р╨Ч╨Р 2 тАФ ╨║╨░╤В╨░╨╗╨╛╨│ ╤В╨╛╨▓╨░╤А╨╛╨▓, ╨║╨╛╤А╨╖╨╕╨╜╨░, ╨╖╨░╨║╨░╨╖╤Л, ╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╨╡
  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР

  async loadProducts(params = {}) {
    try {
      this.productsError = '';
      const q = new URLSearchParams();
      for (const k of ['q', 'category', 'sort', 'minPrice', 'maxPrice', 'brand', 'color', 'deliveryTerm', 'keyboardType', 'keyboardConnection', 'condition', 'limit']) {
        if (params[k]) q.set(k, Array.isArray(params[k]) ? params[k].join(',') : params[k]);
      }
      const qs = q.toString();
      const d = await this.api('/products' + (qs ? '?' + qs : ''));
      this.allProducts = d.products || [];
      this.notify();
    } catch(e) {
      this.productsError = e.message || '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤В╨╛╨▓╨░╤А╤Л';
      this.allProducts = [];
      this.notify();
      throw e;
    }
  },

  async loadCatalogFacets(params = {}) {
    this.catalogFacetsLoading = true;
    this.notify();
    try {
      const q = new URLSearchParams();
      for (const k of ['q', 'category', 'minPrice', 'maxPrice', 'brand', 'color', 'deliveryTerm', 'keyboardType', 'keyboardConnection', 'condition']) {
        if (params[k]) q.set(k, Array.isArray(params[k]) ? params[k].join(',') : params[k]);
      }
      const qs = q.toString();
      const d = await this.api('/catalog/facets' + (qs ? '?' + qs : ''));
      this.catalogFacets = d;
      this.notify();
    } catch(e) { console.error(e); } finally {
      this.catalogFacetsLoading = false;
      this.notify();
    }
  },

  async loadProduct(id) {
    // Set hash for refresh support
    window.location.hash = '#/product/' + id;
    try {
      this.selectedProduct = null;
      this._productShop = null;
      this.notify();
      const d = await this.api('/products/' + id);
      this.selectedProduct = d.product || null;
      this._productShop = d.shop || null;
      this.notify();
    } catch(e) {
      this.selectedProduct = null;
      this._productShop = null;
      this.notify();
    }
  },

  addToCart(product) {
    const items = [...this.cartItems];
    const idx = items.findIndex(i => i.productId === product.id);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
    } else {
      items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        oldPrice: product.oldPrice,
        quantity: 1,
        image: getProductMainImage(product) || '',
        shopId: product.shopId,
        shopName: product.shopName || '',
      });
    }
    this.cartItems = items;
    persistFunctional('cart', items);
    this.showToast('╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╛ ╨▓ ╨║╨╛╤А╨╖╨╕╨╜╤Г');
    this.notify();
  },

  removeFromCart(productId) {
    this.cartItems = this.cartItems.filter(i => i.productId !== productId);
    persistFunctional('cart', this.cartItems);
    this.showToast('╨г╨┤╨░╨╗╨╡╨╜╨╛ ╨╕╨╖ ╨║╨╛╤А╨╖╨╕╨╜╤Л');
    this.notify();
  },

  updateCartQuantity(productId, quantity) {
    if (quantity <= 0) { this.removeFromCart(productId); return; }
    this.cartItems = this.cartItems.map(i =>
      i.productId === productId ? { ...i, quantity } : i
    );
    persistFunctional('cart', this.cartItems);
    this.notify();
  },

  clearCart() {
    this.cartItems = [];
    persistFunctional('cart', []);
    this.notify();
  },

  async createOrder(payload) {
    const d = await this.api('/orders', { method: 'POST', body: JSON.stringify(payload) });
    this.clearCart();
    return d;
  },

  async loadMyOrders() {
    if (!this.token) { this.myOrders = []; this.notify(); return; }
    try {
      const d = await this.api('/my/orders');
      this.myOrders = d.orders || [];
      this.notify();
    } catch(e) {
      this.myOrders = [];
      this.notify();
    }
  },

  addToCompare(product) {
    if (this.compareItems.find(i => i.id === product.id)) return;
    if (this.compareItems.length >= 20) return;
    this.compareItems = [...this.compareItems, product];
    persistFunctional('compare', this.compareItems);
    this.showToast('╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╛ ╨▓ ╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╨╡');
    this.notify();
  },

  removeFromCompare(productId) {
    this.compareItems = this.compareItems.filter(i => i.id !== productId);
    persistFunctional('compare', this.compareItems);
    this.showToast('╨г╨┤╨░╨╗╨╡╨╜╨╛ ╨╕╨╖ ╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╤П');
    this.notify();
  },

  clearCompare() {
    this.compareItems = [];
    persistFunctional('compare', []);
    this.showToast('╨б╤А╨░╨▓╨╜╨╡╨╜╨╕╨╡ ╨╛╤З╨╕╤Й╨╡╨╜╨╛');
    this.notify();
  },

  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
  //  FAVORITES
  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР

  async loadFavoriteIds() {
    if (!this.token || this.user?.role !== 'client') { this.favoriteIds = []; this.notify(); return; }
    try {
      const d = await this.api('/my/favorites/ids');
      this.favoriteIds = d.ids || [];
      this.notify();
    } catch { this.favoriteIds = []; this.notify(); }
  },

  async loadFavorites() {
    if (!this.token || this.user?.role !== 'client') { this.favorites = []; this.notify(); return; }
    this.favoritesLoading = true; this.notify();
    try {
      const d = await this.api('/my/favorites');
      this.favorites = d.favorites || [];
    } finally { this.favoritesLoading = false; this.notify(); }
  },

  isFavorite(productId) {
    return this.favoriteIds.includes(productId);
  },

  async toggleFavorite(productId, product) {
    if (!productId) return;
    if (!this.token || this.user?.role !== 'client') {
      this.showToast('╨Т╨╛╨╣╨┤╨╕╤В╨╡ ╨║╨░╨║ ╨┐╨╛╨║╤Г╨┐╨░╤В╨╡╨╗╤М, ╤З╤В╨╛╨▒╤Л ╨┤╨╛╨▒╨░╨▓╨╕╤В╤М ╨▓ ╨╕╨╖╨▒╤А╨░╨╜╨╜╨╛╨╡');
      return;
    }
    const wasFavorite = this.isFavorite(productId);
    // Optimistic update
    if (wasFavorite) {
      this.favoriteIds = this.favoriteIds.filter(id => id !== productId);
      this.favorites = this.favorites.filter(f => f.id !== productId);
    } else {
      this.favoriteIds = [...this.favoriteIds, productId];
      if (product) this.favorites = [...this.favorites, product];
    }
    this.notify();
    try {
      if (wasFavorite) {
        await this.api('/my/favorites/' + productId, { method: 'DELETE' });
        this.showToast('╨г╨┤╨░╨╗╨╡╨╜╨╛ ╨╕╨╖ ╨╕╨╖╨▒╤А╨░╨╜╨╜╨╛╨│╨╛');
      } else {
        await this.api('/my/favorites/' + productId, { method: 'POST' });
        this.showToast('╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╛ ╨▓ ╨╕╨╖╨▒╤А╨░╨╜╨╜╨╛╨╡');
      }
    } catch (e) {
      // Rollback
      if (wasFavorite) {
        this.favoriteIds = [...this.favoriteIds, productId];
        if (product) this.favorites = [...this.favorites, product];
      } else {
        this.favoriteIds = this.favoriteIds.filter(id => id !== productId);
        this.favorites = this.favorites.filter(f => f.id !== productId);
      }
      this.notify();
      throw e;
    }
  },

  async loadMyAppeals(page = 1) {
    if (!this.token || this.user?.role !== 'client') { this.appeals = []; this.appealsCounts = { all:0, waiting:0, answered:0, closed:0 }; this.notify(); return; }
    try {
      const d = await this.api(`/my/appeals?page=${page}&limit=20`);
      this.appeals = d.shops || [];
      this.appealsCounts = { all: d.total || 0, page: d.page || 1, totalPages: d.totalPages || 1 };
      this.notify();
    } catch { this.appeals = []; this.appealsCounts = { all:0, page:1, totalPages:1 }; this.notify(); }
  },

  // тФАтФА AI Compare from Header: trigger auto-run on ComparePage mount тФАтФА
  async syncCompareItems() {
    const ids = this.compareItems.map(i => i.id);
    if (ids.length === 0) return;
    try {
      const d = await this.api('/products/batch', { method: 'POST', body: JSON.stringify({ ids }) });
      const productMap = {};
      (d.products || []).forEach(p => { productMap[p.id] = p; });
      const unavailableSet = new Set(d.unavailableIds || []);
      const updated = [];
      for (const item of this.compareItems) {
        if (productMap[item.id]) {
          updated.push({ ...item, ...productMap[item.id] });
        } else if (unavailableSet.has(item.id)) {
          updated.push({ ...item, unavailable: true, name: item.name || '╨в╨╛╨▓╨░╤А ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╡╨╜' });
        } else {
          updated.push(item);
        }
      }
      this.compareItems = updated;
      persistFunctional('compare', updated);
      this.notify();
    } catch (e) { console.error('syncCompareItems:', e); }
  },

  triggerAICompare() {
    if (this.compareItems.length < 2) {
      this.showToast('╨Ф╨╛╨▒╨░╨▓╤М╤В╨╡ ╨╝╨╕╨╜╨╕╨╝╤Г╨╝ 2 ╤В╨╛╨▓╨░╤А╨░ ╨┤╨╗╤П AI-╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╤П');
      return;
    }
    this.compareAutoAIRequestId += 1;
    this.setPage('compare');
    window.location.hash = '#/compare';
  },

  async compareProducts(customerRequest) {
    const payload = { productIds: this.compareItems.map(i => i.id) };
    if (customerRequest) payload.customerRequest = customerRequest;
    return this.api('/compare', { method: 'POST', body: JSON.stringify(payload) });
  },

  aiCompareLoading: false,
  aiCompareResult: null,
  aiCompareError: '',

  async compareWithAI(productIds) {
    this.aiCompareLoading = true;
    this.aiCompareResult = null;
    this.aiCompareError = '';
    this.notify();
    try {
      const d = await this.api('/compare/ai', { method: 'POST', body: JSON.stringify({ productIds }) });
      this.aiCompareResult = d;
      this.notify();
      return d;
    } catch (e) {
      this.aiCompareError = e.message || '╨Ю╤И╨╕╨▒╨║╨░ ╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╤П';
      this.notify();
      throw e;
    } finally {
      this.aiCompareLoading = false;
      this.notify();
    }
  },

  productContactLoading: false,
  productContactReply: null,

  async contactProduct(productId, payload) {
    this.productContactLoading = true;
    this.productContactReply = null;
    this.notify();
    try {
      const d = await this.api('/products/' + productId + '/contact', { method: 'POST', body: JSON.stringify(payload) });
      this.productContactReply = d;
      this.notify();
      return d;
    } catch (e) {
      this.notify();
      throw e;
    } finally {
      this.productContactLoading = false;
      this.notify();
    }
  },

  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
  //  ╨д╨Р╨Ч╨Р 3 тАФ ╨▒╨╕╨╖╨╜╨╡╤Б-╨║╨░╨▒╨╕╨╜╨╡╤В
  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР

  dashboardStats: null,
  dashboardStatsLoading: false,
  dashboardStatsError: '',
  dashboardTab: 'overview',

  async loadDashboardStats() {
    if (!this.token) return;
    this.dashboardStatsLoading = true;
    this.dashboardStatsError = '';
    this.notify();
    try {
      const d = await this.api('/business/dashboard/stats');
      this.dashboardStats = d;
      this.dashboardStatsError = '';
    } catch (e) {
      this.dashboardStats = null;
      this.dashboardStatsError = e.message || '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤Б╤В╨░╤В╨╕╤Б╤В╨╕╨║╤Г';
    }
    this.dashboardStatsLoading = false;
    this.notify();
  },
  businessProducts: [],
  businessOrders: [],
  businessClients: [],
  myLeads: [],

  async loadMyLeads() {
    if (!this.token) return;
    try {
      const d = await this.api('/my/leads');
      this.myLeads = d.leads || [];
      this.notify();
    } catch (e) { console.error(e); }
  },
  paymentSettings: null,
  copilotReply: null,
  copilotLoading: false,

  async loadBusinessProducts() {
    if (!this.token) return;
    try {
      const d = await this.api('/business/products');
      this.businessProducts = d.products || [];
      this.notify();
    } catch (e) { console.error(e); }
  },

  async updateProduct(id, payload) {
    return this.api('/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async deleteProduct(id) {
    return this.api('/products/' + id, { method: 'DELETE' });
  },

  async loadBusinessOrders() {
    if (!this.token) return;
    try {
      const d = await this.api('/business/orders');
      this.businessOrders = d.orders || [];
      this.notify();
    } catch (e) { console.error(e); }
  },

  async updateOrderStatus(id, status) {
    const d = await this.api('/business/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
    await this.loadBusinessOrders();
    return d;
  },

  async loadPaymentSettings() {
    if (!this.token) return;
    try {
      const d = await this.api('/business/payment-settings');
      this.paymentSettings = d.settings || null;
      this.notify();
    } catch (e) { console.error(e); }
  },

  async savePaymentSettings(payload) {
    const d = await this.api('/business/payment-settings', { method: 'PUT', body: JSON.stringify(payload) });
    await this.loadPaymentSettings();
    return d;
  },

  async copilotSend(message, style, channel, scenario) {
    this.copilotLoading = true;
    this.copilotReply = null;
    this.notify();
    try {
      const d = await this.api('/business/copilot/reply', { method: 'POST', body: JSON.stringify({ message, style, channel, scenario }) });
      this.copilotReply = d;
      this.notify();
      return d;
    } catch (e) {
      this.copilotLoading = false;
      this.notify();
      throw e;
    } finally {
      this.copilotLoading = false;
      this.notify();
    }
  },

  async createCopilotLead(payload) {
    const d = await this.api('/business/copilot/leads', { method: 'POST', body: JSON.stringify(payload) });
    return d.lead;
  },

  async updateBusinessLeadStatus(leadId, status, sellerNote) {
    const d = await this.api('/business/leads/' + leadId + '/status', { method: 'PUT', body: JSON.stringify({ status, sellerNote: sellerNote || '' }) });
    return d.lead;
  },

  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
  //  ╨д╨Р╨Ч╨Р 4 тАФ ╤Г╨╝╨╜╨╛╨╡ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╤В╨╛╨▓╨░╤А╨╛╨▓
  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР

  async createProductDraft(text) {
    return this.api('/business/products/draft', { method: 'POST', body: JSON.stringify({ text, mode: 'single' }) });
  },

  async createBulkProductDrafts(text) {
    return this.api('/business/products/draft-bulk', { method: 'POST', body: JSON.stringify({ text }) });
  },

  async createManyProducts(products) {
    const successful = [];
    const failed = [];
    for (const p of products) {
      try {
        const d = await this.createProduct(p);
        successful.push({ ...p, id: d.product?.id });
      } catch (e) {
        failed.push({ ...p, error: e.message });
      }
    }
    return { successful, failed };
  },

  async loadBusinessClients() {
    if (!this.token) return;
    try {
      // ╨д╨╛╤А╨╝╨╕╤А╤Г╨╡╨╝ ╨║╨╗╨╕╨╡╨╜╤В╨╛╨▓ ╨╕╨╖ leads ╨╕ orders
      const [leadsRes, ordersRes] = await Promise.allSettled([
        this.api('/my/leads').catch(() => ({ leads: [] })),
        this.api('/business/orders').catch(() => ({ orders: [] })),
      ]);
      const leads = leadsRes.status === 'fulfilled' ? leadsRes.value.leads || [] : [];
      const orders = ordersRes.status === 'fulfilled' ? ordersRes.value.orders || [] : [];
      // ╨Ю╨▒╤К╨╡╨┤╨╕╨╜╤П╨╡╨╝
      const map = new Map();
      for (const l of leads) {
        if (l.phone) map.set(l.phone, { name: l.name, phone: l.phone, email: l.email || '', message: l.message || '', source: 'lead', lastDate: l.createdAt || '', status: l.status || '', productName: l.productName || '', aiReply: l.aiReply || '', leadSource: l.source || '', deliveryCity: l.deliveryCity || '', contactPreference: l.contactPreference || '', customerNeed: l.customerNeed || '' });
      }
      for (const o of orders) {
        if (o.customerPhone) map.set(o.customerPhone, { name: o.customerName, phone: o.customerPhone, email: o.customerEmail || '', source: 'order', lastDate: o.createdAt || '', status: o.orderStatus || '' });
      }
      this.businessClients = Array.from(map.values());
      this.notify();
    } catch (e) { console.error(e); }
  },

  async apiFile(path, file, fieldName) {
    const fd = new FormData();
    fd.append(fieldName, file);
    const h = {};
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    const r = await fetch('/api' + path, { method: 'POST', body: fd, headers: h });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d.data;
  },

  async uploadShopAvatar(file) {
    const d = await this.apiFile('/my/shop/avatar', file, 'avatar');
    if (d.shop) this.setCurrentShop(d.shop, this.currentProducts);
    this.notify();
    return d;
  },

  async uploadShopCover(file) {
    const d = await this.apiFile('/my/shop/cover', file, 'cover');
    if (d.shop) this.setCurrentShop(d.shop, this.currentProducts);
    this.notify();
    return d;
  },

  async loadShopReviews(slug) {
    try {
      const d = await this.api('/shops/' + slug + '/reviews');
      this.shopReviews = d.reviews || [];
      this.shopRatingAvg = d.ratingAvg || 0;
      this.shopReviewsCount = d.reviewsCount || 0;
      this.notify();
    } catch (e) { console.error(e); }
  },

  async createShopReview(slug, payload) {
    return this.api('/shops/' + slug + '/reviews', { method: 'POST', body: JSON.stringify(payload) });
  },

  async followShop(slug) {
    const d = await this.api('/shops/' + slug + '/follow', { method: 'POST' });
    this.shopIsFollowing = d.isFollowing;
    this.shopFollowersCount = d.followersCount;
    this.notify();
    return d;
  },

  async unfollowShop(slug) {
    const d = await this.api('/shops/' + slug + '/follow', { method: 'DELETE' });
    this.shopIsFollowing = d.isFollowing;
    this.shopFollowersCount = d.followersCount;
    this.notify();
    return d;
  },

  async contactShop(slug, payload) {
    const d = await this.api('/shops/' + slug + '/contact', { method: 'POST', body: JSON.stringify(payload) });
    this.contactSent = true;
    this.notify();
    return d;
  },

  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР
  //  AI MANAGER 24/7
  // тХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХРтХР

  async sendAIManagerMessage({ shopSlug, productId, dialogId, message, source }) {
    if (!this.token) throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨▓╤В╨╛╤А╨╕╨╖╨░╤Ж╨╕╤П');
    this.aiManagerLoading = true;
    this.aiManagerError = '';
    this.notify();
    try {
      const d = await this.api('/ai-manager/chat', {
        method: 'POST',
        body: JSON.stringify({ shopSlug, productId, dialogId, message, source }),
      });
      this.aiManagerLoading = false;
      this.notify();
      return d;
    } catch (e) {
      this.aiManagerLoading = false;
      this.aiManagerError = e.message || '╨Ю╤И╨╕╨▒╨║╨░ AI-╨╝╨╡╨╜╨╡╨┤╨╢╨╡╤А╨░';
      this.notify();
      throw e;
    }
  },

  async loadClientAIManagerDialogs() {
    if (!this.token) { this.aiManagerDialogs = []; this.notify(); return; }
    try {
      const d = await this.api('/my/ai-manager/dialogs');
      this.aiManagerDialogs = Array.isArray(d.dialogs) ? d.dialogs : [];
      this.notify();
    } catch (e) {
      this.aiManagerDialogs = [];
      this.notify();
    }
  },

  async loadClientAIManagerDialog(id) {
    if (!this.token) return;
    try {
      const d = await this.api('/my/ai-manager/dialogs/' + id);
      this.aiManagerDialog = d.dialog || null;
      this.aiManagerMessages = Array.isArray(d.messages) ? d.messages : [];
      this.notify();
      return d;
    } catch (e) {
      this.aiManagerDialog = null;
      this.aiManagerMessages = [];
      this.notify();
    }
  },

  async createAIManagerLead(dialogId) {
    if (!this.token) throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨▓╤В╨╛╤А╨╕╨╖╨░╤Ж╨╕╤П');
    return this.api('/my/ai-manager/dialogs/' + dialogId + '/lead', { method: 'POST' });
  },

  async createBusinessAIManagerLead(dialogId) {
    if (!this.token || this.user?.role !== 'business') throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨║╨║╨░╤Г╨╜╤В ╨┐╤А╨╛╨┤╨░╨▓╤Ж╨░');
    const d = await this.api('/business/ai-manager/dialogs/' + dialogId + '/lead', { method: 'POST' });
    await this.loadBusinessAIManagerDialogs();
    return d;
  },

  async loadAIManagerSettings() {
    if (!this.token || this.user?.role !== 'business') return;
    try {
      const d = await this.api('/business/ai-manager/settings');
      this.aiManagerSettings = d.settings || null;
      this.notify();
      return d;
    } catch (e) { console.error(e); }
  },

  async saveAIManagerSettings(payload) {
    if (!this.token || this.user?.role !== 'business') throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨║╨║╨░╤Г╨╜╤В ╨┐╤А╨╛╨┤╨░╨▓╤Ж╨░');
    const d = await this.api('/business/ai-manager/settings', { method: 'PUT', body: JSON.stringify(payload) });
    this.aiManagerSettings = d.settings || null;
    this.notify();
    return d;
  },

  async loadBusinessAIManagerDialogs(params) {
    if (!this.token || this.user?.role !== 'business') { this.aiManagerDialogs = []; this.notify(); return; }
    try {
      let path = '/business/ai-manager/dialogs';
      if (params) {
        const qs = new URLSearchParams();
        if (params.status && params.status !== 'all') qs.set('status', params.status);
        if (params.q) qs.set('q', params.q);
        if (params.sort) qs.set('sort', params.sort);
        if (params.limit) qs.set('limit', String(params.limit));
        if (params.offset) qs.set('offset', String(params.offset));
        const s = qs.toString();
        if (s) path += '?' + s;
      }
      const d = await this.api(path);
      this.aiManagerDialogs = Array.isArray(d.dialogs) ? d.dialogs : [];
      this.aiManagerTotal = typeof d.total === 'number' ? d.total : this.aiManagerDialogs.length;
      this.aiManagerCounts = d.counts || { open: 0, waiting_seller: 0, lead_created: 0, taken_over: 0, closed: 0, total: this.aiManagerDialogs.length };
      this.notify();
    } catch (e) {
      this.aiManagerDialogs = [];
      this.aiManagerTotal = 0;
      this.aiManagerCounts = { open: 0, waiting_seller: 0, lead_created: 0, taken_over: 0, closed: 0, total: 0 };
      this.notify();
    }
  },

  async loadBusinessAIManagerDialog(id) {
    if (!this.token || this.user?.role !== 'business') return;
    try {
      const d = await this.api('/business/ai-manager/dialogs/' + id);
      this.aiManagerDialog = d.dialog || null;
      this.aiManagerMessages = Array.isArray(d.messages) ? d.messages : [];
      this.notify();
      return d;
    } catch (e) {
      this.aiManagerDialog = null;
      this.aiManagerMessages = [];
      this.notify();
    }
  },

  async takeoverAIManagerDialog(id) {
    if (!this.token || this.user?.role !== 'business') throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨║╨║╨░╤Г╨╜╤В ╨┐╤А╨╛╨┤╨░╨▓╤Ж╨░');
    const d = await this.api('/business/ai-manager/dialogs/' + id + '/takeover', { method: 'POST' });
    await this.loadBusinessAIManagerDialogs();
    return d;
  },

  async replyAIManagerDialog(id, message) {
    if (!this.token || this.user?.role !== 'business') throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨║╨║╨░╤Г╨╜╤В ╨┐╤А╨╛╨┤╨░╨▓╤Ж╨░');
    const d = await this.api('/business/ai-manager/dialogs/' + id + '/reply', { method: 'POST', body: JSON.stringify({ message }) });
    await this.loadBusinessAIManagerDialog(id);
    return d;
  },

  async updateAIManagerDialogStatus(id, status) {
    if (!this.token || this.user?.role !== 'business') throw new Error('╨в╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨░╨║╨║╨░╤Г╨╜╤В ╨┐╤А╨╛╨┤╨░╨▓╤Ж╨░');
    const d = await this.api('/business/ai-manager/dialogs/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
    await this.loadBusinessAIManagerDialogs();
    return d;
  },
};

function mapError(raw) {
  const m = {
    'unauthorized': '╨б╨╡╤Б╤Б╨╕╤П ╨╕╤Б╤В╨╡╨║╨╗╨░. ╨Т╨╛╨╣╨┤╨╕╤В╨╡ ╨╖╨░╨╜╨╛╨▓╨╛.',
    'business only': '╨а╨░╨╖╨┤╨╡╨╗ ╨┤╨╛╤Б╤В╤Г╨┐╨╡╨╜ ╤В╨╛╨╗╤М╨║╨╛ ╨┐╤А╨╛╨┤╨░╨▓╤Ж╤Г.',
    'client only': '╨а╨░╨╖╨┤╨╡╨╗ ╨┤╨╛╤Б╤В╤Г╨┐╨╡╨╜ ╤В╨╛╨╗╤М╨║╨╛ ╨┐╨╛╨║╤Г╨┐╨░╤В╨╡╨╗╤О.',
    'not found': '╨Ф╨░╨╜╨╜╤Л╨╡ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜╤Л.',
    'shop not found': '╨Ь╨░╨│╨░╨╖╨╕╨╜ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜.',
    'product not found': '╨в╨╛╨▓╨░╤А ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜.',
    '╨н╨╜╨┤╨┐╨╛╨╕╨╜╤В ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜': '╨н╨╜╨┤╨┐╨╛╨╕╨╜╤В ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜. ╨Я╤А╨╛╨▓╨╡╤А╤М╤В╨╡ ╤Б╨╡╤А╨▓╨╡╤А.',
    'message required': '╨г╨║╨░╨╢╨╕╤В╨╡ ╤Б╨╛╨╛╨▒╤Й╨╡╨╜╨╕╨╡.',
  };
  return m[raw] || raw;
}
