import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { Search, Eye, RefreshCw, Printer, CheckSquare, Square, PlusCircle, FolderOpen, Trash2, FileDown, X, Save, Edit2, Upload, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { incomingDocsAPI } from '../services/api';
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
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const SearchContainer = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
`;


const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover { background-color: #2980b9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const TableContainer = styled.div`
  overflow-x: auto;
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
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover { background-color: #f8f9fa; }
  ${props => props.$paid ? 'background: #eafaf1;' : ''}
  ${props => (!props.$paid && props.$unpaid) ? 'background: #f3e8ff;' : ''}
`;

const TableCell = styled.td`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;
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

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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

const Sentinel = styled.div`
  height: 1px;
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background-color: #ecf0f1;
  color: #2c3e50;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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

export default function IncomingInvoices() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | unpaid | paid | due
  const [paymentFilter, setPaymentFilter] = useState('all'); // all | transfer | cash | card | voucher | utanvet | other
  const [approvalFilter, setApprovalFilter] = useState('all'); // all | approved | unapproved
  const [xmlOpen, setXmlOpen] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState('');
  const [xmlText, setXmlText] = useState('');
  const [xmlTitle, setXmlTitle] = useState('');
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
  const [selected, setSelected] = useState(() => new Set());
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
  const [batchTab, setBatchTab] = useState('pending');
  const [batchItemSaving, setBatchItemSaving] = useState({});
  const [itemAmountDrafts, setItemAmountDrafts] = useState({});
  const searchTimer = useRef(null);
  const [approvalSaving, setApprovalSaving] = useState({});

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
  useEffect(() => { setPage(1); setItems([]); setHasMore(true); setSelected(new Set()); }, [companyId, statusFilter, paymentFilter, approvalFilter]);

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
    fetchDigest(1, { refresh: 1, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const fetchDigest = async (pageArg, opts = {}) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    const replace = !!opts.replace;
    const doRefresh = opts.refresh ? 1 : 0;
    if (pageArg && pageArg > 1) setIsFetchingMore(true); else setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get('/api/invoices/incoming/', { params: { company_id: companyId, date_from: dateFrom, date_to: dateTo, page: pageArg || page, refresh: doRefresh, backfill_all: opts.backfillAll ? 1 : undefined, search: (searchText||'').trim() || undefined, status: statusFilter==='all'? undefined : statusFilter, payment_method: paymentFilter==='all'? undefined : paymentFilter, approval: approvalFilter==='all'? undefined : approvalFilter } });
      const data = res.data || {};
      if (data.success && Array.isArray(data.items)) {
        setItems(prev => (replace ? data.items : [...prev, ...data.items]));
        setPage(data.page || pageArg || 1);
        setHasMore(!!data.hasMore);
        setLastRefreshedAt(data.lastRefreshedAt || null);
        if (data.refreshError) {
          toast.error(data.refreshError);
        }
        if (replace && data.refreshed) {
          const cnt = typeof data.upserted === 'number' ? data.upserted : data.items.length;
          if (cnt > 0) toast.success(`Új bejövő számlák frissítve (${cnt})`);
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
      setIsFetchingMore(false);
    }
  };

  // Debounced search to keep quick search responsive
  useEffect(() => {
    if (!companyId) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1); setItems([]); setHasMore(true);
      fetchDigest(1, { replace: true });
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, companyId, statusFilter, paymentFilter, approvalFilter]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = document.getElementById('incoming-sentinel');
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !loading && !isFetchingMore && hasMore) {
          fetchDigest((page || 1) + 1, { replace: false });
        }
      });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, isFetchingMore, hasMore, page, companyId, dateFrom, dateTo]);

  const downloadXml = async (invoiceNumber, supplierTaxNumber) => {
    // kept as fallback download if needed in the future
    try {
      const res = await api.post('/api/invoices/incoming/download/', { company_id: companyId, invoice_number: invoiceNumber, supplier_tax_number: supplierTaxNumber }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incoming_${invoiceNumber||'invoice'}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('XML letöltési hiba');
    }
  };

  const openXmlInline = async (invoiceNumber, supplierTaxNumber) => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    setXmlLoading(true);
    setXmlError('');
    setXmlText('');
    try {
      const baseParams = { company_id: companyId, invoice_number: invoiceNumber, supplier_tax_number: supplierTaxNumber, inline: 1 };
      const res = await api.post('/api/invoices/incoming/download/', baseParams, {
        responseType: 'text'
      });
      setXmlTitle(`Számla XML: ${invoiceNumber}`);
      let text = typeof res.data === 'string' ? res.data : (res?.data ? String(res.data) : '');
      // Fallback: if backend returned NAV outer response, try to decode inner invoiceData here
      try {
        if (text && (text.includes('QueryInvoiceDataResponse') || text.includes('invoiceDataResult'))) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'application/xml');
          if (!doc.getElementsByTagName('parsererror').length) {
            const els = doc.getElementsByTagNameNS('*', 'invoiceData');
            const compEls = doc.getElementsByTagNameNS('*', 'compressedContentIndicator');
            if (els && els[0] && els[0].textContent) {
              const b64 = els[0].textContent.trim();
              const isCompressed = compEls && compEls[0] && /true/i.test(compEls[0].textContent || '');
              const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
              if (isCompressed) {
                // Try gunzip if available (modern browsers)
                if (typeof DecompressionStream !== 'undefined') {
                  const ds = new DecompressionStream('gzip');
                  const stream = new Response(new Blob([raw]).stream().pipeThrough(ds));
                  const buf = await stream.arrayBuffer();
                  text = new TextDecoder('utf-8').decode(buf);
                } else {
                  // Fallback: leave as-is; backend should handle gzip
                }
              } else {
                text = new TextDecoder('utf-8').decode(raw);
              }
            }
          }
        }
      } catch (_) { /* ignore */ }
      // Defensive: if still NAV wrapper leaked through, try to extract inner invoiceData here
      try {
        if (text && /<\/?[A-Za-z0-9:]*QueryInvoiceDataResponse|invoiceDataResult/.test(text)) {
          const parser2 = new DOMParser();
          const doc2 = parser2.parseFromString(text, 'application/xml');
          const els2 = doc2.getElementsByTagNameNS('*', 'invoiceData');
          const comp2 = doc2.getElementsByTagNameNS('*', 'compressedContentIndicator');
          if (els2 && els2[0] && els2[0].textContent) {
            const b64 = els2[0].textContent.trim();
            const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            let decodedText = null;
            const isCompressed = comp2 && comp2[0] && /true/i.test(comp2[0].textContent || '');
            if (isCompressed && typeof DecompressionStream !== 'undefined') {
              const ds = new DecompressionStream('gzip');
              const stream = new Response(new Blob([raw]).stream().pipeThrough(ds));
              const buf = await stream.arrayBuffer();
              decodedText = new TextDecoder('utf-8').decode(buf);
            } else if (!isCompressed) {
              decodedText = new TextDecoder('utf-8').decode(raw);
            }
            if (decodedText) text = decodedText;
          }
        }
      } catch (_) {}
      // Quick heuristic: if looks like NAV wrapper or parsing would likely be empty, retry with force=1
      let needForce = false;
      try {
        if (!text || /QueryInvoiceDataResponse|invoiceDataResult/.test(text)) needForce = true;
        if (!needForce) {
          const tmpDoc = new DOMParser().parseFromString(text, 'application/xml');
          if (!tmpDoc || tmpDoc.getElementsByTagName('parsererror').length) needForce = true;
          const hasInvoiceData = tmpDoc.getElementsByTagNameNS('*','invoiceMain').length || tmpDoc.getElementsByTagNameNS('*','line').length;
          if (!hasInvoiceData) needForce = true;
        }
      } catch (_) {}

      if (needForce) {
        try {
          const res2 = await api.post('/api/invoices/incoming/download/', {
            ...baseParams, force: 1
          }, {
            responseType: 'text'
          });
          let t2 = typeof res2.data === 'string' ? res2.data : (res2?.data ? String(res2.data) : '');
          try {
            if (t2 && (t2.includes('QueryInvoiceDataResponse') || t2.includes('invoiceDataResult'))) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(t2, 'application/xml');
              const els = doc.getElementsByTagNameNS('*', 'invoiceData');
              const compEls = doc.getElementsByTagNameNS('*', 'compressedContentIndicator');
              if (els && els[0] && els[0].textContent) {
                const b64 = els[0].textContent.trim();
                const isCompressed = compEls && compEls[0] && /true/i.test(compEls[0].textContent || '');
                const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                if (isCompressed && typeof DecompressionStream !== 'undefined') {
                  const ds = new DecompressionStream('gzip');
                  const stream = new Response(new Blob([raw]).stream().pipeThrough(ds));
                  const buf = await stream.arrayBuffer();
                  t2 = new TextDecoder('utf-8').decode(buf);
                } else if (!isCompressed) {
                  t2 = new TextDecoder('utf-8').decode(raw);
                }
              }
            }
          } catch (_) {}
          text = t2 || text;
        } catch (_) { /* ignore and keep original text */ }
      }

      setXmlText(text);
      setXmlOpen(true);
    } catch (e) {
      const msg = e?.response?.data || e?.message || 'XML megnyitási hiba';
      setXmlError(typeof msg === 'string' ? msg : 'XML megnyitási hiba');
      setXmlOpen(true);
    } finally {
      setXmlLoading(false);
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

  // Parse NAV XML into a printable data structure
  useEffect(() => {
    if (!xmlText) { setParsed(null); return; }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) { setParsed(null); return; }
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
  const currency = firstText('invoiceCurrencyCode') || firstText('invoiceCurrency');
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
      const supplierBankAccounts = Array.from(doc.getElementsByTagNameNS('*','supplierBankAccountNumber'))
        .concat(Array.from(doc.getElementsByTagNameNS('*','bankAccountNumber')))
        .map(el => (el.textContent || '').trim())
        .filter((v, i, a) => v && a.indexOf(v) === i);
      const customerName = textFrom(customerInfo, 'customerName') || firstText('customerName');
      const customerTax = textFrom(customerInfo, 'customerTaxNumber') || firstText('customerTaxNumber');

      const addressToLines = (addrRoot) => {
        if (!addrRoot) return [];
        const parts = [
          textFrom(addrRoot, 'postalCode'),
          textFrom(addrRoot, 'city'),
          [textFrom(addrRoot, 'streetName'), textFrom(addrRoot, 'publicPlaceCategory'), textFrom(addrRoot, 'number')].filter(Boolean).join(' ')
        ].filter(Boolean);
        const country = textFrom(addrRoot, 'countryCode');
        if (country) parts.push(country);
        return parts;
      };
      const supplierAddr = (doc.getElementsByTagNameNS('*','supplierAddress')[0]) || (doc.getElementsByTagNameNS('*','supplierAddressList')[0]);
      const customerAddr = (doc.getElementsByTagNameNS('*','customerAddress')[0]) || (doc.getElementsByTagNameNS('*','customerAddressList')[0]);
      const supplierAddressLines = addressToLines(supplierAddr);
      const customerAddressLines = addressToLines(customerAddr);

      const lines = [];
      const lineNodes = all('line');
      lineNodes.forEach((ln) => {
        const description = textFrom(ln, 'lineDescription') || textFrom(ln, 'productName') || '';
        const lineNumber = textFrom(ln, 'lineNumber') || '';
        // product codes array
        const productCodes = Array.from(ln.getElementsByTagNameNS('*','productCode')).map(pc => {
          const cat = textFrom(pc, 'productCodeCategory') || textFrom(pc, 'productCodeCategoryOwn');
          const val = textFrom(pc, 'productCodeValue');
          return [cat, val].filter(Boolean).join(':');
        }).filter(Boolean);
        const qty = number(textFrom(ln, 'quantity')) || number(textFrom(ln, 'lineQuantity'));
        const unit = textFrom(ln, 'unitOfMeasure') || textFrom(ln, 'unitOfMeasureOwn') || '';
        let unitPrice = number(textFrom(ln, 'unitPrice')) || number(textFrom(ln, 'unitPriceHUF')) || null;
        if (unitPrice == null) {
          const up = ln.getElementsByTagNameNS('*','unitPrice')[0] || ln.getElementsByTagNameNS('*','lineUnitPrice')[0];
          if (up) unitPrice = number(up.textContent);
        }
        const vatPct = number(textFrom(ln, 'vatPercentage'));
        // amounts can be nested under lineAmountsNormal
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

      // totals
      let totalNet = number(firstText('invoiceNetAmount')) || null;
      let totalVat = number(firstText('invoiceVatAmount')) || null;
      let totalGross = number(firstText('invoiceGrossAmount')) || null;
      if (totalNet == null || totalVat == null || totalGross == null) {
        totalNet = 0; totalVat = 0; totalGross = 0;
        lines.forEach(l => {
          totalNet += l.net || 0;
          totalVat += l.vat || 0;
          totalGross += l.gross || ((l.net || 0) + (l.vat || 0));
        });
      }

      // VAT summary by rate
      const vatSummary = Array.from(doc.getElementsByTagNameNS('*','summaryByVatRate')).map(gr => {
        const ratePct = number(textFrom(gr, 'vatPercentage'));
        const label = ratePct != null ? `${ratePct}%` : (textFrom(gr, 'vatExemption') || textFrom(gr, 'domesticReverseCharge') || 'Különböző');
        const net = number(textFrom(gr, 'vatRateNetAmount')) || number(textFrom(gr, 'netAmount'));
        const vat = number(textFrom(gr, 'vatRateVatAmount')) || number(textFrom(gr, 'vatAmount'));
        const gross = number(textFrom(gr, 'vatRateGrossAmount')) || number(textFrom(gr, 'grossAmount'));
        return { label, net, vat, gross };
      });

      // Additional invoice data key-values
      const additionalData = Array.from(doc.getElementsByTagNameNS('*','additionalInvoiceData')).map(el => ({
        desc: textFrom(el, 'dataDescription'),
        value: textFrom(el, 'dataValue')
      })).filter(d => d.desc || d.value);

      setParsed({
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
        additionalData,
        totals: { net: totalNet, vat: totalVat, gross: totalGross },
      });
    } catch (e) {
      setParsed(null);
    }
  }, [xmlText]);

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const fmtAmt = (v) => {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const truncName = (name) => {
    if (!name) return '-';
    const s = String(name);
    return s.length > 30 ? `${s.slice(0, 30)}…` : s;
  };

  const loadPrev = () => { if (page > 1) fetchDigest(page - 1); };
  const loadNext = () => { if (hasMore) fetchDigest(page + 1); };

  const rowKey = (row) => `${row.invoiceNumber||''}|${row.supplierTaxNumber||''}`;
  const isRowApproved = (row) => row?.isApproved === true || row?.isApproved === 1 || row?.isApproved === '1';
  const canSelect = (row) => {
    const isTransfer = String(row.paymentMethod || '').toUpperCase() === 'TRANSFER';
    if (!isTransfer || row.inPaymentBatch) return false;
    if (isSuperuser || allowAllMenus || canSkipApprovalForBatch) return true;
    return isRowApproved(row);
  };
  const toggleSelect = (row, idx, event) => {
    if (!canSelect(row)) return;
    const key = rowKey(row);
    const isShift = !!event?.shiftKey;
    const isCtrl = !!(event?.ctrlKey || event?.metaKey);
    setSelected(prev => {
      let next = new Set(Array.from(prev));
      if (isShift && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, idx);
        const end = Math.max(lastSelectedIndex, idx);
        for (let i = start; i <= end; i++) {
          const r = items[i];
          if (r && canSelect(r)) next.add(rowKey(r));
        }
      } else if (isCtrl) {
        if (next.has(key)) next.delete(key); else next.add(key);
      } else {
        if (next.has(key)) next.delete(key); else next.add(key);
      }
      return next;
    });
    setLastSelectedIndex(idx);
  };

  const selectedRows = items.filter(r => selected.has(rowKey(r)));
  const selectedCount = selectedRows.length;
  const selectedCurrencies = Array.from(new Set(selectedRows.map(r => r.currency).filter(Boolean)));
  const selectedCurrency = (selectedRows[0]?.currency) || '';
  const effectiveBatchCurrency = batchCurrency || selectedCurrencies[0] || 'HUF';
  const selectedRowsForBatch = selectedRows.filter(r => !effectiveBatchCurrency || !r.currency || r.currency === effectiveBatchCurrency);
  const excludedForBatch = selectedRows.length - selectedRowsForBatch.length;
  const selectedTotal = selectedRowsForBatch.reduce((sum, r) => sum + Number(r.grossAmount || 0), 0);

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
          const copy = new Set(Array.from(prev));
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
    }
  };

  const openCreateBatchModal = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (selectedCount === 0) { toast.info('Válassz átutalásos számlákat'); return; }
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
      const itemsPayload = selectedRowsForBatch.map(r => ({
        invoice_number: r.invoiceNumber,
        supplier_tax_number: r.supplierTaxNumber,
        supplier_name: r.supplierName,
        amount_gross: r.grossAmount,
        currency: r.currency,
      }));
      const addRes = await api.post(`/api/payment-batches/${batch.id}/add-items/`, { items: itemsPayload });
      const cr = addRes.data || {};
      toast.success(`Csomag létrehozva: ${cr.created} tétel${excludedForBatch? `, kihagyva: ${excludedForBatch}`:''}`);
      setShowCreateBatch(false);
      setSelected(new Set());
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

  const openBatches = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    setBatchTab('pending');
    await fetchBatchLists();
    setShowBatches(true);
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

  const exportBatchBankFile = async (b) => {
    try {
      const execDate = new Date();
      const y = execDate.getFullYear();
      const m = String(execDate.getMonth()+1).padStart(2, '0');
      const d = String(execDate.getDate()).padStart(2, '0');
      let res;
      const params = { format: 'pain.001', execution_date: `${y}-${m}-${d}`, company_id: companyId };
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
      toast.success('Banki export elkészült');
      try { await fetchBatchLists(); } catch {}
    } catch (e) {
      const msg = e?.response?.data?.error || 'Banki export hiba';
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

  const addSelectedToBatch = async (batch) => {
    if (selectedCount === 0) { toast.info('Nincs kijelölt tétel'); return; }
    try {
      const currency = batch.currency || '';
      const filtered = selectedRows.filter(r => !currency || !r.currency || r.currency === currency);
      const excluded = selectedRows.length - filtered.length;
      const itemsPayload = filtered.map(r => ({
        invoice_number: r.invoiceNumber,
        supplier_tax_number: r.supplierTaxNumber,
        supplier_name: r.supplierName,
        amount_gross: r.grossAmount,
        currency: r.currency,
      }));
      const res = await api.post(`/api/payment-batches/${batch.id}/add-items/`, { items: itemsPayload });
      const cr = res.data || {};
      toast.success(`Hozzáadva: ${cr.created}, kihagyva: ${excluded + (cr.skipped||0)}`);
      // Refresh list to update item_count
      try {
        const list = await api.post('/api/payment-batches/list-pending/', { company_id: companyId });
        setPendingBatches(list.data || []);
      } catch {}
    } catch (e) {
      const resp = e?.response?.data || {};
      const msg = resp.error || e?.message || 'Hozzáadás hiba';
      if (Array.isArray(resp.not_approved) && resp.not_approved.length) {
        toast.error(`${msg}: jóváhagyás szükséges (${resp.not_approved.join(', ')})`);
      } else {
        toast.error(msg);
      }
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
      const keys = new Set((b.items||[]).map(it => `${it.invoice_number||''}|${it.supplier_tax_number||''}`));
      setSelected(new Set(keys));
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
      const itemsPayload = selectedRows.map(r => ({
        invoice_number: r.invoiceNumber,
        supplier_tax_number: r.supplierTaxNumber,
        supplier_name: r.supplierName,
        amount_gross: r.grossAmount,
        currency: r.currency,
      }));
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

  return (
    <InvoicesContainer>
      <InvoicesHeader>
        <Title>Bejövő számlák</Title>
        <Toolbar>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input
              value={searchText}
              onChange={(e)=>{ setSearchText(e.target.value); setPage(1); setItems([]); setHasMore(true); }}
              onKeyDown={(e)=>{ if (e.key==='Enter') fetchDigest(1, { replace: true }); }}
              placeholder="Gyorskereső (számla, név, adószám)"
              style={{ padding:'6px 10px', minWidth:260 }}
            />
            <select value={statusFilter} onChange={(e)=>{ setStatusFilter(e.target.value); setPage(1); setItems([]); setHasMore(true); fetchDigest(1, { replace: true }); }} style={{ padding:'6px 10px' }}>
              <option value="all">Mind</option>
              <option value="unpaid">Kifizetetlen</option>
              <option value="paid">Kifizetett</option>
              <option value="due">Esedékes</option>
            </select>
            <select value={paymentFilter} onChange={(e)=>{ setPaymentFilter(e.target.value); setPage(1); setItems([]); setHasMore(true); fetchDigest(1, { replace: true }); }} style={{ padding:'6px 10px' }}>
              <option value="all">Összes fizetési mód</option>
              <option value="TRANSFER">Átutalás</option>
              <option value="CASH">Készpénz</option>
              <option value="CARD">Kártya</option>
              <option value="VOUCHER">Utalvány</option>
              <option value="UTANVET">Utánvét</option>
              <option value="OTHER">Egyéb</option>
            </select>
            <select value={approvalFilter} onChange={(e)=>{ setApprovalFilter(e.target.value); setPage(1); setItems([]); setHasMore(true); fetchDigest(1, { replace: true }); }} style={{ padding:'6px 10px' }}>
              <option value="all">Összes jóváhagyás</option>
              <option value="approved">Csak jóváhagyott</option>
              <option value="unapproved">Csak nem jóváhagyott</option>
            </select>
          </div>
          <PrimaryButton onClick={()=>fetchDigest(1, { refresh: 1, replace: true })} disabled={loading}>
            <RefreshCw size={16}/> Frissítés
          </PrimaryButton>
          <SecondaryButton onClick={openBatches}>
            <FolderOpen size={16}/> Csomagok ({pendingCount})
          </SecondaryButton>
          <SecondaryButton onClick={openCreateBatchModal} disabled={selectedCount===0} title={selectedCount===0? 'Válassz átutalásos számlákat':''}>
            <PlusCircle size={16}/> Fizetési csomag készítése ({selectedCount})
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
          <div style={{ fontSize: 13, color: '#7f6b00' }}>
            Tételek: {editingBatch.item_count ?? (editingBatch.items?.length || 0)}
          </div>
        </EditInfoBar>
      )}
      <TableContainer>
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell></TableHeaderCell>
              <TableHeaderCell>Kibocsátó</TableHeaderCell>
              <TableHeaderCell>Adószám</TableHeaderCell>
              <TableHeaderCell>Számlaszám</TableHeaderCell>
              <TableHeaderCell>Kibocsátás</TableHeaderCell>
              <TableHeaderCell>Deviza</TableHeaderCell>
              <TableHeaderCell>Nettó</TableHeaderCell>
              <TableHeaderCell>ÁFA</TableHeaderCell>
              <TableHeaderCell>Bruttó</TableHeaderCell>
              <TableHeaderCell>Jóváhagyás</TableHeaderCell>
              <TableHeaderCell>Fizetési mód</TableHeaderCell>
              <TableHeaderCell>Művelet</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {items.map((row, idx) => {
              const key = rowKey(row);
              const isPaid = !!row.isPaid || (!!row.paymentDate && !row.remainingAmount);
              const isUnpaid = !isPaid && String(row.paymentMethod||'').toUpperCase() === 'TRANSFER';
              const paymentDisplayDate = row.paymentDisplayDate || row.paymentDate;
              const remainingAmount = row.remainingAmount;
              const overpaidAmount = row.overpaidAmount;
              const isTransfer = String(row.paymentMethod||'').toUpperCase() === 'TRANSFER';
              const dueText = row.dueDate ? row.dueDate : '-';
              return (
              <TableRow key={`${row.invoiceNumber||'row'}_${idx}`} $paid={isPaid} $unpaid={isUnpaid}>
                <TableCell style={{width:40}}>
                  {canSelect(row) ? (
                    <CheckboxBtn onClick={(e)=>toggleSelect(row, idx, e)} title="Kijelölés">
                      {selected.has(rowKey(row)) ? <CheckSquare size={18}/> : <Square size={18}/>} 
                    </CheckboxBtn>
                  ) : (
                    <span title="Nem átutalásos"> </span>
                  )}
                </TableCell>
                <TableCell title={row.supplierName}>{row.supplierName?.length>30? row.supplierName.slice(0,30)+'…':row.supplierName}</TableCell>
                <TableCell>{row.supplierTaxNumber}</TableCell>
                <TableCell>{row.invoiceNumber}</TableCell>
                <TableCell>{row.invoiceIssueDate}</TableCell>
                <TableCell>{row.currency}</TableCell>
                <TableCell className="text-right">{row.netAmount}</TableCell>
                <TableCell className="text-right">{row.vatAmount}</TableCell>
                <TableCell className="text-right">{row.grossAmount}</TableCell>
                <TableCell>
                  {canApproveInvoices ? (
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
                  )}
                </TableCell>
                <TableCell>
                  {needsPaymentMethod(row) ? (
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <select
                        value={paymentDrafts[rowKey(row)] ?? (String(row.paymentMethod||'').toUpperCase()==='OTHER' ? 'OTHER' : '')}
                        onChange={(e)=>setPaymentDrafts(prev => ({ ...prev, [rowKey(row)]: e.target.value }))}
                        style={{ padding:'6px 8px' }}
                      >
                        <option value="">Válassz…</option>
                        <option value="TRANSFER">Átutalás</option>
                        <option value="CASH">Készpénz</option>
                        <option value="CARD">Kártya</option>
                        <option value="VOUCHER">Utalvány</option>
                        <option value="UTANVET">Utánvét</option>
                        <option value="OTHER">Egyéb</option>
                      </select>
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
                        <span>{formatPaymentMethod(row.paymentMethod)}</span>
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
                        remainingAmount || overpaidAmount ? (
                          <>
                            <StatusPill variant="unpaid">
                              Esedékes: {dueText}
                            </StatusPill>
                            {paymentDisplayDate && (
                              <SmallMuted>Utolsó fizetés: {paymentDisplayDate}</SmallMuted>
                            )}
                            {remainingAmount && (
                              <SmallMuted>Fennmaradó összeg: {formatMoney(remainingAmount)} {row.currency}</SmallMuted>
                            )}
                            {overpaidAmount && (
                              <SmallMuted>Túlfizetés: {formatMoney(overpaidAmount)} {row.currency}</SmallMuted>
                            )}
                          </>
                        ) : (
                          <StatusPill variant="paid">
                            Kifizetve: {paymentDisplayDate || dueText}
                          </StatusPill>
                        )
                      ) : (
                        <StatusPill variant="paid">
                          Kifizetve: {paymentDisplayDate || row.invoiceIssueDate || '-'}
                        </StatusPill>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <IconButton onClick={()=>openXmlInline(row.invoiceNumber, row.supplierTaxNumber)} title="Megnyitás">
                    <Eye size={16}/>
                  </IconButton>
                  <div style={{ height: 6 }} />
                  <IconButton onClick={()=>openAttachments(row.invoiceNumber, row.supplierTaxNumber)} title="Csatolmányok">
                    <Upload size={16}/>
                  </IconButton>
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
        {(loading && items.length===0) && <div style={{padding:16}}>Betöltés…</div>}
        {errorMsg && <div style={{padding:16, color:'#c00'}}>{errorMsg}</div>}
        {/* sentinel for infinite scroll */}
        <Sentinel id="incoming-sentinel" />
        {isFetchingMore && <div style={{padding:16}}>További találatok betöltése…</div>}
        {!hasMore && items.length>0 && <div style={{padding:16, color:'#6c757d'}}>Nincs több találat.</div>}
      </TableContainer>

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
                            {parsed.exchangeRate && (<><div>Árfolyam</div><div>{parsed.exchangeRate}</div></>)}
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
                <select value={batchBankAccount} onChange={e=>{
                  const id = e.target.value; setBatchBankAccount(id);
                  const acc = (Array.isArray(bankAccounts)? bankAccounts: []).find(a => String(a.id)===String(id));
                  if (acc && acc.currency) setBatchCurrency(acc.currency);
                }} style={{flex:1, padding:6}}>
                  <option value="">-- válassz --</option>
                  {(Array.isArray(bankAccounts) ? bankAccounts : []).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {(acc.bank_name ? acc.bank_name + ' - ' : '') + (acc.iban || acc.account_number || '')}
                      {acc.currency ? ` (${acc.currency})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:8}}>
                <label style={{width:160}}>Pénznem</label>
                <input value={batchCurrency || selectedCurrencies[0] || 'HUF'} readOnly style={{width:120, padding:6}} />
              </div>
              {selectedCount>0 && batchCurrency && selectedRows.some(r => r.currency && r.currency !== batchCurrency) && (
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
                        <th style={{ textAlign:'left', padding:6, borderBottom:'1px solid #eee', width:150 }}>Bruttó összeg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRowsForBatch.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding:10, textAlign:'center', color:'#7f8c8d' }}>Nincs megjeleníthető tétel.</td>
                        </tr>
                      ) : (
                        selectedRowsForBatch.map((r, idx) => (
                          <tr key={rowKey(r)}>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{idx + 1}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.supplierName || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>{r.invoiceNumber || '-'}</td>
                            <td style={{ padding:6, borderBottom:'1px solid #f5f5f5' }}>
                              {(formatMoney(r.grossAmount) ?? '-')} {effectiveBatchCurrency || ''}
                            </td>
                          </tr>
                        ))
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
                                <th style={{textAlign:'left', padding:6, borderBottom:'1px solid #eee'}}>Bruttó összeg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.items.map((it, idx) => (
                                <tr key={it.id}>
                                  <td style={{padding:6}}>{idx+1}</td>
                                  <td style={{padding:6}}>{it.supplier_name || '-'}</td>
                                  <td style={{padding:6}}>{it.invoice_number}</td>
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
                <select value={uploadType} onChange={(e)=>setUploadType(e.target.value)}>
                  <option value="IMAGE">Számlakép</option>
                  <option value="OTHER">Egyéb</option>
                </select>
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
    </InvoicesContainer>
  );
}
