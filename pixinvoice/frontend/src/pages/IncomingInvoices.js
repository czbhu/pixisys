import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { Eye, RefreshCw, CheckSquare, Square, PlusCircle, FolderOpen, Trash2, FileDown, X, Save, Edit2, Upload, Image as ImageIcon, RotateCcw, Calendar, Banknote, PenLine, CreditCard, FileText, ListChecks } from 'lucide-react';
import { Pagination, Spin } from 'antd';
import { toast } from 'react-toastify';
import api, { incomingDocsAPI, invoiceAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../print.css';

const InvoicesContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const InvoicesHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;

  @media (max-width: 768px) {
    padding: 12px;
    gap: 10px;
  }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;

  @media (max-width: 768px) {
    font-size: 20px;
    width: 100%;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 34px;
  background-color: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover { background-color: #1d4ed8; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const TableContainer = styled.div`
  overflow-x: auto;

  @media (max-width: 768px) {
    overflow-x: hidden;
  }
`;

const EditInfoBar = styled.div`
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff9e6;
  border-bottom: 1px solid #ffebb3;
  color: #5c4b00;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    table-layout: fixed;
  }
`;

const TableHeader = styled.thead`
  background-color: #f8f9fa;
`;

const TableHeaderCell = styled.th`
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    white-space: normal;
    word-break: break-word;
  }
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover { background-color: #f8f9fa; }
  ${props => props.$paid ? 'background: #E6F7ED;' : ''}
  ${props => (!props.$paid && props.$unpaid) ? 'background: #f3e8ff;' : ''}
  ${props => props.$selected ? 'background: rgb(214,230,211);' : ''}
`;

const TableCell = styled.td`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    white-space: normal;
    word-break: break-word;
  }
`;

const MainActionsCell = styled(TableCell)`
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileActionsRow = styled.tr`
  display: none;

  @media (max-width: 768px) {
    display: ${props => (props.$open ? 'table-row' : 'none')};
  }
`;

const MobileActionsCell = styled.td`
  display: none;

  @media (max-width: 768px) {
    display: table-cell;
    padding: 8px;
    border-bottom: 1px solid #ecf0f1;
    background: #fff;
  }
`;

const MobileActionsBar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const SmallMuted = styled.div`
  color: #6c757d;
  font-size: 12px;
  margin-top: 4px;
`;

const StatusPill = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 12px;
  margin-top: 4px;
  background: ${props => props.variant === 'paid' ? '#e6f7ed' : '#fff4e5'};
  color: ${props => props.variant === 'paid' ? '#1e824c' : '#ad5f00'};
  border: 1px solid ${props => props.variant === 'paid' ? '#bfe8d0' : '#ffd8a8'};
`;

const InlineActionBadge = styled.button`
  display: inline-flex;
  align-items: center;
  border: 1px solid #f1c40f;
  background: #fff8d6;
  color: #7d6608;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #fff1b5;
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
    gap: 6px;
    align-items: stretch;
  }
`;

const SearchInput = styled.input`
  padding: 0 10px;
  height: 34px;
  min-width: 260px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  transition: border-color 0.15s, box-shadow 0.15s;

  &::placeholder { color: #9ca3af; }
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
  }

  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
  }
`;

const FilterSelect = styled.select`
  appearance: none;
  -webkit-appearance: none;
  padding: 0 32px 0 10px;
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background-color: #fff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
  }
  &:hover:not(:focus) { border-color: #9ca3af; }
`;

const CheckboxBtn = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  color: #2c3e50;
`;

const IconButton = styled.button`
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
  &:hover { opacity: 0.85; }
`;



const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 34px;
  background-color: #f9fafb;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  &:hover:not(:disabled) { background-color: #f3f4f6; border-color: #9ca3af; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const ToolbarRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;

    > * {
      width: 100%;
    }
  }
`;

const RefreshButton = styled(PrimaryButton)`
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

// Simple modal for inline XML viewing
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
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



