import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Search, Edit, Trash2, Star, StarOff, UserCheck, UserX, Phone, Mail, Building } from 'lucide-react';
import styled from 'styled-components';
import { contactAPI } from '../services/api';

const Container = styled.div`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
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
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
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
  background-color: ${props => props.variant === 'primary' ? '#3498db' : props.variant === 'danger' ? '#e74c3c' : '#95a5a6'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : props.variant === 'danger' ? '#c0392b' : '#7f8c8d'};
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
    transform: none;
  }
`;

const SearchContainer = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  align-items: center;
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

const ContactsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
`;

const ContactCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  transition: all 0.2s;
  border-left: 4px solid ${props => props.isPrimary ? '#f39c12' : props.isActive ? '#27ae60' : '#95a5a6'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
`;

const ContactHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ContactName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ContactActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  padding: 6px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: #7f8c8d;
  transition: all 0.2s;

  &:hover {
    background-color: #ecf0f1;
    color: ${props => props.variant === 'primary' ? '#3498db' : props.variant === 'danger' ? '#e74c3c' : '#2c3e50'};
  }
`;

const ContactInfo = styled.div`
  margin-bottom: 16px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #7f8c8d;
`;

const InfoLabel = styled.span`
  font-weight: 500;
  color: #34495e;
  min-width: 80px;
`;

const ContactType = styled.span`
  display: inline-block;
  padding: 4px 8px;
  background-color: ${props => {
    const colors = {
      'primary': '#f39c12',
      'billing': '#3498db',
      'technical': '#9b59b6',
      'sales': '#27ae60',
      'support': '#e67e22',
      'other': '#95a5a6'
    };
    return colors[props.type] || '#95a5a6';
  }};
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  background-color: ${props => props.isActive ? '#27ae60' : '#e74c3c'};
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
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

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #7f8c8d;
`;

const EmptyIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 20px;
  margin: 0 0 8px 0;
  color: #34495e;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  margin: 0;
`;

