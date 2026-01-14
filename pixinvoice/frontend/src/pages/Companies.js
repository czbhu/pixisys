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
  Building2,
  ArrowLeft,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import styled from 'styled-components';
import { companyAPI } from '../services/api';
import api from '../services/api';

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

  &.sync {
    background-color: #6c5ce7;
    &:hover { background-color: #5848c2; }
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

const Companies = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regenLoading, setRegenLoading] = useState({});
  const [syncLoading, setSyncLoading] = useState({});

  const handleRegenerateApiKey = async (company) => {
    setRegenLoading(l => ({ ...l, [company.id]: true }));
    try {
      await companyAPI.regenerateApiKey(company.id);
      toast.success('API-kulcs újragenerálva');
      queryClient.invalidateQueries(['companies']);
    } catch (e) {
      toast.error('API-kulcs újragenerálása sikertelen');
    } finally {
      setRegenLoading(l => ({ ...l, [company.id]: false }));
    }
  };

  const handleFullSync = async (company) => {
    setSyncLoading(l => ({ ...l, [company.id]: true }));
    try {
      await api.get('/api/invoices/incoming/', {
        params: {
          company_id: company.id,
          refresh: 1,
          backfill_all: 1,
          page: 1,
        }
      });
      toast.success('NAV visszatöltés elindítva');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Hiba a visszatöltés indításakor';
      toast.error(msg);
    } finally {
      setSyncLoading(l => ({ ...l, [company.id]: false }));
    }
  };

  const { data: companies, isLoading, error } = useQuery(
    ['companies', { search: searchTerm, is_active: statusFilter }],
    () => companyAPI.getCompanies({
      search: searchTerm || undefined,
      is_active: statusFilter || undefined,
    }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const deleteCompanyMutation = useMutation(
    (id) => companyAPI.deleteCompany(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['companies']);
        toast.success('Cég törölve');
      },
      onError: (error) => {
        toast.error('Hiba történt a cég törlése során');
        console.error('Delete company error:', error);
      }
    }
  );

  const toggleActiveMutation = useMutation(
    ({ id, isActive }) => companyAPI.updateCompany(id, { is_active: isActive }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['companies']);
        toast.success('Cég státusza frissítve');
      },
      onError: (error) => {
        toast.error('Hiba történt a státusz frissítése során');
        console.error('Toggle active error:', error);
      }
    }
  );

  const handleDelete = (company) => {
    if (window.confirm(`Biztosan törölni szeretné a(z) "${company.name}" céget?`)) {
      deleteCompanyMutation.mutate(company.id);
    }
  };

  const handleToggleActive = (company) => {
    toggleActiveMutation.mutate({
      id: company.id,
      isActive: !company.is_active
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
        <div>Hiba történt a cégek betöltése során: {error.message}</div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>
          <Building2 size={24} />
          Cégek
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button variant="primary" onClick={() => navigate('/settings/companies/new')}>
            <Plus size={16} />
            Új cég
          </Button>
        </ButtonGroup>
      </Header>

      <SearchAndFilter>
        <SearchInput
          type="text"
          placeholder="Keresés cég neve, adószám vagy e-mail alapján..."
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
      </SearchAndFilter>

      {companies.length === 0 ? (
        <EmptyState>
          <Building2 size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Nincsenek cégek</h3>
          <p>Kezdje el egy új cég hozzáadásával</p>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Cég neve</TableHeaderCell>
              <TableHeaderCell>Adószám</TableHeaderCell>
              <TableHeaderCell>Város</TableHeaderCell>
              <TableHeaderCell>E-mail</TableHeaderCell>
              <TableHeaderCell>API-kulcs</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                      {company.name}
                    </div>
                    {company.short_name && (
                      <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                        {company.short_name}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{company.tax_number}</TableCell>
                <TableCell>{company.city}</TableCell>
                <TableCell>{company.email || '-'}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f8f9fa', padding: '2px 6px', borderRadius: 4 }}>{company.api_key || '-'}</span>
                    {company.api_key && (
                      <>
                        <button
                          style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eee', background: '#e3f2fd', cursor: 'pointer' }}
                          onClick={() => { navigator.clipboard.writeText(company.api_key); toast.success('API-kulcs vágólapra másolva'); }}
                        >Másolás</button>
                        <button
                          style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eee', background: '#ffe0e0', cursor: regenLoading[company.id] ? 'not-allowed' : 'pointer' }}
                          disabled={regenLoading[company.id]}
                          onClick={() => handleRegenerateApiKey(company)}
                        >{regenLoading[company.id] ? '...' : 'Új API-kulcs'}</button>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge className={company.is_active ? 'active' : 'inactive'}>
                    {company.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <ActionButton
                      className="toggle"
                      active={company.is_active}
                      onClick={() => handleToggleActive(company)}
                      title={company.is_active ? 'Deaktiválás' : 'Aktiválás'}
                    >
                      {company.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </ActionButton>
                    <ActionButton
                      className="sync"
                      onClick={() => handleFullSync(company)}
                      title="Bejövő számlák letöltése a NAV-tól"
                      disabled={syncLoading[company.id]}
                    >
                      {syncLoading[company.id] ? '…' : <RefreshCw size={16} />}
                    </ActionButton>
                    <ActionButton
                      className="edit"
                      onClick={() => navigate(`/settings/companies/${company.id}/edit`)}
                      title="Szerkesztés"
                    >
                      <Edit size={16} />
                    </ActionButton>
                    <ActionButton
                      className="delete"
                      onClick={() => handleDelete(company)}
                      title="Törlés"
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

export default Companies;
