import { useState, useEffect } from 'react';
import { useStore } from '../../hooks/useStore';
import { MODE_OPTIONS } from '../../utils/aiManager';
import CustomSelect from '../CustomSelect';
import AIManagerQueue from './AIManagerQueue';
import AIManagerConversationPanel from './AIManagerConversationPanel';

export default function AIManagerWorkspace() {
  const s = useStore();
  const settings = s.aiManagerSettings || {};
  const enabled = settings.enabled !== false;
  const mode = settings.mode || 'assistive';

  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [sortKey, setSortKey] = useState('priority');
  const [selectedDialogId, setSelectedDialogId] = useState(null);
  const [selectedGroupDialogs, setSelectedGroupDialogs] = useState([]);

  const [loading, setLoading] = useState({
    list: false, detail: false, reply: false, takeover: false, createLead: false, status: false, settings: false,
  });

  const loadDialogs = async () => {
    if (!s.token || s.user?.role !== 'business') return;
    setLoading(prev => ({ ...prev, list: true }));
    try {
      const params = { limit: 50 };
      if (filterStatus !== 'all') params.status = filterStatus;
      if (searchQ.trim()) params.q = searchQ.trim();
      if (sortKey !== 'newest') params.sort = sortKey;
      await s.loadBusinessAIManagerDialogs(params);
    } finally {
      setLoading(prev => ({ ...prev, list: false }));
    }
  };

  useEffect(() => {
    if (s.token && s.user?.role === 'business') {
      s.loadAIManagerSettings();
      loadDialogs();
    }
  }, [filterStatus, sortKey, s.token]);

  useEffect(() => {
    if (!s.token || s.user?.role !== 'business') return;
    const t = setTimeout(loadDialogs, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const openDialog = async (id, groupDialogs) => {
    setSelectedDialogId(id);
    if (groupDialogs && groupDialogs.length > 0) {
      setSelectedGroupDialogs(groupDialogs);
    } else {
      setSelectedGroupDialogs([]);
    }
    setLoading(prev => ({ ...prev, detail: true }));
    try {
      await s.loadBusinessAIManagerDialog(id);
    } finally {
      setLoading(prev => ({ ...prev, detail: false }));
    }
  };

  const closeDialog = () => {
    setSelectedDialogId(null);
    setSelectedGroupDialogs([]);
  };

  const selectedListDialog = (s.aiManagerDialogs || []).find(d => d.id === selectedDialogId) || null;

  const detailDialog = (() => {
    if (s.aiManagerDialog && s.aiManagerDialog.id === selectedDialogId) {
      return { ...selectedListDialog, ...s.aiManagerDialog };
    }
    return selectedListDialog;
  })();

  const refreshBoth = async () => {
    await loadDialogs();
    if (selectedDialogId) {
      setLoading(prev => ({ ...prev, detail: true }));
      try { await s.loadBusinessAIManagerDialog(selectedDialogId); } finally { setLoading(prev => ({ ...prev, detail: false })); }
    }
  };

  const takeover = async (id, groupDialogs) => {
    const targetId = id || selectedDialogId;
    if (!targetId) return;
    if (groupDialogs && groupDialogs.length > 0) setSelectedGroupDialogs(groupDialogs);
    setLoading(prev => ({ ...prev, takeover: true }));
    try {
      await s.takeoverAIManagerDialog(targetId);
      await refreshBoth();
      if (targetId !== selectedDialogId) await openDialog(targetId);
    } finally { setLoading(prev => ({ ...prev, takeover: false })); }
  };

  const reply = async (text) => {
    if (!selectedDialogId || !text.trim()) return;
    setLoading(prev => ({ ...prev, reply: true }));
    try {
      await s.replyAIManagerDialog(selectedDialogId, text.trim());
      await refreshBoth();
    } finally { setLoading(prev => ({ ...prev, reply: false })); }
  };

  const createLead = async () => {
    if (!selectedDialogId) return;
    setLoading(prev => ({ ...prev, createLead: true }));
    try {
      await s.createBusinessAIManagerLead(selectedDialogId);
      await refreshBoth();
    } finally { setLoading(prev => ({ ...prev, createLead: false })); }
  };

  const changeStatus = async (status) => {
    if (!selectedDialogId) return;
    setLoading(prev => ({ ...prev, status: true }));
    try {
      await s.updateAIManagerDialogStatus(selectedDialogId, status);
      await refreshBoth();
    } finally { setLoading(prev => ({ ...prev, status: false })); }
  };

  const openProduct = () => {
    if (detailDialog?.productId) {
      s.loadProduct(detailDialog.productId);
    }
  };

  const counts = s.aiManagerCounts || { open: 0, waiting_seller: 0, lead_created: 0, taken_over: 0, closed: 0, total: 0 };

  const kpi = [
    { key: 'waiting_seller', label: 'Ждут ответа', hint: 'Требуется продавец' },
    { key: 'lead_created', label: 'Новые заявки', hint: 'Из AI-менеджера' },
    { key: 'taken_over', label: 'В работе', hint: 'Переданы вам' },
    { key: 'closed', label: 'Закрытые', hint: 'Завершённые' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0b0f19', margin: 0 }}>AI-менеджер</h2>
            <p style={{ fontSize: 13, color: '#667085', marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
              Автоматически консультирует клиентов, создаёт заявки и передаёт сложные обращения продавцу.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={chipStyle(enabled ? '#ecfdf5' : '#f9fafb', enabled ? '#065f46' : '#6b7280')}>
              {enabled ? 'Включён' : 'Отключён'}
            </span>
            <span style={chipStyle('#f9fafb', '#6b7280')}>
              {modeLabel(mode)}
            </span>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, margin: '20px 0' }}>
        {kpi.map(item => (
          <div key={item.key} style={{ ...cardStyle, padding: '18px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0b0f19' }}>{counts[item.key] || 0}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 2 }}>{item.hint}</div>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <AIManagerSettingsPanel settings={settings} loading={loading.settings} setLoading={setLoading} />
      </div>

      {/* Queue */}
      <AIManagerQueue
        dialogs={s.aiManagerDialogs || []}
        selectedId={selectedDialogId}
        filterStatus={filterStatus}
        sortKey={sortKey}
        searchQ={searchQ}
        counts={counts}
        onSelect={openDialog}
        onFilterChange={setFilterStatus}
        onSortChange={setSortKey}
        onSearchChange={setSearchQ}
        onTakeover={takeover}
        loading={loading}
      />

      {/* Detail drawer */}
      {selectedDialogId && (
        <AIManagerConversationPanel
          dialog={detailDialog}
          messages={s.aiManagerMessages || []}
          groupDialogs={selectedGroupDialogs}
          onClose={closeDialog}
          onTakeover={takeover}
          onReply={reply}
          onCreateLead={createLead}
          onChangeStatus={changeStatus}
          onOpenProduct={openProduct}
          onSelectDialog={(id) => { setSelectedDialogId(id); const gd = selectedGroupDialogs; s.loadBusinessAIManagerDialog(id); }}
          loading={loading}
        />
      )}
    </div>
  );
}

function modeLabel(mode) {
  const map = {
    off: 'Выключен',
    assistive: 'Подсказки',
    auto_reply: 'Автоответ',
    auto_reply_and_lead: 'Автоответ + заявки',
  };
  return map[mode] || mode;
}

function buildSettingsForm(settings = {}) {
  return {
    enabled: settings.enabled !== false,
    mode: settings.mode || 'assistive',
    tone: settings.tone || 'professional',
    welcomeMessage: settings.welcomeMessage || '',
    handoffMessage: settings.handoffMessage || '',
    deliveryPolicy: settings.deliveryPolicy || '',
    warrantyPolicy: settings.warrantyPolicy || '',
    paymentPolicy: settings.paymentPolicy || '',
    discountPolicy: settings.discountPolicy || '',
    forbiddenTopics: settings.forbiddenTopics || '',
    aiGreeting: settings.aiGreeting || '',
    aiTone: settings.aiTone || 'professional',
    aiStylePrompt: settings.aiStylePrompt || '',
    aiForbiddenClaims: settings.aiForbiddenClaims || '',
    aiPreferredCTA: settings.aiPreferredCTA || '',
    aiUseShopContacts: settings.aiUseShopContacts !== false,
    aiAnswerOutsideCatalog: settings.aiAnswerOutsideCatalog !== false,
    aiStrictCatalogGrounding: settings.aiStrictCatalogGrounding !== false,
    autoCreateLeads: settings.autoCreateLeads !== false,
    autoSuggestProducts: settings.autoSuggestProducts !== false,
    autoSuggestCheckout: settings.autoSuggestCheckout !== false,
    handoffOnUnknown: settings.handoffOnUnknown !== false,
  };
}

function isDirty(form, settings = {}) {
  const s = buildSettingsForm(settings);
  return Object.keys(s).some(key => form[key] !== s[key]);
}

function AIManagerSettingsPanel({ settings, loading, setLoading }) {
  const s = useStore();
  const [form, setForm] = useState(() => buildSettingsForm(settings));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(buildSettingsForm(settings));
  }, [settings]);

  const update = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const dirty = isDirty(form, settings);

  const save = async () => {
    setError('');
    setLoading(prev => ({ ...prev, settings: true }));
    try {
      await s.saveAIManagerSettings(form);
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Не удалось сохранить');
    } finally {
      setLoading(prev => ({ ...prev, settings: false }));
    }
  };

  const status = (() => {
    if (loading) return { label: 'Сохранение…', bg: '#f3f4f6', color: '#6b7280' };
    if (error) return { label: 'Ошибка сохранения', bg: '#fef2f2', color: '#991b1b' };
    if (saved && !dirty) return { label: 'Сохранено', bg: '#ecfdf5', color: '#065f46' };
    if (dirty) return { label: 'Есть изменения', bg: '#fff7ed', color: '#9a3412' };
    return { label: 'Сохранено', bg: '#f9fafb', color: '#6b7280' };
  })();

  const filledRulesCount = [
    form.welcomeMessage,
    form.deliveryPolicy,
    form.warrantyPolicy,
    form.paymentPolicy,
    form.discountPolicy,
  ].filter(v => v.trim().length > 0).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0b0f19', margin: 0 }}>Настройки AI-менеджера</h3>
          <p style={{ fontSize: 13, color: '#667085', margin: '4px 0 0', lineHeight: 1.5 }}>
            Определите, как AI отвечает клиентам и когда передаёт обращение продавцу.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
            background: status.bg, color: status.color, border: '1px solid ' + status.bg,
          }}>
            {status.label}
          </span>
          <button
            onClick={save}
            disabled={loading || !dirty}
            style={{
              padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              cursor: loading || !dirty ? 'not-allowed' : 'pointer', border: 'none',
              background: loading || !dirty ? '#f3f4f6' : '#0b0f19',
              color: loading || !dirty ? '#9ca3af' : '#fff',
              transition: 'all .15s',
            }}
          >
            {loading ? 'Сохраняем…' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      {/* Top control row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StateCard form={form} update={update} />
        <AutomationCard form={form} update={update} />
      </div>

      {/* Rules grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <RuleField
          label="Приветствие"
          value={form.welcomeMessage}
          onChange={v => update('welcomeMessage', v)}
          helper="Первое сообщение AI-менеджера."
          placeholder="Здравствуйте! Я AI-менеджер магазина. Помогу подобрать товар и передам сложный вопрос продавцу."
        />
        <RuleField
          label="Доставка"
          value={form.deliveryPolicy}
          onChange={v => update('deliveryPolicy', v)}
          helper="Что AI может говорить о доставке."
          placeholder="Например: Доставка обсуждается с продавцом после оформления заявки."
        />
        <RuleField
          label="Гарантия"
          value={form.warrantyPolicy}
          onChange={v => update('warrantyPolicy', v)}
          helper="Что AI может говорить о гарантии."
          placeholder="Например: Гарантия зависит от товара и уточняется у продавца."
        />
        <RuleField
          label="Оплата"
          value={form.paymentPolicy}
          onChange={v => update('paymentPolicy', v)}
          helper="Что AI может говорить об оплате."
          placeholder="Например: Оплата по договорённости с продавцом. Онлайн-оплата сейчас не подключена."
        />
        <RuleField
          label="Скидки"
          value={form.discountPolicy}
          onChange={v => update('discountPolicy', v)}
          helper="Что AI может говорить о скидках."
          placeholder="Например: Скидки согласуются индивидуально с продавцом."
        />
        <SummaryCard filled={filledRulesCount} total={5} />
      </div>

      {/* Greeting and style */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 12 }}>Приветствие и стиль</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <RuleField
            label="Приветствие AI-менеджера"
            value={form.aiGreeting}
            onChange={v => update('aiGreeting', v)}
            helper="Первое сообщение в чате. Если пустое — используется стандартное приветствие."
            placeholder="Здравствуйте! Я AI-менеджер магазина GamePower. Помогу подобрать компьютер под ваши задачи."
          />
          <div style={innerCardStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0b0f19', marginBottom: 8 }}>Стиль общения</div>
            <CustomSelect
              value={form.aiTone}
              onChange={e => update('aiTone', e.target.value)}
              options={[
                { value:'professional', label:'Профессиональный' },
                { value:'friendly', label:'Дружелюбный' },
                { value:'short', label:'Краткий' },
                { value:'premium', label:'Премиальный' },
                { value:'technical', label:'Технический' },
              ]}
              placeholder="Выберите стиль"
            />
          </div>
          <RuleField
            label="Дополнительные правила общения"
            value={form.aiStylePrompt}
            onChange={v => update('aiStylePrompt', v)}
            helper="Особые инструкции к стилю: обращение на 'вы', использование терминов и т.д."
            placeholder="Обращайся к клиенту на 'вы', используй профессиональную терминологию."
          />
          <RuleField
            label="Что нельзя обещать"
            value={form.aiForbiddenClaims}
            onChange={v => update('aiForbiddenClaims', v)}
            helper="Запрещённые обещания, которые AI не должен делать."
            placeholder="Например: не обещать бесплатную доставку, гарантию без документов, скидки."
          />
          <RuleField
            label="Основной CTA"
            value={form.aiPreferredCTA}
            onChange={v => update('aiPreferredCTA', v)}
            helper="Призыв к действию в конце ответа."
            placeholder="Оставьте заявку — продавец уточнит детали."
          />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 10, borderRadius: 10, fontSize: 13, background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function StateCard({ form, update }) {
  return (
    <div style={innerCardStyle}>
      <div style={sectionLabel}>Состояние</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0b0f19' }}>AI-менеджер включён</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2, lineHeight: 1.4 }}>
            Клиенты смогут писать AI-менеджеру на странице товара и магазина.
          </div>
        </div>
        <Switch checked={form.enabled} onChange={v => update('enabled', v)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Режим работы</div>
        <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', flexWrap: 'wrap' }}>
          {MODE_OPTIONS.map((m, idx) => {
            const active = form.mode === m.value;
            const isLast = idx === MODE_OPTIONS.length - 1;
            return (
              <button
                key={m.value}
                onClick={() => update('mode', m.value)}
                style={{
                  flex: 1, minWidth: 100, padding: '8px 10px', fontSize: 12, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', border: 'none', borderRight: isLast ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#0b0f19' : '#fff', color: active ? '#fff' : '#374151',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AutomationCard({ form, update }) {
  const items = [
    { key: 'autoCreateLeads', label: 'Заявки', hint: 'Создавать при явном запросе' },
    { key: 'autoSuggestProducts', label: 'Товары', hint: 'Предлагать товары магазина' },
    { key: 'autoSuggestCheckout', label: 'Оформление', hint: 'Помогать перейти к заказу' },
    { key: 'handoffOnUnknown', label: 'Передача продавцу', hint: 'Передавать непонятные вопросы' },
  ];

  return (
    <div style={innerCardStyle}>
      <div style={sectionLabel}>Автоматизация</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {items.map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0b0f19' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 1, lineHeight: 1.35 }}>{item.hint}</div>
            </div>
            <Switch checked={form[item.key]} onChange={v => update(item.key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleField({ label, value, onChange, helper, placeholder }) {
  const filled = value.trim().length > 0;
  return (
    <div style={innerCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0b0f19' }}>{label}</div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
          background: filled ? '#ecfdf5' : '#f9fafb', color: filled ? '#065f46' : '#9ca3af',
          border: '1px solid ' + (filled ? '#ecfdf5' : '#e5e7eb'),
        }}>
          {filled ? 'Заполнено' : 'Не указано'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 8, lineHeight: 1.4 }}>{helper}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: 68, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 14, fontSize: 13,
          fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#0b0f19', boxSizing: 'border-box', lineHeight: 1.5,
        }}
      />
    </div>
  );
}

function SummaryCard({ filled, total }) {
  return (
    <div style={{ ...innerCardStyle, background: '#f8fafc' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0b0f19', marginBottom: 4 }}>Сводка</div>
      <div style={{ fontSize: 12, color: '#667085', lineHeight: 1.5, marginBottom: 12 }}>
        AI отвечает только по данным магазина. Если правило пустое, AI честно скажет, что информация не указана.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
          <div style={{ width: `${(filled / total) * 100}%`, height: '100%', background: '#0b0f19', borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0b0f19', whiteSpace: 'nowrap' }}>{filled} из {total}</div>
      </div>
      <div style={{ fontSize: 11, color: '#667085', marginTop: 6 }}>Правил заполнено</div>
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 12, background: checked ? '#0b0f19' : '#e5e7eb',
        cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
        left: checked ? 21 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.12)',
      }} />
    </div>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24 };
const innerCardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 16 };
const sectionLabel = { fontSize: 11, fontWeight: 700, color: '#667085', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 };
const chipStyle = (bg, color) => ({
  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: bg, color,
  border: '1px solid ' + (bg === '#f9fafb' ? '#e5e7eb' : bg), whiteSpace: 'nowrap',
});
