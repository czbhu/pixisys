import React from 'react';
import { useQuery } from 'react-query';
import { 
  FileText, 
  Users, 
  DollarSign, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import styled from 'styled-components';
import { invoiceAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const DashboardContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
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
`;

const StatContent = styled.div`
  flex: 1;
`;

const StatValue = styled.h3`
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #2c3e50;
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
`;

const ChartTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
  color: #2c3e50;
`;

const RecentInvoices = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
`;

const InvoiceInfo = styled.div`
  flex: 1;
`;

const InvoiceNumber = styled.h4`
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #2c3e50;
`;

const InvoiceCustomer = styled.p`
  font-size: 12px;
  color: #7f8c8d;
  margin: 0;
`;

const InvoiceAmount = styled.div`
  text-align: right;
`;

const Amount = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: #27ae60;
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
  const { data: statistics, isLoading: statsLoading, error: statsError } = useQuery(
    'invoice-statistics',
    invoiceAPI.getStatistics
  );

  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } = useQuery(
    'recent-invoices',
    () => invoiceAPI.getInvoices({ page_size: 5 })
  );

  if (statsLoading || invoicesLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (statsError || invoicesError) {
    return (
      <ErrorMessage>
        Hiba történt az adatok betöltése során. Kérjük, próbálja újra később.
      </ErrorMessage>
    );
  }

  const chartData = [
    { name: 'Jan', amount: 1200000 },
    { name: 'Feb', amount: 1500000 },
    { name: 'Már', amount: 1800000 },
    { name: 'Ápr', amount: 1600000 },
    { name: 'Máj', amount: 2000000 },
    { name: 'Jún', amount: 2200000 },
  ];

  const statusData = [
    { name: 'Draft', value: statistics?.draft_invoices || 0, color: '#f39c12' },
    { name: 'Elküldve', value: statistics?.sent_invoices || 0, color: '#3498db' },
    { name: 'Fizetve', value: statistics?.paid_invoices || 0, color: '#27ae60' },
    { name: 'NAV-ban', value: (statistics?.total_invoices || 0) - (statistics?.draft_invoices || 0) - (statistics?.sent_invoices || 0) - (statistics?.paid_invoices || 0), color: '#9b59b6' },
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
    }).format(amount);
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

  return (
    <div>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>PixInvoice v0.9.0</h1>
      
      <DashboardContainer>
        <StatCard>
          <StatIcon color="#3498db">
            <FileText size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{statistics?.total_invoices || 0}</StatValue>
            <StatLabel>Összes számla</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#27ae60">
            <DollarSign size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{formatCurrency(statistics?.total_amount || 0)}</StatValue>
            <StatLabel>Összes bevétel</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#e74c3c">
            <AlertCircle size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{formatCurrency(statistics?.unpaid_amount || 0)}</StatValue>
            <StatLabel>Kifizetetlen összeg</StatLabel>
          </StatContent>
        </StatCard>

        <StatCard>
          <StatIcon color="#f39c12">
            <Clock size={24} />
          </StatIcon>
          <StatContent>
            <StatValue>{statistics?.draft_invoices || 0}</StatValue>
            <StatLabel>Draft számlák</StatLabel>
          </StatContent>
        </StatCard>
      </DashboardContainer>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <ChartContainer>
          <ChartTitle>Havi bevétel</ChartTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="amount" fill="#3498db" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer>
          <ChartTitle>Sorszámla státuszok</ChartTitle>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <RecentInvoices>
        <ChartTitle>Legutóbbi számlák</ChartTitle>
        {invoices?.results?.map((invoice) => (
          <InvoiceItem key={invoice.id}>
            <InvoiceInfo>
              <InvoiceNumber>{invoice.invoice_number}</InvoiceNumber>
              <InvoiceCustomer>{invoice.customer.name}</InvoiceCustomer>
            </InvoiceInfo>
            <InvoiceAmount>
              <Amount>{formatCurrency(invoice.total_gross_amount)}</Amount>
              <StatusBadge status={invoice.status}>
                {getStatusLabel(invoice.status)}
              </StatusBadge>
            </InvoiceAmount>
          </InvoiceItem>
        ))}
        {(!invoices?.results || invoices.results.length === 0) && (
          <p style={{ textAlign: 'center', color: '#7f8c8d', margin: '20px 0' }}>
            Nincsenek számlák
          </p>
        )}
      </RecentInvoices>
    </div>
  );
};

export default Dashboard;



