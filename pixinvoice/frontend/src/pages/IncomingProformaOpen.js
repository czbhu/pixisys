import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Save, Trash2, X, Plus, Search, ExternalLink, FileText, Upload, MessageSquare } from 'lucide-react';
import { incomingProformaAPI } from '../services/api';

// ── Styled ────────────────────────────────────────────────────────────────────
const PageWrap = styled.div`max-width:1000px;margin:0 auto;padding:16px 20px;`;
const Card = styled.div`background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px;`;
const CardTitle = styled.h3`margin:0 0 16px;font-size:16px;font-weight:700;color:#111;display:flex;align-items:center;gap:8px;`;
const FormGrid = styled.div`display:grid;grid-template-columns:${p=>p.$cols||'1fr 1fr'};gap:12px;margin-bottom:12px;`;
const Label = styled.label`font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:3px;`;
const Input = styled.input`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;
  &:focus{outline:none;border-color:#3498db;box-shadow:0 0 0 2px rgba(52,152,219,.15);}
`;
const Select = styled.select`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;`;
const Textarea = styled.textarea`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;`;
const PrimaryButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:9px 16px;
  background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;
  &:hover{background:#2980b9;}&:disabled{background:#95a5a6;cursor:default;}
`;
const SecondaryButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:7px 13px;
  background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;
  &:hover{background:#f3f4f6;}
`;
const DangerButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:7px 13px;
  background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;
  &:hover{background:#b91c1c;}
`;
const GreenButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:7px 13px;
  background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;
  &:hover{background:#15803d;}
`;
const IconButton = styled.button`
  display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  border:none;border-radius:4px;background:#ecf0f1;color:#374151;cursor:pointer;
  &:hover{background:#d1d5db;}
`;
const Table = styled.table`width:100%;border-collapse:collapse;font-size:13px;`;
const Th = styled.th`padding:7px 10px;text-align:left;background:#f8f9fa;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151;`;
const Td = styled.td`padding:7px 10px;border-bottom:1px solid #f0f2f5;vertical-align:middle;`;
const StatusPill = styled.span`
  display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;
  ${p=>p.$v==='paid'?'background:#bbf7d0;color:#166534;':''}
  ${p=>p.$v==='unpaid'?'background:#fde8d8;color:#9a3412;':''}
  ${p=>p.$v==='invoiced'?'background:#bae6fd;color:#0c4a6e;':''}
`;
const InfoBlock = styled.div`background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:12px;`;
const SuggestRow = styled.tr`cursor:pointer;&:hover td{background:#f0f9ff;}`;

const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Kártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };

function fmt(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function today() {
  return new Date().toISOString().slice(0,10);
}

// ── Invoice Link Section ───────────────────────────────────────────────────────
function InvoiceLinkSection({ proforma, companyId, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [searchTax, setSearchTax] = useState(proforma.supplier_tax_number || '');
  const [searchNum, setSearchNum] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const remaining = parseFloat(proforma.remaining_amount || 0);

  const doSearch = async () => {
    setLoading(true);
    try {
      const res = await incomingProformaAPI.suggestInvoices(companyId, searchTax, searchNum);
      setSuggestions(res.data?.suggestions || res.data || []);
    } catch {
      toast.error('Keresési hiba');
    } finally {
      setLoading(false);
    }
  };

  const selectRow = (inv) => {
    setSelected(inv);
    setAllocAmount(String(Math.min(remaining > 0 ? remaining : parseFloat(proforma.gross_amount || 0), parseFloat(inv.gross_amount || 0))));
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
      setShowAdd(false);
      setSelected(null);
      setSuggestions([]);
      setSearchNum('');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hozzáadási hiba');
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (linkId) => {
    if (!window.confirm('Eltávolítod a kapcsolódó számlát?')) return;
    try {
      await incomingProformaAPI.removeInvoiceLink(companyId, { link_id: linkId, proforma_id: proforma.id });
      toast.success('Kapcsolat eltávolítva');
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hiba');
    }
  };

  const links = proforma.invoice_links || [];
  const allocated = parseFloat(proforma.allocated_amount || 0);
  const gross = parseFloat(proforma.gross_amount || 0);
  const rem = parseFloat(proforma.remaining_amount || 0);
  const covered = proforma.is_fully_covered;

  return (
    <Card>
      <CardTitle>
        <FileText size={17}/>Kapcsolódó számlák
        {covered && <StatusPill $v="invoiced" style={{marginLeft:8}}>Teljesítve</StatusPill>}
      </CardTitle>

      {gross > 0 && (
        <InfoBlock>
          <span style={{marginRight:20}}><b>Bruttó:</b> {fmt(gross)} {proforma.currency}</span>
          <span style={{marginRight:20}}><b>Allokált:</b> {fmt(allocated)} {proforma.currency}</span>
          <span style={rem > 0 ? {color:'#b91c1c',fontWeight:700} : {color:'#16a34a',fontWeight:700}}>
            <b>Maradék:</b> {fmt(rem)} {proforma.currency}
          </span>
        </InfoBlock>
      )}

      {links.length > 0 && (
        <Table style={{marginBottom:12}}>
          <thead>
            <tr>
              <Th>Számlaszám</Th>
              <Th>Szállító</Th>
              <Th style={{textAlign:'right'}}>Összeg</Th>
              <Th>Deviza</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {links.map(lnk => (
              <tr key={lnk.id}>
                <Td>
                  <a
                    href={`/incoming-invoices/open?company_id=${encodeURIComponent(companyId)}&invoice_number=${encodeURIComponent(lnk.invoice_number)}&supplier_tax_number=${encodeURIComponent(lnk.supplier_tax_number||'')}`}
                    target="_blank" rel="noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:4,color:'#3498db',fontWeight:600,fontSize:13}}
                  >{lnk.invoice_number}<ExternalLink size={11}/></a>
                </Td>
                <Td>{lnk.supplier_name || lnk.supplier_tax_number || '—'}</Td>
                <Td style={{textAlign:'right',fontWeight:600}}>{fmt(lnk.allocated_amount)}</Td>
                <Td>{lnk.currency}</Td>
                <Td>
                  <IconButton onClick={()=>removeLink(lnk.id)} title="Eltávolítás" style={{background:'#fee2e2',color:'#dc2626'}}>
                    <Trash2 size={13}/>
                  </IconButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {!showAdd && (
        <SecondaryButton onClick={()=>setShowAdd(true)}><Plus size={13}/>Számla hozzáadása</SecondaryButton>
      )}

      {showAdd && (
        <div style={{border:'1px solid #e5e7eb',borderRadius:6,padding:14,background:'#fafafa',marginTop:8}}>
          <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <Label>Adószám</Label>
              <Input value={searchTax} onChange={e=>setSearchTax(e.target.value)} style={{width:150}} placeholder="Adószám" />
            </div>
            <div>
              <Label>Számlaszám</Label>
              <Input value={searchNum} onChange={e=>setSearchNum(e.target.value)} style={{width:160}} placeholder="Keresés…" />
            </div>
            <SecondaryButton onClick={doSearch} disabled={loading}><Search size={13}/>{loading?'Keresés…':'Keresés'}</SecondaryButton>
            <SecondaryButton onClick={()=>{setShowAdd(false);setSelected(null);setSuggestions([]);}}><X size={13}/>Mégse</SecondaryButton>
          </div>
          {suggestions.length > 0 && (
            <Table style={{marginBottom:10}}>
              <thead>
                <tr>
                  <Th>Számlaszám</Th>
                  <Th>Szállító</Th>
                  <Th>Dátum</Th>
                  <Th style={{textAlign:'right'}}>Bruttó</Th>
                  <Th>Deviza</Th>
                  <Th>Státusz</Th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(inv => (
                  <SuggestRow key={inv.invoice_number || inv.id} onClick={()=>selectRow(inv)}
                    style={selected?.invoice_number===inv.invoice_number?{background:'#dbeafe'}:{}}>
                    <Td>{inv.invoice_number}</Td>
                    <Td>{inv.supplier_name||inv.supplier||'—'}</Td>
                    <Td>{inv.issue_date||'—'}</Td>
                    <Td style={{textAlign:'right'}}>{fmt(inv.gross_amount)}</Td>
                    <Td>{inv.currency}</Td>
                    <Td>{inv.payment_status||inv.status||'—'}</Td>
                  </SuggestRow>
                ))}
              </tbody>
            </Table>
          )}
          {suggestions.length === 0 && !loading && (
            <div style={{color:'#6b7280',fontSize:13,marginBottom:8}}>Keress adószám vagy számlaszám alapján</div>
          )}
          {selected && (
            <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap',padding:'10px 12px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6}}>
              <div>
                <div style={{fontSize:12,color:'#374151',fontWeight:600,marginBottom:4}}>
                  Kiválasztva: <b>{selected.invoice_number}</b>
                </div>
                <Label>Allokált összeg ({proforma.currency})</Label>
                <Input type="number" value={allocAmount} onChange={e=>setAllocAmount(e.target.value)} style={{width:140}} />
              </div>
              {rem > 0 && parseFloat(allocAmount) > rem && (
                <div style={{color:'#d97706',fontSize:12,fontWeight:600}}>⚠ Túlallokálás: +{fmt(parseFloat(allocAmount)-rem)}</div>
              )}
              <GreenButton onClick={addLink} disabled={saving}>{saving?'Hozzáadás…':'Hozzáadás'}</GreenButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Document Section ──────────────────────────────────────────────────────────
function DocumentSection({ proforma, companyId, onRefresh }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [editComment, setEditComment] = useState(null);
  const [commentText, setCommentText] = useState('');

  const upload = async (file) => {
    setUploading(true);
    try {
      await incomingProformaAPI.uploadDocument(companyId, proforma.id, file);
      toast.success('Fájl feltöltve');
      onRefresh();
    } catch {
      toast.error('Feltöltési hiba');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId) => {
    if (!window.confirm('Törlöd ezt a fájlt?')) return;
    try {
      await incomingProformaAPI.deleteDocument(companyId, { document_id: docId, proforma_id: proforma.id });
      toast.success('Fájl törölve');
      onRefresh();
    } catch {
      toast.error('Törlési hiba');
    }
  };

  const saveComment = async (docId) => {
    try {
      await incomingProformaAPI.setDocumentComment(companyId, { document_id: docId, comment: commentText, proforma_id: proforma.id });
      toast.success('Megjegyzés mentve');
      setEditComment(null);
      onRefresh();
    } catch {
      toast.error('Hiba');
    }
  };

  const docs = proforma.documents || [];

  return (
    <Card>
      <CardTitle><Upload size={17}/>Feltöltött fájlok</CardTitle>
      {docs.length === 0 ? (
        <div style={{color:'#6b7280',fontSize:13,marginBottom:12}}>Nincs feltöltött fájl</div>
      ) : (
        <Table style={{marginBottom:12}}>
          <thead>
            <tr>
              <Th>Fájlnév</Th>
              <Th>Méret</Th>
              <Th>Megjegyzés</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {docs.map(doc => (
              <tr key={doc.id}>
                <Td>
                  {doc.file_url ? (
                    <a href={doc.file_url} target="_blank" rel="noreferrer" style={{color:'#3498db',display:'flex',alignItems:'center',gap:4,fontSize:13}}>
                      <FileText size={12}/>{doc.original_name || 'fájl'}
                    </a>
                  ) : (doc.original_name || 'fájl')}
                </Td>
                <Td style={{color:'#6b7280',fontSize:12}}>{doc.size ? `${Math.round(doc.size/1024)} KB` : '—'}</Td>
                <Td>
                  {editComment === doc.id ? (
                    <div style={{display:'flex',gap:6}}>
                      <Input value={commentText} onChange={e=>setCommentText(e.target.value)} style={{fontSize:12,padding:'4px 8px'}} autoFocus onKeyDown={e=>{if(e.key==='Enter')saveComment(doc.id);if(e.key==='Escape')setEditComment(null);}} />
                      <SecondaryButton style={{padding:'3px 8px',fontSize:12}} onClick={()=>saveComment(doc.id)}>OK</SecondaryButton>
                      <SecondaryButton style={{padding:'3px 8px',fontSize:12}} onClick={()=>setEditComment(null)}>✕</SecondaryButton>
                    </div>
                  ) : (
                    <span
                      style={{cursor:'pointer',color:doc.comment?'#374151':'#9ca3af',fontSize:12,display:'flex',alignItems:'center',gap:4}}
                      onClick={()=>{setEditComment(doc.id);setCommentText(doc.comment||'');}}
                    >
                      <MessageSquare size={12}/>{doc.comment || 'Megjegyzés…'}
                    </span>
                  )}
                </Td>
                <Td>
                  <IconButton onClick={()=>deleteDoc(doc.id)} title="Törlés" style={{background:'#fee2e2',color:'#dc2626'}}>
                    <Trash2 size={13}/>
                  </IconButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <SecondaryButton onClick={()=>fileInputRef.current?.click()} disabled={uploading}>
        <Upload size={13}/>{uploading?'Feltöltés…':'Fájl feltöltése'}
      </SecondaryButton>
      <input ref={fileInputRef} type="file" style={{display:'none'}} onChange={e=>{if(e.target.files[0])upload(e.target.files[0]);e.target.value='';}} />
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
  const parseFileInputRef = useRef(null);

  const [form, setForm] = useState({
    proforma_number: '', supplier_tax_number: '', supplier_name: '',
    issue_date: '', due_date: '', delivery_date: '', payment_method: 'TRANSFER',
    currency: 'HUF', exchange_rate: '1', net_amount: '', vat_amount: '', gross_amount: '', comment: '',
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    } catch {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [proformaId, companyId]);

  useEffect(() => { loadProforma(); }, [loadProforma]);

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

  const handleSave = async () => {
    if (!form.proforma_number.trim()) { toast.error('Díjbekérő száma kötelező'); return; }
    setSaving(true);
    try {
      const payload = { company_id: companyId, ...form };
      let res;
      if (isNew) {
        res = await incomingProformaAPI.create(payload);
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

  const handleSetStatus = async (status) => {
    try {
      await incomingProformaAPI.setStatus(companyId, { id: proformaId, status });
      toast.success('Státusz frissítve');
      loadProforma();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hiba');
    }
  };

  const handleMarkPaid = async () => {
    try {
      await incomingProformaAPI.markPaid(companyId, { id: proformaId, payment_date: today() });
      toast.success('Fizetve jelölve');
      loadProforma();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Hiba');
    }
  };

  if (loading) return <PageWrap><div style={{padding:40,textAlign:'center',color:'#6b7280'}}>Betöltés…</div></PageWrap>;

  const isCovered = proforma?.is_fully_covered;
  const status = proforma?.status;

  return (
    <PageWrap>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <button onClick={()=>navigate('/incoming-proformas')} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:13,padding:0,marginBottom:4,display:'flex',alignItems:'center',gap:4}}>
            ← Vissza a listához
          </button>
          <h2 style={{margin:0,fontSize:20,fontWeight:700}}>
            {isNew ? 'Új Bejövő Díjbekérő' : (form.proforma_number || 'Díjbekérő szerkesztése')}
          </h2>
          {proforma && (
            <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
              <StatusPill $v={status}>{STATUS_LABELS[status] || status}</StatusPill>
              {isCovered && <StatusPill $v="invoiced">Teljesítve</StatusPill>}
              {proforma.payment_date && <span style={{fontSize:12,color:'#6b7280'}}>Fizetve: {proforma.payment_date}</span>}
            </div>
          )}
        </div>

        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {proforma && status !== 'paid' && (
            <SecondaryButton onClick={handleMarkPaid} style={{background:'#f0fdf4',borderColor:'#86efac',color:'#16a34a'}}>
              ✓ Kifizetve
            </SecondaryButton>
          )}
          {proforma && status !== 'unpaid' && (
            <SecondaryButton onClick={()=>handleSetStatus('unpaid')}>Kifizetetlen</SecondaryButton>
          )}
          <SecondaryButton onClick={()=>parseFileInputRef.current?.click()} disabled={parsing}>
            {parsing ? 'OCR…' : '📎 OCR beolvasás'}
          </SecondaryButton>
          <input ref={parseFileInputRef} type="file" style={{display:'none'}} onChange={e=>{if(e.target.files[0])handleOCR(e.target.files[0]);e.target.value='';}} />
          <PrimaryButton onClick={handleSave} disabled={saving}><Save size={14}/>{saving?'Mentés…':'Mentés'}</PrimaryButton>
          {!isNew && <DangerButton onClick={handleDelete}><Trash2 size={14}/>Törlés</DangerButton>}
        </div>
      </div>

      {/* Basic data */}
      <Card>
        <CardTitle>Alap adatok</CardTitle>
        <FormGrid $cols="1fr">
          <div><Label>Díjbekérő száma *</Label><Input value={form.proforma_number} onChange={e=>setF('proforma_number',e.target.value)} /></div>
        </FormGrid>
        <FormGrid>
          <div><Label>Szállító neve</Label><Input value={form.supplier_name} onChange={e=>setF('supplier_name',e.target.value)} /></div>
          <div><Label>Szállító adószáma</Label><Input value={form.supplier_tax_number} onChange={e=>setF('supplier_tax_number',e.target.value)} /></div>
        </FormGrid>
        <FormGrid $cols="1fr 1fr 1fr">
          <div><Label>Keltezés</Label><Input type="date" value={form.issue_date} onChange={e=>setF('issue_date',e.target.value)} /></div>
          <div><Label>Esedékesség</Label><Input type="date" value={form.due_date} onChange={e=>setF('due_date',e.target.value)} /></div>
          <div><Label>Teljesítés dátuma</Label><Input type="date" value={form.delivery_date} onChange={e=>setF('delivery_date',e.target.value)} /></div>
        </FormGrid>
        <FormGrid>
          <div><Label>Fizetési mód</Label>
            <Select value={form.payment_method} onChange={e=>setF('payment_method',e.target.value)}>
              {Object.entries(PM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label>Deviza</Label>
            <Select value={form.currency} onChange={e=>setF('currency',e.target.value)}>
              {['HUF','EUR','USD','GBP','CHF'].map(c=><option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </FormGrid>
        {form.currency !== 'HUF' && (
          <FormGrid $cols="1fr 3fr">
            <div><Label>Árfolyam</Label><Input type="number" value={form.exchange_rate} onChange={e=>setF('exchange_rate',e.target.value)} /></div>
            <div/>
          </FormGrid>
        )}
        <FormGrid $cols="1fr 1fr 1fr">
          <div><Label>Nettó összeg</Label><Input type="number" value={form.net_amount} onChange={e=>setF('net_amount',e.target.value)} /></div>
          <div><Label>ÁFA összeg</Label><Input type="number" value={form.vat_amount} onChange={e=>setF('vat_amount',e.target.value)} /></div>
          <div><Label>Bruttó összeg</Label><Input type="number" value={form.gross_amount} onChange={e=>setF('gross_amount',e.target.value)} /></div>
        </FormGrid>
        <FormGrid $cols="1fr">
          <div><Label>Megjegyzés</Label><Textarea rows={2} value={form.comment} onChange={e=>setF('comment',e.target.value)} /></div>
        </FormGrid>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
          <PrimaryButton onClick={handleSave} disabled={saving}><Save size={14}/>{saving?'Mentés…':'Mentés'}</PrimaryButton>
        </div>
      </Card>

      {/* Invoice links - only available after save */}
      {!isNew && proforma ? (
        <InvoiceLinkSection proforma={proforma} companyId={companyId} onRefresh={loadProforma} />
      ) : !isNew && (
        <Card><div style={{color:'#6b7280',fontSize:13}}>Betöltés…</div></Card>
      )}

      {/* Document section - only if saved */}
      {!isNew && proforma ? (
        <DocumentSection proforma={proforma} companyId={companyId} onRefresh={loadProforma} />
      ) : isNew && (
        <Card style={{borderStyle:'dashed',background:'#fafafa'}}>
          <div style={{color:'#9ca3af',fontSize:13,textAlign:'center',padding:12}}>
            Fájlok és kapcsolódó számlák mentés után elérhetők
          </div>
        </Card>
      )}
    </PageWrap>
  );
}
