import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Form, message, Spin } from 'antd';
import { crmService } from '../../services/crmService';
import { postalCodeService } from '../../services/postalCodeService';

// ─────────────────────────────────────────────────────────────────
//  Constants (same lists as invoice CustomerForm.js)
// ─────────────────────────────────────────────────────────────────
const COUNTRIES = [
  'Magyarország','Németország','Ausztria','Szlovákia','Románia',
  'Horvátország','Szlovénia','Lengyelország','Csehország','Olaszország',
  'Franciaország','Spanyolország','Hollandia','Belgium','Svájc',
  'Egyesült Királyság','Írország','Dánia','Svédország','Norvégia',
  'Finnország','Észtország','Lettország','Litvánia','Portugália',
  'Görögország','Bulgária','Szerbia','Bosznia-Hercegovina',
  'Montenegró','Észak-Macedónia','Albánia','Moldova','Ukrajna',
  'Fehéroroszország','Oroszország','Törökország','Egyesült Államok','Kanada',
  'Ausztrália','Új-Zéland','Japán','Kína','India','Brazília','Argentína',
  'Mexikó','Dél-Afrika','Egyéb',
];

const PUBLIC_PLACE_CATEGORIES = [
  'ÚT','TÉR','KÖZ','SÉTÁLY','KERT','UTCA','ÚTJA','SOR','FASOR','PARK',
  'SÉTÁNY','RÉSZ','DŰLŐ','LEJTŐ','VÖLGY','HEGY','DOMB','RÉT','MEZŐ','ERDŐ',
  'VÍZ','PART','SZIGET','FOK','CSÚCS','HÁT','VÉG','SZÉL','SAROK','KÖZPONT','KÖR','KÖRÚT',
];

// ─────────────────────────────────────────────────────────────────
//  Inline styles (mirror invoice CustomerForm styled-components)
// ─────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: '100vh',
    background: '#f0f2f5',
    padding: '24px 16px',
  } as React.CSSProperties,
  container: {
    background: 'white',
    borderRadius: 8,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: 24,
    maxWidth: 640,
    margin: '0 auto',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #ecf0f1',
  } as React.CSSProperties,
  title: {
    fontSize: 24,
    fontWeight: 600,
    margin: 0,
    color: '#2c3e50',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: '24px 0 16px 0',
    color: '#34495e',
    borderBottom: '2px solid #3498db',
    paddingBottom: 8,
  } as React.CSSProperties,
  formGroup: { marginBottom: 16 } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: 4,
    fontWeight: 500,
    color: '#2c3e50',
    fontSize: 14,
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#e74c3c',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: 14,
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: 14,
    minHeight: 70,
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,
  grid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
  } as React.CSSProperties,
  errorMsg: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
    display: 'block',
  } as React.CSSProperties,
  btnGroup: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  } as React.CSSProperties,
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    background: '#3498db',
    color: 'white',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    background: '#6c757d',
    color: 'white',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  btnOrange: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    background: '#f39c12',
    color: 'white',
    transition: 'opacity 0.2s',
    height: 38,
  } as React.CSSProperties,
  taxRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  } as React.CSSProperties,
  toggleBox: {
    background: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: 8,
    padding: '16px',
    marginBottom: 20,
  } as React.CSSProperties,
  infoMsg: {
    background: '#d4edda',
    color: '#155724',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    border: '1px solid #c3e6cb',
    fontSize: 14,
  } as React.CSSProperties,
  warnMsg: {
    background: '#fff3cd',
    color: '#856404',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    border: '1px solid #ffeaa7',
    fontSize: 14,
  } as React.CSSProperties,
  errMsgBox: {
    background: '#f8d7da',
    color: '#721c24',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
    border: '1px solid #f5c6cb',
    fontSize: 14,
  } as React.CSSProperties,
};

