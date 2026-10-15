import { useState, useEffect, useMemo } from 'react';
import { useStore, useApi } from '../../hooks/useStore';
import { formatPrice, hasValidPrice } from '../../utils/format';
import { scoreProduct, qualityColor, getProductIssues } from '../../utils/sellerQuality';
import { CATEGORY_OPTIONS, getCategoryLabel } from '../../constants/categories';
import { getProductMainImage, normalizeImages } from '../../utils/productImages';
import CustomSelect from '../CustomSelect';
import StatusBadge from '../ui/StatusBadge';
import MotionMorphMenu from '../motion/MotionMorphMenu';
import AgentIcon from '../AgentIcon';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'В каталоге' },
  { key: 'inactive', label: 'Скрытые' },
  { key: 'nophoto', label: 'Без фото' },
  { key: 'quality', label: 'Нужно улучшить' },
];

const SORTS = [
  { key: 'newest', label: 'Сначала новые' },
  { key: 'price_asc', label: 'Цена по возрастанию' },
  { key: 'price_desc', label: 'Цена по убыванию' },
  { key: 'name', label: 'По названию' },
];

export default function DashboardProducts() {
  const s = useStore();
  const { loading, error, call } = useApi();
  const products = s.businessProducts || [];

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [formError, setFormError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mode, setMode] = useState('manual');

  const [textInput, setTextInput] = useState('');
  const [draft, setDraft] = useState(null);
  const [draftForm, setDraftForm] = useState(null);
  const [textLoading, setTextLoading] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [bulkSelected, setBulkSelected] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [csvText, setCsvText] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  const [csvSelected, setCsvSelected] = useState({});
  const [csvError, setCsvError] = useState('');

  useEffect(() => {
    if (s.user?.role === 'business') s.loadBusinessProducts();
  }, []);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter(p => p.isActive !== false).length;
    const inactive = total - active;
    const noPhoto = products.filter(p => !hasImage(p)).length;
    const needImprove = products.filter(p => getProductIssues(p).length > 0).length;
    return { total, active, inactive, noPhoto, needImprove };
  }, [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        const cat = getCategoryLabel(p.category).toLowerCase();
        return (p.name || '').toLowerCase().includes(q) || cat.includes(q) || String(p.price).includes(q);
      });
    }
    if (filter === 'active') list = list.filter(p => p.isActive !== false);
    if (filter === 'inactive') list = list.filter(p => p.isActive === false);
    if (filter === 'nophoto') list = list.filter(p => !hasImage(p));
    if (filter === 'quality') list = list.filter(p => getProductIssues(p).length > 0);

    list.sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sort === 'price_asc') return (a.price || 0) - (b.price || 0);
      if (sort === 'price_desc') return (b.price || 0) - (a.price || 0);
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '', 'ru');
      return 0;
    });
    return list;
  }, [products, search, filter, sort]);

  const resetForm = () => setForm(defaultForm());

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowForm(true);
    setFormError('');
    setSaveSuccess(false);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || '',
      description: p.description || '',
      price: p.price || 0,
      oldPrice: p.oldPrice || '',
      category: p.category || '',
      benefits: (p.benefits || []).join('\n'),
      images: (p.images || []).join('\n'),
      isActive: p.isActive !== false,
    });
    setShowForm(true);
    setFormError('');
    setSaveSuccess(false);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    resetForm();
    setFormError('');
    setSaveSuccess(false);
  };

  const validate = () => {
    if (!form.name.trim()) return 'Укажите название товара';
    if (form.oldPrice && Number(form.oldPrice) <= Number(form.price)) return 'Old price must be higher than current';
    return '';
  };

  const submit = async () => {
    setFormError('');
    const err = validate();
    if (err) { setFormError(err); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      category: form.category,
    };
    if (form.benefits.trim()) payload.benefits = form.benefits.split('\n').map(s => s.trim()).filter(Boolean);
    if (form.oldPrice) payload.oldPrice = Number(form.oldPrice);
    if (form.images.trim()) payload.images = form.images.split('\n').map(s => s.trim()).filter(Boolean);
    payload.isActive = !!form.isActive;

    if (editing) {
      await call(() => s.updateProduct(editing.id, payload));
    } else {
      let shopId = s.currentShop?.id;
      if (!shopId && products.length > 0) shopId = products[0].shopId;
      if (shopId) payload.shopId = shopId;
      await call(() => s.createProduct(payload));
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    closeForm();
    s.loadBusinessProducts();
  };

  const handleDelete = async (id) => {
    setDeleteLoading(true);
    await call(() => s.deleteProduct(id));
    setDeleteLoading(false);
    setConfirmDelete(null);
    s.loadBusinessProducts();
  };

  const toggleActive = async (p) => {
    const payload = { isActive: p.isActive === false };
    await call(() => s.updateProduct(p.id, payload));
    s.loadBusinessProducts();
  };

  const openPublic = (p) => {
    window.open('/#/product/' + p.id, '_blank');
  };

  // Text draft
  const createDraft = async () => {
    if (!textInput.trim()) return;
    setTextLoading(true);
    try {
      const d = await call(() => s.createProductDraft(textInput));
      if (d && d.draft) {
        setDraft(d.draft);
        setDraftForm({ ...d.draft });
      }
    } finally { setTextLoading(false); }
  };

  const confirmDraft = async () => {
    const payload = buildPayloadFromDraft(draftForm, products, s.currentShop?.id);
    if (!payload.name) return;
    await call(() => s.createProduct(payload));
    resetDraft();
    s.loadBusinessProducts();
  };

  const resetDraft = () => {
    setDraft(null);
    setDraftForm(null);
    setTextInput('');
  };

  // Bulk draft
  const createBulkDrafts = async () => {
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    try {
      const d = await call(() => s.createBulkProductDrafts(bulkText));
      if (d && d.drafts) {
        setBulkDrafts(d.drafts.map((dr, i) => ({ ...dr, _idx: i })));
        const sel = {};
        d.drafts.forEach((_, i) => { sel[i] = true; });
        setBulkSelected(sel);
        setBulkResult(null);
      }
    } finally { setBulkLoading(false); }
  };

  const confirmBulk = async () => {
    const toCreate = bulkDrafts.filter(d => bulkSelected[d._idx]);
    const list = toCreate.map(d => buildPayloadFromDraft(d, products, s.currentShop?.id)).filter(p => p.name);
    if (list.length === 0) return;
    const result = await call(() => s.createManyProducts(list));
    setBulkResult(result);
    setBulkDrafts([]);
    setBulkText('');
    s.loadBusinessProducts();
  };

  // CSV
  const parseCSV = () => {
    setCsvError('');
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) { setCsvError('Нужен заголовок и хотя бы одна строка'); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const priceIdx = headers.indexOf('price');
    if (nameIdx === -1 || priceIdx === -1) { setCsvError('CSV должен содержать колонки name и price'); return; }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      const row = { _idx: i - 1, _valid: true, _error: '' };
      headers.forEach((h, j) => { row[h] = vals[j] || ''; });
      if (!row.name) { row._valid = false; row._error = 'Нет названия'; }
      if (!row.price || isNaN(Number(row.price))) { row._error = (row._error ? row._error + '; ' : '') + 'Некорректная цена'; row._valid = false; }
      rows.push(row);
    }
    setCsvRows(rows);
    const sel = {};
    rows.forEach(r => { if (r._valid) sel[r._idx] = true; });
    setCsvSelected(sel);
  };

  const confirmCSV = async () => {
    const toCreate = csvRows.filter(r => csvSelected[r._idx] && r._valid);
    const list = toCreate.map(r => {
      const p = { name: r.name, price: Number(r.price) || 0, category: r.category || 'other', description: r.description || '' };
      if (r.oldprice) p.oldPrice = Number(r.oldprice);
      if (r.benefits) p.benefits = r.benefits.split(';').map(s => s.trim()).filter(Boolean);
      if (r.images) p.images = r.images.split(';').map(s => s.trim()).filter(Boolean);
      let shopId = s.currentShop?.id;
      if (!shopId && products.length > 0) shopId = products[0].shopId;
      if (shopId) p.shopId = shopId;
      return p;
    }).filter(p => p.name);
    if (list.length === 0) return;
    const result = await call(() => s.createManyProducts(list));
    setBulkResult(result);
    setCsvRows([]);
    setCsvText('');
    s.loadBusinessProducts();
  };

  const resetModes = () => {
    setMode('manual');
    resetForm();
    setShowForm(false);
    resetDraft();
    setBulkDrafts([]);
    setBulkSelected({});
    setBulkText('');
    setCsvRows([]);
    setCsvText('');
    setCsvError('');
    setBulkResult(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0b0f19', margin: 0 }}>Товары</h3>
          <p style={{ fontSize: 13, color: '#667085', margin: '4px 0 0' }}>Управляйте каталогом магазина, фото, ценами и публикацией.</p>
        </div>
        {mode !== 'manual' ? (
          <button onClick={resetModes} style={primaryBtn}>Назад</button>
        ) : (
          <MotionMorphMenu
            trigger="Добавить товар"
            items={[
              { key: 'text', label: 'Из текста', icon: 'pencil', onClick: () => { setMode('text'); setBulkResult(null); resetDraft(); } },
              { key: 'bulk', label: 'Массовое добавление', icon: 'checklist', onClick: () => { setMode('bulk'); setBulkResult(null); setBulkDrafts([]); setBulkSelected({}); setBulkText(''); } },
              { key: 'csv', label: 'CSV', icon: 'document', onClick: () => { setMode('csv'); setCsvRows([]); setCsvText(''); setCsvError(''); } },
            ]}
          />
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <StatCard label="Всего" value={stats.total} />
        <StatCard label="Активные" value={stats.active} />
        <StatCard label="Скрытые" value={stats.inactive} />
        <StatCard label="Без фото" value={stats.noPhoto} />
        <StatCard label="Нужно улучшить" value={stats.needImprove} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, категории или цене"
            style={searchInput}
          />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#98a2b3' }}>
            <AgentIcon name="search" size={16} muted />
          </span>
          {search && (
            <button onClick={() => setSearch('')}
              className={`ao-clear-btn ${search ? ' ao-visible' : ''}`}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', background: 'none', border: 'none', padding: 4, color: '#98a2b3', fontSize: 16, lineHeight: 1 }}
            >×</button>
          )}
        </div>
        <CustomSelect value={sort} onChange={e => setSort(e.target.value)} options={SORTS.map(o => ({ value:o.key, label:o.label }))} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = f.key === 'all' ? stats.total : (f.key === 'active' ? stats.active : f.key === 'inactive' ? stats.inactive : f.key === 'nophoto' ? stats.noPhoto : stats.needImprove);
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} style={filterPill(active)}>
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Editor drawer */}
      {showForm && (
        <ProductEditor
          editing={editing}
          form={form}
          setForm={setForm}
          onClose={closeForm}
          onSave={submit}
          onDelete={editing ? () => { closeForm(); setConfirmDelete(editing.id); } : null}
          loading={loading}
          error={formError || error}
          success={saveSuccess}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <DeleteModal
          product={products.find(p => p.id === confirmDelete)}
          loading={deleteLoading}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}

      {/* Text draft */}
      {mode === 'text' && (
        <TextDraftPanel
          textInput={textInput} setTextInput={setTextInput}
          draft={draft} draftForm={draftForm} setDraftForm={setDraftForm}
          onCreate={createDraft} onConfirm={confirmDraft} onCancel={resetDraft}
          textLoading={textLoading} loading={loading} error={error}
        />
      )}

      {/* Bulk draft */}
      {mode === 'bulk' && (
        <BulkDraftPanel
          bulkText={bulkText} setBulkText={setBulkText}
          bulkDrafts={bulkDrafts} bulkSelected={bulkSelected} setBulkSelected={setBulkSelected}
          setBulkDrafts={setBulkDrafts}
          onCreate={createBulkDrafts} onConfirm={confirmBulk}
          bulkLoading={bulkLoading} loading={loading}
        />
      )}

      {/* CSV */}
      {mode === 'csv' && (
        <CsvPanel
          csvText={csvText} setCsvText={setCsvText} csvRows={csvRows} csvSelected={csvSelected}
          setCsvSelected={setCsvSelected} csvError={csvError} onParse={parseCSV} onConfirm={confirmCSV}
          loading={loading}
        />
      )}

      {/* Bulk/CSV result */}
      {bulkResult && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#0b0f19' }}>Результат</h4>
          <p style={{ fontSize: 13, color: '#065f46' }}>Создано: {bulkResult.successful?.length || 0}</p>
          {bulkResult.failed?.length > 0 && <p style={{ fontSize: 13, color: '#991b1b' }}>Ошибок: {bulkResult.failed.length}</p>}
          <button onClick={() => setBulkResult(null)} style={{ ...primaryBtn, marginTop: 8 }}>OK</button>
        </div>
      )}

      {/* Product list */}
      {products.length === 0 && mode === 'manual' && !showForm ? (
        <EmptyProducts />
      ) : mode === 'manual' && !showForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              onEdit={() => openEdit(p)}
              onToggleActive={() => toggleActive(p)}
              onDelete={() => setConfirmDelete(p.id)}
              onOpen={() => openPublic(p)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: '#98a2b3', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, fontSize: 13 }}>
              Товары не найдены. Попробуйте изменить поиск или фильтры.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Product Row ───

function ProductRow({ product, onEdit, onToggleActive, onDelete, onOpen }) {
  const img = getProductMainImage(product);
  const noImg = !img;
  const active = product.isActive !== false;
  const imgCount = Array.isArray(product.images) ? product.images.filter(Boolean).length : 0;
  const publicVisible = active && !noImg;
  const score = scoreProduct(product);
  const qcol = qualityColor(score);

  return (
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ width: 64, height: 64, borderRadius: 14, background: '#f8fafc', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {img
            ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={e => { e.target.style.display = 'none'; }} />
            : <AgentIcon name="box" size={24} muted />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name || 'Без названия'}</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span>{getCategoryLabel(product.category)}</span>
            <span style={{ color: '#d1d5db' }}>·</span>
            <span style={{ fontWeight: 600, color: '#374151' }}>{hasValidPrice(product.price) ? formatPrice(product.price) : 'Цена не указана'}</span>
            <span style={{ color: '#d1d5db' }}>·</span>
            <span>{noImg ? 'Нет фото' : `${imgCount} фото`}</span>
            <StatusBadge variant={publicVisible ? 'success' : 'muted'} size="sm">
              {publicVisible ? 'В каталоге' : (active && noImg ? 'Нет фото' : 'Скрыт')}
            </StatusBadge>
            <StatusBadge variant={score >= 85 ? 'success' : score >= 60 ? 'warning' : 'danger'} size="sm">
              Качество {score}
            </StatusBadge>
            {noImg && <span style={{ fontSize: 10, color: '#98a2b3' }}>— не виден покупателям</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <button onClick={onEdit} style={btnPrimarySm}>Редактировать</button>
        <button onClick={onOpen} style={btnSecondarySm}>Открыть</button>
        <button onClick={onToggleActive} style={btnSecondarySm}>{active ? 'Скрыть' : 'Активировать'}</button>
        <button onClick={onDelete} style={btnDangerSm}>Удалить</button>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ───

function DeleteModal({ product, loading, onCancel, onConfirm }) {
  const img = product ? getProductMainImage(product) : null;
  return (
    <div style={modalOverlay} onClick={onCancel}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0b0f19', marginBottom: 6 }}>Удалить товар?</div>
        <p style={{ fontSize: 13, color: '#667085', margin: '0 0 16px', lineHeight: 1.5 }}>
          Товар будет удалён из списка магазина. История заказов и заявок не будет затронута.
        </p>
        {product && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 12, marginBottom: 18 }}>
            <div style={modalPreview}>
              {img
                ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                : <AgentIcon name="box" size={20} muted />
              }
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0b0f19' }}>{product.name}</div>
              <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
                {getCategoryLabel(product.category)} · {hasValidPrice(product.price) ? formatPrice(product.price) : '—'}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={secondaryBtn}>Отмена</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', background: loading ? '#fecaca' : '#991b1b', color: loading ? '#7f1d1d' : '#fff' }}>
            {loading ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Editor (wide workspace drawer) ───

function ProductEditor({ editing, form, setForm, onClose, onSave, onDelete, loading, error, success }) {
  const images = normalizeImages(form.images).filter(Boolean);
  const hasImg = images.length > 0;
  const activeNoImg = form.isActive && !hasImg;
  const img = hasImg ? images[0] : null;
  const [imgErr, setImgErr] = useState(false);
  const [showImageLinks, setShowImageLinks] = useState(false);
  const publicVisible = form.isActive && hasImg;

  return (
    <div style={drawerOverlay} onClick={onClose}>
      <div style={drawerPanel} onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={drawerHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }}>
              {editing ? 'Редактирование товара' : 'Новый товар'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0b0f19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {form.name || (editing ? 'Без названия' : 'Новый товар')}
            </div>
          </div>
          <button onClick={onClose} style={drawerCloseBtn}>
            <AgentIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={drawerBody}>

          {/* Preview bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: '#f8fafc', borderRadius: 18, border: '1px solid #f3f4f6', marginBottom: 22 }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {(img && !imgErr)
                ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }} onError={() => setImgErr(true)} />
                : <AgentIcon name="box" size={22} muted />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Новый товар'}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 2 }}>
                {hasValidPrice(form.price) ? formatPrice(Number(form.price)) : 'Цена не указана'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              <StatusBadge variant={form.isActive ? 'success' : 'muted'} size="sm">{form.isActive ? 'Активен' : 'Скрыт'}</StatusBadge>
              {!hasImg ? <StatusBadge variant="warning" size="sm">Нет фото</StatusBadge> : <StatusBadge variant="success" size="sm">{images.length} фото</StatusBadge>}
              <StatusBadge variant={publicVisible ? 'success' : 'muted'} size="sm">{publicVisible ? 'В каталоге' : 'Скрыт'}</StatusBadge>
            </div>
            {!hasImg && <div style={{ fontSize: 11, color: '#667085', marginTop: 6, width: '100%' }}>Товар не будет виден покупателям без изображения.</div>}
          </div>

          {/* Основное */}
          <Section title="Основное">
            <Field label="Название *">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="iPhone 16 Pro 256 ГБ" style={input} />
            </Field>
            <Field label="Описание" helper="Не добавляйте гарантию, доставку или скидки, если их нет в настройках магазина.">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Краткое описание товара" style={textarea} />
            </Field>
            <Field label="Преимущества" helper="По одному преимуществу на строку.">
              <textarea value={form.benefits} onChange={e => setForm({ ...form, benefits: e.target.value })} rows={2} placeholder="Быстрая доставка" style={textarea} />
            </Field>
          </Section>

          {/* Цена и категория */}
          <Section title="Цена и категория">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <Field label="Цена, ₽">
                <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0" style={input} />
              </Field>
              <Field label="Старая цена, ₽">
                <input type="number" value={form.oldPrice} onChange={e => setForm({ ...form, oldPrice: e.target.value })} placeholder="0" style={input} />
              </Field>
              <Field label="Категория">
                <CustomSelect value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORY_OPTIONS.filter(o => o.value)} placeholder="Выберите" />
              </Field>
            </div>
          </Section>

          {/* Медиа */}
          <Section title="Медиа">
            <div style={{ fontSize: 12, color: '#98a2b3', marginBottom: 10 }}>Первое изображение используется как основное.</div>
            {hasImg ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {images.map((url, i) => (
                    <ImageThumb key={i} url={url} main={i === 0} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 8 }}>{images.length} изображений</div>
              </div>
            ) : (
              <div style={{ padding: 24, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e5e7eb', color: '#667085', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                <AgentIcon name="box" size={24} muted />
                <div style={{ fontWeight: 600, color: '#374151', marginTop: 6 }}>Нет изображений</div>
                <div style={{ marginTop: 2 }}>Добавьте ссылки на изображения, чтобы товар появился в публичном каталоге.</div>
              </div>
            )}
            <button
              onClick={() => setShowImageLinks(v => !v)}
              style={{ fontSize: 12, fontWeight: 600, color: showImageLinks ? '#0b0f19' : '#667085', cursor: 'pointer', border: 'none', background: 'none', padding: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>{showImageLinks ? '−' : '+'}</span> Ссылки на изображения
            </button>
            {showImageLinks && (
              <textarea
                value={form.images}
                onChange={e => setForm({ ...form, images: e.target.value })}
                rows={4}
                placeholder={'https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg'}
                style={{ ...textarea, marginTop: 8 }}
              />
            )}
          </Section>

          {/* Публикация */}
          <Section title="Публикация">
            <div style={{ padding: 14, background: '#f8fafc', borderRadius: 16, border: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0b0f19' }}>Показывать в каталоге</div>
                  <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>Товар виден покупателям, если он активен и содержит изображение.</div>
                </div>
                <Switch checked={form.isActive} onChange={v => setForm({ ...form, isActive: v })} />
              </div>
              {activeNoImg && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#667085', background: '#f8fafc', padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }}>Товар активен, но без фото не будет показан покупателям.</div>
              )}
            </div>
          </Section>
        </div>

        {/* Sticky footer */}
        <div style={drawerFooter}>
          {error && <div style={{ padding: 8, borderRadius: 10, fontSize: 12, background: '#fef2f2', color: '#991b1b', marginBottom: 8 }}>{error}</div>}
          {success && <div style={{ padding: 6, borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#f4f7f6', border: '1px solid #dbe6e0', color: '#2d5a3f', marginBottom: 8, display: 'inline-flex' }}>Сохранено</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={secondaryBtn}>Отмена</button>
            {onDelete && (
              <button onClick={onDelete} style={{ padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#991b1b' }}>Удалить</button>
            )}
            <button onClick={onSave} disabled={loading || !form.name.trim()} style={{ padding: '10px 26px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: loading || !form.name.trim() ? 'not-allowed' : 'pointer', border: 'none', background: loading || !form.name.trim() ? '#e5e7eb' : '#0b0f19', color: loading || !form.name.trim() ? '#9ca3af' : '#fff', marginLeft: 'auto' }}>
              {loading ? 'Сохранение...' : editing ? 'Сохранить изменения' : 'Создать товар'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function ImageThumb({ url, main }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{ width: 72, height: 72, borderRadius: 14, border: main ? '2px solid #0b0f19' : '1px solid #e5e7eb', background: '#f8fafc', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {err ? <AgentIcon name="box" size={18} muted /> : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} onError={() => setErr(true)} />}
      {main && <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, fontWeight: 700, color: '#fff', background: '#0b0f19', padding: '1px 6px', borderRadius: 999 }}>Основное</div>}
    </div>
  );
}

function TextDraftPanel({ textInput, setTextInput, draft, draftForm, setDraftForm, onCreate, onConfirm, onCancel, textLoading, loading, error }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Из текста</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19', marginBottom: 6 }}>Создание товара из текста объявления</div>
      <p style={{ fontSize: 13, color: '#667085', marginBottom: 14 }}>Вставьте текст объявления — система извлечёт название, цену, категорию и другие данные.</p>
      {!draft ? (
        <>
          <textarea value={textInput} onChange={e => setTextInput(e.target.value)} rows={5} placeholder="iPhone 16 Pro, 256 ГБ, новый, цена 135000 рублей, цвет титан, самовывоз Москва." style={textarea} />
          <button onClick={onCreate} disabled={textLoading || !textInput.trim()} style={{ ...primaryBtn, marginTop: 12 }}>
            {textLoading ? 'Анализируем...' : 'Создать черновик'}
          </button>
        </>
      ) : (
        <DraftPreviewForm draftForm={draftForm} setDraftForm={setDraftForm} onConfirm={onConfirm} onCancel={onCancel} loading={loading} error={error} />
      )}
    </div>
  );
}

function DraftPreviewForm({ draftForm, setDraftForm, onConfirm, onCancel, loading, error }) {
  return (
    <div>
      <StatusBadge variant="success" size="md" style={{ marginBottom: 12 }}>Черновик создан</StatusBadge>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Название"><input value={draftForm.name} onChange={e => setDraftForm({ ...draftForm, name: e.target.value })} style={input} /></Field>
        <Field label="Описание"><textarea value={draftForm.description} onChange={e => setDraftForm({ ...draftForm, description: e.target.value })} rows={3} style={textarea} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Field label="Цена, ₽"><input type="number" value={draftForm.price} onChange={e => setDraftForm({ ...draftForm, price: e.target.value })} style={input} /></Field>
          <Field label="Старая цена, ₽"><input type="number" value={draftForm.oldPrice || ''} onChange={e => setDraftForm({ ...draftForm, oldPrice: e.target.value ? Number(e.target.value) : null })} style={input} /></Field>
          <Field label="Категория"><CustomSelect value={draftForm.category} onChange={e => setDraftForm({ ...draftForm, category: e.target.value })} options={CATEGORY_OPTIONS.filter(o => o.value)} placeholder="Выберите" /></Field>
        </div>
        <Field label="Преимущества (через ;)"><input value={draftForm.benefits} onChange={e => setDraftForm({ ...draftForm, benefits: e.target.value })} style={input} /></Field>
        <Field label="Изображения (ссылки, по одной на строку)"><textarea value={draftForm.images} onChange={e => setDraftForm({ ...draftForm, images: e.target.value })} rows={2} style={textarea} /></Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={onConfirm} disabled={loading || !draftForm.name} style={{ padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: loading || !draftForm.name ? 'not-allowed' : 'pointer', border: 'none', background: loading || !draftForm.name ? '#e5e7eb' : '#0b0f19', color: loading || !draftForm.name ? '#9ca3af' : '#fff' }}>
            {loading ? 'Создание...' : 'Создать товар'}
          </button>
          <button onClick={onCancel} style={secondaryBtn}>Отмена</button>
        </div>
        {error && <div style={{ padding: 10, borderRadius: 10, fontSize: 13, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
      </div>
    </div>
  );
}

function BulkDraftPanel({ bulkText, setBulkText, bulkDrafts, bulkSelected, setBulkSelected, setBulkDrafts, onCreate, onConfirm, bulkLoading, loading }) {
  const selectedCount = bulkDrafts.filter(d => bulkSelected[d._idx]).length;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Массовое добавление</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19', marginBottom: 6 }}>Несколько товаров из текста</div>
      <p style={{ fontSize: 13, color: '#667085', marginBottom: 14 }}>Вставьте несколько товаров. Можно перечислить их через пустую строку или нумерованным списком.</p>
      {bulkDrafts.length === 0 ? (
        <>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} placeholder={"Товар 1:\niPhone 16 Pro\nЦена 135000 рублей\nСмартфон Apple\n\nТовар 2:\nAirPods Pro 2\nЦена 26000 рублей\nНаушники Apple"} style={textarea} />
          <button onClick={onCreate} disabled={bulkLoading || !bulkText.trim()} style={{ ...primaryBtn, marginTop: 12 }}>
            {bulkLoading ? 'Анализируем...' : 'Разобрать товары'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 10 }}>Найдено черновиков: {bulkDrafts.length}</div>
          {bulkDrafts.map(d => (
            <div key={d._idx} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, marginBottom: 10, background: bulkSelected[d._idx] ? '#fff' : '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <input type="checkbox" checked={!!bulkSelected[d._idx]} onChange={e => setBulkSelected({ ...bulkSelected, [d._idx]: e.target.checked })} style={{ width: 18, height: 18 }} />
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1, color: '#0b0f19' }}>{d.name || 'Без названия'}</span>
                <span style={{ fontSize: 13, color: '#667085' }}>{hasValidPrice(d.price) ? formatPrice(d.price) : '—'}</span>
              </div>
              {bulkSelected[d._idx] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 28 }}>
                  <input value={d.name} onChange={e => { const copy = [...bulkDrafts]; copy[d._idx] = { ...copy[d._idx], name: e.target.value }; setBulkDrafts(copy); }} style={input} placeholder="Название" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="number" value={d.price} onChange={e => { const copy = [...bulkDrafts]; copy[d._idx] = { ...copy[d._idx], price: Number(e.target.value) }; setBulkDrafts(copy); }} style={input} placeholder="Цена" />
                    <CustomSelect value={d.category} onChange={e => { const copy = [...bulkDrafts]; copy[d._idx] = { ...copy[d._idx], category: e.target.value }; setBulkDrafts(copy); }} options={CATEGORY_OPTIONS.filter(o => o.value)} placeholder="Категория" />
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onConfirm} disabled={loading || selectedCount === 0} style={{ padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: loading || selectedCount === 0 ? 'not-allowed' : 'pointer', border: 'none', background: loading || selectedCount === 0 ? '#e5e7eb' : '#0b0f19', color: loading || selectedCount === 0 ? '#9ca3af' : '#fff' }}>
              {loading ? 'Создание...' : `Создать (${selectedCount})`}
            </button>
            <button onClick={() => { setBulkDrafts([]); setBulkSelected({}); setBulkText(''); }} style={secondaryBtn}>Назад</button>
          </div>
        </>
      )}
    </div>
  );
}

function CsvPanel({ csvText, setCsvText, csvRows, csvSelected, setCsvSelected, csvError, onParse, onConfirm, loading }) {
  const selectedCount = csvRows.filter(r => csvSelected[r._idx] && r._valid).length;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>CSV импорт</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0f19', marginBottom: 6 }}>Импорт товаров из CSV</div>
      <p style={{ fontSize: 13, color: '#667085', marginBottom: 14 }}>Вставьте CSV данные. Первая строка — заголовки: name, price, category, description, benefits, images, oldprice.</p>
      {csvRows.length === 0 ? (
        <>
          <div style={{ fontSize: 11, color: '#667085', marginBottom: 8, padding: 10, background: '#f8fafc', borderRadius: 10, fontFamily: 'monospace' }}>
            name,price,category,description,benefits,images,oldprice{'\n'}
            iPhone 16 Pro,135000,electronics,Смартфон Apple,256 ГБ; титан,https://example.com/iphone.jpg,150000{'\n'}
            AirPods Pro 2,26000,electronics,Наушники Apple,шумоподавление;,,
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder={"name,price,category\niPhone 16 Pro,135000,electronics"} style={{ ...textarea, fontFamily: 'monospace' }} />
          {csvError && <div style={{ marginTop: 8, padding: 8, borderRadius: 8, fontSize: 12, background: '#fef2f2', color: '#991b1b' }}>{csvError}</div>}
          <button onClick={onParse} disabled={!csvText.trim()} style={{ ...primaryBtn, marginTop: 12 }}>
            Проверить CSV
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0f19', marginBottom: 10 }}>Найдено строк: {csvRows.length}</div>
          <div style={{ overflowX: 'auto', marginBottom: 14, border: '1px solid #e5e7eb', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}><input type="checkbox" checked={csvRows.filter(r => r._valid).every(r => csvSelected[r._idx])} onChange={e => { const sel = {}; csvRows.forEach(r => { if (r._valid) sel[r._idx] = e.target.checked; }); setCsvSelected(sel); }} style={{ width: 16, height: 16 }} /></th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Название</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Цена</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Категория</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {csvRows.map(r => (
                  <tr key={r._idx} style={{ background: r._valid ? '#fff' : '#fffbeb' }}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}><input type="checkbox" checked={!!csvSelected[r._idx]} disabled={!r._valid} onChange={e => setCsvSelected({ ...csvSelected, [r._idx]: e.target.checked })} style={{ width: 16, height: 16 }} /></td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, color: '#0b0f19' }}>{r.name || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{hasValidPrice(r.price) ? formatPrice(r.price) : '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#667085' }}>{getCategoryLabel(r.category) || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{r._valid ? <span style={{ color: '#065f46' }}>OK</span> : <span style={{ color: '#991b1b' }}>{r._error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onConfirm} disabled={loading || selectedCount === 0} style={{ padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: loading || selectedCount === 0 ? 'not-allowed' : 'pointer', border: 'none', background: loading || selectedCount === 0 ? '#e5e7eb' : '#0b0f19', color: loading || selectedCount === 0 ? '#9ca3af' : '#fff' }}>
              {loading ? 'Создание...' : `Создать (${selectedCount})`}
            </button>
            <button onClick={() => { setCsvRows([]); setCsvText(''); }} style={secondaryBtn}>Назад</button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function defaultForm() {
  return { name: '', description: '', price: 0, oldPrice: '', category: '', benefits: '', images: '', isActive: true };
}

function hasImage(p) {
  return !!getProductMainImage(p);
}

function buildPayloadFromDraft(draftForm, products, currentShopId) {
  const payload = {
    name: draftForm.name,
    description: draftForm.description,
    price: Number(draftForm.price) || 0,
    category: draftForm.category,
  };
  if (draftForm.oldPrice) payload.oldPrice = Number(draftForm.oldPrice);
  if (draftForm.benefits) payload.benefits = draftForm.benefits.split(';').map(s => s.trim()).filter(Boolean);
  if (draftForm.images) payload.images = draftForm.images.split('\n').map(s => s.trim()).filter(Boolean);
  let shopId = currentShopId;
  if (!shopId && products.length > 0) shopId = products[0].shopId;
  if (shopId) payload.shopId = shopId;
  return payload;
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0b0f19' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#667085', marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, helper, children }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
      {helper && <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 4 }}>{helper}</div>}
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ width: 44, height: 24, borderRadius: 12, background: checked ? '#0b0f19' : '#e5e7eb', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 23 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }} />
    </div>
  );
}

function EmptyProducts() {
  return (
    <div style={{ textAlign: 'center', padding: 48, color: '#98a2b3', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
      <div style={{ marginBottom: 10 }}><AgentIcon name="box" size={32} muted /></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Товаров пока нет</div>
      <div style={{ fontSize: 13 }}>Нажмите «Добавить товар», чтобы создать первый товар, или используйте режимы «Из текста», «Массово» или «CSV».</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════

const primaryBtn = { padding: '10px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff' };
const secondaryBtn = { padding: '10px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' };

const searchInput = { width: '100%', height: 42, padding: '0 16px 0 40px', border: '1px solid #e5e7eb', borderRadius: 14, fontSize: 13, outline: 'none', background: '#fff', color: '#0b0f19', boxSizing: 'border-box' };
const selectStyle = { height: 42, padding: '0 14px', border: '1px solid #e5e7eb', borderRadius: 14, fontSize: 13, background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer', minWidth: 170 };
const input = { width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', color: '#0b0f19', boxSizing: 'border-box', fontFamily: 'inherit' };
const textarea = { width: '100%', padding: '11px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', color: '#0b0f19', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' };

const filterPill = active => ({
  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: active ? 600 : 500,
  cursor: 'pointer', border: active ? '1.5px solid #0b0f19' : '1px solid #e5e7eb',
  background: active ? '#0b0f19' : '#fff', color: active ? '#fff' : '#667085', transition: 'all .15s',
});

const importPill = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#667085',
};

// Row
const rowStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' };
const btnPrimarySm = { padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#0b0f19', color: '#fff', whiteSpace: 'nowrap' };
const btnSecondarySm = { padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', whiteSpace: 'nowrap' };
const btnDangerSm = { padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#991b1b', whiteSpace: 'nowrap' };

// Modal
const modalOverlay = { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(11,15,25,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalBox = { background: '#fff', borderRadius: 20, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' };
const modalPreview = { width: 48, height: 48, borderRadius: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' };

// Drawer
const drawerOverlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(11,15,25,0.35)', display: 'flex', justifyContent: 'flex-end' };
const drawerPanel = { width: '100%', maxWidth: 840, height: '100%', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' };
const drawerHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '22px 28px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 };
const drawerBody = { flex: 1, overflowY: 'auto', padding: '20px 28px' };
const drawerFooter = { padding: '16px 28px 22px', borderTop: '1px solid #f3f4f6', flexShrink: 0 };
const drawerCloseBtn = { width: 28, height: 28, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#667085', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