const Contacts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [contactTypeFilter, setContactTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: contacts, isLoading, error } = useQuery(
    ['contacts', { search: searchTerm, contact_type: contactTypeFilter, is_active: statusFilter }],
    () => contactAPI.getContacts({
      search: searchTerm || undefined,
      contact_type: contactTypeFilter || undefined,
      is_active: statusFilter || undefined
    }),
    {
      select: (response) => response.data?.results || []
    }
  );

  const deleteContactMutation = useMutation(
    (id) => contactAPI.deleteContact(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        toast.success('Kapcsolattartó törölve');
      },
      onError: (error) => {
        toast.error('Hiba történt a kapcsolattartó törlése során');
        console.error('Delete contact error:', error);
      }
    }
  );

  const setPrimaryMutation = useMutation(
    (id) => contactAPI.setPrimary(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        toast.success('Elsődleges kapcsolattartó beállítva');
      },
      onError: (error) => {
        toast.error('Hiba történt az elsődleges kapcsolattartó beállítása során');
        console.error('Set primary error:', error);
      }
    }
  );

  const toggleActiveMutation = useMutation(
    (id) => contactAPI.toggleActive(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['contacts']);
        toast.success('Kapcsolattartó státusza frissítve');
      },
      onError: (error) => {
        toast.error('Hiba történt a kapcsolattartó státuszának frissítése során');
        console.error('Toggle active error:', error);
      }
    }
  );

  const handleDelete = (id, name) => {
    if (window.confirm(`Biztosan törölni szeretné a kapcsolattartót: ${name}?`)) {
      deleteContactMutation.mutate(id);
    }
  };

  const handleSetPrimary = (id) => {
    setPrimaryMutation.mutate(id);
  };

  const handleToggleActive = (id) => {
    toggleActiveMutation.mutate(id);
  };

  const getContactTypeLabel = (type) => {
    const labels = {
      'primary': 'Elsődleges',
      'billing': 'Számlázási',
      'technical': 'Technikai',
      'sales': 'Értékesítési',
      'support': 'Támogatási',
      'other': 'Egyéb'
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingSpinner>Kapcsolattartók betöltése...</LoadingSpinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div>Hiba történt a kapcsolattartók betöltése során: {error.message}</div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Kapcsolattartók</Title>
        <ButtonGroup>
          <Button variant="primary" onClick={() => navigate('/contacts/new')}>
            <Plus size={16} />
            Új kapcsolattartó
          </Button>
        </ButtonGroup>
      </Header>

      <SearchContainer>
        <SearchInput
          type="text"
          placeholder="Keresés név, e-mail, pozíció vagy osztály szerint..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <FilterSelect
          value={contactTypeFilter}
          onChange={(e) => setContactTypeFilter(e.target.value)}
        >
          <option value="">Minden típus</option>
          <option value="primary">Elsődleges</option>
          <option value="billing">Számlázási</option>
          <option value="technical">Technikai</option>
          <option value="sales">Értékesítési</option>
          <option value="support">Támogatási</option>
          <option value="other">Egyéb</option>
        </FilterSelect>
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Minden státusz</option>
          <option value="true">Aktív</option>
          <option value="false">Inaktív</option>
        </FilterSelect>
      </SearchContainer>

      {contacts && contacts.length > 0 ? (
        <ContactsGrid>
          {contacts.map((contact) => (
            <ContactCard key={contact.id} isPrimary={contact.is_primary} isActive={contact.is_active}>
              <ContactHeader>
                <ContactName>
                  {contact.full_name}
                  {contact.is_primary && <Star size={16} color="#f39c12" />}
                </ContactName>
                <ContactActions>
                  <ActionButton
                    onClick={() => handleSetPrimary(contact.id)}
                    title={contact.is_primary ? "Már elsődleges" : "Elsődlegessé tétel"}
                    disabled={contact.is_primary}
                  >
                    {contact.is_primary ? <Star size={16} /> : <StarOff size={16} />}
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleToggleActive(contact.id)}
                    title={contact.is_active ? "Deaktiválás" : "Aktiválás"}
                  >
                    {contact.is_active ? <UserCheck size={16} /> : <UserX size={16} />}
                  </ActionButton>
                  <ActionButton
                    onClick={() => navigate(`/contacts/${contact.id}/edit`)}
                    title="Szerkesztés"
                  >
                    <Edit size={16} />
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleDelete(contact.id, contact.full_name)}
                    title="Törlés"
                    variant="danger"
                  >
                    <Trash2 size={16} />
                  </ActionButton>
                </ContactActions>
              </ContactHeader>

              <ContactInfo>
                <InfoRow>
                  <InfoLabel>Ügyfél:</InfoLabel>
                  <span>{contact.customer_name}</span>
                </InfoRow>
                
                {contact.position && (
                  <InfoRow>
                    <InfoLabel>Pozíció:</InfoLabel>
                    <span>{contact.position}</span>
                  </InfoRow>
                )}
                
                {contact.department && (
                  <InfoRow>
                    <InfoLabel>Osztály:</InfoLabel>
                    <span>{contact.department}</span>
                  </InfoRow>
                )}
                
                <InfoRow>
                  <InfoLabel>Típus:</InfoLabel>
                  <ContactType type={contact.contact_type}>
                    {getContactTypeLabel(contact.contact_type)}
                  </ContactType>
                  <StatusBadge isActive={contact.is_active}>
                    {contact.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </InfoRow>
                
                {contact.email && (
                  <InfoRow>
                    <Mail size={14} />
                    <span>{contact.email}</span>
                  </InfoRow>
                )}
                
                {contact.phone && (
                  <InfoRow>
                    <Phone size={14} />
                    <span>{contact.phone}</span>
                  </InfoRow>
                )}
                
                {contact.mobile && (
                  <InfoRow>
                    <Phone size={14} />
                    <span>{contact.mobile} (mobil)</span>
                  </InfoRow>
                )}
              </ContactInfo>
            </ContactCard>
          ))}
        </ContactsGrid>
      ) : (
        <EmptyState>
          <EmptyIcon>👥</EmptyIcon>
          <EmptyTitle>Nincsenek kapcsolattartók</EmptyTitle>
          <EmptyDescription>
            {searchTerm || contactTypeFilter || statusFilter
              ? 'Nincs találat a keresési feltételeknek megfelelően.'
              : 'Még nincs hozzáadva kapcsolattartó. Kattintson az "Új kapcsolattartó" gombra a hozzáadáshoz.'
            }
          </EmptyDescription>
        </EmptyState>
      )}
    </Container>
  );
};

export default Contacts;
