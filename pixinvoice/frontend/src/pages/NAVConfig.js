import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { 
  Plus, 
  Edit, 
  Trash2, 
  TestTube,
  CheckCircle,
  XCircle,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import styled from 'styled-components';
import { navConfigAPI } from '../services/api';

const ConfigContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const ConfigHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid #ecf0f1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2980b9;
  }
`;

const ConfigList = styled.div`
  padding: 24px;
`;

const ConfigCard = styled.div`
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid #ecf0f1;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
`;

const ConfigHeaderCard = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ConfigName = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const ConfigStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background-color: ${props => {
    switch (props.status) {
      case 'active': return '#27ae60';
      case 'inactive': return '#95a5a6';
      case 'test': return '#f39c12';
      case 'production': return '#3498db';
      default: return '#95a5a6';
    }
  }};
  color: white;
`;

const ConfigInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: #7f8c8d;
  font-weight: 500;
`;

const InfoValue = styled.span`
  font-size: 14px;
  color: #2c3e50;
  word-break: break-all;
`;

const PasswordField = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PasswordInput = styled.input`
  border: none;
  background: none;
  font-size: 14px;
  color: #2c3e50;
  flex: 1;
  font-family: monospace;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
      case 'test': return '#f39c12';
      case 'activate': return '#27ae60';
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

const TestResult = styled.div`
  margin-top: 12px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: ${props => props.success ? '#d4edda' : '#f8d7da'};
  color: ${props => props.success ? '#155724' : '#721c24'};
  border: 1px solid ${props => props.success ? '#c3e6cb' : '#f5c6cb'};
`;

const NAVConfig = () => {
  const [showPasswords, setShowPasswords] = useState({});
  const [testResults, setTestResults] = useState({});
  
  const queryClient = useQueryClient();

  const { data: configurations, isLoading, error } = useQuery(
    'nav-configurations',
    navConfigAPI.getConfigurations
  );

  const deleteConfigMutation = useMutation(
    (id) => navConfigAPI.deleteConfiguration(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('nav-configurations');
        toast.success('NAV konfiguráció törölve');
      },
      onError: () => {
        toast.error('Hiba történt a konfiguráció törlése során');
      },
    }
  );

  const testConnectionMutation = useMutation(
    (id) => navConfigAPI.testConnection(id),
    {
      onSuccess: (data, id) => {
        setTestResults(prev => ({
          ...prev,
          [id]: { success: true, message: 'Kapcsolat sikeres' }
        }));
        toast.success('Kapcsolat teszt sikeres');
      },
      onError: (error, id) => {
        setTestResults(prev => ({
          ...prev,
          [id]: { 
            success: false, 
            message: error.response?.data?.error || 'Kapcsolat teszt sikertelen' 
          }
        }));
        toast.error('Kapcsolat teszt sikertelen');
      },
    }
  );

  const setActiveMutation = useMutation(
    (id) => navConfigAPI.setActive(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('nav-configurations');
        toast.success('Konfiguráció aktiválva');
      },
      onError: () => {
        toast.error('Hiba történt az aktiválás során');
      },
    }
  );

  const handleDelete = (id, name) => {
    if (window.confirm(`Biztosan törölni szeretné a konfigurációt: ${name}?`)) {
      deleteConfigMutation.mutate(id);
    }
  };

  const handleTestConnection = (id) => {
    testConnectionMutation.mutate(id);
  };

  const handleSetActive = (id) => {
    setActiveMutation.mutate(id);
  };

  const togglePasswordVisibility = (id) => {
    setShowPasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
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
    <ConfigContainer>
      <ConfigHeader>
        <Title>NAV Konfigurációk</Title>
        <ActionButton onClick={() => {/* TODO: Open create modal */}}>
          <Plus size={16} />
          Új konfiguráció
        </ActionButton>
      </ConfigHeader>

      <ConfigList>
        {configurations?.results?.map((config) => (
          <ConfigCard key={config.id}>
            <ConfigHeaderCard>
              <div>
                <ConfigName>{config.name}</ConfigName>
                <ConfigStatus>
                  <StatusBadge status={config.is_active ? 'active' : 'inactive'}>
                    {config.is_active ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                  <StatusBadge status={config.is_test_environment ? 'test' : 'production'}>
                    {config.is_test_environment ? 'Teszt' : 'Éles'}
                  </StatusBadge>
                </ConfigStatus>
              </div>
              <ActionButtons>
                <IconButton
                  variant="test"
                  title="Kapcsolat teszt"
                  onClick={() => handleTestConnection(config.id)}
                >
                  <TestTube size={16} />
                </IconButton>
                <IconButton
                  variant="edit"
                  title="Szerkesztés"
                >
                  <Edit size={16} />
                </IconButton>
                {!config.is_active && (
                  <IconButton
                    variant="activate"
                    title="Aktiválás"
                    onClick={() => handleSetActive(config.id)}
                  >
                    <CheckCircle size={16} />
                  </IconButton>
                )}
                <IconButton
                  variant="delete"
                  title="Törlés"
                  onClick={() => handleDelete(config.id, config.name)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </ActionButtons>
            </ConfigHeaderCard>

            <ConfigInfo>
              <InfoItem>
                <InfoLabel>API URL</InfoLabel>
                <InfoValue>{config.api_url}</InfoValue>
              </InfoItem>
              
              <InfoItem>
                <InfoLabel>Bejelentkezés</InfoLabel>
                <InfoValue>{config.login}</InfoValue>
              </InfoItem>
              
              <InfoItem>
                <InfoLabel>Adószám</InfoLabel>
                <InfoValue>{config.tax_number}</InfoValue>
              </InfoItem>
              
              <InfoItem>
                <InfoLabel>Szoftver</InfoLabel>
                <InfoValue>{config.software_name}</InfoValue>
              </InfoItem>
              
              <InfoItem>
                <InfoLabel>Jelszó</InfoLabel>
                <PasswordField>
                  <PasswordInput
                    type={showPasswords[config.id] ? 'text' : 'password'}
                    value="••••••••"
                    readOnly
                  />
                  <IconButton
                    variant="view"
                    onClick={() => togglePasswordVisibility(config.id)}
                    title={showPasswords[config.id] ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
                  >
                    {showPasswords[config.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </IconButton>
                </PasswordField>
              </InfoItem>
            </ConfigInfo>

            {testResults[config.id] && (
              <TestResult success={testResults[config.id].success}>
                {testResults[config.id].success ? (
                  <CheckCircle size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                {testResults[config.id].message}
              </TestResult>
            )}
          </ConfigCard>
        ))}
      </ConfigList>

      {(!configurations?.results || configurations.results.length === 0) && (
        <EmptyState>
          <Settings size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>Nincsenek NAV konfigurációk</p>
          <ActionButton onClick={() => {/* TODO: Open create modal */}} style={{ marginTop: '16px' }}>
            <Plus size={16} />
            Új konfiguráció létrehozása
          </ActionButton>
        </EmptyState>
      )}
    </ConfigContainer>
  );
};

export default NAVConfig;



