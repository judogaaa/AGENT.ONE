const STATUS_VARIANTS = {
  created: 'warning', new: 'warning', pending: 'warning',
  accepted: 'success', confirmed: 'success', completed: 'success', ready: 'success',
  cancelled: 'danger', canceled: 'danger',
  lead: 'info',
  order: 'order',
};

const STATUS_LABELS_RU = {
  created: 'Создан', new: 'Новый', pending: 'Ожидает',
  accepted: 'Принят', confirmed: 'Подтверждён', completed: 'Завершён', ready: 'Готов',
  cancelled: 'Отменён', canceled: 'Отменён',
  lead: 'Заявка',
  order: 'Заказ',
};

export default function StatusBadge({ children, label, status, variant, className }) {
  const text = label ?? (status ? (STATUS_LABELS_RU[status] ?? status) : null) ?? children ?? '';
  const v = variant ?? (status ? STATUS_VARIANTS[status] : null) ?? 'neutral';
  return (
    <span className={'status-badge status-' + v + (className ? ' ' + className : '')}>
      {text}
    </span>
  );
}