const PaymentHistoryModal = ({ companyId, onClose, visible }) => {
  const [tab, setTab] = useState('batches'); // batches | statements
  const [batches, setBatches] = useState([]);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'batches') {
        const res = await api.get('/api/payment-batches/', { params: { company: companyId } });
        setBatches(res.data?.results || res.data || []);
      } else {
        const res = await api.get('/api/bank-statements/', { params: { company: companyId } });
        setStatements(res.data?.results || res.data || []);
      }
    } catch (e) {
      toast.error('Adatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [tab, companyId]);

  useEffect(() => {
    if (!visible || !companyId) return;
    loadData();
  }, [visible, companyId, loadData]);

  if (!visible) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()} style={{ width: '80vw', maxWidth: 1200 }}>
        <ModalHeader>
          <ModalTitle>Kifizetések és Bankkivonatok</ModalTitle>
          <CloseBtn onClick={onClose}><X size={18} /></CloseBtn>
        </ModalHeader>
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '0 16px' }}>
          <button 
             onClick={() => setTab('batches')} 
             style={{ padding: '12px 16px', border: 'none', background: 'transparent', borderBottom: tab==='batches'?'2px solid #3498db':'none', fontWeight: tab==='batches'?'600':'400', cursor: 'pointer' }}
          >
            Utalási csomagok
          </button>
          <button 
             onClick={() => setTab('statements')} 
             style={{ padding: '12px 16px', border: 'none', background: 'transparent', borderBottom: tab==='statements'?'2px solid #3498db':'none', fontWeight: tab==='statements'?'600':'400', cursor: 'pointer' }}
          >
            Bankkivonatok
          </button>
        </div>
        <ModalBody>
           {loading ? <div style={{textAlign:'center', padding:20}}><Spin /></div> : (
             tab === 'batches' ? (
               <div style={{overflow:'auto'}}>
               <Table>
                 <thead>
                   <tr>
                     <TableHeaderCell style={{padding:8}}>Név</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Státusz</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Tételek</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Deviza</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Létrehozva</TableHeaderCell>
                   </tr>
                 </thead>
                 <tbody>
                   {batches.map(b => (
                     <tr key={b.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                       <td style={{padding:8}}>{b.name}</td>
                       <td style={{padding:8}}>
                         <StatusPill variant={b.status==='EXPORTED'?'paid':'unpaid'}>{b.status === 'EXPORTED' ? 'Exportálva' : 'Függő'}</StatusPill>
                       </td>
                       <td style={{padding:8}}>{b.items?.length || b.item_count || 0}</td>
                       <td style={{padding:8}}>{b.currency}</td>
                       <td style={{padding:8}}>{b.created_at?.substring(0,10)}</td>
                     </tr>
                   ))}
                 </tbody>
               </Table>
               </div>
             ) : (
                <div style={{overflow:'auto'}}>
               <Table>
                 <thead>
                   <tr>
                     <TableHeaderCell style={{padding:8}}>Kivonat</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Dátum</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Számla</TableHeaderCell>
                     <TableHeaderCell style={{padding:8}}>Tételek</TableHeaderCell>
                   </tr>
                 </thead>
                 <tbody>
                   {statements.map(s => (
                     <tr key={s.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                       <td style={{padding:8}}>{s.sequence_number}</td>
                       <td style={{padding:8}}>{s.statement_date}</td>
                       <td style={{padding:8}}>{s.bank_account_label || s.account_label || ''}</td>
                       <td style={{padding:8}}>{Array.isArray(s.items) ? s.items.length : (s.items_count || '-')}</td>
                     </tr>
                   ))}
                 </tbody>
               </Table>
               </div>
             )
           )}
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
};

export default function IncomingInvoices({ externalOutgoing = false }) {
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(window.location.search);
  const isSelectorMode = queryParams.get('mode') === 'select';
  const preselectIdsRaw = (queryParams.get('preselect_ids') || '').trim();
  const requestedPageSize = Number(queryParams.get('page_size') || 50);
  const preselectIds = React.useMemo(
    () => new Set(
      preselectIdsRaw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
    [preselectIdsRaw]
  );
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateDraftFrom, setDateDraftFrom] = useState(null);
  const [dateDraftTo, setDateDraftTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    Number.isFinite(requestedPageSize) && requestedPageSize > 0 ? requestedPageSize : 50
  );
  const [totalItems, setTotalItems] = useState(0);
  const [, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | unpaid | paid | due
  const [paymentFilter, setPaymentFilter] = useState([]); // ['TRANSFER','CASH',...]
  const [paymentListMode, setPaymentListMode] = useState('manual'); // manual | bank
  const [manualOnly, setManualOnly] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState('all'); // all | approved | unapproved
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [amountDraftFrom, setAmountDraftFrom] = useState('');
  const [amountDraftTo, setAmountDraftTo] = useState('');
  const [xmlOpen, setXmlOpen] = useState(false);
  const [xmlLoading] = useState(false);
  const [xmlError] = useState('');
  const [xmlText] = useState('');
  const [xmlTitle] = useState('');
  const [parsed, setParsed] = useState(null);
  // Attachments modal state
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachFor, setAttachFor] = useState(null); // { invoiceNumber, supplierTaxNumber }
  const [attachList, setAttachList] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('IMAGE'); // IMAGE | OTHER
  const fileInputRef = useRef(null);
  const lastAutoRefreshCompany = useRef(null);
  // Selection & batch state
  const [selected, setSelected] = useState(() => new Map());
  const [allowAllPaymentTypesForBatch, setAllowAllPaymentTypesForBatch] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showBatches, setShowBatches] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [batchBankAccount, setBatchBankAccount] = useState('');
  const [batchName, setBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [pendingBatches, setPendingBatches] = useState([]);
  const [completedBatches, setCompletedBatches] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [batchCurrency, setBatchCurrency] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [editableAfterSave, setEditableAfterSave] = useState({});
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [preselectApplied, setPreselectApplied] = useState(false);
  const [batchTab, setBatchTab] = useState('pending');
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchItemSaving, setBatchItemSaving] = useState({});
  const [itemAmountDrafts, setItemAmountDrafts] = useState({});
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const searchTimer = useRef(null);
  const headerSelectRef = useRef(null);
  const paymentDetailsRef = useRef(null);
  const [approvalSaving, setApprovalSaving] = useState({});
  const [czBackfillLoading, setCzBackfillLoading] = useState(false);
  const [mobileActionsRowKey, setMobileActionsRowKey] = useState(null);
  const pageTitle = externalOutgoing ? 'Kimenő számlák (külső)' : 'Bejövő számlák';
  const backfillSeriesLabel = externalOutgoing ? 'PP' : 'CZ';
  const refreshToastLabel = externalOutgoing ? 'Új külső kimenő számlák frissítve' : 'Új bejövő számlák frissítve';
  const formatDate = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const applyRange = (from, to, opts = {}) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
    setItems([]);
    setHasMore(true);
    const doBackfill = opts.backfillAll || (!!from && !!to);
    fetchDigest(1, { replace: true, refresh: opts.refresh ? 1 : 0, backfillAll: doBackfill });
  };

  const presetRange = (key) => {
    const today = new Date();
    const todayStr = formatDate(today);
    const daysAgo = (n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return formatDate(d);
    };
    if (key === 'today') return { from: todayStr, to: todayStr, opts: { refresh: 1 } };
    if (key === 'last7') return { from: daysAgo(6), to: todayStr, opts: { refresh: 1 } };
    if (key === 'last30') return { from: daysAgo(29), to: todayStr, opts: { refresh: 1 } };
    if (key === 'last365') return { from: daysAgo(364), to: todayStr, opts: { refresh: 1, backfillAll: 1 } };
    if (key === 'prevMonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: formatDate(first), to: formatDate(last), opts: { refresh: 1, backfillAll: 1 } };
    }
    if (key === 'clear') return { from: null, to: null, opts: { refresh: 0 } };
    return null;
  };

  const applyPreset = (key, { closeModal = false } = {}) => {
    const preset = presetRange(key);
    if (!preset) return;
    setDateDraftFrom(preset.from);
    setDateDraftTo(preset.to);
    applyRange(preset.from, preset.to, preset.opts || {});
    if (closeModal) setShowDateModal(false);
  };

  const { allowedMenus, user } = useAuth();
  const allowAllMenus = !allowedMenus || allowedMenus.length === 0;
  const isSuperuser = !!user?.is_superuser;
  const canApproveInvoices = !!(
    isSuperuser ||
    allowAllMenus ||
    (allowedMenus && (
      allowedMenus.includes('incoming_invoices_approve') ||
      allowedMenus.includes('settings_roles') ||
      allowedMenus.includes('settings_users') ||
      allowedMenus.includes('settings')
    ))
  );
  const canSkipApprovalForBatch = !!(
    isSuperuser ||
    allowAllMenus ||
    (allowedMenus && allowedMenus.includes('payment_batch_without_approval'))
  );

  useEffect(() => {
    const handler = (e) => {
      if (paymentDetailsRef.current && !paymentDetailsRef.current.contains(e.target)) {
        paymentDetailsRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setCompanyId(prev => (cid && prev !== cid ? cid : prev));
      } catch {}
    };
    sync();
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const id = setInterval(sync, 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, []);

  // Reset page and items when filters change
  useEffect(() => { 
    setPage(1); 
    setItems([]); 
    setHasMore(true); 
    // Only clear selection if company changes, otherwise persist selection across filters/search
    // setSelected(new Set()); 
  }, [statusFilter, paymentFilter, approvalFilter, dateFrom, dateTo, amountFrom, amountTo, manualOnly]);

  // Clear selection explicitly when companyId changes
  useEffect(() => {
    setSelected(new Map());
    setPage(1); 
    setItems([]); 
    setHasMore(true);
  }, [companyId]);

  // Poll pending batch count lightly when company changes
  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      try {
        const res = await api.post('/api/payment-batches/pending-count/', { company_id: companyId });
        setPendingCount(res.data?.count || 0);
      } catch (_) { setPendingCount(0); }
    };
    load();
  }, [companyId]);

  // Auto-refresh on open per company: avoid duplicate triggers (StrictMode)
  useEffect(() => {
    if (!companyId) return;
    if (lastAutoRefreshCompany.current === companyId) return;
    lastAutoRefreshCompany.current = companyId;
    // Load cached list first to avoid long initial waits; manual refresh button still triggers NAV sync
    fetchDigest(1, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (preselectApplied || preselectIds.size === 0 || !Array.isArray(items) || items.length === 0) return;
    const next = new Map();
    (items || []).forEach((row) => {
      if (preselectIds.has(String(row?.id || ''))) {
        next.set(`${row?.invoiceNumber || ''}|${row?.supplierTaxNumber || ''}`, row);
      }
    });
    if (next.size > 0) {
      setSelected(next);
    }
    setPreselectApplied(true);
  }, [items, preselectApplied, preselectIds]);

  const fetchDigest = async (pageArg, opts = {}) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    const replace = true; // Always replace in pagination mode
    const doRefresh = opts.refresh ? 1 : 0;
    setLoading(true);
    setErrorMsg('');
    try {
      const targetPage = pageArg || page || 1;
      const baseParams = {
        company_id: companyId,
        external_outgoing: externalOutgoing ? 1 : undefined,
        manual_only: (!externalOutgoing && manualOnly) ? 1 : undefined,
        date_from: dateFrom,
        date_to: dateTo,
        page_size: pageSize,
        refresh: doRefresh,
        backfill_all: opts.backfillAll ? 1 : undefined,
        search: (searchText||'').trim() || undefined,
        status: (paymentListMode === 'manual' && statusFilter!=='all') ? statusFilter : undefined,
        payment_method: externalOutgoing ? undefined : ((paymentFilter && paymentFilter.length) ? paymentFilter.join(',') : undefined),
        approval: externalOutgoing ? undefined : (approvalFilter==='all'? undefined : approvalFilter),
        amount_from: externalOutgoing ? undefined : (amountFrom || undefined),
        amount_to: externalOutgoing ? undefined : (amountTo || undefined),
      };

      const res = await api.get('/api/invoices/incoming/', { params: { ...baseParams, page: targetPage } });
      const data = res.data || {};
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
        setPage(data.page || targetPage || 1);
        setTotalItems(data.totalItems || 0); // Use backend provided totalItems, or 0
        // Fallback for older backend if totalItems is missing but pageCount is present
        if (!data.totalItems && data.items.length > 0 && data.pageCount) {
             // Heuristic: if items < pageSize and this is last page, we can guess
             // But simpler to just rely on pageCount for display if needed, but Antd needs total.
             // If totalItems is missing, we might see 0 items. 
             // We can try to approximate: (pageCount - 1) * pageSize + items.length 
             // if we are on the last page.
             // But best is to rely on backend update.
             if (data.page === data.pageCount) {
                 setTotalItems((data.pageCount - 1) * pageSize + data.items.length);
             } else {
                 setTotalItems(data.pageCount * pageSize); // Approximate
             }
        }
        
        setHasMore(!!data.hasMore);
        if (data.refreshError) {
          toast.error(data.refreshError);
        }
        if (replace && data.refreshed) {
          const cnt = typeof data.upserted === 'number' ? data.upserted : data.items.length;
          if (cnt > 0) toast.success(`${refreshToastLabel} (${cnt})`);
          else toast.info('nincs új számla', { toastId: 'incoming-no-new' });
        }
      } else {
        setItems([]);
        const msg = data.error || 'NAV lekérdezési hiba';
        setErrorMsg(msg);
        toast.error(msg);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'NAV lekérdezési hiba';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const runCzBackfill = async () => {
    if (!externalOutgoing) return;
    if (!companyId) { toast.error('Válassz céget'); return; }

    const defaultPrefix = `${backfillSeriesLabel} ${new Date().getFullYear()}/`;
    const prefixInput = window.prompt('Előtag (pl. CZ 2025/ vagy PP 2026/):', defaultPrefix);
    if (prefixInput === null) return;
    const fromInput = window.prompt('Kezdő sorszám:', '1');
    if (fromInput === null) return;
    const toInput = window.prompt('Végsorszám:', '637');
    if (toInput === null) return;

    const prefixMatch = String(prefixInput || '').trim().match(/^([A-Za-z]+)\s*(\d{4})\s*\/?$/);
    if (!prefixMatch) {
      toast.error('Hibás előtag formátum. Példa: PP 2026/');
      return;
    }

    const prefix = String(prefixMatch[1] || '').toUpperCase();
    const year = Number(prefixMatch[2]);
    const fromSeq = Number(fromInput);
    const toSeq = Number(toInput);
    if (!Number.isFinite(year) || !Number.isFinite(fromSeq) || !Number.isFinite(toSeq) || fromSeq < 1 || toSeq < fromSeq) {
      toast.error('Érvénytelen tartomány.');
      return;
    }

    setCzBackfillLoading(true);
    try {
      const res = await api.post('/api/invoices/incoming/external-cz-backfill/', {
        company_id: companyId,
        prefix,
        year,
        from_seq: fromSeq,
        to_seq: toSeq,
      });
      const data = res?.data || {};
      const msg = `Számla pótlás kész (${prefix} ${year}/): létrehozva ${data.created_count || 0}, frissítve ${data.updated_count || 0}, hiányzik ${data.missing_after_count || 0}`;
      if ((data.missing_after_count || 0) > 0) {
        toast.warn(msg);
      } else {
        toast.success(msg);
      }
      fetchDigest(1, { replace: true });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Számla pótlás hiba';
      toast.error(msg);
    } finally {
      setCzBackfillLoading(false);
    }
  };

  // Debounced search to keep quick search responsive
  useEffect(() => {
    if (!companyId) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1); setHasMore(true);
      fetchDigest(1, { replace: true });
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, companyId, statusFilter, paymentFilter, approvalFilter, dateFrom, dateTo, pageSize, amountFrom, amountTo, paymentListMode, externalOutgoing, manualOnly]);




  const openXmlInNewTab = async (invoiceNumber, supplierTaxNumber) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    const targetUrl = `/incoming-invoices/open?company_id=${encodeURIComponent(companyId || '')}&invoice_number=${encodeURIComponent(invoiceNumber || '')}${supplierTaxNumber ? `&supplier_tax_number=${encodeURIComponent(supplierTaxNumber)}` : ''}${externalOutgoing ? '&external_outgoing=1' : ''}`;
    const opened = window.open(targetUrl, '_blank');
    if (!opened) {
      toast.error('A böngésző blokkolta az új lap megnyitását.');
    }
  };

  const openSupplierCreateFromInvoice = (row) => {
    const params = new URLSearchParams();
    params.set('return', '/incoming-invoices');
    if (row?.supplierName) params.set('prefill_name', String(row.supplierName));
    if (row?.supplierTaxNumber) params.set('prefill_tax_number', String(row.supplierTaxNumber));
    if (row?.supplierNavBankAccount) params.set('prefill_bank_account', String(row.supplierNavBankAccount));
    if (row?.invoiceNumber) params.set('prefill_invoice_number', String(row.invoiceNumber));
    if (companyId) params.set('source_company_id', String(companyId));
    if (row?.invoiceNumber) params.set('source_invoice_number', String(row.invoiceNumber));
    if (row?.supplierTaxNumber) params.set('source_supplier_tax_number', String(row.supplierTaxNumber));
    const targetUrl = `/customers/new?${params.toString()}`;
    const opened = window.open(targetUrl, '_blank');
    if (!opened) {
      toast.error('A böngésző blokkolta az új lap megnyitását.');
    }
  };

  const openSupplierEditForNewBank = (row) => {
    const customerId = row?.supplierCustomerId;
    if (!customerId) {
      toast.error('A CRM beszállító nem található.');
      return;
    }
    const params = new URLSearchParams();
    params.set('return', '/incoming-invoices');
    if (row?.supplierNavBankAccount) params.set('prefill_bank_account', String(row.supplierNavBankAccount));
    if (row?.invoiceNumber) params.set('prefill_invoice_number', String(row.invoiceNumber));
    const targetUrl = `/customers/${encodeURIComponent(String(customerId))}/edit?${params.toString()}`;
    const opened = window.open(targetUrl, '_blank');
    if (!opened) {
      toast.error('A böngésző blokkolta az új lap megnyitását.');
    }
  };

  const isManualIncomingRow = (row) => {
    if (row?.isManual === true) return true;
    const op = String(row?.invoiceOperation || '').toUpperCase();
    const tx = String(row?.transactionId || '');
    return op === 'MANUAL' || tx.startsWith('MANUAL-');
  };

  const openManualEdit = (row) => {
    if (!row?.id) return;
    navigate(`/incoming-invoices/new?edit_manual_id=${encodeURIComponent(String(row.id))}`);
  };

  const deleteManualIncoming = async (row) => {
    if (!companyId || !row?.id) return;
    const ok = window.confirm(`Biztosan törlöd a kézzel felvitt számlát?\n${row.invoiceNumber || ''}`);
    if (!ok) return;
    try {
      await invoiceAPI.deleteIncomingManual(companyId, row.id);
      toast.success('Kézzel felvitt számla törölve');
      fetchDigest(1, { replace: true });
    } catch (e) {
      const msg = e?.response?.data?.error || 'Törlési hiba';
      toast.error(msg);
    }
  };

  const openAttachments = async (invoiceNumber, supplierTaxNumber) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    setAttachFor({ invoiceNumber, supplierTaxNumber });
    setAttachOpen(true);
    setAttachLoading(true);
    try {
      const res = await incomingDocsAPI.list({ company_id: companyId, invoice_number: invoiceNumber, supplier_tax_number: supplierTaxNumber });
      const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setAttachList(rows);
    } catch (e) { toast.error('Csatolmányok lekérdezési hiba'); }
    finally { setAttachLoading(false); }
  };

  const doUpload = async (file) => {
    if (!file || !attachFor) return;
    setUploading(true);
    try {
      await incomingDocsAPI.upload({
        company_id: companyId,
        invoice_number: attachFor.invoiceNumber,
        supplier_tax_number: attachFor.supplierTaxNumber,
        type: uploadType,
        file,
      });
      const res = await incomingDocsAPI.list({ company_id: companyId, invoice_number: attachFor.invoiceNumber, supplier_tax_number: attachFor.supplierTaxNumber });
      const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setAttachList(rows);
      toast.success('Feltöltve');
    } catch (e) {
      toast.error('Feltöltési hiba');
    } finally { setUploading(false); }
  };

  const onDropFiles = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    for (const f of files) { await doUpload(f); }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) await doUpload(f);
    e.target.value = '';
  };

  const deleteDoc = async (doc) => {
    try { await incomingDocsAPI.delete(doc.id); setAttachList(prev => prev.filter(x => x.id !== doc.id)); toast.success('Törölve'); }
    catch (e) { toast.error('Törlési hiba'); }
  };

  const saveComment = async (doc, comment) => {
    try { await incomingDocsAPI.setComment(doc.id, comment); toast.success('Megjegyzés mentve'); }
    catch (e) { toast.error('Megjegyzés mentési hiba'); }
  };

  const parseIncomingXmlForPrint = React.useCallback((xmlRaw) => {
    try {
      if (!xmlRaw) return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlRaw, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return null;

      const firstText = (name) => {
        const els = doc.getElementsByTagNameNS('*', name);
        return els && els[0] && els[0].textContent ? els[0].textContent.trim() : '';
      };
      const all = (name, root) => Array.from((root || doc).getElementsByTagNameNS('*', name));
      const textFrom = (root, name) => {
        const els = all(name, root);
        return els[0]?.textContent?.trim() || '';
      };
      const number = (s) => {
        if (!s) return null;
        const n = Number(String(s).replace(/\u00A0|\s/g, '').replace(',', '.'));
        return isNaN(n) ? null : n;
      };

      const invoiceNumber = firstText('invoiceNumber') || firstText('fulfillmentDocumentNumber');
      const issueDate = firstText('invoiceIssueDate') || firstText('issueDate');
      const deliveryDate = firstText('invoiceDeliveryDate') || firstText('fulfillmentDate');
      const paymentDate = firstText('paymentDate') || firstText('dueDate');
      const paymentMethod = firstText('paymentMethod');
      const currency = firstText('invoiceCurrencyCode') || firstText('invoiceCurrency') || firstText('currencyCode') || firstText('currency');
      const exchangeRate = firstText('exchangeRate');
      const invoiceCategory = firstText('invoiceCategory');
      const invoiceOperation = firstText('invoiceOperation');
      const invoiceAppearance = firstText('invoiceAppearance');
      const originalInvoiceNumber = firstText('originalInvoiceNumber');
      const modificationIndex = firstText('modificationIndex');

      const supplierInfo = doc.getElementsByTagNameNS('*', 'supplierInfo')[0] || doc;
      const customerInfo = doc.getElementsByTagNameNS('*', 'customerInfo')[0] || doc;
      const supplierName = textFrom(supplierInfo, 'supplierName') || firstText('supplierName');
      const supplierTax = textFrom(supplierInfo, 'supplierTaxNumber') || firstText('supplierTaxNumber');
      const supplierBankAccounts = Array.from(doc.getElementsByTagNameNS('*', 'supplierBankAccountNumber'))
        .concat(Array.from(doc.getElementsByTagNameNS('*', 'bankAccountNumber')))
        .map(el => (el.textContent || '').trim())
        .filter((v, i, a) => v && a.indexOf(v) === i);
      const customerName = textFrom(customerInfo, 'customerName') || firstText('customerName');
      const customerTax = textFrom(customerInfo, 'customerTaxNumber') || firstText('customerTaxNumber');

      const addressToLines = (addrRoot) => {
        if (!addrRoot) return [];
        const parts = [
          textFrom(addrRoot, 'postalCode'),
          textFrom(addrRoot, 'city'),
          [textFrom(addrRoot, 'streetName'), textFrom(addrRoot, 'publicPlaceCategory'), textFrom(addrRoot, 'number')].filter(Boolean).join(' '),
        ].filter(Boolean);
        const country = textFrom(addrRoot, 'countryCode');
        if (country) parts.push(country);
        return parts;
      };
      const supplierAddr = doc.getElementsByTagNameNS('*', 'supplierAddress')[0] || doc.getElementsByTagNameNS('*', 'supplierAddressList')[0];
      const customerAddr = doc.getElementsByTagNameNS('*', 'customerAddress')[0] || doc.getElementsByTagNameNS('*', 'customerAddressList')[0];
      const supplierAddressLines = addressToLines(supplierAddr);
      const customerAddressLines = addressToLines(customerAddr);

      const lines = [];
      all('line').forEach((ln) => {
        const description = textFrom(ln, 'lineDescription') || textFrom(ln, 'productName') || '';
        const lineNumber = textFrom(ln, 'lineNumber') || '';
        const productCodes = Array.from(ln.getElementsByTagNameNS('*', 'productCode')).map((pc) => {
          const cat = textFrom(pc, 'productCodeCategory') || textFrom(pc, 'productCodeCategoryOwn');
          const val = textFrom(pc, 'productCodeValue');
          return [cat, val].filter(Boolean).join(':');
        }).filter(Boolean);
        const qty = number(textFrom(ln, 'quantity')) || number(textFrom(ln, 'lineQuantity'));
        const unit = textFrom(ln, 'unitOfMeasure') || textFrom(ln, 'unitOfMeasureOwn') || '';
        let unitPrice = number(textFrom(ln, 'unitPrice')) || number(textFrom(ln, 'unitPriceHUF')) || null;
        if (unitPrice == null) {
          const up = ln.getElementsByTagNameNS('*', 'unitPrice')[0] || ln.getElementsByTagNameNS('*', 'lineUnitPrice')[0];
          if (up) unitPrice = number(up.textContent);
        }
        const vatPct = number(textFrom(ln, 'vatPercentage'));
        let net = number(textFrom(ln, 'lineNetAmount')) || number(textFrom(ln, 'netAmount'));
        let vat = number(textFrom(ln, 'lineVatAmount')) || number(textFrom(ln, 'vatAmount'));
        let gross = number(textFrom(ln, 'lineGrossAmount')) || number(textFrom(ln, 'grossAmount'));
        if (net == null) {
          const amt = ln.getElementsByTagNameNS('*', 'lineNetAmountData')[0];
          if (amt) net = number(textFrom(amt, 'netAmount'));
        }
        if (gross == null) {
          const amt = ln.getElementsByTagNameNS('*', 'lineGrossAmountData')[0];
          if (amt) gross = number(textFrom(ln, 'lineGrossAmount')) || number(textFrom(amt, 'grossAmount'));
        }
        lines.push({ description, lineNumber, productCodes, qty, unit, unitPrice, net, vat, gross, vatPct });
      });

      let totalNet = number(firstText('invoiceNetAmount')) || null;
      let totalVat = number(firstText('invoiceVatAmount')) || null;
      let totalGross = number(firstText('invoiceGrossAmount')) || null;
      let totalNetHUF = number(firstText('invoiceNetAmountHUF')) || null;
      let totalVatHUF = number(firstText('invoiceVatAmountHUF')) || null;
      let totalGrossHUF = number(firstText('invoiceGrossAmountHUF')) || null;
      if (totalNet == null || totalVat == null || totalGross == null) {
        totalNet = 0; totalVat = 0; totalGross = 0;
        lines.forEach((l) => {
          totalNet += l.net || 0;
          totalVat += l.vat || 0;
          totalGross += l.gross || ((l.net || 0) + (l.vat || 0));
        });
      }

      const vatSummary = Array.from(doc.getElementsByTagNameNS('*', 'summaryByVatRate')).map((gr) => {
        const ratePct = number(textFrom(gr, 'vatPercentage'));
        const label = ratePct != null ? `${ratePct}%` : (textFrom(gr, 'vatExemption') || textFrom(gr, 'domesticReverseCharge') || 'Különböző');
        const net = number(textFrom(gr, 'vatRateNetAmount')) || number(textFrom(gr, 'netAmount'));
        const vat = number(textFrom(gr, 'vatRateVatAmount')) || number(textFrom(gr, 'vatAmount'));
        const gross = number(textFrom(gr, 'vatRateGrossAmount')) || number(textFrom(gr, 'grossAmount'));
        return { label, net, vat, gross };
      });

      return {
        invoiceNumber,
        issueDate,
        deliveryDate,
        paymentDate,
        paymentMethod,
        currency,
        exchangeRate,
        category: invoiceCategory,
        operation: invoiceOperation,
        appearance: invoiceAppearance,
        originalInvoiceNumber,
        modificationIndex,
        supplier: { name: supplierName, taxNumber: supplierTax, addressLines: supplierAddressLines, bankAccounts: supplierBankAccounts },
        customer: { name: customerName, taxNumber: customerTax, addressLines: customerAddressLines },
        lines,
        vatSummary,
        totals: { net: totalNet, vat: totalVat, gross: totalGross },
        totalsHUF: { net: totalNetHUF, vat: totalVatHUF, gross: totalGrossHUF },
      };
    } catch (_) {
      return null;
    }
  }, []);

  // Parse NAV XML into a printable data structure
  useEffect(() => {
    if (!xmlText) { setParsed(null); return; }
    setParsed(parseIncomingXmlForPrint(xmlText));
  }, [xmlText, parseIncomingXmlForPrint]);

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const rowKey = (row) => `${row.invoiceNumber||''}|${row.supplierTaxNumber||''}`;
  const isRowApproved = (row) => row?.isApproved === true || row?.isApproved === 1 || row?.isApproved === '1';
  const canSelect = (row) => {
    const paymentMethod = String(row.paymentMethod || '').toUpperCase();
    const isTransfer = paymentMethod === 'TRANSFER';
    if (row.inPaymentBatch) return false;
    if (!allowAllPaymentTypesForBatch && !isTransfer) return false;
    // Jóváhagyás csak átutalásnál szükséges
    if (!isTransfer) return true;
    if (isSuperuser || allowAllMenus || canSkipApprovalForBatch) return true;
    return isRowApproved(row);
  };
  const toggleSelect = (row, idx, event) => {
    if (!canSelect(row)) return;
    const key = rowKey(row);
    const isShift = !!event?.shiftKey;
    setSelected(prev => {
      const next = new Map(prev);
      if (isShift && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, idx);
        const end = Math.max(lastSelectedIndex, idx);
        for (let i = start; i <= end; i++) {
          const r = items[i];
          if (r && canSelect(r)) next.set(rowKey(r), r);
        }
      } else {
        if (next.has(key)) next.delete(key); else next.set(key, row);
      }
      return next;
    });
    setLastSelectedIndex(idx);
  };

  const selectedRows = Array.from(selected.values());
  const selectedCount = selectedRows.length;
  const selectedCurrencies = Array.from(new Set(selectedRows.map(r => r.currency).filter(Boolean)));
  const selectedCurrency = (selectedRows[0]?.currency) || '';
  const effectiveBatchCurrency = batchCurrency || selectedCurrencies[0] || 'HUF';
  const selectedRowsForBatch = selectedRows.filter(r => {
    if (!effectiveBatchCurrency || !r.currency || r.currency === effectiveBatchCurrency) {
      return true;
    }
    // If batch is HUF and invoice has HUF amounts available, include it
    if (effectiveBatchCurrency === 'HUF' && r.netAmountHUF && r.vatAmountHUF) {
      return true;
    }
    return false;
  });
  const excludedForBatch = selectedRows.length - selectedRowsForBatch.length;
  const selectedTotal = selectedRowsForBatch.reduce((sum, r) => sum + Number(r.grossAmount || 0), 0);
  const selectionSummary = selectedRows.reduce((acc, r) => {
    const cur = r.currency || 'HUF';
    if (!acc[cur]) acc[cur] = { net: 0, vat: 0, gross: 0 };
    acc[cur].net   += Number(r.netAmount   || 0);
    acc[cur].vat   += Number(r.vatAmount   || 0);
    acc[cur].gross += Number(r.grossAmount || 0);
    return acc;
  }, {});

  const isVisibleByBankStatus = (row) => {
    if (paymentListMode !== 'bank' || statusFilter === 'all') return true;
    const gross = Number(row.grossAmount || 0);
    const paid = Number(row.bankPaidAmount || 0);
    const tol = 0.005;
    const isPaidByBank = paid > tol && (gross - paid) <= tol;
    const isUnpaidByBank = paid <= tol;
    if (statusFilter === 'paid') return isPaidByBank;
    if (statusFilter === 'unpaid') return isUnpaidByBank;
    if (statusFilter === 'due') return !isPaidByBank;
    return true;
  };

  const isVisibleRow = (row) => {
    if (!isVisibleByBankStatus(row)) return false;
    if (manualOnly && !isManualIncomingRow(row)) return false;
    return true;
  };

  const toggleHeaderSelection = () => {
    if (selectedCount > 0) {
      setSelected(new Map());
      return;
    }
    const next = new Map();
    (items || [])
      .filter(isVisibleRow)
      .forEach((row) => {
        if (canSelect(row)) next.set(rowKey(row), row);
      });
    setSelected(next);
  };

  const visibleSelectableRows = (items || []).filter(isVisibleRow).filter(canSelect);
  const selectedVisibleCount = visibleSelectableRows.filter((row) => selected.has(rowKey(row))).length;
  const allVisibleSelected = visibleSelectableRows.length > 0 && selectedVisibleCount === visibleSelectableRows.length;

  useEffect(() => {
    if (!headerSelectRef.current) return;
    headerSelectRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }, [selectedVisibleCount, allVisibleSelected]);

  const isMobileViewport = () => {
    try {
      return window.matchMedia('(max-width: 768px)').matches;
    } catch {
      return false;
    }
  };

  const toggleMobileActionsForRow = React.useCallback((key) => {
    setMobileActionsRowKey((prev) => (prev === key ? null : key));
  }, []);

  const handleRowTouchTap = React.useCallback((event, key) => {
    if (!isMobileViewport()) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input,button,a,label,select,textarea,[role="button"]')) {
      return;
    }
    event.preventDefault();
    toggleMobileActionsForRow(key);
  }, [toggleMobileActionsForRow]);

  const handleRowContextMenu = React.useCallback((event, key) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    toggleMobileActionsForRow(key);
  }, [toggleMobileActionsForRow]);

  const exportSelectedCsv = () => {
    if (!selectedRows.length) {
      toast.info('Nincs kijelölt tétel');
      return;
    }
    const headers = [
      externalOutgoing ? 'ugyfel' : 'kibocsato',
      'adoszam',
      'szamlaszam',
      'kibocsatas_datum',
      'teljesites_datum',
      'esedekesseg',
      'deviza',
      'netto',
      'afa',
      'brutto',
      'fizetesi_mod',
      'tipus',
    ];
    const escapeCell = (value) => {
      const str = value == null ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = selectedRows.map((row) => {
      const rowType = externalOutgoing ? 'Kimenő számlák (külső)' : 'Bejövő számlák';
      return [
        row.supplierName || '',
        row.supplierTaxNumber || '',
        row.invoiceNumber || '',
        row.invoiceIssueDate || '',
        row.invoiceDeliveryDate || '',
        row.dueDate || '',
        row.currency || '',
        row.netAmount ?? '',
        row.vatAmount ?? '',
        row.grossAmount ?? '',
        row.paymentMethod || '',
        rowType,
      ];
    });
    const csv = [headers, ...rows].map(cols => cols.map(escapeCell).join(';')).join('\n');
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = externalOutgoing ? 'kijelolt_kulso_kimeno_szamlak' : 'kijelolt_bejovo_szamlak';
    a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`CSV export elkészült (${selectedRows.length} tétel)`);
  };

  useEffect(() => {
    if (allowAllPaymentTypesForBatch) return;
    setSelected(prev => {
      const next = new Map();
      prev.forEach((row, key) => {
        if (canSelect(row)) next.set(key, row);
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowAllPaymentTypesForBatch]);

  const needsPaymentMethod = (row) => {
    const pm = String(row.paymentMethod || '').trim().toUpperCase();
    return !pm || pm === 'OTHER' || pm === '-';
  };

  const formatPaymentMethod = (pm) => {
    const val = String(pm || '').trim().toUpperCase();
    switch (val) {
      case 'OTHER': return 'Egyéb';
      case 'UTANVET': return 'Utánvét';
      case 'TRANSFER': return 'Átutalás';
      case 'CASH': return 'Készpénz';
      case 'CARD': return 'Kártya';
      case 'VOUCHER': return 'Utalvány';
      default: return pm || '-';
    }
  };

  const isPaymentEditable = (row) => {
    const pm = String(row.paymentMethod || '').trim().toUpperCase();
    return !pm || pm === 'OTHER' || pm === '-';
  };

  const formatMoney = (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    if (Number.isNaN(num)) return val;
    return num.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const savePaymentMethod = async (row) => {
    const key = rowKey(row);
    const draft = paymentDrafts[key];
    if (!draft) { toast.error('Válassz fizetési módot'); return; }
    if (!companyId) { toast.error('Válassz céget'); return; }
    try {
      const pm = draft;
      await api.post('/api/invoices/incoming/set_payment_method/', {
        company_id: companyId,
        invoice_number: row.invoiceNumber,
        supplier_tax_number: row.supplierTaxNumber,
        external_outgoing: externalOutgoing ? 1 : undefined,
        payment_method: pm,
      });
      setItems(prev => prev.map(r => (rowKey(r) === key ? { ...r, paymentMethod: pm } : r)));
      setEditableAfterSave(prev => ({ ...prev, [key]: true }));
      toast.success('Fizetési mód mentve');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Mentési hiba';
      toast.error(msg);
    }
  };

  const resetPaymentMethod = async (row) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    try {
      await api.post('/api/invoices/incoming/set_payment_method/', {
        company_id: companyId,
        invoice_number: row.invoiceNumber,
        supplier_tax_number: row.supplierTaxNumber,
        external_outgoing: externalOutgoing ? 1 : undefined,
        payment_method: 'OTHER',
      });
      const key = rowKey(row);
      setItems(prev => prev.map(r => (rowKey(r) === key ? { ...r, paymentMethod: 'OTHER' } : r)));
      setPaymentDrafts(prev => ({ ...prev, [key]: 'OTHER' }));
      setEditableAfterSave(prev => ({ ...prev, [key]: false }));
      toast.success('Fizetési mód visszaállítva');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Visszaállítási hiba';
      toast.error(msg);
    }
  };

  const toggleApproval = async (row) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (!canApproveInvoices) { toast.error('Nincs jogosultság a jóváhagyáshoz'); return; }
    const key = rowKey(row);
    const currentApproved = isRowApproved(row);
    const nextVal = !currentApproved;
    setApprovalSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await api.post('/api/invoices/incoming/set_approval/', {
        company_id: companyId,
        invoice_number: row.invoiceNumber,
        supplier_tax_number: row.supplierTaxNumber,
        external_outgoing: externalOutgoing ? 1 : undefined,
        approved: nextVal,
      });
      const data = res.data || {};
      setItems(prev => prev.map(r => (rowKey(r) === key ? {
        ...r,
        isApproved: data.is_approved ?? nextVal,
        approvedAt: data.approved_at || null,
        approvedBy: data.approved_by_name || null,
      } : r)));
      if (!nextVal) {
        setSelected(prev => {
          const copy = new Map(prev);
          copy.delete(key);
          return copy;
        });
      }
      toast.success(nextVal ? 'Jóváhagyva' : 'Jóváhagyás visszavonva');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Jóváhagyási hiba';
      toast.error(msg);
    } finally {
      setApprovalSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const fetchBatchLists = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    setBatchesLoading(true);
    try {
      const [pendingRes, completedRes] = await Promise.all([
        api.post('/api/payment-batches/list-pending/', { company_id: companyId }),
        api.post('/api/payment-batches/list-completed/', { company_id: companyId })
      ]);
      setPendingBatches(pendingRes.data || []);
      setCompletedBatches(completedRes.data || []);
      setPendingCount(pendingRes.data?.length || 0);
    } catch (e) {
      toast.error('Csomagok lekérdezési hiba');
    } finally {
      setBatchesLoading(false);
    }
  };

  const openCreateBatchModal = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (selectedCount === 0) {
      toast.info(allowAllPaymentTypesForBatch ? 'Válassz számlákat' : 'Válassz átutalásos számlákat');
      return;
    }
    try {
      const [accRes, cntRes] = await Promise.all([
        api.get('/api/company-bank-accounts/', { params: { company_id: companyId } }),
        api.post('/api/payment-batches/pending-count/', { company_id: companyId })
      ]);
      const accData = Array.isArray(accRes.data) ? accRes.data : (accRes.data?.results || []);
      setBankAccounts(accData);
      const cnt = cntRes.data?.count || 0;
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth()+1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      setBatchName(`Fizetési csomag ${y}${m}${d}-${cnt+1}`);
      // Preselect primary bank account if any
      try {
        const primary = accData.find(a => a.is_primary) || accData[0];
        if (primary) setBatchBankAccount(primary.id);
        // Determine batch currency: by bank account currency if available, else from first selected invoice
        const cur = (primary && primary.currency) || selectedCurrency || 'HUF';
        setBatchCurrency(cur);
      } catch {}
      setShowCreateBatch(true);
    } catch (e) {
      toast.error('Bankszámlák lekérdezési hiba');
    }
  };

  const createBatch = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (!batchName) { toast.error('Adj meg egy csomagnév-et'); return; }
    const currency = effectiveBatchCurrency || 'HUF';
    setCreatingBatch(true);
    try {
      const res = await api.post('/api/payment-batches/', { company: companyId, name: batchName, bank_account: batchBankAccount || null, currency });
      const batch = res.data;
      const itemsPayload = selectedRowsForBatch.map(r => {
        // If batch is HUF and invoice has HUF amount, use that; otherwise use original
        let amountToUse = r.grossAmount;
        let currencyToUse = r.currency;
        if (currency === 'HUF' && r.currency !== 'HUF' && r.netAmountHUF && r.vatAmountHUF) {
          amountToUse = Number(r.netAmountHUF) + Number(r.vatAmountHUF);
          currencyToUse = 'HUF';
        }
        return {
          invoice_number: r.invoiceNumber,
          supplier_tax_number: r.supplierTaxNumber,
          supplier_name: r.supplierName,
          amount_gross: amountToUse,
          currency: currencyToUse,
        };
      });
      const addRes = await api.post(`/api/payment-batches/${batch.id}/add-items/`, { items: itemsPayload });
      const cr = addRes.data || {};
      toast.success(`Csomag létrehozva: ${cr.created} tétel${excludedForBatch? `, kihagyva: ${excludedForBatch}`:''}`);
      setShowCreateBatch(false);
      setSelected(new Map());
      // refresh pending count
      try { const pc = await api.post('/api/payment-batches/pending-count/', { company_id: companyId }); setPendingCount(pc.data?.count || 0); } catch {}
    } catch (e) {
      const resp = e?.response?.data || {};
      const msg = resp.error || e?.message || 'Csomag létrehozási hiba';
      if (Array.isArray(resp.not_approved) && resp.not_approved.length) {
        toast.error(`${msg}: jóváhagyás szükséges (${resp.not_approved.join(', ')})`);
      } else {
        toast.error(msg);
      }
    } finally {
      setCreatingBatch(false);
    }
  };

  const openBatches = () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    setBatchTab('pending');
    setShowBatches(true);
    fetchBatchLists();
  };

  const deleteBatch = async (id) => {
    try {
      await api.delete(`/api/payment-batches/${id}/delete/`);
      toast.success('Csomag törölve');
      await fetchBatchLists();
      try { const pc = await api.get('/api/payment-batches/pending-count', { params: { company_id: companyId } }); setPendingCount(pc.data?.count || 0); } catch {}
      // Refresh invoices table to update payment status
      fetchDigest(page || 1, { replace: true });
    } catch (e) { toast.error('Törlési hiba'); }
  };

  const exportBatch = async (id, name) => {
    try {
      const res = await api.post(`/api/payment-batches/${id}/export/`);
      const rows = (res.data?.items || []).map(it => ({
        supplier_name: it.supplier_name || '',
        supplier_tax_number: it.supplier_tax_number || '',
        invoice_number: it.invoice_number || '',
        amount_gross: it.amount_gross,
        currency: it.currency || '',
      }));
      const header = ['supplier_name','supplier_tax_number','invoice_number','amount_gross','currency'];
      const csv = [header.join(';')].concat(rows.map(r => header.map(h => String(r[h]).replaceAll(';', ',')).join(';'))).join('\n');
      const blob = new Blob(["\ufeff"+csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_batch_${(name||id)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error('Export hiba'); }
  };

  const parseExportError = async (err) => {
    const resp = err?.response;
    if (!resp) return {};
    const data = resp.data;
    // Axios with responseType 'blob' gives Blob on both success and error; try to parse
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          return { error: text };
        }
      } catch (e) {
        return {};
      }
    }
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch (e) { return { error: data }; }
    }
    return data || {};
  };

  const exportBatchBankFile = async (b, opts = {}) => {
    try {
      const execDate = new Date();
      const y = execDate.getFullYear();
      const m = String(execDate.getMonth()+1).padStart(2, '0');
      const d = String(execDate.getDate()).padStart(2, '0');
      let res;
      const params = { format: 'pain.001', execution_date: `${y}-${m}-${d}`, company_id: companyId };
      if (opts.skipMissing) {
        params.skip_missing = '1';
      }
      try {
        res = await api.get(`/api/payment-batches/${b.id}/bank-export/`, { responseType: 'blob', params });
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404 || status === 405) {
          res = await api.post(`/api/payment-batches/${b.id}/bank-export/`, params, { responseType: 'blob' });
        } else {
          throw err;
        }
      }
      const blob = new Blob([res.data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_batch_${(b.name||b.id)}_pain.001.xml`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      const skippedInfo = res?.headers?.['x-missing-accounts'];
      if (skippedInfo) {
        let skippedList = [];
        try { skippedList = JSON.parse(skippedInfo); } catch { skippedList = String(skippedInfo || '').split(',').filter(Boolean); }
        const label = Array.isArray(skippedList) && skippedList.length ? ` (kihagyva: ${skippedList.length} tétel)` : '';
        toast.warn(`Banki export elkészült${label}, hiányzó bankszámlaszámok miatt néhány tétel kimaradt.`);
      } else {
        toast.success('Banki export elkészült');
      }
      try { await fetchBatchLists(); } catch {}
    } catch (e) {
      const parsed = await parseExportError(e);
      const resp = parsed || {};
      if (resp?.missing?.length) {
        const details = resp.missing.map(m => `${m.supplier || 'Partner'} (${m.supplier_tax_number || 'n/a'}) - ${m.invoice_number || 'számla'}`).join('\n');
        if (!opts.skipMissing) {
          const proceed = window.confirm(`Hiányzó bankszámlaszámok:\n${details}\n\nKihagyjuk ezeket és exportáljuk a többit?`);
          if (proceed) {
            return exportBatchBankFile(b, { skipMissing: true });
          }
          toast.info('Export megszakítva hiányzó bankszámlaszám miatt');
          return;
        }
      }
      const msg = resp?.error || parsed?.error || e?.message || 'Banki export hiba';
      toast.error(msg);
    }
  };

  const markBatchPaid = async (b) => {
    try {
      const res = await api.post(`/api/payment-batches/${b.id}/mark-paid/`);
      const n = res.data?.updated || 0;
      toast.success(`Kifizetve jelölve: ${n} tétel`);
      // Refresh batches list and current digest view to reflect paymentDate
      try {
        await fetchBatchLists();
        try { const pc = await api.post('/api/payment-batches/pending-count/', { company_id: companyId }); setPendingCount(pc.data?.count || 0); } catch {}
      } catch {}
      // Soft refresh first page to update payment pills quickly
      fetchDigest(1, { replace: true });
    } catch (e) {
      toast.error('Kifizetés jelölés hiba');
    }
  };

  const saveBatchItemAmount = async (batchId, itemId, amount) => {
    if (!amount && amount !== 0) { toast.error('Adj meg összeget'); return; }
    setBatchItemSaving(prev => ({ ...prev, [itemId]: true }));
    try {
      const res = await api.post(`/api/payment-batches/${batchId}/update-item/`, { item_id: itemId, amount_gross: amount });
      const updateList = (listSetter) => {
        listSetter(prev => (prev || []).map(b => {
          if (String(b.id) !== String(batchId)) return b;
          const updatedItems = (b.items || []).map(it => String(it.id) === String(itemId) ? { ...it, amount_gross: res.data?.item?.amount_gross } : it);
          return { ...b, items: updatedItems, gross_total: res.data?.gross_total ?? b.gross_total };
        }));
      };
      updateList(setPendingBatches);
      updateList(setCompletedBatches);
      toast.success('Összeg frissítve');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Mentési hiba';
      toast.error(msg);
    } finally {
      setBatchItemSaving(prev => ({ ...prev, [itemId]: false }));
    }
  };

  // Edit mode state
  const [editingBatch, setEditingBatch] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditBatch = async (batch) => {
    try {
      // Load batch items
      const res = await api.get(`/api/payment-batches/${batch.id}/`);
      const b = res.data || batch;
      setEditingBatch(b);
      // Preselect rows based on current items (by invoice_number + supplier_tax_number)
      const newMap = new Map();
      (b.items||[]).forEach(it => {
         const key = `${it.invoice_number||''}|${it.supplier_tax_number||''}`;
         newMap.set(key, {
             invoiceNumber: it.invoice_number,
             supplierTaxNumber: it.supplier_tax_number,
             supplierName: it.supplier_name,
             grossAmount: it.amount_gross,
             currency: it.currency,
         });
      });
      setSelected(newMap);
      // Close batches modal to return to main list
      setShowBatches(false);
      toast.info('Csomag módosítás: jelöld a tételeket, majd mentsd.');
    } catch (e) {
      toast.error('Csomag betöltési hiba');
    }
  };

  const saveEditBatch = async () => {
    if (!editingBatch) return;
    setSavingEdit(true);
    try {
      const batchCurrency = editingBatch.currency || '';
      const itemsPayload = selectedRows.map(r => {
        // If batch is HUF and invoice has HUF amount, use that; otherwise use original
        let amountToUse = r.grossAmount;
        let currencyToUse = r.currency;
        if (batchCurrency === 'HUF' && r.currency !== 'HUF' && r.netAmountHUF && r.vatAmountHUF) {
          amountToUse = Number(r.netAmountHUF) + Number(r.vatAmountHUF);
          currencyToUse = 'HUF';
        }
        return {
          invoice_number: r.invoiceNumber,
          supplier_tax_number: r.supplierTaxNumber,
          supplier_name: r.supplierName,
          amount_gross: amountToUse,
          currency: currencyToUse,
        };
      });
      await api.post(`/api/payment-batches/${editingBatch.id}/set-items/`, { items: itemsPayload });
      toast.success('Csomag mentve');
      setEditingBatch(null);
      // Refresh pending list and digest table (to update pills)
      try {
        const list = await api.post('/api/payment-batches/list-pending/', { company_id: companyId });
        setPendingBatches(list.data || []);
      } catch {}
      fetchDigest(1, { replace: true });
    } catch (e) {
      const resp = e?.response?.data || {};
      const msg = resp.error || 'Mentési hiba';
      if (Array.isArray(resp.not_approved) && resp.not_approved.length) {
        toast.error(`${msg}: jóváhagyás szükséges (${resp.not_approved.join(', ')})`);
      } else {
        toast.error(msg);
      }
    } finally { setSavingEdit(false); }
  };

  const cancelEditBatch = () => { setEditingBatch(null); };

  const antPagination = (
    <div style={{ padding: '16px 24px', background: 'white', borderTop: '1px solid #ecf0f1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div style={{ marginRight: 'auto', fontSize: 13, color: '#7f8c8d' }}>
        Összesen {totalItems} tétel
      </div>
      <Pagination
        simple={false}
        current={page}
        pageSize={pageSize}
        total={totalItems}
        showSizeChanger
        onChange={(p, size) => { setPage(p); setPageSize(size); fetchDigest(p, { replace: true }); }}
        onShowSizeChange={(current, size) => { setPageSize(size); setPage(1); fetchDigest(1, { replace: true }); }}
        pageSizeOptions={['20', '50', '100', '200']}
        showTotal={(total, range) => `${range[0]}-${range[1]} / ${total} számla`}
      />
    </div>
  );

  const handleSelectInvoice = (row) => {
    // Post message to parent
    const msg = {
      type: 'INVOICE_SELECTED',
      payload: {
        invoiceNumber: row.invoiceNumber,
        supplierTaxNumber: row.supplierTaxNumber,
        supplierName: row.supplierName,
        netAmount: row.netAmount,
        grossAmount: row.grossAmount,
        currency: row.currency,
        invoiceIssueDate: row.invoiceIssueDate,
        items: row.items || []
      }
    };
    window.parent.postMessage(msg, '*');
  };

  const editingMissingExportCount = (editingBatch?.items || []).filter(it => !it.export_account).length;

  return (
    <InvoicesContainer>
      <InvoicesHeader>
        <Title>{pageTitle}</Title>
        <Toolbar>
          <ToolbarRow>
            <SearchInput
              value={searchText}
              onChange={(e)=>{ setSearchText(e.target.value); }}
              onKeyDown={(e)=>{ if (e.key==='Enter') fetchDigest(1, { replace: true }); }}
              placeholder={externalOutgoing ? 'Keresés számlaszám, ügyfél vagy adószám alapján...' : 'Gyorskereső (számla, név, adószám)'}
            />
            <FilterSelect value={statusFilter} onChange={(e)=>{ setStatusFilter(e.target.value); }}>
              <option value="all">{externalOutgoing ? 'Összes státusz' : 'Mind'}</option>
              <option value="unpaid">Kifizetetlen</option>
              <option value="paid">Kifizetett</option>
              <option value="due">Esedékes</option>
            </FilterSelect>
            {!externalOutgoing && (
              <details ref={paymentDetailsRef} style={{ position: 'relative' }}>
                <summary style={{ listStyle: 'none', cursor: 'pointer', padding:'0 32px 0 10px', border:'1px solid #d1d5db', borderRadius:6, minWidth: 200, height:34, display:'flex', alignItems:'center', fontSize:14, color:'#374151', background:'#fff', backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")", backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', userSelect:'none' }}>
                  {paymentFilter.length ? `Fizetési mód (${paymentFilter.length})` : 'Összes fizetési mód'}
                </summary>
                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:20, background:'#fff', border:'1px solid #d1d5db', borderRadius:8, padding:10, minWidth:230, boxShadow:'0 8px 24px rgba(0,0,0,0.12)' }}>
                  {[
                    ['TRANSFER','Átutalás'],
                    ['CASH','Készpénz'],
                    ['CARD','Kártya'],
                    ['VOUCHER','Utalvány'],
                    ['UTANVET','Utánvét'],
                    ['OTHER','Egyéb'],
                    ['UNKNOWN','Ismeretlen'],
                  ].map(([code, label]) => (
                    <label key={code} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer' }}>
                      <input
                        type="checkbox"
                        checked={paymentFilter.includes(code)}
                        onChange={(e)=>{
                          setPaymentFilter(prev => {
                            if (e.target.checked) return Array.from(new Set([...(prev||[]), code]));
                            return (prev||[]).filter(x => x !== code);
                          });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                    <SecondaryButton onClick={()=>setPaymentFilter([])} style={{ fontSize:12, padding:'4px 8px' }}>Összes</SecondaryButton>
                  </div>
                </div>
              </details>
            )}
            {!externalOutgoing && (
              <FilterSelect value={approvalFilter} onChange={(e)=>{ setApprovalFilter(e.target.value); }}>
                <option value="all">Összes jóváhagyás</option>
                <option value="approved">Csak jóváhagyott</option>
                <option value="unapproved">Csak nem jóváhagyott</option>
              </FilterSelect>
            )}
          </ToolbarRow>
          <SecondaryButton
            onClick={()=>{ setDateDraftFrom(dateFrom); setDateDraftTo(dateTo); setShowDateModal(true); }}
            title={dateFrom || dateTo ? `${dateFrom || '…'} – ${dateTo || '…'}` : 'Dátumszűrés'}
          >
            <Calendar size={16}/>{externalOutgoing ? ' Dátum szűrés' : ''}
          </SecondaryButton>
          {!externalOutgoing && (
            <SecondaryButton
              onClick={()=>{ setAmountDraftFrom(amountFrom); setAmountDraftTo(amountTo); setShowAmountModal(true); }}
              title={amountFrom || amountTo ? `Összeg szűrő: ${amountFrom||'0'} – ${amountTo||'∞'} Ft` : 'Összeg szűrő'}
              style={amountFrom || amountTo ? { background:'#dbeafe', color:'#0f172a' } : {}}
            >
              <Banknote size={16}/>
            </SecondaryButton>
          )}
          {externalOutgoing && (
            <SecondaryButton onClick={runCzBackfill} disabled={czBackfillLoading} title="Számla sorozat pótlása NAV-ból">
              {czBackfillLoading ? 'Számla pótlás…' : 'Számla pótlás'}
            </SecondaryButton>
          )}
          {!isSelectorMode && (
            <SecondaryButton
              onClick={exportSelectedCsv}
              disabled={selectedCount===0}
              title={selectedCount===0 ? 'Jelölj ki számlákat az exporthoz' : `Kijelölt számlák exportálása CSV-be (${selectedCount} db)`}
            >
              <FileDown size={16}/> {selectedCount > 0 ? `CSV (${selectedCount})` : 'CSV'}
            </SecondaryButton>
          )}
          
          {!isSelectorMode && !externalOutgoing && (
          <>
          <SecondaryButton onClick={() => setShowPaymentHistory(true)} title="Kifizetések">
            <CreditCard size={16}/>
          </SecondaryButton>
          <SecondaryButton
            onClick={() => {
              setPaymentListMode(prev => {
                const next = prev === 'manual' ? 'bank' : 'manual';
                if (next === 'bank') {
                  setPaymentFilter((cur) => Array.from(new Set([...(cur || []), 'TRANSFER', 'UTANVET'])));
                }
                return next;
              });
            }}
            title="Bankkivonat egyeztetés"
            style={paymentListMode === 'bank' ? { background:'#dbeafe', color:'#0f172a' } : {}}
          >
            <FileText size={16}/>
          </SecondaryButton>
          <SecondaryButton onClick={openBatches} title="Csomagok">
            <FolderOpen size={16}/>{pendingCount > 0 && <span style={{ marginLeft:2 }}>({pendingCount})</span>}
          </SecondaryButton>
          <SecondaryButton
            onClick={openCreateBatchModal}
            disabled={selectedCount===0}
            title={selectedCount===0 ? (allowAllPaymentTypesForBatch ? 'Válassz számlákat a csomag készítéséhez' : 'Válassz átutalásos számlákat') : 'Fizetési csomag készítése'}
          >
            <PlusCircle size={16}/>{selectedCount > 0 && <span style={{ marginLeft:2 }}>({selectedCount})</span>}
          </SecondaryButton>
          {editingBatch && (
            <div style={{ display:'inline-flex', gap:8, marginLeft:8 }}>
              <SecondaryButton onClick={cancelEditBatch} disabled={savingEdit}>
                <X size={16}/> Mégse
              </SecondaryButton>
              <PrimaryButton onClick={saveEditBatch} disabled={savingEdit}>
                <Save size={16}/> {savingEdit ? 'Mentés…' : 'Csomag mentése'}
              </PrimaryButton>
            </div>
          )}
          </>
          )}
          <label title="Minden számlatípus kijelölhető" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'0 4px', cursor:'pointer' }}>
            <input
              type="checkbox"
              checked={allowAllPaymentTypesForBatch}
              onChange={(e)=>setAllowAllPaymentTypesForBatch(e.target.checked)}
            />
            <ListChecks size={15} style={{ color: allowAllPaymentTypesForBatch ? '#2563eb' : '#6b7280' }} />
          </label>
          {!externalOutgoing && (
            <label title="Kézzel felvitt számlák" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'0 4px', cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={manualOnly}
                onChange={(e)=>setManualOnly(e.target.checked)}
              />
              <PenLine size={15} style={{ color: manualOnly ? '#2563eb' : '#6b7280' }} />
            </label>
          )}
          <RefreshButton onClick={()=>fetchDigest(1, { refresh: 1, replace: true })} disabled={loading} title="Frissítés">
            <RefreshCw size={16}/>
          </RefreshButton>
          {!externalOutgoing && (
            <PrimaryButton onClick={()=>navigate('/incoming-invoices/new')} title="Új bejövő számla kézi rögzítése">
              Új számla
            </PrimaryButton>
          )}
        </Toolbar>
      </InvoicesHeader>
      {editingBatch && (
        <EditInfoBar>
          <div>
            Csomag szerkesztése: <strong>{editingBatch.name}</strong>
            {editingBatch.bank_account_name ? (
              <> — {editingBatch.bank_account_name}</>
            ) : null}
            {editingBatch.currency ? (
              <> — {editingBatch.currency}</>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: '#7f6b00', textAlign: 'right' }}>
            <div>Tételek: {editingBatch.item_count ?? (editingBatch.items?.length || 0)}</div>
            {editingMissingExportCount > 0 && (
              <div style={{ color: '#c0392b', fontWeight: 600 }}>
                Figyelem: {editingMissingExportCount} tételnél hiányzik export bankszámla
              </div>
            )}
          </div>
        </EditInfoBar>
      )}
      {antPagination}
      <TableContainer>
        {selectedCount > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '6px 12px',
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 6,
            fontSize: 13, alignItems: 'center' }}>
            <strong>{selectedCount} db kijelölve</strong>
            {Object.entries(selectionSummary).map(([cur, sums]) => (
              <span key={cur} style={{ display: 'flex', gap: 12 }}>
                <span>Nettó: <b>{Number(sums.net).toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {cur}</b></span>
                <span>ÁFA: <b>{Number(sums.vat).toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {cur}</b></span>
                <span>Bruttó: <b>{Number(sums.gross).toLocaleString('hu-HU', { maximumFractionDigits: 0 })} {cur}</b></span>
              </span>
            ))}
          </div>
        )}
        <Table>
          <TableHeader>
            <tr>
              {isSelectorMode ? (
                <TableHeaderCell>Kiválasztás</TableHeaderCell>
              ) : (
                <TableHeaderCell>
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleHeaderSelection}
                    title={selectedCount > 0 ? 'Kijelölés törlése' : 'Összes kijelölése'}
                  />
                </TableHeaderCell>
              )}
              <TableHeaderCell>{externalOutgoing ? 'Ügyfél' : 'Kibocsátó'}</TableHeaderCell>
              <TableHeaderCell>Adószám</TableHeaderCell>
              <TableHeaderCell>Számlaszám</TableHeaderCell>
              <TableHeaderCell>Kibocsátás</TableHeaderCell>
              <TableHeaderCell>Nettó</TableHeaderCell>
              <TableHeaderCell>ÁFA</TableHeaderCell>
              <TableHeaderCell>Bruttó</TableHeaderCell>
              <TableHeaderCell>Deviza</TableHeaderCell>
              {!externalOutgoing && <TableHeaderCell>Jóváhagyás</TableHeaderCell>}
              <TableHeaderCell>Fizetési mód</TableHeaderCell>
              {paymentListMode === 'bank' && <TableHeaderCell>Bankkivonat</TableHeaderCell>}
              <TableHeaderCell>Művelet</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {items.filter(isVisibleRow).map((row, idx) => {
              const key = rowKey(row);
              const toNumber = (v) => {
                if (v === null || v === undefined || v === '') return 0;
                const s = String(v).replace(/\s+/g, '').replace(',', '.');
                const n = parseFloat(s);
                return Number.isFinite(n) ? n : 0;
              };
              const remaining = toNumber(row.remainingAmount);
              const overpaid = toNumber(row.overpaidAmount);
              const paymentDisplayDate = row.paymentDisplayDate || row.paymentDate;
              const hasPaymentDate = !!paymentDisplayDate;
              const pmUpper = String(row.paymentMethod||'').toUpperCase();
              const isTransfer = pmUpper === 'TRANSFER' || pmUpper === 'COD';
              const hasBalance = remaining > 0.0001;
              const hasOverpay = overpaid > 0.0001;
              const isPaid = !!row.isPaid || (!isTransfer ? hasPaymentDate : (!hasBalance && !hasOverpay));
              const isUnpaid = !isPaid && isTransfer;
              const hasPaidTag = isTransfer ? !isUnpaid : isPaid;
              const dueText = row.dueDate ? row.dueDate : '-';
              const bankPaid = Number(row.bankPaidAmount || 0);
              const grossNum = Number(row.grossAmount || 0);
              const bankRemaining = Math.max(grossNum - bankPaid, 0);
              const bankOverpay = Math.max(bankPaid - grossNum, 0);
              const bankHasAny = bankPaid > 0.005;
              const bankIsPaid = bankHasAny && bankRemaining <= 0.005;
              const bankIsPartial = bankHasAny && bankRemaining > 0.005;
              const bankMethodLabel = 'Átutalás+Utánvét';
              const rowActions = (
                <>
                  <IconButton onClick={()=>openXmlInNewTab(row.invoiceNumber, row.supplierTaxNumber)} title="Megnyitás új lapon">
                    <Eye size={16}/>
                  </IconButton>
                  <IconButton onClick={()=>openAttachments(row.invoiceNumber, row.supplierTaxNumber)} title="Csatolmányok">
                    <Upload size={16}/>
                  </IconButton>
                  {isManualIncomingRow(row) && !externalOutgoing && (
                    <>
                      <IconButton onClick={()=>openManualEdit(row)} title="Kézi számla szerkesztése" style={{ backgroundColor:'#0ea5e9' }}>
                        <Edit2 size={16}/>
                      </IconButton>
                      <IconButton onClick={()=>deleteManualIncoming(row)} title="Kézi számla törlése" style={{ backgroundColor:'#dc2626' }}>
                        <Trash2 size={16}/>
                      </IconButton>
                    </>
                  )}
                </>
              );
              const mobileActionColSpan = externalOutgoing
                ? (paymentListMode === 'bank' ? 12 : 11)
                : (paymentListMode === 'bank' ? 13 : 12);
              return (
              <React.Fragment key={`${row.invoiceNumber||'row'}_${idx}`}>
              <TableRow
                $paid={hasPaidTag}
                $unpaid={isUnpaid}
                $selected={selected.has(rowKey(row))}
                onDoubleClick={() => openXmlInNewTab(row.invoiceNumber, row.supplierTaxNumber)}
                onContextMenu={(event) => handleRowContextMenu(event, key)}
                onTouchEnd={(event) => handleRowTouchTap(event, key)}
              >
                <TableCell style={{width:40}}>
                  {isSelectorMode ? (
                      <PrimaryButton onClick={() => handleSelectInvoice(row)} style={{padding: '4px 8px', fontSize: 12}}>
                        Kiválaszt
                      </PrimaryButton>
                  ) : (
                  canSelect(row) ? (
                    <CheckboxBtn onClick={(e)=>toggleSelect(row, idx, e)} title="Kijelölés">
                      {selected.has(rowKey(row)) ? <CheckSquare size={18}/> : <Square size={18}/>} 
                    </CheckboxBtn>
                  ) : (
                    <span title={row.inPaymentBatch ? 'Már fizetési csomagban van' : 'Nem kijelölhető'}> </span>
                  )
                  )}
                </TableCell>
                <TableCell title={row.supplierName}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span>{row.supplierName?.length>30? row.supplierName.slice(0,30)+'…':row.supplierName}</span>
                    {isManualIncomingRow(row) && !externalOutgoing && (
                      <span
                        title="Kézzel felvitt"
                        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:16, height:16, borderRadius:999, fontSize:10, fontWeight:700, background:'#e0f2fe', color:'#075985' }}
                      >
                        M
                      </span>
                    )}
                    {!externalOutgoing && row.supplierMissingInCrm && (
                      <InlineActionBadge
                        type="button"
                        title="Beszállító létrehozása CRM-ben"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openSupplierCreateFromInvoice(row);
                        }}
                      >
                        Nincs CRM-ben
                      </InlineActionBadge>
                    )}
                    {!externalOutgoing && row.supplierHasNewBankAccount && (
                      <InlineActionBadge
                        type="button"
                        title="Új NAV bankszámla hozzáadása a CRM beszállítóhoz"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openSupplierEditForNewBank(row);
                        }}
                      >
                        Új bankszámla
                      </InlineActionBadge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{row.supplierTaxNumber}</TableCell>
                <TableCell>{row.invoiceNumber}</TableCell>
                <TableCell>{row.invoiceIssueDate}</TableCell>
                <TableCell className="text-right">{row.netAmount}</TableCell>
                <TableCell className="text-right">{row.vatAmount}</TableCell>
                <TableCell className="text-right">
                  <div>{row.grossAmount}</div>
                  {row.currency && row.currency !== 'HUF' && row.netAmountHUF && (
                    <SmallMuted>
                      {Number(row.netAmountHUF) + Number(row.vatAmountHUF || 0)} HUF
                    </SmallMuted>
                  )}
                </TableCell>
                <TableCell>{row.currency}</TableCell>
                {!externalOutgoing && (
                  <TableCell>
                    {isTransfer ? (
                      canApproveInvoices ? (
                        <label style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                          <input
                            type="checkbox"
                            checked={isRowApproved(row)}
                            onChange={()=>toggleApproval(row)}
                            disabled={!!approvalSaving[rowKey(row)]}
                          />
                          <SmallMuted style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                            <span>Jóváhagyó: {row.approvedBy || '—'}</span>
                            <span>Dátum: {row.approvedAt ? row.approvedAt.slice(0,10) : '—'}</span>
                          </SmallMuted>
                        </label>
                      ) : (
                        <SmallMuted style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                          <span>{isRowApproved(row) ? 'Jóváhagyva' : '—'}</span>
                          <span>Jóváhagyó: {row.approvedBy || '—'}</span>
                          <span>Dátum: {row.approvedAt ? row.approvedAt.slice(0,10) : '—'}</span>
                        </SmallMuted>
                      )
                    ) : (
                      <SmallMuted style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                        <span>Nem szükséges</span>
                        <span>Fizetési mód: {formatPaymentMethod(row.paymentMethod)}</span>
                      </SmallMuted>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {needsPaymentMethod(row) ? (
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <FilterSelect
                        value={paymentDrafts[rowKey(row)] ?? (String(row.paymentMethod||'').toUpperCase()==='OTHER' ? 'OTHER' : '')}
                        onChange={(e)=>setPaymentDrafts(prev => ({ ...prev, [rowKey(row)]: e.target.value }))}
                      >
                        <option value="">Válassz…</option>
                        <option value="TRANSFER">Átutalás</option>
                        <option value="CASH">Készpénz</option>
                        <option value="CARD">Kártya</option>
                        <option value="VOUCHER">Utalvány</option>
                        <option value="UTANVET">Utánvét</option>
                        <option value="OTHER">Egyéb</option>
                      </FilterSelect>
                      <SecondaryButton onClick={()=>savePaymentMethod(row)} disabled={!paymentDrafts[rowKey(row)]}>
                        <Save size={14}/> Mentés
                      </SecondaryButton>
                      {isPaymentEditable(row) && (
                        <button
                          onClick={()=>resetPaymentMethod(row)}
                          style={{ display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #ad5f00', background:'#fff7ec', color:'#ad5f00', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontSize:12 }}
                          title="Fizetési mód visszaállítása"
                        >
                          <RotateCcw size={14} /> RE
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span>{paymentListMode === 'bank' ? bankMethodLabel : formatPaymentMethod(row.paymentMethod)}</span>
                        {editableAfterSave[key] && !isPaymentEditable(row) && (
                          <button
                            onClick={()=>resetPaymentMethod(row)}
                            style={{ display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #ad5f00', background:'#fff7ec', color:'#ad5f00', borderRadius:6, padding:'2px 8px', cursor:'pointer', fontSize:12 }}
                            title="Fizetési mód visszaállítása"
                          >
                            <RotateCcw size={14} /> RE
                          </button>
                        )}
                      </div>
                      {isTransfer ? (
                        paymentListMode === 'bank' ? (
                          bankIsPaid ? (
                            <>
                              <StatusPill variant="paid">Bankkivonat: rendezve</StatusPill>
                              <SmallMuted>Kifizetve: {formatMoney(bankPaid)} {row.currency}</SmallMuted>
                            </>
                          ) : bankIsPartial ? (
                            <>
                              <StatusPill variant="unpaid">Bankkivonat: részben rendezett</StatusPill>
                              <SmallMuted>Kifizetve: {formatMoney(bankPaid)} {row.currency}</SmallMuted>
                              <SmallMuted>Fennmaradó összeg: {formatMoney(bankRemaining)} {row.currency}</SmallMuted>
                            </>
                          ) : (
                            <SmallMuted>Nincs bankkivonat alapú egyeztetés</SmallMuted>
                          )
                        ) : isUnpaid ? (
                          <>
                            <StatusPill variant="unpaid">
                              Esedékes: {dueText}
                            </StatusPill>
                            {paymentDisplayDate && (
                              <SmallMuted>Utolsó fizetés: {paymentDisplayDate}</SmallMuted>
                            )}
                            {hasBalance && (
                              <SmallMuted>Fennmaradó összeg: {formatMoney(remaining)} {row.currency}</SmallMuted>
                            )}
                            {hasOverpay && (
                              <SmallMuted>Túlfizetés: {formatMoney(overpaid)} {row.currency}</SmallMuted>
                            )}
                          </>
                        ) : (
                          <>
                            <StatusPill variant="paid">
                              Kifizetve: {paymentDisplayDate || dueText}
                            </StatusPill>
                            {row.paymentReference && <SmallMuted>{row.paymentReference}</SmallMuted>}
                          </>
                        )
                      ) : (
                        paymentDisplayDate ? (
                          <>
                            <StatusPill variant="paid">
                              Kifizetve: {paymentDisplayDate}
                            </StatusPill>
                            {row.paymentReference && <SmallMuted>{row.paymentReference}</SmallMuted>}
                          </>
                        ) : (
                          <SmallMuted>Nincs fizetési dátum</SmallMuted>
                        )
                      )}
                    </>
                  )}
                </TableCell>
                {paymentListMode === 'bank' && (
                  <TableCell>
                    {(row.bankStatements || []).length ? (
                      <div>
                        <div style={{ fontWeight: 600 }}>{(row.bankStatements || []).length} tétel</div>
                        <SmallMuted>
                          {(row.bankStatements || []).slice(0, 2).map(bs => `${bs.sequenceNumber || '-'} (${bs.statementDate || '-'})`).join(', ')}
                          {(row.bankStatements || []).length > 2 ? ' …' : ''}
                        </SmallMuted>
                        {bankOverpay > 0.005 && (
                          <StatusPill variant="unpaid">Túlfizetés: {formatMoney(bankOverpay)} {row.currency}</StatusPill>
                        )}
                      </div>
                    ) : (
                      <SmallMuted>-</SmallMuted>
                    )}
                  </TableCell>
                )}
                <MainActionsCell>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {rowActions}
                  </div>
                </MainActionsCell>
              </TableRow>
              <MobileActionsRow $open={mobileActionsRowKey === key}>
                <MobileActionsCell colSpan={mobileActionColSpan}>
                  <MobileActionsBar>
                    {rowActions}
                  </MobileActionsBar>
                </MobileActionsCell>
              </MobileActionsRow>
              </React.Fragment>
            );})}
          </TableBody>
        </Table>
        {(loading && items.length===0) && <div style={{padding:40, textAlign:'center'}}><Spin size="large" tip="Betöltés..." /></div>}
        {errorMsg && <div style={{padding:16, color:'#c00'}}>{errorMsg}</div>}
      </TableContainer>
      
      {antPagination}

      {/* Inline XML modal / print view (existing below) */}
      {xmlOpen && (
        <ModalOverlay onClick={()=>setXmlOpen(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{xmlTitle}</ModalTitle>
              <CloseBtn onClick={()=>setXmlOpen(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {xmlLoading && <div>Betöltés...</div>}
              {!!xmlError && <div style={{ color: '#e74c3c', marginBottom: 8 }}>{xmlError}</div>}
              {!xmlLoading && parsed && (
                <div className="print-invoice">
                  <div className="inv-container">
                    <div className="inv-header">
                      <div className="inv-seller">
                        <div className="inv-seller-name">{parsed.supplier?.name || '-'}</div>
                        <div className="muted">Adószám: {parsed.supplier?.taxNumber || '-'}</div>
                        {(parsed.supplier?.bankAccounts || []).length > 0 && (
                          <div className="muted">Bankszámlaszámok: {(parsed.supplier.bankAccounts || []).join(', ')}</div>
                        )}
                        {(parsed.supplier?.addressLines || []).map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                      <div className="inv-top-right">
                        <div className="inv-title">Számla</div>
                        <div className="inv-meta">
                          <div className="inv-meta-grid">
                            <div>Sorszám</div><div>{parsed.invoiceNumber || '-'}</div>
                            <div>Kelt</div><div>{parsed.issueDate || '-'}</div>
                            <div>Teljesítés</div><div>{parsed.deliveryDate || '-'}</div>
                            <div>Esedékesség</div><div>{parsed.paymentDate || '-'}</div>
                            <div>Fizetési mód</div><div>{parsed.paymentMethod || '-'}</div>
                            <div>Deviza</div><div>{parsed.currency || '-'}</div>
                            {parsed.exchangeRate && (<><div>Árfolyam</div><div>{parsed.exchangeRate} HUF/{parsed.currency || ''}</div></>)}
                            {parsed.operation && (<><div>Művelet</div><div>{parsed.operation}</div></>)}
                            {parsed.category && (<><div>Kategória</div><div>{parsed.category}</div></>)}
                            {parsed.appearance && (<><div>Megjelenés</div><div>{parsed.appearance}</div></>)}
                            {parsed.originalInvoiceNumber && (
                              <>
                                <div>Eredeti számla</div>
                                <div>{parsed.originalInvoiceNumber}{parsed.modificationIndex ? ` / mód.${parsed.modificationIndex}` : ''}</div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="inv-customer">
                      <div><strong>Vevő:</strong> {parsed.customer?.name || '-'}</div>
                      <div className="muted">Adószám: {parsed.customer?.taxNumber || '-'}</div>
                      {(parsed.customer?.addressLines || []).map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                    <div className="inv-lines" style={{ marginTop: '8mm' }}>
                      <table className="inv-items">
                        <colgroup>
                          <col style={{ width: '5%' }} />
                          <col className="col-desc" />
                          <col style={{ width: '12%' }} />
                          <col className="col-qty" />
                          <col className="col-unit" />
                          <col className="col-unitnet" />
                          <col className="col-net" />
                          <col className="col-vat" />
                          <col className="col-gross" />
                          <col className="col-vatrate" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="cen" style={{ width: '5%' }}>#</th>
                            <th>Megnevezés</th>
                            <th>Termékkód</th>
                            <th className="cen">Menny.</th>
                            <th className="cen">Egység</th>
                            <th className="num">Egységár</th>
                            <th className="num">Nettó</th>
                            <th className="num">ÁFA</th>
                            <th className="num">Bruttó</th>
                            <th className="cen">ÁFA %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(parsed.lines || []).map((ln, idx) => (
                            <tr key={idx}>
                              <td className="cen">{ln.lineNumber || idx + 1}</td>
                              <td>{ln.description || '-'}</td>
                              <td>{(ln.productCodes || []).join(', ')}</td>
                              <td className="cen">{ln.qty == null ? '-' : ln.qty}</td>
                              <td className="cen">{ln.unit || ''}</td>
                              <td className="num">{fmt(ln.unitPrice)}</td>
                              <td className="num">{fmt(ln.net)}</td>
                              <td className="num">{fmt(ln.vat)}</td>
                              <td className="num">{fmt(ln.gross)}</td>
                              <td className="cen">{ln.vatPct == null ? '-' : `${ln.vatPct}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(parsed.vatSummary && parsed.vatSummary.length > 0) && (
                      <div style={{ marginTop: '6mm' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>ÁFA összesítő</div>
                        <table className="inv-items">
                          <colgroup>
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '26%' }} />
                            <col style={{ width: '27%' }} />
                            <col style={{ width: '27%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="cen">ÁFA %</th>
                              <th className="num">Nettó</th>
                              <th className="num">ÁFA</th>
                              <th className="num">Bruttó</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsed.vatSummary.map((r, i) => (
                              <tr key={i}>
                                <td className="cen">{r.label || '-'}</td>
                                <td className="num">{fmt(r.net)}</td>
                                <td className="num">{fmt(r.vat)}</td>
                                <td className="num">{fmt(r.gross)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="inv-summary" style={{ marginTop: '6mm', display: 'flex', justifyContent: 'flex-end' }}>
                      <div>
                        <div><strong>Nettó:</strong> {fmt(parsed.totals?.net)}</div>
                        <div><strong>ÁFA:</strong> {fmt(parsed.totals?.vat)}</div>
                        <div><strong>Összesen:</strong> {fmt(parsed.totals?.gross)} {parsed.currency || ''}</div>
                        {parsed.exchangeRate && parsed.currency !== 'HUF' && (
                          <div style={{ marginTop: 4, fontSize: 12, color: '#7f8c8d' }}>Árfolyam: {parsed.exchangeRate} HUF/{parsed.currency}</div>
                        )}
                        {parsed.totalsHUF?.gross && parsed.currency !== 'HUF' && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #ddd' }}>
                            <div><strong>Összesen HUF-ban:</strong> {fmt(parsed.totalsHUF.gross)} HUF</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {(parsed.additionalData && parsed.additionalData.length > 0) && (
                      <div style={{ marginTop: '6mm' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Megjegyzések és további adatok</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {parsed.additionalData.map((d, i) => (
                              <tr key={i}>
                                <td style={{ padding: '6px', width: '30%', borderBottom: '1px solid #eee' }}>{d.desc || '-'}</td>
                                <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{d.value || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="inv-fineprint" style={{ marginTop: '6mm', fontSize: '10pt', color: '#555' }}>
                      Automatikus előnézet NAV bejövő számlához. Az adatok a NAV XML-ből származnak.
                    </div>
                  </div>
                </div>
              )}
              {!xmlLoading && !parsed && (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f8f9fa', padding: 12, borderRadius: 6 }}>{xmlText}</pre>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Dátumszűrés Modal */}
      {showDateModal && (
        <ModalOverlay onClick={()=>setShowDateModal(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520 }}>
            <ModalHeader>
              <ModalTitle>Dátumszűrés</ModalTitle>
              <CloseBtn onClick={()=>setShowDateModal(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
                  <label style={{ fontWeight:500 }}>Dátum -tól</label>
                  <input type="date" value={dateDraftFrom || ''} onChange={(e)=>setDateDraftFrom(e.target.value || null)} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
                  <label style={{ fontWeight:500 }}>Dátum -ig</label>
                  <input type="date" value={dateDraftTo || ''} onChange={(e)=>setDateDraftTo(e.target.value || null)} />
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
                <SecondaryButton onClick={()=>applyPreset('today', { closeModal: true })}>Ma</SecondaryButton>
                <SecondaryButton onClick={()=>applyPreset('last7', { closeModal: true })}>Elmúlt 7 nap</SecondaryButton>
                <SecondaryButton onClick={()=>applyPreset('last30', { closeModal: true })}>Elmúlt 30 nap</SecondaryButton>
                <SecondaryButton onClick={()=>applyPreset('last365', { closeModal: true })}>Elmúlt 365 nap</SecondaryButton>
                <SecondaryButton onClick={()=>applyPreset('prevMonth', { closeModal: true })}>Előző hónap</SecondaryButton>
                <SecondaryButton onClick={()=>applyPreset('clear', { closeModal: true })}>Szűrés törlés</SecondaryButton>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
                <SecondaryButton onClick={()=>setShowDateModal(false)}>Mégse</SecondaryButton>
                <PrimaryButton onClick={()=>{ applyRange(dateDraftFrom || null, dateDraftTo || null, { refresh: 1, backfillAll: dateDraftFrom && dateDraftTo ? 1 : 0 }); setShowDateModal(false); }}>
                  Szűrés alkalmazása
                </PrimaryButton>
              </div>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Összegszűrés Modal */}
      {showAmountModal && (
        <ModalOverlay onClick={()=>setShowAmountModal(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 400 }}>
            <ModalHeader>
              <ModalTitle>Összeg szűrés (Bruttó)</ModalTitle>
              <CloseBtn onClick={()=>setShowAmountModal(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:12, flexDirection:'column' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontWeight:500 }}>Minimum összeg (Ft)</label>
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={amountDraftFrom || ''} 
                    onChange={(e)=>setAmountDraftFrom(e.target.value.replace(',', '.'))}
                    placeholder="pl. 1000"
                    style={{ padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                  />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontWeight:500 }}>Maximum összeg (Ft)</label>
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={amountDraftTo || ''} 
                    onChange={(e)=>setAmountDraftTo(e.target.value.replace(',', '.'))}
                    placeholder="pl. 50000"
                    style={{ padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
                  />
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:24 }}>
                <SecondaryButton onClick={()=>{ setAmountDraftFrom(''); setAmountDraftTo(''); }}>Törlés</SecondaryButton>
                <SecondaryButton onClick={()=>setShowAmountModal(false)}>Mégse</SecondaryButton>
                <PrimaryButton onClick={()=>{ 
                  setAmountFrom(amountDraftFrom); 
                  setAmountTo(amountDraftTo); 
                  setShowAmountModal(false);
                }}>
                  Szűrés
                </PrimaryButton>
              </div>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Create Payment Batch Modal */}
      {showCreateBatch && (
        <ModalOverlay onClick={()=>setShowCreateBatch(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Új fizetési csomag ({selectedCount} tétel)</ModalTitle>
              <CloseBtn onClick={()=>setShowCreateBatch(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {selectedCurrencies.length > 1 && (
                <div style={{color:'#ad5f00', background:'#fff4e5', padding:8, border:'1px solid #ffd8a8', borderRadius:6, marginBottom:8}}>
                  Figyelem: eltérő pénznemű tételek vannak kijelölve. A csomag pénzneme a kiválasztott első tételhez igazodik, az eltérők kimaradnak.
                </div>
              )}
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Csomag neve</label>
                <input value={batchName} onChange={e=>setBatchName(e.target.value)} style={{flex:1, padding:6}} />
              </div>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Bankszámla</label>
                <FilterSelect value={batchBankAccount} onChange={e=>{
                  const id = e.target.value; setBatchBankAccount(id);
                  const acc = (Array.isArray(bankAccounts)? bankAccounts: []).find(a => String(a.id)===String(id));
                  if (acc && acc.currency) setBatchCurrency(acc.currency);
                }} style={{flex:1}}>
                  <option value="">-- válassz --</option>
                  {(Array.isArray(bankAccounts) ? bankAccounts : []).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {(acc.bank_name ? acc.bank_name + ' - ' : '') + (acc.iban || acc.account_number || '')}
                      {acc.currency ? ` (${acc.currency})` : ''}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Pénznem</label>
                <input value={batchCurrency || selectedCurrencies[0] || 'HUF'} readOnly style={{width:120, padding:6}} />
              </div>
              {selectedCount>0 && batchCurrency && selectedRows.some(r => {
                if (!r.currency || r.currency === batchCurrency) return false;
                // If batch is HUF and invoice has HUF amount, it's OK
                if (batchCurrency === 'HUF' && r.netAmountHUF && r.vatAmountHUF) return false;
                return true;
              }) && (
                <div style={{color:'#ad5f00', background:'#fff4e5', padding:8, border:'1px solid #ffd8a8', borderRadius:6, marginTop:4}}>
                  Az eltérő pénznemű kijelöltek kimaradnak a csomagból.
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontWeight:600 }}>Tételek ({selectedRowsForBatch.length})</div>
                  {excludedForBatch > 0 && (
                    <div style={{ color:'#ad5f00', fontSize:13 }}>
                      Kimarad: {excludedForBatch} eltérő pénznemű tétel
                    </div>
                  )}
                </div>
                <div style={{ maxHeight: 280, overflow:'auto', border:'1px solid #ecf0f1', borderRadius:6 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:50 }}>#</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Eladó</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számlaszám</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:80 }}>Deviza</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:150 }}>Bruttó összeg</th>
                        <th style={{ width: 40, borderBottom:'1px solid #eee' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRowsForBatch.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding:10, textAlign:'center', color:'#7f8c8d' }}>Nincs megjeleníthető tétel.</td>
                        </tr>
                      ) : (
                        selectedRowsForBatch.map((r, idx) => {
                          // Calculate the amount to use for this item
                          let displayAmount = r.grossAmount;
                          let displayCurrency = r.currency || effectiveBatchCurrency;
                          if (effectiveBatchCurrency === 'HUF' && r.currency !== 'HUF' && r.netAmountHUF && r.vatAmountHUF) {
                            displayAmount = Number(r.netAmountHUF) + Number(r.vatAmountHUF);
                            displayCurrency = 'HUF';
                          }
                          return (
                          <tr key={rowKey(r)}>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{idx + 1}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.supplierName || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.invoiceNumber || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.currency || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>
                              {(formatMoney(displayAmount) ?? '-')} {displayCurrency || ''}
                              {r.currency !== 'HUF' && displayCurrency === 'HUF' && (
                                <div style={{ fontSize: 11, color: '#7f8c8d' }}>({r.currency} → HUF)</div>
                              )}
                            </td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5', textAlign:'right' }}>
                              <IconButton
                                onClick={() => {
                                  const k = rowKey(r);
                                  setSelected(prev => {
                                    const next = new Map(prev);
                                    next.delete(k);
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
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, fontWeight:600 }}>
                  Összesen: {formatMoney(selectedTotal)} {effectiveBatchCurrency || ''}
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
                <SecondaryButton onClick={()=>setShowCreateBatch(false)}>Mégse</SecondaryButton>
                <PrimaryButton onClick={createBatch} disabled={creatingBatch}>
                  <PlusCircle size={16}/> {creatingBatch ? 'Létrehozás...' : 'Csomag létrehozása'}
                </PrimaryButton>
              </div>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Pending Batches Modal */}
      {showBatches && (
        <ModalOverlay onClick={()=>setShowBatches(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Fizetési csomagok</ModalTitle>
              <CloseBtn onClick={()=>setShowBatches(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <SecondaryButton onClick={()=>setBatchTab('pending')} style={batchTab==='pending'? { background:'#dbeafe', color:'#0f172a' } : {}}>Függő ({pendingBatches.length})</SecondaryButton>
                <SecondaryButton onClick={()=>setBatchTab('completed')} style={batchTab==='completed'? { background:'#dbeafe', color:'#0f172a' } : {}}>Kifizetett ({completedBatches.length})</SecondaryButton>
              </div>
              {batchesLoading ? (
                <div style={{ textAlign:'center', padding:32 }}><Spin size="large" tip="Betöltés..." /></div>
              ) : ((batchTab==='pending'? pendingBatches : completedBatches) || []).length === 0 ? (
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
                          {batchTab==='pending' && (
                            <>
                              <IconButton onClick={()=>markBatchPaid(b)} title="Tételek kifizetve jelölése">
                                Kifizetve
                              </IconButton>
                              <IconButton onClick={()=>startEditBatch(b)} title="Csomag módosítása">
                                <Edit2 size={16}/> Módosítás
                              </IconButton>
                            </>
                          )}
                          <IconButton onClick={()=>exportBatch(b.id, b.name)} title="Export">
                            <FileDown size={16}/> Export
                          </IconButton>
                          <IconButton onClick={()=>exportBatchBankFile(b)} title="Banki export (SEPA XML)">
                            <FileDown size={16}/> Bank export
                          </IconButton>
                          <IconButton style={{ background:'#c0392b'}} onClick={()=>deleteBatch(b.id)} title="Törlés">
                            <Trash2 size={16}/> Törlés
                          </IconButton>
                        </div>
                      </div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontWeight:600, marginBottom:6 }}>Tételek</div>
                        {(b.items && b.items.length > 0) ? (
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>#</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Eladó</th>
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Számlaszám</th>
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
                                    {batchTab==='pending' ? (
                                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
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
                                      </div>
                                    ) : (
                                      <div>{formatMoney(it.amount_gross)} {b.currency}</div>
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

      {/* Attachments Modal */}
      {attachOpen && (
        <ModalOverlay onClick={()=>setAttachOpen(false)}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Csatolmányok — {attachFor?.invoiceNumber}</ModalTitle>
              <CloseBtn onClick={()=>setAttachOpen(false)}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
                <FilterSelect value={uploadType} onChange={(e)=>setUploadType(e.target.value)}>
                  <option value="IMAGE">Számlakép</option>
                  <option value="OTHER">Egyéb</option>
                </FilterSelect>
                <SecondaryButton onClick={()=>fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={16}/> {uploading ? 'Feltöltés…' : 'Fájl feltöltése'}
                </SecondaryButton>
                <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={onPickFile} />
              </div>
              <div
                onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
                onDrop={onDropFiles}
                style={{ border:'2px dashed #95a5a6', borderRadius:8, padding:16, textAlign:'center', color:'#7f8c8d', marginBottom:12 }}
              >
                Húzd ide a fájlokat a feltöltéshez
              </div>
              {attachLoading ? (
                <div>Betöltés…</div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:12 }}>
                  {attachList.map(doc => (
                    <div key={doc.id} style={{ border:'1px solid #ecf0f1', borderRadius:8, padding:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <div style={{ width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <ImageIcon size={18} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:13 }}>{doc.original_name || (doc.file && String(doc.file).split('/').pop())}</div>
                          <SmallMuted>{(doc.size || 0)/1024 >= 1 ? `${(doc.size/1024).toFixed(1)} KB` : `${doc.size||0} B`} · {doc.type === 'IMAGE' ? 'Számlakép' : 'Egyéb'}</SmallMuted>
                        </div>
                      </div>
                      {(doc.file && typeof doc.file === 'string' && /\.(png|jpe?g|gif|pdf)$/i.test(doc.original_name || doc.file)) ? (
                        <div style={{ marginBottom: 8 }}>
                          {/\.(pdf)$/i.test(doc.original_name || doc.file) ? (
                            <a href={api.defaults.baseURL + doc.file} target="_blank" rel="noreferrer">PDF megnyitás</a>
                          ) : (
                            <img src={api.defaults.baseURL + doc.file} alt={doc.original_name||''} style={{ maxWidth:'100%', maxHeight:160, objectFit:'contain', borderRadius:4 }} />
                          )}
                        </div>
                      ) : null}
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <SecondaryButton onClick={async()=>{
                          try {
                            const res = await incomingDocsAPI.download(doc.id);
                            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = doc.original_name || 'file';
                            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                          } catch { toast.error('Letöltési hiba'); }
                        }}><FileDown size={16}/> Letöltés</SecondaryButton>
                        <SecondaryButton onClick={()=>deleteDoc(doc)} style={{ background:'#e74c3c', color:'#fff' }}><Trash2 size={16}/> Törlés</SecondaryButton>
                      </div>
                      <div style={{ marginTop:8 }}>
                        <input
                          defaultValue={doc.comment || ''}
                          placeholder="Megjegyzés"
                          onBlur={(e)=>{ const v = e.target.value; if (v !== (doc.comment||'')) saveComment(doc, v); }}
                          style={{ width:'100%', padding:6 }}
                        />
                      </div>
                    </div>
                  ))}
                  {attachList.length === 0 && (
                    <div style={{ color:'#7f8c8d' }}>Még nincs csatolmány.</div>
                  )}
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
      {/* Payment History Modal */}
      <PaymentHistoryModal 
        companyId={companyId}
        onClose={()=>setShowPaymentHistory(false)}
        visible={showPaymentHistory}
      />
    </InvoicesContainer>
  );
}
