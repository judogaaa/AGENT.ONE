import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import FloatingDropdown from './FloatingDropdown';
import AgentIcon from './AgentIcon';

const SORT_OPTIONS = [
  { value: '', label: 'По умолчанию' },
  { value: 'popularity', label: 'По популярности' },
  { value: 'rating', label: 'По рейтингу' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'newest', label: 'По новинкам' },
];

const CAT_OPTIONS = [
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

const pillStyle = (isActive) => ({
  padding: '8px 14px', borderRadius: 14, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  border: '1px solid #e5e7eb', background: isActive ? '#f4f5f7' : '#fff', color: '#374151',
  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
});

function countSelected(s) { return (s || '').split(',').filter(Boolean).length; }

export default function CatalogFilters({ filters, onChangeFilters }) {
  const s = useStore();
  const facets = s.catalogFacets;
  if (!facets) return null;

  const set = (patch) => onChangeFilters({ ...filters, ...patch });

  const bN = countSelected(filters.brand);
  const cN = countSelected(filters.color);
  const dN = countSelected(filters.deliveryTerm);
  const ktN = countSelected(filters.keyboardType);
  const kcN = countSelected(filters.keyboardConnection);

  // Show expanded filters only when user has search context or has active selections
  const hasSearchContext = (filters.q || '').trim().length > 0 || filters.category !== '' || !!s.smartSearchResult;

  // Expanded filters: show if (context AND facets exist) OR (user has active selection)
  const showBrand    = (hasSearchContext && facets.brands?.length > 0)             || bN > 0;
  const showColor    = (hasSearchContext && facets.colors?.length > 0)             || cN > 0;
  const showDelivery = (hasSearchContext && facets.deliveryTerms?.length > 0)      || dN > 0;
  const showKbType   = (hasSearchContext && facets.keyboardTypes?.length > 0)      || ktN > 0;
  const showKbConn   = (hasSearchContext && facets.keyboardConnections?.length > 0) || kcN > 0;

  const hasClearable = bN + cN + dN + ktN + kcN > 0 || filters.condition || filters.minPrice || filters.maxPrice;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

      {/* Category — always visible */}
      <FloatingDropdown
        width={240}
        trigger={({ open }) => <div style={pillStyle(open || filters.category)}>{CAT_OPTIONS.find(o => o.value === filters.category)?.label || 'Все категории'} ▼</div>}
      >
        {({ close }) => (
          <div style={{ padding: 6 }}>
            {CAT_OPTIONS.map(o => (
              <div key={o.value} onClick={() => { set({ category: o.value }); close(); }} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: filters.category === o.value ? '#111' : '#6b7280', background: filters.category === o.value ? '#f8f8fa' : 'transparent', fontWeight: filters.category === o.value ? 600 : 400 }}>
                {o.label}
              </div>
            ))}
          </div>
        )}
      </FloatingDropdown>

      {/* Sort — always visible */}
      <FloatingDropdown
        width={220}
        trigger={({ open }) => <div style={pillStyle(open)}>{SORT_OPTIONS.find(o => o.value === filters.sort)?.label || 'По умолчанию'} ▼</div>}
      >
        {({ close }) => (
          <div style={{ padding: 6 }}>
            {SORT_OPTIONS.map(o => (
              <div key={o.value} onClick={() => { set({ sort: o.value }); close(); }} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: filters.sort === o.value ? '#111' : '#6b7280', background: filters.sort === o.value ? '#f8f8fa' : 'transparent', fontWeight: filters.sort === o.value ? 600 : 400 }}>
                {o.label}
              </div>
            ))}
          </div>
        )}
      </FloatingDropdown>

      {/* Condition — always visible */}
      <div style={{ display: 'flex', background: '#f4f5f7', borderRadius: 14, padding: 3, flexShrink: 0 }}>
        {['', 'new', 'used'].map(v => {
          const label = v === '' ? 'Любое' : v === 'new' ? 'Новое' : 'Б/у';
          const active = (filters.condition || '') === v;
          return <button key={v} onClick={() => set({ condition: v === '' ? '' : v })} style={{ padding: '7px 16px', borderRadius: 12, fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer', border: 'none', background: active ? '#111' : 'transparent', color: active ? '#fff' : '#6b7280' }}>{label}</button>;
        })}
      </div>

      {/* All filters — always visible */}
      <FloatingDropdown
        width={600}
        trigger={({ open }) => <div style={{ ...pillStyle(open), borderColor: '#d0d5dd', color: '#344054', background: open ? '#f8fafc' : '#fff' }}>Все фильтры</div>}
      >
        {({ close }) => <AllFiltersContent filters={filters} facets={facets} onApply={(f) => { onChangeFilters(f); close(); }} />}
      </FloatingDropdown>

      {/* Price — always visible */}
      <FloatingDropdown
        width={260}
        trigger={({ open }) => <div style={pillStyle(open || filters.minPrice || filters.maxPrice)}>{(filters.minPrice || filters.maxPrice) ? `Цена: ${filters.minPrice || facets.price?.min || 0}–${filters.maxPrice || facets.price?.max || 0}` : 'Цена'} ▼</div>}
      >
        {({ close }) => <PriceContent filters={filters} facets={facets} onApply={(p) => { set(p); close(); }} />}
      </FloatingDropdown>

      {/* Brand — expanded (context + facets) OR active */}
      {showBrand && (
        <FloatingDropdown
          width={240}
          trigger={({ open }) => <div style={pillStyle(open || bN > 0)}>{bN > 0 ? `Бренд · ${bN}` : 'Бренд'} ▼</div>}
        >
          {({ close }) => <CheckContent items={facets.brands} selected={(filters.brand || '').split(',').filter(Boolean)} onApply={(v) => { set({ brand: v.join(',') }); close(); }} />}
        </FloatingDropdown>
      )}

      {/* Color */}
      {showColor && (
        <FloatingDropdown
          width={240}
          trigger={({ open }) => <div style={pillStyle(open || cN > 0)}>{cN > 0 ? `Цвет · ${cN}` : 'Цвет'} ▼</div>}
        >
          {({ close }) => <CheckContent items={facets.colors} selected={(filters.color || '').split(',').filter(Boolean)} onApply={(v) => { set({ color: v.join(',') }); close(); }} />}
        </FloatingDropdown>
      )}

      {/* Delivery */}
      {showDelivery && (
        <FloatingDropdown
          width={240}
          trigger={({ open }) => <div style={pillStyle(open || dN > 0)}>{dN > 0 ? `Доставка · ${dN}` : 'Доставка'} ▼</div>}
        >
          {({ close }) => <CheckContent items={facets.deliveryTerms} selected={(filters.deliveryTerm || '').split(',').filter(Boolean)} onApply={(v) => { set({ deliveryTerm: v.join(',') }); close(); }} />}
        </FloatingDropdown>
      )}

      {/* Keyboard Type */}
      {showKbType && (
        <FloatingDropdown
          width={240}
          trigger={({ open }) => <div style={pillStyle(open || ktN > 0)}>{ktN > 0 ? `Тип · ${ktN}` : 'Тип клавиатуры'} ▼</div>}
        >
          {({ close }) => <CheckContent items={facets.keyboardTypes} selected={(filters.keyboardType || '').split(',').filter(Boolean)} onApply={(v) => { set({ keyboardType: v.join(',') }); close(); }} />}
        </FloatingDropdown>
      )}

      {/* Keyboard Connection */}
      {showKbConn && (
        <FloatingDropdown
          width={240}
          trigger={({ open }) => <div style={pillStyle(open || kcN > 0)}>{kcN > 0 ? `Подкл · ${kcN}` : 'Подключение'} ▼</div>}
        >
          {({ close }) => <CheckContent items={facets.keyboardConnections} selected={(filters.keyboardConnection || '').split(',').filter(Boolean)} onApply={(v) => { set({ keyboardConnection: v.join(',') }); close(); }} />}
        </FloatingDropdown>
      )}

      {/* Clear */}
      {hasClearable && (
        <button onClick={() => set({ condition: '', minPrice: '', maxPrice: '', brand: '', color: '', deliveryTerm: '', keyboardType: '', keyboardConnection: '' })} style={{ padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', flexShrink: 0 }}>Сбросить</button>
      )}
    </div>
  );
}

/* ── Price dropdown content ── */
function PriceContent({ filters, facets, onApply }) {
  const [min, setMin] = useState(filters.minPrice || '');
  const [max, setMax] = useState(filters.maxPrice || '');
  const fm = facets?.price || {};
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={min} onChange={e => setMin(e.target.value)} placeholder={String(fm.min || 'От')} type="number" style={{ width: 90, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14 }} />
        <span style={{ color: '#9ca3af' }}>—</span>
        <input value={max} onChange={e => setMax(e.target.value)} placeholder={String(fm.max || 'До')} type="number" style={{ width: 90, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14 }} />
      </div>
      <button onClick={() => onApply({ minPrice: min || '', maxPrice: max || '' })} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Готово</button>
    </div>
  );
}

/* ── Checkbox dropdown content ── */
function CheckContent({ items, selected, onApply }) {
  const [local, setLocal] = useState(selected);
  const toggle = (v) => setLocal(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {items.map(it => (
          <div key={it.value} onClick={() => toggle(it.value)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: local.includes(it.value) ? '#f8f8fa' : 'transparent' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid #e5e7eb', background: local.includes(it.value) ? '#111' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, flexShrink: 0 }}>{local.includes(it.value) ? <AgentIcon name="check" size={10} /> : null}</span>
            <span style={{ color: '#374151', flex: 1 }}>{it.label}</span>
            {it.count != null && <span style={{ fontSize: 11, color: '#9ca3af' }}>{it.count}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onApply(local)} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Готово</button>
        {local.length > 0 && <button onClick={() => onApply([])} style={{ padding: '10px 18px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Сбросить</button>}
      </div>
    </div>
  );
}

/* ── All filters dropdown content ── */
function AllFiltersContent({ filters, facets, onApply }) {
  const [local, setLocal] = useState({ ...filters });
  const fm = facets?.price || {};
  const apply = () => onApply(local);
  const reset = () => {
    const cleared = { ...filters, condition: '', minPrice: '', maxPrice: '', brand: '', color: '', deliveryTerm: '', keyboardType: '', keyboardConnection: '' };
    setLocal(cleared);
    onApply(cleared);
  };

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );

  const ChipRow = ({ items, sel, onChange }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {items.slice(0, 10).map(it => (
        <span key={it.value} onClick={() => onChange(sel.includes(it.value) ? sel.filter(x => x !== it.value) : [...sel, it.value])} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid #e5e7eb', background: sel.includes(it.value) ? '#111' : '#fff', color: sel.includes(it.value) ? '#fff' : '#374151', fontWeight: 500 }}>
          {it.label} {it.count != null && <span style={{ opacity: .6, fontSize: 11 }}>{it.count}</span>}
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <Section label="Цена, ₽">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={local.minPrice || ''} onChange={e => setLocal({ ...local, minPrice: e.target.value })} placeholder={String(fm.min || 'От')} type="number" style={{ width: 80, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
              <span style={{ color: '#9ca3af' }}>—</span>
              <input value={local.maxPrice || ''} onChange={e => setLocal({ ...local, maxPrice: e.target.value })} placeholder={String(fm.max || 'До')} type="number" style={{ width: 80, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
            </div>
          </Section>
          <Section label="Состояние">
            <div style={{ display: 'flex', background: '#f4f5f7', borderRadius: 10, padding: 3, width: 'fit-content' }}>
              {['', 'new', 'used'].map(v => {
                const label = v === '' ? 'Любое' : v === 'new' ? 'Новое' : 'Б/у';
                return <button key={v} onClick={() => setLocal({ ...local, condition: v })} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: (local.condition || '') === v ? 600 : 400, cursor: 'pointer', border: 'none', background: (local.condition || '') === v ? '#111' : 'transparent', color: (local.condition || '') === v ? '#fff' : '#6b7280' }}>{label}</button>;
              })}
            </div>
          </Section>
          {facets.deliveryTerms?.length > 0 && <Section label="Срок доставки"><ChipRow items={facets.deliveryTerms} sel={(local.deliveryTerm || '').split(',').filter(Boolean)} onChange={v => setLocal({ ...local, deliveryTerm: v.join(',') })} /></Section>}
          {facets.keyboardTypes?.length > 0 && <Section label="Тип клавиатуры"><ChipRow items={facets.keyboardTypes} sel={(local.keyboardType || '').split(',').filter(Boolean)} onChange={v => setLocal({ ...local, keyboardType: v.join(',') })} /></Section>}
        </div>
        <div>
          {facets.brands?.length > 0 && <Section label="Бренд"><ChipRow items={facets.brands} sel={(local.brand || '').split(',').filter(Boolean)} onChange={v => setLocal({ ...local, brand: v.join(',') })} /></Section>}
          {facets.colors?.length > 0 && <Section label="Цвет"><ChipRow items={facets.colors} sel={(local.color || '').split(',').filter(Boolean)} onChange={v => setLocal({ ...local, color: v.join(',') })} /></Section>}
          {facets.keyboardConnections?.length > 0 && <Section label="Подключение"><ChipRow items={facets.keyboardConnections} sel={(local.keyboardConnection || '').split(',').filter(Boolean)} onChange={v => setLocal({ ...local, keyboardConnection: v.join(',') })} /></Section>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={apply} style={{ flex: 1, padding: '12px', background: '#111', color: '#fff', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none' }}>Применить</button>
        <button onClick={reset} style={{ padding: '12px 24px', background: '#fff', color: '#6b7280', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Сбросить всё</button>
      </div>
    </div>
  );
}
