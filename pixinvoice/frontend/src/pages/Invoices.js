import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Trash2, 
  Eye,
  Copy,
  FileDiff,
  Mail,
  RefreshCw,
  ArrowUp,
  Calendar,
  Pencil
} from 'lucide-react';
import styled from 'styled-components';
import { Tooltip, Pagination as AntPagination } from 'antd';
import { toast } from 'react-toastify';
import { invoiceAPI, invoiceBlockAPI, emailSettingsAPI, emailTemplateAPI } from '../services/api';
import EmailModal from '../components/EmailModal';
import Modal from '../components/Modal';

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

const SearchContainer = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;

  @media (max-width: 768px) {
    width: 100%;
    gap: 8px;

    > * {
      width: 100%;
    }
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

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const DateInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px; // slightly smaller to fit
  background: white;
  width: 140px;
`;

const FilterButton = styled.button`
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f9fa;
  color: #555;
  cursor: pointer;
  font-size: 13px;
  &:hover { background: #e9ecef; }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const ActionButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const TableContainer = styled.div`
  overflow-x: auto;

  @media (max-width: 768px) {
    overflow-x: hidden;
  }
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
    word-break: normal;
    overflow-wrap: break-word;

    &:nth-child(1) {
      width: 28px;
      padding-left: 6px;
      padding-right: 4px;
    }

    &:nth-child(8) {
      width: 96px;
      text-align: right;
    }

    &:nth-child(2) {
      width: 32%;
    }

    &:nth-child(3) {
      width: calc(68% - 124px);
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6),
    &:nth-child(7),
    &:nth-child(9),
    &:nth-child(10) {
      display: none;
    }
  }
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover {
    background-color: #f8f9fa;
  }
  ${props => props.$storno ? 'background: #ffe5e5;' : ''}
  ${props => props.$cancelled ? 'background: #ffe5e5;' : ''}
  ${props => (!props.$storno && props.$paid) ? 'background: #eafaf1;' : ''}
  ${props => (!props.$storno && !props.$paid && props.$unpaid) ? 'background: #f3e8ff;' : ''}
`;

const TableCell = styled.td`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    white-space: normal;
    word-break: normal;
    overflow-wrap: break-word;

    &:nth-child(1) {
      width: 28px;
      padding-left: 6px;
      padding-right: 4px;
    }

    &:nth-child(8) {
      width: 96px;
      text-align: right;
      white-space: nowrap;
    }

    &:nth-child(2) {
      width: 32%;
    }

    &:nth-child(3) {
      width: calc(68% - 124px);
    }

    &:nth-child(4),
    &:nth-child(5),
    &:nth-child(6),
    &:nth-child(7),
    &:nth-child(9),
    &:nth-child(10) {
      display: none;
    }
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

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${props => {
    switch (props.status) {
      case 'draft': return '#f39c12';
      case 'sent': return '#3498db';
      case 'paid': return '#27ae60';
      case 'cancelled': return '#e74c3c';
      case 'submitted_to_nav': return '#9b59b6';
      case 'nav_processed': return '#27ae60';
      case 'nav_rejected': return '#e74c3c';
      default: return '#95a5a6';
    }
  }};
  color: white;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;

  @media (max-width: 768px) {
    gap: 6px;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }

    scrollbar-width: none;
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  background-color: ${props => {
    switch (props.variant) {
      case 'edit': return '#3498db';
      case 'delete': return '#e74c3c';
      case 'send': return '#27ae60';
      case 'view': return '#6c757d';
      case 'status': return '#8e44ad';
      case 'copy': return '#2c3e50'; // sötétkék
      case 'correct': return '#ff6b6b'; // világos piros
      case 'storno': return '#c0392b'; // sötét piros
      case 'nav': return '#27ae60'; // zöld
      case 'email': return '#3498db'; // kék
      default: return '#f8f9fa';
    }
  }};
  color: white;
  font-size: ${props => props.$fontSize || '16px'};
  font-weight: ${props => props.$fontWeight || 'normal'};

  &:hover {
    opacity: 0.8;
  }

  @media (max-width: 768px) {
    width: 28px;
    height: 28px;
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  gap: 8px;
`;

const PaginationButton = styled.button`
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  color: #2c3e50;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #f8f9fa;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.active {
    background-color: #3498db;
    color: white;
    border-color: #3498db;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
`;

const SelectionSummaryBar = styled.div`
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid #d6eaf8;
  background: #f4f9fe;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
`;

const SelectionSummaryItem = styled.div`
  font-size: 14px;
  color: #2c3e50;
`;
const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const applyTemplateVars = (template, vars = {}) => {
  let out = String(template || '');
  Object.entries(vars || {}).forEach(([key, value]) => {
    const rendered = value == null ? '' : String(value);
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), rendered);
    out = out.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), rendered);
  });
  return out;
};

const calcSettlementState = (invoice) => {
  const totalGross = Number(invoice?.total_gross_amount || 0);
  const paidAmount = Number(invoice?.amount_paid || 0);
  const currency = String(invoice?.currency || 'HUF').toUpperCase();
  const paymentMethod = String(invoice?.payment_method || '').toLowerCase();
  const roundedPayable = (currency === 'HUF' && (paymentMethod === 'cash' || paymentMethod === 'cod'))
    ? (Math.round(Math.round(totalGross) / 5) * 5)
    : totalGross;
  const tolerance = currency === 'HUF' ? 5 : 0.01;
  const remainingAmount = Math.max(roundedPayable - paidAmount, 0);
  const isSettled = roundedPayable > 0 && remainingAmount < tolerance;
  return {
    isSettled,
    remainingAmount,
    roundedPayable,
    currency,
    paymentMethod,
  };
};

const Invoices = () => {
  const getNavErrorMessage = (response) => {
    if (!response) return null;
    try {
      const match = response.match(/<(?:\w+:)?message>\s*(.*?)\s*<\/(?:\w+:)?message>/);
      if (match && match[1]) return match[1];
      // Ha nem XML vagy nincs üzenet tag, és rövid, akkor visszaadjuk
      if (response.length < 100) return response;
      return "Hiba részleteiért lásd a naplót.";
    } catch (e) {
      return "Ismeretlen hiba";
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [issueDateFrom, setIssueDateFrom] = useState('');
  const [issueDateTo, setIssueDateTo] = useState('');
  const [deliveryDateFrom, setDeliveryDateFrom] = useState('');
  const [deliveryDateTo, setDeliveryDateTo] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  
  const queryClient = useQueryClient();
  const [navStatusMap, setNavStatusMap] = useState({});
  const [navStatusLoading, setNavStatusLoading] = useState({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState(null);
  const [emailDefaults, setEmailDefaults] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [stornoModalOpen, setStornoModalOpen] = useState(false);
  const [stornoInvoice, setStornoInvoice] = useState(null);
  const [stornoProcessing, setStornoProcessing] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [navLogModalOpen, setNavLogModalOpen] = useState(false);
  const [navLogInvoice, setNavLogInvoice] = useState(null);
  const [mobileActionsInvoiceId, setMobileActionsInvoiceId] = useState(null);
  const navigate = useNavigate();
  const headerSelectRef = React.useRef(null);

  const openNavLogModal = (invoice) => {
    setNavLogInvoice(invoice || null);
    setNavLogModalOpen(true);
  };

  // Helper for quick dates
  const applyQuickDate = (field, type) => {
    const today = new Date();
    const formatDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    let from = '';
    let to = '';
    
    if (type === 'today') {
      const d = formatDate(today);
      from = d;
      to = d;
    } else if (type === 'week') {
      const day = today.getDay() || 7; 
      if (day !== 1) today.setHours(-24 * (day - 1));
      from = formatDate(today);
      today.setHours(24 * 6);
      to = formatDate(today);
    } else if (type === 'month') {
      from = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
      to = formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (type === 'prev_month') {
      from = formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      to = formatDate(new Date(today.getFullYear(), today.getMonth(), 0));
    }

    if (field === 'issue') {
      setIssueDateFrom(from);
      setIssueDateTo(to);
    } else {
      setDeliveryDateFrom(from);
      setDeliveryDateTo(to);
    }
  };

  // Keep company selection in sync with sidebar/localStorage
  React.useEffect(() => {
    const sync = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setSelectedCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    const id = setInterval(sync, 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(id); };
  }, []);

  // Reset page when company changes
  React.useEffect(() => { setCurrentPage(1); }, [selectedCompanyId]);

  const { data: invoiceBlocks } = useQuery(
    ['invoiceBlocks', { company_id: selectedCompanyId }],
    () => invoiceBlockAPI.getInvoiceBlocks({ company_id: selectedCompanyId }).then(res => res.data?.results || res.data),
    { enabled: !!selectedCompanyId }
  );

  const { data: invoices, isLoading, error } = useQuery(
    ['invoices', { 
      search: searchTerm, 
      status: statusFilter, 
      block: blockFilter, 
      page: currentPage, 
      page_size: pageSize,
      company_id: selectedCompanyId,
      issueDateFrom, issueDateTo, deliveryDateFrom, deliveryDateTo
    }],
    () => invoiceAPI.getInvoices({
      search: searchTerm || undefined,
      status: (statusFilter && !['due', 'overdue'].includes(statusFilter)) ? statusFilter : undefined,
      invoice_block: blockFilter || undefined,
      issue_date_from: issueDateFrom || undefined,
      issue_date_to: issueDateTo || undefined,
      delivery_date_from: deliveryDateFrom || undefined,
      delivery_date_to: deliveryDateTo || undefined,
      page: currentPage,
      page_size: pageSize,
      company_id: selectedCompanyId || undefined,
    }),
    {
      keepPreviousData: true,
      select: (response) => response.data,
    }
  );

  const filteredInvoices = React.useMemo(() => {
    const list = invoices?.results || [];
    if (!['due', 'overdue'].includes(statusFilter)) return list;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return list.filter((inv) => {
      const settlement = calcSettlementState(inv);
      if (settlement.isSettled) return false;
      const dueDate = parseDateOnly(inv?.due_date);
      if (!dueDate) return false;
      if (statusFilter === 'overdue') return dueDate < today;
      return dueDate >= today;
    });
  }, [invoices, statusFilter]);

  const visibleInvoices = filteredInvoices || [];
  const selectedVisibleCount = visibleInvoices.filter(inv => selectedIds.has(inv.id)).length;
  const allVisibleSelected = visibleInvoices.length > 0 && selectedVisibleCount === visibleInvoices.length;
  const selectedVisibleInvoices = React.useMemo(
    () => visibleInvoices.filter((inv) => selectedIds.has(inv.id)),
    [visibleInvoices, selectedIds]
  );
  const selectedTotalsByCurrency = React.useMemo(() => {
    return selectedVisibleInvoices.reduce((acc, inv) => {
      const currency = (inv?.currency || 'HUF').toUpperCase();
      if (!acc[currency]) {
        acc[currency] = { net: 0, vat: 0, gross: 0 };
      }
      acc[currency].net += Number(inv?.total_net_amount || 0);
      acc[currency].vat += Number(inv?.total_vat_amount || 0);
      acc[currency].gross += Number(inv?.total_gross_amount || 0);
      return acc;
    }, {});
  }, [selectedVisibleInvoices]);

  React.useEffect(() => {
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

  const toggleMobileActionsForInvoice = React.useCallback((invoiceId) => {
    setMobileActionsInvoiceId((prev) => (prev === invoiceId ? null : invoiceId));
  }, []);

  const handleRowTouchTap = React.useCallback((event, invoiceId) => {
    if (!isMobileViewport()) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input,button,a,label,select,textarea,[role="button"]')) {
      return;
    }
    event.preventDefault();
    toggleMobileActionsForInvoice(invoiceId);
  }, [toggleMobileActionsForInvoice]);

  const handleRowContextMenu = React.useCallback((event, invoiceId) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    toggleMobileActionsForInvoice(invoiceId);
  }, [toggleMobileActionsForInvoice]);

  const submitToNAVMutation = useMutation(
    (id) => invoiceAPI.submitToNAV(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('invoices');
        toast.success('Számla elküldve a NAV-nak');
      },
      onError: (e) => {
        const msg = e?.response?.data?.error || e?.response?.data?.error_message || e?.message || 'Hiba történt a NAV-nak való küldés során';
        toast.error(msg);
        if (e?.response?.data?.func_code) {
          // optional console detail to debug NAV funcCode
          // eslint-disable-next-line no-console
          console.warn('NAV func_code:', e.response.data.func_code);
        }
      },
    }
  );

  const handleSubmitToNAV = (id) => {
    if (window.confirm('Biztosan elküldi ezt a számlát a NAV-nak?')) {
      submitToNAVMutation.mutate(id);
    }
  };

  const handleCheckNAVStatus = async (id) => {
    try {
      setNavStatusLoading((s) => ({ ...s, [id]: true }));
      const res = await invoiceAPI.getNAVStatus(id);
      const data = res.data || {};
      setNavStatusMap((m) => ({
        ...m,
        [id]: {
          processing_status: data.processing_status || data.invoice_status || 'ismeretlen',
          error: data.error_message || data.error || null,
          success: data.success !== false,
        },
      }));
    } catch (e) {
      setNavStatusMap((m) => ({
        ...m,
        [id]: { processing_status: 'ismeretlen', error: 'Lekérdezési hiba', success: false },
      }));
    } finally {
      setNavStatusLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const handleStornoConfirm = async () => {
    if (!stornoInvoice) return;
    
    setStornoProcessing(true);
    try {
      let createdIds = [];
      
      if (stornoInvoice.invoice_category === 'ADVANCE') {
        const { data } = await invoiceAPI.advanceUsage(stornoInvoice.id);
        const finals = data?.results || [];
        if (finals.length) {
          // Cascade storno for advance invoices
          const response = await invoiceAPI.cascadeStorno(stornoInvoice.id);
          createdIds = response.data?.created_storno_ids || [];
        } else {
          const response = await invoiceAPI.storno(stornoInvoice.id);
          createdIds = response.data?.created_storno_ids || [response.data?.id];
        }
      } else {
        const response = await invoiceAPI.storno(stornoInvoice.id);
        createdIds = response.data?.created_storno_ids || [response.data?.id];
      }
      
      // Automatikusan NAV-hoz küldés minden létrehozott sztornó számláról
      for (const id of createdIds) {
        if (id) {
          try {
            await invoiceAPI.submitToNAV(id);
          } catch (navErr) {
            console.error('NAV submission error for invoice', id, navErr);
            toast.error(`Hiba a NAV-hoz küldés során: ${id}`);
          }
        }
      }
      
      toast.success('Sztornózás kész és elküldve a NAV-nak!');
      setStornoModalOpen(false);
      setStornoInvoice(null);
      queryClient.invalidateQueries('invoices');
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Hiba történt a sztornózás során';
      toast.error(msg);
    } finally {
      setStornoProcessing(false);
    }
  };

  const openEmailModal = async (invoice) => {
    setEmailInvoice(invoice);
    setBulkMode(false);
    const defTo = [];
    if (invoice?.customer?.email) defTo.push(invoice.customer.email);
  let subject = `Számla ${invoice.invoice_number}`;
  const company = invoice?.company || {};
  const customer = invoice?.customer || {};
  const userName = localStorage.getItem('userFullName') || '';
  const userPhone = localStorage.getItem('userPhone') || '';
  const companyShort = company.short_name || company.name || '';
  const companyWebsite = company.website || '';
  const companyAddr = [company.postal_code, company.city, [company.street_name, company.street_number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const companyTax = company.full_tax_number || company.tax_number || '';
  const todayIso = new Date().toISOString().slice(0, 10);
  const totalStr = `${(invoice.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${invoice.currency || ''}`;
  const row = `${invoice.invoice_number}\t${invoice.issue_date}\t${(invoice.total_net_amount||0).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} (HUF)\t${(invoice.total_vat_amount||0).toLocaleString('hu-HU', {minimumFractionDigits: 0, maximumFractionDigits: 0})} (HUF)`;
  const templateVars = {
    customer_name: customer.name || 'Ügyfelünk',
    company_name: company.name || '',
    invoice_number: invoice.invoice_number || '',
    due_date: invoice.due_date || '',
    total: totalStr,
    invoice_items_table: row,
    as_of_date: todayIso,
    today_date: todayIso,
    today_city_date: `${company.city ? `${company.city}, ` : ''}${todayIso}`,
    total_outstanding: totalStr,
    invoice_count: '1',
    currency: invoice.currency || 'HUF',
    invoices_table: `${invoice.issue_date || ''} - ${invoice.invoice_number || ''}`,
    signature_html: '',
  };
  let body = [
    `Tisztelt ${customer.name || 'Ügyfelünk'}!`,
    '',
    'Mellékelve küldöm az alábbi számlát/számlákat:',
    '',
    'Számla sorszám\tKelt\tNetto(HUF)\tÁfa(HUF)',
    row,
    '',
    'Kérem nyomtassa ki és továbbítsa könyvelőjének.',
    '',
    'A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.',
    '',
    'A számlák aláírás és pecsét nélkül is érvényes!',
    '--',
    'Üdvözlettel,',
    userName,
    userPhone,
    companyWebsite,
    companyShort,
    `${companyAddr}`,
    `${companyTax}`,
  ].join('<br>');
    let defaultFrom = invoice?.company?.email || '';
    let defaultReplyTo = defaultFrom;
    try {
      const companyId = invoice?.company?.id || localStorage.getItem('selectedCompanyId');
      if (companyId) {
        const [res, templateRes] = await Promise.all([
          emailSettingsAPI.getSettings({ company_id: companyId }),
          emailTemplateAPI.list({ company_id: companyId, template_type: 'invoice_send' }).catch(() => ({ data: [] })),
        ]);
        const s = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data);
        const templateRowsRaw = Array.isArray(templateRes?.data) ? templateRes.data : (templateRes?.data?.results || []);
        const templateRows = templateRowsRaw.filter((t) => String(t?.template_type || '') === 'invoice_send');
        const huTemplate = templateRows.find((t) => String(t?.language || 'hu') === 'hu' && t?.is_active !== false)
          || templateRows.find((t) => String(t?.language || 'hu') === 'hu')
          || null;
        const enTemplate = templateRows.find((t) => String(t?.language || '') === 'en' && t?.is_active !== false)
          || templateRows.find((t) => String(t?.language || '') === 'en')
          || null;
        if (s) {
          if (s.smtp_from) {
             defaultFrom = s.smtp_from;
             defaultReplyTo = s.smtp_from;
          }
          const bilingual = (invoice.currency || '').toUpperCase() !== 'HUF';

          // Generate items table string
          let itemsTable = 'Megnevezés\tMennyiség\tNettó ár\tBruttó ár';
          if (Array.isArray(invoice.items)) {
             const lines = invoice.items.map(item => {
                 const n = item.name || '';
                 const q = `${item.quantity || 0} ${item.unit || ''}`;
                 const net = (item.net_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                 const gr = (item.gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                 return `${n}\t${q}\t${net}\t${gr}`;
             });
             if (lines.length > 0) itemsTable += '\n' + lines.join('\n');
          }

          const fill = (tpl) => applyTemplateVars(tpl, {
            ...templateVars,
            invoice_items_table: itemsTable,
          });

          if (huTemplate?.subject_template) subject = fill(huTemplate.subject_template);
          else if (s.default_subject_template) subject = fill(s.default_subject_template);

          if (huTemplate?.body_template) body = fill(huTemplate.body_template);
          else if (s.default_body_template) body = fill(s.default_body_template);

          if (bilingual) {
            const enSubj = fill(enTemplate?.subject_template || s.subject_template_en) || `Invoice ${invoice.invoice_number}`;
            const enBody = fill(enTemplate?.body_template || s.body_template_en) || `Dear ${invoice.customer?.name || 'Customer'},\n\nPlease find attached invoice ${invoice.invoice_number}.\n\nBest regards,\n${invoice.company?.name || ''}`;
            subject = `${enSubj} / ${subject}`;
            body = `${enBody}\n\n---\n\n${body}`;
          }
        } else {
          const fill = (tpl) => applyTemplateVars(tpl, templateVars);
          if (huTemplate?.subject_template) subject = fill(huTemplate.subject_template);
          if (huTemplate?.body_template) body = fill(huTemplate.body_template);
        }
      }
    } catch (e) {}
    setEmailDefaults({
      defaultFrom,
      defaultReplyTo,
      defaultTo: defTo,
      defaultCc: [],
      defaultBcc: [],
      defaultSubject: subject,
      defaultBody: body,
      defaultUseThunderbird: false,
      defaultThunderbirdPath: '',
    });
    setEmailModalOpen(true);
  };

  const openBulkEmailModal = async () => {
    const list = (invoices?.results || []).filter(inv => selectedIds.has(inv.id));
    if (!list.length) return;
    setEmailInvoice(null);
    setBulkMode(true);
    const companyId = list[0]?.company?.id || localStorage.getItem('selectedCompanyId');
    let defaultFrom = list[0]?.company?.email || '';
    let defaultReplyTo = defaultFrom;
    let to = [];
    const sameCustomer = list.every(inv => inv.customer?.id === list[0]?.customer?.id);
    if (sameCustomer && list[0]?.customer?.email) to = [list[0].customer.email];
    let subject = '';
    let body = '';
    let defaultUseThunderbird = false;
    let defaultThunderbirdPath = '';
    const todayIso = new Date().toISOString().slice(0, 10);
    const invoicesTable = list.map(inv => `${inv.issue_date || ''} - ${inv.invoice_number || ''}`).join('\n');
    const totalOutstandingValue = list.reduce((sum, inv) => sum + Number(inv.total_gross_amount || 0), 0);
    const bulkVarsBase = {
      customer_name: list[0]?.customer?.name || '',
      company_name: list[0]?.company?.name || '',
      invoice_number: list[0]?.invoice_number || '',
      due_date: list[0]?.due_date || '',
      total: `${(list[0]?.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${list[0]?.currency || ''}`,
      as_of_date: todayIso,
      today_date: todayIso,
      today_city_date: `${list[0]?.company?.city ? `${list[0].company.city}, ` : ''}${todayIso}`,
      total_outstanding: `${totalOutstandingValue.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${list[0]?.currency || ''}`,
      invoice_count: String(list.length),
      currency: list[0]?.currency || 'HUF',
      invoices_table: invoicesTable,
      invoice_items_table: invoicesTable,
      signature_html: '',
    };
    try {
      if (companyId) {
        const [res, templateRes] = await Promise.all([
          emailSettingsAPI.getSettings({ company_id: companyId }),
          emailTemplateAPI.list({ company_id: companyId, template_type: 'invoice_send' }).catch(() => ({ data: [] })),
        ]);
        const s = (res.data?.results && res.data.results[0]) || (Array.isArray(res.data) ? res.data[0] : res.data);
        const templateRowsRaw = Array.isArray(templateRes?.data) ? templateRes.data : (templateRes?.data?.results || []);
        const templateRows = templateRowsRaw.filter((t) => String(t?.template_type || '') === 'invoice_send');
        const huTemplate = templateRows.find((t) => String(t?.language || 'hu') === 'hu' && t?.is_active !== false)
          || templateRows.find((t) => String(t?.language || 'hu') === 'hu')
          || null;
        const enTemplate = templateRows.find((t) => String(t?.language || '') === 'en' && t?.is_active !== false)
          || templateRows.find((t) => String(t?.language || '') === 'en')
          || null;
        if (s) {
          if (s.smtp_from) {
             defaultFrom = s.smtp_from;
             defaultReplyTo = s.smtp_from;
          }
          defaultUseThunderbird = !!s.use_thunderbird;
          defaultThunderbirdPath = s.thunderbird_path || '';
          const fill = (tpl, inv) => applyTemplateVars(tpl, {
            ...bulkVarsBase,
            invoice_number: inv?.invoice_number || bulkVarsBase.invoice_number,
            customer_name: inv?.customer?.name || bulkVarsBase.customer_name,
            due_date: inv?.due_date || bulkVarsBase.due_date,
            total: `${(inv?.total_gross_amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${inv?.currency || bulkVarsBase.currency}`,
            currency: inv?.currency || bulkVarsBase.currency,
          });
          if (huTemplate?.subject_template) subject = fill(huTemplate.subject_template, list[0]);
          else if (s.default_subject_template) subject = fill(s.default_subject_template, list[0]);
          // Csak akkor használjuk a sablont, ha EGYETLEN számlát küldünk.
          // Több számla esetén a generált listát használjuk.
          if (list.length === 1) {
            if (huTemplate?.body_template) body = fill(huTemplate.body_template, list[0]);
            else if (s.default_body_template) body = fill(s.default_body_template, list[0]);
          }
          const anyFx = list.some(inv => (inv.currency || '').toUpperCase() !== 'HUF');
          if (anyFx) {
            const enSubj = fill(enTemplate?.subject_template || s.subject_template_en, list[0]) || `Invoice ${list[0]?.invoice_number || ''}`;
            // Angol törzs: csak akkor használjuk a sablont, ha 1 db számla van.
            let enBody = '';
            if (list.length === 1) {
                enBody = fill(enTemplate?.body_template || s.body_template_en, list[0]) || `Dear ${list[0]?.customer?.name || 'Customer'},\n\nPlease find attached invoice(s).\n\nBest regards,\n${list[0]?.company?.name || ''}`;
            }
            
            subject = subject ? `${subject} / ${enSubj}` : enSubj;
            
            if (enBody) {
                body = body ? `${body}\n\n---\n\n${enBody}` : enBody;
            }
          }
          if (defaultUseThunderbird) {
            try {
              const resDraft = await invoiceAPI.draftBulkEML({
                invoice_ids: list.map(i=>i.id),
                to,
                cc: [],
                bcc: [],
                subject,
                body,
              });
              const blob = new Blob([resDraft.data], { type: 'message/rfc822' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `invoices_${list.length}_db.eml`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
              toast.success('EML letöltve');
              return; // do not open modal
            } catch (err) {
              toast.error('EML generálási hiba');
              return;
            }
          }
        }
      }
    } catch (e) {}

    if (!body) {
      const rows = [];
      list.forEach(inv => {
        // Formátum: [Kelt dátum] - [Számlaszám]
        rows.push(`${inv.issue_date} - ${inv.invoice_number}`);
      });
      
      const header = [
        'Tisztelt Ügyfelünk!',
        '',
        'Mellékelve küldöm az alábbi számlákat:',
        '',
      ];
      const footer = [
        '',
        'Kérem nyomtassa ki és továbbítsa könyvelőjének.',
        '',
        'A küldött számla nem E-számla, a befogadónak a kinyomtatott, papír alapú számlát kell könyvelésében rögzítenie, tárolnia.',
        '',
        'A számlák aláírás és pecsét nélkül is érvényes!',
        '--',
        `Üdvözlettel,`,
        list[0]?.company?.name || ''
      ];

      // Ha van beállított aláírás (company adatokból), azt is hozzáadhatnánk, 
      // de a kérés szerint csak a sorszámok formátuma a lényeg. 
      // A fenti footer egyezik a backend-es generálással.
      // HTML editorhoz <br> szükséges a sortöréshez
      body = [...header, ...rows, ...footer].join('<br>');
    }
    if (!subject) {
      subject = list.length === 1 ? `Számla ${list[0].invoice_number}` : `Számlák: ${list.map(i=>i.invoice_number).join(', ')}`;
    }

    setEmailDefaults({
      defaultFrom,
      defaultReplyTo,
      defaultTo: to,
      defaultCc: [],
      defaultBcc: [],
      defaultSubject: subject,
      defaultBody: body,
      invoiceIds: list.map(i=>i.id),
      defaultUseThunderbird,
      defaultThunderbirdPath,
    });
    setEmailModalOpen(true);
  };

  const sendEmailFromModal = async (payload) => {
    try {
      if (bulkMode) {
        const ids = emailDefaults?.invoiceIds || Array.from(selectedIds);
        await invoiceAPI.sendBulkEmail({ ...payload, invoice_ids: ids });
      } else {
        if (!emailInvoice) return;
        await invoiceAPI.sendEmail(emailInvoice.id, payload);
      }
      toast.success('E-mail elküldve');
      queryClient.invalidateQueries('invoices');
      if (bulkMode) setSelectedIds(new Set());
    } catch (e) {
      const msg = e?.response?.data?.error || 'E-mail küldési hiba';
      toast.error(msg);
      throw e; // keep modal button state consistent
    }
  };

  const exportSelectedInvoicesCsv = () => {
    const list = (invoices?.results || []).filter(inv => selectedIds.has(inv.id));
    if (!list.length) {
      toast.info('Nincs kijelölt tétel');
      return;
    }
    const headers = [
      'szamlaszam',
      'ugyfel',
      'kelt',
      'teljesites',
      'esedekesseg',
      'fizetesi_mod',
      'statusz',
      'deviza',
      'netto',
      'afa',
      'brutto',
      'tipus',
    ];
    const escapeCell = (value) => {
      const str = value == null ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = list.map((invoice) => [
      invoice.invoice_number || '',
      invoice.customer?.name || '',
      invoice.issue_date || '',
      invoice.delivery_date || '',
      invoice.due_date || '',
      invoice.payment_method || '',
      invoice.status || '',
      invoice.currency || 'HUF',
      invoice.total_net_amount ?? '',
      invoice.total_vat_amount ?? '',
      invoice.total_gross_amount ?? '',
      'Számlák',
    ]);
    const csv = [headers, ...rows].map(cols => cols.map(escapeCell).join(';')).join('\n');
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kijelolt_szamlak_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`CSV export elkészült (${list.length} tétel)`);
  };

  const formatCurrency = (amount, currency = 'HUF') => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'HUF' ? 0 : 2,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2,
    }).format(amount);
  };

  const formatNumberPlain = (value, { min = 0, max = 2 } = {}) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return new Intl.NumberFormat('hu-HU', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(num);
  };

  const getItemsTooltipContent = (invoice) => {
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    if (!items.length) return null;
    const currency = invoice?.currency || 'HUF';
    return (
      <div style={{ minWidth: 380 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>Megnevezés</th>
              <th style={{ textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>Menny.</th>
              <th style={{ textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>Egységár</th>
              <th style={{ textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>Nettó</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const name = String(item?.description || item?.name || '-').trim() || '-';
              return (
                <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
                  <td style={{ padding: '3px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</td>
                  <td style={{ textAlign: 'right', padding: '3px 8px', whiteSpace: 'nowrap' }}>{formatNumberPlain(item?.quantity, { min: 0, max: 4 })} {item?.unit || ''}</td>
                  <td style={{ textAlign: 'right', padding: '3px 8px', whiteSpace: 'nowrap' }}>{formatCurrency(item?.unit_price, currency)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 8px', whiteSpace: 'nowrap' }}>{formatCurrency(item?.net_amount, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('hu-HU');
  };

  const getStatusLabel = (status) => {
    const labels = {
      'draft': 'Draft',
      'sent': 'Elküldve',
      'paid': 'Fizetve',
      'cancelled': 'Törölve',
      'submitted_to_nav': 'NAV-ban',
      'nav_processed': 'NAV feldolgozva',
      'nav_rejected': 'NAV elutasítva',
    };
    return labels[status] || status;
  };

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return (
      <div style={{ color: '#e74c3c', textAlign: 'center', padding: '40px' }}>
        Hiba történt az adatok betöltése során
      </div>
    );
  }

  return (
    <>
    <InvoicesContainer>
      <InvoicesHeader>
        <Title>Számlák</Title>
        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Keresés számlaszám, ügyfél vagy megjegyzés alapján..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Összes státusz</option>
            <option value="due">Esedékes</option>
            <option value="overdue">Lejárt</option>
            <option value="draft">Draft</option>
            <option value="sent">Elküldve</option>
            <option value="paid">Fizetve</option>
            <option value="cancelled">Törölve</option>
            <option value="submitted_to_nav">NAV-ban</option>
            <option value="nav_processed">NAV feldolgozva</option>
            <option value="nav_rejected">NAV elutasítva</option>
          </FilterSelect>
          <FilterSelect
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            <option value="">Összes számlatömb</option>
            {(invoiceBlocks || []).map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.prefix})
              </option>
            ))}
          </FilterSelect>
          
          <FilterButton onClick={() => setDateModalOpen(true)} style={{display:'flex', alignItems:'center', gap:6}}>
            <Calendar size={14} /> Dátum szűrés
            {(issueDateFrom || issueDateTo || deliveryDateFrom || deliveryDateTo) && (
                <span style={{width:8, height:8, borderRadius:'100%', background:'#3498db'}}></span>
            )}
          </FilterButton>

          <ActionButton to="/invoices/new">
            <Plus size={16} />
            Új számla
          </ActionButton>
          {statusFilter === 'overdue' && (
            <button
              onClick={() => navigate('/arrears')}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderRadius: 4,
                background: '#e67e22',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Kintlévőség kezelése
            </button>
          )}
        </SearchContainer>
      </InvoicesHeader>

      {selectedVisibleInvoices.length > 0 && (
        <SelectionSummaryBar>
          <SelectionSummaryItem>
            <strong>{selectedVisibleInvoices.length}</strong> kijelölt számla összesen:
          </SelectionSummaryItem>
          {Object.entries(selectedTotalsByCurrency).map(([currency, totals]) => (
            <SelectionSummaryItem key={currency}>
              <strong>{currency}</strong> — Nettó: {formatCurrency(totals.net, currency)}, ÁFA: {formatCurrency(totals.vat, currency)}, Bruttó: {formatCurrency(totals.gross, currency)}
            </SelectionSummaryItem>
          ))}
        </SelectionSummaryBar>
      )}

      {invoices?.count > 0 && (
        <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #ecf0f1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ marginRight: 'auto', fontSize: 13, color: '#7f8c8d' }}>
            Összesen {invoices.count} számla
          </div>
          <AntPagination
            simple={false}
            current={currentPage}
            pageSize={pageSize}
            total={invoices.count}
            showSizeChanger
            onChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setCurrentPage(1); } else { setCurrentPage(p); } }}
            onShowSizeChange={(current, size) => { setPageSize(size); setCurrentPage(1); }}
            pageSizeOptions={['20', '50', '100', '200']}
            showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
          />
        </div>
      )}

      <TableContainer>
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>
                <input
                  ref={headerSelectRef}
                  type="checkbox"
                  onChange={()=>{
                    if (selectedIds.size > 0) {
                      setSelectedIds(new Set());
                      return;
                    }
                    const set = new Set();
                    const rows = visibleInvoices;
                    rows.forEach(inv=>set.add(inv.id));
                    setSelectedIds(set);
                  }}
                  checked={allVisibleSelected}
                />
              </TableHeaderCell>
              <TableHeaderCell>Számlaszám</TableHeaderCell>
              <TableHeaderCell>Ügyfél</TableHeaderCell>
              <TableHeaderCell>Kelt</TableHeaderCell>
              <TableHeaderCell>Teljesítés</TableHeaderCell>
              <TableHeaderCell>Esedékesség</TableHeaderCell>
              <TableHeaderCell>Fizetési mód</TableHeaderCell>
              <TableHeaderCell>Összeg</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {(() => {
              const list = filteredInvoices;
              const isStorno = (inv) => (inv?.notes || '').toLowerCase().includes('sztornó');
              // Gyűjtsük az eredeti -> sztornó számlák mappingot, és az eredetik készletét
              const stornoByOriginal = new Map();
              list.forEach(inv => {
                if (isStorno(inv)) {
                  const orig = inv.original_invoice_number || inv.order_reference;
                  if (orig) {
                    const arr = stornoByOriginal.get(orig) || [];
                    arr.push(inv.invoice_number);
                    stornoByOriginal.set(orig, arr);
                  }
                }
              });
              const stornoOriginals = new Set(stornoByOriginal.keys());

              const payLabel = (pm) => ({
                transfer: 'Átutalás',
                cash: 'Készpénz',
                card: 'Bankkártya',
                voucher: 'Utalvány',
                cod: 'Utánvét',
                other: 'Egyéb',
              })[pm] || pm;

              return list.map((invoice) => {
                const isSt = isStorno(invoice) || stornoOriginals.has(invoice.invoice_number);
                const settlement = calcSettlementState(invoice);
                const isSettled = settlement.isSettled;
                const remainingAmount = settlement.remainingAmount;
                const paidAmount = Number(invoice.amount_paid || 0);
                const isPaid = isSettled || (invoice.status === 'paid') || (invoice.payment_method && !['transfer','cod'].includes(invoice.payment_method));
                const isCancelled = invoice.status === 'cancelled';
                const isUnpaid = !isPaid && !isCancelled; // minden nem-fizetett (draft, sent, részben fizetett, stb.)
                const dueDate = parseDateOnly(invoice.due_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isOverdue = !isSettled && !!dueDate && dueDate < today;
                const overdueDays = isOverdue ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                const actionButtons = (
                  <ActionButtons>
                    <IconButton
                      variant="view"
                      title="Megnyitás (olvasás)"
                      as="a"
                      href={`/invoices/${invoice.id}/edit?mode=view`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye size={16} />
                    </IconButton>
                    {invoice.status === 'nav_rejected' && (
                      <IconButton
                        variant="edit"
                        title="Javítás szerkesztés (NAV elutasítás után)"
                        as={Link}
                        to={`/invoices/${invoice.id}/edit`}
                      >
                        <Pencil size={16} />
                      </IconButton>
                    )}
                    <IconButton
                      variant="copy"
                      title="Új számla a meglévő alapján"
                      as={Link}
                      to={`/invoices/new?copy_from=${invoice.id}`}
                    >
                      <Copy size={16} />
                    </IconButton>
                    <IconButton
                      variant="correct"
                      title="Helyesbítő számla készítése"
                      as={Link}
                      to={`/invoices/new?correct_from=${invoice.id}`}
                    >
                      <FileDiff size={16} />
                    </IconButton>
                    {!isStorno(invoice) && (
                      <IconButton
                        variant="storno"
                        title="Sztornó számla készítése"
                        onClick={(e) => {
                          e.preventDefault();
                          setStornoInvoice(invoice);
                          setStornoModalOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                    {((!invoice.nav_transaction_id) || invoice.status === 'draft' || invoice.status === 'nav_rejected') && (
                      <IconButton
                        variant="nav"
                        title="NAV-nak küldés"
                        onClick={() => handleSubmitToNAV(invoice.id)}
                        style={{ position: 'relative', fontSize: '10px', fontWeight: 'bold' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <ArrowUp size={10} />
                          <span style={{ fontSize: 8 }}>NAV</span>
                        </div>
                      </IconButton>
                    )}
                    <IconButton
                      variant="nav"
                      title={['draft','nav_rejected'].includes(invoice.status) ? 'Újraküldés a NAV-nak' : 'NAV státusz lekérdezése'}
                      onClick={() => {
                        if (['draft','nav_rejected'].includes(invoice.status)) {
                          if (window.confirm('Elküldöd a számlát a NAV-nak?')) {
                            submitToNAVMutation.mutate(invoice.id);
                          }
                        } else {
                          handleCheckNAVStatus(invoice.id);
                        }
                      }}
                      style={{ position: 'relative', fontSize: '10px', fontWeight: 'bold' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <RefreshCw size={10} />
                        <span style={{ fontSize: 8 }}>NAV</span>
                      </div>
                    </IconButton>
                    <IconButton
                      variant="email"
                      title="Számla küldése e-mailben (PDF)"
                      onClick={() => openEmailModal(invoice)}
                    >
                      <Mail size={16} />
                    </IconButton>
                  </ActionButtons>
                );
                return (
              <React.Fragment key={invoice.id}>
              <Tooltip title={getItemsTooltipContent(invoice)} placement="bottom" overlayStyle={{ maxWidth: 620 }} mouseEnterDelay={0.4}>
              <TableRow
                $storno={isSt}
                $cancelled={isCancelled}
                $paid={isPaid}
                $unpaid={isUnpaid}
                onContextMenu={(event) => handleRowContextMenu(event, invoice.id)}
                onTouchEnd={(event) => handleRowTouchTap(event, invoice.id)}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(invoice.id)}
                    onChange={(e)=>{
                      const set = new Set(selectedIds);
                      if (e.target.checked) set.add(invoice.id); else set.delete(invoice.id);
                      setSelectedIds(set);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div>{invoice.invoice_number}</div>
                  {isSettled && (
                    <div style={{ fontSize: 12, color: '#1e824c', marginTop: 2 }}>
                      Rendezve: {invoice.payment_date ? formatDate(invoice.payment_date) : '—'}
                    </div>
                  )}
                  {!isSettled && paidAmount > 0 && (
                    <div style={{ fontSize: 12, color: '#b42318', marginTop: 2 }}>
                      Hátralék: {formatCurrency(remainingAmount, invoice.currency || 'HUF')}
                    </div>
                  )}
                  {isOverdue && (
                    <div style={{ fontSize: 12, color: '#b42318', marginTop: 2 }}>
                      Lejárt: {overdueDays} nappal
                    </div>
                  )}
                  {invoice.invoice_category === 'ADVANCE' && (
                    <div style={{ fontSize: 12, color: '#8e44ad' }}>
                      előleg
                    </div>
                  )}
                  {invoice.invoice_category === 'FINAL' && Array.isArray(invoice.advances_used) && invoice.advances_used.length > 0 && (
                    <div style={{ fontSize: 12, color: '#2c3e50' }}>
                      Felhasznált előlegek: {invoice.advances_used.map(a => a.invoice_number).join(', ')}
                    </div>
                  )}
                  {isStorno(invoice) && (
                    <div style={{ fontSize: 12, color: '#e74c3c' }}>
                      Eredeti: {invoice.original_invoice_number || invoice.order_reference || '—'}
                    </div>
                  )}
                  {(!isStorno(invoice) && stornoByOriginal.has(invoice.invoice_number)) && (
                    <div style={{ fontSize: 12, color: '#e74c3c' }}>
                      Sztornózott: {stornoByOriginal.get(invoice.invoice_number).join(', ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span title={invoice.customer.name}>
                    {(() => { const n = invoice.customer.name || ''; return n.length > 30 ? (n.slice(0,30) + '…') : n; })()}
                  </span>
                </TableCell>
                <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                <TableCell>{invoice.delivery_date ? formatDate(invoice.delivery_date) : '—'}</TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell>{payLabel(invoice.payment_method)}</TableCell>
                <TableCell>
                  {(() => {
                    const amount = parseFloat(invoice.total_gross_amount || 0);
                    const curr = invoice.currency || 'HUF';
                    const rate = parseFloat(invoice.exchange_rate || 1);
                    return (
                      <>
                        <div style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{formatCurrency(amount, curr)}</div>
                        {curr !== 'HUF' && (
                          <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2, whiteSpace: 'nowrap' }}>
                            {formatCurrency(amount * rate, 'HUF')}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {invoice.status === 'nav_rejected' ? (
                    <Tooltip title={getNavErrorMessage(invoice.nav_response)}>
                      <StatusBadge
                        status={invoice.status}
                        onClick={() => openNavLogModal(invoice)}
                        style={{ cursor: 'pointer' }}
                        title="Napló megnyitása"
                      >
                        {getStatusLabel(invoice.status)}
                      </StatusBadge>
                    </Tooltip>
                  ) : (
                    <StatusBadge status={invoice.status}>
                      {getStatusLabel(invoice.status)}
                    </StatusBadge>
                  )}
                  {navStatusLoading[invoice.id] && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#7f8c8d' }}>
                      (lekérdezés...)
                    </span>
                  )}
                  {navStatusMap[invoice.id] && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: '#2c3e50' }}>
                        NAV: {navStatusMap[invoice.id].processing_status}
                      </span>
                      {navStatusMap[invoice.id].error && (
                        <div style={{ fontSize: 12, color: '#e74c3c' }}>
                          Hiba: {navStatusMap[invoice.id].error}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {actionButtons}
                </TableCell>
              </TableRow>
              </Tooltip>
              <MobileActionsRow $open={mobileActionsInvoiceId === invoice.id}>
                <MobileActionsCell colSpan={3}>
                  {actionButtons}
                </MobileActionsCell>
              </MobileActionsRow>
              </React.Fragment>
              );});
            })()}
          </TableBody>
        </Table>
      </TableContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div>{selectedIds.size} kiválasztva</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportSelectedInvoicesCsv} disabled={selectedIds.size===0} style={{ padding: '8px 12px' }}>
            Kijelöltek CSV
          </button>
          <button onClick={openBulkEmailModal} disabled={selectedIds.size===0} style={{ padding: '8px 12px' }}>
            Kijelöltek e-mailben küldése
          </button>
        </div>
      </div>

      {(!filteredInvoices || filteredInvoices.length === 0) && (
        <EmptyState>
          <p>Nincsenek számlák</p>
          <ActionButton to="/invoices/new" style={{ marginTop: '16px' }}>
            <Plus size={16} />
            Új számla létrehozása
          </ActionButton>
        </EmptyState>
      )}

      {invoices?.count > 0 && (
        <div style={{ padding: '12px 16px', background: 'white', borderTop: '1px solid #ecf0f1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ marginRight: 'auto', fontSize: 13, color: '#7f8c8d' }}>
            Összesen {invoices.count} számla
          </div>
          <AntPagination
            simple={false}
            current={currentPage}
            pageSize={pageSize}
            total={invoices.count}
            showSizeChanger
            onChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setCurrentPage(1); } else { setCurrentPage(p); } }}
            onShowSizeChange={(current, size) => { setPageSize(size); setCurrentPage(1); }}
            pageSizeOptions={['20', '50', '100', '200']}
            showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
          />
        </div>
      )}
    </InvoicesContainer>
    {emailModalOpen && (
      <EmailModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onSend={sendEmailFromModal}
        defaultFrom={emailDefaults.defaultFrom}
        defaultReplyTo={emailDefaults.defaultReplyTo}
        defaultTo={emailDefaults.defaultTo}
        defaultCc={emailDefaults.defaultCc}
        defaultBcc={emailDefaults.defaultBcc}
        defaultSubject={emailDefaults.defaultSubject}
        defaultBody={emailDefaults.defaultBody}
        customerId={bulkMode ? null : emailInvoice?.customer?.id}
        attachments={bulkMode 
          ? (invoices?.results || []).filter(inv => selectedIds.has(inv.id)) 
          : (emailInvoice ? [emailInvoice] : [])
        }
        defaultUseThunderbird={emailDefaults.defaultUseThunderbird}
        defaultThunderbirdPath={emailDefaults.defaultThunderbirdPath}
      />
    )}
    {stornoModalOpen && stornoInvoice && (
      <Modal
        isOpen={stornoModalOpen}
        title="Sztornó számla készítése"
        onClose={() => !stornoProcessing && setStornoModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setStornoModalOpen(false)}
              disabled={stornoProcessing}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: 4,
                background: '#fff',
                cursor: stornoProcessing ? 'not-allowed' : 'pointer',
                opacity: stornoProcessing ? 0.5 : 1,
              }}
            >
              Mégse
            </button>
            <button
              onClick={handleStornoConfirm}
              disabled={stornoProcessing}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 4,
                background: '#e74c3c',
                color: '#fff',
                fontWeight: 500,
                cursor: stornoProcessing ? 'not-allowed' : 'pointer',
                opacity: stornoProcessing ? 0.5 : 1,
              }}
            >
              {stornoProcessing ? 'Feldolgozás...' : 'Igen, sztornózom'}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 16px 0', fontWeight: 500 }}>
            Biztosan sztornózni szeretnéd a következő számlát?
          </p>
          <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 6, marginBottom: 16 }}>
            <div><strong>Számlaszám:</strong> {stornoInvoice.invoice_number}</div>
            <div><strong>Ügyfél:</strong> {stornoInvoice.customer?.name}</div>
            <div><strong>Összeg:</strong> {formatCurrency(stornoInvoice.total_gross_amount, stornoInvoice.currency)}</div>
          </div>
          
          {/* Tételek táblázat */}
          {Array.isArray(stornoInvoice.items) && stornoInvoice.items.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Sztornózandó tételek:</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  fontSize: 13,
                  border: '1px solid #ddd'
                }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Megnevezés</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Cikkszám</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Mennyiség</th>
                      <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Egység</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Nettó</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Nettó összesen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stornoInvoice.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>{item.description}</td>
                        <td style={{ padding: '8px' }}>{item.product_code_value || '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{item.unit_of_measure || 'db'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unit_price, stornoInvoice.currency)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.net_amount, stornoInvoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {stornoInvoice.invoice_category === 'ADVANCE' && (
            <p style={{ color: '#e67e22', marginBottom: 12, fontSize: 14 }}>
              <strong>Figyelem:</strong> Ez egy előleg számla. Ha már felhasználásra került végszámlákon, 
              azok is sztornózásra kerülnek.
            </p>
          )}
          {Array.isArray(stornoInvoice.advances_used) && stornoInvoice.advances_used.length > 0 && (
            <p style={{ color: '#e67e22', marginBottom: 12, fontSize: 14 }}>
              <strong>Figyelem:</strong> Ez a végszámla előlegeket használt fel. 
              A sztornózás visszavonja ezeket a felhasználásokat.
            </p>
          )}
          <p style={{ margin: '0', fontSize: 14, color: '#27ae60', fontWeight: 500 }}>
            A sztornó számla létrehozása után automatikusan elküldésre kerül a NAV-hoz.
          </p>
        </div>
      </Modal>
    )}

    <Modal
      title={navLogInvoice ? `NAV napló - ${navLogInvoice.invoice_number}` : 'NAV napló'}
      isOpen={navLogModalOpen}
      onClose={() => setNavLogModalOpen(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 480, maxWidth: '80vw' }}>
        <div style={{ fontSize: 14, color: '#2c3e50' }}>
          <strong>Számlaszám:</strong> {navLogInvoice?.invoice_number || '—'}
        </div>
        <div style={{ fontSize: 14, color: '#2c3e50' }}>
          <strong>Státusz:</strong> {navLogInvoice ? getStatusLabel(navLogInvoice.status) : '—'}
        </div>
        <div style={{ fontSize: 14, color: '#2c3e50' }}>
          <strong>NAV hiba:</strong> {getNavErrorMessage(navLogInvoice?.nav_response) || 'Nincs hibaüzenet'}
        </div>
        <div style={{ fontSize: 13, color: '#7f8c8d' }}>Teljes napló:</div>
        <pre style={{
          margin: 0,
          padding: 12,
          background: '#f8f9fa',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          maxHeight: '50vh',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 12,
          lineHeight: 1.45,
        }}>
          {navLogInvoice?.nav_response || 'Nincs elérhető NAV napló.'}
        </pre>
      </div>
    </Modal>

      <Modal
        title="Dátum szűrés"
        isOpen={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
      >
          <div style={{display:'flex', flexDirection:'column', gap:20, minWidth: 400}}>
             {/* Issue Date Section */}
             <div>
                <h4 style={{marginBottom:10, marginTop:0, color: '#2c3e50', fontSize: '15px'}}>Kelt dátum (Issue)</h4>
                <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:12}}>
                   <FilterButton onClick={() => applyQuickDate('issue', 'today')}>Ma</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('issue', 'week')}>Hét</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('issue', 'month')}>Hónap</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('issue', 'prev_month')}>Előző hó</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('issue', 'clear')} style={{ color:'#e74c3c' }}>Törlés</FilterButton>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, background: '#f8f9fa', padding: 12, borderRadius: 6, border:'1px solid #eee'}}>
                   <div style={{flex:1}}>
                      <small style={{display:'block', marginBottom:4, color:'#777'}}>Mettől</small>
                      <DateInput type="date" value={issueDateFrom} onChange={(e) => setIssueDateFrom(e.target.value)} style={{width: '100%'}} />
                   </div>
                   <span style={{color:'#999', marginTop: 16}}>&mdash;</span>
                   <div style={{flex:1}}>
                      <small style={{display:'block', marginBottom:4, color:'#777'}}>Meddig</small>
                      <DateInput type="date" value={issueDateTo} onChange={(e) => setIssueDateTo(e.target.value)} style={{width: '100%'}} />
                   </div>
                </div>
             </div>
             
             <div style={{borderBottom:'1px solid #eee'}}></div>

             {/* Delivery Date Section */}
             <div>
                <h4 style={{marginBottom:10, marginTop:0, color: '#2c3e50', fontSize: '15px'}}>Teljesítés dátuma (Delivery)</h4>
                <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:12}}>
                   <FilterButton onClick={() => applyQuickDate('delivery', 'today')}>Ma</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('delivery', 'week')}>Hét</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('delivery', 'month')}>Hónap</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('delivery', 'prev_month')}>Előző hó</FilterButton>
                   <FilterButton onClick={() => applyQuickDate('delivery', 'clear')} style={{ color:'#e74c3c' }}>Törlés</FilterButton>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, background: '#f8f9fa', padding: 12, borderRadius: 6, border:'1px solid #eee'}}>
                   <div style={{flex:1}}>
                      <small style={{display:'block', marginBottom:4, color:'#777'}}>Mettől</small>
                      <DateInput type="date" value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} style={{width: '100%'}} />
                   </div>
                   <span style={{color:'#999', marginTop: 16}}>&mdash;</span>
                   <div style={{flex:1}}>
                        <small style={{display:'block', marginBottom:4, color:'#777'}}>Meddig</small>
                        <DateInput type="date" value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} style={{width: '100%'}} />
                   </div>
                </div>
             </div>
             
             <div style={{display:'flex', justifyContent:'flex-end', marginTop:10, paddingTop: 10, borderTop: '1px solid #eee'}}>
                 <button onClick={() => setDateModalOpen(false)} style={{
                    padding: '8px 24px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px'
                }}>Rendben</button>
             </div>
          </div>
      </Modal>
  </>
  );
};

export default Invoices;
