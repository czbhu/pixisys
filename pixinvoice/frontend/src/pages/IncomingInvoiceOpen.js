import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { toast } from 'react-toastify';
import api, { incomingDocsAPI, customerAPI, customerBankAccountAPI, companyAPI } from '../services/api';
import '../print.css';

const cardStyle = {
  background: '#f8fafc',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 10,
};

const tableCell = {
  padding: 6,
  border: '1px solid #ddd',
};

const DOC_TYPE_OPTIONS = [
  { value: 'IMAGE', label: 'számlakép' },
  { value: 'OTHER', label: 'egyéb' },
  { value: 'CONTRACT', label: 'szerződés' },
  { value: 'SUPPLIER', label: 'szállító' },
  { value: 'PERFORMANCE_CERT', label: 'teljesítés igazolás' },
];

const DOC_TYPE_LABEL = DOC_TYPE_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

function decodeInvoicePayload(rawText) {
  let text = String(rawText || '');
  try {
    if (text && (text.includes('QueryInvoiceDataResponse') || text.includes('invoiceDataResult'))) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      const els = doc.getElementsByTagNameNS('*', 'invoiceData');
      const compEls = doc.getElementsByTagNameNS('*', 'compressedContentIndicator');
      if (els && els[0] && els[0].textContent) {
        const b64 = els[0].textContent.trim();
        const isCompressed = compEls && compEls[0] && /true/i.test(compEls[0].textContent || '');
        const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        if (isCompressed && typeof DecompressionStream !== 'undefined') {
          return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')))
            .arrayBuffer()
            .then((buf) => new TextDecoder('utf-8').decode(buf));
        }
        if (!isCompressed) return Promise.resolve(new TextDecoder('utf-8').decode(raw));
      }
    }
  } catch (_) {}
  return Promise.resolve(text);
}

