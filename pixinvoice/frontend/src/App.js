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
import CustomerForm from './pages/CustomerForm';
import Contacts from './pages/Contacts';
import ContactForm from './pages/ContactForm';
import Settings from './pages/Settings';
import EmailSettings from './pages/EmailSettings';
import VATTypes from './pages/VATTypes';
import Companies from './pages/Companies';
import CompanyForm from './pages/CompanyForm';
import SystemUsers from './pages/SystemUsers';
import SystemUserForm from './pages/SystemUserForm';
import InvoiceBlocks from './pages/InvoiceBlocks';
import InvoiceBlockForm from './pages/InvoiceBlockForm';
import CompanyNAVConfigurations from './pages/CompanyNAVConfigurations';
import CompanyNAVConfigurationForm from './pages/CompanyNAVConfigurationForm';
import NAVConfig from './pages/NAVConfig';
import Reports from './pages/Reports';
import BankStatements from './pages/BankStatements';
import BankStatementForm from './pages/BankStatementForm';
import Proformas from './pages/Proformas';
import IncomingInvoices from './pages/IncomingInvoices';
import BackupRestore from './pages/Settings/BackupRestore';
import ApiAccess from './pages/ApiAccess';

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
  const { user } = useAuth();

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
                <Route path="/" element={<Dashboard />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/incoming-invoices" element={<IncomingInvoices />} />
                <Route path="/invoices/new" element={<InvoiceForm />} />
                <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
                <Route path="/bank-statements" element={<BankStatements />} />
                <Route path="/bank-statements/new" element={<BankStatementForm />} />
                <Route path="/bank-statements/:id/edit" element={<BankStatementForm />} />
                <Route path="/proformas" element={<Proformas />} />
                <Route path="/proformas/new" element={<InvoiceForm />} />
                <Route path="/proformas/:id/edit" element={<InvoiceForm />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/new" element={<CustomerForm />} />
                <Route path="/customers/:id/edit" element={<CustomerForm />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/contacts/new" element={<ContactForm />} />
                <Route path="/contacts/:id/edit" element={<ContactForm />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/vat-types" element={<VATTypes />} />
                <Route path="/settings/email" element={<EmailSettings />} />
                <Route path="/settings/companies" element={<Companies />} />
                <Route path="/settings/companies/new" element={<CompanyForm />} />
                <Route path="/settings/companies/:id/edit" element={<CompanyForm />} />
                <Route path="/settings/users" element={<SystemUsers />} />
                <Route path="/settings/users/new" element={<SystemUserForm />} />
                <Route path="/settings/users/:id/edit" element={<SystemUserForm />} />
                <Route path="/settings/invoice-blocks" element={<InvoiceBlocks />} />
                <Route path="/settings/invoice-blocks/new" element={<InvoiceBlockForm />} />
                <Route path="/settings/invoice-blocks/:id/edit" element={<InvoiceBlockForm />} />
                <Route path="/settings/nav-configurations" element={<CompanyNAVConfigurations />} />
                <Route path="/settings/nav-configurations/new" element={<CompanyNAVConfigurationForm />} />
                <Route path="/settings/nav-configurations/:id/edit" element={<CompanyNAVConfigurationForm />} />
                <Route path="/nav-config" element={<NAVConfig />} />
                <Route path="/settings/backup" element={<BackupRestore />} />
                <Route path="/settings/api-access" element={<ApiAccess />} />
                <Route path="/reports" element={<Reports />} />
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
