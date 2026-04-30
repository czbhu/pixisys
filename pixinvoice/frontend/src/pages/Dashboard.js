import React from 'react';
import { useQuery } from 'react-query';
import { 
  FileText, 
  DollarSign, 
  AlertCircle,
  Clock
} from 'lucide-react';
import styled from 'styled-components';
import { invoiceAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const DashboardContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
`;

const StatCard = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;

  @media (max-width: 768px) {
    padding: 14px;
    gap: 10px;
  }
`;

const StatIcon = styled.div`
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props => props.color || '#3498db'};
  color: white;

  @media (max-width: 768px) {
    width: 44px;
    height: 44px;
    border-radius: 10px;
  }
`;

const StatContent = styled.div`
  flex: 1;
`;

const StatValue = styled.h3`
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #2c3e50;

  @media (max-width: 768px) {
    font-size: 22px;
  }
`;

const StatLabel = styled.p`
  font-size: 14px;
  color: #7f8c8d;
  margin: 0;
`;

const ChartContainer = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;

  @media (max-width: 768px) {
    padding: 14px;
    margin-bottom: 12px;
  }
`;

const PanelContainer = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;

  @media (max-width: 768px) {
    padding: 14px;
    margin-bottom: 12px;
  }
`;

const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
`;

const ChartTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #2c3e50;

  @media (max-width: 768px) {
    font-size: 16px;
    margin-bottom: 12px;
    line-height: 1.3;
  }
`;

const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    gap: 12px;
  }
`;

const InvoiceItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #ecf0f1;

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    align-items: flex-start;
    gap: 8px;
  }
`;

const InvoiceInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const InvoiceNumber = styled.h4`
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #2c3e50;

  @media (max-width: 768px) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const InvoiceCustomer = styled.p`
  font-size: 12px;
  color: #7f8c8d;
  margin: 0;

  @media (max-width: 768px) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const InvoiceAmount = styled.div`
  text-align: right;

  @media (max-width: 768px) {
    width: 100%;
    text-align: left;
  }
`;

const Amount = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #27ae60;
  white-space: nowrap;

  @media (max-width: 768px) {
    font-size: 14px;
  }
`;

const CurrencyRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #2c3e50;
  padding: 4px 0;
  border-bottom: 1px dashed #ecf0f1;

  &:last-child {
    border-bottom: none;
  }
`;

const SubTitle = styled.h4`
  font-size: 14px;
  margin: 14px 0 8px;
  color: #34495e;
`;

const SimpleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SimpleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #ecf0f1;
  padding: 8px 0;

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    gap: 10px;
    align-items: flex-start;
  }
`;

const DueText = styled.span`
  @media (max-width: 768px) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const DueGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 20px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    gap: 12px;
    margin-bottom: 12px;
  }
`;

const DueToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
`;

const DueHeaderMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;

  @media (max-width: 768px) {
    width: 100%;
    margin-left: 0;
    justify-content: space-between;
  }
`;

const DueTotal = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
`;

const PayButton = styled.button`
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #3498db;
  background: #3498db;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DueTable = styled.div`
  border: 1px solid #ecf0f1;
  border-radius: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
`;

const DueHead = styled.div`
  display: grid;
  grid-template-columns: 1.15fr 1.4fr 0.8fr 1.25fr;
  gap: 8px;
  padding: 8px 10px;
  background: #f8f9fa;
  font-size: 12px;
  font-weight: 700;
  color: #2c3e50;
  min-width: 520px;

  @media (max-width: 768px) {
    display: none;
    min-width: 0;
  }
`;

const DueHeadNoDate = styled(DueHead)`
  grid-template-columns: 1.25fr 1.55fr 0.9fr;
`;

const DueRow = styled.div`
  display: grid;
  grid-template-columns: 1.15fr 1.4fr 0.8fr 1.25fr;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #ecf0f1;
  font-size: 12px;
  color: #2c3e50;
  min-width: 520px;

  @media (max-width: 768px) {
    min-width: 0;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'number amount'
      'partner due';
    row-gap: 4px;

    > :nth-child(1) { grid-area: number; }
    > :nth-child(2) { grid-area: partner; }
    > :nth-child(3) {
      grid-area: amount;
      text-align: right;
      justify-self: end;
    }
    > :nth-child(4) {
      grid-area: due;
      justify-self: end;
      font-size: 11px;
      color: #7f8c8d;
    }
  }
