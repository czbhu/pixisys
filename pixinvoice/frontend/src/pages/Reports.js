import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  TrendingUp, 
  DollarSign,
  FileText,
  Users
} from 'lucide-react';
import styled from 'styled-components';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { invoiceAPI } from '../services/api';

const ReportsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const ReportCard = styled.div`
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
`;

const ReportHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const ReportTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ReportIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props => props.color || '#3498db'};
  color: white;
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

const FilterContainer = styled.div`
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
`;

const FilterInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 150px;
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  min-width: 150px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #7f8c8d;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const Reports = () => {
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [dateTo, setDateTo] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState('');

  const { data: statistics, isLoading } = useQuery(
    'invoice-statistics',
    invoiceAPI.getStatistics
  );

  const { data: invoices } = useQuery(
    ['invoices', { status: statusFilter }],
    () => invoiceAPI.getInvoices({ 
      status: statusFilter || undefined,
      page_size: 1000 
    })
  );

  // Mock data for charts - in real app, this would come from API
  const monthlyData = [
    { month: 'Jan', amount: 1200000, count: 15 },
    { month: 'Feb', amount: 1500000, count: 18 },
    { month: 'Már', amount: 1800000, count: 22 },
    { month: 'Ápr', amount: 1600000, count: 20 },
    { month: 'Máj', amount: 2000000, count: 25 },
    { month: 'Jún', amount: 2200000, count: 28 },
  ];

  const statusData = [
    { name: 'Draft', value: statistics?.draft_invoices || 0, color: '#f39c12' },
    { name: 'Elküldve', value: statistics?.sent_invoices || 0, color: '#3498db' },
    { name: 'Fizetve', value: statistics?.paid_invoices || 0, color: '#27ae60' },
    { name: 'NAV-ban', value: (statistics?.total_invoices || 0) - (statistics?.draft_invoices || 0) - (statistics?.sent_invoices || 0) - (statistics?.paid_invoices || 0), color: '#9b59b6' },
  ];

  const customerData = [
    { name: 'Ügyfél A', amount: 500000, count: 8 },
    { name: 'Ügyfél B', amount: 400000, count: 6 },
    { name: 'Ügyfél C', amount: 300000, count: 5 },
    { name: 'Ügyfél D', amount: 200000, count: 3 },
    { name: 'Egyéb', amount: 100000, count: 2 },
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Jelentések</h1>
      
      <FilterContainer>
        <FilterGroup>
          <FilterLabel>Dátumtól</FilterLabel>
          <FilterInput
            type="date"
            value={dateFrom.toISOString().split('T')[0]}
            onChange={(e) => setDateFrom(new Date(e.target.value))}
          />
        </FilterGroup>
        
        <FilterGroup>
          <FilterLabel>Dátumig</FilterLabel>
          <FilterInput
            type="date"
            value={dateTo.toISOString().split('T')[0]}
            onChange={(e) => setDateTo(new Date(e.target.value))}
          />
        </FilterGroup>
        
        <FilterGroup>
          <FilterLabel>Státusz</FilterLabel>
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Összes</option>
            <option value="draft">Draft</option>
            <option value="sent">Elküldve</option>
            <option value="paid">Fizetve</option>
            <option value="cancelled">Törölve</option>
            <option value="submitted_to_nav">NAV-ban</option>
            <option value="nav_processed">NAV feldolgozva</option>
            <option value="nav_rejected">NAV elutasítva</option>
          </FilterSelect>
        </FilterGroup>
      </FilterContainer>

      <ReportsContainer>
        <ReportCard>
          <ReportHeader>
            <ReportTitle>
              <ReportIcon color="#3498db">
                <FileText size={20} />
              </ReportIcon>
              Összes számla
            </ReportTitle>
          </ReportHeader>
          <StatValue>{statistics?.total_invoices || 0}</StatValue>
          <StatLabel>db</StatLabel>
        </ReportCard>

        <ReportCard>
          <ReportHeader>
            <ReportTitle>
              <ReportIcon color="#27ae60">
                <DollarSign size={20} />
              </ReportIcon>
              Összes bevétel
            </ReportTitle>
          </ReportHeader>
          <StatValue>{formatCurrency(statistics?.total_amount || 0)}</StatValue>
          <StatLabel>HUF</StatLabel>
        </ReportCard>

        <ReportCard>
          <ReportHeader>
            <ReportTitle>
              <ReportIcon color="#e74c3c">
                <TrendingUp size={20} />
              </ReportIcon>
              Kifizetetlen
            </ReportTitle>
          </ReportHeader>
          <StatValue>{formatCurrency(statistics?.unpaid_amount || 0)}</StatValue>
          <StatLabel>HUF</StatLabel>
        </ReportCard>

        <ReportCard>
          <ReportHeader>
            <ReportTitle>
              <ReportIcon color="#f39c12">
                <Users size={20} />
              </ReportIcon>
              Aktív ügyfelek
            </ReportTitle>
          </ReportHeader>
          <StatValue>{invoices?.results?.reduce((acc, invoice) => {
            if (!acc.includes(invoice.customer.id)) {
              acc.push(invoice.customer.id);
            }
            return acc;
          }, []).length || 0}</StatValue>
          <StatLabel>db</StatLabel>
        </ReportCard>
      </ReportsContainer>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <ChartContainer>
          <ChartTitle>Havi bevétel és számlaszám</ChartTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" tickFormatter={(value) => formatCurrency(value)} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'amount' ? formatCurrency(value) : value,
                  name === 'amount' ? 'Összeg' : 'Számlaszám'
                ]}
              />
              <Bar yAxisId="left" dataKey="amount" fill="#3498db" name="amount" />
              <Bar yAxisId="right" dataKey="count" fill="#27ae60" name="count" />
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <ChartContainer>
          <ChartTitle>Ügyfél szerinti bevétel</ChartTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={customerData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="amount" fill="#9b59b6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer>
          <ChartTitle>Bevétel trend</ChartTitle>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#3498db" 
                fill="#3498db" 
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
};

export default Reports;



