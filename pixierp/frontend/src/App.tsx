import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ConfigProvider } from 'antd';
import huHU from 'antd/locale/hu_HU';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Login from './pages/Auth/Login';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import HRModule from './pages/HR/HRModule';
import SalesModule from './pages/Sales/SalesModule';
import ManufacturingModule from './pages/Manufacturing/ManufacturingModule';
import FinanceModule from './pages/Finance/FinanceModule';
import CRMModule from './pages/CRM/CRMModule';
import OrdersModule from './pages/Orders/OrdersModule';
import WarehouseModule from './pages/Warehouse/WarehouseModule';
import POSModule from './pages/POS/POSModule';
import SettingsModule from './pages/Settings/SettingsModule';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import './App.css';

const { Content } = Layout;

function AppContent() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onCollapse={setSidebarCollapsed}
      />
      <Layout style={{ 
        marginLeft: sidebarCollapsed ? 80 : 200,
        transition: 'margin-left 0.2s'
      }}>
        <Header />
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/hr/*" element={<HRModule />} />
            <Route path="/sales/*" element={<SalesModule />} />
            <Route path="/manufacturing/*" element={<ManufacturingModule />} />
            <Route path="/finance/*" element={<FinanceModule />} />
            <Route path="/crm/*" element={<CRMModule />} />
            <Route path="/orders/*" element={<OrdersModule />} />
            <Route path="/warehouse/*" element={<WarehouseModule />} />
            <Route path="/pos/*" element={<POSModule />} />
            <Route path="/settings/*" element={<SettingsModule />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <ConfigProvider locale={huHU}>
      <SettingsProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </SettingsProvider>
    </ConfigProvider>
  );
}

export default App;