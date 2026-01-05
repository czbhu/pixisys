import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Calculator,
  FileText,
  HelpCircle,
  X
} from 'lucide-react';
import styled from 'styled-components';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../print.css';
import { invoiceAPI, customerAPI, invoiceBlockAPI, companyAPI, companyBankAccountAPI, proformaAPI } from '../services/api';
import ReactSelect from 'react-select';
import CreatableSelect from 'react-select/creatable';
import VAT_RATES from '../utils/vatRates';
import { vatTypesAPI } from '../services/api';
import api, { utilsAPI } from '../services/api';

const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  margin-left: 20px;
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ecf0f1;
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
`;

// Header layout additions
const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const InlineHeaderGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CompactField = styled.div`
  min-width: 180px;
`;

const BankInfoPill = styled.div`
  font-size: 12px;
  color: #2c3e50;
  background: #f8f9fa;
  border: 1px solid #ecf0f1;
  border-radius: 14px;
  padding: 6px 10px;
  white-space: nowrap;
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
`;

const TopLeftGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 720px;
`;

const InvoiceNumberBox = styled.div`
  min-width: 260px;
`;

const InlineGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
  background-color: ${props => {
    switch (props.variant) {
      case 'primary': return '#3498db';
      case 'secondary': return '#6c757d';
      case 'success': return '#27ae60';
      case 'danger': return '#e74c3c';
      default: return '#f8f9fa';
    }
  }};
  color: white;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
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

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
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

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const ErrorMessage = styled.span`
  color: #e74c3c;
  font-size: 12px;
  margin-top: 4px;
  display: block;
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
`;

const ItemInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

const ItemSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

  const SmallInput = styled.input`
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
  `;

const InlineFlex = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IconGhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e1e5e8;
  border-radius: 6px;
  background: #fff;
  color: #6c757d;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: #f8f9fa; color: #2c3e50; border-color: #d5dade; }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalCard = styled.div`
  background: #fff;
  border-radius: 8px;
  width: min(880px, 96vw);
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
  font-weight: 600;
  color: #2c3e50;
`;

const ModalBody = styled.div`
  padding: 16px;
  max-height: 70vh;
  overflow: auto;
`;

const HelpRow = styled.div`
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f4;
`;

const HelpTitle = styled.div`
  font-weight: 600; color: #2c3e50; margin-bottom: 4px;
`;

const HelpMeta = styled.div`
  font-size: 12px; color: #6c757d; margin-bottom: 6px;
`;

const HelpText = styled.div`
  font-size: 14px; color: #34495e; white-space: pre-wrap;
`;

const AddItemButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #27ae60;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #229954;
  }
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #c0392b;
  }
`;

const SummarySection = styled.div`
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-top: 24px;
`;

const VatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  th, td { border-bottom: 1px solid #ecf0f1; padding: 8px; text-align: left; }
  th { background: #f1f3f5; }
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #ddd;

  &:last-child {
    border-bottom: none;
    font-weight: 600;
    font-size: 16px;
    color: #2c3e50;
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

const InvoiceForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || '';
  const isReadOnly = mode === 'view';
  const isProforma = location.pathname.startsWith('/proformas');
  const copyFrom = params.get('copy_from') || '';
  const fromProforma = params.get('from_proforma') || '';
  const isAdvanceFromProforma = params.get('advance') === '1';
  const correctFrom = params.get('correct_from') || '';
  const stornoFrom = params.get('storno_from') || '';
  const autoPrint = params.get('print') === '1';
  const isStornoCreation = !isEdit && Boolean(stornoFrom);

  // Initialize form hooks before using watch/setValue anywhere below
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      items: [{ description: '', quantity: 1, unit_price: 0, vat_rate: 27, unit_of_measure: 'db' }],
      issue_date: new Date(),
      payment_method: 'transfer',
      invoice_category: 'SIMPLIFIED',
      invoice_appearance: 'ELECTRONIC',
      completeness_indicator: false,
      currency: 'HUF',
      exchange_rate: 1,
    },
  });

  const { data: customers, isLoading: customersLoading } = useQuery(
    'customers',
    () => customerAPI.getCustomers({ page_size: 1000 }),
    { select: (res) => res.data }
  );

  const { data: companies } = useQuery(
    ['companies', { is_active: true }],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data }
  );

  const selectedCompanyId = watch('company_id');

  // Remember last selected company
  React.useEffect(() => {
    const cid = selectedCompanyId;
    try { if (cid) localStorage.setItem('selectedCompanyId', cid); } catch {}
  }, [selectedCompanyId]);

  const { data: invoiceBlocks } = useQuery(
    ['invoice-blocks', { is_active: true, company_id: selectedCompanyId }],
    () => invoiceBlockAPI.getInvoiceBlocks({ is_active: true, company_id: selectedCompanyId }),
    { enabled: !!selectedCompanyId && !isProforma, select: (res) => res.data }
  );

  // Fetch primary bank account of selected company for display
  const { data: companyBankAccounts } = useQuery(
    ['company-bank-accounts', { company_id: selectedCompanyId }],
    () => selectedCompanyId ? companyBankAccountAPI.getAccounts({ company_id: selectedCompanyId }) : Promise.resolve({ data: { results: [] } }),
    { enabled: !!selectedCompanyId, select: (res) => res.data?.results || res.data || [] }
  );
  const primaryCompanyBank = (companyBankAccounts || []).find(a => a.is_primary) || (companyBankAccounts || [])[0];

  // Default selections for new invoice: use last selected company from localStorage if available,
  // otherwise first active company; then default first active block for that company
  React.useEffect(() => {
    if (isEdit || !companies?.results?.length) return;
    const STORAGE_KEY = 'selectedCompanyId';
    let storedId = null;
    try { storedId = localStorage.getItem(STORAGE_KEY); } catch {}
    if (storedId && companies.results.some(c => c.id === storedId)) {
      if (!selectedCompanyId) setValue('company_id', storedId);
    } else if (!selectedCompanyId) {
      setValue('company_id', companies.results[0].id);
    }
  }, [isEdit, companies, selectedCompanyId, setValue]);

  React.useEffect(() => {
    const currentBlock = watch('invoice_block_id');
    if (!isProforma && !isEdit && invoiceBlocks?.results?.length && !currentBlock) {
      setValue('invoice_block_id', invoiceBlocks.results[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, invoiceBlocks]);

  // Set invoice appearance from selected block
  React.useEffect(() => {
    const currentBlockId = watch('invoice_block_id');
    const blocks = invoiceBlocks?.results || [];
    if (isProforma || !currentBlockId) return;
    const blk = blocks.find(b => b.id === currentBlockId);
    if (blk && blk.invoice_appearance) {
      setValue('invoice_appearance', blk.invoice_appearance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_block_id'), invoiceBlocks]);

  const { data: invoice, isLoading: invoiceLoading } = useQuery(
    ['invoice', id],
    () => invoiceAPI.getInvoice(id),
    {
      enabled: isEdit,
      select: (res) => res.data,
      refetchOnMount: 'always',
      staleTime: 0,
      onSuccess: (inv) => {
        try {
          // In read-only mode always hydrate from server
          if (!isReadOnly && hasDraftRef.current) return;
          setValue('invoice_number', inv.invoice_number || '');
          if (inv.customer && inv.customer.id) setValue('customer_id', inv.customer.id);
          if (inv.issue_date) setValue('issue_date', new Date(inv.issue_date));
          if (inv.due_date) setValue('due_date', new Date(inv.due_date));
          setValue('delivery_date', inv.delivery_date ? new Date(inv.delivery_date) : null);
          if (inv.currency) setValue('currency', inv.currency);
          if (typeof inv.exchange_rate !== 'undefined') setValue('exchange_rate', inv.exchange_rate);
          setValue('notes', inv.notes || '');
          if (Array.isArray(inv.items) && inv.items.length) {
            setValue('items', inv.items.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              vat_rate: item.vat_rate,
              unit_of_measure: item.unit_of_measure || 'db',
              nature_indicator: item.nature_indicator || 'PRODUCT',
            })));
          }
        } catch {}
      }
    }
  );

  // Prefill from proforma
  useEffect(() => {
    if (!fromProforma || isEdit) return;
    (async () => {
      try {
        const { proformaAPI } = await import('../services/api');
        const res = await proformaAPI.getProforma(fromProforma);
        const pf = res.data;
        if (!pf) return;
        if (pf.company && pf.company.id) setValue('company_id', pf.company.id);
        if (pf.customer && pf.customer.id) setValue('customer_id', pf.customer.id);
        if (pf.issue_date) setValue('issue_date', new Date(pf.issue_date));
        if (pf.due_date) setValue('due_date', new Date(pf.due_date));
        setValue('payment_method', pf.payment_method || 'transfer');
        setValue('invoice_category', isAdvanceFromProforma ? 'ADVANCE' : 'SIMPLIFIED');
        setValue('order_reference', pf.proforma_number);
        if (Array.isArray(pf.items) && pf.items.length) {
          const mapped = pf.items.map(it => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            unit_of_measure: it.unit_of_measure || 'db',
            nature_indicator: it.nature_indicator || 'PRODUCT',
          }));
          setValue('items', mapped);
        }
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromProforma, isAdvanceFromProforma, isEdit]);

  const { data: baseInvoice } = useQuery(
    ['invoice_base', copyFrom || correctFrom || stornoFrom],
    () => invoiceAPI.getInvoice(copyFrom || correctFrom || stornoFrom),
    {
      enabled: !isEdit && Boolean(copyFrom || correctFrom || stornoFrom),
      select: (res) => res.data,
      refetchOnMount: 'always',
      staleTime: 0,
      onSuccess: (base) => {
        try {
          if (base && base.company && base.company.id) setValue('company_id', base.company.id);
          if (base && base.customer && base.customer.id) setValue('customer_id', base.customer.id);
          const today = new Date();
          setValue('issue_date', today);
          setValue('delivery_date', today);
          if (base && base.currency) setValue('currency', base.currency);
          if (base && typeof base.exchange_rate !== 'undefined') setValue('exchange_rate', base.exchange_rate);
          if (base && base.payment_method) setValue('payment_method', base.payment_method);
          setValue('invoice_category', correctFrom ? 'CORRECTION' : ((base && base.invoice_category) || 'NORMAL'));
          setValue('order_reference', base.invoice_number || '');
          let newItems = Array.isArray(base?.items) ? base.items.map((it, idx) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            vat_rate: it.vat_rate,
            unit_of_measure: it.unit_of_measure || 'db',
            nature_indicator: it.nature_indicator || 'PRODUCT',
            original_line_number: idx + 1,
            line_operation: 'CREATE',
          })) : [];
          if (stornoFrom) {
            newItems = newItems.map(it => ({ ...it, quantity: (Number(it.quantity) || 0) * -1 }));
            setValue('notes', `Sztornó számla az alábbi számlára: ${base.invoice_number}`);
          }
          if (correctFrom) {
            setValue('notes', `Helyesbítő számla az alábbi számlára: ${base.invoice_number}`);
          }
          if (newItems.length) setValue('items', newItems);
        } catch {}
      }
    }
  );

  // Draft autosave (persist form across refresh)
  const DRAFT_KEY = React.useMemo(() => (isEdit ? `invoice_form_draft_${id}` : 'invoice_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);
  const hasDraftRef = React.useRef(false);
  const hasERPDataRef = React.useRef(false);

  // Load draft from localStorage on mount (skip for copy/correct/storno flows and ERP data)
  React.useEffect(() => {
    if (!isEdit && (copyFrom || correctFrom || stornoFrom)) return;
    if (hasERPDataRef.current) return; // Skip if ERP data was loaded
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      hasDraftRef.current = true;
      const reviveDate = (v) => (v ? new Date(v) : null);
      if (parsed.issue_date) setValue('issue_date', reviveDate(parsed.issue_date));
      if (parsed.due_date) setValue('due_date', reviveDate(parsed.due_date));
      if ('delivery_date' in parsed) setValue('delivery_date', reviveDate(parsed.delivery_date));
      [
        'customer_id', 'company_id', 'invoice_block_id', 'currency', 'exchange_rate',
        'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date',
        'completeness_indicator', 'order_reference', 'notes'
      ].forEach((k) => {
        if (k in parsed) setValue(k, parsed[k]);
      });
      if (Array.isArray(parsed.items) && parsed.items.length) {
        setValue('items', parsed.items);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);

  // When invoice (server) data loads in edit mode, only apply if no draft
  React.useEffect(() => {
    if (!invoice || hasDraftRef.current) return;
    setValue('company_id', invoice.company?.id);
    setValue('invoice_number', invoice.invoice_number);
    setValue('customer_id', invoice.customer.id);
    setValue('issue_date', new Date(invoice.issue_date));
    setValue('due_date', new Date(invoice.due_date));
    setValue('delivery_date', invoice.delivery_date ? new Date(invoice.delivery_date) : null);
    setValue('currency', invoice.currency);
    setValue('exchange_rate', invoice.exchange_rate);
    setValue('notes', invoice.notes);
    if (invoice.items && invoice.items.length > 0) {
      setValue('items', invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  // A baseInvoice betöltését onSuccess-ben végezzük; itt nincs extra teendő

  React.useEffect(() => {
    if (isReadOnly && autoPrint && !invoiceLoading) {
      const t = setTimeout(() => window.print(), 150);
      return () => clearTimeout(t);
    }
  }, [isReadOnly, autoPrint, invoiceLoading]);

  // Subscribe to changes and persist draft (debounced) — skip in read-only/preview mode
  React.useEffect(() => {
    if (isReadOnly) return;
    let t = null;
    const sub = watch((value) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        try {
          const toISO = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d || null);
          const draft = {
            customer_id: value.customer_id || '',
            company_id: value.company_id || '',
            invoice_block_id: value.invoice_block_id || '',
            issue_date: toISO(value.issue_date),
            due_date: toISO(value.due_date),
            delivery_date: toISO(value.delivery_date),
            currency: value.currency || 'HUF',
            exchange_rate: value.exchange_rate ?? 1,
            payment_method: value.payment_method || 'transfer',
            invoice_category: value.invoice_category || 'SIMPLIFIED',
            invoice_appearance: value.invoice_appearance || 'ELECTRONIC',
            payment_date: toISO(value.payment_date),
            completeness_indicator: !!value.completeness_indicator,
            order_reference: value.order_reference || '',
            notes: value.notes || '',
            items: Array.isArray(value.items) ? value.items : [],
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }, 300);
    });
    return () => { sub.unsubscribe(); window.clearTimeout(t); };
  }, [watch, DRAFT_KEY]);

  // Keep draft only on refresh: clear on route leave (unmount) unless beforeunload set the keep flag
  React.useEffect(() => {
    if (isEdit) return; // only for new invoice
    const beforeUnload = () => { try { localStorage.setItem(KEEP_FLAG_KEY, '1'); } catch {} };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      let keep = false;
      try { keep = localStorage.getItem(KEEP_FLAG_KEY) === '1'; } catch {}
      if (!keep) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      }
      try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
    };
  }, [KEEP_FLAG_KEY, DRAFT_KEY, isEdit]);

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items');

  // Select-all helper for numeric/text inputs on focus
  const selectAll = (e) => {
    const el = e?.target;
    if (el && typeof el.select === 'function') {
      // use rAF to ensure focus applied first
      requestAnimationFrame(() => {
        try { el.select(); } catch {}
      });
    }
  };

  const createInvoiceMutation = useMutation(
    (data) => (isProforma ? proformaAPI.createProforma(data) : invoiceAPI.createInvoice(data)),
    {
  onSuccess: (res) => {
        if (isProforma) {
          queryClient.invalidateQueries('proformas');
          toast.success('Díjbekérő létrehozva');
        } else {
          try { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'invoices' }); } catch { queryClient.invalidateQueries('invoices'); }
          toast.success('Számla létrehozva');
          try {
            const inv = res?.data || {};
            const st = inv.status;
            const hasTxn = !!inv.nav_transaction_id;
            if (st === 'nav_processed') {
              toast.success('NAV feldolgozva');
            } else if (st === 'submitted_to_nav' || hasTxn) {
              toast.info('NAV-hoz beküldve, feldolgozás alatt');
            } else if (st === 'nav_rejected') {
              toast.error('NAV elutasította. Újraküldés gomb elérhető a listában.');
            } else {
              toast.info('NAV beküldés nem sikerült. A listában NAV-nak küldés gomb elérhető.');
            }
          } catch {}
        }
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        // Optional quick NAV status poll (best-effort)
        try {
          if (!isProforma) {
            const inv = res?.data || {};
            const idNew = inv?.id;
            if (idNew && (inv.status === 'submitted_to_nav' || inv.nav_transaction_id)) {
              invoiceAPI
                .getNAVStatus(idNew)
                .then((statusRes) => {
                  const body = statusRes?.data || {};
                  const ps = body.processing_status || body.invoice_status;
                  if (ps === 'DONE') toast.success('NAV feldolgozás: DONE');
                  else if (ps === 'PROCESSING' || !ps) toast.info('NAV feldolgozás: folyamatban');
                })
                .catch(() => {});
            }
          }
        } catch {}
        navigate(isProforma ? '/proformas' : '/invoices');
      },
      onError: (error) => {
        // Próbáljunk a backend hibából első releváns mezőre fókuszálni
        let fieldName = '';
        let message = isProforma ? 'Hiba történt a díjbekérő létrehozása során' : 'Hiba történt a számla létrehozása során';
        const data = error?.response?.data;
        if (data && typeof data === 'object') {
          const keys = Object.keys(data);
          if (keys.length) {
            fieldName = keys[0];
            const raw = data[fieldName];
            const text = Array.isArray(raw) ? raw[0] : (typeof raw === 'string' ? raw : JSON.stringify(raw));
            message = text || message;
          }
        }
        toast.error(message);
        // Térképezzük a szerver kulcsot a form mezőnévre
        const map = {
          company_id: 'company_id',
          invoice_block_id: 'invoice_block_id',
          customer_id: 'customer_id',
          issue_date: 'issue_date',
          due_date: 'due_date',
          delivery_date: 'delivery_date',
          currency: 'currency',
          exchange_rate: 'exchange_rate',
        };
        const target = map[fieldName] || '';
        if (target) {
          // setError a vizuális jelzés miatt, majd fókusz és görgetés
          try { setError(target, { type: 'server', message }); } catch {}
          requestAnimationFrame(() => {
            const el = document.querySelector(`[name="${target}"]`);
            if (el && typeof el.focus === 'function') {
              el.focus();
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        } else if (fieldName === 'items' || (data && data.items)) {
          // Ha tételhiba, görgessünk a tételek szekcióhoz
          const el = document.getElementById('items-section');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }
  );

  const updateInvoiceMutation = useMutation(
    (data) => (isProforma ? proformaAPI.updateProforma(id, data) : invoiceAPI.updateInvoice(id, data)),
    {
      onSuccess: () => {
        if (isProforma) {
          queryClient.invalidateQueries('proformas');
          toast.success('Díjbekérő frissítve');
        } else {
          try { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'invoices' }); } catch { queryClient.invalidateQueries('invoices'); }
          queryClient.invalidateQueries(['invoice', id]);
          toast.success('Számla frissítve');
        }
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        navigate(isProforma ? '/proformas' : '/invoices');
      },
      onError: () => {
        toast.error(isProforma ? 'Hiba történt a díjbekérő frissítése során' : 'Hiba történt a számla frissítése során');
      },
    }
  );

  // (moved) invoice -> form population happens in guarded effect above

  const calculateItemTotals = (item) => {
    const netAmount = item.quantity * item.unit_price;
    const vatAmount = netAmount * (item.vat_rate / 100);
    const grossAmount = netAmount + vatAmount;
    return { netAmount, vatAmount, grossAmount };
  };

  const calculateTotals = () => {
    return watchedItems.reduce(
      (totals, item) => {
        const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
        return {
          netTotal: totals.netTotal + netAmount,
          vatTotal: totals.vatTotal + vatAmount,
          grossTotal: totals.grossTotal + grossAmount,
        };
      },
      { netTotal: 0, vatTotal: 0, grossTotal: 0 }
    );
  };

  const vatBreakdown = () => {
    const map = new Map();
    (watchedItems || []).forEach((item) => {
      const rate = Number(item?.vat_rate || 0);
      const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
      const key = rate.toFixed(2);
      if (!map.has(key)) map.set(key, { net: 0, vat: 0, gross: 0 });
      const acc = map.get(key);
      acc.net += netAmount;
      acc.vat += vatAmount;
      acc.gross += grossAmount;
    });
    const rows = Array.from(map.entries()).map(([rate, v]) => ({
      rate: Number(rate),
      net: v.net,
      vat: v.vat,
      gross: v.gross,
    })).sort((a,b)=>a.rate-b.rate);
    const totals = rows.reduce((t,r)=>({ net:t.net+r.net, vat:t.vat+r.vat, gross:t.gross+r.gross }), {net:0,vat:0,gross:0});
    return { rows, totals };
  };

  // Open advances (for FINAL invoices)
  const [selectedAdvances, setSelectedAdvances] = useState({});
  const { data: openAdvances } = useQuery(
    ['open-advances', { company_id: watch('company_id'), customer_id: watch('customer_id') }],
    () => invoiceAPI.getOpenAdvances({ company_id: watch('company_id'), customer_id: watch('customer_id') }),
    { enabled: Boolean(watch('company_id') && watch('customer_id')), select: (res) => res.data?.results || [] }
  );

  // VAT types from backend (must be declared before effects that depend on it)
  const { data: vatTypesData } = useQuery(
    ['vat-types', { active: true }],
    () => vatTypesAPI.getVATTypes({ active: true }),
    { select: (res) => res.data }
  );
  const vatTypes = React.useMemo(() => {
    const list = Array.isArray(vatTypesData) ? vatTypesData : (vatTypesData?.results || []);
    return list;
  }, [vatTypesData]);

  // Dynamically add/update negative lines per selected advance on FINAL invoices
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    const items = watch('items') || [];

    // Remove all auto advance lines if not FINAL
    if (invCat !== 'FINAL') {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i].__isAdvanceDeduction) remove(i);
      }
      return;
    }

    // Compute gross total of non-advance items
    const nonAdvGross = items
      .filter(it => !(it && it.__isAdvanceDeduction))
      .reduce((sum, it) => {
        const q = parseFloat(it?.quantity ?? 0) || 0;
        const p = parseFloat(it?.unit_price ?? 0) || 0;
        const r = parseFloat(it?.vat_rate ?? 0) || 0;
        const gross = q * p * (1 + (r / 100));
        return sum + gross;
      }, 0);

    // Selected advances in oldest-first order
    const selectedIds = Object.entries(selectedAdvances).filter(([, v]) => v).map(([k]) => k);
    const selectedList = (openAdvances || [])
      .filter(a => selectedIds.includes(a.id))
      .sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));

    let remainingToDeduct = Math.max(0, nonAdvGross);

    // Build/update a map: advanceId -> required deduction amount
    const plan = new Map();
    for (const a of selectedList) {
      if (remainingToDeduct <= 0) { plan.set(a.id, 0); continue; }
      const rem = Number(a.remaining) || 0;
      const take = Math.min(rem, remainingToDeduct);
      plan.set(a.id, take);
      remainingToDeduct -= take;
    }

    // Update existing auto lines and collect which advances are present
    const present = new Set();
    const toRemove = [];
    items.forEach((it, idx) => {
      if (!it || !it.__isAdvanceDeduction) return;
      const advId = it.__advanceId;
      const planned = plan.has(advId) ? (plan.get(advId) || 0) : 0;
      if (!advId || !plan.has(advId) || planned <= 0) {
        // this auto line no longer needed, mark for removal
        toRemove.push(idx);
        return;
      }
      present.add(advId);
      const amount = planned;
      const adv = (openAdvances || []).find(a => a.id === advId);
      const advVatRate = adv?.vat_rate ?? 0;
      const vatRate = advVatRate / 100;
      const netDeduct = amount / (1 + vatRate);
      const target = -Math.round(netDeduct * 100) / 100;
      const curPrice = parseFloat(it.unit_price ?? 0) || 0;
      const targetDesc = `Előleg beszámítás — ${(selectedList.find(a => a.id === advId)?.invoice_number) || ''}`.trim();
      if (curPrice !== target || it.description !== targetDesc || it.vat_rate !== advVatRate) {
        setValue(`items.${idx}.description`, targetDesc);
        setValue(`items.${idx}.quantity`, 1);
        setValue(`items.${idx}.unit_price`, target);
        setValue(`items.${idx}.vat_rate`, advVatRate);
        setValue(`items.${idx}.unit_of_measure`, 'db');
        setValue(`items.${idx}.nature_indicator`, 'SERVICE');
        try { items[idx].__isAdvanceDeduction = true; items[idx].__advanceId = advId; } catch {}
      }
    });

    // Remove marked auto lines (from the end to keep indexes valid)
    if (toRemove.length) {
      toRemove.sort((a,b)=>b-a).forEach(i => remove(i));
    }

    // Append missing auto lines for advances in plan but not present
    for (const [advId, amount] of plan.entries()) {
      if (present.has(advId)) continue;
      if (!amount || amount <= 0) continue;
      const adv = (openAdvances || []).find(a => a.id === advId);
      const desc = `Előleg beszámítás — ${adv?.invoice_number || ''}`.trim();
      // Use the VAT rate from the advance invoice if available
      const advVatRate = adv?.vat_rate ?? 0;
      const vatRate = advVatRate / 100;
      const netDeduct = (amount || 0) / (1 + vatRate);
      const unit = -Math.round(netDeduct * 100) / 100;
      const autoItem = {
        description: desc,
        quantity: 1,
        unit_price: unit,
        vat_rate: advVatRate,
        unit_of_measure: 'db',
        nature_indicator: 'SERVICE',
        __isAdvanceDeduction: true,
        __advanceId: advId,
      };
      append(autoItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAdvances, openAdvances, watch('invoice_category'), watch('items')]);

  // Map vat_type_id for auto advance lines once vatTypes are available
  React.useEffect(() => {
    if (!Array.isArray(vatTypes) || !vatTypes.length) return;
    const items = watch('items') || [];
    items.forEach((it, idx) => {
      if (!it || !it.__isAdvanceDeduction) return;
      const rate = Number(it?.vat_rate ?? 0);
      if (!it.vat_type_id) {
        const match = vatTypes.find(v => v.category === 'PERCENT' && Number(v.percentage) === rate);
        if (match) setValue(`items.${idx}.vat_type_id`, match.id, { shouldDirty: true, shouldValidate: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatTypes, watch('items')]);

  // For ADVANCE invoices, automatically prefix item descriptions with "Előleg: "
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    if (invCat !== 'ADVANCE') return;
    const items = watch('items') || [];
    const prefix = 'Előleg: ';
    items.forEach((it, idx) => {
      const desc = (it && typeof it.description === 'string') ? it.description : '';
      const trimmed = desc.trimStart();
      if (!trimmed.startsWith('Előleg:')) {
        setValue(`items.${idx}.description`, prefix + desc, { shouldDirty: true, shouldValidate: false });
        // mark as auto-prefixed to allow safe removal when leaving ADVANCE
        try {
          if (items[idx]) {
            items[idx].__autoAdvancePrefix = true;
            items[idx].__advanceBaseDesc = desc; // original content before prefix
          }
        } catch {}
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_category'), watch('items')]);

  // When leaving ADVANCE category, remove the automatic "Előleg: " prefix from item descriptions
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    if (invCat === 'ADVANCE') return;
    const items = watch('items') || [];
    const re = /^\s*Előleg:\s*/;
    items.forEach((it, idx) => {
      const desc = (it && typeof it.description === 'string') ? it.description : '';
      const hadAuto = it && it.__autoAdvancePrefix;
      const base = (it && typeof it.__advanceBaseDesc === 'string') ? it.__advanceBaseDesc : '';
      if (re.test(desc) && hadAuto) {
        // Remove only if not modified beyond the auto prefix
        const after = desc.replace(re, '');
        if (after === base) {
          setValue(`items.${idx}.description`, after, { shouldDirty: true, shouldValidate: false });
        }
      }
      // clear flags regardless to avoid stale state
      try { if (items[idx]) { delete items[idx].__autoAdvancePrefix; delete items[idx].__advanceBaseDesc; } } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_category')]);

  const onSubmit = (data) => {
    const round2 = (n) => {
      const x = parseFloat((n ?? '0').toString().replace(',', '.'));
      if (!isFinite(x)) return 0;
      return Math.round(x * 100) / 100;
    };
    const items = data.items.map(item => ({
      description: item.description,
      quantity: round2(item.quantity),
      unit_price: round2(item.unit_price),
      vat_rate: parseFloat(item.vat_rate),
      vat_type_id: item.vat_type_id || undefined,
      vat_reason: item.vat_reason || undefined,
      unit_of_measure: item.unit_of_measure || 'db',
      nature_indicator: item.nature_indicator || 'PRODUCT',
      product_code_category: item.product_code_category || undefined,
      product_code_value: item.product_code_value || undefined,
    }));

    const currency = data.currency || 'HUF';
    const ex = typeof data.exchange_rate === 'number' && isFinite(data.exchange_rate)
      ? data.exchange_rate
      : 1;

    const invoiceData = {
      ...data,
      customer_id: data.customer_id,
      issue_date: data.issue_date.toISOString().split('T')[0],
      due_date: data.due_date.toISOString().split('T')[0],
      delivery_date: data.delivery_date ? data.delivery_date.toISOString().split('T')[0] : null,
      items,
      company_id: data.company_id || undefined,
      currency,
      exchange_rate: ex,
    };

    // If creating a new invoice and an invoice block is selected, send it for auto-number generation
    if (!isEdit && data.invoice_block_id) {
      invoiceData.invoice_block_id = data.invoice_block_id;
      // Let backend generate invoice_number; remove any manually set value
      delete invoiceData.invoice_number;
    }

    if (isProforma) {
      const pfData = {
        proforma_number: data.invoice_number || undefined,
        company_id: invoiceData.company_id,
        customer_id: invoiceData.customer_id,
        issue_date: invoiceData.issue_date,
        due_date: invoiceData.due_date,
        delivery_date: invoiceData.delivery_date,
        currency: invoiceData.currency,
        payment_method: data.payment_method,
        notes: data.notes || '',
        items: invoiceData.items,
      };
      if (isEdit) updateInvoiceMutation.mutate(pfData); else createInvoiceMutation.mutate(pfData);
    } else {
      if (!isEdit && data.invoice_block_id) {
        invoiceData.invoice_block_id = data.invoice_block_id;
        delete invoiceData.invoice_number;
      }
      if (data.invoice_category === 'FINAL') {
        const ids = Object.entries(selectedAdvances).filter(([,v]) => v).map(([k]) => k);
        if (ids.length) {
          invoiceData.advance_invoice_ids = ids;
        }
      }
      if (isEdit) updateInvoiceMutation.mutate(invoiceData); else createInvoiceMutation.mutate(invoiceData);
    }
  };

  const totals = calculateTotals();
  const isSimplified = (watch('invoice_category') || 'SIMPLIFIED') === 'SIMPLIFIED';

  // Normalize decimal separator: allow both "," and "." as input
  const normalizeInput = (e) => {
    if (e && e.target && typeof e.target.value === 'string') {
      e.target.value = e.target.value.replace(',', '.');
    }
  };

  // Helper to get string value for controlled text inputs without forcing Number conversion
  const getItemStr = (idx, key, fallbackNumber) => {
    try {
      const v = watch(`items.${idx}.${key}`);
      if (v !== undefined && v !== null && v !== '') return String(v);
    } catch {}
    if (fallbackNumber === undefined || fallbackNumber === null || Number.isNaN(fallbackNumber)) return '';
    return String(fallbackNumber);
  };

  // Utility for accent-insensitive search in customer selector
  const normalize = (str) => (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const customerOptions = (customers?.results || []).map(c => ({
    value: c.id,
    label: `${c.name} (${c.tax_number})`,
    _norm: normalize(`${c.name} ${c.tax_number}`)
  }));

  const companyOptions = (companies?.results || []).map(c => ({ value: c.id, label: c.name }));
  const blockOptions = (invoiceBlocks?.results || []).map(b => ({ value: b.id, label: `${b.name} (${b.prefix})` }));
  // VAT types already initialized above

  // Ensure default VAT 27% on new invoice when VAT types are available
  React.useEffect(() => {
    if (isEdit) return;
    if (!Array.isArray(vatTypes) || !vatTypes.length) return;
    const vt27 = vatTypes.find(v => (v.code || '') === '27');
    if (!vt27) return;
    const items = watch('items') || [];
    let changed = false;
    items.forEach((it, idx) => {
      if (!it?.vat_type_id) {
        setValue(`items.${idx}.vat_type_id`, vt27.id, { shouldValidate: false, shouldDirty: true });
        setValue(`items.${idx}.vat_rate`, Number(vt27.percentage || 27), { shouldValidate: false, shouldDirty: true });
        changed = true;
      }
    });
    if (changed) {
      // trigger recalculation visuals
      try { setTimeout(() => {}, 0); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatTypes]);

  // VAT type usage counters for prioritizing Top 5
  const getUsage = () => {
    try { return JSON.parse(localStorage.getItem('vatTypeUsage') || '{}'); } catch { return {}; }
  };
  const bumpUsage = (id) => {
    try {
      const map = getUsage();
      map[id] = (map[id] || 0) + 1;
      localStorage.setItem('vatTypeUsage', JSON.stringify(map));
    } catch {}
  };

  const vatTypeOptions = React.useMemo(() => {
    const all = (vatTypes || []).map(v => ({
      value: v.id,
      label: v.code,
      _code: v.code,
      _name: v.name,
      _full: `${v.code} ${v.name}${v.percentage != null ? ` (${v.percentage}%)` : ''}`
    }));
    if (!all.length) return { groups: [], flat: [] };
    const usage = getUsage();
    const top = [...all].sort((a,b)=> (usage[b.value]||0)-(usage[a.value]||0)).slice(0,5);
    // If no usage yet, prefer common ones by code
    if (!Object.keys(usage).length) {
      const pref = ['27','AAM','TAM','5','0'];
      const seen = new Set();
      const topInit = [];
      pref.forEach(code => { const found = all.find(o=>o._code===code); if (found) { topInit.push(found); seen.add(found.value); } });
      // fill up to 5
      all.forEach(o=> { if (topInit.length<5 && !seen.has(o.value)) topInit.push(o); });
      return { groups: [ { label: 'Gyakori', options: topInit }, { label: 'Összes', options: all } ], flat: all };
    }
    return { groups: [ { label: 'Gyakori', options: top }, { label: 'Összes', options: all } ], flat: all };
  }, [vatTypes]);

  // VAT help modal state and content
  const [showVatHelp, setShowVatHelp] = React.useState(false);
  const vatHelp = [
    { code: 'AAM', ref: 'XIII. fejezet', text: 'A számla kibocsátója alanyi mentességet választott és a mentesség használatára jogosult (nem érte el a jogszabályi értékhatárt).' },
    { code: 'TAM', ref: '85. §, 86. §', text: 'Az értékesítés a tevékenység közérdekű jellegére vagy egyéb sajátos jellegére tekintettel mentes az adó alól. Például adómentes oktatás, egészségügyi szolgáltatás.' },
    { code: 'KBAET', ref: '89. §', text: 'Közösség másik tagállamában regisztrált adóalany számára történt termékértékesítés, amennyiben a termék az adott tagállamba került elszállításra. Új közlekedési eszköz esetén lásd: KBAUK. A vevő közösségi adószáma kötelező a számlán.' },
    { code: 'KBAUK', ref: '89. § (2)', text: 'Új közlekedési eszköz másik tagállamba történő értékesítése. A vevő lehet magánszemély is, ezért közösségi adószám nem feltétlenül jelenik meg. A 259. § 25. pont adatai kötelezők.' },
    { code: 'EAM', ref: '98–109. §', text: 'Belföldön teljesített termékértékesítés, melynek következményeként a terméket kiléptetik harmadik országba (export). Ide tartozhat nemzetközi szerződésen alapuló adómentesség is.' },
    { code: 'NAM', ref: '93–95. §, 110–118. §', text: 'Jogszabály által felsorolt adómentes esetek (pl. adómentes közvetítői tevékenység, nemzetközi forgalomhoz kapcsolódó egyes tevékenységek). NAV Online Számla 123. oldal.' },
    { code: 'ATK', ref: '2–3. §', text: 'Tárgyi hatályon kívüli ügyletekre nem kötelező számlát kiállítani, de számlán lehet ATK tétel (pl. kártérítés, közhatalmi tevékenység, közcélú adomány).' },
    { code: 'EUFAD37', ref: '37. § (1)', text: 'Adóalanynak nyújtott szolgáltatás, ahol a teljesítési hely a vevő letelepedése/lakóhelye szerint más tagállamban van. Kötelező a vevő közösségi adószáma és összesítő nyilatkozat.' },
    { code: 'EUFADE', ref: '—', text: 'Másik tagállamban teljesített fordítottan adózó ügylet, amelynél a teljesítési hely nem a 37. § (1) alapján dől el (pl. szereléshez kötött értékesítés). Magyar bejelentkezés nem szükséges.' },
    { code: 'EUE', ref: '—', text: 'EU‑ban teljesített olyan ügylet, amely után nem a vevő terheli az adófizetés (nem esik EUFAD37/EUFADE alá).' },
    { code: 'HO', ref: '—', text: 'Az Áfa tv. szerinti teljesítési hely EU‑n kívül van (pl. harmadik országban teljesített szolgáltatás, harmadik országbeli ingatlanhoz kapcsolódó ügylet).' },
    { code: 'REFUNDABLE_VAT', ref: '11. §, 14. §', text: 'Ellenérték fejében végzettnek minősülő ingyenes átadás/nyújtás (pl. szállodai szolgáltatás ingyen az ügyvezető családjának). Az adóalanynak fizetendő áfát kell megállapítania.' },
    { code: 'NONREFUNDABLE_VAT', ref: '11. §, 14. §', text: 'Mint a fenti eset, de a kedvezményezett szerződésben vállalja az áfa megtérítését az adóalany felé.' },
  ];

  // If we were redirected back from new customer page with a selected customer, preselect it
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const cid = sp.get('customer_id');
      if (cid) setValue('customer_id', cid);
    } catch {}
  }, [location.search, setValue]);

  // Load draft data from URL parameter if 'erp_data' parameter is present (ERP integration)
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const erpData = sp.get('erp_data');
      if (!erpData) return;
      
      console.log('[ERP] Found ERP data in URL');
      hasERPDataRef.current = true; // Mark that ERP data was loaded
      
      const decoded = decodeURIComponent(atob(erpData));
      console.log('[ERP] Decoded data:', decoded);
      const draft = JSON.parse(decoded);
      console.log('[ERP] Parsed draft:', draft);
      
      // Set customer data if provided
      if (draft.customer) {
        console.log('[ERP] Customer data:', draft.customer);
        // Try to find customer by tax_number
        if (draft.customer.tax_number) {
          customerAPI.getCustomers({ page_size: 1000 }).then(response => {
            console.log('[ERP] Searching for tax_number:', draft.customer.tax_number);
            
            // Normalize tax numbers for comparison (remove dashes and spaces)
            const normalizeTaxNumber = (tax) => (tax || '').replace(/[-\s]/g, '');
            const searchTax = normalizeTaxNumber(draft.customer.tax_number);
            // For domestic customers, use first 8 digits
            const searchTaxTrunk = searchTax.substring(0, 8);
            
            const customer = response.data.results.find(c => {
              const customerTax = normalizeTaxNumber(c.tax_number);
              const customerTaxTrunk = customerTax.substring(0, 8);
              return customerTaxTrunk === searchTaxTrunk;
            });
            
            if (customer) {
              console.log('[ERP] Customer found:', customer);
              setValue('customer_id', customer.id);
              toast.success(`Ügyfél kiválasztva: ${customer.name}`);
            } else {
              console.log('[ERP] Customer NOT found with tax_number:', draft.customer.tax_number);
              console.log('[ERP] Will query NAV and create customer if needed');
              
              // Query NAV for company info
              utilsAPI.queryTaxNumber(searchTaxTrunk).then(navResponse => {
                console.log('[ERP] NAV response:', navResponse);
                if (navResponse.data && navResponse.data.taxpayer) {
                  // Create customer from NAV data
                  const navData = navResponse.data.taxpayer;
                  const newCustomerData = {
                    name: navData.taxpayerName || draft.customer.name,
                    tax_number: navData.taxpayerShortName ? `${searchTaxTrunk}-${navData.taxpayerShortName}` : draft.customer.tax_number,
                    city: navData.taxpayerAddress?.city || draft.customer.city,
                    postal_code: navData.taxpayerAddress?.postalCode || draft.customer.postal_code,
                    address: navData.taxpayerAddress?.streetName ? 
                      `${navData.taxpayerAddress.streetName} ${navData.taxpayerAddress.number || ''}`.trim() : 
                      draft.customer.address,
                  };
                  
                  console.log('[ERP] Creating customer from NAV data:', newCustomerData);
                  customerAPI.createCustomer(newCustomerData).then(createResp => {
                    console.log('[ERP] Customer created:', createResp.data);
                    setValue('customer_id', createResp.data.id);
                    toast.success(`Ügyfél létrehozva NAV adatokból: ${createResp.data.name}`);
                  }).catch(createErr => {
                    console.error('[ERP] Error creating customer:', createErr);
                    toast.error('Hiba az ügyfél létrehozásakor');
                  });
                } else {
                  // NAV didn't return data, use ERP data
                  console.log('[ERP] NAV returned no data, using ERP data');
                  const newCustomerData = {
                    name: draft.customer.name,
                    tax_number: draft.customer.tax_number,
                    city: draft.customer.city || '',
                    postal_code: draft.customer.postal_code || '',
                    address: draft.customer.address || '',
                  };
                  
                  console.log('[ERP] Creating customer from ERP data:', newCustomerData);
                  customerAPI.createCustomer(newCustomerData).then(createResp => {
                    console.log('[ERP] Customer created:', createResp.data);
                    setValue('customer_id', createResp.data.id);
                    toast.success(`Ügyfél létrehozva: ${createResp.data.name}`);
                  }).catch(createErr => {
                    console.error('[ERP] Error creating customer:', createErr);
                    toast.error('Hiba az ügyfél létrehozásakor');
                  });
                }
              }).catch(navErr => {
                console.error('[ERP] NAV query error:', navErr);
                // NAV error, use ERP data
                const newCustomerData = {
                  name: draft.customer.name,
                  tax_number: draft.customer.tax_number,
                  city: draft.customer.city || '',
                  postal_code: draft.customer.postal_code || '',
                  address: draft.customer.address || '',
                };
                
                console.log('[ERP] Creating customer from ERP data (NAV failed):', newCustomerData);
                customerAPI.createCustomer(newCustomerData).then(createResp => {
                  console.log('[ERP] Customer created:', createResp.data);
                  setValue('customer_id', createResp.data.id);
                  toast.success(`Ügyfél létrehozva: ${createResp.data.name}`);
                }).catch(createErr => {
                  console.error('[ERP] Error creating customer:', createErr);
                  toast.error('Hiba az ügyfél létrehozásakor');
                });
              });
            }
          }).catch((err) => {
            console.error('[ERP] Error fetching customers:', err);
          });
        }
      }
      
      // Set invoice items
      if (draft.items && Array.isArray(draft.items)) {
        console.log('[ERP] Setting items:', draft.items);
        // Use setTimeout to ensure form is ready, and replace to properly update field array
        setTimeout(() => {
          replace(draft.items);
          console.log('[ERP] Items set successfully with replace()');
        }, 100);
      }
      
      // Set notes
      if (draft.notes) {
        console.log('[ERP] Setting notes:', draft.notes);
        setValue('notes', draft.notes);
      }
      
      toast.success('Adatok betöltve az ERP-ből');
    } catch (e) {
      console.error('[ERP] Error loading draft from URL:', e);
      toast.error('Hiba az adatok betöltésekor: ' + e.message);
    }
  }, [location.search, setValue]);


  // Preview next invoice number on block change
  const [invoiceNumberPreview, setInvoiceNumberPreview] = React.useState('');
  React.useEffect(() => {
    const blockId = watch('invoice_block_id');
    if (!blockId) { setInvoiceNumberPreview(''); return; }
    (async () => {
      try {
        const { data } = await invoiceBlockAPI.previewNextNumber(blockId);
        setInvoiceNumberPreview(data.invoice_number || '');
      } catch (e) {
        setInvoiceNumberPreview('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_block_id')]);

  // Sync delivery_date default to issue_date if not set yet
  React.useEffect(() => {
    const issue = watch('issue_date');
    const deliv = watch('delivery_date');
    if (issue && !deliv) setValue('delivery_date', issue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('issue_date')]);

  // Compute due_date based on payment method and selected customer's due days
  React.useEffect(() => {
    const issue = watch('issue_date');
    const method = watch('payment_method');
    const customerId = watch('customer_id');
    if (!issue) return;
    const issueDate = new Date(issue);
    const customersList = (customers?.results || []);
    const customer = customersList.find(c => c.id === customerId);
    if (method === 'transfer') {
      const days = (customer && (customer.payment_due_days ?? 8)) || 8;
      const due = new Date(issueDate);
      due.setDate(due.getDate() + days);
      setValue('due_date', due);
    } else {
      setValue('due_date', issueDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, watch('issue_date'), watch('payment_method'), watch('customer_id')]);

  if (customersLoading || invoiceLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  const currentPath = location.pathname + (location.search || '');

  // Data for printable invoice view
  const companiesList = (companies?.results || []);
  const snapshot = invoice?.print_snapshot || null;
  const selectedCompany = companiesList.find(c => c.id === selectedCompanyId) || snapshot?.company || invoice?.company || null;
  const customersList = (customers?.results || []);
  const selectedCustomerId = watch('customer_id');
  const selectedCustomer = customersList.find(c => c.id === selectedCustomerId) || snapshot?.customer || invoice?.customer || null;
  const invoiceNumberValue = isEdit ? (watch('invoice_number') || invoice?.invoice_number || snapshot?.invoice_number || '') : (invoiceNumberPreview || snapshot?.invoice_number || '');
  const toISODate = (d) => {
    try {
      if (!d) return '';
      const date = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().slice(0,10);
    } catch { return ''; }
  };
  const issueDateStr = toISODate(watch('issue_date')) || (invoice?.issue_date || snapshot?.issue_date || '');
  const deliveryDateStr = toISODate(watch('delivery_date')) || (invoice?.delivery_date || snapshot?.delivery_date || issueDateStr || '');
  const dueDateStr = toISODate(watch('due_date')) || (invoice?.due_date || snapshot?.due_date || '');
  const currency = watch('currency') || invoice?.currency || snapshot?.currency || 'HUF';
  const paymentMethod = watch('payment_method') || invoice?.payment_method || snapshot?.payment_method || 'transfer';
  const notesVal = watch('notes') || invoice?.notes || '';
  const isRefund = totals.grossTotal < 0;
  const payLabel = isRefund ? 'Visszatérítendő' : 'Fizetendő';
  const payAmountAbs = Math.abs(totals.grossTotal);

  // Helpers: full tax number formatting
  const formatFullTax = (entity) => {
    if (!entity) return '';
    if (entity.full_tax_number) return entity.full_tax_number;
    if (entity.tax_number && entity.vat_code && entity.county_code) {
      return `${entity.tax_number}-${entity.vat_code}-${entity.county_code}`;
    }
    return entity.tax_number || '';
  };

  // Amount in words (Hungarian) — simplified
  const numberToHungarian = (n) => {
    const ones = ['', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc'];
    const tens = ['', 'tíz', 'húsz', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven'];
    const hundred = 'száz';

    const chunkToWords = (num) => {
      if (!num) return '';
      let s = '';
      const sz = Math.floor(num / 100);
      const t = Math.floor((num % 100) / 10);
      const o = num % 10;
      if (sz > 0) {
        if (sz === 1) s += hundred; // száz
        else if (sz === 2) s += 'kétszáz';
        else s += ones[sz] + hundred; // háromszáz, négyszáz, ...
      }
      if (t === 1) {
        // 10..19
        if (o === 0) s += 'tíz';
        else s += 'tizen' + ones[o];
        return s;
      }
      if (t === 2) {
        // 20..29
        if (o === 0) s += 'húsz';
        else s += 'huszon' + ones[o];
        return s;
      }
      if (t > 2) s += tens[t];
      if (o > 0 && t !== 1 && t !== 2) s += ones[o];
      return s;
    };

    const scaleWord = (count, singular) => {
      if (!count) return '';
      if (singular === 'ezer') {
        if (count === 1) return 'ezer';
        if (count === 2) return 'kétezer';
        return chunkToWords(count) + 'ezer';
      }
      // millió / milliárd
      if (count === 1) return 'egy' + singular; // egymillió / egymilliárd
      if (count === 2) return 'két' + singular; // kétmillió / kétmilliárd
      return chunkToWords(count) + singular;
    };

    if (n === 0) return 'nulla';
    const b = Math.floor(n / 1_000_000_000);
    const m = Math.floor((n % 1_000_000_000) / 1_000_000);
    const e = Math.floor((n % 1_000_000) / 1000);
    const r = n % 1000;
    const parts = [];
    if (b) parts.push(scaleWord(b, 'milliárd'));
    if (m) parts.push(scaleWord(m, 'millió'));
    if (e) parts.push(scaleWord(e, 'ezer'));
    if (r) parts.push(chunkToWords(r));
    // Hyphenate between magnitude groups per Hungarian writing (pl. ötezer-tizenegy)
    return parts.filter(Boolean).join('-');
  };
  const amountToWordsHU = (amount, curr) => {
    const abs = Math.abs(amount || 0);
    const whole = Math.floor(abs);
    const fraction = Math.round((abs - whole) * 100);
    const main = numberToHungarian(whole) + ' ' + (curr === 'HUF' ? 'forint' : curr);
    if (curr === 'HUF') {
      if (fraction > 0) {
        return `azaz ${main} ${numberToHungarian(fraction)} fillér`;
      }
      return `azaz ${main}`;
    }
    if (fraction > 0) {
      return `azaz ${main} és ${fraction} cent`;
    }
    return `azaz ${main}`;
  };

  return (
    <>
      <div className="no-print">
        <FormContainer>
          <FormHeader>
        <HeaderLeft>
          <Title>{isProforma ? (isEdit ? 'Díjbekérő megnyitása' : 'Új díjbekérő') : (isEdit ? 'Számla megnyitása' : 'Új számla')}</Title>
          {!isEdit && (
            <InlineHeaderGroup>
              {!isProforma && (
                <CompactField>
                  <Controller
                    control={control}
                    name="invoice_block_id"
                    render={({ field }) => (
                      <ReactSelect
                        inputId="invoice_block_id"
                        options={blockOptions}
                        value={blockOptions.find(o => o.value === field.value) || null}
                        onChange={(opt) => field.onChange(opt ? opt.value : '')}
                        placeholder={'Számlatömb'}
                        isDisabled={!selectedCompanyId}
                        isClearable
                        styles={{
                          control: (base) => ({ ...base, minHeight: 32, height: 32 }),
                          valueContainer: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
                          indicatorsContainer: (base) => ({ ...base, height: 32 }),
                          menu: (base) => ({ ...base, zIndex: 5 })
                        }}
                      />
                    )}
                  />
                </CompactField>
              )}
              <CompactField>
                <Input
                  id="invoice_number"
                  value={isEdit ? (watch('invoice_number') || '') : (invoiceNumberPreview || '')}
                  disabled
                  readOnly
                  placeholder={isProforma ? 'Díjbekérő szám' : 'Számlaszám'}
                  title={!isProforma && !isEdit ? 'Előnézet — a végleges számlaszám mentéskor képződik.' : ''}
                  style={{ height: 32, padding: '6px 10px' }}
                />
              </CompactField>
              {selectedCompanyId && primaryCompanyBank && (
                <BankInfoPill title={`${primaryCompanyBank.bank_name || ''} ${primaryCompanyBank.iban || primaryCompanyBank.account_number || ''} ${primaryCompanyBank.swift_bic || ''} [${currency}]`.trim()}>
                  Bankszámla: {primaryCompanyBank.iban || primaryCompanyBank.account_number} [{currency}]
                </BankInfoPill>
              )}
            </InlineHeaderGroup>
          )}
        </HeaderLeft>

          <ButtonGroup>
            {!isProforma && !isEdit && (openAdvances || []).length > 0 && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setValue('invoice_category', 'FINAL');
                  const allSel = {};
                  (openAdvances || []).forEach(a => { allSel[a.id] = true; });
                  setSelectedAdvances(allSel);
                  // Scroll to the advances section
                  requestAnimationFrame(() => {
                    const el = document.getElementById('items-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                title="Végszámla készítése a nyitott előlegek felhasználásával"
              >
                Végszámla készítése
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate(isProforma ? '/proformas' : '/invoices')}
            >
              <ArrowLeft size={16} />
              Vissza
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => window.print()}
            >
              <FileText size={16} /> Nyomtatási kép
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit)}
              disabled={isReadOnly || createInvoiceMutation.isLoading || updateInvoiceMutation.isLoading}
            >
              <Save size={16} />
              {isEdit ? 'Frissítés' : 'Mentés'}
            </Button>
          </ButtonGroup>
        </FormHeader>


      <form onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={isReadOnly || isStornoCreation} style={{ border: 'none', padding: 0, margin: 0 }}>
          {isStornoCreation && (
            <div style={{
              background: '#fff3cd', border: '1px solid #ffeeba', color: '#856404',
              padding: 10, borderRadius: 6, marginBottom: 12
            }}>
              Sztornó számla készítése — a mezők nem módosíthatók. Mentés után küldhető a NAV‑nak.
            </div>
          )}
        {showVatHelp && (
          <ModalBackdrop onClick={() => setShowVatHelp(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <span>ÁFA típusok – Súgó</span>
                <IconGhostButton onClick={() => setShowVatHelp(false)} aria-label="Bezárás">
                  <X size={18} />
                </IconGhostButton>
              </ModalHeader>
              <ModalBody>
                {vatHelp.map(item => (
                  <HelpRow key={item.code}>
                    <HelpTitle>{item.code}</HelpTitle>
                    <HelpMeta>Áfa tv. hivatkozás: {item.ref || '—'}</HelpMeta>
                    <HelpText>{item.text}</HelpText>
                  </HelpRow>
                ))}
              </ModalBody>
            </ModalCard>
          </ModalBackdrop>
        )}
        <FormGrid>
          <FormSection>
            <SectionTitle>Alapadatok</SectionTitle>
            
            <FormGroup>
              <Label htmlFor="customer_id">Ügyfél *</Label>
              <Controller
                control={control}
                name="customer_id"
                rules={{ required: 'Ügyfél kiválasztása kötelező' }}
                render={({ field }) => (
                  <InlineGroup>
                    <div style={{ flex: 1 }}>
                      <ReactSelect
                        inputId="customer_id"
                        options={customerOptions}
                        value={customerOptions.find(o => o.value === field.value) || null}
                        onChange={(opt) => field.onChange(opt ? opt.value : '')}
                        placeholder="Keresés név vagy adószám alapján..."
                        isClearable
                        filterOption={(option, rawInput) => {
                          const term = normalize(rawInput);
                          return option.data._norm.includes(term);
                        }}
                        styles={{ container: (base) => ({ ...base, zIndex: 10 }) }}
                      />
                    </div>
                    {!isEdit && (
                      <Button type="button" variant="secondary" onClick={() => navigate(`/customers/new?return=${encodeURIComponent(currentPath || '/invoices/new')}`)}>
                        + Új
                      </Button>
                    )}
                  </InlineGroup>
                )}
              />
              {errors.customer_id && (<ErrorMessage>{errors.customer_id.message}</ErrorMessage>)}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="issue_date">Kibocsátás dátuma *</Label>
              <DatePicker
                id="issue_date"
                name="issue_date"
                selected={watch('issue_date')}
                onChange={(date) => setValue('issue_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
              />
              {errors.issue_date && (
                <ErrorMessage>{errors.issue_date.message}</ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="due_date">Esedékesség dátuma *</Label>
              <DatePicker
                id="due_date"
                name="due_date"
                selected={watch('due_date')}
                onChange={(date) => setValue('due_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
              />
              {errors.due_date && (
                <ErrorMessage>{errors.due_date.message}</ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="delivery_date">Teljesítés dátuma</Label>
              <DatePicker
                id="delivery_date"
                name="delivery_date"
                selected={watch('delivery_date')}
                onChange={(date) => setValue('delivery_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
                isClearable
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <SectionTitle>Pénzügyi adatok</SectionTitle>
            
            {!isProforma && (
              <FormGroup>
                <Label htmlFor="invoice_category">Számla típusa</Label>
                <Select id="invoice_category" {...register('invoice_category')}>
                  <option value="SIMPLIFIED">Egyszerűsített</option>
                  <option value="NORMAL">Normál</option>
                  <option value="AGGREGATE">Gyűjtőszámla</option>
                  <option value="ADVANCE">Előlegszámla</option>
                  <option value="FINAL">Végszámla</option>
                  <option value="CORRECTION">Helyesbítő</option>
                </Select>
              </FormGroup>
            )}

            {watch('invoice_category') === 'FINAL' && (
              <FormGroup>
                <Label>Nyitott előleg számlák</Label>
                <div style={{ border:'1px solid #ecf0f1', borderRadius:6, padding:10 }}>
                  {(!openAdvances || openAdvances.length === 0) ? (
                    <div style={{ color:'#6c757d' }}>Nincs nyitott előleg számla ehhez az ügyfélhez.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {openAdvances.map(a => (
                        <label key={a.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <input type="checkbox" checked={!!selectedAdvances[a.id]} onChange={(e)=> setSelectedAdvances(prev => ({ ...prev, [a.id]: e.target.checked }))} />
                          <span style={{ fontWeight:600 }}>{a.invoice_number}</span>
                          <span style={{ color:'#6c757d' }}>(Kiállítva: {a.issue_date})</span>
                          <span style={{ marginLeft:'auto' }}>Hátralévő előleg: {Number(a.remaining).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} HUF</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </FormGroup>
            )}

            {false && (
              <FormGroup>
                <Label htmlFor="payment_date">Fizetés dátuma</Label>
                <DatePicker
                  selected={watch('payment_date')}
                  onChange={(date) => setValue('payment_date', date)}
                  dateFormat="yyyy-MM-dd"
                  className="form-control"
                  wrapperClassName="w-100"
                  isClearable
                />
              </FormGroup>
            )}

            <FormGroup>
              <Label htmlFor="order_reference">Rendelésszám / hivatkozás</Label>
              <Input id="order_reference" {...register('order_reference')} placeholder="Pl. Megrendelés szám: 12345678/2021" />
            </FormGroup>

            {!isSimplified && (
              <FormGroup>
                <Label>
                  <input type="checkbox" {...register('completeness_indicator')} style={{ marginRight: 8 }} />
                  Teljességi jelző (minden tétel részletezve)
                </Label>
              </FormGroup>
            )}

            <FormGroup>
              <Label htmlFor="payment_method">Fizetési mód *</Label>
              <Select id="payment_method" {...register('payment_method', { required: 'Fizetési mód kötelező' })}>
                <option value="transfer">Átutalás</option>
                <option value="cash">Készpénz</option>
                <option value="card">Bankkártya</option>
                <option value="voucher">Utalvány</option>
                <option value="cod">Utánvét</option>
                <option value="other">Egyéb</option>
              </Select>
              {errors.payment_method && (<ErrorMessage>{errors.payment_method.message}</ErrorMessage>)}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="currency">Pénznem</Label>
              <ReactSelect
                inputId="currency"
                options={[
                  { value: 'HUF', label: 'HUF' },
                  { value: 'EUR', label: 'EUR' },
                  { value: 'USD', label: 'USD' },
                  { value: 'GBP', label: 'GBP' },
                  { value: 'CHF', label: 'CHF' },
                  { value: 'PLN', label: 'PLN' },
                  { value: 'CZK', label: 'CZK' },
                  { value: 'RON', label: 'RON' },
                ]}
                value={{ value: watch('currency') || 'HUF', label: watch('currency') || 'HUF' }}
                onChange={async (opt) => {
                  const val = opt ? opt.value : 'HUF';
                  setValue('currency', val);
                  if (val !== 'HUF') {
                    try {
                      const res = await utilsAPI.getExchangeRate(val);
                      if (res.data && res.data.rate) setValue('exchange_rate', Number(res.data.rate));
                    } catch (e) { /* noop */ }
                  } else {
                    setValue('exchange_rate', 1);
                  }
                }}
                isClearable={false}
                isSearchable
              />
            </FormGroup>

              <FormGroup>
                <Label htmlFor="exchange_rate">Árfolyam</Label>
                <Input
                  id="exchange_rate"
                  type="number"
                  step="0.0001"
                  onInput={normalizeInput}
                  {...register('exchange_rate', { valueAsNumber: true })}
                />
              </FormGroup>

            <FormGroup>
              <Label htmlFor="notes">Megjegyzések</Label>
              <TextArea
                id="notes"
                {...register('notes')}
              />
            </FormGroup>
          </FormSection>
        </FormGrid>

        <ItemsSection id="items-section">
          <ItemsHeader>
            <SectionTitle>Tételek</SectionTitle>
            <AddItemButton
              type="button"
              onClick={() => {
                const vt27 = (vatTypes || []).find(v => (v.code || '') === '27');
                append({ description: '', quantity: 1, unit_price: 0, vat_rate: 27, unit_of_measure: 'db', vat_type_id: vt27 ? vt27.id : undefined });
              }}
            >
              <Plus size={16} />
              Tétel hozzáadása
            </AddItemButton>
          </ItemsHeader>

          <ItemsTable>
            <TableHeader>
              <tr>
                <TableHeaderCell>Név</TableHeaderCell>
                {isSimplified && <TableHeaderCell>Termékkód</TableHeaderCell>}
                <TableHeaderCell>Mennyiség</TableHeaderCell>
                <TableHeaderCell>Me. egység</TableHeaderCell>
                <TableHeaderCell>
                  <InlineGroup>
                    <span>ÁFA %</span>
                    <IconGhostButton type="button" onClick={() => setShowVatHelp(true)} title="ÁFA típus súgó">
                      <HelpCircle size={16} />
                    </IconGhostButton>
                  </InlineGroup>
                </TableHeaderCell>
                <TableHeaderCell>Nettó egységár</TableHeaderCell>
                <TableHeaderCell>Bruttó egységár</TableHeaderCell>
                {!isSimplified && (
                  <>
                    <TableHeaderCell>Típus</TableHeaderCell>
                    <TableHeaderCell>Kód típusa</TableHeaderCell>
                    <TableHeaderCell>Kód értéke</TableHeaderCell>
                  </>
                )}
                <TableHeaderCell>Nettó összeg</TableHeaderCell>
                <TableHeaderCell>ÁFA összeg</TableHeaderCell>
                <TableHeaderCell>Bruttó összeg</TableHeaderCell>
                <TableHeaderCell>Műveletek</TableHeaderCell>
              </tr>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const item = watchedItems[index];
                const isAutoAdvance = !!(item && item.__isAdvanceDeduction);
                const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
                
                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <TextArea
                        {...register(`items.${index}.description`, { required: 'Leírás kötelező' })}
                        placeholder="Tétel neve / leírása"
                        style={{ minHeight: 40, minWidth: 180 }}
                        readOnly={isAutoAdvance}
                        disabled={isAutoAdvance}
                      />
                    </TableCell>
                    {isSimplified && (
                      <TableCell>
                        <SmallInput {...register(`items.${index}.product_code_value`)} placeholder="Termékkód (opcionális)" />
                      </TableCell>
                    )}
                    <TableCell>
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isStornoCreation || isAutoAdvance}
                        disabled={isStornoCreation || isAutoAdvance}
                        {...register(`items.${index}.quantity`, { 
                          required: 'Mennyiség kötelező',
                          valueAsNumber: true,
                          ...(isStornoCreation ? {} : { min: { value: 0.01, message: 'Mennyiség nagyobb kell legyen 0-nál' } }),
                          onChange: () => {
                            setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          }
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <CreatableSelect
                        inputId={`uom_${index}`}
                        styles={{ container: base => ({ ...base, minWidth: 120 }) }}
                        isDisabled={isStornoCreation || isAutoAdvance}
                        options={[
                          { value: 'db', label: 'db' },
                          { value: 'l', label: 'l' },
                          { value: 'mm', label: 'mm' },
                          { value: 'cm', label: 'cm' },
                          { value: 'm', label: 'm' },
                          { value: 'm2', label: 'm2' },
                          { value: 'm3', label: 'm3' },
                          { value: 'g', label: 'g' },
                          { value: 'kg', label: 'kg' },
                          { value: 't', label: 't' },
                        ]}
                        value={watch(`items.${index}.unit_of_measure`) ? { value: watch(`items.${index}.unit_of_measure`), label: watch(`items.${index}.unit_of_measure`) } : null}
                        onChange={(opt) => setValue(`items.${index}.unit_of_measure`, opt ? opt.value : '')}
                        isClearable
                        placeholder="egység"
                      />
                    </TableCell>
                    <TableCell>
                      {vatTypes && vatTypes.length > 0 ? (
                        <InlineFlex>
                          <ReactSelect
                            inputId={`vat_type_${index}`}
                            options={vatTypeOptions.groups}
                            value={(() => {
                              const id = watch(`items.${index}.vat_type_id`) || '';
                              return vatTypeOptions.flat.find(o=>o.value===id) || null;
                            })()}
                            isDisabled={isStornoCreation || isAutoAdvance}
                            onChange={(opt) => {
                              const id = opt ? opt.value : '';
                              setValue(`items.${index}.vat_type_id`, id);
                              const vt = (vatTypes||[]).find(v => v.id === id);
                              if (vt) {
                                bumpUsage(id);
                                if (vt.category === 'PERCENT' && vt.percentage != null) {
                                  setValue(`items.${index}.vat_rate`, Number(vt.percentage));
                                } else {
                                  setValue(`items.${index}.vat_rate`, 0);
                                }
                              }
                              // Clear derived totals on VAT change
                              setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                              setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                            }}
                            styles={{ container: (base) => ({ ...base, minWidth: 180 }), menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                            menuPortalTarget={document.body}
                            isClearable
                            isSearchable
                            filterOption={(option, raw) => {
                              const norm = (s)=> (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                              const hay = `${option.label} ${option.data?._full || ''}`;
                              return norm(hay).includes(norm(raw));
                            }}
                          />
                          {(() => { const id = watch(`items.${index}.vat_type_id`); const vt = (vatTypes||[]).find(v => v.id === id); return (
                            vt && vt.category !== 'PERCENT' ? (
                              <SmallInput style={{ marginTop: 6 }} placeholder="ÁFA indok (pl. AAM/TAM részletezés)"
                                {...register(`items.${index}.vat_reason`)} />
                            ) : null
                          ); })()}
                        </InlineFlex>
                      ) : (
                        <ItemSelect
                          disabled={isStornoCreation || isAutoAdvance}
                          {...register(`items.${index}.vat_rate`, { 
                              required: 'ÁFA kulcs kötelező',
                              valueAsNumber: true,
                              onChange: () => {
                                setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                                setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                              }
                            })}
                        >
                          {VAT_RATES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </ItemSelect>
                      )}
                    </TableCell>
                    <TableCell>
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        value={getItemStr(index, 'unit_price_str', item?.unit_price)}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.unit_price_str`, str, { shouldValidate: false, shouldDirty: true });
                          const val = parseFloat(str.replace(',', '.'));
                          if (!Number.isNaN(val)) {
                            setValue(`items.${index}.unit_price`, val, { shouldValidate: false, shouldDirty: true });
                          }
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                        placeholder="Nettó egységár"
                      />
                    </TableCell>
                    <TableCell>
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        value={getItemStr(index, 'gross_unit_price_str', ((item?.unit_price || 0) * (1 + (item?.vat_rate || 0)/100)).toFixed(2))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.gross_unit_price_str`, str, { shouldValidate: false, shouldDirty: true });
                          const gross = parseFloat(str.replace(',', '.'));
                          const net = (gross) / (1 + (Number(item?.vat_rate || 0)/100));
                          if (Number.isFinite(net)) {
                            const net2 = Number(net.toFixed(2));
                            setValue(`items.${index}.unit_price`, net2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(net2), { shouldValidate: false, shouldDirty: true });
                          }
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                        placeholder="Bruttó egységár"
                      />
                    </TableCell>
                    {!isSimplified && (
                      <>
                        <TableCell>
                          <ItemSelect {...register(`items.${index}.nature_indicator`)}>
                            <option value="PRODUCT">Termék</option>
                            <option value="SERVICE">Szolgáltatás</option>
                            <option value="OTHER">Egyéb</option>
                          </ItemSelect>
                        </TableCell>
                        <TableCell>
                          <ItemSelect {...register(`items.${index}.product_code_category`)}>
                            <option value="">—</option>
                            <option value="VTSZ">VTSZ</option>
                            <option value="SZJ">SZJ</option>
                            <option value="KN">KN</option>
                            <option value="OTHER">Egyéb</option>
                          </ItemSelect>
                        </TableCell>
                        <TableCell>
                          <SmallInput {...register(`items.${index}.product_code_value`)} placeholder="Kód érték" />
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isAutoAdvance}
                        disabled={isAutoAdvance}
                        value={getItemStr(index, 'net_total_str', netAmount.toFixed(2))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.net_total_str`, str, { shouldValidate: false, shouldDirty: true });
                          const netTotal = parseFloat(str.replace(',', '.'));
                          const qty = Number(item?.quantity || 0) || 1;
                          const newUnit = netTotal / qty;
                          if (Number.isFinite(newUnit)) {
                            const nu2 = Number((newUnit||0).toFixed(2));
                            setValue(`items.${index}.unit_price`, nu2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(nu2), { shouldValidate: false, shouldDirty: true });
                          }
                          // invalidate opposite editable display so it recalculates from model
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <ItemInput
                        type="number"
                        step="0.01"
                        value={Number(vatAmount.toFixed(2))}
                        disabled
                        readOnly
                      />
                    </TableCell>
                    <TableCell>
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isAutoAdvance}
                        disabled={isAutoAdvance}
                        value={getItemStr(index, 'gross_total_str', grossAmount.toFixed(2))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.gross_total_str`, str, { shouldValidate: false, shouldDirty: true });
                          const gross = parseFloat(str.replace(',', '.'));
                          const rate = 1 + Number(item?.vat_rate || 0)/100;
                          const netTotal = gross / (rate || 1);
                          const qty = Number(item?.quantity || 0) || 1;
                          const newUnit = netTotal / qty;
                          if (Number.isFinite(newUnit)) {
                            const nu2 = Number((newUnit||0).toFixed(2));
                            setValue(`items.${index}.unit_price`, nu2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(nu2), { shouldValidate: false, shouldDirty: true });
                          }
                          // invalidate opposite editable display so it recalculates from model
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <DeleteButton
                          type="button"
                          onClick={() => remove(index)}
                          disabled={isStornoCreation || fields.length === 1 || isAutoAdvance}
                          title="Tétel törlése"
                        >
                          <Trash2 size={16} />
                        </DeleteButton>
                        <DeleteButton
                          type="button"
                          onClick={() => {
                            const list = [...(watch('items')||[])];
                            const clone = { ...list[index] };
                            list.splice(index+1, 0, clone);
                            setValue('items', list, { shouldValidate: false, shouldDirty: true });
                          }}
                          title="Tétel duplikálása"
                          style={{ backgroundColor: '#6c757d' }}
                          disabled={isStornoCreation || isAutoAdvance}
                        >
                          +
                        </DeleteButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ItemsTable>
        </ItemsSection>

        <SummarySection>
          <SectionTitle>Összesítés</SectionTitle>
          <SummaryRow>
            <span>Nettó összeg:</span>
            <span>{totals.netTotal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</span>
          </SummaryRow>
          <SummaryRow>
            <span>ÁFA összeg:</span>
            <span>{totals.vatTotal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</span>
          </SummaryRow>
          <SummaryRow>
            <span>Bruttó összeg:</span>
            <span>{totals.grossTotal.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</span>
          </SummaryRow>

          {/* ÁFA részletező */}
          {(() => { const vb = vatBreakdown(); return (
            <>
              <SectionTitle>ÁFA részletező</SectionTitle>
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
                  {vb.rows.map(r => (
                    <tr key={r.rate}>
                      <td>{r.rate.toLocaleString('hu-HU')}%</td>
                      <td>{r.net.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</td>
                      <td>{r.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</td>
                      <td>{r.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</td>
                    </tr>
                  ))}
                  <tr>
                    <th>Összesen</th>
                    <th>{vb.totals.net.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</th>
                    <th>{vb.totals.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</th>
                    <th>{vb.totals.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} Ft</th>
                  </tr>
                </tbody>
              </VatTable>
            </>
          ); })()}
        </SummarySection>
        </fieldset>
      </form>
        </FormContainer>
      </div>

      {/* Printable Invoice Layout */}
      <div className="print-invoice print-only">
        <div className="inv-container">
          <div className="inv-header">
            <div className="inv-seller">
              <div className="inv-seller-name">{selectedCompany?.name || '—'}</div>
              {(selectedCompany?.tax_number || selectedCompany?.full_tax_number) && (
                <div>Adószám: {formatFullTax(selectedCompany)}</div>
              )}
              {selectedCompany?.eu_tax_number && (
                <div>EU adószám: {selectedCompany.eu_tax_number}</div>
              )}
              {selectedCompany?.vat_group_id && (
                <div>Csoport azonosító: {selectedCompany.vat_group_id}</div>
              )}
              {selectedCompany?.vat_group_member_tax_number && (
                <div>Csoport tag adószám: {selectedCompany.vat_group_member_tax_number}</div>
              )}
              {(selectedCompany?.postal_code || selectedCompany?.city) && (
                <div>{(selectedCompany?.postal_code || '')} {selectedCompany?.city || ''}</div>
              )}
              {(() => { const s = (selectedCompany && (selectedCompany.address || (([selectedCompany.street_name, selectedCompany.public_place_category, selectedCompany.street_number].filter(Boolean).join(' ') + ([selectedCompany.building, selectedCompany.staircase, selectedCompany.floor, selectedCompany.door].filter(Boolean).join(' ') ? (', ' + [selectedCompany.building, selectedCompany.staircase, selectedCompany.floor, selectedCompany.door].filter(Boolean).join(' ')) : '')))) || ''); return s ? (<div>{s}</div>) : null; })()}
              {selectedCompany?.country && (<div>{selectedCompany.country}</div>)}
              {(selectedCompany?.email || selectedCompany?.phone) && (
                <div style={{ marginTop: '1mm' }}>
                  {selectedCompany?.email && (<div>E-mail: {selectedCompany.email}</div>)}
                  {selectedCompany?.phone && (<div>Telefon: {selectedCompany.phone}</div>)}
                </div>
              )}
              {(() => {
                const list = (companyBankAccounts && companyBankAccounts.length ? companyBankAccounts : (invoice?.company?.bank_accounts || []));
                const want = String(currency || '').toUpperCase();
                const filtered = list.filter(acc => String(acc?.currency || '').toUpperCase() === want);
                if (!filtered.length) return null;
                return (
                  <div style={{ marginTop: '2mm' }}>
                    <div style={{ fontWeight: 600 }}>Bankszámlák</div>
                    {filtered.map((acc, i) => (
                      <div key={acc.id || i}>
                        {acc.account_number && (<span>{(acc.currency || want)}: {acc.account_number} </span>)}
                        {acc.iban && (<span>IBAN: {acc.iban} </span>)}
                        {acc.swift_bic && (<span>SWIFT/BIC: {acc.swift_bic} </span>)}
                        {acc.bank_name && (<span>({acc.bank_name})</span>)}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="inv-top-right">
              <div className="inv-meta">
                <div className="inv-title">{isProforma ? 'Díjbekérő' : 'Számla'}</div>
                <div className="inv-number">{isProforma ? 'Díjbekérő száma' : 'Számlaszám'}: {invoiceNumberValue || '—'}</div>
                <div className="inv-meta-grid">
                  <div>
                    <div className="muted">Kibocsátás</div>
                    <div>{issueDateStr || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Teljesítés</div>
                    <div>{deliveryDateStr || issueDateStr || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Pénznem</div>
                    <div>{currency}</div>
                  </div>
                  <div>
                    <div className="muted">Fizetési mód</div>
                    <div>{paymentMethod === 'transfer' ? 'Átutalás' : (paymentMethod === 'cash' ? 'Készpénz' : paymentMethod)}</div>
                  </div>
                </div>
              </div>
              <div className="inv-highlight">
                <div className="inv-amount">
                  <span className="label">{payLabel}</span>
                  <span className="value">{payAmountAbs.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currency}</span>
                </div>
                {paymentMethod === 'transfer' && (
                  <div className="inv-deadline">
                    <span className="muted">Fizetési határidő</span>
                    <span className="date-pill">{dueDateStr || '—'}</span>
                  </div>
                )}
              </div>
            <div className="inv-buyer-sm">
              <div className="inv-block-title">Vevő</div>
              <div className="inv-buyer-name">{selectedCustomer?.name || '—'}</div>
                {(selectedCustomer?.tax_number || selectedCustomer?.full_tax_number) && (
                  <div>Adószám: {formatFullTax(selectedCustomer)}</div>
                )}
                {selectedCustomer?.eu_tax_number && (<div>EU adószám: {selectedCustomer.eu_tax_number}</div>)}
                {selectedCustomer?.vat_group_id && (<div>Csoport azonosító: {selectedCustomer.vat_group_id}</div>)}
                {selectedCustomer?.vat_group_member_tax_number && (<div>Csoport tag adószám: {selectedCustomer.vat_group_member_tax_number}</div>)}
                {(selectedCustomer?.postal_code || selectedCustomer?.city) && (
                  <div>{(selectedCustomer?.postal_code || '')} {selectedCustomer?.city || ''}</div>
                )}
                {selectedCustomer?.address ? (
                  <div>{selectedCustomer.address}</div>
                ) : (
                  <div>
                    {(selectedCustomer?.street_name || '')}
                    {selectedCustomer?.public_place_category ? ` ${selectedCustomer.public_place_category}` : ''}
                    {selectedCustomer?.street_number ? ` ${selectedCustomer.street_number}` : ''}
                    {selectedCustomer?.building ? ` ${selectedCustomer.building}` : ''}
                    {selectedCustomer?.staircase ? ` ${selectedCustomer.staircase}` : ''}
                    {selectedCustomer?.floor ? ` ${selectedCustomer.floor}` : ''}
                    {selectedCustomer?.door ? ` ${selectedCustomer.door}` : ''}
                  </div>
                )}
                {selectedCustomer?.country && (
                  <div style={{ marginTop: '1mm' }}>{selectedCustomer.country}</div>
                )}
            </div>
            </div>
          </div>

          <table className="inv-items">
            <colgroup>
              <col className="col-desc" />
              <col className="col-qty" />
              <col className="col-unit" />
              <col className="col-unitnet" />
              <col className="col-vatrate" />
              <col className="col-net" />
              <col className="col-vat" />
              <col className="col-gross" />
            </colgroup>
            <thead>
              <tr>
                <th>Megnevezés</th>
                <th className="cen">Menny.</th>
                <th className="cen">Egység</th>
                <th className="num">Egységár (nettó)</th>
                <th className="cen">ÁFA %</th>
                <th className="num">Nettó</th>
                <th className="num">ÁFA</th>
                <th className="num">Bruttó</th>
              </tr>
            </thead>
            <tbody>
              {(watchedItems || []).map((it, idx) => {
                const qty = Number(it?.quantity || 0) || 0;
                const unit = (it?.unit || 'db');
                const unitPrice = Number(it?.unit_price || 0) || 0;
                const vatRate = Number(it?.vat_rate || 0) || 0;
                const net = qty * unitPrice;
                const vat = net * (vatRate/100);
                const gross = net + vat;
                return (
                  <tr key={idx}>
                    <td>{it?.description || ''}</td>
                    <td className="cen">{qty.toLocaleString('hu-HU')}</td>
                    <td className="cen">{unit}</td>
                    <td className="num">{unitPrice.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                    <td className="cen">{vatRate.toLocaleString('hu-HU')}%</td>
                    <td className="num">{net.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{vat.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{gross.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(() => { const vb = vatBreakdown(); return (
            <table className="inv-items" style={{ marginTop: '6mm' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '27%' }} />
                <col style={{ width: '27%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="cen">ÁFA %</th>
                  <th className="num">Nettó összeg</th>
                  <th className="num">ÁFA összeg</th>
                  <th className="num">Bruttó összeg</th>
                </tr>
              </thead>
              <tbody>
                {vb.rows.map(r => (
                  <tr key={r.rate}>
                    <td className="cen">{r.rate.toLocaleString('hu-HU')}%</td>
                    <td className="num">{r.net.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{r.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                    <td className="num">{r.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr>
                  <th>Összesen</th>
                  <th className="num">{vb.totals.net.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</th>
                  <th className="num">{vb.totals.vat.toLocaleString('hu-HU', { minimumFractionDigits: 2 })}</th>
                  <th className="num inv-gross-total">{vb.totals.gross.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currency}</th>
                </tr>
              </tbody>
            </table>
          ); })()}

          {(() => {
            const advs = snapshot?.advances_used || [];
            if (!Array.isArray(advs) || !advs.length) return null;
            return (
              <div className="inv-notes" style={{ marginTop: '4mm' }}>
                <div className="inv-block-title">Felhasznált előlegek</div>
                <ul style={{ margin: 0, paddingLeft: '5mm' }}>
                  {advs.map((a, i) => (
                    <li key={i}>Előleg számla: {a.invoice_number} — felhasználva: {Number(a.amount||0).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {currency}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <div className="inv-words" style={{ marginTop: '4mm', fontSize: '9pt' }}>
            {amountToWordsHU(totals.grossTotal, currency)}
          </div>

          {notesVal && (
            <div className="inv-notes">
              <div className="inv-block-title">Megjegyzés</div>
              <div>{notesVal}</div>
            </div>
          )}

          <div className="inv-footer">
            <div>
              {paymentMethod === 'transfer' ? 'Kérjük az összeget átutalással rendezni a fenti bankszámlára.' : 'Köszönjük a fizetést.'}
            </div>
            <div className="inv-fineprint">Ez a számla elektronikus úton készült és aláírás nélkül is érvényes.</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default InvoiceForm;
