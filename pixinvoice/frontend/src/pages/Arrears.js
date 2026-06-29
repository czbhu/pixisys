import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { invoiceAPI } from '../services/api';
import EmailModal from '../components/EmailModal';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;

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

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
    > * { width: 100%; }
  }
`;

const SearchInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 360px;

  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
  }
`;

const Button = styled.button`
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #d0d7de;
  background: #fff;
  color: #2c3e50;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const PrimaryButton = styled(Button)`
  background: #3498db;
  color: white;
  border-color: #3498db;
`;

const TableWrap = styled.div`
  overflow-x: auto;

  @media (max-width: 768px) {
    overflow-x: hidden;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Thead = styled.thead`
  background-color: #f8f9fa;
`;

const Th = styled.th`
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;
  position: relative;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  &:hover { background: #eef1f5; }

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    white-space: normal;
    width: auto !important;
    min-width: 0 !important;
    ${props => props.$hideOnMobile && 'display: none;'}
    ${props => props.$mobileTextRight && 'text-align: right;'}
  }
`;

const ThResizeHandle = styled.span`
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  &:hover { background: #3498db55; }
`;

const SortArrow = styled.span`
  font-size: 10px;
  margin-left: 4px;
  color: #3498db;
`;

const Tr = styled.tr`
  &:hover { background-color: rgba(0,0,0,0.03); }
`;

const Td = styled.td`
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;
  color: inherit;

  @media (max-width: 768px) {
    padding: 8px;
    font-size: 12px;
    ${props => props.$hideOnMobile && 'display: none;'}
    ${props => props.$mobileTextRight && 'text-align: right; white-space: nowrap;'}
  }
`;

const MainActionsTd = styled(Td)`
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
    padding: 8px 6px;
    border-bottom: 1px solid #ecf0f1;
    background: #fff;
  }
`;

const MobileActionsBar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const ARREARS_ROW_STYLE = {
  overdue:        { background: '#fffde7', color: '#2c3e50' },
  arrears_notice: { background: '#fff176', color: '#2c3e50' },
  reminder_1:     { background: '#ffebee', color: '#2c3e50' },
  reminder_2:     { background: '#ffcdd2', color: '#2c3e50' },
  legal_letter:   { background: '#f3e5f5', color: '#2c3e50' },
  payment_order:  { background: '#e1bee7', color: '#2c3e50' },
  litigation:     { background: '#212121', color: '#ffffff' },
  won:            { background: '#e8f5e9', color: '#1b5e20' },
  lost:           { background: '#ffebee', color: '#b71c1c' },
};

const StatusTag = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #d0d7de;
  background: #f7f9fc;
  font-size: 12px;
  font-weight: 600;
`;

const Muted = styled.div`
  color: #6c757d;
  font-size: 12px;
  margin-top: 4px;
`;

const StatusPickerWrap = styled.div`
  position: relative;
  display: inline-block;
`;

const StatusPickerDropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1200;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 210px;
  overflow: hidden;
`;

const StatusPickerItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: #2c3e50;
  background: ${p => p.active ? '#e8f4fd' : 'transparent'};
  font-weight: ${p => p.active ? '600' : 'normal'};
  &:hover { background: #f0f7ff; }
`;

const StatusPickerTitle = styled.div`
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  color: #6c757d;
  border-bottom: 1px solid #ecf0f1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const STATUS_ORDER = [
  { key: 'overdue', label: 'Lejárt' },
  { key: 'arrears_notice', label: 'Kintlévőségi értesítő kiküldése' },
  { key: 'reminder_1', label: '1. Felszólítás' },
  { key: 'reminder_2', label: '2. Felszólítás' },
  { key: 'legal_letter', label: 'Ügyvédi levél' },
  { key: 'payment_order', label: 'Fizetési meghagyás' },
  { key: 'litigation', label: 'Peresítés' },
  { key: 'won', label: 'Pert nyert' },
  { key: 'lost', label: 'Pert vesztett' },
];

const NEXT_STATUS = {
  overdue: 'arrears_notice',
  arrears_notice: 'reminder_1',
  reminder_1: 'reminder_2',
  reminder_2: 'legal_letter',
  legal_letter: 'payment_order',
  payment_order: 'litigation',
};

const STATUS_LABEL = Object.fromEntries(STATUS_ORDER.map((s) => [s.key, s.label]));

const paymentMethodLabel = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'transfer') return 'Átutalás';
  if (v === 'cash') return 'Készpénz';
  if (v === 'card') return 'Bankkártya';
  if (v === 'voucher') return 'Utalvány';
  if (v === 'cod') return 'Utánvét';
  if (v === 'other') return 'Egyéb';
  return value || '-';
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('hu-HU') : '—');

