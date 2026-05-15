import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Plus, Edit2, Trash2, Eye, RefreshCw, Search, X, FolderOpen, PlusCircle, FileDown } from 'lucide-react';
import api, { companyBankAccountAPI, incomingProformaAPI } from '../services/api';

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
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
`;
const ModalContent = styled.div`
  background: white;
  width: 90%;
  max-width: 1000px;
  max-height: 85vh;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
`;
const ModalHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;
const ModalTitle = styled.div`
  font-weight: 600;
  color: #2c3e50;
`;
const CloseBtn = styled.button`
  border: none;
  background: #ecf0f1;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
`;
const ModalBody = styled.div`
  padding: 12px 16px;
  overflow: auto;
`;
const BatchActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #6c757d;
  color: white;
  font-size: 13px;
  &:hover { opacity: 0.85; }
`;
const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Kártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };

function formatMoney(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IncomingProformas() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [pendingCount, setPendingCount] = useState(0);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [batchCurrency, setBatchCurrency] = useState('HUF');
  const [batchBankAccount, setBatchBankAccount] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showBatches, setShowBatches] = useState(false);
  const [batchTab, setBatchTab] = useState('pending');
  const [pendingBatches, setPendingBatches] = useState([]);
  const [completedBatches, setCompletedBatches] = useState([]);
  const [editingBatch, setEditingBatch] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [batchItemSaving, setBatchItemSaving] = useState({});
  const [itemAmountDrafts, setItemAmountDrafts] = useState({});

  // Follow globally selected company from sidebar selector.
  useEffect(() => {
    const refreshCompany = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId') || '';
        setCompanyId((prev) => (prev === cid ? prev : cid));
      } catch {
        setCompanyId('');
      }
    };
    refreshCompany();
    window.addEventListener('companyChanged', refreshCompany);
    return () => window.removeEventListener('companyChanged', refreshCompany);
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

  const refreshPendingCount = useCallback(async () => {
    if (!companyId) {
      setPendingCount(0);
      return;
    }
    try {
      const res = await api.post('/api/payment-batches/pending-count/', { company_id: companyId });
      setPendingCount(res.data?.count || 0);
    } catch {
      setPendingCount(0);
    }
  }, [companyId]);

  useEffect(() => {
    setSelected(new Set());
    refreshPendingCount();
  }, [companyId, refreshPendingCount]);

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

  const openEdit = row => navigate(`/incoming-proformas/open?company_id=${encodeURIComponent(companyId)}&proforma_id=${encodeURIComponent(row.id)}`);
  const openNew = () => navigate(`/incoming-proformas/new?company_id=${encodeURIComponent(companyId)}`);

  const statusColor = s => ({ unpaid: 'unpaid', paid: 'paid', invoiced: 'invoiced' }[s] || 'unpaid');
  const selectedRows = items.filter(r => selected.has(r.id));
  const selectedCount = selectedRows.length;
  const selectedTotal = selectedRows.reduce((sum, r) => sum + Number(r?.gross_amount || 0), 0);
  const proformaAmountByKey = useMemo(() => {
    const map = new Map();
    (items || []).forEach((r) => {
      const inv = String(r?.proforma_number || '').trim();
      const tax = String(r?.supplier_tax_number || '').trim();
      if (!inv) return;
      map.set(`${inv}|${tax}`, Number(r?.gross_amount || 0));
      if (!tax) map.set(`${inv}|`, Number(r?.gross_amount || 0));
    });
    return map;
  }, [items]);

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const ids = items.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const fetchBatchLists = useCallback(async () => {
    if (!companyId) {
      setPendingBatches([]);
      setCompletedBatches([]);
      return;
    }
    try {
      const [pendingRes, completedRes] = await Promise.all([
        api.post('/api/payment-batches/list-pending/', { company_id: companyId }),
        api.post('/api/payment-batches/list-completed/', { company_id: companyId }),
      ]);
      setPendingBatches(pendingRes.data || []);
      setCompletedBatches(completedRes.data || []);
    } catch {
      toast.error('Csomagok lekérdezési hiba');
    }
  }, [companyId]);

  const openCreateBatchModal = async () => {
    if (!companyId) {
      toast.error('Válassz céget');
      return;
    }
    if (selectedCount === 0) {
      toast.info('Válassz díjbekérőket');
      return;
    }
    const validRows = selectedRows.filter(r => r?.proforma_number && Number(r?.gross_amount || 0) > 0);
    if (validRows.length === 0) {
      toast.error('A kijelölésben nincs csomagolható díjbekérő');
      return;
    }
    try {
      const [accRes, cntRes] = await Promise.all([
        companyBankAccountAPI.getAccounts({ company_id: companyId }),
        api.post('/api/payment-batches/pending-count/', { company_id: companyId }),
      ]);
      const accData = Array.isArray(accRes.data) ? accRes.data : (accRes.data?.results || []);
      setBankAccounts(accData);
      const primary = accData.find(a => a.is_primary) || accData[0];
      setBatchBankAccount(primary?.id || '');

      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const cnt = cntRes.data?.count || 0;
      setBatchName(`Díjbekérő csomag ${y}${m}${d}-${cnt + 1}`);

      setBatchCurrency(primary?.currency || validRows[0]?.currency || 'HUF');
      setShowCreateBatch(true);
    } catch {
      toast.error('Bankszámlák lekérdezési hiba');
    }
  };

  const createBatch = async () => {
    if (!companyId) {
      toast.error('Válassz céget');
      return;
    }
    if (!batchName.trim()) {
      toast.error('Adj meg csomagnevet');
      return;
    }
    const validRows = selectedRows.filter(r => r?.proforma_number && Number(r?.gross_amount || 0) > 0);
    if (validRows.length === 0) {
      toast.error('A kijelölésben nincs csomagolható díjbekérő');
      return;
    }
    setCreatingBatch(true);
    try {
      const itemsPayload = validRows.map(r => ({
        invoice_number: r.proforma_number,
        supplier_tax_number: r.supplier_tax_number,
        supplier_name: r.supplier_name,
        amount_gross: r.gross_amount,
        currency: r.currency || batchCurrency || 'HUF',
      }));

      if (editingBatch?.id) {
        setSavingEdit(true);
        await api.post(`/api/payment-batches/${editingBatch.id}/set-items/`, { items: itemsPayload });
        toast.success('Csomag módosítva');
      } else {
        const res = await api.post('/api/payment-batches/', {
          company: companyId,
          name: batchName.trim(),
          bank_account: batchBankAccount || null,
          currency: batchCurrency || 'HUF',
        });
        const batch = res.data;
        const addRes = await api.post(`/api/payment-batches/${batch.id}/add-items/`, { items: itemsPayload });
        toast.success(`Csomag létrehozva: ${addRes.data?.created || 0} tétel`);
      }

      setShowCreateBatch(false);
      setSelected(new Set());
      setEditingBatch(null);
      refreshPendingCount();
      fetchBatchLists();
      loadItems();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Csomag létrehozási hiba';
      toast.error(msg);
    } finally {
      setCreatingBatch(false);
      setSavingEdit(false);
    }
  };

  const startEditBatch = async (b) => {
    try {
      const res = await api.get(`/api/payment-batches/${b.id}/`);
      const fullBatch = res.data || b;
      const itemsInBatch = Array.isArray(fullBatch.items) ? fullBatch.items : [];
      const idSet = new Set();
      const byKey = new Map(
        (items || []).map(r => [
          `${String(r.proforma_number || '').trim()}|${String(r.supplier_tax_number || '').trim()}`,
          r.id,
        ])
      );

      itemsInBatch.forEach(it => {
        const key = `${String(it.invoice_number || '').trim()}|${String(it.supplier_tax_number || '').trim()}`;
        const fallbackKey = `${String(it.invoice_number || '').trim()}|`;
        const rowId = byKey.get(key) || byKey.get(fallbackKey);
        if (rowId) idSet.add(rowId);
      });

      setSelected(idSet);
      setEditingBatch(fullBatch);
      setBatchName(fullBatch.name || '');
      setBatchCurrency(fullBatch.currency || 'HUF');
      setBatchBankAccount(fullBatch.bank_account || '');
      setShowBatches(false);
      setShowCreateBatch(true);

      const missing = itemsInBatch.length - idSet.size;
      if (missing > 0) {
        toast.info(`A csomagból ${missing} tétel nincs az aktuális listában/szűrésben, ezért most nem látszik.`);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Csomag betöltési hiba';
      toast.error(msg);
    }
  };

  const openBatches = async () => {
    await fetchBatchLists();
    setBatchTab('pending');
    setShowBatches(true);
  };

  const exportBatchCsv = async (b) => {
    try {
      const res = await api.post(`/api/payment-batches/${b.id}/export/`);
      const rows = (res.data?.items || []).map(it => ({
        supplier_name: it.supplier_name || '',
        supplier_tax_number: it.supplier_tax_number || '',
        invoice_number: it.invoice_number || '',
        amount_gross: it.amount_gross,
        currency: it.currency || '',
      }));
      const header = ['supplier_name', 'supplier_tax_number', 'invoice_number', 'amount_gross', 'currency'];
      const csv = [header.join(';')]
        .concat(rows.map(r => header.map(h => String(r[h]).replaceAll(';', ',')).join(';')))
        .join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_batch_${(b.name || b.id)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export hiba');
    }
  };

  const exportBatchBankFile = async (b) => {
    try {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const params = {
        export_format: 'pain.001',
        execution_date: `${y}-${m}-${day}`,
        company_id: companyId,
      };
      const res = await api.get(`/api/payment-batches/${b.id}/bank-export/`, { responseType: 'blob', params });
      const blob = new Blob([res.data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_batch_${(b.name || b.id)}_pain.001.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Banki export elkészült');
      fetchBatchLists();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Banki export hiba';
      toast.error(msg);
    }
  };

  const markBatchPaid = async (b) => {
    try {
      const res = await api.post(`/api/payment-batches/${b.id}/mark-paid/`);
      toast.success(`Kifizetve jelölve: ${res.data?.updated || 0} tétel`);
      await fetchBatchLists();
      refreshPendingCount();
      loadItems();
    } catch {
      toast.error('Kifizetés jelölés hiba');
    }
  };

  const deleteBatch = async (b) => {
    if (!window.confirm(`Törlöd a(z) ${b.name} csomagot?`)) return;
    try {
      await api.delete(`/api/payment-batches/${b.id}/delete/`);
      toast.success('Csomag törölve');
      await fetchBatchLists();
      refreshPendingCount();
    } catch {
      toast.error('Törlési hiba');
    }
  };

  const saveBatchItemAmount = async (batchId, itemId, amount) => {
    if (amount === undefined || amount === null || amount === '') {
      toast.error('Adj meg összeget');
      return;
    }
    setBatchItemSaving(prev => ({ ...prev, [itemId]: true }));
    try {
      const res = await api.post(`/api/payment-batches/${batchId}/update-item/`, { item_id: itemId, amount_gross: amount });
      const updatedItem = res.data?.item;
      const patchList = (list) => (list || []).map((b) => {
        if (String(b.id) !== String(batchId)) return b;
        const updatedItems = (b.items || []).map((it) => String(it.id) === String(itemId)
          ? { ...it, ...(updatedItem || {}), amount_gross: updatedItem?.amount_gross ?? amount }
          : it);
        return { ...b, items: updatedItems, gross_total: res.data?.gross_total ?? b.gross_total };
      });
      setPendingBatches(prev => patchList(prev));
      setCompletedBatches(prev => patchList(prev));
      toast.success('Összeg mentve');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Összeg mentési hiba';
      toast.error(msg);
    } finally {
      setBatchItemSaving(prev => ({ ...prev, [itemId]: false }));
    }
  };

  return (
    <PageWrap>
      <TopBar>
        <Title>Bejövő Díjbekérők</Title>
        <PrimaryButton onClick={openNew} disabled={!companyId}><Plus size={15}/>Új díjbekérő</PrimaryButton>
        <SecondaryButton onClick={openBatches} disabled={!companyId} title="Fizetési csomagok">
          <FolderOpen size={14}/> Csomagok ({pendingCount})
        </SecondaryButton>
        <SecondaryButton
          onClick={openCreateBatchModal}
          disabled={!companyId || selectedCount === 0}
          title={selectedCount === 0 ? 'Jelölj ki díjbekérőket' : 'Fizetési csomag készítése'}
        >
          <PlusCircle size={14}/> Fizetési csomag ({selectedCount})
        </SecondaryButton>
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
              <Th>
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every(r => selected.has(r.id))}
                  onChange={toggleSelectAllVisible}
                  title="Oldal kijelölése"
                />
              </Th>
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
              <tr><td colSpan={12} style={{textAlign:'center',padding:24,color:'#9ca3af'}}>Betöltés…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={12} style={{textAlign:'center',padding:24,color:'#9ca3af'}}>Nincs találat</td></tr>
            ) : items.map(row => {
              const isPaid = row.status === 'paid';
              const isInvoiced = row.status === 'invoiced';
              const isCovered = row.is_fully_covered;
              const remaining = parseFloat(row.remaining_amount || 0);
              const isOverpaid = remaining < -0.005;
              return (
                <TableRow key={row.id} $paid={isPaid && !isInvoiced} $invoiced={isInvoiced}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      disabled={!row.proforma_number || Number(row.gross_amount || 0) <= 0}
                    />
                  </Td>
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
                    ) : isOverpaid ? (
                      <span style={{color:'#1d4ed8',fontWeight:600,fontSize:12}}>Túlfizetve: {formatMoney(Math.abs(remaining))} {row.currency}</span>
                    ) : remaining > 0.005 ? (
                      <span style={{color:'#b91c1c',fontWeight:600,fontSize:12}}>{formatMoney(remaining)} {row.currency}</span>
                    ) : '—'}
                  </Td>
                  <Td>
                    <StatusPill $v={statusColor(row.status)}>{STATUS_LABELS[row.status] || row.status}</StatusPill>
                    {row.payment_date && <SmallMuted>Rendezve: {row.payment_date}</SmallMuted>}
                  </Td>
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

      {showCreateBatch && (
        <ModalOverlay onClick={()=>setShowCreateBatch(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editingBatch ? `Csomag módosítása: ${editingBatch.name}` : `Új fizetési csomag (${selectedCount} tétel)`}</ModalTitle>
              <CloseBtn onClick={()=>setShowCreateBatch(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Csomag neve</label>
                <input value={batchName} onChange={e=>setBatchName(e.target.value)} style={{flex:1, padding:6}} />
              </div>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Bankszámla</label>
                <select value={batchBankAccount} onChange={e=>{
                  const id = e.target.value;
                  setBatchBankAccount(id);
                  const acc = (Array.isArray(bankAccounts) ? bankAccounts : []).find(a => String(a.id) === String(id));
                  if (acc && acc.currency) setBatchCurrency(acc.currency);
                }} style={{flex:1, padding:6}}>
                  <option value="">-- válassz --</option>
                  {(Array.isArray(bankAccounts) ? bankAccounts : []).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {(acc.bank_name ? acc.bank_name + ' - ' : '') + (acc.iban || acc.account_number || acc.display_name || '')}
                      {acc.currency ? ` (${acc.currency})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Pénznem</label>
                <input value={batchCurrency || 'HUF'} readOnly style={{width:120, padding:6}} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontWeight:600 }}>Tételek ({selectedRows.length})</div>
                </div>
                <div style={{ maxHeight: 280, overflow:'auto', border:'1px solid #ecf0f1', borderRadius:6 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:50 }}>#</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Szállító</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Bizonylatszám</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:80 }}>Deviza</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:150 }}>Bruttó összeg</th>
                        <th style={{ width: 40, borderBottom:'1px solid #eee' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding:10, textAlign:'center', color:'#7f8c8d' }}>Nincs megjeleníthető tétel.</td>
                        </tr>
                      ) : (
                        selectedRows.map((r, idx) => (
                          <tr key={r.id}>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{idx + 1}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.supplier_name || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.proforma_number || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.currency || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{formatMoney(r.gross_amount)} {r.currency || ''}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5', textAlign:'right' }}>
                              <IconButton
                                onClick={() => {
                                  setSelected(prev => {
                                    const next = new Set(prev);
                                    next.delete(r.id);
                                    return next;
                                  });
                                }}
                                style={{ background:'#e74c3c', padding:4, minWidth:24, height:24 }}
                                title="Törlés a csomagból"
                              >
                                <Trash2 size={14}/>
                              </IconButton>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, fontWeight:600 }}>
                  Összesen: {formatMoney(selectedTotal)} {batchCurrency || (selectedRows[0]?.currency || 'HUF')}
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
                <SecondaryButton onClick={()=>{ setShowCreateBatch(false); setEditingBatch(null); }}>Mégse</SecondaryButton>
                <PrimaryButton onClick={createBatch} disabled={creatingBatch || savingEdit}>
                  <PlusCircle size={16}/> {editingBatch ? (savingEdit ? 'Mentés...' : 'Csomag mentése') : (creatingBatch ? 'Létrehozás...' : 'Csomag létrehozása')}
                </PrimaryButton>
              </div>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {showBatches && (
        <ModalOverlay onClick={() => setShowBatches(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Fizetési csomagok</ModalTitle>
              <CloseBtn onClick={() => setShowBatches(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <SecondaryButton onClick={()=>setBatchTab('pending')} style={batchTab==='pending'? { background:'#dbeafe', color:'#0f172a' } : {}}>Függő ({pendingBatches.length})</SecondaryButton>
                <SecondaryButton onClick={()=>setBatchTab('completed')} style={batchTab==='completed'? { background:'#dbeafe', color:'#0f172a' } : {}}>Kifizetett ({completedBatches.length})</SecondaryButton>
                <SecondaryButton onClick={fetchBatchLists} title="Frissítés"><RefreshCw size={14}/> Frissítés</SecondaryButton>
              </div>
              {((batchTab==='pending'? pendingBatches : completedBatches) || []).length === 0 ? (
                <div>{batchTab==='pending' ? 'Nincs függő csomag.' : 'Nincs kifizetett csomag.'}</div>
              ) : (
                (batchTab==='pending' ? pendingBatches : completedBatches).map(b => {
                  const totalVal = b.gross_total ?? ((Array.isArray(b.items) ? b.items.reduce((acc, it)=> acc + Number(it.amount_gross || 0), 0) : null));
                  const totalText = totalVal != null ? `${formatMoney(totalVal)} ${b.currency || ''}` : '-';
                  return (
                    <div key={b.id} style={{ border:'1px solid #ecf0f1', borderRadius:8, padding:12, marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <div style={{ fontWeight:600 }}>{b.name}</div>
                          <SmallMuted>{b.bank_account_name || '-'} · {b.currency}</SmallMuted>
                          <SmallMuted>Létrehozva: {(b.created_at||'').replace('T',' ').slice(0,16)}</SmallMuted>
                          <SmallMuted>Bruttó összesen: {totalText}</SmallMuted>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <BatchActionButton onClick={()=>markBatchPaid(b)} title="Tételek kifizetve jelölése">
                            Kifizetve
                          </BatchActionButton>
                          {batchTab==='pending' && (
                            <BatchActionButton onClick={()=>startEditBatch(b)} title="Csomag módosítása">
                              <Edit2 size={16}/> Módosítás
                            </BatchActionButton>
                          )}
                          <BatchActionButton onClick={()=>exportBatchCsv(b)} title="Export CSV">
                            <FileDown size={16}/> Export
                          </BatchActionButton>
                          <BatchActionButton onClick={()=>exportBatchBankFile(b)} title="Banki export (SEPA XML)">
                            <FileDown size={16}/> Bank export
                          </BatchActionButton>
                          <BatchActionButton style={{ background:'#c0392b'}} onClick={()=>deleteBatch(b)} title="Törlés">
                            <Trash2 size={16}/> Törlés
                          </BatchActionButton>
                        </div>
                      </div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontWeight:600, marginBottom:6 }}>Tételek</div>
                        {(b.items && b.items.length > 0) ? (
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>#</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Szállító</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Bizonylat szám</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Bankszámla (export)</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Bruttó összeg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.items.map((it, idx) => (
                                <tr key={it.id} style={!it.export_account ? { background:'#fff4e5' } : undefined}>
                                  <td style={{padding:6}}>{idx+1}</td>
                                  <td style={{padding:6}}>{it.supplier_name || '-'}</td>
                                  <td style={{padding:6}}>{it.invoice_number}</td>
                                  <td style={{padding:6}}>
                                    {it.export_account || (
                                      <span style={{ color:'#c0392b', fontWeight:600 }}>Hiányzik</span>
                                    )}
                                  </td>
                                  <td style={{padding:6}}>
                                    {batchTab === 'pending' ? (
                                      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                                        <input
                                          style={{ padding:6, width:120 }}
                                          value={itemAmountDrafts[it.id] ?? it.amount_gross ?? ''}
                                          onChange={(e)=>setItemAmountDrafts(prev => ({ ...prev, [it.id]: e.target.value }))}
                                          type="number"
                                          step="0.01"
                                        />
                                        <SecondaryButton onClick={()=>saveBatchItemAmount(b.id, it.id, itemAmountDrafts[it.id] ?? it.amount_gross)} disabled={!!batchItemSaving[it.id]}>
                                          {batchItemSaving[it.id] ? 'Mentés…' : 'Mentés'}
                                        </SecondaryButton>
                                        {(() => {
                                          const keyExact = `${String(it.invoice_number || '').trim()}|${String(it.supplier_tax_number || '').trim()}`;
                                          const keyFallback = `${String(it.invoice_number || '').trim()}|`;
                                          const expected = proformaAmountByKey.get(keyExact) ?? proformaAmountByKey.get(keyFallback);
                                          const current = Number(it.amount_gross || 0);
                                          if (expected === undefined || Number.isNaN(current)) return null;
                                          const diff = current - Number(expected || 0);
                                          if (diff > 0.005) {
                                            return <SmallMuted style={{ color:'#1d4ed8', fontWeight:600 }}>Túlfizetve: {formatMoney(diff)}</SmallMuted>;
                                          }
                                          if (diff < -0.005) {
                                            return <SmallMuted style={{ color:'#b91c1c', fontWeight:600 }}>Nincs kifizetve: {formatMoney(Math.abs(diff))}</SmallMuted>;
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    ) : (
                                      <div>{formatMoney(it.amount_gross)} {it.currency || b.currency || ''}</div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <SmallMuted>Nincs tétel.</SmallMuted>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

    </PageWrap>
  );
}
