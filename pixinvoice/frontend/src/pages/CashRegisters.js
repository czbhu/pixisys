import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useQuery } from 'react-query';
import { toast } from 'react-toastify';
import api, { invoiceAPI } from '../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
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

const Body = styled.div`
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
`;

const Card = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px;
`;

const Filters = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FilterLabel = styled.label`
  font-size: 12px;
  color: #6b7280;
`;

const FilterInput = styled.input`
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
`;

const FilterSelect = styled.select`
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  min-height: 110px;
`;

const FilterActions = styled.div`
  display: flex;
  align-items: flex-end;
`;

const ActionButton = styled.button`
  border: 1px solid #d1d5db;
  background: white;
  color: #1f2937;
  border-radius: 8px;
  padding: 9px 12px;
  cursor: pointer;

  &:hover {
    background: #f9fafb;
  }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
`;

const Stat = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

const StatValue = styled.div`
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
  color: ${(p) => p.$danger ? '#b42318' : '#1f2937'};
`;

const TableWrap = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th, td { padding: 8px; border-bottom: 1px solid #edf2f7; text-align: left; }
  th { background: #f8fafc; color: #374151; }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid ${(p) => p.$positive ? '#86efac' : '#fecaca'};
  color: ${(p) => p.$positive ? '#166534' : '#991b1b'};
  background: ${(p) => p.$positive ? '#f0fdf4' : '#fef2f2'};
`;

const Empty = styled.div`
  padding: 18px;
  color: #6b7280;
`;

const InfoLine = styled.div`
  font-size: 13px;
  color: #4b5563;
`;

const formatAmount = (v) => Number(v || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2 });
const CASH_FETCH_PAGE_SIZE = 300;
const CASH_FETCH_MAX_PAGES = 200;

const parseDateValue = (val) => {
  const ts = Date.parse(val || '');
  return Number.isFinite(ts) ? ts : -Infinity;
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toOutgoingRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((inv) => {
      const status = String(inv?.status || '').toLowerCase();
      if (status === 'cancelled') return false;
      const pm = String(inv?.payment_method || '').toLowerCase();
      return pm === 'cash';
    })
    .map((inv) => {
      const grossFromField = Number(inv?.total_gross_amount ?? inv?.gross_amount ?? inv?.invoiceGrossAmount ?? 0);
      const net = Number(inv?.total_net_amount ?? inv?.net_amount ?? 0);
      const vat = Number(inv?.total_vat_amount ?? inv?.vat_amount ?? 0);
      const gross = Number.isFinite(grossFromField) && Math.abs(grossFromField) > 0.000001
        ? grossFromField
        : (net + vat);
      return {
        rowType: 'outgoing',
        date: inv?.payment_date || inv?.issue_date || inv?.created_at || null,
        direction: 'Bevétel',
        paymentMethod: (inv?.payment_method || 'cash').toUpperCase(),
        invoiceNumber: inv?.invoice_number || '-',
        partnerName: inv?.customer?.name || '-',
        amountSigned: Math.abs(gross),
        currency: inv?.currency || 'HUF',
        note: 'Kimenő készpénzes számla',
      };
    });
};

const toIncomingRows = (items) => {
  const list = Array.isArray(items) ? items : [];
  return list.map((row) => {
    const grossFromField = Number(row?.grossAmount ?? row?.gross_amount ?? row?.invoiceGrossAmount ?? row?.invoice_gross_amount ?? 0);
    const net = Number(row?.netAmount ?? row?.net_amount ?? row?.invoiceNetAmount ?? row?.invoice_net_amount ?? 0);
    const vat = Number(row?.vatAmount ?? row?.vat_amount ?? row?.invoiceVatAmount ?? row?.invoice_vat_amount ?? 0);
    const gross = Math.abs(grossFromField || (net + vat));
    return {
      rowType: 'incoming',
      date: row?.paymentDate || row?.payment_date || row?.invoiceIssueDate || row?.invoice_issue_date || row?.deliveryDate || row?.delivery_date || row?.insDate || row?.ins_date || null,
      direction: 'Kiadás',
      paymentMethod: String(row?.paymentMethod || row?.payment_method || 'CASH').toUpperCase(),
      invoiceNumber: row?.invoiceNumber || row?.invoice_number || '-',
      partnerName: row?.supplierName || row?.supplier_name || '-',
      amountSigned: -gross,
      currency: row?.currency || 'HUF',
      note: 'Bejövő készpénzes / utánvétes számla',
    };
  });
};

const buildRanges = (selectedYears, dateFrom, dateTo) => {
  if (dateFrom || dateTo) {
    return [{
      from: dateFrom || null,
      to: dateTo || null,
    }];
  }
  return [...selectedYears]
    .sort((a, b) => a - b)
    .map((year) => ({
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    }));
};

