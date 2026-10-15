import { qualitySummary } from './sellerQuality';

export function buildRecommendations({ stats, products, orders, leads, dialogs, aiManagerSettings }) {
  const recs = [];
  const quality = qualitySummary(products);
  const newOrders = (orders || []).filter(o => o.orderStatus === 'created').length;
  const waitingDialogs = (dialogs || []).filter(d => d.status === 'waiting_seller').length;
  const newLeads = (leads || []).filter(l => (l.status || 'new') === 'new').length;
  const aiEnabled = aiManagerSettings?.enabled !== false;

  if (quality.problemCount > 0) {
    recs.push({
      id: 'improve-products',
      title: `Улучшите ${quality.problemCount} ${plural(quality.problemCount, 'карточку', 'карточки', 'карточек')}`,
      reason: 'У нескольких товаров короткие описания, нет преимуществ или проблемы с фото. Карточки с полным описанием лучше конвертируют.',
      impact: 'Высокий',
      action: 'Проверить товары',
      tab: 'products',
    });
  }

  if (!aiEnabled) {
    recs.push({
      id: 'enable-ai-manager',
      title: 'Включите AI-менеджера',
      reason: 'Клиенты смогут получать ответы 24/7 и оставлять заявки даже вне рабочего времени.',
      impact: 'Высокий',
      action: 'Настроить AI-менеджер',
      tab: 'ai-manager',
    });
  }

  if (waitingDialogs > 0) {
    recs.push({
      id: 'answer-dialogs',
      title: `Ответьте на ${waitingDialogs} ${plural(waitingDialogs, 'диалог', 'диалога', 'диалогов')}`,
      reason: 'AI передал вопросы продавцу. Клиенты ждут вашего ответа.',
      impact: 'Высокий',
      action: 'Открыть диалоги',
      tab: 'ai-manager',
    });
  }

  if (newOrders > 0) {
    recs.push({
      id: 'accept-orders',
      title: `Примите ${newOrders} ${plural(newOrders, 'новый заказ', 'новых заказа', 'новых заказов')}`,
      reason: 'Клиенты оформили заказы и ждут подтверждения.',
      impact: 'Высокий',
      action: 'Открыть заказы',
      tab: 'orders',
    });
  }

  if (newLeads > 0) {
    recs.push({
      id: 'process-leads',
      title: `Обработайте ${newLeads} ${plural(newLeads, 'новую заявку', 'новые заявки', 'новых заявок')}`,
      reason: 'Новые заявки требуют вашей реакции.',
      impact: 'Высокий',
      action: 'Открыть заявки',
      tab: 'clients',
    });
  }

  if (quality.onePhotoCount > 0) {
    recs.push({
      id: 'add-second-photo',
      title: `Добавьте второе фото к ${quality.onePhotoCount} ${plural(quality.onePhotoCount, 'товару', 'товарам', 'товарам')}`,
      reason: 'Карточки с несколькими фото выглядят надёжнее и привлекают больше внимания.',
      impact: 'Средний',
      action: 'Проверить товары',
      tab: 'products',
    });
  }

  if (quality.hiddenCount > 0) {
    recs.push({
      id: 'hidden-products',
      title: `${quality.hiddenCount} ${plural(quality.hiddenCount, 'товар скрыт', 'товара скрыто', 'товаров скрыто')}`,
      reason: 'Скрытые товары не видны покупателям. Проверьте, нужно ли их активировать.',
      impact: 'Средний',
      action: 'Открыть товары',
      tab: 'products',
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: 'all-good',
      title: 'Всё в порядке',
      reason: 'Сейчас нет критичных задач. Добавьте новые товары или проверьте настройки AI-менеджера.',
      impact: 'Низкий',
      action: 'Добавить товар',
      tab: 'products',
    });
  }

  return recs;
}

export function buildAttentionItems({ stats, products, orders, leads, dialogs, aiManagerSettings }) {
  const items = [];
  const quality = qualitySummary(products);
  const newOrders = (orders || []).filter(o => o.orderStatus === 'created').length;
  const waitingDialogs = (dialogs || []).filter(d => d.status === 'waiting_seller').length;
  const newLeads = (leads || []).filter(l => (l.status || 'new') === 'new').length;
  const aiEnabled = aiManagerSettings?.enabled !== false;

  if (waitingDialogs > 0) {
    items.push({
      id: 'dialogs-waiting',
      title: `${waitingDialogs} ${plural(waitingDialogs, 'диалог ждёт ответа', 'диалога ждут ответа', 'диалогов ждут ответа')}`,
      reason: 'Клиенты получили ответ AI и ждут продавца.',
      action: 'Открыть диалоги',
      tab: 'ai-manager',
      priority: 'high',
    });
  }

  if (newOrders > 0) {
    items.push({
      id: 'new-orders',
      title: `${newOrders} ${plural(newOrders, 'новый заказ', 'новых заказа', 'новых заказов')}`,
      reason: 'Примите заказы, чтобы клиенты знали, что вы начали обработку.',
      action: 'Открыть заказы',
      tab: 'orders',
      priority: 'high',
    });
  }

  if (newLeads > 0) {
    items.push({
      id: 'new-leads',
      title: `${newLeads} ${plural(newLeads, 'новая заявка', 'новые заявки', 'новых заявок')}`,
      reason: 'Заявки от клиентов требуют обработки.',
      action: 'Открыть заявки',
      tab: 'clients',
      priority: 'high',
    });
  }

  if (quality.problemCount > 0) {
    items.push({
      id: 'quality-issues',
      title: `${quality.problemCount} ${plural(quality.problemCount, 'товар требует улучшения', 'товара требуют улучшения', 'товаров требуют улучшения')}`,
      reason: 'Карточки без преимуществ или с коротким описанием хуже конвертируют.',
      action: 'Проверить товары',
      tab: 'products',
      priority: 'medium',
    });
  }

  if (quality.hiddenCount > 0) {
    items.push({
      id: 'hidden-products',
      title: `${quality.hiddenCount} ${plural(quality.hiddenCount, 'товар скрыт', 'товара скрыто', 'товаров скрыто')}`,
      reason: 'Скрытые товары не отображаются в каталоге.',
      action: 'Открыть товары',
      tab: 'products',
      priority: 'low',
    });
  }

  if (!aiEnabled) {
    items.push({
      id: 'ai-manager-off',
      title: 'AI-менеджер выключен',
      reason: 'Клиенты не получают автоматические ответы.',
      action: 'Включить',
      tab: 'ai-manager',
      priority: 'medium',
    });
  }

  return items;
}

function plural(n, one, two, many) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = m % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return two;
  return many;
}
