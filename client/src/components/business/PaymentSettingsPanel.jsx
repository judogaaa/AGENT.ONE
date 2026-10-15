import { useState, useEffect, useMemo } from 'react';
import { useStore, useApi } from '../../hooks/useStore';
import PaymentStatusCard from './PaymentStatusCard';
import PaymentMethodCard from './PaymentMethodCard';
import PaymentPreviewCard from './PaymentPreviewCard';

export default function PaymentSettingsPanel() {
  const s = useStore();
  const { loading: apiLoading, error: apiError, call } = useApi();
  const [saved, setSaved] = useState(false);

  const settings = s.paymentSettings || {};
  const [storePay, setStorePay] = useState(settings.storePaymentEnabled !== false);
  const [cashPay, setCashPay] = useState(settings.cashEnabled !== false);
  const [invoicePay, setInvoicePay] = useState(settings.invoiceEnabled === true);

  useEffect(() => {
    if (s.paymentSettings) {
      setStorePay(s.paymentSettings.storePaymentEnabled !== false);
      setCashPay(s.paymentSettings.cashEnabled !== false);
      setInvoicePay(s.paymentSettings.invoiceEnabled === true);
    }
  }, [s.paymentSettings]);

  const dirty = useMemo(() => {
    const orig = s.paymentSettings || {};
    return (
      storePay !== (orig.storePaymentEnabled !== false) ||
      cashPay !== (orig.cashEnabled !== false) ||
      invoicePay !== (orig.invoiceEnabled === true)
    );
  }, [storePay, cashPay, invoicePay, s.paymentSettings]);

  const save = async () => {
    setSaved(false);
    await call(() => s.savePaymentSettings({
      storePaymentEnabled: storePay,
      cashEnabled: cashPay,
      invoiceEnabled: invoicePay,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const offlineCount = [storePay, cashPay, invoicePay].filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0b0f19', margin: 0 }}>Оплата</h3>
          <p style={{ fontSize: 13, color: '#667085', margin: '4px 0 0', lineHeight: 1.5, maxWidth: 520 }}>
            Настройте способы оплаты, которые будут доступны покупателям при оформлении заказа.
          </p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
          background: '#fff8ed', color: '#92400e', border: '1px solid #fff8ed', whiteSpace: 'nowrap',
        }}>
          Онлайн-оплата не подключена
        </span>
      </div>

      {/* Status overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <PaymentStatusCard
          value={offlineCount}
          label="Доступно сейчас"
          sub="Офлайн-способы"
        />
        <PaymentStatusCard
          value="0"
          label="Скоро"
          sub="ЮKassa / карты / СБП / QR"
        />
        <PaymentStatusCard
          value={offlineCount > 0 ? 'Офлайн' : '—'}
          label="Покупатель видит"
          sub={offlineCount > 0 ? 'Оплата при получении / по договорённости' : 'Способы оплаты не настроены'}
        />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Offline payment methods */}
          <div style={cardStyle}>
            <div style={sectionHeader}>Офлайн-способы оплаты</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PaymentMethodCard
                title="Оплата в магазине"
                description="Покупатель оплатит заказ при самовывозе или в точке продаж."
                checked={storePay}
                onChange={setStorePay}
              />
              <PaymentMethodCard
                title="Наличными при получении"
                description="Покупатель оплачивает заказ при получении."
                checked={cashPay}
                onChange={setCashPay}
              />
              <PaymentMethodCard
                title="Счёт для юрлица"
                description="Вы сможете выставить счёт после оформления заказа."
                checked={invoicePay}
                onChange={setInvoicePay}
              />
            </div>
          </div>

          {/* Online preparation */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={sectionHeader}>Онлайн-оплата через ЮKassa</div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4, lineHeight: 1.45 }}>
                  Интеграция с ЮKassa будет подключена позже. Сейчас вводить Shop ID и Secret Key не нужно.
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                background: '#f9fafb', color: '#9ca3af', border: '1px solid #e5e7eb', whiteSpace: 'nowrap',
              }}>
                Скоро будет доступно
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PaymentMethodCard
                title="Банковская карта"
                checked={false}
                disabled
              />
              <PaymentMethodCard
                title="СБП"
                checked={false}
                disabled
              />
              <PaymentMethodCard
                title="QR-оплата"
                checked={false}
                disabled
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <LockedField label="Shop ID" />
              <LockedField label="Secret Key" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: '#e5e7eb', border: '1px solid #d1d5db', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#9ca3af' }}>Тестовый режим</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Buyer checkout preview */}
          <div style={{ ...cardStyle, position: 'sticky', top: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 14 }}>
              Как это увидит покупатель
            </div>

            <div style={{
              background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                Способ оплаты
              </div>
              {storePay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: '#fff', border: '1.5px solid #0b0f19', marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: '4px solid #0b0f19', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0b0f19' }}>Оплата в магазине</span>
                </div>
              )}
              {cashPay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: '#fff', border: storePay ? '1px solid #e5e7eb' : '1.5px solid #0b0f19', marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: storePay ? '1.5px solid #d1d5db' : '4px solid #0b0f19', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: storePay ? 500 : 600, color: storePay ? '#667085' : '#0b0f19' }}>Наличными при получении</span>
                </div>
              )}
              {invoicePay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: '#fff', border: (storePay || cashPay) ? '1px solid #e5e7eb' : '1.5px solid #0b0f19', marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: (storePay || cashPay) ? '1.5px solid #d1d5db' : '4px solid #0b0f19', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: (storePay || cashPay) ? 500 : 600, color: (storePay || cashPay) ? '#667085' : '#0b0f19' }}>Счёт для юрлица</span>
                </div>
              )}
              {offlineCount === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: '#98a2b3', textAlign: 'center' }}>
                  Способы оплаты не выбраны
                </div>
              )}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                  Онлайн-оплата недоступна. Покупатель видит только офлайн-способы.
                </span>
              </div>
            </div>

            {/* Visual card */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 12 }}>
                Онлайн-оплата
              </div>
              <PaymentPreviewCard />
              <div style={{ fontSize: 12, color: '#667085', marginTop: 10, lineHeight: 1.5 }}>
                Будет доступна после подключения ЮKassa. Покупатели смогут оплачивать картой, через СБП или QR.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div style={{
        marginTop: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '16px 20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
            background: saved ? '#ecfdf5' : (dirty ? '#fff7ed' : '#f9fafb'),
            color: saved ? '#065f46' : (dirty ? '#9a3412' : '#9ca3af'),
            border: `1px solid ${saved ? '#ecfdf5' : (dirty ? '#fff7ed' : '#e5e7eb')}`,
          }}>
            {saved ? 'Сохранено' : (dirty ? 'Есть изменения' : 'Сохранено')}
          </span>
        </div>
        <button
          onClick={save}
          disabled={apiLoading || !dirty}
          style={{
            padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: apiLoading || !dirty ? 'not-allowed' : 'pointer',
            border: 'none', background: apiLoading || !dirty ? '#e5e7eb' : '#0b0f19', color: apiLoading || !dirty ? '#9ca3af' : '#fff',
          }}
        >
          {apiLoading ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
      {apiError && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, fontSize: 13, background: '#fef2f2', color: '#991b1b' }}>
          {apiError}
        </div>
      )}
    </div>
  );
}

function LockedField({ label }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 5 }}>{label}</div>
      <div style={{
        width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 14,
        fontSize: 13, background: '#f9fafb', color: '#9ca3af', boxSizing: 'border-box',
        textAlign: 'left',
      }}>
        Будет доступно позже
      </div>
    </div>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, padding: '20px 22px' };
const sectionHeader = { fontSize: 15, fontWeight: 700, color: '#0b0f19', marginBottom: 2 };
