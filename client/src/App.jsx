import { useEffect, useState } from 'react';
import { useStore } from './hooks/useStore';
import FlyToCartProvider from './features/cart-animation/FlyToCartProvider';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import AuthCompletePage from './pages/AuthCompletePage';
import ShopPage from './pages/ShopPage';
import CatalogPage from './pages/CatalogPage';
import ProfilePage from './pages/ProfilePage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import AccountPage from './pages/AccountPage';
import ComparePage from './pages/ComparePage';
import AssistantPage from './pages/AssistantPage';
import DashboardPage from './pages/DashboardPage';
import BusinessOnboardingPage from './pages/BusinessOnboardingPage';
import AuthRequiredModal from './components/AuthRequiredModal';
import AgentIcon from './components/AgentIcon';
import LegalFooter from '@legal/components/LegalFooter.jsx';
import CookieBanner from '@legal/components/CookieBanner.jsx';
import { AnalyticsGate } from '@legal/analyticsGate.js';
import { loadCookieConsent } from '@legal/cookieCategories.js';
import { useFlyToCart } from './features/cart-animation/useFlyToCart';

export default function App() {
  const s = useStore();
  const [cookieCategories, setCookieCategories] = useState(
    () => loadCookieConsent()?.categories || { necessary: true }
  );

  const handleCookieConsentChange = (categories) => {
    setCookieCategories(categories);
    s.applyCookieCategories(categories);
  };

  // Auth revalidation on mount
  useEffect(() => { s.checkAuth(); }, []);

  // Load shop from URL path or auth-complete on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/auth/complete') {
      s.setPage('auth-complete');
      return;
    }
    const match = path.match(/^\/shop\/(.+)/);
    if (match) {
      s.setPage('shop');
      s.loadShop(match[1]);
    }
  }, []);

  // Handle hash navigation for product + compare pages
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      // Product page
      const prodMatch = hash.match(/#\/product\/(.+)/);
      if (prodMatch) {
        s.setPage('product');
        s.loadProduct(prodMatch[1]);
        return;
      }
      // Compare page
      if (hash.includes('#/compare')) {
        s.setPage('compare');
        return;
      }
      // Business onboarding page
      if (hash.includes('#/business/onboarding')) {
        s.setPage('business-onboarding');
        return;
      }
      // Assistant page
      if (hash.includes('#/assistant')) {
        s.setPage('assistant');
        return;
      }
      // AI Manager page (business shortcut)
      if (hash.includes('#/ai-manager')) {
        s.setDashboardTab('ai-manager');
        s.setPage('dashboard');
        return;
      }
    };
    // Run on mount
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Auto-load my shop when navigating to 'shop' page
  useEffect(() => {
    if (s.page === 'shop' && !s.currentShop && s.token) {
      s.loadMyShop();
    }
  }, [s.page, s.token]);

  const renderPage = () => {
    switch (s.page) {
      case 'home': return <HomePage />;
      case 'auth': return <AuthPage />;
      case 'auth-complete': return <AuthCompletePage />;
      case 'shop': return <ShopPage />;
      case 'catalog': return <CatalogPage />;
      case 'profile': return <ProfilePage />;
      case 'product': return <ProductPage />;
      case 'cart': return <CartPage />;
      case 'checkout': return <CheckoutPage />;
      case 'orders': return <AccountPage />;
      case 'compare': return <ComparePage />;
      case 'assistant': return <AssistantPage />;
      case 'dashboard': return <DashboardPage />;
      case 'business-onboarding': return <BusinessOnboardingPage />;
      default: return <HomePage />;
    }
  };

  return (
    <FlyToCartProvider>
    <div>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px' }}>
        {renderPage()}
      </main>
      <LegalFooter useRouterLink={false} />
      <CookieBanner onConsentChange={handleCookieConsentChange} />
      <AnalyticsGate categories={cookieCategories} />
      <AuthRequiredModal />
      {/* Toast notification — does not block clicks */}
      {s.toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, pointerEvents: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 24px', boxShadow: '0 8px 24px rgba(15,23,42,.08)', fontSize: 14, color: '#374151', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            <span style={{ color: '#667eea' }}><AgentIcon name="check" size={14} /></span> {s.toast.message}
          </div>
        </div>
      )}
    </div>
    {/* Aria-live region for cart success announcements */}
    <div role="status" aria-live="polite" aria-atomic="true"
      style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
      {s.toast?.message === 'Добавлено в корзину' ? 'Товар добавлен в корзину' : ''}
    </div>
    </FlyToCartProvider>
  );
}
