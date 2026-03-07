import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Save, Trash2, X, Plus, Search, ExternalLink, FileText, Upload, MessageSquare, ArrowLeft } from 'lucide-react';
import { incomingProformaAPI } from '../services/api';

/* ══════════════════════════════════════════════════════════════════════════════
   Styled components — mirror of InvoiceForm
══════════════════════════════════════════════════════════════════════════════ */
const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 24px;
  margin-left: 20px;
  @media (max-width: 768px) { padding: 12px; margin-left: 0; padding-bottom: 92px; }
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ecf0f1;
  @media (max-width: 768px) { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 16px; }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  @media (max-width: 768px) { width: 100%; flex-direction: column; align-items: stretch; gap: 8px; }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  @media (max-width: 768px) { width: 100%; flex-wrap: wrap; gap: 8px; > * { flex: 1 1 140px; justify-content: center; } }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background-color: ${p => {
    if (p.variant === 'primary') return '#3498db';
    if (p.variant === 'success') return '#27ae60';
    if (p.variant === 'danger')  return '#e74c3c';
    return '#6c757d';
  }};
  color: white;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const FormSection = styled.div`
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #2c3e50;
`;

const FormGroup = styled.div`margin-bottom: 16px;`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #2c3e50;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52,152,219,0.25); }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52,152,219,0.25); }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52,152,219,0.25); }
`;

const SummarySection = styled.div`
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-top: 24px;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #ddd;
  font-size: 14px;
  &:last-child { border-bottom: none; font-weight: 600; font-size: 16px; color: #2c3e50; }
`;

const VatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  th, td { border-bottom: 1px solid #ecf0f1; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #f1f3f5; font-weight: 600; color: #2c3e50; }
  tbody tr:hover td { background: #f8f9fa; }
`;

const IconGhostButton = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border: 1px solid #e1e5e8; border-radius: 6px; background: #fff; color: #6c757d;
  cursor: pointer;
  &:hover { background: #f8f9fa; color: #2c3e50; }
`;

const DeleteButton = styled.button`
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;
  &:hover { background: #c0392b; }
`;

const StatusBadge = styled.span`
  display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  ${p => p.$v === 'paid'     ? 'background:#bbf7d0;color:#166534;' : ''}
  ${p => p.$v === 'unpaid'   ? 'background:#fde8d8;color:#9a3412;' : ''}
  ${p => p.$v === 'invoiced' ? 'background:#bae6fd;color:#0c4a6e;' : ''}
`;

const SuggestTr = styled.tr`
  cursor: pointer;
  &:hover td { background: #eff6ff; }
`;

const InfoBox = styled.div`
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 12px;
`;

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS     = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Kártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };

function fmt(v, dec = 0) {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString('hu-HU', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ══════════════════════════════════════════════════════════════════════════════
   Kapcsolódó számlák szekció
══════════════════════════════════════════════════════════════════════════════ */
function InvoiceLinkSection({ proforma, companyId, onRefresh }) {
  const [showAdd, setShowAdd]       = useState(false);
  const [searchTax, setSearchTax]   = useState(proforma.supplier_tax_number || '');
  const [searchNum, setSearchNum]   = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [saving, setSaving]         = useState(false);

  const gross     = parseFloat(proforma.gross_amount || 0);
  const allocated = parseFloat(proforma.allocated_amount || 0);
  const remaining = parseFloat(proforma.remaining_amount || 0);
  const covered   = proforma.is_fully_covered;
  const links     = proforma.invoice_links || [];

  const doSearch = async () => {
    setLoadingSugg(true);
    try {
      const res = await incomingProformaAPI.suggestInvoices(companyId, searchTax, searchNum);
      setSuggestions(res.data?.suggestions || res.data || []);
    } catch { toast.error('Keresési hiba'); }
    finally { setLoadingSugg(false); }
  };

  const selectRow = inv => {
    setSelected(inv);
    const def = Math.min(remaining > 0 ? remaining : gross, parseFloat(inv.gross_amount || 0));
    setAllocAmount(String(def > 0 ? def : ''));
  };

  const addLink = async () => {
    if (!selected) { toast.error('Válassz számlát'); return; }
    setSaving(true);
    try {
      await incomingProformaAPI.addInvoiceLink(companyId, {
        proforma_id: proforma.id,
        invoice_number: selected.invoice_number,
        supplier_tax_number: selected.supplier_tax_number || searchTax,
        supplier_name: selected.supplier_name,
        allocated_amount: allocAmount,
        currency: proforma.currency,
      });
      toast.success('Kapcsolódó számla hozzáadva');
      setShowAdd(false); setSelected(null); setSuggestions([]); setSearchNum('');
      onRefresh();
    } catch (e) { toast.error(e?.response?.data?.error || 'Hozzáadási hiba'); }
    finally { setSaving(false); }
  };

  const removeLink = async linkId => {
    if (!window.confirm('Eltávolítod a kapcsolódó számlát?')) return;
    try {
      await incomingProformaAPI.removeInvoiceLink(companyId, { link_id: linkId, proforma_id: proforma.id });
      toast.success('Kapcsolat eltávolítva');
      onRefresh();
    } catch (e) { toast.error(e?.response?.data?.error || 'Hiba'); }
  };

  return (
    <>
      {/* összeg info */}
      {gross > 0 && (
        <InfoBox>
          <span style={{ marginRight: 24 }}><strong>Bruttó:</strong> {fmt(gross, 0)} {proforma.currency}</span>
          <span style={{ marginRight: 24 }}><strong>Allokált:</strong> {fmt(allocated, 0)} {proforma.currency}</span>
          <span style={{ color: remaining > 0 ? '#b42318' : '#1e824c', fontWeight: 700 }}>
            <strong>Maradék:</strong> {fmt(remaining, 0)} {proforma.currency}
          </span>
          {covered && <span style={{ marginLeft: 16 }}><StatusBadge $v="invoiced">Teljesítve</StatusBadge></span>}
        </InfoBox>
      )}

      {/* táblázat */}
      <VatTable>
        <thead>
          <tr>
            <th>Számlaszám</th>
            <th>Szállító</th>
            <th style={{ textAlign: 'right' }}>Allokált összeg</th>
            <th>Deviza</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {links.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#7f8c8d', padding: 16 }}>
                Nincs kapcsolódó számla rögzítve
              </td>
            </tr>
          ) : links.map(lnk => (
            <tr key={lnk.id}>
              <td>
                <a
                  href={`/incoming-invoices/open?company_id=${encodeURIComponent(companyId)}&invoice_number=${encodeURIComponent(lnk.invoice_number)}&supplier_tax_number=${encodeURIComponent(lnk.supplier_tax_number || '')}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3498db', fontWeight: 600 }}
                >
                  {lnk.invoice_number}<ExternalLink size={11} />
                </a>
              </td>
              <td>{lnk.supplier_name || lnk.supplier_tax_number || '—'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(lnk.allocated_amount, 0)}</td>
              <td>{lnk.currency}</td>
              <td>
                <DeleteButton onClick={() => removeLink(lnk.id)} title="Eltávolítás">
                  <Trash2 size={13} />
                </DeleteButton>
              </td>
            </tr>
          ))}
        </tbody>
      </VatTable>

      {/* hozzáadás panel */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
        >
          <Plus size={14} /> Számla hozzáadása
        </button>
      ) : (
        <div style={{ marginTop: 12, border: '1px solid #ddd', borderRadius: 6, padding: 16, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div>
              <Label>Adószám</Label>
              <Input value={searchTax} onChange={e => setSearchTax(e.target.value)} style={{ width: 160 }} placeholder="Adószám" />
            </div>
            <div>
              <Label>Számlaszám</Label>
              <Input value={searchNum} onChange={e => setSearchNum(e.target.value)} style={{ width: 180 }} placeholder="Keresés…" />
            </div>
            <Button variant="secondary" onClick={doSearch} disabled={loadingSugg} style={{ alignSelf: 'flex-end' }}>
              <Search size={14} />{loadingSugg ? 'Keresés…' : 'Keresés'}
            </Button>
            <Button variant="secondary" onClick={() => { setShowAdd(false); setSelected(null); setSuggestions([]); }} style={{ alignSelf: 'flex-end' }}>
              <X size={14} /> Mégse
            </Button>
          </div>

          {suggestions.length > 0 && (
            <VatTable style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>Számlaszám</th>
                  <th>Szállító</th>
                  <th>Dátum</th>
                  <th style={{ textAlign: 'right' }}>Bruttó</th>
                  <th>Deviza</th>
                  <th>Státusz</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(inv => (
                  <SuggestTr
                    key={inv.invoice_number || inv.id}
                    onClick={() => selectRow(inv)}
                    style={selected?.invoice_number === inv.invoice_number ? { background: '#dbeafe' } : {}}
                  >
                    <td>{inv.invoice_number}</td>
                    <td>{inv.supplier_name || inv.supplier || '—'}</td>
                    <td>{inv.issue_date || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(inv.gross_amount, 0)}</td>
                    <td>{inv.currency}</td>
                    <td>{inv.payment_status || inv.status || '—'}</td>
                  </SuggestTr>
                ))}
              </tbody>
            </VatTable>
          )}

          {suggestions.length === 0 && !loadingSugg && (
            <div style={{ color: '#7f8c8d', fontSize: 13, marginBottom: 12 }}>
              Keress adószám vagy számlaszám alapján
            </div>
          )}

          {selected && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
                  Kiválasztva: <strong>{selected.invoice_number}</strong>
                </div>
                <Label>Allokált összeg ({proforma.currency})</Label>
                <Input type="number" value={allocAmount} onChange={e => setAllocAmount(e.target.value)} style={{ width: 160 }} />
              </div>
              {remaining > 0 && parseFloat(allocAmount) > remaining && (
                <div style={{ color: '#d97706', fontSize: 13, fontWeight: 700 }}>
                  ⚠ Túlallokálás: +{fmt(parseFloat(allocAmount) - remaining, 0)}
                </div>
              )}
              <Button variant="success" onClick={addLink} disabled={saving} style={{ alignSelf: 'flex-end' }}>
                {saving ? 'Hozzáadás…' : 'Hozzáadás'}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Feltöltött fájlok szekció
══════════════════════════════════════════════════════════════════════════════ */
function DocumentSection({ proforma, companyId, onRefresh }) {
  const fileInputRef    = useRef(null);
  const [uploading, setUploading]   = useState(false);
  const [editComment, setEditComment] = useState(null);
  const [commentText, setCommentText] = useState('');
  const docs = proforma.documents || [];

  const upload = async file => {
    setUploading(true);
    try {
      await incomingProformaAPI.uploadDocument(companyId, proforma.id, file);
      toast.success('Fájl feltöltve');
      onRefresh();
    } catch { toast.error('Feltöltési hiba'); }
    finally { setUploading(false); }
  };

  const deleteDoc = async docId => {
    if (!window.confirm('Törlöd ezt a fájlt?')) return;
    try {
      await incomingProformaAPI.deleteDocument(companyId, { document_id: docId, proforma_id: proforma.id });
      toast.success('Fájl törölve'); onRefresh();
    } catch { toast.error('Törlési hiba'); }
  };

  const saveComment = async docId => {
    try {
      await incomingProformaAPI.setDocumentComment(companyId, { document_id: docId, comment: commentText, proforma_id: proforma.id });
      toast.success('Megjegyzés mentve'); setEditComment(null); onRefresh();
    } catch { toast.error('Hiba'); }
  };

  return (
    <>
      <VatTable>
        <thead>
          <tr>
            <th>Fájlnév</th>
            <th>Méret</th>
            <th>Megjegyzés</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: '#7f8c8d', padding: 16 }}>
                Nincs feltöltött fájl
              </td>
            </tr>
          ) : docs.map(doc => (
            <tr key={doc.id}>
              <td>
                {doc.file_url ? (
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#3498db' }}>
                    <FileText size={13} />{doc.original_name || 'fájl'}
                  </a>
                ) : (doc.original_name || 'fájl')}
              </td>
              <td style={{ color: '#7f8c8d' }}>{doc.size ? `${Math.round(doc.size / 1024)} KB` : '—'}</td>
              <td>
                {editComment === doc.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveComment(doc.id); if (e.key === 'Escape') setEditComment(null); }}
                    />
                    <button onClick={() => saveComment(doc.id)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd', cursor: 'pointer', background:'#fff' }}>OK</button>
                    <button onClick={() => setEditComment(null)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd', cursor: 'pointer', background:'#fff' }}>✕</button>
                  </div>
                ) : (
                  <span
                    style={{ cursor: 'pointer', color: doc.comment ? '#374151' : '#9ca3af', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => { setEditComment(doc.id); setCommentText(doc.comment || ''); }}
                  >
                    <MessageSquare size={12} />{doc.comment || 'Megjegyzés…'}
                  </span>
                )}
              </td>
              <td>
                <DeleteButton onClick={() => deleteDoc(doc.id)} title="Törlés"><Trash2 size={13} /></DeleteButton>
              </td>
            </tr>
          ))}
        </tbody>
      </VatTable>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        <Upload size={14} />{uploading ? 'Feltöltés…' : 'Fájl feltöltése'}
      </button>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Főkomponens
══════════════════════════════════════════════════════════════════════════════ */
export default function IncomingProformaOpen() {
  const navigate          = useNavigate();
  const [params]          = useSearchParams();
  const companyId         = params.get('company_id') || localStorage.getItem('selectedCompanyId') || '';
  const proformaId        = params.get('proforma_id') || '';
  const isNew             = !proformaId;

  const ocrInputRef       = useRef(null);
  const [proforma, setProforma]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [parsing, setParsing]     = useState(false);

  const [form, setForm] = useState({
    proforma_number: '', supplier_tax_number: '', supplier_name: '',
    issue_date:  '', due_date: '', delivery_date: '',
    payment_method: 'TRANSFER', currency: 'HUF', exchange_rate: '1',
    net_amount: '', vat_amount: '', gross_amount: '', comment: '',
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* load */
  const loadProforma = useCallback(async () => {
    if (!proformaId || !companyId) return;
    setLoading(true);
    try {
      const res = await incomingProformaAPI.get(companyId, proformaId);
      const d = res.data;
      setProforma(d);
      setForm({
        proforma_number:    d.proforma_number    || '',
        supplier_tax_number:d.supplier_tax_number || '',
        supplier_name:      d.supplier_name       || '',
        issue_date:         d.issue_date          || '',
        due_date:           d.due_date            || '',
        delivery_date:      d.delivery_date       || '',
        payment_method:     (d.payment_method     || 'TRANSFER').toUpperCase(),
        currency:           (d.currency           || 'HUF').toUpperCase(),
        exchange_rate:      d.exchange_rate        != null ? String(d.exchange_rate) : '1',
        net_amount:         d.net_amount           || '',
        vat_amount:         d.vat_amount           || '',
        gross_amount:       d.gross_amount         || '',
        comment:            d.comment             || '',
      });
    } catch { toast.error('Betöltési hiba'); }
    finally { setLoading(false); }
  }, [proformaId, companyId]);

  useEffect(() => { loadProforma(); }, [loadProforma]);

  /* OCR */
  const handleOCR = async file => {
    if (!file) return;
    setParsing(true);
    try {
      const res = await incomingProformaAPI.parseDocument(companyId, file);
      const f   = res.data?.fields || {};
      setForm(prev => ({
        ...prev,
        proforma_number:     f.invoice_number     || prev.proforma_number,
        supplier_tax_number: f.supplier_tax_number || prev.supplier_tax_number,
        supplier_name:       f.supplier_name       || prev.supplier_name,
        issue_date:          f.issue_date          || prev.issue_date,
        due_date:            f.due_date            || prev.due_date,
        net_amount:          f.net_amount   != null ? String(f.net_amount)   : prev.net_amount,
        vat_amount:          f.vat_amount   != null ? String(f.vat_amount)   : prev.vat_amount,
        gross_amount:        f.gross_amount != null ? String(f.gross_amount) : prev.gross_amount,
        currency:            f.currency     || prev.currency,
        payment_method:      f.payment_method || prev.payment_method,
      }));
      toast.success('OCR feldolgozva');
    } catch { toast.error('OCR hiba'); }
    finally { setParsing(false); }
  };

  /* save */
  const handleSave = async () => {
    if (!form.proforma_number.trim()) { toast.error('Díjbekérő száma kötelező'); return; }
    setSaving(true);
    try {
      const payload = { company_id: companyId, ...form };
      if (isNew) {
        const res = await incomingProformaAPI.create(payload);
        toast.success('Díjbekérő létrehozva');
        navigate(`/incoming-proformas/open?company_id=${encodeURIComponent(companyId)}&proforma_id=${encodeURIComponent(res.data.id)}`, { replace: true });
      } else {
        await incomingProformaAPI.update({ ...payload, id: proformaId });
        toast.success('Mentve');
        loadProforma();
      }
    } catch (e) { toast.error(e?.response?.data?.error || 'Mentési hiba'); }
    finally { setSaving(false); }
  };

  /* delete */
  const handleDelete = async () => {
    if (!window.confirm(`Törlöd a(z) ${form.proforma_number} díjbekérőt?`)) return;
    try {
      await incomingProformaAPI.delete(companyId, proformaId);
      toast.success('Törölve');
      navigate('/incoming-proformas');
    } catch (e) { toast.error(e?.response?.data?.error || 'Törlési hiba'); }
  };

  /* status helpers */
  const setStatus = async status => {
    try {
      await incomingProformaAPI.setStatus(companyId, { id: proformaId, status });
      toast.success('Státusz frissítve');
      loadProforma();
    } catch (e) { toast.error(e?.response?.data?.error || 'Hiba'); }
  };

  const markPaid = async () => {
    try {
      await incomingProformaAPI.markPaid(companyId, { id: proformaId, payment_date: todayStr() });
      toast.success('Fizetve jelölve');
      loadProforma();
    } catch (e) { toast.error(e?.response?.data?.error || 'Hiba'); }
  };

  /* derived */
  const status      = proforma?.status;
  const isCovered   = proforma?.is_fully_covered;
  const net         = parseFloat(form.net_amount   || 0);
  const vat         = parseFloat(form.vat_amount   || 0);
  const gross       = parseFloat(form.gross_amount || 0);
  const showRate    = form.currency !== 'HUF';

  if (loading) {
    return (
      <FormContainer>
        <div style={{ padding: 40, textAlign: 'center', color: '#7f8c8d' }}>Betöltés…</div>
      </FormContainer>
    );
  }

  return (
    <FormContainer>
      {/* ── fejléc ──────────────────────────────────────────────────────── */}
      <FormHeader>
        <HeaderLeft>
          <Title>{isNew ? 'Új Bejövő Díjbekérő' : 'Bejövő Díjbekérő szerkesztése'}</Title>

          {/* díjbekérő szám input — a fejlécben, mint a InvoiceForm-ban */}
          <Input
            value={form.proforma_number}
            onChange={e => setF('proforma_number', e.target.value)}
            placeholder="Díjbekérő száma"
            style={{ width: 220, height: 32, padding: '6px 10px' }}
          />

          {/* státusz badge ha már létezik */}
          {proforma && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge $v={status}>{STATUS_LABELS[status] || status}</StatusBadge>
              {isCovered && <StatusBadge $v="invoiced">Teljesítve</StatusBadge>}
              {proforma.payment_date && (
                <span style={{ fontSize: 12, color: '#7f8c8d' }}>Fizetve: {proforma.payment_date}</span>
              )}
            </div>
          )}
        </HeaderLeft>

        <ButtonGroup>
          {/* státuszváltók */}
          {proforma && status !== 'paid' && (
            <Button variant="success" onClick={markPaid}>✓ Kifizetve</Button>
          )}
          {proforma && status !== 'unpaid' && (
            <Button variant="secondary" onClick={() => setStatus('unpaid')}>Kifizetetlen</Button>
          )}

          {/* OCR */}
          <Button variant="secondary" onClick={() => ocrInputRef.current?.click()} disabled={parsing}>
            <Upload size={16} />
            {parsing ? 'Feldolgozás...' : 'Számlakép/PDF beolvasás'}
          </Button>
          <input ref={ocrInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleOCR(e.target.files[0]); e.target.value = ''; }} />

          <Button variant="secondary" onClick={() => navigate('/incoming-proformas')}>
            <ArrowLeft size={16} /> Vissza
          </Button>

          <Button variant="primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />{saving ? 'Mentés…' : 'Mentés'}
          </Button>

          {!isNew && (
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={16} /> Törlés
            </Button>
          )}
        </ButtonGroup>
      </FormHeader>

      {/* ── kéthasábos form ──────────────────────────────────────────────── */}
      <FormGrid>
        {/* Bal: Alapadatok */}
        <FormSection>
          <SectionTitle>Alapadatok</SectionTitle>

          <FormGroup>
            <Label>Szállító neve</Label>
            <Input value={form.supplier_name} onChange={e => setF('supplier_name', e.target.value)} placeholder="Szállító megnevezése" />
          </FormGroup>

          <FormGroup>
            <Label>Szállító adószáma</Label>
            <Input value={form.supplier_tax_number} onChange={e => setF('supplier_tax_number', e.target.value)} placeholder="12345678-1-42" />
          </FormGroup>

          <FormGroup>
            <Label>Kibocsátás dátuma</Label>
            <Input type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} />
          </FormGroup>

          <FormGroup>
            <Label>Esedékesség dátuma</Label>
            <Input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
          </FormGroup>

          <FormGroup>
            <Label>Teljesítés dátuma</Label>
            <Input type="date" value={form.delivery_date} onChange={e => setF('delivery_date', e.target.value)} />
          </FormGroup>
        </FormSection>

        {/* Jobb: Pénzügyi adatok */}
        <FormSection>
          <SectionTitle>Pénzügyi adatok</SectionTitle>

          <FormGroup>
            <Label>Fizetési mód</Label>
            <Select value={form.payment_method} onChange={e => setF('payment_method', e.target.value)}>
              {Object.entries(PM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Pénznem</Label>
            <Select value={form.currency} onChange={e => setF('currency', e.target.value)}>
              {['HUF', 'EUR', 'USD', 'GBP', 'CHF'].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormGroup>

          {showRate && (
            <FormGroup>
              <Label>
                Árfolyam
                <span style={{ marginLeft: 10, fontSize: '0.9em', color: '#666' }}>
                  (1 {form.currency} = {form.exchange_rate} HUF)
                </span>
              </Label>
              <Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setF('exchange_rate', e.target.value)} />
            </FormGroup>
          )}

          <FormGroup>
            <Label>Nettó összeg</Label>
            <Input type="number" step="0.01" value={form.net_amount} onChange={e => setF('net_amount', e.target.value)} placeholder="0" />
          </FormGroup>

          <FormGroup>
            <Label>ÁFA összeg</Label>
            <Input type="number" step="0.01" value={form.vat_amount} onChange={e => setF('vat_amount', e.target.value)} placeholder="0" />
          </FormGroup>

          <FormGroup>
            <Label>Bruttó összeg</Label>
            <Input type="number" step="0.01" value={form.gross_amount} onChange={e => setF('gross_amount', e.target.value)} placeholder="0" />
          </FormGroup>

          <FormGroup>
            <Label>Megjegyzések</Label>
            <TextArea value={form.comment} onChange={e => setF('comment', e.target.value)} placeholder="Megjegyzés…" />
          </FormGroup>
        </FormSection>
      </FormGrid>

      {/* ── összesítés ───────────────────────────────────────────────────── */}
      <SummarySection>
        <SectionTitle>Összesítés</SectionTitle>
        <SummaryRow>
          <span>Nettó összeg:</span>
          <span>{fmt(net, 2)} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>ÁFA összeg:</span>
          <span>{fmt(vat, 2)} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>Bruttó összeg:</span>
          <span>{fmt(gross, 2)} {form.currency}</span>
        </SummaryRow>

        {/* ÁFA részletező — egyszerűsített, manuális adatok */}
        {(net > 0 || vat > 0 || gross > 0) && (
          <>
            <SectionTitle style={{ marginTop: 20 }}>ÁFA részletező</SectionTitle>
            <VatTable>
              <thead>
                <tr>
                  <th>ÁFA kulcs</th>
                  <th>Nettó összeg</th>
                  <th>ÁFA összeg</th>
                  <th>Bruttó összeg</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Összesen</td>
                  <td>{fmt(net, 2)} {form.currency}</td>
                  <td>{fmt(vat, 2)} {form.currency}</td>
                  <td>{fmt(gross, 2)} {form.currency}</td>
                </tr>
              </tbody>
            </VatTable>
          </>
        )}

        {/* Kapcsolódó számlák — a Kiegyenlítések részletező helyén */}
        <SectionTitle style={{ marginTop: 20 }}>Kapcsolódó számlák</SectionTitle>
        {isNew ? (
          <div style={{ color: '#7f8c8d', fontSize: 14, padding: '12px 0' }}>
            Kapcsolódó számlák mentés után adhatók hozzá.
          </div>
        ) : proforma ? (
          <InvoiceLinkSection proforma={proforma} companyId={companyId} onRefresh={loadProforma} />
        ) : null}

        {/* Feltöltött fájlok */}
        <SectionTitle style={{ marginTop: 24 }}>Feltöltött fájlok</SectionTitle>
        {isNew ? (
          <div style={{ color: '#7f8c8d', fontSize: 14, padding: '12px 0' }}>
            Fájlok mentés után tölthetők fel.
          </div>
        ) : proforma ? (
          <DocumentSection proforma={proforma} companyId={companyId} onRefresh={loadProforma} />
        ) : null}
      </SummarySection>
    </FormContainer>
  );
}
