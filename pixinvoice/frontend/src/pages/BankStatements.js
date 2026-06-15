import React from 'react';
import { flushSync, createPortal } from 'react-dom';
import { useQuery } from 'react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import api from '../services/api';
import { bankStatementsAPI, companyAPI, invoiceAPI, customerAPI, utilsAPI } from '../services/api';
import { toast } from 'react-toastify';
import { Edit2, Save, X, Trash2, Check, AlertCircle } from 'lucide-react';
import { Modal, Pagination } from 'antd';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
`;

const ProgressWrap = styled.div`
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  padding: 10px;
`;

const ProgressTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 13px;
  color: #334155;
`;

const ProgressBarOuter = styled.div`
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
`;

const ProgressBarInner = styled.div`
  height: 100%;
  border-radius: 999px;
  background: #3498db;
  width: ${props => props.$percent || 0}%;
  transition: width ${props => props.$slow ? '1.2s' : '0.25s'} ease;
`;

const Header = styled.div`
  padding: 20px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
`;

const ActionButton = styled(Link)`
  padding: 8px 14px;
  background: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
`;

const DateFilterWrap = styled.div`
  padding: 12px 20px;
  border-bottom: 1px solid #ecf0f1;
`;

const DateFilterPanel = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
`;

const DateFilterTitle = styled.div`
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 10px;
`;

const QuickRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`;

const QuickButton = styled.button`
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: ${props => props.$active ? '#e5e7eb' : '#f3f4f6'};
  color: #4b5563;
  cursor: pointer;
  font-size: 14px;
`;

const ClearQuickButton = styled(QuickButton)`
  color: #ef4444;
`;

const DateRangeBox = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  padding: 10px;
`;

const DateRangeGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: end;
`;

const DateField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #6b7280;
  font-size: 13px;
`;

const DateInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  background: white;
  width: 140px;
`;

const ImportButton = styled.button`
  padding: 8px 14px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
`;

const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 10000;
`;
const ModalContent = styled.div`
  width: 90%;
  max-width: 1600px;
  max-height: 95vh;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;
const ModalHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee;
`;
const ModalTitle = styled.h3`
  margin: 0; font-size: 18px; color: #2c3e50;
`;
const ModalBody = styled.div`
  padding: 16px;
  flex: 1;
  overflow: auto;
`;
const CloseBtn = styled.button`
  padding: 6px 10px; background: #eee; border: none; border-radius: 4px; cursor: pointer;
`;
const DropArea = styled.div`
  border: 2px dashed #95a5a6; border-radius: 6px; padding: 16px; text-align: center; color: #7f8c8d;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;
const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
  background: #f8f9fa;