// ─────────────────────────────────────────────────────────────────
//  Searchable select (same as invoice)
// ─────────────────────────────────────────────────────────────────
const SearchableSelect: React.FC<{
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; hasError?: boolean;
}> = ({ value, onChange, options, placeholder, hasError }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const filtered = options.filter(o => norm(o).includes(norm(search)));
  React.useEffect(() => { setSearch(value || ''); }, [value]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }}
        onFocus={e => { setOpen(true); e.target.select(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ ...s.input, ...(hasError ? s.inputError : {}) }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #ddd', borderTop: 'none',
          borderRadius: '0 0 4px 4px', maxHeight: 200, overflowY: 'auto',
          zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          {filtered.map((o, i) => (
            <div key={i} onMouseDown={() => { onChange(o); setSearch(o); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 14,
                background: o === value ? '#e3f2fd' : 'white',
                color: o === value ? '#1976d2' : undefined,
              }}
              onMouseEnter={e => { (e.target as HTMLDivElement).style.background = o === value ? '#e3f2fd' : '#f8f9fa'; }}
              onMouseLeave={e => { (e.target as HTMLDivElement).style.background = o === value ? '#e3f2fd' : 'white'; }}
            >{o}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────
type FormData = {
  vat_status: 'DOMESTIC' | 'PRIVATE_PERSON' | 'OTHER';
  name: string; short_name: string; tax_number: string;
  full_tax_number: string; vat_code: string; county_code: string;
  vat_group_id: string; vat_group_member_tax_number: string; group_tax_number: string;
  eu_tax_number: string;
  country: string; postal_code: string; city: string;
  street_name: string; street_type: string; house_number: string;
  building: string; staircase: string; floor: string; door: string; address: string;
  email: string; phone: string;
  payment_due_days: number; payment_method: string;
  is_customer: boolean; is_supplier: boolean;
};

const empty: FormData = {
  vat_status: 'DOMESTIC', name: '', short_name: '',
  tax_number: '', full_tax_number: '', vat_code: '', county_code: '',
  vat_group_id: '', vat_group_member_tax_number: '', group_tax_number: '', eu_tax_number: '',
  country: 'Magyarország', postal_code: '', city: '',
  street_name: '', street_type: '', house_number: '', building: '',
  staircase: '', floor: '', door: '', address: '',
  email: '', phone: '',
  payment_due_days: 8, payment_method: 'TRANSFER',
  is_customer: true, is_supplier: false,
};

const CompanyForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || '/crm/companies';

  const [data, setData] = useState<FormData>({ ...empty });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [viesLoading, setViesLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<{ type: 'success'|'warning'|'error'; text: string } | null>(null);
  const [bankAccounts, setBankAccounts] = useState<Array<{
    bank_name: string; account_number: string; iban: string; swift_bic: string; currency: string; is_primary: boolean;
  }>>([])
  const addBank = () => setBankAccounts(prev => [...prev, { bank_name: '', account_number: '', iban: '', swift_bic: '', currency: 'HUF', is_primary: prev.length === 0 }]);
  const removeBank = (i: number) => setBankAccounts(prev => prev.filter((_, idx) => idx !== i));
  const setBank = (i: number, field: string, val: any) => setBankAccounts(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const setPrimary = (i: number) => setBankAccounts(prev => prev.map((b, idx) => ({ ...b, is_primary: idx === i })));

  const set = (field: keyof FormData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const isHungarian = data.vat_status === 'DOMESTIC';

  const handleTaxLookup = async () => {
    const digits = data.tax_number.replace(/\D/g, '');
    if (digits.length < 8) { setLookupMsg({ type: 'warning', text: 'Kérjük adjon meg legalább 8 számjegyet!' }); return; }
    setTaxLoading(true);
    setLookupMsg(null);
    try {
      const result = await (crmService as any).lookupCompanyByNav(digits, { debug: true });
      if (result?.found) {
        setData(prev => ({
          ...prev,
          name: result.name || prev.name,
          short_name: (result as any).short_name || prev.short_name,
          tax_number: result.full_tax_number || result.tax_number || prev.tax_number,
          full_tax_number: result.full_tax_number || result.tax_number || prev.full_tax_number,
          vat_code: result.vat_code || prev.vat_code,
          county_code: result.county_code || prev.county_code,
          postal_code: result.postal_code || prev.postal_code,
          city: result.city || prev.city,
          street_name: result.street_name || prev.street_name,
          street_type: result.street_type || prev.street_type,
          house_number: result.house_number || prev.house_number,
          group_tax_number: result.group_tax_number || prev.group_tax_number,
          vat_group_id: result.vat_group_id || prev.vat_group_id,
          vat_group_member_tax_number: result.vat_group_member_tax_number || prev.vat_group_member_tax_number,
        }));
        setLookupMsg({ type: 'success', text: 'Cégadatok sikeresen betöltve a NAV-tól' });
      } else {
        setLookupMsg({ type: 'warning', text: 'Nem található cég a NAV rendszerében.' });
      }
    } catch {
      setLookupMsg({ type: 'error', text: 'Hiba a NAV lekérdezés során.' });
    } finally {
      setTaxLoading(false);
    }
  };

  const handleViesLookup = async () => {
    if (!data.eu_tax_number) { setLookupMsg({ type: 'warning', text: 'Kérjük adjon meg EU adószámot!' }); return; }
    setViesLoading(true);
    setLookupMsg(null);
    try {
      const resp = await (crmService as any).validateEuVat({ vat_number: data.eu_tax_number });
      if (resp?.valid) {
        setLookupMsg({ type: 'success', text: 'Érvényes EU adószám: ' + (resp.name || 'OK') });
        if (resp.name) set('name', resp.name);
        if (resp.address) set('address', resp.address);
      } else {
        setLookupMsg({ type: 'error', text: 'Érvénytelen EU adószám.' });
      }
    } catch {
      setLookupMsg({ type: 'error', text: 'Hiba a VIES lekérdezés során.' });
    } finally {
      setViesLoading(false);
    }
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!data.name.trim()) errs.name = 'Név megadása kötelező';
    if (isHungarian && !data.tax_number.trim()) errs.tax_number = 'Adószám megadása kötelező';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...data,
        street_number: data.house_number,
        public_place_category: data.street_type,
        bank_accounts: bankAccounts,
      };
      await crmService.createCompany(payload);
      message.success('Cég létrehozva');
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
        {/* ── Header ───────────────────────────────────────────── */}
        <div style={s.header}>
          <h1 style={s.title}>Új cég</h1>
          <div style={s.btnGroup}>
            <button style={s.btnSecondary} onClick={() => navigate(returnTo)}>
              ← Vissza
            </button>
          </div>
        </div>

        {/* ── VAT status toggle ─────────────────────────────────── */}
        <div style={s.toggleBox}>
          <div style={{ fontWeight: 500, color: '#333', fontSize: 16, marginBottom: 8 }}>Adóalanyiság</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {(['DOMESTIC','PRIVATE_PERSON','OTHER'] as const).map(v => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="vatStatus" checked={data.vat_status === v} onChange={() => set('vat_status', v)} />
                {v === 'DOMESTIC' ? 'Magyar adószámos' : v === 'PRIVATE_PERSON' ? 'Magánszemély' : 'Egyéb (EU/3. ország)'}
              </label>
            ))}
          </div>
          <div style={{ color: '#666', fontSize: 13, marginTop: 6 }}>
            {data.vat_status === 'DOMESTIC' ? 'Magyar adószámmal rendelkező adóalany – NAV lekérdezés elérhető'
              : data.vat_status === 'PRIVATE_PERSON' ? 'Magánszemély – adószám nem kötelező'
              : 'Egyéb (EU/3. ország) – egyszerűsített adatbevitel'}
          </div>
        </div>

        {/* ── Lookup messages ───────────────────────────────────── */}
        {lookupMsg && (
          <div style={lookupMsg.type === 'success' ? s.infoMsg : lookupMsg.type === 'warning' ? s.warnMsg : s.errMsgBox}>
            {lookupMsg.text}
          </div>
        )}

        {/* ── Cég neve ──────────────────────────────────────────── */}
        <div style={s.formGroup}>
          <label style={s.label}>Cég neve *</label>
          <input style={{ ...s.input, ...(errors.name ? s.inputError : {}) }}
            value={data.name} onChange={e => set('name', e.target.value)} placeholder="Hivatalos cégnév" />
          {errors.name && <span style={s.errorMsg}>{errors.name}</span>}
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Rövid név</label>
          <input style={s.input} value={data.short_name} onChange={e => set('short_name', e.target.value)} placeholder="Rövid név (opcionális)" />
        </div>

        {/* ── Fizetési adatok ───────────────────────────────────── */}
        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>Fizetési mód</label>
            <select style={s.select} value={data.payment_method} onChange={e => set('payment_method', e.target.value)}>
              <option value="CASH">Készpénz</option>
              <option value="TRANSFER">Átutalás</option>
            </select>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Fizetési határidő (nap)</label>
            <input style={s.input} type="number" min={0}
              value={data.payment_due_days}
              disabled={data.payment_method === 'CASH'}
              onChange={e => set('payment_due_days', Number(e.target.value))} />
          </div>
        </div>

        <div style={{ ...s.formGroup, display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={data.is_customer} onChange={e => set('is_customer', e.target.checked)} />
            <span>Vevő</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={data.is_supplier} onChange={e => set('is_supplier', e.target.checked)} />
            <span>Beszállító</span>
          </label>
        </div>

        {/* ── Adószám szekció ───────────────────────────────────── */}
        <h3 style={s.sectionTitle}>Adószám adatok</h3>

        {isHungarian && (
          <>
            <div style={s.formGroup}>
              <label style={s.label}>Adószám *</label>
              <div style={s.taxRow}>
                <input style={{ ...s.input, ...(errors.tax_number ? s.inputError : {}) }}
                  value={data.tax_number} maxLength={11}
                  onChange={e => set('tax_number', e.target.value)}
                  placeholder="12345678 vagy 12345678-1-42" />
                <button style={{ ...s.btnOrange, opacity: taxLoading ? 0.6 : 1 }}
                  onClick={handleTaxLookup} disabled={taxLoading} type="button">
                  {taxLoading ? <Spin size="small" /> : '🔍'} NAV lekérdezés
                </button>
              </div>
              {errors.tax_number && <span style={s.errorMsg}>{errors.tax_number}</span>}
            </div>

            <div style={s.grid2}>
              <div style={s.formGroup}>
                <label style={s.label}>Teljes adószám</label>
                <input style={{ ...s.input, background: '#f9fafb', color: '#6b7280' }} readOnly value={data.full_tax_number} placeholder="12345678-1-42" />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>EU adószám</label>
                <div style={s.taxRow}>
                  <input style={s.input} value={data.eu_tax_number}
                    onChange={e => set('eu_tax_number', e.target.value)} placeholder="HU12345678..." />
                  <button style={{ ...s.btnOrange, opacity: viesLoading ? 0.6 : 1 }}
                    onClick={handleViesLookup} disabled={viesLoading} type="button">
                    {viesLoading ? <Spin size="small" /> : 'VIES'}
                  </button>
                </div>
              </div>
            </div>

            <div style={s.grid2}>
              <div style={s.formGroup}>
                <label style={s.label}>Csoport adószám</label>
                <input style={s.input} value={data.group_tax_number}
                  onChange={e => set('group_tax_number', e.target.value)} placeholder="12345678-5-42" />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Csoport tag adószáma</label>
                <input style={{ ...s.input, background: '#f9fafb', color: '#6b7280' }} readOnly
                  value={data.vat_group_member_tax_number} />
              </div>
            </div>
          </>
        )}

        {!isHungarian && (
          <>
            <div style={s.formGroup}>
              <label style={s.label}>Adószám (opcionális)</label>
              <input style={s.input} value={data.tax_number} onChange={e => set('tax_number', e.target.value)} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>EU adószám – VIES ellenőrzés</label>
              <div style={s.taxRow}>
                <input style={s.input} value={data.eu_tax_number}
                  onChange={e => set('eu_tax_number', e.target.value)} placeholder="pl. HU12345678" />
                <button style={{ ...s.btnOrange, opacity: viesLoading ? 0.6 : 1 }}
                  onClick={handleViesLookup} disabled={viesLoading} type="button">
                  {viesLoading ? <Spin size="small" /> : 'VIES'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Cím szekció ───────────────────────────────────────── */}
        <h3 style={s.sectionTitle}>Cím adatok</h3>

        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>Irányítószám</label>
            <input style={s.input} value={data.postal_code} maxLength={10}
              onChange={e => {
                set('postal_code', e.target.value);
                if (e.target.value.length === 4) {
                  const city = postalCodeService.getCityByPostalCode(e.target.value);
                  if (city) set('city', city);
                }
              }} />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Város</label>
            <input style={s.input} value={data.city} onChange={e => set('city', e.target.value)} />
          </div>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Ország</label>
          <SearchableSelect value={data.country} onChange={v => set('country', v)}
            options={COUNTRIES} placeholder="Válasszon országot..." />
        </div>

        {(!data.country || data.country === 'Magyarország') ? (
          <>
            <div style={s.grid2}>
              <div style={s.formGroup}>
                <label style={s.label}>Utca neve</label>
                <input style={s.input} value={data.street_name} onChange={e => set('street_name', e.target.value)} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Közterület jellege</label>
                <SearchableSelect value={data.street_type} onChange={v => set('street_type', v)}
                  options={PUBLIC_PLACE_CATEGORIES} placeholder="pl. ÚT" />
              </div>
            </div>

            <div style={s.grid2}>
              <div style={s.formGroup}>
                <label style={s.label}>Házszám</label>
                <input style={s.input} value={data.house_number} onChange={e => set('house_number', e.target.value)} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Épület</label>
                <input style={s.input} value={data.building} onChange={e => set('building', e.target.value)} />
              </div>
            </div>

            <div style={s.grid3}>
              <div style={s.formGroup}>
                <label style={s.label}>Lépcsőház</label>
                <input style={s.input} value={data.staircase} onChange={e => set('staircase', e.target.value)} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Emelet</label>
                <input style={s.input} value={data.floor} onChange={e => set('floor', e.target.value)} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Ajtó</label>
                <input style={s.input} value={data.door} onChange={e => set('door', e.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <div style={s.formGroup}>
            <label style={s.label}>Cím (utca, házszám)</label>
            <textarea style={s.textarea} value={data.address} onChange={e => set('address', e.target.value)}
              placeholder="Utca, házszám, emelet, ajtó..." />
          </div>
        )}

        {/* ── Kapcsolattartás ───────────────────────────────────── */}
        <h3 style={s.sectionTitle}>Kapcsolattartás</h3>
        <div style={s.grid2}>
          <div style={s.formGroup}>
            <label style={s.label}>E-mail</label>
            <input style={s.input} type="email" value={data.email}
              onChange={e => set('email', e.target.value)} placeholder="pelda@ceg.hu" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Telefon</label>
            <input style={s.input} value={data.phone}
              onChange={e => set('phone', e.target.value)} placeholder="+36..." />
          </div>
        </div>

        {/* ── Bankszámlák ───────────────────────────────────────── */}
        <div style={{
          marginTop: 24,
          background: 'white',
          borderRadius: 8,
          border: '1px solid #ecf0f1',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #ecf0f1' }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#2c3e50' }}>Bankszámlák</span>
            <button type="button" style={s.btnPrimary} onClick={addBank}>+ Új bankszámla</button>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bankAccounts.length === 0 && (
              <div style={{ color: '#7f8c8d', fontSize: 14 }}>Nincs rögzített bankszámla.</div>
            )}
            {bankAccounts.map((b, idx) => (
              <div key={idx} style={{
                border: b.is_primary ? '1px solid #3498db' : '1px solid #e9ecef',
                borderRadius: 8, padding: 12,
                background: b.is_primary ? '#f7fbff' : '#fdfdfd',
                boxShadow: b.is_primary ? '0 0 0 2px rgba(52,152,219,0.12)' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                    <input type="radio" name="primaryBank" checked={b.is_primary} onChange={() => setPrimary(idx)} />
                    elsődleges
                    {b.is_primary && <span style={{ background: '#3498db', color: 'white', borderRadius: 10, padding: '2px 8px', fontSize: 12, marginLeft: 4 }}>Elsődleges</span>}
                  </label>
                  <button type="button" onClick={() => removeBank(idx)}
                    style={{ ...s.btnPrimary, background: '#e74c3c', padding: '4px 10px', fontSize: 13 }}>
                    🗑 Törlés
                  </button>
                </div>
                <div style={s.grid2}>
                  <div style={s.formGroup}>
                    <label style={s.label}>Bank neve</label>
                    <input style={s.input} value={b.bank_name} placeholder="Bank neve"
                      onChange={e => setBank(idx, 'bank_name', e.target.value)} />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Számlaszám</label>
                    <input style={s.input} value={b.account_number} placeholder="12345678-12345678-12345678"
                      onChange={e => setBank(idx, 'account_number', e.target.value)} />
                  </div>
                </div>
                <div style={s.grid2}>
                  <div style={s.formGroup}>
                    <label style={s.label}>IBAN</label>
                    <input style={s.input} value={b.iban} placeholder="HU..."
                      onChange={e => setBank(idx, 'iban', e.target.value)} />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>SWIFT/BIC</label>
                    <input style={s.input} value={b.swift_bic} placeholder="SWIFT..."
                      onChange={e => setBank(idx, 'swift_bic', e.target.value)} />
                  </div>
                </div>
                <div style={{ maxWidth: 180 }}>
                  <label style={s.label}>Deviza</label>
                  <select style={s.select} value={b.currency} onChange={e => setBank(idx, 'currency', e.target.value)}>
                    <option value="HUF">HUF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Save button ───────────────────────────────────────── */}
        <div style={{ ...s.btnGroup, justifyContent: 'flex-end', marginTop: 24 }}>
          <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? <Spin size="small" /> : '💾'} Mentés
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyForm;
