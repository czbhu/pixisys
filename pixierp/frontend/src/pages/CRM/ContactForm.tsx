import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, message } from 'antd';
import { crmService } from '../../services/crmService';

// ─── Styles (mirror invoice ContactForm) ─────────────────────────
const s = {
  page: { minHeight: '100vh', background: '#f0f2f5', padding: '24px 16px' } as React.CSSProperties,
  container: {
    background: 'white', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: 24, maxWidth: 640, margin: '0 auto',
  } as React.CSSProperties,
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #ecf0f1',
  } as React.CSSProperties,
  title: { fontSize: 24, fontWeight: 600, margin: 0, color: '#2c3e50' } as React.CSSProperties,
  btnGroup: { display: 'flex', gap: 12, alignItems: 'center' } as React.CSSProperties,
  btnPrimary: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
    background: '#3498db', color: 'white', border: 'none', borderRadius: 6,
    fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
    background: '#95a5a6', color: 'white', border: 'none', borderRadius: 6,
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  formGroup: { marginBottom: 16 } as React.CSSProperties,
  label: { display: 'block', marginBottom: 6, fontWeight: 500, color: '#34495e', fontSize: 14 } as React.CSSProperties,
  input: {
    width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  } as React.CSSProperties,
  inputErr: { borderColor: '#e74c3c' } as React.CSSProperties,
  select: {
    width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 14, background: 'white', cursor: 'pointer', boxSizing: 'border-box', outline: 'none',
  } as React.CSSProperties,
  textarea: {
    width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 14, minHeight: 80, resize: 'vertical' as const, outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 } as React.CSSProperties,
  errMsg: { color: '#e74c3c', fontSize: 12, marginTop: 4, display: 'block' } as React.CSSProperties,
  checkRow: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
    padding: 16, background: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef',
  } as React.CSSProperties,
  checkLabel: { fontSize: 14, color: '#34495e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 } as React.CSSProperties,
};

// ─── Searchable company select ────────────────────────────────────
type CompanyOption = { id: number | string; name: string; tax_number?: string; email?: string };