function parseIncomingXmlForPrint(xmlRaw) {
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
      return Number.isNaN(n) ? null : n;
    };

    const invoiceNumber = firstText('invoiceNumber') || firstText('fulfillmentDocumentNumber');
    const issueDate = firstText('invoiceIssueDate') || firstText('issueDate');
    const deliveryDate = firstText('invoiceDeliveryDate') || firstText('fulfillmentDate');
    const paymentDate = firstText('paymentDate') || firstText('dueDate');
    const paymentMethod = firstText('paymentMethod');
    const currency = firstText('invoiceCurrencyCode') || firstText('invoiceCurrency') || firstText('currencyCode') || firstText('currency');
    const navBankAccount = (
      firstText('supplierBankAccountNumber')
      || firstText('bankAccountNumber')
      || firstText('creditorAccountNumber')
      || firstText('payeeFinancialAccount')
    );

    const supplierInfo = doc.getElementsByTagNameNS('*', 'supplierInfo')[0] || doc;
    const customerInfo = doc.getElementsByTagNameNS('*', 'customerInfo')[0] || doc;
    const supplierName = textFrom(supplierInfo, 'supplierName') || firstText('supplierName');
    const supplierTax = textFrom(supplierInfo, 'supplierTaxNumber') || firstText('supplierTaxNumber');
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

    const lines = all('line').map((ln, idx) => {
      const description = textFrom(ln, 'lineDescription') || textFrom(ln, 'productName') || '';
      const lineNumber = textFrom(ln, 'lineNumber') || String(idx + 1);
      const productCodes = Array.from(ln.getElementsByTagNameNS('*', 'productCode')).map((pc) => {
        const cat = textFrom(pc, 'productCodeCategory') || textFrom(pc, 'productCodeCategoryOwn');
        const val = textFrom(pc, 'productCodeValue');
        return [cat, val].filter(Boolean).join(':');
      }).filter(Boolean);
      const qty = number(textFrom(ln, 'quantity')) || number(textFrom(ln, 'lineQuantity'));
      const unit = textFrom(ln, 'unitOfMeasure') || textFrom(ln, 'unitOfMeasureOwn') || '';
      let unitPrice = number(textFrom(ln, 'unitPrice')) || number(textFrom(ln, 'unitPriceHUF'));
      if (unitPrice == null) {
        const up = ln.getElementsByTagNameNS('*', 'unitPrice')[0] || ln.getElementsByTagNameNS('*', 'lineUnitPrice')[0];
        if (up) unitPrice = number(up.textContent);
      }
      const vatPct = number(textFrom(ln, 'vatPercentage'));
      const net = number(textFrom(ln, 'lineNetAmount')) || number(textFrom(ln, 'netAmount'));
      const vat = number(textFrom(ln, 'lineVatAmount')) || number(textFrom(ln, 'vatAmount'));
      const gross = number(textFrom(ln, 'lineGrossAmount')) || number(textFrom(ln, 'grossAmount'));
      return { description, lineNumber, productCodes, qty, unit, unitPrice, net, vat, gross, vatPct };
    });

    let totalNet = number(firstText('invoiceNetAmount')) || null;
    let totalVat = number(firstText('invoiceVatAmount')) || null;
    let totalGross = number(firstText('invoiceGrossAmount')) || null;
    if (totalNet == null || totalVat == null || totalGross == null) {
      totalNet = 0;
      totalVat = 0;
      totalGross = 0;
      lines.forEach((line) => {
        totalNet += line.net || 0;
        totalVat += line.vat || 0;
        totalGross += line.gross || ((line.net || 0) + (line.vat || 0));
      });
    }

    const vatSummary = Array.from(doc.getElementsByTagNameNS('*', 'summaryByVatRate')).map((group) => {
      const ratePct = number(textFrom(group, 'vatPercentage'));
      const label = ratePct != null ? `${ratePct}%` : (textFrom(group, 'vatExemption') || 'Különböző');
      const net = number(textFrom(group, 'vatRateNetAmount')) || number(textFrom(group, 'netAmount'));
      const vat = number(textFrom(group, 'vatRateVatAmount')) || number(textFrom(group, 'vatAmount'));
      const gross = number(textFrom(group, 'vatRateGrossAmount')) || number(textFrom(group, 'grossAmount'));
      return { label, net, vat, gross };
    });

    return {
      invoiceNumber,
      issueDate,
      deliveryDate,
      paymentDate,
      paymentMethod,
      navBankAccount,
      currency,
      supplier: {
        name: supplierName,
        taxNumber: supplierTax,
        addressLines: addressToLines(supplierAddr),
      },
      customer: {
        name: customerName,
        taxNumber: customerTax,
        addressLines: addressToLines(customerAddr),
      },
      lines,
      vatSummary,
      totals: {
        net: totalNet,
        vat: totalVat,
        gross: totalGross,
      },
    };
  } catch (_) {
    return null;
  }
}