const formatAmount = (amount, currency) => {
  const value = Number(amount || 0);
  return `${value.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
};

/* ── Styled components ─────────────────────────────────────────── */

export default function Arrears() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId') || ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sending, setSending] = useState(false);
  const headerSelectRef = useRef(null);
  const lastCheckedIndexRef = useRef(-1); // shift-select anchor
  const sortedRowsRef = useRef([]);

  // Mobile actions
  const [mobileActionsRowId, setMobileActionsRowId] = useState(null);

  const isMobileViewport = () => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  };

  const toggleMobileActionsForRow = useCallback((id) => {
    setMobileActionsRowId((prev) => (prev === id ? null : id));
  }, []);

  const handleRowTouchTap = useCallback((event, id) => {
    if (!isMobileViewport()) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input,button,a,label,select,textarea,[role="button"]')) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  }, [toggleMobileActionsForRow]);

  const handleRowContextMenu = useCallback((event, id) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  }, [toggleMobileActionsForRow]);

  // Sort state
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Column widths (px)
  const DEFAULT_WIDTHS = { num: 140, customer: 180, issue: 100, delivery: 100, due: 100, payment: 110, amount: 130, status: 160, actions: 180 };
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);
  const resizingRef = useRef(null); // { key, startX, startW }

  // Email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalData, setEmailModalData] = useState(null); // { from, to, subject, body, customerId, invoiceIds[], advanceStatus }

  // Bulk email queue (one entry per customer)
  const [bulkEmailQueue, setBulkEmailQueue] = useState([]); // [{ customerName, invoiceIds[] }]
  const [bulkEmailIndex, setBulkEmailIndex] = useState(0);
  const [bulkEmailSentSet, setBulkEmailSentSet] = useState(new Set());
  const [bulkEmailLoading, setBulkEmailLoading] = useState(false);

  // Manual status picker (long press)
  const [statusPickerRow, setStatusPickerRow] = useState(null); // row.id
  const longPressTimerRef = useRef(null);

  const loadRows = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { company_id: companyId };
      if (statusFilter) params.arrears_status = statusFilter;
      const res = await invoiceAPI.getArrearsList(params);
      setRows(res.data?.results || []);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Kintlévőségek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sync = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId') || '';
        setCompanyId((prev) => (prev !== cid ? cid : prev));
      } catch {}
    };
    sync();
    window.addEventListener('focus', sync);
    const id = setInterval(sync, 1000);
    return () => {
      window.removeEventListener('focus', sync);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, statusFilter]);

  // Column resize mouse handlers
  const startResize = useCallback((e, key) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] || 120 };
    const onMove = (ev) => {
      const { key: k, startX, startW } = resizingRef.current;
      const newW = Math.max(60, startW + ev.clientX - startX);
      setColWidths((prev) => ({ ...prev, [k]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  // Sort click handler
  const handleSort = (key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  };

  // Sorted rows
  const sortedRows = useMemo(() => {
    const allRows = rows;
    const base = (() => {
      if (!sortKey) return allRows;
      const dir = sortDir === 'asc' ? 1 : -1;
      return [...allRows].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'num': av = a.invoice_number || ''; bv = b.invoice_number || ''; break;
        case 'customer': av = a.customer?.name || ''; bv = b.customer?.name || ''; break;
        case 'issue': av = a.issue_date || ''; bv = b.issue_date || ''; break;
        case 'delivery': av = a.delivery_date || ''; bv = b.delivery_date || ''; break;
        case 'due': av = a.due_date || ''; bv = b.due_date || ''; break;
        case 'payment': av = a.payment_method || ''; bv = b.payment_method || ''; break;
        case 'amount': av = Number(a.total_gross_amount || 0); bv = Number(b.total_gross_amount || 0); break;
        case 'status': av = a.arrears_status || ''; bv = b.arrears_status || ''; break;
        default: return 0;
      }
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'hu') * dir;
    });
    })();
    if (!searchTerm.trim()) return base;
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const terms = norm(searchTerm).split(/\s+/).filter(Boolean);
    return base.filter((r) => {
      const haystack = norm([
        r.invoice_number,
        r.customer?.name,
        r.notes,
        r.due_date,
        r.issue_date,
        r.delivery_date,
      ].join(' '));
      return terms.every((t) => haystack.includes(t));
    });
  }, [rows, sortKey, sortDir, searchTerm]);

  const selectedCount = selectedIds.size;
  const selectedVisibleCount = sortedRows.filter((r) => selectedIds.has(String(r.id))).length;
  const allVisibleSelected = sortedRows.length > 0 && selectedVisibleCount === sortedRows.length;

  // Keep ref in sync so handleRowCheckbox always sees current sorted rows
  sortedRowsRef.current = sortedRows;

  const handleRowCheckbox = useCallback((id, idx, e) => {
    if (e.shiftKey && lastCheckedIndexRef.current >= 0) {
      const start = Math.min(lastCheckedIndexRef.current, idx);
      const end = Math.max(lastCheckedIndexRef.current, idx);
      const rangeIds = sortedRowsRef.current.slice(start, end + 1).map(r => String(r.id));
      setSelectedIds(prev => new Set([...prev, ...rangeIds]));
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    lastCheckedIndexRef.current = idx;
  }, []);

  useEffect(() => {
    if (!headerSelectRef.current) return;
    headerSelectRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }, [selectedVisibleCount, allVisibleSelected]);

  const toggleHeaderSelection = () => {
    if (selectedCount > 0) {
      setSelectedIds(new Set());
      lastCheckedIndexRef.current = -1;
      return;
    }
    const next = new Set();
    sortedRows.forEach((r) => next.add(String(r.id)));
    setSelectedIds(next);
    lastCheckedIndexRef.current = -1;
  };

  const currentNextStatus = useMemo(() => NEXT_STATUS[statusFilter] || null, [statusFilter]);

  const advanceStatus = async ({ targetStatus, sendEmail }) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (!selectedIds.size) { toast.info('Nincs kijelölt számla'); return; }
    setSending(true);
    try {
      const payload = {
        company_id: companyId,
        invoice_ids: Array.from(selectedIds),
        target_status: targetStatus,
        send_email: !!sendEmail,
      };
      const res = await invoiceAPI.advanceArrearsStatus(payload);
      const changed = Number(res.data?.changed || 0);
      const sent = Number(res.data?.email?.sent || 0);
      if (sendEmail) {
        toast.success(`Státusz frissítve: ${changed}, e-mail küldve: ${sent}`);
      } else {
        toast.success(`Státusz frissítve: ${changed}`);
      }
      setSelectedIds(new Set());
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Státuszváltás sikertelen');
    } finally {
      setSending(false);
    }
  };

  // Open email modal for individual row
  const openRowEmail = async (row, targetStatus) => {
    try {
      const params = { company_id: companyId, invoice_ids: String(row.id) };
      if (targetStatus) params.target_status = targetStatus;
      const res = await invoiceAPI.getArrearsEmailCompose(params);
      const d = res.data;
      setEmailModalData({
        from: d.from || '',
        to: d.to || [],
        cc: [],
        bcc: [],
        subject: d.subject || '',
        body: d.body || '',
        customerId: d.customer_id,
        customerName: d.customer_name || '',
        invoiceIds: [String(row.id)],
        invoices: d.invoices || [{ id: String(row.id), invoice_number: d.invoice_number || '' }],
        advanceStatus: targetStatus || '',
      });
      setBulkEmailQueue([]);
      setBulkEmailIndex(0);
      setBulkEmailSentSet(new Set());
      setEmailModalOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'E-mail előkészítés sikertelen');
    }
  };

  // Open bulk email flow: group selected rows by customer, build queue, load first
  const openBulkEmailFlow = async (targetStatus) => {
    if (!selectedIds.size) { toast.info('Nincs kijelölt számla'); return; }
    // Group selected rows by customer id
    const byCustomer = {};
    for (const row of sortedRows) {
      if (!selectedIds.has(String(row.id))) continue;
      const cid = String(row.customer?.id || row.customer_id || '');
      if (!byCustomer[cid]) byCustomer[cid] = { customerName: row.customer?.name || '', invoiceIds: [] };
      byCustomer[cid].invoiceIds.push(String(row.id));
    }
    const queue = Object.values(byCustomer);
    if (!queue.length) return;
    setBulkEmailQueue(queue);
    setBulkEmailIndex(0);
    setBulkEmailSentSet(new Set());
    // Load first customer's email compose
    setBulkEmailLoading(true);
    try {
      const first = queue[0];
      const params = { company_id: companyId, invoice_ids: first.invoiceIds.join(',') };
      if (targetStatus) params.target_status = targetStatus;
      const res = await invoiceAPI.getArrearsEmailCompose(params);
      const d = res.data;
      setEmailModalData({
        from: d.from || '',
        to: d.to || [],
        cc: [],
        bcc: [],
        subject: d.subject || '',
        body: d.body || '',
        customerId: d.customer_id,
        customerName: d.customer_name || first.customerName,
        invoiceIds: first.invoiceIds,
        invoices: d.invoices || first.invoiceIds.map(id => ({ id, invoice_number: '' })),
        advanceStatus: targetStatus || '',
      });
      setEmailModalOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'E-mail előkészítés sikertelen');
    } finally {
      setBulkEmailLoading(false);
    }
  };

  // Navigate bulk email queue to a specific index
  const navigateBulkEmail = async (newIndex) => {
    const entry = bulkEmailQueue[newIndex];
    if (!entry) return;
    setBulkEmailIndex(newIndex);
    setBulkEmailLoading(true);
    try {
      const params = { company_id: companyId, invoice_ids: entry.invoiceIds.join(',') };
      if (emailModalData?.advanceStatus) params.target_status = emailModalData.advanceStatus;
      const res = await invoiceAPI.getArrearsEmailCompose(params);
      const d = res.data;
      setEmailModalData(prev => ({
        ...prev,
        from: d.from || '',
        to: d.to || [],
        cc: [],
        bcc: [],
        subject: d.subject || '',
        body: d.body || '',
        customerId: d.customer_id,
        customerName: d.customer_name || entry.customerName,
        invoiceIds: entry.invoiceIds,
        invoices: d.invoices || entry.invoiceIds.map(id => ({ id, invoice_number: '' })),
      }));
    } catch (e) {
      toast.error(e?.response?.data?.error || 'E-mail előkészítés sikertelen');
    } finally {
      setBulkEmailLoading(false);
    }
  };

  // Long-press handlers for status tag
  const handleStatusMouseDown = useCallback((e, rowId) => {
    longPressTimerRef.current = setTimeout(() => {
      setStatusPickerRow(rowId);
      longPressTimerRef.current = null;
    }, 600);
  }, []);

  const handleStatusMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const changeStatusManual = async (rowId, targetStatus) => {
    setStatusPickerRow(null);
    try {
      await invoiceAPI.advanceArrearsStatus({
        company_id: companyId,
        invoice_ids: [String(rowId)],
        target_status: targetStatus,
        send_email: false,
      });
      toast.success(`Státusz beállítva: ${STATUS_LABEL[targetStatus] || targetStatus}`);
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Státuszváltás sikertelen');
    }
  };

  const sendEmailFromModal = async (emailData) => {
    try {
      await invoiceAPI.sendArrearsSingleEmail({
        company_id: companyId,
        invoice_ids: emailModalData?.invoiceIds || [],
        from: emailData.from,
        to: emailData.to,
        cc: emailData.cc || [],
        bcc: emailData.bcc || [],
        subject: emailData.subject,
        body: emailData.body,
        advance_status: emailModalData?.advanceStatus || '',
      });
      toast.success('E-mail elküldve');
      // Mark current as sent in bulk queue
      if (bulkEmailQueue.length > 1) {
        setBulkEmailSentSet(prev => new Set([...prev, bulkEmailIndex]));
        // Auto-advance to next unsent
        const nextUnsent = bulkEmailQueue.findIndex((_, i) => i > bulkEmailIndex && !bulkEmailSentSet.has(i));
        if (nextUnsent !== -1) {
          navigateBulkEmail(nextUnsent);
        } else {
          const anyUnsent = bulkEmailQueue.findIndex((_, i) => !bulkEmailSentSet.has(i) && i !== bulkEmailIndex);
          if (anyUnsent !== -1) {
            navigateBulkEmail(anyUnsent);
          } else {
            setEmailModalOpen(false);
            setBulkEmailQueue([]);
            await loadRows();
          }
        }
      } else {
        setEmailModalOpen(false);
        setBulkEmailQueue([]);
        await loadRows();
      }
    } catch (e) {
      throw e; // EmailModal handles the error display
    }
  };

  const statusAction = (() => {
    if (!statusFilter) return null;
    if (statusFilter === 'litigation') {
      return (
        <>
          <Button disabled={sending || selectedCount === 0} onClick={() => advanceStatus({ targetStatus: 'won', sendEmail: false })}>Pert nyert</Button>
          <Button disabled={sending || selectedCount === 0} onClick={() => advanceStatus({ targetStatus: 'lost', sendEmail: false })}>Pert vesztett</Button>
        </>
      );
    }
    if (!currentNextStatus) return null;
    return (
      <>
        <PrimaryButton disabled={sending || selectedCount === 0} onClick={() => advanceStatus({ targetStatus: currentNextStatus, sendEmail: true })}>
          {STATUS_LABEL[currentNextStatus] || currentNextStatus} küldése
        </PrimaryButton>
        <Button disabled={sending || selectedCount === 0} onClick={() => advanceStatus({ targetStatus: currentNextStatus, sendEmail: false })}>
          {STATUS_LABEL[currentNextStatus] || currentNextStatus} e-mail nélkül
        </Button>
      </>
    );
  })();

  // Column header helper
  const renderTh = (key, label, style = {}, hideOnMobile = false) => (
    <Th style={{ width: colWidths[key], minWidth: 60, ...style }} onClick={() => handleSort(key)} $hideOnMobile={hideOnMobile}>
      {label}
      {sortKey === key && <SortArrow>{sortDir === 'asc' ? '▲' : '▼'}</SortArrow>}
      <ThResizeHandle onMouseDown={(e) => startResize(e, key)} onClick={(e) => e.stopPropagation()} />
    </Th>
  );

  return (
    <Container>
      <Header>
        <Title>Kintlévőség</Title>
        <Toolbar>
          <SearchInput
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Keresés számlaszám, ügyfél vagy megjegyzés alapján..."
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 10px' }}>
            <option value="">Összes státusz</option>
            {STATUS_ORDER.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {statusAction}
          <Button onClick={loadRows} disabled={loading}>Frissítés</Button>
        </Toolbar>
      </Header>

      <TableWrap>
        {/* Bulk email icon buttons — visible when rows are selected */}
        {selectedCount > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: '#f0f7ff', borderBottom: '1px solid #d0e8ff', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555', marginRight: 4 }}>E-mail küldése kijelöltéknek ({selectedCount} számla):</span>
            {STATUS_ORDER.filter(s => NEXT_STATUS[s.key] !== undefined || s.key === 'overdue').map(s => (
              <button
                key={s.key}
                disabled={bulkEmailLoading || sending}
                onClick={() => openBulkEmailFlow(s.key === 'overdue' ? '' : NEXT_STATUS[s.key] || s.key)}
                title={s.label}
                style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #3498db', borderRadius: 4, background: '#fff', color: '#1a6ea8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                📧 {s.label}
              </button>
            ))}
          </div>
        )}
        <Table>
          <Thead>
            <tr>
              <Th style={{ width: 36, minWidth: 36 }}>
                <input ref={headerSelectRef} type="checkbox" checked={allVisibleSelected} onChange={toggleHeaderSelection} />
              </Th>
              {renderTh('num', 'Számlaszám')}
              {renderTh('customer', 'Ügyfél')}
              {renderTh('issue', 'Kelt', {}, true)}
              {renderTh('delivery', 'Teljesítés', {}, true)}
              {renderTh('due', 'Esedékesség', {}, true)}
              {renderTh('payment', 'Fizetési mód', {}, true)}
              {renderTh('amount', 'Összeg')}
              {renderTh('status', 'Státusz', {}, true)}
              <Th style={{ width: colWidths.actions, minWidth: 60 }} $hideOnMobile>
                Műveletek
                <ThResizeHandle onMouseDown={(e) => startResize(e, 'actions')} onClick={(e) => e.stopPropagation()} />
              </Th>
            </tr>
          </Thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => {
              const rowNextStatus = row.next_status || NEXT_STATUS[row.arrears_status] || null;
              const currentStatus = row.arrears_status;
              const hasCurrent = !!NEXT_STATUS[currentStatus] || currentStatus === 'overdue';
              const rowStyle = ARREARS_ROW_STYLE[currentStatus] || {};
              const rowActions = (
                <>
                  <Button onClick={() => window.open(`/invoices/${row.id}/edit`, '_blank')}>Megnyitás</Button>
                  {hasCurrent && (
                    <Button
                      title={`Újraküldés (${STATUS_LABEL[currentStatus] || currentStatus})`}
                      onClick={() => openRowEmail(row, '')}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      📧 Újra
                    </Button>
                  )}
                  {rowNextStatus && (
                    <Button
                      title={`Következő: ${STATUS_LABEL[rowNextStatus] || rowNextStatus}`}
                      onClick={() => openRowEmail(row, rowNextStatus)}
                      style={{ fontSize: 12, padding: '4px 8px', background: '#eaf4ff', borderColor: '#3498db', color: '#1a6ea8' }}
                    >
                      📧 {STATUS_LABEL[rowNextStatus] || rowNextStatus}
                    </Button>
                  )}
                </>
              );
              return (
                <React.Fragment key={row.id}>
                <Tr
                  style={rowStyle}
                  onContextMenu={(event) => handleRowContextMenu(event, row.id)}
                  onTouchEnd={(event) => handleRowTouchTap(event, row.id)}
                >
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(row.id))}
                      onClick={(e) => handleRowCheckbox(String(row.id), rowIndex, e)}
                      onChange={() => {}}
                    />
                  </Td>
                  <Td>{row.invoice_number}</Td>
                  <Td>{row.customer?.name || '-'}</Td>
                  <Td $hideOnMobile>{formatDate(row.issue_date)}</Td>
                  <Td $hideOnMobile>{formatDate(row.delivery_date)}</Td>
                  <Td $hideOnMobile>
                    <div>{formatDate(row.due_date)}</div>
                    {row.days_overdue > 0 && (
                      <div style={{ fontSize: 12, color: 'inherit', opacity: 0.75, marginTop: 2 }}>
                        {row.days_overdue} napja lejárt
                      </div>
                    )}
                  </Td>
                  <Td $hideOnMobile>{paymentMethodLabel(row.payment_method)}</Td>
                  <Td $mobileTextRight>
                    <div>{formatAmount(row.total_gross_amount, row.currency)}</div>
                    {Number(row.amount_paid || 0) > 0 && Number(row.remaining_amount || 0) > 0 && (
                      <div style={{ fontSize: 12, color: '#b42318', marginTop: 2, fontWeight: 600 }}>
                        Hátralék: {formatAmount(row.remaining_amount, row.currency)}
                      </div>
                    )}
                  </Td>
                  <Td $hideOnMobile>
                    <StatusPickerWrap>
                      <StatusTag
                        onMouseDown={(e) => handleStatusMouseDown(e, row.id)}
                        onMouseUp={handleStatusMouseUp}
                        onMouseLeave={handleStatusMouseUp}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        title="Hosszan tartva a státuszt manuálisan állíthatod be"
                      >
                        {row.arrears_status_label || '-'}
                      </StatusTag>
                      {statusPickerRow === row.id && (
                        <StatusPickerDropdown>
                          <StatusPickerTitle>Státusz beállítása</StatusPickerTitle>
                          {STATUS_ORDER.map((s) => (
                            <StatusPickerItem
                              key={s.key}
                              active={s.key === row.arrears_status}
                              onMouseDown={(e) => { e.preventDefault(); changeStatusManual(row.id, s.key); }}
                            >
                              {s.key === row.arrears_status ? '✓ ' : ''}{s.label}
                            </StatusPickerItem>
                          ))}
                          <StatusPickerItem
                            style={{ borderTop: '1px solid #ecf0f1', color: '#6c757d' }}
                            onMouseDown={(e) => { e.preventDefault(); setStatusPickerRow(null); }}
                          >
                            Mégse
                          </StatusPickerItem>
                        </StatusPickerDropdown>
                      )}
                    </StatusPickerWrap>
                    <Muted>{Number(row.days_in_status || 0)} nap</Muted>
                  </Td>
                  <MainActionsTd>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {rowActions}
                    </div>
                  </MainActionsTd>
                </Tr>
                <MobileActionsRow $open={mobileActionsRowId === row.id}>
                  <MobileActionsCell colSpan={10}>
                    <MobileActionsBar>
                      {rowActions}
                    </MobileActionsBar>
                  </MobileActionsCell>
                </MobileActionsRow>
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {!loading && sortedRows.length === 0 && (
        <div style={{ padding: 16 }}>Nincs megjeleníthető lejárt számla.</div>
      )}
      <div style={{ padding: '12px 16px', color: '#6c757d' }}>{selectedCount} sor kijelölve</div>

      {emailModalOpen && emailModalData && (
        <EmailModal
            isOpen={emailModalOpen}
            onClose={() => { setEmailModalOpen(false); setBulkEmailQueue([]); }}
            onSend={sendEmailFromModal}
            defaultFrom={emailModalData.from}
            defaultTo={Array.isArray(emailModalData.to) ? emailModalData.to : (emailModalData.to ? [emailModalData.to] : [])}
            defaultCc={emailModalData.cc || []}
            defaultBcc={emailModalData.bcc || []}
            defaultSubject={emailModalData.subject}
            defaultBody={emailModalData.body}
            customerId={emailModalData.customerId}
            attachments={emailModalData.invoices || []}
            headerExtra={bulkEmailQueue.length > 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigateBulkEmail(bulkEmailIndex - 1)}
                  disabled={bulkEmailIndex === 0 || bulkEmailLoading}
                  style={{ padding: '3px 10px', fontSize: 16, border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: bulkEmailIndex === 0 ? 'not-allowed' : 'pointer' }}
                >←</button>
                <span style={{ fontWeight: 600, minWidth: 50, textAlign: 'center', fontSize: 13 }}>{bulkEmailIndex + 1} / {bulkEmailQueue.length}</span>
                <button
                  onClick={() => navigateBulkEmail(bulkEmailIndex + 1)}
                  disabled={bulkEmailIndex === bulkEmailQueue.length - 1 || bulkEmailLoading}
                  style={{ padding: '3px 10px', fontSize: 16, border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: bulkEmailIndex === bulkEmailQueue.length - 1 ? 'not-allowed' : 'pointer' }}
                >→</button>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {bulkEmailQueue.map((entry, i) => (
                    <button key={i} onClick={() => navigateBulkEmail(i)}
                      style={{
                        padding: '2px 8px', fontSize: 11, borderRadius: 10,
                        border: `1px solid ${i === bulkEmailIndex ? '#3498db' : '#ccc'}`,
                        background: bulkEmailSentSet.has(i) ? '#d4f8d4' : i === bulkEmailIndex ? '#ddeeff' : '#fff',
                        color: i === bulkEmailIndex ? '#1a6ea8' : '#333',
                        cursor: 'pointer', fontWeight: i === bulkEmailIndex ? 700 : 400,
                      }}
                    >
                      {entry.customerName || `Ügyfél ${i + 1}`}{bulkEmailSentSet.has(i) ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
                {bulkEmailLoading && <span style={{ fontSize: 12, color: '#888' }}>Betöltés...</span>}
              </div>
            ) : null}
          />
      )}
    </Container>
  );
}