const CompanySelect: React.FC<{
  value: string | number | null;
  onChange: (id: number | string | null) => void;
  options: CompanyOption[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = options.filter(o =>
    norm(`${o.name} ${o.tax_number || ''} ${o.email || ''}`).includes(norm(search))
  );
  useEffect(() => {
    if (value) {
      const found = options.find(o => String(o.id) === String(value));
      if (found) setSearch(found.name);
    } else {
      setSearch('');
    }
  }, [value, options]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
        onFocus={e => { setOpen(true); e.target.select(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        style={s.input}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
          border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 6px 6px',
          maxHeight: 200, overflowY: 'auto', zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          {filtered.map(o => (
            <div
              key={o.id}
              onMouseDown={() => { onChange(o.id); setSearch(o.name); setOpen(false); }}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8f9fa',
                background: String(o.id) === String(value) ? '#e3f2fd' : 'white',
              }}
            >
              <div style={{ fontWeight: 500, color: '#2c3e50' }}>{o.name}</div>
              {(o.tax_number || o.email) && (
                <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2 }}>
                  {o.tax_number && `Adószám: ${o.tax_number}`}
                  {o.email && ` • ${o.email}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main form ────────────────────────────────────────────────────
type Errors = Partial<Record<string, string>>;

const ContactForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || '/crm/contacts';
  const preCompanyId = searchParams.get('company_id') || null;

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [isReceipt, setIsReceipt] = useState(false);
  const [companyId, setCompanyId] = useState<string | number | null>(preCompanyId);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [contactType, setContactType] = useState('primary');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [fax, setFax] = useState('');
  const [notes, setNotes] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    crmService.getCompanies({ page_size: 5000 })
      .then((res: any) => setCompanies(Array.isArray(res) ? res : (res?.results || [])))
      .catch(() => {});
  }, []);

  const validate = () => {
    const e: Errors = {};
    if (!firstName.trim()) e.first_name = 'Keresztnév megadása kötelező';
    if (!lastName.trim()) e.last_name = 'Vezetéknév megadása kötelező';
    if (!isReceipt && !companyId) e.company = 'Ügyfél kiválasztása kötelező';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const selectedCompany = companyId ? companies.find(c => String(c.id) === String(companyId)) : null;
      const pixId = (selectedCompany as any)?.external_id ?? companyId ?? null;
      const payload: any = {
        first_name: firstName,
        last_name: lastName,
        email, phone, mobile, fax, notes,
        is_primary: isPrimary, is_active: isActive,
        is_receipt: isReceipt,
        contact_type: isReceipt ? 'primary' : contactType,
        position: isReceipt ? '' : position,
        department: isReceipt ? '' : department,
        company: isReceipt ? null : pixId,
        customer: isReceipt ? null : pixId,
      };
      await crmService.createContact(payload);
      message.success('Kapcsolattartó létrehozva');
      navigate(returnTo);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Hiba történt a mentés során');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>Új kapcsolattartó</h1>
          <div style={s.btnGroup}>
            <button style={s.btnSecondary} onClick={() => navigate(returnTo)}>← Vissza</button>
            <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
              {saving ? <Spin size="small" /> : '💾'} Létrehozás
            </button>
          </div>
        </div>

        {/* Nyugtás toggle */}
        <div style={s.checkRow}>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={isReceipt} onChange={e => setIsReceipt(e.target.checked)}
              style={{ width: 16, height: 16 }} />
            Nyugtás (Magánszemély / Nincs céghez rendelve)
          </label>
        </div>

        {/* Cég (only when not receipt) */}
        {!isReceipt && (
          <div style={s.formGroup}>
            <label style={s.label}>Ügyfél *</label>
            <CompanySelect
              value={companyId} onChange={setCompanyId}
              options={companies} placeholder="Válasszon céget..."
            />
            {errors.company && <span style={s.errMsg}>{errors.company}</span>}
          </div>
        )}

        {/* Nevek */}
        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>Keresztnév *</label>
            <input style={{ ...s.input, ...(errors.first_name ? s.inputErr : {}) }}
              value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Keresztnév" />
            {errors.first_name && <span style={s.errMsg}>{errors.first_name}</span>}
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Vezetéknév *</label>
            <input style={{ ...s.input, ...(errors.last_name ? s.inputErr : {}) }}
              value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Vezetéknév" />
            {errors.last_name && <span style={s.errMsg}>{errors.last_name}</span>}
          </div>
        </div>

        {/* Pozíció / osztály / típus (only when not receipt) */}
        {!isReceipt && (
          <>
            <div style={s.grid2}>
              <div style={s.formGroup}>
                <label style={s.label}>Pozíció</label>
                <input style={s.input} value={position} onChange={e => setPosition(e.target.value)} placeholder="Pozíció" />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Osztály</label>
                <input style={s.input} value={department} onChange={e => setDepartment(e.target.value)} placeholder="Osztály" />
              </div>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Kapcsolattartó típusa</label>
              <select style={s.select} value={contactType} onChange={e => setContactType(e.target.value)}>
                <option value="primary">Elsődleges</option>
                <option value="billing">Számlázási</option>
                <option value="technical">Technikai</option>
                <option value="sales">Értékesítési</option>
                <option value="support">Támogatási</option>
                <option value="other">Egyéb</option>
              </select>
            </div>
          </>
        )}

        {/* Elérhetőségek */}
        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>E-mail</label>
            <input style={s.input} type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="e-mail@example.com" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Telefon</label>
            <input style={s.input} value={phone}
              onChange={e => setPhone(e.target.value)} placeholder="+36 1 234 5678" />
          </div>
        </div>
        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>Mobil</label>
            <input style={s.input} value={mobile}
              onChange={e => setMobile(e.target.value)} placeholder="+36 20 123 4567" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Fax</label>
            <input style={s.input} value={fax}
              onChange={e => setFax(e.target.value)} placeholder="+36 1 234 5679" />
          </div>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Megjegyzések</label>
          <textarea style={s.textarea} value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="További megjegyzések..." />
        </div>

        {/* Checkboxok */}
        <div style={{ display: 'flex', gap: 24 }}>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)}
              style={{ width: 16, height: 16 }} />
            Elsődleges kapcsolattartó
          </label>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16 }} />
            Aktív
          </label>
        </div>

        {/* Bottom save */}
        <div style={{ ...s.btnGroup, justifyContent: 'flex-end', marginTop: 24 }}>
          <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? <Spin size="small" /> : '💾'} Létrehozás
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactForm;