export default function IncomingInvoiceOpen() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const companyId = params.get('company_id') || '';
  const invoiceNumber = params.get('invoice_number') || '';
  const supplierTaxNumber = params.get('supplier_tax_number') || '';
  const externalOutgoing = String(params.get('external_outgoing') || '').toLowerCase() === '1' || String(params.get('external_outgoing') || '').toLowerCase() === 'true';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);
  const [rawXml, setRawXml] = useState('');
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('IMAGE');
  const [uploadComment, setUploadComment] = useState('');
  const [crmSupplierBankAccount, setCrmSupplierBankAccount] = useState('');
  const [buyerCompany, setBuyerCompany] = useState(null);
  const fileInputRef = useRef(null);

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtMaybe = (n, digits = 2) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const fmtQty = (n) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 4 }));

  const formatTaxDisplay = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    if (digits.length >= 11) return `${digits.slice(0, 8)}-${digits.slice(8, 9)}-${digits.slice(9, 11)}`;
    if (digits.length === 8) return digits;
    return value || '-';
  };

  const companyAddressLine = [
    buyerCompany?.street_name,
    buyerCompany?.public_place_category,
    buyerCompany?.street_number,
  ].filter(Boolean).join(' ');

  const resolveDocUrl = (filePath) => {
    if (!filePath || typeof filePath !== 'string') return null;
    return /^https?:\/\//i.test(filePath) ? filePath : `${api.defaults.baseURL || ''}${filePath}`;
  };

  const isPrintableDoc = (doc) => {
    const name = String(doc?.original_name || doc?.file || '').toLowerCase();
    const ct = String(doc?.content_type || '').toLowerCase();
    return ct.includes('pdf') || ct.includes('image/') || /\.(pdf|png|jpe?g|webp)$/i.test(name);
  };

  const printDocUrl = (url) => {
    if (!url) return;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;

    const cleanup = () => {
      setTimeout(() => {
        try { document.body.removeChild(frame); } catch (_) {}
      }, 1200);
    };

    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (_) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } finally {
        cleanup();
      }
    };

    frame.onerror = () => {
      cleanup();
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    document.body.appendChild(frame);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!companyId || !invoiceNumber) {
        setError('Hiányzó paraméter: company_id vagy invoice_number.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await api.post('/api/invoices/incoming/download/', {
          company_id: companyId,
          invoice_number: invoiceNumber,
          supplier_tax_number: supplierTaxNumber || undefined,
          inline: 1,
          external_outgoing: externalOutgoing ? 1 : undefined,
        }, { responseType: 'text' });
        const text = await decodeInvoicePayload(typeof res.data === 'string' ? res.data : String(res.data || ''));
        if (!active) return;
        setRawXml(text || '');
        setParsed(parseIncomingXmlForPrint(text || ''));
      } catch (err) {
        if (!active) return;
        const msg = err?.response?.data || err?.message || 'Nem sikerült megnyitni a számla XML-t.';
        setError(typeof msg === 'string' ? msg : 'Nem sikerült megnyitni a számla XML-t.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [companyId, invoiceNumber, supplierTaxNumber, externalOutgoing]);

  useEffect(() => {
    let active = true;
    const loadCompany = async () => {
      if (!companyId) {
        setBuyerCompany(null);
        return;
      }
      try {
        const res = await companyAPI.getCompany(companyId);
        if (active) setBuyerCompany(res?.data || null);
      } catch {
        if (active) setBuyerCompany(null);
      }
    };
    loadCompany();
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    let active = true;
    const loadCrmSupplierBank = async () => {
      const taxRaw = parsed?.supplier?.taxNumber || supplierTaxNumber;
      const taxDigits = String(taxRaw || '').replace(/\D+/g, '');
      if (!taxDigits) {
        if (active) setCrmSupplierBankAccount('');
        return;
      }
      try {
        const customerRes = await customerAPI.getCustomers({
          company_id: companyId || undefined,
          type: 'supplier',
          search: taxDigits,
          page_size: 50,
        });
        const rows = Array.isArray(customerRes.data)
          ? customerRes.data
          : (customerRes.data?.results || []);

        const matched = rows.find((row) => {
          const candidateTax = String(row?.tax_number || row?.full_tax_number || '').replace(/\D+/g, '');
          return candidateTax && (candidateTax === taxDigits || candidateTax.startsWith(taxDigits) || taxDigits.startsWith(candidateTax));
        });

        if (!matched?.id) {
          if (active) setCrmSupplierBankAccount('');
          return;
        }

        const accRes = await customerBankAccountAPI.getAccounts({ customer_id: matched.id });
        const accRows = Array.isArray(accRes.data)
          ? accRes.data
          : (accRes.data?.results || []);

        const approved = accRows.filter((acc) => acc?.is_approved !== false);
        const selected = approved.find((acc) => acc?.is_primary)
          || approved[0]
          || accRows.find((acc) => acc?.is_primary)
          || accRows[0];

        const value = (selected?.iban || selected?.account_number || '').trim();
        if (active) setCrmSupplierBankAccount(value || '');
      } catch {
        if (active) setCrmSupplierBankAccount('');
      }
    };

    loadCrmSupplierBank();
    return () => { active = false; };
  }, [companyId, parsed, supplierTaxNumber]);

  const loadDocs = async () => {
    if (!companyId || !invoiceNumber) return;
    setDocsLoading(true);
    try {
      const res = await incomingDocsAPI.list({
        company_id: companyId,
        invoice_number: invoiceNumber,
        supplier_tax_number: supplierTaxNumber || undefined,
      });
      const rows = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setDocs(rows);
    } catch (err) {
      toast.error('Csatolmányok lekérdezési hiba');
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, invoiceNumber, supplierTaxNumber]);

  // ESC billentyű és vissza gomb: zárja be a lapot
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') window.close();
    };
    const handlePopState = () => {
      window.close();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const doUpload = async (file) => {
    if (!file || !companyId || !invoiceNumber) return;
    setUploading(true);
    try {
      await incomingDocsAPI.upload({
        company_id: companyId,
        invoice_number: invoiceNumber,
        supplier_tax_number: supplierTaxNumber || undefined,
        type: uploadType,
        comment: uploadComment,
        file,
      });
      setUploadComment('');
      await loadDocs();
      toast.success('Fájl feltöltve');
    } catch (err) {
      toast.error('Feltöltési hiba');
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (event) => {
    const file = event?.target?.files?.[0];
    if (file) await doUpload(file);
    if (event?.target) event.target.value = '';
  };

  const onDropFiles = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await doUpload(file);
    }
  };

  const deleteDoc = async (docId) => {
    try {
      await incomingDocsAPI.delete(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Dokumentum törölve');
    } catch (err) {
      toast.error('Törlési hiba');
    }
  };

  const saveComment = async (doc, comment) => {
    const normalized = String(comment || '');
    if (normalized === String(doc.comment || '')) return;
    try {
      await incomingDocsAPI.setComment(doc.id, normalized);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, comment: normalized } : d)));
      toast.success('Megjegyzés mentve');
    } catch (err) {
      toast.error('Megjegyzés mentési hiba');
    }
  };

  const renderAttachments = () => (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 10 }}>Feltöltött fájlok:</h3>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => window.print()}>
          Nyomtatás (összesítő nézet)
        </button>
        <button
          type="button"
          onClick={() => {
            const firstPrintable = (docs || []).find((doc) => isPrintableDoc(doc));
            const url = resolveDocUrl(firstPrintable?.file);
            if (!url) {
              toast.info('Nincs nyomtatható számlakép csatolmány.');
              return;
            }
            printDocUrl(url);
          }}
        >
          Számlakép nyomtatása
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'center' }}>
        <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
          {DOC_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={uploadComment}
          onChange={(e) => setUploadComment(e.target.value)}
          placeholder="Megjegyzés feltöltéshez"
          style={{ minWidth: 280, padding: 6 }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Feltöltés…' : 'Fájl feltöltés'}
        </button>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onPickFile} />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDropFiles}
        style={{ border: '2px dashed #95a5a6', borderRadius: 8, padding: 14, textAlign: 'center', color: '#6b7280', marginBottom: 10 }}
      >
        Húzd ide a fájlokat feltöltéshez (DnD)
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={tableCell}>ID</th>
            <th style={tableCell}>Típus</th>
            <th style={tableCell}>Link</th>
            <th style={tableCell}>Nyomtatás</th>
            <th style={tableCell}>Megjegyzés</th>
            <th style={tableCell}>Törlés</th>
          </tr>
        </thead>
        <tbody>
          {docsLoading ? (
            <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center' }}>Betöltés…</td></tr>
          ) : docs.length === 0 ? (
            <tr><td colSpan={6} style={{ ...tableCell, textAlign: 'center', color: '#6b7280' }}>Nincs feltöltött fájl</td></tr>
          ) : docs.map((doc) => {
            const fileUrl = resolveDocUrl(doc.file);
            const printable = isPrintableDoc(doc);
            return (
              <tr key={doc.id}>
                <td style={{ ...tableCell, fontSize: 12, wordBreak: 'break-all' }}>{doc.id}</td>
                <td style={tableCell}>{DOC_TYPE_LABEL[doc.type] || doc.type || '-'}</td>
                <td style={tableCell}>
                  {fileUrl ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer">{doc.original_name || 'Megnyitás'}</a>
                  ) : '-'}
                </td>
                <td style={{ ...tableCell, textAlign: 'center' }}>
                  {fileUrl && printable ? (
                    <button
                      type="button"
                      onClick={() => printDocUrl(fileUrl)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 10px', background: '#fff', cursor: 'pointer' }}
                    >
                      Nyomtatás
                    </button>
                  ) : '-'}
                </td>
                <td style={tableCell}>
                  <input
                    defaultValue={doc.comment || ''}
                    placeholder="Megjegyzés"
                    onBlur={(e) => saveComment(doc, e.target.value)}
                    style={{ width: '100%', padding: 6 }}
                  />
                </td>
                <td style={{ ...tableCell, textAlign: 'center' }}>
                  <button type="button" onClick={() => deleteDoc(doc.id)} style={{ color: '#fff', background: '#c0392b', border: 'none', padding: '6px 10px', borderRadius: 4 }}>
                    Törlés
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return <div style={{ padding: 24 }}><Spin size="large" tip="Betöltés..." /></div>;
  }

  if (error) {
    return <div style={{ padding: 24, color: '#b91c1c' }}>{error}</div>;
  }

  if (!parsed) {
    return (
      <div style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Számla XML: {invoiceNumber || '-'}</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f8fafc', border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
          {rawXml}
        </pre>
        {renderAttachments()}
      </div>
    );
  }

  return (
    <>
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Számla: {parsed.invoiceNumber || invoiceNumber || '-'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: (externalOutgoing || parsed.customer?.name) ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Szállító</div>
          <div>{parsed.supplier?.name || '-'}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Adószám: {parsed.supplier?.taxNumber || '-'}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>CRM bankszámla: {crmSupplierBankAccount || '-'}</div>
          {(parsed.supplier?.addressLines || []).map((line, idx) => <div key={`sup-${idx}`}>{line}</div>)}
        </div>
        {(externalOutgoing || parsed.customer?.name) && (
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Vevő</div>
            <div>{parsed.customer?.name || '-'}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Adószám: {parsed.customer?.taxNumber || '-'}</div>
            {(parsed.customer?.addressLines || []).map((line, idx) => <div key={`cust-${idx}`}>{line}</div>)}
          </div>
        )}
        <div style={cardStyle}>
          <div><strong>Kelt:</strong> {parsed.issueDate || '-'}</div>
          <div><strong>Teljesítés:</strong> {parsed.deliveryDate || '-'}</div>
          <div><strong>Esedékesség:</strong> {parsed.paymentDate || '-'}</div>
          <div><strong>Fizetési mód:</strong> {parsed.paymentMethod || '-'}</div>
          <div><strong>NAV XML bankszámla:</strong> {parsed.navBankAccount || '-'}</div>
          <div><strong>Deviza:</strong> {parsed.currency || '-'}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={tableCell}>#</th>
            <th style={tableCell}>Megnevezés</th>
            <th style={tableCell}>Termékkód</th>
            <th style={tableCell}>Menny.</th>
            <th style={tableCell}>Egység</th>
            <th style={tableCell}>Egységár</th>
            <th style={tableCell}>Nettó</th>
            <th style={tableCell}>ÁFA</th>
            <th style={tableCell}>Bruttó</th>
            <th style={tableCell}>ÁFA %</th>
          </tr>
        </thead>
        <tbody>
          {(parsed.lines || []).map((line, idx) => (
            <tr key={`line-${idx}`}>
              <td style={{ ...tableCell, textAlign: 'center' }}>{line.lineNumber || idx + 1}</td>
              <td style={tableCell}>{line.description || '-'}</td>
              <td style={{ ...tableCell, textAlign: 'center' }}>{(line.productCodes || []).join(', ')}</td>
              <td style={{ ...tableCell, textAlign: 'center' }}>{line.qty ?? '-'}</td>
              <td style={{ ...tableCell, textAlign: 'center' }}>{line.unit || ''}</td>
              <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(line.unitPrice)}</td>
              <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(line.net)}</td>
              <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(line.vat)}</td>
              <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(line.gross)}</td>
              <td style={{ ...tableCell, textAlign: 'center' }}>{line.vatPct == null ? '-' : `${line.vatPct}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(parsed.vatSummary || []).length > 0 && (
        <>
          <div style={{ fontWeight: 700, margin: '8px 0 6px' }}>ÁFA összesítő</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={tableCell}>ÁFA %</th>
                <th style={tableCell}>Nettó</th>
                <th style={tableCell}>ÁFA</th>
                <th style={tableCell}>Bruttó</th>
              </tr>
            </thead>
            <tbody>
              {parsed.vatSummary.map((row, idx) => (
                <tr key={`vat-${idx}`}>
                  <td style={{ ...tableCell, textAlign: 'center' }}>{row.label || '-'}</td>
                  <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(row.net)}</td>
                  <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(row.vat)}</td>
                  <td style={{ ...tableCell, textAlign: 'right' }}>{fmt(row.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ minWidth: 260, borderTop: '1px solid #ddd', paddingTop: 8 }}>
          <div><strong>Nettó:</strong> {fmt(parsed.totals?.net)}</div>
          <div><strong>ÁFA:</strong> {fmt(parsed.totals?.vat)}</div>
          <div><strong>Összesen:</strong> {fmt(parsed.totals?.gross)} {parsed.currency || ''}</div>
        </div>
      </div>

      {renderAttachments()}
    </div>
    {createPortal((
      <div className="print-invoice print-only">
        <table className="inv-main-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <td colSpan="2" style={{ padding: '2mm', border: 'none' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '35%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top' }}>
                        <strong>{parsed.supplier?.name || '—'}</strong><br/>
                        Adószám: {formatTaxDisplay(parsed.supplier?.taxNumber)}
                      </td>
                      <td style={{ width: '30%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top', textAlign: 'center' }}>
                        <strong style={{ fontSize: '11pt' }}>{parsed.invoiceNumber || invoiceNumber || '—'}</strong><br/>
                        Kelt: {parsed.issueDate || '—'}
                      </td>
                      <td style={{ width: '35%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top', textAlign: 'right' }}>
                        <strong>{buyerCompany?.name || 'Ceze Kft'}</strong><br/>
                        Fizetendő: <strong>{fmtMaybe(parsed.totals?.gross)} {parsed.currency || ''}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="2" style={{ border: 'none', padding: 0 }}>
                <div className="inv-header-wrapper inv-header-first-page">
                  <div className="inv-header">
                    <div className="inv-col-left">
                      <div className="inv-seller">
                        <div className="inv-block-title" style={{ marginBottom: '1mm', fontSize: '0.9em', color:'#666' }}>
                          Szállító:
                        </div>
                        <div className="inv-seller-name">{parsed.supplier?.name || '—'}</div>
                        <div>Adószám: {formatTaxDisplay(parsed.supplier?.taxNumber)}</div>
                        {(parsed.supplier?.addressLines || []).map((line, idx) => <div key={`print-sup-${idx}`}>{line}</div>)}
                        {crmSupplierBankAccount ? <div style={{ marginTop: '1mm' }}>Bankszámla: {crmSupplierBankAccount}</div> : null}
                      </div>
                    </div>

                    <div className="inv-col-right">
                      <div className="inv-title">Számla</div>
                      <div className="inv-number">Számlaszám: {parsed.invoiceNumber || invoiceNumber || '—'}</div>

                      <div className="inv-buyer-sm" style={{ marginTop: '4mm' }}>
                        <div className="inv-block-title">Vevő</div>
                        <div className="inv-buyer-name">{buyerCompany?.name || 'Ceze Kft'}</div>
                        {(buyerCompany?.tax_number || buyerCompany?.full_tax_number) ? (
                          <div>Adószám: {formatTaxDisplay(buyerCompany?.full_tax_number || buyerCompany?.tax_number)}</div>
                        ) : null}
                        {(buyerCompany?.postal_code || buyerCompany?.city) ? (
                          <div>{(buyerCompany?.postal_code || '')} {buyerCompany?.city || ''}</div>
                        ) : null}
                        {companyAddressLine ? <div>{companyAddressLine}</div> : null}
                        {buyerCompany?.country ? <div>{buyerCompany.country}</div> : null}
                      </div>

                      <div className="inv-highlight" style={{ marginTop: '4mm' }}>
                        <div className="inv-amount">
                          <span className="label">Fizetendő</span>
                          <span className="value">{fmtMaybe(parsed.totals?.gross)} {parsed.currency || ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="inv-meta-row" style={{ marginTop: '3mm' }}>
                    <div><strong>Kiállítás:</strong> {parsed.issueDate || '-'}</div>
                    <div><strong>Teljesítés:</strong> {parsed.deliveryDate || '-'}</div>
                    <div><strong>Fizetési határidő:</strong> {parsed.paymentDate || '-'}</div>
                    <div><strong>Fizetési mód:</strong> {parsed.paymentMethod || '-'}</div>
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td colSpan="2" style={{ border: 'none', padding: 0 }}>
                <table className="inv-items" style={{ width: '100%', marginTop: '4mm' }}>
                  <thead>
                    <tr className="inv-items-header-row">
                      <th className="col-desc">Megnevezés</th>
                      <th className="cen col-qty">Menny.</th>
                      <th className="cen col-unit">Egység</th>
                      <th className="num col-unitnet">Egységár</th>
                      <th className="cen col-vatrate">ÁFA</th>
                      <th className="num col-net">Nettó</th>
                      <th className="num col-vat">ÁFA értéke</th>
                      <th className="num col-gross">Bruttó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(parsed.lines || []).map((line, idx) => (
                      <tr key={`print-line-${idx}`}>
                        <td className="col-desc">
                          {line.description || '-'}
                          {(line.productCodes || []).length > 0 ? (
                            <div className="muted" style={{ fontSize: '0.8em' }}>Kód: {(line.productCodes || []).join(', ')}</div>
                          ) : null}
                        </td>
                        <td className="cen col-qty">{fmtQty(line.qty)}</td>
                        <td className="cen col-unit">{line.unit || '-'}</td>
                        <td className="num col-unitnet">{fmtMaybe(line.unitPrice)}</td>
                        <td className="cen col-vatrate vat-rate-cell">{line.vatPct == null ? '-' : `${line.vatPct}%`}</td>
                        <td className="num col-net">{fmtMaybe(line.net)}</td>
                        <td className="num col-vat">{fmtMaybe(line.vat)}</td>
                        <td className="num col-gross">{fmtMaybe(line.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>

            <tr>
              <td style={{ width: '65%', border: 'none', paddingTop: '3mm', verticalAlign: 'top' }}>
                {(parsed.vatSummary || []).length > 0 ? (
                  <table className="inv-items vat-summary-table" style={{ marginTop: '2mm', width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                    <colgroup>
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '26%' }} />
                      <col style={{ width: '27%' }} />
                      <col style={{ width: '27%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="cen">ÁFA</th>
                        <th className="num">Nettó összeg</th>
                        <th className="num">ÁFA összeg</th>
                        <th className="num">Bruttó összeg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(parsed.vatSummary || []).map((row, idx) => (
                        <tr key={`print-vat-${idx}`}>
                          <td className="cen">{row.label || '-'}</td>
                          <td className="num">{fmtMaybe(row.net)}</td>
                          <td className="num">{fmtMaybe(row.vat)}</td>
                          <td className="num">{fmtMaybe(row.gross)}</td>
                        </tr>
                      ))}
                      <tr>
                        <th>Összesen ({parsed.currency || ''})</th>
                        <th className="num">{fmtMaybe(parsed.totals?.net)}</th>
                        <th className="num">{fmtMaybe(parsed.totals?.vat)}</th>
                        <th className="num inv-gross-total">{fmtMaybe(parsed.totals?.gross)}</th>
                      </tr>
                    </tbody>
                  </table>
                ) : null}
              </td>
              <td style={{ width: '35%', border: 'none', paddingTop: '3mm', verticalAlign: 'top' }}>
                <table className="inv-items" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td><strong>Nettó</strong></td>
                      <td className="num">{fmtMaybe(parsed.totals?.net)}</td>
                    </tr>
                    <tr>
                      <td><strong>ÁFA</strong></td>
                      <td className="num">{fmtMaybe(parsed.totals?.vat)}</td>
                    </tr>
                    <tr>
                      <td><strong>Fizetendő</strong></td>
                      <td className="num"><strong>{fmtMaybe(parsed.totals?.gross)} {parsed.currency || ''}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ), document.body)}
    </>
  );
}
