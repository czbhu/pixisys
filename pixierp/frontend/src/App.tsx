import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ConfigProvider, Drawer } from 'antd';
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
import PublicQuoteOrder from './pages/Public/PublicQuoteOrder';
import PublicDelivery from './pages/Public/PublicDelivery';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { manufacturingService } from './services/manufacturingService';
import './App.css';

const { Content } = Layout;

function AppContent() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuVisible(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Automatikus napi árfolyam frissítés
  useEffect(() => {
    if (!user) return;

    const updateExchangeRates = async () => {
      const lastUpdate = localStorage.getItem('lastExchangeRateUpdate');
      const today = new Date().toDateString();

      if (lastUpdate !== today) {
        try {
          console.log('Automatikus árfolyam frissítés...');
          await manufacturingService.updateExchangeRates();
          localStorage.setItem('lastExchangeRateUpdate', today);
          console.log('Árfolyamok frissítve');
        } catch (error) {
          console.error('Árfolyam frissítés sikertelen:', error);
        }
      }
    };

    updateExchangeRates();
  }, [user]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
        <Route path="/public/quote/:token/order" element={<PublicQuoteOrder />} />
        <Route path="/public/delivery/:token" element={<PublicDelivery />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          bodyStyle={{ padding: 0 }}
          width={250}
        >
          <Sidebar 
            collapsed={false}
            onCollapse={() => {}}
          />
        </Drawer>
      ) : (
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onCollapse={setSidebarCollapsed}
        />
      )}
      <Layout style={{ 
        marginLeft: isMobile ? 0 : (sidebarCollapsed ? 80 : 200),
        transition: 'margin-left 0.2s'
      }}>
        <Header 
          onMenuClick={() => setMobileMenuVisible(true)}
          isMobile={isMobile}
        />
        <Content style={{ 
          margin: isMobile ? '16px 8px' : '24px 16px', 
          padding: isMobile ? 12 : 24, 
          background: '#fff',
          minHeight: 280
        }}>
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/public/quote/:token/order" element={<PublicQuoteOrder />} />
            <Route path="/public/delivery/:token" element={<PublicDelivery />} />
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