`;
const Td = styled.td`
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
`;

// --- Javasolt számla bruttó tooltip ---
const _tooltipAn = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const _tooltipNc = (v, fb = 'HUF') => String(v || '').trim().toUpperCase() || fb;

const ProposedInvoiceTooltip = ({ it, children }) => {
  const [pos, setPos] = React.useState(null);
  const txnCurrency = _tooltipNc(it?.statement_currency || it?.currency, 'HUF');
  const bankAmount = Math.abs(_tooltipAn(it?.amount));
  const allocations = Array.isArray(it?.allocations)
    ? it.allocations.filter(a => a?.invoice_number || a?.invoice_id)
    : [];
  let rows = [];
  if (allocations.length > 0) {
    rows = allocations.map(a => {
      const allocTxn = _tooltipAn(a.amount_txn);
      const allocBase = _tooltipAn(a.amount);
      const displayAmount = Math.abs(allocTxn) > 0.0001 ? allocTxn : allocBase;
      return {
        invoice_number: a.invoice_number || a.invoice_id || '-',
        amount: displayAmount,
      };
    });
  } else if (it?.proposed_invoice) {
    const p = it.proposed_invoice;
    rows = [{ invoice_number: p.invoice_number || p.id || '-', amount: _tooltipAn(p.amount ?? 0) }];
  }
  const hasData = rows.some(r => Math.abs(r.amount) > 0.0001);
  const totalAllocated = rows.reduce((s, r) => s + _tooltipAn(r.amount), 0);
  const diff = totalAllocated - bankAmount;
  const fmt = (n) => Math.round(n).toLocaleString('hu-HU');
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%', overflow: 'hidden' }}
      onMouseEnter={(e) => hasData && setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && hasData && createPortal(
        <div style={{
          position: 'fixed', top: pos.y + 14, left: pos.x + 10, zIndex: 99999,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
          padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontSize: 12, minWidth: 240, pointerEvents: 'none',
        }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '2px 20px 4px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>Számlaszám</th>
                <th style={{ textAlign: 'right', padding: '2px 0 4px 0', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 }}>Allokáció</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 20px 2px 0', color: '#111827' }}>{r.invoice_number}</td>
                  <td style={{ padding: '2px 0', textAlign: 'right', color: '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)} {txnCurrency}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} style={{ borderTop: '1px solid #e5e7eb', padding: '3px 0 0' }} /></tr>
              <tr>
                <td style={{ padding: '2px 20px 2px 0', fontWeight: 600, color: '#111827' }}>Összesen:</td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111827' }}>{fmt(totalAllocated)} {txnCurrency}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 20px 2px 0', fontWeight: 600, color: diff > 0.5 ? '#b42318' : (diff < -0.5 ? '#b45309' : '#1e824c') }}>
                  {diff > 0.5 ? 'Túlfizetés:' : (diff < -0.5 ? 'Maradvány:' : 'Egyezés:')}
                </td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: diff > 0.5 ? '#b42318' : (diff < -0.5 ? '#b45309' : '#1e824c') }}>
                  {diff > 0.5 ? '+' : ''}{fmt(diff)} {txnCurrency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>,
        document.body
      )}
    </span>
  );
};

const BankStatements = () => {
  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const location = useLocation();
  const navigate = useNavigate();
  const openUploadedId = React.useMemo(() => {
    try {
      return new URLSearchParams(location.search || '').get('openUploaded');
    } catch {
      return null;
    }
  }, [location.search]);
  const openUploadedSource = React.useMemo(() => {
    try {
      return new URLSearchParams(location.search || '').get('source');
    } catch {
      return null;
    }
  }, [location.search]);
  const isImportPage = location.pathname === '/bank-statements/import';
  const isImportPreviewPage = location.pathname === '/bank-statements/import/preview';
  const isImportMode = isImportPage || isImportPreviewPage;
  const sourceParam = React.useMemo(() => {
    try {
      return new URLSearchParams(location.search || '').get('source');
    } catch {
      return null;
    }
  }, [location.search]);
  const importBackTarget = sourceParam === 'uploaded' ? '/bank-statements/uploaded' : '/bank-statements';
  const importBackLabel = sourceParam === 'uploaded' ? 'Feltöltött bankkivonatok' : 'Vissza';
  const importPageUrl = sourceParam ? `/bank-statements/import?source=${encodeURIComponent(sourceParam)}` : '/bank-statements/import';
  const importPreviewUrl = sourceParam ? `/bank-statements/import/preview?source=${encodeURIComponent(sourceParam)}` : '/bank-statements/import/preview';
  const handledOpenRef = React.useRef(null);
  const returnToUploadedRef = React.useRef(false);

  // Keep selectedCompanyId in sync with sidebar's selection stored in localStorage
  React.useEffect(() => {
    const readLS = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setSelectedCompanyId(prev => (prev !== cid ? cid : prev));
      } catch {}
    };
    const onFocus = () => readLS();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(readLS, 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  // Fallback: if no company selected in localStorage, default to first active company
  const { data: companiesData } = useQuery(
    ['companies', { is_active: true }],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data?.results || [] }
  );

  React.useEffect(() => {
    if (!selectedCompanyId && Array.isArray(companiesData) && companiesData.length > 0) {
      const first = companiesData[0];
      setSelectedCompanyId(first.id);
      try { localStorage.setItem('selectedCompanyId', first.id); } catch {}
    }
  }, [selectedCompanyId, companiesData]);

  const { data, isLoading, refetch } = useQuery(
    ['bank-statements', { company: selectedCompanyId }],
    () => bankStatementsAPI.getAllStatements(selectedCompanyId ? { company: selectedCompanyId } : {})
  );

  const [editId, setEditId] = React.useState(null);
  const [editValue, setEditValue] = React.useState('');
  const [tab, setTab] = React.useState('zip'); // zip | stm
  const [files, setFiles] = React.useState([]);
  const [importing, setImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState({ active: false, percent: 0, label: '' });
  const [allocationProgress, setAllocationProgress] = React.useState({ percent: 0, label: '' });
  const [suggestionProgress, setSuggestionProgress] = React.useState({ active: false, percent: 0, label: '' });
  const [stmPreview, setStmPreview] = React.useState(null);
  const [zipPreview, setZipPreview] = React.useState(null);
  const [showPreviewModal, setShowPreviewModal] = React.useState(false);
  const [previewReadOnly, setPreviewReadOnly] = React.useState(false);
  const [previewSourceStatementId, setPreviewSourceStatementId] = React.useState(null);
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [listSearchTerm, setListSearchTerm] = React.useState('');
  const [listPage, setListPage] = React.useState(1);
  const [listPageSize, setListPageSize] = React.useState(50);
  const [quickRange, setQuickRange] = React.useState('');
  const [hideZeroAmounts, setHideZeroAmounts] = React.useState(() => {
    try {
      const raw = localStorage.getItem('bankStatements.hideZeroAmounts');
      if (raw === null) return true;
      return raw === '1';
    } catch {
      return true;
    }
  });
  const [onlyWithPartner, setOnlyWithPartner] = React.useState(false);
  const [onlySavedPairings, setOnlySavedPairings] = React.useState(() => {
    try {
      return localStorage.getItem('bankStatements.onlySavedPairings') === '1';
    } catch {
      return false;
    }
  });
  const [directionFilter, setDirectionFilter] = React.useState('all'); // all | incoming | outgoing
  const [includeExternalInvoices, setIncludeExternalInvoices] = React.useState(() => {
    try {
      const raw = localStorage.getItem('bankStatements.includeExternalInvoices');
      if (raw === null) return false;
      return raw === '1';
    } catch {
      return false;
    }
  });
  const [customerModal, setCustomerModal] = React.useState({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false });
  const [allocationModal, setAllocationModal] = React.useState({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} });
  const [allocationSort, setAllocationSort] = React.useState({ key: null, direction: 'asc' });
  const customerRowRefs = React.useRef({});
  const customerSearchInputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  // Diacritic-insensitive normalization: strips accents so that e.g. "u" matches "ú"/"ű"/"ü" and vice versa.
  const normalizeForSearch = React.useCallback((str) => {
    return String(str || '')
      .normalize('NFD')              // decompose accented chars → base + combining mark
      .replace(/[\u0300-\u036f]/g, '') // strip all combining marks
      .toLowerCase();
  }, []);

  const formatDate = React.useCallback((date) => {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const applyQuickRange = React.useCallback((key) => {
    const now = new Date();
    const today = formatDate(now);

    if (key === 'clear') {
      setFromDate('');
      setToDate('');
      setQuickRange('');
      return;
    }

    if (key === 'today') {
      setFromDate(today);
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'week') {
      const start = new Date(now);
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
      setFromDate(formatDate(start));
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(formatDate(start));
      setToDate(today);
      setQuickRange(key);
      return;
    }

    if (key === 'prevMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(formatDate(start));
      setToDate(formatDate(end));
      setQuickRange(key);
    }
  }, [formatDate]);

  React.useEffect(() => {
    try {
      localStorage.setItem('bankStatements.onlySavedPairings', onlySavedPairings ? '1' : '0');
    } catch {}
  }, [onlySavedPairings]);

  React.useEffect(() => {
    try {
      localStorage.setItem('bankStatements.includeExternalInvoices', includeExternalInvoices ? '1' : '0');
    } catch {}
  }, [includeExternalInvoices]);

  React.useEffect(() => {
    try {
      localStorage.setItem('bankStatements.hideZeroAmounts', hideZeroAmounts ? '1' : '0');
    } catch {}
  }, [hideZeroAmounts]);

  const normalizeAccount = React.useCallback((val) => String(val || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), []);
  const normalizeName = React.useCallback((val) => String(val || '').toLowerCase().replace(/\s+/g, ' ').trim(), []);

  const amountNum = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      let raw = v.trim();
      if (!raw) return 0;
      raw = raw.replace(/\u00A0/g, ' ').replace(/\s+/g, '');
      raw = raw.replace(/[^0-9,.-]/g, '');
      const lastComma = raw.lastIndexOf(',');
      const lastDot = raw.lastIndexOf('.');
      if (lastComma >= 0 && lastDot >= 0) {
        if (lastComma > lastDot) {
          raw = raw.replace(/\./g, '').replace(',', '.');
        } else {
          raw = raw.replace(/,/g, '');
        }
      } else if (lastComma >= 0) {
        raw = raw.replace(',', '.');
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeCurrency = React.useCallback((value, fallback = 'HUF') => {
    const cur = String(value || '').trim().toUpperCase();
    return cur || String(fallback || 'HUF').trim().toUpperCase() || 'HUF';
  }, []);

  const getInvoiceOutstandingInTxn = React.useCallback((invoice, txnCurrencyRaw) => {
    const inv = invoice || {};
    const txnCurrency = normalizeCurrency(txnCurrencyRaw || 'HUF');
    const invCurrency = normalizeCurrency(inv?.currency || inv?.invoice_currency || txnCurrency);
    const outstanding = Math.abs(amountNum(inv?.outstanding));
    if (outstanding <= 0.0001) return 0;
    if (invCurrency === txnCurrency) return outstanding;

    const sources = [
      inv,
      inv?._raw,
      inv?._raw_invoice,
      inv?._source_invoice,
      inv?._source_invoice?._raw,
      inv?._source_invoice?._raw_invoice,
    ].filter(Boolean);

    const firstAmountFromKeys = (keys) => {
      for (const src of sources) {
        for (const key of keys) {
          const value = src?.[key];
          const parsed = Math.abs(amountNum(value));
          if (parsed > 0.0001) return parsed;
        }
      }
      return 0;
    };

    const preferredTerms = ['remaining', 'outstanding', 'open', 'unpaid', 'due', 'balance'];
    const fallbackTerms = ['gross', 'total', 'sum'];
    const targetCode = normalizeCurrency(txnCurrency, 'HUF').toLowerCase();
    const findCurrencyAmountByTerms = (terms = []) => {
      const termsLower = terms.map((t) => String(t || '').toLowerCase());
      for (const src of sources) {
        let nestedFound = 0;
        walkValues(src, (key, value) => {
          if (nestedFound > 0) return;
          const k = String(key || '').toLowerCase();
          if (!k.includes(targetCode)) return;
          if (!termsLower.some((term) => k.includes(term))) return;
          const parsed = Math.abs(amountNum(value));
          if (parsed > 0.0001) nestedFound = parsed;
        });
        if (nestedFound > 0) return nestedFound;
      }
      return 0;
    };

    const walkValues = (node, visitor, depth = 0) => {
      if (!node || depth > 3) return;
      if (Array.isArray(node)) {
        node.forEach((child) => walkValues(child, visitor, depth + 1));
        return;
      }
      if (typeof node !== 'object') return;
      Object.entries(node).forEach(([key, value]) => {
        visitor(String(key || ''), value);
        if (value && typeof value === 'object') {
          walkValues(value, visitor, depth + 1);
        }
      });
    };

    const dynamicHufAmount = () => {
      for (const src of sources) {
        for (const [key, value] of Object.entries(src || {})) {
          const k = String(key || '').toLowerCase();
          if (!k.includes('huf')) continue;
          if (!(k.includes('gross') || k.includes('total'))) continue;
          const parsed = Math.abs(amountNum(value));
          if (parsed > 0.0001) return parsed;
        }
        let nestedFound = 0;
        walkValues(src, (key, value) => {
          if (nestedFound > 0) return;
          const k = String(key || '').toLowerCase();
          if (!k.includes('huf')) return;
          if (!(k.includes('gross') || k.includes('total'))) return;
          const parsed = Math.abs(amountNum(value));
          if (parsed > 0.0001) nestedFound = parsed;
        });
        if (nestedFound > 0) return nestedFound;
      }
      return 0;
    };

    const dynamicRateAmount = () => {
      for (const src of sources) {
        let nestedFound = 0;
        walkValues(src, (key, value) => {
          if (nestedFound > 0) return;
          const k = String(key || '').toLowerCase();
          if (!(k.includes('rate') || k.includes('árfolyam') || k.includes('arfolyam') || k.includes('exchange'))) return;
          const parsed = Math.abs(amountNum(value));
          if (parsed > 0.0001) nestedFound = parsed;
        });
        if (nestedFound > 0) return nestedFound;
      }
      return 0;
    };

    const exchangeRate = firstAmountFromKeys([
      'exchange_rate', 'exchangeRate', 'exchange_rate_huf', 'exchangeRateHUF', 'exchangeRateHuf',
      'nav_exchange_rate', 'navExchangeRate', 'rate', 'fx_rate', 'fxRate'
    ]);
    const grossAmount = firstAmountFromKeys([
      'gross_amount', 'grossAmount', 'invoice_gross_amount', 'invoiceGrossAmount',
      'total_gross_amount', 'totalGrossAmount', 'amount', 'invoice_amount'
    ]);
    const grossAmountHuf = firstAmountFromKeys([
      'gross_amount_huf', 'grossAmountHUF', 'grossAmountHuf', 'gross_amount_HUF',
      'invoice_gross_amount_huf', 'invoiceGrossAmountHUF', 'invoiceGrossAmountHuf',
      'total_gross_amount_huf', 'totalGrossAmountHUF', 'totalGrossAmountHuf',
      'amount_huf', 'amountHUF', 'amountHuf'
    ]);
    const grossAmountHufResolved = grossAmountHuf > 0
      ? grossAmountHuf
      : dynamicHufAmount();
    const explicitTxnOutstanding = findCurrencyAmountByTerms(preferredTerms);
    const explicitTxnGeneric = findCurrencyAmountByTerms(fallbackTerms);
    const explicitTxnAmount = explicitTxnOutstanding > 0.0001 ? explicitTxnOutstanding : explicitTxnGeneric;
    const dynamicRate = dynamicRateAmount();
    const derivedRate = (exchangeRate > 0)
      ? exchangeRate
      : (dynamicRate > 0
        ? dynamicRate
        : ((grossAmountHufResolved > 0.0001 && grossAmount > 0.0001) ? (grossAmountHufResolved / grossAmount) : 0));

    if (explicitTxnAmount > 0.0001 && txnCurrency !== invCurrency) {
      if (grossAmount > 0.0001) {
        const ratio = Math.min(1, outstanding / grossAmount);
        return explicitTxnAmount * ratio;
      }
      return explicitTxnAmount;
    }

    if (txnCurrency === 'HUF') {
      if (grossAmountHufResolved > 0 && grossAmount > 0) {
        return (outstanding / grossAmount) * grossAmountHufResolved;
      }
      if (invCurrency === 'HUF') return outstanding;
      if (derivedRate > 0) return outstanding * derivedRate;
      return outstanding;
    }

    if (invCurrency === 'HUF' && derivedRate > 0) {
      return outstanding / derivedRate;
    }

    return outstanding;
  }, [amountNum, normalizeCurrency]);

  const getInvoiceAllocationInTxn = React.useCallback((invoice, allocationValue, txnCurrencyRaw) => {
    const inv = invoice || {};
    const alloc = amountNum(allocationValue);
    const allocAbs = Math.abs(alloc);
    if (allocAbs <= 0.0001) return 0;
    const outstandingAbs = Math.abs(amountNum(inv?.outstanding));
    const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrencyRaw));
    if (outstandingAbs <= 0.0001 || outstandingTxn <= 0.0001) {
      return alloc;
    }
    const ratio = outstandingTxn / outstandingAbs;
    return alloc * ratio;
  }, [amountNum, getInvoiceOutstandingInTxn]);

  const normalizeStornoAllocationValue = React.useCallback((invoice, rawValue) => {
    const value = amountNum(rawValue);
    const isStorno = !!(
      invoice?.is_storno_invoice ||
      invoice?.isStornoInvoice ||
      invoice?.is_storno ||
      invoice?.isStorno
    );
    if (isStorno && value > 0.0001) {
      return -Math.abs(value);
    }
    return value;
  }, [amountNum]);

  const getStatementPartnerName = React.useCallback((item) => {
    const isPlaceholder = (value) => {
      const normalized = String(value || '').trim();
      return normalized === '-' || normalized === '—' || normalized === 'N/A';
    };
    const candidates = [
      item?.counterparty_name,
      item?.counterpartyName,
      item?.partner_name,
      item?.partnerName,
      item?.customer_name,
      item?.customerName,
      item?.debtor_name,
      item?.debtorName,
      item?.creditor_name,
      item?.creditorName,
      item?.name,
    ];
    for (const value of candidates) {
      const normalized = String(value || '').trim();
      if (normalized && !isPlaceholder(normalized)) return normalized;
    }
    return '';
  }, []);

  const getStatementCounterpartyAccount = React.useCallback((item) => {
    const candidates = [
      item?.counterparty_account,
      item?.counterpartyAccount,
      item?.partner_account,
      item?.partnerAccount,
      item?.debtor_account,
      item?.debtorAccount,
      item?.creditor_account,
      item?.creditorAccount,
      item?.account_number,
      item?.accountNumber,
      item?.iban,
      item?.bank_account,
      item?.bankAccount,
    ];
    for (const value of candidates) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
    return '';
  }, []);

  const getStatementRawTooltip = React.useCallback((item) => {
    const currency = String(item?.currency || item?.statement_currency || '').trim();
    const rawAmount = (item?.amount !== undefined && item?.amount !== null && item?.amount !== '')
      ? `${item.amount}${currency ? ` ${currency}` : ''}`
      : '-';
    const valueDate = String(item?.value_date || item?.statement_date || '').trim() || '-';
    const partner = getStatementPartnerName(item) || '-';
    const account = getStatementCounterpartyAccount(item) || '-';
    const remittance = String(item?.remittance || item?.comment || '').trim() || '-';

    return [
      `Összeg: ${rawAmount}`,
      `Értéknap: ${valueDate}`,
      `Partner: ${partner}`,
      `Bankszámlaszám: ${account}`,
      `Közlemény: ${remittance}`,
    ].join('\n');
  }, [getStatementCounterpartyAccount, getStatementPartnerName]);

  const getPartnerDisplayName = React.useCallback((item) => {
    const crmName = String(item?.proposed_customer?.name || '').trim();
    if (crmName) return crmName;

    const amountVal = Number(item?.amount || 0);
    const isIncomingTxn = amountVal > 0;

    const invoicePartnerCandidates = [
      // Incoming transaction (money received): partner should be payer/customer, not supplier.
      isIncomingTxn ? item?.proposed_invoice?.customer_name : item?.proposed_invoice?.supplier_name,
      isIncomingTxn ? item?.saved_invoice?.customer_name : item?.saved_invoice?.supplier_name,
      item?.saved_customer?.name,
      isIncomingTxn
        ? (Array.isArray(item?.candidates) ? item.candidates : [])[0]?.customer_name
        : (Array.isArray(item?.candidates) ? item.candidates : [])[0]?.supplier_name,
    ];
    for (const value of invoicePartnerCandidates) {
      const normalized = String(value || '').trim();
      if (normalized && normalized !== '-' && normalized !== '—' && normalized !== 'N/A') {
        return normalized;
      }
    }

    const statementName = getStatementPartnerName(item);
    return statementName || '-';
  }, [getStatementPartnerName]);

  const setImportPct = React.useCallback((percent, label) => {
    const safe = Math.max(0, Math.min(100, Number(percent) || 0));
    setImportProgress({ active: true, percent: safe, label: label || '' });
  }, []);

  const clearImportPct = React.useCallback(() => {
    setImportProgress({ active: false, percent: 0, label: '' });
  }, []);

  const setAllocationPct = React.useCallback((percent, label) => {
    const safe = Math.max(0, Math.min(100, Number(percent) || 0));
    setAllocationProgress({ percent: safe, label: label || '' });
  }, []);

  const setSuggestionPct = React.useCallback((percent, label) => {
    const safe = Math.max(0, Math.min(100, Number(percent) || 0));
    setSuggestionProgress({ active: true, percent: safe, label: label || '' });
  }, []);

  const clearSuggestionPct = React.useCallback(() => {
    setSuggestionProgress({ active: false, percent: 0, label: '' });
  }, []);

  const allocationTxnCurrency = normalizeCurrency(allocationModal.item?.currency || 'HUF');
  const allocationBudget = Math.abs(amountNum(allocationModal.item?.amount));
  const allocationTotal = Object.entries(allocationModal.allocations || {}).reduce((sum, [invoiceId, value]) => {
    const inv = (allocationModal.invoices || []).find((row) => String(row?.id) === String(invoiceId));
    return sum + getInvoiceAllocationInTxn(inv, value, allocationTxnCurrency);
  }, 0);
  const allocationRemaining = allocationBudget - allocationTotal;
  const allocationOver = allocationTotal - allocationBudget;
  const allocationHeaderCellStyle = {
    textAlign: 'left',
    padding: 6,
    borderBottom: '1px solid #eee',
    position: 'sticky',
    top: 56,
    background: '#fff',
    zIndex: 4,
  };

  const toggleAllocationSort = React.useCallback((key) => {
    setAllocationSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const allocationSortIndicator = React.useCallback((key) => {
    if (allocationSort.key !== key) return '';
    return allocationSort.direction === 'asc' ? ' ▲' : ' ▼';
  }, [allocationSort]);

  const allocationDisplayInvoices = React.useMemo(() => {
    const rows = [...(allocationModal.invoices || [])];
    if (!allocationSort.key) return rows;

    const dir = allocationSort.direction === 'asc' ? 1 : -1;
    const getVal = (inv) => {
      switch (allocationSort.key) {
        case 'invoice_number':
          return String(inv?.invoice_number || inv?.invoiceNumber || '');
        case 'partner':
          return String(inv?.customer_name || inv?.supplier_name || '');
        case 'due_date': {
          const t = new Date(inv?.due_date || '').getTime();
          return Number.isFinite(t) ? t : 0;
        }
        case 'outstanding':
          return getInvoiceOutstandingInTxn(inv, allocationTxnCurrency);
        case 'payable': {
          const alloc = normalizeStornoAllocationValue(inv, allocationModal.allocations?.[inv?.id]);
          return getInvoiceAllocationInTxn(inv, alloc, allocationTxnCurrency);
        }
        default:
          return '';
      }
    };

    rows.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), 'hu', { sensitivity: 'base' }) * dir;
    });
    return rows;
  }, [allocationModal.invoices, allocationModal.allocations, allocationSort, allocationTxnCurrency, getInvoiceOutstandingInTxn, getInvoiceAllocationInTxn, normalizeStornoAllocationValue]);

  const invoiceMatchStatus = (it) => {
    const txnAbs = Math.abs(amountNum(it.amount));
    const allocations = it.allocations || [];
    const txnCurrency = normalizeCurrency(it?.statement_currency || it?.currency || 'HUF');
    const allocTotal = allocations.reduce((sum, a) => {
      const allocTxnDirect = amountNum(a?.amount_txn);
      if (Math.abs(allocTxnDirect) > 0.0001) return sum + allocTxnDirect;
      const allocAmount = amountNum(a?.amount);
      if (Math.abs(allocAmount) <= 0.0001) return sum;
      const allocInvoice = {
        outstanding: amountNum(a?.invoice_outstanding ?? allocAmount),
        currency: a?.invoice_currency || a?.currency || txnCurrency,
        exchange_rate: amountNum(a?.invoice_exchange_rate ?? a?.exchange_rate),
        gross_amount: amountNum(a?.invoice_gross_amount ?? a?.gross_amount),
        gross_amount_huf: amountNum(a?.invoice_gross_amount_huf ?? a?.gross_amount_huf),
        net_amount_huf: amountNum(a?.invoice_net_amount_huf ?? a?.net_amount_huf),
        vat_amount_huf: amountNum(a?.invoice_vat_amount_huf ?? a?.vat_amount_huf),
      };
      return sum + amountNum(getInvoiceAllocationInTxn(allocInvoice, allocAmount, txnCurrency));
    }, 0);
    const hasSuggestion = !!(it?.proposed_invoice?.invoice_number || it?.proposed_invoice?.id);
    const used = allocTotal;
    const isPairingSaved = !!(
      it?.pairing_marked_at ||
      it?.saved_pairing_marked_at ||
      (Array.isArray(it?.saved_allocations) && it.saved_allocations.length > 0) ||
      it?.saved_invoice
    );

    if (!isPairingSaved) {
      if (used > 0 || hasSuggestion) return { type: 'suggested', text: 'Javasolt párosítás' };
      return { type: 'none', text: 'Nincs párosítás' };
    }

    const isHuf = txnCurrency === 'HUF';
    const diff = txnAbs - used;
    const diffForCompare = isHuf ? Math.round(txnAbs) - Math.round(used) : diff;
    const tolerance = isHuf ? 0.5 : 0.01;
    if (used <= 0) {
      if (hasSuggestion) return { type: 'suggested', text: 'Javasolt párosítás' };
      return { type: 'none', text: 'Nincs párosítás' };
    }
    if (Math.abs(diffForCompare) <= tolerance) return { type: 'full', text: 'Teljes' };
    if (diffForCompare > 0) return { type: 'over', text: `Túlfizetés: ${Math.abs(diffForCompare).toLocaleString('hu-HU', { minimumFractionDigits: 2 })}` };
    return { type: 'partial', text: `Fennmaradó: ${Math.abs(diffForCompare).toLocaleString('hu-HU', { minimumFractionDigits: 2 })}` };
  };

  const getInvoiceDisplayFromItem = (it) => {
    const getByMode = (mode = 'proposed') => {
      const isSavedMode = mode === 'saved';
      const sourceInvoice = isSavedMode ? (it?.saved_invoice || null) : (it?.proposed_invoice || null);
      const allocs = isSavedMode
        ? (Array.isArray(it?.saved_allocations) ? it.saved_allocations : [])
        : (Array.isArray(it?.allocations) ? it.allocations : []);
      const allocsWithAmount = allocs.filter((a) => Math.abs(amountNum(a?.amount)) > 0.0001);
      const firstAlloc = allocsWithAmount.find((a) => String(a?.invoice_type || '').length > 0)
        || allocsWithAmount[0]
        || allocs.find((a) => String(a?.invoice_type || '').length > 0)
        || allocs[0]
        || null;

      if (allocsWithAmount.length > 0 && firstAlloc) {
        const effectiveInvoiceType = firstAlloc?.invoice_type || null;
        const suggestionOrigin = isSavedMode
          ? (it?.saved_suggestion_origin || null)
          : (it?.suggestion_origin || null);
        // Show all invoice numbers for both incoming and outgoing allocations
        const effectiveInvoiceNumber = Array.from(new Set(
          allocsWithAmount
            .map((a) => a?.invoice_number || a?.invoice_id)
            .filter(Boolean)
        )).join(', ');

        return { firstAlloc, effectiveInvoiceType, effectiveInvoiceNumber, source: 'allocation', suggestionOrigin };
      }

      const effectiveInvoiceType = sourceInvoice?.type || firstAlloc?.invoice_type || null;
      const suggestionOrigin = isSavedMode
        ? (it?.saved_suggestion_origin || null)
        : (it?.suggestion_origin || null);
      let effectiveInvoiceNumber = sourceInvoice?.invoice_number || sourceInvoice?.id || firstAlloc?.invoice_number || firstAlloc?.invoice_id || '';

      if (!isSavedMode && effectiveInvoiceType === 'incoming' && !effectiveInvoiceNumber) {
        const incomingCandidates = (it?.candidates || []).filter((c) => c?.type === 'incoming');
        effectiveInvoiceNumber = Array.from(new Set(incomingCandidates.map((c) => c?.invoice_number).filter(Boolean))).join(', ');
      }

      return { firstAlloc, effectiveInvoiceType, effectiveInvoiceNumber, source: 'suggestion', suggestionOrigin };
    };

    return {
      proposed: getByMode('proposed'),
      saved: getByMode('saved'),
    };
  };

  const maybeHandleCompanyMismatch = React.useCallback((responseData) => {
    const mismatches = Array.isArray(responseData?.detected_company_mismatches)
      ? responseData.detected_company_mismatches
      : [];
    if (!mismatches.length) return false;

    const selectedId = String(selectedCompanyId || '');
    const mismatch = mismatches.find((m) => String(m?.company_id || '') !== selectedId) || mismatches[0];
    const targetId = String(mismatch?.company_id || '');
    if (!targetId || targetId === selectedId) return false;

    const selectableTarget = (companiesData || []).find((c) => String(c.id) === targetId);
    const targetName = mismatch?.company_name || selectableTarget?.name || 'ismeretlen cég';

    if (!selectableTarget) {
      toast.warning(`A feltöltött kivonat valószínűleg nem a kiválasztott céghez tartozik (${targetName}). Ez a cég nálad nem választható.`);
      return false;
    }

    const shouldSwitch = window.confirm(
      `A feltöltött kivonat valószínűleg nem a kiválasztott céghez tartozik.\n` +
      `Detektált cég: ${targetName}\n\n` +
      'Átváltunk erre a cégre?'
    );

    if (shouldSwitch) {
      setSelectedCompanyId(targetId);
      try { localStorage.setItem('selectedCompanyId', targetId); } catch {}
      window.dispatchEvent(new Event('companyChanged'));
      toast.info(`Cég átváltva: ${targetName}. Futtasd újra az előnézetet.`);
      return true;
    }

    toast.warning(`A kivonat másik céghez tartozhat (${targetName}).`);
    return false;
  }, [selectedCompanyId, companiesData]);

  const computeAutoAllocationForItem = React.useCallback(async (it, options = {}) => {
    const txnAmount = amountNum(it?.amount);
    const txnCurrency = normalizeCurrency(it?.statement_currency || it?.currency || 'HUF');
    const custId = options?.customerId || it?.proposed_customer?.id;
    const showAllInvoices = !!options?.showAllInvoices;
    if (!custId || !selectedCompanyId) return null;

    const isStornoInvoiceLike = (inv) => {
      const op = String(inv?.invoiceOperation || inv?.invoice_operation || '').toUpperCase();
      const byOperation = op.includes('STORNO') || op.includes('CANCEL') || op.includes('STORN');
      const byFlags = !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno);
      return byOperation || byFlags;
    };

    const toSignedOutstanding = (rawValue, inv) => {
      const value = amountNum(rawValue);
      if (isStornoInvoiceLike(inv) && value > 0.0001) {
        return -Math.abs(value);
      }
      return value;
    };

    if (txnAmount > 0) {
      const res = await invoiceAPI.getUnpaidInvoices({ company_id: selectedCompanyId, customer_id: custId });
      const rows = (res?.data?.results || []).map(inv => {
        const rawOutstanding = amountNum(inv.outstanding);
        const invoiceCurrency = String(inv?.currency || it?.currency || '').toUpperCase();
        const roundedOutstanding = invoiceCurrency === 'HUF' ? Math.round(rawOutstanding) : rawOutstanding;
        const signedOutstanding = toSignedOutstanding(roundedOutstanding, inv);
        return {
          ...inv,
          _raw_invoice: inv,
          id: inv?.id || inv?.invoice_number,
          invoice_number: inv?.invoice_number,
          currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
          exchange_rate: amountNum(inv?.exchange_rate ?? inv?.exchangeRate),
          gross_amount: amountNum(inv?.gross_amount ?? inv?.grossAmount),
          gross_amount_huf: amountNum(inv?.gross_amount_huf ?? inv?.grossAmountHUF),
          outstanding: signedOutstanding,
          invoice_type: 'outgoing',
        };
      }).filter(inv => Math.abs(amountNum(inv.outstanding)) > 0.0001);

      let remaining = Math.abs(amountNum(it.amount));
      const selectedAllocs = [];
      rows.forEach((inv) => {
        const outstanding = amountNum(inv.outstanding);
        const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrency));
        let alloc = 0;
        if (outstanding < -0.0001) {
          alloc = outstanding;
        } else {
          const allocTxn = Math.min(Math.max(0, outstandingTxn), Math.max(0, remaining));
          const outAbs = Math.abs(outstanding);
          alloc = (outAbs > 0 && outstandingTxn > 0)
            ? Math.min(Math.max(0, outAbs), (allocTxn * outAbs) / outstandingTxn)
            : 0;
        }
        if (Math.abs(alloc) > 0.0001) {
          selectedAllocs.push({
            invoice_id: inv.id,
            amount: alloc,
            amount_txn: amountNum(getInvoiceAllocationInTxn(inv, alloc, txnCurrency)),
            invoice_type: 'outgoing',
            invoice_number: inv.invoice_number || '',
            invoice_currency: normalizeCurrency(inv?.currency || ''),
            invoice_exchange_rate: amountNum(inv?.exchange_rate),
            invoice_gross_amount: amountNum(inv?.gross_amount),
            invoice_gross_amount_huf: amountNum(inv?.gross_amount_huf),
            invoice_net_amount_huf: amountNum(inv?.net_amount_huf),
            invoice_vat_amount_huf: amountNum(inv?.vat_amount_huf),
            invoice_outstanding: amountNum(inv?.outstanding),
          });
          remaining -= getInvoiceAllocationInTxn(inv, alloc, txnCurrency);
        }
      });
      const firstInvoice = selectedAllocs[0] && rows.find(r => String(r.id) === String(selectedAllocs[0].invoice_id));
      return {
        allocations: selectedAllocs,
        proposed_invoice: firstInvoice ? {
          id: firstInvoice.id,
          invoice_number: firstInvoice.invoice_number,
          amount: firstInvoice.outstanding,
          type: 'outgoing',
        } : null,
      };
    }

    const normDigits = (v) => String(v || '').replace(/\D+/g, '');
    const normText = (v) => String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normalizeInvoiceToken = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const parseDateVal = (v) => {
      const ts = Date.parse(v || '');
      return Number.isFinite(ts) ? ts : -Infinity;
    };
    const extractRemittanceTokens = (text) => {
      const src = String(text || '').toUpperCase();
      const found = [];
      const patterns = [
        /[A-Z]{1,6}[-/]?\d{2,8}[-/]?\d{1,8}/g,
        /\d{4}[-/]\d{1,8}/g,
        /[A-Z]{2,6}\d{4,12}/g,
        /\b\d{6,20}\b/g,
      ];
      patterns.forEach((re) => {
        const matches = src.match(re) || [];
        matches.forEach((m) => {
          const token = normalizeInvoiceToken(m);
          if (token && token.length >= 6) found.push(token);
        });
      });
      return Array.from(new Set(found));
    };

    let customerDetails = null;
    try {
      const customerRes = await customerAPI.getCustomer(custId);
      customerDetails = customerRes?.data || null;
    } catch {}

    const customerName = normText(it?.proposed_customer?.name || customerDetails?.name || it?.counterparty_name || '');
    const ignoredNameTokens = new Set(['magyar', 'nyrt', 'kft', 'zrt', 'bt', 'rt', 'es', 'és', 'nyilvanosan', 'mukodo', 'reszvenytarsasag']);
    const customerNameTokens = new Set(customerName.split(' ').filter(t => t.length >= 3 && !ignoredNameTokens.has(t)));
    const customerTaxCandidates = [
      customerDetails?.tax_number,
      customerDetails?.full_tax_number,
      customerDetails?.vat_group_member_tax_number,
    ].map(normDigits).filter(Boolean);
    const remittanceTokens = extractRemittanceTokens(it?.remittance || it?.comment || '');
    const remittanceShortSuffixTokens = Array.from(new Set(
      (String(it?.remittance || it?.comment || '').toUpperCase().match(/\b\d{3,6}\b/g) || [])
        .map((m) => String(m || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, ''))
        .filter((tok) => tok.length >= 3)
    ));
    const isRemittanceInvoiceMatch = (invoiceNoNorm = '') => {
      const invoiceToken = String(invoiceNoNorm || '');
      if (!invoiceToken) return false;
      if (remittanceTokens.some((tok) => invoiceToken.includes(tok) || tok.includes(invoiceToken))) return true;
      const invoiceDigits = invoiceToken.replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
      if (!invoiceDigits) return false;
      return remittanceShortSuffixTokens.some((tok) => invoiceDigits.endsWith(tok));
    };
    const txnAbs = Math.abs(txnAmount);

    const fetchIncoming = async (searchVal, { fetchAll = false } = {}) => {
      const pageSize = 1000;
      let page = 1;
      let guard = 0;
      const out = [];

      while (guard < 30) {
        guard += 1;
        const res = await api.get('/api/invoices/incoming/', {
          params: {
            company_id: selectedCompanyId,
            page,
            page_size: pageSize,
            search: (searchVal || '').trim() || undefined,
          }
        });
        const data = res?.data || {};
        const chunk = Array.isArray(data?.items) ? data.items : [];
        out.push(...chunk);

        if (!fetchAll) break;
        const hasMore = !!data?.hasMore;
        const pageCount = Number(data?.pageCount || 0);
        const hasMoreByCount = Number.isFinite(pageCount) && pageCount > 0 ? page < pageCount : false;
        if (!hasMore && !hasMoreByCount) break;
        page += 1;
      }

      return out;
    };

    let items = showAllInvoices
      ? await fetchIncoming('', { fetchAll: true })
      : await fetchIncoming(customerName);
    if (!items.length) items = await fetchIncoming((it?.counterparty_name || '').toString().trim().slice(0, 120));
    if (!items.length) items = await fetchIncoming('');

    if (normalizeCurrency(txnCurrency) === 'HUF' && items.length > 0) {
      const statementDate = String(it?.value_date || it?.statement_date || '').slice(0, 10) || undefined;
      const hasHufAmount = (inv) => {
        const grossHuf = amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf);
        const netHuf = amountNum(inv?.netAmountHUF || inv?.net_amount_huf);
        const vatHuf = amountNum(inv?.vatAmountHUF || inv?.vat_amount_huf);
        return grossHuf > 0.0001 || (netHuf + vatHuf) > 0.0001;
      };

      const currenciesToFetch = Array.from(new Set(
        items
          .map((inv) => normalizeCurrency(inv?.currency || 'HUF'))
          .filter((cur) => cur !== 'HUF')
          .filter((cur) => items.some((inv) => {
            const invCur = normalizeCurrency(inv?.currency || 'HUF');
            const existingRate = amountNum(inv?.exchangeRate || inv?.exchange_rate);
            return invCur === cur && !hasHufAmount(inv) && existingRate <= 0.0001;
          }))
      ));

      if (currenciesToFetch.length > 0) {
        const rateMap = {};
        const rateResults = await Promise.allSettled(
          currenciesToFetch.map(async (cur) => {
            const res = await utilsAPI.getExchangeRate(cur, statementDate);
            const rate = amountNum(res?.data?.rate);
            if (rate > 0.0001) {
              rateMap[cur] = rate;
            }
          })
        );
        if (rateResults.length > 0) {
          items = items.map((inv) => {
            const invCur = normalizeCurrency(inv?.currency || 'HUF');
            const existingRate = amountNum(inv?.exchangeRate || inv?.exchange_rate);
            if (invCur === 'HUF' || hasHufAmount(inv) || existingRate > 0.0001) return inv;
            const fallbackRate = rateMap[invCur];
            if (fallbackRate > 0.0001) {
              return { ...inv, exchangeRate: fallbackRate, _statementRateFallback: true };
            }
            return inv;
          });
        }
      }
    }

    let rows = items.filter((inv) => {
      const supplierTaxCandidates = [
        inv?.supplierTaxNumber,
        inv?.supplierFullTaxNumber,
        inv?.supplierVatGroupMemberTaxNumber,
      ].map(normDigits).filter(Boolean);
      const supplierName = normText(inv?.supplierName);
      const supplierNameTokens = new Set(supplierName.split(' ').filter(t => t.length >= 3 && !ignoredNameTokens.has(t)));
      const hasCustomerTax = customerTaxCandidates.length > 0;
      const hasSupplierTax = supplierTaxCandidates.length > 0;
      const taxMatch = customerTaxCandidates.some((ct) => supplierTaxCandidates.some((st) => st === ct || (ct.length >= 8 && st.length >= 8 && (st.slice(0, 8) === ct.slice(0, 8)))));
      const overlapCount = Array.from(customerNameTokens).reduce((sum, tok) => sum + (supplierNameTokens.has(tok) ? 1 : 0), 0);
      const nameMatch = customerName && supplierName && (
        supplierName.includes(customerName) ||
        customerName.includes(supplierName) ||
        overlapCount >= 2 ||
        Array.from(customerNameTokens).some((tok) => tok.length >= 7 && supplierNameTokens.has(tok))
      );
      const partnerMatch = (hasCustomerTax && hasSupplierTax) ? taxMatch : (taxMatch || nameMatch);
      const invoiceNoNorm = normalizeInvoiceToken(inv?.invoiceNumber);
      const remittanceInvoiceMatch = isRemittanceInvoiceMatch(invoiceNoNorm);
      if (showAllInvoices) {
        return partnerMatch || remittanceInvoiceMatch;
      }
      const gross = Math.abs(amountNum(inv?.grossAmount));
      const paidByBank = Math.abs(amountNum(inv?.bankPaidAmount));
      const bankRemaining = gross > 0.0001 ? Math.max(gross - paidByBank, 0) : gross;
      const unpaidOrPartialByBank = gross <= 0.0001 || bankRemaining > 0.005;
      return (partnerMatch || remittanceInvoiceMatch) && unpaidOrPartialByBank;
    }).map(inv => {
      const grossSigned = amountNum(inv.grossAmount);
      const paidByBankAbs = Math.abs(amountNum(inv.bankPaidAmount));
      const grossAbs = Math.abs(grossSigned);
      const bankRemainingAbs = grossAbs > 0.0001 ? Math.max(grossAbs - paidByBankAbs, 0) : grossAbs;
      const signedOutstandingBase = grossSigned >= 0 ? bankRemainingAbs : -bankRemainingAbs;
      const signedOutstanding = toSignedOutstanding(signedOutstandingBase, inv);
      return {
        _raw_invoice: inv,
        _invoice_no_norm: normalizeInvoiceToken(inv.invoiceNumber),
        id: inv.invoiceNumber,
        invoice_number: inv.invoiceNumber,
        currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
        exchange_rate: amountNum(inv?.exchangeRate || inv?.exchange_rate),
        gross_amount: amountNum(inv?.grossAmount || inv?.gross_amount),
        gross_amount_huf: amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf),
        invoice_operation: inv?.invoiceOperation || inv?.invoice_operation || null,
        original_invoice_number: inv?.originalInvoiceNumber || inv?.original_invoice_number || null,
        is_storno_invoice: !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno),
        is_storno_original: !!(inv?.isStornoOriginal || inv?.is_storno_original),
        due_date: inv.dueDate,
        supplier_name: inv.supplierName,
        supplier_tax_number: inv.supplierTaxNumber,
        outstanding: signedOutstanding,
        invoice_type: 'incoming',
      };
    }).filter(inv => Math.abs(amountNum(inv.outstanding)) > 0.0001);

    if (remittanceTokens.length > 0) {
      const tokenOnly = rows.filter((inv) => isRemittanceInvoiceMatch(String(inv?._invoice_no_norm || '')));
      if (tokenOnly.length > 0) {
        rows = tokenOnly;
      }
    }

    rows = rows
      .map((inv) => {
        const tokenPriority = remittanceTokens.reduce((bestIdx, tok, idx) => {
          const no = inv._invoice_no_norm || '';
          if (!no) return bestIdx;
          if (no.includes(tok) || tok.includes(no)) {
            return Math.min(bestIdx, idx);
          }
          return bestIdx;
        }, Number.POSITIVE_INFINITY);
        const remittanceMatched = Number.isFinite(tokenPriority) || isRemittanceInvoiceMatch(inv._invoice_no_norm || '');
        const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrency));
        const amountDiff = Math.abs(outstandingTxn - txnAbs);
        const dateVal = parseDateVal(inv.due_date);
        return {
          ...inv,
          _remittanceMatched: remittanceMatched,
          _tokenPriority: tokenPriority,
          _outstandingTxn: outstandingTxn,
          _amountDiff: amountDiff,
          _dateVal: dateVal,
        };
      })
      .sort((a, b) => {
        if (a._remittanceMatched !== b._remittanceMatched) return a._remittanceMatched ? -1 : 1;
        if (a._tokenPriority !== b._tokenPriority) return a._tokenPriority - b._tokenPriority;
        if (Math.abs(a._amountDiff - b._amountDiff) > 0.0001) return a._amountDiff - b._amountDiff;
        return b._dateVal - a._dateVal;
      });

    let remaining = Math.abs(amountNum(it.amount));
    const selectedAllocs = [];
    rows.forEach((inv) => {
      const outstanding = amountNum(inv.outstanding);
      const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrency));
      let alloc = 0;
      if (outstanding < -0.0001) {
        alloc = outstanding;
      } else {
        const allocTxn = Math.min(Math.max(0, outstandingTxn), Math.max(0, remaining));
        const outAbs = Math.abs(outstanding);
        alloc = (outAbs > 0 && outstandingTxn > 0)
          ? Math.min(Math.max(0, outAbs), (allocTxn * outAbs) / outstandingTxn)
          : 0;
      }
      if (Math.abs(alloc) > 0.0001) {
        selectedAllocs.push({
          invoice_id: inv.id,
          amount: alloc,
          amount_txn: amountNum(getInvoiceAllocationInTxn(inv, alloc, txnCurrency)),
          invoice_type: 'incoming',
          invoice_number: inv.invoice_number || '',
          invoice_currency: normalizeCurrency(inv?.currency || ''),
          invoice_exchange_rate: amountNum(inv?.exchange_rate),
          invoice_gross_amount: amountNum(inv?.gross_amount),
          invoice_gross_amount_huf: amountNum(inv?.gross_amount_huf),
          invoice_net_amount_huf: amountNum(inv?.net_amount_huf),
          invoice_vat_amount_huf: amountNum(inv?.vat_amount_huf),
          invoice_outstanding: amountNum(inv?.outstanding),
        });
        remaining -= getInvoiceAllocationInTxn(inv, alloc, txnCurrency);
      }
    });

    const firstInvoice = selectedAllocs[0] && rows.find(r => String(r.id) === String(selectedAllocs[0].invoice_id));
    return {
      allocations: selectedAllocs,
      proposed_invoice: firstInvoice ? {
        id: firstInvoice.id,
        invoice_number: firstInvoice.invoice_number,
        amount: firstInvoice.outstanding,
        type: 'incoming',
      } : null,
    };
  }, [amountNum, getInvoiceAllocationInTxn, getInvoiceOutstandingInTxn, normalizeCurrency, selectedCompanyId]);

  const applyAutoAllocationToPreview = React.useCallback(async (previewData) => {
    const hasExistingSuggestion = (item = {}) => {
      const hasAlloc = Array.isArray(item?.allocations) && item.allocations.some((a) => amountNum(a?.amount) > 0.0001);
      const hasInvoice = !!(item?.proposed_invoice?.id || item?.proposed_invoice?.invoice_number);
      return hasAlloc || hasInvoice;
    };

    const hasRemittanceTokens = (item = {}) => {
      const text = String(item?.remittance || item?.comment || '').toUpperCase();
      if (!text) return false;
      return /(AD2E\d{8})|\b\d{8,15}\b|\b\d{4}\/\d+\b/.test(text);
    };

    const totalItems = (previewData || []).reduce((sum, header) => sum + ((header?.items || []).length), 0);
    const actionableItems = (previewData || []).reduce((sum, header) => (
      sum + ((header?.items || []).filter((it) => !hasExistingSuggestion(it) || hasRemittanceTokens(it)).length)
    ), 0);

    if (totalItems <= 0 || actionableItems <= 0) {
      clearSuggestionPct();
      return;
    }

    setSuggestionPct(3, 'Javaslatok előkészítése');
    try {
      let customers = [];
      try {
        const customerRes = await customerAPI.getCustomers({ page_size: 5000 });
        const customerRows = customerRes?.data?.results || customerRes?.data || [];
        customers = Array.isArray(customerRows) ? customerRows : [];
      } catch {
        customers = [];
      }
      setSuggestionPct(10, 'Partnerlista betöltve');

      const resolveCustomerId = (it) => {
        const directId = it?.proposed_customer?.id || it?.saved_customer?.id || it?.customer?.id;
        if (directId) return directId;

        const candidateId = (Array.isArray(it?.customer_candidates) ? it.customer_candidates : [])
          .map((c) => c?.id)
          .find(Boolean);
        if (candidateId) return candidateId;

        const suggestedId = it?.proposed_customer_id || it?.saved_customer_id || it?.customer_id || it?.customerId || it?.proposed_customer?.customer_id;
        if (suggestedId) return suggestedId;

        const counterpartyAccountNorm = normalizeAccount(getStatementCounterpartyAccount(it));
        if (counterpartyAccountNorm && customers.length > 0) {
          const byBank = customers.find((c) => {
            const accounts = Array.isArray(c?.bank_accounts) ? c.bank_accounts : [];
            return accounts.some((ba) => {
              const n1 = normalizeAccount(ba?.account_number);
              const n2 = normalizeAccount(ba?.iban);
              return (n1 && n1 === counterpartyAccountNorm) || (n2 && n2 === counterpartyAccountNorm);
            });
          });
          if (byBank?.id) return byBank.id;
        }

        const nameNorm = normalizeName(it?.proposed_customer?.name || it?.saved_customer?.name || getStatementPartnerName(it) || '');
        if (nameNorm && customers.length > 0) {
          const byExactName = customers.find((c) => normalizeName(c?.name) === nameNorm);
          if (byExactName?.id) return byExactName.id;
          const byContains = customers.find((c) => normalizeName(c?.name).includes(nameNorm) || nameNorm.includes(normalizeName(c?.name)));
          if (byContains?.id) return byContains.id;
        }

        return null;
      };

      const nextPreview = [];
      let processedItems = 0;
      let lastReportedPct = -1;
      for (const header of (previewData || [])) {
        const nextItems = [];
        for (const it of (header.items || [])) {
          const allowOverrideByRemittance = hasRemittanceTokens(it);
          if (hasExistingSuggestion(it) && !allowOverrideByRemittance) {
            nextItems.push(it);
            continue;
          }

          const resolvedCustomerId = resolveCustomerId(it);
          if (!resolvedCustomerId) {
            nextItems.push(it);
            processedItems += 1;
            const pct = Math.min(95, 10 + Math.round((processedItems / actionableItems) * 85));
            if (pct !== lastReportedPct) {
              lastReportedPct = pct;
              setSuggestionPct(pct, 'Javaslatok betöltése');
            }
            continue;
          }

          try {
            const auto = await computeAutoAllocationForItem(it, { customerId: resolvedCustomerId });
            if (!auto || !Array.isArray(auto.allocations) || auto.allocations.length === 0) {
              nextItems.push({
                ...it,
                proposed_customer: {
                  ...(it?.proposed_customer || {}),
                  id: resolvedCustomerId,
                },
              });
              continue;
            }
            nextItems.push({
              ...it,
              proposed_customer: {
                ...(it?.proposed_customer || {}),
                id: resolvedCustomerId,
              },
              allocations: auto.allocations,
              proposed_invoice: allowOverrideByRemittance
                ? (auto.proposed_invoice || it.proposed_invoice || null)
                : (it.proposed_invoice || auto.proposed_invoice || null),
              suggestion_origin: 'detailed',
            });
          } catch {
            nextItems.push(it);
          }
          processedItems += 1;
          const pct = Math.min(95, 10 + Math.round((processedItems / actionableItems) * 85));
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            setSuggestionPct(pct, 'Javaslatok betöltése');
          }
        }
        nextPreview.push({ ...header, items: nextItems });
      }

      setStmPreview((currentPreview) => {
        if (!Array.isArray(currentPreview) || currentPreview.length === 0) {
          return nextPreview;
        }

        const isManuallySaved = (item = {}) => {
          const hasSavedAllocs = Array.isArray(item?.saved_allocations) && item.saved_allocations.length > 0;
          return !!(item?.approved || item?.pairing_marked_at || item?.saved_pairing_marked_at || hasSavedAllocs || item?.saved_invoice);
        };

        return nextPreview.map((nextHeader, headerIdx) => {
          const currentHeader = currentPreview[headerIdx];
          if (!currentHeader) return nextHeader;
          const mergedItems = (nextHeader?.items || []).map((nextItem, itemIdx) => {
            const currentItem = (currentHeader?.items || [])[itemIdx];
            if (!currentItem) return nextItem;
            if (isManuallySaved(currentItem)) return currentItem;
            return nextItem;
          });
          return { ...nextHeader, items: mergedItems };
        });
      });
      setSuggestionPct(100, 'Javaslatok kész');
      setTimeout(() => clearSuggestionPct(), 500);
    } catch {
      clearSuggestionPct();
    }
  }, [amountNum, clearSuggestionPct, computeAutoAllocationForItem, getStatementCounterpartyAccount, getStatementPartnerName, normalizeAccount, normalizeName, selectedCompanyId, setSuggestionPct]);

  React.useEffect(() => {
    if (!customerModal.open || !customerModal.recommendedId) return;
    const el = customerRowRefs.current[String(customerModal.recommendedId)];
    if (el && typeof el.scrollIntoView === 'function') {
      setTimeout(() => {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        try { el.focus({ preventScroll: true }); } catch {
          try { el.focus(); } catch {}
        }
      }, 50);
    }
  }, [customerModal.open, customerModal.recommendedId]);

  React.useEffect(() => {
    if (!customerModal.open) return;
    const t = setTimeout(() => {
      try { customerSearchInputRef.current?.focus(); } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [customerModal.open]);

  const openCustomerSelectModal = async (hIdx, iIdx, it) => {
    const candidates = Array.isArray(it?.customer_candidates) ? it.customer_candidates : [];
    const normalizedName = normalizeName(getStatementPartnerName(it));
    const normalizedCounterpartyAccount = normalizeAccount(getStatementCounterpartyAccount(it));
    const fallbackProposedId = it?.proposed_customer?.id || null;
    let recommendedId = fallbackProposedId || (candidates[0]?.id || null);
    setCustomerModal({ open: true, hIdx, iIdx, item: it, customers: [], recommendedId, search: '', loading: true });
    try {
      const res = await customerAPI.getCustomers({ page_size: 5000 });
      const rows = res?.data?.results || res?.data || [];
      const customers = Array.isArray(rows) ? rows : [];
      let derivedRecommendedId = null;
      if (!derivedRecommendedId && normalizedCounterpartyAccount) {
        const byBankAccount = customers.find((c) => {
          const accounts = Array.isArray(c?.bank_accounts) ? c.bank_accounts : [];
          return accounts.some((ba) => {
            const n1 = normalizeAccount(ba?.account_number);
            const n2 = normalizeAccount(ba?.iban);
            return (n1 && n1 === normalizedCounterpartyAccount) || (n2 && n2 === normalizedCounterpartyAccount);
          });
        });
        if (byBankAccount) derivedRecommendedId = byBankAccount.id;
      }
      if (!derivedRecommendedId && normalizedName) {
        const byExactName = customers.find((c) => normalizeName(c?.name) === normalizedName);
        if (byExactName) derivedRecommendedId = byExactName.id;
      }
      if (!derivedRecommendedId && normalizedName) {
        const byContains = customers.find((c) => normalizeName(c?.name).includes(normalizedName));
        if (byContains) derivedRecommendedId = byContains.id;
      }
      recommendedId = derivedRecommendedId || fallbackProposedId || recommendedId;
      setCustomerModal(prev => ({ ...prev, customers, recommendedId, loading: false }));
    } catch {
      setCustomerModal(prev => ({ ...prev, loading: false }));
      toast.error('Ügyfél lista betöltése sikertelen');
    }
  };

  const refreshCustomerModalList = React.useCallback(async () => {
    if (!customerModal?.open || !customerModal?.item) return;
    const it = customerModal.item;
    const candidates = Array.isArray(it?.customer_candidates) ? it.customer_candidates : [];
    const normalizedName = normalizeName(getStatementPartnerName(it));
    const normalizedCounterpartyAccount = normalizeAccount(getStatementCounterpartyAccount(it));
    const fallbackProposedId = it?.proposed_customer?.id || customerModal?.recommendedId || (candidates[0]?.id || null);
    setCustomerModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await customerAPI.getCustomers({ page_size: 5000 });
      const rows = res?.data?.results || res?.data || [];
      const customers = Array.isArray(rows) ? rows : [];
      let derivedRecommendedId = null;
      if (!derivedRecommendedId && normalizedCounterpartyAccount) {
        const byBankAccount = customers.find((c) => {
          const accounts = Array.isArray(c?.bank_accounts) ? c.bank_accounts : [];
          return accounts.some((ba) => {
            const n1 = normalizeAccount(ba?.account_number);
            const n2 = normalizeAccount(ba?.iban);
            return (n1 && n1 === normalizedCounterpartyAccount) || (n2 && n2 === normalizedCounterpartyAccount);
          });
        });
        if (byBankAccount) derivedRecommendedId = byBankAccount.id;
      }
      if (!derivedRecommendedId && normalizedName) {
        const byExactName = customers.find((c) => normalizeName(c?.name) === normalizedName);
        if (byExactName) derivedRecommendedId = byExactName.id;
      }
      if (!derivedRecommendedId && normalizedName) {
        const byContains = customers.find((c) => normalizeName(c?.name).includes(normalizedName));
        if (byContains) derivedRecommendedId = byContains.id;
      }
      const recommendedId = derivedRecommendedId || fallbackProposedId || null;
      setCustomerModal(prev => ({ ...prev, customers, recommendedId, loading: false }));
      toast.success('Ügyfél lista frissítve');
    } catch {
      setCustomerModal(prev => ({ ...prev, loading: false }));
      toast.error('Ügyfél lista frissítése sikertelen');
    }
  }, [customerModal, getStatementCounterpartyAccount, getStatementPartnerName, normalizeAccount, normalizeName, selectedCompanyId]);

  const openNewCustomerPage = () => {
    try {
      window.open('/customers/new', '_blank', 'noopener,noreferrer');
    } catch {
      window.open('/customers/new', '_blank');
    }
  };

  React.useEffect(() => {
    if (!customerModal?.open) return;

    const onFocus = () => {
      refreshCustomerModalList();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshCustomerModalList();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [customerModal?.open, refreshCustomerModalList]);

  const selectCustomerFromModal = (customer) => {
    const { hIdx, iIdx, item, customers } = customerModal;
    if (hIdx === null || iIdx === null) return;
    setCustomer(hIdx, iIdx, { id: customer.id, name: customer.name });

    const counterpartyAccountRaw = String(getStatementCounterpartyAccount(item) || '').trim();
    const normalizedAccount = normalizeAccount(counterpartyAccountRaw);
    const selectedCustomerId = String(customer.id);
    const allCustomers = Array.isArray(customers) ? customers : [];

    // digit-only form for cross-format comparison (IBAN digits embed the account digits)
    const acctDigits = normalizedAccount.replace(/\D/g, '');
    const isIban = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalizedAccount);

    // Check if two accounts refer to the same underlying bank account by digit comparison
    const isSameUnderlying = (ba) => {
      const n1 = normalizeAccount(ba?.account_number);
      const n2 = normalizeAccount(ba?.iban);
      const d1 = n1.replace(/\D/g, '');
      const d2 = n2.replace(/\D/g, '');
      if (n1 && n1 === normalizedAccount) return true;
      if (n2 && n2 === normalizedAccount) return true;
      if (acctDigits && d1 && (acctDigits.endsWith(d1) || d1.endsWith(acctDigits))) return true;
      if (acctDigits && d2 && (acctDigits.endsWith(d2) || d2.endsWith(acctDigits))) return true;
      return false;
    };

    // Exact normalized match at selected customer
    const exactMatchAtOwner = normalizedAccount
      ? (() => {
          const c = allCustomers.find(c => String(c?.id) === selectedCustomerId);
          const ba = (c?.bank_accounts || []).find(ba => {
            const n1 = normalizeAccount(ba?.account_number);
            const n2 = normalizeAccount(ba?.iban);
            return (n1 && n1 === normalizedAccount) || (n2 && n2 === normalizedAccount);
          });
          return ba || null;
        })()
      : null;

    // Related (same underlying, different format) at selected customer
    const relatedMatchAtOwner = !exactMatchAtOwner && normalizedAccount
      ? (() => {
          const c = allCustomers.find(c => String(c?.id) === selectedCustomerId);
          return (c?.bank_accounts || []).find(ba => isSameUnderlying(ba)) || null;
        })()
      : null;

    // Conflict: another customer owns this account (exact or related)
    const conflictOwner = normalizedAccount
      ? allCustomers.find((c) => {
          if (String(c?.id) === selectedCustomerId) return false;
          return (c?.bank_accounts || []).some(ba => isSameUnderlying(ba));
        })
      : null;

    const setBankSaveFlags = (save, removeConflicts = false, { persistNow = false } = {}) => {
      let nextPreview = null;
      flushSync(() => {
        setStmPreview(prev => {
          nextPreview = prev.map((h, hi) => hi!==hIdx ? h : ({
            ...h,
            items: (h.items || []).map((it, ii) => ii!==iIdx ? it : ({
              ...it,
              proposed_customer: customer ? { id: customer.id, name: customer.name } : (it?.proposed_customer || null),
              save_bank_account: !!save,
              save_bank_account_marked_at: save ? (it.save_bank_account_marked_at || new Date().toISOString()) : null,
              remove_conflicting_bank_accounts: !!removeConflicts,
            }))
          }));
          return nextPreview;
        });
      });

      if (persistNow && Array.isArray(nextPreview)) {
        setTimeout(() => {
          persistPreviewToDb(nextPreview, { notify: true });
        }, 0);
      }
    };

    if (counterpartyAccountRaw) {
      if (exactMatchAtOwner) {
        // Already assigned in exact form – still flag for format normalization
        toast.info('Ez a bankszámla már pontosan hozzá van rendelve ehhez a partnerhez.');
        setBankSaveFlags(true, false, { persistNow: true });
      } else if (relatedMatchAtOwner && conflictOwner) {
        // Same underlying at owner (different format) + conflict at another customer
        const existingDisplay = relatedMatchAtOwner.iban || relatedMatchAtOwner.account_number || '?';
        const action = (relatedMatchAtOwner.iban ? 'IBAN-t frissítjük' : 'IBAN-t hozzáadjuk');
        Modal.confirm({
          title: 'Bankszámla áthelyezés + frissítés',
          content: `A bankszámla jelenleg „${conflictOwner.name}" partnerhez tartozik.\n` +
            `„${customer.name}" partnernek van hasonló bankszámlája más formátumban: ${existingDisplay}.\n` +
            `Töröljük „${conflictOwner.name}"-től, és ${action} a meglévő rekordhoz (${counterpartyAccountRaw})?`,
          okText: 'Igen',
          cancelText: 'Nem',
          zIndex: 12050,
          onOk: () => setBankSaveFlags(true, true, { persistNow: true }),
          onCancel: () => toast.info('A bankszámla mentése kihagyva.'),
        });
      } else if (relatedMatchAtOwner) {
        // Different format at same owner – update existing record
        const existingDisplay = relatedMatchAtOwner.iban || relatedMatchAtOwner.account_number || '?';
        const hasIban = !!(relatedMatchAtOwner.iban);
        const action = hasIban
          ? `A meglévő IBAN (${existingDisplay}) felülírásra kerül erre: ${counterpartyAccountRaw}`
          : `IBAN hozzáadva a meglévő bankszámlához (${existingDisplay}) → ${counterpartyAccountRaw}`;
        Modal.confirm({
          title: 'Meglévő bankszámla frissítése',
          content: action,
          okText: isIban ? 'IBAN mentése' : 'Frissítés',
          cancelText: 'Mégse',
          zIndex: 12050,
          onOk: () => setBankSaveFlags(true, false, { persistNow: true }),
          onCancel: () => setBankSaveFlags(false, false),
        });
      } else if (conflictOwner) {
        // Only conflict – ask to transfer
        Modal.confirm({
          title: 'A bankszámla már másik partnerhez tartozik',
          content: `Jelenleg: „${conflictOwner.name}". Töröljük onnan, és mentsük ehhez: „${customer.name}"?`,
          okText: 'Igen',
          cancelText: 'Nem',
          zIndex: 12050,
          onOk: () => setBankSaveFlags(true, true, { persistNow: true }),
          onCancel: () => toast.info('A bankszámla mentése kihagyva (ütközés miatt).'),
        });
      } else {
        // Brand new – ask to create
        Modal.confirm({
          title: 'Bankszámla mentése',
          content: `Mentsük el a „${counterpartyAccountRaw}" bankszámlát „${customer.name}" új bankszámlájaként?`,
          okText: 'Igen',
          cancelText: 'Nem',
          zIndex: 12050,
          onOk: () => setBankSaveFlags(true, false, { persistNow: true }),
          onCancel: () => setBankSaveFlags(false, false),
        });
      }
    }

    setCustomerModal({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false });
  };

  const isAllowedImportExt = (nm) => {
    const n = (nm || '').toLowerCase();
    return n.endsWith('.zip') || n.endsWith('.xml') || n.endsWith('.stm');
  };

  const addPickedFiles = (incomingFiles) => {
    const added = Array.from(incomingFiles || []).filter(x => isAllowedImportExt(x?.name));
    if (!added.length) return;

    setFiles(prev => {
      const byKey = new Map(prev.map(f => [`${f.name}::${f.size}::${f.lastModified}`, f]));
      for (const f of added) byKey.set(`${f.name}::${f.size}::${f.lastModified}`, f);
      return Array.from(byKey.values());
    });

    const first = String(added[0]?.name || '').toLowerCase();
    if (first.endsWith('.zip')) setTab('zip');
    else setTab('stm');
  };

  const openImportFilePicker = async () => {
    if (!window?.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        id: 'bank-statements-import',
        startIn: 'documents',
        multiple: true,
        types: [
          {
            description: 'Bank statement files',
            accept: {
              'application/zip': ['.zip'],
              'application/xml': ['.xml', '.stm'],
              'text/plain': ['.stm'],
            },
          },
        ],
      });
      const selectedFiles = await Promise.all((handles || []).map((h) => h.getFile()));
      addPickedFiles(selectedFiles);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        fileInputRef.current?.click();
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    addPickedFiles(e.dataTransfer.files || []);
  };
  const onPick = (e) => {
    addPickedFiles(e.target.files || []);
    if (e.target) e.target.value = '';
  };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i!==idx));
  const closePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewReadOnly(false);
    setPreviewSourceStatementId(null);
    if (isImportPreviewPage) {
      navigate(importBackTarget, { replace: true });
      return;
    }
    if (returnToUploadedRef.current) {
      returnToUploadedRef.current = false;
      navigate('/bank-statements/uploaded', { replace: true });
    }
  };

  const doImport = async (arg = {}) => {
    if (arg && typeof arg.preventDefault === 'function') {
      arg.preventDefault();
    }
    if (arg && typeof arg.stopPropagation === 'function') {
      arg.stopPropagation();
    }
    const skipExisting = !!(arg && typeof arg === 'object' && arg.skipExisting);
    if (!selectedCompanyId) { toast.error('Válassz céget'); return; }
    if (!files.length) { toast.info('Válassz fájlokat'); return; }
    setImporting(true);
    setImportPct(5, 'Fájlok ellenőrzése');
    try {
      if (tab === 'zip') {
        setImportPct(25, 'ZIP feldolgozás indítása');
        const res = await bankStatementsAPI.importZipDryRun(selectedCompanyId, files);
        setImportPct(70, 'ZIP előnézet építése');
        const payload = res.data || {};
        const switched = maybeHandleCompanyMismatch(payload);
        if (switched) {
          setZipPreview(null);
          setStmPreview(null);
          return;
        }
        setZipPreview(payload);
        setImportPct(95, 'Előnézet megnyitása');
        setShowPreviewModal(true);
        navigate(importPreviewUrl);
        setFiles([]);
      } else {
        setImportPct(25, 'XML/STM feldolgozás indítása');
        // Slowly crawl from 25→55% while backend processes, so bar doesn't look frozen
        let _tickPct = 25;
        const _ticker = setInterval(() => {
          _tickPct = Math.min(55, _tickPct + 0.8);
          setImportProgress(prev => prev.active ? { ...prev, percent: _tickPct, _slow: true } : prev);
        }, 1000);
        let res;
        try {
          res = await bankStatementsAPI.importStmDryRun(selectedCompanyId, files, { skipExisting });
        } finally {
          clearInterval(_ticker);
        }
        setImportPct(60, 'Előnézeti tételek feldolgozása');
        const payload = res.data || {};
        const switched = maybeHandleCompanyMismatch(payload);
        if (switched) {
          setZipPreview(null);
          setStmPreview(null);
          return;
        }
        const existingRows = Array.isArray(data) ? data : (data?.results || []);
        const previewRows = Array.isArray(payload?.preview) ? payload.preview : [];
        const normalized = (v) => String(v || '').trim();
        const duplicates = previewRows.filter((row) => {
          const accountId = normalized(row?.account_id);
          const stmtDate = normalized(row?.statement_date);
          const seq = normalized(row?.sequence_number);
          if (!accountId || !stmtDate || !seq) return false;
          return existingRows.some((st) => (
            normalized(st?.bank_account) === accountId &&
            normalized(st?.statement_date) === stmtDate &&
            normalized(st?.sequence_number) === seq
          ));
        });
        if (duplicates.length && !skipExisting) {
          const first = duplicates[0] || {};
          Modal.confirm({
            title: 'Duplikált bankkivonat',
            content:
              `Ilyen bankkivonat már fel lett töltve (${first.statement_date || '-'} / ${first.sequence_number || '-'}). ` +
              'Kihagyhatom ezt a kivonatot, és folytathatom a többi importját.',
            okText: 'Folytatom a többivel',
            cancelText: 'OK',
            centered: true,
            maskClosable: false,
            onOk: () => doImport({ skipExisting: true }),
          });
          return;
        }
        if (duplicates.length && skipExisting) {
          const duplicateKeys = new Set(duplicates.map((d) => `${normalized(d?.account_id)}|${normalized(d?.statement_date)}|${normalized(d?.sequence_number)}`));
          payload.preview = previewRows.filter((row) => !duplicateKeys.has(`${normalized(row?.account_id)}|${normalized(row?.statement_date)}|${normalized(row?.sequence_number)}`));
          toast.info(`Duplikált kivonatok kihagyva: ${duplicates.length}`);
        }
        const skippedByBackend = Array.isArray(payload?.skipped_duplicate_statements) ? payload.skipped_duplicate_statements : [];
        if (skippedByBackend.length > 0) {
          toast.info(`Duplikált kivonatok kihagyva: ${skippedByBackend.length}`);
        }
        // Auto-approve all items by default as OK column is removed
        const preview = (payload?.preview || []).map(h => ({
           ...h,
          items: (h.items||[]).map(it => ({
            ...it,
            suggestion_origin: (
              (Array.isArray(it?.allocations) && it.allocations.some((a) => amountNum(a?.amount) > 0.0001)) ||
              !!(it?.proposed_invoice?.id || it?.proposed_invoice?.invoice_number)
            ) ? 'backend' : null,
            statement_currency: h?.currency || null,
            approved: false,
            pairing_marked_at: null,
            saved_pairing_marked_at: null,
            saved_customer: null,
            saved_invoice: null,
            saved_allocations: [],
            save_bank_account: false,
            save_bank_account_marked_at: null,
            remove_conflicting_bank_accounts: false,
            allocations: [],
          }))
        }));
        setImportPct(90, 'Előnézet összeállítása');
        setPreviewReadOnly(false);
        setPreviewSourceStatementId(null);
        setStmPreview(preview);
        setShowPreviewModal(true);
        navigate(importPreviewUrl);
        setFiles([]);
        applyAutoAllocationToPreview(preview);
      }
      setImportPct(100, 'Kész');
    } catch (e) {
      const errorMsg = e?.response?.data?.error || 'Import hiba';
      if (String(errorMsg).includes('Már létezik ilyen bankkivonat')) {
        if (!skipExisting) {
          Modal.confirm({
            title: 'Duplikált bankkivonat',
            content: `${errorMsg} Kihagyhatom ezt a kivonatot, és folytathatom a többi importját.`,
            okText: 'Folytatom a többivel',
            cancelText: 'OK',
            centered: true,
            maskClosable: false,
            onOk: () => doImport({ skipExisting: true }),
          });
        } else {
          Modal.warning({
            title: 'Duplikált bankkivonat',
            content: errorMsg,
            okText: 'OK',
            centered: true,
            maskClosable: false,
          });
        }
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setImporting(false);
      setTimeout(() => clearImportPct(), 500);
    }
  };

  const commitZip = async () => {
    if (!selectedCompanyId) { toast.error('Válassz céget'); return; }
    if (!files.length) { toast.info('Válassz fájlokat'); return; }
    setImporting(true);
    try {
      const res = await bankStatementsAPI.importZipCommit(selectedCompanyId, files);
      const cr = res.data || {};
      toast.success(`Import kész: ${cr.created} új, kihagyva: ${(cr.skipped||[]).length}`);
      setFiles([]); setZipPreview(null); refetch();
      if ((cr.errors||[]).length) console.warn('Import hibák', cr.errors);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Import hiba');
    } finally { setImporting(false); }
  };

  const setCustomer = (hIdx, iIdx, cust) => {
    setStmPreview(prev => prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({ ...it, proposed_customer: cust, allocations: [] }))
    })));
  };
  const markPairingForSave = async (hIdx, iIdx, val, options = {}) => {
    const { persist = false } = options || {};
    let nextPreview = null;
    setStmPreview(prev => {
      nextPreview = prev.map((h, hi) => hi!==hIdx? h : ({
      ...h,
      items: h.items.map((it, ii) => ii!==iIdx? it : ({
        ...it,
        approved: !!val,
        pairing_marked_at: val ? (it.pairing_marked_at || new Date().toISOString()) : null,
        saved_pairing_marked_at: val ? new Date().toISOString() : null,
        saved_customer: val ? (it.proposed_customer || null) : null,
        saved_invoice: val ? (it.proposed_invoice || null) : null,
        saved_allocations: val ? (Array.isArray(it.allocations) ? it.allocations.map((a) => ({ ...a })) : []) : [],
        saved_suggestion_origin: val ? (it.suggestion_origin || null) : null,
      }))
    }));
      return nextPreview;
    });

    if (persist) {
      if (Array.isArray(nextPreview)) {
        const ok = await persistPreviewToDb(nextPreview, { notify: true, processBankAccountSaves: false });
        return !!ok;
      }
    }
    return true;
  };
  const persistPreviewToDb = async (previewData, { notify = false, processBankAccountSaves = true } = {}) => {
    try {
      const sourcePreview = Array.isArray(previewData) ? previewData : [];
      if (!sourcePreview.length) return false;
      const normalized = (v) => String(v || '').trim();
      const existingRows = Array.isArray(data) ? data : (data?.results || []);
      const existingStatementIdByKey = new Map(
        existingRows.map((st) => [
          `${normalized(st?.bank_account)}|${normalized(st?.statement_date)}|${normalized(st?.sequence_number)}`,
          st?.id,
        ])
      );
      const payload = sourcePreview.map(h => ({
        source_statement_id: (
          h.source_statement_id ||
          previewSourceStatementId ||
          existingStatementIdByKey.get(`${normalized(h?.account_id)}|${normalized(h?.statement_date)}|${normalized(h?.sequence_number)}`) ||
          null
        ),
        account_id: h.account_id,
        statement_date: h.statement_date,
        sequence_number: h.sequence_number,
        currency: h.currency,
        source_file_name: h.source_file_name || null,
        source_file_token: h.source_file_token || null,
        items: (h.items||[]).map(it => {
          const hasSavedPairing = !!(
            it?.saved_pairing_marked_at ||
            (Array.isArray(it?.saved_allocations) && it.saved_allocations.length) ||
            it?.saved_invoice
          );
          const effectiveApproved = !!(it.approved || hasSavedPairing);
          const persistedCustomer = it.saved_customer || it.proposed_customer || null;
          const persistedInvoice = it.saved_invoice || it.proposed_invoice || null;
          const persistedAllocations = (Array.isArray(it?.saved_allocations) && it.saved_allocations.length)
            ? it.saved_allocations
            : (Array.isArray(it?.allocations) ? it.allocations : []);
          const effectiveCustomer = effectiveApproved
            ? persistedCustomer
            : (it.save_bank_account ? persistedCustomer : persistedCustomer);
          const effectiveInvoice = effectiveApproved ? persistedInvoice : persistedInvoice;
          const effectiveAllocations = effectiveApproved ? persistedAllocations : persistedAllocations;

          return {
            approved: effectiveApproved,
            customer_id: effectiveCustomer?.id || null,
            invoice_id: effectiveInvoice?.id || effectiveInvoice?.invoice_number || null,
            invoice_type: effectiveInvoice?.type,
            amount: it.amount,
            currency: it?.currency || h?.currency || null,
            value_date: it?.value_date || null,
            booking_date: it?.booking_date || it?.value_date || null,
            remittance: it.remittance,
            comment: it.comment || it.remittance || '',
            counterparty_account: it.counterparty_account,
            counterparty_name: it.counterparty_name || '',
            proposed_customer: effectiveCustomer ? {
              id: effectiveCustomer?.id || null,
              name: effectiveCustomer?.name || '',
            } : null,
            proposed_invoice: effectiveInvoice ? {
              id: effectiveInvoice?.id || null,
              invoice_number: effectiveInvoice?.invoice_number || '',
              type: effectiveInvoice?.type || null,
              amount: amountNum(effectiveInvoice?.amount),
            } : null,
            save_bank_account: processBankAccountSaves ? !!it.save_bank_account : false,
            remove_conflicting_bank_accounts: processBankAccountSaves ? !!it.remove_conflicting_bank_accounts : false,
            allocations: Array.isArray(effectiveAllocations)
              ? effectiveAllocations.map(a => ({
                  invoice_id: a.invoice_id || a.invoice_number || null,
                  invoice_type: a.invoice_type,
                  amount: Number(a.amount || 0),
                  amount_txn: Number(a.amount_txn || 0),
                  invoice_number: a.invoice_number || null,
                  invoice_currency: a.invoice_currency || null,
                  invoice_exchange_rate: Number(a.invoice_exchange_rate || 0),
                  invoice_gross_amount: Number(a.invoice_gross_amount || 0),
                  invoice_gross_amount_huf: Number(a.invoice_gross_amount_huf || 0),
                  invoice_net_amount_huf: Number(a.invoice_net_amount_huf || 0),
                  invoice_vat_amount_huf: Number(a.invoice_vat_amount_huf || 0),
                  invoice_outstanding: Number(a.invoice_outstanding || 0)
                }))
              : [],
          };
        })
      }));

      const missingAccountHeaders = payload.filter((st) => !st.account_id);
      if (missingAccountHeaders.length > 0) {
        const first = missingAccountHeaders[0] || {};
        Modal.warning({
          title: 'Hiányzó céges bankszámla párosítás',
          content: `A bankkivonat nem menthető, mert nincs hozzárendelt céges bankszámla (${first.statement_date || '-'} / ${first.sequence_number || '-'}).`,
          okText: 'OK',
          centered: true,
          maskClosable: false,
        });
        return false;
      }

      const requestedAccountSaves = payload.reduce((sum, st) => (
        sum + (st.items || []).filter(it => !!it.save_bank_account).length
      ), 0);
      const res = await bankStatementsAPI.importStmCommit(selectedCompanyId, payload);
      const savedAccounts = Number(res?.data?.saved_accounts || 0);
      const savedUpdates = Number(res?.data?.saved_account_updates || 0);
      const savedCreates = Number(res?.data?.saved_account_creates || 0);
      if (notify && requestedAccountSaves > 0) {
        if (savedAccounts > 0) {
          toast.success(`Bankszámla mentések: ${savedAccounts} (frissítés: ${savedUpdates}, új: ${savedCreates})`);
        } else {
          toast.warning('Bankszámla mentés nem történt (0 frissítés/új). Ellenőrizd az ütközéseket vagy a partnerhez rendelt számlaszámot.');
        }
      }
      const movedAccounts = Array.isArray(res?.data?.moved_accounts) ? res.data.moved_accounts : [];
      if (notify && movedAccounts.length) {
        const first = movedAccounts[0];
        const firstText = `${first.from_customer_name || 'Ismeretlen'} → ${first.to_customer_name || 'Ismeretlen'}`;
        if (movedAccounts.length === 1) {
          toast.info(`Bankszámla áthelyezve: ${firstText}`);
        } else {
          toast.info(`Bankszámlák áthelyezve (${movedAccounts.length}): ${firstText}${movedAccounts.length > 1 ? ' …' : ''}`);
        }
      }
      if (notify && (res?.data?.skipped_conflicts || 0) > 0) {
        toast.warning(`Ütközés miatt kihagyott mentések: ${res.data.skipped_conflicts}`);
      }
      const skippedDuplicates = Array.isArray(res?.data?.skipped_duplicate_statements)
        ? res.data.skipped_duplicate_statements
        : [];
      if (notify && skippedDuplicates.length > 0) {
        const first = skippedDuplicates[0] || {};
        const firstText = `${first.statement_date || '-'} / ${first.sequence_number || '-'}`;
        if (skippedDuplicates.length === 1) {
          toast.warning(`Duplikált kivonat kihagyva: ${firstText}`);
        } else {
          toast.warning(`Duplikált kivonatok kihagyva (${skippedDuplicates.length}), pl.: ${firstText}`);
        }
      }
      refetch();
      return true;
    } catch (e) {
      const errData = e?.response?.data;
      const errMsg = errData?.error || errData?.detail || (typeof errData === 'string' ? errData : null) || e?.message || 'Mentési hiba';
      if (String(errMsg).includes('Már létezik ilyen bankkivonat')) {
        Modal.warning({
          title: 'Duplikált bankkivonat',
          content: errMsg,
          okText: 'OK',
          centered: true,
          maskClosable: false,
        });
        return false;
      }
      if (String(errMsg).includes('Ismeretlen company bank account')) {
        Modal.warning({
          title: 'Ismeretlen bankszámla',
          content: 'A kivonat olyan számlaszámhoz tartozik, ami nincs hozzárendelve a kiválasztott cég bankszámláihoz. Ellenőrizd a céget és a bankszámla párosítást.',
          okText: 'OK',
          centered: true,
          maskClosable: false,
        });
        return false;
      }
      toast.error(errMsg);
      return false;
    }
  };

  const openStatementInPreview = React.useCallback(async (statementId) => {
    try {
      setImportPct(10, 'Előnézet betöltése');
      const res = await bankStatementsAPI.getStatement(statementId, { reopen_preview: 1 });
      setImportPct(70, 'Előnézeti adatok feldolgozása');
      const statement = res?.data || {};
      const previewSnapshotItems = Array.isArray(statement?.import_preview_items) ? statement.import_preview_items : [];
      const preferImportSuggestions = sourceParam === 'uploaded' || returnToUploadedRef.current;

      const itemIdentityKey = (rawItem = {}) => {
        const amount = Number(rawItem?.amount || 0);
        const amountNorm = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
        const valueDate = String(rawItem?.value_date || rawItem?.booking_date || '').trim();
        const remittance = String(rawItem?.remittance || rawItem?.comment || '').trim().toUpperCase();
        return `${amountNorm}|${valueDate}|${remittance}`;
      };

      const snapshotByIdentity = new Map();
      previewSnapshotItems.forEach((item) => {
        const key = itemIdentityKey(item);
        if (!key) return;
        if (!snapshotByIdentity.has(key)) snapshotByIdentity.set(key, item);
      });

      const enrichItemFromSnapshot = (rawItem = {}, idx = 0) => {
        const key = itemIdentityKey(rawItem);
        const byKey = key ? snapshotByIdentity.get(key) : null;
        const byIndex = previewSnapshotItems[idx] || null;
        const fallback = byKey || byIndex || null;
        if (!fallback) return rawItem;

        const mergedProposedCustomer = (() => {
          const current = rawItem?.proposed_customer || null;
          const backup = fallback?.proposed_customer || null;
          if (preferImportSuggestions && backup) {
            return backup;
          }
          if (!current && backup) return backup;
          if (!current) return null;
          const currentId = String(current?.id || '').trim();
          const currentName = String(current?.name || '').trim();
          const backupId = String(backup?.id || '').trim();
          const backupName = String(backup?.name || '').trim();
          if (!currentId && backupId) {
            return {
              ...current,
              id: backupId,
              name: currentName || backupName,
            };
          }
          if (currentId && !currentName && backupId && currentId === backupId && backupName) {
            return {
              ...current,
              name: backupName,
            };
          }
          return current;
        })();

        // Merge proposed_invoice: prefer snapshot base for pairing decisions, but enrich with
        // customer_name from the fresh reopen proposal (which the backend now populates).
        const mergedProposedInvoice = (() => {
          const fresh = rawItem?.proposed_invoice || null;
          const snap = fallback?.proposed_invoice || null;
          const base = preferImportSuggestions ? (snap || fresh) : (fresh || snap);
          if (!base) return null;
          // Enrich base with customer_name from the fresh proposal if missing
          if (fresh && !base.customer_name && fresh.customer_name) {
            return { ...base, customer_name: fresh.customer_name };
          }
          return base;
        })();

        return {
          ...rawItem,
          counterparty_name: getStatementPartnerName(rawItem) || getStatementPartnerName(fallback) || '',
          counterparty_account: getStatementCounterpartyAccount(rawItem) || getStatementCounterpartyAccount(fallback) || '',
          proposed_customer: mergedProposedCustomer,
          proposed_invoice: mergedProposedInvoice,
          allocations: preferImportSuggestions
            ? ((Array.isArray(fallback?.allocations) && fallback.allocations.length) ? fallback.allocations : (Array.isArray(rawItem?.allocations) ? rawItem.allocations : []))
            : ((Array.isArray(rawItem?.allocations) ? rawItem.allocations : []).length ? rawItem.allocations : (Array.isArray(fallback?.allocations) ? fallback.allocations : [])),
          customer_candidates: Array.isArray(rawItem?.customer_candidates) && rawItem.customer_candidates.length
            ? (preferImportSuggestions
                ? (Array.isArray(fallback?.customer_candidates) && fallback.customer_candidates.length ? fallback.customer_candidates : rawItem.customer_candidates)
                : rawItem.customer_candidates)
            : (Array.isArray(fallback?.customer_candidates) ? fallback.customer_candidates : []),
          // Always use fresh candidates from reopen _propose_matches — these now include customer_name
          // for outgoing invoice candidates and are more up-to-date than the stored snapshot.
          candidates: Array.isArray(rawItem?.candidates) && rawItem.candidates.length
            ? rawItem.candidates
            : (Array.isArray(fallback?.candidates) ? fallback.candidates : []),
        };
      };

      const toReopenedSuggestionState = (rawItem = {}) => {
        const hadSavedPairing = !!(
          rawItem?.approved ||
          rawItem?.pairing_marked_at ||
          rawItem?.saved_pairing_marked_at ||
          (Array.isArray(rawItem?.saved_allocations) && rawItem.saved_allocations.length) ||
          (Array.isArray(rawItem?.allocations) && rawItem.allocations.length)
        );
        const preservedSavedCustomer = rawItem?.saved_customer || rawItem?.proposed_customer || null;
        const preservedSavedInvoice = rawItem?.saved_invoice || rawItem?.proposed_invoice || null;
        const preservedSavedAllocations = Array.isArray(rawItem?.saved_allocations)
          ? rawItem.saved_allocations
          : (Array.isArray(rawItem?.allocations) ? rawItem.allocations : []);

        return {
          ...rawItem,
          approved: false,
          pairing_marked_at: null,
          proposed_invoice: rawItem?.proposed_invoice || null,
          allocations: Array.isArray(rawItem?.allocations) ? rawItem.allocations : [],
          saved_pairing_marked_at: hadSavedPairing
            ? (rawItem?.saved_pairing_marked_at || rawItem?.pairing_marked_at || new Date().toISOString())
            : null,
          saved_customer: hadSavedPairing ? preservedSavedCustomer : null,
          saved_invoice: hadSavedPairing ? preservedSavedInvoice : null,
          saved_allocations: hadSavedPairing ? preservedSavedAllocations : [],
        };
      };
      if (statement?.reopen_preview && Array.isArray(statement.reopen_preview.items)) {
        const headerCurrency = statement?.reopen_preview?.currency || statement?.currency || null;
        const initialPreview = [{
          ...statement.reopen_preview,
          source_statement_id: statement.reopen_preview.source_statement_id || statementId,
          items: (statement.reopen_preview.items || []).map((it, itemIdx) => {
            const hydrated = enrichItemFromSnapshot(it, itemIdx);
            return {
            ...toReopenedSuggestionState(hydrated),
            statement_currency: it?.statement_currency || headerCurrency,
            counterparty_name: getStatementPartnerName(hydrated),
            counterparty_account: getStatementCounterpartyAccount(hydrated),
            proposed_customer: hydrated?.proposed_customer || hydrated?.saved_customer || null,
          };
          }),
        }];
        setTab('stm');
        setOnlySavedPairings(false);
        setPreviewReadOnly(false);
        setPreviewSourceStatementId(statementId);
        setStmPreview(initialPreview);
        setShowPreviewModal(true);
        applyAutoAllocationToPreview(initialPreview);
        setImportPct(100, 'Kész');
        setTimeout(() => clearImportPct(), 500);
        return;
      }
      const previewItems = Array.isArray(statement.import_preview_items) ? statement.import_preview_items : [];
      const sourceItems = previewItems.length ? previewItems : (statement.items || []).map((it) => {
        const invoiceType = it?.invoice ? 'outgoing' : (it?.incoming_invoice ? 'incoming' : null);
        const invoiceId = it?.invoice || it?.incoming_invoice || null;
        const invoiceAmount = Math.abs(amountNum(it?.amount));
        return {
          amount: amountNum(it?.amount),
          currency: statement.currency,
          value_date: statement.statement_date,
          remittance: it?.note || '',
          comment: it?.note || '',
          counterparty_account: '',
          counterparty_name: it?.customer_name || '',
          proposed_customer: it?.customer ? { id: it.customer, name: it.customer_name || '-' } : null,
          proposed_invoice: invoiceId ? { id: invoiceId, type: invoiceType, invoice_number: it?.invoice_number || '', amount: invoiceAmount } : null,
          approved: true,
          pairing_marked_at: it?.created_at || new Date().toISOString(),
          saved_pairing_marked_at: it?.created_at || new Date().toISOString(),
          saved_customer: it?.customer ? { id: it.customer, name: it.customer_name || '-' } : null,
          saved_invoice: invoiceId ? { id: invoiceId, type: invoiceType, invoice_number: it?.invoice_number || '', amount: invoiceAmount } : null,
          saved_allocations: invoiceId ? [{ invoice_id: invoiceId, invoice_type: invoiceType, invoice_number: it?.invoice_number || '', amount: invoiceAmount }] : [],
          save_bank_account: false,
          save_bank_account_marked_at: null,
          remove_conflicting_bank_accounts: false,
          allocations: invoiceId ? [{ invoice_id: invoiceId, invoice_type: invoiceType, invoice_number: it?.invoice_number || '', amount: invoiceAmount }] : [],
          candidates: [],
        };
      });

      const mapped = {
        source_statement_id: statementId,
        account_id: statement.bank_account,
        account_label: statement.bank_account_name || statement.bank_account || '-',
        statement_date: statement.statement_date,
        sequence_number: statement.sequence_number,
        currency: statement.currency,
        source_file_name: statement.source_file_name || null,
        items: sourceItems.map((it) => ({
          ...it,
          amount: amountNum(it?.amount),
          currency: it?.currency || statement.currency,
          statement_currency: statement.currency || null,
          value_date: it?.value_date || statement.statement_date,
          remittance: it?.remittance || it?.comment || '',
          comment: it?.comment || it?.remittance || '',
          counterparty_account: getStatementCounterpartyAccount(it),
          counterparty_name: getStatementPartnerName(it) || it?.proposed_customer?.name || it?.saved_customer?.name || '',
          proposed_customer: it?.proposed_customer || it?.saved_customer || null,
          proposed_invoice: it?.proposed_invoice || null,
          approved: !!it?.approved,
          pairing_marked_at: it?.pairing_marked_at || null,
          saved_pairing_marked_at: it?.saved_pairing_marked_at || it?.pairing_marked_at || null,
          saved_customer: it?.saved_customer || null,
          saved_invoice: it?.saved_invoice || null,
          saved_allocations: Array.isArray(it?.saved_allocations) ? it.saved_allocations : [],
          save_bank_account: !!it?.save_bank_account,
          save_bank_account_marked_at: it?.save_bank_account_marked_at || null,
          remove_conflicting_bank_accounts: !!it?.remove_conflicting_bank_accounts,
          allocations: Array.isArray(it?.allocations) ? it.allocations : [],
          candidates: Array.isArray(it?.candidates) ? it.candidates : [],
        })),
      };
      setTab('stm');
      setOnlySavedPairings(false);
      setPreviewReadOnly(false);
      setPreviewSourceStatementId(statementId);
      const mappedPreview = [{
        ...mapped,
        items: (mapped.items || []).map((it) => toReopenedSuggestionState(it)),
      }];
      setStmPreview(mappedPreview);
      setShowPreviewModal(true);
      applyAutoAllocationToPreview(mappedPreview);
      setImportPct(100, 'Kész');
      setTimeout(() => clearImportPct(), 500);
    } catch (e) {
      clearImportPct();
      toast.error(e?.response?.data?.error || 'A bankkivonat előnézete nem tölthető be');
    }
  }, [applyAutoAllocationToPreview, clearImportPct, getStatementCounterpartyAccount, getStatementPartnerName, setImportPct, sourceParam]);

  React.useEffect(() => {
    if (!openUploadedId) return;
    if (handledOpenRef.current === openUploadedId) return;
    handledOpenRef.current = openUploadedId;
    returnToUploadedRef.current = openUploadedSource === 'uploaded';
    openStatementInPreview(openUploadedId);
    navigate('/bank-statements/import/preview?source=uploaded', { replace: true });
  }, [openUploadedId, openUploadedSource, navigate, openStatementInPreview]);

  const openAllocationForItem = async (hIdx, iIdx, it, options = {}) => {
    const showAllInvoices = !!options?.showAllInvoices;
    const includeExternal = options?.includeExternalInvoices ?? includeExternalInvoices;
    const txnAmount = amountNum(it.amount);
    const headerCurrency = stmPreview?.[hIdx]?.currency || null;
    const txnCurrency = normalizeCurrency(it?.statement_currency || headerCurrency || it?.currency || 'HUF');
    const isIncomingTxn = txnAmount > 0;
    const custId = it?.proposed_customer?.id;
    if (!custId) {
      toast.warning('Előbb válassz partnert.');
      return;
    }
    setAllocationPct(5, 'Allokáció indítása');
    setAllocationModal({
      open: true,
      loading: true,
      hIdx,
      iIdx,
      item: { ...it, statement_currency: it?.statement_currency || headerCurrency || it?.currency || null },
      invoices: [],
      allocations: {},
      mode: isIncomingTxn ? 'outgoing' : 'incoming',
      showAllInvoices,
      includeExternalInvoices: includeExternal,
    });
    try {
      const normalizeInvoiceNo = (v) => String(v || '').trim().toUpperCase();
      const isStornoInvoiceLike = (inv) => {
        const op = String(inv?.invoiceOperation || inv?.invoice_operation || '').toUpperCase();
        const byOperation = op.includes('STORNO') || op.includes('CANCEL') || op.includes('STORN');
        const byFlags = !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno);
        return byOperation || byFlags;
      };

      const isStornoOriginalLike = (inv) => !!(inv?.isStornoOriginal || inv?.is_storno_original);

      const toSignedOutstanding = (rawValue, inv) => {
        const value = amountNum(rawValue);
        if (isStornoInvoiceLike(inv) && value > 0.0001) {
          return -Math.abs(value);
        }
        return value;
      };

      const expandAndMarkStornoPairs = (baseRows, allRows) => {
        const sourceRows = Array.isArray(allRows) ? allRows : [];
        const working = Array.isArray(baseRows) ? [...baseRows] : [];
        const byNo = new Map();
        sourceRows.forEach((row) => {
          const key = normalizeInvoiceNo(row?.invoice_number);
          if (key) byNo.set(key, row);
        });

        const stornoByOriginal = new Map();
        sourceRows.forEach((row) => {
          if (!isStornoInvoiceLike(row)) return;
          const orig = normalizeInvoiceNo(row?.original_invoice_number || row?.originalInvoiceNumber);
          const currentNo = normalizeInvoiceNo(row?.invoice_number);
          if (orig && currentNo && !stornoByOriginal.has(orig)) {
            stornoByOriginal.set(orig, currentNo);
          }
        });

        const seen = new Set(working.map((row) => normalizeInvoiceNo(row?.invoice_number)).filter(Boolean));
        const appendByNo = (invoiceNo) => {
          const key = normalizeInvoiceNo(invoiceNo);
          if (!key || seen.has(key)) return;
          const candidate = byNo.get(key);
          if (!candidate) return;
          working.push({ ...candidate });
          seen.add(key);
        };

        for (let idx = 0; idx < working.length; idx += 1) {
          const row = working[idx];
          const rowNo = normalizeInvoiceNo(row?.invoice_number);
          const origNo = normalizeInvoiceNo(row?.original_invoice_number || row?.originalInvoiceNumber);
          if (isStornoInvoiceLike(row) && origNo) appendByNo(origNo);
          if (isStornoOriginalLike(row) && rowNo) appendByNo(stornoByOriginal.get(rowNo));
          if (!isStornoInvoiceLike(row) && !isStornoOriginalLike(row) && rowNo) {
            const linkedStorno = stornoByOriginal.get(rowNo);
            if (linkedStorno) appendByNo(linkedStorno);
          }
        }

        const linkedNos = new Set();
        working.forEach((row) => {
          const rowNo = normalizeInvoiceNo(row?.invoice_number);
          const origNo = normalizeInvoiceNo(row?.original_invoice_number || row?.originalInvoiceNumber);
          if (isStornoInvoiceLike(row)) {
            if (rowNo) linkedNos.add(rowNo);
            if (origNo) linkedNos.add(origNo);
          }
          if (isStornoOriginalLike(row) && rowNo) {
            linkedNos.add(rowNo);
            const linkedStorno = stornoByOriginal.get(rowNo);
            if (linkedStorno) linkedNos.add(linkedStorno);
          }
        });

        return working.map((row) => {
          const rowNo = normalizeInvoiceNo(row?.invoice_number);
          return {
            ...row,
            is_storno_invoice: isStornoInvoiceLike(row),
            is_storno_original: isStornoOriginalLike(row),
            is_storno_linked: !!(rowNo && linkedNos.has(rowNo)),
          };
        });
      };

      let rows = [];
      let autoAllocateRows = [];
      if (isIncomingTxn) {
        const normalizeInvoiceToken = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const buildRemittanceSearchVariants = (text) => {
          const src = String(text || '').toUpperCase();
          const rawHits = [];
          const patterns = [
            /[A-Z]{1,6}[-/]?\d{4}[-/]?\d{1,8}/g,
            /[A-Z]{2,6}\d{5,14}/g,
            /\b\d{6,20}\b/g,
          ];
          patterns.forEach((re) => {
            const matches = src.match(re) || [];
            matches.forEach((m) => {
              const cleaned = String(m || '').trim();
              if (cleaned) rawHits.push(cleaned);
            });
          });

          const variants = [];
          rawHits.forEach((hit) => {
            variants.push(hit);
            const compact = normalizeInvoiceToken(hit);
            if (compact) variants.push(compact);
            const m = compact.match(/^([A-Z]{1,6})(\d{4})(\d{1,8})$/);
            if (m) {
              variants.push(`${m[1]}${m[2]}/${m[3]}`);
              variants.push(`${m[1]} ${m[2]}/${m[3]}`);
            }
          });

          return Array.from(new Set(variants.map(v => String(v || '').trim()).filter(Boolean)));
        };

        setAllocationPct(20, 'Kifizetetlen számlák lekérdezése');
        const res = await invoiceAPI.getUnpaidInvoices({ company_id: selectedCompanyId, customer_id: custId });
        rows = (res?.data?.results || []).map(inv => {
          const rawOutstanding = amountNum(inv.outstanding);
          const invoiceCurrency = String(inv?.currency || it?.currency || '').toUpperCase();
          const roundedOutstanding = invoiceCurrency === 'HUF' ? Math.round(rawOutstanding) : rawOutstanding;
          const signedOutstanding = toSignedOutstanding(roundedOutstanding, inv);
          return {
            ...inv,
            currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
            exchange_rate: amountNum(inv?.exchange_rate ?? inv?.exchangeRate),
            gross_amount: amountNum(inv?.gross_amount ?? inv?.grossAmount),
            gross_amount_huf: amountNum(inv?.gross_amount_huf ?? inv?.grossAmountHUF),
            invoice_type: 'outgoing',
            outstanding: signedOutstanding,
          };
        });

        if (includeExternal) {
          setAllocationPct(45, 'Külső kimenő számlák egyeztetése');
          try {
          let customerDetails = null;
          try {
            const customerRes = await customerAPI.getCustomer(custId);
            customerDetails = customerRes?.data || null;
          } catch {}

          const normDigits = (v) => String(v || '').replace(/\D+/g, '');
          const normText = (v) => String(v || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const customerNameNorm = normText(it?.proposed_customer?.name || customerDetails?.name || it?.counterparty_name || '');
          const customerTaxCandidates = [
            customerDetails?.tax_number,
            customerDetails?.full_tax_number,
            customerDetails?.vat_group_member_tax_number,
          ].map(normDigits).filter(Boolean);

          const fetchExternalOutgoing = async (searchVal) => {
            const extRes = await api.get('/api/invoices/incoming/', {
              params: {
                company_id: selectedCompanyId,
                page: 1,
                page_size: 1000,
                external_outgoing: 1,
                search: (searchVal || '').toString().trim() || undefined,
              }
            });
            return extRes?.data?.items || [];
          };

          const remittanceSearches = buildRemittanceSearchVariants(it?.remittance || it?.comment || '');
          const remittanceTokenSet = new Set(
            remittanceSearches
              .map((token) => normalizeInvoiceToken(token))
              .filter((token) => token.length >= 6)
          );
          let extItems = [];
          if (showAllInvoices) {
            extItems = await fetchExternalOutgoing('');
          } else {
            const searchBatch = remittanceSearches.slice(0, 5);
            for (let idx = 0; idx < searchBatch.length; idx += 1) {
              const searchVal = searchBatch[idx];
              extItems = await fetchExternalOutgoing(searchVal);
              setAllocationPct(50 + Math.round(((idx + 1) / Math.max(searchBatch.length, 1)) * 20), 'Külső számlák keresése');
              if (extItems.length) break;
            }
            if (!extItems.length) {
              extItems = await fetchExternalOutgoing((it?.proposed_customer?.name || it?.counterparty_name || '').toString().trim());
            }
            if (!extItems.length) {
              extItems = await fetchExternalOutgoing('');
            }
          }

          const externalRows = extItems
            .filter((inv) => {
              const invOutstandingRaw = amountNum(inv?.remainingAmount) || amountNum(inv?.grossAmount);
              if (Math.abs(invOutstandingRaw) <= 0.0001) return false;

              const invoiceNoNorm = normalizeInvoiceToken(inv?.invoiceNumber);
              const remittanceInvoiceMatch = remittanceTokenSet.size > 0 && Array.from(remittanceTokenSet).some((token) => (
                invoiceNoNorm && (invoiceNoNorm.includes(token) || token.includes(invoiceNoNorm))
              ));

              const partyTax = normDigits(inv?.supplierTaxNumber);
              const taxMatch = customerTaxCandidates.some((ct) =>
                partyTax && (
                  partyTax === ct ||
                  (ct.length >= 8 && partyTax.length >= 8 && partyTax.slice(0, 8) === ct.slice(0, 8))
                )
              );

              const partyNameNorm = normText(inv?.supplierName);
              const nameMatch = customerNameNorm && partyNameNorm && (
                partyNameNorm.includes(customerNameNorm) ||
                customerNameNorm.includes(partyNameNorm)
              );

              if (showAllInvoices) {
                const paymentMethod = String(inv?.paymentMethod || '').toUpperCase();
                return paymentMethod === 'TRANSFER' && (taxMatch || nameMatch);
              }

              return taxMatch || nameMatch || remittanceInvoiceMatch;
            })
            .map((inv) => {
              const rawOutstanding = amountNum(inv?.remainingAmount) || amountNum(inv?.grossAmount);
              const invoiceCurrency = String(inv?.currency || it?.currency || '').toUpperCase();
              const roundedOutstanding = invoiceCurrency === 'HUF' ? Math.round(rawOutstanding) : rawOutstanding;
              const signedOutstanding = toSignedOutstanding(roundedOutstanding, inv);
              return {
                id: inv?.id || inv?.invoiceNumber,
                invoice_number: inv?.invoiceNumber,
                currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
                exchange_rate: amountNum(inv?.exchangeRate || inv?.exchange_rate),
                gross_amount: amountNum(inv?.grossAmount || inv?.gross_amount),
                gross_amount_huf: amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf),
                invoice_operation: inv?.invoiceOperation || inv?.invoice_operation || null,
                original_invoice_number: inv?.originalInvoiceNumber || inv?.original_invoice_number || null,
                is_storno_invoice: !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno),
                is_storno_original: !!(inv?.isStornoOriginal || inv?.is_storno_original),
                due_date: inv?.dueDate,
                supplier_name: inv?.supplierName,
                supplier_tax_number: inv?.supplierTaxNumber,
                outstanding: signedOutstanding,
                invoice_type: 'incoming',
                source: 'external_outgoing',
              };
            });

          if (externalRows.length) {
            const existingNumbers = new Set(rows.map((r) => String(r?.invoice_number || '').trim()));
            const dedupedExternal = externalRows.filter((r) => !existingNumbers.has(String(r?.invoice_number || '').trim()));
            rows = [...rows, ...dedupedExternal];
          }

          rows = expandAndMarkStornoPairs(rows, rows);

          const parseDateVal = (row) => {
            const d = row?.due_date || row?.issue_date || row?.invoice_issue_date || '';
            const ts = Date.parse(d);
            return Number.isFinite(ts) ? ts : -Infinity;
          };
          const sortInvoiceRows = (a, b) => {
            const ad = parseDateVal(a);
            const bd = parseDateVal(b);
            if (ad !== bd) return bd - ad;
            return String(b?.invoice_number || '').localeCompare(String(a?.invoice_number || ''), 'hu-HU', { numeric: true, sensitivity: 'base' });
          };

          const externalFirst = rows.filter(r => r?.source === 'external_outgoing').sort(sortInvoiceRows);
          const regularAfter = rows.filter(r => r?.source !== 'external_outgoing').sort(sortInvoiceRows);
          rows = [...externalFirst, ...regularAfter];
          } catch {}
        }

        // Inject implied exchange rate for foreign-currency invoices when txnCurrency is HUF
        if (normalizeCurrency(txnCurrency) === 'HUF') {
          const txnHufBudget = Math.abs(amountNum(it.amount));
          if (txnHufBudget > 0.01) {
            const foreignWithoutRate = rows.filter(inv => {
              const invCur = normalizeCurrency(inv?.currency || 'HUF');
              return invCur !== 'HUF' && !(inv?.exchange_rate > 0.01) && !(inv?.gross_amount_huf > 0.01);
            });
            if (foreignWithoutRate.length > 0) {
              const totalForeignOutstanding = foreignWithoutRate.reduce(
                (sum, inv) => sum + Math.abs(amountNum(inv.outstanding)), 0
              );
              if (totalForeignOutstanding > 0.0001) {
                const impliedRate = Math.round((txnHufBudget / totalForeignOutstanding) * 100) / 100;
                if (impliedRate > 50 && impliedRate < 1500) {
                  rows = rows.map(inv => {
                    const invCur = normalizeCurrency(inv?.currency || 'HUF');
                    if (invCur !== 'HUF' && !(inv?.exchange_rate > 0.01) && !(inv?.gross_amount_huf > 0.01)) {
                      return { ...inv, exchange_rate: impliedRate, _impliedRate: true };
                    }
                    return inv;
                  });
                }
              }
            }
          }
        }

        if (showAllInvoices) {
          setAllocationPct(72, 'Bejövő számlák hozzáadása');
          try {
            const normDigits = (v) => String(v || '').replace(/\D+/g, '');
            const normText = (v) => String(v || '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            let customerDetails = null;
            try {
              const customerRes = await customerAPI.getCustomer(custId);
              customerDetails = customerRes?.data || null;
            } catch {}

            const customerName = normText(it?.proposed_customer?.name || customerDetails?.name || it?.counterparty_name || '');
            const customerTaxCandidates = [
              customerDetails?.tax_number,
              customerDetails?.full_tax_number,
              customerDetails?.vat_group_member_tax_number,
            ].map(normDigits).filter(Boolean);

            const incomingRes = await api.get('/api/invoices/incoming/', {
              params: {
                company_id: selectedCompanyId,
                page: 1,
                page_size: 1000,
              }
            });
            const incomingItems = incomingRes?.data?.items || [];

            const incomingRows = incomingItems
              .filter((inv) => {
                const supplierTaxCandidates = [
                  inv?.supplierTaxNumber,
                  inv?.supplierFullTaxNumber,
                  inv?.supplierVatGroupMemberTaxNumber,
                ].map(normDigits).filter(Boolean);
                const supplierName = normText(inv?.supplierName);
                const taxMatch = customerTaxCandidates.some((ct) =>
                  supplierTaxCandidates.some((st) =>
                    st === ct ||
                    (ct.length >= 8 && st.length >= 8 && st.slice(0, 8) === ct.slice(0, 8))
                  )
                );
                const nameMatch = customerName && supplierName && (
                  supplierName.includes(customerName) ||
                  customerName.includes(supplierName)
                );
                const paymentMethod = String(inv?.paymentMethod || '').toUpperCase();
                const isTransferPayment = paymentMethod === 'TRANSFER';

                const gross = Math.abs(amountNum(inv?.grossAmount));
                const paidByBank = Math.abs(amountNum(inv?.bankPaidAmount));
                const bankRemaining = gross > 0.0001 ? Math.max(gross - paidByBank, 0) : gross;
                const unpaidOrPartialByBank = gross <= 0.0001 || bankRemaining > 0.005;

                return (taxMatch || nameMatch) && isTransferPayment && unpaidOrPartialByBank;
              })
              .map((inv) => {
                const grossSigned = amountNum(inv?.grossAmount);
                const paidByBankAbs = Math.abs(amountNum(inv?.bankPaidAmount));
                const grossAbs = Math.abs(grossSigned);
                const bankRemainingAbs = grossAbs > 0.0001 ? Math.max(grossAbs - paidByBankAbs, 0) : grossAbs;
                const signedOutstandingBase = grossSigned >= 0 ? bankRemainingAbs : -bankRemainingAbs;
                const signedOutstanding = toSignedOutstanding(signedOutstandingBase, inv);
                return {
                  id: `incoming-${inv?.id || inv?.invoiceNumber}`,
                  invoice_number: inv?.invoiceNumber,
                  currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
                  exchange_rate: amountNum(inv?.exchangeRate || inv?.exchange_rate),
                  gross_amount: amountNum(inv?.grossAmount || inv?.gross_amount),
                  gross_amount_huf: amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf),
                  invoice_operation: inv?.invoiceOperation || inv?.invoice_operation || null,
                  original_invoice_number: inv?.originalInvoiceNumber || inv?.original_invoice_number || null,
                  is_storno_invoice: !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno),
                  is_storno_original: !!(inv?.isStornoOriginal || inv?.is_storno_original),
                  due_date: inv?.dueDate,
                  supplier_name: inv?.supplierName,
                  supplier_tax_number: inv?.supplierTaxNumber,
                  outstanding: signedOutstanding,
                  invoice_type: 'incoming',
                  source: 'incoming_mixed',
                };
              })
              .filter((inv) => Math.abs(amountNum(inv?.outstanding)) > 0.0001);

            if (incomingRows.length) {
              rows = [...rows, ...incomingRows];
              autoAllocateRows = [...autoAllocateRows, ...incomingRows];
            }
          } catch {}
        }

        autoAllocateRows = rows;
      } else {
        setAllocationPct(20, 'Bejövő számlák előkészítése');
        const normDigits = (v) => String(v || '').replace(/\D+/g, '');
        const normText = (v) => String(v || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const normalizeInvoiceToken = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const parseDateVal = (v) => {
          const ts = Date.parse(v || '');
          return Number.isFinite(ts) ? ts : -Infinity;
        };
        const extractRemittanceTokens = (text) => {
          const src = String(text || '').toUpperCase();
          const found = [];
          const patterns = [
            /[A-Z]{1,6}[-/]?\d{2,8}[-/]?\d{1,8}/g,
            /\d{4}[-/]\d{1,8}/g,
            /[A-Z]{2,6}\d{4,12}/g,
            /\b\d{6,20}\b/g,
          ];
          patterns.forEach((re) => {
            const matches = src.match(re) || [];
            matches.forEach((m) => {
              const token = normalizeInvoiceToken(m);
              if (token && token.length >= 6) found.push(token);
            });
          });
          return Array.from(new Set(found));
        };
        let customerDetails = null;
        try {
          const customerRes = await customerAPI.getCustomer(custId);
          customerDetails = customerRes?.data || null;
        } catch {}

        const customerName = normText(it?.proposed_customer?.name || customerDetails?.name || it?.counterparty_name || '');
        const ignoredNameTokens = new Set([
          'magyar', 'nyrt', 'kft', 'zrt', 'bt', 'rt', 'es', 'és', 'nyrt', 'nyilvanosan', 'mukodo', 'reszvenytarsasag'
        ]);
        const customerNameTokens = new Set(
          customerName
            .split(' ')
            .filter(t => t.length >= 3 && !ignoredNameTokens.has(t))
        );
        const customerTaxCandidates = [
          customerDetails?.tax_number,
          customerDetails?.full_tax_number,
          customerDetails?.vat_group_member_tax_number,
        ].map(normDigits).filter(Boolean);
        const remittanceTokens = extractRemittanceTokens(it?.remittance || it?.comment || '');
        const remittanceShortSuffixTokens = Array.from(new Set(
          (String(it?.remittance || it?.comment || '').toUpperCase().match(/\b\d{3,6}\b/g) || [])
            .map((m) => String(m || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, ''))
            .filter((tok) => tok.length >= 3)
        ));
        const isRemittanceInvoiceMatch = (invoiceNoNorm = '') => {
          const invoiceToken = String(invoiceNoNorm || '');
          if (!invoiceToken) return false;
          if (remittanceTokens.some((tok) => invoiceToken.includes(tok) || tok.includes(invoiceToken))) return true;
          const invoiceDigits = invoiceToken.replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
          if (!invoiceDigits) return false;
          return remittanceShortSuffixTokens.some((tok) => invoiceDigits.endsWith(tok));
        };
        const txnAbs = Math.abs(txnAmount);

        const fetchIncoming = async (searchVal, { fetchAll = false } = {}) => {
          const pageSize = 1000;
          let page = 1;
          let guard = 0;
          const out = [];

          while (guard < 30) {
            guard += 1;
            const res = await api.get('/api/invoices/incoming/', {
              params: {
                company_id: selectedCompanyId,
                page,
                page_size: pageSize,
                search: (searchVal || '').trim() || undefined,
              }
            });
            const data = res?.data || {};
            const chunk = Array.isArray(data?.items) ? data.items : [];
            out.push(...chunk);

            if (!fetchAll) break;
            const hasMore = !!data?.hasMore;
            const pageCount = Number(data?.pageCount || 0);
            const hasMoreByCount = Number.isFinite(pageCount) && pageCount > 0 ? page < pageCount : false;
            if (!hasMore && !hasMoreByCount) break;
            page += 1;
          }

          return out;
        };

        let items = [];
        if (showAllInvoices) {
          items = await fetchIncoming('', { fetchAll: true });
        } else {
          items = await fetchIncoming(customerName);
          setAllocationPct(45, 'Bejövő számlák szűrése');
          if (!items.length) {
            items = await fetchIncoming((it?.counterparty_name || '').toString().trim().slice(0, 120));
          }
          if (!items.length) {
            items = await fetchIncoming('');
          }
        }

        if (normalizeCurrency(txnCurrency) === 'HUF' && items.length > 0) {
          const statementDate = String(it?.value_date || stmPreview?.[hIdx]?.statement_date || '').slice(0, 10) || undefined;
          const hasHufAmount = (inv) => {
            const grossHuf = amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf);
            const netHuf = amountNum(inv?.netAmountHUF || inv?.net_amount_huf);
            const vatHuf = amountNum(inv?.vatAmountHUF || inv?.vat_amount_huf);
            return grossHuf > 0.0001 || (netHuf + vatHuf) > 0.0001;
          };

          const currenciesToFetch = Array.from(new Set(
            items
              .map((inv) => normalizeCurrency(inv?.currency || 'HUF'))
              .filter((cur) => cur !== 'HUF')
              .filter((cur) => items.some((inv) => {
                const invCur = normalizeCurrency(inv?.currency || 'HUF');
                const existingRate = amountNum(inv?.exchangeRate || inv?.exchange_rate);
                return invCur === cur && !hasHufAmount(inv) && existingRate <= 0.0001;
              }))
          ));

          if (currenciesToFetch.length > 0) {
            setAllocationPct(50, 'Árfolyamok betöltése');
            const rateMap = {};
            await Promise.allSettled(
              currenciesToFetch.map(async (cur) => {
                const res = await utilsAPI.getExchangeRate(cur, statementDate);
                const rate = amountNum(res?.data?.rate);
                if (rate > 0.0001) {
                  rateMap[cur] = rate;
                }
              })
            );
            items = items.map((inv) => {
              const invCur = normalizeCurrency(inv?.currency || 'HUF');
              const existingRate = amountNum(inv?.exchangeRate || inv?.exchange_rate);
              if (invCur === 'HUF' || hasHufAmount(inv) || existingRate > 0.0001) return inv;
              const fallbackRate = rateMap[invCur];
              if (fallbackRate > 0.0001) {
                return { ...inv, exchangeRate: fallbackRate, _statementRateFallback: true };
              }
              return inv;
            });
          }
        }

        rows = items.filter((inv) => {
          const supplierTaxCandidates = [
            inv?.supplierTaxNumber,
            inv?.supplierFullTaxNumber,
            inv?.supplierVatGroupMemberTaxNumber,
          ].map(normDigits).filter(Boolean);
          const supplierName = normText(inv?.supplierName);
          const supplierNameTokens = new Set(
            supplierName
              .split(' ')
              .filter(t => t.length >= 3 && !ignoredNameTokens.has(t))
          );
          const hasCustomerTax = customerTaxCandidates.length > 0;
          const hasSupplierTax = supplierTaxCandidates.length > 0;
          const taxMatch = customerTaxCandidates.some((ct) =>
            supplierTaxCandidates.some((st) =>
              st === ct ||
              (ct.length >= 8 && st.length >= 8 && (st.slice(0, 8) === ct.slice(0, 8)))
            )
          );
          const overlapCount = Array.from(customerNameTokens).reduce((sum, tok) => sum + (supplierNameTokens.has(tok) ? 1 : 0), 0);
          const nameMatch = customerName && supplierName && (
            supplierName.includes(customerName) ||
            customerName.includes(supplierName) ||
            overlapCount >= 2 ||
            Array.from(customerNameTokens).some((tok) => tok.length >= 7 && supplierNameTokens.has(tok))
          );
          const partnerMatch = (hasCustomerTax && hasSupplierTax)
            ? taxMatch
            : (taxMatch || nameMatch);

          const gross = Math.abs(amountNum(inv?.grossAmount));
          const paidByBank = Math.abs(amountNum(inv?.bankPaidAmount));
          const invoiceNoNorm = normalizeInvoiceToken(inv?.invoiceNumber);
          const remittanceInvoiceMatch = isRemittanceInvoiceMatch(invoiceNoNorm);

          if (showAllInvoices) {
            return partnerMatch || remittanceInvoiceMatch;
          }

          const paymentMethod = String(inv?.paymentMethod || '').toUpperCase();
          const isTransferPayment = paymentMethod === 'TRANSFER';
          const bankRemaining = gross > 0.0001 ? Math.max(gross - paidByBank, 0) : gross;
          const unpaidOrPartialByBank = gross <= 0.0001 || bankRemaining > 0.005;

          return (partnerMatch || remittanceInvoiceMatch) && unpaidOrPartialByBank;
        }).map(inv => {
          const grossSigned = amountNum(inv.grossAmount);
          const paidByBankAbs = Math.abs(amountNum(inv.bankPaidAmount));
          const grossAbs = Math.abs(grossSigned);
          const bankRemainingAbs = grossAbs > 0.0001 ? Math.max(grossAbs - paidByBankAbs, 0) : grossAbs;
          const signedOutstandingBase = grossSigned >= 0 ? bankRemainingAbs : -bankRemainingAbs;
          const signedOutstanding = toSignedOutstanding(signedOutstandingBase, inv);
          return {
          _raw_invoice: inv,
          _invoice_no_norm: normalizeInvoiceToken(inv.invoiceNumber),
          id: inv.invoiceNumber,
          invoice_number: inv.invoiceNumber,
          currency: normalizeCurrency(inv?.currency || it?.currency || 'HUF'),
          exchange_rate: amountNum(inv?.exchangeRate || inv?.exchange_rate),
          gross_amount: amountNum(inv?.grossAmount || inv?.gross_amount),
          gross_amount_huf: amountNum(inv?.grossAmountHUF || inv?.gross_amount_huf),
          invoice_operation: inv?.invoiceOperation || inv?.invoice_operation || null,
          original_invoice_number: inv?.originalInvoiceNumber || inv?.original_invoice_number || null,
          is_storno_invoice: !!(inv?.isStornoInvoice || inv?.is_storno_invoice || inv?.isStorno || inv?.is_storno),
          is_storno_original: !!(inv?.isStornoOriginal || inv?.is_storno_original),
          due_date: inv.dueDate,
          supplier_name: inv.supplierName,
          supplier_tax_number: inv.supplierTaxNumber,
          outstanding: signedOutstanding,
          invoice_type: 'incoming',
        };
        }).filter(inv => Math.abs(amountNum(inv.outstanding)) > 0.0001);

        if (!showAllInvoices && remittanceTokens.length > 0) {
          const tokenOnly = rows.filter((inv) => isRemittanceInvoiceMatch(String(inv?._invoice_no_norm || '')));
          if (tokenOnly.length > 0) {
            rows = tokenOnly;
          }
        }

        rows = rows
          .map((inv) => {
            const tokenPriority = remittanceTokens.reduce((bestIdx, tok, idx) => {
              const no = inv._invoice_no_norm || '';
              if (!no) return bestIdx;
              if (no.includes(tok) || tok.includes(no)) {
                return Math.min(bestIdx, idx);
              }
              return bestIdx;
            }, Number.POSITIVE_INFINITY);
            const remittanceMatched = Number.isFinite(tokenPriority) || isRemittanceInvoiceMatch(inv._invoice_no_norm || '');
            const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrency));
            const amountDiff = Math.abs(outstandingTxn - txnAbs);
            const dateVal = parseDateVal(inv.due_date);
            return {
              ...inv,
              _remittanceMatched: remittanceMatched,
              _tokenPriority: tokenPriority,
              _outstandingTxn: outstandingTxn,
              _amountDiff: amountDiff,
              _dateVal: dateVal,
              match_reason: remittanceMatched ? 'remittance' : 'amount',
            };
          })
          .map((inv) => ({ ...inv, _source_invoice: inv }))
          .sort((a, b) => {
            if (a._remittanceMatched !== b._remittanceMatched) return a._remittanceMatched ? -1 : 1;
            if (a._tokenPriority !== b._tokenPriority) return a._tokenPriority - b._tokenPriority;
            if (Math.abs(a._amountDiff - b._amountDiff) > 0.0001) return a._amountDiff - b._amountDiff;
            return b._dateVal - a._dateVal;
          });

        rows = expandAndMarkStornoPairs(rows, rows);

        // Inject implied exchange rate for foreign-currency invoices when txnCurrency is HUF
        // and the DB has no exchange_rate or HUF amounts stored (avoids 1:1 fallback)
        if (normalizeCurrency(txnCurrency) === 'HUF') {
          const txnHufBudget = Math.abs(amountNum(it.amount));
          if (txnHufBudget > 0.01) {
            const foreignWithoutRate = rows.filter(inv => {
              const invCur = normalizeCurrency(inv?.currency || 'HUF');
              return invCur !== 'HUF' && !(inv?.exchange_rate > 0.01) && !(inv?.gross_amount_huf > 0.01);
            });
            if (foreignWithoutRate.length > 0) {
              const totalForeignOutstanding = foreignWithoutRate.reduce(
                (sum, inv) => sum + Math.abs(amountNum(inv.outstanding)), 0
              );
              if (totalForeignOutstanding > 0.0001) {
                const impliedRate = Math.round((txnHufBudget / totalForeignOutstanding) * 100) / 100;
                // Only apply if the implied rate is in a plausible range (50–1500 HUF per foreign unit)
                if (impliedRate > 50 && impliedRate < 1500) {
                  rows = rows.map(inv => {
                    const invCur = normalizeCurrency(inv?.currency || 'HUF');
                    if (invCur !== 'HUF' && !(inv?.exchange_rate > 0.01) && !(inv?.gross_amount_huf > 0.01)) {
                      return { ...inv, exchange_rate: impliedRate, _impliedRate: true };
                    }
                    return inv;
                  });
                }
              }
            }
          }
        }

        autoAllocateRows = rows;
        rows = [...rows].sort((a, b) => {
          const av = Number.isFinite(a._dateVal) ? a._dateVal : -Infinity;
          const bv = Number.isFinite(b._dateVal) ? b._dateVal : -Infinity;
          return bv - av;
        }).map(({ _invoice_no_norm, _remittanceMatched, _tokenPriority, _outstandingTxn, _amountDiff, _dateVal, _source_invoice, ...inv }) => inv);
      }
      const enforceStornoOutstandingSign = (invoiceRows) => {
        return (Array.isArray(invoiceRows) ? invoiceRows : []).map((inv) => {
          const outstanding = amountNum(inv?.outstanding);
          const isStorno = !!(inv?.is_storno_invoice || isStornoInvoiceLike(inv));
          if (isStorno && outstanding > 0.0001) {
            return { ...inv, outstanding: -Math.abs(outstanding) };
          }
          return inv;
        });
      };

      rows = enforceStornoOutstandingSign(rows);
      autoAllocateRows = enforceStornoOutstandingSign(autoAllocateRows);

      const ensureProposedCandidate = (sourceRows) => {
        const nextRows = Array.isArray(sourceRows) ? [...sourceRows] : [];
        const proposed = it?.proposed_invoice || null;
        const proposedNo = String(proposed?.invoice_number || '').trim();
        if (!proposed) return nextRows;

        const exists = nextRows.some((row) => {
          const rowNo = String(row?.invoice_number || '').trim();
          const rowId = String(row?.id || '').trim();
          const pId = String(proposed?.id || '').trim();
          return (proposedNo && rowNo === proposedNo) || (pId && rowId === pId);
        });
        if (exists) return nextRows;

        const proposedAmount = Math.abs(amountNum(proposed?.amount));
        const allocationMatch = (it?.allocations || []).find((a) => {
          const allocNo = String(a?.invoice_number || '').trim();
          const allocId = String(a?.invoice_id || '').trim();
          const proposedId = String(proposed?.id || '').trim();
          return (proposedNo && allocNo === proposedNo) || (proposedId && allocId === proposedId);
        });
        const allocationOutstanding = Math.abs(amountNum(
          allocationMatch?.invoice_outstanding ?? allocationMatch?.outstanding
        ));
        const fallbackAmount = proposedAmount > 0
          ? proposedAmount
          : (allocationOutstanding > 0 ? allocationOutstanding : Math.abs(amountNum(it?.amount)));
        const proposedSigned = amountNum(proposed?.amount);
        const fallbackSigned = Math.abs(proposedSigned) > 0.0001 ? proposedSigned : fallbackAmount;
        if (Math.abs(fallbackSigned) <= 0.0001) {
          return nextRows;
        }
        const fallbackRow = {
          id: proposed?.id || proposedNo || `suggested-${hIdx}-${iIdx}`,
          invoice_number: proposedNo || proposed?.id || '',
          due_date: proposed?.due_date || null,
          supplier_name: proposed?.supplier_name || '',
          supplier_tax_number: proposed?.supplier_tax_number || '',
          outstanding: fallbackSigned,
          invoice_type: proposed?.type || (isIncomingTxn ? 'outgoing' : 'incoming'),
          source: 'suggested',
        };
        return [fallbackRow, ...nextRows];
      };

      rows = ensureProposedCandidate(rows);
      autoAllocateRows = ensureProposedCandidate(autoAllocateRows.length ? autoAllocateRows : rows);

      // Deduplicate by invoice_number — ugyanaz a számla ne jelenjen meg többször
      const deduplicateByInvoiceNo = (arr) => {
        const seen = new Set();
        return arr.filter(inv => {
          const key = `${String(inv?.invoice_type || '').trim().toLowerCase()}::${String(inv?.invoice_number || inv?.id || '').trim().toUpperCase()}`;
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      rows = deduplicateByInvoiceNo(rows);
      autoAllocateRows = deduplicateByInvoiceNo(autoAllocateRows);
      rows = rows.filter((inv) => Math.abs(amountNum(inv?.outstanding)) > 0.0001);
      autoAllocateRows = autoAllocateRows.filter((inv) => Math.abs(amountNum(inv?.outstanding)) > 0.0001);

      let remaining = Math.abs(amountNum(it.amount));
      setAllocationPct(85, 'Automatikus allokáció számítása');
      const init = {};
      (autoAllocateRows.length ? autoAllocateRows : rows).forEach((inv) => {
        const outstanding = amountNum(inv.outstanding);
        const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, txnCurrency));
        let alloc = 0;
        if (outstanding < -0.0001) {
          alloc = outstanding;
        } else {
          const allocTxn = Math.min(Math.max(0, outstandingTxn), Math.max(0, remaining));
          const outAbs = Math.abs(outstanding);
          alloc = (outAbs > 0 && outstandingTxn > 0)
            ? Math.min(Math.max(0, outAbs), (allocTxn * outAbs) / outstandingTxn)
            : 0;
        }
        if (Math.abs(alloc) > 0.0001) {
          init[inv.id] = alloc;
          remaining -= getInvoiceAllocationInTxn(inv, alloc, txnCurrency);
        }
      });
      setAllocationPct(100, 'Kész');
      setAllocationModal(prev => ({ ...prev, loading: false, invoices: rows, allocations: init, showAllInvoices }));
    } catch (e) {
      setAllocationModal(prev => ({ ...prev, loading: false }));
      toast.error('Kifizetetlen számlák betöltése sikertelen');
    } finally {
      setTimeout(() => setAllocationProgress({ percent: 0, label: '' }), 300);
    }
  };

  const applyAllocationModal = async () => {
    const { hIdx, iIdx, invoices, allocations, mode } = allocationModal;
    // Build selectedAllocs in the same order as the invoice list (modal row order)
    const allocMap = allocations || {};
    const selectedAllocs = (invoices || [])
      .filter(inv => Math.abs(amountNum(allocMap[inv.id])) > 0.0001)
      .map(inv => {
        const invoiceType = inv?.invoice_type || (mode === 'incoming' ? 'incoming' : 'outgoing');
        return {
          invoice_id: inv.id,
          amount: amountNum(allocMap[inv.id]),
          amount_txn: amountNum(getInvoiceAllocationInTxn(inv, amountNum(allocMap[inv.id]), allocationTxnCurrency)),
          invoice_type: invoiceType,
          invoice_number: inv?.invoice_number || '',
          invoice_currency: normalizeCurrency(inv?.currency || ''),
          invoice_exchange_rate: amountNum(inv?.exchange_rate),
          invoice_gross_amount: amountNum(inv?.gross_amount),
          invoice_gross_amount_huf: amountNum(inv?.gross_amount_huf),
          invoice_net_amount_huf: amountNum(inv?.net_amount_huf),
          invoice_vat_amount_huf: amountNum(inv?.vat_amount_huf),
          invoice_outstanding: amountNum(inv?.outstanding),
        };
      });
    const firstInvoice = selectedAllocs[0] && invoices.find(i => String(i.id) === String(selectedAllocs[0].invoice_id));

    const nextPreview = (stmPreview || []).map((h, hi) => hi!==hIdx ? h : ({
      ...h,
      items: (h.items || []).map((it, ii) => ii!==iIdx ? it : ({
        ...it,
        allocations: selectedAllocs,
        proposed_invoice: firstInvoice ? {
          id: firstInvoice.id,
          invoice_number: firstInvoice.invoice_number,
          amount: firstInvoice.outstanding,
          type: firstInvoice.invoice_type || (mode === 'incoming' ? 'incoming' : 'outgoing'),
        } : null,
        suggestion_origin: 'manual',
        approved: true,
        pairing_marked_at: it?.pairing_marked_at || new Date().toISOString(),
        saved_pairing_marked_at: new Date().toISOString(),
        saved_customer: it?.proposed_customer || null,
        saved_invoice: firstInvoice ? {
          id: firstInvoice.id,
          invoice_number: firstInvoice.invoice_number,
          amount: firstInvoice.outstanding,
          type: firstInvoice.invoice_type || (mode === 'incoming' ? 'incoming' : 'outgoing'),
        } : null,
        saved_suggestion_origin: 'manual',
        saved_allocations: selectedAllocs,
      }))
    }));
    const ok = await persistPreviewToDb(nextPreview, { notify: true });
    if (!ok) return;
    setStmPreview(nextPreview);
    setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} });
  };

  const startEdit = (st) => { setEditId(st.id); setEditValue(st.sequence_number); };
  const cancelEdit = () => { setEditId(null); setEditValue(''); };
  const saveEdit = async (id) => {
    await bankStatementsAPI.updateStatement(id, { sequence_number: editValue });
    cancelEdit();
    refetch();
  };
  const deleteRow = async (id) => {
    if (!window.confirm('Biztosan törlöd a bankkivonatot?')) return;
    await bankStatementsAPI.deleteStatement(id);
    refetch();
  };
  const openStatementEditor = React.useCallback((statementId) => {
    if (!statementId) return;
    navigate(`/bank-statements/${statementId}/edit`);
  }, [navigate]);

  const openStatementInUploadedPreview = React.useCallback((statementId) => {
    if (!statementId) return;
    navigate(`/bank-statements/import/preview?openUploaded=${encodeURIComponent(String(statementId))}&source=uploaded`);
  }, [navigate]);

  const filteredList = React.useMemo(() => {
    const list = Array.isArray(data) ? data : (data?.results || []);
    const normStr = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const inRange = (dateVal) => {
      const val = String(dateVal || '').slice(0, 10);
      if (!val) return false;
      if (fromDate && val < fromDate) return false;
      if (toDate && val > toDate) return false;
      return true;
    };
    const isZeroTotal = (statement) => {
      const raw = statement?.total_amount;
      if (raw === null || raw === undefined || raw === '') return false;
      return Math.abs(amountNum(raw)) <= 0.0001;
    };
    return list.filter((st) => {
      if (!inRange(st?.statement_date)) return false;
      if (hideZeroAmounts && isZeroTotal(st)) return false;
      if (listSearchTerm.trim()) {
        const terms = normStr(listSearchTerm).split(/\s+/).filter(Boolean);
        const hay = normStr([
          st?.sequence_number,
          st?.bank_account,
          st?.bank_account_name,
          st?.currency,
          st?.note,
          st?.statement_date,
          // Search inside items: remittance, counterparty_name, amount
          ...(Array.isArray(st?.import_preview_items)
            ? st.import_preview_items.flatMap(it => [it?.remittance, it?.comment, it?.counterparty_name, it?.amount])
            : []
          ),
        ].join(' '));
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [data, fromDate, toDate, hideZeroAmounts, listSearchTerm]);

  React.useEffect(() => {
    setListPage(1);
  }, [fromDate, toDate, hideZeroAmounts, selectedCompanyId, listSearchTerm]);

  const pagedFilteredList = React.useMemo(() => {
    const startIdx = Math.max(0, (listPage - 1) * listPageSize);
    return filteredList.slice(startIdx, startIdx + listPageSize);
  }, [filteredList, listPage, listPageSize]);

  React.useEffect(() => {
    const maxPage = Math.max(1, Math.ceil((filteredList.length || 0) / listPageSize));
    if (listPage > maxPage) {
      setListPage(maxPage);
    }
  }, [filteredList.length, listPage, listPageSize]);

  const formatSignedAmount = (rawValue, currency = 'HUF') => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return '';
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return '';
    const sign = num > 0 ? '+' : '';
    return `${currency || ''} ${sign}${num.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}`.trim();
  };

  if (isImportMode) {
    return (
      <Container>
        {!isImportPreviewPage && (
          <Header>
            <Title>Új bankkivonat - Import</Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={includeExternalInvoices}
                  onChange={(e) => setIncludeExternalInvoices(e.target.checked)}
                />
                Külső számlák is
              </label>
              <ActionButton to={importBackTarget}>{importBackLabel}</ActionButton>
            </div>
          </Header>
        )}
        {!isImportPreviewPage && (
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 8, color:'#7f8c8d' }}>Tölts fel ZIP archívumot vagy ISO20022 XML (camt.053) kivonatot.</div>
          <DropArea
            onDragOver={(e)=>{e.preventDefault();}}
            onDrop={onDrop}
            onClick={openImportFilePicker}
            style={{ cursor: 'pointer', borderColor: '#3498db', background: '#f0f8ff' }}
          >
            Húzd ide a fájlokat (ZIP, XML), vagy klikkelj a kiválasztáshoz.
          </DropArea>
          <input
            type="file"
            ref={fileInputRef}
            accept=".zip,.xml,.stm"
            multiple
            onChange={onPick}
            style={{ display: 'none' }}
          />
          {files.length>0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Kiválasztott fájlok:</div>
              {files.map((f, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 8px', border:'1px solid #eee', borderRadius:4, marginBottom:6 }}>
                  <div>{f.name}</div>
                  <button type="button" onClick={()=>removeFile(i)} style={{ border:'none', background:'transparent', color:'#e74c3c', cursor:'pointer' }}>Eltávolítás</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 12 }}>
            <ActionButton to={importBackTarget}>Vissza</ActionButton>
            <ImportButton
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void doImport();
              }}
              disabled={importing}
            >
              {importing ? 'Feldolgozás…' : 'Előnézet'}
            </ImportButton>
          </div>
          {importProgress.active && (
            <ProgressWrap>
              <ProgressTop>
                <span>{importProgress.label || 'Feldolgozás'}</span>
                <strong>{importProgress.percent}%</strong>
              </ProgressTop>
              <ProgressBarOuter>
                <ProgressBarInner $percent={importProgress.percent} $slow={importProgress._slow} />
              </ProgressBarOuter>
            </ProgressWrap>
          )}
        </div>
        )}

        {isImportPreviewPage && (
          <div style={{ padding: 16 }}>
            {importProgress.active && (
              <ProgressWrap>
                <ProgressTop>
                  <span>{importProgress.label || 'Előnézet betöltése'}</span>
                  <strong>{importProgress.percent}%</strong>
                </ProgressTop>
                <ProgressBarOuter>
                  <ProgressBarInner $percent={importProgress.percent} $slow={importProgress._slow} />
                </ProgressBarOuter>
              </ProgressWrap>
            )}
            {!zipPreview && !(stmPreview || []).length ? (
              <div style={{ border:'1px solid #eee', borderRadius:6, padding:16, color:'#6b7280' }}>
                Nincs előnézeti adat. Indíts új importot.
                <div style={{ marginTop: 10 }}>
                  <ActionButton to={importPageUrl}>Vissza az importhoz</ActionButton>
                </div>
              </div>
            ) : (
            <>
            <div style={{ border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' }}>
              <ModalHeader>
                <ModalTitle>{previewReadOnly ? 'Feltöltött bankkivonat - Előnézet' : 'Import előnézet'}</ModalTitle>
                <CloseBtn onClick={closePreviewModal}>Vissza</CloseBtn>
              </ModalHeader>
              <ModalBody>
                {tab === 'zip' ? (
                  <div>
                    <div style={{ fontWeight:600, marginBottom:8 }}>ZIP előnézet</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                      <colgroup>
                        <col style={{ width: '36%' }} />
                        <col style={{ width: '34%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '8%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Fájl</th>
                          <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                          <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Dátum</th>
                          <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Deviza</th>
                          <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Állapot</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(zipPreview?.preview||[]).map((p, idx) => (
                          <tr key={idx}>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.file}>{p.file}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.account_label || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.statement_date || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.currency || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.creatable ? 'Új' : (p.exists ? 'Már létezik' : (p.reason || 'Kihagyva'))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop: 12 }}>
                      <div style={{ color:'#7f8c8d' }}>
                        Összesítés: új {zipPreview?.counts?.creatable||0}, létező {zipPreview?.counts?.existing||0}, kihagyva {zipPreview?.counts?.skipped||0}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <CloseBtn onClick={closePreviewModal}>Vissza</CloseBtn>
                        <ImportButton type="button" onClick={commitZip} disabled={importing}>{importing? 'Mentés…':'Import'}</ImportButton>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    {suggestionProgress.active && (
                      <ProgressWrap style={{ marginTop: 0, marginBottom: 10 }}>
                        <ProgressTop>
                          <span>{suggestionProgress.label || 'Javaslatok betöltése'}</span>
                          <strong>{suggestionProgress.percent}%</strong>
                        </ProgressTop>
                        <ProgressBarOuter>
                          <ProgressBarInner $percent={suggestionProgress.percent} />
                        </ProgressBarOuter>
                      </ProgressWrap>
                    )}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontWeight:600 }}>Előnézet és jóváhagyás</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                          <input type="checkbox" checked={onlyWithPartner} onChange={(e)=>setOnlyWithPartner(e.target.checked)} />
                          Csak Partner
                        </label>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                          <input type="checkbox" checked={onlySavedPairings} onChange={(e)=>setOnlySavedPairings(e.target.checked)} />
                          Csak mentett párosítás
                        </label>
                        <select value={directionFilter} onChange={(e)=>setDirectionFilter(e.target.value)} style={{ padding:'4px 8px' }}>
                          <option value="all">Mind</option>
                          <option value="incoming">Bejövő</option>
                          <option value="outgoing">Kimenő</option>
                        </select>
                      </div>
                    </div>

                    {(stmPreview||[]).map((h, hIdx) => {
                      const visibleItems = (h.items || []).map((it, originalIdx) => ({ it, originalIdx })).filter(({ it }) => {
                        if (onlyWithPartner && getPartnerDisplayName(it) === '-') return false;
                        if (onlySavedPairings && !(
                          it.approved ||
                          it.pairing_marked_at ||
                          it.saved_pairing_marked_at ||
                          (Array.isArray(it.saved_allocations) && it.saved_allocations.length > 0) ||
                          it.saved_invoice
                        )) return false;
                        const amt = amountNum(it.amount);
                        if (directionFilter === 'incoming') return amt > 0;
                        if (directionFilter === 'outgoing') return amt < 0;
                        return true;
                      });
                      if (!visibleItems.length) return null;
                      return (
                      <div key={hIdx} style={{ border:'1px solid #eee', borderRadius:6, marginBottom:10, overflow:'hidden' }}>
                        <div style={{ position:'sticky', top:0, background:'#fafafa', padding:'8px 8px', borderBottom:'1px solid #eee', color:'#2c3e50', zIndex:1 }}>
                          Számla: {h.account_label || h.account_id} | Dátum: {h.statement_date} | Sorszám: {h.sequence_number || '-'} | Deviza: {h.currency}
                        </div>
                        <div style={{ padding:8 }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                          <colgroup>
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '8%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Összeg</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Értéknap</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Közlemény</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>P.Számlaszám</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Partner</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Javasolt</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                              <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Műveletek</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleItems.map(({ it, originalIdx }, visibleIdx) => {
                              const crmKnown = !!it.proposed_customer;
                              const badgeStyle = crmKnown
                                ? { background:'#e6f7ed', color:'#1e824c', border:'1px solid #bfe8d0' }
                                : { background:'#fff0f0', color:'#b42318', border:'1px solid #fecaca' };
                              const { proposed: proposedDisplay, saved: savedDisplay } = getInvoiceDisplayFromItem(it);
                              const invLabel = proposedDisplay?.effectiveInvoiceType === 'incoming' ? 'Bejövő' : (proposedDisplay?.effectiveInvoiceType === 'outgoing' ? 'Számlák' : 'Nincs');
                              const savedInvLabel = savedDisplay?.effectiveInvoiceType === 'incoming' ? 'Bejövő' : (savedDisplay?.effectiveInvoiceType === 'outgoing' ? 'Számlák' : 'Nincs');
                              const statusMeta = invoiceMatchStatus(it);
                              const txnIncoming = amountNum(it.amount) > 0;
                              const isPairingSaved = !!(
                                it.pairing_marked_at ||
                                it.saved_pairing_marked_at ||
                                (Array.isArray(it.saved_allocations) && it.saved_allocations.length > 0) ||
                                it.saved_invoice
                              );
                              const savedAt = it.saved_pairing_marked_at || it.pairing_marked_at;
                              const partnerDisplayName = getPartnerDisplayName(it);
                              return (
                              <tr key={`${hIdx}-${originalIdx}`} style={{ background: isPairingSaved ? '#eff6ff' : (visibleIdx % 2 === 1 ? 'rgb(248,248,248)' : '#fff') }}>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', whiteSpace:'nowrap' }}>{(it.amount!=null)? Number(it.amount).toLocaleString('hu-HU', { minimumFractionDigits: 2 }): '-' } {it.currency}</td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{it.value_date || '-'}</td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={getStatementRawTooltip(it)}>
                                    {it.remittance || it.comment || ''}
                                  </div>
                                </td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', fontSize: '0.85em', color: '#555' }}>
                                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.counterparty_account || ''}>
                                    {it.counterparty_account || '-'}
                                  </div>
                                </td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                  <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={partnerDisplayName === '-' ? '' : partnerDisplayName}>
                                        {partnerDisplayName}
                                      </span>
                                      <button
                                        onClick={()=>openCustomerSelectModal(hIdx, originalIdx, it)}
                                        style={{ ...badgeStyle, borderRadius:10, padding:'1px 6px', fontSize:11, cursor:'pointer' }}
                                        title="CRM partner választás"
                                      >
                                        CRM
                                      </button>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                  <div
                                    style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0, cursor: 'pointer' }}
                                    onClick={() => openAllocationForItem(hIdx, originalIdx, it)}
                                    title={txnIncoming ? 'Kattints az allokációhoz (Számlák)' : 'Kattints az allokációhoz (Bejövő)'}
                                  >
                                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                      <ProposedInvoiceTooltip it={it}>
                                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                          {proposedDisplay?.effectiveInvoiceNumber || '-'}
                                        </span>
                                      </ProposedInvoiceTooltip>
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background: (proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#e6f7ed' : '#fff0f0', color: (proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#1e824c' : '#b42318', border: `1px solid ${(proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#bfe8d0' : '#fecaca'}` }}>
                                        {invLabel}
                                      </span>
                                      {proposedDisplay?.source === 'allocation' && (
                                        <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#e0f2fe', color:'#075985', border:'1px solid #bae6fd' }}>
                                          Allokáció
                                        </span>
                                      )}
                                      {proposedDisplay?.suggestionOrigin === 'backend' && (
                                        <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe' }}>
                                          Backend
                                        </span>
                                      )}
                                      {proposedDisplay?.suggestionOrigin === 'detailed' && (
                                        <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#ecfeff', color:'#0e7490', border:'1px solid #a5f3fc' }}>
                                          Részletes
                                        </span>
                                      )}
                                      {proposedDisplay?.suggestionOrigin === 'manual' && (
                                        <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#fff7ed', color:'#9a3412', border:'1px solid #fed7aa' }}>
                                          Manuális
                                        </span>
                                      )}
                                      {statusMeta.type === 'full' && <Check size={14} color="#1e824c" />}
                                    </div>
                                    {statusMeta.type !== 'full' && statusMeta.type !== 'none' && statusMeta.type !== 'suggested' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#fff0f0', color:'#b42318', border:'1px solid #fecaca', width:'fit-content' }}>
                                        {statusMeta.text}
                                      </span>
                                    )}
                                    {statusMeta.type === 'suggested' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe', width:'fit-content' }}>
                                        {statusMeta.text}
                                      </span>
                                    )}
                                    {statusMeta.type === 'none' && (
                                      <span style={{ color:'#7f8c8d', fontSize:12 }}>{statusMeta.text}</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                  <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={savedDisplay?.effectiveInvoiceNumber || ''}>
                                        {savedDisplay?.effectiveInvoiceNumber || '-'}
                                      </span>
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background: savedDisplay?.effectiveInvoiceNumber ? '#e6f7ed' : '#f3f4f6', color: savedDisplay?.effectiveInvoiceNumber ? '#1e824c' : '#6b7280', border: `1px solid ${savedDisplay?.effectiveInvoiceNumber ? '#bfe8d0' : '#e5e7eb'}` }}>
                                        {savedDisplay?.effectiveInvoiceNumber ? savedInvLabel : 'Nincs'}
                                      </span>
                                    </div>
                                    {savedAt && (
                                      <span style={{ fontSize:11, color:'#1e824c' }}>
                                        Mentve: {new Date(savedAt).toLocaleString('hu-HU')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                      <button
                                        onClick={async ()=>{
                                          const val = true;
                                          const rowHintRaw = it.remittance || it.comment || getStatementPartnerName(it) || 'ismeretlen tétel';
                                          const rowHint = String(rowHintRaw).trim().slice(0, 80);
                                          if (val && !it.proposed_customer?.id) {
                                            toast.info('Előbb válassz partnert.');
                                            return;
                                          }
                                          if (val) {
                                            const hasAlloc = Array.isArray(it.allocations) && it.allocations.some(a => Number(a?.amount || 0) > 0);
                                            const hasInvoice = !!it.proposed_invoice?.id;
                                            if (!hasAlloc && !hasInvoice) {
                                              toast.info('Előbb párosíts számlát vagy allokációt.');
                                              return;
                                            }
                                          }
                                          const ok = await markPairingForSave(hIdx, originalIdx, true, { persist: true });
                                          if (ok) toast.success(`Mentve: ${rowHint}`);
                                        }}
                                        title="Párosítás mentése"
                                        style={{ border:'none', background:'transparent', cursor:'pointer', color: isPairingSaved ? '#1e824c' : '#6b7280' }}
                                      >
                                        <Save size={18} />
                                      </button>
                                      <button
                                        onClick={async ()=>{
                                          const rowHintRaw = it.remittance || it.comment || getStatementPartnerName(it) || 'ismeretlen tétel';
                                          const rowHint = String(rowHintRaw).trim().slice(0, 80);
                                          const ok = await markPairingForSave(hIdx, originalIdx, false, { persist: true });
                                          if (ok) toast.info(`Mentés törölve: ${rowHint}`);
                                        }}
                                        disabled={!isPairingSaved}
                                        title="Mentés törlése"
                                        style={{
                                          border:'none',
                                          background:'transparent',
                                          cursor: isPairingSaved ? 'pointer' : 'default',
                                          color: isPairingSaved ? '#e74c3c' : '#9ca3af',
                                          opacity: isPairingSaved ? 1 : 0.65
                                        }}
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </div>
                                    {(it.saved_pairing_marked_at || it.pairing_marked_at) && (
                                      <span style={{ fontSize:11, color:'#1e824c' }}>
                                        {new Date(it.saved_pairing_marked_at || it.pairing_marked_at).toLocaleString('hu-HU')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                         </table>
                        </div>
                      </div>
                      );
                    })}
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 12 }}>
                      <CloseBtn onClick={closePreviewModal}>Vissza</CloseBtn>
                    </div>
                    {previewReadOnly && (
                      <div style={{ marginTop: 8, color:'#7f8c8d', fontSize: 12, textAlign:'right' }}>
                        Előnézet mód · Kivonat azonosító: {previewSourceStatementId}
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
            </div>
            </>
            )}
          </div>
        )}

        {customerModal.open && (
          <ModalOverlay onClick={()=>setCustomerModal({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false })}>
            <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 760 }}>
              <ModalHeader>
                <ModalTitle>Ügyfél kiválasztása</ModalTitle>
                <CloseBtn onClick={()=>setCustomerModal({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false })}>Bezárás</CloseBtn>
              </ModalHeader>
              <ModalBody>
                <div style={{ marginBottom: 8, color:'#6b7280' }}>
                  Partner: {getStatementPartnerName(customerModal.item) || '-'} · P.Számlaszám: {customerModal.item?.counterparty_account || '-'}
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={openNewCustomerPage}
                    style={{ border:'1px solid #d1d5db', background:'#fff', borderRadius:6, padding:'6px 10px', cursor:'pointer' }}
                  >
                    Új ügyfél
                  </button>
                  <button
                    type="button"
                    onClick={refreshCustomerModalList}
                    disabled={customerModal.loading}
                    style={{ border:'1px solid #d1d5db', background:'#fff', borderRadius:6, padding:'6px 10px', cursor: customerModal.loading ? 'default' : 'pointer' }}
                  >
                    {customerModal.loading ? 'Frissítés…' : 'Frissítés'}
                  </button>
                </div>
                <input
                  ref={customerSearchInputRef}
                  value={customerModal.search || ''}
                  onChange={(e)=>setCustomerModal(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Gyors keresés név/adószám"
                  style={{ width:'100%', marginBottom:10, padding:'8px 10px', border:'1px solid #ddd', borderRadius:6 }}
                />
                {customerModal.loading ? (
                  <div>Betöltés…</div>
                ) : (
                  <div style={{ maxHeight: 420, overflowY: 'auto', border:'1px solid #eee', borderRadius: 6 }}>
                    {(customerModal.customers || [])
                      .filter((c) => {
                        const s = normalizeForSearch((customerModal.search || '').trim());
                        if (!s) return true;
                        const n = normalizeForSearch(c?.name);
                        const tax = normalizeForSearch(c?.tax_number);
                        return n.includes(s) || tax.includes(s);
                      })
                      .map((c) => {
                      const rec = String(c.id) === String(customerModal.recommendedId);
                      return (
                        <div
                          key={c.id}
                          ref={(el)=>{ customerRowRefs.current[String(c.id)] = el; }}
                          tabIndex={-1}
                          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:10, borderBottom:'1px solid #f3f4f6', background: rec ? '#eff6ff' : '#fff' }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            {rec && <div style={{ fontSize: 12, color:'#2563eb' }}>Ajánlott</div>}
                          </div>
                          <ImportButton type="button" onClick={()=>selectCustomerFromModal(c)}>Kiválasztás</ImportButton>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ModalBody>
            </ModalContent>
          </ModalOverlay>
        )}

        {allocationModal.open && (
          <ModalOverlay onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>
            <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 1100 }}>
              <ModalHeader>
                <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
                  <ModalTitle>{allocationModal.mode === 'incoming' ? 'Bejövő számlák allokáció' : 'Számlák allokáció'}</ModalTitle>
                  <div style={{ marginTop: 4, color:'#6b7280', fontSize: 13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={allocationModal.item?.remittance || allocationModal.item?.comment || ''}>
                    Közlemény: {allocationModal.item?.remittance || allocationModal.item?.comment || '-'}
                  </div>
                </div>
                <CloseBtn onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>Bezárás</CloseBtn>
              </ModalHeader>
              <ModalBody>
                {allocationModal.loading ? (
                  <ProgressWrap>
                    <ProgressTop>
                      <span>{allocationProgress.label || 'Allokációs adatok betöltése'}</span>
                      <strong>{allocationProgress.percent}%</strong>
                    </ProgressTop>
                    <ProgressBarOuter>
                      <ProgressBarInner $percent={allocationProgress.percent} />
                    </ProgressBarOuter>
                  </ProgressWrap>
                ) : (
                  <>
                    <div style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 5,
                      background: '#fff',
                      padding: '8px 0',
                      marginBottom: 10,
                      borderBottom: '1px solid #eee',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      gap:10,
                      flexWrap:'wrap'
                    }}>
                      <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                        <span>{allocationModal.mode === 'incoming' ? 'Kifizetett összeg' : 'Befizetett összeg'}: <strong>{Math.abs(amountNum(allocationModal.item?.amount)).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationModal.item?.currency || ''}</strong></span>
                        <span>Kiválasztott összeg: <strong>{allocationTotal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}</strong></span>
                        <span>Maradvány: <strong>{allocationRemaining.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}</strong></span>
                        <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 13, color:'#374151' }}>
                          <input
                            type="checkbox"
                            checked={!!allocationModal.showAllInvoices}
                            onChange={(e) => openAllocationForItem(allocationModal.hIdx, allocationModal.iIdx, allocationModal.item, {
                              showAllInvoices: e.target.checked,
                              includeExternalInvoices: !!allocationModal.includeExternalInvoices,
                            })}
                          />
                          Minden számla
                        </label>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <CloseBtn onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>Mégse</CloseBtn>
                        <ImportButton type="button" onClick={applyAllocationModal} disabled={allocationOver > 0.0001}>Alkalmazás</ImportButton>
                      </div>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr>
                          <th style={allocationHeaderCellStyle}>
                            {(() => {
                              const _allIds = allocationDisplayInvoices.map(i => i.id);
                              const _checkedCnt = _allIds.filter(id => Math.abs(amountNum(allocationModal.allocations?.[id])) > 0.0001).length;
                              const _allChk = _allIds.length > 0 && _checkedCnt === _allIds.length;
                              const _someChk = _checkedCnt > 0 && _checkedCnt < _allIds.length;
                              return (
                                <input type="checkbox" title="Összes kijelölése / megszüntetése"
                                  checked={_allChk}
                                  ref={el => { if (el) el.indeterminate = _someChk; }}
                                  onChange={() => {
                                    setAllocationModal(prev => {
                                      const prevAllocations = prev.allocations || {};
                                      const hasAnyChecked = (prev.invoices || []).some((inv) => Math.abs(amountNum(prevAllocations?.[inv.id])) > 0.0001);
                                      const next = {};
                                      if (!hasAnyChecked) {
                                        let rem = allocationBudget;
                                        (prev.invoices || []).forEach(inv => {
                                          const ost = amountNum(inv.outstanding);
                                          if (ost < -0.0001) { next[inv.id] = normalizeStornoAllocationValue(inv, ost); }
                                          else {
                                            const ostAbs = Math.abs(ost);
                                            const ostTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                            const allocTxn = Math.min(Math.max(0, ostTxn), Math.max(0, rem));
                                            const alloc = (ostAbs > 0 && ostTxn > 0) ? Math.min(ostAbs, (allocTxn * ostAbs) / ostTxn) : 0;
                                            if (alloc > 0.0001) { next[inv.id] = normalizeStornoAllocationValue(inv, alloc); rem -= Math.abs(getInvoiceAllocationInTxn(inv, alloc, allocationTxnCurrency)); }
                                          }
                                        });
                                      }
                                      return { ...prev, allocations: next };
                                    });
                                  }}
                                />
                              );
                            })()}
                          </th>
                          <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('invoice_number')}>
                            {allocationModal.mode === 'incoming' ? 'Bejövő számla' : 'Számla'}{allocationSortIndicator('invoice_number')}
                          </th>
                          <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('partner')}>
                            Partner{allocationSortIndicator('partner')}
                          </th>
                          <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('due_date')}>
                            Esedékes{allocationSortIndicator('due_date')}
                          </th>
                          <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('outstanding')}>
                            Hátralék{allocationSortIndicator('outstanding')}
                          </th>
                          <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('payable')}>
                            Kifizetendő{allocationSortIndicator('payable')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationDisplayInvoices.map((inv) => {
                          const checked = Math.abs(amountNum(allocationModal.allocations?.[inv.id])) > 0.0001;
                          const allocVal = checked ? normalizeStornoAllocationValue(inv, allocationModal.allocations?.[inv.id]) : 0;
                          const outstandingVal = amountNum(inv.outstanding);
                          const invCurrency = normalizeCurrency(inv?.currency || allocationTxnCurrency);
                          const outstandingTxnVal = getInvoiceOutstandingInTxn(inv, allocationTxnCurrency);
                          const allocTxnVal = getInvoiceAllocationInTxn(inv, allocVal, allocationTxnCurrency);
                          const useTxnInput = allocationTxnCurrency === 'HUF' && (invCurrency === 'HUF' || amountNum(inv?.gross_amount_huf) > 0.0001);
                          const inputValue = useTxnInput
                            ? (Math.abs(allocVal) > 0.0001 ? allocTxnVal.toFixed(2) : '')
                            : (Math.abs(allocVal) > 0.0001 ? allocVal.toFixed(2) : '');
                          const inputMin = useTxnInput
                            ? (outstandingVal < -0.0001 ? -Math.abs(outstandingTxnVal) : 0)
                            : (outstandingVal < -0.0001 ? outstandingVal : 0);
                          const inputMax = useTxnInput
                            ? (outstandingVal > 0.0001 ? Math.abs(outstandingTxnVal) : 0)
                            : (outstandingVal > 0.0001 ? outstandingVal : 0);
                          const conversionHint = (() => {
                            if (allocationTxnCurrency !== 'HUF' || invCurrency === 'HUF') return null;
                            if (amountNum(inv?.gross_amount_huf) > 0.0001) return 'grossAmountHUF alapján';
                            if (inv?._impliedRate) return 'becsült árfolyam alapján';
                            if (amountNum(inv?.exchange_rate) > 0.0001) return 'árfolyam alapján';
                            return null;
                          })();
                          const stornoLinked = !!(inv?.is_storno_linked || inv?.is_storno_invoice || inv?.is_storno_original);
                          const remainingAfterAlloc = outstandingVal >= 0
                            ? Math.max(0, outstandingVal - allocVal)
                            : Math.min(0, outstandingVal - allocVal);
                          const remainingAfterAllocTxn = outstandingTxnVal >= 0
                            ? Math.max(0, outstandingTxnVal - allocTxnVal)
                            : Math.min(0, outstandingTxnVal - allocTxnVal);
                          return (
                            <tr key={inv.id} style={stornoLinked ? { background: '#fee2e2' } : undefined}>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e)=>{
                                    setAllocationModal(prev => {
                                      const next = { ...(prev.allocations || {}) };
                                      if (!e.target.checked) {
                                        delete next[inv.id];
                                      } else {
                                          const used = Object.entries(next).reduce((sum, [k, v]) => {
                                            if (String(k) === String(inv.id)) return sum;
                                            const selectedInv = (prev.invoices || []).find((row) => String(row?.id) === String(k));
                                            return sum + getInvoiceAllocationInTxn(selectedInv, v, allocationTxnCurrency);
                                          }, 0);
                                        const outstanding = amountNum(inv.outstanding);
                                        if (outstanding < -0.0001) {
                                          next[inv.id] = normalizeStornoAllocationValue(inv, outstanding);
                                        } else {
                                            const available = Math.max(0, allocationBudget - used);
                                            const outstandingAbs = Math.abs(outstanding);
                                            const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                            const maxByBudget = (outstandingAbs > 0 && outstandingTxn > 0)
                                              ? (available * outstandingAbs) / outstandingTxn
                                              : available;
                                            next[inv.id] = normalizeStornoAllocationValue(inv, Math.min(Math.max(0, outstanding), maxByBudget));
                                        }
                                      }
                                      return { ...prev, allocations: next };
                                    });
                                  }}
                                />
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div>{inv.invoice_number}</div>
                                <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>
                                  {inv?.invoice_type === 'incoming' ? 'Bejövő' : 'Kimenő'}
                                </div>
                                {inv.match_reason === 'remittance' && (
                                  <div style={{ marginTop: 2, fontSize: 11, color: '#1e824c' }}>Közlemény találat</div>
                                )}
                                {inv.match_reason === 'amount' && (
                                  <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Összeg találat</div>
                                )}
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{inv.customer_name || inv.supplier_name || '-'}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{inv.due_date || '-'}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div>{outstandingTxnVal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}</div>
                                {invCurrency !== allocationTxnCurrency && (
                                  <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>
                                    Eredeti: {amountNum(inv.outstanding).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency}
                                    {inv._impliedRate && (
                                      <span title="Az árfolyam a banki terhelésből van visszaszámolva"> (≈becsült árfolyam)</span>
                                    )}
                                  </div>
                                )}
                                {conversionHint && (
                                  <div style={{ marginTop: 2, fontSize: 12, color: '#0369a1' }}>
                                    Számítás: {conversionHint}
                                  </div>
                                )}
                                {checked && Math.abs(allocVal) > 0.0001 && (
                                  <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>
                                    Fennmaradó: {remainingAfterAllocTxn.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}
                                    {invCurrency !== allocationTxnCurrency && (
                                      <span> (eredeti: {remainingAfterAlloc.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency})</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                {checked && (
                                  <>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={inputMin}
                                      max={inputMax}
                                      value={inputValue}
                                      onChange={(e)=>{
                                        const raw = e.target.value;
                                        setAllocationModal(prev => {
                                          const current = { ...(prev.allocations || {}) };
                                          const numericRawInput = amountNum(raw);
                                          const outstanding = amountNum(inv.outstanding);
                                          const usedWithoutCurrent = Object.entries(current).reduce((sum, [k, v]) => {
                                            if (String(k) === String(inv.id)) return sum;
                                            const selectedInv = (prev.invoices || []).find((row) => String(row?.id) === String(k));
                                            return sum + getInvoiceAllocationInTxn(selectedInv, v, allocationTxnCurrency);
                                          }, 0);
                                          const budgetCapTxn = Math.max(0, allocationBudget - usedWithoutCurrent);
                                          const outstandingAbs = Math.abs(outstanding);
                                          const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                          const numericRaw = useTxnInput
                                            ? ((outstandingAbs > 0 && outstandingTxn > 0)
                                              ? (numericRawInput * outstandingAbs) / outstandingTxn
                                              : numericRawInput)
                                            : numericRawInput;
                                          const budgetCap = (outstandingAbs > 0 && outstandingTxn > 0)
                                            ? (budgetCapTxn * outstandingAbs) / outstandingTxn
                                            : budgetCapTxn;
                                          let finalVal = 0;
                                          if (outstanding < -0.0001) {
                                            finalVal = Math.min(0, Math.max(outstanding, numericRaw));
                                          } else {
                                            finalVal = Math.min(Math.max(0, numericRaw), Math.max(0, outstanding), budgetCap);
                                          }
                                          current[inv.id] = normalizeStornoAllocationValue(inv, Math.round(finalVal * 100) / 100);
                                          return { ...prev, allocations: current };
                                        });
                                      }}
                                      style={{ padding: 6, width: 140 }}
                                    />
                                    <div style={{ marginTop: 2, fontSize: 12, color: Math.abs(allocVal) > 0.0001 ? '#1e824c' : '#6b7280' }}>
                                      Végleges kifizetés: {allocTxnVal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}
                                      {invCurrency !== allocationTxnCurrency && (
                                        <span> (eredeti: {allocVal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency})</span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {allocationOver > 0.0001 && (
                      <div style={{ marginTop: 8, display:'flex', alignItems:'center', gap:6, color:'#b42318', fontWeight:600 }}>
                        <AlertCircle size={16} />
                        Túlallokálás: {allocationOver.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </>
                )}
              </ModalBody>
            </ModalContent>
          </ModalOverlay>
        )}
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Bank kivonatok</Title>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input
            type="text"
            value={listSearchTerm}
            onChange={(e) => setListSearchTerm(e.target.value)}
            placeholder="Keresés számlaszám, megjegyzés alapján..."
            style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:4, fontSize:14, minWidth:300 }}
          />
          <ActionButton to="/bank-statements/uploaded">Feltöltött bankkivonatok</ActionButton>
          <ActionButton to="/bank-statements/import">Import</ActionButton>
          <ActionButton to="/bank-statements/new">Új bankkivonat</ActionButton>
        </div>
      </Header>
      <DateFilterWrap>
        <DateFilterPanel>
          <DateFilterTitle>Kelt dátum (Issue)</DateFilterTitle>
          <QuickRow>
            <QuickButton type="button" $active={quickRange === 'today'} onClick={() => applyQuickRange('today')}>Ma</QuickButton>
            <QuickButton type="button" $active={quickRange === 'week'} onClick={() => applyQuickRange('week')}>Hét</QuickButton>
            <QuickButton type="button" $active={quickRange === 'month'} onClick={() => applyQuickRange('month')}>Hónap</QuickButton>
            <QuickButton type="button" $active={quickRange === 'prevMonth'} onClick={() => applyQuickRange('prevMonth')}>Előző hó</QuickButton>
            <QuickButton type="button" $active={hideZeroAmounts} onClick={() => setHideZeroAmounts((prev) => !prev)}>
              Nullások rejtése: {hideZeroAmounts ? 'BE' : 'KI'}
            </QuickButton>
            <ClearQuickButton type="button" onClick={() => applyQuickRange('clear')}>Törlés</ClearQuickButton>
          </QuickRow>
          <DateRangeBox>
            <DateRangeGrid>
              <DateField>
                Mettől
                <DateInput
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setQuickRange(''); }}
                />
              </DateField>
              <div style={{ color:'#9ca3af', paddingBottom: 8 }}>—</div>
              <DateField>
                Meddig
                <DateInput
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setQuickRange(''); }}
                />
              </DateField>
            </DateRangeGrid>
          </DateRangeBox>
        </DateFilterPanel>
      </DateFilterWrap>
      {isLoading ? (
        <div style={{ padding: 20 }}>Betöltés...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <Th>Dátum</Th>
                <Th>Sorszám</Th>
                <Th>Számlaszám</Th>
                <Th>Összeg</Th>
                <Th>Megjegyzés</Th>
                <Th>Műveletek</Th>
              </tr>
            </thead>
            <tbody>
              {pagedFilteredList.map((st) => {
                const stItems = Array.isArray(st.import_preview_items) ? st.import_preview_items : (Array.isArray(st.items) ? st.items : []);
                const tooltipText = stItems.length > 0
                  ? stItems.slice(0, 10).map((it, i) =>
                      `${i+1}. ${it.counterparty_name || it.remittance || '-'} | ${it.amount != null ? it.amount : '-'} ${st.currency || ''} | ${it.comment || it.remittance || ''}`
                    ).join('\n') + (stItems.length > 10 ? `\n… és még ${stItems.length - 10} tétel` : '')
                  : null;
                return (
                <tr key={st.id} title={tooltipText || undefined} style={{ cursor: tooltipText ? 'help' : undefined }}>
                  <Td
                    onDoubleClick={() => openStatementEditor(st.id)}
                    style={{ cursor: 'pointer' }}
                    title="Dupla klikk: szerkesztés"
                  >
                    {st.statement_date}
                  </Td>
                  <Td
                    onDoubleClick={() => {
                      if (editId !== st.id) openStatementInUploadedPreview(st.id);
                    }}
                    style={{ cursor: editId === st.id ? 'default' : 'pointer' }}
                    title={editId === st.id ? '' : 'Dupla klikk: feltöltött bankkivonat nézet'}
                  >
                    {editId === st.id ? (
                      <input style={{ padding: 6, border: '1px solid #ccc', borderRadius: 4 }} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                    ) : (
                      st.sequence_number
                    )}
                  </Td>
                  <Td
                    onDoubleClick={() => openStatementEditor(st.id)}
                    style={{ cursor: 'pointer' }}
                    title="Dupla klikk: szerkesztés"
                  >
                    {st.bank_account_name || st.bank_account || ''}
                  </Td>
                  <Td
                    onDoubleClick={() => openStatementEditor(st.id)}
                    style={{ cursor: 'pointer' }}
                    title="Dupla klikk: szerkesztés"
                  >
                    {st.total_amount != null
                      ? formatSignedAmount(st.total_amount, st.currency || '')
                      : ''}
                  </Td>
                  <Td
                    onDoubleClick={() => openStatementEditor(st.id)}
                    style={{ cursor: 'pointer' }}
                    title="Dupla klikk: szerkesztés"
                  >
                    {st.display_note || st.note || ''}
                  </Td>
                  <Td>
                    {editId === st.id ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button title="Mentés" onClick={() => saveEdit(st.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#27ae60' }}>
                          <Save size={18} />
                        </button>
                        <button title="Mégse" onClick={cancelEdit} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e67e22' }}>
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link title="Kivonat szerkesztése (tételek)" to={`/bank-statements/${st.id}/edit`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2c3e50', textDecoration: 'none' }}>
                          <Edit2 size={18} /> Szerk.
                        </Link>
                        <button title="Szám szerkesztése" onClick={() => startEdit(st)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3498db' }}>
                          <Edit2 size={18} />
                        </button>
                        <button title="Törlés" onClick={() => deleteRow(st.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e74c3c' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </Table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px' }}>
            <Pagination
              current={listPage}
              pageSize={listPageSize}
              total={filteredList.length}
              showSizeChanger
              showQuickJumper={{ goButton: true }}
              responsive
              showLessItems
              pageSizeOptions={['20', '50', '100', '200']}
              showTotal={(total) => `Összesen: ${total}`}
              onChange={(page, size) => {
                setListPage(page);
                if (size !== listPageSize) setListPageSize(size);
              }}
            />
          </div>
        </div>
      )}

      {showPreviewModal && (
        <ModalOverlay onClick={closePreviewModal}>
          <ModalContent onClick={(e)=>e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{previewReadOnly ? 'Feltöltött bankkivonat - Előnézet' : 'Import előnézet'}</ModalTitle>
              <CloseBtn onClick={closePreviewModal}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {tab === 'zip' ? (
                <div>
                  <div style={{ fontWeight:600, marginBottom:8 }}>ZIP előnézet</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                    <colgroup>
                      <col style={{ width: '36%' }} />
                      <col style={{ width: '34%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Fájl</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Dátum</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Deviza</th>
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Állapot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(zipPreview?.preview||[]).map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.file}>{p.file}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.account_label || '-'}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.statement_date || '-'}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.currency || '-'}</td>
                          <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{p.creatable ? 'Új' : (p.exists ? 'Már létezik' : (p.reason || 'Kihagyva'))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop: 12 }}>
                    <div style={{ color:'#7f8c8d' }}>
                      Összesítés: új {zipPreview?.counts?.creatable||0}, létező {zipPreview?.counts?.existing||0}, kihagyva {zipPreview?.counts?.skipped||0}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <CloseBtn onClick={closePreviewModal}>Vissza</CloseBtn>
                      <ImportButton type="button" onClick={commitZip} disabled={importing}>{importing? 'Mentés…':'Import'}</ImportButton>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  {suggestionProgress.active && (
                    <ProgressWrap style={{ marginTop: 0, marginBottom: 10 }}>
                      <ProgressTop>
                        <span>{suggestionProgress.label || 'Javaslatok betöltése'}</span>
                        <strong>{suggestionProgress.percent}%</strong>
                      </ProgressTop>
                      <ProgressBarOuter>
                        <ProgressBarInner $percent={suggestionProgress.percent} />
                      </ProgressBarOuter>
                    </ProgressWrap>
                  )}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ fontWeight:600 }}>Előnézet és jóváhagyás</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <input type="checkbox" checked={onlyWithPartner} onChange={(e)=>setOnlyWithPartner(e.target.checked)} />
                        Csak Partner
                      </label>
                      <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <input type="checkbox" checked={onlySavedPairings} onChange={(e)=>setOnlySavedPairings(e.target.checked)} />
                        Csak mentett párosítás
                      </label>
                      <select value={directionFilter} onChange={(e)=>setDirectionFilter(e.target.value)} style={{ padding:'4px 8px' }}>
                        <option value="all">Mind</option>
                        <option value="incoming">Bejövő</option>
                        <option value="outgoing">Kimenő</option>
                      </select>
                    </div>
                  </div>

                  {(stmPreview||[]).map((h, hIdx) => {
                    const visibleItems = (h.items || []).map((it, originalIdx) => ({ it, originalIdx })).filter(({ it }) => {
                      if (onlyWithPartner && getPartnerDisplayName(it) === '-') return false;
                      if (onlySavedPairings && !(
                        it.approved ||
                        it.pairing_marked_at ||
                        it.saved_pairing_marked_at ||
                        (Array.isArray(it.saved_allocations) && it.saved_allocations.length > 0) ||
                        it.saved_invoice
                      )) return false;
                      const amt = amountNum(it.amount);
                      if (directionFilter === 'incoming') return amt > 0;
                      if (directionFilter === 'outgoing') return amt < 0;
                      return true;
                    });
                    if (!visibleItems.length) return null;
                    return (
                    <div key={hIdx} style={{ border:'1px solid #eee', borderRadius:6, marginBottom:10, overflow:'hidden' }}>
                      <div style={{ position:'sticky', top:0, background:'#fafafa', padding:'8px 8px', borderBottom:'1px solid #eee', color:'#2c3e50', zIndex:1 }}>
                        Számla: {h.account_label || h.account_id} | Dátum: {h.statement_date} | Sorszám: {h.sequence_number || '-'} | Deviza: {h.currency}
                      </div>
                      <div style={{ padding:8 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                        <colgroup>
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '13%' }} />
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '8%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Összeg</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Értéknap</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Közlemény</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>P.Számlaszám</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Partner</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Javasolt</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Számla</th>
                            <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee' }}>Műveletek</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleItems.map(({ it, originalIdx }, visibleIdx) => {
                            const crmKnown = !!it.proposed_customer;
                            const badgeStyle = crmKnown
                              ? { background:'#e6f7ed', color:'#1e824c', border:'1px solid #bfe8d0' }
                              : { background:'#fff0f0', color:'#b42318', border:'1px solid #fecaca' };
                            const { proposed: proposedDisplay, saved: savedDisplay } = getInvoiceDisplayFromItem(it);
                            const invLabel = proposedDisplay?.effectiveInvoiceType === 'incoming' ? 'Bejövő' : (proposedDisplay?.effectiveInvoiceType === 'outgoing' ? 'Számlák' : 'Nincs');
                            const savedInvLabel = savedDisplay?.effectiveInvoiceType === 'incoming' ? 'Bejövő' : (savedDisplay?.effectiveInvoiceType === 'outgoing' ? 'Számlák' : 'Nincs');
                            const statusMeta = invoiceMatchStatus(it);
                            const txnIncoming = amountNum(it.amount) > 0;
                            const isPairingSaved = !!(
                              it.pairing_marked_at ||
                              it.saved_pairing_marked_at ||
                              (Array.isArray(it.saved_allocations) && it.saved_allocations.length > 0) ||
                              it.saved_invoice
                            );
                            const savedAt = it.saved_pairing_marked_at || it.pairing_marked_at;
                            const partnerDisplayName = getPartnerDisplayName(it);
                            return (
                            <tr key={`${hIdx}-${originalIdx}`} style={{ background: isPairingSaved ? '#eff6ff' : (visibleIdx % 2 === 1 ? 'rgb(248,248,248)' : '#fff') }}>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', whiteSpace:'nowrap' }}>{(it.amount!=null)? Number(it.amount).toLocaleString('hu-HU', { minimumFractionDigits: 2 }): '-' } {it.currency}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{it.value_date || '-'}</td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={getStatementRawTooltip(it)}>
                                  {it.remittance || it.comment || ''}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4', fontSize: '0.85em', color: '#555' }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.counterparty_account || ''}>
                                  {it.counterparty_account || '-'}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={partnerDisplayName === '-' ? '' : partnerDisplayName}>
                                      {partnerDisplayName}
                                    </span>
                                    <button
                                      onClick={()=>openCustomerSelectModal(hIdx, originalIdx, it)}
                                      style={{ ...badgeStyle, borderRadius:10, padding:'1px 6px', fontSize:11, cursor:'pointer' }}
                                      title="CRM partner választás"
                                    >
                                      CRM
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div
                                  style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0, cursor: 'pointer' }}
                                  onClick={() => openAllocationForItem(hIdx, originalIdx, it)}
                                  title={txnIncoming ? 'Kattints az allokációhoz (Számlák)' : 'Kattints az allokációhoz (Bejövő)'}
                                >
                                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                    <ProposedInvoiceTooltip it={it}>
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                        {proposedDisplay?.effectiveInvoiceNumber || '-'}
                                      </span>
                                    </ProposedInvoiceTooltip>
                                    <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background: (proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#e6f7ed' : '#fff0f0', color: (proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#1e824c' : '#b42318', border: `1px solid ${(proposedDisplay?.effectiveInvoiceNumber || proposedDisplay?.firstAlloc) ? '#bfe8d0' : '#fecaca'}` }}>
                                      {invLabel}
                                    </span>
                                    {proposedDisplay?.source === 'allocation' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#e0f2fe', color:'#075985', border:'1px solid #bae6fd' }}>
                                        Allokáció
                                      </span>
                                    )}
                                    {proposedDisplay?.suggestionOrigin === 'backend' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe' }}>
                                        Backend
                                      </span>
                                    )}
                                    {proposedDisplay?.suggestionOrigin === 'detailed' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#ecfeff', color:'#0e7490', border:'1px solid #a5f3fc' }}>
                                        Részletes
                                      </span>
                                    )}
                                    {proposedDisplay?.suggestionOrigin === 'manual' && (
                                      <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#fff7ed', color:'#9a3412', border:'1px solid #fed7aa' }}>
                                        Manuális
                                      </span>
                                    )}
                                    {statusMeta.type === 'full' && <Check size={14} color="#1e824c" />}
                                  </div>
                                  {statusMeta.type !== 'full' && statusMeta.type !== 'none' && statusMeta.type !== 'suggested' && (
                                    <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#fff0f0', color:'#b42318', border:'1px solid #fecaca', width:'fit-content' }}>
                                      {statusMeta.text}
                                    </span>
                                  )}
                                  {statusMeta.type === 'suggested' && (
                                    <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background:'#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe', width:'fit-content' }}>
                                      {statusMeta.text}
                                    </span>
                                  )}
                                  {statusMeta.type === 'none' && (
                                    <span style={{ color:'#7f8c8d', fontSize:12 }}>{statusMeta.text}</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={savedDisplay?.effectiveInvoiceNumber || ''}>
                                      {savedDisplay?.effectiveInvoiceNumber || '-'}
                                    </span>
                                    <span style={{ borderRadius:10, padding:'1px 6px', fontSize:11, background: savedDisplay?.effectiveInvoiceNumber ? '#e6f7ed' : '#f3f4f6', color: savedDisplay?.effectiveInvoiceNumber ? '#1e824c' : '#6b7280', border: `1px solid ${savedDisplay?.effectiveInvoiceNumber ? '#bfe8d0' : '#e5e7eb'}` }}>
                                      {savedDisplay?.effectiveInvoiceNumber ? savedInvLabel : 'Nincs'}
                                    </span>
                                  </div>
                                  {savedAt && (
                                    <span style={{ fontSize:11, color:'#1e824c' }}>
                                      Mentve: {new Date(savedAt).toLocaleString('hu-HU')}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <button
                                      onClick={async ()=>{
                                        const val = true;
                                        const rowHintRaw = it.remittance || it.comment || getStatementPartnerName(it) || 'ismeretlen tétel';
                                        const rowHint = String(rowHintRaw).trim().slice(0, 80);
                                        if (val && !it.proposed_customer?.id) {
                                          toast.info('Előbb válassz partnert.');
                                          return;
                                        }
                                        if (val) {
                                          const hasAlloc = Array.isArray(it.allocations) && it.allocations.some(a => Number(a?.amount || 0) > 0);
                                          const hasInvoice = !!proposedDisplay?.effectiveInvoiceNumber;
                                          if (!hasAlloc && !hasInvoice) {
                                            toast.info('Előbb párosíts számlát vagy allokációt.');
                                            return;
                                          }
                                        }
                                        const ok = await markPairingForSave(hIdx, originalIdx, true, { persist: true });
                                        if (ok) toast.success(`Mentve: ${rowHint}`);
                                      }}
                                      title="Párosítás mentése"
                                      style={{ border:'none', background:'transparent', cursor:'pointer', color: isPairingSaved ? '#1e824c' : '#6b7280' }}
                                    >
                                      <Save size={18} />
                                    </button>
                                    <button
                                      onClick={async ()=>{
                                        const rowHintRaw = it.remittance || it.comment || getStatementPartnerName(it) || 'ismeretlen tétel';
                                        const rowHint = String(rowHintRaw).trim().slice(0, 80);
                                        const ok = await markPairingForSave(hIdx, originalIdx, false, { persist: true });
                                        if (ok) toast.info(`Mentés törölve: ${rowHint}`);
                                      }}
                                      disabled={!isPairingSaved}
                                      title="Mentés törlése"
                                      style={{
                                        border:'none',
                                        background:'transparent',
                                        cursor: isPairingSaved ? 'pointer' : 'default',
                                        color: isPairingSaved ? '#e74c3c' : '#9ca3af',
                                        opacity: isPairingSaved ? 1 : 0.65
                                      }}
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                  {(it.saved_pairing_marked_at || it.pairing_marked_at) && (
                                    <span style={{ fontSize:11, color:'#1e824c' }}>
                                      {new Date(it.saved_pairing_marked_at || it.pairing_marked_at).toLocaleString('hu-HU')}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                       </table>
                      </div>
                    </div>
                    );
                  })}
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 12 }}>
                    <CloseBtn onClick={closePreviewModal}>Vissza</CloseBtn>
                  </div>
                  {previewReadOnly && (
                    <div style={{ marginTop: 8, color:'#7f8c8d', fontSize: 12, textAlign:'right' }}>
                      Előnézet mód · Kivonat azonosító: {previewSourceStatementId}
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {customerModal.open && (
        <ModalOverlay onClick={()=>setCustomerModal({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false })}>
          <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 760 }}>
            <ModalHeader>
              <ModalTitle>Ügyfél kiválasztása</ModalTitle>
              <CloseBtn onClick={()=>setCustomerModal({ open: false, hIdx: null, iIdx: null, item: null, customers: [], recommendedId: null, search: '', loading: false })}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <div style={{ marginBottom: 8, color:'#6b7280' }}>
                Partner: {getStatementPartnerName(customerModal.item) || '-'} · P.Számlaszám: {customerModal.item?.counterparty_account || '-'}
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={openNewCustomerPage}
                  style={{ border:'1px solid #d1d5db', background:'#fff', borderRadius:6, padding:'6px 10px', cursor:'pointer' }}
                >
                  Új ügyfél
                </button>
                <button
                  type="button"
                  onClick={refreshCustomerModalList}
                  disabled={customerModal.loading}
                  style={{ border:'1px solid #d1d5db', background:'#fff', borderRadius:6, padding:'6px 10px', cursor: customerModal.loading ? 'default' : 'pointer' }}
                >
                  {customerModal.loading ? 'Frissítés…' : 'Frissítés'}
                </button>
              </div>
              <input
                ref={customerSearchInputRef}
                value={customerModal.search || ''}
                onChange={(e)=>setCustomerModal(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Gyors keresés név/adószám"
                style={{ width:'100%', marginBottom:10, padding:'8px 10px', border:'1px solid #ddd', borderRadius:6 }}
              />
              {customerModal.loading ? (
                <div>Betöltés…</div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto', border:'1px solid #eee', borderRadius: 6 }}>
                  {(customerModal.customers || [])
                    .filter((c) => {
                      const s = normalizeForSearch((customerModal.search || '').trim());
                      if (!s) return true;
                      const n = normalizeForSearch(c?.name);
                      const tax = normalizeForSearch(c?.tax_number);
                      return n.includes(s) || tax.includes(s);
                    })
                    .map((c) => {
                    const rec = String(c.id) === String(customerModal.recommendedId);
                    return (
                      <div
                        key={c.id}
                        ref={(el)=>{ customerRowRefs.current[String(c.id)] = el; }}
                        tabIndex={-1}
                        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:10, borderBottom:'1px solid #f3f4f6', background: rec ? '#eff6ff' : '#fff' }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {rec && <div style={{ fontSize: 12, color:'#2563eb' }}>Ajánlott</div>}
                        </div>
                        <ImportButton type="button" onClick={()=>selectCustomerFromModal(c)}>Kiválasztás</ImportButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}

      {allocationModal.open && (
        <ModalOverlay onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>
          <ModalContent onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <ModalHeader>
              <div style={{ display:'flex', flexDirection:'column', minWidth:0 }}>
                <ModalTitle>{allocationModal.mode === 'incoming' ? 'Bejövő számlák allokáció' : 'Számlák allokáció'}</ModalTitle>
                <div style={{ marginTop: 4, color:'#6b7280', fontSize: 13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={allocationModal.item?.remittance || allocationModal.item?.comment || ''}>
                  Közlemény: {allocationModal.item?.remittance || allocationModal.item?.comment || '-'}
                </div>
              </div>
              <CloseBtn onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>Bezárás</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {allocationModal.loading ? (
                <div>Betöltés…</div>
              ) : (
                <>
                  <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                    background: '#fff',
                    padding: '8px 0',
                    marginBottom: 10,
                    borderBottom: '1px solid #eee',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    gap:10,
                    flexWrap:'wrap'
                  }}>
                    <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                      <span>{allocationModal.mode === 'incoming' ? 'Kifizetett összeg' : 'Befizetett összeg'}: <strong>{Math.abs(amountNum(allocationModal.item?.amount)).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationModal.item?.currency || ''}</strong></span>
                      <span>Kiválasztott összeg: <strong>{allocationTotal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}</strong></span>
                      <span>Maradvány: <strong>{allocationRemaining.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}</strong></span>
                      <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 13, color:'#374151' }}>
                        <input
                          type="checkbox"
                          checked={!!allocationModal.showAllInvoices}
                          onChange={(e) => openAllocationForItem(allocationModal.hIdx, allocationModal.iIdx, allocationModal.item, {
                            showAllInvoices: e.target.checked,
                            includeExternalInvoices: !!allocationModal.includeExternalInvoices,
                          })}
                        />
                        Minden számla
                      </label>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <CloseBtn onClick={()=>setAllocationModal({ open: false, loading: false, hIdx: null, iIdx: null, item: null, invoices: [], allocations: {} })}>Mégse</CloseBtn>
                      <ImportButton type="button" onClick={applyAllocationModal} disabled={allocationOver > 0.0001}>Alkalmazás</ImportButton>
                    </div>
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={allocationHeaderCellStyle}>
                          {(() => {
                            const _allIds = allocationDisplayInvoices.map(i => i.id);
                            const _checkedCnt = _allIds.filter(id => Math.abs(amountNum(allocationModal.allocations?.[id])) > 0.0001).length;
                            const _allChk = _allIds.length > 0 && _checkedCnt === _allIds.length;
                            const _someChk = _checkedCnt > 0 && _checkedCnt < _allIds.length;
                            return (
                              <input type="checkbox" title="Összes kijelölése / megszüntetése"
                                checked={_allChk}
                                ref={el => { if (el) el.indeterminate = _someChk; }}
                                onChange={() => {
                                  setAllocationModal(prev => {
                                    const prevAllocations = prev.allocations || {};
                                    const hasAnyChecked = (prev.invoices || []).some((inv) => Math.abs(amountNum(prevAllocations?.[inv.id])) > 0.0001);
                                    const next = {};
                                    if (!hasAnyChecked) {
                                      let rem = allocationBudget;
                                      (prev.invoices || []).forEach(inv => {
                                        const ost = amountNum(inv.outstanding);
                                        if (ost < -0.0001) { next[inv.id] = normalizeStornoAllocationValue(inv, ost); }
                                        else {
                                          const ostAbs = Math.abs(ost);
                                          const ostTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                          const allocTxn = Math.min(Math.max(0, ostTxn), Math.max(0, rem));
                                          const alloc = (ostAbs > 0 && ostTxn > 0) ? Math.min(ostAbs, (allocTxn * ostAbs) / ostTxn) : 0;
                                          if (alloc > 0.0001) { next[inv.id] = normalizeStornoAllocationValue(inv, alloc); rem -= Math.abs(getInvoiceAllocationInTxn(inv, alloc, allocationTxnCurrency)); }
                                        }
                                      });
                                    }
                                    return { ...prev, allocations: next };
                                  });
                                }}
                              />
                            );
                          })()}
                        </th>
                        <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('invoice_number')}>
                          {allocationModal.mode === 'incoming' ? 'Bejövő számla' : 'Számla'}{allocationSortIndicator('invoice_number')}
                        </th>
                        <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('partner')}>
                          Partner{allocationSortIndicator('partner')}
                        </th>
                        <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('due_date')}>
                          Esedékes{allocationSortIndicator('due_date')}
                        </th>
                        <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('outstanding')}>
                          Hátralék{allocationSortIndicator('outstanding')}
                        </th>
                        <th style={{ ...allocationHeaderCellStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAllocationSort('payable')}>
                          Kifizetendő{allocationSortIndicator('payable')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationDisplayInvoices.map((inv) => {
                        const checked = Math.abs(amountNum(allocationModal.allocations?.[inv.id])) > 0.0001;
                        const allocVal = checked ? normalizeStornoAllocationValue(inv, allocationModal.allocations?.[inv.id]) : 0;
                        const outstandingVal = amountNum(inv.outstanding);
                        const invCurrency = normalizeCurrency(inv?.currency || allocationTxnCurrency);
                        const outstandingTxnVal = getInvoiceOutstandingInTxn(inv, allocationTxnCurrency);
                        const allocTxnVal = getInvoiceAllocationInTxn(inv, allocVal, allocationTxnCurrency);
                        const useTxnInput = allocationTxnCurrency === 'HUF' && (invCurrency === 'HUF' || amountNum(inv?.gross_amount_huf) > 0.0001);
                        const inputValue = useTxnInput
                          ? (Math.abs(allocVal) > 0.0001 ? allocTxnVal.toFixed(2) : '')
                          : (Math.abs(allocVal) > 0.0001 ? allocVal.toFixed(2) : '');
                        const inputMin = useTxnInput
                          ? (outstandingVal < -0.0001 ? -Math.abs(outstandingTxnVal) : 0)
                          : (outstandingVal < -0.0001 ? outstandingVal : 0);
                        const inputMax = useTxnInput
                          ? (outstandingVal > 0.0001 ? Math.abs(outstandingTxnVal) : 0)
                          : (outstandingVal > 0.0001 ? outstandingVal : 0);
                        const conversionHint = (() => {
                          if (allocationTxnCurrency !== 'HUF' || invCurrency === 'HUF') return null;
                          if (amountNum(inv?.gross_amount_huf) > 0.0001) return 'grossAmountHUF alapján';
                          if (inv?._impliedRate) return 'becsült árfolyam alapján';
                          if (amountNum(inv?.exchange_rate) > 0.0001) return 'árfolyam alapján';
                          return null;
                        })();
                        const stornoLinked = !!(inv?.is_storno_linked || inv?.is_storno_invoice || inv?.is_storno_original);
                        const remainingAfterAlloc = outstandingVal >= 0
                          ? Math.max(0, outstandingVal - allocVal)
                          : Math.min(0, outstandingVal - allocVal);
                        return (
                          <tr key={inv.id} style={stornoLinked ? { background: '#fee2e2' } : undefined}>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e)=>{
                                  setAllocationModal(prev => {
                                    const next = { ...(prev.allocations || {}) };
                                    if (!e.target.checked) {
                                      delete next[inv.id];
                                    } else {
                                      const used = Object.entries(next).reduce((sum, [k, v]) => {
                                        if (String(k) === String(inv.id)) return sum;
                                        const selectedInv = (prev.invoices || []).find((row) => String(row?.id) === String(k));
                                        return sum + getInvoiceAllocationInTxn(selectedInv, v, allocationTxnCurrency);
                                      }, 0);
                                      const outstanding = amountNum(inv.outstanding);
                                      if (outstanding < -0.0001) {
                                        next[inv.id] = outstanding;
                                      } else {
                                        const available = Math.max(0, allocationBudget - used);
                                        const outstandingAbs = Math.abs(outstanding);
                                        const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                        const maxByBudget = (outstandingAbs > 0 && outstandingTxn > 0)
                                          ? (available * outstandingAbs) / outstandingTxn
                                          : available;
                                        next[inv.id] = normalizeStornoAllocationValue(inv, Math.min(Math.max(0, outstanding), maxByBudget));
                                      }
                                    }
                                    return { ...prev, allocations: next };
                                  });
                                }}
                              />
                            </td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                              <div>{inv.invoice_number}</div>
                              <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>
                                {inv?.invoice_type === 'incoming' ? 'Bejövő' : 'Kimenő'}
                              </div>
                              {inv.match_reason === 'remittance' && (
                                <div style={{ marginTop: 2, fontSize: 11, color: '#1e824c' }}>Közlemény találat</div>
                              )}
                              {inv.match_reason === 'amount' && (
                                <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>Összeg találat</div>
                              )}
                            </td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{inv.customer_name || inv.supplier_name || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>{inv.due_date || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                              <div>{amountNum(inv.outstanding).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency}</div>
                              {invCurrency !== allocationTxnCurrency && (
                                <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>
                                  ≈ {outstandingTxnVal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}
                                </div>
                              )}
                              {conversionHint && (
                                <div style={{ marginTop: 2, fontSize: 12, color: '#0369a1' }}>
                                  Számítás: {conversionHint}
                                </div>
                              )}
                                {checked && Math.abs(allocVal) > 0.0001 && (
                                <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>
                                  Fennmaradó: {remainingAfterAlloc.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency}
                                </div>
                              )}
                            </td>
                            <td style={{ padding:6, borderBottom:'1px solid #f4f4f4' }}>
                              {checked && (
                                <>
                                  <input
                                    type="number"
                                    step="0.01"
                                      min={inputMin}
                                      max={inputMax}
                                    value={inputValue}
                                    onChange={(e)=>{
                                      const raw = e.target.value;
                                      setAllocationModal(prev => {
                                        const current = { ...(prev.allocations || {}) };
                                        const numericRawInput = amountNum(raw);
                                        const outstanding = amountNum(inv.outstanding);
                                        const usedWithoutCurrent = Object.entries(current).reduce((sum, [k, v]) => {
                                          if (String(k) === String(inv.id)) return sum;
                                          const selectedInv = (prev.invoices || []).find((row) => String(row?.id) === String(k));
                                          return sum + getInvoiceAllocationInTxn(selectedInv, v, allocationTxnCurrency);
                                        }, 0);
                                        const budgetCapTxn = Math.max(0, allocationBudget - usedWithoutCurrent);
                                        const outstandingAbs = Math.abs(outstanding);
                                        const outstandingTxn = Math.abs(getInvoiceOutstandingInTxn(inv, allocationTxnCurrency));
                                        const numericRaw = useTxnInput
                                          ? ((outstandingAbs > 0 && outstandingTxn > 0)
                                            ? (numericRawInput * outstandingAbs) / outstandingTxn
                                            : numericRawInput)
                                          : numericRawInput;
                                        const budgetCap = (outstandingAbs > 0 && outstandingTxn > 0)
                                          ? (budgetCapTxn * outstandingAbs) / outstandingTxn
                                          : budgetCapTxn;
                                        let finalVal = 0;
                                        if (outstanding < -0.0001) {
                                          finalVal = Math.min(0, Math.max(outstanding, numericRaw));
                                        } else {
                                          finalVal = Math.min(Math.max(0, numericRaw), Math.max(0, outstanding), budgetCap);
                                        }
                                        current[inv.id] = normalizeStornoAllocationValue(inv, Math.round(finalVal * 100) / 100);
                                        return { ...prev, allocations: current };
                                      });
                                    }}
                                    style={{ padding: 6, width: 140 }}
                                  />
                                  <div style={{ marginTop: 2, fontSize: 12, color: Math.abs(allocVal) > 0.0001 ? '#1e824c' : '#6b7280' }}>
                                    Végleges kifizetés: {getInvoiceAllocationInTxn(inv, allocVal, allocationTxnCurrency).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {allocationTxnCurrency}
                                    {invCurrency !== allocationTxnCurrency && (
                                      <span> (eredeti: {allocVal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {invCurrency})</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {allocationOver > 0.0001 && (
                    <div style={{ marginTop: 8, display:'flex', alignItems:'center', gap:6, color:'#b42318', fontWeight:600 }}>
                      <AlertCircle size={16} />
                      Túlallokálás: {allocationOver.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default BankStatements;
