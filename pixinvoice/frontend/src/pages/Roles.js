import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Shield, Plus, ArrowLeft, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import styled from 'styled-components';
import { roleAPI } from '../services/api';

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
  margin-bottom: 16px;
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

const Badge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background-color: #e3f2fd;
  color: #1976d2;
  margin-right: 6px;
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

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
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

  &.edit { background-color: #3498db; }
  &.delete { background-color: #e74c3c; }
  &.toggle { background-color: #95a5a6; }

  &:hover { opacity: 0.9; }
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

const Roles = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: roles, isLoading, error } = useQuery(
    ['roles', { search: searchTerm, is_active: statusFilter }],
    () => roleAPI.getRoles({
      search: searchTerm || undefined,
      is_active: statusFilter || undefined,
    }),
    {
      select: (response) => response.data || response,
    }
  );

  const deleteMutation = useMutation((id) => roleAPI.deleteRole(id), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Szerepkör törölve');
    },
    onError: () => toast.error('Hiba történt a törlés során'),
  });

  const toggleActiveMutation = useMutation(({ id, isActive }) => roleAPI.updateRole(id, { is_active: isActive }), {
    onSuccess: () => {
      queryClient.invalidateQueries(['roles']);
      toast.success('Szerepkör frissítve');
    },
    onError: () => toast.error('Hiba történt a frissítés során'),
  });

  const handleDelete = (role) => {
    if (window.confirm(`Biztosan törlöd a(z) "${role.name}" szerepkört?`)) {
      deleteMutation.mutate(role.id);
    }
  };

  const handleToggle = (role) => {
    toggleActiveMutation.mutate({ id: role.id, isActive: !role.is_active });
  };

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return <Container>Hiba történt a szerepkörök betöltésekor</Container>;
  }

  const list = roles?.results || roles || [];

  return (
    <Container>
      <Header>
        <Title>
          <Shield size={24} />
          Jogosultságok
        </Title>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button variant="primary" onClick={() => navigate('/settings/roles/new')}>
            <Plus size={16} />
            Új szerepkör
          </Button>
        </ButtonGroup>
      </Header>

      <SearchAndFilter>
        <SearchInput
          placeholder="Keresés név alapján..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '12px 16px', border: '1px solid #ddd', borderRadius: '6px' }}
        >
          <option value="">Minden státusz</option>
          <option value="true">Aktív</option>
          <option value="false">Inaktív</option>
        </select>
      </SearchAndFilter>

      {(!list || list.length === 0) ? (
        <EmptyState>Nincs megjeleníthető szerepkör</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Név</TableHeaderCell>
              <TableHeaderCell>Leírás</TableHeaderCell>
              <TableHeaderCell>Menük</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((role) => (
              <TableRow key={role.id}>
                <TableCell>{role.name}</TableCell>
                <TableCell>{role.description || '-'}</TableCell>
                <TableCell>
                  {(role.menu_permissions || []).map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </TableCell>
                <TableCell>
                  <StatusBadge className={role.is_active ? 'active' : 'inactive'}>
                    {role.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <ActionButtons>
                    <IconButton
                      className="edit"
                      onClick={() => navigate(`/settings/roles/${role.id}/edit`)}
                      title="Szerkesztés"
                      aria-label="Szerkesztés"
                    >
                      <Edit size={16} />
                    </IconButton>
                    <IconButton
                      className="toggle"
                      onClick={() => handleToggle(role)}
                      title={role.is_active ? 'Inaktiválás' : 'Aktiválás'}
                      aria-label={role.is_active ? 'Inaktiválás' : 'Aktiválás'}
                    >
                      {role.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </IconButton>
                    <IconButton
                      className="delete"
                      onClick={() => handleDelete(role)}
                      title="Törlés"
                      aria-label="Törlés"
                    >
                      <Trash2 size={16} />
                    </IconButton>
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

export default Roles;
