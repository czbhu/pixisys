import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { invoiceAPI } from '../services/api';

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

const Th = styled.th`
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;
  background: #f8f9fa;
`;

const Td = styled.td`
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;
  color: #2c3e50;
  vertical-align: top;
`;

const Muted = styled.div`
  color: #6c757d;
  font-size: 12px;
  margin-top: 4px;
`;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('hu-HU') : '—');
const formatAmount = (amount, currency) => `${Number(amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();

export default function ScheduledInvoices() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId') || ''; } catch { return ''; }
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [sortBy, setSortBy] = useState('next');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [runsModal, setRunsModal] = useState({ open: false, title: '', rows: [] });
  const headerSelectRef = useRef(null);

  const loadRows = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await invoiceAPI.listScheduledInvoices({
        company_id: companyId,
        search,
        approval_filter: approvalFilter,
        active_filter: activeFilter,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setRows(res.data?.results || []);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Időzített számlák betöltése sikertelen');
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
  }, [companyId, approvalFilter, activeFilter, sortBy, sortDir]);

  const selectableRows = useMemo(() => rows.filter((r) => r.approval_required), [rows]);
  const selectedSelectableCount = selectableRows.filter((r) => selectedIds.has(String(r.id))).length;
  const allSelectableSelected = selectableRows.length > 0 && selectedSelectableCount === selectableRows.length;

  useEffect(() => {
    if (!headerSelectRef.current) return;
    headerSelectRef.current.indeterminate = selectedSelectableCount > 0 && !allSelectableSelected;
  }, [selectedSelectableCount, allSelectableSelected]);

  const toggleHeaderSelection = () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set();
    selectableRows.forEach((r) => next.add(String(r.id)));
    setSelectedIds(next);
  };

  const approveSelected = async () => {
    if (!companyId) { toast.error('Válassz céget'); return; }
    if (!selectedIds.size) { toast.info('Nincs kijelölt időzítés'); return; }
    try {
      const res = await invoiceAPI.approveScheduledInvoices({ company_id: companyId, schedule_ids: Array.from(selectedIds) });
      toast.success(`Jóváhagyva: ${Number(res.data?.approved || 0)}`);
      setSelectedIds(new Set());
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Jóváhagyás sikertelen');
    }
  };

  const toggleActive = async (row) => {
    try {
      await invoiceAPI.toggleScheduledInvoiceActive(row.id, { is_active: !row.is_active });
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Aktív állapot frissítése sikertelen');
    }
  };

  const deleteSchedule = async (row) => {
    if (!window.confirm('Biztosan törölni akarod ezt az időzítést?')) return;
    try {
      await invoiceAPI.deleteScheduledInvoice(row.id);
      toast.success('Időzítés törölve');
      await loadRows();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Törlés sikertelen');
    }
  };

  const openRuns = async (row) => {
    try {
      const res = await invoiceAPI.getScheduledInvoiceRuns(row.id);
      setRunsModal({ open: true, title: row.customer_name, rows: res.data?.results || [] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Számla lista betöltése sikertelen');
    }
  };

  return (
    <>
      <Container>
        <Header>
          <Title>Időzített számlák</Title>
          <Toolbar>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadRows(); }}
              placeholder="Gyorskereső (ügyfél)"
              style={{ padding: '8px 10px', minWidth: 220 }}
            />
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} style={{ padding: '8px 10px' }}>
              <option value="all">Mind (jóváhagyás)</option>
              <option value="approved">Jóváhagyott</option>
              <option value="unapproved">Nem jóváhagyott</option>
              <option value="automatic">Automatikus</option>
            </select>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} style={{ padding: '8px 10px' }}>
              <option value="active">Aktív</option>
              <option value="inactive">Inaktív</option>
              <option value="all">Mind</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px 10px' }}>
              <option value="customer">Rendezés: Ügyfél</option>
              <option value="last">Rendezés: Utolsó</option>
              <option value="next">Rendezés: Következő</option>
              <option value="amount">Rendezés: Összeg</option>
              <option value="approval">Rendezés: Jóváhagyás</option>
            </select>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={{ padding: '8px 10px' }}>
              <option value="asc">Növekvő</option>
              <option value="desc">Csökkenő</option>
            </select>
            <Button onClick={loadRows} disabled={loading}>Frissítés</Button>
            <PrimaryButton onClick={approveSelected} disabled={selectedIds.size === 0}>Kijelöltek jóváhagyása</PrimaryButton>
          </Toolbar>
        </Header>

        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    checked={allSelectableSelected}
                    onChange={toggleHeaderSelection}
                  />
                </Th>
                <Th>Ügyfél</Th>
                <Th>Gyakoriság</Th>
                <Th>Utolsó</Th>
                <Th>Következő</Th>
                <Th>Összeg</Th>
                <Th>Jóváhagyva</Th>
                <Th>Műveletek</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    {row.approval_required ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(String(row.id))}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(String(row.id));
                            else next.delete(String(row.id));
                            return next;
                          });
                        }}
                      />
                    ) : null}
                  </Td>
                  <Td>{row.customer_name}</Td>
                  <Td>{row.frequency_label}</Td>
                  <Td>{formatDate(row.last_issue_date)}</Td>
                  <Td>
                    {formatDate(row.next_issue_date)}
                    {row.last_error ? <Muted style={{ color: '#c0392b' }}>{row.last_error}</Muted> : null}
                  </Td>
                  <Td>{formatAmount(row.gross_amount, row.currency)}</Td>
                  <Td>{row.approval_label}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button onClick={() => navigate(`/invoices/new?scheduled_edit=${encodeURIComponent(row.id)}`)}>Szerkesztés</Button>
                      <Button onClick={() => openRuns(row)}>Számla lista</Button>
                      <Button onClick={() => toggleActive(row)}>{row.is_active ? 'Inaktiválás' : 'Aktiválás'}</Button>
                      <Button onClick={() => deleteSchedule(row)}>Törlés</Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <Td colSpan={8}>Nincs találat.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableWrap>
      </Container>

      {runsModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }} onClick={() => setRunsModal({ open: false, title: '', rows: [] })}>
          <div style={{ width: 'min(900px, 96vw)', maxHeight: '80vh', overflow: 'auto', background: '#fff', borderRadius: 8, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>Számla lista - {runsModal.title}</strong>
              <Button onClick={() => setRunsModal({ open: false, title: '', rows: [] })}>Bezárás</Button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>Számlaszám</Th>
                  <Th>Kelt</Th>
                  <Th>Esedékesség</Th>
                  <Th>Státusz</Th>
                  <Th>Összeg</Th>
                </tr>
              </thead>
              <tbody>
                {runsModal.rows.map((r) => (
                  <tr key={r.run_id}>
                    <Td>{r.invoice_number}</Td>
                    <Td>{formatDate(r.issue_date)}</Td>
                    <Td>{formatDate(r.due_date)}</Td>
                    <Td>{r.status}</Td>
                    <Td>{formatAmount(r.gross_amount, r.currency)}</Td>
                  </tr>
                ))}
                {!runsModal.rows.length && (
                  <tr><Td colSpan={5}>Nincs még kiállított számla.</Td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
