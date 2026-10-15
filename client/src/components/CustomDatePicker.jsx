import { useState, useRef, useEffect, useMemo } from 'react';
import CustomSelect from './CustomSelect';
import AgentIcon from './AgentIcon';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function getToday() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

function formatDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export default function CustomDatePicker({ value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) { const d = new Date(value + 'T00:00:00'); return isNaN(d.getTime()) ? getToday() : d; }
    return getToday();
  });
  const ref = useRef(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const opts = [];
    for (let y = currentYear; y >= currentYear - 100; y--) opts.push({ value: String(y), label: String(y) });
    return opts;
  }, [currentYear]);

  const monthOptions = MONTHS.map((name, i) => ({ value: String(i + 1), label: name }));

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const today = getToday();
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const setViewMonth = newMonth => {
    const daysIn = new Date(year, newMonth + 1, 0).getDate();
    const clampedDay = Math.min(viewDate.getDate(), daysIn);
    setViewDate(new Date(year, newMonth, clampedDay));
  };

  const setViewYear = newYear => {
    const daysIn = new Date(newYear, month + 1, 0).getDate();
    const clampedDay = Math.min(viewDate.getDate(), daysIn);
    setViewDate(new Date(newYear, month, clampedDay));
  };

  const selectDay = day => {
    const d = new Date(year, month, day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange({ target: { value: iso } });
    setOpen(false);
  };

  const prevMonth = () => setViewMonth(month - 1);
  const nextMonth = () => setViewMonth(month + 1);

  const days = [];
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div className="custom-date" ref={ref} tabIndex={disabled ? -1 : 0}>
      <div
        className={`custom-date-trigger${disabled ? ' is-disabled' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span className="custom-date-label">
          {value ? formatDisplay(value) : (placeholder || '')}
        </span>
        <span className="custom-date-arrow"><AgentIcon name="calendar" size={16} muted /></span>
      </div>
      {open && (
        <div className="custom-date-menu">
          <div className="custom-date-header">
            <button className="custom-date-nav" onClick={prevMonth} type="button">‹</button>
            <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
              <CustomSelect className="custom-date-month-select" value={String(month + 1)} onChange={e => setViewMonth(parseInt(e.target.value, 10) - 1)} options={monthOptions} />
              <CustomSelect className="custom-date-year-select" value={String(year)} onChange={e => setViewYear(parseInt(e.target.value, 10))} options={yearOptions} />
            </div>
            <button className="custom-date-nav" onClick={nextMonth} type="button">›</button>
          </div>
          <div className="custom-date-days">
            {DAYS.map(d => <div key={d} className="custom-date-day-header">{d}</div>)}
          </div>
          <div className="custom-date-grid">
            {days.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} className="custom-date-day is-empty" />;
              const dateObj = new Date(year, month, d);
              const isSelected = selectedDate && sameDay(dateObj, selectedDate);
              const isToday = sameDay(dateObj, today);
              return (
                <div
                  key={d}
                  className={`custom-date-day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => selectDay(d)}
                >
                  {d}
                </div>
              );
            })}
          </div>
          {value && (
            <div className="custom-date-footer">
              <button className="custom-date-clear" onClick={() => { onChange({ target: { value: '' } }); setOpen(false); }} type="button">Очистить</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
