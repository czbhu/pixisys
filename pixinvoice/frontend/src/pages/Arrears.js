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
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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
  &:hover { background-color: #f8f9fa; }
`;

const Td = styled.td`
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;
`;

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

export default function Arrears() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId') || ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sending, setSending] = useState(false);
  const headerSelectRef = useRef(null);

  // Sort state
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Column widths (px)
  const DEFAULT_WIDTHS = { num: 140, customer: 180, issue: 100, delivery: 100, due: 100, payment: 110, amount: 130, status: 160, actions: 180 };
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);
  const resizingRef = useRef(null); // { key, startX, startW }

  // Email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalData, setEmailModalData] = useState(null); // { from, to, subject, body, customerId, invoiceId, advanceStatus }
  const [emailSending, setEmailSending] = useState(false);

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
    if (!sortKey) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
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
  }, [rows, sortKey, sortDir]);

  const selectedCount = selectedIds.size;
  const selectedVisibleCount = sortedRows.filter((r) => selectedIds.has(String(r.id))).length;
  const allVisibleSelected = sortedRows.length > 0 && selectedVisibleCount === sortedRows.length;

  useEffect(() => {
    if (!headerSelectRef.current) return;
    headerSelectRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }, [selectedVisibleCount, allVisibleSelected]);

  const toggleHeaderSelection = () => {
    if (selectedCount > 0) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set();
    sortedRows.forEach((r) => next.add(String(r.id)));
    setSelectedIds(next);
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
      const params = { company_id: companyId, invoice_id: row.id };
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
        invoiceId: String(row.id),
        advanceStatus: targetStatus || '',
      });
      setEmailModalOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'E-mail előkészítés sikertelen');
    }
  };

  const sendEmailFromModal = async (payload) => {
    setEmailSending(true);
    try {
      await invoiceAPI.sendArrearsSingleEmail({
        company_id: companyId,
        invoice_id: emailModalData.invoiceId,
        from: payload.from,
        to: payload.to,
        cc: payload.cc || [],
        bcc: payload.bcc || [],
        subject: payload.subject,
        body: payload.body,
        advance_status: emailModalData.advanceStatus || '',
      });
      toast.success('E-mail elküldve');
      setEmailModalOpen(false);
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'E-mail küldési hiba');
    } finally {
      setEmailSending(false);
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
  const renderTh = (key, label, style = {}) => (
    <Th style={{ width: colWidths[key], minWidth: 60, ...style }} onClick={() => handleSort(key)}>
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
        <Table>
          <Thead>
            <tr>
              <Th style={{ width: 36, minWidth: 36 }}>
                <input ref={headerSelectRef} type="checkbox" checked={allVisibleSelected} onChange={toggleHeaderSelection} />
              </Th>
              {renderTh('num', 'Számlaszám')}
              {renderTh('customer', 'Ügyfél')}
              {renderTh('issue', 'Kelt')}
              {renderTh('delivery', 'Teljesítés')}
              {renderTh('due', 'Esedékesség')}
              {renderTh('payment', 'Fizetési mód')}
              {renderTh('amount', 'Összeg')}
              {renderTh('status', 'Státusz')}
              <Th style={{ width: colWidths.actions, minWidth: 60 }}>
                Műveletek
                <ThResizeHandle onMouseDown={(e) => startResize(e, 'actions')} onClick={(e) => e.stopPropagation()} />
              </Th>
            </tr>
          </Thead>
          <tbody>
            {sortedRows.map((row) => {
              const rowNextStatus = row.next_status || NEXT_STATUS[row.arrears_status] || null;
              const currentStatus = row.arrears_status;
              const hasCurrent = !!NEXT_STATUS[currentStatus] || currentStatus === 'overdue';
              return (
                <Tr key={row.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(row.id))}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(String(row.id)); else next.delete(String(row.id));
                        setSelectedIds(next);
                      }}
                    />
                  </Td>
                  <Td>{row.invoice_number}</Td>
                  <Td>{row.customer?.name || '-'}</Td>
                  <Td>{formatDate(row.issue_date)}</Td>
                  <Td>{formatDate(row.delivery_date)}</Td>
                  <Td>{formatDate(row.due_date)}</Td>
                  <Td>{paymentMethodLabel(row.payment_method)}</Td>
                  <Td>{formatAmount(row.total_gross_amount, row.currency)}</Td>
                  <Td>
                    <StatusTag>{row.arrears_status_label || '-'}</StatusTag>
                    <Muted>{Number(row.days_in_status || 0)} nap</Muted>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Button onClick={() => navigate(`/invoices/${row.id}/edit`)}>Megnyitás</Button>
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
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {!loading && sortedRows.length === 0 && (
        <div style={{ padding: 16 }}>Nincs megjeleníthető lejárt számla.</div>
      )}
      <div style={{ padding: '12px 16px', color: '#6c757d' }}>{selectedCount} kiválasztva</div>

      {emailModalOpen && emailModalData && (
        <EmailModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          onSend={sendEmailFromModal}
          defaultFrom={emailModalData.from}
          defaultTo={emailModalData.to}
          defaultCc={emailModalData.cc}
          defaultBcc={emailModalData.bcc}
          defaultSubject={emailModalData.subject}
          defaultBody={emailModalData.body}
          customerId={emailModalData.customerId}
          invoiceId={emailModalData.invoiceId}
        />
      )}
    </Container>
  );
}

