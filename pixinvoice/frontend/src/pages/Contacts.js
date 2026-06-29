import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Edit, Eye, Star, StarOff, UserCheck, UserX, Phone, Mail, Building, Grid, List, Trash2 } from 'lucide-react';
import styled from 'styled-components';
import { contactAPI } from '../services/api';

const Container = styled.div`
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ecf0f1;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 4px;
  background: #f8f9fa;
  border-radius: 4px;
  padding: 4px;
`;

const ViewButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border: none;
  background: ${props => props.active ? '#3498db' : 'transparent'};
  color: ${props => props.active ? 'white' : '#7f8c8d'};
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;

  &:hover {
    background: ${props => props.active ? '#3498db' : '#ecf0f1'};
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: ${props => props.variant === 'primary' ? '#3498db' : '#95a5a6'};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'primary' ? '#2980b9' : '#7f8c8d'};
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
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 8px;
    > * { width: 100%; }
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;

  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
  }

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
  margin-bottom: 24px;
`;

const ContactCard = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
  transition: all 0.2s;
  border-left: 4px solid ${props => props.isPrimary ? '#f39c12' : props.isActive ? '#27ae60' : '#95a5a6'};
  cursor: pointer;

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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const TableHead = styled.thead`
  background: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #ecf0f1;
  cursor: pointer;
  
  &:hover {
    background-color: #f8f9fa;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableHeader = styled.th`
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    ${props => props.$hideOnMobile && 'display: none;'}
  }
`;

const TableCell = styled.td`
  padding: 16px;
  color: #34495e;
  font-size: 14px;

  @media (max-width: 768px) {
    padding: 10px 8px;
    font-size: 12px;
    ${props => props.$hideOnMobile && 'display: none;'}
  }
`;

const TableActionsCell = styled(TableCell)`
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileActionsRow = styled.tr`
  display: none;

  @media (max-width: 768px) {
    display: ${props => (props.$open ? 'table-row' : 'none')};
  }
`;

const MobileActionsCell = styled.td`
  display: none;

  @media (max-width: 768px) {
    display: table-cell;
    padding: 8px;
    border-bottom: 1px solid #ecf0f1;
    background: #fff;
  }
`;

const MobileActionsBar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding: 16px 0;
  flex-wrap: wrap;
  gap: 16px;
`;

const PageSizeSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #34495e;
`;

const PageSizeSelect = styled.select`
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  background-color: white;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PageInfo = styled.span`
  font-size: 14px;
  color: #7f8c8d;
`;

const PaginationButton = styled.button`
  padding: 8px 16px;
  border: 1px solid #ddd;
  background-color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #3498db;
    color: white;
    border-color: #3498db;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100, 200];

