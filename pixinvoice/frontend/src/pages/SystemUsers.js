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
  Users,
  ArrowLeft,
  Eye,
  EyeOff,
  Key,
  Building2
} from 'lucide-react';
import styled from 'styled-components';
import { systemUserAPI, companyAPI } from '../services/api';

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

  &.password {
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

const CompanyTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const CompanyTag = styled.span`
  display: inline-block;
  padding: 2px 6px;
  background-color: #e3f2fd;
  color: #1976d2;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
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

const SystemUsers = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: users, isLoading, error } = useQuery(
    ['system-users', { search: searchTerm, is_active: statusFilter }],
    () => systemUserAPI.getSystemUsers({
      search: searchTerm || undefined,
      is_active: statusFilter || undefined,
    }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const deleteUserMutation = useMutation(
    (id) => systemUserAPI.deleteSystemUser(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['system-users']);
        toast.success('Felhasználó törölve');
      },
      onError: (error) => {
        toast.error('Hiba történt a felhasználó törlése során');
        console.error('Delete user error:', error);
      }
    }
  );

  const toggleActiveMutation = useMutation(
    ({ id, isActive }) => systemUserAPI.updateSystemUser(id, { is_active: isActive }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['system-users']);
        toast.success('Felhasználó státusza frissítve');
      },
      onError: (error) => {
        toast.error('Hiba történt a státusz frissítése során');
        console.error('Toggle active error:', error);
      }
    }
  );

  const handleDelete = (user) => {
    if (window.confirm(`Biztosan törölni szeretné a(z) "${user.full_name}" felhasználót?`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const handleToggleActive = (user) => {
    toggleActiveMutation.mutate({
      id: user.id,
      isActive: !user.is_active
    });
  };

  const handleSetPassword = (user) => {
    const newPassword = prompt(`Új jelszó megadása a(z) "${user.full_name}" felhasználóhoz:`);
    if (newPassword && newPassword.length >= 6) {
      systemUserAPI.setPassword(user.id, newPassword)
        .then(() => {
          toast.success('Jelszó frissítve');
        })
        .catch((error) => {
          toast.error('Hiba történt a jelszó frissítése során');
          console.error('Set password error:', error);
        });
    } else if (newPassword) {
      toast.error('A jelszó legalább 6 karakter hosszú kell legyen');
    }
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
        <div>Hiba történt a felhasználók betöltése során: {error.message}</div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>
          <Users size={24} />
          Felhasználók
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button variant="primary" onClick={() => navigate('/settings/users/new')}>
            <Plus size={16} />
            Új felhasználó
          </Button>
        </ButtonGroup>
      </Header>

      <SearchAndFilter>
        <SearchInput
          type="text"
          placeholder="Keresés név vagy e-mail alapján..."
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

      {users.length === 0 ? (
        <EmptyState>
          <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Nincsenek felhasználók</h3>
          <p>Kezdje el egy új felhasználó hozzáadásával</p>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Név</TableHeaderCell>
              <TableHeaderCell>E-mail</TableHeaderCell>
              <TableHeaderCell>Cégek</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                      {user.full_name}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <CompanyTags>
                    {user.companies && user.companies.length > 0 ? (
                      user.companies.map((company) => (
                        <CompanyTag key={company.id}>
                          {company.name}
                        </CompanyTag>
                      ))
                    ) : (
                      <span style={{ color: '#7f8c8d', fontSize: '12px' }}>Nincs hozzárendelt cég</span>
                    )}
                  </CompanyTags>
                </TableCell>
                <TableCell>
                  <StatusBadge className={user.is_active ? 'active' : 'inactive'}>
                    {user.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <ActionButton
                      className="password"
                      onClick={() => handleSetPassword(user)}
                      title="Jelszó beállítása"
                    >
                      <Key size={16} />
                    </ActionButton>
                    <ActionButton
                      className="toggle"
                      active={user.is_active}
                      onClick={() => handleToggleActive(user)}
                      title={user.is_active ? 'Deaktiválás' : 'Aktiválás'}
                    >
                      {user.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </ActionButton>
                    <ActionButton
                      className="edit"
                      onClick={() => navigate(`/settings/users/${user.id}/edit`)}
                      title="Szerkesztés"
                    >
                      <Edit size={16} />
                    </ActionButton>
                    <ActionButton
                      className="delete"
                      onClick={() => handleDelete(user)}
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

export default SystemUsers;
