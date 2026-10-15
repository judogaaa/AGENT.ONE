export const CATEGORY_OPTIONS = [
  { value: '', label: 'Все категории' },
  { value: 'electronics', label: 'Электроника' },
  { value: 'auto', label: 'Авто' },
  { value: 'real_estate', label: 'Недвижимость' },
  { value: 'repair', label: 'Ремонт и услуги' },
  { value: 'webdev', label: 'Сайты и разработка' },
  { value: 'beauty', label: 'Красота' },
  { value: 'education', label: 'Образование' },
  { value: 'fashion', label: 'Одежда и обувь' },
  { value: 'home', label: 'Дом и мебель' },
  { value: 'other', label: 'Другое' },
];

export function getCategoryLabel(value) {
  if (!value) return '';
  const found = CATEGORY_OPTIONS.find(o => o.value === value);
  return found ? found.label : value;
}
