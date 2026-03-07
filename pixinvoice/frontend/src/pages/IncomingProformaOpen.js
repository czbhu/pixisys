import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Save, ArrowLeft, Upload, Trash2, Plus, Search, ExternalLink, FileText, X, MessageSquare } from 'lucide-react';
import { incomingProformaAPI } from '../services/api';

// ── Styled components — same as InvoiceForm ──────────────────────────────────
const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  @media (max-width: 768px) { width: 100%; flex-direction: column; align-items: stretch; gap: 8px; }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
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
    switch (p.variant) {
      case 'primary': return '#3498db';
      case 'secondary': return '#6c757d';
      case 'success': return '#27ae60';
      case 'danger': return '#e74c3c';
      default: return '#f8f9fa';
    }
  }};
  color: white;
  &:hover { opacity: 0.8; }
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

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #2c3e50;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25); }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  transition: border-color 0.2s;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25); }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25); }
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
  &:last-child { border-bottom: none; font-weight: 600; font-size: 16px; color: #2c3e50; }
`;

const VatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  th, td { border-bottom: 1px solid #ecf0f1; padding: 8px; text-align: left; }
  th { background: #f1f3f5; }
`;

const StatusPill = styled.span`
  display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  ${p => p.$v === 'paid' ? 'background:#bbf7d0;color:#166534;' : ''}
  ${p => p.$v === 'unpaid' ? 'background:#fde8d8;color:#9a3412;' : ''}
  ${p => p.$v === 'invoiced' ? 'background:#bae6fd;color:#0c4a6e;' : ''}
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Bankkártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };
const DOC_TYPES = { IMAGE: 'Számlakép', OTHER: 'Egyéb', CONTRACT: 'Szerződés', SUPPLIER: 'Szállító', PERFORMANCE_CERT: 'Teljesítés igazolás' };

function fmt(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0';
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ══════════════════════════════════════════════════════════════════════════════
export default function IncomingProformaOpen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const companyId = params.get('company_id') || localStorage.getItem('selectedCompanyId') || '';
  const proformaId = params.get('proforma_id') || '';
  const isNew = !proformaId;

  const [proforma, setProforma] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const ocrInputRef = useRef(null);

  // ── Form state ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    proforma_number: '',
    supplier_tax_number: '',
    supplier_name: '',
    issue_date: '',
    due_date: '',
    delivery_date: '',
    payment_method: 'TRANSFER',
    currency: 'HUF',
    exchange_rate: '1',
    net_amount: '',
    vat_amount: '',
    gross_amount: '',
    comment: '',
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Invoice link search state ───────────────────────────────────────────
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkSearchTax, setLinkSearchTax] = useState('');
  const [linkSearchNum, setLinkSearchNum] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [addingLink, setAddingLink] = useState(false);

  // ── Document upload state ───────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('IMAGE');
  const [docComment, setDocComment] = useState('');
  const docInputRef = useRef(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');

  // ── Load proforma ───────────────────────────────────────────────────────
  const loadProforma = useCallback(async () => {
    if (!proformaId || !companyId) return;
    setLoading(true);
    try {
      const res = await incomingProformaAPI.get(companyId, proformaId);
      const d = res.data;
      setProforma(d);
      setForm({
        proforma_number: d.proforma_number || '',
        supplier_tax_number: d.supplier_tax_number || '',
        supplier_name: d.supplier_name || '',
        issue_date: d.issue_date || '',
        due_date: d.due_date || '',
        delivery_date: d.delivery_date || '',
        payment_method: (d.payment_method || 'TRANSFER').toUpperCase(),
        currency: (d.currency || 'HUF').toUpperCase(),
        exchange_rate: d.exchange_rate || '1',
        net_amount: d.net_amount || '',
        vat_amount: d.vat_amount || '',
        gross_amount: d.gross_amount || '',
        comment: d.comment || '',
      });
      setLinkSearchTax(d.supplier_tax_number || '');
    } catch {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [proformaId, companyId]);

  useEffect(() => { loadProforma(); }, [loadProforma]);

  // ── OCR parse ───────────────────────────────────────────────────────────
  const handleOCR = async (file) => {
    if (!file) return;
    setParsing(true);
    try {
      const res = await incomingProformaAPI.parseDocument(companyId, file);
      const f = res.data?.fields || {};
      setForm(prev => ({
        ...prev,
        proforma_number: f.invoice_number || prev.proforma_number,
        supplier_tax_number: f.supplier_tax_number || prev.supplier_tax_number,
        supplier_name: f.supplier_name || prev.supplier_name,
        issue_date: f.issue_date || prev.issue_date,
        due_date: f.due_date || prev.due_date,
        net_amount: f.net_amount != null ? String(f.net_amount) : prev.net_amount,
        vat_amount: f.vat_amount != null ? String(f.vat_amount) : prev.vat_amount,
        gross_amount: f.gross_amount != null ? String(f.gross_amount) : prev.gross_amount,
        currency: f.currency || prev.currency,
        payment_method: f.payment_method || prev.payment_method,
      }));
      toast.success('OCR feldolgozva');
    } catch {
      toast.error('OCR hiba');
    } finally {
      setParsing(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────
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
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Törlöd a(z) ${form.proforma_number} díjbekérőt?`)) return;
    try {
      await incomingProformaAPI.delete(companyId, proformaId);
      toast.success('Törölve');
      navigate('/incoming-proformas');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Törlési hiba');
    }
  };

  // ── Invoice link actions ────────────────────────────────────────────────
  const doLinkSearch = async () => {
    setLinkSearching(true);
    try {
      const res = await incomingProformaAPI.suggestInvoices(companyId, linkSearchTax, linkSearchNum);
      setSuggestions(res.data?.suggestions || res.data || []);
    } catch {
      toast.error('Keresési hiba');
    } finally {
      setLinkSearching(false);
    }
  };

  const selectSuggestion = (inv) => {
    setSelectedInvoice(inv);
    const remaining = parseFloat(proforma?.remaining_amount || proforma?.gross_amount || 0);
    const invoiceGross = parseFloat(inv.gross_amount || 0);
    setAllocAmount(String(Math.min(remaining > 0 ? remaining : invoiceGross, invoiceGross)));
  };

  const addLink = async () => {
    if (!selectedInvoice) return;
    setAddingLink(true);
    try {
      await incomingProformaAPI.addInvoiceLink({
        company_id: companyId,
        proforma_id: proformaId,
        invoice_number: selectedInvoice.invoice_number,
        supplier_tax_number: selectedInvoice.supplier_tax_number || linkSearchTax,
        supplier_name: selectedInvoice.supplier_name,
        allocated_amount: allocAmount,
        currency: form.currency,
      });
      toast.success('Számla hozzárendelve');
      setSelectedInvoice(null);
      setSuggestions([]);
      setLinkSearchNum('');
      setShowLinkSearch(false);
      loadProforma();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hozzáadási hiba');
    } finally {
      setAddingLink(false);
    }
  };

  const removeLink = async (linkId) => {
    if (!window.confirm('Eltávolítod a kapcsolódó számlát?')) return;
    try {
      await incomingProformaAPI.removeInvoiceLink(companyId, linkId, proformaId);
      toast.success('Kapcsolat eltávolítva');
      loadProforma();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hiba');
    }
  };

  // ── Document actions ────────────────────────────────────────────────────
  const uploadDoc = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await incomingProformaAPI.uploadDocument(companyId, proformaId, file, docType, docComment);
      toast.success('Fájl feltöltve');
      setDocComment('');
      loadProforma();
    } catch {
      toast.error('Feltöltési hiba');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId) => {
    if (!window.confirm('Törlöd ezt a fájlt?')) return;
    try {
      await incomingProformaAPI.deleteDocument(companyId, docId);
      toast.success('Fájl törölve');
      loadProforma();
    } catch {
      toast.error('Törlési hiba');
    }
  };

  const saveDocComment = async (docId) => {
    try {
      await incomingProformaAPI.setDocumentComment(companyId, docId, editCommentText);
      toast.success('Megjegyzés mentve');
      setEditingComment(null);
      loadProforma();
    } catch {
      toast.error('Hiba');
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────
  const links = proforma?.invoice_links || [];
  const docs = proforma?.documents || [];
  const allocated = parseFloat(proforma?.allocated_amount || 0);
  const remaining = parseFloat(proforma?.remaining_amount || 0);
  const gross = parseFloat(proforma?.gross_amount || form.gross_amount || 0);
  const isCovered = proforma?.is_fully_covered;
  const status = proforma?.status;

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) return <FormContainer><LoadingSpinner>Betöltés…</LoadingSpinner></FormContainer>;

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <FormContainer>
      {/* ── Header — exact same as InvoiceForm ─────────────────────────── */}
      <FormHeader>
        <HeaderLeft>
          <Title>{isNew ? 'Új bejövő díjbekérő' : `Díjbekérő: ${form.proforma_number}`}</Title>
          {proforma && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusPill $v={status}>{STATUS_LABELS[status] || status}</StatusPill>
              {isCovered && <StatusPill $v="invoiced">Teljesítve</StatusPill>}
              {proforma.payment_date && <span style={{ fontSize: 12, color: '#7f8c8d' }}>Fizetve: {proforma.payment_date}</span>}
            </div>
          )}
        </HeaderLeft>
        <ButtonGroup>
          <Button variant="primary" onClick={() => ocrInputRef.current?.click()} disabled={parsing}>
            <Upload size={16} />{parsing ? 'OCR…' : 'Számlakép/PDF beolvasás'}
          </Button>
          <input ref={ocrInputRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => { if (e.target.files[0]) handleOCR(e.target.files[0]); e.target.value = ''; }} />
          <Button variant="secondary" onClick={() => navigate('/incoming-proformas')}>
            <ArrowLeft size={16} />Vissza
          </Button>
          {!isNew && (
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={16} />Törlés
            </Button>
          )}
          <Button variant="success" onClick={handleSave} disabled={saving}>
            <Save size={16} />{saving ? 'Mentés…' : (isNew ? 'Mentés' : 'Frissítés')}
          </Button>
        </ButtonGroup>
      </FormHeader>

      {/* ── Main 2-column grid — same as InvoiceForm ───────────────────── */}
      <FormGrid>
        {/* Left column: Alapadatok */}
        <FormSection>
          <SectionTitle>Alapadatok</SectionTitle>
          <FormGroup>
            <Label>Díjbekérő száma *</Label>
            <Input value={form.proforma_number} onChange={e => setF('proforma_number', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Szállító neve</Label>
            <Input value={form.supplier_name} onChange={e => setF('supplier_name', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Szállító adószáma</Label>
            <Input value={form.supplier_tax_number} onChange={e => setF('supplier_tax_number', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Kibocsátás dátuma</Label>
            <Input type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Fizetési határidő</Label>
            <Input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Teljesítés dátuma</Label>
            <Input type="date" value={form.delivery_date} onChange={e => setF('delivery_date', e.target.value)} />
          </FormGroup>
        </FormSection>

        {/* Right column: Pénzügyi adatok */}
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
          {form.currency !== 'HUF' && (
            <FormGroup>
              <Label>Árfolyam</Label>
              <Input type="number" value={form.exchange_rate} onChange={e => setF('exchange_rate', e.target.value)} />
            </FormGroup>
          )}
          <FormGroup>
            <Label>Nettó összeg</Label>
            <Input type="number" value={form.net_amount} onChange={e => setF('net_amount', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>ÁFA összeg</Label>
            <Input type="number" value={form.vat_amount} onChange={e => setF('vat_amount', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Bruttó összeg</Label>
            <Input type="number" value={form.gross_amount} onChange={e => setF('gross_amount', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Megjegyzés</Label>
            <TextArea value={form.comment} onChange={e => setF('comment', e.target.value)} rows={3} />
          </FormGroup>
        </FormSection>
      </FormGrid>

      {/* ── Summary section — same layout as InvoiceForm ────────────────── */}
      <SummarySection>
        <SectionTitle>Összesítés</SectionTitle>
        <SummaryRow>
          <span>Nettó összeg</span>
          <span>{fmt(form.net_amount)} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>ÁFA összeg</span>
          <span>{fmt(form.vat_amount)} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>Bruttó összeg</span>
          <span>{fmt(form.gross_amount)} {form.currency}</span>
        </SummaryRow>

        {/* ── Kapcsolódó számlák — replaces "Kiegyenlítések részletező" ── */}
        <SectionTitle style={{ marginTop: 16 }}>Kapcsolódó számlák</SectionTitle>

        {isNew ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '12px 0' }}>
            Mentés után adhat hozzá kapcsolódó számlákat
          </div>
        ) : (
          <>
            {/* Allocation summary */}
            {gross > 0 && (
              <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 14 }}>
                <span><strong>Bruttó:</strong> {fmt(gross)} {form.currency}</span>
                <span><strong>Allokált:</strong> {fmt(allocated)} {form.currency}</span>
                <span style={remaining > 0 ? { color: '#e74c3c', fontWeight: 700 } : { color: '#27ae60', fontWeight: 700 }}>
                  <strong>Maradék:</strong> {fmt(remaining)} {form.currency}
                </span>
              </div>
            )}

            {/* Linked invoices table — same style as VatTable */}
            <VatTable>
              <thead>
                <tr>
                  <th>Számlaszám</th>
                  <th>Szállító</th>
                  <th style={{ textAlign: 'right' }}>Allokált összeg</th>
                  <th>Deviza</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {links.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#7f8c8d' }}>
                      Nincs kapcsolódó számla rögzítve
                    </td>
                  </tr>
                ) : links.map(lnk => (
                  <tr key={lnk.id}>
                    <td>
                      <a
                        href={`/incoming-invoices/open?company_id=${encodeURIComponent(companyId)}&invoice_number=${encodeURIComponent(lnk.invoice_number)}&supplier_tax_number=${encodeURIComponent(lnk.supplier_tax_number || '')}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: '#3498db', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {lnk.invoice_number} <ExternalLink size={12} />
                      </a>
                    </td>
                    <td>{lnk.supplier_name || lnk.supplier_tax_number || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(lnk.allocated_amount)}</td>
                    <td>{lnk.currency}</td>
                    <td>
                      <button
                        onClick={() => removeLink(lnk.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}
                        title="Eltávolítás"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </VatTable>

            {/* Add invoice link */}
            {!showLinkSearch ? (
              <Button variant="success" onClick={() => { setShowLinkSearch(true); setLinkSearchTax(form.supplier_tax_number); }} style={{ marginTop: 12 }}>
                <Plus size={14} /> Számla hozzáadása
              </Button>
            ) : (
              <div style={{ marginTop: 12, border: '1px solid #ecf0f1', borderRadius: 8, padding: 16, background: '#fff' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <Label>Adószám</Label>
                    <Input value={linkSearchTax} onChange={e => setLinkSearchTax(e.target.value)} style={{ width: 160 }} />
                  </div>
                  <div>
                    <Label>Számlaszám</Label>
                    <Input value={linkSearchNum} onChange={e => setLinkSearchNum(e.target.value)} style={{ width: 180 }} />
                  </div>
                  <Button variant="primary" onClick={doLinkSearch} disabled={linkSearching} style={{ height: 38 }}>
                    <Search size={14} />{linkSearching ? 'Keresés…' : 'Keresés'}
                  </Button>
                  <Button variant="secondary" onClick={() => { setShowLinkSearch(false); setSelectedInvoice(null); setSuggestions([]); }} style={{ height: 38 }}>
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
                        <tr
                          key={inv.invoice_number || inv.id}
                          onClick={() => selectSuggestion(inv)}
                          style={{
                            cursor: 'pointer',
                            background: selectedInvoice?.invoice_number === inv.invoice_number ? '#ebf5fb' : undefined,
                          }}
                        >
                          <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                          <td>{inv.supplier_name || inv.supplier || '—'}</td>
                          <td>{inv.issue_date || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(inv.gross_amount)}</td>
                          <td>{inv.currency}</td>
                          <td>{inv.payment_status || inv.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </VatTable>
                )}

                {selectedInvoice && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: 12, background: '#ebf5fb', borderRadius: 6, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                        Kiválasztva: <strong>{selectedInvoice.invoice_number}</strong>
                      </div>
                      <Label>Allokált összeg ({form.currency})</Label>
                      <Input type="number" value={allocAmount} onChange={e => setAllocAmount(e.target.value)} style={{ width: 150 }} />
                    </div>
                    {remaining > 0 && parseFloat(allocAmount) > remaining && (
                      <div style={{ color: '#e67e22', fontSize: 13, fontWeight: 600 }}>⚠ Túlallokálás: +{fmt(parseFloat(allocAmount) - remaining)}</div>
                    )}
                    <Button variant="success" onClick={addLink} disabled={addingLink}>
                      {addingLink ? 'Hozzáadás…' : 'Hozzáadás'}
                    </Button>
                  </div>
                )}

                {suggestions.length === 0 && !linkSearching && (
                  <div style={{ color: '#7f8c8d', fontSize: 13 }}>Keress adószám vagy számlaszám alapján</div>
                )}
              </div>
            )}
          </>
        )}
      </SummarySection>

      {/* ── Feltöltött fájlok — same style as IncomingInvoiceOpen attachments */}
      <SummarySection>
        <SectionTitle>Feltöltött fájlok</SectionTitle>

        {isNew ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '12px 0' }}>
            Mentés után tölthet fel fájlokat
          </div>
        ) : (
          <>
            {/* Upload controls */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <Label>Típus</Label>
                <Select value={docType} onChange={e => setDocType(e.target.value)} style={{ width: 160 }}>
                  {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div>
                <Label>Megjegyzés</Label>
                <Input value={docComment} onChange={e => setDocComment(e.target.value)} style={{ width: 200 }} placeholder="Opcionális" />
              </div>
              <Button variant="primary" onClick={() => docInputRef.current?.click()} disabled={uploading} style={{ height: 38 }}>
                <Upload size={14} />{uploading ? 'Feltöltés…' : 'Fájl feltöltés'}
              </Button>
              <input ref={docInputRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadDoc(e.target.files[0]); e.target.value = ''; }} />
            </div>

            {/* Drag & drop zone */}
            <div
              style={{ border: '2px dashed #ddd', borderRadius: 8, padding: 20, textAlign: 'center', color: '#7f8c8d', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => docInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3498db'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#ddd'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#ddd'; if (e.dataTransfer.files[0]) uploadDoc(e.dataTransfer.files[0]); }}
            >
              Húzd ide a fájlt, vagy kattints a feltöltéshez
            </div>

            {/* Documents table */}
            <VatTable>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Típus</th>
                  <th>Fájl</th>
                  <th>Megjegyzés</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#7f8c8d' }}>
                      Nincs feltöltött fájl
                    </td>
                  </tr>
                ) : docs.map((doc, idx) => (
                  <tr key={doc.id}>
                    <td>{idx + 1}</td>
                    <td>{DOC_TYPES[doc.type] || doc.type}</td>
                    <td>
                      {doc.file_url ? (
                        <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ color: '#3498db', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <FileText size={13} />{doc.original_name || 'fájl'}
                        </a>
                      ) : (doc.original_name || 'fájl')}
                      {doc.size > 0 && <span style={{ color: '#7f8c8d', fontSize: 12, marginLeft: 6 }}>({Math.round(doc.size / 1024)} KB)</span>}
                    </td>
                    <td>
                      {editingComment === doc.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Input
                            value={editCommentText}
                            onChange={e => setEditCommentText(e.target.value)}
                            style={{ fontSize: 13, padding: '4px 8px' }}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveDocComment(doc.id); if (e.key === 'Escape') setEditingComment(null); }}
                          />
                          <button onClick={() => saveDocComment(doc.id)} style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>OK</button>
                          <button onClick={() => setEditingComment(null)} style={{ background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </div>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', color: doc.comment ? '#2c3e50' : '#7f8c8d', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => { setEditingComment(doc.id); setEditCommentText(doc.comment || ''); }}
                        >
                          <MessageSquare size={12} />{doc.comment || 'Megjegyzés…'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c' }}
                        title="Törlés"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </VatTable>
          </>
        )}
      </SummarySection>
    </FormContainer>
  );
}
