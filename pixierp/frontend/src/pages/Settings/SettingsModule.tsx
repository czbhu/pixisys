import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AccessControlSettingsPage from './pages/AccessControlSettingsPage';
import EmailServerPage from './pages/EmailServerPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import SignaturesPage from './pages/SignaturesPage';
import IntegrationsPage from './pages/IntegrationsPage';
import PixinvoiceSettingsPage from './pages/PixinvoiceSettingsPage';
import CompanySettings from './CompanySettings';
import Backup from './Backup';

const SettingsModule: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/settings/email-server" replace />} />
      <Route path="/access-control" element={<AccessControlSettingsPage />} />
      <Route path="/companies" element={<CompanySettings />} />
      <Route path="/email-server" element={<EmailServerPage />} />
      <Route path="/email-templates" element={<EmailTemplatesPage />} />
      <Route path="/signatures" element={<SignaturesPage />} />
      <Route path="/integrations" element={<IntegrationsPage />} />
      <Route path="/pixinvoice" element={<PixinvoiceSettingsPage />} />
      <Route path="/backup" element={<Backup />} />
    </Routes>
  );
};

export default SettingsModule;
