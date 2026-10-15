export function formatPrice(value, fallback = 'Цена не указана') {
  if (value == null || value === '' || Number.isNaN(Number(value))) return fallback;
  const n = Number(value);
  return n.toLocaleString('ru-RU') + ' ₽';
}

export function hasValidPrice(value) {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

export function getConditionLabel(val) {
  if (val === 'new') return 'Новое';
  if (val === 'used') return 'Б/у';
  return val || '—';
}

export function getProductTypeLabel(val) {
  const map = {
    phone: 'Смартфон', headphones: 'Наушники', speaker: 'Колонка',
    laptop: 'Ноутбук', keyboard: 'Клавиатура', monitor: 'Монитор',
    console: 'Игровая консоль', watch: 'Умные часы',
  };
  return map[val] || val || '—';
}
