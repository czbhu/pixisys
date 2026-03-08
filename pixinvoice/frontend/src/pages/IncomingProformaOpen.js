import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Save, ArrowLeft, Upload, Trash2, Plus, Search, ExternalLink, FileText, X, MessageSquare } from 'lucide-react';
import ReactQuill from 'react-quill';
import ReactSelect from 'react-select';
import 'react-quill/dist/quill.snow.css';
import { incomingProformaAPI, customerAPI, currencyAPI, utilsAPI } from '../services/api';

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

const InlineHeaderGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  @media (max-width: 768px) {
    flex-wrap: wrap;
    width: 100%;
  }
`;

const CompactField = styled.div`
  min-width: 180px;
  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
  }
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

const InlineGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(44, 62, 80, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
`;

const ModalCard = styled.div`
  width: min(980px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  padding: 20px;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const ModalTitle = styled.h3`
  margin: 0;
  color: #2c3e50;
`;

const ModalHint = styled.p`
  margin: 0 0 12px 0;
  color: #6b7280;
  font-size: 13px;
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

const ItemsSection = styled.div`
  margin-top: 24px;
`;

const ItemsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const AddItemButton = styled(Button)`
  background-color: #27ae60;
`;

const ItemsTableWrap = styled.div`
  overflow-x: auto;
`;

const ItemsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
`;

const TableHeader = styled.thead`
  background-color: #f8f9fa;
`;

const TableHeaderCell = styled.th`
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover {
    background-color: #f8f9fa;
  }
`;

const TableCell = styled.td`
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;
  vertical-align: top;
`;

const ItemInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
`;

const SmallInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  box-sizing: border-box;
`;

const DeleteButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: #e74c3c;
  color: white;
  cursor: pointer;
`;

const IconGhostButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: #6c757d;
  color: white;
  cursor: pointer;
`;

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABELS = { unpaid: 'Kifizetetlen', paid: 'Kifizetett', invoiced: 'Kiszámlázott' };
const PM_LABELS = { TRANSFER: 'Átutalás', CASH: 'Készpénz', CARD: 'Bankkártya', VOUCHER: 'Utalvány', UTANVET: 'Utánvét', OTHER: 'Egyéb' };
const DOC_TYPES = { IMAGE: 'Számlakép', OTHER: 'Egyéb', CONTRACT: 'Szerződés', SUPPLIER: 'Szállító', PERFORMANCE_CERT: 'Teljesítés igazolás' };

const normalize = (str) => (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const parseDecimal = (value) => {
  const normalized = String(value ?? '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const digitsOnly = (value) => String(value || '').replace(/\D+/g, '');

const normName = (value) => normalize(value || '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const findSupplierCandidate = (rows, parsed) => {
  const list = Array.isArray(rows) ? rows : [];
  const parsedTax = digitsOnly(parsed?.supplier_tax_number);
  const parsedName = normName(parsed?.supplier_name || parsed?.matched_supplier_name);

  if (parsed?.matched_supplier_id) {
    const byId = list.find((cust) => String(cust?.id) === String(parsed.matched_supplier_id));
    if (byId) return byId;
  }

  if (parsedTax) {
    const byTax = list.find((cust) => {
      const cTax = digitsOnly(cust?.tax_number || cust?.full_tax_number || cust?.eu_tax_number || cust?.vat_group_member_tax_number);
      if (!cTax) return false;
      return cTax === parsedTax || cTax.startsWith(parsedTax.slice(0, 8)) || parsedTax.startsWith(cTax.slice(0, 8));
    });
    if (byTax) return byTax;
  }

  if (parsedName) {
    const exactName = list.find((cust) => normName(cust?.name) === parsedName);
    if (exactName) return exactName;
    const containsName = list.find((cust) => {
      const cName = normName(cust?.name);
      return cName && parsedName.length >= 4 && (cName.includes(parsedName) || parsedName.includes(cName));
    });
    if (containsName) return containsName;
  }

  return null;
};

const normalizeInput = (e) => {
  if (e && e.target && typeof e.target.value === 'string') {
    e.target.value = e.target.value.replace(',', '.');
  }
};

const selectAll = (e) => {
  const el = e?.target;
  if (el && typeof el.select === 'function') {
    requestAnimationFrame(() => {
      try { el.select(); } catch {}
    });
  }
};

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
  const [customerRows, setCustomerRows] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [ocrDebug, setOcrDebug] = useState(null);
  const [availableCurrencies, setAvailableCurrencies] = useState([]);
  const [items, setItems] = useState([
    {
      description: '',
      product_code_value: '',
      quantity: 1,
      unit_of_measure: 'db',
      vat_rate: 27,
      unit_price: 0,
      unit_price_str: '',
      gross_unit_price_str: '',
      net_total_str: '',
      gross_total_str: '',
    },
  ]);

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

  const fetchAllSuppliers = useCallback(async (searchTerm = '', supplierOnly = true) => {
    const collected = [];
    const seen = new Set();
    let page = 1;
    let guard = 0;
    while (guard < 100) {
      guard += 1;
      const res = await customerAPI.getCustomers({
        page,
        page_size: 500,
        type: supplierOnly ? 'supplier' : undefined,
        search: searchTerm || undefined,
      });
      const payload = res.data;
      const rows = Array.isArray(payload?.results) ? payload.results : (Array.isArray(payload) ? payload : []);
      rows.forEach((row) => {
        const id = String(row?.id || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        collected.push(row);
      });
      if (!payload?.next || !Array.isArray(payload?.results) || rows.length === 0) break;
      page += 1;
    }
    return collected;
  }, []);

  useEffect(() => {
    setCustomersLoading(true);
    fetchAllSuppliers()
      .then((rows) => setCustomerRows(rows))
      .catch(() => {})
      .finally(() => setCustomersLoading(false));
  }, [fetchAllSuppliers]);

  useEffect(() => {
    currencyAPI.getCurrencies({ page_size: 200 }).then((res) => {
      setAvailableCurrencies(res.data?.results || res.data || []);
    }).catch(() => {});
  }, []);

  const customerOptions = [...customerRows]
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'hu-HU', { sensitivity: 'base' }))
    .map((c) => ({
      value: c.id,
      label: `${c.name} (${c.tax_number || c.full_tax_number || '-'})`,
      data: { ...c, _norm: normalize(`${c.name} ${c.tax_number || ''}`) },
    }));

  const currencyOptions = (availableCurrencies && availableCurrencies.length > 0)
    ? availableCurrencies.filter(c => c.is_active !== false).map(c => ({ value: c.code, label: `${c.code} - ${c.name}` }))
    : [{ value: 'HUF', label: 'HUF' }, { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }];

  useEffect(() => {
    const cur = form.currency;
    const dateVal = form.issue_date;
    if (!cur || cur === 'HUF') {
      if (String(form.exchange_rate) !== '1') setF('exchange_rate', '1');
      return;
    }
    const dateStr = dateVal || new Date().toISOString().split('T')[0];
    utilsAPI.getExchangeRate(cur, dateStr)
      .then((res) => {
        if (res.data?.rate) {
          setF('exchange_rate', String(res.data.rate));
        }
      })
      .catch(() => {});
  }, [form.currency, form.issue_date]);

  const handleSupplierChange = (opt) => {
    const supplier = opt?.data;
    setSelectedSupplierId(opt?.value || '');
    setF('supplier_name', supplier?.name || '');
    setF('supplier_tax_number', supplier?.tax_number || supplier?.full_tax_number || '');
  };

  const resolveSupplierIdFromForm = useCallback(() => {
    if (selectedSupplierId) return String(selectedSupplierId);
    const candidate = findSupplierCandidate(customerRows, {
      supplier_tax_number: form.supplier_tax_number,
      supplier_name: form.supplier_name,
    });
    return candidate?.id ? String(candidate.id) : '';
  }, [selectedSupplierId, customerRows, form.supplier_tax_number, form.supplier_name]);

  useEffect(() => {
    if (selectedSupplierId) return;
    if (!form.supplier_name && !form.supplier_tax_number) return;
    const resolvedId = resolveSupplierIdFromForm();
    if (resolvedId) setSelectedSupplierId(resolvedId);
  }, [selectedSupplierId, form.supplier_name, form.supplier_tax_number, resolveSupplierIdFromForm]);

  const calculateItemTotals = (item) => {
    const quantity = Number(item.quantity || 0);
    const netUnit = Number(item.unit_price || 0);
    const vatRate = Number(item.vat_rate || 0);
    const netAmount = quantity * netUnit;
    const vatAmount = netAmount * (vatRate / 100);
    const grossAmount = netAmount + vatAmount;
    return { netAmount, vatAmount, grossAmount };
  };

  const calculatedSummary = items.reduce((acc, item) => {
    const row = calculateItemTotals(item);
    acc.net += row.netAmount;
    acc.vat += row.vatAmount;
    acc.gross += row.grossAmount;
    return acc;
  }, { net: 0, vat: 0, gross: 0 });

  const vatBreakdownMap = items.reduce((acc, item) => {
    const row = calculateItemTotals(item);
    const key = `${Number(item.vat_rate || 0)}%`;
    if (!acc[key]) acc[key] = { net: 0, vat: 0, gross: 0 };
    acc[key].net += row.netAmount;
    acc[key].vat += row.vatAmount;
    acc[key].gross += row.grossAmount;
    return acc;
  }, {});

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
  };

  const getItemDisplay = (item, stringKey, fallback) => {
    const raw = item?.[stringKey];
    if (raw !== undefined && raw !== null && raw !== '') return raw;
    return fallback;
  };

  const handleItemQuantityChange = (index, value) => {
    updateItem(index, { quantity: value, net_total_str: '', gross_total_str: '' });
  };

  const handleItemVatRateChange = (index, value) => {
    updateItem(index, { vat_rate: value, gross_unit_price_str: '', net_total_str: '', gross_total_str: '' });
  };

  const handleNetUnitPriceChange = (index, value) => {
    updateItem(index, {
      unit_price: parseDecimal(value),
      unit_price_str: value,
      gross_unit_price_str: '',
      net_total_str: '',
      gross_total_str: '',
    });
  };

  const handleGrossUnitPriceChange = (index, value) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== index) return item;
      const gross = parseDecimal(value);
      const vatRate = parseDecimal(item.vat_rate);
      const divisor = 1 + (vatRate / 100);
      const netUnit = divisor > 0 ? gross / divisor : gross;
      return {
        ...item,
        unit_price: Number(netUnit.toFixed(2)),
        unit_price_str: '',
        gross_unit_price_str: value,
        net_total_str: '',
        gross_total_str: '',
      };
    }));
  };

  const handleNetTotalChange = (index, value) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== index) return item;
      const netTotal = parseDecimal(value);
      const quantity = parseDecimal(item.quantity) || 1;
      const netUnit = netTotal / quantity;
      return {
        ...item,
        unit_price: Number(netUnit.toFixed(2)),
        unit_price_str: '',
        gross_unit_price_str: '',
        net_total_str: value,
        gross_total_str: '',
      };
    }));
  };

  const handleGrossTotalChange = (index, value) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== index) return item;
      const grossTotal = parseDecimal(value);
      const vatRate = parseDecimal(item.vat_rate);
      const quantity = parseDecimal(item.quantity) || 1;
      const divisor = 1 + (vatRate / 100);
      const netTotal = divisor > 0 ? grossTotal / divisor : grossTotal;
      const netUnit = netTotal / quantity;
      return {
        ...item,
        unit_price: Number(netUnit.toFixed(2)),
        unit_price_str: '',
        gross_unit_price_str: '',
        net_total_str: '',
        gross_total_str: value,
      };
    }));
  };

  const formatBufferedItemField = (index, stringKey, fallbackValue) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== index) return item;
      const raw = item?.[stringKey];
      if (raw === undefined || raw === null || raw === '') {
        return { ...item, [stringKey]: '' };
      }
      const formatted = parseDecimal(raw || fallbackValue).toFixed(2);
      return { ...item, [stringKey]: formatted };
    }));
  };

  const addItem = () => {
    setItems((prev) => ([...prev, {
      description: '',
      product_code_value: '',
      quantity: 1,
      unit_of_measure: 'db',
      vat_rate: 27,
      unit_price: 0,
      unit_price_str: '',
      gross_unit_price_str: '',
      net_total_str: '',
      gross_total_str: '',
    }]));
  };

  const duplicateItem = (index) => {
    setItems((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { ...prev[index] });
      return next;
    });
  };

  const removeItem = (index) => {
    setItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev);
  };

  // ── Invoice link search state ───────────────────────────────────────────
  const [showLinkSearch, setShowLinkSearch] = useState(false);
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
  const [pendingOCRFile, setPendingOCRFile] = useState(null);

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

      const loadedGross = parseNullableNumber(d.gross_amount);
      const loadedNet = parseNullableNumber(d.net_amount);
      const loadedVat = parseNullableNumber(d.vat_amount);
      const hasLoadedAmount = (loadedGross && loadedGross > 0) || (loadedNet && loadedNet > 0);
      if (hasLoadedAmount) {
        let loadedVatRate = 0;
        if (loadedNet && loadedNet > 0 && loadedVat && loadedVat >= 0) {
          loadedVatRate = Math.round((loadedVat / loadedNet) * 10000) / 100;
        }
        const baseNet = (loadedNet && loadedNet > 0)
          ? loadedNet
          : ((loadedGross && loadedGross > 0)
            ? (loadedVatRate > 0 ? loadedGross / (1 + (loadedVatRate / 100)) : loadedGross)
            : 0);
        const loadedDesc = `${d.supplier_name ? `${d.supplier_name} - ` : ''}Díjbekérő ${d.proforma_number || ''}`.trim();
        setItems([{
          description: loadedDesc || 'Díjbekérő tétel',
          product_code_value: '',
          quantity: 1,
          unit_of_measure: 'db',
          vat_rate: loadedVatRate,
          unit_price: Math.round(baseNet * 100) / 100,
          unit_price_str: String(Math.round(baseNet * 100) / 100),
          gross_unit_price_str: '',
          net_total_str: '',
          gross_total_str: loadedGross != null ? String(loadedGross) : '',
        }]);
      }
      const matchedSupplier = customerRows.find((cust) => String(cust.tax_number || cust.full_tax_number || '') === String(d.supplier_tax_number || ''));
      if (matchedSupplier?.id) setSelectedSupplierId(matchedSupplier.id);
    } catch {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [proformaId, companyId]);

  useEffect(() => { loadProforma(); }, [loadProforma]);

  const attachOCRSourceDocument = useCallback(async (targetProformaId, file) => {
    if (!targetProformaId || !file) return;
    try {
      await incomingProformaAPI.uploadDocument(companyId, targetProformaId, file, 'IMAGE', 'díjbekérő');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || 'Az OCR forrásfájl nem került feltöltésre automatikusan.';
      toast.warning(msg);
    }
  }, [companyId]);

  // ── OCR parse ───────────────────────────────────────────────────────────
  const handleOCR = async (file) => {
    if (!file) return;
    setParsing(true);
    setPendingOCRFile(file);
    try {
      const res = await incomingProformaAPI.parseDocument(companyId, file);
      const f = res.data?.data || res.data?.fields || {};
      setOcrDebug(f || {});
      setForm(prev => ({
        ...prev,
        proforma_number: f.proforma_number || f.invoice_number || prev.proforma_number,
        supplier_tax_number: f.supplier_tax_number || prev.supplier_tax_number,
        supplier_name: f.supplier_name || prev.supplier_name,
        issue_date: f.issue_date || prev.issue_date,
        due_date: f.due_date || prev.due_date,
        net_amount: f.net_amount != null ? String(f.net_amount) : (f.net_total != null ? String(f.net_total) : prev.net_amount),
        vat_amount: f.vat_amount != null ? String(f.vat_amount) : (f.vat_total != null ? String(f.vat_total) : prev.vat_amount),
        gross_amount: f.gross_amount != null ? String(f.gross_amount) : (f.gross_total != null ? String(f.gross_total) : prev.gross_amount),
        currency: (f.currency || prev.currency || 'HUF').toUpperCase(),
        payment_method: String(f.payment_method || prev.payment_method || 'TRANSFER').toUpperCase(),
      }));

      const suggestedRate = Number.isFinite(Number(f.suggested_vat_rate)) ? Number(f.suggested_vat_rate) : null;
      const gross = parseNullableNumber(f.gross_total ?? f.gross_amount);
      const net = parseNullableNumber(f.net_total ?? f.net_amount);
      const vat = parseNullableNumber(f.vat_total ?? f.vat_amount);
      const hasAmount = (gross && gross > 0) || (net && net > 0);
      if (hasAmount) {
        let vatRate = 0;
        if (suggestedRate !== null && suggestedRate >= 0) {
          vatRate = suggestedRate;
        }
        let baseNet = (net && net > 0) ? net : null;
        if (net && net > 0 && vat && vat >= 0) {
          const rawRate = (vat / net) * 100;
          const knownRates = [0, 5, 18, 20, 27];
          const nearest = knownRates.reduce((best, curr) => (Math.abs(curr - rawRate) < Math.abs(best - rawRate) ? curr : best), knownRates[0]);
          const inferredRate = Math.abs(nearest - rawRate) <= 2 ? nearest : Math.round(rawRate * 100) / 100;
          if (suggestedRate === null || suggestedRate < 0) {
            vatRate = inferredRate;
          }
        }
        if ((baseNet === null || baseNet <= 0) && gross && gross > 0) {
          baseNet = vatRate > 0 ? gross / (1 + (vatRate / 100)) : gross;
        }
        if (baseNet === null || !Number.isFinite(baseNet)) {
          baseNet = gross || 0;
        }
        const supplierLabel = String(f.supplier_name || f.matched_supplier_name || '').trim();
        const desc = `${supplierLabel ? `${supplierLabel} - ` : ''}Díjbekérő ${f.proforma_number || f.invoice_number || ''}`.trim();
        // OCR tételsorokat nem veszünk át: mindig 1 összesített sort hozunk létre.
        setItems([{
          description: desc || 'Díjbekérő tétel',
          product_code_value: '',
          quantity: 1,
          unit_of_measure: 'db',
          vat_rate: vatRate,
          unit_price: Math.round(baseNet * 100) / 100,
          unit_price_str: String(Math.round(baseNet * 100) / 100),
          gross_unit_price_str: '',
          net_total_str: '',
          gross_total_str: gross != null ? String(gross) : '',
        }]);
      }

      let supplierCandidate = findSupplierCandidate(customerRows, f);
      if (!supplierCandidate) {
        const query = (f.supplier_tax_number || f.supplier_name || f.matched_supplier_name || '').trim();
        if (query) {
          try {
            const fetched = await fetchAllSuppliers(query, true);
            if (Array.isArray(fetched) && fetched.length > 0) {
              setCustomerRows((prev) => {
                const byId = new Map((prev || []).map((x) => [String(x.id), x]));
                fetched.forEach((x) => byId.set(String(x.id), x));
                return Array.from(byId.values());
              });
              supplierCandidate = findSupplierCandidate(fetched, f) || findSupplierCandidate([...(customerRows || []), ...fetched], f);
            }
            if (!supplierCandidate) {
              const fetchedAll = await fetchAllSuppliers(query, false);
              if (Array.isArray(fetchedAll) && fetchedAll.length > 0) {
                setCustomerRows((prev) => {
                  const byId = new Map((prev || []).map((x) => [String(x.id), x]));
                  fetchedAll.forEach((x) => byId.set(String(x.id), x));
                  return Array.from(byId.values());
                });
                supplierCandidate = findSupplierCandidate(fetchedAll, f) || findSupplierCandidate([...(customerRows || []), ...fetchedAll], f);
              }
            }
          } catch {
            // Keep OCR flow resilient even if supplier lookup request fails
          }
        }
      }

      if (supplierCandidate?.id) {
        setSelectedSupplierId(String(supplierCandidate.id));
        setF('supplier_name', supplierCandidate.name || f.supplier_name || '');
        setF('supplier_tax_number', supplierCandidate.tax_number || supplierCandidate.full_tax_number || f.supplier_tax_number || '');
      } else if (f.matched_supplier_id) {
        setCustomerRows((prev) => {
          const id = String(f.matched_supplier_id);
          if ((prev || []).some((x) => String(x?.id) === id)) return prev;
          return [
            {
              id,
              name: f.matched_supplier_name || f.supplier_name || `CRM partner (${id})`,
              tax_number: f.supplier_tax_number || '',
              full_tax_number: f.supplier_tax_number || '',
              is_supplier: true,
            },
            ...(prev || []),
          ];
        });
        setSelectedSupplierId(String(f.matched_supplier_id));
        setF('supplier_name', f.matched_supplier_name || f.supplier_name || '');
        setF('supplier_tax_number', f.supplier_tax_number || '');
      } else if (f.supplier_name || f.supplier_tax_number) {
        toast.warning(`Szállító OCR alapján: ${f.supplier_name || '-'} / ${f.supplier_tax_number || '-'}, de CRM egyezés nem található.`);
      }

      if (!isNew && proformaId) {
        await attachOCRSourceDocument(proformaId, file);
        await loadProforma();
      }

      toast.success('OCR feldolgozva');
    } catch (e) {
      setOcrDebug(null);
      const msg = e?.response?.data?.error || e?.response?.data?.detail || 'OCR hiba';
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.proforma_number.trim()) { toast.error('Díjbekérő száma kötelező'); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        ...form,
        net_amount: calculatedSummary.net,
        vat_amount: calculatedSummary.vat,
        gross_amount: calculatedSummary.gross,
      };
      if (isNew) {
        const res = await incomingProformaAPI.create(payload);
        if (pendingOCRFile) {
          await attachOCRSourceDocument(res.data.id, pendingOCRFile);
          setPendingOCRFile(null);
        }
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
  const closeLinkModal = () => {
    setShowLinkSearch(false);
    setSelectedInvoice(null);
    setSuggestions([]);
    setLinkSearchNum('');
  };

  const openLinkModal = async () => {
    const effectiveSupplierId = resolveSupplierIdFromForm();
    if (!effectiveSupplierId) {
      toast.error('Előbb válassz szállítót a CRM partnerlistából.');
      return;
    }
    if (String(selectedSupplierId) !== String(effectiveSupplierId)) {
      setSelectedSupplierId(effectiveSupplierId);
    }
    setShowLinkSearch(true);
    setSelectedInvoice(null);
    setSuggestions([]);
    setLinkSearchNum('');
    await doLinkSearch(effectiveSupplierId, '');
  };

  const doLinkSearch = async (forcedSupplierId = null, forcedSearch = null) => {
    const effectiveSupplierId = forcedSupplierId || resolveSupplierIdFromForm();
    if (!effectiveSupplierId) {
      toast.error('A szállító customer_id nem elérhető.');
      return;
    }
    if (String(selectedSupplierId) !== String(effectiveSupplierId)) {
      setSelectedSupplierId(effectiveSupplierId);
    }
    setLinkSearching(true);
    try {
      const res = await incomingProformaAPI.suggestInvoices(
        companyId,
        '',
        forcedSearch !== null ? forcedSearch : linkSearchNum,
        proformaId || null,
        effectiveSupplierId || null,
      );
      setSuggestions(res.data?.suggestions || res.data || []);
    } catch {
      toast.error('Keresési hiba');
    } finally {
      setLinkSearching(false);
    }
  };

  useEffect(() => {
    if (!showLinkSearch) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLinkModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLinkSearch]);

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
        supplier_tax_number: selectedInvoice.supplier_tax_number || form.supplier_tax_number,
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
  const supplierValueOption = customerOptions.find((o) => String(o.value) === String(selectedSupplierId))
    || ((form.supplier_name || form.supplier_tax_number) ? {
      value: selectedSupplierId || `ocr-${digitsOnly(form.supplier_tax_number || form.supplier_name || '') || 'supplier'}`,
      label: `${form.supplier_name || 'OCR szállító'} (${form.supplier_tax_number || '-'})`,
      data: {
        id: selectedSupplierId || null,
        name: form.supplier_name || '',
        tax_number: form.supplier_tax_number || '',
      },
    } : null);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) return <FormContainer><LoadingSpinner>Betöltés…</LoadingSpinner></FormContainer>;

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <FormContainer>
      {/* ── Header — exact same as InvoiceForm ─────────────────────────── */}
      <FormHeader>
        <HeaderLeft>
          <Title>{isNew ? 'Új bejövő díjbekérő' : `Díjbekérő: ${form.proforma_number}`}</Title>
          {isNew && (
            <InlineHeaderGroup>
              <CompactField>
                <Input
                  id="proforma_number"
                  value={form.proforma_number}
                  onChange={e => setF('proforma_number', e.target.value)}
                  placeholder="Díjbekérő szám"
                  style={{ height: 32, padding: '6px 10px' }}
                />
              </CompactField>
            </InlineHeaderGroup>
          )}
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
            <Label>Szállító *</Label>
            <InlineGroup>
              <div style={{ flex: 1 }}>
                <ReactSelect
                  inputId="supplier_id"
                  options={customerOptions}
                  value={supplierValueOption}
                  onChange={handleSupplierChange}
                  placeholder="Keresés név vagy adószám alapján..."
                  isClearable
                  noOptionsMessage={() => customersLoading ? 'Szállítók betöltése...' : 'Nincs találat'}
                  filterOption={(option, rawInput) => {
                    const term = normalize(rawInput);
                    if (!term) return true;
                    const haystack = option?.data?._norm || normalize(option?.label || '');
                    return haystack.includes(term);
                  }}
                  styles={{ container: (base) => ({ ...base, zIndex: 10 }) }}
                />
                {ocrDebug && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#7f8c8d' }}>
                    OCR debug: {ocrDebug.supplier_name || '-'} / {ocrDebug.supplier_tax_number || '-'} / {ocrDebug.matched_supplier_id || '-'}
                  </div>
                )}
                {ocrDebug && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#2c3e50' }}>OCR kinyert mezők (debug)</summary>
                    <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, background: '#f7f7f9', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, maxHeight: 240, overflow: 'auto' }}>
{JSON.stringify(ocrDebug, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <Button type="button" variant="secondary" onClick={() => navigate(`/customers/new?return=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>
                + Új
              </Button>
            </InlineGroup>
          </FormGroup>
          <FormGroup>
            <Label>Kibocsátás dátuma</Label>
            <Input type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Fizetési határidő</Label>
            <Input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
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
            <ReactSelect
              inputId="currency"
              options={currencyOptions}
              value={currencyOptions.find((o) => o.value === form.currency) || { value: form.currency, label: form.currency }}
              onChange={(opt) => setF('currency', opt ? opt.value : 'HUF')}
              isClearable={false}
              isSearchable
            />
          </FormGroup>
          <FormGroup>
            <Label>Árfolyam {form.currency !== 'HUF' ? <span style={{ marginLeft: '10px', fontSize: '0.9em', color: '#666' }}>(1 {form.currency} = {form.exchange_rate} HUF)</span> : null}</Label>
            <Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setF('exchange_rate', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>Megjegyzés</Label>
            <ReactQuill theme="snow" value={form.comment || ''} onChange={(value) => setF('comment', value)} />
          </FormGroup>
        </FormSection>
      </FormGrid>

      <ItemsSection id="items-section">
        <ItemsHeader>
          <SectionTitle>Tételek</SectionTitle>
          <AddItemButton type="button" variant="success" onClick={addItem}>
            <Plus size={16} />
            Tétel hozzáadása
          </AddItemButton>
        </ItemsHeader>

        <ItemsTableWrap>
          <ItemsTable>
            <TableHeader>
              <tr>
                <TableHeaderCell>Név</TableHeaderCell>
                <TableHeaderCell>Cikkszám</TableHeaderCell>
                <TableHeaderCell>Mennyiség</TableHeaderCell>
                <TableHeaderCell>Me. egység</TableHeaderCell>
                <TableHeaderCell>ÁFA %</TableHeaderCell>
                <TableHeaderCell>Nettó egységár</TableHeaderCell>
                <TableHeaderCell>Bruttó egységár</TableHeaderCell>
                <TableHeaderCell>Nettó összeg</TableHeaderCell>
                <TableHeaderCell>ÁFA összeg</TableHeaderCell>
                <TableHeaderCell>Bruttó összeg</TableHeaderCell>
                <TableHeaderCell>Műveletek</TableHeaderCell>
              </tr>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const row = calculateItemTotals(item);
                const grossUnitPrice = Number(item.unit_price || 0) * (1 + Number(item.vat_rate || 0) / 100);
                return (
                  <TableRow key={`item-${index}`}>
                    <TableCell>
                      <TextArea value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Tétel neve / leírása" style={{ minHeight: 40, minWidth: 0 }} />
                    </TableCell>
                    <TableCell>
                      <SmallInput value={item.product_code_value} onChange={(e) => updateItem(index, { product_code_value: e.target.value })} placeholder="Cikkszám (opcionális)" />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="number" value={item.quantity} onChange={(e) => handleItemQuantityChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <ItemInput value={item.unit_of_measure} onChange={(e) => updateItem(index, { unit_of_measure: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="number" value={item.vat_rate} onChange={(e) => handleItemVatRateChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" onInput={normalizeInput} onFocus={selectAll} onDoubleClick={selectAll} onBlur={() => formatBufferedItemField(index, 'unit_price_str', Number(item.unit_price || 0))} value={getItemDisplay(item, 'unit_price_str', String(Number(item.unit_price || 0).toFixed(2)))} onChange={(e) => handleNetUnitPriceChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" onInput={normalizeInput} onFocus={selectAll} onDoubleClick={selectAll} onBlur={() => formatBufferedItemField(index, 'gross_unit_price_str', grossUnitPrice)} value={getItemDisplay(item, 'gross_unit_price_str', grossUnitPrice.toFixed(2))} onChange={(e) => handleGrossUnitPriceChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" onInput={normalizeInput} onFocus={selectAll} onDoubleClick={selectAll} onBlur={() => formatBufferedItemField(index, 'net_total_str', row.netAmount)} value={getItemDisplay(item, 'net_total_str', row.netAmount.toFixed(2))} onChange={(e) => handleNetTotalChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="number" value={row.vatAmount.toFixed(2)} readOnly />
                    </TableCell>
                    <TableCell>
                      <ItemInput type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" onInput={normalizeInput} onFocus={selectAll} onDoubleClick={selectAll} onBlur={() => formatBufferedItemField(index, 'gross_total_str', row.grossAmount)} value={getItemDisplay(item, 'gross_total_str', row.grossAmount.toFixed(2))} onChange={(e) => handleGrossTotalChange(index, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <DeleteButton type="button" onClick={() => removeItem(index)}>
                          <Trash2 size={14} />
                        </DeleteButton>
                        <IconGhostButton type="button" onClick={() => duplicateItem(index)}>
                          <Plus size={14} />
                        </IconGhostButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ItemsTable>
        </ItemsTableWrap>
      </ItemsSection>

      {/* ── Summary section — same layout as InvoiceForm ────────────────── */}
      <SummarySection>
        <SectionTitle>Összesítés</SectionTitle>
        <SummaryRow>
          <span>Nettó összeg</span>
          <span>{calculatedSummary.net.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>ÁFA összeg</span>
          <span>{calculatedSummary.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</span>
        </SummaryRow>
        <SummaryRow>
          <span>Bruttó összeg</span>
          <span>{calculatedSummary.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</span>
        </SummaryRow>

        <SectionTitle style={{ marginTop: 16 }}>ÁFA részletező</SectionTitle>
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
            {Object.keys(vatBreakdownMap).length > 0 ? Object.entries(vatBreakdownMap).map(([key, row]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{row.net.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</td>
                <td>{row.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</td>
                <td>{row.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</td>
              </tr>
            )) : (
              <tr>
                <td>27%</td>
                <td>0,00 {form.currency}</td>
                <td>0,00 {form.currency}</td>
                <td>0,00 {form.currency}</td>
              </tr>
            )}
            <tr>
              <td><strong>Összesen</strong></td>
              <td><strong>{calculatedSummary.net.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</strong></td>
              <td><strong>{calculatedSummary.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</strong></td>
              <td><strong>{calculatedSummary.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.currency}</strong></td>
            </tr>
          </tbody>
        </VatTable>

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
              <Button variant="success" onClick={openLinkModal} style={{ marginTop: 12 }}>
                <Plus size={14} /> Számla hozzáadása
              </Button>
            ) : (
              <ModalBackdrop onClick={closeLinkModal}>
                <ModalCard onClick={(e) => e.stopPropagation()}>
                  <ModalHeader>
                    <ModalTitle>Számla hozzáadása</ModalTitle>
                    <Button variant="secondary" onClick={closeLinkModal} style={{ padding: '6px 10px' }}>
                      <X size={14} /> Bezárás
                    </Button>
                  </ModalHeader>
                  <ModalHint>
                    A rendszer a kiválasztott szállító customer_id alapján listázza a díjbekérő dátumánál újabb bejövő számlákat.
                  </ModalHint>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <Label>Számlaszám</Label>
                      <Input
                        value={linkSearchNum}
                        onChange={e => setLinkSearchNum(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            doLinkSearch();
                          }
                        }}
                        style={{ width: 220 }}
                        placeholder="Opcionális"
                      />
                    </div>
                    <Button variant="primary" onClick={doLinkSearch} disabled={linkSearching} style={{ height: 38 }}>
                      <Search size={14} />{linkSearching ? 'Keresés…' : 'Frissítés'}
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
                        <div style={{ color: '#e67e22', fontSize: 13, fontWeight: 600 }}>Túlallokálás: +{fmt(parseFloat(allocAmount) - remaining)}</div>
                      )}
                      <Button variant="success" onClick={addLink} disabled={addingLink}>
                        {addingLink ? 'Hozzáadás…' : 'Hozzáadás'}
                      </Button>
                    </div>
                  )}

                  {suggestions.length === 0 && !linkSearching && (
                    <div style={{ color: '#7f8c8d', fontSize: 13 }}>Nincs újabb, customer_id szerint egyező bejövő számla.</div>
                  )}
                </ModalCard>
              </ModalBackdrop>
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
