import { describe, it, expect } from 'vitest';
import { validateReturnTo, buildLoginUrl, buildRegisterUrl, buildAuthUrl, getAuthOrigin } from '../authUrl';

describe('validateReturnTo', () => {
  it('returns / for null', () => {
    expect(validateReturnTo(null)).toBe('/');
  });
  it('returns / for undefined', () => {
    expect(validateReturnTo(undefined)).toBe('/');
  });
  it('returns / for empty string', () => {
    expect(validateReturnTo('')).toBe('/');
  });
  it('returns / for non-string', () => {
    expect(validateReturnTo(42)).toBe('/');
  });
  it('returns / for absolute URL', () => {
    expect(validateReturnTo('https://evil.com')).toBe('/');
  });
  it('returns / for protocol-relative URL', () => {
    expect(validateReturnTo('//evil.com')).toBe('/');
  });
  it('returns / for path starting with \\', () => {
    expect(validateReturnTo('\\windows\\path')).toBe('/');
  });
  it('returns / for path with control chars', () => {
    expect(validateReturnTo('/shop/\x00test')).toBe('/');
  });
  it('returns relative path for valid path', () => {
    expect(validateReturnTo('/shop/my-shop')).toBe('/shop/my-shop');
  });
  it('returns relative path with query string', () => {
    expect(validateReturnTo('/shop/my-shop?tab=info')).toBe('/shop/my-shop?tab=info');
  });
  it('trims whitespace', () => {
    expect(validateReturnTo('  /shop/my-shop  ')).toBe('/shop/my-shop');
  });
  it('returns / for single slash', () => {
    expect(validateReturnTo('/')).toBe('/');
  });
  it('returns / for hash-only path', () => {
    expect(validateReturnTo('/#/profile')).toBe('/#/profile');
  });
  it('returns / for empty after trim with only whitespace', () => {
    expect(validateReturnTo('   ')).toBe('/');
  });
});

describe('getAuthOrigin', () => {
  it('returns a valid URL string', () => {
    const origin = getAuthOrigin();
    expect(origin).toMatch(/^https?:\/\/.+/);
  });
  it('does not have trailing slash', () => {
    const origin = getAuthOrigin();
    expect(origin.endsWith('/')).toBe(false);
  });
});

describe('buildAuthUrl', () => {
  it('builds URL with auth path and return_to', () => {
    const url = buildAuthUrl('/login', '/shop/test');
    expect(url).toContain('/login?return_to=');
    expect(url).toContain(encodeURIComponent('/shop/test'));
  });
  it('defaults return_to to /', () => {
    const url = buildAuthUrl('/login');
    expect(url).toContain('/login?return_to=');
  });
  it('sanitizes malicious return_to', () => {
    const url = buildAuthUrl('/login', 'https://evil.com');
    expect(url).toContain(encodeURIComponent('/'));
  });
});

describe('buildLoginUrl', () => {
  it('builds login URL', () => {
    const url = buildLoginUrl('/dashboard');
    expect(url).toContain('/login?return_to=');
  });
});

describe('buildRegisterUrl', () => {
  it('builds register URL', () => {
    const url = buildRegisterUrl('/profile');
    expect(url).toContain('/register?return_to=');
  });
});
