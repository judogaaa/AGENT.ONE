import { useStore } from '../hooks/useStore';

const guestSteps = [
  { step: '01', title: 'Выберите свою цель', desc: 'Найдите нужный товар как покупатель или создайте магазин, чтобы начать продавать свои товары.' },
  { step: '02', title: 'Используйте AI-помощника', desc: 'AI поможет подобрать и сравнить товары, создать описания и упростить работу с каталогом.' },
  { step: '03', title: 'Покупайте и продавайте', desc: 'Оформляйте заказы, управляйте товарами, заявками и продажами в единой системе.' },
];

const buyerSteps = [
  { step: '01', title: 'Найдите товар', desc: 'Откройте каталог, используйте умный поиск и фильтры. AI поможет найти нужное.' },
  { step: '02', title: 'Сравните с AI', desc: 'Добавьте товары в сравнение и запустите AI. Он выберет лучший вариант по цене, состоянию и доставке.' },
  { step: '03', title: 'Оформите заказ', desc: 'Добавьте в корзину, оформите заказ или напишите продавцу — он получит заявку с AI-консультацией.' },
];

const businessSteps = [
  { step: '01', title: 'Настройте AI-менеджера', desc: 'Включите AI Manager, задайте правила общения, условия доставки, оплаты и передачи клиента продавцу.' },
  { step: '02', title: 'Получайте диалоги и заявки', desc: 'AI отвечает клиентам по товарам магазина, подбирает варианты, создаёт заявки и сохраняет историю общения.' },
  { step: '03', title: 'Забирайте сделки в работу', desc: 'Продавец видит все диалоги, может взять общение на себя, ответить вручную и довести клиента до заказа.' },
];

export default function Features() {
  const s = useStore();
  const isBusiness = s.user?.role === 'business';
  const isClient = s.user && !isBusiness;
  const isGuest = !s.user;

  const items = isBusiness ? businessSteps : (isClient ? buyerSteps : guestSteps);
  const title = isBusiness ? 'Как AI-менеджер продаёт 24/7' : 'Как это работает';
  const subtitle = isBusiness
    ? 'Три шага к автоматическим заявкам и продажам'
    : (isClient ? 'Три шага до выгодной покупки с AI' : 'Три шага для покупателей и бизнеса');

  return (
    <section style={{ padding: '60px 0' }}>
      <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 8 }}>{title}</h2>
      <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 15, marginBottom: 40 }}>{subtitle}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
        {items.map((item, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#667eea', marginBottom: 12, opacity: .25 }}>{item.step}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#111' }}>{item.title}</h3>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
