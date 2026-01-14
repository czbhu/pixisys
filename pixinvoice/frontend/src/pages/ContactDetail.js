import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowLeft, Edit, Mail, Phone, Building2, MapPin, User, Briefcase } from 'lucide-react';
import styled from 'styled-components';
import { contactAPI } from '../services/api';

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const BackButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6c757d;
  text-decoration: none;
  font-size: 14px;
  
  &:hover {
    color: #495057;
  }
`;

const EditButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background-color: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }
`;

const Card = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin-bottom: 24px;
`;

const CardHeader = styled.div`
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
`;

const ContactName = styled.h1`
  font-size: 32px;
  font-weight: 600;
  margin: 0 0 8px 0;
`;

const CustomerName = styled.p`
  font-size: 16px;
  opacity: 0.9;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CardBody = styled.div`
  padding: 24px;
`;

const Section = styled.div`
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #ecf0f1;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: start;
  gap: 12px;
`;

const InfoIcon = styled.div`
  color: #3498db;
  margin-top: 2px;
`;

const InfoContent = styled.div`
  flex: 1;
`;

const InfoLabel = styled.div`
  font-size: 12px;
  color: #7f8c8d;
  margin-bottom: 4px;
  text-transform: uppercase;
  font-weight: 500;
`;

const InfoValue = styled.div`
  font-size: 15px;
  color: #2c3e50;
  font-weight: 500;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  background-color: ${props => {
    if (props.variant === 'success') return '#27ae60';
    if (props.variant === 'danger') return '#e74c3c';
    if (props.variant === 'primary') return '#3498db';
    return '#95a5a6';
  }};
  color: white;
  border-radius: 12px;
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

const ContactDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: contact, isLoading, error } = useQuery(
    ['contact', id],
    () => contactAPI.getContact(id),
    {
      select: (response) => response.data
    }
  );

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
        <LoadingSpinner>Kapcsolattartó betöltése...</LoadingSpinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <div>Hiba történt a kapcsolattartó betöltése során: {error.message}</div>
      </Container>
    );
  }

  if (!contact) {
    return (
      <Container>
        <div>Kapcsolattartó nem található</div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton to="/contacts">
          <ArrowLeft size={16} />
          Vissza a kapcsolattartókhoz
        </BackButton>
        <EditButton to={`/contacts/${id}/edit`}>
          <Edit size={16} />
          Szerkesztés
        </EditButton>
      </Header>

      <Card>
        <CardHeader>
          <ContactName>{contact.full_name}</ContactName>
          <CustomerName>
            <Building2 size={16} />
            {contact.customer_name}
          </CustomerName>
        </CardHeader>

        <CardBody>
          <Section>
            <SectionTitle>Alapadatok</SectionTitle>
            <InfoGrid>
              <InfoItem>
                <InfoIcon><User size={18} /></InfoIcon>
                <InfoContent>
                  <InfoLabel>Vezetéknév</InfoLabel>
                  <InfoValue>{contact.last_name}</InfoValue>
                </InfoContent>
              </InfoItem>

              <InfoItem>
                <InfoIcon><User size={18} /></InfoIcon>
                <InfoContent>
                  <InfoLabel>Keresztnév</InfoLabel>
                  <InfoValue>{contact.first_name || '-'}</InfoValue>
                </InfoContent>
              </InfoItem>

              {contact.position && (
                <InfoItem>
                  <InfoIcon><Briefcase size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>Pozíció</InfoLabel>
                    <InfoValue>{contact.position}</InfoValue>
                  </InfoContent>
                </InfoItem>
              )}

              {contact.department && (
                <InfoItem>
                  <InfoIcon><Building2 size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>Osztály</InfoLabel>
                    <InfoValue>{contact.department}</InfoValue>
                  </InfoContent>
                </InfoItem>
              )}

              <InfoItem>
                <InfoContent>
                  <InfoLabel>Típus</InfoLabel>
                  <InfoValue>
                    <Badge variant="primary">
                      {getContactTypeLabel(contact.contact_type)}
                    </Badge>
                  </InfoValue>
                </InfoContent>
              </InfoItem>

              <InfoItem>
                <InfoContent>
                  <InfoLabel>Státusz</InfoLabel>
                  <InfoValue>
                    <Badge variant={contact.is_active ? 'success' : 'danger'}>
                      {contact.is_active ? 'Aktív' : 'Inaktív'}
                    </Badge>
                  </InfoValue>
                </InfoContent>
              </InfoItem>

              <InfoItem>
                <InfoContent>
                  <InfoLabel>Elsődleges kapcsolattartó</InfoLabel>
                  <InfoValue>
                    <Badge variant={contact.is_primary ? 'success' : 'default'}>
                      {contact.is_primary ? 'Igen' : 'Nem'}
                    </Badge>
                  </InfoValue>
                </InfoContent>
              </InfoItem>
            </InfoGrid>
          </Section>

          <Section>
            <SectionTitle>Elérhetőségek</SectionTitle>
            <InfoGrid>
              {contact.email && (
                <InfoItem>
                  <InfoIcon><Mail size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>E-mail</InfoLabel>
                    <InfoValue>
                      <a href={`mailto:${contact.email}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                        {contact.email}
                      </a>
                    </InfoValue>
                  </InfoContent>
                </InfoItem>
              )}

              {contact.phone && (
                <InfoItem>
                  <InfoIcon><Phone size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>Telefon</InfoLabel>
                    <InfoValue>
                      <a href={`tel:${contact.phone}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                        {contact.phone}
                      </a>
                    </InfoValue>
                  </InfoContent>
                </InfoItem>
              )}

              {contact.mobile && (
                <InfoItem>
                  <InfoIcon><Phone size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>Mobil</InfoLabel>
                    <InfoValue>
                      <a href={`tel:${contact.mobile}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                        {contact.mobile}
                      </a>
                    </InfoValue>
                  </InfoContent>
                </InfoItem>
              )}

              {contact.fax && (
                <InfoItem>
                  <InfoIcon><Phone size={18} /></InfoIcon>
                  <InfoContent>
                    <InfoLabel>Fax</InfoLabel>
                    <InfoValue>{contact.fax}</InfoValue>
                  </InfoContent>
                </InfoItem>
              )}
            </InfoGrid>
          </Section>

          {contact.notes && (
            <Section>
              <SectionTitle>Megjegyzések</SectionTitle>
              <InfoValue style={{ whiteSpace: 'pre-wrap' }}>{contact.notes}</InfoValue>
            </Section>
          )}
        </CardBody>
      </Card>
    </Container>
  );
};

export default ContactDetail;