`;

const PageHeader = styled.h1`
  margin-bottom: 30px;
  color: #2c3e50;

  @media (max-width: 768px) {
    margin-bottom: 14px;
    font-size: 22px;
  }
`;

const YearToolbar = styled.div`
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;

  @media (max-width: 768px) {
    justify-content: flex-start;
    margin-bottom: 12px;
  }
`;

const YearSelect = styled.select`
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
`;

const DueRowNoDate = styled(DueRow)`
  grid-template-columns: 1.25fr 1.55fr 0.9fr;

  @media (max-width: 768px) {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'number amount'
      'partner amount';

    > :nth-child(1) { grid-area: number; }
    > :nth-child(2) { grid-area: partner; }
    > :nth-child(3) {
      grid-area: amount;
      text-align: right;
      justify-self: end;
      align-self: center;
    }
  }
`;

const DueAmount = styled.span`
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
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
  margin-left: 8px;

  @media (max-width: 768px) {
    margin-left: 0;
    margin-top: 4px;
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

const ErrorMessage = styled.div`
  background: #e74c3c;
  color: white;
  padding: 16px;
  border-radius: 4px;
  margin-bottom: 20px;
`;

const Dashboard = () => {
  const [selectedCompanyId, setSelectedCompanyId] = React.useState(() => {
    try {
      return localStorage.getItem('selectedCompanyId') || '';
    } catch {
      return '';
    }
  });
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  const [isMobile, setIsMobile] = React.useState(() => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });

  React.useEffect(() => {
    const refreshCompany = () => {
      try {
        const cid = localStorage.getItem('selectedCompanyId') || '';
        setSelectedCompanyId(prev => (prev === cid ? prev : cid));
      } catch {}
    };

    refreshCompany();
    window.addEventListener('companyChanged', refreshCompany);
    return () => {
      window.removeEventListener('companyChanged', refreshCompany);
    };
  }, []);

  React.useEffect(() => {
    const onResize = () => {
      try { setIsMobile(window.matchMedia('(max-width: 768px)').matches); } catch {}
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { data: statisticsResponse, isLoading, error } = useQuery(
    ['invoice-statistics', selectedCompanyId || 'all', selectedYear],
    () => invoiceAPI.getStatistics({
      ...(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
      year: selectedYear,
    }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    }
  );

  const statistics = statisticsResponse?.data || {};

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return (
      <ErrorMessage>
        Hiba történt az adatok betöltése során. Kérjük, próbálja újra később.
      </ErrorMessage>
    );
  }

  const formatCurrency = (amount, currency = 'HUF') => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatCompactHuf = (value) => {
    const num = Number(value || 0);
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} MrdFt`;
    }
    if (abs >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} MFt`;
    }
    if (abs >= 1_000) {
      return `${(num / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} eFt`;
    }
    return `${Math.round(num)} Ft`;
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

  const renderAggregate = (title, data) => {
    const month = data?.month || { count: 0, amount: 0, currencies: {} };
    const year = data?.year || { count: 0, amount: 0, currencies: {} };
    const monthTotalHuf = month?.amount_huf ?? month?.amount ?? 0;
    const yearTotalHuf = year?.amount_huf ?? year?.amount ?? 0;

    return (
      <PanelContainer>
        <ChartTitle>{title}</ChartTitle>

        <SubTitle>Hónap</SubTitle>
        <CurrencyRow>
          <span>Összesen HUF-ban ({month.count} db)</span>
          <strong>{formatCurrency(monthTotalHuf, 'HUF')}</strong>
        </CurrencyRow>
        {Object.entries(month.currencies || {}).map(([curr, values]) => (
          <CurrencyRow key={`m-${curr}`}>
            <span>{curr} ({values.count} db)</span>
            <span>
              {curr === 'HUF'
                ? formatCurrency(values.amount, 'HUF')
                : `${formatCurrency(values.amount, curr)} (${formatCurrency(values.amount_huf || 0, 'HUF')})`}
            </span>
          </CurrencyRow>
        ))}

        <SubTitle>Év</SubTitle>
        <CurrencyRow>
          <span>Összesen HUF-ban ({year.count} db)</span>
          <strong>{formatCurrency(yearTotalHuf, 'HUF')}</strong>
        </CurrencyRow>
        {Object.entries(year.currencies || {}).map(([curr, values]) => (
          <CurrencyRow key={`y-${curr}`}>
            <span>{curr} ({values.count} db)</span>
            <span>
              {curr === 'HUF'
                ? formatCurrency(values.amount, 'HUF')
                : `${formatCurrency(values.amount, curr)} (${formatCurrency(values.amount_huf || 0, 'HUF')})`}
            </span>
          </CurrencyRow>
        ))}
      </PanelContainer>
    );
  };

  const renderSimpleTopList = (rows = [], emptyText = 'Nincs adat') => (
    <SimpleList>
      {rows.length === 0 && <InvoiceCustomer>{emptyText}</InvoiceCustomer>}
      {rows.map((row, idx) => (
        <SimpleRow key={`${row.partner_name}-${idx}`}>
          <InvoiceInfo>
            <InvoiceNumber>{idx + 1}. {row.partner_name}</InvoiceNumber>
          </InvoiceInfo>
          <Amount>{formatCurrency(row.amount_huf ?? row.amount ?? 0, 'HUF')}</Amount>
        </SimpleRow>
      ))}
    </SimpleList>
  );

  const dedupeRecentInvoices = (rows = []) => {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = String(row?.id || row?.invoice_number || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const recentOutgoing = dedupeRecentInvoices(statistics?.recent?.outgoing || []).slice(0, 10);
  const recentIncoming = dedupeRecentInvoices(statistics?.recent?.incoming || []).slice(0, 10);
  const summaryYear = statistics?.summary_year || {};
  const dueLists = statistics?.incoming_due_lists || {};
  const overdueInvoices = dueLists?.overdue || [];
  const dueTodayInvoices = dueLists?.due_today || [];
  const upcomingInvoices = dueLists?.upcoming || [];
  const overdueTotalHuf = Number(dueLists?.overdue_total_huf || 0);
  const dueTodayTotalHuf = Number(dueLists?.due_today_total_huf || 0);
  const upcomingTotalHuf = Number(dueLists?.upcoming_total_huf || 0);
  const overdueSelectionIds = Array.from(new Set(
    overdueInvoices.map((row) => String(row?.id || '')).filter(Boolean)
  ));
  const dueTodaySelectionIds = Array.from(new Set(
    dueTodayInvoices.map((row) => String(row?.id || '')).filter(Boolean)
  ));
  const upcomingSelectionIds = Array.from(new Set(
    upcomingInvoices.map((row) => String(row?.id || '')).filter(Boolean)
  ));

  const formatDueDateWithDelta = (dueDate, mode) => {
    if (!dueDate) return '—';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((due.getTime() - today.getTime()) / dayMs);
    const base = due.toLocaleDateString('hu-HU');
    if (mode === 'overdue') {
      return `${base} (${Math.abs(diffDays)} nappal túllépve)`;
    }
    if (mode === 'upcoming') {
      return `${base} (${Math.max(diffDays, 0)} nap múlva)`;
    }
    return base;
  };

  const openIncomingPayment = (selectionIds = []) => {
    const url = new URL('https://i.pixisys.eu/incoming-invoices');
    if (selectedCompanyId) url.searchParams.set('company_id', String(selectedCompanyId));
    if (selectionIds.length > 0) {
      url.searchParams.set('preselect_ids', selectionIds.join(','));
      url.searchParams.set('page_size', '200');
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const years = (() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now; y >= now - 7; y -= 1) list.push(y);
    return list;
  })();

  return (
    <div>
      <PageHeader>PixInvoice {process.env.REACT_APP_VERSION || 'dev'}</PageHeader>
      <YearToolbar>
        <span style={{ color: '#2c3e50', fontWeight: 600 }}>Év:</span>
        <YearSelect value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </YearSelect>
      </YearToolbar>
      
      <DashboardContainer>
        <StatCard>
          <StatIcon color="#3498db">
            <FileText size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{summaryYear?.total_invoices ?? 0}</StatValue>
            <StatLabel>Összes kimenő számla ({summaryYear?.year || selectedYear})</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#27ae60">
            <DollarSign size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{formatCurrency(summaryYear?.total_amount_huf || 0, 'HUF')}</StatValue>
            <StatLabel>Összes kimenő érték ({summaryYear?.year || selectedYear})</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#e74c3c">
            <AlertCircle size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{formatCurrency(summaryYear?.unpaid_amount_huf || 0, 'HUF')}</StatValue>
            <StatLabel>Kifizetetlen összeg ({summaryYear?.year || selectedYear})</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#f39c12">
            <Clock size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{formatCurrency(statistics?.incoming?.year?.amount_huf ?? statistics?.incoming?.year?.amount ?? 0, 'HUF')}</StatValue>
            <StatLabel>Összes bejövő érték ({summaryYear?.year || selectedYear})</StatLabel>
          </StatContent>
        </StatCard>
      </DashboardContainer>

      <PanelGrid>
        {renderAggregate('Kimenő számlák (devizanem bontás)', statistics?.outgoing)}
        {renderAggregate('Bejövő számlák (devizanem bontás)', statistics?.incoming)}
        {renderAggregate('Kifizetetlen bejövő számlák (devizanem bontás)', statistics?.incoming_unpaid)}
        {renderAggregate('Lejárt bejövő számlák (devizanem bontás)', statistics?.incoming_overdue)}
      </PanelGrid>

      <DueGrid>
        <PanelContainer>
          <DueToolbar>
            <ChartTitle style={{ margin: 0 }}>Lejárt számlák (10 db)</ChartTitle>
            <DueHeaderMeta>
              <DueTotal>{formatCurrency(overdueTotalHuf, 'HUF')}</DueTotal>
              <PayButton onClick={() => openIncomingPayment(overdueSelectionIds)} disabled={overdueSelectionIds.length === 0}>Kifizetés</PayButton>
            </DueHeaderMeta>
          </DueToolbar>
          <DueTable>
            <DueHead>
              <span>Számla sorszám</span>
              <span>Beszállító</span>
              <span style={{ textAlign: 'right' }}>Összeg</span>
              <span>Esedékesség</span>
            </DueHead>
            {overdueInvoices.map((invoice) => (
              <DueRow key={`overdue-${invoice.id}`}>
                <DueText>{invoice.invoice_number || '-'}</DueText>
                <DueText>{invoice.partner_name || '-'}</DueText>
                <DueAmount>{formatCurrency(invoice.amount || 0, invoice.currency || 'HUF')}</DueAmount>
                <DueText>{formatDueDateWithDelta(invoice.due_date, 'overdue')}</DueText>
              </DueRow>
            ))}
            {overdueInvoices.length === 0 && <DueRow><span>Nincs adat</span><span></span><span></span><span></span></DueRow>}
          </DueTable>
        </PanelContainer>

        <PanelContainer>
          <DueToolbar>
            <ChartTitle style={{ margin: 0 }}>Ma lejáró számlák (10 db)</ChartTitle>
            <DueHeaderMeta>
              <DueTotal>{formatCurrency(dueTodayTotalHuf, 'HUF')}</DueTotal>
              <PayButton onClick={() => openIncomingPayment(dueTodaySelectionIds)} disabled={dueTodaySelectionIds.length === 0}>Kifizetés</PayButton>
            </DueHeaderMeta>
          </DueToolbar>
          <DueTable>
            <DueHeadNoDate>
              <span>Számla sorszám</span>
              <span>Beszállító</span>
              <span style={{ textAlign: 'right' }}>Összeg</span>
            </DueHeadNoDate>
            {dueTodayInvoices.map((invoice) => (
              <DueRowNoDate key={`today-${invoice.id}`}>
                <DueText>{invoice.invoice_number || '-'}</DueText>
                <DueText>{invoice.partner_name || '-'}</DueText>
                <DueAmount>{formatCurrency(invoice.amount || 0, invoice.currency || 'HUF')}</DueAmount>
              </DueRowNoDate>
            ))}
            {dueTodayInvoices.length === 0 && <DueRowNoDate><span>Nincs adat</span><span></span><span></span></DueRowNoDate>}
          </DueTable>
        </PanelContainer>

        <PanelContainer>
          <DueToolbar>
            <ChartTitle style={{ margin: 0 }}>Következő lejáró számlák (10 db)</ChartTitle>
            <DueHeaderMeta>
              <DueTotal>{formatCurrency(upcomingTotalHuf, 'HUF')}</DueTotal>
              <PayButton onClick={() => openIncomingPayment(upcomingSelectionIds)} disabled={upcomingSelectionIds.length === 0}>Kifizetés</PayButton>
            </DueHeaderMeta>
          </DueToolbar>
          <DueTable>
            <DueHead>
              <span>Számla sorszám</span>
              <span>Beszállító</span>
              <span style={{ textAlign: 'right' }}>Összeg</span>
              <span>Esedékesség</span>
            </DueHead>
            {upcomingInvoices.map((invoice) => (
              <DueRow key={`upcoming-${invoice.id}`}>
                <DueText>{invoice.invoice_number || '-'}</DueText>
                <DueText>{invoice.partner_name || '-'}</DueText>
                <DueAmount>{formatCurrency(invoice.amount || 0, invoice.currency || 'HUF')}</DueAmount>
                <DueText>{formatDueDateWithDelta(invoice.due_date, 'upcoming')}</DueText>
              </DueRow>
            ))}
            {upcomingInvoices.length === 0 && <DueRow><span>Nincs adat</span><span></span><span></span><span></span></DueRow>}
          </DueTable>
        </PanelContainer>
      </DueGrid>

      <div style={{ marginBottom: '20px' }}>
        <ChartContainer>
          <ChartTitle>Elmúlt 14 hónap: bevétel és kiadás (HUF konvertált)</ChartTitle>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
            <BarChart data={statistics?.monthly_revenue_expense || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(value) => formatCompactHuf(value)} width={72} />
              <Tooltip formatter={(value) => formatCurrency(value, 'HUF')} />
              <Legend />
              <Bar dataKey="revenue" name="Bevétel" fill="#27ae60" />
              <Bar dataKey="expense" name="Kiadás" fill="#e74c3c" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <TwoColGrid>
        <PanelContainer>
          <ChartTitle>Legutóbbi 10 kiállított számla</ChartTitle>
          {recentOutgoing.map((invoice) => (
            <InvoiceItem key={`out-${invoice.id}`}>
              <InvoiceInfo>
                <InvoiceNumber>{invoice.invoice_number}</InvoiceNumber>
                <InvoiceCustomer>{invoice.partner_name}</InvoiceCustomer>
              </InvoiceInfo>
              <InvoiceAmount>
                <Amount>{formatCurrency(invoice.amount, invoice.currency)}</Amount>
              </InvoiceAmount>
            </InvoiceItem>
          ))}
          {recentOutgoing.length === 0 && <InvoiceCustomer>Nincsenek adatok</InvoiceCustomer>}
        </PanelContainer>

        <PanelContainer>
          <ChartTitle>Legutóbbi 10 bejövő számla</ChartTitle>
          {recentIncoming.map((invoice) => (
            <InvoiceItem key={`in-${invoice.id}`}>
              <InvoiceInfo>
                <InvoiceNumber>{invoice.invoice_number}</InvoiceNumber>
                <InvoiceCustomer>{invoice.partner_name}</InvoiceCustomer>
              </InvoiceInfo>
              <InvoiceAmount>
                <Amount>{formatCurrency(invoice.amount, invoice.currency)}</Amount>
                <StatusBadge status={invoice.status}>{getStatusLabel(invoice.status)}</StatusBadge>
              </InvoiceAmount>
            </InvoiceItem>
          ))}
          {recentIncoming.length === 0 && <InvoiceCustomer>Nincsenek adatok</InvoiceCustomer>}
        </PanelContainer>
      </TwoColGrid>

      <TwoColGrid>
        <PanelContainer>
          <ChartTitle>Hitelezés - akik tartoznak nekünk (Top 10)</ChartTitle>
          {renderSimpleTopList(statistics?.credit?.top_debtors || [])}
        </PanelContainer>
        <PanelContainer>
          <ChartTitle>Hitelezés - akiknek tartozunk (Top 10)</ChartTitle>
          {renderSimpleTopList(statistics?.credit?.top_creditors || [])}
        </PanelContainer>
      </TwoColGrid>

      <TwoColGrid>
        <PanelContainer>
          <ChartTitle>Top 10 ügyfél (éves költés)</ChartTitle>
          {renderSimpleTopList(statistics?.top_customers_year || [])}
        </PanelContainer>
        <PanelContainer>
          <ChartTitle>Top 10 beszállító (éves költés)</ChartTitle>
          {renderSimpleTopList(statistics?.top_suppliers_year || [])}
        </PanelContainer>
      </TwoColGrid>
    </div>
  );
};

export default Dashboard;



