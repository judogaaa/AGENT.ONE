export const MODE_OPTIONS = [
  { value: 'off', label: 'Выключен' },
  { value: 'assistive', label: 'Подсказки' },
  { value: 'auto_reply', label: 'Автоответ' },
  { value: 'auto_reply_and_lead', label: 'Автоответ + заявки' },
];

export const MODE_LABELS = {
  off: 'Выключен',
  assistive: 'Только подсказки',
  auto_reply: 'Автоответ',
  auto_reply_and_lead: 'Автоответ + заявки',
};

export const STATUS_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'waiting_seller', label: 'Ждут ответа' },
  { key: 'open', label: 'Открытые' },
  { key: 'lead_created', label: 'Заявки' },
  { key: 'taken_over', label: 'В работе' },
  { key: 'closed', label: 'Закрытые' },
];

export const SORT_OPTIONS = [
  { key: 'priority', label: 'Сначала важные' },
  { key: 'newest', label: 'Сначала новые' },
  { key: 'leads', label: 'С заявками' },
];

export const QUICK_REPLIES = [
  'Уточню наличие и вернусь с ответом.',
  'Могу оформить заявку, чтобы продавец связался с вами.',
  'Подскажите город доставки и удобный способ связи.',
  'Этот вопрос лучше уточнить у продавца. Я передам обращение.',
];

export const ACTOR_MAP = { client: 'Клиент', ai_manager: 'AI', business: 'Продавец', system: 'Система' };
export const SENDER_MAP = { client: 'Клиент', ai_manager: 'AI-менеджер', business: 'Продавец', system: 'Система' };

export const STATUS_LABEL_MAP = {
  open: 'Открыт',
  waiting_client: 'Ждёт клиента',
  waiting_seller: 'Ждёт ответа',
  lead_created: 'Заявка создана',
  taken_over: 'В работе',
  closed: 'Закрыт',
};

export const STATUS_PRIORITY = ['waiting_seller', 'lead_created', 'taken_over', 'open', 'closed'];

export function groupDialogsByClient(dialogs) {
  const map = new Map();
  for (const d of dialogs || []) {
    const key = d.clientEmail || d.clientPhone || `${d.clientName || ''}_${d.clientUserId || ''}`;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        key,
        clientName: d.clientName || 'Клиент',
        clientEmail: d.clientEmail || '',
        clientPhone: d.clientPhone || '',
        clientUserId: d.clientUserId || '',
        dialogs: [],
        totalCount: 0,
        waitingCount: 0,
        leadCount: 0,
        takenOverCount: 0,
        openCount: 0,
        productNames: [],
        uniqueProductNames: [],
        lastDialog: null,
        priorityStatus: 'closed',
      });
    }
    const g = map.get(key);
    g.dialogs.push(d);
    g.totalCount += 1;
    if (d.status === 'waiting_seller') g.waitingCount += 1;
    if (d.status === 'lead_created') g.leadCount += 1;
    if (d.status === 'taken_over') g.takenOverCount += 1;
    if (d.status === 'open') g.openCount += 1;

    if (d.productName && !g.uniqueProductNames.includes(d.productName)) {
      g.uniqueProductNames.push(d.productName);
    }
    if (d.productName) g.productNames.push(d.productName);

    const nowPrio = STATUS_PRIORITY.indexOf(d.status);
    const curPrio = STATUS_PRIORITY.indexOf(g.priorityStatus);
    if (nowPrio >= 0 && (curPrio < 0 || nowPrio < curPrio)) {
      g.priorityStatus = d.status;
    }

    if (!g.lastDialog || new Date(d.updatedAt) > new Date(g.lastDialog.updatedAt)) {
      g.lastDialog = d;
    }
  }
  return Array.from(map.values());
}

export function getGroupStatusLabel(group) {
  const label = STATUS_LABEL_MAP[group.priorityStatus];
  if (!group.waitingCount && !group.takenOverCount && group.leadCount > 0) return 'Есть заявка';
  return label || 'Открыт';
}

export function formatRelativeTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'сейчас';
    if (diffMin < 60) return `${diffMin} мин`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} д`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return user + '@' + domain;
  return user.substring(0, 2) + '***@' + domain;
}

export function getDialogCounts(dialogs) {
  const c = { open: 0, waiting_seller: 0, lead_created: 0, taken_over: 0, closed: 0, total: 0 };
  (dialogs || []).forEach(d => {
    c.total++;
    c[d.status] = (c[d.status] || 0) + 1;
  });
  return c;
}
