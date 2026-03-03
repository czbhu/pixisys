import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { toast } from 'react-toastify';
import api, { incomingDocsAPI } from '../services/api';

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
  const fileInputRef = useRef(null);

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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
            <th style={tableCell}>Megjegyzés</th>
            <th style={tableCell}>Törlés</th>
          </tr>
        </thead>
        <tbody>
          {docsLoading ? (
            <tr><td colSpan={5} style={{ ...tableCell, textAlign: 'center' }}>Betöltés…</td></tr>
          ) : docs.length === 0 ? (
            <tr><td colSpan={5} style={{ ...tableCell, textAlign: 'center', color: '#6b7280' }}>Nincs feltöltött fájl</td></tr>
          ) : docs.map((doc) => {
            const fileUrl = (doc.file && typeof doc.file === 'string')
              ? (/^https?:\/\//i.test(doc.file) ? doc.file : `${api.defaults.baseURL || ''}${doc.file}`)
              : null;
            return (
              <tr key={doc.id}>
                <td style={{ ...tableCell, fontSize: 12, wordBreak: 'break-all' }}>{doc.id}</td>
                <td style={tableCell}>{DOC_TYPE_LABEL[doc.type] || doc.type || '-'}</td>
                <td style={tableCell}>
                  {fileUrl ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer">{doc.original_name || 'Megnyitás'}</a>
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
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Számla: {parsed.invoiceNumber || invoiceNumber || '-'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: (externalOutgoing || parsed.customer?.name) ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Szállító</div>
          <div>{parsed.supplier?.name || '-'}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Adószám: {parsed.supplier?.taxNumber || '-'}</div>
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
  );
}