const fetchOutgoingCashRowsForRange = async (companyId, range) => {
  let page = 1;
  let pagesFetched = 0;
  const all = [];

  while (pagesFetched < CASH_FETCH_MAX_PAGES) {
    const res = await invoiceAPI.getInvoices({
      company_id: companyId,
      page,
      page_size: CASH_FETCH_PAGE_SIZE,
      issue_date_from: range.from || undefined,
      issue_date_to: range.to || undefined,
    });

    const payload = res?.data;
    if (Array.isArray(payload)) {
      all.push(...payload);
      break;
    }

    const results = Array.isArray(payload?.results) ? payload.results : [];
    all.push(...results);

    const hasNextByUrl = Boolean(payload?.next);
    const hasNextByCount = Number(payload?.count || 0) > (page * CASH_FETCH_PAGE_SIZE);
    if (!hasNextByUrl && !hasNextByCount) break;

    page += 1;
    pagesFetched += 1;
    if (results.length === 0) break;
  }

  return all;
};

const fetchIncomingCashCodRowsForRange = async (companyId, range) => {
  let page = 1;
  let pagesFetched = 0;
  const all = [];

  while (pagesFetched < CASH_FETCH_MAX_PAGES) {
    const res = await api.get('/api/invoices/incoming/', {
      params: {
        company_id: companyId,
        payment_method: 'CASH,COD',
        page,
        page_size: CASH_FETCH_PAGE_SIZE,
        refresh: 0,
        date_from: range.from || undefined,
        date_to: range.to || undefined,
      },
    });

    const payload = res?.data || {};
    const items = Array.isArray(payload?.items) ? payload.items : [];
    all.push(...items);

    const hasMore = Boolean(payload?.hasMore);
    if (!hasMore) break;

    page += 1;
    pagesFetched += 1;
    if (items.length === 0) break;
  }

  return all;
};

