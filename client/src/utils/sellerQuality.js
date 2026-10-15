import { hasValidPrice } from './format';
import { normalizeImages } from './productImages';

export function getProductIssues(product) {
  const issues = [];
  const images = normalizeImages(product?.images).filter(Boolean);
  if (images.length === 0) issues.push('нет фото');
  else if (images.length < 2) issues.push('мало фото');

  const desc = String(product?.description || '').trim();
  if (desc.length < 80) issues.push('короткое описание');

  const benefits = normalizeBenefits(product?.benefits);
  if (benefits.length === 0) issues.push('нет преимуществ');

  if (!hasValidPrice(product?.price) || Number(product.price) <= 0) {
    issues.push('цена не указана');
  }

  if (product?.oldPrice && Number(product.oldPrice) <= Number(product.price)) {
    issues.push('старая цена некорректна');
  }

  if (product?.isActive === false) issues.push('товар скрыт');
  if (!product?.category) issues.push('нет категории');

  return issues;
}

export function scoreProduct(product) {
  let score = 0;
  const images = normalizeImages(product?.images).filter(Boolean);
  if (images.length > 0) {
    score += 25;
    if (images.length >= 2) score += 15;
  }

  const desc = String(product?.description || '').trim();
  if (desc.length >= 80) score += 20;

  const benefits = normalizeBenefits(product?.benefits);
  if (benefits.length > 0) score += 15;

  if (hasValidPrice(product?.price) && Number(product.price) > 0) score += 15;

  if (product?.isActive !== false) score += 10;

  return Math.min(100, score);
}

export function qualitySummary(products) {
  const list = Array.isArray(products) ? products : [];
  if (list.length === 0) {
    return { average: 0, total: 0, problemCount: 0, noPhotoCount: 0, hiddenCount: 0, weakDescriptions: 0, noBenefits: 0, onePhotoCount: 0 };
  }

  let totalScore = 0;
  let problemCount = 0;
  let noPhotoCount = 0;
  let hiddenCount = 0;
  let weakDescriptions = 0;
  let noBenefitsCount = 0;
  let onePhotoCount = 0;

  for (const p of list) {
    const score = scoreProduct(p);
    totalScore += score;
    const issues = getProductIssues(p);
    if (issues.length > 0) problemCount += 1;
    if (issues.includes('нет фото')) noPhotoCount += 1;
    if (issues.includes('мало фото')) onePhotoCount += 1;
    if (p?.isActive === false) hiddenCount += 1;
    if (issues.includes('короткое описание')) weakDescriptions += 1;
    if (issues.includes('нет преимуществ')) noBenefitsCount += 1;
  }

  return {
    average: Math.round(totalScore / list.length),
    total: list.length,
    problemCount,
    noPhotoCount,
    hiddenCount,
    weakDescriptions,
    noBenefits: noBenefitsCount,
    onePhotoCount,
  };
}

export function qualityLabel(score) {
  if (score >= 90) return 'Отлично';
  if (score >= 75) return 'Хорошо';
  if (score >= 60) return 'Нормально';
  return 'Нужно улучшить';
}

export function qualityColor(score) {
  if (score >= 90) return { bg: '#ecfdf5', color: '#065f46' };
  if (score >= 75) return { bg: '#f0fdf4', color: '#15803d' };
  if (score >= 60) return { bg: '#fffbeb', color: '#92400e' };
  return { bg: '#fef2f2', color: '#991b1b' };
}

function normalizeBenefits(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  return [];
}
