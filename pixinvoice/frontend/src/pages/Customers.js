import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Edit, 
  Eye,
  MapPin,
  Phone,
  Mail,
  Grid,
  List,
  X
} from 'lucide-react';
import styled from 'styled-components';
import { customerAPI } from '../services/api';

const CustomersContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const CustomersHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const SearchContainer = styled.div`
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

const SearchInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-width: 200px;
`;

const ActionButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #ecf0f1;
  color: #34495e;
  border: 1px solid #dcdfe3;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: #e4e8ec;
    color: #2c3e50;
  }
`;

const CustomersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  padding: 24px;
`;

const CustomerCard = styled.div`
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #ecf0f1;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const CustomerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const CustomerName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const TaxNumber = styled.span`
  font-size: 14px;
  color: #7f8c8d;
  background: #ecf0f1;
  padding: 4px 8px;
  border-radius: 4px;
`;

const CustomerInfo = styled.div`
  margin-bottom: 16px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #2c3e50;

  &:last-child {
    margin-bottom: 0;
  }
`;

const InfoIcon = styled.div`
  color: #7f8c8d;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  transition: background-color 0.2s;
  background-color: ${props => {
    switch (props.variant) {
      case 'edit': return '#3498db';
      case 'delete': return '#e74c3c';
      case 'view': return '#6c757d';
      default: return '#f8f9fa';
    }
  }};
  color: white;

  &:hover {
    opacity: 0.8;
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

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  gap: 16px;
  flex-wrap: wrap;
`;

const PaginationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
`;

const PageSizeSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #2c3e50;
`;

const PageSizeSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`;

const PageInfo = styled.div`
  font-size: 14px;
  color: #7f8c8d;
  white-space: nowrap;
`;

const PaginationButton = styled.button`
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  color: #2c3e50;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #f8f9fa;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.active {
    background-color: #3498db;
    color: white;
    border-color: #3498db;
  }
`;

const ListView = styled.div`
  padding: 0;
`;

const ListTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.thead`
  background: #f8f9fa;
  border-bottom: 2px solid #ecf0f1;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #ecf0f1;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f8f9fa;
  }
`;

const TableHead = styled.th`
  text-align: left;
  padding: 16px 24px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
`;

const TableCell = styled.td`
  padding: 16px 24px;
  color: #2c3e50;
  font-size: 14px;
`;

const TableActions = styled(TableCell)`
  text-align: right;
`;

const Customers = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Load saved preferences from localStorage
  const getSavedPreferences = () => {
    try {
      const saved = localStorage.getItem('customersPagePreferences');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading preferences:', e);
    }
    return {
      viewMode: 'grid',
      pageSize: 20,
      currentPage: 1,
      searchTerm: ''
    };
  };

  const savedPrefs = getSavedPreferences();
  
  const [searchTerm, setSearchTerm] = useState(savedPrefs.searchTerm);
  const [currentPage, setCurrentPage] = useState(savedPrefs.currentPage);
  const [viewMode, setViewMode] = useState(savedPrefs.viewMode);
  const [pageSize, setPageSize] = useState(savedPrefs.pageSize);
  const [customerTypeFilter, setCustomerTypeFilter] = useState(savedPrefs.customerTypeFilter || 'all');
  const hasActiveFilters = Boolean((searchTerm && searchTerm.length > 0) || (customerTypeFilter && customerTypeFilter !== 'all'));
  
  const queryClient = useQueryClient();

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    const preferences = {
      viewMode,
      pageSize,
      currentPage,
      searchTerm,
      customerTypeFilter
    };
    try {
      localStorage.setItem('customersPagePreferences', JSON.stringify(preferences));
    } catch (e) {
      console.error('Error saving preferences:', e);
    }
  }, [viewMode, pageSize, currentPage, searchTerm, customerTypeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, customerTypeFilter]);

  const { data: customers, isLoading, error } = useQuery(
    ['customers', { search: searchTerm, page: currentPage, pageSize, customerTypeFilter }],
    () => customerAPI.getCustomers({
      search: searchTerm || undefined,
      page: currentPage,
      page_size: pageSize,
      type: customerTypeFilter === 'customers' ? 'customer' : (customerTypeFilter === 'suppliers' ? 'supplier' : undefined),
    }),
    {
      keepPreviousData: true,
      // Avoid retry loops on page overflow; handle page reset manually
      retry: (failureCount, err) => err?.response?.status !== 404 && failureCount < 2,
      select: (response) => {
        let results = response.data.results || [];
        // Client-side filter by customer type
        if (customerTypeFilter === 'customers') {
          results = results.filter(c => c.is_customer);
        } else if (customerTypeFilter === 'suppliers') {
          results = results.filter(c => c.is_supplier);
        }
        return { ...response.data, results };
      },
      onError: (err) => {
        if (err?.response?.status === 404 && currentPage > 1) {
          // If the page is out of range (common after filtering), jump back to page 1
          setCurrentPage(1);
          return;
        }
        console.error('Customers page error:', err);
      }
    }
  );

  const totalPages = customers?.count ? Math.ceil(customers.count / pageSize) : 0;

  const handlePageSizeChange = (newSize) => {
    setPageSize(Number(newSize));
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const handleDoubleClick = (customerId) => {
    navigate(`/customers/${customerId}`);
  };

  const renderPagination = () => (
    <Pagination>
      <PageSizeSelector>
        <span>Sorok száma:</span>
        <PageSizeSelect value={pageSize} onChange={(e) => handlePageSizeChange(e.target.value)}>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </PageSizeSelect>
      </PageSizeSelector>

      <PaginationControls>
        <PaginationButton
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={!customers.previous}
        >
          Előző
        </PaginationButton>
        
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))
          .map((page) => (
            <PaginationButton
              key={page}
              className={page === currentPage ? 'active' : ''}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </PaginationButton>
          ))}
        
        <PaginationButton
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={!customers.next}
        >
          Következő
        </PaginationButton>
      </PaginationControls>

      <PageInfo>
        {currentPage}. oldal / {totalPages} oldal összesen
      </PageInfo>
    </Pagination>
  );

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return (
      <div style={{ color: '#e74c3c', textAlign: 'center', padding: '40px' }}>
        Hiba történt az adatok betöltése során
      </div>
    );
  }

  return (
    <CustomersContainer>
      <CustomersHeader>
        <Title>Ügyfelek</Title>
        <SearchContainer>
          <PageSizeSelect value={customerTypeFilter} onChange={(e) => setCustomerTypeFilter(e.target.value)}>
            <option value="all">Mind</option>
            <option value="customers">Vevők</option>
            <option value="suppliers">Beszállítók</option>
          </PageSizeSelect>
          <SearchInput
            type="text"
            placeholder="Keresés név, adószám vagy email alapján..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {hasActiveFilters && (
            <ClearButton
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCustomerTypeFilter('all');
                setCurrentPage(1);
              }}
              title="Szűrők törlése"
            >
              <X size={14} />
              Szűrők törlése
            </ClearButton>
          )}
          <ViewToggle>
            <ViewButton 
              active={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              title="Kártyás nézet"
            >
              <Grid size={16} />
            </ViewButton>
            <ViewButton 
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              title="Listás nézet"
            >
              <List size={16} />
            </ViewButton>
          </ViewToggle>
          <ActionButton to="/customers/new">
            <Plus size={16} />
            Új ügyfél
          </ActionButton>
        </SearchContainer>
      </CustomersHeader>

      {!isLoading && !error && customers?.count > 0 && renderPagination()}

      {!isLoading && !error && viewMode === 'grid' && (
        <div>
          <CustomersGrid>
            {customers?.results?.map((customer) => (
          <CustomerCard 
            key={customer.id}
            onDoubleClick={() => handleDoubleClick(customer.id)}
            style={{ cursor: 'pointer' }}
          >
            <CustomerHeader>
              <div>
                <CustomerName>{customer.name}</CustomerName>
                <TaxNumber>{customer.tax_number}</TaxNumber>
              </div>
              <ActionButtons>
                <IconButton
                  variant="view"
                  title="Megtekintés"
                  as={Link}
                  to={`/customers/${customer.id}`}
                >
                  <Eye size={16} />
                </IconButton>
                <IconButton
                  variant="edit"
                  title="Szerkesztés"
                  as={Link}
                  to={`/customers/${customer.id}/edit`}
                >
                  <Edit size={16} />
                </IconButton>
              </ActionButtons>
            </CustomerHeader>

            <CustomerInfo>
              <InfoRow>
                <InfoIcon>
                  <MapPin size={14} />
                </InfoIcon>
                <span>{customer.address}, {customer.city} {customer.postal_code}</span>
              </InfoRow>
              
              {customer.email && (
                <InfoRow>
                  <InfoIcon>
                    <Mail size={14} />
                  </InfoIcon>
                  <span>{customer.email}</span>
                </InfoRow>
              )}
              
              {customer.phone && (
                <InfoRow>
                  <InfoIcon>
                    <Phone size={14} />
                  </InfoIcon>
                  <span>{customer.phone}</span>
                </InfoRow>
              )}
            </CustomerInfo>
          </CustomerCard>
        ))}
          </CustomersGrid>
        </div>
      )}

      {!isLoading && !error && viewMode === 'list' && (
        <ListView>
          <ListTable>
            <TableHeader>
              <tr>
                <TableHead>Név</TableHead>
                <TableHead>Adószám</TableHead>
                <TableHead>Cím</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Műveletek</TableHead>
              </tr>
            </TableHeader>
            <tbody>
              {customers?.results?.map((customer) => (
                <TableRow 
                  key={customer.id}
                  onDoubleClick={() => handleDoubleClick(customer.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <strong>{customer.name}</strong>
                  </TableCell>
                  <TableCell>{customer.tax_number}</TableCell>
                  <TableCell>{customer.city} {customer.postal_code}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableActions>
                    <ActionButtons>
                      <IconButton
                        variant="view"
                        title="Megtekintés"
                        as={Link}
                        to={`/customers/${customer.id}`}
                      >
                        <Eye size={16} />
                      </IconButton>
                      <IconButton
                        variant="edit"
                        title="Szerkesztés"
                        as={Link}
                        to={`/customers/${customer.id}/edit`}
                      >
                        <Edit size={16} />
                      </IconButton>
                    </ActionButtons>
                  </TableActions>
                </TableRow>
              ))}
            </tbody>
          </ListTable>
        </ListView>
      )}

      {!isLoading && !error && (!customers?.results || customers.results.length === 0) && (
        <EmptyState>
          <p>{hasActiveFilters ? 'Nincs találat a jelenlegi szűrőkkel' : 'Nincsenek ügyfelek'}</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {hasActiveFilters && (
              <ClearButton
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCustomerTypeFilter('all');
                  setCurrentPage(1);
                }}
              >
                <X size={14} />
                Szűrők törlése
              </ClearButton>
            )}
            <ActionButton to="/customers/new">
              <Plus size={16} />
              Új ügyfél létrehozása
            </ActionButton>
          </div>
        </EmptyState>
      )}

      {!isLoading && !error && customers?.count > 0 && renderPagination()}
    </CustomersContainer>
  );
};

export default Customers;


