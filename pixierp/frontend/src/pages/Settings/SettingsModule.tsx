import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    LockOutlined,
    TabletOutlined,
    GlobalOutlined,
    DollarCircleOutlined,
    SafetyCertificateOutlined,
    MailOutlined,
    FileTextOutlined,
    EditOutlined,
    ApiOutlined,
    CloudServerOutlined,
    HddOutlined,
    EnvironmentOutlined
} from '@ant-design/icons';
import AccessControlSettingsPage from './pages/AccessControlSettingsPage';
import EmailServerPage from './pages/EmailServerPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SignaturesPage from './pages/SignaturesPage';
import IntegrationsPage from './pages/IntegrationsPage';
import PixinvoiceSettingsPage from './pages/PixinvoiceSettingsPage';
import AttendanceKioskSettingsPage from './pages/AttendanceKioskSettingsPage';
import CurrenciesPage from './pages/CurrenciesPage';
import RolesPage from './pages/RolesPage';
import CompanySettings from './CompanySettings';
import Backup from './Backup';
import Zones from './Zones';
import ModuleDashboard from '../../components/ModuleDashboard';

const SettingsModule: React.FC = () => {
  const dashboardItems = [
      { key: '/settings/access-control', label: 'Beléptető rendszer', icon: <LockOutlined /> },
      { key: '/settings/attendance-kiosk', label: 'Jelenlét Kioszk', icon: <TabletOutlined /> },
      { key: '/settings/companies', label: 'Alap adatok', icon: <GlobalOutlined /> },
      { key: '/settings/currencies', label: 'Pénznemek', icon: <DollarCircleOutlined /> },
      { key: '/settings/roles', label: 'Jogosultságok', icon: <SafetyCertificateOutlined /> },
      { key: '/settings/email-server', label: 'E-mail szerver', icon: <MailOutlined /> },
      { key: '/settings/email-templates', label: 'E-mail sablonok', icon: <FileTextOutlined /> },
      { key: '/settings/signatures', label: 'Aláírások', icon: <EditOutlined /> },
      { key: '/settings/zones', label: 'Zónák', icon: <EnvironmentOutlined /> },
      { key: '/settings/integrations', label: 'Integrációk', icon: <ApiOutlined /> },
      { key: '/settings/pixinvoice', label: 'PIXINVOICE', icon: <CloudServerOutlined /> },
      { key: '/settings/backup', label: 'Backup', icon: <HddOutlined /> },
  ];

  return (
    <Routes>
      <Route path="/" element={<ModuleDashboard title="Beállítások" items={dashboardItems} />} />
      <Route path="/access-control" element={<AccessControlSettingsPage />} />
      <Route path="/companies" element={<CompanySettings />} />
      <Route path="/currencies" element={<CurrenciesPage />} />
      <Route path="/roles" element={<RolesPage />} />
      <Route path="/email-server" element={<EmailServerPage />} />
      <Route path="/email-templates" element={<EmailTemplatesPage />} />
      <Route path="/signatures" element={<SignaturesPage />} />
      <Route path="/zones" element={<Zones />} />
      <Route path="/integrations" element={<IntegrationsPage />} />
      <Route path="/pixinvoice" element={<PixinvoiceSettingsPage />} />
      <Route path="/attendance-kiosk" element={<AttendanceKioskSettingsPage />} />
      <Route path="/backup" element={<Backup />} />
    </Routes>
  );
};


export default SettingsModule;