const Contacts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Load preferences from localStorage
  const getSavedPreferences = () => {
    const saved = localStorage.getItem('contactsViewPreferences');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return { viewMode: 'grid', pageSize: 20 };
      }
    }
    return { viewMode: 'grid', pageSize: 20 };
  };

  const savedPrefs = getSavedPreferences();
  const [viewMode, setViewMode] = useState(savedPrefs.viewMode);
  const [pageSize, setPageSize] = useState(savedPrefs.pageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactTypeFilter, setContactTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [mobileActionsContactId, setMobileActionsContactId] = useState(null);

  const isMobileViewport = () => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  };

  const toggleMobileActionsForRow = (id) => {
    setMobileActionsContactId((prev) => (prev === id ? null : id));
  };

  const handleRowTouchTap = (event, id) => {
    if (!isMobileViewport()) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('input,button,a,label,select,textarea,[role="button"]')) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  };

  const handleRowContextMenu = (event, id) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    toggleMobileActionsForRow(id);
  };

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('contactsViewPreferences', JSON.stringify({
      viewMode,
      pageSize
    }));
  }, [viewMode, pageSize]);

  const { data: response, isLoading, error } = useQuery(
    ['contacts', { 
      search: searchTerm, 
      contact_type: contactTypeFilter, 
      is_active: statusFilter,
      page: currentPage,
      page_size: pageSize
    }],
    () => contactAPI.getContacts({
      search: searchTerm || undefined,
      contact_type: contactTypeFilter || undefined,
      is_active: statusFilter || undefined,
      page: currentPage,
      page_size: pageSize
    }),
    {
      keepPreviousData: true
    }
  );

  const contacts = response?.data?.results || [];
  const totalCount = response?.data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

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

  const handleDelete = (e, id, name) => {
    e.stopPropagation();
    if (window.confirm(`Biztosan törölni szeretné a kapcsolattartót: ${name}?`)) {
      deleteContactMutation.mutate(id);
    }
  };

  const handleSetPrimary = (e, id) => {
    e.stopPropagation();
    setPrimaryMutation.mutate(id);
  };

  const handleToggleActive = (e, id) => {
    e.stopPropagation();
    toggleActiveMutation.mutate(id);
  };

  const handleEdit = (e, id) => {
    e.stopPropagation();
    navigate(`/contacts/${id}/edit`);
  };

  const handleView = (id) => {
    navigate(`/contacts/${id}`);
  };

  const handleDoubleClick = (id) => {
    navigate(`/contacts/${id}`);
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value);
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
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

  const renderPagination = () => (
    <PaginationContainer>
      <PageSizeSelector>
        <span>Sorok száma oldalanként:</span>
        <PageSizeSelect value={pageSize} onChange={handlePageSizeChange}>
          {ITEMS_PER_PAGE_OPTIONS.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </PageSizeSelect>
      </PageSizeSelector>

      <PaginationControls>
        <PageInfo>
          {currentPage}. oldal / {totalPages} ({totalCount} kapcsolattartó)
        </PageInfo>
        <PaginationButton
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          Előző
        </PaginationButton>
        <PaginationButton
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages || totalPages === 0}
        >
          Következő
        </PaginationButton>
      </PaginationControls>
    </PaginationContainer>
  );

  if (isLoading && !contacts.length) {
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
        <HeaderRight>
          <ViewToggle>
            <ViewButton 
              active={viewMode === 'grid'} 
              onClick={() => setViewMode('grid')}
              title="Kártyás nézet"
            >
              <Grid size={16} />
              Kártyás
            </ViewButton>
            <ViewButton 
              active={viewMode === 'list'} 
              onClick={() => setViewMode('list')}
              title="Listás nézet"
            >
              <List size={16} />
              Listás
            </ViewButton>
          </ViewToggle>
          <Button variant="primary" onClick={() => navigate('/contacts/new')}>
            <Plus size={16} />
            Új kapcsolattartó
          </Button>
        </HeaderRight>
      </Header>

      <SearchContainer>
        <SearchInput
          type="text"
          placeholder="Keresés név, e-mail, pozíció vagy osztály szerint..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
        <FilterSelect
          value={contactTypeFilter}
          onChange={(e) => {
            setContactTypeFilter(e.target.value);
            setCurrentPage(1);
          }}
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
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Minden státusz</option>
          <option value="true">Aktív</option>
          <option value="false">Inaktív</option>
        </FilterSelect>
      </SearchContainer>

      {/* Top pagination */}
      {totalPages > 1 && renderPagination()}

      {contacts && contacts.length > 0 ? (
        viewMode === 'grid' ? (
          <ContactsGrid>
            {contacts.map((contact) => (
              <ContactCard 
                key={contact.id} 
                isPrimary={contact.is_primary} 
                isActive={contact.is_active}
                onDoubleClick={() => handleDoubleClick(contact.id)}
              >
                <ContactHeader>
                  <ContactName>
                    {contact.full_name}
                    {contact.is_primary && <Star size={16} color="#f39c12" />}
                  </ContactName>
                  <ContactActions>
                    <ActionButton
                      onClick={(e) => handleSetPrimary(e, contact.id)}
                      title={contact.is_primary ? "Már elsődleges" : "Elsődlegessé tétel"}
                      disabled={contact.is_primary}
                    >
                      {contact.is_primary ? <Star size={16} /> : <StarOff size={16} />}
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleToggleActive(e, contact.id)}
                      title={contact.is_active ? "Deaktiválás" : "Aktiválás"}
                    >
                      {contact.is_active ? <UserCheck size={16} /> : <UserX size={16} />}
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleView(contact.id)}
                      title="Megtekintés"
                      variant="primary"
                    >
                      <Eye size={16} />
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleEdit(e, contact.id)}
                      title="Szerkesztés"
                      variant="primary"
                    >
                      <Edit size={16} />
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleDelete(e, contact.id, contact.full_name)}
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
          <Table>
            <TableHead>
              <tr>
                <TableHeader>Név</TableHeader>
                <TableHeader>Ügyfél</TableHeader>
                <TableHeader $hideOnMobile>Pozíció</TableHeader>
                <TableHeader $hideOnMobile>Típus</TableHeader>
                <TableHeader $hideOnMobile>E-mail</TableHeader>
                <TableHeader $hideOnMobile>Telefon</TableHeader>
                <TableHeader $hideOnMobile>Státusz</TableHeader>
                <TableHeader $hideOnMobile>Műveletek</TableHeader>
              </tr>
            </TableHead>
            <tbody>
              {contacts.map((contact) => {
                const actionButtons = (
                  <ContactActions>
                    <ActionButton
                      onClick={(e) => handleView(contact.id)}
                      title="Megtekintés"
                      variant="primary"
                    >
                      <Eye size={16} />
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleEdit(e, contact.id)}
                      title="Szerkesztés"
                      variant="primary"
                    >
                      <Edit size={16} />
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => handleDelete(e, contact.id, contact.full_name)}
                      title="Törlés"
                      variant="danger"
                    >
                      <Trash2 size={16} />
                    </ActionButton>
                  </ContactActions>
                );
                return (
                <React.Fragment key={contact.id}>
                <TableRow 
                  onDoubleClick={() => handleDoubleClick(contact.id)}
                  onContextMenu={(event) => handleRowContextMenu(event, contact.id)}
                  onTouchEnd={(event) => handleRowTouchTap(event, contact.id)}
                >
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {contact.full_name}
                      {contact.is_primary && <Star size={14} color="#f39c12" fill="#f39c12" />}
                    </div>
                    <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 2 }}>{contact.customer_name}</div>
                  </TableCell>
                  <TableCell $hideOnMobile>{contact.customer_name}</TableCell>
                  <TableCell $hideOnMobile>{contact.position || '-'}</TableCell>
                  <TableCell $hideOnMobile>
                    <ContactType type={contact.contact_type}>
                      {getContactTypeLabel(contact.contact_type)}
                    </ContactType>
                  </TableCell>
                  <TableCell $hideOnMobile>{contact.email || '-'}</TableCell>
                  <TableCell $hideOnMobile>{contact.phone || contact.mobile || '-'}</TableCell>
                  <TableCell $hideOnMobile>
                    <StatusBadge isActive={contact.is_active}>
                      {contact.is_active ? 'Aktív' : 'Inaktív'}
                    </StatusBadge>
                  </TableCell>
                  <TableActionsCell>
                    {actionButtons}
                  </TableActionsCell>
                </TableRow>
                <MobileActionsRow $open={mobileActionsContactId === contact.id}>
                  <MobileActionsCell colSpan={8}>
                    <MobileActionsBar>
                      {actionButtons}
                    </MobileActionsBar>
                  </MobileActionsCell>
                </MobileActionsRow>
                </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )
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

      {/* Bottom pagination */}
      {totalPages > 1 && renderPagination()}
    </Container>
  );
};

export default Contacts;
