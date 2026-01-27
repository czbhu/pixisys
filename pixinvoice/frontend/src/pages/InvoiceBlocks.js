import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  FileText,
  ArrowLeft,
  Eye,
  EyeOff,
  TrendingUp
} from 'lucide-react';
import styled from 'styled-components';
import { invoiceBlockAPI, companyAPI } from '../services/api';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
`;

const Header = styled.div`
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
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: ${props => props.variant === 'primary' ? '#3498db' : props.variant === 'secondary' ? '#95a5a6' : '#e74c3c'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : props.variant === 'secondary' ? '#7f8c8d' : '#c0392b'};
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
    transform: none;
  }
`;

const SearchAndFilter = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }
`;

const FilterSelect = styled.select`
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background-color: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
`;

const TableHeader = styled.thead`
  background-color: #f8f9fa;
`;

const TableHeaderCell = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #e9ecef;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  border-bottom: 1px solid #f8f9fa;

  &:hover {
    background-color: #f8f9fa;
  }
`;

const TableCell = styled.td`
  padding: 12px 16px;
  font-size: 14px;
  color: #34495e;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: white;

  &.edit {
    background-color: #3498db;
    
    &:hover {
      background-color: #2980b9;
    }
  }

  &.delete {
    background-color: #e74c3c;
    
    &:hover {
      background-color: #c0392b;
    }
  }

  &.toggle {
    background-color: ${props => props.active ? '#27ae60' : '#95a5a6'};
    
    &:hover {
      background-color: ${props => props.active ? '#229954' : '#7f8c8d'};
    }
  }

  &.generate {
    background-color: #f39c12;
    
    &:hover {
      background-color: #e67e22;
    }
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;

  &.active {
    background-color: #d4edda;
    color: #155724;
  }

  &.inactive {
    background-color: #f8d7da;
    color: #721c24;
  }
`;

const StatsContainer = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #7f8c8d;
`;

const StatValue = styled.span`
  font-weight: 500;
  color: #2c3e50;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
`;

const InvoiceBlocks = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const { data: blocks, isLoading, error } = useQuery(
    ['invoice-blocks', { search: searchTerm, is_active: statusFilter, company_id: companyFilter }],
    () => invoiceBlockAPI.getInvoiceBlocks({
      search: searchTerm || undefined,
      is_active: statusFilter || undefined,
      company_id: companyFilter || undefined,
    }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const { data: companies } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const deleteBlockMutation = useMutation(
    (id) => invoiceBlockAPI.deleteInvoiceBlock(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['invoice-blocks']);
        toast.success('Számlatömb törölve');
      },
      onError: (error) => {
        toast.error('Hiba történt a számlatömb törlése során');
        console.error('Delete block error:', error);
      }
    }
  );

  const toggleActiveMutation = useMutation(
    ({ id, isActive }) => invoiceBlockAPI.updateInvoiceBlock(id, { is_active: isActive }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['invoice-blocks']);
        toast.success('Számlatömb státusza frissítve');
      },
      onError: (error) => {
        toast.error('Hiba történt a státusz frissítése során');
        console.error('Toggle active error:', error);
      }
    }
  );

  const handleDelete = (block) => {
    if (block.invoice_count > 0) {
      toast.error('Nem törölhető számlatömb, amely tartalmaz számlákat');
      return;
    }
    
    if (window.confirm(`Biztosan törölni szeretné a(z) "${block.name}" számlatömböt?`)) {
      deleteBlockMutation.mutate(block.id);
    }
  };

  const handleToggleActive = (block) => {
    toggleActiveMutation.mutate({
      id: block.id,
      isActive: !block.is_active
    });
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingSpinner>Betöltés...</LoadingSpinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div>Hiba történt a számlatömbök betöltése során: {error.message}</div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>
          <FileText size={24} />
          Számlatömbök
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button variant="primary" onClick={() => navigate('/settings/invoice-blocks/new')}>
            <Plus size={16} />
            Új számlatömb
          </Button>
        </ButtonGroup>
      </Header>

      <SearchAndFilter>
        <SearchInput
          type="text"
          placeholder="Keresés név vagy előtag alapján..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Minden státusz</option>
          <option value="true">Aktív</option>
          <option value="false">Inaktív</option>
        </FilterSelect>
        <FilterSelect
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        >
          <option value="">Minden cég</option>
          {companies && companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </FilterSelect>
      </SearchAndFilter>

      {blocks.length === 0 ? (
        <EmptyState>
          <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Nincsenek számlatömbök</h3>
          <p>Kezdje el egy új számlatömb létrehozásával</p>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Név</TableHeaderCell>
              <TableHeaderCell>Cég</TableHeaderCell>
              <TableHeaderCell>Előtag</TableHeaderCell>
              <TableHeaderCell>Jelenlegi szám</TableHeaderCell>
              <TableHeaderCell>NAV konfiguráció</TableHeaderCell>
              <TableHeaderCell>Statisztikák</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {blocks.map((block) => (
              <TableRow key={block.id}>
                <TableCell>
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                      {block.name}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{block.company_name}</TableCell>
                <TableCell>
                  <code style={{ 
                    background: '#f8f9fa', 
                    padding: '2px 6px', 
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}>
                    {block.prefix}
                  </code>
                </TableCell>
                <TableCell>
                  <div style={{ fontWeight: '500' }}>
                    {block.current_number.toLocaleString()}
                  </div>
                </TableCell>
                <TableCell>
                  {block.nav_configuration_name || '—'}
                </TableCell>
                <TableCell>
                  <StatsContainer>
                    <StatItem>
                      <FileText size={12} />
                      <StatValue>{block.invoice_count}</StatValue> db
                    </StatItem>
                    <StatItem>
                      <TrendingUp size={12} />
                      <StatValue>{block.cancelled_count}</StatValue> sztornó
                    </StatItem>
                  </StatsContainer>
                  <div style={{ fontSize: '11px', color: '#7f8c8d' }}>
                    Nettó: {block.total_net_amount?.toLocaleString() || '0'} Ft
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge className={block.is_active ? 'active' : 'inactive'}>
                    {block.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <ActionButton
                      className="toggle"
                      active={block.is_active}
                      onClick={() => handleToggleActive(block)}
                      title={block.is_active ? 'Deaktiválás' : 'Aktiválás'}
                    >
                      {block.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </ActionButton>
                    <ActionButton
                      className="edit"
                      onClick={() => navigate(`/settings/invoice-blocks/${block.id}/edit`)}
                      title="Szerkesztés"
                    >
                      <Edit size={16} />
                    </ActionButton>
                    <ActionButton
                      className="delete"
                      onClick={() => handleDelete(block)}
                      title="Törlés"
                      disabled={block.invoice_count > 0}
                    >
                      <Trash2 size={16} />
                    </ActionButton>
                  </ActionButtons>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
};

export default InvoiceBlocks;
