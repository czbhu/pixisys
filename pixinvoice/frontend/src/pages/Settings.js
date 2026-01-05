import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Building2, 
  Users, 
  FileText, 
  Settings as SettingsIcon,
  ChevronRight 
} from 'lucide-react';
import styled from 'styled-components';

const SettingsContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 24px 0;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const SettingsCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;

  &:hover {
    background: #e9ecef;
    border-color: #3498db;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
`;

const CardIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: #3498db;
  color: white;
  border-radius: 8px;
  font-size: 20px;
`;

const CardContent = styled.div`
  flex: 1;
`;

const CardTitle = styled.h3`
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
`;

const CardDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: #7f8c8d;
  line-height: 1.4;
`;

const CardArrow = styled.div`
  color: #bdc3c7;
  font-size: 16px;
`;

const Settings = () => {
  const location = useLocation();

  const settingsItems = [
    {
      path: '/settings/companies',
      icon: Building2,
      title: 'Cégek',
      description: 'Cégek kezelése, új cég hozzáadása a meglévő ügyfelek közül'
    },
    {
      path: '/settings/users',
      icon: Users,
      title: 'Felhasználók',
      description: 'Rendszer felhasználók kezelése, jelszavak beállítása'
    },
    {
      path: '/settings/invoice-blocks',
      icon: FileText,
      title: 'Számlatömbök',
      description: 'Számlatömbök kezelése, előtagok és sorszámozás beállítása'
    },
    {
      path: '/settings/nav-configurations',
      icon: SettingsIcon,
      title: 'NAV Konfigurációk',
      description: 'Cég-specifikus NAV konfigurációk kezelése'
    },
    {
      path: '/settings/api-access',
      icon: SettingsIcon,
      title: 'API hozzáférés',
      description: 'API engedélyek céges és számlatömb szinten'
    },
    {
      path: '/settings/vat-types',
      icon: FileText,
      title: 'ÁFA típusok',
      description: 'ÁFA kulcsok és NAV kódok kezelése'
    }
    ,
    {
      path: '/settings/email',
      icon: SettingsIcon,
      title: 'E-mail beállítások',
      description: 'SMTP/IMAP beállítások és e-mail sablonok cég szerint'
    },
    {
      path: '/settings/backup',
      icon: SettingsIcon,
      title: 'Backup / Visszaállítás',
      description: 'Adatok exportálása és importálása cégenként, választható adatkörökkel'
    }
  ];

  return (
    <SettingsContainer>
      <Title>
        <SettingsIcon size={24} />
        Beállítások
      </Title>
      
      <SettingsGrid>
        {settingsItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <SettingsCard
              key={item.path}
              to={item.path}
              style={{
                background: isActive ? '#e3f2fd' : '#f8f9fa',
                borderColor: isActive ? '#3498db' : '#e9ecef'
              }}
            >
              <CardIcon>
                <IconComponent size={20} />
              </CardIcon>
              <CardContent>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardContent>
              <CardArrow>
                <ChevronRight size={16} />
              </CardArrow>
            </SettingsCard>
          );
        })}
      </SettingsGrid>
    </SettingsContainer>
  );
};

export default Settings;
