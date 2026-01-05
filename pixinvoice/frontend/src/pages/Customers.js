import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  MapPin,
  Phone,
  Mail
} from 'lucide-react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
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
  justify-content: center;
  align-items: center;
  padding: 20px;
  gap: 8px;
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

const Customers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const queryClient = useQueryClient();

  const { data: customers, isLoading, error } = useQuery(
    ['customers', { search: searchTerm, page: currentPage }],
    () => customerAPI.getCustomers({
      search: searchTerm || undefined,
      page: currentPage,
    }),
    {
      keepPreviousData: true,
      select: (response) => response.data,
      onError: (error) => {
        console.error('Customers page error:', error);
      }
    }
  );

  const deleteCustomerMutation = useMutation(
    (id) => customerAPI.deleteCustomer(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('customers');
        toast.success('Ügyfél törölve');
      },
      onError: () => {
        toast.error('Hiba történt az ügyfél törlése során');
      },
    }
  );

  const handleDelete = (id, name) => {
    if (window.confirm(`Biztosan törölni szeretné az ügyfelet: ${name}?`)) {
      deleteCustomerMutation.mutate(id);
    }
  };

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
          <SearchInput
            type="text"
            placeholder="Keresés név, adószám vagy email alapján..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ActionButton to="/customers/new">
            <Plus size={16} />
            Új ügyfél
          </ActionButton>
        </SearchContainer>
      </CustomersHeader>

      {!isLoading && !error && (
        <div>
          <CustomersGrid>
            {customers?.results?.map((customer) => (
          <CustomerCard key={customer.id}>
            <CustomerHeader>
              <div>
                <CustomerName>{customer.name}</CustomerName>
                <TaxNumber>{customer.tax_number}</TaxNumber>
              </div>
              <ActionButtons>
                <IconButton
                  variant="view"
                  title="Megtekintés"
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
                <IconButton
                  variant="delete"
                  title="Törlés"
                  onClick={() => handleDelete(customer.id, customer.name)}
                >
                  <Trash2 size={16} />
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

      {!isLoading && !error && (!customers?.results || customers.results.length === 0) && (
        <EmptyState>
          <p>Nincsenek ügyfelek</p>
          <ActionButton to="/customers/new" style={{ marginTop: '16px' }}>
            <Plus size={16} />
            Új ügyfél létrehozása
          </ActionButton>
        </EmptyState>
      )}

      {!isLoading && !error && customers?.count > 0 && (
        <Pagination>
          <PaginationButton
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={!customers.previous}
          >
            Előző
          </PaginationButton>
          
          {Array.from({ length: Math.ceil(customers.count / 20) }, (_, i) => i + 1)
            .slice(Math.max(0, currentPage - 3), currentPage + 2)
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
        </Pagination>
      )}
    </CustomersContainer>
  );
};

export default Customers;


