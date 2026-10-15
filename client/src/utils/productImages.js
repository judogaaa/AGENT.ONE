/**
 * Normalize product.images to a clean string array.
 * Handles: array, space-separated string, comma-separated string,
 * JSON string array, single URL, null/undefined.
 */
export function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim());
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    // PostgreSQL array literal: {url1,url2,url3}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map(s => s.replace(/^"/, '').replace(/"$/, '').trim()).filter(Boolean);
    }
    // JSON array string: ["a.jpg","b.jpg"]
    if (trimmed.startsWith('[')) {
      try { const arr = JSON.parse(trimmed); return normalizeImages(arr); } catch {}
    }
    // Space-separated or newline-separated
    return trimmed.split(/[\s\n]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/** Get the first image URL from a product or item object. */
export function getProductMainImage(product) {
  if (!product) return '';
  const imgs = normalizeImages(product.images || product.productImage || product.image || product.imageUrl || product.photo);
  const result = imgs[0] || product.image || product.imageUrl || product.productImage || product.photo || '';
  return typeof result === 'string' ? result.trim() : '';
}
