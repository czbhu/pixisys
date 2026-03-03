import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SSOLogin from './pages/SSOLogin';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import CustomerForm from './pages/CustomerForm';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import ContactForm from './pages/ContactForm';
import Settings from './pages/Settings';
import EmailSettings from './pages/EmailSettings';
import EmailTemplates from './pages/EmailTemplates';
import EmailSignatures from './pages/EmailSignatures';
import VATTypes from './pages/VATTypes';
import Companies from './pages/Companies';
import CompanyForm from './pages/CompanyForm';
import SystemUsers from './pages/SystemUsers';
import SystemUserForm from './pages/SystemUserForm';
import Roles from './pages/Roles';
import RoleForm from './pages/RoleForm';
import InvoiceBlocks from './pages/InvoiceBlocks';
import InvoiceBlockForm from './pages/InvoiceBlockForm';
import CompanyNAVConfigurations from './pages/CompanyNAVConfigurations';
import CompanyNAVConfigurationForm from './pages/CompanyNAVConfigurationForm';
import NAVConfig from './pages/NAVConfig';
import Reports from './pages/Reports';
import BankStatements from './pages/BankStatements';
import BankStatementForm from './pages/BankStatementForm';
import UploadedBankStatements from './pages/UploadedBankStatements';
import CashRegisters from './pages/CashRegisters';
import Arrears from './pages/Arrears';
import ScheduledInvoices from './pages/ScheduledInvoices';
import Proformas from './pages/Proformas';
import IncomingInvoices from './pages/IncomingInvoices';
import IncomingInvoiceOpen from './pages/IncomingInvoiceOpen';
import BackupRestore from './pages/Settings/BackupRestore';
import NavAuditExport from './pages/Settings/NavAuditExport';
import Currencies from './pages/Settings/Currencies';
import CronJobs from './pages/Settings/CronJobs';
import ApiAccess from './pages/ApiAccess';
import DataImport from './pages/DataImport';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Betöltés...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function AppContent() {
  const { user, allowedMenus } = useAuth();
  const canAccess = (key) => !allowedMenus || allowedMenus.length === 0 || allowedMenus.includes(key);
  const guard = (key, element) => (canAccess(key) ? element : <Navigate to="/" replace />);

  return (
    <div className="App">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
        <Route path="/sso-login" element={<SSOLogin />} />
        
        {/* Protected routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={guard('dashboard', <Dashboard />)} />
                <Route path="/invoices" element={guard('invoices', <Invoices />)} />
                <Route path="/scheduled-invoices" element={guard('scheduled_invoices', <ScheduledInvoices />)} />
                <Route path="/incoming-invoices" element={guard('incoming_invoices', <IncomingInvoices key="internal" />)} />
                <Route path="/incoming-invoices-external" element={guard('incoming_invoices', <IncomingInvoices key="external" externalOutgoing />)} />
                <Route path="/incoming-invoices/open" element={guard('incoming_invoices', <IncomingInvoiceOpen />)} />
                <Route path="/incoming-invoices/new" element={guard('incoming_invoices', <InvoiceForm />)} />
                <Route path="/invoices/new" element={guard('invoices', <InvoiceForm />)} />
                <Route path="/invoices/:id/edit" element={guard('invoices', <InvoiceForm />)} />
                <Route path="/bank-statements" element={guard('bank_statements', <BankStatements />)} />
                <Route path="/bank-statements/import" element={guard('bank_statements', <BankStatements />)} />
                <Route path="/bank-statements/import/preview" element={guard('bank_statements', <BankStatements />)} />
                <Route path="/bank-statements/uploaded" element={guard('bank_statements', <UploadedBankStatements />)} />
                <Route path="/cash-registers" element={guard('bank_statements', <CashRegisters />)} />
                <Route path="/arrears" element={guard('arrears', <Arrears />)} />
                <Route path="/bank-statements/new" element={guard('bank_statements', <BankStatementForm />)} />
                <Route path="/bank-statements/:id/edit" element={guard('bank_statements', <BankStatementForm />)} />
                <Route path="/proformas" element={guard('proformas', <Proformas />)} />
                <Route path="/proformas/new" element={guard('proformas', <InvoiceForm />)} />
                <Route path="/proformas/:id/edit" element={guard('proformas', <InvoiceForm />)} />
                <Route path="/customers" element={guard('customers', <Customers />)} />
                <Route path="/customers/new" element={guard('customers', <CustomerForm />)} />
                <Route path="/customers/:id" element={guard('customers', <CustomerDetail />)} />
                <Route path="/customers/:id/edit" element={guard('customers', <CustomerForm />)} />
                <Route path="/contacts" element={guard('contacts', <Contacts />)} />
                <Route path="/contacts/new" element={guard('contacts', <ContactForm />)} />
                <Route path="/contacts/:id" element={guard('contacts', <ContactDetail />)} />
                <Route path="/contacts/:id/edit" element={guard('contacts', <ContactForm />)} />
                <Route path="/settings" element={guard('settings', <Settings />)} />
                <Route path="/settings/currencies" element={guard('settings', <Currencies />)} />
                <Route path="/settings/cron-jobs" element={guard('settings', <CronJobs />)} />
                <Route path="/settings/vat-types" element={guard('settings_vat_types', <VATTypes />)} />
                <Route path="/settings/email" element={guard('settings_email', <EmailSettings />)} />
                <Route path="/settings/email-templates" element={guard('settings_email', <EmailTemplates />)} />
                <Route path="/settings/email-signatures" element={guard('settings_email', <EmailSignatures />)} />
                <Route path="/settings/companies" element={guard('settings_companies', <Companies />)} />
                <Route path="/settings/companies/new" element={guard('settings_companies', <CompanyForm />)} />
                <Route path="/settings/companies/:id" element={guard('settings_companies', <CompanyForm />)} />
                <Route path="/settings/companies/:id/edit" element={guard('settings_companies', <CompanyForm />)} />
                <Route path="/settings/users" element={guard('settings_users', <SystemUsers />)} />
                <Route path="/settings/users/new" element={guard('settings_users', <SystemUserForm />)} />
                <Route path="/settings/users/:id/edit" element={guard('settings_users', <SystemUserForm />)} />
                <Route path="/settings/roles" element={guard('settings_roles', <Roles />)} />
                <Route path="/settings/roles/new" element={guard('settings_roles', <RoleForm />)} />
                <Route path="/settings/roles/:id/edit" element={guard('settings_roles', <RoleForm />)} />
                <Route path="/settings/invoice-blocks" element={guard('settings_invoice_blocks', <InvoiceBlocks />)} />
                <Route path="/settings/invoice-blocks/new" element={guard('settings_invoice_blocks', <InvoiceBlockForm />)} />
                <Route path="/settings/invoice-blocks/:id/edit" element={guard('settings_invoice_blocks', <InvoiceBlockForm />)} />
                <Route path="/settings/nav-configurations" element={guard('settings_nav_configurations', <CompanyNAVConfigurations />)} />
                <Route path="/settings/nav-configurations/new" element={guard('settings_nav_configurations', <CompanyNAVConfigurationForm />)} />
                <Route path="/settings/nav-configurations/:id/edit" element={guard('settings_nav_configurations', <CompanyNAVConfigurationForm />)} />
                <Route path="/nav-config" element={guard('settings_nav_configurations', <NAVConfig />)} />
                <Route path="/settings/backup" element={guard('settings_backup', <BackupRestore />)} />
                <Route path="/settings/nav-audit" element={guard('invoices', <NavAuditExport />)} />
                <Route path="/settings/api-access" element={guard('settings_api_access', <ApiAccess />)} />
                <Route path="/settings/data-import" element={guard('settings_data_import', <DataImport />)} />
                <Route path="/reports" element={guard('reports', <Reports />)} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
      <ToastContainer
        position="top-right"
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
