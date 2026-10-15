export function displayShopName(shop) {
  if (!shop) return '';
  return cleanupText(shop.name) || 'Магазин';
}

export function displayShopDescription(shop) {
  if (!shop) return '';
  const desc = cleanupText(shop.description);
  return desc || '';
}

export function displaySellerHandle(shop) {
  if (!shop || !shop.slug) return '';
  return `@${shop.slug}`;
}

function cleanupText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\s+/g, ' ')
    .replace(/\s+\d{3,}[\s\p{P}]*$/u, '')
    .trim();
}
