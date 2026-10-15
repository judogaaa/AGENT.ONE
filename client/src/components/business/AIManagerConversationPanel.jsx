import { useState, useEffect, useRef } from 'react';
import { formatRelativeTime, formatDateTime, SENDER_MAP, QUICK_REPLIES, STATUS_LABEL_MAP } from '../../utils/aiManager';
import { formatPrice } from '../../utils/format';
import AgentIcon from '../AgentIcon';
import AIManagerStatusBadge from './AIManagerStatusBadge';

export default function AIManagerConversationPanel({
  dialog,
  messages,
  groupDialogs,
  onClose,
  onTakeover,
  onReply,
  onCreateLead,
  onChangeStatus,
  onOpenProduct,
  onSelectDialog,
  loading,
}) {
  const [replyText, setReplyText] = useState('');
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => { setReplyText(''); }, [dialog?.id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, dialog?.id]);

  if (!dialog) return null;

  const canReply = dialog.takenOverByBusiness && dialog.status !== 'closed';
  const canTakeover = !dialog.takenOverByBusiness && dialog.status !== 'closed';
  const hasLead = !!dialog.leadId;
  const hasProduct = !!dialog.productId;
  const isClosed = dialog.status === 'closed';
  const statusLabel = STATUS_LABEL_MAP[dialog.status] || dialog.status;

  const groupList = groupDialogs || [];
  const hasGroup = groupList.length > 1;
  const groupWaiting = groupList.filter(d => d.status === 'waiting_seller').length;
  const groupTotal = groupList.length;

  const sendReply = async () => {
    const text = (replyText || '').trim();
    if (!text) return;
    await onReply(text);
    setReplyText('');
  };

  const focusComposer = () => {
    if (textareaRef.current) textareaRef.current.focus();
  };

  const productImage = dialog.productImage || (dialog.productImages?.[0]) || '';

  const nextAction = (() => {
    if (isClosed) {
      return {
        title: 'Обращение закрыто',
        text: 'Откройте его снова, если клиент вернулся.',
        primary: { label: 'Открыть', action: () => onChangeStatus('open') },
      };
    }
    if (canTakeover) {
      return {
        title: hasLead ? 'Заявка создана' : hasProduct ? 'Клиент ждёт ответа' : 'Товар не выбран',
        text: hasLead ? 'Проверьте детали и продолжите работу.' : hasProduct ? 'Возьмите обращение в работу и отправьте ответ напрямую.' : 'Уточните потребность клиента или создайте общую заявку.',
        primary: { label: 'Взять в работу', action: onTakeover },
        secondary: hasLead ? { label: 'Закрыть', action: () => onChangeStatus('closed') } : { label: 'Создать заявку', action: onCreateLead },
      };
    }
    if (hasLead) {
      return {
        title: 'Заявка создана',
        text: 'Продолжите общение или закройте обращение.',
        primary: { label: 'Ответить', action: focusComposer },
        secondary: { label: 'Закрыть', action: () => onChangeStatus('closed') },
      };
    }
    if (!hasProduct) {
      return {
        title: 'Товар не выбран',
        text: 'Уточните потребность клиента или создайте заявку.',
        primary: { label: 'Ответить', action: focusComposer },
        secondary: { label: 'Создать заявку', action: onCreateLead },
      };
    }
    return {
      title: 'Обращение в работе',
      text: 'Ответьте клиенту или закройте обращение.',
      primary: { label: 'Ответить', action: focusComposer },
      secondary: { label: 'Закрыть', action: () => onChangeStatus('closed') },
    };
  })();

  const quickReplies = (() => {
    const base = [...QUICK_REPLIES];
    if (hasProduct) base.unshift('Могу оформить заявку по этому товару.');
    else base.unshift('Подскажите, какой товар или задачу вы рассматриваете?');
    return base;
  })();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(11,15,25,0.35)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680, height: '100%', background: '#fff', display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0b0f19' }}>{dialog.clientName || 'Клиент'}</div>
              <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>
                {[dialog.clientEmail, dialog.clientPhone].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <AIManagerStatusBadge status={dialog.status}>{statusLabel}</AIManagerStatusBadge>
                {hasLead && dialog.status !== 'lead_created' && <AIManagerStatusBadge status="lead_created">Заявка</AIManagerStatusBadge>}
                <span style={{ fontSize: 12, color: '#98a2b3' }}>Обновлён {formatRelativeTime(dialog.updatedAt)}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff',
                color: '#667085', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, lineHeight: 1, flexShrink: 0,
              }}
            >×</button>
          </div>

          {/* Next action */}
          <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 16, border: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Что нужно сделать</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19' }}>{nextAction.title}</div>
            <div style={{ fontSize: 13, color: '#667085', marginTop: 2, lineHeight: 1.5 }}>{nextAction.text}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={nextAction.primary.action}
                disabled={loading.takeover || loading.status}
                style={{
                  padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  cursor: loading.takeover || loading.status ? 'not-allowed' : 'pointer', border: 'none',
                  background: '#0b0f19', color: '#fff', opacity: loading.takeover || loading.status ? 0.7 : 1,
                }}
              >
                {nextAction.primary.label}
              </button>
              {nextAction.secondary && (
                <button
                  onClick={nextAction.secondary.action}
                  disabled={loading.createLead || loading.status}
                  style={{
                    padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    cursor: loading.createLead || loading.status ? 'not-allowed' : 'pointer',
                    border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
                    opacity: loading.createLead || loading.status ? 0.7 : 1,
                  }}
                >
                  {nextAction.secondary.label}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Group context */}
          {hasGroup && (
            <div style={{ marginBottom: 14, padding: 12, background: '#f8fafc', borderRadius: 16, border: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3 }}>Диалоги клиента</div>
                <span style={{ fontSize: 12, color: '#667085' }}>{groupTotal} {plural(groupTotal, 'диалог', 'диалога', 'диалогов')}</span>
              </div>
              {groupWaiting > 0 && <div style={{ fontSize: 12, color: '#9a3412', marginBottom: 8, fontWeight: 600 }}>{groupWaiting} ждут ответа</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groupList.map(d => {
                  const isActive = d.id === dialog.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => { if (!isActive && onSelectDialog) onSelectDialog(d.id); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10,
                        cursor: isActive ? 'default' : 'pointer', background: isActive ? '#fff' : 'transparent',
                        border: isActive ? '1px solid #e5e7eb' : '1px solid transparent', fontSize: 12,
                      }}
                    >
                      <AIManagerStatusBadge status={d.status} />
                      <span style={{ flex: 1, color: '#374151', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.productName || 'Без товара'}
                      </span>
                      <span style={{ color: '#98a2b3', whiteSpace: 'nowrap' }}>{formatRelativeTime(d.updatedAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Context */}
          <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>Контекст обращения</div>
            <ContextRow label="Клиент" value={[dialog.clientName || '—', dialog.clientEmail, dialog.clientPhone].filter(Boolean).join(' · ')} />
            <div style={{ borderTop: '1px solid #f3f4f6', margin: '8px 0' }} />
            <ContextRow
              label="Товар"
              value={hasProduct ? dialog.productName : 'Без товара'}
              extra={hasProduct && dialog.productPrice > 0 ? formatPrice(dialog.productPrice) : null}
              image={productImage}
              action={hasProduct ? { label: 'Открыть', onClick: onOpenProduct } : null}
            />
            <div style={{ borderTop: '1px solid #f3f4f6', margin: '8px 0' }} />
            <ContextRow
              label="Заявка"
              value={hasLead ? (dialog.leadStatus || 'Создана') : 'Заявка ещё не создана'}
              extra={hasLead && dialog.leadCreatedAt ? formatDateTime(dialog.leadCreatedAt) : null}
              action={!hasLead && !isClosed ? { label: 'Создать', onClick: onCreateLead } : null}
            />
          </div>

          {/* Reply workspace */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>Ответ клиенту</div>
            {canReply ? (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {quickReplies.map(q => (
                    <button
                      key={q}
                      onClick={() => setReplyText(prev => prev ? prev + '\n' + q : q)}
                      style={{
                        padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                        cursor: 'pointer', border: '1px solid #e5e7eb', background: '#f8fafc', color: '#374151',
                      }}
                    >
                      {q.length > 46 ? q.substring(0, 46) + '…' : q}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Напишите ответ клиенту…"
                    rows={2}
                    style={{
                      flex: 1, resize: 'none', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 14,
                      fontSize: 14, fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, color: '#0b0f19',
                    }}
                  />
                  <button
                    onClick={sendReply}
                    disabled={loading.reply || !(replyText || '').trim()}
                    style={{
                      padding: '10px 20px', borderRadius: 14, border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: loading.reply || !(replyText || '').trim() ? 'not-allowed' : 'pointer',
                      background: loading.reply || !(replyText || '').trim() ? '#e5e7eb' : '#0b0f19',
                      color: loading.reply || !(replyText || '').trim() ? '#9ca3af' : '#fff',
                      flexShrink: 0, height: 44,
                    }}
                  >
                    {loading.reply ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 6 }}>Enter — отправить, Shift+Enter — новая строка</div>
              </>
            ) : isClosed ? (
              <DisabledReply>
                <button onClick={() => onChangeStatus('open')} disabled={loading.status} style={takeoverBtnStyle(loading.status)}>Открыть</button>
                <span style={{ fontSize: 12, color: '#667085' }}>Диалог закрыт. Переоткройте, чтобы ответить.</span>
              </DisabledReply>
            ) : (
              <DisabledReply>
                <button onClick={onTakeover} disabled={loading.takeover} style={takeoverBtnStyle(loading.takeover)}>{loading.takeover ? 'Взятие…' : 'Взять в работу'}</button>
                <span style={{ fontSize: 12, color: '#667085' }}>Сначала возьмите обращение в работу, чтобы ответить напрямую.</span>
              </DisabledReply>
            )}
          </div>

          {/* History */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 12 }}>История</div>
            {(messages || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#98a2b3', fontSize: 13, background: '#f8fafc', borderRadius: 16, border: '1px solid #f3f4f6' }}>
                Сообщений пока нет
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(messages || []).map((m, i) => <MessageItem key={m.id || i} message={m} />)}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisabledReply({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 14, border: '1px solid #f3f4f6' }}>
      {children}
    </div>
  );
}

function takeoverBtnStyle(loading) {
  return {
    padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer', border: 'none', background: '#0b0f19', color: '#fff',
    opacity: loading ? 0.7 : 1,
  };
}

function ContextRow({ label, value, extra, image, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        {image && <img src={image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: value === 'Без товара' || value === 'Заявка ещё не создана' ? '#9ca3af' : '#0b0f19' }}>{value}</div>
          {extra && <div style={{ fontSize: 12, color: '#667085', marginTop: 1 }}>{extra}</div>}
        </div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#667085', flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function MessageItem({ message: m }) {
  const isClient = m.senderRole === 'client';
  const isSystem = m.senderRole === 'system';
  const isBusiness = m.senderRole === 'business';
  const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

  if (isSystem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: '#98a2b3', background: '#f8fafc', padding: '4px 10px', borderRadius: 999 }}>
          {m.message}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isClient ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 11, color: '#98a2b3', marginBottom: 3, paddingLeft: isClient ? 0 : 4, paddingRight: isClient ? 4 : 0 }}>
        {SENDER_MAP[m.senderRole] || m.senderRole} · {time}
      </div>
      <div style={{
        maxWidth: '80%', padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
        background: isClient ? '#0b0f19' : (isBusiness ? '#f3f4f6' : '#fff'),
        color: isClient ? '#fff' : '#0b0f19',
        border: isClient ? 'none' : '1px solid #e5e7eb',
      }}>
        {m.message}
      </div>
    </div>
  );
}

function plural(n, one, two, many) {
  const m = n % 100;
  if (m >= 11 && m <= 19) return many;
  const d = m % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return two;
  return many;
}
