import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowLeft, Edit, MapPin, Phone, Mail, Building, User } from 'lucide-react';
import styled from 'styled-components';
import { customerAPI } from '../services/api';

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const Header = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const Button = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: ${props => props.variant === 'secondary' ? '#6c757d' : '#3498db'};
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => props.variant === 'secondary' ? '#5a6268' : '#2980b9'};
  }
`;

const DetailCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 2px solid #ecf0f1;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #7f8c8d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.span`
  font-size: 16px;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  background-color: ${props => {
    switch(props.type) {
      case 'domestic': return '#3498db';
      case 'private': return '#9b59b6';
      case 'other': return '#95a5a6';
      default: return '#95a5a6';
    }
  }};
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  font-size: 18px;
  color: #7f8c8d;
`;

const ErrorMessage = styled.div`
  background: #fee;
  color: #c33;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
`;

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: customer, isLoading, error } = useQuery(
    ['customer', id],
    () => customerAPI.getCustomer(id),
    {
      select: (response) => response.data,
      onError: (error) => {
        console.error('Customer detail error:', error);
      }
    }
  );

  if (isLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  if (error) {
    return (
      <Container>
        <ErrorMessage>
          Hiba történt az ügyfél adatainak betöltése során
        </ErrorMessage>
      </Container>
    );
  }

  const getTaxStatusLabel = (status) => {
    switch(status) {
      case 'DOMESTIC': return 'Belföldi';
      case 'PRIVATE_PERSON': return 'Magánszemély';
      case 'OTHER': return 'Egyéb';
      default: return status;
    }
  };

  return (
    <Container>
      <Header>
        <div>
          <Title>{customer.name}</Title>
        </div>
        <HeaderActions>
          <Button to="/customers" variant="secondary">
            <ArrowLeft size={16} />
            Vissza
          </Button>
          <Button to={`/customers/${id}/edit`}>
            <Edit size={16} />
            Szerkesztés
          </Button>
        </HeaderActions>
      </Header>

      <DetailCard>
        <SectionTitle><Building size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />Alapadatok</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Cégnév</InfoLabel>
            <InfoValue>{customer.name}</InfoValue>
          </InfoItem>
          
          {customer.short_name && (
            <InfoItem>
              <InfoLabel>Rövid név</InfoLabel>
              <InfoValue>{customer.short_name}</InfoValue>
            </InfoItem>
          )}

          <InfoItem>
            <InfoLabel>Adószám</InfoLabel>
            <InfoValue>{customer.tax_number}</InfoValue>
          </InfoItem>

          {customer.tax_status && (
            <InfoItem>
              <InfoLabel>Adóalanyiság</InfoLabel>
              <InfoValue>
                <Badge type={customer.tax_status.toLowerCase()}>
                  {getTaxStatusLabel(customer.tax_status)}
                </Badge>
              </InfoValue>
            </InfoItem>
          )}

          {customer.eu_tax_number && (
            <InfoItem>
              <InfoLabel>EU adószám</InfoLabel>
              <InfoValue>{customer.eu_tax_number}</InfoValue>
            </InfoItem>
          )}

          {customer.vat_code && (
            <InfoItem>
              <InfoLabel>ÁFA kód</InfoLabel>
              <InfoValue>{customer.vat_code}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </DetailCard>

      <DetailCard>
        <SectionTitle><MapPin size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />Cím</SectionTitle>
        <InfoGrid>
          <InfoItem>
            <InfoLabel>Ország</InfoLabel>
            <InfoValue>{customer.country || 'Hungary'}</InfoValue>
          </InfoItem>

          <InfoItem>
            <InfoLabel>Irányítószám</InfoLabel>
            <InfoValue>{customer.postal_code}</InfoValue>
          </InfoItem>

          <InfoItem>
            <InfoLabel>Város</InfoLabel>
            <InfoValue>{customer.city}</InfoValue>
          </InfoItem>

          {customer.county_code && (
            <InfoItem>
              <InfoLabel>Megyekód</InfoLabel>
              <InfoValue>{customer.county_code}</InfoValue>
            </InfoItem>
          )}

          {customer.street_name && (
            <InfoItem>
              <InfoLabel>Utca név</InfoLabel>
              <InfoValue>{customer.street_name}</InfoValue>
            </InfoItem>
          )}

          {customer.public_place_category && (
            <InfoItem>
              <InfoLabel>Közterület jellege</InfoLabel>
              <InfoValue>{customer.public_place_category}</InfoValue>
            </InfoItem>
          )}

          {customer.street_number && (
            <InfoItem>
              <InfoLabel>Házszám</InfoLabel>
              <InfoValue>{customer.street_number}</InfoValue>
            </InfoItem>
          )}

          {customer.building && (
            <InfoItem>
              <InfoLabel>Épület</InfoLabel>
              <InfoValue>{customer.building}</InfoValue>
            </InfoItem>
          )}

          {customer.staircase && (
            <InfoItem>
              <InfoLabel>Lépcsőház</InfoLabel>
              <InfoValue>{customer.staircase}</InfoValue>
            </InfoItem>
          )}

          {customer.floor && (
            <InfoItem>
              <InfoLabel>Emelet</InfoLabel>
              <InfoValue>{customer.floor}</InfoValue>
            </InfoItem>
          )}

          {customer.door && (
            <InfoItem>
              <InfoLabel>Ajtó</InfoLabel>
              <InfoValue>{customer.door}</InfoValue>
            </InfoItem>
          )}

          {customer.address && (
            <InfoItem>
              <InfoLabel>Teljes cím</InfoLabel>
              <InfoValue>{customer.address}</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </DetailCard>

      <DetailCard>
        <SectionTitle><User size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />Kapcsolat</SectionTitle>
        <InfoGrid>
          {customer.email && (
            <InfoItem>
              <InfoLabel>Email</InfoLabel>
              <InfoValue>
                <Mail size={16} />
                <a href={`mailto:${customer.email}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                  {customer.email}
                </a>
              </InfoValue>
            </InfoItem>
          )}

          {customer.phone && (
            <InfoItem>
              <InfoLabel>Telefon</InfoLabel>
              <InfoValue>
                <Phone size={16} />
                <a href={`tel:${customer.phone}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                  {customer.phone}
                </a>
              </InfoValue>
            </InfoItem>
          )}

          {customer.payment_deadline && (
            <InfoItem>
              <InfoLabel>Fizetési határidő</InfoLabel>
              <InfoValue>{customer.payment_deadline} nap</InfoValue>
            </InfoItem>
          )}
        </InfoGrid>
      </DetailCard>

      {(customer.vat_group_id || customer.vat_group_member_tax_number) && (
        <DetailCard>
          <SectionTitle>ÁFA csoport</SectionTitle>
          <InfoGrid>
            {customer.vat_group_id && (
              <InfoItem>
                <InfoLabel>ÁFA csoport ID</InfoLabel>
                <InfoValue>{customer.vat_group_id}</InfoValue>
              </InfoItem>
            )}

            {customer.vat_group_member_tax_number && (
              <InfoItem>
                <InfoLabel>ÁFA csoport tag adószám</InfoLabel>
                <InfoValue>{customer.vat_group_member_tax_number}</InfoValue>
              </InfoItem>
            )}
          </InfoGrid>
        </DetailCard>
      )}
    </Container>
  );
};

export default CustomerDetail;
