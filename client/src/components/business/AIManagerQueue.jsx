import { useState, useMemo } from 'react';
import { formatRelativeTime, maskEmail, STATUS_FILTERS, SORT_OPTIONS, STATUS_LABEL_MAP, groupDialogsByClient, getGroupStatusLabel } from '../../utils/aiManager';
import { formatPrice } from '../../utils/format';
import AgentIcon from '../AgentIcon';
import AIManagerStatusBadge from './AIManagerStatusBadge';

export default function AIManagerQueue({
  dialogs,
  selectedId,
  filterStatus,
  sortKey,
  searchQ,
  counts,
  onSelect,
  onFilterChange,
  onSortChange,
  onSearchChange,
  onTakeover,
  loading,
}) {
  const total = counts?.total ?? dialogs.length;
  const waiting = counts?.waiting_seller || 0;
  const leads = counts?.lead_created || 0;
  const [groupKeysExpanded, setGroupKeysExpanded] = useState({});

  const groups = useMemo(() => {
    let list = groupDialogsByClient(dialogs);
    if (searchQ && searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(g =>
        g.clientName.toLowerCase().includes(q) ||
        (g.clientEmail || '').toLowerCase().includes(q) ||
        (g.clientPhone || '').includes(q) ||
        g.uniqueProductNames.some(pn => pn.toLowerCase().includes(q)) ||
        g.dialogs.some(d => (d.lastMessage || '').toLowerCase().includes(q))
      );
    }
    if (filterStatus !== 'all') {
      list = list.filter(g => g.dialogs.some(d => d.status === filterStatus));
    }
    if (sortKey === 'newest') {
      list.sort((a, b) => new Date(b.lastDialog?.updatedAt || 0) - new Date(a.lastDialog?.updatedAt || 0));
    } else if (sortKey === 'leads') {
      list.sort((a, b) => b.leadCount - a.leadCount);
    } else {
      list.sort((a, b) => {
        const pa = getStatusPriorityScore(a);
        const pb = getStatusPriorityScore(b);
        if (pa !== pb) return pa - pb;
        return (b.totalCount || 0) - (a.totalCount || 0);
      });
    }
    return list;
  }, [dialogs, searchQ, filterStatus, sortKey]);

  const toggleGroupExpand = (key) => {
    setGroupKeysExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGroupAction = (e, group) => {
    e.stopPropagation();
    const waitingDialog = group.dialogs.find(d => d.status === 'waiting_seller');
    if (waitingDialog) {
      onTakeover(waitingDialog.id, group.dialogs);
    } else {
      onSelect(group.lastDialog?.id || group.dialogs[0]?.id, group.dialogs);
    }
  };

  const handleGroupOpen = (group) => {
    onSelect(group.lastDialog?.id || group.dialogs[0]?.id, group.dialogs);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0b0f19', margin: 0 }}>Входящие обращения</h3>
          <p style={{ fontSize: 13, color: '#667085', margin: '4px 0 0' }}>Сгруппированы по клиентам</p>
        </div>
        <div style={{ fontSize: 13, color: '#667085' }}>
          <span style={{ fontWeight: 700, color: '#0b0f19' }}>{groups.length}</span> клиентов
          {waiting > 0 && <>{' · '}<span style={{ fontWeight: 700, color: '#0b0f19' }}>{waiting}</span> ждут ответа</>}
          {leads > 0 && <>{' · '}<span style={{ fontWeight: 700, color: '#0b0f19' }}>{leads}</span> заявок</>}
        </div>
      </div>

      {/* Command bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <input
            value={searchQ}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Поиск по клиенту, товару или сообщению"
            style={{
              width: '100%', height: 44, padding: '0 16px 0 40px', border: '1px solid #e5e7eb', borderRadius: 14,
              fontSize: 13, outline: 'none', background: '#fff', color: '#0b0f19', boxSizing: 'border-box',
            }}
          />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#98a2b3' }}>
            <AgentIcon name="search" size={16} muted />
          </span>
        </div>
        <SortDropdown value={sortKey} onChange={onSortChange} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(f => {
          const active = filterStatus === f.key;
          const count = f.key === 'all' ? total : (counts?.[f.key] || 0);
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              style={{
                padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: 'pointer', border: active ? '1.5px solid #111' : '1px solid #e5e7eb',
                background: active ? '#111' : '#fff', color: active ? '#fff' : '#667085', transition: 'all .15s',
              }}
            >
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Queue */}
      {groups.length === 0 ? (
        <EmptyState loading={loading.list} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(group => (
            <GroupCard
              key={group.key}
              group={group}
              selected={!!group.dialogs.find(d => d.id === selectedId)}
              expanded={!!groupKeysExpanded[group.key]}
              onToggle={() => toggleGroupExpand(group.key)}
              onOpen={() => handleGroupOpen(group)}
              onAction={(e) => handleGroupAction(e, group)}
              onSelectDialog={(dialogId) => onSelect(dialogId, group.dialogs)}
              loadingTakeover={loading.takeover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getStatusPriorityScore(g) {
  const hasWaiting = g.waitingCount > 0;
  const hasLeads = g.leadCount > 0;
  const hasTakenOver = g.takenOverCount > 0;
  if (hasWaiting) return 0;
  if (hasTakenOver) return 1;
  if (hasLeads) return 2;
  if (g.openCount > 0) return 3;
  return 4;
}

function GroupCard({ group, selected, expanded, onToggle, onOpen, onAction, onSelectDialog, loadingTakeover }) {
  const g = group;
  const statusLabel = getGroupStatusLabel(g);
  const hasWaiting = g.waitingCount > 0;
  const hasLead = g.leadCount > 0;
  const hasMultiple = g.totalCount > 1;
  const lastMessage = g.lastDialog?.lastMessage || '';
  const uniqueProducts = g.uniqueProductNames.filter(Boolean);

  return (
    <div style={{
      background: '#fff', border: `1.5px solid ${selected ? '#0b0f19' : '#e5e7eb'}`, borderRadius: 18,
      overflow: 'hidden', transition: 'border-color .12s',
    }}>
      <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={onOpen}>
        {/* Row 1: client + status + time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19' }}>{g.clientName}</span>
              {hasMultiple && <span style={{ fontSize: 11, color: '#98a2b3', fontWeight: 500 }}>{g.totalCount} {plural(g.totalCount, 'диалог', 'диалога', 'диалогов')}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
              {g.clientEmail ? maskEmail(g.clientEmail) : ''}
              {g.clientPhone ? `${g.clientEmail ? ' · ' : ''}${g.clientPhone}` : ''}
              {!g.clientEmail && !g.clientPhone && <span>Контакт не указан</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <AIManagerStatusBadge status={g.priorityStatus}>{statusLabel}</AIManagerStatusBadge>
            <span style={{ fontSize: 11, color: '#98a2b3', whiteSpace: 'nowrap' }}>{formatRelativeTime(g.lastDialog?.updatedAt)}</span>
          </div>
        </div>

        {/* Row 2: products + counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          {uniqueProducts.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <AgentIcon name="box" size={13} muted />
              <span style={{ fontSize: 13, color: '#374151' }}>
                {uniqueProducts.length === 1 ? (
                  <>{uniqueProducts[0]}{g.lastDialog?.productPrice > 0 ? ` · ${formatPrice(g.lastDialog.productPrice)}` : ''}</>
                ) : (
                  <>{uniqueProducts.length} {plural(uniqueProducts.length, 'товар', 'товара', 'товаров')} обсуждается</>
                )}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: '#98a2b3' }}>Без товара</span>
          )}
          {hasWaiting && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', background: '#fff7ed', padding: '2px 8px', borderRadius: 999 }}>
              {g.waitingCount} {plural(g.waitingCount, 'ждёт ответа', 'ждут ответа', 'ждут ответа')}
            </span>
          )}
          {hasLead && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', background: '#ecfdf5', padding: '2px 8px', borderRadius: 999 }}>
              {g.leadCount} {plural(g.leadCount, 'заявка', 'заявки', 'заявок')}
            </span>
          )}
        </div>

        {/* Row 3: last message preview */}
        {lastMessage && (
          <div style={{ fontSize: 12, color: '#667085', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 8 }}>
            {lastMessage}
          </div>
        )}

        {/* Row 4: actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {hasWaiting ? (
            <button
              onClick={onAction}
              disabled={loadingTakeover}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                cursor: loadingTakeover ? 'not-allowed' : 'pointer', border: 'none',
                background: '#0b0f19', color: '#fff', opacity: loadingTakeover ? 0.7 : 1,
              }}
            >
              {loadingTakeover ? '…' : 'В работу'}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
              }}
            >
              Открыть
            </button>
          )}
          {hasMultiple && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#667085',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 10, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
              {expanded ? 'Скрыть' : 'Все диалоги'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded dialog list */}
      {expanded && hasMultiple && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 14px 12px', background: '#fafbfc' }}>
          {g.dialogs.map(d => {
            const isActive = d.id === g.lastDialog?.id;
            return (
              <div
                key={d.id}
                onClick={(e) => { e.stopPropagation(); onSelectDialog(d.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
                  cursor: 'pointer', background: isActive ? '#fff' : 'transparent',
                  border: isActive ? '1px solid #e5e7eb' : '1px solid transparent',
                }}
              >
                <AIManagerStatusBadge status={d.status} />
                <span style={{ flex: 1, fontSize: 12, color: '#667085', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.productName || 'Без товара'}
                  {d.messagesCount > 0 ? ` · ${d.messagesCount} сообщ.` : ''}
                </span>
                <span style={{ fontSize: 11, color: '#98a2b3', whiteSpace: 'nowrap' }}>{formatRelativeTime(d.updatedAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ loading }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: '#98a2b3', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Обращений не найдено</div>
      <div style={{ fontSize: 13 }}>{loading ? 'Загрузка…' : 'Когда клиенты начнут писать AI-менеджеру, они появятся здесь.'}</div>
    </div>
  );
}

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = SORT_OPTIONS.find(o => o.key === value) || SORT_OPTIONS[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 44, padding: '0 34px 0 16px', border: '1px solid #e5e7eb', borderRadius: 14, fontSize: 13,
          background: '#fff', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          minWidth: 180, position: 'relative',
        }}
      >
        <AgentIcon name="chevron-down" size={14} muted />
        {selected.label}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 2,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)', padding: 6, minWidth: 190,
          }}>
            {SORT_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, fontSize: 13,
                  cursor: 'pointer', border: 'none', background: value === o.key ? '#f3f4f6' : '#fff', color: '#374151',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
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
