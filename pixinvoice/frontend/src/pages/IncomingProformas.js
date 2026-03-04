import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Plus, Edit2, Trash2, Eye, RefreshCw, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import api, { incomingProformaAPI } from '../services/api';

// ── Styled components ────────────────────────────────────────────────────────
const PageWrap = styled.div`padding: 16px 20px;`;
const TopBar = styled.div`display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;`;
const Title = styled.h2`margin:0;font-size:20px;font-weight:700;`;
const PrimaryButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:8px 14px;
  background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;
  &:hover{background:#2980b9;}
  &:disabled{background:#95a5a6;cursor:default;}
`;
const SecondaryButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
  background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;
  &:hover{background:#f3f4f6;}
`;
const DangerButton = styled.button`
  display:inline-flex;align-items:center;gap:6px;padding:6px 10px;
  background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;
  &:hover{background:#b91c1c;}
`;
const IconButton = styled.button`
  display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  border:none;border-radius:4px;background:#ecf0f1;color:#374151;cursor:pointer;
  &:hover{background:#d1d5db;}
`;
const TabBar = styled.div`display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:14px;`;
const Tab = styled.button`
  padding:8px 18px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:500;
  border-bottom:2px solid ${p=>p.$active?'#3498db':'transparent'};margin-bottom:-2px;
  color:${p=>p.$active?'#3498db':'#6b7280'};
  &:hover{color:#374151;}
`;
const SearchWrap = styled.div`position:relative;display:inline-flex;align-items:center;`;
const SearchInput = styled.input`padding:6px 10px 6px 30px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:200px;`;
const SearchIcon = styled.div`position:absolute;left:8px;color:#9ca3af;pointer-events:none;`;
const Table = styled.table`width:100%;border-collapse:collapse;font-size:13px;`;
const Th = styled.th`padding:8px 10px;text-align:left;background:#f8f9fa;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151;white-space:nowrap;`;
const Td = styled.td`
  padding:7px 10px;border-bottom:1px solid #f0f2f5;vertical-align:top;
  ${p=>p.$green?'background:#E6F7ED;':''}
  ${p=>p.$yellow?'background:#fffbeb;':''}
  ${p=>p.$purple?'background:#f5f3ff;':''}
`;
const TableRow = styled.tr`
  ${p=>p.$paid?'background:#E6F7ED;':''}
  ${p=>p.$invoiced?'background:#e0f2fe;':''}
`;
const StatusPill = styled.span`
  display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;
  ${p=>p.$v==='paid'?'background:#bbf7d0;color:#166534;':''}
  ${p=>p.$v==='unpaid'?'background:#fde8d8;color:#9a3412;':''}
  ${p=>p.$v==='invoiced'?'background:#bae6fd;color:#0c4a6e;':''}
`;
const SmallMuted = styled.div`font-size:11px;color:#6b7280;margin-top:2px;`;
const CompanySelect = styled.select`padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;min-width:220px;`;
const Modal = styled.div`position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;`;
const ModalBox = styled.div`background:#fff;border-radius:8px;padding:22px 24px;max-width:620px;width:100%;max-height:90vh;overflow-y:auto;`;
const FormRow = styled.div`display:grid;grid-template-columns:${p=>p.$cols||'1fr 1fr'};gap:12px;margin-bottom:12px;`;
const Label = styled.label`font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:3px;`;
const Input = styled.input`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;`;
const Select = styled.select`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;`;
const Textarea = styled.textarea`width:100%;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;`;

const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Kártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };

function formatMoney(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Edit/Create Modal ─────────────────────────────────────────────────────────
function ProformaModal({ open, companyId, initial, onClose, onSaved }) {
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [form, setForm] = useState({
    proforma_number: '', supplier_tax_number: '', supplier_name: '',
    issue_date: '', due_date: '', delivery_date: '', payment_method: 'TRANSFER',
    currency: 'HUF', net_amount: '', vat_amount: '', gross_amount: '', comment: '',
  });

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          proforma_number: initial.proforma_number || '',
          supplier_tax_number: initial.supplier_tax_number || '',
          supplier_name: initial.supplier_name || '',
          issue_date: initial.issue_date || '',
          due_date: initial.due_date || '',
          delivery_date: initial.delivery_date || '',
          payment_method: (initial.payment_method || 'TRANSFER').toUpperCase(),
          currency: (initial.currency || 'HUF').toUpperCase(),
          net_amount: initial.net_amount || '',
          vat_amount: initial.vat_amount || '',
          gross_amount: initial.gross_amount || '',
          comment: initial.comment || '',
        });
      } else {
        setForm({ proforma_number:'', supplier_tax_number:'', supplier_name:'', issue_date:'', due_date:'', delivery_date:'', payment_method:'TRANSFER', currency:'HUF', net_amount:'', vat_amount:'', gross_amount:'', comment:'' });
      }
    }
  }, [open, initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const parseFile = async (file) => {
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
    } catch (e) {
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
      if (initial?.id) {
        res = await incomingProformaAPI.update({ ...payload, id: initial.id });
      } else {
        res = await incomingProformaAPI.create(payload);
      }
      toast.success(initial?.id ? 'Díjbekérő frissítve' : 'Díjbekérő létrehozva');
      onSaved(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <Modal onClick={onClose}>
      <ModalBox onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0 }}>{initial?.id ? 'Díjbekérő szerkesztése' : 'Új Bejövő Díjbekérő'}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20 }}><X size={18}/></button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            {parsing ? 'OCR feldolgozás…' : '📎 OCR / Fájl beolvasás'}
          </SecondaryButton>
          <input ref={fileInputRef} type="file" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); e.target.value=''; }} />
        </div>
        <FormRow $cols="1fr">
          <div><Label>Díjbekérő száma *</Label><Input value={form.proforma_number} onChange={e=>set('proforma_number',e.target.value)} /></div>
        </FormRow>
        <FormRow>
          <div><Label>Szállító neve</Label><Input value={form.supplier_name} onChange={e=>set('supplier_name',e.target.value)} /></div>
          <div><Label>Szállító adószáma</Label><Input value={form.supplier_tax_number} onChange={e=>set('supplier_tax_number',e.target.value)} /></div>
        </FormRow>
        <FormRow $cols="1fr 1fr 1fr">
          <div><Label>Keltezés</Label><Input type="date" value={form.issue_date} onChange={e=>set('issue_date',e.target.value)} /></div>
          <div><Label>Esedékesség</Label><Input type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} /></div>
          <div><Label>Teljesítés</Label><Input type="date" value={form.delivery_date} onChange={e=>set('delivery_date',e.target.value)} /></div>
        </FormRow>
        <FormRow>
          <div><Label>Fizetési mód</Label>
            <Select value={form.payment_method} onChange={e=>set('payment_method',e.target.value)}>
              {Object.entries(PM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label>Deviza</Label>
            <Select value={form.currency} onChange={e=>set('currency',e.target.value)}>
              {['HUF','EUR','USD','GBP','CHF'].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </FormRow>
        <FormRow $cols="1fr 1fr 1fr">
          <div><Label>Nettó</Label><Input type="number" value={form.net_amount} onChange={e=>set('net_amount',e.target.value)} /></div>
          <div><Label>ÁFA</Label><Input type="number" value={form.vat_amount} onChange={e=>set('vat_amount',e.target.value)} /></div>
          <div><Label>Bruttó</Label><Input type="number" value={form.gross_amount} onChange={e=>set('gross_amount',e.target.value)} /></div>
        </FormRow>
        <FormRow $cols="1fr">
          <div><Label>Megjegyzés</Label><Textarea rows={2} value={form.comment} onChange={e=>set('comment',e.target.value)} /></div>
        </FormRow>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <SecondaryButton onClick={onClose}>Mégse</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving?'Mentés…':'Mentés'}</PrimaryButton>
        </div>
      </ModalBox>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IncomingProformas() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Load companies
  useEffect(() => {
    api.get('/api/companies/').then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.results || []);
      setCompanies(list);
      if (!companyId && list.length > 0) {
        setCompanyId(String(list[0].id));
        localStorage.setItem('selectedCompanyId', String(list[0].id));
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await incomingProformaAPI.list({
        company_id: companyId,
        status: statusTab === 'all' ? '' : statusTab,
        search,
        page,
        page_size: pageSize,
      });
      setItems(res.data?.results || []);
      setTotal(res.data?.count || 0);
    } catch (e) {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [companyId, statusTab, search, page]);

  useEffect(() => { setPage(1); }, [companyId, statusTab, search]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleDelete = async (row) => {
    if (!window.confirm(`Törlöd a(z) ${row.proforma_number} díjbekérőt?`)) return;
    try {
      await incomingProformaAPI.delete(companyId, row.id);
      toast.success('Törölve');
      loadItems();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Törlési hiba');
    }
  };

  const openEdit = row => { setEditTarget(row); setModalOpen(true); };
  const openNew = () => { setEditTarget(null); setModalOpen(true); };

  const onSaved = (saved) => {
    setModalOpen(false);
    if (saved?.id) {
      navigate(`/incoming-proformas/open?company_id=${encodeURIComponent(companyId)}&proforma_id=${encodeURIComponent(saved.id)}`);
    } else {
      loadItems();
    }
  };

  const tabCounts = { all: total };

  const statusColor = s => ({ unpaid: 'unpaid', paid: 'paid', invoiced: 'invoiced' }[s] || 'unpaid');

  return (
    <PageWrap>
      <TopBar>
        <Title>Bejövő Díjbekérők</Title>
        <CompanySelect
          value={companyId}
          onChange={e => { setCompanyId(e.target.value); localStorage.setItem('selectedCompanyId', e.target.value); }}
        >
          {companies.map(c => <option key={c.id} value={c.id}>{c.name || c.short_name}</option>)}
        </CompanySelect>
        <PrimaryButton onClick={openNew} disabled={!companyId}><Plus size={15}/>Új díjbekérő</PrimaryButton>
        <SecondaryButton onClick={loadItems} title="Frissítés"><RefreshCw size={14}/></SecondaryButton>
        <SearchWrap>
          <SearchIcon><Search size={13}/></SearchIcon>
          <SearchInput placeholder="Keresés…" value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button onClick={()=>setSearch('')} style={{position:'absolute',right:6,background:'none',border:'none',cursor:'pointer',color:'#9ca3af'}}><X size={12}/></button>}
        </SearchWrap>
      </TopBar>

      <TabBar>
        {[['all','Összes'], ['unpaid','Kifizetetlen'], ['paid','Kifizetett'], ['invoiced','Kiszámlázott']].map(([k,l]) => (
          <Tab key={k} $active={statusTab===k} onClick={()=>setStatusTab(k)}>{l}</Tab>
        ))}
      </TabBar>

      <div style={{ overflowX:'auto' }}>
        <Table>
          <thead>
            <tr>
              <Th>Díjbekérő szám</Th>
              <Th>Szállító</Th>
              <Th>Keltezés</Th>
              <Th>Esedékesség</Th>
              <Th style={{textAlign:'right'}}>Bruttó</Th>
              <Th>Deviza</Th>
              <Th>Fiz. mód</Th>
              <Th>Kapcsolódó számlák</Th>
              <Th>Maradék</Th>
              <Th>Státusz</Th>
              <Th>Műveletek</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{textAlign:'center',padding:24,color:'#9ca3af'}}>Betöltés…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={11} style={{textAlign:'center',padding:24,color:'#9ca3af'}}>Nincs találat</td></tr>
            ) : items.map(row => {
              const isPaid = row.status === 'paid';
              const isInvoiced = row.status === 'invoiced';
              const isCovered = row.is_fully_covered;
              const remaining = parseFloat(row.remaining_amount || 0);
              return (
                <TableRow key={row.id} $paid={isPaid && !isInvoiced} $invoiced={isInvoiced}>
                  <Td>
                    <button
                      onClick={()=>navigate(`/incoming-proformas/open?company_id=${encodeURIComponent(companyId)}&proforma_id=${encodeURIComponent(row.id)}`)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'#3498db',fontWeight:600,padding:0,textDecoration:'underline'}}
                    >{row.proforma_number}</button>
                  </Td>
                  <Td>
                    <div>{row.supplier_name || '—'}</div>
                    {row.supplier_tax_number && <SmallMuted>{row.supplier_tax_number}</SmallMuted>}
                  </Td>
                  <Td>{row.issue_date || '—'}</Td>
                  <Td>{row.due_date || '—'}</Td>
                  <Td style={{textAlign:'right',fontWeight:600}}>{formatMoney(row.gross_amount)}</Td>
                  <Td>{row.currency}</Td>
                  <Td>{PM_LABELS[row.payment_method] || row.payment_method || '—'}</Td>
                  <Td>
                    {(row.invoice_links || []).length === 0 ? (
                      <SmallMuted>—</SmallMuted>
                    ) : (row.invoice_links || []).map(lnk => (
                      <div key={lnk.id}>
                        <a
                          href={`/incoming-invoices/open?company_id=${encodeURIComponent(companyId)}&invoice_number=${encodeURIComponent(lnk.invoice_number)}&supplier_tax_number=${encodeURIComponent(lnk.supplier_tax_number||'')}`}
                          target="_blank" rel="noreferrer"
                          style={{fontSize:12,color:'#3498db'}}
                        >{lnk.invoice_number}</a>
                        <SmallMuted>{formatMoney(lnk.allocated_amount)} {lnk.currency}</SmallMuted>
                      </div>
                    ))}
                  </Td>
                  <Td>
                    {isCovered ? (
                      <StatusPill $v="invoiced">Teljesítve</StatusPill>
                    ) : remaining > 0 ? (
                      <span style={{color:'#b91c1c',fontWeight:600,fontSize:12}}>{formatMoney(remaining)} {row.currency}</span>
                    ) : '—'}
                  </Td>
                  <Td><StatusPill $v={statusColor(row.status)}>{STATUS_LABELS[row.status] || row.status}</StatusPill></Td>
                  <Td>
                    <div style={{display:'flex',gap:4}}>
                      <IconButton onClick={()=>navigate(`/incoming-proformas/open?company_id=${encodeURIComponent(companyId)}&proforma_id=${encodeURIComponent(row.id)}`)} title="Megnyitás">
                        <Eye size={14}/>
                      </IconButton>
                      <IconButton onClick={()=>openEdit(row)} title="Szerkesztés" style={{background:'#dbeafe',color:'#1d4ed8'}}>
                        <Edit2 size={14}/>
                      </IconButton>
                      <IconButton onClick={()=>handleDelete(row)} title="Törlés" style={{background:'#fee2e2',color:'#dc2626'}}>
                        <Trash2 size={14}/>
                      </IconButton>
                    </div>
                  </Td>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </div>

      {total > pageSize && (
        <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:14,alignItems:'center'}}>
          <SecondaryButton onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>← Előző</SecondaryButton>
          <span style={{fontSize:13,color:'#6b7280'}}>{page} / {Math.ceil(total/pageSize)}</span>
          <SecondaryButton onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/pageSize)}>Következő →</SecondaryButton>
        </div>
      )}

      <ProformaModal
        open={modalOpen}
        companyId={companyId}
        initial={editTarget}
        onClose={()=>setModalOpen(false)}
        onSaved={onSaved}
      />
    </PageWrap>
  );
}