export default function CashRegisters() {
  const currentYear = new Date().getFullYear();
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem('selectedCompanyId'); } catch { return null; }
  });
  const [selectedYears, setSelectedYears] = useState([currentYear]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all'); // 'all' | 'income' | 'expense'

  const clearFilters = () => {
    setSelectedYears([currentYear]);
    setDateFrom('');
    setDateTo('');
    setDirectionFilter('all');
  };

  useEffect(() => {
    const readLS = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId');
        setCompanyId((prev) => (prev !== cid ? cid : prev));
      } catch {}
    };
    window.addEventListener('focus', readLS);
    const interval = setInterval(readLS, 1000);
    return () => {
      window.removeEventListener('focus', readLS);
      clearInterval(interval);
    };
  }, []);

  const {
    data: outgoingRows = [],
    isLoading: loadingOutgoing,
  } = useQuery(
    ['cash-turnover-outgoing', companyId, selectedYears.join(','), dateFrom, dateTo],
    async () => {
      if (!companyId) return [];
      const ranges = buildRanges(selectedYears, dateFrom, dateTo);
      const chunks = await Promise.all(ranges.map((range) => fetchOutgoingCashRowsForRange(companyId, range)));
      return toOutgoingRows(chunks.flat());
    },
    {
      enabled: !!companyId,
      onError: (e) => {
        toast.error(e?.response?.data?.error || 'Készpénzes kimenő számlák betöltési hiba');
      },
    }
  );

  const {
    data: incomingRows = [],
    isLoading: loadingIncoming,
  } = useQuery(
    ['cash-turnover-incoming', companyId, selectedYears.join(','), dateFrom, dateTo],
    async () => {
      if (!companyId) return [];
      const ranges = buildRanges(selectedYears, dateFrom, dateTo);
      const chunks = await Promise.all(ranges.map((range) => fetchIncomingCashCodRowsForRange(companyId, range)));
      return toIncomingRows(chunks.flat());
    },
    {
      enabled: !!companyId,
      onError: (e) => {
        toast.error(e?.response?.data?.error || 'Készpénzes/utánvétes bejövő számlák betöltési hiba');
      },
    }
  );

  const allRows = useMemo(() => {
    return [...outgoingRows, ...incomingRows]
      .filter((r) => Number.isFinite(Number(r.amountSigned)) && Math.abs(Number(r.amountSigned)) > 0.0001)
      .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));
  }, [outgoingRows, incomingRows]);

  const availableYears = useMemo(() => {
    const minYear = 2018;
    const out = [];
    for (let year = currentYear; year >= minYear; year -= 1) out.push(year);
    return out;
  }, [currentYear]);

  const rows = useMemo(() => {
    if (directionFilter === 'income') return allRows.filter((r) => r.amountSigned > 0);
    if (directionFilter === 'expense') return allRows.filter((r) => r.amountSigned < 0);
    return allRows;
  }, [allRows, directionFilter]);

  const totals = useMemo(() => {
    const income = rows.filter((r) => r.amountSigned > 0).reduce((sum, r) => sum + Number(r.amountSigned || 0), 0);
    const expense = rows.filter((r) => r.amountSigned < 0).reduce((sum, r) => sum + Math.abs(Number(r.amountSigned || 0)), 0);
    const balance = income - expense;
    return { income, expense, balance };
  }, [rows]);

  const totalsByCurrency = useMemo(() => {
    const grouped = new Map();
    rows.forEach((row) => {
      const currency = String(row?.currency || 'HUF').toUpperCase();
      const current = grouped.get(currency) || { income: 0, expense: 0, balance: 0 };
      const amount = Number(row?.amountSigned || 0);
      if (amount > 0) current.income += amount;
      if (amount < 0) current.expense += Math.abs(amount);
      current.balance = current.income - current.expense;
      grouped.set(currency, current);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([currency, data]) => ({ currency, ...data }));
  }, [rows]);

  if (!companyId) {
    return <Container><Body>Nincs kiválasztott cég.</Body></Container>;
  }

  return (
    <Container>
      <Header>
        <Title>Kassza forgalom</Title>
      </Header>
      <Body>
        <Card>
          <Filters>
            <FilterGroup>
              <FilterLabel>Évek (több is választható)</FilterLabel>
              <FilterSelect
                multiple
                value={selectedYears.map(String)}
                onChange={(e) => {
                  const years = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                  setSelectedYears(years.length > 0 ? years : [currentYear]);
                }}
              >
                {availableYears.map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </FilterSelect>
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Dátumtól</FilterLabel>
              <FilterInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                min={availableYears.length > 0 ? `${Math.min(...availableYears)}-01-01` : undefined}
                max={dateTo || undefined}
              />
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Dátumig</FilterLabel>
              <FilterInput
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                max={availableYears.length > 0 ? `${Math.max(...availableYears)}-12-31` : undefined}
              />
            </FilterGroup>

            <FilterGroup>
              <FilterLabel>Típus</FilterLabel>
              <FilterSelect
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                style={{ height: 36 }}
              >
                <option value="all">Mindkettő</option>
                <option value="income">Csak bevétel</option>
                <option value="expense">Csak kiadás</option>
              </FilterSelect>
            </FilterGroup>

            <FilterActions>
              <ActionButton type="button" onClick={clearFilters}>Szűrők törlése</ActionButton>
            </FilterActions>
          </Filters>
        </Card>

        <Card>
          <InfoLine>
            {loadingOutgoing || loadingIncoming
              ? 'Tételek betöltése...'
              : `Automatikus tételek: kimenő ${outgoingRows.length} db, bejövő ${incomingRows.length} db, összesen ${allRows.length} db.`}
          </InfoLine>
        </Card>

        <Card>
          <StatGrid>
            <Stat>
              <StatLabel>Bevétel összesen (minden deviza)</StatLabel>
              <StatValue>{formatAmount(totals.income)}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Kiadás összesen (minden deviza)</StatLabel>
              <StatValue $danger>{formatAmount(totals.expense)}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Egyenleg (minden deviza)</StatLabel>
              <StatValue $danger={totals.balance < 0}>{formatAmount(totals.balance)}</StatValue>
            </Stat>
          </StatGrid>
          {totalsByCurrency.length > 0 && (
            <TableWrap style={{ marginTop: 12 }}>
              <Table>
                <thead>
                  <tr>
                    <th>Deviza</th>
                    <th>Bevétel</th>
                    <th>Kiadás</th>
                    <th>Egyenleg</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsByCurrency.map((row) => (
                    <tr key={row.currency}>
                      <td>{row.currency}</td>
                      <td>{row.currency} {formatAmount(row.income)}</td>
                      <td>{row.currency} {formatAmount(row.expense)}</td>
                      <td>{row.currency} {formatAmount(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Dátum</th>
                  <th>Irány</th>
                  <th>Számla</th>
                  <th>Partner</th>
                  <th>Fizetési mód</th>
                  <th>Összeg</th>
                  <th>Forrás</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.rowType}-${row.invoiceNumber}-${idx}`}>
                    <td>{toDateInputValue(row.date) ? new Date(row.date).toLocaleDateString('hu-HU') : '-'}</td>
                    <td>
                      <Badge $positive={row.amountSigned > 0}>{row.direction}</Badge>
                    </td>
                    <td>{row.invoiceNumber}</td>
                    <td>{row.partnerName}</td>
                    <td>{row.paymentMethod}</td>
                    <td>{row.currency} {formatAmount(row.amountSigned)}</td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!loadingOutgoing && !loadingIncoming && rows.length === 0 && (
              <Empty>Nincs megjeleníthető készpénzes forgalom.</Empty>
            )}
          </TableWrap>
        </Card>
      </Body>
    </Container>
  );
}
